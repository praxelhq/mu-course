"use client";

import { useState } from "react";
import { Card } from "@/components/ui";

// Shown when an interview is on record but unfinished. There is no
// transactional email here, so the student gets a prefilled mailto plus the
// same text to copy — some browsers have no mail client wired up.

export function InterviewEscalation({
  href,
  body,
  subject,
}: {
  href: string;
  body: string;
  subject: string;
}) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  return (
    <Card style={{ marginBottom: "1.5rem" }}>
      <p
        style={{
          margin: 0,
          fontFamily: "var(--font-geist-mono)",
          fontSize: "0.75rem",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--clay)",
        }}
      >
        Interview cut off?
      </p>
      <p style={{ margin: "0.5rem 0 1rem", color: "var(--charcoal)", lineHeight: 1.6 }}>
        If your call dropped before you finished, mail the team and they will reopen it. The
        message below already has your interview reference and how far you got.
      </p>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <a
          href={href}
          style={{
            border: "1px solid var(--pine)",
            color: "var(--pine)",
            padding: "0.5rem 1rem",
            textDecoration: "none",
            fontSize: "0.875rem",
          }}
        >
          Open in mail
        </a>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(`Subject: ${subject}\n\n${body}`)
              .then(() => setCopied(true))
              .catch(() => setCopied(false));
          }}
          style={{
            border: "1px solid var(--sand)",
            background: "transparent",
            color: "var(--charcoal)",
            padding: "0.5rem 1rem",
            cursor: "pointer",
            fontSize: "0.875rem",
          }}
        >
          {copied ? "Copied" : "Copy the message"}
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            border: "none",
            background: "transparent",
            color: "var(--clay)",
            padding: "0.5rem 0",
            cursor: "pointer",
            fontSize: "0.875rem",
            textDecoration: "underline",
          }}
        >
          {open ? "Hide it" : "Show it"}
        </button>
      </div>
      {open && (
        <pre
          style={{
            marginTop: "1rem",
            whiteSpace: "pre-wrap",
            fontFamily: "var(--font-geist-mono)",
            fontSize: "0.8125rem",
            lineHeight: 1.55,
            color: "var(--charcoal)",
            borderTop: "1px solid var(--sand)",
            paddingTop: "1rem",
          }}
        >
          {body}
        </pre>
      )}
    </Card>
  );
}
