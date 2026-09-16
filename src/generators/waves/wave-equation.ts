import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { Exact, ratToDecimalString, type NumberFormat } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { num } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * v = fλ, T = 1/f and the echo/sonar factor of 2.
 * Level 1: v = fλ, f = v/λ, λ = v/f with clean integers; T = 1/f and f = 1/T
 * Level 2: prefixes — 100 MHz radio waves in air (c = 3 × 10^8) → 3 m; sound at 340 m s^-1 and 170 Hz → 2 m;
 *          ultrasound in kHz; the speed from a frequency in kHz and a wavelength in m
 * Level 3: echoes and sonar (the pulse travels there *and back*), and the number of whole wavelengths
 *          (or whole waves) in a given length or time
 * Level 4: light of wavelength 600 nm → 5 × 10^14 Hz (standard form); the period from v and λ;
 *          microwaves in GHz; a period given in ms
 * Level 5: a wave described in words (crests x m apart, n crests per second); the speed in a second medium
 *          from the wavelength ratio at constant frequency; a two-step question needing ms → s and cm → m
 *
 * Every answer carries its unit. The named traps are the ones the exam builds its options from: forgetting the
 * factor 2 in an echo, leaving MHz/kHz/nm unconverted, quoting f when the period was asked for (T = f), and
 * dividing when the formula multiplies.
 */

const U = {
  v: '\\text{m s}^{-1}',
  m: '\\text{m}',
  s: '\\text{s}',
  Hz: '\\text{Hz}',
  MHz: '\\text{MHz}',
};
const C = 3e8;
const C_TEX = '3 \\times 10^{8}';

/** Round away floating-point noise. */
const r = (x: number): number => Number(x.toPrecision(12));
/** Exact from a float that is really a short decimal. */
const X = (x: number): Exact => Exact.num(r(x));
/** Quantity with its unit for a stem: "$12\ \text{m s}^{-1}$". */
const q = (x: number, unit: string): string => `$${num(x)}\\ ${unit}$`;

type Cand = { value: number | null; trap: string; /** a prefix/unit slip: allowed to sit far from the answer */ wide?: boolean };

/** Reads as an exam number in this format: at most 4 significant figures, no fraction bar, sane magnitude. */
function readable(x: number, format: NumberFormat): boolean {
  if (!Number.isFinite(x) || x <= 0) return false;
  if (format === 'decimal' && (x >= 1e5 || x < 1e-4)) return false;
  if (format === 'sf' && x > 0.01 && x < 100) return false; // "3 × 10^0" is not how anyone writes 3
  let v: Exact;
  try { v = X(x); } catch { return false; }
  if (!isCleanExact(v).ok) return false;
  if (v.toLatex({ format }).includes('\\frac')) return false;
  const dec = ratToDecimalString(v.toRat());
  if (dec === null) return false;
  const digits = dec.replace('-', '').replace('.', '').replace(/^0+/, '').replace(/0+$/, '');
  return digits.length <= 4;
}

/** Keep only distractors that are positive, exam-clean and within a sane factor of the answer. */
function cleanOnly(ds: Cand[], answer: number, format: NumberFormat): Distractor[] {
  const out: Distractor[] = [];
  for (const d of ds) {
    if (d.value === null) continue;
    // A prefix slip may sit far from the answer, but only a standard-form question can carry 10^9 of spread.
    const span = d.wide ? (format === 'sf' ? 1e12 : 1e4) : 200;
    if (d.value > span * answer || d.value < answer / span) continue;
    if (!readable(d.value, format)) continue;
    out.push({ value: X(d.value), trap: d.trap });
  }
  return out;
}

/** Every distinct `must` candidate goes in before any `extra` one, so the headline traps are never shuffled out. */
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

interface Pack {
  stem: string;
  answer: number;
  unit?: string;
  format?: NumberFormat;
  must: Cand[];
  extra: Cand[];
  solution: string;
  trap: string;
  tags: string[];
  params: Record<string, unknown>;
}

/** Build the question, or reject the parameters if they cannot supply four honest distractors. */
function pack(rng: RNG, p: Pack): Generated | null {
  const format: NumberFormat = p.format ?? 'decimal';
  if (!readable(p.answer, format)) return null;
  const ans = X(p.answer);
  const ds = ranked(rng, ans, cleanOnly(p.must, p.answer, format), cleanOnly(p.extra, p.answer, format));
  if (ds.length < 4) return null; // never pad: redraw instead
  return {
    stem: p.stem,
    answer: { kind: 'exact', value: ans, format, unit: p.unit },
    options: buildOptions(rng, ans, ds, { format, unit: p.unit }),
    solution: p.solution,
    trap: p.trap,
    tags: p.tags,
    params: p.params,
    typedAllowed: true,
  };
}

/** Pick a sub-variant first, then retry its parameters, so rejection rates do not skew the mix. */
function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

/** Only slow waves are described as water waves; a taut string carries fast ones. */
function who(rng: RNG, v: number): string {
  return v <= 12 ? rng.pick(['A water wave', 'A wave on a rope', 'A wave']) : rng.pick(['A wave on a stretched string', 'A wave']);
}

// ------------------------------------------------------------------------------------------ level 1

