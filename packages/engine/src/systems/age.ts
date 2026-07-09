import { BALANCE } from "../balance.js";

/**
 * Age-driven modifiers (docs/02's "Aging" section): a continuous curve over
 * the whole career, not a single M4 birthday event — the birthday
 * story-beat, new-player drip, and retirement are M4, but the modifiers
 * themselves are computed every week from here on.
 *
 * Shape: young players learn fast but haven't built tournament know-how yet;
 * a "prime veteran" window (experience without physical decline) sits in the
 * late 20s/early 30s; physical execution and recovery taper off after that,
 * partially offset — never fully — by the accumulated experience bonus.
 */

/** Training gain multiplier — fastest in youth, tapering to 1.0 by the mid-20s,
 * then a slow decline in learning capacity past the physical-decline age. */
export function trainingAgeMultiplier(age: number): number {
  const b = BALANCE.age;
  if (age <= b.youthBonusUntilAge) return 1 + b.youthLearningBonus;
  if (age < b.youthTaperEndAge) {
    const t = (age - b.youthBonusUntilAge) / (b.youthTaperEndAge - b.youthBonusUntilAge);
    return 1 + b.youthLearningBonus * (1 - t);
  }
  if (age <= b.declineFromAge) return 1;
  const taperedYears = age - b.declineFromAge;
  return Math.max(b.learningDeclineFloor, 1 - taperedYears * b.learningDeclinePerYear);
}

/** Net effective-strength delta applied at match time — physical execution
 * declining with age, partially offset by an experience bonus that itself
 * caps out (a veteran's know-how never fully outruns the body). */
export function matchAgeModifier(age: number): number {
  const b = BALANCE.age;
  const decline =
    age > b.declineFromAge ? Math.max(b.declineFloor, -(age - b.declineFromAge) * b.declinePerYear) : 0;
  const experience =
    age > b.experienceFromAge ? Math.min(b.experienceCap, (age - b.experienceFromAge) * b.experiencePerYear) : 0;
  return decline + experience;
}

/** Natural weekly fatigue recovery slows past the decline age — active rest
 * activities themselves aren't scaled, only the passive baseline. */
export function recoveryAgeMultiplier(age: number): number {
  const b = BALANCE.age;
  if (age <= b.recoveryDeclineFromAge) return 1;
  return Math.max(b.recoveryFloorMult, 1 - (age - b.recoveryDeclineFromAge) * b.recoveryDeclinePerYear);
}

/** Injury chance rises past the decline age — older bodies break down more easily. */
export function injuryAgeMultiplier(age: number): number {
  const b = BALANCE.age;
  if (age <= b.injuryRiskFromAge) return 1;
  return 1 + Math.min(b.injuryRiskCap, (age - b.injuryRiskFromAge) * b.injuryRiskPerYear);
}
