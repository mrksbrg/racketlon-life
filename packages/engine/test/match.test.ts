import { describe, expect, it } from "vitest";
import type { MatchPlayerRef, MatchState, Tactic } from "../src/index.js";
import {
  BALANCE,
  Rng,
  SPORTS,
  aiChooseTactic,
  createMatch,
  fatigueTell,
  luckTell,
  maxRemainingFor,
  playPoint,
  pointWinProbability,
  pointsToWin,
  resumeMatch,
  setTactic,
  totalPoints,
} from "../src/index.js";

function ref(id: string, skill: number, overrides: Partial<MatchPlayerRef> = {}): MatchPlayerRef {
  return {
    id,
    name: id,
    skills: { tt: skill, bd: skill, sq: skill, tn: skill },
    formBySport: { tt: 20, bd: 20, sq: 20, tn: 20 },
    fatigue: 20,
    stamina: 0.5,
    age: 25, // neutral age-modifier window — these tests aren't about aging
    ...overrides,
  };
}

/** Plays a match to the end with AI tactics on both sides. */
function runMatch(seed: string, skillA: number, skillB: number): MatchState {
  const m = createMatch(ref("a", skillA), ref("b", skillB), seed);
  let guard = 0;
  while (m.phase !== "finished") {
    if (++guard > 3000) throw new Error("match did not terminate");
    if (m.phase === "break") {
      setTactic(m, "a", aiChooseTactic(m, "a"));
      setTactic(m, "b", aiChooseTactic(m, "b"));
      resumeMatch(m);
    } else {
      playPoint(m);
    }
  }
  return m;
}

