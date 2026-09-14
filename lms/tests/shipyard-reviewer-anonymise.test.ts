// SPEC §6: "The reviewer never sees the student's name or section; the worker
// strips them." These tests are that sentence, made enforceable.

import { describe, expect, it } from "vitest";
import {
  anonymiseSubmission,
  EMAIL_TOKEN,
  NAME_TOKEN,
  PHONE_TOKEN,
  SECTION_TOKEN,
  sweepContacts,
} from "@/lib/shipyard/reviewer/anonymise";

const STUDENT = {
  name: "Ananya Raghunathan",
  email: "ananya.raghunathan@mastersunion.org",
  sectionCode: "C",
  sectionName: "Section C",
};

describe("anonymiseSubmission", () => {
  it("strips the name, the email and the section from the fields", () => {
    const result = anonymiseSubmission({
      fields: {
        launchWriteup:
          "I ran the launch from 1 September. Written up by Ananya Raghunathan, Section C. Reach me at ananya.raghunathan@mastersunion.org.",
      },
      student: STUDENT,
    });

    const text = String(result.fields.launchWriteup);
    expect(text).not.toContain("Ananya");
    expect(text).not.toContain("Raghunathan");
    expect(text).not.toContain("mastersunion.org");
    expect(text).toContain(NAME_TOKEN);
    expect(text).toContain(EMAIL_TOKEN);
    expect(text).toContain(SECTION_TOKEN);
    expect(result.redactions).toBeGreaterThanOrEqual(3);
  });

  it("finds the name inside prose, not only in a sign-off", () => {
    const result = anonymiseSubmission({
      fields: {
        firstCustomerStory:
          "She said 'Ananya, this actually works' and paid the same evening. Raghunathan was my father's suggestion for the brand name.",
      },
      student: STUDENT,
    });
    const text = String(result.fields.firstCustomerStory);
    expect(text).not.toMatch(/Ananya/i);
    expect(text).not.toMatch(/Raghunathan/i);
    expect(result.redactionsByKind.name).toBeGreaterThanOrEqual(2);
  });

  it("redacts the name case-insensitively and at word boundaries only", () => {
    const result = anonymiseSubmission({
      fields: { note: "ANANYA runs it. Ananyaa is a different person's handle." },
      student: { name: "Ananya" },
    });
    const text = String(result.fields.note);
    expect(text).toContain(`${NAME_TOKEN} runs it.`);
    // A longer word that merely starts with the name survives.
    expect(text).toContain("Ananyaa");
  });

  it("sweeps any email address and any phone number out of free text", () => {
    const result = anonymiseSubmission({
      fields: {
        distributionChannels:
          "The first buyer wrote from priya@dabbawala.in and called me on +91 98765 43210. A second one used 9123456780.",
      },
      student: null,
    });
    const text = String(result.fields.distributionChannels);
    expect(text).not.toContain("priya@dabbawala.in");
    expect(text).not.toContain("98765");
    expect(text).not.toContain("9123456780");
    expect(text).toContain(EMAIL_TOKEN);
    expect(result.redactionsByKind.phone).toBe(2);
  });

  it("leaves URLs, prices, counts and dates alone", () => {
    const before =
      "Live at https://tiffin-9876543210.vercel.app — 41 signups by 2026-09-03, ₹8,400 gross, 268 visits.";
    const after = sweepContacts(before);
    expect(after).toBe(before);
  });

  it("redacts inside arrays and leaves numbers untouched", () => {
    const result = anonymiseSubmission({
      fields: {
        signupCount: 41,
        sketches: ["drawn by Ananya", "screen 2"],
      },
      student: STUDENT,
    });
    expect(result.fields.signupCount).toBe(41);
    expect(result.fields.sketches).toEqual([`drawn by ${NAME_TOKEN}`, "screen 2"]);
  });

  it("redacts the product name and one-liner too", () => {
    const result = anonymiseSubmission({
      fields: {},
      product: { name: "Ananya's Dabba Route", oneLiner: "Built by Ananya Raghunathan in Section C" },
      student: STUDENT,
    });
    expect(result.product?.name).toBe(`${NAME_TOKEN}'s Dabba Route`);
    expect(result.product?.oneLiner).not.toMatch(/Ananya|Raghunathan|Section C/i);
  });

  it("redacts the extracted text from an attachment as well as the fields", () => {
    const result = anonymiseSubmission({
      fields: { flowNotes: "Screen 1 is the landing page." },
      extractedText: "Wireframes — Ananya Raghunathan — Section C — ananya.raghunathan@mastersunion.org",
      student: STUDENT,
    });
    expect(result.extractedText).not.toMatch(/Ananya|Raghunathan|mastersunion/i);
  });

  it("does not shred prose when only a section letter is known", () => {
    const result = anonymiseSubmission({
      fields: { note: "Plan C is the fallback. I am in section C." },
      student: { sectionCode: "C" },
    });
    const text = String(result.fields.note);
    expect(text).toContain("Plan C is the fallback.");
    expect(text).toContain(SECTION_TOKEN);
  });

  it("counts zero redactions on a submission that never names anyone", () => {
    const result = anonymiseSubmission({
      fields: { corePath: "Open the link, pick a slot, pay ₹1,800." },
      student: STUDENT,
    });
    expect(result.redactions).toBe(0);
    expect(result.fields.corePath).toBe("Open the link, pick a slot, pay ₹1,800.");
  });

  it("does not redact a short or common name fragment", () => {
    const result = anonymiseSubmission({
      fields: { note: "Kumar Singh de la Cruz ordered two tiffins." },
      student: { name: "Vi Kumar Singh" },
    });
    const text = String(result.fields.note);
    // "Kumar" and "Singh" are stopwords; "Vi" is under the length floor.
    expect(text).toContain("Kumar Singh");
    expect(result.redactionsByKind.name).toBe(0);
  });

  it("redacts a phone number written without spaces but not an 8-digit id", () => {
    expect(sweepContacts("call 9876543210 now")).toContain(PHONE_TOKEN);
    expect(sweepContacts("order id 20260903")).toBe("order id 20260903");
  });
});
