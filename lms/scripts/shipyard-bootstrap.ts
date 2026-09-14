// PRODUCTION bootstrap for the Shipyard (Course 2) — definitions only.
//
// The demo seed (`pnpm seed`) wipes the whole database, so it can never run
// against production. This script creates the rows the Shipyard cannot work
// without and that no student action creates: the six checkpoint
// definitions, the v1 grade weights, and the router-state row.
//
// Idempotent and edit-safe: a checkpoint that already exists is left exactly
// as it is (an admin may have edited its bar, deadline or cooldown in the
// bench), weights are created only when no version exists yet, and the
// router row is created only when absent. Nothing is ever deleted or reset.
//
//   DATABASE_URL=... pnpm shipyard:bootstrap

import { Prisma, PrismaClient } from "@prisma/client";
import { ROUTER_STATE_ID } from "../lib/ai/router";
import { CHECKPOINT_DEFINITIONS, checkpointId } from "../lib/shipyard/checkpoints";
import { SHIPYARD_COURSE_ID } from "../lib/shipyard/constants";
import { WEIGHTS_V1, WEIGHTS_VERSION_V1 } from "../lib/shipyard/scoring";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  let created = 0;
  for (const c of CHECKPOINT_DEFINITIONS) {
    const existing = await prisma.shipyardCheckpoint.findUnique({
      where: { courseId_key: { courseId: SHIPYARD_COURSE_ID, key: c.key } },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.shipyardCheckpoint.create({
      data: {
        id: checkpointId(c.key),
        courseId: SHIPYARD_COURSE_ID,
        key: c.key,
        order: c.order,
        title: c.title,
        barMarkdown: c.barMarkdown,
        rubric: c.rubric as unknown as Prisma.InputJsonValue,
        gateType: c.gateType,
        acceptsImages: c.acceptsImages,
        fieldSchema: c.fieldSchema as unknown as Prisma.InputJsonValue,
        metricSignals: c.metricSignals as unknown as Prisma.InputJsonValue,
        resubmitWindowHours: c.resubmitWindowHours,
        resubmitCooldownMinutes: c.resubmitCooldownMinutes,
      },
    });
    created += 1;
  }

  const weightsCount = await prisma.shipyardWeights.count({ where: { courseId: SHIPYARD_COURSE_ID } });
  let weightsCreated = false;
  if (weightsCount === 0) {
    await prisma.shipyardWeights.create({
      data: {
        id: "syw_v1",
        courseId: SHIPYARD_COURSE_ID,
        version: WEIGHTS_VERSION_V1,
        weights: WEIGHTS_V1 as unknown as Prisma.InputJsonValue,
        active: true,
      },
    });
    weightsCreated = true;
  }

  const router = await prisma.shipyardRouterState.findUnique({ where: { id: ROUTER_STATE_ID } });
  let routerCreated = false;
  if (!router) {
    await prisma.shipyardRouterState.create({
      data: {
        id: ROUTER_STATE_ID,
        courseId: SHIPYARD_COURSE_ID,
        anthropicExhausted: false,
        consecutiveByokFailures: 0,
        activeProfile: "flash_verdicts",
      },
    });
    routerCreated = true;
  }

  const total = await prisma.shipyardCheckpoint.count({ where: { courseId: SHIPYARD_COURSE_ID } });
  console.log(
    `[shipyard:bootstrap] checkpoints: ${created} created, ${total} present · ` +
      `weights: ${weightsCreated ? "v1 created" : `${weightsCount} present, untouched`} · ` +
      `router state: ${routerCreated ? "created" : "present, untouched"}`,
  );
}

main()
  .catch((err) => {
    console.error("[shipyard:bootstrap] failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
