import type { PortraitRecipe, PortraitRenderer } from "../contracts.js";

export interface SvgPortraitOptions {
  label?: string;
  background?: string;
}

export interface ShirtColors {
  primary: string;
  secondary: string;
  tertiary: string;
}

interface SkinColors {
  base: string;
  shadow: string;
  highlight: string;
  line: string;
}

const SKINS: Record<string, SkinColors> = {
  "skin-01": { base: "#f6cda9", shadow: "#d89062", highlight: "#ffe1c5", line: "#563226" },
  "skin-02": { base: "#efb783", shadow: "#c8794c", highlight: "#ffd2a8", line: "#543024" },
  "skin-03": { base: "#dda06f", shadow: "#ad623d", highlight: "#f6bd8c", line: "#4d2b21" },
  "skin-04": { base: "#c88756", shadow: "#925132", highlight: "#e3a573", line: "#42251d" },
  "skin-05": { base: "#aa6843", shadow: "#733e2b", highlight: "#c9865b", line: "#352019" },
  "skin-06": { base: "#875036", shadow: "#542f24", highlight: "#a96d4b", line: "#2d1a16" },
  "skin-07": { base: "#69402f", shadow: "#3e281f", highlight: "#875842", line: "#231713" },
  "skin-08": { base: "#4d3026", shadow: "#2c1e19", highlight: "#6a4637", line: "#1d1412" },
};

const HAIR: Record<string, { base: string; light: string; shadow: string }> = {
  black: { base: "#17191d", light: "#33363b", shadow: "#090b0d" },
  "dark-brown": { base: "#30231d", light: "#594033", shadow: "#17100d" },
  brown: { base: "#563924", light: "#80573a", shadow: "#2b1d14" },
  "light-brown": { base: "#80542f", light: "#ac7645", shadow: "#49301e" },
  blonde: { base: "#bd853a", light: "#e1ad5a", shadow: "#765026" },
  auburn: { base: "#873d21", light: "#b65b2e", shadow: "#4c2116" },
  "salt-and-pepper": { base: "#66625d", light: "#aaa49b", shadow: "#343332" },
  grey: { base: "#85837f", light: "#c5c1b9", shadow: "#484846" },
};

const COUNTRY_SHIRTS: Record<string, ShirtColors> = {
  SE: { primary: "#006aa7", secondary: "#fecc02", tertiary: "#d9efff" },
  DE: { primary: "#202124", secondary: "#dd0000", tertiary: "#ffce00" },
  JP: { primary: "#f5f5f1", secondary: "#bc002d", tertiary: "#d9d9d2" },
  IN: { primary: "#173f73", secondary: "#ff9933", tertiary: "#138808" },
  FR: { primary: "#164194", secondary: "#f5f5f1", tertiary: "#ed2939" },
  CN: { primary: "#de2910", secondary: "#ffde00", tertiary: "#f08a28" },
  GB: { primary: "#214db5", secondary: "#f5f5f1", tertiary: "#cf142b" },
  GBR: { primary: "#214db5", secondary: "#f5f5f1", tertiary: "#cf142b" },
  ENG: { primary: "#f5f5f1", secondary: "#cf142b", tertiary: "#c5c8cc" },
  CZ: { primary: "#f5f5f1", secondary: "#11457e", tertiary: "#d7141a" },
  DK: { primary: "#c60c30", secondary: "#ffffff", tertiary: "#7b0b21" },
  NO: { primary: "#ba0c2f", secondary: "#ffffff", tertiary: "#00205b" },
  FI: { primary: "#f5f5f1", secondary: "#003580", tertiary: "#c8d4e5" },
  NL: { primary: "#f36c21", secondary: "#21468b", tertiary: "#ffffff" },
  BE: { primary: "#202124", secondary: "#fdda24", tertiary: "#ef3340" },
  AT: { primary: "#ed2939", secondary: "#ffffff", tertiary: "#a81423" },
  CH: { primary: "#d52b1e", secondary: "#ffffff", tertiary: "#9f2018" },
  PL: { primary: "#f5f5f1", secondary: "#dc143c", tertiary: "#d3d3d0" },
  IT: { primary: "#177245", secondary: "#f5f5f1", tertiary: "#ce2b37" },
  ES: { primary: "#aa151b", secondary: "#f1bf00", tertiary: "#7d1015" },
  US: { primary: "#1f3c88", secondary: "#ffffff", tertiary: "#b22234" },
  CA: { primary: "#ffffff", secondary: "#d80621", tertiary: "#c8c8c4" },
  AU: { primary: "#0a2f66", secondary: "#f7d116", tertiary: "#ffffff" },
};

