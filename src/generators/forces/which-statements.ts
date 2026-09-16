import { defineTemplate, retry, type Level } from '../../core/template';
import { E } from '../../core/exact';
import { statementOptions, STATEMENT_COMBOS } from '../../core/options';
import { num, exactSin, exactCos } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * "Which of the following statements are true?" about forces and motion, with numbers (g = 10 m s⁻²).
 * Level 1: constant velocity (box pushed at steady speed, car at steady speed): zero resultant, friction = push,
 *          normal reaction = weight, momentum and kinetic energy values
 * Level 2: box accelerating on a rough floor (friction μR, acceleration with/without friction); a ball at the top
 *          of its flight (velocity zero but acceleration not zero)
 * Level 3: lift accelerating up / down / constant velocity (reading on the scales, resultant force, weight);
 *          box that does not move (friction = push, not μR)
 * Level 4: perfectly inelastic collision (momentum conserved, KE not, common velocity, KE lost, impulse);
 *          block on a smooth slope (normal reaction ≠ weight, a = g sin θ independent of mass)
 * Level 5: lifts described by motion and slowing/speeding (direction of acceleration); collisions with a rebound
 *          where the elastic / inelastic verdict must be computed
 */

const G = 10;
const N = (x: number) => `$${num(x)}\\ \\text{N}$`;
const MS = (x: number) => `$${num(x)}\\ \\text{m s}^{-1}$`;
const MS2 = (x: number) => `$${num(x)}\\ \\text{m s}^{-2}$`;
const KG = (x: number) => `$${num(x)}\\ \\text{kg}$`;
const M = (x: number) => `$${num(x)}\\ \\text{m}$`;
const S = (x: number) => `$${num(x)}\\ \\text{s}$`;
const J = (x: number) => `$${num(x)}\\ \\text{J}$`;
const G_NOTE = 'Take $g = 10\\ \\text{m s}^{-2}$.';

/** One candidate statement: `kind` and `claim` are what verify() re-evaluates. */
interface Stmt { kind: string; claim: number; text: string; truth: boolean }

interface Scenario {
  scenario: string;
  intro: string;
  pool: Stmt[];
  params: Record<string, number>;
  trap: string;
  note: string;
}

const sig = (x: number) => Number(x.toFixed(9));
const eq = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** A numeric statement: half the time it quotes the correct value, otherwise one of the wrong values. */
function numeric(rng: RNG, kind: string, correct: number, wrongs: number[], text: (claim: number) => string): Stmt {
  const ws = wrongs.map(sig).filter((w) => !eq(w, correct) && Number.isFinite(w) && w >= 0);
  const claim = ws.length > 0 && rng.bool(0.5) ? rng.pick(ws) : sig(correct);
  return { kind, claim, text: text(claim), truth: eq(claim, correct) };
}

const bool = (kind: string, text: string, truth: boolean): Stmt => ({ kind, claim: truth ? 1 : 0, text, truth });

// ------------------------------------------------------------------------------------------ scenarios

function boxConstant(rng: RNG): Scenario {
  const m = rng.pick([4, 5, 8, 10, 12, 20, 25, 40]);
  const mu = rng.pick([0.2, 0.25, 0.4, 0.5]);
  const P = sig(mu * m * G);
  const v = rng.pick([0.5, 1, 1.5, 2]);
  return {
    scenario: 'box-constant',
    intro: `A box of mass ${KG(m)} is pushed across a rough horizontal floor by a horizontal force of ${N(P)}. It moves in a straight line at a constant speed of ${MS(v)}. ${G_NOTE}`,
    pool: [
      bool('resultant-zero', 'The resultant force on the box is zero.', true),
      numeric(rng, 'friction-value', P, [P / 2, 2 * P, m * G], (c) => `The friction force on the box is ${N(c)}.`),
      numeric(rng, 'normal-value', m * G, [m, m * G - P], (c) => `The normal reaction of the floor on the box is ${N(c)}.`),
      numeric(rng, 'mu-value', mu, [2 * mu, mu / 2, P / m], (c) => `The coefficient of friction between the box and the floor is $${num(c)}$.`),
      bool('friction-less-than-push', `The friction force is less than ${N(P)}.`, false),
      numeric(rng, 'momentum-value', m * v, [0.5 * m * v * v, 0.5 * m * v], (c) => `The momentum of the box is $${num(c)}\\ \\text{kg m s}^{-1}$.`),
    ],
    params: { m, mu, P, v },
    trap: 'Constant velocity means zero resultant: the friction exactly balances the push, so F = μR gives μ directly.',
    note: `Constant velocity ⇒ resultant zero ⇒ friction $= ${num(P)}$ N and $R = mg = ${m * G}$ N, so $\\mu = ${num(P)}/${m * G} = ${num(mu)}$; momentum $mv = ${num(m * v)}$.`,
  };
}

