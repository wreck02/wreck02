import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, Exact, rat, ratSub, R1 } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { poly } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Chain rule on simple composites  y = coef · (inner(x))^(n/d), evaluated at x = x0.
 * Level 1: (2x + 1)³ at x = 0 → 6
 * Level 2: (3x − 2)⁴ at x = 1 → 12; (1 − 2x)⁵ at x = 0 → −10
 * Level 3: √(x² + 9) at x = 4 → 4/5; 1/(2x + 1)² at x = 0 → −4; √(4x + 1) at x = 2 → 2/3
 * Level 4: (x² − 3)³ at x = 2 → 12; 1/(x² + 1) at x = 1 → −1/2; (x³ + 1)² at x = 1
 * Level 5: (2√x − 1)² at x = 4 → 3; (x + 1/x)² at x = 2 → 15/4; (x³ + 19)^{1/3} at x = 2 → 4/9; (x² + 9)^{3/2} at x = 4 → 60
 *
 * Parameters with du/dx = 0 at x0 are rejected: there four of the mistake modes collapse
 * onto the answer (which is then 0) and the option list would have to be padded.
 */

/** A term c·x^p of the inner function. Powers used: 0, 1, 2, 3, 1/2, −1 (all exactly representable). */
type Term = [number, number];

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

function cleanOnly(ds: Cand[], maxAbs: number): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } => d.value !== null
    && Number.isFinite(d.value.toNumber())
    && Math.abs(d.value.toNumber()) <= maxAbs
    && isCleanExact(d.value).ok);
}

/**
 * Every distinct `must` candidate is used before any `extra` one, so the headline traps are
 * never shuffled out; the rest are then drawn alternately from above and below the answer, so
 * the answer lands in the middle of the sorted option list as often as at either end and
 * "pick the largest" is never a winning strategy.
 */
function ranked(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], count = 4): Distractor[] {
  const seen: Exact[] = [answer];
  const out: Distractor[] = [];
  const take = (d: Distractor) => {
    if (out.length >= count || seen.some((s) => s.equals(d.value))) return;
    seen.push(d.value);
    out.push(d);
  };
  must.forEach(take);
  const pool = rng.shuffle(extra);
  const grab = (s: -1 | 1) => pool.find((d) => d.value.cmp(answer) === s && !seen.some((x) => x.equals(d.value)));
  while (out.length < count) {
    const above = out.filter((d) => d.value.cmp(answer) > 0).length;
    const wanted: -1 | 1 = above * 2 <= out.length ? 1 : -1;
    const d = grab(wanted) ?? grab(wanted === 1 ? -1 : 1);
    if (!d) break;
    take(d);
  }
  return out;
}

/** Pick a sub-variant first, then retry its parameters, so rejection rates do not skew the mix of variants. */
function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 60; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

// ----------------------------------------------------------------------------- the composite

interface Composite {
  inner: Term[];
  /** outer power n/d */
  power: [number, number];
  /** outer multiplier */
  coef: number;
  x0: number;
}

const powExact = (k: number, p: number): Exact => E(k).powRat(E(p).toRat());

/** inner(x0) exactly. */
function innerValue(c: Composite): Exact {
  return c.inner.reduce((acc, [k, p]) => acc.add(E(k).mul(powExact(c.x0, p))), Exact.ZERO);
}

/** inner'(x0) exactly. */
function innerDeriv(c: Composite): Exact {
  return c.inner.reduce((acc, [k, p]) => (p === 0 ? acc : acc.add(E(k).mul(E(p)).mul(powExact(c.x0, p - 1)))), Exact.ZERO);
}

/**
 * dy/dx at x0, or the value a specific mistake produces:
 *  ok          coef · (n/d) · u^(n/d − 1) · u'
 *  no-inner    coef · (n/d) · u^(n/d − 1)              (forgot the inner derivative)
 *  no-lower    coef · (n/d) · u^(n/d) · u'             (did not lower the power)
 *  no-power    coef · u^(n/d − 1) · u'                 (forgot to multiply by the power — for √u the ½ dropped)
 *  inner-only  coef · u'                               (differentiated the inside only)
 *  value       y itself
 *  du-twice    coef · (n/d) · u^(n/d − 1) · u'²        (chain rule applied twice)
 *  lower-twice coef · (n/d) · u^(n/d − 2) · u'         (lowered the power by two)
 *  second      coef · (n/d)(n/d − 1) · u^(n/d − 2) · u'²  (d²y/dx²)
 */
