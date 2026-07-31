# VibesClone motion direction

## Intent

Show the product's actual promise in one glance: a public URL becomes a verified product map, then an ordered build sequence. The motion should feel precise and useful, not decorative.

## Visual identity

- Background: near-black `#090b0d`
- Panels: cool graphite `#0e1114` and `#12161a`
- Foreground: warm paper `#f4f0e7`
- Accent: acid green `#c7ff22`
- Typography: Geist for statements and Geist Mono for evidence, status, and sequence labels
- Geometry: thin rules, compact radius, edge-anchored panels, asymmetric composition

## Motion grammar

The hero visual has four scenes: source captured, logic mapped, understanding approved, prompts ready. Each transition is a short directional push with overlapping opacity changes; entrances are slower than exits. The visual breathes between scenes, avoids ambient zoom, and uses transforms/opacity only. Reduced-motion mode resolves immediately to the final scene.

The interactive workflow below the hero uses the same state order but advances only after the visitor activates Analyze. It is an honest product preview, not a fake backend request.

## Accessibility and performance

- No meaning depends on color alone.
- Status text is available to assistive technology.
- `prefers-reduced-motion` disables automatic scene motion.
- No encoded GIF/video payload is required; the browser-native composition stays crisp at every viewport and uses the existing application fonts.