function carConstant(rng: RNG): Scenario {
  const m = rng.pick([800, 1000, 1200, 1500]);
  const v = rng.pick([10, 12, 15, 20, 25, 30]);
  const D = rng.pick([400, 500, 600, 800, 1000, 1200]);
  return {
    scenario: 'car-constant',
    intro: `A car of mass ${KG(m)} travels along a straight level road at a constant speed of ${MS(v)}. The driving force is ${N(D)}.`,
    pool: [
      bool('resultant-zero', 'The resultant force on the car is zero.', true),
      numeric(rng, 'resistance-value', D, [D / 2, 2 * D, 0], (c) => `The total resistive force on the car is ${N(c)}.`),
      numeric(rng, 'momentum-value', m * v, [0.5 * m * v * v, 0.5 * m * v], (c) => `The momentum of the car is $${num(c)}\\ \\text{kg m s}^{-1}$.`),
      numeric(rng, 'ke-value', 0.5 * m * v * v, [m * v * v, m * v], (c) => `The kinetic energy of the car is ${J(c)}.`),
      bool('driving-exceeds-resistance', 'The driving force is greater than the total resistive force.', false),
      bool('momentum-constant', 'The momentum of the car is constant.', true),
    ],
    params: { m, v, D },
    trap: 'At constant speed the driving force equals the resistance (zero resultant); momentum is mv and kinetic energy ½mv².',
    note: `Constant speed ⇒ resultant zero ⇒ resistance $= ${D}$ N; $p = mv = ${m * v}$, $E_k = \\tfrac{1}{2}mv^2 = ${0.5 * m * v * v}$ J.`,
  };
}

function ballTop(rng: RNG): Scenario {
  const u = rng.pick([10, 20, 30, 40, 50]);
  const tTop = u / G;
  const H = (u * u) / (2 * G);
  return {
    scenario: 'ball-top',
    intro: `A ball is thrown vertically upwards with speed ${MS(u)}. Ignore air resistance and take $g = 10\\ \\text{m s}^{-2}$. Consider the ball at the highest point of its flight.`,
    pool: [
      bool('top-velocity-zero', 'At the highest point the velocity of the ball is zero.', true),
      bool('top-accel-zero', 'At the highest point the acceleration of the ball is zero.', false),
      bool('top-resultant-zero', 'At the highest point the resultant force on the ball is zero.', false),
      numeric(rng, 'time-top', tTop, [2 * tTop, tTop / 2], (c) => `The ball reaches the highest point ${S(c)} after being thrown.`),
      numeric(rng, 'max-height', H, [2 * H, H / 2], (c) => `The highest point is ${M(c)} above the point of projection.`),
      numeric(rng, 'return-speed', u, [u / 2, 2 * u], (c) => `The ball returns to the point of projection with speed ${MS(c)}.`),
      bool('accel-constant', 'The acceleration of the ball is $10\\ \\text{m s}^{-2}$ downwards throughout the flight.', true),
    ],
    params: { u },
    trap: 'Zero velocity is not zero acceleration: gravity still acts at the top, so the resultant force is mg downwards.',
    note: `At the top $v = 0$ but $a = g$ (weight still acts). $t_{top} = u/g = ${num(tTop)}$ s, $H = u^2/2g = ${num(H)}$ m, and by symmetry it returns at $${u}$ m s$^{-1}$.`,
  };
}

