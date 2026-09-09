# Course 1 Quiz Design and Coverage Matrix

**Version:** 0.1  
**Role:** Retrieval and diagnosis support applied work; quizzes never substitute for artifact evidence.

## Quiz types

| Type | Purpose | Timing | Typical length | Stakes |
| --- | --- | --- | ---: | --- |
| Baseline literacy | diagnose starting concepts and judgment | pre-course | 14 items | low |
| Entry ticket | retrieve a prerequisite required for today's build | before selected sessions | 2–3 items | completion/readiness |
| In-lesson check | catch a misconception before independent work | immediately before build decision | 1–2 items | formative |
| Delayed retrieval | strengthen and measure retention | 24–72 hours after session | 3 items | low |
| Studio gate | confirm judgment before next dependency | after Sessions 3, 5, 8 | 4–6 items plus applied check | graded lightly or mastery gate |
| Post literacy | parallel measurement of the same constructs | end of course | 14 items | summative report |

## Item contract

Every item stores:

- item ID, version and staleness-review date;
- outcome/capability ID;
- purpose and cognitive demand;
- stream/context and parallel-form family;
- prompt and response format;
- answer/scored properties;
- rationale and why each distractor is plausible but wrong;
- difficulty and expected time;
- feedback after response;
- accessibility note;
- pilot statistics and disposition.

Tool-interface trivia, trick wording, product pricing/features, unsupported cultural assumptions, and items with multiple defensible answers are prohibited.

## Ten-session delayed-retrieval matrix

Each session bank requires at least two parallel forms. The contexts rotate so every stream appears in the live or reserve bank; the construct stays common.

| Session | Item 1 | Item 2 | Item 3 | Common misconception targeted |
| --- | --- | --- | --- | --- |
| 1 Find the leverage | identify a decision-ready brief | distinguish outcome from AI feature | choose missing evidence/non-goal | “Use AI” is a business problem |
| 2 Evidence engine | rank source authority/recency | audit a claim/calculation | respond to contradiction | citations make a claim true |
| 3 Make AI know | classify base-model vs retrieval failure | choose citation/abstention behavior | reject identity/injection risk | more context always improves answers |
| 4 Package judgment | choose trigger/non-trigger | repair input/output contract | diagnose a generic copied skill | a long prompt is a reusable skill |
| 5 Make the system act | allocate deterministic/model/human step | choose approval/escalation | diagnose duplicate/timeout behavior | automation quality equals happy-path speed |
| 6 Ship the right prototype | select role-authentic form | cut scope to one core task | choose evidence event/log | every AI project should be an app/chatbot |
| 7 Task attempts/reliability | distinguish attempt from vanity use | prioritize from observed friction | choose safe response to incident | five clicks equal validation |
| 8 Communicate for the role | trace evidence to stakeholder action | choose claim/disclosure rule | select valid variant test | AI polish equals persuasion |
| 9 Recruiter proof | choose 60–90 second proof order | separate public/private evidence | detect affiliation/provenance problem | recruiters will inspect everything |
| 10 Operate under pressure | diagnose changed layer | choose repair/decline | communicate limit and next test | confident completion is better than safe stop |

## Stream/context rotation

| Session bank | Form A context | Form B context | Reserve/retake context |
| --- | --- | --- | --- |
| 1 | Consulting/FOCOS | Product/Marketing | Finance |
| 2 | Finance/Data | Consulting | Marketing/Ops |
| 3 | HR policy | Sales knowledge | Operations SOP |
| 4 | Product method | IB diligence | HR manager support |
| 5 | Operations exception | Sales approval | Corporate Finance close review |
| 6 | Marketing test system | Data surface | VC diligence assistant |
| 7 | Product usability | HR challenge | Consulting client exception |
| 8 | Marketing ad | FOCOS board note | Data executive story |
| 9 | Sales candidate | Finance candidate | Operations candidate |
| 10 | cross-stream operator | advisor/investor | alternate unseen pack |

## Scoring and feedback

- Delayed checks: three points; immediate equivalent retry after feedback.
- For a three-item lesson bank, use discrete bands: **3/3 ready**, **2/3 developing—targeted repair before Form B**, **0–1/3 facilitator support plus repair before Form B**.
- Do not translate one three-item bank into a nominal 70%/80%/90% threshold; its attainable scores are 0%, 33%, 67%, and 100%.
- Ninety percent across the cumulative delayed-retrieval checks indicates retrieval mastery.
- A quiz score cannot compensate for failed applied evidence or unsafe action.
- Repeated low results trigger a private facilitator signal, never public ranking.
- Answer explanations reveal the rule and mechanism, not hidden assessment fixtures.

## Example item format

### S05-A-02 — Human approval boundary

- **Outcome:** C5
- **Purpose:** delayed retrieval
- **Demand:** apply
- **Context:** Sales
- **Difficulty/time:** medium, 60 seconds
- **Prompt:** An account-research workflow finds a prospect signal, drafts a message, and proposes a discount. Which step most clearly requires accountable human approval before any external action?
- **Options:**
  - A. Extracting the public company name into a structured field.
  - B. Classifying the signal into a pre-approved category.
  - C. Sending the personalized message and discount to the prospect.
  - D. Logging the workflow run with a correlation ID.
- **Correct:** C.
- **Rationale:** External communication and a commercial concession create relationship, claim, consent and pricing consequences; a seller must verify and approve them.
- **Distractors:** A and D are deterministic record operations; B can be automated within a tested taxonomy and confidence/escalation rule. They remain monitored but are not the clearest consequential approval point.
- **Feedback:** “Place human accountability immediately before the consequential external action—not vaguely somewhere in the workflow.”
- **Accessibility:** no color/spatial dependency; plain-language commercial term.

## Item-quality review

Before release:

- two reviewers independently answer every item;
- any disagreement triggers rewrite, not debate with students;
- parallel forms are compared for evidence volume, reading load, defect visibility and cognitive demand;
- scenario facts and answer rules are source-checked;
- tool/vendor items are isolated and dated;
- no stream appears only as a risky or low-status context;
- post-pilot review checks difficulty, discrimination, distractor function, completion time, omitted response and differential performance by section/stream where sample size permits;
- retired items remain versioned and are never silently changed inside a live form.
