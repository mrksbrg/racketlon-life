<script lang="ts">
  import StatusBar from "./StatusBar.svelte";
  import TabBar from "./TabBar.svelte";
  import { store } from "./store.svelte";
  import { flagEmoji, formatFieldStanding, formatMoney } from "./ui";

  /** The registered tournament's own schedule entry — carries the field
   * preview alongside the `TournamentDef` itself. */
  const entry = $derived(store.tourEntries.find((e) => e.isThisWeek) ?? null);

  /** An injured/ill human can't take the court at all (see facade.ts's
   * `enterTournament`) — surfaced here so "Play ▸" doesn't silently no-op. */
  const injured = $derived(store.you?.injury ?? null);
</script>

<StatusBar />

{#if entry}
  {@const t = entry.tournament}
  <main>
    <div class="hero">
      <span class="tier">{t.tier}</span>
      <h1>🏆 {t.name}</h1>
      <div class="place">{flagEmoji(t.country)} {t.city} · {entry.weekLabel}</div>
    </div>

    <div class="card">
      <div class="row"><span>Entry fee</span><span>{formatMoney(t.entryFee)}</span></div>
      <div class="row"><span>Field size</span><span>{t.fieldSize} players</span></div>
      <div class="row">
        <span>Winner's prize</span>
        <span>{formatMoney(t.prizeByRoundsWon[t.prizeByRoundsWon.length - 1] ?? 0)}</span>
      </div>
      {#if entry.travelCost.total > 0}
        <div class="row"><span>Flights</span><span>{formatMoney(entry.travelCost.flight)}</span></div>
        <div class="row"><span>Hotel & food ({t.nights}n)</span><span>{formatMoney(entry.travelCost.stay)}</span></div>
        <div class="row total">
          <span>Total to play</span>
          <span>{formatMoney(t.entryFee + entry.travelCost.total)}</span>
        </div>
      {:else}
        <div class="row"><span>Travel</span><span class="domestic">Domestic — no travel cost</span></div>
      {/if}
    </div>

    <div class="card">
      <div class="field-label">Field ({entry.entrants.length + 1} entered)</div>
      <div class="field-you">You</div>
      {#each entry.entrants as opp (opp.id)}
        <button class="field-row" onclick={() => store.viewOpponent(opp.id)}>
          <span>{opp.name}</span>
          <span class="field-rating">{formatFieldStanding(opp)}</span>
        </button>
      {/each}
    </div>

    {#if injured}
      <p class="note injured">🤕 {injured.label} — you can't compete this week. Withdraw, or wait it out.</p>
    {:else}
      <p class="note">This week is the tournament — no training slots to plan. Play it out, and normal
        planning resumes next week.</p>
    {/if}
  </main>

  <footer>
    <button class="withdraw" onclick={() => void store.withdrawRegistration(store.weekIndex)}>Withdraw</button>
    {#if !injured}
      <button class="play" onclick={() => store.enterTournament()}>Play ▸</button>
    {/if}
  </footer>
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

  .hero {
    text-align: center;
    padding: 8px 0 4px;
  }

  .tier {
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.03em;
    padding: 2px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 18%, var(--card));
    color: var(--accent);
    margin-bottom: 8px;
  }

  h1 {
    font-size: 21px;
  }

  .place {
    color: var(--muted);
    font-size: 13px;
    margin-top: 4px;
  }

  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 14px;
  }

  .row {
    display: flex;
    justify-content: space-between;
    font-size: 13.5px;
    padding: 4px 0;
  }

  .row span:last-child {
    font-weight: 700;
  }

  .row.total {
    margin-top: 2px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }

  .row.total span:last-child {
    color: var(--accent);
    font-weight: 800;
  }

  .row .domestic {
    color: var(--ok);
    font-weight: 600;
  }

  .field-label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--muted);
    margin-bottom: 8px;
  }

  .field-you,
  .field-row {
    display: flex;
    justify-content: space-between;
    font-size: 13.5px;
    padding: 4px 0;
  }

  .field-row {
    width: 100%;
    text-align: left;
  }

  .field-you {
    color: var(--accent);
    font-weight: 700;
  }

  .field-rating {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .note {
    color: var(--muted);
    font-size: 12.5px;
    text-align: center;
    line-height: 1.4;
    padding: 4px 8px;
  }

  footer {
    display: flex;
    gap: 10px;
    padding: 10px 16px calc(12px + env(safe-area-inset-bottom));
    background: var(--card);
    border-top: 1px solid var(--border);
  }

  .withdraw {
    flex: 0 0 auto;
    background: transparent;
    color: var(--muted);
    font-size: 14px;
    font-weight: 600;
    padding: 0 16px;
    height: 48px;
  }

  .play {
    flex: 1;
    background: var(--accent);
    color: white;
    font-weight: 700;
    font-size: 16px;
    border-radius: 12px;
    height: 48px;
  }
</style>