function speedFromFL(rng: RNG): Generated | null {
  const f = rng.pick([2, 4, 5, 8, 10, 20, 25, 40, 50]);
  const lam = rng.pick([0.4, 0.5, 2, 2.5, 4, 5, 8, 10]);
  const v = r(f * lam);
  if (!Number.isInteger(v) || v < 2 || v > 400 || f === lam || v === f || v === lam) return null;
  return pack(rng, {
    stem: `${who(rng, v)} has a frequency of ${q(f, U.Hz)} and a wavelength of ${q(lam, U.m)}. Find the speed of the wave.`,
    answer: v,
    unit: U.v,
    must: [
      { value: r(f / lam), trap: 'divided instead of multiplying: v = fλ' },
      { value: r(lam / f), trap: 'divided the wrong way round' },
    ],
    extra: [
      { value: r(f + lam), trap: 'added the frequency and the wavelength' },
      { value: f, trap: 'quoted the frequency as the speed' },
      { value: lam, trap: 'quoted the wavelength as the speed' },
      { value: r(2 * v), trap: 'doubled the product' },
      { value: r(v / 2), trap: 'halved the product' },
    ],
    solution: `$v = f\\lambda = ${num(f)} \\times ${num(lam)} = ${num(v)}\\ \\text{m s}^{-1}$.`,
    trap: 'v = fλ is a product: dividing gives neither the speed nor anything physical.',
    tags: ['waves', 'wave-equation', 'speed'],
    params: { variant: 'v-from-f-lambda', f, lam },
  });
}

function freqFromVL(rng: RNG): Generated | null {
  const v = rng.pick([12, 20, 24, 30, 40, 50, 60, 100, 120, 200, 300]);
  const lam = rng.pick([0.5, 2, 2.5, 4, 5, 10, 20]);
  const f = r(v / lam);
  if (!Number.isInteger(f) || f < 2 || f > 400 || f === lam || f === v || lam === v) return null;
  return pack(rng, {
    stem: `${who(rng, v)} travels at ${q(v, U.v)} and has a wavelength of ${q(lam, U.m)}. Find the frequency of the wave.`,
    answer: f,
    unit: U.Hz,
    must: [
      { value: r(v * lam), trap: 'multiplied instead of dividing: f = v/λ', wide: true },
      { value: r(lam / v), trap: 'divided the wrong way round' },
    ],
    extra: [
      { value: r(v - lam), trap: 'subtracted the wavelength from the speed' },
      { value: v, trap: 'quoted the speed as the frequency' },
      { value: r(2 * f), trap: 'doubled the quotient' },
      { value: r(f / 2), trap: 'halved the quotient' },
    ],
    solution: `$f = \\dfrac{v}{\\lambda} = \\dfrac{${num(v)}}{${num(lam)}} = ${num(f)}\\ \\text{Hz}$.`,
    trap: 'Rearranging v = fλ for f divides: f = v/λ, not vλ.',
    tags: ['waves', 'wave-equation', 'frequency'],
    params: { variant: 'f-from-v-lambda', v, lam },
  });
}

function lambdaFromVF(rng: RNG): Generated | null {
  const f = rng.pick([2, 4, 5, 8, 10, 20, 25, 40, 50]);
  const lam = rng.pick([0.4, 0.5, 2, 2.5, 4, 5, 8, 10]);
  const v = r(f * lam);
  if (!Number.isInteger(v) || v < 2 || v > 400 || f === lam || v === f || v === lam) return null;
  return pack(rng, {
    stem: `${who(rng, v)} travels at ${q(v, U.v)} with a frequency of ${q(f, U.Hz)}. Find the wavelength of the wave.`,
    answer: lam,
    unit: U.m,
    must: [
      { value: r(v * f), trap: 'multiplied instead of dividing: λ = v/f', wide: true },
      { value: r(f / v), trap: 'divided the wrong way round' },
    ],
    extra: [
      { value: f, trap: 'quoted the frequency as the wavelength' },
      { value: v, trap: 'quoted the speed as the wavelength' },
      { value: r(2 * lam), trap: 'doubled the quotient' },
      { value: r(lam / 2), trap: 'halved the quotient' },
    ],
    solution: `$\\lambda = \\dfrac{v}{f} = \\dfrac{${num(v)}}{${num(f)}} = ${num(lam)}\\ \\text{m}$.`,
    trap: 'Rearranging v = fλ for λ divides: λ = v/f.',
    tags: ['waves', 'wave-equation', 'wavelength'],
    params: { variant: 'lambda-from-v-f', v, f },
  });
}

function periodFromF(rng: RNG): Generated | null {
  const f = rng.pick([2, 4, 5, 8, 10, 20, 25]);
  const T = r(1 / f);
  return pack(rng, {
    stem: `${who(rng, 1)} has a frequency of ${q(f, U.Hz)}. Find the period of the wave.`,
    answer: T,
    unit: U.s,
    must: [
      { value: f, trap: 'quoted the frequency as the period (T = 1/f, not f)', wide: true },
      { value: r(60 / f), trap: 'treated the frequency as a number of waves per minute', wide: true },
    ],
    extra: [
      { value: r(2 / f), trap: 'used T = 2/f' },
      { value: r(1 / (2 * f)), trap: 'halved the period' },
      { value: r(f / 10), trap: 'divided the frequency by 10 instead of inverting it' },
    ],
    solution: `$T = \\dfrac{1}{f} = \\dfrac{1}{${f}} = ${num(T)}\\ \\text{s}$.`,
    trap: 'The period is the reciprocal of the frequency, not the frequency itself.',
    tags: ['waves', 'period', 'frequency'],
    params: { variant: 'T-from-f', f },
  });
}

