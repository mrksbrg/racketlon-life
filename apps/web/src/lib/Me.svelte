<script lang="ts">
  import { SPORTS, SPORT_LABELS } from "@racketlon/engine";
  import { ATTR_META, CHAR_ATTRS, NATIONALITIES } from "./character";
  import { store } from "./store.svelte";
  import TabBar from "./TabBar.svelte";
  import {
    SPORT_COLORS,
    SPORT_SHORT,
    conditionWord,
    finishLabel,
    flagEmoji,
    formatInjury,
    formatMoney,
    formColor,
    formWord,
  } from "./ui";

  type StatView = "lifetime" | "byYear";
  let statView = $state<StatView>("lifetime");

  const you = $derived(store.you);
  const stats = $derived(store.careerStats);
  const trophies = $derived(store.trophyCabinet);

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
      <p class="footnote">
        Levels are your own progression; Glicko is the world's estimate of you (±&nbsp;uncertainty). Form is your
        tournament readiness — it rises when you train a sport and fades when you neglect it, so staying sharp in all
        four at once is hard.
      </p>
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

    <!-- Condition -->
    <section class="card">
      <h2>Condition</h2>
      <div class="cond-grid">
        <div class="cond">
          <div class="cond-cap">Fatigue</div>
          <div class="cond-val">{you.fatigue}<span class="unit">/100</span></div>
        </div>
        <div class="cond">
          <div class="cond-cap">Confidence</div>
          <div class="cond-val">{conditionWord(you.confidence)}</div>
        </div>
      </div>
      {#if you.injury}
        <div class="injury">{formatInjury(you.injury)}</div>
      {/if}
    </section>

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

    <!-- Trophy cabinet -->
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
    {/if}

    <!-- Results -->
    {#if stats.results.length > 0}
      <section class="card">
        <h2>Results</h2>
        <div class="results">
          {#each stats.results as r (r.week + r.name)}
            <div class="result" class:win={r.won}>
              <div class="r-main">
                <span class="r-name">{r.name}</span>
                <span class="r-week">{r.weekLabel}</span>
              </div>
              <div class="r-right">
                <span class="r-finish" class:win={r.won}>{finishLabel(r.finishingPosition, r.tiedCount)}</span>
                {#if r.prizeMoney > 0}<span class="r-prize">{formatMoney(r.prizeMoney)}</span>{/if}
              </div>
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

  .footnote {
    font-size: 11.5px;
    color: var(--muted);
    margin: 10px 0 0;
    line-height: 1.4;
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

  /* Condition */
  .cond-grid {
    display: flex;
    gap: 10px;
  }

  .cond {
    flex: 1;
  }

  .cond-cap {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--muted);
  }

  .cond-val {
    font-size: 17px;
    font-weight: 700;
    margin-top: 3px;
  }

  .cond-val .unit {
    font-size: 12px;
    font-weight: 500;
    color: var(--muted);
  }

  .injury {
    margin-top: 12px;
    padding: 6px 10px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--danger) 14%, var(--card));
    border: 1px solid var(--danger);
    color: var(--danger);
    font-size: 12px;
    font-weight: 700;
  }

  /* Career stats */
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
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 9px 0;
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
</style>
