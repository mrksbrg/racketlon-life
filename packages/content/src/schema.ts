import { z } from "zod";

/**
 * Zod schemas guarding the content bundle. Content is plain JSON edited by
 * hand (and later produced by the FIR import pipeline) — validation at load
 * time catches typos before they become weird gameplay.
 */

const sportSchema = z.enum(["tt", "bd", "sq", "tn"]);

const activitySchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  short: z.string().min(1),
  sport: sportSchema.optional(),
  trainingBase: z.number().positive().optional(),
  fatigue: z.number(),
  money: z.number(),
  injuryLoad: z.number().min(0),
});

/** Exhaustive: every ActivityType must be present. */
export const activitiesSchema = z.object({
  trainTT: activitySchema,
  trainBD: activitySchema,
  trainSQ: activitySchema,
  trainTN: activitySchema,
  physical: activitySchema,
  rest: activitySchema,
  work: activitySchema,
  social: activitySchema,
  errands: activitySchema,
});

/** Gendered so generated NPCs get a name matching their rolled gender —
 * draws are gender-separated (see tournament/engine.ts), so a mismatch would
 * be visible in the field. */
export const namePoolSchema = z.object({
  m: z.array(z.string().min(1)).min(1),
  f: z.array(z.string().min(1)).min(1),
  last: z.array(z.string().min(1)).min(1),
});

export const namesSchema = z.record(z.string().length(2), namePoolSchema);

/** A country's travel inputs — coordinates for distance, and a relative
 * cost-of-living index (1.0 = baseline) for hotel/food pricing. */
const countrySchema = z.object({
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  costIndex: z.number().positive(),
});

export const countriesSchema = z.record(z.string().length(2), countrySchema);

const tournamentSchema = z
  .object({
    id: z.string(),
    name: z.string().min(1),
    /** host city, for display and TravelSystem distance */
    city: z.string().min(1),
    /** ISO 3166-1 alpha-2 host country/territory — must have a countries.json entry */
    country: z.string().length(2),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    /** tour tier badge, e.g. "SAT" | "CHA" | "IWT" | "SWT" | "World Championships" */
    tier: z.string().min(1),
    /** ISO date (YYYY-MM-DD) the event starts — placed on the game's week
     * grid via `weekIndexForDate`; real events don't recur */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** trip length for TravelSystem's hotel/food cost */
    nights: z.number().int().positive(),
    entryFee: z.number().min(0),
    /** per-gender draw size — men's and women's fields are always this same
     * size, seeded and played as separate brackets (never mixed) */
    fieldSize: z.union([z.literal(8), z.literal(16), z.literal(32), z.literal(64)]),
    prizeByRoundsWon: z.array(z.number().min(0)),
  })
  .refine((t) => t.prizeByRoundsWon.length === Math.log2(t.fieldSize) + 1, {
    message: "prizeByRoundsWon length must equal log2(fieldSize) + 1",
  });

export const tournamentsSchema = z.record(z.string(), tournamentSchema);

const traitSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  category: z.enum(["mentality", "lifestyle", "training", "competition", "body"]),
  tone: z.enum(["positive", "negative", "neutral"]),
  rarity: z.enum(["common", "uncommon", "rare"]),
  description: z.string().min(1),
  excludes: z.array(z.string()).optional(),
});

export const traitsSchema = z.record(z.string(), traitSchema);
