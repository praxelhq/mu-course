import { PrismaClient } from "@prisma/client";

// Idempotent seed: sections A–H. Later units extend this.
const prisma = new PrismaClient();

async function main() {
  for (const code of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
    await prisma.section.upsert({
      where: { code },
      update: {},
      create: { code, name: `Section ${code}` },
    });
  }
  console.log("Seeded sections A–H");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
