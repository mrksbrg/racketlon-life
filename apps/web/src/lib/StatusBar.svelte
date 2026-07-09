<script lang="ts">
  import { SPORTS } from "@racketlon/engine";
  import { store } from "./store.svelte";
  import { SPORT_COLORS, SPORT_SHORT, formatInjury, formatMoney } from "./ui";

  function confirmNewGame() {
    if (confirm("Start a new career? Your current save will be lost.")) {
      void store.newGame();
    }
  }
</script>

{#if store.you}
  <header>
    <div class="top">
      <button class="identity" onclick={() => store.goToTab("me")} title="View your profile">
        <div class="name">{store.you.name}, {store.you.age} ›</div>
        <div class="week">{store.weekLabel}</div>
      </button>
      <div class="right">
        <div class="money" class:negative={store.you.money < 0}>
          {formatMoney(store.you.money)}
        </div>
        <button class="reset" onclick={confirmNewGame} title="New career">⟲</button>
      </div>
    </div>
    {#if store.you.injury}
      <div class="injury-badge">{formatInjury(store.you.injury)}</div>
    {/if}
    <div class="levels">
      {#each SPORTS as sport (sport)}
        <div class="level">
          <span class="tag" style:background={SPORT_COLORS[sport]}>{SPORT_SHORT[sport]}</span>
          <span class="num">{store.you.sports[sport].level}</span>
          <div class="bar">
            <div class="fill" style:width="{store.you.sports[sport].progress * 100}%" style:background={SPORT_COLORS[sport]}></div>
          </div>
        </div>
      {/each}
      <div class="level fatigue">
        <span class="tag" style:background="var(--danger)">⚡</span>
        <span class="num">{store.you.fatigue}</span>
        <div class="bar">
          <div class="fill" style:width="{store.you.fatigue}%" style:background="var(--danger)"></div>
        </div>
      </div>
    </div>
  </header>
{/if}

<style>
  header {
    padding: 14px 16px 10px;
    background: var(--card);
    border-bottom: 1px solid var(--border);
  }

  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .identity {
    text-align: left;
    display: block;
  }

  .name {
    font-weight: 700;
  }

  .week {
    color: var(--muted);
    font-size: 13px;
  }

  .right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .money {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .money.negative {
    color: var(--danger);
  }

  .reset {
    color: var(--muted);
    font-size: 18px;
    padding: 4px;
  }

  .injury-badge {
    display: inline-block;
    margin-top: 8px;
    padding: 3px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--danger) 18%, var(--card));
    border: 1px solid var(--danger);
    color: var(--danger);
    font-size: 11px;
    font-weight: 700;
  }

  .levels {
    display: flex;
    gap: 10px;
    margin-top: 10px;
  }

  .level {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 12px;
  }

  .level .tag {
    align-self: flex-start;
    color: #0b0e14;
    font-weight: 700;
    font-size: 10px;
    border-radius: 4px;
    padding: 1px 4px;
  }

  .level .num {
    font-weight: 700;
    font-size: 14px;
  }

  .bar {
    height: 3px;
    border-radius: 2px;
    background: var(--card-2);
    overflow: hidden;
  }

  .fill {
    height: 100%;
    border-radius: 2px;
  }
</style>
