import type { PortraitRecipe, PortraitRenderer } from "../contracts.js";
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

function headPoints(shape: string): readonly Point[] {
  const shapes: Record<string, readonly Point[]> = {
    round: [[29, 29], [36, 22], [48, 20], [60, 22], [67, 29], [70, 48], [67, 66], [60, 77], [50, 83], [46, 83], [36, 77], [29, 66], [26, 48]],
    square: [[27, 28], [36, 21], [60, 21], [69, 28], [69, 63], [62, 76], [53, 82], [43, 82], [34, 76], [27, 63]],
    long: [[31, 26], [38, 20], [58, 20], [65, 26], [69, 56], [64, 73], [56, 84], [48, 87], [40, 84], [32, 73], [27, 56]],
    heart: [[27, 29], [35, 21], [48, 18], [61, 21], [69, 29], [67, 59], [61, 73], [48, 84], [35, 73], [29, 59]],
    diamond: [[31, 25], [41, 19], [55, 19], [65, 25], [72, 50], [65, 68], [55, 80], [48, 85], [41, 80], [31, 68], [24, 50]],
    broad: [[25, 28], [35, 20], [61, 20], [71, 28], [72, 55], [66, 70], [56, 80], [40, 80], [30, 70], [24, 55]],
    narrow: [[33, 25], [40, 20], [56, 20], [63, 25], [68, 54], [62, 72], [54, 82], [48, 86], [42, 82], [34, 72], [28, 54]],
    oval: [[30, 26], [38, 20], [58, 20], [66, 26], [69, 55], [64, 72], [55, 82], [41, 82], [32, 72], [27, 55]],
  };
  return shapes[shape] ?? shapes.oval!;
}

function hairBack(style: string | undefined, colors: HairColors): string {
  if (style === "long-straight" || style === "long-wavy") {
    const points: readonly Point[] = style === "long-wavy"
      ? [[23, 29], [29, 17], [43, 12], [59, 14], [70, 23], [75, 39], [71, 49], [75, 59], [70, 70], [73, 81], [62, 86], [57, 54], [37, 54], [33, 86], [21, 80], [25, 68], [20, 58], [25, 47], [21, 38]]
      : [[22, 29], [28, 17], [42, 12], [58, 14], [70, 22], [74, 39], [74, 82], [62, 86], [58, 52], [36, 52], [32, 86], [20, 80]];
    return polygon(points, colors.shadow, "#101216", 2) + rect(24, 40, 6, 35, colors.base) + rect(67, 42, 5, 34, colors.base);
  }
  if (style === "ponytail") return polygon([[63, 23], [76, 28], [81, 42], [77, 66], [70, 73], [65, 66], [70, 49], [67, 34]], colors.shadow, "#101216", 2) + rect(71, 35, 6, 22, colors.base);
  if (style === "bun") return polygon([[54, 13], [57, 7], [63, 4], [70, 7], [73, 13], [70, 20], [61, 22], [55, 18]], colors.shadow, "#101216", 2) + rect(60, 8, 8, 8, colors.base) + rect(62, 8, 4, 3, colors.light);
  return "";
}

