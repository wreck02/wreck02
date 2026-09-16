import { defineTemplate, retry, type Level } from '../../core/template';
import { E, Exact } from '../../core/exact';
import { statementOptions, STATEMENT_COMBOS } from '../../core/options';
import { poly } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * "Which of the following statements are true?" about a quadratic or cubic and its derivatives.
 * Level 1: quadratics — sign of the gradient at a point, increasing / decreasing
 * Level 2: location of stationary points; decreasing for x < b
 * Level 3: nature — local minimum / maximum, turning point vs stationary point
 * Level 4: cubics with one or no stationary points (discriminant of f′): f′(x) > 0 for all x, exactly n stationary points
 * Level 5: the tangent at x = d passes through the origin; point of inflection
 *
 * Truth values are computed exactly in generate(); verify() recomputes every statement numerically
 * (central differences and grid scans) from the stored coefficients and statement specs.
 *
 * Two rules keep the eight I/II/III combinations honest.
 *  - Each statement is drawn from its own *group* of claims, and a question never takes two
 *    statements from the same group: "f′(x) > 0 for all x" and "f is increasing for all x" say the
 *    same thing about these cubics, and two "exactly n stationary points" claims exclude each other,
 *    so a candidate could rule out half the options without any calculus.
 *  - Each statement is aimed at true or false with probability ½ (`choose` looks through the group
 *    for a claim with the wanted truth value), so "none of them" is no longer the safe guess.
 * Gradient-sign claims are never probed at a stationary point, where "increasing at x" is not a
 * well-defined A-level claim.
 */

type Spec = { kind: string; x?: number; v?: number; n?: number };
/** A candidate statement plus the group it belongs to (at most one statement per group). */
type Cand = Spec & { group: string };
interface St { text: string; truth: boolean; spec: Spec }

// ----------------------------------------------------------------------------- exact polynomial helpers (coefficients highest power first)

function dCoefs(coefs: number[]): number[] {
  const n = coefs.length - 1;
  return coefs.slice(0, n).map((c, i) => c * (n - i));
}

function evalExact(coefs: number[], x: Exact): Exact {
  return coefs.reduce((acc, c) => acc.mul(x).add(E(c)), Exact.ZERO);
}

function evalNum(coefs: number[], x: number): number {
  let s = 0;
  for (const c of coefs) s = s * x + c;
  return s;
}

const xTex = (x: number) => E(x).toLatex({ format: 'fraction' });

/** The number of real roots of f′ for a quadratic or cubic f. */
function stationaryCount(coefs: number[]): number {
  if (coefs.length === 3) return 1;
  const [a, b, c] = coefs;
  const disc = 4 * b * b - 12 * a * c;
  return disc > 0 ? 2 : disc === 0 ? 1 : 0;
}

/** Exact truth of a statement, mirroring the numeric semantics in verify(). */
function truthOf(coefs: number[], s: Spec): boolean {
  const d1 = dCoefs(coefs), d2 = dCoefs(d1);
  const fp = (x: number) => evalExact(d1, E(x)).sign();
  const fpp = (x: number) => evalExact(d2, E(x)).sign();
  const f = (x: number) => evalExact(coefs, E(x));
  switch (s.kind) {
    case 'increasing-at': return fp(s.x!) > 0;
    case 'decreasing-at': return fp(s.x!) < 0;
    case 'grad-positive-at': return fp(s.x!) > 0;
    case 'grad-negative-at': return fp(s.x!) < 0;
    case 'grad-value': return evalExact(d1, E(s.x!)).equals(E(s.v!));
    case 'stationary-at': return fp(s.x!) === 0;
    case 'local-min-at': return fp(s.x!) === 0 && fpp(s.x!) > 0;
    case 'local-max-at': return fp(s.x!) === 0 && fpp(s.x!) < 0;
    case 'turning-at': return fp(s.x!) === 0 && fpp(s.x!) !== 0;
    case 'count-stationary': return stationaryCount(coefs) === s.n!;
    case 'fprime-positive-all': return coefs.length === 4 && coefs[0] > 0 && stationaryCount(coefs) === 0;
    // f is increasing where f′ ≥ 0 everywhere: a cubic with a repeated root of f′ (such as x³) is
    // increasing although f′(x) > 0 fails at that one point.
    case 'increasing-all': return coefs.length === 4 && coefs[0] > 0 && stationaryCount(coefs) <= 1;
    case 'decreasing-for-x-less': {
      // f′ < 0 on (−∞, b): quadratic with a > 0 and b ≤ vertex, or a cubic that is decreasing there (never for our cubics)
      if (coefs.length !== 3) return false;
      const [a, b] = coefs;
      return a > 0 && E(s.x!).cmp(E(-b).mulRat(E(0.5).toRat()).div(E(a))) <= 0;
    }
    case 'increasing-for-x-greater': {
      if (coefs.length !== 3) return false;
      const [a, b] = coefs;
      return a > 0 && E(s.x!).cmp(E(-b).mulRat(E(0.5).toRat()).div(E(a))) >= 0;
    }
    case 'tangent-origin': return f(s.x!).sub(E(s.x!).mul(evalExact(d1, E(s.x!)))).isZero();
    case 'inflection-at': return coefs.length === 4 && fpp(s.x!) === 0;
    default: throw new Error(`unknown statement ${s.kind}`);
  }
}

