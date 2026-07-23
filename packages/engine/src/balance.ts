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
    cardioEnduranceGain: 0.015,
    /** sessions/week of squash/badminton needed to maintain endurance */
    sportEnduranceMaintainSessions: 2,
    /** endurance gain per session above the maintenance threshold */
    sportEnduranceBonus: { tt: 0, bd: 0.001, sq: 0.002, tn: 0 },
    /** weekly fade for trainable body attributes that were not trained */
    attributeDecayUntrained: 0.003,
    /** core strength fades more slowly than endurance: one check per this many weeks */
    coreStrengthDecayIntervalWeeks: 4,
    /** weekly fade for trainable body attributes above age declineFromAge */
    attributeAgeDeclineRate: 0.0008,
  },
  recovery: {
    /** natural fatigue recovery per week, on top of rest/social activities.
     * Cut from 15 in M1: activity rest now carries the full-recovery tuning,
     * while this stays as the baseline recovery every week. */
    weeklyBase: 10,
    /** Core strength at or above this fully absorbs training fatigue for a
     * balanced handful of physical training sessions. Below it, the protection
     * scales linearly so weak-core players still feel the load. */
    coreStrengthGraceAt: 0.5,
    /** Maximum weekly physical training sessions that core strength can make
     * fatigue-neutral. Training beyond this still adds fatigue normally. */
    coreStrengthGraceSessions: 5,
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
    /** salary now pays out monthly, not weekly (see systems/economy.ts) —
     * a new career needs enough cushion to cover ~a month of weeklyExpenses
     * (up to 5 weeks before the first payday lands) plus room for an early
     * tournament trip, without going broke before ever seeing a paycheck. */
    startingMoney: 3000,
    /** salary = base work pay × (salaryFloor + career × salarySpan) — see
     * `salaryMultiplier` in systems/effects.ts. A mid-build (career 0.5)
     * lands back at 1.0×, matching the old flat rate; a maxed Career
     * attribute pays 1.4×, a dumped one 0.6×. */
    salaryFloor: 0.6,
    salarySpan: 0.8,
  },
  vacation: {
    /** annual paid-leave allowance when the player's country has no
     * `vacationDays` in content — see systems/vacation.ts. */
    defaultDays: 25,
    /** age/seniority bonus: +1 day per full `bonusPerYears` years over
     * `bonusFromAge`, capped at `bonusCap`. A 45-year-old gets +3. */
    bonusFromAge: 30,
    bonusPerYears: 5,
    bonusCap: 5,
  },
  injuryRisk: {
    /** current fatigue adds fatigue/divisor to the weekly injury load */
    fatigueDivisor: 10,
    mediumAt: 8,
    highAt: 15,
    /** weekly injury probability = load × this, before coreStrength reduction */
    chancePerLoad: 0.01,
    /** coreStrength (gym-built, trainable) 0..1 cuts that chance by up to this
     * fraction — the risk-reduction half of the prevention/recovery split;
     * durability ("Läkekött"/Fast Healer) has no role in whether you get
     * hurt, only in how fast you heal once you are (durabilityHealBonus). */
    coreStrengthProtection: 0.6,
    /** hard ceiling so even a reckless training-camp week can't guarantee one */
    maxWeeklyChance: 0.35,
    /** extra "weeks of healing" applied per real week, per point of durability
     * 0..1 — durability is purely recovery speed, not injury resistance;
     * see `coreStrengthProtection` above for what actually lowers the odds. */
    durabilityHealBonus: 2,
  },
  /**
   * Illness (cold/flu/stomach virus, content.illnesses) — a second, mostly
   * training-load-independent affliction rolled alongside the weekly injury
   * roll (systems/injury.ts). Unlike injury, it's not caused by overtraining
   * — a small flat weekly chance, bumped a little by this week's travel
   * (jet lag/exposure) and by high fatigue (a run-down immune system).
   * First-pass values, easy to retune.
   */
  illness: {
    baseWeeklyChance: 0.01,
    /** extra chance per travel session this week */
    perTravelSession: 0.01,
    /** extra chance once fatigue crosses this, same idea as injuryRisk's
     * fatigueDivisor but flatter — illness cares about "run down," not a
     * finely graded load number */
    highFatigueAt: 70,
    highFatigueBonus: 0.01,
    hardCeiling: 0.15,
    /** duration in weeks, indexed by severity 1/2/3 — shorter than physical
     * injuries; also durability-healed like injury, via the same
     * durabilityHealBonus above. */
    durationBySeverity: { 1: 1, 2: 2, 3: 3 },
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
    /** Bounded credit against the weekly erosion and cliff-drop MAGNITUDE
     * above (never the cliff's chance of firing at all) from a player's own
     * current endurance/coreStrength — real, sourced physical condition
     * predicts less decline than this population-uniform curve assumes on
     * its own. 0.5 here means a player at the attribute ceiling (1.0 on
     * both) gets at most half the usual decline, same principle and same
     * cap as Racketlon_TS's age_rating.VETERAN_MAX_FITNESS_REDUCTION — real
     * decline never fully disappears even for the best-conditioned
     * veterans. See systems/aging.ts's fitnessDeclineMultiplier(). */
    fitnessDeclineMaxReduction: 0.5,
  },
  /**
   * Match-time injury risk (docs' "risk when going all out" ask) — a second,
   * independent-of-training injury roll, checked at every break (side
   * change, set end, gummiarm) for the sport/tactic just played, over on top
   * of the weekly training-load roll (BALANCE.injuryRisk). Scales primarily
   * by `BALANCE.match.tacticEnergyMult` — the same ratios that make `allOut`
   * the most energy-costly tactic make it the riskiest one here too, "money
   * time" cutting both ways. First-pass values, tuned so most matches
   * produce zero injuries and `allOut` in squash stands out as meaningfully
   * riskier than `conserve`. Deliberately durability-free: durability
   * ("Läkekött"/Fast Healer) only speeds recovery once hurt
   * (`injuryRisk.durabilityHealBonus`) — coreStrength (gym-built, trainable)
   * is the only thing that lowers the CHANCE of getting hurt in the first
   * place, both here and in the weekly roll.
   */
  matchInjuryRisk: {
    basePerBreak: 0.004,
    coreStrengthProtection: 0.3,
    maxPerBreak: 0.1,
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
    sorenessWeight: 0.3, // 100 soreness → −30 eff
    /** Fraction of the entering-match soreness baseline that live
     * `MatchState.feltSoreness` eases down to once warmed up by continuous
     * play — never fully disappears, just feels less stiff mid-rally. */
    sorenessWarmupFloor: 0.7,
    /** Per-point pull rate toward that warmed-up floor while play continues. */
    sorenessWarmupPull: 0.06,
    /** Fraction of the way back toward the entering baseline that
     * `feltSoreness` jumps at every break (side change, set change,
     * gummiarm) — the body cools and stiffens the moment play stops. Never
     * pulls soreness past the baseline itself; a real *increase* to that
     * baseline only happens overnight/after the match, via
     * `sorenessGainForMatch` (tournament/engine.ts). First-pass value. */
    sorenessCooldownBump: 0.35,
    energyWeight: 0.35, // fully drained in-match energy → −35 eff on its own
    /**
     * "Hitting the wall" — on top of the mild, linear `energyWeight` bleed,
     * energy below `below` adds a steeply *convex* penalty (cubic in how
     * empty the tank is) that's negligible near the threshold but dominates
     * the closer energy gets to 0. A player at `below` energy plays almost
     * exactly like `energyWeight` alone would predict; a player at 0 is
     * playing a fundamentally different, near-helpless match — losing the
     * vast majority of points to an equal-skill, fresh opponent (see
     * `energyPenalty` in match/engine.ts). This is deliberately a cliff, not
     * a slope: it's what makes draining the tank to empty a real risk
     * instead of a mild inconvenience, and why the AI already bails into
     * `conserve` once energy drops under `ai.exhaustedBelow` (15), well
     * inside this wall's `below` threshold.
     */
    energyWall: { below: 20, pow: 3, maxExtra: 700 },
    /** softer than energyWeight — mental sharpness bottoming out at 0 costs
     * less than being fully physically drained, but it's still a real bite. */
    sharpnessWeight: 0.25, // sharpness at 0 → −25 eff
    /**
     * Per-point pull rate toward `MatchState.sharpness`'s momentum-derived
     * target: `pull = sharpnessPull × (1 − composure)`. At composure 1, pull
     * is 0 — sharpness never moves off its starting 100 all match (perfectly
     * steady). At composure 0, pull is the full `sharpnessPull` each point —
     * sharpness chases every momentum swing almost immediately (rattled). At
     * composure 0.5 (an "average" player, same centering convention as
     * `enduranceCostFloor/Span`), pull ≈ half that — a moderate, visible drift
     * over the course of a set, not a single-point snap.
     */
    sharpnessPull: 0.4,
    /**
     * Eff swing on a decisive point (a set point, match point, or the
     * gummiarm — see `clutchMoment`), from the Clutch attribute: `bonus =
     * (clutch − 0.5) × 2 × clutchWeight`, centered at clutch 0.5 (no effect,
     * same convention as Endurance/Composure). A clutch-1 player gets the full
     * +clutchWeight eff on that single point; a clutch-0 player gets the
     * full penalty. Deliberately smaller than a tactic choice (±14-65 eff,
     * see `tactics` below) — clutch tilts a coin-flip, it doesn't decide it
     * outright — and, unlike sharpness/momentum, only ever applies on that
     * one instant, not continuously.
     */
    clutchWeight: 12,
    /**
     * The sudden-death gummiarm — one nerve-jangling point for the whole
     * match, played as a *single* serve (a "second serve": no first-serve
     * bomb, no fault to fall back on). These constants make that point feel
     * like real racketlon, where `clutch` (Player.attributes.clutch —
     * "Vinnarskalle", the win-rate-on-the-gummiarm attribute) dominates and
     * most players choose to *receive* rather than serve under the pressure.
     * All first-pass values, easy to retune. See `gummiarmServeValue`,
     * `effectiveStrength`'s gummiarm branch, and `pointWinProbability`.
     */
    gummiarm: {
      /**
       * Extra clutch eff swing applied ONLY on the gummiarm point, ON TOP of
       * the normal decisive `clutchWeight` (12) that every set/match point
       * already gets. The entire match riding on one point is where a cool
       * head matters most, so clutch genuinely dominates here — same
       * (clutch − 0.5) × 2 centering: clutch 1 → +this eff, clutch 0 → −this.
       * Large relative to the tennis scale (400) so it's a real swing (a
       * clutch-1 vs clutch-0 gap of ~2×this eff), without being deterministic.
       */
      clutchWeight: 110,
      /**
       * Serve advantage handed to whoever serves the gummiarm, as eff, scaled
       * by the server's tennis skill (skills.tn / SKILL_MAX). Deliberately
       * muted: it's ONE serve played like a second serve, so even a big
       * tennis game only nets a fraction of a normal service game's edge.
       */
      serveEdgeMax: 45,
      /**
       * Nerve tax on the *server only*, as eff, scaled by (1 − clutch): a
       * shaky (clutch 0) server hands back this much to a jittery single
       * serve, a stone-cold (clutch 1) server none. Larger than
       * `serveEdgeMax` on purpose — for an average-or-lower-clutch player the
       * tax outweighs the edge, so serving is a net loss and receiving is the
       * right call. That asymmetry is exactly why "most players choose to
       * receive" and hand the nerves to the other guy; only a genuinely
       * clutch player with a real serve comes out ahead by choosing to serve.
       */
      serveNerveTax: 70,
    },
    /**
     * Baseline in-match energy burned per point, per sport — relative endurance
     * need TT=1, BA=4, SQ=5, TE=3 (table tennis rallies are short and cheap;
     * squash is the grind).
     */
    energyCostPerPoint: { tt: 0.15, bd: 0.6, sq: 0.75, tn: 0.45 },
    /**
     * Asymmetric energy tax for a point where the expected winner actually
     * wins. This models court control: the player dictating play spends less
     * energy, while the opponent chases. Squash has the largest swing because
     * controlling the T is cheap and being moved off it is punishing; badminton
     * has a smaller version of the same pattern. Values are proportional to
     * point-control strength (0 at a coin flip, 1 near a guaranteed point).
     */
    controlEnergy: {
      tt: { winnerDiscount: 0, loserTax: 0 },
      bd: { winnerDiscount: 0.08, loserTax: 0.18 },
      sq: { winnerDiscount: 0.18, loserTax: 0.45 },
      tn: { winnerDiscount: 0.05, loserTax: 0.12 },
    },
    /** energy-cost multiplier from the Endurance attribute (0..1) —
     * enduranceCostFloor + (1−endurance) × enduranceCostSpan, so a endurance-1 player
     * burns energy at 0.8× the baseline rate per point and a endurance-0 player
     * at 1.2×. Centered so endurance 0.5 (an "average" player) reproduces
     * exactly today's flat rate — existing balance is unchanged at the
     * midpoint, only spread out around it. */
    enduranceCostFloor: 0.8,
    enduranceCostSpan: 0.4,
    /**
     * Flat energy recovered at a changeover break, on top of whatever's left
     * — real rest, distinct from the tournament's between-ROUND recovery
     * (BALANCE.tournament.energyRecoveryBetweenRounds, a much longer break).
     * A side change (11-point mark within a set) is a brief pause; a set
     * change (moving on to a whole different sport) is longer, so it
     * recovers more. Flat, not endurance-scaled, unlike the tournament's
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
      conserve: { eff: -80, chaos: 0 },
      safe: { eff: -8, chaos: 0 },
      normal: { eff: 0, chaos: 0 },
      aggressive: { eff: 8, chaos: 25 },
      allOut: { eff: 65, chaos: 0 },
    },
    tacticEnergyMult: {
      tt: { conserve: 0.9, safe: 1.05, normal: 1, aggressive: 0.97, allOut: 1.15 },
      bd: { conserve: 0.5, safe: 1.4, normal: 1, aggressive: 0.75, allOut: 2.25 },
      sq: { conserve: 0.45, safe: 1.5, normal: 1, aggressive: 0.7, allOut: 2.5 },
      tn: { conserve: 0.55, safe: 1.3, normal: 1, aggressive: 0.8, allOut: 2.1 },
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
     * enduranceRecoveryFloor/Span below */
    energyRecoveryBetweenRounds: 20,
    /** between-round recovery multiplier from Endurance (0..1) —
     * enduranceRecoveryFloor + endurance × enduranceRecoverySpan, so a endurance-0
     * player only recovers 0.7× the base 20 (14) between rounds while a
     * endurance-1 player recovers 1.3× (26) — the "not enough time to fully
     * recover" toll hits low-endurance players harder as a tournament goes on.
     * Centered the same way as enduranceCostFloor/Span: endurance 0.5 reproduces
     * exactly today's flat 20. */
    enduranceRecoveryFloor: 0.7,
    enduranceRecoverySpan: 0.6,
    /** cumulative in-tournament energy spent × this = fatigue added to the
     * player's condition once the event concludes */
    fatigueConversionFactor: 0.5,
    /** Soreness at or above this blocks sport/body training on Mon-Wed of the following week. */
    sorenessTrainingBlockAt: 40,
    /** Base soreness gained per completed match before modifiers. */
    sorenessPerMatch: 14,
    /** Extra soreness from energy spent during a match. */
    sorenessPerEnergySpent: 0.12,
    /** Core strength reduces soreness build-up by up to this fraction. */
    coreStrengthSorenessProtection: 0.3,
    /** Durability/resilience reduces soreness build-up by up to this fraction. */
    durabilitySorenessProtection: 0.25,
    /** Soreness starts increasing with age after this age. */
    sorenessAgeFrom: 30,
    /** Added soreness multiplier per year past sorenessAgeFrom. */
    sorenessAgePerYear: 0.025,
    /** Cap for the age-related soreness multiplier bonus. */
    sorenessAgeCap: 0.75,
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
     * career; rarely-seen players (high RD) vary more between worlds.
     * Tuned down from 1: at full rdSkill magnitude, this dataset's very wide
     * real-world RDs (median ~250 in skill-space) let plenty of mediocre,
     * high-RD players roll all the way up to a strong player's territory,
     * washing out genuine standouts — e.g. Henrik Mustonen's squash rating
     * (2266, the outright highest of any player in any sport) topped the
     * in-game ladder only 34% of careers at rdSampleK=1, vs 100% at 0.4 and
     * ~99% at 0.6. 0.5 keeps noticeable career-to-career variation for the
     * rest of the field while letting real outliers reliably show up as
     * outliers. */
    rdSampleK: 0.5,
    /** per-world endurance sampled from N(mappedEndurance, enduranceJitter) —
     * there's no per-player RD for the endurance score (it's a modelled
     * profile value, not a measured rating), so this is one small fixed
     * spread rather than a per-player-scaled one like rdSampleK */
    enduranceJitter: 0.05,
    /** per-world core strength sampled from N(mappedCoreStrength,
     * coreStrengthJitter) — same reasoning as enduranceJitter. */
    coreStrengthJitter: 0.05,
    /** per-world clutch sampled from N(mappedClutch, clutchJitter) — same
     * reasoning as enduranceJitter. */
    clutchJitter: 0.05,
    /** per-world composure sampled from N(mappedComposure, composureJitter)
     * — same reasoning as enduranceJitter. */
    composureJitter: 0.05,
  },
  /**
   * Tournament skill divisions (A/B/C/D/E), gated by real FIR ranking points
   * — see systems/division.ts. Keyed by the exact `tier` strings in content,
   * then by gender — men's and women's fields at IWT/SWT/World Championships
   * now differ in both division *count* and size (real FIR draws are
   * gender-specific), so the division list itself is gender-specific, not
   * just the fieldSize on each division's content row. A tier (or a tier's
   * gender) missing here is a content-authoring bug (division.ts throws
   * rather than guessing). SAT/CHA now give men a third (C) division that
   * women's draws don't have, matching the men's-field-expansion pass across
   * every tier. World Tour Finals currently gives both genders the same
   * division set — mirroring World Championships' pre-expansion 4-division
   * shape is an unconfirmed assumption, same pattern as that tier's existing
   * fieldSize assumption.
   */
  division: {
    byTier: {
      SAT: { m: ["A", "B", "C"], f: ["A", "B"] },
      CHA: { m: ["A", "B", "C"], f: ["A", "B"] },
      IWT: { m: ["A", "B", "C", "D"], f: ["A", "B", "C"] },
      SWT: { m: ["A", "B", "C", "D"], f: ["A", "B", "C"] },
      "World Championships": { m: ["A", "B", "C", "D", "E"], f: ["A", "B", "C"] },
      "World Tour Finals": { m: ["A", "B", "C", "D"], f: ["A", "B", "C", "D"] },
    } as Record<string, Record<"m" | "f", readonly string[]>>,
  },
  /** How much of an opponent's true skill leaks through to the human — see
   * docs/07's "three information layers" and model/sport.ts's
   * `levelRangeForSkill`. */
  opponentInfo: {
    /** an opponent's shown level range is their true level ± this many
     * levels before the human has ever played them in a given sport (e.g.
     * true level 10 shows as "5–15" at the default of 5) — see
     * `levelRangeWidthForFamiliarity`, which shrinks this per sport as the
     * human plays more sets against that specific opponent. */
    levelRangeStartWidth: 5,
    /** the band never tightens past ± this many levels — some mystery
     * always remains, however many times they've played. */
    levelRangeMinWidth: 1,
  },
  /** InboxSystem — the diegetic message feed (docs/07). */
  inbox: {
    /** a tournament invitation arrives this many weeks before its entry
     * deadline (deadline itself is entryDeadlineWeeks before the event) */
    inviteLeadWeeks: 4,
    /** how many players the monthly ranking digest lists */
    rankingTopN: 10,
    /** a top-10 player's injury only makes the news if they're out for
     * MORE than this many weeks — a minor knock isn't newsworthy just
     * because of who it happened to; keeps the inbox from spamming a
     * headline every time a top player tweaks something for a week. Rare
     * (severity-biased-long) injuries bypass this via their own trigger,
     * unaffected by this threshold. */
    injuryNewsMinWeeks: 4,
  },
  /**
   * Decision events (fun-plan P2): small, minor-choice inbox messages that
   * expire if ignored — see `systems/inbox.ts`'s `DECISION_EVENTS` and
   * `Game.chooseInboxOption`. Deliberately capped at one arriving per week
   * (never a second on top) so a week stays a glance, not a report.
   */
  events: {
    /** chance, each week at least one event is currently eligible (its
     * trigger reads true and it's off cooldown), that one actually fires —
     * keeps arrivals frequent without being a metronome. */
    weeklyFireChance: 0.5,
    /** if it's been at least this many weeks since the last decision event
     * fired, the next eligible one fires unconditionally — the "pity timer"
     * that guarantees a quiet stretch never runs forever. */
    pityWeeks: 4,
    /** the same specific event (e.g. "physio slot") can't fire again within
     * this many weeks of its last arrival, even if its trigger stays true —
     * keeps one persistently-true trigger (e.g. chronic high fatigue) from
     * crowding out every other event. */
    eventCooldownWeeks: 6,
    /** an offer stays answerable through this many additional weeks after
     * the week it arrives, then is shown expired — a real, not-too-harsh
     * deadline (see the plan's "expiry is the addictive part"). */
    answerWindowWeeks: 2,
  },
  /**
   * Week modifiers (fun-plan P3): a small, local-feeling wrinkle rolled at
   * the start of some weeks — see `systems/modifiers.ts`'s `WEEK_MODIFIERS`.
   * Breaks template-autopilot by making the saved plan need a genuine
   * 10-second look most weeks, without turning planning into a chore.
   */
  modifiers: {
    /** chance a week rolls a modifier at all — never more than one per
     * week regardless (see `activeWeekModifier`). */
    chance: 0.45,
    /** no modifier rolls before this weekIndex — a new career's first
     * month is already a lot to absorb (character creation, the planner,
     * first tournaments); let it settle before layering flavor events on
     * top. */
    minWeekIndex: 4,
  },
  forecast: {
    /** expected weekly skill gain thresholds for ++ and +++ */
    sportPlusPlus: 14,
    sportPlusPlusPlus: 28,
    /** fatigue delta thresholds: ≤bigDrop → −−, <drop → −, ≤flat → 0, ≤rise → +, else ++ */
    fatigueBuckets: { bigDrop: -12, drop: -2, flat: 6, rise: 20 },
    /** money forecasts round to this (no exact decimals in the UI) */
    moneyRounding: 10,
    /** how many weeks ahead `Game.trainingForecast` projects the current
     * plan's pace before giving up on predicting a level-up — long enough to
     * catch slower sports, short enough that it stays a near-term "coming
     * up" teaser rather than a distant, low-confidence guess. */
    trainingForecastHorizonWeeks: 12,
  },
} as const;
