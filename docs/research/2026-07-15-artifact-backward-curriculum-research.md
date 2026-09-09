# Artifact-Backward Curriculum Research

**Research date:** 15 July 2026  
**Course:** Masters' Union PGP — Applied AI for Business, Course 1  
**Scale:** 20 hours, 480 students, eight sections  
**Status:** Structural research brief, before session design

> **Superseded architecture notice (17 July 2026):** this document preserves the evidence used to challenge the original artifact list. Its Venture Studio and universal-looking clone/app/film/article chain are not the current course contract. Decisions D-013 and D-014 replace them with two work modes and three universal objects: decision evidence brief, role-authentic AI operating prototype, and recruiter case page/proof pack. See [Decision Log](../course/DECISIONS.md) and [Course Concept](../course/course-1-concept.md).

## What is frozen—and what is not

The following set is frozen as the investigation boundary:

1. an AI clone;
2. a student-authored skill;
3. a deployed workflow;
4. a deployed application used by at least five people;
5. a Git repository containing the work;
6. an AI-generated ad video, including AI image work;
7. an evidence-led, data-bearing long-form business article using web extraction;
8. a pre/post AI maturity assessment.

The briefs are **not** frozen by their first wording. Each artifact must earn its place by teaching transferable capability, creating an authentic moment of agency, resisting superficial completion, and producing evidence a recruiter can trust. “Famous personality,” “five users,” “entirely AI,” and “Ken-style” are therefore hypotheses to specify, not grading criteria to copy literally.

## Executive conclusion

The right structure is not eight projects and not ten topics. It is **three studios supported by two continuous rails**:

1. **Intelligence Studio — make AI know something:** research, scraping, data, context engineering, RAG, prompting, voice, and the clone.
2. **Systems Studio — make AI repeat and act:** skills, tool use, APIs, workflow automation, human approval, logging, and failure recovery.
3. **Venture Studio — make something people choose to use:** application building, deployment, analytics, user testing, multimodal persuasion, and the ad.
4. **Evidence Rail — make the work inspectable:** Git, provenance, evals, checkpoints, decision logs, and clean-room tests.
5. **Growth Rail — make learning measurable:** parallel pre/post performance missions plus self-calibration.

This changes the portfolio from a gallery of AI outputs into a credible story:

> I can investigate an unfamiliar market, ground an AI system in evidence, encode a repeatable method, connect it to real tools, ship a usable product, earn user behavior, communicate it persuasively, and show exactly how I tested and improved it.

The Build Fast/Maven character should remain dominant: visible builds, live expert feedback, templates that remove setup work, peer pressure, public demonstrations, and a strong “super-specific how.” Business-school cases should be short provocations that create a decision or constraint for a build, not substitute lectures.

## The learning problem hidden by polished artifacts

Generative AI separates **performance during assistance** from **learning and ownership**.

