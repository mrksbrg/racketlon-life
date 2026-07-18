import { BALANCE } from "../balance.js";
import type { ContentBundle } from "../content.js";
import { monthKeyForWeek, monthLabelForWeek } from "../core/date.js";
import type { GameEvent } from "../core/events.js";
import { humanPlayer } from "../core/state.js";
import type { GameState, InboxMessage, InboxRankingRow, PersistedDrawRound, PodiumRow } from "../core/state.js";
import { fullName } from "../model/player.js";
import { SPORTS, SPORT_LABELS } from "../model/sport.js";
import type { GameSystem } from "./types.js";
import { skillCeiling } from "./effects.js";
import { firWorldRanking } from "./ranking-points.js";
import { eliminationLabel } from "./summary.js";
import { travelCost } from "./travel.js";
import type { TournamentDef } from "../tournament/engine.js";
import { humanDivisionDef, previewDraw, tournamentCalendar } from "../tournament/engine.js";

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

/** This event's "from" line — a named director when the calendar has one on
 * file (see packages/content/data/tournaments.json), else the generic role
 * label. Shared by the invitation and draw-published emails so the same
 * event always reads as coming from the same person. */
function tournamentDirectorFrom(def: TournamentDef): string {
  return def.director ? `${def.name} Tournament Director, ${def.director}` : `${def.name} tournament director`;
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
  addDrawEmails(state, content, week, add);
  addTournamentResults(state, weekEvents, add);
  addWorldTournamentResults(state, content, week, add);
  addRankingDigest(state, content, week, add);
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
    // The points figure itself is final the moment the tournament ends, but
    // it doesn't count on any official ladder yet — see
    // systems/ranking-points.ts's `publishPendingFirResults`, which folds it
    // into the real ledger only on the next calendar-month crossing. Said
    // plainly here so a player doesn't go looking for it on the Rankings
    // screen the same week and assume it's missing.
    const pointsNote =
      d.rankingPoints > 0
        ? ` That's worth ${d.rankingPoints} FIR ranking points, pending official publication next month.`
        : "";

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

/** The Final's winner/runner-up and the Bronze Medal Match's winner, scanned
 * out of a division's full round history — same shape `Draw.svelte` renders,
 * just read back out rather than displayed. `third` is only null for a
 * content gap (every real fieldSize here is ≥ 8, and the module doc comment
 * on `buildNextGroups` guarantees a genuine bronze match always gets played
 * for any field ≥ 4). Null entirely if the final hasn't actually been
 * decided — shouldn't happen for a division pulled out of a concluded
 * `completedDraws` entry, but this is read-only over persisted data that
 * could in principle be stale/partial, so it doesn't assume. */
function podiumFromRounds(
  rounds: PersistedDrawRound[],
): { first: { id: string; name: string; nationality: string }; second: { id: string; name: string; nationality: string }; third: { id: string; name: string; nationality: string } | null } | null {
  let final: PersistedDrawRound["sections"][number]["matchups"][number] | undefined;
  let bronze: PersistedDrawRound["sections"][number]["matchups"][number] | undefined;
  for (const round of rounds) {
    for (const section of round.sections) {
      if (section.roundName === "Final") final = section.matchups[0];
      if (section.roundName === "Bronze Medal Match") bronze = section.matchups[0];
    }
  }
  if (!final || final.winnerId === null) return null;
  const first = final.winnerId === final.a.id ? final.a : final.b;
  const second = final.winnerId === final.a.id ? final.b : final.a;
  const third = bronze && bronze.winnerId !== null ? (bronze.winnerId === bronze.a.id ? bronze.a : bronze.b) : null;
  return { first, second, third };
}

/**
 * A results announcement from the tournament director the moment an event
 * concludes — reporting the men's and women's A-division podiums, *whether
 * or not the human played in either* (unlike `addTournamentResults`, which
 * is the human's own personal placement note). Reads `career.completedDraws`
 * rather than the event log, since a division the human never entered
 * produces no log events at all — see `facade.ts`'s
 * `simulateUnplayedWorldTournaments`, which guarantees every scheduled
 * division for `week` is already in `completedDraws` by the time
 * `InboxSystem` runs. Fires once per event (dedup on `eventId`, shared by
 * every division of the same event), not once per division.
 */
function addWorldTournamentResults(
  state: GameState,
  content: ContentBundle,
  week: number,
  add: (m: InboxMessage) => void,
): void {
  const draw = state.career.completedDraws[week];
  if (!draw) return;
  const primary = content.tournaments[draw.tournamentId];
  if (!primary) return;

  const roundsFor = (tournamentId: string): PersistedDrawRound[] | null =>
    tournamentId === draw.tournamentId
      ? draw.rounds
      : (draw.otherDivisions.find((o) => o.tournamentId === tournamentId)?.rounds ?? null);

  const allIds = [draw.tournamentId, ...draw.otherDivisions.map((o) => o.tournamentId)];
  const podiumFor = (gender: "m" | "f"): PodiumRow[] | undefined => {
    const def = allIds
      .map((id) => content.tournaments[id])
      .find((d): d is TournamentDef => !!d && d.gender === gender && d.division === "A");
    if (!def) return undefined;
    const rounds = roundsFor(def.id);
    if (!rounds) return undefined;
    const podium = podiumFromRounds(rounds);
    if (!podium) return undefined;
    const rows: PodiumRow[] = [
      { position: 1, playerId: podium.first.id, name: podium.first.name, nationality: podium.first.nationality },
      { position: 2, playerId: podium.second.id, name: podium.second.name, nationality: podium.second.nationality },
    ];
    if (podium.third) {
      rows.push({ position: 3, playerId: podium.third.id, name: podium.third.name, nationality: podium.third.nationality });
    }
    return rows;
  };

  const podiumMen = podiumFor("m");
  const podiumWomen = podiumFor("f");
  if (!podiumMen && !podiumWomen) return;

  const summarize = (rows: PodiumRow[] | undefined) => (rows ? rows.map((r) => `${r.position}) ${r.name}`).join(", ") : null);
  const menLine = summarize(podiumMen);
  const womenLine = summarize(podiumWomen);

  add({
    id: `podium:${week}:${primary.eventId}`,
    week,
    category: "podium",
    from: tournamentDirectorFrom(primary),
    subject: `🏆 Results: ${primary.name}`,
    body:
      `The results are in from ${primary.city}. ` +
      (menLine ? `Men's A: ${menLine}. ` : "") +
      (womenLine ? `Women's A: ${womenLine}. ` : "") +
      `Full draws are up — check them out.`,
    read: false,
    tournamentWeek: week,
    podiumMen,
    podiumWomen,
  });
}

function addDrawEmails(
  state: GameState,
  content: ContentBundle,
  week: number,
  add: (m: InboxMessage) => void,
): void {
  const entry = state.career.tournamentEntries.find((e) => e.weekIndex === week);
  if (!entry) return;
  const def = content.tournaments[entry.tournamentId];
  if (!def) return;

  const { seeds, humanOpponent } = previewDraw(state, def, week, content);
  const seedNote = seeds.length > 0
    ? ` Seeds: ${seeds.map((s) => `${s.seed}) ${s.name}`).join(", ")}.`
    : "";
  const opponentNote = humanOpponent
    ? ` You open against ${humanOpponent.name}${humanOpponent.seed ? ` (seed ${humanOpponent.seed})` : ""}.`
    : "";

  add({
    id: `draw:${week}:${def.id}`,
    week,
    category: "draw",
    from: tournamentDirectorFrom(def),
    subject: `Draws published: ${def.name}`,
    body:
      `The ${def.name} Division ${def.division} draw is out for ${def.city}.` +
      seedNote +
      opponentNote +
      ` Full bracket's live on the Tour — check it before you play.`,
    read: false,
    tournamentWeek: week,
  });
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
      from: tournamentDirectorFrom(def),
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
function addRankingDigest(state: GameState, content: ContentBundle, week: number, add: (m: InboxMessage) => void): void {
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
    from: `${content.firOfficials.rankingsOfficer?.role ?? "FIR Rankings Officer"}, ${content.firOfficials.rankingsOfficer?.name ?? "James Pope"}`,
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
