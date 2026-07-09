import { BALANCE } from "../balance.js";
import type { ContentBundle } from "../content.js";
import { monthKeyForWeek, monthLabelForWeek } from "../core/date.js";
import { humanPlayer } from "../core/state.js";
import type { GameState, InboxMessage, InboxRankingRow } from "../core/state.js";
import { fullName } from "../model/player.js";
import type { GameSystem } from "./types.js";
import { worldRanking } from "./ranking.js";
import { travelCost } from "./travel.js";
import { tournamentCalendar } from "../tournament/engine.js";

/**
 * The diegetic "living world" feed (docs/07's Inbox). A Story-type system: it
 * only reads game state + the calendar and appends messages to `career.inbox`
 * (the offers/story surface) — it never touches skills, money, or ratings.
 *
 * Two message kinds for now, both deterministic from world state so they're
 * replay-stable and dedup by a fixed id:
 *  - tournament invitations, `inviteLeadWeeks` before each entry deadline;
 *  - a monthly world-ranking digest, on each calendar-month boundary.
 * Extending the living world = adding another case to `collectMessages`.
 */
export const InboxSystem: GameSystem = {
  id: "inbox",
  run(ctx) {
    const fresh = generateInboxMessages(ctx.state, ctx.content, ctx.state.calendar.weekIndex);
    ctx.state.career.inbox.push(...fresh);
  },
};

function eur(amount: number): string {
  return `€${Math.round(amount).toLocaleString("en-US")}`;
}

/**
 * The new inbox messages due at `week`, excluding any whose id already exists
 * (so re-running a week, or seeding week 0 at career start, never duplicates).
 * Pure — the caller appends the result.
 */
export function generateInboxMessages(
  state: GameState,
  content: ContentBundle,
  week: number,
): InboxMessage[] {
  const existing = new Set(state.career.inbox.map((m) => m.id));
  const out: InboxMessage[] = [];
  const add = (m: InboxMessage) => {
    if (!existing.has(m.id)) {
      existing.add(m.id);
      out.push(m);
    }
  };

  addInvitations(state, content, week, add);
  addRankingDigest(state, week, add);
  return out;
}

function addInvitations(
  state: GameState,
  content: ContentBundle,
  week: number,
  add: (m: InboxMessage) => void,
): void {
  const deadlineWeeks = BALANCE.tournament.entryDeadlineWeeks;
  const lead = BALANCE.inbox.inviteLeadWeeks;
  const homeCountry = humanPlayer(state).identity.nationality;
  for (const [tournamentWeek, def] of tournamentCalendar(content)) {
    const deadlineWeek = tournamentWeek - deadlineWeeks;
    const inviteWeek = deadlineWeek - lead;
    // in the invitation window (arrived, deadline not yet passed)…
    if (week < inviteWeek || week > deadlineWeek) continue;
    // …and not already committed to
    const registered = state.career.tournamentEntries.some(
      (e) => e.weekIndex === tournamentWeek && e.tournamentId === def.id,
    );
    if (registered) continue;

    const winnerPrize = def.prizeByRoundsWon[def.prizeByRoundsWon.length - 1] ?? 0;
    const travel = travelCost(homeCountry, def, content);
    const travelNote = travel.total > 0 ? ` Budget another ${eur(travel.total)} or so for flights and a hotel.` : "";
    add({
      id: `invite:${def.id}`,
      week,
      category: "invitation",
      from: "FIR World Tour",
      subject: `Entry open: ${def.name}`,
      body:
        `You're invited to the ${def.tier} ${def.name} in ${def.city} on ${def.date}. ` +
        `Entry is ${eur(def.entryFee)} with ${eur(winnerPrize)} to the champion of a ` +
        `${def.fieldSize}-player draw. Register on the Tour by week ${deadlineWeek + 1} — ` +
        `entry closes after that.${travelNote}`,
      read: false,
      tournamentWeek,
    });
  }
}

function addRankingDigest(state: GameState, week: number, add: (m: InboxMessage) => void): void {
  // fire on a calendar-month boundary (and at week 0, whose "previous" month
  // differs) — the dedup id keeps it to one digest per month
  if (monthKeyForWeek(state.calendar, week) === monthKeyForWeek(state.calendar, week - 1)) return;

  const standings = worldRanking(state);
  const topN = BALANCE.inbox.rankingTopN;
  const humanId = state.career.playerId;
  const rows: InboxRankingRow[] = standings.slice(0, topN).map((s) => ({
    rank: s.rank,
    name: s.name,
    nationality: s.nationality,
    rating: s.rating,
    isYou: s.playerId === humanId,
  }));
  const you = standings.find((s) => s.playerId === humanId);
  const monthLabel = monthLabelForWeek(state.calendar, week);
  const human = state.players.find((p) => p.identity.id === humanId);
  const youName = human ? fullName(human) : "You";

  add({
    id: `ranking:${monthKeyForWeek(state.calendar, week)}`,
    week,
    category: "ranking",
    from: "Racketlon Rankings",
    subject: `${monthLabel} world ranking`,
    body: you
      ? `The ${monthLabel} combined ranking is out. ${youName} sits at #${you.rank} of ${standings.length}, rated ${you.rating}.`
      : `The ${monthLabel} combined ranking is out.`,
    read: false,
    ranking: rows,
    yourRank: you?.rank,
  });
}
