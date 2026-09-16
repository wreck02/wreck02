import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildOptions, buildChoiceOptions, buildSetOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { gcd, linear, poly, signed } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Simultaneous equations, always generated from a chosen clean solution.
 * Level 1: x + y = a, x − y = b
 * Level 2: 2x + 3y = c, x − y = d (one equation needs scaling)
 * Level 3: both need scaling (3x + 2y = 12, 2x − 5y = −11)
 * Level 4: half-integer solutions, or a single combination such as x + y or 3x − y (kind 'exact')
 * Level 5: one linear, one quadratic (y = x + 1, x² + y² = 25): the possible x values (kind 'set')
 *          or the sum of the x values (kind 'exact')
 *
 * Linear levels ask either for the pair (kind 'choice', "x = 3, y = 1") or for one quantity px + qy
 * (kind 'exact'). The worked solution follows an explicit elimination *plan*: the variable to
 * eliminate is chosen so that the requested variable survives unless the other way round is
 * clearly cheaper (smaller scale factors even after a back-substitution), and the subtraction runs
 * in the direction that keeps the surviving coefficient positive. The same plan supplies the
 * distractors (forgot to divide by the real coefficient, added instead of subtracting, …).
 * params carry the coefficient rows so verify() can solve by Cramer's rule and substitute back.
 */

type Row = [number, number, number]; // a x + b y = c
type Var = 'x' | 'y';

// Type aliases (not interfaces) so they are assignable to the Record<string, unknown> params slot.
type LinearParams = {
  kind: 'linear';
  eqs: [Row, Row];
  ask: 'pair' | 'combo';
  p: number;
  q: number;
};

type Curve = { type: 'circle'; r2: number } | { type: 'hyperbola'; n: number } | { type: 'parabola'; b: number; c: number };

type QuadParams = {
  kind: 'quadratic';
  m: number; // line y = m x + k
  k: number;
  curve: Curve;
  ask: 'set' | 'sum';
};

/** Everything the linear question builder needs: the solution, the rows and what is asked. */
type Built = {
  x: Exact;
  y: Exact;
  r1: Row;
  r2: Row;
  ask: 'pair' | 'combo';
  p: number;
  q: number;
  /** level-4 shortcut: (row1 ± row2) = trick · (p x + q y); 0 when there is no shortcut */
  trick: number;
  trickSign: number;
};

function clean(ds: Distractor[]): Distractor[] {
  return ds.filter((d) => Number.isFinite(d.value.toNumber()) && isCleanExact(d.value).ok);
}

/** A set option must list distinct values: "x = 1 or x = 1" is not an option the exam would print. */
function distinctSets<T extends { values: Exact[] }>(ds: T[]): T[] {
  return ds.filter((d) => d.values.every((v, i) => d.values.findIndex((w) => w.equals(v)) === i));
}

/** Try `fn` up to n times; null if it never succeeds. Keeps a sub-variant coin from being re-rolled by rejections. */
function attempt<T>(n: number, fn: () => T | null): T | null {
  for (let i = 0; i < n; i++) {
    const r = fn();
    if (r !== null) return r;
  }
  return null;
}

/** When the answer is an integer, an odd fraction among integer options reads as filler: drop fractions if enough integers remain. */
function preferIntegers(answer: Exact, ds: Distractor[]): Distractor[] {
  if (!answer.isInteger()) return ds;
  const ints = ds.filter((d) => d.value.isInteger());
  const distinct = ints.filter((d, i) => !d.value.equals(answer) && ints.findIndex((e) => e.value.equals(d.value)) === i);
  return distinct.length >= 4 ? ints : ds;
}

/** "3x + 2y = 12" */
function eqTex(r: Row): string {
  return `${signed(r[0], 'x', true)}${signed(r[1], 'y')} = ${r[2]}`;
}

/** Option text for a solution pair. Shared with verify() so the check is on the same rendering. */
function pairDisplay(x: Exact, y: Exact): string {
  return `$x = ${x.toLatex()},\\ y = ${y.toLatex()}$`;
}

