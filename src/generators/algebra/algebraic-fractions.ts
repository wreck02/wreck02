import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildChoiceOptions, buildSetOptions } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { gcd, linear, poly } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Algebraic fractions.
 * Level 1: (3x + 6)/3, 6x²/(2x) (kind 'choice')
 * Level 2: (x² − 9)/(x + 3), (4x² − 9)/(2x + 3), (x² + 5x + 6)/(x + 2)
 * Level 3: (x² − 9)/(x² + 3x) → (x − 3)/x, (x² + 5x + 6)/(x² − 4) → (x + 3)/(x − 2)
 * Level 4: 1/x + 1/(x + 1), 2/(x − 1) − 1/(x + 1) as a single fraction
 * Level 5: x + 1/x = 5/2 → {2, 1/2}, x + 9/x = 6 → {3} (repeated root);
 *          p/(x + a) + q/(x + b) = c with clean roots (kind 'set')
 *
 * Answers are stored as a numerator polynomial over a product of linear factors, rendered
 * canonically. generate() finds the simplified form by cancelling/combining symbolically;
 * verify() evaluates the original expression and the answer numerically at x = 2, 5, 7, 11, 13
 * (skipping poles) and also checks every wrong option differs somewhere. Set answers are
 * substituted back exactly and cross-checked against Vieta's formulas for the cleared quadratic.
 */

type RF = { num: number[]; den: number[][] };
type Term = { num: number[]; den: number[] };

function evalPoly(c: number[], x: number): number {
  return c.reduce((acc, coef) => acc * x + coef, 0);
}
function evalPolyE(c: number[], x: Exact): Exact {
  return c.reduce((acc, coef) => acc.mul(x).add(E(coef)), Exact.ZERO);
}

/** Value of the answer form at x, or null at a pole. */
function evalRF(f: RF, x: number): number | null {
  let d = 1;
  for (const [a, b] of f.den) {
    const v = a * x + b;
    if (v === 0) return null;
    d *= v;
  }
  return evalPoly(f.num, x) / d;
}
function evalTerms(ts: Term[], x: number): number | null {
  let s = 0;
  for (const t of ts) {
    const d = evalPoly(t.den, x);
    if (d === 0) return null;
    s += evalPoly(t.num, x) / d;
  }
  return s;
}

const POINTS = [2, 5, 7, 11, 13, 17];

/** Do two functions (given as evaluators) agree at every point where both are defined (≥ 3 points)? */
function agree(f: (x: number) => number | null, g: (x: number) => number | null): boolean {
  let n = 0;
  for (const x of POINTS) {
    const a = f(x), b = g(x);
    if (a === null || b === null) continue;
    n++;
    if (Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))) return false;
  }
  return n >= 3;
}

/** Polynomial written naturally: "5 - x" rather than "-x + 5", with an overall sign pulled out otherwise. */
function nicePoly(c: number[]): { sign: string; body: string } {
  const cs = c.slice();
  while (cs.length > 1 && cs[0] === 0) cs.shift();
  if (cs.every((v) => v === 0)) return { sign: '', body: '0' };
  if (cs[0] > 0) return { sign: '', body: poly(cs) };
  if (cs.length === 2 && cs[1] > 0) return { sign: '', body: `${cs[1]} - ${-cs[0] === 1 ? '' : -cs[0]}x` };
  return { sign: '-', body: poly(cs.map((v) => -v)) };
}

function factorTex(f: number[], alone: boolean): string {
  if (f[0] === 1 && f[1] === 0) return 'x';
  if (f[0] === 0) return `${f[1]}`;
  return alone ? linear(f[0], f[1]) : `(${linear(f[0], f[1])})`;
}

/** Product of linear factors as LaTeX, canonically ordered: "x(x + 4)", "(x - 4)(x + 3)". */
function denTex(factors: number[][]): string {
  const den = factors.slice().sort((p, q) => (p[0] - q[0]) || (p[1] - q[1]));
  if (den.length === 1) return factorTex(den[0], true);
  const xs = den.filter((d) => d[0] === 1 && d[1] === 0).length;
  const rest = den.filter((d) => !(d[0] === 1 && d[1] === 0)).map((d) => factorTex(d, false)).join('');
  return `${xs === 0 ? '' : xs === 1 ? 'x' : `x^{${xs}}`}${rest}`;
}

