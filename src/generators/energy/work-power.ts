import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, Exact, surd } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import type { RNG } from '../../core/rng';

/**
 * Work, power and efficiency (g = 10 m s^-2 wherever a weight is involved).
 * Level 1: W = Fd, P = W/t, P = Fd/t with clean numbers
 * Level 2: P = Fv for a car at constant speed on the level (driving force = resistance), or F = P/v, v = P/F
 * Level 3: efficiency = useful/total as a percentage; the input power required; the energy wasted
 * Level 4: motor / crane / pump raising a load: P = mgh/t; work done against friction on a ramp
 * Level 5: car or cyclist climbing a 30° incline at constant speed, P = (R + mg sin 30°)v; two machines in
 *          series, overall efficiency = product (as a percentage, or the input power required)
 *
 * Answers carry their unit (W, kW, J, kJ, N); percentages are bare numbers with the stem asking for a
 * percentage (the typed-answer parser reads a trailing "%" as ÷100). Every wrong option is a named mistake;
 * parameters that cannot supply four distinct clean ones are redrawn, never padded.
 */

const G = 10;
const U_W = '\\text{W}', U_KW = '\\text{kW}', U_J = '\\text{J}', U_KJ = '\\text{kJ}', U_N = '\\text{N}', U_MS = '\\text{m s}^{-1}';
const SIN30 = 0.5;

type Candidate = { value: Exact | null; trap: string };

/** Plain number for a stem: 1200, 0.05, 22.5. */
const n = (x: number): string => (Number.isInteger(x) ? `${x}` : `${Number(x.toPrecision(10))}`);

function tryE(f: () => Exact): Exact | null {
  try {
    const v = f();
    return Number.isFinite(v.toNumber()) ? v : null;
  } catch {
    return null;
  }
}

/** Positive, finite, clean and exam-sized candidates (percentages: whole numbers or halves). */
function cleanOnly(ds: Candidate[], pct = false): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } => {
    const v = d.value;
    if (!v || !Number.isFinite(v.toNumber()) || v.sign() <= 0 || !isCleanExact(v).ok) return false;
    const x = v.toNumber();
    if (x < 0.001 || x > 2e6) return false;
    if (pct) return v.isRational() && v.toRat().d <= 2n;
    return !v.isRational() || Number.isInteger(Number((x * 1000).toPrecision(12))); // decimals must terminate
  });
}

/** Every distinct `must` trap gets a slot before any `extra` one, so the headline mistakes are never shuffled out. */
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

/** Pick a sub-variant first, then retry its parameters, so rejection rates do not skew the mix of variants. */
function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

interface Pack {
  stem: string;
  answer: Exact;
  unit?: string;
  must: Candidate[];
  extra: Candidate[];
  solution: string;
  trap: string;
  tags: string[];
  params: Record<string, unknown>;
  pct?: boolean;
}

