import type { PortraitProvider } from "./contracts.js";
import { generatePortraitRecipe } from "./generate.js";
import { renderPortraitPixelSvg } from "./renderers/pixel-svg.js";

/** Default registration for applications that do not inject another provider. */
export const defaultPortraitProvider: PortraitProvider<string> = Object.freeze({
  recipeFor: generatePortraitRecipe,
  render: renderPortraitPixelSvg,
});
