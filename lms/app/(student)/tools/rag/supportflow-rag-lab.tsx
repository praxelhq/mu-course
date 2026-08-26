"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Card } from "@/components/ui";
import {
  SUPPORTFLOW_ARTICLES,
  chunkSupportFlowArticles,
  groundedSupportFlowDraft,
  retrieveSupportFlowChunks,
  type ChunkingStrategy,
  type RetrievalConfig,
  type RetrievalResult,
} from "@/lib/supportflow-rag";

type LabView = "corpus" | "chunking" | "playground" | "compare";
type SupportFlowLabConfig = RetrievalConfig & { strategy: ChunkingStrategy; chunkSize: number };
type RetrievalRun = { query: string; config: SupportFlowLabConfig; results: RetrievalResult[] };
type ComparisonConfig = SupportFlowLabConfig & { label: string; summary: string };
type ComparisonRun = { query: string; a: RetrievalResult[]; b: RetrievalResult[] };

const EXAMPLE_QUERIES = [
  "Can the assistant send a suggested reply automatically?",
  "How do I add live chat to my website and handle messages when nobody is online?",
  "Where should I store an API secret?",
  "How can I discover gaps in our help content?",
];

const DEFAULT_CONFIG: SupportFlowLabConfig = {
  strategy: "paragraph",
  chunkSize: 260,
  topK: 3,
  hybridSearch: false,
};

const COMPARISON_CONFIGS: { a: ComparisonConfig; b: ComparisonConfig } = {
  a: { label: "A · Baseline", summary: "Fixed · 180 chars · Top‑2 · keyword", strategy: "fixed", chunkSize: 180, topK: 2, hybridSearch: false },
  b: { label: "B · Candidate", summary: "Semantic · Top‑5 · hybrid", strategy: "semantic", chunkSize: 320, topK: 5, hybridSearch: true },
};

const COMPARISON_CHUNKS = {
  a: chunkSupportFlowArticles(SUPPORTFLOW_ARTICLES, COMPARISON_CONFIGS.a.strategy, COMPARISON_CONFIGS.a.chunkSize),
  b: chunkSupportFlowArticles(SUPPORTFLOW_ARTICLES, COMPARISON_CONFIGS.b.strategy, COMPARISON_CONFIGS.b.chunkSize),
};

