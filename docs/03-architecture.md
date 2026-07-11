# 03 — Architecture

## Three packages, one direction of dependency

```
apps/web  (Svelte 5 + Vite)      UI only: screens, view models, forecast chips
   │  imports Game facade
packages/engine  (pure TS)       deterministic simulation — no DOM, no I/O, no framework
   ▲  imports types only
packages/content (JSON + zod)    data bundles: activities, names, (later) tournaments,
                                 events, archetypes, FIR world bundle
```

- The **engine** never touches browser APIs, files, or the network. It receives a
  validated `ContentBundle` and returns plain data. This is enforced by the package
  boundary and by `tsconfig` (no DOM lib).
- The **UI** talks only to the `Game` facade ([facade.ts](../packages/engine/src/facade.ts)):
  `newGame / fromSave / serialize / you / weekLabel / previewPlan / submitWeek / eventsForWeek`.
- **Content** depends on engine *types* only, so data files are type-checked and
  zod-validated ([schema.ts](../packages/content/src/schema.ts)) at load time.

## The weekly pipeline

```
UI plan (21 slots)
   → Game.submitWeek
      → simulateWeek(state, plan, content, log)          orchestrator.ts
          PlanningSystem      resolve human slots + AI compact plans → counts
          (TravelSystem)                                              M2
          TrainingSystem      skills += f(base, taper, potential, fatigue, rng);
                              formBySport += trained ? gain : -decay
          EconomySystem       money += work − costs − living expenses
          (Tournament → Match → Ranking)                              M1
          FatigueSystem       fatigue += Σ activity fatigue
          RecoverySystem      natural recovery, high-fatigue form penalty, warnings
          (InjurySystem)                                              M1
          (Aging / NewPlayer / Retirement)                            M4
          (StorySystem → offers, AchievementSystem)                   M3
          SummarySystem       digest from EventLog + before/after snapshot
      → calendar advances, WeekSummary returned
```

**Fixed order, not an event bus.** The orchestrator runs systems from a hard-coded
array. No system subscribes to anything; downstream systems read what upstream systems
wrote into `GameState` and the `EventLog`. Adding a feature = adding one system file
and one line in the array.

### The system contract

```ts
interface GameSystem { id: string; run(ctx: SystemContext): void }
// ctx = { state, content, humanPlan, plans, rng, log, snapshot, outputs }
```

**Write-permission rule:** core systems mutate `GameState` (Training → skills,
Injury → injury status, Economy → money). Story/Achievement systems must only *read*
state + log and create **offers** that a core system executes next week. StorySystem
never silently changes a skill.

### EventLog

Systems emit typed events (`training.levelUp`, `economy.week`, `condition.warning`).
The log is used for the weekly summary, history, achievements, and story triggers —
feedback and memory, never control flow. Compaction plan: full detail for the current
season, digests per past season.

## Determinism

There is **no mutable RNG state** in the save. Every system, every week, derives a
private stream: `new Rng(childSeed(worldSeed, weekIndex, systemId))`
([rng.ts](../packages/engine/src/core/rng.ts)). Consequences:

- the same seed + same plans replay the same career (goldenfile-testable, see
  [determinism.test.ts](../packages/engine/test/determinism.test.ts));
- bug reports are reproducible from a seed;
- inserting a new system never reshuffles other systems' rolls.

## Forecast honesty

`Game.previewPlan` evaluates the *same* effect functions the systems use
([effects.ts](../packages/engine/src/systems/effects.ts)) in expectation (no RNG),
then buckets the result (`+`, `++`, `▲▲`, low/medium/high). Exact numbers cannot leak
into the UI because the facade only exposes buckets — the design pillar "not a
spreadsheet" is enforced by the API shape, not discipline.

## Persistence

Save = `{ saveVersion, state, log }` JSON in IndexedDB (idb-keyval), autosaved each
week. `Game.fromSave` is the single migration dispatch point; `saveVersion` exists from
day one. Content bundles carry their own `contentVersion` recorded into the state.

## Simulation cost (level-of-detail tiers)

| Tier | Who | Weekly cost |
|---|---|---|
| 0 | the human | full 21-slot plan, all systems |
| 1 | ~100–300 active NPCs (ranking neighbours, rivals, co-entrants) | compact plan → one aggregate tick |
| 2 | background thousands | none — archetype/age drift applied lazily or in a monthly batch |

Same skill model and (from M1) same match engine everywhere; only planning detail and
update frequency differ. Weekly cost is O(active players), independent of world size.

## Architectural mistakes to avoid

1. **No generic event bus / ECS** — the fixed system order *is* the feature.
2. **Don't simulate everyone at full detail** — tiers from day one.
3. **Story must not mutate core stats** — offers only.
4. **Engine must never import UI or browser APIs** — package boundary enforces it.
5. **No exact numbers in the UI** — bucket at the facade.
6. **Every tuning constant in [balance.ts](../packages/engine/src/balance.ts) or content** — never inline in systems.
7. **Seeded RNG from commit one** — retrofitting determinism is brutal.
8. **saveVersion + migration dispatch from commit one.**
9. **No SQLite/backend abstraction until data forces it** — JSON + IndexedDB is enough at FIR scale.
10. **Don't over-normalize content** — plain JSON + zod beats a mini-database.
