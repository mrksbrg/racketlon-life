import { defaultContent } from "@racketlon/content";
import type { CharacterDraft, Sport } from "@racketlon/engine";
import { DEFAULT_START_MONDAY, Rng, SPORTS, rollTraits } from "@racketlon/engine";

export const AGE_MIN = 15;
export const AGE_MAX = 65;
const AGE_MEAN = 30;
const AGE_SD = 10;

/** Point-buy rules for the creation screen — every stat on a 1–20 scale. */
export const STAT_MIN = 1;
export const STAT_MAX = 20;
/** Racket skills and character attributes are separate pools — you can't dump
 * everything into one axis. **Sports are cost-progressive**: raising a sport
 * to a higher level costs more points than a low one (mirroring the convex
 * in-game level curve — see `sportStepCost`), so the 50-point budget forces
 * specialization (one strong sport + weak others, or a flat-mediocre spread,
 * never strong-in-all-four). Attributes stay **flat** (1 point per level) —
 * a separate, simpler mechanic. */
export const SPORT_POINT_BUDGET = 50;
export const ATTR_POINT_BUDGET = 36;

/**
 * Marginal creation cost to raise a sport INTO `level` (from `level-1`).
 * Progressive tiers mirror the convex in-game curve: 1 pt/level through 5,
 * then 2 through 9, 3 through 13, 4 through 17, 5 through 20. Level 1 is a
 * free floor (cost 0). Cumulative: L5=4, L10=15, L15=32, L20=55 — so a single
 * maxed sport eats more than the whole budget. */
function sportStepCost(level: number): number {
  if (level <= 1) return 0;
  if (level <= 5) return 1;
  if (level <= 9) return 2;
  if (level <= 13) return 3;
  if (level <= 17) return 4;
  return 5;
}

/** Cumulative creation cost to have a sport AT `level` (level 1 = free). */
export function sportCostForLevel(level: number): number {
  let cost = 0;
  for (let l = 2; l <= level; l++) cost += sportStepCost(l);
  return cost;
}

/** Cumulative point cost of a stat at `level` in its pool — progressive for
 * sports, flat (= level) for attributes. */
function costForLevel(key: StatKey, level: number): number {
  return isSportKey(key) ? sportCostForLevel(level) : level;
}

/** Points to raise `key` by one level, from its current value — the tier cost
 * for a sport, a flat 1 for an attribute. */
function raiseCost(key: StatKey, currentLevel: number): number {
  return isSportKey(key) ? sportStepCost(currentLevel + 1) : 1;
}

/** The character attributes, in display order. */
export type CharAttr = "stamina" | "coreStrength" | "intelligence" | "clutch" | "composure" | "resilience";

/** Any stat the pool spends on — the four sports plus the character attributes. */
export type StatKey = Sport | CharAttr;

export const CHAR_ATTRS: readonly CharAttr[] = [
  "stamina",
  "coreStrength",
  "intelligence",
  "clutch",
  "composure",
  "resilience",
];

export interface StatMeta {
  label: string;
  /** one-line hint shown under the label */
  hint: string;
  /** CSS variable for the bar/icon */
  color: string;
}

export const SPORT_META: Record<Sport, StatMeta> = {
  tt: { label: "Table tennis", hint: "", color: "var(--tt)" },
  bd: { label: "Badminton", hint: "", color: "var(--bd)" },
  sq: { label: "Squash", hint: "", color: "var(--sq)" },
  tn: { label: "Tennis", hint: "", color: "var(--tn)" },
};

export const ATTR_META: Record<CharAttr, StatMeta> = {
  stamina: { label: "Endurance", hint: "Fuel for long matches", color: "var(--cardio)" },
  coreStrength: { label: "Core strength", hint: "Built in the gym", color: "var(--gym)" },
  intelligence: { label: "Intelligence", hint: "Unlocks university studies", color: "var(--tn)" },
  clutch: { label: "Clutch", hint: "Wins the deciding gummiarm", color: "var(--tt)" },
  composure: { label: "Composure", hint: "Shrugs off setbacks", color: "var(--sq)" },
  resilience: { label: "Resilience", hint: "Heals fast (läkekött)", color: "var(--ok)" },
};

/** Gendered first-name and shared last-name pools per nationality. */
interface NamePool {
  name: string;
  m: string[];
  f: string[];
  last: string[];
}

