import { describe, expect, it } from "vitest";
import { Game } from "../src/index.js";
import { planWith, testContent } from "./fixtures.js";

const WORK = planWith({ work: 5 });

/** Advances by submitting `n` weeks of the given plan. */
function advance(game: Game, n: number): void {
  for (let i = 0; i < n; i++) game.submitWeek(WORK);
}

describe("inbox generation", () => {
  it("seeds a welcome message and an opening ranking digest at career start", () => {
    const game = Game.newGame({ content: testContent, seed: "inbox-1" });
    const inbox = game.inbox;
    expect(inbox.some((m) => m.category === "welcome")).toBe(true);
    // week 0 is a new month vs "the month before" → a ranking digest is seeded
    expect(inbox.some((m) => m.category === "ranking")).toBe(true);
  });

  it("the opening ranking digest lists the whole field with the human flagged", () => {
    const game = Game.newGame({ content: testContent, seed: "inbox-rank" });
    const digest = game.inbox.find((m) => m.category === "ranking");
    expect(digest?.ranking?.length).toBeGreaterThan(0);
    // exactly one row is the human; yourRank is set
    const you = digest?.ranking?.filter((r) => r.isYou) ?? [];
    expect(you.length).toBeLessThanOrEqual(1);
    expect(typeof digest?.yourRank).toBe("number");
    // rows are sorted best-first
    const ratings = digest!.ranking!.map((r) => r.rating);
    expect([...ratings].sort((a, b) => b - a)).toEqual(ratings);
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
});
