import { weekLabel } from "../core/date.js";
import { humanPlayer } from "../core/state.js";
import { round1 } from "../core/util.js";
import type { SportSummary } from "../model/summary.js";
import type { Sport } from "../model/sport.js";
import { SPORTS, SPORT_LABELS, levelForSkill, levelProgress } from "../model/sport.js";
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
      const beforeForm = snap.formBySport[sport];
      const afterForm = human.condition.formBySport[sport];
      sports[sport] = {
        level: levelForSkill(after),
        skillDelta: round1(after - before),
        leveledUp: levelForSkill(after) > levelForSkill(before),
        beforeProgress: levelProgress(before),
        progress: levelProgress(after),
        beforeForm,
        form: afterForm,
        formDelta: afterForm - beforeForm,
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
          prizeMoney: number;
          finishingPosition: number;
          tiedCount: number;
        };
        const place = eliminationLabel(d.finishingPosition, d.tiedCount);
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
      } else if (event.type === "form.rusty") {
        const d = event.data as { sport: Sport };
        notes.push(`Your ${SPORT_LABELS[d.sport]} is getting rusty — it's been neglected.`);
      } else if (event.type === "form.sharp") {
        const d = event.data as { sport: Sport };
        notes.push(`Your ${SPORT_LABELS[d.sport]} is razor sharp — full tournament readiness.`);
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
      notes,
    };
  },
};

function eur(amount: number): string {
  return `€${Math.round(amount).toLocaleString("en-US")}`;
}

/**
 * A finishing-position label, not a rounds-won one: under the monrad
 * placement bracket (tournament/engine.ts), everyone plays real matches up
 * to the 3-game plate cap regardless of how many of them they win, so
 * "lost in the Nth round" no longer reliably describes how far someone got
 * — two players can both be "eliminated after 0 wins" while one played a
 * single match and the other played three. `finishingPosition` (the tied
 * band's best place) and `tiedCount` (>1 for a shared plate band) are what
 * the FIR ranking points themselves are keyed on, so they're what the
 * summary should read from too.
 */
export function eliminationLabel(finishingPosition: number, tiedCount: number): string {
  if (finishingPosition === 2) return "Runner-up";
  const last = finishingPosition + tiedCount - 1;
  return tiedCount > 1
    ? `Tied for ${ordinal(finishingPosition)}–${ordinal(last)}`
    : `Finished ${ordinal(finishingPosition)}`;
}

/** "1st", "2nd", "3rd", "4th"… — shared with systems/inbox.ts's results email. */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
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