function freqFromT(rng: RNG): Generated | null {
  const T = rng.pick([0.02, 0.025, 0.04, 0.05, 0.1, 0.125, 0.2, 0.25, 0.5]);
  const f = r(1 / T);
  return pack(rng, {
    stem: `${who(rng, 1)} has a period of ${q(T, U.s)}. Find the frequency of the wave.`,
    answer: f,
    unit: U.Hz,
    must: [
      { value: T, trap: 'quoted the period as the frequency (f = 1/T, not T)', wide: true },
      { value: r(60 * T), trap: 'multiplied by 60 instead of inverting' },
    ],
    extra: [
      { value: r(1 / (2 * T)), trap: 'halved the frequency' },
      { value: r(2 / T), trap: 'doubled the frequency' },
      { value: r(10 * T), trap: 'multiplied by 10 instead of inverting' },
    ],
    solution: `$f = \\dfrac{1}{T} = \\dfrac{1}{${num(T)}} = ${num(f)}\\ \\text{Hz}$.`,
    trap: 'f = 1/T: a period of 0.02 s means 50 waves a second, not 0.02 of one.',
    tags: ['waves', 'period', 'frequency'],
    params: { variant: 'f-from-T', T },
  });
}

// ------------------------------------------------------------------------------------------ level 2

function radioWavelength(rng: RNG): Generated | null {
  const fMHz = rng.pick([30, 40, 50, 60, 75, 80, 100, 120, 150, 200, 250, 300, 400, 500, 600]);
  const lam = r(300 / fMHz);
  return pack(rng, {
    stem: `Radio waves of frequency ${fMHz} MHz travel through air at $${C_TEX}\\ \\text{m s}^{-1}$. Find the wavelength of the waves.`,
    answer: lam,
    unit: U.m,
    format: 'auto',
    must: [
      { value: r(1000 * lam), trap: 'treated MHz as kHz (10^3 instead of 10^6)', wide: true },
      { value: r(C / fMHz), trap: 'used the frequency in MHz as though it were already in Hz', wide: true },
    ],
    extra: [
      { value: r(fMHz / 300), trap: 'inverted the calculation' },
      { value: r(2 * lam), trap: 'doubled the wavelength' },
      { value: r(lam / 2), trap: 'halved the wavelength' },
    ],
    solution: `$\\lambda = \\dfrac{v}{f} = \\dfrac{${C_TEX}}{${fMHz} \\times 10^{6}} = \\dfrac{300}{${fMHz}} = ${num(lam)}\\ \\text{m}$.`,
    trap: '1 MHz = 10^6 Hz: forgetting the prefix scales the answer by a million.',
    tags: ['waves', 'wave-equation', 'prefixes', 'radio'],
    params: { variant: 'radio-lambda', fMHz },
  });
}

function radioFrequencyMHz(rng: RNG): Generated | null {
  const fMHz = rng.pick([30, 40, 50, 60, 75, 80, 100, 120, 150, 200, 250, 300, 400, 500]);
  const lam = r(300 / fMHz);
  return pack(rng, {
    stem: `Radio waves of wavelength ${q(lam, U.m)} travel through air at $${C_TEX}\\ \\text{m s}^{-1}$. Find the frequency of the waves, in MHz.`,
    answer: fMHz,
    format: 'auto',
    must: [
      { value: r(C / lam), trap: 'gave the frequency in Hz, not MHz', wide: true },
      { value: r(300 * lam), trap: 'multiplied instead of dividing' },
    ],
    extra: [
      { value: r(1000 * fMHz), trap: 'gave the frequency in kHz', wide: true },
      { value: r(2 * fMHz), trap: 'doubled the frequency' },
      { value: r(fMHz / 2), trap: 'halved the frequency' },
    ],
    solution: `$f = \\dfrac{v}{\\lambda} = \\dfrac{${C_TEX}}{${num(lam)}} = ${num(fMHz)} \\times 10^{6}\\ \\text{Hz} = ${fMHz}\\ \\text{MHz}$.`,
    trap: 'Answer in the unit asked for: 10^8 Hz is 100 MHz, not 100 Hz.',
    tags: ['waves', 'wave-equation', 'prefixes', 'radio'],
    params: { variant: 'radio-f-mhz', lam },
  });
}

function soundWavelength(rng: RNG): Generated | null {
  const v = 340;
  const f = rng.pick([68, 85, 100, 136, 170, 200, 250, 272, 340, 400, 425, 500, 680, 850, 1000, 1700]);
  const lam = r(v / f);
  return pack(rng, {
    stem: `Sound travels through air at ${q(v, U.v)}. Find the wavelength in air of a note of frequency ${q(f, U.Hz)}.`,
    answer: lam,
    must: [
      { value: r(f / v), trap: 'divided the wrong way round: λ = v/f' },
      { value: r(v * f), trap: 'multiplied instead of dividing', wide: true },
    ],
    unit: U.m,
    extra: [
      { value: r(1000 * lam), trap: 'read the frequency as kHz', wide: true },
      { value: r(2 * lam), trap: 'doubled the wavelength' },
      { value: r(lam / 2), trap: 'halved the wavelength' },
      { value: r(v / (2 * f)), trap: 'used half the speed of sound' },
    ],
    solution: `$\\lambda = \\dfrac{v}{f} = \\dfrac{340}{${f}} = ${num(lam)}\\ \\text{m}$.`,
    trap: 'Use the speed of sound in air (340 m s^-1) — not the speed of light — and divide, do not multiply.',
    tags: ['waves', 'wave-equation', 'sound'],
    params: { variant: 'sound-lambda', v, f },
  });
}

