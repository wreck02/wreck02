import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildOptions, buildSetOptions, buildChoiceOptions, type Distractor, type Option } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { poly } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Tangents and normals to polynomial curves.
 * Level 1: gradient of the tangent at x = a
 * Level 2: gradient of the normal (negative reciprocal)
 * Level 3: equation of the tangent (choice of lines: correct vs normal vs sign errors)
 * Level 4: x-coordinate where the tangent is parallel / perpendicular to a given line, or horizontal
 * Level 5: where the tangent or normal meets an axis; k (or c) making y = kx + c a tangent to a parabola
 */

const FR = { format: 'fraction' as const };

function attempt(f: () => Exact): Exact | null {
  try {
    const v = f();
    return Number.isFinite(v.toNumber()) ? v : null;
  } catch {
    return null;
  }
}

type Cand = { value: Exact | null; trap: string };

function cleanOnly(ds: Cand[], maxAbs = Infinity): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } => d.value !== null
    && Number.isFinite(d.value.toNumber())
    && Math.abs(d.value.toNumber()) <= maxAbs
    && isCleanExact(d.value).ok);
}

/**
 * No option may be identifiable by its shape alone. Two shapes do exactly that: being the only
 * value on the page with its sign, and being the only non-integer — whichever option it is, it is
 * either the answer or a free elimination. (At level 1 the −1/m normal gradient used to be the
 * only fraction in 81% of questions, and it is never the answer.) Try replacing one non-headline
 * distractor with a spare candidate and keep the arrangement with the fewest such tells.
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
function options(rng: RNG, answer: Exact, must: Cand[], extra: Cand[], maxAbs = Infinity): Option[] | null {
  const ds = ranked(rng, answer, cleanOnly(must, maxAbs), cleanOnly(extra, maxAbs));
  if (ds.length < 4) return null;
  return buildOptions(rng, answer, ds, FR);
}

type SetCand = { values: Exact[]; trap: string; must?: boolean };

/** Set options that all list the same number of values, so none is eliminable by length alone. */
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

/** Value a student gets from "power rule without lowering the power" at x = a. */
function noLower(coefs: number[], a: number): number {
  const n = coefs.length - 1;
  return coefs.reduce((s, c, i) => s + c * (n - i) * a ** (n - i), 0);
}

interface Curve { coefs: number[]; a: number; y0: number; m: number }

/** A quadratic or cubic with small integer coefficients and the point x = a on it. */
function randomCurve(rng: RNG, degree: 2 | 3, aRange = 3): Curve {
  const coefs = degree === 2
    ? [rng.pick([1, 1, 2, -1, 3, -2]), rng.int(-6, 6), rng.int(-8, 8)]
    : [rng.pick([1, 1, -1, 2]), rng.int(-4, 4), rng.int(-6, 6), rng.int(-8, 8)];
  const a = rng.int(-aRange, aRange);
  return { coefs, a, y0: evalPoly(coefs, a), m: evalPoly(dCoefs(coefs), a) };
}

const curveTex = (c: Curve) => poly(c.coefs);

// ----------------------------------------------------------------------------- line rendering

/** "\frac{3x}{4}", "x", "-x", "6x" — the gradient term. `\frac{1}{6}x` would read as 1/(6x). */
function slopeTerm(m: Exact): string {
  if (m.equals(E(1))) return 'x';
  if (m.equals(E(-1))) return '-x';
  if (m.isRational() && !m.isInteger()) {
    const q = m.toRat();
    const n = q.n < 0n ? -q.n : q.n;
    return `${q.n < 0n ? '-' : ''}\\frac{${n === 1n ? 'x' : `${n}x`}}{${q.d}}`;
  }
  return `${m.toLatex(FR)}x`;
}

/** "\frac{3x}{4} - 2", "x + 5", "-x" — the right-hand side of y = mx + c. */
function slopeRhs(m: Exact, c: Exact): string {
  let rhs = '';
  if (!m.isZero()) rhs = slopeTerm(m);
  if (!c.isZero()) {
    const cs = c.abs().toLatex(FR);
    if (rhs === '') rhs = c.sign() < 0 ? `-${cs}` : cs;
    else rhs += c.sign() < 0 ? ` - ${cs}` : ` + ${cs}`;
  }
  return rhs || '0';
}

const lineTex = (m: Exact, c: Exact) => `$y = ${slopeRhs(m, c)}$`;

/** " + 5", " - 3" or "" for a constant term that follows other terms. */
const signedConst = (v: number): string => (v === 0 ? '' : v > 0 ? ` + ${v}` : ` - ${-v}`);

/** "x - 3", "x + 2" or just "x" for the point-gradient form. */
const shift = (v: string, x0: number): string => (x0 === 0 ? v : x0 > 0 ? `${v} - ${x0}` : `${v} + ${-x0}`);
/** "m(x - 3)" or just "mx" when the point has x = 0. */
const mTimes = (m: string, x0: number): string => (x0 === 0 ? `${m}x` : `${m}(${shift('x', x0)})`);

// ----------------------------------------------------------------------------- level 1: gradient of the tangent

