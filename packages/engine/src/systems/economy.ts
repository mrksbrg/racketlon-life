import { BALANCE } from "../balance.js";
import { monthKeyForWeek } from "../core/date.js";
import { humanPlayer } from "../core/state.js";
import { moneyDeltaFromCounts, salaryMultiplier } from "./effects.js";
import { weekModifierContent } from "./modifiers.js";
import type { GameSystem } from "./types.js";

/**
 * Weekly money: activity costs (court fees, going out) and fixed living
 * expenses are charged immediately, every week. Work income ("salary") is
 * not — real jobs pay monthly, not per session — so it's banked in
 * `career.pendingSalary` and only lands in `money` as one lump sum on the
 * last week of the calendar month (see `monthKeyForWeek`). Salary scales
 * with the Career attribute — see `salaryMultiplier`. Only the human career
 * has an economy — AI players' finances are not simulated.
 */
export const EconomySystem: GameSystem = {
  id: "economy",
  run(ctx) {
    const human = humanPlayer(ctx.state);
    const counts = ctx.plans.get(human.identity.id);
    if (!counts) return;
    // only the human has an economy, so a week modifier's (e.g. free social)
    // effect can be applied unconditionally here, unlike Training/Fatigue.
    const content = weekModifierContent(ctx.content, ctx.weekModifier);
    const { earned, spent } = moneyDeltaFromCounts(counts, content, salaryMultiplier(human.attributes.career));
    const expenses = spent + BALANCE.economy.weeklyExpenses;
    ctx.state.career.money -= expenses;
    ctx.state.career.pendingSalary += earned;

    const cal = ctx.state.calendar;
    const isLastWeekOfMonth = monthKeyForWeek(cal, cal.weekIndex) !== monthKeyForWeek(cal, cal.weekIndex + 1);
    let paid = 0;
    if (isLastWeekOfMonth && ctx.state.career.pendingSalary > 0) {
      paid = ctx.state.career.pendingSalary;
      ctx.state.career.money += paid;
      ctx.state.career.pendingSalary = 0;
      ctx.log.emit("economy.salaryPaid", human.identity.id, { amount: paid });
    }

    ctx.log.emit("economy.week", human.identity.id, {
      earned,
      expenses,
      paid,
      balance: ctx.state.career.money,
      pendingSalary: ctx.state.career.pendingSalary,
    });
    if (ctx.state.career.money < 0) {
      ctx.log.emit("economy.broke", human.identity.id, { balance: ctx.state.career.money });
    }
  },
};
