import { humanPlayer } from "../core/state.js";
import { combinedRating } from "./ranking.js";
import type { GameSystem } from "./types.js";

/**
 * Milestone tracking for the human career: a first tournament title, and a
 * new career-high combined Glicko-2 rating. Both persist on `Career` so
 * "first" and "best" stay meaningful across the whole save, not just one
 * week's diff.
 */
export const ProgressionSystem: GameSystem = {
  id: "progression",
  run(ctx) {
    const human = humanPlayer(ctx.state);
    const career = ctx.state.career;

    for (const event of ctx.log.thisWeek()) {
      if (event.subject !== human.identity.id) continue;
      if (event.type === "tournament.won" && !career.titles.includes("champion")) {
        career.titles.push("champion");
        ctx.log.emit("progression.title", human.identity.id, { title: "champion" });
      }
    }

    const rating = Math.round(combinedRating(human));
    if (rating > career.bestRating) {
      career.bestRating = rating;
      ctx.log.emit("progression.personalBest", human.identity.id, { metric: "rating", value: rating });
    }
  },
};
