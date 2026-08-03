"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, Copy, Download, ExternalLink, LoaderCircle, Plus, RefreshCw, Save, Sparkles, Trash2 } from "lucide-react";
import { Brand } from "@/components/brand";
import { track } from "@/components/analytics/clarity";
import type { BuildUnderstanding, PromptSetContent } from "@/lib/contracts";
import { completedIndexes, firstIncompleteIndex, nextIncompleteIndex } from "@/lib/progress";

type Project = {
  id: string; userId: string; name: string; sourceUrl: string; uiReferenceUrl?: string | null; niche: string; usp: string; buildTarget: string;
  status: "draft" | "analyzing" | "review" | "approved" | "generating" | "complete" | "failed";
  currentUnderstanding: number | null; approvedVersion: number | null;
  understandings: { version: number; content: BuildUnderstanding; evidence: { url: string; title: string; excerpt: string }[]; approvedAt?: string | null }[];
  promptSets: { id: string; model: string; platform: string; templateVersion: string; content: PromptSetContent; completedOrders: number[] }[];
  jobs: { status: string; kind: string; sanitizedError?: string | null; servedModel?: string | null }[];
};

const targets = [{ value: "lovable", label: "Lovable" }, { value: "replit", label: "Replit" }, { value: "base44", label: "Base44" }, { value: "claude-code", label: "Claude Code" }];

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const payload = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(payload?.error ?? "Something went wrong.");
  return payload as T;
}

export function Workspace(): React.ReactNode {
  const [project, setProject] = useState<Project | null>(null);
  const [entitled, setEntitled] = useState(false);
  const [availableLicenses, setAvailableLicenses] = useState(0);
  const [lockedPromptCount, setLockedPromptCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const trackedMilestones = useRef(new Set<string>());

  const loadProject = useCallback(async (id: string) => {
    const data = await jsonRequest<{ project: Project; entitled: boolean; availableLicenses: number; lockedPromptCount: number }>(`/api/projects/${id}`);
    setProject(data.project); setEntitled(data.entitled); setAvailableLicenses(data.availableLicenses); setLockedPromptCount(data.lockedPromptCount); setError(null);
    const milestone = `${data.project.id}:${data.project.status}`;
    if (!trackedMilestones.current.has(milestone)) {
      if (data.project.status === "review") track("analysis_completed");
      if (data.project.status === "complete") track("prompt_set_generated");
      trackedMilestones.current.add(milestone);
    }
  }, []);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("project");
    const boot = async () => {
      if (id) await loadProject(id);
      else {
        const data = await jsonRequest<{ projects: { id: string }[] }>("/api/projects");
        if (data.projects[0]) await loadProject(data.projects[0].id);
      }
    };
    boot().catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load workspace.")).finally(() => setLoading(false));
  }, [loadProject]);

  useEffect(() => {
    if (!project || !(["analyzing", "generating"] as string[]).includes(project.status)) return;
    const timer = window.setInterval(() => loadProject(project.id).catch(() => undefined), 1800);
    return () => window.clearInterval(timer);
  }, [project, loadProject]);

  useEffect(() => {
    if (!project || entitled || new URLSearchParams(window.location.search).get("checkout") !== "return") return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      void loadProject(project.id);
      if (attempts >= 12) window.clearInterval(timer);
    }, 1800);
    return () => window.clearInterval(timer);
  }, [project, entitled, loadProject]);

  useEffect(() => {
    if (!project) return;
    window.clarity?.("identify", project.userId);
    const milestone = `${project.id}:entitled`;
    if (entitled && !trackedMilestones.current.has(milestone)) {
      track("entitlement_verified");
      trackedMilestones.current.add(milestone);
    }
  }, [project, entitled]);

  const selectProject = (next: Project) => {
    setProject(next);
    window.history.replaceState(null, "", `/workspace?project=${next.id}`);
  };

  const startNewProject = () => {
    setProject(null);
    setError(null);
    window.history.replaceState(null, "", "/workspace");
  };

  return (
    <main className="workspace" data-clarity-mask="true">
      <header className="workspace-header"><Brand /><div className="project-title">{project?.name ?? "New project"}</div><div className="workspace-header-actions"><Link href="/" className="workspace-home"><ArrowLeft size={14} /> Home</Link>{project ? <button type="button" onClick={startNewProject}><Plus size={14} /> New analysis</button> : null}<div className="workspace-status">{project ? <><span className={`status-dot ${project.status}`} />{project.status}</> : "Private workspace"}</div></div></header>
      {project ? <StageRail status={project.status} /> : null}
      {loading ? <CenteredState icon={<LoaderCircle className="spin" />} title="Loading your workspace" body="Restoring the latest durable project state." /> : null}
      {!loading && error ? <CenteredState icon={<AlertTriangle />} title="The workspace needs attention" body={error} action={<button className="button secondary" onClick={() => window.location.reload()}>Retry</button>} /> : null}
      {!loading && !error && !project ? <ProjectSetup onCreated={selectProject} /> : null}
      {!loading && project && (["analyzing", "failed"] as string[]).includes(project.status) ? <AnalysisState project={project} onNew={startNewProject} /> : null}
      {!loading && project && project.status === "review" && project.understandings[0] ? <UnderstandingEditor project={project} onReload={() => loadProject(project.id)} /> : null}
      {!loading && project && project.status === "approved" ? <ApprovalGate project={project} onReload={() => loadProject(project.id)} /> : null}
      {!loading && project && project.status === "generating" ? <CenteredState icon={<LoaderCircle className="spin" />} title="Building your prompt sequence" body="Mapping every approved feature and flow into the right implementation order." /> : null}
      {!loading && project && project.status === "complete" && project.promptSets[0] ? <PromptSequence key={`${project.promptSets[0].id}:${entitled}`} project={project} entitled={entitled} availableLicenses={availableLicenses} lockedPromptCount={lockedPromptCount} onReload={() => loadProject(project.id)} /> : null}
    </main>
  );
}

