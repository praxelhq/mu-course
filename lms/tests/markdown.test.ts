import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "../components/markdown";

// The grader returns markdown; students must see it rendered, and NOTHING in
// model- or student-derived text may become live markup.

const render = (md: string) => renderToStaticMarkup(createElement(Markdown, null, md));

describe("Markdown", () => {
  it("renders headings, bold and paragraphs from real grader feedback", () => {
    const html = render(
      "## Strong COSTAR Prompt\n\n**Strengths:** An exceptionally well-structured prompt.\n\n**Overall:** Mastery.",
    );
    expect(html).toContain("Strong COSTAR Prompt");
    expect(html).toContain("<strong>Strengths:</strong>");
    expect(html).not.toContain("##");
    expect(html).not.toContain("**");
  });

  it("renders bullet and numbered lists", () => {
    const bullets = render("- one\n- two");
    expect(bullets).toContain("<ul");
    expect(bullets).toMatch(/<li[^>]*>one<\/li>/);
    const numbered = render("1. first\n2. second");
    expect(numbered).toContain("<ol");
    expect(numbered).toMatch(/<li[^>]*>first<\/li>/);
  });

  it("never turns embedded HTML into live markup", () => {
    const html = render('Nice work <img src=x onerror="alert(1)"> and <script>bad()</script>');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;img");
  });
});
