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

type Cand = {
  value: number | null;
  trap: string;
  /** a prefix/unit slip: allowed to sit far from the answer */
  wide?: boolean;
  /** an option that merely repeats a number printed in the stem: at most one per list */
  given?: boolean;
};
type Wide = Distractor & { wide?: boolean; given?: boolean };

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
function cleanOnly(ds: Cand[], answer: number, format: NumberFormat): Wide[] {
  const out: Wide[] = [];
  for (const d of ds) {
    if (d.value === null) continue;
    // A prefix slip may sit far from the answer, but only a standard-form question can carry 10^9 of spread.
    // Everything else stays close enough to the answer to be weighed against it.
    const span = d.wide ? (format === 'sf' ? 1e10 : 2e3) : 30;
    if (d.value > span * answer || d.value < answer / span) continue;
    if (!readable(d.value, format)) continue;
    out.push({ value: X(d.value), trap: d.trap, wide: d.wide, given: d.given });
  }
  return out;
}

/**
 * The mistake family a candidate belongs to, read off its ratio to the answer: a factor of two (or
 * four, or a half) and a power of ten are the two families every wave formula produces by the dozen.
 * Capping them stops a list in which all four wrong options are the answer times 2^k or 10^k.
 */
function family(x: number, a: number): '' | 'two' | 'ten' {
  if (!(x > 0) || !(a > 0)) return '';
  const l10 = Math.log10(x / a);
  if (Math.abs(l10 - Math.round(l10)) < 1e-9) return 'ten';
  const l2 = Math.log2(x / a);
  if (Math.abs(l2 - Math.round(l2)) < 1e-9) return 'two';
  return '';
}

/** At most this many of the four wrong options may come from one family. */
const FAMILY_MAX: Record<string, number> = { two: 2, ten: 3, given: 1 };

/**
 * Choose the four distractors with a *randomly drawn number of them below the answer*.
 *
 * The draw comes first, before any candidate is seated. Taking every `must` trap first instead — as
 * this function used to — pinned the correct option's rank: the headline pair straddles the answer in
 * every variant, so the greedy fill always seated options on both sides and "pick the median" scored
 * without any physics. Inside each side the order is: headline (`must`) traps, then the other named
 * mistakes, then the ×2 / ×10 near-misses, then `spare`. A list may hold at most `maxSpare` spares and
 * never both a doubled and a halved answer, and nothing may widen it past `widest`.
 */
function ranked(rng: RNG, answer: Exact, must: Wide[], extra: Wide[], spare: Wide[] = [], widest = 1e4, count = 4, maxSpare = 1): Distractor[] {
  const a = answer.toNumber();
  interface Seat { d: Wide; tier: number; fam: string }
  const seats = (ds: Wide[], tier: number): Seat[] => rng.shuffle(ds).map((d) => ({ d, tier, fam: d.given ? 'given' : family(d.value.toNumber(), a) }));
  const pool = [...seats(must, 0), ...seats(extra, 1), ...seats(spare, 2)];
  // a substantive mistake outranks a factor-of-two or power-of-ten near-miss in the same tier
  const order = (xs: Seat[]) => xs.slice().sort((p, q) => p.tier - q.tier || (p.fam ? 1 : 0) - (q.fam ? 1 : 0));
  const below = order(pool.filter((p) => p.d.value.toNumber() < a));
  const above = order(pool.filter((p) => p.d.value.toNumber() > a));

  const seen: Exact[] = [answer];
  const out: Wide[] = [];
  const fams = new Map<string, number>();
  const spareRatios: number[] = [];
  let lo = a, hi = a, spares = 0;
  const take = (p: Seat): boolean => {
    if (out.length >= count) return false;
    const x = p.d.value.toNumber();
    if (seen.some((s) => s.equals(p.d.value))) return false;
    if (p.fam && (fams.get(p.fam) ?? 0) >= (FAMILY_MAX[p.fam] ?? count)) return false;
    if (p.tier === 2) {
      if (spares >= maxSpare) return false;
      // never a doubled *and* a halved answer: that clusters the list geometrically around it
      if (spareRatios.some((rt) => Math.abs(rt * (x / a) - 1) < 1e-9)) return false;
    }
    if (Math.max(hi, x) / Math.min(lo, x) > widest * (1 + 1e-9)) return false;
    seen.push(p.d.value);
    out.push(p.d);
    if (p.fam) fams.set(p.fam, (fams.get(p.fam) ?? 0) + 1);
    if (p.tier === 2) { spares++; spareRatios.push(x / a); }
    lo = Math.min(lo, x); hi = Math.max(hi, x);
    return true;
  };
  const drain = (q: Seat[], want: number) => { while (want > 0 && q.length > 0) if (take(q.shift()!)) want--; };
  drain(below, rng.int(Math.max(0, count - above.length), Math.min(count, below.length)));
  drain(above, count - out.length);
  // a side that ran short (a duplicate, a family cap, the span guard) is topped up from the other
  drain(below, count - out.length);
  drain(above, count - out.length);
  return out;
}

