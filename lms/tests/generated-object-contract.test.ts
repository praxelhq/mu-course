import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  join(root, "prisma/migrations/20260730160000_sessions_3_5_contracts/migration.sql"),
  "utf8",
);

describe("generated learner-object storage contract", () => {
  it("models durable reservations and exact target VersionIds", () => {
    expect(schema).toMatch(/enum GeneratedObjectPurpose\s*{[\s\S]*gallery_screenshot[\s\S]*publication_preview[\s\S]*interview_recording[\s\S]*interview_turn_audio/);
    expect(schema).toMatch(/model GeneratedObjectReservation\s*{[\s\S]*s3Key\s+String\s+@unique[\s\S]*s3VersionId\s+String\?/);
    expect(schema).toMatch(/model GalleryItem\s*{[\s\S]*screenshotS3VersionId\s+String\?/);
    expect(schema).toMatch(/model PublicationDecision\s*{[\s\S]*previewS3VersionId\s+String\?/);
    expect(schema).toMatch(/model Interview\s*{[\s\S]*audioS3VersionId\s+String\?/);
    expect(schema).toMatch(/model InterviewTurn\s*{[\s\S]*audioS3VersionId\s+String\?/);
  });

  it("installs parent, lifecycle, and exact-attachment database guards", () => {
    expect(migration).toContain('CREATE TABLE "GeneratedObjectReservation"');
    expect(migration).toContain('GeneratedObjectReservation_exactly_one_parent_check');
    expect(migration).toContain('GeneratedObjectReservation_s3Key_key');
    expect(migration).toContain('validate_generated_object_reservation_lifecycle');
    expect(migration).toContain('validate_generated_object_attachment');
    expect(migration).toContain('real generated-object keys require an exact VersionId');
    expect(migration).toContain('generated-object attachment lacks a matching consumed reservation');
  });
});
