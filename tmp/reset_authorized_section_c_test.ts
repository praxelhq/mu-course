import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const section = await prisma.section.findUniqueOrThrow({ where: { code: "C" } });
  const race = await prisma.dataRace.findUniqueOrThrow({
    where: { sessionNo_sectionId: { sessionNo: 3, sectionId: section.id } },
  });
  const responseCount = await prisma.dataRaceResponse.count({ where: { question: { raceId: race.id } } });
  if (race.phase !== "question" || race.currentPosition !== 3 || responseCount !== 1) {
    throw new Error(`Authorized reset guard failed: phase=${race.phase}, position=${race.currentPosition}, responses=${responseCount}`);
  }
  const actor = await prisma.user.findFirstOrThrow({ where: { role: { in: ["instructor", "admin"] } }, select: { id: true } });

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "DataRace" WHERE id = ${race.id} FOR UPDATE`;
    const locked = await tx.dataRace.findUniqueOrThrow({ where: { id: race.id } });
    const lockedResponses = await tx.dataRaceResponse.count({ where: { question: { raceId: race.id } } });
    if (locked.phase !== "question" || locked.currentPosition !== 3 || lockedResponses !== 1) {
      throw new Error(`Authorized reset guard changed: phase=${locked.phase}, position=${locked.currentPosition}, responses=${lockedResponses}`);
    }
    await tx.dataRace.update({
      where: { id: race.id },
      data: { phase: "waiting", currentPosition: 0, questionStartedAt: null, questionEndsAt: null, version: { increment: 1 } },
    });
    await tx.dataRaceResponse.deleteMany({ where: { question: { raceId: race.id } } });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "data_race.reset_authorized_test",
        targetType: "DataRace",
        targetId: race.id,
        before: { section: "C", phase: locked.phase, position: locked.currentPosition, responses: lockedResponses },
        after: { section: "C", phase: "waiting", position: 0, responses: 0 },
      },
    });
  }, { maxWait: 10_000, timeout: 30_000 });

  console.log("Reset authorized Section C test: 1 response deleted; race returned to waiting.");
}

main().finally(() => prisma.$disconnect());
