import { describe, expect, it, vi } from "vitest";
import {
  MAX_PREREQUISITE_BYTES,
  MissingPrerequisitesError,
  PREREQUISITE_KINDS,
  PREREQUISITE_TEXT_CAP,
  PrerequisiteRejectedError,
  assertPrerequisitesComplete,
  commitPrerequisite,
  extensionFor,
  missingPrerequisites,
  rejectionFor,
  presignPrerequisiteUpload,
} from "../lib/interview/prerequisites";
import { keyForInterviewPrerequisite } from "../lib/s3";

// U3 — the three artifacts a student must supply personally before the
// interview can start. Prisma and the reservation/S3 layers are DI mocks, so
// these run with no database and no object store.

function fakePrisma(kinds: string[]) {
  return {
    interviewPrerequisite: {
      findMany: vi.fn(async () =>
        kinds.map((kind) => ({
          kind,
          s3Key: `k-${kind}`,
          contentType: "application/pdf",
          sizeBytes: 10,
          extractedText: null,
          createdAt: new Date("2026-09-01T00:00:00.000Z"),
        })),
      ),
    },
  } as never;
}

describe("prerequisite gate", () => {
  it("names the missing artifact when one is absent", async () => {
    // Covers AE1: resume and blueprint uploaded, sector map still owed.
    const deps = { prisma: fakePrisma(["resume", "blueprint"]) };
    await expect(assertPrerequisitesComplete("u1", deps)).rejects.toBeInstanceOf(
      MissingPrerequisitesError,
    );
    await expect(assertPrerequisitesComplete("u1", deps)).rejects.toThrow(/sector map/i);
  });

  it("reports every missing kind, in canonical order", async () => {
    const missing = await missingPrerequisites("u1", { prisma: fakePrisma([]) });
    expect(missing).toEqual([...PREREQUISITE_KINDS]);
  });

  it("passes once all three are present", async () => {
    const deps = { prisma: fakePrisma(["resume", "blueprint", "sector_map"]) };
    await expect(assertPrerequisitesComplete("u1", deps)).resolves.toBeUndefined();
  });

  it("carries the missing kinds on the error for the client to render", async () => {
    const deps = { prisma: fakePrisma(["resume"]) };
    const err = await assertPrerequisitesComplete("u1", deps).catch((e) => e);
    expect(err).toBeInstanceOf(MissingPrerequisitesError);
    expect(err.missing).toEqual(["blueprint", "sector_map"]);
    expect(err.status).toBe(409);
  });
});

describe("upload validation", () => {
  it("refuses a Word resume and names PDF as the fix", () => {
    const message = rejectionFor(
      "resume",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      1000,
    );
    expect(message).toMatch(/PDF/);
  });

  it("accepts a PDF resume, a JSON blueprint, and a PDF sector map", () => {
    expect(rejectionFor("resume", "application/pdf", 1000)).toBeNull();
    expect(rejectionFor("blueprint", "application/json", 1000)).toBeNull();
    expect(rejectionFor("sector_map", "application/pdf", 1000)).toBeNull();
  });

  it("refuses a JSON resume and a PDF blueprint", () => {
    expect(rejectionFor("resume", "application/json", 1000)).toMatch(/not accepted/i);
    expect(rejectionFor("blueprint", "application/pdf", 1000)).toMatch(/not accepted/i);
  });

  it("refuses an empty file and one over the size ceiling", () => {
    expect(rejectionFor("resume", "application/pdf", 0)).toMatch(/empty/i);
    expect(rejectionFor("resume", "application/pdf", MAX_PREREQUISITE_BYTES + 1)).toMatch(
      /larger than/i,
    );
  });

  it("tolerates a charset parameter on the content type", () => {
    expect(extensionFor("blueprint", "application/json; charset=utf-8")).toBe("json");
    expect(rejectionFor("blueprint", "application/json; charset=utf-8", 10)).toBeNull();
  });

  it("keeps each student's objects in their own namespace", () => {
    const key = keyForInterviewPrerequisite("user_s001", "resume", "res-1", "pdf");
    expect(key).toBe("interview-prerequisites/user_s001/resume-res-1.pdf");
  });
});

describe("presigning an upload", () => {
  it("rejects an unacceptable file before anything is signed", async () => {
    const presign = vi.fn();
    await expect(
      presignPrerequisiteUpload(
        { userId: "u1", kind: "resume", contentType: "application/zip", sizeBytes: 10 },
        { presign },
      ),
    ).rejects.toBeInstanceOf(PrerequisiteRejectedError);
    expect(presign).not.toHaveBeenCalled();
  });

  it("signs a one-time PUT into the student's own namespace and returns no bytes", async () => {
    const presign = vi.fn(async ({ key }: { key: string }) => ({
      url: `https://s3.example/${key}?sig=1`,
      key,
      headers: {},
    }));
    const result = await presignPrerequisiteUpload(
      { userId: "u1", kind: "resume", contentType: "application/pdf", sizeBytes: 1234 },
      { presign },
    );
    expect(result.s3Key).toMatch(/^interview-prerequisites\/u1\/resume-/);
    expect(presign).toHaveBeenCalledWith(expect.objectContaining({ oneTime: true }));
    expect(JSON.stringify(result)).not.toMatch(/body|buffer/i);
  });
});

