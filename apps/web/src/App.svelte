<script lang="ts">
  import { onMount } from "svelte";
  import CharacterCreate from "./lib/CharacterCreate.svelte";
  import Draw from "./lib/Draw.svelte";
  import Inbox from "./lib/Inbox.svelte";
  import MatchScreen from "./lib/MatchScreen.svelte";
  import Me from "./lib/Me.svelte";
  import OpponentProfile from "./lib/OpponentProfile.svelte";
  import Planner from "./lib/Planner.svelte";
  import Rankings from "./lib/Rankings.svelte";
  import Summary from "./lib/Summary.svelte";
  import Tour from "./lib/Tour.svelte";
  import { store } from "./lib/store.svelte";

  onMount(() => {
    void store.init();
  });
</script>

{#if store.screen === "loading"}
  <div class="center muted">Loading…</div>
{:else if store.screen === "create"}
  <CharacterCreate />
{:else if store.screen === "planner"}
  <Planner />
{:else if store.screen === "tour"}
  <Tour />
{:else if store.screen === "rankings"}
  <Rankings />
{:else if store.screen === "inbox"}
  <Inbox />
{:else if store.screen === "me"}
  <Me />
{:else if store.screen === "simulating"}
  <div class="center">
    <div class="pulse">🏓 🏸 ⚫ 🎾</div>
    <p class="muted">Simulating your week…</p>
  </div>
{:else if store.screen === "summary"}
  <Summary />
{:else if store.screen === "match"}
  <MatchScreen />
{:else if store.screen === "draw"}
  <Draw />
{:else if store.screen === "opponent"}
  <OpponentProfile />
{/if}

<style>
  .center {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  .muted {
    color: var(--muted);
  }

  .pulse {
    font-size: 28px;
    letter-spacing: 6px;
    animation: pulse 0.8s ease-in-out infinite alternate;
  }

  @keyframes pulse {
    from {
      opacity: 0.4;
      transform: scale(0.96);
    }
    to {
      opacity: 1;
      transform: scale(1.04);
    }
  }
</style>
