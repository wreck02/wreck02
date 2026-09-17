import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, Exact } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import type { RNG } from '../../core/rng';

/**
 * SI prefixes and unit conversions.
 * Level 1: one prefix — km → m, cm → m, mA → A, MW → W, µs → s, ms → s, GHz → Hz, kJ → J
 * Level 2: squared and cubed units — cm² → m² (÷10⁴), cm³ → m³ (÷10⁶), m² → cm², m³ → cm³, mm → km
 * Level 3: km/h ↔ m s⁻¹ (×5/18 and ×18/5) and g cm⁻³ ↔ kg m⁻³ (×10³)
 * Level 4: compound quantities — a kW heater for hours in J, the period of a GHz clock, mA for minutes in C
 * Level 5: powers of a prefixed unit ((3 µm)², (2 mm)³), litres → m³, kW h → J, g and cm³ → kg m⁻³
 *
 * verify() never repeats generate()'s multiplier: it parses the unit strings kept in params
 * (e.g. "cm^3", "g/cm^3", "kW h") with a table of prefix exponents and explicit unit powers, and
 * recomputes the quantity in SI base units from there.
 */

const n = (x: number): string => (Number.isInteger(x) ? `${x}` : `${Number(x.toPrecision(10))}`);
const round = (x: number): number => Number(x.toPrecision(12));

type Cand = { value: number | null; trap: string };
type Fmt = 'decimal' | 'sf';

/** Standard-form display whenever the number is big or small enough that a decimal would be silly. */
const fmtFor = (a: number): Fmt => (a >= 1e4 || a <= 1e-2 ? 'sf' : 'decimal');

function cleanOnly(ds: Cand[], fmt: Fmt): Distractor[] {
  const out: Distractor[] = [];
  for (const d of ds) {
    if (d.value === null || !Number.isFinite(d.value) || d.value <= 0) continue;
    const v = round(d.value);
    if (v > 1e15 || v < 1e-12) continue;
    if (fmt === 'decimal' && (v > 1e7 || v < 1e-4)) continue;
    // Beside options in standard form this one would print as "5 \times 10^{0}", which no exam
    // writes and which marks the option out as the odd one on the page. The answer itself is never
    // in this range when the list is in standard form.
    if (fmt === 'sf' && v >= 1 && v < 10) continue;
    let ex: Exact;
    try { ex = E(v); } catch { continue; }
    if (!isCleanExact(ex).ok) continue;
    out.push({ value: ex, trap: d.trap });
  }
  return out;
}

/**
 * Choose the distractors so that the option list is a narrow ladder whose rungs are all believable,
 * and so that the answer's position in it says nothing.
 *
 * `spread` is the factor the *whole* list may span, not the distance from the answer: at 10^4 a
 * conversion question reads like the exam's own (0.0004, 0.004, 0.04, 0.4, 4), while the 10^6 and
 * 10^9 ladders the named traps would otherwise build offer two options — 250 mA as 250000 A — that
 * are struck out on sight, leaving three real choices.
 *
 * A window of that width is placed over the answer with a random number of decades below it, so the
 * answer is as often the largest option as the smallest; the nearest headline (`must`) traps are
 * taken first, then the extras. If a window cannot be filled, the next one is tried before pack()
 * gives up and redraws.
 */
function ranked(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], pads: Distractor[], spread: number, count = 4): Distractor[] {
  const a = answer.toNumber();
  const decades = Math.max(1, Math.round(Math.log10(spread)));
  const closest = (d: Distractor) => Math.abs(Math.log10(d.value.toNumber() / a));
  // named conversion mistakes first, and the bare power-of-ten rungs only to fill what is left
  const ordered = [...must.slice().sort((x, y) => closest(x) - closest(y)), ...rng.shuffle(extra), ...rng.shuffle(pads)];
  const collect = (below: number): Distractor[] => {
    const lo = a * Math.pow(10, -below) * (1 - 1e-9);
    const hi = a * Math.pow(10, decades - below) * (1 + 1e-9);
    const seen: Exact[] = [answer];
    const out: Distractor[] = [];
    for (const d of ordered) {
      const v = d.value.toNumber();
      if (!(v >= lo) || !(v <= hi)) continue;
      if (seen.some((x) => x.equals(d.value))) continue;
      seen.push(d.value);
      out.push(d);
    }
    return out;
  };
  // How many options end up below the answer — that is, where the answer sits in the sorted list —
  // is drawn first, and then a window that can supply it is looked for. Taking the first window that
  // happens to fill instead would put the answer at the same rank in most questions of a level,
  // which is worth more to a candidate than the physics.
  let best: Distractor[] = [];
  const windows = rng.shuffle([...Array(decades + 1).keys()]).map(collect);
  for (const w of windows) if (w.length > best.length) best = w;
  for (const nBelow of rng.shuffle([...Array(count + 1).keys()])) {
    for (const picked of windows) {
      const lower = picked.filter((d) => d.value.toNumber() < a);
      const upper = picked.filter((d) => d.value.toNumber() > a);
      if (lower.length < nBelow || upper.length < count - nBelow) continue;
      return [...lower.slice(0, nBelow), ...upper.slice(0, count - nBelow)];
    }
  }
  return best; // short: pack() redraws
}

/**
 * Power-of-ten pads: the rungs of the ladder one and two powers of ten either side of the answer.
 *
 * They are offered on both sides because `ranked` draws how many options end up below the answer;
 * taking them in order instead would bracket the answer in every question, which is what used to
 * make the correct option the median of the list and never an end of it.
 */