describe("match engine", () => {
  it("keeps racketlon invariants across many matches", () => {
    for (let i = 0; i < 60; i++) {
      const m = runMatch(`inv-${i}`, 480, 440);
      expect(m.winner).not.toBeNull();
      const winner = m.winner as "a" | "b";
      const loser = winner === "a" ? "b" : "a";
      // the winner always has strictly more total points
      expect(totalPoints(m, winner)).toBeGreaterThan(totalPoints(m, loser));
      for (const set of m.sets) {
        if (set.done && !m.gummiarm) {
          const hi = Math.max(set.a, set.b);
          const margin = Math.abs(set.a - set.b);
          if (hi > 0) {
            // completed sets reach at least 21 and are won by 2 —
            // except the final set of an early-decided match
            if (!(m.decidedEarly && set === m.sets[m.setIndex])) {
              expect(hi).toBeGreaterThanOrEqual(21);
              expect(margin).toBeGreaterThanOrEqual(2);
            }
          }
        }
      }
    }
  });

  it("replays identically from the same seed", () => {
    const a = runMatch("replay", 500, 470);
    const b = runMatch("replay", 500, 470);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("pauses first at the 11-point side change", () => {
    const m = createMatch(ref("a", 500), ref("b", 480), "sidechange");
    resumeMatch(m);
    while (m.phase === "playing") playPoint(m);
    expect(m.phase).toBe("break");
    expect(m.breakReason).toBe("sideChange");
    const set = m.sets[0]!;
    expect(Math.max(set.a, set.b)).toBe(11);
  });

  it("resets momentum and gives both sides a small energy top-up at the side-change break", () => {
    const m = createMatch(ref("a", 500, { stamina: 0.5 }), ref("b", 480, { stamina: 0.5 }), "sidechange-reset");
    resumeMatch(m);
    while (m.phase === "playing" && m.breakReason !== "sideChange") {
      m.momentum = 0.25; // force a nonzero value so the reset is actually observable
      m.energy.a = 70;
      m.energy.b = 65;
      playPoint(m);
    }
    expect(m.breakReason).toBe("sideChange");
    expect(m.momentum).toBe(0);
    // this point's own energy cost (table tennis, stamina 0.5 → 1x
    // multiplier) is deducted before the changeover recovery is added
    const cost = BALANCE.match.energyCostPerPoint.tt;
    expect(m.energy.a).toBeCloseTo(70 - cost + BALANCE.match.sideChangeEnergyRecovery, 5);
    expect(m.energy.b).toBeCloseTo(65 - cost + BALANCE.match.sideChangeEnergyRecovery, 5);
  });

  it("resets momentum and gives both sides a bigger energy top-up moving on to a new sport", () => {
    // one point from ending set 1 (table tennis) — 20-18, "a" a heavy
    // favorite so the very next point reliably closes it out at 21-18
    const m = createMatch(ref("a", 900, { stamina: 0.5 }), ref("b", 100, { stamina: 0.5 }), "setend-reset");
    m.sets = [
      { a: 20, b: 18, done: false },
      { a: 0, b: 0, done: false },
      { a: 0, b: 0, done: false },
      { a: 0, b: 0, done: false },
    ];
    m.sideChangeDone = true;
    m.momentum = -0.3;
    m.energy = { a: 70, b: 65 };
    m.phase = "playing";
    playPoint(m);
    expect(m.sets[0]!.done).toBe(true);
    expect(m.setIndex).toBe(1);
    expect(m.breakReason).toBe("setEnd");
    expect(m.momentum).toBe(0);
    const cost = BALANCE.match.energyCostPerPoint.tt;
    expect(m.energy.a).toBeCloseTo(70 - cost + BALANCE.match.setChangeEnergyRecovery, 5);
    expect(m.energy.b).toBeCloseTo(65 - cost + BALANCE.match.setChangeEnergyRecovery, 5);
    // set-change recovery is bigger than a side-change's — same net effect
    // (starting energy minus this point's cost), but this top-up clears
    // more ground
    expect(m.energy.a - (70 - cost)).toBeGreaterThan(BALANCE.match.sideChangeEnergyRecovery);
  });

  it("lets the clearly stronger player win most matches", () => {
    let wins = 0;
    for (let i = 0; i < 40; i++) {
      if (runMatch(`strong-${i}`, 560, 480).winner === "a") wins++;
    }
    expect(wins).toBeGreaterThan(28); // > 70 %
  });

  it("ends early when the lead is uncatchable", () => {
    const m = createMatch(ref("a", 500), ref("b", 500), "early");
    // fabricate a blowout: after 2 sets + deep into squash, b can reach at
    // most 19 + 21 = 40 more points while trailing 62 − 9 = 53
    m.sets = [
      { a: 21, b: 3, done: true },
      { a: 21, b: 3, done: true },
      { a: 20, b: 3, done: false },
      { a: 0, b: 0, done: false },
    ];
    m.setIndex = 2;
    m.phase = "playing";
    expect(maxRemainingFor(m, "b", false)).toBe(40);
    playPoint(m);
    expect(m.phase).toBe("finished");
    expect(m.winner).toBe("a");
    expect(m.decidedEarly).toBe(true);
  });

  it("decides a tie with a single gummiarm point", () => {
    const m = createMatch(ref("a", 500), ref("b", 500), "gummi");
    m.sets = [
      { a: 21, b: 15, done: true },
      { a: 15, b: 21, done: true },
      { a: 21, b: 18, done: true },
      { a: 18, b: 21, done: true },
    ];
    m.setIndex = 3;
    m.gummiarm = true;
    m.phase = "break";
    m.breakReason = "gummiarm";
    expect(totalPoints(m, "a")).toBe(totalPoints(m, "b"));
    resumeMatch(m);
    playPoint(m);
    expect(m.phase).toBe("finished");
    expect(m.winner).not.toBeNull();
    const winner = m.winner as "a" | "b";
    const loser = winner === "a" ? "b" : "a";
    expect(totalPoints(m, winner)).toBe(totalPoints(m, loser) + 1);
  });

  it("AI presses when behind, protects a big lead, and goes for quick winners when gassed", () => {
    const m = createMatch(ref("a", 500), ref("b", 500), "ai");
    m.sets[0] = { a: 18, b: 6, done: false };
    expect(aiChooseTactic(m, "b")).toBe("aggressive");
    expect(aiChooseTactic(m, "a")).toBe("safe");
    // aggressive ends rallies fast and is the tactic that saves energy —
    // grinding it out "safe" would only burn more
    m.energy.b = 20;
    expect(aiChooseTactic(m, "b")).toBe("aggressive");
  });

  it("AI cuts its losses when truly exhausted, even while chasing the match", () => {
    const m = createMatch(ref("a", 500), ref("b", 500), "ai-exhausted");
    m.setIndex = 1; // badminton — conserve/allOut only apply outside table tennis
    m.sets[1] = { a: 18, b: 6, done: false }; // b is well behind
    m.energy.b = 10; // but nearly out of gas
    expect(aiChooseTactic(m, "b")).toBe("conserve");
  });

  it("AI empties the tank when desperately behind, but only while it still has legs", () => {
    const m = createMatch(ref("a", 500), ref("b", 500), "ai-desperate");
    m.setIndex = 1; // badminton
    m.sets[1] = { a: 20, b: 2, done: false }; // an 18-point deficit
    expect(aiChooseTactic(m, "b")).toBe("allOut");
  });

  it("AI coasts once a lead is a blowout rather than grinding it out", () => {
    const m = createMatch(ref("a", 500), ref("b", 500), "ai-blowout");
    m.setIndex = 1; // badminton
    m.sets[1] = { a: 21, b: 1, done: false }; // a 20-point lead
    expect(aiChooseTactic(m, "a")).toBe("conserve");
  });

  it("clamps conserve/allOut down to safe/aggressive during table tennis", () => {
    const exhausted = createMatch(ref("a", 500), ref("b", 500), "tt-exhausted");
    exhausted.energy.b = 10; // would be "conserve" outside TT
    expect(aiChooseTactic(exhausted, "b")).toBe("safe");

    const desperate = createMatch(ref("a", 500), ref("b", 500), "tt-desperate");
    desperate.sets[0] = { a: 20, b: 2, done: false }; // would be "allOut" outside TT
    expect(aiChooseTactic(desperate, "b")).toBe("aggressive");

    // the human can't be handed an invalid tactic either, even if something
    // upstream tries to set one during a TT break
    setTactic(exhausted, "a", "conserve");
    expect(exhausted.tactics.a).toBe("safe");
    setTactic(exhausted, "a", "allOut");
    expect(exhausted.tactics.a).toBe("aggressive");
  });

  it("orders every tactic's energy cost conserve < aggressive < normal < safe < allOut, per sport", () => {
    const order: Tactic[] = ["conserve", "aggressive", "normal", "safe", "allOut"];
    for (const sport of SPORTS) {
      const costs = order.map(
        (t) => BALANCE.match.energyCostPerPoint[sport] * BALANCE.match.tacticEnergyMult[sport][t],
      );
      for (let i = 1; i < costs.length; i++) {
        expect(costs[i]).toBeGreaterThan(costs[i - 1]!);
      }
    }
  });

  it("makes a dominant squash point cheap for the controller and expensive for the chaser", () => {
    const m = createMatch(ref("a", 1000, { stamina: 0.5 }), ref("b", 1, { stamina: 0.5 }), "squash-control");
    m.setIndex = 2;
    m.phase = "playing";

    const pA = pointWinProbability(m, new Rng("squash-control-prob"));
    const outcome = playPoint(m);

    expect(outcome?.winner).toBe("a");
    const control = (pA - 0.5) * 2;
    const base = BALANCE.match.energyCostPerPoint.sq;
    expect(m.energy.a).toBeCloseTo(100 - base * (1 - BALANCE.match.controlEnergy.sq.winnerDiscount * control), 5);
    expect(m.energy.b).toBeCloseTo(100 - base * (1 + BALANCE.match.controlEnergy.sq.loserTax * control), 5);
    expect(100 - m.energy.b).toBeGreaterThan(100 - m.energy.a);
  });

  it("keeps badminton's control-energy asymmetry smaller than squash's", () => {
    expect(BALANCE.match.controlEnergy.bd.winnerDiscount).toBeLessThan(BALANCE.match.controlEnergy.sq.winnerDiscount);
    expect(BALANCE.match.controlEnergy.bd.loserTax).toBeLessThan(BALANCE.match.controlEnergy.sq.loserTax);
  });

  it("buckets fatigue without ever exposing the exact number", () => {
    expect(fatigueTell(95)).toBe("fresh");
    expect(fatigueTell(70)).toBe("working");
    expect(fatigueTell(40)).toBe("tiring");
    expect(fatigueTell(10)).toBe("gassed");
  });

  it("reads momentum as a lucky/unlucky tell for the side that's over/underperforming", () => {
    const m = createMatch(ref("a", 500), ref("b", 500), "luck-buckets");
    m.momentum = 0.2;
    expect(luckTell(m, "a")).toBe("lucky");
    expect(luckTell(m, "b")).toBe("unlucky");
    m.momentum = -0.2;
    expect(luckTell(m, "a")).toBe("unlucky");
    expect(luckTell(m, "b")).toBe("lucky");
    m.momentum = 0;
    expect(luckTell(m, "a")).toBe("neutral");
    expect(luckTell(m, "b")).toBe("neutral");
  });

  it("updates momentum via the point-surprise EMA when a heavy underdog wins a point", () => {
    // search for a seed where the huge underdog (b) wins the very first point
    let m: MatchState | null = null;
    for (let i = 0; i < 200; i++) {
      const candidate = createMatch(ref("a", 900), ref("b", 100), `momentum-search-${i}`);
      resumeMatch(candidate);
      playPoint(candidate);
      if (candidate.sets[0]!.b === 1) {
        m = candidate;
        break;
      }
    }
    expect(m).not.toBeNull();
    const decay = BALANCE.match.momentumDecay;
    // a was a near-certain favorite, so losing that point swings momentum
    // sharply negative (in b's favor) by roughly (1 − decay) × surprise
    expect(m!.momentum).toBeLessThan(-(1 - decay) * 0.9);
    expect(luckTell(m!, "b")).toBe("lucky");
    expect(luckTell(m!, "a")).toBe("unlucky");
  });

  it("feeds momentum back into point probability, favoring whichever side is hot", () => {
    const m = createMatch(ref("a", 500), ref("b", 500), "momentum-feedback");
    resumeMatch(m);
    const rng = () => new Rng("momentum-feedback-probe");

    m.momentum = 0;
    const neutral = pointWinProbability(m, rng());

    m.momentum = 0.3;
    const favoringA = pointWinProbability(m, rng());
    expect(favoringA).toBeGreaterThan(neutral);

    m.momentum = -0.3;
    const favoringB = pointWinProbability(m, rng());
    expect(favoringB).toBeLessThan(neutral);

    // symmetric around the neutral 0.5 baseline for two equal-skill players
    expect(favoringA - neutral).toBeCloseTo(neutral - favoringB, 10);
  });

  it("keeps momentum well short of its own ±1 bound over a full match, even for a lopsided skill gap", () => {
    // momentum feeding back into probability makes continuing a hot streak
    // less "surprising", which is what should cap it short of ±1 on its own
    // — see BALANCE.match.momentumWeight's doc comment.
    let maxAbsMomentum = 0;
    const m = createMatch(ref("a", 600), ref("b", 400), "momentum-cap");
    let guard = 0;
    while (m.phase !== "finished" && ++guard < 2000) {
      if (m.phase === "break") {
        setTactic(m, "a", aiChooseTactic(m, "a"));
        setTactic(m, "b", aiChooseTactic(m, "b"));
        resumeMatch(m);
        continue;
      }
      playPoint(m);
      maxAbsMomentum = Math.max(maxAbsMomentum, Math.abs(m.momentum));
    }
    expect(maxAbsMomentum).toBeLessThan(0.8);
  });

  it("safe grinds rallies (costs more energy) and aggressive ends them fast (saves energy), squash most of all", () => {
    const start = createMatch(ref("a", 500), ref("b", 500), "energy");
    start.setIndex = 2; // squash
    resumeMatch(start);
    setTactic(start, "a", "safe");
    setTactic(start, "b", "aggressive");
    const before = { ...start.energy };
    playPoint(start);
    const safeCost = before.a - start.energy.a;
    const aggressiveCost = before.b - start.energy.b;
    expect(safeCost).toBeGreaterThan(aggressiveCost);

    // table tennis barely moves with tactic, unlike squash
    const tt = createMatch(ref("a", 500), ref("b", 500), "energy-tt");
    resumeMatch(tt);
    setTactic(tt, "a", "safe");
    setTactic(tt, "b", "aggressive");
    const beforeTT = { ...tt.energy };
    playPoint(tt);
    const ttSafeCost = beforeTT.a - tt.energy.a;
    const ttAggroCost = beforeTT.b - tt.energy.b;
    expect(ttSafeCost - ttAggroCost).toBeLessThan(safeCost - aggressiveCost);
  });

  describe("pointsToWin (magic number)", () => {
    /** A match with the first three sets pre-filled and the tennis set open. */
    function atTennis(a: [number, number], b: [number, number], c: [number, number]): MatchState {
      const m = createMatch(ref("a", 500), ref("b", 500), "ptw");
      m.sets[0] = { a: a[0], b: a[1], done: true };
      m.sets[1] = { a: b[0], b: b[1], done: true };
      m.sets[2] = { a: c[0], b: c[1], done: true };
      m.setIndex = 3;
      m.phase = "break";
      m.breakReason = "setEnd";
      return m;
    }

    it("with an 8-point lead into tennis, the leader needs 22 − lead points", () => {
      // a leads 60–52 after three sets (diff 8): needs 14 tennis points to clinch
      const m = atTennis([21, 15], [21, 18], [18, 19]);
      expect(totalPoints(m, "a") - totalPoints(m, "b")).toBe(8);
      expect(pointsToWin(m)).toEqual({ side: "a", points: 14 });
    });

    it("names side b as the leader when b is ahead", () => {
      const m = atTennis([15, 21], [18, 21], [19, 18]);
      const ptw = pointsToWin(m);
      expect(ptw?.side).toBe("b");
      expect(ptw?.points).toBe(14);
    });

    it("with a lead of 2 or less, the leader must effectively win the tennis set", () => {
      // diff 1 → cannot clinch on totals alone; needs to win the set (21 points)
      const m = atTennis([21, 20], [21, 20], [21, 20]);
      expect(totalPoints(m, "a") - totalPoints(m, "b")).toBe(3); // 63-60
      // diff 3 → 22-3 = 19
      expect(pointsToWin(m)).toEqual({ side: "a", points: 19 });
      const tight = atTennis([21, 20], [21, 20], [20, 21]);
      expect(totalPoints(tight, "a") - totalPoints(tight, "b")).toBe(1);
      expect(pointsToWin(tight)).toEqual({ side: "a", points: 21 });
    });

    it("returns null when the totals are level (a gummiarm looms)", () => {
      const m = atTennis([21, 19], [19, 21], [20, 20]);
      expect(totalPoints(m, "a")).toBe(totalPoints(m, "b"));
      expect(pointsToWin(m)).toBeNull();
    });

    it("returns null once the match is finished", () => {
      const m = runMatch("ptw-done", 700, 300);
      expect(m.phase).toBe("finished");
      expect(pointsToWin(m)).toBeNull();
    });
  });
});
