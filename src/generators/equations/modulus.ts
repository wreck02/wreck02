import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildOptions, buildSetOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { gcd, linear } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Modulus equations.
 * Level 1: |x| = 4, |x| + 3 = 7 (kind 'set')
 * Level 2: |x − 3| = 5 → {8, −2}
 * Level 3: |2x − 1| = 7 → {4, −3}
 * Level 4: |x − 3| = 2x, |x + 2| = 3x, |x − 5| = x + 1: one case is extraneous (kind 'exact')
 * Level 5: |x + 1| = |2x − 3| → {4, 2/3}; |2x − 1| = 3x + 2 with one root rejected (kind 'exact');
 *          or |x − 2| < 3 → −1 < x < 5 (kind 'choice')
 *
 * Each side is stored as {abs, coefficients}. verify() substitutes every claimed solution
 * exactly, and independently re-solves the two linear cases p = ±q, keeping only those that
 * satisfy the original equation, so the claimed set must be complete and the rejected root of
 * level 4 must genuinely fail. Interval answers are checked at sample points like inequalities.
 */

type Expr = { abs: boolean; c: number[] };
type Eq = { L: Expr; R: Expr };
type Op = '<' | '>' | '<=' | '>=';
type Rat = [number, number];
type Region = { kind: 'between'; a: Rat; b: Rat; closed: boolean } | { kind: 'outside'; a: Rat; b: Rat; closed: boolean } | { kind: 'ray'; op: Op; v: Rat };

const OPTEX: Record<Op, string> = { '<': '<', '>': '>', '<=': '\\le', '>=': '\\ge' };
const closedOp = (op: Op) => op === '<=' || op === '>=';
const lessOp = (op: Op) => op === '<' || op === '<=';

function evalPoly(c: number[], x: Exact): Exact {
  return c.reduce((acc, coef) => acc.mul(x).add(E(coef)), Exact.ZERO);
}
const evalExpr = (e: Expr, x: Exact) => (e.abs ? evalPoly(e.c, x).abs() : evalPoly(e.c, x));
const satisfies = (eq: Eq, x: Exact) => evalExpr(eq.L, x).equals(evalExpr(eq.R, x));

/** Solutions of L = R found by solving the linear cases p = ±q and substituting back. */
function solveCases(eq: Eq): Exact[] {
  const [p1, p0] = eq.L.c.length === 2 ? eq.L.c : [0, eq.L.c[0]];
  const [q1, q0] = eq.R.c.length === 2 ? eq.R.c : [0, eq.R.c[0]];
  const out: Exact[] = [];
  for (const s of [1, -1]) {
    const a = p1 - s * q1, b = s * q0 - p0; // a x = b
    if (a === 0) continue;
    const x = frac(b, a);
    if (satisfies(eq, x) && !out.some((y) => y.equals(x))) out.push(x);
  }
  return out;
}

const exprTex = (e: Expr) => (e.abs ? `|${linear(e.c[0], e.c[1])}|` : e.c.length === 2 ? linear(e.c[0], e.c[1]) : `${e.c[0]}`);
const eqTex = (eq: Eq) => `${exprTex(eq.L)} = ${exprTex(eq.R)}`;
const A = (a: number, b: number): Expr => ({ abs: true, c: [a, b] });
const P = (a: number, b: number): Expr => ({ abs: false, c: [a, b] });
const K = (k: number): Expr => ({ abs: false, c: [k] });

function R(n: number, d = 1): Rat {
  const g = gcd(n, d) || 1;
  const s = d < 0 ? -1 : 1;
  return [(s * n) / g, (s * d) / g];
}
const X = (r: Rat) => frac(r[0], r[1]);
const tex = (r: Rat) => X(r).toLatex();

