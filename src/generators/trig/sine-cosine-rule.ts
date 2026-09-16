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
 * Level 4: an angle from three sides where cos = ±½ or 0 → 60°, 90° or 120°
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
 * Choose the distractors that go to buildOptions: every distinct `must` candidate (the spec-named traps)
 * is used before any `extra` one, so the headline mistakes are never shuffled out by weaker ones.
 */
function ranked(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], count = 4): Distractor[] {
  const seen: Exact[] = [answer];
  const out: Distractor[] = [];
  const take = (d: Distractor) => {
    if (out.length >= count || !Number.isFinite(d.value.toNumber()) || seen.some((s) => s.equals(d.value))) return;
    seen.push(d.value);
    out.push(d);
  };
  must.forEach(take);
  rng.shuffle(extra).forEach(take);
  return out;
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
  for (let b = 2; b <= 16; b++) {
    for (let c = b; c <= 16; c++) {
      if (ang === 60 && b === c) continue; // equilateral: every angle is 60°, nothing to find
      const s = b * b + c * c - k * b * c;
      const a = Math.round(Math.sqrt(s));
      if (a * a !== s || a > 22) continue;
      TRIANGLES.push({ b, c, a, ang });
    }
  }
}
/** Small enough for the area ½bc sin 60° to stay mental. */
const AREA_TRIANGLES = TRIANGLES.filter((t) => t.ang !== 90 && t.b * t.c <= 80);

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
  const distractors = ranked(rng, answer, cleanOnly([
    { value: E(p * q).mul(sinC), trap: 'forgot the ½ in ½ab sin C' },
    { value: frac(p * q, 2), trap: 'forgot the sin C factor' },
    { value: attempt(() => E(p).mul(E(q)).mul(exactCos(C)).mul(frac(1, 2))), trap: 'used cos C instead of sin C' },
    { value: attempt(() => E(p).mul(E(q)).mul(exactSin(swap3060(C))).mul(frac(1, 2))), trap: 'sin 30° and sin 60° swapped' },
  ]), cleanOnly([
    { value: E(p * q), trap: 'just multiplied the two sides' },
    { value: frac(p + q, 2).mul(sinC), trap: 'added the sides instead of multiplying them' },
    { value: E(p).mul(E(q)).mul(sinC).mul(frac(1, 4)), trap: 'used ¼ab sin C' },
    ...[30, 45, 60].filter((d) => d !== C).map((d) => ({
      value: E(p).mul(E(q)).mul(exactSin(d)).mul(frac(1, 2)),
      trap: `used $\\sin ${d}^{\\circ}$ for $\\sin ${C}^{\\circ}$`,
    })),
  ]));
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
  const ang = rng.pick([60, 120]);
  const k = ang === 60 ? 1 : -1;
  const p = rng.int(2, 12);
  const q = rng.int(2, 12);
  const s = p * p + q * q - k * p * q;
  const root = Math.round(Math.sqrt(s));
  const square = root * root === s;
  // Perfect squares most of the time; otherwise a single small surd such as √7 or √13.
  if (!square && (s > 40 || rng.bool(0.75))) return null;
  if (ang === 60 && p === q) return null; // equilateral
  const answer = surd(s);
  if (!isCleanExact(answer).ok || answer.hasSurd() === square) return null;
  const distractors = ranked(rng, answer, cleanOnly([
    { value: surd(p * p + q * q + k * p * q), trap: 'sign slip: added the bc term for 60° (or subtracted it for 120°)' },
    { value: surd(p * p + q * q), trap: 'used Pythagoras, ignoring the angle' },
    { value: E(s), trap: 'stopped at $a^2$ and forgot to take the square root' },
    { value: E(Math.abs(p - q) || 1), trap: 'used cos 60° = 1, giving $(b - c)^2$' },
  ]), cleanOnly([
    { value: E(p + q), trap: 'added the two sides' },
    { value: surd(p * p + q * q - 2 * k * p * q), trap: 'doubled the bc term' },
  ]));
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
  const a = rng.int(3, 12);
  const sinA = exactSin(A), sinB = exactSin(B);
  const answer = attempt(() => E(a).mul(sinB).div(sinA));
  if (!answer || !isCleanExact(answer).ok || answer.equals(E(a))) return null;
  const v = answer.toNumber();
  if (v < 1.5 || v > 30) return null;
  // Prefer a whole coefficient (3√2 rather than 5√2/2) so the arithmetic stays mental.
  const whole = answer.terms.length === 1 && answer.terms[0].c.d === 1n;
  if (!whole && rng.bool(0.6)) return null;
  const C = 180 - A - B;
  const sinC = SINE_ANGLES.includes(C) ? exactSin(C) : null;
  const distractors = ranked(rng, answer, cleanOnly([
    { value: attempt(() => E(a).mul(sinA).div(sinB)), trap: 'sine rule upside down: multiplied by sin A / sin B' },
    { value: attempt(() => E(a).mul(sinB)), trap: 'multiplied by sin B but forgot to divide by sin A' },
    { value: sinC ? attempt(() => E(a).mul(sinC).div(sinA)) : null, trap: 'used the wrong pair: the third angle instead of B' },
    { value: attempt(() => E(a).mul(exactSin(swap3060(B))).div(exactSin(swap3060(A)))), trap: 'sin 30° and sin 60° swapped' },
  ]), cleanOnly([
    { value: attempt(() => E(a).mul(exactCos(B)).div(exactCos(A))), trap: 'used cosines instead of sines' },
    { value: attempt(() => E(a).div(sinB)), trap: 'divided by sin B' },
    { value: E(a + 1), trap: 'guessed a value close to the given side' },
  ]));
  return {
    stem: `In triangle $ABC$, angle $A = ${A}^{\\circ}$, angle $B = ${B}^{\\circ}$ and $BC = ${a}$ cm. Find $AC$, in cm.`,
    answer: { kind: 'exact', value: answer, unit: CM },
    options: buildOptions(rng, answer, distractors, { unit: CM, fallback: positiveFallback(answer) }),
    solution: `$AC$ faces $B$ and $BC$ faces $A$, so $\\frac{AC}{\\sin ${B}^{\\circ}} = \\frac{${a}}{\\sin ${A}^{\\circ}}$ and $AC = \\frac{${a} \\times ${sinB.toLatex()}}{${sinA.toLatex()}} = ${answer.toLatex()}$.`,
    trap: 'Each side pairs with the angle opposite it: BC faces A and AC faces B.',
    tags: ['trig', 'sine-rule'],
    params: { variant: 'sine-side', a, angA: A, angB: B },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 4: an angle from three sides

function angleQ(rng: RNG): Generated | null {
  const target = rng.weighted([60, 90, 120], [4, 2, 4]);
  const t = rng.pick(TRIANGLES.filter((x) => x.ang === target));
  const { a, b, c, ang } = t;
  const answer = E(ang);
  const largest = a > b && a > c;
  const ask = largest && rng.bool(0.6)
    ? 'Find the size of the largest angle, in degrees.'
    : `Find the size of the angle between the sides of length $${b}$ cm and $${c}$ cm, in degrees.`;
  const sides = rng.shuffle([a, b, c]);
  const pool = [30, 45, 60, 90, 120, 135, 150].filter((d) => d !== ang);
  const distractors = ranked(rng, answer, cleanOnly([
    { value: E(180 - ang), trap: 'sign slip in the cosine rule: took cos A with the wrong sign' },
    { value: ang === 90 ? E(45) : E(90), trap: 'assumed the triangle is right-angled' },
    { value: E(ang / 2), trap: 'halved the angle (used bc instead of 2bc)' },
  ]), pool.map((d) => ({ value: E(d), trap: 'a standard angle, but not the one the cosine rule gives' })));
  return {
    stem: `A triangle has sides of length $${sides[0]}$ cm, $${sides[1]}$ cm and $${sides[2]}$ cm. ${ask}`,
    answer: { kind: 'exact', value: answer },
    options: degreeOptions(rng, answer, distractors),
    solution: `$\\cos\\theta = \\frac{${b}^2 + ${c}^2 - ${a}^2}{2 \\times ${b} \\times ${c}} = \\frac{${b * b + c * c - a * a}}{${2 * b * c}} = ${frac(b * b + c * c - a * a, 2 * b * c).toLatex()}$, so $\\theta = ${ang}^{\\circ}$.`,
    trap: 'Rearranged cosine rule: cos A = (b² + c² − a²)/(2bc); a negative value means an obtuse angle.',
    tags: ['trig', 'cosine-rule', 'angle'],
    params: { variant: 'angle', a, b, c },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 5: two-step

function areaFromSidesQ(rng: RNG): Generated | null {
  const t = rng.pick(AREA_TRIANGLES);
  const { a, b, c, ang } = t;
  const sinAng = exactSin(ang); // √3/2 for both 60° and 120°
  const answer = E(b).mul(E(c)).mul(sinAng).mul(frac(1, 2));
  if (!isCleanExact(answer).ok) return null;
  const sides = rng.shuffle([a, b, c]);
  const distractors = ranked(rng, answer, cleanOnly([
    { value: E(b * c).mul(sinAng), trap: 'forgot the ½ in ½ab sin C' },
    { value: frac(b * c, 2), trap: 'forgot the sin of the angle' },
    { value: E(b).mul(E(c)).mul(frac(1, 2)).mul(frac(1, 2)), trap: 'used sin 30° = ½ for the angle' },
    { value: E(a).mul(E(b)).mul(sinAng).mul(frac(1, 2)), trap: 'used two sides that do not enclose that angle' },
  ]), cleanOnly([
    { value: E(a).mul(E(c)).mul(sinAng).mul(frac(1, 2)), trap: 'used the wrong pair of sides' },
    { value: frac(a + b + c, 2), trap: 'found half the perimeter' },
    { value: E(b * c), trap: 'multiplied the two sides only' },
  ]));
  return {
    stem: `A triangle has sides of length $${sides[0]}$ cm, $${sides[1]}$ cm and $${sides[2]}$ cm. Find its area, in $\\text{cm}^{2}$.`,
    answer: { kind: 'exact', value: answer, unit: CM2 },
    options: buildOptions(rng, answer, distractors, { unit: CM2, fallback: positiveFallback(answer) }),
    solution: `The angle $\\theta$ between the sides $${b}$ and $${c}$ has $\\cos\\theta = \\frac{${b * b + c * c - a * a}}{${2 * b * c}} = ${frac(b * b + c * c - a * a, 2 * b * c).toLatex()}$, so $\\theta = ${ang}^{\\circ}$ and the area is $\\tfrac{1}{2} \\times ${b} \\times ${c} \\times ${sinAng.toLatex()} = ${answer.toLatex()}$.`,
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
  const a = rng.int(3, 12);
  const sinA = exactSin(A), sinB = exactSin(B), sinC = exactSin(C);
  if (sinA.equals(sinB)) return null; // the sine-rule step would be a no-op
  const b = attempt(() => E(a).mul(sinB).div(sinA));
  if (!b || !isCleanExact(b).ok) return null;
  const answer = attempt(() => E(a).mul(b).mul(sinC).mul(frac(1, 2)));
  if (!answer || !isCleanExact(answer).ok || answer.toNumber() > 200) return null;
  if (!(answer.terms.length === 1 && answer.terms[0].c.d <= 4n)) return null;
  const distractors = ranked(rng, answer, cleanOnly([
    { value: attempt(() => E(a).mul(b).mul(sinC)), trap: 'forgot the ½ in ½ab sin C' },
    { value: attempt(() => E(a).mul(b).mul(frac(1, 2))), trap: 'forgot the sin of the included angle' },
    { value: attempt(() => E(a).mul(b).mul(sinA).mul(frac(1, 2))), trap: 'used an angle that is not between the two sides' },
    { value: attempt(() => E(a).mul(E(a).mul(sinA).div(sinB)).mul(sinC).mul(frac(1, 2))), trap: 'sine rule upside down when finding the second side' },
  ]), cleanOnly([
    { value: b, trap: 'stopped after finding the second side' },
    { value: attempt(() => E(a).mul(b).mul(exactCos(C)).mul(frac(1, 2))), trap: 'used cos C instead of sin C' },
  ]));
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
    4: 'an angle from three sides: cos = ±½ or 0 → 60°, 90°, 120°',
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
        // The stored angle is opposite side a: check the answer satisfies the cosine rule.
        const { a, b, c } = p as { a: number; b: number; c: number };
        const theta = got;
        return theta > 0 && theta < 180 && Math.abs(a * a - (b * b + c * c - 2 * b * c * cosD(theta))) < 1e-9;
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
