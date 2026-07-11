import type { ActivityType, FatigueTell, InjuryView, LuckTell, Sport, Tactic } from "@racketlon/engine";
import { SPORTS, SPORT_LABELS } from "@racketlon/engine";

/** CSS variable per activity for slot chips and the picker. */
export const ACTIVITY_COLORS: Record<ActivityType, string> = {
  trainTT: "var(--tt)",
  trainBD: "var(--bd)",
  trainSQ: "var(--sq)",
  trainTN: "var(--tn)",
  physical: "var(--physical)",
  rest: "var(--rest)",
  work: "var(--work)",
  social: "var(--social)",
  errands: "var(--errands)",
};

export const SPORT_COLORS: Record<Sport, string> = {
  tt: "var(--tt)",
  bd: "var(--bd)",
  sq: "var(--sq)",
  tn: "var(--tn)",
};

/** Community-convention sport abbreviations (FIR style). */
export const SPORT_SHORT: Record<Sport, string> = {
  tt: "TT",
  bd: "BA",
  sq: "SQ",
  tn: "TE",
};

/** How an opponent's chosen tactic reads to the player, in the moment — this
 * is observable in-match behavior (shot selection you can see), not a hidden
 * stat, so it's fine to name it directly. */
export const TACTIC_READ: Record<Tactic, string> = {
  conserve: "taking it easy",
  safe: "playing it safe",
  normal: "playing normally",
  aggressive: "going for winners",
  allOut: "leaving it all out there",
};

export const FATIGUE_READ: Record<FatigueTell, string> = {
  fresh: "looking fresh",
  working: "working hard",
  tiring: "starting to tire",
  gassed: "gassed",
};

/** Empty string for "neutral" — callers should omit the clause entirely. */
export const LUCK_READ: Record<LuckTell, string> = {
  lucky: "riding some luck",
  neutral: "",
  unlucky: "getting no breaks",
};

export function formatMoney(eur: number): string {
  const sign = eur < 0 ? "−" : "";
  return `${sign}€${Math.abs(Math.round(eur)).toLocaleString("en-US")}`;
}

export function formatSignedMoney(eur: number): string {
  return eur > 0 ? `+${formatMoney(eur)}` : formatMoney(eur);
}

/** Short "🤕 Squash · 3w" style label for the persistent injury badge. */
export function formatInjury(injury: InjuryView): string {
  const isSport = (SPORTS as readonly string[]).includes(injury.type);
  const label = isSport ? SPORT_LABELS[injury.type as Sport] : "Overuse";
  return `🤕 ${label} · ${injury.weeksRemaining}w`;
}

/** ISO 3166-1 alpha-2 → regional-indicator flag emoji (e.g. "SE" → 🇸🇪). */
export function flagEmoji(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

/** Word for a −10..10 confidence value, so the raw number reads plainly. */
export function conditionWord(value: number): string {
  if (value >= 6) return "Excellent";
  if (value >= 2) return "Good";
  if (value > -2) return "Steady";
  if (value > -6) return "Poor";
  return "Rock bottom";
}

/** Word for a 0..20 per-sport form value — "tournament readiness" driven by
 * training neglect (see BALANCE.form). */
export function formWord(value: number): string {
  if (value >= 17) return "Match sharp";
  if (value >= 11) return "Tournament ready";
  if (value >= 6) return "A bit rusty";
  return "Undercooked";
}

/** Traffic-light color for a 0..20 form value, matching `formWord`'s bands. */
export function formColor(value: number): string {
  if (value >= 17) return "var(--ok)";
  if (value >= 11) return "var(--accent)";
  if (value >= 6) return "var(--warn)";
  return "var(--danger)";
}

/** How far a finish got, e.g. "Champion", "Runner-up", "Tied for 5th–8th".
 * Reads finishingPosition/tiedCount (the tied plate band's best position and
 * its size), not roundsWon — under the monrad plate cap, wins alone don't
 * reliably say how deep a run went (see engine systems/summary.ts). */
export function finishLabel(finishingPosition: number, tiedCount: number): string {
  if (finishingPosition === 1) return "Champion";
  if (finishingPosition === 2) return "Runner-up";
  const last = finishingPosition + tiedCount - 1;
  return tiedCount > 1 ? `Tied for ${ordinal(finishingPosition)}–${ordinal(last)}` : `Finished ${ordinal(finishingPosition)}`;
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