function text(s: Spec): string {
  const x = s.x !== undefined ? xTex(s.x) : '';
  switch (s.kind) {
    case 'increasing-at': return `$f$ is increasing at $x = ${x}$.`;
    case 'decreasing-at': return `$f$ is decreasing at $x = ${x}$.`;
    case 'grad-positive-at': return `The gradient of the curve $y = f(x)$ at $x = ${x}$ is positive.`;
    case 'grad-negative-at': return `The gradient of the curve $y = f(x)$ at $x = ${x}$ is negative.`;
    case 'grad-value': return `$f'(${x}) = ${s.v}$.`;
    case 'stationary-at': return `$f$ has a stationary point at $x = ${x}$.`;
    case 'local-min-at': return `$f$ has a local minimum at $x = ${x}$.`;
    case 'local-max-at': return `$f$ has a local maximum at $x = ${x}$.`;
    case 'turning-at': return `$f$ has a turning point at $x = ${x}$.`;
    case 'count-stationary': return s.n === 0 ? '$f$ has no stationary points.' : `$f$ has exactly ${s.n === 1 ? 'one stationary point' : 'two stationary points'}.`;
    case 'fprime-positive-all': return "$f'(x) > 0$ for all real $x$.";
    case 'increasing-all': return '$f$ is an increasing function for all real $x$.';
    case 'decreasing-for-x-less': return `$f$ is decreasing for all $x < ${x}$.`;
    case 'increasing-for-x-greater': return `$f$ is increasing for all $x > ${x}$.`;
    case 'tangent-origin': return `The tangent to the curve $y = f(x)$ at $x = ${x}$ passes through the origin.`;
    case 'inflection-at': return `The curve $y = f(x)$ has a point of inflection at $x = ${x}$.`;
    default: throw new Error(`unknown statement ${s.kind}`);
  }
}

function make(coefs: number[], spec: Spec): St {
  return { text: text(spec), truth: truthOf(coefs, spec), spec };
}

// ----------------------------------------------------------------------------- choosing statements

/** "Increasing at x" is not a claim the exam makes where f′(x) = 0, so never probe there. */
const SIGN_KINDS = new Set(['increasing-at', 'decreasing-at', 'grad-positive-at', 'grad-negative-at']);

function usable(coefs: number[], c: Cand): boolean {
  if (c.x !== undefined && !Number.isFinite(c.x)) return false;
  if (SIGN_KINDS.has(c.kind) && c.x !== undefined && evalExact(dCoefs(coefs), E(c.x)).isZero()) return false;
  return true;
}

const spec = (c: Cand): Spec => {
  const s: Spec = { kind: c.kind };
  if (c.x !== undefined) s.x = c.x;
  if (c.v !== undefined) s.v = c.v;
  if (c.n !== undefined) s.n = c.n;
  return s;
};

/** Pick a claim from one group, preferring one whose truth value is the one asked for. */
function choose(rng: RNG, coefs: number[], pool: Cand[], want: boolean): St | null {
  const ok = pool.filter((c) => usable(coefs, c));
  if (!ok.length) return null;
  const match = ok.filter((c) => truthOf(coefs, spec(c)) === want);
  return make(coefs, spec(rng.pick(match.length ? match : ok)));
}

