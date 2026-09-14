import type { ReactNode } from "react";

// One inline system message: what happened, and what to do next. Muted and
// bordered, never a filled banner (BRAND rule 5), never an exclamation mark.

export function Notice({
  label,
  children,
  tone = "neutral",
}: {
  label: string;
  children: ReactNode;
  tone?: "neutral" | "problem" | "staff";
}) {
  const cls =
    tone === "problem"
      ? "sy-notice sy-notice--problem"
      : tone === "staff"
        ? "sy-notice sy-notice--staff"
        : "sy-notice";
  return (
    <div className={cls} role={tone === "problem" ? "alert" : undefined}>
      <span className="sy-notice__label">{label}</span>
      <p className="sy-notice__body">{children}</p>
    </div>
  );
}
