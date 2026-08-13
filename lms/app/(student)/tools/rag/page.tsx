import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * The RAG simulator runs as its own Railway service rather than inside this app.
 * It carries transformers.js (WASM), pdf.js and LangChain, and downloads model
 * weights in the browser — keeping it separate means a fault in a teaching tool
 * can never take the LMS down for a cohort mid-session.
 *
 * This page is the roster-gated way in: learners reach it from the LMS, and the
 * link opens in a new tab so the simulator gets the full viewport it needs.
 */
const SIMULATOR_URL =
  process.env.NEXT_PUBLIC_RAG_SIMULATOR_URL ??
  "https://rag-simulator-production.up.railway.app/experiment";

const STEPS: { title: string; body: string }[] = [
  {
    title: "1 · Split",
    body: "Drop in your own PDFs or notes. Watch the document break into chunks, and move chunk size and overlap to see the pieces change shape.",
  },
  {
    title: "2 · Embed",
    body: "Pick one of eight embedding models. Each shows its vector size, pooling strategy and whether it needs query or passage prefixes — the properties that quietly decide retrieval quality.",
  },
  {
    title: "3 · Retrieve",
    body: "Ask a question. Every chunk is ranked and scored, with a cut-off line showing exactly what gets discarded. Change Top-K, the similarity metric, or the score threshold and watch the line move.",
  },
  {
    title: "4 · Generate",
    body: "The model answers using only the chunks above the line. Starve it of context and watch a capable model fail — the failure is retrieval, not the LLM.",
  },
];

export default async function RagSimulatorPage() {
  await requireUser();

  return (
    <main
      style={{
        maxWidth: "56rem",
        margin: "0 auto",
        padding: "clamp(1.25rem, 5vw, 3rem)",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-geist-mono)",
          fontSize: "0.7rem",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--clay)",
          margin: 0,
        }}
      >
        Session tool
      </p>
      <h1
        style={{
          fontFamily: "var(--font-fraunces)",
          fontSize: "clamp(2rem, 6vw, 3rem)",
          lineHeight: 1.05,
          margin: "0.5rem 0 1rem",
        }}
      >
        RAG Simulator
      </h1>
      <p style={{ lineHeight: 1.6, margin: "0 0 1.5rem", maxWidth: "42rem" }}>
        Take a document apart the way a RAG system does, then put every knob in
        the pipeline in your hands. Nothing you upload leaves your machine — the
        embedding models run inside your browser.
      </p>

      <a
        href={SIMULATOR_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-block",
          padding: "0.85rem 1.5rem",
          background: "var(--pine)",
          color: "var(--cream)",
          border: "1px solid var(--pine)",
          fontFamily: "var(--font-geist-mono)",
          fontSize: "0.8rem",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          textDecoration: "none",
        }}
      >
        Open the simulator →
      </a>
      <p
        style={{
          fontSize: "0.8rem",
          color: "var(--clay)",
          margin: "0.75rem 0 2.5rem",
        }}
      >
        Opens in a new tab. Use a laptop — the tool needs a desktop browser.
      </p>

      <section style={{ display: "grid", gap: "1px", background: "var(--sand)" }}>
        {STEPS.map((step) => (
          <div key={step.title} style={{ background: "var(--parchment)", padding: "1.25rem" }}>
            <h2
              style={{
                fontFamily: "var(--font-geist-mono)",
                fontSize: "0.75rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--ochre)",
                margin: "0 0 0.5rem",
              }}
            >
              {step.title}
            </h2>
            <p style={{ margin: 0, lineHeight: 1.6 }}>{step.body}</p>
          </div>
        ))}
      </section>

      <p
        style={{
          fontSize: "0.8rem",
          color: "var(--clay)",
          marginTop: "2rem",
          lineHeight: 1.6,
        }}
      >
        First use of an embedding model downloads its weights (23–118 MB) and can
        take a few seconds. After that it is cached and instant.
      </p>
    </main>
  );
}