/** Three statements from three different groups, each independently true or false with probability ½. */
function build(rng: RNG, coefs: number[], groups: Cand[][]): { coefs: number[]; sts: St[] } | null {
  const usableGroups = groups.filter((g) => g.some((c) => usable(coefs, c)));
  if (usableGroups.length < 3) return null;
  const picked = rng.shuffle(usableGroups).slice(0, 3);
  const sts: St[] = [];
  for (const pool of picked) {
    const st = choose(rng, coefs, pool, rng.bool(0.5));
    if (!st) return null;
    sts.push(st);
  }
  if (new Set(sts.map((s) => s.text)).size < 3) return null;
  return { coefs, sts };
}

const at = (kinds: string[], xs: number[], group: string): Cand[] =>
  xs.flatMap((x) => kinds.map((kind) => ({ kind, x, group })));

// ----------------------------------------------------------------------------- random curves

/** Quadratic with an integer (or half-integer) vertex. */
function quadratic(rng: RNG): { coefs: number[]; xv: number } {
  const a = rng.pick([1, 1, 2, -1, -2, 3]);
  const xv = rng.bool(0.25) ? rng.pick([-3, -1, 1, 3]) / 2 : rng.int(-3, 3);
  return { coefs: [a, -2 * a * xv, rng.int(-6, 6)], xv };
}

/** Cubic whose derivative is 3a(x − r1)(x − r2) with integer r1 < r2 (or a repeated root when r1 = r2). */
function cubicTwo(rng: RNG, allowRepeated = false): { coefs: number[]; r1: number; r2: number } | null {
  const a = rng.pick([1, 1, 2, -1]);
  let r1 = rng.int(-3, 3), r2 = rng.int(-3, 3);
  if (r1 > r2) [r1, r2] = [r2, r1];
  if (r1 === r2 && !allowRepeated) return null;
  const sum = r1 + r2;
  if ((3 * a * sum) % 2 !== 0) return null;
  const coefs = [a, -(3 * a * sum) / 2, 3 * a * r1 * r2, rng.int(-6, 6)];
  if (Math.abs(coefs[1]) > 12 || Math.abs(coefs[2]) > 30) return null;
  return { coefs, r1, r2 };
}

/** Cubic with no stationary points (discriminant of f′ negative). */
function cubicNone(rng: RNG): number[] | null {
  const a = rng.pick([1, 1, -1, 2]);
  const b = rng.int(-3, 3);
  const c = rng.int(-8, 8);
  if (4 * b * b - 12 * a * c >= 0) return null;
  return [a, b, c, rng.int(-5, 5)];
}

/** Cubic with exactly one stationary point (a repeated root of f′ at x = r). */
function cubicOne(rng: RNG): { coefs: number[]; r: number } {
  const a = rng.pick([1, 1, -1, 2]);
  const r = rng.int(-2, 2);
  return { coefs: [a, -3 * a * r, 3 * a * r * r, rng.int(-5, 5)], r };
}

// ----------------------------------------------------------------------------- level builders

function pickDistinctX(rng: RNG, pool: number[], n: number): number[] | null {
  const uniq = [...new Set(pool)];
  return uniq.length >= n ? rng.pickDistinct(uniq, n) : null;
}

/** Candidates for "f′(k) = v": the true value half the time, a plausible wrong one otherwise. */
function gradValueCands(coefs: number[], x: number, group: string): Cand[] {
  if (!Number.isInteger(x)) return [];
  const d1 = dCoefs(coefs);
  const trueV = evalNum(d1, x);
  if (!Number.isInteger(trueV)) return [];
  const wrong = [evalNum(coefs, x), coefs[0] * x + coefs[1], trueV + coefs[1], -trueV, trueV + 2]
    .filter((v) => Number.isInteger(v) && v !== trueV);
  return [
    { kind: 'grad-value', x, v: trueV, group },
    ...wrong.slice(0, 2).map((v) => ({ kind: 'grad-value', x, v, group })),
  ];
}

