import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { Exact, E } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { num, exactSin, exactCos } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Newton's laws, weight and friction (g = 10 m s⁻² throughout).
 * Level 1: F = ma (any one of the three), W = mg, mass from weight
 * Level 2: two forces in a line → acceleration; driving force (or resistance) from ma and R
 * Level 3: friction F = μR on a horizontal surface: deceleration μg, force for constant speed μmg,
 *          acceleration under a push, force to accelerate, μ from a deceleration
 * Level 4: smooth inclined plane at 30° (or 60°): acceleration g sin θ, force to hold, normal reaction,
 *          speed after t seconds of sliding
 * Level 5: connected particles (pulley, table + pulley, car towing a trailer) → acceleration and tension;
 *          lifts (reading on scales, cable tension)
 */

const G = 10;
const DEC = { format: 'decimal' as const };
const U = {
  v: '\\text{m s}^{-1}',
  a: '\\text{m s}^{-2}',
  N: '\\text{N}',
  kg: '\\text{kg}',
  t: '\\text{s}',
};
const G_NOTE = `Take $g = 10\\ ${U.a}$.`;

const X = (x: number): Exact => Exact.num(Number(x.toFixed(9)));
const q = (x: number, unit: string): string => `$${num(x)}\\ ${unit}$`;

type Cand = { value: number | Exact | null; trap: string };

/**
 * Finite, positive, clean, and within a sane factor of the answer (numbers become short decimals;
 * Exacts pass through). `accept` adds the physics a candidate can check without doing the question:
 * a coefficient of friction is below 1, and a system released from rest cannot accelerate faster
 * than g — options that break those are eliminated on sight and waste a slot.
 */
function cleanOnly(ds: Cand[], answer: number, accept: (v: number) => boolean = () => true, window = 40): Distractor[] {
  const out: Distractor[] = [];
  for (const d of ds) {
    if (d.value === null) continue;
    const v = typeof d.value === 'number' ? (Number.isFinite(d.value) ? X(d.value) : null) : d.value;
    if (!v) continue;
    const f = v.toNumber();
    if (!Number.isFinite(f) || f <= 0 || f > window * answer || f < answer / window) continue;
    if (!accept(f)) continue;
    if (!isCleanExact(v).ok) continue;
    out.push({ value: v, trap: d.trap });
  }
  return out;
}

/**
 * Fill the four slots from both sides of the answer: a target number of options below it is drawn
 * first and each slot then comes from whichever side is still short, with the headline (`must`)
 * mistakes preferred *within the side that is needed*. Without that, a variant whose named mistakes
 * all overshoot (ma vs F, mg vs ma, …) puts the correct option at the same rank in every instance
 * and "pick the smallest" answers it with no arithmetic; taking a `must` first, as this used to,
 * left the same hole one slot smaller. A candidate that would stretch the option list beyond
 * `maxSpread` is skipped: 3.125 N next to 2000 N is implausible on sight.
 */
function ranked(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], count = 4, maxSpread = 40): Distractor[] {
  const a = answer.toNumber();
  const seen: Exact[] = [answer];
  const mags: number[] = Math.abs(a) > 0 ? [Math.abs(a)] : [];
  const out: Distractor[] = [];
  const fits = (d: Distractor) => {
    const x = Math.abs(d.value.toNumber());
    return !(x > 0 && mags.length > 0 && Math.max(...mags, x) / Math.min(...mags, x) > maxSpread);
  };
  const isBelow = (d: Distractor) => d.value.toNumber() < a;
  const pools = [rng.shuffle(must), rng.shuffle(extra)];
  const wantBelow = rng.int(0, count);
  const pull = (below: boolean): Distractor | null => {
    for (const pool of pools) {
      const i = pool.findIndex((d) => isBelow(d) === below && fits(d) && !seen.some((s) => s.equals(d.value)));
      if (i >= 0) return pool.splice(i, 1)[0];
    }
    return null;
  };
  while (out.length < count) {
    const needBelow = out.filter(isBelow).length < wantBelow;
    const d = pull(needBelow) ?? pull(!needBelow);
    if (!d) break;
    seen.push(d.value);
    const x = Math.abs(d.value.toNumber());
    if (x > 0) mags.push(x);
    out.push(d);
  }
  return out;
}

/**
 * Four named distractors or nothing: a draw that cannot offer them is redrawn rather than padded
 * with unlabelled multiples of the answer.
 */
function physOptions(rng: RNG, answer: Exact, unit: string | undefined, must: Cand[], extra: Cand[], accept?: (v: number) => boolean, spread = 40) {
  const a = answer.toNumber();
  const ds = ranked(rng, answer, cleanOnly(must, a, accept, spread), cleanOnly(extra, a, accept, spread), 4, spread);
  return ds.length < 4 ? null : buildOptions(rng, answer, ds, { ...DEC, unit });
}

function finish(stem: string, answer: Exact, unit: string | undefined, options: ReturnType<typeof buildOptions> | null, solution: string, trap: string, tags: string[], params: Record<string, unknown>): Generated | null {
  return options && { stem, answer: { kind: 'exact', value: answer, ...DEC, unit }, options, solution, trap, tags, params, typedAllowed: true };
}

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

// ------------------------------------------------------------------------------------------ level 1

