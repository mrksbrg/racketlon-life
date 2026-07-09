import { describe, expect, it } from "vitest";
import type { MatchState, Player, TournamentAdvanceResult } from "../src/index.js";
import {
  BALANCE,
  Game,
  combinedRating,
  isTournamentWeek,
  seedBracket,
  simulateMatchAuto,
  tournamentCalendar,
  travelCost,
} from "../src/index.js";
import { planWith, testContent } from "./fixtures.js";

const WORK_PLAN = planWith({ work: 5 });
const DEADLINE = BALANCE.tournament.entryDeadlineWeeks;

/** Submits weeks with the given plan until the predicate holds. */
function advanceUntil(game: Game, predicate: () => boolean, plan = WORK_PLAN, maxWeeks = 30): void {
  let guard = 0;
  while (!predicate() && guard++ < maxWeeks) {
    game.submitWeek(plan);
  }
}

/** Registers for the tournament landing on `weekIndex` at the earliest
 * possible moment, then advances play up to (not through) that week — the
 * only path to actually entering one now that same-week entry is gone. */
function registerAndAdvanceTo(game: Game, weekIndex: number, plan = WORK_PLAN): void {
  game.registerForTournament(weekIndex);
  advanceUntil(game, () => game.weekIndex === weekIndex, plan);
}

/** Plays a whole tournament using AI tactics for the human's own matches too,
 * then submits the week. Returns the final bracket result and week summary. */
function playTournamentToWeekEnd(game: Game, plan = WORK_PLAN) {
  let match: MatchState = game.enterTournament();
  let result: TournamentAdvanceResult;
  for (;;) {
    simulateMatchAuto(match);
    result = game.resolveTournamentMatch(match);
    if (result.status !== "nextRound") break;
    match = result.match;
  }
  const summary = game.submitWeek(plan);
  return { result, summary };
}

describe("isTournamentWeek", () => {
  it("is true only on the weeks real content tournaments land on", () => {
    expect(isTournamentWeek(testContent, 3)).toBe(true);
    expect(isTournamentWeek(testContent, 7)).toBe(true);
    expect(isTournamentWeek(testContent, 11)).toBe(true);
    expect(isTournamentWeek(testContent, 0)).toBe(false);
    expect(isTournamentWeek(testContent, 1)).toBe(false);
    expect(isTournamentWeek(testContent, 4)).toBe(false);
  });

  it("places each tournament on the week its real date falls into, no recurrence", () => {
    const calendar = tournamentCalendar(testContent);
    expect(calendar.size).toBe(4); // 3 domestic + 1 foreign (travel-cost fixture)
    expect(calendar.get(3)?.id).toBe("monthly-open-1");
    expect(calendar.get(7)?.id).toBe("monthly-open-2");
    expect(calendar.get(11)?.id).toBe("monthly-open-3");
  });
});

describe("bracket seeding", () => {
  function player(id: string, rating: number): Player {
    const glicko = { rating, rd: 100, volatility: 0.06 };
    return {
      identity: {
        id,
        firstName: id,
        lastName: "",
        nationality: "SE",
        birthDate: "2000-01-01",
        gender: "m",
        isReal: false,
      },
      attributes: {
        skills: { tt: 0, bd: 0, sq: 0, tn: 0 },
        talent: 0.5,
        durability: 0.5,
        professionalism: 0.5,
        stamina: 0.5,
        intelligence: 0.5,
        clutch: 0.5,
        composure: 0.5,
        traits: [],
      },
      condition: { fatigue: 0, form: 0, confidence: 0, injury: null },
      ratings: { tt: glicko, bd: glicko, sq: glicko, tn: glicko },
      simTier: 1,
    };
  }

  it("averages the four per-sport Glicko ratings, not hidden skill", () => {
    const p = player("x", 1200);
    expect(combinedRating(p)).toBe(1200);
  });

  it("always seats the highest-rated entrant at bracket position 0", () => {
    const ratings = [1000, 1600, 1100, 900, 1200, 1300, 1050, 950];
    const entrants = ratings.map((r, i) => player(String.fromCharCode(97 + i), r));
    const bracket = seedBracket(entrants, 8);
    expect(bracket[0]).toBe("b"); // rating 1600, highest
  });

  it("matches the standard 8-player seed order (1v8, 4v5, 2v7, 3v6)", () => {
    const ratings = [1600, 1500, 1400, 1300, 1200, 1100, 1000, 900]; // seed 1..8
    const entrants = ratings.map((r, i) => player(`p${i + 1}`, r));
    const bracket = seedBracket(entrants, 8);
    expect(bracket).toEqual(["p1", "p8", "p4", "p5", "p2", "p7", "p3", "p6"]);
  });

  it("matches the standard 16-player seed order", () => {
    const ratings = [1600, 1500, 1400, 1300, 1200, 1100, 1000, 900, 800, 700, 600, 500, 400, 300, 200, 100];
    const entrants = ratings.map((r, i) => player(`p${i + 1}`, r));
    const bracket = seedBracket(entrants, 16);
    expect(bracket).toEqual([
      "p1", "p16", "p8", "p9", "p4", "p13", "p5", "p12",
      "p2", "p15", "p7", "p10", "p3", "p14", "p6", "p11",
    ]);
  });

  it("produces a valid, collision-free bracket at the largest field size (64)", () => {
    const entrants = Array.from({ length: 64 }, (_, i) => player(`p${i + 1}`, 2000 - i * 10));
    const bracket = seedBracket(entrants, 64);
    expect(new Set(bracket).size).toBe(64); // every entrant placed exactly once
    expect(bracket[0]).toBe("p1"); // top seed at position 0
    expect(bracket[1]).toBe("p64"); // top seed's round-1 opponent is the bottom seed
  });
});

