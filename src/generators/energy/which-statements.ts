import { defineTemplate, retry, type Level } from '../../core/template';
import { statementOptions, STATEMENT_COMBOS } from '../../core/options';
import type { RNG } from '../../core/rng';

/**
 * "Which of the following statements are true?" about energy and power (g = 10 m s^-2).
 * Scenarios: a ball falling with air resistance, a car braking to rest, a compressed spring, a lift raised at
 * constant speed, a bouncing ball. Each question takes three statements from the scenario's pool; a statement is
 * either qualitative (conservation with a dissipative force, KE ∝ v² not v, power versus energy, tension at constant
 * speed) or numeric with a computed claim that is either the true value or the value a named mistake gives.
 * Level 1: the three easiest statements, mostly qualitative plus a one-step number
 * Level 2: one two-step number (work against air resistance, braking force, power)
 * Level 3: two numbers, e.g. deceleration and stopping time, launch speed, percentage of the speed kept
 * Level 4: percentages of energy versus speed, input power with an efficiency, launch height
 * Level 5: energy wasted by the motor, the height after a second bounce, average braking power
 */

const G = 10;
const TAKE_G = 'Take $g = 10\\ \\text{m s}^{-2}$.';
const MS = '\\text{m s}^{-1}';

interface Stmt {
  key: string;
  text: string;
  truth: boolean;
  /** the number quoted in a numeric statement (null for a qualitative one) */
  claim: number | null;
  tier: number;
  /** at most one statement per group is used in a question */
  group?: string;
  /** short reason for the solution */
  why: string;
}

interface Built {
  intro: string;
  params: Record<string, number>;
  pool: Stmt[];
}

/** Plain number: 1200, 0.05, 22.5. */
const n = (x: number): string => (Number.isInteger(x) ? `${x}` : `${Number(x.toPrecision(10))}`);
/** Round away floating-point noise. */
const r = (x: number): number => Number(x.toPrecision(12));
/** Reads as an exam number: at most two decimal places, positive, not huge. */
const tidy = (x: number): boolean => x > 0 && x < 1e6 && Number.isInteger(r(x * 100));
/** One decimal place at most. */
const tidy1 = (x: number): boolean => tidy(x) && Number.isInteger(r(x * 10));
const val = (x: number, unit: string): string => `$${n(x)}${unit ? `\\ ${unit}` : ''}$`;
const pct = (x: number): string => `$${n(x)}\\%$`;

/** A numeric statement: the quoted value is the true one or one of the mistake values, at random. */
function numeric(rng: RNG, key: string, tier: number, trueVal: number, falseVals: number[], render: (x: number) => string, why: string, group?: string): Stmt | null {
  if (!tidy(trueVal)) return null;
  const falses = falseVals.map(r).filter((f) => tidy(f) && Math.abs(f - trueVal) > 1e-9);
  const useTrue = falses.length === 0 || rng.bool(0.5);
  const claim = useTrue ? r(trueVal) : rng.pick(falses);
  return { key, text: render(claim), truth: useTrue, claim, tier, group, why };
}

/** A qualitative statement shown in its true or its false wording, at random. */
function qual(rng: RNG, key: string, tier: number, trueText: string, falseText: string, why: string): Stmt {
  const t = rng.bool(0.5);
  return { key, text: t ? trueText : falseText, truth: t, claim: null, tier, why };
}

const keep = (xs: (Stmt | null)[]): Stmt[] => xs.filter((s): s is Stmt => s !== null);

// ----------------------------------------------------------------------------- scenarios

