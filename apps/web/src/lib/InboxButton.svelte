<script lang="ts">
  import { store } from "./store.svelte";
</script>

<button class="inbox" class:unread={store.unreadCount > 0} onclick={() => store.openInbox()} title="Open inbox">
  <span class="envelope">✉</span>
  <span class="label">Inbox</span>
  {#if store.unreadCount > 0}
    <span class="badge">{store.unreadCount > 9 ? "9+" : store.unreadCount}</span>
  {/if}
</button>

<style>
  .inbox {
    position: relative;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 11px;
    border-radius: 999px;
    background: var(--card-2);
    border: 1px solid var(--border);
    color: var(--muted);
    font-size: 12px;
    font-weight: 700;
  }

  .envelope {
    font-size: 15px;
    line-height: 1;
  }

  .label {
    line-height: 1;
  }

  .inbox.unread {
    background: color-mix(in srgb, var(--accent) 24%, var(--card));
    border-color: var(--accent);
    color: var(--text);
    animation: nudge 1.8s ease-in-out infinite;
  }

  .badge {
    position: absolute;
    top: -6px;
    right: -6px;
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
    border-radius: 999px;
    background: var(--danger);
    color: #fff;
    font-size: 10px;
    font-weight: 800;
    line-height: 17px;
    text-align: center;
  }

  @keyframes nudge {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.06);
    }
  }
</style>
