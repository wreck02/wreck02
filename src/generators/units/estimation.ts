import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, Exact } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import type { Option } from '../../core/template';
import type { RNG } from '../../core/rng';

/**
 * Order-of-magnitude estimates. Every stem states the assumptions, so the answer is determinate:
 * either "which of these is the best estimate" (five options a factor of ten apart, kind 'choice')
 * or "estimate …, giving your answer to 1 significant figure" (kind 'exact', with named mistakes
 * as distractors).
 * Level 1: the mass of the air in a room (ρ = 1.2 kg m⁻³)
 * Level 2: heartbeats in a year; the volume of air breathed in a day
 * Level 3: the energy to boil a kettle of water; the time a kettle takes
 * Level 4: the force of the atmosphere on a wall; the time light takes to reach us from the Sun
 * Level 5: the power of a person climbing stairs; the mass of water in a swimming pool; a car's fuel energy
 *
 * verify() recomputes the quantity from the assumptions kept in params by a different route and
 * checks that the answer is its value to 1 significant figure — and, for the multiple-choice form,
 * that exactly one option is within a factor of 3 of the true value and that it is the correct one.
 */

const n = (x: number): string => (Number.isInteger(x) ? `${x}` : `${Number(x.toPrecision(10))}`);
const round = (x: number): number => Number(x.toPrecision(12));
/** x for a solution line: at most 3 significant figures, so 533.33… reads as 533. */
const napp = (x: number): string => n(Number(x.toPrecision(3)));
/** x to one significant figure. */
const sf1 = (x: number): number => (x > 0 ? Number(x.toPrecision(1)) : 0);

type Fmt = 'decimal' | 'sf';
const fmtFor = (a: number): Fmt => (a >= 1e4 || a <= 1e-2 ? 'sf' : 'decimal');

type Cand = { value: number | null; trap: string };

interface Est {
  stem: string;
  /** the exact value that follows from the assumptions */
  value: number;
  unit: string;
  /** 'choice': five options a factor of ten apart; 'exact': a typed 1 s.f. answer */
  mode: 'choice' | 'exact';
  mistakes: Cand[];
  solution: string;
  trap: string;
  tags: string[];
  params: Record<string, unknown>;
}

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

function cleanNum(v: number): Exact | null {
  if (!Number.isFinite(v) || v <= 0 || v > 1e15 || v < 1e-9) return null;
  try {
    const ex = E(round(v));
    return isCleanExact(ex).ok ? ex : null;
  } catch {
    return null;
  }
}

