# Session 8 — Brain + Hands

This package turns RAG and MCP into one understandable build:

1. The existing voice agent is the **mouth and ears**.
2. The MU RAG simulator gives it a **brain grounded in PraxelPay policy**.
3. The Make scenario gives it one **safe hand**: classify a lead and prepare a draft.
4. Five RAG checks and seven Make baseline cases expose the system's known boundaries. A real Make import and MCP call are still required before class.

## Open first

Open `session-08-rag-mcp-instructor.html`. It is the complete projector deck and instructor talk track. Press the right arrow to advance, `N` for notes, and `F` for full screen.

## Classroom files

- `knowledge/praxelpay-current-policy.txt` — authoritative current evidence
- `knowledge/praxelpay-outdated-policy.txt` — deliberate version conflict
- `knowledge/praxelpay-untrusted-note.txt` — deliberate prompt-injection test
- `fixtures/rag-eval-cases.json` — five grounded-answer checks
- `make/praxelpay-safe-lead-tool.blueprint.json` — importable Make scenario
- `fixtures/mcp-tool-test-cases.json` — seven deterministic baseline checks
- `make/IMPORT-AND-CONNECT.md` — short Make setup instructions

## Outcome

By the end, students should be able to explain and demonstrate this chain:

`user asks → retrieve evidence → answer with evidence → call a bounded tool → inspect the returned result`

They are not expected to build a production vector database or a production write-enabled agent in this session.
