import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, Exact, frac, ratToDecimalString, type NumberFormat } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import type { RNG } from '../../core/rng';

/**
 * V = IR and the three power formulas (P = VI = I²R = V²/R), plus E = Pt.
 * Level 1: V = IR, I = V/R, R = V/I and P = VI with clean numbers
 * Level 2: P = I²R and P = V²/R (values chosen so the power is a whole number of watts)
 * Level 3: E = Pt in J or kJ (the time is always in minutes, so a conversion is always needed), either
 *          from a stated power or from V and I; the current an appliance draws from a 12/24/240 V supply
 * Level 4: the resistance of a lamp from its rating (60 W, 240 V → 960 Ω); I = √(P/R); heat in a resistor in t s
 * Level 5: ratios — P ∝ V² when the supply p.d. changes, R ∝ V²/P for two lamps (answer a fraction),
 *          and the power dissipated in one resistor of a series pair
 *
 * Answers carry their unit (V, A, W, Ω, J, kJ); the resistance ratios are bare fractions. Because
 * `buildOptions` appends the answer's unit to every option, a "J vs kJ" or "W vs kW" slip cannot be
 * expressed here at all — such a candidate would print as "96000 kJ", which is not what the mistake
 * produces — so those candidates are not offered; the unit traps live in which-statements, where each
 * statement carries its own unit.
 *
 * Every wrong option is the value a named mistake produces: a formula confused with another
 * (P = VI², R = V × I, P = V/R), a quantity read off the stem in place of the one asked for, a factor
 * left out, or a conversion done the wrong way. Distractors are never built by adding or subtracting
 * quantities of different dimensions — nobody subtracts amperes from volts, and "58.5 Ω" is not a
 * number the exam would print. The ×2 / ÷2 / ×10 near-misses in `spare` are a genuine last resort:
 * at most one may appear in any option list, and parameters that cannot supply four distinct clean
 * values are redrawn rather than padded.
 */

const U_V = '\\text{V}', U_A = '\\text{A}', U_W = '\\text{W}', U_OHM = '\\text{Ω}', U_J = '\\text{J}', U_KJ = '\\text{kJ}';

type Mode = 'decimal' | 'fraction';
/**
 * `wide` marks the one family of candidates allowed outside the ±100× option window: the rating
 * question's R = V/P and I = P/V slips, which are a factor of V² and V away from V²/P but are
 * exactly the two numbers a candidate writes down when they pick the wrong combination.
 */
type Candidate = { value: Exact | null; trap: string; wide?: boolean };

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
const Supply = (v: number): string => supply(v).charAt(0).toUpperCase() + supply(v).slice(1);

/**
 * Supply p.d.s a candidate recognises. Where the stem quotes a supply that the generator derived
 * (V = I × R_total) the value is only printed when it lands on one of these: "a 46 V supply" reads
 * as a typo, and the exam uses supplies you would find on a bench or a battery.
 */
const STANDARD_SUPPLIES = new Set([6, 9, 12, 15, 18, 20, 24, 30, 36, 40, 48, 50, 60, 80, 90, 100, 120, 150, 180, 200, 240]);

// --------------------------------------------------------------------------- plausible devices

interface Device { subject: string; noun: string }
const dev = (subject: string, noun: string): Device => ({ subject, noun });
const COMPONENT = dev('A component', 'component');

/** An appliance whose power rating reads naturally, for a stem that quotes no supply p.d. */
function deviceForPower(rng: RNG, P: number): Device {
  if (P >= 1500) return rng.pick([dev('An electric kettle', 'kettle'), dev('An immersion heater', 'heater'), dev('An electric heater', 'heater')]);
  if (P >= 600) return rng.pick([dev('A toaster', 'toaster'), dev('A microwave oven', 'oven'), dev('A hairdryer', 'hairdryer')]);
  if (P >= 150) return rng.pick([dev('A desktop computer', 'computer'), dev('A television', 'television'), dev('A food mixer', 'mixer')]);
  if (P >= 20) return rng.pick([dev('A television', 'television'), dev('A filament lamp', 'lamp'), dev('A laptop charger', 'charger')]);
  return rng.pick([dev('A filament lamp', 'lamp'), dev('A radio', 'radio')]);
}

