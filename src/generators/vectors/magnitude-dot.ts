import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, surd, Exact } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { signed } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Magnitude, dot product and the angle between two vectors.
 * Level 1: |a| for 2D/3D vectors with a clean magnitude (3i + 4j → 5, i + 2j + 2k → 3, 2i + 2j → 2√2)
 * Level 2: a · b for integer vectors
 * Level 3: the angle between two integer vectors, cos θ = 0, ±1/2, ±√2/2 or ±1 → 45°, 60°, 90°, 120°, 135°
 * Level 4: find λ so that a and b are perpendicular, or so that they are parallel
 * Level 5: the unit vector in the direction of a (choice), |a + b| from |a|, |b| and the angle, or a·(a + b)
 */

type Vec = number[];

const dot = (a: Vec, b: Vec): number => a.reduce((s, x, i) => s + x * b[i], 0);
const norm2 = (a: Vec): number => dot(a, a);
const len = (a: Vec): number => Math.sqrt(norm2(a));
const SYMS = ['\\mathbf{i}', '\\mathbf{j}', '\\mathbf{k}'];

/** "3i - 4j + k" in bold ijk notation (zero components omitted). */
function vecTex(v: Vec): string {
  let s = '';
  v.forEach((c, i) => { s += signed(c, SYMS[i], s === ''); });
  return s === '' ? '\\mathbf{0}' : s;
}

/** Same, but one component is the unknown λ (given as null). */
function vecTexLambda(v: (number | null)[]): string {
  let s = '';
  v.forEach((c, i) => {
    if (c === null) s += (s === '' ? '' : ' + ') + `\\lambda ${SYMS[i]}`;
    else s += signed(c, SYMS[i], s === '');
  });
  return s === '' ? '\\mathbf{0}' : s;
}

/** Coefficient in front of a symbol: "", "-" or the number. */
const coefTex = (n: number): string => (n === 1 ? '' : n === -1 ? '-' : `${n}`);

function cleanOnly(ds: { value: Exact | null; trap: string }[]): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } =>
    d.value !== null && Number.isFinite(d.value.toNumber()) && isCleanExact(d.value).ok);
}

/** Spec-named traps first, then the extras, so the headline mistakes are never shuffled out. */
function ranked(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], count = 4): Distractor[] {
  const seen: Exact[] = [answer];
  const out: Distractor[] = [];
  const take = (d: Distractor) => {
    if (out.length >= count || seen.some((s) => s.equals(d.value))) return;
    seen.push(d.value);
    out.push(d);
  };
  must.forEach(take);
  rng.shuffle(extra).forEach(take);
  return out;
}

/**
 * Same priority order as `ranked`, but the number of options below the answer is drawn first, so
 * the answer does not sit in a predictable place once the five options are sorted by value
 * ("order them and pick the middle one" must never beat working the magnitude out).
 */
function balanced(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], count = 4): Distractor[] {
  const av = answer.toNumber();
  const pool: Distractor[] = [];
  for (const d of [...must, ...rng.shuffle(extra)]) {
    if (answer.equals(d.value) || pool.some((o) => o.value.equals(d.value))) continue;
    pool.push(d);
  }
  const below = pool.filter((d) => d.value.toNumber() < av);
  const above = pool.filter((d) => d.value.toNumber() > av);
  let nBelow = rng.int(0, count);
  nBelow = Math.max(Math.min(nBelow, below.length), count - above.length);
  nBelow = Math.min(Math.max(nBelow, 0), below.length);
  const out = [...below.slice(0, nBelow), ...above.slice(0, count - nBelow)];
  for (const d of pool) {
    if (out.length >= count) break;
    if (!out.includes(d)) out.push(d);
  }
  return out.slice(0, count);
}

/** The `ranked` twin for 'choice' options: the named traps are kept, the extras only fill up. */
function rankedChoices(
  rng: RNG,
  correct: string,
  must: { display: string; trap: string }[],
  extra: { display: string; trap: string }[],
  count = 4,
): { display: string; trap: string }[] {
  const key = (s: string) => s.replace(/\s+/g, ' ').trim();
  const seen = new Set([key(correct)]);
  const out: { display: string; trap: string }[] = [];
  for (const c of [...must, ...rng.shuffle(extra)]) {
    if (out.length >= count) break;
    if (seen.has(key(c.display))) continue;
    seen.add(key(c.display));
    out.push(c);
  }
  return out;
}

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

