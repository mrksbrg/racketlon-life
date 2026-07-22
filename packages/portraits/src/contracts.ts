/**
 * Stable, renderer-neutral portrait contracts.
 *
 * Keep browser, canvas, Svelte, and concrete asset types out of this file. The
 * application and renderers should depend on these contracts, while the game
 * engine remains unaware that portraits exist.
 */

export interface PortraitOffset {
  x: number;
  y: number;
}

export interface PortraitRecipe {
  /** Version of both the recipe semantics and the generator that produced it. */
  version: number;
  /** Stable identity seed; never a mutable RNG state or an asset filename. */
  seed: string;
  head: string;
  skinPalette: string;
  hair?: string;
  hairPalette?: string;
  eyes: string;
  brows: string;
  nose: string;
  mouth: string;
  facialHair?: string;
  accessory?: string;
  ageMarks?: string[];
  shirt: string;
  shirtPalette: string;
  offsets: Record<string, PortraitOffset>;
}

/** Fields that content may tune without taking ownership of recipe identity. */
type RequiredPortraitRecipeOverrides = Partial<
  Pick<
    PortraitRecipe,
    | "head"
    | "skinPalette"
    | "hair"
    | "hairPalette"
    | "eyes"
    | "brows"
    | "nose"
    | "mouth"
    | "ageMarks"
    | "shirt"
    | "shirtPalette"
  >
>;

export type PortraitRecipeOverrides = RequiredPortraitRecipeOverrides & {
  /** null removes a feature that the deterministic generator supplied. */
  facialHair?: string | null;
  /** null means explicitly no glasses/accessory; undefined keeps the generated choice. */
  accessory?: string | null;
  offsets?: Record<string, PortraitOffset>;
};

export interface PortraitInput {
  /** Stable domain identity. It is metadata, not a dependency on Player. */
  playerId: string;
  /** Persisted seed or a value derived once from the stable player ID. */
  portraitSeed: string;
  ageYears?: number;
  gender?: "m" | "f";
  /**
   * ISO country code. May steer the shirt accent and soft probability weights
   * for skin tone, natural hair colour, and eye shape — never a hard
   * determination of any single facial feature. See "Regional appearance
   * weighting" in docs/08-portrait-system.md.
   */
  country?: string;
  /** Sparse, semantic cues for hand-tuned players. */
  publicCues?: PortraitRecipeOverrides;
}

/** A renderer is independently replaceable and owns its concrete output type. */
export interface PortraitRenderer<TRenderable> {
  render(recipe: PortraitRecipe): TRenderable;
}

/**
 * The only portrait service the application needs to know about.
 *
 * Providers may generate recipes, look up licensed portraits, or delegate to
 * a renderer. Tests can inject a provider that returns a fixed recipe.
 */
export interface PortraitProvider<TRenderable = unknown> {
  recipeFor(input: PortraitInput): PortraitRecipe;
  /** Returns undefined when this provider has no authored asset for the recipe. */
  assetUrlFor?(recipe: PortraitRecipe): string | undefined;
  render?(recipe: PortraitRecipe): TRenderable;
}
