import type { ContentBundle } from "./content.js";
import { advanceWeek } from "./core/date.js";
import type { EventLog, GameEvent } from "./core/events.js";
import { WeekLog, eventsForWeek } from "./core/events.js";
import { Rng, childSeed } from "./core/rng.js";
import type { GameState } from "./core/state.js";
import { humanPlayer } from "./core/state.js";
import type { ActivityCounts, PlayerPlan } from "./model/plan.js";
import type { WeekSummary } from "./model/summary.js";
import { AgingSystem } from "./systems/aging.js";
import { EconomySystem } from "./systems/economy.js";
import { FatigueSystem } from "./systems/fatigue.js";
import { InboxSystem } from "./systems/inbox.js";
import { InjurySystem } from "./systems/injury.js";
import { PlanningSystem } from "./systems/planning.js";
import { ProgressionSystem } from "./systems/progression.js";
import { RecoverySystem } from "./systems/recovery.js";
import { SummarySystem } from "./systems/summary.js";
import { TrainingSystem } from "./systems/training.js";
import type { GameSystem, HumanSnapshot, WeekOutputs } from "./systems/types.js";

/**
 * The weekly pipeline. Systems run in this fixed order — never event-driven,
 * never reordered at runtime. Commented entries are the planned insertion
 * points for later milestones.
 */
const SYSTEMS: readonly GameSystem[] = [
  PlanningSystem,
  // TravelSystem (M2)
  TrainingSystem,
  EconomySystem,
  // Tournament resolution (tournament/engine.ts) runs BEFORE this pipeline,
  // orchestrated by the facade rather than as a fixed-order system — it
  // spans multiple UI interactions (one per round) that this single-call,
  // atomic pipeline isn't shaped for. Only its permanent effects (entry fee,
  // prize money, fatigue) land in GameState by the time submitWeek runs.
  // RankingSystem (Glicko-2 from match results) runs inline with tournament
  // resolution (tournament/engine.ts), for the same reason as Tournament
  // above — it's not a fixed-order, single-call step.
  FatigueSystem,
  RecoverySystem,
  InjurySystem,
  AgingSystem,
  ProgressionSystem,
  // NewPlayerSystem, RetirementSystem (M4)
  InboxSystem,
  // AchievementSystem (M3)
  SummarySystem,
];

export interface WeekOutcome {
  summary: WeekSummary;
  events: GameEvent[];
}

/**
 * Simulates one week in place: runs all systems against the state, appends
 * to the event log, then advances the calendar. Fully deterministic for a
 * given (state, plan, content) — each system gets a private RNG stream
 * derived from the world seed and week index.
 */
export function simulateWeek(
  state: GameState,
  humanPlan: PlayerPlan,
  content: ContentBundle,
  log: EventLog,
  snapshotOverride?: HumanSnapshot,
): WeekOutcome {
  const week = state.calendar.weekIndex;
  const human = humanPlayer(state);
  const snapshot: HumanSnapshot = snapshotOverride ?? {
    skills: { ...human.attributes.skills },
    fatigue: human.condition.fatigue,
    money: state.career.money,
    formBySport: { ...human.condition.formBySport },
  };
  const plans = new Map<string, ActivityCounts>();
  const outputs: WeekOutputs = {};

  for (const system of SYSTEMS) {
    system.run({
      state,
      content,
      humanPlan,
      plans,
      snapshot,
      outputs,
      rng: new Rng(childSeed(state.seed, week, system.id)),
      log: new WeekLog(log, week),
    });
  }

  // No-show: a tournament registered for this week that was never entered
  // (`enterTournament` consumes/removes its `tournamentEntries` row on entry)
  // still owes the entry fee — FIR Tournament Regs 3.14.1 / Players & Draws
  // 3.13. This only fires for a genuinely untouched registration: entering
  // (win, lose, or draw the whole bracket out) always removes the row before
  // `submitWeek` is ever called for this week.
  const noShowIdx = state.career.tournamentEntries.findIndex((e) => e.weekIndex === week);
  if (noShowIdx !== -1) {
    const entry = state.career.tournamentEntries[noShowIdx]!;
    const def = content.tournaments[entry.tournamentId];
    state.career.tournamentEntries.splice(noShowIdx, 1);
    if (def) {
      state.career.money -= def.entryFee;
      log.push({
        week,
        type: "tournament.noShowFee",
        subject: state.career.playerId,
        data: { name: def.name, fee: def.entryFee },
      });
    }
  }

  state.calendar = advanceWeek(state.calendar);

  const summary = outputs.summary;
  if (!summary) throw new Error("SummarySystem did not produce a summary");
  return { summary, events: eventsForWeek(log, week) };
}
