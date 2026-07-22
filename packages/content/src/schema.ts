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
  gym: activitySchema,
  cardio: activitySchema,
  rest: activitySchema,
  work: activitySchema,
  social: activitySchema,
  travel: activitySchema,
});

/** Optional [severity1, severity2, severity3] weight override — lets a
 * dramatic catalog entry (e.g. an Achilles rupture) stay rare-but-plausible
 * instead of "guaranteed severity 3 whenever a brutal week rolls severity 3." */
const severityWeightsSchema = z.tuple([z.number().min(0), z.number().min(0), z.number().min(0)]);

/** Optional [min, max] weeks override (inclusive) — replaces the generic
 * severity-tier duration table for a catastrophic entry whose real recovery
 * time doesn't fit that table's 5-7 week cap even at severity 3. */
const weeksRemainingRangeSchema = z.tuple([z.number().int().positive(), z.number().int().positive()]);

const injurySchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  bodyPart: z.string().min(1),
  kind: z.literal("injury"),
  sportWeights: z.object({
    tt: z.number().min(0).optional(),
    bd: z.number().min(0).optional(),
    sq: z.number().min(0).optional(),
    tn: z.number().min(0).optional(),
    gym: z.number().min(0).optional(),
  }),
  severityWeights: severityWeightsSchema.optional(),
  weeksRemainingRange: weeksRemainingRangeSchema.optional(),
  maxHealRate: z.number().positive().optional(),
  rare: z.boolean().optional(),
});

export const injuriesSchema = z.record(z.string().min(1), injurySchema);

const illnessSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  kind: z.literal("illness"),
  severityWeights: severityWeightsSchema.optional(),
  weeksRemainingRange: weeksRemainingRangeSchema.optional(),
  maxHealRate: z.number().positive().optional(),
  rare: z.boolean().optional(),
});

export const illnessesSchema = z.record(z.string().min(1), illnessSchema);

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
const holidayScheduleSchema = z.object({
  /** same date every year, "MM-DD" */
  fixed: z.array(z.string().regex(/^\d{2}-\d{2}$/)),
  /** movable feasts as named offsets from Easter Sunday */
  easter: z.array(z.string().min(1)),
});

const countrySchema = z.object({
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  costIndex: z.number().positive(),
  /** national federation president, when known */
  president: z.string().min(1).optional(),
  /** statutory annual paid-leave base (see systems/vacation.ts) */
  vacationDays: z.number().nonnegative().optional(),
  /** national public holidays (see systems/holidays.ts) */
  holidays: holidayScheduleSchema.optional(),
});

export const countriesSchema = z.record(z.string().length(2), countrySchema);

/** A named FIR office-holder, keyed by a stable role id (e.g. "president",
 * "rankingsOfficer") — see packages/content/data/fir-officials.json. */
const firOfficialSchema = z.object({
  role: z.string().min(1),
  name: z.string().min(1),
});

export const firOfficialsSchema = z.record(z.string().min(1), firOfficialSchema);

const tournamentSchema = z
  .object({
    id: z.string(),
    /** shared across every division of the same physical event, e.g.
     * "hamburg-open-2026" — `id` itself is per-division-unique */
    eventId: z.string().min(1),
    /** skill-tier bracket within the event — how many divisions a tier gets
     * (per gender) is BALANCE.division.byTier, not enforced here */
    division: z.enum(["A", "B", "C", "D", "E"]),
    /** which gender's draw this row is — men's and women's fields for the
     * same tier can now differ in both division count and fieldSize (real
     * FIR draws are gender-specific), so every row belongs to exactly one */
    gender: z.enum(["m", "f"]),
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
    /** this row's own draw size — men's and women's brackets for the same
     * tier/division letter can now differ (real FIR draws are gender-specific
     * in size), always seeded and played as separate brackets (never mixed) */
    fieldSize: z.union([z.literal(8), z.literal(16), z.literal(32), z.literal(64)]),
    prizeByRoundsWon: z.array(z.number().min(0)),
    /** named tournament director, when known */
    director: z.string().min(1).optional(),
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

/** The FIR world bundle (data/world-bundle.json), produced by `npm run
 * build:world` from the private scraper output. See src/import/. */
const realPlayerRatingSchema = z.object({
  skill: z.number().min(0).max(1000),
  rdSkill: z.number().min(0),
});

/** Manually reviewed, renderer-neutral overrides keyed by stable playerId. */
export const portraitCueSchema = z
  .object({
    head: z.string().min(1).optional(),
    skinPalette: z.string().min(1).optional(),
    hair: z.string().min(1).optional(),
    hairPalette: z.string().min(1).optional(),
    eyes: z.string().min(1).optional(),
    brows: z.string().min(1).optional(),
    nose: z.string().min(1).optional(),
    mouth: z.string().min(1).optional(),
    facialHair: z.string().min(1).nullable().optional(),
    accessory: z.string().min(1).nullable().optional(),
    ageMarks: z.array(z.string().min(1)).optional(),
  })
  .strict()
  .refine((cues) => Object.keys(cues).length > 0, "A portrait cue entry must override at least one field");

export const portraitCuesSchema = z.record(z.string().min(1), portraitCueSchema);

const realPlayerSchema = z.object({
  playerId: z.string().min(1),
  firstName: z.string(),
  lastName: z.string(),
  nationality: z.string().length(2),
  gender: z.enum(["m", "f"]),
  birthYear: z.number().int().nullable(),
  ratings: z.object({
    tt: realPlayerRatingSchema,
    bd: realPlayerRatingSchema,
    sq: realPlayerRatingSchema,
    tn: realPlayerRatingSchema,
  }),
  firPoints: z.number().nullable(),
  endurance: z.number().min(0).max(1),
  coreStrength: z.number().min(0).max(1),
  clutch: z.number().min(0).max(1),
  composure: z.number().min(0).max(1),
});

/**
 * FIR Ranking Points Matrix (Open events, Ranking Regs Annex A):
 * tier → class band (A..E) → points indexed by (finishingPosition − 1).
 * Tier keys are the free-form `tier` strings used in tournaments.json; each
 * class array must be non-empty (its last entry is the published "49+" row).
 */
export const rankingMatrixSchema = z.record(
  z.string().min(1),
  z.record(z.string().min(1), z.array(z.number().min(0)).min(1)),
);

export const worldBundleSchema = z.object({
  note: z.string().optional(),
  counts: z.object({ men: z.number(), women: z.number(), total: z.number() }).optional(),
  players: z.array(realPlayerSchema),
});
