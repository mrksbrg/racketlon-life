import { PORTRAIT_V1_CATALOG as catalog } from "./catalog.js";
import type { PortraitInput, PortraitOffset, PortraitRecipe } from "./contracts.js";

export const PORTRAIT_RECIPE_VERSION = 1;

/** Stable FNV-1a hash. Changing it requires a new recipe version. */
function hash(value: string): number {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return result >>> 0;
}

function roll(seed: string, channel: string): number {
  return hash(`portrait:${PORTRAIT_RECIPE_VERSION}:${seed}:${channel}`) / 0x1_0000_0000;
}

function pick<T>(seed: string, channel: string, values: readonly T[]): T {
  const value = values[Math.floor(roll(seed, channel) * values.length)];
  if (value === undefined) throw new Error(`Portrait catalog channel "${channel}" is empty`);
  return value;
}

/** Weighted pick from the same deterministic roll. Every weight must stay > 0 upstream. */
function pickWeighted<T>(seed: string, channel: string, values: readonly T[], weights: readonly number[]): T {
  if (values.length !== weights.length) {
    throw new Error(`Portrait catalog channel "${channel}" has ${values.length} values but ${weights.length} weights`);
  }
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let target = roll(seed, channel) * total;
  for (let index = 0; index < values.length; index++) {
    target -= weights[index] ?? 0;
    if (target < 0) return values[index] as T;
  }
  return values[values.length - 1] as T;
}

function chance(seed: string, channel: string, probability: number): boolean {
  return roll(seed, channel) < probability;
}

function offset(seed: string, channel: string, minX: number, maxX: number, minY: number, maxY: number): PortraitOffset {
  const x = minX + Math.floor(roll(seed, `${channel}:x`) * (maxX - minX + 1));
  const y = minY + Math.floor(roll(seed, `${channel}:y`) * (maxY - minY + 1));
  return { x, y };
}

function normalizeAge(ageYears: number | undefined): number | undefined {
  if (ageYears === undefined) return undefined;
  if (!Number.isFinite(ageYears) || ageYears < 0) {
    throw new Error("Portrait ageYears must be a finite, non-negative number");
  }
  return Math.floor(ageYears);
}

const MASCULINE_HAIR = ["crop", "side-part", "swept", "curly-short", "buzz", "shaggy"] as const;
const FEMININE_HAIR = ["crop", "side-part", "swept", "curly-short", "shaggy", "long-straight", "long-wavy", "ponytail", "bun"] as const;

function hairFor(seed: string, ageYears: number | undefined, gender: PortraitInput["gender"]): string {
  const baseChoices = gender === "m" ? MASCULINE_HAIR : gender === "f" ? FEMININE_HAIR : catalog.hair;
  const choices = ageYears !== undefined && ageYears >= 40 && gender !== "f"
    ? [...baseChoices, ...catalog.matureHair]
    : baseChoices;
  return pick(seed, "hair", choices);
}

function hairPaletteFor(seed: string, ageYears: number | undefined): string {
  if (ageYears !== undefined && ageYears >= 58 && chance(seed, "hair-grey", 0.75)) {
    return pick(seed, "hair-palette-grey", catalog.greyHairPalettes);
  }
  if (ageYears !== undefined && ageYears >= 42 && chance(seed, "hair-grey", 0.35)) {
    return pick(seed, "hair-palette-grey", catalog.greyHairPalettes);
  }
  return pick(seed, "hair-palette", catalog.hairPalettes);
}

function ageMarksFor(seed: string, ageYears: number | undefined): string[] | undefined {
  const marks: string[] = [];
  if (chance(seed, "detail-freckles", 0.18)) marks.push("freckles");
  if (chance(seed, "detail-mole", 0.12)) marks.push("mole");
  if (ageYears !== undefined && ageYears >= 38 && chance(seed, "detail-cheek-lines", 0.5)) marks.push("cheek-lines");
  if (ageYears !== undefined && ageYears >= 48) marks.push(pick(seed, "detail-mature", ["forehead-lines", "eye-lines", "smile-lines"]));
  return marks.length > 0 ? marks : undefined;
}