export const NATIONALITIES: Record<string, NamePool> = {
  SE: {
    name: "Sweden",
    m: ["Erik", "Johan", "Anders", "Mats", "Henrik", "Lars"],
    f: ["Karin", "Elin", "Sofia", "Anna", "Sara", "Ida"],
    last: ["Andersson", "Johansson", "Karlsson", "Nilsson", "Eriksson", "Lindberg"],
  },
  DK: {
    name: "Denmark",
    m: ["Mads", "Jesper", "Kasper", "Søren", "Niels", "Anders"],
    f: ["Mette", "Lene", "Camilla", "Freja", "Ida", "Sofie"],
    last: ["Jensen", "Nielsen", "Hansen", "Pedersen", "Andersen", "Larsen"],
  },
  FI: {
    name: "Finland",
    m: ["Mikko", "Juha", "Antti", "Ville", "Pekka", "Timo"],
    f: ["Laura", "Sanna", "Aino", "Emilia", "Noora", "Sofia"],
    last: ["Korhonen", "Virtanen", "Mäkinen", "Nieminen", "Laine", "Koskinen"],
  },
  NO: {
    name: "Norway",
    m: ["Ole", "Lars", "Kristian", "Magnus", "Espen", "Jonas"],
    f: ["Ingrid", "Silje", "Anette", "Kari", "Nora", "Maria"],
    last: ["Hansen", "Johansen", "Olsen", "Larsen", "Andersen", "Nilsen"],
  },
  DE: {
    name: "Germany",
    m: ["Stefan", "Michael", "Andreas", "Thomas", "Markus", "Jan"],
    f: ["Julia", "Katrin", "Sabine", "Nina", "Laura", "Anna"],
    last: ["Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Wagner"],
  },
  AT: {
    name: "Austria",
    m: ["Lukas", "Florian", "Christoph", "Sebastian", "Bernhard", "David"],
    f: ["Anna", "Marlene", "Verena", "Katharina", "Lisa", "Sophie"],
    last: ["Gruber", "Huber", "Bauer", "Wagner", "Pichler", "Steiner"],
  },
  GB: {
    name: "Great Britain",
    m: ["James", "Oliver", "Harry", "Thomas", "Daniel", "Jack"],
    f: ["Charlotte", "Emma", "Sophie", "Lucy", "Hannah", "Olivia"],
    last: ["Smith", "Jones", "Taylor", "Brown", "Wilson", "Davies"],
  },
};

const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;

export function statValue(draft: CharacterDraft, key: StatKey): number {
  return SPORTS.includes(key as Sport)
    ? draft.sports[key as Sport]
    : (draft[key as CharAttr] as number);
}

function setStat(draft: CharacterDraft, key: StatKey, value: number): void {
  if (SPORTS.includes(key as Sport)) draft.sports[key as Sport] = value;
  else (draft[key as CharAttr] as number) = value;
}

export const ALL_KEYS: readonly StatKey[] = [...SPORTS, ...CHAR_ATTRS];

function isSportKey(key: StatKey): key is Sport {
  return (SPORTS as readonly string[]).includes(key);
}

/** Which independent point pool a stat draws from. */
export function poolFor(key: StatKey): "sport" | "attr" {
  return isSportKey(key) ? "sport" : "attr";
}

export function budgetFor(pool: "sport" | "attr"): number {
  return pool === "sport" ? SPORT_POINT_BUDGET : ATTR_POINT_BUDGET;
}

export function sportPointsSpent(draft: CharacterDraft): number {
  return SPORTS.reduce((sum, k) => sum + costForLevel(k, statValue(draft, k)), 0);
}

export function attrPointsSpent(draft: CharacterDraft): number {
  return CHAR_ATTRS.reduce((sum, k) => sum + statValue(draft, k), 0);
}

export function sportPointsRemaining(draft: CharacterDraft): number {
  return SPORT_POINT_BUDGET - sportPointsSpent(draft);
}

export function attrPointsRemaining(draft: CharacterDraft): number {
  return ATTR_POINT_BUDGET - attrPointsSpent(draft);
}

/** Points remaining in whichever pool `key` belongs to. */
export function poolPointsRemaining(draft: CharacterDraft, key: StatKey): number {
  return poolFor(key) === "sport" ? sportPointsRemaining(draft) : attrPointsRemaining(draft);
}

/** True when a +1 on `key` is legal — headroom on the stat, and enough points
 * left in its pool to cover this specific step (progressive for sports). */
export function canRaise(draft: CharacterDraft, key: StatKey): boolean {
  const value = statValue(draft, key);
  return value < STAT_MAX && poolPointsRemaining(draft, key) >= raiseCost(key, value);
}

/** Point cost of the next `+1` on `key`, for surfacing on the stepper. 0 when
 * already at the cap. */
export function nextRaiseCost(draft: CharacterDraft, key: StatKey): number {
  const value = statValue(draft, key);
  return value >= STAT_MAX ? 0 : raiseCost(key, value);
}

export function canLower(draft: CharacterDraft, key: StatKey): boolean {
  return statValue(draft, key) > STAT_MIN;
}

export function adjust(draft: CharacterDraft, key: StatKey, delta: 1 | -1): void {
  if (delta === 1 && !canRaise(draft, key)) return;
  if (delta === -1 && !canLower(draft, key)) return;
  setStat(draft, key, statValue(draft, key) + delta);
}

