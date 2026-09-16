import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { Exact, frac } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { num } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Momentum, impulse and collisions (one dimension).
 * Level 1: p = mv; impulse = change in momentum m(v − u)
 * Level 2: F = Δp/Δt: average force from impulse and time; final velocity from a force acting for a time; the time
 * Level 3: conservation of momentum: two bodies coalesce (one stationary, or both moving the same way)
 * Level 4: explosion / recoil (gun, cannon, skaters); a rebound (signs!); head-on collision that coalesces
 * Level 5: kinetic energy lost in a perfectly inelastic collision (value or fraction); find a mass from the velocities
 *
 * The answer parser only strips a single trailing unit token, so momentum/impulse answers (kg m s⁻¹, N s) carry
 * no `unit` field; the stem asks for the answer in kg m s⁻¹ instead.
 */

const U = {
  v: '\\text{m s}^{-1}',
  N: '\\text{N}',
  kg: '\\text{kg}',
  t: '\\text{s}',
  J: '\\text{J}',
};

const X = (x: number): Exact => Exact.num(Number(x.toFixed(9)));
const q = (x: number, unit: string): string => `$${num(x)}\\ ${unit}$`;

type Cand = { value: number | Exact | null; trap: string };

/** Finite, non-negative, clean and within a sane factor of the answer (zero allowed: "no energy is lost" is a real trap). */
function cleanOnly(ds: Cand[], answer: number): Distractor[] {
  const out: Distractor[] = [];
  for (const d of ds) {
    if (d.value === null) continue;
    const v = typeof d.value === 'number' ? (Number.isFinite(d.value) ? X(d.value) : null) : d.value;
    if (!v) continue;
    const f = v.toNumber();
    if (!Number.isFinite(f) || f < 0) continue;
    if (f !== 0 && (f > 200 * answer || f < answer / 200)) continue;
    if (!isCleanExact(v).ok) continue;
    out.push({ value: v, trap: d.trap });
  }
  return out;
}

/**
 * Headline traps first (in a shuffled order), then the rest chosen towards a randomly drawn number
 * of options *below* the answer. Without that, a variant whose named mistakes all overshoot (or all
 * undershoot) puts the correct option at the same rank in every instance, and "pick the smallest"
 * answers it without any arithmetic. A candidate that would stretch the option list beyond
 * `maxSpread` is skipped: 1.875 N next to 225 N is implausible on sight.
 */
function ranked(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], count = 4, maxSpread = 60): Distractor[] {
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
  // One headline trap always survives; the others are preferred within their own side of the answer,
  // so which mistakes are offered still varies with the draw and the answer's rank moves with it.
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

const fallback = (answer: Exact): Exact[] =>
  [2, 0.5, 3, 4, 1.5, 0.25, 10, 0.1].map((k) => answer.mulRat(X(k).toRat())).filter((v) => isCleanExact(v).ok && !v.isZero());

/** Padding for "what fraction …?": nice fractions strictly between 0 and 1, never a multiple of the answer. */
const FRACTION_PAD: Exact[] = [[1, 3], [2, 3], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5], [1, 6], [5, 6], [1, 8], [3, 8], [5, 8], [7, 8], [1, 2]].map(([n, d]) => frac(n, d));

function physOptions(rng: RNG, answer: Exact, unit: string | undefined, must: Cand[], extra: Cand[], format: 'decimal' | 'fraction' = 'decimal', pad?: Exact[]) {
  const a = answer.toNumber();
  return buildOptions(rng, answer, ranked(rng, answer, cleanOnly(must, a), cleanOnly(extra, a)), { format, unit, fallback: pad ?? fallback(answer) });
}

function finish(stem: string, answer: Exact, unit: string | undefined, options: ReturnType<typeof buildOptions>, solution: string, trap: string, tags: string[], params: Record<string, unknown>, format: 'decimal' | 'fraction' = 'decimal'): Generated {
  return { stem, answer: { kind: 'exact', value: answer, format, unit }, options, solution, trap, tags, params, typedAllowed: true };
}

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

const sig = (x: number) => Number(x.toFixed(9));

// ------------------------------------------------------------------------------------------ level 1

const BODIES: { name: string; masses: number[]; speeds: number[] }[] = [
  { name: 'a ball', masses: [0.2, 0.4, 0.5, 0.6], speeds: [4, 5, 8, 10, 12, 15, 20, 25, 30] },
  { name: 'a cyclist (including the bicycle)', masses: [80, 90, 100], speeds: [4, 5, 6, 8, 10, 12] },
  { name: 'a car', masses: [800, 1000, 1200, 1500], speeds: [5, 10, 12, 15, 20, 25, 30] },
  { name: 'a trolley', masses: [2, 3, 4, 5, 8], speeds: [2, 3, 4, 5, 6, 8, 10] },
  { name: 'a bullet', masses: [0.01, 0.02, 0.05], speeds: [200, 300, 400, 500] },
];

