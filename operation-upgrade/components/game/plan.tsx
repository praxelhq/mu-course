"use client";

import { PROBLEMS, PROBLEM } from "@/lib/content/problems";
import { PERSON } from "@/lib/content/cast";
import { chosenOptions, totals, changeCount, gateLoad } from "@/lib/engine/economics";
import { blockers } from "@/lib/engine/validate";
import type { Board } from "@/lib/engine/types";
import { Avatar, Card, Eyebrow, Pill, TONE } from "@/components/ui";
import { Briefing, Page } from "./shell";

export function Plan({ board }: { board: Board }) {
  const t = totals(board);
  const chosen = chosenOptions(board);
  const problems = blockers(board);
  const load = gateLoad(board);
  const over = t.overBy > 0;

  const overloaded = Object.entries(load).find(([id, n]) => n > (PERSON.get(id)?.comfortableLoad ?? 1));

  let cutesh: string;
  if (over) cutesh = `“This is ${t.overBy} lakh more than the board approved. I cannot take that to them. Something comes out, and you tell me what.”`;
  else if (t.chosenCount === 0) cutesh = "“You have not committed to anything yet. Go back and make some calls — I would rather you were wrong than undecided.”";
  else if (t.buildCount >= 3) cutesh = `“${t.buildCount} new systems in ninety days, and one operations team to run all of them. Who is checking any of this on a Tuesday when you have gone?”`;
  else if (t.earliestWeek !== null && t.earliestWeek > 5) cutesh = "“Nothing here helps anybody before week five. I have a board meeting on day ninety and nothing to show them in the meantime.”";
  else if (overloaded) cutesh = `“${PERSON.get(overloaded[0])?.name} is the named person on ${overloaded[1]} of these. You do know that is the thing I hired you to fix?”`;
  else cutesh = "“Show me the whole thing at once. What it costs a year, when it starts helping, and what you decided not to touch.”";

  const maxWeek = 13;

  return (
    <>
      <Briefing speakerId="cutesh">{cutesh}</Briefing>
      <Page wide>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)", gap: 18, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Card>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 14 }}>
                <div>
                  <h2 className="display" style={{ fontSize: 17.5, fontWeight: 700 }}>What this costs Bharat Bites, every year</h2>
                  <p style={{ fontSize: 13.5, color: over ? "var(--alert)" : "var(--ink-4)", marginTop: 3 }}>
                    {over
                      ? `You are ₹${t.overBy}L over what the board approved.`
                      : `Leaves ₹${t.remainingLakh}L a year unspent. That is allowed, and sometimes right.`}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="display num" style={{ fontSize: 35, fontWeight: 700, letterSpacing: "-.03em", lineHeight: 1, color: over ? "var(--alert)" : "var(--ink)" }}>₹{t.spendLakh}L</div>
                  <div style={{ fontSize: 13, color: "var(--ink-4)", marginTop: 4 }}>of ₹{t.budgetLakh}L approved</div>
                </div>
              </div>

              <div style={{ height: 14, borderRadius: 999, background: "var(--paper-sunk)", overflow: "hidden", display: "flex" }}>
                {(["hire", "build", "redesign"] as const).map((k) => (
                  <div key={k} style={{ width: `${(t.byApproach[k] / t.budgetLakh) * 100}%`, background: TONE[k].fg }} />
                ))}
              </div>
              <div style={{ display: "flex", gap: 18, marginTop: 11, flexWrap: "wrap" }}>
                {(["hire", "build", "redesign"] as const).map((k) => (
                  <span key={k} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--ink-3)" }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: TONE[k].fg }} />
                    {k === "hire" ? "People you hired" : k === "build" ? "Systems you built" : "Ways of working you changed"} · ₹{t.byApproach[k]}L
                  </span>
                ))}
              </div>
            </Card>

            <Card style={{ padding: "6px 4px" }}>
              {chosen.length === 0 && <p style={{ padding: 18, fontSize: 14.5, color: "var(--ink-4)" }}>Nothing committed yet.</p>}
              {chosen.map((o) => {
                const problem = PROBLEM.get(o.problemId)!;
                const person = PERSON.get(board.gates[o.problemId] ?? "");
                const tone = TONE[o.approach];
                return (
                  <div key={`${o.problemId}-${o.approach}`} style={{ display: "flex", alignItems: "center", gap: 13, padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
                    <span style={{ width: 4, height: 34, borderRadius: 999, background: tone.fg, flexShrink: 0 }} />
                    <div style={{ flexGrow: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.3 }}>{o.title}</p>
                      <p style={{ fontSize: 12.5, color: "var(--ink-4)", marginTop: 2 }}>{problem.title}</p>
                    </div>
                    {person
                      ? <span style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}><Avatar id={person.id} size={24} /><span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{person.name}</span></span>
                      : <Pill fg="var(--alert)" bg="var(--alert-soft)">Nobody named</Pill>}
                    <span className="display num" style={{ fontSize: 15, fontWeight: 700, width: 56, textAlign: "right", flexShrink: 0 }}>₹{o.costLakh}L</span>
                  </div>
                );
              })}
              {t.obligations.filter((o) => o.active).map((o) => (
                <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 13, padding: "12px 16px", borderBottom: "1px solid var(--line)", background: "var(--gold-soft)" }}>
                  <span style={{ width: 4, height: 34, borderRadius: 999, background: "var(--gold)", flexShrink: 0 }} />
                  <div style={{ flexGrow: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.3 }}>{o.title}</p>
                    <p style={{ fontSize: 12.5, color: "var(--gold-ink)", marginTop: 2 }}>Cutesh requires this now — not optional</p>
                  </div>
                  <span className="display num" style={{ fontSize: 15, fontWeight: 700, width: 56, textAlign: "right", flexShrink: 0 }}>₹{o.costLakh}L</span>
                </div>
              ))}
            </Card>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Card>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, marginBottom: 16 }}>
                <div>
                  <h2 className="display" style={{ fontSize: 17.5, fontWeight: 700 }}>When each one starts actually helping</h2>
                  <p style={{ fontSize: 13.5, color: "var(--ink-4)", marginTop: 3 }}>Cutesh presents on day ninety. She would like something real before that.</p>
                </div>
                <Pill fg={t.landsBefore(4) > 0 ? "var(--flow-ink)" : "var(--gold-ink)"} bg={t.landsBefore(4) > 0 ? "var(--flow-soft)" : "var(--gold-soft)"}>
                  {t.landsBefore(4) === 0 ? "Nothing lands by day 30" : `${t.landsBefore(4)} land${t.landsBefore(4) === 1 ? "s" : ""} by day 30`}
                </Pill>
              </div>

              <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ position: "absolute", left: "calc(150px + 30%)", top: 0, bottom: 22, width: 2, background: "var(--gold)" }} />
                {chosen.map((o) => (
                  <div key={`${o.problemId}-${o.approach}-t`} style={{ display: "flex", alignItems: "center", gap: 12, height: 34 }}>
                    <span style={{ fontSize: 12.5, color: "var(--ink-3)", width: 150, flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.title}</span>
                    <div style={{ flexGrow: 1, minWidth: 0, height: 24, background: "var(--paper-sunk)", borderRadius: 8, position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", inset: `0 0 0 ${(o.liveWeek / maxWeek) * 100}%`, background: TONE[o.approach].fg, display: "flex", alignItems: "center", paddingLeft: 10 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: "#fff", whiteSpace: "nowrap" }}>from week {o.liveWeek}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {chosen.length === 0 && <p style={{ fontSize: 14, color: "var(--ink-4)", padding: "20px 0" }}>Nothing on the calendar yet.</p>}
                <div style={{ display: "flex", paddingLeft: 162, marginTop: 4 }}>
                  {["Week 1", "Week 4", "Week 8", "Week 12"].map((w) => (
                    <span key={w} className="num" style={{ flexGrow: 1, fontSize: 11.5, color: "var(--ink-5)" }}>{w}</span>
                  ))}
                </div>
              </div>
            </Card>

            {t.obligations.map((o) => (
              <div key={o.id} style={{ background: o.active ? "var(--gold-soft)" : "var(--paper-sunk)", borderRadius: "var(--r-lg)", padding: "16px 18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: o.active ? "var(--gold-ink)" : "var(--ink-4)" }}>
                    {o.active ? `Now required · ₹${o.costLakh}L` : "Not triggered yet"}
                  </span>
                </div>
                <h3 className="display" style={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.25 }}>{o.title}</h3>
                <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--ink-2)", marginTop: 6 }}>{o.text}</p>
              </div>
            ))}

            {problems.length > 0 && (
              <Card style={{ borderLeft: "4px solid var(--alert)" }}>
                <Eyebrow tone="var(--alert)">Before she will look at it</Eyebrow>
                <ul style={{ margin: "10px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                  {problems.slice(0, 6).map((b) => (
                    <li key={b.code} style={{ fontSize: 14, lineHeight: 1.5, color: "var(--ink-2)" }}>{b.text}</li>
                  ))}
                </ul>
                {problems.length > 6 && <p style={{ fontSize: 13, color: "var(--ink-4)", marginTop: 9 }}>and {problems.length - 6} more.</p>}
              </Card>
            )}
          </div>
        </div>
      </Page>
    </>
  );
}
