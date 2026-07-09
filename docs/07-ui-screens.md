# 07 — UI screens & information architecture

How the game is navigated, what each screen shows, and — importantly — the
three-layer model that governs **which numbers a player is allowed to see**.

Almost every screen is a **read-model over the `Game` facade**
([facade.ts](../packages/engine/src/facade.ts)): UI + a selector, no engine
change. Only two destinations need genuinely new engine state — the **World
Tour race** (a season points accumulator) and the **Inbox** (events, M3).

---

## The three information layers

This is the spine of the whole UI. Three distinct concepts, often confused,
must stay separate on screen:

| Layer | What it is | Shown to player? | Source |
|---|---|---|---|
| **1. True skills & hidden attributes** | Per-sport skill (0–1000) + AI-facing hidden attributes (talent, professionalism). The **hidden latent variables** the match engine actually uses. | **No** — never as raw numbers | `player.attributes` |
| **2. Glicko-2 ratings** | Per-sport statistical **estimate** of strength, inferred from match results. An **add-on**, with its own uncertainty (RD). | Yes — as an analytical view | `player.ratings` |
| **3. FIR ranking** | **Points earned from tournament placements.** The official competitive standing. **Independent of Glicko.** | Yes — the headline number | ranking points (M1 state) |

Key relationships:

- **Layer 1 is the truth; Layer 2 is a noisy estimate of it; Layer 3 is not
  about skill at all** — it rewards *results/placement*, so a lucky run or a
  soft draw can lift FIR points without the underlying skill moving, and vice
  versa. That gap is intentional drama.
- **Glicko-2 is a companion, not the ranking.** The screen lists it *beside*
  FIR points, clearly labelled as an estimate. Two players can be ranked in one
  order by FIR points and the other order by Glicko — that tension is content.
- **The five creation attributes (Stamina/Intelligence/Clutch/Composure/
  Resilience) and rolled personality traits are visible on your own "Me"
  screen**, banded 1–20 / shown as flavor text — they're identity, not a
  simulation-internals leak, and revealing them immediately (rather than a
  gradual reveal mechanic) is the simpler, chosen design. **They stay fully
  hidden for every other player** — `OpponentView` carries neither field, so
  the "who will this junior become?" mystery is preserved for opponents even
  though it isn't for yourself.
- **Traits are narrative flavor, not stat modifiers.** Most of the 50-trait
  pool (`packages/content/data/traits.json`) carries no mechanical hook at
  all — they're for identity and future story hooks (Inbox rumors, career
  narrative), not `+5%/-5%` bonuses. A character gets 1-2 positive + 1-2
  negative + 1-2 neutral traits, capped at 4 total, weighted by rarity
  (common/uncommon/rare), with an `excludes` list preventing contradictory
  pairs (e.g. Night Owl + Morning Person). Only the human player rolls traits
  today — NPCs don't yet.

### What you may show, per player

- **Your own character:** levels **1–20 per sport** (a banded, low-resolution
  view of your hidden skill — this is the Pokémon-GO progression feedback and
  the *only* place a true-skill-derived number surfaces), your Glicko-2
  ratings and FIR points, plus your five attributes and personality traits.
- **Every other player:** Glicko-2 ratings + FIR points + results only. **No
  levels, no attributes, no traits** — you infer their strength from the
  estimate and their record. *(Note: `OpponentView` today exposes opponent
  levels; that should be swapped for Glicko + FIR when the ranking layer
  lands — see Open decisions.)*

---

## Navigation model

A **5-tab bottom bar** for persistent destinations, with match/result and other
multi-step actions running as **full-screen flows over the top** (no tab bar),
exactly like the existing `Simulate → Summary → Match` sequence.

```
┌─────────────────────────────────────────────┐
│                 (screen body)                │
│                                              │
│   full-screen flows take over the whole      │
│   view: Simulate → Summary → Match,          │
│   Tournament detail, New career, Settings    │
│                                              │
├─────────────────────────────────────────────┤
│  Plan   Tour   Rankings   Inbox    Me        │  ← bottom tab bar
└─────────────────────────────────────────────┘
```

---

## Tabs

### Plan (home) — ✅ built
The week planner: 21 slots, quick templates, live forecast chips, Simulate.
Where the player spends most of their time. Later gains a **goals** strip that
drives goal-based autofill.
Source: `you`, `weekLabel`, `previewPlan`, `submitWeek`.

