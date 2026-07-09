# 01 — Vision

**Racketlon Life** is a mobile-friendly management game about an amateur racketlon career.
You manage one player through the four sports — table tennis, badminton, squash, tennis —
across a life of limited resources: time, money, energy, the body, injury risk, work,
training, travel, and tournaments.

Inspirations: *Jones in the Fast Lane* (life juggling), worker-placement board games
(*Agricola*: limited slots, painful trade-offs), *Hattrick* / *Football Manager* at a much
smaller scale (a living sports world), RimWorld-lite (emergent stories), and *Pokémon GO*
(clear, frequent progression feedback).

## The core feeling

> "I want to do everything, but I do not have enough time, money, or energy."

Every week is a hand of decisions. A week should take under a minute to plan, but the
results, progression, and consequences should pull the player into "just one more week".

## The core loop

1. **Plan the week** — 21 slots (7 days × morning/afternoon/evening), worker-placement style
2. **See the forecast** — approximate consequences only: `TT +`, `Fatigue ++`, `Injury risk medium`, `Money −€500`
3. **Simulate** — deterministic engine runs all systems in a fixed order
4. **See results** — skills, level-ups, money, fatigue, events, storylines
5. **Next week**

## Design pillars

1. **Interesting decisions over realism.** The simulation is only as detailed as the
   decisions it creates. No spreadsheet UI — consequences are shown as buckets, never
   exact decimals.
2. **Randomness as consequence.** Events are context-driven (hard training → breakthrough
   *or* injury; cheap hotel → poor sleep; many wins → sponsor interest). Surprises should
   always feel traceable to the player's choices, never unfair.
3. **A real world.** The game world is seeded from real FIR results — real names with
   per-sport Glicko-2 ratings. Beating a player you know from real tournaments is the
   game's unique hook.
4. **Two layers of progression.** Internal ("my table tennis is level 9 now") and external
   ("I'm climbing the ranking, I beat someone rated above me"). Levels 1–20 per sport give
   frequent wins; rankings, titles, sponsors, rivals, and history give long arcs.
5. **A living, aging world.** Players have birth dates and age continuously. New players
   drip into the world (juniors, converts, late starters, rare wonderkids); veterans
   retire. Replays differ.
6. **Diegetic presentation.** Events arrive as SMS, emails, rumors, news — never as
   visible game cards.

## Scope guardrails

Solo developer. Offline single-player. Web/PWA first, app-store wrap later if wanted.
Content updates ship as versioned data bundles — no backend, no accounts, no
server-side simulation.