function fall(rng: RNG): Built | null {
  const m = rng.pick([0.5, 1, 2, 4, 5]);
  const h = rng.pick([20, 45, 80, 125]);
  const vFree = Math.sqrt(2 * G * h);
  const frac = rng.pick([0.4, 0.5, 0.6, 0.8]);
  const v = r(vFree * frac);
  const KE = r(0.5 * m * v * v), PE = m * G * h, W = r(PE - KE), R = r(W / h);
  const pctLost = r(100 * (1 - frac * frac)), pctSpeedLost = r(100 * (1 - frac));
  if (!Number.isInteger(KE) || !tidy1(R)) return null;
  return {
    intro: `A ball of mass ${n(m)} kg is dropped from rest from a height of ${h} m and hits the ground at $${n(v)}\\ ${MS}$. Air resistance acts on the ball throughout the fall. ${TAKE_G}`,
    params: { m, h, v },
    pool: keep([
      qual(rng, 'me-conserved', 1,
        'The kinetic energy of the ball on hitting the ground is less than the gravitational potential energy it has lost.',
        'The total mechanical energy of the ball is conserved during the fall.',
        `air resistance does work on the ball, so mechanical energy is not conserved: KE on impact ($${n(KE)}$ J) is less than the PE lost ($${PE}$ J)`),
      numeric(rng, 'gpe-loss', 1, PE, [m * h, PE / 2], (x) => `The ball loses ${val(x, '\\text{J}')} of gravitational potential energy.`, `PE lost $= mgh = ${n(m)} \\times 10 \\times ${h} = ${PE}$ J`),
      numeric(rng, 'ke-impact', 1, KE, [m * v * v, 0.5 * m * v], (x) => `The kinetic energy of the ball just before it hits the ground is ${val(x, '\\text{J}')}.`, `KE $= \\tfrac12 m v^2 = \\tfrac12 \\times ${n(m)} \\times ${n(v)}^2 = ${n(KE)}$ J`),
      qual(rng, 'ke-double', 2,
        'If the ball hit the ground at twice the speed, its kinetic energy on impact would be four times as great.',
        'If the ball hit the ground at twice the speed, its kinetic energy on impact would be twice as great.',
        'KE ∝ v², so doubling the speed quadruples the kinetic energy'),
      numeric(rng, 'work-air', 2, W, [PE - m * v * v, PE, KE], (x) => `The work done against air resistance during the fall is ${val(x, '\\text{J}')}.`, `work against air resistance $= mgh - \\tfrac12 m v^2 = ${PE} - ${n(KE)} = ${n(W)}$ J`),
      numeric(rng, 'no-air-speed', 2, vFree, [v], (x) => `If there were no air resistance, the ball would hit the ground at ${val(x, MS)}.`, `without air resistance $v = \\sqrt{2gh} = \\sqrt{${2 * G * h}} = ${n(vFree)}$ m s$^{-1}$`),
      numeric(rng, 'avg-resistance', 3, R, [KE / h, m * G], (x) => `The average force of air resistance on the ball during the fall is ${val(x, '\\text{N}')}.`, `average resistance $= \\dfrac{\\text{work against air resistance}}{h} = \\dfrac{${n(W)}}{${h}} = ${n(R)}$ N`),
      numeric(rng, 'ke-pct', 3, r(100 * frac * frac), [100 * frac], (x) => `The kinetic energy of the ball on impact is ${pct(x)} of the gravitational potential energy it has lost.`, `KE/PE $= ${n(KE)}/${PE} = ${n(frac * frac)}$, i.e. $${n(100 * frac * frac)}\\%$ (the speed ratio is $${n(frac)}$, the energy ratio is its square)`, 'pct'),
      numeric(rng, 'pct-lost', 4, pctLost, [pctSpeedLost], (x) => `${pct(x)} of the gravitational potential energy the ball loses is transferred to the air.`, `fraction lost $= 1 - \\dfrac{${n(KE)}}{${PE}} = ${n(1 - frac * frac)}$, i.e. $${n(pctLost)}\\%$ (not $${n(pctSpeedLost)}\\%$, which is the fraction of the speed lost)`, 'pct'),
    ]),
  };
}