/**
 * A device name that suits the supply p.d. as well as the power. The exam would not print a 480 W desk
 * lamp, nor a heater drawing 10 A from a 9 V supply: when the pair (V, P) fits no appliance the stem
 * just says "a component". Below 12 V only a torch-sized load (≤ 12 W, ≤ 1.5 A) keeps a name.
 */
function deviceFor(rng: RNG, V: number, P: number): Device {
  if (V >= 100) return deviceForPower(rng, P);
  if (V < 12) return P <= 12 && P / V <= 1.5 ? rng.pick([dev('A torch lamp', 'lamp'), dev('A small electric motor', 'motor')]) : COMPONENT;
  if (P > 250) return COMPONENT;
  if (P <= 60) return rng.pick([dev('A filament lamp', 'lamp'), dev('A cooling fan', 'fan'), dev('A small electric motor', 'motor')]);
  return dev('An electric motor', 'motor');
}

// --------------------------------------------------------------------------- option plumbing

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

/**
 * At most three significant digits once printed. Four digits is one too many: 23.04 W, 187.5 Ω and
 * 129.6 J are not numbers an examiner sets against a clean answer, and a candidate cannot compare
 * them at a glance. Parameters whose traps only produce such values are redrawn.
 */
function readable(v: Exact): boolean {
  const dec = ratToDecimalString(v.toRat());
  if (dec === null) return true; // shown as a fraction; the denominator check covers it
  const digits = dec.replace('-', '').replace('.', '').replace(/^0+/, '').replace(/0+$/, '');
  return digits.length <= 3;
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
 * Positive, finite, clean, exam-sized option values. Every option carries the answer's unit, so the
 * window is absolute: anything more than 100 times the answer (or less than a hundredth of it) is
 * dropped, an option no candidate would consider. The limit is 100 rather than 20 because the named
 * "left the time in minutes" slip is exactly a factor of 60; only a `wide` candidate may go further.
 */
function cleanOnly(ds: Candidate[], mode: Mode, answer: Exact): Distractor[] {
  const a = answer.toNumber();
  const out: Distractor[] = [];
  for (const d of ds) {
    const v = d.value;
    if (!v || !Number.isFinite(v.toNumber()) || v.sign() <= 0 || !v.isRational() || !isCleanExact(v).ok) continue;
    const x = v.toNumber();
    if (x < 0.001 || x > 5e6) continue;
    const span = d.wide ? 1e4 : 100;
    if (x > a * span * (1 + 1e-9) || x < (a / span) * (1 - 1e-9)) continue;
    const den = v.toRat().d;
    if (mode === 'fraction') {
      if (den > 24n) continue;
    } else {
      if (!readable(v)) continue;
      if (den > 24n && !Number.isInteger(r(x * 1000))) continue;
    }
    out.push({ value: v, trap: d.trap });
  }
  return out;
}

/**
 * Every `must` trap gets a slot before any `extra` one, so the headline mistakes are never shuffled
 * out. At most one `spare` near-miss (doubled, halved, a decimal place out) may ever be used, and
 * only after every named mistake has been tried: ×2 and ÷2 must never cluster an option list
 * geometrically around the answer. Fewer than four candidates means the parameters are redrawn.
 */
function ranked(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], spare: Distractor[], count = 4, maxSpare = 1): Distractor[] {
  const a = answer.toNumber();
  const seen: Exact[] = [answer];
  const out: Distractor[] = [];
  const take = (d: Distractor): boolean => {
    if (out.length >= count || seen.some((s) => s.equals(d.value))) return false;
    seen.push(d.value);
    out.push(d);
    return true;
  };
  must.forEach(take);
  // Fill the remaining slots towards a randomly drawn number of options *below* the answer. Most slips
  // in an energy question leave a factor out, so without this the answer sits third or fourth of five in
  // almost every instance and both extremes can be discarded unread.
  const below = rng.shuffle(extra.filter((d) => d.value.toNumber() < a));
  const above = rng.shuffle(extra.filter((d) => d.value.toNumber() > a));
  let wantBelow = rng.int(0, count) - out.filter((d) => d.value.toNumber() < a).length;
  while (out.length < count && (below.length > 0 || above.length > 0)) {
    const useBelow = below.length > 0 && (wantBelow > 0 || above.length === 0);
    take((useBelow ? below : above).shift()!);
    if (useBelow) wantBelow--;
  }
  let used = 0;
  for (const d of rng.shuffle(spare)) {
    if (out.length >= count || used >= maxSpare) break;
    if (take(d)) used++;
  }
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
  /** generic near-misses; at most one is ever used, and only if the named mistakes ran short */
  spare?: Candidate[];
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
  const ds = ranked(
    rng,
    p.answer,
    cleanOnly(p.must, mode, p.answer),
    cleanOnly(p.extra, mode, p.answer),
    cleanOnly(p.spare ?? [], mode, p.answer),
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
      { value: val(I * I * R), trap: 'gave the power VI in watts, not the p.d.' },
    ],
    extra: [
      { value: val(I / R), trap: 'inverted the product: divided the current by the resistance' },
      { value: val(R), trap: 'quoted the resistance as the p.d.' },
      { value: val(I * R * R), trap: 'multiplied by the resistance twice' },
      { value: val(I), trap: 'quoted the current as the p.d.' },
    ],
    spare: [
      { value: val(2 * V), trap: 'doubled the p.d.' },
      { value: val(V / 2), trap: 'halved the p.d.' },
      { value: val(10 * V), trap: 'slipped a decimal place' },
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
    stem: `${Supply(V)} is connected across a resistor of resistance ${R} Ω. Find the current in the resistor.`,
    answer,
    unit: U_A,
    must: [
      { value: val(V * R), trap: 'multiplied instead of dividing: I = V/R' },
      { value: val(R / V), trap: 'divided the resistance by the p.d.' },
    ],
    extra: [
      { value: val((V * V) / R), trap: 'gave the power V²/R in watts, not the current' },
      { value: val(V / (R * R)), trap: 'divided by R² instead of R' },
      { value: val(V), trap: 'quoted the supply p.d. as the current' },
      { value: val(R), trap: 'quoted the resistance as the current' },
      { value: val((V / R) * (V / R)), trap: 'squared the current' },
    ],
    spare: [
      { value: val(2 * I), trap: 'doubled the current' },
      { value: val(I / 2), trap: 'halved the current' },
      { value: val(10 * I), trap: 'slipped a decimal place' },
    ],
    solution: `$I = \\dfrac{V}{R} = \\dfrac{${n(V)}}{${R}} = ${n(I)}\\ \\text{A}$.`,
    trap: 'I = V/R: the current is the p.d. divided by the resistance, not their product.',
    tags: ['ohms-law', 'current'],
    params: { variant: 'ohm-i', V, R },
  });
}

