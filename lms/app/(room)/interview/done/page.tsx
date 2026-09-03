import Link from "next/link";

// Closing screen. Deliberately says nothing about how it went: results reach
// students only after instructor review, never from the interview itself.

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
          Your interview is recorded. Grading takes a while, and results are shared by your
          instructor after review — nothing appears here.
        </p>
        <p style={{ marginTop: "1rem", color: "var(--charcoal)", lineHeight: 1.65 }}>
          If something went wrong and you could not finish, you can ask for a fresh link from
          your interview page.
        </p>
        <Link
          href="/interview"
          style={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: 44,
            padding: "0 1.25rem",
            marginTop: "2rem",
            border: "1px solid var(--pine)",
            color: "var(--pine)",
            textDecoration: "none",
          }}
        >
          Back to your interview page
        </Link>
      </div>
    </main>
  );
}
