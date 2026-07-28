import { notFound, redirect } from "next/navigation";
import { AuthError, requireUser } from "@/lib/auth";
import { getAssignmentForStudent } from "@/lib/submissions";
import { s3Configured } from "@/lib/s3";
import { Card, Eyebrow } from "@/components/ui";
import { SubmissionForm, type HistoryRow } from "@/components/submission-form";

// U8 — the submit surface. The form renders from the assignment type's
// submissionSchema (schema-driven; new types need zero code changes). A
// closed/locked gate renders the branded closed card; the API re-enforces
// the gate on the actual mutation (409 on the race).

export const dynamic = "force-dynamic";

const mono: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

export default async function SubmitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let userId: string;
  try {
    userId = (await requireUser()).userId;
  } catch (e) {
    if (e instanceof AuthError) redirect("/sign-in");
    throw e;
  }

  const view = await getAssignmentForStudent(userId, id);
  if (!view) notFound();

  const history: HistoryRow[] = view.history.map((h) => ({
    id: h.id,
    version: h.version,
    status: h.status,
    submittedAt: h.submittedAt?.toISOString() ?? null,
  }));

  return (
    <main style={{ maxWidth: "48rem", margin: "0 auto", padding: "3rem 2rem" }}>
      <Eyebrow muted>
        {view.type.title}
        {view.type.teamBased && " · Team submission"}
      </Eyebrow>
      <h1 style={{ fontSize: "2rem", margin: "0 0 0.5rem" }}>{view.assignment.title}</h1>
      <p style={{ color: "var(--charcoal)", margin: "0 0 0.5rem", lineHeight: 1.6 }}>
        {view.assignment.brief}
      </p>
      {view.assignment.dueAt && (
        <p style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)", margin: "0 0 2rem" }}>
          Due {dateFmt.format(view.assignment.dueAt)}
        </p>
      )}

      {!view.available ? (
        <Card style={{ textAlign: "center", padding: "3rem 2rem", opacity: 0.8 }}>
          <p style={{ ...mono, fontSize: "0.6875rem", color: "var(--clay)", margin: "0 0 0.75rem" }}>
            Submissions closed
          </p>
          <h2 style={{ fontSize: "1.375rem", margin: "0 0 0.75rem" }}>
            The Forge is not taking this piece right now.
          </h2>
          <p style={{ color: "var(--charcoal)", margin: 0, lineHeight: 1.6 }}>
            This assignment is not open for your section. If you believe you should still be able
            to submit — a missed deadline, an agreed extension — ask your instructor for a reopen.
          </p>
        </Card>
      ) : !view.schema ? (
        <Card>
          <p style={{ ...mono, fontSize: "0.6875rem", color: "var(--ochre)", margin: 0 }}>
            This assignment type&apos;s submission schema is malformed. Tell your instructor.
          </p>
        </Card>
      ) : (
        <SubmissionForm
          assignmentId={view.assignment.id}
          fields={view.schema.fields}
          storageReady={s3Configured()}
          history={history}
        />
      )}
    </main>
  );
}
