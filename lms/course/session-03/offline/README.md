# Session 3 offline pack source

This source produces the no-notebook/no-LMS fallback. The tracked files contain no TrustMRR rows or answer values.

- `session-03-local-runner.py` — checksum-bound gzip JSONL runner.
- `offline-answer-sheet.md` — numbered, answer-free recovery sheet.
- `offline-lab.html` — keyboard/print-friendly instructions.

At release, the build copies these files into `lms/output/session-03/offline/` and creates a checksum manifest. A private section folder adds the gated peer file plus the precomputed output/trace generated in a clean runtime. The private output/trace never enters git or learner-open package previews before the assessment closes.
