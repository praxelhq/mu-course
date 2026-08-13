"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { trackProductEvent } from "@/components/analytics/clarity";
import { copyToClipboard } from "@/lib/client/clipboard";

export function CopyPromptButton({ prompt, blueprintSlug }: { prompt: string; blueprintSlug: string }): React.ReactNode {
  const [copied, setCopied] = useState(false);
  async function copy() { await copyToClipboard(prompt); setCopied(true); trackProductEvent("prompt_copied", { blueprintSlug }); window.setTimeout(() => setCopied(false), 1600); }
  return <button className="button primary" onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Prompt copied" : "Copy free prompt"}</button>;
}