function fma(rng: RNG): Generated | null {
  const ask = rng.pick(['a', 'F', 'm'] as const);
  const m = rng.pick([2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 40, 50]);
  const a = rng.pick([0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8]);
  const F = m * a;
  if (!Number.isInteger(F)) return null;
  const obj = rng.pick(['a box', 'a trolley', 'a sledge', 'a crate', 'a toy car']);
  if (ask === 'a') {
    const stem = `A resultant force of ${q(F, U.N)} acts on ${obj} of mass ${q(m, U.kg)}. Find its acceleration.`;
    return finish(stem, X(a), U.a, physOptions(rng, X(a), U.a, [
      { value: F * m, trap: 'multiplied F by m instead of dividing' },
      { value: m / F, trap: 'divided the wrong way round: a = F/m' },
    ], [
      { value: F / (m * G), trap: 'divided by the weight mg instead of the mass' },
      { value: (F * G) / m, trap: 'multiplied by g as well: a = F/m needs no g' },
      { value: F / (m * m), trap: 'divided by the mass twice' },
      { value: F, trap: 'quoted the force: the question asks for the acceleration' },
      { value: (F / m) * 2, trap: 'doubled the acceleration' },
      { value: (F / m) / 2, trap: 'halved: a = F/m, with no ½ (that belongs to ½at²)' },
    ]),
    `$F = ma$, so $a = \\frac{F}{m} = \\frac{${F}}{${m}} = ${num(a)}$ m s$^{-2}$.`,
    'a = F/m: divide the resultant force by the mass (in kg), not by the weight.',
    ['newton', 'F = ma'], { ask: 'fma-a', F, m });
  }
  if (ask === 'F') {
    const stem = `${obj.charAt(0).toUpperCase() + obj.slice(1)} of mass ${q(m, U.kg)} accelerates at ${q(a, U.a)}. Find the resultant force acting on it.`;
    return finish(stem, X(F), U.N, physOptions(rng, X(F), U.N, [
      { value: m / a, trap: 'divided instead of multiplying: F = ma' },
      { value: m * G * a, trap: 'used the weight mg instead of the mass' },
    ], [
      { value: a / m, trap: 'divided the wrong way round' },
      { value: m * a * a, trap: 'squared the acceleration' },
      { value: (m * a) / G, trap: 'divided by g as well: F = ma needs no g' },
      { value: m * G, trap: 'gave the weight mg instead of the resultant force ma' },
      { value: m, trap: 'quoted the mass: the question asks for the force' },
      { value: m * a * 0.5, trap: 'halved: F = ma, with no ½ (that belongs to ½at²)' },
    ]),
    `$F = ma = ${m} \\times ${num(a)} = ${F}$ N.`,
    'F = ma multiplies mass (kg) by acceleration; do not use the weight in place of the mass.',
    ['newton', 'F = ma'], { ask: 'fma-F', m, a });
  }
  const stem = `A resultant force of ${q(F, U.N)} gives ${obj} an acceleration of ${q(a, U.a)}. Find the mass of ${obj.replace(/^a /, 'the ')}.`;
  return finish(stem, X(m), U.kg, physOptions(rng, X(m), U.kg, [
    { value: F * a, trap: 'multiplied instead of dividing: m = F/a' },
    { value: a / F, trap: 'divided the wrong way round' },
  ], [
    { value: F / (a * G), trap: 'divided by g as well (confused mass with weight)' },
    { value: F * G / a, trap: 'found the weight F g/a instead of the mass' },
    { value: F / (a * a), trap: 'divided by the acceleration twice' },
    { value: F, trap: 'quoted the force: the question asks for the mass' },
    { value: a * a, trap: 'squared the acceleration instead of dividing the force by it' },
  ]),
  `$F = ma$, so $m = \\frac{F}{a} = \\frac{${F}}{${num(a)}} = ${m}$ kg.`,
  'm = F/a; the answer is a mass in kg (no factor of g involved).',
  ['newton', 'F = ma'], { ask: 'fma-m', F, a });
}

function weight(rng: RNG): Generated | null {
  const fromWeight = rng.bool(0.35);
  const m = rng.pick([0.2, 0.5, 1.5, 2, 5, 8, 12, 25, 60, 75, 80, 300, 1200]);
  const W = m * G;
  const obj = m >= 50 && m < 100 ? 'a person' : m >= 100 ? 'a car' : 'an object';
  if (fromWeight) {
    const stem = `On Earth ${obj} has a weight of ${q(W, U.N)}. ${G_NOTE} Find its mass.`;
    return finish(stem, X(m), U.kg, physOptions(rng, X(m), U.kg, [
      { value: W, trap: 'quoted the weight as the mass: weight = mass × g' },
      { value: W * G, trap: 'multiplied by g instead of dividing' },
    ], [
      // the g = 9.8 twin sits 2% from the answer: as a fixture it flags the answer pair, so use it sparingly
      { value: rng.bool(0.3) ? W / 9.8 : null, trap: 'used g = 9.8 instead of the stated 10' },
      { value: W / 100, trap: 'divided by g² (or slipped a power of ten)' },
      { value: W - G, trap: 'subtracted g instead of dividing by it' },
      { value: (W - G) / G, trap: 'subtracted g as well as dividing by it' },
      { value: (W + G) / G, trap: 'added g before dividing by it' },
      { value: W / (2 * G), trap: 'halved as well as dividing by g' },
      // the whole question is a factor of g, so this option list may span two powers of ten
    ], undefined, 120),
    `$W = mg$, so $m = \\frac{W}{g} = \\frac{${W}}{10} = ${num(m)}$ kg.`,
    'Weight is a force (N) and mass is in kg: m = W/g, not W itself.',
    ['newton', 'weight'], { ask: 'mass-from-weight', W });
  }
  const stem = `${obj.charAt(0).toUpperCase() + obj.slice(1)} has a mass of ${q(m, U.kg)}. ${G_NOTE} Find ${obj === 'a person' ? 'their' : 'its'} weight.`;
  return finish(stem, X(W), U.N, physOptions(rng, X(W), U.N, [
    { value: m, trap: 'quoted the mass as the weight: W = mg' },
    { value: m * G * G, trap: 'multiplied by g twice' },
  ], [
    { value: rng.bool(0.4) ? m * 9.8 : null, trap: 'used g = 9.8 instead of the stated 10' },
    { value: m / G, trap: 'divided by g instead of multiplying' },
    { value: m + G, trap: 'added g instead of multiplying' },
    { value: (m + G) * G, trap: 'added g to the mass before multiplying by g' },
    { value: m * (G + 1), trap: 'added the mass to the weight' },
    { value: (m * G) / 2, trap: 'halved: $W = mg$ has no ½' },
  ], undefined, 120),
  `$W = mg = ${num(m)} \\times 10 = ${num(W)}$ N.`,
  'Weight = mg (newtons); the mass in kg is not the weight.',
  ['newton', 'weight'], { ask: 'weight', m });
}

// ------------------------------------------------------------------------------------------ level 2

function twoForces(rng: RNG): Generated | null {
  const m = rng.pick([2, 4, 5, 8, 10, 12, 20, 25, 40, 50]);
  const a = rng.pick([0.5, 1, 1.5, 2, 2.5, 3, 4, 5]);
  const net = m * a;
  const F2 = rng.pick([2, 4, 5, 6, 8, 10, 12, 15, 20, 30, 40, 50]);
  const F1 = net + F2;
  if (!Number.isInteger(net) || F1 > 500) return null;
  const obj = rng.pick(['A box', 'A sledge', 'A crate', 'A trolley']);
  const stem = `${obj} of mass ${q(m, U.kg)} is pulled along a horizontal floor by a horizontal force of ${q(F1, U.N)}. A resistive force of ${q(F2, U.N)} opposes the motion. Find the acceleration of ${obj.toLowerCase().replace(/^a /, 'the ')}.`;
  return finish(stem, X(a), U.a, physOptions(rng, X(a), U.a, [
    { value: (F1 + F2) / m, trap: 'added the two forces: they act in opposite directions, so subtract' },
    { value: F1 / m, trap: 'ignored the resistive force' },
  ], [
    { value: net, trap: 'found the resultant force but forgot to divide by the mass' },
    { value: (F1 - F2) * m, trap: 'multiplied the resultant by the mass instead of dividing' },
    { value: (F1 - F2) / (m * G), trap: 'divided by the weight mg instead of the mass' },
    { value: F2 / m, trap: 'used the resistive force instead of the resultant' },
    { value: (F1 - F2) / (F1 + F2), trap: 'divided by the total force instead of by the mass' },
    { value: (F1 - F2) / (2 * m), trap: 'halved: the whole resultant accelerates the whole mass' },
    { value: (F1 + F2) / (2 * m), trap: 'used the average of the two forces as the resultant' },
  ]),
  `Resultant $= ${F1} - ${F2} = ${net}$ N, so $a = \\frac{${net}}{${m}} = ${num(a)}$ m s$^{-2}$.`,
  'Find the resultant first (forces in opposite directions subtract), then divide by the mass.',
  ['newton', 'resultant', 'F = ma'], { ask: 'two-forces', F1, F2, m });
}

