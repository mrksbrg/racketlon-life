<script lang="ts">
  import StatusBar from "./StatusBar.svelte";
  import TabBar from "./TabBar.svelte";
  import { store } from "./store.svelte";
  import { flagEmoji } from "./ui";

  type RankingView = "fir" | "race" | "ratings";
  type SortKey = "points" | "racePoints" | "rating" | "tt" | "bd" | "sq" | "tn";
  type SortDir = "asc" | "desc";

  const PAGE_SIZE = 50;

  const RATING_COLUMNS: { key: SortKey; label: string }[] = [
    { key: "rating", label: "Total" },
    { key: "tt", label: "TT" },
    { key: "bd", label: "BA" },
    { key: "sq", label: "SQ" },
    { key: "tn", label: "TE" },
  ];

  let view = $state<RankingView>("fir");
  let sortKey = $state<SortKey>("points");
  let sortDir = $state<SortDir>("desc");
  let page = $state(0);

  const rankingModel = $derived.by(() => {
    const rows = store.rankings;
    const dir = sortDir === "desc" ? -1 : 1;
    const rankedRows = [...rows].sort((a, b) => {
      const aValue =
        sortKey === "tt" || sortKey === "bd" || sortKey === "sq" || sortKey === "tn"
          ? a.sportRatings[sortKey]
          : a[sortKey];
      const bValue =
        sortKey === "tt" || sortKey === "bd" || sortKey === "sq" || sortKey === "tn"
          ? b.sportRatings[sortKey]
          : b[sortKey];
      return dir * (aValue - bValue) || a.rank - b.rank;
    });
    const pageCount = Math.max(1, Math.ceil(rankedRows.length / PAGE_SIZE));
    const safePage = Math.min(page, pageCount - 1);
    const visibleRows = rankedRows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
    const start = Math.max(0, Math.min(safePage - 3, pageCount - 7));
    const end = Math.min(pageCount, start + 7);
    const pageButtons = Array.from({ length: end - start }, (_, i) => start + i);

    return { rows, rankedRows, pageCount, safePage, visibleRows, pageButtons };
  });

  const youId = $derived(store.you?.id);

  function defaultSort(next: RankingView): SortKey {
    if (next === "race") return "racePoints";
    if (next === "ratings") return "rating";
    return "points";
  }

  function selectView(next: RankingView) {
    view = next;
    sortKey = defaultSort(next);
    sortDir = "desc";
    page = 0;
  }

  function setPage(next: number) {
    page = Math.max(0, Math.min(next, rankingModel.pageCount - 1));
  }

  function sortBy(key: SortKey) {
    if (sortKey === key) {
      sortDir = sortDir === "desc" ? "asc" : "desc";
    } else {
      sortKey = key;
      sortDir = "desc";
    }
    page = 0;
  }

  function arrowFor(key: SortKey): string {
    if (sortKey !== key) return "";
    return sortDir === "desc" ? "▼" : "▲";
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
    <button class:on={view === "race"} onclick={() => selectView("race")}>Race</button>
    <button class:on={view === "ratings"} onclick={() => selectView("ratings")}>Ratings</button>
  </div>

  {#if rankingModel.rows.length === 0}
    <p class="empty">No counted results yet in this ladder — play a tournament to appear here.</p>
  {:else}
    <div class="pager" aria-label="Ranking pages">
      <button disabled={rankingModel.safePage === 0} onclick={() => setPage(0)}>▌◀</button>
      <button disabled={rankingModel.safePage === 0} onclick={() => setPage(Math.max(0, rankingModel.safePage - 5))}>◀◀</button>
      <button disabled={rankingModel.safePage === 0} onclick={() => setPage(rankingModel.safePage - 1)}>◀</button>
      {#each rankingModel.pageButtons as p (p)}
        <button class:on={rankingModel.safePage === p} onclick={() => setPage(p)}>{p + 1}</button>
      {/each}
      <button disabled={rankingModel.safePage >= rankingModel.pageCount - 1} onclick={() => setPage(rankingModel.safePage + 1)}>▶</button>
      <button disabled={rankingModel.safePage >= rankingModel.pageCount - 1} onclick={() => setPage(Math.min(rankingModel.pageCount - 1, rankingModel.safePage + 5))}>▶▶</button>
      <button disabled={rankingModel.safePage >= rankingModel.pageCount - 1} onclick={() => setPage(rankingModel.pageCount - 1)}>▶▌</button>
    </div>

    <div class="range-note">
      Showing {rankingModel.safePage * PAGE_SIZE + 1}–{Math.min((rankingModel.safePage + 1) * PAGE_SIZE, rankingModel.rankedRows.length)} of {rankingModel.rankedRows.length}
    </div>

    <div class="table" class:wide={view === "ratings"}>
      <div class="row head-row">
        <span class="c-rank">#</span>
        <span class="c-name">Player</span>
        {#if view === "fir"}
          <button class="c-num primary sortable" onclick={() => sortBy("points")}>FIR {arrowFor("points")}</button>
          <button class="c-num sortable" onclick={() => sortBy("rating")}>Glicko {arrowFor("rating")}</button>
        {:else if view === "race"}
          <button class="c-num primary sortable" onclick={() => sortBy("racePoints")}>Race {arrowFor("racePoints")}</button>
          <button class="c-num sortable" onclick={() => sortBy("rating")}>Glicko {arrowFor("rating")}</button>
        {:else}
          {#each RATING_COLUMNS as col (col.key)}
            <button class="c-num rating-col sortable" class:primary={sortKey === col.key} onclick={() => sortBy(col.key)}>{col.label} {arrowFor(col.key)}</button>
          {/each}
        {/if}
      </div>
      {#each rankingModel.visibleRows as row, index (row.playerId)}
        <button class="row" class:you={row.playerId === youId} onclick={() => store.viewOpponent(row.playerId)}>
          <span class="c-rank">{rankingModel.safePage * PAGE_SIZE + index + 1}</span>
          <span class="c-name">{flagEmoji(row.nationality)} {row.name}</span>
          {#if view === "fir"}
            <span class="c-num primary">{row.points}</span>
            <span class="c-num">{row.rating}</span>
          {:else if view === "race"}
            <span class="c-num primary">{row.racePoints}</span>
            <span class="c-num">{row.rating}</span>
          {:else}
            <span class="c-num rating-col" class:primary={sortKey === "rating"}>{row.rating}</span>
            <span class="c-num rating-col" class:primary={sortKey === "tt"}>{row.sportRatings.tt}</span>
            <span class="c-num rating-col" class:primary={sortKey === "bd"}>{row.sportRatings.bd}</span>
            <span class="c-num rating-col" class:primary={sortKey === "sq"}>{row.sportRatings.sq}</span>
            <span class="c-num rating-col" class:primary={sortKey === "tn"}>{row.sportRatings.tn}</span>
          {/if}
        </button>
      {/each}
    </div>
    <p class="foot-note">
      FIR is the official points ladder. Race is this season's annual points. Ratings are Glicko strength estimates and can be sorted by total or sport.
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

  .table.wide {
    overflow-x: auto;
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

  .table.wide .row {
    min-width: 560px;
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

  .rating-col {
    width: 52px;
  }

  .c-num.primary {
    color: var(--text);
    font-weight: 700;
  }

  .row.you .c-num {
    color: var(--accent);
  }

  .sortable {
    font-size: inherit;
    font-weight: inherit;
    text-transform: inherit;
    letter-spacing: inherit;
  }

  .foot-note {
    margin-top: 10px;
    font-size: 11.5px;
    color: var(--muted);
  }
</style>
