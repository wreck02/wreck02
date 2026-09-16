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
 * Level 5: hydraulic press (force ratio = area ratio, distance ratio is the inverse); density of an alloy
 *
 * Every distractor is a named mistake: a wrong power of ten in a conversion, the ratio upside down,
 * g left out, atmospheric pressure added or subtracted when the stem asked for the other one, the force
 * given instead of the pressure. When fewer than four of them survive, pack() returns null and the
 * parameters are redrawn — the option list is never padded with "half the answer".
 *
 * verify() never repeats the arithmetic of generate(): it re-derives the answer in SI base units by a
 * different route — weight of the displaced fluid, the weight of a column of liquid over a chosen area,
 * equality of the pressures under the two pistons, the volume swept by the pistons, or the total mass of
 * an alloy in grams per cm³.
 */

const U_PA = '\\text{Pa}', U_KPA = '\\text{kPa}', U_N = '\\text{N}', U_KG = '\\text{kg}';
const U_RHO = '\\text{kg m}^{-3}', U_CM = '\\text{cm}';
const G = 10;
const P_ATM = 100; // kPa

const n = (x: number): string => (Number.isInteger(x) ? `${x}` : `${Number(x.toPrecision(10))}`);
const round = (x: number): number => Number(x.toPrecision(12));
const isMult = (v: number, step: number): boolean => Math.abs(v / step - Math.round(v / step)) < 1e-9;

type Cand = { value: number | null; trap: string };
type Fmt = 'decimal' | 'fraction' | 'sf';

/** Positive, exam-plausible distractors that pass the clean-number rule. */
function cleanOnly(ds: Cand[]): Distractor[] {
  const out: Distractor[] = [];
  for (const d of ds) {
    if (d.value === null || !Number.isFinite(d.value) || d.value <= 0) continue;
    const v = round(d.value);
    if (v > 1e9 || v < 1e-9) continue;
    let ex: Exact;
    try { ex = E(v); } catch { continue; }
    if (!isCleanExact(ex).ok) continue;
    out.push({ value: ex, trap: d.trap });
  }
  return out;
}

/** `must` traps get their slot first; options further than `spread` times from the answer are dropped. */
function ranked(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], spread: number, count = 4): Distractor[] {
  const seen: Exact[] = [answer];
  const out: Distractor[] = [];
  const a = answer.toNumber();
  const take = (d: Distractor) => {
    const r = d.value.toNumber() / a;
    if (out.length >= count || r < 1 / spread - 1e-12 || r > spread + 1e-12) return;
    if (seen.some((s) => s.equals(d.value))) return;
    seen.push(d.value);
    out.push(d);
  };
  must.forEach(take);
  rng.shuffle(extra).forEach(take);
  return out;
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
  spread?: number;
}

