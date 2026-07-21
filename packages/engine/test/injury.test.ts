import { describe, expect, it } from "vitest";
import { Game } from "../src/index.js";
import { planWith, testContent } from "./fixtures.js";

const HEAVY_TT = planWith({ trainTT: 14 });
const REST = planWith({});

function humanOf(game: Game) {
  return game.serialize().state.players.find((p) => p.identity.id === "you")!;
}

function humanInjury(game: Game) {
  return humanOf(game).condition.injury;
}

describe("InjurySystem", () => {
  it("eventually injures a player training recklessly, attributed to the overloaded sport", () => {
    const game = Game.newGame({ content: testContent, seed: "injury-occurs" });
    let guard = 0;
    // keep going through any independent illness weeks — this test targets
    // the training-load-driven injury path specifically
    while (humanInjury(game)?.kind !== "injury" && guard++ < 80) {
      game.submitWeek(HEAVY_TT);
    }
    const injury = humanInjury(game);
    expect(injury).not.toBeNull();
    expect(injury!.kind).toBe("injury");
    expect(injury!.cause).toBe("tt");
    expect(Object.keys(testContent.injuries)).toContain(injury!.catalogId);
    expect(injury!.weeksRemaining).toBeGreaterThan(0);
    expect([1, 2, 3]).toContain(injury!.severity);
  });

  it(
    "picks a catalog entry weighted toward the dominant cause",
    () => {
      // "wrist-tendinitis" has by far the highest tt sportWeight in the test
      // catalog (2.5 vs 0.1-0.5 for the others) — across enough seeds it
      // should win noticeably more often than any other tt-caused entry.
      const counts: Record<string, number> = {};
      for (let seed = 0; seed < 20; seed++) {
        const game = Game.newGame({ content: testContent, seed: `catalog-weight-${seed}` });
        let guard = 0;
        while (humanInjury(game)?.kind !== "injury" && guard++ < 80) {
          game.submitWeek(HEAVY_TT);
        }
        const injury = humanInjury(game);
        if (injury?.kind === "injury") counts[injury.catalogId] = (counts[injury.catalogId] ?? 0) + 1;
      }
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      expect(total).toBeGreaterThan(0);
      expect(counts["wrist-tendinitis"] ?? 0).toBeGreaterThan(total * 0.4);
    },
    20000,
  );

  it("blocks all sport training (not just the injured one) until it heals", () => {
    const game = Game.newGame({ content: testContent, seed: "injury-blocks" });
    let guard = 0;
    while (humanInjury(game)?.kind !== "injury" && guard++ < 80) {
      game.submitWeek(HEAVY_TT);
    }
    expect(humanInjury(game)).not.toBeNull();

    const weekIndex = game.weekIndex;
    const summary = game.submitWeek(HEAVY_TT);
    expect(summary.sports.tt.skillDelta).toBe(0);
    const blocked = game.eventsForWeek(weekIndex).some((e) => e.type === "injury.blocked");
    expect(blocked).toBe(true);
  });

  it("heals and clears the injury after enough rest", () => {
    const game = Game.newGame({ content: testContent, seed: "injury-heals" });
    let guard = 0;
    while (humanInjury(game)?.kind !== "injury" && guard++ < 80) {
      game.submitWeek(HEAVY_TT);
    }
    expect(humanInjury(game)).not.toBeNull();

    guard = 0;
    while (humanInjury(game) && guard++ < 30) {
      game.submitWeek(REST);
    }
    expect(humanInjury(game)).toBeNull();
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

describe("illness roll", () => {
  it("can strike independently of training load (rest-only weeks still risk illness)", () => {
    // Across enough seeds, at least one should catch an illness while doing
    // nothing but resting — illness isn't training-load-driven.
    let sawIllness = false;
    for (let seed = 0; seed < 40 && !sawIllness; seed++) {
      const game = Game.newGame({ content: testContent, seed: `illness-${seed}` });
      for (let week = 0; week < 20 && !sawIllness; week++) {
        game.submitWeek(REST);
        if (humanInjury(game)?.kind === "illness") sawIllness = true;
      }
    }
    expect(sawIllness).toBe(true);
  });

  it(
    "uses the illness duration table, not the injury one",
    () => {
      for (let seed = 0; seed < 40; seed++) {
        const game = Game.newGame({ content: testContent, seed: `illness-duration-${seed}` });
        for (let week = 0; week < 20; week++) {
          game.submitWeek(REST);
          const injury = humanInjury(game);
          if (injury?.kind === "illness") {
            expect(injury.cause).toBeNull();
            expect(injury.weeksRemaining).toBeLessThanOrEqual(3);
            return;
          }
        }
      }
      throw new Error("no illness occurred in 40 seeds — widen the search or check the illness chance constants");
    },
    15000,
  );
});

describe("currentInjurySpan (season calendar)", () => {
  it("is null while uninjured", () => {
    const game = Game.newGame({ content: testContent, seed: "span-none" });
    expect(game.currentInjurySpan()).toBeNull();
  });

  it("returns a real date span once injured, whose end reflects the live weeksRemaining countdown", () => {
    const game = Game.newGame({ content: testContent, seed: "span-occurs" });
    let guard = 0;
    while (!humanOf(game).condition.injury && guard++ < 60) {
      game.submitWeek(HEAVY_TT);
    }
    const injury = humanOf(game).condition.injury!;
    const span = game.currentInjurySpan();
    expect(span).not.toBeNull();
    expect(span!.kind).toBe(injury.kind);
    expect(span!.label).toBeTruthy();
    expect(span!.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(span!.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(span!.endDate).getTime()).toBeGreaterThan(new Date(span!.startDate).getTime());

    // healing a week narrows the span's end, since it's derived from the
    // live countdown rather than a snapshot taken when the injury began
    const before = game.currentInjurySpan()!.endDate;
    game.submitWeek(planWith({}));
    if (humanOf(game).condition.injury) {
      expect(new Date(game.currentInjurySpan()!.endDate).getTime()).toBeLessThanOrEqual(new Date(before).getTime());
    }
  });

  it("clears back to null once the injury heals", () => {
    const game = Game.newGame({ content: testContent, seed: "span-heals" });
    let guard = 0;
    while (!humanOf(game).condition.injury && guard++ < 60) {
      game.submitWeek(HEAVY_TT);
    }
    guard = 0;
    while (humanOf(game).condition.injury && guard++ < 30) {
      game.submitWeek(REST);
    }
    expect(game.currentInjurySpan()).toBeNull();
  });
});