function pack(rng: RNG, p: Pack): Generated | null {
  if (!isCleanExact(p.answer).ok || p.answer.sign() <= 0) return null;
  const ds = ranked(rng, p.answer, cleanOnly(p.must, p.pct), cleanOnly(p.extra, p.pct));
  if (ds.length < 4) return null; // never pad: redraw instead
  return {
    stem: p.stem,
    answer: { kind: 'exact', value: p.answer, format: 'decimal', unit: p.unit },
    options: buildOptions(rng, p.answer, ds, { format: 'decimal', unit: p.unit }),
    solution: p.solution,
    trap: p.trap,
    tags: p.tags,
    params: p.params,
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 1

function workQ(rng: RNG): Generated | null {
  const F = rng.pick([5, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 120, 150, 200, 250, 300, 400, 500]);
  const d = rng.pick([2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50]);
  const W = F * d;
  if (W > 20000) return null;
  const stem = rng.pick([
    `A horizontal force of ${F} N pushes a crate ${d} m across a horizontal floor in the direction of the force. Find the work done by the force.`,
    `A child pulls a sledge ${d} m along level ground using a horizontal force of ${F} N. Find the work done by the child.`,
    `A constant force of ${F} N moves an object ${d} m in the direction of the force. Find the work done by the force.`,
  ]);
  return pack(rng, {
    stem,
    answer: E(W),
    unit: U_J,
    must: [
      { value: E(F + d), trap: 'added the force and the distance instead of multiplying' },
      { value: E(W / 2), trap: 'halved the product as if work were ½Fd' },
    ],
    extra: [
      { value: F % d === 0 ? E(F / d) : d % F === 0 ? E(d / F) : null, trap: 'divided instead of multiplying' },
      { value: E(2 * W), trap: 'doubled the product' },
      { value: E(W / 1000), trap: 'gave the answer in kJ' },
      { value: E(W * 10), trap: 'slipped a decimal place' },
    ],
    solution: `Work done $= Fd = ${F} \\times ${d} = ${W}\\ \\text{J}$.`,
    trap: 'Work is force × distance moved in the direction of the force, with no factor of ½ (that belongs to ½mv² and ½kx²).',
    tags: ['work', 'force', 'distance'],
    params: { variant: 'work', F, d },
  });
}

function powerFromWorkQ(rng: RNG): Generated | null {
  const P = rng.pick([20, 25, 40, 50, 60, 75, 80, 100, 120, 150, 200, 250, 300, 400, 500, 600, 750, 800, 1000, 1200, 1500, 2000]);
  const minutes = rng.bool(0.3);
  const tMin = rng.pick([1, 2, 3, 4, 5, 10]);
  const t = minutes ? 60 * tMin : rng.pick([2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60]);
  const W = P * t;
  const inKJ = W >= 10000 || (W >= 1000 && W % 1000 === 0 && rng.bool(0.5));
  if (inKJ && W % 100 !== 0) return null;
  const energyText = inKJ ? `${n(W / 1000)} kJ` : `${W} J`;
  const timeText = minutes ? `${tMin} minute${tMin === 1 ? '' : 's'}` : `${t} s`;
  const stem = rng.pick([
    `A motor does ${energyText} of work in ${timeText}. Find its average power output.`,
    `An electric heater transfers ${energyText} of energy in ${timeText}. Find its power.`,
    `A crane does ${energyText} of work in ${timeText}. Find the average power developed by the crane.`,
  ]);
  return pack(rng, {
    stem,
    answer: E(P),
    unit: U_W,
    must: [
      { value: E(W * t), trap: 'multiplied energy by time: P = W × t' },
      { value: minutes ? E(W / tMin) : inKJ ? E(W / 1000 / t) : E(W), trap: minutes ? 'used the time in minutes, not seconds' : inKJ ? 'forgot to convert kJ to J' : 'forgot to divide by the time' },
    ],
    extra: [
      { value: E(W), trap: 'gave the energy rather than the power' },
      { value: E(P / 1000), trap: 'gave the answer in kW' },
      { value: E(P * 10), trap: 'slipped a decimal place' },
      { value: E(P / 10), trap: 'slipped a decimal place' },
      { value: E(P * 2), trap: 'doubled the power' },
    ],
    solution: `Power $= \\dfrac{\\text{energy}}{\\text{time}} = \\dfrac{${W}}{${t}} = ${P}\\ \\text{W}$${minutes ? ` (${tMin} min $= ${t}$ s)` : inKJ ? ` (${n(W / 1000)} kJ $= ${W}$ J)` : ''}.`,
    trap: 'Power is energy divided by time in seconds; watts need joules and seconds, so convert kJ and minutes first.',
    tags: ['power', 'energy', 'time'],
    params: { variant: 'power-from-work', W, t },
  });
}

function powerFdtQ(rng: RNG): Generated | null {
  const F = rng.pick([10, 20, 25, 30, 40, 50, 60, 80, 100, 120, 150, 200, 250, 300, 400, 500]);
  const d = rng.pick([2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 30, 40, 50, 60]);
  const t = rng.pick([2, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60]);
  const W = F * d;
  if (W % t !== 0) return null;
  const P = W / t;
  if (P < 5 || P > 5000 || d === t) return null;
  const stem = rng.pick([
    `A force of ${F} N moves an object ${d} m in ${t} s in the direction of the force. Find the average power developed.`,
    `A horse pulls a cart with a horizontal force of ${F} N. The cart moves ${d} m along a level road in ${t} s. Find the average power developed by the horse.`,
  ]);
  return pack(rng, {
    stem,
    answer: E(P),
    unit: U_W,
    must: [
      { value: E(W), trap: 'found the work done and forgot to divide by the time' },
      { value: E(W * t), trap: 'multiplied the work by the time: P = W × t' },
    ],
    extra: [
      { value: (F * t) % d === 0 ? E((F * t) / d) : null, trap: 'divided by the distance instead of the time' },
      { value: E(P / 2), trap: 'halved the work as if it were ½Fd' },
      { value: E(P / 1000), trap: 'gave the answer in kW' },
      { value: E(P * 10), trap: 'slipped a decimal place' },
    ],
    solution: `Work done $= Fd = ${F} \\times ${d} = ${W}\\ \\text{J}$, so $P = \\dfrac{${W}}{${t}} = ${P}\\ \\text{W}$ (equivalently $P = Fv = ${F} \\times ${n(d / t)}$).`,
    trap: 'Power is work ÷ time (or F × v), not the work itself and not work × time.',
    tags: ['power', 'work', 'force'],
    params: { variant: 'power-fdt', F, d, t },
  });
}

// ----------------------------------------------------------------------------- level 2

function carPowerQ(rng: RNG): Generated | null {
  const R = rng.pick([200, 250, 300, 400, 500, 600, 750, 800, 1000, 1200, 1500, 2000]);
  const v = rng.pick([10, 12, 15, 20, 24, 25, 30, 40]);
  const P = R * v;
  const inKW = rng.bool(0.7);
  const m = rng.bool(0.6) ? rng.pick([800, 1000, 1200, 1500]) : 0;
  const answer = inKW ? E(P / 1000) : E(P);
  if (inKW && P % 100 !== 0) return null;
  const massText = m ? ` of mass ${m} kg` : '';
  const stem = rng.pick([
    `A car${massText} travels along a straight level road at a constant speed of $${v}\\ ${U_MS}$. The total resistance to its motion is ${R} N. Find the power output of the engine${inKW ? ', in kW' : ''}.`,
    `A lorry${massText} is driven at a steady $${v}\\ ${U_MS}$ along a horizontal road against a total resistive force of ${R} N. Find the power developed by the engine${inKW ? ', in kW' : ''}.`,
  ]);
  const scale = inKW ? 1 / 1000 : 1;
  return pack(rng, {
    stem,
    answer,
    unit: inKW ? U_KW : U_W,
    must: [
      { value: inKW ? E(P) : E(P / 1000), trap: inKW ? 'left the answer in watts' : 'gave the answer in kW' },
      { value: m ? E(m * G * v * scale) : E(R * v * v * scale), trap: m ? 'used the weight of the car as the driving force' : 'multiplied by v² instead of v' },
    ],
    extra: [
      { value: m ? E((R + m * G) * v * scale) : null, trap: 'added the weight to the resistance' },
      { value: E((R * v * scale) / 2), trap: 'put in a spurious factor of ½' },
      { value: inKW ? E(P / 100) : E(P * 10), trap: 'slipped a decimal place' },
      { value: R % v === 0 ? E((R / v) * scale) : null, trap: 'divided the force by the speed' },
      { value: E(R * v * scale * 2), trap: 'doubled the power' },
    ],
    solution: `At constant speed the driving force equals the resistance, ${R} N, so $P = Fv = ${R} \\times ${v} = ${P}\\ \\text{W}${inKW ? ` = ${n(P / 1000)}\\ \\text{kW}` : ''}$.${m ? ' The mass is not needed: there is no acceleration and no change in height.' : ''}`,
    trap: 'At constant speed on the level the driving force equals the resistance (not the weight); P = Fv, and 1 kW = 1000 W.',
    tags: ['power', 'force-velocity', 'constant-speed'],
    params: { variant: 'car-power', R, v, inKW, m },
  });
}

function resistanceQ(rng: RNG): Generated | null {
  const PkW = rng.pick([6, 8, 9, 10, 12, 15, 18, 20, 24, 25, 30, 36, 40, 45, 48, 50, 60, 72, 75, 80, 90, 100]);
  const v = rng.pick([10, 12, 15, 20, 24, 25, 30, 40, 50]);
  const P = PkW * 1000;
  if (P % v !== 0) return null;
  const R = P / v;
  if (R < 100 || R > 5000) return null;
  const askSpeed = rng.bool(0.4);
  if (askSpeed) {
    return pack(rng, {
      stem: `The engine of a car works at a constant rate of ${PkW} kW. The car moves along a level road at a constant speed against a total resistance of ${R} N. Find the speed of the car.`,
      answer: E(v),
      unit: U_MS,
      must: [
        { value: E(PkW / R), trap: 'forgot to convert kW to W' },
        { value: E(P * R), trap: 'multiplied the power by the force' },
      ],
      extra: [
        { value: E(2 * v), trap: 'doubled the speed' },
        { value: E(v / 2), trap: 'halved the speed' },
        { value: E(v * 10), trap: 'slipped a decimal place' },
        { value: E(v / 10), trap: 'slipped a decimal place' },
      ],
      solution: `At constant speed the driving force equals the resistance, so $v = \\dfrac{P}{F} = \\dfrac{${P}}{${R}} = ${v}\\ ${U_MS}$.`,
      trap: 'Convert kW to W before dividing: P = Fv with P in watts.',
      tags: ['power', 'force-velocity', 'constant-speed'],
      params: { variant: 'speed-from-power', P, R },
    });
  }
  return pack(rng, {
    stem: `A car travels along a level road at a constant speed of $${v}\\ ${U_MS}$ with its engine working at ${PkW} kW. Find the total resistance to the motion of the car.`,
    answer: E(R),
    unit: U_N,
    must: [
      { value: E(PkW / v), trap: 'forgot to convert kW to W' },
      { value: E(PkW * v), trap: 'multiplied the power (in kW) by the speed' },
    ],
    extra: [
      { value: E(P * v), trap: 'multiplied the power by the speed' },
      { value: E(R * 10), trap: 'slipped a decimal place' },
      { value: E(R / 10), trap: 'slipped a decimal place' },
      { value: E(R / 2), trap: 'halved the force' },
      { value: E(2 * R), trap: 'doubled the force' },
    ],
    solution: `At constant speed the driving force equals the resistance: $F = \\dfrac{P}{v} = \\dfrac{${P}}{${v}} = ${R}\\ \\text{N}$.`,
    trap: 'Convert kW to W before dividing by the speed: F = P/v.',
    tags: ['power', 'force-velocity', 'resistance'],
    params: { variant: 'resistance-from-power', P, v },
  });
}

// ----------------------------------------------------------------------------- level 3

const EFFS = [20, 25, 30, 40, 50, 60, 75, 80, 90];

function efficiencyPctQ(rng: RNG): Generated | null {
  const e = rng.pick(EFFS);
  const useEnergy = rng.bool(0.4);
  const total = rng.pick(useEnergy ? [200, 300, 400, 500, 600, 800, 1000, 1200, 1500, 2000, 2400, 3000] : [200, 400, 500, 600, 800, 1000, 1200, 1500, 2000, 2500, 3000, 4000, 5000]);
  const useful = (e * total) / 100;
  if (!Number.isInteger(useful)) return null;
  const unitWord = useEnergy ? (total >= 1000 ? 'kJ' : 'J') : 'W';
  const scale = useEnergy && total >= 1000 ? 1 / 1000 : 1;
  const tot = n(total * scale), use = n(useful * scale);
  const stem = useEnergy
    ? rng.pick([
      `An electric kettle transfers ${tot} ${unitWord} of electrical energy, of which ${use} ${unitWord} is transferred to the water as heat. Find the efficiency of the kettle as a percentage.`,
      `A motor is supplied with ${tot} ${unitWord} of energy and does ${use} ${unitWord} of useful work. Find the percentage efficiency of the motor.`,
    ])
    : rng.pick([
      `A motor has an input power of ${tot} W and a useful output power of ${use} W. Find its efficiency as a percentage.`,
      `A lamp is supplied with ${tot} W of electrical power and emits ${use} W of light. Find the percentage efficiency of the lamp.`,
    ]);
  return pack(rng, {
    stem,
    answer: E(e),
    pct: true,
    must: [
      { value: tryE(() => E(100 * total).div(E(useful))), trap: 'inverted the ratio (total ÷ useful), giving an efficiency above 100%' },
      { value: E(100 - e), trap: 'found the percentage wasted' },
    ],
    extra: [
      { value: E(e / 100), trap: 'gave the efficiency as a decimal, not a percentage' },
      { value: E((total - useful) * scale), trap: 'gave the wasted power/energy as if it were a percentage' },
      { value: e < 50 ? E(2 * e) : E(e / 2), trap: e < 50 ? 'doubled the ratio' : 'halved the ratio' },
      { value: E(e + 10), trap: 'arithmetic slip in the ratio' },
      { value: E(e - 10), trap: 'arithmetic slip in the ratio' },
    ],
    solution: `Efficiency $= \\dfrac{\\text{useful}}{\\text{total}} \\times 100\\% = \\dfrac{${use}}{${tot}} \\times 100\\% = ${e}\\%$.`,
    trap: 'Efficiency is useful ÷ total (never above 100%), and the question asks for the useful fraction, not the wasted one.',
    tags: ['efficiency', 'percentage'],
    params: { variant: 'efficiency-pct', total, useful },
  });
}

function inputPowerQ(rng: RNG): Generated | null {
  const e = rng.pick([20, 25, 40, 50, 60, 75, 80]);
  const pin = rng.pick([200, 400, 500, 800, 1000, 1200, 1500, 2000, 2500, 3000, 4000, 5000]);
  const pout = (e * pin) / 100;
  if (!Number.isInteger(pout)) return null;
  const stem = rng.pick([
    `A motor is ${e}% efficient. It must deliver a useful output power of ${pout} W. Find the electrical input power required.`,
    `An electric pump has an efficiency of ${e}%. Find the input power needed for the pump to do useful work at a rate of ${pout} W.`,
  ]);
  return pack(rng, {
    stem,
    answer: E(pin),
    unit: U_W,
    must: [
      { value: E((pout * e) / 100), trap: 'multiplied by the efficiency instead of dividing' },
      { value: E(pin - pout), trap: 'found the power wasted, not the input power' },
    ],
    extra: [
      { value: tryE(() => E(100 * pout).div(E(100 - e))), trap: 'divided by the wasted fraction' },
      { value: E((pout * (100 + e)) / 100), trap: `added ${e}% to the output` },
      { value: E(pout + e), trap: 'added the percentage as if it were watts' },
      { value: E(pin * 10), trap: 'slipped a decimal place' },
    ],
    solution: `Useful $= ${e}\\%$ of input, so input $= \\dfrac{${pout}}{${n(e / 100)}} = ${pin}\\ \\text{W}$.`,
    trap: 'The input is larger than the useful output: divide by the efficiency (as a decimal), do not multiply.',
    tags: ['efficiency', 'input-power'],
    params: { variant: 'input-power', e, pout },
  });
}

function wastedQ(rng: RNG): Generated | null {
  const e = rng.pick([40, 50, 60, 75, 80, 90]);
  const pin = rng.pick([200, 500, 800, 1000, 1500, 2000, 2500, 3000, 4000, 5000]);
  const t = rng.pick([2, 4, 5, 10, 20, 30, 60]);
  const wastedPower = (pin * (100 - e)) / 100;
  if (!Number.isInteger(wastedPower)) return null;
  const wasted = wastedPower * t;
  const total = pin * t;
  const inKJ = wasted >= 10000 || (wasted % 1000 === 0 && rng.bool(0.5));
  if (inKJ && wasted % 100 !== 0) return null;
  const scale = inKJ ? 1 / 1000 : 1;
  const answer = E(wasted * scale);
  const stem = rng.pick([
    `A motor with an efficiency of ${e}% has an input power of ${pin} W. Find the energy wasted by the motor in ${t} s${inKJ ? ', in kJ' : ''}.`,
    `An electric drill is rated at ${pin} W and is ${e}% efficient. How much energy is wasted when the drill runs for ${t} s${inKJ ? '? Give your answer in kJ.' : '?'}`,
  ]);
  return pack(rng, {
    stem,
    answer,
    unit: inKJ ? U_KJ : U_J,
    must: [
      { value: E((total - wasted) * scale), trap: 'found the useful energy instead of the wasted energy' },
      { value: E(wastedPower * scale), trap: 'found the wasted power and forgot to multiply by the time' },
    ],
    extra: [
      { value: E(total * scale), trap: 'gave the total energy supplied' },
      { value: inKJ ? E(wasted) : E(wasted / 1000), trap: inKJ ? 'left the answer in joules' : 'gave the answer in kJ' },
      { value: E(wasted * scale * 10), trap: 'slipped a decimal place' },
      { value: E((pin * e) / 100 * scale), trap: 'gave the useful power' },
    ],
    solution: `Wasted power $= ${100 - e}\\%$ of $${pin}\\ \\text{W} = ${wastedPower}\\ \\text{W}$, so in ${t} s the energy wasted is $${wastedPower} \\times ${t} = ${wasted}\\ \\text{J}${inKJ ? ` = ${n(wasted / 1000)}\\ \\text{kJ}` : ''}$.`,
    trap: 'The wasted fraction is (100 − efficiency)%; energy is power × time, so multiply by the seconds and watch J versus kJ.',
    tags: ['efficiency', 'wasted-energy', 'power'],
    params: { variant: 'wasted', e, pin, t, inKJ },
  });
}

// ----------------------------------------------------------------------------- level 4

function liftPowerQ(rng: RNG): Generated | null {
  const scenario = rng.pick(['crane', 'lift', 'stairs', 'pump']);
  let m: number, h: number, t: number;
  if (scenario === 'stairs') {
    m = rng.pick([40, 50, 60, 70, 75, 80]);
    h = rng.pick([3, 4, 5, 6, 8, 10, 12]);
    t = rng.pick([4, 5, 6, 8, 10, 12, 15, 20]);
  } else if (scenario === 'pump') {
    m = rng.pick([60, 90, 120, 150, 180, 240, 300, 360, 600, 900, 1200]);
    h = rng.pick([2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30]);
    t = 60;
  } else {
    m = rng.pick([100, 120, 150, 200, 250, 300, 400, 500, 600, 800, 1000, 1200, 1500, 2000]);
    h = rng.pick([2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30]);
    t = rng.pick([2, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60]);
  }
  const W = m * G * h;
  if (W % t !== 0) return null;
  const P = W / t;
  if (P < 10 || P > 200000) return null;
  const inKW = P >= 1000 && rng.bool(0.7);
  if (inKW && P % 100 !== 0) return null;
  const scale = inKW ? 1 / 1000 : 1;
  const answer = E(P * scale);
  const ask = inKW ? ', in kW' : '';
  const stem = {
    crane: `A crane lifts a load of mass ${m} kg through a vertical height of ${h} m in ${t} s at constant speed. Take $g = 10\\ \\text{m s}^{-2}$. Find the useful power developed by the crane${ask}.`,
    lift: `A lift of total mass ${m} kg rises ${h} m in ${t} s at constant speed. Take $g = 10\\ \\text{m s}^{-2}$. Find the useful power output of the motor${ask}.`,
    stairs: `A student of mass ${m} kg runs up a flight of stairs of vertical height ${h} m in ${t} s. Take $g = 10\\ \\text{m s}^{-2}$. Find the student's average useful power${ask}.`,
    pump: `A pump raises ${m} kg of water per minute through a vertical height of ${h} m. Take $g = 10\\ \\text{m s}^{-2}$. Find the minimum power of the pump${ask}.`,
  }[scenario]!;
  return pack(rng, {
    stem,
    answer,
    unit: inKW ? U_KW : U_W,
    must: [
      { value: E((m * h * scale) / t), trap: 'forgot g: used mass instead of weight' },
      { value: E(W * scale), trap: 'found the energy (mgh) and forgot to divide by the time' },
    ],
    extra: [
      { value: inKW ? E(P) : E(P / 1000), trap: inKW ? 'left the answer in watts' : 'gave the answer in kW' },
      { value: E(W * t * scale), trap: 'multiplied by the time: P = W × t' },
      { value: E((P * scale) / 2), trap: 'put in a spurious factor of ½' },
      { value: scenario === 'pump' ? E(W * scale) : E(P * scale * 10), trap: scenario === 'pump' ? 'used the time in minutes, not seconds' : 'slipped a decimal place' },
    ],
    solution: `Work done $= mgh = ${m} \\times 10 \\times ${h} = ${W}\\ \\text{J}$, so $P = \\dfrac{${W}}{${t}} = ${P}\\ \\text{W}${inKW ? ` = ${n(P / 1000)}\\ \\text{kW}` : ''}$${scenario === 'pump' ? ' (one minute is 60 s)' : ''}.`,
    trap: 'Power = mgh ÷ t: include g (weight, not mass), divide by the time in seconds, and check W versus kW.',
    tags: ['power', 'gpe', 'lifting'],
    params: { variant: 'lift-power', m, h, t, inKW },
  });
}

function rampFrictionQ(rng: RNG): Generated | null {
  const m = rng.pick([2, 4, 5, 8, 10, 12, 15, 20, 25, 30, 40, 50]);
  const h = rng.pick([1, 1.5, 2, 3, 4, 5, 6]);
  const d = rng.pick([3, 4, 5, 6, 8, 10, 12, 15, 20]);
  if (d < 2 * h) return null;
  const gpe = m * G * h;
  const F = rng.pick([20, 25, 30, 40, 50, 60, 75, 80, 100, 120, 150, 200, 250, 300, 400, 500]);
  const Wf = F * d - gpe;
  if (Wf <= 0 || Wf % 5 !== 0 || Wf > 0.7 * F * d || Wf < 0.1 * F * d) return null;
  const askForce = Wf % d === 0 && rng.bool(0.4);
  const intro = `A box of mass ${m} kg is pushed ${d} m up a rough ramp by a force of ${F} N acting parallel to the ramp, so that it rises ${n(h)} m vertically. The box moves at constant speed. Take $g = 10\\ \\text{m s}^{-2}$.`;
  if (askForce) {
    const f = Wf / d;
    return pack(rng, {
      stem: `${intro} Find the magnitude of the frictional force.`,
      answer: E(f),
      unit: U_N,
      must: [
        { value: E(F), trap: 'ignored the gain in potential energy: friction is not the whole applied force' },
        { value: E(gpe / d), trap: 'gave the component of the weight along the ramp instead of the friction' },
      ],
      extra: [
        { value: E(Wf), trap: 'gave the work done against friction, not the force' },
        { value: F - m * G > 0 ? E(F - m * G) : null, trap: 'subtracted the whole weight instead of its component along the ramp' },
        { value: (F * d - m * h) % d === 0 ? E((F * d - m * h) / d) : null, trap: 'forgot g in the potential energy' },
        { value: E(f * 2), trap: 'doubled the force' },
      ],
      solution: `Work in $= Fd = ${F * d}\\ \\text{J}$; gain in PE $= mgh = ${gpe}\\ \\text{J}$; so work against friction $= ${Wf}\\ \\text{J}$ over ${d} m, giving a frictional force of $\\dfrac{${Wf}}{${d}} = ${f}\\ \\text{N}$.`,
      trap: 'Work done by the push = gain in PE + work against friction; divide the friction work by the distance along the ramp.',
      tags: ['work', 'friction', 'ramp', 'gpe'],
      params: { variant: 'ramp-friction', m, h, d, F, askForce: true },
    });
  }
  return pack(rng, {
    stem: `${intro} Find the work done against friction.`,
    answer: E(Wf),
    unit: U_J,
    must: [
      { value: E(F * d), trap: 'ignored the gain in potential energy' },
      { value: E(gpe), trap: 'gave the gain in potential energy' },
    ],
    extra: [
      { value: E(F * d + gpe), trap: 'added the potential energy instead of subtracting it' },
      { value: E(F * d - m * h), trap: 'forgot g in the potential energy' },
      { value: (F - m * G) * d > 0 ? E((F - m * G) * d) : null, trap: 'subtracted the whole weight instead of its component along the ramp' },
      { value: E(Wf / 2), trap: 'halved the result' },
    ],
    solution: `Work done by the push $= Fd = ${F} \\times ${d} = ${F * d}\\ \\text{J}$; gain in PE $= mgh = ${m} \\times 10 \\times ${n(h)} = ${gpe}\\ \\text{J}$; the rest, $${F * d} - ${gpe} = ${Wf}\\ \\text{J}$, is done against friction.`,
    trap: 'Work done by the push = gain in PE + work against friction; the PE uses the vertical rise, the push uses the distance along the ramp.',
    tags: ['work', 'friction', 'ramp', 'gpe'],
    params: { variant: 'ramp-friction', m, h, d, F, askForce: false },
  });
}

// ----------------------------------------------------------------------------- level 5

function inclineQ(rng: RNG): Generated | null {
  const cyclist = rng.bool(0.35);
  const m = cyclist ? rng.pick([60, 70, 80, 90, 100]) : rng.pick([800, 1000, 1200, 1500, 2000]);
  const R = cyclist ? rng.pick([10, 20, 25, 30, 40, 50]) : rng.pick([200, 300, 400, 500, 600, 800, 1000]);
  const v = cyclist ? rng.pick([2, 3, 4, 5, 6, 8]) : rng.pick([10, 12, 15, 20, 24, 25, 30]);
  const slope = m * G * SIN30;
  const F = R + slope;
  const P = F * v;
  const inKW = !cyclist || (P >= 1000 && P % 100 === 0 && rng.bool(0.5));
  if (inKW && P % 100 !== 0) return null;
  const scale = inKW ? 1 / 1000 : 1;
  const answer = E(P * scale);
  const stem = cyclist
    ? `A cyclist and bicycle have a total mass of ${m} kg. The cyclist rides up a road inclined at $30^{\\circ}$ to the horizontal at a constant speed of $${v}\\ ${U_MS}$ against a resistance of ${R} N. Take $g = 10\\ \\text{m s}^{-2}$. Find the power developed by the cyclist${inKW ? ', in kW' : ''}.`
    : `A car of mass ${m} kg climbs a straight road inclined at $30^{\\circ}$ to the horizontal at a constant speed of $${v}\\ ${U_MS}$. The resistance to motion is ${R} N. Take $g = 10\\ \\text{m s}^{-2}$. Find the power output of the engine${inKW ? ', in kW' : ''}.`;
  return pack(rng, {
    stem,
    answer,
    unit: inKW ? U_KW : U_W,
    must: [
      { value: E((R + m * G) * v * scale), trap: 'used the whole weight instead of its component mg sin 30° along the slope' },
      // a + b√3 only reads like an exam option when both parts are whole numbers
      { value: Number.isInteger(R * v * scale) && Number.isInteger((m * G * v * scale) / 2) ? tryE(() => E(R * v * scale).add(surd(3, (m * G * v * scale) / 2))) : null, trap: 'used cos 30° instead of sin 30° for the component of the weight' },
      { value: E(R * v * scale), trap: 'ignored the slope: forgot the component of the weight' },
    ],
    extra: [
      { value: E(slope * v * scale), trap: 'forgot the resistance' },
      { value: slope > R ? E((slope - R) * v * scale) : null, trap: 'subtracted the resistance instead of adding it' },
      { value: inKW ? E(P) : E(P / 1000), trap: inKW ? 'left the answer in watts' : 'gave the answer in kW' },
      { value: E(P * scale * 10), trap: 'slipped a decimal place' },
    ],
    solution: `At constant speed the driving force balances the resistance plus the weight component down the slope: $F = ${R} + ${m} \\times 10 \\times \\sin 30^{\\circ} = ${R} + ${slope} = ${F}\\ \\text{N}$. Then $P = Fv = ${F} \\times ${v} = ${P}\\ \\text{W}${inKW ? ` = ${n(P / 1000)}\\ \\text{kW}` : ''}$.`,
    trap: 'The component of the weight along a slope is mg sin θ (sin 30° = ½), and it adds to the resistance when climbing; P = Fv.',
    tags: ['power', 'incline', 'force-velocity', 'constant-speed'],
    params: { variant: 'incline', m, R, v, inKW },
  });
}

const CHAIN_PAIRS: [number, number, string][] = [
  [80, 75, 'An electric motor of efficiency 80% drives a water pump of efficiency 75%.'],
  [75, 80, 'A petrol engine is 75% efficient at converting fuel energy to mechanical work, and the transmission that follows is 80% efficient.'],
  [40, 90, 'A power station converts 40% of the energy in its fuel to electrical energy, and the transmission lines deliver 90% of that electrical energy to consumers.'],
  [50, 80, 'A generator is 50% efficient and the motor it supplies is 80% efficient.'],
  [60, 75, 'A motor of efficiency 60% drives a winch of efficiency 75%.'],
  [80, 90, 'A motor of efficiency 80% drives a gearbox of efficiency 90%.'],
  [60, 90, 'A solar panel system is 60% efficient at charging a battery, which then returns 90% of the stored energy.'],
  [50, 60, 'A steam engine of efficiency 50% drives a pump of efficiency 60%.'],
  [40, 80, 'An engine of efficiency 40% drives a generator of efficiency 80%.'],
  [75, 60, 'A motor of efficiency 75% drives a conveyor belt whose mechanism is 60% efficient.'],
];

function chainQ(rng: RNG): Generated | null {
  const [e1, e2, intro] = rng.pick(CHAIN_PAIRS);
  const overall = (e1 * e2) / 100;
  if (!Number.isInteger(overall)) return null;
  const askInput = rng.bool(0.5);
  if (!askInput) {
    return pack(rng, {
      stem: `${intro} Find the overall efficiency of the system as a percentage.`,
      answer: E(overall),
      pct: true,
      must: [
        { value: E((e1 + e2) / 2), trap: 'averaged the two efficiencies' },
        { value: E(e1 + e2 - 100), trap: 'added the two percentage losses' },
      ],
      extra: [
        { value: E(Math.min(e1, e2)), trap: 'took the lower efficiency as the overall value' },
        { value: E(100 - overall), trap: 'found the overall percentage wasted' },
        { value: E(overall / 100), trap: 'gave the efficiency as a decimal, not a percentage' },
        { value: E(overall + 10), trap: 'arithmetic slip in the product' },
      ],
      solution: `Efficiencies in series multiply: $${n(e1 / 100)} \\times ${n(e2 / 100)} = ${n(overall / 100)}$, i.e. $${overall}\\%$.`,
      trap: 'Efficiencies of stages in series multiply as fractions; they are not averaged and the losses are not simply added.',
      tags: ['efficiency', 'series', 'percentage'],
      params: { variant: 'chain', e1, e2, askInput: false },
    });
  }
  const pout = rng.pick([60, 120, 150, 180, 240, 300, 360, 450, 480, 600, 720, 900, 1200, 1500, 1800, 2400, 3000, 3600]);
  const pin = (100 * pout) / overall;
  if (!Number.isInteger(pin)) return null;
  return pack(rng, {
    stem: `${intro} The useful output power of the system is ${pout} W. Find the input power required.`,
    answer: E(pin),
    unit: U_W,
    must: [
      { value: E((pout * overall) / 100), trap: 'multiplied by the overall efficiency instead of dividing' },
      { value: tryE(() => E(200 * pout).div(E(e1 + e2))), trap: 'divided by the average of the two efficiencies' },
    ],
    extra: [
      { value: tryE(() => E(100 * pout).div(E(e1))), trap: 'allowed for only the first stage' },
      { value: tryE(() => E(100 * pout).div(E(e2))), trap: 'allowed for only the second stage' },
      { value: E(pin - pout), trap: 'found the total power wasted' },
      { value: tryE(() => E(100 * pout).div(E(e1 + e2 - 100))), trap: 'added the two percentage losses' },
    ],
    solution: `Overall efficiency $= ${n(e1 / 100)} \\times ${n(e2 / 100)} = ${n(overall / 100)}$, so input $= \\dfrac{${pout}}{${n(overall / 100)}} = ${pin}\\ \\text{W}$.`,
    trap: 'Multiply the efficiencies for the overall value, then divide the useful output by it (input is larger than output).',
    tags: ['efficiency', 'series', 'input-power'],
    params: { variant: 'chain', e1, e2, askInput: true, pout },
  });
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'phy.energy.work-power',
  module: 'PHY',
  topic: 'energy',
  title: 'Work, power and efficiency',
  levels: {
    1: 'W = Fd, P = W/t, P = Fd/t with clean numbers',
    2: 'P = Fv for a car at constant speed on the level; F = P/v or v = P/F with kW → W',
    3: 'efficiency as a percentage; input power required; energy wasted in t seconds',
    4: 'motor, crane or pump raising m kg by h m in t s (mgh/t, g = 10); work done against friction on a ramp',
    5: 'car or cyclist climbing a 30° slope at constant speed, P = (R + mg sin 30°)v; two machines in series',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return pickVariant(rng, [workQ, powerFromWorkQ, powerFdtQ]);
        case 2: return pickVariant(rng, [carPowerQ, carPowerQ, resistanceQ]);
        case 3: return pickVariant(rng, [efficiencyPctQ, inputPowerQ, wastedQ]);
        case 4: return pickVariant(rng, [liftPowerQ, liftPowerQ, rampFrictionQ]);
        default: return pickVariant(rng, [inclineQ, chainQ]);
      }
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const p = q.params as Record<string, number> & { variant: string; inKW?: boolean; inKJ?: boolean; askForce?: boolean; askInput?: boolean };
    const got = q.answer.value.toNumber();
    const close = (x: number) => Math.abs(got - x) < 1e-9 * Math.max(1, Math.abs(x));
    switch (p.variant) {
      case 'work': {
        // literally add F joules for each metre moved
        let W = 0;
        for (let i = 0; i < p.d; i++) W += p.F;
        return close(W);
      }
      case 'power-from-work':
        // substitute back: power × time must return the energy
        return Math.abs(got * p.t - p.W) < 1e-9;
      case 'power-fdt':
        // force × velocity route instead of work ÷ time
        return close(p.F * (p.d / p.t));
      case 'car-power': {
        // energy route: in one second the car moves v metres against R, so R·v joules per second
        const perSecond = p.R * (p.v * 1);
        return close(p.inKW ? perSecond / 1000 : perSecond);
      }
      case 'speed-from-power':
        return Math.abs(p.R * got - p.P) < 1e-9;
      case 'resistance-from-power':
        return Math.abs(got * p.v - p.P) < 1e-9;
      case 'efficiency-pct': {
        const wastedFraction = (p.total - p.useful) / p.total;
        return close(100 * (1 - wastedFraction));
      }
      case 'input-power':
        // substitute back: e% of the input must be the useful output
        return Math.abs((got * p.e) / 100 - p.pout) < 1e-9;
      case 'wasted': {
        const total = p.pin * p.t, useful = (p.pin * p.e * p.t) / 100;
        const wasted = total - useful;
        return close(p.inKJ ? wasted / 1000 : wasted);
      }
      case 'lift-power': {
        // force × velocity: weight × (h / t)
        const P = p.m * G * (p.h / p.t);
        return close(p.inKW ? P / 1000 : P);
      }
      case 'ramp-friction': {
        // component of the weight along the ramp × distance, subtracted from the applied work
        const sinTheta = p.h / p.d;
        const againstGravity = p.m * G * sinTheta * p.d;
        const Wf = p.F * p.d - againstGravity;
        return close(p.askForce ? Wf / p.d : Wf);
      }
      case 'incline': {
        // energy per second: work against resistance + rate of gain of PE (vertical speed v sin 30°)
        const rate = p.R * p.v + p.m * G * (p.v * Math.sin(Math.PI / 6));
        return close(p.inKW ? rate / 1000 : rate);
      }
      case 'chain': {
        // trace 1000 W through the two stages
        const stage1 = (1000 * p.e1) / 100, stage2 = (stage1 * p.e2) / 100;
        if (!p.askInput) return close((100 * stage2) / 1000);
        // the input found must deliver pout through both stages
        return Math.abs((((got * p.e1) / 100) * p.e2) / 100 - p.pout) < 1e-9;
      }
      default:
        return false;
    }
  },
});
