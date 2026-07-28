# COURSE CONTEXT FOR THE LMS BUILD

*Condensed from COT v3.0 (the frozen course outline). This is what the LMS needs to know about the course it serves. The full outline lives with Praxel; ask if a detail here seems insufficient.*

## The course in one paragraph

"AI for Business: The Operating Stack." 10 sessions × 2 hours, 8 sections (A–H) of 50–60 students, 480 total, at Masters' Union. Each section splits into 8 teams of 6–8. Each team claims one real industry (no industry repeats anywhere across the cohort; 64+ unique sectors) and, inside it, engages one real company: maps the industry end to end (the "value chain map"), maps a real process at the company, and builds one automation per member, which must receive a documented thumbs-up from the company contact. Students also build individual artifacts session by session. Everything lands on a portfolio that eventually feeds Praxy, Praxel's careers platform.

## The 10 sessions and what each needs from the LMS

| # | Session | LMS needs |
| --- | --- | --- |
| 1 | Kickoff: the Heist simulation, team formation, sector claim, surprise DPDP quiz | Team + sector recorded; the DIAGNOSTIC quiz (see scoring doc §6: never student-visible in history); external launcher links (Heist simulator, sector tracker sheet) |
| 2 | AI basics: research, CO-STAR prompting, SCENE image framework, skills, projects, connectors, tokens, model comparison | Submission: "skill family" artifact |
| 3 | Working with data using AI (two datasets, five labs) | Materials hub with sealed mid-class file release; submission: verified data memo; possible surprise quiz |
| 4 | Build an app with Lovable | Submission: app link + GitHub link; gallery: app wall |
| 5 | Automation with Make.com | Submission: workflow (blueprint JSON + screen recording); gallery: workflow wall |
| 6 | Multimedia (guest lecture) + mid-course value chain map checkpoint presentations; 10-day break follows | Team submission: map checkpoint (formative, unscored); peer review checkpoint 1 |
| 7 | RAG, custom models, how to keep up | Progress submissions |
| 8 | MCPs, AI evals, operating AI-first | Progress submissions; AI voice interview window opens after this session |
| 9 | Capstone presentations, half the teams | Final map + artifact submissions (first half) |
| 10 | Capstone presentations conclude | Final submissions (second half); peer review checkpoint 2; cohort atlas distributed |

## The artifact set (initial AssignmentTypes; the set evolves, so types are data not code)

Individual: skill family (S2), data memo (S3), Lovable app + GitHub (S4), personal automation (S5), portfolio (rolling). Team: value chain map (checkpoint S6, final S9/10), company-approved workflow with sign-off evidence, media pieces (jingle / ad / poster), article. Voice interview: individual, after S8.

## Assessment (detail in 01_scoring_methodology.md; that doc wins on any conflict)

Seven components: value chain map 15 (team × PCI), artifact quality 15, workflow usefulness 15 (team × PCI, sign-off worth 40/100), AI interview 15, peer contribution 10, surprise quizzes best-of-3 5, portfolio 25. Grades are internal to the LMS; Praxy receives artifacts and validation badges, never numbers.

## People and naming

Praxel: Pushpak Teja (Product & Tech) and Ashwin Prasad (GTM), instructors and admins. Students sign in with their Google accounts against an imported roster (name, email, section). "Sections" are A–H; "teams" live inside sections; "sectors" are the industries teams claim.

## Sensitive build notes

1. The Session 1 DPDP quiz is diagnostic and secretly unscored; students must never be able to detect this. Implementation requirements are in the scoring doc §6 and the build prompt's data model. Do not mention this behaviour in any student-facing surface, help text, or FAQ.
2. Company engagement materials (process maps, sign-off recordings) may contain a real business's information; they are never public, gallery items excluded unless explicitly featured by an instructor.
3. India's DPDP Act applies, and the students are literally taught it in Session 1: minimal collection, consent copy on interview recording, export/delete tooling for admins.
