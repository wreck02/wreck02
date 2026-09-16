import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact, type Rat } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { poly } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Differentiate a polynomial-like expression and evaluate the derivative at a point.
 * Level 1: f(x) = ax² + bx + c, find f'(k)
 * Level 2: cubic, find f'(k)
 * Level 3: fractional and negative powers written as √x, 1/x, 1/x²: f(x) = 4√x + 2/x, f'(4)
 * Level 4: expand first, (2x + 1)²/x, or x^{3/2} − 6x^{1/2} at x = 4
 * Level 5: f''(k) of a quartic, or the k with f'(k) = 0 when f' has a repeated root
 */

/** A term c·x^p. Powers used: 0, 1, 2, 3, 4, 1/2, 3/2, −1, −2 (all exactly representable). JSON-friendly. */
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

function cleanOnly(ds: Cand[], maxAbs = Infinity): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } => d.value !== null
    && Number.isFinite(d.value.toNumber())
    && Math.abs(d.value.toNumber()) <= maxAbs
    && isCleanExact(d.value).ok);
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
 * shuffled out; the remaining slots are drawn alternately from above and below the answer (the last
 * slot repairing an all-above or all-below list), so "pick the largest" is never a winning strategy.
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
  // Aim for a randomly chosen number of options above the answer, so over many questions the
  // answer lands at every position in the sorted list rather than always low or always in the middle.
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

/** Pick a sub-variant first, then retry its parameters, so rejection rates do not skew the mix of variants. */
function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

// ----------------------------------------------------------------------------- exact evaluation

/** Exact k^p for the powers used here (k > 0 whenever p is fractional). */
function powExact(k: number, p: number): Exact {
  return E(k).powRat(E(p).toRat());
}

/**
 * The derivative of one term at x = k, or the value a specific mistake produces:
 *  ok        c·p·k^(p−1)
 *  nolower   c·p·k^p            (power rule without lowering the power)
 *  nomult    c·k^(p−1)          (lowered the power without multiplying by it)
 *  negsign   +c·|p|·k^(p−1)     (d/dx(1/x) taken as +1/x²)             — only negative powers change
 *  halfdrop  c·2p·k^(p−1)       (the ½ from √x forgotten: 1/√x)        — only half-integer powers change
 *  nodouble  c·sign(p)·k^(p−1)  (d/dx(1/x²) = −1/x³, the 2 lost)       — only |p| ≥ 2 changes
 *  keepconst constant term kept
 *  value     f(k) itself
 */
type Mode = 'ok' | 'nolower' | 'nomult' | 'negsign' | 'halfdrop' | 'nodouble' | 'keepconst' | 'value';

function dTerm(c: number, p: number, k: number, mode: Mode): Exact {
  if (mode === 'value') return E(c).mul(powExact(k, p));
  if (p === 0) return mode === 'keepconst' ? E(c) : Exact.ZERO;
  switch (mode) {
    case 'nolower': return E(c).mul(E(p)).mul(powExact(k, p));
    case 'nomult': return E(c).mul(powExact(k, p - 1));
    case 'negsign': return p < 0 ? E(c).mul(E(-p)).mul(powExact(k, p - 1)) : dTerm(c, p, k, 'ok');
    case 'halfdrop': return Number.isInteger(p) ? dTerm(c, p, k, 'ok') : E(c).mul(E(2 * p)).mul(powExact(k, p - 1));
    case 'nodouble': return Number.isInteger(p) && Math.abs(p) >= 2 ? E(c).mul(E(Math.sign(p))).mul(powExact(k, p - 1)) : dTerm(c, p, k, 'ok');
    default: return E(c).mul(E(p)).mul(powExact(k, p - 1));
  }
}

function dSum(terms: Term[], k: number, mode: Mode): Exact | null {
  return attempt(() => terms.reduce((acc, [c, p]) => acc.add(dTerm(c, p, k, mode)), Exact.ZERO));
}

/** Numeric value of Σ c·x^p, used by verify(). */
function evalTerms(terms: Term[], x: number): number {
  return terms.reduce((s, [c, p]) => s + c * Math.pow(x, p), 0);
}

// ----------------------------------------------------------------------------- rendering

type Style = 'sqrt' | 'index';

