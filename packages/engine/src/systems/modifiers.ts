import { BALANCE } from "../balance.js";
import type { ActivityType } from "../model/activity.js";
import type { ContentBundle } from "../content.js";
import type { Calendar } from "../core/date.js";
import { monthKeyForWeek } from "../core/date.js";
import { childSeed, Rng } from "../core/rng.js";
import type { Sport } from "../model/sport.js";

const TRAIN_ACTIVITY: Record<Sport, ActivityType> = { tt: "trainTT", bd: "trainBD", sq: "trainSQ", tn: "trainTN" };

export type Season = "winter" | "spring" | "summer" | "autumn";

/**
 * A week modifier (fun-plan P3): a small, local-feeling wrinkle — closed
 * courts, a guest coach, a heat wave — that makes the saved template need a
 * 10-second look most weeks instead of running on autopilot forever. Always
 * human-only flavor ("your club this week"), never a world event affecting
 * every NPC too — see `weekModifierContent`'s doc comment for how that's
 * enforced.
 */
export interface WeekModifierDef {
  id: string;
  headline: string;
  body: string;
  /** training-gain multiplier for a sport this week (0 = effectively
   * unavailable — the courts are shut, so sessions booked there are wasted,
   * not merely worse). Missing sport = unaffected. */
  sportMultiplier?: Partial<Record<Sport, number>>;
  /** extra fatigue cost per session for a sport this week, on top of normal. */
  extraFatiguePerSession?: Partial<Record<Sport, number>>;
  /** multiplies the `social` activity's per-session money cost (0 = free). */
  socialMoneyMultiplier?: number;
  /** restricts this modifier to the player's own *local* season (see
   * `localSeason` — already hemisphere-corrected), e.g. a heat wave should
   * only ever roll in summer. Undefined = eligible year-round. */
  season?: Season;
}

const WEEK_MODIFIERS: readonly WeekModifierDef[] = [
  {
    id: "squash-closed",
    headline: "Squash courts closed for maintenance",
    body: "Your club has the squash courts shut for maintenance this week — any session booked there won't count for much.",
    sportMultiplier: { sq: 0 },
  },
  {
    id: "badminton-boost",
    headline: "Guest coach running badminton sessions",
    body: "A guest coach is in for badminton this week — sessions with them are worth extra.",
    sportMultiplier: { bd: 1.5 },
  },
  {
    id: "open-house",
    headline: "Club open-house this week",
    body: "The club's throwing an open-house this week — socialising is free while it's on.",
    socialMoneyMultiplier: 0,
  },
  {
    id: "heat-wave",
    headline: "Heat wave this week",
    body: "It's brutally hot this week — tennis sessions leave you more fatigued than usual.",
    extraFatiguePerSession: { tn: 3 },
    season: "summer",
  },
  {
    id: "quiet-club",
    headline: "Your usual training partners are away",
    body: "The club's quiet this week with your regulars away — solo sessions gain a little less than usual.",
    sportMultiplier: { tt: 0.85, bd: 0.85, sq: 0.85, tn: 0.85 },
  },
];

function seasonForMonth(month: number): Season {
  if (month === 12 || month <= 2) return "winter";
  if (month <= 5) return "spring";
  if (month <= 8) return "summer";
  return "autumn";
}

const OPPOSITE_SEASON: Record<Season, Season> = { winter: "summer", summer: "winter", spring: "autumn", autumn: "spring" };

/**
 * The player's own local season for `calendar`'s `weekIndex` — most of the
 * game's playable nationalities (and its whole tournament calendar) are
 * Northern Hemisphere, but a home country south of the equator (negative
 * `homeLat`) genuinely has its seasons flipped: December is summer in
 * Australia or New Zealand, not winter. Rather than hardcode "summer = June
 * to August," every season-gated modifier is checked against this, so a
 * Southern Hemisphere career (now or whenever one becomes creatable) always
 * gets its *actual* local weather, not Europe's.
 */
