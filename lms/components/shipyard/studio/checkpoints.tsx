"use client";
import { useState } from "react";
import {
  gateOpen,
  latestSubmission,
  wordCount,
  type StudioIdea,
} from "@/lib/shipyard/studio/contracts";
import {
  Field,
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
      {(["sketches", "designs"] as const).map(
        (kind) =>
          Array.isArray(fields[kind]) && (
            <div key={kind}>
              <b>{kind === "sketches" ? "Early sketch" : "Stitch design"}</b>
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
  editIdea,
}: {
  w: Workspace;
  idea: StudioIdea;
  actor: State["actor"];
  busy: boolean;
  readonly: boolean;
  change: (field: keyof StudioIdea, value: unknown) => void;
  act: (body: unknown, success?: string) => Promise<unknown>;
  submit: (cp: number) => void;
  upload: (file: File, kind: "sketch" | "design") => void;
  editIdea: () => void;
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
                  A title, an idea under 200 words, and your landing page.
                  That’s the submission.
                </p>
                <div className="st-rubric">
                  <span>Build in 2 months</span>
                  <span>Start charging in 2 months</span>
                  <span>Software, minimal operations</span>
                </div>
                <p className="st-muted">
                  Active idea: <b>{idea.title || "Untitled"}</b> ·{" "}
                  {wordCount(idea.description)} words
                </p>
                <button className="st-text-button" onClick={editIdea}>
                  Edit the three fields →
                </button>
              </>
            ) : cp === 2 ? (
              <>
                <p>
                  A job spec, the features you will build first, and two stages
                  of design.
                </p>
                {open && (
                  <fieldset disabled={readonly || busy}>
                    <Field
                      label="Jobs to be done · job spec"
                      value={idea.job}
                      onChange={(v) => change("job", v)}
                      rows={5}
                      placeholder="When [situation], [customer] wants to [progress], so they can [outcome]. Today they use [alternative]. Success looks like [observable outcome]."
                    />
                    <div className="st-divider">
                      Feature list{" "}
                      <span>
                        2–3 lines per feature · mark your Minimum Lovable
                        Product
                      </span>
                    </div>
                    {idea.features.map((f, n) => (
                      <div className="st-feature" key={f.id || n}>
                        <input
                          aria-label={`Feature ${n + 1} name`}
                          value={f.name}
                          placeholder="Feature name"
                          onChange={(e) =>
                            change(
                              "features",
                              idea.features.map((x, i) =>
                                i === n ? { ...x, name: e.target.value } : x,
                              ),
                            )
                          }
                        />
                        <textarea
                          aria-label={`Feature ${n + 1} description`}
                          value={f.description}
                          rows={3}
                          placeholder="What does this feature do, for whom, and what happens when they use it?"
                          onChange={(e) =>
                            change(
                              "features",
                              idea.features.map((x, i) =>
                                i === n
                                  ? { ...x, description: e.target.value }
                                  : x,
                              ),
                            )
                          }
                        />
                        <div>
                          <label className="st-checkbox">
                            <input
                              type="checkbox"
                              checked={f.mlp}
                              onChange={(e) =>
                                change(
                                  "features",
                                  idea.features.map((x, i) =>
                                    i === n
                                      ? { ...x, mlp: e.target.checked }
                                      : x,
                                  ),
                                )
                              }
                            />
                            In the MLP
                          </label>
                          <button
                            className="st-text-button"
                            onClick={() =>
                              change(
                                "features",
                                idea.features.filter((_, i) => i !== n),
                              )
                            }
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      className="st-button secondary"
                      onClick={() =>
                        change("features", [
                          ...idea.features,
                          {
                            id: crypto.randomUUID(),
                            name: "",
                            description: "",
                            mlp: true,
                          },
                        ])
                      }
                    >
                      + Add a feature
                    </button>
                    <div className="st-upload-grid">
                      {(["sketch", "design"] as const).map((kind) => (
                        <div className="st-upload" key={kind}>
                          <h4>
                            {kind === "sketch"
                              ? "1. Early sketch"
                              : "2. Stitch designs"}
                          </h4>
                          <p>
                            {kind === "sketch"
                              ? "A photo of a hand-drawn flow or an Excalidraw export."
                              : "Your subsequent Stitch screen designs, exported as images."}
                          </p>
                          <label className="st-button secondary">
                            Choose image
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              disabled={busy || readonly}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) upload(f, kind);
                                e.target.value = "";
                              }}
                            />
                          </label>
                          <small>PNG, JPG or WebP · up to 8 MB each</small>
                          {(kind === "sketch"
                            ? idea.sketches
                            : idea.designs
                          ).map((id) => (
                            <div className="st-file" key={id}>
                              <a
                                target="_blank"
                                rel="noreferrer"
                                href={`/api/shipyard/studio?file=${id}`}
                              >
                                {w.files.find((f) => f.id === id)?.name ||
                                  "Attached image"}{" "}
                                ↗
                              </a>
                              <button
                                aria-label="Remove image"
                                onClick={() =>
                                  change(
                                    kind === "sketch" ? "sketches" : "designs",
                                    (kind === "sketch"
                                      ? idea.sketches
                                      : idea.designs
                                    ).filter((x) => x !== id),
                                  )
                                }
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
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
                idea and using the build room.
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
