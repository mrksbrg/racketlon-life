import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const GENERATED_ASSETS_ROOT = fileURLToPath(new URL("../assets/generated", import.meta.url));
const MAX_PNG_BYTES = 64 * 1024;

function pngFilesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    // Contact sheets are review/reference material, not runtime portrait assets.
    if (entry.isDirectory() && entry.name === "contact-sheets") return [];
    if (entry.isDirectory()) return pngFilesIn(path);
    return entry.isFile() && entry.name.endsWith(".png") ? [path] : [];
  });
}

function pngDimensions(path: string): { width: number; height: number } {
  const header = readFileSync(path).subarray(0, 24);
  expect(header.subarray(1, 4).toString("ascii"), path).toBe("PNG");
  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20),
  };
}

describe("generated portrait assets", () => {
  const portraits = pngFilesIn(GENERATED_ASSETS_ROOT);

  it("contains generated portraits", () => {
    expect(portraits.length).toBeGreaterThan(0);
  });

  it("keeps every generated portrait within the runtime asset budget", () => {
    for (const path of portraits) {
      const name = relative(GENERATED_ASSETS_ROOT, path);
      expect(pngDimensions(path), name).toEqual({ width: 128, height: 128 });
      expect(statSync(path).size, name).toBeLessThanOrEqual(MAX_PNG_BYTES);
      expect(name, name).not.toMatch(/-v\d+\.png$/);
    }
  });
});
