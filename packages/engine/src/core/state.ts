import type { ActivityType } from "../model/activity.js";
import type { Player } from "../model/player.js";
import type { Sport } from "../model/sport.js";
import type { Calendar } from "./date.js";

// v5: gender-separated tournament draws need a much deeper same-gender NPC
// pool (up to 63 opponents for a 64-player World Championships draw) than
// the world generator used to produce. GameState's shape is unchanged, but a
// save's `players` are generated once at career start and never
// regenerated — an old save's smaller, unfiltered-by-gender population would
// throw "not enough tier-1 players" the first time it tried to enter a
// tournament, so old saves are discarded rather than left to fail at runtime.
// v4 added the inbox; v3 added tournamentEntries.
// v6: PlayerAttributes gained `traits` (personality traits rolled at
// creation) — an old save's human has no traits array, so it's discarded
// rather than left with an undefined field the Me screen can't render.
// v7: the `players` roster is now real FIR players (world/factory.ts), not
// procedurally generated NPCs — an old save's `players` array holds
// `npc-N`-ids with random names/skills that no longer correspond to anything
// in content.players, so it's discarded to character creation rather than
// mixing real and fake opponents.
// v8: `Player` gained `firPoints` (real FIR ranking points, for tournament
// division placement — see systems/division.ts) — a new required field an
// old save's players don't have. Discarding the save also incidentally
// covers old saves' `career.tournamentEntries` referencing pre-division
// tournament ids (e.g. "hamburg-open-2026") that no longer exist in content
// now that every event is keyed per-division (e.g. "hamburg-open-2026-a").
// v9: `Career` gained `firResults` (the human's FIR ranking-points ledger,
// the docs/07 "Layer 3" accumulator earned from tournament placements) — a
// new required field an old save's career lacks, so it's discarded.
// v10: `PlayerAttributes.talent` (a single hidden 0..1 roll) became
// `potential: Record<Sport, number>` (a per-sport hidden ceiling), and
// `PlayerCondition.form` (a single -10..10 scalar) became `formBySport:
// Record<Sport, number>` (visible 0..20 per-sport training readiness) — both
// shape changes touch every player, human and NPC alike, so old saves are
// discarded to character creation rather than left with missing fields.
// v11: `InboxRankingRow` (a frozen row inside an already-persisted monthly
// ranking digest message) gained `playerId`, so the UI can open a profile
// straight from an old digest — a save from before this had no such field.
// v12: `PlayerCondition` gained `neglectWeeks` (per-sport consecutive-weeks-
// untrained streak, driving the new staged form-decay curve — see
// systems/effects.ts's `formDecayRate`) and `agingSteps` (which of the two
// permanent age-decline "cliff" step-downs have already fired — see
// systems/aging.ts) — both new required fields an old save's players don't
// have, so it's discarded rather than left with missing condition state.
// v13: `Injury` gained `startWeek` (when it began, not just how much longer
// it lasts) and `Career` gained `trainedWeeks` (an always-recorded, per-week
// history of which sports the human trained — the season calendar's data
// source, since old on-crossing narrative events are too lossy to mine for
// this) — the season calendar (Tour screen) needs both to render a real
// injury span and past training on the month grid.
// v14: `Player` gained `recentResults` (the newest few tournament placements
// for every player, human and NPC alike, recorded once each concluded
// session's entrants are all known — see tournament/engine.ts's
// `recordEntrantResults`) — a new required field an old save's players don't
// have, so it's discarded rather than left with an undefined array the
// opponent-profile screen can't render.
// v15: `Career.firResults` (human-only) moved to `Player.firResults` (every
// player, human and NPC alike — see model/player.ts's `FirResult`), since
// `recordEntrantResults` now awards FIR ranking points to every entrant of a
// concluded tournament, not just the human (closing the "NPCs don't earn Tour
// Race points" gap). An old save's `career.firResults` and NPCs' missing
// `firResults` arrays both make this a discard-to-character-creation change.
// v16: planning split `physical` into `gym`/`cardio`, removed `errands`, and
// PlayerAttributes gained `coreStrength`; old saves/plans have obsolete
// activity ids and missing player fields, so they are discarded.
// v17: `PlayerCondition` gained `soreness`, a visible short-term tournament
// muscle-damage bar; old saves are discarded rather than left with missing
// condition state.
// v18: soreness gained `sorenessStartedWeek` so it can block the first three
// weekdays after a tournament and then clear completely at week end.
// v19: Career gained `travelBlocks`, persistent post-tournament travel days
// derived from trip distance so the week after a long-haul event can lock
// return-travel slots.
// v20: Career gained `headToHeadSets`, a per-opponent per-sport count of
// completed sets the human has actually played against them — the opponent
// profile's fuzzed level band (model/sport.ts's
// `levelRangeWidthForFamiliarity`) tightens as this climbs, so an old save
// without it would show every opponent at maximum mystery forever rather
// than genuinely missing data; discarded like the other shape changes above.
// v21: Career gained `completedDraws`, a full bracket snapshot (own division
// plus siblings) taken the moment each tournament concludes — see
// facade.ts's `clearConcludedTournament` — so a played tournament's draw
// stays viewable afterward instead of vanishing with the ephemeral
// `TournamentSession`. A new required field an old save's career lacks, so
// it's discarded like the other shape changes above.
// v22: Career gained `vacationDaysRemaining` and `vacationYear` (the annual
// paid-leave pot that weekday non-work draws down — see systems/vacation.ts),
// new required fields an old save's career lacks, so it's discarded.
// v23: Career gained `pendingSalary` — work income now banks here weekly and
// pays out as one lump sum on the last week of each calendar month (see
// systems/economy.ts) rather than landing in `money` every week. A new
// required field an old save's career lacks, so it's discarded.
// v24: Player gained `pendingFirResults` — a concluded tournament's FIR
// ranking points now sit here until the next calendar-month crossing
// publishes them into `firResults` (see systems/ranking-points.ts's
// `publishPendingFirResults`), matching how real federations batch and
// publish results monthly rather than live. A new required field an old
// save's players lack, so it's discarded.
// v25: Career gained `pendingEffects` (queued stat changes from decision-
// event choices — see `PendingEffect`/`InboxChoice`/`DecisionSystem`) and
// `InboxMessage` gained an optional `choices`/`expiresWeekIndex`/
// `resolvedChoiceId` (the fun-plan P2 decision events: an inbox message can
// now carry real, expiring choices instead of only flavor text or a
// register/view CTA). `pendingEffects` is a new required field an old save's
// career lacks, so it's discarded.
// v26: Career gained `reservedSlots` — accepting a decision event that
// commits real time (e.g. a sparring invite) now forces a specific evening
// slot in the target week's plan, instead of granting its bonus for free
// outside the 21-slot budget every other commitment competes for. A new
// required field an old save's career lacks, so it's discarded.
// v27: Career gained `lockedFields` (fixes the "NZ Open" draw-swap bug: a
// division's tier-1 entrant pool was re-derived from `state.players`' live,
// week-over-week-drifting ratings on every read, so a spectator preview
// taken before a tournament could show different players than the draw that
// actually got played). The sampled field is now locked in place, keyed by
// weekIndex + TournamentDef.id, the first time `tournament/engine.ts`'s
// `sampleDivisionField` needs it, and every later read (preview, registration
// wave, or the tournament itself) reuses that lock. A new required field an
// old save's career lacks, so it's discarded.
// v28: `Injury` now carries `catalogId`/`kind`/`cause` (body-part injuries
// and illness, resolved against the new `content.injuries`/`content.illnesses`
// catalogs) instead of a bare sport-keyed `type` string — see
// systems/injury.ts. `TournamentSession` gained `withdrawnEntrants` and
// `RoundPair` gained `walkover` for the injury-triggered walkover cascade
// (tournament/engine.ts). `InboxMessage.category` gained `"injury"`. An old
// save's `Injury.type` and tournament session shape no longer match, so it's
// discarded like every other shape change above.
export const SAVE_VERSION = 28;

