import { requireUser } from "@/lib/auth";
import { DataRaceStudent } from "./student-client";

export const dynamic = "force-dynamic";

export default async function DataRacePage() {
  await requireUser();
  return (
    <main style={{ maxWidth: "48rem", margin: "0 auto", padding: "clamp(1.25rem, 5vw, 3rem)" }}>
      <DataRaceStudent />
    </main>
  );
}