function momentumMV(rng: RNG): Generated | null {
  const b = rng.pick(BODIES);
  const m = rng.pick(b.masses);
  const v = rng.pick(b.speeds);
  const p = sig(m * v);
  const cap = b.name.charAt(0).toUpperCase() + b.name.slice(1);
  const stem = `${cap} of mass ${q(m, U.kg)} moves at ${q(v, U.v)}. Find its momentum, in $\\text{kg m s}^{-1}$.`;
  return finish(stem, X(p), undefined, physOptions(rng, X(p), undefined, [
    { value: 0.5 * m * v * v, trap: 'found the kinetic energy ½mv² instead of the momentum mv' },
  ], [
    { value: m * v * v, trap: 'squared the velocity' },
    { value: 0.5 * m * v, trap: 'used ½mv: the ½ belongs to the kinetic energy, not the momentum' },
    { value: v / m, trap: 'divided instead of multiplying' },
    { value: 2 * m * v, trap: 'used 2mv, the change of momentum in a rebound, instead of the momentum' },
    { value: m * v * 10, trap: 'multiplied by g as if momentum were weight × velocity' },
    { value: (m * v) / 10, trap: 'treated the given mass as a weight and divided by g' },
    { value: m, trap: 'quoted the mass instead of the momentum' },
    { value: v, trap: 'quoted the speed instead of the momentum' },
  ]),
  `$p = mv = ${num(m)} \\times ${v} = ${num(p)}$ kg m s$^{-1}$.`,
  'Momentum is mv (no ½ and no square); ½mv² is the kinetic energy.',
  ['momentum', 'p = mv'], { ask: 'p', m, v });
}

function impulseFromVelocities(rng: RNG): Generated | null {
  // Two shapes with opposite distractor families, drawn equally often: a speed change in one direction,
  // where the named mistakes (mv, mu, m(u + v)) all overshoot, and a rebound, where they all undershoot.
  // Mixing them keeps "find the impulse" from being answerable by the size of the options alone.
  if (rng.bool(0.5)) {
    const m = rng.pick([0.1, 0.15, 0.2, 0.4, 0.5, 0.6, 2, 3]);
    const u = rng.pick([4, 5, 6, 8, 10, 12, 15, 20, 25]);
    const v = rng.pick([2, 3, 4, 5, 6, 8, 10].filter((x) => x < u));
    const J = sig(m * (u + v));
    const stem = `A ball of mass ${q(m, U.kg)} moving at ${q(u, U.v)} strikes a wall at right angles and rebounds along the same line at ${q(v, U.v)}. Find the magnitude of the impulse of the wall on the ball, in $\\text{kg m s}^{-1}$.`;
    return finish(stem, X(J), undefined, physOptions(rng, X(J), undefined, [
      { value: m * (u - v), trap: 'subtracted the speeds: the ball reverses direction, so the change in velocity is u + v' },
    ], [
      { value: m * u, trap: 'used the initial momentum only' },
      { value: m * v, trap: 'used the final momentum only' },
      { value: u + v, trap: 'forgot the mass' },
      { value: 0.5 * m * (u + v), trap: 'slipped in the ½ from ½mv²: the impulse mΔv has no ½' },
      { value: 0.5 * m * (u * u - v * v), trap: 'found the change in kinetic energy instead' },
      { value: 2 * m * (u + v), trap: 'doubled for the rebound after already adding the two speeds' },
    ]),
    `Take the rebound direction as positive: $\\Delta p = m v - m(-u) = ${num(m)} \\times (${v} + ${u}) = ${num(J)}$ kg m s$^{-1}$ (equivalently N s).`,
    'A rebound reverses the velocity, so the change in momentum is m(u + v), not m(u − v).',
    ['momentum', 'impulse', 'rebound', 'signs'], { ask: 'impulse', m, u, v: -v });
  }
  // Masses of at least 1 kg, so that "forgot the mass" and "divided by the mass" land *below* the answer:
  // with a 0.2 kg ball every named mistake overshoots and the answer is the smallest option every time.
  const b = rng.pick(BODIES.filter((x) => x.masses.every((mm) => mm >= 1)));
  const m = rng.pick(b.masses);
  const [u, v] = rng.pickDistinct(b.speeds, 2);
  const J = sig(m * Math.abs(v - u));
  const cap = b.name.charAt(0).toUpperCase() + b.name.slice(1);
  const stem = `${cap} of mass ${q(m, U.kg)} is moving in a straight line at ${q(u, U.v)}. A force acts along the line of motion and its speed changes to ${q(v, U.v)} in the same direction. Find the magnitude of the impulse, in $\\text{kg m s}^{-1}$.`;
  return finish(stem, X(J), undefined, physOptions(rng, X(J), undefined, [
    { value: m * v, trap: 'used mv (the final momentum) instead of the change in momentum mΔv' },
  ], [
    { value: m * (u + v), trap: 'added the velocities instead of subtracting' },
    { value: Math.abs(v - u), trap: 'forgot the mass' },
    { value: 0.5 * m * Math.abs(v * v - u * u), trap: 'found the change in kinetic energy instead' },
    { value: m * u, trap: 'used the initial momentum' },
    { value: 0.5 * m * Math.abs(v - u), trap: 'slipped in the ½ from ½mv²: the impulse mΔv has no ½' },
    { value: Math.abs(v - u) / m, trap: 'divided by the mass instead of multiplying' },
  ]),
  `Impulse $= \\Delta p = m(v - u) = ${num(m)} \\times (${v} - ${u}) = ${num(m * (v - u))}$, magnitude $${num(J)}$ kg m s$^{-1}$ (equivalently N s).`,
  'Impulse is the change in momentum m(v − u), not the final momentum mv.',
  ['momentum', 'impulse'], { ask: 'impulse', m, u, v });
}

