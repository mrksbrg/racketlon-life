<script lang="ts">
  import type { DivisionCode, DrawRound, OtherDivisionDraw } from "@racketlon/engine";
  import { store } from "./store.svelte";
  import { finishLabel, flagEmoji, seedBadge, setScoreLine } from "./ui";

  // Live (default, no props): everything comes straight off the store, same
  // as before this component took props at all — the in-progress-tournament
  // screen (App.svelte's `screen === "draw"`) renders `<Draw />` with none of
  // these set. Preview/completed: the caller (the `tournamentDetail` screen)
  // passes the draw data explicitly instead, since there's no live session to
  // read it from.
  let {
    rounds: roundsProp,
    otherDivisionDraws: otherProp,
    title: titleProp,
    mode = "live",
    onClose,
  }: {
    rounds?: DrawRound[];
    otherDivisionDraws?: OtherDivisionDraw[];
    title?: string;
    mode?: "live" | "preview" | "completed";
    onClose?: () => void;
  } = $props();

  let viewing = $state<DivisionCode | null>(null);
  let sheetEl = $state<HTMLElement | null>(null);

  const effectiveOtherDivisionDraws = $derived(mode === "live" ? store.otherDivisionDraws : (otherProp ?? []));
  const otherTournament = $derived(
    viewing ? effectiveOtherDivisionDraws.find((d) => d.division === viewing) : null,
  );
  const ownRounds = $derived(mode === "live" ? store.drawRounds : (roundsProp ?? []));
  const rounds = $derived(otherTournament ? otherTournament.rounds : ownRounds);
  // The round the human hasn't finished their own match of yet — its other
  // matches already have real results internally (AI-vs-AI resolves
  // instantly), but revealing them before the player's own result would
  // spoil "who else is through" as a reason to care about your own match.
  // Only the latest round of whichever draw is being viewed is ever "live"
  // this way, so its index doubles as "the round still worth hiding".
  const lastRoundNumber = $derived(rounds.length > 0 ? rounds[rounds.length - 1]!.round : -1);

  // Own draw only: the kickoff CTA and "back to match" peek make no sense over
  // a spectator division. All three are live-only — a preview has no match to
  // kick off, and a completed draw is browsed straight from "This season", not
  // continued from.
  const isOwnDraw = $derived(viewing === null);
  const showPlay = $derived(mode === "live" && isOwnDraw && store.awaitingKickoff);
  const showBackToMatch = $derived(mode === "live" && isOwnDraw && !store.awaitingKickoff && store.match !== null);
  const showContinue = $derived(mode === "live" && isOwnDraw && store.concludedTournament !== null);

  // Once the human's own tournament has fully concluded, every sibling has
  // also been fast-forwarded to its own real conclusion (see
  // `Game.resolveTournamentMatch`) — there's no more suspense left to
  // protect anywhere, so every division reveals in full. Until then, only
  // the round the human hasn't finished yet stays hidden, and only for a
  // division that's still actually live (a sibling that wrapped up earlier
  // has nothing left to hide either). A preview or a completed draw is never
  // "still playing" from the viewer's perspective, so both always reveal in
  // full too (a preview has nothing to hide anyway — every winnerId is
  // already null).
  const revealAll = $derived(mode !== "live" || store.concludedTournament !== null);
  const branchConcluded = $derived(otherTournament ? otherTournament.concluded : false);

  /** Column heading for a round — the main draw's stage name ("Quarterfinal",
   * "Final", …) when it's still alive, else a plain round number once only
   * plate lineages remain. */
  function columnTitle(round: DrawRound): string {
    return round.sections.find((s) => s.isMainDraw)?.roundName ?? `Round ${round.round + 1}`;
  }

  // When landing on the draw before a match, bring the player's own pending
  // matchup into view so "your draw" is the first thing they see. Once the
  // tournament has concluded, scroll to the far (final) column instead so
  // the outcome is the first thing they see. Live only — a preview/completed
  // draw has no kickoff-vs-concluded distinction driving where to land.
  $effect(() => {
    if (mode !== "live" || !isOwnDraw || !sheetEl) return;
    if (store.awaitingKickoff) {
      void rounds; // re-run once the draw is populated
      requestAnimationFrame(() => {
        sheetEl?.querySelector(".matchup.yours.pending")?.scrollIntoView({
          inline: "center",
          block: "nearest",
          behavior: "smooth",
        });
      });
    } else if (store.concludedTournament) {
      void rounds;
      requestAnimationFrame(() => {
        sheetEl?.scrollTo({ left: sheetEl.scrollWidth, behavior: "smooth" });
      });
    }
  });
