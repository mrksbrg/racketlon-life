# 06 — MVP roadmap

Quality gate between milestones: **after M1 the game must already be fun for
30 minutes** before any M2 work starts. Each milestone ships a playable build.

## M0 — Walking skeleton ✅ (done)

The architecture proven end-to-end with placeholder numbers.

- npm workspace: `packages/engine` (pure TS), `packages/content` (JSON + zod),
  `apps/web` (Svelte 5 + Vite, mobile-first)
- Engine: GameState, seeded RNG streams, EventLog, orchestrator with
  Planning/Training/Economy/Fatigue/Recovery/Summary, `Game` facade with bucketed
  `previewPlan`
- 12 placeholder players (1 human, 11 tier-1 AI on compact plans)
- UI: 21-slot planner with picker sheet + quick templates, live forecast chips,
  simulate transition, weekly summary with level-up flair, IndexedDB autosave
- 18 tests incl. determinism (same seed ⇒ identical 10-week career)

## M1 — Make it a game

The "one more week" test.

- ~~Racketlon match engine (point-by-point, 4 sets, gummiarm, early finish) + a
  5-step tactic dial (conserve/safe/normal/aggressive/allOut, 3 steps in table
  tennis) at match start, 11-point side change, and between sets~~ ✅ done
  early, playable as friendly matches from the planner
- ~~One recurring monthly tournament (entry fee, prize money): single-elimination
  bracket seeded by Glicko rating, AI-vs-AI auto-resolved instantly, the human's
  own matches played interactively round by round with energy carrying over
  between rounds~~ ✅ done — see the Tournament system section in
  [04-simulation-systems.md](04-simulation-systems.md) (travel slot cost is
  still M2, once TravelSystem exists)
- ~~Glicko-2 implementation + RankingSystem (rating period per tournament)~~ ✅
  done — see the RankingSystem section in
  [04-simulation-systems.md](04-simulation-systems.md). FIR-style ranking
  points from placement are still a separate, deliberately deferred concern
  (the formula/window is an open decision — see docs/07); only the Glicko-2
  add-on layer moves so far.
- ~~InjurySystem: weekly load × durability × rng → injuries that block
  slots~~ ✅ done — durability ("Läkekött") both resists injury and shortens
  recovery; the affected sport's training gain is blocked while carrying one
  (`packages/engine/src/systems/injury.ts`)
- ~~ProgressionSystem: level-up toasts, first titles, personal bests~~ ✅ done
  — first tournament win → "champion" title, new career-high combined rating
  → personal best (`packages/engine/src/systems/progression.ts`); level-up
  toasts were already live since M0 (TrainingSystem)
- ~~Balance pass on recovery (a full rest week currently wipes all
  fatigue)~~ ✅ first pass done — `recovery.weeklyBase` 15→10 and the `rest`
  activity's fatigue value −4→−3, so a full-rest week no longer floors
  fatigue from any starting point; still needs real playtesting, not just a
  numeric nudge
- ~~Money pressure tuning: entry fees vs work vs training costs~~ ✅ done —
  `work.money` 800→650, `BALANCE.economy.weeklyExpenses` 2500→2800 (a
  full-work week no longer prints a ~16,800 surplus regardless of anything
  else), plus a real TravelSystem cost (see M2) makes tournaments a genuine
  expense, not pocket change. This closes out M1.

## M2 — Real world

- FIR import pipeline: CSV/JSON interchange → `world-bundle.json`
  (Glicko → skill mapping, RD-based sampling, deterministic hidden attributes)
- Season calendar of real-style tournaments (Copenhagen Open, Swedish Open…)
- ~~TravelSystem: distance, cost, hotel tier, travel fatigue~~ ⚠️ *distance +
  cost pulled forward, hotel tier + travel fatigue still open:* `systems/travel.ts`
  — haversine flight cost (home ⇄ host city, `countries.json` coordinates) +
  hotel/food (`nights` × host country `costIndex`), charged alongside the
  entry fee at tournament entry, forecast on Tour/TournamentDay/the inbox
  invitation. Domestic events (host country = home) are a deliberate
  simplification at zero cost — no intra-country modeling yet. Still open:
  hotel *tier* choice (currently one fixed rate) and travel *fatigue* (a trip
  costs money only, no energy/condition effect yet).
- Tournament entry UI (browse calendar, enter, plan the travel week)
- Goal-based autofill ("Prepare for Copenhagen Open", "Save money", "Build tennis")

## M3 — Living world

- StorySystem: data-driven events with triggers/weights/cooldowns → diegetic inbox
  (SMS/email/news/rumor). ⚠️ *First cut pulled forward:* `InboxSystem` +
  `career.inbox` (tournament invitations + monthly ranking digest) already built —
  see [07-ui-screens.md](07-ui-screens.md). Remaining M3 story work: rumors,
  sponsor/coach offers, triggers/weights/cooldowns, results recaps.
- Offers: choices that land in next week's planning
- Sponsors (interest driven by results), equipment (wear + breakage events),
  coaches (relationships, training boosts), rivals (named recurring opponents)
- AchievementSystem reading the EventLog

## M4 — Generations & polish

- AgingSystem (birthday effects), NewPlayerSystem (archetype drip),
  RetirementSystem (age + results driven)
- Tier-2 lazy drift for the background population
- History & leaderboards (career stats, season archives from EventLog digests)
- Save slots, EventLog compaction, migration hardening
- PWA packaging: manifest, service worker, installable offline
- Capacitor wrap for app stores (optional)

## Definition of "foundation complete" (this repo today)

- `npm test` — engine + content suites green
- `npm run check` — tsc + svelte-check clean
- `npm run dev` — playable weekly loop on a phone-sized screen
- Docs 01–06 describe the target design; code matches docs for everything marked M0
