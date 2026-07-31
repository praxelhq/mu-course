import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("Data Race release contract", () => {
  it("uses a dedicated section-isolated aggregate", () => {
    const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
    expect(schema).toContain("model DataRace");
    expect(schema).toContain("@@unique([sessionNo, sectionId])");
    expect(schema).toContain("@@unique([questionId, userId])");
  });

  it("keeps answer keys out of the student route", () => {
    const route = fs.readFileSync("app/api/data-race/state/route.ts", "utf8");
    const service = fs.readFileSync("lib/data-race.ts", "utf8");
    expect(route).not.toContain("correctOptionId");
    expect(service).toContain('race.phase === "feedback" || race.phase === "leaderboard"');
  });

  it("provides an explicit signed-in escape instead of mounting SignIn into a redirect loop", () => {
    const panel = fs.readFileSync("app/sign-in/[[...sign-in]]/sign-in-panel.tsx", "utf8");
    expect(panel).toContain('<Show when="signed-out"><SignIn /></Show>');
    expect(panel).toContain("Sign out and use another account");
    expect(panel).toContain('redirectUrl="/sign-in"');
  });
});