type Mode = 'ok' | 'no-inner' | 'no-lower' | 'no-power' | 'inner-only' | 'value' | 'du-twice' | 'lower-twice' | 'second';

function chain(c: Composite, mode: Mode): Exact | null {
  return attempt(() => {
    const [n, d] = c.power;
    const u = innerValue(c);
    const du = innerDeriv(c);
    const p = rat(n, d);
    const pm1 = rat(n - d, d);
    const pm2 = rat(n - 2 * d, d);
    switch (mode) {
      case 'value': return u.powRat(p).mulRat(c.coef);
      case 'no-inner': return u.powRat(pm1).mulRat(p).mulRat(c.coef);
      case 'no-lower': return u.powRat(p).mulRat(p).mul(du).mulRat(c.coef);
      case 'no-power': return u.powRat(pm1).mul(du).mulRat(c.coef);
      case 'inner-only': return du.mulRat(c.coef);
      case 'du-twice': return u.powRat(pm1).mulRat(p).mul(du).mul(du).mulRat(c.coef);
      case 'lower-twice': return u.powRat(pm2).mulRat(p).mul(du).mulRat(c.coef);
      case 'second': return u.powRat(pm2).mulRat(p).mulRat(ratSub(p, R1)).mul(du).mul(du).mulRat(c.coef);
      default: return u.powRat(pm1).mulRat(p).mul(du).mulRat(c.coef);
    }
  });
}

/** Numeric y(x), used by verify(). */
function evalComposite(c: Composite, x: number): number {
  const u = c.inner.reduce((s, [k, p]) => s + k * Math.pow(x, p), 0);
  return c.coef * Math.pow(u, c.power[0] / c.power[1]);
}

// ----------------------------------------------------------------------------- rendering

function termBody(k: number, p: number): string {
  const a = Math.abs(k);
  const coef = a === 1 ? '' : `${a}`;
  if (p === 0) return `${a}`;
  if (p === 1) return `${coef}x`;
  if (p === 0.5) return `${coef}\\sqrt{x}`;
  if (p === -1) return `\\frac{${a}}{x}`;
  return `${coef}x^{${p}}`;
}

function innerTex(inner: Term[]): string {
  let out = '';
  for (const [k, p] of inner) {
    if (k === 0) continue;
    const body = termBody(k, p);
    if (out === '') out = (k < 0 ? '-' : '') + body;
    else out += (k < 0 ? ' - ' : ' + ') + body;
  }
  return out || '0';
}

/** LaTeX for coef · (inner)^(n/d) in the form the exam would print. */
function compositeTex(c: Composite): string {
  const body = innerTex(c.inner);
  const tall = c.inner.some(([, p]) => p < 0);
  const br = tall ? `\\left(${body}\\right)` : `(${body})`;
  const [n, d] = c.power;
  const a = Math.abs(c.coef);
  const sign = c.coef < 0 ? '-' : '';
  const cs = a === 1 ? '' : `${a}`;
  if (d === 1 && n > 0) return `${sign}${cs}${br}^{${n}}`;
  if (d === 1 && n < 0) return `${sign}\\frac{${a}}{${-n === 1 ? body : `${br}^{${-n}}`}}`;
  if (n === 1 && d === 2) return `${sign}${cs}\\sqrt{${body}}`;
  if (n === -1 && d === 2) return `${sign}\\frac{${a}}{\\sqrt{${body}}}`;
  return `${sign}${cs}${br}^{${n}/${d}}`;
}

/** The outer power as a multiplier for the solution text: "3", "\frac{1}{2}", "-\frac{1}{2}". */
function powerWord([n, d]: [number, number]): string {
  return d === 1 ? `${n}` : `${n < 0 ? '-' : ''}\\frac{${Math.abs(n)}}{${d}}`;
}

/** u raised to the lowered power (n/d − 1): "u", "u^{2}", "u^{-1/2}". */
function uPow([n, d]: [number, number]): string {
  const e = n - d;
  if (d === 1) return e === 1 ? 'u' : `u^{${e}}`;
  return `u^{${e}/${d}}`;
}

// ----------------------------------------------------------------------------- the generic question

