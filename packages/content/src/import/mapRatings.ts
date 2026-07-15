import type { GameSport, JoinedPlayer, SportRating } from "./join.js";
import { GAME_SPORTS } from "./join.js";
import { iocToIso2 } from "./countryMap.js";

/**
 * Build-time mapping from the scraper's Glicko-2 ratings onto the game's
 * internal 0–1000 skill scale, and the derived world-bundle entry shape.
 *
 * These anchors are build-time only (they never move once a bundle ships) and
 * are tuned to the observed dataset spread (ratings ≈ 1150–1815): R_MIN/R_MAX
 * are chosen so the world top lands ≈950 (≈ level 20) and the weakest rated
 * players ≈120 (≈ level 3). First-pass tuning — easy to retune and rebuild.
 * The RD *sampling* multiplier that adds per-world variation lives on the
 * engine side (BALANCE.import.rdSampleK), since that's a world-creation step.
 */
export const MAP = {
  /** rating that maps to internal skill 0 */
  R_MIN: 1050,
  /** rating that maps to internal skill 1000 */
  R_MAX: 1850,
  /** internal skill assigned to a sport the scraper had no rating for */
  MISSING_SPORT_SKILL: 200,
  /** scraper endurance score that maps to the engine's attribute floor (0) —
   * the scraper's profile model clips at ±0.45 (see Racketlon_TS's
   * endurance.py), so these anchors cover its full range */
  ENDURANCE_MIN: -0.45,
  /** scraper endurance score that maps to the engine's attribute ceiling (1) */
  ENDURANCE_MAX: 0.45,
  /** scraper core_strength score → attribute floor (0). Same ±0.45 clip as
   * endurance — CORE_STRENGTH_CLIP in Racketlon_TS's glicko2_ratings.py. */
  CORE_STRENGTH_MIN: -0.45,
  /** scraper core_strength score → attribute ceiling (1). */
  CORE_STRENGTH_MAX: 0.45,
  /** scraper clutch score → attribute floor (0). Not hard-clipped upstream
   * (unlike endurance/core_strength), but its practical spread comfortably
   * fits within ±0.45 (observed stdev ≈0.09, p99 ≈0.26 on the real dataset)
   * — reusing the same anchor as the other three for consistency. A rare
   * outlier beyond the anchor simply clamps, same as skill's R_MIN/R_MAX
   * doesn't cover the literal rating extremes either. */
  CLUTCH_MIN: -0.45,
  /** scraper clutch score → attribute ceiling (1). */
  CLUTCH_MAX: 0.45,
  /** scraper composure score → attribute floor (0). Same reasoning as
   * CLUTCH_MIN (observed stdev ≈0.14, p99 ≈0.44, occasional outliers beyond
   * ±0.45 clamp). */
  COMPOSURE_MIN: -0.45,
  /** scraper composure score → attribute ceiling (1). */
  COMPOSURE_MAX: 0.45,
} as const;

/** Affine rating → 0–1000 skill, clamped. */
export function skillFromRating(rating: number): number {
  const t = (rating - MAP.R_MIN) / (MAP.R_MAX - MAP.R_MIN);
  return Math.round(Math.max(0, Math.min(1, t)) * 1000);
}

/** Affine score → the engine's 0–1 attribute scale, clamped. A score of 0
 * (neutral on the scraper's own scale) lands at 0.5, matching the engine's
 * other neutral-attribute defaults. Shared by endurance/core_strength/
 * clutch/composure — see their MAP.*_MIN/MAX anchors. */
function affineUnit(score: number, min: number, max: number): number {
  const t = (score - min) / (max - min);
  return Math.max(0, Math.min(1, t));
}

/** Affine endurance score → the engine's 0–1 attribute scale, clamped. A
 * score of 0 (no squash/table-tennis profile signal and no expert prior)
 * lands at 0.5, matching the engine's other neutral-attribute defaults. */
export function enduranceFromScore(score: number): number {
  return affineUnit(score, MAP.ENDURANCE_MIN, MAP.ENDURANCE_MAX);
}

/** Affine core_strength score → the engine's 0–1 attribute scale, clamped. */
export function coreStrengthFromScore(score: number): number {
  return affineUnit(score, MAP.CORE_STRENGTH_MIN, MAP.CORE_STRENGTH_MAX);
}

/** Affine clutch score → the engine's 0–1 attribute scale, clamped. */
export function clutchFromScore(score: number): number {
  return affineUnit(score, MAP.CLUTCH_MIN, MAP.CLUTCH_MAX);
}