function drivingForce(rng: RNG): Generated | null {
  const m = rng.pick([600, 800, 1000, 1200, 1500, 2000]);
  const a = rng.pick([0.5, 1, 1.5, 2, 2.5, 3]);
  const R = rng.pick([200, 300, 400, 500, 600, 800, 1000]);
  const F = m * a + R;
  const askR = rng.bool(0.35);
  const veh = rng.pick(['A car', 'A van', 'A motorboat']);
  if (askR) {
    const stem = `${veh} of mass ${q(m, U.kg)} has a driving force of ${q(F, U.N)} and accelerates at ${q(a, U.a)}. Find the total resistive force acting on it.`;
    return finish(stem, X(R), U.N, physOptions(rng, X(R), U.N, [
      { value: F + m * a, trap: 'added ma instead of subtracting: resistance = driving force − ma' },
      { value: m * a, trap: 'found the resultant force ma, not the resistance' },
    ], [
      { value: F / a - m > 0 ? F / a - m : null, trap: 'divided the force by a before subtracting the mass' },
      { value: F - m, trap: 'subtracted the mass instead of ma' },
      { value: F - m * G, trap: 'subtracted the weight instead of ma' },
      { value: F - 2 * m * a, trap: 'subtracted ma twice (once for the car and once again for the resultant)' },
      { value: (F - m * a) / G, trap: 'divided by g as well' },
    ]),
    `Resultant $= ma = ${m} \\times ${num(a)} = ${m * a}$ N, so resistance $= ${F} - ${m * a} = ${R}$ N.`,
    'Driving force − resistance = ma; the resistance is what is left after ma is subtracted from the driving force.',
    ['newton', 'resultant', 'resistance'], { ask: 'resistance', F, m, a });
  }
  const stem = `${veh} of mass ${q(m, U.kg)} accelerates at ${q(a, U.a)} against a total resistive force of ${q(R, U.N)}. Find the driving force.`;
  return finish(stem, X(F), U.N, physOptions(rng, X(F), U.N, [
    { value: m * a, trap: 'ignored the resistance: the driving force must supply ma and overcome R' },
    { value: m * a - R > 0 ? m * a - R : null, trap: 'subtracted the resistance instead of adding it' },
  ], [
    { value: R, trap: 'took the driving force equal to the resistance (that is constant speed, not acceleration)' },
    { value: (m + R) * a, trap: 'added R to the mass before multiplying by a' },
    { value: m * G * a + R, trap: 'used the weight instead of the mass in ma' },
    { value: m * a + 2 * R, trap: 'counted the resistance twice' },
    { value: (m * a + R) * 2, trap: 'doubled the driving force' },
  ]),
  `$F - R = ma$, so $F = ma + R = ${m} \\times ${num(a)} + ${R} = ${m * a} + ${R} = ${F}$ N.`,
  'The resultant (ma) is driving force minus resistance, so the driving force is ma + R.',
  ['newton', 'resultant', 'driving force'], { ask: 'driving-force', m, a, R });
}

// ------------------------------------------------------------------------------------------ level 3

const MU = [0.1, 0.2, 0.25, 0.4, 0.5];
const MASSES = [2, 4, 5, 8, 10, 12, 20, 40, 50];

function frictionDecel(rng: RNG): Generated | null {
  const mu = rng.pick(MU);
  const m = rng.pick(MASSES);
  const a = mu * G;
  const askMu = rng.bool(0.3);
  const obj = rng.pick(['A block', 'A puck', 'A book', 'A wooden block']);
  if (askMu) {
    const stem = `${obj} of mass ${q(m, U.kg)} slides across a rough horizontal floor and decelerates uniformly at ${q(a, U.a)}. ${G_NOTE} Find the coefficient of friction between ${obj.toLowerCase().replace(/^a /, 'the ')} and the floor.`;
    // A coefficient of friction is a dimensionless number below 1, so an option bigger than 1 is
    // eliminated without doing any physics. Exactly one is offered — one of the three routes that
    // invert or drop the division by g — and every other distractor still looks like a coefficient.
    const overOne = rng.pick<Cand>([
      { value: G / a, trap: 'divided the wrong way round: μ = a/g' },
      { value: a, trap: 'quoted the deceleration as μ' },
      { value: (m * a) / G, trap: 'used the friction force ma in place of the acceleration: the mass cancels' },
    ]);
    return finish(stem, X(mu), undefined, physOptions(rng, X(mu), undefined, [
      overOne,
      { value: (G - a) / G, trap: 'used (g − a)/g instead of a/g' },
    ], [
      { value: a / (m * G), trap: 'divided by the weight mg instead of by g: the mass cancels' },
      { value: a / (G * G), trap: 'divided by g twice' },
      { value: mu / 2, trap: 'halved: there is no ½ in $F = \\mu R$' },
      { value: 2 * mu < 1 ? 2 * mu : null, trap: 'doubled the deceleration before dividing by g' },
    ], (v) => v < 1 || Math.abs(v - (overOne.value as number)) < 1e-12),
    `Friction $\\mu mg$ is the only horizontal force, so $\\mu mg = ma$ and $\\mu = \\frac{a}{g} = \\frac{${num(a)}}{10} = ${num(mu)}$.`,
    'On a horizontal surface the sliding deceleration is μg, so μ = a/g; the mass cancels.',
    ['friction', 'coefficient'], { ask: 'mu-from-decel', a, m });
  }
  const stem = `${obj} of mass ${q(m, U.kg)} slides across a rough horizontal floor. The coefficient of friction is $${num(mu)}$. ${G_NOTE} Find the deceleration of ${obj.toLowerCase().replace(/^a /, 'the ')}.`;
  return finish(stem, X(a), U.a, physOptions(rng, X(a), U.a, [
    { value: mu * m * G, trap: 'found the friction force μmg (in N), not the deceleration' },
    { value: mu * m, trap: 'forgot g: used μm' },
  ], [
    { value: mu, trap: 'quoted μ as the deceleration' },
    { value: mu * 9.8, trap: 'used g = 9.8 instead of the stated 10' },
    { value: G, trap: 'used g itself: the deceleration is μg' },
    { value: (mu * G) / m, trap: 'divided μg by the mass as well (the mass has already cancelled)' },
  ]),
  `$R = mg = ${m * G}$ N, friction $= \\mu R = ${num(mu)} \\times ${m * G} = ${num(mu * m * G)}$ N, so $a = \\frac{${num(mu * m * G)}}{${m}} = ${num(a)}$ m s$^{-2}$ (i.e. $\\mu g$).`,
  'Friction μmg divided by m gives μg: the deceleration does not depend on the mass.',
  ['friction', 'deceleration'], { ask: 'friction-decel', mu, m });
}