// ------------------------------------------------------------------------------------------ level 2

function forceFromImpulse(rng: RNG): Generated | null {
  const m = rng.pick([0.1, 0.2, 0.4, 0.5, 2, 5, 60, 1000]);
  const dv = rng.pick([5, 10, 12, 15, 20, 25, 30, 40]);
  const t = rng.pick(m >= 60 ? [2, 4, 5, 10] : [0.1, 0.2, 0.25, 0.4, 0.5]);
  const F = sig((m * dv) / t);
  if (!Number.isInteger(F * 2) || F > 100000) return null;
  const J = sig(m * dv);
  const context = m >= 60
    ? (m === 60
      ? `A skater of mass ${q(m, U.kg)} moving at ${q(dv, U.v)} is brought to rest by a barrier in ${q(t, U.t)}.`
      : `A car of mass ${q(m, U.kg)} travelling at ${q(dv, U.v)} is brought to rest by its brakes in ${q(t, U.t)}.`)
    : m >= 2
    ? `A trolley of mass ${q(m, U.kg)} moving at ${q(dv, U.v)} is brought to rest by a buffer in ${q(t, U.t)}.`
    : rng.pick([
      `A ball of mass ${q(m, U.kg)} travelling at ${q(dv, U.v)} is caught and brought to rest in ${q(t, U.t)}.`,
      `A ball of mass ${q(m, U.kg)} is struck from rest and leaves the bat at ${q(dv, U.v)}; the contact lasts ${q(t, U.t)}.`,
      `A ball of mass ${q(m, U.kg)} hits a wall at ${q(dv, U.v)} and stops; the contact lasts ${q(t, U.t)}.`,
    ]);
  const stem = `${context} Find the magnitude of the average force.`;
  return finish(stem, X(F), U.N, physOptions(rng, X(F), U.N, [
    { value: J, trap: 'found the impulse mΔv but did not divide by the time' },
  ], [
    { value: J * t, trap: 'multiplied by the time instead of dividing' },
    { value: dv / t, trap: 'forgot the mass (found the acceleration)' },
    { value: (0.5 * m * dv) / t, trap: 'slipped in the ½ from ½mv²: the impulse mΔv has no ½' },
    { value: (0.5 * m * dv * dv) / t, trap: 'divided the kinetic energy by the time (that is a power, not a force)' },
    { value: (m * dv) / (t * t), trap: 'divided by the time twice' },
  ]),
  `$F = \\frac{\\Delta p}{\\Delta t} = \\frac{${num(m)} \\times ${dv}}{${num(t)}} = \\frac{${num(J)}}{${num(t)}} = ${num(F)}$ N.`,
  'Average force is the change in momentum divided by the contact time; mΔv on its own is the impulse.',
  ['momentum', 'impulse', 'force'], { ask: 'force', m, dv, t });
}

function velocityFromForce(rng: RNG): Generated | null {
  const m = rng.pick([2, 4, 5, 8, 10, 20, 50]);
  const F = rng.pick([4, 5, 8, 10, 12, 15, 20, 25, 30, 40, 50]);
  const t = rng.pick([2, 3, 4, 5, 6, 8, 10]);
  const u = rng.pick([0, 0, 2, 3, 4, 5, 6, 8]);
  const dv = (F * t) / m;
  if (!Number.isInteger(dv * 2) || dv > 60) return null;
  const v = u + dv;
  const askTime = rng.bool(0.3);
  if (askTime) {
    const stem = `A constant force of ${q(F, U.N)} acts on a body of mass ${q(m, U.kg)} along its direction of motion, increasing its speed from ${q(u, U.v)} to ${q(v, U.v)}. For how long does the force act?`;
    return finish(stem, X(t), U.t, physOptions(rng, X(t), U.t, [
      { value: (m * v) / F, trap: 'used the final momentum mv instead of the change in momentum' },
      { value: F / (m * dv), trap: 'inverted: t = mΔv/F' },
    ], [
      { value: dv / F, trap: 'forgot the mass' },
      { value: (m * dv * F), trap: 'multiplied by F instead of dividing' },
      { value: (m * (u + v)) / F, trap: 'added the velocities instead of subtracting' },
      { value: (m * (u + v)) / (2 * F), trap: 'used the average velocity ½(u + v) instead of the change in velocity' },
      { value: (m * u) / F, trap: 'used the initial momentum instead of the change in momentum' },
    ]),
    `$Ft = m(v - u)$, so $t = \\frac{${m} \\times (${v} - ${u})}{${F}} = \\frac{${m * dv}}{${F}} = ${t}$ s.`,
    'Impulse Ft equals the change in momentum m(v − u); solve for t.',
    ['momentum', 'impulse', 'time'], { ask: 'time', m, F, u, v });
  }
  const stem = u === 0
    ? `A constant force of ${q(F, U.N)} acts for ${q(t, U.t)} on a body of mass ${q(m, U.kg)} that is initially at rest. Find the speed of the body at the end of this time.`
    : `A body of mass ${q(m, U.kg)} is moving at ${q(u, U.v)}. A constant force of ${q(F, U.N)} acts on it in its direction of motion for ${q(t, U.t)}. Find its final speed.`;
  return finish(stem, X(v), U.v, physOptions(rng, X(v), U.v, [
    u > 0 ? { value: dv, trap: 'forgot to add the initial velocity: Ft/m is the change in velocity' } : { value: F * t, trap: 'found the impulse Ft but did not divide by the mass' },
    { value: u + F / m, trap: 'forgot the time: impulse is F × t' },
  ], [
    { value: u + F * t, trap: 'found the impulse Ft but did not divide by the mass' },
    { value: u + (F * t) / (m * 10), trap: 'divided by the weight instead of the mass' },
    { value: u + (F * t * m), trap: 'multiplied by the mass instead of dividing' },
    { value: (F * t) / m - u, trap: 'subtracted the initial velocity instead of adding it' },
  ]),
  `Impulse $Ft = ${F} \\times ${t} = ${F * t}$ N s $= m\\Delta v$, so $\\Delta v = \\frac{${F * t}}{${m}} = ${num(dv)}$ m s$^{-1}$ and $v = ${u} + ${num(dv)} = ${num(v)}$ m s$^{-1}$.`,
  'Ft = mΔv gives the change in velocity; add it to the initial velocity.',
  ['momentum', 'impulse', 'velocity'], { ask: 'velocity', m, F, t, u });
}

