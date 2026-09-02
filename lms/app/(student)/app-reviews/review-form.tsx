"use client";

import { useState } from "react";
import { APP_REVIEW_INSTRUCTION, APP_REVIEW_RUBRIC, reviewSchema, wordCount, type StudentAppReview } from "@/lib/app-reviews/policy";
import styles from "./reviews.module.css";

type ReviewState = { ready: boolean; open: boolean; required: number; completed: number; blocked: number; reviews: StudentAppReview[] };

async function command(body: unknown) {
  const response = await fetch("/api/app-reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? "Your review could not be saved. Please retry.");
  return result;
}

export function AppReviews({ initial }: { initial: ReviewState }) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function start() {
    setBusy(true); setError("");
    try { setState(await command({ action: "start" })); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not load your apps. Retry shortly."); }
    finally { setBusy(false); }
  }
  return <main className={styles.page}>
    <p className={styles.eyebrow}>Session 4 · Review studio</p>
    <h1>Try the app. Raise the bar.</h1>
    <p className={styles.lead}>Review five other students’ Lovable apps. Test each product, score what you can observe, and leave feedback its creator can act on.</p>
    <div className={styles.notice}><strong>{APP_REVIEW_INSTRUCTION}</strong><p>Review completion is recorded separately. Peer scores will be considered for a future component of the app score; no weighting is applied yet.</p></div>
    <section className={styles.progress} aria-label="Review completion">
      <strong>{state.completed} / {state.required}</strong><span>reviews completed{state.completed === state.required ? " · You have completed the requirement." : " · Each review needs three scores and a comment of at least 20 words."}</span>
    </section>
    {state.blocked > 0 && <p role="alert" className={styles.notice}>{state.blocked} assignment(s) are unavailable after a roster or privacy change. Contact your instructor before requesting remaining apps. Your existing review evidence is retained.</p>}
    <details className={styles.rubric} open>
      <summary>Scoring rubric · 1 to 5</summary>
      <p>Use 2 or 4 when the evidence falls between anchors. Judge usability and meaningful working features, not your preferred style, paid features, or the number of screens.</p>
      <div className={styles.rubricGrid}>{APP_REVIEW_RUBRIC.map((dimension) => <section key={dimension.key}>
        <h2>{dimension.label}</h2>
        {([1, 3, 5] as const).map((score) => <p key={score}><strong>{score} / 5</strong> — {dimension.anchors[score]}</p>)}
      </section>)}</div>
    </details>
    <section className={styles.guide}><h2>Before you score</h2><ol>
      <li>Open the app and identify the task it promises to help someone complete.</li>
      <li>Try the main flow, a second feature, and an empty or invalid input. Check a narrow/mobile layout when possible.</li>
      <li>Describe what you tried, one strength, and one specific improvement. Do not put names or personal details in your comment.</li>
    </ol><p>The LMS hides creator names, email addresses, briefs, and other reviewers’ scores. An external app may still reveal its creator. Do not try to identify them or coordinate scores.</p>
      <p>Do not pay, share personal data, connect accounts, or make real transactions to test an app. If access is blocked or the app cannot be tested safely, report the problem below instead of guessing scores. Your instructor can assign a replacement.</p>
    </section>
    {!state.open ? <p className={styles.notice}>{state.ready ? "App peer review is closed or not yet open for your section. Your saved reviews are retained. Ask your instructor about the review window." : "Your instructor is preparing the app review pool. Check back once your section is open."}</p>
      : state.reviews.length === 0 ? <button className={styles.primary} disabled={busy || state.blocked > 0} onClick={start}>{busy ? "Assigning apps…" : "Get my five apps"}</button>
      : state.reviews.map((review) => <ReviewCard key={review.id} review={review} onSaved={(saved) => setState((previous) => {
        const reviews = previous.reviews.map((row) => row.id === saved.id ? saved : row);
        return { ...previous, reviews, completed: reviews.filter((row) => row.completedAt).length };
      })} />)}
    {state.open && state.reviews.length > 0 && state.reviews.length < 5 && <button className={styles.primary} disabled={busy || state.blocked > 0} onClick={start}>Request remaining apps</button>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </main>;
}

function ReviewCard({ review, onSaved }: { review: StudentAppReview; onSaved: (review: StudentAppReview) => void }) {
  const [scores, setScores] = useState({ visual: review.visual, functionality: review.functionality, overall: review.overall });
  const [comment, setComment] = useState(review.comment || review.accessIssue || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const count = wordCount(comment);
  const complete = !!review.completedAt;
  async function save(action: "submit" | "report") {
    setBusy(true); setError(""); setNotice("");
    try {
      await command(action === "submit" ? { action, reviewId: review.id, review: { ...scores, comment } } : { action, reviewId: review.id, comment });
      if (action === "submit") {
        onSaved({ ...review, ...scores, comment: comment.trim(), completedAt: new Date().toISOString() });
        setNotice("Review submitted. Thank you for the specific feedback.");
      } else {
        onSaved({ ...review, accessIssue: comment.trim() });
        setNotice("Access problem reported. This does not count as a completed review. Your instructor will help or assign another app.");
      }
    } catch (error) { setError(error instanceof Error ? error.message : "Your feedback was not saved. Please retry; your text is still here."); }
    finally { setBusy(false); }
  }
  return <section className={styles.card} aria-labelledby={`title-${review.id}`}>
    <div className={styles.cardHead}><h2 id={`title-${review.id}`}>App {review.slot}</h2><span>{complete ? "Submitted" : review.accessIssue ? "Access problem reported" : "To review"}</span></div>
    <a className={styles.openLink} href={review.appUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Open anonymous app {review.slot} ↗</a>
    <form onSubmit={(event) => { event.preventDefault(); void save("submit"); }}>
      <div className={styles.scores}>{APP_REVIEW_RUBRIC.map((dimension) => <fieldset key={dimension.key} disabled={busy || complete}>
        <legend>{dimension.label}</legend><div className={styles.rating}>{[1, 2, 3, 4, 5].map((score) => <label key={score}>
          <input type="radio" name={`${review.id}-${dimension.key}`} value={score} checked={scores[dimension.key] === score} onChange={() => setScores((previous) => ({ ...previous, [dimension.key]: score }))} required />{score}
        </label>)}</div>
      </fieldset>)}</div>
      <label className={styles.commentLabel} htmlFor={`comment-${review.id}`}>Your feedback · at least 20 words</label>
      <textarea id={`comment-${review.id}`} rows={5} maxLength={5000} value={comment} disabled={busy || complete} onChange={(event) => setComment(event.target.value)} aria-describedby={`count-${review.id}`} placeholder="I tested… What worked was… One improvement would be…" required />
      <p id={`count-${review.id}`} aria-live="polite">{count} words{count < 20 ? ` · ${20 - count} more needed` : " · minimum met"}</p>
      {!complete && <><p className={styles.muted}>Check your scores before submitting. Submitted reviews are final.</p><div className={styles.actions}>
        <button className={styles.primary} type="submit" disabled={busy || !reviewSchema.safeParse({ ...scores, comment }).success}>{busy ? "Saving…" : `Submit review ${review.slot}`}</button>
        <button type="button" disabled={busy || count < 20} onClick={() => void save("report")}>Report access problem</button>
      </div></>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <p role="status">{notice}</p>
    </form>
  </section>;
}