function facialHairFor(seed: string, gender: PortraitInput["gender"]): string | undefined {
  if (gender !== "m" || !chance(seed, "facial-hair-presence", 0.48)) return undefined;
  return pick(seed, "facial-hair", catalog.facialHair);
}

function accessoryFor(seed: string): string | undefined {
  if (!chance(seed, "accessory-presence", 0.22)) return undefined;
  return pick(seed, "accessory", catalog.accessories);
}

function shirtPaletteFor(country: string | undefined): string {
  if (country === undefined || country.trim() === "") return "neutral";
  return `country-${country.trim().toUpperCase()}`;
}

/**
 * Rough regional skin-tone weighting, used only to make the generated player
 * pool feel plausible per country rather than uniform everywhere. These are
 * coarse tiers for game-design purposes, not demographic data, and every tier
 * keeps a nonzero weight on every `catalog.skinPalettes` entry (skin-01
 * lightest to skin-08 darkest) because a real country's player pool is always
 * more diverse than any tier can capture. Countries missing from the map fall
 * back to a uniform roll. See "Regional skin-tone weighting" in
 * docs/08-portrait-system.md.
 */
const SKIN_WEIGHTS_BY_REGION = {
  nordic: [0.30, 0.28, 0.16, 0.10, 0.06, 0.04, 0.03, 0.03],
  "western-europe": [0.22, 0.24, 0.16, 0.12, 0.08, 0.06, 0.06, 0.06],
  "southern-europe": [0.10, 0.16, 0.24, 0.20, 0.12, 0.08, 0.06, 0.04],
  "eastern-europe": [0.28, 0.28, 0.18, 0.10, 0.06, 0.04, 0.03, 0.03],
  "mena-central-asia": [0.06, 0.10, 0.18, 0.22, 0.20, 0.12, 0.08, 0.04],
  "sub-saharan-africa": [0.03, 0.04, 0.06, 0.08, 0.12, 0.18, 0.24, 0.25],
  "south-asia": [0.03, 0.06, 0.14, 0.22, 0.24, 0.16, 0.10, 0.05],
  "east-southeast-asia": [0.10, 0.22, 0.28, 0.20, 0.10, 0.05, 0.03, 0.02],
  americas: [0.12, 0.14, 0.14, 0.14, 0.12, 0.12, 0.11, 0.11],
  oceania: [0.22, 0.24, 0.16, 0.12, 0.08, 0.08, 0.05, 0.05],
} as const satisfies Record<string, readonly number[]>;

type SkinRegionTier = keyof typeof SKIN_WEIGHTS_BY_REGION;

const SKIN_REGION_BY_COUNTRY: Record<string, SkinRegionTier> = {
  SE: "nordic", DK: "nordic", FI: "nordic", NO: "nordic",
  DE: "western-europe", AT: "western-europe", GB: "western-europe", CH: "western-europe",
  NL: "western-europe", FR: "western-europe", IE: "western-europe", BE: "western-europe", LI: "western-europe",
  ES: "southern-europe", IT: "southern-europe", GR: "southern-europe", MT: "southern-europe", HR: "southern-europe",
  PL: "eastern-europe", CZ: "eastern-europe", HU: "eastern-europe", RU: "eastern-europe", SI: "eastern-europe",
  BY: "eastern-europe", BG: "eastern-europe", EE: "eastern-europe", LV: "eastern-europe", RO: "eastern-europe",
  SK: "eastern-europe", UA: "eastern-europe",
  TR: "mena-central-asia", MA: "mena-central-asia", EG: "mena-central-asia", JO: "mena-central-asia",
  IL: "mena-central-asia", AF: "mena-central-asia", TJ: "mena-central-asia",
  ZA: "sub-saharan-africa", ER: "sub-saharan-africa",
  IN: "south-asia",
  CN: "east-southeast-asia", JP: "east-southeast-asia", KR: "east-southeast-asia", HK: "east-southeast-asia",
  TH: "east-southeast-asia", MY: "east-southeast-asia", SG: "east-southeast-asia", ID: "east-southeast-asia",
  US: "americas", CA: "americas", BR: "americas", PE: "americas", CU: "americas",
  AU: "oceania", NZ: "oceania", PG: "oceania",
};

