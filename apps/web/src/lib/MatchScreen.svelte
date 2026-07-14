<script lang="ts">
  import type { ClutchMoment, Sport, Tactic } from "@racketlon/engine";
  import {
    SPORTS,
    SPORT_LABELS,
    clutchMoment,
    currentSport,
    fatigueTell,
    luckTell,
    mentalStrength,
    mentalTell,
    playPoint,
    tacticsForSport,
    totalPoints,
  } from "@racketlon/engine";
  import { store, type MatchSpeed } from "./store.svelte";
  import {
    energyColor,
    FATIGUE_LABEL,
    FATIGUE_READ,
    LUCK_READ,
    MENTAL_LABEL,
    mentalColor,
    momentumBarPosition,
    SPORT_COLORS,
    SPORT_SHORT,
    TACTIC_READ,
  } from "./ui";

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

  const CLUTCH_LABEL: Record<Exclude<ClutchMoment, null>, string> = {
    set: "⚡ Set point",
    match: "⚡ Match point",
    gummiarm: "⚡ Winner takes all",
  };

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
  {@const mentalA = mentalStrength(m, "a")}
  {@const mentalB = mentalStrength(m, "b")}
  {@const mentalTellA = mentalTell(mentalA)}
  {@const mentalTellB = mentalTell(mentalB)}
  {@const momentumPos = momentumBarPosition(m.momentum)}
  {@const moment = m.phase === "playing" ? clutchMoment(m) : null}
  <div class="match">
    <div class="top">
      <span class="label">
        {#if store.tournamentContext}
          {store.tournamentContext.name} — {store.tournamentContext.roundName}
        {/if}
      </span>
      <div class="top-actions">
        <button class="draw-link" onclick={() => store.viewDraw()}>Draw</button>
        <button class="close" onclick={exit}>✕</button>
      </div>
    </div>

    {#if store.tournamentContext}
      <p class="spectators" class:plate={!store.tournamentContext.isMainDraw}>
        {store.tournamentContext.isMainDraw
          ? "👀 Centre court — a crowd has gathered to watch"
          : "Back court — a plate match, low-key"}
      </p>
    {/if}

    <div class="players">
      <button class="pname you" onclick={() => store.viewOpponent(m.players.a.id)}>{m.players.a.name}</button>
      <div class="score-col">
        <span class="totals" class:leading-a={totalA > totalB} class:leading-b={totalB > totalA}>
          {totalA} – {totalB}
        </span>
        <span class="diff" class:up={totalA > totalB} class:down={totalB > totalA}>
          {#if totalA === totalB}level{:else if totalA > totalB}you +{totalA - totalB}{:else}−{totalB - totalA}{/if}
        </span>
      </div>
      <button class="pname" onclick={() => store.viewOpponent(m.players.b.id)}>{m.players.b.name}</button>
    </div>

    {#if store.tournamentContext}
      <div class="soreness-strip">
        <div class="bar soreness-mini">
          <div class="fill" style:width="{Math.round(m.feltSoreness.a)}%" style:background="var(--warn)"></div>
        </div>
      </div>
    {/if}

    <div class="meter-section-title momentum-title">Momentum</div>
    <div class="momentum-bar">
      <div
        class="fill"
        class:you-side={momentumPos >= 50}
        style:left="{momentumPos >= 50 ? 50 - (momentumPos - 50) : 50}%"
        style:width="{Math.abs(momentumPos - 50)}%"
      ></div>
      <div class="momentum-center"></div>
    </div>

    <p class="opp-read">
      <button class="opp-name" onclick={() => store.viewOpponent(m.players.b.id)}>{m.players.b.name}</button>
      is {FATIGUE_READ[oppFatigue]}, {TACTIC_READ[m.tactics.b]}{#if LUCK_READ[oppLuck]}, {LUCK_READ[oppLuck]}{/if}
    </p>

    <div class="energy-group">
      <div class="meter-section-title">Physical</div>
      <div class="energy-row">
        <span class="energy-label">You</span>
        <div class="bar energy-bar">
          <div class="fill" style:width="{m.energy.a}%" style:background={energyColor(m.energy.a)}></div>
        </div>
        <span class="energy-val">{Math.round(m.energy.a)}%</span>
      </div>
      <div class="energy-row">
        <span class="energy-label">{m.players.b.name}</span>
        <div class="bar energy-bar">
          <div class="fill" style:width="{m.energy.b}%" style:background={energyColor(m.energy.b)}></div>
        </div>
        <span class="energy-val opp">{FATIGUE_LABEL[oppFatigue]}</span>
      </div>

      <div class="meter-section-title mental-title">Mental strength</div>
      <div class="energy-row mental-row">
        <span class="energy-label">You</span>
        <div class="bar mental-bar">
          <div class="fill" style:width="{mentalA}%" style:background={mentalColor(mentalA)}></div>
        </div>
        <span class="energy-val">{MENTAL_LABEL[mentalTellA]}</span>
      </div>
      <div class="energy-row mental-row">
        <span class="energy-label">{m.players.b.name}</span>
        <div class="bar mental-bar">
          <div class="fill" style:width="{mentalB}%" style:background={mentalColor(mentalB)}></div>
        </div>
        <span class="energy-val opp">{MENTAL_LABEL[mentalTellB]}</span>
      </div>
    </div>

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

    {#if m.setIndex === 3 && !m.gummiarm && m.phase !== "finished"}
      {@const ptw = m.tennisTarget}
      <p class="to-win">
        {#if ptw}
          <strong>{ptw.side === "a" ? "You need" : `${m.players.b.name} needs`} {ptw.points} point{ptw.points === 1 ? "" : "s"}</strong>
          in the tennis to win the match
        {:else}
          Dead level — the tennis set, or a gummiarm, decides it
        {/if}
      </p>
    {/if}

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
        {#if moment}
          <div class="clutch-flash" class:gummiarm={moment === "gummiarm"}>{CLUTCH_LABEL[moment]}</div>
        {/if}
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

  .top-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .draw-link {
    color: var(--accent);
    font-size: 12px;
    font-weight: 700;
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .close {
    color: var(--muted);
    font-size: 18px;
    padding: 4px 8px;
  }

  .spectators {
    margin: -6px 0 0;
    font-size: 11.5px;
    color: var(--muted);
    font-style: italic;
  }

  .spectators.plate {
    opacity: 0.7;
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

  .score-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
  }

  .totals {
    font-size: 22px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .diff {
    font-size: 11px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .diff.up {
    color: var(--ok);
  }

  .diff.down {
    color: var(--danger, #d66);
  }

  /* small, own-side-only — deliberately not shown for the opponent, and not
     grouped with the labeled energy/mental-strength rows below; live
     in-match muscle stiffness (MatchState.feltSoreness), not a static number */
  .soreness-strip {
    width: 96px;
    margin: -4px 0 0;
  }

  .soreness-mini {
    height: 4px;
    background: color-mix(in srgb, var(--warn) 18%, var(--card-2));
  }

  /* shared "who's got the flow" bar — a tug-of-war from a fixed center
     tick, not a per-side stat, so it isn't grouped with the energy rows */
  .momentum-title {
    margin-top: -2px;
  }

  .momentum-bar {
    position: relative;
    height: 5px;
    border-radius: 3px;
    background: var(--card-2);
    overflow: hidden;
  }

  .momentum-bar .fill {
    position: absolute;
    top: 0;
    height: 100%;
    background: var(--warn);
    transition:
      left 0.2s ease,
      width 0.2s ease;
  }

  .momentum-bar .fill.you-side {
    background: var(--accent);
  }

  .momentum-center {
    position: absolute;
    left: 50%;
    top: 0;
    width: 2px;
    height: 100%;
    background: var(--border);
    transform: translateX(-1px);
  }

  .to-win {
    margin: -4px 0 0;
    text-align: center;
    font-size: 13px;
    color: var(--muted);
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 8px 10px;
  }

  .to-win strong {
    color: var(--accent);
    font-weight: 800;
  }

  .opp-read {
    margin: -4px 0 0;
    text-align: right;
    color: var(--muted);
    font-size: 12px;
    font-style: italic;
  }

  .opp-name {
    font-style: normal;
    font-weight: 700;
    color: var(--text);
    text-decoration: underline;
    text-decoration-color: var(--muted);
    text-underline-offset: 2px;
  }

  .energy-group {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin: -6px 0 0;
  }

  .meter-section-title {
    margin-top: 2px;
    font-size: 10px;
    font-weight: 800;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .mental-title {
    margin-top: 6px;
  }

  .energy-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .energy-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    flex-shrink: 0;
    width: 84px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bar {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: var(--card-2);
    overflow: hidden;
  }

  .fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.2s ease;
  }

  .energy-val {
    font-size: 12px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
    min-width: 52px;
    text-align: right;
  }

  .energy-val.opp {
    color: var(--muted);
    font-style: italic;
  }

  .mental-bar {
    background: color-mix(in srgb, var(--accent) 14%, var(--card-2));
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

  .clutch-flash {
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.03em;
    color: var(--warn);
    background: color-mix(in srgb, var(--warn) 16%, var(--card-2));
    border: 1px solid color-mix(in srgb, var(--warn) 40%, var(--border));
    border-radius: 999px;
    padding: 4px 12px;
    animation: clutch-pulse 1.1s ease-in-out infinite;
  }

  .clutch-flash.gummiarm {
    color: var(--danger, #d66);
    background: color-mix(in srgb, var(--danger, #d66) 16%, var(--card-2));
    border-color: color-mix(in srgb, var(--danger, #d66) 40%, var(--border));
  }

  @keyframes clutch-pulse {
    0%,
    100% {
      opacity: 0.75;
    }
    50% {
      opacity: 1;
    }
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
