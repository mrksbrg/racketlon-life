import { describe, expect, it } from "vitest";
import type { MatchPlayerRef, MatchState, Tactic } from "../src/index.js";
import {
  BALANCE,
  SPORTS,
  aiChooseTactic,
  createMatch,
  fatigueTell,
  luckTell,
  maxRemainingFor,
  playPoint,
  resumeMatch,
  setTactic,
  totalPoints,
} from "../src/index.js";

function ref(id: string, skill: number, overrides: Partial<MatchPlayerRef> = {}): MatchPlayerRef {
  return {
    id,
    name: id,
    skills: { tt: skill, bd: skill, sq: skill, tn: skill },
    form: 0,
    fatigue: 20,
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
});
