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
