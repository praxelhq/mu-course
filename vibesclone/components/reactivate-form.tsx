"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, LoaderCircle, XCircle } from "lucide-react";

export function ReactivateForm({ token, valid }: { token: string; valid: boolean }): React.ReactNode {
  const [state, setState] = useState<"ready" | "busy" | "done" | "error">(valid ? "ready" : "error");
  async function reactivate() { setState("busy"); try { const response = await fetch("/api/newsletter/reactivate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }); setState(response.ok ? "done" : "error"); } catch { setState("error"); } }
  const done = state === "done"; const error = state === "error";
  return <section className="unsubscribe-state">{done ? <CheckCircle2 /> : error ? <XCircle /> : <CheckCircle2 />}<h1>{done ? "You’re back on the list." : error ? "This confirmation link is not valid." : "Rejoin the build digest?"}</h1><p>{done ? "You’ll receive useful product blueprints and builder lessons again." : error ? "The link may be incomplete. No subscription setting was changed." : "Confirm this only if you requested to re-subscribe this email address."}</p>{state === "ready" || state === "busy" ? <button className="button primary" disabled={state === "busy"} onClick={reactivate}>{state === "busy" ? <LoaderCircle className="spin" size={16} /> : null}{state === "busy" ? "Confirming" : "Confirm re-subscription"}</button> : <Link className="button secondary" href="/">Back to VibesClone</Link>}</section>;
}