function tangentGradientQ(rng: RNG): Generated | null {
  const c = randomCurve(rng, rng.bool(0.7) ? 2 : 3);
  const { coefs, a, y0, m } = c;
  if (Math.abs(m) > 60 || m === 0) return null;
  const answer = E(m);
  const stem = rng.bool(0.5)
    ? `Find the gradient of the tangent to the curve $y = ${curveTex(c)}$ at the point where $x = ${a}$.`
    : `Find the gradient of the curve $y = ${curveTex(c)}$ at the point $(${a}, ${y0})$.`;
  const dc = dCoefs(coefs);
  /**
   * The gradient of an integer-coefficient polynomial at an integer x is an integer, so −1/m —
   * which is the level-2 answer — was the only non-integer on the page in 81% of questions and
   * never correct. It is offered only when it is an integer itself; the rest of the distractors
   * are integers that can (and do) share the answer's sign.
   */
  const opts = options(rng, answer, [
    { value: E(y0), trap: 'substituted into y instead of dy/dx' },
    { value: E(noLower(coefs, a)), trap: 'applied the power rule without lowering the power' },
  ], [
    { value: E(-m), trap: 'sign slip' },
    { value: E(evalPoly(dc, -a)), trap: `substituted x = ${-a} instead of x = ${a}` },
    { value: E(evalPoly(dc, a + 1)), trap: `substituted x = ${a + 1} instead of x = ${a}` },
    { value: E(evalPoly(dc, a - 1)), trap: `substituted x = ${a - 1} instead of x = ${a}` },
    { value: E(evalPoly(dCoefs(dc), a)), trap: 'differentiated twice: this is the second derivative' },
    { value: E(m - coefs[coefs.length - 2]), trap: 'dropped the derivative of the x term' },
    { value: E(m + coefs[coefs.length - 1]), trap: 'kept the constant term when differentiating' },
    { value: Math.abs(m) === 1 ? frac(-1, m) : null, trap: 'gave the gradient of the normal' },
  ], Math.max(30, 10 * Math.abs(m)));
  if (!opts) return null;
  return {
    stem,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: opts,
    solution: `$\\frac{dy}{dx} = ${poly(dCoefs(coefs))}$; at $x = ${a}$ this is $${m}$.`,
    trap: 'The gradient of the tangent is dy/dx evaluated at the point — differentiate first, then substitute.',
    tags: ['differentiation', 'tangent', 'gradient'],
    params: { variant: 'tangent-gradient', coefs, a },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 2: gradient of the normal

function normalGradientQ(rng: RNG): Generated | null {
  const c = randomCurve(rng, rng.bool(0.5) ? 2 : 3);
  const { coefs, a, y0, m } = c;
  // |m| <= 9 keeps −1/m a gradient the exam would print and keeps every option on one scale:
  // with m = 16 beside −1/16 the largest option is 256 times the smallest.
  if (m === 0 || Math.abs(m) === 1 || Math.abs(m) > 9) return null;
  const answer = frac(-1, m);
  if (!isCleanExact(answer).ok) return null; // 1/13, 1/17 … are not exam denominators
  const dc = dCoefs(coefs);
  const mUp = evalPoly(dc, a + 1), mDown = evalPoly(dc, a - 1), nl = noLower(coefs, a);
  const recip = (v: number) => (Math.abs(v) >= 2 && Math.abs(v) <= 12 ? frac(-1, v) : null);
  /**
   * The answer is a negative unit fraction, so most of the options are too: with only −m, m and
   * 1/m around it a candidate who worked out nothing but the sign of dy/dx scored 72% here.
   * At most one of ±m is offered — both of them together also framed the answer, and they set
   * the option spread (the S flag).
   */
  const bigOne: Cand = rng.bool(0.5)
    ? { value: E(-m), trap: 'changed the sign but did not take the reciprocal' }
    : { value: E(m), trap: 'gave the gradient of the tangent' };
  const stem = rng.bool(0.5)
    ? `Find the gradient of the normal to the curve $y = ${curveTex(c)}$ at the point where $x = ${a}$.`
    : `The normal to the curve $y = ${curveTex(c)}$ at the point $(${a}, ${y0})$ has gradient $n$. Find $n$.`;
  // Offered as a headline trap only half the time: with -m and m framing every question the answer
  // was the unique negative unit fraction in 46% of them, and they set the option spread on their own.
  const headline: Cand[] = [{ value: frac(1, m), trap: 'took the reciprocal but did not change the sign' }];
  const spare: Cand[] = [];
  (rng.bool(0.65) ? headline : spare).push(bigOne);
  const opts = options(rng, answer, headline, [
    ...spare,
    { value: recip(mUp), trap: `substituted x = ${a + 1} instead of x = ${a}` },
    { value: recip(mDown), trap: `substituted x = ${a - 1} instead of x = ${a}` },
    { value: frac(-2, m), trap: 'used −2/m instead of −1/m' },
    { value: recip(y0), trap: 'used y instead of dy/dx as the tangent gradient' },
    { value: recip(nl), trap: 'power rule without lowering the power' },
    { value: recip(2 * m), trap: 'halved the tangent gradient before taking the negative reciprocal' },
    { value: recip(m + 1), trap: `arithmetic slip evaluating dy/dx: used ${m + 1} instead of ${m}` },
    { value: recip(m - 1), trap: `arithmetic slip evaluating dy/dx: used ${m - 1} instead of ${m}` },
  ]);
  if (!opts) return null;
  const mTex = m < 0 ? `(${m})` : `${m}`;
  return {
    stem,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: opts,
    solution: `$\\frac{dy}{dx} = ${poly(dCoefs(coefs))} = ${m}$ at $x = ${a}$, so the normal has gradient $-1 \\div ${mTex} = ${answer.toLatex(FR)}$.`,
    trap: 'The normal is perpendicular to the tangent: gradient −1/m (flip the fraction and change the sign).',
    tags: ['differentiation', 'normal', 'gradient'],
    params: { variant: 'normal-gradient', coefs, a },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 3: equation of the tangent (choice)

function tangentEquationQ(rng: RNG): Generated | null {
  const c = randomCurve(rng, rng.bool(0.6) ? 2 : 3);
  const { coefs, a, y0, m } = c;
  if (m === 0 || Math.abs(m) > 30 || Math.abs(y0) > 40) return null;
  const cc = y0 - m * a; // intercept of the tangent
  const correct = lineTex(E(m), E(cc));
  const nl = noLower(coefs, a);
  const dc = dCoefs(coefs);
  const mUp = evalPoly(dc, a + 1), yUp = evalPoly(coefs, a + 1);
  const mBack = evalPoly(dc, -a), yBack = evalPoly(coefs, -a);
  /**
   * The tangent gradient is always an integer here, so the normal's −1/m would be the only line
   * with a fractional gradient and could be struck out on sight: it is offered only when −1/m is
   * itself an integer. Its place is taken by other integer-gradient wrong lines.
   */
  const cands: { m: Exact; c: Exact; trap: string }[] = [
    ...(Math.abs(m) === 1 ? [{ m: frac(-1, m), c: E(y0).add(frac(a, m)), trap: 'this is the normal, not the tangent' }] : []),
    { m: E(m), c: E(y0 + m * a), trap: 'sign slip in y − y₁ = m(x − x₁)' },
    { m: E(m), c: E(0), trap: 'forgot the constant: the tangent must pass through the point' },
    { m: E(y0), c: E(y0 - y0 * a), trap: 'used the y-coordinate as the gradient' },
    { m: E(m), c: E(-y0 - m * a), trap: 'sign of y₁ lost' },
    { m: E(nl), c: E(y0 - nl * a), trap: 'power rule without lowering the power' },
    { m: E(-m), c: E(y0 + m * a), trap: 'sign of the gradient lost' },
    { m: E(-m), c: E(y0 - m * a), trap: 'sign of the gradient lost but the intercept kept' },
    { m: E(mUp), c: E(yUp - mUp * (a + 1)), trap: `took the tangent at x = ${a + 1} instead of x = ${a}` },
    { m: E(mBack), c: E(yBack - mBack * -a), trap: `took the tangent at x = ${-a} instead of x = ${a}` },
  ];
  const seen = new Set([correct]);
  const wrong: { display: string; trap: string }[] = [];
  for (const w of cands) {
    if (!isCleanExact(w.c).ok || !isCleanExact(w.m).ok) continue;
    const display = lineTex(w.m, w.c);
    if (seen.has(display)) continue;
    seen.add(display);
    wrong.push({ display, trap: w.trap });
  }
  if (wrong.length < 4) return null;
  return {
    stem: `Find the equation of the tangent to the curve $y = ${curveTex(c)}$ at the point where $x = ${a}$.`,
    answer: { kind: 'choice', value: correct },
    options: buildChoiceOptions(rng, correct, wrong),
    solution: `At $x = ${a}$, $y = ${y0}$ and $\\frac{dy}{dx} = ${poly(dCoefs(coefs))} = ${m}$. So $${shift('y', y0)} = ${mTimes(`${m}`, a)}$, i.e. ${correct}.`,
    trap: 'Gradient from dy/dx at the point, then y − y₁ = m(x − x₁) with the point on the curve; the normal would use −1/m.',
    tags: ['differentiation', 'tangent', 'equation-of-line'],
    params: { variant: 'tangent-eq', coefs, a, m, c: cc },
    typedAllowed: false,
  };
}

// ----------------------------------------------------------------------------- level 4: parallel / perpendicular / horizontal

function parallelQuadQ(rng: RNG): Generated | null {
  const p = rng.pick([1, 1, 2, -1, 3]);
  const q = rng.int(-6, 6);
  const r = rng.int(-8, 8);
  const xs = rng.bool(0.25) ? rng.pick([-5, -3, -1, 1, 3, 5]) / 2 : rng.nonZeroInt(-4, 4);
  const m = 2 * p * xs + q; // gradient of the given line
  if (m === 0 || Math.abs(m) > 20) return null;
  const cL = rng.int(-6, 6);
  const coefs = [p, q, r];
  const answer = E(xs);
  const ys = evalPoly(coefs, xs);
  // "found where the line meets the curve": p x² + (q − m) x + (r − cL) = 0
  const disc = (q - m) ** 2 - 4 * p * (r - cL);
  const meet = disc >= 0 && Number.isInteger(Math.sqrt(disc)) ? frac(-(q - m) + Math.sqrt(disc), 2 * p) : null;
  const opts = options(rng, answer, [
    { value: frac(-m - q, 2 * p), trap: 'used −m for the gradient' },
    { value: frac(m - q, p), trap: 'forgot the 2 when differentiating x²' },
  ], [
    { value: frac(-q, 2 * p), trap: 'found the stationary point (horizontal tangent) instead' },
    { value: E(ys), trap: 'gave the y-coordinate' },
    { value: meet, trap: 'found where the line meets the curve instead' },
    { value: attempt(() => frac(-1, m).sub(E(q)).div(E(2 * p))), trap: 'used the perpendicular gradient −1/m' },
    { value: frac(m + q, 2 * p), trap: 'sign slip: solved 2px − q = m' },
    { value: E(m), trap: 'gave the gradient of the line' },
    { value: frac(m - q, 4 * p), trap: 'divided by 4p instead of 2p' },
  ]);
  if (!opts) return null;
  return {
    stem: `Find the $x$-coordinate of the point on the curve $y = ${poly(coefs)}$ at which the tangent is parallel to the line ${lineTex(E(m), E(cL))}.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: opts,
    solution: `Parallel lines have equal gradients, so $\\frac{dy}{dx} = ${poly([2 * p, q])} = ${m}$, giving $x = ${answer.toLatex(FR)}$.`,
    trap: 'Parallel means dy/dx equals the gradient of the given line; solve f′(x) = m (not f(x) = mx + c).',
    tags: ['differentiation', 'tangent', 'parallel'],
    params: { variant: 'parallel', coefs, target: [m, 1] },
    typedAllowed: true,
  };
}

function parallelCubicQ(rng: RNG): Generated | null {
  // f'(x) − m = 3p(x − r)²  ⇒  f(x) = p x³ − 3p r x² + (3p r² + m) x + s
  const p = rng.pick([1, 1, -1, 2]);
  const r = rng.nonZeroInt(-3, 3);
  const m = rng.nonZeroInt(-6, 6);
  const s = rng.int(-5, 5);
  const cL = rng.int(-6, 6);
  const coefs = [p, -3 * p * r, 3 * p * r * r + m, s];
  if (Math.abs(coefs[2]) > 40) return null;
  const answer = E(r);
  const yr = evalPoly(coefs, r);
  // "solved f'(x) = 0": 3p(x − r)² = −m  ⇒  x = r ± √(−m/(3p)) when that is a perfect square
  const t = -m / (3 * p);
  const zeroRoot = t > 0 && Number.isInteger(Math.sqrt(t)) ? E(r + Math.sqrt(t)) : null;
  const opts = options(rng, answer, [
    { value: E(-r), trap: 'sign slip: the repeated root of (x − r)² is x = r' },
    { value: E(2 * r), trap: 'forgot the 2 in −b/(2a) when solving the quadratic' },
  ], [
    { value: Math.abs(yr) <= 200 ? E(yr) : null, trap: 'gave the y-coordinate' },
    { value: zeroRoot, trap: 'solved f′(x) = 0 (horizontal tangent) instead of f′(x) = m' },
    { value: E(-m), trap: 'gave the negative of the gradient' },
    { value: frac(r, 2), trap: 'halved the root' },
    { value: E(m), trap: 'gave the gradient of the line' },
    { value: E(r + 1), trap: 'arithmetic slip when reading the repeated root' },
    { value: frac(-r, 2), trap: 'halved the root and lost the sign' },
    { value: E(3 * r), trap: 'divided by p instead of 3p' },
  ]);
  if (!opts) return null;
  return {
    stem: `The tangent to the curve $y = ${poly(coefs)}$ is parallel to the line ${lineTex(E(m), E(cL))} at exactly one point. Find the $x$-coordinate of this point.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: opts,
    solution: `$\\frac{dy}{dx} = ${poly(dCoefs(coefs))}$. Setting this equal to $${m}$: $${poly([3 * p, -6 * p * r, 3 * p * r * r])} = 0$, i.e. $${3 * p === 1 ? '' : 3 * p === -1 ? '-' : 3 * p}(${poly([1, -r])})^{2} = 0$, so $x = ${r}$.`,
    trap: 'Set dy/dx equal to the given gradient and solve; the quadratic is a perfect square, which is why there is exactly one point.',
    tags: ['differentiation', 'tangent', 'parallel', 'perfect-square'],
    params: { variant: 'parallel', coefs, target: [m, 1] },
    typedAllowed: true,
  };
}

function perpendicularQ(rng: RNG): Generated | null {
  const p = rng.pick([1, 1, 2, -1]);
  const q = rng.int(-6, 6);
  const r = rng.int(-8, 8);
  const xs = rng.nonZeroInt(-4, 4);
  const t = 2 * p * xs + q; // required tangent gradient
  if (t === 0 || Math.abs(t) > 6) return null;
  const mL = frac(-1, t); // gradient of the given line
  const cL = rng.int(-6, 6);
  const coefs = [p, q, r];
  const answer = E(xs);
  const opts = options(rng, answer, [
    { value: attempt(() => mL.sub(E(q)).div(E(2 * p))), trap: 'solved for a parallel tangent (gradient −1/t) instead of a perpendicular one' },
    { value: frac(-t - q, 2 * p), trap: 'sign slip: the perpendicular gradient is −1 ÷ (−1/t) = t, not −t' },
  ], [
    { value: attempt(() => mL.neg().sub(E(q)).div(E(2 * p))), trap: 'changed the sign of the line gradient but forgot the reciprocal' },
    { value: frac(-q, 2 * p), trap: 'found the stationary point instead' },
    { value: E(evalPoly(coefs, xs)), trap: 'gave the y-coordinate' },
    { value: frac(t - q, p), trap: 'forgot the 2 when differentiating x²' },
    { value: E(t), trap: 'gave the required gradient instead of the x-coordinate' },
    { value: frac(t + q, 2 * p), trap: 'sign slip: solved 2px − q = t' },
    { value: frac(t - q, 4 * p), trap: 'divided by 4p instead of 2p' },
  ]);
  if (!opts) return null;
  return {
    stem: `Find the $x$-coordinate of the point on the curve $y = ${poly(coefs)}$ at which the tangent is perpendicular to the line ${lineTex(mL, E(cL))}.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: opts,
    solution: `The line has gradient $${mL.toLatex(FR)}$, so the tangent needs gradient $${t}$. $\\frac{dy}{dx} = ${poly([2 * p, q])} = ${t}$ gives $x = ${xs}$.`,
    trap: 'Perpendicular gradients multiply to −1: the tangent gradient is the negative reciprocal of the line’s, then solve f′(x) = that value.',
    tags: ['differentiation', 'tangent', 'perpendicular'],
    params: { variant: 'parallel', coefs, target: [t, 1] },
    typedAllowed: true,
  };
}

function horizontalQ(rng: RNG): Generated | null {
  const p = rng.pick([1, 1, 2, -1, 3]);
  const xs = rng.bool(0.3) ? rng.pick([-3, -1, 1, 3, 5]) / 2 : rng.nonZeroInt(-5, 5);
  const q = -2 * p * xs;
  const r = rng.int(-8, 8);
  const coefs = [p, q, r];
  const answer = E(xs);
  const opts = options(rng, answer, [
    { value: E(-xs), trap: 'sign slip: x = −b/(2a)' },
    { value: E(2 * xs), trap: 'forgot the 2 when differentiating x²' },
  ], [
    { value: E(evalPoly(coefs, xs)), trap: 'gave the y-coordinate' },
    { value: E(r), trap: 'read off the constant term' },
    { value: E(xs).mulRat(frac(1, 2).toRat()), trap: 'halved twice' },
    { value: E(q), trap: 'read off the coefficient of x' },
    { value: E(p), trap: 'read off the coefficient of x²' },
    { value: E(xs).mulRat(frac(-1, 2).toRat()), trap: 'halved twice and lost the sign' },
    { value: E(-q), trap: 'read off −b without dividing by 2a' },
  ]);
  if (!opts) return null;
  return {
    stem: `Find the $x$-coordinate of the point on the curve $y = ${poly(coefs)}$ at which the tangent is horizontal.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: opts,
    solution: `A horizontal tangent has gradient $0$: $\\frac{dy}{dx} = ${poly([2 * p, q])} = 0$ gives $x = ${answer.toLatex(FR)}$.`,
    trap: 'Horizontal tangent ⇔ dy/dx = 0 (the stationary point), so solve 2px + q = 0.',
    tags: ['differentiation', 'tangent', 'horizontal'],
    params: { variant: 'parallel', coefs, target: [0, 1] },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 5: intercepts of tangents and normals; tangent lines to a parabola

function tangentAxisQ(rng: RNG): Generated | null {
  const c = randomCurve(rng, rng.bool(0.5) ? 2 : 3);
  const { coefs, a, y0, m } = c;
  if (m === 0 || y0 === 0 || Math.abs(m) > 24 || Math.abs(y0) > 40) return null;
  const axis = rng.pick(['x', 'y'] as const);
  const xInt = frac(m * a - y0, m); // a − y0/m
  const yInt = E(y0 - m * a);
  if (axis === 'x' && (!isCleanExact(xInt).ok || xInt.toRat().d > 12n)) return null;
  const answer = axis === 'x' ? xInt : yInt;
  const must: Cand[] = axis === 'x'
    ? [
      { value: frac(m * a + y0, m), trap: 'sign slip when setting y = 0' },
      { value: frac(-y0, m), trap: 'used y = mx through the origin (forgot to add a)' },
    ]
    : [
      { value: E(y0 + m * a), trap: 'sign slip: c = y₁ − m x₁, not y₁ + m x₁' },
      { value: E(y0), trap: 'gave the y-coordinate of the point of contact' },
    ];
  const extra: Cand[] = axis === 'x'
    ? [
      { value: yInt, trap: 'found the y-intercept instead' },
      { value: E(a + m * y0), trap: 'used the normal instead of the tangent' },
      { value: E(a), trap: 'gave the x-coordinate of the point of contact' },
      { value: E(a - y0), trap: 'subtracted y₁ instead of y₁/m' },
      { value: E(a - m * y0), trap: 'multiplied by m instead of dividing by it' },
      { value: frac(y0, m), trap: 'gave y₁/m without subtracting it from x₁' },
      { value: attempt(() => E(2 * a).sub(frac(y0, m))), trap: 'used 2x₁ − y₁/m' },
    ]
    : [
      { value: E(-m * a), trap: 'forgot y₁' },
      { value: xInt, trap: 'found the x-intercept instead' },
      { value: E(y0).add(frac(a, m)), trap: 'used the normal instead of the tangent' },
      { value: E(y0 - m), trap: 'subtracted m instead of m·x₁' },
      { value: E(y0 - 2 * m * a), trap: 'subtracted m·x₁ twice' },
      { value: E(m * a - y0), trap: 'sign of the whole intercept lost' },
      { value: E(a), trap: 'gave the x-coordinate of the point of contact' },
    ];
  const cc = y0 - m * a;
  const opts = options(rng, answer, must, extra);
  if (!opts) return null;
  return {
    stem: axis === 'x'
      ? `The tangent to the curve $y = ${curveTex(c)}$ at the point where $x = ${a}$ meets the $x$-axis at $(p, 0)$. Find the value of $p$.`
      : `The tangent to the curve $y = ${curveTex(c)}$ at the point where $x = ${a}$ meets the $y$-axis at $(0, q)$. Find the value of $q$.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: opts,
    solution: `At $x = ${a}$: $y = ${y0}$, $\\frac{dy}{dx} = ${m}$. Tangent: $${shift('y', y0)} = ${mTimes(`${m}`, a)}$, i.e. ${lineTex(E(m), E(cc))}. ` +
      (axis === 'x' ? `Put $y = 0$: $x = ${answer.toLatex(FR)}$.` : `Put $x = 0$: $y = ${answer.toLatex(FR)}$.`),
    trap: 'Write the tangent as y − y₁ = m(x − x₁) with the correct point, then set y = 0 (x-axis) or x = 0 (y-axis).',
    tags: ['differentiation', 'tangent', 'intercept'],
    params: { variant: axis === 'x' ? 'tangent-x-int' : 'tangent-y-int', coefs, a },
    typedAllowed: true,
  };
}

function normalAxisQ(rng: RNG): Generated | null {
  const c = randomCurve(rng, rng.bool(0.5) ? 2 : 3);
  const { coefs, a, y0, m } = c;
  if (m === 0 || y0 === 0 || Math.abs(m) > 12 || Math.abs(y0) > 30) return null;
  const axis = rng.pick(['x', 'x', 'y'] as const);
  const xInt = E(a + m * y0);
  const yInt = E(y0).add(frac(a, m));
  if (Math.abs(xInt.toNumber()) > 150) return null;
  const answer = axis === 'x' ? xInt : yInt;
  if (!isCleanExact(answer).ok || (axis === 'y' && yInt.toRat().d > 6n)) return null;
  const must: Cand[] = axis === 'x'
    ? [
      { value: E(a - m * y0), trap: 'sign slip when setting y = 0' },
      { value: frac(m * a - y0, m), trap: 'used the tangent instead of the normal' },
    ]
    : [
      { value: E(y0).sub(frac(a, m)), trap: 'sign slip: c = y₁ + a/m for the normal' },
      { value: E(y0 - m * a), trap: 'used the tangent instead of the normal' },
    ];
  const extra: Cand[] = axis === 'x'
    ? [
      { value: E(a).add(frac(y0, m)), trap: 'took the normal gradient as 1/m (sign not changed)' },
      { value: E(m * y0), trap: 'forgot to add a' },
      { value: E(a).add(frac(y0, m).neg()).neg(), trap: 'took the normal gradient as −m' },
      { value: E(a + y0), trap: 'took the normal gradient as −1 instead of −1/m' },
      { value: E(a - y0), trap: 'took the normal gradient as 1 instead of −1/m' },
      { value: E(a + 2 * m * y0), trap: 'added m·y₁ twice' },
      { value: E(a), trap: 'gave the x-coordinate of the point of contact' },
    ]
    : [
      { value: E(y0 + m * a), trap: 'took the normal gradient as −m' },
      { value: frac(a, m), trap: 'forgot y₁' },
      { value: E(y0), trap: 'gave the y-coordinate of the point' },
      { value: E(y0 + a), trap: 'took the normal gradient as −1 instead of −1/m' },
      { value: E(y0).add(frac(2 * a, m)), trap: 'added x₁/m twice' },
      { value: E(y0).neg().sub(frac(a, m)), trap: 'sign of the whole intercept lost' },
      { value: E(a), trap: 'gave the x-coordinate of the point of contact' },
    ];
  const n = frac(-1, m);
  const opts = options(rng, answer, must, extra);
  if (!opts) return null;
  return {
    stem: axis === 'x'
      ? `The normal to the curve $y = ${curveTex(c)}$ at the point where $x = ${a}$ meets the $x$-axis at $(p, 0)$. Find the value of $p$.`
      : `The normal to the curve $y = ${curveTex(c)}$ at the point where $x = ${a}$ meets the $y$-axis at $(0, q)$. Find the value of $q$.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: opts,
    solution: `At $x = ${a}$: $y = ${y0}$, $\\frac{dy}{dx} = ${m}$, so the normal has gradient $${n.toLatex(FR)}$: $${shift('y', y0)} = ${mTimes(n.toLatex(FR), a)}$. ` +
      (axis === 'x' ? `Put $y = 0$: $x = ${a === 0 ? '' : `${a} ${m * y0 >= 0 ? '+' : '-'} ${Math.abs(m * y0)} = `}${answer.toLatex(FR)}$.` : `Put $x = 0$: $y = ${answer.toLatex(FR)}$.`),
    trap: 'The normal has gradient −1/m; with y = 0 the x-intercept of the normal is a + m·y₁ (no division).',
    tags: ['differentiation', 'normal', 'intercept'],
    params: { variant: axis === 'x' ? 'normal-x-int' : 'normal-y-int', coefs, a },
    typedAllowed: true,
  };
}

function tangentKQ(rng: RNG): Generated | null {
  // y = kx + c tangent to y = p x² + q x + r  ⇔  (q − k)² = 4p(r − c). Choose s with p(r − c) = s².
  const p = rng.pick([1, 1, 2, -1]);
  const s = p === 2 ? rng.pick([2, 4]) : rng.pick([1, 2, 3]);
  const q = rng.int(-4, 4);
  const r = rng.int(-5, 5);
  const c = r - (s * s) / p;
  if (!Number.isInteger(c) || Math.abs(c) > 14) return null;
  const coefs = [p, q, r];
  const values = [E(q - 2 * s), E(q + 2 * s)];
  // The ask is plural, so every option offers two values of k: a one-value option used to be
  // struck out by length alone in 17% of level-5 questions.
  const distractors: SetCand[] = [
    { values: [E(q - s), E(q + s)], trap: 'forgot the factor 2: q − k = ±2s, not ±s', must: true },
    { values: [E(-q - 2 * s), E(-q + 2 * s)], trap: 'sign of q lost when rearranging' },
    { values: [frac(-s, p), frac(s, p)], trap: 'gave the x-coordinates of the points of contact' },
    { values: [E(q), E(-q)], trap: 'took the discriminant as giving k = ±q' },
    { values: [E(q - 4 * s * s), E(q + 4 * s * s)], trap: 'forgot to square-root the discriminant' },
    { values: [E(q - 2 * s * s), E(q + 2 * s * s)], trap: 'halved the discriminant instead of square-rooting it' },
    { values: [E(2 * q - 2 * s), E(2 * q + 2 * s)], trap: 'doubled q when rearranging q − k = ±2s' },
  ];
  const opts = setOptions(rng, values, distractors, 'k');
  if (!opts) return null;
  return {
    stem: `The line $y = kx ${c >= 0 ? '+' : '-'} ${Math.abs(c)}$ is a tangent to the curve $y = ${poly(coefs)}$. Find the possible values of $k$.`,
    answer: { kind: 'set', values, variable: 'k' },
    options: opts,
    solution: `Equate the line and the curve: $${poly([p, 0, 0])} + (${q} - k)x${signedConst(r - c)} = 0$. A tangent means a repeated root: $(${q} - k)^2 = 4 \\times ${p < 0 ? `(${p})` : p} \\times ${r - c} = ${4 * s * s}$, so $${q} - k = \\pm ${2 * s}$ and $k = ${q - 2 * s}$ or $k = ${q + 2 * s}$.`,
    trap: 'A line is a tangent when the quadratic from equating them has a repeated root: discriminant zero, giving two values of k.',
    tags: ['differentiation', 'tangent', 'discriminant'],
    params: { variant: 'tangent-k', coefs, c },
    typedAllowed: true,
  };
}

function tangentCQ(rng: RNG): Generated | null {
  // y = kx + c tangent to y = p x² + q x + r with k given: c = r − (q − k)²/(4p). Take q − k = 2pt.
  const p = rng.pick([1, 1, 2, -1]);
  const q = rng.int(-4, 4);
  const r = rng.int(-6, 6);
  const t = rng.nonZeroInt(-3, 3);
  const k = q - 2 * p * t;
  if (k === 0 || Math.abs(k) > 12) return null;
  const cVal = r - p * t * t;
  const coefs = [p, q, r];
  const answer = E(cVal);
  const contactX = -t; // point of contact: x = (k − q)/(2p)
  const contactY = evalPoly(coefs, contactX);
  const opts = options(rng, answer, [
    { value: E(r + p * t * t), trap: 'sign slip: c = r − (q − k)²/(4p)' },
    { value: E(-p * t * t), trap: 'forgot the constant term r' },
  ], [
    { value: E(r - 2 * p * t * t), trap: 'used (q − k)²/(2p) instead of (q − k)²/(4p)' },
    { value: E(r), trap: 'took c equal to the constant term' },
    { value: E(contactY), trap: 'gave the y-coordinate of the point of contact' },
    { value: E(contactX), trap: 'gave the x-coordinate of the point of contact' },
    { value: E(r - 4 * p * t * t), trap: 'used (q − k)²/p instead of (q − k)²/(4p)' },
    { value: frac(r - p * t * t, 2), trap: 'halved the intercept' },
    { value: E(k), trap: 'gave the gradient of the line instead of its intercept' },
  ]);
  if (!opts) return null;
  return {
    stem: `The line $y = ${slopeRhs(E(k), E(0))} + c$ is a tangent to the curve $y = ${poly(coefs)}$. Find the value of $c$.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: opts,
    solution: `Equate: $${poly([p, q - k, 0])} + (${r} - c) = 0$ must have a repeated root, so $(${q - k})^2 = 4 \\times ${p < 0 ? `(${p})` : p} \\times (${r} - c)$, giving $c = ${answer.toLatex(FR)}$. (Equivalently: $\\frac{dy}{dx} = ${k}$ at $x = ${contactX}$, where $y = ${contactY}$.)`,
    trap: 'Discriminant zero for the quadratic obtained by equating the line and the curve — or find the contact point from dy/dx = k and substitute.',
    tags: ['differentiation', 'tangent', 'discriminant'],
    params: { variant: 'tangent-c', coefs, k },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- numeric helpers for verify

const H = 1e-6;
const d1 = (f: (x: number) => number, x: number) => (f(x + H) - f(x - H)) / (2 * H);

/** Coarse grid then golden-section refinement of a smooth one-variable objective. */
function refineExtreme(fn: (x: number) => number, lo: number, hi: number, maximize: boolean): number {
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
  return fn((a + b) / 2);
}

/** Does the line y = kx + c touch the parabola (the gap has an extreme value of exactly zero)? */
function touches(coefs: number[], k: number, c: number): boolean {
  const gap = (x: number) => evalPoly(coefs, x) - (k * x + c);
  const ext = refineExtreme(gap, -40, 40, coefs[0] < 0);
  return Math.abs(ext) < 1e-6;
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'm2.differentiation.tangent-normal',
  module: 'M2',
  topic: 'differentiation',
  title: 'Tangents and normals',
  levels: {
    1: 'gradient of the tangent at x = a',
    2: 'gradient of the normal (negative reciprocal)',
    3: 'equation of the tangent as a choice of lines',
    4: 'x where the tangent is parallel / perpendicular to a given line, or horizontal',
    5: 'where the tangent or normal meets an axis; k (or c) so that y = kx + c touches a parabola',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return tangentGradientQ(rng);
        case 2: return normalGradientQ(rng);
        case 3: return tangentEquationQ(rng);
        case 4: return pickVariant(rng, [parallelQuadQ, parallelQuadQ, parallelCubicQ, perpendicularQ, perpendicularQ, horizontalQ]);
        default: return pickVariant(rng, [tangentAxisQ, tangentAxisQ, normalAxisQ, normalAxisQ, tangentKQ, tangentCQ]);
      }
    });
  },
  verify(q) {
    const p = q.params as { variant: string; coefs: number[]; a?: number; m?: number; c?: number; k?: number; target?: [number, number] };
    const f = (x: number) => evalPoly(p.coefs, x);
    const close = (x: number, y: number, tol = 1e-6) => Math.abs(x - y) <= tol * Math.max(1, Math.abs(y));
    if (q.answer.kind === 'choice') {
      if (p.variant !== 'tangent-eq') return false;
      const { a, m, c } = p as { a: number; m: number; c: number };
      // The claimed line must have the curve's numerical gradient at x = a and pass through (a, f(a)),
      // and the chosen option must be that line's rendering.
      return close(d1(f, a), m) && close(m * a + c, f(a)) && q.answer.value === lineTex(E(m), E(c)) && q.options.filter((o) => o.correct).length === 1;
    }
    if (q.answer.kind === 'set') {
      if (p.variant !== 'tangent-k') return false;
      const ks = q.answer.values.map((v) => v.toNumber());
      return ks.length === 2 && Math.abs(ks[0] - ks[1]) > 1e-9 && ks.every((k) => touches(p.coefs, k, p.c!));
    }
    const got = q.answer.value.toNumber();
    const a = p.a ?? 0;
    const y0 = f(a), m = d1(f, a);
    switch (p.variant) {
      case 'tangent-gradient': return close(got, m);
      case 'normal-gradient': return close(got * m, -1);
      case 'parallel': {
        const t = p.target![0] / p.target![1];
        return close(d1(f, got), t);
      }
      case 'tangent-x-int': return Math.abs(y0 + m * (got - a)) < 1e-6;
      case 'tangent-y-int': return close(got, y0 - m * a);
      case 'normal-x-int': return Math.abs(y0 - (got - a) / m) < 1e-6;
      case 'normal-y-int': return close(got, y0 + a / m);
      case 'tangent-c': return touches(p.coefs, p.k!, got);
      default: return false;
    }
  },
});