// ------------------------------------------------------------------------------------------ level 3

const PAIRS = ['trucks on a railway line', 'trolleys on a smooth track', 'balls of modelling clay', 'ice skaters', 'railway wagons'];
const SINGLE: Record<string, string> = { 'trucks on a railway line': 'truck', 'trolleys on a smooth track': 'trolley', 'balls of modelling clay': 'ball', 'ice skaters': 'skater', 'railway wagons': 'wagon' };
const PLURAL: Record<string, string> = { 'trucks on a railway line': 'trucks', 'trolleys on a smooth track': 'trolleys', 'balls of modelling clay': 'balls', 'ice skaters': 'skaters', 'railway wagons': 'wagons' };

function coalesceStationary(rng: RNG): Generated | null {
  const m1 = rng.pick([1, 2, 3, 4, 5, 6, 8, 10, 20, 40, 60]);
  const m2 = rng.pick([1, 2, 3, 4, 5, 6, 8, 10, 20, 40, 60]);
  const u1 = rng.pick([2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 20]);
  const v = (m1 * u1) / (m1 + m2);
  if (!Number.isInteger(v * 2)) return null;
  const kind = rng.pick(PAIRS);
  const one = SINGLE[kind];
  const stem = `A ${one} of mass ${q(m1, U.kg)} moving at ${q(u1, U.v)} collides with a stationary ${one} of mass ${q(m2, U.kg)}. The two ${PLURAL[kind]} ${kind === 'ice skaters' ? 'hold on to each other' : 'stick together'} after the collision. Find their common speed.`;
  return finish(stem, X(v), U.v, physOptions(rng, X(v), U.v, [
    { value: (m1 * u1) / m2, trap: 'divided by the other mass only: after coalescing the total mass m₁ + m₂ moves' },
    { value: u1 / 2, trap: 'averaged the two speeds regardless of the masses' },
  ], [
    { value: u1, trap: 'assumed the speed is unchanged' },
    { value: (m2 * u1) / (m1 + m2), trap: 'used the wrong mass in the initial momentum' },
    { value: m1 * u1, trap: 'found the total momentum, not the speed' },
    { value: u1 - v, trap: 'found the speed the first body loses, not their common speed' },
    { value: (m1 * u1) / (m1 * m2), trap: 'multiplied the masses instead of adding them' },
    { value: (0.5 * m1 * u1) / (m1 + m2), trap: 'used ½m₁u₁ for the momentum before: the ½ belongs to the kinetic energy' },
  ]),
  `Momentum: $${m1} \\times ${u1} = (${m1} + ${m2})v$, so $v = \\frac{${m1 * u1}}{${m1 + m2}} = ${num(v)}$ m s$^{-1}$.`,
  'After a perfectly inelastic collision the combined mass m₁ + m₂ carries all the momentum.',
  ['momentum', 'conservation', 'coalesce'], { ask: 'coalesce', m1, u1, m2, u2: 0 });
}

