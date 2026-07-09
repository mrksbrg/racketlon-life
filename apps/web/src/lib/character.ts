import type { CharacterDraft, Sport } from "@racketlon/engine";
import { DEFAULT_START_MONDAY, SPORTS } from "@racketlon/engine";

export const AGE_MIN = 15;
export const AGE_MAX = 65;
const AGE_MEAN = 30;
const AGE_SD = 10;

/** Point-buy rules for the creation screen — every stat on a 1–20 scale. */
export const STAT_MIN = 1;
export const STAT_MAX = 20;
/** Racket skills and character traits are separately weighted pools — dumping
 * everything into one axis (e.g. maxing traits while sports sit at rock
 * bottom) shouldn't be possible. Sports get the bigger average per stat
 * (11 of 20) since they're the primary, visible progression axis; traits are
 * supporting stats (6 of 20 avg). */
export const SPORT_POINT_BUDGET = 44;
export const ATTR_POINT_BUDGET = 30;

/** The five character attributes, in display order. */
export type CharAttr = "stamina" | "intelligence" | "clutch" | "composure" | "resilience";

/** Any stat the pool spends on — the four sports plus the five attributes. */
export type StatKey = Sport | CharAttr;

export const CHAR_ATTRS: readonly CharAttr[] = [
  "stamina",
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
  stamina: { label: "Stamina", hint: "Fuel for long matches", color: "var(--physical)" },
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
  return SPORTS.reduce((sum, k) => sum + statValue(draft, k), 0);
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

/** True when a +1 on `key` is legal (headroom on the stat and points left in its own pool). */
export function canRaise(draft: CharacterDraft, key: StatKey): boolean {
  return statValue(draft, key) < STAT_MAX && poolPointsRemaining(draft, key) > 0;
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

  let remaining = budget - keys.length * STAT_MIN;
  while (remaining > 0) {
    const eligible = keys.filter((k) => statValue(draft, k) < STAT_MAX);
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
    setStat(draft, chosen, statValue(draft, chosen) + 1);
    remaining--;
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
    intelligence: STAT_MIN,
    clutch: STAT_MIN,
    composure: STAT_MIN,
    resilience: STAT_MIN,
  };
  rerollStats(draft);
  return draft;
}
