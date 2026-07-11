/**
 * Minimal, dependency-free CSV reader for the FIR import pipeline. The
 * scraper's output has no quoted fields and no embedded commas (verified
 * against ratings_{men,women}.csv and players.csv), so a plain comma split is
 * safe and keeps the build script zero-dependency. UTF-8 (accented names)
 * passes through untouched.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0]!.split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? "").trim();
    });
    return row;
  });
}
