import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { gcd, linear, poly } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Linear and quadratic inequalities.
 * Level 1: 3x − 5 > 7 → x > 4 (kind 'choice': flipped / sign-swapped variants)
 * Level 2: −2x + 3 ≤ 9 or 2x + 7 > 5x − 2 — dividing by a negative flips the sign
 * Level 3: x² − 5x + 6 < 0 → 2 < x < 3, versus x < 2 or x > 3
 * Level 4: x² ≥ 4x, 2x² + x − 6 > 0, x² < 16, or x² + 6 < 5x (needs rearranging)
 * Level 5: number of integers satisfying x² − 7x + 6 ≤ 0 (kind 'exact'), or the largest /
 *          smallest positive integer satisfying a quadratic inequality
 *
 * The solution set is stored structurally (ray / between / outside with rational endpoints).
 * generate() builds it from the roots; verify() re-tests the original inequality at the roots,
 * half-integers either side, midpoints and far points with Exact arithmetic and checks the
 * membership pattern matches (and that every wrong region differs somewhere). Integer counts
 * are re-derived by brute force.
 */

type Op = '<' | '>' | '<=' | '>=';
type Rat = [number, number];
type Region =
  | { kind: 'ray'; op: Op; v: Rat }
  | { kind: 'between'; a: Rat; b: Rat; closed: boolean }
  | { kind: 'outside'; a: Rat; b: Rat; closed: boolean };
type Ineq = { L: number[]; R: number[]; op: Op };

const OPTEX: Record<Op, string> = { '<': '<', '>': '>', '<=': '\\le', '>=': '\\ge' };
const FLIP: Record<Op, Op> = { '<': '>', '>': '<', '<=': '>=', '>=': '<=' };
const TOGGLE: Record<Op, Op> = { '<': '<=', '<=': '<', '>': '>=', '>=': '>' };
const closedOp = (op: Op) => op === '<=' || op === '>=';
const lessOp = (op: Op) => op === '<' || op === '<=';

function R(n: number, d = 1): Rat {
  const g = gcd(n, d) || 1;
  const s = d < 0 ? -1 : 1;
  return [(s * n) / g, (s * d) / g];
}
const X = (r: Rat) => frac(r[0], r[1]);
const tex = (r: Rat) => X(r).toLatex();
const ratLt = (a: Rat, b: Rat) => a[0] * b[1] < b[0] * a[1];

function cmpOk(sign: number, op: Op): boolean {
  return op === '<' ? sign < 0 : op === '>' ? sign > 0 : op === '<=' ? sign <= 0 : sign >= 0;
}

function evalPoly(c: number[], x: Exact): Exact {
  return c.reduce((acc, coef) => acc.mul(x).add(E(coef)), Exact.ZERO);
}

function holds(q: Ineq, x: Exact): boolean {
  return cmpOk(evalPoly(q.L, x).sub(evalPoly(q.R, x)).sign(), q.op);
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

/** Test points: the critical values, half a unit and a unit either side, midpoints, 0 and far out. */
function samples(crit: Rat[]): Exact[] {
  const out: Exact[] = [E(0), E(-1000), E(1000)];
  const cs = crit.map(X);
  for (const c of cs) for (const d of [0, 0.5, -0.5, 1, -1]) out.push(c.add(E(d)));
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) out.push(cs[i].add(cs[j]).mulRat(0.5));
  return out;
}

function sameRegion(a: Region, b: Region, pts: Exact[]): boolean {
  return pts.every((x) => member(a, x) === member(b, x));
}

function ineqTex(q: Ineq): string {
  return `${poly(q.L)} ${OPTEX[q.op]} ${poly(q.R)}`;
}

function clean(ds: Distractor[]): Distractor[] {
  return ds.filter((d) => Number.isFinite(d.value.toNumber()) && isCleanExact(d.value).ok);
}

type Variant = 'pos-linear' | 'neg-linear' | 'both-sides' | 'monic-quad' | 'x2-ax' | 'general' | 'x2-k' | 'rearranged' | 'count' | 'count-sqrt' | 'extreme';

