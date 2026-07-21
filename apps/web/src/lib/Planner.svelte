<script lang="ts">
  import { defaultContent } from "@racketlon/content";
  import type { ActivityType } from "@racketlon/engine";
  import { ACTIVITY_TYPES, DAYS, PERIODS, activityBlockedByInjury, slotIndex } from "@racketlon/engine";
  import ActivityPicker from "./ActivityPicker.svelte";
  import ComingUp from "./ComingUp.svelte";
  import ForecastBar from "./ForecastBar.svelte";
  import StatusBar from "./StatusBar.svelte";
  import TabBar from "./TabBar.svelte";
  import { TEMPLATES, TRAIN_FOR, store } from "./store.svelte";
  import { ACTIVITY_COLORS, formatMoney } from "./ui";

  let picking = $state<number | null>(null);

  const tournamentEntry = $derived(store.tourEntries.find((e) => e.isThisWeek) ?? null);
  const travelSlots = $derived(new Set(store.travelBlocksThisWeek.flatMap((block) => block.slotIndices)));
  const tournamentSlots = $derived(new Set(store.tournamentBlocksThisWeek.flatMap((block) => block.slotIndices)));
  const activeTournamentThisWeek = $derived(store.registeredTournamentThisWeek ?? (tournamentSlots.size > 0 ? tournamentEntry?.tournament : null));
  const holidayDates = $derived(new Set(store.holidays.map((h) => h.date)));
  /** A decision-event commitment (e.g. a sparring session) — forced into
   * the grid like travel/tournament, but shown as its real activity color
   * rather than an amber "you can't act here" block, since it's a real
   * (better) training session, not lost time. */
  const reservedSlots = $derived(new Map(store.reservedSlotsThisWeek.map((r) => [r.slotIndex, r.activity])));

  function dayLabel(dateISO: string): number {
    return Number(dateISO.slice(8, 10));
  }

  const pickingUnavailable = $derived.by((): Partial<Record<ActivityType, string>> => {
    if (picking === null) return {};
    const reasons: Partial<Record<ActivityType, string>> = {};
    if (store.isHolidaySlot(picking)) {
      reasons.work = "Closed — public holiday";
    } else if (store.isForcedWorkSlot(picking)) {
      for (const type of ACTIVITY_TYPES) {
        if (type !== "work" && type !== "travel") reasons[type] = "No vacation days left";
      }
    }
    // a week modifier (fun-plan P3) blocking a sport this week (e.g. closed
    // courts) stacks on top of the above — always checked, not mutually
    // exclusive with holiday/vacation reasons.
    const blockedSport = store.weekModifier?.blockedSport;
    if (blockedSport) reasons[TRAIN_FOR[blockedSport]] = store.weekModifier!.headline;
    // an active injury/illness stacks too — sport training is always
    // blocked, gym never, cardio only for illness (see injury-gating.ts).
    const injury = store.you?.injury;
    if (injury) {
      for (const type of ACTIVITY_TYPES) {
        if (!reasons[type] && activityBlockedByInjury(type, injury.kind)) {
          reasons[type] = `${injury.label} — can't train`;
        }
      }
    }
    return reasons;
  });

  function openPicker(index: number) {
    if (travelSlots.has(index) || tournamentSlots.has(index) || reservedSlots.has(index)) return;
    picking = index;
  }

  function pick(activity: ActivityType) {
    if (picking !== null) store.setSlot(picking, activity);
    picking = null;
  }
</script>

<StatusBar />