/** A future tournament the human has committed to — see BALANCE.tournament.entryDeadlineWeeks. */
export interface TournamentEntry {
  weekIndex: number;
  tournamentId: string;
}

export interface TravelBlock {
  weekIndex: number;
  slotIndices: number[];
}

/** One frozen row in a monthly ranking digest — the standings as they were
 * when the mail was sent, so old digests keep reading correctly. Real FIR
 * ranking points (systems/ranking-points.ts), not the Glicko rating shown
 * elsewhere to describe a player's relative strength — official FIR
 * standings and category placement are always points-based. */
export interface InboxRankingRow {
  rank: number;
  /** lets the UI open this player's profile from the digest */
  playerId: string;
  name: string;
  nationality: string;
  points: number;
  isYou: boolean;
}

/** One frozen podium spot in a tournament-director results announcement —
 * see `InboxMessage.podiumMen`/`podiumWomen`. */
export interface PodiumRow {
  position: 1 | 2 | 3;
  playerId: string;
  name: string;
  nationality: string;
}

/**
 * A flat, one-off stat change from a decision the player made — the only
 * write path a Story-type message gets into core stats, always gated behind
 * the player's own explicit pick (see `Game.chooseInboxOption`). Embedded in
 * an `InboxChoice` at message-creation time (so it's deterministic and
 * replay-stable), queued onto `Career.pendingEffects` the moment it's chosen,
 * and only actually applied by the core `DecisionSystem` the next time a week
 * is submitted — InboxSystem/event generation itself never mutates stats
 * (docs/03's offers-only rule).
 */