function tenPads(a: number): Cand[] {
  return [
    { value: round(a * 10), trap: 'a factor of 10 too big: the power of ten in the prefix is one out' },
    { value: round(a / 10), trap: 'a factor of 10 too small: the power of ten in the prefix is one out' },
    { value: round(a * 100), trap: 'a factor of 100 too big: the power of ten in the prefix is two out' },
    { value: round(a / 100), trap: 'a factor of 100 too small: the power of ten in the prefix is two out' },
    { value: round(a * 1000), trap: 'a factor of $10^{3}$ too big: one prefix step out' },
    { value: round(a / 1000), trap: 'a factor of $10^{3}$ too small: one prefix step out' },
  ];
}

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
  answer: number;
  unit: string;
  must: Cand[];
  extra: Cand[];
  solution: string;
  trap: string;
  tags: string[];
  params: Record<string, unknown>;
  spread?: number;
}

function pack(rng: RNG, p: Pack): Generated | null {
  const a = round(p.answer);
  if (!(a > 0) || !Number.isFinite(a)) return null;
  let value: Exact;
  try { value = E(a); } catch { return null; }
  if (!isCleanExact(value).ok) return null;
  const format = fmtFor(a);
  const ds = ranked(rng, value, cleanOnly(p.must, format), cleanOnly(p.extra, format), cleanOnly(tenPads(a), format), p.spread ?? 1e4);
  if (ds.length < 4) return null;
  // An option that is the only whole number among decimals — or the only decimal among whole
  // numbers — is a free elimination: at levels where the answer is a sub-unit decimal the
  // integer-looking option is always the "multiplied instead of dividing" trap. Redraw until the
  // shape of the options tells a candidate nothing.
  const vals = [a, ...ds.map((d) => d.value.toNumber())];
  const ints = vals.filter((x) => Number.isInteger(x)).length;
  if (ints === 1 || ints === vals.length - 1) return null;
  return {
    stem: p.stem,
    answer: { kind: 'exact', value, format, unit: p.unit },
    options: buildOptions(rng, value, ds, { format, unit: p.unit }),
    solution: p.solution,
    trap: p.trap,
    tags: p.tags,
    params: p.params,
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- the prefix table (used by verify)

const PREFIX: Record<string, number> = { G: 1e9, M: 1e6, k: 1e3, d: 1e-1, c: 1e-2, m: 1e-3, u: 1e-6, n: 1e-9, p: 1e-12 };
/** Value of one unit in SI base units (kg, m, s, A …). */
const BASE: Record<string, number> = { m: 1, s: 1, g: 1e-3, A: 1, N: 1, J: 1, W: 1, Pa: 1, Hz: 1, V: 1, C: 1, L: 1e-3, h: 3600, min: 60 };

/** How many SI base units one of the written unit is: "cm^3" → 1e-6, "g/cm^3" → 1e3, "kW h" → 3.6e6. */
function factor(u: string): number {
  const sides = u.split('/');
  if (sides.length > 2) return NaN;
  const side = (s: string): number => {
    let acc = 1;
    for (const tok of s.trim().split(/\s+/).filter(Boolean)) {
      const m = /^([A-Za-z]+)(?:\^(-?\d+))?$/.exec(tok);
      if (!m) return NaN;
      const sym = m[1];
      const p = m[2] ? parseInt(m[2], 10) : 1;
      let f: number;
      if (BASE[sym] !== undefined) f = BASE[sym];
      else if (sym.length > 1 && PREFIX[sym[0]] !== undefined && BASE[sym.slice(1)] !== undefined) f = PREFIX[sym[0]] * BASE[sym.slice(1)];
      else return NaN;
      acc *= Math.pow(f, p);
    }
    return acc;
  };
  return side(sides[0]) / (sides.length === 2 ? side(sides[1]) : 1);
}

// ----------------------------------------------------------------------------- simple conversions

interface Recipe {
  /** parse strings for verify() */
  from: string;
  to: string;
  /** LaTeX for the stem and the answer */
  fromTex: string;
  toTex: string;
  /** words for the ask: "in metres" */
  words: string;
  /** what generate multiplies by */
  mult: number;
  values: number[];
  ctx: (v: string, x: number) => string;
  quantity: string;
  /** extra named traps, as multipliers applied to the input value */
  wrong: { m: number; trap: string }[];
  /** optional closing hint for the solution */
  hint?: string;
  /** the one-line trap for this conversion */
  trapLine: string;
  /** how wide the option ladder may be, when 10^6 is wider than this conversion's mistakes need */
  spread?: number;
}

/**
 * A speed needs a context that fits its size. "A cyclist rides at 50 m s⁻¹" is 180 km/h, and once the
 * stem is impossible the only option on the page that looks like a real speed is the correct one —
 * which answers the question without any conversion.
 */
function speedCtx(kmh: number, v: string, unit: string): string {
  const who = kmh <= 12 ? 'A runner jogs' : kmh <= 36 ? 'A cyclist rides' : kmh <= 110 ? 'A car travels' : 'A train travels';
  return `${who} at $${v}\\ ${unit}$.`;
}

/** LaTeX for a conversion factor: 10^{-4}, 3.6, 1/3.6, 3.6 x 10^{6}. */
function multTex(m: number): string {
  const e = Math.round(Math.log10(m));
  if (Math.abs(m - Math.pow(10, e)) < 1e-9 * m) return e === 0 ? '1' : `10^{${e}}`;
  if (Math.abs(m - 5 / 18) < 1e-12) return '\\frac{1}{3.6}';
  if (Math.abs(m - 18 / 5) < 1e-12) return '3.6';
  return E(round(m)).toLatex({ format: fmtFor(m) });
}

const LEVEL1: Recipe[] = [
  {
    from: 'km', to: 'm',
    trapLine: 'Kilo is a factor of $10^{3}$, and going to the smaller unit multiplies: metres are more numerous than kilometres.', fromTex: '\\text{km}', toTex: '\\text{m}', words: 'in metres', mult: 1e3,
    values: [0.4, 0.8, 1.2, 2.5, 3, 4.5, 6, 7.5, 12, 15, 25, 40], quantity: 'distance',
    ctx: (v) => `A stretch of road is $${v}\\ \\text{km}$ long.`,
    wrong: [{ m: 1e-3, trap: 'divided by $10^{3}$ instead of multiplying' }, { m: 1e6, trap: 'used the prefix mega instead of kilo' }, { m: 1e2, trap: 'confused kilo with a factor of 100' }, { m: 1e5, trap: 'converted to centimetres instead of metres' }],
  },
  {
    from: 'mA', to: 'A',
    trapLine: 'Milli is $10^{-3}$ and micro is $10^{-6}$: going to the bigger unit divides.', fromTex: '\\text{mA}', toTex: '\\text{A}', words: 'in amperes', mult: 1e-3,
    values: [5, 8, 20, 25, 40, 50, 60, 120, 250, 400, 750, 1500], quantity: 'current',
    ctx: (v) => `A current of $${v}\\ \\text{mA}$ flows through a resistor.`,
    wrong: [{ m: 1e3, trap: 'multiplied by $10^{3}$ instead of dividing' }, { m: 1e-6, trap: 'confused milli ($10^{-3}$) with micro ($10^{-6}$)' }, { m: 1e-2, trap: 'used a factor of 100 for milli' }],
  },
  {
    from: 'MW', to: 'W',
    trapLine: 'Mega is $10^{6}$, kilo only $10^{3}$: going to the smaller unit multiplies.', fromTex: '\\text{MW}', toTex: '\\text{W}', words: 'in watts', mult: 1e6,
    values: [2, 2.5, 4, 5, 6, 8, 12, 15, 25, 40, 400, 600, 800], quantity: 'power',
    ctx: (v) => `A power station has an output of $${v}\\ \\text{MW}$.`,
    wrong: [{ m: 1e3, trap: 'used kilo ($10^{3}$) instead of mega ($10^{6}$)' }, { m: 1e-6, trap: 'divided by $10^{6}$ instead of multiplying' }, { m: 1e9, trap: 'used giga instead of mega' }],
  },
  {
    from: 'us', to: 's',
    trapLine: 'Micro is $10^{-6}$, not $10^{-3}$, and going to the bigger unit divides.', fromTex: '\\mu\\text{s}', toTex: '\\text{s}', words: 'in seconds', mult: 1e-6,
    values: [4, 8, 12, 20, 25, 40, 50, 80, 120, 250, 500, 750], quantity: 'time',
    ctx: (v) => `A pulse of light lasts $${v}\\ \\mu\\text{s}$.`,
    wrong: [{ m: 1e-3, trap: 'confused micro ($10^{-6}$) with milli ($10^{-3}$)' }, { m: 1e6, trap: 'multiplied by $10^{6}$ instead of dividing' }, { m: 1e-9, trap: 'used nano instead of micro' }, { m: 1e-12, trap: 'used pico instead of micro' }],
  },
  {
    from: 'GHz', to: 'Hz',
    trapLine: 'Giga is $10^{9}$: three more powers of ten than mega.', fromTex: '\\text{GHz}', toTex: '\\text{Hz}', words: 'in hertz', mult: 1e9,
    values: [1.2, 1.5, 2, 2.4, 2.5, 3, 3.6, 4, 4.8, 5, 6, 8], quantity: 'frequency',
    ctx: (v) => `A radio transmitter works at a frequency of $${v}\\ \\text{GHz}$.`,
    wrong: [{ m: 1e6, trap: 'used mega instead of giga' }, { m: 1e3, trap: 'used kilo instead of giga' }, { m: 1e12, trap: 'used $10^{12}$ for giga' }],
  },
  {
    from: 'kJ', to: 'J',
    trapLine: 'Kilo is a factor of $10^{3}$, and going to the smaller unit multiplies.', fromTex: '\\text{kJ}', toTex: '\\text{J}', words: 'in joules', mult: 1e3,
    values: [1.5, 2.5, 4, 6, 7.5, 12, 24, 45, 60, 80, 150, 250], quantity: 'energy',
    ctx: (v) => `A kettle transfers $${v}\\ \\text{kJ}$ of energy.`,
    wrong: [{ m: 1e-3, trap: 'divided by $10^{3}$ instead of multiplying' }, { m: 1e6, trap: 'used mega instead of kilo' }, { m: 1e2, trap: 'confused kilo with a factor of 100' }],
  },
  {
    from: 'cm', to: 'm',
    trapLine: 'Centi is $10^{-2}$: there are 100 centimetres in a metre, so going to the bigger unit divides.', fromTex: '\\text{cm}', toTex: '\\text{m}', words: 'in metres', mult: 1e-2,
    values: [8, 15, 24, 45, 60, 75, 120, 250, 400, 750], quantity: 'length',
    ctx: (v) => `A metal rod measures $${v}\\ \\text{cm}$.`,
    wrong: [{ m: 1e2, trap: 'multiplied by 100 instead of dividing' }, { m: 1e-3, trap: 'confused centi ($10^{-2}$) with milli ($10^{-3}$)' }, { m: 1e-6, trap: 'used micro instead of centi' }, { m: 1e3, trap: 'treated centimetres as kilometres' }],
  },
  {
    from: 'ms', to: 's',
    trapLine: 'Milli is $10^{-3}$: going from the smaller unit to the bigger one divides.', fromTex: '\\text{ms}', toTex: '\\text{s}', words: 'in seconds', mult: 1e-3,
    values: [4, 12, 20, 25, 50, 80, 125, 200, 400, 750, 1500], quantity: 'time',
    ctx: (v) => `A camera flash lasts $${v}\\ \\text{ms}$.`,
    wrong: [{ m: 1e3, trap: 'multiplied by $10^{3}$ instead of dividing' }, { m: 1e-6, trap: 'confused milli ($10^{-3}$) with micro ($10^{-6}$)' }, { m: 1e-2, trap: 'used a factor of 100 for milli' }],
  },
];

const LEVEL2: Recipe[] = [
  {
    from: 'cm^2', to: 'm^2',
    trapLine: 'A squared unit carries the prefix twice: $1\\ \\text{m}^{2} = 10^{4}\\ \\text{cm}^{2}$, not $10^{2}$.', fromTex: '\\text{cm}^{2}', toTex: '\\text{m}^{2}', words: 'in $\\text{m}^{2}$', mult: 1e-4,
    values: [50, 80, 120, 150, 250, 300, 400, 500, 750, 2500, 7500, 12000, 20000, 25000, 40000], quantity: 'area',
    ctx: (v) => `A metal plate has an area of $${v}\\ \\text{cm}^{2}$.`,
    wrong: [{ m: 1e-2, trap: 'divided by $10^{2}$: an area needs the length factor squared' }, { m: 1e-6, trap: 'used the volume factor $10^{6}$' }, { m: 1e4, trap: 'multiplied by $10^{4}$ instead of dividing' }, { m: 1e-8, trap: 'applied the $10^{4}$ twice' }],
  },
  {
    from: 'cm^3', to: 'm^3',
    trapLine: 'A cubed unit carries the prefix three times: $1\\ \\text{m}^{3} = 10^{6}\\ \\text{cm}^{3}$, not $10^{3}$.', fromTex: '\\text{cm}^{3}', toTex: '\\text{m}^{3}', words: 'in $\\text{m}^{3}$', mult: 1e-6,
    values: [200, 250, 300, 400, 500, 600, 750, 1200, 1500, 2000, 2500, 4000, 7500, 25000, 40000], quantity: 'volume',
    ctx: (v) => `A container holds $${v}\\ \\text{cm}^{3}$ of liquid.`,
    wrong: [{ m: 1e-3, trap: 'divided by $10^{3}$: a volume needs the length factor cubed' }, { m: 1e-4, trap: 'used the area factor $10^{4}$' }, { m: 1e6, trap: 'multiplied by $10^{6}$ instead of dividing' }, { m: 1e-12, trap: 'applied the $10^{6}$ twice' }],
  },
  {
    from: 'mm^2', to: 'm^2',
    trapLine: 'A squared unit carries the prefix twice: $1\\ \\text{m}^{2} = 10^{6}\\ \\text{mm}^{2}$.', fromTex: '\\text{mm}^{2}', toTex: '\\text{m}^{2}', words: 'in $\\text{m}^{2}$', mult: 1e-6,
    values: [150, 200, 300, 400, 500, 600, 800, 1200, 2500, 4000, 5000, 7500], quantity: 'area',
    ctx: (v) => `The cross-section of a wire has an area of $${v}\\ \\text{mm}^{2}$.`,
    wrong: [{ m: 1e-3, trap: 'divided by $10^{3}$: an area needs the length factor squared' }, { m: 1e-4, trap: 'used the factor for cm² instead of mm²' }, { m: 1e6, trap: 'multiplied instead of dividing' }, { m: 1e-12, trap: 'applied the $10^{6}$ twice' }],
  },
  {
    from: 'mm', to: 'km',
    trapLine: 'Two prefixes in a row: mm to m divides by $10^{3}$ and m to km by another $10^{3}$.', fromTex: '\\text{mm}', toTex: '\\text{km}', words: 'in kilometres', mult: 1e-6,
    values: [2500, 4000, 6000, 7500, 12000, 15000, 25000, 40000, 60000, 80000, 125000, 250000], quantity: 'length',
    ctx: (v) => `A length of wire measures $${v}\\ \\text{mm}$.`,
    wrong: [{ m: 1e-3, trap: 'only one of the two conversions done' }, { m: 1e-9, trap: 'a factor of $10^{3}$ too many' }, { m: 1e-2, trap: 'used centimetres for the first step' }, { m: 1e3, trap: 'multiplied by $10^{3}$ instead of dividing' }],
  },
  {
    from: 'm^2', to: 'cm^2',
    trapLine: 'A squared unit carries the prefix twice, and going to the smaller unit multiplies: $1\\ \\text{m}^{2} = 10^{4}\\ \\text{cm}^{2}$.', fromTex: '\\text{m}^{2}', toTex: '\\text{cm}^{2}', words: 'in $\\text{cm}^{2}$', mult: 1e4,
    values: [0.5, 0.8, 1.2, 1.5, 1.8, 2, 2.4, 2.5, 3, 3.6, 4, 5, 6, 7.5], quantity: 'area',
    ctx: (v) => `A table top has an area of $${v}\\ \\text{m}^{2}$.`,
    wrong: [{ m: 1e2, trap: 'used the length factor $10^{2}$: an area needs it squared' }, { m: 1e6, trap: 'used the volume factor $10^{6}$' }, { m: 1e-4, trap: 'divided by $10^{4}$ instead of multiplying' }, { m: 1e8, trap: 'applied the $10^{4}$ twice' }],
  },
  {
    from: 'm^3', to: 'cm^3',
    trapLine: 'A cubed unit carries the prefix three times, and going to the smaller unit multiplies: $1\\ \\text{m}^{3} = 10^{6}\\ \\text{cm}^{3}$.', fromTex: '\\text{m}^{3}', toTex: '\\text{cm}^{3}', words: 'in $\\text{cm}^{3}$', mult: 1e6,
    values: [0.2, 0.3, 0.4, 0.5, 0.8, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6], quantity: 'volume',
    ctx: (v) => `A water tank has a volume of $${v}\\ \\text{m}^{3}$.`,
    wrong: [{ m: 1e3, trap: 'used the length factor cubed only once ($10^{3}$)' }, { m: 1e4, trap: 'used the area factor $10^{4}$' }, { m: 1e-6, trap: 'divided by $10^{6}$ instead of multiplying' }, { m: 1e2, trap: 'used $10^{2}$ for the conversion' }],
  },
];

const LEVEL3: Recipe[] = [
  {
    from: 'km/h', to: 'm/s',
    trapLine: '1000 m in 3600 s: km/h to $\\text{m s}^{-1}$ divides by 3.6, it does not multiply.', fromTex: '\\text{km/h}', toTex: '\\text{m s}^{-1}', words: 'in $\\text{m s}^{-1}$', mult: 5 / 18,
    values: [9, 18, 27, 36, 45, 54, 63, 72, 81, 90, 99, 108, 117, 126, 144, 162, 180], quantity: 'speed',
    ctx: (v, x) => speedCtx(x, v, '\\text{km/h}'),
    wrong: [{ m: 18 / 5, trap: 'multiplied by 3.6 instead of dividing by it' }, { m: 1e3 / 60, trap: 'divided by 60 instead of 3600' }, { m: 1, trap: 'left the number unchanged' }, { m: 1 / 3600, trap: 'divided by 3600 but forgot the 1000 m in a kilometre' }, { m: 1 / 60, trap: 'divided by 60 only: that converts hours to minutes' }],
    hint: '(1000 m in 3600 s: divide by 3.6.)',
    // the mistakes here are factors of 3.6, 60 and 3600, so a three-decade ladder holds all of them,
    // and it keeps two or three of the options at speeds a real cyclist, car or train could have
    spread: 1e3,
  },
  {
    from: 'm/s', to: 'km/h',
    trapLine: '3.6 goes the other way here: $\\text{m s}^{-1}$ to km/h multiplies by 3.6.', fromTex: '\\text{m s}^{-1}', toTex: '\\text{km/h}', words: 'in $\\text{km/h}$', mult: 18 / 5,
    values: [2.5, 5, 7.5, 8, 10, 12, 12.5, 15, 17.5, 20, 22.5, 25, 30, 35, 40, 45, 50], quantity: 'speed',
    ctx: (v, x) => speedCtx(x * 3.6, v, '\\text{m s}^{-1}'),
    wrong: [{ m: 5 / 18, trap: 'divided by 3.6 instead of multiplying by it' }, { m: 60 / 1e3, trap: 'used 60 seconds in an hour' }, { m: 1, trap: 'left the number unchanged' }, { m: 3600, trap: 'multiplied by 3600 but forgot the 1000 m in a kilometre' }, { m: 60, trap: 'multiplied by 60 only: that converts seconds to minutes' }],
    hint: '(3600 s in an hour, 1000 m in a km: multiply by 3.6.)',
    spread: 1e3,
  },
  {
    from: 'g/cm^3', to: 'kg/m^3',
    trapLine: 'Grams to kg divides by $10^{3}$ but cm³ to m³ divides by $10^{6}$, so the density is multiplied by $10^{3}$.', fromTex: '\\text{g cm}^{-3}', toTex: '\\text{kg m}^{-3}', words: 'in $\\text{kg m}^{-3}$', mult: 1e3,
    values: [0.7, 0.8, 0.9, 1.2, 1.5, 1.8, 2.2, 2.5, 2.7, 3.5, 4.5, 5.5, 7.8, 8.9, 11.3, 13.6, 19.3, 21.5], quantity: 'density',
    ctx: (v) => `A material has a density of $${v}\\ \\text{g cm}^{-3}$.`,
    wrong: [{ m: 1e-3, trap: 'divided by $10^{3}$ instead of multiplying' }, { m: 1e6, trap: 'used $10^{6}$ (the volume factor alone)' }, { m: 1e-6, trap: 'both conversions the wrong way round' }, { m: 1e9, trap: 'multiplied by $10^{3}$ and $10^{6}$ instead of dividing one by the other' }],
  },
  {
    from: 'kg/m^3', to: 'g/cm^3',
    trapLine: 'kg to g multiplies by $10^{3}$ but m³ to cm³ multiplies by $10^{6}$, so the density is divided by $10^{3}$.', fromTex: '\\text{kg m}^{-3}', toTex: '\\text{g cm}^{-3}', words: 'in $\\text{g cm}^{-3}$', mult: 1e-3,
    values: [700, 800, 900, 1030, 1200, 1500, 1800, 2200, 2500, 2700, 3500, 4500, 5500, 7800, 8900, 11300, 13600, 19300], quantity: 'density',
    ctx: (v) => `A material has a density of $${v}\\ \\text{kg m}^{-3}$.`,
    wrong: [{ m: 1e3, trap: 'multiplied by $10^{3}$ instead of dividing' }, { m: 1e-6, trap: 'used $10^{6}$ (the volume factor alone)' }, { m: 1e6, trap: 'both conversions the wrong way round' }, { m: 1e-9, trap: 'divided by $10^{3}$ and $10^{6}$ instead of one by the other' }],
  },
];

const LEVEL5_RECIPES: Recipe[] = [
  {
    from: 'L', to: 'm^3',
    trapLine: 'A litre is $10^{-3}\\ \\text{m}^{3}$ (that is $1000\\ \\text{cm}^{3}$), not $10^{-6}$.', fromTex: '\\text{L}', toTex: '\\text{m}^{3}', words: 'in $\\text{m}^{3}$', mult: 1e-3,
    values: [2, 5, 20, 40, 250, 500, 1500], quantity: 'volume',
    ctx: (v) => `A water tank holds $${v}\\ \\text{L}$ (litres).`,
    hint: '(1 litre is $1000\\ \\text{cm}^{3}$.)',
    wrong: [{ m: 1e-6, trap: 'used the cm³ factor: 1 litre is $10^{3}\\ \\text{cm}^{3}$' }, { m: 1e3, trap: 'multiplied instead of dividing' }, { m: 1e-2, trap: 'a factor of 10 out' }],
  },
  {
    from: 'ug', to: 'kg',
    trapLine: 'Two prefixes: micro is $10^{-6}$ and kilo is $10^{3}$, so µg to kg divides by $10^{9}$.', fromTex: '\\mu\\text{g}', toTex: '\\text{kg}', words: 'in kilograms', mult: 1e-9,
    values: [2, 5, 8, 20, 40, 50, 120, 250, 500], quantity: 'mass',
    ctx: (v) => `A speck of dust has a mass of $${v}\\ \\mu\\text{g}$.`,
    wrong: [{ m: 1e-6, trap: 'converted micrograms to grams and stopped' }, { m: 1e-12, trap: 'one conversion too many' }, { m: 1e-3, trap: 'converted micrograms to milligrams and stopped' }, { m: 1e9, trap: 'multiplied instead of dividing' }],
  },
  {
    from: 'kW h', to: 'J',
    trapLine: '$1\\ \\text{kW h} = 10^{3}\\ \\text{W} \\times 3600\\ \\text{s} = 3.6 \\times 10^{6}\\ \\text{J}$.', fromTex: '\\text{kW h}', toTex: '\\text{J}', words: 'in joules', mult: 3.6e6,
    values: [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8], quantity: 'energy',
    ctx: (v) => `An electricity meter records $${v}\\ \\text{kW h}$.`,
    wrong: [{ m: 3.6e3, trap: 'forgot to turn kilowatts into watts' }, { m: 1e3 * 60, trap: 'used 60 seconds in an hour' }, { m: 1e3, trap: 'treated one hour as one second' }, { m: 3.6e9, trap: 'read the kilowatt as a megawatt' }, { m: 2.16e8, trap: 'multiplied by 60 twice: an hour is 3600 s, not 3600 minutes' }],
  },
];

function recipeQ(rng: RNG, pool: Recipe[]): Generated | null {
  const r = rng.pick(pool);
  const v = rng.pick(r.values);
  const a = round(v * r.mult);
  const sf = fmtFor(a) === 'sf';
  return pack(rng, {
    stem: `${r.ctx(n(v), v)}\n\nGive this ${r.quantity} ${r.words}${sf ? ', in standard form' : ''}.`,
    answer: a,
    unit: r.toTex,
    must: r.wrong.slice(0, 2).map((w) => ({ value: round(v * w.m), trap: w.trap })),
    extra: [
      ...r.wrong.slice(2).map((w) => ({ value: round(v * w.m), trap: w.trap })),
      { value: v, trap: 'the number left unconverted' },
    ],
    solution: `$1\\ ${r.fromTex} = ${multTex(r.mult)}\\ ${r.toTex}$, so $${n(v)}\\ ${r.fromTex} = ${E(a).toLatex({ format: fmtFor(a) })}\\ ${r.toTex}$.${r.hint ? ` ${r.hint}` : ''}`,
    trap: r.trapLine,
    tags: ['units', 'prefixes', 'conversion'],
    params: { variant: 'convert', v, from: r.from, to: r.to },
    // 10^6, not the default 10^4: the headline trap of a conversion is the conversion applied the
    // wrong way round, which sits a factor of mult² from the answer. A narrower ladder would leave
    // the very mistake the question tests out of the option list. A recipe whose mistakes are closer
    // in than that says so itself.
    spread: r.spread ?? 1e6,
  });
}

// ----------------------------------------------------------------------------- level 4: compound quantities

/** Energy from a power and a time: a kW appliance running for hours. */
function energyQ(rng: RNG): Generated | null {
  const kw = rng.pick([0.5, 1, 1.5, 2, 2.5, 3, 5]);
  const hours = rng.pick([0.5, 1, 2, 3, 4, 5, 6]);
  const a = round(kw * 1e3 * hours * 3600);
  return pack(rng, {
    stem: `A heater rated at $${n(kw)}\\ \\text{kW}$ is switched on for $${n(hours)}$ hour${hours === 1 ? '' : 's'}.\n\nFind the energy it transfers, in joules, in standard form.`,
    answer: a,
    unit: '\\text{J}',
    must: [
      { value: round(kw * 1e3 * hours), trap: 'left the time in hours instead of seconds' },
      { value: round(kw * hours * 3600), trap: 'left the power in kilowatts' },
      { value: round(kw * 1e3 * hours * 60), trap: 'used 60 seconds in an hour' },
    ],
    extra: [
      { value: round(kw * 1e3 * hours * 60 * 60 * 60), trap: 'multiplied by 60 three times' },
      { value: round(a / 1e3), trap: 'gave the answer in kJ' },
    ],
    solution: `$E = Pt = (${n(kw)} \\times 10^{3}) \\times (${n(hours)} \\times 3600) = ${E(a).toLatex({ format: 'sf' })}\\ \\text{J}$.`,
    trap: 'Power must be in W and time in s: an hour is 3600 s, not 60 s.',
    tags: ['units', 'energy', 'standard form'],
    params: { variant: 'product', v1: kw, u1: 'kW', v2: hours, u2: 'h', to: 'J' },
    spread: 1e4,
  });
}

/** The period of a clock of a given frequency. */
function periodQ(rng: RNG): Generated | null {
  const f = rng.pick([2, 2.5, 4, 5]);
  const unit = rng.pick([['GHz', 1e9], ['MHz', 1e6]] as [string, number][]);
  const a = round(1 / (f * unit[1]));
  return pack(rng, {
    stem: `The clock of a processor runs at a frequency of $${n(f)}\\ \\text{${unit[0]}}$.\n\nFind the time for one clock cycle, in seconds, in standard form.`,
    answer: a,
    unit: '\\text{s}',
    must: [
      { value: round(1 / f), trap: 'ignored the prefix altogether' },
      { value: round(1 / (f * unit[1] * 1e3)), trap: 'a factor of $10^{3}$ too small' },
      { value: round(1 / (f * (unit[0] === 'GHz' ? 1e6 : 1e3))), trap: 'confused giga, mega and kilo' },
    ],
    extra: [
      { value: round(f / unit[1]), trap: 'multiplied by the frequency instead of dividing' },
      { value: round(a * 2), trap: 'arithmetic slip in the reciprocal' },
    ],
    solution: `$T = \\dfrac{1}{f} = \\dfrac{1}{${n(f)} \\times 10^{${unit[0] === 'GHz' ? 9 : 6}}} = ${E(a).toLatex({ format: 'sf' })}\\ \\text{s}$.`,
    trap: 'The period is 1/f with f in hertz: turn the prefix into a power of ten before taking the reciprocal.',
    tags: ['units', 'frequency', 'standard form'],
    params: { variant: 'reciprocal', v1: f, u1: unit[0], to: 's' },
    spread: 1e4,
  });
}

/** Charge from a current in mA flowing for a number of minutes. */
function chargeQ(rng: RNG): Generated | null {
  const ma = rng.pick([50, 100, 200, 250, 400, 500, 750]);
  const mins = rng.pick([2, 4, 5, 10, 12, 20, 30]);
  const a = round(ma * 1e-3 * mins * 60);
  if (a < 1 || a > 5000) return null;
  return pack(rng, {
    stem: `A steady current of $${n(ma)}\\ \\text{mA}$ flows for $${n(mins)}$ minutes.\n\nFind the charge that passes, in coulombs.`,
    answer: a,
    unit: '\\text{C}',
    must: [
      { value: round(ma * mins * 60), trap: 'left the current in milliamps' },
      { value: round(ma * 1e-3 * mins), trap: 'left the time in minutes' },
      { value: round(ma * 1e-3 * mins * 3600), trap: 'treated the minutes as hours' },
    ],
    extra: [
      { value: round((ma * 1e-6 * mins * 60)), trap: 'read milli as micro' },
      { value: round(a / 60), trap: 'divided by 60 instead of multiplying' },
    ],
    solution: `$Q = It = (${n(ma)} \\times 10^{-3}) \\times (${n(mins)} \\times 60) = ${E(a).toLatex({ format: fmtFor(a) })}\\ \\text{C}$.`,
    trap: 'Both quantities must be in SI units first: amps and seconds.',
    tags: ['units', 'charge', 'conversion'],
    params: { variant: 'product', v1: ma, u1: 'mA', v2: mins, u2: 'min', to: 'C' },
    spread: 1e4,
  });
}

// ----------------------------------------------------------------------------- level 5: powers and ratios

/** The area or volume of a cube/square whose side is given with a prefix. */
function powerOfUnitQ(rng: RNG): Generated | null {
  const p = rng.pick([2, 3]);
  const [sym, tex, mult] = rng.pick([['um', '\\mu\\text{m}', 1e-6], ['mm', '\\text{mm}', 1e-3], ['cm', '\\text{cm}', 1e-2]] as [string, string, number][]);
  const s = rng.pick([2, 3, 4, 5, 6]);
  const a = round(Math.pow(s * mult, p));
  if (a < 1e-12) return null;
  const shape = p === 2 ? 'square' : 'cube';
  return pack(rng, {
    stem: `A ${shape} has sides of length $${n(s)}\\ ${tex}$.\n\nFind its ${p === 2 ? 'area' : 'volume'} in $\\text{m}^{${p}}$, in standard form.`,
    answer: a,
    unit: `\\text{m}^{${p}}`,
    must: [
      { value: round(Math.pow(s, p) * mult), trap: `the prefix converted once instead of ${p} times` },
      { value: round(s * Math.pow(mult, p)), trap: 'forgot to raise the number itself to the power' },
      { value: round(Math.pow(s * mult, p) * Math.pow(10, p)), trap: 'a power of ten short in the prefix' },
    ],
    extra: [
      { value: round(Math.pow(s * mult, p) / Math.pow(10, p)), trap: 'a power of ten too many in the prefix' },
      { value: round(p * s * mult), trap: 'multiplied by the power instead of raising to it' },
    ],
    solution: `$${n(s)}\\ ${tex} = ${E(round(s * mult)).toLatex({ format: 'sf' })}\\ \\text{m}$, so the ${p === 2 ? 'area' : 'volume'} is $(${E(round(s * mult)).toLatex({ format: 'sf' })})^{${p}} = ${E(a).toLatex({ format: 'sf' })}\\ \\text{m}^{${p}}$.`,
    trap: `Raising a prefixed unit to a power raises its power of ten too: $(10^{${Math.round(Math.log10(mult))}})^{${p}} = 10^{${Math.round(Math.log10(mult)) * p}}$, not $10^{${Math.round(Math.log10(mult))}}$.`,
    tags: ['units', 'prefixes', 'powers'],
    params: { variant: 'convert', v: s, from: sym, to: 'm', pow: p, toPow: `m^${p}` },
    spread: 1e6, // the "prefix converted once instead of p times" trap is a factor of 10^4 or more away
  });
}

/** Density in kg m^-3 from a mass in grams and a volume in cm³. */
function densityQ(rng: RNG): Generated | null {
  const gPerCm3 = rng.pick([0.8, 1.2, 2.5, 2.7, 4, 5, 7.8, 8]);
  const vCm3 = rng.pick([20, 25, 40, 50, 100, 200, 250, 400, 500]);
  const mG = round(gPerCm3 * vCm3);
  const a = round(gPerCm3 * 1e3);
  if (!Number.isInteger(mG * 10)) return null;
  return pack(rng, {
    stem: `A sample of mass $${n(mG)}\\ \\text{g}$ has a volume of $${n(vCm3)}\\ \\text{cm}^{3}$.\n\nFind its density in $\\text{kg m}^{-3}$.`,
    answer: a,
    unit: '\\text{kg m}^{-3}',
    must: [
      { value: gPerCm3, trap: 'gave the density in $\\text{g cm}^{-3}$' },
      { value: round(gPerCm3 / 1e3), trap: 'converted the mass but not the volume' },
      { value: round(gPerCm3 * 1e6), trap: 'converted the volume but not the mass' },
    ],
    extra: [
      { value: round(vCm3 / mG), trap: 'volume divided by mass' },
      { value: round(mG * vCm3), trap: 'multiplied instead of dividing' },
    ],
    solution: `$\\dfrac{${n(mG)}\\ \\text{g}}{${n(vCm3)}\\ \\text{cm}^{3}} = ${n(gPerCm3)}\\ \\text{g cm}^{-3}$, and $1\\ \\text{g cm}^{-3} = 10^{3}\\ \\text{kg m}^{-3}$, so the density is $${n(a)}\\ \\text{kg m}^{-3}$.`,
    trap: 'Grams → kg divides by 10³ and cm³ → m³ divides by 10⁶, so the density is multiplied by 10³ overall.',
    tags: ['units', 'density', 'conversion'],
    params: { variant: 'ratio', v1: mG, u1: 'g', v2: vCm3, u2: 'cm^3', to: 'kg/m^3' },
    spread: 1e6, // the g cm^-3 and "volume converted but not the mass" traps are 10^3 and 10^6 away
  });
}

// ----------------------------------------------------------------------------- assembly

const VARIANTS: Record<Level, ((rng: RNG) => Generated | null)[]> = {
  1: [(r) => recipeQ(r, LEVEL1)],
  2: [(r) => recipeQ(r, LEVEL2)],
  3: [(r) => recipeQ(r, LEVEL3)],
  4: [energyQ, periodQ, chargeQ],
  5: [powerOfUnitQ, powerOfUnitQ, densityQ, (r) => recipeQ(r, LEVEL5_RECIPES)],
};

const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(b), 1e-30);

export default defineTemplate({
  id: 'phy.units.prefixes',
  module: 'PHY',
  topic: 'units',
  title: 'SI prefixes and unit conversions',
  levels: {
    1: 'one prefix: km → m, cm → m, mA → A, MW → W, µs → s, ms → s, GHz → Hz',
    2: 'squared and cubed units: cm² → m² (÷10⁴), cm³ → m³ (÷10⁶), m² → cm², mm → km',
    3: 'km/h ↔ m s⁻¹ and g cm⁻³ ↔ kg m⁻³',
    4: 'compound: a kW heater for hours in J, the period of a GHz clock, mA for minutes in C',
    5: '(3 µm)² and (2 mm)³, litres → m³, kW h → J, µg → kg, g and cm³ → kg m⁻³',
  },
  generate(rng, level: Level) {
    return retry(rng, () => pickVariant(rng, VARIANTS[level]));
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const a = q.answer.value.toNumber();
    if (!(a > 0) || !Number.isFinite(a)) return false;
    const p = q.params as Record<string, string | number> & { variant: string };
    const f = (u: unknown): number => factor(String(u));
    switch (p.variant) {
      case 'convert': {
        // (value in SI)^pow, then expressed in the target unit — all through the prefix table
        const pow = typeof p.pow === 'number' ? p.pow : 1;
        const si = Math.pow(Number(p.v) * f(p.from), pow);
        const target = f(p.toPow ?? p.to);
        if (!Number.isFinite(si) || !Number.isFinite(target) || target === 0) return false;
        return near(a, si / target);
      }
      case 'product': {
        const si = Number(p.v1) * f(p.u1) * Number(p.v2) * f(p.u2);
        const target = f(p.to);
        if (!Number.isFinite(si) || !Number.isFinite(target) || target === 0) return false;
        return near(a, si / target);
      }
      case 'ratio': {
        const si = (Number(p.v1) * f(p.u1)) / (Number(p.v2) * f(p.u2));
        const target = f(p.to);
        if (!Number.isFinite(si) || !Number.isFinite(target) || target === 0) return false;
        return near(a, si / target);
      }
      case 'reciprocal': {
        const si = 1 / (Number(p.v1) * f(p.u1));
        const target = f(p.to);
        if (!Number.isFinite(si) || !Number.isFinite(target) || target === 0) return false;
        return near(a, si / target);
      }
    }
    return false;
  },
});
