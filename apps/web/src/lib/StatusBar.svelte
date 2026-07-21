<script lang="ts">
  import { SPORTS } from "@racketlon/engine";
  import InboxButton from "./InboxButton.svelte";
  import { store } from "./store.svelte";
  import TopMenu from "./TopMenu.svelte";
  import { SPORT_COLORS, SPORT_SHORT, formColor, formatInjury } from "./ui";

  const SCREEN_LABELS: Partial<Record<string, string>> = {
    planner: "Home",
    tour: "Tour",
    rankings: "Rankings",
    world: "World",
    inbox: "Inbox",
    me: "Me",
  };

  const screenLabel = $derived(SCREEN_LABELS[store.screen] ?? "Home");
  const showSoreness = $derived(Boolean(store.tournamentContext));
</script>

{#if store.you}
  <header>
    <div class="top">
      <div class="context">
        <div class="screen">{screenLabel}</div>
        <div class="week">{store.weekLabel}</div>
      </div>
      <div class="right">
        <InboxButton />
        <TopMenu />
      </div>
    </div>
    {#if store.you.injury}
      <div class="injury-badge">{formatInjury(store.you.injury)}</div>
    {/if}
    <div class="levels">
      {#each SPORTS as sport (sport)}
        {@const form = store.you.formBySport[sport]}
        <div class="level">
          <span class="tag" style:background={SPORT_COLORS[sport]}>{SPORT_SHORT[sport]}</span>
          <span class="num">{store.you.sports[sport].level}</span>
          <div class="bar">
            <div class="fill" style:width="{store.you.sports[sport].progress * 100}%" style:background={SPORT_COLORS[sport]}></div>
          </div>
          <div class="bar form-bar" title="Form: {form}/20">
            <div class="fill" style:width="{(form / 20) * 100}%" style:background={formColor(form)}></div>
          </div>
        </div>
      {/each}
      <div class="level fatigue" title="Fatigue">
        <span class="tag" style:background="var(--danger)">⚡</span>
        <span class="num">{store.you.fatigue}</span>
        <div class="bar">
          <div class="fill" style:width="{store.you.fatigue}%" style:background="var(--danger)"></div>
        </div>
      </div>
      {#if showSoreness}
        <div class="level soreness" title="Tournament soreness from recent match play">
          <span class="tag" style:background="var(--warn)">💢</span>
          <span class="num">{store.you.soreness}</span>
          <div class="bar">
            <div class="fill" style:width="{store.you.soreness}%" style:background="var(--warn)"></div>
          </div>
        </div>
      {/if}
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

  .context {
    min-width: 0;
  }

  .screen {
    font-weight: 800;
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

  .form-bar {
    height: 2px;
    margin-top: 2px;
    opacity: 0.85;
  }

  .fill {
    height: 100%;
    border-radius: 2px;
  }
</style>
