# 04 — Simulation systems

Run order is fixed in [orchestrator.ts](../packages/engine/src/orchestrator.ts).
Each system is one file in `packages/engine/src/systems/`. ✅ = built.

| # | System | Milestone | Reads | Writes | Emits |
|---|--------|-----------|-------|--------|-------|
| 1 | Planning ✅ | M0 | humanPlan, players | ctx.plans | — |
| 2 | Travel | M2 | plans, tournaments | travel fatigue, location | travel.* |
| 3 | Training ✅ | M0 | plans, skills, fatigue | skills, condition.formBySport | training.progress, training.levelUp, form.rusty, form.sharp |
| 4 | Economy ✅ | M0 | plans | career.money | economy.week, economy.broke |
| 5 | Tournament ✅ | M1 | calendar, tier-1 pool, ratings | career.money, condition.fatigue, career.tournamentEntries | tournament.registered/withdrew/entered/won/eliminated |
| 6 | Match ✅ | M0 | effective strength | point-by-point results | — (invoked by Tournament/friendly, not its own pipeline step) |
| 7 | Ranking ✅ | M1 | results, placements | Glicko-2 ratings (FIR points still pending) | ranking.moved |
| 8 | Fatigue ✅ | M0 | plans | condition.fatigue | — |
| 9 | Recovery ✅ | M0 | condition | fatigue, formBySport (high-fatigue penalty only) | condition.warning |
| 10 | Injury ✅ | M1 | week load, durability, rng | condition.injury | injury.occurred/blocked/recovered |
| 11 | Progression ✅ | M1 | results, milestones | titles, bestRating | progression.title/personalBest |
| 12 | Aging (modifiers) ✅ / (birthday events) M4 | M1 / M4 | birthDate vs calendar | age modifiers (M1, done); birthday event (M4, pending) | birthday (M4) |
| 13 | NewPlayer | M4 | world size, archetypes | players[] (add) | world.newPlayer |
| 14 | Retirement | M4 | age, ambition, results | players[] (retire) | world.retirement |
| 15 | Story | M3 | state + log (read-only) | **offers only** | story.* |
| 16 | Achievement | M3 | log (read-only) | unlocks | achievement.unlocked |
| 17 | Summary ✅ | M0 | log + snapshot (read-only) | ctx.outputs.summary | — |

## Built systems (M0) in detail

### PlanningSystem
Human slots → `ActivityCounts` via `countsFromSlots`. Tier-1 AI → `compactPlanFor`
([planner.ts](../packages/engine/src/ai/planner.ts)): rest when fatigue > 65, otherwise
focus mostly on the weakest sport, intensity from professionalism. Compact plans expand
to the same counts shape, so no later system knows who is human.

### TrainingSystem
Per session: `gain = base × taper(skill, ceiling) × potentialMult × fatigueMult × noise`
([effects.ts](../packages/engine/src/systems/effects.ts)), where `ceiling` is the
sport's hidden soft cap derived from `potential` (`skillCeiling`) — a low-potential
sport plateaus earlier than a high-potential one, even at identical training. Session
quality also uses the fatigue a player *brought into* the week — overtraining hurts
next week, visibly. Gym/cardio build physical attributes (core strength/stamina) rather than racket-sport skills; squash and, to a smaller extent, badminton maintain stamina at two sessions per week and add a small stamina bonus above that because they are physically demanding. Body-attribute gains taper near the hidden 0..1 ceiling; stamina drifts down when ignored, core strength decays on a slower monthly tick, and both erode slowly with age.
Level-band crossings emit `training.levelUp`.

Same loop also updates **per-sport form** (0..20, "tournament readiness"): a sport
actually trained this week gains form (capped per week), one left untouched — including
one blocked by injury — decays. Crossing into "rusty" or reaching full readiness emits
`form.rusty`/`form.sharp` for the weekly summary. Spreading limited weekly training slots
across four sports means real trade-offs: sharpening one lets others go rusty.

### EconomySystem
Human only. `money += work income − activity costs − weekly living expenses`.
Negative balance emits `economy.broke` (story hook: extra work offers at low money).

