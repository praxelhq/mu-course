import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDotEnv } from "./helpers/env";

loadDotEnv();

import {
  castVote,
  galleryVoteState,
  getLeaderboard,
  myVoteCount,
  removeVote,
  setReveal,
  VoteError,
  VOTE_UNLOCK_MIN,
} from "../lib/votes";

// Section-scoped upvoting rules (live DB; self-skips without Postgres).
// Builds its own uniquely-stamped fixtures so it does not depend on seed state.

async function dbReachable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient();
  try {
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await client.$disconnect();
  }
}

const live = await dbReachable();

describe.skipIf(!live)("section-scoped voting", () => {
  const stamp = Date.now();
  let prisma: import("@prisma/client").PrismaClient;
  let assignmentId: string;
  const sectionA = `VOTEA${stamp}`;
  const sectionB = `VOTEB${stamp}`;
  let secAId: string;
  let secBId: string;
  const voters: Record<string, { id: string; sectionId: string | null }> = {};
  const subs: Record<string, string> = {}; // ownerKey -> submissionId

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();

    const [a, b] = await Promise.all([
      prisma.section.create({ data: { code: sectionA, name: "Vote A" } }),
      prisma.section.create({ data: { code: sectionB, name: "Vote B" } }),
    ]);
    secAId = a.id;
    secBId = b.id;

    const type = await prisma.assignmentType.create({
      data: {
        slug: `meme-${stamp}`,
        title: "Meme",
        description: "Image, gallery, ungraded",
        submissionSchema: { fields: [{ key: "image", label: "Meme", kind: "file", required: true }] },
        rubric: { scale: 10, dimensions: [{ key: "x", label: "X", max: 10, description: "" }] },
        galleryEligible: true,
        aiGraded: false,
      },
    });
    const assignment = await prisma.assignment.create({
      data: {
        assignmentTypeId: type.id,
        title: "S2 Meme",
        brief: "Post a meme",
        sessionNo: 2,
        sectionIds: [secAId, secBId],
      },
    });
    assignmentId = assignment.id;

    // 3 students in A (a1 owns a submission, a2 & a3 are voters), 1 in B.
    for (const [key, sectionId] of [
      ["a1", secAId],
      ["a2", secAId],
      ["a3", secAId],
      ["a4", secAId],
      ["a5", secAId],
      ["a6", secAId],
      ["b1", secBId],
    ] as const) {
      const u = await prisma.user.create({
        data: { email: `${key}-${stamp}@t.local`, name: key.toUpperCase(), role: "student", sectionId },
      });
      voters[key] = { id: u.id, sectionId };
    }

    // a1 (section A) and b1 (section B) each submit a meme.
    for (const owner of ["a1", "b1"] as const) {
      const s = await prisma.submission.create({
        data: {
          assignmentId,
          userId: voters[owner].id,
          status: "submitted",
          submittedAt: new Date(),
          fields: { image: `uploads/${voters[owner].id}/meme.png` },
          files: [`uploads/${voters[owner].id}/meme.png`],
        },
      });
      subs[owner] = s.id;
    }
  });

  afterAll(async () => {
    await prisma.vote.deleteMany({ where: { submission: { assignmentId } } });
    await prisma.submission.deleteMany({ where: { assignmentId } });
    await prisma.assignment.deleteMany({ where: { id: assignmentId } });
    await prisma.assignmentType.deleteMany({ where: { slug: `meme-${stamp}` } });
    await prisma.user.deleteMany({ where: { email: { endsWith: `-${stamp}@t.local` } } });
    await prisma.section.deleteMany({ where: { id: { in: [secAId, secBId] } } });
    await prisma.$disconnect();
  });

  it("allows an in-section upvote and is idempotent", async () => {
    const first = await castVote(voters.a2, subs.a1);
    expect(first).toEqual({ ok: true, already: false });
    const again = await castVote(voters.a2, subs.a1);
    expect(again.already).toBe(true);
    expect(await myVoteCount(voters.a2.id, assignmentId)).toBe(1);
  });

  it("rejects self-voting", async () => {
    await expect(castVote(voters.a1, subs.a1)).rejects.toMatchObject({ status: 400 });
  });

  it("rejects cross-section voting", async () => {
    // b1 (section B) cannot vote a1's submission (section A).
    await expect(castVote(voters.b1, subs.a1)).rejects.toBeInstanceOf(VoteError);
    await expect(castVote(voters.b1, subs.a1)).rejects.toMatchObject({ status: 403 });
  });

  it("hides own tally until reveal AND >= VOTE_UNLOCK_MIN votes cast", async () => {
    // a1 (owner) has cast 0 votes: hidden before reveal, still locked after.
    const before = await galleryVoteState(voters.a1, assignmentId);
    expect(before.counts).toBeNull(); // not revealed yet

    await setReveal(assignmentId, secAId, true);
    const revealedButLocked = await galleryVoteState(voters.a1, assignmentId);
    // a1 has cast 0 votes -> still locked even though revealed.
    expect(revealedButLocked.unlocked).toBe(false);
    expect(revealedButLocked.counts).toBeNull();
  });

  it("shows tally once revealed and unlocked", async () => {
    // Give a6 five casts so they unlock. Only a1's submission exists in A, so
    // add four more votable submissions in section A to vote on.
    for (const owner of ["a2", "a3", "a4", "a5"] as const) {
      const s = await prisma.submission.create({
        data: {
          assignmentId,
          userId: voters[owner].id,
          status: "submitted",
          submittedAt: new Date(),
          fields: { image: `uploads/${voters[owner].id}/meme.png` },
          files: [`uploads/${voters[owner].id}/meme.png`],
        },
      });
      subs[owner] = s.id;
    }
    for (const owner of ["a1", "a2", "a3", "a4", "a5"] as const) {
      await castVote(voters.a6, subs[owner]);
    }
    expect(await myVoteCount(voters.a6.id, assignmentId)).toBe(VOTE_UNLOCK_MIN);

    const state = await galleryVoteState(voters.a6, assignmentId);
    expect(state.unlocked).toBe(true);
    expect(state.counts).not.toBeNull();
    // a1 got votes from a2 (earlier) + a6 = 2.
    expect(state.counts?.get(subs.a1)).toBeGreaterThanOrEqual(2);
  });

  it("leaderboard is null for students until reveal, always present for instructor", async () => {
    await setReveal(assignmentId, secBId, false);
    expect(await getLeaderboard(assignmentId, secBId, { asInstructor: false })).toBeNull();
    const inst = await getLeaderboard(assignmentId, secBId, { asInstructor: true });
    expect(Array.isArray(inst)).toBe(true);
  });

  it("removeVote toggles a vote off", async () => {
    await castVote(voters.a2, subs.a3);
    expect(await myVoteCount(voters.a2.id, assignmentId)).toBeGreaterThanOrEqual(2);
    await removeVote(voters.a2.id, subs.a3);
    const votes = await prisma.vote.findMany({
      where: { voterId: voters.a2.id, submission: { assignmentId } },
    });
    expect(votes.every((v) => v.submissionId !== subs.a3)).toBe(true);
  });
});

