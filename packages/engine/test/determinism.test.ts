import { describe, expect, it } from "vitest";
import { Game } from "../src/index.js";
import { planWith, testContent } from "./fixtures.js";

const WEEKS = 10;

function runCareer(seed: string): string {
  const game = Game.newGame({ content: testContent, seed });
  const plan = planWith({ trainTT: 4, trainSQ: 2, work: 5, social: 2 });
  for (let week = 0; week < WEEKS; week++) {
    game.submitWeek(plan);
  }
  return JSON.stringify(game.serialize());
}

describe("determinism", () => {
  it("replays identically for the same seed", () => {
    expect(runCareer("golden-seed")).toBe(runCareer("golden-seed"));
  });

  it("diverges for different seeds", () => {
    expect(runCareer("seed-a")).not.toBe(runCareer("seed-b"));
  });
});