<main>
  {#if activeTournamentThisWeek && tournamentEntry}
    {@const t = activeTournamentThisWeek}
    <div class="tournament-missed tournament-ready">
      <strong>🏆 {t.name} week:</strong> plan any last sessions before you press Play. Training can sharpen form, but fatigue and injury risk still count.
      <span class="travel-note">Tournament days are blocked for match play and cannot be used for training.</span>
      {#if tournamentEntry.travelDays > 0}
        <span class="travel-note">Travel booked: {tournamentEntry.travelDays === 2 ? "two travel days" : "one travel day"} each way are blocked around the event.</span>
      {/if}
      {#if !store.canAffordTournamentThisWeek}
        <span class="travel-note over">
          Can't afford this trip — you need {formatMoney(tournamentEntry.tournament.entryFee + tournamentEntry.travelCost.total)} on hand for the entry fee and travel.
        </span>
      {/if}
      <span class="travel-note">Check the draw email in your inbox, then tune any free sessions before the event.</span>
      <button class="draw-link" onclick={() => store.viewTournamentDetail(store.weekIndex)}>View the draw ▸</button>
    </div>
  {:else if store.tournamentThisWeek}
    {@const t = store.tournamentThisWeek}
    <div class="tournament-missed">
      <span>🏆 {t.name} is on this week — entry closed. Register on the Tour tab at least two weeks ahead next time.</span>
      <button class="draw-link" onclick={() => store.viewTournamentDetail(store.weekIndex)}>View the draw ▸</button>
    </div>
  {/if}

  {#if store.you}
    <section class="home-hubs" aria-label="Home summaries">
      <button class="hub-card" title="Salary is paid out as one lump sum on the last week of each month">
        <span class="hub-label">Money</span>
        <strong class:negative={store.you.money < 0}>{formatMoney(store.you.money)}</strong>
        {#if store.you.pendingSalary > 0}
          <span class="hub-sub">+{formatMoney(store.you.pendingSalary)} payday</span>
        {/if}
      </button>
      <button class="hub-card" title="Health will become a dedicated section in Home">
        <span class="hub-label">Health</span>
        <strong>⚡ {store.you.fatigue}</strong>
      </button>
      <button class="hub-card" title="Paid leave left this year — weekday time off draws it down">
        <span class="hub-label">Vacation</span>
        <strong class:negative={store.you.remainingVacationDays < 0}>🏖 {store.you.remainingVacationDays} / {store.you.annualVacationDays}</strong>
      </button>
    </section>
  {/if}

  {#if store.weekModifier}
    <div class="week-modifier">
      <span class="week-modifier-icon">🎲</span>
      <div class="week-modifier-text">
        <strong>{store.weekModifier.headline}</strong>
        <p>{store.weekModifier.body}</p>
      </div>
    </div>
  {/if}

  <ComingUp />

  <div class="templates">
    {#each Object.keys(TEMPLATES) as name (name)}
      {@const affordable = store.canAffordTemplate(name)}
      <button
        class="template"
        disabled={!affordable}
        title={affordable ? undefined : "Not enough money for an income-free week — you'd go broke before payday"}
        onclick={() => store.applyTemplate(name)}
      >
        {name}
      </button>
    {/each}
  </div>

  {#if store.you && store.you.remainingVacationDays <= 0}
    <p class="vacation-hint over">🏖 Out of paid leave — weekdays default to work until it resets</p>
  {:else if store.you && store.vacationCostThisWeek > 0}
    <p class="vacation-hint" class:over={store.you.remainingVacationDays - store.vacationCostThisWeek < 0}>
      🏖 This week uses <strong>{store.vacationCostThisWeek}</strong> vacation {store.vacationCostThisWeek === 1 ? "day" : "days"}
    </p>
  {/if}

  <div class="grid" role="grid" aria-label="Week planner">
    <div class="corner"></div>
    {#each PERIODS as period (period)}
      <div class="col-head">{period.slice(0, 3)}</div>
    {/each}
    {#each DAYS as day, d (day)}
      {@const date = store.weekDates[d]}
      {@const isHoliday = date ? holidayDates.has(date) : false}
      <div class="row-head" class:holiday={isHoliday}>
        <span class="row-day">{day}</span>
        {#if date}<span class="row-date">{dayLabel(date)}</span>{/if}
      </div>
      {#each PERIODS as period, p (period)}
        {@const i = slotIndex(d, p)}
        {@const isTournament = tournamentSlots.has(i)}
        {@const isTravel = travelSlots.has(i)}
        {@const reservedActivity = reservedSlots.get(i)}
        {@const activity = isTravel ? "travel" : (reservedActivity ?? store.effectiveSlot(i))}
        <button
          class="slot"
          class:is-rest={activity === "rest" && !isTravel && !isTournament}
          class:is-blocked={isTravel || isTournament}
          class:is-reserved={reservedActivity !== undefined && !isTravel && !isTournament}
          disabled={isTravel || isTournament || reservedActivity !== undefined}
          title={reservedActivity !== undefined ? "Reserved — a sparring session you've already committed to" : undefined}
          style:--slot-color={ACTIVITY_COLORS[activity]}
          onclick={() => openPicker(i)}
        >
          {isTournament ? "Tournament" : defaultContent.activities[activity].short}
        </button>
      {/each}
    {/each}
  </div>
</main>

<footer>
  <ForecastBar />
  <div class="actions">
    {#if activeTournamentThisWeek}
      <button class="simulate" disabled={!store.canAffordTournamentThisWeek} onclick={() => store.enterTournament()}>
        {store.canAffordTournamentThisWeek ? "Play tournament ▸" : "Can't afford this trip"}
      </button>
    {:else}
      <button class="simulate" onclick={() => void store.simulateWeek()}>Simulate week ▸</button>
    {/if}
  </div>
</footer>

{#if picking !== null}
  <ActivityPicker slotIndex={picking} onpick={pick} onclose={() => (picking = null)} unavailable={pickingUnavailable} />
{/if}

<TabBar />

<style>
  main {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px;
  }

  .tournament-missed {
    background: var(--card);
    border: 1px dashed var(--border);
    border-radius: 12px;
    padding: 10px 14px;
    margin-bottom: 12px;
    font-size: 12.5px;
    color: var(--muted);
  }

  .tournament-ready {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .home-hubs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 12px;
  }

  .hub-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    min-height: 58px;
    padding: 11px 12px;
    border-radius: 14px;
    background: var(--card);
    border: 1px solid var(--border);
    text-align: left;
  }

  .hub-label {
    color: var(--muted);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .hub-card strong {
    font-size: 16px;
  }

  .hub-card strong.negative {
    color: var(--danger);
  }

  .hub-sub {
    font-size: 10.5px;
    color: var(--muted);
  }

  .vacation-hint {
    margin: -4px 0 12px;
    font-size: 12.5px;
    color: var(--muted);
    text-align: center;
  }

  .vacation-hint strong {
    color: var(--text);
  }

  .vacation-hint.over,
  .vacation-hint.over strong {
    color: var(--danger);
  }

  .week-modifier {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 12px 14px;
    margin-bottom: 12px;
  }

  .week-modifier-icon {
    font-size: 18px;
    flex-shrink: 0;
  }

  .week-modifier-text strong {
    display: block;
    font-size: 13.5px;
    margin-bottom: 2px;
  }

  .week-modifier-text p {
    margin: 0;
    font-size: 12.5px;
    color: var(--muted);
    line-height: 1.4;
  }

  .travel-note {
    display: block;
  }

  .draw-link {
    display: block;
    margin-top: 6px;
    color: var(--accent);
    font-weight: 700;
    font-size: 12.5px;
  }

  .travel-note.over {
    color: var(--danger);
    font-weight: 600;
  }

  .templates {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .template {
    flex-shrink: 0;
    background: var(--card-2);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 6px 12px;
    font-size: 12.5px;
    color: var(--muted);
    font-weight: 600;
  }

  .template:active {
    color: var(--text);
    border-color: var(--accent);
  }

  .template:disabled {
    opacity: 0.4;
  }

  .grid {
    display: grid;
    grid-template-columns: 44px repeat(3, 1fr);
    gap: 6px;
  }

  .col-head,
  .row-head {
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .row-head {
    flex-direction: column;
    justify-content: center;
    gap: 1px;
    line-height: 1.1;
  }

  .row-day {
    font-size: 11px;
  }

  .row-date {
    font-size: 12px;
    font-weight: 700;
    color: var(--text);
  }

  .row-head.holiday .row-date {
    color: var(--danger);
  }

  .slot {
    background: color-mix(in srgb, var(--slot-color) 26%, var(--card));
    border: 1px solid color-mix(in srgb, var(--slot-color) 45%, var(--border));
    border-radius: 10px;
    min-height: 44px;
    font-weight: 700;
    font-size: 13px;
  }

  .slot.is-blocked {
    background: rgba(250, 204, 21, 0.16);
    border-color: rgba(250, 204, 21, 0.42);
    color: #fde68a;
    cursor: not-allowed;
  }

  .slot.is-rest {
    background: var(--card);
    border: 1px dashed var(--border);
    color: var(--muted);
    font-weight: 400;
  }

  .slot.is-reserved {
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--slot-color) 70%, transparent);
    cursor: default;
  }

  .slot:active {
    filter: brightness(1.25);
  }

  footer {
    position: sticky;
    bottom: 0;
  }

  .actions {
    padding: 10px 16px calc(12px + env(safe-area-inset-bottom));
    background: var(--card);
  }

  .simulate {
    width: 100%;
    background: var(--accent);
    color: white;
    font-weight: 700;
    font-size: 16px;
    border-radius: 12px;
    padding: 14px;
  }

  .simulate:active {
    filter: brightness(1.15);
  }

  .simulate:disabled {
    background: var(--card-2);
    color: var(--muted);
  }
</style>
