import { defineTemplate, retry, type Level } from '../../core/template';
import { statementOptions, STATEMENT_COMBOS } from '../../core/options';
import { num, TRIPLES } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * "Which of the following statements are true?" about equilibrium, pressure and floating,
 * with numbers (g = 10 m s^-2, atmospheric pressure 100 kPa).
 * Level 1: a light rod on a pivot — moments, whether it balances, which way it turns
 * Level 2: a block floating with part of its volume submerged — upthrust, density, what happens in another liquid
 * Level 3: a uniform beam on two supports — which reaction is bigger, their sum, their values
 * Level 4: a diver at depth — liquid pressure, total pressure, and why doubling the depth does not double it
 * Level 5: a deep diver (harder numbers, the pressure difference between his head and his feet); a hydraulic
 *          jack with a big area ratio and the work done at the small piston; a particle under three forces
 *
 * Three rules keep the statements answerable and worth answering: a force is only ever named by its
 * magnitude when the two magnitudes differ; every scenario's `note` is a function of the three statement
 * kinds actually drawn, so the worked solution quotes no quantity that the stem does not state; and every
 * scenario declares `requireAny`, the statements that need a calculation, so no instance can be answered
 * from definitions alone (those combinations have the same answer whatever the numbers are, which makes
 * them memorable rather than solvable).
 *
 * verify() recomputes every statement's truth from the raw numbers in params with an explicit
 * moment / pressure / upthrust calculation, then rebuilds the expected option text from the truth vector.
 */

const G = 10;
const P_ATM = 100; // kPa
const G_NOTE = 'Take $g = 10\\ \\text{m s}^{-2}$.';

const N = (x: number) => `$${num(x)}\\ \\text{N}$`;
const NM = (x: number) => `$${num(x)}\\ \\text{N m}$`;
const KPA = (x: number) => `$${num(x)}\\ \\text{kPa}$`;
const KG = (x: number) => `$${num(x)}\\ \\text{kg}$`;
const RHO = (x: number) => `$${num(x)}\\ \\text{kg m}^{-3}$`;
const M = (x: number) => `$${num(x)}\\ \\text{m}$`;
const CM = (x: number) => `$${num(x)}\\ \\text{cm}$`;
const J = (x: number) => `$${num(x)}\\ \\text{J}$`;

const sig = (x: number) => Number(x.toFixed(9));
const eq = (a: number, b: number) => Math.abs(a - b) < 1e-7;

interface Stmt { kind: string; claim: number; text: string; truth: boolean }

interface Scenario {
  scenario: string;
  intro: string;
  pool: Stmt[];
  params: Record<string, number>;
  trap: string;
  /** the working the three chosen statements need — and nothing they do not */
  note: (kinds: string[]) => string;
  /** pairs of statement kinds that must not appear together */
  exclusive?: [string, string][];
  /** at least one of these kinds must be among the three drawn (keeps a calculation in the question) */
  requireAny?: string[];
}

/** A numeric statement: half the time it quotes the correct value, otherwise one of the wrong ones. */
function numeric(rng: RNG, kind: string, correct: number, wrongs: number[], text: (claim: number) => string): Stmt {
  const ws = wrongs.map(sig).filter((w) => !eq(w, correct) && Number.isFinite(w) && w >= 0);
  const claim = ws.length > 0 && rng.bool(0.5) ? rng.pick(ws) : sig(correct);
  return { kind, claim, text: text(claim), truth: eq(claim, correct) };
}

const bool = (kind: string, text: string, truth: boolean): Stmt => ({ kind, claim: truth ? 1 : 0, text, truth });

const has = (kinds: string[], ...ks: string[]): boolean => ks.some((k) => kinds.includes(k));

// ------------------------------------------------------------------------------------------ scenarios

const D_POOL = [0.2, 0.25, 0.4, 0.5, 0.6, 0.8, 1, 1.2, 1.5, 2];
const F_POOL = [10, 12, 15, 20, 24, 25, 30, 40, 50, 60, 80, 100];