function hairFront(style: string | undefined, colors: HairColors): string {
  if (style === "bald") return rect(27, 31, 3, 13, colors.shadow) + rect(67, 31, 3, 13, colors.shadow) + rect(31, 25, 4, 3, colors.light) + rect(62, 25, 4, 3, colors.light);
  if (style === "receding") return polygon([[27, 42], [25, 29], [31, 21], [40, 18], [43, 25], [48, 32], [53, 25], [56, 18], [66, 22], [71, 31], [69, 43], [64, 34], [58, 29], [53, 32], [48, 36], [42, 31], [36, 29], [31, 35]], colors.base, colors.shadow, 2) + pixelLine([29, 28], [37, 21], colors.light) + pixelLine([60, 21], [67, 29], colors.light);
  if (style === "buzz") return polygon([[27, 40], [25, 28], [31, 20], [41, 16], [56, 17], [66, 21], [71, 30], [69, 40], [64, 30], [55, 25], [40, 24], [32, 30]], colors.base, colors.shadow, 2) + rect(32, 22, 30, 2, colors.light) + rect(29, 27, 37, 2, colors.light);
  if (style === "curly-short") return polygon([[25, 42], [21, 33], [25, 25], [29, 22], [29, 17], [37, 16], [42, 12], [50, 15], [56, 12], [64, 17], [69, 18], [70, 24], [75, 29], [71, 41], [65, 34], [59, 32], [52, 34], [45, 31], [38, 34], [31, 32]], colors.base, colors.shadow, 2) + rect(29, 23, 7, 5, colors.light) + rect(42, 18, 7, 5, colors.light) + rect(56, 20, 7, 5, colors.light);
  if (style === "shaggy") return polygon([[24, 44], [21, 29], [28, 20], [39, 16], [47, 12], [59, 16], [68, 20], [73, 31], [71, 44], [64, 35], [61, 45], [54, 32], [48, 43], [41, 30], [34, 42], [30, 34]], colors.base, colors.shadow, 2) + pixelLine([29, 25], [44, 17], colors.light) + pixelLine([47, 17], [64, 22], colors.light);
  const swept = style === "swept";
  const long = style === "long-straight" || style === "long-wavy";
  const points: readonly Point[] = swept
    ? [[25, 43], [23, 29], [29, 21], [41, 15], [61, 14], [70, 21], [73, 34], [68, 39], [62, 32], [53, 25], [47, 25], [41, 32], [30, 40]]
    : long
      ? [[24, 45], [22, 29], [28, 20], [40, 15], [56, 14], [68, 20], [73, 32], [70, 45], [64, 35], [61, 24], [49, 21], [36, 27], [31, 45]]
      : [[25, 42], [23, 29], [29, 20], [40, 15], [57, 15], [68, 21], [72, 31], [70, 41], [65, 34], [62, 27], [55, 31], [48, 25], [41, 33], [34, 29], [29, 42]];
  return polygon(points, colors.base, colors.shadow, 2) + pixelLine([30, 25], [44, 18], colors.light) + pixelLine([45, 18], [62, 21], colors.light);
}

function brows(recipe: PortraitRecipe, colors: HairColors): string {
  const { x, y } = recipe.offsets.brows ?? { x: 0, y: 0 };
  if (recipe.brows === "focused") return pixelLine([31 + x, 40 + y], [42 + x, 44 + y], colors.base) + pixelLine([53 + x, 44 + y], [64 + x, 40 + y], colors.base);
  if (recipe.brows === "arched") return pixelLine([31 + x, 43 + y], [37 + x, 40 + y], colors.base) + pixelLine([37 + x, 40 + y], [43 + x, 42 + y], colors.base) + pixelLine([53 + x, 42 + y], [59 + x, 40 + y], colors.base) + pixelLine([59 + x, 40 + y], [65 + x, 43 + y], colors.base);
  const height = recipe.brows === "strong" ? 3 : 2;
  const top = recipe.brows === "raised" ? 39 : 41;
  return rect(31 + x, top + y, 13, height, colors.base) + rect(52 + x, top + y, 13, height, colors.base);
}

function eyes(recipe: PortraitRecipe, skin: SkinColors): string {
  const { x, y: offsetY } = recipe.offsets.eyes ?? { x: 0, y: 0 };
  const y = 48 + offsetY;
  const iris = recipe.eyes === "bright" ? "#477d91" : recipe.eyes === "soft" ? "#5c5144" : "#29241f";
  if (recipe.eyes === "narrow" || recipe.eyes === "focused") return rect(32 + x, y, 12, 2, skin.line) + rect(54 + x, y, 12, 2, skin.line) + rect(37 + x, y, 2, 2, iris) + rect(59 + x, y, 2, 2, iris);
  const height = recipe.eyes === "wide" ? 7 : 5;
  return rect(32 + x, y - 1, 12, height, skin.line) + rect(54 + x, y - 1, 12, height, skin.line)
    + rect(34 + x, y, 8, height - 2, "#eee7d8") + rect(56 + x, y, 8, height - 2, "#eee7d8")
    + rect(37 + x, y, 3, height - 2, iris) + rect(59 + x, y, 3, height - 2, iris)
    + rect(38 + x, y + 1, 1, 2, "#090a0b") + rect(60 + x, y + 1, 1, 2, "#090a0b");
}

function nose(recipe: PortraitRecipe, skin: SkinColors): string {
  const { x: ox, y: oy } = recipe.offsets.nose ?? { x: 0, y: 0 };
  const x = 47 + ox;
  const y = 53 + oy;
  const length = recipe.nose === "long" ? 12 : recipe.nose === "small" ? 7 : 9;
  const width = recipe.nose === "broad" || recipe.nose === "rounded" ? 9 : 6;
  return rect(x, y, 2, length, skin.shadow) + rect(x - 2, y + length - 2, width, 2, skin.shadow) + rect(x + 2, y + 2, 2, Math.max(2, length - 5), skin.highlight);
}

