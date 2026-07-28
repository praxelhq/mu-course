export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "4rem 2rem",
        maxWidth: "48rem",
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
        Praxel LMS
      </p>
      <h1
        style={{
          fontSize: "3.5rem",
          lineHeight: 1.1,
          margin: "0 0 1.5rem",
        }}
      >
        The Forge
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
        Where the work gets made. One course, eight sections, and everything a
        student ships — assignments, interviews, quizzes, and the gallery —
        under one roof.
      </p>
    </main>
  );
}
