import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, Exact, frac, surd, surdFrac, type NumberFormat } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { exactSin, exactCos, exactTan, num } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Reflection, refraction, refractive index and total internal reflection.
 * Level 1: n = c/v and v = c/n (n = 1.5 → 2 × 10^8 m s^-1)
 * Level 2: the law of reflection with the angle measured from the mirror rather than the normal;
 *          n = sin i / sin r for the exact pairs 45°/30° (√2), 60°/30° (√3), 60°/45° (√6/2),
 *          air → material and material → air
 * Level 3: the angle of refraction from n and i; the critical angle from sin C = 1/n (n = 2 → 30°, √2 → 45°),
 *          and sin C itself as a fraction
 * Level 4: the wavelength inside the medium (λ divides by n, f unchanged), asked as a number and as a
 *          'choice' of what changes at the boundary
 * Level 5: a parallel-sided block (the emergent angle equals the angle of incidence); total internal
 *          reflection versus refraction at a given angle; a plane-mirror image distance
 *
 * All angles are measured from the normal unless the stem says otherwise — which is exactly the trap.
 * Every refractive index quoted is one a real transparent material has (water 1.33 … diamond 2.42),
 * and the material named always matches the index.
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
  // A 'fraction' list is exact-form throughout, so a fraction bar reads perfectly well there.
  if (format !== 'fraction' && v.isRational() && v.toLatex({ format }).includes('\\frac')) return false;
  return true;
}

/**
 * Choose the distractors.
 *
 * Most of the mistakes here (multiplying by n instead of dividing, leaving a quantity unchanged)
 * overshoot, so taking the headline traps first and filling up afterwards puts the answer
 * second-from-bottom in nearly every question — "pick the second smallest" would be a winning
 * strategy. Instead the number of options *below* the answer is drawn uniformly and then clamped to
 * what the candidate list can supply, and the `must` traps keep their priority inside each side.
 */