function mouth(recipe: PortraitRecipe, skin: SkinColors): string {
  const { x, y } = recipe.offsets.mouth ?? { x: 0, y: 0 };
  if (recipe.mouth === "smile" || recipe.mouth === "soft-smile") return pixelLine([40 + x, 69 + y], [46 + x, 72 + y], skin.line) + rect(46 + x, 72 + y, 5, 2, skin.line) + pixelLine([51 + x, 72 + y], [56 + x, 69 + y], skin.line) + rect(44 + x, 69 + y, 9, 2, "#f1ded0");
  if (recipe.mouth === "tense") return pixelLine([40 + x, 71 + y], [47 + x, 68 + y], skin.line) + pixelLine([47 + x, 68 + y], [56 + x, 71 + y], skin.line);
  if (recipe.mouth === "determined") return pixelLine([40 + x, 68 + y], [56 + x, 70 + y], skin.line);
  return rect(40 + x, 69 + y, 17, 2, skin.line);
}

function facialHair(style: string | undefined, hair: HairColors): string {
  if (style === undefined) return "";
  if (style === "moustache") return polygon([[38, 64], [44, 62], [48, 65], [52, 62], [58, 64], [54, 69], [48, 67], [42, 69]], hair.base, hair.shadow, 1);
  if (style === "goatee") return polygon([[39, 64], [45, 62], [48, 65], [52, 62], [57, 64], [53, 68], [51, 78], [48, 82], [44, 78], [45, 68]], hair.base, hair.shadow, 1);
  if (style === "chin-beard") return polygon([[41, 70], [48, 73], [55, 70], [53, 80], [48, 85], [43, 80]], hair.base, hair.shadow, 1);
  const full = style === "full-beard";
  const points: readonly Point[] = full
    ? [[32, 56], [38, 64], [38, 75], [48, 86], [58, 75], [58, 64], [64, 56], [62, 76], [53, 86], [43, 86], [34, 76]]
    : [[34, 59], [39, 67], [40, 75], [48, 81], [56, 75], [57, 67], [62, 59], [60, 75], [52, 83], [44, 83], [36, 75]];
  return polygon(points, hair.base, hair.shadow, full ? 2 : 1) + rect(42, 72, 3, 3, hair.light) + rect(53, 68, 2, 3, hair.light);
}

function accessories(style: string | undefined): string {
  const frame = "#25323a";
  if (style === "round-glasses" || style === "square-glasses") {
    const height = style === "round-glasses" ? 10 : 12;
    return rect(28, 42, 18, 2, frame) + rect(28, 44, 2, height, frame) + rect(44, 44, 2, height, frame) + rect(30, 42 + height, 14, 2, frame)
      + rect(50, 42, 18, 2, frame) + rect(50, 44, 2, height, frame) + rect(66, 44, 2, height, frame) + rect(52, 42 + height, 14, 2, frame) + rect(46, 47, 4, 2, frame);
  }
  if (style === "sport-glasses") return polygon([[27, 42], [39, 40], [48, 44], [57, 40], [70, 42], [66, 53], [56, 55], [48, 49], [39, 55], [30, 53]], "#253e4b", "#10171c", 2) + rect(32, 44, 12, 2, "#7192a0") + rect(54, 44, 12, 2, "#7192a0");
  if (style === "headband") return polygon([[27, 29], [38, 24], [58, 24], [69, 29], [68, 34], [58, 29], [38, 29], [28, 34]], "#edf0ed", "#3e4a51", 1);
  if (style === "earring") return rect(69, 57, 3, 3, "#f4cb55") + rect(70, 60, 2, 4, "#f4cb55");
  if (style === "nose-stud") return rect(52, 60, 2, 2, "#eef3f3");
  return "";
}

