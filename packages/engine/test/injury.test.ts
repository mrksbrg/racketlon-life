import { describe, expect, it } from "vitest";
import { Game } from "../src/index.js";
import { planWith, testContent } from "./fixtures.js";

const HEAVY_TT = planWith({ trainTT: 14 });
const REST = planWith({});

function humanOf(game: Game) {
  return game.serialize().state.players.find((p) => p.identity.id === "you")!;
}

describe("InjurySystem", () => {
  it("eventually injures a player training recklessly, attributed to the overloaded sport", () => {
    const game = Game.newGame({ content: testContent, seed: "injury-occurs" });
    let guard = 0;
    while (!humanOf(game).condition.injury && guard++ < 60) {
      game.submitWeek(HEAVY_TT);
    }
    const injury = humanOf(game).condition.injury;
    expect(injury).not.toBeNull();
    expect(injury!.type).toBe("tt");
    expect(injury!.weeksRemaining).toBeGreaterThan(0);
    expect([1, 2, 3]).toContain(injury!.severity);
  });

  it("blocks training gains for the injured sport until it heals", () => {
    const game = Game.newGame({ content: testContent, seed: "injury-blocks" });
    let guard = 0;
    while (!humanOf(game).condition.injury && guard++ < 60) {
      game.submitWeek(HEAVY_TT);
    }
    expect(humanOf(game).condition.injury).not.toBeNull();

    const weekIndex = game.weekIndex;
    const summary = game.submitWeek(HEAVY_TT);
    expect(summary.sports.tt.skillDelta).toBe(0);
    const blocked = game.eventsForWeek(weekIndex).some((e) => e.type === "injury.blocked");
    expect(blocked).toBe(true);
  });

  it("heals and clears the injury after enough rest", () => {
    const game = Game.newGame({ content: testContent, seed: "injury-heals" });
    let guard = 0;
    while (!humanOf(game).condition.injury && guard++ < 60) {
      game.submitWeek(HEAVY_TT);
    }
    expect(humanOf(game).condition.injury).not.toBeNull();

    guard = 0;
    while (humanOf(game).condition.injury && guard++ < 30) {
      game.submitWeek(REST);
    }
    expect(humanOf(game).condition.injury).toBeNull();
  });

  it("is deterministic for a given seed", () => {
    const run = (seed: string) => {
      const game = Game.newGame({ content: testContent, seed });
      for (let i = 0; i < 20; i++) game.submitWeek(HEAVY_TT);
      return humanOf(game).condition.injury;
    };
    expect(run("injury-det")).toEqual(run("injury-det"));
  });
});