function coalesceSameDirection(rng: RNG): Generated | null {
  const m1 = rng.pick([1, 2, 3, 4, 5, 6, 8, 10]);
  const m2 = rng.pick([1, 2, 3, 4, 5, 6, 8, 10]);
  const u1 = rng.pick([4, 5, 6, 8, 9, 10, 12, 15]);
  const u2 = rng.pick([1, 2, 3, 4, 5, 6].filter((x) => x < u1));
  const v = (m1 * u1 + m2 * u2) / (m1 + m2);
  if (!Number.isInteger(v * 2)) return null;
  const kind = rng.pick(PAIRS.filter((k) => k !== 'ice skaters'));
  const one = SINGLE[kind];
  const stem = `A ${one} of mass ${q(m1, U.kg)} moving at ${q(u1, U.v)} catches up with a ${one} of mass ${q(m2, U.kg)} moving in the same direction at ${q(u2, U.v)}. They collide and move on together. Find their common speed.`;
  return finish(stem, X(v), U.v, physOptions(rng, X(v), U.v, [
    { value: (u1 + u2) / 2, trap: 'averaged the speeds without weighting by mass' },
    { value: (m1 * u1 - m2 * u2) / (m1 + m2), trap: 'subtracted the second momentum: both move the same way, so add' },
  ], [
    { value: (m1 * u1 + m2 * u2) / m1, trap: 'divided by the first mass only' },
    { value: m1 * u1 + m2 * u2, trap: 'found the total momentum, not the speed' },
    { value: (m1 * u1 + m2 * u2) / m2, trap: 'divided by the second mass only' },
    { value: (m1 * u1 + m2 * u2) / (m1 * m2), trap: 'multiplied the masses instead of adding them' },
    { value: (m2 * u2) / (m1 + m2), trap: 'used the second body\'s momentum only' },
  ]),
  `Momentum: $${m1} \\times ${u1} + ${m2} \\times ${u2} = (${m1} + ${m2})v$, so $v = \\frac{${m1 * u1 + m2 * u2}}{${m1 + m2}} = ${num(v)}$ m s$^{-1}$.`,
  'Add the momenta (same direction), then divide by the combined mass; a plain average of the speeds ignores the masses.',
  ['momentum', 'conservation', 'coalesce'], { ask: 'coalesce', m1, u1, m2, u2 });
}

// ------------------------------------------------------------------------------------------ level 4

function recoil(rng: RNG): Generated | null {
  const kind = rng.pick(['gun', 'cannon', 'skaters', 'skaters'] as const);
  let M: number, m: number, v: number, stem: string, solutionIntro: string;
  if (kind === 'gun') {
    M = rng.pick([2, 4, 5]); m = rng.pick([0.01, 0.02, 0.05]); v = rng.pick([200, 400, 500]);
    stem = `A rifle of mass ${q(M, U.kg)} fires a bullet of mass ${q(m, U.kg)} horizontally at ${q(v, U.v)}. Find the recoil speed of the rifle.`;
    solutionIntro = 'Total momentum is zero before and after';
  } else if (kind === 'cannon') {
    M = rng.pick([200, 400, 500, 1000]); m = rng.pick([2, 4, 5, 10]); v = rng.pick([100, 200, 250, 400]);
    stem = `A cannon of mass ${q(M, U.kg)} fires a shell of mass ${q(m, U.kg)} horizontally at ${q(v, U.v)}. Find the recoil speed of the cannon.`;
    solutionIntro = 'Total momentum is zero before and after';
  } else {
    M = rng.pick([40, 50, 60, 80]); m = rng.pick([40, 50, 60, 80, 100].filter((x) => x !== M)); v = rng.pick([1, 2, 3, 4, 5]);
    stem = `Two skaters of mass ${q(M, U.kg)} and ${q(m, U.kg)} stand at rest facing each other on smooth ice and push apart. The ${q(m, U.kg)} skater moves off at ${q(v, U.v)}. Find the speed of the other skater.`;
    solutionIntro = 'They start at rest, so the total momentum stays zero';
  }
  const V = sig((m * v) / M);
  if (!Number.isInteger(V * 4) || V > 20) return null;
  return finish(stem, X(V), U.v, physOptions(rng, X(V), U.v, [
    { value: (m * v) / (M + m), trap: 'divided by the total mass: after separation each body has its own mass' },
    { value: (M * v) / m, trap: 'inverted the mass ratio' },
  ], [
    { value: v, trap: 'assumed both move at the same speed' },
    { value: m * v, trap: 'found the momentum, not the speed' },
    { value: (m * v) / (M * 10), trap: 'divided by the weight Mg instead of the mass M' },
    { value: (m * v) / (M * m), trap: 'divided by the product of the masses instead of by M' },
    { value: (m * v) / (M - m), trap: 'used the difference of the masses instead of M' },
    { value: (m * v * 10) / M, trap: 'multiplied by g as if momentum were weight × velocity' },
    { value: (0.5 * m * v) / M, trap: 'used ½mv for the momentum: the ½ belongs to the kinetic energy' },
    { value: (2 * m * v) / M, trap: 'used 2mv, the change of momentum in a rebound: from rest the change is mv' },
    { value: v * Math.sqrt(m / M), trap: 'used conservation of kinetic energy instead of conservation of momentum' },
  ]),
  `${solutionIntro}: $${num(M)}V = ${num(m)} \\times ${v}$, so $V = \\frac{${num(m * v)}}{${num(M)}} = ${num(V)}$ m s$^{-1}$ (in the opposite direction).`,
  'In an explosion from rest the momenta are equal and opposite: MV = mv; each body keeps its own mass.',
  ['momentum', 'recoil', 'explosion'], { ask: 'recoil', M, m, v });
}

