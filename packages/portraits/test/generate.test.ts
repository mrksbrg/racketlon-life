import { describe, expect, it } from "vitest";
import {
  defaultPortraitProvider,
  generatePortraitRecipe,
  portraitInputForPlayer,
  portraitSeedFor,
  type PortraitProvider,
  type PortraitRecipe,
} from "../src/index.js";

const input = {
  playerId: "fir:markus-borg:se",
  portraitSeed: "player-0042",
  ageYears: 44,
  gender: "m" as const,
  country: "SE",
};

describe("portrait recipe generation", () => {
  it("keeps the version 2 recipe stable for a fixed input", () => {
    expect(generatePortraitRecipe(input)).toEqual({
      // This explicit golden recipe makes accidental version-2 changes fail.
      version: 2,
      seed: "player-0042",
      head: "broad",
      skinPalette: "skin-01",
      hair: "side-part",
      hairPalette: "grey",
      eyes: "soft",
      brows: "straight",
      nose: "straight",
      mouth: "neutral",
      facialHair: "stubble",
      ageMarks: ["cheek-lines"],
      shirt: "training",
      shirtPalette: "country-SE",
      offsets: {
        hair: { x: 1, y: 0 },
        eyes: { x: 0, y: 0 },
        brows: { x: -1, y: -1 },
        nose: { x: -1, y: -1 },
        mouth: { x: 0, y: 1 },
      },
    });
  });

  it("is deterministic and produces different identities for different seeds", () => {
    expect(generatePortraitRecipe(input)).toEqual(generatePortraitRecipe({ ...input }));
    expect(generatePortraitRecipe(input)).not.toEqual(
      generatePortraitRecipe({ ...input, portraitSeed: "player-0043" }),
    );
  });

  it("derives a stable compact seed from a player ID", () => {
    expect(portraitSeedFor("fir:markus-borg:se")).toBe("p-0jr56v2");
    expect(portraitSeedFor("fir:markus-borg:se")).toBe(portraitSeedFor("fir:markus-borg:se"));
  });

  it("applies semantic overrides without allowing recipe identity to be replaced", () => {
    const recipe = generatePortraitRecipe({
      ...input,
      publicCues: {
        hair: "hand-tuned-hair",
        hairPalette: "auburn",
        eyes: "narrow",
        accessory: "round-glasses",
        offsets: { hair: { x: 2, y: -1 } },
      },
    });

    expect(recipe.hair).toBe("hand-tuned-hair");
    expect(recipe.hairPalette).toBe("auburn");
    expect(recipe.eyes).toBe("narrow");
    expect(recipe.accessory).toBe("round-glasses");
    expect(recipe.seed).toBe(input.portraitSeed);
    expect(recipe.version).toBe(2);
    expect(recipe.offsets.hair).toEqual({ x: 2, y: -1 });
    expect(recipe.offsets.eyes).toBeDefined();
  });

  it("lets reviewed cues explicitly remove generated optional features", () => {
    const recipe = generatePortraitRecipe({
      ...input,
      publicCues: { accessory: null, facialHair: null },
    });

    expect(recipe.accessory).toBeUndefined();
    expect(recipe.facialHair).toBeUndefined();
  });

  it("adapts imported player metadata and reviewed cues to portrait input", () => {
    const adapted = portraitInputForPlayer(
      {
        playerId: "fir:reviewed-player:se",
        nationality: "SE",
        gender: "f",
      },
      { ageYears: 27, cues: { eyes: "focused", accessory: null } },
    );

    expect(adapted).toEqual({
      playerId: "fir:reviewed-player:se",
      portraitSeed: portraitSeedFor("fir:reviewed-player:se"),
      ageYears: 27,
      gender: "f",
      country: "SE",
      publicCues: { eyes: "focused", accessory: null },
    });
    expect(generatePortraitRecipe(adapted).accessory).toBeUndefined();
  });

  it("uses country only for regional appearance weights and the shirt accent", () => {
    const swedish = generatePortraitRecipe(input);
    const german = generatePortraitRecipe({ ...input, country: "DE" });
    const {
      shirtPalette: swedishPalette,
      skinPalette: swedishSkin,
      hairPalette: swedishHair,
      eyes: swedishEyes,
      ...swedishIdentity
    } = swedish;
    const {
      shirtPalette: germanPalette,
      skinPalette: germanSkin,
      hairPalette: germanHair,
      eyes: germanEyes,
      ...germanIdentity
    } = german;

    expect(swedishIdentity).toEqual(germanIdentity);
    expect(swedishPalette).not.toBe(germanPalette);
    // A single deterministic roll may land on the same bucket in two tiers;
    // the distribution tests below cover the regional weighting itself.
    void swedishSkin;
    void germanSkin;
    void swedishHair;
    void germanHair;
    void swedishEyes;
    void germanEyes;
  });

  it("keeps the darkest European skin palettes exceptional, not commonplace", () => {
    const skinIndex = (skinPalette: string) => Number.parseInt(skinPalette.replace("skin-", ""), 10);
    const sampleSkinIndexes = (country: string, samples: number) =>
      Array.from({ length: samples }, (_, index) =>
        skinIndex(generatePortraitRecipe({ ...input, country, portraitSeed: `region-${country}-${index}` }).skinPalette),
      );

    const samples = 50_000;
    const nordic = sampleSkinIndexes("SE", samples);
    const southernAfrica = sampleSkinIndexes("ZA", samples);
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const share = (values: number[], predicate: (value: number) => boolean) =>
      values.filter(predicate).length / values.length;

    // All tones remain possible, including rare hand-correctable exceptions.
    expect(new Set(nordic).size).toBe(8);
    expect(new Set(southernAfrica).size).toBe(8);

    expect(share(nordic, (value) => value >= 7)).toBeLessThan(0.0005);
    expect(share(nordic, (value) => value >= 6)).toBeLessThan(0.008);
    expect(mean(southernAfrica)).toBeGreaterThan(mean(nordic) + 2);

    const unmapped = sampleSkinIndexes("XX", 4000);
    expect(new Set(unmapped).size).toBe(8);
  });

  it("weights natural hair colour and eye shape by region", () => {
    const samples = 12_000;
    const sampleRecipes = (country: string) =>
      Array.from({ length: samples }, (_, index) => generatePortraitRecipe({
        ...input,
        country,
        ageYears: 25,
        portraitSeed: `appearance-${country}-${index}`,
      }));
    const share = <T>(values: T[], predicate: (value: T) => boolean) =>
      values.filter(predicate).length / values.length;

    const nordic = sampleRecipes("SE");
    const eastAsian = sampleRecipes("JP");

    expect(share(nordic, (recipe) => recipe.hairPalette === "blonde")).toBeGreaterThan(0.28);
    expect(share(eastAsian, (recipe) => recipe.hairPalette === "black")).toBeGreaterThan(0.86);
    expect(share(eastAsian, (recipe) => recipe.eyes === "narrow")).toBeGreaterThan(0.44);
    expect(share(nordic, (recipe) => recipe.eyes === "narrow")).toBeLessThan(0.11);

    expect(new Set(nordic.map((recipe) => recipe.hairPalette)).size).toBe(6);
    expect(new Set(eastAsian.map((recipe) => recipe.eyes)).size).toBe(6);
  });

  it("keeps mature hair and grey palettes out of the young-player pool", () => {
    const matureHair = new Set(["receding", "bald"]);
    const greyHair = new Set(["salt-and-pepper", "grey"]);

    for (let index = 0; index < 100; index++) {
      const recipe = generatePortraitRecipe({
        ...input,
        portraitSeed: `young-${index}`,
        ageYears: 20,
      });
      expect(matureHair.has(recipe.hair ?? "")).toBe(false);
      expect(greyHair.has(recipe.hairPalette ?? "")).toBe(false);
    }
  });

  it("uses age- and gender-aware hairstyle pools while preserving manual overrides", () => {
    const masculine = new Set(["crop", "side-part", "swept", "curly-short", "buzz", "shaggy"]);
    const feminine = new Set(["crop", "side-part", "swept", "curly-short", "shaggy", "long-straight", "long-wavy", "ponytail", "bun"]);

    for (let index = 0; index < 100; index++) {
      const male = generatePortraitRecipe({ ...input, portraitSeed: `male-${index}`, ageYears: 25, gender: "m" });
      const female = generatePortraitRecipe({ ...input, portraitSeed: `female-${index}`, ageYears: 25, gender: "f" });
      expect(masculine.has(male.hair ?? "")).toBe(true);
      expect(feminine.has(female.hair ?? "")).toBe(true);
    }

    expect(generatePortraitRecipe({
      ...input,
      gender: "m",
      publicCues: { hair: "long-wavy" },
    }).hair).toBe("long-wavy");
  });

  it("rejects unstable or invalid identity inputs", () => {
    expect(() => generatePortraitRecipe({ ...input, playerId: " " })).toThrow(/playerId/);
    expect(() => generatePortraitRecipe({ ...input, portraitSeed: " " })).toThrow(/portraitSeed/);
    expect(() => generatePortraitRecipe({ ...input, ageYears: Number.NaN })).toThrow(/ageYears/);
  });
});

describe("provider boundary", () => {
  it("exposes the generator through the replaceable provider contract", () => {
    expect(defaultPortraitProvider.recipeFor(input)).toEqual(generatePortraitRecipe(input));
  });

  it("allows a test or licensed provider without changing consumers", () => {
    const placeholder: PortraitRecipe = {
      version: 99,
      seed: "fixed",
      head: "placeholder",
      skinPalette: "placeholder",
      eyes: "placeholder",
      brows: "placeholder",
      nose: "placeholder",
      mouth: "placeholder",
      shirt: "placeholder",
      shirtPalette: "placeholder",
      offsets: {},
    };
    const fakeProvider: PortraitProvider = { recipeFor: () => placeholder };

    expect(fakeProvider.recipeFor(input)).toBe(placeholder);
  });
});
