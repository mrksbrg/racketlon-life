<script lang="ts">
  import type { Sport, Tactic } from "@racketlon/engine";
  import {
    SPORTS,
    SPORT_LABELS,
    currentSport,
    fatigueTell,
    luckTell,
    playPoint,
    tacticsForSport,
    totalPoints,
  } from "@racketlon/engine";
  import { store, type MatchSpeed } from "./store.svelte";
  import { FATIGUE_READ, LUCK_READ, SPORT_COLORS, SPORT_SHORT, TACTIC_READ } from "./ui";

  const DELAYS: Record<MatchSpeed, number> = { 1: 320, 2: 130, 3: 35 };

  const TACTIC_LABELS: Record<Tactic, string> = {
    conserve: "Conserve",
    safe: "Play safe",
    normal: "Normal",
    aggressive: "Take chances",
    allOut: "All-out fight",
  };

  /**
   * BD/SQ/TN read as a straightforward physical trade-off across the full
   * 5-step dial: conserve/safe extend rallies and bank/cost stamina,
   * aggressive/allOut end them on a winner (or empty the tank). Table tennis
   * has no physical conserve/all-out gear — its rallies are short and cheap
   * regardless of tactic (see BALANCE.match.tacticEnergyMult) — so it only
   * ever offers the original 3 steps, read as a consistency/pressure game:
   * keep the ball on the table and let the opponent's own impatience produce
   * unforced errors, or take the risk of looping early.
   */
  const GENERIC_HINTS: Record<Tactic, string> = {
    conserve: "coast a little — biggest energy savings, weaker plays",
    safe: "grind out rallies — costs more energy for you and the opponent",
    normal: "your usual game",
    aggressive: "go for winners — swingy, saves energy",
    allOut: "leave it all out there — big effort, big energy cost",
  };

  const TT_HINTS: Partial<Record<Tactic, string>> = {
    safe: "steady, consistent balls — pressure them into unforced errors",
    normal: "your usual game",
    aggressive: "loop the ball early — high risk, high reward",
  };

  function tacticHint(sport: Sport, tactic: Tactic): string {
    return (sport === "tt" ? TT_HINTS[tactic] : undefined) ?? GENERIC_HINTS[tactic];
  }

  // autoplay: one point per tick while the match is in the playing phase
  $effect(() => {
    const m = store.match;
    if (!m || m.phase !== "playing") return;
    m.pointCount; // re-run this effect after every point
    const timer = setTimeout(() => {
      if (m.phase === "playing") playPoint(m);
    }, DELAYS[store.matchSpeed]);
    return () => clearTimeout(timer);
  });

  function skipToBreak() {
    const m = store.match;
    if (!m) return;
    let guard = 0;
    while (m.phase === "playing" && ++guard < 500) playPoint(m);
  }

  function breakTitle(reason: string, sport: string): string {
    switch (reason) {
      case "matchStart":
        return "Match start";
      case "sideChange":
        return `Side change — ${sport}`;
      case "setEnd":
        return "Set finished";
      case "gummiarm":
        return "Gummiarm — one point decides it all!";
      default:
        return "";
    }
  }

  function exit() {
    const m = store.match;
    if (m && m.phase !== "finished" && !confirm("Leave the match?")) return;
    store.exitMatch();
  }
</script>