const FALLBACK_SHIRTS: readonly ShirtColors[] = [
  { primary: "#173f5f", secondary: "#f6c85f", tertiary: "#e6eef4" },
  { primary: "#234f3d", secondary: "#ef8354", tertiary: "#f1f1e6" },
  { primary: "#4c3575", secondary: "#f7b32b", tertiary: "#d8d5ed" },
  { primary: "#7a263a", secondary: "#f0d27a", tertiary: "#f4eee3" },
];

function hash(value: string): number {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return result >>> 0;
}

export function shirtColorsFor(palette: string): ShirtColors {
  if (palette === "neutral") return { primary: "#263746", secondary: "#768795", tertiary: "#d9e2e8" };
  const country = palette.startsWith("country-") ? palette.slice("country-".length).toUpperCase() : "";
  const national = COUNTRY_SHIRTS[country];
  if (national !== undefined) return national;
  return FALLBACK_SHIRTS[hash(palette) % FALLBACK_SHIRTS.length]!;
}

function skinFor(id: string): SkinColors {
  return SKINS[id] ?? SKINS["skin-04"]!;
}

function hairFor(id: string | undefined): { base: string; light: string; shadow: string } {
  if (id === undefined) return HAIR.black!;
  return HAIR[id] ?? HAIR["dark-brown"]!;
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
}

function headPath(shape: string): string {
  switch (shape) {
    case "round": return "M27 29 Q48 15 69 29 L70 56 Q68 76 48 81 Q28 76 26 56 Z";
    case "square": return "M27 27 Q48 17 69 27 L69 62 L61 77 L48 82 L35 77 L27 62 Z";
    case "long": return "M30 25 Q48 16 66 25 L69 58 Q65 80 48 85 Q31 80 27 58 Z";
    case "heart": return "M26 29 Q48 14 70 29 L67 62 Q60 79 48 84 Q36 79 29 62 Z";
    case "diamond": return "M29 25 Q48 15 67 25 L72 53 L61 76 L48 84 L35 76 L24 53 Z";
    case "broad": return "M24 29 Q48 15 72 29 L70 62 Q63 80 48 83 Q33 80 26 62 Z";
    case "narrow": return "M31 25 Q48 16 65 25 L68 57 Q62 78 48 84 Q34 78 28 57 Z";
    default: return "M29 26 Q48 15 67 26 L69 58 Q65 78 48 83 Q31 78 27 58 Z";
  }
}

function hairBack(style: string | undefined, colors: ReturnType<typeof hairFor>): string {
  if (style === "long-straight" || style === "long-wavy") {
    return `<path d="M23 32 Q25 13 48 12 Q72 14 73 34 L75 77 L63 82 L58 60 L37 60 L32 82 L20 76 Z" fill="${colors.shadow}" stroke="#121416" stroke-width="2"/>`;
  }
  if (style === "ponytail") {
    return `<path d="M67 25 Q82 31 76 63 Q72 73 65 65 Q72 48 66 37 Z" fill="${colors.base}" stroke="${colors.shadow}" stroke-width="2"/>`;
  }
  if (style === "bun") {
    return `<circle cx="63" cy="15" r="11" fill="${colors.shadow}" stroke="#121416" stroke-width="2"/><circle cx="62" cy="14" r="7" fill="${colors.base}"/>`;
  }
  return "";
}

