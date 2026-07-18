<script lang="ts">
  import { SPORTS, SPORT_LABELS } from "@racketlon/engine";
  import { NATIONALITIES } from "./character";
  import { store } from "./store.svelte";
  import { SPORT_COLORS, SPORT_SHORT, finishLabel, flagEmoji } from "./ui";

  const p = $derived(store.opponentProfile);

  const initials = $derived(
    (p?.name ?? "")
      .split(" ")
      .map((w) => w[0] ?? "")
      .slice(0, 2)
      .join("")
      .toUpperCase(),
  );
  const countryName = $derived(p ? (NATIONALITIES[p.nationality]?.name ?? p.nationality) : "");

  // Tournament history, year-scoped the same way as the Me screen's "Recent
  // matches" — most recent year with data by default, selectable if there's
  // more than one.
  let resultYear = $state<number | null>(null);
  const availableResultYears = $derived(p ? [...new Set(p.recentResults.map((r) => r.year))].sort((a, b) => b - a) : []);
  const effectiveResultYear = $derived(resultYear ?? availableResultYears[0] ?? null);
  const yearResults = $derived(p ? p.recentResults.filter((r) => r.year === effectiveResultYear) : []);

  // Every match the human has personally played against this opponent —
  // meaningless (and unset) for the human's own profile.
  const headToHead = $derived(p && !p.isYou ? store.headToHead(p.id) : []);

  // Every match this player has been in at all — human or NPC opponents
  // alike — across every tournament bracket the human's own session has
  // ever touched. Year-scoped via a dropdown (not the segmented buttons
  // used elsewhere) since a well-traveled player's match log can run long.
  let matchYear = $state<number | null>(null);
  const allMatches = $derived(p && !p.isYou ? store.matchesForPlayer(p.id) : []);
  const availableMatchYears = $derived([...new Set(allMatches.map((m) => m.year))].sort((a, b) => b - a));
  const effectiveMatchYear = $derived(matchYear ?? availableMatchYears[0] ?? null);
  const yearMatches = $derived(allMatches.filter((m) => m.year === effectiveMatchYear));
  const humanId = $derived(store.you?.id ?? null);
</script>