function boxSliding(rng: RNG): Scenario | null {
  const m = rng.pick([2, 4, 5, 8, 10, 20]);
  const mu = rng.pick([0.2, 0.25, 0.4, 0.5]);
  const fr = sig(mu * m * G);
  const a = rng.pick([0.5, 1, 1.5, 2, 2.5, 3, 4]);
  const P = sig(fr + m * a);
  if (!Number.isInteger(P)) return null;
  return {
    scenario: 'box-sliding',
    intro: `A box of mass ${KG(m)} is pushed along a rough horizontal floor by a horizontal force of ${N(P)}. The coefficient of friction between the box and the floor is $${num(mu)}$, and the box is moving. ${G_NOTE}`,
    pool: [
      numeric(rng, 'friction-value', fr, [mu * P, mu * m, P], (c) => `The friction force on the box is ${N(c)}.`),
      numeric(rng, 'accel-value', a, [P / m, (P + fr) / m], (c) => `The acceleration of the box is ${MS2(c)}.`),
      numeric(rng, 'normal-value', m * G, [m, m * G - fr], (c) => `The normal reaction of the floor on the box is ${N(c)}.`),
      numeric(rng, 'resultant-value', P - fr, [P, P + fr], (c) => `The resultant force on the box is ${N(c)}.`),
      bool('resultant-zero', 'The resultant force on the box is zero.', false),
      bool('friction-equals-push', 'The friction force is equal to the pushing force.', false),
    ],
    params: { m, mu, P },
    trap: 'A sliding box feels friction μR = μmg; the resultant is push − friction, and only that is divided by m.',
    note: `$R = mg = ${m * G}$ N, friction $= \\mu R = ${num(fr)}$ N, resultant $= ${P} - ${num(fr)} = ${num(P - fr)}$ N, $a = ${num(P - fr)}/${m} = ${num(a)}$ m s$^{-2}$.`,
  };
}

function boxStatic(rng: RNG): Scenario {
  const m = rng.pick([4, 5, 8, 10, 12, 20]);
  const mu = rng.pick([0.4, 0.5, 0.6]);
  const limit = sig(mu * m * G);
  const cands = [0.25, 0.5, 0.75].map((k) => sig(k * limit)).filter((x) => Number.isInteger(x * 2));
  const p = cands.length > 0 ? rng.pick(cands) : sig(limit / 2);
  return {
    scenario: 'box-static',
    intro: `A box of mass ${KG(m)} rests on a rough horizontal floor. The coefficient of friction between the box and the floor is $${num(mu)}$. A horizontal force of ${N(p)} is applied to the box. ${G_NOTE}`,
    pool: [
      bool('stays-at-rest', 'The box remains at rest.', true),
      numeric(rng, 'friction-value', p, [limit, 0], (c) => `The friction force on the box is ${N(c)}.`),
      bool('friction-is-muR', 'The friction force on the box is equal to $\\mu R$.', false),
      bool('resultant-zero', 'The resultant force on the box is zero.', true),
      numeric(rng, 'normal-value', m * G, [m, m * G - p], (c) => `The normal reaction of the floor on the box is ${N(c)}.`),
      bool('accelerates', `The box accelerates at ${MS2(sig(p / m))}.`, false),
      numeric(rng, 'limiting-value', limit, [p, mu * m], (c) => `The maximum friction force the floor can provide is ${N(c)}.`),
    ],
    params: { m, mu, P: p },
    trap: 'μR is the maximum (limiting) friction; while the box stays at rest the friction only matches the applied force.',
    note: `Limiting friction $\\mu R = ${num(mu)} \\times ${m * G} = ${num(limit)}$ N exceeds the push $${num(p)}$ N, so the box stays at rest with friction $= ${num(p)}$ N (not $\\mu R$) and zero resultant.`,
  };
}