/** Build the question: a ladder of powers of ten, or a 1 s.f. answer with named wrong turns. */
function estimate(rng: RNG, e: Est): Generated | null {
  if (!(e.value > 0) || !Number.isFinite(e.value)) return null;
  // a value like 250, whose leading digit sits exactly on a rounding boundary, has no single
  // "1 significant figure" answer a candidate would trust: redraw instead
  const mant = e.value / Math.pow(10, Math.floor(Math.log10(e.value)));
  if (Math.abs((mant - Math.floor(mant)) - 0.5) < 0.05) return null;
  const target = sf1(e.value);
  const ex = cleanNum(target);
  if (!ex) return null;
  const format = fmtFor(target);
  const disp = (v: number): string => `$${E(round(v)).toLatex({ format })}${e.unit ? `\\ ${e.unit}` : ''}$`;

  if (e.mode === 'choice') {
    const start = rng.int(-3, -1); // the answer is never always in the middle
    const values: number[] = [];
    for (let k = start; k < start + 5; k++) values.push(round(target * Math.pow(10, k)));
    if (values.some((v) => cleanNum(v) === null)) return null;
    const wrong = values.filter((v) => Math.abs(v / target - 1) > 1e-9);
    if (wrong.length !== 4) return null;
    let options: Option[];
    try {
      options = buildChoiceOptions(rng, disp(target), wrong.map(disp));
    } catch {
      return null;
    }
    const byDisplay = new Map(values.map((v) => [disp(v), v]));
    const opts = options.map((o) => ({ display: o.display, value: byDisplay.get(o.display) ?? NaN }));
    if (opts.some((o) => !Number.isFinite(o.value))) return null;
    return {
      stem: e.stem,
      answer: { kind: 'choice', value: options.find((o) => o.correct)!.display },
      options,
      solution: e.solution,
      trap: e.trap,
      tags: ['estimation', ...e.tags],
      params: { ...e.params, mode: 'choice', opts },
      typedAllowed: false,
    };
  }

  const ds: Distractor[] = [];
  const seen: Exact[] = [ex];
  for (const m of e.mistakes) {
    if (ds.length >= 4 || m.value === null) continue;
    const v = cleanNum(sf1(m.value));
    if (!v || seen.some((s) => s.equals(v))) continue;
    const r = v.toNumber() / target;
    if (r < 1e-4 || r > 1e4) continue;
    seen.push(v);
    ds.push({ value: v, trap: m.trap });
  }
  for (const k of rng.shuffle([1, -1, 2, -2, 3])) {
    if (ds.length >= 4) break;
    const v = cleanNum(round(target * Math.pow(10, k)));
    if (!v || seen.some((s) => s.equals(v))) continue;
    seen.push(v);
    ds.push({ value: v, trap: 'a power of ten out' });
  }
  if (ds.length < 4) return null;
  return {
    stem: e.stem,
    answer: { kind: 'exact', value: ex, format, unit: e.unit },
    options: buildOptions(rng, ex, ds, { format, unit: e.unit }),
    solution: e.solution,
    trap: e.trap,
    tags: ['estimation', ...e.tags],
    params: { ...e.params, mode: 'exact' },
    typedAllowed: true,
  };
}

const modeOf = (rng: RNG): 'choice' | 'exact' => (rng.bool(0.5) ? 'choice' : 'exact');
const ASK_CHOICE = 'Which of the following is the best estimate';
const TO_1SF = 'Give your answer to 1 significant figure.';

// ----------------------------------------------------------------------------- level 1

/** The mass of the air in a room. */
function airMassQ(rng: RNG): Generated | null {
  const rho = 1.2;
  const l = rng.pick([4, 5, 6, 8]);
  const w = rng.pick([3, 4, 5, 6]);
  const h = rng.pick([2.5, 3]);
  const value = round(rho * l * w * h);
  const mode = modeOf(rng);
  const lead = `The density of air is $1.2\\ \\text{kg m}^{-3}$. A room measures $${n(l)}\\ \\text{m}$ by $${n(w)}\\ \\text{m}$ by $${n(h)}\\ \\text{m}$.`;
  return estimate(rng, {
    stem: `${lead}\n\n${mode === 'choice' ? `${ASK_CHOICE} of the mass of the air in the room?` : `Estimate the mass of the air in the room. ${TO_1SF}`}`,
    value,
    unit: '\\text{kg}',
    mode,
    mistakes: [
      { value: round(rho * l * w), trap: 'used the floor area and forgot the height' },
      { value: round(l * w * h), trap: 'forgot to multiply by the density' },
      { value: round(rho * (l + w + h)), trap: 'added the dimensions instead of multiplying them' },
      { value: round((l * w * h) / rho), trap: 'divided by the density instead of multiplying' },
    ],
    solution: `Volume $= ${n(l)} \\times ${n(w)} \\times ${n(h)} = ${n(l * w * h)}\\ \\text{m}^{3}$, so the mass is $1.2 \\times ${n(l * w * h)} \\approx ${napp(value)}\\ \\text{kg}$, i.e. about $${n(sf1(value))}\\ \\text{kg}$.`,
    trap: 'A room is three-dimensional: leaving out one dimension changes the answer by a factor of the order of 10.',
    tags: ['density', 'volume'],
    params: { variant: 'air-mass', rho, l, w, h },
  });
}