function ultrasoundWavelength(rng: RNG): Generated | null {
  const v = 1500;
  const fkHz = rng.pick([1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 25, 30, 50, 60, 75]);
  const lam = r(1.5 / fkHz);
  return pack(rng, {
    stem: `An ultrasound pulse of frequency ${fkHz} kHz travels through water at ${q(v, U.v)}. Find the wavelength of the pulse in water.`,
    answer: lam,
    unit: U.m,
    must: [
      { value: r(v / fkHz), trap: 'used the frequency in kHz as though it were already in Hz', wide: true },
      { value: r((fkHz * 1000) / v), trap: 'divided the wrong way round' },
    ],
    extra: [
      { value: r(2 * lam), trap: 'doubled the wavelength' },
      { value: r(lam / 2), trap: 'halved the wavelength' },
      { value: r(340 / (fkHz * 1000)), trap: 'used the speed of sound in air instead of in water' },
    ],
    solution: `$\\lambda = \\dfrac{v}{f} = \\dfrac{1500}{${fkHz} \\times 10^{3}} = ${num(lam)}\\ \\text{m}$.`,
    trap: '1 kHz = 10^3 Hz: leaving the frequency in kHz makes the wavelength a thousand times too big.',
    tags: ['waves', 'wave-equation', 'prefixes', 'ultrasound'],
    params: { variant: 'ultrasound-lambda', v, fkHz },
  });
}

const KHZ_PAIRS: [number, number][] = [[2, 0.17], [1, 0.34], [5, 0.3], [3, 0.5], [10, 0.15], [4, 0.25], [2, 0.5], [20, 0.075], [8, 0.125], [5, 0.08], [2, 0.6], [4, 0.85], [1, 1.5], [6, 0.25], [15, 0.1]];

function speedFromKHz(rng: RNG): Generated | null {
  const [fkHz, lam] = rng.pick(KHZ_PAIRS);
  const v = r(fkHz * 1000 * lam);
  return pack(rng, {
    stem: `A sound wave of frequency ${fkHz} kHz has a wavelength of ${q(lam, U.m)} in a certain medium. Find the speed of sound in that medium.`,
    answer: v,
    unit: U.v,
    must: [
      { value: r(fkHz * lam), trap: 'forgot to convert kHz to Hz', wide: true },
      { value: r((fkHz * 1000) / lam), trap: 'divided instead of multiplying', wide: true },
    ],
    extra: [
      { value: r(2 * v), trap: 'doubled the product' },
      { value: r(v / 2), trap: 'halved the product' },
      { value: r(v / 1000), trap: 'left the frequency in kHz and then scaled', wide: true },
    ],
    solution: `$v = f\\lambda = ${fkHz} \\times 10^{3} \\times ${num(lam)} = ${num(v)}\\ \\text{m s}^{-1}$.`,
    trap: 'Convert kHz to Hz before using v = fλ.',
    tags: ['waves', 'wave-equation', 'prefixes', 'sound'],
    params: { variant: 'speed-from-khz', fkHz, lam },
  });
}

// ------------------------------------------------------------------------------------------ level 3

function sonarDepth(rng: RNG): Generated | null {
  const water = rng.bool(0.6);
  const v = water ? rng.pick([1500, 1400]) : 340;
  const t = rng.pick([0.4, 0.5, 1, 2, 3, 4, 5, 6, 8]);
  const d = r((v * t) / 2);
  if (!Number.isInteger(d) || d < 50 || d > 9000) return null;
  const stem = water
    ? `A ship sends a sonar pulse vertically downwards and detects the echo from the sea bed ${q(t, U.s)} later. The speed of sound in sea water is ${q(v, U.v)}. Find the depth of the sea bed below the ship.`
    : `A student stands in front of a large cliff, claps once and hears the echo ${q(t, U.s)} later. The speed of sound in air is ${q(v, U.v)}. Find the distance from the student to the cliff.`;
  return pack(rng, {
    stem,
    answer: d,
    unit: U.m,
    must: [
      { value: r(v * t), trap: 'forgot that the pulse travels there and back: that distance is 2d' },
      { value: r(2 * v * t), trap: 'doubled instead of halving' },
    ],
    extra: [
      { value: r(v / t), trap: 'divided instead of multiplying' },
      { value: r((v * t) / 4), trap: 'halved twice' },
      { value: r(v / (2 * t)), trap: 'divided by the time instead of multiplying by it' },
    ],
    solution: `The pulse covers $2d$ in ${num(t)} s, so $2d = vt = ${v} \\times ${num(t)} = ${num(v * t)}\\ \\text{m}$ and $d = ${num(d)}\\ \\text{m}$.`,
    trap: 'An echo travels out and back: divide vt by 2.',
    tags: ['waves', 'echo', 'sonar'],
    params: { variant: 'sonar-depth', v, t },
  });
}

function echoTime(rng: RNG): Generated | null {
  const water = rng.bool(0.5);
  const v = water ? 1500 : 340;
  const t = rng.pick([0.4, 0.5, 1, 2, 3, 4, 5, 6]);
  const d = r((v * t) / 2);
  if (!Number.isInteger(d) || d < 50 || d > 9000) return null;
  const stem = water
    ? `A ship sends a sonar pulse vertically downwards towards a sea bed ${q(d, U.m)} below it. The speed of sound in sea water is ${q(v, U.v)}. Find the time between sending the pulse and detecting the echo.`
    : `A student stands ${q(d, U.m)} from a large cliff and claps once. The speed of sound in air is ${q(v, U.v)}. Find the time between the clap and hearing the echo.`;
  return pack(rng, {
    stem,
    answer: t,
    unit: U.s,
    must: [
      { value: r(d / v), trap: 'forgot the return journey: the sound covers 2d' },
      { value: r((4 * d) / v), trap: 'doubled twice' },
    ],
    extra: [
      { value: r(v / d), trap: 'divided the wrong way round' },
      { value: r((2 * v) / d), trap: 'inverted the fraction' },
      { value: r(t / 2), trap: 'halved the time' },
    ],
    solution: `The sound covers $2d = ${num(2 * d)}$ m, so $t = \\dfrac{2d}{v} = \\dfrac{${num(2 * d)}}{${v}} = ${num(t)}\\ \\text{s}$.`,
    trap: 'The echo time covers twice the distance to the reflector.',
    tags: ['waves', 'echo', 'sonar'],
    params: { variant: 'echo-time', v, d },
  });
}