function pack(rng: RNG, p: Pack): Generated | null {
  const a = round(p.answer);
  if (!(a > 0) || !Number.isFinite(a)) return null;
  let value: Exact;
  try { value = E(a); } catch { return null; }
  if (!isCleanExact(value).ok) return null;
  const format = p.format ?? 'decimal';
  const ds = ranked(rng, value, cleanOnly(p.must), cleanOnly(p.extra), p.spread ?? 30);
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
      { value: vCm3 / mKg, trap: 'volume divided by mass instead of mass by volume' },
      { value: mKg * vCm3, trap: 'multiplied the mass by the volume instead of dividing' },
    ],
    extra: [
      { value: rho * 1000, trap: 'mass left in grams while the volume was converted to $\\text{m}^{3}$' },
      { value: rho / 10, trap: 'a power of ten lost in the conversion' },
      { value: rho * 10, trap: 'a power of ten gained in the conversion' },
    ],
    solution: `$${n(vCm3)}\\ \\text{cm}^{3} = ${n(vCm3)} \\times 10^{-6}\\ \\text{m}^{3}$, so $\\rho = \\dfrac{${n(mKg)}}{${n(vCm3)} \\times 10^{-6}} = ${n(rho)}\\ \\text{kg m}^{-3}$.`,
    trap: '1 m³ is 10⁶ cm³, not 10³: dividing by the wrong power of ten is the whole question.',
    tags: ['density', 'units'],
    params: { variant: 'density', rho, vCm3, mKg },
    spread: 1200,
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
          { value: aM2 / F, trap: 'divided the area by the force' },
        ]
      : [
          { value: F, trap: 'gave the force: the area was never used' },
          { value: F * aM2, trap: 'multiplied by the area instead of dividing' },
          { value: aM2 / F, trap: 'divided the area by the force' },
        ],
    extra: cm2
      ? [
          { value: p / 1000, trap: 'gave the pressure in kPa, not Pa' },
          { value: F * aCm2, trap: 'multiplied by the area in cm² instead of dividing' },
          { value: p / 10, trap: 'a power of ten lost in the conversion' },
          { value: p * 10, trap: 'a power of ten gained in the conversion' },
        ]
      : [
          { value: p / 10, trap: 'a decimal point slipped in the area' },
          { value: p * 10, trap: 'a decimal point slipped in the area the other way' },
          { value: p / 1000, trap: 'gave the pressure in kPa, not Pa' },
          { value: F / (aM2 * 1e4), trap: 'treated the area as cm² and divided by $10^{4}$ as well' },
        ],
    solution: `$p = \\dfrac{F}{A} = \\dfrac{${n(F)}}{${n(aM2)}} = ${n(p)}\\ \\text{Pa}$${cm2 ? ` (first $${n(aCm2)}\\ \\text{cm}^{2} = ${n(aM2)}\\ \\text{m}^{2}$)` : ''}.`,
    trap: cm2
      ? '1 m² is 10⁴ cm², so an area in cm² must be divided by 10⁴ before it goes under the force.'
      : 'Pressure is the force spread over the area: divide by the area, and dividing by a number less than 1 makes the answer bigger.',
    tags: ['pressure', 'units'],
    params: { variant: 'pressure', F, aM2 },
    spread: cm2 ? 15000 : 30,
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
      { value: rho / vCm3, trap: 'divided the density by the volume' },
      { value: vCm3 / rho, trap: 'divided the volume by the density' },
    ],
    extra: [
      { value: mKg / 1000, trap: 'converted cm³ with $10^{9}$ instead of $10^{6}$' },
      { value: mKg / 10, trap: 'a power of ten lost in the conversion' },
      { value: mKg * 10, trap: 'a power of ten gained in the conversion' },
    ],
    solution: `$m = \\rho V = ${n(rho)} \\times ${n(vCm3)} \\times 10^{-6} = ${n(mKg)}\\ \\text{kg}$.`,
    trap: 'The volume must be in m³ (÷10⁶) before it is multiplied by a density in kg m⁻³.',
    tags: ['density', 'mass', 'units'],
    params: { variant: 'mass-from-density', rho, vCm3, mKg },
    spread: 1200,
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
      { value: (rho * G) / 1000 / h, trap: 'divided by the depth instead of multiplying' },
    ],
    extra: [
      { value: pPa, trap: 'gave the answer in Pa, not kPa' },
      { value: pk * 10, trap: 'divided by $100$ instead of $1000$ turning Pa into kPa' },
      { value: pk / 2, trap: 'used $\\tfrac12 \\rho g h$' },
      { value: (G * h) / 1000, trap: 'left the density out' },
    ],
    solution: `$p = \\rho g h = ${n(rho)} \\times 10 \\times ${n(h)} = ${n(pPa)}\\ \\text{Pa} = ${n(pk)}\\ \\text{kPa}$.`,
    trap: 'ρgh needs all three factors and the depth in metres; the question asks for the liquid’s pressure only, so atmospheric pressure is not added.',
    tags: ['pressure', 'depth', 'fluids'],
    params: { variant: 'rho-g-h', rho, h, pk },
    spread: 1500,
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
      { value: round((rho * G) / (pk * 1000)), trap: 'the formula upside down: $\\rho g / p$' },
      { value: round(h * 100), trap: 'gave the depth in centimetres' },
      { value: round(h / 10), trap: 'a power of ten lost turning kPa into Pa' },
      { value: round(pk / (rho * G)), trap: 'used the pressure in kPa instead of Pa' },
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
    extra: [
      { value: round(pk / 2 + P_ATM), trap: 'used $\\tfrac12 \\rho g h$' },
      { value: round(2 * pk + P_ATM), trap: 'took the pressure at twice the depth' },
      { value: round(pk + 1), trap: 'added 1 kPa instead of 100 kPa' },
      { value: round(P_ATM - pk), trap: 'took the liquid’s pressure away from atmospheric pressure' },
      { value: round(10 * pk + P_ATM), trap: 'a power of ten lost turning the liquid’s pressure into kPa' },
    ],
    solution: `Liquid: $\\rho g h = ${n(rho)} \\times 10 \\times ${n(h)} = ${n(pk * 1000)}\\ \\text{Pa} = ${n(pk)}\\ \\text{kPa}$. Total $= 100 + ${n(pk)} = ${n(total)}\\ \\text{kPa}$.`,
    trap: 'Total pressure includes the atmosphere pressing on the surface: p = p₀ + ρgh.',
    tags: ['pressure', 'depth', 'atmospheric'],
    params: { variant: 'total-pressure', rho, h, total },
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
      { value: round(p / A), trap: 'divided by the area instead of multiplying' },
      { value: round(rho * h * A), trap: 'left $g$ out of $\\rho g h$' },
    ],
    extra: [
      { value: round((p + 100000) * A), trap: 'included atmospheric pressure, although only the liquid was asked for' },
      { value: round(F / 1000), trap: 'left the pressure in kPa when multiplying by the area' },
      { value: round(rho * G * (h / 2) * A), trap: 'used half the depth, although the average depth was given' },
      { value: round(p * A * 2), trap: 'counted both faces of the panel' },
    ],
    solution: `$p = \\rho g h = ${n(rho)} \\times 10 \\times ${n(h)} = ${n(p)}\\ \\text{Pa}$, so $F = pA = ${n(p)} \\times ${n(A)} = ${n(F)}\\ \\text{N}$.`,
    trap: 'Pressure is a force per unit area: multiply by the area (and only the liquid’s pressure is asked for here).',
    tags: ['pressure', 'force', 'fluids'],
    params: { variant: 'force-on-surface', rho, h, A, F },
    spread: 1500,
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
    must: [
      { value: round(rhoBody * V * G), trap: 'used the block’s own density instead of the liquid’s' },
      { value: round(rho * V), trap: 'left $g$ out of $\\rho V g$' },
      { value: round(rho * vCm3 * G), trap: 'left the volume in cm³' },
    ],
    extra: [
      { value: round(rho * V * G * 1000), trap: 'converted cm³ with $10^{3}$ instead of $10^{6}$' },
      { value: round(rhoBody * V * G - U), trap: 'gave the apparent weight instead of the upthrust' },
      { value: round((rhoBody - rho) * V * G * 2), trap: 'counted the difference in densities twice' },
      { value: round(U * 10), trap: 'a power of ten gained in the conversion' },
    ],
    solution: `Upthrust $=$ weight of liquid displaced $= \\rho_{\\text{liquid}} V g = ${n(rho)} \\times ${n(vCm3)} \\times 10^{-6} \\times 10 = ${n(U)}\\ \\text{N}$.`,
    trap: 'The upthrust uses the density of the fluid displaced, never the density of the object.',
    tags: ['upthrust', 'archimedes', 'fluids'],
    params: { variant: 'upthrust', rho, vCm3, rhoBody },
    spread: 2000,
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
    must: [
      { value: round(rhoF / rhoB), trap: 'the ratio of densities taken upside down' },
      { value: round(1 - f), trap: 'gave the fraction above the surface' },
      { value: round(rhoB / (rhoF - rhoB)), trap: 'divided by the difference of the densities instead of the liquid’s density' },
    ],
    extra: [
      { value: round((1 + f) / 2), trap: 'averaged the ratio with 1' },
      { value: round(f * f), trap: 'squared the ratio' },
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
    extra: [
      { value: round(rhoF * f * f), trap: 'squared the fraction' },
      { value: round(rhoF - rhoB), trap: 'subtracted instead of multiplying' },
      { value: round((rhoF * (1 + f)) / 2), trap: 'averaged the liquid’s density with the answer' },
    ],
    solution: `Weight $=$ upthrust, so $\\rho_{\\text{block}} = ${fr} \\times ${n(rhoF)} = ${n(rhoB)}\\ \\text{kg m}^{-3}$.`,
    trap: 'A floating body’s density is the fraction submerged times the liquid’s density; dividing gives a body denser than the liquid, which would sink.',
    tags: ['floating', 'density', 'upthrust'],
    params: { variant: 'density-from-float', rhoB, rhoF, f },
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
      { value: round(W - U / 10), trap: 'a power of ten lost in the volume conversion' },
      { value: round(W - U / 1000), trap: 'used a density of $1\\ \\text{kg m}^{-3}$ for the water' },
      { value: round(W - 2 * U), trap: 'subtracted the upthrust twice' },
    ],
    solution: `Weight $= ${n(mKg)} \\times 10 = ${n(W)}\\ \\text{N}$; upthrust $= 1000 \\times ${n(vCm3)} \\times 10^{-6} \\times 10 = ${n(U)}\\ \\text{N}$. Reading $= ${n(W)} - ${n(U)} = ${n(app)}\\ \\text{N}$.`,
    trap: 'Apparent weight = true weight − upthrust, and the upthrust uses the water’s density, not the block’s.',
    tags: ['upthrust', 'apparent weight', 'archimedes'],
    params: { variant: 'apparent-weight', vCm3, rhoB, mKg },
    spread: 40,
  });
}