interface ChainOpts {
  variant: string;
  tags: string[];
  /** Extra traps specific to the variant. */
  extra?: Cand[];
  maxAbs?: number;
  /** Explanation of the chain-rule step in the solution, e.g. "u = 2x + 1, du/dx = 2". */
  step: string;
}

function chainQ(rng: RNG, c: Composite, o: ChainOpts): Generated | null {
  // A vanishing inner derivative collapses no-power, no-lower, inner-only and the answer onto 0:
  // the option list would then be three-quarters generic padding, so redraw instead.
  const du = innerDeriv(c);
  if (du.isZero()) return null;
  const answer = chain(c, 'ok');
  if (!answer || answer.isZero() || !isCleanExact(answer).ok) return null;
  const maxAbs = o.maxAbs ?? 250;
  if (Math.abs(answer.toNumber()) > maxAbs) return null;
  // Keep every distractor within a believable factor of the answer (no 3-orders-of-magnitude options).
  const cap = Math.max(30, 12 * Math.abs(answer.toNumber()));
  const isRoot = c.power[1] !== 1;
  const must = cleanOnly([
    { value: chain(c, 'no-inner'), trap: 'forgot to multiply by the derivative of the inside' },
    { value: chain(c, 'no-power'), trap: isRoot ? 'the ½ (or the fractional power) was dropped: d/du(√u) = 1/(2√u)' : 'forgot to multiply by the power' },
  ], cap);
  const extra = cleanOnly([
    { value: chain(c, 'no-lower'), trap: 'did not lower the power' },
    { value: answer.neg(), trap: 'sign of the inner derivative (or of the negative power) lost' },
    { value: chain(c, 'value'), trap: 'evaluated y instead of dy/dx' },
    { value: chain(c, 'inner-only'), trap: 'differentiated the inside only' },
    { value: chain(c, 'du-twice'), trap: 'multiplied by the derivative of the inside twice' },
    { value: chain(c, 'second'), trap: 'differentiated a second time: this is d²y/dx²' },
    { value: chain(c, 'lower-twice'), trap: 'lowered the power by two instead of by one' },
    ...(o.extra ?? []),
  ], cap);
  const ds = ranked(rng, answer, must, extra);
  // Four named mistakes or nothing: buildOptions must never have to pad this template.
  if (ds.length < 4) return null;
  const fTex = compositeTex(c);
  const stem = rng.bool(0.5)
    ? `Find the gradient of the curve $y = ${fTex}$ at the point where $x = ${c.x0}$.`
    : `Given that $f(x) = ${fTex}$, find $f'(${c.x0})$.`;
  return {
    stem,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: buildOptions(rng, answer, ds, FR),
    solution: `${o.step} By the chain rule $\\frac{dy}{dx} = ${c.coef === 1 ? powerWord(c.power) : `${c.coef} \\times ${c.power[0] < 0 ? `\\left(${powerWord(c.power)}\\right)` : powerWord(c.power)}`}${uPow(c.power)} \\times \\frac{du}{dx}$; at $x = ${c.x0}$, $u = ${innerValue(c).toLatex(FR)}$ and $\\frac{du}{dx} = ${du.toLatex(FR)}$, giving $${answer.toLatex(FR)}$.`,
    trap: 'Chain rule: bring the power down, lower it by one, then multiply by the derivative of the inside (do not forget that last factor).',
    tags: ['differentiation', 'chain-rule', ...o.tags],
    params: { inner: c.inner, power: c.power, coef: c.coef, x0: c.x0, variant: o.variant },
    typedAllowed: true,
  };
}

/** Choose x0 so that a·x0 + b equals the wanted inner value u; null if x0 is not a small integer. */
function linearAt(a: number, b: number, u: number, maxX = 4): number | null {
  const x0 = (u - b) / a;
  return Number.isInteger(x0) && Math.abs(x0) <= maxX ? x0 : null;
}

/**
 * The linear inside ax + b, written b − |a|x when a is negative (as the exam prints it).
 * A negative a therefore needs a positive b, or the bracket reads "(-3 - 2x)", which no exam sets.
 */
