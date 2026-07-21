import { describe, expect, it } from "vitest";
import { ACTIVITY_TYPES, activityBlockedByInjury } from "../src/index.js";
import type { ActivityType, InjuryKind } from "../src/index.js";

const SPORT_ACTIVITIES: ActivityType[] = ["trainTT", "trainBD", "trainSQ", "trainTN"];

describe("activityBlockedByInjury", () => {
  it("blocks nothing while healthy", () => {
    for (const type of ACTIVITY_TYPES) {
      expect(activityBlockedByInjury(type, null)).toBe(false);
    }
  });

  it.each(SPORT_ACTIVITIES)("blocks %s for an injury", (type) => {
    expect(activityBlockedByInjury(type, "injury")).toBe(true);
  });

  it.each(SPORT_ACTIVITIES)("blocks %s for an illness", (type) => {
    expect(activityBlockedByInjury(type, "illness")).toBe(true);
  });

  it("never blocks gym, injury or illness", () => {
    expect(activityBlockedByInjury("gym", "injury")).toBe(false);
    expect(activityBlockedByInjury("gym", "illness")).toBe(false);
  });

  it("blocks cardio only for illness, not injury", () => {
    expect(activityBlockedByInjury("cardio", "injury")).toBe(false);
    expect(activityBlockedByInjury("cardio", "illness")).toBe(true);
  });

  it.each(["rest", "work", "social", "travel"] as ActivityType[])(
    "never blocks %s regardless of kind",
    (type) => {
      for (const kind of [null, "injury", "illness"] as (InjuryKind | null)[]) {
        expect(activityBlockedByInjury(type, kind)).toBe(false);
      }
    },
  );
});
