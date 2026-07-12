/**
 * In-game calendar. A game week runs Monday–Sunday; the calendar stores the
 * Monday of the current week. Ages are computed from real birth dates against
 * the current in-game date, so players age continuously, not at season end.
 */

export interface Calendar {
  weekIndex: number;
  /** ISO date (YYYY-MM-DD) of the Monday this week starts on */
  mondayISO: string;
}

const DAY_MS = 86_400_000;

export const DEFAULT_START_MONDAY = "2026-01-05";

export function startCalendar(mondayISO: string = DEFAULT_START_MONDAY): Calendar {
  return { weekIndex: 0, mondayISO };
}

export function advanceWeek(cal: Calendar): Calendar {
  const monday = new Date(`${cal.mondayISO}T00:00:00Z`);
  const next = new Date(monday.getTime() + 7 * DAY_MS);
  return { weekIndex: cal.weekIndex + 1, mondayISO: next.toISOString().slice(0, 10) };
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export function weekLabel(cal: Calendar): string {
  const d = new Date(`${cal.mondayISO}T00:00:00Z`);
  const month = MONTHS[d.getUTCMonth()] ?? "";
  return `Week ${cal.weekIndex + 1} · ${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`;
}

/**
 * Label for an arbitrary (usually past) week, derived relative to a known
 * calendar — the log records raw week indices, so career-history views need to
 * turn a bygone weekIndex back into a dated label without a stored calendar.
 */
export function weekLabelAt(cal: Calendar, weekIndex: number): string {
  const monday = new Date(`${cal.mondayISO}T00:00:00Z`);
  const target = new Date(monday.getTime() + (weekIndex - cal.weekIndex) * 7 * DAY_MS);
  return weekLabel({ weekIndex, mondayISO: target.toISOString().slice(0, 10) });
}

/** Calendar year the given (relative) week falls in — for yearly stat buckets. */
export function yearOfWeek(cal: Calendar, weekIndex: number): number {
  const monday = new Date(`${cal.mondayISO}T00:00:00Z`);
  const target = new Date(monday.getTime() + (weekIndex - cal.weekIndex) * 7 * DAY_MS);
  return target.getUTCFullYear();
}

function mondayOfWeek(cal: Calendar, weekIndex: number): Date {
  const monday = new Date(`${cal.mondayISO}T00:00:00Z`);
  return new Date(monday.getTime() + (weekIndex - cal.weekIndex) * 7 * DAY_MS);
}

/** ISO date (YYYY-MM-DD) of the Monday a (possibly past or future, relative
 * to `cal`) weekIndex starts on — the inverse of `weekIndexForDate`. Lets a
 * UI place week-granular state (an injury's start, a trained week) onto a
 * real calendar date. */
export function dateForWeek(cal: Calendar, weekIndex: number): string {
  return mondayOfWeek(cal, weekIndex).toISOString().slice(0, 10);
}

/** "YYYY-MM" of a (relative) week — used to detect month boundaries for the
 * monthly ranking digest. */
export function monthKeyForWeek(cal: Calendar, weekIndex: number): string {
  const d = mondayOfWeek(cal, weekIndex);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "March 2026" for a (relative) week — the ranking digest's headline month. */
export function monthLabelForWeek(cal: Calendar, weekIndex: number): string {
  const d = mondayOfWeek(cal, weekIndex);
  const month = MONTHS_LONG[d.getUTCMonth()] ?? "";
  return `${month} ${d.getUTCFullYear()}`;
}

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/**
 * Which weekIndex (relative to `DEFAULT_START_MONDAY`) a real calendar date
 * falls into — the inverse of `advanceWeek`. Lets real-dated content (the
 * tournament calendar) be placed on the game's week grid without the game
 * itself needing to start on that exact date.
 */
export function weekIndexForDate(dateISO: string, startMondayISO: string = DEFAULT_START_MONDAY): number {
  const start = new Date(`${startMondayISO}T00:00:00Z`);
  const date = new Date(`${dateISO}T00:00:00Z`);
  return Math.floor((date.getTime() - start.getTime()) / (7 * DAY_MS));
}

/** Whole years between birthISO and dateISO. */
export function ageOn(dateISO: string, birthISO: string): number {
  const date = new Date(`${dateISO}T00:00:00Z`);
  const birth = new Date(`${birthISO}T00:00:00Z`);
  let age = date.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    date.getUTCMonth() < birth.getUTCMonth() ||
    (date.getUTCMonth() === birth.getUTCMonth() && date.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}
