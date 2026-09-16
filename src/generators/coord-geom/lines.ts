import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, surd, Exact, babs } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { gcd, lcm, signed } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Straight lines: gradients, midpoints, distances and perpendiculars.
 * Level 1: gradient between two lattice points, or the y-intercept of the line through them
 * Level 2: distance between two points (3-4-5 style triple or a simplified surd such as 2√5)
 * Level 3: gradient perpendicular to ax + by = c, or "find k so that (k, 3) lies on the line"
 * Level 4: equation of a perpendicular bisector / perpendicular through a point (choice of equations),
 *          or k making three points collinear
 * Level 5: intersection of two lines (sum of the coordinates) — both in general form (elimination) or
 *          y = mx + c with a fractional gradient (substitution); the area a line cuts off with the axes,
 *          or with the x-axis and a vertical line, where the intercepts have to be solved for
 */

type Triple = [number, number, number];
type Form = 'slope' | 'general';

/** A non-vertical line y = mx + c, stored exactly. */
interface Line { m: Exact; c: Exact }

function attempt(f: () => Exact): Exact | null {
  try {
    const v = f();
    return Number.isFinite(v.toNumber()) ? v : null;
  } catch {
    return null;
  }
}

function cleanOnly(ds: { value: Exact | null; trap: string }[]): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } => d.value !== null && isCleanExact(d.value).ok);
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
  must.forEach(take); // in order, so when two must-traps coincide the more specific label wins
  rng.shuffle(extra).forEach(take);
  return out;
}

