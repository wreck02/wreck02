import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, Exact } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import type { RNG } from '../../core/rng';

/**
 * Kinetic and potential energy, conservation with and without losses (g = 10 m s^-2 throughout).
 * Level 1: KE = ½mv², GPE = mgh with clean numbers (occasionally solved for v, m or h)
 * Level 2: dropped from h → speed at the bottom √(2gh) with 2gh a perfect square (mass a red herring)
 * Level 3: height reached by a ball thrown up at u (u²/20); pendulum or swing released from height h, or
 *          from a string of length L at 60° (h = L/2), → speed at the bottom
 * Level 4: a fraction of the energy lost to friction → speed (√ of the remaining fraction), or the work done
 *          against friction from the speeds (mgh − ½mv²)
 * Level 5: rollercoaster: speed at a lower point given the start speed, the drop and the energy lost; the height
 *          (or speed) at which KE = n × GPE for a dropped or thrown ball
 *
 * Every wrong option is a named mistake (missing ½, no square root, v ∝ h, forgetting g, % of speed instead of
 * % of energy) printed in the same family as the answer — a whole number or a one-decimal-place value, never a
 * surd; parameters that cannot supply four distinct clean ones are redrawn, never padded.
 */

const G = 10;
const U_J = '\\text{J}', U_KJ = '\\text{kJ}', U_M = '\\text{m}', U_MS = '\\text{m s}^{-1}', U_KG = '\\text{kg}';
const TAKE_G = 'Take $g = 10\\ \\text{m s}^{-2}$.';
/** No option in a question answered in m s^-1 may exceed this: nothing here moves at 200 m s^-1. */
const MAX_SPEED = 120;

/**
 * A candidate distractor. `wide` marks a unit slip (joules read as kilojoules): that is 1000x out, so it is
 * offered alone and only in a minority of draws; every other candidate must sit within a factor of 12 of
 * the answer, because 400 m s^-1 beside 20 m s^-1 is eliminated on sight and gives the answer away.
 * A speed question has an absolute ceiling too: nothing dropped, swung or freewheeled here travels at
 * 200 m s^-1, so v-squared is only ever offered while it could still pass for a speed.
 */
type Candidate = { value: Exact | null; trap: string; wide?: boolean };
type Ranked = Distractor & { wide?: boolean };

/** Plain number for a stem: 1200, 0.05, 22.5. */
const n = (x: number): string => (Number.isInteger(x) ? `${x}` : `${Number(x.toPrecision(10))}`);
/** Round away floating-point noise (0.1 x 3 -> 0.3). */
const r = (x: number): number => Number(x.toPrecision(12));

/**
 * A speed or height that is not exact, printed the way the exam prints one: a whole number when it is
 * one, otherwise a single decimal place. Never a surd — the answer to a physics question here is always
 * a whole number, so an option such as 10 root 5 is discarded without any physics and "pick the only
 * whole number that is a plausible speed" would score without knowing any energy.
 */
function root(x: number): Exact | null {
  if (!(x > 0)) return null;
  const v = Math.sqrt(x);
  const whole = Math.round(v);
  return E(Math.abs(whole - v) < 1e-9 ? whole : Number(v.toFixed(1)));
}

/** √x when it is a whole number (answers must stay exact), else null. */
function exactRoot(x: number): Exact | null {
  if (!(x > 0)) return null;
  const v = Math.sqrt(x);
  const whole = Math.round(v);
  return Math.abs(whole - v) < 1e-9 ? E(whole) : null;
}

/** A value that is not exact, printed to one decimal place (or 3 s.f. when large). */
function approx(x: number): Exact | null {
  if (!Number.isFinite(x) || x <= 0) return null;
  return E(Math.abs(x) >= 1000 ? Number(x.toPrecision(3)) : Number(x.toFixed(1)));
}

/** Positive, finite, clean candidates that sit close enough to the answer to be weighed against it. */
function cleanOnly(ds: Candidate[], answer: Exact, ceiling = Infinity): Ranked[] {
  const a = answer.toNumber();
  const out: Ranked[] = [];
  for (const d of ds) {
    const v = d.value;
    if (!v || !Number.isFinite(v.toNumber()) || v.sign() <= 0 || !isCleanExact(v).ok) continue;
    const x = v.toNumber();
    if (x < 0.01 || x > 2e6 || x > ceiling) continue;
    const span = d.wide ? 1000 : 12;
    if (x > span * a || x < a / span) continue;
    if (v.isRational() && !Number.isInteger(r(x * 1000))) continue; // decimals must terminate
    out.push({ value: v, trap: d.trap, wide: d.wide });
  }
  return out;
}

/**
 * Every distinct `must` trap gets a slot before any `extra` one, so the headline mistakes are never
 * shuffled out. The remaining slots are filled towards a randomly chosen number of options *below* the
 * answer, so where the correct option lands in the sorted list is a property of the draw and not of the
 * sub-variant. At most one power-of-ten option, and the 1000x J/kJ slip only in a minority of draws: an
 * option list that is a decimal ladder tests nothing but the decimal point.
 */