</script>

<div class="draw">
  <div class="top">
    {#if showBackToMatch}
      <button class="close" onclick={() => store.closeDraw()}>‹ Back to match</button>
    {:else if mode !== "live"}
      <button class="close" onclick={() => onClose?.()}>‹ Back</button>
    {:else}
      <span class="close-spacer"></span>
    {/if}
    <span class="title">{otherTournament ? otherTournament.tournament.name : (titleProp ?? store.tournamentContext?.name ?? "Draw")}</span>
    <span class="spacer"></span>
  </div>

  {#if mode === "live" && isOwnDraw && store.awaitingKickoff && store.tournamentContext}
    <p class="stage-line">
      <span class="stage">{store.tournamentContext.roundName}</span> — study the draw, then play your match
    </p>
  {:else if mode === "live" && isOwnDraw && store.concludedTournament}
    {@const outcome = store.concludedTournament}
    <p class="stage-line">
      <span class="stage">{finishLabel(outcome.finishingPosition, outcome.tiedCount)}</span> — the tournament is over, browse the final draw
    </p>
  {:else if mode === "preview"}
    <p class="stage-line">The draw is out — round 1 pairings, before anyone's played a match</p>
  {/if}

  {#if effectiveOtherDivisionDraws.length > 0}
    <div class="tabs">
      <button class="tab" class:active={viewing === null} onclick={() => (viewing = null)}>
        Your draw
      </button>
      {#each effectiveOtherDivisionDraws as other (other.division)}
        <button class="tab" class:active={viewing === other.division} onclick={() => (viewing = other.division)}>
          Class {other.division}{other.concluded ? " ✓" : ""}
        </button>
      {/each}
    </div>
  {/if}

  <div class="sheet" bind:this={sheetEl}>
    {#each rounds as round (round.round)}
      {@const isCurrentRound = !revealAll && !branchConcluded && round.round === lastRoundNumber}
      <div class="column">
        <div class="column-title">{columnTitle(round)}</div>
        <div class="sections">
          {#each round.sections as section (section.roundName + section.positionFrom)}
            <div class="section" class:main={section.isMainDraw}>
              <div class="section-head">
                <span class="section-name">{section.roundName}</span>
                <span class="section-positions">#{section.positionFrom}–{section.positionTo}</span>
              </div>
              {#if section.isMainDraw}
                <p class="spectators">👀 Centre court</p>
              {:else}
                <p class="spectators plate">Back court — plate</p>
              {/if}
              <div class="matchups">
                {#each section.matchups as m (m.a.id + m.b.id)}
                  {@const yours = m.isYouA || m.isYouB}
                  {@const hidden = isCurrentRound && !yours}
                  {@const winnerId = hidden ? null : m.winnerId}
                  {@const pending = winnerId === null}
                  {@const scores = hidden ? "" : setScoreLine(m.sets)}
                  <div class="matchup" class:yours class:pending>
                    <button class="player" class:winner={winnerId === m.a.id} class:you={m.isYouA} onclick={() => store.viewOpponent(m.a.id)}>
                      <span class="flag">{flagEmoji(m.a.nationality)}</span>
                      {#if m.a.seed}<span class="seed">{seedBadge(m.a.seed)}</span>{/if}
                      <span class="name">{m.a.name}</span>
                    </button>
                    <button class="player" class:winner={winnerId === m.b.id} class:you={m.isYouB} onclick={() => store.viewOpponent(m.b.id)}>
                      <span class="flag">{flagEmoji(m.b.nationality)}</span>
                      {#if m.b.seed}<span class="seed">{seedBadge(m.b.seed)}</span>{/if}
                      <span class="name">{m.b.name}</span>
                    </button>
                    {#if scores}
                      <p class="scores">{scores}</p>
                    {:else if pending && yours}
                      <p class="your-match">● Your match</p>
                    {:else if pending}
                      <p class="tbd">vs — to play</p>
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

  {#if showPlay}
    <footer class="cta">
      <button class="play" onclick={() => store.playPendingMatch()}>Play match ▸</button>
    </footer>
  {:else if showContinue}
    <footer class="cta">
      <button class="play" onclick={() => store.continueAfterTournament()}>Continue ▸</button>
    </footer>
  {/if}
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
    white-space: nowrap;
  }

  .close-spacer,
  .spacer {
    width: 96px;
  }

  .title {
    font-weight: 700;
    font-size: 14.5px;
    text-align: center;
  }

  .stage-line {
    margin: 0;
    padding: 10px 16px 0;
    font-size: 12px;
    color: var(--muted);
  }

  .stage-line .stage {
    color: var(--accent);
    font-weight: 800;
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

  /* The draw sheet: rounds as columns, pan sideways. */
  .sheet {
    flex: 1;
    overflow: auto;
    padding: 14px 16px 24px;
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 0;
  }

  .column {
    position: relative;
    flex-shrink: 0;
    width: 208px;
    padding-left: 22px;
  }

  .column:first-child {
    padding-left: 0;
  }

  /* Connector rail down the left gutter of every round after the first, with a
   * short tick reaching into each section — a light draw-sheet feel, not an
   * exact spider of who-plays-who (the Monrad re-pairing makes that fluid). */
  .column:not(:first-child)::before {
    content: "";
    position: absolute;
    left: 9px;
    top: 40px;
    bottom: 16px;
    width: 1px;
    background: var(--border);
  }

  .column:not(:first-child) .section::before {
    content: "";
    position: absolute;
    left: -13px;
    top: 22px;
    width: 13px;
    height: 1px;
    background: var(--border);
  }

  .column-title {
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    margin-bottom: 10px;
    white-space: nowrap;
  }

  .sections {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section {
    position: relative;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 10px 11px;
    opacity: 0.78;
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
    gap: 6px;
    margin-bottom: 3px;
  }

  .section-name {
    font-weight: 800;
    font-size: 12.5px;
  }

  .section.main .section-name {
    color: var(--accent);
  }

  .section-positions {
    font-size: 10.5px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .spectators {
    margin: 0 0 8px;
    font-size: 10.5px;
    color: var(--muted);
    font-style: italic;
  }

  .spectators.plate {
    opacity: 0.7;
  }

  .matchups {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .matchup {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 7px;
    border-radius: 8px;
    background: var(--card-2);
  }

  .matchup.yours {
    background: color-mix(in srgb, var(--accent) 14%, var(--card-2));
  }

  .matchup.yours.pending {
    outline: 1.5px solid var(--accent);
  }

  .player {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: var(--muted);
    text-align: left;
    min-width: 0;
  }

  .player .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .player .flag {
    flex-shrink: 0;
  }

  .player .seed {
    flex-shrink: 0;
    color: var(--warn);
    font-weight: 800;
    font-size: 10.5px;
    font-variant-numeric: tabular-nums;
  }

  .player.you {
    color: var(--text);
    font-weight: 700;
  }

  .player.winner {
    color: var(--ok);
    font-weight: 700;
  }

  .player.you.winner {
    color: var(--ok);
  }

  .scores {
    margin: 2px 0 0;
    font-size: 10.5px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
  }

  .your-match {
    margin: 2px 0 0;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.05em;
    color: var(--accent);
  }

  .tbd {
    margin: 2px 0 0;
    font-size: 10px;
    color: var(--muted);
    font-style: italic;
  }

  .empty {
    color: var(--muted);
    text-align: center;
    padding: 32px 0;
    width: 100%;
  }

  .cta {
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--border);
  }

  .play {
    width: 100%;
    background: var(--accent);
    color: #fff;
    border-radius: 12px;
    padding: 14px;
    font-size: 15px;
    font-weight: 700;
  }
</style>
