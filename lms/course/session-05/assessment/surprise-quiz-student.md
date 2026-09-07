# Surprise quiz bank · Workflow control

**Quiz ID:** `quiz_s5_workflow-control`  
**Quiz version:** `S5-SQ-v1`  
**Items:** 8 single-answer multiple choice  
**Time:** 7 minutes  
**Score formula:** `correctOptionId matches ÷ 8 × 100`; retain the integer correct count and display the percentage to one decimal  
**If activated by the instructor:** counted surprise quiz; best three quiz percentages across the course count for 5%
**Answer release:** attempt receipt only at submit; score, correct options, rationales and item feedback release after the configured section delivery window closes

Choose the best answer based on business behavior, not the number of modules. Display order may shuffle; the stable option IDs remain unchanged and are the only scoring identity.

## `S5-Q01@1`

A webhook delivers the same paid-plan inquiry twice because the sender did not receive the first response. Which design most directly prevents two outreach actions?

- `S5-Q01-ROUTER-FIRST` — Put the outreach route first in the router  
- `S5-Q01-DELAY` — Add a five-second delay before outreach  
- `S5-Q01-IDEMPOTENCY` — Check a stable event idempotency key before outreach and record its state  
- `S5-Q01-RETRY-SUCCESS` — Retry the outreach module when it succeeds

## `S5-Q02@1`

A lead payload has an invalid email address. Consent is present. What should the workflow do?

- `S5-Q02-INVENT-EMAIL` — Invent a safe-looking address so the run succeeds  
- `S5-Q02-RETRY-INVALID` — Retry the same payload until the email becomes valid  
- `S5-Q02-QUARANTINE` — Quarantine the event with a validation reason and owner  
- `S5-Q02-BYPASS` — Send it down the warm-lead route without email

## `S5-Q03@1`

A temporary dependency times out while creating a draft. Which response best preserves the work without retrying forever?

- `S5-Q03-SKIP-SUCCESS` — Skip the bundle and mark the run successful  
- `S5-Q03-BOUNDED-RECOVERY` — Use bounded retry/incomplete execution, then assign manual recovery on exhaustion  
- `S5-Q03-DELETE-SOURCE` — Roll back and delete the source event  
- `S5-Q03-UNBOUNDED-LOOP` — Add a router route that always repeats the same module

## `S5-Q04@1`

A high-value enterprise lead must be approved before any outreach. Which flow is safest?

- `S5-Q04-SEND-THEN-NOTIFY` — Send outreach and notify the founder afterward  
- `S5-Q04-NOTIFY-AS-APPROVAL` — Notify the founder and treat the notification as approval  
- `S5-Q04-RECORDED-TRANSITION` — Store `pending_approval`, block outreach, then act only after a recorded approved transition  
- `S5-Q04-WAIT-ASSUME` — Wait ten seconds, then assume approval

## `S5-Q05@1`

Which statement correctly distinguishes a Make blueprint from a public scenario-sharing link?

- `S5-Q05-REVERSED-UPDATE` — A blueprint always updates; a public link is a fixed file  
- `S5-Q05-SNAPSHOT-DYNAMIC` — A blueprint is a point-in-time JSON export; the public link shows the latest saved scenario  
- `S5-Q05-LINK-HAS-CONNECTIONS` — A public link includes account connections; a blueprint does not  
- `S5-Q05-BLUEPRINT-ONLY-PUBLIC` — Only a blueprint can be viewed without a Make account

## `S5-Q06@1`

A classmate imports your Make blueprint. What must they still do before running it?

- `S5-Q06-NO-SETUP` — Nothing; connection credentials are inside the JSON  
- `S5-Q06-RECONNECT-TEST` — Recreate their own connections and any omitted dependencies, then test mappings  
- `S5-Q06-RENAME-MODULES` — Rename every module or Make will reject the file  
- `S5-Q06-CONVERT-PNG` — Convert the blueprint to PNG first

## `S5-Q07@1`

Two instant webhook events must be processed strictly in arrival order. What setting is most relevant?

- `S5-Q07-PROCESS-IN-ORDER` — Process data in order  
- `S5-Q07-PUBLIC-PAGE` — Enable the public scenario page  
- `S5-Q07-THUMBNAIL` — Add an image thumbnail  
- `S5-Q07-CONFIDENTIAL-LOGS` — Keep data confidential

## `S5-Q08@1`

Which gallery package is safest and most useful?

- `S5-Q08-RAW-PAYLOAD` — A canvas screenshot plus raw execution payload containing lead email  
- `S5-Q08-SAFE-PACKAGE` — A workflow PNG, optional safe official Make scenario link, redacted sample output, and limitation note  
- `S5-Q08-PUBLIC-WEBHOOK` — A public webhook URL so viewers can test the live trigger  
- `S5-Q08-GRADE-DATA` — The grading prompt, rubric score, and model confidence

## Learner release boundary

Do not expose answer IDs, right/wrong state, rationales or distractor feedback in the quiz payload, preview, search index or export before the delivery window closes. When multiple sections use `S5-SQ-v1`, the window ends only after the last scheduled participating section closes. A section-local release is allowed only when that section uses a distinct, non-reused quiz version.
