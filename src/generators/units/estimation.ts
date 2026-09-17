import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, Exact } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import type { Option } from '../../core/template';
import type { RNG } from '../../core/rng';

/**
 * Order-of-magnitude estimates. Every stem states the assumptions, so the answer is determinate:
 * either "which of these is the best estimate" (five options a factor of ten apart, kind 'choice')
 * or "find …, giving your answer to 1 significant figure" (kind 'exact', with named mistakes
 * as distractors).
 * Level 1: the mass of the air in a room (ρ = 1.2 kg m⁻³); the mass of the water in a bath
 * Level 2: heartbeats in a year; the volume of air breathed in a day
 * Level 3: the energy to boil a kettle of water; the time a kettle takes
 * Level 4: the force of the atmosphere on a wall; the sunlight falling on a roof; the time light
 *          takes to reach us from the Sun and the planets
 * Level 5: the power of a person climbing stairs; the mass of water in a swimming pool; a car's fuel energy
 *
 * Both forms name the mistake behind every wrong option: in 'choice' mode each rung of the ladder
 * carries either the named mistake that lands on it or the size of the slip that would produce it.
 * In 'exact' mode a candidate whose value is within a factor of 1.5 of the answer is thrown away —
 * the rounding an estimate invites must never land on a distractor — and the remaining distractors
 * are chosen so that the answer sits above and below them equally often.
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

/** How big a slip a rung of the ladder (or a power-of-ten pad) represents. */
function slipTrap(k: number): string {
  const size = Math.abs(k) === 1 ? 'a factor of 10' : `a factor of $10^{${Math.abs(k)}}$`;
  return `${size} ${k > 0 ? 'too large' : 'too small'}: a conversion in the chain missed or applied the wrong way round`;
}

/**
 * The rungs of the power-of-ten ladder that a *named* mistake actually lands on, as k → its trap.
 * These are the rungs the ladder is built from: an option a candidate can reach by making a mistake
 * the question is about, rather than one labelled only with the size of the slip.
 */
function namedRungs(e: Est): Map<number, string> {
  const out = new Map<number, string>();
  for (const m of e.mistakes) {
    if (m.value === null || !(m.value > 0)) continue;
    const lg = Math.log10(m.value / e.value);
    const k = Math.round(lg);
    if (k === 0 || Math.abs(lg - k) > 0.5 || Math.abs(k) > 4) continue;
    if (!out.has(k)) out.set(k, m.trap);
  }
  return out;
}

/**
 * Pick `count` distractors with a random number of them below the answer.
 *
 * The named mistakes in an estimate nearly all pull the same way (a forgotten factor makes the
 * answer too small), so taking them in order pins the answer to the same rank in every question —
 * "pick the second largest" then scores without any physics. Candidates keep their order inside
 * each side, so the named mistakes still come before the power-of-ten pads.
 */
