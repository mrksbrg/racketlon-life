<script lang="ts">
  import type { DivisionCode, TourEntry } from "@racketlon/engine";
  import SeasonCalendar from "./SeasonCalendar.svelte";
  import StatusBar from "./StatusBar.svelte";
  import TabBar from "./TabBar.svelte";
  import { store } from "./store.svelte";
  import { flagEmoji, formatFieldStanding, formatMoney } from "./ui";

  let selected = $state<number | null>(null);
  // per-week class pick, defaulting to whatever entry.tournament.division
  // already is (the human's own class, or the actually-registered one)
  let chosenDivision = $state<Record<number, DivisionCode>>({});

  function selectWeek(weekIndex: number) {
    selected = selected === weekIndex ? null : weekIndex;
  }

  const selectedEntry = $derived(
    selected !== null ? (store.tourEntries.find((e) => e.weekIndex === selected) ?? null) : null,
  );

  function divisionFor(entry: TourEntry): DivisionCode {
    return chosenDivision[entry.weekIndex] ?? entry.tournament.division;
  }

  function choiceFor(entry: TourEntry) {
    return entry.eligibleDivisions.find((c) => c.def.division === divisionFor(entry)) ?? entry.eligibleDivisions[0]!;
  }

  const STATUS_LABEL = { open: "Open", registered: "Registered", closed: "Entry closed" };
</script>

<StatusBar />

