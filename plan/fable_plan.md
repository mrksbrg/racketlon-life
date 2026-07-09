# Racketlon Life — Foundational Design & Architecture

## Context

Greenfield project: a mobile-friendly **management game about an amateur racketlon career** (TT/BD/SQ/TN), inspired by Jones in the Fast Lane, worker placement, Hattrick/FM-lite, and Pokémon GO progression. Core feeling: *"I want to do everything, but I don't have enough time, money, or energy."* Weekly loop, real FIR players seeded from scraped Glicko-2 ratings (CSV/JSON), high replayability, solo developer.

**Decisions made with the user:**
- **Stack:** TypeScript + web/PWA. Pure-TS simulation engine with zero UI dependencies; Svelte 5 + Vite UI (engine is framework-agnostic, so this is swappable). Capacitor wrap later if app stores are wanted.
- **Deliverable now:** design docs in `docs/` **and** a walking skeleton (plan a week → simulate → summary, end-to-end).
- **FIR data:** CSV/JSON from the user's scraper → we define an import schema the scraper targets.
- **Scope:** offline single-player; content updates ship as versioned data bundles. No backend.

---

## 1. Domain model

Split every entity into **identity** (immutable), **attributes** (slow-changing, hidden), and **condition** (fast-changing, visible):

```
Player
├─ identity:    id, name, nationality, club, birthDate, gender, isReal (from FIR)
├─ attributes:  skills {tt, bd, sq, tn}: 0–1000 internal scale
│               talent/learningRate, durability, professionalism (hidden)
│               archetype (for generated players)
├─ condition:   fatigue 0–100, form −10..+10, confidence −10..+10,
│               injury {type, severity, weeksRemaining} | null
├─ ratings:     per sport Glicko-2 {rating, rd, volatility}   ← observed layer
└─ simTier:     0 = human | 1 = active NPC | 2 = background
```

Career-only state (human player, not on every Player): `money`, `equipment`, `coachRelationships`, `sponsorContracts`, `goals`, `jobSituation`.

Other entities: `Tournament` (date, city, tier, entryFee, class structure, draw), `Match` / `SetResult` (four sets, point scores, gummiarm), `Club`, `Coach`, `Sponsor`, `EquipmentItem`, `GameDate` (real calendar date; week = Mon–Sun; ages computed from birthDate vs current date).

`PlayerPlan` = **21 slots** (7 days × morning/afternoon/evening), each an `ActivityType` (+ params like intensity or which tournament). Tournament/travel activities occupy slots automatically when entered.

**Skill vs rating rule (core!):** internal `skills` are the truth the match engine uses (via *effective strength* = skill + modifiers for form, fatigue, injury, confidence, equipment, travel fatigue, age curve). Glicko-2 is an *observed* measure updated after results — for real players it's also the *seed* for initial skills. Display levels **1–20 per sport** are fixed bands over the 0–1000 internal scale → cheap Pokémon-GO level-up moments without a second progression currency.

`GameState` = `{ calendar, players[], tournaments[], career, world (clubs/coaches/sponsors), rngState, contentVersion, saveVersion }`. `EventLog` lives beside it in the save.

## 2. Architecture

```
apps/web (Svelte)          ── UI only: screens, view models, forecast chips
        │  Game facade API (submitWeek, previewPlan, selectors, save/load)
packages/engine (pure TS)  ── deterministic simulation, no DOM, no I/O
packages/content           ── data bundles (JSON) + import pipeline (Node scripts)
```

- **Fixed-order phase pipeline**, not an event bus: `WeeklyOrchestrator` runs Systems in a hard-coded array. Systems get a context `{ state, content, rng, log }`; they mutate `state` and append typed events to `log`. No system listens to another — downstream systems read state/log written by upstream ones.
- **Determinism:** one seeded PRNG (xoshiro-style, serializable), forked into named streams per system (`rng.fork("injury")`) so adding a system doesn't reshuffle every other system's rolls. Deterministic sim ⇒ replayable saves, reproducible bugs, golden-file tests.
- **Write-permission rule:** core systems mutate GameState. `StorySystem`, `AchievementSystem`, UI **read** GameState + EventLog and may only add *offers/choices* that a core system executes next week. Enforced by convention + a lint-friendly split (story systems get a read-only state view + an `offers` outbox).
- **Persistence:** save = JSON `{ gameState, eventLog, rngState }` in IndexedDB (`idb-keyval`), autosave every week, N slots. `saveVersion` + migration functions from day one. EventLog compaction: full detail for the current season, per-season digests for history.
- **No SQLite for now:** at FIR scale (thousands of players) JSON bundles + IndexedDB are simpler and fully offline. `ContentRepository` interface isolates the choice so wa-sqlite can slot in later if data outgrows this.

## 3. Key modules (packages/engine/src/)

