import { describe, expect, it } from "vitest";
import type { EventLog, GameState, MatchPlayerRef } from "../src/index.js";
import {
  BALANCE,
  Game,
  advanceTournament,
  createMatch,
  playPoint,
  resumeMatch,
  enduranceEnergyMult,
  enduranceRecoveryMult,
  startTournament,
} from "../src/index.js";
import { planWith, testContent } from "./fixtures.js";

function ref(id: string, endurance: number): MatchPlayerRef {
  return {
    id,
    name: id,
    nationality: "SWE",
    gender: "m",
    skills: { tt: 500, bd: 500, sq: 500, tn: 500 },
    formBySport: { tt: 20, bd: 20, sq: 20, tn: 20 },
    fatigue: 0,
    endurance,
    composure: 0.5,
    clutch: 0.5,
    age: 25,
    coreStrength: 0.5,
  };
}

describe("enduranceEnergyMult / enduranceRecoveryMult (pure)", () => {
  it("is centered at exactly 1.0 for endurance 0.5, so existing balance is unchanged at the midpoint", () => {
    expect(enduranceEnergyMult(0.5)).toBeCloseTo(1, 10);
    expect(enduranceRecoveryMult(0.5)).toBeCloseTo(1, 10);
  });

  it("energy cost is lower at high endurance, higher at low endurance", () => {
    expect(enduranceEnergyMult(1)).toBeLessThan(enduranceEnergyMult(0.5));
    expect(enduranceEnergyMult(0)).toBeGreaterThan(enduranceEnergyMult(0.5));
    expect(enduranceEnergyMult(1)).toBeCloseTo(BALANCE.match.enduranceCostFloor, 10);
    expect(enduranceEnergyMult(0)).toBeCloseTo(
      BALANCE.match.enduranceCostFloor + BALANCE.match.enduranceCostSpan,
      10,
    );
  });

  it("recovery is higher at high endurance, lower at low endurance", () => {
    expect(enduranceRecoveryMult(1)).toBeGreaterThan(enduranceRecoveryMult(0.5));
    expect(enduranceRecoveryMult(0)).toBeLessThan(enduranceRecoveryMult(0.5));
    expect(enduranceRecoveryMult(0)).toBeCloseTo(BALANCE.tournament.enduranceRecoveryFloor, 10);
    expect(enduranceRecoveryMult(1)).toBeCloseTo(
      BALANCE.tournament.enduranceRecoveryFloor + BALANCE.tournament.enduranceRecoverySpan,
      10,
    );
  });
});

describe("endurance wired into match energy burn", () => {
  it("a higher-endurance player burns exactly less energy per point, same sport/tactic", () => {
    // both start on table tennis (setIndex 0) at the default "normal" tactic
    // (tacticEnergyMult.tt.normal === 1), so the per-point cost is purely
    // energyCostPerPoint.tt * enduranceEnergyMult(endurance) — fully deterministic,
    // independent of who wins the point.
    const low = createMatch(ref("a", 0), ref("b", 0.5), "endurance-pt-low");
    const mid = createMatch(ref("a", 0.5), ref("b", 0.5), "endurance-pt-mid");
    const high = createMatch(ref("a", 1), ref("b", 0.5), "endurance-pt-high");
    for (const m of [low, mid, high]) {
      resumeMatch(m);
      playPoint(m);
    }

    const base = BALANCE.match.energyCostPerPoint.tt;
    expect(mid.energy.a).toBeCloseTo(100 - base, 5); // endurance 0.5 == today's flat cost
    expect(low.energy.a).toBeCloseTo(100 - base * enduranceEnergyMult(0), 5);
    expect(high.energy.a).toBeCloseTo(100 - base * enduranceEnergyMult(1), 5);
    expect(high.energy.a).toBeGreaterThan(mid.energy.a);
    expect(mid.energy.a).toBeGreaterThan(low.energy.a);
  });
});

describe("endurance wired into between-round tournament recovery", () => {
  /** A real session on the raw GameState (bypassing the facade, same pattern
   * as tournament.test.ts's monrad tests), with the human's endurance forced
   * to a known value. */
  function sessionForEndurance(endurance: number) {
    const game = Game.newGame({ content: testContent, seed: "endurance-recovery" });
    const work = planWith({ work: 5 });
    while (game.weekIndex < 3) game.submitWeek(work);
    const state: GameState = game.serialize().state;
    state.players.find((p) => p.identity.id === "you")!.attributes.endurance = endurance;
    const def = testContent.tournaments["monthly-open-1-m"]!;
    const log: EventLog = [];
    const session = startTournament(state, def, testContent, log);
    return { state, session };
  }

  it("recovers more of the flat between-round bonus at higher endurance, for identical leftover energy", () => {
    const { state: lowState, session: lowSession } = sessionForEndurance(0);
    const { state: highState, session: highSession } = sessionForEndurance(1);

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
    expect(lowSession.humanEnergyCarry).toBeCloseTo(40 + b.energyRecoveryBetweenRounds * enduranceRecoveryMult(0), 5);
    expect(highSession.humanEnergyCarry).toBeCloseTo(40 + b.energyRecoveryBetweenRounds * enduranceRecoveryMult(1), 5);
    expect(highSession.humanEnergyCarry).toBeGreaterThan(lowSession.humanEnergyCarry);
  });

  it("never exceeds 100 energy even for a high-endurance player recovering from a small deficit", () => {
    const { state, session } = sessionForEndurance(1);
    const m = session.pendingMatch!;
    m.phase = "finished";
    m.winner = "a";
    m.energy.a = 95; // recovery would overshoot 100 without the cap
    advanceTournament(state, session, m, []);
    expect(session.humanEnergyCarry).toBe(100);
  });
});