### Tour — the annual world tour — ✅ built (calendar + advance registration; real season is M2)
Full-season calendar of tournaments the player can register for ahead of
time: date, and (once M2's real calendar + TravelSystem land) city, tier,
distance/hotel. Tap a tournament to expand entry fee/field/prize detail
inline (a lightweight drill-in, not a separate route yet — see below),
including **who else has entered** — the projected NPC field, shown as
name + Glicko rating only (never a true-skill-derived level, per the layers
rule above).

Built as `Tour.svelte` + `Game.tournamentSchedule(count)`, reachable via a
persistent bottom `TabBar` (Plan/Tour) shown on both tab screens, per the nav
model above. Since only one `TournamentDef` exists until M2 replaces the
recurring placeholder, every row is currently the same "Monthly Open" —
`tournamentSchedule` projects its next N occurrences forward from
`isTournamentWeek`/`advanceWeek` without touching `GameState`, each tagged
with a `status`: **open** (registerable), **registered** (committed), or
**closed** (the `entryDeadlineWeeks` window passed without registering — no
same-week fallback, so planning ahead is a real requirement). A registered
entry can be withdrawn any time before it's played; the entry fee isn't
charged until the tournament week arrives and it's actually played
(`Game.enterTournament`). The planner shows a "Play ▸"/"Withdraw" banner only
for a tournament the human is registered for this week, or a muted
informational note ("entry closed") if one's happening but wasn't registered
for in time.

**Still to build**: a genuinely separate Tournament-detail full-screen flow
(bracket/draw, opponents' Glicko+FIR, your projected path) — folded into an
expandable card for now since there's only one tournament shape to show;
worth splitting out once M2 gives tournaments real per-event identity
(different fields/tiers/cities). City/tier/distance/hotel columns wait on
M2's FIR season calendar + TravelSystem.

### Rankings — FIR points **and** Glicko, kept distinct
Two segments the player toggles between; never merged:

- **FIR ranking** (default) — points from tournament placements. Combined plus a
  per-sport filter (Combined / TT / BA / SQ / TE), since racketlon rewards
  specialists. This is the "official" ladder.
- **World Tour race** — season-to-date points, resets each year (an
  Order-of-Merit / ATP-Race view); drives tour-finals qualification.
- **Glicko-2 ratings** — a third segment, or a labelled column, presenting the
  per-sport rating estimate + uncertainty as an **add-on**, explicitly *not* the
  ranking.

Monthly cadence: FIR points recompute on a monthly tick (matches the real
world's monthly updates). Tap any row → that player's profile.

### Inbox — the living world — ✅ first cut built (pulled forward from M3)
Diegetic feed of messages with an envelope tab + unread badge. Built early at
Markus's request with two message kinds so far:
- **Tournament invitations** — one per event, `inbox.inviteLeadWeeks` (4) weeks
  before its entry deadline; the mail registers straight from the inbox (or
  deep-links to Tour) — the first **interactive offer**.
- **Monthly world-ranking digest** — a frozen top-`rankingTopN` standings
  snapshot on each calendar-month boundary, ranked by **combined Glicko**
  (a stand-in until real FIR points exist — see Open decision #2).

Messages live in `career.inbox` (SAVE_VERSION 4), generated by `InboxSystem`
(a read-only Story system — appends to the offers surface, never mutates core
stats) plus a career-start seed so the inbox is alive on the first screen. Each
carries a `read` flag; `Game.inbox`/`unreadCount`/`markInboxRead` back the UI.
Extending the living world = another case in `generateInboxMessages` (rumors,
sponsor offers, results recaps, coach SMS…).
Source: `career.inbox` via `Game.inbox` (`InboxSystem`).

### Me — your player
Your character hub: the four sport **levels 1–20** with progress bars, condition
(fatigue / form / confidence), age, club, nationality, and career stats (titles,
prize money, W/L). Your Glicko + FIR shown here too as the external mirror of the
internal levels. Sponsors, equipment, coach relationships, finances, and
achievements start as **sections here** and graduate to their own screens later.
Source: `you`; extended as career state grows.

---

## Drill-in / full-screen flows

- **Match** — ✅ built. Point-by-point play with tactic breaks. Entered from a
  tournament (or the current friendly-match sandbox).
- **Weekly summary** — ✅ built. Post-simulation digest.
- **Tournament detail** — the bridge from Tour to Match: draw/bracket, field
  strength (shown via opponents' Glicko + FIR, never their true skill),
  entry/travel cost, your projected path, enter/withdraw.
- **Player profile (others)** — opened by tapping any name in a draw, ranking, or
  rival mention: Glicko ratings, FIR points, recent results, head-to-head vs you.
  The "beat someone you know from real tournaments" hook. Same shell as **Me**,
  minus the private career/economy and minus levels/traits.
- **New career / character creation** — required for replayability & onboarding:
  name, nationality, home club, starting archetype/difficulty. Feeds world
  generation. (Today the human is hardcoded "Alex Berg".)
- **Settings** — save slots, sim speed, start-new-career, later content updates.

---

## Sections that become screens later

Build inside **Me** first; split out when they earn the space:

- Sponsors, Equipment, Coach relationships — M3
- Finances / money history
- Achievements / trophy cabinet; career history + leaderboards — M4
- Goals — may stay a strip on **Plan** rather than its own screen

---

## Priority by milestone

- **M1:** Me, ~~Tour (calendar)~~ ✅ done, Tournament detail, other-player
  profile, New career — the minimum to navigate and replay a full loop.
  (Tournament detail is folded into Tour's inline expand for now; Me and
  other-player profile are still unbuilt.)
- **M1–M2:** Rankings (FIR points first; Glicko column alongside; race once tour
  points exist), Settings.
- **M3:** Inbox goes live; Sponsors/Equipment/Coach graduate out of Me.
- **M4:** Achievements, career history, leaderboards.

---

## Open decisions

1. **`OpponentView` exposes levels.** ⚠️ partially addressed: `OpponentView`
   gained a `rating` field (combined Glicko, rounded) and the Tour screen's
   "who's entered" list uses only that — but `sports.level` is still present
   on the type (unused in any current UI) rather than removed, and FIR points
   don't exist yet to add alongside it. Full cleanup (drop `sports.level`,
   add FIR) waits on decision #2. (`facade.ts`)
2. **FIR points formula & window.** Points per placement per tier, and whether the
   ranking is a rolling 12-month window or cumulative — a `RankingSystem`
   addition distinct from the Glicko rating period. (04-simulation-systems.md
   currently specs only the Glicko period.)
3. **Race vs FIR relationship.** Confirm the race is a separate season accumulator
   vs simply the season-window view of FIR points.
4. ~~**Trait reveal.**~~ Resolved: traits show immediately on the Me screen,
   no gradual reveal mechanic. Still open: whether/how NPC traits eventually
   surface indirectly (rumors, scout reports) once NPCs roll traits too.
