import { BALANCE } from "../balance.js";
import type { ContentBundle } from "../content.js";
import { monthKeyForWeek, monthLabelForWeek } from "../core/date.js";
import type { Calendar } from "../core/date.js";
import type { GameEvent } from "../core/events.js";
import type { Rng } from "../core/rng.js";
import { humanPlayer } from "../core/state.js";
import type { GameState, InboxChoice, InboxMessage, InboxRankingRow, PersistedDrawRound, PodiumRow } from "../core/state.js";
import type { ActivityType } from "../model/activity.js";
import { slotIndex } from "../model/plan.js";
import { fullName } from "../model/player.js";
import type { FirResult, Player } from "../model/player.js";
import type { Sport } from "../model/sport.js";
import { SPORTS, SPORT_LABELS } from "../model/sport.js";
import type { GameSystem } from "./types.js";
import { skillCeiling } from "./effects.js";
import { combinedRating } from "./ranking.js";
import { firRacePointsTotal, firWorldRanking } from "./ranking-points.js";
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
    const fresh = generateInboxMessages(ctx.state, ctx.content, ctx.state.calendar.weekIndex, ctx.log.thisWeek(), ctx.rng);
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
 * `rng`, when supplied, also draws at most one decision event (see
 * `addDecisionEvent`) — omitted by the two call sites that generate messages
 * outside the weekly systems pipeline (world-creation seeding, and
 * `simulateWeek`'s next-week pre-population), so decision events only ever
 * arrive through `InboxSystem`'s own private stream.
 */
export function generateInboxMessages(
  state: GameState,
  content: ContentBundle,
  week: number,
  weekEvents: readonly GameEvent[] = [],
  rng?: Rng,
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
  addInjuryNews(state, content, week, weekEvents, add);
  if (rng) addDecisionEvent(state, week, weekEvents, rng, add);
  return out;
}

/**
 * News about OTHER players' injuries/illnesses — the human's own already
 * shows via the persistent StatusBar/ForecastBar/SeasonCalendar badges, so
 * this deliberately excludes them to avoid duplicate noise. Scans this
 * week's `injury.occurred` events (systems/injury.ts's weekly roll, and
 * tournament/engine.ts's match-time retirement path) for two independent,
 * OR'd triggers:
 *  - the player is currently top-10 in the FIR World Ranking for their
 *    gender — newsworthy regardless of severity;
 *  - the catalog entry is flagged `rare` (Achilles rupture, stress
 *    fracture — the "unlikely" severe injuries) AND the player has actually
 *    scored on this calendar year's Race (`firRacePointsTotal > 0`) — a
 *    clean, already-computed "active on tour this year" bar, rather than an
 *    arbitrary new rank cutoff.
 * At most one message per player per week (the two triggers are OR'd into a
 * single `add`, not two separate calls).
 */
function addInjuryNews(
  state: GameState,
  content: ContentBundle,
  week: number,
  weekEvents: readonly GameEvent[],
  add: (m: InboxMessage) => void,
): void {
  const humanId = state.career.playerId;
  for (const e of weekEvents) {
    if (e.type !== "injury.occurred" || !e.subject || e.subject === humanId) continue;
    const player = state.players.find((p) => p.identity.id === e.subject);
    if (!player) continue;
    const d = e.data as { catalogId?: string; kind?: "injury" | "illness"; weeksRemaining?: number } | undefined;
    if (!d?.catalogId || !d.kind) continue;

    const top10 = firWorldRanking(state, player.identity.gender)
      .slice(0, 10)
      .find((r) => r.playerId === player.identity.id);
    const weeks = d.weeksRemaining ?? 0;
    // A minor knock on a top player isn't news just because of who it
    // happened to — only worth a headline if they're out for a real stretch.
    // Rare (severity-biased-long) injuries bypass this via their own trigger.
    const top10Newsworthy = !!top10 && weeks > BALANCE.inbox.injuryNewsMinWeeks;
    const def = d.kind === "illness" ? content.illnesses[d.catalogId] : content.injuries[d.catalogId];
    const isRareAndActive = !!def?.rare && firRacePointsTotal(player.firResults, state.calendar) > 0;
    if (!top10Newsworthy && !isRareAndActive) continue;

    const label = def?.label.toLowerCase() ?? "injury";
    const weeksNote = weeks > 0 ? `, expected back in about ${weeks} week${weeks === 1 ? "" : "s"}` : "";
    const name = fullName(player);
    add({
      id: `injury:${week}:${player.identity.id}`,
      week,
      category: "injury",
      from: "Tour News Desk",
      subject:
        isRareAndActive && def?.rare
          ? `Shock news: ${name} suffers ${label}`
          : `Injury update: ${name}`,
      body: top10
        ? `${name} (world #${top10.rank}) has been ruled out with a ${label}${weeksNote}.`
        : `${name}, active on this year's Race, has been ruled out with a ${label}${weeksNote}.`,
      read: false,
      relatedPlayerId: player.identity.id,
    });
  }
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

/** Points a player earned within one concluded calendar month, summed from
 * their *published* FIR ledger — the digest's basis for "climber of the
 * month" and the player's own monthly-change line. */
function monthlyGain(cal: Calendar, ledger: readonly FirResult[], monthKey: string): number {
  return ledger.filter((r) => monthKeyForWeek(cal, r.weekIndex) === monthKey).reduce((sum, r) => sum + r.points, 0);
}

/** A note on how a gender's top 10 shuffled since last month's digest — the
 * new leader (if the top spot changed hands) and any newcomers. Empty when
 * there's no previous digest to diff against (first-ever digest). */
function top10ChangeNote(
  label: "men's" | "women's",
  current: readonly InboxRankingRow[],
  previous: readonly InboxRankingRow[] | undefined,
): string {
  if (!previous || previous.length === 0) return "";
  const prevIds = new Set(previous.map((r) => r.playerId));
  const newLeader = current[0] && previous[0] && current[0].playerId !== previous[0].playerId ? current[0] : null;
  // if the new leader also wasn't in the top 10 last month, they'd otherwise
  // get named twice — once as leader, once as a newcomer
  const newcomers = current.filter((r) => !prevIds.has(r.playerId) && r.playerId !== newLeader?.playerId);

  const parts: string[] = [];
  if (newLeader) parts.push(`${newLeader.name} takes over at No. 1`);
  if (newcomers.length > 0) {
    parts.push(`${newcomers.map((r) => r.name).join(", ")} crack${newcomers.length === 1 ? "s" : ""} the top 10`);
  }
  return parts.length > 0 ? ` In the ${label} top 10: ${parts.join("; ")}.` : ` The ${label} top 10 is unchanged this month.`;
}

/**
 * This month's biggest gainer of the given gender. Players with a fixed
 * real-world `firPoints` snapshot are excluded — their official standing
 * never moves regardless of in-game results (see `officialPointsFor`), so
 * they can't meaningfully be this month's "climber." Empty when nobody in
 * that gender earned any points this month.
 */
function climberNote(
  label: "men" | "women",
  gender: "m" | "f",
  players: readonly Player[],
  cal: Calendar,
  monthKey: string,
): string {
  let best: { name: string; gain: number } | null = null;
  for (const p of players) {
    if (p.identity.gender !== gender || p.firPoints !== null) continue;
    const gain = monthlyGain(cal, p.firResults, monthKey);
    if (gain > 0 && (!best || gain > best.gain)) best = { name: fullName(p), gain };
  }
  return best ? ` Climber of the month (${label}): ${best.name}, +${best.gain} points.` : "";
}

/** The human's own month-over-month move — a rank delta plus any points
 * earned, as a follow-up to the headline standing. Empty when there's no
 * previous digest to compare against, or the human wasn't ranked last
 * month (first appearance is already covered by the headline sentence). */
function yourChangeNote(prevRank: number | undefined, currentRank: number | undefined, gain: number): string {
  if (prevRank === undefined || currentRank === undefined) return "";
  if (currentRank < prevRank) {
    return ` You've climbed from #${prevRank} to #${currentRank} this month${gain > 0 ? `, picking up ${gain} points` : ""}.`;
  }
  if (currentRank > prevRank) {
    return ` You've slipped from #${prevRank} to #${currentRank} this month.`;
  }
  return gain > 0
    ? ` You're holding at #${currentRank}, adding ${gain} points along the way.`
    : ` You're holding steady at #${currentRank}.`;
}

/**
 * Official FIR communication is always framed around the real FIR World
 * Ranking (points), never the Glicko rating shown elsewhere to describe a
 * player's relative strength — see `firWorldRanking`'s doc comment. FIR
 * keeps entirely separate men's and women's rankings, so the digest reports
 * both top-N lists rather than one mixed one.
 *
 * Beyond the human's own headline standing, the officer's note also covers
 * how the human's own position moved, whether either top 10 reshuffled, and
 * who this month's biggest gainer was per gender — all diffed against the
 * previous digest still sitting in `career.inbox` (found by category, not by
 * id, so it works however many months back it was sent).
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
  const rankingMen = toRows(menStandings);
  const rankingWomen = toRows(womenStandings);

  // the human only ever appears in their own gender's standings
  const isWoman = human?.identity.gender === "f";
  const ownStandings = isWoman ? womenStandings : menStandings;
  const you = ownStandings.find((s) => s.playerId === humanId);
  const monthLabel = monthLabelForWeek(state.calendar, week);
  const concludedMonthKey = monthKeyForWeek(state.calendar, week - 1);

  const prevDigest = [...state.career.inbox].reverse().find((m) => m.category === "ranking");
  const yourPrevRank = prevDigest ? (isWoman ? prevDigest.yourRankWomen : prevDigest.yourRankMen) : undefined;
  const yourGain = human ? monthlyGain(state.calendar, human.firResults, concludedMonthKey) : 0;

  const body =
    (you
      ? `The ${monthLabel} FIR World Ranking is out. ${youName} sits at #${you.rank} of ${ownStandings.length}, with ${you.points} points.`
      : `The ${monthLabel} FIR World Ranking is out. ${youName} hasn't earned any counted ranking points yet — enter and place in a FIR tournament to appear on it.`) +
    yourChangeNote(yourPrevRank, you?.rank, yourGain) +
    top10ChangeNote("men's", rankingMen, prevDigest?.rankingMen) +
    top10ChangeNote("women's", rankingWomen, prevDigest?.rankingWomen) +
    climberNote("men", "m", state.players, state.calendar, concludedMonthKey) +
    climberNote("women", "f", state.players, state.calendar, concludedMonthKey);

  add({
    id: `ranking:${monthKeyForWeek(state.calendar, week)}`,
    week,
    category: "ranking",
    from: `${content.firOfficials.rankingsOfficer?.role ?? "FIR Rankings Officer"}, ${content.firOfficials.rankingsOfficer?.name ?? "James Pope"}`,
    subject: `${monthLabel} FIR world ranking`,
    body,
    read: false,
    rankingMen,
    rankingWomen,
    yourRankMen: isWoman ? undefined : you?.rank,
    yourRankWomen: isWoman ? you?.rank : undefined,
  });
}

/**
 * Decision events (fun-plan P2): small, minor-choice messages that expire if
 * ignored — a Civ-style "always a small choice arriving" complement to
 * `addDecisionEvent`'s pure siblings above. Each definition's `trigger` reads
 * only already-established facts (fatigue, money, recent training, this
 * week's results), so an arrival always feels like a consequence of the
 * player's own situation, never a bolt from nowhere (design pillar 2).
 * `build` may use `rng` for flavor (which nearby-ranked NPC invites you), but
 * never for whether it fires — that's `trigger` plus the weighted draw below.
 * Extending the launch set = adding another entry to `DECISION_EVENTS`.
 */
interface DecisionEventBuild {
  from: string;
  subject: string;
  body: string;
  choices: InboxChoice[];
  /** a named player this message is centrally about, for a clickable
   * profile link — see `InboxMessage.relatedPlayerId`. */
  relatedPlayerId?: string;
}

interface DecisionEventDef {
  id: string;
  trigger(state: GameState, weekEvents: readonly GameEvent[]): boolean;
  build(state: GameState, rng: Rng): DecisionEventBuild;
}

/** Same-gender, same-nationality tier-1 NPCs — plausible local training
 * partners, not just someone the human happens to share a ranking band
 * with. Shared by the sparring invite's trigger (must be non-empty) and its
 * build (who the invite is actually from). Every real imported player is
 * tier-1 (world/factory.ts), and every character-creation nationality has
 * dozens of same-gender compatriots in the real roster, so this stays a
 * realistic pool for any playable human. */
function sparringPool(state: GameState): Player[] {
  const human = humanPlayer(state);
  return state.players.filter(
    (p) =>
      p.simTier === 1 &&
      p.identity.gender === human.identity.gender &&
      p.identity.nationality === human.identity.nationality &&
      p.identity.id !== human.identity.id,
  );
}

/** A player's own strongest sport — the sparring invite frames itself around
 * the partner's specialty, not a random pick. */
function bestSportOf(p: Player): Sport {
  return SPORTS.reduce((best, s) => (p.attributes.skills[s] > p.attributes.skills[best] ? s : best), SPORTS[0]!);
}

/** Any sport trained in each of the last 3 weeks — a proxy for "heavy enough
 * recent use that the gear is starting to show it," since session counts
 * aren't tracked, only which sports were trained per week (`trainedWeeks`). */
function heavilyUsedSport(state: GameState): Sport | null {
  const week = state.calendar.weekIndex;
  const recentWeeks = new Set([week - 1, week - 2, week - 3]);
  const counts: Record<Sport, number> = { tt: 0, bd: 0, sq: 0, tn: 0 };
  for (const w of state.career.trainedWeeks) {
    if (!recentWeeks.has(w.weekIndex)) continue;
    for (const s of w.sports) counts[s]++;
  }
  return SPORTS.find((s) => counts[s] >= 3) ?? null;
}

const GEAR_NOUN: Record<Sport, string> = { tt: "rubbers", bd: "strings", sq: "strings", tn: "strings" };

/** The training `ActivityType` for a sport — a small fixed mapping (like
 * `ActivityType` itself, this is a closed 4-sport set baked into
 * model/activity.ts, not content-driven) so `reserveSlot` can force the
 * right training activity into the plan without a content lookup. */
const TRAIN_ACTIVITY: Record<Sport, ActivityType> = { tt: "trainTT", bd: "trainBD", sq: "trainSQ", tn: "trainTN" };

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** Chance the sparring invite proposes a weekday evening rather than a
 * weekend one — a real partner is more often free on an ordinary weeknight
 * than specifically carving out a weekend, but a weekend session is still a
 * real possibility worth keeping in the mix. */
const SPARRING_WEEKDAY_CHANCE = 0.7;

/** A single evening day, weekday-biased — the sparring invite's proposed
 * session. Resolved once at message-build time so the body text and the
 * eventual reservation always agree on the exact same day. */
function proposeEveningDay(rng: Rng): number {
  return rng.chance(SPARRING_WEEKDAY_CHANCE) ? rng.int(5) : 5 + rng.int(2);
}

const DECISION_EVENTS: readonly DecisionEventDef[] = [
  {
    id: "sparring-invite",
    trigger: (state) => sparringPool(state).length > 0,
    build(state, rng) {
      const partner = rng.pick(sparringPool(state));
      const sport = bestSportOf(partner);
      const label = SPORT_LABELS[sport].toLowerCase();
      const name = fullName(partner);
      const day = proposeEveningDay(rng);
      const dayName = DAY_NAMES[day];
      const proposedSlot = slotIndex(day, 2);
      return {
        from: name,
        subject: `Sparring invite from ${name}`,
        body: `${name}'s in town this week and free ${dayName} evening for a hitting partner — ${label} is their strong suit. Up for it?`,
        relatedPlayerId: partner.identity.id,
        choices: [
          {
            id: "accept",
            label: "Accept the invite",
            hint: `blocks ${dayName} evening · extra ${SPORT_LABELS[sport]} gain from a strong partner`,
            effect: {
              skill: { [sport]: 8 },
              fatigue: 2,
              reserveSlot: { activity: TRAIN_ACTIVITY[sport], slotIndex: proposedSlot },
              note: `Sparring with ${name} pushed your ${label} further than a normal session would have.`,
            },
          },
          { id: "decline", label: "Not this week", effect: { note: `You skipped the sparring session with ${name}.` } },
        ],
      };
    },
  },
  {
    id: "physio-slot",
    trigger: (state) => {
      const c = humanPlayer(state).condition;
      return c.fatigue >= 55 || c.soreness >= 30;
    },
    build() {
      return {
        from: "Club physio",
        subject: "Physio slot open this week",
        body: "Got a late cancellation — I can fit you in this week if you want some work on that fatigue and soreness.",
        choices: [
          {
            id: "book",
            label: "Book it (-€60)",
            hint: "-€60 · less fatigue and soreness",
            effect: { money: -60, fatigue: -15, soreness: -15, note: "The physio session eased your fatigue and soreness." },
          },
          { id: "skip", label: "Skip it", effect: { note: "You skipped the physio slot." } },
        ],
      };
    },
  },
  {
    id: "overtime-shift",
    trigger: (state) => state.career.money < BALANCE.economy.weeklyExpenses * 4,
    build() {
      return {
        from: "Your manager",
        subject: "Boss wants you for an extra shift",
        body: "We're short-staffed — can you pick up some overtime this week? It pays well, but it'll eat into your rest.",
        choices: [
          {
            id: "accept",
            label: "Take the shift (+€150)",
            hint: "+€150 · more fatigue",
            effect: { money: 150, fatigue: 6, note: "The overtime shift padded your account, but it cost you some rest." },
          },
          { id: "decline", label: "Turn it down", effect: { note: "You turned down the extra shift." } },
        ],
      };
    },
  },
  {
    id: "gear-wear",
    trigger: (state) => heavilyUsedSport(state) !== null,
    build(state) {
      const sport = heavilyUsedSport(state)!;
      const label = SPORT_LABELS[sport].toLowerCase();
      const noun = GEAR_NOUN[sport];
      return {
        from: "Club pro shop",
        subject: `Your ${label} gear is looking worn`,
        body: `Your ${noun} are showing all that court time this month. Worth sorting before it costs you?`,
        choices: [
          {
            id: "replace",
            label: `Replace them (-€40)`,
            hint: `-€40 · ${label} feels sharp again`,
            effect: { money: -40, note: `Fresh ${noun} — your ${label} feels sharp again.` },
          },
          {
            id: "keep",
            label: "Play on for now",
            hint: `-form in ${SPORT_LABELS[sport]}`,
            effect: { form: { [sport]: -3 }, note: `Playing on worn ${noun} cost you a little edge in ${label}.` },
          },
        ],
      };
    },
  },
  {
    id: "post-win-interview",
    trigger: (state, weekEvents) =>
      weekEvents.some((e) => e.type === "tournament.won" && e.subject === state.career.playerId),
    build() {
      return {
        from: "Local sports desk",
        subject: "Local paper wants a quick interview",
        body: "Nice win! Our sports desk would like a few quotes for this week's paper — good exposure if you're after sponsor interest down the line.",
        choices: [
          {
            id: "accept",
            label: "Give the interview",
            hint: "a confidence boost",
            effect: { confidence: 2, note: "Your interview ran in the local paper — a nice bit of recognition." },
          },
          { id: "decline", label: "Keep it low-key", effect: { note: "You kept a low profile after the win." } },
        ],
      };
    },
  },
];

/** Weeks since the same event id last fired, derived from the inbox itself
 * (no separate cooldown state to persist) so `generateInboxMessages` stays
 * pure — `id.startsWith` matches this event's own `decision:${id}:*` rows. */
function weeksSinceFired(inbox: readonly InboxMessage[], week: number, idPrefix: string): number {
  const last = inbox.filter((m) => m.id.startsWith(idPrefix)).reduce((max, m) => Math.max(max, m.week), -Infinity);
  return last === -Infinity ? Infinity : week - last;
}

/**
 * Draws at most one decision event for `week`: among currently-eligible
 * events (trigger true, off their own cooldown), a weighted coin flip
 * (`BALANCE.events.weeklyFireChance`) decides whether one fires at all — or,
 * if it's been quiet for `pityWeeks`, one fires unconditionally so a dry
 * spell never runs forever. `rng` is `InboxSystem`'s own private stream
 * (`ctx.rng`), so this is fully deterministic and replay-stable per seed.
 */
function addDecisionEvent(
  state: GameState,
  week: number,
  weekEvents: readonly GameEvent[],
  rng: Rng,
  add: (m: InboxMessage) => void,
): void {
  const eligible = DECISION_EVENTS.filter(
    (e) => weeksSinceFired(state.career.inbox, week, `decision:${e.id}:`) >= BALANCE.events.eventCooldownWeeks && e.trigger(state, weekEvents),
  );
  if (eligible.length === 0) return;

  const forcedByPity = weeksSinceFired(state.career.inbox, week, "decision:") >= BALANCE.events.pityWeeks;
  if (!forcedByPity && !rng.chance(BALANCE.events.weeklyFireChance)) return;

  const chosen = rng.pick(eligible);
  const built = chosen.build(state, rng);
  add({
    id: `decision:${chosen.id}:${week}`,
    week,
    category: "decision",
    from: built.from,
    subject: built.subject,
    body: built.body,
    read: false,
    choices: built.choices,
    relatedPlayerId: built.relatedPlayerId,
    expiresWeekIndex: week + BALANCE.events.answerWindowWeeks,
  });
}
