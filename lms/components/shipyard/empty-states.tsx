import type { ReactNode } from "react";

// Empty states say what is missing and where it comes from. No illustrations,
// no encouragement, no exclamation marks.

export function EmptyState({
  head,
  children,
  action,
}: {
  head: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="sy-empty">
      <h2 className="sy-empty__head">{head}</h2>
      <p className="sy-empty__body">{children}</p>
      {action}
    </div>
  );
}

/** No grade components scored yet — before the first review lands. */
export function NoGradeYet() {
  return (
    <EmptyState head="Nothing scored yet">
      Components fill in as checkpoints clear. Real numbers and workflow are read
      from Shipped.money; product quality and distribution come from the reviewer.
    </EmptyState>
  );
}

/** The spine itself has no checkpoints — a seeding fault, not a student state. */
export function NoCheckpoints() {
  return (
    <EmptyState head="No checkpoints are set up">
      This course has no checkpoint rows yet. Your instructor has been notified;
      nothing you submitted is affected.
    </EmptyState>
  );
}