export function SupportFlowRagLab() {
  const [view, setView] = useState<LabView>("corpus");
  const [selectedArticle, setSelectedArticle] = useState(SUPPORTFLOW_ARTICLES[0].id);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [query, setQuery] = useState(EXAMPLE_QUERIES[0]);
  const [retrievalRun, setRetrievalRun] = useState<RetrievalRun | null>(null);
  const [compareQuery, setCompareQuery] = useState(EXAMPLE_QUERIES[1]);
  const [comparisonRun, setComparisonRun] = useState<ComparisonRun | null>(null);

  const allChunks = useMemo(
    () => chunkSupportFlowArticles(SUPPORTFLOW_ARTICLES, config.strategy, config.chunkSize),
    [config.strategy, config.chunkSize],
  );
  const articleChunks = allChunks.filter((chunk) => chunk.articleId === selectedArticle);
  const article = SUPPORTFLOW_ARTICLES.find((item) => item.id === selectedArticle) ?? SUPPORTFLOW_ARTICLES[0];

  const runQuery = () => {
    setRetrievalRun({ query, config: { ...config }, results: retrieveSupportFlowChunks(allChunks, query, config) });
  };

  const runComparison = () => {
    setComparisonRun({
      query: compareQuery,
      a: retrieveSupportFlowChunks(COMPARISON_CHUNKS.a, compareQuery, COMPARISON_CONFIGS.a),
      b: retrieveSupportFlowChunks(COMPARISON_CHUNKS.b, compareQuery, COMPARISON_CONFIGS.b),
    });
  };

  const changeConfig = (next: SupportFlowLabConfig) => setConfig(next);

  return (
    <section id="kodo-lab" style={{ marginTop: "2.5rem", border: "1px solid var(--pine)", background: "var(--cream)" }}>
      <header style={{ padding: "clamp(1.25rem, 4vw, 2.25rem)", background: "var(--pine)", color: "var(--cream)" }}>
        <p style={eyebrow}>Kōdō Academy case · SupportFlow</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))", gap: "1.5rem", alignItems: "end" }}>
          <div>
            <h2 style={{ color: "var(--cream)", fontSize: "clamp(2rem, 5vw, 3.8rem)", lineHeight: 1, margin: ".45rem 0 0" }}>Tune retrieval.<br />See the trade-offs.</h2>
            <p style={{ maxWidth: "42rem", lineHeight: 1.6, margin: "1rem 0 0", color: "var(--cream)" }}>
              You are the PM for SupportFlow’s AI support assistant. Change how its knowledge base is split and searched, then inspect exactly what reaches the answer layer.
            </p>
          </div>
          <div style={{ borderLeft: "4px solid var(--beacon)", paddingLeft: "1rem" }}>
            <strong style={{ display: "block", fontFamily: "var(--font-geist-mono)", color: "var(--beacon)" }}>YOUR RELEASE QUESTION</strong>
            <span style={{ display: "block", marginTop: ".45rem", lineHeight: 1.5 }}>Which configuration returns the smallest sufficient evidence set—not merely the most chunks?</span>
          </div>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", borderBottom: "1px solid var(--sand)", overflowX: "auto" }}>
        {([
          ["corpus", "1 · Corpus"],
          ["chunking", "2 · Chunk"],
          ["playground", "3 · Retrieve"],
          ["compare", "4 · Compare"],
        ] as [LabView, string][]).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} style={{ ...tabStyle, background: view === id ? "var(--ochre)" : "var(--parchment)", color: view === id ? "var(--cream)" : "var(--pine)" }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: "clamp(1rem, 3vw, 2rem)" }}>
        {view === "corpus" && (
          <div style={twoColumn}>
            <div>
              <p style={darkEyebrow}>Knowledge base · {SUPPORTFLOW_ARTICLES.length} articles</p>
              <div style={{ display: "grid", gap: ".5rem", marginTop: ".8rem" }}>
                {SUPPORTFLOW_ARTICLES.map((item) => (
                  <button key={item.id} type="button" onClick={() => setSelectedArticle(item.id)} style={{ ...articleButton, borderColor: selectedArticle === item.id ? "var(--ochre)" : "var(--sand)", background: selectedArticle === item.id ? "var(--cream)" : "var(--parchment)" }}>
                    <span><strong>{item.title}</strong><small style={{ display: "block", color: "var(--clay)", marginTop: ".2rem" }}>{item.category}</small></span>
                    <span aria-hidden="true">→</span>
                  </button>
                ))}
              </div>
            </div>
            <article style={panel}>
              <p style={darkEyebrow}>{article.category} · {article.sourcePath}</p>
              <h3 style={{ fontSize: "1.8rem", margin: ".45rem 0 1rem" }}>{article.title}</h3>
              <div style={{ whiteSpace: "pre-line", lineHeight: 1.65, color: "var(--charcoal)" }}>{article.body.replace(/^##\s+/gm, "")}</div>
            </article>
          </div>
        )}

        {view === "chunking" && (
          <div>
            <div style={twoColumn}>
              <div>
                <p style={darkEyebrow}>Chunking lab</p>
                <h3 style={{ fontSize: "2rem", margin: ".45rem 0 .75rem" }}>Same article. Different boundaries.</h3>
                <p style={{ lineHeight: 1.6, color: "var(--charcoal)" }}>Switch strategies and watch which ideas stay together. A chunk that is too small loses context; one that is too large adds noise.</p>
              </div>
              <ConfigControls config={config} onChange={changeConfig} showRetrieval={false} />
            </div>
            <label style={{ ...fieldLabel, display: "block", marginTop: "1.25rem" }}>
              Article to split
              <select value={selectedArticle} onChange={(event) => setSelectedArticle(event.target.value)} style={inputStyle}>
                {SUPPORTFLOW_ARTICLES.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))", gap: ".75rem", marginTop: "1rem" }}>
              {articleChunks.map((chunk, index) => (
                <article key={chunk.id} style={panel}>
                  <p style={darkEyebrow}>Chunk {index + 1} · {chunk.text.length} characters</p>
                  <h4 style={{ margin: ".5rem 0", fontSize: "1rem" }}>{chunk.heading}</h4>
                  <p style={{ margin: 0, lineHeight: 1.55, color: "var(--charcoal)" }}>{chunk.text}</p>
                </article>
              ))}
            </div>
          </div>
        )}

        {view === "playground" && (
          <div>
            <div style={twoColumn}>
              <div>
                <p style={darkEyebrow}>RAG playground</p>
                <h3 style={{ fontSize: "2rem", margin: ".45rem 0 .75rem" }}>Ask once. Tune twice.</h3>
                <p style={{ lineHeight: 1.6, color: "var(--charcoal)" }}>Run the same question with different settings. Scores are relative classroom signals; inspect the passage before trusting the draft.</p>
              </div>
              <ConfigControls config={config} onChange={changeConfig} showRetrieval />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: ".65rem", marginTop: "1.25rem" }}>
              <label style={fieldLabel}>Question<span className="sr-only"> for SupportFlow</span><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") runQuery(); }} style={inputStyle} /></label>
              <button type="button" onClick={runQuery} disabled={!query.trim()} style={{ ...primaryButton, alignSelf: "end", opacity: query.trim() ? 1 : .5 }}>Retrieve</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: ".45rem", marginTop: ".65rem" }}>
              {EXAMPLE_QUERIES.map((example) => <button key={example} type="button" onClick={() => setQuery(example)} style={chipButton}>{example}</button>)}
            </div>
            {retrievalRun && <RetrievalOutput run={retrievalRun} />}
          </div>
        )}

        {view === "compare" && (
          <div>
            <p style={darkEyebrow}>Configuration showdown</p>
            <h3 style={{ fontSize: "2rem", margin: ".45rem 0 .75rem" }}>One question. Two retrieval policies.</h3>
            <p style={{ maxWidth: "52rem", lineHeight: 1.6, color: "var(--charcoal)" }}>Baseline A uses small fixed windows and keyword search. Candidate B preserves semantic sections, blends concepts with keywords, and retrieves more evidence.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: ".65rem", marginTop: "1.25rem" }}>
              <label style={fieldLabel}>Question<input value={compareQuery} onChange={(event) => setCompareQuery(event.target.value)} style={inputStyle} /></label>
              <button type="button" onClick={runComparison} disabled={!compareQuery.trim()} style={{ ...primaryButton, alignSelf: "end" }}>Run A/B</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(19rem, 1fr))", gap: "1rem", marginTop: "1rem" }}>
              <ComparisonColumn config={COMPARISON_CONFIGS.a} results={comparisonRun?.a ?? null} />
              <ComparisonColumn config={COMPARISON_CONFIGS.b} results={comparisonRun?.b ?? null} />
            </div>
            {comparisonRun && (
              <div style={{ marginTop: "1rem", borderLeft: "4px solid var(--ochre)", padding: "1rem", background: "var(--parchment)" }}>
                <strong>Results for “{comparisonRun.query}”. PM decision:</strong> Which side contains enough evidence to answer, which adds avoidable noise, and what would you measure before shipping? There is no universally correct configuration.
              </div>
            )}
          </div>
        )}
      </div>
      <footer style={{ padding: "1rem 1.5rem", borderTop: "1px solid var(--sand)", color: "var(--clay)", fontSize: ".78rem", lineHeight: 1.5 }}>
        Adapted from Kōdō Academy’s SupportFlow RAG module. This deterministic classroom engine makes retrieval decisions observable; the next PraxelPay lab uses real browser embeddings.
      </footer>
    </section>
  );
}

