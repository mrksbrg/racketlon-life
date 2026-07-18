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
    endurance: 0.5,
    coreStrength: 0.5,
    clutch: 0.5,
    composure: 0.5,
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
  game.clearConcludedTournament();
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

  it("lists ranked players sorted best-first by FIR points, with the human's own rank always resolvable even outside the visible top N", () => {
    const content: ContentBundle = { ...testContent, players: [...testContent.players, ...rankedMalePlayers(5)] };
    const game = Game.newGame({ content, seed: "inbox-rank-2" });
    // week 3's Monday (Jan 26) is still January; week 4 (Feb 2) crosses into
    // February, so playWeekThreeTournament's own trailing submitWeek already
    // fires a fresh digest for week 4 — no extra advance needed.
    playWeekThreeTournament(game);

    const digest = game.inbox.find((m) => m.category === "ranking" && typeof m.yourRankMen === "number");
    expect(digest).toBeTruthy();
    expect(digest!.yourRankWomen).toBeUndefined();
    expect(digest!.rankingMen!.length).toBeGreaterThan(0);
    // rows are sorted best (most points) first
    const points = digest!.rankingMen!.map((r) => r.points);
    expect([...points].sort((a, b) => b - a)).toEqual(points);
    // A rookie who's just placed once at a small SAT event is realistically
    // ranked well outside the digest's visible top-`rankingTopN` rows now
    // that the whole field they played alongside also carries real FIR
    // points (see officialPointsFor's ledger fallback, and facade.ts's
    // simulateUnplayedWorldTournaments for the same-week sibling divisions)
    // — `yourRankMen` still resolves their true position regardless, the
    // same "outside" case Inbox.svelte already renders a row for.
    expect(digest!.yourRankMen).toBeGreaterThan(digest!.rankingMen!.length);
    // the week-3 event's women's SAT field is now fully simulated too,
    // earning real FIR points despite having no real-world firPoints
    // snapshot — no longer an empty list.
    expect(digest!.rankingWomen!.length).toBeGreaterThan(0);
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
    expect(draw?.body).toMatch(/seeds:/i);
    expect(draw?.body).toMatch(/you open against/i);
  });

  it("names the human's real first-round opponent in the draw email — not just a possibility", () => {
    const game = Game.newGame({ content: testContent, seed: "inbox-draw-match" });
    game.registerForTournament(3);
    advance(game, 3);
    const draw = game.inbox.find((m) => m.category === "draw" && m.tournamentWeek === 3);
    expect(draw).toBeTruthy();

    game.enterTournament();
    const round0 = game.tournamentDraw()?.[0];
    const humanMatchup = round0?.sections.flatMap((s) => s.matchups).find((m) => m.isYouA || m.isYouB);
    const opponentName = humanMatchup?.isYouA ? humanMatchup.b.name : humanMatchup?.a.name;

    expect(opponentName).toBeTruthy();
    expect(draw!.body).toContain(opponentName);
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
    game.clearConcludedTournament();
    game.submitWeek(WORK);

    const results = game.inbox.filter((m) => m.category === "result");
    expect(results).toHaveLength(2);
    expect(new Set(results.map((m) => m.id)).size).toBe(2);
  });

  it("sends a tournament-director podium announcement for a week the human never played", () => {
    const game = Game.newGame({ content: testContent, seed: "inbox-podium-1" });
    advance(game, 4); // past week 3's tournament — never registered, never entered

    const podiums = game.inbox.filter((m) => m.category === "podium" && m.week === 3);
    expect(podiums).toHaveLength(1);
    const msg = podiums[0]!;
    expect(msg.from).toBe("Monthly Open tournament director");
    expect(msg.tournamentWeek).toBe(3);
    expect(msg.podiumMen).toHaveLength(3);
    expect(msg.podiumWomen).toHaveLength(3);
    expect(new Set(msg.podiumMen!.map((r) => r.position))).toEqual(new Set([1, 2, 3]));
    expect(msg.body).toContain("Men's A");
    expect(msg.body).toContain("Women's A");
  });

  it("also sends the podium announcement for a week the human did play, alongside their personal result mail", () => {
    const game = Game.newGame({ content: testContent, seed: "inbox-podium-2" });
    playWeekThreeTournament(game);

    expect(game.inbox.filter((m) => m.category === "result" && m.week === 3)).toHaveLength(1);
    expect(game.inbox.filter((m) => m.category === "podium" && m.week === 3)).toHaveLength(1);
  });

  it("never duplicates the podium mail when the week is re-scanned", () => {
    const game = Game.newGame({ content: testContent, seed: "inbox-podium-3" });
    advance(game, 4);
    const state = game.serialize().state;
    const weekThreeEvents = game.eventsForWeek(3);

    const again = generateInboxMessages(state, testContent, 3, weekThreeEvents);
    expect(again.filter((m) => m.category === "podium")).toHaveLength(0);
    expect(game.inbox.filter((m) => m.category === "podium" && m.week === 3)).toHaveLength(1);
  });
});