<main>
  <h2>World tour</h2>
  <p class="sub">Register at least two weeks ahead — entry closes after that</p>

  <SeasonCalendar
    entries={store.tourEntries}
    injurySpan={store.injurySpan}
    trainedWeeks={store.trainedWeeks}
    weekIndex={store.weekIndex}
    onSelectWeek={selectWeek}
  />

  {#if selectedEntry}
    {@const entry = selectedEntry}
    {@const t = entry.tournament}
    {@const canPlayNow = entry.isThisWeek && store.registeredTournamentThisWeek}
    {@const choice = choiceFor(entry)}
    {@const canPick = entry.status !== "closed"}
    <div class="card" class:this-week={entry.isThisWeek} class:registered={entry.status === "registered"}>
      <div class="detail-head">
        <div class="info">
          <div class="name-line">
            <span class="name">🏆 {t.name}</span>
            <span class="tier">{t.tier}</span>
            <span
              class="badge"
              class:open={entry.status === "open"}
              class:registered={entry.status === "registered"}
              class:closed={entry.status === "closed"}
            >
              {STATUS_LABEL[entry.status]}
            </span>
          </div>
          <div class="week">{flagEmoji(t.country)} {t.city} · {entry.weekLabel}</div>
        </div>
        <button class="close" onclick={() => (selected = null)} aria-label="Close">✕</button>
      </div>

      <div class="detail">
        {#if entry.eligibleDivisions.length > 1}
          <div class="classes">
            {#each entry.eligibleDivisions as c (c.def.division)}
              <button
                class="class-opt"
                class:selected={choice.def.division === c.def.division}
                disabled={!canPick}
                onclick={() => (chosenDivision = { ...chosenDivision, [entry.weekIndex]: c.def.division })}
              >
                <span class="class-div">Class {c.def.division}</span>
                <span class="class-hint">{c.def.division === entry.eligibleDivisions[0]!.def.division ? "your level" : "play up"}</span>
              </button>
            {/each}
          </div>
        {/if}
        <div class="detail-row">
          <span>Entry fee</span>
          <span>{formatMoney(choice.def.entryFee)}</span>
        </div>
        <div class="detail-row">
          <span>Field size</span>
          <span>{choice.def.fieldSize} players</span>
        </div>
        <div class="detail-row">
          <span>Prize money</span>
          <span>{formatMoney(choice.def.prizeByRoundsWon[choice.def.prizeByRoundsWon.length - 1] ?? 0)} to win it</span>
        </div>
        {#if entry.travelCost.total > 0}
          <div class="detail-row">
            <span>Flights</span>
            <span>{formatMoney(entry.travelCost.flight)}</span>
          </div>
          <div class="detail-row">
            <span>Hotel & food ({t.nights}n)</span>
            <span>{formatMoney(entry.travelCost.stay)}</span>
          </div>
          <div class="detail-row total">
            <span>Total to play</span>
            <span>{formatMoney(choice.def.entryFee + entry.travelCost.total)}</span>
          </div>
        {:else}
          <div class="detail-row">
            <span>Travel</span>
            <span class="domestic">Domestic — no travel cost</span>
          </div>
        {/if}
        <div class="field">
          <div class="field-label">Field ({choice.entrants.length + 1} entered)</div>
          <div class="field-you">You</div>
          {#each choice.entrants as opp (opp.id)}
            <button class="field-row" onclick={() => store.viewOpponent(opp.id)}>
              <span>{opp.name}</span>
              <span class="field-rating">{formatFieldStanding(opp)}</span>
            </button>
          {:else}
            {#if choice.def.division !== entry.eligibleDivisions[0]!.def.division}
              <p class="field-empty">No confirmed entrants for this class yet.</p>
            {/if}
          {/each}
        </div>
      </div>

      {#if entry.status !== "closed"}
        <div class="actions">
          {#if entry.status === "open"}
            <button class="enter" onclick={() => void store.registerForTournament(entry.weekIndex, divisionFor(entry))}>Register ▸</button>
          {:else}
            <button class="skip" onclick={() => void store.withdrawRegistration(entry.weekIndex)}>Withdraw</button>
            {#if divisionFor(entry) !== t.division}
              <button class="enter" onclick={() => void store.registerForTournament(entry.weekIndex, divisionFor(entry))}>Switch class ▸</button>
            {:else if canPlayNow}
              <button class="enter" onclick={() => store.enterTournament()}>Play now ▸</button>
            {/if}
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</main>

<TabBar />

<style>
  main {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  h2 {
    font-size: 19px;
  }

  .sub {
    color: var(--muted);
    margin: 2px 0 0;
    font-size: 13px;
  }

  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    overflow: hidden;
  }

  .card.this-week {
    border-color: var(--accent);
  }

  .card.registered {
    border-color: var(--ok);
  }

  .detail-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    padding: 14px 14px 0;
  }

  .info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: left;
  }

  .close {
    flex-shrink: 0;
    color: var(--muted);
    font-size: 16px;
    padding: 2px 4px;
  }

  .name-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
  }

  .name {
    font-weight: 700;
    font-size: 14.5px;
  }

  .week {
    color: var(--muted);
    font-size: 12.5px;
  }

  .tier {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.03em;
    padding: 2px 6px;
    border-radius: 5px;
    background: color-mix(in srgb, var(--accent) 16%, var(--card));
    color: var(--accent);
    flex-shrink: 0;
  }

  .badge {
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--card-2);
    color: var(--muted);
  }

  .badge.open {
    background: color-mix(in srgb, var(--accent) 22%, var(--card));
    color: var(--accent);
  }

  .badge.registered {
    background: color-mix(in srgb, var(--ok) 20%, var(--card));
    color: var(--ok);
  }

  .badge.closed {
    background: color-mix(in srgb, var(--danger) 16%, var(--card));
    color: var(--danger);
  }

  .detail {
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: var(--muted);
  }

  .detail-row span:last-child {
    color: var(--text);
    font-weight: 600;
  }

  .detail-row.total {
    margin-top: 2px;
    padding-top: 6px;
    border-top: 1px solid var(--border);
  }

  .detail-row.total span:last-child {
    color: var(--accent);
    font-weight: 800;
  }

  .detail-row .domestic {
    color: var(--ok);
    font-weight: 600;
  }

  .classes {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
  }

  .class-opt {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    background: var(--card-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 8px 6px;
  }

  .class-opt.selected {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 16%, var(--card-2));
  }

  .class-opt:disabled {
    opacity: 0.5;
  }

  .class-div {
    font-weight: 700;
    font-size: 13px;
  }

  .class-hint {
    font-size: 10.5px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .class-opt.selected .class-hint {
    color: var(--accent);
  }

  .field-empty {
    color: var(--muted);
    font-size: 12.5px;
    font-style: italic;
    padding: 4px 0;
  }

  .field {
    margin-top: 8px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }

  .field-label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--muted);
    margin-bottom: 6px;
  }

  .field-you,
  .field-row {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    padding: 3px 0;
  }

  .field-row {
    width: 100%;
    text-align: left;
  }

  .field-you {
    color: var(--accent);
    font-weight: 600;
  }

  .field-rating {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .actions {
    display: flex;
    gap: 8px;
    padding: 0 14px 14px;
  }

  .skip {
    background: transparent;
    color: var(--muted);
    font-size: 13px;
    font-weight: 600;
    padding: 8px 10px;
  }

  .enter {
    flex: 1;
    background: var(--accent);
    color: white;
    font-weight: 700;
    font-size: 13px;
    border-radius: 8px;
    padding: 8px 14px;
  }
</style>
