import { describe, expect, it } from "vitest";
import type { EventLog, GameState, SystemContext } from "../src/index.js";
import { Game, ProgressionSystem, Rng, WeekLog, emptyPlan, humanPlayer } from "../src/index.js";
import { testContent } from "./fixtures.js";

/**
 * ProgressionSystem is exercised directly against a hand-built context
 * rather than through a played-out tournament — the human's placeholder
 * starting skills (see world/factory.ts) sit below the average tier-1 NPC
 * roll, so "sweep random seeds until the human wins" is unreliable (near-zero
 * hit rate over hundreds of tries) and not a meaningful way to pin this down.
 */
function makeContext(state: GameState, log: EventLog): SystemContext {
  const human = humanPlayer(state);
  return {
    state,
    content: testContent,
    humanPlan: emptyPlan(),
    plans: new Map(),
    rng: new Rng("progression-test"),
    log: new WeekLog(log, state.calendar.weekIndex),
    snapshot: {
      skills: { ...human.attributes.skills },
      fatigue: human.condition.fatigue,
      money: state.career.money,
      formBySport: { ...human.condition.formBySport },
      trainableAttributes: {
        endurance: human.attributes.endurance,
        coreStrength: human.attributes.coreStrength,
      },
    },
    outputs: {},
    weekModifier: null,
  };
}

function freshState(): GameState {
  const game = Game.newGame({ content: testContent, seed: "progression-fixture" });
  return game.serialize().state;
}

describe("ProgressionSystem", () => {
  it("awards the champion title on a first tournament win", () => {
    const state = freshState();
    state.career.titles = [];
    const week = state.calendar.weekIndex;
    const log: EventLog = [{ week, type: "tournament.won", subject: state.career.playerId, data: {} }];

    ProgressionSystem.run(makeContext(state, log));

    expect(state.career.titles).toEqual(["champion"]);
    expect(log.some((e) => e.type === "progression.title" && e.data?.title === "champion")).toBe(true);
  });

  it("does not re-award a title the career already has", () => {
    const state = freshState();
    state.career.titles = ["champion"];
    const week = state.calendar.weekIndex;
    const log: EventLog = [{ week, type: "tournament.won", subject: state.career.playerId, data: {} }];

    ProgressionSystem.run(makeContext(state, log));

    expect(state.career.titles).toEqual(["champion"]);
    expect(log.some((e) => e.type === "progression.title")).toBe(false);
  });

  it("flags a new career-high combined rating as a personal best", () => {
    const state = freshState();
    const human = humanPlayer(state);
    for (const sport of Object.keys(human.ratings) as (keyof typeof human.ratings)[]) {
      human.ratings[sport].rating += 200;
    }
    state.career.bestRating = 100; // force any real rating to exceed it
    const log: EventLog = [];

    ProgressionSystem.run(makeContext(state, log));

    expect(state.career.bestRating).toBeGreaterThan(100);
    expect(log.some((e) => e.type === "progression.personalBest")).toBe(true);
  });

  it("stays quiet when the rating hasn't improved on the career best", () => {
    const state = freshState();
    const human = humanPlayer(state);
    const rating = Math.round(
      (human.ratings.tt.rating + human.ratings.bd.rating + human.ratings.sq.rating + human.ratings.tn.rating) / 4,
    );
    state.career.bestRating = rating + 1000; // already far above anything achievable here
    const log: EventLog = [];

    ProgressionSystem.run(makeContext(state, log));

    expect(state.career.bestRating).toBe(rating + 1000);
    expect(log.some((e) => e.type === "progression.personalBest")).toBe(false);
  });
});