function render(f: RF): string {
  const { sign, body } = nicePoly(f.num);
  if (f.den.length === 0) return `$${sign}${body}$`;
  return `$${sign}\\frac{${body}}{${denTex(f.den)}}$`;
}

function monoTex(k: number, e: number): string {
  const coef = k === 1 && e > 0 ? '' : k === -1 && e > 0 ? '-' : `${k}`;
  return `${coef}${e === 0 ? '' : e === 1 ? 'x' : `x^{${e}}`}`;
}
function mono(k: number, e: number): number[] {
  return [k, ...Array(e).fill(0)];
}

type Variant = 'lin-over-const' | 'monomial' | 'dots-over-linear' | 'quad-over-linear' | 'dots-over-quad' | 'quad-over-quad' | 'add-sub' | 'x-plus-k-over-x' | 'two-fractions';

const VARIANTS: Record<Level, Variant[]> = {
  1: ['lin-over-const', 'monomial'],
  2: ['dots-over-linear', 'quad-over-linear'],
  3: ['dots-over-quad', 'quad-over-quad'],
  4: ['add-sub'],
  5: ['x-plus-k-over-x', 'two-fractions'],
};

/**
 * An option printed as a fraction but equal to a constant (0/(x + 3), (x + 5)/(x + 5) = 1,
 * 5/(−1)) is eliminable on sight in a "simplify fully" item: never offer one.
 */
function isConstantFraction(f: RF): boolean {
  if (f.den.length === 0) return false;
  if (f.num.every((c) => c === 0)) return true;
  const vals = POINTS.map((x) => evalRF(f, x)).filter((v): v is number => v !== null);
  if (vals.length < 3) return false;
  return vals.every((v) => Math.abs(v - vals[0]) <= 1e-9 * Math.max(1, Math.abs(v)));
}

function choiceQ(rng: RNG, stem: string, orig: Term[], ans: RF, wrong: { f: RF; trap: string }[], solution: string, trap: string, tags: string[]): Generated | null {
  const origF = (x: number) => evalTerms(orig, x);
  if (!agree(origF, (x) => evalRF(ans, x))) return null;
  const distinct = wrong.filter((w) => !isConstantFraction(w.f) && !agree((x) => evalRF(w.f, x), (x) => evalRF(ans, x)));
  const correct = render(ans);
  let options;
  try { options = buildChoiceOptions(rng, correct, distinct.map((w) => ({ display: render(w.f), trap: w.trap }))); } catch { return null; }
  const kept = distinct.filter((w) => options.some((o) => o.display === render(w.f)));
  return {
    stem,
    answer: { kind: 'choice', value: correct },
    options,
    solution,
    trap,
    tags: ['algebraic-fractions', ...tags],
    params: { kind: 'choice', orig, ans, wrong: kept.map((w) => w.f) },
    typedAllowed: false,
  };
}

function cleanSets<T extends { values: Exact[] }>(ds: T[]): T[] {
  return ds.filter((d) => d.values.length > 0 && d.values.every((v, i) => isCleanExact(v).ok && d.values.findIndex((w) => w.equals(v)) === i));
}

const fr = (n: string, d: string) => `\\frac{${n}}{${d}}`;

