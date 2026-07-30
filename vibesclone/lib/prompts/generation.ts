import { promptSetSchema, type BuildTarget, type BuildUnderstanding, type PromptSetContent } from "@/lib/contracts";
import { requestStructured, type ModelReceipt } from "@/lib/providers/openrouter";
import { promptSetJsonSchema } from "./schemas";

const platformGuidance: Record<BuildTarget, string> = {
  lovable: "Use Lovable's project-aware conversational build style. Ask it to implement focused vertical slices and verify in preview after every slice.",
  replit: "Use Replit Agent's repository and runtime context. Name concrete files only when needed, run the app after each slice, and fix runtime errors before continuing.",
  base44: "Use Base44's data-model-first application builder. Describe entities, permissions, screens, and automations explicitly in each slice.",
  "claude-code": "Use Claude Code as a repository agent. Instruct it to inspect existing conventions, change bounded files, run focused tests, and report verification evidence.",
};

export async function generatePromptSet(input: { understanding: BuildUnderstanding; target: BuildTarget }): Promise<{ promptSet: PromptSetContent; receipt: ModelReceipt }> {
  const system = `You are VibesClone's build-sequence architect. Generate exactly one comprehensive base prompt followed by ordered implementation prompts. The approved understanding is the sole product authority. Removed features must never be implemented. Every follow-up must map to named approved features, build on prior steps, and include observable completion checks. Avoid vague instructions such as "make it modern". ${platformGuidance[input.target]}`;
  const prompt = `PLATFORM: ${input.target}\nAPPROVED BUILD UNDERSTANDING:\n${JSON.stringify(input.understanding, null, 2)}\n\nCreate a practical sequence that a non-expert can copy one prompt at a time. Base order must be 0; follow-up orders must be contiguous from 1.`;
  try {
    const result = await requestStructured({ name: "prompt_set", system, prompt, schema: promptSetJsonSchema, validator: promptSetSchema });
    return { promptSet: normalizeOrders(result.data), receipt: result.receipt };
  } catch {
    const result = await requestStructured({ name: "prompt_set", system: `${system}\nPrevious output was invalid. Return only schema-valid content.`, prompt, schema: promptSetJsonSchema, validator: promptSetSchema, fallback: true });
    return { promptSet: normalizeOrders(result.data), receipt: result.receipt };
  }
}

export function normalizeOrders(value: PromptSetContent): PromptSetContent {
  return { base: { ...value.base, order: 0 }, followUps: value.followUps.map((item, index) => ({ ...item, order: index + 1 })) };
}
