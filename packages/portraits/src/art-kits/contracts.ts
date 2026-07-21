export type PixelPoint = readonly [number, number];

export const PIXEL_INKS = [
  "skin-line",
  "skin-base",
  "skin-shadow",
  "skin-highlight",
  "eye-white",
  "iris",
  "pupil",
  "catchlight",
  "mouth-light",
  "hair-line",
  "hair-shadow",
  "hair-base",
  "hair-highlight",
  "accessory-dark",
  "accessory-mid",
  "accessory-light",
  "accessory-highlight",
  "metal-gold",
  "metal-light",
  "body-line",
  "shirt-primary",
  "shirt-secondary",
  "shirt-tertiary",
] as const;

export type PixelInk = (typeof PIXEL_INKS)[number];

export interface PixelRectPrimitive {
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  ink: PixelInk;
}

export interface PixelPolygonPrimitive {
  kind: "polygon";
  points: readonly PixelPoint[];
  ink: PixelInk;
  outlineInk?: PixelInk;
  outlineWidth?: number;
}

export interface PixelLinePrimitive {
  kind: "line";
  from: PixelPoint;
  to: PixelPoint;
  ink: PixelInk;
  size?: number;
}

export type PixelPrimitive = PixelRectPrimitive | PixelPolygonPrimitive | PixelLinePrimitive;

export interface PixelLayer {
  primitives: readonly PixelPrimitive[];
}

export interface PixelHeadSprite {
  silhouette: readonly PixelPoint[];
  lighting: PixelLayer;
}

export interface PixelHairSprite {
  back: PixelLayer;
  front: PixelLayer;
}

export interface PixelAnatomySprite {
  neck: PixelLayer;
  ears: PixelLayer;
}

export interface PixelFaceArtKit {
  version: number;
  canvas: { width: number; height: number };
  heads: Readonly<Record<string, PixelHeadSprite>>;
  eyes: Readonly<Record<string, PixelLayer>>;
  noses: Readonly<Record<string, PixelLayer>>;
  mouths: Readonly<Record<string, PixelLayer>>;
  hair: Readonly<Record<string, PixelHairSprite>>;
  facialHair: Readonly<Record<string, PixelLayer>>;
  brows: Readonly<Record<string, PixelLayer>>;
  ageDetails: Readonly<Record<string, PixelLayer>>;
  accessories: Readonly<Record<string, PixelLayer>>;
  anatomy: PixelAnatomySprite;
  shirts: Readonly<Record<string, PixelLayer>>;
}
