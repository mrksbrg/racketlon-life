import { describe, expect, it } from "vitest";
import { iocToIso2 } from "./countryMap.js";

describe("iocToIso2", () => {
  it("maps common IOC codes to ISO-2", () => {
    expect(iocToIso2("GER")).toBe("DE");
    expect(iocToIso2("GBR")).toBe("GB");
    expect(iocToIso2("SUI")).toBe("CH");
    expect(iocToIso2("SWE")).toBe("SE");
    expect(iocToIso2("RSA")).toBe("ZA");
  });

  it("maps all three UK constituent-nation codes to GB", () => {
    expect(iocToIso2("ENG")).toBe("GB");
    expect(iocToIso2("SCO")).toBe("GB");
    expect(iocToIso2("NIR")).toBe("GB");
  });

  it("is case-insensitive", () => {
    expect(iocToIso2("ger")).toBe("DE");
  });

  it("returns undefined for an unrecognised code", () => {
    expect(iocToIso2("ZZZ")).toBeUndefined();
  });
});