function rebound(rng: RNG): Generated | null {
  const m1 = rng.pick([1, 2, 3, 4, 5]);
  const u1 = rng.pick([3, 4, 5, 6, 8, 9, 10, 12]);
  const w = rng.pick([1, 2, 3, 4].filter((x) => x < u1));
  const m2 = rng.pick([2, 3, 4, 5, 6, 8, 10]);
  const v2 = (m1 * (u1 + w)) / m2;
  if (!Number.isInteger(v2 * 2) || v2 >= u1) return null;
  const stem = `A ball of mass ${q(m1, U.kg)} moving at ${q(u1, U.v)} strikes a stationary ball of mass ${q(m2, U.kg)} head-on. After the collision the first ball rebounds along its original line at ${q(w, U.v)}. Find the speed of the second ball.`;
  return finish(stem, X(v2), U.v, physOptions(rng, X(v2), U.v, [
    { value: (m1 * (u1 - w)) / m2, trap: 'sign error: the rebound velocity is negative, so its momentum must be added back' },
    { value: (m1 * u1) / m2, trap: 'ignored the rebound of the first ball' },
  ], [
    { value: u1 + w, trap: 'forgot the masses' },
    { value: (m1 * (u1 + w)) / (m1 + m2), trap: 'divided by the total mass as if they had coalesced' },
    { value: (m1 * u1) / (m1 + m2), trap: 'treated it as a coalescing collision' },
    { value: (m2 * (u1 + w)) / m1, trap: 'inverted the mass ratio' },
    { value: u1, trap: 'assumed the second ball moves off at the first ball\'s original speed' },
  ]),
  `Taking the original direction as positive: $${m1} \\times ${u1} = ${m1} \\times (-${w}) + ${m2}v$, so $${m2}v = ${m1 * u1} + ${m1 * w} = ${m1 * (u1 + w)}$ and $v = ${num(v2)}$ m s$^{-1}$.`,
  'A rebound is a negative velocity: moving it to the other side adds m₁w to the momentum the second ball must carry.',
  ['momentum', 'conservation', 'rebound', 'signs'], { ask: 'rebound', m1, u1, w, m2 });
}

function headOn(rng: RNG): Generated | null {
  const m1 = rng.pick([2, 3, 4, 5, 6, 8, 10]);
  const m2 = rng.pick([1, 2, 3, 4, 5, 6]);
  const u1 = rng.pick([4, 5, 6, 8, 10, 12]);
  const u2 = rng.pick([1, 2, 3, 4, 5, 6, 8]);
  const net = m1 * u1 - m2 * u2;
  const v = net / (m1 + m2);
  if (net <= 0 || !Number.isInteger(v * 2)) return null;
  const kind = rng.pick(PAIRS.filter((k) => k !== 'ice skaters'));
  const one = SINGLE[kind];
  const stem = `A ${one} of mass ${q(m1, U.kg)} moving at ${q(u1, U.v)} collides head-on with a ${one} of mass ${q(m2, U.kg)} moving in the opposite direction at ${q(u2, U.v)}. They stick together. Find their common speed after the collision.`;
  return finish(stem, X(v), U.v, physOptions(rng, X(v), U.v, [
    { value: (m1 * u1 + m2 * u2) / (m1 + m2), trap: 'added the momenta: the second body moves the opposite way, so its momentum is negative' },
    { value: (u1 - u2) / 2, trap: 'averaged the speeds without the masses' },
  ], [
    { value: net / m1, trap: 'divided by the first mass only' },
    { value: net, trap: 'found the total momentum, not the speed' },
    { value: (u1 + u2) / 2, trap: 'averaged the speeds and ignored the directions' },
    { value: net / (m1 * m2), trap: 'multiplied the masses instead of adding them' },
    { value: (m2 * u2) / (m1 + m2), trap: 'used the second body\'s momentum only' },
    { value: u1 - u2, trap: 'used the relative speed of approach' },
  ]),
  `Taking the first ${one}'s direction as positive: $${m1} \\times ${u1} - ${m2} \\times ${u2} = (${m1} + ${m2})v$, so $v = \\frac{${net}}{${m1 + m2}} = ${num(v)}$ m s$^{-1}$ in the direction of the first ${one}.`,
  'Opposite directions mean opposite signs: subtract the second momentum before dividing by the total mass.',
  ['momentum', 'conservation', 'head-on', 'signs'], { ask: 'coalesce', m1, u1, m2, u2: -u2 });
}

// ------------------------------------------------------------------------------------------ level 5

