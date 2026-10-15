/** Opt-in live regression cases distilled from checkpoint-one appeals. */
import { writeFileSync } from "node:fs";
import { callStudio } from "../lib/ai/studio";
import { normaliseStudioReview, reviewSchema } from "../lib/shipyard/studio/contracts";
import { reviewPrompt } from "../lib/shipyard/studio/prompts";

async function main() {
  if (!process.argv.includes("--allow-paid")) throw new Error("Use --allow-paid for live model evaluation.");
  const fixtures = [
    { name: "simple-game-without-team-cv", expected: "pass", description: "A browser pet game for animal-game fans. Players collect three pets, train them in a single-player local battle loop and save their progress. Players can buy a cosmetic pack once. We will demo it in college gaming groups. Ranked multiplayer and auctions are later features.", landing: "Play the local demo. Collect, train and battle three pets. Optional cosmetic pack: ₹199 once. Multiplayer and auctions are planned for later." },
    { name: "diary-without-invented-moderation-service", expected: "pass", description: "A digital diary for writers to save private notes on custom shelves, choose a pen name and optionally share individual notes in a reading room. Users pay ₹149 per month for extra shelves and exports. Reach the first writers through journaling communities.", landing: "Private by default. Choose which notes to share. Free notebook; premium shelves and exports ₹149/month. Join the journaling community." },
    { name: "one-time-digital-gift", expected: "pass", description: "A self-serve scrapbook maker for couples. Upload photos and messages, choose one of three templates, preview and pay ₹99 once to download the PDF. Buyers handle any printing themselves. Find first buyers through college groups and Instagram. No physical production or delivery by us.", landing: "Create a personal scrapbook. Preview free; download the PDF for ₹99. Print it yourself if you want." },
    { name: "physical-fulfilment-remains-revision", expected: "revise", description: "We sell physical scrapbooks for ₹149. Buyers upload photos through our web form. We manually arrange every design, print, package and deliver every order. Reach customers through Instagram.", landing: "Order your physical gift. We personally design, print, pack and ship it to you." },
    { name: "real-scope-blocker-remains-revision", expected: "revise", description: "Build a global massively multiplayer world with custom foundation-model training, a new operating system, proprietary game engine and international physical prize delivery in eight weeks.", landing: "Our custom engine and model will power the global real-time world and fulfil physical prizes." },
  ];
  const results = [];
  for (const fixture of fixtures) {
    const result = await callStudio({
      task: "verdict", system: reviewPrompt(1), schema: reviewSchema, temperature: 0,
      user: JSON.stringify({ submission: { fields: { title: fixture.name, description: fixture.description, landingUrl: "https://example.com/product" } }, evidence: [], landing: { accessible: true, text: fixture.landing } }),
    });
    const decision = normaliseStudioReview(1, result.data).decision;
    const row = { name: fixture.name, expected: fixture.expected, actual: decision, matched: decision === fixture.expected, review: result.data, costUsd: result.costUsd };
    results.push(row);
    console.log(JSON.stringify({ name: row.name, expected: row.expected, actual: row.actual, matched: row.matched, costUsd: row.costUsd }));
  }
  const output = process.argv.find((x) => x.startsWith("--output="))?.slice(9);
  if (output) writeFileSync(output, JSON.stringify(results, null, 2));
  if (results.some((r) => !r.matched)) process.exitCode = 1;
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Evaluation failed"); process.exitCode = 1; });
