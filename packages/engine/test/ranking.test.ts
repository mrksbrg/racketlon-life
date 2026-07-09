import { describe, expect, it } from "vitest";
import type { MatchState, TournamentAdvanceResult } from "../src/index.js";
import { Game, SPORTS, simulateMatchAuto } from "../src/index.js";
import { planWith, testContent } from "./fixtures.js";

const WORK_PLAN = planWith({ work: 5 });

/** Registers for the next upcoming tournament (must be done >= entryDeadlineWeeks
 * ahead, so this only works called right after Game.newGame) and advances to it. */
function advanceToTournamentWeek(game: Game): void {
  const weekIndex = game.tournamentSchedule(1)[0]!.weekIndex;
  game.registerForTournament(weekIndex);
  while (game.weekIndex !== weekIndex) game.submitWeek(WORK_PLAN);
}

function playTournamentToWeekEnd(game: Game) {
  let match: MatchState = game.enterTournament();
  let result: TournamentAdvanceResult;
  for (;;) {
    simulateMatchAuto(match);
    result = game.resolveTournamentMatch(match);
    if (result.status !== "nextRound") break;
    match = result.match;
  }
  game.submitWeek(WORK_PLAN);
  return result;
}

describe("RankingSystem", () => {
  it("moves the human's per-sport ratings after a tournament", () => {
    const game = Game.newGame({ content: testContent, seed: "rank1" });
    advanceToTournamentWeek(game);
    const before = game.serialize().state.players.find((p) => p.identity.id === "you")!.ratings;
    playTournamentToWeekEnd(game);
    const after = game.serialize().state.players.find((p) => p.identity.id === "you")!.ratings;

    const anySportMoved = SPORTS.some((s) => after[s].rating !== before[s].rating || after[s].rd !== before[s].rd);
    expect(anySportMoved).toBe(true);
  });

  it("also updates NPC ratings, not just the human's", () => {
    const game = Game.newGame({ content: testContent, seed: "rank2" });
    advanceToTournamentWeek(game);
    const before = game.serialize().state.players;

    playTournamentToWeekEnd(game);
    const after = game.serialize().state.players;

    const anyNpcMoved = before
      .filter((p) => p.simTier === 1)
      .some((npcBefore) => {
        const npcAfter = after.find((p) => p.identity.id === npcBefore.identity.id)!;
        return SPORTS.some((s) => npcAfter.ratings[s].rating !== npcBefore.ratings[s].rating);
      });
    expect(anyNpcMoved).toBe(true);
  });

  it("emits ranking.moved events for the human", () => {
    const game = Game.newGame({ content: testContent, seed: "rank3" });
    advanceToTournamentWeek(game);
    const weekIndex = game.weekIndex;
    playTournamentToWeekEnd(game);
    const events = game.eventsForWeek(weekIndex).filter((e) => e.type === "ranking.moved");
    expect(events.length).toBeGreaterThan(0);
  });

  it("is deterministic for a given seed", () => {
    const run = (seed: string) => {
      const game = Game.newGame({ content: testContent, seed });
      advanceToTournamentWeek(game);
      playTournamentToWeekEnd(game);
      return game.serialize().state.players.find((p) => p.identity.id === "you")!.ratings;
    };
    expect(run("rank-det")).toEqual(run("rank-det"));
  });
});