function build(rng: RNG, variant: Variant): Generated | null {
  switch (variant) {
    case 'lin-over-const': {
      const d = rng.pick([2, 3, 4, 5]), u = rng.int(1, 4), v = rng.nonZeroInt(-6, 6);
      const m = d * u, n = d * v;
      const stem = `Simplify $${fr(linear(m, n), `${d}`)}$.`;
      return choiceQ(rng, stem, [{ num: [m, n], den: [d] }], { num: [u, v], den: [] }, [
        { f: { num: [u, n], den: [] }, trap: 'divided only the x term by the denominator' },
        { f: { num: [m, v], den: [] }, trap: 'divided only the constant by the denominator' },
        { f: { num: [m - d, n - d], den: [] }, trap: 'subtracted the denominator instead of dividing' },
        { f: { num: [u, -v], den: [] }, trap: 'sign slip on the constant' },
        { f: { num: [u, v], den: [[0, d]] }, trap: 'divided the numerator but kept the denominator as well' },
      ], `Divide every term of the numerator by $${d}$: $${fr(linear(m, n), `${d}`)} = ${fr(`${m}x`, `${d}`)} ${v < 0 ? '-' : '+'} ${fr(`${Math.abs(n)}`, `${d}`)} = ${linear(u, v)}$.`, 'A denominator divides every term of the numerator, not just the first one.', ['common-factor']);
    }
    case 'monomial': {
      const qv = rng.pick([2, 3, 4, 5]), k = rng.int(2, 6), i = rng.pick([2, 3, 3, 4]), j = rng.int(1, i - 1);
      const p = qv * k;
      if (p > 30) return null;
      const stem = `Simplify $${fr(monoTex(p, i), monoTex(qv, j))}$.`;
      return choiceQ(rng, stem, [{ num: mono(p, i), den: mono(qv, j) }], { num: mono(k, i - j), den: [] }, [
        { f: { num: mono(k, i), den: [] }, trap: 'divided the coefficients but forgot to cancel the x' },
        { f: { num: mono(p - qv, i - j), den: [] }, trap: 'subtracted the coefficients instead of dividing' },
        { f: { num: mono(k, i + j), den: [] }, trap: 'added the indices instead of subtracting' },
        { f: { num: mono(k, 0), den: [] }, trap: 'cancelled all the x terms' },
        { f: { num: mono(k, i * j === i - j ? i + 1 : Math.max(1, Math.floor(i / j))), den: [] }, trap: 'divided the indices instead of subtracting' },
      ], `Divide the coefficients and subtract the indices: $${fr(monoTex(p, i), monoTex(qv, j))} = ${k}x^{${i} - ${j}} = ${monoTex(k, i - j)}$.`, 'Divide the numbers and subtract the powers (x^i / x^j = x^(i−j)); do not subtract the numbers or divide the powers.', ['indices']);
    }
    case 'dots-over-linear': {
      // (c²x² − a²)/(cx ± a): c = 1 gives the classic shape, c ≥ 2 widens the pool.
      const c = rng.pick([1, 1, 2, 3, 4, 5]), a = rng.int(1, 9), s = rng.sign();
      if (gcd(c, a) !== 1) return null;
      const num = [c * c, 0, -a * a];
      const stem = `Simplify $${fr(poly(num), linear(c, s * a))}$.`;
      return choiceQ(rng, stem, [{ num, den: [c, s * a] }], { num: [c, -s * a], den: [] }, [
        { f: { num: [c, s * a], den: [] }, trap: `sign error: the factor that survives is ${linear(c, -s * a)}` },
        { f: { num: [c, -s * a * a], den: [] }, trap: 'cancelled x² with x and left the constants: terms cannot be cancelled' },
        { f: { num: [c, 0], den: [] }, trap: 'cancelled term by term' },
        { f: { num: [-c, s * a], den: [] }, trap: 'sign of the whole expression wrong' },
        { f: { num: [c, -s * a], den: [[c, s * a]] }, trap: `factorised the numerator as (${linear(c, -s * a)})² so nothing cancelled` },
        ...(c === 1 ? [] : [{ f: { num: [1, -s * a], den: [] }, trap: 'did not square-root the x² coefficient when factorising' }]),
      ], `Factorise the numerator: $${poly(num)} = (${linear(c, a)})(${linear(c, -a)})$, then cancel the $(${linear(c, s * a)})$: the result is $${linear(c, -s * a)}$.`, 'Only common factors cancel, never individual terms: (x² − 9)/(x + 3) is not x − 9.', ['difference-of-squares']);
    }
    case 'quad-over-linear': {
      const p = rng.nonZeroInt(-6, 6), q = rng.nonZeroInt(-6, 6);
      if (p === q || p === -q) return null;
      const num = [1, p + q, p * q];
      const stem = `Simplify $${fr(poly(num), linear(1, p))}$.`;
      return choiceQ(rng, stem, [{ num, den: [1, p] }], { num: [1, q], den: [] }, [
        { f: { num: [1, p], den: [] }, trap: 'kept the factor that should have cancelled' },
        { f: { num: [1, -q], den: [] }, trap: 'sign error in the surviving factor' },
        { f: { num: [1, p + q], den: [] }, trap: 'cancelled x² with x and copied the x coefficient' },
        { f: { num: [1, p * q], den: [] }, trap: 'cancelled x² with x and copied the constant' },
        { f: { num: [1, q], den: [[1, p]] }, trap: 'factorised but did not cancel' },
      ], `Factorise: $${poly(num)} = (${linear(1, p)})(${linear(1, q)})$; cancel $(${linear(1, p)})$ to leave $${linear(1, q)}$.`, 'Factorise the numerator first; only a whole bracket cancels with the denominator.', ['factorise']);
    }
    case 'dots-over-quad': {
      const a = rng.int(2, 9), s = rng.sign();
      const stem = `Simplify fully $${fr(poly([1, 0, -a * a]), poly([1, s * a, 0]))}$.`;
      return choiceQ(rng, stem, [{ num: [1, 0, -a * a], den: [1, s * a, 0] }], { num: [1, -s * a], den: [[1, 0]] }, [
        { f: { num: [1, s * a], den: [[1, 0]] }, trap: 'sign error: the surviving factor is the other one' },
        { f: { num: [1, -s * a], den: [] }, trap: 'cancelled the x in the denominator as well' },
        { f: { num: [-s * a], den: [[1, 0]] }, trap: 'cancelled the x² terms and simplified what was left' },
        { f: { num: [1, -s * a], den: [[1, s * a]] }, trap: 'did not factorise the denominator: x² + ax = x(x + a)' },
        { f: { num: [1, s * a], den: [[1, -s * a]] }, trap: 'sign errors in both factors' },
      ], `Factorise both: $${fr(`(${linear(1, a)})(${linear(1, -a)})`, `x(${linear(1, s * a)})`)}$; cancel $(${linear(1, s * a)})$ to leave $${fr(linear(1, -s * a), 'x')}$.`, 'Factorise top and bottom completely (x² + ax = x(x + a)); cancel the common bracket only.', ['difference-of-squares', 'factorise']);
    }
    case 'quad-over-quad': {
      const p = rng.nonZeroInt(-5, 5), q = rng.nonZeroInt(-5, 5), r = rng.bool(0.4) ? -p : rng.nonZeroInt(-5, 5);
      if (p === q || p === r || q === r) return null;
      const num = [1, p + q, p * q], den = [1, p + r, p * r];
      const stem = `Simplify fully $${fr(poly(num), poly(den))}$.`;
      return choiceQ(rng, stem, [{ num, den }], { num: [1, q], den: [[1, r]] }, [
        { f: { num: [1, -q], den: [[1, r]] }, trap: 'sign error in the numerator factor' },
        { f: { num: [1, q], den: [[1, -r]] }, trap: 'sign error in the denominator factor' },
        { f: { num: [1, r], den: [[1, q]] }, trap: 'fraction inverted' },
        { f: { num: [1, p], den: [[1, r]] }, trap: 'cancelled the wrong factor of the numerator' },
        { f: { num: [1, q], den: [[1, p]] }, trap: 'cancelled the shared bracket against the wrong bracket of the denominator' },
        ...(p + q !== 0 && p + r !== 0 ? [{
          f: p + r > 0
            ? { num: [p + q, p * q], den: [[p + r, p * r]] }
            : { num: [-(p + q), -p * q], den: [[-(p + r), -p * r]] },
          trap: 'cancelled the x² terms and kept the rest: terms cannot be cancelled',
        }] : []),
        { f: { num: [1, -q], den: [[1, -r]] }, trap: 'both signs wrong' },
      ], `Factorise: $${fr(`(${linear(1, p)})(${linear(1, q)})`, `(${linear(1, p)})(${linear(1, r)})`)}$; cancel $(${linear(1, p)})$ to leave $${fr(linear(1, q), linear(1, r))}$.`, 'Factorise both quadratics and cancel the shared bracket; the x² terms themselves never cancel.', ['factorise']);
    }
    case 'add-sub': {
      const p = rng.pick([1, 1, 2, 3]), qv = rng.pick([1, 1, 2, 3]), s = rng.sign();
      const a = rng.int(-4, 4), b = rng.int(-4, 4);
      if (a === b) return null;
      if (a !== 0 && b !== 0 && rng.bool(0.3)) return null; // keep a fair share of 1/x + …
      const nx = p + s * qv, n0 = p * b + s * qv * a;
      if (nx === 0 && n0 === 0) return null;
      const num = nx === 0 ? [n0] : [nx, n0];
      const ans: RF = { num, den: [[1, a], [1, b]] };
      const t1 = fr(`${p}`, a === 0 ? 'x' : linear(1, a)), t2 = fr(`${qv}`, b === 0 ? 'x' : linear(1, b));
      const stem = `Express $${t1} ${s < 0 ? '-' : '+'} ${t2}$ as a single fraction in its simplest form.`;
      const wrongNum = (x1: number, x0: number) => (x1 === 0 ? [x0] : [x1, x0]);
      return choiceQ(rng, stem, [{ num: [p], den: [1, a] }, { num: [s * qv], den: [1, b] }], ans, [
        { f: { num: wrongNum(p - s * qv, p * b - s * qv * a), den: [[1, a], [1, b]] }, trap: s < 0 ? 'did not apply the minus to the whole second numerator' : 'sign error in the numerator' },
        { f: { num: wrongNum(p + s * qv, p * a + s * qv * b), den: [[1, a], [1, b]] }, trap: 'multiplied each numerator by its own denominator instead of the other one' },
        { f: { num: [p + s * qv], den: [[2, a + b]] }, trap: 'added the numerators and added the denominators' },
        { f: { num: [p + s * qv], den: [[1, a], [1, b]] }, trap: 'found the common denominator but did not multiply the numerators up' },
        { f: { num, den: [[1, a]] }, trap: 'kept only one factor in the denominator' },
        { f: { num: wrongNum(p, p * b + s * qv), den: [[1, a], [1, b]] }, trap: 'multiplied only the first numerator up over the common denominator' },
        { f: { num: wrongNum(p + s * qv, p * b - s * qv * a), den: [[1, a], [1, b]] }, trap: 'sign error in the constant term of the numerator' },
      ], `Common denominator $${denTex([[1, a], [1, b]])}$: numerator $${p}(${b === 0 ? 'x' : linear(1, b)}) ${s < 0 ? '-' : '+'} ${qv}(${a === 0 ? 'x' : linear(1, a)}) = ${poly(num)}$, so the answer is ${render(ans)}.`, 'Multiply each numerator by the other denominator; a minus sign applies to the whole of the second numerator.', ['add', 'single-fraction']);
    }
    case 'x-plus-k-over-x': {
      if (rng.bool(0.3)) {
        // Perfect square: x + t²/x = 2t has the single (repeated) root x = t.
        const t = rng.int(2, 6) * rng.sign();
        const kk = t * t, cc = 2 * t;
        const quadT = poly([1, -cc, kk]);
        let options;
        try {
          options = buildSetOptions(rng, [E(t)], cleanSets([
            { values: [E(t), E(-t)], trap: 'put ± on the root: this quadratic is a perfect square, with one repeated root' },
            { values: [E(-t)], trap: 'sign error in the root' },
            { values: [E(t), E(kk)], trap: 'took the two numbers in the equation as the roots' },
            { values: [E(kk)], trap: 'gave the numerator k instead of the root' },
            { values: [E(cc)], trap: 'gave the right-hand side instead of the root' },
            { values: [E(t), E(cc)], trap: 'added the sum of the roots as a second root' },
          ]));
        } catch { return null; }
        return {
          stem: `Solve $x + ${fr(`${kk}`, 'x')} = ${cc}$.`,
          answer: { kind: 'set', values: [E(t)] },
          options,
          solution: `Multiply through by $x$: $${quadT} = 0$, which is $(${linear(1, -t)})^2 = 0$, so $x = ${t}$ is a repeated root: the only solution.`,
          trap: 'Multiply every term by x to get a quadratic; a perfect square has one repeated root, so do not invent a second value.',
          tags: ['algebraic-fractions', 'solve', 'quadratic'],
          params: { kind: 'set', terms: [{ num: [1, 0], den: [1] }, { num: [kk], den: [1, 0] }], rhs: [cc, 1], quad: [1, -cc, kk] },
          typedAllowed: true,
        };
      }
      const d = rng.pick([2, 3, 4, 5, 6]), m = rng.pick([1, 1, 2, 3]), s1 = rng.sign(), s2 = rng.sign();
      const r1 = E(s1 * d), r2 = frac(s2 * m, d);
      if (r1.equals(r2) || r2.isInteger()) return null;
      const k = r1.mul(r2), c = r1.add(r2); // x + k/x = c  ⇔  x² − cx + k = 0
      if (!k.isInteger() || !isCleanExact(c).ok) return null;
      const kn = k.toInt();
      const stem = `Solve $x ${kn < 0 ? '-' : '+'} ${fr(`${Math.abs(kn)}`, 'x')} = ${c.toLatex()}$.`;
      let options;
      try {
        options = buildSetOptions(rng, [r1, r2], cleanSets([
          { values: [r1, r2.neg()], trap: 'sign error in one root' },
          { values: [r1.neg(), r2], trap: 'sign error in one root' },
          { values: [r1.neg(), r2.neg()], trap: 'read both roots with the wrong sign' },
          // at most one "only one root" option, and not in every question: two of them
          // would make both free eliminations, since a set answer here has two values
          ...(rng.bool(0.6) ? [{ values: [rng.bool(0.5) ? r1 : r2], trap: 'forgot the second root' }] : []),
          { values: [c, c.inv()], trap: 'guessed x = c and x = 1/c' },
          { values: [r1, r2.inv()], trap: 'inverted the fractional root' },
        ]));
      } catch { return null; }
      const cd = Number(c.toRat().d);
      const quad = cd === 1 ? poly([1, -c.toInt(), kn]) : poly([cd, -Number(c.toRat().n), cd * kn]);
      return {
        stem,
        answer: { kind: 'set', values: [r1, r2] },
        options,
        solution: `Multiply through by $${cd === 1 ? 'x' : `${cd}x`}$: $${quad} = 0$, which factorises as $(${linear(1, -s1 * d)})(${linear(d, -s2 * m)}) = 0$, so $x = ${r1.toLatex()}$ or $x = ${r2.toLatex()}$.`,
        trap: 'Multiply every term by x (and the denominator of c) to get a quadratic; the two roots multiply to k and add to c.',
        tags: ['algebraic-fractions', 'solve', 'quadratic'],
        params: { kind: 'set', terms: [{ num: [1, 0], den: [1] }, { num: [kn], den: [1, 0] }], rhs: [Number(c.toRat().n), cd], quad: cd === 1 ? [1, -c.toInt(), kn] : [cd, -Number(c.toRat().n), cd * kn] },
        typedAllowed: true,
      };
    }
    case 'two-fractions': {
      const c = rng.pick([1, 1, 2]), a = rng.int(-4, 4), b = rng.int(-4, 4);
      if (a === b) return null;
      const r1 = rng.int(-6, 6), r2 = rng.int(-6, 6);
      if (r1 === r2 || r1 === -a || r1 === -b || r2 === -a || r2 === -b) return null;
      // p/(x + a) + q/(x + b) = c  ⇔  c x² + (c(a + b) − p − q) x + (cab − pb − qa) = 0 = c(x − r1)(x − r2)
      const S = c * (a + b + r1 + r2), T = c * (a * b - r1 * r2);
      if ((T - a * S) % (b - a) !== 0) return null;
      const p = (T - a * S) / (b - a), qv = S - p;
      if (p <= 0 || qv === 0 || p > 9 || Math.abs(qv) > 9) return null;
      const roots = [E(r1), E(r2)];
      const t1 = fr(`${Math.abs(p)}`, a === 0 ? 'x' : linear(1, a)), t2 = fr(`${Math.abs(qv)}`, b === 0 ? 'x' : linear(1, b));
      const stem = `Solve $${p < 0 ? '-' : ''}${t1} ${qv < 0 ? '-' : '+'} ${t2} = ${c}$.`;
      let options;
      try {
        options = buildSetOptions(rng, roots, cleanSets([
          { values: [E(r1), E(-r2)], trap: 'sign error in one root' },
          { values: [E(-r1), E(r2)], trap: 'sign error in one root' },
          { values: [E(-r1), E(-r2)], trap: 'read both roots with the wrong sign' },
          // at most one "only one root" option, and not in every question (see above)
          ...(rng.bool(0.6) ? [{ values: [E(rng.bool(0.5) ? r1 : r2)], trap: 'forgot the second root' }] : []),
          { values: [E(-a), E(-b)], trap: 'gave the excluded values (where the denominators vanish)' },
          { values: [E(r1 + r2), E(r1 * r2)], trap: 'read off the sum and product of the roots instead of solving' },
        ]));
      } catch { return null; }
      const quad = [c, c * (a + b) - p - qv, c * a * b - p * b - qv * a];
      const fa = a === 0 ? 'x' : `(${linear(1, a)})`, fb = b === 0 ? 'x' : `(${linear(1, b)})`;
      return {
        stem,
        answer: { kind: 'set', values: roots },
        options,
        solution: `Multiply through by $${fa}${fb}$: $${p}${fb} ${qv < 0 ? '-' : '+'} ${Math.abs(qv)}${fa} = ${c === 1 ? '' : c}${fa}${fb}$, giving $${poly(quad)} = 0$, i.e. $${c === 1 ? '' : c}(${linear(1, -r1)})(${linear(1, -r2)}) = 0$: $x = ${r1}$ or $x = ${r2}$.`,
        trap: 'Multiply every term by both denominators (including the right-hand side), collect into a quadratic and factorise; neither root may be an excluded value.',
        tags: ['algebraic-fractions', 'solve', 'quadratic'],
        params: { kind: 'set', terms: [{ num: [p], den: [1, a] }, { num: [qv], den: [1, b] }], rhs: [c, 1], quad },
        typedAllowed: true,
      };
    }
  }
}