function ranked(rng: RNG, answer: Exact, must: Cand[], extra: Cand[], format: NumberFormat, count = 4): Distractor[] {
  const a = answer.toNumber();
  const seen: Exact[] = [answer];
  const pool: Distractor[] = [];
  for (const d of [...must, ...rng.shuffle(extra)]) {
    if (!usable(d.value, format) || seen.some((s) => s.equals(d.value!))) continue;
    seen.push(d.value);
    pool.push({ value: d.value, trap: d.trap });
  }
  const below = pool.filter((d) => d.value.toNumber() < a);
  const above = pool.filter((d) => d.value.toNumber() > a);
  const lo = Math.max(0, count - above.length);
  const hi = Math.min(count, below.length);
  const nBelow = Math.max(Math.min(rng.int(0, count), hi), Math.min(lo, hi));
  return [...below.slice(0, nBelow), ...above.slice(0, count - nBelow)];
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

/**
 * A material whose name matches its refractive index (water 1.33, glass 1.5–1.6, diamond 2.42 is the
 * usual ceiling): no "transparent liquid of refractive index 4".
 */
function materialFor(rng: RNG, n: number): string {
  if (n >= 2.3) return 'A diamond';
  if (n >= 1.9) return rng.pick(['A transparent crystal', 'A transparent material']);
  if (n >= 1.45) return rng.pick(['A glass block', 'A block of glass']);
  if (n >= 1.3) return rng.pick(['A transparent liquid', 'A transparent material']);
  return rng.pick(['A transparent material', 'A transparent block']);
}
const lower = (s: string): string => s.replace(/^A /, 'a ');
/** Half an angle, but only when it is still a whole number of degrees: 22.5 stands out in a list of angles. */
const halfDeg = (d: number): Exact | null => (d % 2 === 0 ? E(d / 2) : null);

// ------------------------------------------------------------------------------------------ level 1

/** [n, c/n]: indices a real transparent material has, and a mental-arithmetic speed. */
const INDEX_SPEED: [number, number][] = [[1.2, 2.5e8], [1.25, 2.4e8], [1.5, 2e8], [1.6, 1.875e8], [2, 1.5e8], [2.4, 1.25e8]];

function speedInMedium(rng: RNG): Generated | null {
  const [n, v] = rng.pick(INDEX_SPEED);
  const what = materialFor(rng, n);
  return pack(rng, {
    stem: rng.pick([
      `${what} has refractive index ${num(n)}. The speed of light in a vacuum is $${C_TEX}\\ \\text{m s}^{-1}$. Find the speed of light in the material.`,
      `${what} has a refractive index of ${num(n)}. Taking the speed of light in a vacuum as $${C_TEX}\\ \\text{m s}^{-1}$, find the speed of light inside it.`,
      `Light passes from a vacuum, where it travels at $${C_TEX}\\ \\text{m s}^{-1}$, into ${lower(what)} of refractive index ${num(n)}. Find the speed of the light in the material.`,
    ]),
    answer: X(v),
    unit: U_MS,
    format: 'sf',
    must: [
      { value: X(r12(C * n)), trap: 'multiplied by n instead of dividing: n = c/v' },
      { value: X(C), trap: 'assumed light travels at c in every material' },
    ],
    extra: [
      { value: X(r12(C / (2 * n))), trap: 'halved as well as dividing by n' },
      { value: X(r12((2 * C) / n)), trap: 'doubled the answer' },
      { value: X(r12(C / (n * n))), trap: 'divided by n twice' },
      { value: X(r12(C / (10 * n))), trap: 'slipped one power of ten' },
      { value: X(r12((10 * C) / n)), trap: 'slipped one power of ten the other way' },
      { value: X(r12(C * (n - 1))), trap: 'multiplied by n − 1' },
    ],
    solution: `$n = \\dfrac{c}{v}$, so $v = \\dfrac{c}{n} = \\dfrac{${C_TEX}}{${num(n)}} = ${X(v).toLatex({ format: 'sf' })}\\ \\text{m s}^{-1}$.`,
    trap: 'Light slows down in a medium: v = c/n, never cn.',
    tags: ['waves', 'refraction', 'refractive-index'],
    params: { variant: 'v-from-n', n },
  });
}

function indexFromSpeed(rng: RNG): Generated | null {
  const [n, v] = rng.pick(INDEX_SPEED);
  const what = materialFor(rng, n);
  const vTex = X(v).toLatex({ format: 'sf' });
  return pack(rng, {
    stem: rng.pick([
      `Light travels through ${lower(what)} at $${vTex}\\ \\text{m s}^{-1}$. The speed of light in a vacuum is $${C_TEX}\\ \\text{m s}^{-1}$. Find the refractive index of the material.`,
      `${what} slows light down to $${vTex}\\ \\text{m s}^{-1}$ from its vacuum speed of $${C_TEX}\\ \\text{m s}^{-1}$. Find the refractive index of the material.`,
      `The speed of light inside ${lower(what)} is $${vTex}\\ \\text{m s}^{-1}$, and in a vacuum it is $${C_TEX}\\ \\text{m s}^{-1}$. Find the refractive index of the material.`,
    ]),
    answer: X(n),
    must: [
      { value: X(r12(v / C)), trap: 'divided the wrong way round: n = c/v' },
      { value: X(r12(2 * n)), trap: 'doubled the ratio' },
    ],
    extra: [
      { value: X(r12(n / 2)), trap: 'halved the ratio' },
      { value: X(r12(n + 1)), trap: 'added one to the ratio' },
      { value: X(r12(n - 1)), trap: 'gave n − 1, the fractional change in speed' },
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
  const a = rng.pick([15, 20, 25, 30, 35, 40, 50, 55, 60, 65, 70, 75]);
  if (form === 'to-normal') {
    const ans = 90 - a;
    const stem = rng.pick([
      `A ray of light strikes a plane mirror. The angle between the incident ray and the surface of the mirror is ${DEG(a)}. Find the angle of reflection, measured from the normal, in degrees.`,
      `A narrow beam of light meets a plane mirror, making an angle of ${DEG(a)} with the mirror surface. Find the angle between the reflected beam and the normal, in degrees.`,
      `A ray of light is reflected by a plane mirror. The incident ray makes ${DEG(a)} with the mirror. Find the angle of reflection, in degrees.`,
    ]);
    return pack(rng, {
      stem,
      answer: E(ans),
      must: [
        { value: E(a), trap: 'gave the angle to the mirror, not the angle to the normal' },
        { value: E(2 * ans), trap: 'gave the angle between the incident and reflected rays' },
      ],
      extra: [
        { value: E(2 * a), trap: 'doubled the angle to the mirror' },
        { value: E(45), trap: 'assumed the ray strikes at 45°' },
        { value: E(90), trap: 'used the whole right angle' },
        { value: halfDeg(ans), trap: 'halved the angle' },
        { value: ans % 2 === 0 ? E(90 - ans / 2) : null, trap: 'halved the angle to the mirror and took the complement' },
      ],
      solution: `The normal is at ${DEG(90)} to the mirror, so the angle of incidence is $90^{\\circ} - ${a}^{\\circ} = ${ans}^{\\circ}$, and the angle of reflection equals it.`,
      trap: 'Angles of incidence and reflection are measured from the normal, not from the mirror.',
      tags: ['waves', 'reflection', 'angles'],
      params: { variant: 'reflect-to-normal', a },
    });
  }
  if (form === 'to-mirror') {
    const ans = 90 - a;
    const stem = rng.pick([
      `A ray of light strikes a plane mirror at an angle of incidence of ${DEG(a)}. Find the angle between the reflected ray and the surface of the mirror, in degrees.`,
      `A ray of light meets a plane mirror, making an angle of ${DEG(a)} with the normal. Find the angle between the reflected ray and the mirror itself, in degrees.`,
      `A narrow beam of light is reflected by a plane mirror. Its angle of incidence is ${DEG(a)}. Find the angle between the reflected beam and the mirror surface, in degrees.`,
    ]);
    return pack(rng, {
      stem,
      answer: E(ans),
      must: [
        { value: E(a), trap: 'gave the angle to the normal, not the angle to the mirror' },
        { value: E(2 * a), trap: 'gave the angle between the incident and reflected rays' },
      ],
      extra: [
        { value: E(2 * ans), trap: 'doubled the angle to the mirror' },
        { value: E(45), trap: 'assumed the ray strikes at 45°' },
        { value: E(90), trap: 'used the whole right angle' },
        { value: halfDeg(ans), trap: 'halved the angle' },
        { value: ans % 2 === 0 ? E(90 - ans / 2) : null, trap: 'halved the angle of incidence and took the complement' },
      ],
      solution: `The reflected ray leaves at ${DEG(a)} to the normal, and the normal is at ${DEG(90)} to the mirror, so the angle to the mirror is $90^{\\circ} - ${a}^{\\circ} = ${ans}^{\\circ}$.`,
      trap: 'Angles of incidence and reflection are measured from the normal, not from the mirror.',
      tags: ['waves', 'reflection', 'angles'],
      params: { variant: 'reflect-to-mirror', a },
    });
  }
  if (a > 60) return null;
  const ans = 2 * a;
  const stem = rng.pick([
    `A ray of light strikes a plane mirror at an angle of incidence of ${DEG(a)}. Find the angle between the incident ray and the reflected ray, in degrees.`,
    `A ray of light meets a plane mirror at ${DEG(a)} to the normal. Find the angle between the incident ray and the reflected ray, in degrees.`,
    `A narrow beam of light strikes a plane mirror, making an angle of ${DEG(90 - a)} with the mirror surface. Find the angle between the incident beam and the reflected beam, in degrees.`,
  ]);
  return pack(rng, {
    stem,
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

/** (angle in air, angle in the material) pairs whose sine ratio is an exact surd. */
const SNELL_PAIRS: [number, number][] = [[45, 30], [60, 30], [60, 45]];

function indexFromAngles(rng: RNG): Generated | null {
  const [i, rr] = rng.pick(SNELL_PAIRS);
  const fromMaterial = rng.bool(0.4);
  const n = exactSin(i).div(exactSin(rr));
  const tanI = exactTan(i), tanR = exactTan(rr);
  const stem = fromMaterial
    ? `A ray of light travelling inside a transparent material meets the boundary with air at an angle of incidence of ${DEG(rr)} and leaves the material at ${DEG(i)} to the normal. Find the refractive index of the material, giving your answer in exact form.`
    : rng.bool(0.5)
      ? `A ray of light passes from air into a transparent material. The angle of incidence is ${DEG(i)} and the angle of refraction is ${DEG(rr)}. Find the refractive index of the material, giving your answer in exact form.`
      : `A ray of light crosses from air into a transparent block. It meets the surface at ${DEG(i)} to the normal and travels on inside the block at ${DEG(rr)} to the normal. Find the refractive index of the block, giving your answer in exact form.`;
  return pack(rng, {
    stem,
    answer: n,
    format: 'fraction',
    must: [
      { value: exactSin(rr).div(exactSin(i)), trap: 'inverted the ratio: the sine of the angle in air goes on top' },
      { value: frac(i, rr), trap: 'used the angles themselves instead of their sines' },
    ],
    extra: [
      { value: frac(rr, i), trap: 'used the angles, and the wrong way round' },
      { value: tanI && tanR ? tanI.div(tanR) : null, trap: 'used tangents instead of sines' },
      { value: exactCos(i).div(exactCos(rr)), trap: 'used cosines instead of sines' },
      { value: surd(2), trap: 'quoted the 45°/30° value' },
      { value: surd(3), trap: 'quoted the 60°/30° value' },
      { value: surdFrac(1, 2, 6), trap: 'quoted the 60°/45° value' },
    ],
    solution: fromMaterial
      ? `The angle in air is ${DEG(i)} and the angle in the material is ${DEG(rr)}, so $n = \\dfrac{\\sin ${i}^{\\circ}}{\\sin ${rr}^{\\circ}} = \\dfrac{${exactSin(i).toLatex()}}{${exactSin(rr).toLatex()}} = ${n.toLatex({ format: 'fraction' })}$.`
      : `$n = \\dfrac{\\sin ${i}^{\\circ}}{\\sin ${rr}^{\\circ}} = \\dfrac{${exactSin(i).toLatex()}}{${exactSin(rr).toLatex()}} = ${n.toLatex({ format: 'fraction' })}$.`,
    trap: 'Snell\'s law uses the sines of the angles, and n is the sine of the angle in air over the sine of the angle in the material, whichever way the ray is going.',
    tags: ['waves', 'refraction', 'snell', 'surds'],
    params: { variant: 'n-from-angles', i, r: rr, fromMaterial },
  });
}

// ------------------------------------------------------------------------------------------ level 3

const N_TEX: Record<string, string> = { '1.414': '\\sqrt{2}', '1.732': '\\sqrt{3}', '1.225': '\\frac{\\sqrt{6}}{2}', '2': '2' };
const nTex = (n: number): string => N_TEX[String(Number(n.toPrecision(4)))] ?? num(n);

function refractionAngle(rng: RNG): Generated | null {
  const [i, rr] = rng.pick(SNELL_PAIRS);
  const n = sinD(i) / sinD(rr);
  const askAir = rng.bool(0.4);
  const ans = askAir ? i : rr;
  const given = askAir ? rr : i;
  const stem = askAir
    ? `A ray of light travelling inside a material of refractive index $${nTex(n)}$ meets the boundary with air at an angle of incidence of ${DEG(rr)}. Find the angle of refraction in the air, in degrees.`
    : rng.bool(0.5)
      ? `A ray of light passes from air into a material of refractive index $${nTex(n)}$. The angle of incidence is ${DEG(i)}. Find the angle of refraction, in degrees.`
      : `A ray of light in air strikes the flat surface of a block of refractive index $${nTex(n)}$ at ${DEG(i)} to the normal. Find the angle the ray makes with the normal inside the block, in degrees.`;
  return pack(rng, {
    stem,
    answer: E(ans),
    must: [
      { value: E(given), trap: 'assumed the ray is not bent at the boundary' },
      { value: E(90 - ans), trap: 'measured the refracted ray from the surface instead of from the normal' },
    ],
    extra: [
      { value: E(90), trap: askAir ? 'assumed the ray grazes along the surface' : 'used sin r = n sin i, which cannot be solved here' },
      { value: E(2 * ans), trap: 'doubled the angle' },
      { value: halfDeg(ans), trap: 'halved the angle' },
      { value: E(45), trap: 'guessed 45° without using the sines' },
      { value: E(15), trap: 'over-estimated the bending' },
      { value: E(90 - given), trap: 'measured the given angle from the surface instead of from the normal' },
    ],
    solution: askAir
      ? `Leaving the material the ray bends away from the normal: $\\sin r = n \\sin i = ${nTex(n)} \\times ${exactSin(rr).toLatex()} = ${exactSin(i).toLatex()}$, so $r = ${i}^{\\circ}$.`
      : `$\\sin r = \\dfrac{\\sin i}{n} = \\dfrac{${exactSin(i).toLatex()}}{${nTex(n)}} = ${exactSin(rr).toLatex()}$, so $r = ${rr}^{\\circ}$.`,
    trap: 'Entering a denser medium the ray bends towards the normal (divide by n); leaving it the ray bends away (multiply by n).',
    tags: ['waves', 'refraction', 'snell'],
    params: { variant: 'r-from-n-i', i, r: rr, askAir },
  });
}

/**
 * The only refractive indices whose critical angle is a round number of degrees: sin C = 1/n has to
 * land on 1/2, √2/2 or √3/2.
 */
const CRITICAL: [number, number, string][] = [
  [2, 30, '2'],
  [Math.SQRT2, 45, '\\sqrt{2}'],
  [2 / Math.sqrt(3), 60, '\\frac{2\\sqrt{3}}{3}'],
];

function criticalAngle(rng: RNG): Generated | null {
  const [n, Cdeg, tex] = rng.pick(CRITICAL);
  const other = rng.pick([30, 45, 60].filter((d) => d !== Cdeg));
  const stem = rng.pick([
    `${materialFor(rng, n)} has refractive index $${tex}$. Find the critical angle for a boundary between this material and air, in degrees.`,
    `Light travels inside a material of refractive index $${tex}$ and meets the boundary with air. Find the critical angle for that boundary, in degrees.`,
    `For ${lower(materialFor(rng, n))} of refractive index $${tex}$ in air, find the critical angle, in degrees.`,
  ]);
  return pack(rng, {
    stem,
    answer: E(Cdeg),
    must: [
      { value: E(90 - Cdeg), trap: 'took the complement: sin C = 1/n, not cos C = 1/n' },
      { value: E(other), trap: 'quoted the critical angle of the other standard refractive index' },
    ],
    extra: [
      { value: E(90), trap: 'used sin C = 1 (a ray grazing along the boundary) instead of sin C = 1/n' },
      { value: 2 * Cdeg < 90 ? E(2 * Cdeg) : null, trap: 'doubled the angle' },
      { value: E(Cdeg / 2), trap: 'halved the angle' },
      { value: E(15), trap: 'halved the smallest standard critical angle' },
      { value: E(Cdeg - 10), trap: 'arithmetic slip of ten degrees' },
      { value: E(Cdeg + 10), trap: 'arithmetic slip of ten degrees the other way' },
    ],
    solution: `$\\sin C = \\dfrac{1}{n} = \\dfrac{1}{${tex}}${n === 2 ? '' : ` = ${exactSin(Cdeg).toLatex()}`}$, so $C = ${Cdeg}^{\\circ}$.`,
    trap: 'sin C = 1/n gives the sine of the critical angle; the answer wanted is the angle itself, in degrees.',
    tags: ['waves', 'refraction', 'critical-angle'],
    params: { variant: 'critical-angle', n },
  });
}

/**
 * [n, p, q] with 1/n = p/q in lowest terms; every n is one a real material could have (water 1.33 …
 * diamond 2.42) and every q is a denominator the clean-number rule accepts. `tex` prints n when the
 * decimal does not: 4/3 for water, not 1.3333.
 */
const SIN_C: [number, number, number, string?][] = [
  [1.2, 5, 6], [1.25, 4, 5], [4 / 3, 3, 4, '\\frac{4}{3}'], [1.375, 8, 11], [1.4, 5, 7], [1.44, 25, 36],
  [1.5, 2, 3], [1.6, 5, 8], [1.68, 25, 42], [1.75, 4, 7], [1.8, 5, 9], [1.875, 8, 15],
  [2, 1, 2], [2.1, 10, 21], [2.2, 5, 11], [2.25, 4, 9], [2.4, 5, 12],
];

function sinCritical(rng: RNG): Generated | null {
  const [n, p, qd, tex] = rng.pick(SIN_C);
  const nTxt = tex ? `$${tex}$` : num(n);
  const stem = rng.bool(0.5)
    ? `${materialFor(rng, n)} has refractive index ${nTxt}. The critical angle for a boundary between this material and air is $C$. Find $\\sin C$, giving your answer as a fraction in its lowest terms.`
    : `Light inside ${lower(materialFor(rng, n))} of refractive index ${nTxt} meets the boundary with air. Find $\\sin C$ for this boundary, where $C$ is the critical angle, giving your answer as a fraction in its lowest terms.`;
  return pack(rng, {
    stem,
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
      { value: frac(p, qd - p), trap: 'used 1/(n − 1)' },
    ],
    solution: `$\\sin C = \\dfrac{1}{n} = \\dfrac{1}{${tex ?? num(n)}} = \\dfrac{${p}}{${qd}}$.`,
    trap: 'sin C = 1/n: the fraction is the reciprocal of the refractive index.',
    tags: ['waves', 'refraction', 'critical-angle', 'fractions'],
    params: { variant: 'sin-critical', n },
  });
}

// ------------------------------------------------------------------------------------------ level 4

/** [wavelength in air (nm), refractive index, the medium]: λ/n is always a whole number of nm. */
const MEDIA_LAMBDA: [number, number, string][] = [
  [450, 1.5, 'glass block'], [600, 1.5, 'glass block'], [750, 1.5, 'glass block'], [900, 1.5, 'glass block'],
  [480, 1.6, 'glass block'], [640, 1.6, 'glass block'], [800, 1.6, 'glass block'],
  [400, 2, 'transparent crystal'], [600, 2, 'transparent crystal'], [700, 2, 'transparent crystal'],
  [480, 2.4, 'diamond'], [600, 2.4, 'diamond'], [720, 2.4, 'diamond'],
];

function wavelengthInGlass(rng: RNG): Generated | null {
  const [lam, n, medium] = rng.pick(MEDIA_LAMBDA);
  const inside = r12(lam / n);
  if (!Number.isInteger(inside)) return null;
  // Both directions, so the answer is not always the small wavelength (and not always a low option).
  const into = rng.bool(0.6);
  const lamIn = into ? lam : inside;
  const ans = into ? inside : lam;
  const stem = into
    ? rng.bool(0.5)
      ? `Light of wavelength ${lam} nm in air enters a ${medium} of refractive index ${num(n)}. The frequency of the light does not change. Find the wavelength of the light inside the ${medium}.`
      : `A ray of light of wavelength ${lam} nm in air passes into a ${medium} of refractive index ${num(n)}. Given that the frequency is unchanged, find the wavelength of the light in the ${medium}.`
    : `Light inside a ${medium} of refractive index ${num(n)} has wavelength ${inside} nm. The light passes out into the air, and its frequency does not change. Find the wavelength of the light in the air.`;
  const must: Cand[] = into
    ? [
      { value: E(r12(lam * n)), trap: 'multiplied by n: the wavelength inside is λ/n' },
      rng.bool(0.5)
        ? { value: E(lam), trap: 'assumed the wavelength does not change' }
        : { value: E(r12(lam / (2 * n))), trap: 'halved as well as dividing by n' },
    ]
    : [
      { value: E(r12(inside / n)), trap: 'divided by n: leaving the medium the wavelength increases' },
      { value: E(inside), trap: 'assumed the wavelength does not change' },
    ];
  const extra: Cand[] = into
    ? [
      { value: E(lam), trap: 'assumed the wavelength does not change' },
      { value: E(r12(lam / (2 * n))), trap: 'halved as well as dividing by n' },
      { value: E(r12(lam - lam / n)), trap: 'gave the decrease in wavelength, not the wavelength inside' },
      { value: E(r12(lam / 2)), trap: 'halved the wavelength instead of dividing by n' },
      { value: E(r12((2 * lam) / n)), trap: 'doubled the answer' },
      { value: E(r12(lam / (n * n))), trap: 'divided by n twice' },
      { value: E(r12(lam / (n + 1))), trap: 'divided by n + 1' },
      { value: E(r12(lam - 100)), trap: 'subtracted a round number instead of dividing' },
    ]
    : [
      { value: E(r12(inside * n * n)), trap: 'multiplied by n twice' },
      { value: E(r12(2 * inside)), trap: 'doubled the wavelength instead of multiplying by n' },
      { value: E(r12(lam - inside)), trap: 'gave the increase in wavelength, not the wavelength in air' },
      { value: E(r12(lam / 2)), trap: 'halved the answer' },
      { value: E(r12(2 * lam)), trap: 'doubled the answer' },
      { value: E(r12(inside * (n + 1))), trap: 'multiplied by n + 1' },
      { value: E(r12(inside + 100)), trap: 'added a round number instead of multiplying' },
    ];
  return pack(rng, {
    stem,
    answer: E(ans),
    unit: U_NM,
    must,
    extra,
    solution: into
      ? `The frequency is unchanged and $v = c/n$, so the wavelength divides by $n$: $\\lambda_{\\text{inside}} = \\dfrac{${lam}}{${num(n)}} = ${inside}\\ \\text{nm}$.`
      : `The frequency is unchanged and the speed rises by a factor $n$ on leaving, so the wavelength does too: $\\lambda_{\\text{air}} = ${inside} \\times ${num(n)} = ${lam}\\ \\text{nm}$.`,
    trap: 'Entering a denser medium the speed and the wavelength both fall by a factor n, and both rise again on leaving; the frequency is fixed by the source.',
    tags: ['waves', 'refraction', 'wavelength'],
    params: { variant: 'lambda-in-glass', lamIn, n, into },
  });
}

function changeChoice(rng: RNG): Generated | null {
  const [lam, n, medium] = rng.pick(MEDIA_LAMBDA);
  const short = r12(lam / n);
  if (!Number.isInteger(short)) return null;
  const into = rng.bool(0.5);
  const lamIn = into ? lam : short;   // the wavelength quoted in the stem
  const lamOut = into ? short : lam;  // the wavelength after the boundary
  const word = into ? 'decreases' : 'increases';
  const verb = into ? 'fall' : 'rise';
  const dir = into
    ? `from air into a ${medium} of refractive index ${num(n)}`
    : `from inside a ${medium} of refractive index ${num(n)} out into the air`;
  const correct = `The frequency is unchanged and the wavelength ${word} to ${lamOut} nm.`;
  const swapped = into ? r12(lam * n) : r12(short / n);
  // a fifth numeric option: too small the wrong way going in, too big the wrong way coming out
  const extraWrong = into ? r12(short / 2) : r12(short * n * n);
  const wrong: { display: string; trap: string }[] = [];
  if (Number.isInteger(swapped)) {
    wrong.push({ display: `The frequency is unchanged and the wavelength ${into ? 'increases' : 'decreases'} to ${swapped} nm.`, trap: into ? 'multiplied the wavelength by n instead of dividing' : 'divided by n instead of multiplying' });
  }
  wrong.push(
    { display: `The frequency is unchanged and the wavelength stays at ${lamIn} nm.`, trap: 'forgot that the speed, and so the wavelength, changes at the boundary' },
    { display: `The wavelength stays at ${lamIn} nm and the frequency ${word} by a factor of ${num(n)}.`, trap: 'changed the frequency instead of the wavelength' },
    { display: `Both the frequency and the wavelength ${verb} by a factor of ${num(n)}.`, trap: 'changed the frequency as well as the wavelength' },
    { display: `The frequency is unchanged and the wavelength ${word} to ${num(extraWrong)} nm.`, trap: into ? 'halved the wavelength as well as dividing by n' : 'multiplied by n twice' },
    { display: `The speed of the light is unchanged and the wavelength ${word} to ${lamOut} nm.`, trap: 'kept the speed fixed instead of the frequency' },
  );
  return {
    stem: `A ray of light of wavelength ${lamIn} nm passes ${dir}. The speed of light in air is $${C_TEX}\\ \\text{m s}^{-1}$. Which of the following describes the light after it has crossed the boundary?`,
    answer: { kind: 'choice', value: correct },
    options: buildChoiceOptions(rng, correct, wrong),
    solution: `The frequency is set by the source and never changes at a boundary. The speed ${word} by a factor of ${num(n)}, and with $f$ fixed in $v = f\\lambda$ the wavelength ${word} in the same ratio: $${lamIn} ${into ? '\\div' : '\\times'} ${num(n)} = ${lamOut}$ nm.`,
    trap: 'At a boundary the frequency is fixed; the speed and the wavelength change together, in the ratio of the refractive indices.',
    tags: ['waves', 'refraction', 'statements', 'wavelength'],
    params: { variant: 'change-choice', into, n, lamIn },
    typedAllowed: false,
  };
}

// ------------------------------------------------------------------------------------------ level 5

const BLOCK_PAIRS: [number, number][] = [
  [30, 20], [40, 25], [45, 30], [50, 30], [60, 35], [60, 40], [70, 40], [55, 35],
  [25, 15], [35, 25], [50, 35], [65, 40], [75, 45], [80, 45], [65, 35], [45, 25],
];

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
      { value: halfDeg(i), trap: 'halved the angle of incidence' },
      { value: E(i + rr), trap: 'added the two angles' },
      { value: E(i - 2 * rr > 0 ? i - 2 * rr : 5), trap: 'deviated the ray twice, instead of undoing the first deviation' },
    ],
    solution: `The two faces are parallel, so the ray refracts by the same amount on the way out as on the way in: it emerges at ${DEG(i)}, parallel to the original ray.`,
    trap: 'A parallel-sided block shifts the ray sideways but does not change its direction.',
    tags: ['waves', 'refraction', 'blocks'],
    params: { variant: 'parallel-block', i, r: rr },
  });
}

const TIR_TEXT = 'The ray is totally internally reflected at the boundary.';
const UNDEVIATED = 'The ray passes out of the material without changing direction.';
const ABSORBED = 'The light is absorbed at the boundary and does not continue.';
const BENDS_IN = 'The ray refracts out of the material into the air, bending towards the normal.';

/**
 * A boundary the ray meets from inside the material.
 *  `out`     the angle it refracts out at, or null when it is totally internally reflected;
 *  `Cdeg`    the critical angle, quoted only when it is a round number of degrees;
 *  `invSq`   1/n² as an exact fraction — with n = √3 the critical angle is 35.3°, so that case is
 *            settled by comparing sin² i with 1/n², never by printing an approximate angle.
 */
interface TirCase { n: number; i: number; out: number | null; tex: string; Cdeg: number | null; invSq: string }

const TIR_CASES: TirCase[] = [
  { n: 2, i: 40, out: null, tex: '2', Cdeg: 30, invSq: '\\frac{1}{4}' },
  { n: 2, i: 45, out: null, tex: '2', Cdeg: 30, invSq: '\\frac{1}{4}' },
  { n: 2, i: 50, out: null, tex: '2', Cdeg: 30, invSq: '\\frac{1}{4}' },
  { n: 2, i: 60, out: null, tex: '2', Cdeg: 30, invSq: '\\frac{1}{4}' },
  { n: 2, i: 70, out: null, tex: '2', Cdeg: 30, invSq: '\\frac{1}{4}' },
  { n: Math.SQRT2, i: 50, out: null, tex: '\\sqrt{2}', Cdeg: 45, invSq: '\\frac{1}{2}' },
  { n: Math.SQRT2, i: 60, out: null, tex: '\\sqrt{2}', Cdeg: 45, invSq: '\\frac{1}{2}' },
  { n: Math.SQRT2, i: 70, out: null, tex: '\\sqrt{2}', Cdeg: 45, invSq: '\\frac{1}{2}' },
  { n: Math.sqrt(3), i: 45, out: null, tex: '\\sqrt{3}', Cdeg: null, invSq: '\\frac{1}{3}' },
  { n: Math.sqrt(3), i: 60, out: null, tex: '\\sqrt{3}', Cdeg: null, invSq: '\\frac{1}{3}' },
];

/**
 * The ray gets out. Only indices and angles whose sines are exact appear, so the emergent angle is a
 * whole number of degrees. There are fewer of these than of the TIR cases, so the two lists are drawn
 * from with equal probability: a candidate who answers "totally internally reflected" every time and
 * never compares i with C must not beat the 1-in-5 a guess deserves by much.
 */
const REFRACT_CASES: TirCase[] = [
  { n: Math.SQRT2, i: 30, out: 45, tex: '\\sqrt{2}', Cdeg: 45, invSq: '\\frac{1}{2}' },
  { n: Math.sqrt(3), i: 30, out: 60, tex: '\\sqrt{3}', Cdeg: null, invSq: '\\frac{1}{3}' },
  { n: Math.sqrt(6) / 2, i: 45, out: 60, tex: '\\frac{\\sqrt{6}}{2}', Cdeg: null, invSq: '\\frac{2}{3}' },
];

function tirChoice(rng: RNG): Generated | null {
  const { n, i, out, tex, Cdeg, invSq } = rng.pick(rng.bool(0.5) ? TIR_CASES : REFRACT_CASES);
  const refr = (d: number) => `The ray refracts out of the material into the air at ${DEG(d)} to the normal.`;
  const correct = out === null ? TIR_TEXT : refr(out);
  const wrong: { display: string; trap: string; key?: string }[] = [];
  /** An angle offered as the emergent angle; `undeviated` ones share a key so only one can appear. */
  const addRefr = (d: number, trap: string) => {
    if (d === out || d <= 0 || d >= 90) return;
    wrong.push({ display: refr(d), trap, key: d === i ? 'undeviated' : undefined });
  };
  addRefr(i, 'assumed the ray crosses the boundary undeviated');
  addRefr(90 - i, 'measured the angle of incidence from the surface instead of from the normal');
  if (Cdeg !== null) addRefr(Cdeg, 'quoted the critical angle as the angle of refraction');
  if (out !== null) addRefr(90 - out, 'measured the emerging ray from the surface instead of from the normal');
  if (out !== null) wrong.push({ display: TIR_TEXT, trap: 'thought any ray meeting the boundary from inside is totally internally reflected' });
  wrong.push({ display: UNDEVIATED, trap: 'forgot that a ray changes direction at a boundary between two media', key: 'undeviated' });
  wrong.push({
    display: `The ray refracts out of the material along the boundary, at ${DEG(90)} to the normal.`,
    trap: 'a ray emerges along the boundary only at exactly the critical angle',
  });
  if (90 - i !== i) {
    wrong.push({
      display: `The ray is totally internally reflected, leaving the boundary at ${DEG(90 - i)} to the normal.`,
      trap: 'a reflected ray makes the angle of incidence with the normal, not with the surface',
    });
  }
  wrong.push({ display: BENDS_IN, trap: 'leaving a denser medium the ray bends away from the normal, not towards it' });
  wrong.push({ display: ABSORBED, trap: 'at a boundary light is reflected or refracted, not absorbed' });
  // The critical angle is only ever quoted when it is a round number of degrees; otherwise the
  // comparison is made exactly, between sin^2 i and 1/n^2 (arcsin(1/√3) = 35.3° is not a quotable angle).
  const sinI = out !== null || Cdeg === null ? exactSin(i) : null;
  const compare = Cdeg !== null
    ? `$\\sin C = \\dfrac{1}{${tex}}$, so $C = ${Cdeg}^{\\circ}$, and ${DEG(i)} is ${out === null ? 'greater' : 'less'} than $C$`
    : `$\\sin^2 C = \\dfrac{1}{n^{2}} = ${invSq}$ and $\\sin^2 ${i}^{\\circ} = ${sinI!.mul(sinI!).toLatex({ format: 'fraction' })}$, so $\\sin i$ is ${out === null ? 'greater' : 'less'} than $\\sin C$`;
  return {
    stem: rng.pick([
      `A ray of light travelling inside a material of refractive index $${tex}$ meets the boundary with air at an angle of incidence of ${DEG(i)} to the normal. Which of the following describes what happens to the ray?`,
      `Light inside a block of refractive index $${tex}$ strikes the flat boundary with the air at ${DEG(i)} to the normal. Which of the following describes what happens to the light?`,
      `A ray travelling inside a transparent material of refractive index $${tex}$ reaches its surface, making ${DEG(i)} with the normal. Beyond the surface is air. Which of the following describes what happens next?`,
    ]),
    answer: { kind: 'choice', value: correct },
    options: buildChoiceOptions(rng, correct, wrong),
    solution: out === null
      ? `${compare}, so the ray is totally internally reflected.`
      : `${compare}, so the ray refracts out. Leaving the material it bends away from the normal: $\\sin r = n \\sin i = ${tex} \\times ${sinI!.toLatex()} = ${exactSin(out).toLatex()}$, giving $r = ${out}^{\\circ}$.`,
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
        { value: E(r12((3 * d) / 2)), trap: 'added half the object distance instead of doubling' },
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
    // Independent checks: floating-point Snell's law, n = c/v, and — for the mirrors and the law of
    // reflection — plane geometry done with vectors rather than the generator's arithmetic.
    const p = q.params as Record<string, number> & { variant: string; into?: boolean; askAir?: boolean; out?: number | null };
    const close = (x: number, y: number) => Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(y));
    const exact = q.answer.kind === 'exact' ? q.answer.value.toNumber() : NaN;
    const rad = (d: number) => (d * Math.PI) / 180;
    /** Angle in degrees between two plane vectors. */
    const between = (u: [number, number], v: [number, number]) =>
      (Math.acos((u[0] * v[0] + u[1] * v[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]))) * 180) / Math.PI;
    /** Reflect a direction in a mirror lying along the x-axis. */
    const bounce = (u: [number, number]): [number, number] => [u[0], -u[1]];
    switch (p.variant) {
      case 'v-from-n': return close(exact * p.n, C);
      case 'n-from-v': return close(exact * p.v, C);
      case 'reflect-to-normal': {
        // the incident ray makes p.a with the mirror; reflect it and measure against the normal
        const out = bounce([Math.cos(rad(p.a)), -Math.sin(rad(p.a))]);
        return close(exact, between(out, [0, 1]));
      }
      case 'reflect-to-mirror': {
        // the incident ray makes p.a with the normal; reflect it and measure against the mirror
        const out = bounce([Math.sin(rad(p.a)), -Math.cos(rad(p.a))]);
        return close(exact, between(out, [1, 0]));
      }
      case 'reflect-between': {
        const inc: [number, number] = [Math.sin(rad(p.a)), -Math.cos(rad(p.a))];
        const out = bounce(inc);
        return close(exact, between([-inc[0], -inc[1]], out));
      }
      case 'n-from-angles': return close(exact * sinD(p.r), sinD(p.i)) && exact > 1;
      case 'r-from-n-i': {
        const n = sinD(p.i) / sinD(p.r);
        const air = p.askAir ? exact : p.i;
        const mat = p.askAir ? p.r : exact;
        return n > 1 && air > mat && close(n * sinD(mat), sinD(air));
      }
      case 'critical-angle': return close(p.n * sinD(exact), 1);
      case 'sin-critical': return close(exact * p.n, 1);
      case 'lambda-in-glass': {
        // the frequency is the same on both sides of the boundary: f = v/λ must agree
        const lamInside = (p.into ? exact : p.lamIn) * 1e-9;
        const lamAir = (p.into ? p.lamIn : exact) * 1e-9;
        return lamAir > lamInside && close((C / p.n) / lamInside, C / lamAir);
      }
      case 'parallel-block': {
        // Snell at the entry face fixes n; the exit face must send the ray back out at the answer
        const n = sinD(p.i) / sinD(p.r);
        return n > 1 && close(n * sinD(p.r), sinD(exact)) && exact > p.r;
      }
      case 'mirror-separation': {
        // the mirror is the line x = 0; the image is the object reflected in it
        const object = -p.d;
        const image = -object;
        return close(exact, Math.abs(image - object));
      }
      case 'mirror-walk': {
        const before = Math.abs(p.d - -p.d);
        const after = Math.abs(p.d - p.x - -(p.d - p.x));
        return close(exact, before - after);
      }
      case 'change-choice': {
        if (q.answer.kind !== 'choice') return false;
        // λ = v/f with f fixed: get f from the first medium, then the wavelength in the second
        const vBefore = p.into ? C : C / p.n;
        const vAfter = p.into ? C / p.n : C;
        const f = vBefore / (p.lamIn * 1e-9);
        const lamAfter = Number(((vAfter / f) * 1e9).toPrecision(12));
        const word = lamAfter < p.lamIn ? 'decreases' : 'increases';
        return q.answer.value === `The frequency is unchanged and the wavelength ${word} to ${num(lamAfter)} nm.`;
      }
      case 'tir-choice': {
        if (q.answer.kind !== 'choice') return false;
        const s = p.n * sinD(p.i);
        if (s > 1) return q.answer.value === TIR_TEXT;
        const outDeg = (Math.asin(s) * 180) / Math.PI;
        const m = /at \$(\d+(?:\.\d+)?)\^/.exec(q.answer.value);
        return m !== null && Math.abs(outDeg - Number(m[1])) < 1e-6;
      }
      default: return false;
    }
  },
});
