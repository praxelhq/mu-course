# S03 Student Build Brief — The Interface That Knows Its Limits

**Asset ID:** `S03-STUDENT-BRIEF-v1.0`

## Role and stakes

Your stakeholder wants a grounded evidence interface for the S01 decision. One confident unsupported action could create customer, employment, financial, safety or reputational harm. Your job is to control the evidence pipeline, not make the model sound authoritative.

Use your approved S02 corpus or a pathway pack. You receive manifest/config/test shells, managed retrieval with visible passages, a hostile/conflicting hidden document, and a legitimate update.

## Mission

1. inventory 3–6 documents: owner, date/version, trust, allowed use, scope;
2. define user/job, permitted questions/actions, citation, precise abstention, disclosure, named escalation;
3. inspect retrieval for two smoke tests; never score answer prose alone;
4. build ≥8 expected-property cases: ≥2 answerable, ≥1 absent, conflict/time, injection, unsafe/authority, plus regression;
5. freeze baseline; predict hostile document impact; diagnose ingestion/retrieval/instruction-generation/citation/boundary; make narrow repair and rerun full set;
6. peer runs answerable + absent/unsafe held-out cases without coaching;
7. individually add a legitimate update, predict affected/stable cases and rerun three.

**Pass:** cited support, bounded partial abstention, explicit disclosure/authority, critical injection blocked, regression clean. **Safe state:** refuse/escalate with missing evidence. **Fail:** fluent unsupported answer, citation mismatch, hidden identity, document text treated as authority, or one happy-path demo.

Submit manifest, config/export or static rule sheet, cases/results/traces, v0/v1 diff, disclosure, peer/transfer records, provenance and recruiter receipt. Public output shows no raw sensitive/licensed corpus and carries independent-project/synthetic labels.