/** A light rod on a pivot with one force each side: moments, balance, direction of turning. */
function rodOnPivot(rng: RNG): Scenario | null {
  const d1 = rng.pick(D_POOL);
  const d2 = rng.pick(D_POOL.filter((v) => v !== d1));
  const F1 = rng.pick(F_POOL);
  // The statements name a force by its magnitude, so the two magnitudes must differ.
  const F2 = rng.bool(0.5) ? sig((F1 * d1) / d2) : rng.pick(F_POOL.filter((v) => v !== F1));
  if (eq(F2, F1)) return null;
  if (!Number.isInteger(F2 * 2) || F2 < 5 || F2 > 200) return null;
  const m1 = sig(F1 * d1), m2 = sig(F2 * d2);
  if (!Number.isInteger(m1 * 4) || !Number.isInteger(m2 * 4)) return null;
  const balanced = eq(m1, m2);
  const pool: Stmt[] = [
    numeric(rng, 'moment1', m1, [F1 / d1, F1 * d2, F1 * (d1 + d2), 2 * m1], (c) => `The moment of the ${N(F1)} force about the pivot is ${NM(c)}.`),
    numeric(rng, 'moment2', m2, [F2 / d2, F2 * d1, F2 * (d1 + d2), 2 * m2], (c) => `The moment of the ${N(F2)} force about the pivot is ${NM(c)}.`),
    bool('balanced', 'The rod is in equilibrium.', balanced),
    bool('turns-towards-1', `The rod turns in the direction of the ${N(F1)} force.`, m1 > m2 + 1e-9),
    bool('bigger-moment-1', `The ${N(F1)} force has the larger moment about the pivot.`, m1 > m2 + 1e-9),
    bool('double-distance', `If the ${N(F2)} force were moved twice as far from the pivot, its moment would double.`, true),
  ];
  if (balanced) pool.push(numeric(rng, 'pivot-force', sig(F1 + F2), [F1, F2, sig(Math.abs(F1 - F2))], (c) => `The downward force on the pivot is ${N(c)}.`));
  return {
    scenario: 'rod',
    intro: `A light rod is held horizontal on a pivot and then released. A force of ${N(F1)} acts vertically downwards at a point ${M(d1)} from the pivot, and a force of ${N(F2)} acts vertically downwards at a point ${M(d2)} from the pivot on the other side.`,
    pool,
    params: { F1, d1, F2, d2 },
    trap: 'Comparing the forces is not enough: it is force × distance from the pivot that decides which way a rod turns.',
    note: (kinds) => {
      const parts = [`Moments about the pivot: $${num(F1)} \\times ${num(d1)} = ${num(m1)}$ N m and $${num(F2)} \\times ${num(d2)} = ${num(m2)}$ N m.`];
      if (has(kinds, 'balanced', 'turns-towards-1', 'bigger-moment-1', 'pivot-force')) {
        parts.push(balanced ? 'The two moments are equal, so the rod stays horizontal.' : `The moment of the $${num(m1 > m2 ? F1 : F2)}$ N force is the larger, so the rod turns that way.`);
      }
      if (kinds.includes('pivot-force')) parts.push(`The pivot carries both forces: $${num(F1)} + ${num(F2)} = ${num(F1 + F2)}$ N.`);
      if (kinds.includes('double-distance')) parts.push('A moment is proportional to the distance from the pivot, so twice the distance is twice the moment.');
      return parts.join(' ');
    },
    exclusive: [['turns-towards-1', 'bigger-moment-1'], ['balanced', 'turns-towards-1'], ['moment1', 'moment2']],
    // a moment has to be worked out: "the rod turns that way" plus two definitions is not a question
    requireAny: ['moment1', 'moment2', 'pivot-force'],
  };
}

/** Liquids a block might be put into, used for the "would it float in …" statement. */
const OTHER_RHO = [600, 700, 800, 900, 1000, 1100, 1200, 1300, 1500];

