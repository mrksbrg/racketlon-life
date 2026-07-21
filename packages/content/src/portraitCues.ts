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
