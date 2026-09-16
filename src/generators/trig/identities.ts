import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { exactSin, exactCos } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Trig identities: sin²θ + cos²θ = 1 and tan θ = sin θ / cos θ.
 * Level 1: sin θ = 3/5 with θ acute → cos θ = 4/5 or tan θ = 3/4 (Pythagorean triples)
 * Level 2: tan θ = 2 → sin²θ = 4/5, cos²θ, sin θ cos θ or 1/cos²θ
 * Level 3: θ obtuse: sin θ = 5/13 → cos θ = −12/13
 * Level 4: evaluate k(sin²A + cos²A) − j, 1 − 2sin²30°, a sin θ = b cos θ → tan θ, and simplifying an expression
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
function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[], weights?: number[]): Generated | null {
  const f = weights ? rng.weighted(fns, weights) : rng.pick(fns);
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
    // Raw inputs only: verify rebuilds the angle from the triple and the quadrant, so the
    // sign logic that levels 1, 3 and 5 are really testing is re-derived, not copied.
    params: { variant: 'given', opp, adj, hyp: h, quadrant: quadId, given, want },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 2: tan θ → sin²θ, cos²θ, sin θ cos θ, sec²θ

/** (opposite, adjacent) pairs whose hypotenuse² = n² + d² is a clean denominator. */
const TAN_PAIRS: [number, number][] = [[2, 1], [1, 2], [3, 1], [1, 3], [4, 3], [3, 4], [7, 1], [1, 7], [24, 7], [7, 24]];
type TanWant = 'sin2' | 'cos2' | 'sincos' | 'sec2';
const TAN_LABEL: Record<TanWant, string> = {
  sin2: '\\sin^{2}\\theta',
  cos2: '\\cos^{2}\\theta',
  sincos: '\\sin\\theta\\cos\\theta',
  sec2: '\\frac{1}{\\cos^{2}\\theta}',
};

function tanSquareQ(rng: RNG): Generated | null {
  const [n, d] = rng.pick(TAN_PAIRS);
  const t = frac(n, d);
  const want = rng.pick(['sin2', 'cos2', 'sincos', 'sec2'] as TanWant[]);
  const den = n * n + d * d;
  const answer = want === 'sin2' ? frac(n * n, den) : want === 'cos2' ? frac(d * d, den) : want === 'sincos' ? frac(n * d, den) : frac(den, d * d);
  if (!isCleanExact(answer).ok) return null;
  const range: [number, number] = want === 'sec2' ? [0, 400] : [0, 1];
  let must: { value: Exact | null; trap: string }[];
  let extra: { value: Exact | null; trap: string }[];
  if (want === 'sin2' || want === 'cos2') {
    const sq = want === 'sin2' ? n : d;
    const other = want === 'sin2' ? frac(d * d, den) : frac(n * n, den);
    must = [
      { value: other, trap: `gave $\\${want === 'sin2' ? 'cos' : 'sin'}^{2}\\theta$ instead` },
      { value: attempt(() => answer.powRat(frac(1, 2).toRat())), trap: `gave $\\${want === 'sin2' ? 'sin' : 'cos'}\\theta$, not its square` },
      { value: frac(sq, den), trap: 'forgot to square the numerator' },
      { value: frac(sq * sq, (n + d) * (n + d)), trap: 'used $(1 + \\tan\\theta)^{2}$ in the denominator' },
    ];
    extra = [
      { value: frac(n, n + d), trap: 'treated the ratio as a probability-style share' },
      { value: frac(d, n + d), trap: 'treated the ratio as a probability-style share' },
      { value: frac(sq * sq, n * d), trap: 'divided by $\\tan\\theta$ instead of $1 + \\tan^{2}\\theta$' },
    ];
  } else if (want === 'sincos') {
    must = [
      { value: frac(n * n, den), trap: 'gave $\\sin^{2}\\theta$' },
      { value: frac(d * d, den), trap: 'gave $\\cos^{2}\\theta$' },
      { value: frac(2 * n * d, den), trap: 'gave $\\sin 2\\theta = 2\\sin\\theta\\cos\\theta$' },
      { value: frac(n * d, (n + d) * (n + d)), trap: 'used $(1 + \\tan\\theta)^{2}$ in the denominator' },
    ];
    extra = [
      { value: frac(n, n + d), trap: 'treated the ratio as a probability-style share' },
      { value: t, trap: 'gave $\\tan\\theta$ back' },
      { value: frac(n * d, 2 * den), trap: 'halved instead of doubling' },
    ];
  } else {
    must = [
      { value: frac(n * n, d * d), trap: 'gave $\\tan^{2}\\theta$ and forgot the $1$' },
      { value: frac(den, n * n), trap: 'used $1 + \\frac{1}{\\tan^{2}\\theta}$' },
      { value: E(1).add(t), trap: 'forgot to square $\\tan\\theta$' },
      { value: frac((n + d) * (n + d), d * d), trap: 'squared $1 + \\tan\\theta$ instead of adding $\\tan^{2}\\theta$' },
    ];
    extra = [
      { value: frac(d * d, den), trap: 'gave $\\cos^{2}\\theta$ instead of its reciprocal' },
      { value: frac(n * n, den), trap: 'gave $\\sin^{2}\\theta$' },
      { value: answer.sub(E(1)), trap: 'subtracted the $1$ instead of adding it' },
    ];
  }
  const distractors = ranked(rng, answer, cleanOnly(must, range), cleanOnly(extra, range));
  if (distractors.length < 4) return null;
  const hyp2 = `${n * n} + ${d * d} = ${den}`;
  const solution = want === 'sec2'
    ? `$\\frac{1}{\\cos^{2}\\theta} = 1 + \\tan^{2}\\theta = 1 + ${tx(frac(n * n, d * d))} = ${tx(answer)}$.`
    : `$\\tan\\theta = ${tx(t)}$ means a right-angled triangle with opposite $${n}$ and adjacent $${d}$, so the hypotenuse squared is $${hyp2}$ and $${TAN_LABEL[want]} = ${tx(answer)}$.`;
  return {
    stem: `Given that $\\tan\\theta = ${tx(t)}$ and $\\theta$ is acute, find the exact value of $${TAN_LABEL[want]}$.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: options(rng, answer, distractors),
    solution,
    trap: 'sin²θ = tan²θ/(1 + tan²θ) and 1/cos²θ = 1 + tan²θ: the denominator is 1 + tan²θ, not (1 + tan θ)².',
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

/**
 * sin²A + cos²A = 1 hidden inside an expression that needs one manipulation first,
 * so a level-4 draw is never a single recall step.
 */
type PythagForm = 'sub' | 'expand' | 'div';

function pythagQ(rng: RNG): Generated | null {
  const A = rng.pick([12, 17, 23, 38, 41, 52, 64, 71, 83]);
  const form = rng.pick(['sub', 'expand', 'div'] as PythagForm[]);
  const k = rng.int(2, 9);
  const j = form === 'div' ? rng.pick([2, 3, 4, 5]) : rng.int(1, 9);
  let answer: Exact;
  let tex: string;
  let solution: string;
  let must: { value: Exact | null; trap: string }[];
  let extra: { value: Exact | null; trap: string }[];
  if (form === 'sub') {
    if (k === j) return null;
    answer = E(k - j);
    tex = `${k}\\sin^{2} ${A}^{\\circ} + ${k}\\cos^{2} ${A}^{\\circ} - ${j}`;
    solution = `Factorise the first two terms: $${k}(\\sin^{2} ${A}^{\\circ} + \\cos^{2} ${A}^{\\circ}) - ${j} = ${k} - ${j} = ${tx(answer)}$.`;
    must = [
      { value: E(k), trap: `used the identity but forgot the $-${j}$` },
      { value: E(k + j), trap: 'added the constant instead of subtracting it' },
      { value: E(2 * k - j), trap: 'took $\\sin^{2} + \\cos^{2} = 2$' },
      { value: E(1 - j), trap: 'dropped the factor $k$ and used $1 - j$' },
    ];
    extra = [
      { value: E(k - 2 * j), trap: 'subtracted the constant twice' },
      { value: E(k * k - j), trap: 'squared the factor as well' },
      { value: E(j - k), trap: 'subtracted the wrong way round' },
    ];
  } else if (form === 'expand') {
    answer = E(1 + j);
    tex = `(\\sin ${A}^{\\circ} + \\cos ${A}^{\\circ})^{2} - 2\\sin ${A}^{\\circ}\\cos ${A}^{\\circ} + ${j}`;
    solution = `Expanding, $(\\sin ${A}^{\\circ} + \\cos ${A}^{\\circ})^{2} = 1 + 2\\sin ${A}^{\\circ}\\cos ${A}^{\\circ}$, so the first two terms leave $1$ and the value is $1 + ${j} = ${tx(answer)}$.`;
    must = [
      { value: E(1), trap: 'cancelled correctly but dropped the constant' },
      { value: E(j), trap: 'took $(\\sin A + \\cos A)^{2} - 2\\sin A\\cos A$ to be $0$' },
      { value: E(2 + j), trap: 'expanded $(\\sin A + \\cos A)^{2}$ as $2$' },
      { value: E(1 - j), trap: 'subtracted the constant instead of adding it' },
    ];
    extra = [
      { value: E(1 + 2 * j), trap: 'doubled the constant along with the cross term' },
      { value: E(2 * j), trap: 'doubled the constant and lost the $1$' },
      { value: E(j - 1), trap: 'sign slip on the $1$' },
    ];
  } else {
    answer = frac(k, j);
    tex = `\\frac{${k}\\sin^{2} ${A}^{\\circ} + ${k}\\cos^{2} ${A}^{\\circ}}{${j}}`;
    solution = `The numerator is $${k}(\\sin^{2} ${A}^{\\circ} + \\cos^{2} ${A}^{\\circ}) = ${k}$, so the value is $\\frac{${k}}{${j}} = ${tx(answer)}$.`;
    must = [
      { value: E(k), trap: 'forgot to divide by the denominator' },
      { value: E(k * j), trap: 'multiplied by the denominator instead of dividing' },
      { value: frac(j, k), trap: 'divided the wrong way round' },
      { value: frac(1, j), trap: 'dropped the factor $k$ from the numerator' },
    ];
    extra = [
      { value: frac(2 * k, j), trap: 'took $\\sin^{2} + \\cos^{2} = 2$' },
      { value: frac(k * k, j), trap: 'squared the factor as well' },
      { value: frac(k, 2 * j), trap: 'halved the result' },
    ];
  }
  if (!isCleanExact(answer).ok || answer.isZero()) return null;
  const distractors = ranked(rng, answer, cleanOnly(must), cleanOnly(extra));
  if (distractors.length < 4) return null;
  return {
    stem: `Find the exact value of $${tex}$.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: options(rng, answer, distractors),
    solution,
    trap: 'sin²θ + cos²θ = 1 for every angle — factorise or expand first so the identity can be used.',
    tags: ['trig', 'identities', 'pythagoras'],
    params: { variant: 'pythag', A, k, j, form },
    typedAllowed: true,
  };
}

function ratioQ(rng: RNG): Generated | null {
  const a = rng.int(2, 9);
  const b = rng.int(2, 9);
  if (a === b) return null;
  // Two shapes: a sin θ = b cos θ, and a sin θ ± b cos θ = 0 (which needs the sign moved across).
  const zero = rng.bool();
  const sgn = zero ? rng.sign() : -1;
  const answer = frac(-sgn * b, a);
  if (!isCleanExact(answer).ok) return null;
  const equation = zero
    ? `${a}\\sin\\theta ${sgn > 0 ? '+' : '-'} ${b}\\cos\\theta = 0`
    : `${a}\\sin\\theta = ${b}\\cos\\theta`;
  const distractors = ranked(rng, answer, cleanOnly([
    { value: answer.neg(), trap: zero ? 'moved the cosine term across without changing its sign' : 'sign error when dividing' },
    { value: attempt(() => answer.inv()), trap: 'wrote $\\tan\\theta = \\cos\\theta/\\sin\\theta$ (upside down)' },
    { value: E(a * b), trap: 'multiplied the two coefficients' },
    { value: frac(-sgn * (b - a), a), trap: 'subtracted the coefficients instead of dividing' },
  ]), cleanOnly([
    { value: answer.mul(answer), trap: 'gave $\\tan^{2}\\theta$' },
    { value: frac(-sgn * b, a + b), trap: 'divided by the sum of the coefficients' },
    { value: E(a + b), trap: 'added the coefficients' },
    { value: frac(sgn * a, b), trap: 'inverted and mis-signed' },
  ]));
  return {
    stem: `Given that $${equation}$, find the exact value of $\\tan\\theta$.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: options(rng, answer, distractors),
    solution: zero
      ? `Rearrange: $${a}\\sin\\theta = ${sgn > 0 ? '-' : ''}${b}\\cos\\theta$, then divide by $${a}\\cos\\theta$ to get $\\tan\\theta = ${tx(answer)}$.`
      : `Divide both sides by $${a}\\cos\\theta$: $\\tan\\theta = \\frac{${b}}{${a}}${`\\frac{${b}}{${a}}` === tx(answer) ? '' : ` = ${tx(answer)}`}$.`,
    trap: 'tan θ = sin θ / cos θ, so the coefficient of cos ends up on top — and a term moved across changes sign.',
    tags: ['trig', 'identities', 'tan'],
    params: { variant: 'ratio', a, b, sgn },
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
      // The two one-step shapes are weighted down so a level-4 draw is not easier than level 3.
      if (level === 4) return pickVariant(rng, [doubleAngleQ, pythagQ, ratioQ, simplifyQ], [3, 2, 2, 3]);
      return pickVariant(rng, [sumProductQ, productSumQ, (r) => triangleQ(r, r.bool() ? 3 : 4)]);
    });
  },
  verify(q) {
    const p = q.params as {
      variant: string; opp?: number; adj?: number; hyp?: number; quadrant?: 1 | 2 | 3 | 4;
      given?: Fn; want?: Fn; n?: number; d?: number; square?: TanWant;
      A?: number; k?: number; j?: number; form?: string; a?: number; b?: number; sgn?: number;
      expr?: string; ans?: string; plus?: boolean; prod?: number;
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
        // Rebuild the angle from the raw triple and the quadrant, check the triple really is
        // right-angled and that the quadrant gives the signs it claims, then evaluate the target.
        const { opp, adj, hyp, quadrant, want } = p as { opp: number; adj: number; hyp: number; quadrant: 1 | 2 | 3 | 4; want: Fn };
        if (opp <= 0 || adj <= 0 || hyp <= 0 || opp * opp + adj * adj !== hyp * hyp) return false;
        const base = Math.asin(opp / hyp); // the acute reference angle
        const theta = quadrant === 1 ? base : quadrant === 2 ? Math.PI - base : quadrant === 3 ? Math.PI + base : 2 * Math.PI - base;
        const wantSin = quadrant === 1 || quadrant === 2 ? 1 : -1;
        const wantCos = quadrant === 1 || quadrant === 4 ? 1 : -1;
        if (Math.sign(Math.sin(theta)) !== wantSin || Math.sign(Math.cos(theta)) !== wantCos) return false;
        const f = want === 'sin' ? Math.sin(theta) : want === 'cos' ? Math.cos(theta) : Math.tan(theta);
        return close(f);
      }
      case 'tan-square': {
        const theta = Math.atan(p.n! / p.d!);
        const f = p.square === 'sin2' ? Math.sin(theta) ** 2
          : p.square === 'cos2' ? Math.cos(theta) ** 2
            : p.square === 'sincos' ? Math.sin(theta) * Math.cos(theta)
              : 1 / Math.cos(theta) ** 2;
        return close(f);
      }
      case 'double': {
        const form = DOUBLE_FORMS.find((f) => f.id === p.form);
        return !!form && close(form.fl(p.A!));
      }
      case 'pythag': {
        // Evaluate the printed expression numerically at the actual angle.
        const s = Math.sin(rad(p.A!)), c = Math.cos(rad(p.A!));
        const k = p.k!, j = p.j!;
        const v = p.form === 'sub' ? k * s * s + k * c * c - j
          : p.form === 'expand' ? (s + c) ** 2 - 2 * s * c + j
            : (k * s * s + k * c * c) / j;
        return close(v);
      }
      case 'ratio': {
        // Substitute the answer back: at θ = arctan(answer) the given equation must hold.
        const theta = Math.atan(got);
        const lhs = p.a! * Math.sin(theta) + p.sgn! * p.b! * Math.cos(theta);
        return Math.abs(lhs) < 1e-9 * Math.max(1, p.a! + p.b!);
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
