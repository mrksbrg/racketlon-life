# 05 — Content and data

**Code describes how the game works. Data describes the world.**

## Content bundle

The engine defines the contract ([content.ts](../packages/engine/src/content.ts));
`@racketlon/content` provides validated data. Everything world-flavored lives here:
activities (base effects per session), name pools, and — as milestones land —
tournaments, hotels, coaches, sponsors, equipment, event definitions, archetypes,
dialogue text. Adding content never requires an engine change.

Validation is zod at load time ([schema.ts](../packages/content/src/schema.ts)):
a typo in a JSON file fails fast instead of becoming weird gameplay.

Bundles are versioned (`contentVersion` is recorded into every save). Content updates
ship as new bundles with the app — no backend.

## FIR world bundle (M2)

The scraper's CSV/JSON output feeds an import pipeline
(`packages/content/src/import/`, Node scripts) that emits `world-bundle.json`.

### Interchange schema (what the scraper should produce)

```
players.csv   externalId, name, country, club?, gender, ageClassHistory?
ratings.csv   externalId, sport (tt|bd|sq|tn), glickoRating, rd, volatility, lastActive
results.csv   optional: per-match history for trajectory-based talent estimation
```

### Mapping ratings → internal skills

- Affine map: `skill = clamp((glicko − R_min) / (R_max − R_min)) × 1000`, anchors tuned
  so the world top sits ≈ 950+ and club grassroots ≈ 200–400.
- **RD = uncertainty**: at world creation, sample skill from `N(mapped, k·RD)` with the
  per-world seed. Well-measured players land close to their rating; rarely-seen players
  vary between worlds. Replayability without falsifying strong data.
- **Hidden attributes** (talent, durability, professionalism) are generated
  deterministically from `hash(externalId, worldSeed)` within plausible bands.
- **Birth dates**: not in FIR data, but `PlayerIdentity.birthDate` is a required
  field the engine assumes everywhere (age-based training/injury/recovery
  modifiers, match-day age bonus — see docs/04's Age modifiers) — **every
  imported player must end up with a concrete synthesized date, never just an
  age band and never omitted.** Pipeline: estimate an age band from age-class
  participation (junior/veteran events), or a default senior band when no
  age-class data exists, then deterministically sample one specific date
  within that band (`hash(externalId, worldSeed)`, same approach as the
  hidden-attribute sampling above) — the band is only an intermediate step,
  not the stored value.
- The shipped bundle is compacted + gzipped (public sports data, but not plain readable
  text in the repo). The pipeline README documents regeneration.

## Generated players (M4)

`NewPlayerSystem` runs monthly — a continuous drip, never a year-end batch.
**Archetypes are content**: juniors, late starters, ex-tennis/ex-squash converts,
TT specialists, comeback players — each with per-sport skill priors, talent
distribution, entry age band, and backstory templates.

- Distribution: ~80 % grassroots, ~15 % interesting talents, ~5 % potential stars.
- Wonderkids are rare rolls with a pity floor (≥ 1 per ~2 seasons world-wide).
- Entry rate ≈ retirement rate + small growth, so the world neither inflates nor dies.
- New players start at tier 2 and are promoted to tier 1 only when they intersect the
  human's world (same tournaments, ranking neighbourhood).

## Data-driven events (M3)

Event definitions are JSON, interpreted by the engine — **no code in data**:

```json
{
  "id": "cheap-hotel-bad-sleep",
  "trigger": { "all": ["lastWeek.travel", "lastWeek.hotelTier == budget"] },
  "weight": 3,
  "cooldownWeeks": 8,
  "effects": [{ "op": "conditionDelta", "stat": "fatigue", "amount": "small+" }],
  "choices": [],
  "presentation": {
    "channel": "sms", "from": "self",
    "template": "Terrible night at {hotelName}. Neck is stiff…"
  }
}
```

- **trigger** — a small condition DSL over state/log facts (`fatigue > 70`,
  `weeksOfHardTraining >= 3`, `moneyBelow(2000)`, `winsLastMonth >= 4`). This is what
  makes randomness feel like consequence.
- **draw** — filter by trigger → weighted bag with cooldowns and pity timers. Card-draw
  mechanics under the hood, never card-game presentation.
- **effects** — a closed set of ops the engine interprets: `conditionDelta`,
  `moneyDelta`, `addOffer`, `scheduleFollowUp`, `relationshipDelta`. Interactive events
  create **offers** answered during next week's planning — how Story influences the
  world without mutating core stats.
- **presentation** — diegetic channel (sms / email / news / rumor) + localizable
  template rendered in the inbox.

## Saves

IndexedDB via idb-keyval, one autosave per week. `{ saveVersion, state, log }`.
Migrations dispatch in `Game.fromSave`. Corrupt/incompatible saves fall back to a new
game rather than bricking the app (see [store.svelte.ts](../apps/web/src/lib/store.svelte.ts)).
