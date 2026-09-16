import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, Exact, frac, ratToDecimalString, type NumberFormat } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import type { RNG } from '../../core/rng';

/**
 * V = IR and the three power formulas (P = VI = I²R = V²/R), plus E = Pt.
 * Level 1: V = IR, I = V/R, R = V/I and P = VI with clean numbers
 * Level 2: P = I²R and P = V²/R (values chosen so the power is a whole number of watts)
 * Level 3: E = Pt in J or kJ; the current an appliance draws from a 12 V, 24 V or 240 V supply
 * Level 4: the resistance of a lamp from its rating (60 W, 240 V → 960 Ω); I = √(P/R); heat in a resistor in t s
 * Level 5: ratios — P ∝ V² when the supply p.d. changes, R ∝ V²/P for two lamps (answer a fraction),
 *          and the power dissipated in one resistor of a series pair
 *
 * Answers carry their unit (V, A, W, Ω, J, kJ); the resistance ratios are bare fractions. Every wrong option is
 * a named mistake (P = VI², R = V × I, P ∝ V, kJ for J, the rated power at the wrong p.d.); parameters that
 * cannot supply four distinct clean ones are redrawn rather than padded.
 */

const U_V = '\\text{V}', U_A = '\\text{A}', U_W = '\\text{W}', U_OHM = '\\text{Ω}', U_J = '\\text{J}', U_KJ = '\\text{kJ}';

type Mode = 'decimal' | 'fraction';
type Candidate = { value: Exact | null; trap: string; /** a unit slip: allowed to sit far from the answer */ wide?: boolean };

/** Plain number for a stem: 1200, 0.05, 21.6. */
const n = (x: number): string => (Number.isInteger(x) ? `${x}` : `${Number(x.toPrecision(10))}`);
/** Round away floating-point noise. */
const r = (x: number): number => Number(x.toPrecision(12));
/** "a 6 Ω resistor", "an 8 Ω resistor" (capitalised when it opens the sentence). */
const anRes = (x: number, capital = false): string => {
  const i = Math.floor(Math.abs(x));
  const an = i === 8 || i === 11 || i === 18 || (i >= 80 && i <= 89);
  return `${capital ? (an ? 'An' : 'A') : an ? 'an' : 'a'} ${n(x)} Ω resistor`;
};
/** "a 12 V supply", "an 8 V supply" — the article a candidate would read aloud. */
const supply = (v: number): string => {
  const i = Math.floor(Math.abs(v));
  const art = i === 8 || i === 11 || i === 18 || (i >= 80 && i <= 89) ? 'an' : 'a';
  return `${art} ${n(v)} V supply`;
};

/** Exact value of a computed quantity, or null if it is not an exam-clean number. */
function val(x: number): Exact | null {
  if (!Number.isFinite(x)) return null;
  const y = r(x);
  if (!Number.isInteger(r(y * 1000))) return null; // must terminate by the third decimal place
  try {
    const v = E(y);
    return isCleanExact(v).ok ? v : null;
  } catch {
    return null;
  }
}

/** At most four significant digits once printed: an option a candidate can read at a glance. */
function readable(v: Exact): boolean {
  const dec = ratToDecimalString(v.toRat());
  if (dec === null) return true; // shown as a fraction; the denominator check covers it
  const digits = dec.replace('-', '').replace('.', '').replace(/^0+/, '').replace(/0+$/, '');
  return digits.length <= 4;
}

/** Exact fraction a/b in its lowest terms, or null if it is not an exam-clean ratio. */
function ratio(a: number, b: number): Exact | null {
  if (!Number.isInteger(a) || !Number.isInteger(b) || b === 0) return null;
  try {
    const v = frac(a, b);
    if (!isCleanExact(v).ok) return null;
    const q = v.toRat();
    return q.d <= 24n ? v : null;
  } catch {
    return null;
  }
}

/**
 * Positive, finite, clean, exam-sized option values. Anything more than 100 times the answer (or less than a
 * hundredth of it) is dropped: an option no candidate would consider wastes a line.
 */
function cleanOnly(ds: Candidate[], mode: Mode, answer: Exact): Distractor[] {
  const a = answer.toNumber();
  return ds.filter((d): d is { value: Exact; trap: string } => {
    const v = d.value;
    if (!v || !Number.isFinite(v.toNumber()) || v.sign() <= 0 || !v.isRational() || !isCleanExact(v).ok) return false;
    const x = v.toNumber();
    if (x < 0.001 || x > 5e6) return false;
    if (!d.wide && (x > 100 * a || x < a / 100)) return false;
    const d2 = v.toRat().d;
    if (mode === 'fraction') return d2 <= 24n;
    if (!readable(v)) return false;
    return d2 <= 24n || Number.isInteger(r(x * 1000));
  });
}

