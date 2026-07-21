import type { PortraitRecipe, PortraitRenderer } from "../contracts.js";
import type { PixelInk, PixelLayer } from "../art-kits/contracts.js";
import {
  accessoryLayerFor,
  ageDetailLayerFor,
  anatomySpriteForPortrait,
  browLayerFor,
  eyeLayerFor,
  facialHairLayerFor,
  hairSpriteFor,
  headSpriteFor,
  mouthLayerFor,
  noseLayerFor,
  shirtLayerFor,
} from "../art-kits/v1.js";
import { shirtColorsFor } from "./svg.js";

export interface PixelSvgPortraitOptions {
  label?: string;
  background?: string;
}

interface SkinColors { base: string; shadow: string; highlight: string; line: string }
interface HairColors { base: string; light: string; shadow: string }
type Point = readonly [number, number];

const SKINS: Record<string, SkinColors> = {
  "skin-01": { base: "#f3c69e", shadow: "#c77a50", highlight: "#ffd9b9", line: "#4a2b22" },
  "skin-02": { base: "#eab17d", shadow: "#b96540", highlight: "#f8c99e", line: "#49271f" },
  "skin-03": { base: "#d79765", shadow: "#9e5336", highlight: "#ebb280", line: "#43241d" },
  "skin-04": { base: "#bd7c50", shadow: "#81432e", highlight: "#d99a68", line: "#382019" },
  "skin-05": { base: "#9f603e", shadow: "#663623", highlight: "#bc7b54", line: "#2f1b16" },
  "skin-06": { base: "#7d4932", shadow: "#4d2b20", highlight: "#9c6547", line: "#271713" },
  "skin-07": { base: "#603a2b", shadow: "#39251c", highlight: "#7d513c", line: "#1e1411" },
  "skin-08": { base: "#472c23", shadow: "#281b17", highlight: "#654337", line: "#18110f" },
};

const HAIR: Record<string, HairColors> = {
  black: { base: "#17191d", light: "#34383e", shadow: "#080a0d" },
  "dark-brown": { base: "#30221b", light: "#5a4031", shadow: "#150f0c" },
  brown: { base: "#563820", light: "#835b35", shadow: "#291b11" },
  "light-brown": { base: "#7d512c", light: "#b07a45", shadow: "#452d1b" },
  blonde: { base: "#bd8438", light: "#e4b45d", shadow: "#725026" },
  auburn: { base: "#843a1e", light: "#bd6030", shadow: "#451f14" },
  "salt-and-pepper": { base: "#625f5b", light: "#aaa59e", shadow: "#302f2e" },
  grey: { base: "#85837f", light: "#cbc6bc", shadow: "#464644" },
};

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
}

