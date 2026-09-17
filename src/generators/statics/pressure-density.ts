import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, Exact } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import type { RNG } from '../../core/rng';

/**
 * Pressure, density and upthrust (g = 10 m s^-2, water 1000 kg m^-3, atmospheric pressure 100 kPa).
 * Level 1: ρ = m/V and p = F/A, with cm³ → m³ and cm² → m² conversions kept to powers of ten
 * Level 2: p = ρgh at a stated depth, answer in kPa
 * Level 3: total pressure = atmospheric + ρgh (the stem always says which is wanted); force = pressure × area
 * Level 4: upthrust = ρ_fluid V g; floating: fraction submerged = ρ_object / ρ_fluid; apparent weight in water
 * Level 5: hydraulic press — two steps every time (weight then area ratio, or the areas and then the
 *          energy conservation that fixes how far the load moves); the density of an alloy
 *
 * Every distractor is a named mistake: a wrong power of ten in a conversion, the ratio upside down,
 * g left out, atmospheric pressure added or subtracted when the stem asked for the other one, the force
 * given instead of the pressure. Two rules keep the option list exam-like: a candidate must be printable
 * to the precision of the answer itself (no 23.996 N next to 24 N), and the whole list must span at most
 * `spread`, so no option can be struck out on size alone. When fewer than four survive, pack() returns
 * null and the parameters are redrawn — the list is never padded with "half the answer".
 *
 * verify() never repeats the arithmetic of generate(): it re-derives the answer in SI base units by a
 * different route — the weight of a column of liquid built up slice by slice (and the pressure at a
 * second depth), the weight of the displaced fluid, the pressure under each piston of the press with the
 * areas in m², the work done on each piston, or the total mass of an alloy in grams per cm³ — and never
 * compares the answer with a number generate() stored for it.
 */

const U_PA = '\\text{Pa}', U_KPA = '\\text{kPa}', U_N = '\\text{N}', U_KG = '\\text{kg}';
const U_RHO = '\\text{kg m}^{-3}', U_CM = '\\text{cm}', U_J = '\\text{J}';
const G = 10;
const P_ATM = 100; // kPa

const n = (x: number): string => (Number.isInteger(x) ? `${x}` : `${Number(x.toPrecision(10))}`);
const round = (x: number): number => Number(x.toPrecision(12));
const isMult = (v: number, step: number): boolean => Math.abs(v / step - Math.round(v / step)) < 1e-9;

type Cand = { value: number | null; trap: string };
type Fmt = 'decimal' | 'fraction' | 'sf';

/** The decimal step the answer is printed to: 20 → 1, 4.5 → 0.1, 0.25 → 0.01. */
function stepOf(a: number): number {
  for (let k = 0; k <= 5; k++) {
    const s = Math.pow(10, -k);
    if (isMult(a, s)) return s;
  }
  return 1e-5;
}

/**
 * Positive, exam-plausible distractors that pass the clean-number rule.
 *
 * An option must round to (at worst) one more decimal place than the answer itself, so a "mistake"
 * such as 23.996 N — which no exam would print, and which sits 0.02% from another option — is dropped
 * instead of being offered. A rung of the answer's own power-of-ten ladder is exempt: 0.016 kg beside
 * 1.6 kg is the same number with the point moved, and those rungs are exactly the named conversion
 * mistakes these questions are built from.
 */
function cleanOnly(ds: Cand[], a: number): Distractor[] {
  const step = stepOf(a) / 10;
  const ladder = (v: number): boolean => {
    const e = Math.log10(v / a);
    return Math.abs(e - Math.round(e)) < 1e-9;
  };
  const out: Distractor[] = [];
  for (const d of ds) {
    if (d.value === null || !Number.isFinite(d.value) || d.value <= 0) continue;
    const v = round(d.value);
    if (v > 1e9 || v < 1e-9) continue;
    if (!isMult(v, step) && !ladder(v)) continue;
    let ex: Exact;
    try { ex = E(v); } catch { continue; }
    if (!isCleanExact(ex).ok) continue;
    out.push({ value: ex, trap: d.trap });
  }
  return out;
}

/**
 * How many of the options should sit below the answer, chosen from the splits `feasible` says the
 * candidate mistakes can actually supply. The part of the sorted list the answer lands in — near the
 * bottom, in the middle, near the top — is drawn uniformly first, so a candidate who recognises the
 * variant learns nothing from where the correct option sits. When every mistake falls on one side
 * there is nothing to choose and the answer sits where the mathematics puts it.
 */
function belowCount(rng: RNG, feasible: number[], count: number): number {
  const third = (k: number) => (2 * k < count ? 0 : 2 * k > count ? 2 : 1);
  const part = rng.pick([...new Set(feasible.map(third))]);
  return rng.pick(feasible.filter((k) => third(k) === part));
}

/**
 * `must` traps get their slot first, nearest the answer first; the extras follow in random order.
 * Three rules decide what may join the list:
 *  · the whole list — the answer and everything chosen — may span at most `spread`, because an option
 *    orders of magnitude from the answer is struck out on sight, which turns a five-option question
 *    into a three-option one. The width is **reserved**, not handed out first come first served:
 *    before an option is taken, the room the other side of the answer still needs to fill its share
 *    is set aside. Letting the first picks eat the whole window is what made the level-1 density
 *    answer the largest of the five every time — ρ/1000 and ρ/100 used all of it, so ρ×10 could
 *    never be added and nothing above the answer was ever offered;
 *  · no option may sit within 2% of another (or of the answer): a pair a candidate cannot tell apart
 *    is a wasted slot, and it makes the question turn on arithmetic no one would do in 90 seconds;
 *  · the number of options *below* the answer is drawn uniformly from the splits the candidates can
 *    actually supply inside that window, and is then enforced. Whole families of mistakes here sit on
 *    one side by construction — every "forgot a piece" slip is smaller than p₀ + ρgh, everything but
 *    "left g out" is bigger than ρVg — so without this the answer sits in the same slot in every
 *    instance of a variant and can be picked out without doing any physics.
 * A draw the candidates cannot fill comes back short and pack() redraws the parameters.
 */