| Module | Responsibility |
|---|---|
| `core/` | `GameState`, `GameDate`, `Rng`, id helpers, save/migrate |
| `model/` | Player, Plan, Tournament, Match, Skills/Ratings types |
| `orchestrator.ts` | `simulateWeek(state, humanPlan, content, rng)` — runs systems in order, returns `{state, weekEvents}` |
| `systems/` | one file per system (list below) |
| `match/` | racketlon match engine + Glicko-2 implementation |
| `ai/` | `AIPlanner` (compact plans), tier scheduler |
| `events/` | event-content interpreter (triggers, weighted draw, effect ops) |
| `balance.ts` | **every tuning constant in one place** |
| `facade.ts` | `Game` class — the only API the UI touches |

System order (each optional/no-op until built):
`Planning → Travel → Training → Economy(work/expenses) → Tournament(entries/draws) → Match → Ranking(Glicko) → Fatigue → Recovery → Injury → Progression(levels/milestones) → Aging(birthday effects) → NewPlayer/Retirement(periodic) → Story(event draws → offers) → Achievement → Summary`

## 4–5. Weekly loop and interaction contract

1. UI builds `PlayerPlan` (quick-plan templates, manual slots, or goal-based autofill).
2. UI calls `game.previewPlan(plan)` → **bucketed forecast** (`TT +`, `Fatigue ++`, `Injury risk medium`, `Money −500`). Forecast reuses the *same* per-activity effect functions as TrainingSystem, evaluated in expectation (no RNG), then bucketed — never exact decimals in the UI.
3. `game.submitWeek(plan)` → orchestrator: AIPlanner produces compact plans for tier-1 NPCs, systems run, events append.
4. `SummarySystem` composes the weekly digest **from the EventLog** (matches, level-ups, money, incidents, story messages).
5. UI renders summary + diegetic inbox (SMS/email/news presentation of events), then next week.

Human matches can run interactively (pause at set start / 11–x for offensive/defensive/balanced/save-energy calls); AI–AI matches always auto-resolve.

## 6. Real FIR players → internal skills (import pipeline)

`packages/content/src/import/` (Node scripts, zod-validated):

- **Interchange schema** the scraper targets: `players.csv` (externalId, name, country, club?, gender, ageClassHistory?) + `ratings.csv` (externalId, sport, glickoRating, rd, volatility, lastActive) + optional `results.csv`.
- **Mapping:** `skill = clamp( (glicko − R_min) / (R_max − R_min) ) * 1000` with anchors tuned so world top ≈ 950+ and club grassroots ≈ 200–400. High **RD ⇒ uncertainty**: at world creation, sample skill from N(mapped, k·RD) with a per-world seed — worlds differ slightly, replayability without falsifying strong data.
- **Hidden attributes** (talent, durability, …) generated deterministically from `hash(externalId, worldSeed)` within age-appropriate bands. **Birth dates** aren't in FIR data: estimate a band from age-class participation (junior/senior/veteran events) else nationality-agnostic default band, then sample deterministically.
- Output: versioned `world-bundle.json` shipped as a static asset. Names/results are public sports data; the bundle is compacted+gzipped (not plain readable text in the repo) — a note in docs covers regenerating it.

## 7. Generated players (NewPlayerSystem)

Runs monthly, drip-feeding entrants (no year-end batch): juniors, late starters, ex-tennis/ex-squash converts, TT specialists, comeback players. **Archetypes live in content data** (skill priors per sport, talent distribution, entry age band, backstory templates). Distribution: 80% grassroots / 15% talents / 5% potential stars; wonderkids gated by a rarity roll with a *pity floor* (guaranteed ≥1 per ~2 seasons somewhere in the world). Entry rate ≈ retirement rate + small growth so the world doesn't inflate. Generated players start in tier 2 and get promoted to tier 1 only when they intersect the player's world.

## 8. AI players without a heavy sim (level-of-detail tiers)

Same effective-strength formula and match engine everywhere; only *planning* and *update frequency* differ:

- **Tier 0 (human):** full 21-slot plan from UI, all systems.
- **Tier 1 (active NPCs ≈ 100–300):** ranking neighbours, rivals, co-entrants of upcoming tournaments. `AIPlanner` outputs a compact plan `{focusSport, intensity, restLevel, entersTournament}` expanded into aggregate weekly effects (one training tick, one fatigue tick — not 21 slots).
- **Tier 2 (background, thousands):** no weekly sim. Skills follow archetype + age-curve drift, applied lazily (when the player is next observed) or in a cheap monthly batch. They appear in tournament draws with their current effective strength.
- Tier membership recomputed when the calendar/entry lists change. Result: weekly sim cost is O(active players), independent of world size.

## 9. Data-driven events (StorySystem)

Event definitions are JSON content, interpreted — **no code in data**:

```json
{ "id": "cheap-hotel-bad-sleep",
  "trigger": { "all": ["lastWeek.travel", "lastWeek.hotelTier == budget"] },
  "weight": 3, "cooldownWeeks": 8,
  "effects": [{ "op": "conditionDelta", "stat": "fatigue", "amount": "small+" }],
  "choices": [],
  "presentation": { "channel": "sms", "from": "self",
                    "template": "Terrible night at {hotelName}. Neck is stiff…" } }
```

