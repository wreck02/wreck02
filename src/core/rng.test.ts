import { describe, it, expect } from 'vitest';
import { RNG, questionSeed } from './rng';

describe('RNG', () => {
  it('is deterministic for a seed', () => {
    const a = new RNG('ESAT-TEST'), b = new RNG('ESAT-TEST');
    const xs = Array.from({ length: 20 }, () => a.int(0, 1000));
    const ys = Array.from({ length: 20 }, () => b.int(0, 1000));
    expect(xs).toEqual(ys);
  });
  it('differs across seeds', () => {
    const a = new RNG('ESAT-A'), b = new RNG('ESAT-B');
    expect(a.next()).not.toBe(b.next());
    expect(new RNG(questionSeed('S', 0)).next()).not.toBe(new RNG(questionSeed('S', 1)).next());
  });
  it('int is inclusive and roughly uniform', () => {
    const r = new RNG('u');
    const counts = new Array(6).fill(0);
    for (let i = 0; i < 6000; i++) counts[r.int(1, 6) - 1]++;
    for (const c of counts) expect(c).toBeGreaterThan(800);
  });
  it('helpers', () => {
    const r = new RNG('h');
    for (let i = 0; i < 100; i++) expect(r.nonZeroInt(-3, 3)).not.toBe(0);
    expect(r.pickDistinct([1, 2, 3, 4], 4).sort()).toEqual([1, 2, 3, 4]);
    expect(r.shuffle([1, 2, 3]).length).toBe(3);
  });
});
