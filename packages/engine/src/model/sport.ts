export type Sport = "tt" | "bd" | "sq" | "tn";

export const SPORTS: readonly Sport[] = ["tt", "bd", "sq", "tn"];

export const SPORT_LABELS: Record<Sport, string> = {
  tt: "Table tennis",
  bd: "Badminton",
  sq: "Squash",
  tn: "Tennis",
};

/** Internal skills live on a 0–1000 scale; levels 1–20 are fixed display bands of 50. */
export const SKILL_MAX = 1000;
export const LEVEL_BAND = 50;
export const LEVEL_MAX = 20;

export function levelForSkill(skill: number): number {
  return Math.min(LEVEL_MAX, Math.floor(skill / LEVEL_BAND) + 1);
}

/** Progress within the current level band, 0..1. Full bar at max level. */
export function levelProgress(skill: number): number {
  if (levelForSkill(skill) >= LEVEL_MAX) return 1;
  return (skill % LEVEL_BAND) / LEVEL_BAND;
}