function cmpOk(sign: number, op: Op): boolean {
  return op === '<' ? sign < 0 : op === '>' ? sign > 0 : op === '<=' ? sign <= 0 : sign >= 0;
}
function member(r: Region, x: Exact): boolean {
  if (r.kind === 'ray') return cmpOk(x.cmp(X(r.v)), r.op);
  const ca = x.cmp(X(r.a)), cb = x.cmp(X(r.b));
  if (r.kind === 'between') return r.closed ? ca >= 0 && cb <= 0 : ca > 0 && cb < 0;
  return r.closed ? ca <= 0 || cb >= 0 : ca < 0 || cb > 0;
}
function render(r: Region): string {
  if (r.kind === 'ray') return `$x ${OPTEX[r.op]} ${tex(r.v)}$`;
  if (r.kind === 'between') {
    const o = r.closed ? '\\le' : '<';
    return `$${tex(r.a)} ${o} x ${o} ${tex(r.b)}$`;
  }
  return `$x ${r.closed ? '\\le' : '<'} ${tex(r.a)}$ or $x ${r.closed ? '\\ge' : '>'} ${tex(r.b)}$`;
}
/** |x − a| op k at x: */
function holdsAbs(a: number, k: number, op: Op, x: Exact): boolean {
  return cmpOk(x.sub(E(a)).abs().cmp(E(k)), op);
}
function samples(a: number, k: number): Exact[] {
  const out: Exact[] = [E(0), E(-1000), E(1000), E(a)];
  for (const c of [a - k, a + k]) for (const d of [0, 0.5, -0.5, 1, -1]) out.push(E(c + d));
  return out;
}

function cleanSets<T extends { values: Exact[] }>(ds: T[]): T[] {
  return ds.filter((d) => d.values.length > 0 && d.values.every((v, i) => isCleanExact(v).ok && d.values.findIndex((w) => w.equals(v)) === i));
}
function clean(ds: Distractor[]): Distractor[] {
  return ds.filter((d) => Number.isFinite(d.value.toNumber()) && isCleanExact(d.value).ok);
}

type Variant = 'abs-x' | 'abs-x-plus' | 'abs-shift' | 'abs-linear' | 'abs-eq-bx' | 'abs-plus-eq-bx' | 'abs-eq-x-plus' | 'abs-abs' | 'abs-eq-linear' | 'abs-interval';

const VARIANTS: Record<Level, Variant[]> = {
  1: ['abs-x', 'abs-x-plus'],
  2: ['abs-shift'],
  3: ['abs-linear'],
  4: ['abs-eq-bx', 'abs-plus-eq-bx', 'abs-eq-x-plus'],
  5: ['abs-abs', 'abs-abs', 'abs-eq-linear', 'abs-interval'],
};

function setQ(rng: RNG, eq: Eq, roots: Exact[], ds: { values: Exact[]; trap: string }[], solution: string, trap: string, tags: string[]): Generated | null {
  let options;
  try { options = buildSetOptions(rng, roots, cleanSets(ds)); } catch { return null; }
  return {
    stem: `Solve $${eqTex(eq)}$.`,
    answer: { kind: 'set', values: roots },
    options,
    solution,
    trap,
    tags: ['modulus', ...tags],
    params: { kind: 'set', eq },
    typedAllowed: true,
  };
}

function exactQ(rng: RNG, eq: Eq, x: Exact, rejected: Exact, ds: Distractor[], solution: string, trap: string, tags: string[]): Generated {
  return {
    stem: `Solve $${eqTex(eq)}$.`,
    answer: { kind: 'exact', value: x },
    options: buildOptions(rng, x, clean(ds)),
    solution,
    trap,
    tags: ['modulus', 'extraneous', ...tags],
    params: { kind: 'exact', eq, rejected: [Number(rejected.toRat().n), Number(rejected.toRat().d)] },
    typedAllowed: true,
  };
}

