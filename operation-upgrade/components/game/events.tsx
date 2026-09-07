"use client";

import { useEffect } from "react";
import { CONSTRAINTS, FAULTS, RULINGS, type Ruling } from "@/lib/content/events";
import { CONSTRAINT_MOVES, FAULT_DIAGNOSIS, FAULT_CONTROLS, FALLBACKS, DRILLS, DRILL_PHASE_LABEL, DRILL_ORDER } from "@/lib/content/choices";
import { PERSON } from "@/lib/content/cast";
import { dealConstraint, dealFault, faultlessBecause } from "@/lib/engine/deal";
import { scoreDrill, correctDrillOrder, shuffledDrill } from "@/lib/engine/score";
import type { Board } from "@/lib/engine/types";
import { Avatar, Card, Choose, Consequence, Eyebrow, Reorder } from "@/components/ui";
import { Page } from "./shell";

const FAULT_BY_ID = new Map(FAULTS.map((f) => [f.id, f]));

/// The world moves under the plan. Dealt by seat, so neighbours differ.
export function Constraint({ board, update }: { board: Board; update: (fn: (b: Board) => Board) => void }) {
  useEffect(() => {
    if (!board.constraintId) {
      const card = dealConstraint(board.seat);
      update((b) => (b.constraintId ? b : { ...b, constraintId: card.id }));
    }
  }, [board.constraintId, board.seat, update]);

  const card = CONSTRAINTS.find((c) => c.id === board.constraintId);
  if (!card) return <Page><p>Dealing…</p></Page>;
  const from = PERSON.get(card.fromId);
  const moves = CONSTRAINT_MOVES[card.id] ?? [];

  return (
    <Page>
      <div className="rise" style={{ background: "var(--deep)", color: "var(--on-deep)", borderRadius: "var(--r-xl)", padding: "clamp(26px, 4vw, 42px)", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <Avatar id={card.fromId} size={44} dark />
          <div>
            <Eyebrow tone="var(--gold)">Something has changed</Eyebrow>
            <p style={{ fontSize: 13.5, color: "var(--on-deep-3)", marginTop: 3 }}>{from?.name} · {from?.role}</p>
          </div>
        </div>
        <h1 className="serif" style={{ fontSize: "clamp(30px, 4.6vw, 46px)", lineHeight: 1.06, letterSpacing: "-.015em", color: "var(--on-deep)", marginBottom: 16 }}>{card.title}</h1>
        <p style={{ fontSize: 17.5, lineHeight: 1.6, color: "var(--on-deep-2)", maxWidth: 720 }}>{card.body}</p>
        <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--deep-3)", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ width: 3, alignSelf: "stretch", background: "var(--gold)", borderRadius: 999, flexShrink: 0 }} />
          <p style={{ fontSize: 15.5, lineHeight: 1.55, color: "var(--on-deep)" }}>{card.ask}</p>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--on-deep-3)", marginTop: 16 }}>
          The person next to you has a different one. Card {CONSTRAINTS.indexOf(card) + 1} of {CONSTRAINTS.length}.
        </p>
      </div>

      <Card>
        <Choose
          label="What do you do?"
          hint="Then go back and actually change the plan — this is what you would say, not a substitute for doing it."
          options={moves}
          value={board.constraintMove}
          onPick={(id) => update((b) => ({ ...b, constraintMove: id }))}
          disabled={Boolean(board.lockedAt)}
        />
      </Card>
    </Page>
  );
}

