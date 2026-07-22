import { BALANCE } from "../balance.js";
import { ageOn } from "../core/date.js";
import { clamp } from "../core/util.js";
import type { Rng } from "../core/rng.js";
import type { ContentBundle } from "../content.js";
import type { ActivityCounts } from "../model/plan.js";
import type { IllnessDef, InjuryCause, InjuryDef } from "../model/injury.js";
import type { Player } from "../model/player.js";
import type { Sport } from "../model/sport.js";
import { SPORTS } from "../model/sport.js";
import { injuryAgeMultiplier } from "./age.js";
import { injuryLoad } from "./effects.js";
import type { GameSystem, SystemContext } from "./types.js";

const SPORT_ACTIVITY: Record<Sport, "trainTT" | "trainBD" | "trainSQ" | "trainTN"> = {
  tt: "trainTT",
  bd: "trainBD",
  sq: "trainSQ",
  tn: "trainTN",
};

/**
 * Weekly affliction roll: at most one of two independent checks per player,
 * per week. First a small, training-load-INDEPENDENT illness check (a cold
 * catches you regardless of how hard you trained — see BALANCE.illness);
 * only if that misses does the original training-load-driven injury roll
 * run, using the same `injuryLoad()` the forecast already uses. Only one
 * injury/illness at a time — while carrying one, a player heals instead of
 * rolling for a new one. Durability ("Läkekött") pulls double duty for both:
 * it cuts the chance of getting hurt AND shortens how long it lasts.
 */
export const InjurySystem: GameSystem = {
  id: "injury",
  run(ctx) {
    for (const player of ctx.state.players) {
      if (player.simTier === 2) continue;
      const injury = player.condition.injury;

      if (injury) {
        const def = injury.kind === "illness" ? ctx.content.illnesses[injury.catalogId] : ctx.content.injuries[injury.catalogId];
        const uncappedHealRate = 1 + Math.round(player.attributes.durability * BALANCE.injuryRisk.durabilityHealBonus);
        const healRate = def?.maxHealRate !== undefined ? Math.min(uncappedHealRate, def.maxHealRate) : uncappedHealRate;
        injury.weeksRemaining = Math.max(0, injury.weeksRemaining - healRate);
        if (injury.weeksRemaining === 0) {
          player.condition.injury = null;
          ctx.log.emit("injury.recovered", player.identity.id, { catalogId: injury.catalogId, kind: injury.kind });
        }
        continue;
      }

      const counts = ctx.plans.get(player.identity.id);
      if (!counts) continue;

      if (rollIllness(ctx, player, counts)) continue;
      rollInjury(ctx, player, counts);
    }
  },
};

/** Returns true if an illness struck (and was applied) this week. */
function rollIllness(ctx: SystemContext, player: Player, counts: ActivityCounts): boolean {
  const b = BALANCE.illness;
  const travelSessions = counts.travel ?? 0;
  const chance = clamp(
    b.baseWeeklyChance +
      travelSessions * b.perTravelSession +
      (player.condition.fatigue >= b.highFatigueAt ? b.highFatigueBonus : 0),
    0,
    b.hardCeiling,
  );
  if (!ctx.rng.chance(chance)) return false;

  const entries = Object.values(ctx.content.illnesses);
  if (entries.length === 0) return false; // content gap: no illnesses defined
  const def = ctx.rng.pick(entries);
  const severity = pickSeverity(ctx.rng, 0, def);
  const weeksRemaining = b.durationBySeverity[severity];
  player.condition.injury = {
    catalogId: def.id,
    kind: "illness",
    cause: null,
    severity,
    weeksRemaining,
    startWeek: ctx.state.calendar.weekIndex,
  };
  ctx.log.emit("injury.occurred", player.identity.id, { catalogId: def.id, kind: "illness", severity, weeksRemaining });
  return true;
}

function rollInjury(ctx: SystemContext, player: Player, counts: ActivityCounts): void {
  const load = injuryLoad(counts, ctx.content, player.condition.fatigue);
  const b = BALANCE.injuryRisk;
  const age = ageOn(ctx.state.calendar.mondayISO, player.identity.birthDate);
  const chance = clamp(
    load * b.chancePerLoad * (1 - player.attributes.durability * b.durabilityProtection) * injuryAgeMultiplier(age),
    0,
    b.maxWeeklyChance,
  );
  if (!ctx.rng.chance(chance)) return;

  const cause = dominantCause(counts);
  const def = pickInjuryDef(ctx.content, ctx.rng, cause);
  if (!def) return; // content gap: no injuries defined
  const severity = pickSeverity(ctx.rng, load, def);
  const weeksRemaining = pickInjuryDuration(ctx.rng, def, severity);
  player.condition.injury = {
    catalogId: def.id,
    kind: "injury",
    cause,
    severity,
    weeksRemaining,
    startWeek: ctx.state.calendar.weekIndex,
  };
  ctx.log.emit("injury.occurred", player.identity.id, { catalogId: def.id, kind: "injury", severity, weeksRemaining });
}