function StageRail({ status }: { status: Project["status"] }): React.ReactNode {
  const active = status === "analyzing" || status === "failed" ? 0 : status === "review" ? 1 : status === "approved" ? 2 : 3;
  return <nav className="stage-rail" aria-label="Project stages">{["Source", "Understanding", "Approval", "Prompts"].map((label, index) => <div className={index === active ? "active" : index < active ? "done" : ""} key={label}><span>{index < active ? <Check size={15} /> : index + 1}</span><div><strong>{label}</strong><small>{index < active ? "Complete" : index === active ? "Current stage" : "Not started"}</small></div></div>)}</nav>;
}

function CenteredState({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }): React.ReactNode {
  return <section className="centered-state"><div className="state-icon">{icon}</div><h1>{title}</h1><p>{body}</p>{action}</section>;
}

function ProjectSetup({ onCreated }: { onCreated: (project: Project) => void }): React.ReactNode {
  const [submitting, setSubmitting] = useState(false); const [message, setMessage] = useState<string | null>(null);
  async function submit(formData: FormData) {
    setSubmitting(true); setMessage(null);
    try {
      const result = await jsonRequest<{ projectId: string }>("/api/projects", { method: "POST", body: JSON.stringify(Object.fromEntries(formData)) });
      track("project_started");
      const loaded = await jsonRequest<{ project: Project; entitled: boolean }>(`/api/projects/${result.projectId}`);
      onCreated(loaded.project);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Could not start analysis."); }
    finally { setSubmitting(false); }
  }
  return <section className="setup-panel"><div className="setup-copy"><h1>Start with the product.<br />Change the reason to choose it.</h1><p>Give VibesClone one public source, the audience you want, and the USP you’ll compete on. You’ll verify the interpretation before any prompt is generated.</p></div><form action={submit} className="project-form"><label>Product URL<input name="sourceUrl" type="url" required placeholder="https://linear.app" /></label><label>Reference UI URL <span>optional</span><input name="uiReferenceUrl" type="url" placeholder="Public Stitch or inspiration link" /></label><div className="form-split"><label>Target niche<input name="niche" required minLength={2} placeholder="Independent recruiters" /></label><label>USP direction<input name="usp" required minLength={2} placeholder="Local-first and radically fast" /></label></div><fieldset><legend>Build target</legend><div className="target-options">{targets.map((target, index) => <label key={target.value}><input type="radio" name="buildTarget" value={target.value} defaultChecked={index === 3} /><span>{target.label}</span></label>)}</div></fieldset>{message ? <p className="form-error">{message}</p> : null}<button className="button primary wide" disabled={submitting}>{submitting ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}{submitting ? "Starting analysis" : "Analyze product"}</button></form></section>;
}

function AnalysisState({ project, onNew }: { project: Project; onNew: () => void }): React.ReactNode {
  if (project.status === "failed") return <CenteredState icon={<AlertTriangle />} title="Analysis paused safely" body={project.jobs[0]?.sanitizedError ?? "The provider could not finish this run."} action={<button className="button secondary" onClick={onNew}>Start a fresh analysis</button>} />;
  return <section className="analysis-state"><div className="analysis-orbit"><ScanMarks /><span>Reading</span></div><h1>Building the product model</h1><p>Extracting public evidence, mapping the ICP and flows, then transforming the feature set for <strong>{project.niche}</strong>.</p><div className="analysis-steps">{["Source evidence", "Jobs + flows", "Feature decisions", "Niche + USP mapping"].map((item, index) => <div key={item} className={index === 0 ? "working" : ""}><span>{index === 0 ? <LoaderCircle className="spin" size={15} /> : <Circle size={15} />}</span>{item}</div>)}</div></section>;
}

function ScanMarks(): React.ReactNode { return <div className="scan-marks" aria-hidden><i /><i /><i /><i /></div>; }

function UnderstandingEditor({ project, onReload }: { project: Project; onReload: () => Promise<void> }): React.ReactNode {
  const latest = project.understandings[0];
  const [value, setValue] = useState<BuildUnderstanding>(latest.content);
  const [busy, setBusy] = useState<"save" | "approve" | null>(null); const [message, setMessage] = useState<string | null>(null);
  const changeFeature = (index: number, key: "name" | "rationale" | "disposition", next: string) => setValue((current) => ({ ...current, features: current.features.map((feature, i) => i === index ? { ...feature, [key]: next } : feature) }));
  async function persist(): Promise<number> { const result = await jsonRequest<{ version: number }>(`/api/projects/${project.id}/understanding`, { method: "PUT", body: JSON.stringify(value) }); return result.version; }
  async function save(): Promise<number> { setBusy("save"); setMessage(null); try { return await persist(); } finally { setBusy(null); } }
  async function approve() { setBusy("approve"); setMessage(null); try { if (JSON.stringify(value) !== JSON.stringify(latest.content)) await persist(); await jsonRequest(`/api/projects/${project.id}/approve`, { method: "POST" }); track("understanding_approved"); await onReload(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Approval failed."); } finally { setBusy(null); } }
  async function rethink() { setBusy("save"); setMessage(null); try { await jsonRequest(`/api/projects/${project.id}/rethink`, { method: "POST" }); await onReload(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Rethink failed."); } finally { setBusy(null); } }
  return <section className="understanding-shell"><aside className="understanding-nav"><span>BUILD UNDERSTANDING</span>{["Product identity", "ICP", "Core jobs", "Product flows", "Feature map", "Niche + USP changes", "Evidence gaps"].map((item, index) => <button className={index === 0 ? "selected" : ""} key={item}><span>{index < 5 ? <Check size={14} /> : <Circle size={14} />}</span>{item}</button>)}</aside><div className="understanding-main"><div className="screen-title"><div><h1>Build Understanding</h1><p>Review and refine the AI’s interpretation. This exact version becomes the source for every prompt.</p></div><div className="screen-actions"><button className="button secondary" onClick={rethink} disabled={Boolean(busy)}><RefreshCw size={16} /> Rethink</button><button className="button secondary" onClick={() => save().catch((reason) => setMessage(reason.message))} disabled={Boolean(busy)}><Save size={16} /> {busy === "save" ? "Saving" : "Save changes"}</button><button className="button primary" onClick={approve} disabled={Boolean(busy)}><Check size={17} /> {busy === "approve" ? "Approving" : "Approve understanding"}</button></div></div><div className="identity-editors"><label>Product name<input value={value.productName} onChange={(event) => setValue({ ...value, productName: event.target.value })} /></label><label className="summary-editor">Product summary<textarea value={value.summary} onChange={(event) => setValue({ ...value, summary: event.target.value })} /></label></div><p className="identity-hint">Name the product you are building—not the source product or VibesClone. This exact name is used throughout every prompt.</p><div className="feature-table"><div className="feature-head"><span>Feature</span><span>Decision</span><span>Why this changes</span></div>{value.features.map((feature, index) => <div className="feature-row" key={`${feature.name}-${index}`}><input aria-label={`Feature ${index + 1}`} value={feature.name} onChange={(event) => changeFeature(index, "name", event.target.value)} /><select aria-label={`Decision for ${feature.name}`} value={feature.disposition} onChange={(event) => changeFeature(index, "disposition", event.target.value)}><option value="retain">Retain</option><option value="modify">Modify</option><option value="remove">Remove</option><option value="add">Add</option></select><textarea aria-label={`Rationale for ${feature.name}`} value={feature.rationale} onChange={(event) => changeFeature(index, "rationale", event.target.value)} /><span className={`confidence ${feature.confidence}`}>{feature.confidence} confidence</span></div>)}<button className="add-row" onClick={() => setValue({ ...value, features: [...value.features, { name: "New feature", disposition: "add", rationale: "Explain why this earns its place.", confidence: "high", evidenceUrls: [] }] })}><Plus size={15} /> Add feature</button></div>{message ? <p className="form-error">{message}</p> : null}</div><aside className="evidence-rail"><div className="evidence-title">Evidence from source <span>{latest.evidence.length}</span></div>{latest.evidence.map((item, index) => <article key={`${item.url}-${index}`}><strong>{item.title}</strong><p>{item.excerpt}</p><a href={item.url} target="_blank" rel="noreferrer">View source <ExternalLink size={12} /></a></article>)}</aside></section>;
}

function ApprovalGate({ project, onReload }: { project: Project; onReload: () => Promise<void> }): React.ReactNode {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  async function generate() { setBusy(true); try { await jsonRequest(`/api/projects/${project.id}/generate`, { method: "POST" }); await onReload(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Could not generate."); } finally { setBusy(false); } }
  return <section className="approval-gate"><CheckCircle2 size={44} /><h1>Understanding approved</h1><p>Version {project.approvedVersion} is frozen. Generate the base prompt free—then decide whether the complete build sequence is worth unlocking.</p><button className="button primary" onClick={generate} disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />} Generate my free base prompt</button>{message ? <p className="form-error">{message}</p> : null}</section>;
}

function PromptSequence({ project, entitled, availableLicenses, lockedPromptCount, onReload }: { project: Project; entitled: boolean; availableLicenses: number; lockedPromptCount: number; onReload: () => Promise<void> }): React.ReactNode {
  const set = project.promptSets[0]; const prompts = useMemo(() => [set.content.base, ...set.content.followUps], [set.content.base, set.content.followUps]);
  const [selected, setSelected] = useState(() => firstIncompleteIndex([set.content.base, ...set.content.followUps], set.completedOrders ?? []));
  const [copied, setCopied] = useState<number | "all" | null>(null);
  const [completed, setCompleted] = useState<Set<number>>(() => completedIndexes([set.content.base, ...set.content.followUps], set.completedOrders ?? []));
  const [lineageMessage, setLineageMessage] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const current = prompts[selected];
  const nextIndex = nextIncompleteIndex(prompts, [...completed].map((index) => prompts[index].order), selected);
  const allComplete = completed.size === prompts.length;
  const toggleCompleted = async () => {
    const wasCompleted = completed.has(selected);
    setProgressMessage(null);
    setCompleted((previous) => { const next = new Set(previous); if (wasCompleted) next.delete(selected); else next.add(selected); return next; });
    try {
      const response = await jsonRequest<{ completedOrders: number[] }>(`/api/projects/${project.id}/progress`, { method: "POST", body: JSON.stringify({ promptSetId: set.id, order: current.order, completed: !wasCompleted }) });
      setCompleted(completedIndexes(prompts, response.completedOrders));
    } catch (reason) {
      setCompleted((previous) => { const next = new Set(previous); if (wasCompleted) next.add(selected); else next.delete(selected); return next; });
      setProgressMessage(reason instanceof Error ? reason.message : "Progress could not be saved.");
    }
  };
  const copyText = useCallback(async (text: string, marker: number | "all") => { try { await navigator.clipboard.writeText(text); } catch { const area = document.createElement("textarea"); area.value = text; area.style.position = "fixed"; area.style.opacity = "0"; document.body.append(area); area.select(); document.execCommand("copy"); area.remove(); } setCopied(marker); track("prompt_copied"); window.setTimeout(() => setCopied(null), 1800); }, []);
  const allText = useMemo(() => prompts.map((item) => `# ${String(item.order).padStart(2, "0")} ${item.title}\n\n${item.prompt}\n\nChecks:\n${item.completionChecks.map((check) => `- ${check}`).join("\n")}`).join("\n\n---\n\n"), [prompts]);
  const reopenUnderstanding = async () => { setLineageMessage(null); try { await jsonRequest(`/api/projects/${project.id}/reopen`, { method: "POST" }); await onReload(); } catch (reason) { setLineageMessage(reason instanceof Error ? reason.message : "The understanding could not be reopened."); } };
  return <section className="prompt-shell"><aside className="prompt-nav"><span>BUILD SEQUENCE · {completed.size}/{prompts.length} COMPLETE</span>{prompts.map((item, index) => <button className={selected === index ? "selected" : ""} onClick={() => setSelected(index)} key={item.order}><b>{String(item.order).padStart(2, "0")}</b><div><strong>{item.title}</strong><small>{completed.has(index) ? "Completed" : index === selected ? "Selected" : item.purpose}</small></div>{completed.has(index) ? <Check size={14} /> : <Circle size={14} />}</button>)}{!entitled ? <div className="locked-nav-item"><span>{lockedPromptCount}</span><strong>follow-up prompts locked</strong></div> : null}</aside><div className="prompt-main"><div className="screen-title"><div><h1>{entitled ? "Your build sequence" : "Your free base prompt"}</h1><p>{entitled ? "Follow these prompts in order. Each builds on the previous one." : "Use this prompt now. Unlock only if the product model and first output earn it."}</p></div><div className="screen-actions"><button className="button primary" onClick={() => copyText(current.prompt, selected)}><Copy size={16} />{copied === selected ? "Copied" : "Copy prompt"}</button>{entitled ? <><button className="button secondary" onClick={() => copyText(allText, "all")}><Copy size={16} />{copied === "all" ? "Copied all" : "Copy all"}</button><a className="button secondary" download={`${project.name.replace(/\W+/g, "-").toLowerCase()}-prompts.txt`} href={`data:text/plain;charset=utf-8,${encodeURIComponent(allText)}`}><Download size={16} /> Export</a></> : null}</div></div><article className="prompt-canvas"><header><span>{String(current.order).padStart(2, "0")}</span><h2>{current.title}</h2><button onClick={toggleCompleted}>{completed.has(selected) ? <CheckCircle2 size={17} /> : <Circle size={17} />} {completed.has(selected) ? "Completed" : "Mark complete"}</button></header>{progressMessage ? <p className="lineage-error">{progressMessage}</p> : null}<h3>Outcome</h3><p>{current.purpose}</p><h3>Build instructions</h3><pre>{current.prompt}</pre><h3>Acceptance check</h3><ul>{current.completionChecks.map((check) => <li key={check}><Circle size={13} />{check}</li>)}</ul></article>{entitled && nextIndex !== null ? <button className="next-up" onClick={() => setSelected(nextIndex)}><span>Next up</span><b>{String(prompts[nextIndex].order).padStart(2, "0")}</b><strong>{prompts[nextIndex].title}</strong><ArrowRight size={18} /></button> : null}{entitled && allComplete ? <div className="next-up"><span>Sequence complete</span><b>{String(prompts.length).padStart(2, "0")}</b><strong>Every step checked off</strong><Check size={18} /></div> : null}{!entitled ? <UpgradePanel projectId={project.id} availableLicenses={availableLicenses} lockedPromptCount={lockedPromptCount} onUnlocked={onReload} /> : null}</div><aside className="lineage-rail"><span>UNDERSTANDING LINEAGE</span><div className="lineage-step"><Check size={14} /><div><strong>Source brief</strong><small>Captured</small></div></div><div className="lineage-step"><Check size={14} /><div><strong>Understanding v{project.approvedVersion}</strong><small>Approved</small></div></div><dl><dt>Product</dt><dd>{project.understandings[0]?.content.productName ?? project.name}</dd><dt>Build target</dt><dd>{targets.find((target) => target.value === set.platform)?.label ?? set.platform}</dd><dt>Access</dt><dd>{entitled ? "Project unlocked" : "Base prompt free"}</dd></dl><button className="share-link" onClick={reopenUnderstanding}><RefreshCw size={14} /> Edit understanding</button>{lineageMessage ? <p className="lineage-error">{lineageMessage}</p> : null}<button className="share-link" onClick={() => copyText(window.location.href, "all")}><ExternalLink size={14} /> Copy private link</button><button className="delete-link" onClick={async () => { if (window.confirm("Delete this project and all generated artifacts?")) { await fetch(`/api/projects/${project.id}`, { method: "DELETE" }); window.location.assign("/workspace"); } }}><Trash2 size={14} /> Delete project</button></aside></section>;
}

function UpgradePanel({ projectId, availableLicenses, lockedPromptCount, onUnlocked }: { projectId: string; availableLicenses: number; lockedPromptCount: number; onUnlocked: () => Promise<void> }): React.ReactNode {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null); const [studentCode, setStudentCode] = useState(""); const [showStudentCode, setShowStudentCode] = useState(false);
  async function checkout(pack: 1 | 3 | 10, discountCode?: string) { setBusy(true); setMessage(null); try { track("checkout_started"); const result = await jsonRequest<{ url: string }>("/api/checkout", { method: "POST", body: JSON.stringify({ projectId, pack, discountCode }) }); window.location.assign(result.url); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Checkout could not start."); setBusy(false); } }
  async function redeem() { setBusy(true); setMessage(null); try { await jsonRequest(`/api/projects/${projectId}/unlock`, { method: "POST" }); await onUnlocked(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "The license could not be applied."); } finally { setBusy(false); } }
  return <section className="upgrade-panel"><span className="upgrade-eyebrow">THE REST OF THE BUILD</span><h2>Unlock {lockedPromptCount} mapped follow-up prompts for this project.</h2><p>Architecture, auth, data, primary workflows, polish, QA, and launch—sequenced for your chosen build target.</p>{availableLicenses > 0 ? <button className="button primary wide" onClick={redeem} disabled={busy}>Use 1 of {availableLicenses} available project {availableLicenses === 1 ? "license" : "licenses"}</button> : <div className="license-packs"><button onClick={() => checkout(1)} disabled={busy}><span>1 project</span><strong>$29</strong><small>$29 / project</small></button><button className="best" onClick={() => checkout(3)} disabled={busy}><i>BEST FOR BUILDERS</i><span>3 projects</span><strong>$69</strong><small>$23 / project</small></button><button onClick={() => checkout(10)} disabled={busy}><span>10 projects</span><strong>$179</strong><small>$17.90 / project</small></button></div>}<button className="student-code-toggle" onClick={() => setShowStudentCode((visible) => !visible)}>Have a project code?</button>{showStudentCode ? <form className="student-code-form" onSubmit={(event) => { event.preventDefault(); void checkout(1, studentCode); }}><label htmlFor="student-code">Project code · valid for one project</label><div><input id="student-code" value={studentCode} onChange={(event) => setStudentCode(event.target.value)} autoComplete="off" required placeholder="Enter your code" /><button className="button secondary" disabled={busy || !studentCode.trim()}>{busy ? "Checking" : "Apply code"}</button></div></form> : null}{message ? <p className="form-error">{message}</p> : null}</section>;
}