const linInner = (a: number, b: number): Term[] => (a < 0 ? [[b, 0], [a, 1]] : [[a, 1], [b, 0]]);
const linReads = (a: number, b: number) => a > 0 || b > 0;
const linTex = (a: number, b: number) => innerTex(linInner(a, b));
const linStep = (a: number, b: number) => `Let $u = ${linTex(a, b)}$, so $\\frac{du}{dx} = ${a}$.`;
const quadStep = (b: number, c: number) => `Let $u = ${poly([1, b, c])}$, so $\\frac{du}{dx} = ${poly([2, b])}$.`;

// ----------------------------------------------------------------------------- levels 1–2: (ax + b)^n

function linearPowerQ(rng: RNG, n: number): Generated | null {
  const a = rng.pick([1, 2, 2, 3, -1, -2, 4]);
  const b = rng.nonZeroInt(-3, 3);
  if (!linReads(a, b)) return null;
  // |u| = 2 or 3 keeps "did not lower the power" (answer × u) away from ±answer.
  const u = rng.weighted(n >= 4 ? [2, -2, 1, -1] : [2, -2, 3, -3, 1, -1], n >= 4 ? [3, 3, 1, 1] : [3, 3, 2, 2, 1, 1]);
  // With |a| = 1 and |u| = 1 every mistake mode gives ±1 × the answer: nothing is being tested.
  if (Math.abs(a) === 1 && Math.abs(u) === 1) return null;
  const x0 = linearAt(a, b, u);
  if (x0 === null) return null;
  return chainQ(rng, { inner: linInner(a, b), power: [n, 1], coef: 1, x0 }, {
    variant: 'linear-power', tags: ['integer-power'], step: linStep(a, b),
  });
}

// ----------------------------------------------------------------------------- level 3: square roots and reciprocals of linear/quadratic

const TRIPLES: [number, number, number][] = [[3, 4, 5], [4, 3, 5], [5, 12, 13], [12, 5, 13], [6, 8, 10], [8, 6, 10]];

function sqrtQuadQ(rng: RNG): Generated | null {
  const [p, q, h] = rng.pick(TRIPLES);
  const x0 = p * rng.sign();
  if (rng.bool(0.65)) {
    // √(x² + q²) at x0 = ±p: gradient x0/h
    return chainQ(rng, { inner: [[1, 2], [q * q, 0]], power: [1, 2], coef: 1, x0 }, { variant: 'sqrt-quadratic', tags: ['square-root'], step: quadStep(0, q * q) });
  }
  // √(h² − x²) at x0 = ±p: gradient −x0/q
  return chainQ(rng, { inner: [[h * h, 0], [-1, 2]], power: [1, 2], coef: 1, x0 }, { variant: 'sqrt-quadratic', tags: ['square-root'], step: `Let $u = ${h * h} - x^{2}$, so $\\frac{du}{dx} = -2x$.` });
}

function reciprocalLinearQ(rng: RNG): Generated | null {
  const a = rng.pick([1, 2, 2, 3, -1, -2, 4]);
  const b = rng.nonZeroInt(-3, 3);
  if (!linReads(a, b)) return null;
  const u = rng.pick([1, -1, 2, -2]);
  const x0 = linearAt(a, b, u);
  if (x0 === null) return null;
  const n = rng.pick([-1, -2, -2]);
  const coef = rng.bool(0.3) ? rng.pick([2, 3, 4]) : 1;
  return chainQ(rng, { inner: linInner(a, b), power: [n, 1], coef, x0 }, {
    variant: 'reciprocal-linear', tags: ['negative-power'], step: `Write $y = ${coef === 1 ? '' : coef}(${linTex(a, b)})^{${n}}$ and let $u = ${linTex(a, b)}$, so $\\frac{du}{dx} = ${a}$.`,
  });
}

function sqrtLinearQ(rng: RNG): Generated | null {
  const a = rng.pick([2, 3, 4, 4, 5, 6, 8, -2, -4]);
  const b = rng.nonZeroInt(-5, 9);
  if (!linReads(a, b)) return null;
  const s = rng.pick([1, 2, 3, 3, 4, 5]);
  const x0 = linearAt(a, b, s * s, 6);
  if (x0 === null) return null;
  return chainQ(rng, { inner: linInner(a, b), power: [1, 2], coef: 1, x0 }, { variant: 'sqrt-linear', tags: ['square-root'], step: linStep(a, b) });
}

// ----------------------------------------------------------------------------- level 4: quadratic and cubic insides

