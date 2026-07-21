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

function hairFor(seed: string, ageYears: number | undefined): string {
  const choices = ageYears !== undefined && ageYears >= 40 ? [...catalog.hair, ...catalog.matureHair] : catalog.hair;
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
    skinPalette: pick(seed, "skin-palette", catalog.skinPalettes),
    hair: hairFor(seed, ageYears),
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
