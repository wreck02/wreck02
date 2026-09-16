import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, surd, Exact } from '../../core/exact';
import { buildOptions, type Distractor, type Option } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { poly } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Optimisation problems whose optimum is a clean number. Stems are fully in words (no diagram).
 * Level 1: greatest (or least) value of an expanded p(x − a)² + k; largest area of a rectangle with a fixed perimeter
 * Level 2: two numbers with a fixed sum (largest product, least sum of squares) or a fixed product (least sum)
 * Level 3: rectangle against a wall with L m of fencing on three sides: maximum area L²/8
 * Level 4: open box from a square or rectangular sheet: for a square of side a the corner cut x = a/6 gives 2a³/27
 * Level 5: minimise ax + b/x for x > 0 (2√(ab)); cylinder of fixed surface area; box of fixed volume with least surface area
 *
 * Every option is the result of a named mistake: `options()` returns null rather than let
 * buildOptions pad with generic perturbations (which produced negative lengths at level 5).
 * Distractors are also kept to the same quantity as the answer — a length is never offered
 * as an answer to "find the volume", and vice versa.
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

/**
 * Every distinct `must` candidate is used before any `extra` one, so the headline traps are never
 * shuffled out; the remaining slots are drawn from either side of the answer (with the last slot
 * repairing an all-above or all-below list), so "pick the largest" never pays.
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
    const last = out.length === count - 1;
    const wanted: -1 | 1 = last && above === 0 ? 1 : last && above === out.length ? -1 : (rng.bool(0.5) ? 1 : -1);
    const d = grab(wanted) ?? grab(wanted === 1 ? -1 : 1);
    if (!d) break;
    take(d);
  }
  return out;
}

/** Four named distractors or nothing: this template never pads. */
function options(rng: RNG, answer: Exact, must: Cand[], extra: Cand[]): Option[] | null {
  const ds = ranked(rng, answer, cleanOnly(must), cleanOnly(extra));
  if (ds.length < 4) return null;
  return buildOptions(rng, answer, ds, FR);
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

type Ask = 'value' | 'x';

// ----------------------------------------------------------------------------- level 1

function vertexQ(rng: RNG): Generated | null {
  // y = p(x − a)² + k, expanded. p < 0 gives a maximum, p > 0 a minimum; k may be negative,
  // so the extreme value is not always the only positive number on the page.
  const p = rng.pick([1, 1, 2]) * rng.sign();
  const a = rng.nonZeroInt(-4, 4);
  const k = rng.intExcluding(-9, 12, [0]);
  const coefs = [p, -2 * p * a, k + p * a * a];
  if (Math.abs(coefs[2]) > 60) return null;
  const word = p < 0 ? 'maximum' : 'minimum';
  const ask: Ask = rng.bool(0.7) ? 'value' : 'x';
  const answer = ask === 'value' ? E(k) : E(a);
  const must: Cand[] = ask === 'value'
    ? [{ value: E(a), trap: `gave the value of x at which the ${word} occurs` }, { value: E(k + 2 * p * a * a), trap: 'sign slip when completing the square' }]
    : [{ value: E(k), trap: `gave the ${word} value instead of where it occurs` }, { value: E(-a), trap: 'sign slip: the vertex is at x = −b/(2a)' }];
  const extra: Cand[] = ask === 'value'
    ? [
      { value: E(k + p * a * a), trap: 'gave the constant term, y(0)' },
      { value: E(k - p * a * a), trap: 'subtracted the square instead of adding it when completing the square' },
      { value: E(-2 * p * a), trap: 'read off the coefficient of x' },
      { value: E(-k), trap: 'sign slip' },
    ]
    : [
      { value: E(2 * a), trap: 'forgot the 2 in −b/(2a)' },
      { value: E(-2 * p * a), trap: 'read off the coefficient of x' },
      { value: frac(a, 2), trap: 'divided by 2 twice' },
      { value: E(k + p * a * a), trap: 'gave y(0)' },
    ];
  const opts = options(rng, answer, must, extra);
  if (!opts) return null;
  return {
    stem: ask === 'value'
      ? `Find the ${word} value of $y = ${poly(coefs)}$.`
      : `Find the value of $x$ for which $y = ${poly(coefs)}$ takes its ${word} value.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: opts,
    solution: `$\\frac{dy}{dx} = ${poly([2 * p, -2 * p * a])} = 0$ at $x = ${a}$, and there $y = ${k}$. (Equivalently $y = ${p === 1 ? '' : p === -1 ? '-' : p}(${poly([1, -a])})^{2} ${k < 0 ? '-' : '+'} ${Math.abs(k)}$.)`,
    trap: `Distinguish the ${word} value (y) from where it occurs (x): the question says which one it wants.`,
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
  // Areas are only ever offered against areas: a "side" of 900 cm for a 60 cm perimeter is
  // impossible on sight, so an area among the length options would hand over three eliminations.
  const must: Cand[] = ask === 'value'
    ? [{ value: E(side), trap: 'gave the side length instead of the area' }, { value: frac(P * P, 8), trap: 'used the three-sided (wall) result L²/8' }]
    : [{ value: E(P / 2), trap: 'used half the perimeter as the side' }, { value: frac(P, 3), trap: 'assumed three equal sides' }];
  const extra: Cand[] = ask === 'value'
    ? [
      { value: frac(P * P, 4), trap: 'used half the perimeter as the side length' },
      { value: E(P), trap: 'gave the perimeter' },
      { value: frac(P * P, 2), trap: 'multiplied half-perimeter by itself twice over' },
      { value: frac(P * P, 12), trap: 'used sides P/2 and P/6' },
      { value: frac(P * P, 32), trap: 'halved the side before squaring' },
    ]
    : [
      { value: E(P), trap: 'gave the perimeter' },
      { value: frac(P, 6), trap: 'divided the perimeter by 6' },
      { value: frac(P, 8), trap: 'halved the side' },
      { value: frac(3 * P, 8), trap: 'took three quarters of the half-perimeter' },
      { value: E(side - 1), trap: 'the shorter side of a neighbouring rectangle, not the square' },
      { value: E(side + 1), trap: 'the longer side of a neighbouring rectangle, not the square' },
    ];
  const opts = options(rng, answer, must, extra);
  if (!opts) return null;
  return {
    stem: ask === 'value'
      ? `A rectangle has perimeter $${P}$ cm. Find the greatest possible area of the rectangle, in cm$^2$.`
      : `A rectangle has perimeter $${P}$ cm. Find the length, in cm, of each side of the rectangle of greatest possible area.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: opts,
    solution: `With sides $x$ and $${P / 2} - x$, $A = x(${P / 2} - x) = ${P / 2}x - x^2$, so $\\frac{dA}{dx} = ${P / 2} - 2x = 0$ at $x = ${side}$: a square of side $${side}$ and area $${side * side}$ cm$^2$.`,
    trap: 'Write the area in one variable using the perimeter constraint; the maximum is the square (P/4 each side), and area = side², not the perimeter.',
    tags: ['differentiation', 'optimisation', 'area'],
    params: { variant: 'rect-perimeter', P, ask },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 2

/** Any even sum in 6…60, plus the occasional round hundred: the level is no longer a 12-item list. */
function drawSum(rng: RNG): number {
  return rng.bool(0.15) ? rng.pick([70, 80, 90, 100, 120, 140, 160, 200]) : 2 * rng.int(3, 30);
}

function sumProductQ(rng: RNG): Generated | null {
  const S = drawSum(rng);
  const ask: Ask = rng.bool(0.75) ? 'value' : 'x';
  const half = S / 2;
  const answer = ask === 'value' ? E(half * half) : E(half);
  const must: Cand[] = ask === 'value'
    ? [{ value: E(half), trap: 'gave one of the numbers instead of the product' }, { value: frac(S * S, 2), trap: 'squared the sum and halved it' }]
    : [{ value: E(half * half), trap: 'gave the product instead of one of the numbers' }, { value: E(S), trap: 'gave the sum' }];
  const extra: Cand[] = ask === 'value'
    ? [
      // only while it is visibly different from the answer: 9999 beside 10000 is a near-duplicate
      { value: half * half <= 999 ? E(half * half - 1) : null, trap: 'a neighbouring pair (S/2 ± 1), not the maximum' },
      { value: E(S * S), trap: 'squared the sum' },
      { value: E(S), trap: 'gave the sum' },
      { value: E(2 * S), trap: 'doubled the sum' },
      { value: frac(S * S, 8), trap: 'divided by 8 instead of 4' },
    ]
    : [
      { value: frac(S * S, 2), trap: 'squared the sum and halved it' },
      { value: E(2 * S), trap: 'doubled the sum' },
      { value: frac(S, 4), trap: 'quartered the sum' },
      { value: E(half - 1), trap: 'off by one' },
    ];
  const opts = options(rng, answer, must, extra);
  if (!opts) return null;
  return {
    stem: ask === 'value'
      ? `Two positive numbers have a sum of $${S}$. Find the greatest possible value of their product.`
      : `Two positive numbers have a sum of $${S}$ and their product is as large as possible. Find the larger of the two numbers.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: opts,
    solution: `Let the numbers be $x$ and $${S} - x$: $P = x(${S} - x)$, so $\\frac{dP}{dx} = ${S} - 2x = 0$ at $x = ${half}$. Both numbers are $${half}$ and $P = ${half * half}$.`,
    trap: 'Express the product in one variable with the sum constraint; the maximum is when the numbers are equal (S/2 each) and the product is (S/2)².',
    tags: ['differentiation', 'optimisation', 'product'],
    params: { variant: 'sum-product', S, ask },
    typedAllowed: true,
  };
}

function sumSquaresQ(rng: RNG): Generated | null {
  const S = drawSum(rng);
  const half = S / 2;
  const answer = E(S * S / 2);
  const opts = options(rng, answer, [
    { value: E(half * half), trap: 'squared only one of the numbers' },
    { value: E(S * S), trap: 'squared the sum instead of summing the squares' },
  ], [
    { value: E(half), trap: 'gave one of the numbers instead of the sum of their squares' },
    { value: frac(S * S, 4), trap: 'gave (S/2)²' },
    { value: frac(S * S, 8), trap: 'divided by 8' },
    { value: E(2 * S * S), trap: 'doubled the sum of the squares' },
    { value: E(2 * S), trap: 'doubled the sum' },
  ]);
  if (!opts) return null;
  return {
    stem: `Two numbers have a sum of $${S}$. Find the least possible value of the sum of their squares.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: opts,
    solution: `With numbers $x$ and $${S} - x$: $Q = x^2 + (${S} - x)^2$, so $\\frac{dQ}{dx} = 2x - 2(${S} - x) = 4x - ${2 * S} = 0$ at $x = ${half}$, giving $Q = 2 \\times ${half}^2 = ${S * S / 2}$.`,
    trap: 'Minimise x² + (S − x)²: the numbers are equal at the minimum, and you must add both squares, (S/2)² + (S/2)².',
    tags: ['differentiation', 'optimisation', 'squares'],
    params: { variant: 'sum-squares', S },
    typedAllowed: true,
  };
}

/** The dual of sumProduct: a fixed product, least sum — the same mental route (x + P/x). */
function productSumQ(rng: RNG): Generated | null {
  const p = rng.int(2, 22);
  const P = p * p;
  const ask: Ask = rng.bool(0.7) ? 'value' : 'x';
  const answer = ask === 'value' ? E(2 * p) : E(p);
  const must: Cand[] = ask === 'value'
    ? [{ value: E(p), trap: 'gave one of the numbers instead of their sum' }, { value: E(P), trap: 'gave the product itself' }]
    : [{ value: E(2 * p), trap: 'gave the sum instead of one of the numbers' }, { value: E(P), trap: 'gave the product itself' }];
  const extra: Cand[] = [
    { value: frac(P, 2), trap: 'halved the product instead of square-rooting it' },
    { value: E(4 * p), trap: 'doubled the sum a second time' },
    { value: E(P + 1), trap: 'used the pair 1 and P' },
    { value: E(p + 1), trap: 'off by one' },
    { value: frac(p, 2), trap: 'halved one of the numbers' },
  ];
  const opts = options(rng, answer, must, extra);
  if (!opts) return null;
  return {
    stem: ask === 'value'
      ? `Two positive numbers have a product of $${P}$. Find the least possible value of their sum.`
      : `Two positive numbers have a product of $${P}$ and their sum is as small as possible. Find either of the two numbers.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: opts,
    solution: `Let the numbers be $x$ and $\\frac{${P}}{x}$: $T = x + \\frac{${P}}{x}$, so $\\frac{dT}{dx} = 1 - \\frac{${P}}{x^2} = 0$ at $x = ${p}$. Both numbers are $${p}$ and $T = ${2 * p}$.`,
    trap: 'Write the sum as x + P/x and differentiate: the minimum is at x = √P, where both numbers are equal and the sum is 2√P.',
    tags: ['differentiation', 'optimisation', 'product'],
    params: { variant: 'product-sum', P, ask },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 3: fencing against a wall

function wallQ(rng: RNG): Generated | null {
  const L = 4 * rng.int(3, 50); // any multiple of 4 from 12 m to 200 m
  const ask = rng.weighted(['area', 'perp', 'parallel'] as const, [6, 2, 2]);
  const perp = L / 4, par = L / 2, area = (L * L) / 8;
  const answer = ask === 'area' ? E(area) : ask === 'perp' ? E(perp) : E(par);
  const must: Cand[] = ask === 'area'
    ? [{ value: frac(L * L, 16), trap: 'treated it as four sides of fencing (a square of side L/4)' }, { value: frac(L * L, 4), trap: 'used L/2 for both dimensions' }]
    : ask === 'perp'
      ? [{ value: E(par), trap: 'gave the side parallel to the wall' }, { value: frac(L, 3), trap: 'assumed three equal sides' }]
      : [{ value: E(perp), trap: 'gave a side perpendicular to the wall' }, { value: frac(L, 3), trap: 'assumed three equal sides' }];
  const extra: Cand[] = ask === 'area'
    ? [
      { value: frac(L * L, 9), trap: 'assumed three equal sides of L/3' },
      { value: E(perp), trap: 'gave a side length instead of the area' },
      { value: E(par), trap: 'gave the length of the side parallel to the wall' },
      { value: frac(L * L, 2), trap: 'forgot to divide by 4 when finding the sides' },
      { value: frac(L * L, 12), trap: 'used L/3 and L/4' },
    ]
    : [
      { value: E(L), trap: 'gave the total length of fencing' },
      { value: frac(L, 8), trap: 'halved again' },
      { value: frac(L, 6), trap: 'divided by 6' },
      { value: frac(2 * L, 3), trap: 'assumed three equal sides and doubled' },
      { value: frac(3 * L, 4), trap: 'used three of the four quarters' },
    ];
  const what = ask === 'area' ? 'Find the greatest possible area of the enclosure, in m$^2$.'
    : ask === 'perp' ? 'Find the length, in m, of each side perpendicular to the wall when the enclosed area is as large as possible.'
      : 'Find the length, in m, of the side parallel to the wall when the enclosed area is as large as possible.';
  const opts = options(rng, answer, must, extra);
  if (!opts) return null;
  return {
    stem: `A farmer has $${L}$ m of fencing and uses all of it to make three sides of a rectangular enclosure, the fourth side being an existing straight wall. ${what}`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: opts,
    solution: `Let each side perpendicular to the wall be $x$ m, so the side parallel to it is $${L} - 2x$. $A = x(${L} - 2x) = ${L}x - 2x^2$ and $\\frac{dA}{dx} = ${L} - 4x = 0$ at $x = ${perp}$: the sides are $${perp}$ m and $${par}$ m, and $A = ${perp} \\times ${par} = ${area}$ m$^2$.`,
    trap: 'Only three sides use fencing: L = 2x + y, not 2x + 2y; the optimum has the parallel side twice the perpendicular one, area L²/8.',
    tags: ['differentiation', 'optimisation', 'fencing'],
    params: { variant: 'wall', L, ask },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 4: open box from a sheet of card

type BoxAsk = 'x' | 'value' | 'base';

/**
 * Rectangular sheets a × b whose optimum corner cut is clean: AB = 2x(A + B) with
 * A = a − 2x, B = b − 2x, so 12x² − 4(a + b)x + ab = 0 factorises.
 */
const RECT_SHEETS: [number, number, number][] = [
  [5, 8, 1], [7, 15, 1.5], [10, 16, 2], [9, 24, 2], [16, 21, 3], [15, 24, 3], [14, 30, 3], [20, 32, 4],
  [18, 48, 4], [21, 45, 4.5], [24, 45, 5], [25, 40, 5], [28, 60, 6], [30, 48, 6], [32, 42, 6], [35, 56, 7],
];

function squareBoxSheetQ(rng: RNG): Generated | null {
  // a = 3m: x = a/6 = m/2 (a half-integer cut is fine), base = 2m, V = 2m³.
  const m = rng.int(1, 18);
  const a = 3 * m;
  const x = a / 6;
  const base = a - 2 * x;
  const V = x * base * base;
  const ask: BoxAsk = rng.weighted(['x', 'value', 'base'] as const, [4, 4, 2]);
  const answer = ask === 'x' ? E(x) : ask === 'base' ? E(base) : E(V);
  // Lengths are only ever offered against lengths, volumes against volumes.
  const must: Cand[] = ask === 'value'
    ? [{ value: frac(a ** 3, 16), trap: 'used the root x = a/4' }, { value: frac(25 * a ** 3, 216), trap: 'subtracted x once instead of twice: used x(a − x)²' }]
    : ask === 'x'
      ? [{ value: E(a / 2), trap: 'the other root of V′(x) = 0, where the volume is zero' }, { value: E(a / 4), trap: 'divided by 4 instead of 6' }]
      : [{ value: E(x), trap: 'gave the corner cut x instead of the base side a − 2x' }, { value: frac(a, 2), trap: 'subtracted x once instead of twice' }];
  const extra: Cand[] = ask === 'value'
    ? [
      { value: frac(a ** 3, 27), trap: 'used the root x = a/3' },
      { value: frac(8 * a ** 3, 27), trap: 'used (a − 2x)³, forgetting that the height is only x' },
      { value: frac(a ** 3, 6), trap: 'used x·a² instead of x(a − 2x)²' },
      { value: frac(4 * a * a, 9), trap: 'gave the area of the base instead of the volume' },
      { value: frac(a ** 3, 54), trap: 'halved the volume' },
    ]
    : [
      { value: E(a / 3), trap: 'divided by 3' },
      { value: E(a / 12), trap: 'divided by 12' },
      { value: E(ask === 'x' ? base : x * 2), trap: ask === 'x' ? 'gave the base side a − 2x instead of the corner cut' : 'gave twice the corner cut' },
      { value: E(a), trap: 'gave the side of the sheet' },
      { value: frac(3 * a, 4), trap: 'subtracted a/4 from the side once' },
    ];
  const opts = options(rng, answer, must, extra);
  if (!opts) return null;
  const what = ask === 'x' ? 'Find the value of $x$ for which the volume of the box is greatest.'
    : ask === 'base' ? 'Find the length, in cm, of each side of the base of the box of greatest volume.'
      : 'Find the greatest possible volume of the box, in cm$^3$.';
  const stem = rng.bool(0.5)
    ? `An open box is made from a square sheet of card of side $${a}$ cm by cutting a square of side $x$ cm from each corner and folding up the sides. ${what}`
    : `A square sheet of card has side $${a}$ cm. A square of side $x$ cm is cut from each corner and the four flaps are folded up to form an open box. ${what}`;
  return {
    stem,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: opts,
    solution: `$V = x(${a} - 2x)^2$, so $\\frac{dV}{dx} = (${a} - 2x)^2 - 4x(${a} - 2x) = (${a} - 2x)(${a} - 6x) = 0$ at $x = ${x}$ (the root $x = ${a / 2}$ gives $V = 0$).` +
      (ask === 'value' ? ` Then $V = ${x} \\times ${base}^2 = ${V}$ cm$^3$.` : ask === 'base' ? ` The base is $${a} - 2 \\times ${x} = ${base}$ cm square.` : ''),
    trap: 'V = x(a − 2x)²: differentiate as a product (or expand) and take the root x = a/6, not a/2; then substitute back if the volume is asked for.',
    tags: ['differentiation', 'optimisation', 'volume'],
    params: { variant: 'box', a, b: a, ask },
    typedAllowed: true,
  };
}

function rectBoxQ(rng: RNG): Generated | null {
  const [a, b, x] = rng.pick(RECT_SHEETS);
  const A = a - 2 * x, B = b - 2 * x;
  const V = x * A * B;
  const ask: BoxAsk = rng.bool(0.5) ? 'x' : 'value';
  const answer = ask === 'x' ? E(x) : E(V);
  const other = (a + b + Math.sqrt(a * a - a * b + b * b)) / 6; // the rejected root of 12x² − 4(a+b)x + ab = 0
  const must: Cand[] = ask === 'x'
    ? [{ value: Number.isInteger(other * 6) && other * 2 < Math.min(a, b) + 6 ? attempt(() => frac(Math.round(other * 6), 6)) : null, trap: 'took the larger root, which makes a side negative' },
      { value: frac(Math.min(a, b), 2), trap: 'cut half the shorter side, where the volume is zero' }]
    : [{ value: E(a * b * x), trap: 'used x·a·b instead of x(a − 2x)(b − 2x)' }, { value: E(A * B), trap: 'gave the area of the base instead of the volume' }];
  const extra: Cand[] = ask === 'x'
    ? [
      { value: frac(a + b, 6), trap: 'solved 6x = a + b, dropping the constant term' },
      { value: frac(a + b, 12), trap: 'used (a + b)/12' },
      { value: E(A), trap: 'gave a side of the base instead of the corner cut' },
      { value: frac(Math.min(a, b), 4), trap: 'used a/4 for the corner cut' },
      { value: E(2 * x), trap: 'gave 2x, the total cut from each side' },
    ]
    : [
      { value: E(x * (a - x) * (b - x)), trap: 'subtracted x once instead of twice from each side' },
      { value: E(2 * x * A * B), trap: 'doubled the volume' },
      { value: E(A * B * Math.min(a, b) / 2), trap: 'used the height a/2 instead of x' },
      { value: E(a * b), trap: 'gave the area of the sheet' },
      { value: E(x * A * A), trap: 'treated the sheet as a square of side a' },
    ];
  const opts = options(rng, answer, must, extra);
  if (!opts) return null;
  const what = ask === 'x' ? 'Find the value of $x$ for which the volume of the box is greatest.' : 'Find the greatest possible volume of the box, in cm$^3$.';
  return {
    stem: `An open box is made from a rectangular sheet of card measuring $${a}$ cm by $${b}$ cm by cutting a square of side $x$ cm from each corner and folding up the sides. ${what}`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: opts,
    solution: `$V = x(${a} - 2x)(${b} - 2x)$, so $\\frac{dV}{dx} = ${12}x^2 - ${4 * (a + b)}x + ${a * b} = 0$. The root in range is $x = ${E(x).toLatex(FR)}$` +
      (ask === 'value' ? `, giving $V = ${E(x).toLatex(FR)} \\times ${A} \\times ${B} = ${V}$ cm$^3$.` : ' (the other root would make a side negative).'),
    trap: 'Expand V = x(a − 2x)(b − 2x), differentiate, and keep only the root with 2x less than the shorter side.',
    tags: ['differentiation', 'optimisation', 'volume'],
    params: { variant: 'box', a, b, ask },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 5

/** (a, b) pairs for ax + b/x with ab a perfect square or a clean surd. */
const AX_B: [number, number][] = [
  [1, 4], [1, 9], [1, 16], [1, 25], [1, 36], [1, 49], [1, 64], [1, 81], [1, 100], [1, 121], [1, 144],
  [1, 2], [1, 3], [1, 5], [1, 6], [1, 7], [1, 8], [1, 10], [1, 11], [1, 12], [1, 13], [1, 15], [1, 18],
  [1, 20], [1, 24], [1, 27], [1, 32], [1, 40], [1, 45], [1, 48], [1, 50],
  [4, 1], [9, 1], [16, 1], [25, 1], [2, 2], [3, 3], [4, 4], [5, 5], [8, 2], [9, 4], [4, 9], [16, 9], [9, 16], [25, 4], [4, 25],
  [2, 8], [3, 12], [2, 18], [2, 32], [2, 50], [3, 27], [3, 48], [5, 20], [5, 45], [4, 49], [9, 25], [8, 18],
  [2, 3], [3, 2], [2, 5], [5, 2], [3, 5], [5, 3],
];

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
    { value: attempt(() => minValue.mulRat(2)), trap: 'doubled the value a second time' },
  ];
  const opts = options(rng, answer, must, extra);
  if (!opts) return null;
  const fTex = `${a === 1 ? '' : a}x + \\frac{${b}}{x}`;
  return {
    stem: ask === 'value'
      ? `Find the minimum value of $${fTex}$ for $x > 0$.`
      : `Find the value of $x > 0$ at which $${fTex}$ takes its minimum value.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: opts,
    solution: `$\\frac{dy}{dx} = ${a} - \\frac{${b}}{x^2} = 0$ gives $x^2 = ${frac(b, a).toLatex(FR)}$, so $x = ${xMin.toLatex(FR)}$ (taking $x > 0$). There $y = ${a === 1 ? '' : `${a} \\times `}${xMin.toLatex(FR)} + ${b} \\div ${xMin.toLatex(FR)} = ${minValue.toLatex(FR)}$.`,
    trap: 'Set the derivative a − b/x² to zero, take the positive root, and substitute back: the minimum value is 2√(ab), not √(ab).',
    tags: ['differentiation', 'optimisation', 'reciprocal'],
    params: { variant: 'ax-plus-b-over-x', a, b, ask },
    typedAllowed: true,
  };
}

function cylinderQ(rng: RNG): Generated | null {
  const closed = rng.bool(0.6);
  const r0 = rng.int(1, 7);
  const S = closed ? 6 * r0 * r0 : 3 * r0 * r0; // coefficient of π in the surface area
  const ask: Ask = rng.bool(0.5) ? 'x' : 'value';
  const Vcoef = closed ? 2 * r0 ** 3 : r0 ** 3; // V = Vcoef·π
  const answer = ask === 'x' ? E(r0) : Exact.pi(Vcoef);
  const h = closed ? 2 * r0 : r0;
  // Every candidate for the radius is a positive length: a negative radius is never offered.
  // The radius ask offers lengths only: S is a surface-area coefficient (48 for a 96π cm²
  // cylinder), not a radius, and r² is only plausible while it stays within a few radii.
  const must: Cand[] = ask === 'x'
    ? [{ value: closed ? E(h) : (r0 <= 4 ? E(r0 * r0) : null), trap: closed ? 'gave the height instead of the radius' : 'forgot to square-root r² = S/(3π)' },
      { value: attempt(() => Exact.sqrtRat(frac(3 * r0 * r0, closed ? 1 : 2).toRat())), trap: 'ignored the curved surface (set S = 2πr² or πr²)' }]
    : [{ value: Exact.pi(closed ? r0 ** 3 : 2 * r0 ** 3), trap: closed ? 'took the height equal to the radius' : 'took the height equal to twice the radius' },
      { value: Exact.pi(closed ? 4 * r0 ** 3 : 2 * r0 ** 3), trap: 'doubled the volume' }];
  const extra: Cand[] = ask === 'x'
    ? [
      { value: r0 <= 4 ? E(r0 * r0) : null, trap: `forgot to square-root r² = S/(${closed ? 6 : 3}π)` },
      { value: frac(r0, 2), trap: 'halved the radius' },
      { value: E(2 * r0), trap: 'gave the diameter' },
      { value: frac(S, 2 * r0), trap: 'divided the surface-area coefficient by 2r instead of square-rooting' },
      { value: attempt(() => Exact.sqrtRat(frac(closed ? 2 * r0 * r0 : r0 * r0, closed ? 1 : 2).toRat())), trap: `used the ${closed ? 'open-cylinder condition r² = S/(3π)' : 'closed-cylinder condition r² = S/(6π)'}` },
    ]
    : [
      { value: Exact.pi(closed ? 3 * r0 ** 3 : 3 * r0 ** 3 / 2), trap: 'took V = Sr/2 and forgot the −πr³ term' },
      { value: Exact.pi(frac(Vcoef, 2).toRat()), trap: 'halved the volume' },
      { value: E(Vcoef), trap: 'dropped the π' },
      { value: Exact.pi(closed ? 6 * r0 ** 3 : 3 * r0 ** 3), trap: 'used V = πr²h with h = S/(2r) (the curved surface only)' },
    ];
  const opts = options(rng, answer, must, extra);
  if (!opts) return null;
  const kind = closed ? 'closed cylinder' : 'cylinder, open at one end,';
  return {
    stem: `A ${kind} has a total surface area of $${S}\\pi$ cm$^2$. ` +
      (ask === 'x' ? 'Find the radius, in cm, for which its volume is as large as possible.' : 'Find the largest possible volume of the cylinder, in cm$^3$, leaving $\\pi$ in your answer.'),
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: opts,
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
  const x = rng.pick(closed ? [2, 3, 4, 5, 6, 8, 10, 12] : [2, 4, 6, 8, 10, 12, 14, 16]);
  const V = closed ? x ** 3 : x ** 3 / 2;
  const ask: Ask = rng.bool(0.6) ? 'value' : 'x';
  const Smin = closed ? 6 * x * x : 3 * x * x;
  const answer = ask === 'value' ? E(Smin) : E(x);
  const h = V / (x * x);
  // Face-counting traps must match the box they are counted on: adding a top to the open box's
  // 3x² gives 4x², while 6x² is the closed-box formula, not "one face too many".
  const must: Cand[] = ask === 'value'
    ? (closed
      ? [{ value: E(5 * x * x), trap: 'forgot the top face (5 faces)' }, { value: E(4 * x * x), trap: 'counted the four sides only' }]
      : [{ value: E(4 * x * x), trap: 'counted a top face the open box does not have' }, { value: E(2 * x * x), trap: 'counted the base and a top only' }])
    : [{ value: E(closed ? 6 * x : 3 * x), trap: 'divided the surface area by the side instead of taking the cube root' },
      { value: h !== x ? E(h) : E(2 * x), trap: h !== x ? 'gave the height instead of the side of the base' : 'doubled the side' }];
  const extra: Cand[] = ask === 'value'
    ? (closed
      ? [
        { value: E(8 * x * x), trap: 'counted eight faces' },
        { value: E(3 * x * x), trap: 'counted three faces' },
        { value: E(6 * x), trap: 'did not square the side' },
        { value: E(2 * x * x), trap: 'counted the base and top only' },
        { value: E(V), trap: 'gave the volume' },
        { value: E(12 * x * x), trap: 'doubled the surface area' },
      ]
      : [
        { value: E(6 * x * x), trap: 'used the closed-box formula 6x²' },
        { value: E(5 * x * x), trap: 'counted five faces' },
        { value: E(3 * x), trap: 'did not square the side' },
        { value: E(x * x), trap: 'counted the base only' },
        { value: E(V), trap: 'gave the volume' },
      ])
    : [
      // lengths only: the volume and the surface area are both impossible as a side of this box
      { value: E(2 * x), trap: 'doubled the side' },
      { value: frac(x, 2), trap: 'halved the side' },
      { value: frac(closed ? 6 * x : 3 * x, 4), trap: 'divided the surface area by the perimeter of the base, 4x' },
      { value: E(x + 1), trap: 'slipped when taking the cube root' },
    ];
  const opts = options(rng, answer, must, extra);
  if (!opts) return null;
  return {
    stem: `${closed ? 'A closed' : 'An open-topped'} box has a square base of side $x$ cm and a volume of $${V}$ cm$^3$. ` +
      (ask === 'value' ? 'Find the least possible total surface area of the box, in cm$^2$.' : 'Find the value of $x$ for which the total surface area of the box is least.'),
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: opts,
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
    1: 'greatest or least value of an expanded p(x − a)² + k; largest area of a rectangle with a fixed perimeter',
    2: 'two numbers with a fixed sum (largest product, least sum of squares) or a fixed product (least sum)',
    3: 'fencing against a wall (three sides): maximum area L²/8',
    4: 'open box from a square sheet (x = a/6, V = 2a³/27) or from a rectangular sheet',
    5: 'minimise ax + b/x; cylinder of fixed surface area; box of fixed volume with least surface area',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return pickVariant(rng, [vertexQ, rectanglePerimeterQ]);
        case 2: return pickVariant(rng, [sumProductQ, sumProductQ, sumSquaresQ, productSumQ]);
        case 3: return wallQ(rng);
        case 4: return pickVariant(rng, [squareBoxSheetQ, squareBoxSheetQ, rectBoxQ]);
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
    let wanted: 'value' | 'x' | 'parallel' | 'base' = p.ask === 'x' ? 'x' : p.ask === 'base' ? 'base' : 'value';
    switch (p.variant) {
      case 'vertex': {
        const c = p.coefs!;
        fn = (x) => (c[0] * x + c[1]) * x + c[2]; lo = -30; hi = 30; maximize = c[0] < 0;
        break;
      }
      case 'rect-perimeter': fn = (x) => x * (p.P! / 2 - x); lo = 0; hi = p.P! / 2; maximize = true; break;
      case 'sum-product': fn = (x) => x * (p.S! - x); lo = -p.S!; hi = 2 * p.S!; maximize = true; break;
      case 'sum-squares': fn = (x) => x * x + (p.S! - x) ** 2; lo = -p.S!; hi = 2 * p.S!; maximize = false; break;
      case 'product-sum': fn = (x) => x + p.P! / x; lo = 0.01; hi = p.P! + 1; maximize = false; break;
      case 'wall':
        fn = (x) => x * (p.L! - 2 * x); lo = 0; hi = p.L! / 2; maximize = true;
        wanted = p.ask === 'area' ? 'value' : p.ask === 'perp' ? 'x' : 'parallel';
        break;
      case 'box': fn = (x) => x * (p.a! - 2 * x) * (p.b! - 2 * x); lo = 0; hi = Math.min(p.a!, p.b!) / 2; maximize = true; break;
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
    if (wanted === 'base') return close(got, p.a! - 2 * opt.x);
    return close(got, opt.x);
  },
});
