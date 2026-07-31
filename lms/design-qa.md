# Data Race visual QA

- Source target: `/Users/pushpak/.codex/generated_images/019faf2a-3b60-7390-a00a-b9085b68eeaa/exec-5b9a9663-3174-4e20-8cb2-e77f47f2e15c.png`
- Implementation route: `/layout-test/data-race-projector`
- Intended viewport: 1280 × 720, 1× density
- State: Section A, question 4 of 10, leaderboard, ten named students

## Iteration history

1. Reduced the leaderboard to the top ten and tightened row/header spacing so it fits a 1280 × 720 projector without vertical clipping.
2. Kept the existing LMS Parchment/Pine/Ochre tokens, square borders, and typography while adding rank movement, accuracy, average time, streak, and score.
3. Added a development-only deterministic fixture for repeatable visual inspection.
4. Confirmed the fixture returns HTTP 200 locally. The selected in-app browser cannot reach the host loopback or LAN address in this environment, so a same-frame screenshot comparison could not be captured without switching to an unapproved browser.

## Final result

blocked — automated screenshot comparison is blocked by the selected browser's network boundary; layout checks continue through build, static inspection, and the deterministic fixture.
