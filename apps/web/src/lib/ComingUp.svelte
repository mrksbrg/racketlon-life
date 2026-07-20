<script lang="ts">
  import { SPORT_LABELS } from "@racketlon/engine";
  import { store } from "./store.svelte";
  import { SPORT_COLORS, SPORT_SHORT } from "./ui";
</script>

{#if store.comingUp.length > 0}
  <section class="coming-up" aria-label="Coming up">
    <h3>Coming up</h3>
    <ul>
      {#each store.comingUp as item, i (i)}
        <li>
          {#if item.kind === "training"}
            <span class="tag" style:background={SPORT_COLORS[item.sport]}>{SPORT_SHORT[item.sport]}</span>
            <span>
              {SPORT_LABELS[item.sport]} → Level {item.nextLevel}
              {item.weeksToLevelUp === 1 ? "next week" : `in ~${item.weeksToLevelUp} weeks`} at this pace
            </span>
          {:else if item.kind === "deadline"}
            <span class="icon">🎟</span>
            <span><strong>{item.name}</strong> entry closes next week</span>
          {:else if item.kind === "payday"}
            <span class="icon">💰</span>
            <span>Payday {item.weeks === 0 ? "lands this week" : "lands next week"}</span>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .coming-up {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 12px 14px;
    margin-bottom: 12px;
  }

  h3 {
    font-size: 13px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 8px;
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  li {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    line-height: 1.35;
  }

  .tag {
    flex-shrink: 0;
    color: #0b0e14;
    font-weight: 700;
    font-size: 10px;
    border-radius: 4px;
    padding: 2px 4px;
    text-align: center;
  }

  .icon {
    flex-shrink: 0;
    width: 20px;
    text-align: center;
  }
</style>