const UNIFORM_SKIN_WEIGHTS: readonly number[] = catalog.skinPalettes.map(() => 1);

function skinPaletteFor(seed: string, country: string | undefined): string {
  const tier = country === undefined || country.trim() === ""
    ? undefined
    : SKIN_REGION_BY_COUNTRY[country.trim().toUpperCase()];
  const weights = tier === undefined ? UNIFORM_SKIN_WEIGHTS : SKIN_WEIGHTS_BY_REGION[tier];
  return pickWeighted(seed, "skin-palette", catalog.skinPalettes, weights);
}

function generatedOffsets(seed: string): Record<string, PortraitOffset> {
  return {
    hair: offset(seed, "offset:hair", -1, 1, -1, 0),
    eyes: offset(seed, "offset:eyes", -1, 1, -1, 1),
    brows: offset(seed, "offset:brows", -1, 1, -1, 1),
    nose: offset(seed, "offset:nose", -1, 1, -1, 1),
    mouth: offset(seed, "offset:mouth", -1, 1, 0, 1),
  };
}

/** Derive a compact seed when imported content does not persist one yet. */
export function portraitSeedFor(playerId: string): string {
  const normalized = playerId.trim();
  if (normalized === "") throw new Error("Cannot derive a portrait seed from an empty playerId");
  return `p-${hash(normalized).toString(36).padStart(7, "0")}`;
}

/**
 * Generate version 1's renderer-neutral recipe.
 *
 * Each choice has its own hash channel. Adding a new optional feature therefore
 * cannot reshuffle all existing features inside the same recipe version.
 */
export function generatePortraitRecipe(input: PortraitInput): PortraitRecipe {
  if (input.playerId.trim() === "") throw new Error("Portrait playerId must not be empty");
  const seed = input.portraitSeed.trim();
  if (seed === "") throw new Error("Portrait portraitSeed must not be empty");
  const ageYears = normalizeAge(input.ageYears);
  const facialHair = facialHairFor(seed, input.gender);
  const accessory = accessoryFor(seed);
  const ageMarks = ageMarksFor(seed, ageYears);

  const generated: PortraitRecipe = {
    version: PORTRAIT_RECIPE_VERSION,
    seed,
    head: pick(seed, "head", catalog.heads),
    skinPalette: skinPaletteFor(seed, input.country),
    hair: hairFor(seed, ageYears, input.gender),
    hairPalette: hairPaletteFor(seed, ageYears),
    eyes: pick(seed, "eyes", catalog.eyes),
    brows: pick(seed, "brows", catalog.brows),
    nose: pick(seed, "nose", catalog.noses),
    mouth: pick(seed, "mouth", catalog.mouths),
    ...(facialHair === undefined ? {} : { facialHair }),
    ...(accessory === undefined ? {} : { accessory }),
    ...(ageMarks === undefined ? {} : { ageMarks }),
    shirt: pick(seed, "shirt", catalog.shirts),
    shirtPalette: shirtPaletteFor(input.country),
    offsets: generatedOffsets(seed),
  };

  const overrides = input.publicCues;
  if (overrides === undefined) return generated;

  const { facialHair: facialHairOverride, accessory: accessoryOverride, ...otherOverrides } = overrides;
  const merged: PortraitRecipe = {
    ...generated,
    ...otherOverrides,
    version: PORTRAIT_RECIPE_VERSION,
    seed,
    offsets: { ...generated.offsets, ...overrides.offsets },
  };
  if (facialHairOverride === null) delete merged.facialHair;
  else if (facialHairOverride !== undefined) merged.facialHair = facialHairOverride;
  if (accessoryOverride === null) delete merged.accessory;
  else if (accessoryOverride !== undefined) merged.accessory = accessoryOverride;
  return merged;
}
