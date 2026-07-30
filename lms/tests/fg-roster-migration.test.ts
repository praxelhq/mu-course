import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../prisma/migrations/20260730143000_section_f_email_aliases_and_fg_rosters/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Section F/G roster migration safety", () => {
  it("wraps DDL and roster writes in one explicit transaction", () => {
    expect(migration).toMatch(/^-- AddTable\nBEGIN;/);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
  });

  it("enforces one case-insensitive owner across canonical and alias emails", () => {
    expect(migration).toContain('CREATE UNIQUE INDEX "User_email_lower_key"');
    expect(migration).toContain('CREATE TRIGGER "User_email_identity_owner"');
    expect(migration).toContain('CREATE TRIGGER "UserEmailAlias_email_identity_owner"');
    expect(migration).toContain("email identity is owned by another LMS user");
  });

  it("aborts if the reviewed production reconciliation counts drift", () => {
    expect(migration).toContain(
      "f_users <> 59 OR f_aliases <> 56 OR f_company_primary <> 3 OR g_users <> 59",
    );
    expect(migration).toContain("roster reconciliation produced a blank student name");
  });
});
