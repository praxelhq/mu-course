import { describe, expect, it } from "vitest";
import { emptyBoard, type Board } from "@/lib/engine/types";
import { resolveOption, totals, gateLoad, budgetOf, changeCount } from "@/lib/engine/economics";
import { askBrain, brainReport } from "@/lib/engine/brain";
import { dealConstraint, dealFault, eligibleFaults, faultlessBecause } from "@/lib/engine/deal";
import { blockers, canLock } from "@/lib/engine/validate";
import { composeMemo, planShape } from "@/lib/engine/memo";
import { CONSTRAINTS } from "@/lib/content/events";
import { PROBLEMS } from "@/lib/content/problems";

function board(over: Partial<Board> = {}): Board {
  return { ...emptyBoard("Nikhil", 0), ...over };
}

describe("the sequencing lesson is a rule of the game", () => {
  it("charges full price for the company brain on a dirty library", () => {
    const r = resolveOption("docs", "build", board());
    expect(r.costLakh).toBe(9);
    expect(r.risk).toBe("high");
    expect(r.discounted).toBe(false);
  });

  it("makes it cheaper and safe once the library is cleaned first", () => {
    const r = resolveOption("docs", "build", board({ picks: { docs: ["redesign"] } }));
    expect(r.costLakh).toBe(7);
    expect(r.risk).toBe("low");
    expect(r.discounted).toBe(true);
    expect(r.discountNote).toContain("something true to read");
  });

  it("lets a student clean the library and build on it, for the same money", () => {
    const dirty = totals(board({ picks: { docs: ["build"] } }));
    const sequenced = totals(board({ picks: { docs: ["redesign", "build"] } }));
    // Identical annual cost. The difference bought is the risk, not the price.
    expect(sequenced.spendLakh).toBe(dirty.spendLakh);
    expect(resolveOption("docs", "build", board({ picks: { docs: ["redesign"] } })).risk).toBe("low");
    expect(resolveOption("docs", "build", board()).risk).toBe("high");
    // But it costs a second change out of the four Meera will fund.
    expect(changeCount(board({ picks: { docs: ["redesign", "build"] } }))).toBe(2);
  });

  it("does the same for store reporting", () => {
    expect(resolveOption("reporting", "build", board()).risk).toBe("medium");
    const after = resolveOption("reporting", "build", board({ picks: { reporting: ["redesign"] } }));
    expect(after.costLakh).toBe(5);
    expect(after.risk).toBe("low");
  });
});

describe("constraints actually bind", () => {
  it("cuts the budget", () => {
    expect(budgetOf(board())).toBe(40);
    expect(budgetOf(board({ constraintId: "budget-cut" }))).toBe(28);
  });

  it("makes the till-dependent automation slower and dearer", () => {
    const r = resolveOption("reporting", "build", board({ constraintId: "no-pos-api" }));
    expect(r.costLakh).toBe(10);
    expect(r.liveWeek).toBe(8);
    expect(r.penalised).toBe(true);
  });

  it("takes the voice agent off the table entirely", () => {
    const r = resolveOption("calls", "build", board({ constraintId: "legal-ban" }));
    expect(r.blocked).toBe(true);
    expect(r.blockedWhy).toContain("customer data");
  });

  it("spreads the eight cards evenly across a section", () => {
    const dealt = Array.from({ length: 56 }, (_, seat) => dealConstraint(seat).id);
    for (const c of CONSTRAINTS) {
      expect(dealt.filter((id) => id === c.id)).toHaveLength(7);
    }
  });
});

