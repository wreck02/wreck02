import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import type { RNG } from '../../core/rng';

/**
 * Similar shapes and scale factors.
 * Level 1: missing length in similar triangles, integer scale factor
 * Level 2: area scale factor k² (×3 → ×9)
 * Level 3: volume scale factor k³, and back from volumes 27 : 64 to lengths 3 : 4
 * Level 4: from areas to a length or to a volume (areas 4 : 9 → volumes 8 : 27)
 * Level 5: a cone cut parallel to its base (small cone : frustum = 1 : 7), and masses of
 *          similar solids with a non-integer scale factor or a mass ratio to cube-root
 */

interface Cand {
  value: Exact | null;
  trap: string;
  must?: boolean;
}

function clean(x: Exact): boolean {
  return Number.isFinite(x.toNumber()) && isCleanExact(x).ok;
}

/**
 * Every quantity this template asks for — a length, an area, a volume, a mass, a ratio of
 * volumes — is positive, so a negative option is eliminated on sight and wastes a slot.
 *
 * Keep the candidates that exist, are clean, are strictly positive and are distinct, preferring
 * those of the same order of size as the answer; if that leaves too few, relax the size filter
 * rather than run short. Two further rules:
 *
 *  - **whole answers take whole options.** Every question here except the frustum-fraction one
 *    has an integer answer by construction, so an option like 648/49 cm² is crossed out on sight
 *    and the candidate is really choosing between four. Such candidates are dropped.
 *  - **the answer's place in the sorted list is randomised.** With the ratio traps clustered
 *    around the answer it otherwise lands in the middle, and "pick the middle option" beats
 *    guessing.
 *
 * Returning null makes the caller draw new parameters, so buildOptions is never left to pad the
 * list with unlabelled generic perturbations (which is where negative masses and negative areas
 * came from).
 */
function usable(rng: RNG, answer: Exact, cands: Cand[], maxFactor = 12, need = 4): Distractor[] | null {
  const seen: Exact[] = [answer];
  const a = answer.toNumber();
  const wholeAnswer = answer.isInteger();
  const collect = (factor: number): Distractor[] => {
    const out: Distractor[] = [];
    for (const c of cands) {
      const v = c.value;
      if (v === null || !clean(v) || v.toNumber() <= 0) continue;
      if (wholeAnswer && !v.isInteger()) continue;
      if (seen.some((s) => s.equals(v))) continue;
      if (a > 0 && Number.isFinite(factor)) {
        const x = Math.abs(v.toNumber());
        if (x > factor * a || factor * x < a) continue;
      }
      seen.push(v);
      out.push({ value: v, trap: c.trap, must: c.must });
    }
    return out;
  };
  const pool = collect(maxFactor);
  if (pool.length < need) {
    // top up with the *nearest* of the candidates outside the window, never the wildest: an
    // option 600 times the answer is crossed out on sight and the question loses a slot
    const extra = collect(Infinity).sort((x, y) => Math.abs(Math.log(x.value.toNumber() / a)) - Math.abs(Math.log(y.value.toNumber() / a)));
    pool.push(...extra.slice(0, need - pool.length));
  }
  if (pool.length < need) return null;
  return balance(rng, a, pool, need);
}

/** Pick `need` of the candidates so that the answer's rank among the five options varies. */
function balance(rng: RNG, a: number, pool: Distractor[], need: number): Distractor[] {
  const order = (arr: Distractor[]) => [...arr.filter((d) => d.must), ...rng.shuffle(arr.filter((d) => !d.must))];
  const hi = order(pool.filter((d) => d.value.toNumber() > a));
  const lo = order(pool.filter((d) => d.value.toNumber() < a));
  if (hi.length + lo.length < need) return pool.slice(0, need);
  let jMin = Math.max(0, need - lo.length);
  let jMax = Math.min(hi.length, need);
  // a headline trap must survive the balancing: leave its side at least one slot
  if (hi.some((d) => d.must)) jMin = Math.max(jMin, 1);
  if (lo.some((d) => d.must)) jMax = Math.min(jMax, need - 1);
  if (jMin > jMax) { jMin = Math.max(0, need - lo.length); jMax = Math.min(hi.length, need); }
  const j = rng.int(jMin, jMax);
  return [...hi.slice(0, j), ...lo.slice(0, need - j)];
}

/** "\\frac{9}{4}", or just "9" when the denominator is 1, so a solution never reads "8/1". */
function over(num: number, den: number): string {
  return den === 1 ? `${num}` : `\\frac{${num}}{${den}}`;
}

/** "(3/2)^{3}", or just "3^{3}" when the denominator is 1. */
function powOver(num: number, den: number, k: number): string {
  return den === 1 ? `${num}^{${k}}` : `\\left(\\frac{${num}}{${den}}\\right)^{${k}}`;
}

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

