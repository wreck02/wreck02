import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, surd, Exact } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { poly } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Optimisation problems whose optimum is a clean number. Stems are fully in words (no diagram).
 * Level 1: maximum of y = k − (x − a)² given expanded; largest area of a rectangle with a fixed perimeter
 * Level 2: two numbers with a fixed sum: largest product / smallest sum of squares
 * Level 3: rectangle against a wall with L m of fencing on three sides: maximum area L²/8
 * Level 4: open box from a square sheet of side a: the corner cut x = a/6 gives the greatest volume 2a³/27
 * Level 5: minimise ax + b/x for x > 0 (2√(ab)); cylinder of fixed surface area; box of fixed volume with least surface area
 *
 * verify() rebuilds the objective from params and locates its optimum numerically (grid + golden section).
 */

const FR = { format: 'fraction' as const };

type Cand = { value: Exact | null; trap: string };

function attempt(f: () => Exact): Exact | null {
  try {
    const v = f();
    return Number.isFinite(v.toNumber()) ? v : null;
  } catch {
    return null;
  }
}

function cleanOnly(ds: Cand[]): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } => d.value !== null && Number.isFinite(d.value.toNumber()) && isCleanExact(d.value).ok);
}

/** Every distinct `must` candidate is used before any `extra` one, so the headline traps are never shuffled out. */
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