function echoSpeed(rng: RNG): Generated | null {
  const v = rng.pick([340, 1500, 1400, 300]);
  const t = rng.pick([0.2, 0.4, 0.5, 1, 2, 3, 4]);
  const d = r((v * t) / 2);
  if (!Number.isInteger(d) || d < 30 || d > 5000) return null;
  return pack(rng, {
    stem: `A pulse of sound is sent towards a wall ${q(d, U.m)} away and the echo is heard ${q(t, U.s)} later. Find the speed of sound.`,
    answer: v,
    unit: U.v,
    must: [
      { value: r(d / t), trap: 'forgot that the pulse travels there and back' },
      { value: r((4 * d) / t), trap: 'doubled the distance twice' },
    ],
    extra: [
      { value: r(t / d), trap: 'divided the wrong way round', wide: true },
      { value: r(d * t), trap: 'multiplied instead of dividing' },
      { value: r(v / 2), trap: 'halved the speed' },
    ],
    solution: `The pulse covers $2 \\times ${num(d)} = ${num(2 * d)}$ m in ${num(t)} s, so $v = \\dfrac{${num(2 * d)}}{${num(t)}} = ${num(v)}\\ \\text{m s}^{-1}$.`,
    trap: 'Distance travelled by an echo is twice the distance to the wall.',
    tags: ['waves', 'echo', 'speed'],
    params: { variant: 'echo-speed', d, t },
  });
}

function countWavelengths(rng: RNG): Generated | null {
  const lam = rng.pick([0.2, 0.25, 0.4, 0.5, 0.8, 1.25, 2, 2.5]);
  const k = rng.pick([8, 10, 12, 15, 16, 20, 24, 25, 30, 40, 50]);
  const L = r(lam * k);
  if (!Number.isInteger(L) || L < 4 || L > 200) return null;
  return pack(rng, {
    stem: `A sound wave of wavelength ${q(lam, U.m)} travels along a corridor of length ${q(L, U.m)}. How many complete wavelengths of this wave fit into the length of the corridor?`,
    answer: k,
    must: [
      { value: Number.isInteger(r(L * lam)) ? r(L * lam) : null, trap: 'multiplied instead of dividing' },
      { value: k + 1, trap: 'off by one' },
    ],
    extra: [
      { value: r(2 * k), trap: 'doubled the count' },
      { value: Number.isInteger(k / 2) ? k / 2 : null, trap: 'halved the count' },
      { value: k - 1, trap: 'off by one' },
      { value: r(L * 2 / lam), trap: 'used half the wavelength' },
    ],
    solution: `Number of wavelengths $= \\dfrac{L}{\\lambda} = \\dfrac{${num(L)}}{${num(lam)}} = ${k}$.`,
    trap: 'A count of wavelengths is a length divided by a wavelength, not a product.',
    tags: ['waves', 'wavelength', 'counting'],
    params: { variant: 'count-lambda', lam, L },
  });
}

function countWaves(rng: RNG): Generated | null {
  const f = rng.pick([4, 5, 8, 10, 15, 20, 25, 40, 50]);
  const t = rng.pick([2, 3, 4, 5, 6, 8, 10]);
  const k = r(f * t);
  if (k > 500 || f === t) return null;
  return pack(rng, {
    stem: `A wave of frequency ${q(f, U.Hz)} travels past a fixed point. How many complete waves pass the point in ${q(t, U.s)}?`,
    answer: k,
    must: [
      { value: Number.isInteger(r(f / t)) ? r(f / t) : null, trap: 'divided instead of multiplying' },
      { value: f, trap: 'gave the number of waves in one second' },
    ],
    extra: [
      { value: r(2 * k), trap: 'doubled the count' },
      { value: Number.isInteger(k / 2) ? k / 2 : null, trap: 'halved the count' },
      { value: k + 1, trap: 'off by one' },
      { value: r(60 * f), trap: 'worked per minute instead of per second', wide: true },
    ],
    solution: `The frequency is the number of waves each second, so in ${num(t)} s, $${f} \\times ${t} = ${num(k)}$ waves pass.`,
    trap: 'Frequency is waves per second: multiply by the time, do not divide.',
    tags: ['waves', 'frequency', 'counting'],
    params: { variant: 'count-waves', f, t },
  });
}

// ------------------------------------------------------------------------------------------ level 4

function lightFrequency(rng: RNG): Generated | null {
  const lamNm = rng.pick([300, 400, 500, 600, 750, 1000, 1200, 1500]);
  const f = r(3e17 / lamNm);
  return pack(rng, {
    stem: `Light of wavelength ${lamNm} nm travels through a vacuum at $${C_TEX}\\ \\text{m s}^{-1}$. Find the frequency of the light, giving your answer in standard form. ($1\\ \\text{nm} = 10^{-9}\\ \\text{m}$.)`,
    answer: f,
    unit: U.Hz,
    format: 'sf',
    must: [
      { value: r(C / lamNm), trap: 'used the wavelength in nm as though it were in metres', wide: true },
      { value: r(C * lamNm * 1e-9), trap: 'multiplied by the wavelength instead of dividing by it', wide: true },
    ],
    extra: [
      { value: r(C / (lamNm * 1e-6)), trap: 'treated nm as µm (10^-6 instead of 10^-9)', wide: true },
      { value: r(2 * f), trap: 'doubled the frequency' },
      { value: r(f / 2), trap: 'halved the frequency' },
      { value: r(f / 10), trap: 'slipped one power of ten' },
    ],
    solution: `$f = \\dfrac{c}{\\lambda} = \\dfrac{3 \\times 10^{8}}{${lamNm} \\times 10^{-9}} = \\dfrac{3 \\times 10^{17}}{${lamNm}} = ${X(f).toLatex({ format: 'sf' })}\\ \\text{Hz}$.`,
    trap: '1 nm = 10^-9 m: leaving the wavelength in nm is a factor of 10^9 out.',
    tags: ['waves', 'wave-equation', 'light', 'standard-form'],
    params: { variant: 'light-f', lamNm },
  });
}

