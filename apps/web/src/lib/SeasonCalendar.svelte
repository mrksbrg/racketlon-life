<script lang="ts">
  import type { InjurySpanView, Sport, TourEntry, TrainedWeekView } from "@racketlon/engine";
  import { DEFAULT_START_MONDAY, SPORT_LABELS, SPORTS } from "@racketlon/engine";
  import { untrack } from "svelte";
  import { SPORT_COLORS } from "./ui";

  let {
    entries,
    injurySpan,
    trainedWeeks,
    weekIndex,
    onSelectWeek,
  }: {
    entries: TourEntry[];
    injurySpan: InjurySpanView | null;
    trainedWeeks: TrainedWeekView[];
    weekIndex: number;
    onSelectWeek: (weekIndex: number) => void;
  } = $props();

  const DAY_MS = 86_400_000;
  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  function addDays(iso: string, days: number): string {
    return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
  }
  function ymd(iso: string): { y: number; m: number } {
    const [y, m] = iso.split("-").map(Number);
    return { y: y!, m: m! - 1 };
  }
  function inSpan(date: string, start: string, end: string): boolean {
    return date >= start && date <= end;
  }

  const todayISO = $derived(addDays(DEFAULT_START_MONDAY, weekIndex * 7));

  const tournamentSpans = $derived(
    entries.map((e) => ({
      weekIndex: e.weekIndex,
      name: e.tournament.name,
      tier: e.tournament.tier,
      status: e.status,
      start: e.tournament.date,
      end: addDays(e.tournament.date, e.tournament.nights),
    })),
  );

  const trainedSpans = $derived(
    trainedWeeks.map((w) => ({ start: w.date, end: addDays(w.date, 6), sports: w.sports })),
  );

  // seeds the initial month from the prop directly (not the `todayISO`
  // derived value) so this only runs once at mount, not every time the
  // week advances elsewhere — the player may be deliberately browsing a
  // different month and shouldn't get yanked back to "today" on every sim.
  const initialSeed = untrack(() => ymd(addDays(DEFAULT_START_MONDAY, weekIndex * 7)));
  let viewYear = $state(initialSeed.y);
  let viewMonth = $state(initialSeed.m);

  const bounds = $derived.by(() => {
    const start = ymd(DEFAULT_START_MONDAY);
    let end = start;
    for (const t of tournamentSpans) {
      const e = ymd(t.end);
      if (e.y > end.y || (e.y === end.y && e.m > end.m)) end = e;
    }
    return { start, end };
  });

  const atStart = $derived(viewYear === bounds.start.y && viewMonth === bounds.start.m);
  const atEnd = $derived(viewYear === bounds.end.y && viewMonth === bounds.end.m);

  function prevMonth() {
    if (atStart) return;
    if (viewMonth === 0) { viewMonth = 11; viewYear -= 1; } else { viewMonth -= 1; }
  }
  function nextMonth() {
    if (atEnd) return;
    if (viewMonth === 11) { viewMonth = 0; viewYear += 1; } else { viewMonth += 1; }
  }

  interface Cell {
    dayNum: number;
    inMonth: boolean;
    date: string | null;
    isToday: boolean;
    tournament: (typeof tournamentSpans)[number] | null;
    injured: boolean;
    trained: Sport[];
  }

  const cells: Cell[] = $derived.by(() => {
    const y = viewYear;
    const m = viewMonth;
    const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const firstDow = new Date(Date.UTC(y, m, 1)).getUTCDay();
    const leading = (firstDow + 6) % 7;
    const daysInPrev = new Date(Date.UTC(y, m, 0)).getUTCDate();

    const raw: { dayNum: number; inMonth: boolean; date: string | null }[] = [];
    for (let i = leading; i > 0; i--) raw.push({ dayNum: daysInPrev - i + 1, inMonth: false, date: null });
    for (let d = 1; d <= daysInMonth; d++) {
      raw.push({ dayNum: d, inMonth: true, date: `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
    }
    while (raw.length % 7 !== 0) raw.push({ dayNum: raw.length - (leading + daysInMonth) + 1, inMonth: false, date: null });

    return raw.map((c): Cell => {
      const tournament = c.date ? (tournamentSpans.find((t) => inSpan(c.date!, t.start, t.end)) ?? null) : null;
      const injured = !!(c.date && injurySpan && inSpan(c.date, injurySpan.startDate, injurySpan.endDate));
      const trainedWeek = c.date ? trainedSpans.find((w) => inSpan(c.date!, w.start, w.end)) : null;
      return {
        ...c,
        isToday: c.date === todayISO,
        tournament,
        injured,
        trained: trainedWeek ? trainedWeek.sports : [],
      };
    });
  });

  const agenda = $derived.by(() => {
    const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
    const items: { key: string; weekIndex: number | null; label: string; sub: string; kind: "tournament" | "injury" }[] = [];
    const seen = new Set<number>();
    for (const t of tournamentSpans) {
      if (seen.has(t.weekIndex)) continue;
      if (!t.start.startsWith(monthPrefix) && !t.end.startsWith(monthPrefix)) continue;
      seen.add(t.weekIndex);
      items.push({
        key: `t${t.weekIndex}`,
        weekIndex: t.weekIndex,
        label: `🏆 ${t.name}`,
        sub: `${t.tier} · ${fmt(t.start)} – ${fmt(t.end)}${t.status === "registered" ? " · Registered" : ""}`,
        kind: "tournament",
      });
    }
    if (injurySpan && (injurySpan.startDate.startsWith(monthPrefix) || injurySpan.endDate.startsWith(monthPrefix))) {
      const label = (SPORTS as readonly string[]).includes(injurySpan.type) ? SPORT_LABELS[injurySpan.type as Sport] : "Overuse";
      items.push({
        key: "injury",
        weekIndex: null,
        label: `🤕 ${label} injury`,
        sub: `Blocks training until ${fmt(injurySpan.endDate)}`,
        kind: "injury",
      });
    }
    return items;
  });

  function fmt(iso: string): string {
    const [, m, d] = iso.split("-").map(Number);
    return `${MONTH_NAMES[m! - 1]!.slice(0, 3)} ${d}`;
  }
</script>

<div class="calendar">
  <div class="nav">
    <button class="nav-btn" disabled={atStart} onclick={prevMonth} aria-label="Previous month">‹</button>
    <span class="month-label">{MONTH_NAMES[viewMonth]} {viewYear}</span>
    <button class="nav-btn" disabled={atEnd} onclick={nextMonth} aria-label="Next month">›</button>
  </div>

  <div class="legend">
    <span class="legend-item">🏆 Tournament</span>
    <span class="legend-item"><span class="dot" style:background={SPORT_COLORS.tt}></span>Trained</span>
    <span class="legend-item"><span class="dot danger"></span>Injury</span>
  </div>

  <div class="weekdays">
    {#each ["M", "T", "W", "T", "F", "S", "S"] as d, i (i)}
      <span>{d}</span>
    {/each}
  </div>

  <div class="grid">
    {#each cells as c, i (i)}
      {#if c.tournament}
        <button
          class="cell has-tournament"
          class:registered={c.tournament.status === "registered"}
          class:dim={!c.inMonth}
          class:today={c.isToday}
          onclick={() => onSelectWeek(c.tournament!.weekIndex)}
        >
          <span class="num">{c.dayNum}</span>
          <span class="marker">🏆</span>
        </button>
      {:else}
        <div class="cell" class:injured={c.injured} class:dim={!c.inMonth} class:today={c.isToday}>
          <span class="num">{c.dayNum}</span>
          <span class="marker">
            {#if c.injured}
              <span class="dot danger"></span>
            {:else if c.trained.length > 0}
              {#each c.trained as sport (sport)}
                <span class="dot" style:background={SPORT_COLORS[sport]}></span>
              {/each}
            {/if}
          </span>
        </div>
      {/if}
    {/each}
  </div>

  <div class="agenda">
    {#each agenda as item (item.key)}
      {#if item.kind === "tournament"}
        <button class="agenda-row" onclick={() => onSelectWeek(item.weekIndex!)}>
          <span class="agenda-label">{item.label}</span>
          <span class="agenda-sub">{item.sub}</span>
        </button>
      {:else}
        <div class="agenda-row static">
          <span class="agenda-label">{item.label}</span>
          <span class="agenda-sub">{item.sub}</span>
        </div>
      {/if}
    {:else}
      <p class="agenda-empty">Nothing scheduled yet this month</p>
    {/each}
  </div>
</div>

<style>
  .calendar {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 12px;
  }

  .nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 2px 8px;
  }

  .nav-btn {
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
    font-size: 20px;
    border-radius: 8px;
  }

  .nav-btn:disabled {
    opacity: 0.25;
  }

  .month-label {
    font-size: 14.5px;
    font-weight: 700;
    color: var(--text);
  }

  .legend {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    padding: 0 2px 10px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10.5px;
    color: var(--muted);
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    display: inline-block;
  }

  .dot.danger {
    border-radius: 2px;
    background: var(--danger);
  }

  .weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 3px;
    padding: 0 2px;
  }

  .weekdays span {
    text-align: center;
    font-size: 10px;
    color: var(--muted);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 3px;
    padding: 4px 2px 8px;
  }

  .cell {
    all: unset;
    box-sizing: border-box;
    aspect-ratio: 1;
    border-radius: 9px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    cursor: default;
  }

  .cell.has-tournament {
    cursor: pointer;
    background: color-mix(in srgb, var(--accent) 16%, var(--card));
  }

  .cell.has-tournament.registered {
    background: color-mix(in srgb, var(--ok) 18%, var(--card));
  }

  .cell.injured {
    background: color-mix(in srgb, var(--danger) 14%, var(--card));
  }

  .cell.dim {
    opacity: 0.28;
  }

  .cell.today {
    box-shadow: inset 0 0 0 1.5px var(--accent);
  }

  .num {
    font-size: 12px;
    color: var(--text);
  }

  .marker {
    height: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font-size: 9px;
  }

  .agenda {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }

  .agenda-row {
    width: 100%;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 6px 4px;
    border-radius: 8px;
  }

  .agenda-row.static {
    cursor: default;
  }

  .agenda-label {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .agenda-sub {
    font-size: 11px;
    color: var(--muted);
  }

  .agenda-empty {
    font-size: 12px;
    color: var(--muted);
    text-align: center;
    padding: 10px 0 2px;
  }
</style>
