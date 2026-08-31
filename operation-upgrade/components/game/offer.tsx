"use client";

import { COMPANY, MEERA_RULES, OPENING_LETTER } from "@/lib/content/cast";
import { Avatar, Button, Card, Eyebrow } from "@/components/ui";

const RULE_TONE: Record<string, { bg: string; fg: string }> = {
  human: { bg: "var(--human-soft)", fg: "var(--human)" },
  flow: { bg: "var(--flow-soft)", fg: "var(--flow)" },
  ai: { bg: "var(--ai-soft)", fg: "var(--ai)" },
  gold: { bg: "var(--gold-soft)", fg: "var(--gold-ink)" },
  plain: { bg: "var(--paper-sunk)", fg: "var(--ink-3)" },
};

export function Offer({ onStart }: { onStart: () => void }) {
  return (
    <div>
      <div style={{ background: "var(--deep)", color: "var(--on-deep)", padding: "clamp(36px, 6vw, 64px) clamp(16px, 3vw, 32px) clamp(80px, 9vw, 108px)", position: "relative", overflow: "hidden" }}>
        <div aria-hidden style={{ position: "absolute", right: -140, top: -180, width: 620, height: 620, borderRadius: 999, background: "var(--deep-2)" }} />
        <div aria-hidden style={{ position: "absolute", right: 70, top: -70, width: 340, height: 340, borderRadius: 999, background: "var(--deep-3)" }} />
        <div style={{ position: "relative", maxWidth: 1180, margin: "0 auto" }}>
          <Eyebrow tone="var(--gold)">Day zero</Eyebrow>
          <h1 className="serif" style={{ fontSize: "clamp(40px, 7vw, 70px)", lineHeight: 1.02, letterSpacing: "-.018em", margin: "14px 0 18px", color: "var(--on-deep)" }}>
            Meera Iyer would like to<br />hire you for ninety days.
          </h1>
          <p style={{ fontSize: 18.5, lineHeight: 1.55, color: "var(--on-deep-2)", maxWidth: 640 }}>
            She runs a food business that has grown faster than the way it works. She has read enough about AI to be curious and enough to be wary, and she is not going to tell you what to build.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1180, margin: "-64px auto 0", padding: "0 clamp(16px, 3vw, 32px) 80px", display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(0, 1fr)", gap: 26, alignItems: "start" }} className="rise">
        <Card style={{ padding: "clamp(24px, 3vw, 40px)", boxShadow: "var(--lift-3)", borderRadius: "var(--r-xl)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 15, marginBottom: 26 }}>
            <Avatar id="meera" size={56} />
            <div>
              <div className="display" style={{ fontSize: 19, fontWeight: 700 }}>Meera Iyer</div>
              <div style={{ fontSize: 14, color: "var(--ink-4)" }}>Founder and Managing Director</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
            {OPENING_LETTER.map((para) => (
              <p key={para.slice(0, 24)} style={{ fontSize: 16.5, lineHeight: 1.68, color: "var(--ink-2)" }}>{para}</p>
            ))}
          </div>

          <div style={{ marginTop: 30, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 22, flexWrap: "wrap" }}>
            <div>
              <div className="serif" style={{ fontSize: 34, fontStyle: "italic", color: "var(--human)", lineHeight: 1 }}>Meera</div>
              <div style={{ fontSize: 13, color: "var(--ink-5)", marginTop: 8 }}>Sent from her phone, 6:48 on a Tuesday morning</div>
            </div>
            <Button onClick={onStart}>Take the job →</Button>
          </div>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 64 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <Card style={{ flexGrow: 1, padding: 20 }}>
              <div className="display num" style={{ fontSize: 32, fontWeight: 700, color: "var(--human)", letterSpacing: "-.025em", lineHeight: 1 }}>₹{COMPANY.budgetLakh}L</div>
              <div style={{ fontSize: 14, lineHeight: 1.4, color: "var(--ink-3)", marginTop: 9 }}>a year, for as long as your plan runs</div>
            </Card>
            <Card style={{ flexGrow: 1, padding: 20 }}>
              <div className="display num" style={{ fontSize: 32, fontWeight: 700, color: "var(--deep)", letterSpacing: "-.025em", lineHeight: 1 }}>{COMPANY.days}</div>
              <div style={{ fontSize: 14, lineHeight: 1.4, color: "var(--ink-3)", marginTop: 9 }}>days until she presents to the board</div>
            </Card>
          </div>

          <Card>
            <h2 className="display" style={{ fontSize: 17.5, fontWeight: 700 }}>The five things she will not bend on</h2>
            <p style={{ fontSize: 13.5, color: "var(--ink-4)", margin: "6px 0 18px" }}>She said each of these out loud, twice.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
              {MEERA_RULES.map((rule) => {
                const tone = RULE_TONE[rule.tone];
                return (
                  <div key={rule.n} style={{ display: "flex", gap: 13, alignItems: "flex-start" }}>
                    <span style={{ width: 26, height: 26, borderRadius: 999, background: tone.bg, color: tone.fg, display: "grid", placeItems: "center", flexShrink: 0, marginTop: 1 }}>
                      <span className="display num" style={{ fontSize: 13, fontWeight: 700 }}>{rule.n}</span>
                    </span>
                    <span style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--ink-2)" }}>{rule.text}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          <div style={{ background: "var(--human-soft)", borderRadius: "var(--r-lg)", padding: "16px 20px", display: "flex", gap: 13, alignItems: "flex-start" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--human)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><path d="M12 16.5v.01" />
            </svg>
            <p style={{ fontSize: 14, lineHeight: 1.55, color: "var(--human-ink)" }}>
              Everything about Bharat Bites here is invented for the session. No real company, no real person, no real money.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
