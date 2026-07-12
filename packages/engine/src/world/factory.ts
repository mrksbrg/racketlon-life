import { BALANCE } from "../balance.js";
import type { ContentBundle, RealPlayerDef, TraitTone } from "../content.js";
import { startCalendar } from "../core/date.js";
import { Rng, childSeed } from "../core/rng.js";
import type { GameState } from "../core/state.js";
import { SAVE_VERSION } from "../core/state.js";
import type { Glicko, Player, Ratings, SimTier, Skills } from "../model/player.js";
import type { Sport } from "../model/sport.js";
import { SPORTS, skillForLevel } from "../model/sport.js";
import { generateInboxMessages } from "../systems/inbox.js";
import { combinedRating } from "../systems/ranking.js";

const RARITY_WEIGHT = { common: 60, uncommon: 30, rare: 10 } as const;

/**
 * Rolls 3–4 traits for a new character: exactly one from each tone
 * (positive/negative/neutral) as a baseline, with a coin-flip chance to
 * bump one random tone to two — matching the "1-2 pos, 1-2 neg, 1-2
 * neutral, max 4 total" spec. Picks are weighted by rarity and never
 * violate a trait's `excludes` list against traits already chosen (across
 * tones, since e.g. Familjekär excludes the positive-toned Äventyrlig).
 */
export function rollTraits(rng: Rng, content: ContentBundle): string[] {
  const pool = Object.values(content.traits);
  const counts: Record<TraitTone, number> = { positive: 1, negative: 1, neutral: 1 };
  if (rng.chance(0.5)) {
    const tones: TraitTone[] = ["positive", "negative", "neutral"];
    counts[rng.pick(tones)] += 1;
  }

  const chosen: string[] = [];
  const tones: TraitTone[] = ["positive", "negative", "neutral"];
  for (const tone of tones) {
    for (let i = 0; i < counts[tone]; i++) {
      const candidates = pool.filter(
        (t) =>
          t.tone === tone &&
          !chosen.includes(t.id) &&
          !(t.excludes ?? []).some((id) => chosen.includes(id)) &&
          !chosen.some((id) => (content.traits[id]?.excludes ?? []).includes(t.id)),
      );
      if (candidates.length === 0) continue;
      const totalWeight = candidates.reduce((sum, t) => sum + RARITY_WEIGHT[t.rarity], 0);
      let r = rng.range(0, totalWeight);
      let picked = candidates[0]!;
      for (const c of candidates) {
        r -= RARITY_WEIGHT[c.rarity];
        if (r <= 0) {
          picked = c;
          break;
        }
      }
      chosen.push(picked.id);
    }
  }
  return chosen;
}

/**
 * Placeholder world for M0: the human career player plus 11 generated
 * NPCs. Replaced in M2 by the FIR world bundle (real players, real
 * Glicko-2 ratings mapped to internal skills).
 */

/** Placeholder inverse mapping until the FIR import pipeline lands (M2). */
function glickoFromSkill(skill: number): Glicko {
  return { rating: Math.round(800 + (skill / 1000) * 1600), rd: 150, volatility: 0.06 };
}

function allSports<T>(value: T): Record<Sport, T> {
  return { tt: value, bd: value, sq: value, tn: value };
}

/** Rolls each sport independently in [lo, hi) — some sports a player is just
 * naturally suited for, others where they'll plateau earlier (see
 * PlayerAttributes.potential). */
function rollPotential(rng: Rng, lo: number, hi: number): Record<Sport, number> {
  const out = {} as Record<Sport, number>;
  for (const sport of SPORTS) out[sport] = rng.range(lo, hi);
  return out;
}

function ratingsFromSkills(skills: Skills): Ratings {
  return {
    tt: glickoFromSkill(skills.tt),
    bd: glickoFromSkill(skills.bd),
    sq: glickoFromSkill(skills.sq),
    tn: glickoFromSkill(skills.tn),
  };
}