/** A block floating with a stated fraction of its volume submerged. */
function floatingBlock(rng: RNG): Scenario | null {
  const rhoF = rng.pick([1000, 1000, 800, 1200]);
  const f = rng.pick([0.2, 0.25, 0.4, 0.5, 0.6, 0.75, 0.8]);
  const rhoB = sig(f * rhoF);
  if (!Number.isInteger(rhoB / 25)) return null;
  const V = rng.pick([200, 400, 500, 800, 1000, 1500, 2000]);
  const mass = sig((rhoB * V) / 1e6);
  if (!Number.isInteger(mass * 100) || mass < 0.05) return null;
  const W = sig(mass * G);
  // The other liquid must be clearly denser or clearly less dense than the block: at exactly rho_block
  // the block is neutrally buoyant and "would it float?" has no clean answer.
  const cands = OTHER_RHO.filter((r) => r !== rhoF && Math.abs(r - rhoB) >= 0.15 * rhoB);
  const below = cands.filter((r) => r < rhoB), above = cands.filter((r) => r > rhoB);
  const side = rng.bool(0.5) && below.length > 0 ? below : above.length > 0 ? above : below;
  if (side.length === 0) return null;
  const other = rng.pick(side);
  const percent = `$${num(f * 100)}\\%$`;
  return {
    scenario: 'float',
    intro: `A block of volume ${num(V)} $\\text{cm}^{3}$ floats in a liquid of density ${RHO(rhoF)} with ${percent} of its volume below the surface. ${G_NOTE}`,
    pool: [
      bool('upthrust-equals-weight', 'The upthrust on the block is equal to the weight of the block.', true),
      numeric(rng, 'density', rhoB, [sig(rhoF / f), sig((1 - f) * rhoF), rhoF], (c) => `The density of the block is ${RHO(c)}.`),
      numeric(rng, 'upthrust', W, [sig(W / f), sig(mass), sig((rhoF * V * G) / 1e6)], (c) => `The upthrust on the block is ${N(c)}.`),
      numeric(rng, 'mass', mass, [sig(mass * f), sig(mass / f), W], (c) => `The mass of the block is ${KG(c)}.`),
      bool('denser-liquid', 'In a liquid of greater density, a smaller fraction of the block would be submerged.', true),
      bool('floats-in-other', `The block would float in a liquid of density ${RHO(other)}.`, rhoB < other),
      numeric(rng, 'volume-submerged', sig(f * V), [sig((1 - f) * V), V], (c) => `The volume of liquid displaced is ${num(c)} $\\text{cm}^{3}$.`),
    ],
    params: { rhoF, f, rhoB, V, mass, other },
    trap: 'A floating body displaces its own weight of liquid, so the fraction submerged is ρ_body/ρ_liquid — not the other way up.',
    note: (kinds) => {
      const parts = [`Floating: upthrust $=$ weight, so $\\rho_{\\text{block}} = ${num(f)} \\times ${num(rhoF)} = ${num(rhoB)}$ kg m$^{-3}$.`];
      if (has(kinds, 'mass', 'upthrust', 'upthrust-equals-weight')) parts.push(`Mass $= ${num(rhoB)} \\times ${num(V)} \\times 10^{-6} = ${num(mass)}$ kg.`);
      if (has(kinds, 'upthrust', 'upthrust-equals-weight')) parts.push(`The upthrust equals that weight, $${num(mass)} \\times 10 = ${num(W)}$ N.`);
      if (kinds.includes('volume-submerged')) parts.push(`Volume displaced $= ${num(f)} \\times ${num(V)} = ${num(sig(f * V))}$ cm$^{3}$.`);
      if (kinds.includes('floats-in-other')) parts.push(`It floats in any liquid denser than $${num(rhoB)}$ kg m$^{-3}$ and sinks in any liquid less dense.`);
      if (kinds.includes('denser-liquid')) parts.push('A denser liquid needs less volume displaced to give the same upthrust.');
      return parts.join(' ');
    },
    exclusive: [['upthrust-equals-weight', 'upthrust']],
    // "the upthrust equals the weight" and "a denser liquid submerges less" are true of every block
    requireAny: ['density', 'upthrust', 'mass', 'volume-submerged'],
  };
}

