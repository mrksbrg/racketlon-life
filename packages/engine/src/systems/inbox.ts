import { BALANCE } from "../balance.js";
import type { ContentBundle } from "../content.js";
import { monthKeyForWeek, monthLabelForWeek } from "../core/date.js";
import type { GameEvent } from "../core/events.js";
import { humanPlayer } from "../core/state.js";
import type { GameState, InboxMessage, InboxRankingRow } from "../core/state.js";
import { fullName } from "../model/player.js";
import { SPORTS, SPORT_LABELS } from "../model/sport.js";
import type { GameSystem } from "./types.js";
import { skillCeiling } from "./effects.js";
import { firWorldRanking } from "./ranking-points.js";
import { eliminationLabel } from "./summary.js";
import { travelCost } from "./travel.js";
import { humanDivisionDef, tournamentCalendar } from "../tournament/engine.js";

/**
 * The diegetic "living world" feed (docs/07's Inbox). A Story-type system: it
 * only reads game state + the calendar and appends messages to `career.inbox`
 * (the offers/story surface) — it never touches skills, money, or ratings.
 *
 * Three message kinds, all deterministic from world state (or, for results,
 * from this week's event log) so they're replay-stable and dedup by a fixed
 * id:
 *  - tournament invitations, `inviteLeadWeeks` before each entry deadline;
 *  - a results email the moment a tournament the human played concludes;
 *  - a monthly world-ranking digest, on each calendar-month boundary.
 * Extending the living world = adding another case to `collectMessages`.
 */
export const InboxSystem: GameSystem = {
  id: "inbox",
  run(ctx) {
    const fresh = generateInboxMessages(ctx.state, ctx.content, ctx.state.calendar.weekIndex, ctx.log.thisWeek());
    ctx.state.career.inbox.push(...fresh);
  },
};

function eur(amount: number): string {
  return `€${Math.round(amount).toLocaleString("en-US")}`;
}

/**
 * The new inbox messages due at `week`, excluding any whose id already exists
 * (so re-running a week, or seeding week 0 at career start, never duplicates).
 * Pure — the caller appends the result. `weekEvents` is this week's slice of
 * the event log (results are mined from it, same as the weekly summary).
 */
export function generateInboxMessages(
  state: GameState,
  content: ContentBundle,
  week: number,
  weekEvents: readonly GameEvent[] = [],
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
  addTournamentResults(state, weekEvents, add);
  addRankingDigest(state, week, add);
  addPotentialClues(state, week, add);
  return out;
}

/**
 * Vague "coach's eye" hints at the hidden per-sport potential ceiling
 * (`PlayerAttributes.potential`) — never the number itself, just a read on
 * how much room is left in a sport the human has actually been working on.
 * Fires once per sport per band, in order (a sport can't skip straight to
 * "nearing it" without passing through "coming together"), so it always
 * reads as a coach who's been watching you train, not a stat reveal.
 */
const CLUE_BANDS: readonly { id: string; ratio: number; body: (sport: string) => string }[] = [
  {
    id: "growing",
    ratio: 0.5,
    body: (sport) => `Your ${sport} has come on well — plenty of room left to grow, if you keep at it.`,
  },
  {
    id: "nearing",
    ratio: 0.85,
    body: (sport) =>
      `You might be nearing what your body and technique will let you do in ${sport} — but every player's different, so who knows.`,
  },
];

function addPotentialClues(state: GameState, week: number, add: (m: InboxMessage) => void): void {
  const human = humanPlayer(state);
  for (const sport of SPORTS) {
    const ceiling = skillCeiling(human.attributes.potential[sport]);
    const ratio = human.attributes.skills[sport] / ceiling;
    for (const band of CLUE_BANDS) {
      if (ratio < band.ratio) continue;
      add({
        id: `clue:${sport}:${band.id}`,
        week,
        category: "coach",
        from: "Your coach",
        subject: `A word about your ${SPORT_LABELS[sport]}`,
        body: band.body(SPORT_LABELS[sport].toLowerCase()),
        read: false,
      });
    }
  }
}

/**
 * A results email the moment a tournament the human played concludes — mined
 * from this week's event log (`tournament.won`/`tournament.eliminated`,
 * pushed by tournament/engine.ts's `concludeTournament`), same source as the
 * weekly summary's note but as a persistent, re-readable message. Shares
 * `eliminationLabel` with the summary so the phrasing matches exactly.
 */
