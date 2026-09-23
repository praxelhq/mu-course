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
vi.mock("@/lib/shipyard/studio/evidence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shipyard/studio/evidence")>()),
  appRillSearch: vi.fn().mockResolvedValue([]),
}));
import { submissionExport } from "@/lib/shipyard/studio/export";
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
    await prisma.shipyardStudioFile.upsert({
      where: { id: `idea-visual-${suffix}` },
      update: {},
      create: {
        id: `idea-visual-${suffix}`,
        workspaceId,
        actorId: student.id,
        name: "Idea sketch.png",
        key: `idea-visual-${suffix}`,
        kind: "reference",
        contentType: "image/png",
        bytes: 8,
        versionId: "1",
      },
    });
    fakes.read.mockResolvedValue(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    const d = emptyDocument();
    Object.assign(d.ideas[0], {
      title: "Freelance invoice tool",
      description:
        "A simple invoice tracker for freelance designers. Charge five dollars monthly and find first buyers through our design club.",
      landingUrl: "https://example.com/invoices",
      visuals: [`idea-visual-${suffix}`],
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
    const body = fakes.model.mock.calls[0][0].history[0].content;
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
      await prisma.shipyardStudioFile.create({
        data: {
          id: `other-visual-${suffix}`,
          workspaceId: other.workspaceId,
          actorId: outsider.id,
          name: "Other visual.png",
          key: `other-visual-${suffix}`,
          kind: "reference",
          contentType: "image/png",
          bytes: 8,
          versionId: "1",
        },
      });
      const document = emptyDocument();
      Object.assign(document.ideas[0], {
        title: "Invoice helper",
        description:
          "Software for freelancers to create reusable invoices for five dollars a month, sold through our design club.",
        landingUrl: "https://example.com/invoices",
        visuals: [`other-visual-${suffix}`],
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
  it("reviews the required landing page and only uses uploaded designs for checkpoint two", async () => {
    const w = await saveIdea();
    fakes.render.mockClear();
    fakes.model.mockResolvedValue({
      data: {
        decision: "pass",
        summary: "A narrow software product",
        criteria: ["build", "monetise", "digital"].map((id) => ({
          id,
          met: true,
          reason: "Supported by the submission",
          change: "",
        })),
        nextSteps: [],
        sourceIds: [],
      },
      modelUsed: "fixture",
      providerUsed: "fixture",
      tokensIn: 1,
      tokensOut: 1,
      costUsd: 0.001,
    });
    const first = (await performStudioAction(student, {
      action: "submit",
      checkpoint: 1,
      version: w.version,
      requestId: randomUUID(),
    })) as { jobId: string; submissionId: string };
    await runStudioJob(first.jobId);
    expect(fakes.render).toHaveBeenCalledTimes(1);
    expect(fakes.render).toHaveBeenCalledWith("https://example.com/invoices");
    expect(
      (
        await prisma.shipyardStudioSubmission.findUniqueOrThrow({
          where: { id: first.submissionId },
        })
      ).status,
    ).toBe("passed");
    const saved = await prisma.shipyardStudioSubmission.findUniqueOrThrow({ where: { id: first.submissionId } });
    expect(Object.keys((saved.snapshot as { fields: object }).fields).sort()).toEqual(["description", "landingUrl", "title"]);
    fakes.render.mockClear();
    Object.assign(w.document.ideas[0], {
      job: "When a freelancer completes work, create and send a clear invoice to the customer.",
      featureList:
        "Enter invoice details; validate amounts; preview and download the PDF.",
      designs: [`design-${suffix}`],
    });
    await performStudioAction(student, {
      action: "save",
      version: w.version,
      document: w.document,
    });
    fakes.model.mockResolvedValue({
      data: {
        decision: "pass",
        summary: "The screen supports the job",
        criteria: ["job", "features", "scope", "designs"].map((id) => ({
          id,
          met: true,
          reason: "Supported by the submission",
          change: "",
        })),
        nextSteps: [],
        sourceIds: [],
      },
      modelUsed: "fixture",
      providerUsed: "fixture",
      tokensIn: 1,
      tokensOut: 1,
      costUsd: 0.001,
    });
    const second = (await performStudioAction(student, {
      action: "submit",
      checkpoint: 2,
      version: w.version + 1,
      requestId: randomUUID(),
    })) as { jobId: string; submissionId: string };
    await runStudioJob(second.jobId);
    expect(
      (
        await prisma.shipyardStudioSubmission.findUniqueOrThrow({
          where: { id: second.submissionId },
        })
      ).status,
    ).toBe("passed");
    const content = fakes.model.mock.lastCall![0].user;
    expect(
      content.filter((p: { type: string }) => p.type === "image_url"),
    ).toHaveLength(1);
    expect(content[0].text).toContain("featureList");
    expect(fakes.render).not.toHaveBeenCalled();
    const unavailable = (await performStudioAction(student, {
      action: "submit",
      checkpoint: 2,
      version: w.version + 1,
      requestId: randomUUID(),
    })) as { jobId: string; submissionId: string };
    fakes.read.mockRejectedValueOnce(new Error("Storage unavailable"));
    await runStudioJob(unavailable.jobId);
    expect(
      (
        await prisma.shipyardStudioSubmission.findUniqueOrThrow({
          where: { id: unavailable.submissionId },
        })
      ).status,
    ).toBe("evidence_needed");
  });
  it("keeps inaccessible landing pages pending evidence even if the model says pass", async () => {
    const w = await saveIdea();
    const submitted = await performStudioAction(student, { action: "submit", checkpoint: 1, version: w.version, requestId: randomUUID() }) as { jobId: string; submissionId: string };
    fakes.render.mockResolvedValueOnce({ ok: false, title: "", domText: "", notes: ["Page unavailable"] });
    fakes.model.mockResolvedValueOnce({ data: { decision: "pass", summary: "The idea is small", criteria: ["build", "monetise", "digital"].map(id => ({id,met:true,reason:"Plausible",change:""})), nextSteps: [], sourceIds: [] }, modelUsed:"fixture",providerUsed:"fixture",tokensIn:1,tokensOut:1,costUsd:0 });
    await runStudioJob(submitted.jobId);
    const row = await prisma.shipyardStudioSubmission.findUniqueOrThrow({ where: { id: submitted.submissionId } });
    expect(row.status).toBe("evidence_needed");
    // Restore the last valid state for the following conversational-context test.
    await prisma.shipyardStudioSubmission.delete({ where: { id: submitted.submissionId } });
  });
  it("retains message images and review context on the next coaching turn", async () => {
    fakes.model.mockClear();
    fakes.model.mockResolvedValue({
      data: {
        answer: "Keep the invoice flow small.",
        suggestions: [],
        sourceIds: [],
      },
      modelUsed: "fixture",
      providerUsed: "fixture",
      tokensIn: 1,
      tokensOut: 1,
      costUsd: 0.001,
    });
    const first = (await performStudioAction(student, {
      action: "coach",
      message: "Review this uploaded screen",
      attachmentIds: [`design-${suffix}`],
      requestId: randomUUID(),
    })) as { jobId: string };
    await runStudioJob(first.jobId);
    const second = (await performStudioAction(student, {
      action: "coach",
      message: "What should I change in that screen?",
      requestId: randomUUID(),
    })) as { jobId: string };
    await runStudioJob(second.jobId);
    const request = fakes.model.mock.lastCall![0];
    const content = request.user;
    expect(request.history).toContainEqual({ role: "user", content: "Review this uploaded screen" });
    expect(content.at(-1).text).toContain("What should I change in that screen?");
    expect(content[0].text).not.toContain("Review this uploaded screen");
    expect(request.history[0].content).toContain("The screen supports the job");
    expect(
      content.filter((p: { type: string }) => p.type === "image_url"),
    ).toHaveLength(2);
  });
  it("rejects foreign chat images before queueing a paid call", async () => {
    await expect(
      performStudioAction(student, {
        action: "coach",
        message: "Review this screen",
        attachmentIds: ["foreign-image"],
        requestId: randomUUID(),
      }),
    ).rejects.toThrow("verified uploads");
  });
  it("streams instructor submissions with private image links and blocks students", async () => {
    await expect(submissionExport(student)).rejects.toThrow(
      "Instructor access",
    );
    const response = await submissionExport(staff);
    const csv = await response.text();
    expect(csv).toContain("Submission ID");
    expect(csv).toContain("Freelance invoice tool");
    expect(csv).toContain("https://example.com/invoices");
    expect(csv).toContain(`?file=design-${suffix}`);
    expect(csv).toContain(student.email);
    expect(response.headers.get("cache-control")).toContain("no-store");
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
  it("finishes queued v2 image submissions using their original rubric", async () => {
    const w = await saveIdea();
    const submitted = await performStudioAction(student, { action: "submit", checkpoint: 1, version: w.version, requestId: randomUUID() }) as { jobId: string; submissionId: string };
    await prisma.shipyardStudioSubmission.update({ where: { id: submitted.submissionId }, data: {
      rubric: "studio-2026-09-21-v2",
      snapshot: { ideaId: "first", fields: { title: w.document.ideas[0].title, description: w.document.ideas[0].description, visuals: [`idea-visual-${suffix}`] } },
    } });
    fakes.render.mockClear();
    fakes.model.mockResolvedValueOnce({ data: { decision: "pass", summary: "A coherent visual", criteria: ["build", "monetise", "digital"].map(id => ({id,met:true,reason:"Plausible",change:""})), nextSteps: [], sourceIds: [] }, modelUsed:"fixture",providerUsed:"fixture",tokensIn:1,tokensOut:1,costUsd:0 });
    await runStudioJob(submitted.jobId);
    expect(fakes.render).not.toHaveBeenCalled();
    const request = fakes.model.mock.lastCall![0];
    expect(request.system).toContain("No landing URL required");
    expect(request.user.filter((p: { type: string }) => p.type === "image_url")).toHaveLength(1);
    expect((await prisma.shipyardStudioSubmission.findUniqueOrThrow({where:{id:submitted.submissionId}})).status).toBe("passed");
  });

});