/** The two sides of a triangle that the stem prints (AB and BC). */
const SIDE_PAIRS: [number, number][] = [[3, 4], [4, 5], [5, 6], [2, 3], [6, 7], [3, 5], [4, 6], [5, 7], [3, 7], [5, 5], [4, 7], [2, 5]];

/** Coprime length ratios used for the scale-factor questions. */
const RATIOS: [number, number][] = [[1, 2], [1, 3], [1, 4], [1, 5], [2, 3], [2, 5], [3, 4], [3, 5], [4, 5], [2, 7], [3, 7]];

// ----------------------------------------------------------------------------- level 1

function similarTriangleQ(rng: RNG): Generated | null {
  const [a, b] = rng.pick(SIDE_PAIRS);
  const k = rng.int(2, 5);
  const bigFirst = rng.bool(0.35);
  const answer = bigFirst ? E(b) : E(k * b);
  if (!clean(answer)) return null;
  const knownSmall = a, knownBig = k * a, bigSide = k * b;
  // Every distractor below is built only from the three lengths the stem prints.
  const distractors = usable(rng, answer, bigFirst
    ? [
        { value: E(bigSide), trap: 'multiplied by the scale factor instead of dividing', must: true },
        { value: E(bigSide - (knownBig - knownSmall)), trap: 'subtracted the difference of the known sides instead of dividing' },
        { value: E(k * bigSide), trap: 'set the proportion up upside down: PQ × QR ÷ AB' },
        { value: E(bigSide - knownBig), trap: 'subtracted the corresponding side of the larger triangle' },
        { value: frac(bigSide, k + 1), trap: 'divided by the wrong number' },
        { value: frac(bigSide, k * k), trap: 'divided by the area scale factor k² instead of k' },
        { value: E(bigSide - knownSmall), trap: 'subtracted a known side instead of dividing' },
        { value: frac(bigSide, 2), trap: 'halved instead of dividing by the scale factor' },
      ]
    : [
        { value: E(b + (knownBig - knownSmall)), trap: 'added the difference of the known sides instead of multiplying', must: true },
        { value: frac(b, k), trap: 'divided by the scale factor instead of multiplying' },
        { value: E(k * k * b), trap: 'used the area scale factor k² on a length' },
        { value: frac(knownBig * knownSmall, b), trap: 'set the proportion up upside down: AB × PQ ÷ BC' },
        { value: E(b * k + k), trap: 'slip of one scale factor' },
        { value: E(b + k), trap: 'added the scale factor' },
        { value: E(b + knownBig), trap: 'added the known side of the larger triangle' },
      ]);
  if (!distractors) return null;
  const stem = bigFirst
    ? `Triangle $ABC$ is similar to triangle $PQR$, with $AB$ corresponding to $PQ$ and $BC$ to $QR$.\n\n$AB = ${knownSmall}$ cm, $PQ = ${knownBig}$ cm and $QR = ${bigSide}$ cm. Find $BC$.`
    : `Triangle $ABC$ is similar to triangle $PQR$, with $AB$ corresponding to $PQ$ and $BC$ to $QR$.\n\n$AB = ${knownSmall}$ cm, $BC = ${b}$ cm and $PQ = ${knownBig}$ cm. Find $QR$.`;
  return {
    stem,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `The scale factor is $\\frac{${knownBig}}{${knownSmall}} = ${k}$, so ${bigFirst ? `$BC = ${bigSide} \\div ${k} = ${b}$` : `$QR = ${b} \\times ${k} = ${k * b}$`}.`,
    trap: 'Similar shapes multiply: use the scale factor, never the difference between the known sides.',
    tags: ['similar-shapes', 'scale-factor', 'length'],
    params: { variant: 'length', a, b, k, bigFirst },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 2

function areaSfQ(rng: RNG): Generated | null {
  const [p, q] = rng.pick(RATIOS);
  const up = rng.bool(0.6);
  const base = rng.int(2, 12);
  const smallArea = base * p * p, bigArea = base * q * q;
  const given = up ? smallArea : bigArea;
  const answer = E(up ? bigArea : smallArea);
  if (!clean(answer) || given > 900 || answer.toNumber() > 900) return null;
  const distractors = usable(rng, answer, [
    { value: up ? frac(given * q, p) : frac(given * p, q), trap: 'used the length scale factor instead of its square', must: true },
    { value: up ? frac(given * q * q * q, p * p * p) : frac(given * p * p * p, q * q * q), trap: 'used the volume scale factor k³' },
    { value: up ? frac(given * p * p, q * q) : frac(given * q * q, p * p), trap: 'used the ratio upside down' },
    { value: E(given + (q * q - p * p)), trap: 'added the difference instead of multiplying' },
    { value: E(given * (up ? q * q : p * p)), trap: up ? 'multiplied by q² but forgot to divide by p²' : 'multiplied by p² but forgot to divide by q²' },
    { value: frac(given, up ? p * p : q * q), trap: up ? 'divided by p² but forgot to multiply by q²' : 'divided by q² but forgot to multiply by p²' },
    { value: up ? frac(given * (q * q - p * p), p * p) : frac(given * (q * q - p * p), q * q), trap: 'gave the change in area, not the new area' },
    { value: up ? frac(given * q * q, p * p * 2) : frac(given * p * p * 2, q * q), trap: 'lost a factor of 2 while scaling' },
    { value: up ? frac(given * q * q * 2, p * p) : frac(given * p * p, q * q * 2), trap: 'doubled the scaled area' },
    { value: up ? frac(given * q * q, p) : frac(given * p * p, q), trap: 'squared the top of the ratio but not the bottom' },
    { value: up ? frac(given * q ** 4, p ** 4) : frac(given * p ** 4, q ** 4), trap: 'raised the ratio to the fourth power' },
  ]);
  if (!distractors) return null;
  return {
    stem: `Two similar shapes have corresponding lengths in the ratio $${p} : ${q}$. The ${up ? 'smaller' : 'larger'} shape has area $${given}\\ \\text{cm}^{2}$.\n\nFind the area of the ${up ? 'larger' : 'smaller'} shape, in $\\text{cm}^{2}$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `Areas scale by $${powOver(q, p, 2)} = ${over(q * q, p * p)}$, so the area is $${given} \\times ${over(up ? q * q : p * p, up ? p * p : q * q)} = ${answer.toLatex()}$.`,
    trap: 'Areas scale by k², not by k.',
    tags: ['similar-shapes', 'scale-factor', 'area'],
    params: { variant: 'area', p, q, given, up },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 3

function volumeSfQ(rng: RNG): Generated | null {
  const [p, q] = rng.pick(RATIOS.filter(([, y]) => y <= 5));
  const base = rng.int(1, 6);
  const smallV = base * p * p * p, bigV = base * q * q * q;
  const up = rng.bool(0.6);
  const given = up ? smallV : bigV;
  const answer = E(up ? bigV : smallV);
  if (!clean(answer) || given > 2000 || answer.toNumber() > 2000) return null;
  const distractors = usable(rng, answer, [
    { value: up ? frac(given * q * q, p * p) : frac(given * p * p, q * q), trap: 'used the area scale factor k² for a volume', must: true },
    { value: up ? frac(given * q, p) : frac(given * p, q), trap: 'used the length scale factor k' },
    { value: up ? frac(given * p * p * p, q * q * q) : frac(given * q * q * q, p * p * p), trap: 'used the ratio upside down' },
    { value: E(given + (q * q * q - p * p * p)), trap: 'added the difference instead of multiplying' },
    { value: up ? E(given * 3 * q) : frac(given, 3 * q), trap: 'multiplied by 3k instead of cubing' },
    { value: up ? frac(given * (q ** 3 - p ** 3), p ** 3) : frac(given * (q ** 3 - p ** 3), q ** 3), trap: 'gave the change in volume, not the new volume' },
    { value: E(given * (up ? 2 : 1) * (up ? 1 : 2)), trap: 'doubled the volume given instead of scaling it' },
    { value: up ? frac(given * q * q * q, p * p * p * 2) : frac(given * p * p * p * 2, q * q * q), trap: 'lost a factor of 2 while scaling' },
    { value: up ? frac(given * q ** 3, p ** 2) : frac(given * p ** 3, q ** 2), trap: 'cubed the top of the ratio but squared the bottom' },
    { value: up ? frac(given * q ** 4, p ** 4) : frac(given * p ** 4, q ** 4), trap: 'raised the ratio to the fourth power' },
  ]);
  if (!distractors) return null;
  return {
    stem: `Two similar solids have corresponding lengths in the ratio $${p} : ${q}$. The ${up ? 'smaller' : 'larger'} solid has volume $${given}\\ \\text{cm}^{3}$.\n\nFind the volume of the ${up ? 'larger' : 'smaller'} solid, in $\\text{cm}^{3}$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `Volumes scale by $${powOver(q, p, 3)} = ${over(q ** 3, p ** 3)}$, so the volume is $${given} \\times ${over(up ? q ** 3 : p ** 3, up ? p ** 3 : q ** 3)} = ${answer.toLatex()}$.`,
    trap: 'Volumes scale by k³ — cube the length ratio, do not square it.',
    tags: ['similar-shapes', 'scale-factor', 'volume'],
    params: { variant: 'volume', p, q, given, up },
    typedAllowed: true,
  };
}

/**
 * Volumes 192 : 648 → lengths 2 : 3.
 *
 * Each solid's volume is `m` times the cube of its own height, with m between 2 and 6, so the
 * pair of numbers the stem prints belongs to a solid that could really be that tall (a 4 cm
 * solid of volume 1 cm³ could not) and cube-rooting the larger volume alone does not shortcut
 * the ratio.
 */
function volumeToLengthQ(rng: RNG): Generated | null {
  const [p, q] = rng.pick(RATIOS.filter(([, y]) => y <= 5));
  const t = rng.int(2, 6);
  const h = p * t;            // height of the smaller solid, in cm
  const hBig = q * t;         // the answer
  if (hBig > 12) return null; // keeps the printed volumes to a few thousand cm³
  const mMax = Math.min(6, Math.floor(4000 / hBig ** 3));
  if (mMax < 2) return null;
  const m = rng.int(2, mMax);
  const smallV = m * h ** 3, bigV = m * hBig ** 3;
  const answer = E(hBig);
  if (!clean(answer)) return null;
  const distractors = usable(rng, answer, [
    { value: frac(h * q * q * q, p * p * p), trap: 'used the volume ratio as the length ratio', must: true },
    { value: frac(h * q * q, p * p), trap: 'used the area ratio for the length' },
    { value: frac(h * p, q), trap: 'used the ratio upside down' },
    { value: E(h + (q - p)), trap: 'added the difference of the ratio parts instead of multiplying' },
    { value: E(t * (q + 1)), trap: 'slip when taking the cube root' },
    { value: E(t * (q - 1)), trap: 'slip the other way when taking the cube root' },
    { value: E(h * q), trap: 'multiplied by the larger part of the ratio but did not divide by the smaller' },
    { value: E(h + q), trap: 'added instead of scaling' },
    { value: E(h + (bigV - smallV)), trap: 'added the difference of the volumes' },
    { value: frac(h * q, p * p), trap: 'divided by p² instead of p' },
  ]);
  if (!distractors) return null;
  return {
    stem: `Two similar solids have volumes $${smallV}\\ \\text{cm}^{3}$ and $${bigV}\\ \\text{cm}^{3}$. The smaller solid has height $${h}$ cm.\n\nFind the height of the larger solid, in cm.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `$\\frac{${bigV}}{${smallV}} = ${over(q ** 3, p ** 3)}$, so the lengths are in the ratio $${p} : ${q}$ and the height is $${h} \\times ${over(q, p)} = ${hBig}$ cm.`,
    trap: 'Cube-root the volume ratio to get the length ratio before scaling a height.',
    tags: ['similar-shapes', 'scale-factor', 'volume'],
    params: { variant: 'volume-to-length', p, q, h, smallV, bigV },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 4

/**
 * Surface area and volume of a real solid whose edges are 1 unit long, so the pair of numbers
 * the stem prints belongs to a solid that can actually exist: [6, 1] is a cube, [10, 2] a
 * 1 × 1 × 2 cuboid, [16, 4] a 1 × 2 × 2, [22, 6] a 1 × 2 × 3, [24, 8] a 2 × 2 × 2,
 * [32, 12] a 2 × 2 × 3. Scaling by p and q keeps areas ∝ k² and volumes ∝ k³.
 */
const SOLIDS: [number, number][] = [[6, 1], [10, 2], [16, 4], [22, 6], [24, 8], [32, 12]];

function areaToVolumeQ(rng: RNG): Generated | null {
  const [p, q] = rng.pick(RATIOS.filter(([, y]) => y <= 5));
  const [ca, cv] = rng.pick(SOLIDS);
  const smallA = ca * p * p, bigA = ca * q * q;
  const smallV = cv * p * p * p, bigV = cv * q * q * q;
  const up = rng.bool(0.55);
  const given = up ? smallV : bigV;
  const answer = E(up ? bigV : smallV);
  if (!clean(answer) || bigV > 2000 || bigA > 900) return null;
  const sc = (num: number, den: number) => frac(given * num, den);
  const distractors = usable(rng, answer, [
    { value: up ? sc(q * q, p * p) : sc(p * p, q * q), trap: 'scaled the volume by the area ratio', must: true },
    { value: up ? sc(q, p) : sc(p, q), trap: 'scaled the volume by the length ratio' },
    { value: up ? sc(p ** 3, q ** 3) : sc(q ** 3, p ** 3), trap: 'used the ratio upside down' },
    { value: E(given + (bigA - smallA)), trap: 'added the difference of the areas' },
    { value: up ? sc(q ** 4, p ** 4) : sc(p ** 4, q ** 4), trap: 'raised the ratio to the fourth power' },
    { value: up ? sc(q ** 3 - p ** 3, p ** 3) : sc(q ** 3 - p ** 3, q ** 3), trap: 'gave the change in volume, not the new volume' },
    { value: up ? sc(2 * q ** 3, p ** 3) : sc(2 * p ** 3, q ** 3), trap: 'doubled the scaled volume' },
    { value: up ? sc(q ** 3, 2 * p ** 3) : sc(p ** 3, 2 * q ** 3), trap: 'halved the scaled volume' },
    { value: up ? sc(q ** 3, p ** 2) : sc(p ** 3, q ** 2), trap: 'cubed the top of the ratio but squared the bottom' },
    { value: E(given * (up ? q ** 3 : p ** 3)), trap: up ? 'multiplied by q³ but forgot to divide by p³' : 'multiplied by p³ but forgot to divide by q³' },
  ]);
  if (!distractors) return null;
  return {
    stem: `Two similar solids have surface areas $${smallA}\\ \\text{cm}^{2}$ and $${bigA}\\ \\text{cm}^{2}$. The ${up ? 'smaller' : 'larger'} solid has volume $${given}\\ \\text{cm}^{3}$.\n\nFind the volume of the ${up ? 'larger' : 'smaller'} solid, in $\\text{cm}^{3}$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `Areas are in the ratio $${smallA} : ${bigA} = ${p * p} : ${q * q}$, so lengths are $${p} : ${q}$ and volumes $${p ** 3} : ${q ** 3}$. The volume is $${given} \\times ${over(up ? q ** 3 : p ** 3, up ? p ** 3 : q ** 3)} = ${answer.toLatex()}$.`,
    trap: 'Square-root the area ratio to get the length ratio, then cube it for volumes.',
    tags: ['similar-shapes', 'scale-factor', 'area', 'volume'],
    params: { variant: 'area-to-volume', p, q, smallA, bigA, given, up },
    typedAllowed: true,
  };
}

function areaToLengthQ(rng: RNG): Generated | null {
  const [p, q] = rng.pick(RATIOS);
  const m = rng.int(1, 5);
  const s = rng.int(2, 6);
  const smallA = m * p * p, bigA = m * q * q;
  const len = p * s;
  const answer = frac(len * q, p);
  if (!clean(answer) || bigA > 900 || answer.toNumber() > 200) return null;
  const distractors = usable(rng, answer, [
    { value: frac(len * q * q, p * p), trap: 'used the area ratio as the length ratio', must: true },
    { value: frac(len * p, q), trap: 'used the ratio upside down' },
    { value: E(len + (q - p)), trap: 'added the difference instead of multiplying' },
    { value: frac(len * q * q * q, p * p * p), trap: 'cubed the length ratio' },
    { value: m > 1 ? E(len * m) : null, trap: 'multiplied by the common factor of the areas' },
    { value: E(len + q), trap: 'added instead of scaling' },
    { value: E(s * (q + 1)), trap: 'slip when square-rooting the area ratio' },
    { value: frac(len * q, p * p), trap: 'divided by p² instead of p' },
    { value: frac(len * (q + p), p), trap: 'used (p + q)/p as the scale factor' },
    { value: E(len + (bigA - smallA)), trap: 'added the difference of the areas' },
  ]);
  if (!distractors) return null;
  return {
    stem: `Two similar shapes have areas $${smallA}\\ \\text{cm}^{2}$ and $${bigA}\\ \\text{cm}^{2}$. A side of the smaller shape is $${len}$ cm.\n\nFind the length of the corresponding side of the larger shape, in cm.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `The areas are in the ratio $${smallA} : ${bigA}${m === 1 ? '' : ` = ${p * p} : ${q * q}`}$, so the lengths are in the ratio $${p} : ${q}$ and the side is $${len} \\times ${over(q, p)} = ${answer.toLatex()}$.`,
    trap: 'Take the square root of the area ratio before scaling a length.',
    tags: ['similar-shapes', 'scale-factor', 'area'],
    params: { variant: 'area-to-length', p, q, m, len },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 5

function frustumQ(rng: RNG): Generated | null {
  const n = rng.pick([2, 3, 4]);
  const kind = rng.pick(['times', 'fraction', 'volume'] as const);
  const whole = n * n * n * rng.int(1, 4);
  const smallV = whole / (n * n * n);
  const frustumV = whole - smallV;
  let answer: Exact, ask: string, solution: string, cands: Cand[];
  if (kind === 'times') {
    answer = E(n * n * n - 1);
    ask = 'The volume of the frustum is $k$ times the volume of the small cone. Find $k$.';
    solution = `The small cone is a scale copy with $k = \\frac{1}{${n}}$, so its volume is $\\frac{1}{${n * n * n}}$ of the whole cone. The frustum is the other $\\frac{${n * n * n - 1}}{${n * n * n}}$, which is $${n * n * n - 1}$ times the small cone.`;
    cands = [
      { value: E(n * n * n), trap: 'compared the small cone with the whole cone, not with the frustum', must: true },
      { value: E(n * n - 1), trap: 'used the area scale factor k²' },
      { value: E(n * n), trap: 'used k² and forgot to subtract the small cone' },
      { value: E(n - 1), trap: 'used the length scale factor' },
      { value: frac(1, n * n * n - 1), trap: 'gave the ratio the other way round' },
      { value: E(n * n * n + 1), trap: 'added the small cone instead of subtracting it' },
      { value: E(n * n * n - n), trap: 'subtracted n instead of the small cone' },
      { value: E((n - 1) ** 3), trap: 'cubed n − 1 instead of subtracting 1 from n³' },
      { value: E(n), trap: 'gave the length scale factor itself' },
    ];
  } else if (kind === 'fraction') {
    answer = frac(n * n * n - 1, n * n * n);
    ask = 'What fraction of the volume of the whole cone is the frustum?';
    solution = `The small cone has $\\frac{1}{${n}}$ of the height, so $\\frac{1}{${n * n * n}}$ of the volume; the frustum is the remaining $${answer.toLatex()}$.`;
    cands = [
      { value: frac(1, n * n * n), trap: 'gave the small cone’s share, not the frustum’s', must: true },
      { value: frac(n * n - 1, n * n), trap: 'used the area scale factor k²' },
      { value: frac(n - 1, n), trap: 'used the length scale factor k' },
      { value: frac(1, n * n * n - 1), trap: 'compared the small cone with the frustum instead' },
      { value: frac(n * n * n - 1, n * n), trap: 'mixed the squares and cubes' },
      { value: frac(n * n * n, n * n * n - 1), trap: 'gave the whole cone as a fraction of the frustum' },
      { value: frac((n - 1) ** 3, n ** 3), trap: 'cubed (n − 1)/n instead of taking 1 − 1/n³' },
      { value: frac(n * n * n - 1, n * n * n + 1), trap: 'slip in the denominator' },
    ];
  } else {
    answer = E(frustumV);
    ask = `The whole cone has volume $${whole}\\ \\text{cm}^{3}$. Find the volume of the frustum, in $\\text{cm}^{3}$.`;
    solution = `The small cone has $\\frac{1}{${n * n * n}}$ of the volume, that is $${smallV}\\ \\text{cm}^{3}$, so the frustum has $${whole} - ${smallV} = ${frustumV}\\ \\text{cm}^{3}$.`;
    cands = [
      { value: E(smallV), trap: 'gave the small cone instead of the frustum', must: true },
      { value: frac(whole * (n * n - 1), n * n), trap: 'used the area scale factor k²' },
      { value: frac(whole * (n - 1), n), trap: 'used the length scale factor k' },
      { value: frac(whole, n * n * n - 1), trap: 'divided by k³ − 1' },
      { value: E(whole - n * n * n), trap: 'subtracted k³ instead of the small cone’s volume' },
      { value: E(whole), trap: 'gave the volume of the whole cone' },
      { value: E(whole + smallV), trap: 'added the small cone instead of subtracting it' },
      { value: E(smallV * (n * n * n - 1) + smallV), trap: 'forgot to take the small cone off the whole cone' },
      { value: frac(whole, n * n * n), trap: 'gave the small cone as a share of the whole' },
    ];
  }
  if (!clean(answer)) return null;
  const distractors = usable(rng, answer, cands);
  if (!distractors) return null;
  return {
    stem: `A solid cone is cut by a plane parallel to its base, $\\frac{1}{${n}}$ of the way down from the vertex, giving a small cone and a frustum.\n\n${ask}`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors, { format: 'fraction' }),
    solution,
    trap: 'The small cone is similar to the whole cone with length factor 1/n, so its volume is 1/n³ of it — the frustum is the rest.',
    tags: ['similar-shapes', 'frustum', 'volume'],
    params: { variant: `frustum-${kind}`, n, whole },
    typedAllowed: true,
  };
}

/** Non-integer length scale factors, so the mass question is a two-step one at level 5. */
const MASS_RATIOS: [number, number][] = [[2, 3], [3, 4], [2, 5], [3, 5], [4, 5], [5, 6], [3, 7]];

/**
 * Solid statues of the same material, with believable densities: a statue of height h cm has a
 * volume of roughly 0.05 h³ cm³, so at 3–8 g cm⁻³ its mass is between h³/20000 and h³/2000 kg.
 * Heights 40 cm and 60 cm with masses 24 kg and 81 kg, not 2 cm and 6 kg.
 */
function plausibleDensity(massKg: number, heightCm: number): boolean {
  const h3 = heightCm ** 3;
  return massKg * 20000 >= h3 && massKg * 2000 <= h3;
}

/** Heights 40 cm and 60 cm, mass 24 kg → 24 × 27/8 = 81 kg. */
function massScaleQ(rng: RNG): Generated | null {
  const [p, q] = rng.pick(MASS_RATIOS);
  const u = rng.pick([15, 20, 25]);
  const hSmall = p * u, hBig = q * u;
  const t = rng.int(1, 4);
  const smallMass = t * p ** 3, bigMass = t * q ** 3;
  if (bigMass > 400 || hBig > 90) return null;
  if (!plausibleDensity(smallMass, hSmall)) return null;
  const up = rng.bool(0.6);
  const given = up ? smallMass : bigMass;
  const answer = E(up ? bigMass : smallMass);
  if (!clean(answer)) return null;
  const distractors = usable(rng, answer, [
    { value: up ? frac(given * q * q, p * p) : frac(given * p * p, q * q), trap: 'used the area scale factor k²', must: true },
    { value: up ? frac(given * q, p) : frac(given * p, q), trap: 'used the length scale factor k' },
    { value: up ? frac(given * p ** 3, q ** 3) : frac(given * q ** 3, p ** 3), trap: 'used the ratio upside down' },
    { value: E(given + (hBig - hSmall)), trap: 'added the difference of the heights' },
    { value: up ? frac(given * 3 * q, p) : frac(given * p, 3 * q), trap: 'multiplied by 3k instead of cubing' },
    { value: E(Math.abs(bigMass - smallMass)), trap: 'gave the difference of the two masses' },
    { value: up ? frac(given * q ** 4, p ** 4) : frac(given * p ** 4, q ** 4), trap: 'raised the ratio to the fourth power' },
    { value: up ? frac(given * q ** 3, p ** 2) : frac(given * p ** 3, q ** 2), trap: 'cubed the top of the ratio but squared the bottom' },
    { value: E(given * (up ? q ** 3 : p ** 3)), trap: up ? 'multiplied by q³ but forgot to divide by p³' : 'multiplied by p³ but forgot to divide by q³' },
  ]);
  if (!distractors) return null;
  return {
    stem: `Two similar solid statues are made of the same material. The smaller is $${hSmall}$ cm tall and the larger is $${hBig}$ cm tall. The ${up ? 'smaller' : 'larger'} statue has mass $${given}$ kg.\n\nFind the mass of the ${up ? 'larger' : 'smaller'} statue, in kg.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `The heights are in the ratio $${p} : ${q}$, so the masses (like the volumes) are in the ratio $${p ** 3} : ${q ** 3}$: the mass is $${given} \\times ${over(up ? q ** 3 : p ** 3, up ? p ** 3 : q ** 3)} = ${answer.toLatex()}$ kg.`,
    trap: 'Same material means mass scales like volume, that is by k³ — and here k is not a whole number.',
    tags: ['similar-shapes', 'scale-factor', 'mass'],
    params: { variant: 'mass-scale', hSmall, hBig, given, up },
    typedAllowed: true,
  };
}

/** Masses 2 kg and 128 kg → k = 4; scale a height with it. */
function massToLengthQ(rng: RNG): Generated | null {
  const k = rng.int(2, 4);
  const hSmall = rng.int(14, 30);
  const hBig = k * hSmall;
  if (hBig > 90) return null;
  const mSmall = rng.int(1, 12);
  const mBig = mSmall * k ** 3;
  if (mBig > 500) return null;
  if (!plausibleDensity(mSmall, hSmall)) return null;
  const up = rng.bool(0.6);
  const givenH = up ? hSmall : hBig;
  const answer = E(up ? hBig : hSmall);
  if (!clean(answer)) return null;
  const distractors = usable(rng, answer, [
    { value: up ? E(givenH * k ** 3) : frac(givenH, k ** 3), trap: 'used the mass ratio itself as the length scale factor', must: true },
    { value: up ? E(givenH * k * k) : frac(givenH, k * k), trap: 'used k², the area scale factor, on a length' },
    { value: up ? frac(givenH, k) : E(givenH * k), trap: 'scaled the wrong way round' },
    { value: E(givenH + k), trap: 'added the scale factor instead of multiplying by it' },
    { value: givenH - k > 0 ? E(givenH - k) : null, trap: 'subtracted the scale factor instead of dividing by it' },
    { value: up ? E(givenH * (k ** 3 - 1)) : frac(givenH, k ** 3 - 1), trap: 'used k³ − 1, the ratio of the extra mass' },
    { value: E(givenH + (k ** 3 - 1)), trap: 'added the mass ratio instead of scaling' },
    { value: givenH - (k ** 3 - 1) > 0 ? E(givenH - (k ** 3 - 1)) : null, trap: 'subtracted the mass ratio instead of scaling' },
    { value: up ? E(givenH * 3 * k) : frac(givenH, 3 * k), trap: 'used 3k instead of the cube root of the mass ratio' },
  ]);
  if (!distractors) return null;
  return {
    stem: `Two similar solid statues are made of the same material. The smaller has mass $${mSmall}$ kg and the larger has mass $${mBig}$ kg. The ${up ? 'smaller' : 'larger'} statue is $${givenH}$ cm tall.\n\nFind the height of the ${up ? 'larger' : 'smaller'} statue, in cm.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `The masses are in the ratio $${mSmall} : ${mBig} = 1 : ${k ** 3}$, so the lengths are in the ratio $1 : ${k}$ (cube root). The height is $${givenH} ${up ? `\\times ${k}` : `\\div ${k}`} = ${answer.toLatex()}$ cm.`,
    trap: 'Masses scale by k³, so cube-root the mass ratio before you scale a length.',
    tags: ['similar-shapes', 'scale-factor', 'mass', 'length'],
    params: { variant: 'mass-to-length', mSmall, mBig, givenH, up },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'm1.mensuration.similar-shapes',
  module: 'M1',
  topic: 'mensuration',
  title: 'Similar shapes and scale factors',
  levels: {
    1: 'missing length in similar triangles, integer scale factor',
    2: 'area scale factor k² (lengths 1 : 3 → areas 1 : 9)',
    3: 'volume scale factor k³, and volumes 192 : 648 back to lengths 2 : 3',
    4: 'areas to a length or to a volume (areas 4 : 9 → volumes 8 : 27)',
    5: 'a cone cut parallel to its base (small cone : frustum = 1 : 7); masses of similar solids',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return similarTriangleQ(rng);
        case 2: return areaSfQ(rng);
        case 3: return pickVariant(rng, [volumeSfQ, volumeToLengthQ]);
        case 4: return pickVariant(rng, [areaToVolumeQ, areaToLengthQ]);
        default: return pickVariant(rng, [frustumQ, frustumQ, massScaleQ, massToLengthQ]);
      }
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const p = q.params as {
      variant: string; a?: number; b?: number; k?: number; bigFirst?: boolean; p?: number; q?: number; given?: number; up?: boolean;
      h?: number; m?: number; len?: number; smallA?: number; bigA?: number; smallV?: number; bigV?: number; n?: number; whole?: number;
      hSmall?: number; hBig?: number; mSmall?: number; mBig?: number; givenH?: number;
    };
    const got = q.answer.value.toNumber();
    const close = (x: number) => Math.abs(got - x) <= 1e-9 * Math.max(1, Math.abs(x));
    // k is the length scale factor; areas go with k², volumes and masses with k³.
    switch (p.variant) {
      case 'length': {
        // corresponding sides are in proportion: cross-multiply rather than re-deriving k
        const knownSmall = p.a!, knownBig = p.k! * p.a!;
        return p.bigFirst
          ? Math.abs(got * knownBig - p.k! * p.b! * knownSmall) < 1e-9
          : Math.abs(got * knownSmall - p.b! * knownBig) < 1e-9;
      }
      case 'area': {
        const k = p.q! / p.p!;
        return close(p.up ? p.given! * k * k : p.given! / (k * k));
      }
      case 'volume': {
        const k = p.q! / p.p!;
        return close(p.up ? p.given! * k ** 3 : p.given! / k ** 3);
      }
      case 'volume-to-length': {
        // cube root of the ratio of the two volumes the stem prints
        const k = Math.cbrt(p.bigV! / p.smallV!);
        return close(p.h! * k);
      }
      case 'area-to-volume': {
        // square-root the printed areas, cube, apply to the printed volume
        const k = Math.sqrt(p.bigA! / p.smallA!);
        return close(p.up ? p.given! * k ** 3 : p.given! / k ** 3);
      }
      case 'area-to-length': {
        const k = Math.sqrt((p.m! * p.q! ** 2) / (p.m! * p.p! ** 2));
        return close(p.len! * k);
      }
      case 'frustum-times':
        return close((1 - (1 / p.n!) ** 3) / (1 / p.n!) ** 3);
      case 'frustum-fraction':
        return close(1 - (1 / p.n!) ** 3);
      case 'frustum-volume':
        return close(p.whole! * (1 - (1 / p.n!) ** 3));
      case 'mass-scale': {
        // the scale factor comes from the two heights printed in the stem
        const k = p.hBig! / p.hSmall!;
        return k > 1 && close(p.up ? p.given! * k ** 3 : p.given! / k ** 3);
      }
      case 'mass-to-length': {
        // the scale factor comes from the two masses printed in the stem
        const k = Math.cbrt(p.mBig! / p.mSmall!);
        return k > 1 && close(p.up ? p.givenH! * k : p.givenH! / k);
      }
      default:
        return false;
    }
  },
});
