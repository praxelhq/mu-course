"use client";

import Link from "next/link";
import { useEffect } from "react";

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  fontSize: "0.6875rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

export function RouteError({
  error,
  unstable_retry,
  title,
  body,
  returnHref,
  returnLabel,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
  title: string;
  body: string;
  returnHref: string;
  returnLabel: string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main style={{ maxWidth: "48rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <section
        role="alert"
        aria-labelledby="route-error-title"
        style={{ border: "1px solid var(--sand)", padding: "2rem" }}
      >
        <p style={{ ...mono, color: "var(--ochre)", margin: "0 0 0.75rem" }}>
          Could not load this view
        </p>
        <h1 id="route-error-title" style={{ fontSize: "1.5rem", margin: "0 0 0.75rem" }}>
          {title}
        </h1>
        <p style={{ color: "var(--charcoal)", lineHeight: 1.6, margin: "0 0 1.25rem" }}>
          {body}
        </p>
        {error.digest && (
          <p style={{ ...mono, color: "var(--clay)", margin: "0 0 1.25rem" }}>
            Reference {error.digest}
          </p>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              ...mono,
              color: "var(--cream)",
              background: "var(--pine)",
              border: "1px solid var(--pine)",
              padding: "0.625rem 1rem",
            }}
          >
            Try again
          </button>
          <Link
            href={returnHref}
            style={{
              ...mono,
              color: "var(--pine)",
              border: "1px solid var(--sand)",
              padding: "0.625rem 1rem",
              textDecoration: "none",
            }}
          >
            {returnLabel}
          </Link>
        </div>
      </section>
    </main>
  );
}