function level1(rng: RNG): { coefs: number[]; sts: St[] } | null {
  const { coefs, xv } = quadratic(rng);
  const xs = pickDistinctX(rng, [xv - 3, xv - 2, xv - 1, xv, xv + 1, xv + 2, xv + 3].filter(Number.isInteger), 3);
  if (!xs) return null;
  const groups = xs.map((x, i) => [
    ...at(['increasing-at', 'decreasing-at', 'grad-positive-at', 'grad-negative-at'], [x], `p${i}`),
    ...(i === 2 ? gradValueCands(coefs, x, `p${i}`) : []),
  ]);
  return build(rng, coefs, groups);
}

function level2(rng: RNG): { coefs: number[]; sts: St[] } | null {
  if (rng.bool(0.55)) {
    const { coefs, xv } = quadratic(rng);
    const a = coefs[0];
    const probe = rng.pick([xv + 1, xv - 1, xv + 2, xv - 2]);
    const groups: Cand[][] = [
      at(['stationary-at'], [xv, -xv, xv + 1, xv - 1, 2 * xv], 'stat'),
      a > 0
        ? at(['decreasing-for-x-less', 'increasing-for-x-greater'], [xv, xv + 1, xv - 1, xv + 2, xv - 2], 'half')
        : at(['increasing-at', 'decreasing-at'], [xv + 1, xv - 1, xv + 2, xv - 2], 'half'),
      [
        ...at(['grad-negative-at', 'grad-positive-at', 'increasing-at'], [probe], 'point'),
        ...gradValueCands(coefs, probe, 'point'),
      ],
    ];
    return build(rng, coefs, groups);
  }
  const cu = cubicTwo(rng);
  if (!cu) return null;
  const { coefs, r1, r2 } = cu;
  const mid = (r1 + r2) / 2;
  const groups: Cand[][] = [
    at(['stationary-at'], [r1, -r1, mid, r1 + 1], 'stat1'),
    at(['stationary-at'], [r2, -r2, r2 + 1, r1 - 1], 'stat2'),
    at(['increasing-at', 'decreasing-at', 'grad-negative-at'], [mid, r1 - 1, r2 + 1], 'point'),
  ];
  return build(rng, coefs, groups);
}

function level3(rng: RNG): { coefs: number[]; sts: St[] } | null {
  if (rng.bool(0.35)) {
    const { coefs, xv } = quadratic(rng);
    const groups: Cand[][] = [
      at(['local-min-at', 'local-max-at'], [xv, -xv, xv + 1], 'nature'),
      at(['turning-at', 'stationary-at'], [xv, -xv, xv - 1], 'turning'),
      [
        ...at(['local-min-at', 'local-max-at', 'grad-negative-at', 'increasing-at'], [xv + 2, xv - 2], 'away'),
      ],
    ];
    return build(rng, coefs, groups);
  }
  const cu = cubicTwo(rng, true);
  if (!cu) return null;
  const { coefs, r1, r2 } = cu;
  const mid = (r1 + r2) / 2;
  // At a stationary point the claim can be true or false depending on the nature; away from one only
  // the gradient-sign claims can be true, so every group can supply a true statement.
  const nature = ['local-min-at', 'local-max-at', 'turning-at', 'stationary-at'];
  const away = ['turning-at', 'stationary-at', 'increasing-at', 'decreasing-at'];
  const groups: Cand[][] = [
    at(nature, [r1], 'first'),
    r1 === r2 ? at(away, [r1 + 1], 'second') : at(nature, [r2], 'second'),
    at(away, r1 === r2 ? [r1 - 1, r1 + 2] : [mid, r1 - 1, r2 + 1], 'other'),
  ];
  return build(rng, coefs, groups);
}