function frictionForce(rng: RNG): Generated | null {
  const mu = rng.pick(MU);
  const m = rng.pick(MASSES);
  const fr = mu * m * G;
  const a = rng.pick([0.5, 1, 1.5, 2, 2.5, 3, 4]);
  const accelerate = rng.bool(0.5);
  const obj = rng.pick(['A crate', 'A box', 'A sledge', 'A packing case']);
  const intro = `${obj} of mass ${q(m, U.kg)} rests on a rough horizontal floor; the coefficient of friction is $${num(mu)}$. ${G_NOTE}`;
  if (accelerate) {
    const F = fr + m * a;
    if (!Number.isInteger(F * 2)) return null;
    const stem = `${intro} Find the horizontal force needed to make it accelerate at ${q(a, U.a)}.`;
    return finish(stem, X(F), U.N, physOptions(rng, X(F), U.N, [
      { value: m * a, trap: 'ignored friction: the force must also overcome μmg' },
      { value: fr, trap: 'found only the friction force: that gives constant speed, not acceleration' },
    ], [
      { value: m * a - fr > 0 ? m * a - fr : null, trap: 'subtracted friction from ma instead of adding' },
      { value: mu * m + m * a, trap: 'forgot g in the friction term' },
      { value: m * G + m * a, trap: 'used the whole weight mg as the friction force (forgot μ)' },
      { value: (mu + a) * m * G, trap: 'multiplied the ma term by g as well' },
      { value: 2 * fr + m * a, trap: 'counted the friction twice' },
      { value: fr + m * a + m * G, trap: 'added the weight of the crate as well' },
    ]),
    `Friction $= \\mu mg = ${num(mu)} \\times ${m * G} = ${num(fr)}$ N. $F - ${num(fr)} = ma = ${m * a}$, so $F = ${num(F)}$ N.`,
    'The pushing force supplies both the friction μmg and the extra ma needed to accelerate.',
    ['friction', 'F = ma'], { ask: 'force-for-accel', mu, m, a });
  }
  const stem = `${intro} Find the horizontal force needed to push it along the floor at a constant speed.`;
  return finish(stem, X(fr), U.N, physOptions(rng, X(fr), U.N, [
    { value: mu * m, trap: 'forgot g: friction is μR with R = mg' },
    { value: m * G, trap: 'used the whole weight as the force' },
  ], [
    { value: m * G / mu, trap: 'divided by μ instead of multiplying' },
    { value: mu * m * 9.8, trap: 'used g = 9.8 instead of the stated 10' },
    { value: mu * m * G * 2, trap: 'doubled the friction' },
    { value: mu * G, trap: 'left out the mass' },
    { value: (mu * m * G) / 2, trap: 'halved: there is no ½ in $F = \\mu R$' },
    { value: mu * mu * m * G, trap: 'applied μ twice' },
  ]),
  `Constant speed means the push equals the friction: $F = \\mu R = \\mu mg = ${num(mu)} \\times ${m} \\times 10 = ${num(fr)}$ N.`,
  'At constant speed the resultant is zero, so the push equals the friction μmg.',
  ['friction', 'constant speed'], { ask: 'friction-force', mu, m });
}

function pushOnRough(rng: RNG): Generated | null {
  const mu = rng.pick(MU);
  const m = rng.pick(MASSES);
  const fr = mu * m * G;
  const a = rng.pick([0.5, 1, 1.5, 2, 2.5, 3, 4, 5]);
  const P = fr + m * a;
  if (!Number.isInteger(P)) return null;
  const obj = rng.pick(['A box', 'A crate', 'A trolley', 'A sledge']);
  const stem = `${obj} of mass ${q(m, U.kg)} is pushed along a rough horizontal floor by a horizontal force of ${q(P, U.N)}. The coefficient of friction is $${num(mu)}$. ${G_NOTE} Find the acceleration.`;
  return finish(stem, X(a), U.a, physOptions(rng, X(a), U.a, [
    { value: P / m, trap: 'ignored friction' },
    { value: (P + fr) / m, trap: 'added the friction instead of subtracting: friction opposes the motion' },
  ], [
    { value: P - fr, trap: 'found the resultant force but did not divide by the mass' },
    { value: (P - mu * m) / m, trap: 'forgot g in the friction term' },
    { value: (P - fr) / (m * G), trap: 'divided by the weight mg instead of the mass' },
    { value: fr / m, trap: 'used the friction force instead of the resultant (that is μg)' },
    { value: (P - fr) / (m * m), trap: 'divided by the mass twice' },
    { value: P - 2 * fr > 0 ? (P - 2 * fr) / m : null, trap: 'subtracted the friction twice' },
  ]),
  `Friction $= \\mu mg = ${num(mu)} \\times ${m * G} = ${num(fr)}$ N. Resultant $= ${P} - ${num(fr)} = ${num(P - fr)}$ N, so $a = \\frac{${num(P - fr)}}{${m}} = ${num(a)}$ m s$^{-2}$.`,
  'Friction opposes the motion: subtract μmg from the push before dividing by the mass.',
  ['friction', 'F = ma'], { ask: 'push-accel', mu, m, P });
}

// ------------------------------------------------------------------------------------------ level 4

