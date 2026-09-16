import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { lcm, linear } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Linear equations.
 * Level 1: ax + b = c, or x/a + b = c
 * Level 2: brackets: 3(x − 2) = 2(x + 4), or a(x + b) ± c(x + d) = e
 * Level 3: fractions: (x + 1)/3 − (x − 2)/4 = 1, or (2x + 1)/3 = (x + 5)/2
 * Level 4: unknown in the denominator: 12/(x + 1) = 3, a/x + b = c, x/(x − 2) = 3, (2x + 1)/(x − 3) = 5
 * Level 5: make x the subject of y = (2x + 1)/(x − 3) (kind 'choice'), or a/(x + b) = c/(x + d)
 *
 * Every equation is generated from a chosen clean solution and solved in generate() by its
 * closed form. params store both sides as sums of (n/d)·num(x)/den(x) terms; verify() substitutes
 * the answer into each side with Exact arithmetic and checks they agree (denominators non-zero).
 * For the subject change, verify() plugs several y values into the claimed formula for x and
 * checks the original relation holds, and that every wrong formula fails somewhere.
 */

/** (n/d) · num(x) / den(x); polynomials highest power first. */
type Term = { k: [number, number]; num: number[]; den: number[] };
type Side = Term[];

const cst = (c: number): Term => ({ k: [1, 1], num: [c], den: [1] });
const lin = (a: number, b: number, mult = 1): Term => ({ k: [mult, 1], num: [a, b], den: [1] });
const over = (num: number[], den: number[], mult = 1): Term => ({ k: [mult, 1], num, den });
const fracLin = (a: number, b: number, d: number): Term => ({ k: [1, d], num: [a, b], den: [1] });

function evalPoly(c: number[], x: Exact): Exact {
  return c.reduce((acc, coef) => acc.mul(x).add(E(coef)), Exact.ZERO);
}

/** Exact value of one side at x, or null if a denominator vanishes. */
function evalSide(side: Side, x: Exact): Exact | null {
  let total = Exact.ZERO;
  for (const t of side) {
    const den = evalPoly(t.den, x);
    if (den.isZero()) return null;
    total = total.add(frac(t.k[0], t.k[1]).mul(evalPoly(t.num, x)).div(den));
  }
  return total;
}

function clean(ds: (Distractor | null)[]): Distractor[] {
  return ds.filter((d): d is Distractor => d !== null && Number.isFinite(d.value.toNumber()) && isCleanExact(d.value).ok);
}

/** a/b as an Exact, or null when b = 0. */
function q(a: number, b: number): Exact | null {
  return b === 0 ? null : frac(a, b);
}

function D(value: Exact | null, trap: string): Distractor | null {
  return value === null ? null : { value, trap };
}

const par = (n: number) => (n < 0 ? `(${n})` : `${n}`);

/** Fraction with a linear numerator, e.g. \frac{x + 1}{3}. */
const fr = (num: string, den: string | number) => `\\frac{${num}}{${den}}`;

type Variant = 'ax+b=c' | 'x/a+b=c' | 'brackets-both' | 'brackets-sum' | 'frac-diff' | 'cross-frac' | 'recip' | 'recip-plus' | 'x-over' | 'linear-over' | 'subject' | 'cross';

const VARIANTS: Record<Level, Variant[]> = {
  1: ['ax+b=c', 'ax+b=c', 'x/a+b=c'],
  2: ['brackets-both', 'brackets-both', 'brackets-sum'],
  3: ['frac-diff', 'frac-diff', 'cross-frac'],
  4: ['recip', 'recip-plus', 'x-over', 'linear-over'],
  5: ['subject', 'subject', 'cross'],
};

function exact(rng: RNG, stem: string, x: Exact, ds: (Distractor | null)[], solution: string, trap: string, tags: string[], L: Side, R: Side, variant: Variant): Generated {
  return {
    stem,
    answer: { kind: 'exact', value: x },
    options: buildOptions(rng, x, clean(ds)),
    solution,
    trap,
    tags: ['linear-equation', ...tags],
    params: { kind: 'exact', variant, L, R },
    typedAllowed: true,
  };
}

// ---- subject change: x = (pn y + qn)/(pd y + qd) --------------------------------------------

