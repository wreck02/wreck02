import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, Exact, frac, surd, surdFrac, type NumberFormat } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { exactSin, exactTan, num } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Reflection, refraction, refractive index and total internal reflection.
 * Level 1: n = c/v and v = c/n (n = 1.5 → 2 × 10^8 m s^-1)
 * Level 2: the law of reflection with the angle measured from the mirror rather than the normal;
 *          n = sin i / sin r for the exact pairs 45°/30° (√2), 60°/30° (√3), 60°/45° (√6/2)
 * Level 3: the angle of refraction from n and i; the critical angle from sin C = 1/n (n = 2 → 30°, √2 → 45°),
 *          and sin C itself as a fraction
 * Level 4: the wavelength in glass (λ divides by n, f unchanged) and which quantity changes
 * Level 5: a parallel-sided block (the emergent angle equals the angle of incidence); total internal
 *          reflection versus refraction at a given angle; a plane-mirror image distance
 *
 * All angles are measured from the normal unless the stem says otherwise — which is exactly the trap.
 */

const DEG = (d: number): string => `$${num(d)}^{\\circ}$`;
const U_MS = '\\text{m s}^{-1}';
const U_NM = '\\text{nm}';
const U_M = '\\text{m}';
const C = 3e8;
const C_TEX = '3 \\times 10^{8}';

const r12 = (x: number): number => Number(x.toPrecision(12));
const X = (x: number): Exact => Exact.num(r12(x));
const sinD = (d: number): number => Math.sin((d * Math.PI) / 180);

type Cand = { value: Exact | null; trap: string };

/** Positive, exam-clean, and (for decimal/sf lists) printable without a fraction bar. */
function usable(v: Exact | null, format: NumberFormat): v is Exact {
  if (!v || !Number.isFinite(v.toNumber()) || v.sign() <= 0) return false;
  if (!isCleanExact(v).ok) return false;
  if (format !== 'fraction' && v.isRational() && v.toLatex({ format }).includes('\\frac')) return false;
  return true;
}

function ranked(rng: RNG, answer: Exact, must: Cand[], extra: Cand[], format: NumberFormat, count = 4): Distractor[] {
  const seen: Exact[] = [answer];
  const out: Distractor[] = [];
  const take = (d: Cand) => {
    if (out.length >= count || !usable(d.value, format) || seen.some((s) => s.equals(d.value!))) return;
    seen.push(d.value);
    out.push({ value: d.value, trap: d.trap });
  };
  must.forEach(take);
  rng.shuffle(extra).forEach(take);
  return out;
}