### FatigueSystem / RecoverySystem
Fatigue accumulates from activities (rest/social are negative); recovery applies a flat
natural weekly reduction and warns at ≥ 75 fatigue. Recovery also applies an extra
form penalty, uniformly across all four sports, when fatigue is deep enough — form
itself is otherwise driven entirely by TrainingSystem's neglect/practice logic, with no
pull toward a neutral middle. From M1: recovery rate scales with age and quality of
rest (hotels, home vs travel).

### SummarySystem
Read-only. Diffs the human snapshot (taken by the orchestrator before systems run),
harvests this week's events into notes, produces `WeekSummary` — the only thing the
summary screen renders.

## Match engine ✅

[engine.ts](../packages/engine/src/match/engine.ts) — point-by-point simulation of the
real racketlon rules, playable now as a **friendly match** from the planner (an
exhibition sandbox: no fatigue/rating/money effects until TournamentSystem lands).

- Four sets in fixed order TT → BA → SQ → TE, each to 21 win-by-2. **Total points
  across all sets** decide the match. Play stops the moment the trailing player can
  no longer catch up (`maxRemainingFor`), so tennis runs only "as long as it is
  needed"; a tie after four sets is decided by a single **gummiarm** point.
- Per point: `P(win) = logistic((effA − effB) / scale_sport)`; per-sport scales in
  balance. Effective strength = skill + form − pre-match fatigue − spent in-match
  energy + tactic modifier.
- **Intervention breaks** at match start, the 11-point side change in every set, and
  between sets. A single 5-step **tactic dial**, ordered by energy cost low → high:
  `conserve < aggressive < normal < safe < allOut`. *Conserve* coasts (biggest eff
  penalty, biggest energy savings — bank energy for later sets by giving up some
  points now). *Safe* grinds out longer rallies (−eff, **costs more energy**).
  *Aggressive* ends the point on a winner (+eff, chaos, **saves energy**). *All-out*
  is conserve's opposite: contest every ball at full effort (major eff boost,
  no extra chaos, biggest energy burn) — a "money time" button that can
  noticeably tilt coin-flip rallies if the player is willing to empty the tank.
  This matches the real sport: safe/consistent play extends rallies, going for
  winners shortens them.
  Baseline energy cost per point is also per-sport (relative stamina need TT=1,
  BA=4, SQ=5, TE=3), and the dial's energy swing scales with that — table tennis
  stays cheap regardless of tactic (there the dial reads as a mental/consistency
  game, not a physical one — see the TT-specific flavor text in `MatchScreen.svelte`),
  while squash swings the most. Energy burn is also asymmetric when the
  expected winner actually wins the point: the controller spends less and the
  chaser spends more, strongest in squash to reflect controlling the T, with a
  smaller badminton version of the same effect.
- `MatchState` is plain serializable data; each point derives its RNG stream from
  `(matchSeed, pointCount)`, so matches replay identically and the UI steps them one
  point at a time (`playPoint`). AI opponents choose tactics via `aiChooseTactic`:
  cut losses with *conserve* when truly exhausted, *allOut* when desperately behind,
  *aggressive* when merely tired or moderately behind (aggressive is what actually
  saves energy), *conserve* to coast on a blowout lead, *safe* to protect a
  comfortable one, otherwise *normal*.