function level4(rng: RNG): { coefs: number[]; sts: St[] } | null {
  const which = rng.weighted(['none', 'one', 'two'], [4, 3, 2]);
  let coefs: number[];
  let probes: number[];
  if (which === 'none') { const c = cubicNone(rng); if (!c) return null; coefs = c; probes = [rng.int(-2, 2), rng.int(-2, 2)]; }
  else if (which === 'one') { const c = cubicOne(rng); coefs = c.coefs; probes = [c.r, c.r + 1, c.r - 1]; }
  else { const c = cubicTwo(rng); if (!c) return null; coefs = c.coefs; probes = [c.r1, c.r2, (c.r1 + c.r2) / 2, c.r1 - 1]; }
  const infl = -coefs[1] / (3 * coefs[0]); // f'' = 0 there
  const groups: Cand[][] = [
    // how many stationary points: at most one such claim, or two of them would exclude each other
    [0, 1, 2].map((n) => ({ kind: 'count-stationary', n, group: 'count' })),
    // "f′ > 0 everywhere" and "f is increasing everywhere" say the same thing about a cubic with no
    // stationary point, so they share a group and never appear together
    [{ kind: 'fprime-positive-all', group: 'monotone' }, { kind: 'increasing-all', group: 'monotone' }],
    at(['increasing-at', 'grad-negative-at', 'stationary-at'], probes, 'point'),
    Number.isInteger(infl) || Number.isInteger(2 * infl)
      ? at(['inflection-at'], [infl, infl + 1, infl - 1], 'inflection')
      : [],
    gradValueCands(coefs, probes[0], 'grad'),
  ];
  return build(rng, coefs, groups);
}

function level5(rng: RNG): { coefs: number[]; sts: St[] } | null {
  const cu = cubicTwo(rng, true);
  if (!cu) return null;
  const { r1, r2 } = cu;
  const coefs = cu.coefs.slice();
  const [a, b] = coefs;
  // Tangent at x = d through the origin  ⇔  e = 2a d³ + b d² (the constant term). Make it true half the time.
  const d = rng.pick([-2, -1, 1, 2]);
  if (rng.bool(0.5)) {
    const e = 2 * a * d ** 3 + b * d * d;
    if (Math.abs(e) > 20) return null;
    coefs[3] = e;
  } else if (coefs[3] === 2 * a * d ** 3 + b * d * d) return null;
  const infl = (r1 + r2) / 2; // f'' = 0 at the midpoint of the stationary points
  const groups: Cand[][] = [
    [{ kind: 'tangent-origin', x: d, group: 'tangent' }],
    at(['inflection-at'], [infl, r1 === infl ? infl + 1 : r1, r2 === infl ? infl - 1 : r2, infl + 1], 'inflection'),
    at(r1 === r2 ? ['turning-at', 'stationary-at', 'local-min-at'] : ['local-max-at', 'local-min-at', 'turning-at'],
      r1 === r2 ? [r1, r1 + 1] : [r1, r2, infl], 'nature'),
  ];
  return build(rng, coefs, groups);
}

// ----------------------------------------------------------------------------- numeric truth for verify()

const H = 1e-6;

function numericTruth(coefs: number[], s: Spec): boolean {
  const f = (x: number) => evalNum(coefs, x);
  const d1 = (x: number) => (f(x + H) - f(x - H)) / (2 * H);
  const d2 = (x: number, h = 1e-3) => (f(x + h) - 2 * f(x) + f(x - h)) / (h * h);
  const isZero = (v: number) => Math.abs(v) < 1e-6;
  /**
   * Roots of f′ on [−20, 20] by a sign scan. Values below 1e-6 are treated as zero (rounding noise), a change of
   * sign across them is one crossing, and a touch without a sign change (double root) counts once.
   */
  const roots = (): number => {
    let count = 0, lastSign = 0, sawZero = false, minAbs = Infinity;
    for (let x = -20; x <= 20 + 1e-9; x += 0.01) {
      const v = d1(x);
      minAbs = Math.min(minAbs, Math.abs(v));
      if (Math.abs(v) < 1e-6) { sawZero = true; continue; }
      const sgn = v > 0 ? 1 : -1;
      if (lastSign !== 0 && (sgn !== lastSign || sawZero)) count++;
      sawZero = false;
      lastSign = sgn;
    }
    return count > 0 ? count : minAbs < 1e-3 ? 1 : 0;
  };
  const minDeriv = (): number => {
    let m = Infinity;
    for (let x = -20; x <= 20; x += 0.01) m = Math.min(m, d1(x));
    return m;
  };
  switch (s.kind) {
    // Non-zero gradients at the (half-)integer probes are at least 1/4 in size, so 1e-6 separates them from rounding noise.
    case 'increasing-at': case 'grad-positive-at': return d1(s.x!) > 1e-6;
    case 'decreasing-at': case 'grad-negative-at': return d1(s.x!) < -1e-6;
    case 'grad-value': return Math.abs(d1(s.x!) - s.v!) < 1e-6;
    case 'stationary-at': return isZero(d1(s.x!));
    case 'local-min-at': return isZero(d1(s.x!)) && d2(s.x!) > 1e-4;
    case 'local-max-at': return isZero(d1(s.x!)) && d2(s.x!) < -1e-4;
    case 'turning-at': return isZero(d1(s.x!)) && d1(s.x! - 0.01) * d1(s.x! + 0.01) < 0;
    case 'count-stationary': return roots() === s.n!;
    case 'fprime-positive-all': return minDeriv() > 1e-3;
    // "increasing" is checked on f itself, not on f′: at a stationary point of inflection the central
    // difference is zero to within rounding noise, but f(x + δ) − f(x) is safely positive.
    case 'increasing-all': {
      for (let x = -20; x < 20; x += 0.05) if (f(x + 0.05) < f(x) - 1e-9) return false;
      return true;
    }
    case 'decreasing-for-x-less': {
      for (let x = s.x! - 0.001; x > s.x! - 25; x -= 0.25) if (d1(x) >= 0) return false;
      return true;
    }
    case 'increasing-for-x-greater': {
      for (let x = s.x! + 0.001; x < s.x! + 25; x += 0.25) if (d1(x) <= 0) return false;
      return true;
    }
    case 'tangent-origin': return isZero(f(s.x!) - s.x! * d1(s.x!));
    case 'inflection-at': return Math.abs(d2(s.x!)) < 1e-4 && d2(s.x! - 0.1) * d2(s.x! + 0.1) < 0;
    default: return false;
  }
}