interface Pack {
  stem: string;
  answer: number;
  unit?: string;
  format?: NumberFormat;
  must: Cand[];
  extra: Cand[];
  /** ×2 / ÷2 / ×10 near-misses: a last resort, and never more than `maxSpare` of them in a list. */
  spare?: Cand[];
  /** How many near-misses a list may hold; 2 only where the named mistakes nearly all pull one way. */
  maxSpare?: number;
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
  const ds = ranked(
    rng,
    ans,
    cleanOnly(p.must, p.answer, format),
    cleanOnly(p.extra, p.answer, format),
    cleanOnly(p.spare ?? [], p.answer, format),
    format === 'sf' ? 1e12 : 1e4,
    4,
    p.maxSpare ?? 1,
  );
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
      { value: f, trap: 'quoted the frequency as the speed', given: true },
      { value: lam, trap: 'quoted the wavelength as the speed', given: true },
      { value: r(2 * v), trap: 'read the quoted distance as crest to trough, which is half a wavelength' },
      { value: r(v * 10), trap: 'slipped a power of ten in the product' },
      { value: r(v / 10), trap: 'slipped a power of ten in the product the other way' },
    ],
    spare: [
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
      { value: v, trap: 'quoted the speed as the frequency', given: true },
      { value: r(1 / lam), trap: 'gave the number of waves in each metre, not in each second' },
      { value: r(v / (2 * lam)), trap: 'took the quoted distance as crest to trough, so used twice the wavelength' },
      { value: r(f * 10), trap: 'slipped a power of ten in the division' },
      { value: r(f / 10), trap: 'slipped a power of ten in the division the other way' },
    ],
    spare: [
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
      { value: f, trap: 'quoted the frequency as the wavelength', given: true },
      { value: v, trap: 'quoted the speed as the wavelength', given: true },
      { value: r(1 / f), trap: 'gave the period 1/f instead of the wavelength' },
      { value: r(2 * lam), trap: 'gave the crest-to-trough distance doubled: λ = v/f already is a whole wavelength' },
      { value: r(lam * 10), trap: 'slipped a power of ten in the division' },
      { value: r(lam / 10), trap: 'slipped a power of ten in the division the other way' },
    ],
    spare: [
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
      { value: r(1 / (60 * f)), trap: 'gave the period in minutes' },
      { value: r(1 / (2 * f)), trap: 'gave the time for half a cycle, not for a whole one' },
      { value: r(f / 10), trap: 'divided the frequency by 10 instead of inverting it' },
      { value: r(10 / f), trap: 'slipped a power of ten in the reciprocal' },
      { value: r(1 / (10 * f)), trap: 'slipped a power of ten in the reciprocal the other way' },
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
      { value: r(60 / T), trap: 'gave the number of waves per minute' },
      { value: r(2 / T), trap: 'read the quoted time as the time for two complete waves' },
      { value: r(1 / (2 * T)), trap: 'read the quoted time as the time for half a wave' },
      { value: r(10 * T), trap: 'multiplied by 10 instead of inverting' },
      { value: r(1 / (10 * T)), trap: 'slipped a power of ten in the reciprocal' },
      { value: r(10 / T), trap: 'slipped a power of ten in the reciprocal the other way' },
    ],
    solution: `$f = \\dfrac{1}{T} = \\dfrac{1}{${num(T)}} = ${num(f)}\\ \\text{Hz}$.`,
    trap: 'f = 1/T: a period of 0.02 s means 50 waves a second, not 0.02 of one.',
    tags: ['waves', 'period', 'frequency'],
    params: { variant: 'f-from-T', T },
  });
}

// ------------------------------------------------------------------------------------------ level 2

const RADIO_MHZ = [6, 8, 10, 12, 15, 16, 20, 24, 25, 30, 40, 48, 50, 60, 75, 80, 88, 96, 100, 120, 125, 150, 200, 240, 250, 300, 375, 400, 500, 600, 750, 800];

