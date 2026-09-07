"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ImportResult = { applied: boolean; added: number; unchanged: number; errors: { row: number; reason: string }[] };
export function AppReviewControls({ sections, issues }: {
  sections: { id: string; code: string; state: string }[];
  issues: { id: string; reviewer: string; appUrl: string; comment: string; slot: number }[];
}) {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [checkedCsv, setCheckedCsv] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function run(body: unknown) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/instructor/app-reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Operation failed.");
      if ("applied" in payload) { setResult(payload); setCheckedCsv(csv); }
      else setMessage("Saved.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Operation failed. Please retry."); }
    finally { setBusy(false); }
  }
  const button = { minHeight: 44, padding: ".5rem .8rem", margin: ".25rem", border: "1px solid var(--pine)", background: "var(--parchment)", color: "var(--pine)", cursor: "pointer" };
  return <>
    <section style={{ border: "1px solid var(--sand)", padding: "1rem", margin: "1.5rem 0" }}><h2>Prepare the review pool</h2>
      <p>Upload a CSV export of the supplied Sheet’s <strong>Artifacts</strong> tab, or a CSV with <code>email,section,appUrl</code> columns. Only email/verified alias, section and public HTTPS app URL are imported. Lovable and other public app hosts are supported. Names and private briefs are not shown to reviewers.</p>
      <p>Select one final app per student. Invalid URLs, duplicate students and roster mismatches block the entire import. Existing snapshots are never overwritten. This does not modify the Sheet or the original LMS submissions.</p>
      <label>Artifacts CSV <input type="file" accept=".csv,text/csv" disabled={busy} onChange={async (event) => {
        const file = event.target.files?.[0]; setResult(null); setCheckedCsv(""); setCsv("");
        if (!file) return;
        if (file.size > 2_000_000) { setMessage("CSV must be smaller than 2 MB."); return; }
        setBusy(true);
        try { setCsv(await file.text()); setMessage(""); } catch { setMessage("Could not read the file. Try again."); }
        finally { setBusy(false); }
      }} /></label>
      <div><button style={button} disabled={busy || !csv} onClick={() => void run({ action: "import", csv, apply: false })}>Validate import</button>
        <button style={button} disabled={busy || !csv || checkedCsv !== csv || !result || result.errors.length > 0 || result.applied} onClick={() => void run({ action: "import", csv, apply: true })}>Import validated apps</button></div>
      {result && <div role="status"><p>{result.applied ? "Imported" : "Preview"}: {result.added} new apps, {result.unchanged} unchanged, {result.errors.length} errors.</p>
        {result.errors.length > 0 && <><p>No rows were written. Correct these data-record numbers (excluding the header), then validate again:</p><ul>{result.errors.map((error, i) => <li key={i}>Record {error.row}: {error.reason}</li>)}</ul></>}
      </div>}
    </section>
    <h2>Section review windows</h2><p>Opening checks that every student can receive five distinct other apps from their own section. Students request their stable assignments on the App Reviews page. Closing prevents new assignments and scores but keeps all saved evidence.</p>
    <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>{sections.map((section) => <div key={section.id} style={{ border: "1px solid var(--sand)", padding: ".75rem" }}>
      <strong>Section {section.code}</strong> · {section.state}<br />
      <button style={button} disabled={busy || section.state === "open"} onClick={() => void run({ action: "gate", sectionId: section.id, state: "open" })}>Open {section.code}</button>
      <button style={button} disabled={busy || section.state === "closed"} onClick={() => void run({ action: "gate", sectionId: section.id, state: "closed" })}>Close {section.code}</button>
    </div>)}</div>
    <h2>Access reports</h2>{issues.length === 0 ? <p>No pending access reports.</p> : issues.map((issue) => <article key={issue.id} style={{ border: "1px solid var(--sand)", padding: "1rem", margin: "1rem 0" }}>
      <p><strong>{issue.reviewer}</strong> · App {issue.slot} · <a href={issue.appUrl} target="_blank" rel="noopener noreferrer">Inspect app</a></p>
      <p style={{ overflowWrap: "anywhere" }}>{issue.comment}</p><p>Verify the report before replacing. The original report is retained; a replacement does not count as completion.</p>
      <button style={button} disabled={busy} onClick={() => void run({ action: "replace", reviewId: issue.id })}>Assign an unused replacement</button>
    </article>)}
    <p role="status" style={{ overflowWrap: "anywhere" }}>{busy ? "Saving…" : message}</p>
  </>;
}
