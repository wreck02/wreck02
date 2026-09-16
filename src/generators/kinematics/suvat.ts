import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { Exact } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { num } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * SUVAT with clean values (straight-line motion, constant acceleration).
 * Level 1: v = u + at (u = 0 or small); s = (u + v)t/2 with small integers
 * Level 2: s = ut + ½at² with a = 2, 4, 10 (a = 10 is a ball thrown downwards, g = 10);
 *          v² = u² + 2as giving perfect squares
 * Level 3: find a or t from two given quantities; braking distance from v² = 2as
 * Level 4: deceleration to rest: stopping time or deceleration from u and s; find u given s, t, a
 * Level 5: two-stage motion (accelerate then constant speed: total distance / average speed);
 *          t from s = ½at² or a from s = ut + ½at² giving a clean fraction
 */

const DEC = { format: 'decimal' as const };
const U = {
  v: '\\text{m s}^{-1}',
  a: '\\text{m s}^{-2}',
  s: '\\text{m}',
  t: '\\text{s}',
};

/** Exact from a float that is really a short decimal (kills 60.00000000000001). */
const X = (x: number): Exact => Exact.num(Number(x.toFixed(9)));
/** Quantity with its unit for a stem: "$12\ \text{m s}^{-1}$". */
const q = (x: number, unit: string): string => `$${num(x)}\\ ${unit}$`;

type Cand = { value: number | null; trap: string };

/** Keep only distractors that are finite, positive, clean and within a sane factor of the answer. */
function cleanOnly(ds: Cand[], answer: number): Distractor[] {
  const out: Distractor[] = [];
  for (const d of ds) {
    if (d.value === null || !Number.isFinite(d.value) || d.value <= 0) continue;
    if (d.value > 200 * answer || d.value < answer / 200) continue;
    const v = X(d.value);
    if (!isCleanExact(v).ok) continue;
    out.push({ value: v, trap: d.trap });
  }
  return out;
}

/**
 * One headline trap always goes in; the remaining musts are preferred within their own side of the
 * answer, and the rest are chosen towards a randomly drawn number of options *below* it. Without
 * that, a variant whose named mistakes all overshoot (forgot the ½, forgot the square root, …) puts
 * the correct option at the same rank in every instance, and "pick the second smallest" answers it
 * with no arithmetic. Candidates that would stretch the list beyond `maxSpread` are skipped.
 */
