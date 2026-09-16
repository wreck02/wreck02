import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildOptions, buildSetOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { gcd, poly, signed, TRIPLES } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Completing the square, the discriminant and sum/product of roots.
 * Level 1: x² + bx + c (b even) as (x + p)² + q — find q, the minimum value, or the x of the vertex
 * Level 2: repeated-root k (x² + kx + 9 = 0 ⇒ k = 6) or the discriminant of ax² + bx + c
 * Level 3: α + β = −b/a or αβ = c/a with a ≠ 1
 * Level 4: α² + β² = (α + β)² − 2αβ (a ∈ {1, 2} so the fraction stays exam-clean) or 1/α + 1/β = (α + β)/(αβ)
 * Level 5: minimum/maximum of ax² + bx + c with a ≠ 1, or the set of k giving equal roots (kind 'set'):
 *          kx² + bx + nk = 0 (k = ±b/2√n), (k + c)x² + bx + k = 0 (a Pythagorean triple makes k integer),
 *          or x² + kx + (pk + q) = 0 (the discriminant is itself a quadratic in k).
 *
 * Sub-variants are drawn once and built inside their own attempt loop, so a rejection never
 * re-rolls the variant pick (that is what made one six-stem form 31% of level 5).
 *
 * params always carry the raw coefficients so verify() can recompute by a different route:
 * evaluating f at the vertex, floating-point roots from the quadratic formula, or the
 * discriminant as an exact polynomial in k.
 */

function clean(ds: Distractor[]): Distractor[] {
  return ds.filter((d) => Number.isFinite(d.value.toNumber()) && isCleanExact(d.value).ok);
}

/** Set distractors: every value clean and no repeated value inside one option. */
function cleanSets<T extends { values: Exact[] }>(ds: T[]): T[] {
  return ds.filter((d) => d.values.every((v, i) => isCleanExact(v).ok && d.values.findIndex((w) => w.equals(v)) === i));
}

/** Try `fn` up to n times; null if it never succeeds. */
function attempt<T>(n: number, fn: () => T | null): T | null {
  for (let i = 0; i < n; i++) {
    const r = fn();
    if (r !== null) return r;
  }
  return null;
}

/** Non-zero integer in [-m, m] excluding 0. */
function nzInt(rng: RNG, m: number): number {
  return rng.nonZeroInt(-m, m);
}

/** (x + h)² written with the sign inside the bracket. */
function bracketSq(h: number): string {
  return h === 0 ? 'x^2' : `(x ${h < 0 ? '-' : '+'} ${Math.abs(h)})^2`;
}

/** "(k + 3)" / "(k - 3)" */
function kShift(c: number): string {
  return `(k ${c < 0 ? '-' : '+'} ${Math.abs(c)})`;
}

/** "(k - 4)(k + 1)" from the roots 4 and −1. */
function kFactors(k1: number, k2: number): string {
  return `(k ${k1 < 0 ? '+' : '-'} ${Math.abs(k1)})(k ${k2 < 0 ? '+' : '-'} ${Math.abs(k2)})`;
}

const ROOTS_INTRO = (a: number, b: number, c: number) => `The equation $${poly([a, b, c])} = 0$ has roots $\\alpha$ and $\\beta$.`;

const TAGS = ['quadratics'];

// ----------------------------------------------------------------------------
// Level 1: complete the square
// ----------------------------------------------------------------------------