/// Something they built breaks. Never something they did not build.
export function Fault({ board, update }: { board: Board; update: (fn: (b: Board) => Board) => void }) {
  useEffect(() => {
    if (!board.faultId) {
      const card = dealFault(board);
      if (card) update((b) => (b.faultId ? b : { ...b, faultId: card.id, drillOrder: shuffledDrill(card.id, b.seat + 7) }));
    }
  }, [board, update]);

  const card = board.faultId ? FAULT_BY_ID.get(board.faultId) : null;

  if (!card) {
    return (
      <Page>
        <Card style={{ borderLeft: "4px solid var(--flow)" }}>
          <Eyebrow tone="var(--flow-ink)">Nothing broke</Eyebrow>
          <h1 className="serif" style={{ fontSize: "clamp(26px, 3.6vw, 34px)", lineHeight: 1.1, margin: "10px 0 12px" }}>No failure was dealt to you.</h1>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: "var(--ink-2)", maxWidth: 640 }}>{faultlessBecause(board)}</p>
        </Card>
      </Page>
    );
  }

  const reporter = PERSON.get(card.reporterId);
  const steps = DRILLS[card.id] ?? [];
  const drillDone = board.drillOrder.length === steps.length && steps.length > 0;
  const drill = drillDone ? scoreDrill(card.id, board.drillOrder) : null;
  const diagnosed = Boolean(board.faultDiagnosis);
  const fallbacks = FALLBACKS[card.id];
  const locked = Boolean(board.lockedAt);

  return (
    <Page>
      {/* the fault */}
      <div className="rise" style={{ background: "var(--alert)", color: "#fff6ec", borderRadius: "var(--r-xl)", padding: "clamp(26px, 4vw, 42px)", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <div style={{ width: 44, height: 44, borderRadius: 999, background: "rgba(255,255,255,.2)", display: "grid", placeItems: "center", fontFamily: "var(--font-serif)", fontSize: 18 }}>{reporter?.initials}</div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", opacity: .85 }}>In something you built</p>
            <p style={{ fontSize: 13.5, opacity: .85, marginTop: 3 }}>{reporter?.name} · {reporter?.role}</p>
          </div>
        </div>
        <h1 className="serif" style={{ fontSize: "clamp(30px, 4.6vw, 46px)", lineHeight: 1.06, letterSpacing: "-.015em", marginBottom: 16 }}>{card.title}</h1>
        <p style={{ fontSize: 17.5, lineHeight: 1.62, opacity: .95, maxWidth: 760 }}>{card.body}</p>
      </div>

      {/* the trace — shown before anything is asked */}
      <Card style={{ marginBottom: 16 }}>
        <Eyebrow tone="var(--ink-4)">Exactly what happened, step by step</Eyebrow>
        <p style={{ fontSize: 14, color: "var(--ink-3)", margin: "6px 0 16px" }}>
          Read this before you answer anything. You are not being asked to guess.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 1, background: "var(--line)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
          {card.trace.map((row) => (
            <div key={row.label} style={{
              background: row.bad ? "var(--alert-soft)" : "var(--surface)",
              padding: "12px 14px", display: "grid",
              gridTemplateColumns: "minmax(0, 13rem) minmax(0, 1fr)", gap: 14, alignItems: "baseline",
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: row.bad ? "var(--alert-ink)" : "var(--ink-4)" }}>{row.label}</span>
              <span style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--ink)" }}>{row.value}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14 }}>
          <Consequence tone="bad" head="What this cost">{card.toll}</Consequence>
        </div>
      </Card>

      {/* 1 · what broke */}
      <Card style={{ marginBottom: 12 }}>
        <Step n={1} of={fallbacks ? 5 : 4} title="What actually broke?" />
        <Choose label="" options={FAULT_DIAGNOSIS[card.id] ?? []} value={board.faultDiagnosis}
          onPick={(id) => update((b) => ({ ...b, faultDiagnosis: id }))} disabled={locked} />
      </Card>

      {/* 2 · the drill */}
      {diagnosed && (
        <Card style={{ marginBottom: 12 }} className="rise">
          <Step n={2} of={fallbacks ? 5 : 4} title="Put it right, in the order you would actually do it" />
          <p style={{ fontSize: 14, color: "var(--ink-3)", margin: "0 0 14px" }}>
            Drag these into order, or use the arrows. There is a right order and it is not obvious — the cost of getting it wrong is real.
          </p>
          <Reorder
            items={steps}
            order={board.drillOrder}
            onChange={(next) => update((b) => ({ ...b, drillOrder: next }))}
            disabled={locked}
          />
          {drill && (
            <div style={{ marginTop: 14 }}>
              {drill.correct ? (
                <Consequence tone="good" head="That is the order">
                  Stop the harm, contain what already happened, work out why, fix the cause, prove it, then put it back. It is the same shape every time, and knowing it is most of incident response.
                </Consequence>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {drill.slips.map((s) => (
                    <Consequence key={`${s.moved}-${s.before}`} tone="bad" head={`You did “${DRILL_PHASE_LABEL[s.moved].toLowerCase()}” before “${DRILL_PHASE_LABEL[s.before].toLowerCase()}”`}>
                      {s.cost}
                    </Consequence>
                  ))}
                  <div style={{ background: "var(--paper-sunk)", borderRadius: "var(--r-md)", padding: "13px 15px" }}>
                    <p style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-4)", marginBottom: 8 }}>The order that works, every time</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {DRILL_ORDER.map((phase, i) => (
                        <span key={phase} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--ink-2)" }}>
                          <span style={{ background: "var(--surface)", borderRadius: 999, padding: "4px 10px", fontWeight: 600 }}>{DRILL_PHASE_LABEL[phase]}</span>
                          {i < DRILL_ORDER.length - 1 && <span style={{ color: "var(--ink-5)" }}>→</span>}
                        </span>
                      ))}
                    </div>
                    <button onClick={() => update((b) => ({ ...b, drillOrder: correctDrillOrder(card.id) }))}
                      disabled={locked}
                      style={{ marginTop: 12, fontSize: 13.5, fontWeight: 600, color: "var(--ai)", minHeight: 40 }}>
                      Put mine in that order →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* 3 · the control */}
      {drillDone && (
        <Card style={{ marginBottom: 12 }} className="rise">
          <Step n={3} of={fallbacks ? 5 : 4} title="What control do you add, so it cannot happen again?" />
          <Choose label="" options={FAULT_CONTROLS[card.id] ?? []} value={board.faultControl}
            onPick={(id) => update((b) => ({ ...b, faultControl: id }))} disabled={locked} />
        </Card>
      )}

      {/* 4 · the fallback — the question almost nobody asks */}
      {drillDone && fallbacks && board.faultControl && (
        <Card style={{ marginBottom: 12 }} className="rise">
          <Step n={4} of={5} title="And when it is down, what happens?" />
          <p style={{ fontSize: 14, color: "var(--ink-3)", margin: "0 0 14px" }}>
            Every system you build has an off day. Most plans never say what happens on it.
          </p>
          <Choose label="" options={fallbacks} value={board.faultFallback}
            onPick={(id) => update((b) => ({ ...b, faultFallback: id }))} disabled={locked} />
        </Card>
      )}

      {/* 5 · the ruling */}
      {board.faultControl && (
        <Card className="rise">
          <Step n={fallbacks ? 5 : 4} of={fallbacks ? 5 : 4} title="Does this workflow keep running?" />
          <p style={{ fontSize: 14, color: "var(--ink-3)", margin: "0 0 14px" }}>Hands up in the room before you answer.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))", gap: 10 }}>
            {RULINGS.map((r) => {
              const on = board.ruling === r.id;
              return (
                <button key={r.id} onClick={() => !locked && update((b) => ({ ...b, ruling: r.id as Ruling }))} className="lift" style={{
                  background: on ? "var(--ink)" : "var(--paper-sunk)", color: on ? "var(--paper)" : "var(--ink-2)",
                  borderRadius: "var(--r-md)", padding: "14px 16px", textAlign: "left", minHeight: 78,
                }}>
                  <span className="display" style={{ fontSize: 15.5, fontWeight: 700, display: "block" }}>{r.label}</span>
                  <span style={{ fontSize: 12.5, lineHeight: 1.4, opacity: .75, display: "block", marginTop: 4 }}>{r.sub}</span>
                </button>
              );
            })}
          </div>

          {board.ruling && (
            <div className="rise" style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 12 }}>
              <Consequence tone="warn" head="What would have prevented it">{card.preventedBy}</Consequence>
              <div style={{ background: "var(--deep)", color: "var(--on-deep)", borderRadius: "var(--r-lg)", padding: "18px 20px" }}>
                <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--gold)", marginBottom: 8 }}>The thing to remember</p>
                <p className="serif" style={{ fontSize: "clamp(19px, 3vw, 25px)", lineHeight: 1.3 }}>{card.teaches}</p>
              </div>
            </div>
          )}
        </Card>
      )}
    </Page>
  );
}

function Step({ n, of, title }: { n: number; of: number; title: string }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "baseline", marginBottom: 12 }}>
      <span className="display num" style={{
        flexShrink: 0, fontSize: 12.5, fontWeight: 700, color: "var(--ink-4)",
        background: "var(--paper-sunk)", borderRadius: 999, padding: "3px 10px",
      }}>{n} of {of}</span>
      <h2 className="display" style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-.01em", lineHeight: 1.25 }}>{title}</h2>
    </div>
  );
}