function keLost(rng: RNG): Generated | null {
  const m1 = rng.pick([1, 2, 3, 4, 6]);
  const m2 = rng.pick([1, 2, 3, 4, 6, 8]);
  const u1 = rng.pick([2, 4, 6, 8, 10, 12]);
  const v = (m1 * u1) / (m1 + m2);
  if (!Number.isInteger(v * 2)) return null;
  const before = 0.5 * m1 * u1 * u1;
  const after = 0.5 * (m1 + m2) * v * v;
  const lost = sig(before - after);
  if (!Number.isInteger(lost * 2) || lost <= 0) return null;
  const askFraction = rng.bool(0.35);
  const kind = rng.pick(PAIRS.filter((k) => k !== 'ice skaters'));
  const one = SINGLE[kind];
  const intro = `A ${one} of mass ${q(m1, U.kg)} moving at ${q(u1, U.v)} collides with a stationary ${one} of mass ${q(m2, U.kg)} and the two move off together.`;
  if (askFraction) {
    // Equal masses make the fraction exactly ½, which is also the "assumed half is always lost" trap,
    // and every other candidate then collapses to the same five numbers.
    if (m1 === m2) return null;
    const fr = frac(m2, m1 + m2);
    // A fraction of the initial energy must lie strictly between 0 and 1: m₁/m₂, m₂/m₁ and any padding
    // above 1 would be eliminated on sight, and "all of it" is impossible when the pair moves off together.
    const proper = (c: { value: Exact; trap: string }): Cand => ({ value: c.value.toNumber() < 1 ? c.value : null, trap: c.trap });
    const must = [
      { value: frac(m1, m1 + m2), trap: 'found the fraction that remains, not the fraction lost' },
      { value: frac(1, 2), trap: 'assumed half the energy is always lost' },
    ].map(proper);
    const extra = [
      proper({ value: frac(m2, m1), trap: 'used m₂/m₁' }),
      proper({ value: frac(m1, m2), trap: 'used m₁/m₂' }),
      // KE after computed as ½m₁v² instead of ½(m₁ + m₂)v²: the fraction lost becomes 1 − (v/u₁)²
      proper({ value: Exact.ONE.sub(frac(m1, m1 + m2).pow(2)), trap: 'used ½m₁v² for the energy after: the combined mass m₁ + m₂ moves off' }),
      proper({ value: frac(m1, m1 + m2).pow(2), trap: 'used (v/u₁)² for the fraction that remains: the mass changes too' }),
      { value: Exact.ZERO, trap: 'assumed kinetic energy is conserved (only momentum is)' },
    ];
    if (cleanOnly([...must, ...extra], fr.toNumber()).length < 4) return null;
    const stem = `${intro} What fraction of the initial kinetic energy is lost in the collision?`;
    return finish(stem, fr, undefined, physOptions(rng, fr, undefined, must, extra, 'fraction', FRACTION_PAD),
    `$v = \\frac{${m1 * u1}}{${m1 + m2}} = ${num(v)}$ m s$^{-1}$. KE before $= \\tfrac{1}{2} \\times ${m1} \\times ${u1}^2 = ${num(before)}$ J; after $= \\tfrac{1}{2} \\times ${m1 + m2} \\times ${num(v)}^2 = ${num(after)}$ J. Fraction lost $= \\frac{${num(lost)}}{${num(before)}} = ${fr.toLatex()}$ (in general $\\frac{m_2}{m_1 + m_2}$).`,
    'Momentum is conserved but kinetic energy is not; the fraction lost when a moving mass sticks to a stationary one is m₂/(m₁ + m₂).',
    ['momentum', 'kinetic energy', 'inelastic', 'fraction'], { ask: 'ke-fraction', m1, u1, m2 }, 'fraction');
  }
  const stem = `${intro} Find the kinetic energy lost in the collision.`;
  return finish(stem, X(lost), U.J, physOptions(rng, X(lost), U.J, [
    { value: after, trap: 'quoted the kinetic energy after the collision instead of the loss' },
    { value: 0, trap: 'assumed kinetic energy is conserved (only momentum is)' },
  ], [
    { value: before, trap: 'quoted the kinetic energy before the collision' },
    { value: before - 0.5 * m1 * v * v, trap: 'forgot the second mass when finding the energy after' },
    { value: 0.5 * (m1 + m2) * (u1 - v) * (u1 - v), trap: 'used ½(m₁ + m₂)(u − v)²' },
    { value: 0.5 * m2 * v * v, trap: 'found only the energy carried off by the second body' },
    { value: before + after, trap: 'added the two kinetic energies instead of subtracting' },
  ]),
  `Momentum: $v = \\frac{${m1} \\times ${u1}}{${m1 + m2}} = ${num(v)}$ m s$^{-1}$. KE before $= \\tfrac{1}{2} \\times ${m1} \\times ${u1}^2 = ${num(before)}$ J; after $= \\tfrac{1}{2} \\times ${m1 + m2} \\times ${num(v)}^2 = ${num(after)}$ J. Lost: $${num(before)} - ${num(after)} = ${num(lost)}$ J.`,
  'Find v from momentum first, then compute the two kinetic energies separately; in a perfectly inelastic collision some KE is always lost.',
  ['momentum', 'kinetic energy', 'inelastic'], { ask: 'ke-lost', m1, u1, m2 });
}

