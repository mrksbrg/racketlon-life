<script lang="ts">
  import { SPORTS, SPORT_LABELS } from "@racketlon/engine";
  import AnimatedNumber from "./AnimatedNumber.svelte";
  import { ATTR_META, type CharAttr } from "./character";
  import { store } from "./store.svelte";
  import { SPORT_COLORS, SPORT_SHORT, formColor, formatSignedMoney } from "./ui";

  const TRAINABLE_ATTRS = ["stamina", "coreStrength"] as const satisfies readonly CharAttr[];

  // bars render at their "before" width on first paint, then flip to
  // "after" a tick later — the CSS transition on .fill is what actually
  // animates the growth (or shrinkage) into view, rather than snapping
  // straight to the end-of-week state.
  let settled = $state(false);
  $effect(() => {
    const t = setTimeout(() => (settled = true), 60);
    return () => clearTimeout(t);
  });
</script>

{#if store.summary && store.you}
  {@const s = store.summary}
  <main>
    <h2>{s.weekLabel}</h2>
    <p class="sub">Week complete</p>

    <section class="card">
      <h3>Skills &amp; form</h3>
      {#each SPORTS as sport (sport)}
        {@const row = s.sports[sport]}
        <div class="sport-block">
          <div class="sport-row" class:leveled={row.leveledUp}>
            <span class="tag" style:background={SPORT_COLORS[sport]}>{SPORT_SHORT[sport]}</span>
            <span class="sport-name">{SPORT_LABELS[sport]}</span>
            <span class="level">Lv {row.level}</span>
            <div class="bar">
              <div
                class="fill"
                style:width="{(settled ? row.progress : row.beforeProgress) * 100}%"
                style:background={SPORT_COLORS[sport]}
              ></div>
            </div>
            <span class="delta" class:up={row.skillDelta > 0}>
              {#if row.leveledUp}
                LEVEL UP!
              {:else if row.skillDelta > 0}
                +<AnimatedNumber value={row.skillDelta} decimals={1} />
              {/if}
            </span>
          </div>
          <div class="form-row" class:rise={row.formDelta > 0} class:drop={row.formDelta < 0}>
            <span class="form-label">Form</span>
            <div class="bar form-bar">
              <div
                class="fill"
                style:width="{(settled ? row.form : row.beforeForm) / 20 * 100}%"
                style:background={formColor(row.form)}
              ></div>
            </div>
            <span class="form-delta" class:up={row.formDelta > 0} class:down={row.formDelta < 0}>
              {#if row.formDelta !== 0}
                <AnimatedNumber value={row.formDelta} signed />
              {:else}
                ·
              {/if}
            </span>
          </div>
        </div>
      {/each}
    </section>

    <section class="card">
      <h3>Body</h3>
      {#each TRAINABLE_ATTRS as attr (attr)}
        {@const row = s.trainableAttributes[attr]}
        {@const meta = ATTR_META[attr]}
        <div class="attr-row">
          <span class="attr-name">{meta.label}</span>
          <span class="attr-level">Lv {Math.max(1, Math.min(20, Math.round(row.value * 20)))}</span>
          <div class="bar">
            <div
              class="fill"
              style:width="{(settled ? row.value : row.beforeValue) * 100}%"
              style:background={meta.color}
            ></div>
          </div>
          <span class="attr-delta" class:up={row.delta > 0} class:down={row.delta < 0}>
            {#if row.delta !== 0}
              <AnimatedNumber value={row.delta} decimals={1} signed />
            {:else}
              ·
            {/if}
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

  .sport-block {
    padding: 6px 0;
  }

  .sport-block + .sport-block {
    border-top: 1px solid var(--border);
  }

  .sport-row {
    display: grid;
    grid-template-columns: 30px 1fr 44px 70px 76px;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }

  .sport-row.leveled {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    border-radius: 8px;
    padding-inline: 6px;
    margin-inline: -6px;
    animation: levelPulse 1.2s ease-in-out 2;
  }

  @keyframes levelPulse {
    0%,
    100% {
      background: color-mix(in srgb, var(--accent) 14%, transparent);
    }
    50% {
      background: color-mix(in srgb, var(--accent) 34%, transparent);
    }
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
    transition: width 0.8s cubic-bezier(0.22, 1, 0.36, 1);
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

  .attr-row {
    display: grid;
    grid-template-columns: 1fr 44px 90px 48px;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    font-size: 14px;
  }

  .attr-level,
  .attr-delta {
    font-weight: 700;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .attr-delta {
    color: var(--muted);
    font-size: 11px;
  }

  .attr-delta.up {
    color: var(--ok);
  }

  .attr-delta.down {
    color: var(--danger);
  }

  .form-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
    padding-left: 38px;
  }

  .form-row.drop {
    animation: formDrop 0.5s ease-in-out;
  }

  @keyframes formDrop {
    0%,
    100% {
      transform: translateX(0);
    }
    25% {
      transform: translateX(-3px);
    }
    75% {
      transform: translateX(3px);
    }
  }

  .form-label {
    width: 32px;
    flex-shrink: 0;
    font-size: 10px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .form-bar {
    flex: 1;
    height: 3px;
  }

  .form-delta {
    width: 40px;
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 700;
    text-align: right;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .form-delta.up {
    color: var(--ok);
  }

  .form-delta.down {
    color: var(--danger);
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
