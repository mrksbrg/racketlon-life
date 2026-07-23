# Curated portrait style

Curated player portraits belong in `men/` and `women/`, named after the slug in
the player's content cue ID. For example, `name:jon-spinks:GBR` uses
`men/jon-spinks.png`.

## Visual standard

- Canvas: 128 x 128 PNG, optimized and below 64 KB where practical.
- Style: deliberately coarse 1990s 16-bit sports-game pixel art. Use hard
  colour steps, a limited palette, and visible square pixel clusters; avoid
  smooth or painterly rendering.
- Background: flat muted blue-grey `#5F7782` with no gradient, texture,
  vignette, border, props, flag, or text.
- Kit: use a clean national-colour design based on the player cue's country.
  Keep the design readable at 128 px and consistent between players from the
  same country.
- Likeness: use supplied player photos only as reference material; retain
  distinctive, player-approved visual cues such as glasses, cap, hair length,
  beard, and hairstyle.

If no curated file exists, the application uses the deterministic procedural
portrait renderer as the fallback.

## Canonical kit references

When generating a kit for an existing country, use an established portrait from
that country as the visual reference rather than inventing a new variation.

- Great Britain: `men/duncan-stahl.png` — deep navy, white collar, and narrow
  red/white shoulder piping.
- Finland: `men/henrik-mustonen.png` — white base, deep-blue collar and
  shoulder panels, and white piping. Do not turn the shirt into a literal flag
  cross.
