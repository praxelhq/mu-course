import type { CSSProperties, ReactNode } from "react";

// Tiny brand-compliant primitives (docs/BRAND.md): Parchment surfaces, Sand
// 1px borders, zero border radius (enforced globally in globals.css), Pine
// primary, Ochre single accent. Reused by admin/instructor pages.

export function Eyebrow({
  children,
  muted,
}: {
  children: ReactNode;
  /**
   * Clay instead of Ochre. Use inside the app shell, where the active nav
   * link already spends the view's single Ochre accent (BRAND rule 3).
   */
  muted?: boolean;
}) {
  return (
    <p
      style={{
        fontFamily: "var(--font-geist-mono)",
        fontSize: "0.75rem",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: muted ? "var(--clay)" : "var(--ochre)",
        margin: "0 0 0.75rem",
      }}
    >
      {children}
    </p>
  );
}

// Submission status chips — muted, bordered semantic colors (BRAND rule 5):
// never filled and loud, hierarchy from the 1px border and type only.
const STATUS_CHIP_COLORS: Record<string, string> = {
  draft: "var(--clay)",
  submitted: "var(--charcoal)",
  grading: "#8a6a1c", // muted dark amber — in progress, distinct from graded
  graded: "var(--pine)",
  finalised: "var(--pine)",
};

export function StatusChip({ status }: { status: string }) {
  const color = STATUS_CHIP_COLORS[status] ?? "var(--charcoal)";
  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: "var(--font-geist-mono)",
        fontSize: "0.6875rem",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color,
        border: `1px solid ${color}`,
        padding: "0.125rem 0.5rem",
        fontWeight: status === "finalised" ? 700 : 400,
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
}

// Shared cells for the simple data tables (dashboard, roster, costs, quiz
// results): the prevailing th/td styles; per-table tweaks merge on top via
// the style prop. The sticky-grid tables (matrix, unlock console) keep their
// own specialised cell styles.
const thBase: CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid var(--sand)",
  padding: "0.5rem 0",
  fontFamily: "var(--font-geist-mono)",
  fontSize: "0.75rem",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--clay)",
  fontWeight: 400,
};

const tdBase: CSSProperties = {
  borderBottom: "1px solid var(--sand)",
  padding: "0.625rem 0.75rem 0.625rem 0",
};

export function Th({
  children,
  style,
  title,
}: {
  children?: ReactNode;
  style?: CSSProperties;
  title?: string;
}) {
  return (
    <th title={title} style={{ ...thBase, ...style }}>
      {children}
    </th>
  );
}

export function Td({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  return <td style={{ ...tdBase, ...style }}>{children}</td>;
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
