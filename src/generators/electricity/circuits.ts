import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, Exact, frac, ratToDecimalString } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { gcd, lcm } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Series and parallel circuits: equivalent resistance, supply current, potential dividers and current splitting.
 * Level 1: total resistance in series; two equal resistors in parallel (R/2)
 * Level 2: an unequal parallel pair (6 Ω and 3 Ω → 2 Ω); three in parallel with clean values (2, 3, 6 → 1)
 * Level 3: a series–parallel mix described in words → total resistance, or the current drawn from the supply
 * Level 4: potential divider (the p.d. across one of two series resistors); a current splitting in inverse ratio
 * Level 5: the current in one branch of a series–parallel circuit; the resistor to add in parallel to reach a
 *          target resistance (12 Ω with R → 4 Ω); Kirchhoff at a junction followed by Ohm's law
 *
 * Answers carry their unit (Ω, A, V). The named mistakes: adding parallel resistances, leaving 1/R_total
 * un-inverted (answering 1/2 instead of 2), inverting the divider ratio, and splitting a current in proportion
 * to the resistances instead of inversely.
 */

const U_OHM = '\\text{Ω}', U_A = '\\text{A}', U_V = '\\text{V}';

type Candidate = { value: Exact | null; trap: string };

/** Plain number for a stem: 12, 0.5, 2.5. */
const n = (x: number): string => (Number.isInteger(x) ? `${x}` : `${Number(x.toPrecision(10))}`);
/** Round away floating-point noise. */
const r = (x: number): number => Number(x.toPrecision(12));

const par2 = (a: number, b: number): number => r((a * b) / (a + b));
const parN = (rs: number[]): number => r(1 / rs.reduce((s, x) => s + 1 / x, 0));
const condSum = (rs: number[]): number => r(rs.reduce((s, x) => s + 1 / x, 0));

/** Exact value of a computed quantity, or null if it is not an exam-clean number (short decimals only). */
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

/** The same, but also accepting a simple fraction such as 1/3 (used for un-inverted conductances). */
function fracVal(x: number): Exact | null {
  const direct = val(x);
  if (direct) return direct;
  const y = r(x);
  for (const d of [3, 6, 7, 9, 11, 12, 15, 18, 24]) {
    const num = Math.round(y * d);
    if (num > 0 && Math.abs(num / d - y) < 1e-9) {
      const v = frac(num, d);
      return isCleanExact(v).ok ? v : null;
    }
  }
  return null;
}

/** Positive, finite, clean options within a factor of 100 of the answer. */
function cleanOnly(ds: Candidate[], answer: Exact): Distractor[] {
  const a = answer.toNumber();
  return ds.filter((d): d is { value: Exact; trap: string } => {
    const v = d.value;
    if (!v || !Number.isFinite(v.toNumber()) || v.sign() <= 0 || !v.isRational() || !isCleanExact(v).ok) return false;
    const x = v.toNumber();
    if (x < 0.001 || x > 1e5 || x > 40 * a || x < a / 40) return false;
    if (!readable(v)) return false;
    return v.toRat().d <= 24n || Number.isInteger(r(x * 1000));
  });
}

/**
 * Every `must` trap gets a slot before any `extra` one, so the headline mistakes are never shuffled
 * out; `spare` near-misses (doubled, halved) are taken last, only when the named circuit mistakes did
 * not yield four distinct clean values.
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
  unit: string;
  must: Candidate[];
  extra: Candidate[];
  /** generic near-misses, used only if the named mistakes ran short */
  spare?: Candidate[];
  solution: string;
  trap: string;
  tags: string[];
  params: Record<string, unknown>;
}