function comboText(truth: boolean[]): string {
  const names = ['I', 'II', 'III'].filter((_, i) => truth[i]);
  if (names.length === 0) return 'none of them';
  if (names.length === 3) return 'I, II and III';
  if (names.length === 1) return `${names[0]} only`;
  return `${names[0]} and ${names[1]} only`;
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'm2.differentiation.which-statements-graphs',
  module: 'M2',
  topic: 'differentiation',
  title: 'Which statements are true (curves & derivatives)',
  levels: {
    1: 'quadratics: sign of the gradient, increasing / decreasing at a point',
    2: 'location of stationary points; decreasing for x < b',
    3: 'nature: local minimum / maximum, turning point vs stationary point',
    4: 'cubics with one or no stationary points: f′(x) > 0 for all x, exactly n stationary points',
    5: 'tangent through the origin; point of inflection',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      const built = level === 1 ? level1(rng) : level === 2 ? level2(rng) : level === 3 ? level3(rng) : level === 4 ? level4(rng) : level5(rng);
      if (!built) return null;
      const { coefs, sts } = built;
      const truth = sts.map((s) => s.truth) as [boolean, boolean, boolean];
      const options = statementOptions(truth);
      const correct = options.find((o) => o.correct)!.display;
      const d1 = dCoefs(coefs);
      const stem = `$f(x) = ${poly(coefs)}$.\n\nWhich of the following statements are true?\n\nI. ${sts[0].text}\nII. ${sts[1].text}\nIII. ${sts[2].text}`;
      const solution = `$f'(x) = ${poly(d1)}$${coefs.length === 4 ? ` and $f''(x) = ${poly(dCoefs(d1))}$` : ''}. ` +
        sts.map((s, i) => `${['I', 'II', 'III'][i]}: ${s.truth ? 'true' : 'false'}`).join('; ') + '.';
      return {
        stem,
        answer: { kind: 'choice' as const, value: correct },
        options,
        solution,
        trap: '“Increasing” is about the sign of f′, not of f; a stationary point of inflection is stationary but not a turning point; and f″ decides the nature only after f′ = 0 is checked.',
        tags: ['differentiation', 'statements', 'graphs'],
        params: { coefs, specs: sts.map((s) => s.spec), truth },
        typedAllowed: false,
      };
    });
  },
  verify(q) {
    if (q.answer.kind !== 'choice') return false;
    const { coefs, specs } = q.params as { coefs: number[]; specs: Spec[] };
    // Recompute every statement numerically from the raw coefficients and rebuild the option text.
    const truth = specs.map((s) => numericTruth(coefs, s));
    const expected = comboText(truth);
    return STATEMENT_COMBOS.includes(expected) && q.answer.value === expected && q.options.filter((o) => o.correct).length === 1;
  },
});
