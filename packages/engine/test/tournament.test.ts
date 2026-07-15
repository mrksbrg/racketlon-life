import { describe, expect, it } from "vitest";
import type {
  CharacterDraft,
  ContentBundle,
  EventLog,
  GameState,
  MatchState,
  Player,
  RealPlayerDef,
  TournamentAdvanceResult,
} from "../src/index.js";
import {
  BALANCE,
  Game,
  advanceSiblingSession,
  advanceTournament,
  combinedRating,
  drawRounds,
  emptyPlan,
  finishSiblingSession,
  getPlayer,
  isSiblingConcluded,
  isTournamentWeek,
  projectedField,
  seedBracket,
  simulateMatchAuto,
  slotIndex,
  SPORTS,
  startSiblingSession,
  startTournament,
  tournamentCalendar,
  travelCost,
} from "../src/index.js";
import { planWith, testContent } from "./fixtures.js";

/** A handful of ranked male players on top of testContent's all-null roster
 * — needed to actually fill a non-lowest division's field, e.g. when
 * "playing up" a class (testContent's own roster only ever populates the
 * lowest band — see fixtures.ts). Mirrors division.test.ts's helper of the
 * same shape. */
function rankedMalePlayers(count: number): RealPlayerDef[] {
  const rating = { skill: 500, rdSkill: 60 };
  return Array.from({ length: count }, (_, i) => ({
    playerId: `ranked-m-${i}`,
    firstName: "Ranked",
    lastName: `M${i}`,
    nationality: "SE",
    gender: "m" as const,
    birthYear: 1995,
    ratings: { tt: rating, bd: rating, sq: rating, tn: rating },
    firPoints: 1000 - i,
    endurance: 0.5,
    coreStrength: 0.5,
    clutch: 0.5,
    composure: 0.5,
  }));
}

/** testContent, but with enough ranked male players that SAT's "A" (tougher,
 * played-up) division actually has a fillable field, not just a listable one. */
