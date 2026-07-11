import { BALANCE } from "../balance.js";
import { Rng, childSeed } from "../core/rng.js";
import type { Player, Skills } from "../model/player.js";
import type { Sport } from "../model/sport.js";
import { SPORTS } from "../model/sport.js";
import { matchAgeModifier } from "../systems/age.js";
import { staminaEnergyMult } from "../systems/effects.js";

/**
 * Point-by-point racketlon match simulation.
 *
 * Rules: four sets in fixed order TT → BD → SQ → TN, each to 21 points
 * win-by-2. Every point counts — the match winner is whoever has more TOTAL
 * points. Play stops as soon as the trailing player can no longer catch up
 * (so the tennis set runs only "as long as it is needed"), and a tie after
 * all four sets is decided by a single gummiarm point in tennis.
 *
 * MatchState is plain serializable data; each point derives its own RNG
 * stream from (matchSeed, pointCount), so a match replays identically and
 * can be stepped one point at a time by the UI.
 */

export type Side = "a" | "b";
/** Ordered by energy cost, low to high — see BALANCE.match.tactics. */
export type Tactic = "conserve" | "safe" | "normal" | "aggressive" | "allOut";
export const TACTICS: readonly Tactic[] = ["conserve", "safe", "normal", "aggressive", "allOut"];
/** Table tennis has no physical conserve/all-out gear — tactic barely moves
 * its energy cost there, so the dial only ever offers its original 3 steps. */
const TT_TACTICS: readonly Tactic[] = ["safe", "normal", "aggressive"];

export function tacticsForSport(sport: Sport): readonly Tactic[] {
  return sport === "tt" ? TT_TACTICS : TACTICS;
}

/** Maps an out-of-range tactic down to the nearest one TT actually supports. */
function clampTacticForSport(tactic: Tactic, sport: Sport): Tactic {
  if (sport !== "tt") return tactic;
  if (tactic === "conserve") return "safe";
  if (tactic === "allOut") return "aggressive";
  return tactic;
}

/** Frozen inputs per player — taken from Player at match creation. */
export interface MatchPlayerRef {
  id: string;
  name: string;
  skills: Skills;
  /** 0..20 per sport — see BALANCE.form and `formFactor` below */
  formBySport: Record<Sport, number>;
  fatigue: number; // 0..100, entering the match
  /** 0..1 — slows in-match energy burn; see `staminaEnergyMult` and, for
   * tournament play, `staminaRecoveryMult` (systems/effects.ts) */
  stamina: number;
  /** whole years — the match engine stays calendar-agnostic, so callers
   * compute this from birthDate via core/date.ts's ageOn() */
  age: number;
}

export interface SetScore {
  a: number;
  b: number;
  done: boolean;
}

export type BreakReason = "matchStart" | "sideChange" | "setEnd" | "gummiarm";

export interface MatchState {
  players: { a: MatchPlayerRef; b: MatchPlayerRef };
  seed: string;
  /** total points played — also the per-point RNG stream counter */
  pointCount: number;
  /** four sets, index = SPORTS order (tt, bd, sq, tn) */
  sets: SetScore[];
  setIndex: number;
  /** the 11-point side-change break has happened in the current set */
  sideChangeDone: boolean;
  /** in-match energy 0..100 per side — the fuel tactics spend */
  energy: { a: number; b: number };
  tactics: { a: Tactic; b: Tactic };
  phase: "break" | "playing" | "finished";
  breakReason: BreakReason | null;
  winner: Side | null;
  gummiarm: boolean;
  /** true when play stopped before all sets finished (uncatchable lead) */
  decidedEarly: boolean;
  /**
   * EMA of (actual outcome − modeled win probability) for side "a", positive
   * meaning a has been winning points beyond what the model expected lately
   * (the run of the ball is with them). Presentation-only "luck" read — does
   * not feed back into point probability. See `luckTell`.
   */
  momentum: number;
}

export interface PointOutcome {
  winner: Side;
  sport: Sport;
  a: number;
  b: number;
}

export function matchRefFromPlayer(player: Player, age: number): MatchPlayerRef {
  return {
    id: player.identity.id,
    name: `${player.identity.firstName} ${player.identity.lastName}`,
    skills: { ...player.attributes.skills },
    formBySport: { ...player.condition.formBySport },
    fatigue: player.condition.fatigue,
    stamina: player.attributes.stamina,
    age,
  };
}

export function createMatch(a: MatchPlayerRef, b: MatchPlayerRef, seed: string): MatchState {
  return {
    players: { a, b },
    seed,
    pointCount: 0,
    sets: SPORTS.map(() => ({ a: 0, b: 0, done: false })),
    setIndex: 0,
    sideChangeDone: false,
    energy: { a: 100, b: 100 },
    tactics: { a: "normal", b: "normal" },
    phase: "break",
    breakReason: "matchStart",
    winner: null,
    gummiarm: false,
    decidedEarly: false,
    momentum: 0,
  };
}

