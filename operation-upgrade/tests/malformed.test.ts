import { describe, expect, it } from "vitest";
import { readBoard, emptyBoard } from "@/lib/engine/types";
import { roomView, type RoomPlayer } from "@/lib/engine/room";
import { planShape, headlineText } from "@/lib/engine/memo";

const player = (handle: string, board: unknown, pitching = false): RoomPlayer =>
  ({ handle, seat: 0, locked: true, pitching, board });

/// One student's board must never be able to take the room down. The console,
/// the wall and the ballot all read boards that a browser wrote, and a browser
/// can write a half-finished one.
describe("a board that is not what it claims to be", () => {
  const junk: [string, unknown][] = [
    ["null", null],
    ["undefined", undefined],
    ["a string", "not a board"],
    ["an array", [1, 2, 3]],
    ["an empty object", {}],
    ["a previous build", { v: 1, handle: "A", picks: { docs: ["build"] }, headline: "free text" }],
    ["v2 with nothing else", { v: 2 }],
    ["v2 with no picks", { v: 2, handle: "A", seat: 0 }],
    ["v2 with picks of the wrong type", { v: 2, picks: "docs", gates: 7, indexed: null, asked: {} }],
    ["v2 with a string headline", { v: 2, headline: "an old free-text headline" }],
    ["v2 with a null commitment", { v: 2, commitment: null, drillOrder: null, radar: "x" }],
    ["v2 with nonsense picks", { v: 2, picks: { docs: ["teleport", 4, null], calls: "build" } }],
  ];

  for (const [name, board] of junk) {
    it(`${name} never throws and never reaches the wall as a real plan`, () => {
      expect(() => roomView([player("Ananya R", board, true)], {})).not.toThrow();
      const view = roomView([player("Ananya R", board, true)], {});
      expect(view.mix).toEqual({ hire: 0, build: 0, redesign: 0 });
      expect(view.pitches[0].headline).toBe("");
      expect(view.pitches[0].shape).toEqual({ hire: 0, build: 0, redesign: 0 });
    });
  }

  it("keeps counting everybody else when one board is broken", () => {
    const good = { ...emptyBoard("Vikram S", 1), picks: { docs: ["redesign"] as const }, gates: { docs: "arun" } };
    const view = roomView([player("Ananya R", { v: 2 }), player("Vikram S", good)], {});
    expect(view.joined).toBe(2);
    expect(view.mix.redesign).toBe(1);
    expect(view.gates.named).toBe(1);
  });

  it("reads a real board back unchanged in the parts that matter", () => {
    const b = { ...emptyBoard("Priya N", 3), picks: { docs: ["redesign", "build"] as const }, asked: ["nuts"], ruling: "pause" as const };
    const read = readBoard(b)!;
    expect(read.picks.docs).toEqual(["redesign", "build"]);
    expect(read.asked).toEqual(["nuts"]);
    expect(read.ruling).toBe("pause");
    expect(planShape(read)).toEqual({ hire: 0, build: 1, redesign: 1 });
  });

  it("drops a ruling that is not one of the three", () => {
    expect(readBoard({ v: 2, ruling: "explode" })!.ruling).toBeNull();
  });

  it("keeps a partial board's real picks while defaulting the rest", () => {
    const read = readBoard({ v: 2, handle: "Dev K", seat: 4, picks: { docs: ["build"] } })!;
    expect(read.picks.docs).toEqual(["build"]);
    expect(read.drillOrder).toEqual([]);
    expect(read.headline).toEqual({ opener: null, middle: null, closer: null });
    expect(headlineText(read)).toBe("");
  });
});
