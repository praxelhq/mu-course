# PRAXEL BRAND · BUILD REFERENCE (compact)

*Distilled from Praxel Brand Guidelines v4.0 for the LMS build. Copy into the repo as `docs/BRAND.md`. If a visual question isn't answered here, ask Praxel rather than improvising; the full v4 guidelines and QA manual exist.*

## Colors

| Token | Hex | Use |
| --- | --- | --- |
| Parchment | #FBF8F3 | Default background, everywhere. Never pure white (#FFFFFF) as a page background. |
| Ink | #1F1A14 | Default text. |
| Pine | #1E3A35 | Authority: primary buttons, headers on dark blocks, key numbers. THE primary action color. |
| Ochre | #C4581A | Accent: highlights, active states, one emphasis per view. Never the primary CTA color. |
| Beacon | #F0D478 | Sparingly: a single highlight chip or underline. Never touching the logo. |
| Sand | #EDE5D8 | 1px dividers and borders. This is how hierarchy is drawn (not shadows). |
| Charcoal | #5C5046 | Secondary text. |
| Clay | #9C8E82 | Tertiary text, labels. |
| Cream | #F5F0E8 | Text on Pine backgrounds. |

## Type

- Display / headlines: **Fraunces** (900 for heroes, 700 for card titles; italic 400 for a single emphasized word).
- Body / UI: **Geist** (400/500/700).
- Labels, numbers, code, eyebrows: **Geist Mono**, uppercase, letter-spacing ~0.14em, small sizes.
- Self-host or embed fonts; do not rely on third-party CDNs at runtime (classroom wifi reality).

## Rules (non-negotiable)

1. **0px border radius on everything.** No rounded corners, anywhere, including buttons, cards, inputs, avatars (square-crop).
2. **No gradients. No drop shadows for hierarchy.** Hierarchy comes from 1px Sand borders, spacing, and type scale.
3. One Ochre emphasis and at most one Beacon moment per view. Restraint is the style.
4. Dark blocks use Pine with Cream text, used for authority moments (a hero, a key stat), not as a general dark mode.
5. Status colors: keep semantic states (success/warn/error) muted and bordered rather than filled and loud; error text may use a deep red (#8A2D22-ish) but never neon.
6. Praxel and Praxy are separate identities; this platform is Praxel's. The lighthouse logo's beacon and tower never change colour; the wordmark is never retypeset.
7. Voice in UI copy: plain, direct, warm. No exclamation marks in system messages. No "Oops!". Say what happened and what to do next.

## Feel

Premium field guide, not SaaS dashboard. Generous whitespace, big honest numbers in Geist Mono, Fraunces headlines, calm Parchment surfaces. A student should feel they're inside a well-made course, not a ticketing tool.
