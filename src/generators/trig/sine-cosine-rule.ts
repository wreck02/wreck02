import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, surd, Exact } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { exactSin, exactCos } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Sine rule, cosine rule and the ½ab sin C area formula.
 * Level 1: area ½ab sin C with C = 30°, 60° or 90° (exact, sometimes a √3)
 * Level 2: cosine rule with an included 60° or 120°: a² = b² + c² ∓ bc (5, 8, 60° → 7)
 * Level 3: sine rule with a 30°/45°/90° pair: a side such as 6√2
 * Level 4: an angle from three sides, integer or surd: cos θ = 0, ±½, ±√2/2, ±√3/2
 * Level 5: two steps — three sides → the enclosed angle → the area, or the sine rule then the area
 */

const CM = '\\text{cm}';
const CM2 = '\\text{cm}^{2}';

const rad = (d: number) => (d * Math.PI) / 180;
const sinD = (d: number) => Math.sin(rad(d));
const cosD = (d: number) => Math.cos(rad(d));

/** Angles with an exact sine that the sine rule may use. */
const SINE_ANGLES = [30, 45, 60, 90, 120, 135, 150];

/** Pairs (A, B) leaving a third angle of at least 30°. */
const SINE_PAIRS: [number, number][] = [];
for (const A of SINE_ANGLES) for (const B of SINE_ANGLES) if (A + B <= 150) SINE_PAIRS.push([A, B]);

/** sin 30° and sin 60° swapped — the classic value slip. */
const swap3060 = (d: number) => (d === 30 ? 60 : d === 60 ? 30 : d);

function attempt(f: () => Exact): Exact | null {
  try {
    const v = f();
    return Number.isFinite(v.toNumber()) ? v : null;
  } catch {
    return null;
  }
}

/** Lengths, areas and angles are all positive, so drop anything zero, negative or unclean. */
function cleanOnly(ds: { value: Exact | null; trap: string }[]): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } =>
    d.value !== null && d.value.sign() > 0 && isCleanExact(d.value).ok);
}

/**
 * Choose the distractors that go to buildOptions, and decide *before seating any of them* where the
 * answer will sit in the value-sorted option list.
 *
 * The old version took every `must` trap first and then filled up from `extra`, and because it
 * handed buildOptions exactly `count - 1` candidates, buildOptions' own balancing was inert (lo and
 * hi coincide, so the split is forced). Each variant's mistakes nearly all pull the same way — the
 * cosine-rule side with a 60° angle is the smallest of the "nice" values, the area formula's slips
 * are almost all over-estimates — so the answer landed in the same sorted position every time:
 * second smallest in 68% of level-2 questions, the median in 64% of level-5 ones, and never the
 * largest at level 1. "Strike the top and bottom and take the smaller of what is left" scored 68%
 * with no trigonometry at all.
 *
 * So: one headline (`must`) trap is guaranteed a slot, a target rank is drawn from the ranks the
 * pool can actually reach, and the remaining slots are filled from below and above the answer.
 * `last` is a tier of candidates to use only when nothing better is left (at level 2 the degenerate
 * lengths |b − c| and b + c live there, so at most one of them is ever offered).
 */