function ConfigControls({ config, onChange, showRetrieval }: { config: SupportFlowLabConfig; onChange: (config: SupportFlowLabConfig) => void; showRetrieval: boolean }) {
  return (
    <div style={{ ...panel, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: ".85rem" }}>
      <label style={fieldLabel}>Chunking<select value={config.strategy} onChange={(event) => onChange({ ...config, strategy: event.target.value as ChunkingStrategy })} style={inputStyle}><option value="fixed">Fixed</option><option value="paragraph">Paragraph</option><option value="semantic">Semantic sections</option></select></label>
      <label style={fieldLabel}>Fixed size<input type="range" min="140" max="520" step="20" value={config.chunkSize} disabled={config.strategy !== "fixed"} onChange={(event) => onChange({ ...config, chunkSize: Number(event.target.value) })} style={{ width: "100%", marginTop: ".8rem" }} /><span style={{ color: "var(--clay)" }}>{config.chunkSize} characters</span></label>
      {showRetrieval && <><label style={fieldLabel}>Top‑K<input type="range" min="1" max="8" value={config.topK} onChange={(event) => onChange({ ...config, topK: Number(event.target.value) })} style={{ width: "100%", marginTop: ".8rem" }} /><span style={{ color: "var(--clay)" }}>{config.topK} chunks</span></label><label style={{ ...fieldLabel, display: "flex", gap: ".65rem", alignItems: "center", marginTop: "1.15rem" }}><input type="checkbox" checked={config.hybridSearch} onChange={(event) => onChange({ ...config, hybridSearch: event.target.checked })} style={{ width: "1.2rem", height: "1.2rem" }} />Blend keyword + concepts</label></>}
    </div>
  );
}