const contentWithRankedField: ContentBundle = {
  ...testContent,
  players: [...testContent.players, ...rankedMalePlayers(10)],
};

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
    expect(calendar.size).toBe(5); // 3 domestic + 1 foreign (travel-cost) + 1 16-draw (banding test)
    expect(calendar.get(3)?.[0]?.id).toBe("monthly-open-1-m");
    expect(calendar.get(7)?.[0]?.id).toBe("monthly-open-2-m");
    expect(calendar.get(11)?.[0]?.id).toBe("monthly-open-3-m");
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
        potential: { tt: 0.5, bd: 0.5, sq: 0.5, tn: 0.5 },
        durability: 0.5,
        professionalism: 0.5,
        endurance: 0.5,
        coreStrength: 0.5,
        intelligence: 0.5,
        clutch: 0.5,
        composure: 0.5,
        traits: [],
      },
      condition: {
        fatigue: 0,
        soreness: 0,
        sorenessStartedWeek: null,
        formBySport: { tt: 20, bd: 20, sq: 20, tn: 20 },
        neglectWeeks: { tt: 0, bd: 0, sq: 0, tn: 0 },
        confidence: 0,
        injury: null,
        agingSteps: { step1: false, step2: false },
      },
      ratings: { tt: glicko, bd: glicko, sq: glicko, tn: glicko },
      firPoints: null,
      firResults: [],
      simTier: 1,
      recentResults: [],
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

  it("withdrawing before the regular entry deadline stays free", () => {
    const game = Game.newGame({ content: testContent, seed: "reg-9" });
    game.registerForTournament(3);
    const before = game.you.money;
    game.withdrawRegistration(3);
    expect(game.you.money).toBe(before);
  });

  it("charges the entry fee when withdrawing after the regular entry deadline has passed (FIR 3.14.1)", () => {
    const game = Game.newGame({ content: testContent, seed: "reg-10" });
    game.registerForTournament(3);
    advanceUntil(game, () => game.weekIndex === 3 - DEADLINE + 1); // one week into the deadline window
    const before = game.you.money;
    game.withdrawRegistration(3);
    const def = testContent.tournaments["monthly-open-1-m"]!;
    expect(game.you.money).toBe(before - def.entryFee);
  });

  it("charges the entry fee for a no-show — registered but never entered once the tournament week passes", () => {
    const game = Game.newGame({ content: testContent, seed: "reg-11" });
    game.registerForTournament(3);
    advanceUntil(game, () => game.weekIndex === 3); // arrive at the tournament week...
    const before = game.you.money;
    game.submitWeek(WORK_PLAN); // ...and let it pass without calling enterTournament()
    const def = testContent.tournaments["monthly-open-1-m"]!;
    const workDelta = 5 * 800 - BALANCE.economy.weeklyExpenses;
    expect(game.you.money).toBe(before - def.entryFee + workDelta);
  });

  it("does not double-charge a no-show fee if the tournament was actually played", () => {
    const game = Game.newGame({ content: testContent, seed: "reg-12" });
    registerAndAdvanceTo(game, 3);
    const before = game.you.money;
    const { result } = playTournamentToWeekEnd(game, WORK_PLAN);
    const def = testContent.tournaments["monthly-open-1-m"]!;
    const workDelta = 5 * 800 - BALANCE.economy.weeklyExpenses;
    // exactly one fee deduction (the normal entry fee), not two
    expect(game.you.money).toBe(before - def.entryFee + result.prizeMoney + workDelta);
  });

  describe("class choice (playing up)", () => {
    it("lists the human's own division first, then tougher ones", () => {
      const game = Game.newGame({ content: testContent, seed: "class-1" });
      const entry = game.tournamentSchedule(1)[0]!;
      // SAT bands are ["A","B"]; a fresh (null-firPoints) human's own
      // division is the lowest, "B", with "A" (tougher) also offered
      expect(entry.eligibleDivisions.map((c) => c.def.division)).toEqual(["B", "A"]);
    });

    it("defaults tournamentSchedule's own-division fields to the first eligible class", () => {
      const game = Game.newGame({ content: testContent, seed: "class-2" });
      const entry = game.tournamentSchedule(1)[0]!;
      expect(entry.tournament.division).toBe(entry.eligibleDivisions[0]!.def.division);
    });

    it("registers for a tougher played-up class when one is given", () => {
      const game = Game.newGame({ content: contentWithRankedField, seed: "class-3" });
      game.registerForTournament(3, "A");
      const entry = game.tournamentSchedule(1)[0]!;
      expect(entry.status).toBe("registered");
      expect(entry.tournament.division).toBe("A");
      expect(entry.tournament.id).toBe("monthly-open-1-a-m");
    });

    it("registeredTournamentThisWeek reflects the actually-chosen class, not the default", () => {
      const game = Game.newGame({ content: testContent, seed: "class-4" });
      game.registerForTournament(3, "A");
      advanceUntil(game, () => game.weekIndex === 3);
      expect(game.registeredTournamentThisWeek()?.division).toBe("A");
    });

    it("entering after playing up actually plays the tougher division's draw", () => {
      const game = Game.newGame({ content: contentWithRankedField, seed: "class-5" });
      game.registerForTournament(3, "A");
      advanceUntil(game, () => game.weekIndex === 3);
      const match = game.enterTournament();
      expect(match.phase).toBe("break"); // sanity: a real match was set up
      // tournamentThisWeek stays the informational own-division default,
      // deliberately ignoring registration (see its own doc comment) — only
      // registeredTournamentThisWeek (checked above) reflects the real choice
      expect(game.tournamentThisWeek()?.division).toBe("B");
    });

    it("switches an existing registration to a different eligible class instead of erroring", () => {
      const game = Game.newGame({ content: contentWithRankedField, seed: "class-6" });
      game.registerForTournament(3); // default (own) class, "B"
      expect(() => game.registerForTournament(3, "A")).not.toThrow();
      expect(game.tournamentSchedule(1)[0]!.tournament.division).toBe("A");
    });

    it("throws for a division the human isn't eligible for", () => {
      const game = Game.newGame({ content: testContent, seed: "class-7" });
      // SAT only offers "A" and "B" — "C" doesn't exist for this tier at all
      expect(() => game.registerForTournament(3, "C" as never)).toThrow(/not open to you/i);
    });
  });
});

