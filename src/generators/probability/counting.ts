import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { factorial, nCr, lcm } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Counting, probability trees and expected value.
 * Level 1: nCr (5C2 = 10) or arrangements of n distinct objects (4! = 24)
 * Level 2: two independent events (a head and a six = 1/12); two draws with replacement
 * Level 3: "at least one" via the complement, 1 − (5/6)² = 11/36; two draws without replacement
 * Level 4: expected value of a spinner or dice game, E = Σ x·p
 * Level 5: probability trees (total probability, "given that"); arrangements with a restriction
 */

const FRACTION = { format: 'fraction' as const };
const pf = (x: Exact): string => x.toLatex(FRACTION);

type Candidate = { value: Exact | null; trap: string };

function cleanOnly(ds: Candidate[], mode: 'prob' | 'count' | 'any' = 'any'): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } => {
    if (d.value === null || !Number.isFinite(d.value.toNumber()) || !isCleanExact(d.value).ok) return false;
    const v = d.value.toNumber();
    if (mode === 'prob') return v > 0 && v < 1; // a probability of 0 or 1 is a dead option
    if (mode === 'count') return d.value.isInteger() && v > 0;
    return true;
  });
}

/**
 * Choose the distractors that go to buildOptions: every distinct `must` candidate (the spec-named traps)
 * is used before any `extra` one, so the headline mistakes are never shuffled out by weaker ones.
 */
function ranked(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], count = 4): Distractor[] {
  const seen: Exact[] = [answer];
  const out: Distractor[] = [];
  const take = (d: Distractor) => {
    if (out.length >= count || !Number.isFinite(d.value.toNumber()) || seen.some((s) => s.equals(d.value))) return;
    seen.push(d.value);
    out.push(d);
  };
  must.forEach(take); // in order, so when two must-traps coincide the more specific label wins
  rng.shuffle(extra).forEach(take);
  return out;
}

/** Pick a sub-variant first, then retry its parameters, so rejection rates do not skew the mix of variants. */
function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