function brake(rng: RNG): Built | null {
  const m = rng.pick([800, 1000, 1200, 1500, 2000]);
  const v = rng.pick([10, 15, 20, 25, 30]);
  const d = rng.pick([20, 25, 40, 45, 50, 60, 75, 80, 90, 100, 125]);
  const KE = 0.5 * m * v * v, KEkJ = r(KE / 1000);
  const F = r(KE / d);
  const a = r((v * v) / (2 * d));
  const t = r((2 * d) / v);
  const PkW = r(KE / t / 1000);
  if (!tidy1(KEkJ) || !Number.isInteger(F) || !tidy(a) || !tidy1(t) || !tidy1(PkW)) return null;
  return {
    intro: `A car of mass ${m} kg travelling at $${v}\\ ${MS}$ along a level road is brought to rest by its brakes in a distance of ${d} m. The braking force is constant and other resistive forces are negligible.`,
    params: { m, v, d },
    pool: keep([
      qual(rng, 'work-eq-ke', 1,
        'The work done by the brakes is equal to the initial kinetic energy of the car.',
        'The work done by the brakes is equal to half the initial kinetic energy of the car.',
        'the brakes are the only force doing work, so the work they do equals the whole of the initial kinetic energy'),
      numeric(rng, 'ke-initial', 1, KEkJ, [(m * v * v) / 1000, (0.5 * m * v) / 1000], (x) => `The initial kinetic energy of the car is ${val(x, '\\text{kJ}')}.`, `KE $= \\tfrac12 m v^2 = \\tfrac12 \\times ${m} \\times ${v}^2 = ${n(KE)}$ J $= ${n(KEkJ)}$ kJ`),
      qual(rng, 'ke-double', 1,
        'Doubling the speed of the car would make its kinetic energy four times as great.',
        'Doubling the speed of the car would double its kinetic energy.',
        'KE ∝ v², so doubling the speed quadruples the kinetic energy'),
      numeric(rng, 'force', 2, F, [2 * F, F / 2, (m * v) / d], (x) => `The braking force is ${val(x, '\\text{N}')}.`, `$Fd = \\tfrac12 m v^2$, so $F = \\dfrac{${n(KE)}}{${d}} = ${n(F)}$ N`),
      numeric(rng, 'dist-double', 3, 4 * d, [2 * d], (x) => `With the same braking force, a car of the same mass travelling at $${2 * v}\\ ${MS}$ would stop in ${val(x, '\\text{m}')}.`, `stopping distance $= \\dfrac{\\tfrac12 m v^2}{F}$ ∝ $v^2$, so doubling the speed quadruples it: $${4 * d}$ m`),
      numeric(rng, 'decel', 3, a, [(v * v) / d, v / d], (x) => `The deceleration of the car is ${val(x, '\\text{m s}^{-2}')}.`, `$a = \\dfrac{F}{m} = \\dfrac{${n(F)}}{${m}} = ${n(a)}$ m s$^{-2}$ (or $v^2 = 2ad$)`),
      numeric(rng, 'time', 3, t, [d / v], (x) => `The car takes ${val(x, '\\text{s}')} to stop.`, `with constant deceleration the average speed is $\\tfrac12 v$, so $t = \\dfrac{${d}}{${v / 2}} = ${n(t)}$ s`),
      numeric(rng, 'power', 5, PkW, [2 * PkW, KEkJ], (x) => `The average rate at which the brakes transfer energy is ${val(x, '\\text{kW}')}.`, `average power $= \\dfrac{\\text{KE}}{t} = \\dfrac{${n(KE)}}{${n(t)}} = ${n(PkW * 1000)}$ W $= ${n(PkW)}$ kW`),
    ]),
  };
}

/** (k, m) with k/m a perfect square, so the launch speed x√(k/m) is a whole multiple of x. */
const SPRING_PAIRS: [number, number][] = [
  [100, 1], [400, 1], [900, 1], [200, 0.5], [800, 0.5], [100, 0.25], [400, 0.25],
  [40, 0.1], [90, 0.1], [160, 0.1], [250, 0.1], [360, 0.1], [1000, 0.1], [80, 0.2], [180, 0.2], [320, 0.2], [500, 0.2],
];

