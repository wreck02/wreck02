import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { exactSin, exactCos } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Trig identities: sin²θ + cos²θ = 1 and tan θ = sin θ / cos θ.
 * Level 1: sin θ = 3/5 with θ acute → cos θ = 4/5 or tan θ = 3/4 (Pythagorean triples)
 * Level 2: tan θ = 2 → sin²θ = 4/5
 * Level 3: θ obtuse: sin θ = 5/13 → cos θ = −12/13
 * Level 4: evaluate 1 − 2sin²30°, k(sin²A + cos²A), 3sinθ = 4cosθ → tan θ, and simplifying an expression
 * Level 5: sin θ + cos θ = k → sin θ cos θ = (k² − 1)/2; tan θ = 3/4 in the third quadrant → sin θ
 */

const FRACTION = { format: 'fraction' as const };
const tx = (x: Exact): string => x.toLatex(FRACTION);
/** Bracket a negative value so "1 + 2 × −3/8" reads properly. */
const br = (x: Exact): string => (x.sign() < 0 ? `\\left(${tx(x)}\\right)` : tx(x));

/** Primitive Pythagorean triples (opposite, adjacent, hypotenuse). */
const TRIPLES: [number, number, number][] = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29]];

type Fn = 'sin' | 'cos' | 'tan';
const NAME: Record<Fn, string> = { sin: '\\sin\\theta', cos: '\\cos\\theta', tan: '\\tan\\theta' };

function attempt(f: () => Exact): Exact | null {
  try {
    const v = f();
    return Number.isFinite(v.toNumber()) ? v : null;
  } catch {
    return null;
  }
}

function cleanOnly(ds: { value: Exact | null; trap: string }[], range?: [number, number]): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } => {
    if (d.value === null || !Number.isFinite(d.value.toNumber()) || !isCleanExact(d.value).ok) return false;
    if (!range) return true;
    const v = d.value.toNumber();
    return v > range[0] && v < range[1];
  });
}

/**
 * Choose the distractors that go to buildOptions: every distinct `must` candidate (the spec-named traps)
 * is used before any `extra` one, so the headline mistakes are never shuffled out by weaker ones.
 */
