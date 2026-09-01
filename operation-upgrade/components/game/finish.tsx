"use client";

import { useMemo, useState } from "react";
import { AI_RADAR, COMMITMENT_PROMPT, CLOSING_QUESTIONS } from "@/lib/content/radar";
import { composeMemo, headlineText } from "@/lib/engine/memo";
import { blockers } from "@/lib/engine/validate";
import { HEADLINE_OPENERS, HEADLINE_MIDDLES, HEADLINE_CLOSERS, COMMITMENT_TARGETS, COMMITMENT_EVIDENCE } from "@/lib/content/choices";
import { brainReport } from "@/lib/engine/brain";
import type { Board } from "@/lib/engine/types";
import { Button, Card, Choose, Eyebrow } from "@/components/ui";
import { Briefing, Page } from "./shell";

export function Memo({ board, update }: { board: Board; update: (fn: (b: Board) => Board) => void }) {
  const [copied, setCopied] = useState(false);
  const problems = blockers(board);
  const markdown = useMemo(() => composeMemo(board), [board]);
  const brain = brainReport(board.indexed, board.asked);
  const locked = Boolean(board.lockedAt);

  function download() {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${board.handle.replace(/\s+/g, "-").toLowerCase()}-bharat-bites.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Briefing speakerId="cutesh">
        {locked
          ? "“Got it. That is what I am taking to the board. Thank you — genuinely.”"
          : "“One page. What you are changing, what it costs, who is accountable, and what you are leaving alone. Then read me the seventy-five seconds.”"}
      </Briefing>
      <Page wide>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 400px)", gap: 18, alignItems: "start" }}>
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
              <Eyebrow>Composed from what you decided</Eyebrow>
              <h1 className="serif" style={{ fontSize: "clamp(24px, 3vw, 32px)", lineHeight: 1.12, marginTop: 8 }}>Ninety days at Bharat Bites</h1>
            </div>
            <pre className="scroll" style={{
              margin: 0, padding: "22px 24px", maxHeight: "58vh", overflow: "auto",
              fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.7, color: "var(--ink-2)",
              whiteSpace: "pre-wrap", wordBreak: "break-word", background: "var(--paper-sunk)",
            }}>{markdown}</pre>
          </Card>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Card>
              <h2 className="display" style={{ fontSize: 16.5, fontWeight: 700 }}>Your seventy-five seconds</h2>
              <p style={{ fontSize: 13.5, color: "var(--ink-3)", margin: "5px 0 12px" }}>
                If the room picks your plan, this is what you stand up and say. Three lines — pick each one.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <Choose label="Open with" options={HEADLINE_OPENERS} value={board.headline.opener}
                  showQuality={false} disabled={locked}
                  onPick={(id) => update((b) => ({ ...b, headline: { ...b.headline, opener: id } }))} />
                <Choose label="Then the substance" options={HEADLINE_MIDDLES} value={board.headline.middle}
                  showQuality={false} disabled={locked}
                  onPick={(id) => update((b) => ({ ...b, headline: { ...b.headline, middle: id } }))} />
                <Choose label="And land it" options={HEADLINE_CLOSERS} value={board.headline.closer}
                  showQuality={false} disabled={locked}
                  onPick={(id) => update((b) => ({ ...b, headline: { ...b.headline, closer: id } }))} />
              </div>
              {board.headline.opener && board.headline.middle && board.headline.closer && (
                <div className="rise" style={{ marginTop: 16, background: "var(--deep)", color: "var(--on-deep)", borderRadius: "var(--r-lg)", padding: "16px 18px" }}>
                  <p style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--gold)", marginBottom: 8 }}>What you will say</p>
                  <p className="serif" style={{ fontSize: 19, lineHeight: 1.4 }}>{headlineText(board)}</p>
                </div>
              )}
            </Card>

            {brain.asked > 0 && (
              <Card style={{ background: brain.harmful > 0 ? "var(--alert-soft)" : "var(--flow-soft)", boxShadow: "none" }}>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: brain.harmful > 0 ? "var(--alert-ink)" : "var(--flow-ink)" }}>
                  {brain.harmful > 0
                    ? `${brain.harmful} of the ${brain.asked} questions you tested came back in a way that would have caused a problem. You found that on the bench instead of in a shop — say so when you present.`
                    : `All ${brain.asked} questions you tested came back correct or refused. Nothing your brain said would have got a store manager into trouble.`}
                </p>
              </Card>
            )}

            {!locked && problems.length > 0 && (
              <Card style={{ borderLeft: "4px solid var(--alert)" }}>
                <Eyebrow tone="var(--alert)">Still to do</Eyebrow>
                <ul style={{ margin: "10px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                  {problems.slice(0, 5).map((b) => <li key={b.code} style={{ fontSize: 14, lineHeight: 1.5 }}>{b.text}</li>)}
                </ul>
                {problems.length > 5 && <p style={{ fontSize: 13, color: "var(--ink-4)", marginTop: 9 }}>and {problems.length - 5} more.</p>}
              </Card>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {!locked && (
                <Button wide disabled={problems.length > 0} onClick={() => update((b) => ({ ...b, lockedAt: new Date().toISOString() }))}>
                  {problems.length > 0 ? `${problems.length} thing${problems.length === 1 ? "" : "s"} left before you can lock` : "Lock it and show Cutesh"}
                </Button>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <Button tone="quiet" onClick={() => { void navigator.clipboard.writeText(markdown); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                  {copied ? "Copied" : "Copy memo"}
                </Button>
                <Button tone="quiet" onClick={download}>Download it</Button>
              </div>
            </div>

            <Card style={{ background: "var(--paper-sunk)", boxShadow: "none" }}>
              <Eyebrow tone="var(--ink-4)">Optional, if you want the Session 9 callback</Eyebrow>
              <p style={{ fontSize: 14, lineHeight: 1.55, color: "var(--ink-3)", marginTop: 8 }}>
                Download the file, drop it into the starter repository under <code>submissions/</code>, and open a pull request. Nothing here depends on it — the memo above is the submission.
              </p>
            </Card>
          </div>
        </div>
      </Page>
    </>
  );
}

export function Close({ board, update }: { board: Board; update: (fn: (b: Board) => Board) => void }) {
  const toggle = (key: string) =>
    update((b) => ({ ...b, radar: b.radar.includes(key) ? b.radar.filter((r) => r !== key) : [...b.radar, key] }));

  const counts = {
    people: board.radar.filter((r) => r.startsWith("p:")).length,
    news: board.radar.filter((r) => r.startsWith("n:")).length,
    pod: board.radar.filter((r) => r.startsWith("c:")).length,
    org: board.radar.filter((r) => r.startsWith("o:")).length,
  };

  return (
    <>
      <Briefing speakerId="cutesh">
        “That is ninety days. Whatever happens to Bharat Bites next, the habit you just practised is yours — look at the work, decide what should change, and know who stays accountable.”
      </Briefing>
      <Page>
        <h1 className="serif" style={{ fontSize: "clamp(28px, 4vw, 40px)", lineHeight: 1.08, letterSpacing: "-.015em", marginBottom: 8 }}>
          What you follow after Friday.
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: "var(--ink-3)", maxWidth: 660, marginBottom: 24 }}>
          Three people, two newsletters, one podcast, three official feeds. Not everything — enough that you notice when something genuinely changes, and can tell it from noise.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 250px), 1fr))", gap: 14, marginBottom: 20 }}>
          <RadarCol title="Three people" sub={`${counts.people} of 3 — one operator, one builder, one sceptic`}>
            {AI_RADAR.people.map((p) => (
              <Check key={p.name} on={board.radar.includes(`p:${p.name}`)} onClick={() => toggle(`p:${p.name}`)} label={p.name} note={p.lens} />
            ))}
          </RadarCol>
          <RadarCol title="Two newsletters" sub={`${counts.news} of 2 — one broad, one deep`}>
            {AI_RADAR.newsletters.map((n) => (
              <Check key={n.name} on={board.radar.includes(`n:${n.name}`)} onClick={() => toggle(`n:${n.name}`)} label={n.name} note={n.note} href={n.url} />
            ))}
          </RadarCol>
          <RadarCol title="One podcast" sub={`${counts.pod} of 1 — pick exactly one`}>
            {AI_RADAR.podcasts.map((p) => (
              <Check key={p} on={board.radar.includes(`c:${p}`)} onClick={() => toggle(`c:${p}`)} label={p} />
            ))}
          </RadarCol>
          <RadarCol title="Three official feeds" sub={`${counts.org} of 3 — the source, not the summary`}>
            {AI_RADAR.organisations.flatMap((g) => g.names.map((n) => (
              <Check key={n} on={board.radar.includes(`o:${n}`)} onClick={() => toggle(`o:${n}`)} label={n} note={g.group} />
            )))}
          </RadarCol>
        </div>

        <Card style={{ borderLeft: "4px solid var(--gold)" }}>
          <Eyebrow tone="var(--gold-ink)">Thirty-day commitment</Eyebrow>
          <p style={{ fontSize: 15, color: "var(--ink-3)", margin: "8px 0 16px" }}>{COMMITMENT_PROMPT}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 12 }}>
            <Choose label="I will use AI to improve…" options={COMMITMENT_TARGETS} showQuality={false}
              value={board.commitment.target}
              onPick={(id) => update((b) => ({ ...b, commitment: { ...b.commitment, target: id } }))} />
            <Choose label="The evidence it worked will be…" options={COMMITMENT_EVIDENCE} showQuality={false}
              value={board.commitment.evidence}
              onPick={(id) => update((b) => ({ ...b, commitment: { ...b.commitment, evidence: id } }))} />
          </div>
        </Card>

        <Card style={{ marginTop: 14, background: "var(--deep)", color: "var(--on-deep)" }}>
          <Eyebrow tone="var(--gold)">Before you go</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {CLOSING_QUESTIONS.map((q) => (
              <p key={q} className="serif" style={{ fontSize: 21, lineHeight: 1.35, color: "var(--on-deep)" }}>{q}</p>
            ))}
          </div>
        </Card>
      </Page>
    </>
  );
}

function RadarCol({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <Card style={{ padding: 18 }}>
      <h2 className="display" style={{ fontSize: 16, fontWeight: 700 }}>{title}</h2>
      <p style={{ fontSize: 12.5, color: "var(--ink-4)", margin: "3px 0 12px", lineHeight: 1.4 }}>{sub}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>{children}</div>
    </Card>
  );
}

function Check({ on, onClick, label, note, href }: { on: boolean; onClick: () => void; label: string; note?: string; href?: string }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "5px 0" }}>
      <button onClick={onClick} aria-pressed={on} style={{
        width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 2,
        background: on ? "var(--flow)" : "var(--paper-sunk)",
        border: on ? "none" : "1.5px solid var(--line-strong)", display: "grid", placeItems: "center",
      }}>
        {on && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l6 6L20 6" /></svg>}
      </button>
      <span style={{ minWidth: 0 }}>
        {href
          ? <a href={href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, fontWeight: 500 }}>{label}</a>
          : <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>{label}</span>}
        {note && <span style={{ fontSize: 12.5, color: "var(--ink-4)", display: "block", lineHeight: 1.4 }}>{note}</span>}
      </span>
    </div>
  );
}
