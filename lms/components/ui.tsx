import type { CSSProperties, ReactNode } from "react";

// Tiny brand-compliant primitives (docs/BRAND.md): Parchment surfaces, Sand
// 1px borders, zero border radius (enforced globally in globals.css), Pine
// primary, Ochre single accent. Reused by admin/instructor pages.

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        fontFamily: "var(--font-geist-mono)",
        fontSize: "0.75rem",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--ochre)",
        margin: "0 0 0.75rem",
      }}
    >
      {children}
    </p>
  );
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section
      style={{
        border: "1px solid var(--sand)",
        background: "var(--parchment)",
        padding: "1.5rem",
        ...style,
      }}
    >
      {children}
    </section>
  );
}

export function Button({
  children,
  type = "button",
  disabled,
  onClick,
}: {
  children: ReactNode;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{
        fontFamily: "var(--font-geist-sans)",
        fontSize: "0.9375rem",
        background: disabled ? "var(--clay)" : "var(--pine)",
        color: "var(--cream)",
        border: "1px solid var(--pine)",
        padding: "0.625rem 1.25rem",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