function ranked(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], count = 4, maxSpread = 50): Distractor[] {
  const a = answer.toNumber();
  const seen: Exact[] = [answer];
  const mags: number[] = Math.abs(a) > 0 ? [Math.abs(a)] : [];
  const out: Distractor[] = [];
  const take = (d: Distractor) => {
    if (out.length >= count || seen.some((s) => s.equals(d.value))) return;
    const x = Math.abs(d.value.toNumber());
    if (x > 0 && mags.length > 0 && Math.max(...mags, x) / Math.min(...mags, x) > maxSpread) return;
    seen.push(d.value);
    if (x > 0) mags.push(x);
    out.push(d);
  };
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

/** Positive padding that still looks like a physical quantity, should the template's own distractors coincide. */
const fallback = (answer: number): Exact[] =>
  [2, 0.5, 3, 4, 1.5, 0.25, 10, 0.1].map((k) => X(answer * k)).filter((v) => isCleanExact(v).ok);

function physOptions(rng: RNG, answer: number, unit: string, must: Cand[], extra: Cand[]) {
  const ans = X(answer);
  return buildOptions(rng, ans, ranked(rng, ans, cleanOnly(must, answer), cleanOnly(extra, answer)), { ...DEC, unit, fallback: fallback(answer) });
}

function finish(stem: string, answer: number, unit: string, options: ReturnType<typeof buildOptions>, solution: string, trap: string, tags: string[], params: Record<string, unknown>): Generated {
  return { stem, answer: { kind: 'exact', value: X(answer), ...DEC, unit }, options, solution, trap, tags, params, typedAllowed: true };
}

const rootOrNull = (x: number): number | null => {
  if (x < 0) return null;
  const r = Math.sqrt(x);
  return Math.abs(r - Number(r.toFixed(6))) < 1e-9 ? Number(r.toFixed(6)) : null; // only clean roots
};

const VEHICLE = ['A car', 'A train', 'A cyclist', 'A motorbike', 'A lorry', 'A tram'];
const fromRest = (u: number) => (u === 0 ? 'from rest' : `from a speed of ${q(u, U.v)}`);

/** Pick a sub-variant first, then retry its parameters, so rejection rates do not skew the mix. */
function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

// ------------------------------------------------------------------------------------------ level 1

function vFromUAT(rng: RNG): Generated | null {
  const u = rng.pick([0, 0, 0, 2, 3, 4, 5, 6]);
  const a = rng.pick([1, 2, 3, 4, 5]);
  const t = rng.pick([2, 3, 4, 5, 6, 8, 10]);
  const v = u + a * t;
  if (v > 60) return null;
  const who = rng.pick(VEHICLE);
  const stem = `${who} accelerates uniformly ${fromRest(u)} at ${q(a, U.a)} for ${q(t, U.t)}. Find its velocity at the end of this time.`;
  return finish(stem, v, U.v, physOptions(rng, v, U.v, [
    u > 0 ? { value: a * t, trap: 'forgot to add the initial velocity u' } : { value: 0.5 * a * t * t, trap: 'found the distance ½at² instead of the velocity' },
    { value: (u + v) / 2, trap: 'found the average velocity (u + v)/2 instead of the final velocity' },
  ], [
    { value: u + a, trap: 'added a instead of at' },
    { value: u + t, trap: 'added t instead of at' },
    { value: u + a * t * t, trap: 'squared the time: v = u + at, not u + at²' },
    { value: u * t + 0.5 * a * t * t, trap: 'used the distance formula s = ut + ½at²' },
  ]),
  `$v = u + at = ${u} + ${a} \\times ${t} = ${v}$ m s$^{-1}$.`,
  'v = u + at: multiply a by t and add u; do not confuse with the distance ½at².',
  ['suvat', 'velocity'], { ask: 'v-uat', u, a, t });
}

function sFromUVT(rng: RNG): Generated | null {
  const u = rng.pick([0, 0, 2, 4, 5, 6, 8, 10]);
  const v = u + rng.pick([2, 4, 6, 8, 10, 12]);
  const t = rng.pick([2, 3, 4, 5, 6, 8, 10]);
  if (((u + v) * t) % 2 !== 0) return null;
  const s = ((u + v) * t) / 2;
  const who = rng.pick(VEHICLE);
  const stem = u === 0
    ? `${who} starts from rest and its velocity increases uniformly to ${q(v, U.v)} in ${q(t, U.t)}. How far does it travel in this time?`
    : `${who}'s velocity increases uniformly from ${q(u, U.v)} to ${q(v, U.v)} in ${q(t, U.t)}. How far does it travel in this time?`;
  return finish(stem, s, U.s, physOptions(rng, s, U.s, [
    { value: (u + v) * t, trap: 'forgot the ½: distance is the average velocity × time' },
    { value: v * t, trap: 'used s = vt with the final velocity instead of the average velocity' },
  ], [
    { value: ((v - u) * t) / 2, trap: 'used (v − u) instead of (u + v)' },
    { value: u * t, trap: 'used the initial velocity only' },
    { value: (v - u) * t, trap: 'used the change in velocity × time' },
    // these three survive u = 0, where (u + v)t, vt and (v − u)t are all the same number
    { value: (u + v) / 2, trap: 'forgot to multiply by the time: ½(u + v) is the average velocity' },
    { value: (u + v) / (2 * t), trap: 'divided by the time instead of multiplying' },
    { value: 0.5 * v * t * t, trap: 'used ½at² with the velocity in place of the acceleration' },
  ]),
  `$s = \\frac{(u + v)}{2}\\,t = \\frac{${u} + ${v}}{2} \\times ${t} = ${s}$ m.`,
  'Distance = average velocity × time = ½(u + v)t; using vt or forgetting the ½ over-counts.',
  ['suvat', 'distance', 'average velocity'], { ask: 's-uvt', u, v, t });
}

// ------------------------------------------------------------------------------------------ level 2

function sFromUAT(rng: RNG): Generated | null {
  const a = rng.pick([2, 4, 10]);
  const u = rng.pick([0, 0, 2, 3, 5, 8, 10]);
  const t = rng.pick([2, 3, 4, 5, 6]);
  const s = u * t + 0.5 * a * t * t;
  if (s > 400) return null;
  let stem: string;
  if (a === 10) {
    stem = u === 0
      ? `A ball is dropped from rest from the top of a tall building. Taking $g = 10\\ ${U.a}$ and ignoring air resistance, how far has it fallen after ${q(t, U.t)}?`
      : `A ball is thrown vertically downwards from the top of a tall building with speed ${q(u, U.v)}. Taking $g = 10\\ ${U.a}$ and ignoring air resistance, how far has it fallen after ${q(t, U.t)}?`;
  } else {
    stem = `${rng.pick(VEHICLE)} accelerates uniformly ${fromRest(u)} at ${q(a, U.a)}. How far does it travel in the first ${q(t, U.t)}?`;
  }
  return finish(stem, s, U.s, physOptions(rng, s, U.s, [
    { value: u * t + a * t * t, trap: 'forgot the ½ in ½at²' },
    { value: u * t + 0.5 * a * t, trap: 'forgot to square the time in ½at²' },
  ], [
    u > 0 ? { value: 0.5 * a * t * t, trap: 'ignored the initial velocity term ut' } : { value: a * t, trap: 'found the velocity at instead of the distance' },
    { value: u * t, trap: 'ignored the acceleration' },
    { value: (u + a * t) * t, trap: 'used final velocity × time' },
    { value: u * t * t + 0.5 * a * t * t, trap: 'squared the time in the ut term as well' },
    { value: u * t + 0.5 * a * t * t * t, trap: 'cubed the time in the ½at² term' },
    a === 10 ? { value: u * t + 4.9 * t * t, trap: 'used g = 9.8 m s⁻² instead of the stated 10 m s⁻²' } : { value: u + 0.5 * a * t * t, trap: 'added u instead of ut' },
  ]),
  `$s = ut + \\tfrac{1}{2}at^2 = ${u} \\times ${t} + \\tfrac{1}{2} \\times ${a} \\times ${t}^2 = ${u * t} + ${0.5 * a * t * t} = ${s}$ m.`,
  'In s = ut + ½at² both the ½ and the square matter; the ½at² term is the extra distance from accelerating.',
  ['suvat', 'distance'], { ask: 's-uat', u, a, t });
}

function vFromUAS(rng: RNG): Generated | null {
  const v = rng.pick([6, 8, 10, 12, 15, 16, 20, 25, 30]);
  // u > 0: with u = 0, a·s, u + a·s and 2as/v collapse onto one another (and onto v), leaving the
  // question with one real distractor and three unlabelled multiples. From rest is covered by v = u + at.
  const u = rng.pick([2, 3, 4, 5, 6, 8, 10, 12].filter((x) => x < v));
  const a = rng.pick([2, 4, 5, 10]);
  const twoAS = v * v - u * u;
  if (twoAS % (2 * a) !== 0) return null;
  const s = twoAS / (2 * a);
  if (s > 250 || s < 2) return null;
  const who = a === 10 ? 'A particle' : rng.pick(VEHICLE);
  const root2as = rootOrNull(2 * a * s);
  const stem = `${who} accelerates uniformly ${fromRest(u)} at ${q(a, U.a)} over a distance of ${q(s, U.s)}. Find its speed at the end of this distance.`;
  return finish(stem, v, U.v, physOptions(rng, v, U.v, [
    { value: u * u + 2 * a * s, trap: 'forgot to take the square root: this is v², not v' },
    { value: rootOrNull(u * u + a * s), trap: 'forgot the 2 in v² = u² + 2as' },
  ], [
    { value: root2as, trap: 'ignored the initial speed: forgot the u² term' },
    { value: root2as === null ? null : u + root2as, trap: 'added u to √(2as): speeds do not add like that' },
    { value: u + a * s, trap: 'used v = u + as (as if s were a time)' },
    { value: a * s, trap: 'multiplied a by s and forgot the 2 and the square root' },
    { value: (u + v) / 2, trap: 'quoted the average speed ½(u + v) instead of the speed at the end' },
    { value: (u * u + 2 * a * s) / (2 * a), trap: 'divided v² by 2a (that gives the distance again)' },
  ]),
  `$v^2 = u^2 + 2as = ${u * u} + 2 \\times ${a} \\times ${s} = ${v * v}$, so $v = ${v}$ m s$^{-1}$.`,
  'v² = u² + 2as gives v squared: finish with a square root, and keep the factor 2.',
  ['suvat', 'v-squared'], { ask: 'v-uas', u, a, s });
}

// ------------------------------------------------------------------------------------------ level 3

function aOrTFromUV(rng: RNG, ask: 'a' | 't'): Generated | null {
  const u = rng.pick([0, 0, 2, 4, 5, 6, 8, 10, 12]);
  const a = rng.pick([0.5, 1, 1.5, 2, 2.5, 3, 4, 5]);
  const t = rng.pick([2, 4, 5, 6, 8, 10]);
  const v = u + a * t;
  if (!Number.isInteger(v) || v > 60) return null;
  const who = rng.pick(VEHICLE);
  const change = u === 0 ? `starts from rest and reaches a speed of ${q(v, U.v)}` : `speeds up uniformly from ${q(u, U.v)} to ${q(v, U.v)}`;
  if (ask === 'a') {
    const stem = `${who} ${change} in ${q(t, U.t)}. Find its acceleration.`;
    return finish(stem, a, U.a, physOptions(rng, a, U.a, [
      // with u = 0 the "added the velocities" slip is the answer itself, so the headline trap changes
      u > 0 ? { value: (v + u) / t, trap: 'added the velocities instead of subtracting: a = (v − u)/t' } : { value: (v - u) * t, trap: 'multiplied by t instead of dividing' },
      u > 0 ? { value: v / t, trap: 'ignored the initial velocity' } : { value: t / v, trap: 'inverted: divided t by the change in velocity' },
    ], [
      { value: (v - u) * t, trap: 'multiplied by t instead of dividing' },
      { value: t / (v - u), trap: 'inverted: divided t by the change in velocity' },
      { value: (v - u) / (2 * t), trap: 'used the average of the change in velocity' },
      { value: (v - u) / (t * t), trap: 'divided by the time twice' },
      { value: (v + u) / (2 * t), trap: 'used the average velocity ½(u + v) in place of the change' },
      { value: 0.5 * (u + v) * t, trap: 'found the distance ½(u + v)t instead of the acceleration' },
    ]),
    `$a = \\frac{v - u}{t} = \\frac{${v} - ${u}}{${t}} = ${num(a)}$ m s$^{-2}$.`,
    'Acceleration is the change in velocity divided by the time: (v − u)/t, not (v + u)/t or v/t.',
    ['suvat', 'acceleration'], { ask: 'a-uvt', u, v, t });
  }
  const stem = `${who} ${change} with a uniform acceleration of ${q(a, U.a)}. How long does this take?`;
  return finish(stem, t, U.t, physOptions(rng, t, U.t, [
    u > 0 ? { value: v / a, trap: 'ignored the initial velocity: t = (v − u)/a' } : { value: (v - u) * a, trap: 'multiplied by a instead of dividing' },
    u > 0 ? { value: (v + u) / a, trap: 'added the velocities instead of subtracting' } : { value: a / v, trap: 'inverted: divided a by the change in velocity' },
  ], [
    { value: (v - u) * a, trap: 'multiplied by a instead of dividing' },
    { value: (v * v - u * u) / (2 * a), trap: 'found the distance (v² − u²)/2a instead of the time' },
    { value: (v - u) / (2 * a), trap: 'used the average of the change in velocity' },
    { value: (v - u) / (a * a), trap: 'divided by the acceleration twice' },
    { value: a / (v - u), trap: 'inverted: divided a by the change in velocity' },
    { value: (v + u) / (2 * a), trap: 'used the average velocity ½(u + v) in place of the change' },
  ]),
  `$v = u + at$, so $t = \\frac{v - u}{a} = \\frac{${v} - ${u}}{${num(a)}} = ${num(t)}$ s.`,
  'Rearrange v = u + at: t = (v − u)/a; subtract u before dividing.',
  ['suvat', 'time'], { ask: 't-uva', u, v, a });
}

function brakingDistance(rng: RNG): Generated | null {
  const u = rng.pick([10, 12, 15, 16, 20, 24, 30, 40]);
  const a = rng.pick([2, 2.5, 3, 4, 5, 6, 8, 10]);
  const s = (u * u) / (2 * a);
  if (!Number.isInteger(s * 2) || s > 250) return null;
  const stem = `${rng.pick(['A car', 'A lorry', 'A train', 'A motorbike'])} travelling at ${q(u, U.v)} brakes with a uniform deceleration of ${q(a, U.a)}. Find the distance it travels before coming to rest.`;
  return finish(stem, s, U.s, physOptions(rng, s, U.s, [
    { value: (u * u) / a, trap: 'forgot the 2 in v² = u² + 2as (used s = u²/a)' },
    { value: u / (2 * a), trap: 'used u instead of u²' },
  ], [
    { value: u / a, trap: 'found the stopping time u/a instead of the distance' },
    { value: (u * u) / (4 * a), trap: 'halved twice: average speed and then the ½ again' },
    { value: (u * u) / (2 * a) + u, trap: 'added u to the distance' },
  ]),
  `To rest: $0 = u^2 - 2as$, so $s = \\frac{u^2}{2a} = \\frac{${u * u}}{${num(2 * a)}} = ${num(s)}$ m.`,
  'Braking distance is u²/(2a): square the speed and keep the 2 (equivalently average speed u/2 × time u/a).',
  ['suvat', 'braking', 'v-squared'], { ask: 'brake-s', u, a });
}

// ------------------------------------------------------------------------------------------ level 4

function restFromUS(rng: RNG, ask: 't' | 'a'): Generated | null {
  const u = rng.pick([8, 10, 12, 15, 16, 20, 24, 25, 30, 40]);
  const t = rng.pick([2, 4, 5, 6, 8, 10, 12]);
  const s = (u * t) / 2;
  const a = u / t;
  if (!Number.isInteger(s) || !Number.isInteger(a * 2) || s > 300 || a > 10) return null;
  const who = rng.pick(['A car', 'A train', 'A cyclist', 'A tram', 'A skier']);
  const given = `${who} travelling at ${q(u, U.v)} decelerates uniformly to rest over a distance of ${q(s, U.s)}.`;
  if (ask === 't') {
    return finish(`${given} Find the time taken to stop.`, t, U.t, physOptions(rng, t, U.t, [
      { value: s / u, trap: 'used s = ut with the initial speed: the average speed is only u/2' },
      { value: (u * u) / (2 * s), trap: 'found the deceleration u²/(2s) instead of the time' },
    ], [
      { value: 4 * s / u, trap: 'divided by the average speed twice: t = 2s/u, not 4s/u' },
      { value: u / s, trap: 'inverted the fraction: t = 2s/u' },
      { value: s / (2 * u), trap: 'halved s/u instead of doubling it' },
      { value: (2 * s) / (u * u), trap: 'divided by u² instead of u' },
      { value: u / (2 * s), trap: 'inverted the fraction and kept the 2 on the bottom' },
    ]),
    `Average speed is $\\frac{u}{2} = ${num(u / 2)}$ m s$^{-1}$, so $t = \\frac{s}{u/2} = \\frac{2 \\times ${s}}{${u}} = ${t}$ s.`,
    'Coming to rest uniformly, the average speed is u/2, so t = 2s/u; s/u is half the true time.',
    ['suvat', 'deceleration', 'time'], { ask: 'rest-t', u, s });
  }
  return finish(`${given} Find the deceleration.`, a, U.a, physOptions(rng, a, U.a, [
    { value: (u * u) / s, trap: 'forgot the 2: a = u²/(2s)' },
    { value: u / s, trap: 'used u instead of u² in v² = u² + 2as' },
  ], [
    { value: u / (2 * s), trap: 'used u instead of u² and kept the 2' },
    { value: (2 * s) / u, trap: 'found the stopping time 2s/u instead of the deceleration' },
    { value: (u * u) / (4 * s), trap: 'divided by 4s instead of 2s' },
  ]),
  `$0 = u^2 - 2as$, so $a = \\frac{u^2}{2s} = \\frac{${u * u}}{${2 * s}} = ${num(a)}$ m s$^{-2}$.`,
  'From v² = u² + 2as with v = 0: deceleration = u²/(2s), with u squared and the factor 2 kept.',
  ['suvat', 'deceleration'], { ask: 'rest-a', u, s });
}

function uFromSTA(rng: RNG): Generated | null {
  const decel = rng.bool(0.4);
  const u = rng.pick([2, 3, 4, 5, 6, 8, 10, 12, 15, 20]);
  const a = rng.pick([1, 2, 3, 4, 5]) * (decel ? -1 : 1);
  const t = rng.pick([2, 4, 5, 6, 8, 10]);
  const v = u + a * t;
  if (v < 0 || v > 60) return null; // a decelerating body must not reverse
  const s = u * t + 0.5 * a * t * t;
  if (!Number.isInteger(s) || s <= 0 || s > 400) return null;
  const who = rng.pick(['A particle', 'A car', 'A train', 'A cyclist']);
  const stem = decel
    ? `${who} moving in a straight line decelerates uniformly at ${q(-a, U.a)}. It travels ${q(s, U.s)} in ${q(t, U.t)}. Find its initial speed.`
    : `${who} moving in a straight line with a constant acceleration of ${q(a, U.a)} travels ${q(s, U.s)} in ${q(t, U.t)}. Find its initial velocity.`;
  const mag = Math.abs(a);
  return finish(stem, u, U.v, physOptions(rng, u, U.v, [
    { value: s / t, trap: 'ignored the acceleration: s/t is the average velocity, not the initial velocity' },
    { value: s / t + 0.5 * a * t, trap: decel ? 'sign of the deceleration: for slowing down, u = s/t + ½at with a positive' : 'sign error: u = s/t − ½at' },
  ], [
    { value: s / t - a * t, trap: 'forgot the ½ in ½at²' },
    { value: s / t - 0.5 * a, trap: 'forgot the t in ½at' },
    { value: u + a * t, trap: 'found the final velocity, not the initial velocity' },
    { value: s / t - 0.5 * a * t * t, trap: 'subtracted ½at² instead of ½at' },
    { value: (2 * s) / t - 0.5 * a * t, trap: 'used 2s/t for the average velocity' },
  ]),
  `$s = ut + \\tfrac{1}{2}at^2$: $${s} = ${t}u ${a < 0 ? '-' : '+'} \\tfrac{1}{2} \\times ${mag} \\times ${t}^2 = ${t}u ${a < 0 ? '-' : '+'} ${0.5 * mag * t * t}$, so $u = \\frac{${s - 0.5 * a * t * t}}{${t}} = ${u}$ m s$^{-1}$.`,
  decel
    ? 'Take the deceleration as a negative a: s = ut − ½|a|t², so u = s/t + ½|a|t (larger than the average speed).'
    : 'The average velocity s/t equals u + ½at, so u = s/t − ½at; s/t alone ignores the acceleration.',
  ['suvat', 'initial velocity'], { ask: 'u-sta', s, t, a });
}

// ------------------------------------------------------------------------------------------ level 5

function twoStage(rng: RNG): Generated | null {
  const a = rng.pick([0.5, 1, 1.5, 2, 3, 4, 5]);
  const t1 = rng.pick([4, 5, 6, 8, 10]);
  const t2 = rng.pick([5, 10, 12, 15, 20, 30]);
  const v = a * t1;
  if (!Number.isInteger(v) || v > 40) return null;
  const s1 = 0.5 * a * t1 * t1;
  const s2 = v * t2;
  const total = s1 + s2;
  if (!Number.isInteger(total) || total > 1500) return null;
  const T = t1 + t2;
  const avg = total / T;
  const askAvg = rng.bool(0.4);
  if (askAvg && !Number.isInteger(avg * 2)) return null; // redraw rather than silently switching ask
  const who = rng.pick(['A car', 'A train', 'A cyclist', 'A tram', 'A runner']);
  const intro = `${who} starts from rest and accelerates uniformly at ${q(a, U.a)} for ${q(t1, U.t)}, then continues at the constant speed it has reached for a further ${q(t2, U.t)}.`;
  // a·t₁² + s₂ and v·T are the same number (v = a t₁), so only one of them can ever be offered.
  const distTraps: Cand[] = [
    { value: v * T, trap: 'treated the whole journey as being at the final speed (that is also what forgetting the ½ in ½at₁² gives)' },
    { value: s1 + v * t2 + 0.5 * a * t2 * t2, trap: 'assumed it kept accelerating through the second stage' },
  ];
  const distExtra: Cand[] = [
    { value: s1 + 0.5 * s2, trap: 'halved the second stage too: the ½ only belongs to the accelerating stage' },
    { value: s1, trap: 'forgot the constant-speed stage' },
    { value: 0.5 * v * T, trap: 'used ½vt for the whole journey' },
    { value: s2, trap: 'forgot the accelerating stage' },
    { value: s1 + v * T, trap: 'counted the accelerating stage again inside the cruise' },
    { value: 0.5 * a * T * T, trap: 'used ½aT² for the whole journey' },
  ];
  if (askAvg) {
    return finish(`${intro} Find its average speed for the whole journey.`, avg, U.v, physOptions(rng, avg, U.v, [
      { value: v, trap: 'quoted the final (cruising) speed: the average is total distance ÷ total time' },
      { value: v / 2, trap: 'used ½v, the average of the accelerating stage only' },
    ], [
      { value: (a * t1 * t1 + s2) / T, trap: 'forgot the ½ in ½at² for the first stage' },
      { value: total / t2, trap: 'divided by the cruising time only' },
      { value: (v / 2 + v) / 2, trap: 'averaged the stage averages without weighting by time' },
      { value: total / t1, trap: 'divided by the accelerating time only' },
    ]),
    `Speed reached: $v = ${num(a)} \\times ${t1} = ${v}$ m s$^{-1}$. Distances: $\\tfrac{1}{2} \\times ${num(a)} \\times ${t1}^2 = ${num(s1)}$ m and $${v} \\times ${t2} = ${s2}$ m, total $${total}$ m in $${T}$ s, so the average speed is $\\frac{${total}}{${T}} = ${num(avg)}$ m s$^{-1}$.`,
    'Average speed is total distance over total time; it is neither the cruising speed nor a simple average of stage speeds.',
    ['suvat', 'two-stage', 'average speed'], { ask: 'two-stage-avg', a, t1, t2 });
  }
  return finish(`${intro} Find the total distance travelled.`, total, U.s, physOptions(rng, total, U.s, distTraps, distExtra),
    `Speed reached: $v = at = ${num(a)} \\times ${t1} = ${v}$ m s$^{-1}$. Stage 1: $\\tfrac{1}{2}at^2 = \\tfrac{1}{2} \\times ${num(a)} \\times ${t1}^2 = ${num(s1)}$ m. Stage 2: $${v} \\times ${t2} = ${s2}$ m. Total $${total}$ m.`,
    'Sketch the v–t graph: a triangle (½ × base × height) then a rectangle; only the triangle carries the ½.',
    ['suvat', 'two-stage', 'distance'], { ask: 'two-stage', a, t1, t2 });
}

function tFromS(rng: RNG): Generated | null {
  const a = rng.pick([2, 4, 5, 8, 10]);
  const t = rng.pick([1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6]);
  const s = 0.5 * a * t * t;
  if (!Number.isInteger(s * 4) || s > 200) return null;
  const who = rng.pick(['A particle', 'A car', 'A sprinter', 'A train']);
  const stem = `${who} starts from rest and moves in a straight line with a constant acceleration of ${q(a, U.a)}. Find the time taken to travel the first ${q(s, U.s)}.`;
  return finish(stem, t, U.t, physOptions(rng, t, U.t, [
    { value: (2 * s) / a, trap: 'forgot to take the square root: 2s/a is t², not t' },
    { value: rootOrNull(s / a), trap: 'forgot the 2: s = ½at² gives t² = 2s/a' },
  ], [
    { value: s / a, trap: 'used s = at (no ½, no square)' },
    { value: rootOrNull(s / (2 * a)), trap: 'put the ½ on the wrong side: t² = 2s/a, not s/(2a)' },
    { value: 2 * t, trap: 'doubled the time (that is the time to travel 4s)' },
    { value: rootOrNull(2 * s) === null ? null : rootOrNull(2 * s)! / a, trap: 'took the root before dividing by a' },
    { value: (2 * s) / (a * a), trap: 'divided by a twice and forgot the root' },
  ]),
  `$s = \\tfrac{1}{2}at^2$, so $t^2 = \\frac{2s}{a} = \\frac{${num(2 * s)}}{${a}} = ${num(t * t)}$ and $t = ${num(t)}$ s.`,
  'From rest, s = ½at² so t = √(2s/a): remember both the 2 and the square root.',
  ['suvat', 'time', 'rearrange'], { ask: 't-from-s', s, a });
}

function aFromSUT(rng: RNG): Generated | null {
  const a = rng.pick([0.25, 0.4, 0.5, 0.75, 0.8, 1.2, 1.5, 2.5]);
  const u = rng.pick([2, 3, 4, 5, 6, 8, 10, 12]);
  const t = rng.pick([4, 5, 6, 8, 10, 20]);
  const s = u * t + 0.5 * a * t * t;
  if (!Number.isInteger(s) || s > 500) return null;
  const who = rng.pick(['A particle', 'A car', 'A cyclist', 'A boat']);
  const stem = `${who} moving in a straight line at ${q(u, U.v)} begins to accelerate uniformly. In the next ${q(t, U.t)} it travels ${q(s, U.s)}. Find the acceleration.`;
  return finish(stem, a, U.a, physOptions(rng, a, U.a, [
    { value: (s - u * t) / (t * t), trap: 'forgot the 2: s − ut = ½at², so a = 2(s − ut)/t²' },
    { value: (2 * s) / (t * t), trap: 'ignored the initial velocity term ut' },
  ], [
    { value: (2 * (s - u * t)) / t, trap: 'forgot to square the time' },
    { value: s / t / t, trap: 'divided the distance by t twice with no ut and no 2' },
    { value: (s - u * t) / t, trap: 'divided the extra distance by t once only (no 2, no square)' },
    { value: (2 * s) / t - u, trap: 'found the final velocity 2s/t − u instead of the acceleration' },
    { value: (2 * (s - u * t)) / (t * t * t), trap: 'cubed the time' },
    { value: (2 * s - u * t) / (t * t), trap: 'doubled s before subtracting ut' },
  ]),
  `$s - ut = ${s} - ${u * t} = ${s - u * t}$ m is the extra distance $\\tfrac{1}{2}at^2$, so $a = \\frac{2 \\times ${s - u * t}}{${t}^2} = \\frac{${2 * (s - u * t)}}{${t * t}} = ${num(a)}$ m s$^{-2}$.`,
  'Subtract the ut part first, then a = 2(s − ut)/t²: keep the 2 and the square.',
  ['suvat', 'acceleration', 'rearrange'], { ask: 'a-from-sut', s, u, t });
}

export default defineTemplate({
  id: 'phy.kinematics.suvat',
  module: 'PHY',
  topic: 'kinematics',
  title: 'SUVAT with clean values',
  levels: {
    1: 'v = u + at with u = 0 or small; s = ½(u + v)t',
    2: 's = ut + ½at² with a = 2, 4, 10 (vertical throw uses g = 10); v² = u² + 2as with perfect squares',
    3: 'find a or t from u, v and one more quantity; braking distance u²/(2a)',
    4: 'deceleration to rest: stopping time or deceleration from u and s; u from s, t and a',
    5: 'two-stage motion (accelerate then cruise): total distance or average speed; t = √(2s/a) or a = 2(s − ut)/t² as a clean fraction',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return pickVariant(rng, [vFromUAT, sFromUVT]);
        case 2: return pickVariant(rng, [sFromUAT, vFromUAS]);
        case 3: return pickVariant(rng, [(r) => aOrTFromUV(r, 'a'), (r) => aOrTFromUV(r, 't'), brakingDistance]);
        case 4: return pickVariant(rng, [(r) => restFromUS(r, 't'), (r) => restFromUS(r, 'a'), uFromSTA]);
        default: return pickVariant(rng, [twoStage, tFromS, aFromSUT]);
      }
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const ans = q.answer.value.toNumber();
    const p = q.params as Record<string, number> & { ask: string };
    const close = (x: number, y: number) => Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(y));
    // Each branch recomputes the asked quantity by a SUVAT equation the generator did not use.
    switch (p.ask) {
      case 'v-uat': { // generator: v = u + at.  Check v² = u² + 2as with s = ut + ½at².
        const s = p.u * p.t + 0.5 * p.a * p.t * p.t;
        return ans > p.u && close(ans * ans, p.u * p.u + 2 * p.a * s);
      }
      case 's-uvt': { // generator: s = ½(u + v)t.  Check s = ut + ½at² with a = (v − u)/t.
        const a = (p.v - p.u) / p.t;
        return close(ans, p.u * p.t + 0.5 * a * p.t * p.t);
      }
      case 's-uat': { // generator: s = ut + ½at².  Check s = ½(u + v)t with v = u + at.
        const v = p.u + p.a * p.t;
        return close(ans, 0.5 * (p.u + v) * p.t);
      }
      case 'v-uas': { // generator: v² = u² + 2as.  Substitute back: t = (v − u)/a then s = ut + ½at².
        const t = (ans - p.u) / p.a;
        return t > 0 && close(p.s, p.u * t + 0.5 * p.a * t * t);
      }
      case 'a-uvt': { // generator: a = (v − u)/t.  Check a = (v² − u²)/(2s) with s = ½(u + v)t.
        const s = 0.5 * (p.u + p.v) * p.t;
        return close(ans, (p.v * p.v - p.u * p.u) / (2 * s));
      }
      case 't-uva': { // generator: t = (v − u)/a.  Check t = 2s/(u + v) with s = (v² − u²)/(2a).
        const s = (p.v * p.v - p.u * p.u) / (2 * p.a);
        return close(ans, (2 * s) / (p.u + p.v));
      }
      case 'brake-s': { // generator: s = u²/(2a).  Check s = ut − ½at² with t = u/a.
        const t = p.u / p.a;
        return close(ans, p.u * t - 0.5 * p.a * t * t);
      }
      case 'rest-t': { // generator: t = 2s/u.  Check t = u/a with a = u²/(2s).
        const a = (p.u * p.u) / (2 * p.s);
        return close(ans, p.u / a);
      }
      case 'rest-a': { // generator: a = u²/(2s).  Check a = u/t with t = 2s/u.
        const t = (2 * p.s) / p.u;
        return close(ans, p.u / t);
      }
      case 'u-sta': { // generator: u = s/t − ½at.  Substitute back into s = ½(u + v)t with v = u + at.
        const v = ans + p.a * p.t;
        return v >= 0 && close(p.s, 0.5 * (ans + v) * p.t);
      }
      case 'two-stage':
      case 'two-stage-avg': { // integrate the velocity numerically (fine steps).
        const T = p.t1 + p.t2;
        const n = 200000;
        const h = T / n;
        let area = 0;
        for (let i = 0; i < n; i++) {
          const tm = (i + 0.5) * h;
          const v = tm < p.t1 ? p.a * tm : p.a * p.t1;
          area += v * h;
        }
        const expected = p.ask === 'two-stage' ? area : area / T;
        return Math.abs(ans - expected) < 1e-6 * Math.max(1, expected);
      }
      case 't-from-s': { // generator: t = √(2s/a).  Check t = v/a with v = √(2as).
        const v = Math.sqrt(2 * p.a * p.s);
        return ans > 0 && close(ans, v / p.a);
      }
      case 'a-from-sut': { // generator: a = 2(s − ut)/t².  Check a = (v − u)/t with v = 2s/t − u.
        const v = (2 * p.s) / p.t - p.u;
        return close(ans, (v - p.u) / p.t);
      }
      default:
        return false;
    }
  },
});
