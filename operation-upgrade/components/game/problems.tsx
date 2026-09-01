"use client";

import { useState } from "react";
import { CAST, PERSON } from "@/lib/content/cast";
import { PROBLEMS, PROBLEM, type Approach, type Problem } from "@/lib/content/problems";
import { resolveOption, changeCount, gateLoad, totals } from "@/lib/engine/economics";
import { RATIONALES, LEAVING_REASONS } from "@/lib/content/choices";
import { rationaleFit } from "@/lib/engine/score";
import type { Board } from "@/lib/engine/types";
import { Avatar, Button, Card, Choose, Eyebrow, Pill, TONE } from "@/components/ui";
import { Briefing, Page } from "./shell";

const SEVERITY: Record<string, { c: string; label: string }> = {
  costing: { c: "var(--alert)", label: "Costing them now" },
  slowing: { c: "var(--gold)", label: "Slowing them down" },
  coping: { c: "var(--flow)", label: "Coping, for now" },
};

export function Problems({ board, update }: { board: Board; update: (fn: (b: Board) => Board) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? PROBLEM.get(openId) ?? null : null;

  if (open) {
    return <Detail problem={open} board={board} update={update} onBack={() => setOpenId(null)} />;
  }

  const changes = changeCount(board);
  const unread = PROBLEMS.filter((p) => !board.visited.includes(p.id)).length;
  const load = gateLoad(board);
  const arunLoad = load.arun ?? 0;

  return (
    <>
      <Briefing
        speakerId="cutesh"
        pending={[
          { text: unread === 0 ? "You have read all seven" : `${unread} still unread`, done: unread === 0 },
          { text: `${changes} of four changes committed`, done: changes >= 3 && changes <= 4 },
          { text: board.leaving ? "You named what you are leaving" : "Name what you are leaving alone", done: Boolean(board.leaving) },
        ]}
      >
        “You have walked the floor. Now pick your fights. Seven things are broken and you can afford to properly fix three, maybe four. Open each one, read what is actually happening, and decide whether it needs a person, a system, or just a better way of doing it. And do not start with the shiny one — start with the one that is costing us most.”
      </Briefing>

      <Page wide>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 22, flexWrap: "wrap", marginBottom: 22 }}>
          <div>
            <h1 className="serif" style={{ fontSize: "clamp(28px, 4vw, 38px)", lineHeight: 1.1, letterSpacing: "-.01em" }}>
              Seven places where Bharat Bites hurts.
            </h1>
            <p style={{ fontSize: 15, color: "var(--ink-3)", marginTop: 6 }}>
              Every number below is what it costs them this week. Open one to read the evidence before you decide anything.
            </p>
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {Object.entries(SEVERITY).map(([k, v]) => (
              <span key={k} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, color: "var(--ink-3)" }}>
                <span style={{ width: 11, height: 11, borderRadius: 999, background: v.c }} />{v.label}
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))", gap: 14 }}>
          {PROBLEMS.map((p) => {
            const picks = board.picks[p.id] ?? [];
            const sev = SEVERITY[p.severity];
            const visited = board.visited.includes(p.id);
            const owner = PERSON.get(p.ownerId);
            return (
              <Card
                key={p.id}
                className="lift"
                onClick={() => {
                  setOpenId(p.id);
                  update((b) => (b.visited.includes(p.id) ? b : { ...b, visited: [...b.visited, p.id] }));
                }}
                style={{ borderTop: `4px solid ${sev.c}`, cursor: "pointer", display: "flex", flexDirection: "column", gap: 10 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <h2 className="display" style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.2, letterSpacing: "-.01em" }}>{p.title}</h2>
                  {picks.length > 0
                    ? <Pill fg="var(--flow-ink)" bg="var(--flow-soft)">{picks.length === 1 ? "Decided" : `${picks.length} changes`}</Pill>
                    : visited
                      ? <Pill fg="var(--ai-ink)" bg="var(--ai-soft)">You read it</Pill>
                      : <Pill fg="var(--ink-4)" bg="var(--paper-sunk)">Not opened</Pill>}
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.5, color: "var(--ink-3)" }}>{p.pain}</p>
                <div style={{ marginTop: "auto", paddingTop: 8, display: "flex", alignItems: "center", gap: 9 }}>
                  <Avatar id={p.ownerId} size={24} />
                  <span style={{ fontSize: 12.5, color: "var(--ink-4)", lineHeight: 1.35 }}>{owner?.name}</span>
                  {picks.length > 0 && (
                    <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                      {picks.map((a) => <span key={a} style={{ width: 9, height: 9, borderRadius: 3, background: TONE[a].fg }} />)}
                    </span>
                  )}
                </div>
              </Card>
            );
          })}

          <Card style={{ background: "var(--deep)", color: "var(--on-deep)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12 }}>
              <Avatar id="arun" size={38} dark />
              <div>
                <div className="display" style={{ fontSize: 14.5, fontWeight: 700 }}>Arun&rsquo;s week</div>
                <div style={{ fontSize: 12.5, color: "var(--on-deep-3)" }}>Fourteen years, five cities</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
              <span className="display num" style={{ fontSize: 42, fontWeight: 700, letterSpacing: "-.03em", lineHeight: 1 }}>22</span>
              <span style={{ fontSize: 13, lineHeight: 1.4, color: "var(--on-deep-2)" }}>calls a day asking him<br />what is written down</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: "var(--deep-3)", marginTop: 14, overflow: "hidden" }}>
              <div style={{ height: "100%", width: "88%", background: "var(--alert)", borderRadius: 999 }} />
            </div>
            <p style={{ fontSize: 12.5, color: "var(--on-deep-2)", marginTop: 10, lineHeight: 1.45 }}>
              {arunLoad >= 3
                ? `You have now named Arun on ${arunLoad} of your changes. He was the problem you were hired to solve.`
                : "He has not taken leave since March. Fix this and you have fixed what Cutesh actually hired you for."}
            </p>
          </Card>
        </div>

        <LeavingCard board={board} update={update} />
      </Page>
    </>
  );
}

