"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadIdentity, useBoard, useRoomPhase, type Identity } from "@/lib/store";
import { PHASE, phaseReached, needsTheRoom, nextPhase, type PhaseId } from "@/lib/phases";
import { Shell, Page } from "./shell";
import { Offer } from "./offer";
import { Problems } from "./problems";
import { Brain } from "./brain";
import { Plan } from "./plan";
import { Constraint, Fault } from "./events";
import { Memo, Close } from "./finish";
import { Ballot } from "./ballot";
import { Rescue } from "./rescue";
import { Card, Eyebrow } from "@/components/ui";

export function Game() {
  const router = useRouter();
  const [identity, setIdentity] = useState<Identity | null>(null);

  useEffect(() => {
    const id = loadIdentity();
    if (!id) router.replace("/");
    else setIdentity(id);
  }, [router]);

  if (!identity) return null;
  return <Playing identity={identity} />;
}

function Playing({ identity }: { identity: Identity }) {
  const { phase, pacing, connected } = useRoomPhase(identity.sectionCode);

  // Where this student actually is — theirs, not the room's. The facilitator's
  // phase is a ceiling in a guided room and nothing at all in an open one; it
  // is never a position students get dragged to.
  const [here, setHere] = useState<PhaseId>("offer");
  const { board, update, saveState } = useBoard(identity, here);

  const free = !connected || pacing === "open";
  const allowed = (p: PhaseId) => free || phaseReached(phase, p);

  // The one thing the facilitator can genuinely compel: the stages that only
  // work with everyone at the same beat. Somebody is speaking, or a ballot is
  // closing, and reading ahead would spoil a reveal for the person next to you.
  useEffect(() => {
    if (needsTheRoom(phase)) setHere(phase);
  }, [phase]);

  // Otherwise a moved gate is an offer, not a shove.
  const [dismissed, setDismissed] = useState<PhaseId | null>(null);
  const lastPhase = useRef(phase);
  useEffect(() => {
    if (lastPhase.current !== phase) {
      lastPhase.current = phase;
      setDismissed(null);
    }
  }, [phase]);

  const behind = !free && !needsTheRoom(phase) && phase !== here && phaseReached(phase, here) && dismissed !== phase;
  const active = allowed(here) ? here : phase;

  return (
    <Shell board={board} phase={active} saveState={saveState} connected={connected}>
      {behind && (
        <MovedOn
          to={phase}
          onGo={() => { setHere(phase); setDismissed(null); }}
          onStay={() => setDismissed(phase)}
        />
      )}

      {active === "arrival" && <Waiting />}
      {active === "offer" && <Offer onStart={() => setHere("walk")} />}
      {(active === "walk" || active === "decide") && <Problems board={board} update={update} />}
      {active === "brain" && <Brain board={board} update={update} />}
      {active === "plan" && <Plan board={board} />}
      {active === "constraint" && <Constraint board={board} update={update} />}
      {active === "fault" && <Fault board={board} update={update} />}
      {active === "review" && <Rescue board={board} />}
      {active === "memo" && <Memo board={board} update={update} />}
      {(active === "pitch" || active === "vote") && <Ballot identity={identity} phase={active} />}
      {active === "debrief" && <LookUp phase={active} />}
      {(active === "close" || active === "done") && <Close board={board} update={update} />}

      <Move here={active} allowed={allowed} free={free} onPick={setHere} />
    </Shell>
  );
}

function MovedOn({ to, onGo, onStay }: { to: PhaseId; onGo: () => void; onStay: () => void }) {
  const p = PHASE.get(to);
  return (
    <div className="rise" style={{
      background: "var(--gold-soft)", borderBottom: "1px solid var(--line-strong)",
      padding: "12px clamp(16px, 3vw, 32px)", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
    }}>
      <span style={{ fontSize: 14.5, color: "var(--gold-ink)", flexGrow: 1, minWidth: 240 }}>
        The room has moved on to <strong>{p?.title.toLowerCase()}</strong>. Finish what you are doing first — nothing is lost.
      </span>
      <button onClick={onGo} className="lift" style={{
        background: "var(--gold-ink)", color: "#fff6ec", borderRadius: "var(--r-md)",
        padding: "9px 16px", fontSize: 14, fontWeight: 700, minHeight: 40,
      }}>Go there now</button>
      <button onClick={onStay} style={{ fontSize: 13.5, color: "var(--gold-ink)", minHeight: 40 }}>Stay here</button>
    </div>
  );
}

function Waiting() {
  return (
    <Page>
      <Card style={{ textAlign: "center", padding: 48 }}>
        <Eyebrow>You are in</Eyebrow>
        <h1 className="serif" style={{ fontSize: 34, lineHeight: 1.1, margin: "12px 0 10px" }}>Wait for the room.</h1>
        <p style={{ fontSize: 16, color: "var(--ink-3)" }}>Nothing to do yet. Look up.</p>
      </Card>
    </Page>
  );
}

function LookUp({ phase }: { phase: PhaseId }) {
  const p = PHASE.get(phase);
  return (
    <Page>
      <Card style={{ textAlign: "center", padding: 56 }}>
        <Eyebrow>{p?.title}</Eyebrow>
        <h1 className="serif" style={{ fontSize: 40, lineHeight: 1.08, margin: "14px 0 12px" }}>Look up.</h1>
        <p style={{ fontSize: 17, lineHeight: 1.6, color: "var(--ink-3)", maxWidth: 480, margin: "0 auto" }}>
          The wall is showing what the whole room decided. Yours is in there.
        </p>
      </Card>
    </Page>
  );
}

/// Move at your own speed. In a guided room this stops at the facilitator's
/// gate; in an open one it does not stop at all.
function Move({ here, allowed, free, onPick }: {
  here: PhaseId; allowed: (p: PhaseId) => boolean; free: boolean; onPick: (p: PhaseId) => void;
}) {
  const options: PhaseId[] = ["walk", "brain", "plan", "constraint", "fault", "review", "memo", "close"];
  const open = options.filter(allowed);
  if (open.length < 2) return null;
  const next = nextPhase(here);
  const canGoOn = next && allowed(next);

  return (
    <div style={{
      position: "sticky", bottom: 0, background: "rgba(253,249,242,.94)", borderTop: "1px solid var(--line)",
      padding: "10px clamp(16px, 3vw, 32px)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
      backdropFilter: "blur(8px)", zIndex: 20,
    }}>
      <span style={{ fontSize: 12.5, color: "var(--ink-4)", marginRight: 4 }}>
        {free ? "Your pace" : "Open to you"}
      </span>
      {open.map((o) => (
        <button key={o} onClick={() => onPick(o)} style={{
          fontSize: 13, fontWeight: 600, padding: "8px 13px", borderRadius: 999, minHeight: 38,
          background: here === o ? "var(--ink)" : "var(--paper-sunk)",
          color: here === o ? "var(--paper)" : "var(--ink-3)",
        }}>
          {PHASE.get(o)?.short}
        </button>
      ))}
      {canGoOn && (
        <button onClick={() => onPick(next)} className="lift" style={{
          marginLeft: "auto", fontSize: 13.5, fontWeight: 700, padding: "9px 16px", borderRadius: "var(--r-md)",
          minHeight: 40, background: "var(--human)", color: "#fff6ec",
        }}>
          Next: {PHASE.get(next)?.short} →
        </button>
      )}
    </div>
  );
}
