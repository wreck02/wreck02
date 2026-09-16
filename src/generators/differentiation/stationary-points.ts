import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildOptions, buildSetOptions, buildChoiceOptions, type Distractor, type Option } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { poly, signed, isPerfectSquare } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Stationary points and their nature.
 * Level 1: x-coordinate of the stationary point of a quadratic
 * Level 2: x-coordinates of both stationary points of a cubic whose f' has integer roots (set)
 * Level 3: nature of the point at a given x: maximum / minimum / inflection / not stationary (choice)
 * Level 4: the minimum (or maximum) value of a quadratic, or the y-coordinate of a cubic's local minimum
 * Level 5: k for which ax³ + bx² + kx + d has exactly one stationary point; y-coordinate of a cubic's local maximum
 */

const FR = { format: 'fraction' as const };

type Cand = { value: Exact | null; trap: string };

function cleanOnly(ds: Cand[]): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } => d.value !== null && Number.isFinite(d.value.toNumber()) && isCleanExact(d.value).ok);
}

/**
 * No option may be identifiable by its shape alone: being the only value on the page with its sign,
 * or the only fraction among integers, marks an option out whether it is the answer or not. Try
 * replacing one non-headline distractor with a spare candidate and keep the arrangement in which
 * the fewest options stand alone in their (sign, integer or fraction) group.
 */