function slope(rng: RNG): Generated | null {
  const theta = rng.bool(0.7) ? 30 : 60;
  const sin = exactSin(theta), cos = exactCos(theta);
  const m = rng.pick([2, 4, 5, 6, 8, 10, 12, 20]);
  const ask = rng.pick(['accel', 'hold', 'normal', 'speed'] as const);
  const obj = rng.pick(['A block', 'A crate', 'A sledge', 'A particle']);
  const the = obj.toLowerCase().replace(/^a /, 'the ');
  const g = E(G);
  const mg = E(m * G);
  if (ask === 'accel') {
    const a = g.mul(sin);
    const stem = `${obj} is released from rest on a smooth plane inclined at $${theta}^{\\circ}$ to the horizontal. ${G_NOTE} Find its acceleration down the slope.`;
    return finish(stem, a, U.a, physOptions(rng, a, U.a, [
      { value: g.mul(cos), trap: 'used cos instead of sin: the component of g along the slope is g sin θ' },
      { value: g, trap: 'used g itself: only the component along the slope accelerates the block' },
    ], [
      { value: mg.mul(sin), trap: 'found the force mg sin θ (in N) rather than the acceleration' },
      { value: g.mul(sin).div(cos), trap: 'used tan θ' },
      { value: sin, trap: 'forgot g: the acceleration is g sin θ' },
      { value: g.mul(sin).div(E(G)).mul(sin), trap: 'resolved twice: used g sin²θ' },
      { value: g.mul(sin).mulRat(X(0.5).toRat()), trap: 'slipped in the ½ from ½at²: the acceleration is g sin θ' },
      { value: g.mul(sin).add(g.mul(cos)), trap: 'added both components instead of resolving along the slope' },
    ]),
    `Along the slope: $mg\\sin ${theta}^{\\circ} = ma$, so $a = g\\sin ${theta}^{\\circ} = 10 \\times ${sin.toLatex()} = ${a.toLatex()}$ m s$^{-2}$ (independent of the mass).`,
    'The component of weight along a slope is mg sin θ, so a = g sin θ; cos θ belongs to the normal reaction.',
    ['slope', 'components', 'acceleration'], { ask: 'slope-accel', theta });
  }
  if (ask === 'hold') {
    const F = mg.mul(sin);
    const stem = `${obj} of mass ${q(m, U.kg)} rests on a smooth plane inclined at $${theta}^{\\circ}$ to the horizontal, held at rest by a force parallel to the slope. ${G_NOTE} Find the magnitude of this force.`;
    return finish(stem, F, U.N, physOptions(rng, F, U.N, [
      { value: mg.mul(cos), trap: 'used cos instead of sin: the component along the slope is mg sin θ' },
      { value: mg, trap: 'used the whole weight: only its component along the slope needs balancing' },
    ], [
      { value: mg.mul(sin).div(cos), trap: 'used tan θ' },
      { value: E(m).mul(sin), trap: 'forgot g' },
      { value: mg.mul(sin).mulRat(X(0.5).toRat()), trap: 'halved the component' },
      { value: mg.mul(sin).mul(sin), trap: 'resolved twice: used mg sin²θ' },
      { value: mg.mul(sin).add(mg.mul(cos)), trap: 'added both components instead of resolving along the slope' },
    ]),
    `Resolve along the slope: $F = mg\\sin ${theta}^{\\circ} = ${m * G} \\times ${sin.toLatex()} = ${F.toLatex()}$ N.`,
    'To hold a block on a smooth slope the force balances the component of weight along the slope, mg sin θ.',
    ['slope', 'components', 'equilibrium'], { ask: 'slope-hold', theta, m });
  }
  if (ask === 'normal') {
    const R = mg.mul(cos);
    const stem = `${obj} of mass ${q(m, U.kg)} rests on a smooth plane inclined at $${theta}^{\\circ}$ to the horizontal, held by a force parallel to the slope. ${G_NOTE} Find the normal reaction of the plane on ${the}.`;
    return finish(stem, R, U.N, physOptions(rng, R, U.N, [
      { value: mg, trap: 'took the normal reaction equal to the weight: on a slope it is mg cos θ' },
      { value: mg.mul(sin), trap: 'used sin instead of cos' },
    ], [
      { value: E(m).mul(cos), trap: 'forgot g' },
      { value: mg.div(cos), trap: 'divided by cos θ instead of multiplying' },
      { value: mg.mul(cos).mulRat(X(0.5).toRat()), trap: 'halved the component' },
      { value: mg.mul(cos).mul(cos), trap: 'resolved twice: used mg cos²θ' },
      { value: mg.mul(cos).add(mg.mul(sin)), trap: 'added both components instead of resolving perpendicular to the slope' },
    ]),
    `Resolve perpendicular to the slope: $R = mg\\cos ${theta}^{\\circ} = ${m * G} \\times ${cos.toLatex()} = ${R.toLatex()}$ N.`,
    'The normal reaction on a slope is mg cos θ, less than the weight; mg sin θ is the component along the slope.',
    ['slope', 'components', 'normal reaction'], { ask: 'slope-normal', theta, m });
  }
  const t = rng.pick([2, 3, 4, 5, 6]);
  const a = g.mul(sin);
  const v = a.mulRat(t);
  const stem = `${obj} is released from rest on a smooth plane inclined at $${theta}^{\\circ}$ to the horizontal. ${G_NOTE} Find its speed after ${q(t, U.t)}.`;
  return finish(stem, v, U.v, physOptions(rng, v, U.v, [
    { value: E(G * t), trap: 'used g instead of g sin θ (as if falling freely)' },
    { value: g.mul(cos).mulRat(t), trap: 'used cos instead of sin for the component along the slope' },
  ], [
    { value: a.mulRat(t * t).mulRat(X(0.5).toRat()), trap: 'found the distance ½at² instead of the speed' },
    { value: a, trap: 'quoted the acceleration' },
    { value: sin.mulRat(t), trap: 'forgot g: the acceleration is g sin θ' },
    { value: a.mulRat(t).mulRat(X(0.5).toRat()), trap: 'used ½at, the average speed, instead of the final speed' },
  ]),
  `$a = g\\sin ${theta}^{\\circ} = ${a.toLatex()}$ m s$^{-2}$, so after $${t}$ s, $v = at = ${a.toLatex()} \\times ${t} = ${v.toLatex()}$ m s$^{-1}$.`,
  'On a smooth slope a = g sin θ; then v = at from rest (not gt).',
  ['slope', 'components', 'suvat'], { ask: 'slope-speed', theta, t });
}

// ------------------------------------------------------------------------------------------ level 5

const ATWOOD: [number, number][] = [];
for (let m1 = 2; m1 <= 15; m1++) {
  for (let m2 = 1; m2 < m1; m2++) {
    const a = ((m1 - m2) * G) / (m1 + m2);
    const T = (2 * m1 * m2 * G) / (m1 + m2);
    if (Number.isInteger(a * 2) && Number.isInteger(T * 2) && a <= 8) ATWOOD.push([m1, m2]);
  }
}