function balanced(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], last: Distractor[] = [], count = 4): Distractor[] {
  const seen: Exact[] = [answer];
  const pool: (Distractor & { tier: number })[] = [];
  const add = (d: Distractor, tier: number) => {
    if (!Number.isFinite(d.value.toNumber()) || seen.some((s) => s.equals(d.value))) return;
    seen.push(d.value);
    pool.push({ ...d, tier });
  };
  // must in order, so when two headline traps coincide the more specific label wins
  must.forEach((d) => add(d, 0));
  rng.shuffle(extra).forEach((d) => add(d, 1));
  rng.shuffle(last).forEach((d) => add(d, 2));
  if (pool.length < count) return pool;
  // Which headline trap is guaranteed a slot: pick the *side* first. Taking one at random instead
  // meant that when a variant's headline traps nearly all overshoot (as the area formula's do) the
  // guaranteed one sat above the answer almost every time, and the answer could then never be the
  // largest option — the top of the list was a free elimination in every question.
  const musts = pool.filter((d) => d.tier === 0);
  const mSides = [musts.filter((d) => d.value.cmp(answer) < 0), musts.filter((d) => d.value.cmp(answer) > 0)].filter((x) => x.length > 0);
  const forced = mSides.length ? [rng.pick(rng.pick(mSides))] : [];
  // stable sort: the tiers keep their priority, the shuffle inside a tier keeps its order
  const rest = pool.filter((d) => !forced.includes(d)).sort((x, y) => x.tier - y.tier);
  const below = rest.filter((d) => d.value.cmp(answer) < 0);
  const above = rest.filter((d) => d.value.cmp(answer) > 0);
  const need = count - forced.length;
  const fBelow = forced.filter((d) => d.value.cmp(answer) < 0).length;
  // r is how many options end up below the answer, i.e. the answer's rank in the sorted list.
  const lo = fBelow + Math.max(0, need - above.length);
  const hi = fBelow + Math.min(need, below.length);
  if (lo > hi) return [...forced, ...rest].slice(0, count);
  // Draw by thirds of the sorted list rather than uniformly over the reachable ranks: the guaranteed
  // headline trap sits on a fixed side in most variants, so a uniform draw still leaves the answer
  // in one third of the list far too often.
  const buckets: number[][] = [[], [], []];
  for (let k = lo; k <= hi; k++) buckets[k / count < 0.34 ? 0 : k / count < 0.67 ? 1 : 2].push(k);
  const live = buckets.filter((b) => b.length > 0);
  const r = rng.pick(rng.pick(live));
  return [...forced, ...below.slice(0, r - fBelow), ...above.slice(0, need - (r - fBelow))];
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

/** Padding candidates that still look like a length or an area (never a negative one). */
function positiveFallback(answer: Exact): Exact[] {
  return [answer.mulRat(2), answer.mulRat(frac(1, 2).toRat()), answer.add(E(1)), answer.sub(E(1)), answer.add(E(2)), answer.mulRat(3)]
    .filter((v) => v.sign() > 0 && isCleanExact(v).ok);
}

/** Options for an answer measured in degrees: plain integers, printed with the degree sign. */
function degreeOptions(rng: RNG, answer: Exact, ds: Distractor[]) {
  return buildOptions(rng, answer, ds).map((o) => ({
    ...o,
    display: o.display.replace(/^\$(\d+)\$$/, (_m, d: string) => `$${d}^{\\circ}$`),
  }));
}

/** Triangles with an integer third side and an exact angle: a² = b² + c² − 2bc cos(ang). */
interface TriSpec { b: number; c: number; a: number; ang: 60 | 90 | 120 }

const TRIANGLES: TriSpec[] = [];
for (const ang of [60, 90, 120] as const) {
  const k = ang === 60 ? 1 : ang === 120 ? -1 : 0; // a² = b² + c² − k·bc
  for (let b = 2; b <= 24; b++) {
    for (let c = b; c <= 24; c++) {
      if (ang === 60 && b === c) continue; // equilateral: every angle is 60°, nothing to find
      const s = b * b + c * c - k * b * c;
      const a = Math.round(Math.sqrt(s));
      if (a * a !== s || a > 36) continue;
      TRIANGLES.push({ b, c, a, ang });
    }
  }
}
/**
 * Small enough for ½bc sin C to stay mental: bc even keeps the area a whole number or a
 * whole multiple of √3, and bc ≤ 80 keeps the oblique areas between 6√3 and 20√3.
 */
const AREA_OBLIQUE = TRIANGLES.filter((t) => t.ang !== 90 && t.b * t.c <= 80 && (t.b * t.c) % 2 === 0);
const AREA_RIGHT = TRIANGLES.filter((t) => t.ang === 90 && t.b * t.c <= 200 && (t.b * t.c) % 2 === 0);

// ----------------------------------------------------------------------------- level 1: ½ab sin C

function areaQ(rng: RNG): Generated | null {
  const C = rng.pick([30, 60, 90]);
  const p = rng.int(4, 12);
  const q = rng.int(4, 12);
  // Keep the halves and quarters out of the answer: ab/4 or ab/2 should come out whole.
  if (C === 90 ? (p * q) % 2 !== 0 : (p * q) % 4 !== 0) return null;
  const sinC = exactSin(C);
  const answer = E(p).mul(E(q)).mul(sinC).mul(frac(1, 2));
  if (!isCleanExact(answer).ok) return null;
  const distractors = balanced(rng, answer, cleanOnly([
    { value: E(p * q).mul(sinC), trap: 'forgot the ½ in ½ab sin C' },
    { value: frac(p * q, 2), trap: 'forgot the sin C factor' },
    { value: attempt(() => E(p).mul(E(q)).mul(exactCos(C)).mul(frac(1, 2))), trap: 'used cos C instead of sin C' },
    { value: attempt(() => E(p).mul(E(q)).mul(exactSin(swap3060(C))).mul(frac(1, 2))), trap: 'sin 30° and sin 60° swapped' },
    // The one headline trap that undershoots. Without it every guaranteed trap sits above the answer
    // and the largest option is wrong in every single question.
    { value: E(p).mul(E(q)).mul(sinC).mul(frac(1, 4)), trap: 'used ¼ab sin C' },
  ]), cleanOnly([
    { value: E(p * q), trap: 'just multiplied the two sides' },
    { value: frac(p + q, 2).mul(sinC), trap: 'added the sides instead of multiplying them' },
    { value: E(p).mul(E(q)).mul(sinC).mul(frac(1, 2)).mul(frac(1, 2)), trap: 'halved the area a second time' },
    ...[30, 45, 60].filter((d) => d !== C).map((d) => ({
      value: E(p).mul(E(q)).mul(exactSin(d)).mul(frac(1, 2)),
      trap: `used $\\sin ${d}^{\\circ}$ for $\\sin ${C}^{\\circ}$`,
    })),
  ]));
  if (distractors.length < 4) return null;
  return {
    stem: `In triangle $ABC$, $AB = ${p}$ cm, $AC = ${q}$ cm and angle $BAC = ${C}^{\\circ}$. Find the area of the triangle, in $\\text{cm}^{2}$.`,
    answer: { kind: 'exact', value: answer, unit: CM2 },
    options: buildOptions(rng, answer, distractors, { unit: CM2, fallback: positiveFallback(answer) }),
    solution: `Area $= \\tfrac{1}{2}ab\\sin C = \\tfrac{1}{2} \\times ${p} \\times ${q} \\times ${sinC.toLatex()} = ${answer.toLatex()}$.`,
    trap: 'Half the product of the two sides times the sine of the angle between them — the ½ and the sine are both easy to drop.',
    tags: ['trig', 'area', 'sine-rule'],
    params: { variant: 'area', p, q, ang: C },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 2: cosine rule for a side

function cosineSideQ(rng: RNG): Generated | null {
  // 60° more often than 120°: with an obtuse included angle the opposite side is longer than every
  // other exact value the cosine rule can produce, so the answer can only sit near the top of the
  // list. Weighting the acute case keeps the overall rank spread even.
  const ang = rng.weighted([60, 120], [3, 2]);
  const k = ang === 60 ? 1 : -1;
  // Sides up to 16: the pool of perfect-square cosine triangles is intrinsically small,
  // so the range and the surd share are both widened to keep level 2 from repeating.
  const p = rng.int(2, 16);
  const q = rng.int(2, 16);
  const s = p * p + q * q - k * p * q;
  const root = Math.round(Math.sqrt(s));
  const square = root * root === s;
  // Perfect squares about half the time; otherwise a single clean surd such as √7 or √13.
  if (!square && (s > 80 || rng.bool(0.5))) return null;
  if (ang === 60 && p === q) return null; // equilateral
  const answer = surd(s);
  if (!isCleanExact(answer).ok || answer.hasSurd() === square) return null;
  /**
   * Every option has to be a length this triangle could have. With two sides and the angle between
   * them, AC lies strictly between |AB − BC| and AB + BC, so anything outside that interval is
   * struck out with no cosine rule at all. That rules out the old unrooted-a² trap (79 cm for a
   * triangle with sides 3 and 10) and the "doubled the bc term" value, which collapses onto
   * |b − c| for 60° and onto b + c for 120° — the same number as the candidate beside it.
   */
  const loB = Math.abs(p - q);
  const hiB = p + q;
  const inside = (ds: { value: Exact | null; trap: string }[]) =>
    cleanOnly(ds).filter((d) => d.value.toNumber() > loB + 1e-9 && d.value.toNumber() < hiB - 1e-9);
  const big = Math.max(p, q);
  const small = Math.min(p, q);
  const must = inside([
    { value: surd(p * p + q * q + k * p * q), trap: `sign slip: $\\cos ${ang}^{\\circ} = ${ang === 60 ? '\\tfrac{1}{2}' : '-\\tfrac{1}{2}'}$, so the $bc$ term is ${ang === 60 ? 'subtracted, not added' : 'added, not subtracted'}` },
    { value: surd(p * p + q * q), trap: 'used Pythagoras, ignoring the angle' },
  ]);
  const extra = inside([
    { value: p === q ? null : surd(Math.abs(p * p - q * q)), trap: 'subtracted the squares instead of using the cosine rule' },
    { value: (p * q) % 2 === 0 ? surd(p * p + q * q - (k * p * q) / 2) : null, trap: 'forgot the $2$ in $2bc\\cos C$' },
    { value: surd(big * big - k * big * small), trap: `dropped the $${small}^{2}$ term from $b^2 + c^2$` },
    { value: (p * q) % 2 === 0 ? surd(p * p + q * q + (k * p * q) / 2) : null, trap: 'forgot the $2$ in $2bc\\cos C$ and slipped the sign' },
  ]);
  // The two degenerate lengths. They are the classic exam distractors but a candidate who knows the
  // triangle inequality can strike them out, so at most one of them is ever offered.
  const degenerate = cleanOnly([
    { value: E(p + q), trap: 'added the two sides' },
    { value: p === q ? null : E(Math.abs(p - q)), trap: `read $\\cos ${ang}^{\\circ}$ as $1$, which gives $AC = |AB - BC|$` },
  ]);
  const distractors = balanced(rng, answer, must, extra, degenerate.length ? [rng.pick(degenerate)] : []);
  if (distractors.length < 4) return null;
  return {
    stem: `In triangle $ABC$, $AB = ${p}$ cm, $BC = ${q}$ cm and angle $ABC = ${ang}^{\\circ}$. Find $AC$, in cm.`,
    answer: { kind: 'exact', value: answer, unit: CM },
    options: buildOptions(rng, answer, distractors, { unit: CM, fallback: positiveFallback(answer) }),
    solution: `$AC^2 = ${p}^2 + ${q}^2 - 2 \\times ${p} \\times ${q} \\times \\cos ${ang}^{\\circ} = ${p * p} + ${q * q} ${k === 1 ? '-' : '+'} ${p * q} = ${s}$, so $AC = ${answer.toLatex()}$.`,
    trap: 'cos 120° = −½, so the bc term is added; cos 60° = ½, so it is subtracted.',
    tags: ['trig', 'cosine-rule'],
    params: { variant: 'cosine-side', p, q, ang },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 3: sine rule for a side

function sineSideQ(rng: RNG): Generated | null {
  const [A, B] = rng.pick(SINE_PAIRS);
  const a = rng.int(2, 16);
  const sinA = exactSin(A), sinB = exactSin(B);
  const answer = attempt(() => E(a).mul(sinB).div(sinA));
  if (!answer || !isCleanExact(answer).ok || answer.equals(E(a))) return null;
  const v = answer.toNumber();
  if (v < 1.5 || v > 36) return null;
  // Prefer a whole coefficient (3√2 rather than 5√2/2) so the arithmetic stays mental.
  const whole = answer.terms.length === 1 && answer.terms[0].c.d === 1n;
  if (!whole && rng.bool(0.6)) return null;
  const C = 180 - A - B;
  const sinC = SINE_ANGLES.includes(C) ? exactSin(C) : null;
  // Every distractor is a specific misuse of the sine rule; if four of them do not survive
  // the clean-number filter the parameters are rejected rather than padded with generic values.
  const distractors = balanced(rng, answer, cleanOnly([
    { value: attempt(() => E(a).mul(sinA).div(sinB)), trap: 'sine rule upside down: multiplied by sin A / sin B' },
    { value: attempt(() => E(a).mul(sinB)), trap: 'multiplied by sin B but forgot to divide by sin A' },
    { value: sinC ? attempt(() => E(a).mul(sinC).div(sinA)) : null, trap: 'used the wrong pair: the third angle instead of B' },
    { value: attempt(() => E(a).mul(exactSin(swap3060(B))).div(exactSin(swap3060(A)))), trap: 'sin 30° and sin 60° swapped' },
  ]), cleanOnly([
    { value: attempt(() => E(a).mul(exactCos(B)).div(exactCos(A))), trap: 'used cosines instead of sines' },
    { value: attempt(() => E(a).div(sinB)), trap: 'divided by sin B instead of multiplying' },
    { value: attempt(() => E(a).mul(sinA).mul(sinB)), trap: 'multiplied by both sines instead of dividing by one' },
    { value: attempt(() => E(a).div(sinA.mul(sinB))), trap: 'divided by both sines' },
    { value: sinC ? attempt(() => E(a).mul(sinC).div(sinB)) : null, trap: 'paired $BC$ with angle $B$ instead of angle $A$' },
    { value: attempt(() => E(2 * a).mul(sinB).div(sinA)), trap: 'used the $a/\\sin A = 2R$ form and forgot to halve' },
    { value: attempt(() => E(a).mul(sinB).div(sinA).mul(frac(1, 2))), trap: 'used $\\tfrac{1}{2}a/\\sin A$ for the common ratio' },
  ]));
  if (distractors.length < 4) return null;
  return {
    stem: `In triangle $ABC$, angle $A = ${A}^{\\circ}$, angle $B = ${B}^{\\circ}$ and $BC = ${a}$ cm. Find $AC$, in cm.`,
    answer: { kind: 'exact', value: answer, unit: CM },
    options: buildOptions(rng, answer, distractors, { unit: CM }),
    solution: `$AC$ faces $B$ and $BC$ faces $A$, so $\\frac{AC}{\\sin ${B}^{\\circ}} = \\frac{${a}}{\\sin ${A}^{\\circ}}$ and $AC = \\frac{${a} \\times ${sinB.toLatex()}}{${sinA.toLatex()}} = ${answer.toLatex()}$.`,
    trap: 'Each side pairs with the angle opposite it: BC faces A and AC faces B.',
    tags: ['trig', 'sine-rule'],
    params: { variant: 'sine-side', a, angA: A, angB: B },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 4: an angle from three sides

/** The angles an exact cosine of 0, ±½, ±√2/2 or ±√3/2 gives. */
const EXACT_ANGLES = [30, 45, 60, 90, 120, 135, 150];
const COS_TEX: Record<number, string> = {
  30: '\\tfrac{\\sqrt{3}}{2}', 45: '\\tfrac{\\sqrt{2}}{2}', 60: '\\tfrac{1}{2}', 90: '0',
  120: '-\\tfrac{1}{2}', 135: '-\\tfrac{\\sqrt{2}}{2}', 150: '-\\tfrac{\\sqrt{3}}{2}',
};
/** The acute angle whose sine is |cos θ|: the cosine read off the wrong row of the table. */
const SIN_MISREAD: Record<number, number> = { 30: 60, 45: 45, 60: 30, 90: 0, 120: 30, 135: 45, 150: 60 };

/** A side as [coefficient, radicand]: [2, 3] is 2√3 and [5, 1] is 5. */
type Side = [number, number];
const sideTex = ([c, r]: Side) => (r === 1 ? `${c}` : c === 1 ? `\\sqrt{${r}}` : `${c}\\sqrt{${r}}`);
const sideSq = ([c, r]: Side) => c * c * r;
const sideExact = ([c, r]: Side) => (r === 1 ? E(c) : surd(r, c));

/**
 * Triangles with surd sides, listed as the shape that is then scaled by t. `ang` is the angle
 * between b and c, and a is the side opposite it. Three integer sides can only ever give
 * cos θ = 0 or ±½, so without these the answer was always 60°, 90° or 120° while 30°, 45°, 135°
 * and 150° appeared only as padding — after a couple of exposures a candidate could ignore two of
 * the five options before reading the sides. Every square here is a small integer, so
 * (b² + c² − a²)/(2bc) is still one line of mental arithmetic.
 */
const SURD_SHAPES: { b: Side; c: Side; a: Side; ang: number }[] = [
  { b: [1, 1], c: [1, 2], a: [1, 1], ang: 45 },   // t, t√2, t      → 45, 45, 90
  { b: [1, 2], c: [1, 2], a: [2, 1], ang: 90 },   // t√2, t√2, 2t   → 45, 45, 90
  { b: [1, 1], c: [1, 3], a: [1, 1], ang: 30 },   // t, t√3, t      → 30, 30, 120
  { b: [1, 1], c: [2, 1], a: [1, 3], ang: 60 },   // t, 2t, t√3     → 30, 60, 90
  { b: [1, 1], c: [1, 3], a: [2, 1], ang: 90 },   // t, t√3, 2t     → 30, 60, 90
  { b: [1, 1], c: [1, 2], a: [1, 5], ang: 135 },  // t, t√2, t√5
  { b: [1, 1], c: [1, 3], a: [1, 7], ang: 150 },  // t, t√3, t√7
  { b: [1, 1], c: [2, 1], a: [1, 7], ang: 120 },  // t, 2t, t√7
];

function angleQ(rng: RNG): Generated | null {
  let b: Side, c: Side, a: Side, ang: number;
  if (rng.bool(0.45)) {
    const sh = rng.pick(SURD_SHAPES);
    const t = rng.int(1, 3);
    b = [sh.b[0] * t, sh.b[1]];
    c = [sh.c[0] * t, sh.c[1]];
    a = [sh.a[0] * t, sh.a[1]];
    ang = sh.ang;
  } else {
    const target = rng.weighted([60, 90, 120], [4, 2, 4]);
    const t = rng.pick(TRIANGLES.filter((x) => x.ang === target));
    b = [t.b, 1];
    c = [t.c, 1];
    a = [t.a, 1];
    ang = t.ang;
  }
  const answer = E(ang);
  const b2 = sideSq(b), c2 = sideSq(c), a2 = sideSq(a);
  const bTex = sideTex(b), cTex = sideTex(c), aTex = sideTex(a);
  /**
   * Both phrasings name the sides. "Find the largest angle" is gone: the largest angle of a triangle
   * is at least 60°, and exactly 60° only for an equilateral one, so 30°, 45° and 60° are impossible
   * answers to it — 69% of those stems carried an option a candidate could strike out on sight, and
   * with only 90°, 120°, 135° and 150° left there is no fifth admissible option to offer.
   */
  const ask = aTex !== bTex && aTex !== cTex && rng.bool(0.4)
    ? `Find the size of the angle opposite the side of length $${aTex}$ cm, in degrees.`
    : `Find the size of the angle between the sides of length $${bTex}$ cm and $${cTex}$ cm, in degrees.`;
  const sides = rng.shuffle([aTex, bTex, cTex]);
  // Every option has to be a possible angle of a triangle stated in degrees: 0°, 180° and an
  // answer in radians are all eliminated on sight, so none of them is ever offered.
  const keep = (ds: { value: Exact | null; trap: string }[]): Distractor[] =>
    ds.filter((d): d is { value: Exact; trap: string } =>
      d.value !== null && isCleanExact(d.value).ok && d.value.toNumber() > 0 && d.value.toNumber() < 180);
  const supp = 180 - ang;
  const sinRead = SIN_MISREAD[ang];
  const must = keep([
    { value: supp === ang ? null : E(supp), trap: 'sign slip: used $(a^2 - b^2 - c^2)/(2bc)$, which is $-\\cos\\theta$ and gives the supplement' },
    { value: sinRead && sinRead !== ang ? E(sinRead) : null, trap: `read $\\cos\\theta = ${COS_TEX[ang]}$ as a value of $\\sin\\theta$` },
    ang === 90
      ? { value: E(45), trap: 'assumed the right angle lies between two equal sides' }
      : { value: E(90), trap: 'assumed the triangle is right-angled and used Pythagoras' },
  ]);
  const extra = keep([
    ...EXACT_ANGLES.filter((d) => d !== ang).map((d) => ({
      value: E(d),
      trap: `confused $\\cos\\theta = ${COS_TEX[ang]}$ with $\\cos\\theta = ${COS_TEX[d]}$`,
    })),
    { value: sinRead && 180 - sinRead !== ang ? E(180 - sinRead) : null, trap: `read $\\cos\\theta = ${COS_TEX[ang]}$ as a value of $\\sin\\theta$ and took the obtuse solution` },
  ]);
  const distractors = balanced(rng, answer, must, extra);
  if (distractors.length < 4) return null;
  const twoBC = E(2).mul(sideExact(b)).mul(sideExact(c));
  const cosTheta = attempt(() => E(b2 + c2 - a2).div(twoBC));
  if (!cosTheta) return null;
  return {
    stem: `A triangle has sides of length $${sides[0]}$ cm, $${sides[1]}$ cm and $${sides[2]}$ cm. ${ask}`,
    answer: { kind: 'exact', value: answer },
    options: degreeOptions(rng, answer, distractors),
    solution: `$\\cos\\theta = \\frac{${b2} + ${c2} - ${a2}}{2 \\times ${bTex} \\times ${cTex}} = \\frac{${b2 + c2 - a2}}{${twoBC.toLatex()}} = ${cosTheta.toLatex()}$, so $\\theta = ${ang}^{\\circ}$.`,
    trap: 'Rearranged cosine rule: cos θ = (b² + c² − a²)/(2bc); a negative value means an obtuse angle.',
    tags: ['trig', 'cosine-rule', 'angle'],
    params: { variant: 'angle', a2, b2, c2 },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 5: two-step

function areaFromSidesQ(rng: RNG): Generated | null {
  const pool = rng.bool(0.3) ? AREA_RIGHT : AREA_OBLIQUE;
  const t = rng.pick(pool);
  const { a, b, c, ang } = t;
  const sinAng = exactSin(ang); // √3/2 for both 60° and 120°, 1 for 90°
  const answer = E(b).mul(E(c)).mul(sinAng).mul(frac(1, 2));
  if (!isCleanExact(answer).ok) return null;
  const sides = rng.shuffle([a, b, c]);
  const distractors = balanced(rng, answer, cleanOnly([
    { value: E(b * c).mul(sinAng), trap: 'forgot the ½ in ½ab sin C' },
    { value: ang === 90 ? E(b).mul(E(c)).mul(exactSin(60)).mul(frac(1, 2)) : frac(b * c, 2), trap: ang === 90 ? 'took the angle to be 60° instead of 90°' : 'forgot the sin of the angle' },
    { value: E(b).mul(E(c)).mul(frac(1, 2)).mul(frac(1, 2)), trap: 'used sin 30° = ½ for the angle' },
    { value: E(a).mul(E(b)).mul(sinAng).mul(frac(1, 2)), trap: 'used two sides that do not enclose that angle' },
  ]), cleanOnly([
    { value: E(a).mul(E(c)).mul(sinAng).mul(frac(1, 2)), trap: 'used the wrong pair of sides' },
    { value: frac(a + b + c, 2), trap: 'found half the perimeter' },
    { value: E(b * c), trap: 'multiplied the two sides only' },
    { value: E(b).mul(E(c)).mul(sinAng).mul(frac(1, 4)), trap: 'used ¼bc sin C' },
    { value: E(a).mul(E(a)).mul(sinAng).mul(frac(1, 2)), trap: 'used the third side twice' },
  ]));
  if (distractors.length < 4) return null;
  const cosTheta = frac(b * b + c * c - a * a, 2 * b * c);
  return {
    stem: `A triangle has sides of length $${sides[0]}$ cm, $${sides[1]}$ cm and $${sides[2]}$ cm. Find its area, in $\\text{cm}^{2}$.`,
    answer: { kind: 'exact', value: answer, unit: CM2 },
    options: buildOptions(rng, answer, distractors, { unit: CM2, fallback: positiveFallback(answer) }),
    solution: `The angle $\\theta$ between the sides $${b}$ and $${c}$ has $\\cos\\theta = \\frac{${b * b + c * c - a * a}}{${2 * b * c}} = ${cosTheta.toLatex()}$, so $\\theta = ${ang}^{\\circ}$ and the area is $\\tfrac{1}{2} \\times ${b} \\times ${c} \\times ${sinAng.toLatex()} = ${answer.toLatex()}$.`,
    trap: 'Find the angle enclosed by the two sides you then use in ½ab sin C — sin 60° and sin 120° are both √3/2.',
    tags: ['trig', 'cosine-rule', 'area'],
    params: { variant: 'area-from-sides', a, b, c },
    typedAllowed: true,
  };
}

/** Angle sets in which every angle has an exact sine. */
const ANGLE_SETS: [number, number, number][] = [[30, 60, 90], [45, 45, 90], [30, 30, 120], [30, 90, 60], [45, 90, 45], [30, 120, 30]];

function sineThenAreaQ(rng: RNG): Generated | null {
  const [A, B, C] = rng.pick(ANGLE_SETS);
  // a ≤ 8 keeps a² ≤ 64, so the areas top out around 32 instead of reaching 121√3/4.
  const a = rng.int(3, 8);
  const sinA = exactSin(A), sinB = exactSin(B), sinC = exactSin(C);
  if (sinA.equals(sinB)) return null; // the sine-rule step would be a no-op
  const b = attempt(() => E(a).mul(sinB).div(sinA));
  if (!b || !isCleanExact(b).ok) return null;
  const answer = attempt(() => E(a).mul(b).mul(sinC).mul(frac(1, 2)));
  if (!answer || !isCleanExact(answer).ok || answer.toNumber() > 100) return null;
  if (!(answer.terms.length === 1 && answer.terms[0].c.d <= 4n)) return null;
  const distractors = balanced(rng, answer, cleanOnly([
    { value: attempt(() => E(a).mul(b).mul(sinC)), trap: 'forgot the ½ in ½ab sin C' },
    { value: attempt(() => E(a).mul(b).mul(frac(1, 2))), trap: 'forgot the sin of the included angle' },
    { value: attempt(() => E(a).mul(b).mul(sinA).mul(frac(1, 2))), trap: 'used an angle that is not between the two sides' },
    { value: attempt(() => E(a).mul(E(a).mul(sinA).div(sinB)).mul(sinC).mul(frac(1, 2))), trap: 'sine rule upside down when finding the second side' },
  ]), cleanOnly([
    // Not a multiple of the same surd, so the option list is not one geometric ladder.
    { value: attempt(() => E(a).mul(E(a)).mul(sinC).mul(frac(1, 2))), trap: 'used $BC$ for both sides instead of finding the second one' },
    { value: b, trap: 'stopped after finding the second side' },
    { value: attempt(() => E(a).mul(b).mul(exactCos(C)).mul(frac(1, 2))), trap: 'used cos C instead of sin C' },
    { value: attempt(() => E(a).mul(b).mul(sinC).mul(frac(1, 4))), trap: 'used ¼ab sin C' },
    // Over-estimates: without them every option but one sits below the answer and the question is
    // answerable by position.
    { value: attempt(() => E(a).mul(b)), trap: 'multiplied the two sides only' },
    { value: attempt(() => b.mul(b).mul(sinC).mul(frac(1, 2))), trap: 'used $AC$ for both sides instead of $BC$ for one of them' },
  ]));
  if (distractors.length < 4) return null;
  return {
    stem: `In triangle $ABC$, angle $A = ${A}^{\\circ}$, angle $B = ${B}^{\\circ}$ and $BC = ${a}$ cm. Find the area of the triangle, in $\\text{cm}^{2}$.`,
    answer: { kind: 'exact', value: answer, unit: CM2 },
    options: buildOptions(rng, answer, distractors, { unit: CM2, fallback: positiveFallback(answer) }),
    solution: `Sine rule: $AC = \\frac{${a}\\sin ${B}^{\\circ}}{\\sin ${A}^{\\circ}} = ${b.toLatex()}$. Angle $C = ${C}^{\\circ}$, so the area is $\\tfrac{1}{2} \\times ${a} \\times ${b.toLatex()} \\times ${sinC.toLatex()} = ${answer.toLatex()}$.`,
    trap: 'The angle in ½ab sin C must be the one between the two sides used — here that is C, not A.',
    tags: ['trig', 'sine-rule', 'area'],
    params: { variant: 'sine-then-area', a, angA: A, angB: B, angC: C },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'm1.trig.sine-cosine-rule',
  module: 'M1',
  topic: 'trig',
  title: 'Sine rule, cosine rule and ½ab sin C',
  levels: {
    1: 'area ½ab sin C with C = 30°, 60° or 90°',
    2: 'cosine rule with an included 60° or 120°: 5, 8, 60° → 7',
    3: 'sine rule with a 30°/45°/90° pair: 6√2',
    4: 'an angle from three sides, integer or surd: cos θ = 0, ±½, ±√2/2 or ±√3/2 → 30°…150°',
    5: 'two steps: three sides → angle → area, or sine rule then area',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      if (level === 1) return areaQ(rng);
      if (level === 2) return cosineSideQ(rng);
      if (level === 3) return sineSideQ(rng);
      if (level === 4) return angleQ(rng);
      return pickVariant(rng, [areaFromSidesQ, sineThenAreaQ]);
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const p = q.params as {
      variant: string; a?: number; b?: number; c?: number; p?: number; q?: number;
      a2?: number; b2?: number; c2?: number;
      ang?: number; angA?: number; angB?: number; angC?: number;
    };
    const got = q.answer.value.toNumber();
    const close = (x: number) => Number.isFinite(x) && Math.abs(got - x) < 1e-9 * Math.max(1, Math.abs(x));
    switch (p.variant) {
      case 'area':
        return close(0.5 * p.p! * p.q! * sinD(p.ang!));
      case 'cosine-side':
        return close(Math.sqrt(p.p! ** 2 + p.q! ** 2 - 2 * p.p! * p.q! * cosD(p.ang!)));
      case 'sine-side':
        return close((p.a! * sinD(p.angB!)) / sinD(p.angA!));
      case 'angle': {
        // Stored as the three squared side lengths (the surd-sided triangles have no integer sides):
        // check that the answer satisfies the cosine rule for the side opposite it.
        const { a2, b2, c2 } = p as { a2: number; b2: number; c2: number };
        const theta = got;
        return theta > 0 && theta < 180
          && Math.abs(a2 - (b2 + c2 - 2 * Math.sqrt(b2 * c2) * cosD(theta))) < 1e-9 * Math.max(1, a2);
      }
      case 'area-from-sides': {
        // Heron's formula — a completely different route to the area.
        const { a, b, c } = p as { a: number; b: number; c: number };
        const s = (a + b + c) / 2;
        return close(Math.sqrt(s * (s - a) * (s - b) * (s - c)));
      }
      case 'sine-then-area': {
        const side = (p.a! * sinD(p.angB!)) / sinD(p.angA!);
        return close(0.5 * p.a! * side * sinD(p.angC!));
      }
      default:
        return false;
    }
  },
});
