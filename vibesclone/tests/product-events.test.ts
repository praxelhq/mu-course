import { describe, expect, it } from "vitest";
import { eventInputSchema } from "@/lib/product-events";

describe("product events", () => {
  it("accepts only the public funnel allowlist", () => {
    expect(eventInputSchema.safeParse({ event: "blueprint_view", blueprintSlug: "linear" }).success).toBe(true);
    expect(eventInputSchema.safeParse({ event: "blueprint_remix", publicId: "public123" }).success).toBe(true);
    expect(eventInputSchema.safeParse({ event: "public_report_shared", publicId: "public123" }).success).toBe(true);
    expect(eventInputSchema.safeParse({ event: "prompt_copied", blueprintSlug: "linear" }).success).toBe(true);
    expect(eventInputSchema.safeParse({ event: "newsletter_signup", blueprintSlug: "linear" }).success).toBe(false);
    expect(eventInputSchema.safeParse({ event: "public_report_view", blueprintSlug: "linear" }).success).toBe(false);
    expect(eventInputSchema.safeParse({ event: "blueprint_view" }).success).toBe(false);
    expect(eventInputSchema.safeParse({ event: "prompt_text", prompt: "secret" }).success).toBe(false);
    expect(eventInputSchema.safeParse({ event: "blueprint_view", blueprintSlug: "x".repeat(100) }).success).toBe(false);
  });
});
