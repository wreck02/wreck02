import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, surd, Exact } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { signed } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Position vectors and vector geometry.
 * Level 1: the vector AB from two position vectors (choice), or the x-coordinate of the midpoint of AB
 * Level 2: the point dividing AB in a given ratio (choice of coordinates)
 * Level 3: the distance between two 3D points (integer or a simple surd)
 * Level 4: the value of k making three points collinear, or the fourth vertex of a parallelogram (choice)
 * Level 5: the area of a triangle from three vertices, or a point on OA extended with a fractional ratio
 */

type Pt = number[];

const sub = (p: Pt, q: Pt): Pt => p.map((x, i) => x - q[i]);
const add = (p: Pt, q: Pt): Pt => p.map((x, i) => x + q[i]);
const norm2 = (p: Pt): number => p.reduce((s, x) => s + x * x, 0);
const SYMS = ['\\mathbf{i}', '\\mathbf{j}', '\\mathbf{k}'];

/** "3i - 4j + k" in bold ijk notation (zero components omitted). */
function vecTex(v: Pt): string {
  let s = '';
  v.forEach((c, i) => { s += signed(c, SYMS[i], s === ''); });
  return s === '' ? '\\mathbf{0}' : s;
}

const ptTex = (p: Pt): string => `(${p.join(', ')})`;

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

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

// ----------------------------------------------------------------------------- level 1

function abVectorQ(rng: RNG): Generated | null {
  const d = rng.bool(0.6) ? 2 : 3;
  const a: Pt = [], b: Pt = [];
  for (let i = 0; i < d; i++) { a.push(rng.int(-7, 7)); b.push(rng.int(-7, 7)); }
  const ab = sub(b, a);
  if (ab.some((x) => Math.abs(x) < 2 || Math.abs(x) > 12)) return null;
  const zeros = (v: Pt) => v.filter((x) => x === 0).length;
  if (zeros(a) + zeros(b) > (d === 2 ? 0 : 1)) return null;
  if (add(a, b).some((x) => x === 0)) return null;
  const correct = `$${vecTex(ab)}$`;
  const flips = ab.map((_, i) => ({
    display: `$${vecTex(ab.map((x, j) => (j === i ? -x : x)))}$`,
    trap: `subtracted the ${SYMS[i].slice(8, 9)}-components the wrong way round`,
  }));
  const wrong = [
    { display: `$${vecTex(sub(a, b))}$`, trap: 'used a − b: AB is the position vector of B minus that of A' },
    { display: `$${vecTex(add(a, b))}$`, trap: 'added the position vectors instead of subtracting them' },
    ...flips,
    { display: `$${vecTex(b)}$`, trap: 'gave the position vector of B' },
    { display: `$${vecTex(a)}$`, trap: 'gave the position vector of A' },
  ].filter((w) => w.display !== correct);
  return {
    stem: `The points $A$ and $B$ have position vectors $\\mathbf{a} = ${vecTex(a)}$ and $\\mathbf{b} = ${vecTex(b)}$. Find the vector $\\mathbf{AB}$.`,
    answer: { kind: 'choice' as const, value: correct },
    options: buildChoiceOptions(rng, correct, wrong),
    solution: `The vector $\\mathbf{AB} = \\mathbf{b} - \\mathbf{a} = (${vecTex(b)}) - (${vecTex(a)}) = ${vecTex(ab)}$.`,
    trap: 'AB = b − a, not a − b: the arrow runs from A to B, so the start point is subtracted.',
    tags: ['vectors', 'position-vectors', 'geometry'],
    params: { variant: 'ab-vector', a, b },
    typedAllowed: false,
  };
}