function spring(rng: RNG): Built | null {
  const [k, m] = rng.pick(SPRING_PAIRS);
  const xcm = rng.pick([5, 10, 20, 25, 40, 50]);
  const x = xcm / 100;
  const v = r(x * Math.sqrt(k / m));
  const Ev = r(0.5 * k * x * x), F = r(k * x), h = r(Ev / (m * G));
  if (!Number.isInteger(v) || v < 1 || !tidy1(Ev) || Ev < 0.5 || !tidy(F) || !tidy1(h) || h < 0.5) return null;
  return {
    intro: `A spring of stiffness ${k} $\\text{N m}^{-1}$ is compressed by ${xcm} cm and held against a block of mass ${n(m)} kg on a smooth horizontal surface. ${TAKE_G}`,
    params: { k, m, xcm },
    pool: keep([
      numeric(rng, 'epe', 1, Ev, [k * x * x, 0.5 * k * x], (x) => `The elastic potential energy stored in the spring is ${val(x, '\\text{J}')}.`, `EPE $= \\tfrac12 k x^2 = \\tfrac12 \\times ${k} \\times ${n(x)}^2 = ${n(Ev)}$ J`),
      numeric(rng, 'force', 1, F, [0.5 * k * x, 2 * k * x], (x) => `The force needed to hold the spring compressed is ${val(x, '\\text{N}')}.`, `$F = kx = ${k} \\times ${n(x)} = ${n(F)}$ N`),
      qual(rng, 'force-double', 1,
        'Doubling the compression would double the force needed to hold the spring.',
        'Doubling the compression would make the force needed to hold the spring four times as great.',
        'F = kx is proportional to x: doubling x doubles the force (it is the energy that quadruples)'),
      qual(rng, 'epe-double', 2,
        'Doubling the compression would make the energy stored four times as great.',
        'Doubling the compression would double the energy stored in the spring.',
        'EPE = ½kx² ∝ x²: doubling x quadruples the energy'),
      qual(rng, 'work-fx', 2,
        'The work done in compressing the spring equals half the final force multiplied by the compression.',
        'The work done in compressing the spring equals the final force multiplied by the compression.',
        'the force grows from 0 to kx, so the work is the average force ½kx times x, i.e. ½kx²'),
      numeric(rng, 'launch-speed', 3, v, [v * v, 2 * v], (x) => `When the spring is released, the block leaves it at ${val(x, MS)}.`, `$\\tfrac12 k x^2 = \\tfrac12 m v^2$ gives $v = x\\sqrt{k/m} = ${n(x)} \\times ${n(Math.sqrt(k / m))} = ${v}$ m s$^{-1}$`),
      numeric(rng, 'launch-height', 4, h, [2 * h, Ev / m], (x) => `If the same spring launched the block vertically upwards, the block would rise ${val(x, '\\text{m}')} above its starting point.`, `$\\tfrac12 k x^2 = mgh$ gives $h = \\dfrac{${n(Ev)}}{${n(m)} \\times 10} = ${n(h)}$ m`),
      qual(rng, 'mass-double', 4,
        'If the mass of the block were doubled, its kinetic energy on leaving the spring would be unchanged.',
        'If the mass of the block were doubled, its speed on leaving the spring would be halved.',
        'the block always receives the whole ½kx²: the kinetic energy is unchanged, and v ∝ 1/√m, so the speed falls by a factor of √2, not 2'),
    ]),
  };
}

function lift(rng: RNG): Built | null {
  const m = rng.pick([400, 500, 600, 800, 1000, 1200]);
  const h = rng.pick([6, 8, 10, 12, 15, 20, 24, 30]);
  const t = rng.pick([4, 5, 6, 8, 10, 12, 15, 20, 24, 30]);
  const e = rng.pick([40, 50, 60, 75, 80]);
  const W = m * G * h, WkJ = W / 1000;
  const PkW = r(W / t / 1000);
  const PinkW = r((PkW * 100) / e);
  const wastedkJ = r((PinkW - PkW) * t);
  if (!Number.isInteger(WkJ) || !tidy1(PkW) || !tidy1(PinkW) || !tidy1(wastedkJ)) return null;
  return {
    intro: `A lift of total mass ${m} kg is raised ${h} m in ${t} s at constant speed by an electric motor. ${TAKE_G}`,
    params: { m, h, t, e },
    pool: keep([
      qual(rng, 'tension', 1,
        'The tension in the cable is equal to the weight of the lift.',
        'The tension in the cable is greater than the weight of the lift.',
        'at constant speed the resultant force is zero, so the tension equals the weight'),
      qual(rng, 'ke', 1,
        'The kinetic energy of the lift is constant as it rises.',
        'The kinetic energy of the lift increases as it rises.',
        'the speed is constant, so the kinetic energy does not change; all the work goes into potential energy'),
      numeric(rng, 'gpe-gain', 1, WkJ, [(m * h) / 1000, WkJ / 2], (x) => `The lift gains ${val(x, '\\text{kJ}')} of gravitational potential energy.`, `PE gained $= mgh = ${m} \\times 10 \\times ${h} = ${W}$ J $= ${WkJ}$ kJ`, 'W'),
      numeric(rng, 'work-motor', 2, WkJ, [WkJ / 2, (W * t) / 1000], (x) => `The work done by the motor on the lift is ${val(x, '\\text{kJ}')}.`, `work done $=$ PE gained $= mgh = ${WkJ}$ kJ (no change in KE)`, 'W'),
      numeric(rng, 'power', 2, PkW, [WkJ, (m * h) / t / 1000], (x) => `The useful power output of the motor is ${val(x, '\\text{kW}')}.`, `power $= \\dfrac{mgh}{t} = \\dfrac{${W}}{${t}} = ${n(PkW * 1000)}$ W $= ${n(PkW)}$ kW`),
      qual(rng, 'half-time', 3,
        'If the lift were raised through the same height in half the time, the useful power output would be doubled.',
        'If the lift were raised through the same height in half the time, the work done on the lift would be doubled.',
        'the work mgh is fixed by the height; halving the time doubles the power, not the work'),
      numeric(rng, 'input-power', 4, PinkW, [(PkW * e) / 100, (PkW * 100) / (100 - e), (PkW * (100 + e)) / 100], (x) => `If the motor is ${e}% efficient, its electrical input power is ${val(x, '\\text{kW}')}.`, `input $= \\dfrac{\\text{useful}}{\\text{efficiency}} = \\dfrac{${n(PkW)}}{${n(e / 100)}} = ${n(PinkW)}$ kW`),
      numeric(rng, 'wasted', 5, wastedkJ, [WkJ * (1 - e / 100), PinkW - PkW], (x) => `If the motor is ${e}% efficient, the energy wasted by the motor during the lift is ${val(x, '\\text{kJ}')}.`, `input energy $= \\dfrac{${WkJ}}{${n(e / 100)}} = ${n(WkJ / (e / 100))}$ kJ, so wasted $= ${n(WkJ / (e / 100))} - ${WkJ} = ${n(wastedkJ)}$ kJ`),
    ]),
  };
}