- In a 2026 randomized programming study, unrestricted ChatGPT and a scaffolded tutor both improved exercise scores and reduced frustration, but neither improved knowledge gains or code comprehension; only the scaffolded tutor improved intrinsic motivation. The authors call unrestricted answer-giving a “comfort trap.” See [Less stress, better scores, same learning](https://doi.org/10.1016/j.caeai.2025.100537).
- A field experiment with nearly 1,000 students found that a general GPT-4 interface improved practice performance but harmed later unaided exam performance; guardrails that withheld full answers mitigated the damage. See [Generative AI without guardrails can harm learning](https://doi.org/10.1073/pnas.2422633122).
- A randomized study of 120 undergraduates reported lower retention 45 days later for unrestricted ChatGPT-assisted study than traditional study. See [ChatGPT as a cognitive crutch](https://doi.org/10.1016/j.ssaho.2025.102287).
- Active learning remains a strong base: a meta-analysis of 225 undergraduate STEM studies found better performance and lower failure under active learning than lecture. See [Freeman et al.](https://doi.org/10.1073/pnas.1319030111).
- Maven's own instructional playbook emphasizes projects, peer feedback, expert guidance, and spending the majority of instructional attention on the “super-specific how,” rather than on broad what/why exposition. See [Projects in cohort-based courses](https://maven.com/resources/projects-in-cbc) and [Super Specific How](https://maven.com/resources/impactful-learning-super-specific-how).

Therefore every artifact requires two different tests:

| Test | Question | Weak evidence | Stronger evidence |
| --- | --- | --- | --- |
| Success | Does the artifact work? | polished screenshot, demo video, one happy-path run | live system, real task completion, held-out tests, execution history |
| Ownership | Does the student understand and control why it works? | prompt log, reflection written after the fact | prediction before generation, failure diagnosis, unseen modification, short defence |

The course must never confuse tool-produced fluency with student competence.

## Where durable student excitement will come from

The tools will supply initial spectacle, but the course should deliberately move motivation away from novelty. Research on an authentic, collaborative, scaffolded university project found that relevance, choice, collaboration, and available teacher support contributed to autonomy, competence, relatedness, and autonomous motivation. See [Fostering university students' autonomous motivation through a societal impact project](https://pmc.ncbi.nlm.nih.gov/articles/PMC11660546/). The implication is not unlimited choice; novices need bounded choices and reliable scaffolds.

The strongest excitement levers for this cohort are likely to be:

1. **Compression shock:** work that looked like a week becomes a credible first pass in minutes.
2. **Embodiment:** a researched system speaks back in a recognizable voice or a storyboard becomes moving media.
3. **Agency:** the student changes a mechanism and gets a predicted result, instead of hoping a prompt works.
4. **Identity shift:** a non-technical student sees themselves ship software, automation, and data work.
5. **External consequence:** a real user completes a task, rejects an ad, or exposes a defect.
6. **Visible mastery:** a system that failed a hidden test now passes because of the student's diagnosis.
7. **Social energy:** classmates attack, use, remix, and publicly demonstrate one another's builds.
8. **Career legibility:** the portfolio translates a classroom build into evidence for a role the student wants.

These levers imply bounded choice: students choose a domain, user, or proposition from a curated menu, while the technical path and evidence contract remain consistent across sections. Full freedom would create support chaos and make comparative validation weak; no freedom would turn every portfolio into the same tutorial clone.

## What creates a genuine “aha”

Novelty creates attention, but it is fragile. A useful aha moment occurs when a student gains **explanatory control**: they change a meaningful input, predict what should happen, observe a result, and can explain the mechanism.

The recurring learning loop should be:

1. **See the magic:** a five-minute result that feels professionally impossible.
2. **Commit a prediction:** students decide what the system will do before they run it.
3. **Open the hood:** the instructor changes one mechanism, not ten prompt adjectives.
4. **Build with scaffolds:** students complete a partially worked system.
5. **Break it on purpose:** the LMS injects a retrieval miss, malformed record, API failure, conflicting source, hostile user, or changed brief.
6. **Repair and explain:** students diagnose the failing layer.
7. **Transfer:** they handle an unseen variant with fewer scaffolds.
8. **Ship evidence:** the result, tests, and decision trail enter the repo and Praxy portfolio.

This is the course grammar. Individual two-hour sessions should later be designed from it; a calendar should not be invented first.

## Artifact verdicts at a glance

| Artifact | Transferable capability | Authentic aha | Easiest way to game it | Evidence of ownership | Structural verdict |
| --- | --- | --- | --- | --- | --- |
| AI clone | context engineering, RAG, evals, voice, identity safeguards | “The model's prior is not the same as my corpus; I can see and control the difference.” | upload public content into provided UI and judge by imitation | held-out questions, retrieval trace, contradictory update, abstention test, live change | Retain; heavily specify consent, grounding, and tests |
| Skill | codifying judgment as a reusable agent workflow | “A fresh session can reproduce my method without me re-explaining it.” | submit a long generic prompt or copied `SKILL.md` | trigger tests, held-out task, false-positive task, clean-session transfer | Retain; define it as tested reusable behavior |
| Workflow | event-driven orchestration across tools | “The system wakes up and acts without me opening a chat.” | import a template, run the happy path once | real executions, failure injection, retry, human gate, logs | Retain; deployment and failure handling are mandatory |
| Application | product framing, AI-assisted building, deployment, analytics, iteration | “A stranger used what I shipped—and failed somewhere I did not predict.” | beautiful landing page, friends opening a URL, outsourced build | five qualified task completions, telemetry, observed use, evidence-led release | Retain; replace vanity “users” with qualified use |
| Git repository | provenance, collaboration, reproducibility | “My work is replayable history, not a vanished chat.” | final-day file dump or fabricated cosmetic commits | checkpoint commits, reproducible setup, issue/change trail, provenance manifest | Retain as a continuous rail, not a standalone unit |
| AI ad video | multimodal direction, brand judgment, consistency, experimentation | “A coherent brief and asset system matter more than a clever one-shot prompt.” | one-click montage, template swap, untested spectacle | storyboard, asset/model ledger, brand audit, variant test with target users | Retain; grade persuasion and control, not percent AI |
| Business article | research design, extraction, data analysis, source judgment, argument | “The data changed my thesis; AI accelerated the desk but did not choose the truth.” | ask deep research to draft it, copy sources, fabricate citations | raw data, reproducible analysis, claim ledger, counter-evidence, defence | Retain; define “Ken-style” as evidence-led, not imitation |
| Maturity assessment | transfer, calibration, judgment under ambiguity | “I can now solve and diagnose an unseen problem, not merely name more tools.” | inflate self-ratings or memorize the first test | parallel performance tasks, process evidence, confidence calibration | Retain; self-report is secondary |

## Deep dive 1: the AI clone

### What it can genuinely teach

The clone is a high-energy vehicle for six different concepts:

1. model prior versus supplied context;
2. corpus selection and document quality;
3. chunking, embeddings, retrieval, and citations;
4. prompt hierarchy, persona boundaries, and abstention;
5. text-to-speech, latency, pronunciation, and conversational voice;
6. consent, disclosure, personality rights, and reputational risk.

RAG evaluation cannot stop at whether the final answer sounds right. The RAGAS research separates retrieval quality from the generator's ability to use the retrieved context faithfully; relevant dimensions include context precision/recall, faithfulness, and answer relevance. See [RAGAS](https://aclanthology.org/2024.eacl-demo.16/) and the broader [RAG evaluation survey](https://arxiv.org/abs/2405.07437).

### The designed aha

Give the base model a question about the personality, then add a document that directly contradicts the model's common prior. Ask again and expose the retrieved passages. The aha is not “it sounds like Steve Jobs.” It is: **the student can identify whether the answer came from model memory, retrieved evidence, or invented glue—and can change the system accordingly.**

A second aha occurs when identical words in text and synthetic voice are perceived differently. This opens a business discussion about presence, trust, persuasion, and the ethics of simulated identity.

### How students will game it

- choose a globally famous person with abundant training-set exposure, making the base model appear grounded;
- upload an off-the-shelf corpus without inspecting it;
- judge success by catchphrases, tone, or voice resemblance;
- use only obvious questions whose answers are in the first document;
- avoid questions that are absent, contested, time-sensitive, or unsafe;
- present a prerecorded demo so retrieval and latency are never tested live.

### The ownership test

Each clone should face a small held-out test set containing:

- answerable questions not shown during the build;
- questions for which the corpus has no answer;
- a pair of conflicting sources with dates;
- a prompt attempting to make the clone endorse a product or invent a personal opinion;
- a new document added after the first evaluation;
- one live change to an instruction or source followed by a predicted result.

The student submits retrieval traces, source citations, observed failures, and a 90-second defence of one design trade-off. A beautiful voice cannot compensate for failed grounding.

### Safety correction

“Clone a famous personality” cannot mean “publish an arbitrary living person's likeness and voice.” Delphi's own product illustrates the legitimate business model: the creator connects their content, fills gaps, and records their own voice to create a “Digital Mind.” See [Delphi](https://www.delphi.ai/about).

Indian law and current platform duties make consent and labelling material course content, not a footnote:

- WIPO's account of the Arijit Singh case explains that Indian courts protected voice, likeness, style, and other personality attributes against unauthorized AI exploitation. See [WIPO](https://www.wipo.int/en/web/wipo-magazine/articles/ai-voice-cloning-how-a-bollywood-veteran-set-a-legal-precedent-73631).
- India's February 2026 IT Rules amendments address synthetically generated audio, visual, and audiovisual information, including labelling and metadata expectations for permissible synthetic content. See [PIB](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2245053&lang=2&reg=48) and [MeitY's FAQ](https://www.meity.gov.in/static/uploads/2025/10/065b6deb585441b5ccdf8be42502a49c.pdf).

The course should provide pre-cleared personality/content packs, use a consenting person, or use a clearly fictional composite. Every public artifact should disclose synthetic media. Voice cloning should be disabled for unapproved identities.

### Just-in-time tool and concept release

- first: base chat model, sources, system instructions, citations;
- then: corpus ingestion, chunks, embeddings, retrieval trace, vector store;
- then: test set and abstention behavior;
- only then: voice input/output and latency;
- finally: disclosure, consent record, and public deployment rules.

Do not introduce the vector database before students have seen a retrieval failure it solves.

### Business case

**Delphi versus unauthorized voice cloning:** when does a digital clone scale valuable expertise, and when does it appropriate identity? Students must define the product boundary, consent model, and failure policy before publishing.

## Deep dive 2: the student-authored skill

### What it can genuinely teach

A skill is not an elaborate prompt. It is a portable, inspectable operating procedure for an agent: when to trigger, required inputs, steps, resources, output contract, and completion checks. OpenAI describes skills as reusable workflows containing instructions, examples, code, and resources; a `SKILL.md` acts as the playbook. See [Using skills](https://openai.com/academy/skills/).

The deeper business capability is **codifying tacit judgment**. Students move from “I can get a good answer in my chat” to “another person or agent can apply my method consistently.”

### The designed aha

Run the same vague request in two clean sessions: one without the skill and one with it. Then hand the skill to a classmate who has never seen the build. The aha occurs when the second operator produces the expected structure and checks without a briefing from the author.

### How students will game it

- submit a generic mega-prompt that claims to do everything;
- copy an existing skill and change the nouns;
- make the trigger description so broad that it activates everywhere;
- include the answer to the known test inside the instructions;
- test in the original long conversation where hidden context makes it appear reliable;
- optimize formatting while the substantive judgment remains weak.

### The ownership test

Every skill needs:

- a narrow recurring job and named non-goals;
- at least two supporting resources or examples when the task requires them;
- three known tests and two held-out tests;
- a false-positive trigger test where it should **not** run;
- a clean-session run by a peer;
- one revision based on a documented failure;
- an author defence explaining why this should be a skill rather than a one-off prompt, workflow, or app.

### Just-in-time tool and concept release

- reusable job selection;
- trigger and input contract;
- worked example and output schema;
- resources/templates;
- tests and failure taxonomy;
- packaging, versioning, and sharing.

### Business case

**From expert labor to reusable institutional method:** OpenAI reports using hundreds of internal skills for tasks from evaluations to documentation and growth work. Students should debate which parts of a consulting, research, recruiting, or operations method are safe to codify—and which require accountable human judgment. See [Introducing the Codex app](https://openai.com/index/introducing-the-codex-app/).

## Deep dive 3: the deployed workflow

### What it can genuinely teach

The workflow introduces the difference between a chat response and an operating system:

- triggers and events;
- structured data passed between steps;
- APIs, credentials, and tool permissions;
- deterministic branches versus model decisions;
- human approval and escalation;
- retries, idempotency, logs, and cost/latency;
- measurement of a business outcome.

Anthropic distinguishes workflows, whose code paths are predefined, from agents that dynamically choose their steps; it recommends using the simplest pattern that meets the need and adding complexity only when it improves measured performance. See [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents).

### The designed aha

The first aha is temporal: a real event arrives and the student's system acts without a fresh prompt. The deeper aha is operational: when an API fails or the model produces low confidence, the workflow does not merely “be wrong”—it follows a designed fallback.

### How students will game it

- import a public n8n/Make template and rename nodes;
- trigger it manually with prepared data;
- show a single happy-path execution;
- hide failed runs and credentials problems;
- use the LLM for deterministic transformations that should be ordinary logic;
- omit approval and escalation so the demo looks autonomous;
- submit a canvas screenshot rather than an active workflow.

### The ownership test

Require:

- a real trigger and at least one real external action;
- a plain-language map of input, state, branches, outputs, and owner;
- several recorded executions, including at least one failure;
- a malformed-input or service-failure injection;
- retry or fallback behavior;
- a human approval point for a consequential action;
- explanation of one step deliberately kept deterministic;
- adaptation to an unseen input field or changed policy.

n8n's execution history supports loading previous execution data, fixing a workflow, and retrying with the saved or original workflow—exactly the debugging behavior the course should assess. See [n8n executions](https://docs.n8n.io/workflows/executions/all-executions/).

### Just-in-time tool and concept release

- trigger → transform → action;
- structured outputs and field mapping;
- HTTP/API basics and credentials;
- branching and state;
- LLM step only where ambiguity exists;
- approval, fallback, execution logs, and cost.

### Business case

**Klarna and the future of BPO:** Klarna initially reported that its assistant handled two-thirds of customer-service chats and work equivalent to 700 full-time agents. Its SEC filing later described 69% of chats and estimated cost savings, while subsequent reporting highlighted the continued need for skilled humans on complex cases. See [Klarna's release](https://www.prnewswire.com/news-releases/klarna-ai-assistant-handles-two-thirds-of-customer-service-chats-in-its-first-month-302072744.html) and [its SEC filing](https://www.sec.gov/Archives/edgar/data/2003292/000200329225000052/klarnagroupplc424b4.htm).

The build challenge should not be “make a customer-support bot.” It should be: **draw and implement the boundary between auto-resolution, agent augmentation, and human escalation, then measure failure.**

## Deep dive 4: the deployed application with real users

### What it can genuinely teach

AI-assisted application building lets non-engineers practise a post-MBA combination of product management and technical agency:

- identify a narrow user and job;
- specify observable acceptance criteria;
- decompose a build and direct an AI coding agent;
- use data, APIs, and deployment infrastructure;
- test, debug, secure, and instrument behavior;
- observe users and prioritize a release;
- communicate value and adoption evidence.

The learning target is not syntax mastery. It is maintaining a useful mental model while delegating implementation. Early studies of vibe coding show high accessibility and engagement, but also that beginners struggle to understand and judge AI-generated code; structured approaches use prompt logs, reflection, comprehension, and error correction rather than accepting execution as proof. See [Beginners struggle to understand LLM-generated code](https://ccs.neu.edu/~arjunguha/main/papers/zi-reverse-charlie.html) and [From code-centric to concept-centric](https://aclanthology.org/2026.teachingnlp-1.3/).

### The designed aha

The first visible aha is shipping software through language. The more important aha comes from user contact: a target user attempts the core job and fails, asks for something unexpected, or uses the product differently. Students discover that when code becomes cheaper, **problem selection, specification, trust, and distribution become more valuable—not less.**

### How students will game it

- ship a landing page or chat wrapper with no distinct job;
- count friends who opened a link as users;
- collect praise instead of observing task completion;
- hide generated code they cannot change;
- outsource the build to a technical classmate;
- avoid analytics, edge cases, privacy, and mobile behavior;
- invent user feedback after the release.

### Redefine “five real users”

A **qualified user** should:

1. match the declared target user or use case;
2. attempt the core task without the builder driving the interface;
3. generate a recorded outcome—completion, failure, time, or structured feedback;
4. consent to anonymized learning evidence;
5. not be counted merely for visiting, liking, or watching a demo.

Five users are enough for a formative learning loop, not market validation. The requirement should include at least one observed session and one release explicitly linked to the evidence. Five friends clicking a URL should score zero on adoption.

### The ownership test

- deployed URL and source;
- written target user, job, and acceptance test before building;
- five qualified task attempts with basic telemetry;
- one observed usability session;
- an issue created from evidence and a subsequent commit/release;
- a live change to a held-out requirement;
- explanation of data flow, major failure modes, and what the student would not deploy at scale;
- automated smoke test plus a short privacy/security checklist.

### Just-in-time tool and concept release

- problem and acceptance criteria before the builder opens;
- AI coding agent and starter repo;
- app state/data and API contracts;
- deployment;
- analytics and feedback capture;
- debugging and tests;
- privacy/security and release decisions.

### Business case

This is the course's product-management case rather than a company retrospective: **when production cost collapses, does the bottleneck move to discovery and distribution?** Students must show user behavior and an evidence-led iteration, not argue the point abstractly.

## Deep dive 5: the Git repository

### What it can genuinely teach

Git is the portfolio's evidence system:

- work survives outside a chat;
- the evolution of decisions is visible;
- collaborators can review and reproduce the work;
- generated assets have provenance;
- tests and failures sit beside the final artifact;
- a recruiter can inspect ownership rather than trust a claim.

GitHub-based education has been used to teach reproducibility, enable targeted feedback on commits, and expose an industrially relevant workflow. See [Using GitHub Classroom to teach statistics](https://doi.org/10.1080/10691898.2019.1617089).

### The designed aha

Roll a broken artifact back, compare two versions, or hand the repo to a clean environment that can reproduce the output. The aha is that a commit is not cloud storage; it is a reversible claim about what changed and why.

### How students will game it

- dump all finished files on the final day;
- create meaningless “update” commits;
- omit generated prompts, sources, test data, and workflow exports;
- copy another repository with history;
- include secrets or private user data;
- write a README that claims reproducibility without testing it.

### The ownership test

The repository starts before the first build and accumulates checkpoint commits. It should include:

- a recruiter-readable README and short portfolio index;
- source and deployment instructions;
- workflow exports and skill files;
- raw/processed data separation and a reproducible analysis;
- eval cases and results;
- a decision/failure log;
- an AI/tool/asset provenance manifest;
- no credentials, unlicensed media, or identifiable user evidence;
- at least one issue or change request linked to a commit;
- a clean-environment reproduction check.

Git should be assessed continuously. A final “GitHub session” would arrive too late and encourage artifact theatre.

## Deep dive 6: the AI-generated ad video

### What it can genuinely teach

The artifact can connect strategy and production:

- audience, insight, positioning, and offer;
- creative brief, script, storyboard, and shot list;
- image prompting, reference assets, composition, typography, and consistency;
- video generation, editing, sound, voice, pacing, and captions;
- brand constraints, synthetic-media disclosure, and rights;
- variant design and audience response.

“Entirely made with AI” is a useful constraint for exposure, but a poor quality criterion. The job-relevant capability is directing a coherent multimodal system under a business brief.

### The designed aha

Students first generate a one-shot “make an ad” clip and score its problems. They then use a locked audience insight, visual reference sheet, shot list, and continuity constraints. The aha is that **creative direction and systems of references outperform prompt cleverness**.

A second aha comes from audience testing: the technically impressive variant may lose to the one with a clearer offer.

### How students will game it

- submit an unrelated sequence of beautiful shots;
- use a ready-made CapCut template and swap the logo;
- optimize spectacle rather than persuasion;
- hide broken hands, text, continuity, and product representation behind quick cuts;
- create the storyboard after the video;
- use cloned voices, music, logos, or likenesses without permission;
- ask friends whether they “liked” it rather than test a message.

### The ownership test

- business brief and single-minded audience insight;
- storyboard/shot list created before final generation;
- image/reference board and explicit continuity rules;
- 15–30 second final ad with captions and disclosure;
- asset, model, voice, and music provenance;
- brand and factual-claim audit;
- two variants differing on one meaningful hypothesis;
- blind target-user response on recall, clarity, and intended action;
- regeneration under one changed brand constraint.

### Business case

Use a productive contrast rather than “AI ads are good/bad”:

- A 2025 *Marketing Science* field experiment with an Indian DTC company found GenAI-personalized WhatsApp video ads raised engagement by six to nine percentage points over personalized images and generic videos. See [Kapoor and Kumar](https://doi.org/10.1287/mksc.2023.0494).
- Coca-Cola's official holiday campaign used AI-generated images and video at brand scale, creating a useful debate about production efficiency, nostalgia, authenticity, and quality control. See [Coca-Cola's account](https://www.coca-colacompany.com/media-center/groundbreaking-digital-experience-and-films-fuse-holiday-heritage-with-cutting-edge-tech).

The business question is: **where does generative media create value—lower cost, scaled personalization, faster experimentation, or better creativity—and what evidence distinguishes them?**

## Deep dive 7: the evidence-led business article

### What it can genuinely teach

The article is the strongest vehicle for research and data judgment:

- frame a falsifiable business question and provisional thesis;
- search broadly, then privilege primary sources;
- extract public web data lawfully and preserve snapshots;
- clean, join, and interrogate data;
- distinguish evidence, calculation, inference, and speculation;
- seek disconfirming evidence;
- write a causal or strategic narrative without pretending certainty;
- make charts and claims reproducible.

“Ken-style” should be defined as **deeply reported, analytically sharp, evidence-led business narrative**. Students should not imitate proprietary voice, article structure, phrasing, or paywalled text.

### The designed aha

Students begin with a plausible thesis, scrape or assemble a dataset, and must publish what changed. The aha is that AI can create a research desk at extraordinary speed, but **the thesis earns credibility only when the student can trace every consequential claim to evidence and let the evidence change the story**.

### How students will game it

- use a deep-research product to create the draft and bibliography in one pass;
- cite search snippets or secondary summaries without opening sources;
- fabricate or distort citations;
- scrape a convenient dataset that cannot answer the question;
- cherry-pick a time range or metric;
- generate attractive charts from dirty data;
- use “according to reports” to hide weak sourcing;
- write the claim ledger after the article.

Research on AI-generated references makes this a real, current failure mode: one 2026 study found 3–13% hallucinated citation URLs across tested commercial models/agents and 5–18% non-resolving URLs overall. See [Detecting and correcting reference hallucinations](https://arxiv.org/abs/2604.03173). Data-journalism training, by contrast, emphasizes scraping, cleaning, analysis, visualization, ethics, and reproducible “show your work” practice. See [Columbia Data Journalism](https://data.journalism.columbia.edu/) and the [Associated Press guide](https://www.ap.org/the-definitive-source/products-and-services/digging-into-data-journalism/).

### The ownership test

- research question and pre-data thesis committed before analysis;
- source plan distinguishing primary, secondary, and lead-only sources;
- lawful extraction method, raw snapshot, timestamp, and data dictionary;
- reproducible cleaning/analysis in Sheets or a notebook;
- at least one original calculation or dataset-derived finding;
- claim ledger linking important claims to exact evidence;
- one serious counter-hypothesis and disconfirming source;
- chart source and transformation notes;
- citation liveness/support audit;
- oral defence of one claim selected by the evaluator;
- correction pass after adversarial peer review.

### Just-in-time tool and concept release

- research question and source hierarchy;
- browser/deep research as lead generation, not authority;
- extraction/scraping and legal/ethical constraints;
- Sheets/Python for cleaning and analysis;
- visualization and uncertainty;
- argument, counter-evidence, and claim ledger;
- fact-check and publication.

### Business case

**Chegg under AI search and free GenAI:** students should reconstruct what happened from filings and traffic/customer evidence, then test competing explanations rather than repeat “AI killed Chegg.” Chegg's 2025 10-K attributes headwinds to AI Overviews and GenAI adoption and reports 2025 workforce reductions totaling about 640 employees, or approximately 56% of its then-current workforce. See [Chegg's 2025 10-K](https://www.sec.gov/Archives/edgar/data/1364954/000136495426000021/chgg-20251231.htm).

This case naturally teaches research, scraping, time series, causal humility, business-model disruption, and source quality.

## Deep dive 8: the AI maturity assessment

### What it can genuinely measure

The diagnostic should measure course capabilities, not brand familiarity:

1. frame a business outcome and quality bar;
2. choose delegation versus human ownership;
3. create and manage context;
4. research and work with data;
5. design a reusable skill or workflow;
6. evaluate output and diagnose failure;
7. ship, instrument, and iterate;
8. handle privacy, consent, security, and business risk;
9. explain business value and limitations;
10. calibrate confidence.

Existing instruments can contribute items, but should not become the entire assessment. GLAT is a validated 20-item objective GenAI literacy test; it measures useful conceptual literacy but cannot prove a student can build or diagnose a system. See [GLAT](https://doi.org/10.1016/j.caeai.2025.100436).

### Why a normal pre/post survey fails

- students can inflate scores;
- novices often do not know what competent performance looks like;
- instruction changes their frame of reference, producing response-shift bias;
- identical tests reward memory and leak answers;
- confidence can increase while independent performance does not.

Reviews of self-assessment designs explicitly warn that training can change the standard students use to rate themselves. See [What type of self-assessment is best?](https://pmc.ncbi.nlm.nih.gov/articles/PMC11968623/).

### Recommended design

Use three layers:

1. **Objective literacy:** a short bank inspired by validated constructs, randomized across parallel forms.
2. **Performance mission:** pre and post use different but equivalent messy business cases. Students must frame, direct AI, verify evidence, and diagnose a seeded failure. Score the observable process with the same rubric.
3. **Calibration:** after each decision, students record confidence. Improvement includes better alignment between confidence and correctness, not merely higher confidence.

The pre-test should be low-stakes and partially hidden after completion. The post-test should test transfer with an unseen domain and changed surface details. Report individual growth cautiously and compare section-level distributions for course quality.

## The capability dependency map

Artifacts share capabilities. Teaching artifact by artifact would repeat some basics and omit the hard connective tissue.

| Capability | First experienced in | Reused in |
| --- | --- | --- |
| outcome framing and acceptance criteria | maturity mission / article question | clone, skill, workflow, app, ad |
| prompting and context hierarchy | research and clone | skill, workflow, app |
| source hierarchy and provenance | article | clone corpus, app claims, portfolio |
| extraction and data structure | article | RAG ingestion, workflow inputs, app data |
| RAG and retrieval evaluation | clone | research assistants, knowledge features in app |
| structured outputs and schemas | skill | workflow, app, validators |
| APIs, credentials, and permissions | workflow | clone voice, app, analytics |
| events, branches, and human escalation | workflow | app operations, customer support case |
| AI-assisted coding and debugging | small internal build | app, validators, portfolio site |
| deployment and observability | workflow | app, clone, analytics |
| multimodal direction | clone voice | video ad, app assets |
| evals and failure taxonomy | clone / skill | workflow, app, final defence |
| Git and provenance | before first build | every artifact |
| user evidence and iteration | workflow operator test | app and ad |
| consent, privacy, disclosure, security | clone | data, workflow, app, ad |

## How the portfolio can signal post-MBA ability

The Praxy portfolio should not present eight equal thumbnails. It should let a recruiter enter through the evidence most relevant to a role, then inspect the shared work trail.

| Role direction | Lead evidence | What the recruiter should be able to verify |
| --- | --- | --- |
| consulting / strategy | article, case decision, counter-evidence | frames an ambiguous question, works with data, distinguishes fact from inference, communicates a defensible recommendation |
| product / founder | application, qualified-user evidence, release decision | scopes tightly, ships, observes behavior, prioritizes from evidence, understands limits |
| operations / transformation | skill, workflow, execution logs | codifies a process, allocates human/AI work, integrates tools, handles exceptions, measures value |
| marketing / growth | video variants, audience response, app funnel | turns insight into a brief, directs multimodal production, tests a proposition, avoids brand slop |
| knowledge / sales / customer experience | clone, RAG tests, escalation design | grounds an interface in evidence, manages trust and identity, decides when AI should answer or hand off |
| any AI-native management role | Git/eval trail and maturity delta | owns AI-assisted work, exposes provenance, diagnoses failure, transfers the method to a new problem |

The public view can be elegant. The recruiter “proof view” should expose the original brief, key decisions, one failure-and-fix story, real-use evidence, and links into the repo. This makes the portfolio valuable without forcing a recruiter to inspect every prompt or commit.

## Recommended structural architecture

### Studio 1 — Intelligence: make AI know something

**Artifact flow:** business question → source trail → extracted data → analytical article → grounded clone → voice experience.

**Core capabilities:** research design, source hierarchy, scraping, data cleaning, prompting, context engineering, RAG, citations, evals, synthetic identity, disclosure.

**Anchor cases:** Chegg; Delphi and Indian personality rights.

**Primary aha:** better evidence and retrieval change the output more reliably than rhetorical prompting.

**Transfer challenge:** add a late, conflicting source and update both the article claim and clone behavior without breaking prior correct answers.

### Studio 2 — Systems: make AI repeat and act

**Artifact flow:** personal method → skill → clean-session test → event trigger → deployed workflow → failure handling.

**Core capabilities:** instruction design, schemas, tools/APIs, deterministic versus model decisions, orchestration, approval, retries, logs, cost, evals.

**Anchor case:** Klarna/BPO and the boundary between automation, augmentation, and escalation.

**Primary aha:** AI becomes organizational leverage when judgment is packaged and connected to events—not when prompts become longer.

**Transfer challenge:** a policy or input schema changes; the student must adapt the system and demonstrate that the fallback still works.

### Studio 3 — Venture: make something people choose to use

**Artifact flow:** target user/job → acceptance test → AI-assisted application → deploy → five qualified uses → evidence-led iteration → AI ad variants.

**Core capabilities:** product scoping, coding-agent direction, data/API basics, deployment, analytics, debugging, user observation, positioning, multimodal production, experimentation.

**Anchor cases:** Indian DTC personalized video experiment; Coca-Cola's AI holiday production.

**Primary aha:** code and content can become cheap while user insight, trust, and distribution remain scarce.

**Transfer challenge:** user evidence or a changed brand constraint forces a release; the student must decide what to change and prove it.

### Continuous Evidence Rail

Every meaningful build passes the same evidence protocol:

- commit the intent/prediction;
- build;
- record execution/result;
- inject or encounter failure;
- diagnose by layer;
- revise;
- run a held-out transfer test;
- commit the evidence and provenance.

Git, evals, the failure log, and the Praxy portfolio are not end-of-course administration. They are present from the first hour.

### Continuous Growth Rail

- performance baseline before tool instruction;
- short retrieval and misconception checks between studios;
- clean-room transfer checks after each studio;
- parallel unseen performance mission after the course;
- capability growth and confidence calibration shown on the Praxy profile.

## Contract for every future two-hour session

Before a session earns a place in the ten-session calendar, its lesson plan should answer these fields:

| Field | Required answer |
| --- | --- |
| business tension | What decision, risk, or operating trade-off makes the capability matter? |
| impossible demo | What will students see in five minutes that creates desire to learn the mechanism? |
| prediction | What must every student decide or write before the tool reveals the answer? |
| one mechanism | What controllable concept is the session primarily teaching? |
| tool unlock | Which capability slot appears now, and what observed problem made it necessary? |
| worked scaffold | What is already supplied so novices spend time on the decision rather than setup? |
| student build | What inspectable checkpoint will exist before the session ends? |
| injected failure | What plausible break will force diagnosis instead of celebration? |
| ownership test | What unseen change, clean-session run, or short defence proves control? |
| portfolio increment | What evidence enters Git/Praxy, and why would an employer care? |

A session that can only name a topic (“prompting,” “agents,” “AI ethics”) fails this contract. A session also fails if its build cannot be assessed independently of polish.

## The anti-gaming assessment system

No single mechanism will scale perfectly to 480 students. Use a layered system:

| Gaming path | Design response |
| --- | --- |
| template laundering | template is allowed; held-out adaptation and explanation are graded |
| one-prompt delegation | require prediction, intermediate evidence, and failure diagnosis |
| final artifact theatre | checkpoint commits and execution history begin in class |
| copied or outsourced build | clean-session/live modification and random oral defence sampling |
| fake users | qualified-task definition, basic telemetry, observed session, consented evidence |
| team passenger | individual checkpoints and individual held-out variant even if builds are paired |
| known-test overfitting | hidden/parallel cases and a changed requirement |
| invented reflection | reflections must reference timestamped executions, commits, and issues |
| AI grader agreeing with AI output | deterministic checks + rubric-bound model review + peer attack + human audit sample |
| credential/data leakage | automated secret/PII scan and publish gate |

The evaluator should not punish legitimate AI use. It should reward the student's ability to **specify, inspect, challenge, adapt, and own** AI-assisted work.

## Tool-release policy

Avoid a tool zoo. Each studio should have one supported golden path and an optional advanced lane.

| Capability slot | Golden-path candidates | Release condition |
| --- | --- | --- |
| chat/research/coding agent | Praxy plus one supported frontier model/Codex-style agent | from baseline, but scaffolded and logged |
| extraction | Praxy-provided scraper, Apify/Firecrawl-style service | after the research question and source plan |
| data | Google Sheets/Excel first; Python notebook as advanced lane | after raw data and dictionary exist |
| RAG/vector store | Praxy-managed ingestion/vector infrastructure | after students see base-model and retrieval failures |
| voice | Praxy-managed, consent-gated voice service | after the text clone passes grounding checks |
| skill | open `SKILL.md` package in the repo | after a recurring method is demonstrated manually |
| workflow | one managed n8n-style environment | after trigger/action are specified on paper |
| app | one AI coding path + starter repo + managed database/deploy | after target user/job and acceptance tests are committed |
| analytics | managed PostHog-style events or Praxy telemetry | before user recruitment, not after |
| images/video | one image model, one video model, one editor | after the creative brief and storyboard |

The supported stack should be frozen shortly before delivery, with pre-provisioned accounts, credits, test credentials, fallback assets, and a versioned instructor runbook. Tool choice can change; the capability and validator contracts should not.

## What the LMS/Praxy layer must do

This course cannot rely on file upload alone. The LMS should capture learning evidence while reducing facilitator load:

- issue section-specific case variants and hidden test cases;
- require a short prediction before revealing the build environment;
- create/attach repository checkpoints;
- receive workflow exports and execution logs;
- run mechanical validators for required files, URLs, citations, secret leakage, event payloads, and test results;
- collect qualified-user events and anonymized feedback;
- support peer adversarial review with assigned failure prompts;
- randomly select claims or components for a 90-second defence;
- display a facilitator heat map of common failure layers;
- publish only artifacts that pass consent, provenance, and privacy gates;
- show capability growth separately from completion badges.

Automated validators should verify observable facts, not pretend to grade strategic judgment. Human attention should go to sampled defences, ambiguous trade-offs, and feedback on the highest-value decisions.

## Feasibility at 20 hours and 480 students

Seven substantial output artifacts plus a diagnostic cannot all become portfolio-grade from scratch inside 20 total student-hours. Evenly divided, the visible outputs would receive less than three hours each before any common foundation, debugging, feedback, or user recruitment.

The architecture is feasible only if several of the following are true:

- 20 hours means live instruction, with meaningful build time outside class;
- Praxy supplies stable infrastructure, starter repositories, corpora, consent-cleared voice packs, APIs, deployment, analytics, and validators;
- the artifacts accumulate rather than restart from blank projects;
- class time removes setup and focuses on decisions, mechanisms, failures, and feedback;
- some outputs are credible v1 work samples, not production systems;
- user recruitment begins before the application is “finished”;
- advanced students receive extension challenges while novices use a fully tested golden path;
- mechanical evaluation is automated and expert review is sampled or concentrated at high-leverage gates.

Praxy can offer a curated challenge bank and invite high-quality student work to inform the venture, but a student's grade should not depend on solving a Praxy-specific problem. The portfolio and evidence infrastructure can be Praxy-native while project choice remains learner-relevant.

If 20 hours is the **entire** student effort, the set must either be integrated into one narrow product system or reduced in scope. Calling seven rushed outputs a portfolio would reproduce the artifact theatre this design is meant to prevent.

## Decisions this research recommends freezing next

1. **Freeze the three-studio/two-rail structure before session count.** It maps dependencies and portfolio meaning better than a ten-topic syllabus.
2. **Freeze success-versus-ownership as the assessment doctrine.** Every artifact needs both.
3. **Freeze cases as build provocations.** Chegg, Delphi/rights, Klarna/BPO, and AI advertising each create a concrete decision and mechanism.
4. **Freeze qualified use, not five visitors.** Completion, evidence, and iteration define the application requirement.
5. **Freeze a consent-cleared clone policy.** No unapproved living-person voice or likeness should be publishable.
6. **Freeze Git/evals/provenance as a continuous rail.** They cannot be retrofitted in the final session.
7. **Freeze a performance-based maturity benchmark.** Self-report should diagnose confidence and calibration, not certify competence.
8. **Freeze just-in-time tool release.** Students encounter a problem before being shown the abstraction that solves it.

## What remains deliberately open

- whether every output is individual or selected builds may be paired with individual ownership tests;
- whether the seven artifacts form one micro-venture, two connected portfolio systems, or three studio-specific projects;
- how much student work sits outside the 20 live hours;
- the exact golden-path tool stack and Praxy infrastructure contract;
- artifact ambition tiers for students with different technical starting points;
- session boundaries and timing;
- grading weights and the proportion of human audit/defence.

These decisions should follow the structural decision and real constraints. They should not be guessed to make a ten-row timetable look complete.
