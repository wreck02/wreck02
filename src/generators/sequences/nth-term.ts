import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { gcd, ordinal, poly } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * The nth term of a sequence.
 * Level 1: linear sequence from its first four terms — the formula, or a later term
 * Level 2: which term takes a given value (solve a + (n − 1)d = V)
 * Level 3: quadratic sequences (constant second difference): the formula or the 10th term
 * Level 4: products n(n + k) (2, 6, 12, 20 …) and fraction sequences (1/2, 2/3, 3/4 …)
 * Level 5: is a given number a term of 3n² + 2, and which term first exceeds a bound
 */

/** A candidate formula: (a n² + b n + c) / (d n² + e n + f), enough for every shape used here. */
type Quad = [number, number, number];
interface Cand { display: string; num: Quad; den: Quad; trap?: string }

const UNIT: Quad = [0, 0, 1];

function evalQuad(q: Quad, n: number): number {
  return q[0] * n * n + q[1] * n + q[2];
}

function evalCand(c: { num: Quad; den: Quad }, n: number): number {
  const d = evalQuad(c.den, n);
  return d === 0 ? NaN : evalQuad(c.num, n) / d;
}

function seqTerms(c: { num: Quad; den: Quad }, count: number): number[] {
  const out: number[] = [];
  for (let n = 1; n <= count; n++) out.push(evalCand(c, n));
  return out;
}

/** Same first four terms as the correct formula? Then the question would be ambiguous. */
function sameStart(a: { num: Quad; den: Quad }, b: { num: Quad; den: Quad }): boolean {
  for (let n = 1; n <= 4; n++) {
    const x = evalCand(a, n), y = evalCand(b, n);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (Math.abs(x - y) > 1e-9 * Math.max(1, Math.abs(y))) return false;
  }
  return true;
}

/** Drop distractor formulas that repeat a display or reproduce the first four terms. */
function usableCands(correct: Cand, wrong: Cand[]): Cand[] {
  const seen = new Set([correct.display]);
  const out: Cand[] = [];
  for (const w of wrong) {
    if (seen.has(w.display)) continue;
    if (!Number.isFinite(evalCand(w, 1)) || sameStart(correct, w)) continue;
    seen.add(w.display);
    out.push(w);
  }
  return out;
}

/** "n", "n + 1", "2n - 1" for a linear coefficient pair. */
function linTex([, b, c]: Quad): string {
  return poly([b, c], 'n');
}

function fracTex(p: number, q: number): string {
  return `\\frac{${p}}{${q}}`;
}

function intList(xs: number[]): string {
  return xs.map((x) => `${x}`).join(',\\ ');
}

/**
 * Offsets for "off by k" distractors. They are deliberately lopsided (and randomly so) so that
 * the correct answer is not always the middle option when the five are sorted.
 */
function offsetSet(rng: RNG): number[] {
  return rng.pick([[-1, 1, 2, 3], [-3, -2, -1, 1], [-2, -1, 1, 2], [-1, 1, 2, 4], [-4, -2, -1, 1], [-2, -1, 1, 3], [-1, -2, -3, 1]]);
}

function offsetTrap(o: number, unit: string): string {
  if (o === 1) return `went one ${unit} too far`;
  if (o === -1) return `stopped one ${unit} short`;
  return `miscounted the ${unit}s by ${Math.abs(o)}`;
}

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

// ----------------------------------------------------------------------------- level 1

