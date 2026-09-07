import { prisma } from "@/lib/db";

// Section-scoped artifact upvoting for the gallery artifacts (memes, AI-image
// SCENE submissions). The rules, all enforced here so the API and UI stay thin:
//
//  - A student votes only submissions from their OWN section. They can VIEW
//    every section's gallery, but tallies and votes are section-local.
//  - No self-voting; one vote per (student, submission) — the DB unique makes
//    a repeat vote idempotent.
//  - Counts are hidden from students until an instructor REVEALS them for that
//    section (a ConfigKV flag). Instructors always see live tallies.
//  - Even after reveal, a student sees THEIR OWN item's count only once they
//    have cast VOTE_UNLOCK_MIN votes in that gallery (anti-lurking).
//
// "Gallery" == one Assignment (e.g. the meme assignment). Counting "my votes in
// this gallery" means votes by the student on submissions of that assignment.

/** Votes a student must cast in a gallery before their own tally unlocks. */
export const VOTE_UNLOCK_MIN = 5;

const revealKey = (assignmentId: string) => `reveal_votes:${assignmentId}`;

export class VoteError extends Error {
  readonly status: 400 | 403 | 404;
  constructor(status: 400 | 403 | 404, message: string) {
    super(message);
    this.name = "VoteError";
    this.status = status;
  }
}

type Submitter = { submissionId: string; ownerId: string; ownerSectionId: string | null; assignmentId: string };

async function loadVotableSubmission(submissionId: string): Promise<Submitter> {
  const sub = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      status: true,
      userId: true,
      assignmentId: true,
      user: { select: { sectionId: true } },
      assignment: { select: { assignmentType: { select: { galleryEligible: true } } } },
    },
  });
  if (!sub) throw new VoteError(404, "Submission not found");
  if (!sub.assignment.assignmentType.galleryEligible) {
    throw new VoteError(400, "This artifact is not votable");
  }
  if (sub.status !== "submitted" && sub.status !== "graded" && sub.status !== "finalised") {
    throw new VoteError(400, "Submission is not published to the gallery");
  }
  return {
    submissionId: sub.id,
    ownerId: sub.userId,
    ownerSectionId: sub.user.sectionId,
    assignmentId: sub.assignmentId,
  };
}

/**
 * Cast a vote. Enforces no-self-vote and same-section-only. Idempotent: a
 * repeat vote on the same submission is a no-op (returns already: true).
 */
export async function castVote(
  voter: { id: string; sectionId: string | null },
  submissionId: string,
): Promise<{ ok: true; already: boolean }> {
  const target = await loadVotableSubmission(submissionId);
  if (target.ownerId === voter.id) throw new VoteError(400, "You cannot upvote your own submission");
  if (!voter.sectionId || voter.sectionId !== target.ownerSectionId) {
    throw new VoteError(403, "You can only upvote submissions from your own section");
  }
  try {
    await prisma.vote.create({ data: { submissionId, voterId: voter.id } });
    return { ok: true, already: false };
  } catch (err) {
    // Unique (submissionId, voterId) — a double vote is a no-op, not an error.
    if (isUniqueViolation(err)) return { ok: true, already: true };
    throw err;
  }
}

/** Remove a vote (toggle off). No-op if it was not present. */
export async function removeVote(voterId: string, submissionId: string): Promise<{ ok: true }> {
  await prisma.vote.deleteMany({ where: { submissionId, voterId } });
  return { ok: true };
}

/** How many votes this student has cast in a gallery (one assignment). */
export async function myVoteCount(voterId: string, assignmentId: string): Promise<number> {
  return prisma.vote.count({ where: { voterId, submission: { assignmentId } } });
}

// ---------------------------------------------------------------------------
// Reveal (instructor-controlled, per section)
// ---------------------------------------------------------------------------

async function revealedSectionIds(assignmentId: string): Promise<Set<string>> {
  const row = await prisma.configKV.findUnique({ where: { key: revealKey(assignmentId) } });
  const ids = (row?.value as { sectionIds?: unknown } | undefined)?.sectionIds;
  return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : []);
}

