/**
 * Every tuning constant lives here (or in content data) — never inline in
 * systems. Base per-session values (skill gain, fatigue, money) come from
 * content activities; this file holds the modifiers and thresholds.
 */
export const BALANCE = {
  training: {
    /** gains taper linearly toward zero as skill approaches this value */
    taperEnd: 1050,
    /** floor for the taper multiplier so progress never fully stalls */
    minTaper: 0.05,
    /** talent multiplier = talentFloor + talent × talentSpan (talent is 0..1) */
    talentFloor: 0.75,
    talentSpan: 0.5,
    /** session quality degrades linearly above this fatigue… */
    fatiguePenaltyFrom: 60,
    /** …down to this multiplier at fatigue 100 */
    fatiguePenaltyAt100: 0.3,
    /** per-session random spread, ± proportion of the expected gain */
    randomness: 0.25,
    /** conditioning: skill points per physical session, applied to all sports */
    physicalAllSportGain: 0.8,
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
  /** Glicko-2 rating updates, batched once per tournament (one rating period). */
  ranking: {
    /** volatility constraint — 0.3–1.2 is the range Glickman recommends;
     * lower = ratings move more conservatively game to game */
    tau: 0.5,
  },
  match: {
    /** logistic scale per sport: p(point) = 1/(1+e^(−Δeff/scale)). Smaller = skill matters more. */
    scales: { tt: 300, bd: 340, sq: 360, tn: 400 },
    /** effective strength modifiers */
    formWeight: 3, // ±10 form → ±30 eff
    fatigueWeight: 0.5, // 100 pre-match fatigue → −50 eff
    energyWeight: 0.35, // fully drained in-match energy → −35 eff
    /**
     * Baseline in-match energy burned per point, per sport — relative stamina
     * need TT=1, BA=4, SQ=5, TE=3 (table tennis rallies are short and cheap;
     * squash is the grind).
     */
    energyCostPerPoint: { tt: 0.15, bd: 0.6, sq: 0.75, tn: 0.45 },
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
     * points keep vs how fast a lucky/unlucky run fades. Presentation-only
     * for now — it explains what the player is seeing, it does not feed
     * back into point probability.
     */
    momentumDecay: 0.85,
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
     * whatever energy the player has left */
    energyRecoveryBetweenRounds: 20,
    /** cumulative in-tournament energy spent × this = fatigue added to the
     * player's condition once the event concludes */
    fatigueConversionFactor: 0.5,
  },
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
