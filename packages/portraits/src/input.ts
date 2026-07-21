import type { PortraitInput, PortraitRecipeOverrides } from "./contracts.js";
import { portraitSeedFor } from "./generate.js";

/** The small, structural player shape needed by the presentation package. */
export interface PortraitPlayerSource {
  playerId: string;
  nationality?: string;
  gender?: "m" | "f";
}

export interface PortraitInputOptions {
  ageYears?: number;
  /** Reviewed entry from the content package's separate cue map. */
  cues?: PortraitRecipeOverrides;
}

/**
 * Bridges imported player content to the stable portrait contract.
 *
 * A world build does not need to persist rendered images. The stable player
 * id produces the same recipe whenever it is requested, and reviewed cues
 * from content override only the explicitly supplied fields.
 */
export function portraitInputForPlayer(
  player: PortraitPlayerSource,
  options: PortraitInputOptions = {},
): PortraitInput {
  const cues = options.cues;
  return {
    playerId: player.playerId,
    portraitSeed: portraitSeedFor(player.playerId),
    ...(options.ageYears === undefined ? {} : { ageYears: options.ageYears }),
    ...(player.gender === undefined ? {} : { gender: player.gender }),
    ...(player.nationality === undefined ? {} : { country: player.nationality }),
    ...(cues === undefined
      ? {}
      : {
          publicCues: {
            ...cues,
            ...(cues.ageMarks === undefined ? {} : { ageMarks: [...cues.ageMarks] }),
            ...(cues.offsets === undefined ? {} : { offsets: { ...cues.offsets } }),
          },
        }),
  };
}