function balance(answer: Exact, out: Distractor[], pool: Distractor[]): Distractor[] {
  // Group the options by (sign, integer or not). A group with a single member is a tell: that
  // option is either the answer, pointed at by its shape, or a distractor struck out for free.
  const tells = (ds: Distractor[]): number => {
    const vals = [answer, ...ds.map((d) => d.value)];
    const counts = new Map<string, number>();
    for (const v of vals) {
      const k = `${v.sign() < 0 ? '-' : '+'}${v.isInteger() ? 'i' : 'f'}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    let n = 0;
    for (const c of counts.values()) if (c === 1) n++;
    return n;
  };
  let best = out;
  let bestScore = tells(out);
  if (bestScore === 0) return out;
  for (let i = 0; i < out.length; i++) {
    if (out[i].must) continue;
    for (const c of pool) {
      if (answer.equals(c.value) || out.some((d) => d.value.equals(c.value))) continue;
      const trial = out.slice();
      trial[i] = c;
      const score = tells(trial);
      if (score < bestScore) { best = trial; bestScore = score; }
      if (bestScore === 0) return best;
    }
  }
  return best;
}

/**
 * Every distinct `must` candidate is used before any `extra` one, so the headline traps are never
 * shuffled out; the remaining slots are filled from either side of the answer towards a randomly
 * chosen number of options above it, so the answer lands at every position in the sorted list.
 */
function ranked(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], count = 4): Distractor[] {
  const seen: Exact[] = [answer];
  const out: Distractor[] = [];
  const take = (d: Distractor) => {
    if (out.length >= count || seen.some((s) => s.equals(d.value))) return;
    seen.push(d.value);
    out.push(d);
  };
  must.forEach((d) => take({ ...d, must: true }));
  const pool = rng.shuffle(extra);
  const cls = (v: Exact) => `${v.sign() < 0 ? '-' : '+'}${v.isInteger() ? 'i' : 'f'}`;
  // Prefer a distractor shaped like the answer (same sign, same integer-or-fraction form) until at
  // least one is on the page, so the answer never stands alone in its group.
  const grab = (s: -1 | 1) => {
    const cands = pool.filter((d) => d.value.cmp(answer) === s && !seen.some((x) => x.equals(d.value)));
    const alone = seen.filter((v) => cls(v) === cls(answer)).length < 2;
    return (alone ? cands.find((d) => cls(d.value) === cls(answer)) : undefined) ?? cands[0];
  };
  const targetAbove = rng.int(0, count);
  while (out.length < count) {
    const above = out.filter((d) => d.value.cmp(answer) > 0).length;
    const wanted: -1 | 1 = above < targetAbove ? 1 : -1;
    const d = grab(wanted) ?? grab(wanted === 1 ? -1 : 1);
    if (!d) break;
    take(d);
  }
  return balance(answer, out, pool);
}

/** Four named mistakes or nothing: this template never pads. */
function options(rng: RNG, answer: Exact, must: Cand[], extra: Cand[]): Option[] | null {
  const ds = ranked(rng, answer, cleanOnly(must), cleanOnly(extra));
  if (ds.length < 4) return null;
  return buildOptions(rng, answer, ds, FR);
}

type SetCand = { values: Exact[]; trap: string; must?: boolean };

/**
 * Set options with no free eliminations: every offered set lists the same number of x-coordinates
 * as the answer (a shorter list is struck out without any maths) and holds distinct clean values,
 * so "x = -1 or x = -1" can never be printed.
 */
function setOptions(rng: RNG, answer: Exact[], cands: SetCand[], variable: string): Option[] | null {
  const same = (a: Exact[], b: Exact[]) => a.length === b.length && a.every((x) => b.some((y) => y.equals(x)));
  const ok = (vs: Exact[]) => vs.length === answer.length
    && vs.every((v) => Number.isFinite(v.toNumber()) && isCleanExact(v).ok)
    && new Set(vs.map((v) => v.toNumber())).size === vs.length;
  const pool = cands.filter((c) => ok(c.values) && !same(c.values, answer));
  const chosen: SetCand[] = [];
  for (const c of [...pool.filter((x) => x.must), ...rng.shuffle(pool.filter((x) => !x.must))]) {
    if (chosen.length >= 4) break;
    if (chosen.some((x) => same(x.values, c.values))) continue;
    chosen.push(c);
  }
  if (chosen.length < 4) return null;
  return buildSetOptions(rng, answer, chosen, { variable });
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

// ----------------------------------------------------------------------------- polynomials (coefficients highest power first)

function evalPoly(coefs: number[], x: number): number {
  let s = 0;
  for (const c of coefs) s = s * x + c;
  return s;
}

function dCoefs(coefs: number[]): number[] {
  const n = coefs.length - 1;
  return coefs.slice(0, n).map((c, i) => c * (n - i));
}

/** Cubic a x³ + b x² + c x + d whose derivative is 3a(x − r1)(x − r2); null when b would not be an integer. */
function cubicFromCritical(a: number, r1: number, r2: number, d: number): number[] | null {
  const sum = r1 + r2;
  if ((3 * a * sum) % 2 !== 0) return null;
  return [a, -(3 * a * sum) / 2, 3 * a * r1 * r2, d];
}

function smallEnough(coefs: number[], limits: number[]): boolean {
  return coefs.every((c, i) => Math.abs(c) <= limits[i]);
}

const ONE_HALF = frac(1, 2).toRat();
const half = (x: Exact) => x.mulRat(ONE_HALF);

/** "3(x - 1)(x + 2)" style factorised derivative for the solution text. */
function factorisedDeriv(a: number, r1: number, r2: number): string {
  const lead = 3 * a === 1 ? '' : 3 * a === -1 ? '-' : `${3 * a}`;
  const fac = (r: number) => (r === 0 ? 'x' : `(${poly([1, -r])})`);
  return `${lead}${fac(r1)}${fac(r2)}`;
}

// ----------------------------------------------------------------------------- level 1: vertex x-coordinate

function vertexXQ(rng: RNG): Generated | null {
  const a = rng.pick([1, 1, 2, 3, -1, -2]);
  const x0 = rng.bool(0.3) ? rng.pick([-5, -3, -1, 1, 3, 5, 7]) / 2 : rng.nonZeroInt(-5, 5);
  const b = -2 * a * x0;
  const c = rng.int(-9, 9);
  const coefs = [a, b, c];
  const answer = E(x0);
  const y0 = evalPoly(coefs, x0);
  const stem = rng.bool(0.5)
    ? `Find the $x$-coordinate of the stationary point of the curve $y = ${poly(coefs)}$.`
    : `The curve $y = ${poly(coefs)}$ has a stationary point at $x = p$. Find the value of $p$.`;
  const opts = options(rng, answer, [
    { value: E(-x0), trap: 'sign slip: x = −b/(2a), not b/(2a)' },
    { value: E(2 * x0), trap: 'forgot the 2 in −b/(2a)' },
  ], [
    { value: E(y0), trap: 'gave the y-coordinate of the stationary point' },
    { value: E(c), trap: 'read off the constant term' },
    { value: E(b), trap: 'read off the coefficient of x' },
    { value: half(E(x0)), trap: 'halved twice' },
    { value: E(-b), trap: 'read off −b without dividing by 2a' },
    { value: E(a), trap: 'read off the coefficient of x²' },
    { value: half(E(-x0)), trap: 'halved twice and lost the sign' },
  ]);
  if (!opts) return null;
  return {
    stem,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: opts,
    solution: `$\\frac{dy}{dx} = ${poly([2 * a, b])} = 0$ when $x = ${answer.toLatex(FR)}$.`,
    trap: 'Set dy/dx = 0: 2ax + b = 0 gives x = −b/(2a) (mind the sign and the 2).',
    tags: ['differentiation', 'stationary-point', 'quadratic'],
    params: { variant: 'vertex-x', coefs },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 2: both stationary points of a cubic

function criticalSetQ(rng: RNG): Generated | null {
  const a = rng.pick([1, 1, 1, 2, -1]);
  const r1 = rng.int(-4, 5), r2 = rng.int(-4, 5);
  if (r1 === r2) return null;
  const d = rng.int(-6, 6);
  const coefs = cubicFromCritical(a, r1, r2, d);
  if (!coefs || !smallEnough(coefs, [2, 15, 60, 9])) return null;
  const values = [E(Math.min(r1, r2)), E(Math.max(r1, r2))];
  const b = coefs[1], c = coefs[2];
  // "forgot the 3 when differentiating x³": roots of a x² + 2b x + c = 0, when rational
  const disc = 4 * b * b - 4 * a * c;
  const forgot3 = disc >= 0 && isPerfectSquare(disc) ? [frac(-2 * b - Math.sqrt(disc), 2 * a), frac(-2 * b + Math.sqrt(disc), 2 * a)] : null;
  const y1 = evalPoly(coefs, r1), y2 = evalPoly(coefs, r2);
  const mid = half(E(r1 + r2));
  // setOptions drops any set with repeated members, so "one root with the wrong sign" is not
  // offered when r1 = -r2 (it would print "x = -1 or x = -1"), and every option lists two roots:
  // a single value against a plural ask is eliminable without any maths.
  const distractors: SetCand[] = [
    { values: [E(-r1), E(-r2)], trap: 'sign slip when reading the roots off the factors', must: true },
    { values: [E(r1), E(-r2)], trap: 'one root with the wrong sign' },
    { values: [mid.sub(E(1)), mid.add(E(1))], trap: "solved f''(x) = 0 (the point of inflection) instead of f'(x) = 0, then stepped either side of it" },
    { values: [E(r1 + r2), E(r1 * r2)], trap: 'read off the sum and the product of the roots instead of solving' },
    { values: [E(r1 + 1), E(r2 + 1)], trap: 'arithmetic slip when factorising the quadratic' },
    { values: [E(2 * r1), E(2 * r2)], trap: 'doubled both roots' },
    ...(forgot3 ? [{ values: forgot3, trap: 'forgot the 3 when differentiating x³' }] : []),
    ...(Math.abs(y1) <= 100 && Math.abs(y2) <= 100 ? [{ values: [E(y1), E(y2)], trap: 'gave the y-coordinates' }] : []),
  ];
  const opts = setOptions(rng, values, distractors, 'x');
  if (!opts) return null;
  return {
    stem: `Find the $x$-coordinates of the stationary points of the curve $y = ${poly(coefs)}$.`,
    answer: { kind: 'set', values, variable: 'x' },
    options: opts,
    solution: `$\\frac{dy}{dx} = ${poly(dCoefs(coefs))} = ${factorisedDeriv(a, r1, r2)}$, which is zero when $x = ${Math.min(r1, r2)}$ or $x = ${Math.max(r1, r2)}$.`,
    trap: 'Differentiate (x³ → 3x²), take out the common factor and factorise the quadratic; each bracket gives a root with the opposite sign to the one written.',
    tags: ['differentiation', 'stationary-point', 'cubic'],
    params: { variant: 'critical-set', coefs },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 3: nature (choice)

/**
 * The five descriptions are mutually exclusive and every one of them is the right answer for some
 * curve: "cannot be determined" used to fill the fifth slot and was never correct, which made the
 * level a four-way choice. Splitting "not a stationary point" by the sign of f′ fixes that and
 * makes the candidate read f′ rather than only test whether it vanishes.
 */
const LABELS = {
  max: 'a local maximum',
  min: 'a local minimum',
  infl: 'a stationary point of inflection',
  inc: 'not a stationary point; the gradient there is positive',
  dec: 'not a stationary point; the gradient there is negative',
} as const;
type Nature = keyof typeof LABELS;

/** A distinct line for every wrong label, so no two options on the review screen share a trap. */
function trapFor(wrong: Nature, correct: Nature): string {
  const stationary = correct === 'min' || correct === 'max' || correct === 'infl';
  switch (wrong) {
    case 'max': return stationary
      ? 'sign of f″ read the wrong way round: f″(k) < 0 gives a maximum, f″(k) > 0 a minimum'
      : 'f′(k) ≠ 0 here, so there is no turning point to call a maximum: check f′ before classifying';
    case 'min': return stationary
      ? 'sign of f″ read the wrong way round: f″(k) > 0 gives a minimum, f″(k) < 0 a maximum'
      : 'f′(k) ≠ 0 here, so there is no turning point to call a minimum: check f′ before classifying';
    case 'infl': return stationary
      ? 'f″(k) ≠ 0, so this is a turning point, not a point of inflection'
      : 'a stationary point of inflection still needs f′(k) = 0, and here f′(k) ≠ 0';
    case 'inc': return correct === 'dec'
      ? 'sign slip: f′(k) is negative, so the curve is decreasing there'
      : 'f′(k) = 0 here, so the curve is stationary, not increasing: substitute into f′, not into f';
    default: return correct === 'inc'
      ? 'sign slip: f′(k) is positive, so the curve is increasing there'
      : 'f′(k) = 0 here, so the curve is stationary, not decreasing: substitute into f′, not into f';
  }
}

function natureQ(rng: RNG): Generated | null {
  const kind = rng.weighted(['turning', 'inflection', 'not', 'quadratic'], [5, 2, 3.5, 1.5]);
  let coefs: number[];
  let k: number;
  if (kind === 'quadratic') {
    const a = rng.pick([1, 2, 3, -1, -2]);
    const x0 = rng.nonZeroInt(-4, 4);
    coefs = [a, -2 * a * x0, rng.int(-8, 8)];
    k = x0;
  } else {
    const a = rng.pick([1, 1, 2, -1, -2]);
    if (kind === 'inflection') {
      const r = rng.nonZeroInt(-3, 3);
      coefs = [a, -3 * a * r, 3 * a * r * r, rng.int(-6, 6)];
      k = r;
    } else {
      const r1 = rng.int(-4, 4), r2 = rng.int(-4, 4);
      if (r1 === r2) return null;
      const c = cubicFromCritical(a, r1, r2, rng.int(-6, 6));
      if (!c) return null;
      coefs = c;
      if (kind === 'turning') {
        k = rng.pick([r1, r2]);
      } else {
        const cands = [r1 - 1, r1 + 1, r2 - 1, r2 + 1, (r1 + r2) / 2].filter((x) => Number.isInteger(x) && x !== r1 && x !== r2 && Math.abs(x) <= 5);
        if (cands.length === 0) return null;
        k = rng.pick(cands);
      }
    }
  }
  if (!smallEnough(coefs, [2, 15, 60, 9])) return null;
  const d1 = dCoefs(coefs), d2 = dCoefs(d1);
  const fp = evalPoly(d1, k), fpp = evalPoly(d2, k);
  // Read the description off the derivatives rather than off the branch that built the curve.
  const correct: Nature = fp !== 0 ? (fp > 0 ? 'inc' : 'dec') : fpp > 0 ? 'min' : fpp < 0 ? 'max' : 'infl';
  const wrong = (Object.keys(LABELS) as Nature[]).filter((n) => n !== correct).map((n) => ({ display: LABELS[n], trap: trapFor(n, correct) }));
  const solution = fp !== 0
    ? `$\\frac{dy}{dx} = ${poly(d1)}$, which at $x = ${k}$ equals $${fp}$, not $0$: the point is not stationary, and the gradient there is ${fp > 0 ? 'positive' : 'negative'}.`
    : `$\\frac{dy}{dx} = ${poly(d1)} = 0$ at $x = ${k}$. $\\frac{d^2y}{dx^2} = ${poly(d2)}$, which at $x = ${k}$ is $${fpp}$` +
      (correct === 'infl'
        ? `; since $\\frac{dy}{dx} = ${3 * coefs[0] === 1 ? '' : 3 * coefs[0] === -1 ? '-' : 3 * coefs[0]}(${poly([1, -k])})^{2}$ does not change sign, it is a stationary point of inflection.`
        : ` ${fpp > 0 ? '> 0' : '< 0'}, so it is ${LABELS[correct]}.`);
  return {
    stem: `Which of the following correctly describes the point on the curve $y = ${poly(coefs)}$ where $x = ${k}$?`,
    answer: { kind: 'choice', value: LABELS[correct] },
    options: buildChoiceOptions(rng, LABELS[correct], wrong),
    solution,
    trap: 'Check f′(k) = 0 first; then f″ > 0 is a minimum, f″ < 0 a maximum, and f″ = 0 needs the sign of f′ either side.',
    tags: ['differentiation', 'nature', 'second-derivative'],
    params: { variant: 'nature', coefs, k },
    typedAllowed: false,
  };
}

// ----------------------------------------------------------------------------- level 4: extreme values

function quadraticValueQ(rng: RNG): Generated | null {
  const a = rng.pick([1, 1, 2, 3, -1, -2]);
  const x0 = rng.nonZeroInt(-5, 5);
  const y0 = rng.int(-12, 12);
  const c = y0 + a * x0 * x0;
  const b = -2 * a * x0;
  const coefs = [a, b, c];
  if (Math.abs(c) > 60) return null;
  const ask = a > 0 ? 'minimum' : 'maximum';
  const answer = E(y0);
  const stem = rng.bool(0.5)
    ? `Find the ${ask} value of $${poly(coefs)}$.`
    : `Given that $f(x) = ${poly(coefs)}$, find the ${ask} value of $f(x)$.`;
  const opts = options(rng, answer, [
    { value: E(x0), trap: `gave the x-coordinate of the ${ask} instead of its value` },
    { value: E(y0 + 2 * a * x0 * x0), trap: 'sign slip completing the square: c + b²/(4a) instead of c − b²/(4a)' },
  ], [
    { value: E(c), trap: 'gave f(0)' },
    { value: E(-y0), trap: 'sign of the value flipped' },
    { value: E(y0 + 4 * a * x0 * x0), trap: 'substituted x = +b/(2a) (wrong sign) into f' },
    { value: E(-a * x0 * x0), trap: 'forgot to add the constant term' },
    { value: E(-x0), trap: `gave −b/(2a) with the wrong sign instead of the ${ask} value` },
    { value: E(evalPoly(coefs, x0 + 1)), trap: `substituted x = ${x0 + 1} instead of the stationary value x = ${x0}` },
    { value: E(b), trap: 'read off the coefficient of x' },
    { value: E(y0 - a * x0 * x0), trap: 'subtracted b²/(4a) a second time when completing the square' },
    { value: E(evalPoly(coefs, x0 - 1)), trap: `substituted x = ${x0 - 1} instead of the stationary value x = ${x0}` },
  ]);
  if (!opts) return null;
  return {
    stem,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: opts,
    solution: `$f'(x) = ${poly([2 * a, b])} = 0$ at $x = ${x0}$, and $f(${x0}) = ${answer.toLatex(FR)}$; this is the ${ask} because the $x^2$ coefficient is ${a > 0 ? 'positive' : 'negative'}. (Equivalently $${poly(coefs)} = ${a === 1 ? '' : a === -1 ? '-' : a}(${poly([1, -x0])})^{2}${signed(y0, '')}$.)`,
    trap: 'The question asks for the value of f, not the x where it occurs: find x from f′(x) = 0, then substitute back.',
    tags: ['differentiation', 'minimum', 'quadratic'],
    params: { variant: 'quad-value', coefs, x0 },
    typedAllowed: true,
  };
}

function cubicValueQ(rng: RNG, which: 'min' | 'max'): Generated | null {
  const a = rng.pick([1, 1, 2, -1]);
  const r1 = rng.int(-4, 4), r2 = rng.int(-4, 4);
  if (r1 >= r2) return null;
  const d = rng.int(-8, 8);
  const coefs = cubicFromCritical(a, r1, r2, d);
  if (!coefs || !smallEnough(coefs, [2, 15, 48, 9])) return null;
  // a > 0: local maximum at the smaller root, local minimum at the larger; a < 0 the other way round
  const xMax = a > 0 ? r1 : r2;
  const xMin = a > 0 ? r2 : r1;
  const x0 = which === 'min' ? xMin : xMax;
  const other = which === 'min' ? xMax : xMin;
  const y0 = evalPoly(coefs, x0), yOther = evalPoly(coefs, other);
  if (Math.abs(y0) > 200 || y0 === 0 || y0 === yOther) return null;
  const answer = E(y0);
  const word = which === 'min' ? 'minimum' : 'maximum';
  const otherWord = which === 'min' ? 'maximum' : 'minimum';
  const stem = rng.bool(0.5)
    ? `The curve $y = ${poly(coefs)}$ has a local ${word} point. Find its $y$-coordinate.`
    : `Find the value of $f(x) = ${poly(coefs)}$ at its local ${word}.`;
  const fpp = 6 * a * x0 + 2 * coefs[1];
  const opts = options(rng, answer, [
    { value: E(yOther), trap: `gave the value at the local ${otherWord} instead` },
    { value: E(x0), trap: 'gave the x-coordinate instead of the y-coordinate' },
  ], [
    { value: E(other), trap: `gave the x-coordinate of the local ${otherWord}` },
    { value: E(d), trap: 'gave f(0)' },
    { value: E(-y0), trap: 'sign of the value flipped' },
    { value: E(y0 - d), trap: 'forgot the constant term when substituting' },
    { value: Math.abs(evalPoly(coefs, (r1 + r2) / 2)) <= 200 && Number.isInteger((r1 + r2) / 2) ? E(evalPoly(coefs, (r1 + r2) / 2)) : null, trap: "substituted the root of f''(x) = 0 (the point of inflection)" },
    { value: E(y0 + yOther), trap: 'added the two stationary values' },
    { value: E(0), trap: 'substituted into f′ instead of f: f′ is zero at a stationary point' },
    { value: E(y0 - d), trap: 'dropped the constant term when substituting' },
  ]);
  if (!opts) return null;
  return {
    stem,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: opts,
    solution: `$f'(x) = ${poly(dCoefs(coefs))} = ${factorisedDeriv(a, r1, r2)}$, zero at $x = ${r1}$ and $x = ${r2}$. $f''(${x0}) = ${fpp}$ ${fpp > 0 ? '> 0' : '< 0'}, so the local ${word} is at $x = ${x0}$, where $f(${x0}) = ${answer.toLatex(FR)}$.`,
    trap: 'Identify which stationary point is the minimum (f″ > 0, or the right-hand one when the x³ coefficient is positive), then substitute into f, not f′.',
    tags: ['differentiation', word, 'cubic'],
    params: { variant: 'cubic-value', coefs, x0, which },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 5: exactly one stationary point

const ONE_STATIONARY: [number, number][] = [[1, 3], [1, -3], [1, 6], [1, -6], [2, 6], [2, -6], [3, 3], [3, -3], [3, 6], [3, -6], [-1, 3], [-1, -3], [-2, 6]];

function oneStationaryKQ(rng: RNG): Generated | null {
  const [a, b] = rng.pick(ONE_STATIONARY);
  const d = rng.bool(0.3) ? 0 : rng.nonZeroInt(-5, 5);
  const k = (b * b) / (3 * a);
  const answer = E(k);
  const curve = `${poly([a, b, 0, 0])} + kx${signed(d, '')}`;
  const stem = rng.bool(0.5)
    ? `The curve $y = ${curve}$ has exactly one stationary point. Find the value of $k$.`
    : `Given that $f(x) = ${curve}$ has exactly one stationary point, find $k$.`;
  const opts = options(rng, answer, [
    { value: E(-k), trap: 'sign error in the discriminant condition: (2b)² − 4(3a)k = 0 gives k = b²/(3a)' },
    { value: frac(b * b, a), trap: 'forgot the 3 in 3ax² when differentiating' },
  ], [
    { value: frac(b * b, 12 * a), trap: 'forgot the 2 in 2bx when differentiating' },
    { value: frac(b * b, 4 * a), trap: 'applied b² = 4ac to the coefficients of the cubic itself' },
    { value: frac(-b, 3 * a), trap: 'gave the x-coordinate of the stationary point' },
    { value: E(2 * k), trap: 'arithmetic slip: doubled the value' },
    { value: frac(k, 2), trap: 'arithmetic slip: halved the value' },
    { value: frac(2 * b * b, 3 * a), trap: 'used (2b)² − 2(3a)k = 0' },
    { value: E(-2 * k), trap: 'sign error and a factor of 2' },
    { value: E(b * b), trap: 'forgot to divide by the leading coefficient 3a' },
    { value: frac(b * b, 2 * a), trap: 'used 2a instead of 3a in the discriminant' },
    { value: frac(4 * b * b, 3 * a), trap: 'used (2b)² in the numerator as well as in the discriminant' },
  ]);
  if (!opts) return null;
  return {
    stem,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: opts,
    solution: `$\\frac{dy}{dx} = ${poly([3 * a, 2 * b, 0])} + k$. Exactly one stationary point means this quadratic has a repeated root: $(${2 * b})^2 - 4 \\times ${a === 1 ? '3' : 3 * a < 0 ? `(${3 * a})` : 3 * a} \\times k = 0$, so $k = ${answer.toLatex(FR)}$.`,
    trap: 'One stationary point ⇔ the quadratic dy/dx has a repeated root: discriminant zero (not positive or negative).',
    tags: ['differentiation', 'stationary-point', 'discriminant'],
    params: { variant: 'one-stationary-k', a, b, d },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- numeric helpers for verify

const H = 1e-6;
const d1 = (f: (x: number) => number, x: number) => (f(x + H) - f(x - H)) / (2 * H);
const d2 = (f: (x: number) => number, x: number, h = 1e-3) => (f(x + h) - 2 * f(x) + f(x - h)) / (h * h);

/** Coarse grid then golden-section refinement of a smooth one-variable objective. */
function refineExtreme(fn: (x: number) => number, lo: number, hi: number, maximize: boolean): { x: number; value: number } {
  const g = maximize ? (x: number) => -fn(x) : fn;
  const N = 800;
  const step = (hi - lo) / N;
  let bestX = lo, bestV = g(lo);
  for (let i = 1; i <= N; i++) {
    const x = lo + i * step;
    const v = g(x);
    if (v < bestV) { bestV = v; bestX = x; }
  }
  let a = Math.max(lo, bestX - step), b = Math.min(hi, bestX + step);
  const phi = (Math.sqrt(5) - 1) / 2;
  let c = b - phi * (b - a), d = a + phi * (b - a);
  let fc = g(c), fd = g(d);
  for (let i = 0; i < 200; i++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - phi * (b - a); fc = g(c); }
    else { a = c; c = d; fc = fd; d = a + phi * (b - a); fd = g(d); }
  }
  const x = (a + b) / 2;
  return { x, value: fn(x) };
}

function classify(f: (x: number) => number, k: number): Nature {
  const g = d1(f, k);
  if (Math.abs(g) > 1e-6) return g > 0 ? 'inc' : 'dec';
  const s = d2(f, k);
  if (s > 1e-3) return 'min';
  if (s < -1e-3) return 'max';
  return 'infl';
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'm2.differentiation.stationary-points',
  module: 'M2',
  topic: 'differentiation',
  title: 'Stationary points and their nature',
  levels: {
    1: 'x-coordinate of the stationary point of a quadratic',
    2: "both stationary points of a cubic whose f' factorises (set)",
    3: 'nature of the point at a given x: maximum / minimum / stationary inflection / gradient positive or negative',
    4: 'minimum value of a quadratic; y-coordinate of the local minimum of a cubic',
    5: 'k for exactly one stationary point (discriminant); y-coordinate of the local maximum of a cubic',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return vertexXQ(rng);
        case 2: return criticalSetQ(rng);
        case 3: return natureQ(rng);
        case 4: return pickVariant(rng, [quadraticValueQ, quadraticValueQ, quadraticValueQ, (r) => cubicValueQ(r, 'min'), (r) => cubicValueQ(r, 'min')]);
        default: return pickVariant(rng, [oneStationaryKQ, (r) => cubicValueQ(r, 'max')]);
      }
    });
  },
  verify(q) {
    const p = q.params as { variant: string; coefs?: number[]; k?: number; x0?: number; which?: 'min' | 'max'; a?: number; b?: number; d?: number };
    const close = (x: number, y: number, tol = 1e-6) => Math.abs(x - y) <= tol * Math.max(1, Math.abs(y));
    if (p.variant === 'one-stationary-k') {
      if (q.answer.kind !== 'exact') return false;
      // Rebuild the cubic with the claimed k: its numerical derivative must never change sign yet touch zero.
      const coefs = [p.a!, p.b!, q.answer.value.toNumber(), p.d!];
      const f = (x: number) => evalPoly(coefs, x);
      let prev = d1(f, -12), minAbs = Math.abs(prev);
      for (let x = -12 + 0.01; x <= 12; x += 0.01) {
        const v = d1(f, x);
        if (prev * v < 0 && Math.abs(prev) > 1e-6 && Math.abs(v) > 1e-6) return false; // a genuine sign change (not noise at a double root)
        minAbs = Math.min(minAbs, Math.abs(v));
        prev = v;
      }
      return minAbs < 1e-3;
    }
    const f = (x: number) => evalPoly(p.coefs!, x);
    switch (p.variant) {
      case 'vertex-x': {
        if (q.answer.kind !== 'exact') return false;
        const x = q.answer.value.toNumber();
        return Math.abs(d1(f, x)) < 1e-6 && Math.abs(d2(f, x)) > 1e-3;
      }
      case 'critical-set': {
        if (q.answer.kind !== 'set') return false;
        const xs = q.answer.values.map((v) => v.toNumber());
        return xs.length === 2 && Math.abs(xs[0] - xs[1]) > 1e-9 && xs.every((x) => Math.abs(d1(f, x)) < 1e-6);
      }
      case 'nature':
        return q.answer.kind === 'choice' && LABELS[classify(f, p.k!)] === q.answer.value && q.options.filter((o) => o.correct).length === 1;
      case 'quad-value': {
        if (q.answer.kind !== 'exact') return false;
        const got = q.answer.value.toNumber();
        const maximize = p.coefs![0] < 0;
        const ext = refineExtreme(f, -40, 40, maximize);
        return close(got, ext.value) && Math.abs(d1(f, p.x0!)) < 1e-6 && close(f(p.x0!), got);
      }
      case 'cubic-value': {
        if (q.answer.kind !== 'exact') return false;
        const got = q.answer.value.toNumber();
        const s = d2(f, p.x0!);
        return Math.abs(d1(f, p.x0!)) < 1e-6 && (p.which === 'min' ? s > 1e-3 : s < -1e-3) && close(f(p.x0!), got);
      }
      default:
        return false;
    }
  },
});
