import { BALANCE } from "../balance.js";
import { humanPlayer } from "../core/state.js";
import { moneyDeltaFromCounts } from "./effects.js";
import type { GameSystem } from "./types.js";

/**
 * Weekly money: activity income (work) minus activity costs (court fees,
 * going out) minus fixed living expenses. Only the human career has an
 * economy — AI players' finances are not simulated.
 */
export const EconomySystem: GameSystem = {
  id: "economy",
  run(ctx) {
    const human = humanPlayer(ctx.state);
    const counts = ctx.plans.get(human.identity.id);
    if (!counts) return;
    const { earned, spent } = moneyDeltaFromCounts(counts, ctx.content);
    const expenses = spent + BALANCE.economy.weeklyExpenses;
    const net = earned - expenses;
    ctx.state.career.money += net;
    ctx.log.emit("economy.week", human.identity.id, {
      earned,
      expenses,
      net,
      balance: ctx.state.career.money,
    });
    if (ctx.state.career.money < 0) {
      ctx.log.emit("economy.broke", human.identity.id, { balance: ctx.state.career.money });
    }
  },
};
