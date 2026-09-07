const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  fontSize: "0.6875rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

export function RouteLoading({ label }: { label: string }) {
  return (
    <main
      aria-busy="true"
      aria-labelledby="route-loading-label"
      style={{ maxWidth: "72rem", margin: "0 auto", padding: "3rem 2rem" }}
    >
      <p id="route-loading-label" role="status" style={{ ...mono, color: "var(--clay)" }}>
        {label}
      </p>
      <div aria-hidden="true" style={{ display: "grid", gap: "1rem", marginTop: "1.5rem" }}>
        {["36%", "78%", "100%", "100%"].map((width, index) => (
          <div
            key={`${width}-${index}`}
            style={{
              width,
              minHeight: index < 2 ? "1.25rem" : "5.5rem",
              border: "1px solid var(--sand)",
              background: "var(--parchment)",
            }}
          />
        ))}
      </div>
    </main>
  );
}
