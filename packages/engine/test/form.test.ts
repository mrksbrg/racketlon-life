import { describe, expect, it } from "vitest";
import {
  BALANCE,
  Game,
  Rng,
  createMatch,
  expectedSessionGain,
  formDecayRate,
  generateInboxMessages,
  pointWinProbability,
  skillCeiling,
} from "../src/index.js";
import { planWith, testContent } from "./fixtures.js";

const f = BALANCE.form;

describe("per-sport form (training readiness)", () => {
  it("starts every sport at the initial value", () => {
    const game = Game.newGame({ content: testContent, seed: "form-1" });
    for (const sport of ["tt", "bd", "sq", "tn"] as const) {
      expect(game.you.formBySport[sport]).toBe(f.initial);
    }
  });

  it("raises the trained sport's form and decays the untouched ones (week 1's grace-period rate)", () => {
    const game = Game.newGame({ content: testContent, seed: "form-2" });
    game.submitWeek(planWith({ trainTT: 5, work: 5 }));
    const gain = Math.min(5, f.sessionsCap) * f.gainPerSession;
    const week1Decay = formDecayRate(1);
    expect(game.you.formBySport.tt).toBe(Math.min(f.max, f.initial + gain));
    expect(game.you.formBySport.bd).toBe(f.initial - week1Decay);
    expect(game.you.formBySport.sq).toBe(f.initial - week1Decay);
    expect(game.you.formBySport.tn).toBe(f.initial - week1Decay);
  });

  it("reports before/after progress and form on the weekly summary, for UI animation", () => {
    const game = Game.newGame({ content: testContent, seed: "form-summary" });
    const summary = game.submitWeek(planWith({ trainTT: 5, work: 5 }));
    const tt = summary.sports.tt;
    expect(tt.beforeForm).toBe(f.initial);
    expect(tt.form).toBe(Math.min(f.max, f.initial + Math.min(5, f.sessionsCap) * f.gainPerSession));
    expect(tt.formDelta).toBe(tt.form - tt.beforeForm);
    expect(tt.beforeProgress).toBeGreaterThanOrEqual(0);
    // progress only monotonically rises within the same level band — a
    // level-up legitimately resets it into the new band
    if (!tt.leveledUp) expect(tt.progress).toBeGreaterThanOrEqual(tt.beforeProgress);

    const untrained = summary.sports.bd;
    expect(untrained.formDelta).toBeLessThan(0);
    expect(untrained.beforeForm).toBe(f.initial);
  });

  it("caps form at max, however much a sport is overtrained", () => {
    const game = Game.newGame({ content: testContent, seed: "form-3" });
    for (let i = 0; i < 6; i++) game.submitWeek(planWith({ trainTT: 5, work: 5 }));
    expect(game.you.formBySport.tt).toBe(f.max);
  });

  it("floors form at zero, however long a sport is neglected", () => {
    // the staged curve plateaus for a long stretch (see decayStages), so
    // reaching the floor now takes well past the plateau's end (~27 weeks)
    // rather than the old flat-rate curve's ~6 weeks
    const game = Game.newGame({ content: testContent, seed: "form-4" });
    for (let i = 0; i < 45; i++) game.submitWeek(planWith({ work: 5 }));
    expect(game.you.formBySport.tt).toBe(0);
  });

  it("emits a note when a sport crosses into rusty, and another when it's fully sharp", () => {
    const game = Game.newGame({ content: testContent, seed: "form-5" });
    let rustyWeek = -1;
    for (let i = 0; i < 10 && rustyWeek === -1; i++) {
      game.submitWeek(planWith({ work: 5 }));
      if (game.eventsForWeek(i).some((e) => e.type === "form.rusty")) rustyWeek = i;
    }
    expect(rustyWeek).toBeGreaterThanOrEqual(0);

    const sharp = Game.newGame({ content: testContent, seed: "form-6" });
    let sharpWeek = -1;
    for (let i = 0; i < 6 && sharpWeek === -1; i++) {
      sharp.submitWeek(planWith({ trainTT: 5, work: 5 }));
      if (sharp.eventsForWeek(i).some((e) => e.type === "form.sharp" && e.data?.sport === "tt")) sharpWeek = i;
    }
    expect(sharpWeek).toBeGreaterThanOrEqual(0);
  });

  it("gives the well-in-form player a higher point-win probability at identical skill", () => {
    const skills = { tt: 500, bd: 500, sq: 500, tn: 500 };
    const sharp = { id: "a", name: "a", skills, formBySport: { tt: 20, bd: 20, sq: 20, tn: 20 }, fatigue: 0, endurance: 0.5, composure: 0.5, clutch: 0.5, age: 25, durability: 0.5, coreStrength: 0.5 };
    const rusty = { id: "a", name: "a", skills, formBySport: { tt: 0, bd: 0, sq: 0, tn: 0 }, fatigue: 0, endurance: 0.5, composure: 0.5, clutch: 0.5, age: 25, durability: 0.5, coreStrength: 0.5 };
    const opponent = { id: "b", name: "b", skills, formBySport: { tt: 20, bd: 20, sq: 20, tn: 20 }, fatigue: 0, endurance: 0.5, composure: 0.5, clutch: 0.5, age: 25, durability: 0.5, coreStrength: 0.5 };

    const mSharp = createMatch(sharp, opponent, "form-match-sharp");
    const mRusty = createMatch(rusty, opponent, "form-match-rusty");
    const rng = new Rng("probe");
    const pSharp = pointWinProbability(mSharp, rng);
    const pRusty = pointWinProbability(mRusty, rng);

    expect(pSharp).toBeCloseTo(0.5, 5); // identical form/skill/fatigue/age both sides -> even odds
    expect(pRusty).toBeLessThan(pSharp);
  });
});

