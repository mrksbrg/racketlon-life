<script lang="ts">
  import type { RankingsRatingSport, RankingsSortKey, RankingsView } from "./store.svelte";
  import StatusBar from "./StatusBar.svelte";
  import TabBar from "./TabBar.svelte";
  import { store } from "./store.svelte";
  import { flagEmoji } from "./ui";

  const PAGE_SIZE = 50;

  const RATING_SPORTS: { key: RankingsRatingSport; label: string }[] = [
    { key: "tt", label: "TT" },
    { key: "bd", label: "BA" },
    { key: "sq", label: "SQ" },
    { key: "tn", label: "TE" },
  ];

  const rankingModel = $derived.by(() => {
    const rows = store.rankings;
    const dir = store.rankingsSortDir === "desc" ? -1 : 1;
    const rankedRows = [...rows].sort((a, b) => {
      return dir * (sortValue(a) - sortValue(b)) || a.rank - b.rank;
    });
    const pageCount = Math.max(1, Math.ceil(rankedRows.length / PAGE_SIZE));
    const safePage = Math.min(store.rankingsPage, pageCount - 1);
    const visibleRows = rankedRows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
    const start = Math.max(0, Math.min(safePage - 2, pageCount - 5));
    const end = Math.min(pageCount, start + 5);
    const pageButtons = Array.from({ length: end - start }, (_, i) => start + i);

    return { rows, rankedRows, pageCount, safePage, visibleRows, pageButtons };
  });

  const youId = $derived(store.you?.id);

  function sortValue(row: (typeof store.rankings)[number]): number {
    if (store.rankingsView === "ratings" && store.rankingsSortKey === "rating") {
      return row.sportRatings[store.rankingsRatingSport];
    }
    if (store.rankingsSortKey === "points") return row.points;
    if (store.rankingsSortKey === "racePoints") return row.racePoints;
    return row.rating;
  }

  function defaultSort(next: RankingsView): RankingsSortKey {
    if (next === "race") return "racePoints";
    if (next === "ratings") return "rating";
    return "points";
  }

  function selectView(next: RankingsView) {
    store.rankingsView = next;
    store.rankingsSortKey = defaultSort(next);
    store.rankingsSortDir = "desc";
    store.rankingsPage = 0;
  }

  function setPage(next: number) {
    store.rankingsPage = Math.max(0, Math.min(next, rankingModel.pageCount - 1));
  }

  function selectRatingSport(next: RankingsRatingSport) {
    store.rankingsRatingSport = next;
    store.rankingsSortKey = "rating";
    store.rankingsSortDir = "desc";
    store.rankingsPage = 0;
  }

  function sortBy(key: RankingsSortKey) {
    if (store.rankingsSortKey === key) {
      store.rankingsSortDir = store.rankingsSortDir === "desc" ? "asc" : "desc";
    } else {
      store.rankingsSortKey = key;
      store.rankingsSortDir = "desc";
    }
    store.rankingsPage = 0;
  }

  function arrowFor(key: RankingsSortKey): string {
    if (store.rankingsSortKey !== key) return "";
    return store.rankingsSortDir === "desc" ? "▼" : "▲";
  }
</script>

<StatusBar />

