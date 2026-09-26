"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Copy, Linkedin, Share2 } from "lucide-react";
import { trackProductEvent } from "@/components/analytics/clarity";
import { copyToClipboard } from "@/lib/client/clipboard";

type Props = { title: string; text: string; buildHref: string; blueprintSlug?: string; publicId?: string; trackView?: "blueprint_view" | "public_report_view" };

export function PublicActions({ title, text, buildHref, blueprintSlug, publicId, trackView }: Props): React.ReactNode {
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (trackView) trackProductEvent(trackView, { blueprintSlug, publicId }); }, [trackView, blueprintSlug, publicId]);
  const context = { blueprintSlug, publicId };
  const share = (network: "x" | "linkedin") => {
    trackProductEvent(publicId ? "public_report_shared" : "blueprint_shared", context);
    const url = encodeURIComponent(window.location.href); const message = encodeURIComponent(text);
    window.open(network === "x" ? `https://x.com/intent/post?text=${message}&url=${url}` : `https://www.linkedin.com/sharing/share-offsite/?url=${url}`, "_blank", "noopener,noreferrer");
  };
  async function copy() { await copyToClipboard(window.location.href); setCopied(true); trackProductEvent(publicId ? "public_report_shared" : "blueprint_shared", context); window.setTimeout(() => setCopied(false), 1600); }
  return <div className="public-actions" aria-label={`${title} actions`}>
    <Link className="button primary" href={buildHref} onClick={() => trackProductEvent("blueprint_remix", context)}>Build your version <ArrowRight size={17} /></Link>
    <button className="button secondary" onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy link"}</button>
    <button className="icon-action" aria-label="Share on X" onClick={() => share("x")}><Share2 size={16} /> X</button>
    <button className="icon-action" aria-label="Share on LinkedIn" onClick={() => share("linkedin")}><Linkedin size={16} /></button>
  </div>;
}
