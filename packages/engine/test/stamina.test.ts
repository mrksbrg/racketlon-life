import { describe, expect, it } from "vitest";
import type { EventLog, GameState, MatchPlayerRef } from "../src/index.js";
import {
  BALANCE,
  Game,
  advanceTournament,
  createMatch,
  playPoint,
  resumeMatch,
  staminaEnergyMult,
  staminaRecoveryMult,
  startTournament,
} from "../src/index.js";
import { planWith, testContent } from "./fixtures.js";

function ref(id: string, stamina: number): MatchPlayerRef {
  return {
    id,
    name: id,
    skills: { tt: 500, bd: 500, sq: 500, tn: 500 },
    formBySport: { tt: 20, bd: 20, sq: 20, tn: 20 },
    fatigue: 0,
    stamina,
    composure: 0.5,
    clutch: 0.5,
    age: 25,
  };
}

describe("staminaEnergyMult / staminaRecoveryMult (pure)", () => {
  it("is centered at exactly 1.0 for stamina 0.5, so existing balance is unchanged at the midpoint", () => {
    expect(staminaEnergyMult(0.5)).toBeCloseTo(1, 10);
    expect(staminaRecoveryMult(0.5)).toBeCloseTo(1, 10);
  });

  it("energy cost is lower at high stamina, higher at low stamina", () => {
    expect(staminaEnergyMult(1)).toBeLessThan(staminaEnergyMult(0.5));
    expect(staminaEnergyMult(0)).toBeGreaterThan(staminaEnergyMult(0.5));
    expect(staminaEnergyMult(1)).toBeCloseTo(BALANCE.match.staminaCostFloor, 10);
    expect(staminaEnergyMult(0)).toBeCloseTo(
      BALANCE.match.staminaCostFloor + BALANCE.match.staminaCostSpan,
      10,
    );
  });

  it("recovery is higher at high stamina, lower at low stamina", () => {
    expect(staminaRecoveryMult(1)).toBeGreaterThan(staminaRecoveryMult(0.5));
    expect(staminaRecoveryMult(0)).toBeLessThan(staminaRecoveryMult(0.5));
    expect(staminaRecoveryMult(0)).toBeCloseTo(BALANCE.tournament.staminaRecoveryFloor, 10);
    expect(staminaRecoveryMult(1)).toBeCloseTo(
      BALANCE.tournament.staminaRecoveryFloor + BALANCE.tournament.staminaRecoverySpan,
      10,
    );
  });
});

describe("stamina wired into match energy burn", () => {
  it("a higher-stamina player burns exactly less energy per point, same sport/tactic", () => {
    // both start on table tennis (setIndex 0) at the default "normal" tactic
    // (tacticEnergyMult.tt.normal === 1), so the per-point cost is purely
    // energyCostPerPoint.tt * staminaEnergyMult(stamina) — fully deterministic,
    // independent of who wins the point.
    const low = createMatch(ref("a", 0), ref("b", 0.5), "stamina-pt-low");
    const mid = createMatch(ref("a", 0.5), ref("b", 0.5), "stamina-pt-mid");
    const high = createMatch(ref("a", 1), ref("b", 0.5), "stamina-pt-high");
    for (const m of [low, mid, high]) {
      resumeMatch(m);
      playPoint(m);
    }

    const base = BALANCE.match.energyCostPerPoint.tt;
    expect(mid.energy.a).toBeCloseTo(100 - base, 5); // stamina 0.5 == today's flat cost
    expect(low.energy.a).toBeCloseTo(100 - base * staminaEnergyMult(0), 5);
    expect(high.energy.a).toBeCloseTo(100 - base * staminaEnergyMult(1), 5);
    expect(high.energy.a).toBeGreaterThan(mid.energy.a);
    expect(mid.energy.a).toBeGreaterThan(low.energy.a);
  });
});

describe("stamina wired into between-round tournament recovery", () => {
  /** A real session on the raw GameState (bypassing the facade, same pattern
   * as tournament.test.ts's monrad tests), with the human's stamina forced
   * to a known value. */
  function sessionForStamina(stamina: number) {
    const game = Game.newGame({ content: testContent, seed: "stamina-recovery" });
    const work = planWith({ work: 5 });
    while (game.weekIndex < 3) game.submitWeek(work);
    const state: GameState = game.serialize().state;
    state.players.find((p) => p.identity.id === "you")!.attributes.stamina = stamina;
    const def = testContent.tournaments["monthly-open-1-m"]!;
    const log: EventLog = [];
    const session = startTournament(state, def, testContent, log);
    return { state, session };
  }

  it("recovers more of the flat between-round bonus at higher stamina, for identical leftover energy", () => {
    const { state: lowState, session: lowSession } = sessionForStamina(0);
    const { state: highState, session: highSession } = sessionForStamina(1);

    // force both sessions' pending match to "just finished round 1 with 40
    // energy left" — advanceTournament only reads phase/winner/energy.a off
    // it (recordMatchResults tolerates the untouched 0-0 sets, skipping them)
    for (const session of [lowSession, highSession]) {
      const m = session.pendingMatch!;
      m.phase = "finished";
      m.winner = "a";
      m.energy.a = 40;
    }

    advanceTournament(lowState, lowSession, lowSession.pendingMatch!, []);
    advanceTournament(highState, highSession, highSession.pendingMatch!, []);

    const b = BALANCE.tournament;
    expect(lowSession.humanEnergyCarry).toBeCloseTo(40 + b.energyRecoveryBetweenRounds * staminaRecoveryMult(0), 5);
    expect(highSession.humanEnergyCarry).toBeCloseTo(40 + b.energyRecoveryBetweenRounds * staminaRecoveryMult(1), 5);
    expect(highSession.humanEnergyCarry).toBeGreaterThan(lowSession.humanEnergyCarry);
  });

  it("never exceeds 100 energy even for a high-stamina player recovering from a small deficit", () => {
    const { state, session } = sessionForStamina(1);
    const m = session.pendingMatch!;
    m.phase = "finished";
    m.winner = "a";
    m.energy.a = 95; // recovery would overshoot 100 without the cap
    advanceTournament(state, session, m, []);
    expect(session.humanEnergyCarry).toBe(100);
  });
});