function pack(rng: RNG, p: Pack): Generated | null {
  if (!isCleanExact(p.answer).ok || p.answer.sign() <= 0 || !readable(p.answer)) return null;
  const ds = ranked(rng, p.answer, cleanOnly(p.must, p.answer), cleanOnly(p.extra, p.answer), cleanOnly(p.spare ?? [], p.answer));
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

// --------------------------------------------------------------------------- number pools

const R_VALUES = [2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 16, 18, 20, 24, 25, 30, 36, 40, 48, 50, 60];

/** Unequal pairs whose parallel combination is a whole number of ohms (or a half). */
const PAIRS: [number, number][] = [];
for (const a of R_VALUES) {
  for (const b of R_VALUES) {
    if (a >= b) continue;
    const p = par2(a, b);
    if (p >= 1 && Number.isInteger(r(p * 2))) PAIRS.push([a, b]);
  }
}

/** Triples whose parallel combination is a whole number of ohms. */
const TRIPLES: [number, number, number][] = [];
for (const a of R_VALUES) {
  for (const b of R_VALUES) {
    for (const c of R_VALUES) {
      if (!(a <= b && b <= c) || c > 60) continue;
      const p = parN([a, b, c]);
      if (p >= 1 && Number.isInteger(p)) TRIPLES.push([a, b, c]);
    }
  }
}

const ohms = (x: number): string => `${n(x)} Ω`;
/** "a" or "an" in front of a number read aloud (eight, eleven, eighteen, eighty-…). */
const anWord = (x: number): string => {
  const i = Math.floor(Math.abs(x));
  return i === 8 || i === 11 || i === 18 || (i >= 80 && i <= 89) ? 'an' : 'a';
};
/** "a 6 Ω resistor", "an 8 Ω resistor". */
const res = (x: number): string => `${anWord(x)} ${ohms(x)} resistor`;
const Res = (x: number): string => `${anWord(x) === 'an' ? 'An' : 'A'} ${ohms(x)} resistor`;
/** "a 12 V supply", "an 18 V supply". */
const supply = (v: number): string => `${anWord(v)} ${n(v)} V supply`;

// --------------------------------------------------------------------------- level 1

function seriesTotalQ(rng: RNG): Generated | null {
  const three = rng.bool(0.35);
  const rs = rng.pickDistinct(R_VALUES.filter((x) => x <= 40), three ? 3 : 2);
  const total = rs.reduce((s, x) => s + x, 0);
  if (total > 120) return null;
  const answer = val(total);
  if (!answer) return null;
  const list = rs.map(ohms);
  const text = three
    ? `Resistors of resistance ${list[0]}, ${list[1]} and ${list[2]} are connected in series.`
    : `${Res(rs[0])} and ${res(rs[1])} are connected in series.`;
  return pack(rng, {
    stem: `${text} Find the total resistance of the combination.`,
    answer,
    unit: U_OHM,
    must: [
      { value: val(parN(rs)), trap: 'used the parallel rule instead of the series rule' },
      { value: val(rs.reduce((s, x) => s * x, 1)), trap: 'multiplied the resistances' },
    ],
    extra: [
      { value: val(Math.abs(rs[0] - rs[1])), trap: 'subtracted the resistances' },
      { value: val(total / rs.length), trap: 'averaged the resistances' },
      { value: val(total / 2), trap: 'halved the total' },
      { value: val(2 * total), trap: 'doubled the total' },
    ],
    solution: `In series the resistances add: $R = ${rs.join(' + ')} = ${total}\\ \\Omega$.`,
    trap: 'Resistances in series simply add; the product-over-sum rule belongs to parallel resistors.',
    tags: ['series', 'resistance'],
    params: { variant: 'series-total', rs },
  });
}

function parallelEqualQ(rng: RNG): Generated | null {
  const R = rng.pick([2, 4, 6, 8, 10, 12, 16, 20, 24, 30, 40, 50, 60, 100]);
  const answer = val(R / 2);
  if (!answer) return null;
  return pack(rng, {
    stem: `Two ${ohms(R)} resistors are connected in parallel. Find the resistance of the combination.`,
    answer,
    unit: U_OHM,
    must: [
      { value: val(2 * R), trap: 'added the resistances: that is the series rule' },
      { value: val(R), trap: 'assumed the pair behaves like a single resistor' },
    ],
    extra: [
      { value: val(R / 4), trap: 'divided by four instead of two' },
      { value: fracVal(condSum([R, R])), trap: 'left 1/R_total un-inverted' },
      { value: val(R * R), trap: 'multiplied the resistances without dividing by their sum' },
      { value: val(4 * R), trap: 'doubled the series total' },
    ],
    solution: `Two equal resistors in parallel give half the resistance: $R_{\\text{total}} = \\dfrac{${R}}{2} = ${n(R / 2)}\\ \\Omega$.`,
    trap: 'Adding resistances in parallel gives a total larger than either resistor — it must be smaller.',
    tags: ['parallel', 'resistance'],
    params: { variant: 'parallel-equal', rs: [R, R] },
  });
}

// --------------------------------------------------------------------------- level 2

function parallelPairQ(rng: RNG): Generated | null {
  const [a, b] = rng.pick(PAIRS);
  const Rt = par2(a, b);
  const answer = val(Rt);
  if (!answer) return null;
  return pack(rng, {
    stem: `${Res(a)} and ${res(b)} are connected in parallel. Find the resistance of the combination.`,
    answer,
    unit: U_OHM,
    must: [
      { value: val(a + b), trap: 'added the resistances: that is the series rule' },
      { value: fracVal(condSum([a, b])), trap: 'left 1/R_total un-inverted' },
    ],
    extra: [
      { value: val(Math.abs(a - b)), trap: 'subtracted the resistances' },
      { value: val((a + b) / 2), trap: 'averaged the resistances' },
      { value: val(a * b), trap: 'multiplied the resistances without dividing by their sum' },
      { value: val(2 * Rt), trap: 'doubled the combined resistance' },
    ],
    solution: `$R_{\\text{total}} = \\dfrac{${a} \\times ${b}}{${a} + ${b}} = \\dfrac{${a * b}}{${a + b}} = ${n(Rt)}\\ \\Omega$ (smaller than both).`,
    trap: 'The parallel total is always less than the smaller resistance; remember to invert 1/R at the end.',
    tags: ['parallel', 'resistance'],
    params: { variant: 'parallel-pair', rs: [a, b] },
  });
}

function parallelTripleQ(rng: RNG): Generated | null {
  const rs = rng.pick(TRIPLES);
  if (rs[0] === rs[2]) return null;
  const Rt = parN(rs);
  const answer = val(Rt);
  if (!answer) return null;
  const sum = rs[0] + rs[1] + rs[2];
  const L = lcm(lcm(rs[0], rs[1]), rs[2]);
  const S = L / rs[0] + L / rs[1] + L / rs[2];
  return pack(rng, {
    stem: `Resistors of resistance ${ohms(rs[0])}, ${ohms(rs[1])} and ${ohms(rs[2])} are connected in parallel. Find the resistance of the combination.`,
    answer,
    unit: U_OHM,
    must: [
      { value: val(sum), trap: 'added the resistances: that is the series rule' },
      { value: fracVal(condSum(rs)), trap: 'left 1/R_total un-inverted' },
    ],
    extra: [
      { value: val((rs[0] * rs[1] * rs[2]) / sum), trap: 'extended the product-over-sum rule to three resistors' },
      { value: val(par2(rs[0], rs[1])), trap: 'combined only two of the three resistors' },
      { value: val(sum / 3), trap: 'averaged the resistances' },
      { value: val(2 * Rt), trap: 'doubled the combined resistance' },
    ],
    solution: `Put the conductances over a common denominator: $\\dfrac{1}{R} = \\dfrac{1}{${rs[0]}} + \\dfrac{1}{${rs[1]}} + \\dfrac{1}{${rs[2]}} = \\dfrac{${L / rs[0]} + ${L / rs[1]} + ${L / rs[2]}}{${L}} = \\dfrac{${S}}{${L}}$, so $R = \\dfrac{${L}}{${S}} = ${n(Rt)}\\ \\Omega$.`,
    trap: 'Add the conductances, then invert: the total must be smaller than the smallest resistance.',
    tags: ['parallel', 'resistance'],
    params: { variant: 'parallel-triple', rs },
  });
}

// --------------------------------------------------------------------------- level 3

/** R0 in series with a parallel pair (a, b): returns the pieces, or null if the numbers are not clean. */
function mix(rng: RNG): { R0: number; a: number; b: number; Rp: number; Rt: number } | null {
  const [a, b] = rng.pick(PAIRS);
  const Rp = par2(a, b);
  const R0 = rng.pick([2, 3, 4, 5, 6, 8, 10, 12, 15, 20]);
  const Rt = r(R0 + Rp);
  if (!Number.isInteger(r(Rt * 2)) || Rt > 60) return null;
  return { R0, a, b, Rp, Rt };
}

function mixTotalQ(rng: RNG): Generated | null {
  const m = mix(rng);
  if (!m) return null;
  const { R0, a, b, Rp, Rt } = m;
  const answer = val(Rt);
  if (!answer) return null;
  return pack(rng, {
    stem: `${Res(R0)} is connected in series with a parallel combination of ${res(a)} and ${res(b)}. Find the total resistance of the circuit.`,
    answer,
    unit: U_OHM,
    must: [
      { value: val(R0 + a + b), trap: 'added all three resistances as if they were all in series' },
      { value: val(parN([R0, a, b])), trap: 'treated all three resistors as one parallel combination' },
    ],
    extra: [
      { value: val(par2(R0, a + b)), trap: 'combined the wrong pair' },
      { value: val(Rp), trap: 'forgot the series resistor' },
      { value: val(R0 + (a + b) / 2), trap: 'averaged the parallel pair instead of combining it' },
      { value: val(2 * Rt), trap: 'doubled the total' },
    ],
    solution: `Parallel pair: $\\dfrac{${a} \\times ${b}}{${a} + ${b}} = ${n(Rp)}\\ \\Omega$. In series with ${ohms(R0)}: $R = ${R0} + ${n(Rp)} = ${n(Rt)}\\ \\Omega$.`,
    trap: 'Combine the parallel pair first, then add the series resistor — the three do not simply add.',
    tags: ['series', 'parallel', 'resistance'],
    params: { variant: 'mix-total', R0, a, b },
  });
}

function mixCurrentQ(rng: RNG): Generated | null {
  const m = mix(rng);
  if (!m) return null;
  const { R0, a, b, Rp, Rt } = m;
  const I = rng.pick([0.5, 1, 1.5, 2, 2.5, 3, 4, 5]);
  const V = r(I * Rt);
  if (!Number.isInteger(V) || V > 240 || V < 6) return null;
  const answer = val(I);
  if (!answer) return null;
  return pack(rng, {
    stem: `${Res(R0)} is connected in series with a parallel combination of ${res(a)} and ${res(b)}. The combination is connected to ${supply(V)}. Find the current drawn from the supply.`,
    answer,
    unit: U_A,
    must: [
      { value: val(V / (R0 + a + b)), trap: 'added all three resistances' },
      { value: val(V / R0), trap: 'used only the series resistor' },
    ],
    extra: [
      { value: val(V / parN([R0, a, b])), trap: 'treated all three resistors as one parallel combination' },
      { value: val(V / Rp), trap: 'forgot the series resistor' },
      { value: val(2 * I), trap: 'doubled the current' },
      { value: val(I / 2), trap: 'halved the current' },
    ],
    solution: `$R = ${R0} + \\dfrac{${a} \\times ${b}}{${a} + ${b}} = ${R0} + ${n(Rp)} = ${n(Rt)}\\ \\Omega$, so $I = \\dfrac{${n(V)}}{${n(Rt)}} = ${n(I)}\\ \\text{A}$.`,
    trap: 'The supply current needs the total resistance: combine the parallel pair before adding the series resistor.',
    tags: ['series', 'parallel', 'current'],
    params: { variant: 'mix-current', R0, a, b, V },
  });
}

// --------------------------------------------------------------------------- level 4

function dividerQ(rng: RNG): Generated | null {
  const R1 = rng.pick(R_VALUES);
  const R2 = rng.pick(R_VALUES);
  const I = rng.pick([0.5, 1, 1.5, 2, 2.5, 3, 4, 5]);
  if (R1 === R2) return null;
  const V = r(I * (R1 + R2));
  const V1 = r(I * R1);
  if (!Number.isInteger(V) || V > 240 || V < 6 || !Number.isInteger(r(V1 * 2)) || V1 < 1) return null;
  const answer = val(V1);
  if (!answer) return null;
  return pack(rng, {
    stem: `${Res(R1)} and ${res(R2)} are connected in series across ${supply(V)}. Find the potential difference across the ${ohms(R1)} resistor.`,
    answer,
    unit: U_V,
    must: [
      { value: val((V * R2) / (R1 + R2)), trap: 'inverted the divider ratio: used the other resistor on top' },
      { value: val(V / 2), trap: 'assumed the supply p.d. splits equally between the two resistors' },
    ],
    extra: [
      { value: val((V * R1) / R2), trap: 'divided by the other resistance instead of the total' },
      { value: val(V), trap: 'gave the whole supply p.d.' },
      { value: val(V1 / 2), trap: 'halved the p.d. once too often' },
      { value: val(2 * V1), trap: 'doubled the p.d.' },
    ],
    solution: `The same current flows in both: $I = \\dfrac{${n(V)}}{${R1 + R2}} = ${n(I)}\\ \\text{A}$, so $V_1 = IR_1 = ${n(I)} \\times ${R1} = ${n(V1)}\\ \\text{V}$.`,
    trap: 'The larger resistor takes the larger share: V₁ = V × R₁/(R₁ + R₂), not R₂/(R₁ + R₂).',
    tags: ['potential-divider', 'series'],
    params: { variant: 'divider', R1, R2, V },
  });
}

function currentSplitQ(rng: RNG): Generated | null {
  const [a, b] = rng.pick(PAIRS);
  const first = rng.bool(0.5);
  const R1 = first ? a : b;
  const R2 = first ? b : a;
  const I = rng.pick([0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12]);
  const I1 = r((I * R2) / (R1 + R2));
  if (!Number.isInteger(r(I1 * 2)) || I1 < 0.5 || I1 >= I) return null;
  const answer = val(I1);
  if (!answer) return null;
  return pack(rng, {
    stem: `${Res(a)} and ${res(b)} are connected in parallel. A total current of ${n(I)} A enters the combination. Find the current in the ${ohms(R1)} resistor.`,
    answer,
    unit: U_A,
    must: [
      { value: val((I * R1) / (R1 + R2)), trap: 'split the current in proportion to the resistances instead of inversely' },
      { value: val(I / 2), trap: 'assumed the current splits equally' },
    ],
    extra: [
      { value: val((I * R2) / R1), trap: 'used the ratio of the two resistances instead of the resistance over the sum' },
      { value: val(I), trap: 'gave the total current' },
      { value: val(2 * I1), trap: 'doubled the branch current' },
      { value: val(I1 / 2), trap: 'halved the branch current' },
    ],
    solution: `Both resistors have the same p.d., so the currents are in the inverse ratio of the resistances: the ${ohms(R1)} branch takes $\\dfrac{${R2}}{${R1 + R2}}$ of ${n(I)} A $= ${n(I1)}\\ \\text{A}$.`,
    trap: 'Current splits inversely with resistance: the smaller resistor carries the larger current.',
    tags: ['parallel', 'current-divider'],
    params: { variant: 'current-split', R1, R2, I },
  });
}

// --------------------------------------------------------------------------- level 5

function branchCurrentQ(rng: RNG): Generated | null {
  const m = mix(rng);
  if (!m) return null;
  const { R0, a, b, Rp, Rt } = m;
  const first = rng.bool(0.5);
  const R1 = first ? a : b;
  const R2 = first ? b : a;
  const I = rng.pick([1, 1.5, 2, 2.5, 3, 4, 5, 6]);
  const V = r(I * Rt);
  const Vp = r(I * Rp);
  const I1 = r(Vp / R1);
  if (!Number.isInteger(V) || V > 240 || V < 6) return null;
  if (!Number.isInteger(r(I1 * 2)) || I1 < 0.5) return null;
  const answer = val(I1);
  if (!answer) return null;
  return pack(rng, {
    stem: `${supply(V).charAt(0).toUpperCase() + supply(V).slice(1)} is connected to ${res(R0)} in series with a parallel combination of ${res(a)} and ${res(b)}. Find the current in the ${ohms(R1)} resistor.`,
    answer,
    unit: U_A,
    must: [
      { value: val(V / R1), trap: 'used the whole supply p.d. across that resistor' },
      { value: val(I), trap: 'gave the total current drawn from the supply' },
    ],
    extra: [
      { value: val(r(Vp / R2)), trap: 'found the current in the other branch' },
      { value: val(V / (R0 + R1)), trap: 'ignored the second branch altogether' },
      { value: val(I / 2), trap: 'assumed the current splits equally between the branches' },
      { value: val(2 * I1), trap: 'doubled the branch current' },
    ],
    solution: `$R = ${R0} + ${n(Rp)} = ${n(Rt)}\\ \\Omega$ and $I = \\dfrac{${n(V)}}{${n(Rt)}} = ${n(I)}\\ \\text{A}$. The p.d. across the parallel pair is $${n(I)} \\times ${n(Rp)} = ${n(Vp)}\\ \\text{V}$, so the ${ohms(R1)} branch carries $\\dfrac{${n(Vp)}}{${R1}} = ${n(I1)}\\ \\text{A}$.`,
    trap: 'Only part of the supply p.d. is across the parallel section; find the total current first.',
    tags: ['series', 'parallel', 'branch-current'],
    params: { variant: 'branch-current', R0, a, b, R1, V },
  });
}

function addParallelQ(rng: RNG): Generated | null {
  const R1 = rng.pick([6, 8, 10, 12, 15, 16, 18, 20, 24, 30, 36, 40, 48, 60]);
  const Rt = rng.pick([2, 3, 4, 5, 6, 8, 10, 12, 15, 16, 20]);
  if (Rt >= R1) return null;
  const X = r((R1 * Rt) / (R1 - Rt));
  if (!Number.isInteger(X) || X > 200) return null;
  const answer = val(X);
  if (!answer) return null;
  return pack(rng, {
    stem: `A resistor of resistance ${ohms(R1)} is connected in parallel with a second resistor. The resistance of the combination is ${ohms(Rt)}. Find the resistance of the second resistor.`,
    answer,
    unit: U_OHM,
    must: [
      { value: val(R1 - Rt), trap: 'subtracted the resistances, as if parallel resistances subtract' },
      { value: val(R1 + Rt), trap: 'added the resistances' },
    ],
    extra: [
      { value: val(par2(R1, Rt)), trap: 'combined the two given values in parallel' },
      { value: val(Rt / 2), trap: 'halved the target resistance' },
      { value: val(2 * Rt), trap: 'doubled the target resistance' },
      { value: val(2 * X), trap: 'doubled the answer' },
    ],
    solution: `Conductances subtract: $\\dfrac{1}{R} = \\dfrac{1}{${Rt}} - \\dfrac{1}{${R1}} = \\dfrac{${R1 / gcd(R1, Rt)} - ${Rt / gcd(R1, Rt)}}{${(R1 * Rt) / gcd(R1, Rt)}}$, so $R = \\dfrac{${R1} \\times ${Rt}}{${R1} - ${Rt}} = ${X}\\ \\Omega$.`,
    trap: 'Subtract the conductances (1/R), not the resistances: adding a resistor in parallel always lowers the total.',
    tags: ['parallel', 'resistance', 'design'],
    params: { variant: 'add-parallel', R1, Rt },
  });
}

function junctionQ(rng: RNG): Generated | null {
  const a = rng.pick([2, 3, 4, 5, 6, 8, 10]);
  const b = rng.pick([1, 1.5, 2, 3, 4, 5]);
  const c = rng.pick([0.5, 1, 1.5, 2, 3, 4]);
  const IR = r(a + b - c);
  const R = rng.pick([2, 3, 4, 5, 6, 8, 10, 12, 15, 20]);
  const V = r(IR * R);
  if (IR < 1 || IR >= a + b || !Number.isInteger(r(IR * 2)) || !Number.isInteger(V) || V > 200 || V < 4) return null;
  const answer = val(V);
  if (!answer) return null;
  return pack(rng, {
    stem: `At a junction in a circuit, currents of ${n(a)} A and ${n(b)} A flow in along two wires. A current of ${n(c)} A flows out along a third wire, and the rest of the current flows out through ${res(R)}. Find the potential difference across that resistor.`,
    answer,
    unit: U_V,
    must: [
      { value: val((a + b) * R), trap: 'forgot the current leaving along the third wire' },
      { value: val(c * R), trap: 'used the current in the wrong wire' },
    ],
    extra: [
      { value: val((a + b + c) * R), trap: 'added the outgoing current instead of subtracting it' },
      { value: val(IR / R), trap: 'divided the current by the resistance' },
      { value: val(R / IR), trap: 'inverted Ohm’s law' },
      { value: val(2 * V), trap: 'doubled the p.d.' },
    ],
    solution: `Kirchhoff at the junction: current in the resistor $= ${n(a)} + ${n(b)} - ${n(c)} = ${n(IR)}\\ \\text{A}$, so $V = IR = ${n(IR)} \\times ${R} = ${n(V)}\\ \\text{V}$.`,
    trap: 'Total current in = total current out; only the current that actually flows through the resistor sets its p.d.',
    tags: ['kirchhoff', 'junction', 'ohms-law'],
    params: { variant: 'junction', a, b, c, R },
  });
}

// --------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'phy.electricity.circuits',
  module: 'PHY',
  topic: 'electricity',
  title: 'Series and parallel circuits',
  levels: {
    1: 'total resistance in series (two or three resistors); two equal resistors in parallel (R/2)',
    2: 'an unequal parallel pair (6 Ω and 3 Ω → 2 Ω); three resistors in parallel (2, 3, 6 → 1 Ω)',
    3: 'a series–parallel mix described in words: total resistance, or the current drawn from the supply',
    4: 'potential divider: the p.d. across one of two series resistors; a current splitting in inverse ratio',
    5: 'the current in one branch of a series–parallel circuit; the resistor to add in parallel to reach a target; Kirchhoff at a junction then Ohm’s law',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return pickVariant(rng, [seriesTotalQ, seriesTotalQ, parallelEqualQ]);
        case 2: return pickVariant(rng, [parallelPairQ, parallelPairQ, parallelTripleQ]);
        case 3: return pickVariant(rng, [mixTotalQ, mixCurrentQ]);
        case 4: return pickVariant(rng, [dividerQ, currentSplitQ]);
        default: return pickVariant(rng, [branchCurrentQ, addParallelQ, junctionQ]);
      }
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const p = q.params as Record<string, number> & { variant: string; rs?: number[] };
    const got = q.answer.value.toNumber();
    /** Current drawn from a test supply of Vt volts by the given resistors in parallel. */
    const branchCurrents = (Vt: number, rs: number[]) => rs.reduce((s, x) => s + Vt / x, 0);
    switch (p.variant) {
      case 'series-total': {
        // Ohm's law check: with 2 A flowing, the p.d.s across the resistors must add to 2 × R_total
        const rs = p.rs as number[];
        const Vt = 2 * got;
        return Math.abs(rs.reduce((s, x) => s + 2 * x, 0) - Vt) < 1e-9;
      }
      case 'parallel-equal':
      case 'parallel-pair':
      case 'parallel-triple': {
        // conductance route: the branch currents from a 60 V test supply must add to 60 / R_total
        const rs = p.rs as number[];
        const Vt = 60;
        return Math.abs(branchCurrents(Vt, rs) - Vt / got) < 1e-9 * Math.max(1, Vt / got);
      }
      case 'mix-total': {
        // drive the claimed total with a test supply and check the branch currents add up
        const Vt = 12 * got;
        const I = Vt / got;
        const Vpar = Vt - I * p.R0;
        return Math.abs(branchCurrents(Vpar, [p.a, p.b]) - I) < 1e-9 * Math.max(1, I);
      }
      case 'mix-current': {
        // the claimed supply current must satisfy the loop: V = I·R0 + V_parallel, with the branches adding to I
        const Vpar = p.V - got * p.R0;
        return Vpar > 0 && Math.abs(branchCurrents(Vpar, [p.a, p.b]) - got) < 1e-9 * Math.max(1, got);
      }
      case 'divider': {
        // the two p.d.s must add to the supply and carry the same current
        const V2 = p.V - got;
        return Math.abs(got / p.R1 - V2 / p.R2) < 1e-9 * Math.max(1, got / p.R1);
      }
      case 'current-split': {
        // the two branch currents must add to the total and produce the same p.d.
        const I2 = p.I - got;
        return I2 > 0 && Math.abs(got * p.R1 - I2 * p.R2) < 1e-9 * Math.max(1, got * p.R1);
      }
      case 'branch-current': {
        // p.d. across the branch, then the loop equation V = I_total·R0 + V_parallel
        const R2 = p.R1 === p.a ? p.b : p.a;
        const Vpar = got * p.R1;
        const Itot = got + Vpar / R2;
        return Math.abs(Itot * p.R0 + Vpar - p.V) < 1e-9 * Math.max(1, p.V);
      }
      case 'add-parallel': {
        // conductances must add: 1/R1 + 1/answer = 1/R_total
        return Math.abs(1 / p.R1 + 1 / got - 1 / p.Rt) < 1e-12;
      }
      case 'junction': {
        // the current implied by Ohm's law must balance the junction
        const I = got / p.R;
        return Math.abs(I + p.c - (p.a + p.b)) < 1e-9;
      }
      default:
        return false;
    }
  },
});
