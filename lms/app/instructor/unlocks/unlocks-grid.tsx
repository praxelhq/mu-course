"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useGatePoll, type PolledGate } from "@/components/use-gate-poll";

// Client half of the Unlock Console. Optimistic three-state toggles: a click
// applies instantly, POSTs to /api/gates/set, and on failure or a
// server-state mismatch the cell REVERTS VISIBLY — a per-cell conflict badge
// plus a toast naming the server's current state. Never a silent revert.
// A shared 4s poll (all sections) keeps two instructors' consoles in sync.

export type GateState = "locked" | "open" | "closed";
export type ConsoleSection = { id: string; code: string };
export type ConsoleTarget = {
  targetType: "material" | "assignment" | "quiz";
  targetId: string;
  title: string;
};
export type ConsoleSession = {
  id: string;
  sessionNo: number;
  title: string;
  children: ConsoleTarget[];
};

const NEXT_STATE: Record<GateState, GateState> = {
  locked: "open",
  open: "closed",
  closed: "locked",
};

const STATE_COLOR: Record<GateState, string> = {
  locked: "var(--clay)",
  open: "var(--pine)",
  closed: "#8a6a1c", // muted dark amber, matches the grading StatusChip
};

const STATE_LABEL: Record<GateState, string> = {
  locked: "Locked",
  open: "Open",
  closed: "Closed",
};

const mono: CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const keyOf = (sectionId: string, targetType: string, targetId: string) =>
  `${sectionId}|${targetType}|${targetId}`;

type Exception = {
  userId: string;
  email: string;
  name: string;
  expiresAt: string | null;
};

