<script lang="ts">
  import { defaultContent } from "@racketlon/content";
  import type { ActivityType } from "@racketlon/engine";
  import { ACTIVITY_TYPES, DAYS, PERIODS } from "@racketlon/engine";
  import { ACTIVITY_COLORS } from "./ui";

  let {
    slotIndex,
    onpick,
    onclose,
  }: {
    slotIndex: number;
    onpick: (activity: ActivityType) => void;
    onclose: () => void;
  } = $props();

  const day = $derived(DAYS[Math.floor(slotIndex / PERIODS.length)]);
  const period = $derived(PERIODS[slotIndex % PERIODS.length]);

  function hint(type: ActivityType): string {
    const def = defaultContent.activities[type];
    const parts: string[] = [];
    if (def.trainingBase) parts.push("skill +");
    if (def.fatigue > 0) parts.push("⚡+");
    if (def.fatigue < 0) parts.push("⚡−");
    if (def.money > 0) parts.push("€+");
    if (def.money < 0) parts.push("€−");
    return parts.join("  ");
  }
</script>

<button class="backdrop" onclick={onclose} aria-label="Close picker"></button>
<div class="sheet" role="dialog" aria-label="Choose activity">
  <div class="handle"></div>
  <h3>{day} {period}</h3>
  <div class="grid">
    {#each ACTIVITY_TYPES as type (type)}
      <button class="option" onclick={() => onpick(type)}>
        <span class="dot" style:background={ACTIVITY_COLORS[type]}></span>
        <span class="label">{defaultContent.activities[type].label}</span>
        <span class="hint">{hint(type)}</span>
      </button>
    {/each}
  </div>
</div>

<style>
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

  h3 {
    font-size: 14px;
    color: var(--muted);
    margin-bottom: 10px;
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .option {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--card-2);
    border-radius: 10px;
    padding: 11px 12px;
    text-align: left;
  }

  .option:active {
    background: var(--border);
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .label {
    font-size: 14px;
    font-weight: 600;
    flex: 1;
  }

  .hint {
    font-size: 10.5px;
    color: var(--muted);
    white-space: nowrap;
  }
</style>
