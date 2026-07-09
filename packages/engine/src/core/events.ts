/**
 * Append-only event log. Systems write typed events; Summary (and later
 * Story/Achievements/UI history) read them. The log is history and story
 * material — never hidden control flow between systems.
 */

export interface GameEvent {
  week: number;
  /** dotted machine type, e.g. "training.levelUp", "economy.week" */
  type: string;
  /** player id the event is about, if any */
  subject?: string;
  data?: Record<string, unknown>;
}

export type EventLog = GameEvent[];

/** Write handle for one simulated week, stamped with the week index. */
export class WeekLog {
  constructor(
    private readonly log: EventLog,
    private readonly week: number,
  ) {}

  emit(type: string, subject?: string, data?: Record<string, unknown>): void {
    this.log.push({ week: this.week, type, subject, data });
  }

  /** Events emitted so far this week (for downstream systems like Summary). */
  thisWeek(): readonly GameEvent[] {
    return this.log.filter((e) => e.week === this.week);
  }
}

export function eventsForWeek(log: EventLog, week: number): GameEvent[] {
  return log.filter((e) => e.week === week);
}
