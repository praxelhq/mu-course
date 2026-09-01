"use client";

import type { CSSProperties, ReactNode } from "react";
import { PERSON } from "@/lib/content/cast";

export const TONE = {
  hire: { fg: "var(--human)", soft: "var(--human-soft)", ink: "var(--human-ink)", word: "Hire a person" },
  build: { fg: "var(--ai)", soft: "var(--ai-soft)", ink: "var(--ai-ink)", word: "Build a system" },
  redesign: { fg: "var(--flow)", soft: "var(--flow-soft)", ink: "var(--flow-ink)", word: "Change the work" },
} as const;

export function Eyebrow({ children, tone = "var(--human)" }: { children: ReactNode; tone?: string }) {
  return (
    <p style={{ fontSize: 13, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: tone }}>
      {children}
    </p>
  );
}

export function Card({ children, style, onClick, className = "" }: { children: ReactNode; style?: CSSProperties; onClick?: () => void; className?: string }) {
  return (
    <div
      onClick={onClick}
      className={className}
      style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", boxShadow: "var(--lift-2)", padding: 20, ...style }}
    >
      {children}
    </div>
  );
}

export function Avatar({ id, size = 40, dark = false }: { id: string; size?: number; dark?: boolean }) {
  const person = PERSON.get(id);
  return (
    <div
      title={person ? `${person.name} — ${person.role}` : id}
      style={{
        width: size, height: size, borderRadius: 999, flexShrink: 0,
        background: dark ? "var(--gold)" : "var(--human)",
        color: dark ? "var(--deep)" : "#fff6ec",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font-serif), Georgia, serif", fontSize: size * 0.42,
      }}
    >
      {person?.initials ?? "??"}
    </div>
  );
}

/// A person saying something. Every briefing in the game is one of these —
/// nothing is explained by the interface in its own voice.
export function Says({ id, children, dark = false }: { id: string; children: ReactNode; dark?: boolean }) {
  const person = PERSON.get(id);
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
      <Avatar id={id} size={44} dark={dark} />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
          <span className="display" style={{ fontSize: 15, fontWeight: 700, color: dark ? "var(--on-deep)" : "var(--ink)" }}>{person?.name}</span>
          <span style={{ fontSize: 13.5, color: dark ? "var(--on-deep-3)" : "var(--ink-4)" }}>{person?.role}</span>
        </div>
        <div style={{ fontSize: 15.5, lineHeight: 1.6, color: dark ? "var(--on-deep-2)" : "var(--ink-2)" }}>{children}</div>
      </div>
    </div>
  );
}

export function Money({ lakh, size = 28, color }: { lakh: number; size?: number; color?: string }) {
  return (
    <span className="display num" style={{ fontSize: size, fontWeight: 700, letterSpacing: "-.02em", color: color ?? "var(--ink)", lineHeight: 1 }}>
      ₹{lakh}L
    </span>
  );
}