function atwood(rng: RNG): Generated | null {
  const [m1, m2] = rng.pick(ATWOOD);
  const a = ((m1 - m2) * G) / (m1 + m2);
  const T = (2 * m1 * m2 * G) / (m1 + m2);
  const askT = rng.bool(0.5);
  const intro = `Particles of mass ${q(m1, U.kg)} and ${q(m2, U.kg)} are connected by a light inextensible string passing over a smooth fixed pulley, and the system is released from rest. ${G_NOTE}`;
  if (askT) {
    return finish(`${intro} Find the tension in the string.`, X(T), U.N, physOptions(rng, X(T), U.N, [
      { value: m1 * G, trap: 'took the tension equal to the weight of the heavier particle (it is accelerating, so T < m₁g)' },
      { value: m2 * G, trap: 'took the tension equal to the weight of the lighter particle (it is accelerating upward, so T > m₂g)' },
    ], [
      { value: (m1 - m2) * G, trap: 'used the difference of the weights' },
      { value: m2 * (G - a), trap: 'sign error in m₂(g + a) for the rising particle' },
      { value: m1 * (G + a), trap: 'sign error in m₁(g − a) for the falling particle' },
      { value: (m1 + m2) * G / 2, trap: 'averaged the two weights' },
    ]),
    `Whole system: $a = \\frac{(${m1} - ${m2}) \\times 10}{${m1} + ${m2}} = ${num(a)}$ m s$^{-2}$. Lighter particle: $T - ${m2 * G} = ${m2} \\times ${num(a)}$, so $T = ${num(T)}$ N.`,
    'The tension lies strictly between the two weights: T = m₂(g + a) = m₁(g − a), never equal to either weight while the system accelerates.',
    ['connected particles', 'pulley', 'tension'], { ask: 'atwood-T', m1, m2 });
  }
  // Nothing released from rest under gravity accelerates faster than g, so an option above g is a
  // free elimination: the undivided net force (a value in newtons) is not offered here at all.
  return finish(`${intro} Find the acceleration of the system.`, X(a), U.a, physOptions(rng, X(a), U.a, [
    { value: ((m1 - m2) * G) / m1, trap: 'divided the net force by the heavier mass only: the whole system (m₁ + m₂) accelerates' },
    { value: ((m1 - m2) * G) / m2, trap: 'divided the net force by the lighter mass only' },
  ], [
    { value: G, trap: 'used g: the heavier particle does not fall freely' },
    { value: (m1 * G) / (m1 + m2), trap: 'forgot the weight of the lighter particle in the net force' },
    { value: (m2 * G) / (m1 + m2), trap: 'used the lighter weight as the net force' },
    { value: (m1 - m2) / (m1 + m2), trap: 'forgot g (divided the net force by the total weight)' },
    { value: ((m1 - m2) * G) / (m1 * m2), trap: 'multiplied the masses instead of adding them' },
    { value: ((m1 - m2) * G) / (2 * (m1 + m2)), trap: 'gave each particle half the net force: the whole net force accelerates the whole mass' },
    { value: ((m1 - m2) * G) / (m1 + 2 * m2), trap: 'counted the lighter particle twice in the total mass' },
  ], (v) => v <= G + 1e-9),
  `Net force on the system $= (${m1} - ${m2}) \\times 10 = ${(m1 - m2) * G}$ N, total mass $${m1 + m2}$ kg, so $a = \\frac{${(m1 - m2) * G}}{${m1 + m2}} = ${num(a)}$ m s$^{-2}$.`,
  'Treat the system as a whole: a = (m₁ − m₂)g/(m₁ + m₂); the net force acts on both masses.',
  ['connected particles', 'pulley', 'acceleration'], { ask: 'atwood-a', m1, m2 });
}

const TABLE: [number, number][] = [];
for (let m1 = 1; m1 <= 12; m1++) {
  for (let m2 = 1; m2 <= 12; m2++) {
    const a = (m2 * G) / (m1 + m2);
    const T = (m1 * m2 * G) / (m1 + m2);
    if (Number.isInteger(a * 2) && Number.isInteger(T * 2)) TABLE.push([m1, m2]);
  }
}

function tablePulley(rng: RNG): Generated | null {
  const [m1, m2] = rng.pick(TABLE);
  const a = (m2 * G) / (m1 + m2);
  const T = (m1 * m2 * G) / (m1 + m2);
  const askT = rng.bool(0.5);
  const intro = `A particle of mass ${q(m1, U.kg)} rests on a smooth horizontal table. It is connected by a light inextensible string passing over a smooth pulley at the edge of the table to a particle of mass ${q(m2, U.kg)} hanging freely. The system is released from rest. ${G_NOTE}`;
  if (askT) {
    return finish(`${intro} Find the tension in the string.`, X(T), U.N, physOptions(rng, X(T), U.N, [
      { value: m2 * G, trap: 'took the tension equal to the weight of the hanging particle (it accelerates downward, so T < m₂g)' },
      { value: m1 * G, trap: 'used the weight of the particle on the table (its weight is balanced by the table)' },
    ], [
      { value: m2 * (G + a), trap: 'sign error: for the hanging particle m₂g − T = m₂a' },
      { value: m2 * a, trap: 'used the hanging mass in T = ma: the string pulls the particle on the table' },
      { value: (m1 * m2) / (m1 + m2), trap: 'forgot g' },
      { value: m1 > m2 ? (m1 * m2 * G) / (m1 - m2) : null, trap: 'used the difference of the masses instead of their sum' },
      { value: m1 * G * m2, trap: 'multiplied the two weights' },
      { value: (m1 * m2 * G) / (m1 + 2 * m2), trap: 'counted the hanging particle twice in the total mass' },
    ]),
    `System: $a = \\frac{${m2} \\times 10}{${m1} + ${m2}} = ${num(a)}$ m s$^{-2}$. Table particle: $T = m_1 a = ${m1} \\times ${num(a)} = ${num(T)}$ N.`,
    'Only the hanging weight drives the system, but the whole mass accelerates; then T = m₁a for the particle on the smooth table.',
    ['connected particles', 'pulley', 'tension'], { ask: 'table-T', m1, m2 });
  }
  return finish(`${intro} Find the acceleration of the system.`, X(a), U.a, physOptions(rng, X(a), U.a, [
    { value: (m2 * G) / m1, trap: 'divided the hanging weight by the table mass only: both particles accelerate' },
    { value: G, trap: 'used g: the hanging particle does not fall freely because of the string' },
  ], [
    { value: m2 / (m1 + m2), trap: 'forgot g (divided the hanging mass by the total mass)' },
    { value: (m1 * G) / (m1 + m2), trap: 'used the wrong weight as the driving force' },
    { value: (m2 * G) / (m1 * m2), trap: 'multiplied the masses instead of adding them' },
    { value: (m2 * G) / (m1 + 2 * m2), trap: 'counted the hanging particle twice in the total mass' },
    { value: (m2 * G) / (2 * (m1 + m2)), trap: 'gave each particle half the driving force: the whole of it accelerates the whole mass' },
    { value: (2 * m2 * G) / (m1 + m2), trap: 'doubled the acceleration' },
    { value: (m2 * G) / (m1 + m2 / 2), trap: 'counted only half of the hanging particle in the total mass' },
  ], (v) => v <= G + 1e-9),
  `The only unbalanced force is the hanging weight $${m2 * G}$ N acting on a total mass of $${m1 + m2}$ kg: $a = \\frac{${m2 * G}}{${m1 + m2}} = ${num(a)}$ m s$^{-2}$.`,
  'Driving force is the hanging weight m₂g; it accelerates the total mass m₁ + m₂, so a = m₂g/(m₁ + m₂).',
  ['connected particles', 'pulley', 'acceleration'], { ask: 'table-a', m1, m2 });
}

