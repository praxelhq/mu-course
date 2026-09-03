import Link from "next/link";

// Closing screen. Sends the student straight to their result, which polls
// while the grading queue finishes.

export const dynamic = "force-dynamic";

export default function InterviewDonePage() {
  return (
    <main style={{ minHeight: "100dvh", background: "var(--parchment)" }}>
      <header
        style={{
          height: "3.5rem",
          background: "var(--pine)",
          color: "var(--parchment)",
          display: "flex",
          alignItems: "center",
          padding: "0 1.25rem",
        }}
      >
        <span style={{ fontFamily: "var(--font-fraunces)", fontSize: "1.125rem" }}>
          Pra<span style={{ color: "var(--ochre)" }}>x</span>el
          <span
            style={{
              fontFamily: "var(--font-geist-mono)",
              fontSize: "0.6875rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--sand)",
              opacity: 0.75,
              marginLeft: "0.5rem",
            }}
          >
            Interview
          </span>
        </span>
      </header>

      <div style={{ maxWidth: "40rem", margin: "0 auto", padding: "5rem 1.5rem" }}>
        <p
          style={{
            fontFamily: "var(--font-geist-mono)",
            fontSize: "0.6875rem",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--ochre)",
            margin: 0,
          }}
        >
          Interview complete
        </p>
        <h1
          style={{
            fontFamily: "var(--font-fraunces)",
            fontSize: "clamp(2.25rem,6vw,3.25rem)",
            lineHeight: 1.05,
            margin: "1rem 0 0",
          }}
        >
          Thank you.
        </h1>
        <p style={{ marginTop: "1.5rem", color: "var(--charcoal)", fontSize: "1.0625rem", lineHeight: 1.65 }}>
          Your interview is recorded and is being marked now. Your score and the feedback
          behind it appear on your result page in about a minute.
        </p>
        <p style={{ marginTop: "1rem", color: "var(--charcoal)", lineHeight: 1.65 }}>
          If something went wrong and you could not finish, you can ask for a fresh link from
          your interview page.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "2rem" }}>
          <Link
            href="/interview/result"
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 44,
              padding: "0 1.25rem",
              background: "var(--pine)",
              color: "var(--parchment)",
              border: "1px solid var(--pine)",
              textDecoration: "none",
            }}
          >
            See your result
          </Link>
          <Link
            href="/interview"
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 44,
              padding: "0 1.25rem",
              border: "1px solid var(--pine)",
              color: "var(--pine)",
              textDecoration: "none",
            }}
          >
            Back to your interview page
          </Link>
        </div>
      </div>
    </main>
  );
}