/** Every `must` trap gets a slot before any `extra` one, so the headline mistakes are never shuffled out. */
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
  mode?: Mode;
  must: Candidate[];
  extra: Candidate[];
  solution: string;
  trap: string;
  tags: string[];
  params: Record<string, unknown>;
}

function pack(rng: RNG, p: Pack): Generated | null {
  const mode: Mode = p.mode ?? 'decimal';
  if (!isCleanExact(p.answer).ok || p.answer.sign() <= 0) return null;
  if (mode !== 'fraction' && !readable(p.answer)) return null;
  const format: NumberFormat = mode === 'fraction' ? 'fraction' : 'decimal';
  const ds = ranked(rng, p.answer, cleanOnly(p.must, mode, p.answer), cleanOnly(p.extra, mode, p.answer));
  if (ds.length < 4) return null; // never pad: redraw instead
  return {
    stem: p.stem,
    answer: { kind: 'exact', value: p.answer, format, unit: p.unit },
    options: buildOptions(rng, p.answer, ds, { format, unit: p.unit }),
    solution: p.solution,
    trap: p.trap,
    tags: p.tags,
    params: p.params,
    typedAllowed: true,
  };
}

// --------------------------------------------------------------------------- level 1

const I_POOL = [0.5, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
const R_POOL = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 100, 120];

function ohmVQ(rng: RNG): Generated | null {
  const I = rng.pick(I_POOL);
  const R = rng.pick(R_POOL);
  const V = r(I * R);
  if (!Number.isInteger(V) || V < 4 || V > 300 || I === R) return null;
  const answer = val(V);
  if (!answer) return null;
  return pack(rng, {
    stem: `A current of ${n(I)} A flows through a resistor of resistance ${R} Ω. Find the potential difference across the resistor.`,
    answer,
    unit: U_V,
    must: [
      { value: val(R / I), trap: 'divided instead of multiplying: V = IR' },
      { value: val(I + R), trap: 'added the current and the resistance' },
    ],
    extra: [
      { value: val(I / R), trap: 'inverted the product' },
      { value: val(V * I), trap: 'gave the power VI, not the p.d.' },
      { value: val(2 * V), trap: 'doubled the p.d.' },
      { value: val(V / 2), trap: 'halved the p.d.' },
    ],
    solution: `$V = IR = ${n(I)} \\times ${R} = ${n(V)}\\ \\text{V}$.`,
    trap: 'V = IR is a product: dividing gives neither the p.d. nor the power.',
    tags: ['ohms-law', 'pd'],
    params: { variant: 'ohm-v', I, R },
  });
}

function ohmIQ(rng: RNG): Generated | null {
  const I = rng.pick(I_POOL);
  const R = rng.pick(R_POOL);
  const V = r(I * R);
  if (!Number.isInteger(V) || V < 6 || V > 300 || I === R || R === 1) return null;
  const answer = val(I);
  if (!answer) return null;
  return pack(rng, {
    stem: `${supply(V).charAt(0).toUpperCase() + supply(V).slice(1)} is connected across a resistor of resistance ${R} Ω. Find the current in the resistor.`,
    answer,
    unit: U_A,
    must: [
      { value: val(V * R), trap: 'multiplied instead of dividing: I = V/R' },
      { value: val(R / V), trap: 'divided the resistance by the p.d.' },
    ],
    extra: [
      { value: val(V * I), trap: 'gave the power, not the current' },
      { value: val(2 * I), trap: 'doubled the current' },
      { value: val(I / 2), trap: 'halved the current' },
      { value: val(10 * I), trap: 'slipped a decimal place' },
    ],
    solution: `$I = \\dfrac{V}{R} = \\dfrac{${n(V)}}{${R}} = ${n(I)}\\ \\text{A}$.`,
    trap: 'I = V/R: the current is the p.d. divided by the resistance, not their product.',
    tags: ['ohms-law', 'current'],
    params: { variant: 'ohm-i', I, R },
  });
}

function ohmRQ(rng: RNG): Generated | null {
  const I = rng.pick(I_POOL);
  const R = rng.pick(R_POOL);
  const V = r(I * R);
  if (!Number.isInteger(V) || V < 6 || V > 300 || I === R) return null;
  const answer = val(R);
  if (!answer) return null;
  return pack(rng, {
    stem: `A lamp draws a current of ${n(I)} A from ${supply(V)}. Find the resistance of the lamp.`,
    answer,
    unit: U_OHM,
    must: [
      { value: val(V * I), trap: 'used R = V × I instead of R = V ÷ I' },
      { value: val(I / V), trap: 'inverted the fraction: R = I/V' },
    ],
    extra: [
      { value: val(V - I), trap: 'subtracted the current from the p.d.' },
      { value: val(2 * R), trap: 'doubled the resistance' },
      { value: val(R / 2), trap: 'halved the resistance' },
      { value: val(10 * R), trap: 'slipped a decimal place' },
    ],
    solution: `$R = \\dfrac{V}{I} = \\dfrac{${n(V)}}{${n(I)}} = ${R}\\ \\Omega$.`,
    trap: 'R = V/I. The product V × I is the power in watts, not the resistance.',
    tags: ['ohms-law', 'resistance'],
    params: { variant: 'ohm-r', I, R },
  });
}

