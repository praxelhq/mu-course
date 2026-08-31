"use client";

import { useState } from "react";
import { DOCUMENTS, DOC, QUESTIONS, NEVER_INDEX, UNTRUSTED, OUT_OF_DATE, type DocTone } from "@/lib/content/documents";
import { askBrain } from "@/lib/engine/brain";
import type { Board } from "@/lib/engine/types";
import { Card, Pill } from "@/components/ui";
import { Briefing, Page } from "./shell";

const TONE_STYLE: Record<DocTone, { bg: string; fg: string }> = {
  current: { bg: "var(--flow-soft)", fg: "var(--flow-ink)" },
  superseded: { bg: "var(--gold-soft)", fg: "var(--gold-ink)" },
  confidential: { bg: "var(--alert-soft)", fg: "var(--alert)" },
  untrusted: { bg: "var(--untrusted-soft)", fg: "var(--untrusted)" },
  plain: { bg: "var(--paper-sunk)", fg: "var(--ink-4)" },
};

const KIND_STYLE: Record<string, { bg: string; fg: string }> = {
  DOC: { bg: "var(--ai-soft)", fg: "var(--ai)" },
  XLS: { bg: "var(--flow-soft)", fg: "var(--flow-ink)" },
  PDF: { bg: "var(--alert-soft)", fg: "var(--alert)" },
  TXT: { bg: "var(--paper-sunk)", fg: "var(--ink-3)" },
  EML: { bg: "var(--gold-soft)", fg: "var(--gold-ink)" },
};

const VERDICT: Record<string, { bg: string; fg: string; label: string }> = {
  right: { bg: "var(--flow-soft)", fg: "var(--flow-ink)", label: "It answered, and it is right" },
  wrong: { bg: "var(--alert-soft)", fg: "var(--alert)", label: "It answered, and it is wrong" },
  leaked: { bg: "var(--alert-soft)", fg: "var(--alert)", label: "It answered, and it should not have" },
  fooled: { bg: "var(--untrusted-soft)", fg: "var(--untrusted)", label: "It believed somebody outside the company" },
  refused: { bg: "var(--paper-sunk)", fg: "var(--ink-3)", label: "It refused, correctly" },
};