/** Padding that still looks like a probability / a count, should a template's own distractors coincide. */
const PROB_FALLBACK = [[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [1, 6], [5, 6], [1, 5], [2, 5], [3, 5], [1, 8], [1, 12], [1, 36]].map(([n, d]) => frac(n, d));
const countFallback = (answer: Exact): Exact[] =>
  [2, 1 / 2, 3, 1 / 3, 4, 1 / 4, 6, 1 / 6, 12].map((k) => answer.mulRat(frac(Math.round(k * 12), 12).toRat())).filter((v) => v.isInteger() && v.toNumber() > 0);

function probOptions(rng: RNG, answer: Exact, must: Candidate[], extra: Candidate[]) {
  return buildOptions(rng, answer, ranked(rng, answer, cleanOnly(must, 'prob'), cleanOnly(extra, 'prob')), { ...FRACTION, fallback: PROB_FALLBACK });
}

function countOptions(rng: RNG, answer: Exact, must: Candidate[], extra: Candidate[]) {
  return buildOptions(rng, answer, ranked(rng, answer, cleanOnly(must, 'count'), cleanOnly(extra, 'count')), { fallback: countFallback(answer) });
}

const WORD_NUMBER = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ----------------------------------------------------------------------------- level 1

const DISTINCT_WORDS: Record<number, string[]> = {
  3: ['SUM', 'BOX', 'LOG'],
  4: ['CUBE', 'SINE', 'PLOT', 'AXIS'],
  5: ['MATHS', 'PRIME', 'LOGIC', 'ANGLE', 'POWER', 'GRAPH', 'TABLE', 'SHAPE'],
  6: ['NUMBER', 'FACTOR', 'VECTOR', 'SQUARE', 'RADIUS'],
};

function chooseQ(rng: RNG): Generated | null {
  // GCSE warm-up sizes: 5C2 = 10, 6C2 = 15, 7C3 = 35 — nPr then stays within about 6× of the answer.
  const n = rng.int(4, 7);
  const r = rng.pick([2, 3].filter((v) => v <= n - 2));
  const value = nCr(n, r);
  const answer = E(value);
  const within = (v: number) => (v <= 8 * value ? E(v) : null); // a 10–100× option only gives the spread away
  const stem = rng.pick([
    `In how many ways can a committee of ${r} people be chosen from ${n} people?`,
    `A team of ${r} is to be selected from a squad of ${n} players. How many different teams are possible?`,
    `In how many different ways can ${r} books be chosen from a shelf of ${n} different books?`,
    `How many different ${r}-topping pizzas can be made from a choice of ${n} toppings?`,
  ]);
  const num = Array.from({ length: r }, (_, i) => n - i);
  const den = Array.from({ length: r }, (_, i) => r - i);
  return {
    stem,
    answer: { kind: 'exact', value: answer },
    options: countOptions(rng, answer, [
      { value: E(factorial(n) / factorial(n - r)), trap: 'counted the orders as different: nPr instead of nCr' },
    ], [
      { value: E(n * r), trap: 'multiplied n by r' },
      { value: E(nCr(n, r - 1)), trap: 'off by one in r' },
      { value: E(nCr(n, r + 1)), trap: 'off by one in r' },
      { value: E(nCr(n - 1, r)), trap: 'off by one in n' },
      { value: E(factorial(n) / factorial(n - r) / r), trap: 'divided by r instead of r!' },
      { value: within(factorial(n) / factorial(r)), trap: 'divided by r! only, not by (n − r)! as well' },
      { value: within(n ** r), trap: 'allowed repeats and order: n^r' },
    ]),
    solution: `Order does not matter, so $^{${n}}C_{${r}} = \\frac{${num.join(' \\times ')}}{${den.join(' \\times ')}} = ${answer.toLatex()}$.`,
    trap: 'A committee is unordered: divide the r-permutations by r! (nCr, not nPr).',
    tags: ['counting', 'combinations'],
    params: { variant: 'choose', n, r },
    typedAllowed: true,
  };
}

function arrangeQ(rng: RNG): Generated | null {
  const n = rng.int(3, 6);
  const answer = E(factorial(n));
  const word = rng.bool(0.5) ? rng.pick(DISTINCT_WORDS[n]) : null;
  const stem = word
    ? `How many different arrangements are there of the letters of the word ${word}?`
    : rng.pick([
      `In how many different ways can ${WORD_NUMBER[n]} people stand in a line?`,
      `${cap(WORD_NUMBER[n])} different books are placed on a shelf. In how many different orders can they be arranged?`,
    ]);
  return {
    stem,
    answer: { kind: 'exact', value: answer },
    options: countOptions(rng, answer, [
      { value: E(factorial(n - 1)), trap: 'used (n − 1)!' },
      { value: E(n * n), trap: 'used n² instead of n!' },
    ], [
      { value: E(n * (n - 1)), trap: 'stopped after filling two positions' },
      { value: E(factorial(n + 1)), trap: 'used (n + 1)!' },
      { value: E(2 * n), trap: 'doubled n' },
      { value: E(factorial(n) / 2), trap: 'halved n! as if two objects were identical' },
    ]),
    solution: `$${n}$ choices for the first position, $${n - 1}$ for the second, and so on: $${n}! = ${Array.from({ length: n }, (_, i) => n - i).join(' \\times ')} = ${answer.toLatex()}$.`,
    trap: 'Arrangements of n distinct objects: n!, the product of the numbers of choices, not n² or 2n.',
    tags: ['counting', 'permutations', 'factorial'],
    params: { variant: 'arrange', n, word },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 2

interface DieEvent { text: string; faces: number[] }
const DIE_EVENTS: DieEvent[] = [
  { text: 'a six', faces: [6] },
  { text: 'a one', faces: [1] },
  { text: 'an even number', faces: [2, 4, 6] },
  { text: 'an odd number', faces: [1, 3, 5] },
  { text: 'a number greater than 4', faces: [5, 6] },
  { text: 'a prime number', faces: [2, 3, 5] },
  { text: 'a multiple of 3', faces: [3, 6] },
  { text: 'a number less than 3', faces: [1, 2] },
  { text: 'a square number', faces: [1, 4] },
];

function coinDieQ(rng: RNG): Generated | null {
  const coin = rng.pick(['a head', 'a tail']);
  const ev = rng.pick(DIE_EVENTS);
  const k = ev.faces.length;
  const answer = frac(k, 12);
  return {
    stem: `A fair coin is tossed and a fair six-sided dice is rolled. Find the probability of obtaining ${coin} and ${ev.text}.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: probOptions(rng, answer, [
      { value: frac(1, 2).add(frac(k, 6)), trap: 'added the probabilities instead of multiplying' },
      { value: frac(k, 6), trap: 'ignored the coin' },
    ], [
      { value: frac(1, 2), trap: 'ignored the dice' },
      { value: E(1).sub(answer), trap: 'found the complement' },
      { value: frac(k + 1, 12), trap: 'miscounted the successful faces' },
      { value: frac(k, 8), trap: 'added the numbers of outcomes (2 + 6) instead of multiplying (2 × 6)' },
    ]),
    solution: `The events are independent: $P = \\frac{1}{2} \\times ${pf(frac(k, 6))} = ${pf(answer)}$.`,
    trap: 'Independent events: multiply the probabilities ("and"), do not add them.',
    tags: ['probability', 'independent-events'],
    params: { variant: 'coin-die', faces: ev.faces },
    typedAllowed: true,
  };
}

function twoDiceQ(rng: RNG): Generated | null {
  const e1 = rng.pick(DIE_EVENTS);
  const same = rng.bool(0.5);
  const e2 = same ? e1 : rng.pick(DIE_EVENTS.filter((e) => e !== e1));
  const k1 = e1.faces.length, k2 = e2.faces.length;
  const answer = frac(k1 * k2, 36);
  const stem = same
    ? `Two fair six-sided dice are rolled. Find the probability that both show ${e1.text}.`
    : `Two fair six-sided dice are rolled. Find the probability that the first shows ${e1.text} and the second shows ${e2.text}.`;
  return {
    stem,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: probOptions(rng, answer, [
      { value: frac(k1, 6).add(frac(k2, 6)), trap: 'added the probabilities instead of multiplying' },
      { value: frac(k1, 6), trap: 'considered only one dice' },
    ], [
      { value: answer.mulRat(2), trap: 'doubled: counted two orders when the order was fixed' },
      { value: frac(k1 + k2, 36), trap: 'added the numbers of favourable faces' },
      { value: same ? frac(k1 * (k1 - 1), 30) : frac(k1 * k2, 30), trap: 'treated the two rolls like draws without replacement' },
      { value: E(1).sub(answer), trap: 'found the complement' },
    ]),
    solution: `The rolls are independent: $P = ${pf(frac(k1, 6))} \\times ${pf(frac(k2, 6))} = ${pf(answer)}$.`,
    trap: 'Each dice is a fresh, independent event: multiply the two probabilities.',
    tags: ['probability', 'independent-events', 'dice'],
    params: { variant: 'two-dice', faces1: e1.faces, faces2: e2.faces },
    typedAllowed: true,
  };
}

type BagAsk = 'both-red' | 'red-then-blue' | 'different' | 'same';

/** Red and blue counts: unequal, so the named mistakes do not collapse onto each other. */
function bagCounts(rng: RNG): [number, number] | null {
  const r = rng.int(2, 6), b = rng.int(2, 6);
  return r + b <= 10 && r !== b ? [r, b] : null;
}

const bagIntro = (r: number, b: number) => `A bag contains ${r} red and ${b} blue counters.`;

function bagReplaceQ(rng: RNG): Generated | null {
  const rb = bagCounts(rng);
  if (!rb) return null;
  const [r, b] = rb, n = r + b;
  const ask = rng.pick(['both-red', 'red-then-blue', 'different'] as BagAsk[]);
  const pr = frac(r, n), pb = frac(b, n);
  const answer = ask === 'both-red' ? pr.mul(pr) : ask === 'red-then-blue' ? pr.mul(pb) : pr.mul(pb).mulRat(2);
  const askText = { 'both-red': 'both counters are red', 'red-then-blue': 'the first counter is red and the second is blue', different: 'the two counters are different colours', same: '' }[ask];
  const working = ask === 'both-red'
    ? `${pf(pr)} \\times ${pf(pr)}`
    : ask === 'red-then-blue' ? `${pf(pr)} \\times ${pf(pb)}` : `2 \\times ${pf(pr)} \\times ${pf(pb)}`;
  return {
    stem: `${bagIntro(r, b)} A counter is taken at random, its colour is noted and it is replaced. A second counter is then taken. Find the probability that ${askText}.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: probOptions(rng, answer, [
      { value: ask === 'both-red' ? frac(r * (r - 1), n * (n - 1)) : ask === 'red-then-blue' ? frac(r * b, n * (n - 1)) : frac(2 * r * b, n * (n - 1)), trap: 'treated the draws as without replacement' },
      { value: ask === 'both-red' ? pr.mulRat(2) : pr.add(pb), trap: 'added the probabilities instead of multiplying' },
    ], [
      { value: pr, trap: 'considered only one draw' },
      { value: ask === 'different' ? pr.mul(pb) : pr.mul(pb).mulRat(2), trap: ask === 'different' ? 'forgot the second order (blue then red)' : 'counted both orders when only one was asked for' },
      { value: ask === 'both-red' ? pb.mul(pb) : pr.mul(pr), trap: 'used the wrong colour' },
      { value: E(1).sub(answer), trap: 'found the complement' },
      { value: pb, trap: 'gave the probability of blue on a single draw' },
    ]),
    solution: `With replacement the draws are independent${ask === 'different' ? ', and "different" means red-blue or blue-red' : ''}: $P = ${working} = ${pf(answer)}$.`,
    trap: 'With replacement the second draw is unchanged; "different colours" needs both orders, RB and BR.',
    tags: ['probability', 'with-replacement', 'independent-events'],
    params: { variant: 'bag-replace', r, b, ask },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 3

function atLeastOneQ(rng: RNG): Generated | null {
  const scenario = rng.pick(['dice', 'coins', 'bag']);
  let space: number, good: number, trials: number, stem: string, noneTex: string;
  if (scenario === 'dice') {
    // p = 1/6 or 1/3: with p = 1/2 the named mistakes all collapse onto 1/4 and 1/2
    const ev = rng.pick(DIE_EVENTS.filter((e) => e.faces.length <= 2));
    space = 6; good = ev.faces.length; trials = 2;
    stem = `Two fair six-sided dice are rolled. Find the probability that at least one of them shows ${ev.text}.`;
    noneTex = `\\left(${pf(frac(6 - good, 6))}\\right)^2`;
  } else if (scenario === 'coins') {
    trials = rng.pick([3, 4]); space = 2; good = 1;
    stem = `${cap(WORD_NUMBER[trials])} fair coins are tossed. Find the probability of obtaining at least one ${rng.pick(['head', 'tail'])}.`;
    noneTex = `\\left(\\frac{1}{2}\\right)^${trials}`;
  } else {
    const rb = bagCounts(rng);
    if (!rb) return null;
    const [r, b] = rb;
    space = r + b; good = r; trials = 2;
    stem = `${bagIntro(r, b)} A counter is taken at random and replaced, then a second counter is taken. Find the probability that at least one of the two counters is red.`;
    noneTex = `\\left(${pf(frac(b, space))}\\right)^2`;
  }
  const p = frac(good, space), q = frac(space - good, space);
  const none = q.pow(trials);
  const answer = E(1).sub(none);
  const exactlyOne = p.mul(q.pow(trials - 1)).mulRat(trials);
  return {
    stem,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: probOptions(rng, answer, [
      { value: none, trap: 'found P(none) and forgot to subtract from 1' },
      { value: p.mulRat(trials), trap: 'added the single-trial probabilities' },
    ], [
      { value: p.pow(trials), trap: 'found P(all) instead of P(at least one)' },
      { value: E(1).sub(p.pow(trials)), trap: 'complemented the wrong event (1 − P(all))' },
      { value: exactlyOne, trap: 'found P(exactly one)' },
      { value: p, trap: 'gave the probability for a single trial' },
      { value: q, trap: 'gave P(not on one trial)' },
      { value: p.mul(q), trap: 'multiplied one success by one failure' },
      { value: E(1).sub(q.mulRat(trials)), trap: 'subtracted the failure probabilities from 1 instead of their product' },
      ...(trials >= 3
        ? [
          { value: E(1).sub(q.pow(trials - 1)), trap: 'used one coin too few' },
          { value: none.mulRat(2), trap: 'found P(all heads or all tails)' },
          { value: E(1).sub(none).sub(exactlyOne), trap: 'found P(at least two)' },
        ]
        : []),
    ]),
    solution: `$P(\\text{at least one}) = 1 - P(\\text{none}) = 1 - ${noneTex} = 1 - ${pf(none)} = ${pf(answer)}$.`,
    trap: '"At least one" is the complement of "none": 1 − P(none). Do not add the single probabilities.',
    tags: ['probability', 'complement', 'at-least-one'],
    params: { variant: 'at-least-one', space, good, trials },
    typedAllowed: true,
  };
}

function noReplaceQ(rng: RNG): Generated | null {
  const rb = bagCounts(rng);
  if (!rb) return null;
  const [r, b] = rb, n = r + b;
  const ask = rng.pick(['both-red', 'different', 'same'] as BagAsk[]);
  const D = n * (n - 1);
  const rr = frac(r * (r - 1), D), bb = frac(b * (b - 1), D), rbOne = frac(r * b, D);
  const answer = ask === 'both-red' ? rr : ask === 'different' ? rbOne.mulRat(2) : rr.add(bb);
  const askText = { 'both-red': 'both counters are red', different: 'the counters are different colours', same: 'the counters are the same colour', 'red-then-blue': '' }[ask];
  const working = ask === 'both-red'
    ? `P(RR) = ${pf(frac(r, n))} \\times ${pf(frac(r - 1, n - 1))} = ${pf(answer)}`
    : ask === 'different'
      ? `P(RB) + P(BR) = 2 \\times ${pf(frac(r, n))} \\times ${pf(frac(b, n - 1))} = ${pf(answer)}`
      : `P(RR) + P(BB) = ${pf(frac(r, n))} \\times ${pf(frac(r - 1, n - 1))} + ${pf(frac(b, n))} \\times ${pf(frac(b - 1, n - 1))} = ${pf(rr)} + ${pf(bb)} = ${pf(answer)}`;
  const lists: Record<BagAsk, [Candidate[], Candidate[]]> = {
    'both-red': [
      [
        { value: frac(r * r, n * n), trap: 'treated the draws as with replacement' },
        { value: frac(r * r, D), trap: 'forgot that one red counter has gone' },
      ],
      [
        { value: frac(r * (r - 1), n * n), trap: 'forgot that the total drops to n − 1' },
        { value: frac(r, n).add(frac(r - 1, n - 1)), trap: 'added along the branch instead of multiplying' },
        { value: rr.add(bb), trap: 'found P(same colour)' },
        { value: rbOne.mulRat(2), trap: 'found P(different colours)' },
        { value: E(1).sub(rr), trap: 'found the complement' },
      ],
    ],
    different: [
      [
        { value: frac(2 * r * b, n * n), trap: 'treated the draws as with replacement' },
        { value: rbOne, trap: 'counted only red-then-blue' },
      ],
      [
        { value: frac(r * b, n * n), trap: 'with replacement and only one order' },
        { value: rr.add(bb), trap: 'found P(same colour), the complement' },
        { value: frac(r, n).add(frac(b, n - 1)), trap: 'added along the branch instead of multiplying' },
        { value: rr, trap: 'found P(both red)' },
      ],
    ],
    same: [
      [
        { value: frac(r * r + b * b, n * n), trap: 'treated the draws as with replacement' },
        { value: rr, trap: 'forgot the blue-blue branch' },
      ],
      [
        { value: bb, trap: 'forgot the red-red branch' },
        { value: rbOne.mulRat(2), trap: 'found P(different colours), the complement' },
        { value: frac(r * r + b * b, D), trap: 'forgot that one counter of the colour has gone' },
        { value: frac(r * (r - 1) + b * (b - 1), n * n), trap: 'forgot that the total drops to n − 1' },
      ],
    ],
    'red-then-blue': [[], []],
  };
  return {
    stem: `${bagIntro(r, b)} Two counters are taken at random without replacement. Find the probability that ${askText}.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: probOptions(rng, answer, lists[ask][0], lists[ask][1]),
    solution: `Without replacement the second draw has one fewer counter: $${working}$.`,
    trap: 'Without replacement both the numerator and the total change on the second branch; "different" needs both orders.',
    tags: ['probability', 'without-replacement', 'tree'],
    params: { variant: 'no-replace', r, b, ask },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 4

function spinnerQ(rng: RNG): Generated | null {
  const D = rng.pick([4, 6, 8, 10, 12]);
  const k = rng.pick([3, 4]);
  if (k > D - 1) return null;
  const cuts = rng.pickDistinct(Array.from({ length: D - 1 }, (_, i) => i + 1), k - 1).sort((a, b) => a - b);
  const weights = [...cuts, D].map((c, i) => c - (i === 0 ? 0 : cuts[i - 1]));
  const scores = rng.pickDistinct([1, 2, 3, 4, 5, 6, 8, 10], k).sort((a, b) => a - b);
  const total = scores.reduce((acc, x, i) => acc + x * weights[i], 0);
  const reversedTotal = scores.reduce((acc, x, i) => acc + x * weights[k - 1 - i], 0);
  // A genuinely biased spinner: with equal (or mirror-image) probabilities the plain average is the answer.
  if (new Set(weights).size === 1 || reversedTotal === total) return null;
  const answer = frac(total, D);
  if (answer.toRat().d > 4n) return null;
  const probs = weights.map((w) => frac(w, D));
  const terms = scores.map((x, i) => `${x} \\times ${pf(probs[i])}`);
  const iMax = weights.indexOf(Math.max(...weights)), iMin = weights.indexOf(Math.min(...weights));
  const last = scores.length - 1;
  const minS = scores[0], maxS = scores[last];
  // An expected value lies between the smallest and largest score; a wrong answer outside that range fools nobody.
  const inRange = (ds: Candidate[]) => ds.filter((d) => d.value !== null && d.value.toNumber() >= minS && d.value.toNumber() <= maxS);
  const half = frac(1, 2);
  const must = inRange([{ value: frac(scores.reduce((a, x) => a + x, 0), k), trap: 'ignored the probabilities and averaged the scores' }]);
  const extra = inRange([
    { value: frac(reversedTotal, D), trap: 'paired the probabilities with the scores in the wrong order' },
    { value: frac(total + (scores[iMin] - scores[iMax]) * (weights[iMax] - weights[iMin]), D), trap: 'swapped two of the probabilities' },
    { value: answer.sub(frac(scores[last] * weights[last], D)), trap: 'dropped one term of the sum' },
    { value: answer.add(probs[iMax]), trap: 'arithmetic slip: one score too big by 1 in its product' },
    ...scores.map((s, i) => ({ value: E(s), trap: i === iMax ? 'gave the most likely score' : 'gave one of the scores instead of the weighted mean' })),
  ]);
  const fallback = [answer.add(half), answer.sub(half), answer.add(E(1)), answer.sub(E(1))].filter((v) => v.toNumber() >= minS && v.toNumber() <= maxS);
  return {
    stem: `A biased spinner has ${WORD_NUMBER[k]} sections, numbered ${scores.slice(0, -1).join(', ')} and ${scores[last]}. The probabilities of landing on them are $${probs.map(pf).join('$, $')}$ respectively. Find the expected score from one spin.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, ranked(rng, answer, cleanOnly(must), cleanOnly(extra)), { fallback }),
    solution: `$E(X) = \\sum x\\,p = ${terms.join(' + ')} = \\frac{${total}}{${D}}${answer.toRat().d === BigInt(D) ? '' : ` = ${answer.toLatex()}`}$.`,
    trap: 'Expected value weights each score by its probability: Σ x·p, not the plain average of the scores.',
    tags: ['probability', 'expected-value', 'spinner'],
    params: { variant: 'spinner', scores, weights, D },
    typedAllowed: true,
  };
}

const PRIZE_GROUPS: DieEvent[] = [
  { text: 'a six', faces: [6] },
  { text: 'a five', faces: [5] },
  { text: 'a one', faces: [1] },
  { text: 'an even number', faces: [2, 4, 6] },
  { text: 'an odd number', faces: [1, 3, 5] },
  { text: 'a five or a six', faces: [5, 6] },
  { text: 'a one or a two', faces: [1, 2] },
];

function dieGameQ(rng: RNG): Generated | null {
  // Two prizes (E = Σ x·p is a sum): a single prize with no stake is a one-step level-2 question
  const g1 = rng.pick(PRIZE_GROUPS);
  const g2 = rng.pick(PRIZE_GROUPS.filter((g) => g !== g1 && g.faces.every((f) => !g1.faces.includes(f))));
  const pay1 = rng.pick([12, 18, 24, 30, 36, 60]);
  const pay2 = rng.pick([6, 12, 18, 24, 30].filter((p) => p !== pay1));
  const cost = rng.bool(0.5) ? rng.pick([5, 10, 15, 20]) : 0;
  const f1 = g1.faces.length, f2 = g2.faces.length;
  const totalPay = pay1 * f1 + pay2 * f2;
  const winnings = frac(totalPay, 6);
  const answer = winnings.sub(E(cost));
  if (answer.isZero() || answer.toRat().d > 2n) return null;
  const prizes = `${pay1}p if it shows ${g1.text} and ${pay2}p if it shows ${g2.text}`;
  const terms = [`${pay1} \\times ${pf(frac(f1, 6))}`, `${pay2} \\times ${pf(frac(f2, 6))}`];
  const sixthEach = frac(pay1 + pay2, 6).sub(E(cost));
  const must: Candidate[] = [
    { value: E(pay1 + pay2 - cost), trap: 'added the prizes without weighting by their probabilities' },
    cost
      ? { value: winnings, trap: 'forgot to subtract the cost of playing' }
      : { value: sixthEach, trap: 'used a probability of 1/6 for every prize, whatever the number of faces' },
  ];
  const extra: Candidate[] = [
    { value: frac(pay1 + pay2, 2).sub(E(cost)), trap: 'averaged the prizes as if each were equally likely' },
    { value: frac(pay1 * f1, 6).sub(E(cost)), trap: 'counted only the first prize' },
    { value: frac(pay1 * f2 + pay2 * f1, 6).sub(E(cost)), trap: 'paired each prize with the wrong probability' },
    ...(cost
      ? [
        { value: winnings.add(E(cost)), trap: 'added the cost instead of subtracting it' },
        { value: answer.neg(), trap: 'sign of the profit reversed' },
        { value: sixthEach, trap: 'used a probability of 1/6 for every prize, whatever the number of faces' },
      ]
      : [
        { value: E(totalPay), trap: 'multiplied each prize by its number of faces but forgot to divide by 6' },
        { value: winnings.mulRat(2), trap: 'doubled the expected value' },
        { value: frac(totalPay, 2), trap: 'divided by the number of prizes instead of by 6' },
      ]),
  ];
  // Options in the same register as the answer: whole pence or halves, never thirds.
  const pence = (ds: Candidate[]) => cleanOnly(ds).filter((d) => d.value.toRat().d <= 2n);
  return {
    stem: `A fair six-sided dice is rolled. A player wins ${prizes}, and nothing otherwise.${cost ? ` It costs ${cost}p to play.` : ''} Find the player's expected ${cost ? 'profit' : 'winnings'} per game, in pence.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, ranked(rng, answer, pence(must), pence(extra))),
    solution: `Expected winnings $= ${terms.join(' + ')} = ${pf(winnings)}$p${cost ? `; subtract the ${cost}p stake: $${pf(winnings)} - ${cost} = ${answer.toLatex()}$p` : ''}.`,
    trap: 'Weight each prize by its probability (faces ÷ 6), then subtract the stake for the profit.',
    tags: ['probability', 'expected-value', 'dice'],
    params: { variant: 'die-game', faces1: g1.faces, pay1, faces2: g2.faces, pay2, cost },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 5

type Fr = [number, number];
const FRACS: Fr[] = [[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5], [1, 6], [5, 6], [1, 10], [3, 10], [1, 8]];
const fr = ([n, d]: Fr) => frac(n, d);

interface TreeContext {
  intro: (p: string) => string;
  cond: (q1: string, q2: string) => string;
  askB: string;
  askAgivenB: string;
}
const TREE_CONTEXTS: TreeContext[] = [
  {
    intro: (p) => `The probability that it rains tomorrow is $${p}$.`,
    cond: (q1, q2) => `If it rains, the probability that Sam cycles to school is $${q1}$; if it does not rain, the probability is $${q2}$.`,
    askB: 'Find the probability that Sam cycles to school tomorrow.',
    askAgivenB: 'Given that Sam cycles to school tomorrow, find the probability that it rains.',
  },
  {
    intro: (p) => `The probability that Priya's bus is late is $${p}$.`,
    cond: (q1, q2) => `If the bus is late, the probability that she misses the start of her lesson is $${q1}$; otherwise it is $${q2}$.`,
    askB: 'Find the probability that Priya misses the start of her lesson.',
    askAgivenB: 'Given that Priya misses the start of her lesson, find the probability that her bus was late.',
  },
  {
    intro: (p) => `A factory has two machines. Machine A makes a fraction $${p}$ of the components and machine B makes the rest.`,
    cond: (q1, q2) => `The probability that a component from machine A is faulty is $${q1}$, and from machine B it is $${q2}$.`,
    askB: 'Find the probability that a randomly chosen component is faulty.',
    askAgivenB: 'Given that a component is faulty, find the probability that it was made by machine A.',
  },
];

function treeQ(rng: RNG): Generated | null {
  const ctx = rng.pick(TREE_CONTEXTS);
  const p = rng.pick(FRACS), q1 = rng.pick(FRACS);
  const q2 = rng.pick(FRACS.filter((f) => f[0] !== q1[0] || f[1] !== q1[1]));
  const P = fr(p), Q1 = fr(q1), Q2 = fr(q2);
  const notP = E(1).sub(P);
  const branchA = P.mul(Q1), branchB = notP.mul(Q2);
  const PB = branchA.add(branchB);
  const PAB = branchA.div(PB);
  const ask = rng.pick(['total', 'bayes']);
  const answer = ask === 'total' ? PB : PAB;
  const tidy = (x: Exact) => isCleanExact(x).ok && x.toRat().d <= 60n;
  if (!tidy(PB) || !tidy(answer) || PB.toNumber() >= 1) return null;
  const stem = `${ctx.intro(pf(P))} ${ctx.cond(pf(Q1), pf(Q2))} ${ask === 'total' ? ctx.askB : ctx.askAgivenB}`;
  const treeTex = `${pf(P)} \\times ${pf(Q1)} + ${pf(notP)} \\times ${pf(Q2)} = ${pf(branchA)} + ${pf(branchB)} = ${pf(PB)}`;
  const must: Candidate[] = ask === 'total'
    ? [
      { value: branchA, trap: 'used only one branch of the tree' },
      { value: P.add(Q1), trap: 'added along the branch instead of multiplying' },
    ]
    : [
      { value: branchA, trap: 'gave the joint probability P(A and B), not the conditional' },
      { value: Q1, trap: 'gave P(B | A) instead of P(A | B)' },
    ];
  const extra: Candidate[] = ask === 'total'
    ? [
      { value: branchA.add(Q2), trap: 'forgot to multiply the second branch by P(not A)' },
      { value: Q1.add(Q2), trap: 'added the two conditional probabilities' },
      { value: P.mul(Q1).add(P.mul(Q2)), trap: 'used P(A) on both branches' },
      { value: E(1).sub(PB), trap: 'found the complement' },
      { value: branchB, trap: 'used only the second branch' },
      { value: notP.mul(Q1).add(P.mul(Q2)), trap: 'swapped the two conditional probabilities between the branches' },
      { value: Q1.mul(Q2), trap: 'multiplied the two conditional probabilities' },
    ]
    : [
      { value: P, trap: 'ignored the condition and gave P(A)' },
      { value: E(1).sub(PAB), trap: 'gave the other branch, P(not A | B)' },
      { value: PB, trap: 'stopped at P(B)' },
      { value: branchA.div(Q1.add(Q2)), trap: 'divided by the wrong total' },
      { value: Q1.div(PB), trap: 'divided P(B | A) by P(B) instead of P(A and B)' },
      { value: notP, trap: 'gave P(not A)' },
    ];
  return {
    stem,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: probOptions(rng, answer, must, extra),
    solution: ask === 'total'
      ? `Add the two branches of the tree: $P = ${treeTex}$.`
      : `$P(A \\mid B) = \\frac{P(A \\text{ and } B)}{P(B)}$. Here $P(B) = ${treeTex}$, so the answer is $${pf(branchA)} \\div ${pf(PB)} = ${pf(answer)}$.`,
    trap: ask === 'total'
      ? 'Multiply along each branch, then add the branches that give the outcome; the second branch needs P(not A).'
      : '"Given that" means divide the wanted branch by the total probability of the condition, not just report the branch.',
    tags: ['probability', 'tree', ask === 'total' ? 'total-probability' : 'conditional'],
    params: { variant: 'tree', p, q1, q2, ask },
    typedAllowed: true,
  };
}

function secondRedQ(rng: RNG): Generated | null {
  const rb = bagCounts(rng);
  if (!rb) return null;
  const [r, b] = rb, n = r + b;
  const ask = rng.pick(['second-red', 'first-blue-given']);
  const D = n * (n - 1);
  const rr = frac(r * (r - 1), D), br = frac(b * r, D);
  const answer = ask === 'second-red' ? frac(r, n) : frac(b, n - 1);
  const must: Candidate[] = ask === 'second-red'
    ? [
      { value: frac(r - 1, n - 1), trap: 'conditioned on the first counter being red' },
      { value: br, trap: 'used only the blue-then-red branch' },
    ]
    : [
      { value: frac(b, n), trap: 'ignored the condition and gave P(first blue)' },
      { value: br, trap: 'gave the joint probability, not the conditional' },
    ];
  const extra: Candidate[] = ask === 'second-red'
    ? [
      { value: frac(r, n - 1), trap: 'conditioned on the first counter being blue' },
      { value: rr, trap: 'found P(both red)' },
      { value: br.mulRat(2), trap: 'found P(different colours)' },
      { value: frac(b, n), trap: 'gave P(blue)' },
      { value: frac(1, 2), trap: 'assumed the two colours are equally likely' },
      { value: frac(r * r, n * n), trap: 'treated the draws as with replacement and found P(both red)' },
    ]
    : [
      { value: frac(r, n - 1), trap: 'gave P(second red | first blue) instead' },
      { value: frac(r - 1, n - 1), trap: 'gave the other branch, P(first red | second red)' },
      { value: frac(r, n), trap: 'stopped at P(second red)' },
      { value: br.div(rr.add(br).add(br)), trap: 'divided by the wrong total' },
      { value: frac(1, 2), trap: 'assumed the two colours are equally likely' },
      { value: frac(b, n).mul(frac(r, n)), trap: 'joint probability with replacement' },
    ];
  return {
    stem: `${bagIntro(r, b)} Two counters are taken at random, one after the other, without replacement. ${ask === 'second-red' ? 'Find the probability that the second counter is red.' : 'Given that the second counter is red, find the probability that the first counter was blue.'}`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: probOptions(rng, answer, must, extra),
    solution: ask === 'second-red'
      ? `$P(\\text{2nd red}) = P(RR) + P(BR) = ${pf(frac(r, n))} \\times ${pf(frac(r - 1, n - 1))} + ${pf(frac(b, n))} \\times ${pf(frac(r, n - 1))} = ${pf(rr)} + ${pf(br)} = ${pf(answer)}$, the same as for the first counter.`
      : `$P(\\text{2nd red}) = P(RR) + P(BR) = ${pf(rr)} + ${pf(br)} = ${pf(frac(r, n))}$, so $P(\\text{1st blue} \\mid \\text{2nd red}) = \\frac{P(BR)}{P(\\text{2nd red})} = ${pf(br)} \\div ${pf(frac(r, n))} = ${pf(answer)}$.`,
    trap: 'The second counter is red along two branches (RR and BR); add both, and for "given that" divide by that total.',
    tags: ['probability', 'tree', 'conditional', 'without-replacement'],
    params: { variant: 'second-red', r, b, ask },
    typedAllowed: true,
  };
}

/** Five letters or more: four-letter words (NOON → 6) are a level-2 count. */
const REPEAT_WORDS = ['LEVEL', 'APPLE', 'BANANA', 'NEEDED', 'BUBBLE', 'LETTER', 'SEVEN', 'HAPPY', 'TOOTH', 'TEETH', 'PEPPER', 'COFFEE', 'CHEESE', 'SUCCESS', 'KAYAK', 'RADAR', 'ASSESS', 'LITTLE', 'GOOGLE', 'ERROR', 'DIGIT'];
const TIMES = ['', 'once', 'twice', 'three times', 'four times', 'five times'];

function letterCounts(word: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const ch of word) m.set(ch, (m.get(ch) ?? 0) + 1);
  return m;
}

function lettersQ(rng: RNG): Generated | null {
  const word = rng.pick(REPEAT_WORDS);
  const n = word.length;
  const counts = [...letterCounts(word).entries()].filter(([, c]) => c > 1);
  const divisor = counts.reduce((acc, [, c]) => acc * factorial(c), 1);
  const answer = E(factorial(n) / divisor);
  const sumRepeats = counts.reduce((acc, [, c]) => acc + c, 0);
  const maxRepeat = Math.max(...counts.map(([, c]) => c));
  const singleGroup = counts.length === 1;
  const singlePair = singleGroup && counts[0][1] === 2;
  const desc = counts.map(([ch, c]) => `${ch} appears ${TIMES[c]}`).join(' and ');
  return {
    stem: `How many different arrangements are there of the letters of the word ${word}?`,
    answer: { kind: 'exact', value: answer },
    options: countOptions(rng, answer, [
      { value: E(factorial(n)), trap: 'ignored the repeated letters' },
      counts.length > 1
        ? { value: E(factorial(n) / factorial(maxRepeat)), trap: 'accounted for only one repeated letter' }
        : { value: E(2 * factorial(n - 1)), trap: 'treated the repeated pair as a block that must stay together' },
    ], [
      { value: E(factorial(n) / sumRepeats), trap: 'divided by the number of repeated letters instead of their factorials' },
      { value: E(factorial(n - 1)), trap: 'used (n − 1)!' },
      { value: E(factorial(n) / counts.reduce((acc, [, c]) => acc * c, 1)), trap: 'divided by k instead of k! for a letter appearing k times' },
      { value: E(factorial(n) / factorial(sumRepeats)), trap: 'divided by (total number of repeated letters)!' },
      { value: E(factorial(n) / (2 * divisor)), trap: 'divided by an extra 2' },
      ...(singlePair ? [{ value: E(n * (n - 1)), trap: 'arranged only two letters' }] : []),
      ...(singleGroup
        ? [
          { value: E(factorial(n - maxRepeat)), trap: 'removed the repeated letters instead of dividing by k!' },
          { value: E(factorial(n) / factorial(maxRepeat - 1)), trap: 'divided by (k − 1)! instead of k!' },
        ]
        : []),
    ]),
    solution: `$${n}$ letters, where ${desc}: $\\frac{${n}!}{${counts.map(([, c]) => `${c}!`).join('\\,')}} = \\frac{${factorial(n)}}{${divisor}} = ${answer.toLatex()}$.`,
    trap: 'Divide n! by k! for every letter that appears k times (2! for a pair, 3! for a triple), not by k.',
    tags: ['counting', 'permutations', 'repeats'],
    params: { variant: 'letters', word },
    typedAllowed: true,
  };
}

const NAMES = ['Amy', 'Ben', 'Cara', 'Dev', 'Ella', 'Finn'];
type SeatMode = 'together' | 'apart' | 'three' | 'ends' | 'left-of';

function togetherQ(rng: RNG): Generated | null {
  const n = rng.int(5, 6); // n = 4 (→ 12) is a level-3 count
  const mode = rng.pick<SeatMode>(['together', 'apart', 'three', 'ends', 'left-of']);
  const people = rng.pickDistinct(NAMES, mode === 'three' ? 3 : 2);
  const F = factorial;
  const value = mode === 'apart' ? F(n) - 2 * F(n - 1)
    : mode === 'three' ? 6 * F(n - 2)
      : mode === 'ends' ? 2 * F(n - 2)
        : mode === 'left-of' ? F(n - 1)
          : 2 * F(n - 1);
  const answer = E(value);
  const who = mode === 'three' ? `${people[0]}, ${people[1]} and ${people[2]}` : `${people[0]} and ${people[1]}`;
  const condition = {
    together: `${who} must sit next to each other`,
    apart: `${who} must not sit next to each other`,
    three: `${who} must sit together`,
    ends: `${who} must sit at the two ends of the row`,
    'left-of': `${people[0]} must sit immediately to the left of ${people[1]}`,
  }[mode];
  const lists: Record<SeatMode, [Candidate[], Candidate[]]> = {
    together: [
      [
        { value: E(F(n - 1)), trap: 'forgot the 2 orders within the pair' },
        { value: E(F(n) - 2 * F(n - 1)), trap: 'found the number of ways they are NOT together' },
      ],
      [
        { value: E(F(n)), trap: 'ignored the restriction' },
        { value: E(F(n) / 2), trap: 'halved n!' },
        { value: E(2 * F(n - 2)), trap: 'removed both people instead of replacing them by one block' },
        { value: E((n - 1) * F(n - 1)), trap: 'multiplied by the number of positions for the pair instead of by 2' },
        { value: E(4 * F(n - 1)), trap: 'doubled twice' },
      ],
    ],
    apart: [
      [
        { value: E(2 * F(n - 1)), trap: 'found the number of ways they DO sit together' },
        { value: E(F(n) - F(n - 1)), trap: 'forgot the 2 orders of the pair when subtracting' },
      ],
      [
        { value: E(F(n)), trap: 'ignored the restriction' },
        { value: E(F(n) / 2), trap: 'halved n!' },
        { value: E(F(n) - 2 * F(n - 2)), trap: 'used (n − 2)! for the block' },
        { value: E(F(n - 1)), trap: 'gave (n − 1)!' },
        { value: E(F(n) - 2 * (n - 1)), trap: 'subtracted only the positions of the pair' },
      ],
    ],
    three: [
      [
        { value: E(F(n - 2)), trap: 'forgot the 3! orders within the block' },
        { value: E(3 * F(n - 2)), trap: 'used 3 instead of 3! for the block' },
      ],
      [
        { value: E(F(n)), trap: 'ignored the restriction' },
        { value: E(6 * F(n - 3)), trap: 'removed all three people instead of replacing them by one block' },
        { value: E(2 * F(n - 2)), trap: 'used 2 orders instead of 3! for the block' },
        { value: E(F(n) / 6), trap: 'divided n! by 3! instead of using a block' },
        { value: E(6 * F(n - 1)), trap: 'used (n − 1)! for the block arrangements' },
      ],
    ],
    ends: [
      [
        { value: E(F(n - 2)), trap: 'forgot that the two can swap ends' },
        { value: E(2 * F(n - 1)), trap: 'treated it as sitting next to each other' },
      ],
      [
        { value: E(F(n)), trap: 'ignored the restriction' },
        { value: E(F(n - 1)), trap: 'gave (n − 1)!' },
        { value: E(F(n) / 2), trap: 'halved n!' },
        { value: E(4 * F(n - 2)), trap: 'doubled twice' },
        { value: E(2 * (n - 1)), trap: 'counted only the positions of the pair, not the other people' },
      ],
    ],
    'left-of': [
      [
        { value: E(2 * F(n - 1)), trap: 'counted both orders of the pair: that is "next to each other"' },
        { value: E(F(n)), trap: 'ignored the restriction' },
      ],
      [
        { value: E(F(n - 2)), trap: 'removed both people instead of gluing them into one block' },
        { value: E(F(n) / 2), trap: 'halved n!' },
        { value: E((n - 1) * F(n - 1)), trap: 'multiplied by the number of positions for the pair' },
        { value: E(2 * F(n - 2)), trap: 'used (n − 2)! for the block' },
      ],
    ],
  };
  const solution = {
    together: `Treat the pair as one block: $${n - 1}$ objects in $${n - 1}! = ${F(n - 1)}$ ways, and 2 orders inside the block: $2 \\times ${F(n - 1)} = ${value}$.`,
    apart: `Total $${n}! = ${F(n)}$. Together: treat the pair as one block, $2 \\times ${n - 1}! = ${2 * F(n - 1)}$. Not together: $${F(n)} - ${2 * F(n - 1)} = ${value}$.`,
    three: `Treat the three as one block: $${n - 2}$ objects in $${n - 2}! = ${F(n - 2)}$ ways, and $3! = 6$ orders inside the block: $6 \\times ${F(n - 2)} = ${value}$.`,
    ends: `The two can take the end seats in 2 ways; the other $${n - 2}$ people fill the middle seats in $${n - 2}! = ${F(n - 2)}$ ways: $2 \\times ${F(n - 2)} = ${value}$.`,
    'left-of': `Glue the pair into one block in that fixed order (no factor 2): $${n - 1}$ objects in $${n - 1}! = ${value}$ ways.`,
  }[mode];
  return {
    stem: `${cap(WORD_NUMBER[n])} people, including ${who}, sit in a row of ${WORD_NUMBER[n]} seats. In how many ways can they be seated if ${condition}?`,
    answer: { kind: 'exact', value: answer },
    options: countOptions(rng, answer, lists[mode][0], lists[mode][1]),
    solution,
    trap: 'Glue the people who must be together into one block, arrange the blocks, then multiply by the orders inside the block; "not together" is total minus together.',
    tags: ['counting', 'permutations', 'restriction'],
    params: { variant: 'together', n, mode },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- brute-force helpers for verify()

function popcount(x: number): number {
  let c = 0;
  while (x) { c += x & 1; x >>= 1; }
  return c;
}

/** Visit every permutation of items (n ≤ 7). */
function forEachPermutation<T>(items: T[], visit: (perm: T[]) => void): void {
  const n = items.length;
  const used = new Array<boolean>(n).fill(false);
  const cur: T[] = [];
  const rec = () => {
    if (cur.length === n) { visit(cur); return; }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      used[i] = true; cur.push(items[i]);
      rec();
      cur.pop(); used[i] = false;
    }
  };
  rec();
}

/** Ordered pairs (i, j) of distinct indices from a colour list; returns counts satisfying the predicates. */
function countPairs(colours: string[], pred: (first: string, second: string) => boolean): { fav: number; total: number } {
  let fav = 0, total = 0;
  for (let i = 0; i < colours.length; i++) {
    for (let j = 0; j < colours.length; j++) {
      if (i === j) continue;
      total++;
      if (pred(colours[i], colours[j])) fav++;
    }
  }
  return { fav, total };
}

const colourList = (r: number, b: number) => [...Array<string>(r).fill('R'), ...Array<string>(b).fill('B')];

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'm1.probability.counting',
  module: 'M1',
  topic: 'probability',
  title: 'Counting, probability trees & expected value',
  levels: {
    1: 'nCr (5C2 = 10) or arrangements of n distinct objects (4! = 24)',
    2: 'two independent events (a head and a six); two draws with replacement',
    3: '"at least one" via the complement; two draws without replacement',
    4: 'expected value of a spinner or dice game',
    5: 'probability trees (total / conditional); arrangements with repeats or people together',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return pickVariant(rng, [chooseQ, arrangeQ]);
        case 2: return pickVariant(rng, [coinDieQ, twoDiceQ, bagReplaceQ]);
        case 3: return pickVariant(rng, [atLeastOneQ, noReplaceQ]);
        case 4: return pickVariant(rng, [spinnerQ, dieGameQ]);
        default: return pickVariant(rng, [treeQ, secondRedQ, lettersQ, togetherQ]);
      }
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const got = q.answer.value.toNumber();
    const close = (x: number) => Math.abs(got - x) < 1e-9;
    const p = q.params as Record<string, unknown>;
    switch (p.variant) {
      case 'choose': {
        const n = p.n as number, r = p.r as number;
        let count = 0;
        for (let mask = 0; mask < 1 << n; mask++) if (popcount(mask) === r) count++;
        return close(count);
      }
      case 'arrange': {
        const n = p.n as number;
        let count = 0;
        forEachPermutation(Array.from({ length: n }, (_, i) => i), () => count++);
        if (p.word && new Set(p.word as string).size !== n) return false; // the word really has distinct letters
        return close(count);
      }
      case 'coin-die': {
        const faces = p.faces as number[];
        let fav = 0;
        for (const coin of [0, 1]) for (let f = 1; f <= 6; f++) if (coin === 0 && faces.includes(f)) fav++;
        return close(fav / 12);
      }
      case 'two-dice': {
        const f1 = p.faces1 as number[], f2 = p.faces2 as number[];
        let fav = 0;
        for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (f1.includes(a) && f2.includes(b)) fav++;
        return close(fav / 36);
      }
      case 'bag-replace': {
        const cols = colourList(p.r as number, p.b as number);
        const ask = p.ask as BagAsk;
        let fav = 0;
        for (const a of cols) for (const b of cols) {
          if (ask === 'both-red' ? a === 'R' && b === 'R' : ask === 'red-then-blue' ? a === 'R' && b === 'B' : a !== b) fav++;
        }
        return close(fav / (cols.length * cols.length));
      }
      case 'at-least-one': {
        const space = p.space as number, good = p.good as number, trials = p.trials as number;
        const total = space ** trials;
        let fav = 0;
        for (let code = 0; code < total; code++) {
          let x = code, hit = false;
          for (let t = 0; t < trials; t++) { if (x % space < good) hit = true; x = Math.floor(x / space); }
          if (hit) fav++;
        }
        return close(fav / total);
      }
      case 'no-replace': {
        const cols = colourList(p.r as number, p.b as number);
        const ask = p.ask as BagAsk;
        const { fav, total } = countPairs(cols, (a, b) => (ask === 'both-red' ? a === 'R' && b === 'R' : ask === 'different' ? a !== b : a === b));
        return close(fav / total);
      }
      case 'spinner': {
        const scores = p.scores as number[], weights = p.weights as number[], D = p.D as number;
        let sum = 0, sectors = 0;
        scores.forEach((s, i) => { for (let w = 0; w < weights[i]; w++) { sum += s; sectors++; } });
        return sectors === D && close(sum / D);
      }
      case 'die-game': {
        const f1 = p.faces1 as number[], f2 = p.faces2 as number[];
        let sum = 0;
        for (let f = 1; f <= 6; f++) sum += f1.includes(f) ? (p.pay1 as number) : f2.includes(f) ? (p.pay2 as number) : 0;
        return close(sum / 6 - (p.cost as number));
      }
      case 'tree': {
        const [pn, pd] = p.p as Fr, [an, ad] = p.q1 as Fr, [bn, bd] = p.q2 as Fr;
        // Equally likely grid: D1 cells decide A, D2 cells decide B given A (or not A).
        const D1 = pd, D2 = lcm(ad, bd);
        let cB = 0, cAB = 0;
        for (let i = 0; i < D1; i++) {
          const A = i < pn;
          for (let j = 0; j < D2; j++) {
            const B = A ? j < an * (D2 / ad) : j < bn * (D2 / bd);
            if (B) { cB++; if (A) cAB++; }
          }
        }
        return p.ask === 'total' ? close(cB / (D1 * D2)) : close(cAB / cB);
      }
      case 'second-red': {
        const cols = colourList(p.r as number, p.b as number);
        const second = countPairs(cols, (_, b) => b === 'R');
        if (p.ask === 'second-red') return close(second.fav / second.total);
        const both = countPairs(cols, (a, b) => a === 'B' && b === 'R');
        return close(both.fav / second.fav);
      }
      case 'letters': {
        const seen = new Set<string>();
        forEachPermutation((p.word as string).split(''), (perm) => seen.add(perm.join('')));
        return close(seen.size);
      }
      case 'together': {
        const n = p.n as number, mode = p.mode as SeatMode;
        let count = 0;
        forEachPermutation(Array.from({ length: n }, (_, i) => i), (perm) => {
          const pos = (k: number) => perm.indexOf(k);
          if (mode === 'three') {
            const ps = [pos(0), pos(1), pos(2)].sort((a, b) => a - b);
            if (ps[2] - ps[0] === 2) count++;
          } else if (mode === 'ends') {
            if (Math.min(pos(0), pos(1)) === 0 && Math.max(pos(0), pos(1)) === n - 1) count++;
          } else if (mode === 'left-of') {
            if (pos(1) === pos(0) + 1) count++;
          } else {
            const adjacent = Math.abs(pos(0) - pos(1)) === 1;
            if (mode === 'together' ? adjacent : !adjacent) count++;
          }
        });
        return close(count);
      }
      default:
        return false;
    }
  },
});
