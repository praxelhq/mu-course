// Students talk to each other after the viva — that is normal and we should
// assume every set question is known in advance by the second day of a window.
//
// Two defences, because rotation alone is weak (four variants of a question
// with one right answer still leak that answer):
//
//   1. VARIANTS — each set probe has several scenarios, picked deterministically
//      per student. Two friends compare notes and find they were asked about
//      different situations, so a rehearsed script does not transfer cleanly.
//   2. APPLICATION — whatever they answer, the interviewer makes them apply it
//      to their OWN uploaded work. That is the real defence: the second half of
//      the question cannot be prepared, because it is about their file.
//
// Selection is by student, not random, so a reconnect mid-interview gets the
// same question rather than a fresh one.

/** FNV-1a. Stable across processes and deploys — Math.random is not. */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function pickVariant<T>(userId: string, probe: string, variants: readonly T[]): T {
  return variants[hash(`${userId}:${probe}`) % variants.length];
}

/**
 * Context isolation. The highest-leak question in the interview: one crisp
 * answer, so a student who is told it can parrot it. Never hint the mechanism —
 * the whole value is whether they reach for it themselves.
 */
export const CONTEXT_ISOLATION_VARIANTS = [
  "Say you are working on three different projects at work, and your LLM keeps confusing them when it answers. How would you make sure that stops happening?",
  "You use the same AI assistant for three different clients. It starts pulling details from one client into answers about another. What would you change about the way you work?",
  "You have been using one AI tool across several unrelated pieces of work for a few weeks, and it keeps dragging in context that does not belong to the thing you are asking about. How would you set things up so that stops?",
  "Your team shares one AI workspace across four ongoing pieces of work, and answers keep bleeding between them. What would you change?",
] as const;

/** Skills. Partly self-grounding already — the task has to be their own. */
export const SKILL_VARIANTS = [
  "Name one skill you would build in your workspace, and why that one.",
  "If you could package one thing you do repeatedly into a reusable skill your AI could run for you, what would it be, and why that one?",
  "What is one task you repeat often enough that it would be worth turning into a skill? Why that task and not something else?",
  "Think about your week. What is the one repeated piece of work you would hand to a skill first, and why that one?",
] as const;

/** Regulated shipping. Scored on reasoning, so the scenario can vary freely. */
export const REGULATED_SHIPPING_VARIANTS = [
  "Would you be comfortable building an app on Lovable and selling it to a healthcare or fintech enterprise in the US?",
  "A US hospital network wants to buy the app you built on Lovable and run it on real patient data. Would you be comfortable selling it to them?",
  "A US bank wants to license an app you built on Lovable and put it in front of their customers' account data. Would you be comfortable with that?",
  "An American insurance company wants to buy your Lovable app and process real claims through it. Would you be comfortable selling it to them?",
] as const;

/**
 * Appended to every set probe. This is what makes a leaked question mostly
 * worthless: the follow-up is about the student's own artifact, so it cannot be
 * rehearsed from a friend's account of the question.
 */
export const APPLY_BACK_RULE =
  "AFTER ANY SET PROBE, MAKE THEM APPLY IT TO THEIR OWN WORK. A correct-sounding answer given in the abstract proves very little — students discuss these questions with each other, so assume the headline answer may be borrowed. Follow up by asking how it would apply to the specific workflow or sector map they uploaded, and what they would actually change. Someone who understands the idea can place it in their own work in one sentence; someone repeating a phrase they were told cannot.";