function hairFront(style: string | undefined, colors: ReturnType<typeof hairFor>): string {
  const { base, light, shadow } = colors;
  switch (style) {
    case "bald":
      return `<path d="M26 38 Q25 28 31 24 M70 38 Q71 28 65 24" fill="none" stroke="${shadow}" stroke-width="3"/>`;
    case "receding":
      return `<path d="M27 41 Q23 24 36 20 L43 24 L48 31 L53 24 L61 20 Q73 25 69 41 L64 32 Q58 27 54 31 L48 35 L42 31 Q36 27 31 33 Z" fill="${base}" stroke="${shadow}" stroke-width="2"/><path d="M31 28 L37 23 M59 23 L65 29" stroke="${light}" stroke-width="2"/>`;
    case "buzz":
      return `<path d="M27 39 Q24 18 48 16 Q72 18 69 39 L64 29 Q48 21 32 29 Z" fill="${base}" stroke="${shadow}" stroke-width="2"/><path d="M31 25 L64 25 M29 30 L67 30" stroke="${light}" stroke-width="1" opacity=".55"/>`;
    case "side-part":
      return `<path d="M25 40 Q22 19 47 14 Q72 15 71 39 L65 32 L63 24 Q48 20 34 30 L30 41 Z" fill="${base}" stroke="${shadow}" stroke-width="2"/><path d="M44 18 Q55 20 65 27 M40 21 Q33 24 29 34" fill="none" stroke="${light}" stroke-width="2"/>`;
    case "swept":
      return `<path d="M25 42 Q21 22 42 15 Q68 10 72 37 L66 34 Q57 26 51 24 Q43 33 29 39 Z" fill="${base}" stroke="${shadow}" stroke-width="2"/><path d="M30 31 Q44 17 65 20 M33 36 Q45 25 58 24" fill="none" stroke="${light}" stroke-width="2"/>`;
    case "curly-short":
      return `<path d="M25 39 Q20 27 29 22 Q29 14 40 17 Q46 10 54 16 Q65 12 67 22 Q76 27 69 41 L64 33 L31 34 Z" fill="${base}" stroke="${shadow}" stroke-width="2"/><path d="M28 27 Q34 20 39 27 Q45 18 51 26 Q58 18 66 28" fill="none" stroke="${light}" stroke-width="3"/>`;
    case "shaggy":
      return `<path d="M24 43 Q20 23 35 17 Q47 9 61 17 Q75 20 72 43 L65 36 L61 43 L55 31 L48 41 L41 29 L34 40 L30 34 Z" fill="${base}" stroke="${shadow}" stroke-width="2"/><path d="M30 24 Q45 15 63 22" fill="none" stroke="${light}" stroke-width="2"/>`;
    case "long-straight":
      return `<path d="M24 44 Q20 20 46 14 Q72 14 72 44 L64 37 L61 25 Q49 19 35 29 L31 45 Z" fill="${base}" stroke="${shadow}" stroke-width="2"/><path d="M34 24 Q48 16 64 23" fill="none" stroke="${light}" stroke-width="2"/>`;
    case "long-wavy":
      return `<path d="M23 45 Q19 22 42 14 Q68 10 73 40 L67 47 L61 35 Q54 25 47 23 Q41 33 29 41 Z" fill="${base}" stroke="${shadow}" stroke-width="2"/><path d="M29 29 Q39 18 50 23 Q59 16 68 28" fill="none" stroke="${light}" stroke-width="2"/>`;
    case "ponytail":
    case "bun":
      return `<path d="M25 41 Q21 19 47 14 Q71 16 71 40 L64 34 L61 24 Q49 19 35 28 L30 42 Z" fill="${base}" stroke="${shadow}" stroke-width="2"/><path d="M34 23 Q48 16 62 23" fill="none" stroke="${light}" stroke-width="2"/>`;
    default:
      return `<path d="M25 40 Q22 20 46 15 Q71 15 71 39 L65 35 L62 27 L54 30 L47 25 L39 32 L31 29 L29 41 Z" fill="${base}" stroke="${shadow}" stroke-width="2"/><path d="M31 25 Q45 15 64 23" fill="none" stroke="${light}" stroke-width="2"/>`;
  }
}