function quadraticPowerQ(rng: RNG): Generated | null {
  const x0 = rng.pick([1, 2, 2, 3, -1, -2]);
  const u = rng.pick([1, -1, 2, -2, 3]);
  const b = rng.bool(0.3) ? rng.pick([-4, -2, 2, 4]) : 0;
  const c = u - x0 * x0 - b * x0;
  if (c === 0 || Math.abs(c) > 15) return null;
  const n = rng.pick([3, 3, 4]);
  return chainQ(rng, { inner: [[1, 2], [b, 1], [c, 0]], power: [n, 1], coef: 1, x0 }, { variant: 'quadratic-power', tags: ['integer-power'], step: quadStep(b, c) });
}

function reciprocalQuadraticQ(rng: RNG): Generated | null {
  const x0 = rng.pick([1, 1, 2, -1, -2, 3]);
  const u = rng.pick([1, 2, 4, 5, 10]);
  const c = u - x0 * x0;
  if (c === 0) return null;
  const coef = rng.pick([1, 1, 2, 4]);
  return chainQ(rng, { inner: [[1, 2], [c, 0]], power: [-1, 1], coef, x0 }, {
    variant: 'reciprocal-quadratic', tags: ['negative-power'], step: `Write $y = ${coef === 1 ? '' : coef}(${poly([1, 0, c])})^{-1}$ and let $u = ${poly([1, 0, c])}$, so $\\frac{du}{dx} = 2x$.`,
  });
}

function cubicSquareQ(rng: RNG): Generated | null {
  const x0 = rng.pick([1, 1, 2, -1, -2]);
  const u = rng.pick([1, -1, 2, -2, 3]);
  const c = u - x0 ** 3;
  if (c === 0 || Math.abs(c) > 10) return null;
  return chainQ(rng, { inner: [[1, 3], [c, 0]], power: [2, 1], coef: 1, x0 }, {
    variant: 'cubic-square', tags: ['integer-power'], step: `Let $u = ${poly([1, 0, 0, c])}$, so $\\frac{du}{dx} = 3x^{2}$.`,
  });
}

// ----------------------------------------------------------------------------- level 5: composites needing more care

function sqrtInsideSquareQ(rng: RNG): Generated | null {
  // (p√x + q)² at a perfect square x0: 2(p√x0 + q) · p/(2√x0)
  const p = rng.pick([1, 2, 2, 3, -1]);
  const q = rng.nonZeroInt(-3, 3);
  const x0 = rng.pick([1, 4, 4, 9]);
  if (p * Math.sqrt(x0) + q === 0) return null;
  return chainQ(rng, { inner: [[p, 0.5], [q, 0]], power: [2, 1], coef: 1, x0 }, {
    variant: 'sqrt-inside', tags: ['square-root'], step: `Let $u = ${innerTex([[p, 0.5], [q, 0]])}$, so $\\frac{du}{dx} = ${E(p).mulRat(rat(1, 2)).toLatex(FR)}x^{-1/2}$.`,
  });
}

function xPlusInverseQ(rng: RNG): Generated | null {
  // (ax + b/x)² at x0; chainQ rejects the draws with du/dx = 0 (a = b, x0 = 1)
  const a = rng.pick([1, 1, 2]);
  const b = rng.pick([1, 1, -1, 2]);
  const x0 = rng.pick([1, 2, 2]);
  if (a * x0 + b / x0 === 0) return null;
  return chainQ(rng, { inner: [[a, 1], [b, -1]], power: [2, 1], coef: 1, x0 }, {
    variant: 'x-plus-inverse', tags: ['negative-power'], step: `Let $u = ${innerTex([[a, 1], [b, -1]])}$, so $\\frac{du}{dx} = ${a} ${b > 0 ? '-' : '+'} \\frac{${Math.abs(b)}}{x^{2}}$.`,
  });
}

function cubeRootQ(rng: RNG): Generated | null {
  // (x³ + c)^{1/3} at x0 with x0³ + c a perfect cube s³: gradient x0²/s²
  const [x0, s] = rng.pick([[1, 2], [2, 3], [3, 4], [2, 1], [3, 2], [-1, 1], [-2, 1]]);
  const c = s ** 3 - x0 ** 3;
  if (c === 0) return null;
  return chainQ(rng, { inner: [[1, 3], [c, 0]], power: [1, 3], coef: 1, x0 }, {
    variant: 'cube-root', tags: ['fractional-power'], step: `Let $u = ${poly([1, 0, 0, c])}$, so $\\frac{du}{dx} = 3x^{2}$.`,
  });
}