export function UnlocksGrid({
  sections,
  sessions,
  initialGates,
  initialVersion,
}: {
  sections: ConsoleSection[];
  sessions: ConsoleSession[];
  initialGates: PolledGate[];
  initialVersion: string;
}) {
  void initialVersion; // the poll establishes its own baseline on first tick
  // Server truth as last polled/POSTed, overlaid with optimistic edits.
  const [serverGates, setServerGates] = useState<Map<string, GateState>>(
    () => new Map(initialGates.map((g) => [keyOf(g.sectionId, g.targetType, g.targetId), g.state])),
  );
  const [optimistic, setOptimistic] = useState<Map<string, GateState>>(new Map());
  const [conflicts, setConflicts] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [exceptionsFor, setExceptionsFor] = useState<ConsoleTarget | null>(null);
  const pendingRef = useRef<Set<string>>(new Set());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }, []);

  // Poll all sections; merge everything except cells with an in-flight POST.
  const { gates: polled } = useGatePoll({ refreshOnChange: false });
  const polledMap = useMemo(
    () => new Map(polled.map((g) => [keyOf(g.sectionId, g.targetType, g.targetId), g.state])),
    [polled],
  );

  // Precedence: optimistic (in-flight or just-settled) → last poll → initial
  // snapshot. Settled cells keep a short optimistic hold (~5s) so the next
  // poll catches up before the override clears — no flicker-back.
  const stateOf = useCallback(
    (sectionId: string, targetType: string, targetId: string): GateState => {
      const key = keyOf(sectionId, targetType, targetId);
      return optimistic.get(key) ?? polledMap.get(key) ?? serverGates.get(key) ?? "locked";
    },
    [optimistic, polledMap, serverGates],
  );

  const settle = useCallback((key: string, state: GateState) => {
    pendingRef.current.delete(key);
    setOptimistic((m) => new Map(m).set(key, state));
    setServerGates((m) => new Map(m).set(key, state));
    setTimeout(() => {
      if (pendingRef.current.has(key)) return; // a newer toggle owns the cell
      setOptimistic((m) => {
        const next = new Map(m);
        next.delete(key);
        return next;
      });
    }, 5000);
  }, []);

  const toggle = useCallback(
    async (
      sectionId: string,
      sectionCode: string,
      targetType: "session" | "material" | "assignment" | "quiz",
      targetId: string,
      label: string,
    ) => {
      const key = keyOf(sectionId, targetType, targetId);
      if (pendingRef.current.has(key)) return;
      const current = stateOf(sectionId, targetType, targetId);
      const desired = NEXT_STATE[current];

      // Optimistic: apply instantly.
      pendingRef.current.add(key);
      setOptimistic((m) => new Map(m).set(key, desired));
      setConflicts((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      });

      const send = (confirmed: boolean) =>
        fetch("/api/gates/set", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ targetType, targetId, sectionId, state: desired, confirmed }),
        });

      try {
        let res = await send(false);
        let body = res.ok ? await res.json() : null;
        if (body?.needsConfirm) {
          const go = window.confirm(
            `Section ${sectionCode}: ${body.draftCount} draft submission${body.draftCount === 1 ? "" : "s"} pending on "${label}". Close it anyway?`,
          );
          if (!go) {
            settle(key, current); // user cancelled — back to what it was
            return;
          }
          res = await send(true);
          body = res.ok ? await res.json() : null;
        }
        if (!res.ok || !body?.ok) {
          settle(key, current);
          setConflicts((s) => new Set(s).add(key));
          showToast(
            `Could not set ${label} (Sec ${sectionCode}) to ${STATE_LABEL[desired].toLowerCase()} — server says ${res.status === 200 ? "rejected" : `HTTP ${res.status}`}. Cell reverted to ${STATE_LABEL[current].toLowerCase()}.`,
          );
          return;
        }
        if (body.state !== desired) {
          // Server chose a different state (concurrent flip) — surface it.
          settle(key, body.state as GateState);
          setConflicts((s) => new Set(s).add(key));
          showToast(
            `${label} (Sec ${sectionCode}) is now ${STATE_LABEL[body.state as GateState].toLowerCase()} on the server — another change won.`,
          );
          return;
        }
        settle(key, desired);
      } catch {
        settle(key, current);
        setConflicts((s) => new Set(s).add(key));
        showToast(
          `Network error setting ${label} (Sec ${sectionCode}); cell reverted to ${STATE_LABEL[current].toLowerCase()}.`,
        );
      }
    },
    [settle, showToast, stateOf],
  );

  const bulk = useCallback(
    async (session: ConsoleSession, sectionId: string, sectionCode: string, action: "open-session" | "close-session") => {
      const desired: GateState = action === "open-session" ? "open" : "closed";
      const keys = [
        keyOf(sectionId, "session", session.id),
        ...session.children.map((c) => keyOf(sectionId, c.targetType, c.targetId)),
      ];
      const previous = new Map(
        keys.map((k) => [k, serverGates.get(k) ?? "locked"] as const),
      );
      for (const k of keys) pendingRef.current.add(k);
      setOptimistic((m) => {
        const next = new Map(m);
        for (const k of keys) next.set(k, desired);
        return next;
      });

      const send = (confirmed: boolean) =>
        fetch("/api/gates/set", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ bulk: action, sessionPageId: session.id, sectionId, confirmed }),
        });

      const revertAll = () => {
        for (const k of keys) settle(k, previous.get(k) ?? "locked");
        setConflicts((s) => {
          const next = new Set(s);
          for (const k of keys) next.add(k);
          return next;
        });
      };

      try {
        let res = await send(false);
        let body = res.ok ? await res.json() : null;
        if (body?.needsConfirm) {
          const go = window.confirm(
            `Section ${sectionCode}: ${body.draftCount} draft submission${body.draftCount === 1 ? "" : "s"} pending in Session ${session.sessionNo}. Close everything anyway?`,
          );
          if (!go) {
            for (const k of keys) settle(k, previous.get(k) ?? "locked");
            return;
          }
          res = await send(true);
          body = res.ok ? await res.json() : null;
        }
        if (!res.ok || !body?.ok) {
          revertAll();
          showToast(
            `Bulk ${action === "open-session" ? "open" : "close"} of Session ${session.sessionNo} (Sec ${sectionCode}) failed — cells reverted.`,
          );
          return;
        }
        for (const k of keys) settle(k, desired);
      } catch {
        revertAll();
        showToast(
          `Network error on bulk ${action === "open-session" ? "open" : "close"} of Session ${session.sessionNo} (Sec ${sectionCode}) — cells reverted.`,
        );
      }
    },
    [serverGates, settle, showToast],
  );

  const cellButton = (
    session: ConsoleSession,
    sectionId: string,
    sectionCode: string,
    targetType: "session" | "material" | "assignment" | "quiz",
    targetId: string,
    label: string,
  ) => {
    const key = keyOf(sectionId, targetType, targetId);
    const state = stateOf(sectionId, targetType, targetId);
    const conflict = conflicts.has(key);
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
        <button
          type="button"
          onClick={() => void toggle(sectionId, sectionCode, targetType, targetId, label)}
          aria-label={`${label}, section ${sectionCode}: ${STATE_LABEL[state]}. Click to set ${STATE_LABEL[NEXT_STATE[state]].toLowerCase()}.`}
          style={{
            ...mono,
            fontSize: "0.625rem",
            color: STATE_COLOR[state],
            border: `1px solid ${STATE_COLOR[state]}`,
            background: state === "open" ? "rgba(30,58,53,0.06)" : "transparent",
            padding: "0.2rem 0.4rem",
            cursor: "pointer",
            minWidth: "3.6rem",
          }}
        >
          {STATE_LABEL[state]}
        </button>
        {conflict && (
          <span
            title="This cell was reverted — the server state won."
            style={{ ...mono, fontSize: "0.625rem", color: "var(--ochre)", fontWeight: 700 }}
          >
            !
          </span>
        )}
      </span>
    );
  };

  const th: CSSProperties = {
    ...mono,
    fontSize: "0.6875rem",
    color: "var(--charcoal)",
    borderBottom: "1px solid var(--sand)",
    padding: "0.5rem 0.5rem",
    background: "var(--parchment)",
    position: "sticky",
    top: 0,
    zIndex: 2,
    textAlign: "center",
  };
  const labelCell: CSSProperties = {
    position: "sticky",
    left: 0,
    background: "var(--parchment)",
    zIndex: 1,
    borderBottom: "1px solid var(--sand)",
    padding: "0.5rem 0.75rem",
    textAlign: "left",
    minWidth: "16rem",
    maxWidth: "20rem",
  };
  const dataCell: CSSProperties = {
    borderBottom: "1px solid var(--sand)",
    padding: "0.4rem 0.5rem",
    textAlign: "center",
    whiteSpace: "nowrap",
  };

  return (
    <div>
      <div style={{ overflow: "auto", maxHeight: "70vh", border: "1px solid var(--sand)" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%" }}>
          <thead>
            <tr>
              <th style={{ ...th, ...labelCell, top: 0, zIndex: 3 }}>Session / item</th>
              {sections.map((s) => (
                <th key={s.id} style={th}>
                  Sec {s.code}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => {
              const isOpen = expanded.has(session.id);
              return [
                <tr key={session.id}>
                  <td style={labelCell}>
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((s) => {
                          const next = new Set(s);
                          if (next.has(session.id)) next.delete(session.id);
                          else next.add(session.id);
                          return next;
                        })
                      }
                      aria-expanded={isOpen}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        font: "inherit",
                        color: "var(--ink)",
                        display: "flex",
                        gap: "0.5rem",
                        alignItems: "baseline",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ ...mono, fontSize: "0.625rem", color: "var(--clay)" }}>
                        {isOpen ? "−" : "+"} S{session.sessionNo}
                      </span>
                      <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{session.title}</span>
                    </button>
                  </td>
                  {sections.map((sec) => (
                    <td key={sec.id} style={dataCell}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", alignItems: "center" }}>
                        {cellButton(session, sec.id, sec.code, "session", session.id, `Session ${session.sessionNo}`)}
                        <span style={{ display: "inline-flex", gap: "0.25rem" }}>
                          <button
                            type="button"
                            onClick={() => void bulk(session, sec.id, sec.code, "open-session")}
                            title={`Open Session ${session.sessionNo} + all children for Sec ${sec.code}`}
                            style={{ ...mono, fontSize: "0.5625rem", color: "var(--pine)", border: "1px solid var(--sand)", background: "transparent", padding: "0.1rem 0.3rem", cursor: "pointer" }}
                          >
                            + all
                          </button>
                          <button
                            type="button"
                            onClick={() => void bulk(session, sec.id, sec.code, "close-session")}
                            title={`Close Session ${session.sessionNo} + all children for Sec ${sec.code}`}
                            style={{ ...mono, fontSize: "0.5625rem", color: "#8a6a1c", border: "1px solid var(--sand)", background: "transparent", padding: "0.1rem 0.3rem", cursor: "pointer" }}
                          >
                            − all
                          </button>
                        </span>
                      </div>
                    </td>
                  ))}
                </tr>,
                ...(isOpen
                  ? session.children.map((child) => (
                      <tr key={`${session.id}:${child.targetId}`}>
                        <td style={{ ...labelCell, paddingLeft: "2.25rem" }}>
                          <span style={{ display: "flex", gap: "0.5rem", alignItems: "baseline" }}>
                            <span style={{ ...mono, fontSize: "0.5625rem", color: "var(--clay)" }}>
                              {child.targetType}
                            </span>
                            <span style={{ fontSize: "0.8125rem", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {child.title}
                            </span>
                            {child.targetType === "assignment" && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExceptionsFor((cur) =>
                                    cur?.targetId === child.targetId ? null : child,
                                  )
                                }
                                title="Per-student reopen exceptions"
                                style={{ ...mono, fontSize: "0.5625rem", color: "var(--charcoal)", border: "1px solid var(--sand)", background: "transparent", padding: "0.1rem 0.3rem", cursor: "pointer" }}
                              >
                                exceptions
                              </button>
                            )}
                          </span>
                        </td>
                        {sections.map((sec) => (
                          <td key={sec.id} style={dataCell}>
                            {cellButton(session, sec.id, sec.code, child.targetType, child.targetId, child.title)}
                          </td>
                        ))}
                      </tr>
                    ))
                  : []),
              ];
            })}
          </tbody>
        </table>
      </div>

      {exceptionsFor && (
        <ExceptionsPanel
          key={exceptionsFor.targetId} // remount per target — fresh list, fresh form
          target={exceptionsFor}
          onToast={showToast}
          onClose={() => setExceptionsFor(null)}
        />
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: "1.5rem",
            right: "1.5rem",
            maxWidth: "24rem",
            background: "var(--ink)",
            color: "var(--cream)",
            padding: "0.75rem 1rem",
            fontSize: "0.8125rem",
            lineHeight: 1.5,
            zIndex: 10,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

// Per-student reopen: minimal but working. Grant by email, optional expiry;
// list + revoke below. Exceptions make the assignment available to that one
// student even while its gate (or session) is closed.
function ExceptionsPanel({
  target,
  onToast,
  onClose,
}: {
  target: ConsoleTarget;
  onToast: (msg: string) => void;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [list, setList] = useState<Exception[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/gates/exception?targetType=${target.targetType}&targetId=${target.targetId}`,
      { cache: "no-store" },
    );
    if (res.ok) setList((await res.json()).exceptions);
  }, [target]);

  // Initial load (the component remounts per target via its key prop).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(
        `/api/gates/exception?targetType=${target.targetType}&targetId=${target.targetId}`,
        { cache: "no-store" },
      );
      if (res.ok && !cancelled) setList((await res.json()).exceptions);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [target]);

  async function grant() {
    if (!email) return;
    setBusy(true);
    try {
      const res = await fetch("/api/gates/exception", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetType: target.targetType,
          targetId: target.targetId,
          email,
          ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        onToast(body.error ?? "Could not grant the exception.");
      } else {
        onToast(`Reopened "${target.title}" for ${body.email}.`);
        setEmail("");
        setExpiresAt("");
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke(userId: string, who: string) {
    await fetch(
      `/api/gates/exception?targetType=${target.targetType}&targetId=${target.targetId}&userId=${userId}`,
      { method: "DELETE" },
    );
    onToast(`Revoked the exception for ${who}.`);
    await load();
  }

  const input: CSSProperties = {
    fontFamily: "var(--font-geist-sans)",
    fontSize: "0.875rem",
    border: "1px solid var(--sand)",
    background: "var(--parchment)",
    padding: "0.4rem 0.6rem",
  };

  return (
    <section style={{ border: "1px solid var(--sand)", padding: "1rem 1.25rem", marginTop: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.75rem" }}>
          Per-student exceptions · {target.title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          style={{ ...mono, fontSize: "0.625rem", border: "1px solid var(--sand)", background: "transparent", padding: "0.15rem 0.4rem", cursor: "pointer", color: "var(--charcoal)" }}
        >
          close
        </button>
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="email"
          placeholder="student email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ ...input, minWidth: "18rem" }}
          aria-label="Student email"
        />
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          style={input}
          aria-label="Expires at (optional)"
        />
        <button
          type="button"
          disabled={busy || !email}
          onClick={() => void grant()}
          style={{
            ...mono,
            fontSize: "0.6875rem",
            background: busy || !email ? "var(--clay)" : "var(--pine)",
            color: "var(--cream)",
            border: "1px solid var(--pine)",
            padding: "0.45rem 0.9rem",
            cursor: busy || !email ? "default" : "pointer",
          }}
        >
          Grant reopen
        </button>
      </div>
      <ul style={{ listStyle: "none", margin: "0.75rem 0 0", padding: 0 }}>
        {list === null && <li style={{ color: "var(--clay)", fontSize: "0.8125rem" }}>Loading…</li>}
        {list?.length === 0 && (
          <li style={{ color: "var(--clay)", fontSize: "0.8125rem" }}>No exceptions.</li>
        )}
        {list?.map((e) => (
          <li
            key={e.userId}
            style={{ display: "flex", gap: "0.75rem", alignItems: "baseline", padding: "0.25rem 0", fontSize: "0.8125rem" }}
          >
            <span>{e.name}</span>
            <span style={{ color: "var(--charcoal)" }}>{e.email}</span>
            <span style={{ color: "var(--clay)" }}>
              {e.expiresAt ? `until ${new Date(e.expiresAt).toLocaleString()}` : "no expiry"}
            </span>
            <button
              type="button"
              onClick={() => void revoke(e.userId, e.email)}
              style={{ ...mono, fontSize: "0.5625rem", color: "var(--ochre)", border: "1px solid var(--sand)", background: "transparent", padding: "0.1rem 0.35rem", cursor: "pointer" }}
            >
              revoke
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