export function currentSport(m: MatchState): Sport {
  return SPORTS[m.setIndex] ?? "tn";
}

export function totalPoints(m: MatchState, side: Side): number {
  return m.sets.reduce((sum, set) => sum + set[side], 0);
}

function totalLeader(m: MatchState): Side {
  return totalPoints(m, "a") >= totalPoints(m, "b") ? "a" : "b";
}

export function setTactic(m: MatchState, side: Side, tactic: Tactic): void {
  m.tactics[side] = clampTacticForSport(tactic, currentSport(m));
}

export function resumeMatch(m: MatchState): void {
  if (m.phase !== "break") return;
  m.phase = "playing";
  m.breakReason = null;
}

/**
 * The most points the trailing side could still score if it won every
 * remaining point: finish the current set (to 21, or 2 past the opponent's
 * current score) plus 21 per unplayed set. The match is decided when the
 * leader's total lead exceeds this.
 */
export function maxRemainingFor(m: MatchState, trailer: Side, setJustEnded: boolean): number {
  const fullSetsLeft = 3 - m.setIndex;
  if (setJustEnded) return 21 * fullSetsLeft;
  const set = m.sets[m.setIndex];
  if (!set) return 0;
  const opponent: Side = trailer === "a" ? "b" : "a";
  const target = Math.max(21, set[opponent] + 2);
  return target - set[trailer] + 21 * fullSetsLeft;
}

function matchDecided(m: MatchState, setJustEnded: boolean): boolean {
  const ta = totalPoints(m, "a");
  const tb = totalPoints(m, "b");
  if (ta === tb) return false;
  const trailer: Side = ta > tb ? "b" : "a";
  return Math.abs(ta - tb) > maxRemainingFor(m, trailer, setJustEnded);
}

/**
 * The racketlon "magic number": which side currently leads on total points,
 * and how many more points they'd need to win them consecutively from here to
 * make the match mathematically decided (an uncatchable lead, exactly as
 * `matchDecided` judges it). This is the "5 points needed" cue shown before
 * the tennis set. Returns null when the totals are level (no leader yet — the
 * last set, or a gummiarm, will decide it) or the match is already finished.
 *
 * Pure: it simulates the leader winning out on a throwaway copy of the set
 * scores, never touching the live match.
 */
export function pointsToWin(m: MatchState): { side: Side; points: number } | null {
  if (m.phase === "finished") return null;
  const ta = totalPoints(m, "a");
  const tb = totalPoints(m, "b");
  if (ta === tb) return null;
  const leader: Side = ta > tb ? "a" : "b";
  const trailer: Side = leader === "a" ? "b" : "a";

  const sets = m.sets.map((s) => ({ a: s.a, b: s.b }));
  let setIndex = m.setIndex;
  const total = (side: Side): number => sets.reduce((sum, s) => sum + s[side], 0);
  const maxRemaining = (setJustEnded: boolean): number => {
    const fullSetsLeft = 3 - setIndex;
    if (setJustEnded) return 21 * fullSetsLeft;
    const set = sets[setIndex]!;
    const target = Math.max(21, set[leader] + 2);
    return target - set[trailer] + 21 * fullSetsLeft;
  };

  let points = 0;
  for (let guard = 0; guard < 500; guard++) {
    const set = sets[setIndex]!;
    set[leader]++;
    points++;
    const setDone = (set.a >= 21 || set.b >= 21) && Math.abs(set.a - set.b) >= 2;
    if (total(leader) - total(trailer) > maxRemaining(setDone)) break;
    if (setDone && setIndex < 3) setIndex++;
  }
  return { side: leader, points };
}

/** Fraction of true skill that shows up on court at this form level — see
 * BALANCE.form.matchFloor/matchSpan. 1.0 at full form, never below the floor. */
function formFactor(form: number): number {
  const f = BALANCE.form;
  return f.matchFloor + f.matchSpan * (form / f.max);
}

function effectiveStrength(
  ref: MatchPlayerRef,
  sport: Sport,
  energy: number,
  tactic: Tactic,
  rng: Rng,
): number {
  const b = BALANCE.match;
  const t = b.tactics[tactic];
  let eff =
    ref.skills[sport] * formFactor(ref.formBySport[sport]) -
    ref.fatigue * b.fatigueWeight -
    (100 - energy) * b.energyWeight +
    t.eff +
    matchAgeModifier(ref.age);
  if (t.chaos > 0) eff += rng.range(-t.chaos, t.chaos);
  return eff;
}