/** A uniform beam on two supports carrying one load. */
function beamOnSupports(rng: RNG): Scenario | null {
  const L = rng.pick([4, 5, 6, 8]);
  const Wb = rng.pick([100, 200, 300, 400, 600]);
  const W = rng.pick([100, 150, 200, 300, 400, 600]);
  const d = rng.pick([1, 1.5, 2, 2.5, 3, 4].filter((v) => v > 0.5 && v < L - 0.5 && v !== L / 2));
  const RB = sig((Wb * (L / 2) + W * d) / L);
  const RA = sig(Wb + W - RB);
  if (!Number.isInteger(RA * 2) || !Number.isInteger(RB * 2) || RA < 20 || RB < 20) return null;
  return {
    scenario: 'supports',
    intro: `A uniform beam $AB$ of length ${M(L)} and weight ${N(Wb)} rests horizontally on supports at $A$ and $B$. A load of weight ${N(W)} is placed ${M(d)} from $A$.`,
    pool: [
      bool('ra-greater', 'The reaction at $A$ is greater than the reaction at $B$.', RA > RB + 1e-9),
      numeric(rng, 'sum', sig(Wb + W), [sig(Wb + W) / 2, W, Wb], (c) => `The sum of the two reactions is ${N(c)}.`),
      numeric(rng, 'ra', RA, [RB, sig((Wb + W) / 2), sig((W * (L - d)) / L)], (c) => `The reaction at $A$ is ${N(c)}.`),
      numeric(rng, 'rb', RB, [RA, sig((Wb + W) / 2), sig((W * d) / L)], (c) => `The reaction at $B$ is ${N(c)}.`),
      bool('equal-at-centre', 'If the load were moved to the centre of the beam the two reactions would be equal.', true),
      bool('half-each', 'Each support carries half of the total weight.', eq(RA, RB)),
    ],
    params: { L, Wb, W, d },
    trap: 'The support nearer the load carries more of it; only the beam’s own weight is shared equally.',
    note: (kinds) => {
      const parts = [`Moments about $B$: $R_A \\times ${num(L)} = ${num(Wb)} \\times ${num(L / 2)} + ${num(W)} \\times ${num(L - d)}$, so $R_A = ${num(RA)}$ N and $R_B = ${num(Wb + W)} - ${num(RA)} = ${num(RB)}$ N.`];
      if (has(kinds, 'equal-at-centre', 'half-each')) parts.push('The beam’s own weight acts at the centre and is shared equally; only the load’s position breaks the symmetry.');
      return parts.join(' ');
    },
    exclusive: [['ra-greater', 'half-each'], ['ra', 'rb']],
    // a reaction has to be found: which one is bigger can be read off the picture
    requireAny: ['ra', 'rb', 'sum'],
  };
}

/**
 * A diver at depth: liquid pressure, total pressure, force on an area. At level 5 the numbers are
 * deeper and heavier and one more statement is available — the pressure difference between the
 * diver's head and his feet, which needs ρgh over a second, small depth.
 */
function diver(rng: RNG, level: Level): Scenario | null {
  const hard = level >= 5;
  const rho = rng.pick(hard ? [1030, 1200, 1500, 2000] : [1000, 1000, 1200, 800]);
  const h = rng.pick(hard ? [30, 40, 50, 60, 80] : [5, 10, 15, 20, 25, 30, 40]);
  const pw = sig((rho * G * h) / 1000);
  const total = sig(pw + P_ATM);
  if (!Number.isInteger(pw * 2) || pw < (hard ? 300 : 20)) return null;
  const A = rng.pick(hard ? [0.001, 0.002, 0.004, 0.005] : [0.001, 0.002, 0.005, 0.01, 0.02]);
  const force = sig(total * 1000 * A);
  if (!Number.isInteger(force * 10)) return null;
  const gap = rng.pick([1.5, 2]);
  const headFeet = sig((rho * G * gap) / 1000);
  if (hard && !Number.isInteger(headFeet * 100)) return null;
  const pool: Stmt[] = [
    numeric(rng, 'water-pressure', pw, [total, sig((rho * h) / 1000), sig(pw / 2)], (c) => `The pressure due to the liquid alone is ${KPA(c)}.`),
    numeric(rng, 'total-pressure', total, [pw, sig(pw - P_ATM), sig(pw * P_ATM)], (c) => `The total pressure on the diver is ${KPA(c)}.`),
    bool('double-total', `The total pressure at a depth of ${M(2 * h)} is twice the total pressure at ${M(h)}.`, false),
    bool('double-liquid', `The pressure due to the liquid alone at a depth of ${M(2 * h)} is twice its value at ${M(h)}.`, true),
    numeric(rng, 'force', force, [sig(pw * 1000 * A), sig(total * A)], (c) => `The force due to the total pressure on an area of ${num(A)} $\\text{m}^{2}$ of the diver’s mask is ${N(c)}.`),
    bool('all-directions', 'The pressure at this depth acts equally in all directions.', true),
    bool('depends-on-area', 'The pressure at this depth would be greater if the tank were wider.', false),
  ];
  if (hard) {
    pool.push(numeric(rng, 'head-feet', headFeet, [sig((rho * gap) / 1000), pw, sig(headFeet * 10)], (c) => `His feet are ${M(gap)} below his head, and the pressure there is ${KPA(c)} greater than at his head.`));
  }
  return {
    scenario: 'diver',
    intro: `A diver is ${M(h)} below the surface of a liquid of density ${RHO(rho)}. Atmospheric pressure at the surface is ${KPA(P_ATM)}. ${G_NOTE}`,
    pool,
    params: { rho, h, A, gap },
    trap: 'Total pressure is 100 kPa + ρgh, so doubling the depth doubles only the ρgh part — the atmosphere is still there.',
    note: (kinds) => {
      const parts = [`$\\rho g h = ${num(rho)} \\times 10 \\times ${num(h)} = ${num(pw * 1000)}$ Pa $= ${num(pw)}$ kPa.`];
      if (has(kinds, 'total-pressure', 'double-total', 'force')) parts.push(`Total pressure $= ${num(P_ATM)} + ${num(pw)} = ${num(total)}$ kPa.`);
      if (kinds.includes('force')) parts.push(`Force $= pA = ${num(total)} \\times 10^{3} \\times ${num(A)} = ${num(force)}$ N.`);
      if (kinds.includes('head-feet')) parts.push(`Over the ${M(gap)} from head to feet the extra pressure is $\\rho g \\Delta h = ${num(rho)} \\times 10 \\times ${num(gap)} = ${num(headFeet * 1000)}$ Pa $= ${num(headFeet)}$ kPa.`);
      if (kinds.includes('double-total')) parts.push('Doubling the depth doubles the $\\rho g h$ part only: the $100$ kPa of atmosphere is still there.');
      if (kinds.includes('double-liquid')) parts.push('$\\rho g h$ is proportional to $h$.');
      if (has(kinds, 'all-directions', 'depends-on-area')) parts.push('Pressure in a liquid depends only on the depth (and the density), not on the width of the container, and acts equally in every direction.');
      return parts.join(' ');
    },
    exclusive: [['double-total', 'double-liquid'], ['water-pressure', 'total-pressure']],
    // "pressure acts in all directions" and "a wider tank makes no difference" are true of every depth
    requireAny: hard ? ['water-pressure', 'total-pressure', 'force', 'head-feet'] : ['water-pressure', 'total-pressure', 'force'],
  };
}