function ranked(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], spread: number, count = 4): Distractor[] {
  const a = answer.toNumber();
  const cap = spread * (1 + 1e-9);
  const ratio = (v: number) => (v > a ? v / a : a / v);
  const closest = (x: Distractor) => Math.abs(Math.log(x.value.toNumber() / a));
  const ordered = [...must.slice().sort((x, y) => closest(x) - closest(y)), ...rng.shuffle(extra)];
  // One candidate per distinct value, and only values that could stand next to the answer at all.
  const pool: Distractor[] = [];
  for (const d of ordered) {
    const v = d.value.toNumber();
    if (!(v > 0) || ratio(v) > cap) continue;
    if ([a, ...pool.map((o) => o.value.toNumber())].some((x) => Math.abs(v - x) < 0.02 * Math.max(v, x))) continue;
    pool.push(d);
  }
  const side = (d: Distractor) => (d.value.toNumber() < a ? 0 : 1);
  const byRatio = (ds: Distractor[]) => ds.slice().sort((x, y) => ratio(x.value.toNumber()) - ratio(y.value.toNumber()));
  const left = [byRatio(pool.filter((d) => side(d) === 0)), byRatio(pool.filter((d) => side(d) === 1))];
  /** The narrowest list possible with k options below the answer: the k and count−k nearest. */
  const width = (k: number): number => {
    if (k > left[0].length || count - k > left[1].length) return Infinity;
    const edge = (s: number, j: number) => (j > 0 ? ratio(left[s][j - 1].value.toNumber()) : 1);
    return edge(0, k) * edge(1, count - k);
  };
  const feasible: number[] = [];
  for (let k = 0; k <= count; k++) if (width(k) <= cap) feasible.push(k);
  if (!feasible.length) return [];
  const nBelow = belowCount(rng, feasible, count);
  const quota = [nBelow, count - nBelow];
  const taken: Distractor[][] = [[], []];
  const reach = [1, 1];
  /** How far the other side must still be allowed to reach to fill what is left of its share. */
  const stillNeeded = (s: number): number => {
    const k = quota[s] - taken[s].length;
    if (k <= 0) return 1;
    return left[s].length >= k ? ratio(left[s][k - 1].value.toNumber()) : Infinity;
  };
  const tryTake = (d: Distractor): void => {
    const s = side(d);
    const at = left[s].indexOf(d);
    if (at < 0 || taken[s].length >= quota[s]) return; // already used, or this side is full
    const r = Math.max(reach[s], ratio(d.value.toNumber()));
    if (r * Math.max(reach[1 - s], stillNeeded(1 - s)) > cap) return;
    left[s].splice(at, 1);
    taken[s].push(d);
    reach[s] = r;
  };
  // Two passes: a candidate the reservation turned away may fit once the other side is settled.
  for (const d of pool) tryTake(d);
  for (const d of pool) tryTake(d);
  return [...taken[0], ...taken[1]];
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
  unit?: string;
  format?: Fmt;
  must: Cand[];
  extra: Cand[];
  solution: string;
  trap: string;
  tags: string[];
  params: Record<string, unknown>;
  /** how many times the largest option may be bigger than the smallest (default 30) */
  spread?: number;
}