/** "x + y", "3x - y", or just "x" / "y" when one coefficient is zero. */
function comboTex(p: number, q: number): string {
  if (p === 0) return signed(q, 'y', true);
  if (q === 0) return signed(p, 'x', true);
  return `${signed(p, 'x', true)}${signed(q, 'y')}`;
}

/** Each row should read naturally: positive leading coefficient, no common factor. */
function tidyRow(r: Row): Row {
  return r[0] < 0 ? [-r[0], -r[1], -r[2]] : r;
}
function primitive(r: Row): boolean {
  return gcd(r[0], r[1]) === 1;
}

/** The line y = m x + k, written as "y = x + 1" or "x + y = 7" when the gradient is negative. */
function lineTex(m: number, k: number): string {
  return m > 0 ? `y = ${linear(m, k)}` : `${signed(-m, 'x', true)} + y = ${k}`;
}

/** Two coefficient rows that are not proportional. */
function independent(r1: Row, r2: Row): boolean {
  return r1[0] * r2[1] - r2[0] * r1[1] !== 0;
}

/** Pick (a1, a2) with neither dividing the other (both equations need scaling to eliminate). 7s are left out: they push the arithmetic past mental range. */
const COPRIME_PAIRS: [number, number][] = [[2, 3], [3, 2], [2, 5], [5, 2], [3, 4], [4, 3], [3, 5], [5, 3], [4, 5], [5, 4]];

// ----------------------------------------------------------------------------
// Elimination plans
// ----------------------------------------------------------------------------

interface Plan {
  /** the variable eliminated */
  elim: Var;
  /** scale factors applied to row 1 and row 2 */
  f1: number;
  f2: number;
  /** the scaled rows */
  s1: Row;
  s2: Row;
  /** add the scaled rows (opposite signs) rather than subtract */
  add: boolean;
  /** subtraction ran as (row 2 − row 1) to keep the surviving coefficient positive */
  flip: boolean;
  /** the result A·(survivor) = C, with A > 0 */
  A: number;
  C: number;
}

/** Eliminate `elim` from the two rows: scale by the other row's coefficient (over the gcd), then add or subtract. */
function plan(r1: Row, r2: Row, elim: Var): Plan {
  const j = elim === 'x' ? 0 : 1;
  const u = 1 - j;
  const g = gcd(r1[j], r2[j]);
  const f1 = Math.abs(r2[j]) / g, f2 = Math.abs(r1[j]) / g;
  const s1: Row = [r1[0] * f1, r1[1] * f1, r1[2] * f1];
  const s2: Row = [r2[0] * f2, r2[1] * f2, r2[2] * f2];
  const add = Math.sign(s1[j]) !== Math.sign(s2[j]);
  let A = add ? s1[u] + s2[u] : s1[u] - s2[u];
  let C = add ? s1[2] + s2[2] : s1[2] - s2[2];
  let flip = false;
  if (A < 0) { A = -A; C = -C; flip = true; }
  return { elim, f1, f2, s1, s2, add, flip, A, C };
}

/** Mental cost of a plan: each non-trivial scaling costs its factor; a back-substitution costs 3. */
function cost(p: Plan, backSub: boolean): number {
  return (p.f1 > 1 ? p.f1 : 0) + (p.f2 > 1 ? p.f2 : 0) + (backSub ? 3 : 0);
}

/** The cheaper of the two eliminations for what is wanted; ties go to the route that finds the wanted variable directly. */
function choosePlan(r1: Row, r2: Row, want: Var | 'both'): Plan {
  const findX = plan(r1, r2, 'y');
  const findY = plan(r1, r2, 'x');
  const cx = cost(findX, want === 'y');
  const cy = cost(findY, want === 'x');
  if (cx !== cy) return cx < cy ? findX : findY;
  return want === 'y' ? findY : findX;
}

/** The arithmetic a plan asks of the candidate must stay in mental range. */
function mental(p: Plan, maxA: number): boolean {
  return p.A <= maxA && Math.abs(p.s1[2]) <= 120 && Math.abs(p.s2[2]) <= 120 && Math.abs(p.C) <= 150;
}

