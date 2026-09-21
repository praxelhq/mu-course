// Live behavioural regression checks. Uses the Shipyard key, no database writes.
// Run: pnpm exec tsx scripts/shipyard-coach-eval.ts
import { callStudio } from "../lib/ai/studio";
import { coachSchema } from "../lib/shipyard/studio/contracts";
import { COACH_PROMPT } from "../lib/shipyard/studio/prompts";
import type { ConversationTurn } from "../lib/ai/client";
import { coachConversation } from "../lib/shipyard/studio/coach-context";

const calendar: ConversationTurn[] = [
  { role: "user", content: "Neartrust is a compliance calendar for Indian food brands, tracking FSSAI, GST and trademark dates. I assume missed renewals cost at least five lakh rupees, so they will pay 499 a month." },
  { role: "assistant", content: "The compliance calendar has a strong payoff ratio. Check APIs and find 25 customers." },
];
const chatnama = "New idea: Chatnama turns an exported WhatsApp chat into a funny friendship story. Parse exported text in the browser; raw messages stay local. Show message counts, emojis and eight shareable cards. Send only aggregate statistics to AI for an optional roast. Free teaser, 49 rupees for the full story; a 149 rupee video gift edition can wait. First buyers are friends gifting on birthdays. Review this new idea.";
const cases = [
  { name: "switch-away-from-stale-brief", history: calendar, message: chatnama },
  { name: "respect-chosen-one-time-product", history: [...calendar, { role: "user" as const, content: chatnama }, { role: "assistant" as const, content: "One-time purchases are fragile. You should choose the compliance calendar instead." }], message: "I want to go with Chatnama. Give me a small build plan and a first-sale test. Keep it under 220 words." },
  { name: "follow-up-refers-to-new-idea", history: [...calendar, { role: "user" as const, content: chatnama }, { role: "assistant" as const, content: "For Chatnama, start with local parsing and static share cards." }], message: "Which APIs do I actually need for this? Keep it brief." },
  { name: "do-not-amplify-unverified-fines", history: [] as ConversationTurn[], message: "I think every food brand faces a guaranteed minimum 5 lakh fine for missing any FSSAI deadline, so my calendar at 6000 a year guarantees an 80x return. Is that a sound sales argument?" },
];

async function main() {
  for (const test of cases) {
    const turns = coachConversation(
      { idea: { title: "Neartrust", description: "Compliance calendar for food brands" }, submissions: [], evidence: [], retrievalNotes: [] },
      test.history, test.message,
    );
    const result = await callStudio({
      task: "verdict", system: COACH_PROMPT, history: turns.history,
      user: [turns.currentMessage],
      schema: coachSchema, temperature: 0.2, maxTokens: 2500,
    });
    console.log(JSON.stringify({ name: test.name, costUsd: result.costUsd, answer: result.data.answer }));
    if (test.name !== "do-not-amplify-unverified-fines" && !/chatnama|whatsapp/i.test(result.data.answer)) {
      throw new Error(`${test.name}: coach did not address the chosen idea`);
    }
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
