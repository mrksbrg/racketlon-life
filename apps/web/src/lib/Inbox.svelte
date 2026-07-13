<script lang="ts">
  import type { InboxView } from "@racketlon/engine";
  import { store } from "./store.svelte";
  import { flagEmoji } from "./ui";

  let { embedded = false } = $props<{ embedded?: boolean }>();

  let expanded = $state<string | null>(null);

  const CATEGORY_ICON: Record<InboxView["category"], string> = {
    welcome: "👋",
    invitation: "🎟️",
    ranking: "📊",
    result: "🏆",
    coach: "🧑‍🏫",
    draw: "📋",
  };

  /** Trophy for a title, a plainer note otherwise — a "result" message's icon
   * depends on the outcome, not just its category. */
  function icon(msg: InboxView): string {
    if (msg.category === "result" && !msg.resultWon) return "📋";
    return CATEGORY_ICON[msg.category];
  }

  function open(msg: InboxView) {
    expanded = expanded === msg.id ? null : msg.id;
    if (!msg.read) void store.markRead(msg.id);
  }

  /** The live Tour status for an invitation's tournament, if it's still on the
   * visible schedule — lets us register straight from the mail. */
  function tourStatus(week: number | undefined) {
    if (week === undefined) return null;
    return store.tourEntries.find((e) => e.weekIndex === week) ?? null;
  }

</script>

<main class:embedded>
  <div class="head">
    <div class="title-row">
      {#if !embedded}
        <button class="back" onclick={() => store.closeInbox()}>‹ Back</button>
      {/if}
      <h2>Inbox</h2>
    </div>
    {#if store.unreadCount > 0}
      <button class="mark-all" onclick={() => void store.markAllRead()}>Mark all read</button>
    {/if}
  </div>

  <div class="list">
    {#each store.inbox as msg (msg.id)}
      {@const isOpen = expanded === msg.id}
      <div class="msg" class:unread={!msg.read} class:open={isOpen}>
        <button class="msg-row" onclick={() => open(msg)}>
          <span class="icon">{icon(msg)}</span>
          <div class="msg-main">
            <div class="subject-line">
              {#if !msg.read}<span class="dot" aria-label="Unread"></span>{/if}
              <span class="subject">{msg.subject}</span>
            </div>
            <div class="meta">{msg.from} · {msg.weekLabel}</div>
          </div>
          <span class="chevron" class:rotated={isOpen}>›</span>
        </button>

        {#if isOpen}
          <div class="detail">
            <p class="body">{msg.body}</p>

            {#if msg.category === "ranking"}
              {#each [
                { label: "Men", rows: msg.rankingMen, yourRank: msg.yourRankMen },
                { label: "Women", rows: msg.rankingWomen, yourRank: msg.yourRankWomen },
              ] as section (section.label)}
                {#if section.rows && section.rows.length > 0}
                  <div class="ranking-label">{section.label}</div>
                  <div class="ranking">
                    {#each section.rows as row (row.rank)}
                      <button class="rank-row" class:you={row.isYou} onclick={() => store.viewOpponent(row.playerId)}>
                        <span class="rank">{row.rank}</span>
                        <span class="rank-name">{flagEmoji(row.nationality)} {row.name}</span>
                        <span class="rank-rating">{row.points}</span>
                      </button>
                    {/each}
                    {#if section.yourRank && section.yourRank > section.rows.length}
                      <div class="rank-row you outside">
                        <span class="rank">{section.yourRank}</span>
                        <span class="rank-name">You</span>
                        <span class="rank-rating"></span>
                      </div>
                    {/if}
                  </div>
                {/if}
              {/each}
            {/if}

            {#if msg.category === "invitation" && msg.tournamentWeek !== undefined}
              {@const entry = tourStatus(msg.tournamentWeek)}
              <div class="actions">
                {#if entry?.status === "registered"}
                  <span class="registered">Registered ✓</span>
                {:else if entry?.status === "open"}
                  <button class="register" onclick={() => void store.registerForTournament(msg.tournamentWeek!)}>
                    Register ▸
                  </button>
                {:else}
                  <button class="view" onclick={() => store.goToTab("tour")}>View on Tour ▸</button>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {:else}
      <p class="empty">No messages yet.</p>
    {/each}
  </div>
</main>

<style>
  main {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  main.embedded {
    flex: initial;
    overflow: visible;
    padding: 0;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .back {
    color: var(--accent);
    font-size: 13px;
    font-weight: 700;
  }

  h2 {
    font-size: 19px;
  }

  .mark-all {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--accent);
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .msg {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }

  .msg.unread {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  }

  .msg-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 12px 14px;
    text-align: left;
  }

  .icon {
    font-size: 18px;
    flex-shrink: 0;
  }

  .msg-main {
    flex: 1;
    min-width: 0;
  }

  .subject-line {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
    flex-shrink: 0;
  }

  .subject {
    font-weight: 700;
    font-size: 14px;
  }

  .unread .subject {
    color: var(--text);
  }

  .msg:not(.unread) .subject {
    color: var(--muted);
    font-weight: 600;
  }

  .meta {
    font-size: 12px;
    color: var(--muted);
    margin-top: 2px;
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
    padding: 0 14px 14px;
  }

  .body {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--text);
  }

  .ranking-label {
    margin-top: 12px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }

  .ranking {
    margin-top: 4px;
    border-top: 1px solid var(--border);
    padding-top: 8px;
  }

  .rank-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 0;
    font-size: 13.5px;
    width: 100%;
    text-align: left;
  }

  .rank-row + .rank-row {
    border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  }

  .rank-row.you {
    color: var(--accent);
    font-weight: 700;
  }

  .rank-row.outside {
    border-top: 1px dashed var(--border);
    margin-top: 2px;
  }

  .rank {
    width: 24px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .rank-row.you .rank {
    color: var(--accent);
  }

  .rank-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rank-rating {
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }

  .rank-row.you .rank-rating {
    color: var(--accent);
  }

  .actions {
    margin-top: 12px;
  }

  .register,
  .view {
    background: var(--accent);
    color: #fff;
    font-weight: 700;
    font-size: 13px;
    border-radius: 8px;
    padding: 9px 16px;
  }

  .view {
    background: var(--card-2);
    color: var(--text);
    border: 1px solid var(--border);
  }

  .registered {
    color: var(--ok);
    font-weight: 700;
    font-size: 13px;
  }

  .empty {
    color: var(--muted);
    font-size: 13px;
    text-align: center;
    padding: 24px 0;
  }
</style>
