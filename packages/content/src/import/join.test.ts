import { describe, expect, it } from "vitest";
import { joinPlayers } from "./join.js";

const menRow = (overrides: Partial<Record<string, string>> = {}) => ({
  player_id: "name:test-player:GER",
  display_name: "Test Player",
  country: "GER",
  gender: "",
  tt_rating: "1500",
  tt_rd: "150",
  tt_cons: "1200",
  tt_games: "10",
  bd_rating: "1400",
  bd_rd: "150",
  bd_cons: "1100",
  bd_games: "10",
  sq_rating: "1300",
  sq_rd: "150",
  sq_cons: "1000",
  sq_games: "10",
  te_rating: "",
  te_rd: "",
  te_cons: "",
  te_games: "",
  stamina: "0.12",
  ...overrides,
});

describe("joinPlayers", () => {
  it("takes gender from the file group, not any column (men's file often leaves gender blank)", () => {
    const [p] = joinPlayers([{ gender: "m", rows: [menRow()] }], []);
    expect(p!.gender).toBe("m");
  });

  it("remaps the te column to the tn sport key", () => {
    const [p] = joinPlayers(
      [{ gender: "m", rows: [menRow({ te_rating: "1450", te_rd: "160", te_games: "5" })] }],
      [],
    );
    expect(p!.perSport.tn).toEqual({ rating: 1450, rd: 160, games: 5 });
  });

  it("treats an all-blank sport block as unrated (null), not zero", () => {
    const [p] = joinPlayers([{ gender: "m", rows: [menRow()] }], []);
    expect(p!.perSport.tn).toBeNull();
    expect(p!.perSport.tt).toEqual({ rating: 1500, rd: 150, games: 10 });
  });

  it("looks up birth_year from players.csv by player_id, defaulting to null", () => {
    const rows = [menRow({ player_id: "a" }), menRow({ player_id: "b" })];
    const [a, b] = joinPlayers(
      [{ gender: "m", rows }],
      [{ player_id: "a", birth_year: "1990" }, { player_id: "b", birth_year: "" }],
    );
    expect(a!.birthYear).toBe(1990);
    expect(b!.birthYear).toBeNull();
  });

  it("throws on a row with no player_id", () => {
    expect(() => joinPlayers([{ gender: "m", rows: [menRow({ player_id: "" })] }], [])).toThrow();
  });

  it("bridges firPoints via ranking_players.csv.guid -> players.csv.guid -> player_id", () => {
    const rows = [menRow({ player_id: "a" })];
    const playerRows = [{ player_id: "a", guid: "ABCD-1234" }];
    const rankingRows = [{ guid: "abcd-1234", points: "9500", total_points: "12000" }];
    const [p] = joinPlayers([{ gender: "m", rows }], playerRows, rankingRows);
    expect(p!.firPoints).toBe(9500); // uses points, not total_points; guid match is case-insensitive
  });

  it("defaults firPoints to null when the ranking guid doesn't resolve, or no ranking data is given", () => {
    const rows = [menRow({ player_id: "a" })];
    const playerRows = [{ player_id: "a", guid: "ABCD-1234" }];
    const [unranked] = joinPlayers([{ gender: "m", rows }], playerRows, [{ guid: "OTHER-GUID", points: "100" }]);
    expect(unranked!.firPoints).toBeNull();
    const [noRankingArg] = joinPlayers([{ gender: "m", rows }], playerRows);
    expect(noRankingArg!.firPoints).toBeNull();
  });

  it("reads the stamina column as endurance", () => {
    const [p] = joinPlayers([{ gender: "m", rows: [menRow({ stamina: "0.337" })] }], []);
    expect(p!.endurance).toBe(0.337);
  });

  it("defaults endurance to 0 when the stamina column is missing or blank", () => {
    const [blank] = joinPlayers([{ gender: "m", rows: [menRow({ stamina: "" })] }], []);
    expect(blank!.endurance).toBe(0);
    const { stamina: _omit, ...rowWithoutStamina } = menRow();
    const [missing] = joinPlayers([{ gender: "m", rows: [rowWithoutStamina] }], []);
    expect(missing!.endurance).toBe(0);
  });
});
