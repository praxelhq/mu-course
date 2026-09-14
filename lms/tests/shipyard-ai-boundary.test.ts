// The AI-gateway boundary, enforced by a grep over the source tree rather than
// by convention — the same idea as scripts/check-evaluator-boundary.mjs.
//
// Two rules (SPEC §2, docs/shipyard/ARCHITECTURE.md §1):
//   1. Only lib/ai/ may import a provider SDK. The Shipyard speaks OpenRouter;
//      Course 1's Anthropic client lives in lib/ai/client.ts and stays there.
//   2. Only lib/ai/openrouter.ts may speak HTTP to openrouter.ai.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "..");

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "out",
  "output",
  "test-results",
  "coverage",
  ".hypothesis",
  "tmp",
]);
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".mjs", ".js", ".jsx"];

function sourceFiles(dir = repoRoot, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".") && entry !== ".env.example") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      sourceFiles(full, acc);
    } else if (SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      acc.push(relative(repoRoot, full).split(sep).join("/"));
    }
  }
  return acc;
}

const FILES = sourceFiles();

/**
 * The boundary governs SHIPPED code. Tests and e2e specs name the URL and the
 * model slugs on purpose — asserting the contract is the opposite of drifting
 * from it — so they are excluded rather than granted an exception each time.
 */
const isShipped = (path: string) => !path.startsWith("tests/") && !path.startsWith("e2e/");

/** Shipped source files whose text matches. */
function filesMatching(pattern: RegExp): string[] {
  return FILES.filter(
    (path) => isShipped(path) && pattern.test(readFileSync(join(repoRoot, path), "utf8")),
  ).sort();
}

describe("AI gateway boundary", () => {
  it("sees a real source tree", () => {
    expect(FILES.length).toBeGreaterThan(100);
    expect(FILES).toContain("lib/ai/openrouter.ts");
    expect(FILES).toContain("lib/ai/client.ts");
  });

  it("only lib/ai/ imports a provider SDK", () => {
    const offenders = filesMatching(/@anthropic-ai\/sdk/).filter(
      (path) => !path.startsWith("lib/ai/"),
    );
    expect(offenders, `provider SDK imported outside lib/ai/: ${offenders.join(", ")}`).toEqual([]);
  });

  it("only lib/ai/openrouter.ts speaks to openrouter.ai", () => {
    const offenders = filesMatching(/openrouter\.ai/).filter(
      (path) => path !== "lib/ai/openrouter.ts",
    );
    expect(offenders, `openrouter.ai reached from: ${offenders.join(", ")}`).toEqual([]);
  });

  it("the Shipyard's own modules never touch the Anthropic SDK", () => {
    const offenders = filesMatching(/@anthropic-ai\/sdk/).filter(
      (path) =>
        path.startsWith("lib/shipyard/") ||
        path.startsWith("lib/tracker/") ||
        path.startsWith("app/shipyard/") ||
        path.startsWith("app/api/shipyard/") ||
        path.startsWith("components/shipyard/") ||
        path === "worker/shipyard.ts",
    );
    expect(offenders).toEqual([]);
  });

  it("model slugs live in the routing table alone", () => {
    const offenders = filesMatching(/["'`]z-ai\/glm/).filter((path) => path !== "lib/ai/router.ts");
    expect(offenders, `model slug named outside the routing table: ${offenders.join(", ")}`).toEqual(
      [],
    );
  });

  it("the grep is not vacuous — it finds what is genuinely there", () => {
    expect(filesMatching(/@anthropic-ai\/sdk/)).toEqual(["lib/ai/client.ts"]);
    expect(filesMatching(/openrouter\.ai/)).toEqual(["lib/ai/openrouter.ts"]);
    expect(filesMatching(/["'`]z-ai\/glm/)).toEqual(["lib/ai/router.ts"]);
  });
});
