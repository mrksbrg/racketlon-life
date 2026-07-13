<script lang="ts">
  import StatusBar from "./StatusBar.svelte";
  import TabBar from "./TabBar.svelte";
  import { store } from "./store.svelte";
  import { flagEmoji } from "./ui";

  type SortKey = "points" | "racePoints" | "rating";
  type SortDir = "asc" | "desc";

  let sortKey = $state<SortKey>("points");
  let sortDir = $state<SortDir>("desc");

  const rows = $derived(store.rankings);
  const youId = $derived(store.you?.id);

  /** Sorts by whichever column was tapped. The leftmost `#` is the row's
   * visible position in the current sort, so alternate views like Race still
   * have an easy-to-scan order. */
  const sortedRows = $derived.by(() => {
    const dir = sortDir === "desc" ? -1 : 1;
    return [...rows].sort((a, b) => dir * (a[sortKey] - b[sortKey]) || a.rank - b.rank);
  });

  function sortBy(key: SortKey) {
    if (sortKey === key) {
      sortDir = sortDir === "desc" ? "asc" : "desc";
    } else {
      sortKey = key;
      sortDir = "desc";
    }
  }

  const ARROW: Record<SortDir, string> = { asc: "▲", desc: "▼" };
  const COLUMNS: { key: SortKey; label: string }[] = [
    { key: "points", label: "Points" },
    { key: "racePoints", label: "Race" },
    { key: "rating", label: "Glicko" },
  ];
</script>

<StatusBar />

<main>
  <div class="head">
    <h2>Rankings</h2>
    <div class="seg">
      <button class:on={store.rankingsGender === "m"} onclick={() => store.setRankingsGender("m")}>Men</button>
      <button class:on={store.rankingsGender === "f"} onclick={() => store.setRankingsGender("f")}>Women</button>
    </div>
  </div>

  {#if rows.length === 0}
    <p class="empty">No counted results yet in this ladder — play a tournament to appear here.</p>
  {:else}
    <div class="table">
      <div class="row head-row">
        <span class="c-rank">#</span>
        <span class="c-name">Player</span>
        {#each COLUMNS as col (col.key)}
          <button class="c-num sortable" class:active={sortKey === col.key} onclick={() => sortBy(col.key)}>
            {col.label}
            {#if sortKey === col.key}<span class="arrow">{ARROW[sortDir]}</span>{/if}
          </button>
        {/each}
      </div>
      {#each sortedRows as row, index (row.playerId)}
        <button class="row" class:you={row.playerId === youId} onclick={() => store.viewOpponent(row.playerId)}>
          <span class="c-rank">{index + 1}</span>
          <span class="c-name">{flagEmoji(row.nationality)} {row.name}</span>
          <span class="c-num">{row.points}</span>
          <span class="c-num">{row.racePoints}</span>
          <span class="c-num">{row.rating}</span>
        </button>
      {/each}
    </div>
    <p class="foot-note"># is the current sorted position · Points is the official ladder · Race is this season's points so far, reset every January · Glicko is a strength estimate, not the ranking</p>
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
    margin-bottom: 14px;
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

  .empty {
    color: var(--muted);
    font-size: 13.5px;
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
    width: 22px;
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
    width: 48px;
    flex-shrink: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }

  .row.you .c-num {
    color: var(--accent);
  }

  .head-row .c-num.sortable {
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 11px;
    font-weight: 700;
  }

  .head-row .c-num.sortable.active {
    color: var(--accent);
  }

  .arrow {
    display: inline-block;
    margin-left: 2px;
    font-size: 8px;
  }

  .foot-note {
    margin-top: 10px;
    font-size: 11.5px;
    color: var(--muted);
  }
</style>