describe("tournament registration", () => {
  it("registers successfully at least entryDeadlineWeeks ahead", () => {
    const game = Game.newGame({ content: testContent, seed: "reg-1" });
    expect(() => game.registerForTournament(3)).not.toThrow();
  });

  it("rejects registration inside the deadline window", () => {
    const game = Game.newGame({ content: testContent, seed: "reg-2" });
    advanceUntil(game, () => game.weekIndex === 3 - DEADLINE + 1); // one week too late
    expect(() => game.registerForTournament(3)).toThrow(/deadline/i);
  });

  it("rejects registration for a non-tournament week", () => {
    const game = Game.newGame({ content: testContent, seed: "reg-3" });
    expect(() => game.registerForTournament(0)).toThrow(/no tournament/i);
  });

  it("is idempotent — registering twice for the same week is a no-op, not an error", () => {
    const game = Game.newGame({ content: testContent, seed: "reg-4" });
    game.registerForTournament(3);
    expect(() => game.registerForTournament(3)).not.toThrow();
    const entry = game.tournamentSchedule(1)[0]!;
    expect(entry.status).toBe("registered");
  });

  it("does not charge the entry fee at registration", () => {
    const game = Game.newGame({ content: testContent, seed: "reg-5" });
    const before = game.you.money;
    game.registerForTournament(3);
    expect(game.you.money).toBe(before);
  });

  it("charges the entry fee only once the tournament week arrives and is entered", () => {
    const game = Game.newGame({ content: testContent, seed: "reg-6" });
    game.registerForTournament(3);
    const rightAfterRegistering = game.you.money;
    advanceUntil(game, () => game.weekIndex === 3);
    // three weeks of WORK_PLAN earn money regardless of the tournament; the
    // point is that none of that delta is the -300 entry fee yet
    const arrived = game.you.money;
    expect(arrived).toBeGreaterThan(rightAfterRegistering); // plain weekly income, not a fee deduction
    game.enterTournament();
    expect(game.you.money).toBe(arrived - 300);
  });

  it("can be withdrawn before the tournament happens, reopening entry", () => {
    const game = Game.newGame({ content: testContent, seed: "reg-7" });
    game.registerForTournament(3);
    game.withdrawRegistration(3);
    expect(game.tournamentSchedule(1)[0]!.status).toBe("open");
  });

  it("withdrawing an unregistered week is a harmless no-op", () => {
    const game = Game.newGame({ content: testContent, seed: "reg-8" });
    expect(() => game.withdrawRegistration(3)).not.toThrow();
  });
});

