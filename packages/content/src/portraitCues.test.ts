import { describe, expect, it } from "vitest";
import { defaultContent } from "./index.js";
import {
  mergePortraitCueMaps,
  validatePortraitCuePlayerGender,
  validatePortraitCuePlayerIds,
} from "./portraitCues.js";
import { portraitCuesSchema } from "./schema.js";

describe("manual portrait cues", () => {
  it("parses reviewed cues keyed by a stable player id", () => {
    const player = defaultContent.players[0]!;
    const parsed = portraitCuesSchema.parse({
      [player.playerId]: {
        skinPalette: "skin-03",
        hairPalette: "dark-brown",
        eyes: "focused",
        accessory: "square-glasses",
      },
    });

    expect(parsed[player.playerId]).toEqual({
      skinPalette: "skin-03",
      hairPalette: "dark-brown",
      eyes: "focused",
      accessory: "square-glasses",
    });
    expect(() => validatePortraitCuePlayerIds(parsed, defaultContent.players)).not.toThrow();
  });

  it("supports explicitly suppressing generated glasses and facial hair", () => {
    expect(
      portraitCuesSchema.parse({
        "player:without-glasses": { accessory: null, facialHair: null },
      }),
    ).toEqual({ "player:without-glasses": { accessory: null, facialHair: null } });
  });

  it("rejects empty cue entries and unknown fields", () => {
    expect(() => portraitCuesSchema.parse({ "player:one": {} })).toThrow(/at least one field/);
    expect(() => portraitCuesSchema.parse({ "player:one": { eyeColour: "blue" } })).toThrow();
  });

  it("rejects overrides whose player id disappeared from a rebuilt roster", () => {
    expect(() => validatePortraitCuePlayerIds({ "missing:player": { hair: "crop" } }, defaultContent.players)).toThrow(
      /missing:player/,
    );
  });

  it("rejects cues stored in the wrong gender-specific file", () => {
    const woman = defaultContent.players.find((player) => player.gender === "f")!;
    expect(() =>
      validatePortraitCuePlayerGender({ [woman.playerId]: { hair: "ponytail" } }, defaultContent.players, "m"),
    ).toThrow(/wrong gender/);
  });

  it("merges gender-specific cue maps without allowing duplicate player ids", () => {
    expect(mergePortraitCueMaps({ man: { hair: "crop" } }, { woman: { hair: "bun" } })).toEqual({
      man: { hair: "crop" },
      woman: { hair: "bun" },
    });
    expect(() => mergePortraitCueMaps({ duplicate: { hair: "crop" } }, { duplicate: { hair: "bun" } })).toThrow(
      /more than one file/,
    );
  });
});
