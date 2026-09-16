import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, Exact } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { gcd } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * The standard series results Σr, Σr², Σr³ and the identities built from them.
 * Level 1: Σ_{r=1}^{10} r = 55; Σ_{r=1}^{n}(2r − 1) = n²
 * Level 2: Σ_{r=1}^{4} r² = 30; Σ_{r=1}^{5} r³ = 225
 * Level 3: Σ_{r=1}^{10}(3r + 2) = 185; a sum starting away from r = 1, such as Σ_{r=5}^{15} r
 * Level 4: Σ r(r + 1) = Σr² + Σr; Σ (2r + 1)²; Σ_{r=p}^{q} r²
 * Level 5: which closed form equals Σ f(r)? (choice) — the summand and the limits both vary
 */

type SumId = 'r' | 'odd' | 'even' | 'sq' | 'cube' | 'linear' | 'r-r1' | 'odd-sq' | 'r-rk' | 'lin-sq';

/** The r-th term of each summand — the only thing verify() needs. */
function term(id: SumId, r: number, a = 0, b = 0): number {
  switch (id) {
    case 'r': return r;
    case 'odd': return 2 * r - 1;
    case 'even': return 2 * r;
    case 'sq': return r * r;
    case 'cube': return r * r * r;
    case 'linear': return a * r + b;
    case 'r-r1': return r * (r + 1);
    case 'odd-sq': return (2 * r + 1) * (2 * r + 1);
    case 'r-rk': return r * (r + a);
    case 'lin-sq': return (a * r + b) * (a * r + b);
  }
}

const S1 = (n: number): number => (n * (n + 1)) / 2;
const S2 = (n: number): number => (n * (n + 1) * (2 * n + 1)) / 6;
const S3 = (n: number): number => S1(n) * S1(n);

/** The summand as LaTeX. */
function termTex(id: SumId, a = 0, b = 0): string {
  switch (id) {
    case 'r': return 'r';
    case 'odd': return '(2r - 1)';
    case 'even': return '2r';
    case 'sq': return 'r^2';
    case 'cube': return 'r^3';
    case 'linear': return `(${a === 1 ? '' : a === -1 ? '-' : a}r ${b >= 0 ? '+' : '-'} ${Math.abs(b)})`;
    case 'r-r1': return 'r(r + 1)';
    case 'odd-sq': return '(2r + 1)^2';
    case 'r-rk': return `r(r ${a >= 0 ? '+' : '-'} ${Math.abs(a)})`;
    case 'lin-sq': return b === 0 ? `(${a === 1 ? '' : a}r)^2` : `(${a === 1 ? '' : a}r ${b > 0 ? '+' : '-'} ${Math.abs(b)})^2`;
  }
}

const sigma = (id: SumId, lo: number | string, hi: number | string, a = 0, b = 0): string =>
  `\\sum_{r=${lo}}^{${hi}} ${termTex(id, a, b)}`;

function cleanOnly(ds: { value: Exact | null; trap: string }[]): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } =>
    d.value !== null && Number.isFinite(d.value.toNumber()) && isCleanExact(d.value).ok);
}

/** Spec-named traps first, then the extras, so the headline mistakes are never shuffled out. */
function ranked(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], count = 4): Distractor[] {
  const seen: Exact[] = [answer];
  const out: Distractor[] = [];
  const take = (d: Distractor) => {
    if (out.length >= count || seen.some((s) => s.equals(d.value))) return;
    seen.push(d.value);
    out.push(d);
  };
  must.forEach(take);
  rng.shuffle(extra).forEach(take);
  return out;
}

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