function eyes(recipe: PortraitRecipe, skin: SkinColors): string {
  const offset = recipe.offsets.eyes ?? { x: 0, y: 0 };
  const eyeHeight = recipe.eyes === "narrow" || recipe.eyes === "focused" ? 2 : recipe.eyes === "wide" ? 5 : 4;
  const iris = recipe.eyes === "bright" ? "#4e7381" : "#24231f";
  return `<g transform="translate(${offset.x} ${offset.y})"><path d="M32 48 Q37 ${47 - eyeHeight / 2} 42 48 Q37 ${49 + eyeHeight / 2} 32 48 M54 48 Q59 ${47 - eyeHeight / 2} 64 48 Q59 ${49 + eyeHeight / 2} 54 48" fill="#f3eee3" stroke="${skin.line}" stroke-width="1.5"/><rect x="36" y="46" width="3" height="4" fill="${iris}"/><rect x="58" y="46" width="3" height="4" fill="${iris}"/><rect x="37" y="47" width="1" height="2" fill="#08090a"/><rect x="59" y="47" width="1" height="2" fill="#08090a"/></g>`;
}

function brows(recipe: PortraitRecipe, hair: ReturnType<typeof hairFor>): string {
  const offset = recipe.offsets.brows ?? { x: 0, y: 0 };
  const paths: Record<string, string> = {
    arched: "M31 42 Q37 37 43 41 M53 41 Q59 37 65 42",
    raised: "M31 39 Q37 37 43 39 M53 39 Q59 37 65 39",
    focused: "M31 40 L43 43 M53 43 L65 40",
    soft: "M31 42 Q37 40 43 42 M53 42 Q59 40 65 42",
    strong: "M30 41 L43 40 M53 40 L66 41",
    straight: "M31 41 L43 41 M53 41 L65 41",
  };
  return `<path d="${paths[recipe.brows] ?? paths.straight}" transform="translate(${offset.x} ${offset.y})" fill="none" stroke="${hair.base}" stroke-width="2.5" stroke-linecap="square"/>`;
}

function nose(recipe: PortraitRecipe, skin: SkinColors): string {
  const offset = recipe.offsets.nose ?? { x: 0, y: 0 };
  const paths: Record<string, string> = {
    small: "M48 49 L46 60 L50 61",
    straight: "M48 49 L48 61 L52 62",
    broad: "M47 49 L44 61 Q48 64 53 61",
    long: "M48 48 L46 63 L52 64",
    rounded: "M48 49 L45 60 Q48 65 53 61",
    angular: "M48 49 L44 59 L48 62 L53 60",
  };
  return `<path d="${paths[recipe.nose] ?? paths.straight}" transform="translate(${offset.x} ${offset.y})" fill="none" stroke="${skin.shadow}" stroke-width="2" stroke-linecap="square"/>`;
}

function mouth(recipe: PortraitRecipe, skin: SkinColors): string {
  const offset = recipe.offsets.mouth ?? { x: 0, y: 0 };
  const paths: Record<string, string> = {
    smile: "M39 68 Q48 75 57 68",
    "soft-smile": "M40 69 Q48 72 56 69",
    focused: "M40 69 L56 69",
    tense: "M40 70 Q48 67 56 70",
    determined: "M40 68 L56 69",
    neutral: "M41 69 Q48 70 55 69",
  };
  return `<path d="${paths[recipe.mouth] ?? paths.neutral}" transform="translate(${offset.x} ${offset.y})" fill="none" stroke="${skin.line}" stroke-width="2" stroke-linecap="square"/>`;
}

