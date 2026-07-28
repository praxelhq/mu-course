import { afterEach, describe, expect, it } from "vitest";

import {
  MAX_MP4_BYTES,
  S3NotConfiguredError,
  UploadRejectedError,
  __setS3TestOverrides,
  keyForMaterial,
  keyForSubmission,
  presignGet,
  presignPut,
  rangedRead,
  s3Configured,
} from "../lib/s3";

// U7 S3 module: the only module importing the AWS SDK. Pure logic (key
// namespacing, upload validation) is tested without any client; the signing
// path is exercised through the DI test seam.

afterEach(() => __setS3TestOverrides(null));

describe("key namespacing helpers", () => {
  it("materials keys are materials/session{no}/{filename}", () => {
    expect(keyForMaterial(3, "moxie_retail_oct2025.csv")).toBe(
      "materials/session3/moxie_retail_oct2025.csv",
    );
    expect(keyForMaterial(10, "deck.pdf")).toBe("materials/session10/deck.pdf");
  });

  it("submissions keys are submissions/{userId}/{submissionId}/{filename} (U8 contract)", () => {
    expect(keyForSubmission("user_s001", "sub_042", "blueprint.json")).toBe(
      "submissions/user_s001/sub_042/blueprint.json",
    );
  });

  it("sanitizes path traversal and unsafe characters out of filenames", () => {
    expect(keyForMaterial(3, "../../etc/passwd")).not.toContain("..");
    expect(keyForMaterial(3, "a b/c?.csv")).toBe("materials/session3/c_.csv");
    expect(keyForSubmission("u", "s", "über résumé.pdf")).toBe(
      "submissions/u/s/_ber_r_sum_.pdf",
    );
  });
});

describe("presignPut validation", () => {
  it("rejects disallowed content types with 415", async () => {
    for (const contentType of ["application/x-msdownload", "text/html", "application/octet-stream"]) {
      await expect(
        presignPut({ key: "materials/session1/x", contentType, maxBytes: 100 }),
      ).rejects.toMatchObject({ name: "UploadRejectedError", status: 415 });
    }
  });

  it("rejects mp4 above 200MB with 413", async () => {
    await expect(
      presignPut({
        key: "materials/session1/big.mp4",
        contentType: "video/mp4",
        maxBytes: MAX_MP4_BYTES + 1,
      }),
    ).rejects.toMatchObject({ name: "UploadRejectedError", status: 413 });
  });

  it("allows mp4 at exactly the 200MB boundary", async () => {
    __setS3TestOverrides({
      configured: true,
      sign: (d) => `https://s3.test/${d.key}?sig=1`,
    });
    const out = await presignPut({
      key: "materials/session1/clip.mp4",
      contentType: "video/mp4",
      maxBytes: MAX_MP4_BYTES,
    });
    expect(out.url).toBe("https://s3.test/materials/session1/clip.mp4?sig=1");
    expect(out.key).toBe("materials/session1/clip.mp4");
    expect(out.headers["Content-Type"]).toBe("video/mp4");
  });

  it("rejects non-mp4 kinds that exceed their own caps", async () => {
    await expect(
      presignPut({
        key: "materials/session1/huge.csv",
        contentType: "text/csv",
        maxBytes: MAX_MP4_BYTES, // 200MB is far over the csv cap
      }),
    ).rejects.toMatchObject({ status: 413 });
  });

  it("throws S3NotConfiguredError when storage env is absent", async () => {
    expect(s3Configured()).toBe(false); // local dev: no AWS env in .env
    await expect(
      presignPut({ key: "materials/session1/a.pdf", contentType: "application/pdf", maxBytes: 100 }),
    ).rejects.toBeInstanceOf(S3NotConfiguredError);
    await expect(presignGet("materials/session1/a.pdf")).rejects.toBeInstanceOf(
      S3NotConfiguredError,
    );
    await expect(rangedRead("materials/session1/a.csv")).rejects.toBeInstanceOf(
      S3NotConfiguredError,
    );
  });

  it("error classes are typed", () => {
    const e = new UploadRejectedError(415, "nope");
    expect(e.status).toBe(415);
    expect(new S3NotConfiguredError().name).toBe("S3NotConfiguredError");
  });
});

describe("presignGet", () => {
  it("passes a download disposition through to the signer", async () => {
    let seen: { key: string; responseContentDisposition?: string; expiresIn: number } | null = null;
    __setS3TestOverrides({
      configured: true,
      sign: (d) => {
        seen = { key: d.key, responseContentDisposition: d.responseContentDisposition, expiresIn: d.expiresIn };
        return `https://s3.test/${d.key}?sig=2`;
      },
    });
    const url = await presignGet("materials/session3/moxie.csv", { downloadName: "moxie.csv" });
    expect(url).toContain("sig=2");
    expect(seen!.key).toBe("materials/session3/moxie.csv");
    expect(seen!.responseContentDisposition).toBe('attachment; filename="moxie.csv"');
    expect(seen!.expiresIn).toBeLessThanOrEqual(300); // short TTL ~5min
  });
});

describe("rangedRead", () => {
  it("requests a bounded byte range (CSV preview is a bounded read, not a proxy)", async () => {
    let range: string | null = null;
    __setS3TestOverrides({
      configured: true,
      read: (_key, r) => {
        range = r;
        return Promise.resolve(new TextEncoder().encode("a,b\n1,2\n"));
      },
    });
    const bytes = await rangedRead("materials/session3/x.csv");
    expect(new TextDecoder().decode(bytes)).toContain("a,b");
    expect(range).toBe("bytes=0-262143"); // first ~256KB only
  });
});