function bounce(rng: RNG): Built | null {
  const H = rng.pick([5, 20, 45, 80]);
  const ratio = rng.pick([0.04, 0.09, 0.16, 0.25, 0.36, 0.49, 0.64, 0.81]);
  const h = r(H * ratio);
  const m = rng.pick([0.1, 0.2, 0.5, 1]);
  if (!tidy1(h) || h < 0.5) return null;
  const u = Math.sqrt(2 * G * H), w = r(Math.sqrt(2 * G * h));
  const pctKept = r(100 * ratio), pctLost = r(100 - pctKept), speedPct = r(100 * Math.sqrt(ratio));
  const lossJ = r(m * G * (H - h)), gpeTop = r(m * G * h);
  const h2 = r((h * h) / H);
  if (!Number.isInteger(w) || !tidy(lossJ) || !tidy(gpeTop)) return null;
  return {
    intro: `A ball of mass ${n(m)} kg is dropped from a height of ${H} m onto a hard floor and rebounds to a height of ${n(h)} m. Air resistance is negligible. ${TAKE_G}`,
    params: { H, h, m },
    pool: keep([
      qual(rng, 'ke-conserved', 1,
        'Some of the kinetic energy of the ball is transferred to thermal energy and sound during the bounce.',
        'The kinetic energy of the ball is conserved in the bounce.',
        `the ball rebounds to a lower height, so it has lost kinetic energy in the bounce (to thermal energy and sound)`),
      numeric(rng, 'impact-speed', 1, u, [w, H], (x) => `The ball hits the floor at ${val(x, MS)}.`, `impact speed $= \\sqrt{2gH} = \\sqrt{${2 * G * H}} = ${n(u)}$ m s$^{-1}$`),
      numeric(rng, 'gpe-top', 1, gpeTop, [m * G * H, m * h], (x) => `At the top of its rebound the gravitational potential energy of the ball, relative to the floor, is ${val(x, '\\text{J}')}.`, `PE at the top of the rebound $= mgh = ${n(m)} \\times 10 \\times ${n(h)} = ${n(gpeTop)}$ J`),
      numeric(rng, 'rebound-speed', 2, w, [ratio * u, u / 2], (x) => `The ball leaves the floor at ${val(x, MS)}.`, `rebound speed $= \\sqrt{2gh} = \\sqrt{${n(2 * G * h)}} = ${w}$ m s$^{-1}$ (speed scales with $\\sqrt{h}$, not $h$)`),
      numeric(rng, 'ke-loss', 2, lossJ, [m * G * h, lossJ / 2], (x) => `The ball loses ${val(x, '\\text{J}')} of kinetic energy in the bounce.`, `KE lost $= mg(H - h) = ${n(m)} \\times 10 \\times ${n(H - h)} = ${n(lossJ)}$ J`),
      numeric(rng, 'speed-pct', 3, speedPct, [pctKept], (x) => `The speed of the ball just after the bounce is ${pct(x)} of its speed just before.`, `speed ratio $= \\sqrt{h/H} = \\sqrt{${n(ratio)}} = ${n(speedPct / 100)}$, i.e. $${n(speedPct)}\\%$`, 'pct'),
      numeric(rng, 'pct-lost', 4, pctLost, [100 - speedPct], (x) => `The ball loses ${pct(x)} of its kinetic energy in the bounce.`, `KE kept $= h/H = ${n(ratio)}$, so $${n(pctLost)}\\%$ is lost (the speed falls by only $${n(100 - speedPct)}\\%$)`, 'pct'),
      tidy(h2) && h2 >= 0.1 ? numeric(rng, 'second-bounce', 5, h2, [2 * h - H, h / 2], (x) => `If the ball loses the same fraction of its kinetic energy at every bounce, it rises to ${val(x, '\\text{m}')} after its second bounce.`, `each bounce keeps the fraction $h/H = ${n(ratio)}$ of the energy, so the second rebound height is $${n(ratio)} \\times ${n(h)} = ${n(h2)}$ m`) : null,
    ]),
  };
}