/**
 * A hydraulic jack: force multiplication, equal pressure, distances and work. At level 5 the area
 * ratio is larger and the work done at the small piston can be asked for, which needs the force, the
 * distance and a centimetre-to-metre conversion in one statement.
 */
function hydraulicJack(rng: RNG, level: Level): Scenario | null {
  const hard = level >= 5;
  const a1 = rng.pick(hard ? [4, 5, 8, 10, 20] : [2, 4, 5, 8, 10, 20]);
  const k = rng.pick(hard ? [10, 20, 25, 40, 50] : [4, 5, 8, 10, 20, 25]);
  const a2 = a1 * k;
  if (a2 > (hard ? 2000 : 1000)) return null;
  const F1 = rng.pick(hard ? [20, 25, 40, 50, 60, 80, 100] : [10, 20, 25, 40, 50, 60, 80, 100]);
  const F2 = sig(F1 * k);
  const p = sig((F1 / (a1 * 1e-4)) / 1000); // kPa
  if (!Number.isInteger(p * 2) || F2 > (hard ? 10000 : 5000)) return null;
  const d1 = rng.pick(hard ? [4, 5, 8, 10, 20, 25, 40] : [2, 4, 5, 8, 10, 20]);
  const d2 = sig(d1 / k);
  if (!Number.isInteger(d2 * 100) || d2 < 0.05) return null;
  const work = sig((F1 * d1) / 100); // J, the same on both pistons
  if (hard && !Number.isInteger(work * 100)) return null;
  const pool: Stmt[] = [
    numeric(rng, 'force2', F2, [F1, sig(F1 / k), sig(F1 * a2)], (c) => `The force on the large piston is ${N(c)}.`),
    bool('same-pressure', 'The pressure in the liquid is the same at both pistons.', true),
    bool('small-moves-further', 'The small piston moves further than the large piston.', true),
    bool('work-multiplied', 'The work done on the large piston is greater than the work done on the small piston.', false),
    numeric(rng, 'pressure', p, [sig(p / 10), sig(p * 10), sig(F1 / a1)], (c) => `The pressure in the liquid is ${KPA(c)}.`),
    numeric(rng, 'distance2', d2, [sig(d1 * k), d1, sig(d1 / a2)], (c) => `If the small piston moves ${CM(d1)}, the large piston moves ${CM(c)}.`),
  ];
  if (hard) {
    pool.push(numeric(rng, 'work', work, [sig(F1 * d1), sig(work * k), sig(F2 * d1)], (c) => `If the small piston moves ${CM(d1)}, the work done on the load is ${J(c)}.`));
  }
  return {
    scenario: 'jack',
    intro: `In a hydraulic jack the small piston has cross-sectional area ${num(a1)} $\\text{cm}^{2}$ and the large piston has cross-sectional area ${num(a2)} $\\text{cm}^{2}$. A force of ${N(F1)} is applied to the small piston and the liquid is incompressible.`,
    pool,
    params: { a1, a2, F1, d1 },
    trap: 'A jack multiplies force, never energy: the large piston moves as many times less as its force is times bigger.',
    note: (kinds) => {
      const parts: string[] = [];
      if (kinds.includes('pressure')) parts.push(`Pressure $= \\dfrac{${num(F1)}}{${num(a1)} \\times 10^{-4}} = ${num(p * 1000)}$ Pa $= ${num(p)}$ kPa.`);
      if (has(kinds, 'force2', 'same-pressure', 'work-multiplied', 'work') || parts.length === 0) {
        parts.push(`The pressure is the same at both pistons, so $F_2 = ${num(F1)} \\times \\frac{${num(a2)}}{${num(a1)}} = ${num(F2)}$ N.`);
      }
      if (has(kinds, 'distance2', 'work')) parts.push(`Equal volumes are swept: $d_2 = ${num(d1)} \\div ${num(k)} = ${num(d2)}$ cm.`);
      else if (has(kinds, 'small-moves-further', 'work-multiplied')) parts.push(`Equal volumes are swept, so the large piston moves $${num(k)}$ times less than the small one.`);
      if (kinds.includes('work')) parts.push(`Work on the load $= F_2 d_2 = ${num(F2)} \\times ${num(d2 / 100)} = ${num(work)}$ J, the same as $${num(F1)} \\times ${num(d1 / 100)}$ J done on the small piston.`);
      if (has(kinds, 'small-moves-further', 'work-multiplied')) parts.push('The work $Fd$ is therefore the same on both sides.');
      return parts.join(' ');
    },
    // "the pressure is the same at both pistons" and "the small piston moves further" are true of every jack
    requireAny: hard ? ['force2', 'pressure', 'distance2', 'work'] : ['force2', 'pressure', 'distance2'],
  };
}