function ohmRQ(rng: RNG): Generated | null {
  const I = rng.pick(I_POOL);
  const R = rng.pick(R_POOL);
  const V = r(I * R);
  if (!Number.isInteger(V) || V < 6 || V > 300 || I === R) return null;
  const answer = val(R);
  if (!answer) return null;
  const d = deviceFor(rng, V, r(V * I));
  return pack(rng, {
    stem: `${d.subject} draws a current of ${n(I)} A from ${supply(V)}. Find the resistance of the ${d.noun}.`,
    answer,
    unit: U_OHM,
    must: [
      { value: val(V * I), trap: 'used R = V × I instead of R = V ÷ I' },
      { value: val(I / V), trap: 'inverted the fraction: R = I/V' },
    ],
    extra: [
      { value: val(V / (I * I)), trap: 'divided by I² instead of I (that mixes R = V/I with P = I²R)' },
      { value: val(I * I * V), trap: 'multiplied by the current twice' },
      { value: val(V), trap: 'quoted the supply p.d. as the resistance' },
      { value: val((V * V) / I), trap: 'squared the p.d. as well' },
      { value: val(I), trap: 'quoted the current as the resistance' },
    ],
    spare: [
      { value: val(2 * R), trap: 'doubled the resistance' },
      { value: val(R / 2), trap: 'halved the resistance' },
      { value: val(10 * R), trap: 'slipped a decimal place' },
    ],
    solution: `$R = \\dfrac{V}{I} = \\dfrac{${n(V)}}{${n(I)}} = ${R}\\ \\Omega$.`,
    trap: 'R = V/I. The product V × I is the power in watts, not the resistance.',
    tags: ['ohms-law', 'resistance'],
    params: { variant: 'ohm-r', I, V },
  });
}