function options(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[]) {
  return buildOptions(rng, answer, ranked(rng, answer, must, extra), { format: 'fraction' });
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

const tx = (v: number | Exact): string => (typeof v === 'number' ? `${v}` : v.toLatex({ format: 'fraction' }));
const pt = (x: number | Exact, y: number | Exact): string => `(${tx(x)}, ${tx(y)})`;
/** Bracket a negative number that follows a minus sign: 3 - (-2). */
const br = (v: number): string => (v < 0 ? `(${v})` : `${v}`);
/** "x - 3", "x + 2" or just "x" for the point-gradient form. */
const shift = (v: string, x0: number): string => (x0 === 0 ? v : x0 > 0 ? `${v} - ${x0}` : `${v} + ${-x0}`);
/** Coefficient in front of a variable: "", "-" or the number. */
const coefTex = (n: number): string => (n === 1 ? '' : n === -1 ? '-' : `${n}`);

/** Left-hand side "3x - 2y" of a general-form equation. */
function lhs(A: number, B: number): string {
  let s = '';
  if (A !== 0) s += signed(A, 'x', true);
  if (B !== 0) s += signed(B, 'y', s === '');
  return s || '0';
}

function through(m: Exact, x0: Exact, y0: Exact): Line {
  return { m, c: y0.sub(m.mul(x0)) };
}

/** Integer general form Ax + By = C in lowest terms with A > 0 (or A = 0, B > 0). */
function toGeneral(l: Line): Triple {
  const m = l.m.toRat(), c = l.c.toRat();
  const L = lcm(Number(m.d), Number(c.d));
  let A = -Number(m.n) * (L / Number(m.d));
  let B = L;
  let C = Number(c.n) * (L / Number(c.d));
  const g = gcd(gcd(A, B), C) || 1;
  A /= g; B /= g; C /= g;
  if (A < 0 || (A === 0 && B < 0)) { A = -A; B = -B; C = -C; }
  return [A, B, C];
}

function fromGeneral([A, B, C]: Triple): Line {
  return { m: frac(-A, B), c: frac(C, B) };
}

function renderGeneral(t: Triple): string {
  return `$${lhs(t[0], t[1])} = ${t[2]}$`;
}

/** "\frac{3}{4}x - 2", "x + 5", "-x" — the right-hand side of y = mx + c. */
function slopeRhs(m: Exact, c: Exact): string {
  let rhs = '';
  if (!m.isZero()) rhs = m.equals(E(1)) ? 'x' : m.equals(E(-1)) ? '-x' : `${m.toLatex({ format: 'fraction' })}x`;
  if (!c.isZero()) {
    const cs = c.abs().toLatex({ format: 'fraction' });
    if (rhs === '') rhs = c.sign() < 0 ? `-${cs}` : cs;
    else rhs += c.sign() < 0 ? ` - ${cs}` : ` + ${cs}`;
  }
  return rhs || '0';
}

function renderSlope(l: Line): string {
  return `$y = ${slopeRhs(l.m, l.c)}$`;
}

function render(l: Line, form: Form): string {
  return form === 'slope' ? renderSlope(l) : renderGeneral(toGeneral(l));
}

/** Would the exam print this line in y = mx + c form? Integer or half intercept, small gradient denominator. */
function tidyInSlopeForm(l: Line): boolean {
  const c = l.c.toRat(), m = l.m.toRat();
  return c.d <= 2n && babs(c.n) <= 40n && m.d <= 4n && babs(m.n) <= 12n;
}

/** Would the exam print this line in ax + by = c form? Small integer coefficients. */
function tidyInGeneralForm(l: Line): boolean {
  const [A, B, C] = toGeneral(l);
  return Math.abs(A) <= 12 && Math.abs(B) <= 12 && Math.abs(C) <= 80;
}

interface WrongLine { line: Line; trap: string }

/**
 * Options for an equation-of-a-line question: every option in the same form, the spec-named traps
 * (`must`) always present, and no option whose intercept the exam would never print in y = mx + c form.
 * Falls back from slope form to general form if too few tidy distractors remain.
 */
function lineChoice(rng: RNG, correct: Line, must: WrongLine[], extra: WrongLine[], form: Form) {
  const build = (f: Form) => {
    const tidy = f === 'slope' ? tidyInSlopeForm : tidyInGeneralForm;
    const correctStr = render(correct, f);
    // A spec trap the exam could not print in this form: use the other form rather than lose the trap.
    if (must.some((w) => !tidy(w.line) && render(w.line, 'general') !== render(correct, 'general'))) return null;
    const seen = new Set([correctStr]);
    const picked: { display: string; trap: string }[] = [];
    const take = (w: WrongLine) => {
      if (picked.length >= 4 || !tidy(w.line)) return;
      const display = render(w.line, f);
      if (seen.has(display)) return;
      seen.add(display);
      picked.push({ display, trap: w.trap });
    };
    rng.shuffle(must).forEach(take);
    rng.shuffle(extra).forEach(take);
    if (picked.length < 4) return null;
    return { form: f, correctStr, options: buildChoiceOptions(rng, correctStr, picked) };
  };
  return build(form) ?? (form === 'slope' ? build('general') : null);
}

// ----------------------------------------------------------------------------- level 1

function gradientQ(rng: RNG): Generated | null {
  const x1 = rng.int(-5, 6), y1 = rng.int(-6, 8);
  const dx = rng.nonZeroInt(-5, 5), dy = rng.nonZeroInt(-8, 8);
  if (Math.abs(dx) === Math.abs(dy)) return null; // gradient ±1: the inverted fraction would equal the answer
  const x2 = x1 + dx, y2 = y1 + dy;
  if ((x1 === 0 && y1 === 0) || (x2 === 0 && y2 === 0)) return null; // from the origin the wrong routes coincide
  const m = frac(dy, dx);
  if (!isCleanExact(m).ok) return null;
  const must = cleanOnly([
    { value: frac(dx, dy), trap: 'fraction upside down: Δx/Δy instead of Δy/Δx' },
    { value: m.neg(), trap: 'subtracted the coordinates in opposite orders (sign error)' },
  ]);
  const extra = cleanOnly([
    { value: frac(-dx, dy), trap: 'inverted the fraction and lost the sign' },
    { value: x1 + x2 !== 0 ? frac(y1 + y2, x1 + x2) : null, trap: 'added the coordinates instead of subtracting' },
    { value: x2 !== 0 ? frac(y2, x2) : null, trap: 'divided the coordinates of one point instead of the differences' },
    { value: x1 !== 0 ? frac(y1, x1) : null, trap: 'divided the coordinates of one point instead of the differences' },
    { value: E(dy), trap: 'forgot to divide by the change in x' },
  ]);
  const stem = rng.bool(0.5)
    ? `Find the gradient of the line joining $${pt(x1, y1)}$ and $${pt(x2, y2)}$.`
    : `$A$ is the point $${pt(x1, y1)}$ and $B$ is the point $${pt(x2, y2)}$. Find the gradient of $AB$.`;
  return {
    stem,
    answer: { kind: 'exact', value: m },
    options: options(rng, m, must, extra),
    solution: `Gradient $= \\frac{y_2 - y_1}{x_2 - x_1} = \\frac{${y2} - ${br(y1)}}{${x2} - ${br(x1)}} = \\frac{${dy}}{${dx}} = ${m.toLatex()}$.`,
    trap: 'Gradient is change in y over change in x, with both differences taken in the same order.',
    tags: ['coordinate-geometry', 'gradient'],
    params: { variant: 'gradient', x1, y1, x2, y2 },
    typedAllowed: true,
  };
}

function interceptQ(rng: RNG): Generated | null {
  const x1 = rng.nonZeroInt(-5, 6), y1 = rng.int(-6, 8);
  let dx: number, dy: number;
  if (rng.bool(0.6)) { dx = rng.nonZeroInt(-3, 3); dy = dx * rng.nonZeroInt(-3, 3); }
  else { dx = rng.pick([-4, -3, -2, 2, 3, 4]); dy = rng.nonZeroInt(-7, 7); if (dy % dx === 0) return null; }
  const x2 = x1 + dx, y2 = y1 + dy;
  if (x2 === 0 || Math.abs(dx) === Math.abs(dy)) return null; // c just read off; gradient ±1 collapses the traps
  const m = frac(dy, dx);
  const c = E(y1).sub(m.mulRat(x1));
  if (!isCleanExact(c).ok || c.toRat().d > 4n) return null;
  const must = cleanOnly([
    { value: E(y1).add(m.mulRat(x1)), trap: 'sign slip when substituting: c = y − mx, not y + mx' },
    { value: c.neg(), trap: 'found mx − y instead of y − mx' },
  ]);
  const extra = cleanOnly([
    { value: attempt(() => c.neg().div(m)), trap: 'found the x-intercept instead of the y-intercept' },
    { value: E(y1), trap: 'read off the y-coordinate of a given point' },
    { value: E(y1).sub(frac(dx, dy).mulRat(x1)), trap: 'gradient inverted before substituting' },
    { value: E(x1).sub(m.mulRat(y1)), trap: 'swapped x and y when substituting' },
    { value: E(y1).sub(m.mulRat(x2)), trap: 'mixed the coordinates of the two points when substituting' },
    { value: m, trap: 'gave the gradient instead of the intercept' },
  ]);
  const stem = rng.bool(0.5)
    ? `Find the $y$-intercept of the line through $${pt(x1, y1)}$ and $${pt(x2, y2)}$.`
    : `The line through $${pt(x1, y1)}$ and $${pt(x2, y2)}$ crosses the $y$-axis at $(0, c)$. Find $c$.`;
  return {
    stem,
    answer: { kind: 'exact', value: c },
    options: options(rng, c, must, extra),
    solution: `Gradient $m = \\frac{${dy}}{${dx}} = ${m.toLatex()}$. Then $c = y_1 - m x_1 = ${y1} - ${m.sign() < 0 ? `(${m.toLatex()})` : m.toLatex()} \\times ${br(x1)} = ${c.toLatex()}$.`,
    trap: 'Find the gradient first, then substitute one point into y = mx + c: c = y − mx (watch the signs).',
    tags: ['coordinate-geometry', 'intercept'],
    params: { variant: 'intercept', x1, y1, x2, y2 },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 2

const SMALL_TRIPLES: [number, number][] = [[3, 4], [6, 8], [5, 12], [9, 12], [8, 15]];
const SURD_LEGS: [number, number][] = [[1, 2], [2, 4], [3, 6], [4, 8], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [1, 3], [2, 6], [2, 3], [4, 6], [6, 6], [1, 5]];

function distanceQ(rng: RNG): Generated | null {
  const kind = rng.pick(['triple', 'surd', 'surd']);
  let [p, q] = kind === 'triple' ? rng.pick(SMALL_TRIPLES) : rng.pick(SURD_LEGS);
  if (rng.bool()) [p, q] = [q, p];
  const dx = p * rng.sign(), dy = q * rng.sign();
  const x1 = rng.int(-6, 6), y1 = rng.int(-6, 6);
  const x2 = x1 + dx, y2 = y1 + dy;
  if (Math.abs(x2) > 12 || Math.abs(y2) > 12) return null;
  const N = dx * dx + dy * dy;
  const d = surd(N);
  const must = cleanOnly([
    { value: E(N), trap: 'forgot to take the square root' },
    { value: E(Math.abs(dx) + Math.abs(dy)), trap: 'added the differences without squaring' },
  ]);
  const extra = cleanOnly([
    { value: dx * dx !== dy * dy ? surd(Math.abs(dx * dx - dy * dy)) : null, trap: 'subtracted the squares instead of adding' },
    { value: d.mulRat(frac(1, 2).toRat()), trap: 'halved the distance (mixed up with the midpoint)' },
    { value: attempt(() => surd(Math.abs(dx) + Math.abs(dy))), trap: 'square-rooted the sum of the differences instead of the sum of their squares' },
    { value: E(Math.abs(dx * dy)), trap: 'multiplied the differences' },
  ]);
  const surdForm = !d.isRational();
  const dTex = d.toLatex();
  const rootStep = dTex === `\\sqrt{${N}}` ? `$d = \\sqrt{${N}}$` : `$d = \\sqrt{${N}} = ${dTex}$`;
  const stem = `Find the distance between the points $${pt(x1, y1)}$ and $${pt(x2, y2)}$${surdForm ? ', giving your answer in the form $a\\sqrt{b}$' : ''}.`;
  const solution = surdForm
    ? `$d^2 = ${Math.abs(dx)}^2 + ${Math.abs(dy)}^2 = ${N}$, so ${rootStep}.`
    : `The differences are $${Math.abs(dx)}$ and $${Math.abs(dy)}$: a $${Math.min(Math.abs(dx), Math.abs(dy))}$-$${Math.max(Math.abs(dx), Math.abs(dy))}$-$${dTex}$ right-angled triangle, so ${rootStep}.`;
  return {
    stem,
    answer: { kind: 'exact', value: d },
    options: options(rng, d, must, extra),
    solution,
    trap: 'Pythagoras on the horizontal and vertical differences: square, add, then square-root (and simplify the surd).',
    tags: ['coordinate-geometry', 'distance', 'pythagoras'],
    params: { variant: 'distance', x1, y1, x2, y2 },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 3

/** Random line ax + by = c with a > 0, gcd(a, b) = 1, |a| ≠ |b|. */
function randomLine(rng: RNG, max = 5): [number, number] | null {
  const a = rng.int(2, max), b = rng.nonZeroInt(-max, max);
  if (gcd(a, b) !== 1 || Math.abs(a) === Math.abs(b)) return null;
  return [a, b];
}

function perpGradientQ(rng: RNG): Generated | null {
  const ab = randomLine(rng);
  if (!ab) return null;
  const [a, b] = ab;
  const c = rng.int(-12, 12);
  const zeroForm = rng.bool(0.35);
  const lineTex = zeroForm ? `${lhs(a, b)}${signed(-c, '')} = 0` : `${lhs(a, b)} = ${c}`;
  const mLine = frac(-a, b);
  const mPerp = frac(b, a);
  const must = cleanOnly([
    { value: frac(-b, a), trap: 'took the reciprocal but did not change the sign' },
    { value: frac(a, b), trap: 'changed the sign but did not take the reciprocal' },
    { value: mLine, trap: 'gave the gradient of the line itself' },
  ]);
  const extra = cleanOnly([
    { value: frac(-1, a), trap: 'treated the coefficient of x as the gradient' },
    { value: frac(-1, b), trap: 'treated the coefficient of y as the gradient' },
    { value: E(-a), trap: 'read the gradient off the coefficient of x without rearranging' },
  ]);
  const stem = rng.bool(0.5)
    ? `Find the gradient of a line perpendicular to the line $${lineTex}$.`
    : `The line $L$ has equation $${lineTex}$. Find the gradient of any line perpendicular to $L$.`;
  return {
    stem,
    answer: { kind: 'exact', value: mPerp },
    options: options(rng, mPerp, must, extra),
    solution: `Rearranging, $y = ${slopeRhs(mLine, frac(c, b))}$, so the gradient of $L$ is $${mLine.toLatex()}$. The perpendicular gradient is the negative reciprocal, $${mPerp.toLatex()}$.`,
    trap: 'Perpendicular gradient = −1 ÷ (gradient): flip the fraction AND change the sign.',
    tags: ['coordinate-geometry', 'perpendicular', 'gradient'],
    params: { variant: 'perp-gradient', a, b, c },
    typedAllowed: true,
  };
}

function pointOnLineQ(rng: RNG): Generated | null {
  const ab = randomLine(rng, 4);
  if (!ab) return null;
  const [a, b] = ab;
  const unknownX = rng.bool();
  const k = rng.nonZeroInt(-6, 6);
  const given = rng.nonZeroInt(-6, 6);
  // (k, given) or (given, k) lies on ax + by = c
  const c = unknownX ? a * k + b * given : a * given + b * k;
  if (Math.abs(c) > 40 || c === 0) return null;
  const coef = unknownX ? a : b; // coefficient of the unknown
  const other = unknownX ? b : a;
  const answer = E(k);
  const must = cleanOnly([
    { value: frac(c + other * given, coef), trap: 'sign slip when moving the known term across' },
    { value: frac(c - coef * given, other), trap: 'substituted the known coordinate for the wrong variable' },
  ]);
  const extra = cleanOnly([
    { value: frac(c - given, coef), trap: 'forgot to multiply the known coordinate by its coefficient' },
    { value: E(c - other * given), trap: 'forgot to divide by the coefficient of the unknown' },
    { value: E(given), trap: 'gave the coordinate that was already known' },
    { value: E(coef * (c - other * given)), trap: 'multiplied by the coefficient instead of dividing' },
  ]);
  const point = unknownX ? '(k, ' + given + ')' : '(' + given + ', k)';
  const sub = unknownX ? `y = ${given}` : `x = ${given}`;
  const eqn = unknownX ? `${coefTex(a)}k${signed(b * given, '')} = ${c}` : `${a * given}${signed(b, 'k')} = ${c}`;
  const rest = c - other * given;
  const solve = coef === 1 ? `$k = ${k}$` : `$${coefTex(coef)}k = ${rest}$ and $k = ${k}$`;
  return {
    stem: `The point $${point}$ lies on the line $${lhs(a, b)} = ${c}$. Find the value of $k$.`,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, must, extra),
    solution: `Substitute $${sub}$: $${eqn}$, so ${solve}.`,
    trap: 'Substitute the known coordinate for the right variable, then move the constant across before dividing.',
    tags: ['coordinate-geometry', 'substitution'],
    params: { variant: 'point-on-line', a, b, c, unknownX, given },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 4

function perpBisectorQ(rng: RNG): Generated | null {
  const x1 = rng.int(-6, 6), y1 = rng.int(-6, 6);
  const dx = rng.pick([-6, -4, -2, 2, 4, 6]);
  const dy = rng.pick([-6, -4, -2, 2, 4, 6]);
  if (Math.abs(dx) === Math.abs(dy)) return null;
  if (x1 * dx + y1 * dy === 0) return null; // then the "half the difference" point lies on the bisector and that trap vanishes
  const x2 = x1 + dx, y2 = y1 + dy;
  if (Math.abs(x2) > 9 || Math.abs(y2) > 9) return null;
  const Mx = (x1 + x2) / 2, My = (y1 + y2) / 2;
  const mAB = frac(dy, dx), mPerp = frac(-dx, dy);
  const M = [E(Mx), E(My)] as const;
  const correct = through(mPerp, M[0], M[1]);
  let form: Form = rng.pick(['slope', 'general']);
  if (form === 'slope' && !tidyInSlopeForm(correct)) form = 'general'; // the exam prints thirds in ax + by = c form
  const built = lineChoice(rng, correct, [
    { line: through(mPerp, frac(dx, 2), frac(dy, 2)), trap: 'midpoint taken as half the difference instead of half the sum' },
    { line: through(mAB, M[0], M[1]), trap: 'used the gradient of AB instead of the perpendicular gradient' },
    { line: through(frac(dx, dy), M[0], M[1]), trap: 'took the reciprocal but forgot to change the sign' },
  ], [
    { line: through(frac(-dy, dx), M[0], M[1]), trap: 'changed the sign but forgot to take the reciprocal' },
    { line: through(mPerp, E(x1), E(y1)), trap: 'perpendicular drawn through A instead of through the midpoint' },
    { line: through(mPerp, E(x2), E(y2)), trap: 'perpendicular drawn through B instead of through the midpoint' },
  ], form);
  if (!built) return null;
  return {
    stem: `Find the equation of the perpendicular bisector of the line segment joining $A${pt(x1, y1)}$ and $B${pt(x2, y2)}$.`,
    answer: { kind: 'choice', value: built.correctStr },
    options: built.options,
    solution: `Midpoint $M = ${pt(Mx, My)}$. Gradient of $AB = \\frac{${dy}}{${dx}} = ${mAB.toLatex()}$, so the perpendicular gradient is $${mPerp.toLatex()}$. Then $${shift('y', My)} = ${mPerp.toLatex()}(${shift('x', Mx)})$, i.e. ${built.correctStr}.`,
    trap: 'Perpendicular bisector: negative reciprocal gradient AND through the midpoint (half the sum of the coordinates).',
    tags: ['coordinate-geometry', 'perpendicular-bisector', 'midpoint'],
    params: { variant: 'perp-bisector', form: built.form, x1, y1, x2, y2, eq: toGeneral(correct) },
    typedAllowed: false,
  };
}

function perpThroughPointQ(rng: RNG): Generated | null {
  const givenSlope = rng.bool(0.35);
  let a: number, b: number, c0: number;
  if (givenSlope) {
    b = rng.pick([1, 1, 2, 3]);
    a = rng.nonZeroInt(-4, 4);
    if (gcd(a, b) !== 1 || Math.abs(a) === Math.abs(b)) return null;
    c0 = b * rng.int(-6, 6);
  } else {
    const ab = randomLine(rng);
    if (!ab) return null;
    [a, b] = ab;
    c0 = rng.int(-12, 12);
  }
  const px = rng.int(-6, 6), py = rng.int(-6, 6);
  const P = [E(px), E(py)] as const;
  const mLine = frac(-a, b), mPerp = frac(b, a);
  const correct = through(mPerp, P[0], P[1]);
  let form: Form = rng.pick(['slope', 'general']);
  if (form === 'slope' && !tidyInSlopeForm(correct)) form = 'general';
  const built = lineChoice(rng, correct, [
    { line: through(mLine, P[0], P[1]), trap: 'parallel line: the gradient was not changed' },
    { line: through(frac(-b, a), P[0], P[1]), trap: 'took the reciprocal but did not change the sign' },
    { line: through(frac(a, b), P[0], P[1]), trap: 'changed the sign but did not take the reciprocal' },
  ], [
    { line: through(mPerp, E(0), E(0)), trap: 'forgot to make the line pass through the given point' },
    { line: { m: mPerp, c: correct.c.neg() }, trap: 'sign slip in the intercept' },
    { line: { m: mPerp, c: P[1].add(mPerp.mul(P[0])) }, trap: 'substituted with the wrong sign: c = y + mx instead of y − mx' },
    { line: through(frac(-1, a), P[0], P[1]), trap: 'treated the coefficient of x as the gradient' },
  ], form);
  if (!built) return null;
  const givenTex = givenSlope ? renderSlope({ m: mLine, c: frac(c0, b) }) : renderGeneral([a, b, c0]);
  return {
    stem: `Find the equation of the line through $${pt(px, py)}$ that is perpendicular to the line ${givenTex}.`,
    answer: { kind: 'choice', value: built.correctStr },
    options: built.options,
    solution: `The given line has gradient $${mLine.toLatex()}$, so the perpendicular gradient is $${mPerp.toLatex()}$. Then $${shift('y', py)} = ${mPerp.toLatex()}(${shift('x', px)})$, i.e. ${built.correctStr}.`,
    trap: 'Rearrange to find the gradient, take the negative reciprocal, then use y − y₁ = m(x − x₁) with the given point.',
    tags: ['coordinate-geometry', 'perpendicular', 'equation-of-line'],
    params: { variant: 'perp-through-point', form: built.form, a, b, c0, px, py, eq: toGeneral(correct) },
    typedAllowed: false,
  };
}

function collinearQ(rng: RNG): Generated | null {
  const x1 = rng.int(-5, 5), y1 = rng.int(-5, 5);
  const dx = rng.nonZeroInt(-4, 4), dy = rng.nonZeroInt(-6, 6);
  const j = rng.intExcluding(-6, 8, [0, dx]);
  const m = frac(dy, dx);
  const k = E(y1).add(m.mulRat(j));
  if (!isCleanExact(k).ok || k.toRat().d > 2n) return null;
  const x2 = x1 + dx, y2 = y1 + dy, x3 = x1 + j;
  const swap = rng.bool(0.4); // present the transposed picture: unknown is then an x-coordinate
  const A = swap ? pt(y1, x1) : pt(x1, y1);
  const B = swap ? pt(y2, x2) : pt(x2, y2);
  const C = swap ? `(k, ${x3})` : `(${x3}, k)`;
  const must = cleanOnly([
    { value: E(y1).add(frac(dx, dy).mulRat(j)), trap: 'gradient inverted' },
    { value: E(y1).sub(m.mulRat(j)), trap: 'sign error in the gradient' },
  ]);
  const extra = cleanOnly([
    { value: m.mulRat(x3), trap: 'assumed the line passes through the origin (used y = mx)' },
    { value: E(y2).add(m.mulRat(j)), trap: 'started from B but used the distance from A' },
    { value: frac(y1 + y2, 2), trap: 'assumed C is the midpoint of AB' },
    { value: E(y1).add(m.mulRat(x3 + x1)), trap: 'added the coordinates instead of subtracting' },
  ]);
  const grad = swap ? `\\frac{${x2} - ${br(x1)}}{${y2} - ${br(y1)}} = ${frac(dx, dy).toLatex()}` : `\\frac{${y2} - ${br(y1)}}{${x2} - ${br(x1)}} = ${m.toLatex()}`;
  const step = swap
    ? `\\frac{${x3} - ${br(x1)}}{k - ${br(y1)}} = ${frac(dx, dy).toLatex()}`
    : `\\frac{k - ${br(y1)}}{${x3} - ${br(x1)}} = ${m.toLatex()}`;
  return {
    stem: `The points $A${A}$, $B${B}$ and $C${C}$ are collinear. Find the value of $k$.`,
    answer: { kind: 'exact', value: k },
    options: options(rng, k, must, extra),
    solution: `Gradient of $AB = ${grad}$. $AC$ must have the same gradient: $${step}$, so $k = ${y1} ${j * dy / dx >= 0 ? '+' : '-'} ${m.abs().toLatex()} \\times ${Math.abs(j)} = ${k.toLatex()}$.`,
    trap: 'Collinear means equal gradients; equate gradient AC to gradient AB, keeping the same order of subtraction.',
    tags: ['coordinate-geometry', 'collinear', 'gradient'],
    params: { variant: 'collinear', swap, x1, y1, x2, y2, x3 },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 5

/** Shared option list for the intersection questions: the answer is x + y at the meeting point. */
function intersectionOptions(rng: RNG, X: number, Y: number, slip: Exact | null, slipTrap: string, back: Exact | null) {
  const answer = E(X + Y);
  const integer = (v: Exact | null) => (v && v.isInteger() && !v.equals(answer) ? v : null);
  const must = cleanOnly([
    { value: integer(slip), trap: slipTrap },
    { value: E(X), trap: 'gave only the x-coordinate' },
  ]);
  const extra = cleanOnly([
    { value: integer(back), trap: 'sign slip when substituting back to find the second coordinate' },
    { value: E(Y), trap: 'gave only the y-coordinate' },
    { value: E(X - Y), trap: 'subtracted the coordinates' },
    { value: E(Y - X), trap: 'subtracted the coordinates the other way' },
    { value: E(X * Y), trap: 'multiplied the coordinates' },
    { value: E(X + Y + 1), trap: 'arithmetic slip of 1 in the final sum' },
    { value: E(X + Y - 1), trap: 'arithmetic slip of 1 in the final sum' },
  ]);
  return options(rng, answer, must, extra);
}

/** y = (p/q)x + c₁ with a fractional gradient, meeting ax + by = c: substitution with an integer expansion. */
function substitutionQ(rng: RNG): Generated | null {
  const qd = rng.pick([2, 3]);
  const pn = rng.pick(qd === 2 ? [-3, -1, 1, 3] : [-4, -2, -1, 1, 2, 4]);
  const X = qd * rng.nonZeroInt(-2, 2); // a multiple of q keeps the intercept c₁ an integer
  const Y = rng.nonZeroInt(-5, 6);
  if (X + Y === 0 || X === Y) return null; // keep x − y, y − x and x + y apart
  const m = frac(pn, qd);
  const c1 = Y - (pn * X) / qd;
  if (Math.abs(c1) > 12) return null;
  const a = rng.int(1, 4);
  const b = qd * rng.pick([-2, -1, 1, 2]); // q | b so the substituted bracket expands to integers
  if (gcd(a, b) !== 1) return null;
  const bm = (b * pn) / qd;
  const K = a + bm;
  if (K === 0) return null;
  const c = a * X + b * Y;
  if (Math.abs(c) > 30) return null;
  const line1: Line = { m, c: E(c1) };
  const gen: Triple = [a, b, c];
  // Sign slip in the bracket: a x + b(mx − c₁) = c
  const xs = frac(c + b * c1, K);
  const slip = xs.add(m.mul(xs)).add(E(c1));
  const rhs = slopeRhs(m, E(c1));
  const solve = K === 1 ? `so $x = ${X}$` : `so $${coefTex(K)}x = ${c - b * c1}$ and $x = ${X}$`;
  return {
    stem: `The lines ${renderSlope(line1)} and ${renderGeneral(gen)} intersect at the point $P$. Find the sum of the $x$- and $y$-coordinates of $P$.`,
    answer: { kind: 'exact', value: E(X + Y) },
    options: intersectionOptions(rng, X, Y, slip, 'sign slip when substituting y = mx + c into the second equation', c1 === 0 ? null : E(X + Y - 2 * c1)),
    solution: `Substitute $y = ${rhs}$ into the second equation: $${coefTex(a)}x ${b < 0 ? '-' : '+'} ${Math.abs(b)}\\left(${rhs}\\right) = ${c}$, i.e. $${coefTex(a)}x${signed(bm, 'x')}${signed(b * c1, '')} = ${c}$, ${solve}. Then $y = ${Y}$, so $P = ${pt(X, Y)}$ and the sum is $${X + Y}$.`,
    trap: 'Substitute the y = mx + c line into the other equation and expand the bracket carefully, including its sign.',
    tags: ['coordinate-geometry', 'intersection', 'simultaneous-equations'],
    params: { variant: 'intersection', l1: toGeneral(line1), l2: gen },
    typedAllowed: true,
  };
}

/** Both lines in general form with two-digit coefficients ruled out: solve by elimination. */
function eliminationQ(rng: RNG): Generated | null {
  const X = rng.nonZeroInt(-5, 6), Y = rng.nonZeroInt(-5, 6);
  if (X + Y === 0 || X === Y) return null; // keep x − y, y − x and x + y apart
  const pickLine = (): [number, number] | null => {
    const a = rng.int(2, 4), b = rng.nonZeroInt(-4, 4);
    return Math.abs(b) >= 2 && gcd(a, b) === 1 ? [a, b] : null;
  };
  const l1 = pickLine(), l2 = pickLine();
  if (!l1 || !l2) return null;
  const [a1, b1] = l1, [a2, b2] = l2;
  if (a1 * b2 - a2 * b1 === 0) return null;
  const c1 = a1 * X + b1 * Y, c2 = a2 * X + b2 * Y;
  if (Math.abs(c1) > 30 || Math.abs(c2) > 30) return null;
  // Eliminate whichever variable needs the smaller multipliers.
  const Ly = lcm(Math.abs(b1), Math.abs(b2)), Lx = lcm(a1, a2);
  const elimY = Ly <= Lx;
  const k1 = elimY ? Ly / Math.abs(b1) : Lx / a1;
  const k2 = elimY ? Ly / Math.abs(b2) : Lx / a2;
  const sameSign = elimY ? Math.sign(b1) === Math.sign(b2) : true;
  const s = sameSign ? -1 : 1; // subtract when the matched coefficients have the same sign, else add
  const K = elimY ? k1 * a1 + s * k2 * a2 : k1 * b1 + s * k2 * b2;
  const M = k1 * c1 + s * k2 * c2;
  const first = elimY ? X : Y;
  if (K === 0 || M !== K * first) return null;
  const scaled = (k: number, a: number, b: number, c: number, which: string) =>
    (k === 1 ? `the ${which} equation as it stands` : `$${k} \\times$ the ${which} equation, $${lhs(k * a, k * b)} = ${k * c}$`);
  const v = elimY ? 'x' : 'y';
  const solveTex = K === 1 ? `$${v} = ${first}$` : `$${coefTex(K)}${v} = ${M}$, so $${v} = ${first}$`;
  const then = elimY ? `Then $y = ${Y}$` : `Then $x = ${X}$`;
  // The slip: adding when you should subtract (or vice versa) — the combined equation with the other sign.
  const Kw = elimY ? k1 * a1 - s * k2 * a2 : k1 * b1 - s * k2 * b2;
  const Mw = k1 * c1 - s * k2 * c2;
  const slip = attempt(() => {
    const w = frac(Mw, Kw); // wrong value of the first variable
    const other = elimY ? E(c1).sub(w.mulRat(a1)).div(E(b1)) : E(c1).sub(w.mulRat(b1)).div(E(a1));
    return w.add(other);
  });
  // Back-substitution slip: the known coordinate's term moved across with the wrong sign.
  const back = attempt(() => (elimY ? E(X).add(frac(c1 + a1 * X, b1)) : E(Y).add(frac(c1 + b1 * Y, a1))));
  return {
    stem: `The lines ${renderGeneral([a1, b1, c1])} and ${renderGeneral([a2, b2, c2])} intersect at the point $P$. Find the sum of the $x$- and $y$-coordinates of $P$.`,
    answer: { kind: 'exact', value: E(X + Y) },
    options: intersectionOptions(rng, X, Y, slip, 'added the equations when they should have been subtracted (or vice versa)', back),
    solution: `Eliminate $${elimY ? 'y' : 'x'}$: take ${scaled(k1, a1, b1, c1, 'first')} and ${scaled(k2, a2, b2, c2, 'second')}; ${sameSign ? 'subtracting' : 'adding'} gives ${solveTex}. ${then}, so $P = ${pt(X, Y)}$ and the sum is $${X + Y}$.`,
    trap: 'Match one coefficient by multiplying, then subtract when the matched terms have the same sign and add when they differ.',
    tags: ['coordinate-geometry', 'intersection', 'simultaneous-equations', 'elimination'],
    params: { variant: 'intersection', l1: [a1, b1, c1], l2: [a2, b2, c2] },
    typedAllowed: true,
  };
}

/** Keep the wrong areas within a factor of 3 of the right one: outside that range nobody is fooled. */
function plausibleAreas(area: Exact, ds: { value: Exact | null; trap: string }[]): Distractor[] {
  const A = area.toNumber();
  return cleanOnly(ds).filter((d) => d.value.toNumber() >= A / 3 && d.value.toNumber() <= 3 * A);
}

const INTERCEPTS = [-12, -10, -9, -8, -6, -5, -4, -3, 3, 4, 5, 6, 8, 9, 10, 12];

function axesAreaQ(rng: RNG): Generated | null {
  const p = rng.pick(INTERCEPTS); // x-intercept
  const q = rng.pick(INTERCEPTS); // y-intercept
  if (Math.abs(p) === Math.abs(q)) return null; // a square triangle makes too many wrong routes coincide
  const g = gcd(p, q);
  let a = q / g, b = p / g, c = (p * q) / g; // x/p + y/q = 1  →  qx + py = pq
  if (a < 0) { a = -a; b = -b; c = -c; }
  // Level 5: both intercepts must be solved for, so no unit coefficient (and no integer gradient).
  if (a < 2 || Math.abs(b) < 2 || Math.abs(c) > 120) return null;
  const form: Form = rng.bool(0.5) ? 'general' : 'slope';
  const line = fromGeneral([a, b, c]);
  if (form === 'slope' && (Math.abs(b) > 5 || a > 5)) return null; // keep the printed gradient simple
  const area = frac(Math.abs(p * q), 2);
  const half = frac(1, 2).toRat();
  const formSpecific = form === 'general'
    ? [
      { value: frac(Math.abs(a * b), 2), trap: 'read the coefficients as the intercepts' },
      { value: frac(Math.abs(p * c), 2), trap: 'read the constant term as the y-intercept' },
      { value: frac(Math.abs(q * c), 2), trap: 'read the constant term as the x-intercept' },
    ]
    : [
      { value: attempt(() => line.c.mul(line.m).abs().mul(line.c.abs()).mulRat(half)), trap: 'multiplied the y-intercept by the gradient instead of dividing to find the x-intercept' },
      { value: attempt(() => line.c.abs().mul(line.m.abs()).mulRat(half)), trap: 'used the gradient as the x-intercept' },
    ];
  const must = plausibleAreas(area, [{ value: E(Math.abs(p * q)), trap: 'forgot the ½ in the area of a triangle' }]);
  const extra = plausibleAreas(area, [
    { value: frac(p * p, 2), trap: 'used the x-intercept for both sides' },
    { value: frac(q * q, 2), trap: 'used the y-intercept for both sides' },
    { value: area.mulRat(half), trap: 'halved twice' },
    { value: E(Math.abs(p) + Math.abs(q)), trap: 'added the intercepts instead of multiplying' },
    { value: frac(Math.abs(p) * (Math.abs(q) + 1), 2), trap: 'off by one in the y-intercept' },
    { value: frac((Math.abs(p) - 1) * Math.abs(q), 2), trap: 'off by one in the x-intercept' },
    ...formSpecific,
  ]);
  return {
    stem: `Find the area of the triangle enclosed by the line ${render(line, form)} and the coordinate axes.`,
    answer: { kind: 'exact', value: area },
    options: options(rng, area, must, extra),
    solution: `When $y = 0$, $x = ${p}$; when $x = 0$, $y = ${q}$. The triangle has legs $${Math.abs(p)}$ and $${Math.abs(q)}$ along the axes, so its area is $\\frac{1}{2} \\times ${Math.abs(p)} \\times ${Math.abs(q)} = ${area.toLatex()}$.`,
    trap: 'Find both intercepts (set y = 0, then x = 0); the area is ½ × |x-intercept| × |y-intercept|, not the product.',
    tags: ['coordinate-geometry', 'intercepts', 'area'],
    params: { variant: 'axes-area', a, b, c },
    typedAllowed: true,
  };
}

/** Triangle between y = (p/q)x + c, the x-axis and the vertical line x = k. */
function verticalAreaQ(rng: RNG): Generated | null {
  const qd = rng.pick([2, 3, 4]);
  const pn = rng.pick([1, 2, 3, 5].filter((v) => gcd(v, qd) === 1)) * rng.sign(); // gradient p/q
  const s = rng.nonZeroInt(-3, 3);
  const c = pn * s; // y-intercept, chosen so the x-intercept −c/m = −sq is an integer
  const x0 = -s * qd;
  const t = rng.pick([1, 2, 3]); // base = qt, height = |p|t
  if (Math.abs(s) === t) return null; // otherwise |c| = height and |x0| = base, and the wrong routes coincide
  const k = x0 + rng.sign() * qd * t;
  if (k === 0 || k === -x0 || Math.abs(k) > 12 || Math.abs(c) > 12) return null; // k = −x0 makes the picture symmetric and the wrong routes coincide
  const base = qd * t, height = Math.abs(pn) * t;
  if (height > 20 || base * height < 12) return null; // an area below 6 is not a level-5 count
  const m = frac(pn, qd);
  const yk = m.mulRat(k).add(E(c)); // y-coordinate where x = k meets the line
  const area = frac(base * height, 2);
  const half = frac(1, 2).toRat();
  const must = plausibleAreas(area, [{ value: E(base * height), trap: 'forgot the ½ in the area of a triangle' }]);
  const extra = plausibleAreas(area, [
    { value: E(Math.abs(k) * height).mulRat(half), trap: 'used x = k as the base instead of the distance from the x-intercept' },
    { value: E(base * Math.abs(c)).mulRat(half), trap: 'used the y-intercept as the height' },
    { value: E(Math.abs(x0) * Math.abs(c)).mulRat(half), trap: 'found the triangle the line makes with the axes instead' },
    { value: k + x0 !== 0 ? E(Math.abs(k + x0) * height).mulRat(half) : null, trap: 'added the x-coordinates instead of subtracting to get the base' },
    { value: m.mulRat(k).sub(E(c)).abs().mulRat(base).mulRat(half), trap: 'sign slip in the height' },
    { value: E(base * Math.abs(k)).mulRat(half), trap: 'used k as the height' },
    { value: E(Math.abs(x0) * height).mulRat(half), trap: 'used the x-intercept as the base' },
    { value: m.mulRat(k).abs().mulRat(base).mulRat(half), trap: 'forgot the constant when finding y at x = k' },
    { value: area.mulRat(half), trap: 'halved twice' },
    { value: E(Math.abs(k) * Math.abs(c)).mulRat(half), trap: 'measured the base from the origin and used the y-intercept as the height' },
    { value: E((base + 1) * height).mulRat(half), trap: 'off by one in the base' },
  ]);
  const line: Line = { m, c: E(c) };
  return {
    stem: `Find the area of the triangle enclosed by the line ${renderSlope(line)}, the $x$-axis and the line $x = ${k}$.`,
    answer: { kind: 'exact', value: area },
    options: options(rng, area, must, extra),
    solution: `The line meets the $x$-axis where $${slopeRhs(m, E(c))} = 0$, i.e. $x = ${x0}$; at $x = ${k}$ it has $y = ${yk.toLatex()}$. So the base is $${base}$, the height is $${height}$ and the area is $\\frac{1}{2} \\times ${base} \\times ${height} = ${area.toLatex()}$.`,
    trap: 'The base runs from the x-intercept to x = k (not from the origin) and the height is |y| at x = k; then halve the product.',
    tags: ['coordinate-geometry', 'intercepts', 'area'],
    params: { variant: 'vertical-area', pn, qd, c, k },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'm1.coord-geom.lines',
  module: 'M1',
  topic: 'coord-geom',
  title: 'Gradients, midpoints, distances & perpendiculars',
  levels: {
    1: 'gradient of the line through two lattice points, or its y-intercept',
    2: 'distance between two points: Pythagorean triple or a surd like 2√5',
    3: 'gradient perpendicular to ax + by = c; find k so that (k, 3) is on the line',
    4: 'equation of a perpendicular bisector / perpendicular through a point; k for collinear points',
    5: 'intersection of two lines (sum of coordinates); area a line cuts off with the axes',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return pickVariant(rng, [gradientQ, gradientQ, interceptQ]);
        case 2: return distanceQ(rng);
        case 3: return pickVariant(rng, [perpGradientQ, pointOnLineQ]);
        case 4: return pickVariant(rng, [perpBisectorQ, perpThroughPointQ, collinearQ]);
        default: return pickVariant(rng, [substitutionQ, eliminationQ, axesAreaQ, verticalAreaQ]);
      }
    });
  },
  verify(q) {
    const p = q.params as Record<string, number> & { variant: string; form?: Form; eq?: Triple; l1?: Triple; l2?: Triple; unknownX?: boolean; swap?: boolean };
    const close = (x: number, y: number) => Math.abs(x - y) < 1e-9 * Math.max(1, Math.abs(y));
    const onLine = ([A, B, C]: Triple, x: number, y: number) => Math.abs(A * x + B * y - C) < 1e-9;
    if (q.answer.kind === 'choice') {
      // Two independent points that must lie on the answer line, built with vectors from the raw data.
      const eq = p.eq!;
      let P1: [number, number], P2: [number, number];
      if (p.variant === 'perp-bisector') {
        const dx = p.x2 - p.x1, dy = p.y2 - p.y1;
        P1 = [(p.x1 + p.x2) / 2, (p.y1 + p.y2) / 2];
        P2 = [P1[0] - dy, P1[1] + dx]; // move along a vector perpendicular to AB
      } else if (p.variant === 'perp-through-point') {
        P1 = [p.px, p.py];
        P2 = [p.px + p.a, p.py + p.b]; // (a, b) is normal to ax + by = c, hence along the perpendicular
      } else return false;
      if (!onLine(eq, P1[0], P1[1]) || !onLine(eq, P2[0], P2[1])) return false;
      // The chosen option must be the rendering of that same line in the question's form.
      const expected = p.form === 'general' ? renderGeneral(eq) : renderSlope(fromGeneral(eq));
      return q.answer.value === expected && q.options.filter((o) => o.correct).length === 1;
    }
    if (q.answer.kind !== 'exact') return false;
    const got = q.answer.value.toNumber();
    switch (p.variant) {
      case 'gradient':
        return close(got, (p.y2 - p.y1) / (p.x2 - p.x1));
      case 'intercept': {
        const m = (p.y2 - p.y1) / (p.x2 - p.x1);
        return close(got, p.y1 - m * p.x1) && close(got, p.y2 - m * p.x2);
      }
      case 'distance': {
        const d = Math.hypot(p.x2 - p.x1, p.y2 - p.y1);
        const t = q.answer.value.terms;
        return close(got, d) && t.length === 1 && !q.answer.value.hasPi();
      }
      case 'perp-gradient': {
        // product of gradients must be −1; the line's gradient comes from a direction vector (b, −a)
        const mLine = -p.a / p.b;
        return close(got * mLine, -1);
      }
      case 'point-on-line': {
        const x = p.unknownX ? got : p.given, y = p.unknownX ? p.given : got;
        return onLine([p.a, p.b, p.c], x, y);
      }
      case 'collinear': {
        // cross product of AB and AC must vanish, using the displayed coordinates
        const pts = p.swap
          ? [[p.y1, p.x1], [p.y2, p.x2], [got, p.x3]]
          : [[p.x1, p.y1], [p.x2, p.y2], [p.x3, got]];
        const [A, B, C] = pts;
        return Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0])) < 1e-9;
      }
      case 'intersection': {
        // Cramer's rule on the two general-form equations
        const [A1, B1, C1] = p.l1!, [A2, B2, C2] = p.l2!;
        const det = A1 * B2 - A2 * B1;
        if (det === 0) return false;
        const x = (C1 * B2 - C2 * B1) / det, y = (A1 * C2 - A2 * C1) / det;
        return close(got, x + y);
      }
      case 'axes-area': {
        const xi = p.c / p.a, yi = p.c / p.b;
        // shoelace on (0,0), (xi,0), (0,yi)
        return close(got, Math.abs(xi * yi) / 2);
      }
      case 'vertical-area': {
        // shoelace on the three vertices: x-intercept, (k, 0) and the point of the line above/below x = k
        const m = p.pn / p.qd;
        const V: [number, number][] = [[-p.c / m, 0], [p.k, 0], [p.k, m * p.k + p.c]];
        let twice = 0;
        for (let i = 0; i < 3; i++) {
          const [x1, y1] = V[i], [x2, y2] = V[(i + 1) % 3];
          twice += x1 * y2 - x2 * y1;
        }
        return close(got, Math.abs(twice) / 2);
      }
      default:
        return false;
    }
  },
});