function radioWavelength(rng: RNG): Generated | null {
  const fMHz = rng.pick(RADIO_MHZ);
  const lam = r(300 / fMHz);
  return pack(rng, {
    stem: `Radio waves of frequency ${fMHz} MHz travel through air at $${C_TEX}\\ \\text{m s}^{-1}$. Find the wavelength of the waves.`,
    answer: lam,
    unit: U.m,
    // 'decimal', not 'auto': a wavelength of 1.5 m is how a paper prints it, and under 'auto' every
    // non-integer wavelength (and every option beside it) would be rejected for carrying a fraction bar.
    format: 'decimal',
    must: [
      { value: r(1000 * lam), trap: 'treated MHz as kHz (10^3 instead of 10^6)', wide: true },
      { value: r(C / fMHz), trap: 'used the frequency in MHz as though it were already in Hz', wide: true },
    ],
    extra: [
      { value: r(fMHz / 300), trap: 'inverted the calculation' },
      { value: r(lam / 1000), trap: 'treated MHz as GHz (10^9 instead of 10^6)', wide: true },
      { value: r(10 * lam), trap: 'used 10^5 for the prefix: one power of ten too few' },
      { value: r(lam / 10), trap: 'used 10^7 for the prefix: one power of ten too many' },
    ],
    spare: [
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
  const fMHz = rng.pick(RADIO_MHZ);
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
      { value: r(fMHz / 1000), trap: 'gave the frequency in GHz', wide: true },
      { value: r(10 * fMHz), trap: 'slipped one power of ten in the prefix' },
      { value: r(fMHz / 10), trap: 'slipped one power of ten in the prefix the other way' },
      { value: r(340 / lam), trap: 'used the speed of sound instead of the speed of light', wide: true },
    ],
    spare: [
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
  const f = rng.pick([20, 25, 34, 40, 50, 68, 80, 85, 100, 125, 136, 170, 200, 250, 272, 340, 400, 425, 500, 544, 680, 800, 850, 1000, 1250, 1360, 1700, 2000]);
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
      // reading "170 Hz" as 170 kHz makes the frequency a thousand times too big, so the wavelength
      // comes out a thousand times too small
      { value: r(lam / 1000), trap: 'read the frequency as kHz', wide: true },
      { value: r(1500 / f), trap: 'used the speed of sound in water instead of in air' },
      { value: r(1 / f), trap: 'gave the period 1/f instead of the wavelength' },
      { value: r(10 * lam), trap: 'slipped a power of ten in the division' },
      { value: r(lam / 10), trap: 'slipped a power of ten in the division the other way' },
    ],
    spare: [
      { value: r(2 * lam), trap: 'doubled the wavelength' },
      { value: r(v / (2 * f)), trap: 'used half the speed of sound' },
    ],
    solution: `$\\lambda = \\dfrac{v}{f} = \\dfrac{340}{${f}} = ${num(lam)}\\ \\text{m}$.`,
    trap: 'Use the speed of sound in air (340 m s^-1) — not the speed of light — and divide, do not multiply.',
    tags: ['waves', 'wave-equation', 'sound'],
    params: { variant: 'sound-lambda', v, f },
  });
}

const ULTRASOUND: [number, string][] = [[1500, 'water'], [1600, 'body tissue'], [5000, 'steel'], [1200, 'paraffin']];

function ultrasoundWavelength(rng: RNG): Generated | null {
  const [v, medium] = rng.pick(ULTRASOUND);
  const fkHz = rng.pick([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 16, 20, 24, 25, 30, 40, 50, 60, 75, 80, 100]);
  const lam = r(v / (fkHz * 1000));
  return pack(rng, {
    stem: `An ultrasound pulse of frequency ${num(fkHz)} kHz travels through ${medium} at ${q(v, U.v)}. Find the wavelength of the pulse in ${medium}.`,
    answer: lam,
    unit: U.m,
    must: [
      { value: r(v / fkHz), trap: 'used the frequency in kHz as though it were already in Hz', wide: true },
      { value: r((fkHz * 1000) / v), trap: 'divided the wrong way round' },
    ],
    extra: [
      { value: r(340 / (fkHz * 1000)), trap: `used the speed of sound in air instead of in ${medium}` },
      { value: r(lam / 1000), trap: 'treated kHz as MHz (10^6 instead of 10^3)', wide: true },
      { value: r(10 * lam), trap: 'slipped one power of ten in the prefix' },
      { value: r(lam / 10), trap: 'slipped one power of ten in the prefix the other way' },
      { value: r(1 / (fkHz * 1000)), trap: 'gave the period 1/f instead of the wavelength' },
    ],
    spare: [
      { value: r(2 * lam), trap: 'doubled the wavelength' },
      { value: r(lam / 2), trap: 'halved the wavelength' },
    ],
    solution: `$\\lambda = \\dfrac{v}{f} = \\dfrac{${v}}{${num(fkHz)} \\times 10^{3}} = ${num(lam)}\\ \\text{m}$.`,
    trap: '1 kHz = 10^3 Hz: leaving the frequency in kHz makes the wavelength a thousand times too big.',
    tags: ['waves', 'wave-equation', 'prefixes', 'ultrasound'],
    params: { variant: 'ultrasound-lambda', v, fkHz },
  });
}

