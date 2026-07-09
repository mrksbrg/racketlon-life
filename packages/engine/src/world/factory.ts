import { BALANCE } from "../balance.js";
import type { ContentBundle, TraitTone } from "../content.js";
import { startCalendar } from "../core/date.js";
import { Rng, childSeed } from "../core/rng.js";
import type { GameState } from "../core/state.js";
import { SAVE_VERSION } from "../core/state.js";
import type { Glicko, Player, Ratings, SimTier, Skills } from "../model/player.js";
import type { Sport } from "../model/sport.js";
import { SPORTS } from "../model/sport.js";
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
  talent: number;
  durability: number;
  professionalism: number;
  stamina: number;
  intelligence: number;
  clutch: number;
  composure: number;
  traits: string[];
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
      talent: spec.talent,
      durability: spec.durability,
      professionalism: spec.professionalism,
      stamina: spec.stamina,
      intelligence: spec.intelligence,
      clutch: spec.clutch,
      composure: spec.composure,
      traits: spec.traits,
    },
    condition: { fatigue: 20, form: 0, confidence: 0, injury: null },
    ratings: ratingsFromSkills(spec.skills),
    simTier: spec.simTier,
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
  intelligence: number;
  clutch: number;
  composure: number;
  /** 1–20, "Läkekött" → durability */
  resilience: number;
}

/** Level L (1–20) → mid-band internal skill, so it displays back as level L. */
function skillFromLevel(level: number): number {
  return Math.round((level - 1) * 50 + 25);
}

/** Level L (1–20) → 0..1 attribute. */
function unitFromLevel(level: number): number {
  return level / 20;
}

function specFromDraft(draft: CharacterDraft, rng: Rng, content: ContentBundle): PlayerSpec {
  const skills = {} as Skills;
  for (const sport of SPORTS) skills[sport] = skillFromLevel(draft.sports[sport]);
  return {
    id: "you",
    firstName: draft.firstName,
    lastName: draft.lastName,
    nationality: draft.nationality,
    birthDate: draft.birthDate,
    gender: draft.gender,
    skills,
    // talent is a hidden potential roll — not point-bought on the screen
    talent: rng.range(0.45, 0.8),
    durability: unitFromLevel(draft.resilience),
    // the human plans manually, so professionalism (an AI-planning input) is neutral
    professionalism: 0.7,
    stamina: unitFromLevel(draft.stamina),
    intelligence: unitFromLevel(draft.intelligence),
    clutch: unitFromLevel(draft.clutch),
    composure: unitFromLevel(draft.composure),
    traits: rollTraits(rng, content),
    simTier: 0,
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
    ? specFromDraft(options.character, rng, content)
    : {
        // fallback career player: a Swedish club all-rounder in their late twenties
        id: "you",
        firstName: options.playerName?.first ?? "Alex",
        lastName: options.playerName?.last ?? "Berg",
        nationality: "SE",
        birthDate: "1998-04-12",
        gender: "m",
        skills: { tt: 380, bd: 340, sq: 300, tn: 260 },
        talent: 0.6,
        durability: 0.6,
        professionalism: 0.7,
        stamina: 0.55,
        intelligence: 0.5,
        clutch: 0.5,
        composure: 0.5,
        traits: rollTraits(rng, content),
        simTier: 0,
      };

  const players: Player[] = [makePlayer(human)];

  // 80 tier-1 NPCs per gender (160 total) — draws are gender-separated and
  // never mixed (see projectedField), so each gender needs its own pool deep
  // enough for the biggest same-gender draw: a 64-player World Championships
  // needs 63 opponents. 80 leaves headroom for field variety across events.
  // Generated in a fixed count per gender (not a coin flip per NPC) so the
  // floor is guaranteed regardless of RNG luck. Docs/03 targets 100-300
  // tier-1 NPCs; 160 sits comfortably inside that range.
  const NPC_PER_GENDER = 80;
  const countries = Object.keys(content.names);
  let npcIndex = 0;
  for (const gender of ["m", "f"] as const) {
    for (let i = 0; i < NPC_PER_GENDER; i++) {
      npcIndex++;
      const nationality = rng.pick(countries);
      const pool = content.names[nationality];
      if (!pool) continue;
      const skills = {} as Skills;
      for (const sport of SPORTS) {
        skills[sport] = Math.round(rng.range(200, 700));
      }
      players.push(
        makePlayer({
          id: `npc-${npcIndex}`,
          firstName: rng.pick(gender === "m" ? pool.m : pool.f),
          lastName: rng.pick(pool.last),
          nationality,
          birthDate: randomBirthDate(rng),
          gender,
          skills,
          talent: rng.range(0.2, 0.9),
          durability: rng.range(0.3, 0.9),
          professionalism: rng.range(0.2, 0.9),
          stamina: rng.range(0.3, 0.9),
          intelligence: rng.range(0.2, 0.9),
          clutch: rng.range(0.2, 0.9),
          composure: rng.range(0.2, 0.9),
          // NPCs don't roll traits yet — scoped to the human player for now
          traits: [],
          simTier: 1,
        }),
      );
    }
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