function ranked(rng: RNG, answer: Exact, must: Ranked[], extra: Ranked[], count = 4): Distractor[] {
  const a = answer.toNumber();
  const seen: Exact[] = [answer];
  const out: Ranked[] = [];
  const nums: number[] = [a];
  let wideSlots = rng.bool(0.4) ? 1 : 0;
  let shiftSlots = 1;
  const take = (d: Ranked) => {
    if (out.length >= count || seen.some((s) => s.equals(d.value))) return;
    const x = d.value.toNumber();
    // two options that read the same to three significant figures are one option
    if (nums.some((y) => Math.abs(y - x) < 0.005 * Math.max(Math.abs(y), Math.abs(x)))) return;
    const k = Math.log10(x / a);
    const isShift = Math.abs(k) >= 0.999 && Math.abs(k - Math.round(k)) < 1e-6;
    if (d.wide && wideSlots <= 0) return;
    if (isShift && shiftSlots <= 0) return;
    if (out.length > 0 && Math.max(...nums, x) / Math.min(...nums, x) > 1000) return;
    if (d.wide) wideSlots--;
    if (isShift) shiftSlots--;
    seen.push(d.value);
    nums.push(x);
    out.push(d);
  };
  must.forEach(take);
  const below = rng.shuffle(extra.filter((d) => d.value.toNumber() < a));
  const above = rng.shuffle(extra.filter((d) => d.value.toNumber() > a));
  let wantBelow = rng.int(0, count) - out.filter((d) => d.value.toNumber() < a).length;
  while (out.length < count && below.length + above.length > 0) {
    const useBelow = below.length > 0 && (wantBelow > 0 || above.length === 0);
    take((useBelow ? below : above).shift()!);
    if (useBelow) wantBelow--;
  }
  return out.map((d) => ({ value: d.value, trap: d.trap }));
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
  answer: Exact | null;
  unit: string;
  must: Candidate[];
  extra: Candidate[];
  solution: string;
  trap: string;
  tags: string[];
  params: Record<string, unknown>;
}