function findMass(rng: RNG): Generated | null {
  const m1 = rng.pick([1, 2, 3, 4, 5, 6, 8, 10]);
  const u1 = rng.pick([4, 6, 8, 9, 10, 12, 15, 20]);
  const v = rng.pick([1, 2, 3, 4, 5, 6].filter((x) => x < u1));
  const m2 = (m1 * (u1 - v)) / v;
  if (!Number.isInteger(m2 * 2) || m2 > 60) return null;
  const kind = rng.pick(PAIRS.filter((k) => k !== 'ice skaters'));
  const one = SINGLE[kind];
  const stem = `A ${one} of mass ${q(m1, U.kg)} moving at ${q(u1, U.v)} collides with a stationary ${one} and the two move off together at ${q(v, U.v)}. Find the mass of the second ${one}.`;
  return finish(stem, X(m2), U.kg, physOptions(rng, X(m2), U.kg, [
    { value: (m1 * u1) / v, trap: 'found the total mass m₁ + m₂ and forgot to subtract m₁' },
    { value: (m1 * v) / (u1 - v), trap: 'inverted the ratio' },
  ], [
    { value: m1 * (u1 - v), trap: 'forgot to divide by v' },
    { value: m1, trap: 'assumed equal masses' },
    { value: (m1 * u1) / v - v, trap: 'subtracted v instead of m₁' },
    { value: (m1 * (u1 - v)) / u1, trap: 'divided by the initial speed instead of the common speed' },
    { value: (u1 - v) / v, trap: 'forgot to multiply by m₁' },
  ]),
  `$${m1} \\times ${u1} = (${m1} + m)\\times ${v}$, so $${m1} + m = \\frac{${m1 * u1}}{${v}} = ${m1 + m2}$ and $m = ${num(m2)}$ kg.`,
  'Conservation of momentum gives the total mass m₁ + m₂ = m₁u₁/v; remember to subtract m₁.',
  ['momentum', 'conservation', 'mass'], { ask: 'find-mass', m1, u1, v });
}

export default defineTemplate({
  id: 'phy.forces.momentum',
  module: 'PHY',
  topic: 'forces',
  title: 'Momentum, impulse and collisions',
  levels: {
    1: 'p = mv; impulse = m(v − u)',
    2: 'F = Δp/Δt: force from impulse and time; final velocity or time from a constant force',
    3: 'conservation of momentum: coalescing bodies (one stationary or both moving the same way)',
    4: 'recoil (gun, cannon, skaters); a rebound with signs; head-on collision that coalesces',
    5: 'kinetic energy lost (or fraction lost) in a perfectly inelastic collision; find a mass from the velocities',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return pickVariant(rng, [momentumMV, impulseFromVelocities]);
        case 2: return pickVariant(rng, [forceFromImpulse, forceFromImpulse, velocityFromForce]);
        case 3: return pickVariant(rng, [coalesceStationary, coalesceSameDirection]);
        case 4: return pickVariant(rng, [recoil, rebound, headOn]);
        default: return pickVariant(rng, [keLost, keLost, findMass]);
      }
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const ans = q.answer.value.toNumber();
    const p = q.params as Record<string, number> & { ask: string };
    const close = (x: number, y: number) => Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(y));
    switch (p.ask) {
      case 'p': { // p = √(2 m KE) with KE = ½mv²
        const ke = 0.5 * p.m * p.v * p.v;
        return close(ans, Math.sqrt(2 * p.m * ke));
      }
      case 'impulse': { // difference of the two momenta computed separately
        const before = p.m * p.u, after = p.m * p.v;
        return close(ans, Math.abs(after - before));
      }
      case 'force': { // Newton II: F = m a with a = Δv/t
        const a = p.dv / p.t;
        return close(ans, p.m * a);
      }
      case 'velocity': { // a = F/m, v = u + at
        const a = p.F / p.m;
        return close(ans, p.u + a * p.t);
      }
      case 'time': { // t = Δv / a with a = F/m
        const a = p.F / p.m;
        return close(ans, (p.v - p.u) / a);
      }
      case 'coalesce': // momentum before equals momentum after with the answer as the common velocity
        return close(p.m1 * p.u1 + p.m2 * p.u2, (p.m1 + p.m2) * ans) && ans > 0;
      case 'recoil': // total momentum after the explosion is zero
        return close(p.m * p.v - p.M * ans, 0);
      case 'rebound': // m1 u1 = −m1 w + m2 v2
        return close(p.m1 * p.u1, -p.m1 * p.w + p.m2 * ans);
      case 'ke-lost': { // reduced-mass formula: ΔKE = ½ · m1 m2/(m1 + m2) · (u1 − u2)²
        const mu = (p.m1 * p.m2) / (p.m1 + p.m2);
        return close(ans, 0.5 * mu * p.u1 * p.u1);
      }
      case 'ke-fraction': { // 1 − KE_after/KE_before computed from the velocities
        const v = (p.m1 * p.u1) / (p.m1 + p.m2);
        const before = 0.5 * p.m1 * p.u1 * p.u1;
        const after = 0.5 * (p.m1 + p.m2) * v * v;
        return close(ans, 1 - after / before);
      }
      case 'find-mass': // momentum conservation with the answer as the unknown mass
        return close(p.m1 * p.u1, (p.m1 + ans) * p.v);
      default:
        return false;
    }
  },
});
