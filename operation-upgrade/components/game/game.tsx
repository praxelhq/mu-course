"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadIdentity, useBoard, useRoomPhase, type Identity } from "@/lib/store";
import { PHASE, phaseReached, type PhaseId } from "@/lib/phases";
import { Shell, Page } from "./shell";
import { Offer } from "./offer";
import { Problems } from "./problems";
import { Brain } from "./brain";
import { Plan } from "./plan";
import { Constraint, Fault } from "./events";
import { Memo, Close } from "./finish";
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
  const { board, update, saveState } = useBoard(identity);
  const { phase, connected } = useRoomPhase(identity.sectionCode);
  // Students can always revisit anything the room has already reached — a slow
  // player is never locked out of a stage that has moved on. And when the
  // classroom server is unreachable, the facilitator's gate cannot apply at
  // all, so the student drives themselves rather than being stranded.
  const [viewing, setViewing] = useState<PhaseId | null>(null);
  const unlocked = (p: PhaseId) => !connected || phaseReached(phase, p);
  const active = viewing && unlocked(viewing) ? viewing : phase;

  useEffect(() => { setViewing(null); }, [phase]);

  return (
    <Shell board={board} phase={active} saveState={saveState} connected={connected}>
      {active === "arrival" && <Waiting />}
      {active === "offer" && <Offer onStart={() => setViewing("walk")} />}
      {(active === "walk" || active === "decide") && <Problems board={board} update={update} />}
      {active === "brain" && <Brain board={board} update={update} />}
      {active === "plan" && <Plan board={board} />}
      {active === "constraint" && <Constraint board={board} update={update} />}
      {active === "fault" && <Fault board={board} update={update} />}
      {active === "memo" && <Memo board={board} update={update} />}
      {(active === "pitch" || active === "vote" || active === "debrief") && <LookUp phase={active} />}
      {(active === "close" || active === "done") && <Close board={board} update={update} />}

      {unlocked("walk") && <Revisit unlocked={unlocked} viewing={active} onPick={setViewing} />}
    </Shell>
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
  const copy: Record<string, string> = {
    pitch: "Four people are taking the floor for seventy-five seconds each. Listen for the one you would fund — you will be asked in a minute.",
    vote: "Vote for the plan you would actually put money behind. You cannot vote for your own, and the room is watching the tally on the wall.",
    debrief: "The wall is showing what the whole room decided. Yours is in there.",
  };
  return (
    <Page>
      <Card style={{ textAlign: "center", padding: 56 }}>
        <Eyebrow>{p?.title}</Eyebrow>
        <h1 className="serif" style={{ fontSize: 40, lineHeight: 1.08, margin: "14px 0 12px" }}>Look up.</h1>
        <p style={{ fontSize: 17, lineHeight: 1.6, color: "var(--ink-3)", maxWidth: 480, margin: "0 auto" }}>{copy[phase]}</p>
      </Card>
    </Page>
  );
}

/// A quiet way back to anything already covered. Nothing is ever taken away
/// from a student who was still typing when the room moved on.
function Revisit({ unlocked, viewing, onPick }: { unlocked: (p: PhaseId) => boolean; viewing: PhaseId; onPick: (p: PhaseId) => void }) {
  const options: PhaseId[] = ["walk", "brain", "plan", "constraint", "fault", "memo", "close"];
  const available = options.filter(unlocked);
  if (available.length < 2) return null;
  return (
    <div style={{
      position: "sticky", bottom: 0, background: "rgba(253,249,242,.94)", borderTop: "1px solid var(--line)",
      padding: "10px clamp(16px, 3vw, 32px)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
      backdropFilter: "blur(8px)",
    }}>
      <span style={{ fontSize: 12.5, color: "var(--ink-4)", marginRight: 4 }}>Jump to</span>
      {available.map((o) => (
        <button key={o} onClick={() => onPick(o)} style={{
          fontSize: 13, fontWeight: 600, padding: "8px 13px", borderRadius: 999, minHeight: 38,
          background: viewing === o ? "var(--ink)" : "var(--paper-sunk)",
          color: viewing === o ? "var(--paper)" : "var(--ink-3)",
        }}>
          {PHASE.get(o)?.short}
        </button>
      ))}
    </div>
  );
}