function lift(rng: RNG, subtle: boolean): Scenario {
  const m = rng.pick([40, 50, 60, 70, 80]);
  const mag = rng.pick([1, 1.5, 2, 2.5, 3, 4, 5]);
  const motions: [string, number][] = subtle
    ? [['moving upwards and slowing down', -mag], ['moving downwards and slowing down', mag], ['moving downwards at a constant speed', 0], ['moving downwards and speeding up', -mag]]
    : [['accelerating upwards', mag], ['accelerating downwards', -mag], ['moving upwards at a constant speed', 0]];
  const [motion, a] = rng.pick(motions);
  const R = sig(m * (G + a));
  const rate = a === 0 ? '' : ` at ${MS2(mag)}`;
  return {
    scenario: 'lift',
    intro: `A person of mass ${KG(m)} stands on weighing scales in a lift. The lift is ${motion}${rate}. ${G_NOTE}`,
    pool: [
      numeric(rng, 'reading-value', R, [m * (G - a), m * G, m * Math.abs(a)], (c) => `The reading on the scales is ${N(c)}.`),
      bool('reading-exceeds-weight', "The reading on the scales is greater than the person's weight.", a > 0),
      bool('reading-less-than-weight', "The reading on the scales is less than the person's weight.", a < 0),
      bool('resultant-zero', 'The resultant force on the person is zero.', a === 0),
      ...(a === 0 ? [] : [numeric(rng, 'resultant-value', m * Math.abs(a), [R, m * G], (c) => `The magnitude of the resultant force on the person is ${N(c)}.`)]),
      numeric(rng, 'weight-value', m * G, [R], (c) => `The weight of the person is ${N(c)}.`),
      bool('weight-changes', "The person's weight changes while the lift is in this motion.", false),
    ],
    params: { m, a },
    trap: 'The scale reading is the normal reaction m(g + a) with a positive upwards: slowing down while moving up is a downward acceleration; the weight itself never changes.',
    note: `Upwards positive, $a = ${num(a)}$ m s$^{-2}$. $R - mg = ma$ gives $R = ${m}(10 ${a >= 0 ? '+' : '-'} ${num(Math.abs(a))}) = ${num(R)}$ N; the weight stays $${m * G}$ N and the resultant is $m|a| = ${num(m * Math.abs(a))}$ N.`,
  };
}

function collision(rng: RNG): Scenario | null {
  const m1 = rng.pick([1, 2, 3, 4, 6]);
  const m2 = rng.pick([1, 2, 3, 4, 6, 8]);
  const u1 = rng.pick([2, 4, 6, 8, 10, 12]);
  const v = (m1 * u1) / (m1 + m2);
  if (!Number.isInteger(v * 2)) return null;
  const before = 0.5 * m1 * u1 * u1;
  const after = 0.5 * (m1 + m2) * v * v;
  const lost = sig(before - after);
  if (!Number.isInteger(lost * 2)) return null;
  const one = rng.pick(['trolley', 'truck', 'ball']);
  return {
    scenario: 'collision',
    intro: `A ${one} of mass ${KG(m1)} moving at ${MS(u1)} collides with a stationary ${one} of mass ${KG(m2)}. The two ${one === 'ball' ? 'balls' : one + 's'} stick together and move off with a common velocity.`,
    pool: [
      bool('momentum-conserved', 'The total momentum of the two bodies is the same before and after the collision.', true),
      bool('ke-conserved', 'The total kinetic energy of the two bodies is the same before and after the collision.', false),
      numeric(rng, 'common-velocity', v, [(m1 * u1) / m2, u1 / 2, u1], (c) => `The common velocity after the collision is ${MS(c)}.`),
      numeric(rng, 'ke-lost', lost, [after, before, 0], (c) => `The kinetic energy lost in the collision is ${J(c)}.`),
      numeric(rng, 'momentum-after', m1 * u1, [(m1 + m2) * u1, (m1 * u1) / 2], (c) => `The total momentum after the collision is $${num(c)}\\ \\text{kg m s}^{-1}$.`),
      numeric(rng, 'impulse-on-second', m2 * v, [m1 * u1, m2 * u1], (c) => `The magnitude of the impulse on the second ${one} is $${num(c)}\\ \\text{N s}$.`),
    ],
    params: { m1, u1, m2, w: 0 },
    trap: 'Momentum is conserved in every collision; kinetic energy is lost when bodies stick together.',
    note: `Momentum $${m1 * u1} = (${m1 + m2})v$ gives $v = ${num(v)}$; KE before $${num(before)}$ J, after $${num(after)}$ J, so $${num(lost)}$ J is lost. Impulse on the second body $= m_2 v = ${num(m2 * v)}$ N s.`,
  };
}

