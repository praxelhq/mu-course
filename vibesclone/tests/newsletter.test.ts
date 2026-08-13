import { describe, expect, it } from "vitest";
import { newsletterInputSchema, normalizeEmail } from "@/lib/newsletter";

describe("newsletter input", () => {
  it("normalizes email and rejects bot submissions", () => {
    expect(normalizeEmail("  Builder@Example.COM ")).toBe("builder@example.com");
    expect(newsletterInputSchema.safeParse({ email: "builder@example.com", source: "blueprint:linear", website: "" }).success).toBe(true);
    expect(newsletterInputSchema.safeParse({ email: "builder@example.com", source: "stats", website: "spam.example" }).success).toBe(false);
  });
});
