export const BLUEPRINT_MAX_BYTES_EXCLUSIVE = 2_000_000;

export type MakeBlueprintFailureCode =
  | "too_large"
  | "invalid_json"
  | "invalid_root"
  | "invalid_flow"
  | "invalid_module";

export type MakeBlueprintResult =
  | {
      ok: true;
      summary: {
        moduleCount: number;
        moduleNames: string[];
        hasMetadata: boolean;
      };
    }
  | { ok: false; reasonCode: MakeBlueprintFailureCode };

/**
 * Validate the small, stable outer contract of a Make blueprint. Connections
 * are intentionally not required: exported blueprints do not carry usable
 * account connections and importers recreate them.
 */
export function parseMakeBlueprint(
  bytes: Uint8Array,
  opts: { maxBytesExclusive?: number } = {},
): MakeBlueprintResult {
  const maxBytesExclusive = opts.maxBytesExclusive ?? BLUEPRINT_MAX_BYTES_EXCLUSIVE;
  if (bytes.byteLength >= maxBytesExclusive) return { ok: false, reasonCode: "too_large" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    return { ok: false, reasonCode: "invalid_json" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reasonCode: "invalid_root" };
  }
  const root = parsed as Record<string, unknown>;
  if (!Array.isArray(root.flow)) return { ok: false, reasonCode: "invalid_flow" };

  const moduleNames: string[] = [];
  for (const entry of root.flow) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return { ok: false, reasonCode: "invalid_module" };
    }
    const moduleName = (entry as Record<string, unknown>).module;
    if (typeof moduleName !== "string" || !moduleName.trim()) {
      return { ok: false, reasonCode: "invalid_module" };
    }
    moduleNames.push(moduleName);
  }

  return {
    ok: true,
    summary: {
      moduleCount: moduleNames.length,
      moduleNames,
      hasMetadata:
        typeof root.metadata === "object" && root.metadata !== null && !Array.isArray(root.metadata),
    },
  };
}