function rebound(rng: RNG): Scenario | null {
  const m1 = rng.pick([1, 2, 3, 4]);
  const u1 = rng.pick([3, 4, 5, 6, 8, 9, 10, 12]);
  const w = rng.pick([1, 2, 3, 4].filter((x) => x < u1));
  const m2 = rng.pick([2, 3, 4, 5, 6, 8]);
  const v2 = (m1 * (u1 + w)) / m2;
  if (!Number.isInteger(v2 * 2) || v2 >= u1) return null;
  const before = 0.5 * m1 * u1 * u1;
  const after = 0.5 * m1 * w * w + 0.5 * m2 * v2 * v2;
  const lost = sig(before - after);
  if (lost < 0 || !Number.isInteger(lost * 2)) return null;
  const elastic = eq(lost, 0);
  return {
    scenario: 'rebound',
    intro: `A ball of mass ${KG(m1)} moving at ${MS(u1)} strikes a stationary ball of mass ${KG(m2)} head-on. After the collision the first ball moves back along its original line at ${MS(w)} and the second ball moves off at ${MS(v2)}.`,
    pool: [
      bool('momentum-conserved', 'Momentum is conserved in the collision.', true),
      bool('ke-conserved', 'Kinetic energy is conserved in the collision.', elastic),
      bool('elastic', 'The collision is perfectly elastic.', elastic),
      numeric(rng, 'ke-lost', lost, [before - 0.5 * m2 * v2 * v2, elastic ? before : 0], (c) => `The kinetic energy lost in the collision is ${J(c)}.`),
      numeric(rng, 'impulse-on-first', m1 * (u1 + w), [m1 * (u1 - w), m1 * u1], (c) => `The magnitude of the impulse on the first ball is $${num(c)}\\ \\text{N s}$.`),
      numeric(rng, 'momentum-after', m1 * u1, [m1 * w + m2 * v2, m2 * v2], (c) => `The total momentum after the collision is $${num(c)}\\ \\text{kg m s}^{-1}$.`),
      numeric(rng, 'ke-after', after, [before, 0.5 * m2 * v2 * v2], (c) => `The total kinetic energy after the collision is ${J(c)}.`),
    ],
    params: { m1, u1, m2, w, v2 },
    trap: 'Momentum is always conserved (mind the sign of the rebound); whether kinetic energy is conserved has to be checked by computing it.',
    note: `Momentum: $${m1 * u1} = -${m1 * w} + ${m2} \\times ${num(v2)}$ ✓. KE before $${num(before)}$ J, after $${num(0.5 * m1 * w * w)} + ${num(0.5 * m2 * v2 * v2)} = ${num(after)}$ J: ${elastic ? 'equal, so the collision is elastic' : `$${num(lost)}$ J lost, so it is not elastic`}. Impulse on the first ball $= m_1(u_1 + w) = ${num(m1 * (u1 + w))}$ N s.`,
  };
}