export interface PendingEffect {
  money?: number;
  fatigue?: number;
  soreness?: number;
  confidence?: number;
  skill?: Partial<Record<Sport, number>>;
  form?: Partial<Record<Sport, number>>;
  /** digest line for the week it lands, e.g. "Sparring with Elin Kask
   * sharpened your badminton." — shown by SummarySystem like any other note. */
  note: string;
  /** also reserves a specific slot in the target week's plan for this
   * activity (see `ReservedSlot`), forcing out whatever the player would
   * otherwise have put there — real time off the same 21-slot budget every
   * other commitment competes for, not a bonus that bypasses it. `slotIndex`
   * is chosen once, at message-build time (e.g. a randomized, weekday-
   * biased evening — see `systems/inbox.ts`'s sparring-invite), so the
   * message body can name the exact day and the reservation always matches
   * what it said. The reserved slot runs through the real weekly pipeline
   * (TrainingSystem etc.) like any other session; this effect's own
   * `skill`/`fatigue` deltas above are only the *extra* quality bump on top
   * of that normal session (e.g. a strong sparring partner beats solo
   * drilling), not a substitute for it. Written immediately to
   * `Career.reservedSlots` by `Game.chooseInboxOption`, unlike the rest of
   * this effect which stays queued until the target week is submitted. */
  reserveSlot?: { activity: ActivityType; slotIndex: number };
}

/** One option on a decision-event message — see `InboxMessage.choices`. */
export interface InboxChoice {
  id: string;
  label: string;
  /** short clause under the label, e.g. "-€60 · less sore next week" */
  hint?: string;
  effect: PendingEffect;
}

/** A slot the player has committed to a specific activity ahead of time via
 * a decision-event choice (e.g. a sparring invite's proposed evening) —
 * forces that slot in the target week's plan regardless of what's drafted
 * there, the same way `TravelBlock`/tournament entries already force their
 * own slots. See `Game.chooseInboxOption`/`Game.reservedSlotsThisWeek`. */
export interface ReservedSlot {
  weekIndex: number;
  slotIndex: number;
  activity: ActivityType;
}

/**
 * A message in the human's inbox — the diegetic "living world" feed
 * (docs/07). Generated by InboxSystem, read-only over game state; carries its
 * own read flag and any actionable payload. Pre-rendered text keeps the save
 * self-contained and freezes point-in-time content (a ranking snapshot).
 */
