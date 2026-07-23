import { defaultPortraitCues } from "@racketlon/content";
import {
  defaultPortraitProvider,
  portraitSeedFor,
  type PortraitProvider,
} from "@racketlon/portraits";

const authoredPortraitModules = import.meta.glob<string>(
  "../../../../packages/portraits/assets/generated/pilot-v1/*.png",
  { eager: true, import: "default", query: "?url" },
);

const playerIdBySlug = new Map<string, string>();
for (const playerId of Object.keys(defaultPortraitCues)) {
  const match = /^name:(.+):[^:]+$/.exec(playerId);
  if (match === null) continue;
  const slug = match[1]!;
  if (playerIdBySlug.has(slug)) {
    throw new Error(`Authored portrait slug is not unique: ${slug}`);
  }
  playerIdBySlug.set(slug, playerId);
}

/**
 * Authored portraits are keyed by the same stable seed used by recipes. This
 * keeps asset selection behind the provider boundary and lets every unlisted
 * player fall back to the deterministic renderer. A portrait is connected by
 * naming its PNG after the slug in its content cue ID:
 * `name:leon-griffiths:GBR` -> `leon-griffiths.png`.
 */
const authoredPortraitsBySeed: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    Object.entries(authoredPortraitModules).map(([path, assetUrl]) => {
      const slug = /\/([^/]+)\.png$/.exec(path)?.[1];
      if (slug === undefined) throw new Error(`Invalid authored portrait path: ${path}`);
      const playerId = playerIdBySlug.get(slug);
      if (playerId === undefined) {
        throw new Error(`Authored portrait has no matching content cue: ${slug}.png`);
      }
      return [portraitSeedFor(playerId), assetUrl];
    }),
  ),
);

const hybridPortraitProvider: PortraitProvider<string> = {
  recipeFor: (input) => defaultPortraitProvider.recipeFor(input),
  assetUrlFor: (recipe) => authoredPortraitsBySeed[recipe.seed],
  render: (recipe) => defaultPortraitProvider.render?.(recipe) ?? "",
};

export const appPortraitProvider = Object.freeze(hybridPortraitProvider);
