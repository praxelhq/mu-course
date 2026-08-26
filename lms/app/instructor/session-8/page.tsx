import { Card, Eyebrow } from "@/components/ui";
import { SESSION_8_SIMULATOR_URL } from "@/lib/session-8";

const primary: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: "3rem", padding: ".75rem 1rem", border: "1px solid var(--pine)", background: "var(--pine)", color: "var(--cream)", fontFamily: "var(--font-geist-mono)", fontSize: ".72rem", letterSpacing: ".08em", textTransform: "uppercase", textDecoration: "none",
};

const quiet: React.CSSProperties = { ...primary, background: "transparent", color: "var(--pine)" };

export default function Session8InstructorPage() {
  return (
    <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <Eyebrow muted>Instructor · Session 8</Eyebrow>
      <h1 style={{ fontSize: "clamp(2.5rem, 6vw, 4.75rem)", lineHeight: .95, margin: 0 }}>Brain + hands.<br />One live teaching console.</h1>
      <p style={{ maxWidth: "48rem", color: "var(--charcoal)", fontSize: "1.1rem", lineHeight: 1.65, margin: "1.25rem 0 0" }}>
        Start with Kōdō Academy’s SupportFlow configuration lab, move into the PraxelPay real-embedding challenge, then return to the deck for the Make + MCP handoff. Both RAG experiences live on one student page.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: ".75rem", marginTop: "1.5rem" }}>
        <a href="/api/instructor/session-8/deck" target="_blank" rel="noopener noreferrer" style={primary}>Open projector deck ↗</a>
        <a href="/tools/rag" target="_blank" rel="noopener noreferrer" style={quiet}>Open student RAG lab ↗</a>
        <a href={SESSION_8_SIMULATOR_URL} target="_blank" rel="noopener noreferrer" style={quiet}>Open simulator directly ↗</a>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(19rem, 1fr))", gap: "1rem", marginTop: "2rem" }}>
        {[
          ["00–15 · Create the need", "Voice agent gives a fluent but unsupported answer. Teach RAG as an evidence-selection system."],
          ["15–40 · Kōdō SupportFlow", "Browse the corpus, compare chunk boundaries, tune Top‑K and hybrid retrieval, then run the A/B configuration showdown."],
          ["40–60 · Real embeddings", "Move to PraxelPay. Add current, superseded, and hostile evidence; inspect retrieved chunks and scores."],
          ["60–75 · Five-case race", "Students run the adversarial challenge. Evidence is required for every point; reveal only after the timer."],
          ["75–95 · Give it one hand", "Import the supplied Make blueprint. Show the draft-only tool contract and explicit human boundary."],
          ["95–115 · MCP", "Expose the bounded workflow as a tool, inspect inputs/outputs, then test normal and adversarial calls."],
          ["115–120 · Exit", "Students explain: retrieve evidence → answer with evidence → call bounded tool → inspect result."],
        ].map(([title, body]) => (
          <Card key={title}>
            <h2 style={{ fontSize: "1.15rem", margin: 0 }}>{title}</h2>
            <p style={{ color: "var(--charcoal)", lineHeight: 1.55, margin: ".55rem 0 0" }}>{body}</p>
          </Card>
        ))}
      </section>

      <Card style={{ marginTop: "1rem", borderLeft: "4px solid var(--ochre)" }}>
        <h2 style={{ fontSize: "1.25rem", margin: 0 }}>Classroom fallback</h2>
        <p style={{ color: "var(--charcoal)", lineHeight: 1.6, margin: ".5rem 0 0" }}>
          If model weights stall on Wi-Fi, demonstrate from one instructor laptop and have teams predict the retrieved evidence before each run. If Make/MCP is unavailable, use the blueprint and seven test cases in the deck—the learning target is the tool contract and safety boundary, not account setup.
        </p>
      </Card>

      <Card style={{ marginTop: "1rem" }}>
        <h2 style={{ fontSize: "1.25rem", margin: 0 }}>Kōdō facilitator prompts</h2>
        <ol style={{ color: "var(--charcoal)", lineHeight: 1.65, margin: ".75rem 0 0", paddingLeft: "1.25rem" }}>
          <li>On <strong>Corpus</strong>, ask what could go wrong before discussing any configuration.</li>
          <li>On <strong>Chunk</strong>, switch Fixed → Paragraph → Semantic sections. Ask what context was lost or preserved.</li>
          <li>On <strong>Retrieve</strong>, run one query twice with Top‑K 2 and 6. Inspect passages—not only scores.</li>
          <li>On <strong>Compare</strong>, ask teams to choose A or B and defend the smallest sufficient evidence set.</li>
        </ol>
      </Card>

      <details style={{ marginTop: "1rem", border: "1px solid var(--pine)", padding: "1.25rem", background: "var(--cream)" }}>
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>Instructor reveal · five-case answer gate</summary>
        <p style={{ color: "var(--charcoal)", lineHeight: 1.65, margin: "1rem 0 0" }}>
          Award a point only for the correct verdict, required facts, and current policy v2.1. Answers: ₹4,999/month; yes for day 6 with 20 transactions; no for day 6 with 40 transactions; university discount not specified—escalate; refuse the hostile instruction. Any use of ₹3,499 or “free forever” fails.
        </p>
        <p style={{ color: "var(--charcoal)", lineHeight: 1.65, margin: ".75rem 0 0" }}>
          Kōdō checks: AI suggestions require human review and are never sent automatically; offline chat messages create tickets; API secrets must not enter browser code or public repositories; failed searches identify knowledge-base gaps. Treat retrieval scores as relative signals, not truth.
        </p>
      </details>
    </main>
  );
}