function powerVIQ(rng: RNG): Generated | null {
  const V = rng.pick([3, 4, 5, 6, 9, 10, 12, 20, 24, 30, 40, 50, 60, 100, 120, 240]);
  const I = rng.pick([0.2, 0.5, 1.5, 2, 3, 4, 5, 6, 8, 10]);
  const P = r(V * I);
  if (!Number.isInteger(P) || P < 2 || P > 3000 || V === I) return null;
  const answer = val(P);
  if (!answer) return null;
  const device = rng.pick(['An electric motor', 'A small heater', 'A lamp', 'A cooling fan']);
  return pack(rng, {
    stem: `${device} draws a current of ${n(I)} A from a ${V} V supply. Find the power of the ${device.split(' ').slice(1).join(' ')}.`,
    answer,
    unit: U_W,
    must: [
      { value: val(V * I * I), trap: 'used P = VI² (the current is squared only in P = I²R)' },
      { value: val(V / I), trap: 'divided instead of multiplying (that is the resistance)' },
    ],
    extra: [
      { value: val(V + I), trap: 'added the p.d. and the current' },
      { value: val(V * V * I), trap: 'squared the p.d. as well' },
      { value: val(P / 1000), trap: 'gave the answer in kW', wide: true },
      { value: val(2 * P), trap: 'doubled the power' },
    ],
    solution: `$P = VI = ${V} \\times ${n(I)} = ${n(P)}\\ \\text{W}$.`,
    trap: 'P = VI. Squaring belongs to the other two forms: P = I²R and P = V²/R.',
    tags: ['power', 'ohms-law'],
    params: { variant: 'power-vi', V, I },
  });
}

// --------------------------------------------------------------------------- level 2

function powerI2RQ(rng: RNG): Generated | null {
  const I = rng.pick([0.5, 1.5, 2, 3, 4, 5, 6]);
  const R = rng.pick([4, 5, 6, 8, 10, 12, 15, 20, 25, 40, 50, 100]);
  const P = r(I * I * R);
  if (!Number.isInteger(P) || P < 4 || P > 3000) return null;
  const answer = val(P);
  if (!answer) return null;
  return pack(rng, {
    stem: `A current of ${n(I)} A flows through a resistor of resistance ${R} Ω. Find the power dissipated in the resistor.`,
    answer,
    unit: U_W,
    must: [
      { value: val(I * R), trap: 'used P = IR — that product is the p.d. across the resistor, not the power' },
      { value: val(I * R * R), trap: 'squared the resistance instead of the current' },
    ],
    extra: [
      { value: val((I * I) / R), trap: 'divided by R instead of multiplying' },
      { value: val(2 * P), trap: 'doubled the power' },
      { value: val(P / 2), trap: 'halved the power' },
      { value: val(P / 1000), trap: 'gave the answer in kW', wide: true },
    ],
    solution: `$P = I^2 R = ${n(I)}^2 \\times ${R} = ${n(I * I)} \\times ${R} = ${n(P)}\\ \\text{W}$.`,
    trap: 'In P = I²R only the current is squared; IR is the p.d. across the resistor.',
    tags: ['power', 'i2r'],
    params: { variant: 'power-i2r', I, R },
  });
}

function powerV2RQ(rng: RNG): Generated | null {
  const V = rng.pick([6, 10, 12, 20, 24, 30, 40, 50, 60, 100, 120, 240]);
  const R = rng.pick([2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 24, 25, 30, 40, 50, 60, 100, 120, 200, 240]);
  const P = r((V * V) / R);
  if (!Number.isInteger(P) || P < 4 || P > 3000 || R >= V * V) return null;
  const answer = val(P);
  if (!answer) return null;
  return pack(rng, {
    stem: `${supply(V).charAt(0).toUpperCase() + supply(V).slice(1)} is connected across a resistor of resistance ${R} Ω. Find the power dissipated in the resistor.`,
    answer,
    unit: U_W,
    must: [
      { value: val(V / R), trap: 'that is the current in the resistor, not the power' },
      { value: val(V * R), trap: 'multiplied instead of dividing' },
    ],
    extra: [
      { value: val((V * V) / (R * R)), trap: 'squared the resistance as well' },
      { value: val(2 * P), trap: 'doubled the power' },
      { value: val(P / 2), trap: 'halved the power' },
      { value: val(P / 1000), trap: 'gave the answer in kW', wide: true },
    ],
    solution: `$P = \\dfrac{V^2}{R} = \\dfrac{${V * V}}{${R}} = ${n(P)}\\ \\text{W}$.`,
    trap: 'P = V²/R: square the p.d., not the resistance. V/R alone is the current.',
    tags: ['power', 'v2r'],
    params: { variant: 'power-v2r', V, R },
  });
}

