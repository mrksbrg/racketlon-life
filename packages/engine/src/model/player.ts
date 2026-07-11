import type { Sport } from "./sport.js";

export type Skills = Record<Sport, number>; // 0–1000 internal scale

export interface PlayerIdentity {
  id: string;
  firstName: string;
  lastName: string;
  nationality: string; // ISO 3166-1 alpha-2
  clubId?: string;
  birthDate: string; // ISO date
  gender: "m" | "f";
  /** true when seeded from real FIR data */
  isReal: boolean;
}

/** Slow-changing, mostly hidden attributes. */
export interface PlayerAttributes {
  skills: Skills;
  /** 0..1 per sport — hidden ceiling roll, not point-bought. Scales training
   * speed and sets a soft per-sport skill cap (see BALANCE.training) — some
   * sports a player is simply built for, others where they plateau earlier.
   * Never shown as a number; systems/inbox.ts sends vague "clue" messages as
   * a sport's skill nears its ceiling. */
  potential: Record<Sport, number>;
  /** 0..1 — injury resistance + recovery speed ("Läkekött"), used from M1 */
  durability: number;
  /** 0..1 — drives AI planning quality and consistency */
  professionalism: number;
  /** 0..1 — in-match energy reserve; slows fatigue build-up (Stamina) */
  stamina: number;
  /** 0..1 — gates the university-studies track; minor tactical-learning bonus */
  intelligence: number;
  /** 0..1 — win-rate on the deciding gummiarm point ("Vinnarskalle") */
  clutch: number;
  /** 0..1 — steadier form/confidence under pressure (Mental strength) */
  composure: number;
  /** RimWorld-style personality trait ids, rolled once at creation — see
   * {@link TraitDef} in content.ts. Mostly narrative flavor, not stat
   * modifiers; visible on the player's own Me screen but never for
   * opponents. Only the human career player gets these for now. */
  traits: string[];
}

export interface Injury {
  type: string;
  severity: number; // 1..3
  weeksRemaining: number;
}

/** Fast-changing, visible condition. */
export interface PlayerCondition {
  fatigue: number; // 0..100
  /** 0..20 per sport — "tournament readiness," driven by training neglect:
   * rises when a sport is trained this week, decays when it isn't (see
   * systems/training.ts). Visible to the player; scales usable skill in
   * matches (see BALANCE.form, match/engine.ts's effectiveStrength). */
  formBySport: Record<Sport, number>;
  confidence: number; // -10..10
  injury: Injury | null;
}

/** Glicko-2 per sport — the *observed* rating layer, updated after results. */
export interface Glicko {
  rating: number;
  rd: number;
  volatility: number;
}

export type Ratings = Record<Sport, Glicko>;

/**
 * Level-of-detail tier:
 * 0 = human career player (full 21-slot plan)
 * 1 = active NPC (compact AI plan each week)
 * 2 = background population (lazy statistical drift, no weekly sim)
 */
export type SimTier = 0 | 1 | 2;

export interface Player {
  identity: PlayerIdentity;
  attributes: PlayerAttributes;
  condition: PlayerCondition;
  ratings: Ratings;
  /** Real FIR ranking points as of the import snapshot — an observable
   * "official standing" like `ratings`, not a hidden attribute. Used only to
   * place this player into a tournament division (see systems/division.ts).
   * NOT docs/07's in-game Layer 3 accumulator (points earned from the
   * human's own placements, still unbuilt) — this never changes during a
   * career. Always null for the human (no points-earning system yet). */
  firPoints: number | null;
  simTier: SimTier;
}

export function fullName(p: Player): string {
  return `${p.identity.firstName} ${p.identity.lastName}`;
}