function facialHair(style: string | undefined, hair: ReturnType<typeof hairFor>): string {
  if (style === undefined) return "";
  const common = `fill="${hair.base}" stroke="${hair.shadow}" stroke-width="1" opacity=".94"`;
  switch (style) {
    case "stubble": return `<path d="M35 62 Q48 67 61 62 L58 75 Q48 82 38 75 Z" fill="${hair.shadow}" opacity=".32"/>`;
    case "moustache": return `<path d="M39 64 Q45 61 48 65 Q51 61 57 64 Q54 69 48 67 Q42 69 39 64 Z" ${common}/>`;
    case "goatee": return `<path d="M40 64 Q48 61 56 64 Q53 69 50 68 L53 77 L48 80 L43 77 L46 68 Q43 69 40 64 Z" ${common}/>`;
    case "short-beard": return `<path d="M34 59 L38 74 Q48 82 58 74 L62 59 L58 67 L55 76 L48 80 L41 76 L38 67 Z" ${common}/>`;
    case "full-beard": return `<path d="M32 56 L36 75 L48 85 L60 75 L64 56 L58 65 L57 77 L48 82 L39 77 L38 65 Z" ${common}/>`;
    case "chin-beard": return `<path d="M42 70 Q48 73 54 70 L52 80 L48 84 L44 80 Z" ${common}/>`;
    default: return `<rect x="46" y="70" width="4" height="8" ${common}/>`;
  }
}

function accessories(style: string | undefined): string {
  switch (style) {
    case "round-glasses": return `<g fill="none" stroke="#27333b" stroke-width="2"><circle cx="37" cy="48" r="8"/><circle cx="59" cy="48" r="8"/><path d="M45 48 L51 48 M29 47 L25 45 M67 47 L71 45"/></g>`;
    case "square-glasses": return `<g fill="none" stroke="#27333b" stroke-width="2"><rect x="29" y="42" width="16" height="12"/><rect x="51" y="42" width="16" height="12"/><path d="M45 47 L51 47 M29 45 L25 44 M67 45 L71 44"/></g>`;
    case "sport-glasses": return `<path d="M27 43 Q37 39 47 45 Q57 39 69 43 L65 52 Q57 55 48 48 Q38 55 30 52 Z" fill="#263b49" opacity=".85" stroke="#101820" stroke-width="2"/>`;
    case "headband": return `<path d="M27 31 Q48 21 69 31" fill="none" stroke="#e4e8ea" stroke-width="4"/>`;
    case "earring": return `<circle cx="70" cy="58" r="2" fill="#f6c85f" stroke="#6d5524" stroke-width="1"/>`;
    case "nose-stud": return `<rect x="52" y="59" width="2" height="2" fill="#e6e8e8"/>`;
    default: return "";
  }
}

function ageDetails(marks: readonly string[] | undefined, skin: SkinColors): string {
  if (marks === undefined) return "";
  return marks.map((mark) => {
    switch (mark) {
      case "freckles": return `<g fill="${skin.shadow}" opacity=".65"><rect x="34" y="55" width="1" height="1"/><rect x="38" y="57" width="1" height="1"/><rect x="58" y="56" width="1" height="1"/><rect x="62" y="54" width="1" height="1"/></g>`;
      case "mole": return `<rect x="60" y="61" width="2" height="2" fill="${skin.line}"/>`;
      case "cheek-lines": return `<path d="M31 61 L36 63 M60 63 L65 61" stroke="${skin.shadow}" stroke-width="1" opacity=".65"/>`;
      case "forehead-lines": return `<path d="M39 34 Q48 32 57 34 M41 37 Q48 35 55 37" fill="none" stroke="${skin.shadow}" stroke-width="1" opacity=".65"/>`;
      case "eye-lines": return `<path d="M29 51 L25 53 M67 51 L71 53" stroke="${skin.shadow}" stroke-width="1" opacity=".7"/>`;
      case "smile-lines": return `<path d="M37 65 L34 71 M59 65 L62 71" stroke="${skin.shadow}" stroke-width="1" opacity=".65"/>`;
      default: return "";
    }
  }).join("");
}