// --------------------------------------------------------------------------- level 3

function energyPtQ(rng: RNG): Generated | null {
  const inKW = rng.bool(0.6);
  const Pstated = inKW ? rng.pick([0.5, 1, 1.2, 1.5, 2, 2.4, 3]) : rng.pick([40, 50, 60, 75, 100, 150, 200, 250, 500]);
  const P = inKW ? r(Pstated * 1000) : Pstated;
  const inMin = rng.bool(0.6);
  const tStated = inMin ? rng.pick([2, 3, 4, 5, 10, 15, 20]) : rng.pick([20, 30, 40, 60, 90]);
  const t = inMin ? tStated * 60 : tStated;
  const Ej = r(P * t);
  if (Ej < 500 || Ej > 3e6) return null;
  const inKJ = Ej >= 10000;
  const scale = inKJ ? 1 / 1000 : 1;
  const answer = val(Ej * scale);
  if (!answer) return null;
  const unit = inKJ ? U_KJ : U_J;
  const unitName = inKJ ? 'kJ' : 'J';
  const pText = inKW ? `${n(Pstated)} kW` : `${Pstated} W`;
  const tText = inMin ? `${tStated} minute${tStated === 1 ? '' : 's'}` : `${tStated} s`;
  const device = rng.pick(['An electric heater', 'A kettle', 'An immersion heater', 'A toaster']);
  return pack(rng, {
    stem: `${device} of power ${pText} is switched on for ${tText}. Find the energy it transfers, in ${unitName}.`,
    answer,
    unit,
    must: [
      { value: val(Pstated * tStated), trap: `multiplied the numbers as they stand (${pText} × ${tText}) without converting to watts and seconds` },
      { value: val(Ej * (inKJ ? 1 : 1 / 1000)), trap: inKJ ? 'gave the energy in J, not kJ' : 'gave the energy in kJ, not J', wide: true },
    ],
    extra: [
      { value: val((P / t) * scale), trap: 'divided the power by the time' },
      { value: val(P * scale), trap: 'gave the power, not the energy', wide: true },
      { value: val(2 * Ej * scale), trap: 'doubled the energy' },
      { value: val(Ej * scale * 60), trap: 'multiplied by 60 once too often' },
    ],
    solution: `$E = Pt = ${n(P)} \\times ${t} = ${n(Ej)}\\ \\text{J}${inKJ ? ` = ${n(Ej / 1000)}\\ \\text{kJ}` : ''}$.`,
    trap: 'E = Pt needs watts and seconds: convert kW to W and minutes to seconds before multiplying, then convert J to kJ.',
    tags: ['energy', 'power', 'time'],
    params: { variant: 'energy-pt', P, t, inKJ },
  });
}

function currentFromRatingQ(rng: RNG): Generated | null {
  const V = rng.pick([12, 24, 240]);
  const I = rng.pick([0.5, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12.5]);
  const P = r(V * I);
  if (!Number.isInteger(P) || P < 6 || P > 3000) return null;
  const inKW = P >= 1000 && Number.isInteger(r(P / 100));
  const Pstated = inKW ? r(P / 1000) : P;
  const answer = val(I);
  if (!answer) return null;
  const device = P >= 500
    ? rng.pick(['An electric kettle', 'A hairdryer', 'A microwave oven', 'A toaster'])
    : rng.pick(['A television', 'A desk lamp', 'A laptop charger', 'A small fan']);
  return pack(rng, {
    stem: `${device} of power ${n(Pstated)} ${inKW ? 'kW' : 'W'} is connected to a ${V} V supply. Find the current it draws.`,
    answer,
    unit: U_A,
    must: [
      { value: val(P * V), trap: 'multiplied instead of dividing: I = P/V' },
      { value: inKW ? val(Pstated / V) : val(V / P), trap: inKW ? 'forgot to convert kW to W' : 'divided the p.d. by the power', wide: true },
    ],
    extra: [
      { value: val(V / P), trap: 'inverted the fraction' },
      { value: val((P / V) * 2), trap: 'doubled the current' },
      { value: val(P / V / 2), trap: 'halved the current' },
      { value: val((P / V) * 10), trap: 'slipped a decimal place' },
    ],
    solution: `$P = VI$, so $I = \\dfrac{P}{V} = \\dfrac{${P}}{${V}} = ${n(I)}\\ \\text{A}$.`,
    trap: 'Divide the power in watts by the supply p.d.; a rating in kW must be turned into watts first.',
    tags: ['power', 'current', 'mains'],
    params: { variant: 'current-from-rating', V, P },
  });
}

