# Publish, verify, and recover from Version 1 to Version 2

**Verified against Lovable docs:** 30 July 2026  
**Recheck at T-7:** [pricing](https://lovable.dev/pricing), [credits](https://docs.lovable.dev/introduction/credits-and-usage), [Plan mode](https://docs.lovable.dev/features/plan-mode), [Publish](https://docs.lovable.dev/features/publish)

## The credit reality

As currently documented:

- Lovable Free grants **5 daily build credits, up to 30 per month**;
- daily build grants expire at the end of the day and do not roll over;
- Plan mode costs one credit per message;
- Build mode is usage-based and varies by work/complexity;
- publishing from the Publish dialog is free even at zero build-credit balance;
- asking the agent to publish via chat is standard chat usage and consumes credits.

Therefore, ten calendar days do **not** imply fifty usable credits. The class uses one Plan message, direct plan editing, a frozen core, targeted repairs and the Publish dialog.

## Version 1 publish flow

1. **Scrub the app.** Search visible pages and seeded data for real emails, tokens, private data, TrustMRR row data and benchmark branding.
2. **Check the disclosure.** Public footer states independent educational build and non-affiliation.
3. **Open Publish.** Use the top-right Publish dialog, not a chat request.
4. **Review the security scan.** Stop for critical findings; capture any warning that remains and explain it.
5. **Choose an original URL.** Use a student/product name, not `liinks-clone`, `trustmrr-copy`, or a confusing benchmark variant.
6. **Publish.** From the editor, generate the app’s sanitised public share URL and copy the resulting `.lovable.app` link with its profile payload.
7. **Open incognito.** Confirm the edited fictional name and enabled blocks load without editor access. Lovable Free/Pro publication is externally public to anyone with the link, so only dummy data belongs there.
8. **Run the smoke tests.** AT-01, AT-04, AT-07, AT-11, AT-12, AT-14, AT-16 and AT-17 are the minimum live pass.
9. **Capture evidence.** Record URL, timestamp, viewport, PASS/FAIL/NOT RUN, one mobile screenshot, one analytics screenshot and known limitations.
10. **Submit V1.** Do not wait for perfection. A truthful V1 with named failures is stronger evidence than a polished untested URL.

## Publish verification card

```text
VERSION: V1
PUBLISHED URL:
PUBLISHED AT (IST):
PUBLIC IN INCOGNITO: Yes / No
MOBILE 390 PX: Pass / Fail
CORE TESTS: __ / 15 pass
ACCESS TESTS: __ / 3 pass
CRITICAL SECURITY FINDINGS: 0 / describe
MOCK LABELS VISIBLE: Yes / No
REAL OR PRIVATE DATA PRESENT: No / describe and unpublish
KNOWN LIMITATION:
NEXT CHANGE:
```

## Version 1 → Version 2 rule

- Window closes **10 calendar days after that learner's recorded Version 1 receipt timestamp**; LMS stores the grant and exact expiry atomically with the receipt.
- V2 is a controlled new version of the same artifact, not a replacement that deletes V1.
- If V2 is submitted on time, the latest eligible version becomes the grading candidate; the instructor can inspect both versions and the change note.
- If no V2 is submitted, V1 remains the grading candidate without a resubmission penalty.
- A V2 can lower a raw score if it breaks a previously working requirement. Students should preserve a working V1 URL or rollback point.
- Outage or accessibility exceptions use the existing LMS exception flow; the student should not be asked to expose private data as proof.
- A verified monthly-cap exception may extend V1 to the first accessible build day after the account's displayed cap reset plus 24 hours. The ten-day V2 clock begins only when that delayed V1 is actually received. After receipt, only an explicit audited extension may alter the existing grant expiry.

## Ten-day recovery plan

The plan assumes scarce, non-rolling credits and deliberately avoids “spend five every day.”

| Window | Student action | Credit posture | Evidence |
| --- | --- | --- | --- |
| Day 0 | Publish and submit truthful V1; freeze test log | Use the Publish dialog; no feature requests after the final smoke test | V1 URL + baseline tests |
| Day 1–2 | Read grader/peer feedback; choose one failed core test and one access/craft issue | No Lovable message yet; write the repair contract first | Two-item V2 backlog |
| Day 3–5 | Send one targeted Build request naming the failed AT IDs; test locally | Variable Build cost; stop if the fix branches into new scope | Delta test log |
| Day 6–8 | If credits remain, implement one user-visible enhancement from the approved backlog | One bounded request; no new integration | Before/after evidence |
| Day 9 | Regression test all core ATs and repair only a stop-the-line defect | Keep a reserve when possible; publishing itself is free | Full V2 test log |
| Day 10 | Publish changes from the dialog, verify incognito, submit V2 and change note | No chat-publish message | V2 URL + change note |

## V2 change-note template

```text
V1 URL:
V2 URL:
V2 published at:

Feedback selected:
1.
2.

Changes made:
- [AT-__] before → after
- [AT-__] before → after

Regression result:
- Core: __ / 15 pass
- Publish/access: __ / 3 pass

Credits used (observed, not estimated):
- Plan messages:
- Build messages and displayed cost:

What remains mocked or incomplete:
What I would build next and why:
```

## When public and editor state disagree

Lovable publishes a snapshot; later editor changes are not automatically live. Open Publish and choose **Publish changes**, then repeat the incognito check. Never submit an editor preview link as the public app.

## If the student hits zero build credits

Save the first prompt, student-approved plan, current URL and test log first. Use the Publish dialog to publish the best working state if it is safe. Then distinguish the two cases; “zero today” is not enough information.

### Daily grant exhausted, monthly cap not reached

If a safe V1 exists:

1. Submit the safe V1 on time with the named limitation.
2. Write the next repair as an AT-specific request before the next daily grant.
3. Use the ordinary ten-day V2 path. Unused daily credits do not roll over.

If no safe V1 exists, the instructor records `daily-credit-no-safe-v1`. Submit the completed plan and AT-01–18 test contract now, then submit V1 within 24 hours of the first observed next daily grant. There is no penalty for this audited vendor-access exception. The ten-day V2 window begins only when that V1 is actually received; it does not begin from the in-class plan submission.

### Monthly cap reached

A new daily grant may not become usable the next day. Do not promise it.

1. Instructor records only `monthly-credit-cap` and the workspace’s displayed reset date/time; never collect billing screenshots, account credentials or private billing data.
2. If the course-provisioned fallback starter has passed the release test that copying/restoring it is student-owned and consumes **zero** build credits, give the learner that starter and require the same edits/tests/evidence. Do not use an instructor-owned shared published URL as the learner’s artifact.
3. If that zero-credit restore path has not been validated, the learner completes the contract, student-edited fallback plan, peer-verifier role and test design in class. The LMS records a tool-access exception rather than pretending they shipped.
4. Set the personal V1 deadline to 24 hours after the first accessible build day following the displayed monthly-cap reset. When V1 is actually received, let that transaction create the one V2 grant expiring ten calendar days later.
5. If the reset still grants no usable build access, extend through the first observed post-reset grant and record the vendor-state timestamp. Do not spend a version number on an inaccessible attempt.

No branch requires a paid plan, alternate account, credential sharing or teammate submission.

## If the published app contains real/private data

Unpublish immediately, record only that a privacy incident occurred (not the exposed value), notify the instructor, remove the data, republish, and rotate any exposed credential. A screenshot containing the secret is not acceptable evidence.