/** Worked solution for a plan. Back-substitutes only when the eliminated variable is also wanted. */
function eliminationText(p: Plan, x: Exact, y: Exact, want: Var | 'both'): string {
  const survivor: Var = p.elim === 'x' ? 'y' : 'x';
  const found = survivor === 'x' ? x : y;
  const other = survivor === 'x' ? y : x;
  let scale = '';
  if (p.f1 > 1 && p.f2 > 1) scale = `Scale to $${eqTex(p.s1)}$ and $${eqTex(p.s2)}$`;
  else if (p.f1 > 1) scale = `Multiply the first equation by ${p.f1}: $${eqTex(p.s1)}$`;
  else if (p.f2 > 1) scale = `Multiply the second equation by ${p.f2}: $${eqTex(p.s2)}$`;
  const op = p.add ? 'adding' : p.flip ? 'subtracting the first from the second' : 'subtracting the second from the first';
  const lead = scale ? `${scale}; ${op}` : op[0].toUpperCase() + op.slice(1);
  let s = `${lead} eliminates $${p.elim}$: $${signed(p.A, survivor, true)} = ${p.C}$`;
  if (p.A !== 1) s += `, so $${survivor} = ${found.toLatex()}$`;
  if (want !== survivor) s += `; substituting back gives $${p.elim} = ${other.toLatex()}$`;
  return `${s}.`;
}

function linearStem(r1: Row, r2: Row, ask: string): string {
  const eqs = `$${eqTex(r1)}$\n$${eqTex(r2)}$`;
  if (ask === 'pair') return `Solve the simultaneous equations\n\n${eqs}`;
  return `Given that\n\n${eqs}\n\nfind the value of $${ask}$.`;
}

// ----------------------------------------------------------------------------
// Linear levels: draw the solution first, then the rows
// ----------------------------------------------------------------------------

/** A non-zero solution with |x| ≠ |y|, so "the other variable" and "sign error" distractors stay distinct. */
function pickXY(rng: RNG, lo: number, hi: number): [number, number] | null {
  const xv = rng.nonZeroInt(lo, hi), yv = rng.nonZeroInt(lo, hi);
  return Math.abs(xv) === Math.abs(yv) ? null : [xv, yv];
}

function singleAsk(rng: RNG): [number, number] {
  return rng.bool() ? [1, 0] : [0, 1];
}

function buildLevel1(rng: RNG): Built | null {
  const xy = pickXY(rng, -9, 9);
  if (!xy) return null;
  const [xv, yv] = xy;
  let r1: Row = [1, 1, xv + yv];
  let r2: Row = [1, -1, xv - yv];
  if (rng.bool()) [r1, r2] = [r2, r1];
  const ask = rng.bool() ? 'pair' : 'combo';
  const [p, q] = ask === 'combo' ? singleAsk(rng) : [1, 0];
  return { x: E(xv), y: E(yv), r1, r2, ask, p, q, trick: 0, trickSign: 1 };
}

function buildLevel2(rng: RNG): Built | null {
  const xy = pickXY(rng, -6, 8);
  if (!xy) return null;
  const [xv, yv] = xy;
  const a1 = rng.int(2, 5), b1 = rng.nonZeroInt(-5, 5);
  const b2 = rng.pick([1, -1, 1, -1, 2, -2, 3, -3]);
  let r1: Row = [a1, b1, a1 * xv + b1 * yv];
  let r2: Row = [1, b2, xv + b2 * yv];
  if (!primitive(r1) || !independent(r1, r2) || Math.abs(r1[2]) > 40 || Math.abs(r2[2]) > 40) return null;
  if (rng.bool(0.3)) [r1, r2] = [r2, r1];
  const ask = rng.bool() ? 'pair' : 'combo';
  const [p, q] = ask === 'combo' ? singleAsk(rng) : [1, 0];
  return { x: E(xv), y: E(yv), r1, r2, ask, p, q, trick: 0, trickSign: 1 };
}