// --------------------------------------------------------------------------- level 4

function bulbResistanceQ(rng: RNG): Generated | null {
  const V = rng.pick([12, 24, 100, 120, 200, 240]);
  const I = rng.pick([0.25, 0.5, 1.5, 2, 2.5, 3, 4, 5]);
  const P = r(V * I);
  const R = r(V / I);
  if (!Number.isInteger(P) || !Number.isInteger(R) || P < 6 || P > 3000 || R > 2000) return null;
  const answer = val(R);
  if (!answer) return null;
  const device = P >= 500 ? rng.pick(['An electric heater', 'An immersion heater']) : P >= 150 ? rng.pick(['A filament lamp', 'A soldering iron']) : 'A filament lamp';
  return pack(rng, {
    stem: `${device} is rated ${P} W, ${V} V. Find its resistance when it is operating normally.`,
    answer,
    unit: U_OHM,
    must: [
      { value: val(V / P), trap: 'used R = V/P instead of R = V²/P' },
      { value: val(P / V), trap: 'gave the current the device draws, not its resistance' },
    ],
    extra: [
      { value: val(V * P), trap: 'multiplied instead of dividing' },
      { value: val((P * P) / V), trap: 'squared the power instead of the p.d.' },
      { value: val(2 * R), trap: 'doubled the resistance' },
      { value: val(R / 2), trap: 'halved the resistance' },
    ],
    solution: `$I = \\dfrac{P}{V} = \\dfrac{${P}}{${V}} = ${n(I)}\\ \\text{A}$, so $R = \\dfrac{V}{I} = ${R}\\ \\Omega$ (i.e. $R = \\dfrac{V^2}{P} = \\dfrac{${V * V}}{${P}}$).`,
    trap: 'R = V²/P, not V/P: the rating gives the power, so find the current P/V first if that is quicker.',
    tags: ['power', 'resistance', 'rating'],
    params: { variant: 'bulb-resistance', V, P },
  });
}

function heatInResistorQ(rng: RNG): Generated | null {
  const I = rng.pick([0.5, 1.5, 2, 3, 4, 5]);
  const R = rng.pick([4, 5, 6, 8, 10, 12, 15, 20, 25, 40, 50]);
  const inMin = rng.bool(0.6);
  const tStated = inMin ? rng.pick([1, 2, 3, 5]) : rng.pick([10, 20, 30, 60]);
  const t = inMin ? tStated * 60 : tStated;
  const P = r(I * I * R);
  const Ej = r(P * t);
  if (!Number.isInteger(P) || P < 4 || P > 2000 || Ej < 200 || Ej > 3e5) return null;
  const inKJ = Ej >= 10000;
  const scale = inKJ ? 1 / 1000 : 1;
  const answer = val(Ej * scale);
  if (!answer) return null;
  const tText = inMin ? `${tStated} minute${tStated === 1 ? '' : 's'}` : `${tStated} s`;
  return pack(rng, {
    stem: `A current of ${n(I)} A flows through a resistor of resistance ${R} Ω for ${tText}. Find the energy transferred to the resistor, in ${inKJ ? 'kJ' : 'J'}.`,
    answer,
    unit: inKJ ? U_KJ : U_J,
    must: [
      { value: val(I * R * t * scale), trap: 'forgot to square the current' },
      { value: val(P * tStated * scale), trap: inMin ? 'used the time in minutes instead of seconds' : 'used the power, not the energy' },
    ],
    extra: [
      { value: val(P * scale), trap: 'gave the power, not the energy', wide: true },
      { value: val(Ej * (inKJ ? 1 : 1 / 1000)), trap: inKJ ? 'gave the energy in J, not kJ' : 'gave the energy in kJ, not J', wide: true },
      { value: val(I * I * R * R * t * scale), trap: 'squared the resistance as well' },
      { value: val(2 * Ej * scale), trap: 'doubled the energy' },
    ],
    solution: `$P = I^2R = ${n(I * I)} \\times ${R} = ${n(P)}\\ \\text{W}$, so $E = Pt = ${n(P)} \\times ${t} = ${n(Ej)}\\ \\text{J}${inKJ ? ` = ${n(Ej / 1000)}\\ \\text{kJ}` : ''}$.`,
    trap: 'Square the current, then multiply by the time in seconds; IRt misses the second factor of I.',
    tags: ['heating-effect', 'energy', 'i2r'],
    params: { variant: 'heat-in-resistor', I, R, t, inKJ },
  });
}

