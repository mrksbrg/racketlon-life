<script lang="ts">
  import { SPORTS } from "@racketlon/engine";
  import { store } from "./store.svelte";
  import { SPORT_COLORS, SPORT_SHORT, formatSignedMoney } from "./ui";

  const FATIGUE_ARROWS: Record<number, string> = {
    [-2]: "▼▼",
    [-1]: "▼",
    0: "—",
    1: "▲",
    2: "▲▲",
  };
</script>

{#if store.forecast}
  {@const f = store.forecast}
  <div class="forecast" aria-label="Week forecast">
    {#each SPORTS as sport (sport)}
      {#if f.sports[sport] > 0}
        <span class="chip" style:color={SPORT_COLORS[sport]}>
          {SPORT_SHORT[sport]} {"+".repeat(f.sports[sport])}
        </span>
      {/if}
    {/each}
    <span
      class="chip"
      class:bad={f.fatigue > 0}
      class:good={f.fatigue < 0}
      title="How this week's training/travel load and rest balance out — high fatigue raises injury risk and dulls training gains"
    >
      ⚡ Fatigue {FATIGUE_ARROWS[f.fatigue]}
    </span>
    <span
      class="chip"
      class:bad={f.money < 0}
      class:good={f.money > 0}
      title="Rent, food, and phone plus any paid training/gym/social sessions this week — work income is separate, see payday"
    >
      🧾 Costs {formatSignedMoney(f.money)}
    </span>
    {#if f.salaryEarned > 0}
      <span class="chip good" title="Work income banks toward next payday — salary pays out in one lump sum on the last week of each month">
        💰 {formatSignedMoney(f.salaryEarned)} payday
      </span>
    {/if}
    <span
      class="chip risk-{f.injuryRisk}"
      title="Chance of picking up an injury this week, from your planned training load and current fatigue"
    >
      ✚ Injury risk: {f.injuryRisk}
    </span>
  </div>
{/if}

<style>
  .forecast {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 10px 16px;
    background: var(--card);
    border-top: 1px solid var(--border);
  }

  .chip {
    background: var(--card-2);
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 12.5px;
    font-weight: 600;
  }

  .chip.bad {
    color: var(--danger);
  }

  .chip.good {
    color: var(--ok);
  }

  .risk-low {
    color: var(--ok);
  }

  .risk-medium {
    color: var(--warn);
  }

  .risk-high {
    color: var(--danger);
  }
</style>