/** A particle in equilibrium under three forces (a Pythagorean triple). */
function threeForces(rng: RNG): Scenario | null {
  const [a, b, c] = rng.pick(TRIPLES.filter((t) => t[2] <= 26));
  const swap = rng.bool();
  const east = swap ? b : a;
  const north = swap ? a : b;
  return {
    scenario: 'three-forces',
    intro: `A particle rests in equilibrium under three forces: ${N(east)} due east, ${N(north)} due north, and a third force $F$.`,
    pool: [
      numeric(rng, 'magnitude', c, [sig(east + north), sig(north - east), sig(Math.abs(north - east))], (cl) => `The magnitude of $F$ is ${N(cl)}.`),
      bool('triangle', 'The three forces can be represented by the sides of a triangle taken in order.', true),
      numeric(rng, 'resultant-two', c, [sig(east + north), sig(east * north)], (cl) => `The resultant of the ${N(east)} and ${N(north)} forces has magnitude ${N(cl)}.`),
      bool('direction', '$F$ has a component due south and a component due west.', true),
      bool('sum-zero', 'The vector sum of the three forces is zero.', true),
      bool('largest', '$F$ is the largest of the three forces.', true),
      bool('collinear', 'The three forces all act along the same straight line.', false),
    ],
    params: { east, north, c },
    trap: 'Forces add as vectors: 3 N and 4 N at right angles give 5 N, never 7 N.',
    note: (kinds) => {
      const parts = [`The resultant of the two given forces is $\\sqrt{${num(east)}^2 + ${num(north)}^2} = ${num(c)}$ N pointing north-east, so $F$ is ${num(c)} N in the opposite direction (south-west).`];
      if (has(kinds, 'triangle', 'sum-zero', 'collinear')) parts.push('Three forces in equilibrium have zero vector sum, so they close a triangle and cannot be collinear unless all three act along one line.');
      return parts.join(' ');
    },
    exclusive: [['magnitude', 'resultant-two']],
    // definitions alone ("sum zero", "triangle", "largest") would make this answerable without any work
    requireAny: ['magnitude', 'resultant-two'],
  };
}

