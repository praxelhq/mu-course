# Session 05 workflow gallery contract

**Surface:** login-gated Forge workflow wall  
**Purpose:** show useful, reproducible operating systems without exposing grades or private data  
**Eligibility:** latest finalised, privacy-cleared workflow submission only

## Card anatomy

| Element | Source | Rule |
|---|---|---|
| Thumbnail | `workflowPngFile` | required PNG; readable module/state labels; scrubbed |
| Title | `workflowTitle` | 40–80 characters; result, not tool list |
| Result | `gallerySummary` or instructor caption | one sentence: trigger → control → outcome |
| Identity | student + team/product/industry | no personal contact details |
| Tags | pack, capability, product/industry | controlled vocabulary |
| Limitation | `limitationChange` excerpt | visible when material to safe reuse |
| Primary action | `scenarioShareUrl` | **Clone in Make** only after safe-link validation |
| Secondary action | `sampleOutputFile` | **View sample output** in LMS viewer/download |

## PNG contract

- PNG only for the gallery thumbnail.
- Recommended canvas: 1600 × 900 (16:9); minimum readable at 1280 × 720.
- Course upload target: 10 MB or less even if the platform supports more.
- Capture the scenario canvas only: no browser/account chrome, connection popovers, webhook URL, email, team/workspace name, execution payload, or credential label.
- Use descriptive module labels and route labels; do not depend on red/green alone.
- Keep text legible at the card’s expanded view.
- Supply `accessibilityDescription`: trigger, major branches, safeguards, outcome, and limitation in 80–180 words.

## Clone action

When `scenarioShareUrl` passes URL safety and privacy review:

- label button **Clone in Make**;
- open in a new tab with safe external-link behavior;
- add helper copy: “View without login; sign in to copy. Recreate your own connections.”;
- never imply the copy is production-ready;
- keep the assessed blueprint private and roster-gated.

Because the public URL always shows the latest saved scenario, prefer a connectionless copy held in an instructor-controlled gallery Make account. A student-owned dynamic URL requires a recorded review time, a no-post-review-save attestation, and immediate withdrawal/re-review after any change. A one-time privacy pass is not permanent approval for future saved versions.

When no safe, controlled public scenario URL exists:

- withhold the clone action;
- keep the blueprint available only to its owner and authorised instructors as private assessment evidence;
- show neutral helper copy: “Clone link unavailable. View the redacted sample output instead.”

Never link a webhook trigger URL, scenario editor URL, Make connection page, or private organisation URL.

## View sample output action

The redacted sample-output artifact must be 2 MB or less so Forge can decode and screen the complete file locally before any provider call. The run-log artifact uses the same 2 MB ceiling; oversized text evidence fails closed instead of being truncated.

- label **View sample output**;
- open a roster-gated modal/viewer or authenticated download;
- show fixture/version, final states, action counts, and key result;
- strip source PII, credentials, private company data, raw prompts, grades, confidence, and flags;
- state whether timeout evidence was live or replayed;
- offer a text/table equivalent for images.

## Publication gate

Automated checks:

- required PNG/output exist and approved MIME/size;
- link uses HTTPS and safe-fetch/allow rules;
- blueprint parses and is below 2 MB;
- no obvious secret/PII patterns in extractable text;
- latest finalised version only.

Instructor checks:

- public page logged-out preview is safe;
- claim matches evidence;
- image readable and has equivalent text;
- limitation is not hidden;
- featuring is appropriate.

If unsafe, withhold the link/file and show a neutral “Artifact under privacy review” state. Never silently publish because the workflow received a high grade.

## Prohibited gallery payload

No grade, percentage, rubric dimension, PCI, model confidence, flags, prompt/prompt log, raw feedback, private evidence, connection metadata, credential, customer/company PII, private webhook URL, or TrustMRR row-level data.
