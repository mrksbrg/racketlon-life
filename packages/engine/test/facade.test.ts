import { describe, expect, it } from "vitest";
import type { MatchState, TournamentAdvanceResult } from "../src/index.js";
import { BALANCE, Game, levelForSkill, simulateMatchAuto } from "../src/index.js";
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
    expect(stats.results[1]!.division).toBe("B");
    // won + finalsReached never exceed played
    expect(stats.lifetime.tournamentsWon).toBeLessThanOrEqual(2);
    expect(stats.lifetime.finalsReached).toBeGreaterThanOrEqual(stats.lifetime.tournamentsWon);
    // best finish is the deepest run
    expect(stats.bestFinish).not.toBeNull();
    const perYearPlayed = stats.byYear.reduce((n, y) => n + y.tournamentsPlayed, 0);
    expect(perYearPlayed).toBe(2);
  });

  it("trophyCabinet is empty until a top-3 finish, then lists it with division/medal", () => {
    const game = Game.newGame({ content: testContent, seed: "f9-trophy" });
    expect(game.trophyCabinet()).toHaveLength(0);

    playTournamentAt(game, 3);
    const stats = game.careerStats();
    const played = stats.results[0]!;

    const trophies = game.trophyCabinet();
    if (played.finishingPosition <= 3) {
      expect(trophies).toHaveLength(1);
      expect(trophies[0]!.medal).toBe(played.finishingPosition);
      expect(trophies[0]!.division).toBe("B");
      expect(trophies[0]!.name).toBe(played.name);
    } else {
      expect(trophies).toHaveLength(0);
    }
  });

  it("recentMatches is empty until a match is played", () => {
    const game = Game.newGame({ content: testContent, seed: "f9-matches-empty" });
    expect(game.recentMatches()).toHaveLength(0);
  });

  it("recentMatches lists every individual match played, newest first, with opponent + set score", () => {
    const game = Game.newGame({ content: testContent, seed: "f9-matches" });
    playTournamentAt(game, 3);
    const def = testContent.tournaments["monthly-open-1"]!;

    // an 8-draw's 3-game cap never bites (see tournament.test.ts's monrad
    // suite) — every entrant, including the human, plays exactly
    // log2(8) = 3 matches on any path through the bracket
    const matches = game.recentMatches();
    expect(matches).toHaveLength(3);

    // newest first: round numbers descend from the last match played
    expect(matches.map((m) => m.round)).toEqual([3, 2, 1]);

    for (const m of matches) {
      expect(m.tournamentName).toBe(def.name);
      expect(m.totalRounds).toBe(3);
      expect(m.opponentId).not.toBe("");
      expect(m.opponentName).not.toBe("");
      expect(m.sets).toHaveLength(4); // tt, bd, sq, tn
      expect(m.totalA).toBeGreaterThanOrEqual(0);
      expect(m.totalB).toBeGreaterThanOrEqual(0);
      // the human is always side "a" — `won` must agree with the aggregate
      // point totals, racketlon's real match-winner rule (see match/engine.ts)
      expect(m.won).toBe(m.totalA > m.totalB);
    }
  });

  it("recentMatches is capped at `limit`, still newest first", () => {
    const game = Game.newGame({ content: testContent, seed: "f9-matches-limit" });
    playTournamentAt(game, 3);
    const capped = game.recentMatches(2);
    expect(capped).toHaveLength(2);
    expect(capped.map((m) => m.round)).toEqual([3, 2]);
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
  });

  it("opponentProfile returns null for an unknown id", () => {
    const game = Game.newGame({ content: testContent, seed: "f12" });
    expect(game.opponentProfile("no-such-player")).toBeNull();
  });

  it("opponentProfile exposes identity/ratings/FIR standing for a real NPC, but only a fuzzy level range", () => {
    const game = Game.newGame({ content: testContent, seed: "f13" });
    const target = game.serialize().state.players.find((p) => p.identity.id === "test-m-0")!;
    const trueLevel = levelForSkill(target.attributes.skills.tt);

    const profile = game.opponentProfile("test-m-0");
    expect(profile).not.toBeNull();
    expect(profile!.name.length).toBeGreaterThan(0);
    expect(profile!.age).toBeGreaterThan(0);
    expect(profile!.ratings.tt.rating).toBeGreaterThan(0);
    expect(profile!.combinedRating).toBeGreaterThan(0);
    // the level range brackets the true level without exposing it exactly —
    // a real leak would be a range collapsed to a single value away from
    // the clamp boundaries (see levelRangeForSkill)
    const { levelMin, levelMax } = profile!.sports.tt;
    expect(levelMin).toBeGreaterThanOrEqual(1);
    expect(levelMax).toBeLessThanOrEqual(20);
    expect(trueLevel).toBeGreaterThanOrEqual(levelMin);
    expect(trueLevel).toBeLessThanOrEqual(levelMax);
    if (trueLevel > 1 + BALANCE.opponentInfo.levelRangeWidth && trueLevel < 20 - BALANCE.opponentInfo.levelRangeWidth) {
      expect(levelMax - levelMin).toBe(2 * BALANCE.opponentInfo.levelRangeWidth);
    }
    // no traits/attributes/hidden fields, and no exact `level`/`progress`,
    // leak onto the type at all — this is a compile-time guarantee
    // (OpponentProfileView has no such fields), the runtime check just
    // documents it
    expect(Object.keys(profile!)).not.toContain("traits");
    expect(Object.keys(profile!)).not.toContain("attrs");
    expect(Object.keys(profile!.sports.tt)).not.toContain("level");
    expect(Object.keys(profile!.sports.tt)).not.toContain("progress");
  });

  it("rejects saves from unknown versions", () => {
    const game = Game.newGame({ content: testContent, seed: "f6" });
    const save = game.serialize();
    save.saveVersion = 999;
    expect(() => Game.fromSave(save, testContent)).toThrow(/save version/i);
  });
});
