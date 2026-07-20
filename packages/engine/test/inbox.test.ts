import { describe, expect, it } from "vitest";
import type { ContentBundle, RealPlayerDef, Sport } from "../src/index.js";
import { BALANCE, Game, emptyPlan, generateInboxMessages, humanPlayer, simulateMatchAuto } from "../src/index.js";
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

/** Advances a week at a time until the first decision event appears (the
 * pity timer guarantees this within `pityWeeks + 1` weeks), stopping
 * immediately so callers can still act on it inside its own answer window —
 * unlike a fixed `advance(game, pityWeeks + 1)`, which by definition already
 * runs right up to (or past) that very first offer's own expiry. */
function advanceUntilDecision(game: Game, plan = WORK): void {
  let guard = 0;
  while (!game.inbox.some((m) => m.category === "decision") && guard++ < 20) {
    game.submitWeek(plan);
  }
}

describe("decision events", () => {
  it("fires at least one decision event within the pity window, offering 2+ real choices with a deadline", () => {
    const game = Game.newGame({ content: testContent, seed: "decision-pity" });
    advanceUntilDecision(game);
    const msg = game.inbox.find((m) => m.category === "decision");
    expect(msg).toBeTruthy();
    expect(msg!.week).toBeLessThanOrEqual(BALANCE.events.pityWeeks);
    expect(msg!.choices?.length).toBeGreaterThanOrEqual(2);
    expect(msg!.expiresWeekIndex).toBe(msg!.week + BALANCE.events.answerWindowWeeks);
    expect(msg!.resolvedChoiceId).toBeUndefined();
    expect(msg!.read).toBe(false);
  });

  it("the sparring invite names a same-nationality partner, links their profile, and mentions they're in town", () => {
    // a fresh career's first weeks have no fatigue/money-tightness/training-
    // wear/tournament-win triggers active yet, so sparring-invite (always
    // eligible) is deterministically the only candidate — see the cooldown
    // test below for the same assumption.
    const game = Game.newGame({ content: testContent, seed: "decision-partner" });
    advanceUntilDecision(game);
    const msg = game.inbox.find((m) => m.category === "decision")!;
    expect(msg.id).toMatch(/^decision:sparring-invite:/);
    expect(msg.relatedPlayerId).toBeTruthy();
    expect(msg.body).toMatch(/in town this week/i);

    const partner = testContent.players.find((p) => p.playerId === msg.relatedPlayerId)!;
    expect(partner).toBeTruthy();
    expect(partner.nationality).toBe("SE"); // the default fallback human's own nationality
    expect(msg.from).toBe(`${partner.firstName} ${partner.lastName}`);
  });

  it("accepting the sparring invite reserves an evening slot matching exactly what the invite proposed", () => {
    const game = Game.newGame({ content: testContent, seed: "decision-reserve" });
    advanceUntilDecision(game);
    const msg = game.inbox.find((m) => m.category === "decision")!;
    expect(msg.id).toMatch(/^decision:sparring-invite:/);
    const accept = msg.choices!.find((c) => c.id === "accept")!;
    const proposed = accept.effect.reserveSlot!;
    expect(proposed.slotIndex % 3).toBe(2); // always an Evening period

    expect(game.reservedSlotsThisWeek()).toHaveLength(0); // nothing committed until chosen
    game.chooseInboxOption(msg.id, accept.id);

    const reserved = game.reservedSlotsThisWeek();
    expect(reserved).toHaveLength(1);
    expect(reserved[0]!.slotIndex).toBe(proposed.slotIndex);
    expect(reserved[0]!.activity).toBe(proposed.activity);
  });

  it("the sparring invite's day is randomized but weekday-biased, and the body always names the exact day", () => {
    // sweep many seeds to observe both weekday and weekend proposals, and
    // confirm the body text's day name always matches the reserved slot —
    // the whole point of resolving the day once at build time.
    const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    let weekdayCount = 0;
    let weekendCount = 0;
    for (let i = 0; i < 30; i++) {
      const game = Game.newGame({ content: testContent, seed: `decision-day-${i}` });
      advanceUntilDecision(game);
      const msg = game.inbox.find((m) => m.category === "decision" && m.id.startsWith("decision:sparring-invite:"));
      if (!msg) continue; // pity could have picked a different eligible event on some seeds
      const accept = msg.choices!.find((c) => c.id === "accept")!;
      const day = Math.floor(accept.effect.reserveSlot!.slotIndex / 3);
      expect(msg.body).toContain(`free ${DAY_NAMES[day]} evening`);
      expect(accept.hint).toContain(`blocks ${DAY_NAMES[day]} evening`);
      if (day < 5) weekdayCount++;
      else weekendCount++;
    }
    expect(weekdayCount).toBeGreaterThan(0);
    expect(weekendCount).toBeGreaterThan(0);
    expect(weekdayCount).toBeGreaterThan(weekendCount); // weekday-biased, not 50/50
  });

  it("declining the sparring invite reserves nothing", () => {
    const game = Game.newGame({ content: testContent, seed: "decision-reserve-decline" });
    advanceUntilDecision(game);
    const msg = game.inbox.find((m) => m.category === "decision")!;
    const decline = msg.choices!.find((c) => c.id === "decline")!;

    game.chooseInboxOption(msg.id, decline.id);

    expect(game.reservedSlotsThisWeek()).toHaveLength(0);
  });

  it("the reserved slot runs through the real training pipeline — its own session gain adds on top of the decision's flat bonus, not instead of it", () => {
    const game = Game.newGame({ content: testContent, seed: "decision-reserve-apply" });
    advanceUntilDecision(game);
    const msg = game.inbox.find((m) => m.category === "decision")!;
    const accept = msg.choices!.find((c) => c.id === "accept")!;
    const sport = Object.keys(accept.effect.skill ?? {})[0] as Sport;
    const activity = accept.effect.reserveSlot!.activity;
    const bonus = accept.effect.skill![sport]!;

    game.chooseInboxOption(msg.id, accept.id);
    const reserved = game.reservedSlotsThisWeek()[0]!;
    const beforeSkill = humanPlayer(game.serialize().state).attributes.skills[sport];

    // mimic what the client's store.availableSlots() forces into the plan
    // before submitting: the reserved slot's activity, everything else free.
    const slots = emptyPlan().slots;
    slots[reserved.slotIndex] = activity;
    game.submitWeek({ slots });

    const afterSkill = humanPlayer(game.serialize().state).attributes.skills[sport];
    // strictly more than the flat bonus alone proves TrainingSystem actually
    // ran a real session on that forced slot, on top of the decision's own
    // bump — this is what makes it "a better session than normal," not just
    // a free-floating stat grant outside the 21-slot budget.
    expect(afterSkill - beforeSkill).toBeGreaterThan(bonus);
  });

  it("the sparring invite never picks a partner from a different nationality than the human", () => {
    // testContent's own roster is uniformly SE (same as the default fallback
    // human), which would pass trivially — mix in a same-gender foreign pool
    // so the nationality filter actually has something to exclude.
    const foreignPool: RealPlayerDef[] = Array.from({ length: 40 }, (_, i) => ({
      playerId: `foreign-no-${i}`,
      firstName: "Foreign",
      lastName: `NO${i}`,
      nationality: "NO",
      gender: "m" as const,
      birthYear: 1995,
      ratings: { tt: { skill: 500, rdSkill: 60 }, bd: { skill: 500, rdSkill: 60 }, sq: { skill: 500, rdSkill: 60 }, tn: { skill: 500, rdSkill: 60 } },
      firPoints: null,
      endurance: 0.5,
      coreStrength: 0.5,
      clutch: 0.5,
      composure: 0.5,
    }));
    const content: ContentBundle = { ...testContent, players: [...testContent.players, ...foreignPool] };
    const game = Game.newGame({ content, seed: "decision-nationality" });
    advance(game, 40);

    const sparringInvites = game.inbox.filter((m) => m.id.startsWith("decision:sparring-invite:"));
    expect(sparringInvites.length).toBeGreaterThan(0);
    const nationalityById = new Map(content.players.map((p) => [p.playerId, p.nationality]));
    for (const msg of sparringInvites) {
      expect(nationalityById.get(msg.relatedPlayerId!)).toBe("SE");
    }
  });

  it("never fires the same specific event again within its own cooldown, even while its trigger stays true", () => {
    // WORK-only weeks keep sparring-invite's always-true trigger the only
    // realistically eligible one, so every firing across a long stretch
    // should be that same event id — cooldown should space them out.
    const game = Game.newGame({ content: testContent, seed: "decision-cooldown" });
    advance(game, 30);
    const decisionWeeks = game.inbox
      .filter((m) => m.category === "decision" && m.id.startsWith("decision:sparring-invite:"))
      .map((m) => m.week)
      .sort((a, b) => a - b);
    expect(decisionWeeks.length).toBeGreaterThan(1);
    for (let i = 1; i < decisionWeeks.length; i++) {
      expect(decisionWeeks[i]! - decisionWeeks[i - 1]!).toBeGreaterThanOrEqual(BALANCE.events.eventCooldownWeeks);
    }
  });

  it("chooseInboxOption queues the pick, applies nothing immediately, then the next submitted week's summary reports exactly that effect's note", () => {
    // Money is asserted precisely here since it's unclamped; fatigue/form/
    // soreness/confidence all clamp to a bounded range, which can silently
    // wash out a small delta against a saturated baseline after many weeks
    // of advancing — see test/decision.test.ts for those, exercised directly
    // against DecisionSystem rather than through the full weekly pipeline.
    const game = Game.newGame({ content: testContent, seed: "decision-apply" });
    advanceUntilDecision(game);
    const msg = game.inbox.find((m) => m.category === "decision")!;
    const choice = msg.choices![0]!;

    // serialize() twice, not once — it's the deep clone (a JSON round-trip);
    // fromSave() itself doesn't clone, so reusing one snapshot object across
    // two fromSave() calls would leave `control`/`treatment` sharing the
    // exact same underlying state (and pendingEffects array).
    const control = Game.fromSave(game.serialize(), testContent);
    const treatment = Game.fromSave(game.serialize(), testContent);

    treatment.chooseInboxOption(msg.id, choice.id);
    // resolved and queued, but not yet applied to any stat
    expect(treatment.inbox.find((m) => m.id === msg.id)?.resolvedChoiceId).toBe(choice.id);
    expect(treatment.you!.money).toBe(control.you!.money);

    const controlSummary = control.submitWeek(WORK);
    const treatmentSummary = treatment.submitWeek(WORK);

    expect(treatmentSummary.notes).toContain(choice.effect.note);
    expect(controlSummary.notes).not.toContain(choice.effect.note);
    if (choice.effect.money) expect(treatment.you!.money - control.you!.money).toBeCloseTo(choice.effect.money, 5);
  });

  it("chooseInboxOption is a no-op once the offer has expired", () => {
    const game = Game.newGame({ content: testContent, seed: "decision-expire" });
    advanceUntilDecision(game);
    const msg = game.inbox.find((m) => m.category === "decision")!;
    while (game.weekIndex <= msg.expiresWeekIndex!) game.submitWeek(WORK); // step past its own deadline
    const moneyBefore = game.you!.money;

    game.chooseInboxOption(msg.id, msg.choices![0]!.id);
    expect(game.inbox.find((m) => m.id === msg.id)?.resolvedChoiceId).toBeUndefined();
    expect(game.you!.money).toBe(moneyBefore);
    expect(game.serialize().state.career.pendingEffects).toHaveLength(0);
  });

  it("chooseInboxOption only ever applies the first pick — a second call on the same message is ignored", () => {
    const game = Game.newGame({ content: testContent, seed: "decision-idempotent" });
    advanceUntilDecision(game);
    const msg = game.inbox.find((m) => m.category === "decision")!;
    const [first, second] = msg.choices!;

    game.chooseInboxOption(msg.id, first!.id);
    game.chooseInboxOption(msg.id, second!.id);

    expect(game.inbox.find((m) => m.id === msg.id)?.resolvedChoiceId).toBe(first!.id);
    expect(game.serialize().state.career.pendingEffects).toHaveLength(1);
  });
});
