// Quieter than the Forge's route loader: one label and three hairline bars,
// no pulsing, no spinner. The page it replaces is mostly rules anyway.
export default function Loading() {
  return (
    <main className="sy-main" aria-busy="true">
      <p className="sy-eyebrow" role="status">
        Reading your spine
      </p>
      <div className="sy-skeleton" aria-hidden="true">
        {["38%", "100%", "100%"].map((width, i) => (
          <div
            key={width + i}
            className="sy-skeleton__bar"
            style={{ width, minHeight: i === 0 ? "1.5rem" : "6rem" }}
          />
        ))}
      </div>
    </main>
  );
}