const VARIANTS: Record<Level, Variant[]> = {
  1: ['pos-linear'],
  2: ['neg-linear', 'neg-linear', 'both-sides'],
  3: ['monic-quad'],
  4: ['x2-ax', 'general', 'x2-k', 'rearranged'],
  5: ['count', 'count-sqrt', 'extreme', 'extreme'],
};

function choiceQ(rng: RNG, ineq: Ineq, crit: Rat[], correct: Region, wrong: { r: Region; trap: string }[], solution: string, trap: string, tags: string[]): Generated | null {
  const pts = samples(crit);
  // The generated set must actually solve the inequality; wrong regions must not.
  if (!pts.every((x) => holds(ineq, x) === member(correct, x))) return null;
  const distinct = wrong.filter((w) => !sameRegion(w.r, correct, pts));
  const correctStr = render(correct);
  let options;
  try { options = buildChoiceOptions(rng, correctStr, distinct.map((w) => ({ display: render(w.r), trap: w.trap }))); } catch { return null; }
  const kept = distinct.filter((w) => options.some((o) => o.display === render(w.r)));
  const stem = rng.bool(0.5) ? `Solve the inequality $${ineqTex(ineq)}$.` : `Find the set of values of $x$ for which $${ineqTex(ineq)}$.`;
  return {
    stem,
    answer: { kind: 'choice', value: correctStr },
    options,
    solution,
    trap,
    tags: ['inequality', ...tags],
    params: { kind: 'choice', ineq, crit, region: correct, wrong: kept.map((w) => w.r) },
    typedAllowed: false,
  };
}

/** Quadratic with leading coefficient > 0 and roots lo < hi: the solution region for `op` 0. */
function quadRegion(lo: Rat, hi: Rat, op: Op): Region {
  return lessOp(op) ? { kind: 'between', a: lo, b: hi, closed: closedOp(op) } : { kind: 'outside', a: lo, b: hi, closed: closedOp(op) };
}

function quadWrong(lo: Rat, hi: Rat, op: Op): { r: Region; trap: string }[] {
  const closed = closedOp(op);
  const other: Region = lessOp(op) ? { kind: 'outside', a: lo, b: hi, closed } : { kind: 'between', a: lo, b: hi, closed };
  const nlo = R(-hi[0], hi[1]), nhi = R(-lo[0], lo[1]);
  return [
    { r: other, trap: lessOp(op) ? 'chose the outside region: the quadratic is negative between its roots' : 'chose the inside region: the quadratic is positive outside its roots' },
    { r: quadRegion(nlo, nhi, op), trap: 'sign error reading the roots off the factors' },
    { r: lessOp(op) ? { kind: 'outside', a: nlo, b: nhi, closed } : { kind: 'between', a: nlo, b: nhi, closed }, trap: 'wrong region and wrong signs on the roots' },
    { r: { kind: 'ray', op, v: hi }, trap: 'treated it like a linear inequality using only one root' },
    { r: { kind: 'ray', op: FLIP[op], v: lo }, trap: 'treated it like a linear inequality using only one root' },
    { r: lessOp(op) ? { kind: 'between', a: lo, b: hi, closed: !closed } : { kind: 'outside', a: lo, b: hi, closed: !closed }, trap: closed ? 'dropped the endpoints (the inequality is not strict)' : 'included the endpoints (the inequality is strict)' },
  ];
}

const ORD: Record<Op, string> = { '<': 'negative', '>': 'positive', '<=': 'negative or zero', '>=': 'positive or zero' };

function quadSolution(factored: string, lo: Rat, hi: Rat, op: Op, region: Region, prefix = ''): string {
  return `${prefix}Factorise: $${factored} ${OPTEX[op]} 0$, roots $${tex(lo)}$ and $${tex(hi)}$. The quadratic is ${ORD[op]} ${lessOp(op) ? 'between' : 'outside'} its roots (positive leading coefficient), so ${render(region)}.`;
}