function currentFromPRQ(rng: RNG): Generated | null {
  const I = rng.pick([2, 3, 4, 5, 6]);
  const R = rng.pick([2, 3, 5, 8, 10, 12, 20, 25]);
  const P = r(I * I * R);
  if (!Number.isInteger(P) || P < 20 || P > 3000) return null;
  const answer = val(I);
  if (!answer) return null;
  return pack(rng, {
    stem: `A heating element of resistance ${R} Ω dissipates ${P} W. Find the current in the element.`,
    answer,
    unit: U_A,
    must: [
      { value: val(P / R), trap: 'forgot to take the square root of P/R' },
      { value: val(Math.sqrt(P * R)), trap: 'multiplied instead of dividing inside the square root' },
    ],
    extra: [
      { value: val(P / (R * R)), trap: 'divided by R² instead of R' },
      { value: val(R / P), trap: 'inverted the fraction' },
      { value: val(2 * I), trap: 'doubled the current' },
      { value: val(I / 2), trap: 'halved the current' },
    ],
    solution: `$P = I^2R$, so $I^2 = \\dfrac{${P}}{${R}} = ${I * I}$ and $I = ${I}\\ \\text{A}$.`,
    trap: 'P = I²R gives I² = P/R — the square root is the last step, and it is easy to forget.',
    tags: ['power', 'current', 'i2r'],
    params: { variant: 'current-from-pr', R, P },
  });
}

// --------------------------------------------------------------------------- level 5

function voltageScaledQ(rng: RNG): Generated | null {
  const V1 = rng.pick([4, 5, 6, 8, 10, 12, 20, 24, 30, 40, 50, 60]);
  const k = rng.pick([2, 3, 0.5, 1.5, 4]);
  const V2 = r(V1 * k);
  const P1 = rng.pick([4, 8, 9, 12, 16, 18, 20, 24, 25, 32, 36, 40, 45, 48, 50, 60, 72, 80, 100]);
  const P2 = r(P1 * k * k);
  if (!Number.isInteger(V2) || V2 < 2 || V2 > 250 || P2 < 1 || P2 > 3000) return null;
  const answer = val(P2);
  if (!answer) return null;
  return pack(rng, {
    stem: `A resistor dissipates ${P1} W when the potential difference across it is ${V1} V. Its resistance does not change. Find the power it dissipates when the potential difference across it is ${n(V2)} V.`,
    answer,
    unit: U_W,
    must: [
      { value: val(P1 * k), trap: 'scaled the power in proportion to V — the power goes with V²' },
      { value: val(P1 / (k * k)), trap: 'scaled the power the wrong way round' },
    ],
    extra: [
      { value: val(P1 / k), trap: 'scaled the power the wrong way round, linearly' },
      { value: val(P1 * k * k * k), trap: 'cubed the p.d. ratio' },
      { value: val(P1), trap: 'assumed the power is unchanged' },
      { value: val(2 * P2), trap: 'doubled the answer' },
    ],
    solution: `$P = \\dfrac{V^2}{R}$ with $R$ fixed, so $P \\propto V^2$. The p.d. is multiplied by $${n(k)}$, so the power is multiplied by $${n(k * k)}$: $${P1} \\times ${n(k * k)} = ${n(P2)}\\ \\text{W}$.`,
    trap: 'Doubling the p.d. quadruples the power: P ∝ V² at constant resistance.',
    tags: ['power', 'proportion', 'ratio'],
    params: { variant: 'voltage-scaled', V1, P1, V2 },
  });
}

/** (P1, P2) pairs whose ratio is a simple fraction in its lowest terms. */
const POWER_PAIRS: [number, number][] = [
  [40, 60], [60, 40], [60, 100], [100, 60], [25, 100], [100, 25], [40, 100], [100, 40], [75, 150], [150, 75], [50, 75], [75, 50], [60, 150], [150, 60], [120, 40], [40, 120],
];
/** (V1, V2) pairs for two devices of the same power rating. */
const VOLT_PAIRS: [number, number][] = [[120, 240], [240, 120], [100, 200], [200, 100], [12, 24], [24, 12], [60, 120], [120, 60], [10, 30], [30, 10]];

