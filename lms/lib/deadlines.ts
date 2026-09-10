// Two deadlines, one of which is a promise and the other a rule.
//
// The course publishes a date EARLIER than the one it actually enforces, so
// work lands before the real cutoff while the cutoff still absorbs stragglers.
// Two places carry the pair:
//
//   Assignment      dueAt    (hard: grade finalisation, cohort freeze)
//                   displayDueAt (soft: what a learner reads)
//   InterviewWindow closesAt (hard: may a student start an interview at all)
//                   displayClosesAt (soft: what a learner reads)
//
// Everything student-facing goes through the `shown*` helpers. Nothing that
// ENFORCES anything goes through them at all — a rule that consulted the shown
// date would enforce a deadline the course chose not to enforce.

/** The shown date, falling back to the enforced one when no soft date is set. */
function shownOf(hard: Date | null, soft: Date | null): Date | null {
  return soft ?? hard;
}

/**
 * The enforced date, but only when it is worth showing — a soft date exists
 * and the two genuinely differ. Staff views render this beside the shown one
 * so an instructor is never told "closes the 10th" by the same app that keeps
 * accepting work until the 15th. Learners never receive it.
 */
function graceOf(hard: Date | null, soft: Date | null): Date | null {
  if (!hard || !soft) return null;
  return soft.getTime() === hard.getTime() ? null : hard;
}

function orderOf(hard: Date | null, soft: Date | null, label: string): void {
  if (!soft) return;
  if (!hard) {
    throw new DeadlineOrderError(`A displayed ${label} needs an enforced one to sit before`);
  }
  if (soft.getTime() > hard.getTime()) {
    throw new DeadlineOrderError(
      `Displayed ${label} ${soft.toISOString()} is after the enforced ${hard.toISOString()}`,
    );
  }
}

export type DeadlinePair = {
  dueAt: Date | null;
  displayDueAt: Date | null;
};

/** The date a learner is shown. Falls back to the hard cutoff when no soft date is set. */
export function shownDeadline(assignment: DeadlinePair): Date | null {
  return shownOf(assignment.dueAt, assignment.displayDueAt);
}

/**
 * The hard cutoff, but only when it is worth showing — i.e. a soft date exists
 * and the two genuinely differ. Staff views render this beside the shown date
 * so an instructor is never told "due the 10th" by the same app that refuses
 * to finalise grades until the 15th. Students never receive it.
 */
export function graceCutoff(assignment: DeadlinePair): Date | null {
  return graceOf(assignment.dueAt, assignment.displayDueAt);
}

export class DeadlineOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeadlineOrderError";
  }
}

/**
 * The invariant the database also holds (see the 20260910120000 migration),
 * checked before a write so a script fails with a sentence rather than a
 * constraint violation. A soft date after the hard one would advertise a
 * window finalisation does not honour; a soft date with no hard one would
 * leave nothing to fall back to.
 */
export function assertDeadlineOrder(assignment: DeadlinePair): void {
  orderOf(assignment.dueAt, assignment.displayDueAt, "deadline");
}


// ---------------------------------------------------------------------------
// Interview windows — the same idea, the other table
// ---------------------------------------------------------------------------

export type WindowClose = {
  closesAt: Date;
  displayClosesAt: Date | null;
};

/** The close date a learner is shown. */
export function shownWindowClose(window: WindowClose): Date {
  return shownOf(window.closesAt, window.displayClosesAt)!;
}

/** The real close, for staff, and only when it differs from the shown one. */
export function windowGraceClose(window: WindowClose): Date | null {
  return graceOf(window.closesAt, window.displayClosesAt);
}

/** Checked before a write, so a script fails with a sentence not a constraint. */
export function assertWindowCloseOrder(window: WindowClose): void {
  orderOf(window.closesAt, window.displayClosesAt, "interview close");
}