function build(rng: RNG, variant: Variant): Generated | null {
  const op = rng.pick(['<', '>', '<=', '>='] as Op[]);
  switch (variant) {
    case 'pos-linear': {
      const a = rng.int(2, 6), t = rng.int(-8, 8), b = rng.nonZeroInt(-12, 12);
      const c = a * t + b;
      const ineq: Ineq = { L: [a, b], R: [c], op };
      const v = R(t);
      const wrong: { r: Region; trap: string }[] = [
        { r: { kind: 'ray', op: FLIP[op], v }, trap: 'flipped the inequality for no reason' },
        { r: { kind: 'ray', op, v: R(-t) }, trap: 'sign error in the value' },
        { r: { kind: 'ray', op: FLIP[op], v: R(-t) }, trap: 'flipped the inequality and sign error in the value' },
        { r: { kind: 'ray', op, v: R(c + b, a) }, trap: 'added b instead of subtracting it' },
        { r: { kind: 'ray', op: TOGGLE[op], v }, trap: closedOp(op) ? 'made the inequality strict' : 'made the inequality non-strict' },
        { r: { kind: 'ray', op, v: R((c - b) * a) }, trap: 'multiplied by a instead of dividing' },
      ];
      return choiceQ(rng, ineq, [v], { kind: 'ray', op, v }, wrong,
        `$${a}x ${OPTEX[op]} ${c - b}$, and dividing by the positive number $${a}$ keeps the sign: $x ${OPTEX[op]} ${t}$.`,
        'Solve exactly like an equation; the inequality sign only flips when you multiply or divide by a negative number.', ['linear']);
    }
    case 'neg-linear': {
      const a = rng.int(2, 6), t = rng.int(-8, 8), b = rng.nonZeroInt(-12, 12);
      const c = b - a * t; // −ax + b op c  ⇔  −ax op c − b  ⇔  x FLIP(op) t
      const swap = rng.bool(0.5);
      const ineq: Ineq = swap ? { L: [c], R: [-a, b], op } : { L: [-a, b], R: [c], op };
      const eff: Op = swap ? FLIP[op] : op; // as −ax + b eff c
      const ans: Region = { kind: 'ray', op: FLIP[eff], v: R(t) };
      const wrong: { r: Region; trap: string }[] = [
        { r: { kind: 'ray', op: eff, v: R(t) }, trap: 'did not flip the inequality when dividing by a negative' },
        { r: { kind: 'ray', op: FLIP[eff], v: R(-t) }, trap: 'sign error in the value' },
        { r: { kind: 'ray', op: eff, v: R(-t) }, trap: 'did not flip the inequality, and sign error in the value' },
        { r: { kind: 'ray', op: FLIP[eff], v: R(b + c, a) }, trap: 'added the constant instead of subtracting it' },
        { r: { kind: 'ray', op: TOGGLE[FLIP[eff]], v: R(t) }, trap: closedOp(eff) ? 'made the inequality strict' : 'made the inequality non-strict' },
      ];
      return choiceQ(rng, ineq, [R(t)], ans, wrong,
        `$-${a}x ${OPTEX[eff]} ${c - b}$. Dividing by $-${a}$ reverses the inequality: $x ${OPTEX[FLIP[eff]]} ${t}$.`,
        'Dividing (or multiplying) by a negative number reverses the inequality sign.', ['linear', 'negative-coefficient']);
    }
    case 'both-sides': {
      const a = rng.int(1, 4), c = rng.int(a + 1, 6), t = rng.int(-6, 6), b = rng.nonZeroInt(-9, 9);
      const d = b + (a - c) * t; // ax + b op cx + d  ⇔  (a − c)x op d − b  ⇔  x FLIP(op) t
      if (d === 0 || Math.abs(d) > 20) return null;
      const ineq: Ineq = { L: [a, b], R: [c, d], op };
      const ans: Region = { kind: 'ray', op: FLIP[op], v: R(t) };
      const wrong: { r: Region; trap: string }[] = [
        { r: { kind: 'ray', op, v: R(t) }, trap: 'did not flip the inequality when dividing by the negative coefficient' },
        { r: { kind: 'ray', op: FLIP[op], v: R(-t) }, trap: 'sign error in the value' },
        { r: { kind: 'ray', op, v: R(-t) }, trap: 'did not flip, and sign error in the value' },
        { r: { kind: 'ray', op: FLIP[op], v: R(d - b, a + c) }, trap: 'moved the x term across without changing its sign' },
        { r: { kind: 'ray', op: TOGGLE[FLIP[op]], v: R(t) }, trap: closedOp(op) ? 'made the inequality strict' : 'made the inequality non-strict' },
      ];
      return choiceQ(rng, ineq, [R(t)], ans, wrong,
        `Collect the $x$ terms on the side with the larger coefficient: $${d - b} ${OPTEX[op]} ${c - a}x$, so $x ${OPTEX[FLIP[op]]} ${t}$. (Collecting on the left gives $${linear(a - c, 0)} ${OPTEX[op]} ${d - b}$ and dividing by a negative flips the sign — same answer.)`,
        'Collecting x on the side where its coefficient stays positive avoids dividing by a negative; if you do divide by a negative, flip the sign.', ['linear', 'both-sides']);
    }
    case 'monic-quad':
    case 'rearranged': {
      const p = rng.int(-6, 6), q = rng.int(-6, 6);
      if (p === q || (variant === 'rearranged' && (p + q === 0 || p * q === 0))) return null;
      const lo = R(Math.min(p, q)), hi = R(Math.max(p, q));
      const ineq: Ineq = variant === 'monic-quad'
        ? { L: [1, -(p + q), p * q], R: [0], op }
        : { L: [1, 0, p * q], R: [p + q, 0], op };
      const factored = `(${linear(1, -lo[0])})(${linear(1, -hi[0])})`;
      const region = quadRegion(lo, hi, op);
      const prefix = variant === 'rearranged' ? `Bring everything to one side: $${poly([1, -(p + q), p * q])} ${OPTEX[op]} 0$. ` : '';
      return choiceQ(rng, ineq, [lo, hi], region, quadWrong(lo, hi, op), quadSolution(factored, lo, hi, op, region, prefix),
        'Find the roots, then decide inside or outside: a positive quadratic is below zero between its roots and above zero outside them.', ['quadratic', ...(variant === 'rearranged' ? ['rearrange'] : [])]);
    }
    case 'x2-ax': {
      const a = rng.nonZeroInt(-9, 9);
      const lo = R(Math.min(0, a)), hi = R(Math.max(0, a));
      const ineq: Ineq = { L: [1, 0, 0], R: [a, 0], op };
      const region = quadRegion(lo, hi, op);
      const wrong = [
        { r: { kind: 'ray', op, v: R(a) } as Region, trap: 'divided both sides by x, losing the root 0 and ignoring the sign of x' },
        ...quadWrong(lo, hi, op),
      ];
      return choiceQ(rng, ineq, [lo, hi], region, wrong,
        quadSolution(`x(${linear(1, -a)})`, lo, hi, op, region, `Never divide by $x$ (its sign is unknown). Rearrange: $${poly([1, -a, 0])} ${OPTEX[op]} 0$. `),
        'Do not divide by x: move everything to one side and factorise, keeping the root x = 0.', ['quadratic', 'divide-by-x']);
    }
    case 'general': {
      const a = rng.pick([2, 3]), b = rng.nonZeroInt(-7, 7), d = rng.nonZeroInt(-6, 6);
      if (gcd(a, b) !== 1) return null;
      const r1 = R(-b, a), r2 = R(-d);
      if (r1[0] * r2[1] === r2[0] * r1[1]) return null;
      const [lo, hi] = ratLt(r1, r2) ? [r1, r2] : [r2, r1];
      const ineq: Ineq = { L: [a, a * d + b, b * d], R: [0], op };
      if (ineq.L[1] === 0) return null;
      const region = quadRegion(lo, hi, op);
      const inv = R(-a, b), invLo = ratLt(inv, r2) ? inv : r2, invHi = ratLt(inv, r2) ? r2 : inv;
      const wrong = [
        { r: quadRegion(invLo, invHi, op), trap: 'inverted the fractional root: (ax + b) = 0 gives x = −b/a, not −a/b' },
        ...quadWrong(lo, hi, op),
      ];
      return choiceQ(rng, ineq, [lo, hi], region, wrong, quadSolution(`(${linear(a, b)})(${linear(1, d)})`, lo, hi, op, region),
        'With a leading coefficient the fractional root is −b/a; then inside for < 0, outside for > 0.', ['quadratic', 'leading-coefficient']);
    }
    case 'x2-k': {
      const k = rng.int(2, 9);
      const lo = R(-k), hi = R(k);
      const ineq: Ineq = { L: [1, 0, 0], R: [k * k], op };
      const region = quadRegion(lo, hi, op);
      const wrong = [
        { r: { kind: 'ray', op, v: R(k) } as Region, trap: 'square-rooted both sides and forgot the negative root' },
        { r: { kind: 'ray', op: FLIP[op], v: R(-k) } as Region, trap: 'kept only the negative root' },
        ...quadWrong(lo, hi, op),
      ];
      return choiceQ(rng, ineq, [lo, hi], region, wrong,
        quadSolution(`(${linear(1, k)})(${linear(1, -k)})`, lo, hi, op, region, `$x^2 ${OPTEX[op]} ${k * k}$ has the two roots $\\pm ${k}$; `),
        'x² < k² means −k < x < k, not just x < k; x² > k² means x < −k or x > k.', ['quadratic', 'square-root']);
    }
    case 'count': {
      const strict = rng.bool(0.5);
      const cop: Op = strict ? '<' : '<=';
      const fractional = rng.bool(0.4);
      let lo: Rat, hi: Rat, L: number[], factored: string;
      if (fractional) {
        const a = rng.pick([2, 3]), b = rng.nonZeroInt(-7, 7), d = rng.nonZeroInt(-7, 7);
        if (gcd(a, b) !== 1) return null;
        const r1 = R(-b, a), r2 = R(-d);
        [lo, hi] = ratLt(r1, r2) ? [r1, r2] : [r2, r1];
        L = [a, a * d + b, b * d];
        factored = `(${linear(a, b)})(${linear(1, d)})`;
      } else {
        const p = rng.int(-6, 6), q = rng.int(-6, 6);
        if (p === q) return null;
        lo = R(Math.min(p, q)); hi = R(Math.max(p, q));
        L = [1, -(p + q), p * q];
        factored = `(${linear(1, -lo[0])})(${linear(1, -hi[0])})`;
      }
      const loV = lo[0] / lo[1], hiV = hi[0] / hi[1];
      const first = Number.isInteger(loV) && strict ? loV + 1 : Math.ceil(loV);
      const last = Number.isInteger(hiV) && strict ? hiV - 1 : Math.floor(hiV);
      const count = last - first + 1;
      if (count < 2 || count > 14) return null;
      const ineq: Ineq = { L, R: [0], op: cop };
      const gap = hiV - loV;
      const ds = clean([
        { value: E(count + 1), trap: strict ? 'counted the endpoints, which do not satisfy a strict inequality' : 'off by one' },
        { value: E(count - 1), trap: strict ? 'off by one' : 'forgot that the endpoints satisfy ≤' },
        { value: E(Math.round(gap)), trap: 'took the difference of the roots instead of counting' },
        { value: E(count + 2), trap: 'counted the endpoints and off by one' },
        { value: E(count - 2), trap: 'left out both endpoints and off by one' },
        { value: E(Math.abs(first) + Math.abs(last)), trap: 'ignored the negative integers or zero' },
      ]);
      return {
        stem: `How many integers $x$ satisfy $${ineqTex(ineq)}$?`,
        answer: { kind: 'exact', value: E(count) },
        options: buildOptions(rng, E(count), ds),
        solution: `$${factored} ${OPTEX[cop]} 0$ gives $${tex(lo)} ${strict ? '<' : '\\le'} x ${strict ? '<' : '\\le'} ${tex(hi)}$. The integers are $${first}, \\dots, ${last}$: $${count}$ of them.`,
        trap: 'Count the integers in the interval carefully: endpoints count for ≤ but not for <, and remember 0 and the negatives.',
        tags: ['inequality', 'quadratic', 'count-integers'],
        params: { kind: 'exact', variant, ineq, ask: 'count' },
        typedAllowed: true,
      };
    }
    case 'count-sqrt': {
      const k = rng.pick([5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20, 22, 23, 24, 26, 27, 28, 29, 30, 33, 35, 37, 40, 45, 50]);
      const strictOp: Op = rng.bool(0.5) ? '<' : '<=';
      const f = Math.floor(Math.sqrt(k));
      const count = 2 * f + 1;
      const ineq: Ineq = { L: [1, 0, 0], R: [k], op: strictOp };
      const ds = clean([
        { value: E(2 * f), trap: 'forgot x = 0' },
        { value: E(f), trap: 'counted only the positive integers' },
        { value: E(2 * (f + 1) + 1), trap: 'rounded √k up' },
        { value: E(2 * f - 1), trap: 'off by one at each end' },
        { value: E(f + 1), trap: 'counted only the non-negative integers' },
      ]);
      return {
        stem: `How many integers $x$ satisfy $${ineqTex(ineq)}$?`,
        answer: { kind: 'exact', value: E(count) },
        options: buildOptions(rng, E(count), ds),
        solution: `$-\\sqrt{${k}} ${OPTEX[strictOp]} x ${OPTEX[strictOp]} \\sqrt{${k}}$ and $${f} < \\sqrt{${k}} < ${f + 1}$, so $x$ runs from $-${f}$ to $${f}$: $2 \\times ${f} + 1 = ${count}$ integers.`,
        trap: 'x² < k gives −√k < x < √k; count both signs and zero.',
        tags: ['inequality', 'quadratic', 'count-integers', 'square-root'],
        params: { kind: 'exact', variant, ineq, ask: 'count' },
        typedAllowed: true,
      };
    }
    case 'extreme': {
      const fractional = rng.bool(0.5);
      const a = fractional ? rng.pick([2, 3]) : 1;
      const b = fractional ? rng.nonZeroInt(-9, 9) : rng.nonZeroInt(-7, 7);
      const d = rng.nonZeroInt(-7, 7);
      if (gcd(a, b) !== 1) return null;
      const r1 = R(-b, a), r2 = R(-d);
      if (r1[0] * r2[1] === r2[0] * r1[1]) return null;
      const [lo, hi] = ratLt(r1, r2) ? [r1, r2] : [r2, r1];
      const L = [a, a * d + b, b * d];
      if (L[1] === 0) return null;
      const ineq: Ineq = { L, R: [0], op };
      const factored = `(${linear(a, b)})(${linear(1, d)})`;
      const loV = lo[0] / lo[1], hiV = hi[0] / hi[1];
      const strict = !closedOp(op);
      let ask: 'largest' | 'smallest' | 'smallest-positive';
      let answer: number;
      let ds: Distractor[];
      if (lessOp(op)) {
        ask = rng.bool(0.5) ? 'largest' : 'smallest';
        const first = Number.isInteger(loV) && strict ? loV + 1 : Math.ceil(loV);
        const last = Number.isInteger(hiV) && strict ? hiV - 1 : Math.floor(hiV);
        if (last < first) return null;
        answer = ask === 'largest' ? last : first;
        ds = clean([
          { value: E(answer + 1), trap: ask === 'largest' ? 'went past the upper root' : 'off by one' },
          { value: E(answer - 1), trap: ask === 'largest' ? 'off by one' : 'went below the lower root' },
          { value: E(ask === 'largest' ? first : last), trap: 'used the wrong end of the interval' },
          { value: E(Math.round(ask === 'largest' ? hiV : loV)), trap: 'rounded the root instead of taking the integer inside the interval' },
          { value: E(-answer), trap: 'sign error' },
        ]);
      } else {
        ask = 'smallest-positive';
        if (loV > 0.5 || hiV < 0) return null; // positives must come only from the right branch
        answer = Number.isInteger(hiV) && strict ? hiV + 1 : Math.ceil(hiV) === hiV ? hiV : Math.ceil(hiV);
        if (answer < 1) return null;
        ds = clean([
          { value: E(answer + 1), trap: 'off by one' },
          { value: E(answer - 1), trap: strict ? 'the root itself does not satisfy a strict inequality' : 'off by one' },
          { value: E(Math.floor(hiV)), trap: 'rounded the root down' },
          { value: E(Math.max(1, Math.ceil(loV))), trap: 'used the lower root' },
          { value: E(1), trap: 'assumed 1 works without checking' },
        ]);
      }
      if (answer === 0 && ask !== 'smallest-positive') return null;
      const region = quadRegion(lo, hi, op);
      const stem = ask === 'largest' ? `Find the largest integer $x$ satisfying $${ineqTex(ineq)}$.`
        : ask === 'smallest' ? `Find the smallest integer $x$ satisfying $${ineqTex(ineq)}$.`
          : `Find the smallest positive integer $x$ for which $${ineqTex(ineq)}$.`;
      return {
        stem,
        answer: { kind: 'exact', value: E(answer) },
        options: buildOptions(rng, E(answer), ds),
        solution: `$${factored} ${OPTEX[op]} 0$: roots $${tex(lo)}$ and $${tex(hi)}$, so ${render(region)}. The ${ask === 'smallest-positive' ? 'smallest positive integer in that set' : `${ask} integer in that interval`} is $${answer}$.`,
        trap: 'Solve the inequality fully first, then read off the integer: watch strict versus non-strict at a root and round the right way for a fractional root.',
        tags: ['inequality', 'quadratic', 'integer'],
        params: { kind: 'exact', variant, ineq, ask },
        typedAllowed: true,
      };
    }
  }
}

