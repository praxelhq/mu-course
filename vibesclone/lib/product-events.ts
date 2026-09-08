import { z } from "zod";

export const productEventNames = ["blueprint_view", "blueprint_remix", "blueprint_shared", "public_report_view", "public_report_published", "public_report_shared", "newsletter_signup", "prompt_copied"] as const;
export type ProductEventName = (typeof productEventNames)[number];

const clientEventNames = ["blueprint_view", "blueprint_remix", "blueprint_shared", "public_report_view", "public_report_shared", "prompt_copied"] as const;

export const eventInputSchema = z.object({
  event: z.enum(clientEventNames),
  blueprintSlug: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/).optional(),
  publicId: z.string().trim().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).strict().superRefine((input, context) => {
  const issue = (message: string) => context.addIssue({ code: "custom", message });
  if (input.event === "blueprint_view" || input.event === "blueprint_shared") {
    if (!input.blueprintSlug || input.publicId) issue("Blueprint activity needs exactly one blueprint slug.");
  } else if (input.event === "blueprint_remix") {
    if (Boolean(input.blueprintSlug) === Boolean(input.publicId)) issue("A remix needs exactly one source.");
  } else if (input.event === "public_report_view" || input.event === "public_report_shared") {
    if (!input.publicId || input.blueprintSlug) issue("Report activity needs exactly one public report ID.");
  } else if (input.publicId) {
    issue("Prompt copy activity cannot include a public report ID.");
  }
});
