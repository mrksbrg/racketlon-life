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

      <section class="card">
        <h2>Recent tournaments</h2>
        {#if p.recentResults.length > 0}
          <div class="results">
            {#each p.recentResults as r (r.weekLabel + r.name)}
              <div class="result">
                <div class="r-main">
                  <span class="r-name">{r.name}</span>
                  <span class="r-week">Division {r.division} · {r.weekLabel}</span>
                </div>
                <div class="r-right">
                  <span class="r-finish">{finishLabel(r.finishingPosition, r.tiedCount)}</span>
                  <span class="r-matches">{r.matchesPlayed} match{r.matchesPlayed === 1 ? "" : "es"}</span>
                </div>
              </div>
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