interface Pack {
  stem: string;
  answer: Exact;
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
  if (!usable(p.answer, format)) return null;
  const ds = ranked(rng, p.answer, p.must, p.extra, format);
  if (ds.length < 4) return null;
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

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

// ------------------------------------------------------------------------------------------ level 1

const INDEX_SPEED: [number, number][] = [[1.2, 2.5e8], [1.25, 2.4e8], [1.5, 2e8], [2, 1.5e8], [2.4, 1.25e8], [2.5, 1.2e8], [3, 1e8], [4, 7.5e7]];
const MATERIAL = ['A transparent material', 'A glass block', 'A block of transparent plastic', 'A transparent liquid'];
const material = (rng: RNG): string => rng.pick(MATERIAL).replace(/^A /, 'a ');

function speedInMedium(rng: RNG): Generated | null {
  const [n, v] = rng.pick(INDEX_SPEED);
  return pack(rng, {
    stem: `${rng.pick(MATERIAL)} has refractive index ${num(n)}. The speed of light in a vacuum is $${C_TEX}\\ \\text{m s}^{-1}$. Find the speed of light in the material.`,
    answer: X(v),
    unit: U_MS,
    format: 'sf',
    must: [
      { value: X(r12(C * n)), trap: 'multiplied by n instead of dividing: n = c/v' },
      { value: X(C), trap: 'assumed light travels at c in every material' },
      { value: X(r12(C / (2 * n))), trap: 'halved as well as dividing by n' },
    ],
    extra: [
      { value: X(r12((2 * C) / n)), trap: 'doubled the answer' },
      { value: X(r12(C / (n * n))), trap: 'divided by n twice' },
      { value: X(r12(C / (10 * n))), trap: 'slipped one power of ten' },
    ],
    solution: `$n = \\dfrac{c}{v}$, so $v = \\dfrac{c}{n} = \\dfrac{${C_TEX}}{${num(n)}} = ${X(v).toLatex({ format: 'sf' })}\\ \\text{m s}^{-1}$.`,
    trap: 'Light slows down in a medium: v = c/n, never cn.',
    tags: ['waves', 'refraction', 'refractive-index'],
    params: { variant: 'v-from-n', n },
  });
}

function indexFromSpeed(rng: RNG): Generated | null {
  const [n, v] = rng.pick(INDEX_SPEED);
  return pack(rng, {
    stem: `Light travels through ${material(rng)} at $${X(v).toLatex({ format: 'sf' })}\\ \\text{m s}^{-1}$. The speed of light in a vacuum is $${C_TEX}\\ \\text{m s}^{-1}$. Find the refractive index of the material.`,
    answer: X(n),
    must: [
      { value: X(r12(v / C)), trap: 'divided the wrong way round: n = c/v' },
      { value: X(r12(2 * n)), trap: 'doubled the ratio' },
    ],
    extra: [
      { value: X(r12(n / 2)), trap: 'halved the ratio' },
      { value: X(r12(n + 1)), trap: 'added one to the ratio' },
      { value: X(r12(n + 0.5)), trap: 'arithmetic slip in the division' },
      { value: X(r12(10 * n)), trap: 'slipped a power of ten' },
    ],
    solution: `$n = \\dfrac{c}{v} = \\dfrac{${C_TEX}}{${X(v).toLatex({ format: 'sf' })}} = ${num(n)}$.`,
    trap: 'The refractive index is greater than 1: it is c/v, not v/c.',
    tags: ['waves', 'refraction', 'refractive-index'],
    params: { variant: 'n-from-v', v },
  });
}

// ------------------------------------------------------------------------------------------ level 2

function reflection(rng: RNG): Generated | null {
  const form = rng.pick(['to-normal', 'to-mirror', 'between-rays']);
  const a = rng.pick([20, 25, 30, 35, 40, 50, 55, 60, 65, 70]);
  if (form === 'to-normal') {
    const ans = 90 - a;
    return pack(rng, {
      stem: `A ray of light strikes a plane mirror. The angle between the incident ray and the surface of the mirror is ${DEG(a)}. Find the angle of reflection, measured from the normal, in degrees.`,
      answer: E(ans),
      must: [
        { value: E(a), trap: 'gave the angle to the mirror, not the angle to the normal' },
        { value: E(2 * ans), trap: 'gave the angle between the incident and reflected rays' },
      ],
      extra: [
        { value: E(2 * a), trap: 'doubled the angle to the mirror' },
        { value: E(45), trap: 'assumed the ray strikes at 45°' },
        { value: E(90), trap: 'used the whole right angle' },
        { value: E(ans / 2), trap: 'halved the angle' },
      ],
      solution: `The normal is at ${DEG(90)} to the mirror, so the angle of incidence is $90^{\\circ} - ${a}^{\\circ} = ${ans}^{\\circ}$, and the angle of reflection equals it.`,
      trap: 'Angles of incidence and reflection are measured from the normal, not from the mirror.',
      tags: ['waves', 'reflection', 'angles'],
      params: { variant: 'reflect-to-normal', a },
    });
  }
  if (form === 'to-mirror') {
    const ans = 90 - a;
    return pack(rng, {
      stem: `A ray of light strikes a plane mirror at an angle of incidence of ${DEG(a)}. Find the angle between the reflected ray and the surface of the mirror, in degrees.`,
      answer: E(ans),
      must: [
        { value: E(a), trap: 'gave the angle to the normal, not the angle to the mirror' },
        { value: E(2 * a), trap: 'gave the angle between the incident and reflected rays' },
      ],
      extra: [
        { value: E(2 * ans), trap: 'doubled the angle to the mirror' },
        { value: E(45), trap: 'assumed the ray strikes at 45°' },
        { value: E(90), trap: 'used the whole right angle' },
        { value: E(ans / 2), trap: 'halved the angle' },
      ],
      solution: `The reflected ray leaves at ${DEG(a)} to the normal, and the normal is at ${DEG(90)} to the mirror, so the angle to the mirror is $90^{\\circ} - ${a}^{\\circ} = ${ans}^{\\circ}$.`,
      trap: 'Angles of incidence and reflection are measured from the normal, not from the mirror.',
      tags: ['waves', 'reflection', 'angles'],
      params: { variant: 'reflect-to-mirror', a },
    });
  }
  if (a > 60) return null;
  const ans = 2 * a;
  return pack(rng, {
    stem: `A ray of light strikes a plane mirror at an angle of incidence of ${DEG(a)}. Find the angle between the incident ray and the reflected ray, in degrees.`,
    answer: E(ans),
    must: [
      { value: E(a), trap: 'gave the angle of reflection instead of the angle between the rays' },
      { value: E(2 * (90 - a)), trap: 'doubled the angle to the mirror instead of the angle to the normal' },
    ],
    extra: [
      { value: E(90 - a), trap: 'gave the angle to the mirror' },
      { value: E(180 - 2 * a), trap: 'took the supplement' },
      { value: E(90), trap: 'assumed the rays are perpendicular' },
      { value: E(45), trap: 'assumed the ray strikes at 45°' },
    ],
    solution: `Each ray makes ${DEG(a)} with the normal, one on each side, so the angle between them is $2 \\times ${a}^{\\circ} = ${ans}^{\\circ}$.`,
    trap: 'The two rays sit either side of the normal: the angle between them is 2i.',
    tags: ['waves', 'reflection', 'angles'],
    params: { variant: 'reflect-between', a },
  });
}

/** (i, r) pairs whose sine ratio is an exact surd. */
const SNELL_PAIRS: [number, number][] = [[45, 30], [60, 30], [60, 45]];

function indexFromAngles(rng: RNG): Generated | null {
  const [i, rr] = rng.pick(SNELL_PAIRS);
  const n = exactSin(i).div(exactSin(rr));
  const tanI = exactTan(i), tanR = exactTan(rr);
  return pack(rng, {
    stem: `A ray of light passes from air into a transparent material. The angle of incidence is ${DEG(i)} and the angle of refraction is ${DEG(rr)}. Find the refractive index of the material, giving your answer in exact form.`,
    answer: n,
    format: 'auto',
    must: [
      { value: exactSin(rr).div(exactSin(i)), trap: 'inverted the ratio: n = sin i / sin r' },
      { value: frac(i, rr), trap: 'used the angles themselves instead of their sines' },
    ],
    extra: [
      { value: frac(rr, i), trap: 'used the angles, and the wrong way round' },
      { value: tanI && tanR ? tanI.div(tanR) : null, trap: 'used tangents instead of sines' },
      { value: surd(2), trap: 'quoted the 45°/30° value' },
      { value: surd(3), trap: 'quoted the 60°/30° value' },
      { value: surdFrac(1, 2, 6), trap: 'quoted the 60°/45° value' },
    ],
    solution: `$n = \\dfrac{\\sin ${i}^{\\circ}}{\\sin ${rr}^{\\circ}} = \\dfrac{${exactSin(i).toLatex()}}{${exactSin(rr).toLatex()}} = ${n.toLatex()}$.`,
    trap: 'Snell\'s law uses the sines of the angles, and n = sin i / sin r for a ray entering the denser medium.',
    tags: ['waves', 'refraction', 'snell', 'surds'],
    params: { variant: 'n-from-angles', i, r: rr },
  });
}

// ------------------------------------------------------------------------------------------ level 3

const N_TEX: Record<string, string> = { '1.414': '\\sqrt{2}', '1.732': '\\sqrt{3}', '1.225': '\\frac{\\sqrt{6}}{2}', '2': '2' };
const nTex = (n: number): string => N_TEX[String(Number(n.toPrecision(4)))] ?? num(n);

function refractionAngle(rng: RNG): Generated | null {
  const [i, rr] = rng.pick(SNELL_PAIRS);
  const n = sinD(i) / sinD(rr);
  return pack(rng, {
    stem: `A ray of light passes from air into a material of refractive index $${nTex(n)}$. The angle of incidence is ${DEG(i)}. Find the angle of refraction, in degrees.`,
    answer: E(rr),
    must: [
      { value: E(i), trap: 'assumed the ray is not bent' },
      { value: E(90 - rr), trap: 'measured the refracted ray from the surface instead of from the normal' },
    ],
    extra: [
      { value: E(90), trap: 'used sin r = n sin i, which cannot be solved here' },
      { value: E(2 * rr), trap: 'doubled the angle' },
      { value: E(rr / 2), trap: 'halved the angle' },
      { value: E(45), trap: 'guessed 45° without using the sines' },
      { value: E(15), trap: 'over-estimated the bending' },
    ],
    solution: `$\\sin r = \\dfrac{\\sin i}{n} = \\dfrac{${exactSin(i).toLatex()}}{${nTex(n)}} = ${exactSin(rr).toLatex()}$, so $r = ${rr}^{\\circ}$.`,
    trap: 'Entering a denser medium the ray bends towards the normal: divide sin i by n, do not multiply.',
    tags: ['waves', 'refraction', 'snell'],
    params: { variant: 'r-from-n-i', i, r: rr },
  });
}

const CRITICAL: [number, number, string][] = [[2, 30, '2'], [Math.SQRT2, 45, '\\sqrt{2}']];

function criticalAngle(rng: RNG): Generated | null {
  const [n, Cdeg, tex] = rng.pick(CRITICAL);
  return pack(rng, {
    stem: `A material has refractive index $${tex}$. Find the critical angle for a boundary between this material and air, in degrees.`,
    answer: E(Cdeg),
    must: [
      { value: E(90 - Cdeg), trap: 'took the complement: sin C = 1/n, not cos C = 1/n' },
      { value: exactSin(Cdeg), trap: 'gave sin C instead of the angle C' },
    ],
    extra: [
      { value: E(Cdeg === 30 ? 45 : 30), trap: 'quoted the critical angle of the other standard material' },
      { value: E(Cdeg / 2), trap: 'halved the angle' },
      { value: E(2 * Cdeg), trap: 'doubled the angle' },
      { value: E(15), trap: 'arithmetic slip' },
    ],
    solution: `$\\sin C = \\dfrac{1}{n} = \\dfrac{1}{${tex}}${n === 2 ? '' : ` = ${exactSin(Cdeg).toLatex()}`}$, so $C = ${Cdeg}^{\\circ}$.`,
    trap: 'sin C = 1/n gives the sine of the critical angle; the answer wanted is the angle itself.',
    tags: ['waves', 'refraction', 'critical-angle'],
    params: { variant: 'critical-angle', n },
  });
}

const SIN_C: [number, number, number][] = [[1.5, 2, 3], [1.25, 4, 5], [2.5, 2, 5], [1.2, 5, 6], [2, 1, 2], [1.6, 5, 8], [1.75, 4, 7]];

function sinCritical(rng: RNG): Generated | null {
  const [n, p, qd] = rng.pick(SIN_C);
  return pack(rng, {
    stem: `A material has refractive index ${num(n)}. The critical angle for a boundary between this material and air is $C$. Find $\\sin C$, giving your answer as a fraction in its lowest terms.`,
    answer: frac(p, qd),
    format: 'fraction',
    must: [
      { value: frac(qd, p), trap: 'gave n itself: sin C = 1/n' },
      { value: frac(p, 2 * qd), trap: 'halved the fraction' },
    ],
    extra: [
      { value: frac(2 * p, qd), trap: 'doubled the fraction' },
      { value: frac(qd, 2 * p), trap: 'halved n instead of inverting it' },
      { value: frac(qd - p, qd), trap: 'took 1 − 1/n' },
      { value: frac(p, qd + p), trap: 'used 1/(n + 1)' },
    ],
    solution: `$\\sin C = \\dfrac{1}{n} = \\dfrac{1}{${num(n)}} = \\dfrac{${p}}{${qd}}$.`,
    trap: 'sin C = 1/n: the fraction is the reciprocal of the refractive index.',
    tags: ['waves', 'refraction', 'critical-angle', 'fractions'],
    params: { variant: 'sin-critical', n },
  });
}

// ------------------------------------------------------------------------------------------ level 4

const GLASS_LAMBDA: [number, number][] = [[600, 1.5], [750, 1.5], [900, 1.5], [450, 1.5], [600, 2], [400, 2], [480, 1.2], [660, 1.2], [500, 1.25], [750, 1.25]];

function wavelengthInGlass(rng: RNG): Generated | null {
  const [lam, n] = rng.pick(GLASS_LAMBDA);
  const inGlass = r12(lam / n);
  if (!Number.isInteger(inGlass)) return null;
  return pack(rng, {
    stem: `Light of wavelength ${lam} nm in air enters a glass block of refractive index ${num(n)}. The frequency of the light does not change. Find the wavelength of the light inside the glass.`,
    answer: E(inGlass),
    unit: U_NM,
    must: [
      { value: E(r12(lam * n)), trap: 'multiplied by n: the wavelength in glass is λ/n' },
      { value: E(lam), trap: 'assumed the wavelength does not change' },
      { value: E(r12(lam / (2 * n))), trap: 'halved as well as dividing by n' },
    ],
    extra: [
      { value: E(r12((2 * lam) / n)), trap: 'doubled the answer' },
      { value: E(r12(lam / (n * n))), trap: 'divided by n twice' },
      { value: E(r12(lam - 100)), trap: 'subtracted a round number instead of dividing' },
    ],
    solution: `The frequency is unchanged and $v = c/n$, so the wavelength divides by $n$: $\\lambda_{\\text{glass}} = \\dfrac{${lam}}{${num(n)}} = ${inGlass}\\ \\text{nm}$.`,
    trap: 'Entering glass the speed and the wavelength both fall by a factor n; the frequency is fixed by the source.',
    tags: ['waves', 'refraction', 'wavelength'],
    params: { variant: 'lambda-in-glass', lam, n },
  });
}

function changeChoice(rng: RNG): Generated | null {
  const into = rng.bool(0.5);
  const n = rng.pick([1.5, 2, 1.25]);
  const dir = into
    ? `from air into a glass block of refractive index ${num(n)}`
    : `from inside a glass block of refractive index ${num(n)} out into the air`;
  const word = into ? 'decreases' : 'increases';
  const other = into ? 'increases' : 'decreases';
  const correct = `The frequency is unchanged and the wavelength ${word}.`;
  const wrong = [
    { display: `The frequency is unchanged and the wavelength ${other}.`, trap: 'got the direction of the wavelength change the wrong way round' },
    { display: `The frequency ${word} and the wavelength is unchanged.`, trap: 'thought the frequency changes at a boundary' },
    { display: `Both the frequency and the wavelength ${word.replace(/s$/, '')}.`, trap: 'changed the frequency as well as the wavelength' },
    { display: `Both the frequency and the wavelength are unchanged.`, trap: 'forgot that the speed, and so the wavelength, changes' },
    { display: `The frequency ${other} and the wavelength ${word}.`, trap: 'changed the frequency as well' },
    { display: `The speed is unchanged and the frequency ${word}.`, trap: 'kept the speed fixed instead of the frequency' },
  ];
  return {
    stem: `A ray of light of frequency $5 \\times 10^{14}\\ \\text{Hz}$ passes ${dir}. Which of the following statements about the light after it crosses the boundary is correct?`,
    answer: { kind: 'choice', value: correct },
    options: buildChoiceOptions(rng, correct, wrong),
    solution: `The frequency is set by the source and never changes at a boundary. The speed ${word} by a factor of ${num(n)}, and since $v = f\\lambda$ with $f$ fixed, the wavelength ${word} in the same ratio.`,
    trap: 'At a boundary the frequency is fixed; the speed and the wavelength change together.',
    tags: ['waves', 'refraction', 'statements'],
    params: { variant: 'change-choice', into, n },
    typedAllowed: false,
  };
}

// ------------------------------------------------------------------------------------------ level 5

const BLOCK_PAIRS: [number, number][] = [[30, 20], [40, 25], [45, 30], [50, 30], [60, 35], [60, 40], [70, 40], [55, 35]];

function parallelBlock(rng: RNG): Generated | null {
  const [i, rr] = rng.pick(BLOCK_PAIRS);
  return pack(rng, {
    stem: `A ray of light in air strikes one face of a parallel-sided glass block at an angle of incidence of ${DEG(i)}. Inside the block the angle of refraction is ${DEG(rr)}. Find the angle, measured from the normal, at which the ray leaves the opposite face of the block.`,
    answer: E(i),
    must: [
      { value: E(rr), trap: 'gave the angle inside the block' },
      { value: E(i - rr), trap: 'gave the deviation at the first face' },
    ],
    extra: [
      { value: E(90 - i), trap: 'measured from the surface instead of from the normal' },
      { value: E(90 - rr), trap: 'measured the angle inside the block from the surface' },
      { value: E(2 * rr), trap: 'doubled the angle inside the block' },
      { value: E(i / 2), trap: 'halved the angle of incidence' },
      { value: E(i + rr), trap: 'added the two angles' },
    ],
    solution: `The two faces are parallel, so the ray refracts by the same amount on the way out as on the way in: it emerges at ${DEG(i)}, parallel to the original ray.`,
    trap: 'A parallel-sided block shifts the ray sideways but does not change its direction.',
    tags: ['waves', 'refraction', 'blocks'],
    params: { variant: 'parallel-block', i, r: rr },
  });
}

/** [n, angle of incidence inside the material, refraction angle out (null = total internal reflection), n as LaTeX, C as LaTeX] */
const TIR_CASES: [number, number, number | null, string, string][] = [
  [2, 45, null, '2', 'C = 30^{\\circ}'],
  [2, 60, null, '2', 'C = 30^{\\circ}'],
  [Math.SQRT2, 60, null, '\\sqrt{2}', 'C = 45^{\\circ}'],
  [Math.SQRT2, 30, 45, '\\sqrt{2}', 'C = 45^{\\circ}'],
  [Math.sqrt(3), 45, null, '\\sqrt{3}', 'C \\approx 34^{\\circ}'],
  [Math.sqrt(3), 30, 60, '\\sqrt{3}', 'C \\approx 34^{\\circ}'],
];

function tirChoice(rng: RNG): Generated | null {
  const [n, i, out, tex, cTex] = rng.pick(TIR_CASES);
  const TIR = 'The ray is totally internally reflected at the boundary.';
  const refr = (d: number) => `The ray refracts out of the material at ${DEG(d)} to the normal.`;
  const correct = out === null ? TIR : refr(out);
  const wrong: { display: string; trap: string }[] = [];
  if (out === null) {
    wrong.push({ display: refr(i), trap: 'assumed the ray always passes through, undeviated' });
    for (const d of [30, 45, 60, 90]) if (d !== i) wrong.push({ display: refr(d), trap: 'used sin r = sin i / n instead of n sin i, so missed that sin r would exceed 1' });
  } else {
    wrong.push({ display: TIR, trap: 'thought any ray meeting the boundary from inside is totally internally reflected' });
    for (const d of [30, 45, 60, 90]) if (d !== out) wrong.push({ display: refr(d), trap: 'divided by n instead of multiplying: leaving the material the ray bends away from the normal' });
  }
  wrong.push({ display: 'The ray passes out of the material without changing direction.', trap: 'forgot that the ray refracts at a boundary between two media' });
  return {
    stem: `A ray of light travelling inside a material of refractive index $${tex}$ meets the boundary with air at an angle of incidence of ${DEG(i)} to the normal. Which of the following describes what happens to the ray?`,
    answer: { kind: 'choice', value: correct },
    options: buildChoiceOptions(rng, correct, wrong),
    solution: out === null
      ? `$\\sin C = \\dfrac{1}{${tex}}$, so $${cTex}$. The angle of incidence ${DEG(i)} is greater than $C$, so the ray is totally internally reflected.`
      : `$\\sin C = \\dfrac{1}{${tex}}$, so $${cTex}$; ${DEG(i)} is less than $C$, so the ray refracts out. Then $\\sin r = n \\sin i = ${tex} \\times ${exactSin(i).toLatex()} = ${exactSin(out).toLatex()}$, giving $r = ${out}^{\\circ}$.`,
    trap: 'Compare the angle with the critical angle first; leaving the material the ray bends away from the normal (sin r = n sin i).',
    tags: ['waves', 'refraction', 'total-internal-reflection'],
    params: { variant: 'tir-choice', n, i, out },
    typedAllowed: false,
  };
}

function mirrorImage(rng: RNG): Generated | null {
  const d = rng.pick([0.5, 0.8, 1.2, 1.5, 2, 2.5, 3, 4]);
  if (rng.bool(0.5)) {
    return pack(rng, {
      stem: `An object is placed ${num(d)} m in front of a plane mirror. Find the distance between the object and its image.`,
      answer: E(r12(2 * d)),
      unit: U_M,
      must: [
        { value: E(d), trap: 'gave the distance of the image behind the mirror, not the object–image distance' },
        { value: E(r12(d / 2)), trap: 'halved instead of doubling' },
      ],
      extra: [
        { value: E(r12(4 * d)), trap: 'doubled twice' },
        { value: E(r12(d + 1)), trap: 'added a metre instead of doubling' },
        { value: E(r12(3 * d)), trap: 'counted the object distance twice as well as the image distance' },
      ],
      solution: `A plane mirror forms an image as far behind the mirror as the object is in front, so the separation is $2 \\times ${num(d)} = ${num(2 * d)}\\ \\text{m}$.`,
      trap: 'The image is the same distance behind the mirror: the object–image distance is twice the object distance.',
      tags: ['waves', 'optics', 'plane-mirror'],
      params: { variant: 'mirror-separation', d },
    });
  }
  const x = rng.pick([0.2, 0.25, 0.5, 0.75, 1]);
  if (x >= d) return null;
  return pack(rng, {
    stem: `A person stands ${num(d)} m in front of a plane mirror and then walks ${num(x)} m towards it. Find the decrease in the distance between the person and their image.`,
    answer: E(r12(2 * x)),
    unit: U_M,
    must: [
      { value: E(x), trap: 'gave the distance walked, forgetting the image moves as well' },
      { value: E(r12(2 * (d - x))), trap: 'gave the new person–image distance' },
    ],
    extra: [
      { value: E(r12(2 * d)), trap: 'gave the original person–image distance' },
      { value: E(r12(d - x)), trap: 'gave the new distance from the mirror' },
      { value: E(r12(4 * x)), trap: 'doubled twice' },
      { value: E(r12(x / 2)), trap: 'halved instead of doubling' },
    ],
    solution: `The person moves ${num(x)} m closer and the image moves ${num(x)} m closer too, so the separation falls by $2 \\times ${num(x)} = ${num(2 * x)}\\ \\text{m}$ (from ${num(2 * d)} m to ${num(2 * (d - x))} m).`,
    trap: 'Both the person and the image move: the separation changes by twice the distance walked.',
    tags: ['waves', 'optics', 'plane-mirror'],
    params: { variant: 'mirror-walk', d, x },
  });
}

const BY_LEVEL: Record<Level, ((rng: RNG) => Generated | null)[]> = {
  1: [speedInMedium, indexFromSpeed],
  2: [reflection, indexFromAngles, indexFromAngles],
  3: [refractionAngle, criticalAngle, sinCritical],
  4: [wavelengthInGlass, wavelengthInGlass, changeChoice],
  5: [parallelBlock, tirChoice, tirChoice, mirrorImage],
};

export default defineTemplate({
  id: 'phy.waves.refraction-optics',
  module: 'PHY',
  topic: 'waves',
  title: 'Refraction and basic optics',
  levels: {
    1: 'n = c/v (n = 1.5 → 2 × 10^8 m s^-1) and n from a given speed',
    2: 'law of reflection with the angle given to the mirror; n = sin i / sin r → √2, √3, √6/2',
    3: 'the angle of refraction from n and i; sin C = 1/n and the critical angle (n = 2 → 30°)',
    4: 'the wavelength in glass (λ/n, f unchanged) and which quantity changes at a boundary',
    5: 'parallel-sided block; total internal reflection versus refraction; plane-mirror image distances',
  },
  generate(rng, level: Level) {
    return retry(rng, () => pickVariant(rng, BY_LEVEL[level]));
  },
  verify(q) {
    // Independent check: floating-point Snell's law / n = c/v straight from the parameters.
    const p = q.params as Record<string, number> & { variant: string; into?: boolean; out?: number | null };
    const close = (x: number, y: number) => Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(y));
    const exact = q.answer.kind === 'exact' ? q.answer.value.toNumber() : NaN;
    switch (p.variant) {
      case 'v-from-n': return close(exact * p.n, C);
      case 'n-from-v': return close(exact * p.v, C);
      case 'reflect-to-normal':
      case 'reflect-to-mirror': return close(exact + p.a, 90);
      case 'reflect-between': return close(exact, 2 * p.a) && close(sinD(p.a), sinD(exact / 2));
      case 'n-from-angles': return close(exact * sinD(p.r), sinD(p.i));
      case 'r-from-n-i': return close((sinD(p.i) / sinD(p.r)) * sinD(exact), sinD(p.i));
      case 'critical-angle': return close(p.n * sinD(exact), 1);
      case 'sin-critical': return close(exact * p.n, 1);
      case 'lambda-in-glass': return close(exact * p.n, p.lam);
      case 'parallel-block': return close(exact, p.i) && p.r < p.i;
      case 'mirror-separation': return close(exact, 2 * p.d);
      case 'mirror-walk': return close(exact, 2 * p.x);
      case 'change-choice': {
        if (q.answer.kind !== 'choice') return false;
        // λ = v/f with f fixed: work both wavelengths out and compare them
        const f = 5e14;
        const lamBefore = (p.into ? C : C / p.n) / f;
        const lamAfter = (p.into ? C / p.n : C) / f;
        const word = lamAfter < lamBefore ? 'decreases' : 'increases';
        return q.answer.value === `The frequency is unchanged and the wavelength ${word}.`;
      }
      case 'tir-choice': {
        if (q.answer.kind !== 'choice') return false;
        const s = p.n * sinD(p.i);
        if (s > 1) return q.answer.value === 'The ray is totally internally reflected at the boundary.';
        const outDeg = (Math.asin(s) * 180) / Math.PI;
        const m = /at \$(\d+(?:\.\d+)?)\^/.exec(q.answer.value);
        return m !== null && close(Math.round(outDeg), Number(m[1])) && Math.abs(outDeg - Number(m[1])) < 1e-6;
      }
      default: return false;
    }
  },
});
