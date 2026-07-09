<script lang="ts">
  import { SPORTS, SPORT_LABELS } from "@racketlon/engine";
  import { store } from "./store.svelte";
  import { SPORT_COLORS, SPORT_SHORT, formatSignedMoney } from "./ui";
</script>

{#if store.summary && store.you}
  {@const s = store.summary}
  <main>
    <h2>{s.weekLabel}</h2>
    <p class="sub">Week complete</p>

    <section class="card">
      <h3>Skills</h3>
      {#each SPORTS as sport (sport)}
        {@const row = s.sports[sport]}
        <div class="sport-row" class:leveled={row.leveledUp}>
          <span class="tag" style:background={SPORT_COLORS[sport]}>{SPORT_SHORT[sport]}</span>
          <span class="sport-name">{SPORT_LABELS[sport]}</span>
          <span class="level">Lv {row.level}</span>
          <div class="bar">
            <div
              class="fill"
              style:width="{store.you.sports[sport].progress * 100}%"
              style:background={SPORT_COLORS[sport]}
            ></div>
          </div>
          <span class="delta" class:up={row.skillDelta > 0}>
            {row.leveledUp ? "LEVEL UP!" : row.skillDelta > 0 ? "▲" : ""}
          </span>
        </div>
      {/each}
    </section>

    <section class="card">
      <h3>Condition & money</h3>
      <div class="stat-row">
        <span>Fatigue</span>
        <span class:bad={s.fatigue.delta > 0} class:good={s.fatigue.delta < 0}>
          {s.fatigue.value}
          {#if s.fatigue.delta !== 0}
            ({s.fatigue.delta > 0 ? "+" : ""}{s.fatigue.delta})
          {/if}
        </span>
      </div>
      <div class="stat-row">
        <span>Money</span>
        <span class:bad={s.money.delta < 0} class:good={s.money.delta > 0}>
          {formatSignedMoney(s.money.delta)}
        </span>
      </div>
    </section>

    {#if s.notes.length > 0}
      <section class="card">
        <h3>This week</h3>
        {#each s.notes as note, i (i)}
          <p class="note">{note}</p>
        {/each}
      </section>
    {/if}
  </main>

  <footer>
    <button class="next" onclick={() => store.nextWeek()}>Plan next week ▸</button>
  </footer>
{/if}

<style>
  main {
    flex: 1;
    overflow-y: auto;
    padding: 20px 16px;
  }

  h2 {
    font-size: 20px;
  }

  .sub {
    color: var(--muted);
    margin: 2px 0 16px;
    font-size: 13px;
  }

  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 14px;
    margin-bottom: 12px;
  }

  .card h3 {
    font-size: 13px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 10px;
  }

  .sport-row {
    display: grid;
    grid-template-columns: 30px 1fr 44px 70px 76px;
    align-items: center;
    gap: 8px;
    padding: 7px 0;
    font-size: 14px;
  }

  .sport-row.leveled {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    border-radius: 8px;
    padding-inline: 6px;
    margin-inline: -6px;
  }

  .tag {
    color: #0b0e14;
    font-weight: 700;
    font-size: 10px;
    border-radius: 4px;
    padding: 2px 4px;
    text-align: center;
  }

  .level {
    font-weight: 700;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .bar {
    height: 4px;
    border-radius: 2px;
    background: var(--card-2);
    overflow: hidden;
  }

  .fill {
    height: 100%;
  }

  .delta {
    font-size: 11px;
    font-weight: 700;
    text-align: right;
    color: var(--muted);
  }

  .delta.up {
    color: var(--ok);
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    font-size: 14px;
  }

  .bad {
    color: var(--danger);
  }

  .good {
    color: var(--ok);
  }

  .note {
    margin: 6px 0;
    padding: 10px 12px;
    background: var(--card-2);
    border-radius: 10px;
    font-size: 14px;
  }

  footer {
    position: sticky;
    bottom: 0;
    padding: 10px 16px calc(12px + env(safe-area-inset-bottom));
    background: var(--card);
  }

  .next {
    width: 100%;
    background: var(--accent);
    color: white;
    font-weight: 700;
    font-size: 16px;
    border-radius: 12px;
    padding: 14px;
  }
</style>
