import { describe, expect, it } from "vitest";
import {
  PIXEL_FACE_ART_KIT_V1,
  PIXEL_INKS,
  PORTRAIT_V1_CATALOG,
  type PixelLayer,
} from "../src/index.js";

function expectLayerInsideCanvas(layer: PixelLayer): void {
  const { width, height } = PIXEL_FACE_ART_KIT_V1.canvas;
  for (const primitive of layer.primitives) {
    expect(PIXEL_INKS).toContain(primitive.ink);
    if (primitive.kind === "rect") {
      expect(primitive.x).toBeGreaterThanOrEqual(0);
      expect(primitive.y).toBeGreaterThanOrEqual(0);
      expect(primitive.width).toBeGreaterThan(0);
      expect(primitive.height).toBeGreaterThan(0);
      expect(primitive.x + primitive.width).toBeLessThanOrEqual(width);
      expect(primitive.y + primitive.height).toBeLessThanOrEqual(height);
    } else if (primitive.kind === "polygon") {
      expect(primitive.points.length).toBeGreaterThanOrEqual(3);
      if (primitive.outlineInk !== undefined) expect(PIXEL_INKS).toContain(primitive.outlineInk);
      if (primitive.outlineWidth !== undefined) expect(primitive.outlineWidth).toBeGreaterThan(0);
      for (const [x, y] of primitive.points) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(width);
        expect(y).toBeLessThanOrEqual(height);
      }
    } else {
      for (const [x, y] of [primitive.from, primitive.to]) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(width);
        expect(y).toBeLessThan(height);
      }
      if (primitive.size !== undefined) expect(primitive.size).toBeGreaterThan(0);
    }
  }
}

describe("version 1 authored pixel face kit", () => {
  it("covers every semantic face feature in recipe version 1", () => {
    expect(Object.keys(PIXEL_FACE_ART_KIT_V1.heads).sort()).toEqual([...PORTRAIT_V1_CATALOG.heads].sort());
    expect(Object.keys(PIXEL_FACE_ART_KIT_V1.eyes).sort()).toEqual([...PORTRAIT_V1_CATALOG.eyes].sort());
    expect(Object.keys(PIXEL_FACE_ART_KIT_V1.noses).sort()).toEqual([...PORTRAIT_V1_CATALOG.noses].sort());
    expect(Object.keys(PIXEL_FACE_ART_KIT_V1.mouths).sort()).toEqual([...PORTRAIT_V1_CATALOG.mouths].sort());
    expect(Object.keys(PIXEL_FACE_ART_KIT_V1.hair).sort()).toEqual([...PORTRAIT_V1_CATALOG.hair, ...PORTRAIT_V1_CATALOG.matureHair].sort());
    expect(Object.keys(PIXEL_FACE_ART_KIT_V1.facialHair).sort()).toEqual([...PORTRAIT_V1_CATALOG.facialHair].sort());
    expect(Object.keys(PIXEL_FACE_ART_KIT_V1.brows).sort()).toEqual([...PORTRAIT_V1_CATALOG.brows].sort());
    expect(Object.keys(PIXEL_FACE_ART_KIT_V1.ageDetails).sort()).toEqual([...PORTRAIT_V1_CATALOG.ageMarks].sort());
    expect(Object.keys(PIXEL_FACE_ART_KIT_V1.accessories).sort()).toEqual([...PORTRAIT_V1_CATALOG.accessories].sort());
    expect(Object.keys(PIXEL_FACE_ART_KIT_V1.shirts).sort()).toEqual([...PORTRAIT_V1_CATALOG.shirts].sort());
  });

  it("keeps every authored primitive inside the 96x96 canvas", () => {
    for (const head of Object.values(PIXEL_FACE_ART_KIT_V1.heads)) {
      expectLayerInsideCanvas(head.lighting);
      for (const [x, y] of head.silhouette) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(96);
        expect(y).toBeLessThan(96);
      }
    }
    for (const featureSet of [
      PIXEL_FACE_ART_KIT_V1.eyes,
      PIXEL_FACE_ART_KIT_V1.noses,
      PIXEL_FACE_ART_KIT_V1.mouths,
      PIXEL_FACE_ART_KIT_V1.facialHair,
      PIXEL_FACE_ART_KIT_V1.brows,
      PIXEL_FACE_ART_KIT_V1.ageDetails,
      PIXEL_FACE_ART_KIT_V1.shirts,
    ]) {
      for (const feature of Object.values(featureSet)) expectLayerInsideCanvas(feature);
    }
    for (const hairstyle of Object.values(PIXEL_FACE_ART_KIT_V1.hair)) {
      expectLayerInsideCanvas(hairstyle.back);
      expectLayerInsideCanvas(hairstyle.front);
    }
    for (const accessory of Object.values(PIXEL_FACE_ART_KIT_V1.accessories)) {
      expectLayerInsideCanvas(accessory.behindHair);
      expectLayerInsideCanvas(accessory.front);
    }
    expectLayerInsideCanvas(PIXEL_FACE_ART_KIT_V1.anatomy.neck);
    expectLayerInsideCanvas(PIXEL_FACE_ART_KIT_V1.anatomy.ears);
  });

  it("contains enough independently editable parts for a meaningful vertical slice", () => {
    expect(Object.keys(PIXEL_FACE_ART_KIT_V1.heads)).toHaveLength(8);
    expect(Object.keys(PIXEL_FACE_ART_KIT_V1.eyes)).toHaveLength(6);
    expect(Object.keys(PIXEL_FACE_ART_KIT_V1.noses)).toHaveLength(6);
    expect(Object.keys(PIXEL_FACE_ART_KIT_V1.mouths)).toHaveLength(6);
    expect(Object.keys(PIXEL_FACE_ART_KIT_V1.hair)).toHaveLength(12);
    expect(Object.keys(PIXEL_FACE_ART_KIT_V1.facialHair)).toHaveLength(7);
    expect(Object.keys(PIXEL_FACE_ART_KIT_V1.brows)).toHaveLength(6);
    expect(Object.keys(PIXEL_FACE_ART_KIT_V1.ageDetails)).toHaveLength(6);
    expect(Object.keys(PIXEL_FACE_ART_KIT_V1.accessories)).toHaveLength(6);
    expect(Object.keys(PIXEL_FACE_ART_KIT_V1.shirts)).toHaveLength(8);
  });
});
