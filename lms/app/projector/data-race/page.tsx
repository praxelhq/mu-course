import { requireRole } from "@/lib/auth";
import { AuthError } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DataRaceProjector } from "./projector-client";

export const dynamic = "force-dynamic";

export default async function ProjectorDataRacePage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  try {
    await requireRole("instructor");
  } catch (error) {
    if (error instanceof AuthError) redirect(error.status === 401 ? "/sign-in" : "/");
    throw error;
  }
  const { section = "A" } = await searchParams;
  return <DataRaceProjector sectionCode={section.toUpperCase()} />;
}
