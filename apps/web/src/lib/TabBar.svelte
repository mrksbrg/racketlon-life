<script lang="ts">
  import { store } from "./store.svelte";
</script>

<nav class="tabbar">
  <button class:active={store.screen === "planner"} onclick={() => store.goToTab("planner")}>Home</button>
  <button class:active={store.screen === "tour"} onclick={() => store.goToTab("tour")}>Tour</button>
  <button class:active={store.screen === "rankings"} onclick={() => store.goToTab("rankings")}>Rankings</button>
  <button class:active={store.screen === "world"} onclick={() => store.goToTab("world")}>World</button>
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
    padding: 12px 2px;
    text-align: center;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--muted);
    white-space: nowrap;
  }

  .tabbar button.active {
    color: var(--accent);
  }

</style>