function build(rng: RNG, variant: Variant): Generated | null {
  switch (variant) {
    case 'abs-x':
    case 'abs-x-plus': {
      const k = variant === 'abs-x' ? rng.int(2, 12) : rng.int(1, 12);
      const a = variant === 'abs-x' ? 0 : rng.nonZeroInt(-6, 9);
      const b = k + a;
      const eq: Eq = { L: A(1, 0), R: K(k) };
      const stem = variant === 'abs-x' ? `Solve $|x| = ${k}$.` : `Solve $|x| ${a < 0 ? '-' : '+'} ${Math.abs(a)} = ${b}$.`;
      const roots = [E(k), E(-k)];
      const ds = [
        // At most one option with a single root: the answer is always a pair here, so two of
        // them would hand the candidate two eliminations for free.
        { values: [rng.bool(0.5) ? E(k) : E(-k)], trap: 'gave only one of the two solutions' },
        ...(variant === 'abs-x-plus' ? [
          { values: [E(b + a), E(-(b + a))], trap: 'added the constant instead of subtracting it' },
          { values: [E(b), E(-b)], trap: 'ignored the constant' },
          { values: [E(a), E(-a)], trap: 'solved |x| = a instead of isolating |x| first' },
        ] : [
          { values: [E(k * k), E(-k * k)], trap: 'squared instead of solving' },
          { values: [E(-k), E(0)], trap: 'took 0 as the second solution' },
        ]),
        { values: [E(k), E(0)], trap: 'took 0 as the second solution' },
      ];
      let options;
      try { options = buildSetOptions(rng, roots, cleanSets(ds)); } catch { return null; }
      return {
        stem,
        answer: { kind: 'set', values: roots },
        options,
        solution: `${variant === 'abs-x-plus' ? `$|x| = ${b} ${a < 0 ? '+' : '-'} ${Math.abs(a)} = ${k}$, so ` : ''}$x = ${k}$ or $x = -${k}$: both have modulus $${k}$.`,
        trap: '|x| = k has two solutions, ±k; isolate the modulus before reading them off.',
        tags: ['modulus', 'basic'],
        params: { kind: 'set', eq },
        typedAllowed: true,
      };
    }
    case 'abs-shift': {
      const a = rng.nonZeroInt(-9, 9), k = rng.int(1, 9);
      const eq: Eq = { L: A(1, -a), R: K(k) };
      const roots = [E(a + k), E(a - k)];
      return setQ(rng, eq, roots, [
        { values: [rng.bool(0.5) ? E(a + k) : E(a - k)], trap: 'gave only one of the two cases' },
        { values: [E(k - a), E(-k - a)], trap: 'sign error: solved x + a = ±k' },
        { values: [E(a + k), E(-(a + k))], trap: 'put ± on the whole answer instead of on k' },
        { values: [E(k), E(-k)], trap: 'ignored the shift a' },
        { values: [E(a), E(k)], trap: 'read off the two numbers in the question' },
      ], `Either $${linear(1, -a)} = ${k}$ or $${linear(1, -a)} = -${k}$, so $x = ${a + k}$ or $x = ${a - k}$ (the two numbers a distance $${k}$ from $${a}$).`, '|x − a| = k means x is k either side of a: x = a ± k, not ±(a + k).', ['shift']);
    }
    case 'abs-linear': {
      const a = rng.pick([2, 3, 4, 5]), b = rng.nonZeroInt(-9, 9), k = rng.int(1, 12);
      const r1 = frac(b + k, a), r2 = frac(b - k, a);
      if (!r1.isInteger() && !r2.isInteger() && rng.bool(0.7)) return null;
      const eq: Eq = { L: A(a, -b), R: K(k) };
      return setQ(rng, eq, [r1, r2], [
        { values: [rng.bool(0.5) ? r1 : r2], trap: 'gave only one of the two cases' },
        { values: [frac(k - b, a), frac(-k - b, a)], trap: `sign error: solved ${a}x + ${Math.abs(b)} = ±${k}` },
        { values: [E(b + k), E(b - k)], trap: `forgot to divide by ${a}` },
        { values: [r1, frac(k - b, a)], trap: 'sign error in the negative case' },
        { values: [r1, r1.neg()], trap: 'put ± on the whole answer' },
      ], `$${linear(a, -b)} = ${k}$ gives $x = ${r1.toLatex()}$; $${linear(a, -b)} = -${k}$ gives $${a}x = ${b - k}$, $x = ${r2.toLatex()}$.`, 'Set the inside equal to +k and to −k separately, then finish each linear equation (divide by a).', ['linear-inside']);
    }
    case 'abs-eq-bx':
    case 'abs-plus-eq-bx': {
      const b = rng.pick([2, 2, 3, 4]);
      const a = rng.int(1, 12);
      const plus = variant === 'abs-plus-eq-bx';
      // |x − a| = bx: valid root a/(b+1), rejected −a/(b−1); |x + a| = bx: valid a/(b−1), rejected −a/(b+1)
      const x = plus ? frac(a, b - 1) : frac(a, b + 1);
      const rejected = plus ? frac(-a, b + 1) : frac(-a, b - 1);
      const eq: Eq = { L: A(1, plus ? a : -a), R: P(b, 0) };
      // bx >= 0 is the whole point of the level, so exactly one negative option (the genuinely
      // instructive rejected root): more would be eliminable by inspection.
      const ds = [
        { value: rejected, trap: 'kept the root from the other case, which makes the right-hand side negative' },
        { value: plus ? frac(a, b + 1) : frac(a, b - 1), trap: 'solved the wrong case' },
        { value: frac(a, b), trap: 'divided a by b' },
        { value: E(a), trap: 'ignored the right-hand side' },
        { value: E(a * (plus ? b - 1 : b + 1)), trap: `multiplied by ${plus ? 'b − 1' : 'b + 1'} instead of dividing by it` },
        { value: E(a + b), trap: 'dropped the x on the right and solved the modulus equal to b' },
      ];
      const validCase = plus ? `${linear(1, a)} = ${b}x` : `${linear(-1, a)} = ${b}x`;
      const badCase = plus ? `${linear(-1, -a)} = ${b}x` : `${linear(1, -a)} = ${b}x`;
      return exactQ(rng, eq, x, rejected, ds,
        `Case $${validCase}$ gives $x = ${x.toLatex()}$, and $${b}x \\ge 0$ there, so it is valid. Case $${badCase}$ gives $x = ${rejected.toLatex()}$, but then $${b}x < 0$ cannot equal a modulus: reject it.`,
        'A modulus is never negative, so any candidate making the other side negative is extraneous: check both cases in the original equation.', ['bx']);
    }
    case 'abs-eq-x-plus': {
      const a = rng.int(1, 9), c = rng.intExcluding(1, 9, [a]);
      // |x − a| = x + c: x − a = x + c is impossible; a − x = x + c gives x = (a − c)/2
      const x = frac(a - c, 2);
      const eq: Eq = { L: A(1, -a), R: P(1, c) };
      const ds = [
        { value: frac(a + c, 2), trap: 'sign error: solved a − x = x − c' },
        { value: x.neg(), trap: 'sign error' },
        { value: E(a + c), trap: 'forgot to halve' },
        { value: E(a - c), trap: 'forgot to halve' },
        { value: frac(-(a + c), 2), trap: 'sign errors in both terms' },
      ];
      const impossible = `${linear(1, -a)} = ${linear(1, c)}`;
      return exactQ(rng, eq, x, E(a - c + 1000), ds,
        `Case $${impossible}$ gives $-${a} = ${c}$: impossible. Case $${linear(-1, a)} = ${linear(1, c)}$ gives $2x = ${a - c}$, $x = ${x.toLatex()}$, and $x + ${c} = ${x.add(E(c)).toLatex()} \\ge 0$ there, so it is valid.`,
        'One case may give no solution at all; do not force a second answer, and check the surviving root makes the right-hand side non-negative.', ['x-plus-c']);
    }
    case 'abs-abs': {
      const b = rng.pick([2, 2, 3]), a = rng.nonZeroInt(-6, 6), c = rng.nonZeroInt(-6, 6);
      const x1 = frac(a - c, b - 1), x2 = frac(-(a + c), b + 1);
      if (x1.equals(x2)) return null;
      const eq: Eq = { L: A(1, a), R: A(b, c) };
      const swap = rng.bool(0.3);
      const shown: Eq = swap ? { L: eq.R, R: eq.L } : eq;
      const roots = [x1, x2];
      let options;
      try {
        options = buildSetOptions(rng, roots, cleanSets([
          { values: [rng.bool(0.5) ? x1 : x2], trap: 'gave only one of the two cases' },
          { values: [frac(c - a, b - 1), x2], trap: 'sign error in the first case' },
          { values: [x1, frac(a + c, b + 1)], trap: 'sign error in the second case' },
          { values: [E(a - c), E(-(a + c))], trap: 'forgot to divide by the x coefficient in both cases' },
          { values: [E(a - c), x2], trap: 'forgot to divide by the x coefficient in the first case' },
          { values: [x1, E(-(a + c))], trap: 'forgot to divide by the x coefficient in the second case' },
        ]));
      } catch { return null; }
      return {
        stem: `Solve $${eqTex(shown)}$.`,
        answer: { kind: 'set', values: roots },
        options,
        solution: `Either $${linear(1, a)} = ${linear(b, c)}$, giving $x = ${x1.toLatex()}$, or $${linear(1, a)} = -(${linear(b, c)})$, giving $${linear(b + 1, 0)} = ${-(a + c)}$, $x = ${x2.toLatex()}$. Both are valid since both sides are moduli.`,
        trap: '|p| = |q| means p = q or p = −q; both cases give genuine solutions (no extraneous roots when both sides are moduli).',
        tags: ['modulus', 'two-moduli'],
        params: { kind: 'set', eq: shown },
        typedAllowed: true,
      };
    }
    case 'abs-eq-linear': {
      // |ax + p| = cx + d with c > a: one of the two cases makes cx + d negative, so the
      // answer is a single value — at level 5 the size of the answer set must not be a tell.
      const a = rng.pick([1, 1, 2, 3]);
      const c = rng.int(a + 1, a + 4);
      const p = rng.nonZeroInt(-9, 9), d = rng.int(1, 9);
      const eq: Eq = { L: A(a, p), R: P(c, d) };
      const roots = solveCases(eq);
      if (roots.length !== 1) return null;
      const x = roots[0];
      const cands = [frac(d - p, a - c), frac(-(p + d), a + c)];
      const rejected = cands.find((v) => !v.equals(x));
      if (!rejected || satisfies(eq, rejected)) return null;
      if (x.isZero() || !isCleanExact(x).ok || !isCleanExact(rejected).ok) return null;
      if (!x.isInteger() && rng.bool(0.6)) return null;
      const firstValid = x.equals(cands[0]);
      const ds = clean([
        { value: rejected, trap: 'kept the root from the case where the right-hand side comes out negative' },
        { value: frac(d - p, a + c), trap: 'used a + c with the positive case: the signs must match' },
        { value: frac(-(p + d), a - c), trap: 'used a − c with the negative case: the signs must match' },
        { value: frac(d - p, a), trap: 'ignored the cx term on the right-hand side' },
        { value: frac(-p, a), trap: 'set the inside of the modulus to zero' },
        { value: E(d - p), trap: 'collected the constants but never divided by a − c' },
        { value: E(-(p + d)), trap: 'collected the constants but never divided by a + c' },
        { value: x.neg(), trap: 'sign error in the final division' },
      ]);
      return exactQ(rng, eq, x, rejected, ds,
        `Case $${linear(a, p)} = ${linear(c, d)}$ gives $x = ${cands[0].toLatex()}$; case $${linear(-a, -p)} = ${linear(c, d)}$ gives $x = ${cands[1].toLatex()}$. Only $x = ${x.toLatex()}$ keeps $${linear(c, d)} \\ge 0$ (the ${firstValid ? 'second' : 'first'} gives $${evalPoly([c, d], rejected).toLatex()}$), so it is the only solution.`,
        'Both cases give a candidate, but a modulus cannot equal a negative number: substitute each candidate back and reject any that makes the right-hand side negative.', ['linear-rhs']);
    }
    case 'abs-interval': {
      const a = rng.nonZeroInt(-6, 6), k = rng.int(1, 8);
      const op = rng.pick(['<', '<=', '>', '>='] as Op[]);
      const closed = closedOp(op);
      const lo = R(a - k), hi = R(a + k);
      const correct: Region = lessOp(op) ? { kind: 'between', a: lo, b: hi, closed } : { kind: 'outside', a: lo, b: hi, closed };
      const wrong: { r: Region; trap: string }[] = [
        { r: lessOp(op) ? { kind: 'outside', a: lo, b: hi, closed } : { kind: 'between', a: lo, b: hi, closed }, trap: lessOp(op) ? '|x − a| < k is the inside of the interval, not the outside' : '|x − a| > k is the outside, not the inside' },
        { r: lessOp(op) ? { kind: 'between', a: R(-a - k), b: R(-a + k), closed } : { kind: 'outside', a: R(-a - k), b: R(-a + k), closed }, trap: 'sign error: centred the interval at −a' },
        { r: { kind: 'ray', op, v: hi }, trap: 'dropped the modulus and solved a linear inequality' },
        { r: lessOp(op) ? { kind: 'between', a: lo, b: hi, closed: !closed } : { kind: 'outside', a: lo, b: hi, closed: !closed }, trap: closed ? 'made the inequality strict' : 'included the endpoints' },
        { r: lessOp(op) ? { kind: 'between', a: R(-k), b: R(k), closed } : { kind: 'outside', a: R(-k), b: R(k), closed }, trap: 'ignored the shift a' },
      ];
      const pts = samples(a, k);
      if (!pts.every((x) => holdsAbs(a, k, op, x) === member(correct, x))) return null;
      const distinct = wrong.filter((w) => !pts.every((x) => member(w.r, x) === member(correct, x)));
      let options;
      try { options = buildChoiceOptions(rng, render(correct), distinct.map((w) => ({ display: render(w.r), trap: w.trap }))); } catch { return null; }
      const kept = distinct.filter((w) => options.some((o) => o.display === render(w.r)));
      return {
        stem: `Solve $|${linear(1, -a)}| ${OPTEX[op]} ${k}$.`,
        answer: { kind: 'choice', value: render(correct) },
        options,
        solution: `$|${linear(1, -a)}| ${OPTEX[op]} ${k}$ means the distance from $x$ to $${a}$ is ${lessOp(op) ? 'at most' : 'at least'} $${k}$${closed ? '' : ' (strictly)'}: ${lessOp(op) ? `$-${k} ${OPTEX[op]} ${linear(1, -a)} ${OPTEX[op]} ${k}$, so` : `$${linear(1, -a)} ${OPTEX[op]} ${k}$ or $${linear(1, -a)} ${op === '>' ? '<' : '\\le'} -${k}$, so`} ${render(correct)}.`,
        trap: '|x − a| < k is the interval a − k < x < a + k (distance from a less than k); > k gives the two outside rays.',
        tags: ['modulus', 'inequality', 'interval'],
        params: { kind: 'choice', a, k, op, region: correct, wrong: kept.map((w) => w.r) },
        typedAllowed: false,
      };
    }
  }
}

