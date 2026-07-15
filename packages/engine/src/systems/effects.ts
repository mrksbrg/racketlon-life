import { BALANCE } from "../balance.js";
import type { ContentBundle } from "../content.js";
import type { ActivityType } from "../model/activity.js";
import type { ActivityCounts } from "../model/plan.js";
import { trainingAgeMultiplier } from "./age.js";

/**
 * Shared effect math. TrainingSystem/FatigueSystem/EconomySystem apply these
 * with RNG noise; the facade's previewPlan evaluates the same functions in
 * expectation. One source of truth keeps the forecast honest.
 */

export function countEntries(counts: ActivityCounts): Array<[ActivityType, number]> {
  return (Object.entries(counts) as Array<[ActivityType, number | undefined]>).flatMap(
    ([type, n]) => (n !== undefined && n > 0 ? [[type, n] as [ActivityType, number]] : []),
  );
}

/** A sport's soft skill ceiling from its hidden potential roll — see
 * `PlayerAttributes.potential` and `BALANCE.training.ceilingFloor/Span`. */
export function skillCeiling(potential: number): number {
  const b = BALANCE.training;
  return b.ceilingFloor + potential * b.ceilingSpan;
}

/** Expected skill gain for one session, before per-session randomness. `age`
 * defaults to a neutral prime-window value (1.0× multiplier) so callers
 * testing the other dimensions in isolation don't need to care about it. */
export function expectedSessionGain(
  base: number,
  skill: number,
  potential: number,
  fatigue: number,
  age = 25,
): number {
  const b = BALANCE.training;
  const taper = Math.max(b.minTaper, 1 - skill / skillCeiling(potential));
  const potentialMult = b.potentialFloor + potential * b.potentialSpan;
  const fatigueMult =
    fatigue <= b.fatiguePenaltyFrom
      ? 1
      : 1 -
        (1 - b.fatiguePenaltyAt100) *
          ((fatigue - b.fatiguePenaltyFrom) / (100 - b.fatiguePenaltyFrom));
  return base * taper * potentialMult * fatigueMult * trainingAgeMultiplier(age);
}

/** Match-day energy-cost multiplier from the Endurance attribute (0..1) —
 * higher endurance burns in-match energy more slowly per point. See
 * `BALANCE.match.enduranceCostFloor/Span`. */
export function enduranceEnergyMult(endurance: number): number {
  const b = BALANCE.match;
  return b.enduranceCostFloor + (1 - endurance) * b.enduranceCostSpan;
}

/** Between-tournament-round energy recovery multiplier from Endurance (0..1) —
 * higher endurance recovers more of the flat changeover recovery between
 * rounds, so low-endurance players feel a long tournament's toll harder. See
 * `BALANCE.tournament.enduranceRecoveryFloor/Span`. */
export function enduranceRecoveryMult(endurance: number): number {
  const b = BALANCE.tournament;
  return b.enduranceRecoveryFloor + endurance * b.enduranceRecoverySpan;
}

/** Weekly decay rate for a sport that's been neglected for `neglectWeeks`
 * consecutive weeks (including this one) — see `BALANCE.form.decayStages`.
 * Picks the last stage whose `afterWeeks` threshold `neglectWeeks` clears
 * (stages are sorted ascending), 0 if none apply yet. */
export function formDecayRate(neglectWeeks: number): number {
  let rate = 0;
  for (const stage of BALANCE.form.decayStages) {
    if (neglectWeeks >= stage.afterWeeks) rate = stage.ratePerWeek;
  }
  return rate;
}

/** This week's form change for one sport, from how many sessions (if any)
 * it actually got trained — see `BALANCE.form` and systems/training.ts.
 * `neglectWeeks` is this sport's consecutive-weeks-untrained streak
 * *after* this week (0 whenever it was trained). */
export function formDelta(sessionsThisSport: number, neglectWeeks: number): number {
  const f = BALANCE.form;
  return sessionsThisSport > 0
    ? Math.min(sessionsThisSport, f.sessionsCap) * f.gainPerSession
    : -formDecayRate(neglectWeeks);
}

const CORE_PROTECTED_ACTIVITY_TYPES: ReadonlySet<ActivityType> = new Set([
  "trainTT",
  "trainBD",
  "trainSQ",
  "trainTN",
  "gym",
  "cardio",
]);

/** Net fatigue change from the week's activities (rest/social are negative).
 * Core strength can absorb the fatigue from a balanced handful of physical
 * training sessions; it does not discount work, travel, or overtraining. */
export function fatigueDeltaFromCounts(
  counts: ActivityCounts,
  content: ContentBundle,
  coreStrength = 0,
): number {
  let delta = 0;
  let protectedSessionsLeft =
    BALANCE.recovery.coreStrengthGraceSessions * Math.min(1, coreStrength / BALANCE.recovery.coreStrengthGraceAt);

  for (const [type, n] of countEntries(counts)) {
    const fatigue = content.activities[type].fatigue;
    if (fatigue <= 0 || !CORE_PROTECTED_ACTIVITY_TYPES.has(type)) {
      delta += fatigue * n;
      continue;
    }

    const protectedSessions = Math.min(n, protectedSessionsLeft);
    delta += fatigue * (n - protectedSessions);
    protectedSessionsLeft -= protectedSessions;
  }
  return delta;
}

export function moneyDeltaFromCounts(
  counts: ActivityCounts,
  content: ContentBundle,
): { earned: number; spent: number } {
  let earned = 0;
  let spent = 0;
  for (const [type, n] of countEntries(counts)) {
    const perSession = content.activities[type].money;
    if (perSession >= 0) earned += perSession * n;
    else spent += -perSession * n;
  }
  return { earned, spent };
}

/** Weekly injury load: planned activity load plus how tired you already are. */
export function injuryLoad(
  counts: ActivityCounts,
  content: ContentBundle,
  currentFatigue: number,
): number {
  let load = currentFatigue / BALANCE.injuryRisk.fatigueDivisor;
  for (const [type, n] of countEntries(counts)) {
    load += content.activities[type].injuryLoad * n;
  }
  return load;
}

export function injuryRiskBucket(load: number): "low" | "medium" | "high" {
  if (load >= BALANCE.injuryRisk.highAt) return "high";
  if (load >= BALANCE.injuryRisk.mediumAt) return "medium";
  return "low";
}