- **Opponent reads** — `fatigueTell` buckets energy into fresh/working/tiring/gassed
  (never the exact number, matching the game's no-exact-numbers rule); the
  opponent's chosen tactic is shown directly since it's observable in-match behavior,
  not hidden information; `luckTell` buckets a `momentum` EMA of (actual outcome −
  modeled point probability) into lucky/neutral/unlucky, so a run of points going
  against the odds reads as "getting no breaks" regardless of the overall scoreline.
  Momentum genuinely feeds back into point probability (`BALANCE.match.momentumWeight`)
  and resets to 0 at every side-change/set-end break — self-limiting by construction,
  since a hot streak raising win probability makes continuing to win less
  "surprising" to the EMA, so it doesn't need an explicit cap.
- **Mental sharpness and clutch** (the Composure/Clutch creation attributes,
  previously decorative) are both real mechanics. `MatchState.sharpness` (0..100
  per side, both start fresh at 100 every match — a psychological reset, not a
  physical carryover like energy) is pulled each point toward a momentum-derived
  target, damped by `composure` (near 1, barely moves; near 0, chases every
  swing — see the per-point update in `playPoint`); it feeds `effectiveStrength`
  via `BALANCE.match.sharpnessWeight`, softer than energy's weight. `clutch`
  only ever applies on a decisive instant — a set point, match point, or the
  gummiarm (`clutchMoment`, reusing the same `pointsToWin` scaffolding as the
  "N points needed" cue) — tilting that single point's eff gap
  (`BALANCE.match.clutchWeight`), centered at clutch 0.5 (no effect). Both are
  shown live in `MatchScreen.svelte`'s "Mental strength" rows (same bar/label
  treatment as energy) plus a small pulsing "⚡ Set point"/"Match point"/
  "Winner takes all" flash during a decisive point.
- A full match costs well under a millisecond — tournament draws stay trivially cheap.
- Still pending: confidence/injury/equipment modifiers on effective strength.

## Tournament system ✅

[tournament/engine.ts](../packages/engine/src/tournament/engine.ts) — the
recurring placeholder "Monthly Open" (content-defined; real FIR tournaments
replace it in M2), occurring every 4th week (`isTournamentWeek`, offset so
the player gets a few weeks to prepare first).

- **Advance registration, not same-week entry.** `registerForTournament`
  requires committing at least `BALANCE.tournament.entryDeadlineWeeks` (2)
  weeks before the tournament's own week — there is no same-week fallback,
  by design (see docs/07's Tour tab). Registrations live on
  `Career.tournamentEntries` (persistent, unlike `TournamentSession`) and are
  consumed (removed) once `startTournament` actually runs. The entry fee
  isn't charged at registration — only once the week arrives and the human
  calls `enterTournament`, gated by `registeredTournamentThisWeek` (`null`
  with no fallback if the deadline was missed, even though
  `tournamentThisWeek` still reports the event exists that week).
  `withdrawRegistration` reverses a commitment any time before it's played.
- **Field preview ahead of time.** `projectedField(state, def, weekIndex)`
  deterministically draws the same tier-1 NPCs that `pickEntrants` will use
  once the human actually enters (same seed formula:
  `childSeed(state.seed, "tournament", weekIndex, def.id)`) — so the Tour
  screen can show "who's entered" for any future occurrence, guaranteed to
  match the real bracket when that week arrives. The sampled field is locked
  into `Career.lockedFields` (keyed by weekIndex + `TournamentDef.id`) the
  first time it's needed and reused by every later call — the pool it's
  drawn from is otherwise re-derived from `state.players`' live, still-
  drifting ratings on every read, so without the lock a draw browsed ahead of
  time could show different entrants than the one actually played once NPC
  ratings moved on in between (the real "NZ Open" bug this fixed).
- **Field & seeding.** Human + 7 tier-1 NPCs (shuffled deterministically),
  seeded into a single-elimination bracket by **Glicko rating** — not hidden
  skill, matching the game's "layers" rule (docs/07): a real seeding committee
  only ever sees ratings. Real-world draw convention: only seeds 1-4 get a
  protected slot (1 on top, 2 on the bottom so they can only meet in the
  final; 3/4 anchor the two middle positions, coin-flipped, so each can only
  meet 1 or 2 in the semifinal) — everyone else is shuffled in blind, same as
  an unseeded real-world draw.
- **AI-vs-AI matches auto-resolve instantly** (`simulateMatchAuto`: both sides
  driven by `aiChooseTactic` in a tight loop) — full tournament draws cost
  microseconds. **The human's own matches stay fully interactive**, reusing
  the same Match screen as friendlies, one round at a time.
- **Energy carries between rounds**, with a flat recovery bonus
  (`energyRecoveryBetweenRounds`) rather than a full reset — a tournament day
  is a stamina arc, not isolated fresh matches. Cumulative energy spent across
  all the human's rounds converts into a fatigue increase
  (`fatigueConversionFactor`) applied once the event concludes.
- **Session lifecycle**: `startTournament` deducts the entry fee and resolves
  round 1; `advanceTournament` is called once the human's current match is
  `finished` — it records the result, either hands back the next round's
  `MatchState` (`status: "nextRound"`) or, on elimination or the final win,
  awards `prizeByRoundsWon[roundsWon]` and converts fatigue (`status:
  "eliminated" | "won"`).
- **`TournamentSession` is deliberately not part of `GameState`** — it's
  ephemeral, held by the `Game` facade only for the event's duration (see
  `03-architecture.md`'s write-permission note: this is the facade taking on
  multi-step orchestration that a fixed-order, single-call system isn't
  shaped for). Only its *permanent* effects — entry fee, prize money, fatigue,
  and `tournament.*` EventLog entries — land in `GameState`. Reloading
  mid-tournament simply restarts that week fresh, since nothing autosaves
  until the week fully resolves (`Game.submitWeek`) — a deliberate M1
  simplification.
