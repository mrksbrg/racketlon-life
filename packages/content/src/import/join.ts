/**
 * Joins the scraper's rating rows with players.csv into one record per rated
 * player, bridging the format gaps to the game model:
 *  - the data's `te` (tennis) column becomes the game's `tn` key;
 *  - the derivable `cons` column (= rating − 2·rd) is dropped;
 *  - gender comes from *which ratings file* a row is in, not any column: the
 *    men's file leaves the gender cell blank for ~22% of rows (and players.csv
 *    is sometimes blank too), whereas the file split is authoritative;
 *  - birth_year is looked up from players.csv (present for ~53%, null otherwise);
 *  - firPoints (real FIR ranking points, for tournament division placement —
 *    NOT the in-game Layer 3 accumulator, see docs/07) is a two-hop bridge:
 *    ranking_players.csv.guid → players.csv.guid → players.csv.player_id.
 *    Sourced from the `points` column specifically, not `total_points` —
 *    `rank` is empirically sorted by `points`. A ranking row whose guid
 *    doesn't resolve (~4.7% of the file) is skipped; most rated players
 *    simply never appear in ranking_players.csv at all (no FIR-counted
 *    result yet) and get `firPoints: null`, same as a missing birth year.
 */

/** Game sport key → the scraper's per-sport column prefix (note te→tn). */
const SPORT_PREFIX: Record<"tt" | "bd" | "sq" | "tn", string> = {
  tt: "tt",
  bd: "bd",
  sq: "sq",
  tn: "te",
};

export type GameSport = keyof typeof SPORT_PREFIX;
export const GAME_SPORTS: GameSport[] = ["tt", "bd", "sq", "tn"];

/** A raw per-sport rating from the scraper, or null when that sport is unrated. */
export interface SportRating {
  rating: number;
  rd: number;
  games: number;
}

export interface JoinedPlayer {
  playerId: string;
  displayName: string;
  countryIOC: string;
  gender: "m" | "f";
  birthYear: number | null;
  /** per game-sport rating; null where the scraper had no data for that sport */
  perSport: Record<GameSport, SportRating | null>;
  /** real FIR ranking points (the `points` column), via the guid bridge; null
   * if this player has no FIR-counted result yet */
  firPoints: number | null;
  /** the scraper's `endurance` column — a sport-profile-derived estimate
   * (squash-strong-relative-to-own-ratings reads high, table-tennis strong
   * reads low), roughly in [-0.45, 0.45]. Defaults to 0 (neutral) if the
   * column is missing or blank — additive field, older CSVs without it
   * shouldn't fail the build. */
  endurance: number;
}

function num(value: string, context: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Expected a number for ${context}, got "${value}"`);
  return n;
}

/** Soft parse for the additive `endurance` column — blank, missing, or
 * malformed all default to 0 (neutral) rather than failing the build. */
function readEndurance(row: Record<string, string>): number {
  const n = Number(row.endurance ?? "");
  return Number.isFinite(n) ? n : 0;
}

function readSport(row: Record<string, string>, prefix: string, playerId: string): SportRating | null {
  const rating = row[`${prefix}_rating`] ?? "";
  const rd = row[`${prefix}_rd`] ?? "";
  const games = row[`${prefix}_games`] ?? "";
  // an unrated sport leaves all cells blank — treat as missing, not an error
  if (rating === "" && rd === "" && games === "") return null;
  return {
    rating: num(rating, `${playerId} ${prefix}_rating`),
    rd: num(rd, `${playerId} ${prefix}_rd`),
    games: num(games, `${playerId} ${prefix}_games`),
  };
}

/** One ratings file's rows, tagged with the gender that file represents. */
export interface RatingGroup {
  gender: "m" | "f";
  rows: Record<string, string>[];
}

/**
 * @param groups      each ratings file's rows + the gender it represents
 *                    (gender is taken from the file, not any column)
 * @param playerRows  players.csv rows (for birth_year and the guid bridge)
 * @param rankingRows ranking_players.csv rows (for firPoints); omit if not importing rankings
 */
export function joinPlayers(
  groups: RatingGroup[],
  playerRows: Record<string, string>[],
  rankingRows: Record<string, string>[] = [],
): JoinedPlayer[] {
  const birthYearById = new Map<string, number>();
  const playerIdByGuid = new Map<string, string>();
  for (const p of playerRows) {
    const id = p.player_id;
    const by = p.birth_year;
    if (id && by && by !== "") birthYearById.set(id, num(by, `${id} birth_year`));
    if (id && p.guid) playerIdByGuid.set(p.guid.toUpperCase(), id);
  }

  const firPointsById = new Map<string, number>();
  for (const r of rankingRows) {
    const playerId = playerIdByGuid.get((r.guid ?? "").toUpperCase());
    if (!playerId || !r.points) continue; // guid not found in players.csv — skip, don't error
    firPointsById.set(playerId, num(r.points, `ranking guid ${r.guid} points`));
  }

  const out: JoinedPlayer[] = [];
  for (const { gender, rows } of groups) {
    for (const row of rows) {
      const playerId = row.player_id;
      if (!playerId) throw new Error(`Rating row missing player_id: ${JSON.stringify(row)}`);
      const perSport = {} as Record<GameSport, SportRating | null>;
      for (const sport of GAME_SPORTS) perSport[sport] = readSport(row, SPORT_PREFIX[sport], playerId);
      out.push({
        playerId,
        displayName: row.display_name ?? playerId,
        countryIOC: row.country ?? "",
        gender,
        birthYear: birthYearById.get(playerId) ?? null,
        perSport,
        firPoints: firPointsById.get(playerId) ?? null,
        endurance: readEndurance(row),
      });
    }
  }
  return out;
}