const KHZ_PAIRS: [number, number][] = [
  [2, 0.17], [1, 0.34], [5, 0.3], [3, 0.5], [10, 0.15], [4, 0.25], [2, 0.5], [20, 0.075], [8, 0.125], [5, 0.08],
  [2, 0.6], [4, 0.85], [1, 1.5], [6, 0.25], [15, 0.1], [2, 0.8], [2.5, 0.6], [1.5, 1], [4, 0.4], [5, 0.32],
  [8, 0.2], [10, 0.16], [12, 0.125], [16, 0.1], [20, 0.08], [25, 0.06], [3, 0.4], [6, 0.5], [1, 1.2], [2, 1.5],
];

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
      { value: 340, trap: 'quoted the speed of sound in air instead of using the data' },
      { value: r(1000 * v), trap: 'treated kHz as MHz (10^6 instead of 10^3)', wide: true },
      { value: r(10 * v), trap: 'slipped one power of ten in the prefix' },
      { value: r(v / 10), trap: 'slipped one power of ten in the prefix the other way' },
      { value: r(2 * v), trap: 'read the quoted distance as crest to trough, which is half a wavelength' },
    ],
    spare: [
      { value: r(v / 2), trap: 'halved the product' },
    ],
    solution: `$v = f\\lambda = ${fkHz} \\times 10^{3} \\times ${num(lam)} = ${num(v)}\\ \\text{m s}^{-1}$.`,
    trap: 'Convert kHz to Hz before using v = fλ.',
    tags: ['waves', 'wave-equation', 'prefixes', 'sound'],
    params: { variant: 'speed-from-khz', fkHz, lam },
  });
}

// ------------------------------------------------------------------------------------------ level 3

/** Media that carry an echo, with the scene each one belongs to. */
const ECHO_MEDIA: [number, string, string][] = [
  [1500, 'sea water', 'sonar'],
  [1400, 'fresh water', 'sonar'],
  [1600, 'body tissue', 'scan'],
  [340, 'air', 'cliff'],
];

function sonarDepth(rng: RNG): Generated | null {
  const [v, medium, scene] = rng.pick(ECHO_MEDIA);
  const t = scene === 'scan'
    ? rng.pick([0.0001, 0.0002, 0.00025, 0.0004, 0.0005])
    : rng.pick([0.2, 0.25, 0.4, 0.5, 0.6, 0.8, 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8]);
  const d = r((v * t) / 2);
  if (!Number.isInteger(scene === 'scan' ? d * 100 : d) || d < (scene === 'scan' ? 0.05 : 30) || d > 9000) return null;
  const stem = scene === 'sonar'
    ? `A ship sends a sonar pulse vertically downwards and detects the echo from the sea bed ${q(t, U.s)} later. The speed of sound in ${medium} is ${q(v, U.v)}. Find the depth of the sea bed below the ship.`
    : scene === 'scan'
      ? `An ultrasound scanner sends a pulse into ${medium}, in which sound travels at ${q(v, U.v)}, and detects the reflection ${q(t, U.s)} later. Find the depth of the reflecting surface below the scanner.`
      : `A student stands in front of a large cliff, claps once and hears the echo ${q(t, U.s)} later. The speed of sound in ${medium} is ${q(v, U.v)}. Find the distance from the student to the cliff.`;
  return pack(rng, {
    stem,
    answer: d,
    unit: U.m,
    // One factor-of-two trap, and it is the real one: the pulse goes out and back. "Halved twice" and
    // "halved three times" are arithmetic perturbations wearing a label, and with them in `must` three
    // of the four wrong options came from the single factor of 2.
    must: [
      { value: r(v * t), trap: 'forgot that the pulse travels there and back: that distance is 2d' },
    ],
    extra: [
      { value: v === 340 ? r((1500 * t) / 2) : r((340 * t) / 2), trap: v === 340 ? 'used the speed of sound in water instead of in air' : `used the speed of sound in air instead of in ${medium}` },
      { value: r(v / t), trap: 'divided by the time instead of multiplying by it' },
      { value: r(v / (2 * t)), trap: 'divided the speed by the time and then halved it' },
      { value: r(2 * v * t), trap: 'doubled instead of halving: the factor of two goes the other way' },
    ],
    spare: [
      { value: r(d / 10), trap: 'slipped a power of ten' },
      { value: r(d * 10), trap: 'slipped a power of ten the other way' },
      { value: r(d / 2), trap: 'halved the depth a second time' },
    ],
    // the named mistakes here nearly all overshoot, so two near-misses may be used to fill the list out
    maxSpare: 2,
    solution: `The pulse covers $2d$ in ${num(t)} s, so $2d = vt = ${v} \\times ${num(t)} = ${num(r(v * t))}\\ \\text{m}$ and $d = ${num(d)}\\ \\text{m}$.`,
    trap: 'An echo travels out and back: divide vt by 2.',
    tags: ['waves', 'echo', 'sonar'],
    params: { variant: 'sonar-depth', v, t },
  });
}