function pack(rng: RNG, p: Pack): Generated | null {
  if (!p.answer || !isCleanExact(p.answer).ok || p.answer.sign() <= 0) return null;
  const ceiling = p.unit === U_MS ? MAX_SPEED : Infinity;
  const ds = ranked(rng, p.answer, cleanOnly(p.must, p.answer, ceiling), cleanOnly(p.extra, p.answer, ceiling));
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

/** An energy has at most two decimal places and is not tiny. */
const tidyEnergy = (x: number) => Number.isInteger(x * 100) && x >= 0.1;

// ----------------------------------------------------------------------------- level 1

/** A body for a level-1 stem: `plural` subjects ("a cyclist and bicycle") take have/are/their. */
interface Body { name: string; masses: number[]; speeds: number[]; plural?: boolean }

const KE_OBJECTS: Body[] = [
  { name: 'ball', masses: [0.2, 0.4, 0.5, 1, 2], speeds: [2, 3, 4, 5, 6, 8, 10, 12, 15, 20] },
  { name: 'cyclist and bicycle', masses: [80, 90, 100], speeds: [4, 5, 6, 8, 10, 12], plural: true },
  { name: 'car', masses: [800, 1000, 1200, 1500, 2000], speeds: [5, 10, 12, 15, 20, 25, 30] },
  { name: 'runner', masses: [50, 60, 70, 80], speeds: [2, 3, 4, 5, 6, 8, 10] },
  { name: 'trolley', masses: [2, 4, 5, 8, 10, 20], speeds: [2, 3, 4, 5, 6, 8, 10] },
  { name: 'lorry', masses: [4000, 5000, 8000, 10000], speeds: [5, 10, 15, 20] },
  { name: 'sledge and rider', masses: [60, 80, 100], speeds: [2, 3, 4, 5, 6, 8], plural: true },
  { name: 'arrow', masses: [0.02, 0.05, 0.1], speeds: [10, 20, 30, 40, 50] },
];

/** "An arrow of mass 0.05 kg" / "A cyclist and bicycle of total mass 90 kg". */
const article = (name: string): string => (/^[aeiou]/.test(name) ? 'An' : 'A');

function keQ(rng: RNG): Generated | null {
  const b = rng.pick(KE_OBJECTS);
  const m = rng.pick(b.masses), v = rng.pick(b.speeds);
  const KE = 0.5 * m * v * v;
  if (!tidyEnergy(KE)) return null;
  const inKJ = KE >= 10000 && KE % 100 === 0;
  const scale = inKJ ? 1 / 1000 : 1;
  const name = b.name;
  const reverse = rng.bool(0.3);
  if (reverse) {
    // solve ½mv² = KE for the speed
    return pack(rng, {
      stem: b.plural
        ? `A ${name} of total mass ${n(m)} kg have kinetic energy ${n(KE * scale)} ${inKJ ? 'kJ' : 'J'}. Find their speed.`
        : `${article(name)} ${name} of mass ${n(m)} kg has kinetic energy ${n(KE * scale)} ${inKJ ? 'kJ' : 'J'}. Find its speed.`,
      answer: E(v),
      unit: U_MS,
      must: [
        { value: root(KE / m), trap: 'forgot the ½: used v = √(KE/m)' },
        { value: E((2 * KE) / m), trap: 'forgot to take the square root' },
      ],
      extra: [
        { value: E(KE / m), trap: 'forgot the ½ and the square root' },
        { value: inKJ ? root((2 * KE * scale) / m) : null, trap: 'forgot to convert kJ to J', wide: true },
        { value: E(2 * v), trap: 'doubled the speed' },
        { value: E(v / 2), trap: 'halved the speed' },
        { value: root(KE / (2 * m)), trap: 'divided by 2 instead of multiplying by 2' },
        { value: approx(v * Math.SQRT2), trap: 'doubled the energy twice: used v = √(4KE/m)' },
      ],
      solution: `$\\tfrac12 m v^2 = ${n(KE)}$, so $v^2 = \\dfrac{2 \\times ${n(KE)}}{${n(m)}} = ${v * v}$ and $v = ${v}\\ ${U_MS}$.`,
      trap: 'Double the energy before dividing by the mass, then square-root: v = √(2KE/m).',
      tags: ['kinetic-energy', 'speed'],
      params: { variant: 'ke-speed', m, KE },
    });
  }
  return pack(rng, {
    stem: b.plural
      ? `A ${name} have a total mass of ${n(m)} kg and are moving at $${v}\\ ${U_MS}$. Find their total kinetic energy${inKJ ? ', in kJ' : ''}.`
      : `${article(name)} ${name} of mass ${n(m)} kg is moving at $${v}\\ ${U_MS}$. Find its kinetic energy${inKJ ? ', in kJ' : ''}.`,
    answer: E(KE * scale),
    unit: inKJ ? U_KJ : U_J,
    must: [
      { value: E(m * v * v * scale), trap: 'forgot the ½' },
      { value: E(0.5 * m * v * scale), trap: 'forgot to square the speed' },
    ],
    extra: [
      { value: E(m * v * scale), trap: 'forgot the ½ and the square: gave the momentum' },
      { value: E(0.5 * m * (v + 1) * (v + 1) * scale), trap: `slipped when squaring the speed: used ${v + 1}^2` },
      { value: E(KE * scale * 10), trap: 'slipped a decimal place' },
      { value: E(0.25 * m * v * v * scale), trap: 'halved twice' },
      { value: E(r(m * v * v * scale * 2)), trap: 'used 2mv² instead of ½mv²' },
    ],
    solution: `$KE = \\tfrac12 m v^2 = \\tfrac12 \\times ${n(m)} \\times ${v}^2 = \\tfrac12 \\times ${n(m)} \\times ${v * v} = ${n(KE)}\\ \\text{J}${inKJ ? ` = ${n(KE * scale)}\\ \\text{kJ}` : ''}$.`,
    trap: 'Square the speed and halve: KE = ½mv², not mv² or ½mv.',
    tags: ['kinetic-energy'],
    params: { variant: 'ke', m, v, inKJ },
  });
}

/** A body that is raised: `climbs` marks a person, who climbs rather than "is lifted". */
interface Raised { name: string; masses: number[]; heights: number[]; climbs?: boolean }

const GPE_OBJECTS: Raised[] = [
  { name: 'book', masses: [0.5, 1, 2], heights: [1, 1.5, 2, 3] },
  { name: 'brick', masses: [2, 3, 5], heights: [1.5, 2, 3, 4, 5, 6, 8, 10] },
  { name: 'climber', masses: [50, 60, 70, 80], heights: [5, 8, 10, 12, 15, 20, 25, 30, 50, 100], climbs: true },
  { name: 'load', masses: [100, 200, 250, 500, 1000], heights: [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30] },
  { name: 'ball', masses: [0.2, 0.4, 0.5, 2], heights: [2, 3, 4, 5, 8, 10, 12, 15, 20] },
  { name: 'crate', masses: [5, 10, 20, 25, 40, 50], heights: [2, 3, 4, 5, 6, 8, 10, 12] },
];

function gpeQ(rng: RNG): Generated | null {
  const b = rng.pick(GPE_OBJECTS);
  const name = b.name;
  const m = rng.pick(b.masses), h = rng.pick(b.heights);
  const PE = m * G * h;
  if (!tidyEnergy(PE)) return null;
  const inKJ = PE >= 10000 && PE % 100 === 0;
  const scale = inKJ ? 1 / 1000 : 1;
  const ask = rng.weighted(['energy', 'height', 'mass'], [7, 2, 1]);
  if (ask === 'height') {
    return pack(rng, {
      stem: b.climbs
        ? `${article(name)} ${name} of mass ${n(m)} kg gains ${n(PE * scale)} ${inKJ ? 'kJ' : 'J'} of gravitational potential energy on climbing vertically. ${TAKE_G} Find the height climbed.`
        : `${article(name)} ${name} of mass ${n(m)} kg gains ${n(PE * scale)} ${inKJ ? 'kJ' : 'J'} of gravitational potential energy when it is lifted vertically. ${TAKE_G} Find the height through which it is lifted.`,
      answer: E(h),
      unit: U_M,
      must: [
        { value: E(PE / m), trap: 'forgot g: divided by the mass only' },
        { value: E((2 * PE) / (m * G)), trap: 'put in a spurious factor of ½ (as in ½mv²)' },
      ],
      extra: [
        { value: inKJ ? E((PE * scale) / (m * G)) : null, trap: 'forgot to convert kJ to J', wide: true },
        { value: E(h * 10), trap: 'slipped a decimal place' },
        { value: E(h / 10), trap: 'slipped a decimal place the other way' },
        { value: E(2 * h), trap: 'doubled the height' },
        { value: E(r(h / 2)), trap: 'halved the height' },
        { value: E(r(PE / (m * G * G))), trap: 'divided by g twice' },
      ],
      solution: `$mgh = ${n(PE)}$, so $h = \\dfrac{${n(PE)}}{${n(m)} \\times 10} = ${n(h)}\\ \\text{m}$.`,
      trap: 'Divide by the weight mg, not by the mass alone.',
      tags: ['gpe', 'height'],
      params: { variant: 'gpe-height', m, PE },
    });
  }
  if (ask === 'mass') {
    return pack(rng, {
      stem: `An object gains ${n(PE * scale)} ${inKJ ? 'kJ' : 'J'} of gravitational potential energy when it is raised ${n(h)} m. ${TAKE_G} Find the mass of the object.`,
      answer: E(m),
      unit: U_KG,
      must: [
        { value: E(PE / h), trap: 'forgot g: divided by the height only' },
        { value: E((2 * PE) / (G * h)), trap: 'put in a spurious factor of ½ (as in ½mv²)' },
      ],
      extra: [
        { value: inKJ ? E((PE * scale) / (G * h)) : null, trap: 'forgot to convert kJ to J', wide: true },
        { value: E(m * 10), trap: 'slipped a decimal place' },
        { value: E(m / 10), trap: 'slipped a decimal place the other way' },
        { value: E(2 * m), trap: 'doubled the mass' },
        { value: E(r(m / 2)), trap: 'halved the mass' },
        { value: E(r(PE / (G * G * h))), trap: 'divided by g twice' },
      ],
      solution: `$mgh = ${n(PE)}$, so $m = \\dfrac{${n(PE)}}{10 \\times ${n(h)}} = ${n(m)}\\ \\text{kg}$.`,
      trap: 'Divide by g × h, not by the height alone.',
      tags: ['gpe', 'mass'],
      params: { variant: 'gpe-mass', h, PE },
    });
  }
  return pack(rng, {
    stem: b.climbs
      ? `${article(name)} ${name} of mass ${n(m)} kg climbs vertically through ${n(h)} m. ${TAKE_G} Find the gain in gravitational potential energy${inKJ ? ', in kJ' : ''}.`
      : `${article(name)} ${name} of mass ${n(m)} kg is lifted vertically through ${n(h)} m. ${TAKE_G} Find the gain in gravitational potential energy${inKJ ? ', in kJ' : ''}.`,
    answer: E(PE * scale),
    unit: inKJ ? U_KJ : U_J,
    must: [
      { value: E(m * h * scale), trap: 'forgot g: used mass × height' },
      { value: E(0.5 * PE * scale), trap: 'put in a spurious factor of ½ (as in ½mv²)' },
    ],
    extra: [
      { value: E(m * G * h * h * scale), trap: 'squared the height (as if it were a speed)' },
      { value: E(PE * scale * 10), trap: 'slipped a decimal place' },
      { value: E(2 * PE * scale), trap: 'doubled the energy' },
      { value: E(r((m * G * h * scale) / 4)), trap: 'quartered the energy' },
      { value: E(r(G * h * scale)), trap: 'forgot the mass: used gh' },
    ],
    solution: `$\\Delta PE = mgh = ${n(m)} \\times 10 \\times ${n(h)} = ${n(PE)}\\ \\text{J}${inKJ ? ` = ${n(PE * scale)}\\ \\text{kJ}` : ''}$.`,
    trap: 'GPE = mgh: weight (mg) times height, with no ½ and nothing squared.',
    tags: ['gpe'],
    params: { variant: 'gpe', m, h, inKJ },
  });
}

// ----------------------------------------------------------------------------- level 2

/** Drop heights with 2gh a perfect square, so the speed at the bottom is a whole number. */
const DROP_HEIGHTS = [0.8, 1.8, 3.2, 5, 7.2, 12.8, 16.2, 20, 28.8, 45, 80, 125];
/** What is dropped, with masses that suit it (an egg is not 5 kg). */
const DROPPED: [string, number[]][] = [
  ['stone', [0.5, 1, 2, 5]],
  ['ball', [0.2, 0.5, 1, 2]],
  ['coconut', [1, 2]],
  ['apple', [0.1, 0.2]],
  ['brick', [2, 3, 5]],
  ['egg', [0.05, 0.1]],
];

function dropQ(rng: RNG): Generated | null {
  const h = rng.pick(DROP_HEIGHTS);
  const [object, masses] = rng.pick(DROPPED);
  const m = rng.bool(0.6) ? rng.pick(masses) : 0;
  const answer = exactRoot(2 * G * h);
  if (!answer) return null;
  const v = answer.toNumber();
  const stem = `${article(object)} ${object}${m ? ` of mass ${n(m)} kg` : ''} is dropped from rest from a height of ${n(h)} m. Air resistance is negligible. ${TAKE_G} Find the speed of the ${object} just before it hits the ground.`;
  return pack(rng, {
    stem,
    answer,
    unit: U_MS,
    // v/√2 below and √2 v above: the two ways of mislaying the factor 2, one on each side of the answer
    must: [
      { value: root(G * h), trap: 'forgot the 2: used v = √(gh)' },
      { value: root(4 * G * h), trap: 'doubled g as well as using the 2: used v = √(4gh)' },
    ],
    extra: [
      { value: root(2 * h), trap: 'forgot g' },
      { value: E(2 * G * h), trap: 'forgot to take the square root: gave v²' },
      { value: E(G * h), trap: 'forgot the 2 and the square root' },
      { value: E(2 * v), trap: 'doubled the speed' },
      { value: E(r(v / 2)), trap: 'halved the speed' },
      { value: root(G * h / 2), trap: 'used v = √(gh/2): halved instead of doubling' },
      { value: E(r(v * 1.5)), trap: 'used v = 1.5√(2gh)' },
    ],
    solution: `$mgh = \\tfrac12 m v^2$ (the mass cancels), so $v = \\sqrt{2gh} = \\sqrt{2 \\times 10 \\times ${n(h)}} = \\sqrt{${n(2 * G * h)}} = ${n(v)}\\ ${U_MS}$.`,
    trap: 'v = √(2gh): keep the 2 and take the square root; the mass cancels, so it is not needed.',
    tags: ['conservation', 'free-fall', 'speed'],
    params: { variant: 'drop', h },
  });
}

// ----------------------------------------------------------------------------- level 3

function throwUpQ(rng: RNG): Generated | null {
  const u = rng.pick([10, 12, 14, 15, 16, 20, 24, 25, 30, 40, 50]);
  const m = rng.bool(0.5) ? rng.pick([0.2, 0.5, 1, 2]) : 0;
  const h = (u * u) / (2 * G);
  if (!Number.isInteger(h * 100)) return null;
  return pack(rng, {
    stem: `A ball${m ? ` of mass ${n(m)} kg` : ''} is thrown vertically upwards at $${u}\\ ${U_MS}$. Air resistance is negligible. ${TAKE_G} Find the maximum height reached above the point of release.`,
    answer: E(h),
    unit: U_M,
    must: [
      { value: E((u * u) / G), trap: 'forgot the ½: used mgh = mu²' },
      { value: E(u / G), trap: 'found the time to the top (u/g), not the height' },
    ],
    extra: [
      { value: E((u * u) / 2), trap: 'forgot g' },
      { value: E((2 * u * u) / G), trap: 'put the factor 2 on the wrong side' },
      { value: E(r(h / 2)), trap: 'halved twice' },
      { value: E(r(h / 4)), trap: 'divided by 4g instead of 2g' },
      { value: E(r(u / (2 * G))), trap: 'forgot to square the speed' },
      { value: E(r(h * 2)), trap: 'doubled the height' },
    ],
    solution: `$\\tfrac12 m u^2 = mgh$, so $h = \\dfrac{u^2}{2g} = \\dfrac{${u * u}}{20} = ${n(h)}\\ \\text{m}$.`,
    trap: 'h = u²/(2g): the ½ from the kinetic energy stays, giving ÷20 with g = 10.',
    tags: ['conservation', 'projectile', 'height'],
    params: { variant: 'throw-up', u },
  });
}

function pendulumQ(rng: RNG): Generated | null {
  const m = rng.pick([0.2, 0.5, 1, 2, 30, 40]);
  const byLength = rng.bool(0.4);
  if (byLength) {
    // released from 60° to the vertical: the drop is L(1 − cos 60°) = L/2, so v² = 2g(L/2) = gL
    const L = rng.pick([0.4, 0.9, 1.6, 2.5, 3.6, 4.9, 6.4, 8.1, 10]);
    const answer = exactRoot(G * L);
    if (!answer) return null;
    const v = answer.toNumber();
    const who = m >= 30 ? `A child of mass ${m} kg sits on a swing whose ropes are ${n(L)} m long. The swing` : `A pendulum bob of mass ${n(m)} kg hangs on a light string of length ${n(L)} m. The bob`;
    return pack(rng, {
      stem: `${who} is pulled aside until the ${m >= 30 ? 'ropes make' : 'string makes'} an angle of $60^{\\circ}$ with the vertical and is released from rest. ${TAKE_G} Find the speed at the lowest point.`,
      answer: E(v),
      unit: U_MS,
      must: [
        { value: root(2 * G * L), trap: 'took the drop in height to be the whole length L' },
        { value: E(G * L), trap: 'forgot to take the square root: gave v²' },
      ],
      extra: [
        { value: E(2 * G * L), trap: 'used the whole length as the drop and forgot the square root' },
        { value: E(2 * v), trap: 'doubled the speed' },
        { value: E(r(v / 2)), trap: 'halved the speed' },
        { value: root(2 * G * L * (1 - Math.cos(Math.PI / 6))), trap: 'used cos 30° instead of cos 60° for the drop' },
        { value: root((G * L) / 2), trap: 'took the drop to be L/4' },
      ],
      solution: `The drop in height is $L - L\\cos 60^{\\circ} = \\tfrac12 L = ${n(L / 2)}\\ \\text{m}$, so $v = \\sqrt{2gh} = \\sqrt{2 \\times 10 \\times ${n(L / 2)}} = \\sqrt{${n(G * L)}} = ${n(v)}\\ ${U_MS}$.`,
      trap: 'The vertical drop is L(1 − cos θ), which for 60° is L/2, not the full length of the string.',
      tags: ['conservation', 'pendulum', 'speed'],
      params: { variant: 'pendulum-length', L },
    });
  }
  const h = rng.pick([0.2, 0.45, 0.8, 1.25, 1.8, 2.45, 3.2, 4.05, 5, 7.2]);
  const hAnswer = exactRoot(2 * G * h);
  if (!hAnswer) return null;
  const v = hAnswer.toNumber();
  const who = m >= 30 ? `A child of mass ${m} kg on a swing is released from rest ${n(h)} m above the lowest point of the swing.` : `A pendulum bob of mass ${n(m)} kg is released from rest at a point ${n(h)} m above its lowest position.`;
  return pack(rng, {
    stem: `${who} Air resistance is negligible. ${TAKE_G} Find the speed at the lowest point.`,
    answer: E(v),
    unit: U_MS,
    must: [
      { value: root(G * h), trap: 'forgot the 2: used v = √(gh)' },
      { value: E(2 * G * h), trap: 'forgot to take the square root: gave v²' },
    ],
    extra: [
      { value: E(G * h), trap: 'forgot the 2 and the square root' },
      { value: E(2 * v), trap: 'doubled the speed' },
      { value: E(r(v / 2)), trap: 'halved the speed' },
      { value: root(4 * G * h), trap: 'doubled g as well as using the 2' },
      { value: root((G * h) / 2), trap: 'used v = √(gh/2): halved instead of doubling' },
    ],
    solution: `$mgh = \\tfrac12 m v^2$, so $v = \\sqrt{2gh} = \\sqrt{2 \\times 10 \\times ${n(h)}} = \\sqrt{${n(2 * G * h)}} = ${n(v)}\\ ${U_MS}$.`,
    trap: 'Only the vertical drop matters: v = √(2gh), with the mass cancelling.',
    tags: ['conservation', 'pendulum', 'speed'],
    params: { variant: 'pendulum-height', h },
  });
}

// ----------------------------------------------------------------------------- level 4

function fractionLostQ(rng: RNG): Generated | null {
  const k = rng.int(1, 6);
  const h = 5 * k * k; // √(2gh) = 10k
  // the fraction remaining is a perfect square, so the speed at the bottom is a whole number
  const f = rng.pick([19, 36, 51, 64, 75, 84]);
  const v0 = 10 * k;
  const answer = exactRoot(2 * G * h * (1 - f / 100));
  if (!answer) return null;
  const who = rng.pick([
    `A skier of mass 60 kg starts from rest and descends a slope of vertical height ${h} m.`,
    `A sledge and rider of total mass 80 kg start from rest at the top of a slope ${h} m high.`,
    `A rollercoaster car of mass 500 kg starts from rest at a height of ${h} m above the bottom of a dip.`,
  ]);
  return pack(rng, {
    stem: `${who} During the descent ${f}% of the initial gravitational potential energy is lost to friction and air resistance. ${TAKE_G} Find the speed at the bottom.`,
    answer,
    unit: U_MS,
    must: [
      { value: E(v0), trap: 'ignored the energy lost' },
      { value: E(v0 * (1 - f / 100)), trap: `reduced the speed by ${f}% instead of the energy` },
    ],
    extra: [
      { value: root(2 * G * h * (f / 100)), trap: 'used the fraction lost instead of the fraction remaining' },
      { value: E(2 * G * h * (1 - f / 100)), trap: 'forgot to take the square root: gave v²' },
      { value: root(G * h * (1 - f / 100)), trap: 'forgot the 2' },
      { value: root(4 * G * h * (1 - f / 100)), trap: 'doubled g as well as using the 2' },
      { value: E(r(answer.toNumber() / 2)), trap: 'halved the speed' },
      { value: approx(v0 * Math.sqrt(1 - f / 100) * 1.5), trap: 'took the square root of the fraction twice over' },
    ],
    solution: `$\\tfrac12 m v^2 = ${n(1 - f / 100)}\\,mgh$, so $v^2 = ${n(1 - f / 100)} \\times 2 \\times 10 \\times ${h} = ${n(2 * G * h * (1 - f / 100))}$ and $v = ${n(answer.toNumber())}\\ ${U_MS}$.`,
    trap: 'A percentage of the energy is lost, not of the speed: KE ∝ v², so the speed scales by the square root of the fraction remaining.',
    tags: ['conservation', 'friction', 'percentage-loss'],
    params: { variant: 'fraction-lost', h, f },
  });
}

function frictionWorkQ(rng: RNG): Generated | null {
  const m = rng.pick([2, 4, 5, 10, 20, 40, 50, 60, 70, 80, 100]);
  const h = rng.pick([2, 3, 4, 5, 6, 8, 10, 12, 15, 20]);
  const v = rng.pick([2, 4, 5, 6, 8, 10, 12, 14, 15, 16, 18]);
  const PE = m * G * h, KE = 0.5 * m * v * v;
  const Wf = PE - KE;
  if (Wf <= 0 || !Number.isInteger(Wf) || Wf < 0.1 * PE || Wf > 0.8 * PE) return null;
  const inKJ = Wf >= 10000 && Wf % 100 === 0;
  const scale = inKJ ? 1 / 1000 : 1;
  const who = rng.pick([
    `A cyclist and bicycle of total mass ${m} kg freewheel from rest down a hill of vertical height ${h} m, reaching a speed of $${v}\\ ${U_MS}$ at the bottom.`,
    `A child of mass ${m} kg slides from rest down a slide of vertical height ${h} m and reaches the bottom at $${v}\\ ${U_MS}$.`,
    `A block of mass ${m} kg is released from rest and slides ${h} m vertically down a rough slope, arriving at the bottom at $${v}\\ ${U_MS}$.`,
  ]);
  return pack(rng, {
    stem: `${who} ${TAKE_G} Find the work done against friction${inKJ ? ', in kJ' : ''}.`,
    answer: E(Wf * scale),
    unit: inKJ ? U_KJ : U_J,
    must: [
      { value: E(PE * scale), trap: 'ignored the kinetic energy at the bottom' },
      { value: E(KE * scale), trap: 'gave the kinetic energy at the bottom' },
    ],
    extra: [
      { value: E((PE + KE) * scale), trap: 'added the kinetic energy instead of subtracting it' },
      { value: PE - m * v * v > 0 ? E((PE - m * v * v) * scale) : null, trap: 'forgot the ½ in the kinetic energy' },
      { value: E((PE - 0.5 * m * v) * scale), trap: 'forgot to square the speed' },
      { value: E(Wf * scale * 2), trap: 'doubled the result' },
    ],
    solution: `PE lost $= mgh = ${m} \\times 10 \\times ${h} = ${PE}\\ \\text{J}$; KE gained $= \\tfrac12 \\times ${m} \\times ${v}^2 = ${n(KE)}\\ \\text{J}$; the difference, $${n(Wf)}\\ \\text{J}${inKJ ? ` = ${n(Wf * scale)}\\ \\text{kJ}` : ''}$, is the work done against friction.`,
    trap: 'Work against friction = PE lost − KE gained; both terms are needed and the KE keeps its ½ and its v².',
    tags: ['conservation', 'friction', 'work'],
    params: { variant: 'friction-work', m, h, v, inKJ },
  });
}

// ----------------------------------------------------------------------------- level 5

/**
 * Rollercoaster: the speed at B given the speed at A, the drop and the energy lost to friction.
 * Both the answer and the frictionless speed are whole numbers, so "pick the only whole number that
 * could be a speed" is not a strategy; the other mistakes are printed as one-decimal-place speeds and
 * every one of them is a speed a rollercoaster could have.
 */
function coasterQ(rng: RNG): Generated | null {
  const m = rng.pick([200, 400, 500, 800, 1000]);
  const u = rng.pick([0, 5, 10, 12, 15, 20]);
  // v0 is the speed at B with no friction: choose it so the drop A→B is a whole number of metres
  const v0 = rng.pick([15, 18, 20, 22, 25, 28, 30, 32, 35, 40]);
  if (v0 <= u + 4) return null;
  if ((v0 * v0 - u * u) % 20 !== 0) return null;
  const drop = (v0 * v0 - u * u) / 20;
  if (drop < 10 || drop > 60) return null;
  const hB = rng.pick([0, 5, 8, 10, 12, 15, 20, 25]);
  const hA = hB + drop;
  if (hA > 90) return null;
  const v = rng.pick([10, 12, 15, 16, 18, 20, 24, 25, 30]);
  if (v >= v0 || v <= u) return null;
  const W = (m * (v0 * v0 - v * v)) / 2; // energy lost to friction
  if (W <= 0 || W % 1000 !== 0) return null;
  const WkJ = W / 1000;
  // a round number of kJ (at most two significant figures) that divides by the mass to whole joules per kg
  if (WkJ > 300 || W < 0.05 * m * G * drop || !Number.isInteger(W / m)) return null;
  if (!(WkJ % 10 === 0 || (WkJ < 100 && WkJ % 5 === 0))) return null;
  const startA = u === 0 ? `is released from rest at point $A$, ${hA} m above the ground` : `passes point $A$, ${hA} m above the ground, at $${u}\\ ${U_MS}$`;
  const atB = hB === 0 ? 'point $B$ at ground level' : `point $B$, ${hB} m above the ground`;
  return pack(rng, {
    stem: `A rollercoaster car of mass ${m} kg ${startA}. Between $A$ and ${atB}, ${WkJ} kJ of energy is lost to friction. ${TAKE_G} Find the speed of the car at $B$.`,
    answer: E(v),
    unit: U_MS,
    must: [
      { value: E(v0), trap: 'ignored the energy lost to friction' },
      { value: root(u * u + 2 * G * drop - W / m), trap: 'lost the factor 2 when converting the energy lost into v²' },
    ],
    extra: [
      { value: u ? root(2 * G * drop - (2 * W) / m) : null, trap: 'ignored the speed at A' },
      { value: hB ? root(v * v + 2 * G * hB) : null, trap: 'used the height of A above the ground instead of the drop from A to B' },
      { value: hB && u * u + 2 * G * hB > (2 * W) / m ? root(u * u + 2 * G * hB - (2 * W) / m) : null, trap: 'used the height of B above the ground as the drop' },
      { value: root(u * u + 2 * G * drop - (4 * W) / m), trap: 'subtracted the energy lost twice' },
      { value: root(u * u + 2 * G * drop + (2 * W) / m), trap: 'added the energy lost instead of subtracting it' },
      { value: root(u * u + 2 * G * drop - (2 * WkJ) / m), trap: 'forgot to convert kJ to J' },
      { value: v * v <= 12 * v ? E(v * v) : null, trap: 'forgot to take the square root: gave v²' },
      { value: E(r(v / 2)), trap: 'halved the speed' },
    ],
    solution: `Energy per kilogram: $\\tfrac12 v^2 = \\tfrac12 u^2 + g\\,\\Delta h - \\dfrac{W}{m} = ${n((u * u) / 2)} + ${G * drop} - ${n(W / m)} = ${n((v * v) / 2)}$, so $v^2 = ${v * v}$ and $v = ${v}\\ ${U_MS}$.`,
    trap: 'Divide the energy lost by the mass and double it before subtracting from v²; use the drop A→B, not the height above the ground.',
    tags: ['conservation', 'rollercoaster', 'friction', 'speed'],
    params: { variant: 'coaster', m, u, hA, hB, W },
  });
}

function keRatioQ(rng: RNG): Generated | null {
  const kind = rng.pick(['height-drop', 'height-throw', 'speed-drop']);
  if (kind === 'height-drop') {
    // dropped from H: KE = k × GPE when (H − h) = k h, i.e. h = H/(k + 1)
    const k = rng.pick([1, 2, 3, 4]);
    const H = rng.pick([10, 12, 15, 16, 20, 24, 25, 30, 40, 45, 50, 60, 80, 100]);
    if (H % (k + 1) !== 0) return null;
    const h = H / (k + 1);
    const times = k === 1 ? 'equal to' : k === 2 ? 'twice' : k === 3 ? 'three times' : 'four times';
    return pack(rng, {
      stem: `A ball is dropped from rest from a height of ${H} m above the ground. Air resistance is negligible. Taking the ground as the zero of potential energy, find the height of the ball above the ground when its kinetic energy is ${times} its gravitational potential energy.`,
      answer: E(h),
      unit: U_M,
      must: [
        { value: E(H - h), trap: 'gave the distance fallen rather than the height above the ground' },
        { value: k > 1 ? E(H / k) : E(H / 4), trap: k > 1 ? 'divided by k instead of k + 1' : 'divided by 4 instead of 2' },
      ],
      extra: [
        { value: k !== 1 ? E(H / 2) : null, trap: 'split the energy equally regardless of the ratio' },
        { value: E(h / 2), trap: 'halved the result' },
        { value: E(2 * h), trap: 'doubled the result' },
        { value: E((k * H) / (k + 1) / 2), trap: 'halved the distance fallen' },
      ],
      solution: `KE gained $= mg(H - h)$ and GPE $= mgh$, so $H - h = ${k}h$ gives $h = \\dfrac{H}{${k + 1}} = \\dfrac{${H}}{${k + 1}} = ${n(h)}\\ \\text{m}$.`,
      trap: 'KE = k × GPE means the distance fallen is k times the height remaining: h = H/(k + 1), not H/k.',
      tags: ['conservation', 'ratio', 'height'],
      params: { variant: 'ratio-height-drop', H, k },
    });
  }
  if (kind === 'height-throw') {
    const u = rng.pick([10, 20, 30, 40, 60]);
    const h = (u * u) / (4 * G);
    return pack(rng, {
      stem: `A ball is thrown vertically upwards from the ground at $${u}\\ ${U_MS}$. Air resistance is negligible. ${TAKE_G} Find the height at which its kinetic energy equals its gravitational potential energy.`,
      answer: E(h),
      unit: U_M,
      must: [
        { value: E((u * u) / (2 * G)), trap: 'found the maximum height (all the energy as PE)' },
        { value: E((u * u) / G), trap: 'forgot the ½ in the kinetic energy and found u²/g' },
      ],
      extra: [
        { value: E((u * u) / (8 * G)), trap: 'halved once too often' },
        { value: E(u / (2 * G)), trap: 'forgot to square the speed' },
        { value: E(2 * h), trap: 'doubled the result' },
        { value: E((u * u) / 2), trap: 'forgot g' },
      ],
      solution: `Total energy $= \\tfrac12 m u^2$; when KE = GPE each is half of that, so $mgh = \\tfrac14 m u^2$ and $h = \\dfrac{u^2}{4g} = \\dfrac{${u * u}}{40} = ${n(h)}\\ \\text{m}$.`,
      trap: 'When KE = GPE the potential energy is half the total, so the height is half the maximum height u²/(2g).',
      tags: ['conservation', 'ratio', 'projectile'],
      params: { variant: 'ratio-height-throw', u },
    });
  }
  // speed when KE = GPE for a ball dropped from H: ½v² = gH/2 → v = √(gH)
  const H = rng.pick([2.5, 3.6, 4.9, 6.4, 8.1, 10, 12.1, 14.4, 40, 90]);
  const answer = exactRoot(G * H);
  if (!answer) return null;
  return pack(rng, {
    stem: `A ball is dropped from rest from a height of ${n(H)} m above the ground. Air resistance is negligible. Taking the ground as the zero of potential energy, find the speed of the ball at the instant its kinetic energy equals its gravitational potential energy. ${TAKE_G}`,
    answer,
    unit: U_MS,
    must: [
      { value: root(2 * G * H), trap: 'found the speed on reaching the ground' },
      { value: E(G * H), trap: 'forgot to take the square root: gave v²' },
    ],
    extra: [
      { value: approx(Math.sqrt(2 * G * H) / 2), trap: 'halved the landing speed instead of halving the energy' },
      { value: root((G * H) / 2), trap: 'halved the energy twice' },
      { value: E(G * H * 2), trap: 'forgot the square root and used the full energy' },
      { value: E(H), trap: 'gave the height' },
      { value: E(r(answer.toNumber() * 2)), trap: 'doubled the speed' },
      { value: root(G * H / 4), trap: 'took a quarter of the energy' },
    ],
    solution: `When KE = GPE each is half the initial energy $mgH$, so $\\tfrac12 m v^2 = \\tfrac12 mgH$ and $v = \\sqrt{gH} = \\sqrt{${n(G * H)}} = ${n(answer.toNumber())}\\ ${U_MS}$.`,
    trap: 'Halving the energy divides the speed by √2, not by 2: v = √(gH), which is the landing speed √(2gH) divided by √2.',
    tags: ['conservation', 'ratio', 'speed'],
    params: { variant: 'ratio-speed-drop', H },
  });
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'phy.energy.conservation',
  module: 'PHY',
  topic: 'energy',
  title: 'Kinetic and potential energy',
  levels: {
    1: 'KE = ½mv² and GPE = mgh with clean numbers (sometimes solved for v, m or h)',
    2: 'dropped from h with 2gh a perfect square (3.2 m, 20 m, 45 m …) → speed √(2gh); the mass is a red herring',
    3: 'height reached by a ball thrown up at u (u²/20); pendulum or swing → speed at the bottom, including a string at 60°',
    4: 'a percentage of the energy lost to friction (the fraction left is a perfect square) → speed; work done against friction from the speeds',
    5: 'rollercoaster with a stated energy loss → speed at a lower point; height or speed at which KE = n × GPE',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return pickVariant(rng, [keQ, gpeQ]);
        case 2: return dropQ(rng);
        case 3: return pickVariant(rng, [throwUpQ, pendulumQ]);
        case 4: return pickVariant(rng, [fractionLostQ, frictionWorkQ]);
        default: return pickVariant(rng, [coasterQ, keRatioQ]);
      }
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const p = q.params as Record<string, number> & { variant: string; inKJ?: boolean };
    const got = q.answer.value.toNumber();
    const close = (x: number) => Math.abs(got - x) < 1e-9 * Math.max(1, Math.abs(x));
    // SUVAT helpers: speed after falling s from rest, and the drop needed to reach speed v from rest
    const fallSpeed = (s: number) => { const t = Math.sqrt((2 * s) / G); return G * t; };
    const fallFor = (v: number) => { const t = v / G; return 0.5 * G * t * t; };
    switch (p.variant) {
      case 'ke': {
        // work done by a constant force accelerating the mass from rest: F = ma over s = v²/(2a) (SUVAT)
        const a = 2;
        const s = (p.v * p.v) / (2 * a);
        const W = p.m * a * s;
        return close(p.inKJ ? W / 1000 : W);
      }
      case 'ke-speed':
        // substitute back: half the mass times the speed squared must be the stated energy
        return Math.abs(0.5 * p.m * got * got - p.KE) < 1e-9;
      case 'gpe': {
        // the KE a body would have after falling h (SUVAT), which equals the PE at height h
        const v = fallSpeed(p.h);
        const KE = 0.5 * p.m * v * v;
        return close(p.inKJ ? KE / 1000 : KE);
      }
      case 'gpe-height':
        return Math.abs(0.5 * p.m * fallSpeed(got) ** 2 - p.PE) < 1e-9;
      case 'gpe-mass':
        return Math.abs(0.5 * got * fallSpeed(p.h) ** 2 - p.PE) < 1e-9;
      case 'drop':
        return close(fallSpeed(p.h));
      case 'throw-up': {
        // time to the top u/g, then s = ut − ½gt²
        const t = p.u / G;
        return close(p.u * t - 0.5 * G * t * t);
      }
      case 'pendulum-length': {
        const h = p.L * (1 - Math.cos(Math.PI / 3));
        return close(fallSpeed(h));
      }
      case 'pendulum-height':
        return close(fallSpeed(p.h));
      case 'fraction-lost': {
        // per kilogram: KE at the bottom = (1 − f) g h; compare v²/2
        const kePerKg = (1 - p.f / 100) * G * p.h;
        return Math.abs(0.5 * got * got - kePerKg) < 1e-9;
      }
      case 'friction-work': {
        // energy bookkeeping with an arbitrary reference: total at the top vs total at the bottom
        const top = p.m * G * p.h + 0, bottom = 0 + 0.5 * p.m * p.v * p.v;
        const W = top - bottom;
        return close(p.inKJ ? W / 1000 : W);
      }
      case 'coaster': {
        // SUVAT with a constant decelerating force spread over the vertical drop
        const drop = p.hA - p.hB;
        const aEff = G - p.W / (p.m * drop);
        return Math.abs(got * got - (p.u * p.u + 2 * aEff * drop)) < 1e-9;
      }
      case 'ratio-height-drop': {
        // at height got: KE from SUVAT for the distance fallen, GPE from the height; check the ratio is k
        const fallen = p.H - got;
        const v = fallSpeed(fallen);
        const ke = 0.5 * v * v, pe = G * got;
        return Math.abs(ke - p.k * pe) < 1e-9;
      }
      case 'ratio-height-throw': {
        // speed at height got from v² = u² − 2g·s; KE must equal GPE
        const v2 = p.u * p.u - 2 * G * got;
        return v2 > 0 && Math.abs(0.5 * v2 - G * got) < 1e-9;
      }
      case 'ratio-speed-drop': {
        // height where the speed is got (SUVAT), then compare KE with GPE
        const fallen = fallFor(got);
        const h = p.H - fallen;
        return h > 0 && Math.abs(0.5 * got * got - G * h) < 1e-9;
      }
      default:
        return false;
    }
  },
});
