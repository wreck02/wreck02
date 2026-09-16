import { describe, it, expect } from 'vitest';
import { ALL_FACTS, FACT_DECKS } from './facts';
import { RNG } from './rng';
import { KEYS, load } from './storage';
import {
  applyFact, deckProgress, drawWeighted, factWeights, isWeak, loadFactProgress, recordFact, resetFactProgress, resetFacts, weakCards, weightOf,
  type FactProgress,
} from './facts-progress';

const T0 = 1_700_000_000_000;

describe('applyFact', () => {
  it('counts attempts, correct answers and the streak', () => {
    let p: FactProgress = {};
    p = applyFact(p, 'sq12', true, 3000, T0);
    p = applyFact(p, 'sq12', true, 2000, T0 + 1000);
    expect(p.sq12.seen).toBe(2);
    expect(p.sq12.correct).toBe(2);
    expect(p.sq12.streak).toBe(2);
    expect(p.sq12.lastSeen).toBe(T0 + 1000);
    expect(p.sq12.medianMs).toBe(2500);
    p = applyFact(p, 'sq12', false, 9000, T0 + 2000);
    expect(p.sq12.seen).toBe(3);
    expect(p.sq12.correct).toBe(2);
    expect(p.sq12.streak).toBe(0);
    expect(p.sq12.medianMs).toBe(3000);
  });
  it('does not mutate its input and keeps other cards', () => {
    const p0: FactProgress = { cu3: { seen: 1, correct: 1, streak: 1, lastSeen: T0, weight: 1 } };
    const p1 = applyFact(p0, 'sq12', true, 1000, T0);
    expect(p0.sq12).toBeUndefined();
    expect(p1.cu3).toBe(p0.cu3);
  });
  it('keeps only the most recent times', () => {
    let p: FactProgress = {};
    for (let i = 0; i < 15; i++) p = applyFact(p, 'x', true, 1000 * (i + 1), T0 + i);
    expect(p.x.times!.length).toBe(10);
    expect(p.x.times![0]).toBe(6000);
  });
});

describe('isWeak and weightOf', () => {
  it('unseen cards are weak with weight 2', () => {
    expect(isWeak(undefined)).toBe(true);
    expect(weightOf(undefined)).toBe(2);
  });
  it('a short streak or low accuracy is weak', () => {
    expect(isWeak({ seen: 5, correct: 5, streak: 1, lastSeen: T0, weight: 0 })).toBe(true);
    expect(isWeak({ seen: 10, correct: 6, streak: 3, lastSeen: T0, weight: 0 })).toBe(true);
    expect(isWeak({ seen: 10, correct: 9, streak: 3, lastSeen: T0, weight: 0 })).toBe(false);
  });
  it('weight falls as a card is mastered and rises when it is slow or stale', () => {
    let p: FactProgress = {};
    p = applyFact(p, 'a', false, 4000, T0);
    const afterMiss = p.a.weight;
    for (let i = 1; i <= 4; i++) p = applyFact(p, 'a', true, 2000, T0 + i);
    expect(p.a.weight).toBeLessThan(afterMiss);
    let q: FactProgress = {};
    for (let i = 0; i < 4; i++) q = applyFact(q, 'b', true, 1000, T0 + i);
    expect(q.b.weight).toBe(0);
    let slow: FactProgress = {};
    for (let i = 0; i < 4; i++) slow = applyFact(slow, 'c', true, 12000, T0 + i);
    expect(slow.c.weight).toBeGreaterThan(0);
    expect(weightOf(q.b, T0 + 30 * 86400000)).toBeGreaterThan(0);
  });
  it('factWeights covers unseen cards', () => {
    const w = factWeights({}, FACT_DECKS[0].cards, T0);
    expect(Object.keys(w).length).toBe(FACT_DECKS[0].cards.length);
    expect(w.sq12).toBe(2);
  });
});

describe('deck summaries', () => {
  it('deckProgress and weakCards', () => {
    const cards = FACT_DECKS.find((d) => d.key === 'cubes')!.cards;
    let p: FactProgress = {};
    for (let i = 0; i < 3; i++) p = applyFact(p, 'cu2', true, 1000, T0 + i);
    p = applyFact(p, 'cu3', false, 1000, T0);
    const d = deckProgress(p, cards);
    expect(d.cards).toBe(cards.length);
    expect(d.seenCards).toBe(2);
    expect(d.attempts).toBe(4);
    expect(d.correct).toBe(3);
    expect(d.accuracy).toBeCloseTo(0.75);
    expect(d.weak).toBe(cards.length - 1);
    expect(weakCards(p, cards).map((c) => c.id)).not.toContain('cu2');
    expect(weakCards(p, cards).map((c) => c.id)).toContain('cu3');
    expect(deckProgress({}, cards).accuracy).toBeNaN();
  });
  it('resetFacts forgets only the given cards', () => {
    let p: FactProgress = {};
    p = applyFact(p, 'a', true, 1, T0);
    p = applyFact(p, 'b', true, 1, T0);
    const r = resetFacts(p, ['a']);
    expect(r.a).toBeUndefined();
    expect(r.b).toBeDefined();
    expect(p.a).toBeDefined();
  });
});

describe('drawWeighted', () => {
  it('draws distinct cards from the pool only', () => {
    const pool = FACT_DECKS[1].cards;
    const out = drawWeighted(new RNG('facts-test'), pool, 10, {});
    expect(out.length).toBe(10);
    expect(new Set(out.map((c) => c.id)).size).toBe(10);
    for (const c of out) expect(pool).toContain(c);
    expect(drawWeighted(new RNG('x'), pool, 100, {}).length).toBe(pool.length);
    expect(drawWeighted(new RNG('x'), [], 5, {})).toEqual([]);
  });
  it('favours heavier cards', () => {
    const pool = ALL_FACTS.slice(0, 20);
    const weights: Record<string, number> = { [pool[0].id]: 50 };
    let first = 0;
    for (let i = 0; i < 200; i++) if (drawWeighted(new RNG(`w${i}`), pool, 1, weights)[0].id === pool[0].id) first++;
    expect(first).toBeGreaterThan(100);
  });
});

describe('persistence', () => {
  it('recordFact and resetFactProgress round-trip through storage', () => {
    resetFactProgress(Object.keys(loadFactProgress()));
    const p = recordFact('sq12', true, 1234, T0);
    expect(p.sq12.seen).toBe(1);
    expect(loadFactProgress().sq12.seen).toBe(1);
    expect(load<FactProgress>(KEYS.facts, {}).sq12.correct).toBe(1);
    recordFact('sq12', false, 2000, T0 + 1);
    expect(loadFactProgress().sq12.streak).toBe(0);
    resetFactProgress(['sq12']);
    expect(loadFactProgress().sq12).toBeUndefined();
  });
});