function LeavingCard({ board, update }: { board: Board; update: (fn: (b: Board) => Board) => void }) {
  const untouched = PROBLEMS.filter((p) => (board.picks[p.id] ?? []).length === 0);
  return (
    <Card style={{ marginTop: 22, borderLeft: "4px solid var(--gold)" }}>
      <Eyebrow tone="var(--gold-ink)">Cutesh&rsquo;s fifth rule</Eyebrow>
      <h2 className="display" style={{ fontSize: 18, fontWeight: 700, margin: "8px 0 4px" }}>
        Which one are you deliberately not fixing?
      </h2>
      <p style={{ fontSize: 14.5, color: "var(--ink-3)", marginBottom: 14 }}>
        She will ask, and “we ran out of money” is not an answer she accepts. Pick the one you are walking past on purpose.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {untouched.map((p) => {
          const on = board.leaving === p.id;
          return (
            <button
              key={p.id}
              onClick={() => update((b) => ({ ...b, leaving: on ? null : p.id }))}
              className="lift"
              style={{
                background: on ? "var(--ink)" : "var(--paper-sunk)", color: on ? "var(--paper)" : "var(--ink-2)",
                borderRadius: 999, padding: "9px 16px", fontSize: 13.5, fontWeight: 600, minHeight: 42,
              }}
            >
              {p.title}
            </button>
          );
        })}
        {untouched.length === 0 && (
          <p style={{ fontSize: 14, color: "var(--ink-4)" }}>You have touched all seven. Something has to come back off before you can answer this.</p>
        )}
      </div>
      {board.leaving && (
        <>
          <Choose
            label=""
            options={LEAVING_REASONS}
            value={board.leavingReason}
            onPick={(id) => update((b) => ({ ...b, leavingReason: id }))}
          />
        </>
      )}
    </Card>
  );
}

