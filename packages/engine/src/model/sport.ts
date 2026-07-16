export type Sport = "tt" | "bd" | "sq" | "tn";

export const SPORTS: readonly Sport[] = ["tt", "bd", "sq", "tn"];

export const SPORT_LABELS: Record<Sport, string> = {
  tt: "Table tennis",
  bd: "Badminton",
  sq: "Squash",
  tn: "Tennis",
};

/** Internal skills live on a continuous 0–1000 scale (the true ability the
 * match engine reads); levels 1–20 are the player-facing display bands. */
export const SKILL_MAX = 1000;
export const LEVEL_MAX = 20;

/**
 * Minimum internal skill to *reach* each level, indexed by level−1
 * (so `LEVEL_MIN_SKILL[0]` is level 1, `[19]` is level 20). A **convex**
 * curve: bands widen from ~22 skill at the bottom to ~78 at the top (~3.5×),
 * so early levels come fast and the top is a real grind — which compounds
 * with the training taper toward each sport's hidden potential ceiling
 * (see systems/effects.ts), making level 20 a rare peak most players never
 * reach. Match strength/Glicko never read this — it's display only. Single
 * source of truth: `levelForSkill`, `levelProgress`, and `skillForLevel` all
 * derive from this array, so the mapping and its inverse can't drift apart.
 */
export const LEVEL_MIN_SKILL: readonly number[] = [
  0, 22, 47, 75, 107, 141, 179, 219, 263, 310, 360, 413, 469, 529, 591, 657, 725, 797, 872, 950,
];

export function levelForSkill(skill: number): number {
  for (let level = LEVEL_MAX; level >= 1; level--) {
    if (skill >= LEVEL_MIN_SKILL[level - 1]!) return level;
  }
  return 1;
}

/** Progress within the current level band, 0..1. Full bar at max level. */
export function levelProgress(skill: number): number {
  const level = levelForSkill(skill);
  if (level >= LEVEL_MAX) return 1;
  const lo = LEVEL_MIN_SKILL[level - 1]!;
  const hi = LEVEL_MIN_SKILL[level]!;
  return Math.min(1, Math.max(0, (skill - lo) / (hi - lo)));
}

export interface LevelRange {
  min: number;
  max: number;
}

/**
 * A deliberately fuzzy view of a player's level, `bandWidth` levels either
 * side of their true level (clamped to 1..LEVEL_MAX) — never the exact
 * value. This is how an opponent's level should be shown: docs/07's "three
 * information layers" rule says raw skill (and anything derived from it,
 * including the exact level) is never shown for anyone but the player's own
 * character — but a rough band is a reasonable middle ground between
 * nothing and the exact number, roughly what a scout or a few rallies
 * against them would tell you.
 */
export function levelRangeForSkill(skill: number, bandWidth: number): LevelRange {
  const level = levelForSkill(skill);
  return {
    min: Math.max(1, level - bandWidth),
    max: Math.min(LEVEL_MAX, level + bandWidth),
  };
}

/**
 * `levelRangeForSkill`'s band width shrinks (never disappears) as the human
 * plays more sets against a given opponent in a given sport — every set
 * played is a scouting look, so the fuzzed range tightens toward the truth
 * but keeps at least `minWidth` of mystery forever. Halves per set played,
 * rounding up: `startWidth` 5 with `minWidth` 1 goes 5 → 3 → 2 → 1 → 1 → ...
 */
export function levelRangeWidthForFamiliarity(
  setsPlayed: number,
  startWidth: number,
  minWidth: number,
): number {
  const halved = Math.ceil(startWidth / 2 ** setsPlayed);
  return Math.max(minWidth, halved);
}

/**
 * Representative internal skill for a display level (1–20) — the midpoint of
 * that level's band, so it round-trips: `levelForSkill(skillForLevel(L)) === L`.
 * The exact inverse of `levelForSkill`, used at character creation to turn a
 * 1–20 pick into a starting skill. Level 20 is open-ended (no upper band), so
 * it lands half a band above its threshold.
 */
export function skillForLevel(level: number): number {
  const L = Math.min(LEVEL_MAX, Math.max(1, Math.round(level)));
  const lo = LEVEL_MIN_SKILL[L - 1]!;
  if (L >= LEVEL_MAX) {
    const prevBand = lo - LEVEL_MIN_SKILL[L - 2]!;
    return Math.round(lo + prevBand / 2);
  }
  return Math.round((lo + LEVEL_MIN_SKILL[L]!) / 2);
}
