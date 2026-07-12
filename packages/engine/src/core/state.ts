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
export const SAVE_VERSION = 16;

/** A future tournament the human has committed to — see BALANCE.tournament.entryDeadlineWeeks. */
export interface TournamentEntry {
  weekIndex: number;
  tournamentId: string;
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
  category: "welcome" | "invitation" | "ranking" | "result" | "coach";
  from: string;
  subject: string;
  body: string;
  read: boolean;
  /** invitation only: the tournament's own week, for a Register/View action */
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