// ----------------------------------------------------------------------------- selection

/** Three statements for the level: the hardest allowed tier must appear, numbers appear more as the level rises. */
function choose(rng: RNG, pool: Stmt[], level: Level): Stmt[] | null {
  const eligible = pool.filter((s) => s.tier <= level);
  const minHard = level <= 2 ? level : level - 1;
  const hard = eligible.filter((s) => s.tier >= minHard);
  if (hard.length === 0) return null;
  const wantHard = level === 1 ? 3 : level >= 4 ? 2 : 1;
  const chosen: Stmt[] = [];
  const usedGroups = new Set<string>();
  const take = (s: Stmt) => {
    if (chosen.some((c) => c.key === s.key) || (s.group && usedGroups.has(s.group))) return;
    // Two statements quoting the same number (an impact speed of 14 and a rebound speed of 14) are
    // visibly mutually exclusive, so a candidate deletes two of the eight combinations for free.
    if (s.claim !== null && chosen.some((c) => c.claim !== null && Math.abs(c.claim - s.claim!) < 1e-9)) return;
    chosen.push(s);
    if (s.group) usedGroups.add(s.group);
  };
  for (const s of rng.shuffle(hard)) { if (chosen.length >= wantHard) break; take(s); }
  for (const s of rng.shuffle(eligible)) { if (chosen.length >= 3) break; take(s); }
  if (chosen.length < 3) return null;
  const numbers = chosen.filter((s) => s.claim !== null).length;
  if ((level >= 2 && numbers < 1) || (level >= 3 && numbers < 2)) return null;
  return rng.shuffle(chosen);
}

