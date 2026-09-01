"use client";

import { MARIGA_OPENING, MARIGA_CLOSING, MARIGA_REFERENCE, MARIGA_PARTING, MARIGA_WELL_DONE } from "@/lib/content/rescue";
import { troubles, needsRescue, pressOn } from "@/lib/engine/coach";
import { totals } from "@/lib/engine/economics";
import type { Board } from "@/lib/engine/types";
import { Avatar, Card, Eyebrow } from "@/components/ui";
import { Page } from "./shell";

/**
 * The board brings somebody in.
 *
 * This is not a punishment screen. For a student whose plan is in trouble it is
 * the most useful ten minutes in the session, because being walked through the
 * right decisions by somebody who has done this before is what actually happens
 * in the real version of the job. A strong plan still gets two questions.
 */
export function Rescue({ board }: { board: Board }) {
  const list = troubles(board);
  const rescued = needsRescue(board);
  const t = totals(board);

  return (
    <Page>
      <div className="rise" style={{ background: "var(--ink)", color: "var(--paper)", borderRadius: "var(--r-xl)", padding: "clamp(26px, 4vw, 40px)", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <Avatar id="mariga" size={52} dark />
          <div>
            <Eyebrow tone="var(--gold)">{rescued ? "The board has brought somebody in" : "A second opinion"}</Eyebrow>
            <p className="display" style={{ fontSize: 18, fontWeight: 700, marginTop: 5 }}>Mariga Economova</p>
            <p style={{ fontSize: 13.5, color: "#a99d8d" }}>Turnaround consultant · eleven of these before yours</p>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 13, maxWidth: 720 }}>
          {(rescued ? MARIGA_OPENING : MARIGA_WELL_DONE).map((line) => (
            <p key={line.slice(0, 22)} style={{ fontSize: 17, lineHeight: 1.6, color: "#e5dcd0" }}>{line}</p>
          ))}
        </div>
      </div>

      {rescued && list.length > 0 && (
        <>
          <h2 className="display" style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-.01em", marginBottom: 4 }}>
            {list.length === 1 ? "One thing" : `${list.length} things`} I would not sign off
          </h2>
          <p style={{ fontSize: 14.5, color: "var(--ink-3)", marginBottom: 16 }}>
            Each of these is a decision a sensible person makes. That is exactly why they keep happening.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 26 }}>
            {list.map((tr, i) => (
              <Card key={tr.id} style={{ borderLeft: "4px solid var(--alert)" }}>
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <span className="display num" style={{
                    flexShrink: 0, width: 28, height: 28, borderRadius: 999, background: "var(--alert-soft)",
                    color: "var(--alert)", fontSize: 13.5, fontWeight: 700, display: "grid", placeItems: "center", marginTop: 2,
                  }}>{i + 1}</span>
                  <div>
                    <p className="display" style={{ fontSize: 16.5, fontWeight: 700, lineHeight: 1.3, marginBottom: 8 }}>{tr.found}</p>
                    <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--ink-2)", marginBottom: 12 }}>{tr.costs}</p>
                    <div style={{ background: "var(--flow-soft)", borderRadius: "var(--r-md)", padding: "12px 14px" }}>
                      <p style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--flow-ink)", marginBottom: 5 }}>What to do instead</p>
                      <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--ink-2)" }}>{tr.instead}</p>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <h2 className="display" style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-.01em", marginBottom: 4 }}>{MARIGA_CLOSING[0]}</h2>
          <p style={{ fontSize: 14.5, color: "var(--ink-3)", marginBottom: 16 }}>
            Same ₹{t.budgetLakh} lakh. Same ninety days. Different order.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
            {MARIGA_REFERENCE.map((step) => (
              <Card key={step.week} style={{ display: "grid", gridTemplateColumns: "minmax(0, 8rem) minmax(0, 1fr)", gap: 18, alignItems: "start" }}>
                <span className="display" style={{ fontSize: 14, fontWeight: 700, color: "var(--gold-ink)", background: "var(--gold-soft)", borderRadius: 999, padding: "5px 12px", justifySelf: "start", whiteSpace: "nowrap" }}>{step.week}</span>
                <div>
                  <p style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.45, marginBottom: 7 }}>{step.what}</p>
                  <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-3)" }}>{step.why}</p>
                </div>
              </Card>
            ))}
          </div>

          <div style={{ background: "var(--deep)", color: "var(--on-deep)", borderRadius: "var(--r-lg)", padding: "20px 22px" }}>
            <p className="serif" style={{ fontSize: "clamp(18px, 3vw, 23px)", lineHeight: 1.4 }}>{MARIGA_PARTING}</p>
          </div>
        </>
      )}

      {!rescued && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {pressOn(board).map((q, i) => (
            <Card key={q} style={{ borderLeft: "4px solid var(--gold)" }}>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <span className="display num" style={{
                  flexShrink: 0, width: 28, height: 28, borderRadius: 999, background: "var(--gold-soft)",
                  color: "var(--gold-ink)", fontSize: 13.5, fontWeight: 700, display: "grid", placeItems: "center", marginTop: 1,
                }}>{i + 1}</span>
                <p style={{ fontSize: 16, lineHeight: 1.6, color: "var(--ink-2)" }}>{q}</p>
              </div>
            </Card>
          ))}
          {list.length > 0 && (
            <Card style={{ background: "var(--paper-sunk)", boxShadow: "none" }}>
              <Eyebrow tone="var(--ink-4)">Also worth a look</Eyebrow>
              <ul style={{ margin: "10px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                {list.map((tr) => <li key={tr.id} style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--ink-2)" }}>{tr.found} {tr.instead}</li>)}
              </ul>
            </Card>
          )}
        </div>
      )}
    </Page>
  );
}
