// Publish an interview close date earlier than the one actually enforced.
//
//   pnpm interview:close --display 2026-09-10T18:29:00Z            # all sections
//   pnpm interview:close --display 2026-09-10T18:29:00Z --write
//   pnpm interview:close --display none --write                    # clear it
//   pnpm interview:close --section E --display … --write           # one section
//
// `closesAt` is untouched: it stays the only date that decides whether a
// student may start an interview. This sets the date they are SHOWN.
import { PrismaClient } from "@prisma/client";
import { assertWindowCloseOrder, shownWindowClose, windowGraceClose } from "../lib/deadlines";

const prisma = new PrismaClient();

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const ist = (at: Date | null) =>
  at ? at.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "—";

async function main(): Promise<void> {
  const raw = flag("display");
  if (raw === undefined) throw new Error("--display <iso> (or 'none') is required");
  const section = flag("section");
  const write = process.argv.includes("--write");

  let displayClosesAt: Date | null = null;
  if (raw !== "none") {
    displayClosesAt = new Date(raw);
    if (Number.isNaN(displayClosesAt.getTime())) {
      throw new Error(`--display is not a date: ${raw}. Use an ISO instant, e.g. 2026-09-10T18:29:00Z`);
    }
  }

  const windows = await prisma.interviewWindow.findMany({
    where: section ? { section: { code: section } } : {},
    include: { section: { select: { code: true } } },
    orderBy: { section: { code: "asc" } },
  });
  if (windows.length === 0) throw new Error(section ? `No window for section ${section}` : "No interview windows");

  for (const w of windows) {
    const next = { closesAt: w.closesAt, displayClosesAt };
    assertWindowCloseOrder(next);
    console.log(
      `${w.section.code}  shown ${ist(shownWindowClose(w))} -> ${ist(shownWindowClose(next))}` +
        `  · enforced stays ${ist(w.closesAt)}`,
    );
  }

  if (!write) {
    console.log("\nDry run. Re-run with --write to apply.");
    return;
  }

  const result = await prisma.interviewWindow.updateMany({
    where: { id: { in: windows.map((w) => w.id) } },
    data: { displayClosesAt },
  });
  await prisma.auditLog.create({
    data: {
      actorId: null,
      action: "interview-window.display-close.set",
      targetType: "interview-window",
      targetId: section ?? "all-sections",
      before: { displayClosesAt: windows.map((w) => w.displayClosesAt?.toISOString() ?? null) },
      after: { displayClosesAt: displayClosesAt?.toISOString() ?? null },
    },
  });
  const grace = windowGraceClose({ closesAt: windows[0]!.closesAt, displayClosesAt });
  console.log(
    `\n${result.count} window(s) updated.` +
      (grace ? ` Students now see the earlier date; interviews still start until ${ist(grace)}.` : ""),
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