/** P(side a wins the next point). */
export function pointWinProbability(m: MatchState, rng: Rng): number {
  const sport = currentSport(m);
  const effA = effectiveStrength(m.players.a, sport, m.energy.a, m.tactics.a, rng);
  const effB = effectiveStrength(m.players.b, sport, m.energy.b, m.tactics.b, rng);
  return 1 / (1 + Math.exp(-(effA - effB) / BALANCE.match.scales[sport]));
}

/**
 * Plays one point and advances the match state machine: side-change break at
 * 11, set-end breaks, early finish on an uncatchable lead, gummiarm on a tie
 * after four sets. Returns null unless the match is in the playing phase.
 */
export function playPoint(m: MatchState): PointOutcome | null {
  if (m.phase !== "playing") return null;
  const set = m.sets[m.setIndex];
  if (!set) return null;
  const sport = currentSport(m);
  const rng = new Rng(childSeed(m.seed, "pt", m.pointCount));

  const pA = pointWinProbability(m, rng);
  const winner: Side = rng.chance(pA) ? "a" : "b";
  m.pointCount++;
  set[winner]++;

  const surpriseA = (winner === "a" ? 1 : 0) - pA;
  const decay = BALANCE.match.momentumDecay;
  m.momentum = decay * m.momentum + (1 - decay) * surpriseA;

  for (const side of ["a", "b"] as const) {
    const cost =
      BALANCE.match.energyCostPerPoint[sport] *
      BALANCE.match.tacticEnergyMult[sport][m.tactics[side]] *
      staminaEnergyMult(m.players[side].stamina);
    m.energy[side] = Math.max(0, m.energy[side] - cost);
  }

  const outcome: PointOutcome = { winner, sport, a: set.a, b: set.b };

  // a gummiarm point is sudden death: whoever leads the totals now has won
  if (m.gummiarm) {
    set.done = true;
    m.phase = "finished";
    m.winner = totalLeader(m);
    return outcome;
  }

  const setDone = (set.a >= 21 || set.b >= 21) && Math.abs(set.a - set.b) >= 2;

  if (matchDecided(m, setDone)) {
    set.done = setDone;
    m.phase = "finished";
    m.winner = totalLeader(m);
    m.decidedEarly = !(m.setIndex === 3 && setDone);
    return outcome;
  }

  if (setDone) {
    set.done = true;
    if (m.setIndex === 3) {
      // four sets played, totals level (otherwise matchDecided had fired)
      m.gummiarm = true;
      m.phase = "break";
      m.breakReason = "gummiarm";
    } else {
      m.setIndex++;
      m.sideChangeDone = false;
      m.phase = "break";
      m.breakReason = "setEnd";
    }
    return outcome;
  }

  if (!m.sideChangeDone && (set.a === 11 || set.b === 11)) {
    m.sideChangeDone = true;
    m.phase = "break";
    m.breakReason = "sideChange";
  }

  return outcome;
}

/**
 * Tactic heuristic for AI opponents. Checked in order: cut losses and bank
 * energy when truly exhausted, empty the tank when desperately behind, go
 * for quick winners (not safe grinding — aggressive is what actually saves
 * energy) when merely tired or moderately behind, coast when the lead is a
 * blowout, protect a comfortable lead, otherwise play normally. The result is
 * clamped to the 3-step dial in table tennis, where conserve/all-out don't apply.
 */
export function aiChooseTactic(m: MatchState, side: Side): Tactic {
  const b = BALANCE.match.ai;
  const other: Side = side === "a" ? "b" : "a";
  const lead = totalPoints(m, side) - totalPoints(m, other);
  const energy = m.energy[side];
  let tactic: Tactic;
  if (energy < b.exhaustedBelow) tactic = "conserve";
  else if (lead <= -b.desperateBehind) tactic = "allOut";
  else if (energy < b.tiredBelow) tactic = "aggressive";
  else if (lead <= -b.pressWhenBehind) tactic = "aggressive";
  else if (lead >= b.crushingAhead) tactic = "conserve";
  else if (lead >= b.protectWhenAhead) tactic = "safe";
  else tactic = "normal";
  return clampTacticForSport(tactic, currentSport(m));
}

/** Bucketed fatigue read — never the exact energy number. */
export type FatigueTell = "fresh" | "working" | "tiring" | "gassed";

export function fatigueTell(energy: number): FatigueTell {
  if (energy >= 80) return "fresh";
  if (energy >= 55) return "working";
  if (energy >= 30) return "tiring";
  return "gassed";
}

/** Bucketed "run of the ball" read, from the momentum EMA — see MatchState.momentum. */
export type LuckTell = "unlucky" | "neutral" | "lucky";

export function luckTell(m: MatchState, side: Side): LuckTell {
  const signed = side === "a" ? m.momentum : -m.momentum;
  if (signed > 0.12) return "lucky";
  if (signed < -0.12) return "unlucky";
  return "neutral";
}
