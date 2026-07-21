# FIR import pipeline

Turns the private FIR scraper's output into the committed, open-source
`data/world-bundle.json` — the real-player roster the game seeds its world
from (docs/05).

## Privacy boundary

The **scraper stays private** (separate repo, not here). Its *output CSVs* are
fine to open-source, but they enter this repo only as **gitignored inputs** in
`packages/content/import-data/`. The only committed artifact is the derived
`data/world-bundle.json`. The game build never references the scraper.

## Regenerating the bundle

1. Copy the scraper's output into `packages/content/import-data/`:
   - `ratings_men.csv`, `ratings_women.csv` — per-player, per-sport Glicko
     (`{tt,bd,sq,te}_{rating,rd,cons,games}`; `te` = tennis → game `tn`).
   - `players.csv` — `player_id, display_name, country, gender, birth_year, guid`.
   - `ranking_players.csv` — `guid, name, country, gender, birth_year, member_id,
     rank, points, total_points, tournaments, source_category`. Real FIR
     ranking points, for tournament division placement (docs/07) — bridged to
     `player_id` via the shared `guid` column on `players.csv`. Uses `points`
     (what `rank` is actually sorted by), not `total_points`. Most rated
     players won't appear here at all (no FIR-counted result yet) — that's
     expected, not an error; they default to the lowest division.
2. From `packages/content/`, run:
   ```
   npm run build:world
   ```
3. Commit the updated `data/world-bundle.json`.

## Manually reviewing portrait cues

Portrait corrections live in the committed `data/portrait-cues-men.json` and
`data/portrait-cues-women.json` sidecars, keyed by the exact stable `playerId`
from `world-bundle.json`. They are not put in the scraper CSVs, so rebuilding
ratings never overwrites your visual work. For example, a women's entry is:

```json
{
  "name:pauline-cave:FRA": {
    "skinPalette": "skin-03",
    "hair": "ponytail",
    "hairPalette": "dark-brown",
    "eyes": "focused",
    "facialHair": null,
    "accessory": null
  }
}
```

Every field is optional. Omitted fields keep their stable generated value. Use
`"accessory": null` to guarantee no glasses/accessory and
`"facialHair": null` to guarantee no facial hair. An empty `{}` cue entry is
invalid. `npm run build:world` validates that every sidecar id still exists in
the newly imported roster, belongs to the file's gender, and occurs in only one
file. It fails instead of silently losing or overwriting a correction.

Version 1 understands these manual values:

- `head`: `round`, `oval`, `square`, `long`, `heart`, `diamond`, `broad`, `narrow`
- `skinPalette`: `skin-01` through `skin-08`
- `hair`: `crop`, `side-part`, `swept`, `curly-short`, `buzz`, `shaggy`,
  `long-straight`, `long-wavy`, `ponytail`, `bun`, `receding`, `bald`
- `hairPalette`: `black`, `dark-brown`, `brown`, `light-brown`, `blonde`,
  `auburn`, `salt-and-pepper`, `grey`
- `eyes`: `calm`, `focused`, `bright`, `narrow`, `wide`, `soft`
- `accessory`: `round-glasses`, `square-glasses`, `sport-glasses`, `headband`,
  `earring`, `nose-stud`, or `null`
- `facialHair`: `stubble`, `moustache`, `goatee`, `short-beard`, `full-beard`,
  `chin-beard`, `soul-patch`, or `null`

Both files also accept `brows`, `nose`, `mouth`, and `ageMarks` semantic
IDs from `@racketlon/portraits`' versioned catalog. Nationality supplies the
shirt palette. Facial appearance is otherwise deterministic from `playerId`
unless a reviewed cue explicitly changes it.

## What the build does (build-time, seed-independent)

- **parse.ts** — dependency-free CSV reader.
- **join.ts** — joins ratings + players on `player_id`; `te`→`tn`; drops the
  derivable `cons` column; gender from the ratings file; `firPoints` via the
  `ranking_players.csv.guid` → `players.csv.guid` → `player_id` bridge.
- **countryMap.ts** — IOC-3 → ISO-2 (ENG/SCO/NIR/WAL → GB). An unmapped code
  fails the build rather than shipping a bad nationality.
- **mapRatings.ts** — affine Glicko → 0–1000 skill (anchors `MAP.R_MIN/R_MAX`,
  tuned so the world top ≈ 950); RD carried in skill-space; missing per-sport
  ratings get a low floor.
- **buildBundle.ts** — every mappable player of both genders (no roster cap —
  per-player weekly simulation is cheap enough that a roster in the
  thousands costs no more than one of 150) and writes `world-bundle.json`.

## What happens at world creation (per game, in the engine)

`packages/engine/src/world/factory.ts` reads `content.players` and, for each,
samples exact per-sport skill `N(skill, k·rdSkill)` and hidden attributes from
a per-world, per-player deterministic RNG stream, keeping the real `birthYear`
when known. So the same real player is a slightly different competitor in each
new career, without falsifying strong data. The RD sampling multiplier `k`
lives in `BALANCE.import.rdSampleK` (a runtime concern, unlike the build-time
mapping anchors).
