import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { Exact, ratToDecimalString, type NumberFormat } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { num } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Half-life with clean ratios: everything is a power of two.
 * Level 1: the fraction remaining after n half-lives (n ≤ 4), and the mass remaining from a starting mass
 * Level 2: the time to fall to one eighth of the original, and the activity after a given time
 * Level 3: the number of half-lives behind a ratio (1/32 → 5) and the time that takes
 * Level 4: the ratio decayed : remaining after n half-lives (7 : 1 after 3), the fraction decayed,
 *          and the fraction that decays during the nth half-life
 * Level 5: the half-life from two readings (800 Bq → 50 Bq in 24 h → 6 h) and count rates that
 *          include a background rate, which has to be subtracted first and added back at the end
 *
 * Decay is never linear: after two half-lives a quarter is left, not nothing, and the fraction *decayed*
 * is one minus the fraction *remaining* — the two traps every option list here is built from.
 */

const U_G = '\\text{g}';
const U_BQ = '\\text{Bq}';

interface TimeUnit { word: string; tex: string }
const TIME_UNITS: TimeUnit[] = [
  { word: 'minutes', tex: '\\text{min}' },
  { word: 'hours', tex: '\\text{h}' },
  { word: 'seconds', tex: '\\text{s}' },
];

const FRACTION_WORDS: Record<number, string> = { 2: 'one half', 4: 'one quarter', 8: 'one eighth', 16: 'one sixteenth', 32: 'one thirty-second', 64: 'one sixty-fourth' };

const r = (x: number): number => Number(x.toPrecision(12));
const X = (x: number): Exact => Exact.num(r(x));

type Cand = { value: number | null; trap: string; wide?: boolean };

/** Reads as an exam number in this format. */
function readable(x: number, format: NumberFormat): boolean {
  if (!Number.isFinite(x) || x <= 0) return false;
  let v: Exact;
  try { v = X(x); } catch { return false; }
  if (!isCleanExact(v).ok) return false;
  if (format === 'fraction') return v.toRat().d <= 64n && v.toNumber() <= 1;
  if (x >= 1e5 || x < 1e-3) return false;
  if (v.toLatex({ format }).includes('\\frac')) return false;
  const dec = ratToDecimalString(v.toRat());
  if (dec === null) return false;
  const digits = dec.replace('.', '').replace(/^0+/, '').replace(/0+$/, '');
  return digits.length <= 4;
}

function cleanOnly(ds: Cand[], answer: number, format: NumberFormat): Distractor[] {
  const out: Distractor[] = [];
  for (const d of ds) {
    if (d.value === null) continue;
    const span = d.wide ? 1e6 : 100;
    if (d.value > span * answer || d.value < answer / span) continue;
    if (!readable(d.value, format)) continue;
    out.push({ value: X(d.value), trap: d.trap });
  }
  return out;
}

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