function resistanceRatioQ(rng: RNG): Generated | null {
  if (rng.bool(0.6)) {
    const [P1, P2] = rng.pick(POWER_PAIRS);
    const V = rng.pick([12, 24, 120, 240]);
    const answer = ratio(P2, P1); // R = V²/P at the same p.d., so R1 : R2 = P2 : P1
    if (!answer || answer.equals(E(1))) return null;
    return pack(rng, {
      stem: `Two lamps are rated ${P1} W, ${V} V and ${P2} W, ${V} V. Each is operating normally. Find the ratio of the resistance of the ${P1} W lamp to the resistance of the ${P2} W lamp, as a fraction in its lowest terms.`,
      answer,
      mode: 'fraction',
      must: [
        { value: ratio(P1, P2), trap: 'inverted the ratio: at a fixed p.d. R = V²/P, so the resistance is inversely proportional to the power' },
        { value: E(1), trap: 'assumed lamps on the same supply p.d. have the same resistance' },
      ],
      extra: [
        { value: ratio(P2 * P2, P1 * P1), trap: 'squared the power ratio' },
        { value: ratio(P1 * P1, P2 * P2), trap: 'squared the inverted ratio' },
        { value: ratio(2 * P2, P1), trap: 'arithmetic slip in the ratio' },
        { value: ratio(P2, 2 * P1), trap: 'arithmetic slip in the ratio' },
      ],
      solution: `$R = \\dfrac{V^2}{P}$ and the p.d. is the same for both, so $\\dfrac{R_1}{R_2} = \\dfrac{P_2}{P_1} = \\dfrac{${P2}}{${P1}} = ${answer.toLatex()}$.`,
      trap: 'At a fixed p.d. the more powerful lamp has the smaller resistance: R ∝ 1/P.',
      tags: ['power', 'resistance', 'ratio'],
      params: { variant: 'resistance-ratio-power', V1: V, V2: V, P1, P2 },
    });
  }
  const [V1, V2] = rng.pick(VOLT_PAIRS);
  const P = rng.pick([40, 60, 100, 500, 1000]);
  const answer = ratio(V1 * V1, V2 * V2);
  if (!answer || answer.equals(E(1))) return null;
  return pack(rng, {
    stem: `Two heaters have the same power rating of ${P} W, one at ${V1} V and the other at ${V2} V. Each operates at its rated potential difference. Find the ratio of the resistance of the ${V1} V heater to the resistance of the ${V2} V heater, as a fraction in its lowest terms.`,
    answer,
    mode: 'fraction',
    must: [
      { value: ratio(V1, V2), trap: 'forgot to square the p.d. ratio' },
      { value: ratio(V2 * V2, V1 * V1), trap: 'inverted the ratio' },
    ],
    extra: [
      { value: ratio(V2, V1), trap: 'inverted the ratio and forgot to square it' },
      { value: E(1), trap: 'assumed equal power ratings mean equal resistances' },
      { value: ratio(V1 * V1 * V1, V2 * V2 * V2), trap: 'cubed the p.d. ratio' },
      { value: ratio(2 * V1, V2), trap: 'arithmetic slip in the ratio' },
    ],
    solution: `$R = \\dfrac{V^2}{P}$ with $P$ the same for both, so $\\dfrac{R_1}{R_2} = \\dfrac{V_1^2}{V_2^2} = \\dfrac{${V1 * V1}}{${V2 * V2}} = ${answer.toLatex()}$.`,
    trap: 'R = V²/P: the p.d. ratio must be squared, and a higher rated p.d. means a larger resistance for the same power.',
    tags: ['power', 'resistance', 'ratio'],
    params: { variant: 'resistance-ratio-volt', V1, V2, P1: P, P2: P },
  });
}

function seriesPowerQ(rng: RNG): Generated | null {
  const R1 = rng.pick([2, 3, 4, 5, 6, 8, 10, 12, 15, 20]);
  const R2 = rng.pick([2, 3, 4, 5, 6, 8, 10, 12, 15, 20]);
  const I = rng.pick([0.5, 1.5, 2, 2.5, 3, 4, 5]);
  if (R1 === R2) return null;
  const V = r(I * (R1 + R2));
  const P1 = r(I * I * R1);
  if (!Number.isInteger(V) || V < 6 || V > 240 || !Number.isInteger(P1) || P1 < 2 || P1 > 2000) return null;
  const answer = val(P1);
  if (!answer) return null;
  return pack(rng, {
    stem: `${anRes(R1, true)} and ${anRes(R2)} are connected in series across ${supply(V)}. Find the power dissipated in the ${R1} Ω resistor.`,
    answer,
    unit: U_W,
    must: [
      { value: val((V * V) / R1), trap: 'used the whole supply p.d. across the resistor instead of its share of it' },
      { value: val(V * I), trap: 'gave the total power dissipated in the circuit' },
    ],
    extra: [
      { value: val(I * I * R2), trap: 'found the power in the other resistor' },
      { value: val(I * R1), trap: 'that is the p.d. across the resistor, in volts' },
      { value: val(V / (R1 + R2)), trap: 'gave the current, not the power' },
      { value: val(2 * P1), trap: 'doubled the power' },
    ],
    solution: `Series: $R = ${R1} + ${R2} = ${R1 + R2}\\ \\Omega$, so $I = \\dfrac{${n(V)}}{${R1 + R2}} = ${n(I)}\\ \\text{A}$ and $P = I^2R_1 = ${n(I * I)} \\times ${R1} = ${n(P1)}\\ \\text{W}$.`,
    trap: 'Only part of the supply p.d. is across each resistor; use the common current with P = I²R.',
    tags: ['power', 'series', 'circuits'],
    params: { variant: 'series-power', R1, R2, V },
  });
}