type Quad = [number, number, number, number];

function normalise(s: Quad): Quad {
  const [pn, qn, pd, qd] = s;
  const flip = pd < 0 || (pd === 0 && qd < 0);
  return flip ? [-pn, -qn, -pd, -qd] : [pn, qn, pd, qd];
}

function linY(p: number, qq: number): string {
  if (p === 0) return `${qq}`;
  const coef = Math.abs(p) === 1 ? '' : `${Math.abs(p)}`;
  if (qq === 0) return `${p < 0 ? '-' : ''}${coef}y`;
  if (p > 0) return `${coef}y ${qq < 0 ? '-' : '+'} ${Math.abs(qq)}`;
  if (qq > 0) return `${qq} - ${coef}y`;
  return `-${coef}y - ${Math.abs(qq)}`;
}

function renderSubject(s: Quad): string {
  let [pn, qn, pd, qd] = normalise(s);
  let sign = '';
  if ((pn < 0 && qn <= 0) || (pn === 0 && qn < 0)) { sign = '-'; pn = -pn; qn = -qn; }
  return `$x = ${sign}${fr(linY(pn, qn), linY(pd, qd))}$`;
}

function subjectX(s: Quad, y: Exact): Exact | null {
  const den = E(s[2]).mul(y).add(E(s[3]));
  return den.isZero() ? null : E(s[0]).mul(y).add(E(s[1])).div(den);
}

/** Does x = s(y) satisfy y = (ax + b)/(x + c) for the sample y values? */
function subjectFits(s: Quad, a: number, b: number, c: number): boolean {
  let checked = 0;
  for (const yv of [5, 7, 11, 13, -4]) {
    const y = E(yv);
    const x = subjectX(s, y);
    if (x === null) continue;
    const den = x.add(E(c));
    if (den.isZero()) continue;
    checked++;
    if (!E(a).mul(x).add(E(b)).div(den).equals(y)) return false;
  }
  return checked >= 3;
}