function periodFromVL(rng: RNG): Generated | null {
  const v = rng.pick([20, 25, 40, 50, 100, 200, 300, 340, 1500]);
  const lam = rng.pick([0.5, 1, 1.7, 2, 2.5, 3, 5, 10, 25]);
  const T = r(lam / v);
  if (T < 0.001 || T > 1 || lam === v) return null;
  return pack(rng, {
    stem: `A wave travels at ${q(v, U.v)} and has a wavelength of ${q(lam, U.m)}. Find the period of the wave.`,
    answer: T,
    unit: U.s,
    must: [
      { value: r(v / lam), trap: 'found the frequency v/λ, not the period', wide: true },
      { value: r(v * lam), trap: 'multiplied instead of dividing', wide: true },
    ],
    extra: [
      { value: r(1 / (v * lam)), trap: 'took the reciprocal of vλ', wide: true },
      { value: r(T / 2), trap: 'halved the period' },
      { value: r(2 * T), trap: 'doubled the period' },
      { value: r(10 * T), trap: 'slipped one power of ten' },
    ],
    solution: `$f = \\dfrac{v}{\\lambda} = \\dfrac{${num(v)}}{${num(lam)}} = ${num(r(v / lam))}\\ \\text{Hz}$, so $T = \\dfrac{1}{f} = ${num(T)}\\ \\text{s}$ (that is $T = \\lambda/v$).`,
    trap: 'The period is λ/v; v/λ is the frequency.',
    tags: ['waves', 'period', 'wave-equation'],
    params: { variant: 'T-from-v-lambda', v, lam },
  });
}

function microwaveWavelength(rng: RNG): Generated | null {
  const fGHz = rng.pick([1, 1.5, 2, 3, 5, 6, 10, 15]);
  const lam = r(0.3 / fGHz);
  return pack(rng, {
    stem: `Microwaves of frequency ${num(fGHz)} GHz travel through air at $${C_TEX}\\ \\text{m s}^{-1}$. Find the wavelength of the microwaves.`,
    answer: lam,
    unit: U.m,
    must: [
      { value: r(1000 * lam), trap: 'treated GHz as MHz (10^6 instead of 10^9)', wide: true },
      { value: r(fGHz / 0.3), trap: 'inverted the calculation', wide: true },
    ],
    extra: [
      { value: r(lam / 1000), trap: 'slipped three powers of ten the other way', wide: true },
      { value: r(2 * lam), trap: 'doubled the wavelength' },
      { value: r(lam / 2), trap: 'halved the wavelength' },
      { value: r(3 / fGHz), trap: 'used c = 3 × 10^9', wide: true },
    ],
    solution: `$\\lambda = \\dfrac{c}{f} = \\dfrac{${C_TEX}}{${num(fGHz)} \\times 10^{9}} = \\dfrac{0.3}{${num(fGHz)}} = ${num(lam)}\\ \\text{m}$.`,
    trap: '1 GHz = 10^9 Hz.',
    tags: ['waves', 'wave-equation', 'prefixes', 'microwaves'],
    params: { variant: 'microwave-lambda', fGHz },
  });
}

function freqFromMs(rng: RNG): Generated | null {
  const Tms = rng.pick([0.5, 1, 2, 2.5, 4, 5, 10, 20, 25, 50]);
  const f = r(1000 / Tms);
  return pack(rng, {
    stem: `A wave has a period of ${num(Tms)} ms. Find the frequency of the wave. ($1\\ \\text{ms} = 10^{-3}\\ \\text{s}$.)`,
    answer: f,
    unit: U.Hz,
    must: [
      { value: r(1 / Tms), trap: 'left the period in milliseconds', wide: true },
      { value: Tms, trap: 'quoted the period as the frequency', wide: true },
    ],
    extra: [
      { value: r(1e6 / Tms), trap: 'treated ms as µs', wide: true },
      { value: r(f / 2), trap: 'halved the frequency' },
      { value: r(2 * f), trap: 'doubled the frequency' },
      { value: r(60 / Tms), trap: 'worked per minute instead of per second', wide: true },
    ],
    solution: `$T = ${num(Tms)} \\times 10^{-3}\\ \\text{s}$, so $f = \\dfrac{1}{T} = \\dfrac{1000}{${num(Tms)}} = ${num(f)}\\ \\text{Hz}$.`,
    trap: 'Convert ms to s first: f = 1/T only with T in seconds.',
    tags: ['waves', 'period', 'prefixes'],
    params: { variant: 'f-from-ms', Tms },
  });
}

