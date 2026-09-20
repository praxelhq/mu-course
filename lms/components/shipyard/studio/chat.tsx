"use client";
import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/markdown";
import type { StudioIdea } from "@/lib/shipyard/studio/contracts";
import { ImageUploads, Sources, labels, type Workspace } from "./shared";

export function ProjectChat({
  w,
  idea,
  busy,
  readonly,
  visible,
  send,
  upload,
  apply,
  cancel,
}: {
  w: Workspace;
  idea: StudioIdea;
  busy: boolean;
  readonly: boolean;
  visible: boolean;
  send: (message: string, attachmentIds: string[]) => Promise<boolean>;
  upload: (file: File) => Promise<string | undefined>;
  apply: (field: keyof StudioIdea, value: string) => void;
  cancel: (id: string) => void;
}) {
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const feed = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const jobs = w.jobs
    .filter((j) => j.kind === "coach" && j.payload.idea?.id === idea.id)
    .slice()
    .reverse();
  const pending = jobs.some((j) => ["queued", "running"].includes(j.status));
  const signature = jobs.map((j) => `${j.id}:${j.status}`).join("|");
  useEffect(() => {
    if (visible && nearBottom.current && feed.current)
      feed.current.scrollTop = feed.current.scrollHeight;
  }, [signature, visible]);
  async function submit(text = message) {
    if (busy || pending || readonly || text.trim().length < 3) return;
    const accepted = await send(text, attachments);
    if (accepted) {
      setMessage("");
      setAttachments([]);
      nearBottom.current = true;
    }
  }
  return (
    <div className="st-project-chat">
      <header className="st-chat-header">
        <div>
          <span className="st-kicker">YOUR PROJECT COMPANION</span>
          <h2>{idea.title || "Let’s find something worth building."}</h2>
        </div>
        <span className="st-tag">Shared with your team</span>
      </header>
      <div
        className="st-conversation"
        ref={feed}
        role="log"
        aria-label="Project conversation"
        aria-live="polite"
        onScroll={() => {
          const el = feed.current;
          if (el)
            nearBottom.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 100;
        }}
      >
        {!jobs.length && (
          <div className="st-chat-welcome">
            <span className="st-spark">✳</span>
            <h3>What are you thinking about?</h3>
            <p>
              Bring an idea, a problem you’ve noticed, or a screen you’re
              working on. We’ll work through what you can build, which APIs you
              need, and who might pay.
            </p>
            <div className="st-starters">
              {[
                [
                  "Find an idea",
                  "Help me find a small software idea for an audience I can reach.",
                ],
                [
                  "Check feasibility",
                  "Help me check whether we can build this idea in eight weeks. Which APIs or data do we need, and what should we verify first?",
                ],
                [
                  "Find our first customers",
                  "Help us identify a reachable audience and a realistic way to make our first sale.",
                ],
                [
                  "Plan the build",
                  "Help us turn this project into a small build plan with the necessary APIs, screens and acceptance checks.",
                ],
              ].map(([label, text]) => (
                <button
                  key={label}
                  disabled={busy || readonly}
                  onClick={() => void submit(text)}
                >
                  <b>{label}</b>
                  <span>↗</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {jobs.map((j) => (
          <article className="st-chat-turn" key={j.id}>
            <div className="st-user-message">
              <span className="sr-only">Student: </span>
              {j.payload.message}
              {!!j.payload.attachmentIds?.length && (
                <div className="st-chat-images">
                  {j.payload.attachmentIds.map((id) => (
                    <a
                      key={id}
                      target="_blank"
                      rel="noreferrer"
                      href={`/api/shipyard/studio?file=${encodeURIComponent(id)}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        loading="lazy"
                        src={`/api/shipyard/studio?file=${encodeURIComponent(id)}`}
                        alt={
                          w.files.find((f) => f.id === id)?.name ||
                          "Message attachment"
                        }
                      />
                    </a>
                  ))}
                </div>
              )}
            </div>
            {j.result?.answer ? (
              <div className="st-assistant-message">
                <span className="st-kicker">SHIPYARD</span>
                <Markdown>{j.result.answer}</Markdown>
                {!!j.result.sourceIds?.length && (
                  <details className="st-chat-sources">
                    <summary>Sources ({j.result.sourceIds.length})</summary>
                    <Sources
                      items={(j.result.evidence || []).filter((e) =>
                        j.result!.sourceIds!.includes(e.id),
                      )}
                    />
                  </details>
                )}
                {!!j.result.suggestions?.length && (
                  <details className="st-suggestion">
                    <summary>
                      Suggested updates to your optional project notes
                    </summary>
                    {j.result.suggestions.map((s, n) => (
                      <div key={n}>
                        <b>{s.field}</b>
                        <p>{s.why}</p>
                        <pre>{s.value}</pre>
                        {j.result?.workspaceVersion !== w.version && (
                          <small>
                            This uses an earlier draft. Check it against your
                            latest work.
                          </small>
                        )}
                        <button
                          className="st-text-button"
                          disabled={busy || readonly}
                          onClick={() => apply(s.field, s.value)}
                        >
                          Apply to draft
                        </button>
                      </div>
                    ))}
                  </details>
                )}
              </div>
            ) : (
              <div className="st-assistant-message">
                <p className="st-muted">
                  {j.error ||
                    (j.status === "running"
                      ? "Thinking through your project…"
                      : labels[j.status])}
                </p>
                {["queued", "running"].includes(j.status) && !readonly && (
                  <button
                    className="st-text-button"
                    onClick={() => cancel(j.id)}
                  >
                    Stop response
                  </button>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
      {readonly ? (
        <p className="st-muted">
          Instructor view · this is the team’s saved conversation.
        </p>
      ) : (
        <form
          className="st-chat-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="sr-only" htmlFor="project-message">
            Message Shipyard
          </label>
          <textarea
            id="project-message"
            rows={3}
            placeholder="Ask anything about your project…"
            value={message}
            maxLength={5000}
            disabled={busy}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <details
            className="st-chat-attach"
            open={attachments.length ? true : undefined}
          >
            <summary>
              ＋ Add images
              {attachments.length ? ` (${attachments.length})` : ""}
            </summary>
            <ImageUploads
              title="Chat images"
              hint="Add a sketch, reference or screenshot to this message."
              ids={attachments}
              files={w.files}
              disabled={busy || pending}
              limit={3}
              upload={async (file) => {
                const id = await upload(file);
                if (id) setAttachments((current) => [...current, id]);
              }}
              remove={(id) =>
                setAttachments((current) => current.filter((x) => x !== id))
              }
            />
          </details>
          <div className="st-composer-actions">
            <small>
              {pending
                ? "Your response is on its way…"
                : "Enter to send · Shift + Enter for a new line"}
            </small>
            <button
              className="st-button"
              disabled={busy || pending || message.trim().length < 3}
            >
              Send ↑
            </button>
          </div>
          <p className="st-chat-disclaimer">
            Your project context stays with this conversation. Check API access
            and source claims before relying on them.
          </p>
        </form>
      )}
    </div>
  );
}
