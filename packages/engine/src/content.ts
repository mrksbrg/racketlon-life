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

/** Public-holiday schedule for a country, resolved per calendar year by
 * systems/holidays.ts. `fixed` dates repeat every year; `easter` names are
 * offsets from Easter Sunday (movable feasts), so both stay correct across a
 * multi-year career without per-year data. */
export interface HolidaySchedule {
  /** same date every year, as "MM-DD" (e.g. "12-25") */
  fixed: string[];
  /** movable feasts as named offsets from Easter Sunday — see
   * systems/holidays.ts's EASTER_OFFSETS (e.g. "good-friday", "easter-monday") */
  easter: string[];
}

/** A country's TravelSystem inputs — coordinates for distance, and a relative
 * cost-of-living index (1.0 = baseline) for hotel/food pricing. */
export interface CountryDef {
  name: string;
  lat: number;
  lon: number;
  costIndex: number;
  /** national federation president — flavor source for inbox messages tied
   * to this country (e.g. a player's own nationality). Not every federation
   * has a name on file yet, so this is optional. */
  president?: string;
  /** statutory annual paid-leave base for a player based here — the vacation
   * allowance (plus an age bonus) reset each Jan (see systems/vacation.ts).
   * Optional: falls back to BALANCE.vacation.defaultDays. */
  vacationDays?: number;
  /** national public holidays — days off that don't cost vacation and show
   * red on the calendar (see systems/holidays.ts). Optional: no entry means
   * no modelled holidays for that country yet. */
  holidays?: HolidaySchedule;
}

/** A named person holding an international FIR role — flavor source for the
 * inbox's official-looking mail (see world/factory.ts, systems/inbox.ts).
 * Keyed by a stable role id (e.g. "president", "rankingsOfficer") on
 * {@link ContentBundle.firOfficials}, distinct from `CountryDef.president`
 * which is per-national-federation, not FIR itself. */
export interface FirOfficialDef {
  role: string;
  name: string;
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
  /** 0–1, this player's build-time-mapped endurance score — the seed for
   * {@link PlayerAttributes.endurance} at world creation (world/factory.ts
   * samples around it, same spirit as the per-sport skill sampling). Modelled
   * from sport profile at import time, not measured from match fatigue — see
   * packages/content/src/import/mapRatings.ts. */
  endurance: number;
  /** 0–1, this player's build-time-mapped core strength score — the seed
   * for {@link PlayerAttributes.coreStrength} at world creation. No
   * match-outcome signal at all (unlike endurance); expert-prior +
   * skill-category only — see packages/content/src/import/mapRatings.ts. */
  coreStrength: number;
  /** 0–1, this player's build-time-mapped clutch score — the seed for
   * {@link PlayerAttributes.clutch} at world creation. Close-set
   * performance vs Glicko expectation, blended with any expert prior and
   * skill-category — see packages/content/src/import/mapRatings.ts. */
  clutch: number;
  /** 0–1, this player's build-time-mapped composure score — the seed for
   * {@link PlayerAttributes.composure} at world creation. Set-streak
   * recovery/collapse signal, blended the same way as clutch. */
  composure: number;
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
  /** named FIR office-holders, keyed by a stable role id — see
   * {@link FirOfficialDef}. Distinct from each country's own
   * `CountryDef.president`. */
  firOfficials: Record<string, FirOfficialDef>;
}
