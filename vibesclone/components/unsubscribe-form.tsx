"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, LoaderCircle, XCircle } from "lucide-react";

export function UnsubscribeForm({ token, valid }: { token: string; valid: boolean }): React.ReactNode {
  const [state, setState] = useState<"ready" | "busy" | "done" | "error">(valid ? "ready" : "error");
  async function unsubscribe() { setState("busy"); try { const response = await fetch("/api/newsletter/unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }); setState(response.ok ? "done" : "error"); } catch { setState("error"); } }
  const done = state === "done"; const error = state === "error";
  return <section className="unsubscribe-state">{done ? <CheckCircle2 /> : error ? <XCircle /> : <CheckCircle2 />}<h1>{done ? "You’re unsubscribed." : error ? "This unsubscribe link is not valid." : "Leave the build digest?"}</h1><p>{done ? "No more digest emails will be sent to this address. You can subscribe again whenever you choose." : error ? "The link may be incomplete or already replaced. No account or project data was changed." : "This only stops the optional build digest. Account, purchase, and service messages are unaffected."}</p>{state === "ready" || state === "busy" ? <button className="button primary" disabled={state === "busy"} onClick={unsubscribe}>{state === "busy" ? <LoaderCircle className="spin" size={16} /> : null}{state === "busy" ? "Unsubscribing" : "Unsubscribe"}</button> : <Link className="button secondary" href="/">Back to VibesClone</Link>}</section>;
}