function build(rng: RNG, variant: Variant): Generated | null {
  switch (variant) {
    case 'ax+b=c': {
      const a = rng.int(2, 9), x = rng.nonZeroInt(-9, 9), b = rng.nonZeroInt(-15, 15);
      const c = a * x + b;
      return exact(rng, `Solve $${linear(a, b)} = ${c}$.`, E(x), [
        D(q(c + b, a), 'added b instead of subtracting it'),
        D(E((c - b) * a), 'multiplied by a instead of dividing'),
        D(q(c, a)?.sub(E(b)) ?? null, 'divided only the first term by a'),
        D(q(b - c, a), 'sign error: gave −x'),
        D(E(x + (x > 0 ? 1 : -1)), 'arithmetic slip'),
      ], `$${a}x = ${c} ${b < 0 ? '+' : '-'} ${Math.abs(b)} = ${c - b}$, so $x = ${x}$.`, 'Undo the +b first (subtract it from both sides), then divide the whole of both sides by a.', ['one-step'], [lin(a, b)], [cst(c)], variant);
    }
    case 'x/a+b=c': {
      const a = rng.int(2, 6), t = rng.nonZeroInt(-6, 6), b = rng.nonZeroInt(-9, 9);
      const x = a * t, c = t + b;
      return exact(rng, `Solve $${fr('x', a)} ${b < 0 ? '-' : '+'} ${Math.abs(b)} = ${c}$.`, E(x), [
        D(q(c - b, a), 'divided by a instead of multiplying'),
        D(E((c + b) * a), 'added b instead of subtracting it'),
        D(E(c * a - b), 'multiplied by a before subtracting b'),
        D(E(c - b), 'forgot to multiply by a'),
        D(E(-x), 'sign error: gave −x'),
      ], `$${fr('x', a)} = ${c} ${b < 0 ? '+' : '-'} ${Math.abs(b)} = ${t}$, so $x = ${a} \\times ${par(t)} = ${x}$.`, 'Subtract b first, then multiply both sides by a (not divide).', ['one-step'], [fracLin(1, 0, a), cst(b)], [cst(c)], variant);
    }
    case 'brackets-both': {
      const x = rng.nonZeroInt(-8, 8), a = rng.int(2, 6), c = rng.intExcluding(1, 6, [a]), b = rng.nonZeroInt(-6, 6);
      const dNum = a * (x + b) - c * x;
      if (dNum % c !== 0) return null;
      const d = dNum / c;
      if (d === 0 || Math.abs(d) > 12) return null;
      const rhs = c === 1 ? linear(1, d) : `${c}(${linear(1, d)})`;
      return exact(rng, `Solve $${a}(${linear(1, b)}) = ${rhs}$.`, E(x), [
        D(q(c * d - b, a - c), 'forgot to multiply b by a when expanding'),
        D(q(c * d - a * b, a + c), 'moved the x term across without changing its sign'),
        D(E(-x), 'sign error: gave −x'),
        c !== 1 ? D(q(d - a * b, a - c), 'forgot to multiply d by c when expanding') : null,
        D(q(c * d + a * b, a - c), 'sign error moving the constant across'),
        D(E(x + (x > 0 ? 1 : -1)), 'arithmetic slip'),
      ], `Expand: $${linear(a, a * b)} = ${linear(c, c * d)}$. Collect: $${a - c}x = ${c * d - a * b}$, so $x = ${x}$.`, 'Multiply every term inside each bracket, then move the x terms to one side and the constants to the other, changing signs as they cross.', ['brackets'], [lin(1, b, a)], [lin(1, d, c)], variant);
    }
    case 'brackets-sum': {
      const x = rng.nonZeroInt(-8, 8), a = rng.int(2, 5), c = rng.int(2, 5), b = rng.nonZeroInt(-6, 6), d = rng.nonZeroInt(-6, 6);
      const s = rng.sign();
      if (s < 0 && a === c) return null;
      const e = a * (x + b) + s * c * (x + d);
      const stem = `Solve $${a}(${linear(1, b)}) ${s < 0 ? '-' : '+'} ${c}(${linear(1, d)}) = ${e}$.`;
      return exact(rng, stem, E(x), [
        D(q(e - a * b + s * c * d, a + s * c), s < 0 ? 'did not distribute the minus sign over the second bracket' : 'sign error with the constants'),
        D(q(e - b - s * d, a + s * c), 'forgot to multiply the constants inside the brackets'),
        D(E(-x), 'sign error: gave −x'),
        D(q(e - a * b - s * c * d, a * c), 'multiplied the x coefficients instead of adding'),
        D(E(x + (x > 0 ? 1 : -1)), 'arithmetic slip'),
      ], `Expand: $${linear(a, a * b)} ${s < 0 ? '-' : '+'} (${linear(c, c * d)}) = ${e}$, so $${linear(a + s * c, a * b + s * c * d)} = ${e}$ and $x = ${x}$.`, 'A minus in front of a bracket changes the sign of every term inside it.', ['brackets'], [lin(1, b, a), lin(1, d, s * c)], [cst(e)], variant);
    }
    case 'frac-diff': {
      const [m, n] = rng.pickDistinct([2, 3, 4, 5, 6], 2);
      const p = rng.int(-6, 6), qq = rng.int(-6, 6), k = rng.nonZeroInt(-3, 4), s = rng.sign();
      const L = lcm(m, n), A = L / m, B = L / n;
      const den = A + s * B;
      if (den === 0) return null;
      const numr = k * L - A * p - s * B * qq;
      if (numr % den !== 0) return null;
      const x = numr / den;
      if (x === 0 || Math.abs(x) > 20) return null;
      const stem = `Solve $${fr(linear(1, p), m)} ${s < 0 ? '-' : '+'} ${fr(linear(1, qq), n)} = ${k}$.`;
      return exact(rng, stem, E(x), [
        D(q(k - A * p - s * B * qq, den), `forgot to multiply the ${k} by ${L}`),
        s < 0 ? D(q(k * L - A * p + B * qq, den), 'did not distribute the minus over the second numerator') : D(q(k * (m + n) - p - qq, 2), 'added the denominators'),
        D(E(-x), 'sign error: gave −x'),
        D(q(k * L - p - s * qq, den), 'multiplied the x terms but not the constants'),
        D(E(x + (x > 0 ? 1 : -1)), 'arithmetic slip'),
      ], `Multiply through by $${L}$: $${A}(${linear(1, p)}) ${s < 0 ? '-' : '+'} ${B}(${linear(1, qq)}) = ${k * L}$, so $${linear(den, A * p + s * B * qq)} = ${k * L}$ and $x = ${x}$.`, 'Multiply every term, including the right-hand side, by the LCM; a minus before a fraction applies to its whole numerator.', ['fractions'], [fracLin(1, p, m), { k: [s, n], num: [1, qq], den: [1] }], [cst(k)], variant);
    }
    case 'cross-frac': {
      const x = rng.nonZeroInt(-8, 8), a = rng.pick([1, 2, 3]), c = rng.pick([1, 2, 3]), b = rng.int(-6, 6);
      const [m, n] = rng.pickDistinct([2, 3, 4, 5], 2);
      if (n * a === m * c) return null;
      const dNum = n * (a * x + b) - m * c * x;
      if (dNum % m !== 0) return null;
      const d = dNum / m;
      if (Math.abs(d) > 15 || (a === c && b === d)) return null;
      const stem = `Solve $${fr(linear(a, b), m)} = ${fr(linear(c, d), n)}$.`;
      return exact(rng, stem, E(x), [
        D(q(m * d + n * b, n * a - m * c), 'sign error moving the constant across'),
        D(q(m * d - n * b, n * a + m * c), 'sign error collecting the x terms'),
        D(E(-x), 'sign error: gave −x'),
        D(q(n * d - m * b, m * a - n * c), 'cross-multiplied the wrong way round'),
        D(E(x + (x > 0 ? 1 : -1)), 'arithmetic slip'),
      ], `Cross-multiply: $${n}(${linear(a, b)}) = ${m}(${linear(c, d)})$, so $${linear(n * a, n * b)} = ${linear(m * c, m * d)}$ and $x = ${x}$.`, 'Cross-multiply the whole numerators: each numerator is multiplied by the other denominator.', ['fractions'], [fracLin(a, b, m)], [fracLin(c, d, n)], variant);
    }
    case 'recip': {
      const x = rng.nonZeroInt(-9, 9), b = rng.int(-6, 6), c = rng.pick([2, 3, 4, 5, 6, -2, -3]);
      if (x + b === 0) return null;
      const a = c * (x + b);
      if (Math.abs(a) > 48) return null;
      return exact(rng, `Solve $${fr(`${a}`, linear(1, b))} = ${c}$.`, E(x), [
        D(q(a, c)?.add(E(b)) ?? null, 'sign error: added b instead of subtracting it'),
        D(E(a * c - b), 'multiplied a by c instead of dividing'),
        D(q(a - b, c), 'subtracted b before dividing'),
        D(E(-x), 'sign error: gave −x'),
        D(q(c, a)?.sub(E(b)) ?? null, 'inverted the fraction'),
      ], `Multiply both sides by $(${linear(1, b)})$: $${a} = ${c}(${linear(1, b)})$, so $${linear(1, b)} = ${a / c}$ and $x = ${x}$.`, 'Multiply both sides by the denominator, then solve the linear equation (x + b = a/c, so subtract b).', ['denominator'], [over([a], [1, b])], [cst(c)], variant);
    }
    case 'recip-plus': {
      const x = rng.nonZeroInt(-8, 8), b = rng.nonZeroInt(-6, 6), c = rng.intExcluding(-8, 10, [b]);
      const a = x * (c - b);
      if (Math.abs(a) > 40) return null;
      return exact(rng, `Solve $${fr(`${a}`, 'x')} ${b < 0 ? '-' : '+'} ${Math.abs(b)} = ${c}$.`, E(x), [
        D(q(a, c + b), 'sign error: added b instead of subtracting it'),
        D(q(c - b, a), 'inverted: gave (c − b)/a'),
        D(E(a * (c - b)), 'multiplied instead of dividing'),
        D(q(a, c)?.sub(E(b)) ?? null, 'divided only a by c'),
        D(E(-x), 'sign error: gave −x'),
      ], `$${fr(`${a}`, 'x')} = ${c} ${b < 0 ? '+' : '-'} ${Math.abs(b)} = ${c - b}$, so $x = ${fr(`${a}`, `${c - b}`)} = ${x}$.`, 'Isolate a/x first, then x = a divided by that value (not the other way round).', ['denominator'], [over([a], [1, 0]), cst(b)], [cst(c)], variant);
    }
    case 'x-over': {
      const c = rng.pick([2, 3, 4, 5, -1, -2]), t = rng.nonZeroInt(-3, 3);
      const x = c * t, b = t * (1 - c);
      if (b === 0 || Math.abs(b) > 12) return null;
      return exact(rng, `Solve $${fr('x', linear(1, b))} = ${c}$.`, E(x), [
        D(q(c * b, c + 1), 'sign error when collecting the x terms'),
        D(E(c * b), 'forgot to collect the x terms: solved x = cx + cb as x = cb'),
        D(E(-x), 'sign error: gave −x'),
        D(q(b, 1 - c), 'forgot to multiply b by c'),
        D(E(x + (x > 0 ? 1 : -1)), 'arithmetic slip'),
      ], `$x = ${c}(${linear(1, b)}) = ${linear(c, c * b)}$, so $${linear(1 - c, 0)} = ${c * b}$ and $x = ${x}$.`, 'After multiplying up, x appears on both sides: collect the x terms before dividing.', ['denominator'], [over([1, 0], [1, b])], [cst(c)], variant);
    }
    case 'linear-over': {
      const x = rng.nonZeroInt(-8, 8), a = rng.pick([2, 3]), c = rng.intExcluding(1, 6, [a]), d = rng.int(-5, 5);
      if (x + d === 0) return null;
      const b = c * (x + d) - a * x;
      if (b === 0 || Math.abs(b) > 20) return null;
      return exact(rng, `Solve $${fr(linear(a, b), linear(1, d))} = ${c}$.`, E(x), [
        D(q(c * d + b, a - c), 'sign error moving the constant across'),
        D(q(c * d - b, a + c), 'sign error collecting the x terms'),
        D(E(-x), 'sign error: gave −x'),
        D(q(c * d - b, a), 'forgot the cx term from the right-hand side'),
        D(E(x + (x > 0 ? 1 : -1)), 'arithmetic slip'),
      ], `$${linear(a, b)} = ${c}(${linear(1, d)}) = ${linear(c, c * d)}$, so $${linear(a - c, 0)} = ${c * d - b}$ and $x = ${x}$.`, 'Multiply by the denominator and expand the right-hand side fully before collecting x.', ['denominator'], [over([a, b], [1, d])], [cst(c)], variant);
    }
    case 'cross': {
      const [a, c] = rng.pickDistinct([1, 2, 3, 4, 5, 6], 2);
      const x = rng.nonZeroInt(-8, 8), b = rng.int(-6, 6);
      if (x + b === 0) return null;
      const dNum = c * (x + b) - a * x;
      if (dNum % a !== 0) return null;
      const d = dNum / a;
      if (x + d === 0 || d === b || Math.abs(d) > 12) return null;
      return exact(rng, `Solve $${fr(`${a}`, linear(1, b))} = ${fr(`${c}`, linear(1, d))}$.`, E(x), [
        D(q(c * b + a * d, a - c), 'sign error moving the constant across'),
        D(q(c * b - a * d, a + c), 'sign error collecting the x terms'),
        D(E(-x), 'sign error: gave −x'),
        D(q(c * d - a * b, a - c), 'cross-multiplied the wrong way round'),
        D(E(x + (x > 0 ? 1 : -1)), 'arithmetic slip'),
      ], `Cross-multiply: $${a}(${linear(1, d)}) = ${c}(${linear(1, b)})$, so $${linear(a, a * d)} = ${linear(c, c * b)}$, $${linear(a - c, 0)} = ${c * b - a * d}$ and $x = ${x}$.`, 'Cross-multiply: a goes with (x + d) and c with (x + b), then collect the x terms.', ['denominator', 'cross-multiply'], [over([a], [1, b])], [over([c], [1, d])], variant);
    }
    case 'subject': {
      const a = rng.pick([1, 2, 2, 3, 4, 5]), b = rng.nonZeroInt(-5, 5), c = rng.nonZeroInt(-5, 5);
      if (b === a * c) return null;
      // y(x + c) = ax + b  →  x(y − a) = b − cy  →  x = (b − cy)/(y − a)
      const correct: Quad = [-c, b, 1, -a];
      const wrongs: { s: Quad; trap: string }[] = [
        { s: [c, b, 1, -a], trap: 'moved cy across without changing its sign' },
        { s: [-c, b, 1, a], trap: 'collected x(y + a) instead of x(y − a)' },
        { s: [c, -b, 1, -a], trap: 'divided by (a − y) but wrote the numerator for (y − a): the whole sign is wrong' },
        { s: [-c, -b, 1, -a], trap: 'sign error on the constant b' },
        { s: [c, b, 1, a], trap: 'both signs wrong when rearranging' },
        ...(Math.abs(c) !== 1 ? [{ s: [-Math.sign(c), b, 1, -a] as Quad, trap: 'forgot to multiply y by c when expanding y(x + c)' }] : []),
      ];
      const shown = wrongs.filter((w) => !subjectFits(w.s, a, b, c) && renderSubject(w.s) !== renderSubject(correct));
      let options;
      try { options = buildChoiceOptions(rng, renderSubject(correct), shown.map((w) => ({ display: renderSubject(w.s), trap: w.trap }))); } catch { return null; }
      const kept = shown.filter((w) => options.some((o) => o.display === renderSubject(w.s)));
      const expr = fr(linear(a, b), linear(1, c));
      return {
        stem: rng.bool(0.5) ? `Given that $y = ${expr}$, express $x$ in terms of $y$.` : `Make $x$ the subject of $y = ${expr}$.`,
        answer: { kind: 'choice', value: renderSubject(correct) },
        options,
        solution: `Multiply up: $y(${linear(1, c)}) = ${linear(a, b)}$, so $xy ${c < 0 ? '-' : '+'} ${Math.abs(c) === 1 ? '' : Math.abs(c)}y = ${linear(a, b)}$. Collect the $x$ terms: $x(y - ${a}) = ${linY(-c, b)}$, hence ${renderSubject(correct)}.`,
        trap: 'Every x term must be moved to one side and factorised out: x(y − a) = b − cy, then divide by the whole bracket.',
        tags: ['linear-equation', 'subject', 'rearrange'],
        params: { kind: 'choice', variant, a, b, c, ans: correct, wrong: kept.map((w) => w.s) },
        typedAllowed: false,
      };
    }
  }
}

