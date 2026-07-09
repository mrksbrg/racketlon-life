import type { ActivityType, ContentBundle, PlayerPlan } from "../src/index.js";
import { SLOTS_PER_WEEK } from "../src/index.js";

/** Minimal content bundle so engine tests don't depend on @racketlon/content. */
export const testContent: ContentBundle = {
  version: "test",
  activities: {
    trainTT: { id: "trainTT", label: "Table tennis", short: "TT", sport: "tt", trainingBase: 6, fatigue: 7, money: -60, injuryLoad: 1.5 },
    trainBD: { id: "trainBD", label: "Badminton", short: "BD", sport: "bd", trainingBase: 6, fatigue: 7, money: -60, injuryLoad: 1.5 },
    trainSQ: { id: "trainSQ", label: "Squash", short: "SQ", sport: "sq", trainingBase: 6, fatigue: 7, money: -60, injuryLoad: 1.5 },
    trainTN: { id: "trainTN", label: "Tennis", short: "TN", sport: "tn", trainingBase: 6, fatigue: 7, money: -60, injuryLoad: 1.5 },
    physical: { id: "physical", label: "Physical training", short: "PT", fatigue: 8, money: -30, injuryLoad: 2 },
    rest: { id: "rest", label: "Rest", short: "—", fatigue: -4, money: 0, injuryLoad: 0 },
    work: { id: "work", label: "Work", short: "Job", fatigue: 4, money: 800, injuryLoad: 0 },
    social: { id: "social", label: "Social", short: "Soc", fatigue: -3, money: -100, injuryLoad: 0 },
    errands: { id: "errands", label: "Errands", short: "Err", fatigue: 2, money: -50, injuryLoad: 0 },
  },
  names: {
    SE: { m: ["Test"], f: ["Test"], last: ["Player"] },
  },
  // SE is home (the default fallback human's nationality, used whenever
  // Game.newGame is called without a `character`) — NO is a foreign
  // destination for travel-cost tests.
  countries: {
    SE: { name: "Sweden", lat: 60, lon: 15, costIndex: 1 },
    NO: { name: "Norway", lat: 60, lon: 5, costIndex: 1.5 },
  },
  // Three dated test tournaments landing on weekIndex 3, 7, 11 (Mondays
  // 2026-01-26 / 02-23 / 03-23) — stands in for what used to be a single
  // "every 4 weeks" recurring def, now that real events don't recur. All
  // domestic (country: SE = home) so they carry zero travel cost, keeping
  // entry-fee-only assertions elsewhere valid. A 4th, foreign tournament
  // (week 20, well past anything the default-count schedule tests slice)
  // exists solely for travel-cost tests.
  tournaments: {
    "monthly-open-1": {
      id: "monthly-open-1",
      name: "Monthly Open",
      city: "Testville",
      country: "SE",
      lat: 60,
      lon: 15,
      tier: "SAT",
      date: "2026-01-26",
      nights: 1,
      entryFee: 300,
      fieldSize: 8,
      prizeByRoundsWon: [0, 200, 500, 1500],
    },
    "monthly-open-2": {
      id: "monthly-open-2",
      name: "Monthly Open",
      city: "Testville",
      country: "SE",
      lat: 60,
      lon: 15,
      tier: "SAT",
      date: "2026-02-23",
      nights: 1,
      entryFee: 300,
      fieldSize: 8,
      prizeByRoundsWon: [0, 200, 500, 1500],
    },
    "monthly-open-3": {
      id: "monthly-open-3",
      name: "Monthly Open",
      city: "Testville",
      country: "SE",
      lat: 60,
      lon: 15,
      tier: "SAT",
      date: "2026-03-23",
      nights: 1,
      entryFee: 300,
      fieldSize: 8,
      prizeByRoundsWon: [0, 200, 500, 1500],
    },
    "intl-open-1": {
      id: "intl-open-1",
      name: "International Open",
      city: "Foreignville",
      country: "NO",
      lat: 60,
      lon: 5,
      tier: "IWT",
      date: "2026-05-25", // weekIndex 20
      nights: 2,
      entryFee: 300,
      fieldSize: 8,
      prizeByRoundsWon: [0, 200, 500, 1500],
    },
  },
  // a small pool covering every tone, plus one exclude pair, enough to
  // exercise rollTraits() without depending on @racketlon/content
  traits: {
    optimist: { id: "optimist", name: "Optimist", category: "mentality", tone: "positive", rarity: "common", description: "Test", excludes: ["pessimist"] },
    pessimist: { id: "pessimist", name: "Pessimist", category: "mentality", tone: "negative", rarity: "common", description: "Test", excludes: ["optimist"] },
    workhorse: { id: "workhorse", name: "Workhorse", category: "training", tone: "positive", rarity: "common", description: "Test" },
    lazy: { id: "lazy", name: "Lazy", category: "training", tone: "negative", rarity: "common", description: "Test" },
    creature_of_habit: { id: "creature_of_habit", name: "Creature of Habit", category: "training", tone: "neutral", rarity: "common", description: "Test" },
    aggressive: { id: "aggressive", name: "Aggressive", category: "competition", tone: "neutral", rarity: "uncommon", description: "Test" },
  },
};

/** Builds a 21-slot plan from activity counts, padding with rest. */
export function planWith(counts: Partial<Record<ActivityType, number>>): PlayerPlan {
  const slots: ActivityType[] = [];
  for (const [type, n] of Object.entries(counts) as Array<[ActivityType, number]>) {
    for (let i = 0; i < n; i++) slots.push(type);
  }
  if (slots.length > SLOTS_PER_WEEK) throw new Error("plan overflows the week");
  while (slots.length < SLOTS_PER_WEEK) slots.push("rest");
  return { slots };
}