function xrayWavelength(rng: RNG): Generated | null {
  const f = rng.pick([5e17, 1e18, 1.5e18, 3e18, 6e18]);
  const lam = r(C / f);
  return pack(rng, {
    stem: `X-rays of frequency $${X(f).toLatex({ format: 'sf' })}\\ \\text{Hz}$ travel through a vacuum at $${C_TEX}\\ \\text{m s}^{-1}$. Find the wavelength of the X-rays, in metres, giving your answer in standard form.`,
    answer: lam,
    unit: U.m,
    format: 'sf',
    must: [
      { value: r(f / C), trap: 'divided the wrong way round', wide: true },
      { value: r(lam * 1e9), trap: 'gave the answer in nm when metres were asked for', wide: true },
    ],
    extra: [
      { value: r(lam * 1e10), trap: 'gave the answer in ångström-sized units', wide: true },
      { value: r(2 * lam), trap: 'doubled the wavelength' },
      { value: r(lam / 2), trap: 'halved the wavelength' },
      { value: r(lam * 10), trap: 'slipped one power of ten' },
    ],
    solution: `$\\lambda = \\dfrac{c}{f} = \\dfrac{3 \\times 10^{8}}{${X(f).toLatex({ format: 'sf' })}} = ${X(lam).toLatex({ format: 'sf' })}\\ \\text{m}$.`,
    trap: 'λ = c/f: dividing the frequency by c inverts the answer.',
    tags: ['waves', 'wave-equation', 'standard-form'],
    params: { variant: 'xray-lambda', f },
  });
}

// ------------------------------------------------------------------------------------------ level 5

function crestSpeed(rng: RNG): Generated | null {
  const d = rng.pick([0.5, 0.8, 1.2, 1.5, 2, 2.5, 3, 4]);
  const nC = rng.pick([2, 3, 4, 5, 6, 8, 10]);
  const v = r(d * nC);
  if (v > 40 || d === nC) return null;
  return pack(rng, {
    stem: `The crests of a water wave are ${q(d, U.m)} apart, and ${nC} crests pass a fixed post each second. Find the speed of the wave.`,
    answer: v,
    unit: U.v,
    must: [
      { value: r(d / nC), trap: 'divided instead of multiplying: the crest spacing is λ and the rate is f' },
      { value: r(nC / d), trap: 'divided the wrong way round' },
      { value: r(2 * v), trap: 'doubled the product' },
    ],
    extra: [
      { value: r(d + nC), trap: 'added the two numbers' },
      { value: nC, trap: 'quoted the frequency as the speed' },
      { value: r(v / 2), trap: 'halved the product' },
    ],
    solution: `The crest spacing is the wavelength and the rate of crests is the frequency, so $v = f\\lambda = ${nC} \\times ${num(d)} = ${num(v)}\\ \\text{m s}^{-1}$.`,
    trap: 'Crests per second is the frequency; crest spacing is the wavelength: multiply them.',
    tags: ['waves', 'wave-equation', 'description'],
    params: { variant: 'crest-speed', d, nC },
  });
}

function crestCount(rng: RNG): Generated | null {
  const lam = rng.pick([0.5, 1.2, 1.5, 2, 2.5, 4]);
  const v = rng.pick([3, 6, 8, 10, 12]);
  const t = rng.pick([3, 4, 5, 6, 10]);
  const f = r(v / lam);
  const k = r(f * t);
  if (!Number.isInteger(f) || f < 2 || f > 40 || k > 400 || !Number.isInteger(k)) return null;
  return pack(rng, {
    stem: `A water wave travels at ${q(v, U.v)} and its crests are ${q(lam, U.m)} apart. How many crests pass a fixed post in ${q(t, U.s)}?`,
    answer: k,
    must: [
      { value: f, trap: 'gave the number of crests in one second' },
      { value: Number.isInteger(r(v * lam * t)) ? r(v * lam * t) : null, trap: 'multiplied by the wavelength instead of dividing by it' },
    ],
    extra: [
      { value: r(2 * k), trap: 'doubled the count' },
      { value: Number.isInteger(k / 2) ? k / 2 : null, trap: 'halved the count' },
      { value: k + 1, trap: 'off by one' },
      { value: Number.isInteger(r(v * t)) ? r(v * t) : null, trap: 'gave the distance travelled instead of the number of crests' },
    ],
    solution: `$f = \\dfrac{v}{\\lambda} = \\dfrac{${num(v)}}{${num(lam)}} = ${num(f)}\\ \\text{Hz}$, so in ${num(t)} s the number of crests is $${num(f)} \\times ${num(t)} = ${num(k)}$.`,
    trap: 'Find the frequency first (v/λ), then multiply by the time.',
    tags: ['waves', 'wave-equation', 'counting'],
    params: { variant: 'crest-count', v, lam, t },
  });
}

const MEDIA: [number, string][] = [[1500, 'water'], [1200, 'paraffin'], [4000, 'concrete'], [5000, 'steel'], [6000, 'steel']];

function mediumChange(rng: RNG): Generated | null {
  const f = rng.pick([500, 1000, 2000]);
  const [v2, medium] = rng.pick(MEDIA);
  const lam1cm = r(34000 / f);
  const lam2 = r(v2 / f);
  if (!Number.isInteger(lam1cm) || lam2 < 0.2 || lam2 > 12) return null;
  return pack(rng, {
    stem: `A sound wave of wavelength ${lam1cm} cm travels through air at ${q(340, U.v)}. The wave then passes into ${medium}, where its wavelength is ${q(lam2, U.m)}. The frequency of the wave does not change. Find the speed of sound in ${medium}.`,
    answer: v2,
    unit: U.v,
    must: [
      { value: r((340 * lam2) / lam1cm), trap: 'forgot to convert the first wavelength from cm to m' },
      { value: 340, trap: 'assumed the speed is unchanged' },
      { value: f, trap: 'stopped at the frequency' },
      { value: r(2 * v2), trap: 'doubled the speed' },
    ],
    extra: [
      { value: r((340 * (lam1cm / 100)) / lam2), trap: 'inverted the wavelength ratio' },
      { value: r(v2 / 2), trap: 'halved the speed' },
    ],
    solution: `The frequency is the same in both media: $f = \\dfrac{340}{${num(lam1cm / 100)}} = ${f}\\ \\text{Hz}$. Then $v = f\\lambda = ${f} \\times ${num(lam2)} = ${num(v2)}\\ \\text{m s}^{-1}$.`,
    trap: 'Frequency is set by the source and does not change between media; the speed and wavelength both change in the same ratio.',
    tags: ['waves', 'wave-equation', 'media'],
    params: { variant: 'medium-change', lam1cm, lam2, v1: 340 },
  });
}

