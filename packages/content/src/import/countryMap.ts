/**
 * IOC 3-letter → ISO 3166-1 alpha-2 country codes. The FIR scraper emits IOC
 * codes (FRA/GER/GBR/SUI…); the game model uses ISO-2 (FR/DE/GB/CH…) for
 * `flagEmoji` and the human's travel home-country. Covers every code seen in
 * the current dataset (54). The UK constituent nations (ENG/SCO/NIR) all map
 * to GB, matching the game's single GB nationality.
 *
 * An unmapped code returns `undefined` so the build can fail loud (a bad code
 * must never silently become an invalid 2-letter nationality) — see buildBundle.
 */
const IOC_TO_ISO2: Record<string, string> = {
  AFG: "AF", AUS: "AU", AUT: "AT", BEL: "BE", BLR: "BY", BRA: "BR", BUL: "BG",
  CAN: "CA", CHN: "CN", CRO: "HR", CZE: "CZ", DEN: "DK", EGY: "EG", ENG: "GB",
  ESP: "ES", EST: "EE", FIN: "FI", FRA: "FR", GBR: "GB", GER: "DE", GRE: "GR",
  HKG: "HK", HUN: "HU", INA: "ID", IND: "IN", IRL: "IE", ISR: "IL", ITA: "IT",
  JOR: "JO", JPN: "JP", LAT: "LV", MAR: "MA", MLT: "MT", NED: "NL", NIR: "GB",
  NOR: "NO", NZL: "NZ", PER: "PE", PNG: "PG", POL: "PL", ROM: "RO", RSA: "ZA",
  RUS: "RU", SCO: "GB", SIN: "SG", SLO: "SI", SUI: "CH", SVK: "SK", SWE: "SE",
  THA: "TH", TJK: "TJ", TUR: "TR", UKR: "UA", USA: "US",
};

export function iocToIso2(ioc: string): string | undefined {
  return IOC_TO_ISO2[ioc.toUpperCase()];
}