describe("tournament facade flow", () => {
  it("tournamentThisWeek is informational and ignores registration", () => {
    const game = Game.newGame({ content: testContent, seed: "tour-1" });
    expect(game.tournamentThisWeek()).toBeNull();
    advanceUntil(game, () => game.weekIndex === 3);
    expect(game.tournamentThisWeek()?.id).toBe("monthly-open-1");
  });

  it("enterTournament fails without registering, even during tournament week", () => {
    const game = Game.newGame({ content: testContent, seed: "tour-1b" });
    advanceUntil(game, () => game.weekIndex === 3);
    expect(game.registeredTournamentThisWeek()).toBeNull();
    expect(() => game.enterTournament()).toThrow(/not registered/i);
  });

  it("deducts the entry fee immediately on entry", () => {
    const game = Game.newGame({ content: testContent, seed: "tour-2" });
    registerAndAdvanceTo(game, 3);
    const before = game.you.money;
    game.enterTournament();
    expect(game.you.money).toBe(before - 300);
  });

  it("deducts entry fee plus travel cost for a foreign tournament", () => {
    const game = Game.newGame({ content: testContent, seed: "tour-2b" });
    registerAndAdvanceTo(game, 20); // intl-open-1 — NO, foreign to the SE default human
    const before = game.you.money;
    const def = testContent.tournaments["intl-open-1"]!;
    const expected = travelCost("SE", def, testContent);
    game.enterTournament();
    expect(game.you.money).toBe(before - def.entryFee - expected.total);
    expect(expected.total).toBeGreaterThan(0); // sanity: this test actually exercises travel cost
  });

  it("hands back the human's first match, paused at the opening break", () => {
    const game = Game.newGame({ content: testContent, seed: "tour-3" });
    registerAndAdvanceTo(game, 3);
    const match = game.enterTournament();
    expect(match.players.a.name).toBe(game.you.name);
    expect(match.phase).toBe("break");
    expect(match.breakReason).toBe("matchStart");
  });

  it("hides the playable tournament for the rest of the week once entered", () => {
    const game = Game.newGame({ content: testContent, seed: "tour-4" });
    registerAndAdvanceTo(game, 3);
    game.enterTournament();
    expect(game.registeredTournamentThisWeek()).toBeNull();
  });

  it("accounts for entry fee, prize money, and the week's normal economy exactly", () => {
    const game = Game.newGame({ content: testContent, seed: "tour-5" });
    registerAndAdvanceTo(game, 3);
    const before = game.you.money;
    // playTournamentToWeekEnd loops until the bracket concludes, so `result`
    // is always "eliminated" or "won" here — never "nextRound"
    const { result } = playTournamentToWeekEnd(game, WORK_PLAN);

    const workDelta = 5 * 800 - BALANCE.economy.weeklyExpenses;
    expect(game.you.money).toBe(before - 300 + result.prizeMoney + workDelta);
  });

  it("produces a WeekSummary note naming the tournament", () => {
    const game = Game.newGame({ content: testContent, seed: "tour-6" });
    registerAndAdvanceTo(game, 3);
    const { summary } = playTournamentToWeekEnd(game, WORK_PLAN);
    expect(summary.notes.some((n) => n.includes("Monthly Open"))).toBe(true);
  });

  it("produces a WeekSummary note when registering", () => {
    const game = Game.newGame({ content: testContent, seed: "tour-6b" });
    game.registerForTournament(3);
    const summary = game.submitWeek(WORK_PLAN);
    expect(summary.notes.some((n) => n.includes("Registered"))).toBe(true);
  });

  it("adds meaningfully more fatigue than an identical week without a tournament", () => {
    // a plan with only ~+5 net weekly fatigue (13 work @ +4, 8 rest @ −3,
    // minus the flat recovery) — enough headroom that neither branch
    // floors or ceilings out before the tournament's own contribution shows
    const mixedPlan = planWith({ work: 13, rest: 8 });

    const withTournament = Game.newGame({ content: testContent, seed: "tour-fatigue" });
    registerAndAdvanceTo(withTournament, 3, mixedPlan);
    const { summary: tourSummary } = playTournamentToWeekEnd(withTournament, mixedPlan);

    const withoutTournament = Game.newGame({ content: testContent, seed: "tour-fatigue" });
    advanceUntil(withoutTournament, () => withoutTournament.weekIndex === 3, mixedPlan);
    const plainSummary = withoutTournament.submitWeek(mixedPlan);

    expect(tourSummary.fatigue.value).toBeGreaterThan(plainSummary.fatigue.value);
  });

  it("never advances the human further than the tournament's total rounds", () => {
    const game = Game.newGame({ content: testContent, seed: "tour-7" });
    registerAndAdvanceTo(game, 3);
    const def = game.tournamentThisWeek()!;
    const totalRounds = Math.log2(def.fieldSize);
    const { result } = playTournamentToWeekEnd(game, WORK_PLAN);
    if (result.status === "eliminated") expect(result.roundsWon).toBeLessThan(totalRounds);
    expect(result.totalRounds).toBe(totalRounds);
  });

  it("throws if entering outside a tournament week", () => {
    const game = Game.newGame({ content: testContent, seed: "tour-8" });
    expect(() => game.enterTournament()).toThrow(/not registered/i);
  });

  it("throws if resolving a match that hasn't finished yet", () => {
    const game = Game.newGame({ content: testContent, seed: "tour-9" });
    registerAndAdvanceTo(game, 3);
    const match = game.enterTournament();
    expect(() => game.resolveTournamentMatch(match)).toThrow(/match is finished/i);
  });

  it("throws if resolving with no active tournament session", () => {
    const source = Game.newGame({ content: testContent, seed: "tour-10-source" });
    registerAndAdvanceTo(source, 3);
    const match = source.enterTournament();
    simulateMatchAuto(match);

    const fresh = Game.newGame({ content: testContent, seed: "tour-10-fresh" });
    expect(() => fresh.resolveTournamentMatch(match)).toThrow(/no active tournament/i);
  });

  it("replays identically for the same seed and decisions", () => {
    function run(seed: string): string {
      const game = Game.newGame({ content: testContent, seed });
      registerAndAdvanceTo(game, 3);
      const { summary } = playTournamentToWeekEnd(game, WORK_PLAN);
      return JSON.stringify({ summary, save: game.serialize() });
    }
    expect(run("tour-det")).toBe(run("tour-det"));
  });
});

