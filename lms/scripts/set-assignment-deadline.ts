// Set an assignment's two deadlines: the hard cutoff the backend enforces and
// the soft date learners are shown.
//
//   pnpm deadline:set --assignment asg_s4_app \
//     --due 2026-09-15T18:29:00Z --display 2026-09-10T18:29:00Z
//
// Flags:
//   --assignment <id>   required; Assignment.id
//   --due <iso>         the HARD cutoff (grade finalisation, cohort freeze)
//   --display <iso>     the SOFT date students see; `--display none` clears it
//                       so the hard date is shown again
//   --dry-run           print the change and roll nothing forward
//
// Omitting --due keeps the existing hard cutoff, so moving only the shown date
// is a one-flag operation. Every change is written to AuditLog: a deadline the
// course quietly moved is exactly the thing an appeal will ask about later.
import { PrismaClient } from "@prisma/client";
import { assertDeadlineOrder, graceCutoff, shownDeadline } from "../lib/deadlines";

const db = new PrismaClient();

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function parseInstant(label: string, raw: string): Date {
  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) {
    throw new Error(`--${label} is not a date: ${raw}. Use an ISO instant, e.g. 2026-09-15T18:29:00Z`);
  }
  return at;
}

function fmt(at: Date | null): string {
  if (!at) return "—";
  return `${at.toISOString()} (${at.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST)`;
}

async function main(): Promise<void> {
  const assignmentId = flag("assignment");
  if (!assignmentId) throw new Error("--assignment <id> is required");
  const dryRun = process.argv.includes("--dry-run");
  const dueRaw = flag("due");
  const displayRaw = flag("display");
  if (dueRaw === undefined && displayRaw === undefined) {
    throw new Error("Nothing to do: pass --due, --display, or both");
  }

  const existing = await db.assignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, title: true, dueAt: true, displayDueAt: true },
  });
  if (!existing) throw new Error(`Unknown assignment ${assignmentId}`);

  const next = {
    dueAt: dueRaw === undefined ? existing.dueAt : parseInstant("due", dueRaw),
    displayDueAt:
      displayRaw === undefined
        ? existing.displayDueAt
        : displayRaw === "none"
          ? null
          : parseInstant("display", displayRaw),
  };
  assertDeadlineOrder(next);

  console.log(`${existing.title} (${existing.id})`);
  console.log(`  hard cutoff  ${fmt(existing.dueAt)}  ->  ${fmt(next.dueAt)}`);
  console.log(`  shown to all ${fmt(shownDeadline(existing))}  ->  ${fmt(shownDeadline(next))}`);
  const grace = graceCutoff(next);
  console.log(
    grace
      ? `  Students will see the soft date; work is still accepted while the gate is open, up to ${fmt(grace)}.`
      : "  No soft date: the hard cutoff is what students see.",
  );
  if (dryRun) {
    console.log("\n--dry-run: nothing written.");
    return;
  }

  await db.$transaction([
    db.assignment.update({ where: { id: existing.id }, data: next }),
    db.auditLog.create({
      data: {
        actorId: null,
        action: "assignment.deadlines.set",
        targetType: "assignment",
        targetId: existing.id,
        before: { dueAt: existing.dueAt?.toISOString() ?? null, displayDueAt: existing.displayDueAt?.toISOString() ?? null },
        after: { dueAt: next.dueAt?.toISOString() ?? null, displayDueAt: next.displayDueAt?.toISOString() ?? null },
      },
    }),
  ]);
  console.log("\nWritten, and recorded in AuditLog.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
