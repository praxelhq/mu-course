import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DataRaceConsole } from "./race-console";

export const dynamic = "force-dynamic";

export default async function InstructorDataRacePage() {
  await requireRole("instructor");
  const sections = await prisma.section.findMany({ orderBy: { code: "asc" }, select: { code: true } });
  return (
    <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <DataRaceConsole sectionCodes={sections.map((item) => item.code)} />
    </main>
  );
}
