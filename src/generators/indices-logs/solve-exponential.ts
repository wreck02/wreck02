import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { linear } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Exponential and logarithmic equations with a common base.
 * Level 1: 2^x = 32, log_2 8
 * Level 2: 3^(x−1) = 27, log_10 1000, log_5 (1/25)
 * Level 3: 4^x = 8, 9^x = 27 (write both sides as powers of the same prime ⇒ x = 3/2)
 * Level 4: 25^x = 1/125, log_8 4 = 2/3, log_4 (1/8) = −3/2
 * Level 5: 2^(2x+1) = 8^(x−1); log_2 24 − log_2 3; log_9 27 + log_4 8; 3 log_2 4 − log_2 8
 *          (and the coefficient questions carry a twist: ½ log_2 32, or a composite base such as 2 log_4 8 − log_2 8)
 *
 * The level-5 sub-variant is drawn once and then built inside its own attempt loop, so a
 * rejection inside a variant never re-rolls the variant pick (otherwise the variants with strict
 * cleanliness filters, like the mixed-base logs, become rare).
 *
 * params are uniform so verify() can substitute numerically:
 *   { kind: 'exp', lhs: {base, m, s}, rhs: {base, m, s} }   meaning  base^(m·x + s) on each side
 *   { kind: 'log', terms: [{coef, base, num, den}] }          meaning  Σ coef · log_base(num/den)
 */

interface Side { base: number; m: number; s: number }
interface LogTerm { coef: number; base: number; num: number; den: number }

/** Keep only distractors the exam could print. */
function clean(ds: Distractor[]): Distractor[] {
  return ds.filter((d) => Number.isFinite(d.value.toNumber()) && isCleanExact(d.value).ok);
}

/** Try `fn` up to n times; null if it never succeeds. */
function attempt<T>(n: number, fn: () => T | null): T | null {
  for (let i = 0; i < n; i++) {
    const r = fn();
    if (r !== null) return r;
  }
  return null;
}

function logTex(base: number, arg: string | number): string {
  return `\\log_{${base}} ${arg}`;
}
function recipTex(n: number): string {
  return `\\left(\\frac{1}{${n}}\\right)`;
}
function coefTex(k: number): string {
  if (k === 1) return '';
  if (k === 0.5) return '\\tfrac{1}{2}';
  return `${k}`;
}

/** (base, exponent) pairs for the "which power?" questions; picked uniformly over pairs so the answers spread out. */
const PLAIN_POWERS: Record<1 | 2, [number, number][]> = {
  1: [[2, 3], [2, 4], [2, 5], [2, 6], [2, 7], [3, 2], [3, 3], [3, 4], [5, 2], [5, 3], [10, 2], [10, 3], [10, 4], [10, 5], [4, 2], [4, 3]],
  2: [[2, 3], [2, 4], [2, 5], [2, 6], [2, 7], [2, 8], [3, 3], [3, 4], [3, 5], [5, 3], [5, 4], [10, 3], [10, 4], [10, 5], [10, 6], [4, 3], [4, 4], [6, 3], [7, 3]],
};

/** Prime-power pool for the common-base questions: p^a with a ≥ 2 as the base, p^c as the argument. */
const COMMON_BASE: { p: number; maxA: number; maxC: number }[] = [
  { p: 2, maxA: 5, maxC: 7 },
  { p: 3, maxA: 4, maxC: 5 },
  { p: 5, maxA: 3, maxC: 4 },
  { p: 10, maxA: 3, maxC: 4 },
];

/** Draw (p, a, c) with a ≥ 2 and c/a not an integer. */
function drawCommonBase(rng: RNG): { p: number; a: number; c: number } | null {
  const { p, maxA, maxC } = rng.pick(COMMON_BASE);
  const a = rng.int(2, maxA);
  const c = rng.int(1, maxC);
  if (c % a === 0) return null;
  return { p, a, c };
}

function pickPlain(rng: RNG, lv: 1 | 2): { b: number; n: number } {
  const [b, n] = rng.pick(PLAIN_POWERS[lv]);
  return { b, n };
}