/** Affine composure score → the engine's 0–1 attribute scale, clamped. */
export function composureFromScore(score: number): number {
  return affineUnit(score, MAP.COMPOSURE_MIN, MAP.COMPOSURE_MAX);
}

/** RD expressed in skill-space (same affine slope, no offset) so world
 * creation can sample N(skill, k·rdSkill) directly. */
export function rdInSkillSpace(rd: number): number {
  return Math.round((rd / (MAP.R_MAX - MAP.R_MIN)) * 1000);
}

export interface BundleSportRating {
  skill: number;
  /** rating deviation, in skill-space — drives per-world sampling spread */
  rdSkill: number;
}

export interface WorldBundlePlayer {
  playerId: string;
  firstName: string;
  lastName: string;
  /** ISO 3166-1 alpha-2 */
  nationality: string;
  gender: "m" | "f";
  /** real FIR birth year when known, else null (world creation synthesizes it) */
  birthYear: number | null;
  ratings: Record<GameSport, BundleSportRating>;
  /** real FIR ranking points (for tournament division placement — NOT the
   * in-game Layer 3 accumulator, see docs/07); null if unranked. Carried
   * through unchanged — no scaling at build time. */
  firPoints: number | null;
  /** 0–1, the engine's `endurance` attribute scale — see enduranceFromScore().
   * Modelled build-time from the player's sport profile (squash-relative
   * strength up, table-tennis-relative strength down), not measured from
   * match data — see Racketlon_TS's endurance.py for the full rationale. */
  endurance: number;
  /** 0–1, the engine's `coreStrength` attribute scale — see
   * coreStrengthFromScore(). No match-outcome data signal at all (unlike
   * endurance); expert-prior + skill-category only — see Racketlon_TS's
   * glicko2_ratings.py `compute_core_strength_scores()`. */
  coreStrength: number;
  /** 0–1, the engine's `clutch` attribute scale — see clutchFromScore().
   * Close-set performance vs Glicko expectation, blended with any expert
   * prior and the skill-category nudge — see Racketlon_TS's
   * glicko2_ratings.py `compute_mp_scores()`. */
  clutch: number;
  /** 0–1, the engine's `composure` attribute scale — see
   * composureFromScore(). Set-streak recovery/collapse signal, blended the
   * same way as clutch. */
  composure: number;
}

function mapSport(r: SportRating | null): BundleSportRating {
  // a missing sport gets a low floor and a wide RD so world creation scatters
  // it more (we're least sure about a sport they barely play)
  if (!r) return { skill: MAP.MISSING_SPORT_SKILL, rdSkill: rdInSkillSpace(350) };
  return { skill: skillFromRating(r.rating), rdSkill: rdInSkillSpace(r.rd) };
}

/** Splits a display name into first / last on the last space (single-word
 * names put everything in first). */
export function splitName(displayName: string): { firstName: string; lastName: string } {
  const trimmed = displayName.trim();
  const i = trimmed.lastIndexOf(" ");
  if (i === -1) return { firstName: trimmed, lastName: "" };
  return { firstName: trimmed.slice(0, i), lastName: trimmed.slice(i + 1) };
}

/**
 * Maps one joined player to a bundle entry. Returns null (with a warning) if
 * the country code can't be resolved to ISO-2 — the caller collects these and
 * fails the build rather than shipping an invalid nationality.
 */
export function toBundlePlayer(p: JoinedPlayer): WorldBundlePlayer | null {
  const nationality = iocToIso2(p.countryIOC);
  if (!nationality) return null;
  const { firstName, lastName } = splitName(p.displayName);
  const ratings = {} as Record<GameSport, BundleSportRating>;
  for (const sport of GAME_SPORTS) ratings[sport] = mapSport(p.perSport[sport]);
  return {
    playerId: p.playerId,
    firstName,
    lastName,
    nationality,
    gender: p.gender,
    birthYear: p.birthYear,
    ratings,
    firPoints: p.firPoints,
    endurance: enduranceFromScore(p.endurance),
    coreStrength: coreStrengthFromScore(p.coreStrength),
    clutch: clutchFromScore(p.clutch),
    composure: composureFromScore(p.composure),
  };
}

/** Average mapped skill across the four sports — the roster-selection key. */
export function averageSkill(bp: WorldBundlePlayer): number {
  const sum = GAME_SPORTS.reduce((acc, s) => acc + bp.ratings[s].skill, 0);
  return sum / GAME_SPORTS.length;
}