export default defineTemplate({
  id: 'm1.algebra.algebraic-fractions',
  module: 'M1',
  topic: 'algebra',
  title: 'Algebraic fractions',
  levels: {
    1: '(3x + 6)/3, 6x²/(2x)',
    2: '(x² − 9)/(x + 3), (4x² − 9)/(2x + 3), (x² + 5x + 6)/(x + 2)',
    3: '(x² − 9)/(x² + 3x) → (x − 3)/x',
    4: '1/x + 1/(x + 1), 2/(x − 1) − 1/(x + 1) as a single fraction',
    5: 'x + 1/x = 5/2 (or x + 9/x = 6, one repeated root); p/(x + a) + q/(x + b) = c',
  },
  generate(rng, level: Level) {
    const variant = rng.pick(VARIANTS[level]);
    return retry(rng, () => build(rng, variant));
  },
  verify(q) {
    const p = q.params as { kind: string; orig?: Term[]; ans?: RF; wrong?: RF[]; terms?: Term[]; rhs?: [number, number]; quad?: number[] };
    if (q.answer.kind === 'choice') {
      if (!p.orig || !p.ans || !p.wrong) return false;
      const orig = (x: number) => evalTerms(p.orig!, x);
      if (!agree(orig, (x) => evalRF(p.ans!, x))) return false;
      if (p.wrong.some((w) => agree(orig, (x) => evalRF(w, x)))) return false;
      return q.answer.value === render(p.ans) && q.options.filter((o) => o.correct).length === 1;
    }
    if (q.answer.kind !== 'set' || !p.terms || !p.rhs || !p.quad) return false;
    const vals = q.answer.values;
    if (vals.length < 1 || vals.length > 2) return false;
    if (vals.length === 2 && vals[0].equals(vals[1])) return false;
    // (1) exact substitution into the original equation
    for (const x of vals) {
      let lhs = Exact.ZERO;
      for (const t of p.terms) {
        const d = evalPolyE(t.den, x);
        if (d.isZero()) return false;
        lhs = lhs.add(evalPolyE(t.num, x).div(d));
      }
      if (!lhs.equals(frac(p.rhs[0], p.rhs[1]))) return false;
    }
    // (2) Vieta on the cleared quadratic: sum = −b/a, product = c/a (a single value is a repeated root)
    const [A, B, C] = p.quad;
    const [u, v] = vals.length === 2 ? vals : [vals[0], vals[0]];
    return u.add(v).equals(frac(-B, A)) && u.mul(v).equals(frac(C, A));
  },
});
