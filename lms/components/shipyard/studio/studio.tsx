"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SignInButton, SignUpButton, SignOutButton } from "@clerk/nextjs";
import {
  documentSchema,
  emptyIdea,
  latestSubmission,
  type StudioDocument,
  type StudioIdea,
} from "@/lib/shipyard/studio/contracts";
import { api, Heading, time, type State, type AppealRow } from "./shared";
import { Checkpoints } from "./checkpoints";
import { ProjectChat } from "./chat";
import { InstructorOverview } from "./instructor";
import type { InstructorState } from "@/lib/shipyard/studio/instructor";
import "./studio.css";
type Tab = "chat" | "checkpoints" | "team";
const tabs: { id: Tab; label: string; number: string }[] = [
  { id: "chat", label: "Project chat", number: "✳" },
  { id: "checkpoints", label: "Submissions", number: "01" },
  { id: "team", label: "Your team", number: "02" },
];
export function Studio({
  clerkAvailable,
  inviteToken,
  instructor = false,
  workspaceId,
  focusAppeal,
}: {
  clerkAvailable: boolean;
  inviteToken?: string;
  instructor?: boolean;
  workspaceId?: string;
  focusAppeal?: string;
}) {
  const [state, setState] = useState<State | null>(null),
    [doc, setDoc] = useState<StudioDocument | null>(null),
    [tab, setTab] = useState<Tab>(instructor ? "checkpoints" : "chat");
  const [loading, setLoading] = useState(true),
    [signedOut, setSignedOut] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false),
    versionRef = useRef(0),
    docRef = useRef<StudioDocument | null>(null),
    busyRef = useRef(false);
  const loadSequence = useRef(0),
    saveReason = useRef("Saved workspace"),
    activeJobs = useRef(false);
  const [overview, setOverview] = useState<InstructorState | null>(null);
  const [name, setName] = useState("");
  const [inviteEmail, setInviteEmail] = useState(""),
    [inviteUrl, setInviteUrl] = useState(""),
    [appeals, setAppeals] = useState<AppealRow[]>([]);
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    try {
      const next = await api(
        undefined,
        workspaceId ? `?workspace=${encodeURIComponent(workspaceId)}` : "",
      );
      if (sequence !== loadSequence.current) return;
      setState(next);
      activeJobs.current =
        next.workspace?.jobs.some((j: { status: string }) =>
          ["queued", "running"].includes(j.status),
        ) || false;
      setSignedOut(false);
      if (next.workspace && !dirtyRef.current && !busyRef.current) {
        const d = documentSchema.parse(next.workspace.document);
        const inspectedIdea = docRef.current?.activeIdeaId;
        if (
          instructor &&
          workspaceId &&
          inspectedIdea &&
          d.ideas.some((i) => i.id === inspectedIdea)
        )
          d.activeIdeaId = inspectedIdea;
        setDoc(d);
        docRef.current = d;
        versionRef.current = next.workspace.version;
      }
      if (instructor && next.actor.staff) {
        const queue = await api(undefined, "?instructor=1");
        if (sequence !== loadSequence.current) return;
        setAppeals(queue.appeals);
        setOverview(queue);
      }
    } catch (e) {
      if (sequence !== loadSequence.current) return;
      if ((e as { status?: number }).status === 401) setSignedOut(true);
      else setError((e as Error).message);
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [workspaceId, instructor]);
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    let ticks = 0;
    const timer = setInterval(() => {
      ticks++;
      if (
        !busyRef.current &&
        document.visibilityState === "visible" &&
        (activeJobs.current || ticks % 5 === 0)
      )
        void load();
    }, 6000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [load]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);
  function working(value: boolean) {
    if (value) loadSequence.current++;
    busyRef.current = value;
    setBusy(value);
  }
  function edit(next: StudioDocument) {
    setDoc(next);
    docRef.current = next;
    dirtyRef.current = true;
    setDirty(true);
  }
  function change(field: keyof StudioIdea, value: unknown) {
    const current = docRef.current;
    if (!current) return;
    edit({
      ...current,
      ideas: current.ideas.map((i) =>
        i.id === current.activeIdeaId ? { ...i, [field]: value } : i,
      ),
    });
  }
  async function act(body: unknown, success?: string) {
    if (busyRef.current) return null;
    working(true);
    setError("");
    setNotice("");
    try {
      const result = await api(body);
      if (success) setNotice(success);
      working(false);
      await load();
      return result;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      working(false);
    }
  }
  async function save() {
    if (!dirtyRef.current) return versionRef.current;
    const savedDocument = docRef.current;
    const result = await api({
      action: "save",
      version: versionRef.current,
      document: savedDocument,
      reason: saveReason.current,
    });
    versionRef.current = result.version;
    dirtyRef.current = savedDocument !== docRef.current;
    setDirty(dirtyRef.current);
    saveReason.current = "Saved workspace";
    return result.version as number;
  }
  async function savedAction(body: Record<string, unknown>): Promise<boolean> {
    if (busyRef.current) return false;
    working(true);
    setError("");
    setNotice("");
    try {
      const version = await save();
      if (dirtyRef.current)
        throw new Error(
          "Your draft changed while saving. Save these latest changes, then try again.",
        );
      await api({
        ...body,
        ...(body.action === "submit" ? { version } : {}),
        requestId: crypto.randomUUID(),
      });

      setNotice(
        body.action === "submit" && body.checkpoint === 3
          ? "Product received. There is no automated review for this checkpoint."
          : "Saved. Your team can see the result here when it is ready.",
      );
      working(false);
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      working(false);
    }
  }
  async function upload(
    file: File,
    kind: "sketch" | "design" | "reference",
    destination?: "visuals",
  ) {
    if (busyRef.current) return;
    working(true);
    setError("");
    try {
      const reserved = await api({
        action: "upload",
        name: file.name,
        contentType: file.type,
        bytes: file.size,
        kind,
      });
      const headers = new Headers({ "content-type": file.type });
      for (const [k, v] of Object.entries(reserved.headers || {}))
        if (k.toLowerCase() !== "content-length") headers.set(k, String(v));
      const put = await fetch(reserved.url, {
        method: "PUT",
        headers,
        body: file,
      });
      if (!put.ok)
        throw new Error("The image upload failed. Please try again.");
      await api({ action: "confirm-upload", fileId: reserved.fileId });
      if (kind !== "reference" || destination === "visuals") {
        const current = docRef.current!.ideas.find(
          (i) => i.id === docRef.current!.activeIdeaId,
        )!;
        const field =
          destination || (kind === "sketch" ? "sketches" : "designs");
        change(field, [...current[field], reserved.fileId]);
        await save();
      }
      working(false);
      await load();
      setNotice("Image uploaded.");
      return reserved.fileId as string;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      working(false);
    }
  }
  const w = state?.workspace,
    idea = doc?.ideas.find((i) => i.id === doc.activeIdeaId),
    ownMember = w?.members.find((m) => m.identity.id === state?.actor.id);
  const readonly = Boolean(workspaceId && state?.actor.staff && !ownMember);
  if (loading)
    return (
      <main className="st-loading" aria-live="polite">
        <span className="st-mark">s.</span>
        <p>Opening your workspace…</p>
      </main>
    );
  if (signedOut)
    return (
      <main className="st-welcome">
        <div className="st-kicker">THE VENTURE WORKSPACE</div>
        <h1>
          Find an idea worth
          <br />
          <em>spending eight weeks on.</em>
        </h1>
        <p className="st-lede">
          Think it through. Find the evidence. Make it smaller, sharper, and
          ready for a first customer.
        </p>
        <div className="st-auth">
          {clerkAvailable ? (
            <>
              <SignUpButton
                mode="modal"
                forceRedirectUrl={
                  inviteToken
                    ? `/shipyard/join?token=${encodeURIComponent(inviteToken)}`
                    : "/shipyard"
                }
              >
                <button className="st-button">
                  Start with your MU email ↗
                </button>
              </SignUpButton>
              <SignInButton
                mode="modal"
                forceRedirectUrl={
                  inviteToken
                    ? `/shipyard/join?token=${encodeURIComponent(inviteToken)}`
                    : "/shipyard"
                }
              >
                <button className="st-button secondary">
                  Already registered? Sign in
                </button>
              </SignInButton>
            </>
          ) : (
            <Link className="st-button" href="/shipyard/demo">
              Open a local demo persona
            </Link>
          )}
        </div>
        <p className="st-muted">
          For Masters’ Union students · Work solo or with your team
        </p>
        <div className="st-welcome-grid">
          <article>
            <b>01 / Shape</b>
            <h2>A clearer idea.</h2>
            <p>
              A coach that asks useful questions, challenges the scope, and
              helps you choose.
            </p>
          </article>
          <article>
            <b>02 / Ground</b>
            <h2>Evidence, with receipts.</h2>
            <p>
              Marketplace knowledge, app insights, and real conversations. Know
              what is fact and what is still a bet.
            </p>
          </article>
          <article>
            <b>03 / Ship</b>
            <h2>A product people can use.</h2>
            <p>
              Three checkpoints. Specific feedback. A plan from the core job to
              the first sale.
            </p>
          </article>
        </div>
      </main>
    );
  if (!state)
    return (
      <main className="st-welcome">
        <h1>Let’s get you in.</h1>
        <p role="alert">{error}</p>
        {clerkAvailable && (
          <SignOutButton redirectUrl="/shipyard">
            <button className="st-button">Use a different email</button>
          </SignOutButton>
        )}
      </main>
    );
  if (instructor && !state.actor.staff)
    return (
      <main className="st-welcome">
        <h1>Instructor access required.</h1>
        <Link href="/shipyard">Return to your workspace</Link>
      </main>
    );
  const account = (
    <div className="st-account">
      <span>{state.actor.email}</span>
      {state.actor.staff && (
        <Link href="/shipyard/reviews">Instructor desk</Link>
      )}
      <Link href="/shipyard/history">Previous course work</Link>
      {clerkAvailable && (
        <SignOutButton redirectUrl="/shipyard">
          <button>Sign out</button>
        </SignOutButton>
      )}
    </div>
  );
  if (instructor && !workspaceId)
    return (
      <main className="st-desk">
        {account}
        <div className="st-kicker">INSTRUCTOR DESK</div>
        <h1>Projects, submissions and second looks.</h1>
        {error && (
          <p className="st-error" role="alert">
            {error}
          </p>
        )}
        <p>
          Continue the discussion over email. Record the final decision here to
          update progression.
        </p>
        {appeals.length === 0 ? (
          <div className="st-empty">No appeals yet.</div>
        ) : (
          appeals.map((a) => (
            <Link
              className="st-appeal-row"
              key={a.id}
              href={`/shipyard/reviews?workspace=${a.submission.workspaceId}&appeal=${a.id}`}
            >
              <div>
                <b>{a.submission.workspace.name}</b>
                <p>
                  {a.studentEmail} · checkpoint {a.submission.checkpoint} ·
                  version {a.submission.version}
                </p>
                <p>{a.reason}</p>
              </div>
              <span className="st-tag">
                {a.decision || "Needs decision"} · email {a.emailStatus}
              </span>
            </Link>
          ))
        )}
        {overview && (
          <InstructorOverview data={overview} busy={busy} act={act} />
        )}
      </main>
    );
  if (!w || !idea || !doc)
    return (
      <main className="st-welcome st-onboard">
        {account}
        <div className="st-kicker">YOUR NEXT EIGHT WEEKS</div>
        <h1>
          {inviteToken
            ? "Join your team."
            : "Every useful product starts somewhere."}
        </h1>
        <p className="st-lede">
          {inviteToken
            ? "Accept the invitation to share your team’s ideas, evidence, and submissions."
            : "Give your workspace a name. Start on your own, or invite teammates once you are inside."}
        </p>
        {error && (
          <p className="st-error" role="alert">
            {error}
          </p>
        )}
        {inviteToken ? (
          <button
            className="st-button"
            disabled={busy}
            onClick={() =>
              act(
                { action: "join", token: inviteToken },
                "You joined the team.",
              )
            }
          >
            Accept team invitation
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act({ action: "create", name });
            }}
          >
            <label className="st-field">
              <span>Workspace or team name</span>
              <input
                required
                minLength={2}
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Small Useful Things"
              />
            </label>
            <button className="st-button" disabled={busy}>
              Create workspace ↗
            </button>
          </form>
        )}
        <p className="st-muted">
          One shared workspace per student. Each teammate signs in with their
          own verified MU email.
        </p>
      </main>
    );
  return (
    <main className="st-app">
      {account}
      <div className="st-workspace-bar">
        <div>
          <span className="st-kicker">
            {w.members.length === 1 ? "SOLO WORKSPACE" : "TEAM WORKSPACE"}
          </span>
          <h1>{w.name}</h1>
        </div>
        <div className="st-save">
          <span>
            {dirty ? "Unsaved changes" : `Saved · revision ${w.version}`}
          </span>
          {!readonly && (
            <button
              className="st-button secondary"
              disabled={busy || !dirty}
              onClick={async () => {
                working(true);
                setError("");
                try {
                  await save();
                  working(false);
                  await load();
                  setNotice("Workspace saved.");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  working(false);
                }
              }}
            >
              Save changes
            </button>
          )}
        </div>
      </div>
      {error && (
        <div className="st-error" role="alert">
          {error}
          {error.includes("teammate") && (
            <button
              onClick={() => {
                if (
                  window.confirm(
                    "Discard your unsaved edits and load the latest team version?",
                  )
                ) {
                  dirtyRef.current = false;
                  setDirty(false);
                  void load();
                  setError("");
                }
              }}
            >
              Load team version
            </button>
          )}
        </div>
      )}
      {notice && (
        <div className="st-notice" role="status">
          {notice}
        </div>
      )}
      {inviteToken && (
        <div className="st-notice">
          You belong to a workspace. To join a different team, ask your current
          owner to remove you first.
        </div>
      )}
      <div className="st-layout">
        <aside className="st-sidebar">
          <div className="st-project-picker">
            <label>
              Project
              <select
                aria-label="Working idea"
                value={doc.activeIdeaId}
                disabled={busy}
                onChange={(e) => {
                  const next = { ...doc, activeIdeaId: e.target.value };
                  if (readonly) {
                    setDoc(next);
                    docRef.current = next;
                  } else edit(next);
                }}
              >
                {doc.ideas.map((i, n) => (
                  <option key={i.id} value={i.id}>
                    {i.title || `Untitled idea ${n + 1}`}
                  </option>
                ))}
              </select>
            </label>
            {!readonly && doc.ideas.length < 12 && (
              <button
                className="st-text-button"
                disabled={busy}
                onClick={() => {
                  const id = crypto.randomUUID();
                  edit({
                    ...doc,
                    activeIdeaId: id,
                    ideas: [...doc.ideas, emptyIdea(id)],
                  });
                  setTab("chat");
                }}
              >
                ＋ Explore another idea
              </button>
            )}
          </div>
          <nav aria-label="Workspace sections">
            {tabs.map((t) => (
              <button
                key={t.id}
                aria-current={tab === t.id ? "page" : undefined}
                onClick={() => setTab(t.id)}
              >
                <span>{t.number}</span>
                {t.label}
              </button>
            ))}
          </nav>
          <div className="st-sidebar-note">
            <span className="st-kicker">THE CONSTRAINT</span>
            <p>
              Small enough to build.
              <br />
              Useful enough to charge for.
              <br />
              Software that does the work.
            </p>
            <strong>Eight weeks.</strong>
          </div>
          <div className="st-progress">
            {[1, 2, 3].map((cp) => {
              const s = latestSubmission(cp, w.submissions);
              return (
                <button key={cp} onClick={() => setTab("checkpoints")}>
                  <span
                    className={
                      s?.status === "passed" || s?.status === "received"
                        ? "done"
                        : ""
                    }
                  >
                    {s?.status === "passed" || s?.status === "received"
                      ? "✓"
                      : cp}
                  </span>
                  {["Idea", "Product spec", "Working product"][cp - 1]}
                </button>
              );
            })}
          </div>
        </aside>
        <section
          className="st-content"
          aria-label={tabs.find((t) => t.id === tab)?.label}
        >
          <div hidden={tab !== "chat"}>
            <ProjectChat
              key={idea.id}
              w={w}
              idea={idea}
              busy={busy}
              readonly={readonly}
              visible={tab === "chat"}
              send={(message, attachmentIds) =>
                savedAction({ action: "coach", message, attachmentIds })
              }
              upload={(file) => upload(file, "reference")}
              apply={(field, value) => {
                change(field, value);
                saveReason.current = `Accepted coach suggestion: ${field}`;
                setNotice(
                  "Added to your draft. Save changes to share with your team.",
                );
              }}
              cancel={(jobId) => void act({ action: "cancel", jobId })}
            />
          </div>
          {tab === "checkpoints" && (
            <Checkpoints
              w={w}
              idea={idea}
              actor={state.actor}
              busy={busy}
              readonly={readonly}
              change={change}
              act={act}
              submit={(cp) =>
                void savedAction({ action: "submit", checkpoint: cp })
              }
              upload={(f, k) =>
                void upload(
                  f,
                  k === "visuals" ? "reference" : "design",
                  k === "visuals" ? "visuals" : undefined,
                )
              }
            />
          )}
          {tab === "team" && (
            <>
              <Heading
                number="02"
                kicker="YOUR TEAM"
                title="One workspace. Shared progress."
                description="Each person uses their own MU email. Submissions preserve the team that submitted them."
              />
              {w.members.map((m) => (
                <div className="st-member" key={m.id}>
                  <span className="st-avatar">
                    {m.identity.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <b>{m.identity.name}</b>
                    <p>{m.identity.email}</p>
                  </div>
                  <span className="st-tag">{m.role}</span>
                  {ownMember?.role === "owner" && m.id !== ownMember.id && (
                    <details>
                      <summary>Manage</summary>
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              `Transfer ownership to ${m.identity.email}? You will become a member.`,
                            )
                          )
                            void act({
                              action: "member",
                              memberId: m.id,
                              operation: "owner",
                            });
                        }}
                      >
                        Make owner
                      </button>
                      <button
                        onClick={() => {
                          if (
                            confirm(`Remove ${m.identity.email} from the team?`)
                          )
                            void act({
                              action: "member",
                              memberId: m.id,
                              operation: "remove",
                            });
                        }}
                      >
                        Remove member
                      </button>
                    </details>
                  )}
                </div>
              ))}
              {ownMember?.role === "owner" && (
                <form
                  className="st-invite"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const r = await act({
                      action: "invite",
                      email: inviteEmail,
                    });
                    if (r) setInviteUrl(r.inviteUrl);
                  }}
                >
                  <h3>Invite a teammate</h3>
                  <p>
                    Share an invitation link. Only the MU email you enter can
                    accept it.
                  </p>
                  <label className="st-field">
                    <span>Teammate’s MU email</span>
                    <input
                      type="email"
                      required
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="student@mastersunion.org"
                    />
                  </label>
                  <button className="st-button" disabled={busy}>
                    Create invitation link
                  </button>
                  {inviteUrl && (
                    <div className="st-invite-link">
                      <input
                        aria-label="Invitation link"
                        readOnly
                        value={inviteUrl}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          void navigator.clipboard
                            .writeText(inviteUrl)
                            .then(() => setNotice("Invitation link copied."))
                        }
                      >
                        Copy link
                      </button>
                    </div>
                  )}
                </form>
              )}
              {w.invitations.map((i) => (
                <div className="st-member" key={i.id}>
                  <div>
                    <b>{i.email}</b>
                    <p>Pending · expires {time(i.expiresAt)}</p>
                  </div>
                  {ownMember?.role === "owner" && (
                    <button
                      onClick={() =>
                        act({ action: "revoke", invitationId: i.id })
                      }
                    >
                      Revoke invitation
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
        </section>
      </div>
      {focusAppeal && (
        <span className="sr-only">Opened appeal {focusAppeal}</span>
      )}
    </main>
  );
}
