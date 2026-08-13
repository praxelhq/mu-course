"use client";

import { useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { track } from "@/components/analytics/clarity";

export function NewsletterForm({ source }: { source: string }): React.ReactNode {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  async function submit(formData: FormData) {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/newsletter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: formData.get("email"), source, website: formData.get("website") }) });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        const reactivation = String(payload.confirmation ?? "").startsWith("reactivation-");
        setMessage(payload.confirmation === "existing" ? "You’re already on the list." : reactivation ? "Check your inbox to confirm re-subscription." : payload.confirmation === "delayed" ? "You’re in. Email confirmation is delayed, but your place is saved." : "You’re in. Check your inbox for confirmation.");
        if (!reactivation) track("newsletter_signup");
      }
      else setMessage(payload.error ?? "Could not subscribe.");
    } catch {
      setMessage("Could not subscribe. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  return <form className="newsletter-form" action={submit}><input name="website" className="honeypot" tabIndex={-1} autoComplete="off" aria-hidden="true" /><label><span>One useful teardown each week. No invented urgency.</span><div><input name="email" type="email" required placeholder="you@company.com" /><button disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />}{busy ? "Joining" : "Get the digest"}</button></div></label>{message ? <p>{message}</p> : null}</form>;
}