function buildLevel3(rng: RNG): Built | null {
  const xy = pickXY(rng, -6, 8);
  if (!xy) return null;
  const [xv, yv] = xy;
  const [a1, a2] = rng.pick(COPRIME_PAIRS);
  const [bb1, bb2] = rng.pick(COPRIME_PAIRS);
  const b1 = bb1 * rng.sign(), b2 = bb2 * rng.sign();
  const r1: Row = [a1, b1, a1 * xv + b1 * yv];
  const r2: Row = [a2, b2, a2 * xv + b2 * yv];
  if (!primitive(r1) || !primitive(r2) || !independent(r1, r2) || Math.abs(r1[2]) > 45 || Math.abs(r2[2]) > 45) return null;
  const ask = rng.bool() ? 'pair' : 'combo';
  const [p, q] = ask === 'combo' ? singleAsk(rng) : [1, 0];
  return { x: E(xv), y: E(yv), r1, r2, ask, p, q, trick: 0, trickSign: 1 };
}

/** Level 4a: integer solution, ask for a combination px + qy (often reachable by adding or subtracting the equations). */
function buildCombination(rng: RNG): Built | null {
  const xy = pickXY(rng, -6, 8);
  if (!xy) return null;
  const [xv, yv] = xy;
  const [p, q] = rng.pick([[1, 1], [1, -1], [2, 1], [1, 2], [3, -1], [2, -3], [3, 1], [1, -2]]);
  let r1: Row, r2: Row;
  let trick = 0, trickSign = 1;
  if (rng.bool(0.6)) {
    // shortcut: row1 ± row2 is a multiple of the requested combination
    const a1 = rng.int(1, 6), b1 = rng.nonZeroInt(-6, 6);
    trick = rng.pick([1, 2, 2, 3]);
    trickSign = rng.sign();
    let a2 = trickSign * (trick * p - a1), b2 = trickSign * (trick * q - b1);
    if (a2 < 0) { a2 = -a2; b2 = -b2; trickSign = -trickSign; } // keep the leading coefficient positive
    if (a2 === 0 || b2 === 0 || Math.abs(a2) > 7 || Math.abs(b2) > 7) return null;
    r1 = [a1, b1, a1 * xv + b1 * yv];
    r2 = [a2, b2, a2 * xv + b2 * yv];
  } else {
    const [a1, a2] = rng.pick(COPRIME_PAIRS);
    const [bb1, bb2] = rng.pick(COPRIME_PAIRS);
    const b1 = bb1 * rng.sign(), b2 = bb2 * rng.sign();
    r1 = [a1, b1, a1 * xv + b1 * yv];
    r2 = [a2, b2, a2 * xv + b2 * yv];
  }
  if (!primitive(r1) || !primitive(r2) || !independent(r1, r2) || Math.abs(r1[2]) > 45 || Math.abs(r2[2]) > 45) return null;
  return { x: E(xv), y: E(yv), r1, r2, ask: 'combo', p, q, trick, trickSign };
}

/** Level 4b: one variable is a half-integer; ask for it. Built directly: that variable gets even coefficients so the constants are integers. */
function buildHalfInteger(rng: RNG): Built | null {
  const halfX = rng.bool();
  const half = frac(rng.pick([-7, -5, -3, -1, 1, 3, 5, 7]), 2);
  const whole = E(rng.nonZeroInt(-6, 6));
  const x = halfX ? half : whole, y = halfX ? whole : half;
  const evens = [-6, -4, -2, 2, 4, 6], odds = [-5, -3, -1, 1, 3, 5];
  const rows: Row[] = [];
  for (let i = 0; i < 2; i++) {
    const e = rng.pick(evens), o = rng.pick(odds);
    const [a, b] = halfX ? [e, o] : [o, e];
    const c = E(a).mul(x).add(E(b).mul(y));
    if (!c.isInteger()) return null;
    rows.push(tidyRow([a, b, c.toInt()]));
  }
  const [r1, r2] = rows;
  if (!primitive(r1) || !primitive(r2) || !independent(r1, r2) || Math.abs(r1[2]) > 45 || Math.abs(r2[2]) > 45) return null;
  const [p, q] = halfX ? [1, 0] : [0, 1];
  return { x, y, r1, r2, ask: 'combo', p, q, trick: 0, trickSign: 1 };
}

function buildLevel4(rng: RNG): Built | null {
  // Pick the sub-variant once; rejections inside it must not re-roll the coin.
  const half = rng.bool(0.5);
  return attempt(80, () => (half ? buildHalfInteger(rng) : buildCombination(rng)));
}