// ----------------------------------------------------------------------------- level 2

/** Heartbeats in a year. */
function heartbeatsQ(rng: RNG): Generated | null {
  const rate = rng.pick([60, 70, 75, 80]);
  const value = round(rate * 60 * 24 * 365);
  const mode = modeOf(rng);
  const lead = `A person’s heart beats ${n(rate)} times per minute. Take one year to be 365 days.`;
  return estimate(rng, {
    stem: `${lead}\n\n${mode === 'choice' ? `${ASK_CHOICE} of the number of beats in one year?` : `Estimate the number of beats in one year. ${TO_1SF}`}`,
    value,
    unit: '',
    mode,
    mistakes: [
      { value: round(rate * 60 * 24), trap: 'stopped at one day' },
      { value: round(rate * 24 * 365), trap: 'forgot the 60 minutes in an hour' },
      { value: round(rate * 60 * 365), trap: 'forgot the 24 hours in a day' },
      { value: round(rate * 60 * 24 * 365 * 60), trap: 'multiplied by 60 once too often (beats are per minute, not per second)' },
    ],
    solution: `Minutes in a year $= 60 \\times 24 \\times 365 \\approx 5 \\times 10^{5}$, so the beats number $${n(rate)} \\times 5.26 \\times 10^{5} \\approx ${E(sf1(value)).toLatex({ format: 'sf' })}$.`,
    trap: 'Chain the conversions: minutes → hours → days → years, and count 60 only once.',
    tags: ['time', 'orders of magnitude'],
    params: { variant: 'heartbeats', rate },
  });
}

/** The volume of air breathed in a day. */
function breathingQ(rng: RNG): Generated | null {
  const rate = rng.pick([12, 15, 20]);
  const litres = rng.pick([0.5, 0.4]);
  const value = round((rate * litres * 60 * 24) / 1000); // m³
  const mode = modeOf(rng);
  const lead = `A person takes ${n(rate)} breaths per minute and each breath has a volume of $${n(litres)}$ litres. Take $1000$ litres $= 1\\ \\text{m}^{3}$.`;
  return estimate(rng, {
    stem: `${lead}\n\n${mode === 'choice' ? `${ASK_CHOICE} of the volume of air breathed in one day?` : `Estimate the volume of air breathed in one day, in $\\text{m}^{3}$. ${TO_1SF}`}`,
    value,
    unit: '\\text{m}^{3}',
    mode,
    mistakes: [
      { value: round(rate * litres * 60 * 24), trap: 'left the answer in litres' },
      { value: round((rate * litres * 60) / 1000), trap: 'stopped at one hour' },
      { value: round((rate * litres * 24) / 1000), trap: 'forgot the 60 minutes in an hour' },
      { value: round((rate * litres * 60 * 24) / 1e6), trap: 'used $10^{6}$ litres in a cubic metre' },
    ],
    solution: `Per day: $${n(rate)} \\times 60 \\times 24 = ${n(rate * 60 * 24)}$ breaths, so $${n(rate * 60 * 24)} \\times ${n(litres)} = ${n(rate * litres * 60 * 24)}$ litres $= ${n(value)}\\ \\text{m}^{3}$, i.e. about $${n(sf1(value))}\\ \\text{m}^{3}$.`,
    trap: '1 m³ is 1000 litres, and a day is 1440 minutes: both conversions have to be made.',
    tags: ['volume', 'time'],
    params: { variant: 'breathing', rate, litres },
  });
}

// ----------------------------------------------------------------------------- level 3

