import type { ContentBundle } from "../content.js";

/**
 * National public holidays, resolved per calendar year from content
 * (`CountryDef.holidays`). Fixed dates repeat every year; movable feasts are
 * expressed as named offsets from Easter Sunday and computed via `computus`,
 * so a multi-year career stays correct without per-year data. Holidays are
 * days off that don't cost vacation (see systems/vacation.ts) and show red on
 * the season calendar.
 */

const DAY_MS = 86_400_000;

/** Movable feasts as day offsets from Easter Sunday. */
const EASTER_OFFSETS: Record<string, number> = {
  "maundy-thursday": -3,
  "good-friday": -2,
  "holy-saturday": -1,
  "easter-sunday": 0,
  "easter-monday": 1,
  ascension: 39,
  "whit-sunday": 49,
  "whit-monday": 50,
  "corpus-christi": 60,
};

/** Human-readable labels for the calendar/agenda. */
const EASTER_LABELS: Record<string, string> = {
  "maundy-thursday": "Maundy Thursday",
  "good-friday": "Good Friday",
  "holy-saturday": "Holy Saturday",
  "easter-sunday": "Easter Sunday",
  "easter-monday": "Easter Monday",
  ascension: "Ascension Day",
  "whit-sunday": "Whit Sunday",
  "whit-monday": "Whit Monday",
  "corpus-christi": "Corpus Christi",
};

/**
 * Easter Sunday for a given year (Gregorian), as an ISO date. Anonymous
 * ("Meeus/Jones/Butcher") computus — valid for all Gregorian years.
 */
export function computus(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDays(iso: string, days: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

const cache = new Map<string, Map<string, string>>();

/**
 * ISO date → holiday name for one country and calendar year. Memoized per
 * (country, year) — the set is stable and read every week from the same
 * nationality.
 */
export function publicHolidaySet(country: string, year: number, content: ContentBundle): Map<string, string> {
  const key = `${country}:${year}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const out = new Map<string, string>();
  const schedule = content.countries[country]?.holidays;
  if (schedule) {
    for (const md of schedule.fixed) {
      out.set(`${year}-${md}`, "Public holiday");
    }
    const easterSunday = computus(year);
    for (const name of schedule.easter) {
      const offset = EASTER_OFFSETS[name];
      if (offset === undefined) continue;
      out.set(addDays(easterSunday, offset), EASTER_LABELS[name] ?? "Public holiday");
    }
  }
  cache.set(key, out);
  return out;
}

/** Whether `dateISO` (YYYY-MM-DD) is a public holiday in `country`. */
export function isPublicHoliday(country: string, dateISO: string, content: ContentBundle): boolean {
  const year = Number(dateISO.slice(0, 4));
  return publicHolidaySet(country, year, content).has(dateISO);
}

/** All public holidays in `country` for `year`, sorted by date — for calendar views. */
export function publicHolidays(country: string, year: number, content: ContentBundle): { date: string; name: string }[] {
  return [...publicHolidaySet(country, year, content).entries()]
    .map(([date, name]) => ({ date, name }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
