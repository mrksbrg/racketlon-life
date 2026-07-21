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
  rare?: boolean;
}