<main>
  <div class="head">
    <h2>Rankings</h2>
    <div class="seg compact">
      <button class:on={store.rankingsGender === "m"} onclick={() => { store.setRankingsGender("m"); store.rankingsPage = 0; }}>Men</button>
      <button class:on={store.rankingsGender === "f"} onclick={() => { store.setRankingsGender("f"); store.rankingsPage = 0; }}>Women</button>
    </div>
  </div>

  <div class="seg views" aria-label="Ranking views">
    <button class:on={store.rankingsView === "fir"} onclick={() => selectView("fir")}>FIR Ranking</button>
    <button class:on={store.rankingsView === "race"} onclick={() => selectView("race")}>{store.year} Race</button>
    <button class:on={store.rankingsView === "ratings"} onclick={() => selectView("ratings")}>Ratings</button>
  </div>

  {#if store.rankingsView === "ratings"}
    <div class="seg rating-sports" aria-label="Rating sport">
      {#each RATING_SPORTS as sport (sport.key)}
        <button class:on={store.rankingsRatingSport === sport.key} onclick={() => selectRatingSport(sport.key)}>{sport.label}</button>
      {/each}
    </div>
  {/if}

  {#if rankingModel.rows.length === 0}
    <p class="empty">No counted results yet in this ladder — play a tournament to appear here.</p>
  {:else}
    <div class="pager" aria-label="Ranking pages">
      <button disabled={rankingModel.safePage === 0} onclick={() => setPage(0)}>▌◀</button>
      <button disabled={rankingModel.safePage === 0} onclick={() => setPage(rankingModel.safePage - 1)}>◀</button>
      {#each rankingModel.pageButtons as p (p)}
        <button class:on={rankingModel.safePage === p} onclick={() => setPage(p)}>{p + 1}</button>
      {/each}
      <button disabled={rankingModel.safePage >= rankingModel.pageCount - 1} onclick={() => setPage(rankingModel.safePage + 1)}>▶</button>
      <button disabled={rankingModel.safePage >= rankingModel.pageCount - 1} onclick={() => setPage(rankingModel.pageCount - 1)}>▶▌</button>
    </div>

    <div class="range-note">
      Showing {rankingModel.safePage * PAGE_SIZE + 1}–{Math.min((rankingModel.safePage + 1) * PAGE_SIZE, rankingModel.rankedRows.length)} of {rankingModel.rankedRows.length}
    </div>

    <div class="table">
      <div class="row head-row">
        <span class="c-rank">#</span>
        <span class="c-name">Player</span>
        <span class="c-age">Age</span>
        {#if store.rankingsView === "fir"}
          <button class="c-num primary sortable" onclick={() => sortBy("points")}>FIR {arrowFor("points")}</button>
          <button class="c-num sortable" onclick={() => sortBy("rating")}>Rating {arrowFor("rating")}</button>
        {:else if store.rankingsView === "race"}
          <button class="c-num primary sortable" onclick={() => sortBy("racePoints")}>Race {arrowFor("racePoints")}</button>
          <button class="c-num sortable" onclick={() => sortBy("rating")}>Rating {arrowFor("rating")}</button>
        {:else}
          <button class="c-num primary sortable" onclick={() => sortBy("rating")}>Rating {arrowFor("rating")}</button>
        {/if}
      </div>
      {#each rankingModel.visibleRows as row, index (row.playerId)}
        <button class="row" class:you={row.playerId === youId} onclick={() => store.viewOpponent(row.playerId)}>
          <span class="c-rank">{rankingModel.safePage * PAGE_SIZE + index + 1}</span>
          <span class="c-name">{flagEmoji(row.nationality)} {row.name}</span>
          <span class="c-age">{row.age}</span>
          {#if store.rankingsView === "fir"}
            <span class="c-num primary">{row.points}</span>
            <span class="c-num">{row.rating}</span>
          {:else if store.rankingsView === "race"}
            <span class="c-num primary">{row.racePoints}</span>
            <span class="c-num">{row.rating}</span>
          {:else}
            <span class="c-num primary">{row.sportRatings[store.rankingsRatingSport]}</span>
          {/if}
        </button>
      {/each}
    </div>
    <p class="foot-note">
      FIR is the official points ladder. Race is this season's annual points. Ratings are per-sport Glicko strength estimates.
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

  .views,
  .rating-sports {
    margin-bottom: 12px;
  }

  .views button {
    flex: 1;
    padding: 8px 10px;
  }

  .rating-sports {
    justify-content: center;
    gap: 4px;
  }

  .rating-sports button {
    min-width: 46px;
    padding: 6px 10px;
    text-align: center;
  }

  .empty {
    color: var(--muted);
    font-size: 13.5px;
  }

  .pager {
    display: flex;
    justify-content: center;
    gap: 5px;
    margin-bottom: 8px;
  }

  .pager button {
    flex: 0 0 30px;
    height: 30px;
    border-radius: 4px;
    background: var(--card-2);
    color: var(--muted);
    font-size: 13px;
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

  .c-age {
    width: 26px;
    flex-shrink: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }

  .row.you .c-age {
    color: var(--accent);
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