export default defineTemplate({
  id: 'm1.equations.modulus',
  module: 'M1',
  topic: 'equations',
  title: 'Modulus equations',
  levels: {
    1: '|x| = 4, |x| + 3 = 7',
    2: '|x − 3| = 5',
    3: '|2x − 1| = 7',
    4: '|x − 3| = 2x: one root is extraneous',
    5: '|x + 1| = |2x − 3|; |2x − 1| = 3x + 2 (one root rejected); |x − 2| < 3 as an interval',
  },
  generate(rng, level: Level) {
    const variant = rng.pick(VARIANTS[level]);
    return retry(rng, () => build(rng, variant));
  },
  verify(q) {
    const p = q.params as { kind: string; eq?: Eq; rejected?: Rat; a?: number; k?: number; op?: Op; region?: Region; wrong?: Region[] };
    if (q.answer.kind === 'choice') {
      if (p.a === undefined || p.k === undefined || !p.op || !p.region || !p.wrong) return false;
      const pts = samples(p.a, p.k);
      if (!pts.every((x) => holdsAbs(p.a!, p.k!, p.op!, x) === member(p.region!, x))) return false;
      if (p.wrong.some((w) => pts.every((x) => holdsAbs(p.a!, p.k!, p.op!, x) === member(w, x)))) return false;
      return q.answer.value === render(p.region) && q.options.filter((o) => o.correct).length === 1;
    }
    if (!p.eq) return false;
    const found = solveCases(p.eq);
    if (q.answer.kind === 'set') {
      const vals = q.answer.values;
      if (!vals.every((x) => satisfies(p.eq!, x))) return false;
      // complete and without repeats
      return vals.length === found.length && found.every((f) => vals.some((v) => v.equals(f))) && new Set(vals.map((v) => v.toPlain())).size === vals.length;
    }
    if (q.answer.kind !== 'exact' || !p.rejected) return false;
    const x = q.answer.value;
    if (!satisfies(p.eq, x)) return false;
    if (found.length !== 1 || !found[0].equals(x)) return false;
    // the rejected candidate must not satisfy the equation
    return !satisfies(p.eq, frac(p.rejected[0], p.rejected[1]));
  },
});