// ------------------------------------------------------------------------------------------ assembly

function pickScenario(rng: RNG, level: Level): Scenario | null {
  const fns: ((rng: RNG) => Scenario | null)[] = level === 1 ? [rodOnPivot]
    : level === 2 ? [floatingBlock, floatingBlock, rodOnPivot]
    : level === 3 ? [beamOnSupports, beamOnSupports, floatingBlock]
    : level === 4 ? [(r) => diver(r, 4), (r) => diver(r, 4), (r) => hydraulicJack(r, 4)]
    : [(r) => hydraulicJack(r, 5), threeForces, (r) => diver(r, 5)];
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const s = f(rng);
    if (s) return s;
  }
  return null;
}

/** Recompute a statement's truth from the raw numbers with an explicit calculation. */
function truthOf(scenario: string, kind: string, claim: number, p: Record<string, number>): boolean | null {
  switch (scenario) {
    case 'rod': {
      const m1 = p.F1 * p.d1, m2 = p.F2 * p.d2;
      if (p.F1 === p.F2) return null; // "the 60 N force" would name both
      switch (kind) {
        case 'moment1': return eq(claim, m1);
        case 'moment2': return eq(claim, m2);
        case 'balanced': return eq(m1, m2);
        case 'turns-towards-1': return m1 > m2 + 1e-9;
        case 'bigger-moment-1': return m1 > m2 + 1e-9;
        case 'double-distance': return true;
        case 'pivot-force': return eq(m1, m2) && eq(claim, p.F1 + p.F2);
      }
      return null;
    }
    case 'float': {
      // weight = upthrust = weight of the displaced liquid
      const vSub = p.f * p.V * 1e-6;
      const upthrust = p.rhoF * vSub * G;
      const mass = upthrust / G;
      const density = mass / (p.V * 1e-6);
      switch (kind) {
        case 'upthrust-equals-weight': return true;
        case 'density': return eq(claim, density);
        case 'upthrust': return eq(claim, upthrust);
        case 'mass': return eq(claim, mass);
        case 'denser-liquid': return true;
        // neutral buoyancy would make this statement a matter of opinion
        case 'floats-in-other': return Math.abs(p.other - density) < 0.1 * density ? null : density < p.other;
        case 'volume-submerged': return eq(claim * 1e-6, vSub);
      }
      return null;
    }
    case 'supports': {
      // reactions from moments about each support in turn
      const RA = (p.Wb * (p.L / 2) + p.W * (p.L - p.d)) / p.L;
      const RB = (p.Wb * (p.L / 2) + p.W * p.d) / p.L;
      if (!eq(RA + RB, p.Wb + p.W)) return null;
      switch (kind) {
        case 'ra-greater': return RA > RB + 1e-9;
        case 'sum': return eq(claim, RA + RB);
        case 'ra': return eq(claim, RA);
        case 'rb': return eq(claim, RB);
        case 'equal-at-centre': return true;
        case 'half-each': return eq(RA, RB);
      }
      return null;
    }
    case 'diver': {
      // pressure from the weight of a column of liquid standing on an area A0
      const A0 = 3;
      const pw = (p.rho * A0 * p.h * G) / A0 / 1000;
      const total = pw + P_ATM;
      switch (kind) {
        case 'water-pressure': return eq(claim, pw);
        case 'total-pressure': return eq(claim, total);
        case 'double-total': return eq(2 * pw + P_ATM, 2 * total);
        case 'double-liquid': return eq((p.rho * 2 * p.h * G) / 1000, 2 * pw);
        case 'force': return eq(claim, total * 1000 * p.A);
        case 'all-directions': return true;
        case 'depends-on-area': return false;
        // the extra column of liquid between head and feet, by the same route
        case 'head-feet': return eq(claim, (p.rho * A0 * p.gap * G) / A0 / 1000);
      }
      return null;
    }
    case 'jack': {
      const pressure = p.F1 / (p.a1 * 1e-4); // Pa
      const F2 = pressure * p.a2 * 1e-4;
      const d2 = (p.a1 * p.d1) / p.a2; // equal volumes swept
      switch (kind) {
        case 'force2': return eq(claim, F2);
        case 'same-pressure': return true;
        case 'small-moves-further': return p.d1 > d2 + 1e-9;
        case 'work-multiplied': return F2 * d2 > p.F1 * p.d1 + 1e-9;
        case 'pressure': return eq(claim, pressure / 1000);
        case 'distance2': return eq(claim, d2);
        // the work reached through the big piston: F2 (from the pressure) times the distance it rises
        case 'work': return eq(claim, (F2 * d2) / 100);
      }
      return null;
    }
    case 'three-forces': {
      const r2 = p.east * p.east + p.north * p.north;
      switch (kind) {
        case 'magnitude': return eq(claim * claim, r2);
        case 'resultant-two': return eq(claim * claim, r2);
        case 'triangle': return true;
        case 'direction': return p.east > 0 && p.north > 0;
        case 'sum-zero': return true;
        case 'largest': return r2 > p.east * p.east && r2 > p.north * p.north;
        case 'collinear': return false;
      }
      return null;
    }
  }
  return null;
}

