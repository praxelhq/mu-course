"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SignInButton, SignUpButton, SignOutButton } from "@clerk/nextjs";
import {
  documentSchema,
  emptyIdea,
  latestSubmission,
  wordCount,
  type StudioDocument,
  type StudioIdea,
} from "@/lib/shipyard/studio/contracts";
import {
  api,
  Field,
  Heading,
  labels,
  Sources,
  time,
  type State,
  type AppealRow,
} from "./shared";
import { Checkpoints } from "./checkpoints";
import { Markdown } from "@/components/markdown";
import { InstructorOverview } from "./instructor";
import type { InstructorState } from "@/lib/shipyard/studio/instructor";
import "./studio.css";
type Tab = "idea" | "evidence" | "checkpoints" | "build" | "team";
const tabs: { id: Tab; label: string; number: string }[] = [
  { id: "idea", label: "Idea notebook", number: "01" },
  { id: "evidence", label: "Evidence library", number: "02" },
  { id: "checkpoints", label: "Checkpoints", number: "03" },
  { id: "build", label: "Build room", number: "04" },
  { id: "team", label: "Your team", number: "05" },
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
    [tab, setTab] = useState<Tab>(instructor ? "checkpoints" : "idea");
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
  const [name, setName] = useState(""),
    [message, setMessage] = useState(""),
    [query, setQuery] = useState(""),
    [source, setSource] = useState("market"),
    [target, setTarget] = useState("");
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
  async function savedAction(body: Record<string, unknown>) {
    if (busyRef.current) return;
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
      if (body.action === "coach") setMessage("");
      setNotice(
        body.action === "submit" && body.checkpoint === 3
          ? "Product received. There is no automated review for this checkpoint."
          : "Saved. Your team can see the result here when it is ready.",
      );
      working(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      working(false);
    }
  }
  async function upload(file: File, kind: "sketch" | "design" | "reference") {
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
      const current = docRef.current!.ideas.find(
        (i) => i.id === docRef.current!.activeIdeaId,
      )!;
      const field =
        kind === "sketch"
          ? "sketches"
          : kind === "design"
            ? "designs"
            : "references";
      change(field, [...current[field], reserved.fileId]);
      await save();
      working(false);
      await load();
      setNotice("Image attached and saved.");
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
        <h1>Students asking for a second look.</h1>
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
  const active = w.jobs.some((j) => ["queued", "running"].includes(j.status));
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
          {tab === "idea" && (
            <>
              <Heading
                number="01"
                kicker="IDEA NOTEBOOK"
                title="Make the idea clearer."
                description="Explore a few directions. Keep one active for your next checkpoint."
              />
              <div className="st-idea-picker">
                <label>
                  Working idea
                  <select
                    value={doc.activeIdeaId}
                    disabled={readonly || busy}
                    onChange={(e) =>
                      edit({ ...doc, activeIdeaId: e.target.value })
                    }
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
                    }}
                  >
                    + Explore another idea
                  </button>
                )}
              </div>
              <fieldset disabled={readonly || busy}>
                <Field
                  label="Give it a working title"
                  value={idea.title}
                  onChange={(v) => change("title", v)}
                  rows={1}
                  placeholder="A short name for what you are making"
                />
                <Field
                  label="The idea, in plain language"
                  value={idea.description}
                  onChange={(v) => change("description", v)}
                  hint={`${wordCount(idea.description)} / 199 words for checkpoint 1`}
                  rows={6}
                  placeholder="For [specific customer], this helps them [job] by [how it works]. They would pay [price] because [value]. Our first customers will come from [channel]."
                />
                <Field
                  label="Landing page URL"
                  value={idea.landingUrl}
                  onChange={(v) => change("landingUrl", v)}
                  rows={1}
                  placeholder="https://your-product.example"
                />
                <div className="st-divider">
                  Work it through{" "}
                  <span>
                    Optional thinking space · not extra submission fields
                  </span>
                </div>
                <div className="st-field-grid">
                  {(
                    [
                      [
                        "customer",
                        "Who is this for?",
                        "Be specific about the first customer.",
                      ],
                      [
                        "problem",
                        "What is painful today?",
                        "Describe the situation, not a broad market.",
                      ],
                      [
                        "alternative",
                        "What do they do instead?",
                        "Include spreadsheets, workarounds, and doing nothing.",
                      ],
                      [
                        "value",
                        "What changes for them?",
                        "A concrete outcome worth paying for.",
                      ],
                      [
                        "pricing",
                        "How would you charge?",
                        "Name the payer and an initial price hypothesis.",
                      ],
                      [
                        "acquisition",
                        "Where are the first customers?",
                        "A channel you can actually reach this month.",
                      ],
                    ] as const
                  ).map(([field, label, hint]) => (
                    <Field
                      key={field}
                      label={label}
                      hint={hint}
                      value={idea[field]}
                      onChange={(v) => change(field, v)}
                    />
                  ))}
                </div>
                <Field
                  label="What still needs to be true?"
                  value={idea.assumptions}
                  onChange={(v) => change("assumptions", v)}
                  placeholder="The riskiest assumptions and the smallest tests that could disprove them."
                />
              </fieldset>
              <button
                className="st-button secondary"
                onClick={() => setTab("checkpoints")}
              >
                See checkpoint 1 →
              </button>
            </>
          )}
          {tab === "evidence" && (
            <>
              <Heading
                number="02"
                kicker="EVIDENCE LIBRARY"
                title="Find something to build on."
                description="Look for the pain, the alternatives, and the reasons your idea might not work."
              />
              <form
                className="st-research-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void savedAction({
                    action: "research",
                    query,
                    source,
                    target,
                  });
                }}
              >
                <label className="st-field">
                  <span>Research question or search phrase</span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    required
                    minLength={3}
                    maxLength={300}
                    placeholder="e.g. invoicing for freelance designers"
                  />
                </label>
                <label className="st-field">
                  <span>Where to look</span>
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                  >
                    <option value="market">
                      Marketplace knowledge + AppRill
                    </option>
                    <option value="reddit">Reddit discussions</option>
                    <option value="x">A public X post</option>
                    <option value="instagram">Instagram post comments</option>
                  </select>
                </label>
                {["x", "instagram"].includes(source) && (
                  <label className="st-field">
                    <span>Public post URL</span>
                    <input
                      type="url"
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                      required
                      placeholder={
                        source === "x"
                          ? "https://x.com/user/status/…"
                          : "https://instagram.com/p/…"
                      }
                    />
                  </label>
                )}
                <p className="st-muted">
                  {source === "market"
                    ? "Search the imported AppSumo, Acquire and TrustMRR knowledge, then fetch matching AppRill listings and review samples."
                    : "One bounded public-data run, up to $0.50 of platform cost. Results may be partial or unavailable. Ten research requests per team per day."}
                </p>
                <button className="st-button" disabled={busy || readonly}>
                  Find evidence ↗
                </button>
              </form>
              {w.jobs
                .filter((j) => j.kind === "research")
                .map((j) => (
                  <article className="st-research-result" key={j.id}>
                    <div className="st-result-heading">
                      <h3>{j.payload.query}</h3>
                      <span className="st-tag">
                        {labels[j.status] || j.status}
                      </span>
                    </div>
                    <p className="st-muted">
                      {time(j.createdAt)} · {j.payload.source}
                    </p>
                    {["queued", "running"].includes(j.status) && !readonly && (
                      <button
                        className="st-text-button"
                        onClick={() => act({ action: "cancel", jobId: j.id })}
                      >
                        Cancel research
                      </button>
                    )}
                    {j.error && <p className="st-error">{j.error}</p>}
                    {j.result?.notes?.map((n) => (
                      <p key={n}>{n}</p>
                    ))}
                    {j.result?.evidence && (
                      <Sources items={j.result.evidence} />
                    )}
                  </article>
                ))}
              {!w.jobs.some((j) => j.kind === "research") && (
                <div className="st-empty">
                  <span>Start with a real question.</span>
                  <p>
                    “What do customers complain about?” is more useful than “Is
                    my idea good?” Every result retains its source and capture
                    date.
                  </p>
                </div>
              )}
            </>
          )}
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
              upload={(f, k) => void upload(f, k)}
              editIdea={() => setTab("idea")}
            />
          )}
          {tab === "build" && (
            <>
              <Heading
                number="04"
                kicker="BUILD ROOM"
                title="Turn the job into working software."
                description="A plan you can use with your coding tool, then test with a real customer."
              />
              <div className="st-build-prompts">
                {[
                  "Create a concrete eight-week build plan for our active idea: narrow MLP, milestones, first paid customer, and acceptance checks.",
                  "Write a build-ready prompt for our core job, including the data model, screens, permissions, error states and how to test it.",
                  "Challenge our MLP. What can we remove and still deliver the whole job?",
                  "Help us test the first customer journey from landing page to payment and the useful result.",
                ].map((p, n) => (
                  <button
                    key={p}
                    disabled={busy || readonly}
                    onClick={() =>
                      void savedAction({ action: "coach", message: p })
                    }
                  >
                    <span>0{n + 1}</span>
                    {
                      [
                        "Plan the eight weeks",
                        "Prepare a build prompt",
                        "Cut the scope",
                        "Test the full journey",
                      ][n]
                    }
                    <span>↗</span>
                  </button>
                ))}
              </div>
              <fieldset disabled={busy || readonly}>
                <Field
                  label="Your build plan and implementation notes"
                  value={idea.buildPlan}
                  onChange={(v) => change("buildPlan", v)}
                  rows={18}
                  hint="Review the coach’s suggestions, then apply what is useful. Keep credentials out of this notebook."
                  placeholder="Milestone 1 · The core job works end-to-end…"
                />
              </fieldset>
              <button
                className="st-button secondary"
                onClick={() => {
                  const blob = new Blob(
                    [
                      `# ${idea.title}\n\n${idea.description}\n\n## Job\n${idea.job}\n\n## Features\n${idea.features.map((f) => `- ${f.name}${f.mlp ? " [MLP]" : " [later]"}: ${f.description}`).join("\n")}\n\n## Build plan\n${idea.buildPlan}`,
                    ],
                    { type: "text/markdown" },
                  );
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = "shipyard-build-brief.md";
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
              >
                Download build brief ↓
              </button>
            </>
          )}
          {tab === "team" && (
            <>
              <Heading
                number="05"
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
        <aside className="st-coach" aria-label="Venture coach">
          <div className="st-coach-heading">
            <span className="st-coach-dot" />
            <h2>Your thinking partner</h2>
            <span className="st-tag">AI</span>
          </div>
          <p className="st-muted">
            Grounded in your brief and saved evidence. Suggestions are yours to
            accept.
          </p>
          <div className="st-coach-feed">
            {w.jobs
              .filter((j) => j.kind === "coach")
              .slice()
              .reverse()
              .map((j) => (
                <article className="st-chat" key={j.id}>
                  <div className="st-user-message">{j.payload.message}</div>
                  {j.result?.answer ? (
                    <>
                      <div className="st-coach-answer">
                        <Markdown>{j.result.answer}</Markdown>
                      </div>
                      {j.result.suggestions?.map((s, n) => (
                        <details className="st-suggestion" key={n}>
                          <summary>Suggested change · {s.field}</summary>
                          <p>{s.why}</p>
                          <pre>{s.value}</pre>
                          {j.result?.workspaceVersion !== w.version && (
                            <small>
                              This suggestion uses an earlier revision. Check it
                              against your current brief.
                            </small>
                          )}
                          <button
                            disabled={readonly || busy}
                            className="st-button secondary"
                            onClick={() => {
                              change(s.field, s.value);
                              saveReason.current = `Accepted coach suggestion: ${s.field}`;
                              setNotice(
                                "Suggestion added to your draft. Review it, then save.",
                              );
                            }}
                          >
                            Apply to draft
                          </button>
                        </details>
                      ))}
                      {j.result.sourceIds && j.result.sourceIds.length > 0 && (
                        <details className="st-chat-sources">
                          <summary>{j.result.sourceIds.length} sources</summary>
                          <Sources
                            items={(j.result.evidence || []).filter((e) =>
                              j.result!.sourceIds!.includes(e.id),
                            )}
                          />
                        </details>
                      )}
                    </>
                  ) : (
                    <p className="st-muted">
                      {j.error || labels[j.status] || j.status}
                    </p>
                  )}
                  {["queued", "running"].includes(j.status) && (
                    <button
                      className="st-text-button"
                      onClick={() => act({ action: "cancel", jobId: j.id })}
                    >
                      Cancel
                    </button>
                  )}
                </article>
              ))}
            {!w.jobs.some((j) => j.kind === "coach") && (
              <div className="st-coach-empty">
                <span className="st-spark">✳</span>
                <h3>What are you thinking about?</h3>
                <p>
                  Bring a rough idea, a frustration you have noticed, or a
                  customer you want to help.
                </p>
                {[
                  "Help me find a small software idea for a customer I can reach.",
                  "Challenge this idea. What is the riskiest assumption?",
                  "Help me find a credible first paid customer in eight weeks.",
                ].map((p) => (
                  <button
                    key={p}
                    disabled={readonly || busy}
                    onClick={() =>
                      void savedAction({ action: "coach", message: p })
                    }
                  >
                    {p} ↗
                  </button>
                ))}
              </div>
            )}
          </div>
          <form
            className="st-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void savedAction({ action: "coach", message });
            }}
          >
            <label className="st-text-button">
              Attach a reference screenshot
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={busy || readonly || idea.references.length >= 3}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file, "reference");
                  e.target.value = "";
                }}
              />
            </label>
            {idea.references.map((id) => (
              <div className="st-member" key={id}>
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={`/api/shipyard/studio?file=${id}`}
                >
                  {w.files.find((f) => f.id === id)?.name || "Reference image"}
                </a>
                <button
                  type="button"
                  disabled={busy || readonly}
                  onClick={() =>
                    change(
                      "references",
                      idea.references.filter((f) => f !== id),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <label className="sr-only" htmlFor="coach-message">
              Message your venture coach
            </label>
            <textarea
              id="coach-message"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Think this through with me…"
              maxLength={5000}
            />
            <div>
              <small>
                {active
                  ? "Your team has work in progress"
                  : "30 coach requests / team / day"}
              </small>
              <button
                className="st-button"
                disabled={busy || readonly || message.trim().length < 3}
              >
                Send ↑
              </button>
            </div>
          </form>
        </aside>
      </div>
      {focusAppeal && (
        <span className="sr-only">Opened appeal {focusAppeal}</span>
      )}
    </main>
  );
}