function midpointQ(rng: RNG): Generated | null {
  const a: Pt = [rng.int(-8, 10), rng.int(-8, 10)];
  const b: Pt = [rng.int(-8, 10), rng.int(-8, 10)];
  if (a[0] === b[0] || a[1] === b[1]) return null;
  const mx = frac(a[0] + b[0], 2), my = frac(a[1] + b[1], 2);
  if (mx.equals(my) || mx.isZero()) return null;
  const must = cleanOnly([
    { value: E(a[0] + b[0]), trap: 'forgot to halve the sum of the x-coordinates' },
    { value: frac(b[0] - a[0], 2), trap: 'halved the difference instead of the sum' },
    { value: my, trap: 'gave the y-coordinate of the midpoint' },
  ]);
  const extra = cleanOnly([
    { value: E(b[0] - a[0]), trap: 'gave the change in x' },
    { value: mx.add(E(1)), trap: 'arithmetic slip of one' },
    { value: mx.sub(E(1)), trap: 'arithmetic slip of one' },
    { value: frac(a[0] + b[0] + a[1] + b[1], 2), trap: 'averaged all four coordinates' },
    { value: E(a[0]), trap: 'quoted the x-coordinate of A' },
  ]);
  return {
    stem: `$A$ is the point $${ptTex(a)}$ and $B$ is the point $${ptTex(b)}$. $M$ is the midpoint of $AB$. Find the $x$-coordinate of $M$.`,
    answer: { kind: 'exact' as const, value: mx },
    options: buildOptions(rng, mx, ranked(rng, mx, must, extra), { format: 'fraction' }),
    solution: `The midpoint averages the coordinates: $x_M = \\frac{${a[0]} + ${b[0] < 0 ? `(${b[0]})` : b[0]}}{2} = ${mx.toLatex({ format: 'fraction' })}$.`,
    trap: 'The midpoint adds the coordinates and halves; halving the difference gives half the displacement instead.',
    tags: ['vectors', 'midpoint', 'coordinates'],
    params: { variant: 'midpoint', a, b },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 2

const RATIOS: [number, number][] = [[1, 2], [2, 1], [1, 3], [3, 1], [1, 4], [2, 3], [3, 2]];

function ratioPointQ(rng: RNG): Generated | null {
  const [m, n] = rng.pick(RATIOS);
  const k = m + n;
  const a: Pt = [rng.int(-6, 8), rng.int(-6, 8)];
  const step: Pt = [rng.nonZeroInt(-3, 3), rng.nonZeroInt(-3, 3)];
  const b = add(a, step.map((x) => x * k));
  if (b.some((x) => Math.abs(x) > 14)) return null;
  if (add(a, b).some((x) => x % 2 !== 0)) return null; // keep the midpoint distractor a lattice point
  const p = add(a, step.map((x) => x * m));
  const swapped = add(a, step.map((x) => x * n));
  const mid = add(a, b).map((x) => x / 2);
  const justTheVector = step.map((x) => x * m);
  const beyond = add(b, step.map((x) => x * m));
  const correct = `$${ptTex(p)}$`;
  const wrong = [
    { display: `$${ptTex(swapped)}$`, trap: `used the weights the wrong way round (that is the point dividing AB in the ratio ${n}:${m})` },
    { display: `$${ptTex(mid)}$`, trap: 'took the midpoint, ignoring the ratio' },
    { display: `$${ptTex(justTheVector)}$`, trap: 'found the vector AP but forgot to add the position vector of A' },
    { display: `$${ptTex(beyond)}$`, trap: 'stepped on past B instead of stopping inside AB' },
    { display: `$${ptTex(sub(a, step.map((x) => x * m)))}$`, trap: 'moved from A in the wrong direction' },
    { display: `$${ptTex(add(a, step))}$`, trap: 'moved one step from A instead of m of them' },
  ].filter((w) => w.display !== correct);
  return {
    stem: `$A$ is the point $${ptTex(a)}$ and $B$ is the point $${ptTex(b)}$. The point $P$ lies on $AB$ with $AP : PB = ${m} : ${n}$. Find the coordinates of $P$.`,
    answer: { kind: 'choice' as const, value: correct },
    options: buildChoiceOptions(rng, correct, wrong),
    solution: `$\\mathbf{AB} = ${vecTex(sub(b, a))}$, and $P = A + \\frac{${m}}{${k}}\\mathbf{AB} = ${ptTex(a)} + ${ptTex(step.map((x) => x * m))} = ${ptTex(p)}$.`,
    trap: `AP : PB = ${m} : ${n} means P is ${m}/${k} of the way from A to B — swapping the weights lands on the wrong point.`,
    tags: ['vectors', 'ratio', 'coordinates'],
    params: { variant: 'ratio-point', a, b, m, n },
    typedAllowed: false,
  };
}

// ----------------------------------------------------------------------------- level 3

const STEPS_3D: Pt[] = [[1, 2, 2], [2, 3, 6], [1, 4, 8], [2, 6, 9], [4, 4, 7], [2, 2, 1], [6, 6, 7], [3, 4, 12], [1, 1, 1], [2, 2, 2], [1, 1, 2], [2, 4, 4], [0, 3, 4], [3, 6, 6], [1, 2, 3], [2, 3, 4]];

function distance3dQ(rng: RNG): Generated | null {
  const base = rng.pick(STEPS_3D);
  const order = rng.shuffle([0, 1, 2]);
  const step = order.map((j) => rng.sign() * base[j]);
  const a: Pt = [rng.int(-5, 6), rng.int(-5, 6), rng.int(-4, 6)];
  const b = add(a, step);
  if (b.some((x) => Math.abs(x) > 12)) return null;
  const n2 = norm2(step);
  const answer = surd(n2);
  if (!isCleanExact(answer).ok || answer.terms[0].r > 15) return null;
  const absSum = step.reduce((s, x) => s + Math.abs(x), 0);
  const flat = step[0] * step[0] + step[1] * step[1];
  /** A length option must be positive and of a comparable size to the answer. */
  const lengths = (ds: { value: Exact | null; trap: string }[]) =>
    cleanOnly(ds).filter((d) => d.value.toNumber() > 0 && d.value.toNumber() < 4 * answer.toNumber() + 2);
  const must = lengths([
    { value: E(n2), trap: 'gave the square of the distance' },
    { value: flat > 0 ? surd(flat) : null, trap: 'ignored the z-coordinates' },
    { value: E(absSum), trap: 'added the coordinate differences instead of squaring them' },
  ]);
  const extra = lengths([
    { value: surd(absSum), trap: 'square-rooted the sum of the differences' },
    { value: answer.isInteger() ? answer.add(E(1)) : null, trap: 'arithmetic slip of one' },
    { value: answer.isInteger() ? answer.sub(E(1)) : null, trap: 'arithmetic slip of one' },
    { value: surd(norm2(add(b, a))), trap: 'added the coordinates instead of subtracting them' },
    { value: surd(norm2(b)), trap: 'found the distance of B from the origin' },
  ]);
  return {
    stem: `Find the distance between the points $A${ptTex(a)}$ and $B${ptTex(b)}$.`,
    answer: { kind: 'exact' as const, value: answer },
    options: buildOptions(rng, answer, ranked(rng, answer, must, extra)),
    solution: `$\\mathbf{AB} = ${vecTex(step)}$, so $AB = \\sqrt{${step.map((x) => (x < 0 ? `(${x})^2` : `${x}^2`)).join(' + ')}} = \\sqrt{${n2}} = ${answer.toLatex()}$.`,
    trap: 'Square the differences, add all three, then take the root — stopping at the sum gives the square of the distance.',
    tags: ['vectors', 'distance', '3d'],
    params: { variant: 'distance', a, b },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 4

function collinearQ(rng: RNG): Generated | null {
  const dx = rng.nonZeroInt(-4, 4), dy = rng.nonZeroInt(-4, 4);
  const a: Pt = [rng.int(-5, 6), rng.int(-5, 6)];
  const b = [a[0] + dx, a[1] + dy];
  const t = rng.pick([2, 3, 4, -1, -2, 5]);
  const c = [a[0] + t * dx, a[1] + t * dy];
  if (c.some((x) => Math.abs(x) > 20) || t === 1) return null;
  const k = c[0];
  const answer = E(k);
  const must = cleanOnly([
    { value: frac(a[0] * dx + t * dy * dy, dx), trap: 'used the reciprocal of the gradient' },
    { value: E(a[0] - t * dx), trap: 'sign error on the step in x' },
    { value: E(a[0] + dx), trap: 'stepped across only once instead of scaling the whole displacement' },
  ]);
  const extra = cleanOnly([
    { value: E(b[0] + t * dx), trap: 'stepped from B instead of from A' },
    { value: frac(a[0] + b[0], 2), trap: 'treated C as the midpoint of AB' },
    { value: E(c[1]), trap: 'quoted the y-coordinate' },
    { value: E(k + 1), trap: 'arithmetic slip of one' },
    { value: E(k - 1), trap: 'arithmetic slip of one' },
    { value: E(a[0] + t * dy), trap: 'mixed up the x- and y-steps' },
  ]);
  return {
    stem: `The points $A${ptTex(a)}$, $B${ptTex(b)}$ and $C(k, ${c[1]})$ are collinear. Find the value of $k$.`,
    answer: { kind: 'exact' as const, value: answer },
    options: buildOptions(rng, answer, ranked(rng, answer, must, extra)),
    solution: `$\\mathbf{AB} = ${vecTex([dx, dy])}$ and the change in $y$ from $A$ to $C$ is $${c[1] - a[1]}$, which is $${t}$ times $${dy}$. So $\\mathbf{AC} = ${t === -1 ? '-' : t}\\,\\mathbf{AB}$ and $k = ${a[0]} + ${t < 0 ? `(${t})` : t} \\times ${dx < 0 ? `(${dx})` : dx} = ${k}$.`,
    trap: 'Collinear means AC is a multiple of AB — the same multiplier must be used on both components.',
    tags: ['vectors', 'collinear', 'coordinates'],
    params: { variant: 'collinear', a, b, cy: c[1] },
    typedAllowed: true,
  };
}

function parallelogramQ(rng: RNG): Generated | null {
  const a: Pt = [rng.int(-6, 7), rng.int(-6, 7)];
  const u: Pt = [rng.nonZeroInt(-6, 6), rng.nonZeroInt(-6, 6)];
  const v: Pt = [rng.nonZeroInt(-6, 6), rng.nonZeroInt(-6, 6)];
  if (u[0] * v[1] - u[1] * v[0] === 0) return null; // degenerate parallelogram
  const b = add(a, u);
  const c = add(b, v);
  const d = add(a, v); // ABCD in order: D = A + C − B
  const pts = [a, b, c, d];
  if (pts.some((p) => p.some((x) => Math.abs(x) > 16))) return null;
  const correct = `$${ptTex(d)}$`;
  const wrong = [
    { display: `$${ptTex(sub(add(a, b), c))}$`, trap: 'used A + B − C: the vertices must be taken in the order ABCD' },
    { display: `$${ptTex(sub(add(b, c), a))}$`, trap: 'used B + C − A, which is the reflection of A in the centre' },
    { display: `$${ptTex(add(add(a, b), c))}$`, trap: 'added all three position vectors' },
    { display: `$${ptTex(sub(add(a, v), u))}$`, trap: 'stepped backwards along AB as well as along BC' },
    { display: `$${ptTex(sub(c, a))}$`, trap: 'gave the vector AC rather than a point' },
    { display: `$${ptTex(sub(b, v))}$`, trap: 'stepped the wrong way along BC' },
  ].filter((w) => w.display !== correct);
  return {
    stem: `$ABCD$ is a parallelogram with $A${ptTex(a)}$, $B${ptTex(b)}$ and $C${ptTex(c)}$. Find the coordinates of $D$.`,
    answer: { kind: 'choice' as const, value: correct },
    options: buildChoiceOptions(rng, correct, wrong),
    solution: `In $ABCD$, $\\mathbf{AD} = \\mathbf{BC} = ${vecTex(v)}$, so $D = A + \\mathbf{BC} = ${ptTex(d)}$.`,
    trap: 'In parallelogram ABCD the equal sides are AB and DC, so D = A + C − B, not B + C − A.',
    tags: ['vectors', 'parallelogram', 'coordinates'],
    params: { variant: 'parallelogram', a, b, c },
    typedAllowed: false,
  };
}

// ----------------------------------------------------------------------------- level 5

function triangleAreaQ(rng: RNG): Generated | null {
  const a: Pt = [rng.int(-6, 7), rng.int(-6, 7)];
  const u: Pt = [rng.nonZeroInt(-6, 6), rng.nonZeroInt(-6, 6)];
  const v: Pt = [rng.nonZeroInt(-6, 6), rng.nonZeroInt(-6, 6)];
  const b = add(a, u), c = add(a, v);
  const cross = u[0] * v[1] - u[1] * v[0];
  if (cross === 0 || Math.abs(cross) > 48) return null;
  if ([a, b, c].some((p) => p.some((x) => Math.abs(x) > 12))) return null;
  const answer = frac(Math.abs(cross), 2);
  const originOnly = frac(Math.abs(a[0] * b[1] - b[0] * a[1]), 2);
  /** An area option must be positive. */
  const areas = (ds: { value: Exact | null; trap: string }[]) => cleanOnly(ds).filter((d) => d.value.toNumber() > 0);
  const must = areas([
    { value: E(Math.abs(cross)), trap: 'forgot the factor of ½' },
    { value: originOnly.isZero() ? null : originOnly, trap: 'used ½|x₁y₂ − x₂y₁|, which only works when the third vertex is the origin' },
    { value: frac(Math.abs(cross), 4), trap: 'halved twice' },
  ]);
  const extra = areas([
    { value: answer.add(E(1)), trap: 'arithmetic slip of one' },
    { value: answer.sub(E(1)), trap: 'arithmetic slip of one' },
    { value: E(Math.abs(u[0] * v[1]) + Math.abs(u[1] * v[0])), trap: 'added the two products instead of subtracting them' },
    { value: frac(Math.abs(u[0] * v[1] + u[1] * v[0]), 2), trap: 'added the two products inside the bracket' },
    { value: E(2 * Math.abs(cross)), trap: 'doubled instead of halving' },
  ]);
  return {
    stem: `Find the area of the triangle with vertices $A${ptTex(a)}$, $B${ptTex(b)}$ and $C${ptTex(c)}$.`,
    answer: { kind: 'exact' as const, value: answer, format: 'fraction' },
    options: buildOptions(rng, answer, ranked(rng, answer, must, extra), { format: 'fraction' }),
    solution: `$\\mathbf{AB} = ${vecTex(u)}$ and $\\mathbf{AC} = ${vecTex(v)}$, so the area is $\\tfrac12|${u[0]} \\times ${v[1] < 0 ? `(${v[1]})` : v[1]} - ${u[1] < 0 ? `(${u[1]})` : u[1]} \\times ${v[0] < 0 ? `(${v[0]})` : v[0]}| = \\tfrac12 \\times ${Math.abs(cross)} = ${answer.toLatex({ format: 'fraction' })}$.`,
    trap: 'The determinant gives twice the area: the factor of ½ is the step most often dropped.',
    tags: ['vectors', 'area', 'triangle'],
    params: { variant: 'area', a, b, c },
    typedAllowed: true,
  };
}

function scaledPointQ(rng: RNG): Generated | null {
  const den = rng.pick([2, 3, 4]);
  const num = rng.pick([3, 5, 7, 4, 5, 8].filter((x) => x % den !== 0 && x > den));
  const a: Pt = [rng.nonZeroInt(-4, 5) * den, rng.nonZeroInt(-4, 5) * den];
  if (a.some((x) => Math.abs(x) > 16) || a[0] === a[1]) return null;
  const which = rng.int(0, 1);
  const label = which === 0 ? 'x' : 'y';
  const value = (a[which] * num) / den;
  const answer = E(value);
  if (!isCleanExact(answer).ok || Math.abs(value) > 60) return null;
  const must = cleanOnly([
    { value: frac(a[which] * den, num), trap: 'used the reciprocal of the scale factor' },
    { value: E(a[which] * num), trap: 'forgot to divide by the denominator of the scale factor' },
    { value: E((a[1 - which] * num) / den), trap: `gave the ${which === 0 ? 'y' : 'x'}-coordinate instead` },
  ]);
  const extra = cleanOnly([
    { value: frac(a[which] * num, den).add(E(a[which])), trap: 'added OA on top of the scaled vector' },
    { value: E(a[which]), trap: 'quoted the coordinate of A' },
    { value: answer.add(E(1)), trap: 'arithmetic slip of one' },
    { value: answer.sub(E(1)), trap: 'arithmetic slip of one' },
    { value: E(a[which] * (num - den) / den), trap: 'scaled AC instead of OC' },
  ]);
  return {
    stem: `$O$ is the origin and $A$ is the point $${ptTex(a)}$. The point $C$ lies on $OA$ extended so that $\\mathbf{OC} = \\frac{${num}}{${den}}\\mathbf{OA}$. Find the $${label}$-coordinate of $C$.`,
    answer: { kind: 'exact' as const, value: answer },
    options: buildOptions(rng, answer, ranked(rng, answer, must, extra), { format: 'fraction' }),
    solution: `Every coordinate is multiplied by $\\frac{${num}}{${den}}$: $${label}_C = \\frac{${num}}{${den}} \\times ${a[which] < 0 ? `(${a[which]})` : a[which]} = ${value}$.`,
    trap: 'OC = k·OA scales both coordinates by k; turning the fraction upside down is the usual slip.',
    tags: ['vectors', 'position-vectors', 'ratio'],
    params: { variant: 'scaled', a, num, den, which },
    typedAllowed: true,
  };
}

// -----------------------------------------------------------------------------

/** All the signed integers in an option's display, in order. */
function numbersIn(display: string): number[] {
  return (display.match(/[+-]?\s*\d+/g) ?? []).map((s) => Number(s.replace(/\s+/g, '')));
}

export default defineTemplate({
  id: 'm2.vectors.geometry',
  module: 'M2',
  topic: 'vectors',
  title: 'Position vectors and vector geometry',
  levels: {
    1: 'AB from two position vectors, or the x-coordinate of the midpoint of AB',
    2: 'the point dividing AB in the ratio m : n',
    3: 'the distance between two points in three dimensions',
    4: 'k making three points collinear; the fourth vertex of a parallelogram',
    5: 'the area of a triangle from its three vertices; a point on OA extended in a fractional ratio',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return pickVariant(rng, [abVectorQ, abVectorQ, midpointQ]);
        case 2: return pickVariant(rng, [ratioPointQ]);
        case 3: return pickVariant(rng, [distance3dQ]);
        case 4: return pickVariant(rng, [collinearQ, parallelogramQ]);
        default: return pickVariant(rng, [triangleAreaQ, triangleAreaQ, scaledPointQ]);
      }
    });
  },
  verify(q) {
    const p = q.params as { variant: string; a: number[]; b?: number[]; c?: number[]; m?: number; n?: number; cy?: number; num?: number; den?: number; which?: number };
    const near = (x: number, y: number) => Math.abs(x - y) < 1e-9;
    const val = q.answer.kind === 'exact' ? q.answer.value.toNumber() : NaN;
    const chosen = q.answer.kind === 'choice' ? numbersIn(q.answer.value) : [];
    switch (p.variant) {
      case 'ab-vector': {
        const a = p.a, b = p.b!;
        return chosen.length === a.length && chosen.every((x, i) => x === b[i] - a[i]);
      }
      case 'midpoint':
        return near(val, (p.a[0] + p.b![0]) / 2);
      case 'ratio-point': {
        // P = (n·A + m·B) / (m + n), computed straight from the weights rather than by stepping along AB.
        const a = p.a, b = p.b!, m = p.m!, n = p.n!;
        if (chosen.length !== 2) return false;
        return chosen.every((x, i) => near(x, (n * a[i] + m * b[i]) / (m + n)));
      }
      case 'distance': {
        const a = p.a, b = p.b!;
        return near(val, Math.sqrt(b.reduce((s, x, i) => s + (x - a[i]) ** 2, 0)));
      }
      case 'collinear': {
        // Collinearity as a vanishing cross product of AB and AC, with k = the answer.
        const a = p.a, b = p.b!, c = [val, p.cy!];
        return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 1e-9;
      }
      case 'parallelogram': {
        // ABCD is a parallelogram exactly when AB = DC.
        const a = p.a, b = p.b!, c = p.c!;
        if (chosen.length !== 2) return false;
        return chosen.every((x, i) => near(b[i] - a[i], c[i] - x));
      }
      case 'area': {
        // Shoelace over the three vertices in order (generate uses the cross product of AB and AC).
        const [a, b, c] = [p.a, p.b!, p.c!];
        const shoelace = Math.abs(a[0] * b[1] - b[0] * a[1] + b[0] * c[1] - c[0] * b[1] + c[0] * a[1] - a[0] * c[1]) / 2;
        return near(val, shoelace) && val > 0;
      }
      case 'scaled': {
        const k = p.num! / p.den!;
        return near(val, k * p.a[p.which!]);
      }
      default:
        return false;
    }
  },
});