describe("committing an upload", () => {
  function commitDeps(overrides: Record<string, unknown> = {}) {
    const upserts: Record<string, unknown>[] = [];
    return {
      upserts,
      deps: {
        prisma: {
          interviewPrerequisite: {
            upsert: vi.fn(async (u: Record<string, unknown>) => {
              upserts.push(u);
              const create = u.create as Record<string, unknown>;
              return { ...create, createdAt: new Date("2026-09-01T00:00:00.000Z") };
            }),
          },
        },
        head: async () => ({
          versionId: "server-version-9",
          etag: "e",
          contentLength: 42,
          contentType: "application/pdf",
        }),
        extract: async () => ({
          extracted: [{ key: "k", kind: "pdf" as const, text: "RESUME TEXT" }],
          failures: [],
        }),
        ...overrides,
      } as never,
    };
  }

  const KEY = "interview-prerequisites/u1/resume-abc.pdf";

  it("binds the version the object store reported, not a client-supplied one", async () => {
    const { upserts, deps } = commitDeps();
    await commitPrerequisite({ userId: "u1", kind: "resume", s3Key: KEY }, deps);
    expect((upserts[0] as { create: { s3VersionId: string } }).create.s3VersionId).toBe(
      "server-version-9",
    );
  });

  it("upserts so a re-upload replaces in place rather than accumulating resumes", async () => {
    const { upserts, deps } = commitDeps();
    await commitPrerequisite({ userId: "u1", kind: "resume", s3Key: KEY }, deps);
    expect(
      (upserts[0] as { where: { userId_kind: unknown } }).where.userId_kind,
    ).toEqual({ userId: "u1", kind: "resume" });
  });

  it("stores extracted text so prompt assembly never re-reads S3", async () => {
    const { upserts, deps } = commitDeps();
    await commitPrerequisite({ userId: "u1", kind: "resume", s3Key: KEY }, deps);
    expect((upserts[0] as { create: { extractedText: string } }).create.extractedText).toBe(
      "RESUME TEXT",
    );
  });

  it("truncates oversized extracted text to the cap", async () => {
    const { upserts, deps } = commitDeps({
      extract: async () => ({
        extracted: [
          { key: "k", kind: "pdf" as const, text: "x".repeat(PREREQUISITE_TEXT_CAP * 2) },
        ],
        failures: [],
      }),
    });
    await commitPrerequisite({ userId: "u1", kind: "resume", s3Key: KEY }, deps);
    expect(
      (upserts[0] as { create: { extractedText: string } }).create.extractedText,
    ).toHaveLength(PREREQUISITE_TEXT_CAP);
  });

  it("still records the upload when extraction fails", async () => {
    const { upserts, deps } = commitDeps({
      extract: async () => {
        throw new Error("pdf is unreadable");
      },
    });
    await commitPrerequisite({ userId: "u1", kind: "resume", s3Key: KEY }, deps);
    expect(
      (upserts[0] as { create: { extractedText: string | null } }).create.extractedText,
    ).toBeNull();
  });

  it("refuses a key outside the student's own namespace", async () => {
    const { upserts, deps } = commitDeps();
    await expect(
      commitPrerequisite(
        { userId: "u1", kind: "resume", s3Key: "interview-prerequisites/u2/resume-abc.pdf" },
        deps,
      ),
    ).rejects.toBeInstanceOf(PrerequisiteRejectedError);
    expect(upserts).toHaveLength(0);
  });

  it("refuses when the stored object turns out to be a different type", async () => {
    const { upserts, deps } = commitDeps({
      head: async () => ({
        versionId: "v",
        etag: "e",
        contentLength: 42,
        contentType: "application/zip",
      }),
    });
    await expect(
      commitPrerequisite({ userId: "u1", kind: "resume", s3Key: KEY }, deps),
    ).rejects.toBeInstanceOf(PrerequisiteRejectedError);
    expect(upserts).toHaveLength(0);
  });
});

describe("unreadable files are reported, not swallowed", () => {
  const KEY2 = "interview-prerequisites/u1/resume-abc.pdf";
  function deps(extract: unknown) {
    return {
      prisma: {
        interviewPrerequisite: {
          upsert: vi.fn(async (u: Record<string, unknown>) => ({
            ...(u.create as Record<string, unknown>),
            createdAt: new Date("2026-09-01T00:00:00.000Z"),
          })),
        },
      },
      head: async () => ({
        versionId: "v1",
        etag: "e",
        contentLength: 42,
        contentType: "application/pdf",
      }),
      extract,
    } as never;
  }

  it("flags a PDF with no text layer and tells the student how to fix it", async () => {
    const row = await commitPrerequisite(
      { userId: "u1", kind: "resume", s3Key: KEY2 },
      deps(async () => ({ extracted: [{ key: "k", kind: "pdf" as const, text: "" }], failures: [] })),
    );
    expect(row.readable).toBe(false);
    expect(row.unreadableReason).toMatch(/re-export/i);
    expect(row.unreadableReason).toMatch(/resume/i);
  });

  it("flags a malformed PDF that throws during parsing", async () => {
    const row = await commitPrerequisite(
      { userId: "u1", kind: "resume", s3Key: KEY2 },
      deps(async () => {
        throw new Error("Invalid PDF structure.");
      }),
    );
    expect(row.readable).toBe(false);
    expect(row.extractedText).toBeNull();
  });

  it("still stores the upload even when it cannot be read", async () => {
    const row = await commitPrerequisite(
      { userId: "u1", kind: "resume", s3Key: KEY2 },
      deps(async () => {
        throw new Error("Invalid PDF structure.");
      }),
    );
    expect(row.s3Key).toBe(KEY2);
    expect(row.kind).toBe("resume");
  });

  it("reports readable when text came through", async () => {
    const row = await commitPrerequisite(
      { userId: "u1", kind: "resume", s3Key: KEY2 },
      deps(async () => ({
        extracted: [{ key: "k", kind: "pdf" as const, text: "REAL RESUME TEXT" }],
        failures: [],
      })),
    );
    expect(row.readable).toBe(true);
    expect(row.unreadableReason).toBeNull();
  });
});
