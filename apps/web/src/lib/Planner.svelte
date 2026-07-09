<script lang="ts">
  import { defaultContent } from "@racketlon/content";
  import type { ActivityType } from "@racketlon/engine";
  import { DAYS, PERIODS, slotIndex } from "@racketlon/engine";
  import ActivityPicker from "./ActivityPicker.svelte";
  import ForecastBar from "./ForecastBar.svelte";
  import StatusBar from "./StatusBar.svelte";
  import TabBar from "./TabBar.svelte";
  import { TEMPLATES, store } from "./store.svelte";
  import { ACTIVITY_COLORS } from "./ui";

  let picking = $state<number | null>(null);

  function pick(activity: ActivityType) {
    if (picking !== null) store.setSlot(picking, activity);
    picking = null;
  }
</script>

<StatusBar />

<main>
  {#if store.tournamentThisWeek}
    {@const t = store.tournamentThisWeek}
    <div class="tournament-missed">
      <span>🏆 {t.name} is on this week — entry closed. Register on the Tour tab at least two weeks ahead next time.</span>
    </div>
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
        {@const activity = store.slots[i] ?? "rest"}
        <button
          class="slot"
          class:is-rest={activity === "rest"}
          style:--slot-color={ACTIVITY_COLORS[activity]}
          onclick={() => (picking = i)}
        >
          {defaultContent.activities[activity].short}
        </button>
      {/each}
    {/each}
  </div>
</main>

<footer>
  <ForecastBar />
  <div class="actions">
    <button class="simulate" onclick={() => void store.simulateWeek()}>Simulate week ▸</button>
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
