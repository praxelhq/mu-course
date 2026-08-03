import type { BuildUnderstanding, PromptSetContent, BuildTarget } from "./contracts";
import { fallbackProductName } from "./domain";

export function fixtureUnderstanding(input: { hostname: string; niche: string; usp: string }): BuildUnderstanding {
  return {
    productName: fallbackProductName(input.niche),
    summary: `A focused adaptation of ${input.hostname} for ${input.niche}, differentiated through ${input.usp}.`,
    icp: [`Operators and teams in ${input.niche}`, "A hands-on buyer who values a short path to first value"],
    coreJobs: ["Capture the core work in one place", "Move an item through a clear workflow", "Understand progress without manual reporting"],
    productFlows: [
      { name: "Activation", steps: ["Create an account", "Choose the first outcome", "Create the first record", "Reach a visible success state"] },
      { name: "Core loop", steps: ["Capture work", "Prioritize it", "Complete it", "Review the result"] },
    ],
    features: [
      { name: "Focused onboarding", disposition: "modify", rationale: `Teach the ${input.niche} vocabulary and first workflow.`, confidence: "medium", evidenceUrls: [`https://${input.hostname}`] },
      { name: "Core record and workflow", disposition: "retain", rationale: "Preserves the source product's primary value loop.", confidence: "high", evidenceUrls: [`https://${input.hostname}`] },
      { name: "Enterprise administration", disposition: "remove", rationale: "Adds complexity before the niche workflow is proven.", confidence: "low", evidenceUrls: [] },
      { name: "USP moment", disposition: "add", rationale: `Makes the differentiation concrete: ${input.usp}.`, confidence: "high", evidenceUrls: [] },
    ],
    nicheAndUspChanges: [`Rename concepts using ${input.niche} language.`, `Make ${input.usp} visible during activation and the repeated core loop.`],
    businessModelSignals: ["Paid product with a simple self-serve activation path"],
    evidenceGaps: ["Authenticated onboarding and account settings were not observable from public pages."],
  };
}

export function fixturePromptSet(understanding: BuildUnderstanding, target: BuildTarget): PromptSetContent {
  const retained = understanding.features.filter((feature) => feature.disposition !== "remove").map((feature) => feature.name);
  const baseText = `Build ${understanding.productName}: ${understanding.summary}\n\nUse this approved scope only: ${retained.join(", ")}. Do not implement removed features. Optimize the working style for ${target}. First inspect the project, state the architecture in plain language, then implement a runnable vertical slice. Keep the UI accessible, responsive, and production-shaped.`;
  const make = (order: number, title: string, purpose: string, prompt: string) => ({ order, title, purpose, prompt, completionChecks: ["The app runs without errors.", "The named workflow works end to end.", "No removed feature appears."], mappedFeatures: retained });
  return {
    base: { ...make(0, "Base prompt", "Set the product and technical contract", baseText), order: 0 as const },
    followUps: [
      make(1, "Foundation", "Create the data and application foundation", `Using the approved product contract, implement the smallest production-shaped foundation for ${understanding.productName}. Define the core entities, navigation, validation, empty states, and durable storage. Verify the app starts and a user can create the first record.`),
      make(2, "Core workflow", "Complete the repeated user loop", `Implement the complete core flow: ${understanding.productFlows[1]?.steps.join(" -> ")}. Include loading, empty, error, and success states. Test the real chain and report what you verified.`),
      make(3, "Differentiation", "Make the niche and USP unmistakable", `Now apply these approved transformations: ${understanding.nicheAndUspChanges.join(" ")} Update copy, defaults, workflow choices, and the payoff moment—not only the landing page.`),
      make(4, "Quality pass", "Harden the product for real users", "Run a focused quality pass covering responsive behavior, keyboard navigation, authorization, validation, failure recovery, performance, and regression tests. Fix issues found and return a short verification ledger."),
    ],
  };
}