/** The energy needed to heat water in a kettle. */
function kettleEnergyQ(rng: RNG): Generated | null {
  const m = rng.pick([0.5, 1, 1.5, 2]);
  const dT = rng.pick([60, 70, 80]);
  const c = 4200;
  const value = round(m * c * dT);
  const mode = modeOf(rng);
  const lead = `Water has specific heat capacity $4200\\ \\text{J kg}^{-1}\\text{K}^{-1}$. A kettle heats $${n(m)}\\ \\text{kg}$ of water through $${n(dT)}\\ \\text{K}$.`;
  return estimate(rng, {
    stem: `${lead}\n\n${mode === 'choice' ? `${ASK_CHOICE} of the energy transferred to the water?` : `Estimate the energy transferred to the water. ${TO_1SF}`}`,
    value,
    unit: '\\text{J}',
    mode,
    mistakes: [
      { value: round(c * dT), trap: 'forgot the mass of water' },
      { value: round(m * c), trap: 'forgot the temperature rise' },
      { value: round((m * c * dT) / 1000), trap: 'gave the answer in kJ' },
      { value: round(m * dT), trap: 'forgot the specific heat capacity' },
    ],
    solution: `$E = mc\\Delta\\theta = ${n(m)} \\times 4200 \\times ${n(dT)} = ${n(value)}\\ \\text{J} \\approx ${E(sf1(value)).toLatex({ format: 'sf' })}\\ \\text{J}$.`,
    trap: 'All three factors matter: mass, specific heat capacity and temperature rise — and the answer is in joules, not kilojoules.',
    tags: ['energy', 'heating'],
    params: { variant: 'kettle-energy', m, c, dT },
  });
}

/** The time a kettle of a given power takes. */
function kettleTimeQ(rng: RNG): Generated | null {
  const m = rng.pick([0.5, 1, 1.5]);
  const dT = rng.pick([60, 70, 80]);
  const kw = rng.pick([2, 2.5, 3]);
  const c = 4200;
  const value = round((m * c * dT) / (kw * 1000));
  const mode = modeOf(rng);
  const lead = `A kettle of power $${n(kw)}\\ \\text{kW}$ heats $${n(m)}\\ \\text{kg}$ of water through $${n(dT)}\\ \\text{K}$. Water has specific heat capacity $4200\\ \\text{J kg}^{-1}\\text{K}^{-1}$ and no energy is lost.`;
  return estimate(rng, {
    stem: `${lead}\n\n${mode === 'choice' ? `${ASK_CHOICE} of the time this takes?` : `Estimate the time this takes, in seconds. ${TO_1SF}`}`,
    value,
    unit: '\\text{s}',
    mode,
    mistakes: [
      { value: round((m * c * dT) / kw), trap: 'left the power in kilowatts' },
      { value: round((c * dT) / (kw * 1000)), trap: 'forgot the mass of water' },
      { value: round((m * c * dT * kw) / 1000), trap: 'multiplied by the power instead of dividing' },
      { value: round((m * c * dT) / (kw * 1000) / 60), trap: 'gave the time in minutes' },
    ],
    solution: `$E = mc\\Delta\\theta = ${n(m * c * dT)}\\ \\text{J}$ and $t = E/P = ${n(m * c * dT)} / ${n(kw * 1000)} \\approx ${napp(value)}\\ \\text{s}$, i.e. about $${n(sf1(value))}\\ \\text{s}$.`,
    trap: 'Power must be in watts before dividing: a kW is 1000 W.',
    tags: ['energy', 'power', 'time'],
    params: { variant: 'kettle-time', m, c, dT, kw },
  });
}

// ----------------------------------------------------------------------------- level 4