const SCENARIOS: Record<string, (rng: RNG) => Built | null> = { fall, brake, spring, lift, bounce };

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'phy.energy.which-statements',
  module: 'PHY',
  topic: 'energy',
  title: 'Which statements are true (energy & power)',
  levels: {
    1: 'three easy statements: conservation with a dissipative force, KE ∝ v², one one-step number',
    2: 'one two-step number (work against air resistance, braking force, power) plus qualitative statements',
    3: 'two computed numbers, e.g. deceleration and stopping time, launch speed, speed ratio after a bounce',
    4: 'percentage of energy versus speed, input power with an efficiency, launch height',
    5: 'energy wasted by the motor, average braking power, height after a second bounce',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      const scenario = rng.pick(Object.keys(SCENARIOS));
      const built = SCENARIOS[scenario](rng);
      if (!built) return null;
      const stmts = choose(rng, built.pool, level);
      if (!stmts) return null;
      const truth = stmts.map((s) => s.truth) as [boolean, boolean, boolean];
      const options = statementOptions(truth);
      const correct = options.find((o) => o.correct)!.display;
      const stem = `${built.intro}\n\nWhich of the following statements are true?\n\nI. ${stmts[0].text}\nII. ${stmts[1].text}\nIII. ${stmts[2].text}`;
      const solution = stmts.map((s, i) => `${['I', 'II', 'III'][i]}: ${s.truth ? 'true' : 'false'} — ${s.why}.`).join(' ');
      return {
        stem,
        answer: { kind: 'choice' as const, value: correct },
        options,
        solution,
        trap: 'Kinetic energy goes with v², not v; mechanical energy is only conserved without friction or air resistance; power is energy per second, not energy.',
        tags: ['energy', 'statements', scenario],
        params: { scenario, ...built.params, truth, stmts: stmts.map((s) => ({ key: s.key, claim: s.claim, text: s.text })) },
        typedAllowed: false,
      };
    });
  },
  verify(q) {
    if (q.answer.kind !== 'choice') return false;
    const p = q.params as Record<string, number> & { scenario: string; stmts: { key: string; claim: number | null; text: string }[] };
    const close = (a: number, b: number) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b));

    /** The true value of a numeric statement, by a route different from the generator's. */
    const trueValue = (key: string): number | null => {
      switch (p.scenario) {
        case 'fall': {
          // SUVAT: the net deceleration-free acceleration over the drop, then forces and work from it
          const aNet = (p.v * p.v) / (2 * p.h);
          const Fnet = p.m * aNet, R = p.m * G - Fnet;
          const KE = Fnet * p.h, PE = p.m * G * p.h, W = R * p.h;
          const tFree = Math.sqrt((2 * p.h) / G);
          return { 'gpe-loss': PE, 'ke-impact': KE, 'work-air': W, 'no-air-speed': G * tFree, 'avg-resistance': R, 'ke-pct': (100 * KE) / PE, 'pct-lost': (100 * W) / PE }[key] ?? null;
        }
        case 'brake': {
          const a = (p.v * p.v) / (2 * p.d);
          const F = p.m * a, t = p.v / a;
          return { 'ke-initial': (F * p.d) / 1000, force: F, 'dist-double': ((2 * p.v) ** 2) / (2 * a), decel: a, time: t, power: (F * p.d) / t / 1000 }[key] ?? null;
        }
        case 'spring': {
          const x = p.xcm / 100;
          const Ev = 0.5 * (p.k * x) * x; // area under the F–x line
          const v = Math.sqrt((2 * Ev) / p.m);
          return { epe: Ev, force: p.k * x, 'launch-speed': v, 'launch-height': (v * v) / (2 * G) }[key] ?? null;
        }
        case 'lift': {
          const P = (p.m * G * (p.h / p.t)) / 1000; // force × velocity, kW
          const Pin = (P * 100) / p.e;
          return { 'gpe-gain': (p.m * G * p.h) / 1000, 'work-motor': P * p.t, power: P, 'input-power': Pin, wasted: (Pin - P) * p.t }[key] ?? null;
        }
        case 'bounce': {
          const u = G * Math.sqrt((2 * p.H) / G), w = G * Math.sqrt((2 * p.h) / G);
          const keep = (w * w) / (u * u);
          return { 'impact-speed': u, 'gpe-top': p.m * G * p.h, 'rebound-speed': w, 'ke-loss': 0.5 * p.m * (u * u - w * w), 'speed-pct': (100 * w) / u, 'pct-lost': 100 * (1 - keep), 'second-bounce': p.h * keep }[key] ?? null;
        }
        default:
          return null;
      }
    };
    /** Truth of a qualitative statement read back from its wording. */
    const qualTruth = (key: string, text: string): boolean | null => {
      switch (key) {
        case 'me-conserved': return /less than/.test(text) && !/conserved/.test(text);
        case 'ke-double':
        case 'epe-double': return /four times/.test(text);
        case 'work-eq-ke': return !/half/.test(text);
        case 'force-double': return !/four times/.test(text);
        case 'work-fx': return /half/.test(text);
        case 'mass-double': return /unchanged/.test(text);
        case 'tension': return /equal to/.test(text);
        case 'ke': return /constant/.test(text);
        case 'half-time': return /power/.test(text);
        case 'ke-conserved': return /thermal/.test(text);
        default: return null;
      }
    };
    const truth: boolean[] = [];
    for (const s of p.stmts) {
      if (s.claim === null) {
        const t = qualTruth(s.key, s.text);
        if (t === null) return false;
        truth.push(t);
      } else {
        const expected = trueValue(s.key);
        if (expected === null) return false;
        truth.push(close(s.claim, expected));
      }
    }
    const names = ['I', 'II', 'III'].filter((_, i) => truth[i]);
    let expected: string;
    if (names.length === 0) expected = 'none of them';
    else if (names.length === 3) expected = 'I, II and III';
    else if (names.length === 1) expected = `${names[0]} only`;
    else expected = `${names[0]} and ${names[1]} only`;
    return STATEMENT_COMBOS.includes(expected) && q.answer.value === expected && q.options.filter((o) => o.correct).length === 1;
  },
});