/** Linear sequence: give four terms, ask for the nth-term formula. */
function linearFormulaQ(rng: RNG): Generated | null {
  const d = rng.sign() * rng.int(2, 9);
  const a = rng.int(-4, 12);
  if (a - d === 0) return null; // the formula would be a bare "dn": the traps collapse
  const correct: Cand = { display: `$${poly([d, a - d], 'n')}$`, num: [0, d, a - d], den: UNIT };
  const terms = seqTerms(correct, 4);
  if (terms.some((t) => Math.abs(t) > 99)) return null;
  const wrong = usableCands(correct, [
    { display: `$${poly([d, a], 'n')}$`, num: [0, d, a], den: UNIT, trap: 'used the first term as the constant: that is a + nd, not a + (n − 1)d' },
    { display: `$${poly([d, a - 2 * d], 'n')}$`, num: [0, d, a - 2 * d], den: UNIT, trap: 'off by one the other way (subtracted d twice)' },
    { display: `$${poly([d, d - a], 'n')}$`, num: [0, d, d - a], den: UNIT, trap: 'sign error in the constant' },
    { display: `$${poly([a, d], 'n')}$`, num: [0, a, d], den: UNIT, trap: 'first term and common difference swapped' },
    { display: `$${poly([a - d, d], 'n')}$`, num: [0, a - d, d], den: UNIT, trap: 'coefficient and constant the wrong way round' },
    { display: `$${poly([d + 1, a - d], 'n')}$`, num: [0, d + 1, a - d], den: UNIT, trap: 'counted the gaps wrongly, giving the wrong common difference' },
  ]);
  if (wrong.length < 4) return null;
  const cands = [correct, ...wrong];
  return {
    stem: `The first four terms of a sequence are $${intList(terms)},\\ \\dots$\n\nFind an expression for the $n$th term.`,
    answer: { kind: 'choice', value: correct.display },
    options: buildChoiceOptions(rng, correct.display, wrong.map((w) => ({ display: w.display, trap: w.trap }))),
    solution: `The terms go up by $${d}$ each time, so the $n$th term is $${d}n + c$. At $n = 1$ the term is $${terms[0]}$, so $c = ${terms[0]} - ${d < 0 ? `(${d})` : d} = ${a - d}$: the $n$th term is $${poly([d, a - d], 'n')}$.`,
    trap: 'The constant is the term before the first one (a − d), not the first term itself.',
    tags: ['sequences', 'nth-term', 'arithmetic'],
    params: { variant: 'linear-formula', a, d, terms, cands: cands.map((c) => ({ display: c.display, num: c.num, den: c.den })) },
    typedAllowed: false,
  };
}

