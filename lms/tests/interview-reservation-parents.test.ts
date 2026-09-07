import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { GeneratedObjectPurpose } from "@prisma/client";

// Regression: the interview_v2 migration added the `interview_video` purpose to
// the enum but not to the GeneratedObjectReservation_purpose_parent_check
// constraint. Reserving the room video then failed with Postgres 23514,
// agent-context returned 500, the agent treated that as fatal and left, and
// every realtime interview died before a word was spoken.
//
// The constraint lives in raw SQL, so it cannot drift from the enum silently
// unless something checks. This is that check.

const MIGRATIONS = join(process.cwd(), "prisma/migrations");

/** The last CHECK definition for the purpose/parent constraint across all migrations. */
function effectivePurposeParentCheck(): string {
  const dirs = readdirSync(MIGRATIONS).sort();
  let latest = "";
  for (const dir of dirs) {
    let sql: string;
    try {
      sql = readFileSync(join(MIGRATIONS, dir, "migration.sql"), "utf8");
    } catch {
      continue;
    }
    if (!sql.includes("GeneratedObjectReservation_purpose_parent_check")) continue;
    const idx = sql.lastIndexOf("GeneratedObjectReservation_purpose_parent_check");
    // Everything after the last mention is the definition that wins.
    const tail = sql.slice(idx);
    if (tail.includes("CHECK")) latest = tail;
  }
  return latest;
}

describe("generated-object reservation purpose/parent constraint", () => {
  const check = effectivePurposeParentCheck();

  it("has a definition to check", () => {
    expect(check).not.toBe("");
    expect(check).toContain("CHECK");
  });

  it("allows every interview-parented purpose the code can reserve", () => {
    // These are the purposes actually reserved against an interview.
    for (const purpose of ["interview_recording", "interview_video", "interview_turn_audio"]) {
      expect(check, `${purpose} must be allowed with an interviewId`).toContain(purpose);
    }
  });

  it("still allows the submission-parented purposes", () => {
    for (const purpose of ["gallery_screenshot", "publication_preview"]) {
      expect(check).toContain(purpose);
    }
  });

  it("covers every purpose in the Prisma enum except deliberately unreserved ones", () => {
    // interview_prerequisite is stored directly on InterviewPrerequisite and
    // never goes through a reservation, so it is intentionally absent.
    const unreserved = new Set(["interview_prerequisite"]);
    const missing = Object.values(GeneratedObjectPurpose).filter(
      (p) => !unreserved.has(p) && !check.includes(p),
    );
    expect(missing, `enum values with no branch in the CHECK constraint: ${missing.join(", ")}`).toEqual([]);
  });
});