function ageDetails(marks: readonly string[] | undefined, skin: SkinColors): string {
  if (marks === undefined) return "";
  return marks.map((mark) => {
    if (mark === "freckles") return rect(33, 57, 2, 2, skin.shadow) + rect(38, 59, 1, 1, skin.shadow) + rect(58, 58, 1, 1, skin.shadow) + rect(62, 56, 2, 2, skin.shadow);
    if (mark === "mole") return rect(60, 62, 2, 2, skin.line);
    if (mark === "cheek-lines") return pixelLine([30, 62], [36, 65], skin.shadow, 1) + pixelLine([60, 65], [66, 62], skin.shadow, 1);
    if (mark === "forehead-lines") return rect(39, 33, 18, 1, skin.shadow) + rect(42, 36, 12, 1, skin.shadow);
    if (mark === "eye-lines") return pixelLine([29, 52], [25, 55], skin.shadow, 1) + pixelLine([67, 52], [71, 55], skin.shadow, 1);
    if (mark === "smile-lines") return pixelLine([37, 66], [34, 72], skin.shadow, 1) + pixelLine([59, 66], [62, 72], skin.shadow, 1);
    return "";
  }).join("");
}

function shirt(recipe: PortraitRecipe): string {
  const colors = shirtColorsFor(recipe.shirtPalette);
  let output = polygon([[17, 96], [20, 85], [31, 78], [40, 75], [48, 82], [56, 75], [65, 78], [76, 85], [79, 96]], colors.primary, "#15212a", 2);
  output += pixelLine([21, 87], [37, 78], colors.secondary, 3) + pixelLine([75, 87], [59, 78], colors.secondary, 3);
  output += pixelLine([22, 92], [37, 83], colors.tertiary, 2) + pixelLine([74, 92], [59, 83], colors.tertiary, 2);
  if (recipe.shirt === "polo" || recipe.shirt === "collared") output += polygon([[37, 76], [44, 85], [48, 79], [52, 85], [59, 76], [55, 75], [48, 81], [41, 75]], colors.secondary, "#15212a", 1);
  else if (recipe.shirt === "v-neck") output += pixelLine([39, 76], [48, 85], colors.secondary, 3) + pixelLine([48, 85], [57, 76], colors.secondary, 3);
  else output += rect(39, 76, 4, 4, colors.secondary) + rect(43, 80, 10, 3, colors.secondary) + rect(53, 76, 4, 4, colors.secondary);
  if (recipe.shirt === "zip" || recipe.shirt === "warmup") output += rect(47, 82, 3, 14, colors.tertiary);
  return output;
}

/** Render recipe v1 as hard-edged, integer-aligned 96x96 pixel art. */
export function renderPortraitPixelSvg(recipe: PortraitRecipe, options: PixelSvgPortraitOptions = {}): string {
  const skin = SKINS[recipe.skinPalette] ?? SKINS["skin-04"]!;
  const hair = HAIR[recipe.hairPalette ?? "black"] ?? HAIR["dark-brown"]!;
  const background = escapeXml(options.background ?? "#78909c");
  const title = options.label === undefined ? "" : `<title>${escapeXml(options.label)}</title>`;
  const accessibility = options.label === undefined ? `aria-hidden="true"` : `role="img" aria-label="${escapeXml(options.label)}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96" shape-rendering="crispEdges" ${accessibility}>${title}`
    + rect(0, 0, 96, 96, background) + rect(0, 82, 96, 14, "#607985") + rect(0, 82, 96, 3, "#6d8792")
    + shirt(recipe) + hairBack(recipe.hair, hair)
    + polygon([[40, 69], [56, 69], [57, 82], [52, 86], [44, 86], [39, 82]], skin.base, skin.line, 2)
    + polygon([[38, 72], [44, 82], [52, 84], [44, 87], [39, 82]], skin.shadow)
    + polygon([[24, 45], [20, 48], [20, 59], [24, 65], [29, 62], [29, 48]], skin.base, skin.line, 2)
    + polygon([[72, 45], [76, 48], [76, 59], [72, 65], [67, 62], [67, 48]], skin.base, skin.line, 2)
    + rect(22, 51, 3, 7, skin.shadow) + rect(71, 51, 3, 7, skin.shadow)
    + polygon(headPoints(recipe.head), skin.base, skin.line, 2)
    + polygon([[27, 48], [31, 67], [40, 78], [47, 83], [40, 79], [33, 72], [28, 62]], skin.shadow)
    + rect(59, 55, 4, 10, skin.highlight) + rect(56, 64, 4, 4, skin.highlight)
    + hairFront(recipe.hair, hair) + brows(recipe, hair) + eyes(recipe, skin) + nose(recipe, skin) + mouth(recipe, skin)
    + ageDetails(recipe.ageMarks, skin) + facialHair(recipe.facialHair, hair) + accessories(recipe.accessory) + `</svg>`;
}

export const pixelSvgPortraitRenderer: PortraitRenderer<string> = Object.freeze({
  render: renderPortraitPixelSvg,
});
