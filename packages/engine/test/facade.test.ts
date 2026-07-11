import { describe, expect, it } from "vitest";
import type { MatchState, TournamentAdvanceResult } from "../src/index.js";
import { Game, simulateMatchAuto } from "../src/index.js";
import { planWith, testContent } from "./fixtures.js";

const WORK = planWith({ work: 5 });

/** Registers for the tournament in `weekIndex`, advances to it, plays it out
 * with AI tactics on both sides, and submits the week. */
function playTournamentAt(game: Game, weekIndex: number): void {
  game.registerForTournament(weekIndex);
  let guard = 0;
  while (game.weekIndex < weekIndex && guard++ < 30) game.submitWeek(WORK);
  let match: MatchState = game.enterTournament();
  let result: TournamentAdvanceResult;
  for (;;) {
    simulateMatchAuto(match);
    result = game.resolveTournamentMatch(match);
    if (result.status !== "nextRound") break;
    match = result.match;
  }
  game.submitWeek(WORK);
}

describe("Game facade", () => {
  it("forecasts a training-heavy week as gains + high injury risk", () => {
    const game = Game.newGame({ content: testContent, seed: "f1" });
    const forecast = game.previewPlan(planWith({ trainTT: 8, trainBD: 4, physical: 2 }));
    expect(forecast.sports.tt).toBeGreaterThanOrEqual(2);
    expect(forecast.sports.bd).toBeGreaterThanOrEqual(1);
    expect(forecast.fatigue).toBeGreaterThanOrEqual(1);
    expect(forecast.injuryRisk).toBe("high");
    expect(forecast.money).toBeLessThan(0);
  });

  it("forecasts a recovery week as fatigue drop + low risk", () => {
    const game = Game.newGame({ content: testContent, seed: "f2" });
    const forecast = game.previewPlan(planWith({ social: 3 }));
    expect(forecast.fatigue).toBe(-2);
    expect(forecast.injuryRisk).toBe("low");
    expect(forecast.sports.tt).toBe(0);
  });

  it("forecast money is bucketed to round hundreds", () => {
    const game = Game.newGame({ content: testContent, seed: "f3" });
    const forecast = game.previewPlan(planWith({ work: 3, trainTT: 2 }));
    expect(Math.abs(forecast.money % 100)).toBe(0);
  });

  it("serialize/load round-trips and stays deterministic", () => {
    const original = Game.newGame({ content: testContent, seed: "f4" });
    const plan = planWith({ trainSQ: 4, work: 4 });
    original.submitWeek(plan);
    original.submitWeek(plan);

    const restored = Game.fromSave(original.serialize(), testContent);
    const summaryA = original.submitWeek(plan);
    const summaryB = restored.submitWeek(plan);
    expect(JSON.stringify(summaryA)).toBe(JSON.stringify(summaryB));
    expect(JSON.stringify(original.serialize())).toBe(JSON.stringify(restored.serialize()));
  });

  it("exposes level view models, not raw skill numbers", () => {
    const game = Game.newGame({ content: testContent, seed: "f5" });
    const you = game.you;
    expect(you.sports.tt.level).toBeGreaterThanOrEqual(1);
    expect(you.sports.tt.level).toBeLessThanOrEqual(20);
    expect(you.sports.tt.progress).toBeGreaterThanOrEqual(0);
    expect(you.sports.tt.progress).toBeLessThanOrEqual(1);
  });

  it("exposes ratings, attributes, and traits on the human's own view", () => {
    const game = Game.newGame({ content: testContent, seed: "f7" });
    const you = game.you;
    expect(you.nationality).toMatch(/^[A-Z]{2}$/);
    expect(you.combinedRating).toBeGreaterThan(0);
    expect(you.ratings.tt.rating).toBeGreaterThan(0);
    expect(you.ratings.tt.rd).toBeGreaterThan(0);
    // the five creation attributes and rolled traits ARE shown to the player
    // themself now (banded 1-20, same as sport levels) — only opponents stay
    // fully hidden per docs/07 (OpponentView carries neither field)
    expect(you.attrs.stamina).toBeGreaterThanOrEqual(1);
    expect(you.attrs.stamina).toBeLessThanOrEqual(20);
    expect(you.traits.length).toBeGreaterThanOrEqual(3);
    expect(you.traits.length).toBeLessThanOrEqual(4);
    const tones = new Set(you.traits.map((t) => t.tone));
    expect(tones.has("positive")).toBe(true);
    expect(tones.has("negative")).toBe(true);
    expect(tones.has("neutral")).toBe(true);
  });

  it("careerStats starts empty for a fresh career", () => {
    const game = Game.newGame({ content: testContent, seed: "f8" });
    const stats = game.careerStats();
    expect(stats.lifetime.tournamentsPlayed).toBe(0);
    expect(stats.byYear).toHaveLength(0);
    expect(stats.results).toHaveLength(0);
    expect(stats.bestFinish).toBeNull();
  });

  it("careerStats tallies played tournaments from the event log", () => {
    const game = Game.newGame({ content: testContent, seed: "f9" });
    // first two tournament weeks under the recurring schedule
    playTournamentAt(game, 3);
    playTournamentAt(game, 7);

    const stats = game.careerStats();
    expect(stats.lifetime.tournamentsPlayed).toBe(2);
    expect(stats.results).toHaveLength(2);
    // results are most-recent-first
    expect(stats.results[0]!.week).toBe(7);
    expect(stats.results[1]!.week).toBe(3);
    // won + finalsReached never exceed played
    expect(stats.lifetime.tournamentsWon).toBeLessThanOrEqual(2);
    expect(stats.lifetime.finalsReached).toBeGreaterThanOrEqual(stats.lifetime.tournamentsWon);
    // best finish is the deepest run
    expect(stats.bestFinish).not.toBeNull();
    const perYearPlayed = stats.byYear.reduce((n, y) => n + y.tournamentsPlayed, 0);
    expect(perYearPlayed).toBe(2);
  });

  it("firStanding is null until the human has a counted FIR result", () => {
    const game = Game.newGame({ content: testContent, seed: "f10" });
    expect(game.you.firStanding).toBeNull();
  });

  it("firStanding appears once a tournament is played, ranked against same-gender players", () => {
    const game = Game.newGame({ content: testContent, seed: "f11" });
    playTournamentAt(game, 3);
    const standing = game.you.firStanding;
    expect(standing).not.toBeNull();
    expect(standing!.points).toBeGreaterThan(0);
    expect(standing!.rank).toBeGreaterThanOrEqual(1);
    expect(standing!.rank).toBeLessThanOrEqual(standing!.totalRanked);
  });

  it("opponentProfile returns null for an unknown id", () => {
    const game = Game.newGame({ content: testContent, seed: "f12" });
    expect(game.opponentProfile("no-such-player")).toBeNull();
  });

  it("opponentProfile exposes identity/sports/ratings/FIR standing for a real NPC, nothing hidden", () => {
    const game = Game.newGame({ content: testContent, seed: "f13" });
    const profile = game.opponentProfile("test-m-0");
    expect(profile).not.toBeNull();
    expect(profile!.name.length).toBeGreaterThan(0);
    expect(profile!.age).toBeGreaterThan(0);
    expect(profile!.sports.tt.level).toBeGreaterThanOrEqual(1);
    expect(profile!.ratings.tt.rating).toBeGreaterThan(0);
    expect(profile!.combinedRating).toBeGreaterThan(0);
    // no traits/attributes/hidden fields leak onto the type at all — this is
    // a compile-time guarantee (OpponentProfileView has no such fields), the
    // runtime check just documents it
    expect(Object.keys(profile!)).not.toContain("traits");
    expect(Object.keys(profile!)).not.toContain("attrs");
  });

  it("rejects saves from unknown versions", () => {
    const game = Game.newGame({ content: testContent, seed: "f6" });
    const save = game.serialize();
    save.saveVersion = 999;
    expect(() => Game.fromSave(save, testContent)).toThrow(/save version/i);
  });
});
