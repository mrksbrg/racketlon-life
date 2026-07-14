# 02 — Domain model

## Player

Every player — human or AI, real or generated — uses the same shape
([player.ts](../packages/engine/src/model/player.ts)), split by rate of change:

```
Player
├─ identity     immutable: id, name, nationality, club, birthDate, gender, isReal
├─ attributes   slow, mostly hidden: skills {tt,bd,sq,tn} 0–1000,
│               potential {tt,bd,sq,tn} 0..1 (hidden per-sport ceiling),
│               durability, professionalism, trainable stamina/coreStrength
├─ condition    fast, visible: fatigue 0–100, soreness 0–100 (short-term,
│               tournament-driven), formBySport {tt,bd,sq,tn} 0..20,
│               confidence −10..+10, injury | null
├─ ratings      per sport Glicko-2 {rating, rd, volatility}  ← observed layer
└─ simTier      0 human · 1 active NPC · 2 background
```

### Skills vs ratings — the core rule

- **Internal skills (0–1000)** are the ground truth the match engine uses.
- **Effective strength** = (skill × form factor) + temporary modifiers (fatigue,
  injury, confidence, equipment, travel fatigue, age curve). Form scales how
  much of true skill shows up that day; everything else is additive. This is
  what actually plays.
- **Glicko-2 per sport** is an *observed measurement* — a noisy estimate of the hidden
  skill, updated after match results. It is also the *seed* for initial skills of real
  players. It is an **add-on**, shown alongside but **independent of** the FIR ranking.
- **FIR ranking points** are a *separate* standing earned from tournament **placements**,
  not skill-derived and not Glicko-derived. Official competitive ladder. See
  [07-ui-screens.md](07-ui-screens.md#the-three-information-layers) for how the three
  layers (hidden skill · Glicko estimate · FIR points) are kept distinct on screen.
- **Levels 1–20** are **convex display bands** over the internal scale
  (`LEVEL_MIN_SKILL` in [sport.ts](../packages/engine/src/model/sport.ts)): bands widen
  from ~22 skill at the bottom to ~78 at the top (~3.5×), so low levels come fast and the
  top is a real grind — compounding with the training taper toward each sport's hidden
  potential ceiling, which keeps level 20 a rare peak. They exist purely for progression
  feedback — no separate XP currency, and match/Glicko never read the level, only raw
  skill. Shown only for the human's own player; other players never expose a
  true-skill-derived number. The character-creation point-buy mirrors the same convexity
  (higher levels cost more points — see `sportStepCost` in
  [character.ts](../apps/web/src/lib/character.ts)).

### Aging ✅ (continuous modifiers; birthday events/retirement still M4)

Birth dates are real dates; age is computed against the in-game calendar
([date.ts](../packages/engine/src/core/date.ts)), so players age continuously.
Age drives slow modifiers — implemented in
[systems/age.ts](../packages/engine/src/systems/age.ts): learning rate
(training), recovery rate, injury risk, and a match-day effective-strength
curve (physical decline in the 30s, partially offset by an experience bonus
built in the late 20s/early 30s). These are computed every week already —
only the *surfacing* (a birthday story-beat, season summaries) and the
population-level systems (NewPlayer drip, Retirement) remain M4.

## Plans

- **PlayerPlan** — the human's week: 21 slots, each one `ActivityType`
  ([plan.ts](../packages/engine/src/model/plan.ts)).
- **CompactPlan** — a tier-1 AI week: `{focus, intensity, restLevel}`.
- Both resolve to **ActivityCounts** (`Partial<Record<ActivityType, number>>`).
  Every system consumes counts, so humans and AI share all downstream code.

## Activities

`ActivityType` enumerates what a slot can hold (train each sport, gym, cardio, rest, work,
social; travel/tournament/coach arrive with M1–M2). Each activity's base
effects per session (skill gain, fatigue, money, injury load) live in **content**
([activities.json](../packages/content/data/activities.json)), not code.

## Career

Career-only state — money, and later equipment, coach relationships, sponsor contracts,
goals, job situation — lives in `GameState.career`, not on `Player`
([state.ts](../packages/engine/src/core/state.ts)). AI players have no economy.

## GameState and EventLog

```
GameState = { saveVersion, contentVersion, seed, calendar, players[], career }
EventLog  = GameEvent[]   // { week, type, subject?, data? }
```

Both are plain JSON data — no class instances, no functions — which makes saves,
determinism tests, and migrations trivial. A save is
`{ saveVersion, state, log }` ([facade.ts](../packages/engine/src/facade.ts)).

## Later entities (typed when their milestone lands)

`Tournament` (date, city, tier, entry fee, class structure, draw), `Match`/`SetResult`
(four sets to 21, running point total, gummiarm), `Club`, `Coach`, `Sponsor`,
`EquipmentItem`, `Offer` (story-generated choices for next week's planning).
