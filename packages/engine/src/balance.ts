/**
 * Every tuning constant lives here (or in content data) — never inline in
 * systems. Base per-session values (skill gain, fatigue, money) come from
 * content activities; this file holds the modifiers and thresholds.
 */
export const BALANCE = {
  training: {
    /** floor for the taper multiplier so progress never fully stalls */
    minTaper: 0.05,
    /** potential multiplier = potentialFloor + potential × potentialSpan
     * (potential is 0..1, per sport) */
    potentialFloor: 0.75,
    potentialSpan: 0.5,
    /** per-sport soft skill ceiling = ceilingFloor + potential × ceilingSpan
     * (0..1000 scale) — gains taper toward zero as skill approaches it, but
     * `minTaper` keeps a trickle of progress possible past it (soft cap, not
     * a hard wall — see systems/effects.ts's `skillCeiling`). A potential-1
     * sport tops out right at SKILL_MAX; a potential-0 sport plateaus around
     * level 12. */
    ceilingFloor: 550,
    ceilingSpan: 450,
    /** session quality degrades linearly above this fatigue… */
    fatiguePenaltyFrom: 60,
    /** …down to this multiplier at fatigue 100 */
    fatiguePenaltyAt100: 0.3,
    /** per-session random spread, ± proportion of the expected gain */
    randomness: 0.25,
    /** attribute gain per gym session, on the 0..1 internal attribute scale */
    gymCoreStrengthGain: 0.015,
    /** attribute gain per cardio session, on the 0..1 internal attribute scale */
    cardioStaminaGain: 0.015,
    /** weekly fade for trainable body attributes that were not trained */
    attributeDecayUntrained: 0.003,
    /** weekly fade for trainable body attributes above age declineFromAge */
    attributeAgeDeclineRate: 0.0008,
  },
  recovery: {
    /** natural fatigue recovery per week, on top of rest/social activities.
     * Cut from 15 in M1: combined with a full week of `rest` slots this used
     * to wipe ~85-99 fatigue in one week regardless of how tired you started
     * — too forgiving now that overtraining also feeds injury risk. */
    weeklyBase: 10,
    /** emit condition.warning at or above this fatigue */
    warnAt: 75,
  },
  /**
   * Per-sport "tournament readiness" (docs/07). Not a hidden attribute —
   * visible to the player, distinct from the hidden potential ceiling above.
   * Deliberately has no pull toward a neutral middle: it only
   * moves in response to what you actually did (or didn't do) that week, so
   * the mechanic stays legible — see systems/training.ts/recovery.ts.
   */
  form: {
    /** every new player starts here, in every sport — room to grow into
     * peak readiness, and room to fall if a sport is ignored from week 1 */
    initial: 12,
    max: 20,
    /** +this per session trained this week, in that sport, up to `sessionsCap` */
    gainPerSession: 2,
    sessionsCap: 3,
    /**
     * Staged weekly decay rate for a neglected sport, looked up by how many
     * *consecutive* weeks (including this one) it's gone untrained — see
     * `formDecayRate` in systems/effects.ts and `PlayerCondition.neglectWeeks`.
     * Modeled on how rust actually feels: a short grace period (missing one
     * week barely registers), a real drop once it's been the better part of
     * a month, then a long plateau — you don't keep sliding forever, lost
     * form stays "reasonable" through the middle of a year — before decay
     * resumes for a sport that's been abandoned the better part of a year.
     * Each entry applies once `neglectWeeks >= afterWeeks`; must stay sorted
     * ascending by `afterWeeks`. First-pass tuning, easy to retune.
     */
    decayStages: [
      { afterWeeks: 1, ratePerWeek: 0.3 }, // week 1: barely noticeable
      { afterWeeks: 2, ratePerWeek: 1.0 }, // week 2: losing some edge
      { afterWeeks: 3, ratePerWeek: 2.5 }, // weeks 3-4 ("after a month"): the real drop
      { afterWeeks: 5, ratePerWeek: 0.15 }, // weeks 5-26 (~1-6 months): plateau
      { afterWeeks: 27, ratePerWeek: 0.6 }, // 6+ months: gets worse again
    ] as readonly { afterWeeks: number; ratePerWeek: number }[],
    /** extra decay across every sport when fatigue crosses this (same
     * threshold the old global form-decay code used) */
    highFatigueThreshold: 80,
    highFatiguePenalty: 1,
    /** match-effective skill = skill × (matchFloor + matchSpan × form/max) —
     * even totally out of form (0), most of true skill still shows up, so a
     * neglected sport is a real handicap without ever feeling like a wipeout */
    matchFloor: 0.7,
    matchSpan: 0.3,
    /** +this per real match played in a tournament, in every sport —
     * every match is a set of all four sports (see match/engine.ts), and
     * competitive match play is the single best way to get tournament-sharp,
     * better than a single training session (`gainPerSession`). Applied once
     * per human match at `concludeTournament`, on top of that week's normal
     * `TrainingSystem` pass. */
    matchPlayGainPerRound: 3,
  },
  economy: {
    /** rent, food, phone… charged every week. Whole economy rescaled ~10x
     * down in a second money pass (2026-07-09): the first pass's numbers
     * (starting money 8000, entry fees 200-900) read as an order of
     * magnitude too high once real entry fees and travel were in place. */
    weeklyExpenses: 280,
    startingMoney: 1000,
  },
  injuryRisk: {
    /** current fatigue adds fatigue/divisor to the weekly injury load */
    fatigueDivisor: 10,
    mediumAt: 8,
    highAt: 15,
    /** weekly injury probability = load × this, before durability reduction */
    chancePerLoad: 0.01,
    /** durability (Läkekött) 0..1 cuts that chance by up to this fraction */
    durabilityProtection: 0.6,
    /** hard ceiling so even a reckless training-camp week can't guarantee one */
    maxWeeklyChance: 0.35,
    /** extra "weeks of healing" applied per real week, per point of durability
     * 0..1 — Läkekött doesn't just resist injury, it shortens recovery too */
    durabilityHealBonus: 2,
  },
  /**
   * Age curve (docs/02 "Aging"): a continuous modifier applied every week,
   * not a single M4 event. See systems/age.ts for the shape — youth learns
   * fast, a "prime veteran" window in the late 20s/early 30s adds experience
   * without physical cost yet, then decline sets in and experience only
   * partially offsets it.
   */
  age: {
    /** full youth learning bonus applies at or below this age */
    youthBonusUntilAge: 18,
    /** +35% training gain at youthBonusUntilAge, tapering to 1.0 by youthTaperEndAge */
    youthLearningBonus: 0.35,
    youthTaperEndAge: 24,
    /** match-day physical execution and learning capacity both start tapering here */
    declineFromAge: 32,
    /** match effective-strength penalty per year past declineFromAge */
    declinePerYear: 4,
    /** floor on the physical-decline term alone (before the experience offset) */
    declineFloor: -60,
    /** training-gain decline per year past declineFromAge (gentler than match decline) */
    learningDeclinePerYear: 0.015,
    learningDeclineFloor: 0.6,
    /** accumulated tournament know-how starts offsetting decline from this age */
    experienceFromAge: 28,
    experiencePerYear: 1.5,
    /** the experience offset caps — know-how alone can't outrun the body forever */
    experienceCap: 15,
    /** natural weekly fatigue recovery starts slowing past this age */
    recoveryDeclineFromAge: 30,
    recoveryDeclinePerYear: 0.015,
    recoveryFloorMult: 0.55,
    /** injury chance starts rising past this age */
    injuryRiskFromAge: 30,
    injuryRiskPerYear: 0.02,
    injuryRiskCap: 0.6,
  },
  /**
   * Permanent (not just match-day) skill erosion with age — see
   * systems/aging.ts. Two layered effects, both starting at
   * `declineFromAge` (shared with BALANCE.age's own decline turning point):
   * a small continuous weekly erosion (the steady "linear" decline felt
   * between the two cliffs below), plus two one-time "cliff" step-downs
   * confined to five-year windows around 40-45 and 60-65 — real athletic
   * decline isn't perfectly smooth, it also comes in noticeable jumps
   * around these ages. Each window rolls a small weekly chance to fire, so
   * different players hit their wall at a different, unpredictable point —
   * the chance escalates in the window's final year so it's virtually
   * guaranteed to have fired by the time the player ages out of it, without
   * ever being a hard-coded certainty. First-pass tuning, easy to retune.
   */
  aging: {
    declineFromAge: 32,
    /** fraction of current skill lost per week, compounding, from
     * declineFromAge onward — deliberately gentle; the step-downs below
     * carry most of the felt decline */
    weeklyDeclineRate: 0.00015,
    step1FromAge: 40,
    step1ToAge: 45,
    step1WeeklyChance: 0.03,
    /** escalation multiplier applied to the weekly chance during the
     * window's final year, so it's very likely to fire before ageing out */
    finalYearChanceMult: 5,
    /** one-time fraction of current skill lost when this step fires */
    step1DropPct: 0.05,
    step2FromAge: 60,
    step2ToAge: 65,
    step2WeeklyChance: 0.03,
    step2DropPct: 0.06,
  },
  /** Glicko-2 rating updates, batched once per tournament (one rating period). */
  ranking: {
    /** volatility constraint — 0.3–1.2 is the range Glickman recommends;
     * lower = ratings move more conservatively game to game */
    tau: 0.5,
  },
  match: {
    /** logistic scale per sport: p(point) = 1/(1+e^(−Δeff/scale)). Smaller = skill matters more. */
    scales: { tt: 300, bd: 340, sq: 360, tn: 400 },
    /** effective strength modifiers (form is applied multiplicatively to
     * skill instead — see BALANCE.form.matchFloor/matchSpan) */
    fatigueWeight: 0.5, // 100 pre-match fatigue → −50 eff
    energyWeight: 0.35, // fully drained in-match energy → −35 eff
    /**
     * Baseline in-match energy burned per point, per sport — relative stamina
     * need TT=1, BA=4, SQ=5, TE=3 (table tennis rallies are short and cheap;
     * squash is the grind).
     */
    energyCostPerPoint: { tt: 0.15, bd: 0.6, sq: 0.75, tn: 0.45 },
    /** energy-cost multiplier from the Stamina attribute (0..1) —
     * staminaCostFloor + (1−stamina) × staminaCostSpan, so a stamina-1 player
     * burns energy at 0.8× the baseline rate per point and a stamina-0 player
     * at 1.2×. Centered so stamina 0.5 (an "average" player) reproduces
     * exactly today's flat rate — existing balance is unchanged at the
     * midpoint, only spread out around it. */
    staminaCostFloor: 0.8,
    staminaCostSpan: 0.4,
    /**
     * Flat energy recovered at a changeover break, on top of whatever's left
     * — real rest, distinct from the tournament's between-ROUND recovery
     * (BALANCE.tournament.energyRecoveryBetweenRounds, a much longer break).
     * A side change (11-point mark within a set) is a brief pause; a set
     * change (moving on to a whole different sport) is longer, so it
     * recovers more. Flat, not stamina-scaled, unlike the tournament's
     * between-round recovery — first-pass values, easy to retune.
     */
    sideChangeEnergyRecovery: 5,
    setChangeEnergyRecovery: 12,
    /**
     * A single 5-step dial chosen at match start, the 11-point side change,
     * and between sets — ordered by energy cost, low to high:
     *
     *   conserve < aggressive < normal < safe < allOut
     *
     * "Conserve" coasts — biggest energy savings, biggest win-probability
     * penalty (you're giving up some points to bank energy for later sets).
     * "Safe" plays out longer rallies (grinding, fewer errors), which COSTS
     * more energy. "Aggressive" goes for winners that end the point fast,
     * which SAVES energy but is swingy (chaos = per-point eff noise) and
     * carries more unforced-error risk. "All-out" is the opposite of
     * conserve: contest every ball at full effort — the biggest energy
     * burn for the biggest win-probability boost, a "money time" button
     * for a set/match point. Table tennis rallies are short regardless of
     * tactic, so the whole dial barely moves its energy cost there —
     * badminton/squash/tennis feel it much more, squash most of all.
     */
    tactics: {
      conserve: { eff: -14, chaos: 0 },
      safe: { eff: -8, chaos: 0 },
      normal: { eff: 0, chaos: 0 },
      aggressive: { eff: 8, chaos: 25 },
      allOut: { eff: 14, chaos: 15 },
    },
    tacticEnergyMult: {
      tt: { conserve: 0.9, safe: 1.05, normal: 1, aggressive: 0.97, allOut: 1.1 },
      bd: { conserve: 0.5, safe: 1.4, normal: 1, aggressive: 0.75, allOut: 1.6 },
      sq: { conserve: 0.45, safe: 1.5, normal: 1, aggressive: 0.7, allOut: 1.7 },
      tn: { conserve: 0.55, safe: 1.3, normal: 1, aggressive: 0.8, allOut: 1.55 },
    },
    /** AI tactic heuristic thresholds (total-point lead / in-match energy) */
    ai: {
      pressWhenBehind: 8,
      desperateBehind: 16,
      protectWhenAhead: 12,
      crushingAhead: 20,
      tiredBelow: 30,
      exhaustedBelow: 15,
    },
    /**
     * EMA decay for the in-match "momentum" read: how much weight recent
     * points keep vs how fast a lucky/unlucky run fades. Feeds back into
     * point probability — see `momentumWeight`.
     */
    momentumDecay: 0.85,
    /**
     * Eff-point swing at full momentum (±1) — same order of magnitude as
     * switching tactics (±14 eff, see `tactics` above), added directly into
     * the eff gap before `pointWinProbability`'s sigmoid. Self-limiting by
     * construction: momentum shifting win probability makes continuing to
     * win *less* surprising (see `playPoint`'s surprise calc), which caps
     * momentum well short of its ±1 bound on its own — it doesn't need an
     * explicit ceiling. First-pass value; confirm against simulated match
     * margins before trusting it further.
     */
    momentumWeight: 15,
  },
  /**
   * Mechanism constants for TournamentSystem. The tournament's world-facing
   * numbers (name, entry fee, prize money, field size) live in content —
   * this only holds how the mechanism itself behaves.
   */
  tournament: {
    /** registration must happen at least this many weeks before the
     * tournament's own week — no same-week or last-minute entry, so
     * planning ahead is a real requirement, not just an option */
    entryDeadlineWeeks: 2,
    /** flat energy recovery between rounds (changeover/rest), on top of
     * whatever energy the player has left — scaled per-player by
     * staminaRecoveryFloor/Span below */
    energyRecoveryBetweenRounds: 20,
    /** between-round recovery multiplier from Stamina (0..1) —
     * staminaRecoveryFloor + stamina × staminaRecoverySpan, so a stamina-0
     * player only recovers 0.7× the base 20 (14) between rounds while a
     * stamina-1 player recovers 1.3× (26) — the "not enough time to fully
     * recover" toll hits low-stamina players harder as a tournament goes on.
     * Centered the same way as staminaCostFloor/Span: stamina 0.5 reproduces
     * exactly today's flat 20. */
    staminaRecoveryFloor: 0.7,
    staminaRecoverySpan: 0.6,
    /** cumulative in-tournament energy spent × this = fatigue added to the
     * player's condition once the event concludes */
    fatigueConversionFactor: 0.5,
    /** `projectedField`'s geographic entry bias (systems/travel.ts's
     * `distanceKm` feeds `entryWeight` — see tournament/engine.ts):
     * weight = 1 / (1 + km / geoBiasScaleKm). At this many km from the host,
     * a player is half as likely to be drawn as a domestic one; roughly a
     * short-haul flight's worth (Stockholm-Berlin is ~800km), so
     * neighboring-country players are still very much in the mix, and only
     * genuinely distant ones become rare. Rational (not exponential) decay
     * so nobody's ever fully excluded by distance alone. */
    geoBiasScaleKm: 1200,
    /** FIR Tournament Regs 3.8.5 wildcards: how many near-cutoff domestic
     * players `divisionAssignments` promotes into a tier's top division per
     * event — see systems/division.ts's `promoteHostWildcards`. Modest and
     * capped since this models only the Tournament-Director half of the
     * regulation's wildcard allowance (the other half, from FIR itself, has
     * no home-nation bias and isn't modeled). */
    hostWildcardsToTopDivision: 2,
  },
  /**
   * FIR entry-fee ceilings (Tournament Regs 3.3.1, singles, EUR) — the
   * maximum a tier's tournaments may charge. Content authors currently price
   * every division of a tier's events at the ceiling (the regulation's own
   * per-class discounts — 2nd class, seniors, doubles — don't apply yet,
   * since the game has no such classes). World Tour Finals has no FIR fee of
   * its own (an invitational season finale); it's priced as World
   * Championships, same as its ranking-points column (see ranking-matrix.json).
   * Enforced by packages/content/test/content.test.ts.
   */
  entryFeeCeiling: {
    "World Championships": 80,
    "World Tour Finals": 80,
    SWT: 70,
    IWT: 60,
    CHA: 50,
    SAT: 40,
  } as Record<string, number>,
  /**
   * TravelSystem cost model (docs/06 M2, pulled forward alongside the real
   * calendar): flights scale with great-circle distance, hotel/food scale
   * with trip length × the host country's cost-of-living index. Charged
   * alongside the entry fee, at entry (same timing, not at registration).
   * Domestic events (same country as home) are simplified to zero cost —
   * see `systems/travel.ts`.
   */
  travel: {
    /** flat booking-fee floor, even for a short hop */
    baseFare: 30,
    /** EUR per km of great-circle distance, home ⇄ host city */
    perKm: 0.11,
    /** baseline hotel + food per night, before the host country's costIndex */
    dailyCostBase: 90,
  },
  /**
   * FIR real-player import (docs/05, world/factory.ts's `specFromRealPlayer`).
   * The build-time Glicko→skill mapping anchors live in
   * packages/content/src/import/mapRatings.ts (seed-independent); this is the
   * one world-creation-time constant, since per-world sampling spread is a
   * runtime concern, not a build one.
   */
  import: {
    /** exact per-world skill sampled from N(mappedSkill, rdSampleK · rdSkill)
     * — well-measured players (low RD) land close to their rating every
     * career; rarely-seen players (high RD) vary more between worlds */
    rdSampleK: 1,
  },
  /**
   * Tournament skill divisions (A/B/C/D), gated by real FIR ranking points —
   * see systems/division.ts. Keyed by the exact `tier` strings in content;
   * a tier missing here is a content-authoring bug (division.ts throws
   * rather than guessing). World Tour Finals mirroring World Championships
   * (4 divisions) is an unconfirmed assumption, same pattern as that tier's
   * existing fieldSize assumption.
   */
  division: {
    byTier: {
      SAT: ["A", "B"],
      CHA: ["A", "B"],
      IWT: ["A", "B", "C"],
      SWT: ["A", "B", "C", "D"],
      "World Championships": ["A", "B", "C", "D"],
      "World Tour Finals": ["A", "B", "C", "D"],
    } as Record<string, readonly string[]>,
  },
  /** How much of an opponent's true skill leaks through to the human — see
   * docs/07's "three information layers" and model/sport.ts's
   * `levelRangeForSkill`. */
  opponentInfo: {
    /** an opponent's shown level range is their true level ± this many
     * levels (e.g. true level 10 shows as "8–12" at the default of 2) */
    levelRangeWidth: 2,
  },
  /** InboxSystem — the diegetic message feed (docs/07). */
  inbox: {
    /** a tournament invitation arrives this many weeks before its entry
     * deadline (deadline itself is entryDeadlineWeeks before the event) */
    inviteLeadWeeks: 4,
    /** how many players the monthly ranking digest lists */
    rankingTopN: 10,
  },
  forecast: {
    /** expected weekly skill gain thresholds for ++ and +++ */
    sportPlusPlus: 14,
    sportPlusPlusPlus: 28,
    /** fatigue delta thresholds: ≤bigDrop → −−, <drop → −, ≤flat → 0, ≤rise → +, else ++ */
    fatigueBuckets: { bigDrop: -12, drop: -2, flat: 6, rise: 20 },
    /** money forecasts round to this (no exact decimals in the UI) */
    moneyRounding: 10,
  },
} as const;