function level1(rng: RNG): Generated {
  const b = rng.pick([-12, -10, -8, -6, -4, -2, 2, 4, 6, 8, 10, 12]);
  const c = rng.intExcluding(-12, 20, [0]);
  const p = b / 2;
  const q = c - p * p;
  const ask = rng.weighted(['q', 'min', 'xmin'] as const, [4, 3, 3]);
  const expr = poly([1, b, c]);
  const completed = `${bracketSq(p)}${signed(q)}`;
  const base = `$${expr} = ${bracketSq(p)} - ${p * p}${signed(c)} = ${completed}$`;
  if (ask === 'xmin') {
    const answer = E(-p);
    const distractors = clean([
      { value: E(p), trap: 'sign: (x + p)² is smallest at x = −p' },
      { value: E(q), trap: 'gave the minimum value instead of where it occurs' },
      { value: E(-b), trap: 'used b instead of b/2' },
      { value: E(b), trap: 'used b instead of −b/2' },
      { value: E(c), trap: 'gave the constant term' },
    ]);
    return {
      stem: `Find the value of $x$ for which $${expr}$ takes its minimum value.`,
      answer: { kind: 'exact', value: answer },
      options: buildOptions(rng, answer, distractors),
      solution: `${base}, which is smallest when the bracket is zero: $x = ${-p}$.`,
      trap: 'The vertex is at x = −b/2 (the bracket zero), not at x = +b/2 and not the minimum value itself.',
      tags: [...TAGS, 'completing-the-square', 'vertex'],
      params: { kind: 'complete-square', ask, a: 1, b, c },
      typedAllowed: true,
    };
  }
  const answer = E(q);
  const distractors = clean([
    { value: E(c + p * p), trap: 'added (b/2)² instead of subtracting it' },
    { value: E(c), trap: 'forgot to subtract (b/2)²' },
    { value: E(c - b * b), trap: 'used b² instead of (b/2)²' },
    { value: E(-p), trap: 'gave the x-coordinate of the vertex instead' },
    { value: E(c - p), trap: 'subtracted b/2 instead of (b/2)²' },
    { value: E(-q), trap: 'sign error' },
  ]);
  const stem = ask === 'q'
    ? `Given that $${expr} \\equiv (x + p)^2 + q$ for all $x$, find the value of $q$.`
    : `Find the minimum value of $${expr}$.`;
  return {
    stem,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `${base}, so ${ask === 'q' ? `$q = ${q}$` : `the minimum value is $${q}$ (at $x = ${-p}$)`}.`,
    trap: 'Completing the square subtracts (b/2)², not b², and the constant term q is the minimum value, not the x at which it occurs.',
    tags: [...TAGS, 'completing-the-square'],
    params: { kind: 'complete-square', ask, a: 1, b, c },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------
// Level 2: discriminant
// ----------------------------------------------------------------------------

function level2(rng: RNG): Generated | null {
  const variant = rng.weighted(['k-linear', 'k-const', 'disc'] as const, [7, 6, 7]);
  if (variant === 'k-linear') {
    const n = rng.int(3, 9); // c = 4 (n = 2) makes half the candidates coincide
    const c = n * n;
    const answer = E(2 * n);
    const distractors = clean([
      { value: E(n), trap: 'k² = 4c solved as k = √c' },
      { value: E(4 * n), trap: 'k = 4√c' },
      { value: E(c), trap: 'k = c' },
      { value: E(2 * c), trap: 'k² = 4c read as k = 2c' },
      ...(c % 2 === 0 ? [{ value: E(c / 2), trap: 'halved c instead of doubling √c' }] : []),
      { value: E(-2 * n), trap: 'the negative square root, which k > 0 excludes' },
    ]);
    return {
      stem: `Find the value of $k > 0$ for which $x^2 + kx + ${c} = 0$ has a repeated root.`,
      answer: { kind: 'exact', value: answer },
      options: buildOptions(rng, answer, distractors),
      solution: `Repeated root means $b^2 - 4ac = 0$: $k^2 = 4 \\times ${c} = ${4 * c}$, so $k = ${2 * n}$ (equivalently $x^2 + kx + ${c} = (x + ${n})^2$).`,
      trap: 'k² = 4c gives k = 2√c, not √c: spot (x + √c)² needs a middle coefficient of 2√c.',
      tags: [...TAGS, 'discriminant', 'repeated-root'],
      params: { kind: 'repeated-root-k', which: 'b', a: 1, c },
      typedAllowed: true,
    };
  }
  if (variant === 'k-const') {
    const b = rng.pick([-12, -10, -8, -6, -4, 4, 6, 8, 10, 12]);
    const k = (b * b) / 4;
    const answer = E(k);
    const distractors = clean([
      { value: E(b * b), trap: 'forgot to divide b² by 4' },
      { value: E((b * b) / 2), trap: 'divided b² by 2 instead of 4' },
      { value: E(-k), trap: 'sign error: 4k = b² gives k > 0' },
      { value: E(Math.abs(b) / 2), trap: 'halved b but did not square it' },
      { value: E(2 * Math.abs(b)), trap: 'doubled b instead of squaring and quartering' },
      { value: E(-b), trap: 'gave the value that makes the linear term vanish' },
    ]);
    return {
      stem: `Find the value of $k$ for which $${poly([1, b, 0])} + k = 0$ has equal roots.`,
      answer: { kind: 'exact', value: answer },
      options: buildOptions(rng, answer, distractors),
      solution: `Equal roots means $b^2 - 4ac = 0$: $${b * b} - 4k = 0$, so $k = ${k}$ (equivalently $(x ${b < 0 ? '-' : '+'} ${Math.abs(b) / 2})^2$).`,
      trap: 'b² = 4k, so k = b²/4 — the 4 is easily dropped.',
      tags: [...TAGS, 'discriminant', 'repeated-root'],
      params: { kind: 'repeated-root-k', which: 'c', a: 1, b },
      typedAllowed: true,
    };
  }
  const a = rng.int(1, 3);
  const b = nzInt(rng, 7);
  const c = nzInt(rng, 6);
  const D = b * b - 4 * a * c;
  if (Math.abs(D) > 100 || D === 0) return null;
  const answer = E(D);
  const distractors = clean([
    { value: E(b * b + 4 * a * c), trap: 'used b² + 4ac' },
    { value: E(b * b - a * c), trap: 'forgot the factor 4' },
    { value: E(4 * a * c - b * b), trap: 'subtracted the wrong way round' },
    { value: E(b * b - 2 * a * c), trap: 'used 2ac instead of 4ac' },
    { value: E(b - 4 * a * c), trap: 'forgot to square b' },
    { value: E(-b * b - 4 * a * c), trap: '(−b)² treated as −b²' },
  ]);
  return {
    stem: `Find the discriminant of $${poly([a, b, c])}$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `$b^2 - 4ac = (${b})^2 - 4(${a})(${c}) = ${b * b}${signed(-4 * a * c)} = ${D}$.`,
    trap: 'b² − 4ac: square b first (a negative b squares to a positive), then subtract 4ac with its sign.',
    tags: [...TAGS, 'discriminant'],
    params: { kind: 'discriminant', a, b, c },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------
// Level 3: sum and product of roots
// ----------------------------------------------------------------------------

function level3(rng: RNG): Generated | null {
  const a = rng.int(2, 6);
  const b = nzInt(rng, 9);
  const c = nzInt(rng, 9);
  if (gcd(gcd(a, b), c) !== 1) return null;
  if (b * b - 4 * a * c <= 0) return null;
  const S = frac(-b, a), P = frac(c, a);
  const ask = rng.bool() ? 'sum' : 'product';
  const answer = ask === 'sum' ? S : P;
  const distractors = ask === 'sum'
    ? clean([
      { value: frac(b, a), trap: 'sign: α + β = −b/a, not +b/a' },
      { value: E(-b), trap: 'forgot to divide by a' },
      { value: P, trap: 'gave αβ instead of α + β' },
      { value: frac(-a, b), trap: 'inverted the fraction' },
      { value: E(b), trap: 'sign error and forgot to divide by a' },
      { value: P.neg(), trap: 'gave −c/a' },
    ])
    : clean([
      { value: P.neg(), trap: 'sign: αβ = +c/a' },
      { value: E(c), trap: 'forgot to divide by a' },
      { value: S, trap: 'gave α + β instead of αβ' },
      { value: frac(a, c), trap: 'inverted the fraction' },
      { value: frac(b, a), trap: 'used b/a' },
      { value: E(-c), trap: 'sign error and forgot to divide by a' },
    ]);
  return {
    stem: `${ROOTS_INTRO(a, b, c)} Find the value of $${ask === 'sum' ? '\\alpha + \\beta' : '\\alpha\\beta'}$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `For $ax^2 + bx + c = 0$: $\\alpha + \\beta = -\\frac{b}{a} = ${S.toLatex()}$ and $\\alpha\\beta = \\frac{c}{a} = ${P.toLatex()}$.`,
    trap: 'α + β = −b/a (minus sign, divided by a) and αβ = +c/a; with a ≠ 1 the division is where marks are lost.',
    tags: [...TAGS, 'roots', 'vieta'],
    params: { kind: 'vieta', ask, a, b, c },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------
// Level 4: symmetric functions of the roots
// ----------------------------------------------------------------------------

function symmetric(rng: RNG, ask: 'sumsq' | 'recip'): Generated | null {
  // α² + β² = (b² − 2ac)/a²: with a up to 4 that is 65/16-style arithmetic, so keep a ∈ {1, 2} there.
  // 1/α + 1/β = −b/c is independent of a, so a can go up to 4.
  const a = ask === 'sumsq' ? rng.pick([1, 2]) : (rng.bool(0.65) ? rng.int(2, 4) : 1);
  const b = nzInt(rng, 9);
  const c = nzInt(rng, 9);
  if (gcd(gcd(a, b), c) !== 1) return null;
  if (b * b - 4 * a * c <= 0) return null;
  if (ask === 'recip' && Math.abs(b) === Math.abs(c)) return null; // answer ±1 and αβ/(α + β) coincides with it
  const S = frac(-b, a), P = frac(c, a);
  const S2 = S.mul(S);
  const answer = ask === 'sumsq' ? S2.sub(P.mulRat(2)) : S.div(P);
  if (!isCleanExact(answer).ok) return null;
  if (ask === 'sumsq') {
    const r = answer.toRat();
    if (r.d > 4n || Math.abs(Number(r.n)) > 60) return null;
  }
  const distractors = ask === 'sumsq'
    ? clean([
      { value: S2.add(P.mulRat(2)), trap: 'used (α + β)² + 2αβ' },
      { value: S2, trap: 'forgot the −2αβ' },
      { value: S2.sub(P), trap: 'subtracted αβ, not 2αβ' },
      ...(a !== 1 ? [{ value: E(b * b - 2 * c), trap: 'ignored a when forming α + β and αβ' }] : []),
      { value: S.sub(P.mulRat(2)), trap: 'forgot to square α + β' },
      { value: P.mulRat(2).sub(S2), trap: 'sign reversed' },
    ])
    : clean([
      { value: P.div(S), trap: 'inverted: gave αβ/(α + β)' },
      { value: S.div(P).neg(), trap: 'sign error in α + β' },
      { value: S, trap: 'gave α + β' },
      { value: P, trap: 'gave αβ' },
      { value: E(1).div(S), trap: 'took 1/(α + β)' },
      { value: frac(-c, b), trap: 'used c/b instead of −b/c' },
      ...(a !== 1 ? [
        { value: frac(-b, a * c), trap: 'forgot the a in αβ = c/a' },
        { value: frac(-b * a, c), trap: 'forgot the a in α + β = −b/a' },
      ] : []),
    ]);
  const solution = ask === 'sumsq'
    ? `$\\alpha + \\beta = ${S.toLatex()}$, $\\alpha\\beta = ${P.toLatex()}$, so $\\alpha^2 + \\beta^2 = (\\alpha + \\beta)^2 - 2\\alpha\\beta = ${S2.toLatex()} - 2\\left(${P.toLatex()}\\right) = ${answer.toLatex()}$.`
    : `$\\frac{1}{\\alpha} + \\frac{1}{\\beta} = \\frac{\\alpha + \\beta}{\\alpha\\beta} = \\frac{-b/a}{c/a} = -\\frac{b}{c} = ${answer.toLatex()}$.`;
  return {
    stem: `${ROOTS_INTRO(a, b, c)} Find the value of $${ask === 'sumsq' ? '\\alpha^2 + \\beta^2' : '\\frac{1}{\\alpha} + \\frac{1}{\\beta}'}$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution,
    trap: ask === 'sumsq' ? 'α² + β² = (α + β)² − 2αβ: the −2αβ is the usual casualty.' : '1/α + 1/β = (α + β)/(αβ) simplifies to −b/c — the a cancels.',
    tags: [...TAGS, 'roots', 'vieta', 'symmetric-functions'],
    params: { kind: 'symmetric', ask, a, b, c },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------
// Level 5a: extremum of ax² + bx + c with a ≠ 1
// ----------------------------------------------------------------------------

function extremum(rng: RNG): Generated | null {
  const a = rng.pick([2, 3, 4, 5, -1, -2, -3, -4]);
  // A half-integer vertex only with a small |a| so the constant stays exam-like (−5/2, not −69/2).
  const halfVertex = Math.abs(a) <= 2 && rng.bool(0.3);
  const hNum = halfVertex ? rng.pick([-5, -3, -1, 1, 3, 5]) : rng.nonZeroInt(-4, 4);
  const h = halfVertex ? hNum / 2 : hNum; // vertex x
  const b = -2 * a * h;
  if (!Number.isInteger(b) || Math.abs(b) > 30) return null;
  const c = rng.intExcluding(-10, 12, [0]);
  const ah2 = E(a).mul(E(h)).mul(E(h)); // a h²
  const value = E(c).sub(ah2);
  if (!isCleanExact(value).ok) return null;
  const isMin = a > 0;
  const word = isMin ? 'minimum' : 'maximum';
  const distractors = clean([
    { value: E(h), trap: `gave the x-coordinate of the vertex instead of the ${word} value` },
    { value: E(c).add(ah2), trap: 'sign of the completed-square constant' },
    { value: E(c - (b * b) / 4), trap: 'left out the factor a: used c − (b/2)²' },
    { value: E(c).sub(E(h).mul(E(h))), trap: 'forgot to multiply (b/2a)² by a' },
    { value: E(c).add(ah2.mulRat(3)), trap: 'substituted x = +b/2a instead of −b/2a' },
    { value: value.neg(), trap: 'sign error' },
    { value: E(c), trap: `read the constant term as the ${word} value` },
    { value: E(-h), trap: 'gave the vertex x-coordinate with the wrong sign' },
  ]);
  const inner = `(x ${h < 0 ? '+' : '-'} ${E(Math.abs(h)).toLatex()})^2`;
  return {
    stem: `Find the ${word} value of $${poly([a, b, c])}$.`,
    answer: { kind: 'exact', value },
    options: buildOptions(rng, value, distractors),
    solution: `$${poly([a, b, c])} = ${a === -1 ? '-' : a}${inner} ${value.sign() < 0 ? '-' : '+'} ${value.abs().toLatex()}$ (vertex at $x = -\\frac{b}{2a} = ${E(h).toLatex()}$), so the ${word} value is $${value.toLatex()}$.`,
    trap: `Complete the square with the factor a kept: a(x − h)² + (c − ah²). The ${word} is the constant, not the x-coordinate.`,
    tags: [...TAGS, 'completing-the-square', 'extremum'],
    params: { kind: 'extremum', ask: isMin ? 'min' : 'max', a, b, c },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------
// Level 5b: the set of k for equal roots. Coefficients are linear in k: A(k) x² + B(k) x + C(k).
// ----------------------------------------------------------------------------

type Lin = [number, number]; // [coefficient of k, constant]
type SetSpec = {
  form: string;
  quad: string; // LaTeX of the quadratic in x
  values: Exact[];
  distractors: { values: Exact[]; trap: string }[];
  solution: string;
  trap: string;
  A: Lin;
  B: Lin;
  C: Lin;
};

/** kx² + bx + nk = 0 (or nkx² + bx + k = 0): b² − 4nk² = 0 ⇒ k = ±b/(2√n). */
function scaledSet(rng: RNG): SetSpec | null {
  const n = rng.pick([1, 1, 4, 9]);
  const root = Math.sqrt(n);
  const k0 = rng.int(n === 1 ? 1 : 2, n === 9 ? 4 : 6); // k = ±1 with n ≠ 1 makes the distractors coincide
  const b = 2 * root * k0 * rng.sign();
  const mirror = n !== 1 && rng.bool();
  const outer = n === 1 ? 'k' : `${n}k`;
  const quad = mirror ? `${outer}x^2${signed(b, 'x')} + k` : `kx^2${signed(b, 'x')} + ${outer}`;
  const values = [E(k0), E(-k0)];
  const distractors = cleanSets([
    { values: [E(k0)], trap: 'only the positive square root' },
    { values: [E(-k0)], trap: 'only the negative square root' },
    { values: [E(2 * k0), E(-2 * k0)], trap: `forgot the factor 4: solved b² − ${n === 1 ? '' : n}k² = 0` },
    { values: [E(k0 * k0)], trap: `treated the product of the outer coefficients as k: solved ${b * b} − ${4 * n}k = 0` },
    ...(n !== 1 ? [{ values: [E(root * k0), E(-root * k0)], trap: `ignored the ${n} in the constant term` }] : []),
    { values: [frac(b, 4), frac(-b, 4)], trap: 'divided by 4 instead of taking the square root' },
  ]);
  return {
    form: 'scaled',
    quad,
    values,
    distractors,
    solution: `Equal roots means $b^2 - 4ac = 0$: $${b * b} - 4(${mirror ? outer : 'k'})(${mirror ? 'k' : outer}) = ${b * b} - ${4 * n}k^2 = 0$, so $k^2 = ${k0 * k0}$ and $k = \\pm ${k0}$.`,
    trap: `The discriminant is b² − 4·(${mirror ? outer : 'k'})·(${mirror ? 'k' : outer}) = b² − ${4 * n}k²: both square roots are solutions.`,
    A: mirror ? [n, 0] : [1, 0],
    B: [0, b],
    C: mirror ? [1, 0] : [n, 0],
  };
}

/** (k + c)x² + bx + k = 0: b² − 4k(k + c) = 0 ⇒ k² + ck − b²/4 = 0, integer roots when (c, b, h) is a Pythagorean triple. */
function shiftedSet(rng: RNG): SetSpec | null {
  const [l1, l2, h] = rng.pick(TRIPLES.filter((t) => t[2] <= 17));
  // k = (−c ± h)/2 must be an integer, so the shift leg must have the parity of the hypotenuse; b must be even.
  const legs = [l1, l2].filter((l) => (l + h) % 2 === 0);
  if (legs.length === 0) return null;
  const cAbs = rng.pick(legs);
  const bAbs = cAbs === l1 ? l2 : l1;
  if (bAbs % 2 !== 0 || bAbs > 16) return null;
  const c = cAbs * rng.sign(), b = bAbs * rng.sign();
  const k1 = (-c + h) / 2, k2 = (-c - h) / 2;
  if (Math.max(Math.abs(k1), Math.abs(k2)) > 16) return null;
  const mirror = rng.bool();
  const quad = mirror ? `kx^2${signed(b, 'x')} + ${kShift(c)}` : `${kShift(c)}x^2${signed(b, 'x')} + k`;
  const values = [E(k1), E(k2)];
  const q = (b * b) / 4;
  const distractors: { values: Exact[]; trap: string }[] = [
    { values: [E(-k1), E(-k2)], trap: 'sign error when factorising the discriminant' },
    { values: [E(k1)], trap: 'only one of the two solutions' },
    { values: [E(k2)], trap: 'only one of the two solutions' },
    { values: [E(k1), E(-k2)], trap: 'one sign wrong' },
    { values: [E(bAbs / 2), E(-bAbs / 2)], trap: `ignored the shift: solved b² − 4k² = 0 as if the bracket were just k` },
  ];
  // "forgot the 4": k² + ck − b² = 0
  const dd = c * c + 4 * b * b;
  const r = Math.sqrt(dd);
  if (Number.isInteger(r)) distractors.push({ values: [frac(-c + r, 2), frac(-c - r, 2)], trap: 'forgot the factor 4 in b² − 4ac' });
  return {
    form: 'shifted',
    quad,
    values,
    distractors: cleanSets(distractors),
    solution: `Equal roots means $b^2 - 4ac = 0$: $${b * b} - 4k${kShift(c)} = 0$, i.e. $${poly([1, c, -q], 'k')} = 0$ after dividing by 4, which factorises as $${kFactors(k1, k2)} = 0$, so $k = ${k1}$ or $k = ${k2}$.`,
    trap: 'b² − 4ac = 0 is a quadratic in k here: divide through by 4, factorise, and keep both solutions.',
    A: mirror ? [1, 0] : [1, c],
    B: [0, b],
    C: mirror ? [1, c] : [1, 0],
  };
}

/** x² + kx + (pk + q) = 0: k² − 4pk − 4q = (k − k1)(k − k2). */
function linearSet(rng: RNG): SetSpec | null {
  const p = rng.pick([1, 1, 2, -1, -2, 3]);
  const k1 = rng.pick([-12, -10, -8, -6, -4, -2, 2, 4, 6, 8, 10, 12]);
  const k2 = 4 * p - k1;
  if (k2 === k1 || k2 === 0 || Math.abs(k2) > 12) return null;
  const q = -(k1 * k2) / 4;
  if (q === 0 || Math.abs(q) > 30) return null;
  const values = [E(k1), E(k2)];
  const distractors: { values: Exact[]; trap: string }[] = [
    { values: [E(-k1), E(-k2)], trap: 'sign error when factorising the discriminant' },
    { values: [E(k1)], trap: 'only one of the two solutions' },
    { values: [E(k2)], trap: 'only one of the two solutions' },
    { values: [E(k1), E(-k2)], trap: 'one sign wrong' },
  ];
  // "forgot the 4": k² − pk − q = 0
  const dd = p * p + 4 * q;
  if (dd > 0) {
    const r = Math.sqrt(dd);
    if (Number.isInteger(r)) distractors.push({ values: [frac(p + r, 2), frac(p - r, 2)], trap: 'forgot the factor 4 in b² − 4ac' });
  }
  const constTerm = `${signed(p, 'k')}${signed(q)}`;
  return {
    form: 'linear',
    quad: `x^2 + kx${constTerm}`,
    values,
    distractors: cleanSets(distractors),
    solution: `Equal roots means $k^2 - 4(${poly([p, q], 'k')}) = 0$, i.e. $${poly([1, -4 * p, -4 * q], 'k')} = 0$, which factorises as $${kFactors(k1, k2)} = 0$, so $k = ${k1}$ or $k = ${k2}$.`,
    trap: 'The condition b² − 4ac = 0 is itself a quadratic in k: factorise it and keep both solutions.',
    A: [0, 1],
    B: [1, 0],
    C: [p, q],
  };
}

function equalRootsSet(rng: RNG, form: 'scaled' | 'shifted' | 'linear'): Generated | null {
  const spec = form === 'scaled' ? scaledSet(rng) : form === 'shifted' ? shiftedSet(rng) : linearSet(rng);
  if (!spec) return null;
  const ask = form === 'linear' ? 'Find the values of $k$' : 'Find the set of values of $k$';
  return {
    stem: `${ask} for which $${spec.quad} = 0$ has equal roots.`,
    answer: { kind: 'set', values: spec.values, variable: 'k' },
    options: buildSetOptions(rng, spec.values, spec.distractors, { variable: 'k' }),
    solution: spec.solution,
    trap: spec.trap,
    tags: [...TAGS, 'discriminant', 'equal-roots'],
    params: { kind: 'equal-roots-set', form: spec.form, A: spec.A, B: spec.B, C: spec.C },
    typedAllowed: true,
  };
}

export default defineTemplate({
  id: 'm1.algebra.quadratic-forms',
  module: 'M1',
  topic: 'algebra',
  title: 'Completing the square, discriminant, sum & product of roots',
  levels: {
    1: 'x² + bx + c as (x + p)² + q: find q, the minimum value or the vertex x',
    2: 'k for a repeated root (x² + kx + 9), or the discriminant of ax² + bx + c',
    3: 'α + β = −b/a, αβ = c/a with a ≠ 1',
    4: 'α² + β² and 1/α + 1/β from the sum and product',
    5: 'min/max of ax² + bx + c with a ≠ 1; set of k for equal roots (kx² + 4x + k = 0)',
  },
  generate(rng, level: Level) {
    return retry(rng, (): Generated | null => {
      if (level === 1) return level1(rng);
      if (level === 2) return level2(rng);
      if (level === 3) return level3(rng);
      if (level === 4) {
        const ask = rng.bool() ? 'sumsq' : 'recip';
        return attempt(80, () => symmetric(rng, ask));
      }
      // Level 5: choose the sub-variant once, then build it in its own attempt loop.
      if (rng.bool(0.5)) return attempt(80, () => extremum(rng));
      const form = rng.weighted(['scaled', 'shifted', 'linear'] as const, [3, 3, 4]);
      return attempt(80, () => equalRootsSet(rng, form));
    });
  },
  verify(q) {
    const p = q.params as Record<string, unknown>;
    const kind = p.kind as string;
    const near = (u: number, v: number) => Math.abs(u - v) <= 1e-9 * Math.max(1, Math.abs(u), Math.abs(v));

    if (kind === 'equal-roots-set') {
      if (q.answer.kind !== 'set') return false;
      const [a1, a0] = p.A as [number, number];
      const [b1, b0] = p.B as [number, number];
      const [c1, c0] = p.C as [number, number];
      // D(k) = (b1 k + b0)² − 4(a1 k + a0)(c1 k + c0) must vanish at every value and be genuinely quadratic in k
      if (b1 * b1 - 4 * a1 * c1 === 0) return false;
      const vals = q.answer.values;
      if (vals.length !== 2 || vals[0].equals(vals[1])) return false;
      return vals.every((k) => {
        const A = E(a1).mul(k).add(E(a0));
        const B = E(b1).mul(k).add(E(b0));
        const C = E(c1).mul(k).add(E(c0));
        return !A.isZero() && B.mul(B).sub(A.mul(C).mulRat(4)).isZero();
      });
    }

    if (q.answer.kind !== 'exact') return false;
    const ans = q.answer.value.toNumber();

    if (kind === 'repeated-root-k') {
      // Substitute k and check the vertex sits on the x-axis.
      const which = p.which as 'b' | 'c';
      const a = p.a as number;
      const b = which === 'b' ? ans : (p.b as number);
      const c = which === 'c' ? ans : (p.c as number);
      if (which === 'b' && ans <= 0) return false;
      const xv = -b / (2 * a);
      return near(a * xv * xv + b * xv + c, 0);
    }

    const a = p.a as number, b = p.b as number, c = p.c as number;
    const f = (x: number) => a * x * x + b * x + c;
    const xv = -b / (2 * a);
    const fv = f(xv);

    if (kind === 'complete-square' || kind === 'extremum') {
      const ask = p.ask as string;
      if (ask === 'xmin') return near(ans, xv);
      // q / min / max: the value at the vertex, which must genuinely be the extremum
      const isMin = a > 0;
      const extremal = isMin ? f(xv + 1) > fv && f(xv - 1) > fv : f(xv + 1) < fv && f(xv - 1) < fv;
      if (!extremal) return false;
      if (ask === 'max' && isMin) return false;
      if (ask === 'min' && !isMin) return false;
      return near(ans, fv);
    }
    if (kind === 'discriminant') {
      // 4a·f(vertex) = 4ac − b², so the discriminant is −4a·f(−b/2a)
      return near(ans, -4 * a * fv);
    }
    // vieta / symmetric: roots from the quadratic formula in floating point
    const D = b * b - 4 * a * c;
    if (D <= 0) return false;
    const al = (-b + Math.sqrt(D)) / (2 * a), be = (-b - Math.sqrt(D)) / (2 * a);
    const ask = p.ask as string;
    if (ask === 'sum') return near(ans, al + be);
    if (ask === 'product') return near(ans, al * be);
    if (ask === 'sumsq') return near(ans, al * al + be * be);
    if (ask === 'recip') return al !== 0 && be !== 0 && near(ans, 1 / al + 1 / be);
    return false;
  },
});
