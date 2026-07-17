<script lang="ts">
  import { SPORTS, SPORT_LABELS } from "@racketlon/engine";
  import { ATTR_META, CHAR_ATTRS, NATIONALITIES } from "./character";
  import { store } from "./store.svelte";
  import TabBar from "./TabBar.svelte";
  import {
    SPORT_COLORS,
    SPORT_SHORT,
    finishLabel,
    flagEmoji,
    formatMoney,
    formColor,
    formWord,
    tournamentLabel,
  } from "./ui";

  type StatView = "lifetime" | "byYear";

  let statView = $state<StatView>("lifetime");
  let matchYear = $state<number | null>(null);

  const you = $derived(store.you);
  const stats = $derived(store.careerStats);
  const trophies = $derived(store.trophyCabinet);
  const records = $derived(store.records);
  const hasSportRecords = $derived(
    records ? SPORTS.some((s) => records.biggestWinBySport[s] || records.biggestLossBySport[s]) : false,
  );
  const hasBestOpponents = $derived(records ? SPORTS.some((s) => records.bestOpponentBySport[s]) : false);
  const mostPlayed = $derived(store.mostPlayedOpponents());

  // union store.year in (not just years with results) so the current year is
  // always selectable even before any tournament has been played in it yet
  const availableMatchYears = $derived(
    stats ? [...new Set([store.year, ...stats.byYear.map((y) => y.year)])].sort((a, b) => b - a) : [],
  );
  const effectiveMatchYear = $derived(matchYear ?? store.year);
  const yearMatches = $derived(store.matchesForYear(effectiveMatchYear));

  const MEDAL_EMOJI: Record<1 | 2 | 3, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

  const initials = $derived(
    (you?.name ?? "")
      .split(" ")
      .map((w) => w[0] ?? "")
      .slice(0, 2)
      .join("")
      .toUpperCase(),
  );
  const countryName = $derived(you ? (NATIONALITIES[you.nationality]?.name ?? you.nationality) : "");

  const TITLE_LABELS: Record<string, string> = { champion: "🏆 First title" };
</script>