// --------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'phy.electricity.ohm-power',
  module: 'PHY',
  topic: 'electricity',
  title: 'V = IR and electrical power',
  levels: {
    1: 'V = IR, I = V/R, R = V/I and P = VI with clean numbers',
    2: 'P = I²R and P = V²/R, with the power a whole number of watts',
    3: 'E = Pt in J or kJ (kW and minutes to convert); the current an appliance draws from a 12 V, 24 V or 240 V supply',
    4: 'resistance from a rating (60 W, 240 V → 960 Ω); I = √(P/R); heat produced in a resistor in t seconds',
    5: 'P ∝ V² when the supply p.d. changes; the ratio of two lamps’ resistances from their ratings; the power in one resistor of a series pair',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return pickVariant(rng, [ohmVQ, ohmIQ, ohmRQ, powerVIQ]);
        case 2: return pickVariant(rng, [powerI2RQ, powerV2RQ]);
        case 3: return pickVariant(rng, [energyPtQ, currentFromRatingQ]);
        case 4: return pickVariant(rng, [bulbResistanceQ, heatInResistorQ, currentFromPRQ]);
        default: return pickVariant(rng, [voltageScaledQ, resistanceRatioQ, seriesPowerQ]);
      }
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const p = q.params as Record<string, number> & { variant: string; inKJ?: boolean };
    const got = q.answer.value.toNumber();
    const close = (x: number) => Math.abs(got - x) < 1e-9 * Math.max(1, Math.abs(x));
    switch (p.variant) {
      case 'ohm-v': {
        // the p.d. found must return the given resistance, and the two power formulas must agree
        const R = got / p.I;
        return Math.abs(R - p.R) < 1e-9 && Math.abs(got * p.I - p.I * p.I * p.R) < 1e-9;
      }
      case 'ohm-i': {
        // substitute back: this current through R must produce the stated supply p.d.
        const V = p.I * p.R;
        return Math.abs(got * p.R - V) < 1e-9 && Math.abs(got * got * p.R - V * got) < 1e-9;
      }
      case 'ohm-r': {
        // the resistance found must dissipate the same power as P = VI
        const V = p.I * p.R;
        return Math.abs(p.I * p.I * got - V * p.I) < 1e-9 && close(p.R);
      }
      case 'power-vi': {
        // energy route: in 5 s a charge of 5I coulombs passes through a p.d. of V volts
        const t = 5;
        const Q = p.I * t;
        return close((Q * p.V) / t);
      }
      case 'power-i2r': {
        // build the p.d. by adding R volts for each ampere, then use P = V²/R
        let V = 0;
        for (let i = 0; i < Math.round(p.I * 2); i++) V += p.R / 2;
        return close((V * V) / p.R);
      }
      case 'power-v2r': {
        // current first, then P = VI
        const I = p.V / p.R;
        return close(p.V * I);
      }
      case 'energy-pt': {
        // accumulate P joules for each second
        let E = 0;
        for (let i = 0; i < p.t; i++) E += p.P;
        return close(p.inKJ ? E / 1000 : E);
      }
      case 'current-from-rating':
        // substitute back: this current through the supply p.d. must give the rated power
        return Math.abs(got * p.V - p.P) < 1e-9;
      case 'bulb-resistance': {
        // current from the rating, then R = V/I (the generator used V²/P)
        const I = p.P / p.V;
        return close(p.V / I) && Math.abs(got * I * I - p.P) < 1e-9;
      }
      case 'heat-in-resistor': {
        // p.d. across the resistor first, then E = V²t/R
        const V = p.I * p.R;
        const E = ((V * V) / p.R) * p.t;
        return close(p.inKJ ? E / 1000 : E);
      }
      case 'current-from-pr': {
        // substitute back: I²R must be the stated power, and VI must agree
        const V = got * p.R;
        return Math.abs(got * got * p.R - p.P) < 1e-9 && Math.abs(V * got - p.P) < 1e-9;
      }
      case 'voltage-scaled': {
        // find the resistance from the first pair, then use it with the second p.d.
        const R = (p.V1 * p.V1) / p.P1;
        return close((p.V2 * p.V2) / R);
      }
      case 'resistance-ratio-power':
      case 'resistance-ratio-volt': {
        // compute each resistance from its own rating, then divide
        const R1 = (p.V1 * p.V1) / p.P1;
        const R2 = (p.V2 * p.V2) / p.P2;
        return close(R1 / R2);
      }
      case 'series-power': {
        // potential-divider route: the p.d. across R1, then P = V1²/R1
        const V1 = (p.V * p.R1) / (p.R1 + p.R2);
        return close((V1 * V1) / p.R1);
      }
      default:
        return false;
    }
  },
});