export function Pill({ children, fg, bg }: { children: ReactNode; fg: string; bg: string }) {
  return (
    <span style={{ background: bg, color: fg, borderRadius: 999, padding: "5px 11px", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

export function Button({ children, onClick, tone = "primary", disabled, wide }: {
  children: ReactNode; onClick?: () => void; tone?: "primary" | "quiet" | "danger"; disabled?: boolean; wide?: boolean;
}) {
  const styles: Record<string, CSSProperties> = {
    primary: { background: "var(--human)", color: "#fff6ec", boxShadow: "0 2px 4px rgba(200,98,43,.2), 0 8px 20px rgba(200,98,43,.22)" },
    quiet: { background: "var(--paper-sunk)", color: "var(--ink-2)" },
    danger: { background: "var(--alert)", color: "#fff6ec" },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="lift"
      style={{
        borderRadius: "var(--r-md)", padding: "14px 24px", minHeight: 48,
        fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700,
        width: wide ? "100%" : undefined,
        opacity: disabled ? 0.45 : 1, cursor: disabled ? "not-allowed" : "pointer",
        ...styles[tone],
      }}
    >
      {children}
    </button>
  );
}

export function WordCount({ text, min, max }: { text: string; min: number; max?: number }) {
  const n = text.trim().split(/\s+/u).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  const ok = n >= min && (max === undefined || n <= max);
  return (
    <span aria-live="polite" style={{ fontSize: 12.5, color: ok ? "var(--flow)" : "var(--ink-4)" }}>
      {n === 0
        ? `At least ${min} words.`
        : ok
          ? `${n} words — that will do.`
          : max !== undefined && n > max
            ? `${n} words. Trim it to ${max}.`
            : `${n} words. ${min - n} more.`}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Selection, not typing
// ---------------------------------------------------------------------------

const QUALITY_STYLE = {
  strong: { fg: "var(--flow-ink)", bg: "var(--flow-soft)", edge: "var(--flow)", label: "That holds up" },
  workable: { fg: "var(--gold-ink)", bg: "var(--gold-soft)", edge: "var(--gold)", label: "Defensible" },
  weak: { fg: "var(--alert-ink)", bg: "var(--alert-soft)", edge: "var(--alert)", label: "That will not survive the board" },
} as const;

export type ChoiceOption = { id: string; text: string; note?: string; quality?: "strong" | "workable" | "weak" };

/**
 * A question with options, and — once answered — the reason that answer is or
 * is not good enough. The feedback is the point: a wrong pick names the
 * specific misunderstanding faster than a paragraph would.
 */
export function Choose({ label, hint, options, value, onPick, showQuality = true, disabled }: {
  label: string;
  hint?: string;
  options: readonly ChoiceOption[];
  value: string | null;
  onPick: (id: string) => void;
  showQuality?: boolean;
  disabled?: boolean;
}) {
  const chosen = options.find((o) => o.id === value);
  const q = chosen?.quality ? QUALITY_STYLE[chosen.quality] : null;

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <p className="display" style={{ fontSize: 15.5, fontWeight: 700 }}>{label}</p>
        {hint && <p style={{ fontSize: 13, color: "var(--ink-4)", marginTop: 3, lineHeight: 1.45 }}>{hint}</p>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {options.map((o) => {
          const on = value === o.id;
          return (
            <button
              key={o.id}
              onClick={() => !disabled && onPick(o.id)}
              disabled={disabled}
              aria-pressed={on}
              className={disabled ? "" : "lift"}
              style={{
                textAlign: "left", borderRadius: "var(--r-md)", padding: "12px 14px", minHeight: 48,
                background: on ? "var(--ink)" : "var(--paper-sunk)",
                color: on ? "var(--paper)" : "var(--ink-2)",
                fontSize: 14.5, lineHeight: 1.5,
                cursor: disabled ? "default" : "pointer",
                display: "flex", gap: 11, alignItems: "flex-start",
              }}
            >
              <span style={{
                flexShrink: 0, width: 17, height: 17, borderRadius: 999, marginTop: 2,
                border: `2px solid ${on ? "var(--gold)" : "var(--ink-5)"}`,
                background: on ? "var(--gold)" : "transparent",
              }} />
              <span>{o.text}</span>
            </button>
          );
        })}
      </div>

      {chosen?.note && (
        <div className="rise" style={{
          marginTop: 11, borderRadius: "var(--r-md)", padding: "13px 15px",
          background: q?.bg ?? "var(--paper-sunk)", borderLeft: `3px solid ${q?.edge ?? "var(--ink-5)"}`,
        }}>
          {showQuality && q && (
            <p style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: q.fg, marginBottom: 5 }}>
              {q.label}
            </p>
          )}
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)" }}>{chosen.note}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Put the steps in the order you would actually do them. Incident response has
 * a shape — stop, contain, diagnose, fix, verify, restore — and the fastest way
 * to learn it is to get it wrong once and be told what that cost.
 */
export function Reorder({ items, order, onChange, disabled }: {
  items: readonly { id: string; text: string }[];
  order: readonly string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const list = order.length === items.length ? order : items.map((i) => i.id);

  const move = (from: number, to: number) => {
    if (disabled || to < 0 || to >= list.length) return;
    const next = [...list];
    const [taken] = next.splice(from, 1);
    next.splice(to, 0, taken);
    onChange(next);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {list.map((id, i) => {
        const item = items.find((x) => x.id === id);
        if (!item) return null;
        return (
          <div
            key={id}
            draggable={!disabled}
            onDragStart={(e) => e.dataTransfer.setData("text/plain", String(i))}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); move(Number(e.dataTransfer.getData("text/plain")), i); }}
            style={{
              background: "var(--surface)", borderRadius: "var(--r-md)", boxShadow: "var(--lift-1)",
              padding: "11px 12px", display: "flex", gap: 12, alignItems: "center",
              cursor: disabled ? "default" : "grab",
            }}
          >
            <span className="display num" style={{
              flexShrink: 0, width: 26, height: 26, borderRadius: 8, background: "var(--paper-sunk)",
              color: "var(--ink-4)", fontSize: 13, fontWeight: 700, display: "grid", placeItems: "center",
            }}>{i + 1}</span>
            <span style={{ flexGrow: 1, minWidth: 0, fontSize: 14.5, lineHeight: 1.45 }}>{item.text}</span>
            {!disabled && (
              <span style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                <button onClick={() => move(i, i - 1)} aria-label="Move earlier" style={{ padding: "3px 7px", borderRadius: 5, background: "var(--paper-sunk)", lineHeight: 1 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 15l6-6 6 6" /></svg>
                </button>
                <button onClick={() => move(i, i + 1)} aria-label="Move later" style={{ padding: "3px 7px", borderRadius: 5, background: "var(--paper-sunk)", lineHeight: 1 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                </button>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/// A consequence, stated at the weight it deserves.
export function Consequence({ tone, head, children }: {
  tone: "bad" | "good" | "warn"; head: string; children: React.ReactNode;
}) {
  const style = {
    bad: { bg: "var(--alert-soft)", fg: "var(--alert-ink)", edge: "var(--alert)" },
    good: { bg: "var(--flow-soft)", fg: "var(--flow-ink)", edge: "var(--flow)" },
    warn: { bg: "var(--gold-soft)", fg: "var(--gold-ink)", edge: "var(--gold)" },
  }[tone];
  return (
    <div className="rise" style={{ background: style.bg, borderRadius: "var(--r-lg)", borderLeft: `4px solid ${style.edge}`, padding: "16px 18px" }}>
      <p className="display" style={{ fontSize: 14.5, fontWeight: 700, color: style.fg, marginBottom: 7 }}>{head}</p>
      <div style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--ink-2)" }}>{children}</div>
    </div>
  );
}