interface PlayerSpec {
  id: string;
  firstName: string;
  lastName: string;
  nationality: string;
  birthDate: string;
  gender: "m" | "f";
  skills: Skills;
  potential: Record<Sport, number>;
  durability: number;
  professionalism: number;
  stamina: number;
  coreStrength: number;
  intelligence: number;
  clutch: number;
  composure: number;
  traits: string[];
  /** real FIR ranking points, for tournament division placement — see
   * {@link Player.firPoints}. Always null for the human this pass. */
  firPoints: number | null;
  simTier: SimTier;
}

function makePlayer(spec: PlayerSpec): Player {
  return {
    identity: {
      id: spec.id,
      firstName: spec.firstName,
      lastName: spec.lastName,
      nationality: spec.nationality,
      birthDate: spec.birthDate,
      gender: spec.gender,
      isReal: false,
    },
    attributes: {
      skills: { ...spec.skills },
      potential: { ...spec.potential },
      durability: spec.durability,
      professionalism: spec.professionalism,
      stamina: spec.stamina,
      coreStrength: spec.coreStrength,
      intelligence: spec.intelligence,
      clutch: spec.clutch,
      composure: spec.composure,
      traits: spec.traits,
    },
    condition: {
      fatigue: 20,
      formBySport: allSports(BALANCE.form.initial),
      neglectWeeks: allSports(0),
      confidence: 0,
      injury: null,
      agingSteps: { step1: false, step2: false },
    },
    ratings: ratingsFromSkills(spec.skills),
    firPoints: spec.firPoints,
    firResults: [],
    simTier: spec.simTier,
    recentResults: [],
  };
}

/**
 * The player the human builds on the character-creation screen. Every stat is
 * on the display scale of 1–20 (the same bands as {@link levelForSkill}); the
 * conversion to internal 0–1000 skills and 0–1 attributes lives in
 * {@link specFromDraft}.
 */
export interface CharacterDraft {
  firstName: string;
  lastName: string;
  nationality: string;
  gender: "m" | "f";
  birthDate: string;
  /** 1–20 per sport */
  sports: Skills;
  /** 1–20 each */
  stamina: number;
  coreStrength: number;
  intelligence: number;
  clutch: number;
  composure: number;
  /** 1–20, "Läkekött" → durability */
  resilience: number;
  /** rolled once when the draft is created (see {@link rollTraits}) — carried
   * through as-is so what's previewed on the creation screen is what the
   * career actually gets, rather than re-rolled at world creation. */
  traits: string[];
}

/** Level L (1–20) → 0..1 attribute. */
function unitFromLevel(level: number): number {
  return level / 20;
}

function specFromDraft(draft: CharacterDraft, rng: Rng): PlayerSpec {
  // skillForLevel (model/sport.ts) is the exact inverse of the convex level
  // curve, so a draft's 1–20 pick round-trips back to the same display level
  const skills = {} as Skills;
  for (const sport of SPORTS) skills[sport] = skillForLevel(draft.sports[sport]);
  return {
    id: "you",
    firstName: draft.firstName,
    lastName: draft.lastName,
    nationality: draft.nationality,
    birthDate: draft.birthDate,
    gender: draft.gender,
    skills,
    // potential is a hidden per-sport ceiling roll — not point-bought on the screen
    potential: rollPotential(rng, 0.45, 0.8),
    durability: unitFromLevel(draft.resilience),
    // the human plans manually, so professionalism (an AI-planning input) is neutral
    professionalism: 0.7,
    stamina: unitFromLevel(draft.stamina),
    coreStrength: unitFromLevel(draft.coreStrength),
    intelligence: unitFromLevel(draft.intelligence),
    clutch: unitFromLevel(draft.clutch),
    composure: unitFromLevel(draft.composure),
    // rolled on the creation screen already — see CharacterDraft.traits
    traits: draft.traits,
    // no in-game points-earning system yet — always lowest division (see docs/07)
    firPoints: null,
    simTier: 0,
  };
}

/**
 * Builds a real FIR player's per-world spec. All sampling comes from one
 * deterministic stream keyed on `(worldSeed, playerId)`, so the same real
 * player is reproducible within a career and varies (within their rating's
 * uncertainty) between different careers — never falsifying strong data
 * (low RD stays close to the mapped rating; high RD scatters more).
 */
