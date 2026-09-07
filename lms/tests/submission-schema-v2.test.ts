import { describe, expect, it } from "vitest";
import {
  parseSubmissionSchema,
  validateSubmissionFields,
} from "../lib/submission-schema";

const schema = parseSubmissionSchema({
  fields: [
    {
      key: "amount",
      label: "MRR",
      kind: "number",
      required: true,
      unit: "USD",
      helpText: "Enter the rounded whole-dollar value.",
      integer: true,
      min: 0,
    },
    {
      key: "category",
      label: "Category",
      kind: "singleChoice",
      required: true,
      options: [
        { value: "analytics", label: "Analytics" },
        { value: "payments", label: "Payments" },
      ],
    },
    {
      key: "signals",
      label: "Signals",
      kind: "multiChoice",
      required: false,
      options: ["growth", "retention", "efficiency"],
      minSelections: 1,
      maxSelections: 2,
    },
    {
      key: "blueprint",
      label: "Make blueprint",
      kind: "file",
      required: false,
      acceptedMimeTypes: ["application/json", "text/json"],
      maxBytes: 2_000_000,
      maxBytesExclusive: true,
      fileRole: "make-blueprint",
      publishable: false,
      exportable: false,
    },
    { key: "flowchartText", label: "Text equivalent", kind: "writeup", required: false },
  ],
  anyOf: [["blueprint", "flowchartText"]],
})!;