export async function isRevealed(assignmentId: string, sectionId: string | null): Promise<boolean> {
  if (!sectionId) return false;
  return (await revealedSectionIds(assignmentId)).has(sectionId);
}

/** Instructor toggles vote-count visibility for one section of one gallery. */
export async function setReveal(
  assignmentId: string,
  sectionId: string,
  revealed: boolean,
): Promise<void> {
  const current = await revealedSectionIds(assignmentId);
  if (revealed) current.add(sectionId);
  else current.delete(sectionId);
  await prisma.configKV.upsert({
    where: { key: revealKey(assignmentId) },
    create: { key: revealKey(assignmentId), value: { sectionIds: [...current] } },
    update: { value: { sectionIds: [...current] } },
  });
}

// ---------------------------------------------------------------------------
// Student-facing gallery vote state
// ---------------------------------------------------------------------------

export type GalleryVoteState = {
  /** submissionId -> did *I* vote it */
  mine: Set<string>;
  /** votes I have cast in this gallery */
  myCount: number;
  /** have I cast enough to unlock my own tally */
  unlocked: boolean;
  /** counts, ONLY when visible to this viewer (revealed + unlocked for own); keyed by submissionId */
  counts: Map<string, number> | null;
};

/**
 * The vote state a student needs to render one gallery. `counts` is populated
 * only when the instructor has revealed this student's section AND the student
 * has unlocked (cast >= VOTE_UNLOCK_MIN). Otherwise counts stay null so the UI
 * shows the "vote N more to see results" affordance instead of tallies.
 */
export async function galleryVoteState(
  viewer: { id: string; sectionId: string | null },
  assignmentId: string,
): Promise<GalleryVoteState> {
  const [myVotes, myCount, revealed] = await Promise.all([
    prisma.vote.findMany({
      where: { voterId: viewer.id, submission: { assignmentId } },
      select: { submissionId: true },
    }),
    myVoteCount(viewer.id, assignmentId),
    isRevealed(assignmentId, viewer.sectionId),
  ]);
  const unlocked = myCount >= VOTE_UNLOCK_MIN;
  let counts: Map<string, number> | null = null;
  if (revealed && unlocked) {
    counts = await sectionTally(assignmentId, viewer.sectionId);
  }
  return { mine: new Set(myVotes.map((v) => v.submissionId)), myCount, unlocked, counts };
}

/** submissionId -> vote count, for submissions owned by students of one section. */
async function sectionTally(assignmentId: string, sectionId: string | null): Promise<Map<string, number>> {
  if (!sectionId) return new Map();
  const rows = await prisma.vote.groupBy({
    by: ["submissionId"],
    where: { submission: { assignmentId, user: { sectionId } } },
    _count: { submissionId: true },
  });
  return new Map(rows.map((r) => [r.submissionId, r._count.submissionId]));
}

// ---------------------------------------------------------------------------
// Leaderboard (per section) — visible to students only after reveal
// ---------------------------------------------------------------------------

export type LeaderboardEntry = { submissionId: string; ownerName: string; votes: number };

/**
 * Section leaderboard, highest first. For an instructor (`asInstructor`) it is
 * always returned; for a student it is returned only once their section is
 * revealed — otherwise null so nothing leaks early.
 */
export async function getLeaderboard(
  assignmentId: string,
  sectionId: string | null,
  opts: { asInstructor?: boolean } = {},
): Promise<LeaderboardEntry[] | null> {
  if (!sectionId) return opts.asInstructor ? [] : null;
  if (!opts.asInstructor && !(await isRevealed(assignmentId, sectionId))) return null;

  const subs = await prisma.submission.findMany({
    where: { assignmentId, user: { sectionId } },
    select: { id: true, user: { select: { name: true } }, _count: { select: { votes: true } } },
  });
  return subs
    .map((s) => ({ submissionId: s.id, ownerName: s.user.name, votes: s._count.votes }))
    .sort((a, b) => b.votes - a.votes || a.ownerName.localeCompare(b.ownerName));
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}
