import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Not on roster · The Forge",
};

// Landing page for authenticated Google accounts that aren't on the course
// roster. The proxy redirects here after flagging the Clerk account.
export default function NotOnRosterPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "4rem 2rem",
        maxWidth: "32rem",
        margin: "0 auto",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-geist-mono)",
          fontSize: "0.75rem",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--ochre)",
          marginBottom: "1rem",
        }}
      >
        The Forge
      </p>
      <h1 style={{ fontSize: "2.25rem", lineHeight: 1.15, margin: "0 0 1.5rem" }}>
        Not on the roster
      </h1>
      <hr style={{ margin: "0 0 1.5rem" }} />
      <p
        style={{
          fontSize: "1.125rem",
          lineHeight: 1.6,
          color: "var(--charcoal)",
          margin: 0,
        }}
      >
        This Google account isn&apos;t on the course roster. Contact your
        instructor.
      </p>
    </main>
  );
}