function addTournamentResults(state: GameState, weekEvents: readonly GameEvent[], add: (m: InboxMessage) => void): void {
  const humanId = state.career.playerId;
  for (const e of weekEvents) {
    if (e.subject !== humanId) continue;
    if (e.type !== "tournament.won" && e.type !== "tournament.eliminated") continue;
    const d = e.data as {
      name: string;
      tournamentId: string;
      prizeMoney: number;
      finishingPosition: number;
      rankingPoints: number;
      tiedCount: number;
    };
    const won = e.type === "tournament.won";
    const place = won ? "Champion" : eliminationLabel(d.finishingPosition, d.tiedCount);
    const prizeNote = d.prizeMoney > 0 ? ` You collected ${eur(d.prizeMoney)} in prize money.` : "";
    const pointsNote = d.rankingPoints > 0 ? ` That's worth ${d.rankingPoints} FIR ranking points.` : "";

    add({
      id: `result:${e.week}:${d.tournamentId}`,
      week: e.week,
      category: "result",
      from: d.name,
      subject: won ? `🏆 Champion at the ${d.name}!` : `${place} at the ${d.name}`,
      body: won
        ? `What a run — you're the ${d.name} champion!${prizeNote}${pointsNote}`
        : `${place} at the ${d.name}.${prizeNote}${pointsNote}`,
      read: false,
      resultWon: won,
    });
  }
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
  for (const [tournamentWeek, defs] of tournamentCalendar(content)) {
    const def = humanDivisionDef(state, defs);
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
        `You're invited to the ${def.tier} ${def.name} in ${def.city} on ${def.date} — ` +
        `Division ${def.division}. Entry is ${eur(def.entryFee)} with ${eur(winnerPrize)} ` +
        `to the champion of a ${def.fieldSize}-player draw. Register on the Tour by week ` +
        `${deadlineWeek + 1} — entry closes after that.${travelNote}`,
      read: false,
      tournamentWeek,
    });
  }
}

/**
 * Official FIR communication is always framed around the real FIR World
 * Ranking (points), never the Glicko rating shown elsewhere to describe a
 * player's relative strength — see `firWorldRanking`'s doc comment. FIR
 * keeps entirely separate men's and women's rankings, so the digest reports
 * both top-N lists rather than one mixed one.
 */
function addRankingDigest(state: GameState, week: number, add: (m: InboxMessage) => void): void {
  // fire on a calendar-month boundary (and at week 0, whose "previous" month
  // differs) — the dedup id keeps it to one digest per month
  if (monthKeyForWeek(state.calendar, week) === monthKeyForWeek(state.calendar, week - 1)) return;

  const topN = BALANCE.inbox.rankingTopN;
  const humanId = state.career.playerId;
  const human = state.players.find((p) => p.identity.id === humanId);
  const youName = human ? fullName(human) : "You";

  const menStandings = firWorldRanking(state, "m");
  const womenStandings = firWorldRanking(state, "f");
  const toRows = (standings: ReturnType<typeof firWorldRanking>): InboxRankingRow[] =>
    standings.slice(0, topN).map((s) => ({
      rank: s.rank,
      playerId: s.playerId,
      name: s.name,
      nationality: s.nationality,
      points: s.points,
      isYou: s.playerId === humanId,
    }));

  // the human only ever appears in their own gender's standings
  const isWoman = human?.identity.gender === "f";
  const ownStandings = isWoman ? womenStandings : menStandings;
  const you = ownStandings.find((s) => s.playerId === humanId);
  const monthLabel = monthLabelForWeek(state.calendar, week);

  add({
    id: `ranking:${monthKeyForWeek(state.calendar, week)}`,
    week,
    category: "ranking",
    from: "FIR World Ranking",
    subject: `${monthLabel} FIR world ranking`,
    body: you
      ? `The ${monthLabel} FIR World Ranking is out. ${youName} sits at #${you.rank} of ${ownStandings.length}, with ${you.points} points.`
      : `The ${monthLabel} FIR World Ranking is out. ${youName} hasn't earned any counted ranking points yet — enter and place in a FIR tournament to appear on it.`,
    read: false,
    rankingMen: toRows(menStandings),
    rankingWomen: toRows(womenStandings),
    yourRankMen: isWoman ? undefined : you?.rank,
    yourRankWomen: isWoman ? you?.rank : undefined,
  });
}