function threeHalvesQ(rng: RNG): Generated | null {
  // (x² + c)^{3/2} at x0 with x0² + c = s²: gradient 3 x0 s
  const [x0, c] = rng.pick([[4, 9], [3, 16], [2, 5], [1, 3], [1, 8], [2, 12], [3, 7], [-3, 16], [-2, 5]]);
  return chainQ(rng, { inner: [[1, 2], [c, 0]], power: [3, 2], coef: 1, x0 }, {
    variant: 'three-halves', tags: ['fractional-power'], step: quadStep(0, c),
  });
}

function inverseSqrtQ(rng: RNG): Generated | null {
  // 1/√(ax + b) at x0 with ax0 + b = s²: gradient −a/(2s³)
  const a = rng.pick([2, 3, 4, 4, 6, 8, -2]);
  const b = rng.nonZeroInt(-4, 9);
  if (!linReads(a, b)) return null;
  const s = rng.pick([1, 2, 2, 3, 4]);
  const x0 = linearAt(a, b, s * s, 6);
  if (x0 === null) return null;
  const coef = rng.pick([1, 1, 2, 4]);
  return chainQ(rng, { inner: linInner(a, b), power: [-1, 2], coef, x0 }, {
    variant: 'inverse-sqrt', tags: ['fractional-power', 'negative-power'], step: `Write $y = ${coef === 1 ? '' : coef}(${linTex(a, b)})^{-1/2}$ and let $u = ${linTex(a, b)}$, so $\\frac{du}{dx} = ${a}$.`,
  });
}

function sqrtCompleteQ(rng: RNG): Generated | null {
  // √(x² + bx + c) at x0 with a perfect-square inside: gradient (2x0 + b)/(2s)
  const [p, q] = rng.pick(TRIPLES);
  const shiftBy = rng.pick([-2, -1, 1, 2]); // x + shift = ±p
  const x0 = p * rng.sign() - shiftBy;
  const b = 2 * shiftBy;
  const c = shiftBy * shiftBy + q * q;
  if (Math.abs(x0) > 6 || c > 60) return null;
  return chainQ(rng, { inner: [[1, 2], [b, 1], [c, 0]], power: [1, 2], coef: 1, x0 }, { variant: 'sqrt-quadratic', tags: ['square-root'], step: quadStep(b, c) });
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'm2.differentiation.chain-rule',
  module: 'M2',
  topic: 'differentiation',
  title: 'Chain rule on simple composites',
  levels: {
    1: '(2x + 1)³ at x = 0',
    2: '(3x − 2)⁴ at x = 1; (1 − 2x)⁵ at x = 0',
    3: '√(x² + 9) at x = 4; 1/(2x + 1)² at x = 0; √(4x + 1) at x = 2',
    4: '(x² − 3)³ at x = 2; 1/(x² + 1) at x = 1; (x³ + 1)² at x = 1',
    5: '(2√x − 1)² at x = 4; (x + 1/x)² at x = 2; (x³ + 19)^{1/3} at x = 2; (x² + 9)^{3/2} at x = 4',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return linearPowerQ(rng, 3);
        case 2: return linearPowerQ(rng, rng.pick([4, 4, 5]));
        case 3: return pickVariant(rng, [sqrtQuadQ, reciprocalLinearQ, sqrtLinearQ]);
        case 4: return pickVariant(rng, [quadraticPowerQ, reciprocalQuadraticQ, cubicSquareQ, sqrtLinearQ]);
        default: return pickVariant(rng, [sqrtInsideSquareQ, xPlusInverseQ, cubeRootQ, threeHalvesQ, inverseSqrtQ, sqrtCompleteQ]);
      }
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const c = q.params as unknown as Composite;
    const h = 1e-6;
    const f = (x: number) => evalComposite(c, x);
    const numeric = (f(c.x0 + h) - f(c.x0 - h)) / (2 * h);
    const got = q.answer.value.toNumber();
    return Number.isFinite(numeric) && Math.abs(got - numeric) <= 1e-6 * Math.max(1, Math.abs(numeric));
  },
});
