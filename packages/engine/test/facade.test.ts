import { describe, expect, it } from "vitest";
import type { EventLog, GameState, MatchState, TournamentAdvanceResult } from "../src/index.js";
import {
  BALANCE,
  Game,
  SAVE_VERSION,
  advanceTournament,
  dateForWeek,
  firPointsTotal,
  levelForSkill,
  simulateMatchAuto,
  startTournament,
  yearOfWeek,
} from "../src/index.js";
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
  game.clearConcludedTournament();
  game.submitWeek(WORK);
}

describe("Game facade", () => {
  it("forecasts a training-heavy week as gains + high injury risk", () => {
    const game = Game.newGame({ content: testContent, seed: "f1" });
    const forecast = game.previewPlan(planWith({ trainTT: 8, trainBD: 4, gym: 1, cardio: 1 }));
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

  // Default fallback human (world/factory.ts): skills { tt: 380, bd: 340, sq: 300, tn: 260 },
  // uniform potential 0.6 for every sport — levels 11/10/9/8, next-level thresholds
  // 413/360/310/263 (LEVEL_MIN_SKILL), so tennis needs only 3 more skill to level up
  // while squash needs 10 — a deliberately close-vs-far pair for these tests.
  it("trainingForecast predicts a same-week level-up for a sport that's just about to cross", () => {
    const game = Game.newGame({ content: testContent, seed: "tf1" });
    const forecast = game.trainingForecast(planWith({ trainTN: 8, gym: 1, cardio: 1 }));
    const tn = forecast.find((f) => f.sport === "tn");
    expect(tn).toBeDefined();
    expect(tn?.nextLevel).toBe(9);
    expect(tn?.weeksToLevelUp).toBe(1);
  });

  it("trainingForecast omits sports with no sessions in the plan", () => {
    const game = Game.newGame({ content: testContent, seed: "tf2" });
    const forecast = game.trainingForecast(planWith({ trainTN: 8 }));
    expect(forecast.map((f) => f.sport)).toEqual(["tn"]);
  });

  it("trainingForecast is empty for a week with no training at all", () => {
    const game = Game.newGame({ content: testContent, seed: "tf3" });
    expect(game.trainingForecast(planWith({ social: 3 }))).toEqual([]);
  });

  it("trainingForecast sorts multiple sports soonest-first", () => {
    const game = Game.newGame({ content: testContent, seed: "tf4" });
    const forecast = game.trainingForecast(planWith({ trainTN: 1, trainSQ: 1 }));
    expect(forecast.map((f) => f.sport)).toEqual(["tn", "sq"]);
    expect(forecast[0]!.weeksToLevelUp).toBeLessThan(forecast[1]!.weeksToLevelUp);
    expect(forecast[1]!.weeksToLevelUp).toBeLessThanOrEqual(BALANCE.forecast.trainingForecastHorizonWeeks);
  });

  it("weeksUntilPayday counts down to the last week of the calendar month", () => {
    // DEFAULT_START_MONDAY 2026-01-05 ⇒ week 3 (Jan 26) is January's last Monday
    const game = Game.newGame({ content: testContent, seed: "payday-1" });
    expect(game.weeksUntilPayday()).toBe(3);
  });

  it("weeksUntilPayday hits 0 on payday itself, then resets after crossing into the next month", () => {
    const game = Game.newGame({ content: testContent, seed: "payday-2" });
    for (let i = 0; i < 3; i++) game.submitWeek(WORK);
    expect(game.weekIndex).toBe(3);
    expect(game.weeksUntilPayday()).toBe(0);
    game.submitWeek(WORK);
    expect(game.weeksUntilPayday()).toBe(3); // Feb 23 (week 7) is February's last Monday
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

  it("completedDraw survives clearConcludedTournament and a serialize/fromSave round-trip", () => {
    const game = Game.newGame({ content: testContent, seed: "f4-completed-draw" });
    expect(game.completedDraw(3)).toBeNull(); // nothing played yet
    playTournamentAt(game, 3); // plays week 3's tournament and clears the session

    const draw = game.completedDraw(3);
    expect(draw).not.toBeNull();
    expect(draw!.rounds.length).toBeGreaterThan(0);
    const finalSection = draw!.rounds[draw!.rounds.length - 1]!.sections.find((s) => s.isMainDraw)!;
    expect(finalSection.matchups[0]!.winnerId).not.toBeNull();
    // the live session is long gone — completedDraw doesn't depend on it
    expect(game.tournamentDraw()).toBeNull();

    const restored = Game.fromSave(game.serialize(), testContent);
    expect(restored.completedDraw(3)).toEqual(draw);
  });

  it("simulates every tournament the human skips — NPC ratings/FIR points move and the draw becomes browsable", () => {
    const game = Game.newGame({ content: testContent, seed: "world-sim-1" });
    const beforeState = game.serialize().state;
    const ratingsBefore = new Map(beforeState.players.map((p) => [p.identity.id, JSON.stringify(p.ratings)]));
    expect(game.completedDraw(3)).toBeNull();

    // advance straight past week 3's tournament — never registered, never entered
    let guard = 0;
    while (game.weekIndex <= 3 && guard++ < 10) game.submitWeek(WORK);

    const draw = game.completedDraw(3);
    expect(draw).not.toBeNull();
    expect(draw!.otherDivisions.length).toBeGreaterThan(0);
    // both genders' divisions are simulated, not just whichever one the
    // human would have played
    const genders = new Set([draw!.tournament.gender, ...draw!.otherDivisions.map((o) => o.tournament.gender)]);
    expect(genders).toEqual(new Set(["m", "f"]));

    const state = game.serialize().state;
    const npcsWithResults = state.players.filter(
      (p) => p.identity.id !== state.career.playerId && p.firResults.length > 0,
    );
    expect(npcsWithResults.length).toBeGreaterThan(0);
    // ratings actually moved, not just the FIR ledger — see the Glicko
    // application fix in tournament/engine.ts's recordEntrantResults
    const npcsWithRatingChange = npcsWithResults.filter(
      (p) => JSON.stringify(p.ratings) !== ratingsBefore.get(p.identity.id),
    );
    expect(npcsWithRatingChange.length).toBeGreaterThan(0);

    // a tournament-director podium mail went out even though the human
    // never played
    const podiumMail = state.career.inbox.find((m) => m.category === "podium" && m.tournamentWeek === 3);
    expect(podiumMail).toBeDefined();
    expect(podiumMail!.podiumMen?.length).toBeGreaterThan(0);
    expect(podiumMail!.podiumWomen?.length).toBeGreaterThan(0);
  });

  it("labels the human's own gender/division as the 'primary' draw for a fully-skipped week", () => {
    // Regression: the UI's Draw.svelte hardcodes its first tab as "Your
    // draw" — for a skipped week, `completedDraw().tournament` must resolve
    // to the human's own division, not an arbitrary first def (which could
    // just as easily be the opposite gender's class).
    const game = Game.newGame({ content: testContent, seed: "world-sim-primary-1" });
    const humanGender = game.you.gender;
    let guard = 0;
    while (game.weekIndex <= 3 && guard++ < 10) game.submitWeek(WORK);

    const draw = game.completedDraw(3)!;
    expect(draw.tournament.gender).toBe(humanGender);
  });

  it("also fills in the opposite-gender divisions of an event the human actually played", () => {
    const game = Game.newGame({ content: testContent, seed: "world-sim-2" });
    const humanGender = game.you.gender;
    playTournamentAt(game, 3);

    const draw = game.completedDraw(3)!;
    expect(draw).not.toBeNull();
    const genders = new Set([draw.tournament.gender, ...draw.otherDivisions.map((o) => o.tournament.gender)]);
    expect(genders).toEqual(new Set(["m", "f"]));
    // sanity: the human's own division really is in there under their own gender
    const ownGenderDefs = [draw.tournament, ...draw.otherDivisions.map((o) => o.tournament)].filter(
      (d) => d.gender === humanGender,
    );
    expect(ownGenderDefs.length).toBeGreaterThan(0);
  });

  it("a purely fictional NPC (no real-world FIR points) shows up on the Rankings screen once they've actually won a division", () => {
    // Regression: firWorldRanking used to read only `player.firPoints` — the
    // frozen real-world snapshot — for every NPC, so a generated player with
    // no real-world ranking (firPoints: null, the common case for most of
    // the roster) was structurally invisible on the Rankings screen even
    // after winning tournaments in-game. Fixed via officialPointsFor's
    // fallback to the player's own firResults ledger.
    const game = Game.newGame({ content: testContent, seed: "npc-fir-visibility-1" });
    const before = game.serialize().state;

    let guard = 0;
    while (game.weekIndex <= 3 && guard++ < 10) game.submitWeek(WORK);

    const state = game.serialize().state;
    const champion = state.players.find((p) => {
      if (p.identity.id === state.career.playerId) return false;
      const beforePlayer = before.players.find((bp) => bp.identity.id === p.identity.id)!;
      // a player with no real-world FIR points before, and at least one
      // counted in-game result now
      return beforePlayer.firPoints === null && p.firResults.length > 0;
    });
    expect(champion).toBeDefined();

    const rows = game.rankings(champion!.identity.gender);
    const row = rows.find((r) => r.playerId === champion!.identity.id);
    expect(row).toBeDefined();
    expect(row!.points).toBe(firPointsTotal(champion!.firResults, state.calendar.weekIndex));
    expect(row!.points).toBeGreaterThan(0);
  });

  it("holds FIR ranking points as pending until submitWeek's next month crossing — not the instant a tournament concludes", () => {
    // Real FIR points aren't live immediately; the federation batches and
    // publishes on the 1st of the next month. Glicko ratings have no such
    // delay. Deliberately does NOT call submitWeek after the tournament
    // concludes, so this checks state exactly at the moment
    // resolveTournamentMatch finishes — before any weekly pipeline (and
    // therefore any publish) has had a chance to run.
    const game = Game.newGame({ content: testContent, seed: "fir-delay-1" });
    game.registerForTournament(3);
    let guard = 0;
    while (game.weekIndex < 3 && guard++ < 10) game.submitWeek(WORK);

    const beforeRatings = JSON.stringify(game.serialize().state.players.find((p) => p.identity.id === game.serialize().state.career.playerId)!.ratings);

    let match = game.enterTournament();
    for (;;) {
      simulateMatchAuto(match);
      const result = game.resolveTournamentMatch(match);
      if (result.status !== "nextRound") break;
      match = result.match;
    }

    const state = game.serialize().state;
    const human = state.players.find((p) => p.identity.id === state.career.playerId)!;
    expect(human.pendingFirResults.length).toBeGreaterThan(0);
    expect(human.firResults).toHaveLength(0); // not yet published
    // ratings, by contrast, already moved — no waiting period for those
    expect(JSON.stringify(human.ratings)).not.toBe(beforeRatings);
  });

  it("shows a player's match the moment their round resolves, not only once the whole tournament concludes", () => {
    // Regression: matchesForPlayer used to be mined only from
    // career.completedDraws, written once by clearConcludedTournament — so
    // any already-decided AI-vs-AI match (they resolve instantly each
    // round, see tournament/engine.ts's resolveRound) stayed invisible on
    // an opponent's profile for the whole event, even mid-tournament.
    const game = Game.newGame({ content: testContent, seed: "mid-tourney-history-1" });
    game.registerForTournament(3);
    let guard = 0;
    while (game.weekIndex < 3 && guard++ < 10) game.submitWeek(WORK);
    game.enterTournament(); // round 0 is already resolved for every AI-vs-AI pair

    // the tournament hasn't concluded — completedDraws has nothing yet
    expect(game.completedDraw(3)).toBeNull();

    const rounds = game.tournamentDraw()!;
    expect(rounds).toHaveLength(1);
    const decidedPair = rounds[0]!.sections
      .flatMap((s) => s.matchups)
      .find((m) => !m.isYouA && !m.isYouB && m.winnerId !== null)!;
    expect(decidedPair).toBeDefined();

    const aMatches = game.matchesForPlayer(decidedPair.a.id);
    const found = aMatches.find((m) => m.opponentId === decidedPair.b.id && m.week === 3);
    expect(found).toBeDefined();
    expect(found!.won).toBe(decidedPair.winnerId === decidedPair.a.id);

    // symmetric from the loser's own profile too
    const bMatches = game.matchesForPlayer(decidedPair.b.id);
    expect(bMatches.some((m) => m.opponentId === decidedPair.a.id && m.week === 3)).toBe(true);
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
    expect(you.attrs.endurance).toBeGreaterThanOrEqual(1);
    expect(you.attrs.endurance).toBeLessThanOrEqual(20);
    expect(you.attrs.coreStrength).toBeGreaterThanOrEqual(1);
    expect(you.attrs.coreStrength).toBeLessThanOrEqual(20);
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
    expect(stats.results[1]!.division).toBe("C"); // men's SAT: fresh human's own division is the lowest, "C"
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
      expect(trophies[0]!.division).toBe("C"); // men's SAT: fresh human's own division is the lowest, "C"
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
    const def = testContent.tournaments["monthly-open-1-m"]!;

    // an 8-draw's 3-game cap never bites (see tournament.test.ts's monrad
    // suite) — every entrant, including the human, plays exactly
    // log2(8) = 3 matches on any path through the bracket
    const matches = game.recentMatches();
    expect(matches).toHaveLength(3);

    // newest first: round numbers descend from the last match played
    expect(matches.map((m) => m.round)).toEqual([3, 2, 1]);

    // an 8-draw's every possible stage name, main draw or plate
    const EIGHT_DRAW_STAGES = new Set([
      "Quarterfinal",
      "Semifinal",
      "Playoff for 5th–8th",
      "Final",
      "Bronze Medal Match",
      "5th Place Match",
      "7th Place Match",
    ]);
    for (const m of matches) {
      expect(m.tournamentName).toBe(def.name);
      expect(m.totalRounds).toBe(3);
      expect(m.opponentId).not.toBe("");
      expect(m.opponentName).not.toBe("");
      expect(EIGHT_DRAW_STAGES.has(m.roundName)).toBe(true);
      expect(m.sets).toHaveLength(4); // tt, bd, sq, tn
      expect(m.totalA).toBeGreaterThanOrEqual(0);
      expect(m.totalB).toBeGreaterThanOrEqual(0);
      // the human is always side "a" — `won` must agree with the aggregate
      // point totals, racketlon's real match-winner rule (see match/engine.ts)
      expect(m.won).toBe(m.totalA > m.totalB);
    }
    // round 0 of an 8-draw is always a Quarterfinal for every entrant
    expect(matches[2]!.roundName).toBe("Quarterfinal");
  });

  it("recentMatches is capped at `limit`, still newest first", () => {
    const game = Game.newGame({ content: testContent, seed: "f9-matches-limit" });
    playTournamentAt(game, 3);
    const capped = game.recentMatches(2);
    expect(capped).toHaveLength(2);
    expect(capped.map((m) => m.round)).toEqual([3, 2]);
  });

  it("matchesForYear filters by calendar year, including across a year boundary", () => {
    // test content has no tournaments scheduled past ~week 30, so this drives
    // startTournament/advanceTournament directly at hand-picked weeks (same
    // low-level pattern as tournament.test.ts's monrad suite) rather than
    // going through the content-scheduled calendar.
    const game = Game.newGame({ content: testContent, seed: "matchyear-1" });
    const state: GameState = game.serialize().state;
    const log: EventLog = [];
    const def = testContent.tournaments["monthly-open-1-m"]!;

    // `yearOfWeek` computes relative to `cal.weekIndex`/`cal.mondayISO` — the
    // pair must stay consistent, so build a fresh, correctly-dated Calendar
    // for each target week off the original (week-0) reference rather than
    // just poking `weekIndex` in place.
    const origin = { ...state.calendar };
    const calendarAt = (weekIndex: number) => ({ weekIndex, mondayISO: dateForWeek(origin, weekIndex) });

    const year1 = yearOfWeek(origin, 3);
    let boundaryWeek = 3;
    while (yearOfWeek(origin, boundaryWeek) === year1) boundaryWeek++;
    const year2 = yearOfWeek(origin, boundaryWeek);
    expect(year2).toBeGreaterThan(year1);

    state.calendar = calendarAt(3);
    let session = startTournament(state, def, testContent, log);
    for (;;) {
      const match = session.pendingMatch!;
      simulateMatchAuto(match);
      if (advanceTournament(state, session, match, log).status !== "nextRound") break;
    }

    state.calendar = calendarAt(boundaryWeek);
    session = startTournament(state, def, testContent, log);
    for (;;) {
      const match = session.pendingMatch!;
      simulateMatchAuto(match);
      if (advanceTournament(state, session, match, log).status !== "nextRound") break;
    }

    const restored = Game.fromSave({ saveVersion: SAVE_VERSION, state, log }, testContent);
    const matchesYear1 = restored.matchesForYear(year1);
    const matchesYear2 = restored.matchesForYear(year2);
    expect(matchesYear1.length).toBeGreaterThan(0);
    expect(matchesYear2.length).toBeGreaterThan(0);
    expect(matchesYear1.every((m) => m.week === 3)).toBe(true);
    expect(matchesYear2.every((m) => m.week === boundaryWeek)).toBe(true);
    // no cap — every match from that year, not just a recent few
    expect(matchesYear1.length + matchesYear2.length).toBe(restored.recentMatches(999).length);
  });

  it("mostPlayedOpponents tallies matches per opponent, sorted most-played first", () => {
    const game = Game.newGame({ content: testContent, seed: "mpo-1" });
    const save = game.serialize();
    const opp = (id: string, name: string, week: number, won: boolean) => ({
      week,
      type: "match.played" as const,
      subject: save.state.career.playerId,
      data: {
        tournamentName: "T",
        round: 1,
        totalRounds: 1,
        roundName: "Final",
        opponentId: id,
        opponentName: name,
        won,
        sets: [],
      },
    });
    save.log.push(opp("o1", "Alice", 1, true), opp("o1", "Alice", 2, false), opp("o2", "Bob", 3, true));
    const restored = Game.fromSave(save, testContent);
    const result = restored.mostPlayedOpponents();
    expect(result[0]).toMatchObject({ opponentId: "o1", opponentName: "Alice", matches: 2, wins: 1 });
    expect(result[1]).toMatchObject({ opponentId: "o2", opponentName: "Bob", matches: 1, wins: 1 });
  });

  it("records mines biggest win/loss, per-sport bests, highest ranked win, and gummiarm tally", () => {
    const game = Game.newGame({ content: testContent, seed: "rec-1" });
    const save = game.serialize();
    const match = (
      week: number,
      opponentId: string,
      opponentName: string,
      won: boolean,
      sets: [number, number][],
      opponentRank: number | null,
      opponentRatings: { tt: number; bd: number; sq: number; tn: number },
      gummiarm = false,
    ) => ({
      week,
      type: "match.played" as const,
      subject: save.state.career.playerId,
      data: {
        tournamentName: "T",
        tier: "CHA",
        round: 1,
        totalRounds: 1,
        roundName: "Final",
        opponentId,
        opponentName,
        opponentRank,
        opponentRatings,
        won,
        sets: sets.map(([a, b]) => ({ a, b, done: true })),
        gummiarm,
      },
    });

    save.log.push(
      // biggest win overall (margin 22); best tt win (margin 16); best bd win (margin 2, later beaten)
      match(1, "o1", "Alice", true, [[21, 5], [21, 19], [21, 19], [21, 19]], 5, { tt: 1500, bd: 1400, sq: 1300, tn: 1200 }),
      // biggest loss overall (margin 27); best tn opponent rating (1900); best tn loss (margin 16)
      match(2, "o2", "Bob", false, [[10, 21], [15, 21], [21, 15], [5, 21]], null, { tt: 1600, bd: 1550, sq: 1250, tn: 1900 }),
      // best sq win (margin 11); highest ranked win (rank 2, beats o1's rank 5); a gummiarm win
      match(3, "o3", "Cara", true, [[21, 15], [5, 21], [21, 10], [21, 18]], 2, { tt: 1000, bd: 1000, sq: 1000, tn: 1000 }, true),
      // best tt/bd/sq opponent rating and best bd win (16) / best tn win (19)
      match(4, "o4", "Dave", true, [[5, 21], [21, 5], [15, 21], [21, 2]], 10, { tt: 1700, bd: 1650, sq: 1800, tn: 1250 }),
      // a gummiarm loss; rank 1 but lost, so must not surface as the highest ranked win
      match(5, "o5", "Eve", false, [[21, 19], [15, 21], [21, 18], [10, 21]], 1, { tt: 900, bd: 900, sq: 900, tn: 900 }, true),
    );
    const restored = Game.fromSave(save, testContent);
    const records = restored.records();

    expect(records.biggestWin).toMatchObject({ opponentId: "o1", margin: 22, tournamentTier: "CHA" });
    expect(records.biggestWin!.year).toBeGreaterThan(2000);
    expect(records.biggestLoss).toMatchObject({ opponentId: "o2", margin: 27, tournamentTier: "CHA" });

    expect(records.biggestWinBySport.tt).toMatchObject({ opponentId: "o1", a: 21, b: 5, margin: 16 });
    expect(records.biggestLossBySport.tt).toMatchObject({ opponentId: "o4", a: 5, b: 21, margin: 16 });
    expect(records.biggestWinBySport.bd).toMatchObject({ opponentId: "o4", a: 21, b: 5, margin: 16 });
    expect(records.biggestLossBySport.bd).toMatchObject({ opponentId: "o3", a: 5, b: 21, margin: 16 });
    expect(records.biggestWinBySport.sq).toMatchObject({ opponentId: "o3", a: 21, b: 10, margin: 11 });
    expect(records.biggestLossBySport.sq).toMatchObject({ opponentId: "o4", a: 15, b: 21, margin: 6 });
    expect(records.biggestWinBySport.tn).toMatchObject({ opponentId: "o4", a: 21, b: 2, margin: 19 });
    expect(records.biggestLossBySport.tn).toMatchObject({ opponentId: "o2", a: 5, b: 21, margin: 16 });

    // a/b/won reflect how that specific meeting's set actually went, not
    // just the opponent's rating
    expect(records.bestOpponentBySport.tt).toMatchObject({ opponentId: "o4", rating: 1700, a: 5, b: 21, won: false });
    expect(records.bestOpponentBySport.bd).toMatchObject({ opponentId: "o4", rating: 1650, a: 21, b: 5, won: true });
    expect(records.bestOpponentBySport.sq).toMatchObject({ opponentId: "o4", rating: 1800, a: 15, b: 21, won: false });
    expect(records.bestOpponentBySport.tn).toMatchObject({ opponentId: "o2", rating: 1900, a: 5, b: 21, won: false });

    // o5 (rank 1) lost, so o3 (rank 2, a real win) is the highest ranked win
    expect(records.highestRankedWin).toMatchObject({ opponentId: "o3", rank: 2, totalA: 68, totalB: 64 });
    expect(records.highestRankedWin!.sets).toEqual([
      { sport: "tt", a: 21, b: 15, done: true },
      { sport: "bd", a: 5, b: 21, done: true },
      { sport: "sq", a: 21, b: 10, done: true },
      { sport: "tn", a: 21, b: 18, done: true },
    ]);

    expect(records.gummiarms).toEqual({ played: 2, won: 1 });

    // o1's win never trailed (deficit stays 0, excluded); o4's win was down
    // 16 (5-21 in tt) before rallying to a 62-49 final — the deepest hole
    // among the wins, beating o3's 10-point deficit
    expect(records.biggestComeback).toMatchObject({ opponentId: "o4", deficit: 16, margin: 13, totalA: 62, totalB: 49 });
  });

  it("records finds the greatest comeback among wins only, ignoring matches never trailed and breaking ties by recency", () => {
    const game = Game.newGame({ content: testContent, seed: "rec-comeback" });
    const save = game.serialize();
    const match = (week: number, opponentId: string, opponentName: string, won: boolean, sets: [number, number][]) => ({
      week,
      type: "match.played" as const,
      subject: save.state.career.playerId,
      data: {
        tournamentName: "T",
        tier: "CHA",
        round: 1,
        totalRounds: 1,
        roundName: "Final",
        opponentId,
        opponentName,
        opponentRank: null,
        opponentRatings: { tt: 1000, bd: 1000, sq: 1000, tn: 1000 },
        won,
        sets: sets.map(([a, b]) => ({ a, b, done: true })),
        gummiarm: false,
      },
    });

    save.log.push(
      // won, but led from the very first set — no comeback in it
      match(1, "o1", "Alice", true, [[21, 5], [21, 19], [21, 19], [21, 19]]),
      // trailed for most of the match but ultimately lost — must not
      // surface, comebacks only count when the match was actually won
      match(2, "o2", "Bob", false, [[2, 21], [21, 19], [10, 21], [21, 19]]),
      // won after trailing by 15 at the earliest boundary (older of the tie)
      match(3, "o3", "Cara", true, [[6, 21], [21, 5], [21, 10], [21, 15]]),
      // won after trailing by 15 as well, but this is the more recent match —
      // the tie-break should prefer it over o3's
      match(4, "o4", "Dave", true, [[6, 21], [21, 5], [21, 10], [21, 15]]),
    );
    const restored = Game.fromSave(save, testContent);
    const records = restored.records();

    expect(records.biggestComeback).toMatchObject({ opponentId: "o4", deficit: 15 });
  });

  it("records skips a set an early finish cut short, even if its score shape looks final", () => {
    const game = Game.newGame({ content: testContent, seed: "rec-2" });
    const save = game.serialize();
    save.log.push({
      week: 1,
      type: "match.played",
      subject: save.state.career.playerId,
      data: {
        tournamentName: "T",
        tier: "CHA",
        round: 1,
        totalRounds: 1,
        roundName: "Final",
        opponentId: "o1",
        opponentName: "Alice",
        opponentRank: null,
        opponentRatings: { tt: 1000, bd: 1000, sq: 1000, tn: 1000 },
        won: true,
        sets: [
          // looks like a 21-1 blowout, but the match was actually decided
          // (an uncatchable aggregate lead) before this set finished — must
          // not surface as the biggest tt win
          { a: 21, b: 1, done: false },
          { a: 21, b: 19, done: true },
          { a: 21, b: 19, done: true },
          { a: 0, b: 0, done: false },
        ],
        gummiarm: false,
      },
    });
    const restored = Game.fromSave(save, testContent);
    const records = restored.records();
    expect(records.biggestWinBySport.tt).toBeUndefined();
    expect(records.biggestWinBySport.bd).toMatchObject({ a: 21, b: 19 });
    expect(records.biggestWinBySport.sq).toMatchObject({ a: 21, b: 19 });
    expect(records.biggestWinBySport.tn).toBeUndefined();
  });

  it("records reconstructs a legacy set's `done` from its score shape when the field predates it", () => {
    const game = Game.newGame({ content: testContent, seed: "rec-3" });
    const save = game.serialize();
    save.log.push({
      week: 1,
      type: "match.played",
      subject: save.state.career.playerId,
      data: {
        tournamentName: "T",
        round: 1,
        totalRounds: 1,
        roundName: "Final",
        opponentId: "o1",
        opponentName: "Alice",
        opponentRank: null,
        opponentRatings: { tt: 1000, bd: 1000, sq: 1000, tn: 1000 },
        won: true,
        // no `done` on any set — the pre-`done` log shape
        sets: [
          { a: 21, b: 5 }, // shaped like a real completed set — counts
          { a: 10, b: 6 }, // never reached 21 — an early-finish leftover, excluded
          { a: 0, b: 0 }, // unplayed — excluded
          { a: 21, b: 19 }, // shaped like a real completed set — counts
        ],
        gummiarm: false,
      },
    });
    const restored = Game.fromSave(save, testContent);
    const records = restored.records();
    expect(records.biggestWinBySport.tt).toMatchObject({ a: 21, b: 5 });
    expect(records.biggestWinBySport.bd).toBeUndefined();
    expect(records.biggestWinBySport.sq).toBeUndefined();
    expect(records.biggestWinBySport.tn).toMatchObject({ a: 21, b: 19 });
  });

  it("emails a FIR Stats Bot record-broken note only once a record is later beaten, never the first time it's set", () => {
    const game = Game.newGame({ content: testContent, seed: "recmail-1" });

    /** Registers, forces the opening match to the given final score (all 4
     * sets marked done, no simulation involved so the margin is exact), then
     * auto-plays out the rest of the tournament and submits the week — same
     * shape as `playTournamentAt` above, but with a controlled first result
     * so the "biggest win" margin is deterministic. Returns whatever
     * "record" category inbox messages appeared from that opening match
     * specifically (before the rest of the tournament could add its own). */
    function forceOpeningWin(weekIndex: number, sets: [number, number][]) {
      game.registerForTournament(weekIndex);
      let guard = 0;
      while (game.weekIndex < weekIndex && guard++ < 30) game.submitWeek(WORK);
      const match: MatchState = game.enterTournament();
      match.sets = sets.map(([a, b]) => ({ a, b, done: true }));
      match.phase = "finished";
      match.winner = "a";
      // `game.inbox` is newest-first, so diff by id rather than assuming
      // new entries land at either end of the array
      const idsBefore = new Set(game.inbox.map((m) => m.id));
      let result = game.resolveTournamentMatch(match);
      const newRecordMail = game.inbox.filter((m) => m.category === "record" && !idsBefore.has(m.id));
      while (result.status === "nextRound") {
        simulateMatchAuto(result.match);
        result = game.resolveTournamentMatch(result.match);
      }
      game.clearConcludedTournament();
      game.submitWeek(WORK);
      return newRecordMail;
    }

    // the very first win of the career — establishes the "biggest win"
    // record for the first time, so there's nothing to have broken yet
    const first = forceOpeningWin(3, [[21, 15], [21, 15], [21, 17], [21, 17]]);
    expect(first).toHaveLength(0);

    // a much bigger win margin — genuinely breaks the record just set above
    const second = forceOpeningWin(7, [[21, 2], [21, 2], [21, 2], [21, 2]]);
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ category: "record", from: "FIR Stats Bot", read: false });
    expect(second[0]!.subject).toContain("record");
    expect(second[0]!.body).toContain("New biggest win");

    // and the inbox actually carries it going forward, not just the return value
    expect(game.inbox.some((m) => m.category === "record")).toBe(true);
  });

  it("suppresses record-broken emails for the human's very first tournament, even across its later rounds", () => {
    const game = Game.newGame({ content: testContent, seed: "recmail-first" });

    /** Forces every one of the human's matches in `weekIndex`'s tournament to
     * a win by the given (escalating) margins, so a later round's "biggest
     * win" trivially beats an earlier round's — the exact shape of the "first
     * tournament ever floods the inbox with meaningless firsts" bug. Returns
     * every inbox message that landed as a result. */
    function forceFullWin(weekIndex: number, marginsSets: [number, number][][]) {
      game.registerForTournament(weekIndex);
      let guard = 0;
      while (game.weekIndex < weekIndex && guard++ < 30) game.submitWeek(WORK);
      let match: MatchState = game.enterTournament();
      const idsBefore = new Set(game.inbox.map((m) => m.id));
      let result: TournamentAdvanceResult;
      let round = 0;
      for (;;) {
        match.sets = marginsSets[round]!.map(([a, b]) => ({ a, b, done: true }));
        match.phase = "finished";
        match.winner = "a";
        result = game.resolveTournamentMatch(match);
        round++;
        if (result.status !== "nextRound") break;
        match = result.match;
      }
      const newMail = game.inbox.filter((m) => !idsBefore.has(m.id));
      game.clearConcludedTournament();
      game.submitWeek(WORK);
      return { result, newMail };
    }

    // three rounds (8-player division A), each a bigger blowout than the
    // last — every round after the first would ordinarily beat the "biggest
    // win" record just set, but this is the human's first tournament ever.
    const firstRun = forceFullWin(3, [
      [[21, 15], [21, 15], [21, 15], [21, 15]],
      [[21, 5], [21, 5], [21, 5], [21, 5]],
      [[21, 2], [21, 2], [21, 2], [21, 2]],
    ]);
    expect(firstRun.result.status).toBe("won");
    expect(firstRun.newMail.some((m) => m.category === "record")).toBe(false);

    // a second tournament, opening with a margin bigger than anything above —
    // now that the career has a real baseline, this genuinely breaks a record
    // and must email about it.
    const secondRun = forceFullWin(7, [
      [[21, 1], [21, 1], [21, 1], [21, 1]],
      [[21, 5], [21, 5], [21, 5], [21, 5]],
      [[21, 2], [21, 2], [21, 2], [21, 2]],
    ]);
    expect(secondRun.newMail.some((m) => m.category === "record")).toBe(true);
  });

  it("congratulates the human's first podium (Mom) and first title (the national federation president), each only once", () => {
    const game = Game.newGame({ content: testContent, seed: "milestone-1" });

    function forceFullWin(weekIndex: number) {
      game.registerForTournament(weekIndex);
      let guard = 0;
      while (game.weekIndex < weekIndex && guard++ < 30) game.submitWeek(WORK);
      let match: MatchState = game.enterTournament();
      const idsBefore = new Set(game.inbox.map((m) => m.id));
      let result: TournamentAdvanceResult;
      for (;;) {
        const sets: [number, number][] = [[21, 15], [21, 15], [21, 15], [21, 15]];
        match.sets = sets.map(([a, b]) => ({ a, b, done: true }));
        match.phase = "finished";
        match.winner = "a";
        result = game.resolveTournamentMatch(match);
        if (result.status !== "nextRound") break;
        match = result.match;
      }
      const newMail = game.inbox.filter((m) => !idsBefore.has(m.id));
      game.clearConcludedTournament();
      game.submitWeek(WORK);
      return newMail;
    }

    // first-ever title: also the first-ever podium, so both fire together
    const first = forceFullWin(3);
    expect(first.filter((m) => m.category === "family")).toHaveLength(1);
    expect(first.find((m) => m.category === "family")).toMatchObject({ from: "Mom", read: false });
    expect(first.filter((m) => m.category === "official")).toHaveLength(1);
    expect(first.find((m) => m.category === "official")).toMatchObject({
      from: "Sweden Federation President, Test President",
      read: false,
    });

    // a second title shouldn't re-congratulate either milestone
    const second = forceFullWin(7);
    expect(second.filter((m) => m.category === "family")).toHaveLength(0);
    expect(second.filter((m) => m.category === "official")).toHaveLength(0);
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
    const startWidth = BALANCE.opponentInfo.levelRangeStartWidth;
    if (trueLevel > 1 + startWidth && trueLevel < 20 - startWidth) {
      expect(levelMax - levelMin).toBe(2 * startWidth);
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

  it("opponentProfile surfaces another player's injury (public knowledge, unlike hidden attributes)", () => {
    const game = Game.newGame({ content: testContent, seed: "f13-injury" });
    expect(game.opponentProfile("test-m-0")!.injury).toBeNull();

    const save = game.serialize();
    save.state.players.find((p) => p.identity.id === "test-m-0")!.condition.injury = {
      catalogId: "ankle-sprain",
      kind: "injury",
      cause: "sq",
      severity: 2,
      weeksRemaining: 4,
      startWeek: save.state.calendar.weekIndex,
    };
    const injured = Game.fromSave(save, testContent);
    const profile = injured.opponentProfile("test-m-0")!;
    expect(profile.injury).not.toBeNull();
    expect(profile.injury!.label).toBe("Ankle sprain");
    expect(profile.injury!.kind).toBe("injury");
    expect(profile.injury!.weeksRemaining).toBe(4);
  });

  it("opponentProfile.recentResults carries the real weekIndex, wired to the same week the human played", () => {
    const game = Game.newGame({ content: testContent, seed: "f14-opp-week" });
    playTournamentAt(game, 3);
    const opponentId = game.recentMatches()[0]!.opponentId;

    const profile = game.opponentProfile(opponentId)!;
    expect(profile.recentResults.length).toBeGreaterThan(0);
    const entry = profile.recentResults.find((r) => r.week === 3);
    expect(entry).toBeDefined();
    expect(entry!.weekLabel).toBe(game.recentMatches()[0]!.weekLabel);
  });

  it("rejects saves from unknown versions", () => {
    const game = Game.newGame({ content: testContent, seed: "f6" });
    const save = game.serialize();
    save.saveVersion = 999;
    expect(() => Game.fromSave(save, testContent)).toThrow(/save version/i);
  });
});