const TAGS = ['indices', 'logarithms', 'exponential-equations'];

/** Integer mistakes for "which power of b gives b^n?" (asked as an equation or as a log). */
function whichPowerDistractors(b: number, n: number): Distractor[] {
  const bn = b ** n;
  return clean([
    { value: E(n - 1), trap: 'counted one power too few' },
    { value: E(n + 1), trap: 'counted one power too many' },
    { value: E(bn / b), trap: `divided ${bn} by ${b} instead of asking "which power of ${b}?"` },
    { value: E(b * n), trap: 'multiplied the base by the power instead of raising it' },
    { value: E(2 * n), trap: 'doubled the power' },
    { value: E(n + 2), trap: 'counted two powers too many' },
  ]);
}

// ----------------------------------------------------------------------------
// Levels 1–4
// ----------------------------------------------------------------------------

function plainExp(rng: RNG, lv: 1 | 2): Generated {
  const { b, n } = pickPlain(rng, lv);
  const bn = b ** n;
  const answer = E(n);
  return {
    stem: `Solve $${b}^{x} = ${bn}$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, whichPowerDistractors(b, n)),
    solution: `$${bn} = ${b}^{${n}}$, so $x = ${n}$.`,
    trap: `x is the power, not the quotient: ${b}^x = ${bn} asks "which power of ${b} is ${bn}?"`,
    tags: TAGS,
    params: { kind: 'exp', variant: 'plain', lhs: { base: b, m: 1, s: 0 }, rhs: { base: bn, m: 0, s: 1 } },
    typedAllowed: true,
  };
}

function plainLog(rng: RNG, lv: 1 | 2): Generated {
  const { b, n } = pickPlain(rng, lv);
  const bn = b ** n;
  const answer = E(n);
  return {
    stem: `Find the value of $${logTex(b, bn)}$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, whichPowerDistractors(b, n)),
    solution: `$${bn} = ${b}^{${n}}$, so $${logTex(b, bn)} = ${n}$.`,
    trap: 'log_b N is the power to which b must be raised to give N.',
    tags: TAGS,
    params: { kind: 'log', variant: 'plain', terms: [{ coef: 1, base: b, num: bn, den: 1 }] },
    typedAllowed: true,
  };
}

function level2(rng: RNG): Generated | null {
  const variant = rng.weighted(['shift', 'neglog', 'plainlog'] as const, [4, 3, 3]);
  if (variant === 'shift') {
    const { b, n } = pickPlain(rng, 2);
    const bn = b ** n;
    const s = rng.pick([-3, -2, -1, 1, 2, 3]);
    const x = n - s;
    if (x === 0 || Math.abs(x) > 9) return null;
    const answer = E(x);
    const exp = linear(1, s);
    const distractors = clean([
      { value: E(n + s), trap: 'moved the constant across with the wrong sign' },
      { value: E(n), trap: 'ignored the constant in the exponent' },
      { value: E(s - n), trap: `sign error: solved ${exp} = ${n} as x = ${s} − ${n}` },
      { value: E(bn / b - s), trap: `read ${b}^{${exp}} as ${b}(${exp})` },
      { value: E(bn / b), trap: `divided ${bn} by ${b} and ignored the constant` },
      { value: E(x + 1), trap: `miscounted the power: ${bn} is ${b}^${n}, not ${b}^${n + 1}` },
      { value: E(x - 1), trap: `miscounted the power: ${bn} is ${b}^${n}, not ${b}^${n - 1}` },
    ]);
    return {
      stem: `Solve $${b}^{${exp}} = ${bn}$.`,
      answer: { kind: 'exact', value: answer },
      options: buildOptions(rng, answer, distractors),
      solution: `$${bn} = ${b}^{${n}}$, so $${exp} = ${n}$ and $x = ${x}$.`,
      trap: 'Equate the powers first, then solve the linear equation in x (watch the sign of the constant).',
      tags: TAGS,
      params: { kind: 'exp', variant: 'shift', lhs: { base: b, m: 1, s }, rhs: { base: bn, m: 0, s: 1 } },
      typedAllowed: true,
    };
  }
  if (variant === 'neglog') {
    const b = rng.pick([2, 3, 5, 10]);
    const n = rng.int(2, b === 2 ? 5 : b === 3 ? 4 : 3);
    const bn = b ** n;
    const answer = E(-n);
    // The three instructive mistakes always appear (the two reciprocals come as a pair), plus one integer slip.
    const slip = rng.pick([
      { value: E(-(n - 1)), trap: 'counted one power too few' },
      { value: E(-(n + 1)), trap: 'counted one power too many' },
      { value: E(-(bn / b)), trap: 'divided the number by the base' },
    ]);
    const distractors = clean([
      { value: E(n), trap: 'dropped the minus sign: 1/b^n = b^(−n)' },
      { value: frac(1, n), trap: 'took the reciprocal of the log instead of a negative power' },
      { value: frac(-1, n), trap: 'swapped the base and the argument' },
      slip,
    ]);
    return {
      stem: `Find the value of $${logTex(b, recipTex(bn))}$.`,
      answer: { kind: 'exact', value: answer },
      options: buildOptions(rng, answer, distractors),
      solution: `$\\frac{1}{${bn}} = ${b}^{-${n}}$, so the value is $-${n}$.`,
      trap: 'A reciprocal argument gives a negative log; the sign is the whole question.',
      tags: TAGS,
      params: { kind: 'log', variant: 'neglog', terms: [{ coef: 1, base: b, num: 1, den: bn }] },
      typedAllowed: true,
    };
  }
  return plainLog(rng, 2);
}

