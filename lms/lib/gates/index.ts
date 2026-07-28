import type { GateState, GateTarget } from "@prisma/client";
import { prisma } from "@/lib/db";

// Gate resolution lives here and only here (see CLAUDE.md invariants):
// routes and lib modules must not run ad-hoc Gate queries. A missing gate
// row means locked — content is closed until explicitly opened.

/** The gate state for one target in one section. No row = locked. */
export async function resolveGate(
  targetType: GateTarget,
  targetId: string,
  sectionId: string,
): Promise<GateState> {
  const gate = await prisma.gate.findUnique({
    where: { targetType_targetId_sectionId: { targetType, targetId, sectionId } },
    select: { state: true },
  });
  return gate?.state ?? "locked";
}

/** Batched: all target ids of a type currently open for a section. */
export async function openTargetIds(
  targetType: GateTarget,
  sectionId: string,
): Promise<string[]> {
  const rows = await prisma.gate.findMany({
    where: { targetType, sectionId, state: "open" },
    select: { targetId: true },
  });
  return rows.map((r) => r.targetId);
}