/** Which sport (or gym), if any, contributed the most sessions this week —
 * the cause an injury gets weighted-picked against. */
function dominantCause(counts: ActivityCounts): InjuryCause | null {
  let best: InjuryCause | null = null;
  let bestSessions = 0;
  for (const sport of SPORTS) {
    const sessions = counts[SPORT_ACTIVITY[sport]] ?? 0;
    if (sessions > bestSessions) {
      bestSessions = sessions;
      best = sport;
    }
  }
  const gymSessions = counts.gym ?? 0;
  if (gymSessions > bestSessions) {
    bestSessions = gymSessions;
    best = "gym";
  }
  return best;
}

function sumWeights(weights: Partial<Record<InjuryCause, number>>): number {
  return Object.values(weights).reduce((sum, w) => sum + Math.max(0, w ?? 0), 0);
}

/** Weighted-picks a body-part injury catalog entry for the given cause. A
 * null cause (load came entirely from fatigue, no single sport/gym
 * dominated) falls back to weighting every entry by its overall commonness
 * across causes. If nothing has positive weight for this cause (a content
 * gap), falls back to a uniform pick across the whole catalog rather than
 * crashing. Exported for tournament/engine.ts's match-time retirement path,
 * which weighted-picks by the sport just played the same way the weekly
 * roll picks by the week's dominant sport/gym. */
export function pickInjuryDef(content: ContentBundle, rng: Rng, cause: InjuryCause | null): InjuryDef | null {
  const entries = Object.values(content.injuries);
  if (entries.length === 0) return null;
  const weighted = entries.map(
    (def) => [def, cause ? (def.sportWeights[cause] ?? 0) : sumWeights(def.sportWeights)] as const,
  );
  const total = weighted.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
  if (total <= 0) return rng.pick(entries);
  return rng.weightedPick(weighted);
}

/** An entry's own `severityWeights`, when present, overrides the default
 * load-driven distribution — lets a dramatic entry (Achilles rupture, stress
 * fracture) stay rare-but-plausible instead of "guaranteed severity 3
 * whenever a brutal week rolls severity 3." */
function pickSeverity(rng: Rng, load: number, def: InjuryDef | IllnessDef): 1 | 2 | 3 {
  if (def.severityWeights) {
    const [w1, w2, w3] = def.severityWeights;
    return rng.weightedPick([
      [1, w1],
      [2, w2],
      [3, w3],
    ] as const);
  }
  return rollSeverity(rng, load);
}

function rollSeverity(rng: Rng, load: number): 1 | 2 | 3 {
  const b = BALANCE.injuryRisk;
  if (load >= b.highAt) return rng.chance(0.5) ? 3 : 2;
  if (load >= b.mediumAt) return rng.chance(0.5) ? 2 : 1;
  return 1;
}

/** Default severity distribution for a match-time retirement (no weekly
 * "load" concept applies) — mild-biased, most match knocks are minor,
 * unless the catalog entry itself overrides via `severityWeights` (as
 * Achilles rupture/stress fracture do). Exported for tournament/engine.ts. */
const DEFAULT_MATCH_SEVERITY_WEIGHTS: readonly [number, number, number] = [3, 2, 1];

export function pickMatchInjurySeverity(rng: Rng, def: InjuryDef): 1 | 2 | 3 {
  const [w1, w2, w3] = def.severityWeights ?? DEFAULT_MATCH_SEVERITY_WEIGHTS;
  return rng.weightedPick([
    [1, w1],
    [2, w2],
    [3, w3],
  ] as const);
}

/** Injury duration in weeks by severity — shared by the weekly training-load
 * roll and the match-time retirement path (tournament/engine.ts); a body's
 * healing time doesn't depend on how the injury happened. */
export function rollInjuryDuration(rng: Rng, severity: 1 | 2 | 3): number {
  if (severity === 1) return 1 + rng.int(2); // 1-2 weeks
  if (severity === 2) return 3 + rng.int(2); // 3-4 weeks
  return 5 + rng.int(3); // 5-7 weeks
}

/** An entry's own `weeksRemainingRange`, when present, replaces the generic
 * severity-tier duration table — e.g. Achilles rupture rolls 26-36 weeks
 * regardless of severity, not the tier table's 5-7 week cap. Exported for
 * tournament/engine.ts's match-time retirement path, same reuse as
 * `pickInjuryDef`/`pickMatchInjurySeverity`. */
export function pickInjuryDuration(rng: Rng, def: InjuryDef | IllnessDef, severity: 1 | 2 | 3): number {
  if (def.weeksRemainingRange) {
    const [min, max] = def.weeksRemainingRange;
    return min + rng.int(max - min + 1);
  }
  return rollInjuryDuration(rng, severity);
}
