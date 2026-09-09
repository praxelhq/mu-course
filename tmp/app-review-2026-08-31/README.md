# App submission reviews — 31 August 2026

Source: [Artifacts](https://docs.google.com/spreadsheets/d/1gC0GLSt7enHRt37rJiGEF5LFcB0ZMq7uElMIL9j6e7o/edit?gid=1321808381#gid=1321808381).

Delivery: [App Reviews 31 Aug 2026](https://docs.google.com/spreadsheets/d/1gC0GLSt7enHRt37rJiGEF5LFcB0ZMq7uElMIL9j6e7o/edit?gid=1831082026#gid=1831082026).

The source contains 412 submissions at rows 2–413. Every submission is retained, including repeated links. The original tab is read-only throughout this task. No LMS grades are changed.

## Rubric

- **Visual /10:** observed hierarchy, readability, composition, consistency and screen design. Where authentication blocks the product, this score covers only the visible public interface.
- **Functionality /10:** observed navigation, input-aware results, completed core interactions and persistence. Rough anchors: 1–2 minimal/broken; 3–4 mainly mock or disconnected; 5–6 partial; 7–8 working core with gaps; 9–10 unusually complete.
- **Overall /10:** a holistic assessment of concept and execution, not an arithmetic average of the first two scores.
- **N/V:** not verifiable. Access gates, unavailable deployments or unresolved review-tool limitations are not assigned a fabricated zero. Overall is withheld when core functionality cannot be assessed.
- **Feedback:** a concrete strength and the most useful next expectation. “One-shot” or “first pass” describes observed disconnected, insufficiently tested work; it is not a claim about actual prompt count or time spent.

## Review boundaries

Reviewers inspected visible screens and exercised safe core flows where accessible, using synthetic or explicitly labelled demo data. Individual `tested` and `limitations` fields are part of the review: “Reviewed” is not a claim that every possible state, browser background behavior, integration, or multi-user combination was exhaustively verified.

No purchases, real bookings, payments, external messages, institutional account creation, or acceptance of platform terms were required for this review. Camera, microphone, location and sensitive personal data were not granted to student apps. Domain-specific accuracy and third-party claims were not independently certified.

Native date and time entry sometimes changed a visible field without committing application state. Those failures were separated from app defects. Supplementary Chrome tests recovered several date-dependent core flows; these supersede the initial assessments.

Identical normalized URLs receive the same final scores and feedback from the combined evidence. Original names, emails, section labels and submitted links are preserved independently for each submission row.

## Files

- `source.json`: original formatted source snapshot.
- `batch-*.json`: reviewer checkpoints, before final calibration.
- `supplemental-*.json`: subsequent browser verification that supersedes the initial record.
- `consolidate.py`: coverage, identity and score validation; duplicate reconciliation; final export.
- `reviews-final.json`: final calibrated review records.
- `sheet-values-final.json`: exact rectangular Google Sheets payload.
- `app-reviews-final.csv`: portable copy of the same rows.
- `calibration-audit.json`: supplemental overrides and duplicate score decisions.
- `evidence*/`: screenshots, visible DOM snapshots and review notes.
- `verification-final.json`: delivery readback and original-source preservation checks, written after delivery.