function RetrievalOutput({ run }: { run: RetrievalRun }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(20rem, 1fr))", gap: "1rem", marginTop: "1.25rem" }}>
      <div>
        <p style={darkEyebrow}>Retrieved chunks · inspect before answer</p>
        <p style={{ color: "var(--clay)", fontSize: ".8rem", lineHeight: 1.5 }}>Run: “{run.query}” · {run.config.strategy} · Top‑{run.config.topK} · {run.config.hybridSearch ? "hybrid" : "keyword"}</p>
        <div style={{ display: "grid", gap: ".65rem", marginTop: ".65rem" }}>{run.results.map((result, index) => <ResultCard key={result.id} result={result} index={index} />)}</div>
      </div>
      <article style={{ ...panel, background: "var(--pine)", color: "var(--cream)", alignSelf: "start" }}>
        <p style={{ ...eyebrow, color: "var(--beacon)" }}>Grounded draft · deterministic preview</p>
        <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", lineHeight: 1.65, margin: ".75rem 0 0", color: "var(--cream)" }}>{groundedSupportFlowDraft(run.query, run.results)}</pre>
      </article>
    </div>
  );
}

function ResultCard({ result, index }: { result: RetrievalResult; index: number }) {
  return (
    <article style={panel}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}><p style={darkEyebrow}>#{index + 1} · {result.title}</p><strong style={{ fontFamily: "var(--font-geist-mono)", color: "var(--ochre)" }}>{Math.round(result.score * 100)}%</strong></div>
      <h4 style={{ margin: ".45rem 0", fontSize: "1rem" }}>{result.heading}</h4>
      <p style={{ margin: 0, lineHeight: 1.55, color: "var(--charcoal)" }}>{result.text}</p>
      <p style={{ margin: ".65rem 0 0", color: "var(--clay)", fontSize: ".75rem" }}>Keyword {Math.round(result.keywordScore * 100)}% · Concept {Math.round(result.conceptScore * 100)}% · matches: {result.matchedTerms.join(", ") || "none"}</p>
    </article>
  );
}

function ComparisonColumn({ config, results }: { config: ComparisonConfig; results: RetrievalResult[] | null }) {
  return <Card style={{ padding: "1rem" }}><p style={darkEyebrow}>{config.label}</p><h4 style={{ fontSize: "1.15rem", margin: ".45rem 0 1rem" }}>{config.summary}</h4>{results ? <div style={{ display: "grid", gap: ".6rem" }}>{results.map((result, index) => <ResultCard key={result.id} result={result} index={index} />)}</div> : <p style={{ color: "var(--clay)", lineHeight: 1.5 }}>Run the comparison to see ranked evidence.</p>}</Card>;
}

const eyebrow: CSSProperties = { fontFamily: "var(--font-geist-mono)", fontSize: ".68rem", letterSpacing: ".11em", textTransform: "uppercase", margin: 0, color: "var(--beacon)" };
const darkEyebrow: CSSProperties = { ...eyebrow, color: "var(--ochre)" };
const twoColumn: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))", gap: "1rem", alignItems: "start" };
const panel: CSSProperties = { border: "1px solid var(--sand)", padding: "1rem", background: "var(--parchment)" };
const tabStyle: CSSProperties = { minWidth: "8rem", border: 0, borderRight: "1px solid var(--sand)", padding: "1rem .6rem", fontFamily: "var(--font-geist-mono)", fontSize: ".68rem", letterSpacing: ".07em", textTransform: "uppercase", cursor: "pointer" };
const articleButton: CSSProperties = { width: "100%", display: "flex", justifyContent: "space-between", textAlign: "left", border: "1px solid var(--sand)", padding: ".85rem", color: "var(--pine)", cursor: "pointer" };
const fieldLabel: CSSProperties = { fontFamily: "var(--font-geist-mono)", fontSize: ".68rem", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--pine)" };
const inputStyle: CSSProperties = { display: "block", width: "100%", minHeight: "2.75rem", marginTop: ".35rem", padding: ".6rem", border: "1px solid var(--sand)", borderRadius: 0, background: "var(--cream)", color: "var(--pine)", fontFamily: "var(--font-geist)", fontSize: ".9rem" };
const primaryButton: CSSProperties = { minHeight: "2.75rem", border: "1px solid var(--pine)", background: "var(--pine)", color: "var(--cream)", padding: ".65rem 1rem", fontFamily: "var(--font-geist-mono)", fontSize: ".68rem", letterSpacing: ".07em", textTransform: "uppercase", cursor: "pointer" };
const chipButton: CSSProperties = { border: "1px solid var(--sand)", background: "var(--parchment)", color: "var(--pine)", padding: ".45rem .6rem", textAlign: "left", fontSize: ".75rem", cursor: "pointer" };
