import { describe, expect, it } from "vitest";
import {
  defaultPortraitProvider,
  generatePortraitRecipe,
  renderPortraitPixelSvg,
  renderPortraitSvg,
  shirtColorsFor,
} from "../src/index.js";

const recipe = generatePortraitRecipe({
  playerId: "gallery:elin-lindgren",
  portraitSeed: "gallery:elin-lindgren",
  ageYears: 25,
  gender: "f",
  country: "SE",
});

describe("SVG portrait renderer", () => {
  it("renders the same dependency-free SVG for the same recipe", () => {
    const first = renderPortraitSvg(recipe, { label: "Elin Lindgren" });
    const second = renderPortraitSvg(recipe, { label: "Elin Lindgren" });

    expect(first).toBe(second);
    expect(first).toMatch(/^<svg/);
    expect(first).toContain('viewBox="0 0 96 96"');
    expect(first.match(/http:\/\//g)).toHaveLength(1); // the SVG namespace only
    expect(first).not.toContain("<script");
  });

  it("uses semantic national shirt colors", () => {
    expect(recipe.shirtPalette).toBe("country-SE");
    expect(shirtColorsFor(recipe.shirtPalette)).toEqual({
      primary: "#006aa7",
      secondary: "#fecc02",
      tertiary: "#d9efff",
    });
    expect(renderPortraitSvg(recipe)).toContain("#006aa7");
    expect(renderPortraitSvg(recipe)).toContain("#fecc02");
  });

  it("uses the royal-blue GB shirt for both supported country codes", () => {
    const gbShirt = {
      primary: "#214db5",
      secondary: "#f5f5f1",
      tertiary: "#cf142b",
    };

    expect(shirtColorsFor("country-GB")).toEqual(gbShirt);
    expect(shirtColorsFor("country-GBR")).toEqual(gbShirt);
  });

  it("escapes accessible labels", () => {
    const svg = renderPortraitSvg(recipe, { label: 'A & B <team> "one"' });
    expect(svg).toContain("A &amp; B &lt;team> &quot;one&quot;");
    expect(svg).not.toContain("<team>");
  });

  it("uses the pixel renderer through the default replaceable provider", () => {
    const rendered = defaultPortraitProvider.render?.(recipe);
    expect(rendered).toBe(renderPortraitPixelSvg(recipe));
    expect(rendered).toContain('shape-rendering="crispEdges"');
    expect(rendered).not.toContain("<ellipse");
    expect(rendered).not.toMatch(/\sd="[^"]*[QC]/);
  });

  it("falls back deterministically for an unmapped country", () => {
    expect(shirtColorsFor("country-XX")).toEqual(shirtColorsFor("country-XX"));
    expect(shirtColorsFor("country-XX")).not.toEqual(shirtColorsFor("neutral"));
  });
});
