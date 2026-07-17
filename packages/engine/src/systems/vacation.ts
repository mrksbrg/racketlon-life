import { BALANCE } from "../balance.js";
import type { ContentBundle } from "../content.js";
import { PERIODS, slotIndex, type PlayerPlan } from "../model/plan.js";
import { isPublicHoliday } from "./holidays.js";

/**
 * Paid-leave accounting for the human career. Every amateur holds a day job:
 * a normal working week is Morning + Afternoon on Mon–Fri. Taking one of
 * those slots off (anything other than `work`) draws down a finite annual
 * vacation allowance, unless the day is a public holiday. Evenings and
 * weekends are personal time and never cost anything. The allowance resets
 * each calendar year (see orchestrator.simulateWeek) and may go negative
 * (over-drawn leave) — shown red, no mechanical penalty in this first pass.
 */

const DAY_MS = 86_400_000;

/** Weekdays are day indices 0–4 (Mon–Fri); the two work periods are 0 & 1. */
const WORK_DAYS = 5;
const WORK_PERIODS = [PERIODS.indexOf("Morning"), PERIODS.indexOf("Afternoon")];
/** each empty work slot on a normal working day costs half a vacation day */
const COST_PER_SLOT = 0.5;

/** Annual paid-leave allowance for a player based in `country`, at `age`. */
export function annualAllowance(country: string, age: number, content: ContentBundle): number {
  const base = content.countries[country]?.vacationDays ?? BALANCE.vacation.defaultDays;
  const { bonusFromAge, bonusPerYears, bonusCap } = BALANCE.vacation;
  const bonus = age > bonusFromAge ? Math.min(bonusCap, Math.floor((age - bonusFromAge) / bonusPerYears)) : 0;
  return base + bonus;
}

function addDays(iso: string, days: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Vacation days a given week's plan consumes: 0.5 per Mon–Fri Morning/
 * Afternoon slot that isn't `work`, skipping public holidays.
 */
export function vacationDaysUsedBy(
  plan: PlayerPlan,
  mondayISO: string,
  country: string,
  content: ContentBundle,
): number {
  let used = 0;
  for (let day = 0; day < WORK_DAYS; day++) {
    const dateISO = addDays(mondayISO, day);
    if (isPublicHoliday(country, dateISO, content)) continue;
    for (const period of WORK_PERIODS) {
      if (plan.slots[slotIndex(day, period)] !== "work") used += COST_PER_SLOT;
    }
  }
  return used;
}