describe("money and obligations", () => {
  it("adds the testing obligation at the second AI system, not the first", () => {
    const one = totals(board({ picks: { docs: ["build"] } }));
    expect(one.obligations.find((o) => o.id === "checking")?.active).toBe(false);

    const two = totals(board({ picks: { docs: ["build"], reporting: ["build"] } }));
    const checking = two.obligations.find((o) => o.id === "checking");
    expect(checking?.active).toBe(true);
    // 9 + 7 for the two builds, plus the 4 the obligation costs.
    expect(two.spendLakh).toBe(9 + 7 + 4);
  });

  it("adds the training obligation when something touches personal details", () => {
    const t = totals(board({ picks: { calls: ["build"] } }));
    expect(t.obligations.find((o) => o.id === "training")?.active).toBe(true);
  });

  it("makes hiring for everything genuinely unaffordable", () => {
    const t = totals(board({ picks: { docs: ["hire"], calls: ["hire"], website: ["hire"], analytics: ["hire"] } }));
    expect(t.spendLakh).toBe(44);
    expect(t.overBy).toBe(4);
  });

  it("leaves room for a sequenced plan", () => {
    const t = totals(board({ picks: { docs: ["redesign", "build"], reporting: ["redesign"] } }));
    // 2 to clean the library, 7 to build on it once clean, 1 for the daily form.
    expect(t.spendLakh).toBe(10);
    expect(t.remainingLakh).toBe(30);
  });

  it("counts what lands before day thirty", () => {
    const t = totals(board({ picks: { analytics: ["redesign"], docs: ["build"] } }));
    expect(t.landsBefore(4)).toBe(1);
    expect(t.earliestWeek).toBe(1);
  });
});

describe("the company brain answers from the pile it was given", () => {
  it("is confidently wrong when both allergen guides are indexed", () => {
    const o = askBrain(["allergen26", "allergen24"], "nuts");
    expect(o.verdict).toBe("wrong");
    expect(o.sourceId).toBe("allergen24");
    expect(o.lesson).toContain("did not make the answer true");
  });

  it("is right on the current guide alone", () => {
    const o = askBrain(["allergen26"], "nuts");
    expect(o.verdict).toBe("right");
    expect(o.answer).toContain("cashew");
  });

  it("refuses when it has nothing", () => {
    expect(askBrain([], "nuts").verdict).toBe("refused");
  });

  it("leaks a salary when the payroll sheet was indexed", () => {
    const o = askBrain(["payroll"], "salary");
    expect(o.verdict).toBe("leaked");
    expect(o.answer).toContain("18,40,000");
  });

  it("keeps the salary private when it was not", () => {
    expect(askBrain(["allergen26"], "salary").verdict).toBe("refused");
  });

  it("repeats a customer's invented policy back as fact", () => {
    const o = askBrain(["complaint"], "autorefund");
    expect(o.verdict).toBe("fooled");
    expect(o.lesson).toContain("written by people outside the company");
  });

  it("is not fooled once the real policy outranks it", () => {
    expect(askBrain(["complaint", "refunds"], "autorefund").verdict).toBe("right");
  });

  it("quotes an abandoned franchise draft as live refund policy", () => {
    expect(askBrain(["franchise"], "refund").verdict).toBe("wrong");
  });

  it("summarises how many answers would have hurt somebody", () => {
    const r = brainReport(["allergen24", "payroll"], ["nuts", "salary", "catering"]);
    expect(r.harmful).toBe(2);
    expect(r.right).toBe(0);
  });
});

describe("faults come from what they built", () => {
  it("deals nothing to a plan made only of people and process", () => {
    const b = board({ picks: { docs: ["redesign"], calls: ["hire"] } });
    expect(eligibleFaults(b)).toHaveLength(0);
    expect(dealFault(b)).toBeNull();
    expect(faultlessBecause(b)).toContain("people and process over systems");
  });

  it("only deals faults belonging to systems that exist", () => {
    const b = board({ picks: { docs: ["build"] } });
    const ids = eligibleFaults(b).map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(["allergen", "salary"]));
    expect(ids).not.toContain("api-key");
  });

  it("earns the overload fault only once one person is named too often", () => {
    const safe = board({ picks: { docs: ["build"], website: ["build"] }, gates: { docs: "arun", website: "sunita" } });
    expect(eligibleFaults(safe).map((f) => f.id)).not.toContain("arun-leave");

    const overloaded = board({
      picks: { docs: ["build"], website: ["build"], reporting: ["build"] },
      gates: { docs: "arun", website: "arun", reporting: "arun" },
    });
    expect(eligibleFaults(overloaded).map((f) => f.id)).toContain("arun-leave");
    expect(gateLoad(overloaded).arun).toBe(3);
  });
});

