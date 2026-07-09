/**
 * Deterministic seeded RNG (cyrb128 hash → sfc32 generator).
 *
 * There is no mutable RNG state in the save file. Every consumer creates its
 * own stream via `new Rng(childSeed(worldSeed, weekIndex, systemId))`, so:
 * - the same seed always replays the same career, and
 * - adding/removing a system never reshuffles another system's rolls.
 */

function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export class Rng {
  private readonly next01: () => number;

  constructor(seed: string) {
    const [a, b, c, d] = cyrb128(seed);
    this.next01 = sfc32(a, b, c, d);
    for (let i = 0; i < 12; i++) this.next01();
  }

  /** Uniform float in [0, 1). */
  next(): number {
    return this.next01();
  }

  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number {
    return Math.floor(this.next01() * maxExclusive);
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next01() * (max - min);
  }

  pick<T>(items: readonly T[]): T {
    const item = items[this.int(items.length)];
    if (item === undefined) throw new Error("pick() from empty array");
    return item;
  }

  chance(p: number): boolean {
    return this.next01() < p;
  }

  /** Normally distributed value (Box–Muller). */
  normal(mean = 0, sd = 1): number {
    const u1 = Math.max(this.next01(), Number.EPSILON);
    const u2 = this.next01();
    return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

/** Builds a derived seed string for a private RNG stream. */
export function childSeed(...parts: ReadonlyArray<string | number>): string {
  return parts.join("|");
}