function pack(rng: RNG, p: Pack): Generated | null {
  const format: NumberFormat = p.format ?? 'decimal';
  if (!readable(p.answer, format)) return null;
  const ans = X(p.answer);
  const ds = ranked(rng, ans, cleanOnly(p.must, p.answer, format), cleanOnly(p.extra, p.answer, format));
  if (ds.length < 4) return null;
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

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

const SOURCE = ['A radioactive source', 'A sample of a radioactive isotope', 'A radioactive sample'];
const halfLife = (rng: RNG, units: TimeUnit[] = TIME_UNITS): [number, TimeUnit] => {
  const u = rng.pick(units);
  return [rng.pick([2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30]), u];
};
/** Count rates are quoted per minute, so those scenarios never use a half-life measured in seconds. */
const SLOW_UNITS = TIME_UNITS.filter((u) => u.word !== 'seconds');

// ------------------------------------------------------------------------------------------ level 1

function fractionRemaining(rng: RNG): Generated | null {
  const k = rng.int(1, 4);
  const [T, u] = halfLife(rng);
  const t = T * k;
  const ans = 1 / 2 ** k;
  return pack(rng, {
    stem: `${rng.pick(SOURCE)} has a half-life of ${T} ${u.word}. Find the fraction of the original nuclei that remain after ${t} ${u.word}, giving your answer as a fraction.`,
    answer: ans,
    format: 'fraction',
    must: [
      { value: 1 - ans, trap: 'gave the fraction that has decayed, not the fraction remaining' },
      { value: 1 / (2 * k), trap: 'halved once and then divided by the number of half-lives' },
    ],
    extra: [
      { value: 1 / 2 ** (k + 1), trap: 'used one half-life too many' },
      { value: 1 / 2 ** Math.max(1, k - 1), trap: 'used one half-life too few' },
      { value: 1 / (2 * k) === 1 / k ? null : 1 / k, trap: 'treated the decay as linear' },
      { value: 1 / 2 ** (2 * k), trap: 'halved twice per half-life' },
    ],
    solution: `${t} ${u.word} is $${t} \\div ${T} = ${k}$ half-${k === 1 ? 'life' : 'lives'}, so the fraction remaining is $\\left(\\tfrac12\\right)^{${k}} = \\tfrac{1}{${2 ** k}}$.`,
    trap: 'Each half-life halves what is left: after k half-lives the fraction is (1/2)^k, never 1/k.',
    tags: ['nuclear', 'half-life', 'fractions'],
    params: { variant: 'fraction-remaining', T, t },
  });
}

function massRemaining(rng: RNG): Generated | null {
  const k = rng.int(2, 4);
  const [T, u] = halfLife(rng);
  const m0 = rng.pick([32, 48, 64, 80, 96, 120, 160, 240, 320, 800]);
  const ans = m0 / 2 ** k;
  if (!Number.isInteger(ans) || ans < 1) return null;
  const t = T * k;
  return pack(rng, {
    stem: `${rng.pick(SOURCE)} of mass ${m0} g has a half-life of ${T} ${u.word}. Find the mass of the isotope that remains after ${t} ${u.word}.`,
    answer: ans,
    unit: U_G,
    must: [
      { value: m0 - ans, trap: 'gave the mass that has decayed, not the mass remaining' },
      { value: m0 / (2 * k), trap: 'divided by twice the number of half-lives instead of halving k times' },
    ],
    extra: [
      { value: m0 / 2 ** (k + 1), trap: 'used one half-life too many' },
      { value: m0 / 2 ** (k - 1), trap: 'used one half-life too few' },
      { value: m0 / k, trap: 'treated the decay as linear' },
      { value: m0 / 2, trap: 'halved only once' },
    ],
    solution: `${t} ${u.word} is ${k} half-lives, so the mass remaining is $${m0} \\div 2^{${k}} = ${num(ans)}\\ \\text{g}$.`,
    trap: 'Halve the mass once per half-life; dividing by the number of half-lives treats decay as linear.',
    tags: ['nuclear', 'half-life', 'mass'],
    params: { variant: 'mass-remaining', m0, T, t },
  });
}

// ------------------------------------------------------------------------------------------ level 2

function timeToFraction(rng: RNG): Generated | null {
  const k = rng.int(2, 4);
  const [T, u] = halfLife(rng);
  const ans = k * T;
  return pack(rng, {
    stem: `${rng.pick(SOURCE)} has a half-life of ${T} ${u.word}. Find the time taken for its activity to fall to ${FRACTION_WORDS[2 ** k]} of its initial value.`,
    answer: ans,
    unit: u.tex,
    must: [
      { value: T / k, trap: 'divided the half-life by the number of half-lives instead of multiplying' },
      { value: T * 2 ** k, trap: 'multiplied by 2^k instead of by k' },
    ],
    extra: [
      { value: T * (k + 1), trap: 'used one half-life too many' },
      { value: T * (k - 1), trap: 'used one half-life too few' },
      { value: T, trap: 'stopped after one half-life' },
      { value: T * k * 2, trap: 'doubled the time' },
    ],
    solution: `$\\tfrac{1}{${2 ** k}} = \\left(\\tfrac12\\right)^{${k}}$, so ${k} half-lives are needed: $t = ${k} \\times ${T} = ${ans}$ ${u.word}.`,
    trap: 'Falling to 1/2^k takes k half-lives: multiply the half-life by k.',
    tags: ['nuclear', 'half-life', 'time'],
    params: { variant: 'time-to-fraction', T, k },
  });
}

function activityAfter(rng: RNG): Generated | null {
  const k = rng.int(2, 4);
  const [T, u] = halfLife(rng);
  const A0 = rng.pick([160, 320, 480, 640, 800, 960, 1280, 1600]);
  const ans = A0 / 2 ** k;
  if (!Number.isInteger(ans) || ans < 5) return null;
  const t = k * T;
  return pack(rng, {
    stem: `${rng.pick(SOURCE)} has an activity of ${A0} Bq and a half-life of ${T} ${u.word}. Find its activity after ${t} ${u.word}.`,
    answer: ans,
    unit: U_BQ,
    must: [
      { value: A0 - ans, trap: 'gave the drop in activity, not the activity left' },
      { value: A0 / (2 * k), trap: 'divided by 2k instead of halving k times' },
    ],
    extra: [
      { value: A0 / 2 ** (k + 1), trap: 'used one half-life too many' },
      { value: A0 / 2 ** (k - 1), trap: 'used one half-life too few' },
      { value: A0 / k, trap: 'treated the decay as linear' },
      { value: A0 / 2, trap: 'halved only once' },
    ],
    solution: `${t} ${u.word} is ${k} half-lives, so the activity is $${A0} \\div 2^{${k}} = ${num(ans)}\\ \\text{Bq}$.`,
    trap: 'Activity halves every half-life: divide by 2 k times, not by k.',
    tags: ['nuclear', 'half-life', 'activity'],
    params: { variant: 'activity-after', A0, T, t },
  });
}

// ------------------------------------------------------------------------------------------ level 3

function halfLivesFromRatio(rng: RNG): Generated | null {
  const k = rng.int(3, 6);
  const ratio = 2 ** k;
  const A0 = rng.pick([64, 128, 256, 320, 640, 960, 1280]);
  const A1 = A0 / ratio;
  if (!Number.isInteger(A1) || A1 < 1) return null;
  // The answer is a count of halvings — a single-digit number. Only the headline trap (the ratio itself)
  // may be large; anything else in the hundreds is eliminated on sight and wastes an option.
  const small = (x: number): number | null => (x >= 1 && x <= 3 * k + 4 ? x : null);
  return pack(rng, {
    stem: `The activity of a radioactive source falls from ${A0} Bq to ${num(A1)} Bq. Find the number of half-lives that have passed.`,
    answer: k,
    must: [
      { value: ratio, trap: 'gave the ratio of the activities, not the number of halvings' },
      { value: k + 1, trap: 'counted one halving too many' },
    ],
    extra: [
      { value: k - 1, trap: 'counted one halving too few' },
      { value: k + 2, trap: 'counted two halvings too many' },
      { value: small(k - 2), trap: 'counted two halvings too few' },
      { value: 2 * k, trap: 'doubled the number of half-lives' },
      { value: small(ratio / 2), trap: 'halved the ratio instead of counting the halvings' },
      { value: small(Math.round(k / 2)), trap: 'halved the number of halvings' },
    ],
    solution: `$${A0} \\div ${num(A1)} = ${ratio} = 2^{${k}}$, so ${k} half-lives have passed.`,
    trap: 'Count the halvings: a fall to 1/32 is five half-lives, not 32.',
    tags: ['nuclear', 'half-life', 'ratio'],
    params: { variant: 'half-lives-from-ratio', A0, A1 },
  });
}

function timeFromRatio(rng: RNG): Generated | null {
  const k = rng.int(3, 5);
  const ratio = 2 ** k;
  const [T, u] = halfLife(rng);
  const ans = k * T;
  const A0 = rng.pick([64, 128, 256, 320, 640, 960]);
  const A1 = A0 / ratio;
  if (!Number.isInteger(A1) || A1 < 1) return null;
  return pack(rng, {
    stem: `A radioactive source has a half-life of ${T} ${u.word}. Find the time taken for its activity to fall from ${A0} Bq to ${num(A1)} Bq.`,
    answer: ans,
    unit: u.tex,
    must: [
      { value: T * ratio, trap: 'multiplied the half-life by the activity ratio instead of by the number of halvings' },
      { value: T / k, trap: 'divided the half-life by the number of half-lives' },
    ],
    extra: [
      { value: T * (k + 1), trap: 'counted one half-life too many' },
      { value: T * (k - 1), trap: 'counted one half-life too few' },
      { value: T, trap: 'stopped after one half-life' },
      { value: 2 * T * k, trap: 'doubled the time' },
    ],
    solution: `$${A0} \\div ${num(A1)} = ${ratio} = 2^{${k}}$, so ${k} half-lives pass: $t = ${k} \\times ${T} = ${ans}$ ${u.word}.`,
    trap: 'Find the number of halvings first, then multiply by the half-life.',
    tags: ['nuclear', 'half-life', 'time'],
    params: { variant: 'time-from-ratio', T, A0, A1 },
  });
}

// ------------------------------------------------------------------------------------------ level 4

function decayedRatio(rng: RNG): Generated | null {
  const k = rng.int(2, 5);
  const ans = 2 ** k - 1;
  return pack(rng, {
    stem: `After ${k} half-lives, the ratio of the number of nuclei that have decayed to the number that remain is $k : 1$. Find the value of $k$.`,
    answer: ans,
    must: [
      { value: 2 ** k, trap: 'gave 2^k: the decayed nuclei are 2^k − 1 parts to 1 part remaining' },
      { value: k, trap: 'gave the number of half-lives' },
    ],
    extra: [
      { value: 2 ** (k + 1) - 1, trap: 'used one half-life too many' },
      { value: 2 ** (k - 1) - 1, trap: 'used one half-life too few' },
      { value: 2 * k, trap: 'doubled the number of half-lives' },
      { value: 2 ** k + 1, trap: 'added one instead of subtracting it' },
    ],
    solution: `After ${k} half-lives $\\tfrac{1}{${2 ** k}}$ remains, so $\\tfrac{${ans}}{${2 ** k}}$ has decayed. The ratio is $${ans} : 1$, so $k = ${ans}$.`,
    trap: 'Decayed : remaining after k half-lives is (2^k − 1) : 1, so 3 half-lives give 7 : 1, not 8 : 1.',
    tags: ['nuclear', 'half-life', 'ratio'],
    params: { variant: 'decayed-ratio', k },
  });
}

function fractionDecayed(rng: RNG): Generated | null {
  const k = rng.int(2, 5);
  const ans = 1 - 1 / 2 ** k;
  return pack(rng, {
    stem: `${rng.pick(SOURCE)} is left for ${k} half-lives. Find the fraction of the original nuclei that have decayed, giving your answer as a fraction.`,
    answer: ans,
    format: 'fraction',
    must: [
      { value: 1 / 2 ** k, trap: 'gave the fraction remaining, not the fraction that has decayed' },
      { value: 1 - 1 / 2 ** (k - 1), trap: 'used one half-life too few' },
    ],
    extra: [
      { value: 1 - 1 / 2 ** (k + 1), trap: 'used one half-life too many' },
      { value: 1 / 2 ** (k - 1), trap: 'gave the fraction remaining one half-life earlier' },
      { value: k / (2 ** k), trap: 'treated the decay as linear' },
      { value: 1 / 2, trap: 'thought one half decays however long you wait' },
    ],
    solution: `The fraction remaining is $\\tfrac{1}{${2 ** k}}$, so the fraction that has decayed is $1 - \\tfrac{1}{${2 ** k}} = \\tfrac{${2 ** k - 1}}{${2 ** k}}$.`,
    trap: 'Decayed = 1 − remaining; the remaining fraction is the one that halves.',
    tags: ['nuclear', 'half-life', 'fractions'],
    params: { variant: 'fraction-decayed', k },
  });
}

function decayDuringNth(rng: RNG): Generated | null {
  const k = rng.int(2, 5);
  const ans = 1 / 2 ** k;
  const ord = ['', 'first', 'second', 'third', 'fourth', 'fifth'][k];
  return pack(rng, {
    stem: `${rng.pick(SOURCE)} decays with a constant half-life. Find the fraction of the original nuclei that decay during the ${ord} half-life, giving your answer as a fraction.`,
    answer: ans,
    format: 'fraction',
    must: [
      { value: 1 / 2 ** (k - 1), trap: 'gave the fraction still present at the start of that half-life' },
      { value: 1 / 2, trap: 'half of the nuclei present decay, but the question asks for a fraction of the original number' },
    ],
    extra: [
      { value: 1 - 1 / 2 ** k, trap: 'gave the total fraction decayed so far' },
      { value: 1 / 2 ** (k + 1), trap: 'went one half-life too far' },
      { value: 1 / (2 * k), trap: 'treated the decay as linear' },
      { value: 1 - 1 / 2 ** (k - 1), trap: 'gave the fraction decayed before that half-life started' },
    ],
    solution: `At the start of the ${ord} half-life $\\tfrac{1}{${2 ** (k - 1)}}$ of the nuclei are left; half of them decay during it, so the fraction is $\\tfrac{1}{${2 ** (k - 1)}} - \\tfrac{1}{${2 ** k}} = \\tfrac{1}{${2 ** k}}$.`,
    trap: 'Half of what is left decays each half-life, and what is left keeps shrinking.',
    tags: ['nuclear', 'half-life', 'fractions'],
    params: { variant: 'decay-during', k },
  });
}

// ------------------------------------------------------------------------------------------ level 5

function halfLifeFromReadings(rng: RNG): Generated | null {
  const k = rng.int(3, 5);
  const [T, u] = halfLife(rng);
  const t = k * T;
  const A0 = rng.pick([320, 400, 640, 800, 960, 1600]);
  const A1 = A0 / 2 ** k;
  if (!Number.isInteger(A1) || A1 < 5 || t > 200) return null;
  return pack(rng, {
    stem: `The activity of a radioactive source falls from ${A0} Bq to ${num(A1)} Bq in ${t} ${u.word}. Find the half-life of the source.`,
    answer: T,
    unit: u.tex,
    must: [
      { value: t / 2 ** k, trap: 'divided the time by the activity ratio instead of by the number of halvings' },
      { value: t / (k + 1), trap: 'counted one halving too many' },
    ],
    extra: [
      { value: t / (k - 1), trap: 'counted one halving too few' },
      { value: t / 2, trap: 'assumed a single halving, then halved the time' },
      { value: t, trap: 'gave the whole time' },
      { value: 2 * T, trap: 'doubled the half-life' },
    ],
    solution: `$${A0} \\div ${num(A1)} = ${2 ** k} = 2^{${k}}$, so ${k} half-lives fit into ${t} ${u.word}: $T = ${t} \\div ${k} = ${T}$ ${u.word}.`,
    trap: 'Divide the time by the number of halvings, not by the ratio of the activities.',
    tags: ['nuclear', 'half-life', 'activity'],
    params: { variant: 'half-life-from-readings', A0, A1, t },
  });
}

function backgroundCount(rng: RNG): Generated | null {
  const k = rng.int(2, 3);
  const B = rng.pick([10, 20, 25, 40]);
  const src = rng.pick([320, 400, 480, 640, 800, 960]);
  const R0 = src + B;
  const ans = src / 2 ** k + B;
  if (!Number.isInteger(src / 2 ** k)) return null;
  const [T, u] = halfLife(rng, SLOW_UNITS);
  const t = k * T;
  return pack(rng, {
    stem: `A detector placed next to a radioactive source records ${R0} counts per minute. With the source removed, it records a background rate of ${B} counts per minute. The source has a half-life of ${T} ${u.word}. Find the count rate the detector records ${t} ${u.word} later, in counts per minute.`,
    answer: ans,
    must: [
      { value: R0 / 2 ** k, trap: 'halved the whole reading without subtracting the background first' },
      { value: src / 2 ** k, trap: 'forgot to add the background back on at the end' },
    ],
    extra: [
      { value: src / 2 ** (k + 1) + B, trap: 'used one half-life too many' },
      { value: src / 2 ** (k - 1) + B, trap: 'used one half-life too few' },
      { value: R0 / 2 ** k + B, trap: 'added the background back but never subtracted it' },
      { value: R0 - B * k, trap: 'subtracted the background once per half-life' },
    ],
    solution: `The source alone gives $${R0} - ${B} = ${src}$ counts per minute. After ${k} half-lives that is $${src} \\div ${2 ** k} = ${num(src / 2 ** k)}$, and the detector still sees the background: $${num(src / 2 ** k)} + ${B} = ${num(ans)}$ counts per minute.`,
    trap: 'Only the count rate from the source decays: subtract the background first, then add it back.',
    tags: ['nuclear', 'half-life', 'background'],
    params: { variant: 'background-count', R0, B, k },
  });
}

function halfLifeWithBackground(rng: RNG): Generated | null {
  const k = rng.int(2, 4);
  const [T, u] = halfLife(rng, SLOW_UNITS);
  const t = k * T;
  const B = rng.pick([10, 20, 25, 40]);
  const src = rng.pick([240, 320, 480, 640, 800, 960]);
  const R0 = src + B;
  const R1 = src / 2 ** k + B;
  if (!Number.isInteger(src / 2 ** k) || src / 2 ** k < 5 || t > 200) return null;
  return pack(rng, {
    stem: `A detector next to a radioactive source records ${R0} counts per minute; with the source removed it records ${B} counts per minute. After ${t} ${u.word} the detector next to the source records ${num(R1)} counts per minute. Find the half-life of the source.`,
    answer: T,
    unit: u.tex,
    must: [
      { value: t / Math.round(R0 / R1), trap: 'used the ratio of the raw readings instead of subtracting the background' },
      { value: t / 2 ** k, trap: 'divided the time by the ratio of the corrected rates instead of by the number of halvings' },
    ],
    extra: [
      { value: t / (k + 1), trap: 'counted one halving too many' },
      { value: t / (k - 1), trap: 'counted one halving too few' },
      { value: t, trap: 'gave the whole time' },
      { value: 2 * T, trap: 'doubled the half-life' },
    ],
    solution: `Correct for background first: $${R0} - ${B} = ${src}$ falls to $${num(R1)} - ${B} = ${num(src / 2 ** k)}$, a factor of $${2 ** k} = 2^{${k}}$. So ${k} half-lives take ${t} ${u.word} and $T = ${T}$ ${u.word}.`,
    trap: 'Background never decays: subtract it from both readings before comparing them.',
    tags: ['nuclear', 'half-life', 'background'],
    params: { variant: 'half-life-background', R0, R1, B, t },
  });
}

const BY_LEVEL: Record<Level, ((rng: RNG) => Generated | null)[]> = {
  1: [fractionRemaining, massRemaining],
  2: [timeToFraction, activityAfter],
  3: [halfLivesFromRatio, timeFromRatio, timeFromRatio],
  4: [decayedRatio, fractionDecayed, decayDuringNth],
  5: [halfLifeFromReadings, backgroundCount, halfLifeWithBackground],
};

export default defineTemplate({
  id: 'phy.nuclear.half-life',
  module: 'PHY',
  topic: 'nuclear',
  title: 'Half-life with clean ratios',
  levels: {
    1: 'the fraction (or mass) remaining after n ≤ 4 half-lives',
    2: 'the time to fall to one eighth; the activity after a given time',
    3: 'the number of half-lives behind a ratio (1/32 → 5) and the time it takes',
    4: 'decayed : remaining after n half-lives (7 : 1), the fraction decayed, the nth half-life',
    5: 'the half-life from two readings (800 → 50 Bq in 24 h); count rates including background',
  },
  generate(rng, level: Level) {
    return retry(rng, () => pickVariant(rng, BY_LEVEL[level]));
  },
  verify(q) {
    // Independent check: the continuous law N = N0 · 2^(−t/T), never the generator's powers of two.
    if (q.answer.kind !== 'exact') return false;
    const a = q.answer.value.toNumber();
    const p = q.params as Record<string, number> & { variant: string };
    const close = (x: number, y: number) => Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(y));
    const decay = (t: number, T: number) => Math.pow(2, -t / T);
    switch (p.variant) {
      case 'fraction-remaining': return close(a, decay(p.t, p.T));
      case 'mass-remaining': return close(a, p.m0 * decay(p.t, p.T));
      case 'time-to-fraction': return close(decay(a, p.T), Math.pow(2, -p.k));
      case 'activity-after': return close(a, p.A0 * decay(p.t, p.T));
      case 'half-lives-from-ratio': return close(decay(a, 1), p.A1 / p.A0);
      case 'time-from-ratio': return close(p.A0 * decay(a, p.T), p.A1);
      case 'decayed-ratio': {
        const remaining = decay(p.k, 1);
        return close(a, (1 - remaining) / remaining);
      }
      case 'fraction-decayed': return close(a, 1 - decay(p.k, 1));
      case 'decay-during': return close(a, decay(p.k - 1, 1) - decay(p.k, 1));
      case 'half-life-from-readings': return a > 0 && close(p.A0 * decay(p.t, a), p.A1);
      case 'background-count': {
        const src = p.R0 - p.B;
        return close(a, src * decay(p.k, 1) + p.B);
      }
      case 'half-life-background': return a > 0 && close((p.R0 - p.B) * decay(p.t, a) + p.B, p.R1);
      default: return false;
    }
  },
});
