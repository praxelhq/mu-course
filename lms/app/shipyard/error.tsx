"use client";

import Link from "next/link";
import { useEffect } from "react";

// System copy states what happened and what to do next. No apology, no
// exclamation mark, and one fact a student actually needs: their work is safe.
export default function ShipyardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="sy-route" role="alert">
      <p className="sy-eyebrow">This view did not load</p>
      <h1 className="sy-title" style={{ fontSize: "1.5rem", margin: "0.75rem 0 0.75rem" }}>
        Your submissions and gate states are untouched.
      </h1>
      <p className="sy-prose">
        Nothing was submitted or cleared by this screen. Retry to fetch the current
        spine; if it fails twice, tell your instructor and include the reference below.
      </p>
      {error.digest && (
        <p className="sy-eyebrow" style={{ marginTop: "1rem" }}>
          Reference {error.digest}
        </p>
      )}
      <div className="sy-actions" style={{ marginTop: "2rem" }}>
        <button type="button" className="sy-btn" onClick={() => unstable_retry()}>
          Try again
        </button>
        <Link href="/shipyard" className="sy-btn sy-btn--quiet" style={{ textDecoration: "none" }}>
          Back to the spine
        </Link>
      </div>
    </main>
  );
}