- `trigger`: small condition DSL over state/log facts (`fatigue > 70`, `weeksOfHardTraining >= 3`, `moneyBelow(2000)`, `winsLastMonth >= 4`). Context-driven, so randomness reads as *consequence*.
- Draw = filter by trigger → weighted **bag** draw with cooldowns and pity timers (prevents unfair streaks).
- `effects`: closed set of ops the engine interprets (`conditionDelta`, `moneyDelta`, `addOffer`, `scheduleFollowUp`, `relationshipDelta`). Interactive events emit **offers** answered during next week's planning — this is how StorySystem influences the world without mutating core stats.
- `presentation`: diegetic channel (sms/email/news/rumor) + localizable template. Adding an event = adding JSON, no engine change.

Same content style for: names, clubs, cities, tournaments (yearly calendar), hotels, coaches, sponsors, equipment, archetypes, activity definitions (base effects per ActivityType also live in content).

## 10. Match engine

Point-by-point per sport (TT→BD→SQ→TN, sets to 21 win-by-2, running point total, gummiarm rule): per-point win probability = logistic(Δ effective strength / scale), with per-sport scale constants. Coaching choices shift mean *and* variance and change energy burn (offensive: higher ceiling, more fatigue + more variance; save-energy: lower win prob, preserves fatigue for later sets). Cost per match ≈ microseconds ⇒ full tournaments are cheap. After each tournament, `RankingSystem` runs a Glicko-2 rating period per sport.

## 11. MVP roadmap

- **M0 — Walking skeleton (this session):** repo scaffold, engine with GameState/Rng/EventLog/orchestrator + Training/Fatigue/Recovery/Economy/Summary systems on placeholder balance numbers, `Game` facade, vitest test simulating 10 deterministic weeks, Svelte mobile-first UI: slot planner → forecast chips → simulate → weekly summary. ~12 placeholder players.
- **M1 — Make it a game:** match engine + Glicko-2, one recurring monthly tournament, money pressure (entry fees/work), injuries, levels 1–20 + level-up feedback. *First "one more week" test.*
- **M2 — Real world:** FIR import pipeline + world bundle, season calendar with real-style tournaments, travel system, full activity set, goal-based autofill.
- **M3 — Living world:** data-driven events/story inbox, sponsors, equipment, coaches, rivals.
- **M4 — Generations & polish:** aging, NewPlayer/Retirement, achievements, history/leaderboards, save slots + migrations hardening, PWA packaging (installable, offline).

Ship-quality gates: after M1 the game must already be *fun for 30 minutes* before building M2.

## 12. Architectural mistakes to avoid (written into docs/03)

1. **No generic event bus / ECS** — fixed system order is the feature.
2. **Don't simulate everyone at full detail** — tiers from day one.
3. **Story must not mutate core stats** — offers only.
4. **Engine must never import UI or browser APIs** — enforce via package boundary.
5. **No exact numbers in UI** — bucket at the facade so precision can't leak.
6. Keep every tuning constant in `balance.ts`/content, never inline in systems.
7. Seeded RNG from commit one — retrofitting determinism is brutal.
8. `saveVersion` + migration stubs from commit one.
9. Don't build the SQLite/backend abstraction until data forces it.
10. Don't over-normalize content — plain JSON + zod beats a mini-database.

---

## Execution plan (after approval)

**Files to create:**

1. **Docs** — `docs/01-vision.md` (condensed brief), `02-domain-model.md`, `03-architecture.md` (incl. pitfalls & write-permission rule), `04-simulation-systems.md` (system-by-system spec + order), `05-content-and-data.md` (bundle formats, FIR interchange schema, event DSL), `06-mvp-roadmap.md`.
2. **Scaffold** — npm workspaces root (`package.json`, `tsconfig.base.json`, `.gitignore`), `packages/engine` (tsc + vitest), `packages/content` (placeholder data JSON + zod schemas), `apps/web` (Vite + Svelte 5, mobile viewport).
3. **Engine skeleton** — `core/{state,date,rng,ids}.ts`, `model/{player,plan,activity}.ts`, `events/log.ts`, `systems/{training,fatigue,recovery,economy,summary}.ts`, `orchestrator.ts`, `balance.ts`, `facade.ts`; placeholder world factory (12 players).
4. **Tests** — determinism test (same seed ⇒ identical 10-week log), training/fatigue behavior tests, facade round-trip.
5. **Web skeleton** — three screens: Week Planner (21 tappable slots + forecast chips), Simulating (transition), Weekly Summary (event digest). IndexedDB autosave.

**Verification:** `npm test` green in engine; `npm run dev` in `apps/web`, then use the Claude Preview tools at mobile viewport (375×812) to plan a week, simulate, and confirm the summary reflects the plan (train TT 5× ⇒ TT trend up + fatigue up; rest week ⇒ fatigue down). Determinism: reload with same seed reproduces the identical summary.
