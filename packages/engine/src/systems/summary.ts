import { weekLabel } from "../core/date.js";
import { humanPlayer } from "../core/state.js";
import { round1 } from "../core/util.js";
import type { SportSummary } from "../model/summary.js";
import type { Sport } from "../model/sport.js";
import { SPORTS, SPORT_LABELS, levelForSkill } from "../model/sport.js";
import type { GameSystem } from "./types.js";

/**
 * Composes the weekly digest for the UI from the EventLog and the
 * before/after snapshot of the human player. Read-only over game state.
 */
export const SummarySystem: GameSystem = {
  id: "summary",
  run(ctx) {
    const human = humanPlayer(ctx.state);
    const snap = ctx.snapshot;

    const sports = {} as Record<Sport, SportSummary>;
    for (const sport of SPORTS) {
      const before = snap.skills[sport];
      const after = human.attributes.skills[sport];
      sports[sport] = {
        level: levelForSkill(after),
        skillDelta: round1(after - before),
        leveledUp: levelForSkill(after) > levelForSkill(before),
      };
    }

    const notes: string[] = [];
    for (const event of ctx.log.thisWeek()) {
      if (event.subject !== human.identity.id) continue;
      if (event.type === "training.levelUp") {
        const d = event.data as { sport: Sport; level: number };
        notes.push(`${SPORT_LABELS[d.sport]} reached level ${d.level}!`);
      } else if (event.type === "condition.warning") {
        notes.push("You are running on fumes — schedule some rest.");
      } else if (event.type === "economy.broke") {
        notes.push("Your account is in the red. Time to pick up more work?");
      } else if (event.type === "tournament.registered") {
        const d = event.data as { name: string; forWeek: number };
        notes.push(`Registered for the ${d.name} in week ${d.forWeek + 1}.`);
      } else if (event.type === "tournament.withdrew") {
        const d = event.data as { forWeek: number };
        notes.push(`Withdrew from your week ${d.forWeek + 1} tournament entry.`);
      } else if (event.type === "tournament.entered") {
        const d = event.data as { name: string; entryFee: number; travelCost: number };
        const travel = d.travelCost > 0 ? ` + ${eur(d.travelCost)} travel` : "";
        notes.push(`Entered the ${d.name} — paid ${eur(d.entryFee)} entry fee${travel}.`);
      } else if (event.type === "tournament.won") {
        const d = event.data as { name: string; prizeMoney: number };
        notes.push(`Champion at the ${d.name}! Prize money: ${eur(d.prizeMoney)}.`);
      } else if (event.type === "tournament.eliminated") {
        const d = event.data as {
          name: string;
          roundsWon: number;
          totalRounds: number;
          prizeMoney: number;
        };
        const place = eliminationLabel(d.roundsWon, d.totalRounds);
        const prize = d.prizeMoney > 0 ? ` — ${eur(d.prizeMoney)}` : "";
        notes.push(`${place} at the ${d.name}${prize}.`);
      } else if (event.type === "injury.occurred") {
        const d = event.data as { type: string; severity: number; weeksRemaining: number };
        const weeks = `${d.weeksRemaining} week${d.weeksRemaining === 1 ? "" : "s"}`;
        notes.push(`Picked up a ${severityLabel(d.severity)} ${injuryLabel(d.type)} injury — ${weeks} out.`);
      } else if (event.type === "injury.recovered") {
        const d = event.data as { type: string };
        notes.push(`Your ${injuryLabel(d.type)} injury has healed.`);
      } else if (event.type === "injury.blocked") {
        const d = event.data as { sport: Sport };
        notes.push(`The ${SPORT_LABELS[d.sport]} injury kept you off the court — that training didn't count.`);
      } else if (event.type === "ranking.moved") {
        const d = event.data as { sport: Sport; before: number; after: number };
        const delta = d.after - d.before;
        if (delta !== 0) {
          const sign = delta > 0 ? "+" : "";
          notes.push(`${SPORT_LABELS[d.sport]} rating moved to ${d.after} (${sign}${delta}).`);
        }
      } else if (event.type === "progression.title") {
        const d = event.data as { title: string };
        notes.push(`🏆 First title: ${titleLabel(d.title)}!`);
      } else if (event.type === "progression.personalBest") {
        const d = event.data as { value: number };
        notes.push(`New career-high rating: ${d.value}!`);
      }
    }

    ctx.outputs.summary = {
      weekIndex: ctx.state.calendar.weekIndex,
      weekLabel: weekLabel(ctx.state.calendar),
      sports,
      fatigue: {
        value: Math.round(human.condition.fatigue),
        delta: Math.round(human.condition.fatigue - snap.fatigue),
      },
      money: {
        value: ctx.state.career.money,
        delta: ctx.state.career.money - snap.money,
      },
      form: human.condition.form,
      notes,
    };
  },
};

function eur(amount: number): string {
  return `€${Math.round(amount).toLocaleString("en-US")}`;
}

function eliminationLabel(roundsWon: number, totalRounds: number): string {
  const roundsFromEnd = totalRounds - roundsWon;
  if (roundsFromEnd === 1) return "Runner-up";
  if (roundsFromEnd === 2) return "Lost in the semi-final";
  if (roundsFromEnd === 3) return "Lost in the quarter-final";
  if (roundsWon === 0) return "Lost in the first round";
  return `Lost after ${roundsWon} round${roundsWon === 1 ? "" : "s"}`;
}

function injuryLabel(type: string): string {
  return (SPORTS as readonly string[]).includes(type) ? SPORT_LABELS[type as Sport] : "overuse";
}

function severityLabel(severity: number): string {
  if (severity >= 3) return "severe";
  if (severity === 2) return "moderate";
  return "minor";
}

function titleLabel(title: string): string {
  return title === "champion" ? "Champion" : title;
}