function specFromRealPlayer(def: RealPlayerDef, worldSeed: string): PlayerSpec {
  const rng = new Rng(childSeed(worldSeed, "real", def.playerId));
  const skills = {} as Skills;
  for (const sport of SPORTS) {
    const r = def.ratings[sport];
    const sampled = rng.normal(r.skill, BALANCE.import.rdSampleK * r.rdSkill);
    skills[sport] = Math.round(Math.max(0, Math.min(1000, sampled)));
  }
  const birthDate =
    def.birthYear !== null
      ? `${def.birthYear}-${String(1 + rng.int(12)).padStart(2, "0")}-${String(1 + rng.int(28)).padStart(2, "0")}`
      : randomBirthDate(rng);
  return {
    id: def.playerId,
    firstName: def.firstName,
    lastName: def.lastName,
    nationality: def.nationality,
    birthDate,
    gender: def.gender,
    skills,
    potential: rollPotential(rng, 0.2, 0.9),
    durability: rng.range(0.3, 0.9),
    professionalism: rng.range(0.2, 0.9),
    stamina: rng.range(0.3, 0.9),
    coreStrength: rng.range(0.3, 0.9),
    intelligence: rng.range(0.2, 0.9),
    clutch: rng.range(0.2, 0.9),
    composure: rng.range(0.2, 0.9),
    // real-player traits are M4 scope — see docs/06
    traits: [],
    firPoints: def.firPoints,
    simTier: 1,
  };
}

export interface WorldOptions {
  seed: string;
  content: ContentBundle;
  playerName?: { first: string; last: string };
  /** Full character from the creation screen; overrides playerName when set. */
  character?: CharacterDraft;
}

export function createPlaceholderWorld(options: WorldOptions): GameState {
  const { seed, content } = options;
  const rng = new Rng(childSeed(seed, "world"));

  const human: PlayerSpec = options.character
    ? specFromDraft(options.character, rng)
    : {
        // fallback career player: a Swedish club all-rounder in their late twenties
        id: "you",
        firstName: options.playerName?.first ?? "Alex",
        lastName: options.playerName?.last ?? "Berg",
        nationality: "SE",
        birthDate: "1998-04-12",
        gender: "m",
        skills: { tt: 380, bd: 340, sq: 300, tn: 260 },
        potential: allSports(0.6),
        durability: 0.6,
        professionalism: 0.7,
        stamina: 0.55,
        coreStrength: 0.55,
        intelligence: 0.5,
        clutch: 0.5,
        composure: 0.5,
        traits: rollTraits(rng, content),
        firPoints: null,
        simTier: 0,
      };

  const players: Player[] = [makePlayer(human)];

  // Real racketlon players imported from scraped FIR ratings (see
  // packages/content/src/import/README.md) — the world-bundle roster is
  // every mappable player of both genders (no cap), so this is a direct 1:1
  // mapping, not a generation loop. Each player's exact per-world
  // skill/attributes are sampled here (world-creation time), from the mapped
  // rating (build time), so the same real player varies slightly between
  // careers without falsifying strong data.
  for (const def of content.players) {
    players.push(makePlayer(specFromRealPlayer(def, seed)));
  }

  const state: GameState = {
    saveVersion: SAVE_VERSION,
    contentVersion: content.version,
    seed,
    calendar: startCalendar(),
    players,
    career: {
      playerId: "you",
      money: BALANCE.economy.startingMoney,
      titles: [],
      bestRating: Math.round(combinedRating(players[0]!)),
      tournamentEntries: [],
      inbox: [
        {
          id: "welcome",
          week: 0,
          category: "welcome",
          from: "Your coach",
          subject: "Welcome to the tour",
          body:
            "This is your inbox — invitations, monthly rankings, and news land here. " +
            "Plan your weeks, register for tournaments on the Tour, and let's build a career.",
          read: false,
        },
      ],
      trainedWeeks: [],
    },
  };

  // seed week-0 messages (invitations already open, the opening ranking) so
  // the inbox is alive from the very first screen, not just after week 1 runs
  state.career.inbox.push(...generateInboxMessages(state, content, 0));
  return state;
}

function randomBirthDate(rng: Rng): string {
  const year = 1985 + rng.int(22); // ages roughly 19–41 at game start
  const month = 1 + rng.int(12);
  const day = 1 + rng.int(28);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}