function powerVIQ(rng: RNG): Generated | null {
  const V = rng.pick([3, 4, 5, 6, 9, 10, 12, 20, 24, 30, 40, 50, 60, 100, 120, 240]);
  const I = rng.pick([0.2, 0.5, 1.5, 2, 3, 4, 5, 6, 8, 10]);
  const P = r(V * I);
  if (!Number.isInteger(P) || P < 2 || P > 3000 || V === I) return null;
  const answer = val(P);
  if (!answer) return null;
  const d = deviceFor(rng, V, P);
  return pack(rng, {
    stem: `${d.subject} draws a current of ${n(I)} A from ${supply(V)}. Find the power transferred to the ${d.noun}.`,
    answer,
    unit: U_W,
    must: [
      { value: val(V * I * I), trap: 'used P = VI² (the current is squared only in P = I²R)' },
      { value: val(V / I), trap: 'divided instead of multiplying (that is the resistance)' },
    ],
    extra: [
      { value: val(V * V * I), trap: 'squared the p.d. as well' },
      { value: val(V * I * I * I), trap: 'cubed the current' },
      { value: val(V), trap: 'quoted the supply p.d. as the power' },
      { value: val(I), trap: 'quoted the current as the power' },
      { value: val(V / (I * I)), trap: 'divided by the current twice' },
    ],
    spare: [
      { value: val(2 * P), trap: 'doubled the power' },
      { value: val(P / 2), trap: 'halved the power' },
      { value: val(10 * P), trap: 'slipped a decimal place' },
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
      { value: val(2 * I * R), trap: 'doubled the current instead of squaring it' },
      { value: val((I * I) / R), trap: 'divided by R instead of multiplying' },
      { value: val(I * I * R * R), trap: 'squared the resistance as well as the current' },
      { value: val(I * I), trap: 'squared the current but forgot to multiply by the resistance' },
      { value: val(I * R * I * R), trap: 'used V² without dividing by the resistance' },
      { value: val(R), trap: 'quoted the resistance as the power' },
    ],
    spare: [
      { value: val(2 * P), trap: 'doubled the power' },
      { value: val(P / 2), trap: 'halved the power' },
      { value: val(10 * P), trap: 'slipped a decimal place' },
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
    stem: `${Supply(V)} is connected across a resistor of resistance ${R} Ω. Find the power dissipated in the resistor.`,
    answer,
    unit: U_W,
    must: [
      { value: val(V / R), trap: 'that is the current in the resistor, not the power' },
      { value: val(V * R), trap: 'multiplied instead of dividing' },
    ],
    extra: [
      { value: val(V * V), trap: 'squared the p.d. but forgot to divide by the resistance' },
      { value: val((V * V) / (R * R)), trap: 'squared the resistance as well' },
      { value: val((2 * V) / R), trap: 'doubled the p.d. instead of squaring it' },
      { value: val(V * V * R), trap: 'multiplied by the resistance instead of dividing by it' },
      { value: val(R / V), trap: 'inverted the fraction: divided the resistance by the p.d.' },
      { value: val(R), trap: 'quoted the resistance as the power' },
      { value: val(V), trap: 'quoted the supply p.d. as the power' },
    ],
    spare: [
      { value: val(2 * P), trap: 'doubled the power' },
      { value: val(P / 2), trap: 'halved the power' },
      { value: val(10 * P), trap: 'slipped a decimal place' },
    ],
    solution: `$P = \\dfrac{V^2}{R} = \\dfrac{${V * V}}{${R}} = ${n(P)}\\ \\text{W}$.`,
    trap: 'P = V²/R: square the p.d., not the resistance. V/R alone is the current.',
    tags: ['power', 'v2r'],
    params: { variant: 'power-v2r', V, R },
  });
}

// --------------------------------------------------------------------------- level 3

function energyPtQ(rng: RNG): Generated | null {
  const inKW = rng.bool(0.5);
  const Pstated = inKW ? rng.pick([0.5, 1, 1.2, 1.5, 2, 2.4, 3]) : rng.pick([40, 50, 60, 75, 100, 150, 200, 250, 500]);
  const P = inKW ? r(Pstated * 1000) : Pstated;
  // The time is always stated in minutes: at this level the question is about converting before multiplying,
  // and with the time already in seconds a "×60" distractor would answer a question the stem never asked.
  const tStated = rng.pick([2, 3, 4, 5, 10, 15, 20]);
  const t = tStated * 60;
  const Ej = r(P * t);
  if (Ej < 500 || Ej > 3e6) return null;
  const inKJ = Ej >= 10000;
  const scale = inKJ ? 1 / 1000 : 1;
  const answer = val(Ej * scale);
  if (!answer) return null;
  const unit = inKJ ? U_KJ : U_J;
  const unitName = inKJ ? 'kJ' : 'J';
  const pText = inKW ? `${n(Pstated)} kW` : `${Pstated} W`;
  const tText = `${tStated} minute${tStated === 1 ? '' : 's'}`;
  const d = deviceForPower(rng, P);
  // Every wrong option here is one of the conversions the question is about, so both minute slips are
  // offered: leaving the time in minutes and multiplying by 60 a second time are equally common, and a
  // ×2 near-miss in their place would say nothing about the mistake.
  return pack(rng, {
    stem: `${d.subject} of power ${pText} is switched on for ${tText}. Find the energy it transfers, in ${unitName}.`,
    answer,
    unit,
    must: [
      { value: val(Pstated * tStated), trap: `multiplied the numbers as they stand (${pText} × ${tText}) without converting` },
      { value: val(P * tStated * scale), trap: 'left the time in minutes instead of converting it to seconds' },
    ],
    extra: [
      { value: val(Ej * scale * 60), trap: 'multiplied by 60 once too often' },
      { value: inKW ? val(Pstated * t * scale) : null, trap: 'left the power in kilowatts instead of converting it to watts' },
      { value: inKJ ? val(Ej / 100) : null, trap: 'divided the joules by 100 instead of 1000 to reach kilojoules' },
      { value: val(P * 60 * scale), trap: 'used 60 s instead of the stated number of minutes' },
      { value: inKJ ? null : val(t), trap: 'quoted the time in seconds as the energy' },
    ],
    spare: [
      { value: val(2 * Ej * scale), trap: 'doubled the energy' },
      { value: val((Ej * scale) / 2), trap: 'halved the energy' },
      { value: val(3 * Ej * scale), trap: 'tripled the energy' },
      { value: val((Ej * scale) / 4), trap: 'quartered the energy' },
    ],
    solution: `$E = Pt = ${n(P)} \\times ${t} = ${n(Ej)}\\ \\text{J}${inKJ ? ` = ${n(Ej / 1000)}\\ \\text{kJ}` : ''}$ (${tText} $= ${t}$ s).`,
    trap: inKW
      ? 'E = Pt needs watts and seconds: turn the kW into W and the minutes into seconds before multiplying.'
      : 'E = Pt needs the time in seconds: multiply the minutes by 60 first, and only once.',
    tags: ['energy', 'power', 'time'],
    params: { variant: 'energy-pt', P, t, inKJ },
  });
}

/** E = Pt where the power has to come from VI first: the richest source of named slips at this level. */
function energyVItQ(rng: RNG): Generated | null {
  const V = rng.pick([6, 9, 12, 20, 24, 50, 100, 120, 240]);
  const I = rng.pick([0.5, 1.5, 2, 2.5, 3, 4, 5]);
  const tStated = rng.pick([1, 2, 3, 5, 10]);
  const t = tStated * 60;
  const P = r(V * I);
  const Ej = r(P * t);
  if (!Number.isInteger(P) || P < 6 || P > 3000) return null;
  if (Ej < 500 || Ej > 3e6) return null;
  const inKJ = Ej >= 10000;
  const scale = inKJ ? 1 / 1000 : 1;
  const answer = val(Ej * scale);
  if (!answer) return null;
  const d = deviceFor(rng, V, P);
  const tText = `${tStated} minute${tStated === 1 ? '' : 's'}`;
  // as in energyPtQ, show only one of the two minute slips so the options stay within a readable range
  const overshoot = rng.bool(0.45);
  return pack(rng, {
    stem: `${d.subject} draws a current of ${n(I)} A from ${supply(V)}. Find the energy it transfers in ${tText}, in ${inKJ ? 'kJ' : 'J'}.`,
    answer,
    unit: inKJ ? U_KJ : U_J,
    must: [
      overshoot
        ? { value: val(P * t * 60 * scale), trap: 'multiplied by 60 once too often' }
        : { value: val(P * tStated * scale), trap: 'left the time in minutes instead of converting it to seconds' },
      { value: val(V * I * I * t * scale), trap: 'used P = VI² instead of P = VI' },
    ],
    extra: [
      { value: val(I * t * scale), trap: 'forgot the p.d. — that product is the charge in coulombs' },
      { value: val(V * t * scale), trap: 'forgot the current' },
      { value: val((V / I) * t * scale), trap: 'divided the p.d. by the current instead of multiplying' },
      { value: val((I / V) * t * scale), trap: 'divided the current by the p.d. instead of multiplying' },
      { value: val(V * V * I * t * scale), trap: 'squared the p.d. as well' },
      { value: val(P * 60 * scale), trap: 'used 60 s instead of the stated number of minutes' },
      { value: inKJ ? null : val(t), trap: 'quoted the time in seconds as the energy' },
    ],
    spare: [
      { value: val(2 * Ej * scale), trap: 'doubled the energy' },
      { value: val((Ej * scale) / 2), trap: 'halved the energy' },
    ],
    solution: `$P = VI = ${V} \\times ${n(I)} = ${n(P)}\\ \\text{W}$, so $E = Pt = ${n(P)} \\times ${t} = ${n(Ej)}\\ \\text{J}${inKJ ? ` = ${n(Ej / 1000)}\\ \\text{kJ}` : ''}$.`,
    trap: 'Find the power VI first, then multiply by the time in seconds — the minutes must be converted.',
    tags: ['energy', 'power', 'time'],
    params: { variant: 'energy-vit', V, I, t, inKJ },
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
  const d = deviceFor(rng, V, P);
  return pack(rng, {
    stem: `${d.subject} of power ${n(Pstated)} ${inKW ? 'kW' : 'W'} is connected to ${supply(V)}. Find the current it draws.`,
    answer,
    unit: U_A,
    must: [
      { value: val(V / P), trap: 'inverted the fraction: divided the p.d. by the power' },
      { value: inKW ? val(Pstated / V) : val(P / (V * V)), trap: inKW ? 'left the rating in kilowatts instead of watts' : 'divided by V² instead of V' },
    ],
    extra: [
      { value: val((V * V) / P), trap: 'gave the resistance of the appliance, not the current' },
      { value: inKW ? val(Pstated) : null, trap: 'quoted the power rating in kilowatts as the current' },
      { value: val(P * V), trap: 'multiplied instead of dividing: I = P/V' },
      { value: val(Math.sqrt(P / V)), trap: 'used P = VI² and took a square root' },
      { value: val(P / (V * V)), trap: 'divided by V² instead of V' },
      { value: val(V), trap: 'quoted the supply p.d. as the current' },
      { value: val(P), trap: 'quoted the power rating in watts as the current' },
      { value: inKW ? val(Pstated * V) : null, trap: 'multiplied the rating in kilowatts by the supply p.d. instead of dividing' },
    ],
    spare: [
      { value: val((P / V) * 10), trap: 'slipped a decimal place' },
      { value: val(P / V / 10), trap: 'slipped a decimal place' },
      { value: val((P / V) * 2), trap: 'doubled the current' },
      { value: val(P / V / 2), trap: 'halved the current' },
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
  // a rating question needs a resistive appliance, and the power alone fixes which one is plausible
  const device = P >= 1000
    ? rng.pick(['An electric heater', 'An immersion heater', 'An electric kettle'])
    : P >= 300 ? rng.pick(['A soldering iron', 'An electric heater'])
      : P >= 15 ? 'A filament lamp' : 'A torch lamp';
  return pack(rng, {
    stem: `${device} is rated ${P} W, ${V} V. Find its resistance when it is operating normally.`,
    answer,
    unit: U_OHM,
    must: [
      // the two ways of pairing V with P: both are values a candidate writes down, and for a
      // low-current lamp they sit far below V²/P, so they are the one `wide` family in this file
      { value: val(V / P), trap: 'used R = V/P instead of R = V²/P', wide: true },
      { value: val(P / V), trap: 'gave the current the device draws, not its resistance', wide: true },
    ],
    extra: [
      { value: val(P), trap: 'quoted the power rating as the resistance' },
      { value: val(V), trap: 'quoted the rated p.d. as the resistance' },
      { value: val(V * P), trap: 'multiplied instead of dividing' },
      { value: val((P * P) / V), trap: 'squared the power instead of the p.d.' },
      { value: val((V * V) / (P * P)), trap: 'squared the power as well as the p.d.' },
    ],
    spare: [
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
      { value: inMin ? val(P * tStated * scale) : null, trap: 'left the time in minutes instead of converting it to seconds' },
    ],
    extra: [
      { value: val(2 * I * R * t * scale), trap: 'doubled the current instead of squaring it' },
      { value: val(I * I * R * R * t * scale), trap: 'squared the resistance as well' },
      // the power in watts is only a plausible wrong answer when the answer itself is in joules
      { value: inKJ ? null : val(P), trap: 'gave the power in watts, not the energy' },
      { value: val(I * R * R * t * scale), trap: 'squared the resistance instead of the current' },
      { value: val(I * I * t * scale), trap: 'forgot the resistance' },
      { value: inMin ? null : val((P * t * scale) / 60), trap: 'divided by 60, as if the time had been given in minutes' },
      { value: inKJ ? val(Ej / 100) : null, trap: 'divided the joules by 100 instead of 1000 to reach kilojoules' },
    ],
    spare: [
      { value: val(2 * Ej * scale), trap: 'doubled the energy' },
      { value: val((Ej * scale) / 2), trap: 'halved the energy' },
      { value: val((Ej * scale) * 10), trap: 'slipped a decimal place' },
    ],
    solution: `$P = I^2R = ${n(I * I)} \\times ${R} = ${n(P)}\\ \\text{W}$, so $E = Pt = ${n(P)} \\times ${t} = ${n(Ej)}\\ \\text{J}${inKJ ? ` = ${n(Ej / 1000)}\\ \\text{kJ}` : ''}$.`,
    trap: inMin
      ? 'Square the current, then multiply by the time in seconds — the minutes must be converted first.'
      : 'Square the current before multiplying by R and t; IRt misses the second factor of I.',
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
      { value: val(P / (2 * R)), trap: 'halved P/R instead of taking its square root' },
      { value: val(R), trap: 'quoted the resistance as the current' },
    ],
    spare: [
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
    ],
    spare: [
      { value: val(2 * P2), trap: 'doubled the answer' },
      { value: val(P2 / 2), trap: 'halved the answer' },
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
      ],
      spare: [
        { value: ratio(P2, P1 + P2), trap: 'gave the share of the total power rather than the ratio of the resistances' },
        { value: ratio(P1 + P2, P1), trap: 'compared the total power with the power of the first lamp' },
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
    ],
    spare: [
      { value: ratio(V1 * V1, V2), trap: 'squared only the first p.d.' },
      { value: ratio(V1, V2 * V2), trap: 'squared only the second p.d.' },
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
  // the supply is derived from I and the pair, so it is only printed when it is one a candidate reads
  // as a supply: "a 46 V supply" would look like a misprint
  if (!STANDARD_SUPPLIES.has(V)) return null;
  if (!Number.isInteger(P1) || P1 < 2 || P1 > 2000) return null;
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
      { value: val(I * (R1 + R2)), trap: 'used the total resistance with P = IR' },
      { value: val(I * I * (R1 + R2)), trap: 'used the total resistance in P = I²R' },
    ],
    spare: [
      { value: val(2 * P1), trap: 'doubled the power' },
      { value: val(P1 / 2), trap: 'halved the power' },
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
        case 3: return pickVariant(rng, [energyPtQ, energyVItQ, energyVItQ, currentFromRatingQ]);
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
        // build the p.d. this current would produce by adding R/2 volts for each half-amp and compare
        // with the p.d. printed in the stem, then cross-check with the power
        let V = 0;
        for (let i = 0; i < Math.round(got * 2); i++) V += p.R / 2;
        return Math.abs(V - p.V) < 1e-9 && Math.abs(got * got * p.R - p.V * got) < 1e-9;
      }
      case 'ohm-r': {
        // substitute into the printed p.d., and cross-check by the power: I²R must equal VI
        return Math.abs(got * p.I - p.V) < 1e-9 && Math.abs(p.I * p.I * got - p.V * p.I) < 1e-9;
      }
      case 'power-vi': {
        // resistance route: get R from Ohm's law on the stem's numbers, then use the two power
        // formulas that the generator did not use (it multiplied V by I directly)
        const R = p.V / p.I;
        if (!(Math.abs(p.I * p.I * R - got) < 1e-9 * Math.max(1, got))) return false;
        return close((p.V * p.V) / R);
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
      case 'energy-vit': {
        // charge route: It coulombs pass, and each gains V joules
        let Q = 0;
        for (let i = 0; i < p.t; i++) Q += p.I;
        const E = Q * p.V;
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