function twoStepConversion(rng: RNG): Generated | null {
  const Tms = rng.pick([5, 10, 20, 25, 40, 50]);
  const lamCm = rng.pick([10, 15, 20, 25, 40, 50, 60, 80]);
  const v = r((10 * lamCm) / Tms);
  if (v < 2 || v > 60) return null;
  return pack(rng, {
    stem: `A wave on a stretched string has a period of ${Tms} ms and a wavelength of ${lamCm} cm. Find the speed of the wave.`,
    answer: v,
    unit: U.v,
    must: [
      { value: r(lamCm / Tms), trap: 'used the numbers as given, without converting ms and cm' },
      { value: r(lamCm / (Tms / 1000)), trap: 'converted the period but left the wavelength in cm', wide: true },
    ],
    extra: [
      { value: r((lamCm / 100) * (Tms / 1000)), trap: 'multiplied instead of dividing', wide: true },
      { value: r((Tms / 1000) / (lamCm / 100)), trap: 'divided the wrong way round', wide: true },
      { value: r(2 * v), trap: 'doubled the speed' },
      { value: r(v / 2), trap: 'halved the speed' },
    ],
    solution: `$T = ${num(Tms / 1000)}\\ \\text{s}$ and $\\lambda = ${num(lamCm / 100)}\\ \\text{m}$, so $v = \\dfrac{\\lambda}{T} = \\dfrac{${num(lamCm / 100)}}{${num(Tms / 1000)}} = ${num(v)}\\ \\text{m s}^{-1}$.`,
    trap: 'Convert both quantities to SI first: ms → s and cm → m.',
    tags: ['waves', 'wave-equation', 'unit-conversion'],
    params: { variant: 'two-step', Tms, lamCm },
  });
}

const BY_LEVEL: Record<Level, ((rng: RNG) => Generated | null)[]> = {
  1: [speedFromFL, freqFromVL, lambdaFromVF, periodFromF, freqFromT],
  2: [radioWavelength, radioFrequencyMHz, soundWavelength, ultrasoundWavelength, speedFromKHz],
  3: [sonarDepth, echoTime, echoSpeed, countWavelengths, countWaves],
  4: [lightFrequency, periodFromVL, microwaveWavelength, freqFromMs, xrayWavelength],
  5: [crestSpeed, crestCount, mediumChange, twoStepConversion],
};

export default defineTemplate({
  id: 'phy.waves.wave-equation',
  module: 'PHY',
  topic: 'waves',
  title: 'Wave speed, frequency and wavelength',
  levels: {
    1: 'v = fλ with clean integers; T = 1/f and f = 1/T',
    2: 'prefixes: 100 MHz radio waves → 3 m; sound at 340 m s^-1; kHz ultrasound',
    3: 'echoes and sonar (there and back); whole wavelengths in a length, whole waves in a time',
    4: '600 nm light → 5 × 10^14 Hz; the period from v and λ; GHz and ms',
    5: 'a wave described in words; the speed in a second medium from the wavelength ratio; ms and cm together',
  },
  generate(rng, level: Level) {
    return retry(rng, () => pickVariant(rng, BY_LEVEL[level]));
  },
  verify(q) {
    // Recompute by a different rearrangement of v = fλ (multiply where generate divided, and vice versa).
    if (q.answer.kind !== 'exact') return false;
    const a = q.answer.value.toNumber();
    const p = q.params as Record<string, number> & { variant: string };
    const close = (x: number, y: number) => Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(y));
    switch (p.variant) {
      case 'v-from-f-lambda': return close(a / p.lam, p.f) && close(a / p.f, p.lam);
      case 'f-from-v-lambda': return close(a * p.lam, p.v);
      case 'lambda-from-v-f': return close(a * p.f, p.v);
      case 'T-from-f': return close(a * p.f, 1);
      case 'f-from-T': return close(a * p.T, 1);
      case 'radio-lambda': return close(a * (p.fMHz * 1e6), C);
      case 'radio-f-mhz': return close(a * 1e6 * p.lam, C);
      case 'sound-lambda': return close(a * p.f, p.v);
      case 'ultrasound-lambda': return close(a * (p.fkHz * 1000), p.v);
      case 'speed-from-khz': return close(a / (p.fkHz * 1000), p.lam);
      case 'sonar-depth': return close((2 * a) / p.v, p.t);
      case 'echo-time': return close(p.v * a, 2 * p.d);
      case 'echo-speed': return close(a * p.t, 2 * p.d);
      case 'count-lambda': return Number.isInteger(a) && close(a * p.lam, p.L);
      case 'count-waves': return Number.isInteger(a) && close(a / p.t, p.f);
      case 'light-f': return close(a * (p.lamNm * 1e-9), C);
      case 'T-from-v-lambda': return close(a * p.v, p.lam);
      case 'microwave-lambda': return close(a * (p.fGHz * 1e9), C);
      case 'f-from-ms': return close(a * (p.Tms / 1000), 1);
      case 'xray-lambda': return close(a * p.f, C);
      case 'crest-speed': return close(a / p.d, p.nC);
      case 'crest-count': return close(a * p.lam, p.v * p.t);
      case 'medium-change': return close(a / p.lam2, p.v1 / (p.lam1cm / 100));
      case 'two-step': return close(a * (p.Tms / 1000), p.lamCm / 100);
      default: return false;
    }
  },
});
