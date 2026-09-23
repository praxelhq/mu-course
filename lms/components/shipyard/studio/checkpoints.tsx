"use client";
import { useState } from "react";
import {
  gateOpen,
  latestSubmission,
  wordCount,
  featureText,
  type StudioIdea,
} from "@/lib/shipyard/studio/contracts";
import {
  Field,
  ImageUploads,
  Heading,
  labels,
  Sources,
  time,
  type Workspace,
  type State,
  type Submission,
} from "./shared";
function SubmittedWork({
  submission,
  files,
}: {
  submission: Submission;
  files: Workspace["files"];
}) {
  const fields = submission.snapshot.fields;
  const names: Record<string, string> = {
    title: "Title",
    description: "Idea",
    landingUrl: "Landing page",
    job: "Job specification",
    featureList: "Feature list",
    liveUrl: "Working product",
    notes: "Access and demo notes",
  };
  return (
    <div className="st-submitted-work">
      <p className="st-muted">
        Team at submission:{" "}
        {submission.members.map((m) => m.name || m.email).join(", ")}
      </p>
      {Object.entries(names)
        .filter(([key]) => typeof fields[key] === "string" && fields[key])
        .map(([key, label]) => (
          <div key={key}>
            <b>{label}</b>
            <p style={{ whiteSpace: "pre-wrap" }}>{String(fields[key])}</p>
          </div>
        ))}
      {Array.isArray(fields.features) &&
        (fields.features as StudioIdea["features"]).map((f, i) => (
          <div key={i}>
            <b>
              {f.name} · {f.mlp ? "MLP" : "Later"}
            </b>
            <p>{f.description}</p>
          </div>
        ))}
      {(["visuals", "sketches", "designs"] as const).map(
        (kind) =>
          Array.isArray(fields[kind]) && (
            <div key={kind}>
              <b>
                {kind === "visuals"
                  ? "Idea visual"
                  : kind === "sketches"
                    ? "Early sketch"
                    : "Screen designs"}
              </b>
              {(fields[kind] as string[]).map((id) => (
                <p key={id}>
                  <a
                    target="_blank"
                    rel="noreferrer"
                    href={`/api/shipyard/studio?file=${encodeURIComponent(id)}`}
                  >
                    {files.find((f) => f.id === id)?.name ||
                      "Open submitted image"}{" "}
                    ↗
                  </a>
                </p>
              ))}
            </div>
          ),
      )}
    </div>
  );
}
export function Checkpoints({
  w,
  idea,
  actor,
  busy,
  readonly,
  change,
  act,
  submit,
  upload,
}: {
  w: Workspace;
  idea: StudioIdea;
  actor: State["actor"];
  busy: boolean;
  readonly: boolean;
  change: (field: keyof StudioIdea, value: unknown) => void;
  act: (body: unknown, success?: string) => Promise<unknown>;
  submit: (cp: number) => void;
  upload: (file: File, kind: "visuals" | "design") => void;
}) {
  const [reasons, setReasons] = useState<Record<string, string>>({}),
    [notes, setNotes] = useState<Record<string, string>>({});
  return (
    <>
      <Heading
        number="03"
        kicker="THREE CHECKPOINTS"
        title="Earn the next step."
        description="AI reviews checkpoints 1 and 2. Revise, or ask your instructor for a second look."
      />
      {[1, 2, 3].map((cp) => {
        const s = latestSubmission(cp, w.submissions),
          open = gateOpen(cp, w.submissions);
        return (
          <article
            className={`st-checkpoint ${!open ? "locked" : ""}`}
            key={cp}
          >
            <div className="st-result-heading">
              <h3>
                <span className="st-cp-number">0{cp}</span>
                {
                  ["The idea", "The product spec", "The working product"][
                    cp - 1
                  ]
                }
              </h3>
              <span className="st-tag">
                {!open ? "Locked" : s ? labels[s.status] : "Ready when you are"}
              </span>
            </div>
            {cp === 1 ? (
              <>
                <p>
                  A title, your idea in fewer than 200 words, and a landing page link.
                  That’s it.
                </p>
                <div className="st-rubric">
                  <span>Build in 2 months</span>
                  <span>Start charging in 2 months</span>
                  <span>Software, minimal operations</span>
                </div>
                <fieldset disabled={readonly || busy}>
                  <Field
                    label="Title"
                    value={idea.title}
                    onChange={(v) => change("title", v)}
                    rows={1}
                    placeholder="A short name for your idea"
                  />
                  <Field
                    label="Description"
                    value={idea.description}
                    onChange={(v) => change("description", v)}
                    rows={5}
                    hint={`${wordCount(idea.description)} / 199 words`}
                    placeholder="What are you making, who is it for, and why would they pay?"
                  />
                  <Field
                    label="Landing page link (required)"
                    value={idea.landingUrl}
                    onChange={(v) => change("landingUrl", v)}
                    rows={1}
                    placeholder="https://your-product.com"
                    hint="A public page explaining your idea and offer."
                  />
                </fieldset>
              </>
            ) : cp === 2 ? (
              <>
                <p>
                  Your job spec, feature list and images of your product
                  screens.
                </p>
                {open && (
                  <fieldset disabled={readonly || busy}>
                    <Field
                      label="Job spec"
                      value={idea.job}
                      onChange={(v) => change("job", v)}
                      rows={5}
                      placeholder="Who needs this product, when do they need it, and what should they be able to accomplish?"
                    />
                    <Field
                      label="Feature list"
                      value={featureText(idea)}
                      onChange={(v) => {
                        change("features", []);
                        change("featureList", v);
                      }}
                      rows={7}
                      hint="Plain text or bullets are fine. Briefly explain what each feature does. Mark later features if useful."
                      placeholder={
                        "Create an invoice — enter the client, amount and due date.\nExport a PDF — download a clear invoice ready to send."
                      }
                    />
                    <ImageUploads
                      title="Screen designs"
                      hint="Upload images of the screens showing the main user flow. Use any design tool."
                      ids={idea.designs}
                      files={w.files}
                      disabled={readonly || busy}
                      limit={6}
                      upload={(file) => upload(file, "design")}
                      remove={(id) =>
                        change(
                          "designs",
                          idea.designs.filter((x) => x !== id),
                        )
                      }
                    />
                  </fieldset>
                )}
              </>
            ) : (
              <>
                <p>
                  Submit the working product. This checkpoint records your
                  submission without an automated assessment.
                </p>
                {open && (
                  <fieldset disabled={readonly || busy}>
                    <Field
                      label="Working product URL"
                      value={idea.liveUrl}
                      onChange={(v) => change("liveUrl", v)}
                      rows={1}
                      placeholder="https://your-live-product.example"
                    />
                    <Field
                      label="Anything your instructor needs to know? (optional)"
                      value={idea.notes}
                      onChange={(v) => change("notes", v)}
                      hint="Explain where to start. Do not include passwords, API keys, or customer data."
                    />
                  </fieldset>
                )}
              </>
            )}
            {!open && (
              <p className="st-muted">
                Checkpoint {cp - 1} must pass first. You can keep exploring your
                idea in project chat.
              </p>
            )}
            {open && !readonly && (
              <button
                className="st-button"
                disabled={busy || s?.status === "queued"}
                onClick={() => submit(cp)}
              >
                {s?.status === "queued"
                  ? "Review in progress…"
                  : cp === 3
                    ? "Submit working product"
                    : s
                      ? "Save & submit a new version"
                      : "Save & submit for review"}
              </button>
            )}
            {s && (
              <div className="st-review">
                <div className="st-result-heading">
                  <b>Submission v{s.version}</b>
                  <small>{time(s.createdAt)}</small>
                </div>
                <details>
                  <summary>What was submitted</summary>
                  <SubmittedWork submission={s} files={w.files} />
                </details>
                {s.review && (
                  <>
                    <p className="st-review-summary">{s.review.summary}</p>
                    {s.review.criteria.map((c, n) => (
                      <div className="st-criterion" key={`${c.id}-${n}`}>
                        <b>
                          {c.met ? "✓" : "↗"} {c.id}
                        </b>
                        <p>{c.reason}</p>
                        {!c.met && (
                          <p>
                            <strong>Next change:</strong> {c.change}
                          </p>
                        )}
                      </div>
                    ))}
                    {s.review.nextSteps.length > 0 && (
                      <ol>
                        {s.review.nextSteps.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ol>
                    )}
                    {s.review.evidence?.length > 0 && (
                      <details>
                        <summary>Sources cited in this review</summary>
                        <Sources
                          items={s.review.evidence.filter((e) =>
                            s.review!.sourceIds.includes(e.id),
                          )}
                        />
                      </details>
                    )}
                  </>
                )}
                {s.status === "awaiting_review" && (
                  <p>
                    The review could not complete. Your submission is saved.
                    Resubmit to retry, or escalate to your instructor.
                  </p>
                )}
                {s.appeal ? (
                  <div className="st-appeal" id={s.appeal.id}>
                    <h4>
                      {s.appeal.decision
                        ? `Instructor ${s.appeal.decision}`
                        : "Instructor review requested"}
                    </h4>
                    <p>{s.appeal.reason}</p>
                    <p className="st-muted">
                      Email to build@praxel.in, student in CC:{" "}
                      {s.appeal.emailStatus}. Continue the discussion by
                      replying all.
                    </p>
                    {s.appeal.decisionNote && <p>{s.appeal.decisionNote}</p>}
                    {s.appeal.emailStatus === "failed" && !readonly && (
                      <button
                        className="st-button secondary"
                        disabled={busy}
                        onClick={() =>
                          act({ action: "retry-email", appealId: s.appeal!.id })
                        }
                      >
                        Retry email delivery
                      </button>
                    )}
                    {actor.staff && !s.appeal.decision && (
                      <>
                        <Field
                          label="Instructor decision note"
                          value={notes[s.appeal.id] || ""}
                          onChange={(v) =>
                            setNotes({ ...notes, [s.appeal!.id]: v })
                          }
                        />
                        <div className="st-actions">
                          <button
                            className="st-button"
                            disabled={busy}
                            onClick={() =>
                              act(
                                {
                                  action: "decide",
                                  appealId: s.appeal!.id,
                                  decision: "approved",
                                  note: notes[s.appeal!.id] || "",
                                },
                                "Approved. The next checkpoint is open.",
                              )
                            }
                          >
                            Approve checkpoint
                          </button>
                          <button
                            className="st-button secondary"
                            disabled={busy}
                            onClick={() =>
                              act(
                                {
                                  action: "decide",
                                  appealId: s.appeal!.id,
                                  decision: "returned",
                                  note: notes[s.appeal!.id] || "",
                                },
                                "Returned with your feedback.",
                              )
                            }
                          >
                            Return for changes
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  cp < 3 &&
                  ["revise", "evidence_needed", "awaiting_review"].includes(
                    s.status,
                  ) &&
                  !readonly && (
                    <details className="st-appeal">
                      <summary>Disagree? Ask your instructor to review</summary>
                      <Field
                        label="What should your instructor reconsider?"
                        value={reasons[s.id] || ""}
                        onChange={(v) => setReasons({ ...reasons, [s.id]: v })}
                      />
                      <p className="st-muted">
                        We’ll email your submission, AI feedback, and
                        explanation to build@praxel.in, with {actor.email} in
                        CC.
                      </p>
                      <button
                        className="st-button secondary"
                        disabled={busy}
                        onClick={() =>
                          act(
                            {
                              action: "appeal",
                              submissionId: s.id,
                              reason: reasons[s.id] || "",
                            },
                            "Appeal saved. Email delivery status appears here.",
                          )
                        }
                      >
                        Send appeal
                      </button>
                    </details>
                  )
                )}
              </div>
            )}
            {w.submissions.filter((r) => r.checkpoint === cp && r.id !== s?.id)
              .length > 0 && (
              <details className="st-history">
                <summary>
                  Previous submissions (
                  {w.submissions.filter((r) => r.checkpoint === cp).length - 1})
                </summary>
                {w.submissions
                  .filter((r) => r.checkpoint === cp && r.id !== s?.id)
                  .map((r) => (
                    <details key={r.id}>
                      <summary>
                        Version {r.version} · {labels[r.status]} ·{" "}
                        {time(r.createdAt)}
                      </summary>
                      <SubmittedWork submission={r} files={w.files} />
                      <p>{r.review?.summary}</p>
                      {r.appeal?.decisionNote && (
                        <p>Instructor: {r.appeal.decisionNote}</p>
                      )}
                    </details>
                  ))}
              </details>
            )}
          </article>
        );
      })}
    </>
  );
}