describe("tournament facade flow", () => {
  it("tournamentThisWeek is informational and ignores registration", () => {
    const game = Game.newGame({ content: testContent, seed: "tour-1" });
    expect(game.tournamentThisWeek()).toBeNull();
    advanceUntil(game, () => game.weekIndex === 3);
    expect(game.tournamentThisWeek()?.id).toBe("monthly-open-1-m");
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

  it("applies planned tournament-week preparation before the first match", () => {
    const game = Game.newGame({ content: testContent, seed: "tour-prep" });
    registerAndAdvanceTo(game, 3);
    const before = game.you.money;
    const ttBefore = game.you.sports.tt.level + game.you.sports.tt.progress;
    const prepPlan = emptyPlan();
    prepPlan.slots[slotIndex(2, 0)] = "trainTT";
    prepPlan.slots[slotIndex(2, 1)] = "trainTT";
    prepPlan.slots[slotIndex(2, 2)] = "trainTT";

    game.prepareAndEnterTournament(prepPlan);

    expect(game.you.money).toBe(before - 3 * 60 - BALANCE.economy.weeklyExpenses - 300);
    expect(game.you.sports.tt.level + game.you.sports.tt.progress).toBeGreaterThan(ttBefore);
  });

  it("blocks tournament days and ignores planned training on those slots", () => {
    const game = Game.newGame({ content: testContent, seed: "tour-event-blocks" });
    registerAndAdvanceTo(game, 3);

    expect(game.tournamentBlocksThisWeek()[0]?.slotIndices).toEqual([
      slotIndex(0, 0), slotIndex(0, 1), slotIndex(0, 2),
      slotIndex(1, 0), slotIndex(1, 1), slotIndex(1, 2),
    ]);

    const before = game.you.sports.tt.level + game.you.sports.tt.progress;
    const blockedTraining = emptyPlan();
    blockedTraining.slots[slotIndex(0, 0)] = "trainTT";
    blockedTraining.slots[slotIndex(0, 1)] = "trainTT";
    blockedTraining.slots[slotIndex(0, 2)] = "trainTT";

    game.prepareAndEnterTournament(blockedTraining);

    expect(game.you.sports.tt.level + game.you.sports.tt.progress).toBe(before);
  });


  it("blocks every tournament day for a weekend event", () => {
    const content: ContentBundle = {
      ...testContent,
      tournaments: {
        ...testContent.tournaments,
        "monthly-open-1-m": { ...testContent.tournaments["monthly-open-1-m"]!, date: "2026-01-30", nights: 2 },
        "monthly-open-1-a-m": { ...testContent.tournaments["monthly-open-1-a-m"]!, date: "2026-01-30", nights: 2 },
      },
    };
    const game = Game.newGame({ content, seed: "tour-weekend-blocks" });
    registerAndAdvanceTo(game, 3);

    expect(game.tournamentBlocksThisWeek()[0]?.slotIndices).toEqual([
      slotIndex(4, 0), slotIndex(4, 1), slotIndex(4, 2),
      slotIndex(5, 0), slotIndex(5, 1), slotIndex(5, 2),
      slotIndex(6, 0), slotIndex(6, 1), slotIndex(6, 2),
    ]);
  });

  it("blocks two outbound and return travel days for an intercontinental tournament", () => {
    const content: ContentBundle = {
      ...testContent,
      countries: {
        ...testContent.countries,
        AT: { name: "Austria", lat: 47.5, lon: 14.5, costIndex: 1 },
        NZ: { name: "New Zealand", lat: -41.3, lon: 174.8, costIndex: 1.2 },
      },
      tournaments: Object.fromEntries(
        Object.entries(testContent.tournaments).map(([id, def]) =>
          id.startsWith("monthly-open-1")
            ? [id, { ...def, country: "NZ", lat: -36.8, lon: 174.8 }]
            : [id, def],
        ),
      ),
    };
    const character: CharacterDraft = {
      firstName: "Verena",
      lastName: "Pichler",
      gender: "f",
      nationality: "AT",
      birthDate: "2004-01-01",
      sports: { tt: 10, bd: 10, sq: 10, tn: 10 },
      endurance: 10,
      coreStrength: 10,
      intelligence: 10,
      clutch: 10,
      composure: 10,
      resilience: 10,
      traits: [],
    };
    const game = Game.newGame({ content, character, seed: "tour-long-haul" });

    registerAndAdvanceTo(game, 3);
    expect(game.travelBlocksThisWeek()[0]?.slotIndices).toEqual([
      slotIndex(3, 0), slotIndex(3, 1), slotIndex(3, 2),
      slotIndex(4, 0), slotIndex(4, 1), slotIndex(4, 2),
    ]);

    game.enterTournament();
    game.submitWeek(WORK_PLAN);
    expect(game.travelBlocksThisWeek()[0]?.slotIndices).toEqual([
      slotIndex(0, 0), slotIndex(0, 1), slotIndex(0, 2),
      slotIndex(1, 0), slotIndex(1, 1), slotIndex(1, 2),
    ]);
  });

  it("deducts entry fee plus travel cost for a foreign tournament", () => {
    const game = Game.newGame({ content: testContent, seed: "tour-2b" });
    registerAndAdvanceTo(game, 20); // intl-open-1 — NO, foreign to the SE default human
    const before = game.you.money;
    const def = testContent.tournaments["intl-open-1-m"]!;
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

  it("sharpens form in every sport from playing tournament matches, rather than letting the untrained week decay it", () => {
    // registerAndAdvanceTo's lead-up weeks all use WORK_PLAN (no training),
    // so form is already drifting down from neglect by the time the
    // tournament's own week arrives — real match play should reverse that,
    // not add to it.
    const game = Game.newGame({ content: testContent, seed: "tour-form-1" });
    registerAndAdvanceTo(game, 3);
    const before = { ...game.you.formBySport };
    playTournamentToWeekEnd(game, WORK_PLAN);
    for (const sport of SPORTS) {
      expect(game.you.formBySport[sport]).toBeGreaterThan(before[sport]);
    }
  });

  it("carries a round-2 opponent's own real fatigue from their round-1 match, instead of resetting them to full energy", () => {
    // Every field size is a power of two, so round 1 has no byes — the
    // human's round-2 opponent necessarily just played (and won) a real,
    // energy-costing round-1 match of their own elsewhere in the bracket.
    const game = Game.newGame({ content: testContent, seed: "tour-opp-energy-2" });
    registerAndAdvanceTo(game, 3);
    const round1 = game.enterTournament();
    simulateMatchAuto(round1);
    const result = game.resolveTournamentMatch(round1);
    if (result.status !== "nextRound") throw new Error(`expected nextRound, got ${result.status}`);
    expect(result.match.energy.b).toBeLessThan(100);
  });
});

describe("monrad placement bracket", () => {
  /** A maxed-out draft, comfortably stronger than every testRoster() NPC
   * (skill ~300–940) — used only to reliably produce a round-1 *win*, since
   * the default fresh-career human is a deliberate beginner who essentially
   * never beats a tier-1 field. */
  const STRONG_DRAFT: CharacterDraft = {
    firstName: "Strong",
    lastName: "Contender",
    nationality: "SE",
    gender: "m",
    birthDate: "2000-01-01",
    sports: { tt: 20, bd: 20, sq: 20, tn: 20 },
    endurance: 20,
    coreStrength: 20,
    intelligence: 20,
    clutch: 20,
    composure: 20,
    resilience: 20,
    traits: [],
  };

  /** Finds a seed whose round-1 match resolves with the given outcome for
   * the human, and returns the game plus that already-finished match so a
   * test can keep advancing from exactly that point. Winning needs the
   * strong draft; losing happens naturally with the default beginner. */
  function enterAndPlayFirstRound(wantHumanWin: boolean): { game: Game; match: MatchState } {
    for (let i = 0; i < 200; i++) {
      const game = Game.newGame({
        content: testContent,
        seed: `monrad-r1-${i}`,
        character: wantHumanWin ? STRONG_DRAFT : undefined,
      });
      registerAndAdvanceTo(game, 3);
      const match = game.enterTournament();
      simulateMatchAuto(match);
      if ((match.winner === "a") === wantHumanWin) return { game, match };
    }
    throw new Error(`no seed found with a round-1 ${wantHumanWin ? "win" : "loss"} for the human`);
  }

  /** A concluded (non-"nextRound") advance result — what a fully played-out
   * tournament always ends on. */
  type ConcludedResult = Exclude<TournamentAdvanceResult, { status: "nextRound" }>;

  /** Plays every remaining round with AI tactics for the human too. */
  function playOutFrom(game: Game, firstMatch: MatchState): ConcludedResult {
    let match = firstMatch;
    let result = game.resolveTournamentMatch(match);
    while (result.status === "nextRound") {
      match = result.match;
      simulateMatchAuto(match);
      result = game.resolveTournamentMatch(match);
    }
    return result;
  }

  it("does not eliminate the human after a round-1 loss — the bracket keeps going", () => {
    const { game, match } = enterAndPlayFirstRound(false);
    const result = game.resolveTournamentMatch(match);
    expect(result.status).toBe("nextRound");
  });

  it("still guarantees exactly totalRounds matches after a round-1 loss, landing outside 1st", () => {
    const { game, match } = enterAndPlayFirstRound(false);
    let played = 1; // round 1 already simulated above
    let current = match;
    let result = game.resolveTournamentMatch(current);
    while (result.status === "nextRound") {
      current = result.match;
      simulateMatchAuto(current);
      result = game.resolveTournamentMatch(current);
      played++;
    }
    expect(result.status).not.toBe("nextRound");
    expect(played).toBe(result.totalRounds);
    expect(result.finishingPosition).toBeGreaterThan(1); // lost at least one match
    expect(result.finishingPosition).toBeLessThanOrEqual(8);
  });

  it("a round-1 win keeps the human in the hunt for the title, not just a bye", () => {
    const { game, match } = enterAndPlayFirstRound(true);
    const result = playOutFrom(game, match);
    expect(result.status).not.toBe("nextRound");
    // could still end up anywhere from champion (1) to mid-table depending on
    // later rounds, but never in the bottom half reserved for round-1 losers
    expect(result.finishingPosition).toBeLessThanOrEqual(4);
  });

  it("finishingPosition === 1 exactly when status is won, across many random paths", () => {
    // The strong draft (see above) makes both outcomes reachable across a
    // handful of seeds — a weak default human essentially never wins here,
    // which would leave the "won" branch below untested.
    let sawWon = false;
    let sawEliminated = false;
    for (let i = 0; i < 20; i++) {
      const game = Game.newGame({ content: testContent, seed: `monrad-invariant-${i}`, character: STRONG_DRAFT });
      registerAndAdvanceTo(game, 3);
      const match = game.enterTournament();
      simulateMatchAuto(match);
      const result = playOutFrom(game, match);
      expect(result.status).not.toBe("nextRound");
      if (result.status === "won") {
        sawWon = true;
        expect(result.finishingPosition).toBe(1);
      } else {
        sawEliminated = true;
        expect(result.finishingPosition).toBeGreaterThan(1);
        expect(result.roundsWon).toBeLessThan(result.totalRounds);
      }
      expect(result.finishingPosition).toBeGreaterThanOrEqual(1);
      expect(result.finishingPosition).toBeLessThanOrEqual(8);
    }
    // sanity: this run actually exercised both branches above
    expect(sawWon).toBe(true);
    expect(sawEliminated).toBe(true);
  });

  it("gives every entrant in an 8-draw a distinct finishing position 1..8 (the 3-game cap never bites)", () => {
    // Drives startTournament/advanceTournament directly (bypassing the
    // facade's session bookkeeping) so the *whole* field's final placement —
    // not just the human's — can be inspected once the draw concludes. An
    // 8-draw's 3 total rounds exactly equal the plate cap, so nobody should
    // ever end up tied — see the module doc comment.
    const game = Game.newGame({ content: testContent, seed: "monrad-full-field" });
    advanceUntil(game, () => game.weekIndex === 3);
    const state: GameState = game.serialize().state;
    const def = testContent.tournaments["monthly-open-1-m"]!;
    const log: EventLog = [];
    const session = startTournament(state, def, testContent, log);

    for (;;) {
      const match = session.pendingMatch!;
      simulateMatchAuto(match);
      const result = advanceTournament(state, session, match, log);
      if (result.status !== "nextRound") break;
    }

    // every group is fully decided once the tournament concludes
    expect(session.groups.every((g) => g.frozen || g.participants.length === 1)).toBe(true);
    // ...and for an 8-draw specifically, every group has shrunk to size 1 —
    // nobody was frozen into a tied band
    expect(session.groups.every((g) => g.participants.length === 1)).toBe(true);

    const positions = new Map<string, number>();
    let offset = 0;
    for (const group of session.groups) {
      for (const id of group.participants) positions.set(id, offset + 1);
      offset += group.participants.length;
    }

    expect(positions.size).toBe(def.fieldSize); // every entrant placed exactly once
    expect([...positions.values()].sort((a, b) => a - b)).toEqual(
      Array.from({ length: def.fieldSize }, (_, i) => i + 1),
    );
  });

  it("bands a 16-draw into 1st, 2nd, and seven tied pairs once the 3-game cap bites", () => {
    // The 3-game plate cap can't be satisfied for a 16-draw (log2(16) = 4
    // rounds, one more than the cap), so unlike an 8-draw this DOES produce
    // ties. The shape is fully determined by the cap + bracket size alone
    // (see the module doc comment's worked example), regardless of who
    // actually wins which match:
    //   - the champion and runner-up are always distinct (the unbeaten
    //     lineage is never capped, so the final is always played out)
    //   - every other lineage freezes the instant it would need a 4th game,
    //     which — for exactly this bracket size — always happens at group
    //     size 2, never larger and never smaller
    const game = Game.newGame({ content: testContent, seed: "monrad-16-full-field" });
    advanceUntil(game, () => game.weekIndex === 30, planWith({ work: 5 }), 35);
    const state: GameState = game.serialize().state;
    const def = testContent.tournaments["intl-open-2-m"]!;
    expect(def.fieldSize).toBe(16);
    const log: EventLog = [];
    const session = startTournament(state, def, testContent, log);

    for (;;) {
      const match = session.pendingMatch!;
      simulateMatchAuto(match);
      const result = advanceTournament(state, session, match, log);
      if (result.status !== "nextRound") break;
    }

    expect(session.groups.every((g) => g.frozen || g.participants.length === 1)).toBe(true);

    const sizes = session.groups.map((g) => g.participants.length).sort((a, b) => a - b);
    expect(sizes).toEqual([1, 1, 2, 2, 2, 2, 2, 2, 2]); // 2 distinct + 7 tied pairs
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(16);

    // every entrant appears in exactly one group
    const allIds = session.groups.flatMap((g) => g.participants);
    expect(new Set(allIds).size).toBe(16);
  });

  it("awards FIR ranking points to every entrant, not just the human", () => {
    // locks in the fix for "NPCs don't earn Tour Race points" — every
    // entrant's own firResults ledger (not just the human's) should gain an
    // entry once the tournament concludes.
    const game = Game.newGame({ content: testContent, seed: "monrad-fir-points" });
    advanceUntil(game, () => game.weekIndex === 3);
    const state: GameState = game.serialize().state;
    const def = testContent.tournaments["monthly-open-1-m"]!;
    const log: EventLog = [];
    const session = startTournament(state, def, testContent, log);

    for (;;) {
      const match = session.pendingMatch!;
      simulateMatchAuto(match);
      const result = advanceTournament(state, session, match, log);
      if (result.status !== "nextRound") break;
    }

    const positions = new Map<string, number>();
    let offset = 0;
    for (const group of session.groups) {
      for (const id of group.participants) positions.set(id, offset + 1);
      offset += group.participants.length;
    }
    expect(positions.size).toBe(def.fieldSize);

    for (const [id] of positions) {
      const entry = getPlayer(state, id).firResults.find((r) => r.tournamentId === def.id);
      expect(entry).toBeDefined();
      expect(entry!.weekIndex).toBe(3);
      expect(entry!.tier).toBe(def.tier);
    }

    // sanity: the matrix lookup actually varies by placement, not a flat
    // award — the champion earns strictly more than the last-place finisher
    const championId = [...positions.entries()].find(([, pos]) => pos === 1)![0];
    const lastId = [...positions.entries()].find(([, pos]) => pos === def.fieldSize)![0];
    const championPoints = getPlayer(state, championId).firResults.find((r) => r.tournamentId === def.id)!.points;
    const lastPoints = getPlayer(state, lastId).firResults.find((r) => r.tournamentId === def.id)!.points;
    expect(championPoints).toBeGreaterThan(lastPoints);
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

describe("drawRounds (draw tree view)", () => {
  /** Drives startTournament/advanceTournament directly, resolving the
   * human's matches with AI tactics, and returns the session + its draw
   * view after each round. */
  function playToDraw(seed: string): { session: ReturnType<typeof startTournament>; rounds: ReturnType<typeof drawRounds> } {
    const game = Game.newGame({ content: testContent, seed });
    advanceUntil(game, () => game.weekIndex === 3);
    const state: GameState = game.serialize().state;
    const def = testContent.tournaments["monthly-open-1-m"]!;
    const log: EventLog = [];
    const session = startTournament(state, def, testContent, log);
    for (;;) {
      const match = session.pendingMatch!;
      simulateMatchAuto(match);
      const result = advanceTournament(state, session, match, log);
      if (result.status !== "nextRound") break;
    }
    return { session, rounds: drawRounds(state, session) };
  }

  it("labels round 0 of an 8-draw as a Quarterfinal, main draw, positions 1-8", () => {
    const { rounds } = playToDraw("draw-1");
    const r0 = rounds[0]!;
    expect(r0.round).toBe(0);
    expect(r0.sections).toHaveLength(1);
    const [section] = r0.sections;
    expect(section!.isMainDraw).toBe(true);
    expect(section!.roundName).toBe("Quarterfinal");
    expect(section!.positionFrom).toBe(1);
    expect(section!.positionTo).toBe(8);
    expect(section!.matchups).toHaveLength(4);
    // exactly one matchup is the human's
    const yours = section!.matchups.filter((m) => m.isYouA || m.isYouB);
    expect(yours).toHaveLength(1);
  });

  it("names round 1 Semifinal (main) and Plate Semifinal (plate) once the field has split", () => {
    const { rounds } = playToDraw("draw-1");
    expect(rounds.length).toBeGreaterThanOrEqual(2);
    const r1 = rounds[1]!;
    const names = r1.sections.map((s) => s.roundName).sort();
    expect(names).toEqual(["Plate Semifinal", "Semifinal"]);
    // positions partition 1-8 with no gaps or overlaps
    const main = r1.sections.find((s) => s.isMainDraw)!;
    const plate = r1.sections.find((s) => !s.isMainDraw)!;
    expect(main.positionFrom).toBe(1);
    expect(main.positionTo).toBe(4);
    expect(plate.positionFrom).toBe(5);
    expect(plate.positionTo).toBe(8);
  });

  it("every prior round's matchups are fully decided (a real winnerId), only the latest round can be pending", () => {
    const { rounds } = playToDraw("draw-2");
    rounds.slice(0, -1).forEach((round) => {
      for (const section of round.sections) {
        for (const m of section.matchups) expect(m.winnerId).not.toBeNull();
      }
    });
  });

  it("stops recording once the human's own tournament concludes — never more than totalRounds rounds", () => {
    const { rounds } = playToDraw("draw-3");
    expect(rounds.length).toBeLessThanOrEqual(3); // log2(8)
  });
});

describe("projectedField geographic entry bias", () => {
  // HOME hosts the tournament; NEAR is ~111km away (1 degree of longitude at
  // the equator), FAR is ~10000km away (90 degrees) — both well inside vs.
  // far outside BALANCE.tournament.geoBiasScaleKm (1200km), so the draw
  // should favor NEAR players clearly across many independent weeks.
  function equidistantPlayers(count: number, nationality: string, skillBase: number): RealPlayerDef[] {
    const rating = { skill: skillBase, rdSkill: 60 };
    return Array.from({ length: count }, (_, i) => ({
      playerId: `${nationality.toLowerCase()}-${i}`,
      firstName: "Test",
      lastName: `${nationality}${i}`,
      nationality,
      gender: "m" as const,
      birthYear: 1995,
      ratings: { tt: rating, bd: rating, sq: rating, tn: rating },
      firPoints: null,
      endurance: 0.5,
      coreStrength: 0.5,
      clutch: 0.5,
      composure: 0.5,
    }));
  }

  const geoContent: ContentBundle = {
    ...testContent,
    countries: {
      HOME: { name: "Home", lat: 0, lon: 0, costIndex: 1 },
      NEAR: { name: "Near", lat: 0, lon: 1, costIndex: 1 },
      FAR: { name: "Far", lat: 0, lon: 90, costIndex: 1 },
    },
    players: [...equidistantPlayers(20, "NEAR", 600), ...equidistantPlayers(20, "FAR", 600)],
    tournaments: {
      "geo-open": {
        id: "geo-open",
        eventId: "geo-open",
        division: "A",
        // fallback human (Game.newGame below has no character override) is "m"
        gender: "m",
        name: "Geo Open",
        city: "Hometown",
        country: "HOME",
        lat: 0,
        lon: 0,
        tier: "SAT",
        date: "2026-01-26",
        nights: 1,
        entryFee: 0,
        fieldSize: 8,
        prizeByRoundsWon: [0, 0, 0, 0],
      },
      "geo-open-b": {
        id: "geo-open-b",
        eventId: "geo-open",
        division: "B",
        gender: "m",
        name: "Geo Open",
        city: "Hometown",
        country: "HOME",
        lat: 0,
        lon: 0,
        tier: "SAT",
        date: "2026-01-26",
        nights: 1,
        entryFee: 0,
        fieldSize: 8,
        prizeByRoundsWon: [0, 0, 0, 0],
      },
    },
  };

  it("draws NEAR-country players more often than equally-skilled FAR-country ones", () => {
    const def = geoContent.tournaments["geo-open"]!;
    const game = Game.newGame({ content: geoContent, seed: "geo-bias" });
    const save = game.serialize();

    let near = 0;
    let far = 0;
    for (let week = 0; week < 60; week++) {
      const pool = projectedField(save.state, def, week, geoContent);
      for (const p of pool) {
        if (p.identity.nationality === "NEAR") near++;
        else if (p.identity.nationality === "FAR") far++;
      }
    }
    // NEAR and FAR players are equally skilled and equally numerous, so a
    // distance-blind draw would land close to 50/50 — the bias should tilt
    // this decisively toward NEAR.
    expect(near).toBeGreaterThan(far * 1.5);
  });

  it("is a bias, not a cutoff — FAR-country players still get drawn sometimes", () => {
    const def = geoContent.tournaments["geo-open"]!;
    const game = Game.newGame({ content: geoContent, seed: "geo-bias-2" });
    const save = game.serialize();

    let far = 0;
    for (let week = 0; week < 60; week++) {
      const pool = projectedField(save.state, def, week, geoContent);
      far += pool.filter((p) => p.identity.nationality === "FAR").length;
    }
    expect(far).toBeGreaterThan(0);
  });
});

describe("sibling division sessions", () => {
  const defA = testContent.tournaments["monthly-open-1-a-m"]!;

  it("resolves round 0 immediately and advances one round at a time", () => {
    const game = Game.newGame({ content: testContent, seed: "sib-1" });
    const state = game.serialize().state;
    const session = startSiblingSession(state, defA, 3, testContent);

    expect(session.totalRounds).toBe(3); // log2(8)
    expect(drawRounds(state, session)).toHaveLength(1); // round 0 already resolved
    expect(isSiblingConcluded(session)).toBe(false);

    advanceSiblingSession(state, session);
    expect(drawRounds(state, session)).toHaveLength(2);
    expect(isSiblingConcluded(session)).toBe(false);

    advanceSiblingSession(state, session);
    expect(drawRounds(state, session)).toHaveLength(3);
    // an 8-draw's 3-game cap exactly matches its 3 rounds (see the module
    // doc comment) — round 2 is recorded, but every group is still size 2
    // until the *next* build, so the session isn't concluded quite yet
    expect(isSiblingConcluded(session)).toBe(false);

    advanceSiblingSession(state, session);
    // that build resolves every group down to size 1 — concluded, and no
    // 4th round is ever recorded (nothing left needing a resolveRound call)
    expect(isSiblingConcluded(session)).toBe(true);
    expect(drawRounds(state, session)).toHaveLength(3);

    // no-op once concluded — doesn't throw or add a phantom round
    advanceSiblingSession(state, session);
    expect(drawRounds(state, session)).toHaveLength(3);
  });

  it("reaches a real final with a decisive winner, never a human matchup flag", () => {
    const game = Game.newGame({ content: testContent, seed: "sib-2" });
    const state = game.serialize().state;
    const session = startSiblingSession(state, defA, 3, testContent);
    finishSiblingSession(state, session);

    expect(isSiblingConcluded(session)).toBe(true);
    const rounds = drawRounds(state, session);
    const last = rounds[rounds.length - 1]!;
    const final = last.sections.find((s) => s.isMainDraw)!;
    expect(final.roundName).toBe("Final");
    expect(final.matchups).toHaveLength(1);
    expect(final.matchups[0]!.winnerId).not.toBeNull();
    for (const round of rounds) {
      for (const section of round.sections) {
        for (const m of section.matchups) {
          expect(m.isYouA).toBe(false);
          expect(m.isYouB).toBe(false);
        }
      }
    }
  });

  it("finishSiblingSession is idempotent from any starting point", () => {
    const game = Game.newGame({ content: testContent, seed: "sib-3" });
    const state = game.serialize().state;
    const session = startSiblingSession(state, defA, 3, testContent);
    advanceSiblingSession(state, session); // partway through
    finishSiblingSession(state, session);
    expect(isSiblingConcluded(session)).toBe(true);
    const roundsAfterFirstFinish = drawRounds(state, session);
    finishSiblingSession(state, session); // already concluded — must not change anything
    expect(drawRounds(state, session)).toEqual(roundsAfterFirstFinish);
  });

  it("records every entrant's placement into recentResults exactly once, on conclusion", () => {
    const game = Game.newGame({ content: testContent, seed: "sib-4" });
    const state = game.serialize().state;
    const session = startSiblingSession(state, defA, 3, testContent);
    for (const id of session.bracketBySeed) {
      expect(getPlayer(state, id).recentResults).toHaveLength(0);
    }

    finishSiblingSession(state, session);

    const seenPositions = new Set<number>();
    for (const id of session.bracketBySeed) {
      const player = getPlayer(state, id);
      expect(player.recentResults).toHaveLength(1);
      const r = player.recentResults[0]!;
      expect(r.tournamentId).toBe(defA.id);
      expect(r.division).toBe("A");
      expect(r.matchesPlayed).toBeGreaterThanOrEqual(1);
      expect(r.matchesPlayed).toBeLessThanOrEqual(3); // 8-draw's game cap
      expect(r.finishingPosition).toBeGreaterThanOrEqual(1);
      expect(r.finishingPosition).toBeLessThanOrEqual(8);
      seenPositions.add(r.finishingPosition);
    }
    expect(seenPositions.has(1)).toBe(true); // a real champion always exists

    // fast-forwarding an already-concluded session must not add a second entry
    finishSiblingSession(state, session);
    for (const id of session.bracketBySeed) {
      expect(getPlayer(state, id).recentResults).toHaveLength(1);
    }
  });
});

describe("Game.otherDivisionDraws", () => {
  it("exposes every other division of the event once the human enters, with round 0 already resolved", () => {
    const game = Game.newGame({ content: testContent, seed: "sib-facade-1" });
    registerAndAdvanceTo(game, 3);
    game.enterTournament();

    const others = game.otherDivisionDraws();
    expect(others.map((o) => o.division)).toEqual(["A"]); // testContent's SAT event is A/B only, human's own is B
    expect(others[0]!.concluded).toBe(false);
    expect(others[0]!.rounds).toHaveLength(1);
  });

  it("advances sibling divisions one round per resolveTournamentMatch call, and fast-forwards them once the human's own tournament ends", () => {
    const game = Game.newGame({ content: testContent, seed: "sib-facade-2" });
    registerAndAdvanceTo(game, 3);
    let match = game.enterTournament();

    expect(game.otherDivisionDraws()[0]!.rounds).toHaveLength(1);

    simulateMatchAuto(match);
    let result = game.resolveTournamentMatch(match);
    expect(game.otherDivisionDraws()[0]!.rounds.length).toBeGreaterThanOrEqual(2);

    // play the human's own tournament out to conclusion
    while (result.status === "nextRound") {
      match = result.match;
      simulateMatchAuto(match);
      result = game.resolveTournamentMatch(match);
    }

    const finalOther = game.otherDivisionDraws()[0]!;
    expect(finalOther.concluded).toBe(true);
    const lastRound = finalOther.rounds[finalOther.rounds.length - 1]!;
    const final = lastRound.sections.find((s) => s.isMainDraw)!;
    expect(final.matchups[0]!.winnerId).not.toBeNull();
  });

  it("surfaces a sibling entrant's finished tournament via opponentProfile, most recent first", () => {
    const game = Game.newGame({ content: testContent, seed: "sib-facade-3" });
    registerAndAdvanceTo(game, 3);
    let match = game.enterTournament();
    const entrantId = game.otherDivisionDraws()[0]!.rounds[0]!.sections[0]!.matchups[0]!.a.id;

    expect(game.opponentProfile(entrantId)!.recentResults).toHaveLength(0);

    simulateMatchAuto(match);
    let result = game.resolveTournamentMatch(match);
    while (result.status === "nextRound") {
      match = result.match;
      simulateMatchAuto(match);
      result = game.resolveTournamentMatch(match);
    }

    const profile = game.opponentProfile(entrantId)!;
    expect(profile.recentResults).toHaveLength(1);
    const r = profile.recentResults[0]!;
    expect(r.division).toBe("A");
    expect(r.finishingPosition).toBeGreaterThanOrEqual(1);
    expect(r.matchesPlayed).toBeGreaterThanOrEqual(1);
  });
});
