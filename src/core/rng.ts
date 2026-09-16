/**
 * Seeded pseudo-random number generator (sfc32) with string seeding.
 *
 * Every question in the app is generated from an RNG seeded by
 * `${sessionSeed}:${questionIndex}` so a session can be replayed exactly.
 */

/** cyrb128: hash a string into four 32-bit words. */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
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
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export class RNG {
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  readonly seed: string;

  constructor(seed: string | number) {
    this.seed = String(seed);
    const [a, b, c, d] = cyrb128(this.seed);
    this.a = a; this.b = b; this.c = c; this.d = d;
    // Warm up so short seeds diverge quickly.
    for (let i = 0; i < 12; i++) this.next();
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.a |= 0; this.b |= 0; this.c |= 0; this.d |= 0;
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** Integer in [lo, hi] inclusive. */
  int(lo: number, hi: number): number {
    if (hi < lo) [lo, hi] = [hi, lo];
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  /** Integer in [lo, hi] inclusive, never zero (requires lo <= 0 <= hi to be meaningful). */
  nonZeroInt(lo: number, hi: number): number {
    for (let i = 0; i < 100; i++) {
      const v = this.int(lo, hi);
      if (v !== 0) return v;
    }
    return hi !== 0 ? hi : lo;
  }

  /** Integer in [lo, hi] excluding the given values. */
  intExcluding(lo: number, hi: number, exclude: number[]): number {
    const pool: number[] = [];
    for (let v = lo; v <= hi; v++) if (!exclude.includes(v)) pool.push(v);
    if (pool.length === 0) throw new Error('intExcluding: empty pool');
    return this.pick(pool);
  }

  /** Random sign, +1 or -1. */
  sign(): 1 | -1 {
    return this.next() < 0.5 ? 1 : -1;
  }

  bool(p = 0.5): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('pick: empty array');
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Pick n distinct elements (n <= arr.length). */
  pickDistinct<T>(arr: readonly T[], n: number): T[] {
    if (n > arr.length) throw new Error('pickDistinct: not enough elements');
    return this.shuffle(arr).slice(0, n);
  }

  /** Weighted pick: weights need not sum to 1. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    let total = 0;
    for (const w of weights) total += Math.max(0, w);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= Math.max(0, weights[i]);
      if (r < 0) return items[i];
    }
    return items[items.length - 1];
  }

  /** Returns a shuffled copy (Fisher–Yates). */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** Derive an independent child generator (for per-question seeds). */
  child(label: string | number): RNG {
    return new RNG(`${this.seed}:${label}`);
  }
}

const SEED_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Human-friendly random session seed like "ESAT-K7Q2M9". Uses Math.random on purpose: this is the one source of fresh entropy. */
export function newSessionSeed(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += SEED_ALPHABET[Math.floor(Math.random() * SEED_ALPHABET.length)];
  return `ESAT-${s}`;
}

/** Seed for question i of a session. */
export function questionSeed(sessionSeed: string, index: number): string {
  return `${sessionSeed}#${index}`;
}
