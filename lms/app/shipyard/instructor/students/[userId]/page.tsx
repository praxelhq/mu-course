import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadStudentFile } from "@/lib/shipyard/instructor";
import type { StudentCheckpointView, StudentSubmissionView } from "@/lib/shipyard/instructor";
import { formatBytes, formatDay, formatDayTime, pad2 } from "@/components/shipyard/format";
import { OpenGateAction, RecordVerdictAction } from "@/components/shipyard/staff-actions";
import { RenderShot } from "@/components/shipyard/render-shot";
import { GradeLine } from "@/components/shipyard/grade-line";
import { FinaliseGrade } from "@/components/shipyard/finalise-grade";
import { ReviewActions } from "@/components/shipyard/review-actions";
import { trackerProjectUrl } from "@/components/shipyard/tracker-url";

export const dynamic = "force-dynamic";

// One student's whole file (SPEC §4): their product, the six gates, every
// attempt and what the reviewer said about it, the live tracker signals, and
// the screenshot the reviewer actually looked at for checkpoint 3.
//
// It is a long page on purpose. This is the screen somebody opens because a
// student is in the room asking why, and the answer is always specific.

const STATE_WORD: Record<string, string> = {
  locked: "Locked",
  open: "Open",
  passed: "Cleared",
};

export default async function ShipyardStudentPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const [viewer, file] = await Promise.all([requireUser(), loadStudentFile(userId)]);
  if (!file) notFound();
  const isAdmin = viewer.role === "admin";

  const openForVerdict = file.checkpoints
    .flatMap((cp) => cp.submissions.map((s) => ({ cp, s })))
    .filter(({ s }) => s.status === "submitted" || s.status === "in_review");

  return (
    <main className="sy-main">
      <p className="sy-eyebrow">
        <Link href={`/shipyard/instructor?section=${file.user.sectionCode ?? ""}`}>
          ← Section {file.user.sectionCode ?? "—"}
        </Link>
      </p>

      <header className="sy-shead">
        <div>
          <h1 className="sy-display sy-shead__title">{file.user.name}</h1>
          <p className="sy-shead__line">
            {file.product?.name || "No product named yet"}
            {file.product?.oneLiner ? ` · ${file.product.oneLiner}` : ""}
          </p>
          <p className="sy-mono sy-shead__id">{file.user.email}</p>
          <div className="sy-chips">
            {file.product?.liveUrl && (
              <a
                className="sy-chip"
                href={file.product.liveUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                Live product
              </a>
            )}
            {file.product?.waitlistUrl && (
              <a
                className="sy-chip"
                href={file.product.waitlistUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                Waitlist
              </a>
            )}
            {file.product?.trackerProductId ? (
              <a
                className="sy-chip sy-chip--mono"
                href={trackerProjectUrl(file.product.trackerProductId)}
                target="_blank"
                rel="noreferrer noopener"
              >
                {file.product.trackerProductId}
              </a>
            ) : (
              <span className="sy-chip sy-chip--off">Tracker not connected</span>
            )}
          </div>
        </div>
      </header>

      <div className="sy-cols">
        <div>
          {/* The grade line leads: it is the question somebody opens this page
              with, and SPEC §7 puts the graduation condition above the four
              components wherever the line is drawn. */}
          <GradeLine grade={file.grade} standalone />
          {file.grade && !file.grade.provisional && (
            <p className="sy-grade__final">
              Finalised
              {file.grade.finalisedAt ? ` ${formatDayTime(file.grade.finalisedAt)}` : ""}
              {file.grade.finalisedBy ? ` by ${file.grade.finalisedBy}` : ""}
              {file.grade.weightsVersion ? ` · weights ${file.grade.weightsVersion}` : ""}
            </p>
          )}

          {file.checkpoints.map((cp) => (
            <CheckpointFile key={cp.id} checkpoint={cp} />
          ))}
        </div>

        <aside className="sy-aside sy-aside--wide">
          <OpenGateAction
            userId={file.user.id}
            checkpoints={file.checkpoints.map((c) => ({
              key: c.key,
              order: c.order,
              title: c.title,
              state: c.state,
            }))}
          />

          {openForVerdict.map(({ cp, s }) => (
            <RecordVerdictAction
              key={s.id}
              submissionId={s.id}
              checkpointTitle={`${cp.order}. ${cp.title}, attempt ${s.version}`}
            />
          ))}

          {isAdmin && (
            <FinaliseGrade
              userId={file.user.id}
              studentName={file.user.name}
              alreadyFinal={file.grade !== null && !file.grade.provisional}
            />
          )}
        </aside>
      </div>
    </main>
  );
}

function CheckpointFile({ checkpoint }: { checkpoint: StudentCheckpointView }) {
  return (
    <article className={`sy-file sy-file--${checkpoint.state}`}>
      <div className="sy-file__head">
        <span className="sy-mono sy-file__n">{pad2(checkpoint.order)}</span>
        <h2 className="sy-title sy-file__title">{checkpoint.title}</h2>
        <span className={`sy-pill sy-pill--${checkpoint.state}`}>
          {STATE_WORD[checkpoint.state]}
        </span>
      </div>

      <p className="sy-file__meta">
        <span>{checkpoint.gateType} gate</span>
        {checkpoint.openedAt && <span>Opened {formatDay(checkpoint.openedAt)}</span>}
        {checkpoint.passedAt && <span>Cleared {formatDay(checkpoint.passedAt)}</span>}
        {checkpoint.manuallyOpenedBy && (
          <span className="sy-file__manual">Opened by hand · {checkpoint.manuallyOpenedBy}</span>
        )}
        <span>
          {checkpoint.submissions.length}{" "}
          {checkpoint.submissions.length === 1 ? "attempt" : "attempts"}
        </span>
      </p>

      {checkpoint.signals && checkpoint.signals.length > 0 && (
        <div className="sy-signals__grid sy-signals__grid--tight">
          {checkpoint.signals.map((s) => (
            <div
              key={s.name}
              className={
                s.met === true
                  ? "sy-signal sy-signal--met"
                  : s.met === false
                    ? "sy-signal sy-signal--unmet"
                    : "sy-signal sy-signal--unknown"
              }
            >
              <span className="sy-signal__label">{s.label}</span>
              <span className="sy-signal__value">
                <span className="sy-signal__mark" aria-hidden="true" />
                {s.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {checkpoint.submissions.length === 0 ? (
        <p className="sy-file__none">Nothing submitted here.</p>
      ) : (
        checkpoint.submissions.map((s) => <Attempt key={s.id} submission={s} />)
      )}
    </article>
  );
}

/**
 * What the student typed, in the checkpoint's own field order. Long prose is
 * kept whole rather than truncated: an instructor reading a file is reading it
 * because the detail is the point.
 */
function Answers({ fields }: { fields: Record<string, unknown> }) {
  const entries = Object.entries(fields).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  if (entries.length === 0) return null;
  return (
    <dl className="sy-answers">
      {entries.map(([key, value]) => (
        <div className="sy-answers__row" key={key}>
          <dt className="sy-answers__k sy-mono">{key}</dt>
          <dd className="sy-answers__v">
            {Array.isArray(value) ? value.join(", ") : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Attempt({ submission }: { submission: StudentSubmissionView }) {
  return (
    <section className="sy-attempt">
      <p className="sy-attempt__head">
        <span className="sy-mono">v{submission.version}</span>
        <span className={`sy-pill sy-pill--sub-${submission.status}`}>{submission.status}</span>
        <span>{submission.submittedAt ? formatDayTime(submission.submittedAt) : "not sent"}</span>
      </p>

      <Answers fields={submission.fields} />

      {submission.files.length > 0 && (
        <ul className="sy-filelist">
          {submission.files.map((f) => (
            <li className="sy-filelist__item" key={f.key}>
              <a href={`/api/shipyard/files/${f.key}`} target="_blank" rel="noreferrer noopener">
                {f.name}
              </a>
              <span className="sy-filelist__size">{formatBytes(f.bytes)}</span>
            </li>
          ))}
        </ul>
      )}

      {submission.reviews.length === 0 ? (
        <p className="sy-file__none">No verdict yet.</p>
      ) : (
        submission.reviews.map((r) => (
          <div className="sy-review" key={r.id}>
            <p className="sy-review__head">
              <span className={`sy-pill sy-pill--${r.verdict}`}>{r.verdict}</span>
              <span className="sy-mono">confidence {r.confidence.toFixed(2)}</span>
              <span className="sy-mono">{r.modelUsed}</span>
              <span className="sy-mono">${r.costUsd.toFixed(4)}</span>
              <span>{formatDayTime(r.createdAt)}</span>
              {r.needsHuman && r.humanResolvedAt === null && (
                <span className="sy-pill sy-pill--needs-human">needs a human</span>
              )}
              {r.reviewedBy === "human" && <span className="sy-pill">by a human</span>}
            </p>

            {r.overriddenBy && (
              <p className="sy-review__override">
                Overridden by {r.overriddenBy}
                {r.overrideReason ? ` · ${r.overrideReason}` : ""}
              </p>
            )}

            {r.reasons.length > 0 && (
              <ul className="sy-reasons">
                {r.reasons.map((reason, i) => (
                  <li
                    className={reason.met ? "sy-reason sy-reason--met" : "sy-reason"}
                    key={`${reason.criterion}-${i}`}
                  >
                    <span className="sy-reason__criterion">{reason.criterion}</span>
                    <p className="sy-reason__note">{reason.note}</p>
                  </li>
                ))}
              </ul>
            )}

            {r.screenshotKey && <RenderShot objectKey={r.screenshotKey} />}

            {r.needsHuman && r.humanResolvedAt === null && (
              <ReviewActions reviewId={r.id} verdict={r.verdict} compact />
            )}
          </div>
        ))
      )}
    </section>
  );
}
