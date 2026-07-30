import { describe, expect, it } from "vitest";
import {
  parsePublicationPolicy,
  projectPublication,
  type PublicationPolicy,
} from "../lib/publication-policy";

const workflowPolicy: PublicationPolicy = {
  wall: "workflow",
  consentField: "galleryConsent",
  captionField: "gallerySummary",
  publicTextFields: ["workflowTitle", "gallerySummary", "accessibilityDescription"],
  previewRole: "workflowPngFile",
  actions: [
    {
      label: "Clone in Make",
      field: "scenarioShareUrl",
      kind: "external-url",
      allowedHosts: ["make.com", "www.make.com", "eu1.make.com", "us1.make.com"],
      requireReviewedFingerprint: true,
    },
    {
      label: "View sample output",
      role: "sampleOutputFile",
      kind: "roster-file",
    },
  ],
};

const safeEvidence = [
  { role: "workflowPngFile", publicUrl: "/api/gallery/image/sub-1", state: "clean" as const },
  { role: "sampleOutputFile", publicUrl: "/api/gallery/output/sub-1", state: "clean" as const },
  { role: "blueprintFile", publicUrl: "/private/raw-blueprint", state: "clean" as const },
];

describe("publication policy", () => {
  it("requires both active learner consent and instructor curation", () => {
    const base = {
      policy: workflowPolicy,
      fields: {
        galleryConsent: "YES",
        workflowTitle: "Lead routing with duplicate protection",
        gallerySummary: "Routes qualified leads and suppresses duplicate actions.",
      },
      evidence: safeEvidence,
      consent: { active: true },
      curation: { status: "approved" as const },
      reviewedFingerprints: {},
      currentFingerprints: {},
    };

    expect(projectPublication({ ...base, consent: { active: false } })).toMatchObject({
      published: false,
      withheldReasons: ["owner-consent-required"],
    });
    expect(projectPublication({ ...base, curation: { status: "pending" } })).toMatchObject({
      published: false,
      withheldReasons: ["instructor-approval-required"],
    });
  });

  it("projects only allowlisted text, preview, and actions", () => {
    const projection = projectPublication({
      policy: workflowPolicy,
      fields: {
        galleryConsent: "YES",
        workflowTitle: "Lead routing with duplicate protection",
        gallerySummary: "Routes qualified leads and suppresses duplicate actions.",
        accessibilityDescription: "Webhook, validation, duplicate guard, approval queue.",
        scenarioShareUrl: "https://www.make.com/en/scenario/123",
        prompt: "private prompt",
        rawLog: "private raw log",
        grade: 40,
      },
      evidence: safeEvidence,
      consent: { active: true },
      curation: { status: "approved" },
      reviewedFingerprints: { scenarioShareUrl: "sha256:stable" },
      currentFingerprints: { scenarioShareUrl: "sha256:stable" },
    });

    expect(projection.published).toBe(true);
    if (!projection.published) return;
    expect(projection.text).toEqual({
      workflowTitle: "Lead routing with duplicate protection",
      gallerySummary: "Routes qualified leads and suppresses duplicate actions.",
      accessibilityDescription: "Webhook, validation, duplicate guard, approval queue.",
    });
    expect(projection.previewUrl).toBe("/api/gallery/image/sub-1");
    expect(projection.actions.map((a) => a.label)).toEqual([
      "Clone in Make",
      "View sample output",
    ]);
    expect(JSON.stringify(projection)).not.toContain("blueprint");
    expect(JSON.stringify(projection)).not.toContain("private prompt");
    expect(JSON.stringify(projection)).not.toContain("private raw log");
    expect(JSON.stringify(projection)).not.toContain("40");
  });

  it("withholds a non-Make or materially changed clone link without exposing a blueprint fallback", () => {
    const projection = projectPublication({
      policy: workflowPolicy,
      fields: {
        galleryConsent: "YES",
        workflowTitle: "Safe workflow",
        gallerySummary: "A safe summary.",
        scenarioShareUrl: "https://evil.example/scenario/123",
      },
      evidence: safeEvidence,
      consent: { active: true },
      curation: { status: "approved" },
      reviewedFingerprints: { scenarioShareUrl: "sha256:reviewed" },
      currentFingerprints: { scenarioShareUrl: "sha256:changed" },
    });

    expect(projection.published).toBe(true);
    if (!projection.published) return;
    expect(projection.actions).toEqual([
      { label: "View sample output", kind: "roster-file", target: "/api/gallery/output/sub-1" },
    ]);
    expect(JSON.stringify(projection)).not.toContain("raw-blueprint");
  });

  it("fails closed when the required preview is quarantined", () => {
    const projection = projectPublication({
      policy: workflowPolicy,
      fields: { galleryConsent: "YES", workflowTitle: "Unsafe workflow" },
      evidence: [
        { role: "workflowPngFile", publicUrl: "/unsafe", state: "quarantined" },
      ],
      consent: { active: true },
      curation: { status: "approved" },
      reviewedFingerprints: {},
      currentFingerprints: {},
    });
    expect(projection).toMatchObject({
      published: false,
      withheldReasons: ["preview-not-clean"],
    });
  });

  it("withholds public text containing TrustMRR row markers or sensitive values", () => {
    const base = {
      policy: workflowPolicy,
      evidence: safeEvidence,
      consent: { active: true },
      curation: { status: "approved" as const },
      reviewedFingerprints: {},
      currentFingerprints: {},
    };
    expect(
      projectPublication({
        ...base,
        fields: {
          workflowTitle: "Lead routing",
          gallerySummary: "product_id=private-17; mrr=30800",
        },
      }),
    ).toMatchObject({ published: false, withheldReasons: ["public-text-unsafe"] });
    expect(
      projectPublication({
        ...base,
        fields: {
          workflowTitle: "Lead routing",
          gallerySummary: "authorization=sk_live_FAKE_SECRET_VALUE_123456",
        },
      }),
    ).toMatchObject({ published: false, withheldReasons: ["public-text-unsafe"] });
  });

  it("accepts only official Make scenario-sharing paths for clone actions", () => {
    const makePolicy: PublicationPolicy = {
      ...workflowPolicy,
      actions: [
        {
          label: "Clone in Make",
          field: "scenarioShareUrl",
          kind: "external-url",
          allowedHosts: ["*.make.com"],
          urlKind: "make-scenario",
        },
      ],
    };
    const base = {
      policy: makePolicy,
      evidence: safeEvidence,
      consent: { active: true },
      curation: { status: "approved" as const },
      reviewedFingerprints: {},
      currentFingerprints: {},
    };
    const safe = projectPublication({
      ...base,
      fields: { scenarioShareUrl: "https://we.make.com/public/shared-scenario/abc/example" },
    });
    expect(safe.published && safe.actions).toHaveLength(1);
    const wrongPage = projectPublication({
      ...base,
      fields: { scenarioShareUrl: "https://www.make.com/en/pricing" },
    });
    expect(wrongPage.published && wrongPage.actions).toEqual([]);
  });

  it("supports explicit app subdomain rules without suffix confusion", () => {
    const appPolicy: PublicationPolicy = {
      wall: "app",
      consentField: "galleryConsent",
      captionField: "gallerySummary",
      publicTextFields: ["productName", "gallerySummary"],
      previewRole: "appScreenshot",
      actions: [
        {
          label: "Open app",
          field: "publishedUrl",
          kind: "external-url",
          allowedHosts: ["*.lovable.app"],
        },
      ],
    };
    const project = (publishedUrl: string) =>
      projectPublication({
        policy: appPolicy,
        fields: { publishedUrl },
        evidence: [
          { role: "appScreenshot", publicUrl: "/api/gallery/image/sub-1", state: "clean" },
        ],
        consent: { active: true },
        curation: { status: "approved" },
        reviewedFingerprints: {},
        currentFingerprints: {},
      });

    const safe = project("https://student-project.lovable.app/demo");
    expect(safe.published && safe.actions).toHaveLength(1);

    for (const unsafe of [
      "https://evillovable.app/demo",
      "https://student-project.lovable.app.evil.example/demo",
      "http://student-project.lovable.app/demo",
      "https://user:password@student-project.lovable.app/demo",
      "https://student-project.lovable.app/demo?api_token=secret",
    ]) {
      const projection = project(unsafe);
      expect(projection.published && projection.actions, unsafe).toEqual([]);
    }
  });

  it("rejects malformed host rules and non-Make suffixes in Make scenario policies", () => {
    const base = {
      wall: "workflow",
      consentField: "galleryConsent",
      captionField: "gallerySummary",
      publicTextFields: ["gallerySummary"],
      previewRole: "workflowPngFile",
    };
    expect(
      parsePublicationPolicy({
        ...base,
        actions: [
          {
            label: "Open app",
            field: "publishedUrl",
            kind: "external-url",
            allowedHosts: ["https://lovable.app/path"],
          },
        ],
      }),
    ).toBeNull();
    expect(
      parsePublicationPolicy({
        ...base,
        actions: [
          {
            label: "Clone in Make",
            field: "scenarioShareUrl",
            kind: "external-url",
            allowedHosts: ["*.evilmaker.com"],
            urlKind: "make-scenario",
          },
        ],
      }),
    ).toBeNull();
  });
});
