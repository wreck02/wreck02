import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { Exact } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { num } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Motion graphs described in words (no diagrams in the app).
 * Level 1: v–t graph, constant velocity → the distance travelled (area of a rectangle), sometimes over
 *          only the first part of the line; s–t graph, straight line → speed (gradient)
 * Level 2: velocity rises uniformly from u to v in t → distance (triangle or trapezium) or acceleration
 * Level 3: two-segment v–t (accelerate then cruise) → total distance; s–t graph with three segments → speed
 *          in a segment or average speed
 * Level 4: three-segment trapezium (accelerate, cruise, decelerate) → total distance or average speed
 * Level 5: velocity goes negative (return journey): displacement vs distance travelled; a–t graph → change in
 *          velocity (area) and hence the final velocity
 *
 * Every wrong option is a named mistake and the option list is never padded: a draw that cannot supply four
 * distinct clean ones is rejected. Each area question names mistakes that overshoot the answer (counting a
 * stage twice, reading the enclosing rectangle, using the whole line instead of the part asked about) as
 * well as ones that undershoot it, and the builder aims at a random number of options below the answer, so
 * the correct option's rank is not a property of the sub-variant.
 */

const DEC = { format: 'decimal' as const };
const U = {
  v: '\\text{m s}^{-1}',
  a: '\\text{m s}^{-2}',
  s: '\\text{m}',
  t: '\\text{s}',
};

const X = (x: number): Exact => Exact.num(Number(x.toFixed(9)));
const q = (x: number, unit: string): string => `$${num(x)}\\ ${unit}$`;

type Cand = { value: number | null; trap: string };

/** Positive, clean candidates close enough to the answer to be weighed against it. */
function cleanOnly(ds: Cand[], answer: number): Distractor[] {
  const out: Distractor[] = [];
  for (const d of ds) {
    if (d.value === null || !Number.isFinite(d.value) || d.value <= 0) continue;
    if (d.value > 40 * answer || d.value < answer / 40) continue;
    const v = X(d.value);
    if (!isCleanExact(v).ok) continue;
    out.push({ value: v, trap: d.trap });
  }
  return out;
}

/**
 * Headline traps first, then the rest chosen towards a randomly drawn number of options *below* the
 * answer. Without that, every area question puts the "enclosing rectangle" slip above the answer and
 * every other slip below it, and the correct option sits at the same rank in every instance of the
 * sub-variant — "area question, second from the top" would answer the item without any arithmetic.
 */
function ranked(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], count = 4): Distractor[] {
  const a = answer.toNumber();
  const seen: Exact[] = [answer];
  const out: Distractor[] = [];
  const nums: number[] = [a];
  const take = (d: Distractor) => {
    if (out.length >= count || seen.some((s) => s.equals(d.value))) return;
    const x = d.value.toNumber();
    if (out.length > 0 && Math.max(...nums, x) / Math.min(...nums, x) > 60) return;
    seen.push(d.value);
    nums.push(x);
    out.push(d);
  };
  // One headline trap always survives; the others are preferred within their own side of the answer.
  // Taking *both* of a bracketing pair every time (v·T above, ½v·T below) is what made the trapezium's
  // total distance the median option two questions in three.
  const heads = rng.shuffle(must);
  if (heads.length > 0) take(heads[0]);
  const rest = heads.slice(1);
  const side = (lo: boolean) => [...rest, ...rng.shuffle(extra)].filter((d) => (lo ? d.value.toNumber() < a : d.value.toNumber() > a));
  const below = side(true);
  const above = side(false);
  let wantBelow = rng.int(0, count) - out.filter((d) => d.value.toNumber() < a).length;
  while (out.length < count && (below.length > 0 || above.length > 0)) {
    const useBelow = below.length > 0 && (wantBelow > 0 || above.length === 0);
    take((useBelow ? below : above).shift()!);
    if (useBelow) wantBelow--;
  }
  return out;
}

/** Options from named mistakes only: a draw that cannot supply four of them is rejected, never padded. */
function physOptions(rng: RNG, answer: number, unit: string, must: Cand[], extra: Cand[]) {
  const ans = X(answer);
  const ds = ranked(rng, ans, cleanOnly(must, answer), cleanOnly(extra, answer));
  if (ds.length < 4) return null;
  return buildOptions(rng, ans, ds, { ...DEC, unit });
}

function finish(stem: string, answer: number, unit: string, options: ReturnType<typeof buildOptions> | null, solution: string, trap: string, tags: string[], params: Record<string, unknown>): Generated | null {
  if (!options) return null;
  return { stem, answer: { kind: 'exact', value: X(answer), ...DEC, unit }, options, solution, trap, tags, params, typedAllowed: true };
}

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

