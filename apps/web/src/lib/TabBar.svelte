<script lang="ts">
  import { store } from "./store.svelte";
</script>

<nav class="tabbar">
  <button class:active={store.screen === "planner"} onclick={() => store.goToTab("planner")}>Plan</button>
  <button class:active={store.screen === "tour"} onclick={() => store.goToTab("tour")}>Tour</button>
  <button class="inbox-tab" class:active={store.screen === "inbox"} onclick={() => store.goToTab("inbox")}>
    <span class="envelope">
      ✉
      {#if store.unreadCount > 0}
        <span class="badge">{store.unreadCount > 9 ? "9+" : store.unreadCount}</span>
      {/if}
    </span>
    Inbox
  </button>
  <button class:active={store.screen === "me"} onclick={() => store.goToTab("me")}>Me</button>
</nav>

<style>
  .tabbar {
    display: flex;
    border-top: 1px solid var(--border);
    background: var(--card);
    padding-bottom: env(safe-area-inset-bottom);
  }

  .tabbar button {
    flex: 1;
    padding: 12px 0;
    text-align: center;
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
  }

  .tabbar button.active {
    color: var(--accent);
  }

  .inbox-tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
  }

  .envelope {
    position: relative;
    font-size: 15px;
    line-height: 1;
  }

  .badge {
    position: absolute;
    top: -6px;
    left: 10px;
    min-width: 15px;
    height: 15px;
    padding: 0 3px;
    box-sizing: border-box;
    border-radius: 999px;
    background: var(--danger);
    color: #fff;
    font-size: 9px;
    font-weight: 800;
    line-height: 15px;
    text-align: center;
  }
</style>
