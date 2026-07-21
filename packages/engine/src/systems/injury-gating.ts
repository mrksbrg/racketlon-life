import type { ActivityType } from "../model/activity.js";
import type { InjuryKind } from "../model/player.js";

const SPORT_ACTIVITIES: ReadonlySet<ActivityType> = new Set(["trainTT", "trainBD", "trainSQ", "trainTN"]);

/**
 * Which activity types are unavailable while carrying an injury/illness of
 * the given `kind` (`null` = healthy) — the single source of truth shared by
 * TrainingSystem (engine enforcement, skips gains) and the Planner UI
 * (imported directly, called with `store.you.injury?.kind ?? null`), so the
 * two can never drift, mirroring how `injuryLoad`/`injuryRiskBucket`
 * (effects.ts) are already shared between the real roll and the UI
 * forecast. Takes just the `kind`, not the full `Injury`/`InjuryView` — the
 * one thing this decision depends on — so it works unchanged on either side
 * of the engine/UI boundary.
 *
 * A deliberately literal rule, not "improved" toward what might seem more
 * realistic: ANY active injury or illness blocks all four sport-training
 * activities, regardless of which body part is hurt; gym is NEVER blocked;
 * cardio is blocked ONLY while the affliction is an illness.
 */
export function activityBlockedByInjury(activity: ActivityType, kind: InjuryKind | null): boolean {
  if (!kind) return false;
  if (SPORT_ACTIVITIES.has(activity)) return true;
  if (activity === "cardio") return kind === "illness";
  return false;
}