// ----------------------------------------------------------------------------- level 5

/** Hydraulic press: the force on the large piston, or how far it moves. */
function hydraulicQ(rng: RNG, ask: 'force' | 'distance'): Generated | null {
  const a1 = rng.pick([2, 4, 5, 8, 10, 20, 25]);
  const k = rng.pick([4, 5, 8, 10, 20, 25, 40, 50]);
  const a2 = a1 * k;
  if (a2 > 2000) return null;
  const F1 = rng.pick([10, 12, 15, 20, 24, 25, 30, 40, 50, 60, 80, 100]);
  const F2 = round(F1 * k);
  const d1 = rng.pick([2, 4, 5, 8, 10, 12, 15, 20, 25, 40, 50]);
  const d2 = round(d1 / k);
  if (F2 > 20000) return null;
  if (ask === 'distance' && (!isMult(d2, 0.01) || d2 < 0.05)) return null;
  const setup = `In a hydraulic press the small piston has cross-sectional area $${n(a1)}\\ \\text{cm}^{2}$ and the large piston has cross-sectional area $${n(a2)}\\ \\text{cm}^{2}$. The liquid in the press is incompressible.`;
  if (ask === 'force') {
    return pack(rng, {
      stem: `${setup} A force of $${n(F1)}\\ \\text{N}$ is applied to the small piston.\n\nFind the force on the large piston.`,
      answer: F2,
      unit: U_N,
      must: [
        { value: round(F1 / k), trap: 'the area ratio used upside down' },
        { value: F1, trap: 'assumed the two forces are equal because the pressure is' },
        { value: round(F1 / a1), trap: 'gave the pressure (in N cm⁻²) rather than the force' },
      ],
      extra: [
        { value: round(F1 * a2), trap: 'multiplied by the large area instead of the ratio of areas' },
        { value: round(F1 * (k - 1)), trap: 'off by one in the ratio of areas' },
        { value: round(F1 * (k + 1)), trap: 'off by one in the ratio of areas the other way' },
        { value: round(F1 * a2 - F1 * a1), trap: 'used the difference of the areas instead of their ratio' },
      ],
      solution: `The pressure is the same on both pistons, so $F_2 = F_1 \\times \\dfrac{A_2}{A_1} = ${n(F1)} \\times ${n(k)} = ${n(F2)}\\ \\text{N}$ (the ratio of areas needs no unit conversion).`,
      trap: 'The force is multiplied by the ratio of the areas — the larger piston always gives the larger force.',
      tags: ['pressure', 'hydraulics'],
      params: { variant: 'hydraulic-force', a1, a2, F1 },
      spread: 200,
    });
  }
  return pack(rng, {
    stem: `${setup} The small piston is pushed down $${n(d1)}\\ \\text{cm}$.\n\nHow far does the large piston rise?`,
    answer: d2,
    unit: U_CM,
    must: [
      { value: round(d1 * k), trap: 'the area ratio used upside down: the large piston moves less, not more' },
      { value: d1, trap: 'assumed both pistons move the same distance' },
      { value: round(d1 / a2), trap: 'divided by the large area instead of the ratio of areas' },
    ],
    extra: [
      { value: round(d1 / (k - 1)), trap: 'off by one in the ratio of areas' },
      { value: round(d1 / (k + 1)), trap: 'off by one in the ratio of areas the other way' },
      { value: round(d2 * 10), trap: 'gave the answer in mm, not cm' },
      { value: round(d2 / 10), trap: 'a power of ten lost' },
    ],
    solution: `The liquid is incompressible, so the volumes swept are equal: $A_1 d_1 = A_2 d_2$, giving $d_2 = \\dfrac{${n(d1)}}{${n(k)}} = ${n(d2)}\\ \\text{cm}$.`,
    trap: 'The press multiplies force but not energy: the large piston moves as many times less as the force is times bigger.',
    tags: ['pressure', 'hydraulics', 'energy'],
    params: { variant: 'hydraulic-distance', a1, a2, d1 },
    spread: 200,
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
  5: [(r) => hydraulicQ(r, 'force'), (r) => hydraulicQ(r, 'distance'), alloyQ],
};

const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-7 * (1 + Math.abs(b));

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
    5: 'hydraulic press (force and distance ratios); the density of an alloy of two metals',
  },
  generate(rng, level: Level) {
    return retry(rng, () => pickVariant(rng, VARIANTS[level]));
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const a = q.answer.value.toNumber();
    if (!(a > 0) || !Number.isFinite(a)) return false;
    const p = q.params as Record<string, number> & { variant: string };
    switch (p.variant) {
      case 'density': {
        // mass back out of the claimed density, and the same figure in g cm^-3
        const V = p.vCm3 * 1e-6;
        return near(a * V, p.mKg) && near(a / 1000, (p.mKg * 1000) / p.vCm3);
      }
      case 'pressure':
        // the claimed pressure spread over the area must give the stated force back
        return near(a * p.aM2, p.F);
      case 'mass-from-density':
        // density back out of the claimed mass
        return near(a / (p.vCm3 * 1e-6), p.rho) && near(a, p.mKg);
      case 'rho-g-h': {
        // weight of a column of liquid of area A0 standing on 1 point, divided by that area
        const A0 = 3;
        const weight = p.rho * A0 * p.h * G;
        return near(a * 1000, weight / A0) && near(a, p.pk);
      }
      case 'depth-from-pressure': {
        // the weight of a column of liquid of area A0 and the claimed height must give the stated pressure
        const A0 = 5;
        return near((p.rho * A0 * a * G) / A0, p.pk * 1000);
      }
      case 'total-pressure': {
        const A0 = 4;
        const weight = p.rho * A0 * p.h * G;
        return near((a - P_ATM) * 1000, weight / A0) && near(a, p.total);
      }
      case 'force-on-surface': {
        // pressure implied by the claimed force must be the weight of the liquid column above unit area
        const pressure = a / p.A;
        const A0 = 2;
        return near(pressure, (p.rho * A0 * p.h * G) / A0) && near(a, p.F);
      }
      case 'upthrust': {
        // the upthrust is the weight of the displaced liquid: recover its mass, then its density
        const massDisplaced = a / G;
        return near(massDisplaced / (p.vCm3 * 1e-6), p.rho);
      }
      case 'fraction-submerged':
        // floating equilibrium: rho_block = f * rho_liquid
        return a > 0 && a <= 1 && near(a * p.rhoF, p.rhoB);
      case 'density-from-float':
        return near(a / p.rhoF, p.f) && near(a, p.rhoB);
      case 'apparent-weight': {
        // (weight − reading) is the weight of the displaced water: it must give water's density back
        const W = p.mKg * G;
        const U = W - a;
        return U > 0 && near(U / G / (p.vCm3 * 1e-6), 1000);
      }
      case 'hydraulic-force':
        // the pressure under each piston must be the same (areas in cm², so use them directly)
        return near(p.F1 / p.a1, a / p.a2);
      case 'hydraulic-distance': {
        // equal volumes swept, and equal work done by the two pistons
        const F1 = 100;
        const F2 = (F1 * p.a2) / p.a1;
        return near(p.a1 * p.d1, p.a2 * a) && near(F1 * p.d1, F2 * a);
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