/** Random signs and a random coordinate order — neither changes a magnitude or an angle. */
function orient(rng: RNG, vs: Vec[]): Vec[] {
  const d = vs[0].length;
  const order = rng.shuffle([0, 1, 2].slice(0, d));
  const signs = order.map(() => rng.sign());
  return vs.map((v) => order.map((j, i) => signs[i] * v[j]));
}

// ----------------------------------------------------------------------------- level 1

/** Vectors whose magnitude is an integer or a simple surd. */
const MAG_2D: Vec[] = [[3, 4], [6, 8], [5, 12], [8, 15], [9, 12], [7, 24], [20, 21], [1, 1], [2, 2], [3, 3], [1, 2], [2, 4], [1, 3], [2, 3], [5, 5], [2, 6], [4, 4], [0, 7]];
const MAG_3D: Vec[] = [[1, 2, 2], [2, 3, 6], [1, 4, 8], [2, 6, 9], [4, 4, 7], [2, 2, 1], [6, 6, 7], [3, 4, 12], [1, 1, 1], [2, 2, 2], [1, 1, 2], [2, 4, 4], [0, 3, 4], [3, 6, 6], [2, 3, 6], [0, 5, 12]];

function magnitudeQ(rng: RNG): Generated | null {
  const base = rng.bool(0.55) ? rng.pick(MAG_2D) : rng.pick(MAG_3D);
  const [a] = orient(rng, [base]);
  const n2 = norm2(a);
  const answer = surd(n2);
  if (!isCleanExact(answer).ok) return null;
  const absSum = a.reduce((s, x) => s + Math.abs(x), 0);
  const drop = rng.int(0, a.length - 1);
  const twice = rng.int(0, a.length - 1);
  // Half of these sit above |a| and half below it, so the size of an option gives nothing away.
  const must = cleanOnly([
    { value: E(n2), trap: 'forgot to square-root the sum of the squares' },
    { value: n2 - a[drop] * a[drop] > 0 ? surd(n2 - a[drop] * a[drop]) : null, trap: 'left one component out of the sum of squares' },
    { value: E(absSum), trap: 'added the components instead of squaring them' },
  ]);
  const extra = cleanOnly([
    { value: surd(absSum), trap: 'square-rooted the sum of the components, not the sum of the squares' },
    { value: E(Math.max(...a.map(Math.abs))), trap: 'quoted the largest component' },
    { value: surd(n2 + 3 * a[twice] * a[twice]), trap: 'doubled one component before squaring it' },
    { value: surd(2 * n2), trap: 'doubled the sum of the squares before taking the root' },
    { value: answer.isInteger() ? answer.add(E(1)) : null, trap: 'arithmetic slip of one' },
    { value: answer.isInteger() ? answer.sub(E(1)) : null, trap: 'arithmetic slip of one' },
    { value: answer.mulRat(frac(1, 2).toRat()), trap: 'halved instead of square-rooting' },
  ]);
  return {
    stem: `Given that $\\mathbf{a} = ${vecTex(a)}$, find $|\\mathbf{a}|$.`,
    answer: { kind: 'exact' as const, value: answer },
    options: buildOptions(rng, answer, balanced(rng, answer, must, extra)),
    solution: `$|\\mathbf{a}|^2 = ${a.map((x) => (x < 0 ? `(${x})^2` : `${x}^2`)).join(' + ')} = ${n2}$, so $|\\mathbf{a}| = \\sqrt{${n2}} = ${answer.toLatex()}$.`,
    trap: 'The magnitude is the square root of the sum of the squares — quoting a² + b² (or a + b) is the usual slip.',
    tags: ['vectors', 'magnitude', 'modulus'],
    params: { variant: 'magnitude', a },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 2

function dotQ(rng: RNG): Generated | null {
  const d = rng.bool(0.5) ? 2 : 3;
  const a: Vec = [], b: Vec = [];
  for (let i = 0; i < d; i++) { a.push(rng.int(-6, 6)); b.push(rng.int(-6, 6)); }
  const zeros = (v: Vec) => v.filter((x) => x === 0).length;
  if (zeros(a) + zeros(b) > (d === 2 ? 0 : 1)) return null;
  if (norm2(a) < 4 || norm2(b) < 4) return null;
  const value = dot(a, b);
  if (value === 0 || Math.abs(value) > 45) return null;
  const answer = E(value);
  const swapped = d === 2 ? a[0] * b[1] + a[1] * b[0] : a[0] * b[1] + a[1] * b[0] + a[2] * b[2];
  const sumProd = a.reduce((s, x) => s + x, 0) * b.reduce((s, x) => s + x, 0);
  const last = d - 1;
  const must = cleanOnly([
    { value: E(swapped), trap: 'paired the components wrongly (a₁b₂ + a₂b₁)' },
    { value: E(value - 2 * a[last] * b[last]), trap: 'sign slip: subtracted the last product instead of adding it' },
    { value: E(sumProd), trap: 'multiplied the sum of the components of each vector' },
  ]);
  const extra = cleanOnly([
    { value: E(value - a[0] * b[0]), trap: 'left one product out of the sum' },
    { value: E(-value), trap: 'sign error throughout' },
    { value: E(a.reduce((s, x, i) => s + x + b[i], 0)), trap: 'added the vectors instead of multiplying the components' },
    { value: E(value + 1), trap: 'arithmetic slip of one' },
    { value: E(value - 1), trap: 'arithmetic slip of one' },
  ]);
  return {
    stem: `Given that $\\mathbf{a} = ${vecTex(a)}$ and $\\mathbf{b} = ${vecTex(b)}$, find $\\mathbf{a} \\cdot \\mathbf{b}$.`,
    answer: { kind: 'exact' as const, value: answer },
    options: buildOptions(rng, answer, ranked(rng, answer, must, extra)),
    solution: `Multiply matching components and add: $${a.map((x, i) => `(${x})(${b[i]})`).join(' + ')} = ${value}$.`,
    trap: 'The scalar product pairs i with i, j with j and k with k — cross-pairing or a sign slip on one product is the usual error.',
    tags: ['vectors', 'scalar-product', 'dot-product'],
    params: { variant: 'dot', a, b },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 3

interface AnglePair { a: Vec; b: Vec; deg: number }

const ANGLE_BASES: AnglePair[] = [
  { a: [1, 1], b: [1, 0], deg: 45 },
  { a: [1, 1], b: [0, 1], deg: 45 },
  { a: [2, 2], b: [3, 0], deg: 45 },
  { a: [1, 1], b: [-1, 0], deg: 135 },
  { a: [1, 1], b: [0, -1], deg: 135 },
  { a: [1, 1], b: [1, -1], deg: 90 },
  { a: [3, 4], b: [4, -3], deg: 90 },
  { a: [1, 0], b: [0, 1], deg: 90 },
  { a: [2, 1], b: [1, -2], deg: 90 },
  { a: [1, 2], b: [2, -1], deg: 90 },
  { a: [1, 2], b: [3, 6], deg: 0 },
  { a: [1, 2], b: [-2, -4], deg: 180 },
  { a: [1, 1, 0], b: [1, 0, 1], deg: 60 },
  { a: [1, 1, 0], b: [0, 1, 1], deg: 60 },
  { a: [1, 1, 0], b: [2, 0, 2], deg: 60 },
  { a: [1, 1, 0], b: [-1, 0, 1], deg: 120 },
  { a: [1, 1, 0], b: [0, -1, 1], deg: 120 },
  { a: [1, 1, 0], b: [1, 2, 2], deg: 45 },
  { a: [1, 1, 0], b: [-1, -2, -2], deg: 135 },
  { a: [1, 2, 2], b: [2, 1, -2], deg: 90 },
  { a: [2, 2, 1], b: [1, -2, 2], deg: 90 },
  { a: [1, 1, 1], b: [1, -1, 0], deg: 90 },
  { a: [1, 1, 2], b: [1, 1, -1], deg: 90 },
  { a: [1, 1, 0], b: [0, 0, 1], deg: 90 },
  { a: [1, 2, 2], b: [2, 4, 4], deg: 0 },
  { a: [1, 2, 2], b: [-1, -2, -2], deg: 180 },
];

/**
 * The angles an integer-vector pair can actually produce. 30° and 150° are deliberately absent:
 * cos θ = ±√3/2 needs a surd component, so offering them would give a candidate two options to
 * strike out on sight.
 */
const STANDARD_ANGLES = [0, 45, 60, 90, 120, 135, 180];

function angleQ(rng: RNG): Generated | null {
  // 0° and 180° are spotted in two seconds (b is a visible multiple of a), so they stay rare.
  const base = rng.weighted(ANGLE_BASES, ANGLE_BASES.map((x) => (x.deg === 0 || x.deg === 180 ? 2 : 6)));
  const [a, b] = orient(rng, [base.a, base.b]);
  const p = rng.int(1, 3), q = rng.int(1, 3);
  const av = a.map((x) => x * p), bv = b.map((x) => x * q);
  if (av.every((x, i) => x === bv[i])) return null;
  if (av.some((x) => Math.abs(x) > 12) || bv.some((x) => Math.abs(x) > 12)) return null;
  const deg = base.deg;
  const answer = E(deg);
  const must: Distractor[] = [];
  const push = (d: number, trap: string) => {
    if (d >= 0 && d <= 180 && d !== deg && STANDARD_ANGLES.includes(d)) must.push({ value: E(d), trap });
  };
  push(180 - deg, 'lost the sign of the scalar product, giving the supplementary angle');
  push(deg === 90 ? 0 : 90 - deg, deg === 90 ? 'thought a zero scalar product means the vectors are parallel' : 'used sin⁻¹ of the ratio instead of cos⁻¹');
  push(deg - 90, 'used sin⁻¹ of the ratio instead of cos⁻¹');
  const extra: Distractor[] = STANDARD_ANGLES.filter((x) => x !== deg && !must.some((m) => m.value.equals(E(x))))
    .map((x) => ({ value: E(x), trap: 'used the wrong ratio inside cos⁻¹' }));
  const dv = dot(av, bv);
  const prod = norm2(av) * norm2(bv);
  const magTex = surd(prod).toLatex(); // |a||b| = √(|a|²|b|²), simplified
  const COS_TEX: Record<number, string> = { 0: '1', 45: '\\tfrac{1}{\\sqrt{2}}', 60: '\\tfrac12', 90: '0', 120: '-\\tfrac12', 135: '-\\tfrac{1}{\\sqrt{2}}', 180: '-1' };
  return {
    stem: `Find the angle between $\\mathbf{a} = ${vecTex(av)}$ and $\\mathbf{b} = ${vecTex(bv)}$, in degrees.`,
    answer: { kind: 'exact' as const, value: answer },
    options: buildOptions(rng, answer, ranked(rng, answer, must, extra)),
    solution: dv === 0
      ? `$\\mathbf{a} \\cdot \\mathbf{b} = ${av.map((x, i) => `(${x})(${bv[i]})`).join(' + ')} = 0$, so the vectors are perpendicular: the angle is $90^{\\circ}$.`
      : `$\\mathbf{a} \\cdot \\mathbf{b} = ${dv}$ and $|\\mathbf{a}||\\mathbf{b}| = ${magTex}$, so $\\cos\\theta = \\frac{${dv}}{${magTex}} = ${COS_TEX[deg]}$ and $\\theta = ${deg}^{\\circ}$.`,
    trap: 'cos θ = a·b / (|a||b|): dividing by the wrong thing, or ignoring the sign of a·b, gives the supplementary angle.',
    tags: ['vectors', 'angle', 'scalar-product'],
    params: { variant: 'angle', a: av, b: bv, deg },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 4

function perpLambdaQ(rng: RNG): Generated | null {
  const d = rng.bool(0.65) ? 3 : 2;
  const a: Vec = [], b: Vec = [];
  for (let i = 0; i < d; i++) { a.push(rng.nonZeroInt(-6, 6)); b.push(rng.nonZeroInt(-6, 6)); }
  const slot = rng.int(0, d - 1);
  let rest = 0;
  for (let i = 0; i < d; i++) if (i !== slot) rest += a[i] * b[i];
  if (rest === 0) return null;
  const lam = frac(-rest, a[slot]);
  if (!isCleanExact(lam).ok || Math.abs(lam.toNumber()) > 12) return null;
  if (lam.toRat().d > 4n) return null;
  const shown: (number | null)[] = b.map((x, i) => (i === slot ? null : x));
  const must = cleanOnly([
    { value: frac(rest, a[slot]), trap: 'sign error when rearranging a·b = 0' },
    { value: frac(1 - rest, a[slot]), trap: 'set the scalar product equal to 1 instead of 0' },
    { value: frac(a[slot], -rest), trap: 'divided the wrong way round' },
  ]);
  const extra = cleanOnly([
    { value: E(-rest), trap: 'forgot to divide by the coefficient of λ' },
    { value: E(-rest * a[slot]), trap: 'multiplied by the coefficient of λ instead of dividing' },
    { value: lam.add(E(1)), trap: 'arithmetic slip of one' },
    { value: lam.sub(E(1)), trap: 'arithmetic slip of one' },
  ]);
  return {
    stem: `The vectors $\\mathbf{a} = ${vecTex(a)}$ and $\\mathbf{b} = ${vecTexLambda(shown)}$ are perpendicular. Find the value of $\\lambda$.`,
    answer: { kind: 'exact' as const, value: lam },
    options: buildOptions(rng, lam, ranked(rng, lam, must, extra), { format: 'fraction' }),
    solution: `Perpendicular means $\\mathbf{a} \\cdot \\mathbf{b} = 0$: $${coefTex(a[slot])}\\lambda ${rest >= 0 ? '+' : '-'} ${Math.abs(rest)} = 0$, so $\\lambda = ${lam.toLatex({ format: 'fraction' })}$.`,
    trap: 'Perpendicular means the scalar product is 0, not 1 — and the sign flips when the constant term crosses over.',
    tags: ['vectors', 'perpendicular', 'scalar-product'],
    params: { variant: 'perp', a, b, slot },
    typedAllowed: true,
  };
}

function parallelLambdaQ(rng: RNG): Generated | null {
  const d = rng.bool(0.6) ? 3 : 2;
  const a: Vec = [];
  for (let i = 0; i < d; i++) a.push(rng.nonZeroInt(-6, 6));
  const k = rng.pick([2, 3, 4, -2, -3, frac(1, 2).toNumber()]);
  const slot = rng.int(0, d - 1);
  const b = a.map((x) => x * k);
  if (b.some((x) => !Number.isInteger(x) || Math.abs(x) > 18)) return null;
  const lam = E(b[slot]);
  if (new Set(a.map(Math.abs)).size < d) return null;
  const shown: (number | null)[] = b.map((x, i) => (i === slot ? null : x));
  const other = (slot + 1) % d;
  const must = cleanOnly([
    { value: E(-b[slot]), trap: 'sign error: the scale factor applies to every component, sign included' },
    { value: E(a[slot] + (b[other] - a[other])), trap: 'added the difference instead of multiplying by the scale factor' },
    { value: E(a[slot]), trap: 'copied the component of a instead of scaling it' },
  ]);
  const extra = cleanOnly([
    { value: E(b[slot] + 1), trap: 'arithmetic slip of one' },
    { value: E(b[slot] - 1), trap: 'arithmetic slip of one' },
    { value: frac(a[slot], 1).div(E(k)), trap: 'divided by the scale factor instead of multiplying' },
    { value: E(2 * b[slot]), trap: 'doubled the scale factor' },
  ]);
  return {
    stem: `The vectors $\\mathbf{a} = ${vecTex(a)}$ and $\\mathbf{b} = ${vecTexLambda(shown)}$ are parallel. Find the value of $\\lambda$.`,
    answer: { kind: 'exact' as const, value: lam },
    options: buildOptions(rng, lam, ranked(rng, lam, must, extra), { format: 'fraction' }),
    solution: `Parallel vectors are multiples of each other: comparing the $${SYMS[other]}$ components gives $\\mathbf{b} = ${E(k).toLatex({ format: 'fraction' })}\\mathbf{a}$, so $\\lambda = ${E(k).toLatex({ format: 'fraction' })} \\times ${a[slot] < 0 ? `(${a[slot]})` : a[slot]} = ${lam.toLatex()}$.`,
    trap: 'Parallel means b = k a for one scale factor k used on every component — not adding the same amount to each.',
    tags: ['vectors', 'parallel', 'scale-factor'],
    params: { variant: 'parallel', a, b, slot },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 5

/** Vectors with every component at least 2 in size and an integer magnitude. */
const UNIT_POOL: Vec[] = [[3, 4], [6, 8], [5, 12], [8, 15], [9, 12], [7, 24], [20, 21], [2, 3, 6], [2, 6, 9], [4, 4, 7], [6, 6, 7], [2, 4, 4], [3, 4, 12], [2, 10, 11], [6, 10, 15], [3, 6, 6]];

function unitVectorQ(rng: RNG): Generated | null {
  const [a] = orient(rng, [rng.pick(UNIT_POOL)]);
  const m = Math.round(len(a));
  if (Math.abs(m * m - norm2(a)) > 1e-9) return null;
  const absSum = a.reduce((s, x) => s + Math.abs(x), 0);
  if (absSum === m) return null;
  const wrap = (den: number | null, v: Vec) => (den === null ? `$${vecTex(v)}$` : `$\\frac{1}{${den}}(${vecTex(v)})$`);
  const correct = wrap(m, a);
  const swapped = a.slice();
  [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  const must = [
    { display: wrap(null, a), trap: 'forgot to divide by the magnitude' },
    { display: wrap(m * m, a), trap: 'divided by |a|² instead of |a|' },
    { display: wrap(absSum, a), trap: 'divided by the sum of the components instead of the magnitude' },
  ].filter((w) => w.display !== correct);
  const extra = [
    { display: wrap(m, a.map((x) => -x)), trap: 'gave the unit vector in the opposite direction' },
    { display: wrap(m, swapped), trap: 'components written in the wrong order' },
    { display: wrap(m + 1, a), trap: 'slip of one in the magnitude' },
  ].filter((w) => w.display !== correct);
  const wrong = rankedChoices(rng, correct, must, extra);
  return {
    stem: `Find the unit vector in the direction of $\\mathbf{a} = ${vecTex(a)}$.`,
    answer: { kind: 'choice' as const, value: correct },
    options: buildChoiceOptions(rng, correct, wrong),
    solution: `$|\\mathbf{a}| = \\sqrt{${norm2(a)}} = ${m}$, so the unit vector is $\\frac{1}{${m}}(${vecTex(a)})$.`,
    trap: 'A unit vector is a ÷ |a|: dividing by |a|² (or not dividing at all) is the usual slip.',
    tags: ['vectors', 'unit-vector', 'magnitude'],
    params: { variant: 'unit', a, m },
    typedAllowed: false,
  };
}

const COS_HALF: Record<number, number> = { 60: 1, 90: 0, 120: -1 };

function sumMagnitudeQ(rng: RNG): Generated | null {
  const deg = rng.pick([60, 90, 120]);
  const A = rng.int(2, 8), B = rng.int(2, 8);
  const s = A * A + B * B + COS_HALF[deg] * A * B;
  const answer = surd(s);
  if (!isCleanExact(answer).ok) return null;
  const t = answer.terms[0];
  if (t.r > 15) return null; // keep the surd small enough to be an exam answer
  const other = A * A + B * B - COS_HALF[deg] * A * B;
  /** A length option must be positive, and any surd in it as small as the answer's. */
  const lengths = (ds: { value: Exact | null; trap: string }[]) =>
    cleanOnly(ds).filter((d) => d.value.toNumber() > 0 && d.value.terms.every((x) => x.r <= 15));
  const must = lengths([
    { value: E(A + B), trap: 'added the magnitudes: |a + b| = |a| + |b| only when they point the same way' },
    { value: surd(A * A + B * B), trap: 'ignored the angle (treated the vectors as perpendicular)' },
    { value: surd(other), trap: 'sign slip on the 2|a||b|cos θ term (that is |a − b|)' },
  ]);
  const extra = lengths([
    { value: E(s), trap: 'forgot to square-root |a + b|²' },
    { value: E(Math.abs(A - B)), trap: 'subtracted the magnitudes' },
    { value: answer.isInteger() ? answer.add(E(1)) : null, trap: 'arithmetic slip of one' },
    { value: answer.isInteger() ? answer.sub(E(1)) : null, trap: 'arithmetic slip of one' },
    { value: surd(A * B), trap: 'multiplied the magnitudes' },
    { value: surd(s + A * B), trap: 'used the wrong multiple of |a||b|cos θ' },
  ]);
  const cosTex = deg === 90 ? '0' : deg === 60 ? '\\tfrac12' : '-\\tfrac12';
  return {
    stem: `The vectors $\\mathbf{a}$ and $\\mathbf{b}$ have $|\\mathbf{a}| = ${A}$ and $|\\mathbf{b}| = ${B}$, and the angle between them is $${deg}^{\\circ}$. Find $|\\mathbf{a} + \\mathbf{b}|$.`,
    answer: { kind: 'exact' as const, value: answer },
    options: buildOptions(rng, answer, ranked(rng, answer, must, extra)),
    solution: `$|\\mathbf{a} + \\mathbf{b}|^2 = |\\mathbf{a}|^2 + 2\\,\\mathbf{a}\\cdot\\mathbf{b} + |\\mathbf{b}|^2 = ${A * A} + 2 \\times ${A} \\times ${B} \\times ${cosTex} + ${B * B} = ${s}$, so $|\\mathbf{a} + \\mathbf{b}| = ${answer.toLatex()}$.`,
    trap: 'Magnitudes do not add: expand |a + b|² = |a|² + 2a·b + |b|² and keep the sign of cos θ.',
    tags: ['vectors', 'magnitude', 'cosine-rule'],
    params: { variant: 'sum-magnitude', A, B, deg },
    typedAllowed: true,
  };
}

function dotExpandQ(rng: RNG): Generated | null {
  const d = rng.bool(0.6) ? 3 : 2;
  const a: Vec = [], b: Vec = [];
  for (let i = 0; i < d; i++) { a.push(rng.int(-5, 5)); b.push(rng.int(-5, 5)); }
  const zeros = (v: Vec) => v.filter((x) => x === 0).length;
  if (zeros(a) + zeros(b) > (d === 2 ? 0 : 1)) return null;
  if (norm2(a) < 5 || norm2(b) < 5) return null;
  const ab = dot(a, b), aa = norm2(a);
  const value = aa + ab;
  if (value === 0 || Math.abs(value) > 60 || ab === 0) return null;
  const answer = E(value);
  const must = cleanOnly([
    { value: E(ab), trap: 'expanded a·(a + b) as a·b only, dropping |a|²' },
    { value: E(aa + norm2(b)), trap: 'used |a|² + |b|² instead of |a|² + a·b' },
    { value: E(aa - ab), trap: 'sign slip: computed a·(a − b)' },
  ]);
  const extra = cleanOnly([
    { value: E(aa), trap: 'dropped the a·b term' },
    { value: E(2 * ab), trap: 'expanded as 2a·b' },
    { value: E(value + 1), trap: 'arithmetic slip of one' },
    { value: E(value - 1), trap: 'arithmetic slip of one' },
    { value: E(ab + ab + aa), trap: 'counted the a·b term twice' },
  ]);
  return {
    stem: `Given that $\\mathbf{a} = ${vecTex(a)}$ and $\\mathbf{b} = ${vecTex(b)}$, find $\\mathbf{a} \\cdot (\\mathbf{a} + \\mathbf{b})$.`,
    answer: { kind: 'exact' as const, value: answer },
    options: buildOptions(rng, answer, ranked(rng, answer, must, extra)),
    solution: `$\\mathbf{a} \\cdot (\\mathbf{a} + \\mathbf{b}) = |\\mathbf{a}|^2 + \\mathbf{a}\\cdot\\mathbf{b} = ${aa} ${ab >= 0 ? '+' : '-'} ${Math.abs(ab)} = ${value}$.`,
    trap: 'The scalar product distributes: a·(a + b) = |a|² + a·b, so the |a|² term must not be dropped.',
    tags: ['vectors', 'scalar-product', 'expand'],
    params: { variant: 'dot-expand', a, b },
    typedAllowed: true,
  };
}

// -----------------------------------------------------------------------------

export default defineTemplate({
  id: 'm2.vectors.magnitude-dot',
  module: 'M2',
  topic: 'vectors',
  title: 'Magnitude, dot product and angles',
  levels: {
    1: '|a| for 2D/3D vectors with a clean magnitude: 3i + 4j → 5, i + 2j + 2k → 3, 2i + 2j → 2√2',
    2: 'a · b for integer vectors in 2D and 3D',
    3: 'the angle between two integer vectors: 45°, 60°, 90°, 120°, 135° (also 0° and 180°)',
    4: 'find λ so that a and b are perpendicular, or so that they are parallel',
    5: 'unit vector in the direction of a; |a + b| from |a|, |b| and the angle; a·(a + b)',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return pickVariant(rng, [magnitudeQ]);
        case 2: return pickVariant(rng, [dotQ]);
        case 3: return pickVariant(rng, [angleQ]);
        case 4: return pickVariant(rng, [perpLambdaQ, perpLambdaQ, parallelLambdaQ]);
        default: return pickVariant(rng, [unitVectorQ, sumMagnitudeQ, dotExpandQ]);
      }
    });
  },
  verify(q) {
    const p = q.params as { variant: string; a?: number[]; b?: number[]; slot?: number; deg?: number; A?: number; B?: number; m?: number };
    const near = (x: number, y: number) => Math.abs(x - y) < 1e-9;
    const val = q.answer.kind === 'exact' ? q.answer.value.toNumber() : NaN;
    switch (p.variant) {
      case 'magnitude': {
        const a = p.a!;
        return near(val, Math.hypot(...a));
      }
      case 'dot': {
        const a = p.a!, b = p.b!;
        let s = 0;
        for (let i = 0; i < a.length; i++) s += a[i] * b[i];
        return near(val, s);
      }
      case 'angle': {
        const a = p.a!, b = p.b!;
        let s = 0;
        for (let i = 0; i < a.length; i++) s += a[i] * b[i];
        const theta = (Math.acos(s / (Math.hypot(...a) * Math.hypot(...b))) * 180) / Math.PI;
        return Math.abs(theta - val) < 1e-6 && Math.abs(theta - p.deg!) < 1e-6;
      }
      case 'perp': {
        // Substitute the answer back: the scalar product of a with the completed b must be zero.
        const a = p.a!, b = p.b!.slice();
        b[p.slot!] = val;
        let s = 0;
        for (let i = 0; i < a.length; i++) s += a[i] * b[i];
        return Math.abs(s) < 1e-9;
      }
      case 'parallel': {
        // Substitute the answer back: every 2×2 "cross product" of a and b must vanish.
        const a = p.a!, b = p.b!.slice();
        b[p.slot!] = val;
        for (let i = 0; i < a.length; i++) {
          for (let j = i + 1; j < a.length; j++) {
            if (Math.abs(a[i] * b[j] - a[j] * b[i]) > 1e-9) return false;
          }
        }
        return true;
      }
      case 'unit': {
        if (q.answer.kind !== 'choice') return false;
        // Read the numbers back out of the chosen option: 1/den followed by the components.
        const nums = (q.answer.value.match(/[+-]?\s*\d+/g) ?? []).map((s) => Number(s.replace(/\s+/g, '')));
        const a = p.a!;
        if (nums.length !== a.length + 2 || nums[0] !== 1) return false;
        const den = nums[1];
        const mag = Math.hypot(...a);
        let sq = 0;
        for (let i = 0; i < a.length; i++) {
          if (!near(nums[i + 2] / den, a[i] / mag)) return false;
          sq += (nums[i + 2] / den) ** 2;
        }
        return near(sq, 1) && near(den, mag);
      }
      case 'sum-magnitude': {
        // Build two actual vectors with the stated magnitudes and angle and add them numerically.
        const A = p.A!, B = p.B!, th = (p.deg! * Math.PI) / 180;
        const x = A + B * Math.cos(th), y = B * Math.sin(th);
        return Math.abs(Math.hypot(x, y) - val) < 1e-9;
      }
      case 'dot-expand': {
        const a = p.a!, b = p.b!;
        let s = 0;
        for (let i = 0; i < a.length; i++) s += a[i] * (a[i] + b[i]);
        return near(val, s);
      }
      default:
        return false;
    }
  },
});
