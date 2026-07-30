"use client";

import { useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";

export function SalesForm(): React.ReactNode {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(formData: FormData) {
    setBusy(true); setMessage(null);
    const response = await fetch("/api/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(formData)) });
    const result = await response.json();
    setMessage(response.ok ? "Thanks—we’ll reply within one business day." : result.error ?? "Could not send the inquiry.");
    setBusy(false);
  }
  return <form action={submit} className="sales-form"><input name="website" className="honeypot" tabIndex={-1} autoComplete="off" aria-hidden="true" /><div><label>Name<input name="name" required minLength={2} maxLength={100} placeholder="Your name" /></label><label>Work email<input name="email" type="email" required maxLength={180} placeholder="you@company.com" /></label><label>Team / cohort size<select name="teamSize" defaultValue="11-50"><option>2-10</option><option>11-50</option><option>51-200</option><option>200+</option></select></label></div><label>What are you planning?<textarea name="message" required minLength={10} maxLength={1200} placeholder="Tell us about the cohort, team, or launch." /></label><button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />}{busy ? "Sending" : "Talk to sales"}</button>{message ? <p>{message}</p> : null}</form>;
}