describe.skipIf(!live)("gallery anonymity", () => {
  it("hides author names until the instructor reveals, but never hides your own", async () => {
    const { PrismaClient } = await import("@prisma/client");
    const { getVoteGallery } = await import("../lib/gallery-vote");
    const { setReveal } = await import("../lib/votes");
    const p = new PrismaClient();
    const stamp = Date.now();
    const sec = await p.section.create({ data: { code: `ANON${stamp}`, name: "Anon" } });
    const type = await p.assignmentType.create({
      data: {
        slug: `anon-${stamp}`,
        title: "Anon meme",
        description: "d",
        submissionSchema: { fields: [{ key: "image", label: "Image", kind: "file", required: true }] },
        rubric: { scale: 10, dimensions: [{ key: "x", label: "X", max: 10, description: "" }] },
        galleryEligible: true,
        aiGraded: false,
      },
    });
    const asg = await p.assignment.create({
      data: { assignmentTypeId: type.id, title: "Anon", brief: "b", sessionNo: 2, sectionIds: [sec.id] },
    });
    const mk = async (key: string) => {
      const u = await p.user.create({
        data: { email: `${key}-${stamp}@anon.local`, name: `Real Name ${key}`, role: "student", sectionId: sec.id },
      });
      const s = await p.submission.create({
        data: { assignmentId: asg.id, userId: u.id, status: "submitted", submittedAt: new Date(), fields: { image: `k/${u.id}.png` }, files: [`k/${u.id}.png`] },
      });
      await p.galleryItem.create({ data: { submissionId: s.id } });
      return { u, s };
    };
    const me = await mk("me");
    const other = await mk("other");

    const viewer = { id: me.u.id, sectionId: sec.id };
    const before = await getVoteGallery(viewer, asg.id);
    const names = before!.sections.flatMap((x) => x.items.map((i) => i.ownerName));
    expect(names).not.toContain(other.u.name);          // someone else's name is hidden
    expect(names).toContain("Anonymous");
    expect(names).toContain("Your submission");          // but you can find your own

    await setReveal(asg.id, sec.id, true);
    const after = await getVoteGallery(viewer, asg.id);
    const namesAfter = after!.sections.flatMap((x) => x.items.map((i) => i.ownerName));
    expect(namesAfter).toContain(other.u.name);          // revealed

    await p.vote.deleteMany({ where: { submission: { assignmentId: asg.id } } });
    await p.galleryItem.deleteMany({ where: { submission: { assignmentId: asg.id } } });
    await p.submission.deleteMany({ where: { assignmentId: asg.id } });
    await p.assignment.delete({ where: { id: asg.id } });
    await p.assignmentType.delete({ where: { id: type.id } });
    await p.user.deleteMany({ where: { email: { endsWith: `-${stamp}@anon.local` } } });
    await p.configKV.deleteMany({ where: { key: `reveal_votes:${asg.id}` } });
    await p.section.delete({ where: { id: sec.id } });
    await p.$disconnect();
  });
});
