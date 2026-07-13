<script lang="ts">
  import StatusBar from "./StatusBar.svelte";
  import TabBar from "./TabBar.svelte";
  import { store } from "./store.svelte";
  import { flagEmoji } from "./ui";

  type RankingView = "fir" | "ratings";
  type SortKey = "points" | "rating";

  const PAGE_SIZE = 50;

  let view = $state<RankingView>("fir");
  let page = $state(0);

  const rows = $derived(store.rankings);
  const youId = $derived(store.you?.id);
  const primaryKey = $derived<SortKey>(view === "fir" ? "points" : "rating");

  const sortedRows = $derived.by(() =>
    [...rows].sort((a, b) => b[primaryKey] - a[primaryKey] || a.rank - b.rank),
  );
  const pageCount = $derived(Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE)));
  const safePage = $derived(Math.min(page, pageCount - 1));
  const visibleRows = $derived(sortedRows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE));

  function selectView(next: RankingView) {
    view = next;
    page = 0;
  }

  function setPage(next: number) {
    page = Math.max(0, Math.min(next, pageCount - 1));
  }
</script>

<StatusBar />

<main>
  <div class="head">
    <h2>Rankings</h2>
    <div class="seg compact">
      <button class:on={store.rankingsGender === "m"} onclick={() => { store.setRankingsGender("m"); page = 0; }}>Men</button>
      <button class:on={store.rankingsGender === "f"} onclick={() => { store.setRankingsGender("f"); page = 0; }}>Women</button>
    </div>
  </div>

  <div class="seg views" aria-label="Ranking views">
    <button class:on={view === "fir"} onclick={() => selectView("fir")}>FIR Ranking</button>
    <button class:on={view === "ratings"} onclick={() => selectView("ratings")}>Ratings</button>
  </div>

  {#if rows.length === 0}
    <p class="empty">No counted results yet in this ladder — play a tournament to appear here.</p>
  {:else}
    <div class="pager" aria-label="Ranking pages">
      {#each Array(pageCount).slice(0, 6) as _, i (i)}
        <button class:on={safePage === i} onclick={() => setPage(i)}>{i + 1}</button>
      {/each}
      <button disabled={safePage >= pageCount - 1} onclick={() => setPage(safePage + 1)}>▶</button>
      <button disabled={safePage >= pageCount - 2} onclick={() => setPage(safePage + 2)}>▶▶</button>
      <button disabled={safePage >= pageCount - 1} onclick={() => setPage(pageCount - 1)}>▶▌</button>
    </div>

    <div class="range-note">
      Showing {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, sortedRows.length)} of {sortedRows.length}
    </div>

    <div class="table">
      <div class="row head-row">
        <span class="c-rank">#</span>
        <span class="c-name">Player</span>
        {#if view === "fir"}
          <span class="c-num primary">FIR</span>
          <span class="c-num">Glicko</span>
        {:else}
          <span class="c-num primary">Glicko</span>
          <span class="c-num">FIR</span>
        {/if}
      </div>
      {#each visibleRows as row, index (row.playerId)}
        <button class="row" class:you={row.playerId === youId} onclick={() => store.viewOpponent(row.playerId)}>
          <span class="c-rank">{safePage * PAGE_SIZE + index + 1}</span>
          <span class="c-name">{flagEmoji(row.nationality)} {row.name}</span>
          {#if view === "fir"}
            <span class="c-num primary">{row.points}</span>
            <span class="c-num">{row.rating}</span>
          {:else}
            <span class="c-num primary">{row.rating}</span>
            <span class="c-num">{row.points}</span>
          {/if}
        </button>
      {/each}
    </div>
    <p class="foot-note">
      FIR Ranking is the official points ladder. Ratings orders by overall Glicko strength; sport-specific Glicko tabs can be added under Ratings next.
    </p>
  {/if}
</main>

<TabBar />

<style>
  main {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  h2 {
    font-size: 19px;
  }

  .seg {
    display: flex;
    background: var(--card-2);
    border-radius: 8px;
    padding: 2px;
  }

  .seg button {
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
    padding: 4px 10px;
    border-radius: 6px;
  }

  .seg button.on {
    background: var(--card);
    color: var(--text);
  }

  .views {
    margin-bottom: 12px;
  }

  .views button {
    flex: 1;
    padding: 8px 10px;
  }

  .empty {
    color: var(--muted);
    font-size: 13.5px;
  }

  .pager {
    display: flex;
    gap: 7px;
    margin-bottom: 8px;
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .pager button {
    flex: 0 0 44px;
    height: 36px;
    border-radius: 4px;
    background: var(--card-2);
    color: var(--muted);
    font-size: 17px;
    font-weight: 700;
  }

  .pager button.on {
    background: var(--accent);
    color: #fff;
  }

  .pager button:disabled {
    opacity: 0.38;
  }

  .range-note {
    color: var(--muted);
    font-size: 11.5px;
    margin-bottom: 8px;
  }

  .table {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    overflow: hidden;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 12px;
    width: 100%;
    text-align: left;
    font-size: 13.5px;
  }

  .row + .row {
    border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  }

  .head-row {
    color: var(--muted);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding-top: 8px;
    padding-bottom: 8px;
  }

  .row.you {
    color: var(--accent);
    font-weight: 700;
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }

  .c-rank {
    width: 28px;
    flex-shrink: 0;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .row.you .c-rank {
    color: var(--accent);
  }

  .c-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .c-num {
    width: 58px;
    flex-shrink: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }

  .c-num.primary {
    color: var(--text);
    font-weight: 700;
  }

  .row.you .c-num {
    color: var(--accent);
  }

  .foot-note {
    margin-top: 10px;
    font-size: 11.5px;
    color: var(--muted);
  }
</style>
