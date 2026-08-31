"use client";

import type { ReactNode } from "react";
import { COMPANY } from "@/lib/content/cast";
import { PHASES, type PhaseId } from "@/lib/phases";
import { totals, changeCount } from "@/lib/engine/economics";
import type { Board } from "@/lib/engine/types";

const VISIBLE: PhaseId[] = ["offer", "walk", "decide", "brain", "plan", "constraint", "fault", "memo", "pitch", "vote", "debrief", "close"];

export function Shell({ board, phase, saveState, connected, children }: {
  board: Board; phase: PhaseId; saveState: string; connected: boolean; children: ReactNode;
}) {
  const t = totals(board);
  const changes = changeCount(board);
  const over = t.overBy > 0;

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <header style={{ background: "var(--deep)", color: "var(--on-deep)", flexShrink: 0 }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 clamp(16px, 3vw, 32px)", height: 74, display: "flex", alignItems: "center", gap: "clamp(16px, 3vw, 30px)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, flexShrink: 0 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "var(--gold)", display: "grid", placeItems: "center" }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--deep)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 11h16v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><path d="M6 11a6 6 0 0 1 12 0" /><path d="M12 5V3" />
              </svg>
            </div>
            <span className="display" style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase" }}>{COMPANY.name}</span>
          </div>

          <div style={{ width: 1, height: 32, background: "var(--deep-3)", flexShrink: 0 }} />

          <Stat label="Committed, a year" value={`₹${t.spendLakh}L`} sub={`of ₹${t.budgetLakh}L`} tone={over ? "var(--alert)" : "var(--gold)"} />
          <Stat label="Changes running" value={String(changes)} sub="of four" tone={changes > 4 ? "var(--alert)" : "var(--on-deep)"} />
          <Stat label="Starts helping" value={t.earliestWeek ? `Wk ${t.earliestWeek}` : "—"} sub="at the earliest" tone="var(--on-deep)" />

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
            <span style={{ fontSize: 12.5, color: "var(--on-deep-3)" }}>
              {board.lockedAt ? "Locked" : saveState === "offline" ? "Saved on this laptop" : saveState === "saving" ? "Saving…" : "Saved"}
            </span>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{board.handle}</span>
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--deep-3)" }}>
          <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 clamp(16px, 3vw, 32px)", display: "flex", gap: 4, overflowX: "auto" }} className="scroll">
            {VISIBLE.map((id) => {
              const p = PHASES.find((x) => x.id === id)!;
              const here = phase === id;
              const done = PHASES.findIndex((x) => x.id === phase) > PHASES.findIndex((x) => x.id === id);
              return (
                <div key={id} style={{
                  padding: "10px 12px", flexShrink: 0, borderBottom: `2px solid ${here ? "var(--gold)" : "transparent"}`,
                  fontSize: 12.5, fontWeight: here ? 700 : 500,
                  color: here ? "var(--on-deep)" : done ? "var(--on-deep-2)" : "var(--on-deep-3)",
                  whiteSpace: "nowrap",
                }}>
                  {p.short}
                </div>
              );
            })}
            {!connected && (
              <div style={{ marginLeft: "auto", padding: "10px 12px", fontSize: 12.5, color: "var(--gold)", whiteSpace: "nowrap" }}>
                Working offline — carry on, nothing is lost
              </div>
            )}
          </div>
        </div>
      </header>

      <main style={{ flexGrow: 1, minHeight: 0 }}>{children}</main>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ fontSize: 11.5, color: "var(--on-deep-3)", marginBottom: 2, whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span className="display num" style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-.02em", color: tone }}>{value}</span>
        <span style={{ fontSize: 12, color: "var(--on-deep-3)", whiteSpace: "nowrap" }}>{sub}</span>
      </div>
    </div>
  );
}

/// Every stage opens with a person telling you what is going on and what is
/// still outstanding. Nothing in this game is explained by the interface.
export function Briefing({ speakerId, children, pending }: {
  speakerId: string; children: ReactNode; pending?: { text: string; done: boolean }[];
}) {
  return (
    <div style={{ background: "var(--deep)", color: "var(--on-deep)" }}>
      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "18px clamp(16px, 3vw, 32px)", display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flexGrow: 1, minWidth: 320 }}>
          <SaysDark id={speakerId}>{children}</SaysDark>
        </div>
        {pending && pending.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
            {pending.map((p) => (
              <div key={p.text} style={{ background: "var(--deep-2)", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{
                  width: 16, height: 16, borderRadius: 999, flexShrink: 0,
                  background: p.done ? "var(--flow)" : "var(--deep-3)", display: "grid", placeItems: "center",
                }}>
                  {p.done && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l6 6L20 6" /></svg>
                  )}
                </span>
                <span style={{ fontSize: 13, fontWeight: 500, color: p.done ? "var(--on-deep-3)" : "var(--on-deep-2)", whiteSpace: "nowrap" }}>{p.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { PERSON } from "@/lib/content/cast";

function SaysDark({ id, children }: { id: string; children: ReactNode }) {
  const person = PERSON.get(id);
  return (
    <div style={{ display: "flex", gap: 15, alignItems: "flex-start" }}>
      <div style={{
        width: 44, height: 44, borderRadius: 999, flexShrink: 0, background: "var(--gold)", color: "var(--deep)",
        display: "grid", placeItems: "center", fontFamily: "var(--font-serif), Georgia, serif", fontSize: 18,
      }}>{person?.initials}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 3 }}>
          <span className="display" style={{ fontSize: 14.5, fontWeight: 700 }}>{person?.name}</span>
          <span style={{ fontSize: 13, color: "var(--on-deep-3)" }}>{person?.role}</span>
        </div>
        <div style={{ fontSize: 15.5, lineHeight: 1.55, color: "var(--on-deep-2)" }}>{children}</div>
      </div>
    </div>
  );
}

export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div style={{ maxWidth: wide ? 1440 : 1180, margin: "0 auto", padding: "clamp(20px, 3vw, 34px) clamp(16px, 3vw, 32px) 80px" }} className="rise">
      {children}
    </div>
  );
}