function tow(rng: RNG): Generated | null {
  // Mass pairs with m/(M + m) a short decimal, and resistances proportional to mass, so that
  // "ignored the resistances", "forgot the trailer's resistance" and the rest are clean numbers.
  const [M, m] = rng.pick([[800, 200], [1200, 400], [1500, 500], [1200, 800], [1000, 1000], [1500, 1000], [800, 800], [1000, 600], [800, 1200]]);
  const a = rng.pick([0.5, 1, 1.5, 2, 2.5, 3]);
  // Most draws give the car and the trailer a resistance. Without them every named mistake overshoots
  // the tow-bar tension ma (F, Ma and mg are all larger, because a < g), so the answer is the smallest
  // option in almost every question; "forgot the trailer's resistance" is the mistake that undershoots.
  const rough = rng.bool(0.75);
  const c = rng.pick([0.25, 0.5, 0.75, 1]);
  const RM = rough ? M * c : 0;
  const Rm = rough ? m * c : 0;
  const F = (M + m) * a + RM + Rm;
  const T = m * a + Rm;
  const askT = rng.bool(0.6);
  const intro = rough
    ? `A car of mass ${q(M, U.kg)} tows a trailer of mass ${q(m, U.kg)} along a straight level road with a driving force of ${q(F, U.N)}. The resistances to motion are ${q(RM, U.N)} on the car and ${q(Rm, U.N)} on the trailer.`
    : `A car of mass ${q(M, U.kg)} tows a trailer of mass ${q(m, U.kg)} along a straight level road with a driving force of ${q(F, U.N)}. Resistances are negligible.`;
  const params = { M, m, F, RM, Rm };
  if (askT) {
    return finish(`${intro} Find the tension in the tow bar.`, X(T), U.N, physOptions(rng, X(T), U.N, [
      { value: F, trap: 'took the tension equal to the driving force: the tow bar only has to move the trailer' },
      { value: M * a + Rm, trap: 'used the car\'s mass instead of the trailer\'s' },
    ], [
      { value: rough ? m * a : null, trap: 'forgot the resistance on the trailer: T − R = ma' },
      { value: rough ? Rm : null, trap: 'quoted the resistance on the trailer' },
      { value: rough ? m * a + RM : null, trap: 'used the car\'s resistance instead of the trailer\'s' },
      { value: rough ? F - RM : null, trap: 'subtracted only the car\'s resistance from the driving force' },
      { value: (F * m) / M, trap: 'shared the force in the ratio of the masses the wrong way' },
      { value: m * G, trap: 'used the weight of the trailer' },
      { value: (m * a) / 2, trap: 'halved: the trailer needs the whole of ma' },
    ]),
    `Whole system: $a = \\frac{${F}${rough ? ` - ${RM} - ${Rm}` : ''}}{${M + m}} = ${num(a)}$ m s$^{-2}$. Trailer alone: $T ${rough ? `- ${Rm} ` : ''}= ma = ${m} \\times ${num(a)} = ${m * a}$, so $T = ${T}$ N.`,
    'Find a from the whole system (driving force minus all resistances, over the total mass), then look at the trailer alone: T − R = ma.',
    ['connected particles', 'towing', 'tension'], { ask: 'tow-T', ...params });
  }
  return finish(`${intro} Find the acceleration.`, X(a), U.a, physOptions(rng, X(a), U.a, [
    { value: (F - RM - Rm) / M, trap: 'divided by the mass of the car only: the trailer accelerates too' },
    { value: (F - RM - Rm) / m, trap: 'divided by the mass of the trailer only' },
  ], [
    { value: rough ? F / (M + m) : null, trap: 'ignored the resistances' },
    { value: rough ? (F - RM) / (M + m) : null, trap: 'forgot the resistance on the trailer' },
    { value: rough ? (RM + Rm) / (M + m) : null, trap: 'used the resistance as the resultant force' },
    { value: rough ? (F - RM - 2 * Rm) / (M + m) : null, trap: 'subtracted the trailer\'s resistance twice' },
    { value: (F - RM - Rm) / ((M + m) * G), trap: 'divided by the total weight instead of the total mass' },
    { value: (F + RM + Rm) / (M + m), trap: 'added the resistances instead of subtracting them' },
    { value: M > m ? (F - RM - Rm) / (M - m) : null, trap: 'subtracted the masses instead of adding them' },
  ]),
  `Whole system: $F - R = (M + m)a$, so $a = \\frac{${F}${rough ? ` - ${RM} - ${Rm}` : ''}}{${M} + ${m}} = \\frac{${(M + m) * a}}{${M + m}} = ${num(a)}$ m s$^{-2}$.`,
  'The driving force less every resistance accelerates the car and the trailer together: divide by the total mass.',
  ['connected particles', 'towing', 'acceleration'], { ask: 'tow-a', ...params });
}

