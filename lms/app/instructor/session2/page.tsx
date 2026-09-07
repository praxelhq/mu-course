import { redirect } from "next/navigation";
import { AuthError, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSession2Console } from "@/lib/session2-console";
import { Session2Board } from "@/components/session2-board";

// Live Session-2 instructor console: per-section participation, marks, votes
// cast/received, and the per-section reveal toggle. Refreshes on load; the
// board polls for updates during class.

export const dynamic = "force-dynamic";

export default async function Session2ConsolePage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  try {
    await requireRole("instructor");
  } catch (e) {
    if (e instanceof AuthError) redirect("/sign-in");
    throw e;
  }

  const sections = await prisma.section.findMany({
    select: { id: true, code: true },
    orderBy: { code: "asc" },
  });
  if (sections.length === 0) {
    return (
      <main style={{ maxWidth: "60rem", margin: "0 auto", padding: "3rem 2rem" }}>
        <h1>Session 2 console</h1>
        <p>No sections exist yet.</p>
      </main>
    );
  }

  const { section } = await searchParams;
  const active = sections.find((s) => s.code === section) ?? sections[0];
  const data = await getSession2Console(active.id);
  if (!data) redirect("/instructor/session2");

  return (
    <Session2Board
      data={data}
      sections={sections.map((s) => ({ id: s.id, code: s.code }))}
    />
  );
}
