import { describe, expect, it } from "vitest";
import type { ContentBundle, RealPlayerDef } from "../src/index.js";
import { Game, generateInboxMessages, simulateMatchAuto } from "../src/index.js";
import { planWith, testContent } from "./fixtures.js";

const WORK = planWith({ work: 5 });

/** Advances by submitting `n` weeks of the given plan. */
function advance(game: Game, n: number): void {
  for (let i = 0; i < n; i++) game.submitWeek(WORK);
}

/** A handful of ranked male players on top of testContent's all-null roster
 * — the FIR ranking digest only lists players with a counted result, so
 * testing its sorting/inclusion needs *some* non-null population. Mirrors
 * division.test.ts's helper of the same shape. */
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
  }));
}

/** Registers for, advances to, and fully plays out the week-3 tournament
 * (win or lose) so the human's career.firResults gets a real entry. */
function playWeekThreeTournament(game: Game): void {
  game.registerForTournament(3);
  for (let i = 0; i < 10 && game.weekIndex !== 3; i++) game.submitWeek(WORK);
  let match = game.enterTournament();
  for (;;) {
    simulateMatchAuto(match);
    const result = game.resolveTournamentMatch(match);
    if (result.status !== "nextRound") break;
    match = result.match;
  }
  game.submitWeek(WORK);
}