function slope(rng: RNG): Scenario {
  const theta = rng.bool(0.7) ? 30 : 60;
  const m = rng.pick([2, 4, 6, 8, 10, 20]);
  const sin = exactSin(theta), cos = exactCos(theta);
  const mg = E(m * G);
  const along = mg.mul(sin), normal = mg.mul(cos);
  const aAlong = E(G).mul(sin), aCos = E(G).mul(cos);
  const tex = (x: ReturnType<typeof E>, unit: string) => `$${x.toLatex()}\\ ${unit}$`;
  const cl = (x: ReturnType<typeof E>) => sig(x.toNumber());
  const label = (c: number, unit: string) => {
    const exact = [along, normal, aAlong, aCos, mg, E(G)].find((x) => eq(cl(x), c));
    return exact ? tex(exact, unit) : `$${num(c)}\\ ${unit}$`;
  };
  return {
    scenario: 'slope',
    intro: `A block of mass ${KG(m)} is released from rest on a smooth plane inclined at $${theta}^{\\circ}$ to the horizontal. ${G_NOTE}`,
    pool: [
      bool('normal-equals-weight', 'The normal reaction of the plane on the block is equal to the weight of the block.', false),
      numeric(rng, 'normal-value', cl(normal), [m * G, cl(along)], (c) => `The normal reaction of the plane on the block is ${label(c, '\\text{N}')}.`),
      numeric(rng, 'accel-value', cl(aAlong), [cl(aCos), G], (c) => `The acceleration of the block down the plane is ${label(c, '\\text{m s}^{-2}')}.`),
      numeric(rng, 'along-value', cl(along), [cl(normal), m * G], (c) => `The component of the weight of the block along the plane is ${label(c, '\\text{N}')}.`),
      bool('accel-independent-of-mass', 'The acceleration of the block does not depend on its mass.', true),
      numeric(rng, 'resultant-value', cl(along), [m * G, cl(normal)], (c) => `The resultant force on the block is ${label(c, '\\text{N}')}.`),
    ],
    params: { m, theta },
    trap: 'On a slope the normal reaction is mg cos θ (less than the weight) and the resultant is mg sin θ, giving a = g sin θ for any mass.',
    note: `Resolve: along the plane $mg\\sin ${theta}^{\\circ} = ${along.toLatex()}$ N (the resultant, so $a = g\\sin ${theta}^{\\circ} = ${aAlong.toLatex()}$ m s$^{-2}$); perpendicular $R = mg\\cos ${theta}^{\\circ} = ${normal.toLatex()}$ N $< mg = ${m * G}$ N.`,
  };
}

// ------------------------------------------------------------------------------------------ assembly

function pickScenario(rng: RNG, level: Level): Scenario | null {
  const fns: ((rng: RNG) => Scenario | null)[] = level === 1 ? [boxConstant, carConstant]
    : level === 2 ? [ballTop, boxSliding]
    : level === 3 ? [(r) => lift(r, false), boxStatic]
    : level === 4 ? [collision, slope]
    : [(r) => lift(r, true), rebound, rebound];
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const s = f(rng);
    if (s) return s;
  }
  return null;
}

