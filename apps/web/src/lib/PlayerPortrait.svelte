<script lang="ts">
  import {
    defaultPortraitProvider,
    portraitSeedFor,
    type PortraitRecipeOverrides,
  } from "@racketlon/portraits";

  interface Props {
    playerId: string;
    ageYears?: number;
    gender?: "m" | "f";
    country?: string;
    cues?: PortraitRecipeOverrides;
    portraitSeed?: string;
    label?: string;
  }

  let { playerId, ageYears, gender, country, cues, portraitSeed, label }: Props = $props();

  const svg = $derived.by(() => {
    const recipe = defaultPortraitProvider.recipeFor({
      playerId,
      portraitSeed: portraitSeed ?? portraitSeedFor(playerId),
      ...(ageYears === undefined ? {} : { ageYears }),
      ...(gender === undefined ? {} : { gender }),
      ...(country === undefined ? {} : { country }),
      ...(cues === undefined ? {} : { publicCues: cues }),
    });
    return defaultPortraitProvider.render?.(recipe) ?? "";
  });
</script>

<div class="portrait" role={label === undefined ? undefined : "img"} aria-label={label}>{@html svg}</div>

<style>
  .portrait {
    width: 100%;
    height: 100%;
    overflow: hidden;
    border-radius: inherit;
  }

  .portrait :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