export function Brain({ board, update }: { board: Board; update: (fn: (b: Board) => Board) => void }) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  const [asked, setAsked] = useState<string>(QUESTIONS[0].id);

  const indexed = board.indexed;
  const has = (id: string) => indexed.includes(id);

  const toggle = (id: string) =>
    update((b) => ({
      ...b,
      indexed: b.indexed.includes(id) ? b.indexed.filter((d) => d !== id) : [...b.indexed, id],
    }));

  const ask = (id: string) => {
    setAsked(id);
    update((b) => (b.asked.includes(id) ? b : { ...b, asked: [...b.asked, id] }));
  };

  const outcome = askBrain(indexed, asked);
  const source = outcome.sourceId ? DOC.get(outcome.sourceId) : null;
  const v = VERDICT[outcome.verdict];

  // Live conflict detection. This is the whole lesson, delivered while they
  // build rather than afterwards.
  const warnings: { head: string; text: string; bg: string; fg: string }[] = [];
  if (has("allergen26") && has("allergen24")) {
    warnings.push({
      head: "Two documents in here answer the same question differently",
      text: "Your allergen guide from 2026 and your allergen guide from 2024 both describe the paneer kathi roll, and they disagree. The brain has no way to know which one you meant, so it will pick whichever reads more relevant and say it with total confidence.",
      bg: "var(--gold-soft)", fg: "var(--gold-ink)",
    });
  }
  const priv = NEVER_INDEX.filter(has);
  if (priv.length > 0) {
    warnings.push({
      head: "You have taught it something it must never repeat",
      text: `Anything in the index can come back out in an answer, to anybody who asks. ${priv.map((id) => DOC.get(id)?.title).join(" and ")} ${priv.length > 1 ? "are" : "is"} now answerable by a store manager with a phone.`,
      bg: "var(--alert-soft)", fg: "var(--alert)",
    });
  }
  if (has("complaint") && !has("refunds")) {
    warnings.push({
      head: "A customer is now one of your sources",
      text: "Complaint 4471 contains a sentence claiming refunds are automatic. Nobody at Bharat Bites wrote it — a customer did, to get a refund. Without the real policy in here to outrank it, the brain will repeat it as fact.",
      bg: "var(--untrusted-soft)", fg: "var(--untrusted)",
    });
  }
  const stale = OUT_OF_DATE.filter(has);
  if (stale.length > 0 && !(has("allergen26") && has("allergen24"))) {
    warnings.push({
      head: "Something in here describes a company that does not exist",
      text: `${stale.map((id) => DOC.get(id)?.title).join(" and ")} was never retired, so it reads exactly like a live document. The brain cannot tell the difference between a policy and a draft of one.`,
      bg: "var(--gold-soft)", fg: "var(--gold-ink)",
    });
  }

  const risky = [...NEVER_INDEX, ...UNTRUSTED].filter(has).length;
  const doc = reading ? DOC.get(reading) : null;

  return (
    <>
      <Briefing
        speakerId="arun"
        pending={[
          { text: "Read what is on the shelf", done: Boolean(reading) || indexed.length > 0 },
          { text: "Decide what it may read", done: indexed.length > 0 },
          { text: `Tested ${board.asked.length} of ${QUESTIONS.length} questions`, done: board.asked.length >= QUESTIONS.length },
        ]}
      >
        “Everything this company knows is on that shelf. Some of it is right, some of it was right two years ago, and one of those files has everybody&rsquo;s salary in it. Put into the brain only what you would be happy for a store manager to read aloud to a customer.”
      </Briefing>

      <Page wide>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 22, flexWrap: "wrap", marginBottom: 18 }}>
          <div>
            <h1 className="serif" style={{ fontSize: "clamp(28px, 4vw, 38px)", lineHeight: 1.08, letterSpacing: "-.015em" }}>
              Build the company brain a memory it deserves.
            </h1>
            <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--ink-3)", marginTop: 7, maxWidth: 720 }}>
              Drag a document onto the index to teach it, and drag it back to take it away. It can only ever be as truthful as the pile you hand it, and it will not tell you when the pile disagrees with itself.
            </p>
          </div>
          <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
            <Card style={{ padding: "14px 18px", boxShadow: "var(--lift-1)", minWidth: 128 }}>
              <div className="display num" style={{ fontSize: 25, fontWeight: 700, color: "var(--ai)", lineHeight: 1 }}>{indexed.length} / 120</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-4)", marginTop: 6, lineHeight: 1.35 }}>documents you have taught it</div>
            </Card>
            <Card style={{ padding: "14px 18px", boxShadow: "var(--lift-1)", minWidth: 128 }}>
              <div className="display num" style={{ fontSize: 25, fontWeight: 700, color: risky > 0 ? "var(--alert)" : "var(--flow)", lineHeight: 1 }}>{risky}</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-4)", marginTop: 6, lineHeight: 1.35 }}>in here you would not read aloud</div>
            </Card>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 340px) minmax(0, 1fr) minmax(0, 380px)", gap: 14, alignItems: "start" }}>

          {/* shelf */}
          <div style={{ background: "var(--paper-sunk)", borderRadius: "var(--r-xl)", padding: 16, display: "flex", flexDirection: "column", maxHeight: "76vh", position: "sticky", top: 16 }}>
            <h2 className="display" style={{ fontSize: 16.5, fontWeight: 700 }}>Everything the company has</h2>
            <p style={{ fontSize: 13, color: "var(--ink-4)", margin: "4px 0 13px" }}>Twelve of a hundred and twenty. Click a title to read it before you decide.</p>
            <div className="scroll" style={{ flexGrow: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, paddingRight: 4 }}>
              {DOCUMENTS.map((d) => {
                const tone = TONE_STYLE[d.tone];
                const kind = KIND_STYLE[d.kind];
                const inIndex = has(d.id);
                return (
                  <div
                    key={d.id}
                    className="lift"
                    draggable
                    onDragStart={() => setDragging(d.id)}
                    onDragEnd={() => setDragging(null)}
                    style={{
                      background: "var(--surface)", borderRadius: "var(--r-md)", boxShadow: "var(--lift-1)",
                      padding: 12, display: "flex", gap: 11, alignItems: "flex-start", cursor: "grab",
                      opacity: inIndex ? 0.45 : 1,
                    }}
                  >
                    <span style={{ width: 30, height: 34, borderRadius: 5, background: kind.bg, color: kind.fg, display: "grid", placeItems: "center", flexShrink: 0, fontSize: 9, fontWeight: 700, fontFamily: "var(--font-display)" }}>{d.kind}</span>
                    <div style={{ minWidth: 0, flexGrow: 1 }}>
                      <button onClick={() => setReading(d.id)} style={{ textAlign: "left", fontSize: 13.5, fontWeight: 600, lineHeight: 1.35, color: "var(--ink)" }}>{d.title}</button>
                      <p style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 3 }}>{d.source}</p>
                      {d.badge && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: tone.bg, borderRadius: 999, padding: "3px 9px", marginTop: 7 }}>
                          <span style={{ width: 5, height: 5, borderRadius: 999, background: tone.fg }} />
                          <span style={{ fontSize: 11.5, fontWeight: 600, color: tone.fg }}>{d.badge}</span>
                        </span>
                      )}
                    </div>
                    <button onClick={() => toggle(d.id)} title={inIndex ? "Take it out" : "Teach it this"} style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 999, background: inIndex ? "var(--paper-sunk)" : "var(--ai-soft)", color: inIndex ? "var(--ink-4)" : "var(--ai)", display: "grid", placeItems: "center" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                        {inIndex ? <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></> : <><path d="M12 5v14" /><path d="M5 12h14" /></>}
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* index */}
          <div
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); if (dragging && !has(dragging)) toggle(dragging); setDragging(null); }}
            style={{
              background: "var(--surface)", borderRadius: "var(--r-xl)", padding: 20, minHeight: 420,
              border: `2px dashed ${over ? "var(--ai)" : "var(--line-strong)"}`,
              display: "flex", flexDirection: "column", gap: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ width: 38, height: 38, borderRadius: 11, background: "var(--ai-soft)", display: "grid", placeItems: "center" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ai)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3a5 5 0 0 1 5 5v1a4 4 0 0 1 0 8v1a5 5 0 0 1-10 0v-1a4 4 0 0 1 0-8V8a5 5 0 0 1 5-5z" />
                  </svg>
                </span>
                <div>
                  <h2 className="display" style={{ fontSize: 16.5, fontWeight: 700 }}>What the company brain has read</h2>
                  <p style={{ fontSize: 13, color: "var(--ink-4)", marginTop: 2 }}>
                    {indexed.length === 0 ? "Nothing yet. It knows nothing about Bharat Bites." : "Click any of these to take it back off."}
                  </p>
                </div>
              </div>
              <span className="display num" style={{ fontSize: 29, fontWeight: 700, color: "var(--ai)", letterSpacing: "-.02em" }}>{indexed.length}</span>
            </div>

            {indexed.length === 0 ? (
              <div style={{ flexGrow: 1, display: "grid", placeItems: "center", textAlign: "center", gap: 11, padding: 24 }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--ink-5)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
                <p style={{ fontSize: 15, color: "var(--ink-4)", maxWidth: 300, lineHeight: 1.5 }}>
                  Drag a document here, or use the plus on the shelf. Start with the ones you would defend in front of a customer.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignContent: "flex-start" }}>
                {indexed.map((id) => {
                  const d = DOC.get(id);
                  if (!d) return null;
                  const tone = TONE_STYLE[d.tone];
                  return (
                    <button key={id} onClick={() => toggle(id)} className="lift" style={{ background: tone.bg, borderRadius: 999, padding: "9px 13px 9px 11px", display: "flex", alignItems: "center", gap: 9, boxShadow: "var(--lift-1)", minHeight: 40 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 999, background: tone.fg }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: tone.fg, whiteSpace: "nowrap" }}>{d.short}</span>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={tone.fg} strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg>
                    </button>
                  );
                })}
              </div>
            )}

            <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 9 }}>
              {warnings.map((w) => (
                <div key={w.head} className="rise" style={{ background: w.bg, borderRadius: "var(--r-md)", padding: "13px 15px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={w.fg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                    <path d="M12 3 L22 20 L2 20 Z" /><path d="M12 10v4" /><path d="M12 17v.01" />
                  </svg>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: w.fg, marginBottom: 3 }}>{w.head}</p>
                    <p style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--ink-2)" }}>{w.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* bench */}
          <Card style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <h2 className="display" style={{ fontSize: 16.5, fontWeight: 700 }}>Ask it something before you trust it</h2>
            <p style={{ fontSize: 13, lineHeight: 1.45, color: "var(--ink-4)", margin: "4px 0 14px" }}>
              Five questions store managers asked Arun last week. Ask all five.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 }}>
              {QUESTIONS.map((q) => {
                const on = asked === q.id;
                const done = board.asked.includes(q.id);
                return (
                  <button key={q.id} onClick={() => ask(q.id)} style={{
                    background: on ? "var(--ink)" : "var(--paper-sunk)", color: on ? "var(--paper)" : "var(--ink-2)",
                    borderRadius: "var(--r-md)", padding: "11px 13px", textAlign: "left", display: "flex", gap: 10, alignItems: "flex-start",
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: on ? "var(--gold)" : done ? "var(--flow)" : "var(--ink-5)", flexShrink: 0, marginTop: 6 }} />
                    <span style={{ fontSize: 13.5, lineHeight: 1.45, fontWeight: on ? 600 : 500 }}>{q.text}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ background: v.bg, borderRadius: "var(--r-lg)", padding: "16px 17px", minHeight: 300 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: v.fg }} />
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: v.fg }}>{v.label}</span>
              </div>
              <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--ink)" }}>{outcome.answer}</p>

              <div style={{ marginTop: 14 }}>
                <p style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--ink-4)", marginBottom: 7 }}>
                  {source ? "Where the answer came from" : "What it had to work with"}
                </p>
                <div style={{ background: "var(--surface)", borderRadius: "var(--r-sm)", padding: "11px 12px", borderLeft: `3px solid ${v.fg}` }}>
                  {source && <p style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{source.title} — {source.source}</p>}
                  <p style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-3)", marginTop: source ? 5 : 0, fontStyle: "italic" }}>{outcome.sourceLine}</p>
                </div>
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ width: 3, alignSelf: "stretch", background: v.fg, borderRadius: 999, flexShrink: 0 }} />
                <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--ink-2)" }}>{outcome.lesson}</p>
              </div>
            </div>
          </Card>
        </div>
      </Page>

      {doc && (
        <div
          onClick={() => setReading(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(36,30,24,.45)", display: "grid", placeItems: "center", padding: 24, zIndex: 50 }}
        >
          <div onClick={(e) => e.stopPropagation()} className="rise" style={{ background: "var(--surface)", borderRadius: "var(--r-xl)", maxWidth: 560, width: "100%", padding: 28, boxShadow: "var(--lift-3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 6 }}>
              <h3 className="display" style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>{doc.title}</h3>
              <button onClick={() => setReading(null)} style={{ fontSize: 13, color: "var(--ink-4)", minHeight: 40 }}>Close</button>
            </div>
            <p style={{ fontSize: 13, color: "var(--ink-4)", marginBottom: 4 }}>{doc.source}</p>
            {doc.badge && <div style={{ marginBottom: 16 }}><Pill fg={TONE_STYLE[doc.tone].fg} bg={TONE_STYLE[doc.tone].bg}>{doc.badge}</Pill></div>}
            <div style={{ background: "var(--paper-sunk)", borderRadius: "var(--r-md)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 11 }}>
              {doc.excerpt.map((line) => (
                <p key={line.slice(0, 20)} style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--ink-2)" }}>{line}</p>
              ))}
            </div>
            <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => { toggle(doc.id); setReading(null); }} className="lift" style={{
                background: has(doc.id) ? "var(--paper-sunk)" : "var(--ai)", color: has(doc.id) ? "var(--ink-2)" : "#fff",
                borderRadius: "var(--r-md)", padding: "12px 20px", fontSize: 15, fontWeight: 600, minHeight: 46,
              }}>
                {has(doc.id) ? "Take it out of the index" : "Teach the brain this"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