export default defineTemplate({
  id: 'phy.statics.which-statements',
  module: 'PHY',
  topic: 'statics',
  title: 'Which statements are true (equilibrium, pressure, floating)',
  levels: {
    1: 'light rod on a pivot: moments, balance, which way it turns',
    2: 'block floating with a stated fraction submerged: upthrust, density, another liquid',
    3: 'uniform beam on two supports: which reaction is bigger, their sum and their values',
    4: 'diver at depth: liquid pressure, total pressure with atmospheric, force on an area',
    5: 'deep diver (head-to-feet pressure difference); hydraulic jack with a large area ratio and the work done; three forces in equilibrium',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      const sc = pickScenario(rng, level);
      if (!sc) return null;
      const chosen = rng.pickDistinct(sc.pool, 3);
      const kinds = chosen.map((s) => s.kind);
      for (const [x, y] of sc.exclusive ?? []) if (kinds.includes(x) && kinds.includes(y)) return null;
      if (sc.requireAny && !kinds.some((k) => sc.requireAny!.includes(k))) return null;
      const truth = chosen.map((s) => s.truth) as [boolean, boolean, boolean];
      const options = statementOptions(truth);
      const correct = options.find((o) => o.correct)!.display;
      const stem = `${sc.intro}\n\nWhich of the following statements are true?\n\nI. ${chosen[0].text}\nII. ${chosen[1].text}\nIII. ${chosen[2].text}`;
      const verdicts = chosen.map((s, i) => `${['I', 'II', 'III'][i]}: ${s.truth ? 'true' : 'false'}`).join('; ');
      return {
        stem,
        answer: { kind: 'choice' as const, value: correct },
        options,
        solution: `${verdicts}. ${sc.note(kinds)}`,
        trap: sc.trap,
        tags: ['statics', 'statements', sc.scenario],
        params: { scenario: sc.scenario, ...sc.params, statements: chosen.map((s) => ({ kind: s.kind, claim: s.claim })), truth },
        typedAllowed: false,
      };
    });
  },
  verify(q) {
    if (q.answer.kind !== 'choice') return false;
    const p = q.params as Record<string, number> & { scenario: string; statements: { kind: string; claim: number }[]; truth: boolean[] };
    // the three statements must be distinguishable: two identical texts cannot have opposite truth values
    const texts = q.stem.split('\n').filter((l) => /^(I|II|III)\. /.test(l)).map((l) => l.replace(/^(I|II|III)\. /, '').trim());
    if (texts.length !== 3 || new Set(texts).size !== 3) return false;
    const truth: boolean[] = [];
    for (const s of p.statements) {
      const t = truthOf(p.scenario, s.kind, s.claim, p);
      if (t === null) return false;
      truth.push(t);
    }
    if (truth.length !== 3 || truth.some((t, i) => t !== p.truth[i])) return false;
    // rebuild the expected option text independently of statementOptions
    const names = ['I', 'II', 'III'].filter((_, i) => truth[i]);
    let expected: string;
    if (names.length === 0) expected = 'none of them';
    else if (names.length === 3) expected = 'I, II and III';
    else if (names.length === 1) expected = `${names[0]} only`;
    else expected = `${names[0]} and ${names[1]} only`;
    return STATEMENT_COMBOS.includes(expected) && q.answer.value === expected && q.options.filter((o) => o.correct).length === 1;
  },
});