- **Week-snapshot handling**: `Game` takes one snapshot of the human at the
  *start* of the week (on `enterTournament()` or, if skipped, on the eventual
  `submitWeek()` call) via `ensureWeekSnapshot()`, so the weekly summary's
  before/after diff correctly includes the tournament's money and fatigue
  changes alongside the week's normal training/economy — `simulateWeek` now
  accepts this snapshot as an optional override instead of always computing
  its own.
- **Still not wired**: no bracket/draw visualization screen (only the Tour
  calendar, the registration flow, and the round-by-round match flow exist
  so far); no FIR ranking points (see RankingSystem below).

## RankingSystem ✅

[systems/ranking.ts](../packages/engine/src/systems/ranking.ts) +
[systems/glicko.ts](../packages/engine/src/systems/glicko.ts) — a from-scratch
Glicko-2 implementation (Glickman's algorithm, verified against the paper's
official worked example in `test/glicko.test.ts`), wired into tournament
resolution rather than the fixed weekly pipeline, for the same reason as
Tournament itself: it spans the whole multi-round event, not one atomic call.

RankingSystem produces **two independent things** (see
[07-ui-screens.md](07-ui-screens.md#the-three-information-layers)): **FIR ranking
points** awarded by tournament *placement* (the official standing — the
formula/window is still an open decision, see docs/07, and not yet built), and
**Glicko-2 ratings** updated per rating period from match *results* (an
add-on estimate of the hidden true skill, which is what M1 delivers). Neither
is the true skill, which stays a hidden latent variable.

- **Each of the four sets is its own per-sport contest.** A single racketlon
  match can produce up to four independent Glicko results (one per sport,
  from that set's point differential) rather than one blended "match result"
  — matching `Ratings` being per-sport in the first place.
- **One rating period per tournament**, batched correctly rather than
  incrementally: every set a player contested during the event is collected
  into a `RatingResultsBook`, then applied once at `concludeTournament`
  against every opponent's *pre-tournament* rating snapshot. An incremental
  per-match update would let an early-round opponent's rating drift mid-event
  and contaminate later results in the same period — the spec is explicit
  that a period's games are all scored against fixed pre-period ratings.
- **NPC ratings update too**, not just the human's — future seeding needs to
  stay meaningful — but `ranking.moved` EventLog entries (and therefore
  Summary notes) are only emitted for the human, to avoid flooding the log
  with opponents' rating noise.

## InjurySystem ✅

[systems/injury.ts](../packages/engine/src/systems/injury.ts) — a weekly
roll against the same `injuryLoad()` the forecast already surfaces (fatigue
brought in + this week's planned activity load), scaled down by durability
("Läkekött"). Only one injury at a time; while carrying one, a player heals
instead of rolling for a new one.

- **Attribution**: the injury is pinned to whichever sport had the most
  training sessions that week (or "overuse" if none did), and
  `TrainingSystem` blocks that sport's skill gain for as long as the injury
  lasts — the fatigue/economy cost of the session still applies (the slot was
  spent), it just doesn't pay off. Emits `injury.blocked` when this happens.
- **Durability pulls double duty**: it lowers the weekly injury chance
  (`durabilityProtection`) *and* shortens recovery (`durabilityHealBonus`) —
  the same hidden stat the character-creation screen's "Resilience"/Läkekött
  point-buy feeds into (`world/factory.ts`'s `specFromDraft`).
- Severity (1–3) scales both how likely a bad roll is at high load and how
  many weeks it takes to heal; `injury.recovered` fires when it clears.

## ProgressionSystem ✅

[systems/progression.ts](../packages/engine/src/systems/progression.ts) —
milestones that persist on `Career` (`titles`, `bestRating`) so "first" and
"best" stay meaningful across the whole save, not just one week's diff.

- First `tournament.won` → the "champion" title, once only.
- A new career-high **combined Glicko-2 rating** (average across the four
  sports) → a personal best. Deliberately tied to Ranking rather than raw
  skill — skill only ever increases from training, so a skill-based "best"
  would be meaningless; the rating can and does go down, so beating your own
  high-water mark is an actual achievement.
- Level-up toasts were already live since M0 (`training.levelUp`, surfaced by
  SummarySystem) — no separate Progression work needed there.

## Age modifiers ✅ (docs/02's "Aging" section; birthday events still M4)

[systems/age.ts](../packages/engine/src/systems/age.ts) — four pure curve
functions over `ageOn(calendar, birthDate)`, consumed by the systems that
already existed rather than added as their own pipeline step (the same
pattern as Ranking): `trainingAgeMultiplier` (effects.ts's
`expectedSessionGain`), `matchAgeModifier` (match/engine.ts's
`effectiveStrength`), `recoveryAgeMultiplier` (RecoverySystem),
`injuryAgeMultiplier` (InjurySystem).

- **A full-lifecycle curve, not just decline**: youth learns training gains
  faster (tapering to neutral by the mid-20s), a "prime veteran" window in
  the late 20s/early 30s adds a small match-day experience bonus *before*
  physical decline sets in, then decline outpaces the (capped) experience
  offset from the early 30s onward — both in match effective strength and in
  training-gain capacity, and recovery/injury risk worsen on the same
  schedule.
- **The match engine stays calendar-agnostic** — `MatchPlayerRef.age` is a
  plain number the caller computes via `ageOn()`, not a birthDate the match
  engine parses itself, preserving `match/engine.ts`'s existing separation
  from calendar concepts.
- All four functions default their test call sites to a neutral age (~25,
  square in the flat prime window) so existing tests of the other dimensions
  (skill, talent, fatigue, tactics) didn't need touching — see
  `test/age.test.ts` for both the pure-curve unit tests and integration tests
  proving the wiring (not just the math) is correct.
- Tuning constants live in `BALANCE.age` — a first pass, not a final curve;
  wants playtesting like the rest of M1's balance work.

## Balance tuning notes (observed in M0-M1 playtesting)

- A "training camp" week (14 sessions) → +47 fatigue: two such weeks back-to-back hit
  the fatigue ceiling. Intended pressure, feels right.
- A full recovery week should genuinely clear fatigue, including from the ceiling;
  natural recovery stays modest (`recovery.weeklyBase` 10) while dedicated `rest`
  slots are strong enough to carry the deload (`rest` activity fatigue −6 in
  content). Still a numeric nudge, not a redesign — wants real playtesting.
- `work` carries no fatigue (content `work.fatigue` 0): it's ordinary desk-job
  office work, not physical exertion, so a working week still lets the body
  recover — only the day's physical activities (training, gym, cardio, travel)
  should cost fatigue. This is why the in-app "Recovery" template (all-week
  `work` + a token cardio/gym/social) now actually sheds most fatigue instead
  of roughly cancelling out against it. A future pass could give `work` its
  own small *mental*-fatigue track distinct from physical fatigue — out of
  scope for now.
- Diminishing returns are visible in forecasts (best sport shows `+` while weaker
  sports show `++` for the same session count) — good, keep.
- Money pressure (entry fees vs. work vs. training costs) is still untouched from M0 —
  the one M1 balance item not yet revisited.