export interface InboxMessage {
  id: string;
  /** week the message arrived */
  week: number;
  category:
    | "welcome"
    | "invitation"
    | "ranking"
    | "result"
    | "coach"
    | "draw"
    | "record"
    | "podium"
    | "family"
    | "official"
    | "decision"
    | "injury";
  from: string;
  subject: string;
  body: string;
  read: boolean;
  /** invitation/draw/podium only: the tournament's own week, for a
   * Register/View action */
  tournamentWeek?: number;
  /** ranking digest only: the frozen monthly standings, top N — FIR keeps
   * separate men's and women's rankings, never a mixed list */
  rankingMen?: InboxRankingRow[];
  rankingWomen?: InboxRankingRow[];
  /** ranking digest only: the human's own position that month, set on
   * whichever of `rankingMen`/`rankingWomen` matches their gender — the
   * other always stays undefined */
  yourRankMen?: number;
  yourRankWomen?: number;
  /** result only: true iff the human won the whole tournament (finishingPosition 1) */
  resultWon?: boolean;
  /** podium only: the men's/women's A-division top 3, frozen at the moment
   * the results announcement was sent — fires for every concluded event,
   * whether or not the human played in it (see systems/inbox.ts's
   * `addWorldTournamentResults`). Undefined if that gender's A division
   * couldn't be resolved (a content gap, not expected in practice). */
  podiumMen?: PodiumRow[];
  podiumWomen?: PodiumRow[];
  /** decision only: 2+ mutually exclusive choices — see `InboxChoice`. */
  choices?: InboxChoice[];
  /** decision only: the last week this offer can still be answered; past
   * this, `choices` are shown but disabled/"expired" — see
   * `Game.chooseInboxOption`. */
  expiresWeekIndex?: number;
  /** decision only: which choice id was picked, once answered — undefined
   * while still open, set once and permanent. */
  resolvedChoiceId?: string;
  /** decision only: a named player this message is centrally about (e.g. a
   * sparring invite's partner) — lets the UI open their profile straight
   * from the mail, same as a draw/podium row's player link. Purely optional
   * (no SAVE_VERSION bump needed — an old save simply has it undefined). */
  relatedPlayerId?: string;
}

/**
 * Persisted mirror of `tournament/engine.ts`'s `DrawPlayerView`/`DrawMatchup`/
 * `DrawSection`/`DrawRound` — structurally identical (so `drawRounds(...)`'s
 * output can be assigned straight into a `PersistedDrawRound[]` with no
 * conversion) but declared locally here rather than imported, since this is a
 * leaf module and `tournament/engine.ts` imports `GameState` from it. Same
 * pattern as `InboxMessage`/`TournamentEntry` above.
 */
export interface PersistedDrawPlayerView {
  id: string;
  name: string;
  nationality: string;
  seed?: number;
}

export interface PersistedDrawMatchup {
  a: PersistedDrawPlayerView;
  b: PersistedDrawPlayerView;
  winnerId: string | null;
  isYouA: boolean;
  isYouB: boolean;
  sets?: { a: number; b: number }[];
}

export interface PersistedDrawSection {
  isMainDraw: boolean;
  roundName: string;
  positionFrom: number;
  positionTo: number;
  matchups: PersistedDrawMatchup[];
}

export interface PersistedDrawRound {
  round: number;
  sections: PersistedDrawSection[];
}

export interface PersistedOtherDivisionDraw {
  tournamentId: string;
  rounds: PersistedDrawRound[];
}

/** A concluded tournament's full bracket, snapshotted once at the moment it
 * ends (`facade.ts`'s `clearConcludedTournament`) since the live
 * `TournamentSession` it's read from is otherwise discarded. Keyed by
 * `weekIndex` on `Career.completedDraws`. Stores `tournamentId`, not the
 * full `TournamentDef`, so it always resolves against current content (and
 * correctly reflects a "played up" division) — see `Game.completedDraw`. */
export interface CompletedDraw {
  tournamentId: string;
  rounds: PersistedDrawRound[];
  otherDivisions: PersistedOtherDivisionDraw[];
}

