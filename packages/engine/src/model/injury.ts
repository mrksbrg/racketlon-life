import type { Sport } from "./sport.js";

/** What caused a body-part injury's `sportWeights` lookup — a trained/played
 * sport, or the synthetic "gym" cause for weight-room injuries (gym has no
 * `Sport` of its own). */
export type InjuryCause = Sport | "gym";

/**
 * A body-part injury catalog entry. Values live in content
 * (packages/content/data/injuries.json), not in code — see ActivityDef for
 * the same convention.
 */
export interface InjuryDef {
  id: string;
  label: string;
  bodyPart: string;
  kind: "injury";
  /** relative likelihood this entry is picked when the injury's cause is
   * each given sport/gym — absent or 0 means "can't happen from this cause" */
  sportWeights: Partial<Record<InjuryCause, number>>;
  /** optional override of the default load-driven severity distribution,
   * indexed [severity1, severity2, severity3] — lets a dramatic entry (e.g.
   * an Achilles rupture) stay rare-but-plausible instead of "guaranteed
   * severity 3 whenever a brutal week rolls severity 3." */
  severityWeights?: readonly [number, number, number];
  /** optional [min, max] weeks override (inclusive), replacing the generic
   * severity-tier duration table (systems/injury.ts's `rollInjuryDuration`,
   * capped at 5-7 weeks even for severity 3) — a torn Achilles doesn't heal
   * on the same clock as a bad sprain just because both happen to roll
   * "severe." */
  weeksRemainingRange?: readonly [number, number];
  /** caps how many weeks of countdown durability's heal-rate bonus can burn
   * per real week (systems/injury.ts's `InjurySystem`, normally up to 3
   * weeks/week at max durability) — undefined means no cap, the normal
   * durability-scaled rate applies. A torn Achilles has a real biological
   * floor no amount of natural resilience shortens; set this to 1 so it
   * always takes the full rolled duration in real weeks, regardless of
   * durability. Durability still helps by lowering the CHANCE of ever
   * getting one in the first place. */
  maxHealRate?: number;
  /** drives the "serious injury" inbox trigger (systems/inbox.ts) */
  rare?: boolean;
}

/** An illness catalog entry — structurally similar to {@link InjuryDef} but
 * not sport-caused, so no `sportWeights`. */
export interface IllnessDef {
  id: string;
  label: string;
  kind: "illness";
  severityWeights?: readonly [number, number, number];
  weeksRemainingRange?: readonly [number, number];
  maxHealRate?: number;
  rare?: boolean;
}