function linearQuestion(rng: RNG, level: Level, built: Built): Generated | null {
  const { x, y, r1, r2, ask, p, q, trick, trickSign } = built;
  const tags = ['simultaneous-equations'];
  const single = ask === 'combo' && ((p === 1 && q === 0) || (p === 0 && q === 1));
  const want: Var | 'both' = single ? (p === 1 ? 'x' : 'y') : 'both';
  const route = choosePlan(r1, r2, want);
  if (trick === 0 && !mental(route, level <= 3 ? 25 : 30)) return null;
  const params: LinearParams = { kind: 'linear', eqs: [r1, r2], ask, p, q };
  const elimination = eliminationText(route, x, y, want);

  if (ask === 'pair') {
    const correct = pairDisplay(x, y);
    const [a1, b1] = r1, [a2, b2] = r2;
    const wrong = [
      { display: pairDisplay(y, x), trap: 'x and y swapped' },
      { display: pairDisplay(x, y.neg()), trap: 'sign error in y' },
      { display: pairDisplay(x.neg(), y), trap: 'sign error in x' },
      { display: pairDisplay(x.neg(), y.neg()), trap: 'both signs wrong' },
      { display: pairDisplay(x.add(E(b1)), y.sub(E(a1))), trap: 'satisfies the first equation only' },
      { display: pairDisplay(x.add(E(b2)), y.sub(E(a2))), trap: 'satisfies the second equation only' },
    ];
    let options;
    try { options = buildChoiceOptions(rng, correct, wrong); } catch { return null; }
    return {
      stem: linearStem(r1, r2, 'pair'),
      answer: { kind: 'choice', value: correct },
      options,
      solution: elimination,
      trap: 'Check the pair in both equations: a sign slip when eliminating gives a pair that fits only one of them.',
      tags,
      params,
      typedAllowed: false,
    };
  }

  const value = E(p).mul(x).add(E(q).mul(y));
  if (!isCleanExact(value).ok) return null;
  const askTex = comboTex(p, q);
  let distractors: Distractor[];
  let solution: string;
  if (single) {
    const wanted: Var = want as Var;
    const otherName: Var = wanted === 'x' ? 'y' : 'x';
    const other = wanted === 'x' ? y : x;
    // Mistakes are made on the direct route (eliminate the other variable), whichever route the solution shows.
    const d = plan(r1, r2, otherName);
    const dOther = plan(r1, r2, wanted);
    const u = wanted === 'x' ? 0 : 1, j = 1 - u;
    const wrongA = d.add ? d.s1[u] - d.s2[u] : d.s1[u] + d.s2[u];
    const wrongC = d.add ? d.s1[2] - d.s2[2] : d.s1[2] + d.s2[2];
    const rawSame = Math.sign(r1[j]) === Math.sign(r2[j]);
    const rawA = rawSame ? r1[u] - r2[u] : r1[u] + r2[u];
    const rawC = rawSame ? r1[2] - r2[2] : r1[2] + r2[2];
    const cands: Distractor[] = [
      { value: other, trap: `gave the value of ${otherName} instead of ${wanted}` },
      { value: value.neg(), trap: 'sign error' },
      { value: other.neg(), trap: `gave ${otherName} with the wrong sign` },
    ];
    if (d.A !== 1) cands.push({ value: E(d.C), trap: `reached ${d.A}${wanted} = ${d.C} and forgot to divide by ${d.A}` });
    if (wrongA !== 0) cands.push({ value: frac(wrongC, wrongA), trap: d.add ? 'subtracted the equations when they should have been added' : 'added the equations when they should have been subtracted' });
    cands.push({ value: frac(wrongC, d.A), trap: `${d.add ? 'added' : 'subtracted'} the left-hand sides but ${d.add ? 'subtracted' : 'added'} the right-hand sides` });
    if ((d.f1 > 1 || d.f2 > 1) && rawA !== 0) cands.push({ value: frac(rawC, rawA), trap: 'combined the equations without scaling them first' });
    if (dOther.A !== 1) cands.push({ value: E(dOther.C), trap: `solved for ${otherName} and forgot to divide by ${dOther.A}` });
    // Answers here are integers or half-integers; a distractor like −69/14 flags itself as wrong.
    distractors = preferIntegers(value, clean(cands).filter((d) => d.value.toRat().d <= 2n));
    solution = elimination;
  } else {
    const pairText = `($x = ${x.toLatex()}$, $y = ${y.toLatex()}$)`;
    distractors = clean([
      { value: x, trap: 'solved for x and stopped' },
      { value: y, trap: 'solved for y and stopped' },
      { value: E(p).mul(x).sub(E(q).mul(y)), trap: 'sign slip in the combination' },
      { value: E(q).mul(x).add(E(p).mul(y)), trap: 'x and y swapped' },
      { value: value.neg(), trap: 'sign error' },
      ...(trick > 1 ? [{ value: value.mulRat(trick), trap: `${trickSign > 0 ? 'added' : 'subtracted'} the equations but forgot to divide by ${trick}` }] : []),
      { value: x.add(y), trap: 'gave x + y' },
    ]);
    if (trick > 0) {
      const combined: Row = [r1[0] + trickSign * r2[0], r1[1] + trickSign * r2[1], r1[2] + trickSign * r2[2]];
      solution = `${trickSign > 0 ? 'Add' : 'Subtract'} the equations: $${eqTex(combined)}$${trick > 1 ? `, i.e. $${askTex} = ${value.toLatex()}$` : ''}. No need to solve for $x$ and $y$ separately ${pairText}.`;
    } else {
      solution = `${elimination} Then $${askTex} = ${value.toLatex()}$.`;
    }
  }
  return {
    stem: linearStem(r1, r2, askTex),
    answer: { kind: 'exact', value },
    options: buildOptions(rng, value, distractors),
    solution,
    trap: single
      ? 'Report the variable that was asked for; eliminate carefully (subtract when the coefficients match in sign, and divide by the whole coefficient at the end).'
      : 'Look for a combination of the equations that gives the requested expression directly; otherwise solve, then combine with the right signs.',
    tags: [...tags, single ? 'elimination' : 'combination'],
    params,
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------
// Level 5: a line and a curve
// ----------------------------------------------------------------------------

type Drawn = { m: number; k: number; x1: number; x2: number; curve: Curve };

function drawCurve(rng: RNG, shape: Curve['type']): Drawn | null {
  const m = shape === 'hyperbola' ? rng.pick([1, -1]) : rng.pick([1, 1, -1, -1, 2, -2]);
  const [x1, x2] = rng.pickDistinct([-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6], 2);
  // x1 = −x2 collapses the sign-error distractors to a repeated value and makes the sum of roots 0.
  if (x1 + x2 === 0) return null;
  if (shape === 'circle') {
    // x1, x2 both on x² + y² = r² and on y = m x + k  ⇔  (1 + m²)(x1 + x2) + 2 m k = 0
    const num = -(1 + m * m) * (x1 + x2);
    if (num % (2 * m) !== 0) return null;
    const k = num / (2 * m);
    if (k === 0 || Math.abs(k) > 12) return null;
    const r2 = x1 * x1 + (m * x1 + k) ** 2;
    if (r2 > 100) return null;
    return { m, k, x1, x2, curve: { type: 'circle', r2 } };
  }
  if (shape === 'hyperbola') {
    // x(mx + k) = n  ⇒  m x² + k x − n = 0 with roots x1, x2: sum = −k/m, product = −n/m
    const k = -m * (x1 + x2);
    const n = -m * x1 * x2;
    if (k === 0 || Math.abs(n) > 36) return null;
    return { m, k, x1, x2, curve: { type: 'hyperbola', n } };
  }
  // x² + bx + c = mx + k  ⇒  x² + (b − m)x + (c − k) = 0 with roots x1, x2
  const k = rng.int(-6, 8);
  const b = m - (x1 + x2);
  const c = k + x1 * x2;
  if (Math.abs(b) > 9 || Math.abs(c) > 12 || c === 0) return null;
  return { m, k, x1, x2, curve: { type: 'parabola', b, c } };
}

function quadraticQuestion(rng: RNG): Generated | null {
  const tags = ['simultaneous-equations', 'quadratic', 'substitution'];
  const shape = rng.weighted(['circle', 'hyperbola', 'parabola'] as const, [5, 2, 3]);
  const drawn = attempt(60, () => drawCurve(rng, shape));
  if (!drawn) return null;
  const { m, k, x1, x2, curve } = drawn;
  const y1 = m * x1 + k, y2 = m * x2 + k;
  const xs = [E(x1), E(x2)];
  const ask = rng.bool(0.6) ? 'set' : 'sum';
  const curveTex = curve.type === 'circle' ? `x^2 + y^2 = ${curve.r2}` : curve.type === 'hyperbola' ? `xy = ${curve.n}` : `y = ${poly([1, curve.b, curve.c])}`;
  const stemEqs = `$${lineTex(m, k)}$\n$${curveTex}$`;
  // Substituted quadratic, monic form (x − x1)(x − x2) = x² − (x1+x2)x + x1x2
  const monic = poly([1, -(x1 + x2), x1 * x2]);
  const factors = `(x ${x1 < 0 ? '+' : '-'} ${Math.abs(x1)})(x ${x2 < 0 ? '+' : '-'} ${Math.abs(x2)})`;
  let subst: string;
  if (curve.type === 'circle') {
    const A = 1 + m * m, B = 2 * m * k, C = k * k - curve.r2;
    subst = `Substitute $y = ${linear(m, k)}$: $x^2 + (${linear(m, k)})^2 = ${curve.r2}$, so $${poly([A, B, C])} = 0$${A !== 1 ? `, i.e. $${monic} = 0$` : ''}`;
  } else if (curve.type === 'hyperbola') {
    subst = `Substitute $y = ${linear(m, k)}$: $x(${linear(m, k)}) = ${curve.n}$, so $${monic} = 0$`;
  } else {
    subst = `Equate the expressions for $y$: $${poly([1, curve.b, curve.c])} = ${linear(m, k)}$, so $${monic} = 0$`;
  }
  const params: QuadParams = { kind: 'quadratic', m, k, curve, ask };
  if (ask === 'set') {
    const distractors = distinctSets([
      { values: [E(y1), E(y2)], trap: 'gave the y-values instead of the x-values' },
      { values: [E(x1)], trap: 'found only one of the two solutions' },
      { values: [E(x2)], trap: 'found only one of the two solutions' },
      { values: [E(-x1), E(-x2)], trap: 'sign error reading the roots off the factors' },
      { values: [E(x1), E(-x2)], trap: 'one sign wrong' },
      { values: [E(x1 + x2), E(x1 * x2)], trap: 'gave the sum and product of the roots, not the roots' },
    ]);
    return {
      stem: `Solve the simultaneous equations\n\n${stemEqs}\n\nFind the possible values of $x$.`,
      answer: { kind: 'set', values: xs, variable: 'x' },
      options: buildSetOptions(rng, xs, distractors),
      solution: `${subst}. This factorises as $${factors} = 0$, so $x = ${x1}$ or $x = ${x2}$.`,
      trap: 'A line meets a quadratic curve twice: keep both roots, and report x, not y.',
      tags,
      params,
      typedAllowed: true,
    };
  }
  const sum = E(x1 + x2);
  const leadCoef = curve.type === 'circle' ? 1 + m * m : curve.type === 'hyperbola' ? Math.abs(m) : 1;
  const distractors = clean([
    { value: E(x1 * x2), trap: 'gave the product of the x-values' },
    { value: E(y1 + y2), trap: 'summed the y-values' },
    { value: sum.neg(), trap: 'sign error: the sum of the roots is −b/a' },
    { value: E(x1), trap: 'found only one solution' },
    { value: E(x2), trap: 'found only one solution' },
    ...(leadCoef !== 1 ? [{ value: sum.mulRat(leadCoef), trap: `forgot to divide by the coefficient ${leadCoef} of x²` }] : []),
    { value: E(x1 + y1), trap: 'added the x and y of one solution instead of the two x-values' },
    { value: E(x2 + y2), trap: 'added the x and y of one solution instead of the two x-values' },
    { value: E(-(x1 * x2)), trap: 'gave −c/a: mixed up the sum and product formulas' },
  ]);
  return {
    stem: `The simultaneous equations\n\n${stemEqs}\n\nhave two solutions. Find the sum of the two values of $x$.`,
    answer: { kind: 'exact', value: sum },
    options: buildOptions(rng, sum, distractors),
    solution: `${subst}. The sum of the roots is $-\\frac{b}{a} = ${sum.toLatex()}$ — no need to find the roots ($${x1}$ and $${x2}$) individually.`,
    trap: 'After substituting, the sum of the x-values is just −b/a of the resulting quadratic (divide by the leading coefficient).',
    tags: [...tags, 'vieta'],
    params,
    typedAllowed: true,
  };
}

export default defineTemplate({
  id: 'm1.equations.simultaneous',
  module: 'M1',
  topic: 'equations',
  title: 'Simultaneous equations',
  levels: {
    1: 'x + y = a, x − y = b (integers)',
    2: '2x + 3y = c, x − y = d',
    3: 'both equations need scaling (3x + 2y = 12, 2x − 5y = −11)',
    4: 'half-integer solutions, or find a combination such as x + y or 3x − y',
    5: 'one linear, one quadratic (y = x + 1, x² + y² = 25): possible x values or their sum',
  },
  generate(rng, level: Level) {
    return retry(rng, (): Generated | null => {
      if (level === 5) return quadraticQuestion(rng);
      const built = level === 1 ? buildLevel1(rng) : level === 2 ? buildLevel2(rng) : level === 3 ? buildLevel3(rng) : buildLevel4(rng);
      if (!built) return null;
      return linearQuestion(rng, level, built);
    });
  },
  verify(q) {
    const p = q.params as unknown as LinearParams | QuadParams;
    if (p.kind === 'linear') {
      const [[a1, b1, c1], [a2, b2, c2]] = p.eqs;
      const det = a1 * b2 - a2 * b1;
      if (det === 0) return false;
      // Cramer's rule (generate() never solved the system: it chose x, y first).
      const X = frac(c1 * b2 - c2 * b1, det);
      const Y = frac(a1 * c2 - a2 * c1, det);
      // Substitute back exactly into both equations.
      if (!E(a1).mul(X).add(E(b1).mul(Y)).equals(E(c1))) return false;
      if (!E(a2).mul(X).add(E(b2).mul(Y)).equals(E(c2))) return false;
      if (q.answer.kind === 'choice') {
        const expected = pairDisplay(X, Y);
        return q.answer.value === expected && q.options.some((o) => o.correct && o.display === expected);
      }
      if (q.answer.kind !== 'exact') return false;
      return E(p.p).mul(X).add(E(p.q).mul(Y)).equals(q.answer.value);
    }
    // line y = m x + k meets the curve: substitute exactly
    const { m, k, curve } = p;
    const onCurve = (x: Exact): boolean => {
      const y = E(m).mul(x).add(E(k));
      if (curve.type === 'circle') return x.mul(x).add(y.mul(y)).equals(E(curve.r2));
      if (curve.type === 'hyperbola') return x.mul(y).equals(E(curve.n));
      return y.equals(x.mul(x).add(E(curve.b).mul(x)).add(E(curve.c)));
    };
    if (q.answer.kind === 'set') {
      const vals = q.answer.values;
      // two distinct x-values on both the line and the curve: a quadratic has no others
      return vals.length === 2 && !vals[0].equals(vals[1]) && vals.every(onCurve);
    }
    if (q.answer.kind !== 'exact') return false;
    // Sum of the roots of the substituted quadratic by Vieta, straight from the raw parameters.
    let sum: Exact;
    let disc: number;
    if (curve.type === 'circle') {
      // (1 + m²)x² + 2mk x + (k² − r²) = 0
      sum = frac(-2 * m * k, 1 + m * m);
      disc = 4 * m * m * k * k - 4 * (1 + m * m) * (k * k - curve.r2);
    } else if (curve.type === 'hyperbola') {
      // m x² + k x − n = 0
      sum = frac(-k, m);
      disc = k * k + 4 * m * curve.n;
    } else {
      // x² + (b − m)x + (c − k) = 0
      sum = E(m - curve.b);
      disc = (curve.b - m) ** 2 - 4 * (curve.c - k);
    }
    return disc > 0 && sum.equals(q.answer.value);
  },
});
