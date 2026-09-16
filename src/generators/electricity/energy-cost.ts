import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, Exact, frac, ratToDecimalString, type NumberFormat } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import type { RNG } from '../../core/rng';

/**
 * Charge, electrical energy and the cost of electricity.
 * Level 1: Q = It (and its rearrangements) in coulombs and seconds
 * Level 2: the energy an appliance uses in kWh, and its cost at p per kWh
 * Level 3: kWh ↔ J (1 kWh = 3.6 × 10⁶ J); the energy a charge gains through a p.d., E = QV
 * Level 4: the monthly bill for two appliances; how long a battery of a given capacity in A h lasts
 * Level 5: efficiency and cost together (the electrical energy a motor needs, and what it costs), and the
 *          ratio of the running costs of two appliances
 *
 * Energies in joules carry their unit (J, kJ, MJ) and use standard form when large; energies in kWh, times in
 * hours and money in pence or pounds are bare numbers, with the unit given in the stem. The named mistakes are
 * the unit slips the exam actually tests: kW × minutes, W read as kW, 1 kWh = 3600 J, A h read as A per hour,
 * pence read as pounds.
 */

const U_C = '\\text{C}', U_S = '\\text{s}', U_A = '\\text{A}', U_J = '\\text{J}', U_KJ = '\\text{kJ}';
const KWH_J = 3.6e6;

type Mode = 'decimal' | 'fraction' | 'sf';
type Candidate = { value: Exact | null; trap: string };

/** Plain number for a stem: 240, 0.5, 2.88. */
const n = (x: number): string => (Number.isInteger(x) ? `${x}` : `${Number(x.toPrecision(10))}`);
/** Round away floating-point noise. */
const r = (x: number): number => Number(x.toPrecision(12));

/** Exact value of a computed quantity, or null if it is not an exam-clean number. */
function val(x: number): Exact | null {
  if (!Number.isFinite(x)) return null;
  const y = r(x);
  if (!Number.isInteger(r(y * 1000))) return null;
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

type Money = 'p' | '£';

/**
 * A value an examiner would print as a sum of money. In pence that means a whole number of pence
 * (a half-penny is tolerated), except below 1, which is the honest "£0.75 for 75 p" unit slip; in
 * pounds it means a whole number of pence. It keeps the efficiency-squared trap values 9.375 and
 * 46.08 — four significant figures of pence — out of the option list.
 */
function moneyOk(x: number, unit: Money): boolean {
  if (!Number.isInteger(r(x * 100))) return false;
  if (unit === '£') return true;
  return x < 1 || Number.isInteger(r(x * 10));
}

/** Exact fraction a/b in its lowest terms, or null if it is not an exam-clean ratio. */
function ratio(a: number, b: number): Exact | null {
  if (!Number.isInteger(a) || !Number.isInteger(b) || b === 0) return null;
  try {
    const v = frac(a, b);
    if (!isCleanExact(v).ok) return null;
    return v.toRat().d <= 24n ? v : null;
  } catch {
    return null;
  }
}

/**
 * Positive, finite, clean option values. The window is wide because the mistakes this topic tests are unit
 * slips: a factor of 60, 1000 or 3600 out is exactly the distractor wanted.
 */
function cleanOnly(ds: Candidate[], mode: Mode, answer: Exact, money: Money | null): Distractor[] {
  const a = answer.toNumber();
  return ds.filter((d): d is { value: Exact; trap: string } => {
    const v = d.value;
    if (!v || !Number.isFinite(v.toNumber()) || v.sign() <= 0 || !v.isRational() || !isCleanExact(v).ok) return false;
    const x = v.toNumber();
    if (x < 1e-4 || x > 1e10 || x > 1e4 * a || x < a / 1e4) return false;
    if (money && !moneyOk(x, money)) return false;
    const d2 = v.toRat().d;
    if (mode === 'fraction') return d2 <= 24n;
    if (!readable(v)) return false;
    return d2 <= 24n || Number.isInteger(r(x * 1000));
  });
}

/**
 * Every `must` trap gets a slot before any `extra` one, so the headline mistakes are never shuffled
 * out; `spare` near-misses are taken last, only when the named mistakes ran short.
 */
function ranked(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], spare: Distractor[], count = 4): Distractor[] {
  const seen: Exact[] = [answer];
  const out: Distractor[] = [];
  const take = (d: Distractor) => {
    if (out.length >= count || seen.some((s) => s.equals(d.value))) return;
    seen.push(d.value);
    out.push(d);
  };
  must.forEach(take);
  rng.shuffle(extra).forEach(take);
  rng.shuffle(spare).forEach(take);
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
  /** generic near-misses, used only if the named mistakes ran short */
  spare?: Candidate[];
  /** the answer is a sum of money: every option must be printable in that unit */
  money?: Money;
  solution: string;
  trap: string;
  tags: string[];
  params: Record<string, unknown>;
}

