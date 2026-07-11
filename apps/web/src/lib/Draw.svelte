<script lang="ts">
  import type { DivisionCode } from "@racketlon/engine";
  import { store } from "./store.svelte";
  import { flagEmoji } from "./ui";

  let viewing = $state<DivisionCode | null>(null);

  const otherTournament = $derived(
    viewing ? store.otherDivisionDraws.find((d) => d.division === viewing) : null,
  );
  const rounds = $derived(otherTournament ? otherTournament.rounds : store.drawRounds);
</script>

<div class="draw">
  <div class="top">
    <button class="close" onclick={() => store.closeDraw()}>‹ Back</button>
    <span class="title">{otherTournament ? otherTournament.tournament.name : (store.tournamentContext?.name ?? "Draw")}</span>
    <span class="spacer"></span>
  </div>

  {#if store.otherDivisionDraws.length > 0}
    <div class="tabs">
      <button class="tab" class:active={viewing === null} onclick={() => (viewing = null)}>
        Your draw
      </button>
      {#each store.otherDivisionDraws as other (other.division)}
        <button class="tab" class:active={viewing === other.division} onclick={() => (viewing = other.division)}>
          Class {other.division}{other.concluded ? " ✓" : ""}
        </button>
      {/each}
    </div>
  {/if}

  <div class="rounds">
    {#each rounds as round (round.round)}
      <div class="round">
        <div class="round-label">Round {round.round + 1}</div>
        <div class="sections">
          {#each round.sections as section (section.roundName + section.positionFrom)}
            <div class="section" class:main={section.isMainDraw}>
              <div class="section-head">
                <span class="section-name">{section.roundName}</span>
                <span class="section-positions">#{section.positionFrom}–{section.positionTo}</span>
              </div>
              {#if section.isMainDraw}
                <p class="spectators">👀 Centre court — a crowd has gathered to watch</p>
              {:else}
                <p class="spectators plate">Back court — a plate match, low-key</p>
              {/if}
              <div class="matchups">
                {#each section.matchups as m (m.a.id + m.b.id)}
                  {@const pending = m.winnerId === null}
                  {@const highlight = m.isYouA || m.isYouB}
                  <div class="matchup" class:highlight class:pending>
                    <button class="player" class:winner={m.winnerId === m.a.id} class:you={m.isYouA} onclick={() => store.viewOpponent(m.a.id)}>
                      {flagEmoji(m.a.nationality)} {m.a.name}
                    </button>
                    <span class="vs">{pending ? "vs" : "–"}</span>
                    <button class="player" class:winner={m.winnerId === m.b.id} class:you={m.isYouB} onclick={() => store.viewOpponent(m.b.id)}>
                      {flagEmoji(m.b.nationality)} {m.b.name}
                    </button>
                    {#if pending && highlight}
                      <span class="live">● LIVE</span>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <p class="empty">No draw to show yet.</p>
    {/each}
  </div>
</div>

<style>
  .draw {
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
  }

  .spacer {
    width: 44px;
  }

  .tabs {
    display: flex;
    gap: 6px;
    padding: 10px 16px 0;
    overflow-x: auto;
  }

  .tab {
    flex-shrink: 0;
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--muted);
    font-size: 12px;
    font-weight: 700;
  }

  .tab.active {
    border-color: var(--accent);
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, var(--card));
  }

  .rounds {
    flex: 1;
    overflow-y: auto;
    padding: 14px 16px 24px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .round-label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    margin-bottom: 8px;
  }

  .sections {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .section {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 10px 12px;
    opacity: 0.75;
  }

  .section.main {
    opacity: 1;
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, var(--card));
  }

  .section-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 4px;
  }

  .section-name {
    font-weight: 800;
    font-size: 13.5px;
  }

  .section.main .section-name {
    color: var(--accent);
  }

  .section-positions {
    font-size: 11px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .spectators {
    margin: 0 0 8px;
    font-size: 11.5px;
    color: var(--muted);
    font-style: italic;
  }

  .spectators.plate {
    opacity: 0.7;
  }

  .matchups {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .matchup {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    padding: 4px 6px;
    border-radius: 8px;
  }

  .matchup.highlight {
    background: var(--card-2);
  }

  .matchup.pending.highlight {
    outline: 1px solid var(--accent);
  }

  .player {
    color: var(--muted);
  }

  .player.you {
    color: var(--text);
    font-weight: 700;
  }

  .player.winner {
    color: var(--ok);
    font-weight: 700;
  }

  .vs {
    color: var(--muted);
    font-size: 10.5px;
    text-align: center;
  }

  .live {
    grid-column: 1 / -1;
    text-align: center;
    color: var(--danger);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.05em;
  }

  .empty {
    color: var(--muted);
    text-align: center;
    padding: 32px 0;
  }
</style>