/** Recompute a statement's truth from the scenario numbers with explicit force / momentum / energy checks. */
function truthOf(scenario: string, kind: string, claim: number, p: Record<string, number>): boolean | null {
  const g = G;
  switch (scenario) {
    case 'box-constant': { // steady velocity: friction f = P, R = mg, μ = f/R
      const R = p.m * g, f = p.P;
      switch (kind) {
        case 'resultant-zero': return true;
        case 'friction-value': return eq(claim, f);
        case 'normal-value': return eq(claim, R);
        case 'mu-value': return eq(claim * R, f);
        case 'friction-less-than-push': return false;
        case 'momentum-value': return eq(claim, p.m * p.v);
      }
      return null;
    }
    case 'car-constant': {
      switch (kind) {
        case 'resultant-zero': return true;
        case 'resistance-value': return eq(claim, p.D);
        case 'momentum-value': return eq(claim, p.m * p.v);
        case 'ke-value': return eq(claim, 0.5 * p.m * p.v * p.v);
        case 'driving-exceeds-resistance': return false;
        case 'momentum-constant': return true;
      }
      return null;
    }
    case 'ball-top': {
      switch (kind) {
        case 'top-velocity-zero': return true;
        case 'top-accel-zero': return false;
        case 'top-resultant-zero': return false;
        case 'time-top': return eq(p.u - g * claim, 0); // v = u − gt = 0
        case 'max-height': return eq(p.u * p.u - 2 * g * claim, 0); // v² = u² − 2gh = 0
        case 'return-speed': return eq(claim * claim, p.u * p.u); // energy: same speed back at the start
        case 'accel-constant': return true;
      }
      return null;
    }
    case 'box-sliding': {
      const R = p.m * g, f = p.mu * R, a = (p.P - f) / p.m;
      switch (kind) {
        case 'friction-value': return eq(claim, f);
        case 'accel-value': return eq(p.P - f - p.m * claim, 0);
        case 'normal-value': return eq(claim, R);
        case 'resultant-value': return eq(claim, p.m * a);
        case 'resultant-zero': return false;
        case 'friction-equals-push': return eq(f, p.P);
      }
      return null;
    }
    case 'box-static': {
      const R = p.m * g, limit = p.mu * R, moves = p.P > limit;
      switch (kind) {
        case 'stays-at-rest': return !moves;
        case 'friction-value': return eq(claim, moves ? limit : p.P);
        case 'friction-is-muR': return moves;
        case 'resultant-zero': return !moves;
        case 'normal-value': return eq(claim, R);
        case 'accelerates': return moves;
        case 'limiting-value': return eq(claim, limit);
      }
      return null;
    }
    case 'lift': { // N − mg = ma (upwards positive)
      const Nn = p.m * g + p.m * p.a;
      switch (kind) {
        case 'reading-value': return eq(claim, Nn);
        case 'reading-exceeds-weight': return Nn > p.m * g;
        case 'reading-less-than-weight': return Nn < p.m * g;
        case 'resultant-zero': return eq(Nn, p.m * g);
        case 'resultant-value': return eq(claim, Math.abs(Nn - p.m * g));
        case 'weight-value': return eq(claim, p.m * g);
        case 'weight-changes': return false;
      }
      return null;
    }
    case 'collision': {
      const v = (p.m1 * p.u1) / (p.m1 + p.m2);
      const before = 0.5 * p.m1 * p.u1 * p.u1, after = 0.5 * (p.m1 + p.m2) * v * v;
      switch (kind) {
        case 'momentum-conserved': return true;
        case 'ke-conserved': return eq(before, after);
        case 'common-velocity': return eq(p.m1 * p.u1, (p.m1 + p.m2) * claim);
        case 'ke-lost': return eq(claim, before - after);
        case 'momentum-after': return eq(claim, (p.m1 + p.m2) * v);
        case 'impulse-on-second': return eq(claim, p.m2 * v - 0);
      }
      return null;
    }
    case 'rebound': {
      const pBefore = p.m1 * p.u1, pAfter = -p.m1 * p.w + p.m2 * p.v2;
      const kBefore = 0.5 * p.m1 * p.u1 * p.u1, kAfter = 0.5 * p.m1 * p.w * p.w + 0.5 * p.m2 * p.v2 * p.v2;
      if (!eq(pBefore, pAfter)) return null; // the scenario itself must conserve momentum
      switch (kind) {
        case 'momentum-conserved': return true;
        case 'ke-conserved': return eq(kBefore, kAfter);
        case 'elastic': return eq(kBefore, kAfter);
        case 'ke-lost': return eq(claim, kBefore - kAfter);
        case 'impulse-on-first': return eq(claim, Math.abs(-p.m1 * p.w - p.m1 * p.u1));
        case 'momentum-after': return eq(claim, pAfter);
        case 'ke-after': return eq(claim, kAfter);
      }
      return null;
    }
    case 'slope': {
      const rad = (p.theta * Math.PI) / 180;
      const along = p.m * g * Math.sin(rad), normal = p.m * g * Math.cos(rad);
      const near = (a: number, b: number) => Math.abs(a - b) < 1e-7;
      switch (kind) {
        case 'normal-equals-weight': return near(normal, p.m * g);
        case 'normal-value': return near(claim, normal);
        case 'accel-value': return near(claim, along / p.m);
        case 'along-value': return near(claim, along);
        case 'accel-independent-of-mass': return true;
        case 'resultant-value': return near(claim, along);
      }
      return null;
    }
  }
  return null;
}

