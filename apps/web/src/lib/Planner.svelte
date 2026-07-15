<script lang="ts">
  import { defaultContent } from "@racketlon/content";
  import type { ActivityType } from "@racketlon/engine";
  import { DAYS, PERIODS, slotIndex } from "@racketlon/engine";
  import ActivityPicker from "./ActivityPicker.svelte";
  import ForecastBar from "./ForecastBar.svelte";
  import StatusBar from "./StatusBar.svelte";
  import TabBar from "./TabBar.svelte";
  import { TEMPLATES, store } from "./store.svelte";
  import { ACTIVITY_COLORS, formatMoney } from "./ui";

  let picking = $state<number | null>(null);

  const tournamentEntry = $derived(store.tourEntries.find((e) => e.isThisWeek) ?? null);
  const travelSlots = $derived(new Set(store.travelBlocksThisWeek.flatMap((block) => block.slotIndices)));
  const tournamentSlots = $derived(new Set(store.tournamentBlocksThisWeek.flatMap((block) => block.slotIndices)));
  const activeTournamentThisWeek = $derived(store.registeredTournamentThisWeek ?? (tournamentSlots.size > 0 ? tournamentEntry?.tournament : null));

  function openPicker(index: number) {
    if (travelSlots.has(index) || tournamentSlots.has(index)) return;
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
      <span class="travel-note">Check the draw email in your inbox, then tune any free sessions before the event.</span>
    </div>
  {:else if store.tournamentThisWeek}
    {@const t = store.tournamentThisWeek}
    <div class="tournament-missed">
      <span>🏆 {t.name} is on this week — entry closed. Register on the Tour tab at least two weeks ahead next time.</span>
    </div>
  {/if}

  {#if store.you}
    <section class="home-hubs" aria-label="Home summaries">
      <button class="hub-card" title="Finances will become a dedicated section in Home">
        <span class="hub-label">Money</span>
        <strong class:negative={store.you.money < 0}>{formatMoney(store.you.money)}</strong>
      </button>
      <button class="hub-card" title="Health will become a dedicated section in Home">
        <span class="hub-label">Health</span>
        <strong>⚡ {store.you.fatigue}</strong>
      </button>
    </section>
  {/if}

  <div class="templates">
    {#each Object.keys(TEMPLATES) as name (name)}
      <button class="template" onclick={() => store.applyTemplate(name)}>{name}</button>
    {/each}
  </div>

  <div class="grid" role="grid" aria-label="Week planner">
    <div class="corner"></div>
    {#each PERIODS as period (period)}
      <div class="col-head">{period.slice(0, 3)}</div>
    {/each}
    {#each DAYS as day, d (day)}
      <div class="row-head">{day}</div>
      {#each PERIODS as period, p (period)}
        {@const i = slotIndex(d, p)}
        {@const isTournament = tournamentSlots.has(i)}
        {@const isTravel = travelSlots.has(i)}
        {@const activity = isTravel ? "travel" : (store.slots[i] ?? "rest")}
        <button
          class="slot"
          class:is-rest={activity === "rest" && !isTravel && !isTournament}
          class:is-blocked={isTravel || isTournament}
          disabled={isTravel || isTournament}
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
      <button class="simulate" onclick={() => store.enterTournament()}>Play tournament ▸</button>
    {:else}
      <button class="simulate" onclick={() => void store.simulateWeek()}>Simulate week ▸</button>
    {/if}
  </div>
</footer>

{#if picking !== null}
  <ActivityPicker slotIndex={picking} onpick={pick} onclose={() => (picking = null)} />
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
    grid-template-columns: repeat(2, minmax(0, 1fr));
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
    font-size: 17px;
  }

  .hub-card strong.negative {
    color: var(--danger);
  }


  .travel-note {
    display: block;
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
    justify-content: flex-start;
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
</style>