/** |c|·x^p in LaTeX (sign handled by the caller). */
function termBody(c: number, p: number, style: Style): string {
  const a = Math.abs(c);
  const coef = a === 1 ? '' : `${a}`;
  if (p === 0) return `${a}`;
  if (p === 1) return `${coef}x`;
  if (Number.isInteger(p) && p > 1) return `${coef}x^{${p}}`;
  if (p === 0.5) return style === 'sqrt' ? `${coef}\\sqrt{x}` : `${coef}x^{1/2}`;
  if (p === 1.5) return style === 'sqrt' ? `${coef}x\\sqrt{x}` : `${coef}x^{3/2}`;
  if (p === -1) return `\\frac{${a}}{x}`;
  if (p === -2) return `\\frac{${a}}{x^{2}}`;
  if (p === -0.5) return `\\frac{${a}}{\\sqrt{x}}`;
  return `${coef}x^{${p}}`;
}

/** Plain-text name of the term c·x^p, used inside trap strings. */
function termWord(c: number, p: number): string {
  const a = Math.abs(c);
  const coef = a === 1 ? '' : `${a}`;
  if (p === 0) return `constant ${a}`;
  if (p === 1) return `${coef}x`;
  if (p === 0.5) return `${coef}\u221Ax`;
  if (p === 1.5) return `${coef}x^(3/2)`;
  if (p === -1) return `${a}/x`;
  if (p === -2) return `${a}/x\u00B2`;
  if (p === -0.5) return `${a}/\u221Ax`;
  return `${coef}x^${p}`;
}

function termsTex(terms: Term[], style: Style): string {
  let out = '';
  for (const [c, p] of terms) {
    if (c === 0) continue;
    const body = termBody(c, p, style);
    if (out === '') out = (c < 0 ? '-' : '') + body;
    else out += (c < 0 ? ' - ' : ' + ') + body;
  }
  return out || '0';
}

/** LaTeX of a term q·x^m where q is rational and m ∈ {…, −3, −2, −1, −1/2, 0, 1/2, 1, 2, 3}. */
function ratTermBody(q: Rat, m: number): string {
  const n = q.n < 0n ? -q.n : q.n;
  const d = q.d;
  if (m === 0) return d === 1n ? `${n}` : `\\frac{${n}}{${d}}`;
  const xPow = m === 1 ? 'x' : m === 0.5 ? '\\sqrt{x}' : Number.isInteger(m) ? `x^{${Math.abs(m)}}` : m === -0.5 ? '\\sqrt{x}' : `x^{${Math.abs(m)}}`;
  if (m > 0) {
    const coef = d === 1n ? (n === 1n ? '' : `${n}`) : `\\frac{${n}}{${d}}`;
    return `${coef}${xPow}`;
  }
  // negative power: write as a fraction 1/(d x^m)
  const den = d === 1n ? xPow : `${d}${xPow}`;
  return `\\frac{${n}}{${den}}`;
}

/** f'(x) in LaTeX from the terms (the coefficient c·p as a rational, power p − 1). */
function derivativeTex(terms: Term[]): string {
  let out = '';
  for (const [c, p] of terms) {
    if (c === 0 || p === 0) continue;
    const q = E(c).mul(E(p)).toRat();
    const neg = q.n < 0n;
    const body = ratTermBody(q, p - 1);
    if (out === '') out = (neg ? '-' : '') + body;
    else out += (neg ? ' - ' : ' + ') + body;
  }
  return out || '0';
}

// ----------------------------------------------------------------------------- the generic f'(k) question

interface DerivOpts {
  fTex: string;
  /** Expanded form shown in the solution when the stem is not already a sum of powers. */
  expanded?: string;
  must?: Cand[];
  extra?: Cand[];
  maxAbs?: number;
  trap?: string;
  variant: string;
  tags: string[];
}