function options(rng: RNG, answer: Exact, must: Cand[], extra: Cand[]) {
  return buildOptions(rng, answer, ranked(rng, answer, cleanOnly(must), cleanOnly(extra)), FR);
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

type Ask = 'value' | 'x';

// ----------------------------------------------------------------------------- level 1

function vertexMaxQ(rng: RNG): Generated | null {
  const a = rng.nonZeroInt(-4, 4);
  const k = rng.int(1, 12);
  const coefs = [-1, 2 * a, k - a * a];
  const ask: Ask = rng.bool(0.7) ? 'value' : 'x';
  const answer = ask === 'value' ? E(k) : E(a);
  const must: Cand[] = ask === 'value'
    ? [{ value: E(a), trap: 'gave the value of x at which the maximum occurs' }, { value: E(k - 2 * a * a), trap: 'sign slip when completing the square' }]
    : [{ value: E(k), trap: 'gave the maximum value instead of where it occurs' }, { value: E(-a), trap: 'sign slip: the vertex is at x = −b/(2a)' }];
  const extra: Cand[] = [
    { value: E(k - a * a), trap: 'gave the constant term, y(0)' },
    { value: E(2 * a), trap: 'read off the coefficient of x' },
    { value: ask === 'value' ? E(-k) : E(2 * a), trap: 'sign slip' },
    { value: E(k + a * a), trap: 'added the square instead of subtracting when completing the square' },
  ];
  return {
    stem: ask === 'value'
      ? `Find the maximum value of $y = ${poly(coefs)}$.`
      : `Find the value of $x$ for which $y = ${poly(coefs)}$ takes its maximum value.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: options(rng, answer, must, extra),
    solution: `$\\frac{dy}{dx} = ${poly([-2, 2 * a])} = 0$ at $x = ${a}$, and there $y = ${k}$. (Equivalently $y = ${k} - (${poly([1, -a])})^{2} \\le ${k}$.)`,
    trap: 'Distinguish the maximum value (y) from where it occurs (x): the question says which one it wants.',
    tags: ['differentiation', 'optimisation', 'quadratic'],
    params: { variant: 'vertex', coefs, ask },
    typedAllowed: true,
  };
}

const PERIMETERS = [8, 12, 16, 20, 24, 28, 32, 36, 40, 48, 60, 80, 100];

function rectanglePerimeterQ(rng: RNG): Generated | null {
  const P = rng.pick(PERIMETERS);
  const ask: Ask = rng.bool(0.7) ? 'value' : 'x';
  const side = P / 4;
  const answer = ask === 'value' ? E(side * side) : E(side);
  const must: Cand[] = ask === 'value'
    ? [{ value: E(side), trap: 'gave the side length instead of the area' }, { value: frac(P * P, 8), trap: 'used the three-sided (wall) result L²/8' }]
    : [{ value: E(side * side), trap: 'gave the area instead of the side' }, { value: E(P / 2), trap: 'used half the perimeter as the side' }];
  const extra: Cand[] = [
    { value: frac(P * P, 4), trap: 'used half the perimeter as the side length' },
    { value: E(P), trap: 'gave the perimeter' },
    { value: frac(P * P, 2), trap: 'multiplied half-perimeter by itself twice over' },
    { value: E(P / 8), trap: 'halved the side' },
    { value: frac(P * P, 12), trap: 'divided by 12' },
  ];
  return {
    stem: ask === 'value'
      ? `A rectangle has perimeter $${P}$ cm. Find the greatest possible area of the rectangle, in cm$^2$.`
      : `A rectangle has perimeter $${P}$ cm. Find the length, in cm, of each side of the rectangle of greatest possible area.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: options(rng, answer, must, extra),
    solution: `With sides $x$ and $${P / 2} - x$, $A = x(${P / 2} - x) = ${P / 2}x - x^2$, so $\\frac{dA}{dx} = ${P / 2} - 2x = 0$ at $x = ${side}$: a square of side $${side}$ and area $${side * side}$ cm$^2$.`,
    trap: 'Write the area in one variable using the perimeter constraint; the maximum is the square (P/4 each side), and area = side², not the perimeter.',
    tags: ['differentiation', 'optimisation', 'area'],
    params: { variant: 'rect-perimeter', P, ask },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 2

const SUMS = [8, 10, 12, 14, 16, 18, 20, 24, 30, 40, 50, 100];

function sumProductQ(rng: RNG): Generated | null {
  const S = rng.pick(SUMS);
  const ask: Ask = rng.bool(0.75) ? 'value' : 'x';
  const half = S / 2;
  const answer = ask === 'value' ? E(half * half) : E(half);
  const must: Cand[] = ask === 'value'
    ? [{ value: E(half), trap: 'gave one of the numbers instead of the product' }, { value: E(half * half - 1), trap: 'a neighbouring pair (S/2 ± 1), not the maximum' }]
    : [{ value: E(half * half), trap: 'gave the product instead of one of the numbers' }, { value: E(S), trap: 'gave the sum' }];
  const extra: Cand[] = [
    { value: frac(S * S, 2), trap: 'squared the sum and halved' },
    { value: E(S), trap: 'gave the sum' },
    { value: E(2 * S), trap: 'doubled the sum' },
    { value: frac(S * S, 8), trap: 'divided by 8 instead of 4' },
    { value: E(half - 1), trap: 'off by one' },
  ];
  return {
    stem: ask === 'value'
      ? `Two positive numbers have a sum of $${S}$. Find the greatest possible value of their product.`
      : `Two positive numbers have a sum of $${S}$ and their product is as large as possible. Find the larger of the two numbers.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: options(rng, answer, must, extra),
    solution: `Let the numbers be $x$ and $${S} - x$: $P = x(${S} - x)$, so $\\frac{dP}{dx} = ${S} - 2x = 0$ at $x = ${half}$. Both numbers are $${half}$ and $P = ${half * half}$.`,
    trap: 'Express the product in one variable with the sum constraint; the maximum is when the numbers are equal (S/2 each) and the product is (S/2)².',
    tags: ['differentiation', 'optimisation', 'product'],
    params: { variant: 'sum-product', S, ask },
    typedAllowed: true,
  };
}

function sumSquaresQ(rng: RNG): Generated | null {
  const S = rng.pick(SUMS);
  const half = S / 2;
  const answer = E(S * S / 2);
  return {
    stem: `Two numbers have a sum of $${S}$. Find the least possible value of the sum of their squares.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: options(rng, answer, [
      { value: E(half * half), trap: 'squared only one of the numbers' },
      { value: E(half), trap: 'gave one of the numbers instead of the sum of squares' },
    ], [
      { value: E(S * S), trap: 'squared the sum instead of summing the squares' },
      { value: frac(S * S, 4), trap: 'gave (S/2)²' },
      { value: frac(S * S, 8), trap: 'divided by 8' },
      { value: E(2 * S), trap: 'doubled the sum' },
    ]),
    solution: `With numbers $x$ and $${S} - x$: $Q = x^2 + (${S} - x)^2$, so $\\frac{dQ}{dx} = 2x - 2(${S} - x) = 4x - ${2 * S} = 0$ at $x = ${half}$, giving $Q = 2 \\times ${half}^2 = ${S * S / 2}$.`,
    trap: 'Minimise x² + (S − x)²: the numbers are equal at the minimum, and you must add both squares, (S/2)² + (S/2)².',
    tags: ['differentiation', 'optimisation', 'squares'],
    params: { variant: 'sum-squares', S },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 3: fencing against a wall

const FENCING = [16, 20, 24, 32, 40, 48, 60, 80, 100, 120];

function wallQ(rng: RNG): Generated | null {
  const L = rng.pick(FENCING);
  const ask = rng.weighted(['area', 'perp', 'parallel'] as const, [6, 2, 2]);
  const perp = L / 4, par = L / 2, area = (L * L) / 8;
  const answer = ask === 'area' ? E(area) : ask === 'perp' ? E(perp) : E(par);
  const must: Cand[] = ask === 'area'
    ? [{ value: frac(L * L, 16), trap: 'treated it as four sides of fencing (a square of side L/4)' }, { value: E(perp), trap: 'gave a side length instead of the area' }]
    : ask === 'perp'
      ? [{ value: E(par), trap: 'gave the side parallel to the wall' }, { value: frac(L, 3), trap: 'assumed three equal sides' }]
      : [{ value: E(perp), trap: 'gave a side perpendicular to the wall' }, { value: frac(L, 3), trap: 'assumed three equal sides' }];
  const extra: Cand[] = ask === 'area'
    ? [
      { value: frac(L * L, 4), trap: 'used L/2 for both dimensions' },
      { value: frac(L * L, 9), trap: 'assumed three equal sides of L/3' },
      { value: E(par), trap: 'gave the length of the side parallel to the wall' },
      { value: frac(L * L, 2), trap: 'forgot to divide by 4 when finding the sides' },
      { value: frac(L * L, 12), trap: 'used L/3 and L/4' },
    ]
    : [
      { value: E(area), trap: 'gave the area' },
      { value: frac(L, 8), trap: 'halved again' },
      { value: E(L), trap: 'gave the total length of fencing' },
      { value: frac(L, 6), trap: 'divided by 6' },
    ];
  const what = ask === 'area' ? 'Find the greatest possible area of the enclosure, in m$^2$.'
    : ask === 'perp' ? 'Find the length, in m, of each side perpendicular to the wall when the enclosed area is as large as possible.'
      : 'Find the length, in m, of the side parallel to the wall when the enclosed area is as large as possible.';
  return {
    stem: `A farmer has $${L}$ m of fencing and uses all of it to make three sides of a rectangular enclosure, the fourth side being an existing straight wall. ${what}`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: options(rng, answer, must, extra),
    solution: `Let each side perpendicular to the wall be $x$ m, so the side parallel to it is $${L} - 2x$. $A = x(${L} - 2x) = ${L}x - 2x^2$ and $\\frac{dA}{dx} = ${L} - 4x = 0$ at $x = ${perp}$: the sides are $${perp}$ m and $${par}$ m, and $A = ${perp} \\times ${par} = ${area}$ m$^2$.`,
    trap: 'Only three sides use fencing: L = 2x + y, not 2x + 2y; the optimum has the parallel side twice the perpendicular one, area L²/8.',
    tags: ['differentiation', 'optimisation', 'fencing'],
    params: { variant: 'wall', L, ask },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 4: open box from a square sheet

const SHEETS = [12, 18, 24, 30, 36];

function boxQ(rng: RNG): Generated | null {
  const a = rng.pick(SHEETS);
  const ask: Ask = rng.bool(0.6) ? 'x' : 'value';
  const x = a / 6;
  const V = (2 * a ** 3) / 27;
  const answer = ask === 'x' ? E(x) : E(V);
  const must: Cand[] = ask === 'x'
    ? [{ value: E(a / 2), trap: 'the other root of V′(x) = 0, where the volume is zero' }, { value: E(a / 4), trap: 'divided by 4 instead of 6' }]
    : [{ value: E(x), trap: 'gave the value of x instead of the volume' }, { value: frac(a ** 3, 16), trap: 'used x = a/4' }];
  const extra: Cand[] = ask === 'x'
    ? [
      { value: E(a / 3), trap: 'divided by 3' },
      { value: E(a / 12), trap: 'divided by 12' },
      { value: E(V), trap: 'gave the maximum volume' },
      { value: E(x + 1), trap: 'arithmetic slip' },
    ]
    : [
      { value: frac(a ** 3, 27), trap: 'used x = a/3' },
      { value: frac(a * a, 9), trap: 'forgot to square the base side' },
      { value: frac(4 * a * a, 9), trap: 'gave the base area only' },
      { value: frac(a ** 3, 6), trap: 'used x·a² instead of x(a − 2x)²' },
    ];
  const base = a - 2 * x;
  return {
    stem: `An open box is made from a square sheet of card of side $${a}$ cm by cutting a square of side $x$ cm from each corner and folding up the sides. ` +
      (ask === 'x' ? 'Find the value of $x$ for which the volume of the box is greatest.' : 'Find the greatest possible volume of the box, in cm$^3$.'),
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: options(rng, answer, must, extra),
    solution: `$V = x(${a} - 2x)^2$, so $\\frac{dV}{dx} = (${a} - 2x)^2 - 4x(${a} - 2x) = (${a} - 2x)(${a} - 6x) = 0$ at $x = ${x}$ (the root $x = ${a / 2}$ gives $V = 0$).` +
      (ask === 'value' ? ` Then $V = ${x} \\times ${base}^2 = ${V}$ cm$^3$.` : ''),
    trap: 'V = x(a − 2x)²: differentiate as a product (or expand) and take the root x = a/6, not a/2; then substitute back if the volume is asked for.',
    tags: ['differentiation', 'optimisation', 'volume'],
    params: { variant: 'box', a, ask },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 5

/** (a, b) pairs for ax + b/x with ab a perfect square or a clean surd. */
const AX_B: [number, number][] = [[1, 4], [1, 9], [1, 16], [1, 25], [1, 36], [1, 49], [1, 64], [1, 100], [1, 2], [1, 3], [1, 5], [1, 8], [1, 12], [1, 18], [4, 9], [2, 8], [3, 12], [9, 4], [2, 18], [4, 25], [3, 27]];

function axPlusBOverXQ(rng: RNG): Generated | null {
  const [a, b] = rng.pick(AX_B);
  const ask: Ask = rng.bool(0.7) ? 'value' : 'x';
  const minValue = surd(a * b, 2); // 2√(ab)
  const xMin = attempt(() => Exact.sqrtRat(frac(b, a).toRat()));
  if (!xMin) return null;
  const answer = ask === 'value' ? minValue : xMin;
  const must: Cand[] = ask === 'value'
    ? [{ value: surd(a * b), trap: 'forgot the factor 2: the minimum is 2√(ab)' }, { value: xMin, trap: 'gave the x-coordinate of the minimum instead of the minimum value' }]
    : [{ value: minValue, trap: 'gave the minimum value instead of where it occurs' }, { value: frac(b, a), trap: 'forgot to square-root x² = b/a' }];
  const extra: Cand[] = [
    { value: E(a + b), trap: 'evaluated at x = 1' },
    { value: attempt(() => xMin.mulRat(2)), trap: 'doubled x' },
    { value: attempt(() => Exact.sqrtRat(frac(a, b).toRat())), trap: 'inverted b/a before square-rooting' },
    { value: E(2 * b), trap: 'doubled b' },
    { value: attempt(() => minValue.mulRat(frac(1, 2).toRat())), trap: 'halved the value' },
  ];
  const fTex = `${a === 1 ? '' : a}x + \\frac{${b}}{x}`;
  return {
    stem: ask === 'value'
      ? `Find the minimum value of $${fTex}$ for $x > 0$.`
      : `Find the value of $x > 0$ at which $${fTex}$ takes its minimum value.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: options(rng, answer, must, extra),
    solution: `$\\frac{dy}{dx} = ${a} - \\frac{${b}}{x^2} = 0$ gives $x^2 = ${frac(b, a).toLatex(FR)}$, so $x = ${xMin.toLatex(FR)}$ (taking $x > 0$). There $y = ${a === 1 ? '' : `${a} \\times `}${xMin.toLatex(FR)} + ${b} \\div ${xMin.toLatex(FR)} = ${minValue.toLatex(FR)}$.`,
    trap: 'Set the derivative a − b/x² to zero, take the positive root, and substitute back: the minimum value is 2√(ab), not √(ab).',
    tags: ['differentiation', 'optimisation', 'reciprocal'],
    params: { variant: 'ax-plus-b-over-x', a, b, ask },
    typedAllowed: true,
  };
}

function cylinderQ(rng: RNG): Generated | null {
  const closed = rng.bool(0.6);
  const r0 = rng.pick([1, 2, 3, 4]);
  const S = closed ? 6 * r0 * r0 : 3 * r0 * r0; // coefficient of π in the surface area
  const ask: Ask = rng.bool(0.5) ? 'x' : 'value';
  const Vcoef = closed ? 2 * r0 ** 3 : r0 ** 3; // V = Vcoef·π
  const answer = ask === 'x' ? E(r0) : Exact.pi(Vcoef);
  const h = closed ? 2 * r0 : r0;
  const must: Cand[] = ask === 'x'
    ? [{ value: E(h), trap: 'gave the height instead of the radius' }, { value: attempt(() => Exact.sqrtRat(frac(3 * r0 * r0, closed ? 1 : 2).toRat())), trap: 'ignored the curved surface (set S = 2πr² or πr²)' }]
    : [{ value: Exact.pi(closed ? r0 ** 3 : 2 * r0 ** 3), trap: closed ? 'took the height equal to the radius' : 'took the height equal to twice the radius' }, { value: E(r0), trap: 'gave the radius instead of the volume' }];
  const extra: Cand[] = ask === 'x'
    ? [
      { value: E(r0 * r0), trap: 'forgot to square-root r² = S/(6π)' },
      { value: frac(r0, 2), trap: 'halved the radius' },
      { value: E(2 * r0 + 1), trap: 'arithmetic slip' },
    ]
    : [
      { value: Exact.pi(closed ? 3 * r0 ** 3 : 3 * r0 ** 3 / 2), trap: 'took V = Sr/2 and forgot the −πr³ term' },
      { value: Exact.pi(closed ? 4 * r0 ** 3 : 2 * r0 ** 3), trap: 'doubled the volume' },
      { value: E(Vcoef), trap: 'dropped the π' },
    ];
  const kind = closed ? 'closed cylinder' : 'cylinder, open at one end,';
  return {
    stem: `A ${kind} has a total surface area of $${S}\\pi$ cm$^2$. ` +
      (ask === 'x' ? 'Find the radius, in cm, for which its volume is as large as possible.' : 'Find the largest possible volume of the cylinder, in cm$^3$, leaving $\\pi$ in your answer.'),
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: options(rng, answer, must, extra),
    solution: closed
      ? `$2\\pi r^2 + 2\\pi r h = ${S}\\pi$ gives $h = \\frac{${S} - 2r^2}{2r}$, so $V = \\pi r^2 h = ${S / 2}\\pi r - \\pi r^3$. $\\frac{dV}{dr} = ${S / 2}\\pi - 3\\pi r^2 = 0$ at $r^2 = ${r0 * r0}$, i.e. $r = ${r0}$, $h = ${h}$ and $V = ${Vcoef}\\pi$.`
      : `$\\pi r^2 + 2\\pi r h = ${S}\\pi$ gives $h = \\frac{${S} - r^2}{2r}$, so $V = \\pi r^2 h = \\frac{${S}\\pi r - \\pi r^3}{2}$. $\\frac{dV}{dr} = \\frac{${S}\\pi - 3\\pi r^2}{2} = 0$ at $r^2 = ${r0 * r0}$, i.e. $r = ${r0}$, $h = ${h}$ and $V = ${Vcoef}\\pi$.`,
    trap: 'Use the surface-area constraint to write V in terms of r alone; dV/dr = 0 gives r² = S/(6π) for a closed cylinder (S/(3π) if open).',
    tags: ['differentiation', 'optimisation', 'cylinder'],
    params: { variant: 'cylinder', closed, S, ask },
    typedAllowed: true,
  };
}

function squareBoxQ(rng: RNG): Generated | null {
  const closed = rng.bool(0.5);
  // closed: x³ = V, S = 6x²; open: x³ = 2V, S = 3x²
  const x = rng.pick(closed ? [2, 3, 4, 5, 10] : [2, 4, 6, 8, 10]);
  const V = closed ? x ** 3 : x ** 3 / 2;
  const ask: Ask = rng.bool(0.6) ? 'value' : 'x';
  const Smin = closed ? 6 * x * x : 3 * x * x;
  const answer = ask === 'value' ? E(Smin) : E(x);
  const must: Cand[] = ask === 'value'
    ? [{ value: E(closed ? 5 * x * x : 6 * x * x), trap: closed ? 'forgot the top face (5 faces)' : 'counted a top face that the open box does not have' }, { value: E(x), trap: 'gave the side length instead of the area' }]
    : [{ value: E(Smin), trap: 'gave the surface area instead of the side' }, { value: E(V / (x * x)), trap: 'gave the height' }];
  const extra: Cand[] = ask === 'value'
    ? [
      { value: E(closed ? 4 * x * x : 5 * x * x), trap: closed ? 'sides only (4 faces)' : 'counted five equal faces' },
      { value: E(closed ? 6 * x : 3 * x), trap: 'did not square the side' },
      { value: E(closed ? 2 * x * x : 2 * x * x), trap: 'counted the base and top only' },
      { value: E(V), trap: 'gave the volume' },
    ]
    : [
      { value: E(2 * x), trap: 'doubled the side' },
      { value: closed ? E(x * x) : frac(x, 2), trap: closed ? 'forgot the cube root' : 'halved the side' },
      { value: E(V), trap: 'gave the volume' },
    ];
  const h = V / (x * x);
  const stemV = Number.isInteger(V) ? `${V}` : `${V}`;
  return {
    stem: `A ${closed ? 'closed' : 'open-topped'} box has a square base of side $x$ cm and a volume of $${stemV}$ cm$^3$. ` +
      (ask === 'value' ? 'Find the least possible total surface area of the box, in cm$^2$.' : 'Find the value of $x$ for which the total surface area of the box is least.'),
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: options(rng, answer, must, extra),
    solution: closed
      ? `Height $h = \\frac{${V}}{x^2}$, so $S = 2x^2 + 4xh = 2x^2 + \\frac{${4 * V}}{x}$. $\\frac{dS}{dx} = 4x - \\frac{${4 * V}}{x^2} = 0$ gives $x^3 = ${V}$, $x = ${x}$, $h = ${h}$ and $S = 6 \\times ${x}^2 = ${Smin}$.`
      : `Height $h = \\frac{${V}}{x^2}$, so $S = x^2 + 4xh = x^2 + \\frac{${4 * V}}{x}$. $\\frac{dS}{dx} = 2x - \\frac{${4 * V}}{x^2} = 0$ gives $x^3 = ${2 * V}$, $x = ${x}$, $h = ${h}$ and $S = 3 \\times ${x}^2 = ${Smin}$.`,
    trap: 'Eliminate h with the volume; count the faces correctly (an open box has no top) before differentiating.',
    tags: ['differentiation', 'optimisation', 'surface-area'],
    params: { variant: 'square-box', closed, V, ask },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- numeric optimisation for verify()

/** Coarse grid then golden-section refinement of a smooth one-variable objective on [lo, hi]. */
function optimise(fn: (x: number) => number, lo: number, hi: number, maximize: boolean): { x: number; value: number } {
  const g = maximize ? (x: number) => -fn(x) : fn;
  const N = 2000;
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

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'm2.differentiation.optimisation',
  module: 'M2',
  topic: 'differentiation',
  title: 'Optimisation with clean maxima',
  levels: {
    1: 'maximum of an expanded k − (x − a)²; largest area of a rectangle with a fixed perimeter',
    2: 'two numbers with a fixed sum: largest product, least sum of squares',
    3: 'fencing against a wall (three sides): maximum area L²/8',
    4: 'open box from a square sheet: x = a/6 for the greatest volume 2a³/27',
    5: 'minimise ax + b/x; cylinder of fixed surface area; box of fixed volume with least surface area',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return pickVariant(rng, [vertexMaxQ, rectanglePerimeterQ]);
        case 2: return pickVariant(rng, [sumProductQ, sumProductQ, sumSquaresQ]);
        case 3: return wallQ(rng);
        case 4: return boxQ(rng);
        default: return pickVariant(rng, [axPlusBOverXQ, axPlusBOverXQ, cylinderQ, squareBoxQ]);
      }
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const got = q.answer.value.toNumber();
    const p = q.params as { variant: string; ask?: string; coefs?: number[]; P?: number; S?: number; L?: number; a?: number; b?: number; closed?: boolean; V?: number };
    const close = (x: number, y: number) => Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(y));
    // Rebuild the objective from the raw parameters and locate its optimum numerically.
    let fn: (x: number) => number, lo: number, hi: number, maximize: boolean;
    let wanted: 'value' | 'x' | 'parallel' = p.ask === 'x' ? 'x' : 'value';
    switch (p.variant) {
      case 'vertex': {
        const c = p.coefs!;
        fn = (x) => (c[0] * x + c[1]) * x + c[2]; lo = -30; hi = 30; maximize = true;
        break;
      }
      case 'rect-perimeter': fn = (x) => x * (p.P! / 2 - x); lo = 0; hi = p.P! / 2; maximize = true; break;
      case 'sum-product': fn = (x) => x * (p.S! - x); lo = -p.S!; hi = 2 * p.S!; maximize = true; break;
      case 'sum-squares': fn = (x) => x * x + (p.S! - x) ** 2; lo = -p.S!; hi = 2 * p.S!; maximize = false; break;
      case 'wall':
        fn = (x) => x * (p.L! - 2 * x); lo = 0; hi = p.L! / 2; maximize = true;
        wanted = p.ask === 'area' ? 'value' : p.ask === 'perp' ? 'x' : 'parallel';
        break;
      case 'box': fn = (x) => x * (p.a! - 2 * x) ** 2; lo = 0; hi = p.a! / 2; maximize = true; break;
      case 'ax-plus-b-over-x': fn = (x) => p.a! * x + p.b! / x; lo = 0.01; hi = 4 * Math.sqrt(p.b! / p.a!) + 10; maximize = false; break;
      case 'cylinder': {
        const S = p.S! * Math.PI;
        fn = p.closed ? (r) => (r * (S - 2 * Math.PI * r * r)) / 2 : (r) => (r * (S - Math.PI * r * r)) / 2;
        lo = 0; hi = Math.sqrt(S / (p.closed ? 2 * Math.PI : Math.PI)); maximize = true;
        break;
      }
      case 'square-box': fn = (x) => (p.closed ? 2 : 1) * x * x + (4 * p.V!) / x; lo = 0.05; hi = 60; maximize = false; break;
      default: return false;
    }
    const opt = optimise(fn, lo, hi, maximize);
    if (wanted === 'value') return close(got, opt.value);
    if (wanted === 'parallel') return close(got, p.L! - 2 * opt.x);
    return close(got, opt.x);
  },
});
