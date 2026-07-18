<script lang="ts">
  import type { ClutchMoment, MatchState, Sport, Tactic } from "@racketlon/engine";
  import {
    SPORTS,
    SPORT_LABELS,
    clutchMoment,
    currentSport,
    fatigueTell,
    gummiarmPrefersServe,
    luckTell,
    mentalStrength,
    mentalTell,
    playPoint,
    pointsToWin,
    resolveGummiarmServe,
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
  // Match point (one point from winning it all) — slow enough to actually
  // watch the decisive point land, not just flash past it.
  const MATCH_POINT_DELAY = 1200;
  // Set point / deuce (both sides ≥ 20 — racketlon has no separate tiebreak,
  // "tight set" means deuce) — a notch below match point.
  const SET_POINT_DELAY = 850;
  // The single sudden-death gummiarm point itself, once serving actually
  // starts (see GUMMIARM_SUSPENSE_MS/GUMMIARM_REVEAL_MS below for the
  // ceremony around it — this is only the point's own autoplay pacing).
  const GUMMIARM_POINT_DELAY = 1600;
  // A ramp for the last few points before the match is mathematically
  // decided (pointsToWin() ≤ 5, excluding the match point itself, which
  // MATCH_POINT_DELAY already covers) — so the closing stretch audibly
  // *builds*, not just a single anomalous tick a player can blink past.
  // Indexed by points-to-go (2..5); index 0/1 unused (0 impossible, 1 is
  // match point, handled separately).
  const CLOSING_RAMP: Record<number, number> = { 2: 700, 3: 550, 4: 420, 5: 300 };

  // The player can punch through a slowdown with the speed-up button; this
  // re-arms itself every time the drama passes (see the autoplay effect).
  let rush = $state(false);

  // Gummiarm ceremony staging beyond the normal break/playing/finished
  // phases — see `playGummiarmPoint` and the autoplay effect below.
  //   idle     → nothing gummiarm-specific overriding the normal render
  //   suspense → serve chosen, point not yet live: the "stepping up" beat
  //   reveal   → the point just resolved: hold on the outcome before the
  //              normal finished/result panel is allowed to show
  //   revealed → reveal's hold has elapsed; renders identically to idle
  let gummiarmStage = $state<"idle" | "suspense" | "reveal" | "revealed">("idle");
  const GUMMIARM_SUSPENSE_MS = 2400;
  const GUMMIARM_REVEAL_MS = 1800;

  // Holds the just-played point's score on screen for a beat before the UI
  // moves on to the next thing — without this, a set or match conclusion
  // updates the score and swaps to the next panel in the very same tick,
  // which reads as the game blowing straight past its own biggest moments.
  // setEndHold covers a non-final set finishing (match continues);
  // matchEndHold covers the match itself finishing (any way but the
  // gummiarm, which already gets its own, longer "reveal" hold above).
  let setEndHold = $state(false);
  let matchEndHold = $state(false);
  const SET_END_HOLD_MS = 1800;
  const MATCH_END_HOLD_MS = 1400;

  /**
   * Running point-by-point score differential (you minus opponent), one
   * entry per point played plus a leading 0 for "before the match started" —
   * purely a presentation trace for the post-match summary chart, not
   * engine state (MatchState only keeps cumulative set scores, not the
   * trajectory that produced them). Recorded by `stepPoint` alongside every
   * `playPoint` call so it stays in lockstep regardless of autoplay speed or
   * the ⏭ skip button. Reset whenever `store.match` becomes a new match
   * object (see the identity-reset effect below).
   */
  let pointHistory = $state<number[]>([0]);

  let lastMatchRef: MatchState | null = null;
  $effect(() => {
    const m = store.match;
    if (m && m !== lastMatchRef) {
      lastMatchRef = m;
      pointHistory = [0];
      setEndHold = false;
      matchEndHold = false;
    }
  });

  /**
   * Autoplay delay if we let the drama breathe (before the speed-up button is
   * applied): the deciding beats slow toward rally pace so the big moments are
   * felt, never blinked past — even at ×3. Match point is slowest of the
   * per-point tiers; a set point or deuce a touch quicker; the last few
   * points before the match is mathematically decided ramp down gradually
   * (see CLOSING_RAMP) so the closing stretch as a whole feels tense, not
   * just its very last tick. The gummiarm's own single point is paced
   * separately (GUMMIARM_POINT_DELAY) — its surrounding ceremony (suspense/
   * reveal) is handled outside the per-point autoplay loop entirely, since a
   * one-point sudden death can't be "ramped into" the way a normal set can.
   * Never faster than the player's own ×1/×2/×3 pick.
   */
  function dramaDelay(m: MatchState): number {
    const base = DELAYS[store.matchSpeed];
    if (m.gummiarm) return Math.max(base, GUMMIARM_POINT_DELAY);
    const moment = clutchMoment(m);
    if (moment === "match") return Math.max(base, MATCH_POINT_DELAY);
    const set = m.sets[m.setIndex];
    const deuce = !!set && set.a >= 20 && set.b >= 20;
    if (moment === "set" || deuce) return Math.max(base, SET_POINT_DELAY);
    const ptw = pointsToWin(m);
    const ramp = ptw && CLOSING_RAMP[ptw.points];
    if (ramp) return Math.max(base, ramp);
    return base;
  }

  /** `m.phase` behind a function call — TS narrows the `MatchState["phase"]`
   * literal type across mutation-in-place calls like `playPoint`, so a direct
   * comparison right after one is (wrongly) flagged as unreachable. Routing
   * the read through a function severs that narrowing. */
  function currentPhase(m: MatchState): MatchState["phase"] {
    return m.phase;
  }

  /** `playPoint` plus recording the resulting differential into
   * `pointHistory` — the single choke point every autoplay/skip path should
   * call through so the summary chart never misses a point. */
  function stepPoint(m: MatchState) {
    const outcome = playPoint(m);
    if (outcome) pointHistory.push(totalPoints(m, "a") - totalPoints(m, "b"));
    return outcome;
  }

  const TACTIC_LABELS: Record<Tactic, string> = {
    conserve: "Conserve",
    safe: "Play safe",
    normal: "Normal",
    aggressive: "Take chances",
    allOut: "All-out fight",
  };

  /**
   * BD/SQ/TN read as a straightforward physical trade-off across the full
   * 5-step dial: conserve/safe extend rallies and bank/cost endurance,
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

  // autoplay: one point per tick while the match is in the playing phase,
  // paced by tension (see dramaDelay) so the deciding points slow down. For
  // the gummiarm specifically, the instant that single point resolves the
  // match, we hand off to the "reveal" hold (see gummiarmStage) right here —
  // synchronously, in the same tick as playPoint() — rather than reacting to
  // the phase change afterward, so there's no frame where the raw "finished"
  // panel can flash before the reveal beat takes over.
  $effect(() => {
    const m = store.match;
    if (!m || m.phase !== "playing") return;
    m.pointCount; // re-run this effect after every point
    const base = DELAYS[store.matchSpeed];
    const drama = dramaDelay(m);
    if (drama <= base) rush = false; // drama passed — re-arm the slowdown
    const delay = rush ? base : drama;
    const timer = setTimeout(() => {
      if (m.phase !== "playing") return;
      const wasGummiarm = m.gummiarm;
      stepPoint(m);
      const phaseNow = currentPhase(m);
      if (wasGummiarm && phaseNow === "finished") {
        gummiarmStage = "reveal";
        setTimeout(() => {
          gummiarmStage = "revealed";
        }, GUMMIARM_REVEAL_MS);
      } else if (phaseNow === "finished") {
        matchEndHold = true;
        setTimeout(() => {
          matchEndHold = false;
        }, MATCH_END_HOLD_MS);
      } else if (phaseNow === "break" && m.breakReason === "setEnd") {
        setEndHold = true;
        setTimeout(() => {
          setEndHold = false;
        }, SET_END_HOLD_MS);
      }
    }, delay);
    return () => clearTimeout(timer);
  });

  // At the gummiarm, if the OPPONENT won the coin toss, reveal their
  // serve/receive call straight away so the ceremony can show it. When the
  // human won the toss we leave it to their own button press instead.
  $effect(() => {
    const m = store.match;
    if (m && m.gummiarm && m.gummiarmToss === "b" && m.gummiarmServe === null) {
      resolveGummiarmServe(m);
    }
  });

  // Re-arm the ceremony staging for the next match the moment we're not at
  // (or past) a gummiarm — covers both a fresh match and the very start of
  // this one, before the four-sets-level tie is even possible.
  $effect(() => {
    const m = store.match;
    if (m && !m.gummiarm && gummiarmStage !== "idle") gummiarmStage = "idle";
  });

  /** The ceremony's "Play the point ▸" button — a deliberate pause (the
   * "stepping up to serve" beat) before the point actually goes live, since
   * a bare `continueMatch()` would let the single sudden-death point start
   * (and, via GUMMIARM_POINT_DELAY, finish) with no anticipation at all. */
  function playGummiarmPoint() {
    gummiarmStage = "suspense";
    setTimeout(() => {
      gummiarmStage = "idle";
      store.continueMatch();
    }, GUMMIARM_SUSPENSE_MS);
  }

  /** The ⏭ skip button — deliberately bypasses every pacing/hold beat above
   * (dramaDelay, setEndHold, matchEndHold, the gummiarm ceremony); skipping
   * is the impatience escape hatch, so it should actually be instant. Still
   * routes through stepPoint so the summary chart stays accurate. */
  function skipToBreak() {
    const m = store.match;
    if (!m) return;
    let guard = 0;
    while (m.phase === "playing" && ++guard < 500) stepPoint(m);
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
        <div class="meter-section-title soreness-title">Soreness</div>
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
        <span class="energy-label">Opponent</span>
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
        <span class="energy-label">Opponent</span>
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

    {#if gummiarmStage === "suspense"}
      {@const servingIsYou = m.gummiarmServe === "a"}
      <div class="panel gummiarm-panel suspense">
        <div class="gummi-emblem">⚡</div>
        <h3 class="gummi-title">{servingIsYou ? "YOUR SERVE" : `${m.players.b.name.toUpperCase()} TO SERVE`}</h3>
        <p class="gummi-sub">This is it. One point decides the whole match.</p>
        <div class="suspense-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    {:else if gummiarmStage === "reveal"}
      {@const pointWonByYou = m.winner === "a"}
      <div class="panel gummiarm-panel reveal" class:won={pointWonByYou}>
        <div class="gummi-emblem">{pointWonByYou ? "🏆" : "💔"}</div>
        <h3 class="gummi-title">{pointWonByYou ? "YOU WIN THE POINT!" : `${m.players.b.name.toUpperCase()} WINS THE POINT`}</h3>
        <p class="gummi-sub">{pointWonByYou ? "The nerve held." : "So close."}</p>
      </div>
    {:else if matchEndHold}
      <div class="panel live tense">
        <div class="sport-label" style:color={SPORT_COLORS[sport]}>{SPORT_LABELS[sport]}</div>
        <div class="score">{m.sets[m.setIndex]?.a ?? 0} – {m.sets[m.setIndex]?.b ?? 0}</div>
        <p class="hold-caption">That's match point landed…</p>
      </div>
    {:else if m.phase === "finished"}
      {@const won = m.winner === "a"}
      {@const history = pointHistory}
      {@const chartW = 300}
      {@const chartH = 110}
      {@const chartPad = 8}
      {@const maxAbs = Math.max(1, ...history.map(Math.abs))}
      {@const pts = history
        .map((d, i) => {
          const x = history.length > 1 ? (i / (history.length - 1)) * chartW : chartW / 2;
          const y = chartH / 2 - (d / maxAbs) * (chartH / 2 - chartPad);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ")}
      {@const boundaries = (() => {
        let cum = 0;
        return SPORTS.map((s, i) => {
          const set = m.sets[i];
          const played = set ? set.a + set.b : 0;
          cum += played;
          return { sport: s, index: cum, played };
        }).filter((b) => b.played > 0);
      })()}
      {@const biggestLeadYou = Math.max(0, ...history)}
      {@const biggestLeadOpp = Math.max(0, ...history.map((d) => -d))}
      {@const leadChanges = history.reduce((acc, d, i) => {
        if (i === 0) return acc;
        const prevSign = Math.sign(history[i - 1] ?? 0);
        const sign = Math.sign(d);
        return acc + (prevSign !== 0 && sign !== 0 && prevSign !== sign ? 1 : 0);
      }, 0)}
      <div class="panel result summary">
        <div class="verdict" class:won>
          {won ? "You win!" : `${m.players.b.name} wins`}
        </div>
        <div class="final">{totalA} – {totalB}</div>
        {#if m.gummiarm}
          <p class="note">Decided by a gummiarm point.</p>
        {:else if m.decidedEarly}
          <p class="note">Match decided early — the lead was uncatchable.</p>
        {/if}

        <div class="chart-wrap">
          <svg class="chart" viewBox="0 0 {chartW} {chartH}" preserveAspectRatio="none">
            <line x1="0" y1={chartH / 2} x2={chartW} y2={chartH / 2} class="chart-zero" />
            {#each boundaries.slice(0, -1) as b (b.sport)}
              {@const x = history.length > 1 ? (b.index / (history.length - 1)) * chartW : 0}
              <line x1={x} y1="0" x2={x} y2={chartH} class="chart-boundary" />
            {/each}
            <polyline points={pts} class="chart-line" />
          </svg>
          <div class="chart-sport-row">
            {#each boundaries as b (b.sport)}
              <span class="chart-sport-label" style:color={SPORT_COLORS[b.sport]}>{SPORT_SHORT[b.sport]}</span>
            {/each}
          </div>
          <div class="chart-legend">
            <span class="chart-legend-item you">You</span>
            <span class="chart-legend-item opp">{m.players.b.name}</span>
          </div>
        </div>

        <div class="stat-row">
          <div class="stat">
            <span class="stat-val">+{biggestLeadYou}</span>
            <span class="stat-label">your biggest lead</span>
          </div>
          <div class="stat">
            <span class="stat-val">+{biggestLeadOpp}</span>
            <span class="stat-label">{m.players.b.name}'s biggest lead</span>
          </div>
          <div class="stat">
            <span class="stat-val">{leadChanges}</span>
            <span class="stat-label">lead changes</span>
          </div>
        </div>

        <button class="primary" onclick={() => void store.finishMatch()}>
          {store.tournamentContext ? "Continue ▸" : "Back to planning"}
        </button>
      </div>
    {:else if setEndHold}
      {@const finishedSport = SPORTS[m.setIndex - 1] ?? sport}
      {@const finishedSet = m.sets[m.setIndex - 1]}
      <div class="panel live tense">
        <div class="sport-label" style:color={SPORT_COLORS[finishedSport]}>{SPORT_LABELS[finishedSport]}</div>
        <div class="score">{finishedSet?.a ?? 0} – {finishedSet?.b ?? 0}</div>
        <p class="hold-caption">Set won!</p>
      </div>
    {:else if m.phase === "break" && m.breakReason === "gummiarm"}
      {@const humanWonToss = m.gummiarmToss === "a"}
      {@const serveDecided = m.gummiarmServe !== null}
      {@const humanServes = m.gummiarmServe === "a"}
      <div class="panel gummiarm-panel">
        <div class="gummi-emblem">⚡</div>
        <h3 class="gummi-title">GUMMIARM</h3>
        <p class="gummi-sub">
          Four sets, dead level. One sudden-death point — a single serve, no second chance — takes the
          whole match.
        </p>

        <div class="coin">🪙</div>
        <p class="toss">
          {humanWonToss ? "You won the spin" : `${m.players.b.name} won the spin`}
        </p>

        {#if humanWonToss && !serveDecided}
          {@const prefersServe = gummiarmPrefersServe(m, "a")}
          <p class="choose-label">Serve, or receive?</p>
          <div class="serve-choice">
            <button class="serve-opt" onclick={() => store.chooseGummiarmServe(true)}>
              <span>Serve {#if prefersServe}<em class="rec">your call</em>{/if}</span>
              <small>one serve, no safety net — all on your nerve</small>
            </button>
            <button class="serve-opt" onclick={() => store.chooseGummiarmServe(false)}>
              <span>Receive {#if !prefersServe}<em class="rec">most players do</em>{/if}</span>
              <small>hand them the serve, and the nerves that come with it</small>
            </button>
          </div>
        {:else if serveDecided}
          <p class="serve-verdict" class:serving={humanServes}>
            {#if humanServes}
              You serve{humanWonToss ? "" : ` — ${m.players.b.name} handed you the pressure`}. Hold your
              nerve.
            {:else}
              {m.players.b.name} serves{humanWonToss ? " — you passed the nerves over" : ""}.
            {/if}
          </p>
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
          <button class="primary" onclick={playGummiarmPoint}>Play the point ▸</button>
        {/if}
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
      {@const slowing = dramaDelay(m) > DELAYS[store.matchSpeed] && !rush}
      <div class="panel live" class:tense={slowing}>
        <div class="sport-label" style:color={SPORT_COLORS[sport]}>
          {SPORT_LABELS[sport]}{m.gummiarm ? " — gummiarm" : ""}
        </div>
        <div class="score" class:tense={slowing}>{m.sets[m.setIndex]?.a ?? 0} – {m.sets[m.setIndex]?.b ?? 0}</div>
        {#if m.gummiarm && m.gummiarmServe}
          <p class="serve-live">{m.gummiarmServe === "a" ? "Your serve" : `${m.players.b.name} to serve`}</p>
        {/if}
        {#if moment}
          <div class="clutch-flash" class:gummiarm={moment === "gummiarm"}>{CLUTCH_LABEL[moment]}</div>
        {/if}
        {#if slowing}
          <button class="rush-btn" onclick={() => (rush = true)}>⏩ Speed through</button>
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
     tick, not a per-side stat, so it isn't grouped with the energy rows.
     Centered (unlike the other section titles) to read as belonging to
     both sides, not just the one it's left-aligned under. */
  .momentum-title {
    margin-top: -2px;
    text-align: center;
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

  /* the persistent "this is getting tense" visual, independent of the
     autoplay timing itself — a single slowed tick among many normal ones is
     easy to miss, this isn't */
  .score.tense {
    color: var(--warn);
    animation: score-tense-pulse 0.9s ease-in-out infinite;
  }

  @keyframes score-tense-pulse {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.06);
    }
  }

  .panel.live.tense {
    border-color: color-mix(in srgb, var(--warn) 50%, var(--border));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--warn) 30%, transparent);
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

  .serve-live {
    margin: -6px 0 0;
    font-size: 13px;
    font-weight: 700;
    color: var(--warn);
    letter-spacing: 0.02em;
  }

  .rush-btn {
    margin-top: 4px;
    background: var(--card-2);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 5px 14px;
    font-size: 12px;
    font-weight: 700;
    color: var(--muted);
  }

  /* --- gummiarm ceremony --- */
  .gummiarm-panel {
    gap: 10px;
    border-color: color-mix(in srgb, var(--danger, #d66) 45%, var(--border));
    background: color-mix(in srgb, var(--danger, #d66) 7%, var(--card));
  }

  .gummi-emblem {
    font-size: 40px;
    line-height: 1;
    animation: gummi-throb 1.3s ease-in-out infinite;
  }

  @keyframes gummi-throb {
    0%,
    100% {
      transform: scale(1);
      filter: drop-shadow(0 0 0 transparent);
    }
    50% {
      transform: scale(1.12);
      filter: drop-shadow(0 0 10px color-mix(in srgb, var(--danger, #d66) 60%, transparent));
    }
  }

  .gummi-title {
    font-size: 26px;
    font-weight: 900;
    letter-spacing: 0.14em;
    color: var(--danger, #d66);
    margin: 0;
  }

  .gummi-sub {
    margin: 0;
    font-size: 13px;
    color: var(--muted);
    max-width: 34ch;
    line-height: 1.4;
  }

  .coin {
    font-size: 34px;
    line-height: 1;
    margin-top: 4px;
    animation: coin-flip 0.9s ease-out 1;
  }

  @keyframes coin-flip {
    0% {
      transform: rotateY(0) translateY(-14px);
      opacity: 0.2;
    }
    100% {
      transform: rotateY(1440deg) translateY(0);
      opacity: 1;
    }
  }

  .toss {
    margin: 0;
    font-size: 14px;
    font-weight: 800;
  }

  /* --- gummiarm suspense (the "stepping up to serve" pause) --- */
  .gummiarm-panel.suspense .gummi-title {
    font-size: 22px;
  }

  .suspense-dots {
    display: flex;
    gap: 10px;
    margin-top: 6px;
  }

  .suspense-dots span {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--danger, #d66);
    animation: suspense-dot 1.2s ease-in-out infinite;
  }

  .suspense-dots span:nth-child(2) {
    animation-delay: 0.2s;
  }

  .suspense-dots span:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes suspense-dot {
    0%,
    80%,
    100% {
      opacity: 0.25;
      transform: scale(0.8);
    }
    40% {
      opacity: 1;
      transform: scale(1.15);
    }
  }

  /* --- gummiarm reveal (holds on the point outcome before the result panel) --- */
  .gummiarm-panel.reveal {
    border-color: color-mix(in srgb, var(--danger, #d66) 55%, var(--border));
  }

  .gummiarm-panel.reveal.won {
    border-color: color-mix(in srgb, var(--ok) 55%, var(--border));
    background: color-mix(in srgb, var(--ok) 8%, var(--card));
  }

  .gummiarm-panel.reveal .gummi-emblem {
    font-size: 52px;
    animation: gummi-throb 0.7s ease-in-out infinite;
  }

  .gummiarm-panel.reveal .gummi-title {
    color: var(--text);
  }

  .gummiarm-panel.reveal.won .gummi-title {
    color: var(--ok);
  }

  .choose-label {
    margin: 4px 0 0;
    font-size: 13px;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .serve-choice {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }

  .serve-opt {
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: var(--card-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 11px 14px;
    font-weight: 800;
    text-align: left;
  }

  .serve-opt small {
    color: var(--muted);
    font-weight: 400;
    font-size: 11.5px;
  }

  .serve-opt .rec {
    font-style: normal;
    font-size: 10px;
    font-weight: 800;
    color: var(--danger, #d66);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-left: 4px;
  }

  .serve-verdict {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    color: var(--muted);
    max-width: 32ch;
    line-height: 1.4;
  }

  .serve-verdict.serving {
    color: var(--danger, #d66);
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

  /* --- set/match-end holds: reuses the live-panel look, frozen a beat --- */
  .hold-caption {
    margin: 6px 0 0;
    font-size: 13px;
    font-weight: 700;
    color: var(--warn);
    letter-spacing: 0.02em;
  }

  /* --- match summary (chart + stats), replaces the plain result panel --- */
  .panel.summary {
    justify-content: flex-start;
    gap: 10px;
    padding-top: 18px;
    overflow-y: auto;
  }

  .chart-wrap {
    width: 100%;
    margin-top: 4px;
  }

  .chart {
    width: 100%;
    height: 90px;
    display: block;
    overflow: visible;
  }

  .chart-zero {
    stroke: var(--border);
    stroke-width: 1;
  }

  .chart-boundary {
    stroke: var(--border);
    stroke-width: 1;
    stroke-dasharray: 3 3;
  }

  .chart-line {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .chart-sport-row {
    display: flex;
    justify-content: space-between;
    margin-top: 2px;
  }

  .chart-sport-label {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.04em;
  }

  .chart-legend {
    display: flex;
    justify-content: center;
    gap: 16px;
    margin-top: 6px;
    font-size: 11px;
    font-weight: 700;
    color: var(--muted);
  }

  .chart-legend-item::before {
    content: "";
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 5px;
    vertical-align: middle;
  }

  .chart-legend-item.you::before {
    background: var(--accent);
  }

  .chart-legend-item.opp::before {
    background: var(--muted);
  }

  .stat-row {
    display: flex;
    width: 100%;
    gap: 8px;
    margin-top: 4px;
  }

  .stat {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    background: var(--card-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 8px 4px;
  }

  .stat-val {
    font-size: 16px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .stat-label {
    font-size: 9.5px;
    font-weight: 700;
    color: var(--muted);
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
</style>