function pack(rng: RNG, p: Pack): Generated | null {
  const a = round(p.answer);
  if (!(a > 0) || !Number.isFinite(a)) return null;
  let value: Exact;
  try { value = E(a); } catch { return null; }
  if (!isCleanExact(value).ok) return null;
  const format = p.format ?? 'decimal';
  const ds = ranked(rng, value, cleanOnly(p.must, a), cleanOnly(p.extra, a), p.spread ?? 30);
  if (ds.length < 4) return null; // never pad: redraw instead
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

// ----------------------------------------------------------------------------- level 1

const DENSITIES = [600, 800, 1200, 1500, 2000, 2500, 2700, 4000, 5000, 6000, 7000, 8000, 9000];

/** ρ = m/V with the volume in cm³. */
function densityQ(rng: RNG): Generated | null {
  const rho = rng.pick(DENSITIES);
  const vCm3 = rng.pick([100, 200, 250, 300, 400, 500, 600, 800, 1000, 1200, 1500, 2000, 2500]);
  const mKg = round((rho * vCm3) / 1e6);
  if (mKg < 0.2 || mKg > 30 || !isMult(mKg, 0.01)) return null;
  const material = rng.pick(['a block of metal', 'a machine part', 'a sample of rock', 'a solid cylinder']);
  return pack(rng, {
    stem: `${material.charAt(0).toUpperCase()}${material.slice(1)} has a mass of $${n(mKg)}\\ \\text{kg}$ and a volume of $${n(vCm3)}\\ \\text{cm}^{3}$.\n\nFind its density in $\\text{kg m}^{-3}$.`,
    answer: rho,
    unit: U_RHO,
    must: [
      { value: rho / 1000, trap: 'divided by $10^{3}$ instead of $10^{6}$ (cm³ treated as litres)' },
      { value: rho / 100, trap: 'used the area factor $10^{4}$ instead of the volume factor $10^{6}$' },
    ],
    // Every conversion slip in the obvious direction undershoots, and with only undershoots on offer
    // the answer was the largest of the five in every question. The overshoots are the same ladder
    // read the other way, which is just as easy a slip to make.
    extra: [
      { value: rho / 10, trap: 'a power of ten lost in the conversion' },
      { value: rho * 10, trap: 'a power of ten gained in the conversion' },
      { value: rho * 100, trap: 'two powers of ten gained in the conversion' },
      { value: rho * 1000, trap: 'gave the density in $\\text{g m}^{-3}$: the mass was turned into grams as well' },
      { value: vCm3 / mKg, trap: 'volume divided by mass instead of mass by volume' },
      { value: mKg * vCm3, trap: 'multiplied the mass by the volume instead of dividing' },
    ],
    solution: `$${n(vCm3)}\\ \\text{cm}^{3} = ${n(vCm3)} \\times 10^{-6}\\ \\text{m}^{3}$, so $\\rho = \\dfrac{${n(mKg)}}{${n(vCm3)} \\times 10^{-6}} = ${n(rho)}\\ \\text{kg m}^{-3}$.`,
    trap: '1 m³ is 10⁶ cm³, not 10³: dividing by the wrong power of ten is the whole question.',
    tags: ['density', 'units'],
    params: { variant: 'density', rho, vCm3, mKg },
    // A conversion question's options are a power-of-ten ladder, and the mistakes it is built from
    // reach 10³ from the answer, so the ladder has to be about that long on both sides of it.
    spread: 2000,
  });
}

/** p = F/A, area often in cm². */
function pressureQ(rng: RNG): Generated | null {
  const cm2 = rng.bool(0.5);
  const aCm2 = rng.pick([20, 25, 40, 50, 80, 100, 200, 250, 400, 500]);
  const aM2 = cm2 ? round(aCm2 / 1e4) : rng.pick([0.01, 0.02, 0.04, 0.05, 0.1, 0.2, 0.25, 0.5, 2, 4]);
  const F = rng.pick([20, 25, 30, 40, 50, 60, 80, 100, 120, 150, 200, 240, 300, 400, 500, 600]);
  const p = round(F / aM2);
  if (p < 20 || p > 500000 || !isMult(p, 1)) return null;
  const area = cm2 ? `$${n(aCm2)}\\ \\text{cm}^{2}$` : `$${n(aM2)}\\ \\text{m}^{2}$`;
  return pack(rng, {
    stem: `A force of $${n(F)}\\ \\text{N}$ presses evenly on a flat surface of area ${area}.\n\nFind the pressure on the surface, in pascals.`,
    answer: p,
    unit: U_PA,
    must: cm2
      ? [
          { value: F / aCm2, trap: 'used the area in cm² without converting to m²' },
          { value: (F * 100) / aCm2, trap: 'converted the area with $10^{2}$ instead of $10^{4}$' },
        ]
      : [
          { value: F, trap: 'gave the force: the area was never used' },
          { value: F * aM2, trap: 'multiplied by the area instead of dividing' },
          { value: aM2 / F, trap: 'divided the area by the force' },
        ],
    // As in densityQ: the conversion slips all undershoot, so the same ladder is offered above the
    // answer too, otherwise the correct option is simply the biggest number on the page.
    extra: cm2
      ? [
          { value: p / 1000, trap: 'gave the pressure in kPa, not Pa' },
          { value: F * aCm2, trap: 'multiplied by the area in cm² instead of dividing' },
          { value: p / 10, trap: 'a power of ten lost in the conversion' },
          { value: p * 10, trap: 'a power of ten gained in the conversion' },
          { value: p * 100, trap: 'two powers of ten gained in the conversion' },
          { value: p * 1e4, trap: 'applied the $10^{4}$ conversion twice' },
        ]
      : [
          { value: p / 10, trap: 'a decimal point slipped in the area' },
          { value: p * 10, trap: 'a decimal point slipped in the area the other way' },
          { value: p / 100, trap: 'the decimal point in the area two places out' },
          { value: p * 100, trap: 'the decimal point in the area two places out the other way' },
          { value: p / 1000, trap: 'gave the pressure in kPa, not Pa' },
          { value: F / (aM2 * 1e4), trap: 'treated the area as cm² and divided by $10^{4}$ as well' },
        ],
    solution: `$p = \\dfrac{F}{A} = \\dfrac{${n(F)}}{${n(aM2)}} = ${n(p)}\\ \\text{Pa}$${cm2 ? ` (first $${n(aCm2)}\\ \\text{cm}^{2} = ${n(aM2)}\\ \\text{m}^{2}$)` : ''}.`,
    trap: cm2
      ? '1 m² is 10⁴ cm², so an area in cm² must be divided by 10⁴ before it goes under the force.'
      : 'Pressure is the force spread over the area: divide by the area, and dividing by a number less than 1 makes the answer bigger.',
    tags: ['pressure', 'units'],
    // verify() converts the area from the units the stem prints, so the conversion is really tested
    params: { variant: 'pressure', F, aShown: cm2 ? aCm2 : aM2, areaUnit: cm2 ? 'cm^2' : 'm^2' },
    spread: cm2 ? 1e4 : 1000,
  });
}

/** m = ρV. */
function massFromDensityQ(rng: RNG): Generated | null {
  const rho = rng.pick(DENSITIES);
  const vCm3 = rng.pick([200, 250, 400, 500, 800, 1000, 1500, 2000, 2500, 4000, 5000]);
  const mKg = round((rho * vCm3) / 1e6);
  if (mKg < 0.5 || mKg > 40 || !isMult(mKg, 0.1)) return null;
  return pack(rng, {
    stem: `A solid block has a volume of $${n(vCm3)}\\ \\text{cm}^{3}$ and is made of a material of density $${n(rho)}\\ \\text{kg m}^{-3}$.\n\nFind the mass of the block.`,
    answer: mKg,
    unit: U_KG,
    must: [
      { value: mKg * 1000, trap: 'converted cm³ with $10^{3}$ instead of $10^{6}$' },
      { value: mKg * 100, trap: 'used the area factor $10^{4}$ instead of the volume factor $10^{6}$' },
    ],
    // Mirror of densityQ: both headline traps overshoot, so the ladder is offered below the answer
    // as well and the correct option is not simply the smallest number on the page.
    extra: [
      { value: rho / vCm3, trap: 'divided the density by the volume' },
      { value: mKg / 10, trap: 'a power of ten lost in the conversion' },
      { value: mKg * 10, trap: 'a power of ten gained in the conversion' },
      { value: mKg / 100, trap: 'two powers of ten lost in the conversion' },
      { value: mKg / 1000, trap: 'converted the volume with $10^{9}$ instead of $10^{6}$' },
    ],
    solution: `$m = \\rho V = ${n(rho)} \\times ${n(vCm3)} \\times 10^{-6} = ${n(mKg)}\\ \\text{kg}$.`,
    trap: 'The volume must be in m³ (÷10⁶) before it is multiplied by a density in kg m⁻³.',
    tags: ['density', 'mass', 'units'],
    params: { variant: 'mass-from-density', rho, vCm3 },
    spread: 2000,
  });
}

// ----------------------------------------------------------------------------- level 2

/**
 * A liquid needs two names: one that follows an article ("a tank of …", "the surface of …") and a bare
 * noun for "the … alone" / "a column of …". Storing only "a liquid" produced "the a liquid".
 */
interface Fluid { a: string; bare: string; rho: number }

const FLUIDS: Fluid[] = [
  { a: 'water', bare: 'water', rho: 1000 },
  { a: 'sea water', bare: 'sea water', rho: 1200 },
  { a: 'oil', bare: 'oil', rho: 800 },
  { a: 'paraffin', bare: 'paraffin', rho: 800 },
  { a: 'a liquid', bare: 'liquid', rho: 1500 },
];

/** p = ρgh, answered in kPa. */
function depthPressureQ(rng: RNG): Generated | null {
  const fluid = rng.pick(FLUIDS);
  const rho = fluid.rho;
  const h = rng.pick([2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50]);
  const pPa = rho * G * h;
  const pk = round(pPa / 1000);
  if (pk < 10 || pk > 600 || !isMult(pk, 0.5)) return null;
  return pack(rng, {
    stem: `A tank is filled with ${fluid.a} of density $${n(rho)}\\ \\text{kg m}^{-3}$. Take $g = 10\\ \\text{m s}^{-2}$.\n\nFind the pressure due to the ${fluid.bare} alone at a depth of $${n(h)}\\ \\text{m}$ below the surface, in kPa.`,
    answer: pk,
    unit: U_KPA,
    must: [
      { value: pk + P_ATM, trap: 'added atmospheric pressure, although only the liquid was asked for' },
      { value: (rho * h) / 1000, trap: 'left $g$ out of $\\rho g h$' },
    ],
    extra: [
      { value: pk * 10, trap: 'divided by $100$ instead of $1000$ turning Pa into kPa' },
      { value: pk / 2, trap: 'used $\\tfrac12 \\rho g h$' },
      { value: pk * 2, trap: 'took the pressure at twice the depth' },
      { value: (G * h) / 1000, trap: 'left the density out' },
      { value: pk - P_ATM, trap: 'subtracted atmospheric pressure, although only the liquid was asked for' },
      { value: pk / 5, trap: 'used $g = 2$ instead of $10$' },
      { value: pk * 100, trap: 'divided by $10$ instead of $1000$ turning Pa into kPa' },
      { value: rho === 1000 ? null : (1000 * G * h) / 1000, trap: 'used the density of water instead of the density given' },
    ],
    solution: `$p = \\rho g h = ${n(rho)} \\times 10 \\times ${n(h)} = ${n(pPa)}\\ \\text{Pa} = ${n(pk)}\\ \\text{kPa}$.`,
    trap: 'ρgh needs all three factors and the depth in metres; the question asks for the liquid’s pressure only, so atmospheric pressure is not added.',
    tags: ['pressure', 'depth', 'fluids'],
    params: { variant: 'rho-g-h', rho, h },
    spread: 200,
  });
}

/** The depth at which the liquid pressure reaches a stated value: h = p/(ρg). */
function depthFromPressureQ(rng: RNG): Generated | null {
  const fluid = rng.pick(FLUIDS);
  const rho = fluid.rho;
  const h = rng.pick([2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30]);
  const pk = round((rho * G * h) / 1000);
  if (pk < 10 || pk > 400 || !isMult(pk, 0.5)) return null;
  return pack(rng, {
    stem: `The pressure due to a column of ${fluid.bare} of density $${n(rho)}\\ \\text{kg m}^{-3}$ is $${n(pk)}\\ \\text{kPa}$. Take $g = 10\\ \\text{m s}^{-2}$.\n\nFind the depth below the surface at which this pressure occurs.`,
    answer: h,
    unit: '\\text{m}',
    must: [
      { value: round((pk * 1000) / rho), trap: 'left $g$ out, dividing by ρ only' },
      { value: round(((pk + P_ATM) * 1000) / (rho * G)), trap: 'added atmospheric pressure, although the stem already gives the liquid’s pressure' },
      { value: round(((pk - P_ATM) * 1000) / (rho * G)), trap: 'subtracted atmospheric pressure, although the stem gives the liquid’s pressure' },
    ],
    extra: [
      { value: round(h * 10), trap: 'a power of ten gained turning kPa into Pa' },
      { value: round(h / 10), trap: 'a power of ten lost turning kPa into Pa' },
      { value: round(h * 2), trap: 'doubled the depth' },
      { value: round((pk * 1000 * G) / rho), trap: 'multiplied by $g$ instead of dividing by it' },
      { value: round(pk / (rho * G)), trap: 'used the pressure in kPa instead of Pa' },
      { value: round(h / 2), trap: 'used $\\tfrac12 \\rho g h$' },
      // the depth comes out of a division, so every "forgot a factor" slip overshoots; this one lands
      // on either side depending on the liquid, which keeps the answer off the bottom of the list
      { value: rho === 1000 ? null : round((pk * 1000) / (1000 * G)), trap: 'used the density of water instead of the density given' },
    ],
    solution: `$h = \\dfrac{p}{\\rho g} = \\dfrac{${n(pk * 1000)}}{${n(rho)} \\times 10} = ${n(h)}\\ \\text{m}$ (the pressure must be in Pa first).`,
    trap: 'Divide by ρg, not by ρ alone, and turn kPa into Pa before dividing.',
    tags: ['pressure', 'depth', 'fluids'],
    params: { variant: 'depth-from-pressure', rho, pk },
    spread: 200,
  });
}

// ----------------------------------------------------------------------------- level 3

/** Total pressure at depth = atmospheric + ρgh. */
function totalPressureQ(rng: RNG): Generated | null {
  const fluid = rng.pick(FLUIDS);
  const rho = fluid.rho;
  const h = rng.pick([5, 8, 10, 12, 15, 20, 25, 30, 40, 50]);
  const pk = round((rho * G * h) / 1000);
  const total = round(pk + P_ATM);
  if (pk < 20 || total > 800 || !isMult(total, 0.5)) return null;
  return pack(rng, {
    stem: `A diver is $${n(h)}\\ \\text{m}$ below the surface of ${fluid.a} of density $${n(rho)}\\ \\text{kg m}^{-3}$. Atmospheric pressure at the surface is $100\\ \\text{kPa}$ and $g = 10\\ \\text{m s}^{-2}$.\n\nFind the total pressure on the diver, in kPa.`,
    answer: total,
    unit: U_KPA,
    must: [
      { value: pk, trap: 'gave the pressure of the liquid only, forgetting atmospheric pressure' },
      { value: round((rho * h) / 1000 + P_ATM), trap: 'left $g$ out of $\\rho g h$' },
      { value: round(pk - P_ATM), trap: 'subtracted atmospheric pressure instead of adding it' },
    ],
    // Every "forgot a piece" mistake is necessarily smaller than p₀ + ρgh, so the overshoots below are
    // what keep the answer out of the top two slots.
    extra: [
      { value: round(pk / 2 + P_ATM), trap: 'used $\\tfrac12 \\rho g h$' },
      { value: round(2 * pk + P_ATM), trap: 'took the pressure at twice the depth' },
      { value: round(P_ATM - pk), trap: 'took the liquid’s pressure away from atmospheric pressure' },
      { value: round(10 * pk + P_ATM), trap: 'a power of ten lost turning the liquid’s pressure into kPa' },
      { value: round(pk + 10 * P_ATM), trap: 'used $1000\\ \\text{kPa}$ for atmospheric pressure' },
      { value: round(pk + 2 * P_ATM), trap: 'added atmospheric pressure twice, at the surface and again at the diver' },
    ],
    solution: `Liquid: $\\rho g h = ${n(rho)} \\times 10 \\times ${n(h)} = ${n(pk * 1000)}\\ \\text{Pa} = ${n(pk)}\\ \\text{kPa}$. Total $= 100 + ${n(pk)} = ${n(total)}\\ \\text{kPa}$.`,
    trap: 'Total pressure includes the atmosphere pressing on the surface: p = p₀ + ρgh.',
    tags: ['pressure', 'depth', 'atmospheric'],
    params: { variant: 'total-pressure', rho, h },
    spread: 40,
  });
}

/** Force on a submerged surface from the pressure of the liquid. */
function forceOnSurfaceQ(rng: RNG): Generated | null {
  const fluid = rng.pick(FLUIDS);
  const rho = fluid.rho;
  const h = rng.pick([2, 3, 4, 5, 6, 8, 10, 12, 15, 20]);
  const A = rng.pick([0.02, 0.05, 0.1, 0.2, 0.25, 0.4, 0.5, 1, 2]);
  const p = rho * G * h;
  const F = round(p * A);
  if (F < 100 || F > 200000 || !isMult(F, 1)) return null;
  const what = rng.pick(['a circular window', 'an inspection panel', 'a flat hatch']);
  return pack(rng, {
    stem: `${what.charAt(0).toUpperCase()}${what.slice(1)} of area $${n(A)}\\ \\text{m}^{2}$ is set into the side of a tank of ${fluid.bare} of density $${n(rho)}\\ \\text{kg m}^{-3}$, at an average depth of $${n(h)}\\ \\text{m}$. Take $g = 10\\ \\text{m s}^{-2}$.\n\nFind the force on it due to the pressure of the ${fluid.bare} alone.`,
    answer: F,
    unit: U_N,
    must: [
      { value: p, trap: 'gave the pressure in Pa instead of the force' },
      { value: round(rho * h * A), trap: 'left $g$ out of $\\rho g h$' },
      { value: round(p / A), trap: 'divided by the area instead of multiplying' },
    ],
    extra: [
      { value: round((p + 100000) * A), trap: 'included atmospheric pressure, although only the liquid was asked for' },
      { value: round(rho * G * (h / 2) * A), trap: 'used half the depth, although the average depth was given' },
      { value: round(p * A * 2), trap: 'counted both faces of the panel' },
      { value: round(F / 10), trap: 'a power of ten lost in the pressure' },
      { value: round(F * 10), trap: 'a power of ten gained in the pressure' },
      { value: rho === 1000 ? null : round(1000 * G * h * A), trap: 'used the density of water instead of the density given' },
    ],
    solution: `$p = \\rho g h = ${n(rho)} \\times 10 \\times ${n(h)} = ${n(p)}\\ \\text{Pa}$, so $F = pA = ${n(p)} \\times ${n(A)} = ${n(F)}\\ \\text{N}$.`,
    trap: 'Pressure is a force per unit area: multiply by the area (and only the liquid’s pressure is asked for here).',
    tags: ['pressure', 'force', 'fluids'],
    params: { variant: 'force-on-surface', rho, h, A },
    spread: 200,
  });
}

// ----------------------------------------------------------------------------- level 4

/** Upthrust on a fully submerged body. */
function upthrustQ(rng: RNG): Generated | null {
  const fluid = rng.pick(FLUIDS);
  const rho = fluid.rho;
  const vCm3 = rng.pick([200, 250, 400, 500, 800, 1000, 1200, 1500, 2000, 2500, 4000, 5000]);
  const V = round(vCm3 / 1e6);
  const U = round(rho * V * G);
  if (U < 1 || U > 100 || !isMult(U, 0.1)) return null;
  const rhoBody = rng.pick([7000, 8000, 9000].filter((r) => r > rho));
  return pack(rng, {
    stem: `A metal block of volume $${n(vCm3)}\\ \\text{cm}^{3}$ and density $${n(rhoBody)}\\ \\text{kg m}^{-3}$ is held completely submerged in ${fluid.a} of density $${n(rho)}\\ \\text{kg m}^{-3}$. Take $g = 10\\ \\text{m s}^{-2}$.\n\nFind the upthrust on the block.`,
    answer: U,
    unit: U_N,
    // The block is always denser than the liquid, so ρ_body·V·g, the apparent weight and twice the
    // difference all sit above ρ_liquid·V·g. Without the undercounts below, the only option under the
    // answer is "left g out" and "second smallest" answers the question.
    must: [
      { value: round(rhoBody * V * G), trap: 'used the block’s own density instead of the liquid’s' },
      { value: round(rho * V), trap: 'left $g$ out of $\\rho V g$' },
    ],
    extra: [
      { value: round(rhoBody * V * G - U), trap: 'gave the apparent weight instead of the upthrust' },
      { value: round((rhoBody - rho) * V * G * 2), trap: 'counted the difference in densities twice' },
      { value: round(U * 10), trap: 'a power of ten gained in the volume conversion' },
      { value: round(rho * (V / 2) * G), trap: 'used half the volume, as if only half the block displaced liquid' },
      { value: round((rho * V) / G), trap: 'divided by $g$ instead of multiplying by it' },
      { value: round(rho * V * G * (rho / rhoBody)), trap: 'multiplied by the ratio of the densities as well' },
    ],
    solution: `Upthrust $=$ weight of liquid displaced $= \\rho_{\\text{liquid}} V g = ${n(rho)} \\times ${n(vCm3)} \\times 10^{-6} \\times 10 = ${n(U)}\\ \\text{N}$.`,
    trap: 'The upthrust uses the density of the fluid displaced, never the density of the object.',
    tags: ['upthrust', 'archimedes', 'fluids'],
    params: { variant: 'upthrust', rho, vCm3 },
    spread: 200,
  });
}

/** Fraction of a floating body's volume that is submerged. */
function fractionSubmergedQ(rng: RNG): Generated | null {
  const rhoF = rng.pick([1000, 1000, 1200, 800]);
  const f = rng.pick([0.2, 0.25, 0.4, 0.5, 0.6, 0.75, 0.8, 0.9]);
  const rhoB = round(f * rhoF);
  if (!isMult(rhoB, 25) || rhoB < 100) return null;
  return pack(rng, {
    stem: `A block of wood of density $${n(rhoB)}\\ \\text{kg m}^{-3}$ floats in a liquid of density $${n(rhoF)}\\ \\text{kg m}^{-3}$.\n\nWhat fraction of the block’s volume is below the surface?`,
    answer: f,
    format: 'fraction',
    // A fraction of a volume cannot exceed 1, and the trap line says so, so exactly one option is
    // allowed above 1: the classic inverted ratio the question is built around. Everything else here
    // is a fraction of the block, which is what makes it worth reading.
    must: [
      { value: round(rhoF / rhoB), trap: 'the ratio of densities taken upside down' },
      { value: round(1 - f), trap: 'gave the fraction above the surface' },
      { value: round(rhoB / (rhoF + rhoB)), trap: 'divided by the total of the two densities instead of the liquid’s density' },
    ],
    extra: [
      { value: round((1 + f) / 2), trap: 'averaged the ratio with 1' },
      { value: round(f * f), trap: 'squared the ratio' },
      { value: round(f / 2), trap: 'halved the ratio' },
      { value: round((1 - f) / 2), trap: 'halved the fraction above the surface' },
      { value: 0.5, trap: 'assumed half of any floating body is submerged' },
    ],
    solution: `Floating: weight $=$ upthrust, so $\\rho_{\\text{block}} V g = \\rho_{\\text{liquid}} (fV) g$ and $f = \\dfrac{${n(rhoB)}}{${n(rhoF)}} = ${E(f).toLatex({ format: 'fraction' })}$.`,
    trap: 'The fraction submerged is the density of the body over the density of the liquid — the other way up gives a number bigger than 1.',
    tags: ['floating', 'upthrust', 'density'],
    params: { variant: 'fraction-submerged', rhoB, rhoF },
    spread: 12,
  });
}

/** Density of a floating body from the fraction submerged. */
function densityFromFloatQ(rng: RNG): Generated | null {
  const rhoF = rng.pick([1000, 1000, 1200, 800]);
  const f = rng.pick([0.2, 0.25, 0.4, 0.5, 0.6, 0.75, 0.8, 0.9]);
  const rhoB = round(f * rhoF);
  if (!isMult(rhoB, 25) || rhoB < 100) return null;
  const fr = E(f).toLatex({ format: 'fraction' });
  return pack(rng, {
    stem: `A block floats in a liquid of density $${n(rhoF)}\\ \\text{kg m}^{-3}$ with $${fr}$ of its volume below the surface.\n\nFind the density of the block.`,
    answer: rhoB,
    unit: U_RHO,
    must: [
      { value: round(rhoF / f), trap: 'divided by the fraction instead of multiplying' },
      { value: round((1 - f) * rhoF), trap: 'used the fraction above the surface' },
      { value: rhoF, trap: 'assumed a floating body has the density of the liquid' },
    ],
    // The block floats, so it is lighter than the liquid and every "used the liquid" slip overshoots:
    // the last two are the undershoots that keep the answer off the bottom of the sorted list.
    extra: [
      { value: round(rhoF * f * f), trap: 'squared the fraction' },
      { value: round(rhoF - rhoB), trap: 'subtracted instead of multiplying' },
      { value: round((rhoF * (1 + f)) / 2), trap: 'averaged the liquid’s density with the answer' },
      { value: round((rhoF * f) / 2), trap: 'halved the fraction submerged' },
      { value: round(rhoF * f * (1 - f)), trap: 'multiplied by the fraction above the surface as well' },
    ],
    solution: `Weight $=$ upthrust, so $\\rho_{\\text{block}} = ${fr} \\times ${n(rhoF)} = ${n(rhoB)}\\ \\text{kg m}^{-3}$.`,
    trap: 'A floating body’s density is the fraction submerged times the liquid’s density; dividing gives a body denser than the liquid, which would sink.',
    tags: ['floating', 'density', 'upthrust'],
    params: { variant: 'density-from-float', rhoF, f },
    spread: 12,
  });
}

/** Apparent weight of a submerged body on a spring balance. */
function apparentWeightQ(rng: RNG): Generated | null {
  const rho = 1000;
  const vCm3 = rng.pick([200, 250, 400, 500, 800, 1000, 1200, 1500, 2000]);
  const V = round(vCm3 / 1e6);
  const rhoB = rng.pick([2500, 2700, 4000, 5000, 6000, 7000, 8000, 9000]);
  const mKg = round(rhoB * V);
  const W = round(mKg * G);
  const U = round(rho * V * G);
  const app = round(W - U);
  if (!isMult(mKg, 0.1) || !isMult(app, 0.1) || app < 2 || W > 300) return null;
  return pack(rng, {
    stem: `A block of mass $${n(mKg)}\\ \\text{kg}$ and volume $${n(vCm3)}\\ \\text{cm}^{3}$ hangs from a spring balance and is lowered until it is completely under water of density $1000\\ \\text{kg m}^{-3}$. Take $g = 10\\ \\text{m s}^{-2}$.\n\nFind the new reading of the balance.`,
    answer: app,
    unit: U_N,
    must: [
      { value: W, trap: 'forgot the upthrust: that is the weight in air' },
      { value: U, trap: 'gave the upthrust instead of the reading' },
      { value: round(W + U), trap: 'added the upthrust instead of subtracting it' },
    ],
    extra: [
      { value: round(mKg - U), trap: 'mixed a mass in kg with a force in N' },
      { value: round(app / G), trap: 'gave the apparent mass in kg, not the reading in N' },
      { value: round(W - 2 * U), trap: 'subtracted the upthrust twice' },
      { value: round(W / 2), trap: 'assumed water halves the reading' },
      // the block is always denser than water, so W, U and W − 2U all undershoot or sit just under the
      // reading; these two are the overshoots that stop the answer being one of the bottom options
      { value: round(app * G), trap: 'multiplied the reading by $g$ a second time' },
      { value: round(W + 2 * U), trap: 'added the upthrust twice instead of subtracting it' },
    ],
    solution: `Weight $= ${n(mKg)} \\times 10 = ${n(W)}\\ \\text{N}$; upthrust $= 1000 \\times ${n(vCm3)} \\times 10^{-6} \\times 10 = ${n(U)}\\ \\text{N}$. Reading $= ${n(W)} - ${n(U)} = ${n(app)}\\ \\text{N}$.`,
    trap: 'Apparent weight = true weight − upthrust, and the upthrust uses the water’s density, not the block’s.',
    tags: ['upthrust', 'apparent weight', 'archimedes'],
    params: { variant: 'apparent-weight', vCm3, mKg },
    spread: 40,
  });
}

// ----------------------------------------------------------------------------- level 5

/**
 * Hydraulic press. Every version takes two steps: a weight and then the ratio of the areas, or the
 * ratio of the areas and then the energy conservation that fixes how far the load moves.
 */
function hydraulicQ(rng: RNG, ask: 'load' | 'rise' | 'work'): Generated | null {
  const a1 = rng.pick([2, 4, 5, 8, 10, 20, 25]);
  const k = rng.pick(ask === 'work' ? [4, 5, 8, 10, 20] : [4, 5, 8, 10, 20, 25, 40, 50]);
  const a2 = a1 * k;
  if (a2 > 2000) return null;
  const setup = `In a hydraulic press the small piston has cross-sectional area $${n(a1)}\\ \\text{cm}^{2}$ and the large piston has cross-sectional area $${n(a2)}\\ \\text{cm}^{2}$. The liquid in the press is incompressible.`;

  if (ask === 'load') {
    const mKg = rng.pick([20, 24, 25, 30, 40, 50, 60, 80, 100, 120, 150, 200, 240, 300, 400, 500]);
    const W2 = mKg * G;
    const F1 = round(W2 / k);
    if (!isMult(F1, 0.5) || F1 < 2 || F1 > 400) return null;
    return pack(rng, {
      stem: `${setup} A load of mass $${n(mKg)}\\ \\text{kg}$ rests on the large piston. Take $g = 10\\ \\text{m s}^{-2}$.\n\nFind the force that must be applied to the small piston to hold the load in place.`,
      answer: F1,
      unit: U_N,
      must: [
        { value: W2, trap: 'gave the weight of the load: the ratio of the areas was never used' },
        { value: round(mKg / k), trap: 'used the mass in kg instead of its weight in N' },
        { value: round(W2 * k), trap: 'the area ratio upside down: the small piston needs the smaller force' },
      ],
      extra: [
        { value: round(W2 / (k - 1)), trap: 'off by one in the ratio of the areas' },
        { value: round(W2 / (k + 1)), trap: 'off by one in the ratio of the areas the other way' },
        { value: round(W2 / a2), trap: 'divided by the large area instead of the ratio of the areas' },
        { value: mKg, trap: 'gave the mass of the load, not a force' },
      ],
      solution: `The load weighs $${n(mKg)} \\times 10 = ${n(W2)}\\ \\text{N}$. The pressure is the same under both pistons, so $F_1 = W \\times \\dfrac{A_1}{A_2} = \\dfrac{${n(W2)}}{${n(k)}} = ${n(F1)}\\ \\text{N}$.`,
      trap: 'Turn the mass into a weight first, then divide by the ratio of the areas — the small piston carries the smaller force.',
      tags: ['pressure', 'hydraulics'],
      params: { variant: 'hydraulic-load', a1, a2, mKg },
      spread: 120,
    });
  }

  if (ask === 'work') {
    const F1 = rng.pick([10, 12, 15, 20, 24, 25, 30, 40, 50, 60, 80, 100]);
    const d1 = rng.pick([2, 4, 5, 8, 10, 12, 15, 20, 25, 40, 50]);
    const d2 = round(d1 / k);
    const F2 = round(F1 * k);
    const work = round((F1 * d1) / 100);
    if (!isMult(d2, 0.1) || d2 < 0.2 || !isMult(work, 0.1) || work < 0.5 || work > 100) return null;
    return pack(rng, {
      stem: `${setup} A force of $${n(F1)}\\ \\text{N}$ pushes the small piston down $${n(d1)}\\ \\text{cm}$, and no energy is lost in the liquid.\n\nFind the work done on the load resting on the large piston.`,
      answer: work,
      unit: U_J,
      must: [
        { value: round(F1 * d1), trap: 'left the distance in centimetres' },
        { value: round((F2 * d1) / 100), trap: 'used the force on the large piston with the small piston’s distance' },
        { value: round((F1 * d2) / 100), trap: 'used the force on the small piston with the large piston’s distance' },
      ],
      // "multiplied the work by the area ratio" is the same number as the second must, and
      // "divided by 1000" is the same as the first extra: both used to be offered twice, which left
      // only two distinct overshoots and pinned the answer to the middle of the list.
      extra: [
        { value: round(work / 10), trap: 'a power of ten lost turning centimetres into metres' },
        { value: round(work * 10), trap: 'divided by $10$ instead of $100$' },
        { value: round(F1 * d2), trap: 'used the large piston’s distance, but in centimetres' },
        { value: round(work / 2), trap: 'used $\\tfrac12 Fd$, as for a spring' },
      ],
      solution: `The press multiplies force but not energy: the work done on the load is the work done on the small piston, $W = Fd = ${n(F1)} \\times ${n(d1 / 100)} = ${n(work)}\\ \\text{J}$. (Check: $F_2 = ${n(F2)}\\ \\text{N}$ and $d_2 = ${n(d2)}\\ \\text{cm}$, and $${n(F2)} \\times ${n(d2 / 100)} = ${n(work)}\\ \\text{J}$.)`,
      trap: 'A hydraulic press conserves energy: the large force moves through a proportionally smaller distance, so the work is the same on both sides — and centimetres must become metres.',
      tags: ['pressure', 'hydraulics', 'energy'],
      params: { variant: 'hydraulic-work', a1, a2, F1, d1 },
      spread: 150,
    });
  }

  const F1 = rng.pick([10, 12, 15, 20, 24, 25, 30, 40, 50, 60, 80, 100]);
  const W2 = round(F1 * k);
  const d1 = rng.pick([2, 4, 5, 8, 10, 12, 15, 20, 25, 40, 50]);
  const d2 = round(d1 / k);
  if (W2 > 5000 || !isMult(d2, 0.1) || d2 < 0.2) return null;
  return pack(rng, {
    stem: `A force of $${n(F1)}\\ \\text{N}$ applied to the small piston of a hydraulic press just supports a load of $${n(W2)}\\ \\text{N}$ on the large piston. The liquid is incompressible and no energy is lost.\n\nThe small piston is pushed down $${n(d1)}\\ \\text{cm}$. How far does the load rise?`,
    answer: d2,
    unit: U_CM,
    must: [
      { value: round(d1 * k), trap: 'the ratio of the forces upside down: the load rises less, not more' },
      { value: d1, trap: 'assumed both pistons move the same distance' },
      { value: round(d1 / (k - 1)), trap: 'off by one in the ratio of the forces' },
    ],
    // Dividing by the ratio is what makes the answer small, so nearly every slip overshoots: the last
    // two are the undershoots that stop the answer being the smallest option every time.
    extra: [
      { value: round(d1 / (k + 1)), trap: 'off by one in the ratio of the forces the other way' },
      { value: round(d2 * 10), trap: 'gave the answer in mm, not cm' },
      { value: round(d2 / 10), trap: 'a power of ten lost' },
      { value: round(d1 / 2), trap: 'halved the distance instead of dividing by the ratio of the forces' },
      { value: round(d1 / (k * k)), trap: 'divided by the ratio of the forces twice over' },
    ],
    solution: `The press cannot create energy, so $F_1 d_1 = W d_2$: the ratio of the forces is $${n(W2)} / ${n(F1)} = ${n(k)}$, so $d_2 = \\dfrac{${n(d1)}}{${n(k)}} = ${n(d2)}\\ \\text{cm}$.`,
    trap: 'Work in = work out: the load rises as many times less as its weight is times bigger than the applied force.',
    tags: ['pressure', 'hydraulics', 'energy'],
    params: { variant: 'hydraulic-rise', F1, W2, d1 },
    spread: 60,
  });
}

/** Density of an alloy made from two metals of known volume. */
function alloyQ(rng: RNG): Generated | null {
  const r1 = rng.pick([2000, 3000, 4000, 5000, 7000, 8000, 9000]);
  const r2 = rng.pick([2000, 3000, 4000, 5000, 7000, 8000, 9000].filter((r) => r !== r1));
  const v1 = rng.pick([100, 200, 300, 400, 500, 600]);
  const v2 = rng.pick([100, 200, 300, 400, 500, 600]);
  const rho = round((r1 * v1 + r2 * v2) / (v1 + v2));
  if (!isMult(rho, 50) || rho < 1000 || rho > 10000) return null;
  if (rho === (r1 + r2) / 2) return null; // the "average the densities" trap must be wrong
  return pack(rng, {
    stem: `An alloy is made by melting together $${n(v1)}\\ \\text{cm}^{3}$ of a metal of density $${n(r1)}\\ \\text{kg m}^{-3}$ and $${n(v2)}\\ \\text{cm}^{3}$ of a metal of density $${n(r2)}\\ \\text{kg m}^{-3}$. The total volume does not change.\n\nFind the density of the alloy.`,
    answer: rho,
    unit: U_RHO,
    must: [
      { value: round((r1 + r2) / 2), trap: 'averaged the two densities, ignoring the volumes' },
      { value: round((r1 * v2 + r2 * v1) / (v1 + v2)), trap: 'paired each density with the other metal’s volume' },
      { value: round(r1 + r2), trap: 'added the densities' },
    ],
    extra: [
      { value: round((r1 * v1 + r2 * v2) / 1000), trap: 'divided by 1000 instead of the total volume' },
      { value: Math.abs(r1 - r2), trap: 'subtracted the densities' },
      { value: Math.max(r1, r2), trap: 'took the denser metal’s density' },
      { value: Math.min(r1, r2), trap: 'took the lighter metal’s density' },
    ],
    solution: `Masses: $${n(r1 / 1000)} \\times ${n(v1)} + ${n(r2 / 1000)} \\times ${n(v2)} = ${n((r1 * v1 + r2 * v2) / 1000)}\\ \\text{g}$ in $${n(v1 + v2)}\\ \\text{cm}^{3}$, so $\\rho = ${n(rho / 1000)}\\ \\text{g cm}^{-3} = ${n(rho)}\\ \\text{kg m}^{-3}$.`,
    trap: 'Density is total mass ÷ total volume: averaging the two densities is only right when the volumes are equal.',
    tags: ['density', 'mixture'],
    params: { variant: 'alloy', r1, r2, v1, v2 },
    spread: 12,
  });
}

// ----------------------------------------------------------------------------- assembly

const VARIANTS: Record<Level, ((rng: RNG) => Generated | null)[]> = {
  1: [densityQ, pressureQ, massFromDensityQ],
  2: [depthPressureQ, depthPressureQ, depthFromPressureQ],
  3: [totalPressureQ, forceOnSurfaceQ],
  4: [upthrustQ, fractionSubmergedQ, densityFromFloatQ, apparentWeightQ],
  5: [(r) => hydraulicQ(r, 'load'), (r) => hydraulicQ(r, 'rise'), (r) => hydraulicQ(r, 'work'), alloyQ],
};

const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-7 * (1 + Math.abs(b));

/**
 * The pressure (Pa) a depth h of liquid exerts, built the long way round: the column standing on an
 * area A is added up slice by slice as a mass, turned into a weight and then spread back over A.
 * Nothing here is generate()'s ρgh product, and the area cancels only after the weight is accumulated.
 */
function columnPressure(rho: number, h: number): number {
  const A = 0.25, slices = 5;
  let mass = 0;
  for (let i = 0; i < slices; i++) mass += rho * A * (h / slices);
  return (mass * G) / A;
}

export default defineTemplate({
  id: 'phy.statics.pressure-density',
  module: 'PHY',
  topic: 'statics',
  title: 'Pressure, density and upthrust',
  levels: {
    1: 'ρ = m/V and p = F/A with cm³ → m³ and cm² → m² conversions',
    2: 'p = ρgh at a stated depth (water 1000 kg m⁻³, g = 10), answer in kPa',
    3: 'total pressure = 100 kPa + ρgh; the force on a submerged panel from pressure × area',
    4: 'upthrust ρVg, fraction submerged = ρ_object/ρ_liquid, apparent weight in water',
    5: 'hydraulic press in two steps (a weight and the area ratio, or the areas and work in = work out); the density of an alloy',
  },
  generate(rng, level: Level) {
    return retry(rng, () => pickVariant(rng, VARIANTS[level]));
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const a = q.answer.value.toNumber();
    if (!(a > 0) || !Number.isFinite(a)) return false;
    const p = q.params as Record<string, number> & { variant: string; areaUnit?: string };
    switch (p.variant) {
      case 'density': {
        // mass back out of the claimed density, and the same figure in g cm^-3
        const V = p.vCm3 * 1e-6;
        return near(a * V, p.mKg) && near(a / 1000, (p.mKg * 1000) / p.vCm3);
      }
      case 'pressure': {
        // the area is converted here, from the units the stem prints: the claimed pressure spread
        // over that area must give the stated force back
        if (p.areaUnit !== 'cm^2' && p.areaUnit !== 'm^2') return false;
        const A = p.areaUnit === 'cm^2' ? p.aShown / 1e4 : p.aShown;
        return A > 0 && near(a * A, p.F);
      }
      case 'mass-from-density':
        // density back out of the claimed mass, with the cm³ → m³ conversion done here
        return near(a / (p.vCm3 * 1e-6), p.rho);
      case 'rho-g-h':
        // the weight of the column of liquid, and the same pressure again as the extra pressure
        // between depth h and depth 2h
        return near(a * 1000, columnPressure(p.rho, p.h))
          && near(columnPressure(p.rho, 2 * p.h) - columnPressure(p.rho, p.h), a * 1000);
      case 'depth-from-pressure':
        // a column of the claimed height must weigh down with the pressure the stem states
        return near(columnPressure(p.rho, a), p.pk * 1000);
      case 'total-pressure':
        // strip the atmosphere off the claimed total, then check the liquid's share twice over
        return near((a - P_ATM) * 1000, columnPressure(p.rho, p.h))
          && near(columnPressure(p.rho, 2 * p.h) / 1000 + P_ATM, 2 * a - P_ATM);
      case 'force-on-surface':
        // the pressure implied by the claimed force must be the weight of the column above unit area
        return p.A > 0 && near(a / p.A, columnPressure(p.rho, p.h));
      case 'upthrust': {
        // the upthrust is the weight of the displaced liquid: recover its mass, then its density
        const massDisplaced = a / G;
        return near(massDisplaced / (p.vCm3 * 1e-6), p.rho);
      }
      case 'fraction-submerged':
        // floating equilibrium: rho_block = f * rho_liquid
        return a > 0 && a <= 1 && near(a * p.rhoF, p.rhoB);
      case 'density-from-float': {
        // float a block of some arbitrary volume: its weight must equal the weight of the liquid
        // displaced by the submerged fraction
        const V0 = 0.02;
        return near(a * V0 * G, p.rhoF * (p.f * V0) * G);
      }
      case 'apparent-weight': {
        // (weight − reading) is the weight of the displaced water: it must give water's density back
        const W = p.mKg * G;
        const U = W - a;
        return U > 0 && near(U / G / (p.vCm3 * 1e-6), 1000);
      }
      case 'hydraulic-load': {
        // the pressure under the small piston (areas in m²) must hold the load's weight up
        const pressure = a / (p.a1 * 1e-4);
        return near(pressure * p.a2 * 1e-4, p.mKg * G);
      }
      case 'hydraulic-rise':
        // energy conservation, in joules: the work done on the small piston is the work done on the load
        return a < p.d1 && near((p.F1 * p.d1) / 100, (p.W2 * a) / 100);
      case 'hydraulic-work': {
        // the long way: pressure under the small piston → force on the large one → the volume swept
        // fixes how far it rises → work = F2 d2
        const pressure = p.F1 / (p.a1 * 1e-4);
        const F2 = pressure * p.a2 * 1e-4;
        const d2 = (p.a1 * p.d1) / p.a2; // cm
        return near(F2 * (d2 / 100), a);
      }
      case 'alloy': {
        // total mass in grams over total volume in cm³, then back to kg m^-3
        const grams = (p.r1 / 1000) * p.v1 + (p.r2 / 1000) * p.v2;
        return near(a, (grams / (p.v1 + p.v2)) * 1000);
      }
    }
    return false;
  },
});
