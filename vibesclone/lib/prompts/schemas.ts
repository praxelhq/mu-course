export const understandingJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    productName: { type: "string" },
    summary: { type: "string" },
    icp: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } },
    coreJobs: { type: "array", minItems: 1, maxItems: 12, items: { type: "string" } },
    productFlows: { type: "array", minItems: 1, maxItems: 12, items: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, steps: { type: "array", minItems: 2, maxItems: 12, items: { type: "string" } } }, required: ["name", "steps"] } },
    features: { type: "array", minItems: 1, maxItems: 40, items: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, disposition: { enum: ["retain", "modify", "remove", "add"] }, rationale: { type: "string" }, confidence: { enum: ["high", "medium", "low"] }, evidenceUrls: { type: "array", maxItems: 8, items: { type: "string", format: "uri" } } }, required: ["name", "disposition", "rationale", "confidence", "evidenceUrls"] } },
    nicheAndUspChanges: { type: "array", minItems: 1, maxItems: 12, items: { type: "string" } },
    businessModelSignals: { type: "array", maxItems: 8, items: { type: "string" } },
    evidenceGaps: { type: "array", maxItems: 12, items: { type: "string" } },
  },
  required: ["productName", "summary", "icp", "coreJobs", "productFlows", "features", "nicheAndUspChanges", "businessModelSignals", "evidenceGaps"],
} as const;

const promptItem = {
  type: "object",
  additionalProperties: false,
  properties: {
    order: { type: "integer", minimum: 0 }, title: { type: "string" }, purpose: { type: "string" }, prompt: { type: "string" },
    completionChecks: { type: "array", minItems: 1, maxItems: 12, items: { type: "string" } },
    mappedFeatures: { type: "array", minItems: 1, items: { type: "string" } },
  },
  required: ["order", "title", "purpose", "prompt", "completionChecks", "mappedFeatures"],
} as const;

export const promptSetJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: { base: promptItem, followUps: { type: "array", minItems: 2, maxItems: 12, items: promptItem } },
  required: ["base", "followUps"],
} as const;
