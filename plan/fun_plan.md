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

### P1 — "Coming up" hooks (tiny effort, do first)

A forward-looking strip, built purely as a read-model over existing state — no
new sim. Shown in two places: the **bottom of the weekly Summary** (immediately
above "Plan next week ▸" — the moment the one-more-week decision happens) and
the **top of the Planner**.

2–4 lines, only ever near-term facts the engine already knows:

- "Copenhagen Open entry closes **next week**" (registration deadlines)
- "Your draw for Vienna publishes Monday"
- "Payday lands this week" / "FIR ranking update on the 1st — projected **#143 (▲6)**"
- "3 weeks to the Swedish Open — your squash form is 9/20"
- Later, from P4: "Rival plays in Hong Kong this weekend"

The projected-FIR teaser is the strongest single line: pending points already
accumulate in state before monthly publication, so "if the month ended today
you'd move to #143" is pure selector work, and it makes every mid-month week a
step toward a known reveal.

**Why first**: it converts anticipation that already exists in the engine into
*felt* anticipation, for roughly a day of work. Every summary should end on a
hook, not a receipt.

### P2 — Decision events: the StorySystem, scoped for fun (the big one)

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

### P3 — Week modifiers: make the planner a fresh micro-puzzle

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