/** A straight-line segment of a graph: duration and the values at its start and end. */
type Seg = [dur: number, y0: number, y1: number];

const MOVER = ['a car', 'a train', 'a cyclist', 'a particle moving in a straight line', 'a runner', 'a lift'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Words for a velocity–time graph: "For the first 4 s the velocity rises uniformly from 0 to 12 m s⁻¹; …" */
function describeVT(segs: Seg[]): string {
  const parts = segs.map(([dur, v0, v1], i) => {
    const when = i === 0 ? `For the first ${q(dur, U.t)}` : i === segs.length - 1 ? `for the final ${q(dur, U.t)}` : `over the next ${q(dur, U.t)}`;
    let what: string;
    if (v0 === v1) what = `the velocity is constant at ${q(v0, U.v)}`;
    else if (v1 > v0) what = `the velocity rises uniformly from ${q(v0, U.v)} to ${q(v1, U.v)}`;
    else what = `the velocity falls uniformly from ${q(v0, U.v)} to ${q(v1, U.v)}`;
    return `${when} ${what}`;
  });
  return parts.join('; ') + '.';
}

// ------------------------------------------------------------------------------------------ level 1

function constantVelocity(rng: RNG): Generated | null {
  const v = rng.pick([3, 4, 5, 6, 8, 10, 12, 15, 20]);
  const t = rng.pick([4, 5, 6, 8, 10, 12, 15, 20]);
  // Half the time the line runs on past the interval asked about. Reading the whole line is a real slip,
  // and it is the mistake that *overshoots* a rectangle's area, which nothing else here does.
  const rest = rng.pick([0, 0, 2, 3, 4, 5, 6, 8]);
  const T = t + rest;
  const s = v * t;
  const who = rng.pick(MOVER);
  const stem = rest === 0
    ? `The velocity–time graph for ${who} is a horizontal line: the velocity is constant at ${q(v, U.v)} for ${q(t, U.t)}. Find the distance travelled in this time.`
    : `The velocity–time graph for ${who} is a horizontal line: the velocity is constant at ${q(v, U.v)} for ${q(T, U.t)}. Find the distance travelled in the first ${q(t, U.t)}.`;
  return finish(stem, s, U.s, physOptions(rng, s, U.s, [
    { value: 0.5 * v * t, trap: 'used ½ × base × height: the region under a horizontal line is a rectangle, not a triangle' },
    rest === 0
      ? { value: 2 * v * t, trap: 'counted the area under the graph twice' }
      : { value: v * T, trap: `used the whole ${num(T)} s instead of the first ${num(t)} s` },
  ], [
    { value: v / t, trap: 'divided instead of multiplying (that would be a gradient)' },
    { value: rest === 0 ? null : v * rest, trap: 'used the rest of the graph instead of the interval asked about' },
    { value: rest === 0 ? null : 2 * v * t, trap: 'counted the area under the graph twice' },
    { value: v, trap: 'quoted the velocity as the distance' },
    { value: 0.25 * v * t, trap: 'halved the rectangle twice' },
    { value: v * t * t, trap: 'multiplied by the time twice' },
  ]),
  `Distance is the area under the velocity–time graph: a rectangle of height $${v}$ and width $${t}$, so $${v} \\times ${t} = ${s}$ m.`,
  'Area under a v–t graph gives distance; for constant velocity it is a rectangle v × t (no ½).',
  ['graphs', 'v-t', 'area'], { kind: 'vt', segs: [[t, v, v]], ask: 'distance' });
}

function straightST(rng: RNG): Generated | null {
  const v = rng.pick([2, 3, 4, 5, 6, 8, 10, 12, 15]);
  const t = rng.pick([4, 5, 6, 8, 10, 12, 20]);
  const s = v * t;
  const who = rng.pick(MOVER);
  const stem = `The displacement–time graph for ${who} is a straight line from the origin to the point $(${t}\\ \\text{s},\\ ${s}\\ \\text{m})$. Find the speed.`;
  return finish(stem, v, U.v, physOptions(rng, v, U.v, [
    { value: t / s, trap: 'inverted the gradient: speed is displacement ÷ time' },
    { value: s * t, trap: 'multiplied instead of dividing' },
  ], [
    { value: s, trap: 'quoted the final displacement as the speed' },
    { value: s / (t * t), trap: 'divided by the time twice' },
    { value: (s - t) / t, trap: 'subtracted the time from the displacement before dividing' },
    { value: 2 * v, trap: 'read the gradient as the displacement over half the time' },
    { value: s / t + t, trap: 'added the time to the gradient' },
  ]),
  `Speed is the gradient of the displacement–time graph: $\\frac{${s}}{${t}} = ${v}$ m s$^{-1}$.`,
  'On a displacement–time graph the gradient is the velocity (area under it means nothing useful).',
  ['graphs', 's-t', 'gradient'], { kind: 'st', segs: [[t, 0, s]], ask: 'speed', seg: 0 });
}

// ------------------------------------------------------------------------------------------ level 2

function uniformRise(rng: RNG): Generated | null {
  const v = rng.pick([4, 6, 8, 10, 12, 15, 16, 20, 24, 30]);
  // a line that starts from a standing start half the time and from a non-zero velocity the rest: with
  // u > 0 the "used the final velocity throughout" slip sits above the answer and "used the initial
  // velocity" below it, so the area answer is not always the second smallest option
  const u = rng.pick([0, 0, 0, 2, 3, 4, 5, 6, 8]);
  const t = rng.pick([2, 4, 5, 6, 8, 10, 12]);
  if (u >= v) return null;
  const s = 0.5 * (u + v) * t;
  const a = (v - u) / t;
  if (!Number.isInteger(s) || !Number.isInteger(a * 2)) return null;
  const who = rng.pick(MOVER);
  const graph = u === 0
    ? `The velocity–time graph for ${who} is a straight line through the origin: the velocity rises uniformly from $0$ to ${q(v, U.v)} in ${q(t, U.t)}.`
    : `The velocity–time graph for ${who} is a straight line: the velocity rises uniformly from ${q(u, U.v)} to ${q(v, U.v)} in ${q(t, U.t)}.`;
  const segs: Seg[] = [[t, u, v]];
  if (rng.bool(0.5)) {
    return finish(`${graph} Find the distance travelled in this time.`, s, U.s, physOptions(rng, s, U.s, [
      { value: (u + v) * t, trap: u === 0 ? 'forgot the ½: the region under a sloping line through the origin is a triangle' : 'forgot the ½ in the trapezium ½(u + v)t' },
      u === 0
        ? { value: v / t, trap: 'found the gradient (the acceleration) instead of the area' }
        : { value: v * t, trap: 'used the final velocity for the whole time' },
    ], [
      { value: u === 0 ? 0.25 * v * t : u * t, trap: u === 0 ? 'halved twice' : 'used the initial velocity for the whole time' },
      { value: 0.5 * (v - u) * t, trap: u === 0 ? 'halved the base as well' : 'used the change in velocity instead of the average velocity' },
      { value: u === 0 ? null : 0.5 * v * t, trap: 'ignored the initial velocity and used ½vt' },
      { value: u === 0 ? null : 2 * s, trap: 'counted the area twice' },
      { value: (v - u) / t, trap: 'found the gradient (the acceleration) instead of the area' },
      { value: 0.5 * v / t, trap: 'halved the gradient' },
      { value: s + v * t, trap: 'added the enclosing rectangle to the area under the line' },
      { value: 0.5 * v * t * t, trap: 'used ½vt², treating the velocity as an acceleration' },
    ]),
    u === 0
      ? `Distance is the area of the triangle: $\\tfrac{1}{2} \\times ${t} \\times ${v} = ${s}$ m.`
      : `Distance is the area of the trapezium: $\\tfrac{1}{2}(${u} + ${v}) \\times ${t} = ${s}$ m.`,
    u === 0
      ? 'Area under a sloping v–t line from the origin is a triangle: ½ × time × final velocity.'
      : 'Area under a sloping v–t line is a trapezium: the average velocity ½(u + v) times the time.',
    ['graphs', 'v-t', 'area', u === 0 ? 'triangle' : 'trapezium'], { kind: 'vt', segs, ask: 'distance' });
  }
  return finish(`${graph} Find the acceleration.`, a, U.a, physOptions(rng, a, U.a, [
    { value: 0.5 * (u + v) * t, trap: 'found the area (the distance) instead of the gradient' },
    u === 0
      ? { value: t / v, trap: 'inverted the gradient: acceleration is change in velocity ÷ time' }
      : { value: v / t, trap: 'used the final velocity instead of the change in velocity' },
  ], [
    { value: u === 0 ? null : t / (v - u), trap: 'inverted the gradient: acceleration is change in velocity ÷ time' },
    { value: u === 0 ? null : (u + v) / t, trap: 'added the velocities instead of subtracting them' },
    { value: (v - u) * t, trap: 'multiplied instead of dividing' },
    { value: (v - u) / (t * t), trap: 'divided by the time twice' },
    { value: u === 0 ? null : u / t, trap: 'used the initial velocity instead of the change in velocity' },
    { value: 0.5 * a, trap: 'put a ½ into the gradient' },
    { value: 2 * a, trap: 'used half the time' },
  ]),
  `Acceleration is the gradient of the velocity–time graph: $\\frac{${v} - ${u}}{${t}} = ${num(a)}$ m s$^{-2}$.`,
  'Gradient of a v–t graph is acceleration; area is distance. Do not swap them.',
  ['graphs', 'v-t', 'gradient'], { kind: 'vt', segs, ask: 'acceleration', seg: 0 });
}

// ------------------------------------------------------------------------------------------ level 3

function accelThenCruise(rng: RNG): Generated | null {
  const v = rng.pick([4, 6, 8, 10, 12, 15, 16, 20, 24, 30]);
  const t1 = rng.pick([2, 4, 5, 6, 8, 10]);
  const t2 = rng.pick([5, 6, 8, 10, 12, 15, 20]);
  const s1 = 0.5 * v * t1;
  const s2 = v * t2;
  const total = s1 + s2;
  if (!Number.isInteger(total) || total > 1200) return null;
  const segs: Seg[] = [[t1, 0, v], [t2, v, v]];
  const who = rng.pick(MOVER);
  const stem = `${cap(who)} starts from rest. Its velocity–time graph is described as follows. ${describeVT(segs)} Find the total distance travelled.`;
  return finish(stem, total, U.s, physOptions(rng, total, U.s, [
    { value: v * (t1 + t2), trap: 'treated the whole graph as a rectangle (forgot the ½ for the triangle)' },
    { value: 0.5 * v * (t1 + t2), trap: 'treated the whole graph as a triangle' },
  ], [
    { value: total + s2, trap: 'counted the constant-velocity stage twice' },
    { value: s1 + 0.5 * s2, trap: 'halved the rectangle as well as the triangle' },
    { value: s2, trap: 'forgot the accelerating stage' },
    { value: s1, trap: 'forgot the constant-velocity stage' },
    { value: v * t1 + 0.5 * v * t2, trap: 'swapped the ½: triangle and rectangle the wrong way round' },
    { value: v * (t1 + t2) + s1, trap: 'used the enclosing rectangle and added the triangle as well' },
  ]),
  `Triangle: $\\tfrac{1}{2} \\times ${t1} \\times ${v} = ${s1}$ m. Rectangle: $${v} \\times ${t2} = ${s2}$ m. Total $${total}$ m.`,
  'Split the area into a triangle (½ × base × height) and a rectangle; only the sloping part gets the ½.',
  ['graphs', 'v-t', 'area', 'two-segment'], { kind: 'vt', segs, ask: 'distance' });
}

function threeSegmentST(rng: RNG, askAvg: boolean): Generated | null {
  const v1 = rng.pick([2, 3, 4, 5, 6, 8]);
  const t1 = rng.pick([4, 5, 6, 8, 10]);
  const t2 = rng.pick([4, 5, 6, 8, 10]);
  const v3 = rng.pick([2, 3, 4, 5, 6, 8, 10, 12].filter((x) => x !== v1));
  const t3 = rng.pick([4, 5, 6, 8, 10]);
  const s1 = v1 * t1;
  const s2 = s1 + v3 * t3;
  const T = t1 + t2 + t3;
  const avg = s2 / T;
  if (askAvg && !Number.isInteger(avg * 2)) return null; // redraw until the average is a clean number
  const who = rng.pick(['a walker', 'a cyclist', 'a delivery van', 'a robot']);
  const graph = `On a displacement–time graph for ${who}, the displacement rises uniformly from $0$ to ${q(s1, U.s)} in the first ${q(t1, U.t)}, stays at ${q(s1, U.s)} for the next ${q(t2, U.t)}, then rises uniformly from ${q(s1, U.s)} to ${q(s2, U.s)} in the final ${q(t3, U.t)}.`;
  const segs: Seg[] = [[t1, 0, s1], [t2, s1, s1], [t3, s1, s2]];
  if (askAvg) {
    return finish(`${graph} Find the average speed for the whole ${q(T, U.t)}.`, avg, U.v, physOptions(rng, avg, U.v, [
      { value: (v1 + 0 + v3) / 3, trap: 'averaged the three segment speeds: the segments last different times' },
      { value: (v1 + v3) / 2, trap: 'averaged the two moving speeds, ignoring the stationary time' },
    ], [
      { value: s2 / (t1 + t3), trap: 'left the stationary time out of the total time' },
      { value: v3, trap: 'quoted the final-segment speed' },
      { value: v1, trap: 'quoted the first-segment speed' },
      { value: (s2 - s1) / T, trap: 'counted only the final segment over the whole time' },
      { value: s1 / T, trap: 'counted only the first segment over the whole time' },
      { value: v1 + v3, trap: 'added the two segment speeds' },
      { value: s1 / (t1 + t2), trap: 'averaged over the first two segments only' },
    ]),
    `Average speed is total distance ÷ total time $= \\frac{${s2}}{${T}} = ${num(avg)}$ m s$^{-1}$.`,
    'Average speed is total distance over total time, including the time spent stationary; never average the gradients.',
    ['graphs', 's-t', 'average speed'], { kind: 'st', segs, ask: 'average', seg: -1 });
  }
  return finish(`${graph} Find the speed during the final ${q(t3, U.t)}.`, v3, U.v, physOptions(rng, v3, U.v, [
    { value: s2 / t3, trap: 'used the final displacement instead of the change in displacement in that segment' },
    { value: v1, trap: 'found the speed in the first segment' },
  ], [
    { value: s2 / T, trap: 'found the average speed for the whole journey instead' },
    { value: (s2 - s1) / T, trap: 'divided the change in displacement by the total time' },
    { value: (s2 - s1) / (t2 + t3), trap: 'included the stationary time in the final segment' },
    { value: v1 + v3, trap: 'added the speeds of the two moving segments' },
    { value: (s2 - s1) / t1, trap: 'divided by the time of the first segment' },
    { value: s1 / t3, trap: 'used the displacement of the first segment over the final time' },
    { value: (s2 - s1) / t2, trap: 'divided by the stationary time' },
    { value: (s2 - s1) / (t1 + t3), trap: 'used the two moving times together' },
  ]),
  `Gradient of the final segment: $\\frac{${s2} - ${s1}}{${t3}} = \\frac{${s2 - s1}}{${t3}} = ${v3}$ m s$^{-1}$.`,
  'Speed in a segment is the gradient of that segment: change in displacement over the time of that segment only.',
  ['graphs', 's-t', 'gradient', 'segment'], { kind: 'st', segs, ask: 'speed', seg: 2 });
}

// ------------------------------------------------------------------------------------------ level 4

function trapezium(rng: RNG, askAvg: boolean): Generated | null {
  const v = rng.pick([6, 8, 10, 12, 15, 16, 20, 24, 30]);
  const t1 = rng.pick([2, 4, 5, 6, 8, 10]);
  const t2 = rng.pick([5, 6, 8, 10, 12, 15, 20]);
  const t3 = rng.pick([2, 4, 5, 6, 8, 10].filter((x) => x !== t1));
  const s1 = 0.5 * v * t1, s2 = v * t2, s3 = 0.5 * v * t3;
  const total = s1 + s2 + s3;
  const T = t1 + t2 + t3;
  const avg = total / T;
  if (!Number.isInteger(total) || total > 1500) return null;
  if (askAvg && !Number.isInteger(avg * 2)) return null; // redraw until the average is a clean number
  const segs: Seg[] = [[t1, 0, v], [t2, v, v], [t3, v, 0]];
  const who = rng.pick(MOVER);
  const graph = `${cap(who)} starts from rest and comes to rest again. Its velocity–time graph is a trapezium: ${describeVT(segs).replace(/^For/, 'for')}`;
  if (askAvg) {
    return finish(`${graph} Find the average speed for the whole journey.`, avg, U.v, physOptions(rng, avg, U.v, [
      { value: v, trap: 'quoted the cruising speed' },
      { value: (2 * v) / 3, trap: 'averaged the three stage averages (v/2, v, v/2) without weighting by time' },
      { value: v / 2, trap: 'used (0 + v)/2 as if the whole journey were one uniform acceleration' },
    ], [
      { value: total / t2, trap: 'divided by the cruising time only' },
      { value: total / (t1 + t3), trap: 'left the cruising time out of the total time' },
      { value: 0.75 * v, trap: 'averaged the accelerating-stage average (v/2) with the cruising speed' },
      { value: s2 / T, trap: 'counted only the cruising distance over the whole time' },
      { value: (s1 + s3) / T, trap: 'counted only the accelerating and decelerating stages' },
      { value: (v * t1) / T, trap: 'used the enclosing rectangle of the first stage only' },
    ]),
    `Area: $\\tfrac{1}{2} \\times ${t1} \\times ${v} + ${v} \\times ${t2} + \\tfrac{1}{2} \\times ${t3} \\times ${v} = ${s1} + ${s2} + ${s3} = ${total}$ m in $${T}$ s, so the average speed is $\\frac{${total}}{${T}} = ${num(avg)}$ m s$^{-1}$.`,
    'Average speed is total area (distance) over total time; the stage speeds cannot simply be averaged because the stages last different times.',
    ['graphs', 'v-t', 'trapezium', 'average speed'], { kind: 'vt', segs, ask: 'average' });
  }
  return finish(`${graph} Find the total distance travelled.`, total, U.s, physOptions(rng, total, U.s, [
    { value: v * T, trap: 'used the enclosing rectangle v × total time (forgot the ½ on both triangles)' },
    { value: 0.5 * v * T, trap: 'treated the whole area as one triangle' },
  ], [
    { value: s1 + s2, trap: 'forgot the decelerating stage' },
    { value: s2, trap: 'counted only the cruising stage' },
    { value: v * (t1 + t2) + s3, trap: 'forgot the ½ on the accelerating triangle only' },
    { value: s1 + s2 + v * t3, trap: 'forgot the ½ on the decelerating triangle only' },
    { value: total + s1 + s3, trap: 'counted both triangles twice' },
    { value: total + s2, trap: 'counted the constant-velocity stage twice' },
  ]),
  `Trapezium area: $\\tfrac{1}{2} \\times ${t1} \\times ${v} + ${v} \\times ${t2} + \\tfrac{1}{2} \\times ${t3} \\times ${v} = ${s1} + ${s2} + ${s3} = ${total}$ m. (Equivalently $\\tfrac{1}{2}(${t2} + ${T}) \\times ${v}$.)`,
  'Add the two triangles and the rectangle (or use ½(a + b)h for the trapezium); each triangle carries a ½.',
  ['graphs', 'v-t', 'trapezium', 'area'], { kind: 'vt', segs, ask: 'distance' });
}

// ------------------------------------------------------------------------------------------ level 5

/** (v1, v2, t2): velocity falls uniformly from +v1 to −v2 over t2, crossing zero after τ = t2·v1/(v1 + v2) (chosen integer). */
const REVERSALS: [number, number, number][] = [];
for (const v1 of [3, 4, 5, 6, 8, 9, 10, 12, 15]) {
  for (const v2 of [3, 4, 5, 6, 8, 10, 12]) {
    for (const t2 of [2, 3, 4, 5, 6]) {
      const tau = (t2 * v1) / (v1 + v2);
      if (Number.isInteger(tau) && tau > 0 && tau < t2) REVERSALS.push([v1, v2, t2]);
    }
  }
}

function reversal(rng: RNG): Generated | null {
  const [v1, v2, t2] = rng.pick(REVERSALS);
  const t1 = rng.pick([2, 3, 4, 5, 6, 8, 10]);
  const t3 = rng.pick([1, 2, 3, 4, 5, 6]);
  const tau = (t2 * v1) / (v1 + v2);
  const pos = 0.5 * v1 * tau;
  const neg = 0.5 * v2 * (t2 - tau);
  const forward = v1 * t1 + pos;
  const back = neg + v2 * t3;
  const disp = forward - back;
  const dist = forward + back;
  if (disp <= 0 || !Number.isInteger(disp) || !Number.isInteger(dist)) return null;
  const segs: Seg[] = [[t1, v1, v1], [t2, v1, -v2], [t3, -v2, -v2]];
  const who = rng.pick(['a particle moving along a straight line', 'a toy car on a straight track', 'a lift']);
  const graph = `The velocity–time graph for ${who} (velocities in one direction counted positive) is described as follows. ${describeVT(segs)}`;
  const askDisp = rng.bool(0.5);
  const solutionAreas = `Areas: $${v1} \\times ${t1} = ${v1 * t1}$ m, then a triangle above the axis $\\tfrac{1}{2} \\times ${tau} \\times ${v1} = ${num(pos)}$ m (the velocity reaches zero after ${tau} s of the ${t2} s), a triangle below the axis $\\tfrac{1}{2} \\times ${t2 - tau} \\times ${v2} = ${num(neg)}$ m, and $${v2} \\times ${t3} = ${v2 * t3}$ m below the axis.`;
  if (askDisp) {
    return finish(`${graph} Find the displacement from the starting point at the end of the motion.`, disp, U.s, physOptions(rng, disp, U.s, [
      { value: dist, trap: 'added all the areas: area below the axis is negative displacement' },
      { value: v1 * t1 - pos - neg - v2 * t3, trap: 'counted the whole middle segment as negative, including the part above the axis' },
    ], [
      { value: forward + neg - v2 * t3, trap: 'counted the triangle below the axis as positive' },
      { value: v1 * t1 - v2 * t3, trap: 'ignored the middle segment altogether' },
      { value: v1 * (t1 + t2) - v2 * t3, trap: 'treated the middle segment as forward motion at v1' },
      { value: v1 * t1 - v2 * t2 - v2 * t3, trap: 'treated the middle segment as backward motion at the final speed' },
      { value: forward, trap: 'stopped when the velocity became negative' },
      { value: forward - neg, trap: 'forgot the final constant-velocity segment' },
      { value: disp - 2 * neg, trap: 'subtracted the triangle below the axis twice' },
      { value: disp - pos, trap: 'left out the triangle above the axis in the middle segment' },
      { value: disp - v1 * t1 + v1 * t1 / 2, trap: 'halved the first rectangle' },
    ]),
    `${solutionAreas} Displacement $= ${v1 * t1} + ${num(pos)} - ${num(neg)} - ${v2 * t3} = ${disp}$ m.`,
    'Displacement is the signed area: regions below the time axis count negative; distance travelled adds them all as positive.',
    ['graphs', 'v-t', 'negative velocity', 'displacement'], { kind: 'vt', segs, ask: 'displacement' });
  }
  return finish(`${graph} Find the total distance travelled.`, dist, U.s, physOptions(rng, dist, U.s, [
    { value: disp, trap: 'found the displacement (signed area) instead of the distance travelled' },
    { value: v1 * (t1 + t2) + v2 * t3, trap: 'treated the middle segment as motion at v1 throughout' },
  ], [
    { value: forward + v2 * t3, trap: 'forgot the triangle below the axis' },
    { value: v1 * t1 + v2 * t3, trap: 'ignored the middle segment altogether' },
    { value: forward - neg + v2 * t3, trap: 'subtracted one region below the axis and added the other' },
    { value: forward, trap: 'stopped when the velocity became negative' },
    { value: dist + neg, trap: 'counted the triangle below the axis twice' },
    { value: dist + pos, trap: 'counted the triangle above the axis twice' },
    { value: v1 * (t1 + t2) + v2 * (t2 + t3), trap: 'used the full speed of each end of the middle segment for the whole of it' },
  ]),
  `${solutionAreas} Distance travelled adds every area as positive: $${v1 * t1} + ${num(pos)} + ${num(neg)} + ${v2 * t3} = ${dist}$ m.`,
  'Distance travelled is the total unsigned area; displacement subtracts the area below the axis.',
  ['graphs', 'v-t', 'negative velocity', 'distance'], { kind: 'vt', segs, ask: 'distance' });
}

function accelerationGraph(rng: RNG): Generated | null {
  const a1 = rng.pick([1, 2, 3, 4, 5, 6]);
  const t1 = rng.pick([2, 3, 4, 5, 6, 8, 10]);
  const t2 = rng.pick([2, 4, 5, 6, 8, 10]);
  const u = rng.pick([0, 0, 2, 3, 4, 5, 6, 8, 10]);
  const riseFirst = rng.bool(0.5); // rises from 0 to a1 over t1 then constant, or constant then falls to 0
  const areaRect = a1 * (riseFirst ? t2 : t1);
  const areaTri = 0.5 * a1 * (riseFirst ? t1 : t2);
  const dv = areaRect + areaTri;
  const v = u + dv;
  if (!Number.isInteger(dv) || v > 80) return null;
  const segs: Seg[] = riseFirst ? [[t1, 0, a1], [t2, a1, a1]] : [[t1, a1, a1], [t2, a1, 0]];
  const who = rng.pick(['a car', 'a train', 'a particle moving in a straight line', 'a rocket sled']);
  const graph = riseFirst
    ? `The acceleration–time graph for ${who} shows the acceleration rising uniformly from $0$ to ${q(a1, U.a)} over the first ${q(t1, U.t)}, then staying constant at ${q(a1, U.a)} for a further ${q(t2, U.t)}.`
    : `The acceleration–time graph for ${who} shows the acceleration constant at ${q(a1, U.a)} for the first ${q(t1, U.t)}, then falling uniformly to $0$ over the next ${q(t2, U.t)}.`;
  const start = u === 0 ? 'starts from rest' : `has an initial velocity of ${q(u, U.v)}`;
  const stem = `${graph} It ${start}. Find its velocity at the end of the ${q(t1 + t2, U.t)}.`;
  const T = t1 + t2;
  return finish(stem, v, U.v, physOptions(rng, v, U.v, [
    { value: u + a1 * T, trap: 'used the enclosing rectangle a × total time (forgot the ½ on the triangle)' },
    u > 0 ? { value: dv, trap: 'forgot to add the initial velocity: the area gives the change in velocity' } : { value: 0.5 * a1 * T, trap: 'treated the whole area as one triangle' },
  ], [
    { value: u + 0.5 * a1 * T, trap: 'treated the whole area as one triangle' },
    { value: u + areaRect, trap: 'ignored the sloping part of the graph' },
    { value: u + areaTri, trap: 'ignored the constant part of the graph' },
    { value: u + a1, trap: 'added the acceleration as if it were a velocity' },
    { value: v + areaTri, trap: 'counted the sloping part of the graph twice' },
    { value: u + a1 * T + areaTri, trap: 'used the enclosing rectangle and added the triangle as well' },
    { value: u > 0 ? 2 * u + dv : null, trap: 'added the initial velocity twice' },
  ]),
  `Change in velocity = area under the a–t graph $= ${riseFirst ? `\\tfrac{1}{2} \\times ${t1} \\times ${a1} + ${a1} \\times ${t2}` : `${a1} \\times ${t1} + \\tfrac{1}{2} \\times ${t2} \\times ${a1}`} = ${dv}$ m s$^{-1}$, so $v = ${u} + ${dv} = ${v}$ m s$^{-1}$.`,
  'Area under an acceleration–time graph is the change in velocity (triangle gets the ½); add the initial velocity to get the final velocity.',
  ['graphs', 'a-t', 'area', 'velocity'], { kind: 'at', segs, ask: 'final-velocity', u });
}

// ------------------------------------------------------------------------------------------ verification

/** Value of a piecewise-linear graph at time t. */
function evalPL(segs: Seg[], t: number): number {
  let t0 = 0;
  for (const [dur, y0, y1] of segs) {
    if (t <= t0 + dur) return y0 + ((y1 - y0) * (t - t0)) / dur;
    t0 += dur;
  }
  const [dur, , y1] = segs[segs.length - 1];
  return dur >= 0 ? y1 : 0;
}

/** Midpoint-rule integral of f (or |f|) over [0, T] with fine steps. */
function integrate(f: (t: number) => number, T: number, absolute: boolean, n = 200000): number {
  const h = T / n;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const y = f((i + 0.5) * h);
    sum += absolute ? Math.abs(y) : y;
  }
  return sum * h;
}

