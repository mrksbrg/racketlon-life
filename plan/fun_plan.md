# Racketlon Life — Fun & "One More Week" Plan

*2026-07-19. An assessment of where the fun stands after M0–M2 (+ the pulled-forward
inbox), and a prioritized plan to make the weekly loop addictive — more arriving
decisions, more anticipation, more small choices that compound into the future.*

---

## 1. Assessment: where the fun stands today

### What already works

- **The tournament beat is genuinely good.** Registration deadline → field fills
  in waves → draw-published email → interactive match play with the tactics dial,
  momentum, gummiarm nerves → results email → monthly FIR publication. That is a
  real anticipation chain with staggered reveals, and it's the part of the game
  that already passes the one-more-week test.
- **The simulation depth is there.** Form/neglect stages, soreness, aging cliffs,
  clutch, divisions, travel costs, vacation days — the *consequences* layer is
  rich enough to support far more decisions than the game currently asks for.
- **The real-FIR hook is unique.** Beating a name you know from real tournaments,
  fuzzy scouting bands that tighten with familiarity — no other game has this.
- **Progression feedback exists**: level-ups, titles, records emails, personal
  bests, trophy cabinet, potential clues from the coach.

### The core problem: flat weeks between tournaments

Civilization's "one more turn" works because **something is always 1–3 turns from
resolving** — a build, a tech, a war — and the timers deliberately overlap so no
turn resolves everything. Racketlon Life currently has exactly **one** such timer:
the next tournament, roughly every 2–3 weeks. Between beats:

1. **Nothing arrives.** The inbox is fully deterministic — invitations, digests,
   results. The only interactive message ever is "register". No surprises, no
   offers, no choices land on you. Design pillar 2 ("randomness as consequence")
   and the entire StorySystem/offers mechanism (fable_plan §9, the event DSL)
   are designed but **unbuilt** — this is the single biggest gap.
2. **The plan converges to a template.** Once a player finds a good week shape,
   the quick-template + Simulate path is near-optimal every non-tournament week.
   The 21-slot planner is expressive, but nothing makes *this* week different
   from last week, so the marginal week carries no new decision.
3. **Nothing points forward.** The summary ends with a receipt and a "Plan next
   week ▸" button. Nothing says what's coming — no deadline closing, no draw due,
   no payday, no rival playing this weekend. The player has to *remember* why
   next week matters instead of being told.
4. **Nobody in the world matters personally.** NPCs play, earn points, move in
   rankings — but no rival is framed, so their results are noise, not news.

**Litmus test**: if we're ever tempted to add a "skip to next tournament" button,
that's the symptom — the fix is filling those weeks with decisions, not skipping
them. A week the player wants to skip is a design bug.

---

## 2. The plan, prioritized

Ordered by one-more-week payoff per unit of effort. P1+P2 alone should change how
the game feels; everything else compounds on them.

### P1 — "Coming up" hooks ✅ done (2026-07-19)

A forward-looking strip, built purely as a read-model over existing state — no
new sim. Shown in two places: the **bottom of the weekly Summary** (immediately
above "Plan next week ▸" — the moment the one-more-week decision happens) and
the **top of the Planner**, right under the money/health/vacation hub row.

**Built as `ComingUp.svelte`** (`apps/web/src/lib/ComingUp.svelte`), fed by a
single `store.comingUp` derived array, up to 4 lines:

- **Training pace ETA** (the headline item, replacing the originally-planned
  FIR teaser at Markus's redirect — see below) — up to the 2 soonest sports:
  "Badminton → Level 8 next week at this pace" / "Tennis → Level 7 in ~3 weeks
  at this pace". New `Game.trainingForecast(plan)` in `packages/engine/src/facade.ts`
  repeats the plan's session counts forward through the same
  `expectedWeeklyGain` math `previewPlan` already uses (skill/taper compounding
  week over week, fatigue/age held at today's value), horizon capped at
  `BALANCE.forecast.trainingForecastHorizonWeeks` (12). A sport with no
  sessions this pace, already maxed, or too slow to cross within the horizon
  is simply omitted — a queue of what's *about to* finish, not a status report.
- **Tournament entry closing next week** — `store.closingSoonEntries`, a plain
  filter over the existing `tourEntries`/`BALANCE.tournament.entryDeadlineWeeks`,
  no new engine code.
- **Payday landing this/next week** — new `Game.weeksUntilPayday()`, shown only
  when ≤1 week out (a distant "payday in 9 weeks" every week forever would be
  noise, not a hook).

**Redirect from the user mid-build**: the original spec's FIR-ranking teaser
line was explicitly dropped — "predict when the next racket skill increase
will come if continuing in the same pace with training" was judged the
stronger Civ-"build pipeline" analog (a production queue is about *your own
plan's* momentum, not a world-state projection), and simpler to keep honest
(no need to explain a projected rank that might not land that way). Kept the
other three P1 lines since only the FIR line was singled out to skip.

**Why first**: it converts anticipation that already exists in the engine into
*felt* anticipation. Every summary now ends on a hook, not a receipt — verified
live: all 4 lines can fire simultaneously (screenshotted mid-session), the
training ETA correctly recomputes week to week as the plan carries forward
(3 weeks → 2 weeks → "next week" → levels up), and the Summary screen shows
the *just-submitted* plan's pace immediately, since the draft `store.slots`
persists across `nextWeek()`. 6 new engine tests (`facade.test.ts`), 431 total
tests green, 0 typecheck errors.

### P2 — Decision events: the StorySystem, scoped for fun (the big one) ✅ launch set shipped (2026-07-19)

Build the designed-but-unbuilt offers mechanism, but scope it ruthlessly around
*arriving minor decisions* rather than narrative flavor. This is the direct
answer to "more important minor decisions that influence the future".

**Mechanism** (keeps the architecture's story rules):

- Extend `InboxMessage` with optional `choices: [{id, label, hint}]` and
  `expiresWeekIndex`. The Inbox UI already supports CTAs (register-from-mail) —
  choices reuse that pattern.
- Choosing writes a **pending effect** to career state; core systems execute it
  during the *next* `submitWeek` (Planning/Economy/Training pick their own ops).
  Story still never mutates core stats directly — the offers-only write rule
  holds.
- Events are content JSON per the original DSL sketch (fable_plan §9): trigger
  conditions over existing facts (`fatigue`, `money`, `neglectWeeks`,
  `weeksSinceTournament`, `lastResult`, `soreness`, month of year), `weight`,
  `cooldownWeeks`, pity timer so quiet stretches guarantee an arrival. Draw 0–1
  event per week; most weeks should have one.
- **Expiry is the addictive part**: most offers are answerable this week only.
  An unanswered offer that expires is a real (small) cost — that's what makes
  opening next week matter.

**Launch set (~12 events).** Each is a small choice with a consequence the
player will feel 1–8 weeks later, always traceable to their situation:

| Event | Trigger flavor | The minor decision |
|---|---|---|
| Sparring invite from a *named nearby-ranked real NPC* | you're within ±1 division of them, same country | Accept: +form/skill in their best sport, +fatigue, risk of a confidence knock if outclassed. The real-name hook, weekly. |
| Club league night | 2+ weeks since last competitive match | A low-stakes friendly **using the existing match engine** — form + pocket money vs an evening's fatigue |
| Boss asks for overtime | money < ~4 weeks of expenses, or randomly | Money now + career-attribute goodwill vs fatigue and a lost slot |
| Early-bird flight deal | a far tournament's deadline is 3–4 weeks out | ~40% off that event's travel **if you register this week** — manufactured urgency for a real decision |
| Strings pop / shoe sole gone | trained that sport ≥3× last week | Pay now, or carry −form in that sport until you do |
| Physio slot open | soreness or fatigue high | €X for −soreness and 2 weeks of reduced injury risk |
| Junior wants coaching | ranked above ~#300 domestically | An evening slot for money + community goodwill (future sponsor-arc seed) |
| Training camp invite | off-season / no tournament in 3 weeks | Expensive week, big multi-sport gains, high fatigue — a template-breaking week |
| Local paper interview | after a title or upset win | Confidence + visibility (sponsor seed) vs a "jinxed it" risk flavor |
| Comeback arc opener | injury just healed | Choose the cautious or aggressive return plan — sets a 3-week modifier |
| Coach offers a focus block | a sport 2+ levels behind the others | Commit 3 weeks of ≥3 sessions in it for a bonus payoff at the end (a mini-contract with a progress tracker) |
| Gear-head club mate sells a racket | occasionally | Small money for a small permanent equipment placebo — pure identity/flavor |

Note how several (junior, interview, camp) *seed* later arcs — minor decisions
now that a future sponsor/coach system can pay off, which is exactly how
compounding should feel.

**Effort**: interpreter + pending-effects plumbing 2–3 sessions; then events are
content, added forever at near-zero engine cost.

**What actually shipped (2026-07-19)**: the mechanism, fully built, plus 5 of
the 12 events above (**sparring invite**, **physio slot**, **overtime shift**,
**gear wear** — a merge of "strings pop/shoe sole gone", **post-win
interview**). The remaining 7 (club league night, early-bird flight deal,
junior coaching, training camp invite, comeback arc opener, coach's focus
block, gear-head racket sale) are still open — natural next-session work,
same pattern, see "Deliberate deviations from this section's original sketch"
below before adding to them.

**Mechanism, as built** (`packages/engine/src/core/state.ts`,
`systems/decision.ts`, `systems/inbox.ts`, `facade.ts`):

- `InboxMessage` gained `choices?: InboxChoice[]`, `expiresWeekIndex?`,
  `resolvedChoiceId?`. `InboxChoice = {id, label, hint?, effect: PendingEffect}`
  — `PendingEffect` is the closed set of ops this section envisioned
  (`money`/`fatigue`/`soreness`/`confidence`/`skill`/`form` deltas + a digest
  `note`), embedded directly in the choice at message-creation time so it's
  deterministic and replay-stable, never computed later.
- `Game.chooseInboxOption(messageId, choiceId)` is the player's one write path:
  it marks the message resolved and pushes `{weekIndex, effect}` onto new
  `Career.pendingEffects` — a queue, not an immediate mutation (SAVE_VERSION
  24→25). A no-op for an unknown/already-resolved/expired message, so a stale
  UI click can never double-apply.
- New core `DecisionSystem` (first in the weekly pipeline, right after
  Planning) consumes only the entries queued for *this* week, applies them
  (clamped to each stat's real bounds), emits a `decision.resolved` event per
  effect, and clears the queue — the only place a `PendingEffect` actually
  touches stats. `SummarySystem` surfaces the note like any other weekly note.
  InboxSystem/event generation itself never mutates stats — offers-only holds.
- Event *generation* lives in `systems/inbox.ts`'s `DECISION_EVENTS` +
  `addDecisionEvent`, called from `InboxSystem.run` (which alone has an RNG
  stream) via a new optional `rng?` param on `generateInboxMessages` — the
  two other call sites (world-creation seeding, `simulateWeek`'s next-week
  pre-population) omit it, so decision events only ever arrive through the
  normal weekly pipeline, never at career start or as a next-week preview.

**Deliberate deviations from this section's original sketch** (worth reading
before extending the launch set, so a future session doesn't have to
re-derive them):

- **TS event definitions, not a JSON content DSL.** The original fable_plan
  §9 sketch (and this doc's first draft) imagined data-driven JSON events
  with a trigger condition language. What actually exists in `inbox.ts`
  already — invitations, draw emails, potential clues — is hand-written TS
  functions per message kind, not a generic interpreter; `DECISION_EVENTS`
  follows that same established, already-idiomatic pattern rather than
  building a new DSL runtime for 5 (now 12-ish) events. Revisit only if the
  catalog grows large enough that a real interpreter starts paying for
  itself.
- **Uniform random pick among eligible events, no `weight` field.** At this
  catalog size a weighting system added complexity without changing what
  actually shows up in practice; add `weight` back if/when the catalog grows
  and some events should clearly be rarer than others.
- **No new "weeksSinceTournament"/"lastResult" trigger facts** — the launch
  set's triggers all read state that already existed (`condition.fatigue`,
  `career.money`, `career.trainedWeeks`, `career.inbox`, this week's event
  log for `tournament.won`). Cooldowns and the pity timer are derived by
  scanning `career.inbox` for prior `decision:${id}:*`/`decision:*` message
  ids (`weeksSinceFired`) rather than persisted counters, so
  `generateInboxMessages` stays pure — no new Career fields were needed
  beyond `pendingEffects`.
- **Club league night was deliberately excluded from this pass** — reviving
  a playable friendly match would undo the 2026-07-09 decision to remove
  friendly matches from the game entirely (see project memory). If it's
  built later, resolve it as a simulated (non-interactive) outcome via
  `simulateMatchAuto`, never a live playable match.
- **New tuning lives in `BALANCE.events`**: `weeklyFireChance` (0.5),
  `pityWeeks` (4 — a fresh career's very first submitted week already forces
  one, since "weeks since any decision" starts at `Infinity`), `eventCooldownWeeks`
  (6, per specific event id), `answerWindowWeeks` (2).

**Verified**: 5 new engine tests (`test/decision.test.ts`, `DecisionSystem`
exercised directly against a hand-built context — full-pipeline differential
tests turned out fragile against fatigue's 0–100 clamp after many advanced
weeks, so the precise clamped-delta assertions moved here) + 6 in
`test/inbox.test.ts` (pity-guaranteed arrival, per-event cooldown spacing,
queue→apply→note round-trip via twin `Game.fromSave` instances, expiry as a
true no-op, idempotent double-answer). 434 total tests green, 0 typecheck
errors. Live-verified end to end in-browser: a sparring invite fired on the
very first submitted week (pity), showed 🤔 icon + two choice buttons with
hints + an "Answer by week 3 or it expires" deadline line, resolved to "✓ You
chose: Accept the invite" on click, and the next week's Summary correctly
showed "Sparring with Alice Flatman sharpened your table tennis." in the
weekly notes — the full choice → queue → `DecisionSystem` → summary pipeline
confirmed working, not just unit-tested.

**Follow-up polish, same session (2026-07-19)**: Markus played it and asked
for three fixes. **(1) Same-nationality partners** — `sparringPool` (was
same-gender tier-1 NPCs only) now also filters `identity.nationality ===
human.identity.nationality`; every real imported nation has dozens of
same-gender compatriots (checked: all 7 character-creation nationalities
have 20–234 real players each), so this doesn't starve the trigger. **(2)
"In town this week" flavor** — body reworded from "ranked close to you on
the circuit" to "{name}'s in town this week and after a hitting partner."
**(3) Clickable partner profile** — new generic `InboxMessage.relatedPlayerId?`
(purely optional, no SAVE_VERSION bump needed) lets any decision message
name a specific player; `Inbox.svelte` renders a "View {name}'s profile ▸"
button (same `store.viewOpponent()` used everywhere else) whenever it's set.
Only sparring-invite sets it today, but the field is generic — a future
"junior wants coaching" event could reuse it for the junior. 2 new tests
(nationality never crosses borders, checked against an injected foreign
pool since testContent's own roster is uniformly Swedish; body/link/from
all correctly reference the resolved partner). 436 total tests, 0 typecheck
errors, live-verified (an Austrian-created human's invite came from
"Magdalena Lentsch" 🇦🇹, body said "in town this week," and the profile
link opened her real opponent-profile screen with correct nationality flag).

**Second follow-up, same session**: Markus caught a real design gap —
accepting cost nothing from the 21-slot budget, contradicting the core pillar
("I want to do everything, but I don't have enough time"). Fixed by making
accept **reserve a real slot**, not just grant a flat bonus:

- New `PendingEffect.reserveSlot?: {activity}` + `Career.reservedSlots:
  {weekIndex, slotIndex, activity}[]` (SAVE_VERSION 25→26). Reservation is
  written *immediately* by `Game.chooseInboxOption` (not deferred like the
  rest of the effect) via a new `pickWeekendEveningSlot` helper — Saturday
  evening first, Sunday evening if that's already spoken for — so the
  Planner shows the commitment the moment it's made, potentially weeks
  before that week is actually submitted.
- New `Game.reservedSlotsThisWeek()`; `store.availableSlots()` now forces
  the reserved activity into the submitted plan (travel/tournament still
  win on the rare clash — you can't be at a tournament and a hitting
  session at once). `Planner.svelte` renders the slot as its real activity
  (not an amber "blocked" warning — it's a real, *better* session, not lost
  time) with a colored ring and disables picking it.
- **Rebalanced the reward** now that the slot is real: dropped the old flat
  `form: +4` (redundant — a real forced `trainSport` session already grants
  normal per-session form gain via `TrainingSystem`) in favor of `skill: +8`
  (a genuine bonus *on top of* whatever that session's own gain works out
  to — proven in a test: total gain that week is strictly greater than the
  flat +8 alone, confirming a real session ran, not just the bonus).
  `fatigue: +3 → +2` (the forced session's own natural fatigue cost already
  applies through the normal pipeline; this is only the small extra "tried
  harder against a good partner" toll).
- 3 new engine tests (reserve-on-accept picks Saturday evening, decline
  reserves nothing, the reserved slot's own training gain measurably adds
  on top of the flat bonus). 439 total tests, 0 typecheck errors.
  Live-verified: accepted a badminton invite → Saturday evening flipped
  from "—" to a ringed "BA" tile, click-blocked → simulated the week →
  Badminton leveled up, form went to "razor sharp," and — a nice emergent
  proof the slot is a *real* session, not a scripted one — the extra
  badminton load that week even triggered a normal injury roll, same as
  any other heavy training week would.

**Third follow-up, same session — corrected to weekday-biased, randomized**:
Markus clarified he'd misspoken — he meant *weekday* evenings should be the
common case, with some randomness, and possibly a weekend session too, not
an always-Saturday default. Reworked so the proposed day is resolved once
at message-**build** time (not accept time): `PendingEffect.reserveSlot`
gained an explicit `slotIndex` (was activity-only, with the exact slot
picked later at accept time) — `proposeEveningDay()` rolls 70% weekday
(uniform Mon–Fri) / 30% weekend (uniform Sat–Sun) via the event's own `rng`,
so the body text ("...free Wednesday evening...") and the eventual
reservation always agree on the same day, deterministically. Removed the
now-dead `pickWeekendEveningSlot` accept-time picker entirely — each event's
`build()` owns its own proposed slot now, a more flexible pattern for future
slot-reserving events too. 2 tests replaced the old hardcoded-Saturday one:
an exact-match check (proposed slot always equals the reserved slot) and a
30-seed sweep proving both weekday and weekend proposals occur, weekday
more often, and the body/hint text always name the correct day. 440 total
tests, 0 typecheck errors. Live-verified: one career's invite proposed
"Tuesday evening" and reserved exactly that slot in the Planner (not
Saturday) — confirmed the whole day-agreement chain end to end.

### P3 — Week modifiers: make the planner a fresh micro-puzzle ✅ done (2026-07-19)

The template-autopilot fix. Each week has a chance (~40–50%, never more than one)
of a rolled, seeded **modifier** shown as a planner banner, reflected in the
forecast:

- "Squash courts closed for maintenance this week" (that activity unavailable)
- "Guest coach at the club Tue–Thu — badminton sessions +50%"
- "Club open-house Saturday — social slots free and doubled"
- "Heat wave — outdoor tennis costs extra fatigue"
- "Your training partner is away — solo sessions slightly weaker"

Suddenly the saved template needs a 10-second tweak most weeks — which is the
right size of decision for a game whose weeks should plan in under a minute.
Engine-side it's one small roll at week start + PlanningSystem/forecast reading
it; the holidays system already proves the pattern.

**Built as designed, 5 launch modifiers close to the sketch above** (`packages/
engine/src/systems/modifiers.ts`): squash-closed (`sportMultiplier: {sq: 0}`),
badminton-boost (`{bd: 1.5}`), open-house (`socialMoneyMultiplier: 0`,
"doubled" simplified to "free" — a second lever for a fatigue-recovery
multiplier felt like scope creep for a first pass), heat-wave
(`extraFatiguePerSession: {tn: 3}`), and quiet-club (a mild `0.85×` multiplier
across all four sports, replacing the vaguer "training partner away").

**Architecture — a pure roll + a content swap, exactly per the holidays
precedent, no new persisted state at all**: `activeWeekModifier(seed,
weekIndex)` is a pure function (`new Rng(childSeed(seed, week, "modifier"))`,
`BALANCE.modifiers.chance` = 0.45), so it's fully replay-stable without
`GameState` gaining a single new field — a genuinely lighter mechanism than
either P1 or P2. The clever bit is `weekModifierContent(content, modifier)`:
rather than teaching every affected system (Training/Fatigue/Economy/the
forecast) its own modifier-aware branch, it returns a shallow-adjusted
`ContentBundle` with the relevant `ActivityDef`'s `trainingBase`/`fatigue`/
`money` pre-baked — every downstream reader already pulls those numbers
straight off `content.activities`, so passing the adjusted bundle in is the
*entire* integration surface. **Crucially human-only** (a modifier reads as
"your club this week," not a world event every NPC should also feel):
`TrainingSystem`/`FatigueSystem` resolve per-player which content to use
(`player.identity.id === ctx.state.career.playerId ? humanContent :
ctx.content`), `EconomySystem` just always uses the adjusted content since
it was already human-only. `Game.previewPlan` applies the same swap so the
live forecast the player is deciding against already reflects the week's
modifier before they even hit Simulate. New `Game.weekModifier()` (a
`{headline, body, blockedSport?}` view) feeds both the Planner's banner and,
via `blockedSportOf()`, a new disabled-picker reason exactly like the
existing holiday/vacation-days blocking (`Planner.svelte`'s
`pickingUnavailable`) — closed courts can't be *newly* picked, but a
pre-existing drafted session there is deliberately left alone rather than
auto-corrected, so the "needs a 10-second tweak" premise stays real (an
auto-fix would remove the puzzle).

**Verified**: 13 new engine tests (`test/modifiers.test.ts`) — determinism,
distribution within the expected band over 400 simulated weeks, each
`weekModifierContent` field adjustment in isolation, `blockedSportOf`, plus
3 full-pipeline integration tests (a squash-closed week's human training
gain is exactly zero — not just reduced — while `Game.weekModifier()`
correctly reports `blockedSport: "sq"`; a quiet week correctly reports
`null`; an open-house week's social sessions are genuinely free end to end,
checked via the real weekly summary's money delta). 453 total tests
(395 engine + 58 content), 0 typecheck errors. Live-verified in-browser
across several real simulated weeks: the 🎲 banner rendered with the
correct headline/body on two separate open-house rolls, and the second
roll's forecast bar showed the exact expected discounted weekly cost with
social genuinely free — confirming `previewPlan`'s modifier-aware forecast
matches what the week actually charges once submitted.

**Follow-up, same session — hemisphere-aware seasonality**: Markus asked
whether the weather-flavored modifier ("heat wave," extra tennis fatigue)
was realistic given the season it rolls in, since not every player is
Northern Hemisphere. It wasn't — the original version could fire in a
Swedish January just as easily as July. Fixed properly rather than just
hardcoding "summer = June–August": `WeekModifierDef` gained an optional
`season` field (`"winter" | "spring" | "summer" | "autumn"`), and
`activeWeekModifier` now takes the calendar plus the human's home
**latitude** (`homeLatitudeFor(content, nationality)`, read straight off the
existing `countries.json` data already used for travel costs) and computes
the player's own *local* season — a negative latitude flips the Northern
Hemisphere calendar (Dec–Feb winter → Jun–Aug there, and vice versa) via a
small `localSeason()` helper, so a heat wave only ever rolls in whichever
months are actually summer for that player's own hemisphere. Every
character-creation nationality today (SE/DK/FI/NO/DE/AT/GB) is Northern, so
this has no visible effect on any playable career *right now* — but it's
the correct general mechanism, ready the moment a Southern Hemisphere
nationality is ever added, rather than a fix that would need redoing later.
Only `heat-wave` is season-gated; the other 4 modifiers stay year-round
(closed courts, a guest coach, an open-house, and quiet regulars aren't
weather-tied). `activeWeekModifier`'s signature grew to `(seed, weekIndex,
calendar, homeLat)`; both `orchestrator.ts` and `facade.ts` now derive
`homeLat` from the human's own nationality before calling it (`facade.ts`
consolidated this into a small private `currentWeekModifier()` helper so
`previewPlan`/`weekModifier()` don't duplicate the derivation). 4 new tests
prove the flip in both directions (a Northern heat wave never leaves
Jun/Jul/Aug across 300 simulated weeks and does occur at least once; a
Southern one is confined to Dec/Jan/Feb instead; non-seasonal modifiers are
provably unaffected by hemisphere). 457 total tests (399 engine + 58
content), 0 typecheck errors, live-verified the app still boots and plans
correctly post-refactor.

### P4 — Rivals: make the world's results personal

No new simulation — NPCs already play weekly and earn points. Derive 1–3 rivals
automatically and keep them fresh:

- nearest same-gender neighbor on the FIR ladder,
- anyone with ≥2 head-to-head meetings,
- anyone who beat you in a final / you've never beaten.

Surface them: inbox one-liners when a rival gets a result ("Lindqvist took
bronze in Vienna — he's 14 points ahead of you now"), highlighted rows in
Rankings, draw framing ("path crosses Lindqvist in the QF"), a rival card on Me
with the head-to-head. Small confidence swing on rival matches so the label has
teeth. Rival results become exactly the kind of news that makes a player sim one
more week *to respond*.

### P5 — Goals ladder: short arcs with a face

Diegetic, coach-framed commitments:

- **Season goal**: pick 1 of 3 at season start, scaled to current rank percentile
  ("break top 150", "win a SAT title", "medal in every sport's class"). Progress
  visible as a strip on Plan; completion → trophy cabinet + a new, bigger goal.
- **Micro-goals**, auto-issued 2–4 weeks out: "win 2 matches in Copenhagen",
  "get squash form to 15 before the Swedish Open", "bank €500 by March".

Rewards stay mostly narrative (confidence, trophy entries, coach mails) — goals
are direction, not a second economy. The ladder structure (finish one → next one
arrives) is a classic retention arc and it's honest here: it's just a coach who
keeps raising the bar.

### P6 — Positive variance & threshold teasers (sprinkle throughout)

Today's surprise budget is nearly all negative (injuries). Balance it:

- **Breakthrough sessions**: rare, pity-timed "something clicked" training weeks
  (2–3× gain in one sport) with a diegetic note. Slot-machine variance on the
  *good* side, fully within the existing training randomness plumbing.
- **Near-threshold visibility**: "TT level 9 within reach this week" in the
  forecast when a level-up is ≤1 good week away; "top 150 in reach this month"
  from pending FIR points. Being visibly 1 week from a threshold is the purest
  one-more-week fuel that exists.
- **Losses as setups**: every bad beat should open a hook — injury starts the
  comeback arc (P2), a rival loss frames the rematch (P4), a missed goal issues
  a redemption goal (P5). The player should never end a week with only a
  downside and no thread to pull.

---

## 3. Guardrails

- **Honest addictiveness only.** Offline single-player, no real-time timers, no
  FOMO outside the fiction (offer expiry is diegetic and consequence-scaled).
  The pull must come from wanting to know what happens, not from anxiety.
- **Randomness stays consequence** (pillar 2): every event trigger reads state
  the player shaped. No bolt-from-the-blue events.
- **Offers-only write rule holds**: story/inbox systems append offers; core
  systems execute accepted effects next week. No exceptions, or determinism and
  the architecture both rot.
- **One arriving thing per week, max** (one event *or* one modifier as the
  headline). Weeks must stay plannable in under a minute; three simultaneous
  banners is noise, not tension.
- **All tuning in `balance.ts`/content**, events as JSON — same rules as ever.

## 4. How we'll know it's working (playtest heuristics)

1. **Hook coverage**: at the "Plan next week ▸" moment, ≥1 forward-looking line
   is visible *every* week; ≥2 most weeks (overlapping timers).
2. **Arrival rate**: ≥50% of weeks deliver a decision (event, modifier, or
   goal beat). No 3-week stretch with none (pity timer).
3. **Template-break rate**: the share of weeks submitted as an unmodified
   template should drop below ~half once P2+P3 land.
4. **The stop-point test**: playtest by intending to play 4 weeks and noting
   where you actually stop. Stopping should feel like a chapter break (post-
   tournament, goal completed) — never mid-slump boredom. If you stop between
   tournaments, find which missing hook would have pulled you across.

## 5. Suggested build order

| Step | What | Size |
|---|---|---|
| 1 | P1 coming-up strip (summary + planner) incl. projected-FIR teaser | ~1 session |
| 2 | P2 core: choices/expiry on InboxMessage, pending-effects execution, trigger interpreter, first 6 events | 2–3 sessions |
| 3 | P3 week modifiers (4–5 to start) | ~1 session |
| 4 | P4 rivals (derivation + inbox/rankings/draw surfacing) | 1–2 sessions |
| 5 | P2 content pass: remaining events incl. comeback + focus-block arcs | ~1 session |
| 6 | P5 goals ladder | 1–2 sessions |
| 7 | P6 breakthroughs + threshold teasers | ~1 session |

This effectively *re-scopes M3* around fun: the sponsor/equipment/coach systems
from docs/06 stay future work, but P2's events deliberately plant their seeds
(goodwill, visibility) so they'll land in an already-living world.