describe("versioned mixed submission schema", () => {
  it("parses learner-safe metadata and file policy", () => {
    expect(schema.fields.map((field) => field.kind)).toEqual([
      "number",
      "singleChoice",
      "multiChoice",
      "file",
      "writeup",
    ]);
    expect(schema.fields[0]).toMatchObject({ unit: "USD", integer: true, min: 0 });
    expect(schema.fields[1].options).toEqual([
      { value: "analytics", label: "Analytics" },
      { value: "payments", label: "Payments" },
    ]);
    expect(schema.fields[3]).toMatchObject({
      maxBytes: 2_000_000,
      maxBytesExclusive: true,
      fileRole: "make-blueprint",
      publishable: false,
      exportable: false,
    });
  });

  it("accepts numeric zero and rejects empty, non-finite, fractional, and below-min values", () => {
    const base = { category: "analytics", flowchartText: "state table" };
    expect(validateSubmissionFields(schema, { ...base, amount: 0 }).ok).toBe(true);
    for (const amount of ["", Number.NaN, Number.POSITIVE_INFINITY, 1.5, -1]) {
      expect(validateSubmissionFields(schema, { ...base, amount }).ok, String(amount)).toBe(false);
    }
  });

  it("validates declared choices, ignores multi-choice order, and rejects duplicates", () => {
    const base = { amount: 1, category: "analytics", flowchartText: "state table" };
    expect(validateSubmissionFields(schema, { ...base, signals: ["growth", "retention"] }).ok).toBe(
      true,
    );
    expect(validateSubmissionFields(schema, { ...base, signals: ["retention", "growth"] }).ok).toBe(
      true,
    );
    expect(validateSubmissionFields(schema, { ...base, category: "invented" }).ok).toBe(false);
    expect(validateSubmissionFields(schema, { ...base, signals: ["growth", "growth"] }).ok).toBe(
      false,
    );
    expect(validateSubmissionFields(schema, { ...base, signals: ["growth", "unknown"] }).ok).toBe(
      false,
    );
  });

  it("requires at least one field from every anyOf group only on final validation", () => {
    const fields = { amount: 1, category: "analytics" };
    expect(validateSubmissionFields(schema, fields).errors).toContain(
      'one of "blueprint", "flowchartText" is required',
    );
    expect(validateSubmissionFields(schema, fields, { partial: true }).ok).toBe(true);
  });

  it("rejects malformed option, constraint, and anyOf definitions", () => {
    expect(
      parseSubmissionSchema({
        fields: [
          {
            key: "x",
            label: "X",
            kind: "singleChoice",
            required: true,
            options: ["same", "same"],
          },
        ],
      }),
    ).toBeNull();
    expect(
      parseSubmissionSchema({
        fields: [{ key: "x", label: "X", kind: "text", required: false }],
        anyOf: [["x", "missing"]],
      }),
    ).toBeNull();
    expect(
      parseSubmissionSchema({
        fields: [
          { key: "x", label: "X", kind: "file", required: true, maxBytes: 0 },
        ],
      }),
    ).toBeNull();
  });

  it("parses word bounds and version-gated required fields", () => {
    const parsed = parseSubmissionSchema({
      fields: [
        {
          key: "reflection",
          label: "Reflection",
          kind: "writeup",
          required: false,
          requiredFromVersion: 2,
          minWords: 3,
          maxWords: 5,
        },
      ],
    });

    expect(parsed?.fields[0]).toMatchObject({
      requiredFromVersion: 2,
      minWords: 3,
      maxWords: 5,
    });
    expect(validateSubmissionFields(parsed!, {}, { submissionVersion: 1 }).ok).toBe(true);
    expect(validateSubmissionFields(parsed!, {}, { submissionVersion: 2 }).errors).toContain(
      'missing required field "reflection"',
    );
  });

  it("enforces opt-in HTTPS, exact-host and GitHub repository link contracts", () => {
    const parsed = parseSubmissionSchema({
      fields: [
        {
          key: "githubUrl",
          label: "GitHub repository",
          kind: "link",
          required: false,
          requiredFromVersion: 2,
          httpsOnly: true,
          allowedHosts: ["github.com"],
          pathKind: "github-repository",
        },
      ],
    });

    expect(parsed?.fields[0]).toMatchObject({
      httpsOnly: true,
      allowedHosts: ["github.com"],
      pathKind: "github-repository",
    });
    expect(
      validateSubmissionFields(parsed!, {}, { submissionVersion: 1 }),
    ).toEqual({ ok: true, errors: [] });
    expect(
      validateSubmissionFields(
        parsed!,
        { githubUrl: "https://github.com/student/signalshelf" },
        { submissionVersion: 2 },
      ),
    ).toEqual({ ok: true, errors: [] });
    for (const value of [
      "http://github.com/student/signalshelf",
      "https://github.com.evil.test/student/signalshelf",
      "https://github.com/student",
      "https://github.com/student/signalshelf/issues",
      "https://github.com/student/signalshelf?tab=readme",
    ]) {
      expect(
        validateSubmissionFields(
          parsed!,
          { githubUrl: value },
          { submissionVersion: 2 },
        ).ok,
        value,
      ).toBe(false);
    }
  });

  it("rejects malformed or non-link URL constraints", () => {
    for (const field of [
      { key: "x", label: "X", kind: "link", required: false, allowedHosts: ["*.github.com"] },
      { key: "x", label: "X", kind: "link", required: false, pathKind: "unknown" },
      { key: "x", label: "X", kind: "text", required: false, httpsOnly: true },
      {
        key: "x",
        label: "X",
        kind: "link",
        required: false,
        pathKind: "github-repository",
        httpsOnly: true,
        allowedHosts: ["example.com"],
      },
    ]) {
      expect(parseSubmissionSchema({ fields: [field] }), JSON.stringify(field)).toBeNull();
    }
  });

  it("enforces word bounds on final submissions while drafts skip only the minimum", () => {
    const parsed = parseSubmissionSchema({
      fields: [
        {
          key: "reflection",
          label: "Reflection",
          kind: "text",
          required: false,
          minWords: 3,
          maxWords: 5,
        },
      ],
    })!;

    expect(validateSubmissionFields(parsed, { reflection: "two words" }).errors).toContain(
      'field "reflection" must contain at least 3 words',
    );
    expect(
      validateSubmissionFields(parsed, { reflection: "one two three four five six" }).errors,
    ).toContain('field "reflection" must contain at most 5 words');
    expect(
      validateSubmissionFields(parsed, { reflection: "two words" }, { partial: true }).ok,
    ).toBe(true);
    expect(
      validateSubmissionFields(
        parsed,
        { reflection: "one two three four five six" },
        { partial: true },
      ).ok,
    ).toBe(false);
  });

  it.each([
    { minWords: -1 },
    { minWords: 1.5 },
    { maxWords: "10" },
    { minWords: 2, maxWords: 1 },
    { maxWords: 100_001 },
    { requiredFromVersion: 0 },
    { requiredFromVersion: 1.5 },
    { requiredFromVersion: 1_001 },
    { required: true, requiredFromVersion: 2 },
  ])("rejects malformed word/version constraints: %o", (constraint) => {
    expect(
      parseSubmissionSchema({
        fields: [
          {
            key: "reflection",
            label: "Reflection",
            kind: "text",
            required: false,
            ...constraint,
          },
        ],
      }),
    ).toBeNull();
  });

  it("rejects word constraints on non-text fields", () => {
    expect(
      parseSubmissionSchema({
        fields: [
          {
            key: "amount",
            label: "Amount",
            kind: "number",
            required: false,
            minWords: 1,
          },
        ],
      }),
    ).toBeNull();
  });
});