function lift(rng: RNG): Generated | null {
  const m = rng.pick([40, 50, 60, 70, 80]);
  const a = rng.pick([0.5, 1, 1.5, 2, 2.5, 3, 4, 5]);
  const up = rng.bool(0.5);
  const signedA = up ? a : -a;
  const R = m * (G + signedA);
  const cable = rng.bool(0.3);
  const motion = rng.pick(up
    ? ['accelerating upwards', 'moving downwards and slowing down']
    : ['accelerating downwards', 'moving upwards and slowing down']);
  if (cable) {
    const M = rng.pick([400, 500, 600, 800]);
    const T = (M + m) * (G + signedA);
    const stem = `A lift of mass ${q(M, U.kg)} carries a passenger of mass ${q(m, U.kg)}. The lift is ${motion} at ${q(a, U.a)}. ${G_NOTE} Find the tension in the lift cable.`;
    const W = (M + m) * G;
    return finish(stem, X(T), U.N, physOptions(rng, X(T), U.N, [
      { value: W, trap: 'took the tension equal to the total weight: that is only true at constant velocity' },
      { value: (M + m) * (G - signedA), trap: 'sign error: T − W = (M + m)a with a positive upwards' },
    ], [
      { value: M * (G + signedA), trap: 'forgot the passenger' },
      { value: (M + m) * a, trap: 'found only the resultant force (M + m)a' },
      { value: (M + m) * (9.8 + signedA), trap: 'used g = 9.8 instead of the stated 10' },
      { value: (M + m) * G + (M + m) * a * G, trap: 'multiplied the (M + m)a term by g as well' },
      { value: ((M + m) * (G + signedA)) / G, trap: 'divided by g: the tension is a force in newtons' },
      { value: m * (G + signedA), trap: 'used the passenger alone instead of the whole lift' },
    ]),
    `Upwards positive, acceleration $${num(signedA)}$ m s$^{-2}$: $T - ${W} = ${M + m} \\times (${num(signedA)})$, so $T = ${M + m} \\times ${num(G + signedA)} = ${T}$ N.`,
    'Direction of acceleration, not of motion, decides the sign: T = (total mass)(g + a) with a positive upwards.',
    ['lift', 'tension', 'F = ma'], { ask: 'lift-cable', M, m, a: signedA });
  }
  const stem = `A person of mass ${q(m, U.kg)} stands on weighing scales in a lift that is ${motion} at ${q(a, U.a)}. ${G_NOTE} Find the reading on the scales, in newtons.`;
  return finish(stem, X(R), U.N, physOptions(rng, X(R), U.N, [
    { value: m * G, trap: 'quoted the weight: the reading changes when the lift accelerates' },
    { value: m * (G - signedA), trap: 'sign error: R − mg = ma with a positive upwards (slowing down while moving up means a is downwards)' },
  ], [
    { value: m * a, trap: 'found only the resultant force ma' },
    { value: m, trap: 'quoted the mass as the reading' },
    { value: m * (9.8 + signedA), trap: 'used g = 9.8 instead of the stated 10' },
    { value: m * G + m * a * G, trap: 'multiplied the ma term by g as well' },
    { value: (m * (G + signedA)) / G, trap: 'divided by g: the reading is a force in newtons' },
    { value: m * (G + signedA) + m * G, trap: 'added the weight on top of R = m(g + a)' },
  ]),
  `Upwards positive, the acceleration is $${num(signedA)}$ m s$^{-2}$. $R - mg = ma$: $R = ${m}(10 ${signedA >= 0 ? '+' : '-'} ${num(a)}) = ${m} \\times ${num(G + signedA)} = ${R}$ N.`,
  'Apparent weight R = m(g + a) with a positive upwards; "moving up but slowing down" is a downward acceleration, so R < mg.',
  ['lift', 'apparent weight', 'F = ma'], { ask: 'lift-reading', m, a: signedA });
}

export default defineTemplate({
  id: 'phy.forces.newton',
  module: 'PHY',
  topic: 'forces',
  title: "Newton's laws, weight and friction",
  levels: {
    1: 'F = ma (find F, m or a); W = mg and mass from weight',
    2: 'two forces in a line → acceleration; driving force or resistance from ma and R',
    3: 'friction μR on a horizontal floor: deceleration μg, force for constant speed, acceleration under a push, μ from a deceleration',
    4: 'smooth slope at 30° or 60°: acceleration g sin θ, holding force, normal reaction, speed after t s',
    5: 'connected particles (pulley, table and pulley, car and trailer) and lifts (scale reading, cable tension)',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return pickVariant(rng, [fma, fma, weight]);
        case 2: return pickVariant(rng, [twoForces, drivingForce]);
        case 3: return pickVariant(rng, [frictionDecel, frictionForce, pushOnRough]);
        case 4: return pickVariant(rng, [slope]);
        default: return pickVariant(rng, [atwood, tablePulley, tow, lift, lift]);
      }
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const ans = q.answer.value.toNumber();
    const p = q.params as Record<string, number> & { ask: string };
    const close = (x: number, y: number) => Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(y));
    const rad = (deg: number) => (deg * Math.PI) / 180;
    switch (p.ask) {
      // Newton II residuals with the answer in its slot
      case 'fma-a': return close(p.F, p.m * ans);
      case 'fma-F': return close(ans / p.m, p.a);
      case 'fma-m': return close(p.F / ans, p.a);
      case 'weight': return close(ans / p.m, G);
      case 'mass-from-weight': return close(p.W / ans, G);
      case 'two-forces': return close(p.F1 - p.F2, p.m * ans);
      case 'driving-force': return close(ans - p.R, p.m * p.a);
      case 'resistance': return close(p.F - ans, p.m * p.a);
      // friction: energy route — a block at speed v stops in d = v²/(2a); friction must dissipate ½mv²
      case 'friction-decel': {
        const v = 6, d = (v * v) / (2 * ans);
        return close(p.mu * p.m * G * d, 0.5 * p.m * v * v);
      }
      case 'mu-from-decel': return close(ans * G, p.a);
      case 'friction-force': return close(ans - p.mu * (p.m * G), 0); // push − μR = 0 at constant speed
      case 'force-for-accel': return close(ans - p.mu * p.m * G, p.m * p.a);
      case 'push-accel': return close(p.P - p.mu * p.m * G, p.m * ans);
      // slopes: floating-point trig against the exact surd answer
      case 'slope-accel': { // energy: sliding d = 1 m down the slope, v² = 2 g d sin θ, a = v²/(2d)
        const v2 = 2 * G * 1 * Math.sin(rad(p.theta));
        return Math.abs(ans - v2 / 2) < 1e-9;
      }
      case 'slope-hold': return Math.abs(ans - p.m * G * Math.sin(rad(p.theta))) < 1e-9;
      case 'slope-normal': return Math.abs(ans - p.m * G * Math.cos(rad(p.theta))) < 1e-9;
      case 'slope-speed': { // v² = 2 a s with s = ½ a t²
        const a = G * Math.sin(rad(p.theta));
        const s = 0.5 * a * p.t * p.t;
        return Math.abs(ans - Math.sqrt(2 * a * s)) < 1e-9;
      }
      // connected particles: derive the other unknown from the answer and check the free-body equation not used
      case 'atwood-a': { const T = p.m2 * (G + ans); return close(p.m1 * G - T, p.m1 * ans); }
      case 'atwood-T': { const a = (p.m1 * G - ans) / p.m1; return close(ans - p.m2 * G, p.m2 * a); }
      case 'table-a': { const T = p.m1 * ans; return close(p.m2 * G - T, p.m2 * ans); }
      case 'table-T': { const a = ans / p.m1; return close(p.m2 * G - ans, p.m2 * a); }
      // trailer: T − R_m = m a; substitute the answer and check the car's own equation F − R_M − T = M a
      case 'tow-a': { const T = p.m * ans + p.Rm; return close(p.F - p.RM - T, p.M * ans); }
      case 'tow-T': { const a = (ans - p.Rm) / p.m; return close(p.F - p.RM - ans, p.M * a); }
      case 'lift-reading': return close(ans - p.m * G, p.m * p.a);
      case 'lift-cable': return close(ans - (p.M + p.m) * G, (p.M + p.m) * p.a);
      default: return false;
    }
  },
});