function derivativeQ(rng: RNG, terms: Term[], k: number, o: DerivOpts): Generated | null {
  const answer = dSum(terms, k, 'ok');
  if (!answer || !isCleanExact(answer).ok) return null;
  if (Math.abs(answer.toNumber()) > (o.maxAbs ?? 150)) return null;
  // Keep every distractor within a believable factor of the answer.
  const cap = Math.max(25, 12 * Math.abs(answer.toNumber()));
  // At most two headline traps, so two of the four slots stay free to balance the option list.
  const headline = cleanOnly([
    ...(o.must ?? []),
    { value: dSum(terms, k, 'value'), trap: 'evaluated f(k) instead of f′(k)' },
    { value: dSum(terms, k, 'nolower'), trap: 'applied the power rule without lowering the power' },
  ], cap);
  const must = headline.slice(0, 2);
  const demoted = headline.slice(2);
  /**
   * Several of the generic mistake modes are no-ops on a given set of terms (`negsign` on a
   * positive power, `nodouble` on a fractional one) and collapse onto the answer. These
   * term-by-term slips never do, so the builder always has four named distractors to choose from.
   */
  const perTerm: Cand[] = [];
  for (const [c, p] of terms) {
    if (c === 0 || p === 0) continue;
    const dt = attempt(() => dTerm(c, p, k, 'ok'));
    if (!dt || dt.isZero()) continue;
    const w = termWord(c, p);
    perTerm.push({ value: attempt(() => answer.sub(dt)), trap: `dropped the ${w} term instead of differentiating it` });
    perTerm.push({ value: attempt(() => answer.sub(dt).add(E(c).mul(powExact(k, p)))), trap: `left the ${w} term unchanged instead of differentiating it` });
    perTerm.push({ value: attempt(() => answer.sub(dt).sub(dt)), trap: `sign slip on the ${w} term` });
  }
  const extra = cleanOnly([
    { value: dSum(terms, k, 'nomult'), trap: 'lowered the power but did not multiply by it' },
    { value: dSum(terms, k, 'negsign'), trap: 'sign of the negative power: d/dx(1/x) = −1/x², not +1/x²' },
    { value: dSum(terms, k, 'halfdrop'), trap: 'dropped the ½: d/dx(√x) = 1/(2√x), not 1/√x' },
    { value: dSum(terms, k, 'nodouble'), trap: 'd/dx(1/x²) = −2/x³: the factor 2 was lost' },
    { value: dSum(terms, k, 'keepconst'), trap: 'kept the constant term when differentiating' },
    { value: answer.neg(), trap: 'sign slip in the final evaluation' },
    ...(o.extra ?? []),
    ...perTerm,
  ], cap).concat(demoted);
  // Four named mistakes or nothing: buildOptions must never have to pad this template.
  const ds = ranked(rng, answer, must, extra);
  if (ds.length < 4) return null;
  const stem = rng.bool(0.6)
    ? `Given that $f(x) = ${o.fTex}$, find the value of $f'(${k})$.`
    : `$f(x) = ${o.fTex}$. Find $f'(${k})$.`;
  const expandStep = o.expanded ? `Expand first: $f(x) = ${o.expanded}$. ` : '';
  return {
    stem,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: buildOptions(rng, answer, ds, FR),
    solution: `${expandStep}$f'(x) = ${derivativeTex(terms)}$, so $f'(${k}) = ${answer.toLatex(FR)}$.`,
    trap: o.trap ?? 'Bring each power down as a multiplier and lower it by one; then substitute into f′(x), not into f(x).',
    tags: ['differentiation', ...o.tags],
    params: { variant: o.variant, terms, k, order: 1 },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 1: quadratic

function quadraticQ(rng: RNG): Generated | null {
  const a = rng.pick([1, 1, 2, 2, 3, -1, -2, 4]);
  const b = rng.nonZeroInt(-9, 9);
  const c = rng.int(-9, 9);
  const k = rng.pick([-3, -2, -1, 1, 2, 3, 4, 5]);
  const terms: Term[] = [[a, 2], [b, 1], [c, 0]];
  return derivativeQ(rng, terms, k, {
    fTex: poly([a, b, c]),
    extra: [
      { value: E(2 * a * k), trap: 'dropped the derivative of the x term' },
      { value: E(2 * a * k - b), trap: 'sign slip in the linear term' },
    ],
    variant: 'quadratic',
    tags: ['power-rule'],
  });
}

// ----------------------------------------------------------------------------- level 2: cubic

function cubicQ(rng: RNG): Generated | null {
  const a = rng.pick([1, 1, 1, 2, -1, -2, 3]);
  const b = rng.int(-5, 5);
  const c = rng.nonZeroInt(-9, 9);
  const d = rng.int(-9, 9);
  const k = rng.pick([-3, -2, -1, 1, 2, 3]);
  const terms: Term[] = [[a, 3], [b, 2], [c, 1], [d, 0]];
  return derivativeQ(rng, terms, k, {
    fTex: poly([a, b, c, d]),
    extra: [
      { value: E(3 * a * k * k + b * k + c), trap: 'forgot to double the coefficient of x²' },
      { value: E(3 * a * k * k + 2 * b * k), trap: 'dropped the derivative of the x term' },
      { value: E(3 * a * k * k - 2 * b * k + c), trap: 'sign slip in the x² term' },
    ],
    variant: 'cubic',
    tags: ['power-rule'],
  });
}

// ----------------------------------------------------------------------------- level 3: √x, 1/x, 1/x²

function fractionalQ(rng: RNG): Generated | null {
  const shape = rng.pick(['sqrt-inv', 'sqrt-inv', 'sqrt-inv2', 'sq-inv', 'lin-inv2', 'inv-inv2']);
  let terms: Term[];
  let k: number;
  switch (shape) {
    case 'sqrt-inv': // p√x + q/x
      terms = [[rng.pick([1, 2, 4, 6, 8, -2, -4]), 0.5], [rng.pick([1, 2, 3, 4, 8, -1, -2, -4]), -1]];
      k = rng.pick([1, 4, 4, 4]);
      break;
    case 'sqrt-inv2': // p√x + q/x²
      terms = [[rng.pick([2, 4, 6, 8, -4]), 0.5], [rng.pick([1, 2, 4, -1, -2, -4, 8]), -2]];
      k = rng.pick([1, 4, 4]);
      break;
    case 'sq-inv': // p x² + q/x
      terms = [[rng.pick([1, 2, 3, -1]), 2], [rng.pick([1, 2, 3, 4, 8, -2, -4, 9]), -1]];
      k = rng.pick([1, 2, 2, 3]);
      break;
    case 'lin-inv2': // p x + q/x²
      terms = [[rng.pick([1, 2, 3, 5, -2]), 1], [rng.pick([1, 2, 4, 8, -1, -4])!, -2]];
      k = rng.pick([1, 2, 2]);
      break;
    default: // p/x + q/x²
      terms = [[rng.pick([1, 2, 4, 8, -2])!, -1], [rng.pick([1, 2, 4, 8, -4, -8]), -2]];
      k = rng.pick([1, 2, 2]);
  }
  if (rng.bool(0.4)) terms.reverse();
  return derivativeQ(rng, terms, k, {
    fTex: termsTex(terms, 'sqrt'),
    trap: 'Rewrite √x = x^{1/2}, 1/x = x^{−1}, 1/x² = x^{−2} first: the derivatives are ½x^{−1/2}, −x^{−2} and −2x^{−3} (watch the signs and the ½).',
    variant: 'fractional',
    tags: ['power-rule', 'negative-powers', 'fractional-powers'],
  });
}

// ----------------------------------------------------------------------------- level 4: expand first / x^{3/2}

function expandSquareQ(rng: RNG): Generated | null {
  // (ax + b)²/x = a²x + 2ab + b²/x
  const a = rng.pick([1, 1, 2, 2, 3]);
  const b = rng.pick([-3, -2, -1, 1, 2, 3]);
  const k = rng.pick([1, 1, 2, 3]);
  const terms: Term[] = [[a * a, 1], [2 * a * b, 0], [b * b, -1]];
  const u = a * k + b;
  return derivativeQ(rng, terms, k, {
    fTex: `\\frac{(${poly([a, b])})^{2}}{x}`,
    expanded: termsTex(terms, 'sqrt'),
    must: [
      { value: E(2 * a * u), trap: 'differentiated (ax + b)² and ignored the division by x' },
      { value: E(a * a).add(E(b * b).mul(powExact(k, -2))), trap: 'sign of the negative power: d/dx(1/x) = −1/x²' },
    ],
    extra: [
      { value: attempt(() => E(2 * a * u).div(E(k))), trap: 'divided the derivative of the numerator by x (no quotient or expansion)' },
      { value: E(a * a + 2 * a * b).sub(E(b * b).mul(powExact(k, -2))), trap: 'kept the constant 2ab when differentiating' },
    ],
    trap: 'Expand and divide through by x before differentiating; the 1/x term differentiates to −1/x².',
    variant: 'expand-square',
    tags: ['expand-first', 'negative-powers'],
  });
}

function productOverXQ(rng: RNG): Generated | null {
  // (x + a)(x + b)/x = x + (a + b) + ab/x
  const a = rng.nonZeroInt(-4, 4);
  const b = rng.nonZeroInt(-4, 4);
  if (a === b || a + b === 0) return null;
  const k = rng.pick([1, 2, 2, 3]);
  const terms: Term[] = [[1, 1], [a + b, 0], [a * b, -1]];
  return derivativeQ(rng, terms, k, {
    fTex: `\\frac{(${poly([1, a])})(${poly([1, b])})}{x}`,
    expanded: termsTex(terms, 'sqrt'),
    must: [
      { value: E(2 * k + a + b), trap: 'differentiated the numerator only and ignored the division by x' },
      { value: E(1).add(E(a * b).mul(powExact(k, -2))), trap: 'sign of the negative power: d/dx(1/x) = −1/x²' },
    ],
    extra: [
      { value: E(1 + a + b).sub(E(a * b).mul(powExact(k, -2))), trap: 'kept the constant term when differentiating' },
    ],
    trap: 'Expand and divide through by x before differentiating; the 1/x term differentiates to −1/x².',
    variant: 'product-over-x',
    tags: ['expand-first', 'negative-powers'],
  });
}

function threeHalvesQ(rng: RNG): Generated | null {
  // p x^{3/2} + q x^{1/2} at a perfect square. k = 1 is excluded: there x^{1/2} = x^{-1/2} = 1
  // and "forgot the halves", "did not lower the power" and "gave f(k)" all collapse onto each other.
  const p = rng.pick([1, 1, 2, -1, -2, 4]);
  const q = rng.pick([-8, -6, -4, -3, -2, -1, 1, 2, 3, 4, 6]);
  const k = rng.pick([4, 4, 9, 9, 16]);
  const r = Math.sqrt(k); // = √k, an integer
  const terms: Term[] = [[p, 1.5], [q, 0.5]];
  if (rng.bool(0.3)) terms.reverse();
  return derivativeQ(rng, terms, k, {
    fTex: termsTex(terms, 'index'),
    must: [{ value: dSum(terms, k, 'halfdrop'), trap: 'forgot the ½ in the powers 3/2 and 1/2' }],
    extra: [
      { value: attempt(() => frac(p * r, 2).add(frac(3 * q, 2 * r))), trap: 'swapped the halves: used ½ on the x^{3/2} term and 3/2 on the x^{1/2} term' },
      { value: attempt(() => frac(3 * p * r, 2).add(frac(q * r, 2))), trap: 'used x^{1/2} for both derivatives instead of x^{1/2} and x^{−1/2}' },
      { value: attempt(() => frac(3 * p * k, 2).add(frac(q * k, 2))), trap: 'substituted k without taking its square root' },
      { value: attempt(() => frac(3 * p * r, 2).sub(frac(q, 2 * r))), trap: `sign slip on the x^{1/2} term` },
    ],
    trap: 'x^{3/2} differentiates to (3/2)x^{1/2} and x^{1/2} to (1/2)x^{−1/2}; keep the halves and evaluate √k once.',
    variant: 'three-halves',
    tags: ['fractional-powers'],
  });
}

// ----------------------------------------------------------------------------- level 5: second derivative / repeated root of f'

function secondDerivativeQ(rng: RNG): Generated | null {
  const a = rng.pick([1, 1, 2, -1]);
  const b = rng.int(-3, 3);
  const c = rng.nonZeroInt(-5, 5);
  const d = rng.int(-6, 6);
  const e = rng.int(-6, 6);
  const k = rng.pick([-2, -1, 1, 2, 3]);
  const terms: Term[] = [[a, 4], [b, 3], [c, 2], [d, 1], [e, 0]];
  const answer = E(12 * a * k * k + 6 * b * k + 2 * c);
  if (Math.abs(answer.toNumber()) > 200) return null;
  const first = 4 * a * k ** 3 + 3 * b * k * k + 2 * c * k + d;
  const must = cleanOnly([
    { value: E(first), trap: 'differentiated once only: this is f′(k)' },
    { value: E(12 * a * k * k + 6 * b * k + c), trap: 'forgot to double the coefficient of x² on the second differentiation' },
  ]);
  const extra = cleanOnly([
    { value: E(12 * a * k * k + 6 * b * k), trap: 'lost the constant 2c that comes from the x² term' },
    { value: E(12 * a * k * k + 6 * b * k + 2 * c + d), trap: 'kept the coefficient of x when differentiating a second time' },
    { value: E(evalTerms(terms, k)), trap: 'evaluated f(k) instead of f″(k)' },
    { value: E(12 * a * k ** 3 + 6 * b * k * k + 2 * c * k), trap: 'did not lower the powers on the second differentiation' },
    { value: E(4 * a * k * k + 3 * b * k + 2 * c), trap: 'lowered the powers a second time without multiplying by them' },
  ]);
  const fTex = poly([a, b, c, d, e]);
  return {
    stem: rng.bool(0.5)
      ? `Given that $f(x) = ${fTex}$, find the value of $f''(${k})$.`
      : `$f(x) = ${fTex}$. Find $f''(${k})$.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: buildOptions(rng, answer, ranked(rng, answer, must, extra), FR),
    solution: `$f'(x) = ${poly([4 * a, 3 * b, 2 * c, d])}$ and $f''(x) = ${poly([12 * a, 6 * b, 2 * c])}$, so $f''(${k}) = ${answer.toLatex(FR)}$.`,
    trap: 'Differentiate twice: each pass multiplies by the current power and lowers it, so x⁴ → 4x³ → 12x².',
    tags: ['differentiation', 'second-derivative'],
    params: { variant: 'second', terms, k, order: 2 },
    typedAllowed: true,
  };
}

function repeatedRootQ(rng: RNG): Generated | null {
  // f'(x) = 3a(x − r)²  ⇒  f(x) = a x³ − 3a r x² + 3a r² x + d
  const a = rng.pick([1, 1, 1, 2, -1]);
  const r = rng.nonZeroInt(-4, 4);
  const d = rng.int(-9, 9);
  const terms: Term[] = [[a, 3], [-3 * a * r, 2], [3 * a * r * r, 1], [d, 0]];
  const answer = E(r);
  const fr = evalTerms(terms, r);
  const must = cleanOnly([
    { value: E(-r), trap: 'sign slip: the root of (x − r)² is x = r, not −r' },
    { value: E(2 * r), trap: 'forgot the 2 in −b/(2a) when solving the quadratic f′(x) = 0' },
  ]);
  const extra = cleanOnly([
    { value: Number.isInteger(fr) && Math.abs(fr) < 1000 ? E(fr) : null, trap: 'gave f(k) instead of k' },
    { value: E(3 * r).mulRat(E(0.5).toRat()), trap: 'used −b/(2a) on the coefficients of f itself instead of f′' },
    { value: E(3 * r), trap: 'divided by a instead of 3a' },
    { value: E(r).mulRat(E(0.5).toRat()), trap: 'halved the root' },
  ]);
  const fTex = poly(terms.map((t) => t[0]));
  return {
    stem: `Given that $f(x) = ${fTex}$, find the value of $k$ for which $f'(k) = 0$.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: buildOptions(rng, answer, ranked(rng, answer, must, extra), FR),
    solution: `$f'(x) = ${poly([3 * a, -6 * a * r, 3 * a * r * r])} = ${3 * a === 1 ? '' : 3 * a === -1 ? '-' : 3 * a}(${poly([1, -r])})^{2}$, which is zero only when $x = ${r}$.`,
    trap: 'Take out the common factor of f′ and recognise the perfect square; the repeated root is the only value of k.',
    tags: ['differentiation', 'stationary', 'perfect-square'],
    params: { variant: 'zero', terms, order: 1 },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'm2.differentiation.polynomial',
  module: 'M2',
  topic: 'differentiation',
  title: 'Differentiate and evaluate',
  levels: {
    1: "f(x) = ax² + bx + c, find f'(k)",
    2: "cubic, find f'(k)",
    3: "√x, 1/x and 1/x² terms: f(x) = 4√x + 2/x, f'(4)",
    4: '(2x + 1)²/x (expand first), or x^{3/2} − 6x^{1/2} at x = 4',
    5: "f''(k) of a quartic, or the k with f'(k) = 0 when f' is a perfect square",
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return quadraticQ(rng);
        case 2: return cubicQ(rng);
        case 3: return fractionalQ(rng);
        case 4: return pickVariant(rng, [expandSquareQ, threeHalvesQ, threeHalvesQ, productOverXQ]);
        default: return pickVariant(rng, [secondDerivativeQ, repeatedRootQ]);
      }
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const { variant, terms, k, order } = q.params as { variant: string; terms: Term[]; k?: number; order: number };
    const f = (x: number) => evalTerms(terms, x);
    const got = q.answer.value.toNumber();
    const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
    const h = 1e-6;
    const d1 = (x: number) => (f(x + h) - f(x - h)) / (2 * h);
    if (variant === 'zero') {
      // The answer is the k with f'(k) = 0: the numerical derivative vanishes there and does not change sign around it.
      const left = d1(got - 1), right = d1(got + 1);
      return Math.abs(d1(got)) < 1e-6 && left * right > 0;
    }
    if (order === 2) {
      const hh = 1e-3;
      const second = (f(k! + hh) - 2 * f(k!) + f(k! - hh)) / (hh * hh);
      return close(got, second, 1e-4);
    }
    return close(got, d1(k!), 1e-6);
  },
});