/** Build the whole question once the summand, the limits and the distractors are known. */
function numericQuestion(
  rng: RNG,
  opts: { id: SumId; lo: number; hi: number; a?: number; b?: number; value: number; stem: string; solution: string; trap: string; must: Distractor[]; extra: Distractor[] },
): Generated | null {
  const answer = E(opts.value);
  if (!isCleanExact(answer).ok || Math.abs(opts.value) > 4000) return null;
  const whole = (ds: Distractor[]) => ds.filter((d) => d.value.isInteger() && Math.abs(d.value.toNumber()) <= 6000);
  return {
    stem: opts.stem,
    answer: { kind: 'exact' as const, value: answer },
    options: buildOptions(rng, answer, ranked(rng, answer, whole(opts.must), whole(opts.extra))),
    solution: opts.solution,
    trap: opts.trap,
    tags: ['series', 'sigma-notation', 'standard-results'],
    params: { variant: 'value', id: opts.id, lo: opts.lo, hi: opts.hi, a: opts.a ?? 0, b: opts.b ?? 0 },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 1

function sumRQ(rng: RNG): Generated | null {
  const n = rng.int(8, 25);
  const value = S1(n);
  const asList = rng.bool(0.4);
  return numericQuestion(rng, {
    id: 'r', lo: 1, hi: n, value,
    stem: asList
      ? `Find the value of $1 + 2 + 3 + \\dots + ${n}$.`
      : `Find the value of $${sigma('r', 1, n)}$.`,
    solution: `$\\sum_{r=1}^{n} r = \\frac{n(n+1)}{2} = \\frac{${n} \\times ${n + 1}}{2} = ${value}$.`,
    trap: 'The sum of the first n integers is n(n + 1)/2 — dropping the 2 doubles the answer.',
    must: cleanOnly([
      { value: E(n * (n + 1)), trap: 'forgot to divide n(n + 1) by 2' },
      { value: E(S1(n - 1)), trap: 'off by one: summed only to n − 1' },
      { value: E(n * n), trap: 'used n² instead of n(n + 1)/2' },
    ]),
    extra: cleanOnly([
      { value: E(S1(n + 1)), trap: 'off by one: summed one term too many' },
      { value: E(Math.round((n * n) / 2)), trap: 'used n²/2' },
      { value: E(value + n), trap: 'added the last term twice' },
    ]),
  });
}

function sumOddQ(rng: RNG): Generated | null {
  const n = rng.int(9, 22);
  const value = n * n;
  const asList = rng.bool(0.35);
  return numericQuestion(rng, {
    id: 'odd', lo: 1, hi: n, value,
    stem: asList
      ? `Find the value of $1 + 3 + 5 + \\dots + ${2 * n - 1}$.`
      : `Find the value of $${sigma('odd', 1, n)}$.`,
    solution: `The first $n$ odd numbers add to $n^2$: the sum is $${n}^2 = ${value}$. (Or $2\\sum r - n = ${n * (n + 1)} - ${n}$.)`,
    trap: 'Σ(2r − 1) = n², not n(n + 1): forgetting to subtract the n ones doubles the leading term.',
    must: cleanOnly([
      { value: E(n * (n + 1)), trap: 'forgot to subtract the n ones (that is Σ2r)' },
      { value: E(S1(n)), trap: 'summed r instead of 2r − 1' },
      { value: E((n - 1) * (n - 1)), trap: 'off by one in the number of terms' },
    ]),
    extra: cleanOnly([
      { value: E((n + 1) * (n + 1)), trap: 'off by one in the number of terms' },
      { value: E(n * n - n), trap: 'subtracted n from n² as well' },
      { value: E(2 * n - 1), trap: 'quoted the last term instead of the sum' },
    ]),
  });
}

// ----------------------------------------------------------------------------- level 2

function sumSquareQ(rng: RNG): Generated | null {
  const n = rng.int(4, 12);
  const value = S2(n);
  const asList = rng.bool(0.4);
  return numericQuestion(rng, {
    id: 'sq', lo: 1, hi: n, value,
    stem: asList
      ? `Find the value of $1^2 + 2^2 + 3^2 + \\dots + ${n}^2$.`
      : `Find the value of $${sigma('sq', 1, n)}$.`,
    solution: `$\\sum_{r=1}^{n} r^2 = \\frac{n(n+1)(2n+1)}{6} = \\frac{${n} \\times ${n + 1} \\times ${2 * n + 1}}{6} = ${value}$.`,
    trap: 'Σr² is not (Σr)²: squaring the sum is the classic slip.',
    must: cleanOnly([
      { value: E(S3(n)), trap: 'squared the sum instead of summing the squares' },
      { value: E(n * (n + 1) * (2 * n + 1)), trap: 'forgot to divide by 6' },
      { value: E(S1(n)), trap: 'summed r instead of r²' },
    ]),
    extra: cleanOnly([
      { value: E(S2(n - 1)), trap: 'off by one: summed only to n − 1' },
      { value: E((n * (n + 1) * (2 * n + 1)) / 3), trap: 'divided by 3 instead of 6' },
      { value: E(value + n * n), trap: 'added the last square twice' },
      { value: E(S2(n + 1)), trap: 'off by one: summed one term too many' },
    ]),
  });
}

function sumCubeQ(rng: RNG): Generated | null {
  const n = rng.int(4, 9);
  const value = S3(n);
  const asList = rng.bool(0.4);
  return numericQuestion(rng, {
    id: 'cube', lo: 1, hi: n, value,
    stem: asList
      ? `Find the value of $1^3 + 2^3 + 3^3 + \\dots + ${n}^3$.`
      : `Find the value of $${sigma('cube', 1, n)}$.`,
    solution: `$\\sum_{r=1}^{n} r^3 = \\left(\\frac{n(n+1)}{2}\\right)^2 = ${S1(n)}^2 = ${value}$.`,
    trap: 'Σr³ is the square of Σr — using Σr² or forgetting to square gives the wrong order of magnitude.',
    must: cleanOnly([
      { value: E(S1(n)), trap: 'forgot to square: that is Σr' },
      { value: E(S2(n)), trap: 'used the formula for Σr²' },
      { value: E(S1(n) * S1(n) * 2), trap: 'doubled instead of squaring' },
    ]),
    extra: cleanOnly([
      { value: E(S3(n - 1)), trap: 'off by one: summed only to n − 1' },
      { value: E(n * n * n), trap: 'quoted the last cube' },
      { value: E(value + n * n * n), trap: 'added the last cube twice' },
    ]),
  });
}

// ----------------------------------------------------------------------------- level 3

function sumLinearQ(rng: RNG): Generated | null {
  const a = rng.pick([2, 3, 4, 5, -2, -3]);
  const b = rng.nonZeroInt(-5, 6);
  const n = rng.int(8, 14);
  const value = a * S1(n) + b * n;
  if (value <= 0) return null;
  return numericQuestion(rng, {
    id: 'linear', lo: 1, hi: n, a, b, value,
    stem: `Find the value of $${sigma('linear', 1, n, a, b)}$.`,
    solution: `Split the sum: $${a}\\sum_{r=1}^{${n}} r + ${n} \\times ${b < 0 ? `(${b})` : b} = ${a < 0 ? `(${a})` : a} \\times ${S1(n)} ${b >= 0 ? '+' : '-'} ${Math.abs(b * n)} = ${value}$.`,
    trap: 'The constant is added once per term: Σ(ar + b) = aΣr + bn, not aΣr + b.',
    must: cleanOnly([
      { value: E(a * S1(n) + b), trap: 'added the constant once instead of n times' },
      { value: E(a * n * (n + 1) + b * n), trap: 'forgot to halve n(n + 1)' },
      { value: E(a * S1(n)), trap: 'dropped the constant term altogether' },
    ]),
    extra: cleanOnly([
      { value: E((a + b) * S1(n)), trap: 'added the constant to the coefficient of r' },
      { value: E(a * S1(n - 1) + b * (n - 1)), trap: 'off by one: summed only to n − 1' },
      { value: E(a * n + b * n), trap: 'used the last term n times' },
      { value: E(value + a), trap: 'arithmetic slip of one term' },
    ]),
  });
}

function sumRangeQ(rng: RNG): Generated | null {
  const lo = rng.int(4, 9);
  const hi = rng.int(lo + 4, 22);
  const value = S1(hi) - S1(lo - 1);
  return numericQuestion(rng, {
    id: 'r', lo, hi, value,
    stem: `Find the value of $${sigma('r', lo, hi)}$.`,
    solution: `$\\sum_{r=${lo}}^{${hi}} r = \\sum_{r=1}^{${hi}} r - \\sum_{r=1}^{${lo - 1}} r = ${S1(hi)} - ${S1(lo - 1)} = ${value}$.`,
    trap: 'Subtract the terms below the lower limit — that is the sum to lo − 1, not to lo.',
    must: cleanOnly([
      { value: E(S1(hi)), trap: 'forgot to subtract the terms before r = lo' },
      { value: E(S1(hi) - S1(lo)), trap: 'off by one: subtracted the sum to lo instead of to lo − 1' },
      { value: E(S1(hi) - S1(lo - 2)), trap: 'off by one the other way' },
    ]),
    extra: cleanOnly([
      { value: E(((hi + lo) * (hi - lo)) / 2), trap: 'used one term too few in the number-of-terms count' },
      { value: E(hi * hi - lo * lo), trap: 'used a difference of squares' },
      { value: E(value + hi), trap: 'counted the last term twice' },
      { value: E(S1(hi - lo + 1)), trap: 'summed 1 to (number of terms) instead' },
    ]),
  });
}

// ----------------------------------------------------------------------------- level 4

function sumProductQ(rng: RNG): Generated | null {
  const n = rng.int(5, 11);
  const value = S2(n) + S1(n);
  return numericQuestion(rng, {
    id: 'r-r1', lo: 1, hi: n, value,
    stem: `Find the value of $${sigma('r-r1', 1, n)}$.`,
    solution: `Expand first: $\\sum r(r+1) = \\sum r^2 + \\sum r = ${S2(n)} + ${S1(n)} = ${value}$. (Check: $\\frac{n(n+1)(n+2)}{3} = \\frac{${n} \\times ${n + 1} \\times ${n + 2}}{3}$.)`,
    trap: 'Expand before summing: Σr(r + 1) = Σr² + Σr, not (Σr)(Σr + 1).',
    must: cleanOnly([
      { value: E(S2(n)), trap: 'summed r² only' },
      { value: E(S1(n) * (S1(n) + 1)), trap: 'multiplied the sums instead of summing the products' },
      { value: E((n * (n + 1) * (n + 2)) / 6), trap: 'divided by 6 instead of 3' },
    ]),
    extra: cleanOnly([
      { value: E(S1(n)), trap: 'summed r only' },
      { value: E(S2(n) + S1(n) - n * (n + 1)), trap: 'off by one: summed only to n − 1' },
      { value: E(S2(n) + 2 * S1(n)), trap: 'counted Σr twice' },
      { value: E(n * (n + 1)), trap: 'quoted the last term' },
    ]),
  });
}

function sumOddSquareQ(rng: RNG): Generated | null {
  const n = rng.int(4, 8);
  const value = 4 * S2(n) + 4 * S1(n) + n;
  return numericQuestion(rng, {
    id: 'odd-sq', lo: 1, hi: n, value,
    stem: `Find the value of $${sigma('odd-sq', 1, n)}$.`,
    solution: `Expand: $\\sum (4r^2 + 4r + 1) = 4 \\times ${S2(n)} + 4 \\times ${S1(n)} + ${n} = ${value}$.`,
    trap: 'Square the bracket first: the cross term 4r and the n ones are both easy to lose.',
    must: cleanOnly([
      { value: E(4 * S2(n) + n), trap: 'lost the cross term 4r when squaring' },
      { value: E(4 * S2(n) + 4 * S1(n)), trap: 'forgot the n ones' },
      { value: E((2 * S1(n) + n) * (2 * S1(n) + n)), trap: 'squared the sum instead of summing the squares' },
    ]),
    extra: cleanOnly([
      { value: E(4 * S2(n) + 4 * S1(n) + 1), trap: 'added the 1 once instead of n times' },
      { value: E(S2(n) + S1(n) + n), trap: 'forgot the factors of 4' },
      { value: E(value - (2 * n + 1) * (2 * n + 1)), trap: 'off by one: summed only to n − 1' },
      { value: E(4 * S2(n + 1) + 4 * S1(n + 1) + n + 1), trap: 'off by one: summed one term too many' },
    ]),
  });
}

function sumSquareRangeQ(rng: RNG): Generated | null {
  const lo = rng.int(3, 7);
  const hi = rng.int(lo + 2, 11);
  const value = S2(hi) - S2(lo - 1);
  return numericQuestion(rng, {
    id: 'sq', lo, hi, value,
    stem: `Find the value of $${sigma('sq', lo, hi)}$.`,
    solution: `$\\sum_{r=${lo}}^{${hi}} r^2 = \\sum_{r=1}^{${hi}} r^2 - \\sum_{r=1}^{${lo - 1}} r^2 = ${S2(hi)} - ${S2(lo - 1)} = ${value}$.`,
    trap: 'Subtract the squares below the lower limit — the sum to lo − 1, not to lo.',
    must: cleanOnly([
      { value: E(S2(hi)), trap: 'forgot to subtract the terms before r = lo' },
      { value: E(S2(hi) - S2(lo)), trap: 'off by one: subtracted the sum to lo instead of to lo − 1' },
      { value: E(S1(hi) - S1(lo - 1)), trap: 'summed r instead of r²' },
    ]),
    extra: cleanOnly([
      { value: E(S2(hi) - S2(lo - 2)), trap: 'off by one the other way' },
      { value: E((S1(hi) - S1(lo - 1)) * (S1(hi) - S1(lo - 1))), trap: 'squared the sum instead of summing the squares' },
      { value: E(value + hi * hi), trap: 'counted the last square twice' },
      { value: E(hi * hi - lo * lo), trap: 'used a difference of squares' },
    ]),
  });
}

// ----------------------------------------------------------------------------- level 5

/** A polynomial in n, highest power first (so it can be evaluated by Horner in verify). */
type Poly = number[];

function pMul(a: Poly, b: Poly): Poly {
  const out = new Array(a.length + b.length - 1).fill(0);
  a.forEach((x, i) => b.forEach((y, j) => { out[i + j] += x * y; }));
  return out;
}

/** A candidate closed form: how it is printed, and the polynomial it stands for. */
interface Form { tex: string; coeffs: Poly }

/** "(2n + 1)", "(n - 3)", "n", "2n" — a linear factor [a, b] meaning a·n + b. */
function facTex(a: number, b: number): string {
  const an = a === 1 ? 'n' : a === -1 ? '-n' : `${a}n`;
  return b === 0 ? an : `(${an} ${b > 0 ? '+' : '-'} ${Math.abs(b)})`;
}

/** A product of linear factors over a divisor, e.g. [[1,0],[1,1],[2,1]], 6 → n(n+1)(2n+1)/6. */
function prod(factors: [number, number][], div = 1, tex?: string): Form {
  let p: Poly = [1];
  for (const [a, b] of factors) p = pMul(p, [a, b]);
  const body = factors.map(([a, b]) => facTex(a, b)).join('');
  return { tex: tex ?? (div === 1 ? body : `\\frac{${body}}{${div}}`), coeffs: p.map((c) => c / div) };
}

const sameForm = (a: Form, b: Form): boolean =>
  [1, 2, 3, 4, 5, 6].every((n) => Math.abs(evalPoly(a.coeffs, n) - evalPoly(b.coeffs, n)) < 1e-9);

function evalPoly(c: Poly, n: number): number {
  return c.reduce((s, k) => s * n + k, 0);
}

interface FormulaSpec {
  id: SumId;
  a: number;
  b: number;
  /** limits as [multiple of n, constant]: [0, 1] is r = 1, [2, 0] is r = 2n. */
  lo: [number, number];
  hi: [number, number];
  correct: Form;
  wrong: { form: Form; trap: string }[];
}

const limitTex = ([m, c]: [number, number]): string => {
  if (m === 0) return `${c}`;
  const mn = m === 1 ? 'n' : `${m}n`;
  return c === 0 ? mn : `${mn} ${c > 0 ? '+' : '-'} ${Math.abs(c)}`;
};

/** n(An + C), with any common factor taken outside: n(3n + 6) is printed as 3n(n + 2). */
function linProd(A: number, C: number, div = 1): Form {
  if (C === 0) {
    const sq = `${A === 1 ? '' : A}n^2`;
    return prod([[A, 0], [1, 0]], div, div === 1 ? sq : `\\frac{${sq}}{${div}}`);
  }
  const g = gcd(Math.abs(A), Math.abs(C));
  return g > 1 ? prod([[g, 0], [A / g, C / g]], div) : prod([[1, 0], [A, C]], div);
}

/** Σ(ar + b) with a even, so the closed form n(An + C) with A = a/2, C = a/2 + b stays tidy. */
function linearFormula(rng: RNG): FormulaSpec {
  const a = rng.pick([2, 2, 4, 6]);
  const b = rng.int(1 - a, 3);
  const A = a / 2, C = A + b;
  return {
    id: 'linear', a, b, lo: [0, 1], hi: [1, 0],
    correct: linProd(A, C),
    wrong: [
      { form: linProd(a, a + b), trap: 'forgot the 2 in n(n + 1)/2 when summing ar' },
      { form: linProd(a, b), trap: 'multiplied the last term by n' },
      { form: linProd(A, C, 2), trap: 'halved one time too many' },
      { form: prod([[A, 0], [1, 1]], 1, A === 1 ? 'n(n + 1)' : `${A}n(n + 1)`), trap: 'dropped the constant term' },
      { form: { tex: `${A === 1 ? '' : A}n^2 ${C > 0 ? '+' : '-'} ${Math.abs(C)}`, coeffs: [A, 0, C] }, trap: 'added the constant once instead of n times' },
      { form: linProd(A, C + 1), trap: 'slip of one inside the bracket' },
    ],
  };
}

/** Σ r, Σ r² and Σ r³: the three results that have to be known by heart. */
function standardFormula(rng: RNG): FormulaSpec {
  const which = rng.pick(['r', 'sq', 'cube'] as const);
  if (which === 'r') {
    return {
      id: 'r', a: 0, b: 0, lo: [0, 1], hi: [1, 0],
      correct: prod([[1, 0], [1, 1]], 2),
      wrong: [
        { form: prod([[1, 0], [1, 1]]), trap: 'that is Σ2r: the division by 2 was dropped' },
        { form: prod([[1, 0], [1, 0]], 1, 'n^2'), trap: 'that is Σ(2r − 1)' },
        { form: prod([[1, 0], [1, -1]], 2), trap: 'off by one: that is the sum to n − 1' },
        { form: prod([[1, 0], [1, 1]], 4), trap: 'halved one time too many' },
        { form: prod([[1, 0], [1, 0]], 2, '\\frac{n^2}{2}'), trap: 'dropped the +1 from n(n + 1)/2' },
      ],
    };
  }
  if (which === 'sq') {
    return {
      id: 'sq', a: 0, b: 0, lo: [0, 1], hi: [1, 0],
      correct: prod([[1, 0], [1, 1], [2, 1]], 6),
      wrong: [
        { form: prod([[1, 0], [1, 1], [2, 1]], 3), trap: 'divided by 3 instead of by 6' },
        { form: prod([[1, 0], [1, 0], [1, 1], [1, 1]], 4, '\\left(\\frac{n(n+1)}{2}\\right)^2'), trap: 'that is Σr³, the square of Σr' },
        { form: prod([[1, 0], [1, 1]], 2), trap: 'that is Σr' },
        { form: prod([[1, 0], [1, 0], [1, 0]], 3, '\\frac{n^3}{3}'), trap: 'integrated r² instead of summing it' },
        { form: prod([[1, 0], [1, 1], [2, 1]], 2), trap: 'divided by 2 instead of by 6' },
      ],
    };
  }
  return {
    id: 'cube', a: 0, b: 0, lo: [0, 1], hi: [1, 0],
    correct: prod([[1, 0], [1, 0], [1, 1], [1, 1]], 4, '\\frac{n^2(n+1)^2}{4}'),
    wrong: [
      { form: prod([[1, 0], [1, 0], [1, 1], [1, 1]], 2, '\\frac{n^2(n+1)^2}{2}'), trap: 'halved instead of quartering the square of n(n + 1)' },
      { form: prod([[1, 0], [1, 1], [2, 1]], 6), trap: 'that is Σr²' },
      { form: prod([[1, 0], [1, 1]], 2), trap: 'forgot to square: that is Σr' },
      { form: prod([[1, 0], [1, 0], [1, 1]], 2, '\\frac{n^2(n+1)}{2}'), trap: 'used n² where n(n + 1) belongs' },
      { form: prod([[1, 0], [1, 1], [1, 2]], 3), trap: 'that is Σr(r + 1)' },
    ],
  };
}

/** Σ r(r + k) for odd k, whose closed form is n(n+1)(n+j)/3 with j = (3k+1)/2. */
function productFormula(rng: RNG): FormulaSpec {
  const k = rng.pick([1, 3, 5]);
  const j = (3 * k + 1) / 2;
  return {
    id: 'r-rk', a: k, b: 0, lo: [0, 1], hi: [1, 0],
    correct: prod([[1, 0], [1, 1], [1, j]], 3),
    wrong: [
      { form: prod([[1, 0], [1, 1], [1, j]], 6), trap: 'divided by 6 instead of by 3' },
      { form: prod([[1, 0], [1, 1], [2, 1]], 6), trap: `that is Σr² alone: the ${k}r term was dropped` },
      { form: prod([[1, 0], [1, 1], [1, j]], 2), trap: 'divided by 2 instead of by 3' },
      { form: prod([[1, 0], [1, 1]], 2), trap: 'that is Σr' },
      { form: prod([[1, 0], [1, 1], [1, j + 1]], 3), trap: 'slip of one inside the last bracket' },
      { form: prod([[1, 0], [1, 0], [1, 1], [1, 1]], 4, '\\left(\\frac{n(n+1)}{2}\\right)^2'), trap: 'that is Σr³' },
    ],
  };
}

/** Σ (2r)² = 2n(n+1)(2n+1)/3 and Σ (2r − 1)² = n(2n−1)(2n+1)/3. */
function squareFormula(rng: RNG): FormulaSpec {
  if (rng.bool(0.5)) {
    return {
      id: 'lin-sq', a: 2, b: 0, lo: [0, 1], hi: [1, 0],
      correct: prod([[2, 0], [1, 1], [2, 1]], 3),
      wrong: [
        { form: prod([[1, 0], [1, 1], [2, 1]], 6), trap: 'that is Σr²: the factor of 4 was dropped' },
        { form: prod([[1, 0], [1, 1], [2, 1]], 3), trap: 'took out a factor of 2 instead of 4' },
        { form: prod([[4, 0], [1, 1], [2, 1]], 3), trap: 'doubled the whole sum' },
        { form: prod([[1, 0], [1, 0], [1, 1], [1, 1]], 1, 'n^2(n+1)^2'), trap: 'squared the sum Σ2r instead of summing the squares' },
        { form: prod([[2, 0], [1, 1], [2, 1]], 6), trap: 'divided by 6 instead of by 3' },
      ],
    };
  }
  return {
    id: 'lin-sq', a: 2, b: -1, lo: [0, 1], hi: [1, 0],
    correct: prod([[1, 0], [2, -1], [2, 1]], 3),
    wrong: [
      { form: prod([[1, 0], [2, -1], [2, 1]], 6), trap: 'divided by 6 instead of by 3' },
      { form: prod([[1, 0], [1, 0], [1, 0], [1, 0]], 1, 'n^4'), trap: 'squared Σ(2r − 1) = n² instead of summing the squares' },
      { form: prod([[1, 0], [1, 0]], 1, 'n^2'), trap: 'that is Σ(2r − 1): the bracket was never squared' },
      { form: prod([[1, 0], [1, 1], [2, 1]], 6), trap: 'that is Σr²' },
      { form: prod([[1, 0], [2, -1], [2, 1]], 2), trap: 'divided by 2 instead of by 3' },
    ],
  };
}

/** Sums whose limits depend on n: Σ_{r=n+1}^{2n} r, Σ_{r=n}^{2n} r and Σ_{r=1}^{2n} r. */
function rangeFormula(rng: RNG): FormulaSpec {
  const which = rng.pick([0, 1, 2]);
  if (which === 0) {
    return {
      id: 'r', a: 0, b: 0, lo: [1, 1], hi: [2, 0],
      correct: prod([[1, 0], [3, 1]], 2),
      wrong: [
        { form: prod([[1, 0], [2, 1]]), trap: 'that is the sum all the way from r = 1 to r = 2n' },
        { form: prod([[1, 0], [1, 1]], 2), trap: 'that is the sum from r = 1 to r = n' },
        { form: prod([[1, 0], [3, 1]]), trap: 'forgot to halve' },
        { form: prod([[3, 0], [1, 1]], 2), trap: 'included r = n as well' },
        { form: prod([[1, 0], [3, -1]], 2), trap: 'subtracted the sum to n + 1 instead of to n' },
      ],
    };
  }
  if (which === 1) {
    return {
      id: 'r', a: 0, b: 0, lo: [1, 0], hi: [2, 0],
      correct: prod([[3, 0], [1, 1]], 2),
      wrong: [
        { form: prod([[1, 0], [3, 1]], 2), trap: 'left out the term r = n' },
        { form: prod([[1, 0], [2, 1]]), trap: 'that is the sum all the way from r = 1 to r = 2n' },
        { form: prod([[1, 0], [1, 1]], 2), trap: 'that is the sum from r = 1 to r = n' },
        { form: prod([[3, 0], [1, 1]]), trap: 'forgot to halve' },
        { form: prod([[3, 0], [1, -1]], 2), trap: 'slip of one inside the bracket' },
      ],
    };
  }
  return {
    id: 'r', a: 0, b: 0, lo: [0, 1], hi: [2, 0],
    correct: prod([[1, 0], [2, 1]]),
    wrong: [
      { form: prod([[2, 0], [2, 1]]), trap: 'forgot to divide 2n(2n + 1) by 2' },
      { form: prod([[1, 0], [1, 1]], 2), trap: 'summed only to r = n' },
      { form: prod([[1, 0], [2, 1]], 2), trap: 'halved one time too many' },
      { form: prod([[1, 0], [2, -1]]), trap: 'off by one at the top of the sum' },
      { form: prod([[2, 0], [1, 1]]), trap: 'used 2n(n + 1) in place of n(2n + 1)' },
    ],
  };
}

function formulaQ(rng: RNG): Generated | null {
  const spec = rng.weighted(
    [linearFormula, standardFormula, productFormula, squareFormula, rangeFormula],
    [3, 2, 2, 2, 2],
  )(rng);
  // Two forms that are the same polynomial would give two correct options.
  const pool: { form: Form; trap: string }[] = [];
  for (const w of spec.wrong) {
    if (sameForm(w.form, spec.correct) || pool.some((o) => sameForm(o.form, w.form))) continue;
    pool.push(w);
  }
  if (pool.length < 4) return null;
  const wrongForms = [...pool.slice(0, 2), ...rng.shuffle(pool.slice(2))].slice(0, 4);
  const correct = `$${spec.correct.tex}$`;
  const options = buildChoiceOptions(rng, correct, wrongForms.map((w) => ({ display: `$${w.form.tex}$`, trap: w.trap })));
  const byDisplay = new Map<string, Poly>([[correct, spec.correct.coeffs]]);
  for (const w of wrongForms) byDisplay.set(`$${w.form.tex}$`, w.form.coeffs);
  const optionFormulas = options.map((o) => [o.display, byDisplay.get(o.display)!] as [string, number[]]);
  const sumTo = (n: number) => {
    let s = 0;
    for (let r = spec.lo[0] * n + spec.lo[1]; r <= spec.hi[0] * n + spec.hi[1]; r++) s += term(spec.id, r, spec.a, spec.b);
    return s;
  };
  const check = [1, 2, 3].map((n) => `$n = ${n}$ gives $${sumTo(n)}$`).join(', ');
  const sum = `${sigma(spec.id, limitTex(spec.lo), limitTex(spec.hi), spec.a, spec.b)}`;
  const stem = rng.bool(0.5)
    ? `Which of the following is equal to $${sum}$ for every positive integer $n$?`
    : `For every positive integer $n$, $${sum}$ is equal to which of the following?`;
  return {
    stem,
    answer: { kind: 'choice' as const, value: correct },
    options,
    solution: `Test small values: ${check}. Only $${spec.correct.tex}$ gives all of these.`,
    trap: 'Check a formula on n = 1, 2 and 3 before trusting it: most wrong options fail at n = 2.',
    tags: ['series', 'standard-results', 'formula'],
    params: { variant: 'formula', id: spec.id, a: spec.a, b: spec.b, lo: spec.lo, hi: spec.hi, optionFormulas },
    typedAllowed: false,
  };
}

// -----------------------------------------------------------------------------

export default defineTemplate({
  id: 'm2.reasoning.series-identities',
  module: 'M2',
  topic: 'reasoning',
  title: 'Standard series results',
  levels: {
    1: 'Σ_{r=1}^{n} r and Σ_{r=1}^{n} (2r − 1) = n² evaluated',
    2: 'Σ r² and Σ r³ for small n',
    3: 'Σ (ar + b); a sum whose lower limit is not 1',
    4: 'Σ r(r + 1) and Σ (2r + 1)² via Σr² and Σr; Σ_{r=p}^{q} r²',
    5: 'which closed form equals Σ f(r)? — including sums whose limits depend on n',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return pickVariant(rng, [sumRQ, sumOddQ]);
        case 2: return pickVariant(rng, [sumSquareQ, sumCubeQ]);
        case 3: return pickVariant(rng, [sumLinearQ, sumRangeQ]);
        case 4: return pickVariant(rng, [sumProductQ, sumOddSquareQ, sumSquareRangeQ]);
        default: return pickVariant(rng, [formulaQ]);
      }
    });
  },
  verify(q) {
    const p = q.params as { variant: string; id: SumId; lo?: number | [number, number]; hi?: number | [number, number]; a?: number; b?: number; optionFormulas?: [string, number[]][] };
    const sumOf = (id: SumId, lo: number, hi: number, a = 0, b = 0) => {
      let s = 0;
      for (let r = lo; r <= hi; r++) s += term(id, r, a, b);
      return s;
    };
    if (p.variant === 'value') {
      if (q.answer.kind !== 'exact') return false;
      return Math.abs(q.answer.value.toNumber() - sumOf(p.id, p.lo as number, p.hi as number, p.a, p.b)) < 1e-9;
    }
    if (p.variant === 'formula') {
      if (q.answer.kind !== 'choice') return false;
      const [loM, loC] = p.lo as [number, number];
      const [hiM, hiC] = p.hi as [number, number];
      // Sum in a loop for n = 1..8 and keep the options that match every time.
      const sums = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => sumOf(p.id, loM * n + loC, hiM * n + hiC, p.a, p.b));
      const matching = p.optionFormulas!.filter(([, c]) =>
        sums.every((s, i) => Math.abs(evalPoly(c, i + 1) - s) < 1e-6));
      return matching.length === 1 && matching[0][0] === q.answer.value;
    }
    return false;
  },
});
