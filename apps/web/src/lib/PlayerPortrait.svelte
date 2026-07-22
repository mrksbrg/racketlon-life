<script lang="ts">
  import {
    portraitSeedFor,
    type PortraitRecipeOverrides,
  } from "@racketlon/portraits";
  import { appPortraitProvider } from "./portraitProvider";

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

  const portrait = $derived.by(() => {
    const recipe = appPortraitProvider.recipeFor({
      playerId,
      portraitSeed: portraitSeed ?? portraitSeedFor(playerId),
      ...(ageYears === undefined ? {} : { ageYears }),
      ...(gender === undefined ? {} : { gender }),
      ...(country === undefined ? {} : { country }),
      ...(cues === undefined ? {} : { publicCues: cues }),
    });
    const assetUrl = appPortraitProvider.assetUrlFor?.(recipe);
    return {
      assetUrl,
      svg: assetUrl === undefined ? (appPortraitProvider.render?.(recipe) ?? "") : "",
    };
  });
</script>

<div
  class="portrait"
  role={label === undefined ? undefined : "img"}
  aria-label={label}
  data-renderer={portrait.assetUrl === undefined ? "procedural" : "authored"}
>
  {#if portrait.assetUrl !== undefined}
    <img src={portrait.assetUrl} alt="" aria-hidden="true" draggable="false" decoding="async" />
  {:else}
    {@html portrait.svg}
  {/if}
</div>

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
    image-rendering: pixelated;
  }

  .portrait img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
