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

/** Word for a −10..10 form/confidence value, so the raw number reads plainly. */
export function conditionWord(value: number): string {
  if (value >= 6) return "Excellent";
  if (value >= 2) return "Good";
  if (value > -2) return "Steady";
  if (value > -6) return "Poor";
  return "Rock bottom";
}

/** How far a career-best finish got, e.g. "Champion", "Final", "Semi-final". */
export function finishLabel(roundsWon: number, totalRounds: number): string {
  const fromFinal = totalRounds - roundsWon;
  if (fromFinal <= 0) return "Champion";
  if (fromFinal === 1) return "Final";
  if (fromFinal === 2) return "Semi-final";
  if (fromFinal === 3) return "Quarter-final";
  return `Round ${roundsWon + 1}`;
}