function level3(rng: RNG): Generated | null {
  const d = drawCommonBase(rng);
  if (!d) return null;
  const { p, a, c } = d;
  const B = p ** a, N = p ** c;
  const answer = frac(c, a);
  const distractors = clean([
    { value: frac(a, c), trap: 'divided the exponents the wrong way round' },
    { value: frac(N, B), trap: `divided the numbers: ${N} ÷ ${B}` },
    { value: E(c - a), trap: 'subtracted the exponents' },
    { value: E(c), trap: `forgot to write ${B} as a power of ${p}` },
    { value: E(a * c), trap: 'multiplied the exponents' },
    { value: answer.neg(), trap: 'sign error' },
  ]);
  return {
    stem: `Solve $${B}^{x} = ${N}$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `Write both sides as powers of $${p}$: $${B}^{x} = ${p}^{${a}x}$ and $${N} = ${p}^{${c}}$, so $${a}x = ${c}$ and $x = ${answer.toLatex()}$.`,
    trap: `${B}^x = ${N} does not give x = ${N}/${B}: convert both sides to powers of ${p} and equate exponents.`,
    tags: TAGS,
    params: { kind: 'exp', variant: 'common-base', lhs: { base: B, m: 1, s: 0 }, rhs: { base: N, m: 0, s: 1 } },
    typedAllowed: true,
  };
}

function level4(rng: RNG): Generated | null {
  const d = drawCommonBase(rng);
  if (!d) return null;
  const { p, a, c } = d;
  const B = p ** a, N = p ** c;
  const variant = rng.pick(['expneg', 'logfrac', 'logneg'] as const);
  if (variant === 'expneg') {
    const answer = frac(-c, a);
    const distractors = clean([
      { value: frac(c, a), trap: 'dropped the minus sign from 1/N = p^(−c)' },
      { value: frac(-a, c), trap: 'divided the exponents the wrong way round' },
      { value: E(a - c), trap: 'subtracted the exponents' },
      { value: frac(-N, B), trap: `divided the numbers: −${N} ÷ ${B}` },
      { value: E(-c), trap: `forgot to write ${B} as a power of ${p}` },
    ]);
    return {
      stem: `Solve $${B}^{x} = \\frac{1}{${N}}$.`,
      answer: { kind: 'exact', value: answer },
      options: buildOptions(rng, answer, distractors),
      solution: `$${B} = ${p}^{${a}}$ and $\\frac{1}{${N}} = ${p}^{-${c}}$, so $${a}x = -${c}$ and $x = ${answer.toLatex()}$.`,
      trap: 'Write both sides as powers of the same prime; the reciprocal makes the exponent negative.',
      tags: TAGS,
      params: { kind: 'exp', variant: 'expneg', lhs: { base: B, m: 1, s: 0 }, rhs: { base: p, m: 0, s: -c } },
      typedAllowed: true,
    };
  }
  const neg = variant === 'logneg';
  const answer = neg ? frac(-c, a) : frac(c, a);
  const argTex = neg ? recipTex(N) : `${N}`;
  const distractors = clean([
    { value: answer.neg(), trap: neg ? 'dropped the minus sign' : 'sign error' },
    { value: neg ? frac(-a, c) : frac(a, c), trap: 'swapped the base and the argument' },
    { value: neg ? frac(a, c) : frac(-a, c), trap: 'inverted and sign error' },
    { value: E(neg ? a - c : c - a), trap: 'subtracted the exponents' },
    { value: neg ? frac(-N, B) : frac(N, B), trap: `divided the numbers: ${N} ÷ ${B}` },
    { value: E(neg ? -c : c), trap: `forgot that the base is ${p}^${a}, not ${p}` },
  ]);
  const ySign = neg ? '-' : '';
  return {
    stem: `Find the value of $${logTex(B, argTex)}$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `Let $y = ${logTex(B, argTex)}$, so $${B}^{y} = ${neg ? `\\frac{1}{${N}}` : N}$. In powers of $${p}$: $${p}^{${a}y} = ${p}^{${ySign}${c}}$, so $${a}y = ${ySign}${c}$ and $y = ${answer.toLatex()}$.`,
    trap: 'log_(p^a)(p^c) = c/a: the base exponent goes on the bottom, and a reciprocal argument flips the sign.',
    tags: TAGS,
    params: { kind: 'log', variant, terms: [{ coef: 1, base: B, num: neg ? 1 : N, den: neg ? N : 1 }] },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------
// Level 5 sub-variants
// ----------------------------------------------------------------------------

type Variant5 = 'both-sides' | 'difference' | 'sum' | 'mixed-bases' | 'coefficients';

/** (p^a1)^(m x + s) = (p^a2)^(n x + t) */
function bothSides(rng: RNG): Generated | null {
  const p = rng.pick([2, 2, 3, 5]);
  const [a1, a2] = rng.pickDistinct(p === 5 ? [1, 2, 3] : [1, 2, 3, 4], 2);
  const m = rng.int(1, 3), n = rng.int(1, 3);
  const s = rng.int(-4, 4), t = rng.int(-4, 4);
  if (s === 0 && t === 0) return null;
  if (m === n && s === t) return null; // a^u = b^u is a different (and trivial) question
  const den = a1 * m - a2 * n;
  if (den === 0) return null;
  const X = frac(a2 * t - a1 * s, den);
  if (X.isZero() || X.toRat().d > 2n || Math.abs(X.toNumber()) > 8) return null;
  const B1 = p ** a1, B2 = p ** a2;
  const lhs = linear(m, s), rhs = linear(n, t);
  const power = E(a1).mul(E(m).mul(X).add(E(s))); // the common exponent of p once x is known
  const distractors = clean([
    { value: frac(t - s, den), trap: 'multiplied only the x-terms by the powers, not the constants' },
    ...(a1 > 1 ? [{ value: frac(a2 * t - s, den), trap: `rewrote ${B1}^{${lhs}} as ${p}^{${linear(a1 * m, s)}}: the constant was not multiplied` }] : []),
    ...(a2 > 1 ? [{ value: frac(t - a1 * s, den), trap: `rewrote ${B2}^{${rhs}} as ${p}^{${linear(a2 * n, t)}}: the constant was not multiplied` }] : []),
    ...(m !== n ? [{ value: frac(t - s, m - n), trap: 'equated the exponents without converting to a common base' }] : []),
    { value: X.neg(), trap: 'sign error when collecting terms' },
    { value: frac(a2 * t + a1 * s, den), trap: 'moved the constant across with the wrong sign' },
    { value: frac(a2 * t - a1 * s, a1 * m + a2 * n), trap: 'moved the x-term across with the wrong sign' },
    ...(a2 * m - a1 * n !== 0 ? [{ value: frac(a1 * t - a2 * s, a2 * m - a1 * n), trap: 'applied each power to the wrong side' }] : []),
    ...(m !== n ? [{ value: frac(t + a2 - s - a1, m - n), trap: 'added the power instead of multiplying the exponent by it' }] : []),
    ...(power.isInteger() && Math.abs(power.toNumber()) <= 12 ? [{ value: power, trap: `gave the common power of ${p} (${power.toLatex()}) instead of x` }] : []),
  ]);
  return {
    stem: `Solve $${B1}^{${lhs}} = ${B2}^{${rhs}}$.`,
    answer: { kind: 'exact', value: X },
    options: buildOptions(rng, X, distractors),
    solution: `Both sides are powers of $${p}$: $${p}^{${a1 === 1 ? lhs : `${a1}(${lhs})`}} = ${p}^{${a2 === 1 ? rhs : `${a2}(${rhs})`}}$, so $${linear(a1 * m, a1 * s)} = ${linear(a2 * n, a2 * t)}$ and $x = ${X.toLatex()}$.`,
    trap: 'Every part of the exponent gets multiplied when you rewrite the base (8^(x−1) = 2^(3x−3), not 2^(3x−1)).',
    tags: TAGS,
    params: { kind: 'exp', variant: 'both-sides', lhs: { base: B1, m, s }, rhs: { base: B2, m: n, s: t } },
    typedAllowed: true,
  };
}

/** log_b M − log_b N with M = N b^k */
function difference(rng: RNG): Generated | null {
  const b = rng.pick([2, 3, 5, 10]);
  const k = rng.int(2, b === 2 ? 5 : b === 3 ? 3 : 2);
  const N = rng.pick([2, 3, 5, 6, 7, 9, 12].filter((v) => v !== b && v % b !== 0 && v !== b * b));
  const M = N * b ** k;
  if (M > 1000) return null;
  const answer = E(k);
  const distractors = clean([
    { value: E(b ** k), trap: `stopped at ${M} ÷ ${N} = ${b ** k} and forgot to take the log` },
    { value: E(-k), trap: 'subtracted the other way round' },
    { value: E(k + 1), trap: `miscounted the power: ${b ** k} is ${b}^${k}` },
    { value: E(k - 1), trap: `miscounted the power: ${b ** k} is ${b}^${k}` },
    { value: E(M - N), trap: 'subtracted the arguments: log a − log b is not log(a − b)' },
  ]);
  return {
    stem: `Find the value of $${logTex(b, M)} - ${logTex(b, N)}$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `$${logTex(b, M)} - ${logTex(b, N)} = ${logTex(b, `\\frac{${M}}{${N}}`)} = ${logTex(b, b ** k)} = ${k}$.`,
    trap: 'log a − log b = log(a/b); the answer is the power, not the quotient itself.',
    tags: TAGS,
    params: { kind: 'log', variant: 'difference', terms: [{ coef: 1, base: b, num: M, den: 1 }, { coef: -1, base: b, num: N, den: 1 }] },
    typedAllowed: true,
  };
}

/** log_b M + log_b N with MN = b^k, neither M nor N itself a power of b */
function sum(rng: RNG): Generated | null {
  const b = rng.pick([4, 6, 8, 9, 10, 12]);
  const k = rng.pick(b === 12 ? [2] : [2, 3]);
  const P = b ** k;
  const isPow = (v: number) => { let w = 1; while (w < v) w *= b; return w === v; };
  const pairs: [number, number][] = [];
  for (let M = 2; M * M < P; M++) if (P % M === 0 && !isPow(M) && !isPow(P / M)) pairs.push([M, P / M]);
  if (pairs.length === 0) return null;
  let [M, N] = rng.pick(pairs);
  if (rng.bool()) [M, N] = [N, M];
  const answer = E(k);
  const distractors = clean([
    { value: E(M + N), trap: 'added the arguments: log a + log b is not log(a + b)' },
    { value: E(P), trap: `stopped at ${M} × ${N} = ${P} and forgot to take the log` },
    { value: E(k + 1), trap: `miscounted the power: ${P} is ${b}^${k}` },
    { value: E(k - 1), trap: `miscounted the power: ${P} is ${b}^${k}` },
    { value: E(2 * k), trap: 'doubled' },
    { value: E(-k), trap: 'sign error' },
  ]);
  return {
    stem: `Find the value of $${logTex(b, M)} + ${logTex(b, N)}$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `$${logTex(b, M)} + ${logTex(b, N)} = ${logTex(b, `(${M} \\times ${N})`)} = ${logTex(b, P)} = ${k}$ since $${P} = ${b}^{${k}}$.`,
    trap: 'log a + log b = log(ab), never log(a + b).',
    tags: TAGS,
    params: { kind: 'log', variant: 'sum', terms: [{ coef: 1, base: b, num: M, den: 1 }, { coef: 1, base: b, num: N, den: 1 }] },
    typedAllowed: true,
  };
}

/** log_(p^a) p^c ± log_(q^a') q^c' with different bases: each is c/a, then combine */
function mixedBases(rng: RNG): Generated | null {
  const d1 = drawCommonBase(rng), d2 = drawCommonBase(rng);
  if (!d1 || !d2) return null;
  const B1 = d1.p ** d1.a, N1 = d1.p ** d1.c, B2 = d2.p ** d2.a, N2 = d2.p ** d2.c;
  if (B1 === B2) return null; // that would be a same-base question
  const v1 = frac(d1.c, d1.a), v2 = frac(d2.c, d2.a);
  const sgn = rng.bool(0.6) ? 1 : -1;
  const answer = sgn > 0 ? v1.add(v2) : v1.sub(v2);
  // Keep the combined value exam-like (3, 4/3, 7/4 …) rather than 16/15.
  if (answer.isZero() || answer.toRat().d > 4n) return null;
  const op = sgn > 0 ? '+' : '-';
  const w1 = frac(d1.a, d1.c), w2 = frac(d2.a, d2.c);
  const distractors = clean([
    { value: sgn > 0 ? v1.sub(v2) : v1.add(v2), trap: 'sign slip on the second log' },
    { value: sgn > 0 ? w1.add(w2) : w1.sub(w2), trap: 'swapped base and argument in each log (a/c instead of c/a)' },
    { value: sgn > 0 ? frac(d1.c + d2.c, d1.a + d2.a) : (d1.a !== d2.a ? frac(d1.c - d2.c, d1.a - d2.a) : E(0)), trap: 'combined numerators and denominators separately' },
    { value: v1.mul(v2), trap: 'multiplied the two logs' },
    { value: E(sgn > 0 ? d1.c + d2.c : d1.c - d2.c), trap: 'ignored the powers in the bases' },
    { value: v1, trap: 'evaluated only the first log' },
  ]);
  return {
    stem: `Find the value of $${logTex(B1, N1)} ${op} ${logTex(B2, N2)}$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `$${logTex(B1, N1)} = ${v1.toLatex()}$ because $${B1}^{${v1.toLatex()}} = ${d1.p}^{${d1.c}} = ${N1}$; likewise $${logTex(B2, N2)} = ${v2.toLatex()}$. The ${sgn > 0 ? 'sum' : 'difference'} is $${answer.toLatex()}$.`,
    trap: 'Different bases cannot be combined: evaluate each log separately as c/a from p^a and p^c.',
    tags: TAGS,
    params: { kind: 'log', variant: 'mixed-bases', terms: [{ coef: 1, base: B1, num: N1, den: 1 }, { coef: sgn, base: B2, num: N2, den: 1 }] },
    typedAllowed: true,
  };
}

/**
 * k1 log(...) ± k2 log_b(b^e2) with a twist on the first term:
 *   plain:     3 log_2 4 − log_2 8            (integer coefficients, different arguments)
 *   half:      ½ log_2 32 − log_2 4           (a half on an odd power ⇒ a half-integer)
 *   composite: 2 log_4 8 + log_2 8            (a composite base ⇒ c/a first)
 */
function coefficients(rng: RNG): Generated | null {
  const twist = rng.weighted(['plain', 'half', 'composite'] as const, [4, 3, 3]);
  const b = rng.pick([2, 2, 3, 5]);
  const maxE = b === 2 ? 5 : b === 3 ? 4 : 3;
  const sgn = rng.bool(0.7) ? -1 : 1;
  const op = sgn > 0 ? '+' : '-';
  // second term: k2 · log_b(b^e2), e2 ≥ 2 so it is never log_b b
  const k2 = rng.pick([1, 1, 2, 3]);
  const e2 = rng.int(2, maxE);
  const v2 = E(k2 * e2);
  const A2 = b ** e2;

  let k1: number, base1: number, arg1: number, v1: Exact;
  let bare: Exact; // the first log without its coefficient
  let why = '';
  let compA = 1, compC = 0; // composite base b^compA with argument b^compC
  if (twist === 'plain') {
    k1 = rng.pick([2, 3, 4]);
    const e1 = rng.intExcluding(2, maxE, [e2]);
    base1 = b; arg1 = b ** e1; bare = E(e1); v1 = E(k1 * e1);
  } else if (twist === 'half') {
    k1 = 0.5;
    const odd = [3, 5].filter((e) => e <= maxE && e !== e2);
    if (odd.length === 0) return null;
    const e1 = rng.pick(odd);
    base1 = b; arg1 = b ** e1; bare = E(e1); v1 = frac(e1, 2);
  } else {
    compA = rng.pick([2, 3]);
    base1 = b ** compA;
    if (base1 > 27) return null;
    compC = rng.pick([1, 2, 3, 4, 5].filter((v) => v % compA !== 0 && v <= (b === 2 ? 5 : 4)));
    k1 = rng.weighted([1, 2, compA, 2 * compA, 3], [3, 2, 4, 1, 1]);
    if (k1 > 4) return null;
    arg1 = b ** compC; bare = frac(compC, compA); v1 = bare.mulRat(k1);
    why = ` (since $${base1}^{${bare.toLatex()}} = ${b}^{${compC}} = ${arg1}$)`;
  }
  const answer = v1.add(v2.mulRat(sgn));
  if (answer.isZero() || answer.toRat().d > 4n || Math.abs(answer.toNumber()) > 12) return null;
  if (base1 === b && arg1 === A2) return null;

  const t2 = v2.mulRat(sgn);
  const firstPlain = `log_${base1} ${arg1}`;
  const distractors = clean([
    { value: bare.add(t2), trap: twist === 'half' ? 'ignored the ½' : 'ignored the coefficient' },
    { value: bare.add(E(k1)).add(t2), trap: 'added the coefficient to the log instead of multiplying' },
    { value: v1.sub(t2), trap: 'sign slip on the second term' },
    sgn > 0 ? { value: v1.mul(v2), trap: 'treated log a + log b as (log a)(log b)' } : { value: v1.div(v2), trap: 'treated log a − log b as (log a) ÷ (log b)' },
    ...(k2 === 1 ? [{ value: bare.add(E(sgn * e2)).mulRat(k1), trap: 'applied the coefficient to both logs' }] : []),
    { value: v1, trap: 'dropped the second term' },
    ...(k2 > 1 ? [{ value: v1.add(E(sgn * e2)), trap: 'ignored the coefficient on the second term' }] : []),
    ...(twist === 'composite' ? [
      { value: frac(k1 * compA, compC).add(t2), trap: `inverted ${firstPlain}: used a/c instead of c/a` },
      { value: E(k1 * compC).add(t2), trap: `read ${firstPlain} as ${compC}, ignoring the power in the base` },
    ] : []),
  ]);
  const firstEval = `$${logTex(base1, arg1)} = ${bare.toLatex()}$${why}`;
  const secondEval = `$${logTex(b, A2)} = ${e2}$`;
  const product = `${coefTex(k1)}${k1 === 1 ? '' : ' \\times '}${bare.toLatex()} ${op} ${k2 === 1 ? '' : `${k2} \\times `}${e2}`;
  return {
    stem: `Find the value of $${coefTex(k1)}${logTex(base1, arg1)} ${op} ${coefTex(k2)}${logTex(b, A2)}$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `${firstEval} and ${secondEval}, so the expression is $${product} = ${v1.toLatex()} ${op} ${v2.toLatex()} = ${answer.toLatex()}$.`,
    trap: twist === 'composite'
      ? 'With a composite base, log_(p^a)(p^c) = c/a; evaluate each log before applying its coefficient.'
      : 'A coefficient multiplies the log (k log a = log a^k); evaluate each log first and the arithmetic is quick.',
    tags: TAGS,
    params: { kind: 'log', variant: 'coefficients', twist, terms: [{ coef: k1, base: base1, num: arg1, den: 1 }, { coef: sgn * k2, base: b, num: A2, den: 1 }] },
    typedAllowed: true,
  };
}

function level5(rng: RNG, variant: Variant5): Generated | null {
  switch (variant) {
    case 'both-sides': return bothSides(rng);
    case 'difference': return difference(rng);
    case 'sum': return sum(rng);
    case 'mixed-bases': return mixedBases(rng);
    default: return coefficients(rng);
  }
}

export default defineTemplate({
  id: 'm1.indices-logs.solve-exponential',
  module: 'M1',
  topic: 'indices-logs',
  title: 'Exponential and log equations',
  levels: {
    1: '2^x = 32, log_2 8',
    2: '3^(x−1) = 27, log_10 1000, log_5 (1/25)',
    3: '4^x = 8, 9^x = 27 (common base, fractional x)',
    4: '25^x = 1/125, log_8 4, log_4 (1/8)',
    5: '2^(2x+1) = 8^(x−1); log_2 24 − log_2 3; log_9 27 + log_4 8; 3 log_2 4 − log_2 8',
  },
  generate(rng, level: Level) {
    return retry(rng, (): Generated | null => {
      if (level === 1) return rng.bool(0.5) ? plainExp(rng, 1) : plainLog(rng, 1);
      if (level === 2) return level2(rng);
      if (level === 3) return level3(rng);
      if (level === 4) return level4(rng);
      // Level 5: draw the sub-variant once, then build it inside its own attempt loop so that the
      // strict cleanliness filters (mixed bases, coefficients) do not skew the mix.
      const variant = rng.weighted(['both-sides', 'difference', 'sum', 'mixed-bases', 'coefficients'] as const, [5, 3, 2, 5, 5]);
      return attempt(80, () => level5(rng, variant));
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const ans: Exact = q.answer.value;
    if (!ans.isRational()) return false;
    const x = ans.toNumber();
    const p = q.params as { kind: 'exp'; lhs: Side; rhs: Side } | { kind: 'log'; terms: LogTerm[] };
    if (p.kind === 'exp') {
      // Substitute x back into base^(m x + s) on both sides.
      const l = Math.pow(p.lhs.base, p.lhs.m * x + p.lhs.s);
      const r = Math.pow(p.rhs.base, p.rhs.m * x + p.rhs.s);
      return Number.isFinite(l) && Number.isFinite(r) && Math.abs(l - r) <= 1e-9 * Math.max(1, Math.abs(l), Math.abs(r));
    }
    // Evaluate the log expression numerically with natural logs.
    let total = 0;
    for (const t of p.terms) total += (t.coef * Math.log(t.num / t.den)) / Math.log(t.base);
    return Math.abs(total - x) <= 1e-9 * Math.max(1, Math.abs(x));
  },
});