/** The force of the atmosphere on a wall. */
function atmosphereQ(rng: RNG): Generated | null {
  const l = rng.pick([2, 3, 4, 5]);
  const h = rng.pick([2, 2.5, 3]);
  const p = 1e5;
  const value = round(p * l * h);
  const mode = modeOf(rng);
  const lead = `Atmospheric pressure is $1.0 \\times 10^{5}\\ \\text{Pa}$. A wall measures $${n(l)}\\ \\text{m}$ by $${n(h)}\\ \\text{m}$.`;
  return estimate(rng, {
    stem: `${lead}\n\n${mode === 'choice' ? `${ASK_CHOICE} of the force of the atmosphere on one side of the wall?` : `Estimate the force of the atmosphere on one side of the wall. ${TO_1SF}`}`,
    value,
    unit: '\\text{N}',
    mode,
    mistakes: [
      { value: round(p / (l * h)), trap: 'divided by the area instead of multiplying' },
      { value: round(p * (l + h)), trap: 'added the sides instead of multiplying them' },
      { value: round(p * l * h * 2), trap: 'counted both sides of the wall' },
      { value: p, trap: 'gave the pressure, not the force' },
    ],
    solution: `Area $= ${n(l)} \\times ${n(h)} = ${n(l * h)}\\ \\text{m}^{2}$, so $F = pA = 10^{5} \\times ${n(l * h)} = ${E(value).toLatex({ format: 'sf' })}\\ \\text{N}$.`,
    trap: 'Force = pressure × area; the wall does not fall over because the same air pushes on the other side.',
    tags: ['pressure', 'force'],
    params: { variant: 'atmosphere', p, l, h },
  });
}

/** The time light takes to reach the Earth from the Sun (or the Moon). */
function lightTimeQ(rng: RNG): Generated | null {
  const [name, d] = rng.pick([['the Sun', 1.5e11], ['Mars at its closest', 7.5e10], ['the Moon', 3.9e8]] as [string, number][]);
  const c = 3e8;
  const value = round(d / c);
  const mode = modeOf(rng);
  const lead = `${name.charAt(0).toUpperCase()}${name.slice(1)} is about $${E(d).toLatex({ format: 'sf' })}\\ \\text{m}$ from the Earth, and light travels at $3 \\times 10^{8}\\ \\text{m s}^{-1}$.`;
  return estimate(rng, {
    stem: `${lead}\n\n${mode === 'choice' ? `${ASK_CHOICE} of the time light takes to travel from ${name} to the Earth?` : `Estimate the time light takes to travel from ${name} to the Earth, in seconds. ${TO_1SF}`}`,
    value,
    unit: '\\text{s}',
    mode,
    mistakes: [
      { value: round(c / d), trap: 'divided the wrong way round' },
      { value: round(d / c / 60), trap: 'gave the time in minutes' },
      { value: round(d / (c * 1000)), trap: 'a factor of $10^{3}$ slipped in' },
      { value: round((d * 1000) / c), trap: 'treated the distance as kilometres' },
    ],
    solution: `$t = \\dfrac{d}{c} = \\dfrac{${E(d).toLatex({ format: 'sf' })}}{3 \\times 10^{8}} \\approx ${E(sf1(value)).toLatex({ format: fmtFor(sf1(value)) })}\\ \\text{s}$.`,
    trap: 'Divide the distance by the speed; dividing the wrong way round is out by many orders of magnitude.',
    tags: ['speed', 'standard form'],
    params: { variant: 'light-time', d, c },
  });
}

// ----------------------------------------------------------------------------- level 5