export default defineTemplate({
  id: 'phy.kinematics.graphs',
  module: 'PHY',
  topic: 'kinematics',
  title: 'Motion graphs described in words',
  levels: {
    1: 'constant velocity → distance travelled (all of it, or the first part only); straight-line s–t graph → speed',
    2: 'velocity rises uniformly u → v in t: distance (triangle or trapezium) or acceleration (gradient)',
    3: 'accelerate then cruise → total distance; three-segment s–t graph → speed in a segment / average speed',
    4: 'trapezium (accelerate, cruise, decelerate) → total distance or average speed',
    5: 'velocity goes negative: displacement vs distance; a–t graph → change in velocity and final velocity',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return pickVariant(rng, [constantVelocity, constantVelocity, straightST]);
        case 2: return pickVariant(rng, [uniformRise]);
        case 3: return pickVariant(rng, [accelThenCruise, accelThenCruise, (r) => threeSegmentST(r, false), (r) => threeSegmentST(r, false), (r) => threeSegmentST(r, true)]);
        case 4: return pickVariant(rng, [(r) => trapezium(r, false), (r) => trapezium(r, false), (r) => trapezium(r, false), (r) => trapezium(r, true)]);
        default: return pickVariant(rng, [reversal, accelerationGraph]);
      }
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const ans = q.answer.value.toNumber();
    const p = q.params as { kind: 'vt' | 'st' | 'at'; segs: Seg[]; ask: string; seg?: number; u?: number };
    const T = p.segs.reduce((acc, s) => acc + s[0], 0);
    const f = (t: number) => evalPL(p.segs, t);
    const close = (x: number, y: number) => Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(x), Math.abs(y));
    if (p.kind === 'vt') {
      if (p.ask === 'distance') return close(ans, integrate(f, T, true));
      if (p.ask === 'displacement') return close(ans, integrate(f, T, false));
      if (p.ask === 'average') return close(ans, integrate(f, T, true) / T);
      if (p.ask === 'acceleration') {
        // gradient by a symmetric finite difference at the middle of the asked segment
        const i = p.seg ?? 0;
        const start = p.segs.slice(0, i).reduce((acc, s) => acc + s[0], 0);
        const mid = start + p.segs[i][0] / 2;
        const d = 1e-4;
        return close(ans, (f(mid + d) - f(mid - d)) / (2 * d));
      }
      return false;
    }
    if (p.kind === 'st') {
      if (p.ask === 'average') {
        // total path length from the graph values at the segment boundaries, over the total time
        let dist = 0, t0 = 0;
        for (const [dur] of p.segs) { dist += Math.abs(f(t0 + dur) - f(t0)); t0 += dur; }
        return close(ans, dist / T);
      }
      const i = p.seg ?? 0;
      const start = p.segs.slice(0, i).reduce((acc, s) => acc + s[0], 0);
      const mid = start + p.segs[i][0] / 2;
      const d = 1e-4;
      return close(ans, (f(mid + d) - f(mid - d)) / (2 * d));
    }
    // a–t: integrate the acceleration and add the initial velocity
    return close(ans, (p.u ?? 0) + integrate(f, T, false));
  },
});
