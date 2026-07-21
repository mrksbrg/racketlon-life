<script lang="ts">
  import type { SaveGame } from "@racketlon/engine";
  import { store } from "./store.svelte";

  let open = $state(false);
  let panel = $state<"root" | "about">("root");
  let fileInput = $state<HTMLInputElement | undefined>(undefined);
  let importError = $state<string | null>(null);

  function openMenu(): void {
    panel = "root";
    importError = null;
    open = true;
  }

  function close(): void {
    open = false;
  }

  function doSave(): void {
    store.exportSave();
    close();
  }

  function doLoad(): void {
    importError = null;
    fileInput?.click();
  }

  async function onFile(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    let parsed: SaveGame;
    try {
      parsed = JSON.parse(await file.text()) as SaveGame;
    } catch {
      importError = "That doesn't look like a save file.";
      return;
    }
    const ok = await store.importSave(parsed);
    if (!ok) {
      importError = "Couldn't load that save — it may be from an incompatible version.";
      return;
    }
    close();
  }

  function doNewGame(): void {
    if (confirm("Start a new career? Your current save will be lost.")) {
      close();
      void store.newGame();
    }
  }
</script>

<button class="hamburger" onclick={openMenu} title="Menu" aria-label="Menu">
  <span></span><span></span><span></span>
</button>

{#if open}
  <button class="backdrop" onclick={close} aria-label="Close menu"></button>
  <div class="sheet" role="dialog" aria-label="Menu">
    <div class="handle"></div>
    {#if panel === "root"}
      <button class="item" onclick={doSave}>Save career</button>
      <button class="item" onclick={doLoad}>Load career</button>
      {#if importError}
        <p class="error">{importError}</p>
      {/if}
      <button class="item" onclick={doNewGame}>New career</button>
      <button class="item" onclick={() => (panel = "about")}>About</button>
      <input bind:this={fileInput} type="file" accept="application/json" class="hidden-input" onchange={onFile} />
    {:else}
      <div class="about">
        <h3>Racketlon Life</h3>
        <p>A career sim about climbing the racketlon rankings — table tennis, badminton, squash and tennis, one week at a time.</p>
        <p class="version">Version 0.1.0</p>
      </div>
      <button class="item" onclick={() => (panel = "root")}>Back</button>
    {/if}
  </div>
{/if}

<style>
  .hamburger {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    width: 32px;
    height: 32px;
    padding: 9px 7px;
  }

  .hamburger span {
    display: block;
    height: 2px;
    border-radius: 1px;
    background: var(--muted);
  }

  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 10;
  }

  .sheet {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: 0;
    width: 100%;
    max-width: 480px;
    background: var(--card);
    border-radius: 16px 16px 0 0;
    border: 1px solid var(--border);
    border-bottom: none;
    padding: 8px 16px calc(16px + env(safe-area-inset-bottom));
    z-index: 11;
  }

  .handle {
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: var(--border);
    margin: 4px auto 10px;
  }

  .item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 13px 4px;
    font-size: 15px;
    font-weight: 600;
    border-bottom: 1px solid var(--border);
  }

  .item:last-of-type {
    border-bottom: none;
  }

  .item:active {
    background: var(--card-2);
  }

  .error {
    color: var(--danger);
    font-size: 12px;
    padding: 6px 4px 0;
  }

  .hidden-input {
    display: none;
  }

  .about h3 {
    font-size: 17px;
    margin-bottom: 8px;
  }

  .about p {
    color: var(--muted);
    font-size: 13px;
    line-height: 1.5;
    margin-bottom: 8px;
  }

  .about .version {
    font-size: 11px;
    color: var(--muted);
    opacity: 0.7;
  }
</style>
