<script lang="ts">
  /**
   * Counts up from 0 to `value` on mount — the "Progress Quest" style
   * ticking-number feedback for weekly gains/losses. A fresh instance (keyed
   * by sport in the caller's `{#each}`) re-triggers the count each time the
   * Summary screen appears, so it always reads as "this week's change."
   */
  let {
    value,
    decimals = 0,
    duration = 700,
    signed = false,
  }: {
    value: number;
    decimals?: number;
    duration?: number;
    signed?: boolean;
  } = $props();

  let display = $state(0);

  $effect(() => {
    const target = value;
    const start = performance.now();
    let raf = requestAnimationFrame(function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3; // ease-out cubic
      display = target * eased;
      if (t < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  });

  const text = $derived.by(() => {
    const n = Number(display.toFixed(decimals));
    const sign = signed && n > 0 ? "+" : "";
    return `${sign}${n.toFixed(decimals)}`;
  });
</script>

<span>{text}</span>