function rect(x: number, y: number, width: number, height: number, fill: string): string {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>`;
}

function polygon(points: readonly Point[], fill: string, stroke?: string, strokeWidth = 0): string {
  const border = stroke === undefined ? "" : ` stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="miter"`;
  return `<polygon points="${points.map(([x, y]) => `${x},${y}`).join(" ")}" fill="${fill}"${border}/>`;
}

/** Bresenham line made from square pixels, not an antialiased SVG stroke. */
function pixelLine(from: Point, to: Point, color: string, size = 2): string {
  let [x0, y0] = from;
  const [x1, y1] = to;
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  let output = "";
  while (true) {
    output += rect(x0, y0, size, size, color);
    if (x0 === x1 && y0 === y1) break;
    const doubled = 2 * error;
    if (doubled >= dy) { error += dy; x0 += sx; }
    if (doubled <= dx) { error += dx; y0 += sy; }
  }
  return output;
}

function artInkColors(recipe: PortraitRecipe, skin: SkinColors, hair: HairColors): Readonly<Record<PixelInk, string>> {
  const iris = recipe.eyes === "bright" ? "#477d91" : recipe.eyes === "soft" ? "#665848" : "#342d25";
  const shirt = shirtColorsFor(recipe.shirtPalette);
  return {
    "skin-line": skin.line,
    "skin-base": skin.base,
    "skin-shadow": skin.shadow,
    "skin-highlight": skin.highlight,
    "eye-white": "#f1eadf",
    iris,
    pupil: "#08090a",
    catchlight: "#d8eef0",
    "mouth-light": "#f4e4d8",
    "hair-line": "#101216",
    "hair-shadow": hair.shadow,
    "hair-base": hair.base,
    "hair-highlight": hair.light,
    "accessory-dark": "#25323a",
    "accessory-mid": "#253e4b",
    "accessory-light": "#edf0ed",
    "accessory-highlight": "#7192a0",
    "metal-gold": "#f4cb55",
    "metal-light": "#eef3f3",
    "body-line": "#15212a",
    "shirt-primary": shirt.primary,
    "shirt-secondary": shirt.secondary,
    "shirt-tertiary": shirt.tertiary,
  };
}

function renderAuthoredLayer(
  layer: PixelLayer,
  colors: Readonly<Record<PixelInk, string>>,
  offset: { x: number; y: number } = { x: 0, y: 0 },
): string {
  return layer.primitives.map((primitive) => {
    if (primitive.kind === "rect") {
      return rect(
        primitive.x + offset.x,
        primitive.y + offset.y,
        primitive.width,
        primitive.height,
        colors[primitive.ink],
      );
    }
    if (primitive.kind === "polygon") {
      return polygon(
        primitive.points.map(([x, y]) => [x + offset.x, y + offset.y] as const),
        colors[primitive.ink],
        primitive.outlineInk === undefined ? undefined : colors[primitive.outlineInk],
        primitive.outlineWidth,
      );
    }
    return pixelLine(
      [primitive.from[0] + offset.x, primitive.from[1] + offset.y],
      [primitive.to[0] + offset.x, primitive.to[1] + offset.y],
      colors[primitive.ink],
      primitive.size,
    );
  }).join("");
}

function headPoints(shape: string): readonly Point[] {
  return headSpriteFor(shape).silhouette;
}

function eyes(recipe: PortraitRecipe, skin: SkinColors, hair: HairColors): string {
  return renderAuthoredLayer(
    eyeLayerFor(recipe.eyes),
    artInkColors(recipe, skin, hair),
    recipe.offsets.eyes ?? { x: 0, y: 0 },
  );
}

function nose(recipe: PortraitRecipe, skin: SkinColors, hair: HairColors): string {
  return renderAuthoredLayer(
    noseLayerFor(recipe.nose),
    artInkColors(recipe, skin, hair),
    recipe.offsets.nose ?? { x: 0, y: 0 },
  );
}

function mouth(recipe: PortraitRecipe, skin: SkinColors, hair: HairColors): string {
  return renderAuthoredLayer(
    mouthLayerFor(recipe.mouth),
    artInkColors(recipe, skin, hair),
    recipe.offsets.mouth ?? { x: 0, y: 0 },
  );
}

/** Render recipe v1 as hard-edged, integer-aligned 96x96 pixel art. */
export function renderPortraitPixelSvg(recipe: PortraitRecipe, options: PixelSvgPortraitOptions = {}): string {
  const skin = SKINS[recipe.skinPalette] ?? SKINS["skin-04"]!;
  const hair = HAIR[recipe.hairPalette ?? "black"] ?? HAIR["dark-brown"]!;
  const background = escapeXml(options.background ?? "#78909c");
  const title = options.label === undefined ? "" : `<title>${escapeXml(options.label)}</title>`;
  const accessibility = options.label === undefined ? `aria-hidden="true"` : `role="img" aria-label="${escapeXml(options.label)}"`;
  const authoredHead = headSpriteFor(recipe.head);
  const authoredHair = hairSpriteFor(recipe.hair);
  const authoredAnatomy = anatomySpriteForPortrait();
  const inks = artInkColors(recipe, skin, hair);
  const hairOffset = recipe.offsets.hair ?? { x: 0, y: 0 };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96" shape-rendering="crispEdges" ${accessibility}>${title}`
    + rect(0, 0, 96, 96, background) + rect(0, 82, 96, 14, "#607985") + rect(0, 82, 96, 3, "#6d8792")
    + renderAuthoredLayer(shirtLayerFor(recipe.shirt), inks)
    + renderAuthoredLayer(authoredHair.back, inks, hairOffset)
    + renderAuthoredLayer(authoredAnatomy.neck, inks)
    + renderAuthoredLayer(authoredAnatomy.ears, inks)
    + polygon(headPoints(recipe.head), skin.base, skin.line, 2)
    + renderAuthoredLayer(authoredHead.lighting, inks)
    + renderAuthoredLayer(authoredHair.front, inks, hairOffset)
    + renderAuthoredLayer(facialHairLayerFor(recipe.facialHair), inks)
    + renderAuthoredLayer(browLayerFor(recipe.brows), inks, recipe.offsets.brows ?? { x: 0, y: 0 })
    + eyes(recipe, skin, hair) + nose(recipe, skin, hair) + mouth(recipe, skin, hair)
    + (recipe.ageMarks ?? []).map((mark) => renderAuthoredLayer(ageDetailLayerFor(mark), inks)).join("")
    + renderAuthoredLayer(accessoryLayerFor(recipe.accessory), inks) + `</svg>`;
}

export const pixelSvgPortraitRenderer: PortraitRenderer<string> = Object.freeze({
  render: renderPortraitPixelSvg,
});
