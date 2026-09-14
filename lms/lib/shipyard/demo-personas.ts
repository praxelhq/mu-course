// The demo cast: one seeded account per state the Shipyard can be in.
//
// These are ids from `prisma/seed-shipyard.ts`, not fixtures — the seed spreads
// 480 students across ten progress buckets with a fixed PRNG, and these are the
// ones that landed in each. They are stable as long as the seed's shuffle seed
// is, and `app/shipyard/demo` checks each id against the database before
// offering it, so a re-shuffle shows a missing row rather than a broken login.
//
// The page that renders them exists ONLY under `isTestLoginEnabled()`
// (docs/DECISIONS.md, 2026-09-15): it is a list of accounts anyone can become
// with one click, which is exactly right for a demo stack with no real people
// in it and exactly wrong anywhere else.

export type DemoPersona = {
  /** users.id, as seeded. */
  id: string;
  name: string;
  /** Section code, or null for staff. */
  section: string | null;
  role: "student" | "instructor" | "admin";
  /** The one line that says what this account will show you. */
  shows: string;
};

export const DEMO_PERSONAS: readonly DemoPersona[] = [
  {
    id: "user_s001",
    name: "Aarav Sharma",
    section: "A",
    role: "student",
    shows:
      "Day one. No product named, checkpoint 1 open with its bar in full, everything after it locked but readable.",
  },
  {
    id: "user_s003",
    name: "Aditya Sharma",
    section: "A",
    role: "student",
    shows:
      "A returned idea: the reviewer's specific reasons, what already meets the bar, and the resubmit cooldown.",
  },
  {
    id: "user_s008",
    name: "Krishna Sharma",
    section: "A",
    role: "student",
    shows:
      "An attempt in the queue: position, the honest wait, and a page that refreshes itself when the verdict lands.",
  },
  {
    id: "user_s018",
    name: "Anika Sharma",
    section: "A",
    role: "student",
    shows:
      "Mid-course. Idea, design and working product cleared; standing at the money checkpoint with nothing submitted.",
  },
  {
    id: "user_s006",
    name: "Sai Sharma",
    section: "A",
    role: "student",
    shows:
      "Blocked on metrics: the money write-up passed, but the tracker still says payments are not live.",
  },
  {
    id: "user_s062",
    name: "Diya Verma",
    section: "B",
    role: "student",
    shows: "Seven workflow runs of ten. The gate opens by itself at the tenth — nothing to resubmit.",
  },
  {
    id: "user_s054",
    name: "Sai Verma",
    section: "A",
    role: "student",
    shows:
      "Flag-blocked. Real money, real customer, and a self-payment flag from the tracker that fails every metric signal.",
  },
  {
    id: "user_s072",
    name: "Aarohi Verma",
    section: "B",
    role: "student",
    shows: "All six cleared, with a paying customer. The spine at the end of the course.",
  },
  {
    id: "user_instructor",
    name: "Praxel Instructor",
    section: null,
    role: "instructor",
    shows: "The section matrix, the review queue, and every student's file with the two staff actions.",
  },
  {
    id: "user_admin_pushpak",
    name: "Pushpak Teja",
    section: null,
    role: "admin",
    shows: "Everything the instructor sees, all eight section tabs, plus the admin bench and the fake tracker.",
  },
];

/** Where a persona lands after signing in. */
export function demoLandingPath(persona: Pick<DemoPersona, "role">): string {
  return persona.role === "student" ? "/shipyard" : "/shipyard/instructor";
}