function localSeason(calendar: Calendar, weekIndex: number, homeLat: number): Season {
  const month = Number(monthKeyForWeek(calendar, weekIndex).split("-")[1]);
  const northern = seasonForMonth(month);
  return homeLat < 0 ? OPPOSITE_SEASON[northern] : northern;
}

/** The home country's latitude for `nationality` — missing content data
 * defaults to a positive (Northern Hemisphere) value, since every
 * character-creation nationality today is Northern anyway; only matters if
 * `content.countries` is ever missing an entry the game otherwise expects. */
export function homeLatitudeFor(content: ContentBundle, nationality: string): number {
  return content.countries[nationality]?.lat ?? 1;
}

/**
 * This week's rolled modifier, if any — a pure function of the world seed,
 * week index, and the player's home latitude (the same replay-stable
 * pattern `systems/holidays.ts` already uses), so it needs no persisted
 * state at all. Fires `BALANCE.modifiers.chance` of weeks, never more than
 * one at a time (the plan's "stays a glance, not a report" guardrail) —
 * always drawn from whichever modifiers are eligible for the player's own
 * *local* season (see `localSeason`), so e.g. a heat wave never rolls in a
 * Swedish January.
 */
export function activeWeekModifier(seed: string, weekIndex: number, calendar: Calendar, homeLat: number): WeekModifierDef | null {
  const rng = new Rng(childSeed(seed, weekIndex, "modifier"));
  if (!rng.chance(BALANCE.modifiers.chance)) return null;
  const season = localSeason(calendar, weekIndex, homeLat);
  const eligible = WEEK_MODIFIERS.filter((m) => !m.season || m.season === season);
  return eligible.length > 0 ? rng.pick(eligible) : null;
}

/**
 * `content` with `modifier`'s numeric effects baked straight into the
 * relevant `ActivityDef`s. Every downstream reader (TrainingSystem,
 * FatigueSystem, EconomySystem, `Game.previewPlan`) already pulls
 * training/fatigue/money off `content.activities`, so adjusting the content
 * once here means none of them need their own modifier-aware branch —
 * they simply see a different `trainingBase`/`fatigue`/`money` for the week.
 *
 * **Callers must only ever pass this in for the human's own calculation**
 * (see each system's `player.identity.id === ctx.state.career.playerId`
 * check before choosing which content to read) — a modifier reads as "your
 * club this week," not a change to the wider simulated world, so NPCs must
 * keep training against the unmodified `ctx.content`.
 */
export function weekModifierContent(content: ContentBundle, modifier: WeekModifierDef | null): ContentBundle {
  if (!modifier) return content;
  const activities = { ...content.activities };
  if (modifier.sportMultiplier) {
    for (const [sport, mult] of Object.entries(modifier.sportMultiplier) as [Sport, number][]) {
      const id = TRAIN_ACTIVITY[sport];
      const def = activities[id];
      activities[id] = { ...def, trainingBase: (def.trainingBase ?? 0) * mult };
    }
  }
  if (modifier.extraFatiguePerSession) {
    for (const [sport, amount] of Object.entries(modifier.extraFatiguePerSession) as [Sport, number][]) {
      const id = TRAIN_ACTIVITY[sport];
      const def = activities[id];
      activities[id] = { ...def, fatigue: def.fatigue + amount };
    }
  }
  if (modifier.socialMoneyMultiplier !== undefined) {
    const def = activities.social;
    activities.social = { ...def, money: def.money * modifier.socialMoneyMultiplier };
  }
  return { ...content, activities };
}

/** The one sport, if any, this modifier makes worthless to train this week
 * (`sportMultiplier` exactly 0) — the Planner disables newly picking it,
 * same as an injury or a public holiday already blocks a slot. */
export function blockedSportOf(modifier: WeekModifierDef | null): Sport | null {
  if (!modifier?.sportMultiplier) return null;
  const entry = Object.entries(modifier.sportMultiplier).find(([, mult]) => mult === 0);
  return (entry?.[0] as Sport | undefined) ?? null;
}