/** Career-only state for the human player (AI players carry none of this). */
export interface Career {
  playerId: string;
  money: number; // EUR
  /** milestone titles earned, e.g. "champion" for a first tournament win */
  titles: string[];
  /** highest combined Glicko-2 rating ever reached, for personal-best tracking */
  bestRating: number;
  /** tournaments registered for but not yet played — consumed (removed) once
   * that week's tournament actually starts */
  tournamentEntries: TournamentEntry[];
  /** diegetic message feed, newest appended last — see InboxSystem */
  inbox: InboxMessage[];
  /** which sports the human trained, per week, newest appended last —
   * always recorded (unlike the threshold-gated `training.progress`
   * narrative event), so it's a reliable history to mine. See
   * facade.ts's `trainedWeekDates`. */
  trainedWeeks: { weekIndex: number; sports: Sport[] }[];
  /** forced travel slots after long tournament trips; outbound travel is
   * derived from the current registration, return travel is scheduled when
   * the tournament starts and persists into the following week. */
  travelBlocks: TravelBlock[];
  /** per-opponent, per-sport count of completed sets the human has actually
   * played against them, keyed by opponent id — see model/sport.ts's
   * `levelRangeWidthForFamiliarity`, which uses this to tighten that
   * opponent's fuzzed level band in facade.ts's `opponentProfile`. Only
   * grows for opponents the human has personally faced (see
   * tournament/engine.ts's `advanceTournament`), never backfilled. */
  headToHeadSets: Record<string, Partial<Record<Sport, number>>>;
  /** every concluded tournament's full bracket this season, keyed by
   * `weekIndex` — see `CompletedDraw`. Bounded by the season's own size
   * (currently ~16 tournament weeks total), not pruned. */
  completedDraws: Record<number, CompletedDraw>;
  /** Each division's sampled field of tier-1 NPC entrants, locked in place
   * the moment it's first computed for a given tournament week — by a
   * spectator preview, a registration-wave check, or the tournament actually
   * starting, whichever happens first — keyed by weekIndex then
   * `TournamentDef.id`. Without this lock, `tournament/engine.ts`'s
   * `sampleDivisionField` re-derives the pool from `state.players`' live
   * ratings on every call, so a draw browsed ahead of time could show
   * different entrants than the one actually played once NPC ratings drifted
   * in between (the "NZ Open" bug). Stores the full `def.fieldSize`-length
   * weighted sample; a caller needing fewer (the human's own division needs
   * `fieldSize - 1`, leaving a slot for them) takes a stable prefix. */
  lockedFields: Record<number, Record<string, string[]>>;
  /** paid-leave days left in the current calendar year; every Mon–Fri
   * Morning/Afternoon slot not spent working (and not a public holiday) draws
   * this down by 0.5. May go negative (over-drawn leave), shown red. Resets
   * each Jan to the nationality + age allowance — see systems/vacation.ts. */
  vacationDaysRemaining: number;
  /** the calendar year `vacationDaysRemaining` currently applies to; a sim
   * crossing into a new year triggers a reset. */
  vacationYear: number;
  /** work income banked so far this calendar month — paid out into `money`
   * in one lump sum on the last week of the month, then reset to 0. See
   * systems/economy.ts. */
  pendingSalary: number;
  /** effects from decision-event choices the player has already made,
   * queued to land the next time a week for `weekIndex` is submitted — see
   * `Game.chooseInboxOption` (the only writer) and `DecisionSystem` (the
   * only reader, which removes each entry once applied). */
  pendingEffects: { weekIndex: number; effect: PendingEffect }[];
  /** slots committed ahead of time via a decision-event choice's
   * `reserveSlot` — see `ReservedSlot`/`Game.chooseInboxOption`. Written
   * immediately (not deferred like `pendingEffects`) so the Planner shows
   * the commitment as soon as it's made, even weeks before that week is
   * actually submitted. */
  reservedSlots: ReservedSlot[];
}

export interface GameState {
  saveVersion: number;
  contentVersion: string;
  /** world seed — all RNG streams derive from this */
  seed: string;
  calendar: Calendar;
  players: Player[];
  career: Career;
}

export function getPlayer(state: GameState, id: string): Player {
  const player = state.players.find((p) => p.identity.id === id);
  if (!player) throw new Error(`Unknown player: ${id}`);
  return player;
}

export function humanPlayer(state: GameState): Player {
  return getPlayer(state, state.career.playerId);
}
