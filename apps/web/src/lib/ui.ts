import type { ActivityType, FatigueTell, FirStandingView, InjuryView, LuckTell, MentalTell, Sport, Tactic } from "@racketlon/engine";
import { SPORTS, SPORT_LABELS } from "@racketlon/engine";

/** CSS variable per activity for slot chips and the picker. */
export const ACTIVITY_COLORS: Record<ActivityType, string> = {
  trainTT: "var(--tt)",
  trainBD: "var(--bd)",
  trainSQ: "var(--sq)",
  trainTN: "var(--tn)",
  gym: "var(--gym)",
  cardio: "var(--cardio)",
  rest: "var(--rest)",
  work: "var(--work)",
  social: "var(--social)",
  travel: "var(--muted)",
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

/** Same bucket boundaries as `fatigueTell`, so a bar colored by this always
 * agrees with the bucketed prose read ("looking fresh" etc). Used for both
 * sides' energy bars — the opponent's fill width also tracks their real
 * energy 1:1 (not just the bucket), since a bar that only moved in four big
 * jumps between bucket midpoints read as jarringly "swingy" rather than the
 * gradual drain match play actually is. Only the *label* stays wordy
 * (`FATIGUE_LABEL`) rather than a raw number — enough restraint to keep it
 * a read, not a readout, without sacrificing smooth, legible motion. */
export function energyColor(energy: number): string {
  if (energy >= 80) return "var(--ok)";
  if (energy >= 55) return "var(--accent)";
  if (energy >= 30) return "var(--warn)";
  return "var(--danger)";
}

/** Short label for the opponent energy bar's value column — a terser
 * companion to `FATIGUE_READ`'s full-sentence clause. */
export const FATIGUE_LABEL: Record<FatigueTell, string> = {
  fresh: "Fresh",
  working: "Working",
  tiring: "Tiring",
  gassed: "Gassed",
};

/** Empty string for "neutral" — callers should omit the clause entirely. */
export const LUCK_READ: Record<LuckTell, string> = {
  lucky: "riding some luck",
  neutral: "",
  unlucky: "getting no breaks",
};

export const MENTAL_LABEL: Record<MentalTell, string> = {
  lockedIn: "Locked in",
  confident: "Confident",
  steady: "Steady",
  shaky: "Shaky",
  fragile: "Fragile",
};

export function mentalColor(strength: number): string {
  if (strength >= 80) return "var(--ok)";
  if (strength >= 65) return "var(--accent)";
  if (strength >= 40) return "var(--warn)";
  return "var(--danger)";
}

/** Maps the match's signed momentum EMA (typically ±0.2, occasionally up to
 * ~±0.45 during a real run — see `BALANCE.match.momentumWeight`'s doc
 * comment) to a 0..100 bar position: 50 is neutral, 100 is entirely in
 * side "a"'s (your) favor, 0 entirely the opponent's. Clamped at ±0.4,
 * comfortably past the typical p90 swing, so one wild run doesn't peg the
 * bar at an extreme it can never move past again. */
export function momentumBarPosition(momentum: number): number {
  const clamp = 0.4;
  const clamped = Math.max(-clamp, Math.min(clamp, momentum));
  return 50 + (clamped / clamp) * 50;
}

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

/** "#12 · 1,879" for a field-list row — FIR rank first (the official
 * ladder, docs/07's "three information layers"), Glicko rating after. Rank
 * shows "Unranked" rather than a blank when there's no counted result yet
 * (true for roughly half the roster), so the rating alone still tells you
 * something about a player without a real ranking. */
export function formatFieldStanding(opp: { firStanding: FirStandingView | null; rating: number }): string {
  const rank = opp.firStanding ? `#${opp.firStanding.rank}` : "Unranked";
  return `${rank} · ${opp.rating}`;
}

/** A player's seed as it appears on a draw sheet, e.g. "[1]" — empty string
 * for an unseeded player, so it can be dropped straight into markup. */
export function seedBadge(seed: number | undefined): string {
  return seed === undefined ? "" : `[${seed}]`;
}

/** "CHA New Zealand Open 2026" — tour tier badge + tournament name + year,
 * the compact tournament identifier used on the Me screen's Records tab.
 * Omits the tier prefix when unknown (matches logged before that field
 * existed carry an empty string, not a guess). */
export function tournamentLabel(tier: string, name: string, year: number): string {
  return tier ? `${tier} ${name} ${year}` : `${name} ${year}`;
}

/** A played match's set scores as a single draw-sheet line, e.g.
 * "21-15 18-21 21-9 7-11" — empty for a not-yet-played match. */
export function setScoreLine(sets: { a: number; b: number }[] | undefined): string {
  return sets && sets.length > 0 ? sets.map((s) => `${s.a}-${s.b}`).join(" ") : "";
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
