<script lang="ts">
  import StatusBar from "./StatusBar.svelte";
  import TabBar from "./TabBar.svelte";
  import { store } from "./store.svelte";
  import { flagEmoji, formatMoney } from "./ui";

  let expanded = $state<number | null>(null);

  function toggle(weekIndex: number) {
    expanded = expanded === weekIndex ? null : weekIndex;
  }

  const STATUS_LABEL = { open: "Open", registered: "Registered", closed: "Entry closed" };
</script>

<StatusBar />

<main>
  <h2>World tour</h2>
  <p class="sub">Register at least two weeks ahead — entry closes after that</p>

  <div class="list">
    {#each store.tourEntries as entry (entry.weekIndex)}
      {@const t = entry.tournament}
      {@const canPlayNow = entry.isThisWeek && store.registeredTournamentThisWeek}
      <div class="card" class:this-week={entry.isThisWeek} class:registered={entry.status === "registered"}>
        <button class="row" onclick={() => toggle(entry.weekIndex)}>
          <div class="info">
            <div class="name-line">
              <span class="name">🏆 {t.name}</span>
              <span class="tier">{t.tier}</span>
              <span class="badge" class:open={entry.status === "open"} class:registered={entry.status === "registered"} class:closed={entry.status === "closed"}>
                {STATUS_LABEL[entry.status]}
              </span>
            </div>
            <div class="week">{flagEmoji(t.country)} {t.city} · {entry.weekLabel}</div>
          </div>
          <span class="chevron" class:rotated={expanded === entry.weekIndex}>›</span>
        </button>

        {#if expanded === entry.weekIndex}
          <div class="detail">
            <div class="detail-row">
              <span>Entry fee</span>
              <span>{formatMoney(t.entryFee)}</span>
            </div>
            <div class="detail-row">
              <span>Field size</span>
              <span>{t.fieldSize} players</span>
            </div>
            <div class="detail-row">
              <span>Prize money</span>
              <span>{formatMoney(t.prizeByRoundsWon[t.prizeByRoundsWon.length - 1] ?? 0)} to win it</span>
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
                <span>{formatMoney(t.entryFee + entry.travelCost.total)}</span>
              </div>
            {:else}
              <div class="detail-row">
                <span>Travel</span>
                <span class="domestic">Domestic — no travel cost</span>
              </div>
            {/if}
            <div class="field">
              <div class="field-label">Field ({entry.entrants.length + 1} entered)</div>
              <div class="field-you">You</div>
              {#each entry.entrants as opp (opp.id)}
                <div class="field-row">
                  <span>{opp.name}</span>
                  <span class="field-rating">{opp.rating}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if entry.status !== "closed"}
          <div class="actions">
            {#if entry.status === "open"}
              <button class="enter" onclick={() => void store.registerForTournament(entry.weekIndex)}>Register ▸</button>
            {:else}
              <button class="skip" onclick={() => void store.withdrawRegistration(entry.weekIndex)}>Withdraw</button>
              {#if canPlayNow}
                <button class="enter" onclick={() => store.enterTournament()}>Play now ▸</button>
              {/if}
            {/if}
          </div>
        {/if}
      </div>
    {:else}
      <p class="empty">No tournaments on the calendar yet.</p>
    {/each}
  </div>
</main>

<TabBar />

<style>
  main {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  h2 {
    font-size: 19px;
  }

  .sub {
    color: var(--muted);
    margin: 2px 0 16px;
    font-size: 13px;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 10px;
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

  .row {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 14px;
  }

  .info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: left;
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

  .chevron {
    color: var(--muted);
    font-size: 20px;
    transition: transform 0.15s;
    flex-shrink: 0;
  }

  .chevron.rotated {
    transform: rotate(90deg);
  }

  .detail {
    padding: 0 14px 12px;
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

  .empty {
    color: var(--muted);
    font-size: 13px;
    text-align: center;
    padding: 24px 0;
  }
</style>