describe("what stands between a student and showing Meera", () => {
  it("lists everything at once, in sentences", () => {
    const list = blockers(board());
    expect(list.length).toBeGreaterThan(2);
    for (const b of list) expect(b.text.split(" ").length).toBeGreaterThan(4);
    expect(list.map((b) => b.code)).toContain("nothing-chosen");
    expect(list.map((b) => b.code)).toContain("no-rejection");
  });

  it("refuses a fifth change", () => {
    const b = board({ picks: { docs: ["redesign"], calls: ["redesign"], marketing: ["redesign"], website: ["redesign"], analytics: ["redesign"] } });
    expect(blockers(b).map((x) => x.code)).toContain("too-many");
  });

  it("refuses a plan with nobody named on a change", () => {
    const b = board({ picks: { docs: ["redesign"] }, reasons: { docs: "It is the cheapest thing on the page and it unlocks the rest." } });
    expect(blockers(b).map((x) => x.code)).toContain("gate-docs");
  });

  it("holds the plan when the board wanted something inside thirty days", () => {
    const b = board({ constraintId: "thirty-days", picks: { docs: ["hire"] }, gates: { docs: "meera" } });
    expect(blockers(b).map((x) => x.code)).toContain("nothing-early");
  });

  it("holds the plan when procurement allowed one system and they built three", () => {
    const b = board({ constraintId: "one-vendor", picks: { docs: ["build"], reporting: ["build"], marketing: ["build"] } });
    expect(blockers(b).map((x) => x.code)).toContain("too-many-builds");
  });

  it("lets a complete plan through", () => {
    const b = board({
      picks: { docs: ["redesign"], reporting: ["redesign"], analytics: ["redesign"] },
      gates: { docs: "arun", reporting: "sunita", analytics: "meera" },
      reasons: {
        docs: "Everything else depends on there being one true version of each document.",
        reporting: "One form and one deadline gives back three hours a day for one lakh.",
        analytics: "Four of these reports have no reader at all, so we simply stop making them.",
      },
      leaving: "hiring",
      leavingWhy: "Recruitment hurts but it does not stop a store trading tomorrow morning.",
      constraintId: "thirty-days",
      constraintResponse: "Everything I chose lands by week four already, so nothing needs resequencing for the board update.",
      headline:
        "Fix what is written down before automating anything. One true version of every document, one daily form, and stop making the four reports nobody reads. That is three lakh a year, it all lands inside a month, and it makes every system we build next year cheaper and safer to run.",
    });
    expect(blockers(b)).toEqual([]);
    expect(canLock(b)).toBe(true);
  });
});

describe("the memo", () => {
  it("is composed only from what the student decided", () => {
    const b = board({
      picks: { docs: ["redesign"] },
      gates: { docs: "arun" },
      reasons: { docs: "One true version of everything, owned and dated, before we automate a word of it." },
      leaving: "hiring",
      leavingWhy: "It hurts, but nobody stops trading because a shortlist is slow.",
      indexed: ["allergen26", "refunds"],
      asked: ["nuts", "salary"],
      headline: "Fix the documents first. Everything else in this company is downstream of them, and it costs two lakh.",
      commitment: { what: "the weekly numbers I rebuild by hand", evidence: "Monday's summary is ready before nine without me" },
    });
    const md = composeMemo(b);
    expect(md).toContain("One source of truth");
    expect(md).toContain("Arun Kulkarni");
    expect(md).toContain("deliberately not fixing");
    expect(md).toContain("Every question I tested came back either correct or refused");
    expect(md).toContain("fictional company");
    expect(md).not.toContain("undefined");
  });

  it("reports the shape of the plan for the wall", () => {
    expect(planShape(board({ picks: { docs: ["build"], calls: ["hire"], analytics: ["redesign"] } })))
      .toEqual({ hire: 1, build: 1, redesign: 1 });
  });
});

describe("the content itself", () => {
  it("gives every problem three options and a taught idea", () => {
    for (const p of PROBLEMS) {
      expect(p.options).toHaveLength(3);
      expect(p.options.map((o) => o.id).sort()).toEqual(["build", "hire", "redesign"]);
      expect(p.teaches.length).toBeGreaterThan(20);
      expect(p.thread.length).toBeGreaterThan(1);
    }
  });

  it("never puts a fault on an option that cannot produce one", () => {
    for (const p of PROBLEMS) {
      for (const o of p.options) {
        if (o.id !== "build") expect(o.faultIds).toHaveLength(0);
      }
    }
  });
});
