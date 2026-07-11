import { describe, expect, it } from "vitest";
import { parseCsv } from "./parse.js";

describe("parseCsv", () => {
  it("parses headers and rows into keyed objects", () => {
    const rows = parseCsv("a,b,c\n1,2,3\n4,5,6\n");
    expect(rows).toEqual([
      { a: "1", b: "2", c: "3" },
      { a: "4", b: "5", c: "6" },
    ]);
  });

  it("handles blank cells and trailing blank lines", () => {
    const rows = parseCsv("a,b\n1,\n\n");
    expect(rows).toEqual([{ a: "1", b: "" }]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });
});