function Detail({ problem, board, update, onBack }: {
  problem: Problem; board: Board; update: (fn: (b: Board) => Board) => void; onBack: () => void;
}) {
  const [dragging, setDragging] = useState<Approach | null>(null);
  const picks = board.picks[problem.id] ?? [];
  const t = totals(board);
  const load = gateLoad(board);

  // The same six reasons everywhere, judged against what they actually chose.
  // Saying a new hire "reaches all twenty-five outlets on the same day"
  // describes something that does not happen, and that is worth showing.
  const lead = picks.includes("build") ? "build" : picks[0];
  const unlocks = picks.includes("redesign") && picks.includes("build");
  const rationaleOptions = RATIONALES.map((r) => {
    const fit = lead ? rationaleFit(r.id, lead, unlocks) : { quality: "workable" as const, note: r.note };
    return { id: r.id, text: r.text, note: fit.note, quality: fit.quality };
  });

  const toggle = (a: Approach) =>
    update((b) => {
      const current = b.picks[problem.id] ?? [];
      const next = current.includes(a) ? current.filter((x) => x !== a) : [...current, a];
      const picksNext = { ...b.picks };
      if (next.length === 0) delete picksNext[problem.id];
      else picksNext[problem.id] = next;
      return { ...b, picks: picksNext, leaving: b.leaving === problem.id ? null : b.leaving };
    });

  return (
    <>
      <Briefing speakerId={problem.ownerId}>
        “{problem.thread[0].text}”
      </Briefing>

      <Page wide>
        <button onClick={onBack} style={{ fontSize: 14, color: "var(--ink-3)", marginBottom: 16, display: "flex", alignItems: "center", gap: 7, minHeight: 40 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M11 18l-6-6 6-6" /></svg>
          All seven problems
        </button>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 360px) minmax(0, 1fr)", gap: 22, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <Eyebrow>Problem {problem.area}</Eyebrow>
              <h1 className="serif" style={{ fontSize: "clamp(28px, 3.4vw, 36px)", lineHeight: 1.08, letterSpacing: "-.015em", marginTop: 8 }}>{problem.title}</h1>
            </div>

            <Card>
              <h2 className="display" style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 13 }}>What it costs, this week</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                {problem.facts.map((f) => (
                  <div key={f.text} style={{ display: "flex", alignItems: "baseline", gap: 13 }}>
                    <span className="display num" style={{ fontSize: 25, fontWeight: 700, letterSpacing: "-.02em", minWidth: 64, color: f.alarming ? "var(--alert)" : "var(--ink-4)" }}>{f.value}</span>
                    <span style={{ fontSize: 13.5, lineHeight: 1.45, color: "var(--ink-3)" }}>{f.text}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                <h2 className="display" style={{ fontSize: 15.5, fontWeight: 700 }}>From the operations group</h2>
                <Pill fg="var(--flow-ink)" bg="var(--flow-soft)">Yesterday</Pill>
              </div>
              <p style={{ fontSize: 12.5, color: "var(--ink-4)", marginBottom: 14 }}>Four thousand more like it are on the shelf.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {problem.thread.map((m, i) => {
                  const mine = i % 2 === 1;
                  return (
                    <div key={`${m.at}-${i}`} style={{ display: "flex", gap: 9, alignItems: "flex-start", flexDirection: mine ? "row-reverse" : "row", alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "92%" }}>
                      <Avatar id={m.who} size={26} dark={mine} />
                      <div style={{ background: mine ? "var(--deep)" : "var(--paper-sunk)", color: mine ? "var(--on-deep-2)" : "var(--ink)", borderRadius: 14, padding: "9px 12px" }}>
                        <p style={{ fontSize: 13.5, lineHeight: 1.45 }}>{m.text}</p>
                        <p style={{ fontSize: 11, color: mine ? "var(--on-deep-3)" : "var(--ink-5)", marginTop: 4 }}>{m.at}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
              <div>
                <h2 className="display" style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-.015em" }}>How do you want to fix this?</h2>
                <p style={{ fontSize: 14, color: "var(--ink-3)", marginTop: 4 }}>
                  Drag a card into the slot below, or just click it. You can take more than one — cleaning up first and then building on it is a real strategy, and it costs two of your four changes.
                </p>
              </div>
              <Card style={{ padding: "12px 16px", boxShadow: "var(--lift-1)", flexShrink: 0 }}>
                <div className="display num" style={{ fontSize: 20, fontWeight: 700, color: t.overBy > 0 ? "var(--alert)" : "var(--ink)", lineHeight: 1 }}>₹{t.remainingLakh}L</div>
                <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 4 }}>left to spend</div>
              </Card>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 250px), 1fr))", gap: 12 }}>
              {problem.options.map((o) => {
                const r = resolveOption(problem.id, o.id, board);
                const on = picks.includes(o.id);
                const tone = TONE[o.id];
                return (
                  <div
                    key={o.id}
                    className="lift"
                    draggable
                    onDragStart={() => setDragging(o.id)}
                    onDragEnd={() => setDragging(null)}
                    onClick={() => toggle(o.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(o.id); } }}
                    style={{
                      background: "var(--surface)", borderRadius: "var(--r-lg)", padding: 17,
                      boxShadow: on ? "var(--lift-3)" : "var(--lift-2)",
                      border: `2px solid ${on ? tone.fg : "transparent"}`,
                      cursor: "grab", display: "flex", flexDirection: "column", gap: 9,
                      opacity: r.blocked ? 0.5 : 1,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <Pill fg={tone.ink} bg={tone.soft}>{tone.word}</Pill>
                      {on && <span style={{ fontSize: 12.5, fontWeight: 700, color: tone.fg }}>Chosen</span>}
                    </div>
                    <h3 className="display" style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.25, letterSpacing: "-.01em" }}>{o.title}</h3>
                    <p style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--ink-3)" }}>{o.body}</p>
                    <div style={{ marginTop: "auto", paddingTop: 13, borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 7 }}>
                      <Row k="Costs you" v={`₹${r.costLakh}L a year`} strike={r.discounted ? `₹${o.costLakh}L` : undefined} />
                      <Row k="Starts helping" v={`Week ${r.liveWeek}`} />
                      <Row k="How risky" v={r.risk === "high" ? "High risk today" : r.risk === "medium" ? "Some risk" : "Low risk"} c={r.risk === "high" ? "var(--alert)" : r.risk === "medium" ? "var(--gold-ink)" : "var(--flow)"} />
                    </div>
                    {r.blocked && <p style={{ fontSize: 12.5, color: "var(--alert)", lineHeight: 1.45 }}>Off the table — {r.blockedWhy}</p>}
                  </div>
                );
              })}
            </div>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (dragging) { toggle(dragging); setDragging(null); } }}
              style={{
                background: "var(--surface)", borderRadius: "var(--r-xl)", padding: 22,
                border: `2px ${picks.length ? "solid" : "dashed"} ${dragging ? "var(--ai)" : picks.length ? "var(--line-strong)" : "var(--line-strong)"}`,
                minHeight: 190, display: "flex", flexDirection: "column", gap: 16,
              }}
            >
              {picks.length === 0 ? (
                <div style={{ flexGrow: 1, display: "grid", placeItems: "center", textAlign: "center", gap: 10, padding: 20 }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--ink-5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v13" /><path d="M7 11l5 5 5-5" /><path d="M4 20h16" /></svg>
                  <p style={{ fontSize: 15, color: "var(--ink-4)", maxWidth: 330, lineHeight: 1.5 }}>
                    Drop your choice here. Nothing is committed until you show Cutesh the whole plan.
                  </p>
                </div>
              ) : (
                <>
                  {picks.map((a) => {
                    const o = problem.options.find((x) => x.id === a)!;
                    const r = resolveOption(problem.id, a, board);
                    const tone = TONE[a];
                    return (
                      <div key={a} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                        <span style={{ width: 4, alignSelf: "stretch", background: tone.fg, borderRadius: 999, flexShrink: 0 }} />
                        <div style={{ minWidth: 0 }}>
                          <h3 className="display" style={{ fontSize: 17, fontWeight: 700, marginBottom: 5 }}>{o.title}</h3>
                          <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--ink-2)" }}>{o.what}</p>
                          <div style={{ background: r.discounted ? "var(--flow-soft)" : o.noteHead.includes("before you commit") ? "var(--alert-soft)" : tone.soft, borderRadius: "var(--r-md)", padding: "13px 15px", marginTop: 11 }}>
                            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: r.discounted ? "var(--flow-ink)" : tone.ink, marginBottom: 5 }}>
                              {r.discounted ? "What your earlier choice bought you" : o.noteHead}
                            </p>
                            <p style={{ fontSize: 14, lineHeight: 1.55, color: "var(--ink-2)" }}>{r.discounted ? r.discountNote : o.noteBody}</p>
                          </div>
                        </div>
                        <button onClick={() => toggle(a)} style={{ marginLeft: "auto", fontSize: 13, color: "var(--ink-4)", flexShrink: 0, minHeight: 40 }}>Remove</button>
                      </div>
                    );
                  })}

                  <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 20 }}>
                    <div>
                      <h4 className="display" style={{ fontSize: 15, fontWeight: 700 }}>Who checks this?</h4>
                      <p style={{ fontSize: 12.5, color: "var(--ink-4)", margin: "3px 0 12px", lineHeight: 1.45 }}>
                        Cutesh&rsquo;s first rule. One name, and it has to be somebody who could actually do it.
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                        {CAST.map((person) => {
                          const on = board.gates[problem.id] === person.id;
                          const busy = (load[person.id] ?? 0) > person.comfortableLoad;
                          return (
                            <button
                              key={person.id}
                              onClick={() => update((b) => ({ ...b, gates: { ...b.gates, [problem.id]: person.id } }))}
                              className="lift"
                              style={{
                                background: on ? "var(--ink)" : "var(--paper-sunk)", color: on ? "var(--paper)" : "var(--ink-2)",
                                borderRadius: 999, padding: "6px 14px 6px 6px", display: "flex", alignItems: "center", gap: 8, minHeight: 40,
                                border: `2px solid ${busy && on ? "var(--alert)" : "transparent"}`,
                              }}
                            >
                              <Avatar id={person.id} size={24} dark={on} />
                              <span style={{ fontSize: 13, fontWeight: 600 }}>{person.name}</span>
                            </button>
                          );
                        })}
                      </div>
                      {board.gates[problem.id] && (load[board.gates[problem.id]] ?? 0) > (PERSON.get(board.gates[problem.id])?.comfortableLoad ?? 1) && (
                        <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--alert)", marginTop: 11 }}>
                          {PERSON.get(board.gates[problem.id])?.name} is now the named person on {load[board.gates[problem.id]]} of your changes. You were hired because everything runs through one person.
                        </p>
                      )}
                    </div>

                    <div>
                      <Choose
                        label="Why this?"
                        hint="Pick the one closest to your thinking. It gets read out if your plan is chosen."
                        options={rationaleOptions}
                        value={board.rationales[problem.id] ?? null}
                        onPick={(id) => update((b) => ({ ...b, rationales: { ...b.rationales, [problem.id]: id } }))}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button tone="quiet" onClick={onBack}>Back to all seven</Button>
            </div>
          </div>
        </div>
      </Page>
    </>
  );
}

function Row({ k, v, c, strike }: { k: string; v: string; c?: string; strike?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <span style={{ fontSize: 12.5, color: "var(--ink-4)" }}>{k}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: c ?? "var(--ink)", textAlign: "right" }}>
        {strike && <span style={{ textDecoration: "line-through", color: "var(--ink-5)", fontWeight: 500, marginRight: 6 }}>{strike}</span>}
        {v}
      </span>
    </div>
  );
}
