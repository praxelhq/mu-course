"use client";

import { useEffect } from "react";
import { CONSTRAINTS, FAULT_QUESTIONS, RULINGS, type Ruling } from "@/lib/content/events";
import { dealConstraint, dealFault, faultlessBecause } from "@/lib/engine/deal";
import { MIN_CONSTRAINT_WORDS, MIN_FAULT_WORDS } from "@/lib/engine/validate";
import type { Board } from "@/lib/engine/types";
import { Avatar, Card, Eyebrow, WordCount } from "@/components/ui";
import { Page } from "./shell";
import { PERSON } from "@/lib/content/cast";

/// The world changes. Dealt by seat, so the four people at a table are solving
/// four different problems and the debrief has something to compare.
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

  return (
    <Page>
      <div className="rise" style={{ background: "var(--deep)", color: "var(--on-deep)", borderRadius: "var(--r-xl)", padding: "clamp(26px, 4vw, 42px)", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <Avatar id={card.fromId} size={44} dark />
          <div>
            <Eyebrow tone="var(--gold)">Something has changed</Eyebrow>
            <p style={{ fontSize: 13.5, color: "var(--on-deep-3)", marginTop: 3 }}>{from?.name} · {from?.role}</p>
          </div>
        </div>
        <h1 className="serif" style={{ fontSize: "clamp(30px, 4.6vw, 46px)", lineHeight: 1.06, letterSpacing: "-.015em", color: "var(--on-deep)", marginBottom: 16 }}>
          {card.title}
        </h1>
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
        <h2 className="display" style={{ fontSize: 17.5, fontWeight: 700 }}>What changes in your plan, and why that one?</h2>
        <p style={{ fontSize: 14, color: "var(--ink-3)", margin: "5px 0 14px" }}>
          Go back and adjust the plan itself as well — this box is what you would say to her, not a substitute for changing it.
        </p>
        <textarea
          className="field"
          rows={4}
          value={board.constraintResponse}
          onChange={(e) => update((b) => ({ ...b, constraintResponse: e.target.value }))}
          placeholder="I drop the voice agent and put the money into the document clean-up, because the agent was only ever going to be as good as what it read."
        />
        <div style={{ marginTop: 8 }}><WordCount text={board.constraintResponse} min={MIN_CONSTRAINT_WORDS} /></div>
      </Card>
    </Page>
  );
}

/// Something they built breaks. Never something they did not build.
export function Fault({ board, update }: { board: Board; update: (fn: (b: Board) => Board) => void }) {
  useEffect(() => {
    if (!board.faultId) {
      const card = dealFault(board);
      if (card) update((b) => (b.faultId ? b : { ...b, faultId: card.id }));
    }
  }, [board, update]);

  const card = board.faultId ? FAULTS_BY_ID.get(board.faultId) : null;
  const answered = FAULT_QUESTIONS.every((q) => (board.faultAnswers[q.key] ?? "").trim().split(/\s+/u).length >= MIN_FAULT_WORDS);

  if (!card) {
    const why = faultlessBecause(board);
    return (
      <Page>
        <Card style={{ borderLeft: "4px solid var(--flow)" }}>
          <Eyebrow tone="var(--flow-ink)">Nothing broke</Eyebrow>
          <h1 className="serif" style={{ fontSize: "clamp(26px, 3.6vw, 34px)", lineHeight: 1.1, margin: "10px 0 12px" }}>
            No failure was dealt to you.
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: "var(--ink-2)", maxWidth: 640 }}>{why}</p>
        </Card>
      </Page>
    );
  }

  const reporter = PERSON.get(card.reporterId);

  return (
    <Page>
      <div className="rise" style={{ background: "var(--alert)", color: "#fff6ec", borderRadius: "var(--r-xl)", padding: "clamp(26px, 4vw, 42px)", marginBottom: 20 }}>
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

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 380px)", gap: 18, alignItems: "start" }}>
        <Card>
          <h2 className="display" style={{ fontSize: 17.5, fontWeight: 700, marginBottom: 4 }}>Answer it yourself first</h2>
          <p style={{ fontSize: 14, color: "var(--ink-3)", marginBottom: 18 }}>
            There are no options here on purpose. Naming the control is the one thing a menu would do for you.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {FAULT_QUESTIONS.map((q, i) => (
              <div key={q.key}>
                <label style={{ display: "flex", gap: 10, alignItems: "baseline", marginBottom: 7 }}>
                  <span className="display num" style={{ fontSize: 14, color: "var(--ink-5)" }}>{String(i + 1).padStart(2, "0")}</span>
                  <span>
                    <span style={{ fontSize: 15, fontWeight: 600, display: "block" }}>{q.label}</span>
                    <span style={{ fontSize: 13, color: "var(--ink-4)" }}>{q.hint}</span>
                  </span>
                </label>
                <textarea
                  className="field"
                  rows={2}
                  value={board.faultAnswers[q.key] ?? ""}
                  onChange={(e) => update((b) => ({ ...b, faultAnswers: { ...b.faultAnswers, [q.key]: e.target.value } }))}
                />
                <div style={{ marginTop: 6 }}><WordCount text={board.faultAnswers[q.key] ?? ""} min={MIN_FAULT_WORDS} /></div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
            <h3 className="display" style={{ fontSize: 16, fontWeight: 700 }}>Does it keep running?</h3>
            <p style={{ fontSize: 13.5, color: "var(--ink-4)", margin: "4px 0 12px" }}>Hands up in the room before you answer.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 10 }}>
              {RULINGS.map((r) => {
                const on = board.ruling === r.id;
                return (
                  <button key={r.id} onClick={() => update((b) => ({ ...b, ruling: r.id as Ruling }))} className="lift" style={{
                    background: on ? "var(--ink)" : "var(--paper-sunk)", color: on ? "var(--paper)" : "var(--ink-2)",
                    borderRadius: "var(--r-md)", padding: "14px 16px", textAlign: "left", minHeight: 74,
                  }}>
                    <span className="display" style={{ fontSize: 15.5, fontWeight: 700, display: "block" }}>{r.label}</span>
                    <span style={{ fontSize: 12.5, lineHeight: 1.4, opacity: .75, display: "block", marginTop: 4 }}>{r.sub}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        <Card style={{ background: answered ? "var(--surface)" : "var(--paper-sunk)", boxShadow: answered ? "var(--lift-2)" : "none" }}>
          {answered ? (
            <div className="rise">
              <Eyebrow tone="var(--ink-4)">What actually happened</Eyebrow>
              <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--ink-2)", margin: "10px 0 18px" }}>{card.whatFailed}</p>
              <Eyebrow tone="var(--flow-ink)">What would have prevented it</Eyebrow>
              <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--ink-2)", margin: "10px 0 18px" }}>{card.preventedBy}</p>
              <div style={{ background: "var(--gold-soft)", borderRadius: "var(--r-md)", padding: "14px 16px" }}>
                <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--gold-ink)", fontWeight: 600 }}>{card.teaches}</p>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", placeItems: "center", minHeight: 220, textAlign: "center", padding: 20, gap: 10 }}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--ink-5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
              <p style={{ fontSize: 14.5, color: "var(--ink-4)", maxWidth: 260, lineHeight: 1.55 }}>
                Write your three answers and this opens. What went wrong is worth more after you have committed to a view.
              </p>
            </div>
          )}
        </Card>
      </div>
    </Page>
  );
}

import { FAULTS } from "@/lib/content/events";
const FAULTS_BY_ID = new Map(FAULTS.map((f) => [f.id, f]));