{#if you && stats}
  <main>
    <!-- Hero -->
    <section class="hero">
      <div class="avatar" class:female={you.gender === "f"}>
        <span class="initials">{initials}</span>
        <span class="flag">{flagEmoji(you.nationality)}</span>
      </div>
      <div class="who">
        <h1>{you.name}</h1>
        <div class="meta">{you.age} years · {countryName}</div>
        {#if you.titles.length > 0}
          <div class="titles">
            {#each you.titles as t (t)}
              <span class="title-pill">{TITLE_LABELS[t] ?? t}</span>
            {/each}
          </div>
        {/if}
      </div>
    </section>

    <!-- Headline ratings: real FIR standing leads, Glicko is the secondary estimate -->
    <section class="rating-strip">
      <div class="rating-big">
        <div class="rating-num">{you.firStanding ? you.firStanding.points : "—"}</div>
        <div class="rating-cap">FIR points</div>
        <div class="rating-sub">
          {#if you.firStanding}
            Rank #{you.firStanding.rank}
          {:else}
            Unranked — play a FIR tournament
          {/if}
        </div>
      </div>
      <div class="rating-side">
        <div class="side-num">{you.combinedRating}</div>
        <div class="side-cap">Glicko</div>
        <div class="side-sub">best {you.bestRating}</div>
      </div>
      <div class="rating-side">
        <div class="side-num money" class:negative={you.money < 0}>{formatMoney(you.money)}</div>
        <div class="side-cap">Balance</div>
      </div>
    </section>

    <nav class="section-tabs" aria-label="Me sections">
      <button class:on={store.meSection === "characteristics"} onclick={() => (store.meSection = "characteristics")}>Characteristics</button>
      <button class:on={store.meSection === "history"} onclick={() => (store.meSection = "history")}>History</button>
      <button class:on={store.meSection === "records"} onclick={() => (store.meSection = "records")}>Records</button>
      <button class:on={store.meSection === "trophies"} onclick={() => (store.meSection = "trophies")}>Prize cabinet</button>
    </nav>

    {#if store.meSection === "characteristics"}

    <!-- Sports: levels + Glicko -->
    <section class="card">
      <h2>Sports</h2>
      {#each SPORTS as sport (sport)}
        {@const s = you.sports[sport]}
        {@const r = you.ratings[sport]}
        {@const form = you.formBySport[sport]}
        <div class="sport">
          <span class="tag" style:background={SPORT_COLORS[sport]}>{SPORT_SHORT[sport]}</span>
          <div class="sport-main">
            <div class="sport-line">
              <span class="sport-name">{SPORT_LABELS[sport]}</span>
              <span class="sport-level">Lv {s.level}</span>
            </div>
            <div class="bar">
              <div class="fill" style:width="{s.progress * 100}%" style:background={SPORT_COLORS[sport]}></div>
            </div>
            <div class="form-line">
              <span class="form-word" style:color={formColor(form)}>{formWord(form)}</span>
              <span class="form-num">{form}/20</span>
            </div>
            <div class="bar form-bar">
              <div class="fill" style:width="{(form / 20) * 100}%" style:background={formColor(form)}></div>
            </div>
          </div>
          <div class="sport-rating">
            <span class="sr-num">{r.rating}</span>
            <span class="sr-rd">±{r.rd}</span>
          </div>
        </div>
      {/each}
    </section>

    <!-- Attributes -->
    <section class="card">
      <h2>Attributes</h2>
      {#each CHAR_ATTRS as attr (attr)}
        {@const meta = ATTR_META[attr]}
        {@const value = you.attrs[attr]}
        <div class="attr">
          <div class="attr-main">
            <div class="attr-line">
              <span class="attr-name">{meta.label}</span>
              <span class="attr-level">{value}</span>
            </div>
            <div class="bar">
              <div class="fill" style:width="{(value / 20) * 100}%" style:background={meta.color}></div>
            </div>
          </div>
        </div>
        <p class="attr-hint">{meta.hint}</p>
      {/each}
    </section>

    <!-- Traits -->
    {#if you.traits.length > 0}
      <section class="card">
        <h2>Traits</h2>
        <div class="traits">
          {#each you.traits as t (t.id)}
            <div class="trait trait-{t.tone}">
              <span class="trait-name">{t.name}</span>
              <span class="trait-desc">{t.description}</span>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    {:else if store.meSection === "history"}

    <!-- Career stats -->
    <section class="card">
      <div class="stats-head">
        <h2>Career</h2>
        {#if stats.byYear.length > 0}
          <div class="seg">
            <button class:on={statView === "lifetime"} onclick={() => (statView = "lifetime")}>Lifetime</button>
            <button class:on={statView === "byYear"} onclick={() => (statView = "byYear")}>By year</button>
          </div>
        {/if}
      </div>

      {#if stats.lifetime.tournamentsPlayed === 0}
        <p class="empty">No tournaments played yet — register for one on the Tour tab.</p>
      {:else if statView === "lifetime"}
        <div class="stat-grid">
          <div class="stat"><span class="sv">{stats.lifetime.tournamentsPlayed}</span><span class="sc">Played</span></div>
          <div class="stat"><span class="sv">{stats.lifetime.tournamentsWon}</span><span class="sc">Won</span></div>
          <div class="stat"><span class="sv">{stats.lifetime.finalsReached}</span><span class="sc">Finals</span></div>
          <div class="stat">
            <span class="sv">{stats.bestFinish ? finishLabel(stats.bestFinish.finishingPosition, stats.bestFinish.tiedCount) : "—"}</span>
            <span class="sc">Best finish</span>
          </div>
          <div class="stat"><span class="sv small">{formatMoney(stats.lifetime.prizeMoney)}</span><span class="sc">Prize money</span></div>
          <div class="stat"><span class="sv">{stats.weeksPlayed}</span><span class="sc">Weeks</span></div>
          {#if records && records.gummiarms.played > 0}
            <div class="stat"><span class="sv">{records.gummiarms.won}/{records.gummiarms.played}</span><span class="sc">Gummiarms won</span></div>
          {/if}
        </div>
      {:else}
        <div class="year-table">
          <div class="yt-head">
            <span>Year</span><span>P</span><span>W</span><span>Finals</span><span class="right">Prize</span>
          </div>
          {#each stats.byYear as y (y.year)}
            <div class="yt-row">
              <span class="yt-year">{y.year}</span>
              <span>{y.tournamentsPlayed}</span>
              <span>{y.tournamentsWon}</span>
              <span>{y.finalsReached}</span>
              <span class="right">{formatMoney(y.prizeMoney)}</span>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Records -->
    {:else if store.meSection === "records" && records}

    <section class="card">
      <h2>Biggest results</h2>
      {#if records.biggestWin || records.biggestLoss}
        <div class="records-grid">
          {#if records.biggestWin}
            {@const bw = records.biggestWin}
            <button class="record-tile win" onclick={() => store.viewOpponent(bw.opponentId)}>
              <span class="record-label">Biggest win</span>
              <span class="record-score">+{bw.margin}</span>
              <span class="record-opponent">vs {bw.opponentName}</span>
              <span class="record-meta">{tournamentLabel(bw.tournamentTier, bw.tournamentName, bw.year)}</span>
            </button>
          {/if}
          {#if records.biggestLoss}
            {@const bl = records.biggestLoss}
            <button class="record-tile loss" onclick={() => store.viewOpponent(bl.opponentId)}>
              <span class="record-label">Biggest loss</span>
              <span class="record-score">−{bl.margin}</span>
              <span class="record-opponent">vs {bl.opponentName}</span>
              <span class="record-meta">{tournamentLabel(bl.tournamentTier, bl.tournamentName, bl.year)}</span>
            </button>
          {/if}
        </div>
      {:else}
        <p class="empty">No matches played yet.</p>
      {/if}
    </section>

    <section class="card">
      <h2>Sport records</h2>
      {#if hasSportRecords}
        {#each SPORTS as sport (sport)}
          {@const win = records.biggestWinBySport[sport]}
          {@const loss = records.biggestLossBySport[sport]}
          {#if win || loss}
            <div class="sport-record">
              <span class="tag" style:background={SPORT_COLORS[sport]}>{SPORT_SHORT[sport]}</span>
              <div class="rec-main">
                {#if win}
                  <button class="rec-line win" onclick={() => store.viewOpponent(win.opponentId)}>
                    <span>W {win.a}-{win.b} vs {win.opponentName}</span>
                    <span class="rec-meta">{tournamentLabel(win.tournamentTier, win.tournamentName, win.year)}</span>
                  </button>
                {/if}
                {#if loss}
                  <button class="rec-line loss" onclick={() => store.viewOpponent(loss.opponentId)}>
                    <span>L {loss.a}-{loss.b} vs {loss.opponentName}</span>
                    <span class="rec-meta">{tournamentLabel(loss.tournamentTier, loss.tournamentName, loss.year)}</span>
                  </button>
                {/if}
              </div>
            </div>
          {/if}
        {/each}
      {:else}
        <p class="empty">No matches played yet.</p>
      {/if}
    </section>

    <section class="card">
      <h2>Toughest opponents faced</h2>
      {#if hasBestOpponents}
        {#each SPORTS as sport (sport)}
          {@const best = records.bestOpponentBySport[sport]}
          {#if best}
            <div class="sport-record">
              <span class="tag" style:background={SPORT_COLORS[sport]}>{SPORT_SHORT[sport]}</span>
              <div class="rec-main">
                <button class="rec-line" class:win={best.won} class:loss={!best.won} onclick={() => store.viewOpponent(best.opponentId)}>
                  <span>{best.won ? "W" : "L"} {best.a}-{best.b} vs {best.opponentName}</span>
                  <span class="rec-rating">{best.rating}</span>
                </button>
                <span class="rec-meta">{tournamentLabel(best.tournamentTier, best.tournamentName, best.year)}</span>
              </div>
            </div>
          {/if}
        {/each}
      {:else}
        <p class="empty">No matches played yet.</p>
      {/if}
    </section>

    <section class="card">
      <h2>Highest ranked win</h2>
      {#if records.highestRankedWin}
        {@const hr = records.highestRankedWin}
        <div class="match">
          <div class="m-main">
            <button class="m-opponent" onclick={() => store.viewOpponent(hr.opponentId)}>{hr.opponentName}</button>
            <span class="m-meta">{tournamentLabel(hr.tournamentTier, hr.tournamentName, hr.year)}</span>
          </div>
          <div class="m-right">
            <span class="m-result win">#{hr.rank} · {hr.totalA}–{hr.totalB}</span>
            <div class="m-sets">
              {#each hr.sets as s (s.sport)}
                <span class="m-set" style="color: {SPORT_COLORS[s.sport]}">{SPORT_SHORT[s.sport]} {s.a}-{s.b}</span>
              {/each}
            </div>
          </div>
        </div>
      {:else}
        <p class="empty">No ranked opponent beaten yet.</p>
      {/if}
    </section>

    <!-- Trophy cabinet -->
    {:else if store.meSection === "trophies"}
    {#if trophies.length > 0}
      <section class="card">
        <h2>Trophy cabinet</h2>
        <div class="trophies">
          {#each trophies as t (t.week + t.name)}
            <div class="trophy">
              <span class="trophy-medal">{MEDAL_EMOJI[t.medal]}</span>
              <div class="trophy-main">
                <span class="trophy-name">{t.name}</span>
                <span class="trophy-meta">Division {t.division} · {t.weekLabel}</span>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {:else}
      <section class="card"><p class="empty">No trophies yet — podium finishes will appear here.</p></section>
    {/if}

    {/if}

    <!-- Results -->
    {#if store.meSection === "history" && stats.results.length > 0}
      <section class="card">
        <h2>Results</h2>
        <div class="results">
          {#each stats.results as r (r.week + r.name)}
            <button class="result" class:win={r.won} onclick={() => store.viewTournamentDetail(r.week)}>
              <div class="r-main">
                <span class="r-name">{r.name}</span>
                <span class="r-week">{r.weekLabel}</span>
              </div>
              <div class="r-right">
                <span class="r-finish" class:win={r.won}>{finishLabel(r.finishingPosition, r.tiedCount)}</span>
                {#if r.prizeMoney > 0}<span class="r-prize">{formatMoney(r.prizeMoney)}</span>{/if}
              </div>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Recent matches -->
    {#if store.meSection === "history"}
      <section class="card">
        <div class="stats-head">
          <h2>Recent matches</h2>
          {#if availableMatchYears.length > 1}
            <div class="year-seg">
              {#each availableMatchYears as y (y)}
                <button class:on={effectiveMatchYear === y} onclick={() => (matchYear = y)}>{y}</button>
              {/each}
            </div>
          {/if}
        </div>
        {#if yearMatches.length > 0}
          <div class="matches">
            {#each yearMatches as m (m.week + m.opponentId + m.round)}
              <div class="match">
                <div class="m-main">
                  <button class="m-opponent" onclick={() => store.viewOpponent(m.opponentId)}>{m.opponentName}</button>
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
          <p class="empty">No matches played in {effectiveMatchYear}.</p>
        {/if}
      </section>
    {/if}

    <!-- Most played opponents -->
    {#if store.meSection === "history" && mostPlayed.length > 0}
      <section class="card">
        <h2>Most played opponents</h2>
        <div class="matches">
          {#each mostPlayed as o (o.opponentId)}
            <div class="match">
              <button class="m-opponent" onclick={() => store.viewOpponent(o.opponentId)}>{o.opponentName}</button>
              <span class="m-result">{o.wins}-{o.matches - o.wins} ({o.matches})</span>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  </main>
{/if}

<TabBar />

<style>
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

  /* Hero */
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

  .titles {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }

  .title-pill {
    font-size: 11px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--warn) 18%, var(--card));
    color: var(--warn);
  }

  /* Rating strip */
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

  .rating-cap,
  .side-cap {
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

  .side-sub {
    font-size: 10.5px;
    color: var(--muted);
    margin-top: 1px;
  }

  .rating-side {
    display: flex;
    flex-direction: column;
    justify-content: center;
    text-align: right;
    padding-left: 10px;
    border-left: 1px solid var(--border);
    min-width: 82px;
  }

  .side-num {
    font-size: 16px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .side-num.money.negative {
    color: var(--danger);
  }

  .section-tabs {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }

  .section-tabs button {
    min-height: 44px;
    padding: 8px 4px;
    border-radius: 12px;
    background: var(--card);
    border: 1px solid var(--border);
    color: var(--muted);
    font-size: 11px;
    font-weight: 800;
  }

  .section-tabs button.on {
    border-color: var(--accent);
    color: var(--accent);
  }

  /* Cards */
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 14px;
  }

  /* Sports */
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
    height: 4px;
    border-radius: 2px;
    background: var(--card-2);
    overflow: hidden;
  }

  .fill {
    height: 100%;
    border-radius: 2px;
  }

  .form-line {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    margin-top: 2px;
  }

  .form-word {
    font-weight: 600;
  }

  .form-num {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .form-bar {
    height: 3px;
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

  /* Attributes */
  .attr {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 0 2px;
  }

  .attr-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .attr-line {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
  }

  .attr-name {
    font-weight: 600;
  }

  .attr-level {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .attr-hint {
    font-size: 11.5px;
    color: var(--muted);
    margin: 0 0 8px;
  }

  /* Traits */
  .traits {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .trait {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid var(--border);
  }

  .trait-name {
    font-weight: 700;
    font-size: 13px;
  }

  .trait-desc {
    font-size: 12px;
    color: var(--muted);
    line-height: 1.35;
  }

  .trait-positive {
    background: color-mix(in srgb, var(--ok) 10%, var(--card));
    border-color: color-mix(in srgb, var(--ok) 35%, var(--border));
  }

  .trait-positive .trait-name {
    color: var(--ok);
  }

  .trait-negative {
    background: color-mix(in srgb, var(--danger) 10%, var(--card));
    border-color: color-mix(in srgb, var(--danger) 35%, var(--border));
  }

  .trait-negative .trait-name {
    color: var(--danger);
  }

  .stats-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .stats-head h2 {
    margin: 0;
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

  /* Year selector for Recent matches — like .seg, but horizontally
   * scrollable since a career can span many years, not just a fixed 2. */
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

  .stat-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px 8px;
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .sv {
    font-size: 19px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .sv.small {
    font-size: 14px;
  }

  .sc {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--muted);
  }

  /* Year table */
  .year-table {
    font-size: 13px;
  }

  .yt-head,
  .yt-row {
    display: grid;
    grid-template-columns: 1.4fr 0.6fr 0.6fr 0.9fr 1.4fr;
    align-items: center;
    gap: 6px;
    padding: 7px 0;
  }

  .yt-head {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--muted);
    padding-bottom: 4px;
  }

  .yt-row + .yt-row,
  .yt-head + .yt-row {
    border-top: 1px solid var(--border);
  }

  .yt-year {
    font-weight: 700;
  }

  .right {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* Records */
  .records-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .record-tile {
    display: flex;
    flex-direction: column;
    gap: 3px;
    text-align: left;
    padding: 10px;
    border-radius: 10px;
    border: 1px solid var(--border);
    min-width: 0;
  }

  .record-tile.win {
    background: color-mix(in srgb, var(--ok) 10%, var(--card));
    border-color: color-mix(in srgb, var(--ok) 35%, var(--border));
  }

  .record-tile.loss {
    background: color-mix(in srgb, var(--danger) 10%, var(--card));
    border-color: color-mix(in srgb, var(--danger) 35%, var(--border));
  }

  .record-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--muted);
  }

  .record-score {
    font-size: 20px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .record-tile.win .record-score {
    color: var(--ok);
  }

  .record-tile.loss .record-score {
    color: var(--danger);
  }

  .record-opponent {
    font-size: 13px;
    font-weight: 600;
  }

  .record-meta {
    font-size: 11px;
    color: var(--muted);
  }

  .sport-record {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 8px 0;
  }

  .sport-record + .sport-record {
    border-top: 1px solid var(--border);
  }

  .rec-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .rec-line {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    text-align: left;
    font-size: 12.5px;
    font-weight: 600;
  }

  .rec-line.win {
    color: var(--ok);
  }

  .rec-line.loss {
    color: var(--danger);
  }

  .rec-meta {
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 400;
    color: var(--muted);
  }

  .rec-rating {
    font-variant-numeric: tabular-nums;
    color: var(--accent);
  }

  /* Trophy cabinet */
  .trophies {
    display: flex;
    flex-direction: column;
  }

  .trophy {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 0;
  }

  .trophy + .trophy {
    border-top: 1px solid var(--border);
  }

  .trophy-medal {
    font-size: 22px;
    line-height: 1;
    flex-shrink: 0;
  }

  .trophy-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .trophy-name {
    font-weight: 600;
    font-size: 13.5px;
  }

  .trophy-meta {
    font-size: 11.5px;
    color: var(--muted);
  }

  /* Results */
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
    color: var(--muted);
  }

  .r-finish.win {
    color: var(--ok);
  }

  .r-prize {
    font-size: 11.5px;
    color: var(--ok);
    font-variant-numeric: tabular-nums;
  }

  .empty {
    color: var(--muted);
    font-size: 13px;
    text-align: center;
    padding: 12px 0;
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
</style>