export default defineTemplate({
  id: 'phy.forces.which-statements',
  module: 'PHY',
  topic: 'forces',
  title: 'Which statements are true (forces & motion)',
  levels: {
    1: 'constant velocity: zero resultant, friction = push, normal reaction = weight, momentum / KE values',
    2: 'box accelerating on a rough floor; ball at the top of its flight (v = 0 but a = g)',
    3: 'lift accelerating up/down or at constant speed (scale reading, resultant); box that does not move (friction ≠ μR)',
    4: 'perfectly inelastic collision (momentum vs energy, common velocity, impulse); block on a smooth slope',
    5: 'lifts described by motion and slowing/speeding up; collisions with a rebound where elastic/inelastic must be computed',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      const sc = pickScenario(rng, level);
      if (!sc) return null;
      const chosen = rng.pickDistinct(sc.pool, 3);
      const kinds = chosen.map((s) => s.kind);
      // 'ke-conserved' and 'elastic' say the same thing: never ask both
      if (kinds.includes('ke-conserved') && kinds.includes('elastic')) return null;
      if (kinds.includes('reading-exceeds-weight') && kinds.includes('reading-less-than-weight')) return null;
      const truth = chosen.map((s) => s.truth) as [boolean, boolean, boolean];
      const options = statementOptions(truth);
      const correct = options.find((o) => o.correct)!.display;
      const stem = `${sc.intro}\n\nWhich of the following statements are true?\n\nI. ${chosen[0].text}\nII. ${chosen[1].text}\nIII. ${chosen[2].text}`;
      const verdicts = chosen.map((s, i) => `${['I', 'II', 'III'][i]}: ${s.truth ? 'true' : 'false'}`).join('; ');
      return {
        stem,
        answer: { kind: 'choice' as const, value: correct },
        options,
        solution: `${verdicts}. ${sc.note}`,
        trap: sc.trap,
        tags: ['forces', 'statements', sc.scenario],
        params: { scenario: sc.scenario, ...sc.params, statements: chosen.map((s) => ({ kind: s.kind, claim: s.claim })), truth },
        typedAllowed: false,
      };
    });
  },
  verify(q) {
    if (q.answer.kind !== 'choice') return false;
    const p = q.params as Record<string, number> & { scenario: string; statements: { kind: string; claim: number }[]; truth: boolean[] };
    // 1. recompute every statement's truth from the raw numbers
    const truth: boolean[] = [];
    for (const s of p.statements) {
      const t = truthOf(p.scenario, s.kind, s.claim, p);
      if (t === null) return false;
      truth.push(t);
    }
    if (truth.length !== 3 || truth.some((t, i) => t !== p.truth[i])) return false;
    // 2. rebuild the expected option text independently of statementOptions
    const names = ['I', 'II', 'III'].filter((_, i) => truth[i]);
    let expected: string;
    if (names.length === 0) expected = 'none of them';
    else if (names.length === 3) expected = 'I, II and III';
    else if (names.length === 1) expected = `${names[0]} only`;
    else expected = `${names[0]} and ${names[1]} only`;
    return STATEMENT_COMBOS.includes(expected) && q.answer.value === expected && q.options.filter((o) => o.correct).length === 1;
  },
});