describe("staged form decay curve (BALANCE.form.decayStages)", () => {
  it("barely registers in week 1, more in week 2, then a real drop by ~1 month", () => {
    const week1 = formDecayRate(1);
    const week2 = formDecayRate(2);
    const week4 = formDecayRate(4);
    expect(week1).toBeLessThan(week2);
    expect(week2).toBeLessThan(week4);
    expect(week1).toBeLessThan(1); // week 1 is a light grace period
  });

  it("plateaus for a long stretch after the initial drop, well below the weeks 3-4 rate", () => {
    const monthRate = formDecayRate(4);
    const sixMonthRate = formDecayRate(20);
    const yearRate = formDecayRate(26);
    expect(sixMonthRate).toBeLessThan(monthRate);
    expect(yearRate).toBeLessThan(monthRate);
  });

  it("resumes decaying once a sport has been neglected the better part of a year", () => {
    const plateauRate = formDecayRate(10);
    const longNeglectRate = formDecayRate(30);
    expect(longNeglectRate).toBeGreaterThan(plateauRate);
  });

  it("is 0 before any neglect has accrued", () => {
    expect(formDecayRate(0)).toBe(0);
  });

  it("a player who trains every week or two never gets meaningfully rusty", () => {
    // short, regular gaps (1-2 weeks between sessions) should never
    // accumulate into a real drop, since neglectWeeks resets to 0 whenever
    // trained — this is the concrete "one week off barely matters" promise
    const game = Game.newGame({ content: testContent, seed: "form-cadence" });
    for (let i = 0; i < 10; i++) {
      game.submitWeek(i % 2 === 0 ? planWith({ trainTT: 3, work: 5 }) : planWith({ work: 5 }));
    }
    expect(game.you.formBySport.tt).toBeGreaterThan(f.max * 0.5);
  });
});

describe("per-sport potential (hidden skill ceiling)", () => {
  it("gives a higher-potential sport a higher soft ceiling", () => {
    expect(skillCeiling(1)).toBeGreaterThan(skillCeiling(0));
    expect(skillCeiling(0.5)).toBeCloseTo((skillCeiling(0) + skillCeiling(1)) / 2, 5);
  });

  it("tapers a low-potential sport's gains harder as it nears its own (lower) ceiling", () => {
    const skill = 700;
    const lowPotentialGain = expectedSessionGain(6, skill, 0.1, 20); // ceiling ~595, well past it
    const highPotentialGain = expectedSessionGain(6, skill, 0.9, 20); // ceiling ~955, still room
    expect(highPotentialGain).toBeGreaterThan(lowPotentialGain);
  });

  it("sends a vague coach clue once a sport's skill nears its hidden ceiling, never the ceiling itself", () => {
    const game = Game.newGame({ content: testContent, seed: "clue-1" });
    const save = game.serialize();
    const human = save.state.players.find((p) => p.identity.id === "you")!;
    human.attributes.potential.tt = 0; // ceiling = ceilingFloor = 550
    human.attributes.skills.tt = 500; // ratio 500/550 ≈ 0.91 — past both bands
    const msgs = generateInboxMessages(save.state, testContent, 0);
    const clues = msgs.filter((m) => m.category === "coach");
    expect(clues.some((m) => m.id === "clue:tt:growing")).toBe(true);
    expect(clues.some((m) => m.id === "clue:tt:nearing")).toBe(true);
    for (const m of clues) {
      expect(m.body).not.toMatch(/\d/); // no raw numbers leaking the ceiling
    }
  });

  it("never re-sends a clue that's already in the inbox", () => {
    const game = Game.newGame({ content: testContent, seed: "clue-2" });
    const save = game.serialize();
    const human = save.state.players.find((p) => p.identity.id === "you")!;
    human.attributes.potential.tt = 0;
    human.attributes.skills.tt = 500;
    const first = generateInboxMessages(save.state, testContent, 0);
    save.state.career.inbox.push(...first);
    const second = generateInboxMessages(save.state, testContent, 1);
    expect(second.some((m) => m.category === "coach")).toBe(false);
  });
});