function shirt(recipe: PortraitRecipe, colors: ShirtColors): string {
  const neckline = recipe.shirt === "v-neck" ? "M40 75 L48 84 L56 75" : "M39 76 Q48 83 57 76";
  const collar = recipe.shirt === "polo" || recipe.shirt === "collared"
    ? `<path d="M38 75 L45 84 L48 78 L51 84 L58 75" fill="${colors.secondary}" stroke="#16222b" stroke-width="1.5"/>`
    : `<path d="${neckline}" fill="none" stroke="${colors.secondary}" stroke-width="4"/>`;
  const center = recipe.shirt === "zip" || recipe.shirt === "warmup"
    ? `<path d="M48 81 L48 96" stroke="${colors.tertiary}" stroke-width="2"/>`
    : "";
  return `<path d="M18 96 L21 84 Q30 76 39 75 L48 82 L57 75 Q67 76 75 84 L78 96 Z" fill="${colors.primary}" stroke="#16222b" stroke-width="2"/><path d="M21 87 L35 78 M75 87 L61 78" stroke="${colors.secondary}" stroke-width="3"/><path d="M23 91 L36 82 M73 91 L60 82" stroke="${colors.tertiary}" stroke-width="1.5"/>${collar}${center}`;
}

/** Render a recipe to a dependency-free, scalable 96×96 SVG portrait. */
export function renderPortraitSvg(recipe: PortraitRecipe, options: SvgPortraitOptions = {}): string {
  const skin = skinFor(recipe.skinPalette);
  const hair = hairFor(recipe.hairPalette);
  const shirtColors = shirtColorsFor(recipe.shirtPalette);
  const background = escapeXml(options.background ?? "#78909c");
  const title = options.label === undefined ? "" : `<title>${escapeXml(options.label)}</title>`;
  const accessibility = options.label === undefined
    ? `aria-hidden="true"`
    : `role="img" aria-label="${escapeXml(options.label)}"`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96" shape-rendering="crispEdges" ${accessibility}>${title}<rect width="96" height="96" fill="${background}"/><path d="M0 82 L96 82 L96 96 L0 96 Z" fill="#607985" opacity=".45"/>${shirt(recipe, shirtColors)}${hairBack(recipe.hair, hair)}<path d="M41 70 L55 70 L57 82 Q48 88 39 82 Z" fill="${skin.base}" stroke="${skin.line}" stroke-width="2"/><ellipse cx="26" cy="53" rx="6" ry="10" fill="${skin.base}" stroke="${skin.line}" stroke-width="2"/><ellipse cx="70" cy="53" rx="6" ry="10" fill="${skin.base}" stroke="${skin.line}" stroke-width="2"/><path d="M25 52 L29 56 M71 52 L67 56" stroke="${skin.shadow}" stroke-width="2"/><path d="${headPath(recipe.head)}" fill="${skin.base}" stroke="${skin.line}" stroke-width="2"/><path d="M29 56 Q31 73 46 80 Q34 78 28 65 Z" fill="${skin.shadow}" opacity=".28"/><path d="M33 32 Q48 23 63 32" fill="none" stroke="${skin.highlight}" stroke-width="2" opacity=".45"/>${hairFront(recipe.hair, hair)}${brows(recipe, hair)}${eyes(recipe, skin)}${nose(recipe, skin)}${mouth(recipe, skin)}${ageDetails(recipe.ageMarks, skin)}${facialHair(recipe.facialHair, hair)}${accessories(recipe.accessory)}</svg>`;
}

export const svgPortraitRenderer: PortraitRenderer<string> = Object.freeze({
  render: renderPortraitSvg,
});