function pack(rng: RNG, p: Pack): Generated | null {
  const mode: Mode = p.mode ?? 'decimal';
  if (!isCleanExact(p.answer).ok || p.answer.sign() <= 0) return null;
  if (mode !== 'fraction' && !readable(p.answer)) return null;
  const format: NumberFormat = mode === 'fraction' ? 'fraction' : mode === 'sf' ? 'sf' : 'decimal';
  const money = p.money ?? null;
  if (money && !moneyOk(p.answer.toNumber(), money)) return null;
  const ds = ranked(
    rng,
    p.answer,
    cleanOnly(p.must, mode, p.answer, money),
    cleanOnly(p.extra, mode, p.answer, money),
    cleanOnly(p.spare ?? [], mode, p.answer, money),
  );
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

const mins = (t: number): string => `${n(t)} minute${t === 1 ? '' : 's'}`;
const hrs = (h: number): string => `${n(h)} hour${h === 1 ? '' : 's'}`;
/** "A kettle" / "An oven". */
const withArticle = (name: string, capital = true): string => `${/^[aeiou]/i.test(name) ? (capital ? 'An' : 'an') : capital ? 'A' : 'a'} ${name}`;

// --------------------------------------------------------------------------- level 1

/** A current and a time whose product is a clean charge. */
function currentAndTime(rng: RNG): { I: number; t: number; tStated: number; inMin: boolean; tText: string; Q: number } | null {
  const I = rng.pick([0.2, 0.5, 1.5, 2, 3, 4, 5, 6, 10]);
  const inMin = rng.bool(0.5);
  const tStated = inMin ? rng.pick([1, 2, 3, 5, 10]) : rng.pick([10, 20, 30, 60, 90]);
  const t = inMin ? tStated * 60 : tStated;
  const Q = r(I * t);
  if (!Number.isInteger(Q) || Q < 4 || Q > 6000) return null;
  return { I, t, tStated, inMin, tText: inMin ? mins(tStated) : `${tStated} s`, Q };
}

function chargeQ(rng: RNG): Generated | null {
  const c = currentAndTime(rng);
  if (!c) return null;
  const { I, t, tStated, inMin, tText, Q } = c;
  const answer = val(Q);
  if (!answer) return null;
  return pack(rng, {
    stem: `A steady current of ${n(I)} A flows in a wire for ${tText}. Find the charge that passes a point in the wire.`,
    answer,
    unit: U_C,
    must: [
      { value: inMin ? val(I * tStated) : val(I / t), trap: inMin ? 'used the time in minutes instead of seconds' : 'divided instead of multiplying: Q = It' },
      { value: val(t / I), trap: 'divided the time by the current' },
    ],
    extra: [
      { value: val(I + t), trap: 'added the current and the time' },
      { value: inMin ? val(Q * 60) : null, trap: 'multiplied by 60 once too often' },
      { value: inMin ? null : val(Q / 60), trap: 'converted the time to minutes when it was already in seconds' },
      { value: val(t), trap: 'quoted the time in seconds as the charge' },
    ],
    spare: [
      { value: val(2 * Q), trap: 'doubled the charge' },
      { value: val(Q / 2), trap: 'halved the charge' },
    ],
    solution: `$Q = It = ${n(I)} \\times ${t} = ${n(Q)}\\ \\text{C}$${inMin ? ` (${tText} $= ${t}$ s)` : ''}.`,
    trap: 'Q = It works in coulombs, amps and seconds: convert minutes to seconds first.',
    tags: ['charge', 'current', 'time'],
    params: { variant: 'charge', I, t, Q },
  });
}

function currentFromChargeQ(rng: RNG): Generated | null {
  const c = currentAndTime(rng);
  if (!c) return null;
  const { I, t, tStated, inMin, tText, Q } = c;
  const answer = val(I);
  if (!answer) return null;
  return pack(rng, {
    stem: `A charge of ${n(Q)} C passes a point in a circuit in ${tText}. Find the current.`,
    answer,
    unit: U_A,
    must: [
      { value: val(Q * t), trap: 'multiplied instead of dividing: I = Q/t' },
      { value: inMin ? val(Q / tStated) : val(t / Q), trap: inMin ? 'used the time in minutes instead of seconds' : 'inverted the fraction' },
    ],
    extra: [
      { value: val(t / Q), trap: 'inverted the fraction' },
      { value: inMin ? val(I * 60) : null, trap: 'multiplied by 60 once too often' },
      { value: inMin ? null : val(I / 60), trap: 'converted the time to minutes when it was already in seconds' },
      { value: val(Q - t), trap: 'subtracted the time from the charge' },
    ],
    spare: [
      { value: val(2 * I), trap: 'doubled the current' },
      { value: val(I / 2), trap: 'halved the current' },
    ],
    solution: `$I = \\dfrac{Q}{t} = \\dfrac{${n(Q)}}{${t}} = ${n(I)}\\ \\text{A}$${inMin ? ` (${tText} $= ${t}$ s)` : ''}.`,
    trap: 'Current is charge per second: the time must be in seconds.',
    tags: ['charge', 'current', 'time'],
    params: { variant: 'current-from-charge', I, t, Q },
  });
}

function chargeTimeQ(rng: RNG): Generated | null {
  const c = currentAndTime(rng);
  if (!c) return null;
  const { I, t, Q } = c;
  if (t < 20) return null;
  const answer = val(t);
  if (!answer) return null;
  return pack(rng, {
    stem: `A steady current of ${n(I)} A delivers a charge of ${n(Q)} C. Find the time for which the current flows, in seconds.`,
    answer,
    unit: U_S,
    must: [
      { value: val(Q * I), trap: 'multiplied instead of dividing: t = Q/I' },
      { value: val(I / Q), trap: 'inverted the fraction' },
    ],
    extra: [
      { value: val(t / 60), trap: 'gave the time in minutes, not in seconds' },
      { value: val(t * 60), trap: 'multiplied by 60 instead of dividing' },
      { value: val(Q - I), trap: 'subtracted the current from the charge' },
    ],
    spare: [
      { value: val(2 * t), trap: 'doubled the time' },
      { value: val(t / 2), trap: 'halved the time' },
    ],
    solution: `$Q = It$, so $t = \\dfrac{${n(Q)}}{${n(I)}} = ${t}\\ \\text{s}$.`,
    trap: 'Rearranging Q = It gives t = Q/I; multiplying instead is the usual slip.',
    tags: ['charge', 'current', 'time'],
    params: { variant: 'charge-time', I, t, Q },
  });
}

// --------------------------------------------------------------------------- level 2

const APPLIANCES: [string, number][] = [
  ['electric heater', 2], ['immersion heater', 3], ['tumble dryer', 2.5], ['kettle', 3], ['oven', 2], ['washing machine', 1.5], ['dishwasher', 1.2],
];

/** An appliance, a number of hours and the energy it uses in kWh. */
function applianceUse(rng: RNG): { name: string; P: number; h: number; kWh: number } | null {
  const [name, base] = rng.pick(APPLIANCES);
  const P = rng.bool(0.3) ? rng.pick([0.5, 1, 1.5, 2, 2.5, 3]) : base;
  const h = rng.pick([0.5, 1, 1.5, 2, 3, 4, 5, 6]);
  const kWh = r(P * h);
  if (!Number.isInteger(r(kWh * 2)) || kWh < 1 || kWh > 30) return null;
  return { name, P, h, kWh };
}

function kwhQ(rng: RNG): Generated | null {
  const a = applianceUse(rng);
  if (!a) return null;
  const { name, P, h, kWh } = a;
  const answer = val(kWh);
  if (!answer) return null;
  return pack(rng, {
    stem: `${withArticle(name)} of power ${n(P)} kW is used for ${hrs(h)}. Find the energy it transfers, in kWh.`,
    answer,
    must: [
      { value: val(P * 1000 * h), trap: 'used watts instead of kilowatts' },
      { value: val(P * h * 60), trap: 'converted the hours to minutes as well' },
    ],
    extra: [
      { value: val(P / h), trap: 'divided instead of multiplying' },
      { value: val(kWh * 3.6), trap: 'gave the energy in MJ' },
      { value: val(h / P), trap: 'divided the hours by the power' },
      { value: val(P + h), trap: 'added the power and the time instead of multiplying' },
    ],
    spare: [
      { value: val(2 * kWh), trap: 'doubled the energy' },
      { value: val(kWh / 2), trap: 'halved the energy' },
    ],
    solution: `A kilowatt-hour is one kilowatt for one hour, so energy $= ${n(P)} \\times ${n(h)} = ${n(kWh)}$ kWh.`,
    trap: 'kWh = kilowatts × hours: do not convert to watts or to minutes first.',
    tags: ['kwh', 'energy', 'power'],
    params: { variant: 'kwh', P, h },
  });
}

function costQ(rng: RNG): Generated | null {
  const a = applianceUse(rng);
  if (!a) return null;
  const { name, P, h, kWh } = a;
  const rate = rng.pick([10, 12, 15, 20, 24, 25, 30, 40, 50]);
  const pence = r(kWh * rate);
  if (!Number.isInteger(pence) || pence < 20 || pence > 3000) return null;
  const inPence = pence <= 500;
  const money = inPence ? pence : r(pence / 100);
  const answer = val(money);
  if (!answer) return null;
  return pack(rng, {
    stem: `Electricity costs ${rate} p per kWh. ${withArticle(name)} of power ${n(P)} kW is used for ${hrs(h)}. Find the cost, in ${inPence ? 'pence' : '£'}.`,
    answer,
    money: inPence ? 'p' : '£',
    must: [
      { value: val(inPence ? pence / 100 : pence), trap: inPence ? 'gave the cost in £ rather than pence' : 'gave the cost in pence rather than £' },
      { value: val(inPence ? P * rate : (P * rate) / 100), trap: 'forgot the number of hours' },
    ],
    extra: [
      { value: val(kWh), trap: 'gave the energy in kWh, not the cost' },
      { value: val(inPence ? h * rate : (h * rate) / 100), trap: 'forgot the power' },
      { value: val(inPence ? kWh / rate : kWh / rate / 100), trap: 'divided by the price instead of multiplying by it' },
      { value: val(inPence ? rate : rate / 100), trap: 'quoted the price of one kilowatt-hour' },
    ],
    spare: [
      { value: val(2 * money), trap: 'doubled the cost' },
      { value: val(money / 2), trap: 'halved the cost' },
    ],
    solution: `Energy $= ${n(P)} \\times ${n(h)} = ${n(kWh)}$ kWh, so the cost $= ${n(kWh)} \\times ${rate} = ${n(pence)}$ p${inPence ? '' : ` $= £${n(money)}$`}.`,
    trap: 'Cost = (kW × hours) × price per kWh; watch whether the answer is wanted in pence or in pounds.',
    tags: ['cost', 'kwh', 'energy'],
    params: { variant: 'cost', P, h, rate, inPence },
  });
}

// --------------------------------------------------------------------------- level 3

function kwhToJQ(rng: RNG): Generated | null {
  const k = rng.pick([0.5, 1, 1.5, 2, 2.5, 3, 4, 5]);
  const J = r(k * KWH_J);
  const answer = val(J);
  if (!answer) return null;
  return pack(rng, {
    stem: `A household uses ${n(k)} kWh of electrical energy. Given that a power of 1 kW for 1 hour transfers $3.6 \\times 10^{6}$ J, express this energy in joules, giving your answer in standard form.`,
    answer,
    unit: U_J,
    mode: 'sf',
    must: [
      { value: val(k * 3600), trap: 'used 1 kWh = 3600 J (that is one watt-hour)' },
      { value: val(k * 3.6e5), trap: 'slipped a power of ten' },
    ],
    extra: [
      { value: val(k * 3.6e7), trap: 'slipped a power of ten' },
      { value: val(k * 1000), trap: 'converted kilowatt-hours to watt-hours only' },
      { value: val(KWH_J / k), trap: 'divided by the number of kilowatt-hours instead of multiplying' },
      { value: val(k * 3.6), trap: 'gave the energy in MJ, not J' },
    ],
    spare: [
      { value: val(2 * J), trap: 'doubled the energy' },
      { value: val(J / 2), trap: 'halved the energy' },
    ],
    solution: `$${n(k)}\\ \\text{kWh} = ${n(k)} \\times 3.6 \\times 10^{6} = ${answer.toLatex({ format: 'sf' })}\\ \\text{J}$.`,
    trap: '1 kWh = 1000 W × 3600 s = 3.6 × 10⁶ J, not 3600 J.',
    tags: ['kwh', 'joules', 'standard-form'],
    params: { variant: 'kwh-to-j', k },
  });
}

function jToKwhQ(rng: RNG): Generated | null {
  const k = rng.pick([0.5, 1.5, 2, 2.5, 3, 4, 5, 10]);
  const J = r(k * KWH_J);
  const answer = val(k);
  if (!answer) return null;
  const jTex = E(J).toLatex({ format: 'sf' });
  return pack(rng, {
    stem: `An electric motor transfers $${jTex}$ J of energy. Given that 1 kWh $= 3.6 \\times 10^{6}$ J, express this energy in kWh.`,
    answer,
    must: [
      { value: val(J / 3600), trap: 'used 1 kWh = 3600 J (that is one watt-hour)' },
      { value: val(J / 3.6e5), trap: 'slipped a power of ten' },
    ],
    extra: [
      { value: val(J / 3.6e7), trap: 'slipped a power of ten' },
      { value: val(J / 1000), trap: 'divided by 1000 only' },
      { value: val(J / 3.6), trap: 'divided by 3.6 only' },
      { value: val(k * 3.6), trap: 'multiplied by 3.6 instead of dividing' },
    ],
    spare: [
      { value: val(2 * k), trap: 'doubled the energy' },
      { value: val(k / 2), trap: 'halved the energy' },
    ],
    solution: `$\\dfrac{${jTex}}{3.6 \\times 10^{6}} = ${n(k)}$ kWh.`,
    trap: 'Divide by 3.6 × 10⁶, not by 3600: a kilowatt-hour is a thousand watt-hours.',
    tags: ['kwh', 'joules', 'standard-form'],
    params: { variant: 'j-to-kwh', k },
  });
}

function energyQVQ(rng: RNG): Generated | null {
  const V = rng.pick([3, 6, 9, 12, 20, 24, 50]);
  const I = rng.pick([0.5, 1.5, 2, 3, 4, 5]);
  const t = rng.pick([5, 10, 20, 30, 60]);
  const Q = r(I * t);
  const Ej = r(Q * V);
  const P = r(V * I);
  if (!Number.isInteger(Q) || !Number.isInteger(Ej) || Ej < 20 || Ej > 2e5) return null;
  const answer = val(Ej);
  if (!answer) return null;
  return pack(rng, {
    stem: `A charge of ${n(Q)} C passes through a lamp connected to a ${V} V supply in ${t} s. Find the energy transferred to the lamp.`,
    answer,
    unit: U_J,
    must: [
      { value: val(P), trap: 'divided by the time as well: that is the power, in watts' },
      { value: val(Q / V), trap: 'divided instead of multiplying: E = QV' },
    ],
    extra: [
      { value: val(V / Q), trap: 'inverted the fraction' },
      { value: val(Ej * t), trap: 'multiplied by the time as well' },
      { value: val(Q * t), trap: 'multiplied the charge by the time instead of by the p.d.' },
      { value: val(V * t), trap: 'used the time in place of the charge' },
      { value: val(Q + V), trap: 'added the charge and the p.d. instead of multiplying' },
    ],
    spare: [
      { value: val(2 * Ej), trap: 'doubled the energy' },
      { value: val(Ej / 2), trap: 'halved the energy' },
    ],
    solution: `Each coulomb gains ${V} J, so $E = QV = ${n(Q)} \\times ${V} = ${n(Ej)}\\ \\text{J}$.`,
    trap: 'The p.d. is joules per coulomb: multiply by the charge. Dividing by the time gives the power instead.',
    tags: ['energy', 'charge', 'pd'],
    params: { variant: 'energy-qv', V, I, t },
  });
}

// --------------------------------------------------------------------------- level 4

function monthlyCostQ(rng: RNG): Generated | null {
  const P1 = rng.pick([1, 1.5, 2, 2.5, 3]);
  const h1 = rng.pick([1, 2, 3, 4]);
  const P2w = rng.pick([100, 200, 250, 400, 500]);
  const h2 = rng.pick([2, 4, 5, 6, 8, 10]);
  const days = rng.pick([7, 20, 30]);
  const rate = rng.pick([10, 12, 15, 20, 25, 30]);
  const dailyKWh = r(P1 * h1 + (P2w * h2) / 1000);
  const totalKWh = r(dailyKWh * days);
  const pence = r(totalKWh * rate);
  const pounds = r(pence / 100);
  if (!Number.isInteger(r(dailyKWh * 10)) || dailyKWh < 1 || dailyKWh > 20) return null;
  if (!Number.isInteger(r(pounds * 100)) || pounds < 1 || pounds > 200) return null;
  const answer = val(pounds);
  if (!answer) return null;
  return pack(rng, {
    stem: `A household uses a ${n(P1)} kW heater for ${hrs(h1)} each day and a ${P2w} W television for ${hrs(h2)} each day. Electricity costs ${rate} p per kWh. Find the total cost of running these two appliances for ${days} days, in £.`,
    answer,
    money: '£',
    must: [
      { value: val(pence), trap: 'gave the cost in pence rather than £' },
      { value: val((P1 * h1 * days * rate) / 100), trap: 'costed the heater only' },
    ],
    extra: [
      { value: val((dailyKWh * rate) / 100), trap: 'gave the cost for one day' },
      { value: val(totalKWh), trap: 'gave the energy in kWh, not the cost' },
      { value: val(((P1 * h1 + P2w * h2) * days * rate) / 100), trap: `treated the television as a ${P2w} kW appliance` },
      { value: val(((P2w * h2) / 1000) * days * rate / 100), trap: 'costed the television only' },
    ],
    spare: [
      { value: val(2 * pounds), trap: 'doubled the cost' },
      { value: val(pounds / 2), trap: 'halved the cost' },
    ],
    solution: `Each day: $${n(P1)} \\times ${n(h1)} + ${n(P2w / 1000)} \\times ${n(h2)} = ${n(dailyKWh)}$ kWh. Over ${days} days that is $${n(totalKWh)}$ kWh, costing $${n(totalKWh)} \\times ${rate} = ${n(pence)}$ p $= £${n(pounds)}$.`,
    trap: 'Turn the watts into kilowatts before adding, and divide the pence by 100 at the end.',
    tags: ['cost', 'kwh', 'appliances'],
    params: { variant: 'monthly-cost', P1, h1, P2w, h2, days, rate },
  });
}

function batteryLifeQ(rng: RNG): Generated | null {
  const milli = rng.bool(0.5);
  const life = rng.pick([2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20]);
  const I = milli ? rng.pick([100, 125, 200, 250, 400, 500]) : rng.pick([0.5, 1.5, 2, 2.5, 3, 4, 5]);
  const C = r(I * life);
  if (milli && (C > 6000 || !Number.isInteger(C))) return null;
  if (!milli && (C > 120 || !Number.isInteger(C))) return null;
  const answer = val(life);
  if (!answer) return null;
  const unit = milli ? 'mA h' : 'A h';
  const device = milli ? rng.pick(['A phone battery', 'A torch battery']) : rng.pick(['A car battery', 'A leisure battery']);
  return pack(rng, {
    stem: `${device} is rated ${n(C)} ${unit}. It supplies a steady current of ${n(I)} ${milli ? 'mA' : 'A'}. Find how long it can supply this current, in hours.`,
    answer,
    must: [
      { value: val(C * I), trap: 'multiplied instead of dividing' },
      { value: val(I / C), trap: 'read the rating as amps per hour and divided the wrong way round' },
    ],
    extra: [
      { value: val(life * 60), trap: 'gave the time in minutes' },
      { value: val(life / 60), trap: 'divided by 60 as well' },
      { value: milli ? val(C / (I / 1000)) : val(C / (I * 1000)), trap: 'mixed milliamps with amps' },
      { value: val(2 * life), trap: 'doubled the time' },
    ],
    solution: `An ${unit} rating is a current multiplied by a time, so $t = \\dfrac{${n(C)}}{${n(I)}} = ${n(life)}$ hours.`,
    trap: 'A h is amps × hours (a charge), so divide by the current; it is not amps per hour.',
    tags: ['charge', 'battery', 'capacity'],
    params: { variant: 'battery-life', C, I, milli },
  });
}

// --------------------------------------------------------------------------- level 5

function efficiencyCostQ(rng: RNG): Generated | null {
  const e = rng.pick([80, 75, 60, 50, 40, 90, 25]);
  const k = rng.pick([1, 2, 3, 4, 5]);
  const rate = rng.pick([10, 12, 15, 20, 24, 25, 30]);
  const usefulMJ = r((3.6 * k * e) / 100);
  const pence = r(k * rate);
  if (!Number.isInteger(r(usefulMJ * 100)) || pence > 300) return null;
  const answer = val(pence);
  if (!answer) return null;
  return pack(rng, {
    stem: `An electric motor is ${e}% efficient. It does ${n(usefulMJ)} MJ of useful work. Electricity costs ${rate} p per kWh and 1 kWh $= 3.6 \\times 10^{6}$ J. Find the cost of the electrical energy the motor uses, in pence.`,
    answer,
    must: [
      { value: val((usefulMJ / 3.6) * rate), trap: 'costed the useful output instead of the electrical energy supplied' },
      { value: val(((k * e) / 100) * ((e / 100) * rate)), trap: 'multiplied by the efficiency instead of dividing' },
    ],
    extra: [
      { value: val(k * 1000 * rate), trap: 'used 1 kWh = 3600 J' },
      { value: val(pence / 100), trap: 'gave the cost in £ rather than pence' },
      { value: val(k), trap: 'gave the electrical energy in kWh, not the cost' },
      { value: val(2 * pence), trap: 'doubled the cost' },
    ],
    solution: `Electrical energy $= \\dfrac{${n(usefulMJ)}}{${n(e / 100)}} = ${n(3.6 * k)}$ MJ $= ${n(k)}$ kWh, so the cost $= ${n(k)} \\times ${rate} = ${n(pence)}$ p.`,
    trap: 'Divide the useful energy by the efficiency to get the electrical energy in, then convert 3.6 MJ to 1 kWh.',
    tags: ['efficiency', 'cost', 'kwh'],
    params: { variant: 'efficiency-cost', e, k, rate, usefulMJ },
  });
}

function liftMotorEnergyQ(rng: RNG): Generated | null {
  const e = rng.pick([80, 75, 60, 50, 40, 25]);
  const m = rng.pick([200, 300, 400, 500, 600, 800, 1000, 1200]);
  const h = rng.pick([4, 5, 6, 8, 10, 12, 15, 20]);
  const usefulJ = m * 10 * h;
  const inputJ = r((usefulJ * 100) / e);
  const usefulKJ = r(usefulJ / 1000);
  const inputKJ = r(inputJ / 1000);
  if (!Number.isInteger(usefulKJ) || !Number.isInteger(inputKJ) || inputKJ > 600) return null;
  const answer = val(inputKJ);
  if (!answer) return null;
  return pack(rng, {
    stem: `A motor that is ${e}% efficient raises a load of mass ${m} kg through a height of ${h} m at a steady speed. Take $g = 10\\ \\text{m s}^{-2}$. Find the electrical energy supplied to the motor, in kJ.`,
    answer,
    unit: U_KJ,
    must: [
      { value: val(usefulKJ), trap: 'gave the useful energy, not the electrical energy supplied' },
      { value: val((usefulKJ * e) / 100), trap: 'multiplied by the efficiency instead of dividing' },
    ],
    extra: [
      { value: val(inputKJ - usefulKJ), trap: 'gave the energy wasted' },
      { value: val(inputJ), trap: 'gave the answer in J, not kJ' },
      { value: val(m * h), trap: 'forgot the factor of g' },
      { value: val(2 * inputKJ), trap: 'doubled the energy' },
    ],
    solution: `Useful energy $= mgh = ${m} \\times 10 \\times ${h} = ${n(usefulJ)}\\ \\text{J} = ${n(usefulKJ)}$ kJ, so the electrical energy $= \\dfrac{${n(usefulKJ)}}{${n(e / 100)}} = ${n(inputKJ)}\\ \\text{kJ}$.`,
    trap: 'Efficiency = useful ÷ supplied, so the supplied energy is the larger number: divide, do not multiply.',
    tags: ['efficiency', 'energy', 'motor'],
    params: { variant: 'lift-energy', e, m, h },
  });
}

function costRatioQ(rng: RNG): Generated | null {
  const P1 = rng.pick([1, 1.5, 2, 2.5, 3]);
  const h1 = rng.pick([1, 2, 3, 4, 5, 6]);
  const P2w = rng.pick([100, 200, 250, 400, 500, 750]);
  const h2 = rng.pick([2, 3, 4, 5, 6, 8, 10]);
  const e1 = r(P1 * h1);
  const e2 = r((P2w * h2) / 1000);
  if (!Number.isInteger(r(e1 * 10)) || !Number.isInteger(r(e2 * 10)) || e2 < 0.5) return null;
  const answer = ratio(Math.round(e1 * 10), Math.round(e2 * 10));
  if (!answer || answer.equals(E(1))) return null;
  const q = answer.toRat();
  if (q.n > 12n || q.d > 12n) return null; // keep the ratio one an examiner would print
  return pack(rng, {
    stem: `A ${n(P1)} kW heater is used for ${hrs(h1)} each day. A ${P2w} W lamp is used for ${hrs(h2)} each day. Both are charged at the same price per kWh. Find the ratio of the daily cost of the heater to the daily cost of the lamp, as a fraction in its lowest terms.`,
    answer,
    mode: 'fraction',
    must: [
      { value: ratio(Math.round(e2 * 10), Math.round(e1 * 10)), trap: 'inverted the ratio' },
      { value: ratio(Math.round(P1 * 1000), P2w), trap: 'compared the powers and ignored the times' },
    ],
    extra: [
      { value: ratio(h1, h2), trap: 'compared the times and ignored the powers' },
      { value: ratio(h2, h1), trap: 'compared the times, inverted' },
      { value: ratio(P2w, Math.round(P1 * 1000)), trap: 'compared the powers, inverted' },
      { value: E(1), trap: 'assumed the same price per kWh means the same cost' },
    ],
    solution: `Daily energies: heater $${n(P1)} \\times ${n(h1)} = ${n(e1)}$ kWh, lamp $${n(P2w / 1000)} \\times ${n(h2)} = ${n(e2)}$ kWh. The costs are in the same ratio: $${n(e1)} : ${n(e2)} = ${answer.toLatex()}$.`,
    trap: 'Cost follows the energy (kW × hours), not the power alone: the small lamp can cost more if it runs longer.',
    tags: ['cost', 'ratio', 'kwh'],
    params: { variant: 'cost-ratio', P1, h1, P2w, h2 },
  });
}

// --------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'phy.electricity.energy-cost',
  module: 'PHY',
  topic: 'electricity',
  title: 'Charge, energy and the cost of electricity',
  levels: {
    1: 'Q = It and its rearrangements, in coulombs, amps and seconds (minutes to convert)',
    2: 'the energy an appliance uses in kWh (2 kW for 3 h = 6 kWh) and its cost at p per kWh',
    3: 'kWh ↔ J with 1 kWh = 3.6 × 10⁶ J; the energy transferred by a charge through a p.d., E = QV',
    4: 'the bill for two appliances over several days; how long a battery of a given A h capacity lasts',
    5: 'efficiency and cost together (electrical energy in, and what it costs); the ratio of two running costs',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return pickVariant(rng, [chargeQ, chargeQ, currentFromChargeQ, chargeTimeQ]);
        case 2: return pickVariant(rng, [kwhQ, costQ, costQ]);
        case 3: return pickVariant(rng, [kwhToJQ, jToKwhQ, energyQVQ]);
        case 4: return pickVariant(rng, [monthlyCostQ, batteryLifeQ]);
        default: return pickVariant(rng, [efficiencyCostQ, liftMotorEnergyQ, costRatioQ]);
      }
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const p = q.params as Record<string, number> & { variant: string; inPence?: boolean; milli?: boolean };
    const got = q.answer.value.toNumber();
    const close = (x: number) => Math.abs(got - x) < 1e-9 * Math.max(1, Math.abs(x));
    switch (p.variant) {
      case 'charge': {
        // accumulate I coulombs for each second, and check the stem's own figure agrees
        let Q = 0;
        for (let i = 0; i < p.t; i++) Q += p.I;
        return close(Q) && Math.abs(Q - p.Q) < 1e-9 * Math.max(1, p.Q);
      }
      case 'current-from-charge': {
        // accumulate this current for each second of the stated time and compare with the charge
        // printed in the stem (a mis-printed Q is then caught too)
        let Q = 0;
        for (let i = 0; i < p.t; i++) Q += got;
        return Math.abs(Q - p.Q) < 1e-9 * Math.max(1, p.Q);
      }
      case 'charge-time': {
        // accumulate the stated current for each second of the answer and compare with the printed charge
        if (!Number.isInteger(got) || got <= 0 || got > 1e5) return false;
        let Q = 0;
        for (let i = 0; i < got; i++) Q += p.I;
        return Math.abs(Q - p.Q) < 1e-9 * Math.max(1, p.Q);
      }
      case 'kwh': {
        // SI route: watts × seconds, then back to kWh
        const joules = p.P * 1000 * (p.h * 3600);
        return close(joules / KWH_J);
      }
      case 'cost': {
        // SI route: J → kWh → pence
        const joules = p.P * 1000 * (p.h * 3600);
        const pence = (joules / KWH_J) * p.rate;
        return close(p.inPence ? pence : pence / 100);
      }
      case 'kwh-to-j':
        // 1 kW for 1 h is 1000 J every second for 3600 seconds
        return close(p.k * 1000 * 3600);
      case 'j-to-kwh':
        // substitute back: the answer in kWh must be the stated number of joules
        return Math.abs(got * 1000 * 3600 - p.k * KWH_J) < 1e-6;
      case 'energy-qv': {
        // power route: E = VIt instead of QV
        return close(p.V * p.I * p.t);
      }
      case 'monthly-cost': {
        // SI route: total joules over the period, then kWh and pence
        const joules = (p.P1 * 1000 * p.h1 * 3600 + p.P2w * p.h2 * 3600) * p.days;
        const pence = (joules / KWH_J) * p.rate;
        return close(pence / 100);
      }
      case 'battery-life': {
        // charge route: the capacity in coulombs divided by the current in amps gives seconds
        const coulombs = (p.milli ? p.C / 1000 : p.C) * 3600;
        const amps = p.milli ? p.I / 1000 : p.I;
        return close(coulombs / amps / 3600);
      }
      case 'efficiency-cost': {
        // SI route: useful joules → input joules → kWh → pence
        const usefulJ = p.usefulMJ * 1e6;
        const inputJ = (usefulJ * 100) / p.e;
        return close((inputJ / KWH_J) * p.rate);
      }
      case 'lift-energy': {
        // substitute back: the efficiency of the answer must be the useful energy mgh
        const usefulJ = p.m * 10 * p.h;
        return Math.abs((got * 1000 * p.e) / 100 - usefulJ) < 1e-6;
      }
      case 'cost-ratio': {
        // SI route: joules per day for each appliance
        const j1 = p.P1 * 1000 * p.h1 * 3600;
        const j2 = p.P2w * p.h2 * 3600;
        return close(j1 / j2);
      }
      default:
        return false;
    }
  },
});
