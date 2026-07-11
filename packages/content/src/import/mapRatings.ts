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
} as const;

/** Affine rating → 0–1000 skill, clamped. */
export function skillFromRating(rating: number): number {
  const t = (rating - MAP.R_MIN) / (MAP.R_MAX - MAP.R_MIN);
  return Math.round(Math.max(0, Math.min(1, t)) * 1000);
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
  };
}

/** Average mapped skill across the four sports — the roster-selection key. */
export function averageSkill(bp: WorldBundlePlayer): number {
  const sum = GAME_SPORTS.reduce((acc, s) => acc + bp.ratings[s].skill, 0);
  return sum / GAME_SPORTS.length;
}