export default defineTemplate({
  id: 'm1.equations.linear',
  module: 'M1',
  topic: 'equations',
  title: 'Linear equations',
  levels: {
    1: 'ax + b = c, x/a + b = c',
    2: '3(x − 2) = 2(x + 4), brackets on both sides or summed',
    3: '(x + 1)/3 − (x − 2)/4 = 1, or a fraction equal to a fraction',
    4: 'unknown in the denominator: 12/(x + 1) = 3, x/(x − 2) = 3',
    5: 'make x the subject of y = (2x + 1)/(x − 3); a/(x + b) = c/(x + d)',
  },
  generate(rng, level: Level) {
    const variant = rng.pick(VARIANTS[level]);
    return retry(rng, () => build(rng, variant));
  },
  verify(q) {
    const p = q.params as { kind: string; L?: Side; R?: Side; a?: number; b?: number; c?: number; ans?: Quad; wrong?: Quad[] };
    if (q.answer.kind === 'choice') {
      if (!p.ans || !p.wrong || p.a === undefined || p.b === undefined || p.c === undefined) return false;
      if (!subjectFits(p.ans, p.a, p.b, p.c)) return false;
      if (p.wrong.some((w) => subjectFits(w, p.a!, p.b!, p.c!))) return false;
      return q.answer.value === renderSubject(p.ans) && q.options.filter((o) => o.correct).length === 1;
    }
    if (q.answer.kind !== 'exact' || !p.L || !p.R) return false;
    const x = q.answer.value;
    const lhs = evalSide(p.L, x), rhs = evalSide(p.R, x);
    if (lhs === null || rhs === null) return false;
    // The equation must be linear (no repeated/other solution hidden): check it fails one step away.
    const other = evalSide(p.L, x.add(E(1))), otherR = evalSide(p.R, x.add(E(1)));
    if (other !== null && otherR !== null && other.equals(otherR)) return false;
    return lhs.equals(rhs);
  },
});
