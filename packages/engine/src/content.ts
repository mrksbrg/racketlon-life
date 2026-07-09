import type { ActivityDef, ActivityType } from "./model/activity.js";
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
}
