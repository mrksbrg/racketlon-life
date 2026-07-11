import type { ActivityDef, ActivityType } from "./model/activity.js";
import type { Sport } from "./model/sport.js";
import type { TournamentDef } from "./tournament/engine.js";

/**
 * Engine-side contract for game content. Code describes how the game works;
 * content bundles describe the world. The engine never loads files itself —
 * the app passes a validated bundle in (packages/content provides the default).
 */

/** Gendered so generated NPCs get a name matching their rolled gender. */
export interface NamePool {
  m: string[];
  f: string[];
  last: string[];
}

/** A country's TravelSystem inputs — coordinates for distance, and a relative
 * cost-of-living index (1.0 = baseline) for hotel/food pricing. */
export interface CountryDef {
  name: string;
  lat: number;
  lon: number;
  costIndex: number;
}

export type TraitCategory = "mentality" | "lifestyle" | "training" | "competition" | "body";
export type TraitTone = "positive" | "negative" | "neutral";
export type TraitRarity = "common" | "uncommon" | "rare";

/**
 * A RimWorld-style personality trait — narrative flavor first, not a stat
 * modifier. Most traits carry no mechanical hook at all yet; `excludes`
 * keeps logically contradictory traits (e.g. Night Owl/Morning Person) from
 * ever co-occurring on the same character.
 */
export interface TraitDef {
  id: string;
  name: string;
  category: TraitCategory;
  tone: TraitTone;
  rarity: TraitRarity;
  description: string;
  /** trait ids that can never be rolled together with this one */
  excludes?: string[];
}

/** One real player's mapped rating for a sport, from the FIR world bundle.
 * `skill` is on the internal 0–1000 scale; `rdSkill` is the rating deviation
 * in that same scale, driving how much world creation scatters this player. */
export interface RealPlayerRating {
  skill: number;
  rdSkill: number;
}

/**
 * A real racketlon player imported from scraped FIR ratings (the
 * `world-bundle.json` roster). The build-time import maps Glicko → skill; the
 * per-world sampling of exact skill/attributes/birth date happens at world
 * creation in `world/factory.ts`. See packages/content/src/import/README.md.
 */
export interface RealPlayerDef {
  playerId: string;
  firstName: string;
  lastName: string;
  /** ISO 3166-1 alpha-2 */
  nationality: string;
  gender: "m" | "f";
  /** real FIR birth year when known, else null (world creation synthesizes it) */
  birthYear: number | null;
  ratings: Record<Sport, RealPlayerRating>;
  /** real FIR ranking points as of the import snapshot — used only to place
   * this player into a tournament division (see systems/division.ts). This
   * is NOT docs/07's in-game Layer 3 accumulator (points earned from the
   * human's own placements, still unbuilt) — a static, real-world number,
   * never updated by gameplay. Null if this player has no FIR-counted
   * result yet, in which case `divisionAssignments` bands them by in-game
   * skill instead (see systems/division.ts) rather than assuming unranked
   * means weakest. */
  firPoints: number | null;
}

/**
 * FIR Ranking Points Matrix (Open events) — the placement-points table from
 * the FIR Ranking Regulations, Annex A. Keyed by the content `tier` string →
 * class band (A..E) → points indexed by (finishingPosition − 1). A finishing
 * position beyond the array clamps to its last entry (the published "49+"
 * row). Only the Open-events table is modelled today; Seniors/Juniors/Doubles
 * are future categories. See systems/ranking-points.ts and
 * packages/content/data/ranking-matrix.json.
 */
export type RankingMatrix = Record<string, Record<string, number[]>>;

export interface ContentBundle {
  version: string;
  activities: Record<ActivityType, ActivityDef>;
  /** name pools keyed by ISO country code */
  names: Record<string, NamePool>;
  /** travel inputs keyed by ISO country code — every tournament's `country`
   * and every player's `nationality` must have an entry */
  countries: Record<string, CountryDef>;
  /** tournament defs keyed by id — placeholder generic events until the
   * FIR-sourced real calendar lands (M2) */
  tournaments: Record<string, TournamentDef>;
  /** personality trait pool keyed by id — see {@link TraitDef} */
  traits: Record<string, TraitDef>;
  /** FIR placement-points table (Ranking Regs Annex A) — see {@link RankingMatrix} */
  rankingMatrix: RankingMatrix;
  /** real-player roster from the FIR world bundle — the pool world creation
   * seeds tier-1 NPCs from (replaces the old random generation) */
  players: RealPlayerDef[];
}