{#if store.match}
  {@const m = store.match}
  {@const sport = currentSport(m)}
  {@const totalA = totalPoints(m, "a")}
  {@const totalB = totalPoints(m, "b")}
  {@const oppFatigue = fatigueTell(m.energy.b)}
  {@const oppLuck = luckTell(m, "b")}
  <div class="match">
    <div class="top">
      <span class="label">
        {#if store.tournamentContext}
          {store.tournamentContext.name} — Round {store.tournamentContext.round} of {store.tournamentContext.totalRounds}
        {/if}
      </span>
      <button class="close" onclick={exit}>✕</button>
    </div>

    <div class="players">
      <span class="pname you">{m.players.a.name}</span>
      <span class="totals" class:leading-a={totalA > totalB} class:leading-b={totalB > totalA}>
        {totalA} – {totalB}
      </span>
      <span class="pname">{m.players.b.name}</span>
    </div>

    <p class="opp-read">
      {m.players.b.name} is {FATIGUE_READ[oppFatigue]}, {TACTIC_READ[m.tactics.b]}{#if LUCK_READ[oppLuck]}, {LUCK_READ[oppLuck]}{/if}
    </p>

    <div class="sets">
      {#each SPORTS as s, i (s)}
        {@const set = m.sets[i]}
        <div class="set" class:active={i === m.setIndex && !set?.done} class:done={set?.done}>
          <span class="set-sport" style:color={SPORT_COLORS[s]}>{SPORT_SHORT[s]}</span>
          <span class="set-score">
            {#if set && (set.a > 0 || set.b > 0 || i <= m.setIndex)}
              {set.a}–{set.b}
            {:else}
              ·
            {/if}
          </span>
        </div>
      {/each}
    </div>

    {#if m.phase === "finished"}
      {@const won = m.winner === "a"}
      <div class="panel result">
        <div class="verdict" class:won>
          {won ? "You win!" : `${m.players.b.name} wins`}
        </div>
        <div class="final">{totalA} – {totalB}</div>
        {#if m.gummiarm}
          <p class="note">Decided by a gummiarm point.</p>
        {:else if m.decidedEarly}
          <p class="note">Match decided early — the lead was uncatchable.</p>
        {/if}
        <button class="primary" onclick={() => void store.finishMatch()}>
          {store.tournamentContext ? "Continue ▸" : "Back to planning"}
        </button>
      </div>
    {:else if m.phase === "break"}
      <div class="panel">
        <h3>{breakTitle(m.breakReason ?? "", SPORT_LABELS[sport])}</h3>
        <p class="energy">Energy: {Math.round(m.energy.a)}%</p>
        <div class="tactics">
          {#each tacticsForSport(sport) as tactic (tactic)}
            <button
              class="tactic"
              class:selected={m.tactics.a === tactic}
              onclick={() => store.chooseTactic(tactic)}
            >
              <span>{TACTIC_LABELS[tactic]}</span>
              <small>{tacticHint(sport, tactic)}</small>
            </button>
          {/each}
        </div>
        <button class="primary" onclick={() => store.continueMatch()}>Play ▸</button>
      </div>
    {:else}
      <div class="panel live">
        <div class="sport-label" style:color={SPORT_COLORS[sport]}>
          {SPORT_LABELS[sport]}{m.gummiarm ? " — gummiarm" : ""}
        </div>
        <div class="score">{m.sets[m.setIndex]?.a ?? 0} – {m.sets[m.setIndex]?.b ?? 0}</div>
        <div class="speeds">
          {#each [1, 2, 3] as s (s)}
            <button
              class="speed"
              class:selected={store.matchSpeed === s}
              onclick={() => (store.matchSpeed = s as MatchSpeed)}
            >
              ×{s}
            </button>
          {/each}
          <button class="speed" onclick={skipToBreak}>⏭</button>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .match {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 14px 16px;
    gap: 14px;
  }

  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .label {
    color: var(--muted);
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .close {
    color: var(--muted);
    font-size: 18px;
    padding: 4px 8px;
  }

  .players {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 10px;
  }

  .pname {
    font-weight: 700;
    font-size: 14px;
    text-align: right;
  }

  .pname.you {
    text-align: left;
    color: var(--accent);
  }

  .totals {
    font-size: 22px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .opp-read {
    margin: -4px 0 0;
    text-align: right;
    color: var(--muted);
    font-size: 12px;
    font-style: italic;
  }

  .sets {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .set {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 8px 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    opacity: 0.55;
  }

  .set.active {
    opacity: 1;
    border-color: var(--accent);
  }

  .set.done {
    opacity: 0.9;
  }

  .set-sport {
    font-size: 11px;
    font-weight: 800;
  }

  .set-score {
    font-size: 14px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .panel {
    flex: 1;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    text-align: center;
  }

  .panel h3 {
    font-size: 16px;
  }

  .sport-label {
    font-weight: 700;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .score {
    font-size: 56px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .speeds {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  .speed {
    background: var(--card-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 6px 14px;
    font-weight: 700;
    color: var(--muted);
  }

  .speed.selected {
    color: var(--text);
    border-color: var(--accent);
  }

  .energy {
    color: var(--muted);
    font-size: 13px;
    margin: 0;
  }

  .tactics {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }

  .tactic {
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: var(--card-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 14px;
    font-weight: 700;
  }

  .tactic small {
    color: var(--muted);
    font-weight: 400;
    font-size: 11.5px;
  }

  .tactic.selected {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 16%, var(--card-2));
  }

  .primary {
    width: 100%;
    background: var(--accent);
    color: white;
    font-weight: 700;
    font-size: 15px;
    border-radius: 12px;
    padding: 13px;
  }

  .result .verdict {
    font-size: 22px;
    font-weight: 800;
  }

  .result .verdict.won {
    color: var(--ok);
  }

  .final {
    font-size: 34px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .note {
    color: var(--muted);
    font-size: 13px;
    margin: 0;
  }
</style>