<div class="opponent">
  <div class="top">
    <button class="close" onclick={() => store.closeOpponent()}>‹ Back</button>
    <span class="title">{p?.isYou ? "You" : "Player profile"}</span>
    <span class="spacer"></span>
  </div>

  {#if p}
    <main>
      <section class="hero">
        <div class="avatar" class:female={p.gender === "f"}>
          <span class="initials">{initials}</span>
          <span class="flag">{flagEmoji(p.nationality)}</span>
        </div>
        <div class="who">
          <h1>{p.name}</h1>
          <div class="meta">{p.age} years · {countryName}</div>
        </div>
      </section>

      <section class="rating-strip">
        <div class="rating-big">
          <div class="rating-num">{p.firStanding ? p.firStanding.points : "—"}</div>
          <div class="rating-cap">FIR points</div>
          <div class="rating-sub">
            {#if p.firStanding}
              Rank #{p.firStanding.rank}
            {:else}
              Unranked
            {/if}
          </div>
        </div>
        <div class="rating-side">
          <div class="side-num">{p.combinedRating}</div>
          <div class="side-cap">Glicko rating</div>
        </div>
      </section>

      <section class="card">
        <h2>Sports</h2>
        {#each SPORTS as sport (sport)}
          {@const s = p.sports[sport]}
          {@const r = p.ratings[sport]}
          <div class="sport">
            <span class="tag" style:background={SPORT_COLORS[sport]}>{SPORT_SHORT[sport]}</span>
            <div class="sport-main">
              <div class="sport-line">
                <span class="sport-name">{SPORT_LABELS[sport]}</span>
                <span class="sport-level">{p.isYou ? `Lv ${s.level}` : `Lv ${s.levelMin}–${s.levelMax}`}</span>
              </div>
              <div class="bar">
                {#if p.isYou}
                  <div class="fill" style:width="{(s.progress ?? 0) * 100}%" style:background={SPORT_COLORS[sport]}></div>
                {:else}
                  <div
                    class="band"
                    style:left="{((s.levelMin - 1) / 20) * 100}%"
                    style:width="{((s.levelMax - s.levelMin + 1) / 20) * 100}%"
                    style:background={SPORT_COLORS[sport]}
                  ></div>
                {/if}
              </div>
            </div>
            <div class="sport-rating">
              <span class="sr-num">{r.rating}</span>
              <span class="sr-rd">±{r.rd}</span>
            </div>
          </div>
        {/each}
      </section>

      {#if !p.isYou}
        <section class="card">
          <h2>Head-to-head</h2>
          {#if headToHead.length > 0}
            {@const wins = headToHead.filter((m) => m.won).length}
            <div class="h2h-tally">
              <span class="h2h-record">{wins}–{headToHead.length - wins}</span>
              <span class="h2h-caption">{headToHead.length} match{headToHead.length === 1 ? "" : "es"} played</span>
            </div>
            <div class="matches">
              {#each headToHead as m (m.week + m.round)}
                <div class="match">
                  <div class="m-main">
                    <span class="m-meta">{m.tournamentName} · {m.roundName} · {m.weekLabel}</span>
                  </div>
                  <div class="m-right">
                    <span class="m-result" class:win={m.won}>{m.won ? "W" : "L"} {m.totalA}–{m.totalB}</span>
                    <div class="m-sets">
                      {#each m.sets as s (s.sport)}
                        <span class="m-set" style="color: {SPORT_COLORS[s.sport]}">{SPORT_SHORT[s.sport]} {s.a}-{s.b}</span>
                      {/each}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="empty">You haven't played {p.name} yet.</p>
          {/if}
        </section>
      {/if}

      {#if !p.isYou}
        <section class="card">
          <div class="results-head">
            <h2>Match history</h2>
            {#if availableMatchYears.length > 1}
              <select
                class="year-select"
                value={effectiveMatchYear}
                onchange={(e) => (matchYear = Number(e.currentTarget.value))}
              >
                {#each availableMatchYears as y (y)}
                  <option value={y}>{y}</option>
                {/each}
              </select>
            {/if}
          </div>
          {#if allMatches.length > 0}
            <div class="matches">
              {#each yearMatches as m (m.week + m.opponentId + m.roundName)}
                <div class="match">
                  <div class="m-main">
                    {#if m.opponentId === humanId}
                      <button class="m-opponent" onclick={() => humanId && store.viewOpponent(humanId)}>You</button>
                    {:else}
                      <button class="m-opponent" onclick={() => store.viewOpponent(m.opponentId)}>{m.opponentName}</button>
                    {/if}
                    <span class="m-meta">{m.tournamentName} · {m.roundName} · {m.weekLabel}</span>
                  </div>
                  <div class="m-right">
                    <span class="m-result" class:win={m.won}>{m.won ? "W" : "L"} {m.totalA}–{m.totalB}</span>
                    <div class="m-sets">
                      {#each m.sets as s (s.sport)}
                        <span class="m-set" style="color: {SPORT_COLORS[s.sport]}">{SPORT_SHORT[s.sport]} {s.a}-{s.b}</span>
                      {/each}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="empty">No matches recorded yet — only tournaments the human has shared count here.</p>
          {/if}
        </section>
      {/if}

      <section class="card">
        <div class="results-head">
          <h2>Tournament history</h2>
          {#if availableResultYears.length > 1}
            <div class="year-seg">
              {#each availableResultYears as y (y)}
                <button class:on={effectiveResultYear === y} onclick={() => (resultYear = y)}>{y}</button>
              {/each}
            </div>
          {/if}
        </div>
        {#if p.recentResults.length > 0}
          <div class="results">
            {#each yearResults as r (r.week)}
              <button class="result" onclick={() => store.viewTournamentDetail(r.week)}>
                <div class="r-main">
                  <span class="r-name">{r.name}</span>
                  <span class="r-week">Division {r.division} · {r.weekLabel}</span>
                </div>
                <div class="r-right">
                  <span class="r-finish">{finishLabel(r.finishingPosition, r.tiedCount)}</span>
                  <span class="r-matches">{r.matchesPlayed} match{r.matchesPlayed === 1 ? "" : "es"}</span>
                </div>
              </button>
            {/each}
          </div>
        {:else}
          <p class="empty">No tournaments played yet this career.</p>
        {/if}
      </section>
    </main>
  {:else}
    <p class="empty">Player not found.</p>
  {/if}
</div>

<style>
  .opponent {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
  }

  .close {
    color: var(--accent);
    font-weight: 700;
    font-size: 14px;
  }

  .title {
    font-weight: 700;
    font-size: 14.5px;
    color: var(--muted);
  }

  .spacer {
    width: 44px;
  }

  main {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  h1 {
    font-size: 22px;
  }

  h2 {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
    margin-bottom: 10px;
  }

  .hero {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .avatar {
    position: relative;
    width: 68px;
    height: 68px;
    flex-shrink: 0;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: linear-gradient(135deg, var(--tn), var(--accent));
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
  }

  .avatar.female {
    background: linear-gradient(135deg, var(--social), var(--sq));
  }

  .initials {
    font-weight: 800;
    font-size: 24px;
    color: white;
    letter-spacing: 0.02em;
  }

  .flag {
    position: absolute;
    bottom: -2px;
    right: -2px;
    font-size: 18px;
    line-height: 1;
    background: var(--card);
    border-radius: 50%;
    padding: 2px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  }

  .meta {
    color: var(--muted);
    font-size: 13.5px;
    margin-top: 2px;
  }

  .rating-strip {
    display: flex;
    align-items: stretch;
    gap: 10px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 14px;
  }

  .rating-big {
    flex: 1;
  }

  .rating-num {
    font-size: 30px;
    font-weight: 800;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .rating-cap {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--muted);
    margin-top: 4px;
  }

  .rating-sub {
    font-size: 12px;
    color: var(--accent);
    font-weight: 600;
    margin-top: 2px;
  }

  .rating-side {
    display: flex;
    flex-direction: column;
    justify-content: center;
    text-align: right;
    padding-left: 10px;
    border-left: 1px solid var(--border);
    min-width: 92px;
  }

  .side-num {
    font-size: 16px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .side-cap {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--muted);
    margin-top: 4px;
  }

  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 14px;
  }

  .sport {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 0;
  }

  .sport + .sport {
    border-top: 1px solid var(--border);
  }

  .tag {
    color: #0b0e14;
    font-weight: 700;
    font-size: 10px;
    border-radius: 4px;
    padding: 2px 5px;
    flex-shrink: 0;
  }

  .sport-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .sport-line {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
  }

  .sport-name {
    font-weight: 600;
  }

  .sport-level {
    color: var(--muted);
  }

  .bar {
    position: relative;
    height: 4px;
    border-radius: 2px;
    background: var(--card-2);
    overflow: hidden;
  }

  /* a floating segment over the 1-20 track, not a from-the-left fill — this
     is a range, not a precise value, so there's no exact-position marker */
  .band {
    position: absolute;
    top: 0;
    height: 100%;
    border-radius: 2px;
    opacity: 0.85;
  }

  /* your own profile knows the exact value, so it's a normal from-the-left
     fill instead of `.band`'s floating range segment */
  .fill {
    height: 100%;
    border-radius: 2px;
  }

  .sport-rating {
    text-align: right;
    min-width: 54px;
    flex-shrink: 0;
  }

  .sr-num {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    display: block;
    font-size: 14px;
  }

  .sr-rd {
    font-size: 11px;
    color: var(--muted);
  }

  .results-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .results-head h2 {
    margin: 0;
  }

  /* Year selector for tournament history — horizontally scrollable since a
   * long-lived opponent can accumulate several seasons' worth. */
  .year-seg {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    background: var(--card-2);
    border-radius: 8px;
    padding: 2px;
  }

  .year-seg button {
    flex-shrink: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
    padding: 4px 10px;
    border-radius: 6px;
  }

  .year-seg button.on {
    background: var(--card);
    color: var(--text);
  }

  /* Dropdown year picker for match history — a plain <select> rather than
   * .year-seg's segmented buttons, since a well-traveled player's log can
   * span many more seasons than fit comfortably as a button row. */
  .year-select {
    background: var(--card-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 4px 8px;
    font-size: 12px;
    font-weight: 600;
    font-family: inherit;
  }

  .h2h-tally {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 6px;
  }

  .h2h-record {
    font-size: 20px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .h2h-caption {
    font-size: 12px;
    color: var(--muted);
  }

  .matches {
    display: flex;
    flex-direction: column;
  }

  .match {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 9px 0;
  }

  .match + .match {
    border-top: 1px solid var(--border);
  }

  .m-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .m-opponent {
    font-size: 13.5px;
    font-weight: 700;
    color: var(--accent);
    text-align: left;
  }

  .m-meta {
    font-size: 11.5px;
    color: var(--muted);
  }

  .m-right {
    text-align: right;
    flex-shrink: 0;
  }

  .m-result {
    display: block;
    font-size: 13px;
    font-weight: 700;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .m-result.win {
    color: var(--ok);
  }

  .m-sets {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    margin-top: 2px;
    flex-wrap: wrap;
  }

  .m-set {
    font-size: 10.5px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .results {
    display: flex;
    flex-direction: column;
  }

  .result {
    display: flex;
    width: 100%;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 9px 0;
    text-align: left;
  }

  .result + .result {
    border-top: 1px solid var(--border);
  }

  .r-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .r-name {
    font-weight: 600;
    font-size: 13.5px;
  }

  .r-week {
    font-size: 11.5px;
    color: var(--muted);
  }

  .r-right {
    text-align: right;
    flex-shrink: 0;
  }

  .r-finish {
    display: block;
    font-size: 13px;
    font-weight: 700;
  }

  .r-matches {
    font-size: 11.5px;
    color: var(--muted);
  }

  .empty {
    color: var(--muted);
    text-align: center;
    padding: 12px 0;
    font-size: 13px;
  }
</style>
