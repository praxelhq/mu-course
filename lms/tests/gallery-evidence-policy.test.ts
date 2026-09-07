import { describe, expect, it } from "vitest";
import { isPublicEvidenceRole, selectLegacyGalleryImageKey } from "../lib/galleries";
import type { PublicationPolicy } from "../lib/publication-policy";
import { fingerprintExternalPublicationContent } from "../worker/jobs/screenshot-capture";

const policy: PublicationPolicy = {
  wall: "workflow",
  consentField: "galleryConsent",
  captionField: "gallerySummary",
  publicTextFields: ["workflowTitle", "gallerySummary"],
  previewRole: "workflowPngFile",
  actions: [
    {
      label: "Clone in Make",
      field: "scenarioShareUrl",
      kind: "external-url",
      allowedHosts: ["www.make.com"],
      urlKind: "make-scenario",
      requireReviewedFingerprint: true,
    },
    { label: "View sample output", role: "sampleOutputFile", kind: "roster-file" },
  ],
};

describe("gallery evidence authorization", () => {
  it("authorizes only policy preview and roster-file roles", () => {
    expect(isPublicEvidenceRole(policy, "workflowPngFile")).toBe(true);
    expect(isPublicEvidenceRole(policy, "sampleOutputFile")).toBe(true);
    for (const role of ["blueprintFile", "runLogFile", "promptLog", "rawAttachment"])
      expect(isPublicEvidenceRole(policy, role)).toBe(false);
  });

  it("changes the stored recrawl marker when a mutable public scenario changes", () => {
    const first = fingerprintExternalPublicationContent({
      finalUrl: "https://eu1.make.com/public/shared-scenario/abc",
      contentType: "text/html",
      body: new TextEncoder().encode("saved version one"),
    });
    const same = fingerprintExternalPublicationContent({
      finalUrl: "https://eu1.make.com/public/shared-scenario/abc",
      contentType: "text/html",
      body: new TextEncoder().encode("saved version one"),
    });
    const changed = fingerprintExternalPublicationContent({
      finalUrl: "https://eu1.make.com/public/shared-scenario/abc",
      contentType: "text/html",
      body: new TextEncoder().encode("saved version two"),
    });
    expect(first).toBe(same);
    expect(first).not.toBe(changed);
    expect(first).toMatch(/^external-fingerprint:sha256:[a-f0-9]{64}$/);
  });

  it("never reinterprets a legacy workflow blueprint or recording as a public image", () => {
    expect(
      selectLegacyGalleryImageKey({
        assignmentTypeSlug: "workflow",
        fields: { image: "private/raw-blueprint.json" },
        files: ["private/raw-blueprint.json", "private/run-recording.mp4"],
        screenshotS3Key: null,
      }),
    ).toBeNull();
    expect(
      selectLegacyGalleryImageKey({
        assignmentTypeSlug: "workflow",
        fields: {},
        files: ["private/raw-blueprint.json"],
        screenshotS3Key: "gallery/screenshots/curated-workflow.png",
      }),
    ).toBe("gallery/screenshots/curated-workflow.png");
  });
});