function echoTime(rng: RNG): Generated | null {
  const [v, medium, scene] = rng.pick(ECHO_MEDIA.filter(([, , sc]) => sc !== 'scan'));
  const t = rng.pick([0.2, 0.25, 0.4, 0.5, 0.6, 0.8, 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6]);
  const d = r((v * t) / 2);
  if (!Number.isInteger(d) || d < 30 || d > 9000) return null;
  const stem = scene === 'sonar'
    ? `A ship sends a sonar pulse vertically downwards towards a sea bed ${q(d, U.m)} below it. The speed of sound in ${medium} is ${q(v, U.v)}. Find the time between sending the pulse and detecting the echo.`
    : `A student stands ${q(d, U.m)} from a large cliff and claps once. The speed of sound in ${medium} is ${q(v, U.v)}. Find the time between the clap and hearing the echo.`;
  return pack(rng, {
    stem,
    answer: t,
    unit: U.s,
    must: [
      { value: r(d / v), trap: 'forgot the return journey: the sound covers 2d' },
    ],
    extra: [
      { value: v === 340 ? r((2 * d) / 1500) : r((2 * d) / 340), trap: v === 340 ? 'used the speed of sound in water instead of in air' : `used the speed of sound in air instead of in ${medium}` },
      { value: r(v / d), trap: 'divided the wrong way round' },
      { value: r((2 * v) / d), trap: 'inverted the fraction' },
      { value: r(d / (2 * v)), trap: 'halved the distance instead of doubling it' },
    ],
    spare: [
      { value: r(t * 10), trap: 'slipped a power of ten' },
      { value: r(t / 10), trap: 'slipped a power of ten the other way' },
      { value: r(2 * t), trap: 'doubled the time a second time' },
    ],
    maxSpare: 2,
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
    ],
    extra: [
      { value: v === 340 ? 1500 : 340, trap: 'quoted a remembered speed of sound instead of using the data' },
      { value: r(t / d), trap: 'divided the wrong way round', wide: true },
      { value: r(d * t), trap: 'multiplied instead of dividing' },
      { value: r(d / (2 * t)), trap: 'halved the distance instead of doubling it' },
    ],
    spare: [
      { value: r(v * 10), trap: 'slipped a power of ten' },
      { value: r(v / 10), trap: 'slipped a power of ten the other way' },
      { value: r(2 * v), trap: 'doubled the speed a second time' },
    ],
    maxSpare: 2,
    solution: `The pulse covers $2 \\times ${num(d)} = ${num(2 * d)}$ m in ${num(t)} s, so $v = \\dfrac{${num(2 * d)}}{${num(t)}} = ${num(v)}\\ \\text{m s}^{-1}$.`,
    trap: 'Distance travelled by an echo is twice the distance to the wall.',
    tags: ['waves', 'echo', 'speed'],
    params: { variant: 'echo-speed', d, t },
  });
}

/**
 * Level 3, so the two quantities are in different units: the wavelength in cm (or mm) and the length in
 * metres. Dividing the numbers as they stand is then a factor of 100 (or 1000) out, which is the trap.
 */
function countWavelengths(rng: RNG): Generated | null {
  const small = rng.bool(0.6) ? { name: 'cm', per: 100 } : { name: 'mm', per: 1000 };
  const lamSmall = rng.pick(small.per === 100 ? [20, 25, 40, 50, 80, 125, 200, 250] : [200, 250, 400, 500, 800]);
  const k = rng.pick([8, 10, 12, 15, 16, 20, 24, 25, 30, 40, 50]);
  const lam = r(lamSmall / small.per);
  const L = r(lam * k);
  if (!Number.isInteger(L) || L < 4 || L > 200) return null;
  const where = rng.pick(['corridor', 'tube', 'hall']);
  return pack(rng, {
    stem: `A sound wave of wavelength ${lamSmall} ${small.name} travels along a ${where} of length ${q(L, U.m)}. How many complete wavelengths of this wave fit into the length of the ${where}?`,
    answer: k,
    must: [
      { value: r(L / lamSmall), trap: `divided the numbers as they stand, without converting ${small.name} to m`, wide: true },
      { value: rng.bool(0.5) ? k + 1 : k - 1, trap: 'off by one' },
    ],
    extra: [
      { value: r(2 * k), trap: `took the quoted ${small.name} as half a wavelength` },
      { value: Number.isInteger(r(k / 2)) ? r(k / 2) : null, trap: 'used twice the wavelength' },
      { value: r(10 * k), trap: `slipped one power of ten in the ${small.name} → m conversion` },
      { value: Number.isInteger(r(k / 10)) ? r(k / 10) : null, trap: `slipped one power of ten in the ${small.name} → m conversion the other way` },
      { value: r(L * lamSmall), trap: 'multiplied instead of dividing', wide: true },
    ],
    spare: [
      { value: k + 2, trap: 'off by two' },
    ],
    solution: `$${num(L)}$ m is $${num(L * small.per)}$ ${small.name}, so the number of wavelengths is $\\dfrac{${num(L * small.per)}}{${lamSmall}} = ${k}$.`,
    trap: `Put both lengths in the same unit first: 1 m = ${small.per} ${small.name}.`,
    tags: ['waves', 'wavelength', 'counting', 'unit-conversion'],
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
      { value: f, trap: 'gave the number of waves in one second', given: true },
    ],
    extra: [
      { value: k + 1, trap: 'off by one' },
      { value: r(60 * f), trap: 'gave the number of waves in a minute', wide: true },
      { value: t, trap: 'quoted the time as the number of waves', given: true },
      { value: r(f * t * 10), trap: 'slipped a power of ten in the product' },
      { value: r((f * t) / 10), trap: 'slipped a power of ten in the product the other way' },
    ],
    spare: [
      { value: r(2 * k), trap: 'doubled the count' },
      { value: Number.isInteger(k / 2) ? k / 2 : null, trap: 'halved the count' },
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
      { value: r(C / (lamNm * 1e-6)), trap: 'treated nm as µm (10^-6 instead of 10^-9)', wide: true },
    ],
    extra: [
      // c λ is 10^-16 of the answer: kept for the record, but the span guard drops it on sight
      { value: r(C * lamNm * 1e-9), trap: 'multiplied by the wavelength instead of dividing by it', wide: true },
      { value: r(C / (lamNm * 1e-12)), trap: 'treated nm as pm (10^-12 instead of 10^-9)', wide: true },
      { value: r(3e10 / (lamNm * 1e-9)), trap: 'used the speed of light in cm s^-1 (3 × 10^10) without converting', wide: true },
      { value: r(f / 10), trap: 'slipped one power of ten' },
      { value: r(f * 10), trap: 'slipped one power of ten the other way' },
      { value: r(f / 2), trap: 'took the quoted wavelength to be half a wavelength' },
    ],
    spare: [
      { value: r(2 * f), trap: 'doubled the frequency' },
    ],
    solution: `$f = \\dfrac{c}{\\lambda} = \\dfrac{3 \\times 10^{8}}{${lamNm} \\times 10^{-9}} = \\dfrac{3 \\times 10^{17}}{${lamNm}} = ${X(f).toLatex({ format: 'sf' })}\\ \\text{Hz}$.`,
    trap: '1 nm = 10^-9 m: leaving the wavelength in nm is a factor of 10^9 out.',
    tags: ['waves', 'wave-equation', 'light', 'standard-form'],
    params: { variant: 'light-f', lamNm },
  });
}

