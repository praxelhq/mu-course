/// The run of show. The facilitator advances this; every student screen follows
/// it. Nothing advances on a timer — reaching zero on the clock changes nothing,
/// because taking the room away from the person running it is never right.

export type PhaseId =
  | "arrival"
  | "offer"
  | "walk"
  | "decide"
  | "brain"
  | "plan"
  | "constraint"
  | "fault"
  | "memo"
  | "pitch"
  | "vote"
  | "debrief"
  | "close"
  | "done";

export type Phase = {
  id: PhaseId;
  n: number;
  short: string;
  title: string;
  /// What the facilitator says or does here.
  facilitator: string;
  /// Suggested minutes. Advisory — the clock never advances anything.
  minutes: number;
  /// True when this only works with the room at the same beat: somebody is
  /// speaking, a ballot is closing, or the reveal would be spoiled by reading
  /// it early. Everything else is personal work and should not be marshalled.
  together: boolean;
};

export const PHASES: readonly Phase[] = [
  { id: "arrival", n: 0, short: "Doors", title: "Students joining", facilitator: "Put the join code on the wall and wait for the room to fill.", minutes: 3, together: false },
  { id: "offer", n: 1, short: "The offer", title: "Meera hires them", facilitator: "Let them read her note. Do not narrate it — she does the briefing.", minutes: 3, together: false },
  { id: "walk", n: 2, short: "Walk it", title: "Seven places it hurts", facilitator: "They open each problem and read the evidence. Tell them to look at Arun's tile.", minutes: 8, together: false },
  { id: "decide", n: 3, short: "Decide", title: "Hire, build, or change the work", facilitator: "Four changes maximum. Everyone names a person on every one.", minutes: 10, together: false },
  { id: "brain", n: 4, short: "The brain", title: "Teach the company brain", facilitator: "The centrepiece. Do not rush it. Everyone asks all five questions.", minutes: 10, together: false },
  { id: "plan", n: 5, short: "The plan", title: "What it costs and when it lands", facilitator: "Three minutes with a neighbour: find one thing in theirs with nobody checking it.", minutes: 7, together: false },
  { id: "constraint", n: 6, short: "It changed", title: "The world moves", facilitator: "Deal the constraints. Neighbours get different ones on purpose.", minutes: 6, together: false },
  { id: "fault", n: 7, short: "It broke", title: "Something they built fails", facilitator: "Hands up before the wall reveals the split: continue, pause, or stop?", minutes: 8, together: false },
  { id: "memo", n: 8, short: "Sign it", title: "The memo, and lock", facilitator: "They finish and lock. After this nothing changes.", minutes: 8, together: false },
  { id: "pitch", n: 9, short: "Pitch", title: "Four take the floor", facilitator: "Mark four on the console. Seventy-five seconds each, and challenge one of them.", minutes: 10, together: true },
  { id: "vote", n: 10, short: "Fund one", title: "The room funds one plan", facilitator: "Everyone votes once and nobody votes for themselves.", minutes: 4, together: true },
  { id: "debrief", n: 11, short: "Debrief", title: "What the room learned", facilitator: "Walk the wall. The interlock count and the brain failures are the two to sit on.", minutes: 6, together: true },
  { id: "close", n: 12, short: "Close", title: "Radar and commitment", facilitator: "Protected. Do not let anything above eat into this.", minutes: 20, together: true },
  { id: "done", n: 13, short: "Done", title: "Course complete", facilitator: "", minutes: 0, together: false },
];

export const PHASE = new Map(PHASES.map((p) => [p.id, p]));
export const PHASE_IDS = PHASES.map((p) => p.id);

export function nextPhase(id: PhaseId): PhaseId | null {
  const i = PHASE_IDS.indexOf(id);
  return i >= 0 && i < PHASE_IDS.length - 1 ? PHASE_IDS[i + 1] : null;
}
export function prevPhase(id: PhaseId): PhaseId | null {
  const i = PHASE_IDS.indexOf(id);
  return i > 0 ? PHASE_IDS[i - 1] : null;
}
export function phaseReached(current: PhaseId, target: PhaseId): boolean {
  return PHASE_IDS.indexOf(current) >= PHASE_IDS.indexOf(target);
}

/// The stages a student can work through entirely on their own.
export const SELF_PACED: PhaseId[] = PHASES.filter((p) => !p.together && p.n >= 1 && p.n <= 8).map((p) => p.id);

export function needsTheRoom(id: PhaseId): boolean {
  return PHASE.get(id)?.together ?? false;
}
