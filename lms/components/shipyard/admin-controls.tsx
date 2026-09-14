"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

// The admin bench's live controls. Every one of them follows the same shape as
// the faculty actions: say what will happen, take a confirm where the thing is
// irreversible or expensive, and show the server's own sentence when it
// refuses. Nothing here is optimistic — the page re-reads itself after a write,
// because the numbers on this screen are the reason to trust the write.

type Json = Record<string, unknown>;

async function post(
  url: string,
  body?: Json,
): Promise<{ ok: boolean; status: number; data: Json | null }> {
  const res = await fetch(url, {
    method: "POST",
    ...(body
      ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
  const data = (await res.json().catch(() => null)) as Json | null;
  return { ok: res.ok, status: res.status, data };
}

function errorOf(data: Json | null, status: number): string {
  const e = data?.error;
  return typeof e === "string" ? e : `That did not go through (${status}).`;
}

// ---------------------------------------------------------------------------
// Routing profile, and the kill-switch
// ---------------------------------------------------------------------------

export function RouterControls({
  activeProfile,
  killSwitchActive,
  consecutiveByokFailures,
  threshold,
}: {
  activeProfile: string;
  killSwitchActive: boolean;
  consecutiveByokFailures: number;
  threshold: number;
}) {
  const id = useId();
  const router = useRouter();
  const [profile, setProfile] = useState(activeProfile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);

  async function setTo(next: string) {
    if (busy || next === profile) return;
    setBusy(true);
    setError(null);
    setDone(null);
    const prev = profile;
    setProfile(next);
    const { ok, status, data } = await post("/api/shipyard/admin/router", { profile: next });
    setBusy(false);
    if (!ok) {
      setProfile(prev);
      setError(errorOf(data, status));
      return;
    }
    setDone(`Every new call routes on ${next}.`);
    router.refresh();
  }

  async function reset() {
    setBusy(true);
    setError(null);
    setDone(null);
    const { ok, status, data } = await post("/api/shipyard/admin/router", {
      resetKillSwitch: true,
    });
    setBusy(false);
    setArmed(false);
    if (!ok) {
      setError(errorOf(data, status));
      return;
    }
    setProfile("flash-verdicts");
    setDone("Kill-switch reset. Haiku is back on pre-flight and escalations.");
    router.refresh();
  }

  return (
    <div className="sy-panel">
      <h3 className="sy-panel__head">Routing profile</h3>
      <p className="sy-panel__note">
        {consecutiveByokFailures} consecutive BYOK{" "}
        {consecutiveByokFailures === 1 ? "failure" : "failures"} · the switch flips at{" "}
        {threshold}.
      </p>

      <fieldset className="sy-radios">
        <legend className="sy-visually-hidden">Routing profile</legend>
        {[
          ["flash-verdicts", "flash_verdicts", "Haiku pre-flight and escalations, Flash verdicts"],
          ["flash-everywhere", "flash_everywhere", "Flash on every task, both slots"],
        ].map(([value, label, note]) => (
          <label className="sy-radio sy-radio--block" key={value}>
            <input
              type="radio"
              name={`${id}-profile`}
              value={value}
              checked={profile === value}
              disabled={busy || killSwitchActive}
              onChange={() => setTo(value)}
            />
            <span>
              <b className="sy-mono">{label}</b>
              <span className="sy-radio__note">{note}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {killSwitchActive && (
        <p className="sy-panel__note">
          The kill-switch holds the profile at <span className="sy-mono">flash_everywhere</span>.
          Reset it before choosing.
        </p>
      )}

      {error && (
        <p className="sy-field__error" role="alert">
          {error}
        </p>
      )}
      {done && <p className="sy-action__done">{done}</p>}

      {killSwitchActive && (
        <div className="sy-actions">
          {!armed ? (
            <button
              type="button"
              className="sy-btn sy-btn--quiet"
              disabled={busy}
              onClick={() => setArmed(true)}
            >
              Reset kill-switch
            </button>
          ) : (
            <>
              <button type="button" className="sy-btn" disabled={busy} onClick={reset}>
                {busy ? "Resetting" : "Yes, try Haiku again"}
              </button>
              <button
                type="button"
                className="sy-btn sy-btn--quiet"
                disabled={busy}
                onClick={() => setArmed(false)}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function SimulateByokFailures() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState(false);

  async function run() {
    setBusy(true);
    setMessage(null);
    setProblem(false);
    const { ok, status, data } = await post(
      "/api/shipyard/admin/router/simulate-byok-failures",
    );
    setBusy(false);
    if (!ok) {
      setProblem(true);
      setMessage(errorOf(data, status));
      return;
    }
    setMessage(
      data?.flipped === true
        ? "Five failures in. The switch flipped to flash_everywhere and wrote an audit row."
        : "Five failures fed through. The switch was already thrown.",
    );
    router.refresh();
  }

  return (
    <div className="sy-panel sy-panel--demo">
      <h3 className="sy-panel__head">Simulate five BYOK failures</h3>
      <p className="sy-panel__note">
        Feeds five credit-or-auth errors through the real reducer, the same one the
        gateway uses. Demo builds only.
      </p>
      <div className="sy-actions">
        <button type="button" className="sy-btn sy-btn--quiet" disabled={busy} onClick={run}>
          {busy ? "Failing" : "Run it"}
        </button>
      </div>
      {message && (
        <p className={problem ? "sy-field__error" : "sy-action__done"} role="status">
          {message}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

const COMPONENTS = [
  ["productQuality", "Product quality"],
  ["realNumbers", "Real numbers"],
  ["workflow", "Workflow"],
  ["distribution", "Distribution and launch"],
] as const;

export function WeightsForm({ current }: { current: Record<string, number> }) {
  const id = useId();
  const router = useRouter();
  const [version, setVersion] = useState("");
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(COMPONENTS.map(([k]) => [k, String(current[k] ?? 0)])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const numbers = COMPONENTS.map(([k]) => Number(values[k]));
  const allNumbers = numbers.every((n) => Number.isFinite(n) && n >= 0);
  const sum = allNumbers ? numbers.reduce((a, b) => a + b, 0) : NaN;
  const sums = allNumbers && Math.abs(sum - 100) < 1e-6;
  const ready = version.trim().length > 0 && sums;

  async function send() {
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    setDone(null);
    const { ok, status, data } = await post("/api/shipyard/admin/weights", {
      version: version.trim(),
      weights: Object.fromEntries(COMPONENTS.map(([k], i) => [k, numbers[i]])),
    });
    setBusy(false);
    if (!ok) {
      setError(errorOf(data, status));
      return;
    }
    const r = data?.recompute as { computed?: number; skipped?: number; failed?: number } | undefined;
    setDone(
      `${version.trim()} is active. ${r?.computed ?? 0} grades recomputed, ${r?.skipped ?? 0} finalised ones left alone${r?.failed ? `, ${r.failed} failed` : ""}.`,
    );
    setVersion("");
    router.refresh();
  }

  return (
    <div className="sy-panel">
      <h3 className="sy-panel__head">New version</h3>
      <p className="sy-panel__note">
        Weights are history, not a setting: a new label supersedes the old one and
        every provisional grade is recomputed on it. Finalised grades do not move.
      </p>

      <div className="sy-weights__grid">
        {COMPONENTS.map(([key, label]) => (
          <div className="sy-field" key={key}>
            <label className="sy-field__label" htmlFor={`${id}-${key}`}>
              {label}
            </label>
            <input
              id={`${id}-${key}`}
              className="sy-input"
              type="number"
              min={0}
              max={100}
              step="0.01"
              inputMode="decimal"
              value={values[key]}
              disabled={busy}
              onChange={(e) => {
                setValues((v) => ({ ...v, [key]: e.target.value }));
                setError(null);
              }}
            />
          </div>
        ))}
      </div>

      <p className={sums ? "sy-weights__sum sy-weights__sum--ok" : "sy-weights__sum"}>
        <span className="sy-eyebrow">Adds up to</span>{" "}
        <span className="sy-mono">{allNumbers ? sum.toFixed(2).replace(/\.00$/, "") : "—"}</span>
        {!sums && <span className="sy-weights__must"> · must be 100</span>}
      </p>

      <div className="sy-field">
        <label className="sy-field__label" htmlFor={`${id}-v`}>
          Version label
        </label>
        <input
          id={`${id}-v`}
          className="sy-input"
          value={version}
          placeholder="v2"
          maxLength={40}
          disabled={busy}
          onChange={(e) => {
            setVersion(e.target.value);
            setError(null);
          }}
        />
      </div>

      {error && (
        <p className="sy-field__error" role="alert">
          {error}
        </p>
      )}
      {done && <p className="sy-action__done">{done}</p>}

      <div className="sy-actions">
        <button type="button" className="sy-btn" disabled={busy || !ready} onClick={send}>
          {busy ? "Activating" : "Activate these weights"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grades: recompute and finalise
// ---------------------------------------------------------------------------

type SectionRef = { id: string; code: string };

export function RecomputeGrades({ sections }: { sections: SectionRef[] }) {
  const id = useId();
  const router = useRouter();
  const [scope, setScope] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setDone(null);
    const { ok, status, data } = await post("/api/shipyard/admin/grades/recompute", {
      ...(scope === "all" ? { all: true } : { sectionId: scope }),
    });
    setBusy(false);
    if (!ok) {
      setError(errorOf(data, status));
      return;
    }
    const s = data?.summary as { computed?: number; skipped?: number; failed?: number } | undefined;
    setDone(
      `${data?.products ?? 0} products · ${s?.computed ?? 0} recomputed, ${s?.skipped ?? 0} finalised ones left alone${s?.failed ? `, ${s.failed} failed` : ""}.`,
    );
    router.refresh();
  }

  return (
    <div className="sy-panel">
      <h3 className="sy-panel__head">Recompute</h3>
      <p className="sy-panel__note">
        Rebuilds every provisional grade from the current reviews, tracker signals
        and active weights. Finalised grades are never touched.
      </p>
      <div className="sy-action__row">
        <label className="sy-visually-hidden" htmlFor={`${id}-scope`}>
          Scope
        </label>
        <select
          id={`${id}-scope`}
          className="sy-input sy-select"
          value={scope}
          disabled={busy}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="all">Every section</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              Section {s.code}
            </option>
          ))}
        </select>
        <button type="button" className="sy-btn sy-btn--quiet" disabled={busy} onClick={run}>
          {busy ? "Recomputing" : "Recompute"}
        </button>
      </div>
      {error && (
        <p className="sy-field__error" role="alert">
          {error}
        </p>
      )}
      {done && <p className="sy-action__done">{done}</p>}
    </div>
  );
}

export function FinaliseSection({ sections }: { sections: SectionRef[] }) {
  const id = useId();
  const router = useRouter();
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [force, setForce] = useState(false);
  const [armed, setArmed] = useState(false);
  const [forceArmed, setForceArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const ready = sectionId !== "" && reason.trim().length >= 8;
  // `force` finalises students who have not graduated, so it needs its own
  // confirm on top of the ordinary one — two deliberate clicks, not one.
  const confirmed = armed && (!force || forceArmed);

  async function send() {
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    setDone(null);
    const { ok, status, data } = await post("/api/shipyard/admin/grades/finalise", {
      sectionId,
      reason: reason.trim(),
      ...(force ? { force: true } : {}),
    });
    setBusy(false);
    setArmed(false);
    setForceArmed(false);
    if (!ok) {
      setError(errorOf(data, status));
      return;
    }
    const finalised = (data?.finalised as unknown[] | undefined)?.length ?? 0;
    const refused = (data?.refused as { reason: string }[] | undefined) ?? [];
    const notGraduated = refused.filter((r) => r.reason === "not-graduated").length;
    const noGrade = refused.length - notGraduated;
    setDone(
      `${finalised} finalised · ${refused.length} refused` +
        (refused.length > 0
          ? ` (${notGraduated} not graduated, ${noGrade} with no grade yet)`
          : "") +
        ".",
    );
    setReason("");
    router.refresh();
  }

  if (sections.length === 0) return null;

  return (
    <div className="sy-panel">
      <h3 className="sy-panel__head">Finalise a section</h3>
      <p className="sy-panel__note">
        Stops the numbers moving and drops the word provisional from every
        student&rsquo;s grade line. Audit-logged with your reason.
      </p>

      <div className="sy-action__row">
        <label className="sy-visually-hidden" htmlFor={`${id}-sec`}>
          Section
        </label>
        <select
          id={`${id}-sec`}
          className="sy-input sy-select"
          value={sectionId}
          disabled={busy}
          onChange={(e) => {
            setSectionId(e.target.value);
            setArmed(false);
          }}
        >
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              Section {s.code}
            </option>
          ))}
        </select>
      </div>

      <label className="sy-field__label" htmlFor={`${id}-why`}>
        Why <span className="sy-field__req"> · at least eight characters</span>
      </label>
      <textarea
        id={`${id}-why`}
        className="sy-textarea sy-textarea--short"
        value={reason}
        maxLength={500}
        placeholder="Marks agreed in the 15 Sep moderation meeting."
        disabled={busy}
        onChange={(e) => {
          setReason(e.target.value);
          setError(null);
          setArmed(false);
        }}
      />

      <label className="sy-check">
        <input
          type="checkbox"
          checked={force}
          disabled={busy}
          onChange={(e) => {
            setForce(e.target.checked);
            setForceArmed(false);
            setArmed(false);
          }}
        />
        Finalise students who have not cleared all six checkpoints
      </label>

      {force && armed && !forceArmed && (
        <div className="sy-panel__warn">
          <p>
            That finalises students who have not graduated. SPEC §7 makes clearing
            all six a condition of passing the course.
          </p>
          <div className="sy-actions">
            <button
              type="button"
              className="sy-btn sy-btn--quiet"
              disabled={busy}
              onClick={() => setForceArmed(true)}
            >
              I mean it
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="sy-field__error" role="alert">
          {error}
        </p>
      )}
      {done && <p className="sy-action__done">{done}</p>}

      <div className="sy-actions">
        {!confirmed ? (
          <button
            type="button"
            className="sy-btn sy-btn--quiet"
            disabled={!ready || busy}
            onClick={() => setArmed(true)}
          >
            Finalise section
          </button>
        ) : (
          <>
            <button type="button" className="sy-btn" disabled={busy || !ready} onClick={send}>
              {busy ? "Finalising" : "Yes, finalise them"}
            </button>
            <button
              type="button"
              className="sy-btn sy-btn--quiet"
              disabled={busy}
              onClick={() => {
                setArmed(false);
                setForceArmed(false);
              }}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