export function randomName(nationality: string, gender: "m" | "f"): { first: string; last: string } {
  const pool = NATIONALITIES[nationality] ?? NATIONALITIES.SE!;
  return { first: pick(gender === "m" ? pool.m : pool.f), last: pick(pool.last) };
}

/** Box–Muller normal sample, mean/sd in years, resampled until it lands in
 * [AGE_MIN, AGE_MAX] — rejection rather than clamping so the distribution
 * doesn't pile up at the boundaries. */
function randomAge(): number {
  for (let i = 0; i < 20; i++) {
    const u1 = Math.max(Math.random(), Number.EPSILON);
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const age = Math.round(AGE_MEAN + z * AGE_SD);
    if (age >= AGE_MIN && age <= AGE_MAX) return age;
  }
  return AGE_MEAN;
}

function randomBirthDate(): string {
  const referenceYear = Number(DEFAULT_START_MONDAY.slice(0, 4));
  const year = referenceYear - randomAge();
  const month = 1 + Math.floor(Math.random() * 12);
  const day = 1 + Math.floor(Math.random() * 28);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Whole-years age as of the game's start date — for display on the
 * creation screen before a career (and its own calendar) exists. */
export function ageFromBirthDate(birthDate: string): number {
  const ref = new Date(`${DEFAULT_START_MONDAY}T00:00:00Z`);
  const born = new Date(`${birthDate}T00:00:00Z`);
  let age = ref.getUTCFullYear() - born.getUTCFullYear();
  const beforeBirthdayThisYear =
    ref.getUTCMonth() < born.getUTCMonth() ||
    (ref.getUTCMonth() === born.getUTCMonth() && ref.getUTCDate() < born.getUTCDate());
  if (beforeBirthdayThisYear) age--;
  return age;
}

/**
 * A spiky, valid spread that sums to exactly `budget`. Each stat gets a
 * random weight, then points rain down weighted toward the high-weight stats —
 * so one roll makes a squash grinder, the next a table-tennis flat-tracker,
 * rather than everyone landing near the average.
 */
function rerollPool(draft: CharacterDraft, keys: readonly StatKey[], budget: number): void {
  for (const k of keys) setStat(draft, k, STAT_MIN);
  const weights = new Map<StatKey, number>();
  for (const k of keys) weights.set(k, Math.pow(Math.random(), 1.7) + 0.04);

  // start from the budget minus what the floor levels already cost (0 per
  // sport, 1 per attribute), then rain points down one level at a time,
  // each raise costing the progressive tier for that step (see raiseCost)
  let remaining = budget - keys.reduce((s, k) => s + costForLevel(k, STAT_MIN), 0);
  while (remaining > 0) {
    const eligible = keys.filter(
      (k) => statValue(draft, k) < STAT_MAX && raiseCost(k, statValue(draft, k)) <= remaining,
    );
    if (eligible.length === 0) break;
    const total = eligible.reduce((s, k) => s + weights.get(k)!, 0);
    let r = Math.random() * total;
    let chosen = eligible[0]!;
    for (const k of eligible) {
      r -= weights.get(k)!;
      if (r <= 0) {
        chosen = k;
        break;
      }
    }
    remaining -= raiseCost(chosen, statValue(draft, chosen));
    setStat(draft, chosen, statValue(draft, chosen) + 1);
  }
}

/** Rerolls sports and character traits as two independent pools — see
 * `SPORT_POINT_BUDGET`/`ATTR_POINT_BUDGET`. */
export function rerollStats(draft: CharacterDraft): void {
  rerollPool(draft, SPORTS, SPORT_POINT_BUDGET);
  rerollPool(draft, CHAR_ATTRS, ATTR_POINT_BUDGET);
}

/** A fresh, fully-randomised character — the game's opening roll. */
export function randomDraft(): CharacterDraft {
  const nationality = pick(Object.keys(NATIONALITIES));
  const gender: "m" | "f" = Math.random() < 0.5 ? "m" : "f";
  const { first, last } = randomName(nationality, gender);
  const draft: CharacterDraft = {
    firstName: first,
    lastName: last,
    nationality,
    gender,
    birthDate: randomBirthDate(),
    sports: { tt: STAT_MIN, bd: STAT_MIN, sq: STAT_MIN, tn: STAT_MIN },
    stamina: STAT_MIN,
    coreStrength: STAT_MIN,
    intelligence: STAT_MIN,
    clutch: STAT_MIN,
    composure: STAT_MIN,
    resilience: STAT_MIN,
    // rolled once here (not at world creation) so the creation screen can
    // preview the exact traits the career will start with
    traits: rollTraits(new Rng(`draft-${Math.random()}`), defaultContent),
  };
  rerollStats(draft);
  return draft;
}
