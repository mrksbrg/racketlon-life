export interface PortraitCues {
  head?: string;
  skinPalette?: string;
  hair?: string;
  hairPalette?: string;
  eyes?: string;
  brows?: string;
  nose?: string;
  mouth?: string;
  facialHair?: string | null;
  accessory?: string | null;
  ageMarks?: string[];
}

export type PortraitCueMap = Record<string, PortraitCues>;

/** Fails a rebuild when a manual override no longer matches the imported roster. */
export function validatePortraitCuePlayerIds(
  cuesByPlayerId: Readonly<PortraitCueMap>,
  players: readonly { playerId: string }[],
): void {
  const playerIds = new Set(players.map((player) => player.playerId));
  const unknownIds = Object.keys(cuesByPlayerId).filter((playerId) => !playerIds.has(playerId)).sort();
  if (unknownIds.length > 0) {
    throw new Error(`Portrait cues reference players missing from the imported roster: ${unknownIds.join(", ")}`);
  }
}

/** Prevents a reviewed cue from being put in the wrong gender-specific file. */
export function validatePortraitCuePlayerGender(
  cuesByPlayerId: Readonly<PortraitCueMap>,
  players: readonly { playerId: string; gender: "m" | "f" }[],
  expectedGender: "m" | "f",
): void {
  const playersById = new Map(players.map((player) => [player.playerId, player]));
  const wrongGenderIds = Object.keys(cuesByPlayerId)
    .filter((playerId) => {
      const player = playersById.get(playerId);
      return player !== undefined && player.gender !== expectedGender;
    })
    .sort();

  if (wrongGenderIds.length > 0) {
    const fileLabel = expectedGender === "m" ? "men" : "women";
    throw new Error(`Portrait cues in the ${fileLabel} file reference the wrong gender: ${wrongGenderIds.join(", ")}`);
  }
}

/** Combines separately maintained cue maps without silently overwriting an ID. */
export function mergePortraitCueMaps(...cueMaps: Readonly<PortraitCueMap>[]): PortraitCueMap {
  const merged: PortraitCueMap = {};
  for (const cueMap of cueMaps) {
    for (const [playerId, cues] of Object.entries(cueMap)) {
      if (playerId in merged) {
        throw new Error(`Portrait cues contain the same player in more than one file: ${playerId}`);
      }
      merged[playerId] = cues;
    }
  }
  return merged;
}
