import type React from "react";

// Minimal markdown renderer for AI feedback (and any other short markdown we
// show students). Deliberately dependency-free and deliberately NOT
// HTML-injecting: every node is a real React element, so model- or
// student-derived text can never introduce markup. Supports exactly what the
// grader emits — headings, bold, italics, inline code, bullet and numbered
// lists, and blank-line-separated paragraphs. Anything else renders as plain
// text rather than showing raw syntax.

/** Split one line into bold / italic / code spans. */
function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Order matters: ** before * so bold wins over italics.
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|_[^_]+_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-i${i++}`;
    if (tok.startsWith("**")) {
      nodes.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("`")) {
      nodes.push(
        <code key={key} style={{ fontFamily: "var(--font-geist-mono)", fontSize: "0.9em" }}>
          {tok.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(<em key={key}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const HEADING_SIZES: Record<number, string> = { 1: "1.35rem", 2: "1.15rem", 3: "1rem" };

export function Markdown({ children }: { children: string }) {
  const lines = (children ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length === 0) return;
    const text = para.join(" ");
    blocks.push(
      <p key={`p${blocks.length}`} style={{ margin: "0 0 0.75rem", lineHeight: 1.65 }}>
        {inline(text, `p${blocks.length}`)}
      </p>,
    );
    para = [];
  };

  const flushList = () => {
    if (!list) return;
    const { ordered, items } = list;
    const Tag = (ordered ? "ol" : "ul") as "ol" | "ul";
    blocks.push(
      <Tag key={`l${blocks.length}`} style={{ margin: "0 0 0.75rem", paddingLeft: "1.25rem", lineHeight: 1.65 }}>
        {items.map((it, n) => (
          <li key={n} style={{ marginBottom: "0.2rem" }}>
            {inline(it, `l${blocks.length}-${n}`)}
          </li>
        ))}
      </Tag>,
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trim() === "") {
      flushPara();
      flushList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      const level = heading[1].length;
      const Tag = `h${Math.min(level + 2, 6)}` as "h3" | "h4" | "h5";
      blocks.push(
        <Tag
          key={`h${blocks.length}`}
          style={{ fontSize: HEADING_SIZES[level] ?? "1rem", margin: "1rem 0 0.5rem", lineHeight: 1.3 }}
        >
          {inline(heading[2], `h${blocks.length}`)}
        </Tag>,
      );
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushPara();
      const ordered = Boolean(numbered);
      const item = (bullet ?? numbered)![1];
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push(item);
      continue;
    }

    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();

  return <>{blocks}</>;
}