function periodFromVL(rng: RNG): Generated | null {
  const v = rng.pick([20, 25, 40, 50, 80, 100, 125, 150, 200, 250, 300, 340, 400, 500, 1200, 1400, 1500, 1600]);
  const lam = rng.pick([0.4, 0.5, 0.8, 1, 1.25, 1.6, 1.7, 2, 2.5, 3, 4, 5, 8, 10, 16, 25]);
  const T = r(lam / v);
  if (T < 0.001 || T > 1 || lam === v) return null;
  return pack(rng, {
    stem: `A wave travels at ${q(v, U.v)} and has a wavelength of ${q(lam, U.m)}. Find the period of the wave.`,
    answer: T,
    unit: U.s,
    must: [
      { value: r(v / lam), trap: 'found the frequency v/λ, not the period', wide: true },
      { value: r(v * lam), trap: 'multiplied instead of dividing' },
    ],
    extra: [
      { value: r(1 / (v * lam)), trap: 'took the reciprocal of vλ' },
      { value: r(2 * T), trap: 'took the quoted distance as crest to trough, so used twice the wavelength' },
      { value: r(T / 2), trap: 'read the quoted distance as two whole wavelengths' },
      { value: r(1000 * T), trap: 'gave the period in milliseconds, not in seconds', wide: true },
      { value: r(10 * T), trap: 'slipped one power of ten' },
      { value: r(T / 10), trap: 'slipped one power of ten the other way' },
      { value: r(T / 60), trap: 'gave the period in minutes', wide: true },
    ],
    spare: [
      { value: r(T / 2), trap: 'halved the period' },
    ],
    solution: `$f = \\dfrac{v}{\\lambda} = \\dfrac{${num(v)}}{${num(lam)}} = ${num(r(v / lam))}\\ \\text{Hz}$, so $T = \\dfrac{1}{f} = ${num(T)}\\ \\text{s}$ (that is $T = \\lambda/v$).`,
    trap: 'The period is λ/v; v/λ is the frequency.',
    tags: ['waves', 'period', 'wave-equation'],
    params: { variant: 'T-from-v-lambda', v, lam },
  });
}

function microwaveWavelength(rng: RNG): Generated | null {
  const fGHz = rng.pick([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 10, 12, 15, 20, 25, 30]);
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
      { value: r(lam / 1000), trap: 'treated GHz as THz (10^12 instead of 10^9)', wide: true },
      { value: r(3 / fGHz), trap: 'used c = 3 × 10^9', wide: true },
      { value: r(lam / 10), trap: 'slipped one power of ten in the prefix' },
      { value: r(10 * lam), trap: 'slipped one power of ten in the prefix the other way' },
    ],
    spare: [
      { value: r(2 * lam), trap: 'doubled the wavelength' },
      { value: r(lam / 2), trap: 'halved the wavelength' },
    ],
    solution: `$\\lambda = \\dfrac{c}{f} = \\dfrac{${C_TEX}}{${num(fGHz)} \\times 10^{9}} = \\dfrac{0.3}{${num(fGHz)}} = ${num(lam)}\\ \\text{m}$.`,
    trap: '1 GHz = 10^9 Hz.',
    tags: ['waves', 'wave-equation', 'prefixes', 'microwaves'],
    params: { variant: 'microwave-lambda', fGHz },
  });
}

