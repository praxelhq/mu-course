# Sessions 3–5 classroom-readiness receipts

These receipts are release controls, not retrospective notes. A green Railway deployment does not open a class. For each section, the operator may open the parent session page and start-of-session materials only when the matching receipt is current, signed, and bound to the exact deployed build, assessment manifest, and data/fixture release. Timed reveal and submission gates still follow the authored run of show.

## Lifecycle

1. Copy the relevant template without the `.template` suffix.
2. Record evidence, failures, repairs, owners, UTC/IST timestamps, source-check dates, manifest hashes, deployed source SHA, Railway deployment/image identity, and schema head.
3. Mark each gate `PASS`, `FAIL`, or `NOT RUN`; a required `NOT RUN` is a failure.
4. Instructor and release operator sign independently.
5. The receipt expires after a material source/manifest/build change, a failed canary, or the stated T-7 window.

Never paste private TrustMRR rows, answer keys, credentials, raw Make logs, private webhook URLs, prompt logs, or matched detector strings into a receipt. Reference a roster-gated object ID and checksum instead.

## Required status vocabulary

- `Authored`: package exists; no release claim.
- `Validated`: all deterministic, LMS, accessibility, privacy, and current-source checks in the receipt passed.
- `Rehearsed`: the live and fallback classroom paths passed with named operators.
- `Released`: the signed receipt authorised one section's ordered gate set.

Sessions 3, 4, and 5 may release independently after shared platform controls pass. A later session may remain locked.
