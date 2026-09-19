import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
vi.mock("@/lib/queue", () => ({
  getBoss: async () => ({ createQueue: async () => {}, send: async () => {} }),
}));
const fakes = vi.hoisted(() => ({
  model: vi.fn(),
  render: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@/lib/ai/openrouter", () => ({
  callStructured: fakes.model,
  imagePart: (data: string) => ({
    type: "image_url",
    image_url: { url: data },
  }),
}));
vi.mock("@/lib/ai/studio", () => ({ callStudio: fakes.model }));
vi.mock("@/lib/shipyard/reviewer/render", () => ({
  renderLiveProduct: fakes.render,
}));
vi.mock("@/lib/s3", () => ({
  headObject: vi.fn(),
  presignPut: vi.fn(),
  presignGet: vi.fn(),
  readObjectVersion: fakes.read,
}));
import { prisma } from "@/lib/db";
import {
  performStudioAction,
  studioFileUrl,
  studioState,
} from "@/lib/shipyard/studio/service";
import {
  emptyDocument,
  emptyIdea,
  gateOpen,
} from "@/lib/shipyard/studio/contracts";
import type { StudioActor } from "@/lib/shipyard/studio/auth";
import { runStudioJob } from "@/worker/shipyard-jobs/studio";
const enabled = process.env.STUDIO_INTEGRATION_TESTS === "1";
describe.skipIf(!enabled)("Shipyard studio with isolated Postgres", () => {
  const suffix = randomUUID();
  let student: StudioActor,
    teammate: StudioActor,
    outsider: StudioActor,
    staff: StudioActor;
  let workspaceId: string;
  const actors: StudioActor[] = [];
  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes("shipyard_studio_"))
      throw new Error("Use an isolated shipyard_studio_ database");
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.APP_URL = "http://localhost:3000";
    for (const [name, isStaff] of [
      ["owner", false],
      ["member", false],
      ["other", false],
      ["staff", true],
    ] as const) {
      const row = await prisma.shipyardStudioIdentity.create({
        data: {
          clerkId: `test-${name}-${suffix}`,
          email: `${name}-${suffix}@mastersunion.org`,
          name,
        },
      });
      actors.push({ ...row, staff: isStaff });
    }
    [student, teammate, outsider, staff] = actors;
    const created = await performStudioAction(student, {
      action: "create",
      name: "Test venture",
    });
    workspaceId = (created as { workspaceId: string }).workspaceId;
    await performStudioAction(outsider, {
      action: "create",
      name: "Other venture",
    });
  });
  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { actorId: { in: actors.map((a) => a.id) } },
    });
    await prisma.shipyardStudioWorkspace.deleteMany({
      where: {
        members: { some: { identityId: { in: actors.map((a) => a.id) } } },
      },
    });
    await prisma.shipyardStudioIdentity.deleteMany({
      where: { id: { in: actors.map((a) => a.id) } },
    });
    await prisma.$disconnect();
  });
  async function saveIdea() {
    const w = await prisma.shipyardStudioWorkspace.findUniqueOrThrow({
      where: { id: workspaceId },
    });
    const d = emptyDocument();
    Object.assign(d.ideas[0], {
      title: "Freelance invoice tool",
      description:
        "A simple invoice tracker for freelance designers. Charge five dollars monthly and find first buyers through our design club.",
      landingUrl: "https://example.com",
    });
    await performStudioAction(student, {
      action: "save",
      version: w.version,
      document: d,
    });
    return { ...w, version: w.version + 1, document: d };
  }
  it("requires an addressed invitation and preserves team isolation", async () => {
    const invite = (await performStudioAction(student, {
      action: "invite",
      email: teammate.email,
    })) as { inviteUrl: string };
    const token = new URL(invite.inviteUrl).searchParams.get("token")!;
    await expect(
      performStudioAction(outsider, { action: "join", token }),
    ).rejects.toThrow("different MU email");
    await performStudioAction(teammate, { action: "join", token });
    await expect(
      performStudioAction(teammate, { action: "join", token }),
    ).rejects.toThrow("already been used");
    await expect(
      performStudioAction(teammate, {
        action: "invite",
        email: outsider.email,
      }),
    ).rejects.toThrow("owner");
    const state = await studioState(outsider, workspaceId);
    expect(state.workspace?.id).not.toBe(workspaceId);
    expect((await studioState(student)).workspace?.members).toHaveLength(2);
  });
  it("rejects a lost update rather than overwriting teammate work", async () => {
    const w = await saveIdea();
    const changed = structuredClone(w.document);
    changed.ideas[0].title = "A better invoice tool";
    await performStudioAction(teammate, {
      action: "save",
      version: w.version,
      document: changed,
    });
    await expect(
      performStudioAction(student, {
        action: "save",
        version: w.version,
        document: w.document,
      }),
    ).rejects.toThrow("teammate");
  });
  it("allows only instructors to pause research and enforces the pause before charging", async () => {
    await expect(
      performStudioAction(student, {
        action: "source-setting",
        source: "reddit",
        enabled: false,
      }),
    ).rejects.toThrow("Instructor");
    try {
      await performStudioAction(staff, {
        action: "source-setting",
        source: "reddit",
        enabled: false,
      });
      await expect(
        performStudioAction(student, {
          action: "research",
          source: "reddit",
          query: "invoice software",
          target: "",
          requestId: randomUUID(),
        }),
      ).rejects.toThrow("paused");
    } finally {
      await performStudioAction(staff, {
        action: "source-setting",
        source: "reddit",
        enabled: true,
      });
    }
  });
  it("blocks checkpoint skipping and foreign design attachment", async () => {
    const w = await saveIdea();
    await expect(
      performStudioAction(student, {
        action: "submit",
        checkpoint: 2,
        version: w.version,
        requestId: randomUUID(),
      }),
    ).rejects.toThrow("previous checkpoint");
    w.document.ideas[0].sketches = ["another-team-file"];
    await expect(
      performStudioAction(student, {
        action: "save",
        version: w.version,
        document: w.document,
      }),
    ).rejects.toThrow("not verified");
    await expect(studioFileUrl(outsider, "another-team-file")).rejects.toThrow(
      "not found",
    );
  });
  it("enforces every criterion and binds immutable review, appeal and instructor override", async () => {
    const w = await saveIdea(),
      requestId = randomUUID();
    const submit = (await performStudioAction(student, {
      action: "submit",
      checkpoint: 1,
      version: w.version,
      requestId,
    })) as { jobId: string; submissionId: string };
    const duplicate = (await performStudioAction(student, {
      action: "submit",
      checkpoint: 1,
      version: w.version,
      requestId,
    })) as { jobId: string };
    expect(duplicate.jobId).toBe(submit.jobId);
    fakes.render.mockResolvedValue({
      ok: true,
      domText: "Clear offer",
      title: "Invoices",
      notes: [],
      screenshotPng: null,
    });
    fakes.model.mockResolvedValue({
      data: {
        decision: "pass",
        summary: "Looks good",
        criteria: [{ id: "build", met: true, reason: "small", change: "" }],
        nextSteps: [],
        sourceIds: ["invented"],
      },
      costUsd: 0.001,
      modelUsed: "test",
      providerUsed: "test",
      tokensIn: 10,
      tokensOut: 20,
    });
    await runStudioJob(submit.jobId);
    const result = await prisma.shipyardStudioSubmission.findUniqueOrThrow({
      where: { id: submit.submissionId },
    });
    expect(result.status).toBe("revise");
    expect((result.review as { sourceIds: string[] }).sourceIds).toEqual([]);
    const appeal = (await performStudioAction(teammate, {
      action: "appeal",
      submissionId: submit.submissionId,
      reason: "Please reconsider the pricing evidence on our landing page.",
    })) as { appealId: string };
    const stored = await prisma.shipyardStudioAppeal.findUniqueOrThrow({
      where: { id: appeal.appealId },
    });
    expect(
      await performStudioAction(teammate, {
        action: "appeal",
        submissionId: submit.submissionId,
        reason: "Please reconsider the pricing evidence on our landing page.",
      }),
    ).toEqual({ appealId: appeal.appealId });
    const email = stored.emailPayload as {
      to: string[];
      cc: string[];
      text: string;
    };
    expect(email.to).toEqual(["build@praxel.in"]);
    expect(email.cc).toEqual([teammate.email]);
    expect(email.text).toContain("Looks good");
    expect(email.text).toContain("A simple invoice tracker");
    await expect(
      performStudioAction(student, {
        action: "decide",
        appealId: appeal.appealId,
        decision: "approved",
        note: "The reviewer was wrong here.",
      }),
    ).rejects.toThrow("Instructor");
    await performStudioAction(staff, {
      action: "decide",
      appealId: appeal.appealId,
      decision: "approved",
      note: "The monetisation plan is credible. Proceed.",
    });
    expect(
      gateOpen(
        2,
        await prisma.shipyardStudioSubmission.findMany({
          where: { workspaceId },
        }),
      ),
    ).toBe(true);
    await expect(
      performStudioAction(staff, {
        action: "decide",
        appealId: appeal.appealId,
        decision: "returned",
        note: "A second decision should not overwrite.",
      }),
    ).rejects.toThrow("already decided");
  });
  it("does not let an old appeal open a new submission", async () => {
    const w = await saveIdea();
    const old = await prisma.shipyardStudioAppeal.findFirstOrThrow({
      where: { submission: { workspaceId } },
    });
    await performStudioAction(student, {
      action: "submit",
      checkpoint: 1,
      version: w.version,
      requestId: randomUUID(),
    });
    await expect(
      performStudioAction(staff, {
        action: "decide",
        appealId: old.id,
        decision: "approved",
        note: "Old approval must not affect a newer submission.",
      }),
    ).rejects.toThrow("outdated");
    expect(
      gateOpen(
        2,
        await prisma.shipyardStudioSubmission.findMany({
          where: { workspaceId },
        }),
      ),
    ).toBe(false);
  });
  it("prevents changing ideas after an approval", async () => {
    await prisma.shipyardStudioSubmission.updateMany({
      where: { workspaceId, checkpoint: 1 },
      data: { status: "passed" },
    });
    const w = await prisma.shipyardStudioWorkspace.findUniqueOrThrow({
        where: { id: workspaceId },
      }),
      d = emptyDocument();
    d.ideas.push(emptyIdea("different"));
    d.activeIdeaId = "different";
    Object.assign(d.ideas[1], {
      job: "When a customer wants progress, the software delivers a measurable outcome.",
      features: [
        {
          name: "Core job",
          description: "The customer completes their core job in one screen.",
          mlp: true,
        },
      ],
      sketches: ["sketch"],
      designs: ["design"],
    });
    for (const [id, kind] of [
      ["sketch", "sketch"],
      ["design", "design"],
    ]) {
      await prisma.shipyardStudioFile.create({
        data: {
          id: `${id}-${suffix}`,
          workspaceId,
          actorId: student.id,
          name: id,
          key: `${id}-${suffix}`,
          kind,
          contentType: "image/png",
          bytes: 8,
          versionId: "1",
        },
      });
    }
    d.ideas[1].sketches = [`sketch-${suffix}`];
    d.ideas[1].designs = [`design-${suffix}`];
    await performStudioAction(student, {
      action: "save",
      version: w.version,
      document: d,
    });
    await expect(
      performStudioAction(student, {
        action: "submit",
        checkpoint: 2,
        version: w.version + 1,
        requestId: randomUUID(),
      }),
    ).rejects.toThrow("approved idea");
  });
  it("records checkpoint 3 without calling a model or fetching its URL", async () => {
    const w = await saveIdea();
    w.document.ideas[0].liveUrl = "https://example.com";
    await performStudioAction(student, {
      action: "save",
      version: w.version,
      document: w.document,
    });
    await prisma.shipyardStudioSubmission.create({
      data: {
        workspaceId,
        checkpoint: 2,
        version: 1,
        actorId: student.id,
        snapshot: { ideaId: "first", fields: {} },
        members: [],
        rubric: "test",
        status: "passed",
      },
    });
    fakes.model.mockClear();
    fakes.render.mockClear();
    const result = (await performStudioAction(student, {
      action: "submit",
      checkpoint: 3,
      version: w.version + 1,
      requestId: randomUUID(),
    })) as { jobId: string; submissionId: string };
    expect(
      (
        await prisma.shipyardStudioSubmission.findUniqueOrThrow({
          where: { id: result.submissionId },
        })
      ).status,
    ).toBe("received");
    await runStudioJob(result.jobId);
    expect(fakes.model).not.toHaveBeenCalled();
    expect(fakes.render).not.toHaveBeenCalled();
  });
  it("keeps saved research from other candidate ideas out of coaching", async () => {
    for (const ideaId of ["first", "unrelated-idea"]) {
      await prisma.shipyardStudioJob.create({
        data: {
          workspaceId,
          actorId: student.id,
          kind: "research",
          status: "complete",
          requestKey: `research-${ideaId}-${suffix}`,
          payload: { source: "market", idea: { id: ideaId } },
          result: {
            evidence: [
              {
                id: ideaId,
                source: "fixture",
                title: ideaId,
                text: ideaId,
                url: "https://example.com",
                capturedAt: new Date().toISOString(),
                type: "fixture",
              },
            ],
          },
        },
      });
    }
    await prisma.shipyardStudioJob.updateMany({
      where: { workspaceId, status: "queued" },
      data: { status: "cancelled" },
    });
    fakes.model.mockClear();
    fakes.model.mockResolvedValue({
      data: {
        answer: "Consider one narrow workflow.",
        suggestions: [],
        sourceIds: ["first"],
      },
      modelUsed: "fixture",
      providerUsed: "fixture",
      tokensIn: 1,
      tokensOut: 1,
      costUsd: 0.001,
    });
    const job = (await performStudioAction(student, {
      action: "coach",
      message: "Help me narrow this idea",
      requestId: randomUUID(),
    })) as { jobId: string };
    await runStudioJob(job.jobId);
    const body = fakes.model.mock.calls[0][0].user[0].text;
    expect(body).toContain('"id":"first"');
    expect(body).not.toContain("unrelated-idea");
  });
  it("preserves review allocation when the cohort coaching allocation is exhausted", async () => {
    const other = await prisma.shipyardStudioMember.findUniqueOrThrow({
      where: { identityId: outsider.id },
    });
    const spent = await prisma.shipyardStudioJob.create({
      data: {
        workspaceId: other.workspaceId,
        actorId: outsider.id,
        kind: "coach",
        status: "complete",
        requestKey: `budget-${suffix}`,
        payload: {},
        costUsd: 110,
        createdAt: new Date(Date.now() - 2 * 86400000),
      },
    });
    try {
      await expect(
        performStudioAction(outsider, {
          action: "coach",
          message: "Help me simplify",
          requestId: randomUUID(),
        }),
      ).rejects.toThrow("shared coaching budget");
      const document = emptyDocument();
      Object.assign(document.ideas[0], {
        title: "Invoice helper",
        description:
          "Software for freelancers to create reusable invoices for five dollars a month, sold through our design club.",
        landingUrl: "https://example.com",
      });
      await performStudioAction(outsider, {
        action: "save",
        version: 0,
        document,
      });
      await expect(
        performStudioAction(outsider, {
          action: "submit",
          checkpoint: 1,
          version: 1,
          requestId: randomUUID(),
        }),
      ).resolves.toHaveProperty("submissionId");
      await prisma.shipyardStudioJob.update({
        where: { id: spent.id },
        data: { costUsd: 150 },
      });
      await performStudioAction(outsider, {
        action: "save",
        version: 1,
        document,
      });
      await expect(
        performStudioAction(outsider, {
          action: "submit",
          checkpoint: 1,
          version: 2,
          requestId: randomUUID(),
        }),
      ).rejects.toThrow("shared AI review budget");
    } finally {
      await prisma.shipyardStudioJob.delete({ where: { id: spent.id } });
    }
  });
  it("resubmission invalidates downstream progress without deleting history", async () => {
    const w = await saveIdea();
    await performStudioAction(student, {
      action: "submit",
      checkpoint: 1,
      version: w.version,
      requestId: randomUUID(),
    });
    const rows = await prisma.shipyardStudioSubmission.findMany({
      where: { workspaceId },
    });
    expect(rows.find((r) => r.checkpoint === 3)?.status).toBe("superseded");
    expect(gateOpen(3, rows)).toBe(false);
    expect(rows.filter((r) => r.checkpoint === 1).length).toBeGreaterThan(1);
  });
});