/** The useful power of a person climbing stairs. */
function stairsQ(rng: RNG): Generated | null {
  const m = rng.pick([50, 60, 70, 80]);
  const h = rng.pick([3, 4, 5]);
  const t = rng.pick([4, 5, 6, 8, 10]);
  const value = round((m * 10 * h) / t);
  const mode = modeOf(rng);
  const lead = `A person of mass $${n(m)}\\ \\text{kg}$ climbs a flight of stairs of vertical height $${n(h)}\\ \\text{m}$ in $${n(t)}\\ \\text{s}$. Take $g = 10\\ \\text{m s}^{-2}$.`;
  return estimate(rng, {
    stem: `${lead}\n\n${mode === 'choice' ? `${ASK_CHOICE} of the useful power developed?` : `Estimate the useful power developed. ${TO_1SF}`}`,
    value,
    unit: '\\text{W}',
    mode,
    mistakes: [
      { value: round(m * 10 * h), trap: 'gave the energy in J, not the power' },
      { value: round((m * h) / t), trap: 'forgot $g$ in $mgh$' },
      { value: round(m * 10 * h * t), trap: 'multiplied by the time instead of dividing' },
      { value: round((m * 10 * h) / t / 1000), trap: 'gave the answer in kW' },
    ],
    solution: `Work done $= mgh = ${n(m)} \\times 10 \\times ${n(h)} = ${n(m * 10 * h)}\\ \\text{J}$, so $P = W/t = ${n(m * 10 * h)}/${n(t)} \\approx ${napp(value)}\\ \\text{W}$, i.e. about $${n(sf1(value))}\\ \\text{W}$.`,
    trap: 'Power is energy per second: the mgh must be divided by the time, and g must not be dropped.',
    tags: ['power', 'energy'],
    params: { variant: 'stairs', m, h, t },
  });
}

/** The mass of water in a swimming pool. */
function poolQ(rng: RNG): Generated | null {
  const l = rng.pick([20, 25, 50]);
  const w = rng.pick([8, 10, 12]);
  const d = rng.pick([1.5, 2, 2.5]);
  const rho = 1000;
  const value = round(rho * l * w * d);
  const mode = modeOf(rng);
  const lead = `A swimming pool is $${n(l)}\\ \\text{m}$ long, $${n(w)}\\ \\text{m}$ wide and $${n(d)}\\ \\text{m}$ deep. Water has density $1000\\ \\text{kg m}^{-3}$.`;
  return estimate(rng, {
    stem: `${lead}\n\n${mode === 'choice' ? `${ASK_CHOICE} of the mass of water in the pool?` : `Estimate the mass of water in the pool. ${TO_1SF}`}`,
    value,
    unit: '\\text{kg}',
    mode,
    mistakes: [
      { value: round(l * w * d), trap: 'gave the volume in m³, not the mass' },
      { value: round(rho * l * w), trap: 'forgot the depth' },
      { value: round(rho * l * w * d * 1000), trap: 'treated the density as $10^{6}$' },
      { value: round((rho * l * w * d) / 1000), trap: 'gave the answer in tonnes' },
    ],
    solution: `Volume $= ${n(l)} \\times ${n(w)} \\times ${n(d)} = ${n(l * w * d)}\\ \\text{m}^{3}$, so the mass is $1000 \\times ${n(l * w * d)} = ${E(value).toLatex({ format: 'sf' })}\\ \\text{kg}$.`,
    trap: 'Mass = density × volume, and the volume needs all three dimensions.',
    tags: ['density', 'volume'],
    params: { variant: 'pool', rho, l, w, d },
  });
}

/** The energy a car gets from its fuel, per kilometre. */
function fuelQ(rng: RNG): Generated | null {
  const litres = rng.pick([5, 6, 8, 10]);
  const per = 100; // km
  const perLitre = 3e7;
  const value = round((litres * perLitre) / per);
  const mode = modeOf(rng);
  const lead = `A car uses $${n(litres)}$ litres of fuel every $100\\ \\text{km}$, and one litre of fuel releases about $3 \\times 10^{7}\\ \\text{J}$.`;
  return estimate(rng, {
    stem: `${lead}\n\n${mode === 'choice' ? `${ASK_CHOICE} of the energy released per kilometre travelled?` : `Estimate the energy released per kilometre travelled. ${TO_1SF}`}`,
    value,
    unit: '\\text{J}',
    mode,
    mistakes: [
      { value: round(litres * perLitre), trap: 'gave the energy for the whole 100 km' },
      { value: round(perLitre / per), trap: 'forgot how many litres are used' },
      { value: round((litres * perLitre) / (per * 1000)), trap: 'worked per metre, not per kilometre' },
      { value: round((per * perLitre) / litres), trap: 'divided by the litres instead of the distance' },
    ],
    solution: `Energy for $100\\ \\text{km}$ $= ${n(litres)} \\times 3 \\times 10^{7} = ${E(litres * perLitre).toLatex({ format: 'sf' })}\\ \\text{J}$, so per km it is $${E(sf1(value)).toLatex({ format: 'sf' })}\\ \\text{J}$.`,
    trap: 'Divide by the 100 km, not by the number of litres: the answer is an energy per kilometre.',
    tags: ['energy', 'standard form'],
    params: { variant: 'fuel', litres, per, perLitre },
  });
}