export default defineTemplate({
  id: 'm1.equations.inequalities',
  module: 'M1',
  topic: 'equations',
  title: 'Linear and quadratic inequalities',
  levels: {
    1: '3x − 5 > 7 (solution set as an option)',
    2: '−2x + 3 ≤ 9, or 2x + 7 > 5x − 2 (dividing by a negative)',
    3: 'x² − 5x + 6 < 0: between or outside the roots',
    4: 'x² ≥ 4x, 2x² + x − 6 > 0, x² < 16, x² + 6 < 5x',
    5: 'number of integers satisfying x² − 7x + 6 ≤ 0; largest/smallest integer',
  },
  generate(rng, level: Level) {
    const variant = rng.pick(VARIANTS[level]);
    return retry(rng, () => build(rng, variant));
  },
  verify(q) {
    const p = q.params as { kind: string; ineq: Ineq; crit?: Rat[]; region?: Region; wrong?: Region[]; ask?: string };
    if (q.answer.kind === 'choice') {
      if (!p.crit || !p.region || !p.wrong) return false;
      const pts = samples(p.crit);
      if (!pts.every((x) => holds(p.ineq, x) === member(p.region!, x))) return false;
      if (p.wrong.some((w) => pts.every((x) => holds(p.ineq, x) === member(w, x)))) return false;
      return q.answer.value === render(p.region) && q.options.filter((o) => o.correct).length === 1;
    }
    if (q.answer.kind !== 'exact') return false;
    const got = q.answer.value.toNumber();
    const sat: number[] = [];
    for (let n = -300; n <= 300; n++) if (holds(p.ineq, E(n))) sat.push(n);
    if (p.ask === 'count') {
      // the set must be bounded well inside the brute-force window
      return sat.length === got && sat.length > 0 && Math.abs(sat[0]) < 250 && Math.abs(sat[sat.length - 1]) < 250;
    }
    if (p.ask === 'largest') return sat.length > 0 && sat[sat.length - 1] === got && sat[sat.length - 1] < 250;
    if (p.ask === 'smallest') return sat.length > 0 && sat[0] === got && sat[0] > -250;
    if (p.ask === 'smallest-positive') {
      const pos = sat.filter((n) => n > 0);
      return pos.length > 0 && pos[0] === got;
    }
    return false;
  },
});