function freqFromMs(rng: RNG): Generated | null {
  const Tms = rng.pick([0.2, 0.25, 0.4, 0.5, 0.8, 1, 1.25, 2, 2.5, 4, 5, 8, 10, 12.5, 20, 25, 40, 50, 80, 100]);
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
      { value: r(60 / Tms), trap: 'worked per minute instead of per second', wide: true },
      { value: r(f / 10), trap: 'slipped one power of ten in the conversion' },
      { value: r(10 * f), trap: 'slipped one power of ten in the conversion the other way' },
      { value: r(f * 60), trap: 'gave the number of waves in a minute' },
    ],
    spare: [
      { value: r(f / 2), trap: 'halved the frequency' },
      { value: r(2 * f), trap: 'doubled the frequency' },
    ],
    solution: `$T = ${num(Tms)} \\times 10^{-3}\\ \\text{s}$, so $f = \\dfrac{1}{T} = \\dfrac{1000}{${num(Tms)}} = ${num(f)}\\ \\text{Hz}$.`,
    trap: 'Convert ms to s first: f = 1/T only with T in seconds.',
    tags: ['waves', 'period', 'prefixes'],
    params: { variant: 'f-from-ms', Tms },
  });
}

function xrayWavelength(rng: RNG): Generated | null {
  const f = rng.pick([2e17, 2.5e17, 5e17, 7.5e17, 1e18, 1.2e18, 1.5e18, 2e18, 3e18, 5e18, 6e18, 1e19]);
  const lam = r(C / f);
  // The frequency with its mantissa dropped: "3 × 10^8 ÷ 10^18" is the slip this question really catches.
  const tenPower = Math.pow(10, Math.floor(Math.log10(f)));
  return pack(rng, {
    stem: `X-rays of frequency $${X(f).toLatex({ format: 'sf' })}\\ \\text{Hz}$ travel through a vacuum at $${C_TEX}\\ \\text{m s}^{-1}$. Find the wavelength of the X-rays, in metres, giving your answer in standard form.`,
    answer: lam,
    unit: U.m,
    format: 'sf',
    // f/c and λ in nm are 10^10 and 10^9 times the answer: as options they are discarded on sight, and
    // the span guard drops them anyway. Every option here lives within a factor of ten or so of λ, so the
    // question is decided by the power of ten, which is the whole point of it.
    must: [
      { value: r(lam * 10), trap: 'read the exponent of the frequency one too small' },
      { value: r(lam / 10), trap: 'read the exponent of the frequency one too large' },
    ],
    extra: [
      { value: r(C / tenPower), trap: 'used only the power of ten of the frequency, dropping its mantissa' },
      { value: r(lam / 3), trap: 'used c = 1 × 10^8' },
      { value: r(lam * 3), trap: 'divided by 10^8 and forgot the 3 in c' },
      { value: r((C / f) * (f / tenPower) * (f / tenPower)), trap: 'multiplied by the mantissa of the frequency instead of dividing by it' },
    ],
    spare: [
      { value: r(2 * lam), trap: 'doubled the wavelength' },
      { value: r(lam / 2), trap: 'halved the wavelength' },
    ],
    solution: `$\\lambda = \\dfrac{c}{f} = \\dfrac{3 \\times 10^{8}}{${X(f).toLatex({ format: 'sf' })}} = ${X(lam).toLatex({ format: 'sf' })}\\ \\text{m}$.`,
    trap: 'Subtract the powers of ten: 10^8 ÷ 10^18 = 10^-10, and the mantissas divide the other way round.',
    tags: ['waves', 'wave-equation', 'standard-form'],
    params: { variant: 'xray-lambda', f },
  });
}

// ------------------------------------------------------------------------------------------ level 5

/**
 * Level 5, so the wave is described only in words and the crest spacing is quoted in cm: the candidate
 * has to see that the spacing is λ, that the rate of crests is f, and to convert before multiplying.
 */
