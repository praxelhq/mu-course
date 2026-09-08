"use client";

import { useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";

export function SponsorForm(): React.ReactNode {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  async function submit(formData: FormData) {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/sponsor-interest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(formData)) });
      const payload = await response.json().catch(() => ({}));
      setMessage(response.ok ? "Thanks. Our team will review the fit and get back to you." : payload.error ?? "Could not send your note.");
    } catch {
      setMessage("Could not send your note. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  return <form className="sponsor-form" action={submit}><input name="website" className="honeypot" tabIndex={-1} autoComplete="off" aria-hidden="true" /><div><label>Name<input name="name" required minLength={2} /></label><label>Work email<input name="email" type="email" required /></label></div><div><label>Company<input name="company" required minLength={2} /></label><label>Website<input name="websiteUrl" type="url" required placeholder="https://" /></label></div><label>Why does your product fit builders?<textarea name="audienceFit" required minLength={10} maxLength={1200} placeholder="What you make, who it helps, and what a useful placement would offer." /></label><button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />}{busy ? "Sending" : "Join the partner list"}</button>{message ? <p>{message}</p> : null}</form>;
}
