# VibesClone design direction

## Intent

Lead with evidence. The first screen answers "what already earns?" before it explains how VibesClone works. The site should read like a market index you can act on: dense where the data is, calm everywhere else.

References: canivibecodeit.com (mono data, verdict pills, a big search box, category chips, a revenue ticker) and vitalsmac.com (native-app calm, numbered sections, grey outer cards holding white inner lists, honest comparison tables).

## Visual identity

- Page `#f6f7f8`, surfaces `#ffffff`, secondary surface `#f1f3f5`
- Text `#14171c`, secondary `#3f4650`, muted `#6b737d`; rules `#e2e5e9` / `#cdd2d8`
- Accent: money green `#0e7a43` (soft `#e8f4ec`, line `#b9dcc6`). White text on the accent.
- Status: amber `#b86e00` for caution, red `#c2362f` for crowded or destructive
- Type: Space Grotesk for headings, Geist for body copy, JetBrains Mono for data, labels, navigation, and anything a builder would copy
- Geometry: pill buttons, 12–24px radii, one soft shadow token, no heavy borders

All colors are tokens on `:root` in `app/globals.css`; components never hard-code hex values.

## Patterns

- **Evidence table**: rank, monogram, name + one-line summary, mono category, right-aligned MRR, audience, competition pill. On phones it collapses to product + MRR.
- **Competition pill**: "Open field" (green), "Some rivals" (amber), "Crowded" (red). It counts earning startups in the category and is never a verdict on the user's idea.
- **Numbered sections**: a mono index (`01`…) above a Space Grotesk heading and a one-paragraph lede.
- **Comparison card**: a grey outer card with a white inner list; the VibesClone column uses a check for wins and a dash for honest losses.
- **Honesty rule**: every revenue number is TrustMRR-verified, links to its source, and carries the snapshot date. We show the base rate (most startups never reach $1k MRR) next to the success stories.

## Motion

Only two moving things: the revenue ticker (70s linear loop) and the interactive URL-to-sequence demo, which advances only after the visitor clicks Analyze. `prefers-reduced-motion` stops the ticker and resolves the demo instantly.

## Accessibility

- No meaning depends on color alone: pills carry words, and wins/losses carry icons.
- Tables are real tables inside a labelled, focusable scroll region.
- Focus rings use the accent color at 2px with an offset.