function crestSpeed(rng: RNG): Generated | null {
  const dCm = rng.pick([20, 25, 40, 50, 60, 80, 120, 150, 250, 300, 400]);
  const nC = rng.pick([2, 3, 4, 5, 6, 8, 10]);
  const d = r(dCm / 100);
  const v = r(d * nC);
  if (v > 40 || v < 0.5) return null;
  return pack(rng, {
    stem: `The crests of a water wave are ${dCm} cm apart, and ${nC} crests pass a fixed post each second. Find the speed of the wave in metres per second.`,
    answer: v,
    unit: U.v,
    must: [
      { value: r(dCm * nC), trap: 'left the crest spacing in cm', wide: true },
      { value: r(d / nC), trap: 'divided instead of multiplying: the crest spacing is λ and the rate is f' },
    ],
    extra: [
      { value: r(nC / d), trap: 'divided the wrong way round' },
      { value: r(2 * v), trap: 'took the crest spacing to be half a wavelength' },
      { value: nC, trap: 'quoted the frequency as the speed', given: true },
      { value: d, trap: 'quoted the wavelength as the speed', given: true },
      { value: r(v * 10), trap: 'slipped one power of ten in the cm → m conversion' },
      { value: r(v / 10), trap: 'slipped one power of ten in the cm → m conversion the other way' },
    ],
    spare: [
      { value: r(v / 2), trap: 'halved the product' },
    ],
    solution: `The crest spacing is the wavelength, $\\lambda = ${num(d)}$ m, and the rate of crests is the frequency, $f = ${nC}$ Hz, so $v = f\\lambda = ${nC} \\times ${num(d)} = ${num(v)}\\ \\text{m s}^{-1}$.`,
    trap: 'Crests per second is the frequency and crest spacing is the wavelength: convert the spacing to metres, then multiply.',
    tags: ['waves', 'wave-equation', 'description', 'unit-conversion'],
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
      { value: k + 1, trap: 'off by one' },
      { value: Number.isInteger(r(v * t)) ? r(v * t) : null, trap: 'gave the distance travelled instead of the number of crests' },
      { value: Number.isInteger(r(k / 2)) ? r(k / 2) : null, trap: 'took the crest spacing to be half a wavelength' },
      { value: r(2 * k), trap: 'used half the crest spacing as the wavelength' },
      { value: t, trap: 'quoted the time as the number of crests', given: true },
    ],
    spare: [
      { value: r(k * 10), trap: 'slipped a power of ten' },
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
    ],
    extra: [
      { value: f, trap: 'stopped at the frequency' },
      { value: r((340 * (lam1cm / 100)) / lam2), trap: 'inverted the wavelength ratio' },
      { value: r(340 * lam2), trap: 'multiplied the speed in air by the second wavelength' },
      { value: r(f / lam2), trap: 'divided the frequency by the second wavelength instead of multiplying' },
      { value: r(100 * v2), trap: `converted the wavelength in ${medium} to centimetres as well`, wide: true },
      { value: r(v2 * 10), trap: 'slipped a power of ten in the cm → m conversion' },
      { value: r(v2 / 10), trap: 'slipped a power of ten in the cm → m conversion the other way' },
    ],
    spare: [
      { value: r(2 * v2), trap: 'doubled the speed' },
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
      { value: r((lamCm / 100) / Tms), trap: 'converted the wavelength to metres but left the period in milliseconds', wide: true },
      { value: r((lamCm / 100) * (Tms / 1000)), trap: 'multiplied instead of dividing', wide: true },
      { value: r((Tms / 1000) / (lamCm / 100)), trap: 'divided the wrong way round', wide: true },
      { value: r(v / 10), trap: 'converted the wavelength as if cm were mm' },
      { value: r(v * 10), trap: 'converted the period as if ms were cs' },
      { value: r(2 * v), trap: 'took the quoted wavelength to be half a wavelength' },
    ],
    spare: [
      { value: r(v / 2), trap: 'halved the speed' },
    ],
    solution: `$T = ${num(Tms / 1000)}\\ \\text{s}$ and $\\lambda = ${num(lamCm / 100)}\\ \\text{m}$, so $v = \\dfrac{\\lambda}{T} = \\dfrac{${num(lamCm / 100)}}{${num(Tms / 1000)}} = ${num(v)}\\ \\text{m s}^{-1}$.`,
    trap: 'Convert both quantities to SI first: ms → s and cm → m.',
    tags: ['waves', 'wave-equation', 'unit-conversion'],
    params: { variant: 'two-step', Tms, lamCm },
  });
}

const BY_LEVEL: Record<Level, ((rng: RNG) => Generated | null)[]> = {
  // countWaves is a one-step product of two small integers (5 × 6): a level-1 question, not a level-3 one.
  1: [speedFromFL, freqFromVL, lambdaFromVF, periodFromF, freqFromT, countWaves],
  2: [radioWavelength, radioFrequencyMHz, soundWavelength, ultrasoundWavelength, speedFromKHz],
  3: [sonarDepth, echoTime, echoSpeed, countWavelengths],
  4: [lightFrequency, periodFromVL, microwaveWavelength, freqFromMs, xrayWavelength],
  5: [crestSpeed, crestCount, mediumChange, twoStepConversion],
};

export default defineTemplate({
  id: 'phy.waves.wave-equation',
  module: 'PHY',
  topic: 'waves',
  title: 'Wave speed, frequency and wavelength',
  levels: {
    1: 'v = fλ with clean integers; T = 1/f and f = 1/T; how many waves pass in t seconds',
    2: 'prefixes: 100 MHz radio waves → 3 m; sound at 340 m s^-1; kHz ultrasound',
    3: 'echoes and sonar (there and back); whole wavelengths of a wave given in cm or mm in a length in m',
    4: '600 nm light → 5 × 10^14 Hz; the period from v and λ; GHz, ms and X-ray wavelengths',
    5: 'a wave described in words with the crest spacing in cm; the speed in a second medium; ms and cm together',
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