function ranked(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], count = 4): Distractor[] {
  const seen: Exact[] = [answer];
  const out: Distractor[] = [];
  const take = (d: Distractor) => {
    if (out.length >= count || !Number.isFinite(d.value.toNumber()) || seen.some((s) => s.equals(d.value))) return;
    seen.push(d.value);
    out.push(d);
  };
  must.forEach(take);
  rng.shuffle(extra).forEach(take);
  return out;
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

const options = (rng: RNG, answer: Exact, ds: Distractor[]) => buildOptions(rng, answer, ds, FRACTION);

// ----------------------------------------------------------------------------- levels 1, 3, 5: a triple with a quadrant

interface Quad { id: 1 | 2 | 3 | 4; words: string; sinSign: 1 | -1; cosSign: 1 | -1 }
const QUADRANTS: Record<number, Quad> = {
  1: { id: 1, words: '$\\theta$ is acute', sinSign: 1, cosSign: 1 },
  2: { id: 2, words: '$\\theta$ is obtuse', sinSign: 1, cosSign: -1 },
  3: { id: 3, words: '$180^{\\circ} < \\theta < 270^{\\circ}$', sinSign: -1, cosSign: -1 },
  4: { id: 4, words: '$270^{\\circ} < \\theta < 360^{\\circ}$', sinSign: -1, cosSign: 1 },
};

function triangleQ(rng: RNG, quadId: 1 | 2 | 3 | 4): Generated | null {
  const q = QUADRANTS[quadId];
  const [o, a, h] = rng.pick(TRIPLES);
  // The triple either way round, so sin = 3/5 and sin = 4/5 both occur.
  const [opp, adj] = rng.bool() ? [o, a] : [a, o];
  const s = frac(opp * q.sinSign, h);
  const c = frac(adj * q.cosSign, h);
  const t = frac(opp * q.sinSign * q.cosSign, adj); // tan = sin/cos
  const vals: Record<Fn, Exact> = { sin: s, cos: c, tan: t };
  const given = rng.pick(['sin', 'cos', 'tan'] as Fn[]);
  const want = rng.pick((['sin', 'cos', 'tan'] as Fn[]).filter((f) => f !== given));
  const answer = vals[want];
  if (!isCleanExact(answer).ok) return null;
  const gv = vals[given];
  const must: { value: Exact | null; trap: string }[] = [
    { value: answer.neg(), trap: `wrong sign for the quadrant: ${quadId === 1 ? 'both are positive here' : 'check which of sin and cos is negative'}` },
    { value: attempt(() => gv.inv()), trap: 'inverted the given fraction' },
    { value: vals[(['sin', 'cos', 'tan'] as Fn[]).find((f) => f !== given && f !== want)!], trap: 'found the third ratio instead of the one asked for' },
  ];
  if (given !== 'tan' && want !== 'tan') {
    must.push({ value: E(1).sub(gv.abs()), trap: 'used $1 - \\sin\\theta$ instead of $1 - \\sin^{2}\\theta$' });
    must.push({ value: attempt(() => E(1).sub(gv.mul(gv))), trap: 'stopped at $1 - \\sin^{2}\\theta$ and forgot the square root' });
  } else if (want === 'tan') {
    must.push({ value: attempt(() => vals[want].inv()), trap: 'used $\\tan\\theta = \\cos\\theta / \\sin\\theta$' });
  }
  const extra = [
    { value: answer.abs().equals(answer) ? answer.abs().neg() : answer.abs(), trap: 'sign dropped' },
    { value: attempt(() => vals[want].neg().inv()), trap: 'inverted and mis-signed' },
    { value: frac(opp, adj + 1), trap: 'arithmetic slip in the third side' },
    { value: frac(adj, h), trap: 'read the wrong side off the triangle' },
    { value: frac(opp, h), trap: 'read the wrong side off the triangle' },
  ];
  return {
    stem: `Given that $${NAME[given]} = ${tx(gv)}$ and ${q.words}, find the exact value of $${NAME[want]}$.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: options(rng, answer, ranked(rng, answer, cleanOnly(must), cleanOnly(extra))),
    solution: `A right-angled triangle with sides $${opp}$, $${adj}$, $${h}$ gives $${NAME[want]} = \\pm${tx(answer.abs())}$; in this quadrant $\\${want}\\theta$ is ${answer.sign() > 0 ? 'positive' : 'negative'}, so $${NAME[want]} = ${tx(answer)}$.`,
    trap: 'Get the size from the 3-4-5 style triangle, then the sign from the quadrant.',
    tags: ['trig', 'identities', 'pythagoras'],
    params: { variant: 'given', s: s.toNumber(), c: c.toNumber(), want },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 2: tan θ → sin²θ

function tanSquareQ(rng: RNG): Generated | null {
  const [n, d] = rng.pick([[2, 1], [3, 1], [1, 2], [1, 3], [3, 2], [4, 3], [5, 12], [12, 5]]);
  const t = frac(n, d);
  const want = rng.bool() ? 'sin2' : 'cos2';
  const den = n * n + d * d;
  const answer = want === 'sin2' ? frac(n * n, den) : frac(d * d, den);
  if (!isCleanExact(answer).ok) return null;
  const other = want === 'sin2' ? frac(d * d, den) : frac(n * n, den);
  const distractors = ranked(rng, answer, cleanOnly([
    { value: other, trap: `gave $\\${want === 'sin2' ? 'cos' : 'sin'}^{2}\\theta$ instead` },
    { value: attempt(() => answer.powRat(frac(1, 2).toRat())), trap: `gave $\\${want === 'sin2' ? 'sin' : 'cos'}\\theta$, not its square` },
    { value: frac(want === 'sin2' ? n : d, den), trap: 'forgot to square the numerator' },
    { value: frac(want === 'sin2' ? n * n : d * d, (n + d) * (n + d)), trap: 'used $(1 + \\tan\\theta)^{2}$ in the denominator' },
  ], [0, 1]), cleanOnly([
    { value: frac(n, n + d), trap: 'treated the ratio as a probability-style share' },
    { value: frac(d, n + d), trap: 'treated the ratio as a probability-style share' },
    { value: frac(want === 'sin2' ? n * n : d * d, n * d), trap: 'divided by $\\tan\\theta$ instead of $1 + \\tan^{2}\\theta$' },
  ], [0, 1]));
  return {
    stem: `Given that $\\tan\\theta = ${tx(t)}$ and $\\theta$ is acute, find the exact value of $\\${want === 'sin2' ? 'sin' : 'cos'}^{2}\\theta$.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: options(rng, answer, distractors),
    solution: `$\\tan\\theta = ${tx(t)}$ means a right-angled triangle with opposite $${n}$ and adjacent $${d}$, so the hypotenuse squared is $${n * n} + ${d * d} = ${den}$ and $\\${want === 'sin2' ? 'sin' : 'cos'}^{2}\\theta = ${tx(answer)}$.`,
    trap: 'sin²θ = tan²θ/(1 + tan²θ): the denominator is 1 + tan²θ, not (1 + tan θ)².',
    tags: ['trig', 'identities', 'tan'],
    params: { variant: 'tan-square', n, d, square: want },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 4

const DOUBLE_FORMS = [
  { id: '1-2s2', tex: (A: number) => `1 - 2\\sin^{2} ${A}^{\\circ}`, fl: (A: number) => 1 - 2 * Math.sin((A * Math.PI) / 180) ** 2 },
  { id: '2c2-1', tex: (A: number) => `2\\cos^{2} ${A}^{\\circ} - 1`, fl: (A: number) => 2 * Math.cos((A * Math.PI) / 180) ** 2 - 1 },
  { id: 'c2-s2', tex: (A: number) => `\\cos^{2} ${A}^{\\circ} - \\sin^{2} ${A}^{\\circ}`, fl: (A: number) => Math.cos((A * Math.PI) / 180) ** 2 - Math.sin((A * Math.PI) / 180) ** 2 },
];

/** cos / sin of a standard angle, exactly (null when the angle is not a multiple of 30° or 45°). */
const cosExact = (deg: number): Exact | null => attempt(() => exactCos(deg));
const sinExact = (deg: number): Exact | null => attempt(() => exactSin(deg));

function doubleAngleQ(rng: RNG): Generated | null {
  const A = rng.pick([15, 30, 60, 75]);
  const form = rng.pick(DOUBLE_FORMS);
  const answer = cosExact(2 * A);
  if (!answer || answer.isZero() || !isCleanExact(answer).ok) return null;
  const sin2A = sinExact(2 * A);
  const distractors = ranked(rng, answer, cleanOnly([
    { value: answer.neg(), trap: 'sign error: this is $\\cos 2\\theta$, not $-\\cos 2\\theta$' },
    { value: sin2A, trap: `gave $\\sin ${2 * A}^{\\circ}$ instead of $\\cos ${2 * A}^{\\circ}$` },
    { value: cosExact(A), trap: 'forgot to double the angle' },
    { value: attempt(() => answer.mul(E(2))), trap: 'doubled the value instead of the angle' },
  ]), cleanOnly([
    { value: cosExact(90 - A), trap: 'sin and cos swapped' },
    { value: E(1), trap: 'used $\\sin^{2} + \\cos^{2} = 1$ on the wrong expression' },
    { value: attempt(() => answer.mul(frac(1, 2))), trap: 'halved the value' },
  ]));
  return {
    stem: `Find the exact value of $${form.tex(A)}$.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: options(rng, answer, distractors),
    solution: `Each of these is $\\cos 2\\theta$ with $\\theta = ${A}^{\\circ}$, so the value is $\\cos ${2 * A}^{\\circ} = ${tx(answer)}$.`,
    trap: 'Recognise cos 2θ: the angle doubles, the value does not.',
    tags: ['trig', 'identities', 'double-angle'],
    params: { variant: 'double', A, form: form.id },
    typedAllowed: true,
  };
}

function pythagQ(rng: RNG): Generated | null {
  const A = rng.pick([12, 17, 23, 38, 41, 52, 64, 71, 83]);
  const k = rng.int(2, 9);
  const answer = E(k);
  const distractors = ranked(rng, answer, cleanOnly([
    { value: E(2 * k), trap: 'added the two squared terms as if each were 1' },
    { value: E(1), trap: 'quoted $\\sin^{2} + \\cos^{2} = 1$ and ignored the factor' },
    { value: E(k * k), trap: 'squared the factor as well' },
    { value: frac(k, 2), trap: 'halved the factor' },
  ]), cleanOnly([
    { value: E(k + 1), trap: 'slip of one' },
    { value: frac(k, A), trap: 'divided by the angle' },
    { value: E(k).mul(E(2)).add(E(1)), trap: 'muddled the identity' },
  ]));
  return {
    stem: `Find the exact value of $${k}\\sin^{2} ${A}^{\\circ} + ${k}\\cos^{2} ${A}^{\\circ}$.`,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, distractors),
    solution: `Factorise: $${k}(\\sin^{2} ${A}^{\\circ} + \\cos^{2} ${A}^{\\circ}) = ${k} \\times 1 = ${k}$.`,
    trap: 'sin²θ + cos²θ = 1 for every angle — no calculator needed, whatever the angle is.',
    tags: ['trig', 'identities', 'pythagoras'],
    params: { variant: 'pythag', A, k },
    typedAllowed: true,
  };
}

function ratioQ(rng: RNG): Generated | null {
  const a = rng.int(2, 9);
  const b = rng.int(2, 9);
  if (a === b) return null;
  const answer = frac(b, a);
  if (!isCleanExact(answer).ok) return null;
  const distractors = ranked(rng, answer, cleanOnly([
    { value: frac(a, b), trap: 'wrote $\\tan\\theta = \\cos\\theta/\\sin\\theta$ (upside down)' },
    { value: answer.neg(), trap: 'sign error when dividing' },
    { value: E(a * b), trap: 'multiplied the two coefficients' },
    { value: frac(b - a, a), trap: 'subtracted instead of dividing' },
  ]), cleanOnly([
    { value: frac(b, a).mul(frac(b, a)), trap: 'gave $\\tan^{2}\\theta$' },
    { value: frac(b, a + b), trap: 'divided by the sum of the coefficients' },
    { value: E(a + b), trap: 'added the coefficients' },
  ]));
  return {
    stem: `Given that $${a}\\sin\\theta = ${b}\\cos\\theta$, find the exact value of $\\tan\\theta$.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: options(rng, answer, distractors),
    solution: `Divide both sides by $${a}\\cos\\theta$: $\\tan\\theta = \\frac{${b}}{${a}}${`\\frac{${b}}{${a}}` === tx(answer) ? '' : ` = ${tx(answer)}`}$.`,
    trap: 'tan θ = sin θ / cos θ, so the coefficient of cos ends up on top.',
    tags: ['trig', 'identities', 'tan'],
    params: { variant: 'ratio', a, b },
    typedAllowed: true,
  };
}

// --- simplify an expression (choice) ---------------------------------------------

interface Cand { id: string; tex: string; fl: (t: number) => number }
const CANDS: Cand[] = [
  { id: 'tan', tex: '\\tan\\theta', fl: (t) => Math.tan(t) },
  { id: 'cot', tex: '\\frac{1}{\\tan\\theta}', fl: (t) => 1 / Math.tan(t) },
  { id: 'tan2', tex: '\\tan^{2}\\theta', fl: (t) => Math.tan(t) ** 2 },
  { id: 'sincos', tex: '\\sin\\theta\\cos\\theta', fl: (t) => Math.sin(t) * Math.cos(t) },
  { id: 'sin', tex: '\\sin\\theta', fl: (t) => Math.sin(t) },
  { id: 'cos', tex: '\\cos\\theta', fl: (t) => Math.cos(t) },
  { id: 'sec', tex: '\\frac{1}{\\cos\\theta}', fl: (t) => 1 / Math.cos(t) },
  { id: 'cosec', tex: '\\frac{1}{\\sin\\theta}', fl: (t) => 1 / Math.sin(t) },
  { id: 'one', tex: '1', fl: () => 1 },
  { id: 'sin2', tex: '\\sin^{2}\\theta', fl: (t) => Math.sin(t) ** 2 },
  { id: 'cos2', tex: '\\cos^{2}\\theta', fl: (t) => Math.cos(t) ** 2 },
];
const CAND_BY_ID: Record<string, Cand> = Object.fromEntries(CANDS.map((c) => [c.id, c]));

interface SimplifyExpr { id: string; tex: string; ans: string; fl: (t: number) => number }
const SIMPLIFY: SimplifyExpr[] = [
  { id: 's1', tex: '\\frac{1 - \\cos^{2}\\theta}{\\sin\\theta\\cos\\theta}', ans: 'tan', fl: (t) => (1 - Math.cos(t) ** 2) / (Math.sin(t) * Math.cos(t)) },
  { id: 's2', tex: '\\frac{1 - \\sin^{2}\\theta}{\\sin\\theta\\cos\\theta}', ans: 'cot', fl: (t) => (1 - Math.sin(t) ** 2) / (Math.sin(t) * Math.cos(t)) },
  { id: 's3', tex: '\\frac{1 - \\cos^{2}\\theta}{\\cos^{2}\\theta}', ans: 'tan2', fl: (t) => (1 - Math.cos(t) ** 2) / Math.cos(t) ** 2 },
  { id: 's4', tex: '\\sin\\theta\\tan\\theta + \\cos\\theta', ans: 'sec', fl: (t) => Math.sin(t) * Math.tan(t) + Math.cos(t) },
  { id: 's5', tex: '(\\sin\\theta + \\cos\\theta)^{2} - 2\\sin\\theta\\cos\\theta', ans: 'one', fl: (t) => (Math.sin(t) + Math.cos(t)) ** 2 - 2 * Math.sin(t) * Math.cos(t) },
  { id: 's6', tex: '\\frac{\\sin\\theta}{\\tan\\theta}', ans: 'cos', fl: (t) => Math.sin(t) / Math.tan(t) },
  { id: 's7', tex: '\\tan\\theta\\cos\\theta', ans: 'sin', fl: (t) => Math.tan(t) * Math.cos(t) },
  { id: 's8', tex: '\\frac{1}{1 + \\tan^{2}\\theta}', ans: 'cos2', fl: (t) => 1 / (1 + Math.tan(t) ** 2) },
  { id: 's9', tex: '\\frac{1 - \\sin^{2}\\theta}{\\cos\\theta}', ans: 'cos', fl: (t) => (1 - Math.sin(t) ** 2) / Math.cos(t) },
];
const SIMPLIFY_BY_ID: Record<string, SimplifyExpr> = Object.fromEntries(SIMPLIFY.map((s) => [s.id, s]));

const TEST_ANGLES = [0.3, 0.7, 1.1, 2.3, 4.0];

function agrees(f: (t: number) => number, g: (t: number) => number): boolean {
  return TEST_ANGLES.every((t) => {
    const a = f(t), b = g(t);
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a));
  });
}

const SIMPLIFY_TRAPS: Record<string, string> = {
  tan: 'wrote sin θ / cos θ upside down',
  cot: 'wrote sin θ / cos θ upside down',
  sin: 'cancelled sin and cos the wrong way round',
  cos: 'cancelled sin and cos the wrong way round',
  one: 'expanded the bracket wrongly',
  sin2: 'used 1 − cos θ instead of 1 − cos²θ',
  cos2: 'used 1 − sin θ instead of 1 − sin²θ',
};

function simplifyQ(rng: RNG): Generated | null {
  const e = rng.pick(SIMPLIFY);
  const correct = CAND_BY_ID[e.ans];
  const wrong = rng.shuffle(CANDS.filter((c) => c.id !== correct.id && !agrees(c.fl, e.fl)))
    .slice(0, 4)
    .map((c) => ({ display: `$${c.tex}$`, trap: SIMPLIFY_TRAPS[c.id] ?? 'a plausible but different expression' }));
  if (wrong.length < 4) return null;
  return {
    stem: `Simplify $${e.tex}$.`,
    answer: { kind: 'choice', value: `$${correct.tex}$` },
    options: buildChoiceOptions(rng, `$${correct.tex}$`, wrong),
    solution: `Use $\\sin^{2}\\theta + \\cos^{2}\\theta = 1$ and $\\tan\\theta = \\frac{\\sin\\theta}{\\cos\\theta}$: the expression is $${correct.tex}$.`,
    trap: 'Replace 1 − cos²θ by sin²θ (not by sin θ) before cancelling.',
    tags: ['trig', 'identities', 'simplify'],
    params: { variant: 'simplify', expr: e.id, ans: e.ans },
    typedAllowed: false,
  };
}

// ----------------------------------------------------------------------------- level 5

/** sin θ + cos θ = k (or sin θ − cos θ = k) → sin θ cos θ. */
function sumProductQ(rng: RNG): Generated | null {
  const k = rng.pick([frac(1, 2), frac(-1, 2), Exact.surd(2), frac(5, 4), Exact.surd(3, frac(1, 2).toRat()), frac(6, 5), frac(1, 3), frac(7, 5), Exact.surd(6, frac(1, 2).toRat())]);
  const plus = rng.bool();
  const k2 = k.mul(k);
  if (k2.toNumber() > 2) return null;
  // (sin ± cos)² = 1 ± 2 sin cos
  const answer = plus ? k2.sub(E(1)).mul(frac(1, 2)) : E(1).sub(k2).mul(frac(1, 2));
  if (!isCleanExact(answer).ok || answer.isZero()) return null;
  const distractors = ranked(rng, answer, cleanOnly([
    { value: answer.neg(), trap: 'sign slip: 1 was subtracted the wrong way round' },
    { value: plus ? k2.sub(E(1)) : E(1).sub(k2), trap: 'forgot to halve' },
    { value: plus ? k.sub(E(1)).mul(frac(1, 2)) : E(1).sub(k).mul(frac(1, 2)), trap: 'forgot to square $k$' },
    { value: k2.add(E(1)).mul(frac(1, 2)), trap: 'added 1 instead of subtracting it' },
  ]), cleanOnly([
    { value: k2, trap: 'stopped at $k^{2}$' },
    { value: k2.mul(frac(1, 2)), trap: 'halved $k^{2}$ but forgot the 1' },
    { value: E(1).sub(k2), trap: 'used $\\cos^{2} = 1 - \\sin^{2}$ by mistake' },
  ]));
  return {
    stem: `Given that $\\sin\\theta ${plus ? '+' : '-'} \\cos\\theta = ${tx(k)}$, find the exact value of $\\sin\\theta\\cos\\theta$.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: options(rng, answer, distractors),
    solution: `Square both sides: $1 ${plus ? '+' : '-'} 2\\sin\\theta\\cos\\theta = ${tx(k2)}$, so $\\sin\\theta\\cos\\theta = ${tx(answer)}$.`,
    trap: 'Square the whole equation: (sin θ ± cos θ)² = 1 ± 2 sin θ cos θ, so k must be squared first.',
    tags: ['trig', 'identities', 'squaring'],
    params: { variant: 'sum-product', k: k.toNumber(), plus },
    typedAllowed: true,
  };
}

/** sin θ cos θ = p → (sin θ + cos θ)². */
function productSumQ(rng: RNG): Generated | null {
  const p = rng.pick([frac(3, 8), frac(-3, 8), frac(1, 4), frac(-1, 4), frac(1, 8), frac(2, 5), frac(-1, 5), frac(3, 10)]);
  if (Math.abs(2 * p.toNumber()) > 1) return null;
  const answer = E(1).add(p.mul(E(2)));
  if (!isCleanExact(answer).ok || answer.isZero()) return null;
  const distractors = ranked(rng, answer, cleanOnly([
    { value: p.mul(E(2)), trap: 'forgot the $\\sin^{2}\\theta + \\cos^{2}\\theta = 1$ term' },
    { value: E(1).add(p), trap: 'forgot to double $\\sin\\theta\\cos\\theta$' },
    { value: E(1).sub(p.mul(E(2))), trap: 'used $(\\sin\\theta - \\cos\\theta)^{2}$' },
    { value: p.mul(p).add(E(1)), trap: 'squared $\\sin\\theta\\cos\\theta$' },
  ]), cleanOnly([
    { value: answer.mul(E(2)), trap: 'doubled the whole expression' },
    { value: p, trap: 'gave the value back unchanged' },
    { value: E(2).add(p.mul(E(2))), trap: 'used 2 instead of 1 for $\\sin^{2}\\theta + \\cos^{2}\\theta$' },
  ]));
  return {
    stem: `Given that $\\sin\\theta\\cos\\theta = ${tx(p)}$, find the exact value of $(\\sin\\theta + \\cos\\theta)^{2}$.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: options(rng, answer, distractors),
    solution: `$(\\sin\\theta + \\cos\\theta)^{2} = \\sin^{2}\\theta + \\cos^{2}\\theta + 2\\sin\\theta\\cos\\theta = 1 + 2 \\times ${br(p)} = ${tx(answer)}$.`,
    trap: 'The cross term is 2 sin θ cos θ and the square terms give 1, not 0.',
    tags: ['trig', 'identities', 'expanding'],
    params: { variant: 'product-sum', prod: p.toNumber() },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'm1.trig.identities',
  module: 'M1',
  topic: 'trig',
  title: 'Trig identities',
  levels: {
    1: 'sin θ = 3/5, θ acute → cos θ = 4/5 or tan θ = 3/4',
    2: 'tan θ = 2 → sin²θ = 4/5',
    3: 'θ obtuse: sin θ = 5/13 → cos θ = −12/13',
    4: '1 − 2sin²30°, k(sin²A + cos²A), 3sin θ = 4cos θ, simplifying an expression',
    5: 'sin θ + cos θ = k → sin θ cos θ; tan θ = 3/4 in the third quadrant → sin θ',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      if (level === 1) return triangleQ(rng, 1);
      if (level === 2) return tanSquareQ(rng);
      if (level === 3) return triangleQ(rng, 2);
      if (level === 4) return pickVariant(rng, [doubleAngleQ, pythagQ, ratioQ, simplifyQ]);
      return pickVariant(rng, [sumProductQ, productSumQ, (r) => triangleQ(r, r.bool() ? 3 : 4)]);
    });
  },
  verify(q) {
    const p = q.params as {
      variant: string; s?: number; c?: number; want?: Fn; n?: number; d?: number;
      A?: number; k?: number; form?: string; a?: number; b?: number; expr?: string; ans?: string;
      plus?: boolean; prod?: number; square?: 'sin2' | 'cos2';
    };
    if (p.variant === 'simplify') {
      if (q.answer.kind !== 'choice') return false;
      const e = SIMPLIFY_BY_ID[p.expr!];
      if (!e) return false;
      // Recompute which candidate the expression equals, numerically, and check the option text.
      const matches = CANDS.filter((c) => agrees(c.fl, e.fl));
      if (matches.length !== 1) return false;
      return q.answer.value === `$${matches[0].tex}$` && q.options.filter((o) => o.correct).length === 1;
    }
    if (q.answer.kind !== 'exact') return false;
    const got = q.answer.value.toNumber();
    const close = (x: number) => Number.isFinite(x) && Math.abs(got - x) < 1e-9 * Math.max(1, Math.abs(x));
    const rad = (deg: number) => (deg * Math.PI) / 180;
    switch (p.variant) {
      case 'given': {
        // Rebuild the angle itself from the stored sine and cosine, then evaluate what was asked.
        const theta = Math.atan2(p.s!, p.c!);
        const f = p.want === 'sin' ? Math.sin(theta) : p.want === 'cos' ? Math.cos(theta) : Math.tan(theta);
        return close(f);
      }
      case 'tan-square': {
        const theta = Math.atan(p.n! / p.d!);
        return close(p.square === 'sin2' ? Math.sin(theta) ** 2 : Math.cos(theta) ** 2);
      }
      case 'double': {
        const form = DOUBLE_FORMS.find((f) => f.id === p.form);
        return !!form && close(form.fl(p.A!));
      }
      case 'pythag':
        return close(p.k! * (Math.sin(rad(p.A!)) ** 2 + Math.cos(rad(p.A!)) ** 2));
      case 'ratio': {
        // a sin θ = b cos θ  →  θ = atan2(b, a)
        const theta = Math.atan2(p.b!, p.a!);
        return close(Math.tan(theta));
      }
      case 'sum-product': {
        // sin θ ± cos θ = k  →  √2 sin(θ ± 45°) = k
        const k = p.k!;
        const phase = p.plus ? Math.PI / 4 : -Math.PI / 4;
        const theta = Math.asin(k / Math.SQRT2) - phase;
        const check = p.plus ? Math.sin(theta) + Math.cos(theta) : Math.sin(theta) - Math.cos(theta);
        if (Math.abs(check - k) > 1e-9) return false;
        return close(Math.sin(theta) * Math.cos(theta));
      }
      case 'product-sum': {
        const prod = p.prod!;
        const theta = 0.5 * Math.asin(2 * prod);
        if (Math.abs(Math.sin(theta) * Math.cos(theta) - prod) > 1e-9) return false;
        return close((Math.sin(theta) + Math.cos(theta)) ** 2);
      }
      default:
        return false;
    }
  },
});