/** Linear sequence: give four terms, ask for a later term. */
function linearTermQ(rng: RNG): Generated | null {
  const d = rng.sign() * rng.int(2, 9);
  const a = rng.int(-4, 12);
  const n = rng.pick([12, 15, 20, 25, 30]);
  const value = a + (n - 1) * d;
  const terms = [0, 1, 2, 3].map((i) => a + i * d);
  if (terms.some((t) => Math.abs(t) > 99) || Math.abs(value) > 400) return null;
  const answer = E(value);
  const distractors: Distractor[] = [
    { value: E(a + n * d), trap: `used $a + nd$ instead of $a + (n-1)d$ (off by one)` },
    { value: E(n * d), trap: 'forgot the first term: the formula is a + (n − 1)d' },
    { value: E(a * n), trap: 'multiplied the first term by n' },
    ...offsetSet(rng).map((o) => ({ value: E(a + (n - 1 + o) * d), trap: offsetTrap(o, 'step') })),
  ];
  return {
    stem: `The first four terms of a sequence are $${intList(terms)},\\ \\dots$\n\nFind the ${ordinal(n)} term.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `The common difference is $${d}$, so the ${ordinal(n)} term is $${terms[0]} + ${n - 1} \\times ${d < 0 ? `(${d})` : d} = ${value}$.`,
    trap: 'There are only n − 1 steps from the first term to the nth term.',
    tags: ['sequences', 'nth-term', 'arithmetic'],
    params: { variant: 'linear-term', a, d, n, value, terms },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 2

/** Which term equals a given value? */
function whichTermQ(rng: RNG): Generated | null {
  const d = rng.int(2, 9) * (rng.bool(0.8) ? 1 : -1);
  const a = rng.int(-4, 12);
  const n = rng.int(8, 40);
  const value = a + (n - 1) * d;
  const terms = [0, 1, 2, 3].map((i) => a + i * d);
  if (terms.some((t) => Math.abs(t) > 99) || Math.abs(value) > 400) return null;
  if (value === terms[3]) return null;
  const answer = E(n);
  const byFormula = rng.bool(0.5);
  const distractors: Distractor[] = [
    { value: E(n - 1), trap: 'solved a + nd = V, forgetting that the nth term uses n − 1 steps' },
    { value: E(Math.round((value + a) / d)), trap: 'added the first term instead of subtracting it' },
    { value: E(Math.round(value / d)), trap: 'divided the value by the common difference and stopped there' },
    ...offsetSet(rng).map((o) => ({ value: E(n + o), trap: offsetTrap(o, 'step') })),
  ];
  const stem = byFormula
    ? `The $n$th term of a sequence is $${poly([d, a - d], 'n')}$. Find the value of $n$ for which the term is $${value}$.`
    : `The first four terms of a sequence are $${intList(terms)},\\ \\dots$\n\nOne term of the sequence is $${value}$. Find its position $n$ in the sequence.`;
  return {
    stem,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `Solve $${poly([d, a - d], 'n')} = ${value}$: $${d}n = ${value - (a - d)}$, so $n = ${n}$.`,
    trap: 'Set the nth-term formula equal to the value; the constant is a − d, so the count of steps is n − 1.',
    tags: ['sequences', 'nth-term', 'solve'],
    params: { variant: 'which-term', a, d, n, value, terms },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 3

function quadCoefs(rng: RNG): { A: number; B: number; C: number } | null {
  const A = rng.pick([1, 1, 2, 2, 3]);
  const B = rng.nonZeroInt(-5, 5);
  const C = rng.int(-6, 8);
  if (B === 0) return null;
  return { A, B, C };
}

/** Quadratic sequence: give four terms, ask for the nth-term formula. */
function quadFormulaQ(rng: RNG): Generated | null {
  const c0 = quadCoefs(rng);
  if (!c0) return null;
  const { A, B, C } = c0;
  const correct: Cand = { display: `$${poly([A, B, C], 'n')}$`, num: [A, B, C], den: UNIT };
  const terms = seqTerms(correct, 4);
  if (terms.some((t) => t <= 0 || t > 120)) return null;
  const wrong = usableCands(correct, [
    { display: `$${poly([2 * A, B, C], 'n')}$`, num: [2 * A, B, C], den: UNIT, trap: 'used the second difference as the coefficient of n²; it is half of it' },
    { display: `$${poly([A, B + 2 * A, C + A + B], 'n')}$`, num: [A, B + 2 * A, C + A + B], den: UNIT, trap: 'shifted by one: this formula gives the 2nd term first' },
    { display: `$${poly([A, B - 2 * A, C + A - B], 'n')}$`, num: [A, B - 2 * A, C + A - B], den: UNIT, trap: 'shifted by one the other way' },
    { display: `$${poly([A, 0, terms[0] - A], 'n')}$`, num: [A, 0, terms[0] - A], den: UNIT, trap: 'matched An² to the first term only, with no n term' },
    { display: `$${poly([A, B, C + 1], 'n')}$`, num: [A, B, C + 1], den: UNIT, trap: 'slip of one in the constant' },
    { display: `$${poly([A, -B, C], 'n')}$`, num: [A, -B, C], den: UNIT, trap: 'sign error on the n term' },
  ]);
  if (wrong.length < 4) return null;
  const cands = [correct, ...wrong];
  const d1 = terms[1] - terms[0];
  return {
    stem: `The first four terms of a sequence are $${intList(terms)},\\ \\dots$\n\nFind an expression for the $n$th term.`,
    answer: { kind: 'choice', value: correct.display },
    options: buildChoiceOptions(rng, correct.display, wrong.map((w) => ({ display: w.display, trap: w.trap }))),
    solution: `The second difference is $${2 * A}$, so the $n$th term starts $${A === 1 ? '' : A}n^{2}$. Subtracting $${A === 1 ? '' : A}n^{2}$ from the terms leaves $${intList(terms.map((t, i) => t - A * (i + 1) * (i + 1)))},\\ \\dots$, which goes up by $${B}$: the $n$th term is $${poly([A, B, C], 'n')}$.`,
    trap: 'The coefficient of n² is half the (constant) second difference, not the second difference itself.',
    tags: ['sequences', 'nth-term', 'quadratic'],
    params: { variant: 'quad-formula', A, B, C, d1, terms, cands: cands.map((c) => ({ display: c.display, num: c.num, den: c.den })) },
    typedAllowed: false,
  };
}

/** Quadratic sequence: give four terms, ask for the 10th term. */
function quadTermQ(rng: RNG): Generated | null {
  const c0 = quadCoefs(rng);
  if (!c0) return null;
  const { A, B, C } = c0;
  const cand = { num: [A, B, C] as Quad, den: UNIT };
  const terms = seqTerms(cand, 4);
  if (terms.some((t) => t <= 0 || t > 120)) return null;
  const n = rng.pick([8, 10, 10, 12]);
  const value = A * n * n + B * n + C;
  if (value <= 0 || value > 600) return null;
  const answer = E(value);
  const distractors: Distractor[] = [
    { value: E(A * (n - 1) * (n - 1) + B * (n - 1) + C), trap: 'off by one: evaluated the formula at n − 1' },
    { value: E(2 * A * n * n + B * n + C), trap: 'used the second difference as the coefficient of n²' },
    { value: E(A * n * n + C), trap: 'dropped the n term' },
    { value: E(A * n * n + B * n), trap: 'dropped the constant' },
    { value: E(terms[0] + (n - 1) * (terms[1] - terms[0])), trap: 'treated the sequence as arithmetic with the first difference' },
    { value: E(A * (n + 1) * (n + 1) + B * (n + 1) + C), trap: 'evaluated one term too far along' },
  ];
  return {
    stem: `The first four terms of a sequence are $${intList(terms)},\\ \\dots$\n\nThe second difference is constant. Find the ${ordinal(n)} term.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `The second difference is $${2 * A}$, so the $n$th term is $${poly([A, B, C], 'n')}$. At $n = ${n}$ this gives $${value}$.`,
    trap: 'Halve the second difference to get the coefficient of n², then fix the rest from the first term.',
    tags: ['sequences', 'nth-term', 'quadratic'],
    params: { variant: 'quad-term', A, B, C, n, value, terms },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 4

/** 2, 6, 12, 20 → n(n + 1); 3, 10, 21, 36 → n(2n + 1). */
function productShape(a: number, b: number): string {
  if (b === 0) return a === 1 ? '$n^{2}$' : `$${a}n^{2}$`;
  return `$n(${poly([a, b], 'n')})$`;
}

function productQ(rng: RNG): Generated | null {
  const a = rng.pick([1, 1, 1, 2, 3]);
  const b = rng.int(1, 5);
  const correct: Cand = { display: productShape(a, b), num: [a, b, 0], den: UNIT };
  const terms = seqTerms(correct, 4);
  if (terms.some((t) => t > 200)) return null;
  const wrong = usableCands(correct, [
    { display: productShape(a, b - 1), num: [a, b - 1, 0], den: UNIT, trap: 'the second bracket is out by one' },
    { display: productShape(a, b + 1), num: [a, b + 1, 0], den: UNIT, trap: 'the second bracket is out by one' },
    { display: productShape(a, b + 2), num: [a, b + 2, 0], den: UNIT, trap: 'the second bracket is out by two' },
    { display: productShape(a + 1, b), num: [a + 1, b, 0], den: UNIT, trap: 'the coefficient of n inside the bracket is wrong' },
    { display: `$(n + 1)(${poly([a, a + b], 'n')})$`, num: [a, 2 * a + b, a + b], den: UNIT, trap: 'shifted: this formula gives the 2nd term first' },
    { display: a === 1 ? `$n^{2} + ${b}$` : `$${a}n^{2} + ${b}$`, num: [a, 0, b], den: UNIT, trap: 'added b instead of multiplying by the bracket' },
    { display: `$2n(${poly([a, b], 'n')})$`, num: [2 * a, 2 * b, 0], den: UNIT, trap: 'doubled the whole expression' },
  ]);
  if (wrong.length < 4) return null;
  const cands = [correct, ...wrong];
  const factors = [1, 2, 3].map((i) => `${i} \\times ${a * i + b}`);
  return {
    stem: `The first four terms of a sequence are $${intList(terms)},\\ \\dots$\n\nFind an expression for the $n$th term.`,
    answer: { kind: 'choice', value: correct.display },
    options: buildChoiceOptions(rng, correct.display, wrong.map((w) => ({ display: w.display, trap: w.trap }))),
    solution: `Each term is a product: $${factors.join('$, $')}$, so the $n$th term is ${correct.display}.`,
    trap: 'Check the formula at n = 1 and n = 2: a bracket that is out by one still looks right at a glance.',
    tags: ['sequences', 'nth-term', 'products'],
    params: { variant: 'product', a, b, terms, cands: cands.map((c) => ({ display: c.display, num: c.num, den: c.den })) },
    typedAllowed: false,
  };
}

/** The same product sequences, but asking for a later term. */
function productTermQ(rng: RNG): Generated | null {
  const a = rng.pick([1, 1, 2, 3]);
  const b = rng.int(1, 5);
  const terms = seqTerms({ num: [a, b, 0], den: UNIT }, 4);
  if (terms.some((t) => t > 200)) return null;
  const m = rng.pick([8, 10, 10, 12, 15]);
  const f = (x: number) => x * (a * x + b);
  const value = f(m);
  if (value > 900) return null;
  const answer = E(value);
  const distractors: Distractor[] = [
    { value: E(a * m * m + b), trap: 'added b instead of multiplying by the bracket' },
    { value: E(m * (a * m + b + 1)), trap: 'the bracket is out by one' },
    { value: E(terms[0] + (m - 1) * (terms[1] - terms[0])), trap: 'treated the sequence as arithmetic' },
    { value: E((m + 1) * (a * m + b)), trap: 'moved on by one in the first factor only' },
    ...offsetSet(rng).filter((o) => m + o >= 2).map((o) => ({ value: E(f(m + o)), trap: offsetTrap(o, 'term') })),
  ];
  return {
    stem: `The first four terms of a sequence are $${intList(terms)},\\ \\dots$\n\nThe second difference is constant. Find the ${ordinal(m)} term.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `The $n$th term is ${productShape(a, b)}, so the ${ordinal(m)} term is $${m} \\times ${a * m + b} = ${value}$.`,
    trap: 'Write the pattern as a product first; evaluating at n − 1 or n + 1 is the usual slip.',
    tags: ['sequences', 'nth-term', 'products'],
    params: { variant: 'product-term', a, b, n: m, value, terms },
    typedAllowed: true,
  };
}

/** 1/2, 2/3, 3/4 → n/(n + 1). */
function fractionQ(rng: RNG): Generated | null {
  const shapes: { num: Quad; den: Quad }[] = [
    { num: [0, 1, 0], den: [0, 1, 1] },   // n/(n+1)
    { num: [0, 1, 1], den: [0, 1, 2] },   // (n+1)/(n+2)
    { num: [0, 1, 2], den: [0, 1, 3] },   // (n+2)/(n+3)
    { num: [0, 1, 3], den: [0, 1, 4] },   // (n+3)/(n+4)
    { num: [0, 1, 4], den: [0, 1, 5] },   // (n+4)/(n+5)
    { num: [0, 1, 0], den: [0, 2, 1] },   // n/(2n+1)
    { num: [0, 2, -1], den: [0, 2, 1] },  // (2n-1)/(2n+1)
    { num: [0, 4, -1], den: [0, 4, 1] },  // (4n-1)/(4n+1)
    { num: [0, 1, 1], den: [0, 2, 1] },   // (n+1)/(2n+1)
    { num: [0, 2, -1], den: [0, 2, 0] },  // (2n-1)/2n
    { num: [0, 2, 0], den: [0, 2, 1] },   // 2n/(2n+1)
    { num: [0, 3, 0], den: [0, 3, 1] },   // 3n/(3n+1)
    { num: [0, 2, 1], den: [0, 2, 2] },   // (2n+1)/(2n+2)
    { num: [0, 2, 1], den: [0, 2, 3] },   // (2n+1)/(2n+3)
    { num: [0, 1, 0], den: [0, 3, 1] },   // n/(3n+1)
    { num: [0, 1, 0], den: [0, 4, 1] },   // n/(4n+1)
    { num: [0, 3, 1], den: [0, 3, 2] },   // (3n+1)/(3n+2)
    { num: [0, 1, 2], den: [0, 2, 3] },   // (n+2)/(2n+3)
    { num: [0, 2, 1], den: [0, 3, 1] },   // (2n+1)/(3n+1)
  ];
  const pick = rng.pick(shapes);
  const tex = (c: { num: Quad; den: Quad }) => `$\\frac{${linTex(c.num)}}{${linTex(c.den)}}$`;
  const correct: Cand = { display: tex(pick), num: pick.num, den: pick.den };
  // every printed term must already be in its lowest terms, or the pattern is hidden
  const texTerms: string[] = [];
  for (let n = 1; n <= 4; n++) {
    const p = evalQuad(pick.num, n), q = evalQuad(pick.den, n);
    if (q <= 0 || p <= 0 || gcd(p, q) !== 1) return null;
    texTerms.push(fracTex(p, q));
  }
  const terms = seqTerms(pick, 4);
  const variants: { num: Quad; den: Quad; trap: string }[] = [
    { num: pick.num, den: [0, pick.den[1], pick.den[2] + 1], trap: 'denominator out by one' },
    { num: pick.num, den: [0, pick.den[1], pick.den[2] - 1], trap: 'denominator out by one' },
    { num: pick.num, den: [0, pick.den[1], pick.den[2] + 2], trap: 'denominator out by two' },
    { num: [0, pick.num[1], pick.num[2] + 1], den: pick.den, trap: 'numerator out by one' },
    { num: [0, pick.num[1], pick.num[2] - 1], den: pick.den, trap: 'numerator out by one' },
    { num: pick.den, den: pick.num, trap: 'fraction upside down' },
    { num: [0, pick.num[1], pick.num[2] + pick.num[1]], den: [0, pick.den[1], pick.den[2] + pick.den[1]], trap: 'shifted: this formula gives the 2nd term first' },
    { num: pick.num, den: [0, pick.den[1] + 1, pick.den[2]], trap: 'read the denominators as going up in twos' },
    { num: [0, pick.num[1], pick.num[2] + 1], den: [0, pick.den[1], pick.den[2] + 1], trap: 'shifted both parts by one' },
  ];
  /** A fraction option is only plausible if every printed term is positive and the sequence is not constant. */
  const plausible = (c: { num: Quad; den: Quad }) => {
    const ts = seqTerms(c, 4);
    return ts.every((t) => Number.isFinite(t) && t > 0) && ts.some((t) => Math.abs(t - ts[0]) > 1e-9);
  };
  const wrong = usableCands(correct, variants.filter(plausible).map((v) => ({ display: tex(v), num: v.num, den: v.den, trap: v.trap })));
  if (wrong.length < 4) return null;
  const cands = [correct, ...wrong];
  return {
    stem: `The first four terms of a sequence are $${texTerms.join(',\\ ')},\\ \\dots$\n\nFind an expression for the $n$th term.`,
    answer: { kind: 'choice', value: correct.display },
    options: buildChoiceOptions(rng, correct.display, wrong.map((w) => ({ display: w.display, trap: w.trap }))),
    solution: `The numerators are $${linTex(pick.num)}$ and the denominators are $${linTex(pick.den)}$, so the $n$th term is ${correct.display}. Check at $n = 1$: $${texTerms[0]}$.`,
    trap: 'Test the formula at n = 1 and n = 2 — a numerator or denominator out by one matches the first term but not the second.',
    tags: ['sequences', 'nth-term', 'fractions'],
    params: { variant: 'fraction', terms, cands: cands.map((c) => ({ display: c.display, num: c.num, den: c.den })) },
    typedAllowed: false,
  };
}

// ----------------------------------------------------------------------------- level 5

/** Least n with An² + C greater than a bound. */
function firstExceedsQ(rng: RNG): Generated | null {
  const A = rng.pick([2, 3, 4, 5]);
  const C = rng.pick([-2, -1, 1, 2, 3, 5]);
  const T = rng.pick([200, 300, 400, 500, 600, 800, 1000]);
  const f = (n: number) => A * n * n + C;
  let n = 1;
  while (f(n) <= T && n < 100) n++;
  if (n < 7 || n > 22) return null;
  if (f(n - 1) === T || f(n) === T) return null; // "exceeds" would be ambiguous
  const answer = E(n);
  const distractors: Distractor[] = [
    { value: E(Math.floor(Math.sqrt(T / A))), trap: 'ignored the constant and rounded the wrong way' },
    { value: E(Math.ceil(Math.sqrt((T + C) / A))), trap: 'added the constant instead of subtracting it' },
    ...offsetSet(rng).filter((o) => n + o >= 2).map((o) => ({ value: E(n + o), trap: offsetTrap(o, 'term') })),
  ];
  return {
    stem: `The $n$th term of a sequence is $${poly([A, 0, C], 'n')}$. Find the least value of $n$ for which the term is greater than $${T}$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `$${poly([A, 0, C], 'n')} > ${T}$ gives $n^{2} > ${((T - C) / A).toFixed(2).replace(/\.?0+$/, '')}$, and $${n - 1}^{2} = ${(n - 1) * (n - 1)}$, $${n}^{2} = ${n * n}$, so $n = ${n}$ (the term is $${f(n)}$).`,
    trap: 'Square-root the bound, then check the two whole numbers either side — rounding alone is not enough.',
    tags: ['sequences', 'nth-term', 'inequality'],
    params: { variant: 'first-exceeds', A, C, T, n },
    typedAllowed: true,
  };
}

/** Is a given number a term of An² + C? */
function membershipQ(rng: RNG): Generated | null {
  const A = rng.pick([2, 3, 4, 5]);
  const C = rng.pick([-1, 1, 2, 3, 5]);
  const f = (n: number) => A * n * n + C;
  const k = rng.int(6, 11);
  const isTerm = rng.bool(0.5);
  const V = isTerm ? f(k) : f(k) + rng.pick([-6, -4, -3, 3, 4, 6]);
  if (V <= 0 || V > 900) return null;
  let found = 0;
  for (let n = 1; n <= 60; n++) if (f(n) === V) found = n;
  if (isTerm !== (found > 0)) return null;
  const none = 'It is not a term of the sequence.';
  const positions = [k - 2, k - 1, k, k + 1, k + 2].filter((m) => m >= 1);
  const offered = rng.shuffle(positions.filter((m) => m !== found)).slice(0, found > 0 ? 3 : 4);
  if (offered.length < (found > 0 ? 3 : 4)) return null;
  const label = (m: number) => `It is the ${ordinal(m)} term.`;
  const correct = found > 0 ? label(found) : none;
  const wrong = [
    ...offered.map((m) => ({ display: label(m), trap: 'solved An² + C = V but slipped when square-rooting' })),
    ...(found > 0 ? [{ display: none, trap: 'decided the equation had no whole-number solution' }] : []),
  ];
  return {
    stem: `The $n$th term of a sequence is $${poly([A, 0, C], 'n')}$.\n\nWhich of the following is true of the number $${V}$?`,
    answer: { kind: 'choice', value: correct },
    options: buildChoiceOptions(rng, correct, wrong),
    solution: `$${poly([A, 0, C], 'n')} = ${V}$ gives $n^{2} = ${(V - C) / A}$, ${found > 0 ? `so $n = ${found}$.` : 'which is not a square number, so there is no such term.'}`,
    trap: 'Subtract the constant and divide by the coefficient first; only then ask whether the result is a square number.',
    tags: ['sequences', 'nth-term', 'membership'],
    params: { variant: 'membership', A, C, V, correct },
    typedAllowed: false,
  };
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'm1.sequences.nth-term',
  module: 'M1',
  topic: 'sequences',
  title: 'nth term of a sequence',
  levels: {
    1: 'linear sequence from four terms: the nth-term formula, or a later term',
    2: 'which term takes a given value (solve a + (n − 1)d = V)',
    3: 'quadratic sequence (constant second difference): formula or the 10th term',
    4: 'products n(n + 1) (2, 6, 12, 20 …) and fraction sequences (1/2, 2/3, 3/4 …)',
    5: 'is 200 a term of 3n² + 2, and which term first exceeds 500',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return pickVariant(rng, [linearFormulaQ, linearFormulaQ, linearTermQ]);
        case 2: return whichTermQ(rng);
        case 3: return pickVariant(rng, [quadFormulaQ, quadFormulaQ, quadTermQ]);
        case 4: return pickVariant(rng, [productQ, productTermQ, fractionQ, fractionQ]);
        default: return pickVariant(rng, [firstExceedsQ, membershipQ]);
      }
    });
  },
  verify(q) {
    const p = q.params as {
      variant: string; a?: number; b?: number; d?: number; A?: number; B?: number; C?: number; n?: number;
      value?: number; T?: number; V?: number; k?: number; correct?: string; terms?: number[];
      cands?: { display: string; num: Quad; den: Quad }[];
    };
    const close = (x: number, y: number) => Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(y));

    // Choice variants: rebuild the sequence from every candidate formula and see which one
    // actually produces the terms printed in the stem.
    if (p.cands) {
      if (q.answer.kind !== 'choice' || !p.terms) return false;
      const matches = p.cands.filter((c) => p.terms!.every((t, i) => {
        const v = evalCand(c, i + 1);
        return Number.isFinite(v) && close(v, t);
      }));
      if (matches.length !== 1) return false;
      return matches[0].display === q.answer.value && q.options.filter((o) => o.correct).length === 1;
    }

    if (p.variant === 'membership') {
      if (q.answer.kind !== 'choice') return false;
      const f = (n: number) => p.A! * n * n + p.C!;
      let pos = 0;
      for (let n = 1; n <= 80; n++) if (f(n) === p.V!) pos = n;
      const expected = pos > 0 ? `It is the ${ordinal(pos)} term.` : 'It is not a term of the sequence.';
      return expected === q.answer.value && q.options.filter((o) => o.correct).length === 1;
    }

    if (q.answer.kind !== 'exact') return false;
    const got = q.answer.value.toNumber();
    if (!isCleanExact(q.answer.value).ok) return false;

    switch (p.variant) {
      case 'linear-term': {
        // build the sequence term by term instead of using a + (n − 1)d
        let x = p.a!;
        for (let i = 1; i < p.n!; i++) x += p.d!;
        return close(got, x) && p.terms!.every((t, i) => close(t, p.a! + i * p.d!));
      }
      case 'which-term': {
        // step through the sequence until the value appears
        let x = p.a!, idx = 1;
        while (idx < 200 && x !== p.value!) { x += p.d!; idx++; }
        return x === p.value! && close(got, idx);
      }
      case 'product-term': {
        const f = (x: number) => x * (p.a! * x + p.b!);
        if (!p.terms!.every((t, i) => close(t, f(i + 1)))) return false;
        return close(got, f(p.n!));
      }
      case 'quad-term': {
        const f = (n: number) => p.A! * n * n + p.B! * n + p.C!;
        // second differences must really be constant, and the terms must match the stem
        const secondDiff = f(4) - 2 * f(3) + f(2);
        if (secondDiff !== 2 * p.A!) return false;
        if (!p.terms!.every((t, i) => close(t, f(i + 1)))) return false;
        return close(got, f(p.n!));
      }
      case 'first-exceeds': {
        const f = (n: number) => p.A! * n * n + p.C!;
        const n = Math.round(got);
        return Number.isInteger(n) && n >= 1 && f(n) > p.T! && f(n - 1) <= p.T!;
      }
      default:
        return false;
    }
  },
});