describe("inbox generation", () => {
  it("seeds a welcome message and an opening ranking digest at career start", () => {
    const game = Game.newGame({ content: testContent, seed: "inbox-1" });
    const inbox = game.inbox;
    expect(inbox.some((m) => m.category === "welcome")).toBe(true);
    // week 0 is a new month vs "the month before" → a ranking digest is seeded
    expect(inbox.some((m) => m.category === "ranking")).toBe(true);
  });

  it("the opening ranking digest reports the human as unranked when nobody has FIR points on file", () => {
    // testContent's roster (and a fresh human) are all null-firPoints — the
    // real FIR World Ranking only lists players with a counted result, so an
    // opening digest legitimately has nobody on it yet.
    const game = Game.newGame({ content: testContent, seed: "inbox-rank" });
    const digest = game.inbox.find((m) => m.category === "ranking");
    expect(digest?.rankingMen).toEqual([]);
    expect(digest?.rankingWomen).toEqual([]);
    expect(digest?.yourRankMen).toBeUndefined();
    expect(digest?.yourRankWomen).toBeUndefined();
    expect(digest?.body).toMatch(/hasn't earned any counted ranking points/i);
  });

  it("lists ranked players sorted best-first by FIR points, with the human included once they've earned some", () => {
    const content: ContentBundle = { ...testContent, players: [...testContent.players, ...rankedMalePlayers(5)] };
    const game = Game.newGame({ content, seed: "inbox-rank-2" });
    playWeekThreeTournament(game);
    advance(game, 5); // reach the next calendar-month boundary for a fresh digest

    // game.inbox is already newest-first; the fallback human is male, so
    // they (and every ranked NPC here) land in rankingMen, never rankingWomen
    const digest = game.inbox.find((m) => m.category === "ranking" && m.rankingMen && m.rankingMen.length > 0);
    expect(digest).toBeTruthy();
    expect(digest?.rankingWomen).toEqual([]);
    const you = digest!.rankingMen!.filter((r) => r.isYou);
    expect(you).toHaveLength(1);
    expect(typeof digest!.yourRankMen).toBe("number");
    expect(digest!.yourRankWomen).toBeUndefined();
    // rows are sorted best (most points) first
    const points = digest!.rankingMen!.map((r) => r.points);
    expect([...points].sort((a, b) => b - a)).toEqual(points);
  });

  it("invites the human to a tournament while its entry window is open", () => {
    // testContent tournaments land on weeks 3, 7, 11; deadline is 2 weeks
    // before, invite lead 4 weeks → the week-3 event invites from week -3, so
    // it's already present at career start.
    const game = Game.newGame({ content: testContent, seed: "inbox-invite" });
    const invite = game.inbox.find(
      (m) => m.category === "invitation" && m.tournamentWeek === 3,
    );
    expect(invite).toBeTruthy();
    expect(invite?.tournamentWeek).toBe(3);
  });

  it("never sends the same invitation twice, even across many weeks", () => {
    const game = Game.newGame({ content: testContent, seed: "inbox-dedup" });
    advance(game, 12); // past all three tournament weeks
    const inviteIds = game.inbox.filter((m) => m.category === "invitation").map((m) => m.id);
    expect(new Set(inviteIds).size).toBe(inviteIds.length);
  });

  it("stops inviting once the human has registered for that tournament", () => {
    const game = Game.newGame({ content: testContent, seed: "inbox-registered" });
    // withdraw any pre-seeded state, register for week 7, then advance into
    // that tournament's invite window — no invitation should appear for it
    game.registerForTournament(7);
    advance(game, 3);
    const invitesForSeven = game.inbox.filter(
      (m) => m.category === "invitation" && m.tournamentWeek === 7,
    );
    expect(invitesForSeven).toHaveLength(0);
  });

  it("sends the registered tournament draw email on arrival week", () => {
    const game = Game.newGame({ content: testContent, seed: "inbox-draw" });
    game.registerForTournament(3);
    advance(game, 3);
    const draw = game.inbox.find((m) => m.category === "draw" && m.tournamentWeek === 3);
    expect(draw).toBeTruthy();
    expect(draw?.from).toMatch(/tournament director/i);
    expect(draw?.body).toMatch(/last training slots/i);
  });

  it("marks messages read and clears the unread count", () => {
    const game = Game.newGame({ content: testContent, seed: "inbox-read" });
    expect(game.unreadCount).toBeGreaterThan(0);
    const first = game.inbox[0]!;
    game.markInboxRead(first.id);
    expect(game.inbox.find((m) => m.id === first.id)?.read).toBe(true);
    game.markAllInboxRead();
    expect(game.unreadCount).toBe(0);
  });

  it("read state survives a save/load round-trip", () => {
    const game = Game.newGame({ content: testContent, seed: "inbox-persist" });
    game.markAllInboxRead();
    const restored = Game.fromSave(game.serialize(), testContent);
    expect(restored.unreadCount).toBe(0);
  });

  it("emits a fresh ranking digest when the calendar rolls into a new month", () => {
    const game = Game.newGame({ content: testContent, seed: "inbox-month" });
    const startDigests = game.inbox.filter((m) => m.category === "ranking").length;
    advance(game, 8); // ~two months of weeks
    const laterDigests = game.inbox.filter((m) => m.category === "ranking").length;
    expect(laterDigests).toBeGreaterThan(startDigests);
  });

  it("sends a results email the week a tournament concludes", () => {
    const game = Game.newGame({ content: testContent, seed: "inbox-result-1" });
    playWeekThreeTournament(game);
    const results = game.inbox.filter((m) => m.category === "result");
    expect(results).toHaveLength(1);
    const msg = results[0]!;
    expect(msg.week).toBe(3);
    expect(msg.from).toBe("Monthly Open");
    expect(msg.subject).toMatch(/monthly open/i);
    expect(typeof msg.resultWon).toBe("boolean");
    expect(msg.body.length).toBeGreaterThan(0);
    // the subject/icon logic depends on this matching resultWon exactly
    expect(msg.subject.includes("Champion")).toBe(msg.resultWon);
  });

  it("never sends the same tournament's results email twice, even if the week is re-scanned", () => {
    const game = Game.newGame({ content: testContent, seed: "inbox-result-2" });
    playWeekThreeTournament(game);
    const state = game.serialize().state;
    const weekThreeEvents = game.eventsForWeek(3);

    // re-run the exact same generation the InboxSystem would for week 3 —
    // the message id already exists in career.inbox, so nothing new appears
    const again = generateInboxMessages(state, testContent, 3, weekThreeEvents);
    expect(again.filter((m) => m.category === "result")).toHaveLength(0);
    expect(game.inbox.filter((m) => m.category === "result")).toHaveLength(1);
  });

  it("sends independent results emails for two different tournaments", () => {
    const game = Game.newGame({ content: testContent, seed: "inbox-result-3" });
    playWeekThreeTournament(game);
    game.registerForTournament(7);
    advance(game, 3); // reach and play through week 7's tournament
    let match = game.enterTournament();
    for (;;) {
      simulateMatchAuto(match);
      const result = game.resolveTournamentMatch(match);
      if (result.status !== "nextRound") break;
      match = result.match;
    }
    game.submitWeek(WORK);

    const results = game.inbox.filter((m) => m.category === "result");
    expect(results).toHaveLength(2);
    expect(new Set(results.map((m) => m.id)).size).toBe(2);
  });
});