describe("tournamentSchedule", () => {
  it("returns the requested number of upcoming dated tournaments", () => {
    const game = Game.newGame({ content: testContent, seed: "sched-1" });
    const entries = game.tournamentSchedule(3);
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.weekIndex)).toEqual([3, 7, 11]);
    expect(entries.every((e) => e.tournament.name === "Monthly Open")).toBe(true);
  });

  it("flags only the current week as isThisWeek", () => {
    const game = Game.newGame({ content: testContent, seed: "sched-2" });
    advanceUntil(game, () => game.weekIndex === 3);
    const entries = game.tournamentSchedule(2);
    expect(entries[0]).toMatchObject({ weekIndex: 3, isThisWeek: true });
    expect(entries[1]).toMatchObject({ weekIndex: 7, isThisWeek: false });
  });

  it("includes the current week first when mid-tournament-week", () => {
    const game = Game.newGame({ content: testContent, seed: "sched-3" });
    advanceUntil(game, () => game.weekIndex === 7);
    const entries = game.tournamentSchedule(1);
    expect(entries[0]!.weekIndex).toBe(7);
  });

  it("statuses: open by default, registered once entered, closed past the deadline unregistered", () => {
    const game = Game.newGame({ content: testContent, seed: "sched-4" });
    expect(game.tournamentSchedule(1)[0]!.status).toBe("open");

    game.registerForTournament(3);
    expect(game.tournamentSchedule(1)[0]!.status).toBe("registered");

    const fresh = Game.newGame({ content: testContent, seed: "sched-5" });
    advanceUntil(fresh, () => fresh.weekIndex === 3 - DEADLINE + 1); // deadline just passed
    expect(fresh.tournamentSchedule(1)[0]!.status).toBe("closed");
  });

  it("projects a stable, non-empty NPC field for a future week", () => {
    const game = Game.newGame({ content: testContent, seed: "sched-6" });
    const entry = game.tournamentSchedule(1)[0]!;
    expect(entry.entrants.length).toBe(entry.tournament.fieldSize - 1); // minus the human
    // same seed, same week -> same projection every time it's read
    expect(game.tournamentSchedule(1)[0]!.entrants.map((e) => e.id)).toEqual(entry.entrants.map((e) => e.id));
  });

  it("the projected field matches who actually shows up in the bracket", () => {
    const game = Game.newGame({ content: testContent, seed: "sched-7" });
    const projectedIds = game.tournamentSchedule(1)[0]!.entrants.map((e) => e.id).sort();
    registerAndAdvanceTo(game, 3);
    const match = game.enterTournament();
    // the human's own opponent must be one of the projected NPCs
    expect(projectedIds).toContain(match.players.b.id);
  });

  it("is deterministic for a given seed and decisions", () => {
    function run(seed: string): string {
      const game = Game.newGame({ content: testContent, seed });
      registerAndAdvanceTo(game, 3);
      const { summary } = playTournamentToWeekEnd(game, WORK_PLAN);
      return JSON.stringify({ summary, save: game.serialize() });
    }
    expect(run("tour-det-2")).toBe(run("tour-det-2"));
  });
});