// ----------------------------------------------------------------------------- assembly

const VARIANTS: Record<Level, ((rng: RNG) => Generated | null)[]> = {
  1: [airMassQ],
  2: [heartbeatsQ, breathingQ],
  3: [kettleEnergyQ, kettleTimeQ],
  4: [atmosphereQ, lightTimeQ],
  5: [stairsQ, poolQ, fuelQ],
};

/** The true value, recomputed from the stated assumptions by a different route. */
function trueValue(p: Record<string, number> & { variant: string }): number | null {
  switch (p.variant) {
    case 'air-mass': return ((p.h * p.w) * p.l) * p.rho;
    case 'heartbeats': return p.rate * (365 * 1440);
    case 'breathing': return (p.rate * 1440 * p.litres) / 1000;
    case 'kettle-energy': return p.dT * p.c * p.m;
    case 'kettle-time': return (p.dT * p.c * p.m) / (p.kw * 1000);
    case 'atmosphere': return (p.h * p.l) * p.p;
    case 'light-time': return p.d / p.c;
    case 'stairs': return (p.h * 10 * p.m) / p.t;
    case 'pool': return ((p.d * p.w) * p.l) * p.rho;
    case 'fuel': return (p.perLitre / p.per) * p.litres;
  }
  return null;
}

export default defineTemplate({
  id: 'phy.units.estimation',
  module: 'PHY',
  topic: 'units',
  title: 'Order-of-magnitude estimates',
  levels: {
    1: 'the mass of the air in a room (ρ = 1.2 kg m⁻³)',
    2: 'heartbeats in a year; the volume of air breathed in a day',
    3: 'the energy to heat a kettle of water; how long the kettle takes',
    4: 'the force of the atmosphere on a wall; the time light takes to reach the Earth',
    5: 'the power of someone climbing stairs; the water in a swimming pool; a car’s fuel energy per km',
  },
  generate(rng, level: Level) {
    return retry(rng, () => pickVariant(rng, VARIANTS[level]));
  },
  verify(q) {
    const p = q.params as Record<string, number> & { variant: string; mode: string; opts?: { display: string; value: number }[] };
    const truth = trueValue(p);
    if (truth === null || !Number.isFinite(truth) || truth <= 0) return false;
    const target = sf1(truth);
    if (!(Math.abs(truth / target - 1) < 0.5)) return false; // 1 s.f. must really be close

    if (p.mode === 'exact') {
      if (q.answer.kind !== 'exact') return false;
      return Math.abs(q.answer.value.toNumber() - target) <= 1e-9 * target;
    }
    if (q.answer.kind !== 'choice' || q.typedAllowed || !p.opts) return false;
    if (p.opts.length !== q.options.length) return false;
    // every option must be the one params claims, and exactly one within a factor of 3 of the truth
    let close = 0;
    for (let i = 0; i < q.options.length; i++) {
      if (q.options[i].display !== p.opts[i].display) return false;
      const r = p.opts[i].value / truth;
      if (r > 1 / 3 && r < 3) {
        close++;
        if (!q.options[i].correct || q.options[i].display !== q.answer.value) return false;
        if (Math.abs(p.opts[i].value - target) > 1e-9 * target) return false;
      }
    }
    return close === 1;
  },
});
