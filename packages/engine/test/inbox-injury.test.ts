import { describe, expect, it } from "vitest";
import type { EventLog } from "../src/index.js";
import { BALANCE, Game, generateInboxMessages } from "../src/index.js";
import { testContent } from "./fixtures.js";

function injuryEvent(
  subject: string,
  overrides: Partial<{ catalogId: string; kind: "injury" | "illness"; severity: number; weeksRemaining: number }> = {},
): EventLog[number] {
  return {
    week: 3,
    type: "injury.occurred",
    subject,
    data: { catalogId: "ankle-sprain", kind: "injury", severity: 2, weeksRemaining: 3, ...overrides },
  };
}

describe("addInjuryNews (inbox)", () => {
  it("reports a top-10 player's injury when they're out for more than a month", () => {
    const game = Game.newGame({ content: testContent, seed: "inbox-injury-top10" });
    const state = game.serialize().state;
    const other = state.players.find((p) => p.identity.id !== state.career.playerId)!;
    other.firPoints = 9999; // guarantees top-10 (unique, high real-world snapshot)

    const messages = generateInboxMessages(
      state,
      testContent,
      3,
      [injuryEvent(other.identity.id, { weeksRemaining: BALANCE.inbox.injuryNewsMinWeeks + 1 })],
    );
    const news = messages.find((m) => m.category === "injury" && m.relatedPlayerId === other.identity.id);
    expect(news).toBeDefined();
    expect(news!.body).toContain("ankle sprain");
  });

  it("does not report a top-10 player's short-duration injury (not worth a headline)", () => {
    const game = Game.newGame({ content: testContent, seed: "inbox-injury-top10-short" });
    const state = game.serialize().state;
    const other = state.players.find((p) => p.identity.id !== state.career.playerId)!;
    other.firPoints = 9999; // top-10

    const messages = generateInboxMessages(
      state,
      testContent,
      3,
      [injuryEvent(other.identity.id, { weeksRemaining: BALANCE.inbox.injuryNewsMinWeeks })],
    );
    expect(messages.some((m) => m.category === "injury")).toBe(false);
  });

  it("does not report a non-top-10, non-rare injury", () => {
    const game = Game.newGame({ content: testContent, seed: "inbox-injury-none" });
    const state = game.serialize().state;
    const other = state.players.find((p) => p.identity.id !== state.career.playerId)!;
    // unremarkable: no firPoints (not top-10), no Race points, common injury
    other.firPoints = null;

    const messages = generateInboxMessages(state, testContent, 3, [injuryEvent(other.identity.id)]);
    expect(messages.some((m) => m.category === "injury")).toBe(false);
  });

  it("reports a rare injury for a player active on this year's Race, even outside top 10", () => {
    const game = Game.newGame({ content: testContent, seed: "inbox-injury-rare" });
    const state = game.serialize().state;
    const other = state.players.find((p) => p.identity.id !== state.career.playerId)!;
    other.firPoints = null; // not top-10
    other.firResults.push({ weekIndex: state.calendar.weekIndex, tournamentId: "test-event", tier: "SAT", points: 100 });

    const messages = generateInboxMessages(
      state,
      testContent,
      3,
      [injuryEvent(other.identity.id, { catalogId: "achilles-rupture", severity: 3, weeksRemaining: 6 })],
    );
    const news = messages.find((m) => m.category === "injury" && m.relatedPlayerId === other.identity.id);
    expect(news).toBeDefined();
    expect(news!.subject.toLowerCase()).toContain("achilles rupture");
  });

  it("does not report a rare injury for a player with no Race points this year", () => {
    const game = Game.newGame({ content: testContent, seed: "inbox-injury-rare-inactive" });
    const state = game.serialize().state;
    const other = state.players.find((p) => p.identity.id !== state.career.playerId)!;
    other.firPoints = null;
    // no firResults pushed — zero Race points this year

    const messages = generateInboxMessages(
      state,
      testContent,
      3,
      [injuryEvent(other.identity.id, { catalogId: "achilles-rupture", severity: 3, weeksRemaining: 6 })],
    );
    expect(messages.some((m) => m.category === "injury")).toBe(false);
  });

  it("never reports the human's own injury (already visible via StatusBar)", () => {
    const game = Game.newGame({ content: testContent, seed: "inbox-injury-self" });
    const state = game.serialize().state;
    const human = state.players.find((p) => p.identity.id === state.career.playerId)!;
    human.firPoints = 9999; // would be top-10 if this weren't the human

    const messages = generateInboxMessages(state, testContent, 3, [injuryEvent(human.identity.id)]);
    expect(messages.some((m) => m.category === "injury")).toBe(false);
  });

  it("dedupes to one message even if a player somehow qualifies via both triggers", () => {
    const game = Game.newGame({ content: testContent, seed: "inbox-injury-dedupe" });
    const state = game.serialize().state;
    const other = state.players.find((p) => p.identity.id !== state.career.playerId)!;
    other.firPoints = 9999; // top-10
    other.firResults.push({ weekIndex: state.calendar.weekIndex, tournamentId: "test-event", tier: "SAT", points: 100 }); // also Race-active

    const messages = generateInboxMessages(
      state,
      testContent,
      3,
      [injuryEvent(other.identity.id, { catalogId: "achilles-rupture", severity: 3, weeksRemaining: 6 })],
    );
    expect(messages.filter((m) => m.category === "injury" && m.relatedPlayerId === other.identity.id)).toHaveLength(1);
  });
});