function balance(rng: RNG, answer: Exact, named: Distractor[], pads: Distractor[], count: number): Distractor[] {
  const a = answer.toNumber();
  const out: Distractor[] = [];
  const take = (q: Distractor[], want: number) => { for (const d of q) { if (want <= 0 || out.length >= count) break; if (!out.includes(d)) { out.push(d); want--; } } };
  const below = (ds: Distractor[]) => ds.filter((d) => d.value.toNumber() < a);
  const above = (ds: Distractor[]) => ds.filter((d) => d.value.toNumber() > a);
  const nb = below(named), na = above(named);
  const lo = Math.max(0, count - na.length);
  const hi = Math.min(count, nb.length);
  take(nb, hi >= lo ? rng.int(lo, hi) : 0);
  take(na, count - out.length);
  // a side short of *named* mistakes borrows from the other side before any pad is used
  take(nb, count - out.length);
  take(pads.length ? below(pads) : [], count - out.length);
  take(pads.length ? above(pads) : [], count - out.length);
  return out;
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
  // A mistake whose 1 s.f. value *is* the answer would be quietly dropped from the options (a
  // duplicate) and the candidate who made it would still score. Redraw the parameters instead:
  // for the air in a room that only means avoiding volumes near 100/ρ.
  for (const m of e.mistakes) {
    if (m.value === null || !(m.value > 0)) continue;
    if (Math.abs(sf1(m.value) - target) <= 1e-9 * target) return null;
  }
  const format = fmtFor(target);
  const disp = (v: number): string => `$${E(round(v)).toLatex({ format })}${e.unit ? `\\ ${e.unit}` : ''}$`;

  if (e.mode === 'choice') {
    /*
     * The four wrong rungs are chosen from the ones a named mistake lands on, working outwards, and
     * only then filled with "a factor of 10^k out" rungs — which are kept within a factor of 100 of
     * the answer, with one rung at 10^±3 as a last resort. A contiguous five-rung run instead put an
     * option 10^3 or 10^4 away in four questions out of five (a bath holding 3000 tonnes of water):
     * absurd on sight, so it cost the question an option and told the candidate nothing.
     *
     * How many rungs sit below the answer is still drawn first, so its rank gives nothing away.
     */
    const named = namedRungs(e);
    const rung = (k: number) => ({ k, trap: named.get(k) ?? slipTrap(k), named: named.has(k) });
    // Each side offers the rungs from 10^1 to 10^4 away, ordered by how good an option they make: a
    // rung a named mistake lands on beats a bare "10^k out" rung a decade nearer, and among equals
    // the nearer rung wins. Four rungs a side means the answer can sit anywhere in the sorted list.
    const side = (sign: number) =>
      [1, 2, 3, 4]
        .map((k) => rung(sign * k))
        .sort((p, q) => (Math.abs(p.k) + (p.named ? 0 : 1.5)) - (Math.abs(q.k) + (q.named ? 0 : 1.5)));
    /*
     * A rung no named mistake reaches carries only "a factor of 10^k out", which names the size of
     * the error rather than anything a candidate did. So the list is built with at most one such rung,
     * and the cap is only loosened when the variant genuinely cannot offer four named ones. A rung
     * beyond a factor of 100 is the weakest of all — nobody is out by 10^4 and cannot tell — so no
     * more than two of those may ever appear, which is what it costs to let the answer be the
     * smallest or the largest option in a variant whose mistakes all pull one way.
     */
    let chosen: { k: number; trap: string; named: boolean }[] = [];
    for (const maxUnnamed of [1, 2, 4]) {
      const below = side(-1), above = side(1);
      chosen = [];
      let far = 0;
      let unnamed = 0;
      const take = (c: { k: number; trap: string; named: boolean }): boolean => {
        if (chosen.length >= 4) return false;
        const isFar = !c.named && Math.abs(c.k) >= 3;
        if (!c.named && unnamed >= maxUnnamed) return false;
        if (isFar && far >= 2) return false;
        if (cleanNum(round(target * Math.pow(10, c.k))) === null) return false;
        if (isFar) far++;
        if (!c.named) unnamed++;
        chosen.push(c);
        return true;
      };
      const drain = (q: typeof below, want: number) => {
        const rest: typeof below = [];
        while (want > 0 && q.length > 0) {
          const c = q.shift()!;
          if (take(c)) want--;
          else rest.push(c);
        }
        q.unshift(...rest); // a rung passed over now may still be needed to fill the list out
      };
      drain(below, rng.int(Math.max(0, 4 - above.length), Math.min(4, below.length)));
      drain(above, 4 - chosen.length);
      drain(below, 4 - chosen.length);
      drain(above, 4 - chosen.length);
      if (chosen.length >= 4) break;
    }
    if (chosen.length < 4) return null;
    const wrong = chosen.map((c) => round(target * Math.pow(10, c.k)));
    const values = [target, ...wrong];
    if (new Set(values).size !== values.length) return null;
    let options: Option[];
    try {
      options = buildChoiceOptions(rng, disp(target), chosen.map((c) => ({ display: disp(round(target * Math.pow(10, c.k))), trap: c.trap })));
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

  const cands: Distractor[] = [];
  const pads: Distractor[] = [];
  const seen: Exact[] = [ex];
  for (const m of e.mistakes) {
    if (m.value === null) continue;
    const v = cleanNum(sf1(m.value));
    if (!v || seen.some((s) => s.equals(v))) continue;
    const r = v.toNumber() / target;
    if (r < 1e-4 || r > 1e4) continue;
    // An option within 50% of the answer punishes the rounding this kind of question invites
    // (1.2 ≈ 1, g ≈ 10): the candidate who rounds would find their number in the list.
    if (r > 1 / 1.5 && r < 1.5) continue;
    seen.push(v);
    cands.push({ value: v, trap: m.trap });
  }
  for (const k of rng.shuffle([1, -1, 2, -2, 3, -3])) {
    const v = cleanNum(round(target * Math.pow(10, k)));
    if (!v || seen.some((s) => s.equals(v))) continue;
    seen.push(v);
    pads.push({ value: v, trap: slipTrap(k) });
  }
  const ds = balance(rng, ex, cands, pads, 4);
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

/**
 * The ask. Every assumption is already in the stem, so the 1 s.f. form is a determinate
 * calculation and says "Find", not "Estimate": a candidate must not be invited to round and then
 * punished for it.
 */
function ask(mode: 'choice' | 'exact', what: string, inUnits = ''): string {
  return mode === 'choice'
    ? `${ASK_CHOICE} of ${what}?`
    : `Find ${what}${inUnits}, giving your answer to 1 significant figure.`;
}

// ----------------------------------------------------------------------------- level 1

/** The mass of the air in a room. */
function airMassQ(rng: RNG): Generated | null {
  const rho = 1.2;
  const l = rng.pick([4, 5, 6, 8]);
  const w = rng.pick([3, 4, 5, 6]);
  const h = rng.pick([2.5, 3]);
  const value = round(rho * l * w * h);
  const mode = modeOf(rng);
  const big = Math.max(l, w, h);
  const lead = `The density of air is $1.2\\ \\text{kg m}^{-3}$. A room measures $${n(l)}\\ \\text{m}$ by $${n(w)}\\ \\text{m}$ by $${n(h)}\\ \\text{m}$.`;
  return estimate(rng, {
    stem: `${lead}\n\n${ask(mode, 'the mass of the air in the room')}`,
    value,
    unit: '\\text{kg}',
    mode,
    mistakes: [
      { value: round(rho * l * w), trap: 'used the floor area and forgot the height' },
      { value: round(1000 * l * w * h), trap: 'used the density of water, $1000\\ \\text{kg m}^{-3}$, instead of that of air' },
      { value: round(l * w * h), trap: 'forgot to multiply by the density' },
      { value: round(rho * big * big * big), trap: 'treated the room as a cube on its longest side' },
      { value: round(rho * w * h), trap: 'used the area of one wall and left out its length' },
      { value: round((l * w * h) / rho), trap: 'divided by the density instead of multiplying' },
      { value: round(rho * l * w * h * 1000), trap: 'gave the mass in grams, not kilograms' },
      { value: round((rho * l * w * h) / 1000), trap: 'gave the mass in tonnes, not kilograms' },
      { value: round(12 * l * w * h), trap: 'misread the density of air as $12\\ \\text{kg m}^{-3}$' },
      { value: round(rho * l * w * h * 10), trap: 'gave the weight in newtons, not the mass in kilograms' },
      { value: round(1200 * l * w * h), trap: 'read the density as $1.2\\ \\text{g cm}^{-3}$, which is $1200\\ \\text{kg m}^{-3}$' },
      { value: rho, trap: 'quoted the density, not the mass' },
    ],
    solution: `Volume $= ${n(l)} \\times ${n(w)} \\times ${n(h)} = ${n(l * w * h)}\\ \\text{m}^{3}$, so the mass is $1.2 \\times ${n(l * w * h)} \\approx ${napp(value)}\\ \\text{kg}$, i.e. about $${n(sf1(value))}\\ \\text{kg}$.`,
    trap: 'A room is three-dimensional: leaving out one dimension changes the answer by a factor of the order of 10, and air is a thousand times less dense than water.',
    tags: ['density', 'volume'],
    params: { variant: 'air-mass', rho, l, w, h },
  });
}

/** The mass of the water in a bath. */
function bathQ(rng: RNG): Generated | null {
  const rho = 1000;
  const l = rng.pick([1.4, 1.5, 1.6, 1.8]);
  const w = rng.pick([0.5, 0.6, 0.7]);
  const d = rng.pick([0.2, 0.3, 0.4]);
  const value = round(rho * l * w * d);
  const mode = modeOf(rng);
  const lead = `Water has density $1000\\ \\text{kg m}^{-3}$. A bath holds water to a depth of $${n(d)}\\ \\text{m}$ over a rectangle measuring $${n(l)}\\ \\text{m}$ by $${n(w)}\\ \\text{m}$.`;
  return estimate(rng, {
    stem: `${lead}\n\n${ask(mode, 'the mass of the water in the bath')}`,
    value,
    unit: '\\text{kg}',
    mode,
    mistakes: [
      { value: round(rho * l * w), trap: 'used the surface area and forgot the depth' },
      { value: round(l * w * d), trap: 'gave the volume in $\\text{m}^{3}$, not the mass' },
      { value: round(rho * l * w * d * 1000), trap: 'worked in litres and then multiplied by the density again' },
      { value: round(1.2 * l * w * d), trap: 'used the density of air instead of that of water' },
      { value: round(rho * l * d), trap: 'used the area of one side of the bath and left out its width' },
      { value: round((l * w * d) / rho), trap: 'divided by the density instead of multiplying' },
      { value: round(rho * l * w * d * 1000), trap: 'gave the mass in grams, not kilograms' },
      { value: round(10000 * l * w * d), trap: 'used $10^{4}\\ \\text{kg m}^{-3}$ for the density of water' },
      { value: round(rho * l * w * d * 10), trap: 'gave the weight in newtons, not the mass in kilograms' },
      { value: rho, trap: 'quoted the density, not the mass' },
      { value: round(100 * l * w * d), trap: 'used $100\\ \\text{kg m}^{-3}$ for the density of water' },
    ],
    solution: `Volume $= ${n(l)} \\times ${n(w)} \\times ${n(d)} = ${napp(l * w * d)}\\ \\text{m}^{3}$, so the mass is $1000 \\times ${napp(l * w * d)} \\approx ${napp(value)}\\ \\text{kg}$, i.e. about $${n(sf1(value))}\\ \\text{kg}$.`,
    trap: 'Mass = density × volume, and a cubic metre of water is 1000 kg: the depth is part of the volume.',
    tags: ['density', 'volume'],
    params: { variant: 'bath', rho, l, w, d },
  });
}

// ----------------------------------------------------------------------------- level 2

/** Heartbeats in a year. */
function heartbeatsQ(rng: RNG): Generated | null {
  const rate = rng.pick([50, 55, 60, 65, 70, 72, 75, 80, 85, 90, 100]);
  const value = round(rate * 60 * 24 * 365);
  const mode = modeOf(rng);
  const lead = `A person’s heart beats ${n(rate)} times per minute. Take one year to be 365 days.`;
  return estimate(rng, {
    stem: `${lead}\n\n${ask(mode, 'the number of beats in one year')}`,
    value,
    unit: '',
    mode,
    mistakes: [
      { value: round(rate * 60 * 24), trap: 'stopped at one day' },
      { value: round(rate * 60 * 24 * 365 * 60), trap: 'multiplied by 60 once too often (beats are per minute, not per second)' },
      { value: round(rate * 24 * 365), trap: 'forgot the 60 minutes in an hour' },
      { value: round(rate * 3600 * 365), trap: 'used 3600 minutes in a day instead of 1440' },
      { value: round(rate * 60 * 365), trap: 'forgot the 24 hours in a day' },
      { value: round(rate * 60 * 24 * 365 * 10), trap: 'counted ten years instead of one' },
      { value: round((rate * 60 * 24 * 365) / 10), trap: 'used 36.5 days in a year' },
      { value: round(rate * 60 * 24 * 30), trap: 'stopped at one month' },
      { value: round(rate * 60 * 24 * 7), trap: 'stopped at one week' },
      { value: round(rate * 60 * 24 * 24 * 365), trap: 'multiplied by the 24 hours twice' },
    ],
    solution: `Minutes in a year $= 60 \\times 24 \\times 365 \\approx 5 \\times 10^{5}$, so the beats number $${n(rate)} \\times 5.26 \\times 10^{5} \\approx ${E(sf1(value)).toLatex({ format: 'sf' })}$.`,
    trap: 'Chain the conversions: minutes → hours → days → years, and count 60 only once.',
    tags: ['time', 'orders of magnitude'],
    params: { variant: 'heartbeats', rate },
  });
}

/** The volume of air breathed in a day. */
function breathingQ(rng: RNG): Generated | null {
  const rate = rng.pick([10, 12, 14, 15, 16, 18, 20]);
  const litres = rng.pick([0.4, 0.5, 0.6, 0.75]);
  const value = round((rate * litres * 60 * 24) / 1000); // m³
  const mode = modeOf(rng);
  const lead = `A person takes ${n(rate)} breaths per minute and each breath has a volume of $${n(litres)}$ litres. Take $1000$ litres $= 1\\ \\text{m}^{3}$.`;
  return estimate(rng, {
    stem: `${lead}\n\n${ask(mode, 'the volume of air breathed in one day', ', in $\\text{m}^{3}$')}`,
    value,
    unit: '\\text{m}^{3}',
    mode,
    mistakes: [
      { value: round(rate * litres * 60 * 24), trap: 'left the answer in litres' },
      { value: round((rate * litres * 60 * 60 * 24) / 1000), trap: 'took the rate as breaths per second' },
      { value: round((rate * litres * 60) / 1000), trap: 'stopped at one hour' },
      { value: round((rate * litres * 24) / 1000), trap: 'forgot the 60 minutes in an hour' },
      { value: round((rate * litres * 60 * 24) / 1e6), trap: 'used $10^{6}$ litres in a cubic metre' },
      { value: round((rate * litres * 60 * 24) / 100), trap: 'used 100 litres in a cubic metre' },
      { value: round((rate * litres * 60 * 24) / 1e4), trap: 'used $10^{4}$ litres in a cubic metre' },
      { value: round((rate * 60 * 24) / 1000), trap: 'counted the breaths but forgot the volume of each one' },
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
  const m = rng.pick([0.4, 0.5, 0.6, 0.8, 1, 1.2, 1.5, 2]);
  const dT = rng.pick([50, 60, 70, 80]);
  const c = 4200;
  const value = round(m * c * dT);
  const mode = modeOf(rng);
  const lead = `Water has specific heat capacity $4200\\ \\text{J kg}^{-1}\\text{K}^{-1}$. A kettle heats $${n(m)}\\ \\text{kg}$ of water through $${n(dT)}\\ \\text{K}$.`;
  return estimate(rng, {
    stem: `${lead}\n\n${ask(mode, 'the energy transferred to the water')}`,
    value,
    unit: '\\text{J}',
    mode,
    mistakes: [
      { value: round(c * dT), trap: 'forgot the mass of water' },
      { value: round(m * c * dT * 1000), trap: 'read the specific heat capacity as $4200\\ \\text{kJ kg}^{-1}\\text{K}^{-1}$' },
      { value: round(m * c), trap: 'forgot the temperature rise' },
      { value: round((m * c * dT) / 1000), trap: 'gave the answer in kJ' },
      { value: round(m * dT), trap: 'forgot the specific heat capacity' },
      { value: round(m * 420 * dT), trap: 'read the specific heat capacity as $420\\ \\text{J kg}^{-1}\\text{K}^{-1}$' },
      { value: round(m * 1000 * dT), trap: 'used $1000\\ \\text{J kg}^{-1}\\text{K}^{-1}$, the value for air' },
      { value: round((c * dT) / m), trap: 'divided by the mass instead of multiplying' },
      { value: round((m * c) / dT), trap: 'divided by the temperature rise instead of multiplying' },
      { value: round(m * c * 100), trap: 'used a rise of $100\\ \\text{K}$ instead of the stated rise' },
    ],
    solution: `$E = mc\\Delta\\theta = ${n(m)} \\times 4200 \\times ${n(dT)} = ${n(value)}\\ \\text{J} \\approx ${E(sf1(value)).toLatex({ format: 'sf' })}\\ \\text{J}$.`,
    trap: 'All three factors matter: mass, specific heat capacity and temperature rise — and the answer is in joules, not kilojoules.',
    tags: ['energy', 'heating'],
    params: { variant: 'kettle-energy', m, c, dT },
  });
}

/** The time a kettle of a given power takes. */
function kettleTimeQ(rng: RNG): Generated | null {
  const m = rng.pick([0.4, 0.5, 0.6, 0.8, 1, 1.5]);
  const dT = rng.pick([50, 60, 70, 80]);
  const kw = rng.pick([2, 2.5, 3]);
  const c = 4200;
  const value = round((m * c * dT) / (kw * 1000));
  const mode = modeOf(rng);
  const lead = `A kettle of power $${n(kw)}\\ \\text{kW}$ heats $${n(m)}\\ \\text{kg}$ of water through $${n(dT)}\\ \\text{K}$. Water has specific heat capacity $4200\\ \\text{J kg}^{-1}\\text{K}^{-1}$ and no energy is lost.`;
  return estimate(rng, {
    stem: `${lead}\n\n${ask(mode, 'the time this takes', ', in seconds')}`,
    value,
    unit: '\\text{s}',
    mode,
    mistakes: [
      { value: round((m * c * dT) / kw), trap: 'left the power in kilowatts' },
      { value: round((c * dT) / (kw * 1000)), trap: 'forgot the mass of water' },
      { value: round((m * c * dT * kw) / 1000), trap: 'multiplied by the power instead of dividing' },
      { value: round((m * c * dT) / (kw * 1000) / 60), trap: 'gave the time in minutes' },
      { value: round((m * dT) / (kw * 1000)), trap: 'forgot the specific heat capacity' },
      { value: round((m * c * dT) / (kw * 1000) / 3600), trap: 'gave the time in hours' },
      { value: round((m * c * dT * 10) / (kw * 1000)), trap: 'used a specific heat capacity of $42\\,000\\ \\text{J kg}^{-1}\\text{K}^{-1}$' },
      { value: round(m * c * dT), trap: 'gave the energy in joules, not the time' },
      { value: round((m * 1000 * dT) / (kw * 1000)), trap: 'used $1000\\ \\text{J kg}^{-1}\\text{K}^{-1}$, the value for air' },
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
  const l = rng.pick([2, 2.5, 3, 3.5, 4, 5, 6, 8]);
  const h = rng.pick([2, 2.5, 3, 3.5]);
  const p = 1e5;
  const value = round(p * l * h);
  const mode = modeOf(rng);
  const lead = `Atmospheric pressure is $1.0 \\times 10^{5}\\ \\text{Pa}$. A wall measures $${n(l)}\\ \\text{m}$ by $${n(h)}\\ \\text{m}$.`;
  return estimate(rng, {
    stem: `${lead}\n\n${ask(mode, 'the force of the atmosphere on one side of the wall')}`,
    value,
    unit: '\\text{N}',
    mode,
    mistakes: [
      { value: round(p / (l * h)), trap: 'divided by the area instead of multiplying' },
      { value: round(1e6 * l * h), trap: 'took atmospheric pressure as $10^{6}\\ \\text{Pa}$' },
      { value: round(p * (l + h)), trap: 'added the sides instead of multiplying them' },
      { value: round(p * l * h * 2), trap: 'counted both sides of the wall' },
      { value: p, trap: 'gave the pressure, not the force' },
      { value: round((p * l * h) / 1000), trap: 'gave the force in kN, not N' },
      { value: round(p * 1000 * l * h), trap: 'read the pressure as $10^{5}\\ \\text{kPa}$' },
      { value: round(1e4 * l * h), trap: 'took atmospheric pressure as $10^{4}\\ \\text{Pa}$' },
    ],
    solution: `Area $= ${n(l)} \\times ${n(h)} = ${n(l * h)}\\ \\text{m}^{2}$, so $F = pA = 10^{5} \\times ${n(l * h)} = ${E(value).toLatex({ format: 'sf' })}\\ \\text{N}$, i.e. about $${E(sf1(value)).toLatex({ format: 'sf' })}\\ \\text{N}$.`,
    trap: 'Force = pressure × area; the wall does not fall over because the same air pushes on the other side.',
    tags: ['pressure', 'force'],
    params: { variant: 'atmosphere', p, l, h },
  });
}

/** The power of the sunlight falling on a roof. */
function solarQ(rng: RNG): Generated | null {
  const l = rng.pick([4, 5, 6, 8, 10]);
  const w = rng.pick([3, 4, 5, 6]);
  const I = 1000;
  const value = round(I * l * w);
  const mode = modeOf(rng);
  const lead = `Sunlight delivers about $1000\\ \\text{W m}^{-2}$ to a surface facing the Sun. A flat roof measures $${n(l)}\\ \\text{m}$ by $${n(w)}\\ \\text{m}$.`;
  return estimate(rng, {
    stem: `${lead}\n\n${ask(mode, 'the power of the sunlight falling on the roof')}`,
    value,
    unit: '\\text{W}',
    mode,
    mistakes: [
      { value: round(I / (l * w)), trap: 'divided by the area instead of multiplying' },
      { value: round(I * l * w * 3600), trap: 'multiplied by 3600: that is the energy in an hour, in joules' },
      { value: round(I * (l + w)), trap: 'added the sides instead of multiplying them' },
      { value: round((I * l * w) / 1000), trap: 'gave the answer in kW' },
      { value: I, trap: 'gave the intensity, not the power' },
      { value: round(I * l * w * 60), trap: 'multiplied by 60: that is the energy in a minute, in joules' },
      { value: round(I * 1000 * l * w), trap: 'read the intensity as $1000\\ \\text{kW m}^{-2}$' },
      { value: round(100 * l * w), trap: 'took the intensity as $100\\ \\text{W m}^{-2}$' },
    ],
    solution: `Area $= ${n(l)} \\times ${n(w)} = ${n(l * w)}\\ \\text{m}^{2}$, so $P = IA = 1000 \\times ${n(l * w)} = ${E(value).toLatex({ format: 'sf' })}\\ \\text{W}$, i.e. about $${E(sf1(value)).toLatex({ format: 'sf' })}\\ \\text{W}$.`,
    trap: 'Power = intensity × area: an intensity is already a power per square metre, so it is multiplied, not divided.',
    tags: ['power', 'intensity'],
    params: { variant: 'solar', I, l, w },
  });
}

/** The time light takes to reach the Earth from the Sun (or another body). */
function lightTimeQ(rng: RNG): Generated | null {
  const [name, d] = rng.pick([
    ['the Sun', 1.5e11], ['Mars at its closest', 7.5e10], ['the Moon', 3.9e8],
    ['Venus at its closest', 4.2e10], ['Jupiter at its closest', 6.3e11], ['Saturn at its closest', 1.2e12],
    ['Mercury at its closest', 9.2e10], ['Neptune at its closest', 4.3e12],
  ] as [string, number][]);
  const c = 3e8;
  const value = round(d / c);
  const mode = modeOf(rng);
  const lead = `${name.charAt(0).toUpperCase()}${name.slice(1)} is about $${E(d).toLatex({ format: 'sf' })}\\ \\text{m}$ from the Earth, and light travels at $3 \\times 10^{8}\\ \\text{m s}^{-1}$.`;
  return estimate(rng, {
    stem: `${lead}\n\n${ask(mode, `the time light takes to travel from ${name} to the Earth`, ', in seconds')}`,
    value,
    unit: '\\text{s}',
    mode,
    mistakes: [
      { value: round(c / d), trap: 'divided the wrong way round' },
      { value: round((d * 1000) / c), trap: 'treated the distance as kilometres' },
      { value: round(d / c / 60), trap: 'gave the time in minutes' },
      { value: round(d / (c * 1000)), trap: 'a factor of $10^{3}$ slipped in' },
      { value: round((d / c) * 60), trap: 'multiplied by 60 instead of leaving the answer in seconds' },
      { value: round(d / (c / 10)), trap: 'used $c = 3 \\times 10^{7}\\ \\text{m s}^{-1}$' },
      { value: round(d / (c * 10)), trap: 'used $c = 3 \\times 10^{9}\\ \\text{m s}^{-1}$' },
      { value: round(d / 3e5), trap: 'used the speed of light in $\\text{km s}^{-1}$, $3 \\times 10^{5}$' },
      { value: round(d / c / 3600), trap: 'gave the time in hours' },
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
  const h = rng.pick([3, 4, 5, 6]);
  const t = rng.pick([4, 5, 6, 8, 10, 12]);
  const value = round((m * 10 * h) / t);
  const mode = modeOf(rng);
  const lead = `A person of mass $${n(m)}\\ \\text{kg}$ climbs a flight of stairs of vertical height $${n(h)}\\ \\text{m}$ in $${n(t)}\\ \\text{s}$. Take $g = 10\\ \\text{m s}^{-2}$.`;
  return estimate(rng, {
    stem: `${lead}\n\n${ask(mode, 'the useful power developed')}`,
    value,
    unit: '\\text{W}',
    mode,
    mistakes: [
      { value: round(m * 10 * h), trap: 'gave the energy in J, not the power' },
      { value: round((m * h) / t), trap: 'forgot $g$ in $mgh$' },
      { value: round(m * 10 * h * t), trap: 'multiplied by the time instead of dividing' },
      { value: round((m * 10 * h) / t / 1000), trap: 'gave the answer in kW' },
      { value: round((m * 10 * h * 10) / t), trap: 'multiplied by $g$ twice' },
      { value: round((m * 1000 * 10 * h) / t), trap: 'used the mass in grams' },
      { value: round((10 * h) / t), trap: 'forgot the mass' },
      { value: round((m * 10 * h) / t / 60), trap: 'gave the energy per minute instead of per second' },
    ],
    solution: `Work done $= mgh = ${n(m)} \\times 10 \\times ${n(h)} = ${n(m * 10 * h)}\\ \\text{J}$, so $P = W/t = ${n(m * 10 * h)}/${n(t)} \\approx ${napp(value)}\\ \\text{W}$, i.e. about $${n(sf1(value))}\\ \\text{W}$.`,
    trap: 'Power is energy per second: the mgh must be divided by the time, and g must not be dropped.',
    tags: ['power', 'energy'],
    params: { variant: 'stairs', m, h, t },
  });
}

/**
 * A swimming pool, at level 5: never just ρV (that is the level-1 room of air with rounder numbers),
 * but volume → mass → energy, or volume → litres → time at a stated flow rate.
 */
function poolQ(rng: RNG, task: 'heat' | 'fill'): Generated | null {
  const l = rng.pick([20, 25, 50]);
  const w = rng.pick([8, 10, 12]);
  const d = rng.pick([1.5, 2, 2.5]);
  const rho = 1000;
  const V = round(l * w * d);
  const mass = round(rho * V);
  const mode = modeOf(rng);
  const size = `A swimming pool is $${n(l)}\\ \\text{m}$ long, $${n(w)}\\ \\text{m}$ wide and $${n(d)}\\ \\text{m}$ deep.`;

  if (task === 'heat') {
    const c = 4200;
    const dT = rng.pick([2, 3, 5]);
    const value = round(mass * c * dT);
    return estimate(rng, {
      stem: `${size} Water has density $1000\\ \\text{kg m}^{-3}$ and specific heat capacity $4200\\ \\text{J kg}^{-1}\\text{K}^{-1}$.\n\n${ask(mode, `the energy needed to warm the water in the pool by $${n(dT)}\\ \\text{K}$`)}`,
      value,
      unit: '\\text{J}',
      mode,
      mistakes: [
        { value: round(V * c * dT), trap: 'used the volume in m³ as the mass: the density was never used' },
        { value: round(mass * c), trap: 'forgot the temperature rise' },
        { value: round(mass * dT), trap: 'forgot the specific heat capacity' },
        { value: round((mass * c * dT) / 1000), trap: 'gave the answer in kJ' },
        { value: round(rho * l * w * c * dT), trap: 'forgot the depth of the pool' },
        { value: round(mass * c * 1000 * dT), trap: 'read the specific heat capacity as $4200\\ \\text{kJ kg}^{-1}\\text{K}^{-1}$' },
        { value: round(mass * c * dT * 10), trap: 'used a temperature rise ten times too large' },
      { value: round(2 * rho * (l * w + l * d + w * d) * c * dT), trap: 'used the surface area of the pool instead of its volume' },
      { value: round(mass * c * dT / 3600), trap: 'gave the answer in watt hours, not joules' },
      ],
      solution: `Volume $= ${n(l)} \\times ${n(w)} \\times ${n(d)} = ${napp(V)}\\ \\text{m}^{3}$, so the mass is $1000 \\times ${napp(V)} = ${E(mass).toLatex({ format: 'sf' })}\\ \\text{kg}$ and $E = mc\\Delta\\theta \\approx ${E(sf1(value)).toLatex({ format: 'sf' })}\\ \\text{J}$.`,
      trap: 'Three steps: volume, then mass (× density), then energy (× c × Δθ) — dropping any one of them costs a factor of 10³ or more.',
      tags: ['density', 'energy', 'heating'],
      params: { variant: 'pool-heat', rho, l, w, d, c, dT },
    });
  }

  const rate = rng.pick([10, 20, 25, 50]); // litres per second
  const value = round((V * 1000) / rate);
  return estimate(rng, {
    stem: `${size} It is filled by a hose delivering $${n(rate)}$ litres of water every second. Take $1000$ litres $= 1\\ \\text{m}^{3}$.\n\n${ask(mode, 'the time taken to fill the pool')}`,
    value,
    unit: '\\text{s}',
    mode,
    mistakes: [
      { value: round(V / rate), trap: 'left the volume in m³ instead of turning it into litres' },
      { value: round((V * 1000) / (rate * 60)), trap: 'gave the time in minutes' },
      { value: round(V * 1000 * rate), trap: 'multiplied by the flow rate instead of dividing' },
      { value: round((l * w * 1000) / rate), trap: 'forgot the depth of the pool' },
      { value: round((V * 1e6) / rate), trap: 'used $10^{6}$ litres in a cubic metre' },
      { value: round((V * 1000) / rate / 3600), trap: 'gave the time in hours' },
      { value: round((V * 1000 * 60) / rate), trap: 'read the flow rate as litres per minute' },
      { value: round((2 * (l * w + l * d + w * d) * 1000) / rate), trap: 'used the surface area of the pool instead of its volume' },
    ],
    solution: `Volume $= ${n(l)} \\times ${n(w)} \\times ${n(d)} = ${napp(V)}\\ \\text{m}^{3} = ${E(V * 1000).toLatex({ format: 'sf' })}$ litres, so $t = ${E(V * 1000).toLatex({ format: 'sf' })} / ${n(rate)} \\approx ${E(sf1(value)).toLatex({ format: 'sf' })}\\ \\text{s}$.`,
    trap: '1 m³ is 1000 litres: the volume has to be in litres before it is divided by a flow rate in litres per second.',
    tags: ['volume', 'time'],
    params: { variant: 'pool-fill', l, w, d, rate },
  });
}

/** The energy a car gets from its fuel, per kilometre. */
function fuelQ(rng: RNG): Generated | null {
  const litres = rng.pick([4, 5, 6, 8, 10, 12]);
  const per = 100; // km
  const perLitre = 3e7;
  const value = round((litres * perLitre) / per);
  const mode = modeOf(rng);
  const lead = `A car uses $${n(litres)}$ litres of fuel every $100\\ \\text{km}$, and one litre of fuel releases about $3 \\times 10^{7}\\ \\text{J}$.`;
  return estimate(rng, {
    stem: `${lead}\n\n${ask(mode, 'the energy released per kilometre travelled')}`,
    value,
    unit: '\\text{J}',
    mode,
    mistakes: [
      { value: round(litres * perLitre), trap: 'gave the energy for the whole 100 km' },
      { value: round(perLitre / per), trap: 'forgot how many litres are used' },
      { value: round((litres * perLitre) / (per * 1000)), trap: 'worked per metre, not per kilometre' },
      { value: round((per * perLitre) / litres), trap: 'divided by the litres instead of the distance' },
      { value: round(litres * perLitre * per), trap: 'multiplied by the 100 km instead of dividing' },
      { value: round((litres * perLitre * 10) / per), trap: 'read one litre of fuel as $3 \\times 10^{8}\\ \\text{J}$' },
      { value: round((litres * perLitre) / per / 1000), trap: 'gave the answer in kJ, not J' },
      { value: round((litres * perLitre) / (per * 10)), trap: 'read the figure as litres per $1000\\ \\text{km}$' },
      { value: round(perLitre / (per * litres)), trap: 'divided by the number of litres as well as by the distance' },
    ],
    solution: `Energy for $100\\ \\text{km}$ $= ${n(litres)} \\times 3 \\times 10^{7} = ${E(litres * perLitre).toLatex({ format: 'sf' })}\\ \\text{J}$, so per km it is $${E(sf1(value)).toLatex({ format: 'sf' })}\\ \\text{J}$.`,
    trap: 'Divide by the 100 km, not by the number of litres: the answer is an energy per kilometre.',
    tags: ['energy', 'standard form'],
    params: { variant: 'fuel', litres, per, perLitre },
  });
}

// ----------------------------------------------------------------------------- assembly

const VARIANTS: Record<Level, ((rng: RNG) => Generated | null)[]> = {
  1: [airMassQ, bathQ],
  2: [heartbeatsQ, breathingQ],
  3: [kettleEnergyQ, kettleTimeQ],
  4: [atmosphereQ, solarQ, lightTimeQ],
  5: [stairsQ, (r) => poolQ(r, 'heat'), (r) => poolQ(r, 'fill'), fuelQ],
};

const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(b), 1e-300);

/**
 * The true value the stated assumptions force, with a second relation it has to satisfy.
 *
 * `value` builds the quantity by a different physical route from generate's (the mass of the air
 * standing over one square metre of floor times the floor area, beats per second times the seconds
 * in a year, the litres a hose delivers), and `check` then substitutes that value back into a
 * relation generate never evaluated (the density it implies, the beats in a day, the energy the
 * kettle delivers in that time). Re-multiplying generate's own factors in a different order would
 * be neither: both routes have to be able to disagree.
 */
function trueValue(p: Record<string, number> & { variant: string }): { value: number; check: (v: number) => boolean } | null {
  switch (p.variant) {
    case 'air-mass': case 'bath': case 'pool': {
      // the air/water standing over one square metre, times the floor area of the room or pool
      const depth = p.variant === 'air-mass' ? p.h : p.d;
      const perSquareMetre = p.rho * depth;
      return { value: perSquareMetre * (p.l * p.w), check: (v) => near(v / (p.l * p.w * depth), p.rho) };
    }
    case 'heartbeats': {
      const perSecond = p.rate / 60;
      return { value: perSecond * 365 * 24 * 3600, check: (v) => near(v / 365, p.rate * 1440) };
    }
    case 'breathing': {
      const cubicMetresPerMinute = (p.rate * p.litres) / 1000;
      return { value: cubicMetresPerMinute * 24 * 60, check: (v) => near((v * 1000) / p.litres, p.rate * 1440) };
    }
    case 'kettle-energy': {
      // the energy one kilogram needs, times the mass
      const perKg = p.c * p.dT;
      return { value: perKg * p.m, check: (v) => near(v / (p.m * p.c), p.dT) };
    }
    case 'kettle-time': {
      // the time for which the element must deliver its power to supply mcΔθ
      const energy = p.m * p.c * p.dT;
      return { value: energy / (p.kw * 1000), check: (v) => near(p.kw * 1000 * v, energy) };
    }
    case 'atmosphere':
      return { value: p.p * (p.l * p.h), check: (v) => near(v / (p.l * p.h), p.p) };
    case 'solar':
      return { value: p.I * (p.l * p.w), check: (v) => near(v / (p.l * p.w), p.I) };
    case 'light-time':
      // the time in which light covers the distance: check it by travelling for that long
      return { value: p.d / p.c, check: (v) => near(p.c * v, p.d) };
    case 'stairs': {
      // the power that does mgh in t seconds, checked by the work it does in that time
      const work = p.m * 10 * p.h;
      return { value: work / p.t, check: (v) => near(v * p.t, work) };
    }
    case 'pool-heat': {
      const massOfWater = p.rho * (p.l * p.w * p.d);
      const perKelvin = massOfWater * p.c;
      return { value: perKelvin * p.dT, check: (v) => near(v / (p.c * p.dT), massOfWater) };
    }
    case 'pool-fill': {
      const litres = (p.l * p.w * p.d) * 1000;
      return { value: litres / p.rate, check: (v) => near(v * p.rate, litres) };
    }
    case 'fuel': {
      // the energy one kilometre needs: a litre's energy shared over the distance it drives
      const perKm = p.perLitre / p.per;
      return { value: perKm * p.litres, check: (v) => near(v * p.per, p.litres * p.perLitre) };
    }
  }
  return null;
}

export default defineTemplate({
  id: 'phy.units.estimation',
  module: 'PHY',
  topic: 'units',
  title: 'Order-of-magnitude estimates',
  levels: {
    1: 'the mass of the air in a room (ρ = 1.2 kg m⁻³) or of the water in a bath',
    2: 'heartbeats in a year; the volume of air breathed in a day',
    3: 'the energy to heat a kettle of water; how long the kettle takes',
    4: 'the force of the atmosphere on a wall; the sunlight on a roof; the time light takes to reach the Earth',
    5: 'the power of someone climbing stairs; heating or filling a swimming pool (volume → mass → energy); a car’s fuel energy per km',
  },
  generate(rng, level: Level) {
    return retry(rng, () => pickVariant(rng, VARIANTS[level]));
  },
  verify(q) {
    const p = q.params as Record<string, number> & { variant: string; mode: string; opts?: { display: string; value: number }[] };
    const t = trueValue(p);
    if (t === null || !Number.isFinite(t.value) || t.value <= 0) return false;
    // the two routes must agree before the answer is compared with either of them
    if (!t.check(t.value)) return false;
    const truth = t.value;
    const target = sf1(truth);
    if (!(Math.abs(truth / target - 1) < 0.5)) return false; // 1 s.f. must really be close

    if (p.mode === 'exact') {
      if (q.answer.kind !== 'exact') return false;
      if (Math.abs(q.answer.value.toNumber() - target) > 1e-9 * target) return false;
      // no wrong option may sit close enough that rounding the assumptions would reach it
      for (const o of q.options) {
        if (o.correct) continue;
        if (!o.value) return false;
        const r = o.value.toNumber() / target;
        if (r > 1 / 1.5 && r < 1.5) return false;
      }
      return true;
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
