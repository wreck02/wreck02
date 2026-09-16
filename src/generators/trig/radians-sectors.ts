import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, piFrac, Exact } from '../../core/exact';
import { buildOptions, type Distractor, type Option } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { exactCos, exactSin } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Radians, arc length, sector area, sector perimeter and segment area.
 * Level 1: 150° = 5π/6 and back
 * Level 2: arc length s = rθ (r = 6, θ = π/3 → 2π)
 * Level 3: sector area ½r²θ (r = 4, θ = 3π/4 → 6π)
 * Level 4: perimeter of a sector 2r + rθ (→ 12 + 2π), sometimes with the angle given in degrees
 * Level 5: segment area ½r²(θ − sin θ) (r = 6, θ = π/3 → 6π − 9√3), or the angle from an arc or an area
 *
 * All answers are exact and left in terms of π; the stem always says which unit is wanted, because
 * a unit attached to an answer containing π breaks the typed-answer parser.
 * params record exactly what the stem states, so verify() can redo the geometry in floating point.
 *
 * Display notes:
 *  - a segment area is printed with its π term first (6π − 9√3, the exam's order) by `segTex`,
 *    because Exact sorts rationals and surds before π terms;
 *  - an angle in degrees is printed with format 'decimal', so a half-turn slip reads 22.5, not 45/2.
 */

type Angle = [number, number]; // p/q of π

const SMALL_ANGLES: Angle[] = [[1, 6], [1, 4], [1, 3], [1, 2], [2, 3], [3, 4], [5, 6]];
const ALL_ANGLES: Angle[] = [...SMALL_ANGLES, [1, 1], [7, 6], [5, 4], [4, 3], [3, 2], [1, 12], [5, 12], [7, 12], [11, 12], [1, 9], [2, 9], [5, 3], [7, 4], [11, 6], [2, 1]];
const RADII = [2, 3, 4, 5, 6, 8, 9, 10, 12];

const DEGREES = [10, 15, 18, 20, 24, 30, 36, 40, 45, 50, 60, 72, 75, 80, 90, 100, 108, 120, 135, 140, 144, 150, 160, 200, 210, 225, 240, 270, 280, 300, 315, 320, 330];

const theta = ([p, q]: Angle): Exact => piFrac(p, q);
const thetaTex = (a: Angle): string => theta(a).toLatex();
const degOf = ([p, q]: Angle): number => (180 * p) / q;

/** Angles worth converting to degrees: a whole number of degrees, and not a straight or full turn. */
const DEG_ANGLES: Angle[] = ALL_ANGLES.filter((a) => Number.isInteger(degOf(a)) && degOf(a) !== 180 && degOf(a) !== 360);

/** Exam-plausible: at most halves/quarters in front of π or a surd, and no huge numerators. */
function tidy(x: Exact, maxDen = 4): boolean {
  if (!Number.isFinite(x.toNumber()) || !isCleanExact(x).ok) return false;
  return x.terms.every((t) => Number(t.c.d) <= maxDen && Math.abs(Number(t.c.n)) <= 400);
}

function clean(ds: Distractor[]): Distractor[] {
  return ds.filter((d) => tidy(d.value, 12) && Math.abs(d.value.toNumber()) > 1e-9);
}

/**
 * Exam order for a two-term answer: the π term leads when the other term is negative,
 * so a segment prints as $6\pi - 9\sqrt{3}$ rather than $-9\sqrt{3} + 6\pi$.
 */
function segTex(x: Exact): string {
  if (x.terms.length === 2) {
    const [first, second] = x.terms;
    if (first.k === 0 && second.k !== 0) {
      const lead = Exact.fromTerms([second]);
      const tail = Exact.fromTerms([first]);
      if (tail.sign() < 0) return `${lead.toLatex()} - ${tail.abs().toLatex()}`;
    }
  }
  return x.toLatex();
}

/** Re-render the option list with segTex, keeping buildOptions' de-duplication and shuffle. */
function segOptions(opts: Option[]): Option[] {
  return opts.map((o) => (o.value ? { ...o, display: `$${segTex(o.value)}$` } : o));
}

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 60; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

// ----------------------------------------------------------------------------- level 1

function convertQ(rng: RNG): Generated | null {
  const toRadians = rng.bool(0.55);
  if (toRadians) {
    const deg = rng.pick(DEGREES);
    const answer = piFrac(deg, 180);
    if (!tidy(answer, 24)) return null;
    const ds: Distractor[] = [
      { value: piFrac(180, deg), trap: 'multiplied by 180/θ: the conversion factor is π/180', must: true },
      { value: piFrac(deg, 360), trap: 'divided by 360 instead of 180' },
      { value: frac(deg, 180), trap: 'forgot the factor of π' },
      { value: piFrac(deg, 90), trap: 'divided by 90' },
      { value: piFrac(2 * deg, 180), trap: 'doubled the angle' },
      { value: piFrac(360 - deg, 180), trap: 'converted the reflex angle instead' },
    ];
    return {
      stem: `Express $${deg}^{\\circ}$ in radians, giving your answer as a multiple of $\\pi$.`,
      answer: { kind: 'exact', value: answer },
      options: buildOptions(rng, answer, clean(ds), {
        fallback: [[1, 6], [1, 4], [1, 3], [1, 2], [2, 3], [3, 4], [5, 6], [5, 12], [7, 12], [1, 1], [4, 3], [3, 2]].map(([u, v]) => piFrac(u, v)),
      }),
      solution: `$${deg}^{\\circ} = ${deg} \\times \\frac{\\pi}{180} = ${answer.toLatex()}$ radians.`,
      trap: 'Degrees → radians multiplies by π/180; radians → degrees multiplies by 180/π.',
      tags: ['trigonometry', 'radians', 'conversion'],
      params: { variant: 'convert', dir: 'to-rad', deg },
      typedAllowed: true,
    };
  }
  const a = rng.pick(DEG_ANGLES);
  const deg = degOf(a);
  const answer = E(deg);
  // A degree measure is positive, at most a couple of turns, and printed as the exam prints it
  // (112.5, never 225/2): anything else is eliminated without doing the conversion.
  const degreeLike = (v: Exact) => {
    const x = v.toNumber();
    return x > 0 && x <= 720 && Number.isInteger(2 * x);
  };
  const ds: Distractor[] = [
    { value: frac(180 * a[1], a[0]), trap: 'turned the fraction upside down before multiplying by 180', must: true },
    { value: E(2 * deg), trap: 'multiplied by 360 instead of 180' },
    { value: frac(deg, 2), trap: 'multiplied by 90 instead of 180' },
    { value: E(360 - deg), trap: 'gave the angle measured the other way round the circle' },
    { value: frac(180, a[1]), trap: 'divided 180 by the denominator but never multiplied by the numerator' },
    { value: E(180 * a[0]), trap: 'multiplied by 180 but never divided by the denominator' },
  ];
  if (deg < 180) ds.push({ value: E(180 - deg), trap: 'gave the supplementary angle' });
  else ds.push({ value: E(deg - 180), trap: 'measured on from the half turn instead of from zero' });
  return {
    stem: `Express $${thetaTex(a)}$ radians in degrees.`,
    answer: { kind: 'exact', value: answer, format: 'decimal' },
    options: buildOptions(rng, answer, ds.filter((d) => degreeLike(d.value) && isCleanExact(d.value).ok), {
      format: 'decimal',
      fallback: [30, 45, 60, 90, 120, 135, 150, 180, 210, 240, 270, 300].filter((d) => d !== deg).map(E),
    }),
    solution: `$${thetaTex(a)} \\times \\frac{180}{\\pi} = ${deg}^{\\circ}$.`,
    trap: 'Degrees → radians multiplies by π/180; radians → degrees multiplies by 180/π.',
    tags: ['trigonometry', 'radians', 'conversion'],
    params: { variant: 'convert', dir: 'to-deg', p: a[0], q: a[1] },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- levels 2–4

interface Sector { r: number; a: Angle; arc: Exact; area: Exact; perimeter: Exact }

function drawSector(rng: RNG, angles: Angle[]): Sector | null {
  const r = rng.pick(RADII);
  const a = rng.pick(angles);
  const arc = E(r).mul(theta(a));
  const area = E(r * r).mulRat(frac(1, 2).toRat()).mul(theta(a));
  const perimeter = E(2 * r).add(arc);
  // sixths in front of π are still mental (5π/6 cm); the area may not be uglier than quarters
  if (!tidy(arc, 6) || !tidy(area, 4)) return null;
  return { r, a, arc, area, perimeter };
}

function arcQ(rng: RNG): Generated | null {
  const s = drawSector(rng, SMALL_ANGLES);
  if (!s) return null;
  const { r, a } = s;
  const ds: Distractor[] = [
    { value: s.area, trap: 'used the sector-area formula ½r²θ instead of rθ', must: true },
    { value: E(r * r).mul(theta(a)), trap: 'squared the radius' },
    { value: E(r).mul(theta(a)).mulRat(frac(1, 2).toRat()), trap: 'halved: ½rθ is not the arc length' },
    { value: s.perimeter, trap: 'gave the whole perimeter of the sector' },
    { value: E(2 * r).mul(theta(a)), trap: 'used the diameter instead of the radius' },
    { value: E(2 * r).mul(Exact.pi()), trap: 'gave the circumference of the whole circle' },
    { value: theta(a), trap: 'gave the angle: the radius was never used' },
    { value: theta(a).mulRat(frac(1, r).toRat()), trap: 'divided by the radius instead of multiplying' },
  ];
  return {
    stem: `A sector of a circle of radius ${r} cm subtends an angle of $${thetaTex(a)}$ radians at the centre.\n\nFind the length of the arc, in cm, leaving your answer in terms of $\\pi$.`,
    answer: { kind: 'exact', value: s.arc },
    options: buildOptions(rng, s.arc, clean(ds)),
    solution: `$s = r\\theta = ${r} \\times ${thetaTex(a)} = ${s.arc.toLatex()}$ cm.`,
    trap: 's = rθ only works with θ in radians, and there is no ½ and no squaring.',
    tags: ['trigonometry', 'radians', 'arc-length'],
    params: { variant: 'arc', r, p: a[0], q: a[1] },
    typedAllowed: true,
  };
}

function sectorAreaQ(rng: RNG): Generated | null {
  const s = drawSector(rng, SMALL_ANGLES);
  if (!s) return null;
  const { r, a } = s;
  const ds: Distractor[] = [
    { value: E(r * r).mul(theta(a)), trap: 'forgot the ½ in ½r²θ', must: true },
    { value: s.arc, trap: 'found the arc length rθ instead of the area' },
    { value: E(r).mul(theta(a)).mulRat(frac(1, 2).toRat()), trap: 'forgot to square the radius' },
    { value: E(r * r).mul(Exact.pi()), trap: 'gave the area of the whole circle' },
    { value: E(r * r).mulRat(frac(1, 4).toRat()).mul(theta(a)), trap: 'halved twice' },
    { value: E(4 * r * r).mulRat(frac(1, 2).toRat()).mul(theta(a)), trap: 'used the diameter in place of the radius' },
  ];
  return {
    stem: `A sector of a circle of radius ${r} cm subtends an angle of $${thetaTex(a)}$ radians at the centre.\n\nFind the area of the sector, in cm$^2$, leaving your answer in terms of $\\pi$.`,
    answer: { kind: 'exact', value: s.area },
    options: buildOptions(rng, s.area, clean(ds)),
    solution: `$A = \\tfrac{1}{2}r^2\\theta = \\tfrac{1}{2} \\times ${r * r} \\times ${thetaTex(a)} = ${s.area.toLatex()}$ cm$^2$.`,
    trap: 'Sector area is ½r²θ: keep the ½ and square the radius (the arc length rθ does neither).',
    tags: ['trigonometry', 'radians', 'sector-area'],
    params: { variant: 'sector-area', r, p: a[0], q: a[1] },
    typedAllowed: true,
  };
}

function perimeterQ(rng: RNG): Generated | null {
  const s = drawSector(rng, SMALL_ANGLES);
  if (!s) return null;
  const { r, a } = s;
  const inDegrees = rng.bool(0.4) && Number.isInteger(degOf(a));
  if (!tidy(s.perimeter, 2)) return null;
  // The whole phrase, maths and unit together: "$60^{\circ}$" or "$\frac{\pi}{3}$ radians".
  const angleTex = inDegrees ? `$${degOf(a)}^{\\circ}$` : `$${thetaTex(a)}$ radians`;
  const ds: Distractor[] = [
    { value: s.arc, trap: 'gave the arc only: the two straight edges were left out', must: true },
    { value: E(r).add(s.arc), trap: 'added only one radius' },
    { value: E(2 * r).add(s.area), trap: 'used the sector area in place of the arc length' },
    { value: E(2 * r).add(s.arc.mulRat(2)), trap: 'doubled the arc as well as the radii' },
    { value: E(2 * r).mul(Exact.pi()).add(E(2 * r)), trap: 'used the whole circumference' },
    { value: E(2 * r).add(E(r).mul(theta(a)).mulRat(frac(1, 2).toRat())), trap: 'halved the arc length' },
  ];
  return {
    stem: `A sector of a circle of radius ${r} cm subtends an angle of ${angleTex} at the centre.\n\nFind the perimeter of the sector, in cm, leaving your answer in terms of $\\pi$.`,
    answer: { kind: 'exact', value: s.perimeter },
    options: buildOptions(rng, s.perimeter, clean(ds)),
    solution: `${inDegrees ? `$${degOf(a)}^{\\circ} = ${thetaTex(a)}$ radians. ` : ''}Arc $= r\\theta = ${s.arc.toLatex()}$ cm, and the two radii add $${2 * r}$ cm, so the perimeter is $${s.perimeter.toLatex()}$ cm.`,
    trap: 'The perimeter of a sector is the arc plus the two radii, not the arc on its own.',
    tags: ['trigonometry', 'radians', 'perimeter'],
    params: { variant: 'perimeter', r, p: a[0], q: a[1], inDegrees },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 5

function segmentQ(rng: RNG): Generated | null {
  const r = rng.pick(RADII);
  const a = rng.pick(SMALL_ANGLES);
  const deg = degOf(a);
  if (!Number.isInteger(deg)) return null;
  const sin = exactSin(deg);
  const half = frac(1, 2).toRat();
  const sector = E(r * r).mulRat(half).mul(theta(a));
  const triangle = E(r * r).mulRat(half).mul(sin);
  const answer = sector.sub(triangle);
  if (!tidy(answer, 4) || !tidy(sector, 2) || !tidy(triangle, 4)) return null;
  if (answer.terms.length !== 2) return null;
  const ds: Distractor[] = [
    { value: sector, trap: 'gave the sector area: the triangle was never subtracted', must: true },
    { value: sector.add(triangle), trap: 'added the triangle instead of subtracting it' },
    { value: triangle, trap: 'gave the area of the triangle only' },
    { value: sector.sub(triangle.mulRat(2)), trap: 'forgot the ½ in the triangle area ½r² sin θ' },
    { value: sector.sub(E(r * r).mulRat(half).mul(exactCos(deg))), trap: 'used cos θ in place of sin θ' },
    { value: sector.mulRat(2).sub(triangle), trap: 'forgot the ½ in the sector area' },
  ];
  return {
    stem: `A chord of a circle of radius ${r} cm subtends an angle of $${thetaTex(a)}$ radians at the centre.\n\nFind the exact area, in cm$^2$, of the minor segment cut off by the chord.`,
    answer: { kind: 'exact', value: answer },
    options: segOptions(buildOptions(rng, answer, clean(ds))),
    solution: `Sector $= \\tfrac{1}{2}r^2\\theta = ${sector.toLatex()}$ and triangle $= \\tfrac{1}{2}r^2\\sin\\theta = \\tfrac{1}{2} \\times ${r * r} \\times ${sin.toLatex()} = ${triangle.toLatex()}$, so the segment is $${segTex(answer)}$ cm$^2$.`,
    trap: 'Segment = sector − triangle, and the triangle is ½r² sin θ (not ½ base × height with the radius).',
    tags: ['trigonometry', 'radians', 'segment'],
    params: { variant: 'segment', r, p: a[0], q: a[1] },
    typedAllowed: true,
  };
}

function findAngleQ(rng: RNG): Generated | null {
  const r = rng.pick(RADII);
  const a = rng.pick(SMALL_ANGLES);
  const fromArc = rng.bool(0.55);
  const inDegrees = rng.bool(0.4);
  const arc = E(r).mul(theta(a));
  const area = E(r * r).mulRat(frac(1, 2).toRat()).mul(theta(a));
  const given = fromArc ? arc : area;
  if (!tidy(given, 2)) return null;
  const deg = degOf(a);
  if (inDegrees && !Number.isInteger(deg)) return null;
  const answer = inDegrees ? E(deg) : theta(a);
  if (!tidy(answer, 12)) return null;
  // An angle at the centre of a sector is positive and below a full turn; in degrees it is
  // printed the way the exam prints it, so a half-turn slip shows as 22.5 and not as 45/2.
  const fullTurn = inDegrees ? 360 : 2 * Math.PI;
  const possible = (v: Exact) => {
    const x = v.toNumber();
    return x > 1e-9 && x < fullTurn - 1e-9 && (!inDegrees || Number.isInteger(2 * x));
  };
  // the unit slip is exempt: π/6 offered as a number of degrees is exactly the mistake on trial
  const ds: Distractor[] = [
    { value: inDegrees ? theta(a) : E(deg), trap: inDegrees ? 'left the answer in radians' : 'gave the angle in degrees rather than radians', must: true },
  ];
  const push = (value: Exact, trap: string, must = false) => { if (possible(value)) ds.push({ value, trap, must }); };
  const half = answer.mulRat(frac(1, 2).toRat());
  const twice = answer.mulRat(2);
  if (fromArc) {
    push(half, 'divided by the diameter 2r instead of by the radius r', true);
    push(twice, 'brought in the factor of 2 that only the area formula has');
    push(answer.mulRat(frac(2, r).toRat()), 'used θ = 2A/r², the area formula, with the arc length');
  } else {
    push(half, 'forgot the ½: used θ = A/r² instead of θ = 2A/r²', true);
    push(twice, 'doubled again after already using θ = 2A/r²');
    push(answer.mulRat(frac(1, 4).toRat()), 'used the diameter in place of the radius: θ = 2A/d²');
    push(answer.mulRat(frac(r, 2).toRat()), 'used θ = s/r, the arc formula, with the area');
  }
  push(answer.mulRat(r), 'multiplied by the radius instead of dividing by it');
  push(inDegrees ? E(360 - deg) : Exact.pi().mulRat(2).sub(theta(a)), 'gave the reflex angle');
  const question = inDegrees
    ? 'Find the angle of the sector, in degrees.'
    : 'Find the angle of the sector, in radians, in terms of $\\pi$.';
  return {
    stem: fromArc
      ? `The arc of a sector of a circle of radius ${r} cm has length $${arc.toLatex()}$ cm.\n\n${question}`
      : `A sector of a circle of radius ${r} cm has area $${area.toLatex()}$ cm$^2$.\n\n${question}`,
    answer: { kind: 'exact', value: answer, format: inDegrees ? 'decimal' : 'auto' },
    options: buildOptions(rng, answer, clean(ds), inDegrees ? { format: 'decimal' } : {}),
    solution: fromArc
      ? `$\\theta = \\frac{s}{r} = \\frac{${arc.toLatex()}}{${r}} = ${theta(a).toLatex()}$ radians${inDegrees ? `, which is $${deg}^{\\circ}$` : ''}.`
      : `$\\theta = \\frac{2A}{r^2} = \\frac{2 \\times ${area.toLatex()}}{${r * r}} = ${theta(a).toLatex()}$ radians${inDegrees ? `, which is $${deg}^{\\circ}$` : ''}.`,
    trap: fromArc
      ? 'Rearranging s = rθ divides by the radius once — not by the diameter — and the answer is in radians.'
      : 'Rearranging A = ½r²θ brings in a factor of 2: θ = 2A/r², and the answer is in radians.',
    tags: ['trigonometry', 'radians', 'sector'],
    params: { variant: 'find-angle', r, p: a[0], q: a[1], fromArc, inDegrees },
    typedAllowed: true,
  };
}

// -----------------------------------------------------------------------------

export default defineTemplate({
  id: 'm1.trig.radians-sectors',
  module: 'M1',
  topic: 'trig',
  title: 'Radians, arcs and sectors',
  levels: {
    1: 'degrees ↔ radians: 150° = 5π/6',
    2: 'arc length s = rθ: r = 6, θ = π/3 → 2π',
    3: 'sector area ½r²θ: r = 4, θ = 3π/4 → 6π',
    4: 'perimeter of a sector 2r + rθ → 12 + 2π, angle sometimes given in degrees',
    5: 'segment area ½r²(θ − sin θ) → 6π − 9√3, or the angle from an arc or an area',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      if (level === 1) return convertQ(rng);
      if (level === 2) return arcQ(rng);
      if (level === 3) return sectorAreaQ(rng);
      if (level === 4) return perimeterQ(rng);
      return pickVariant(rng, [segmentQ, findAngleQ]);
    });
  },
  verify(q) {
    const p = q.params as Record<string, unknown>;
    if (q.answer.kind !== 'exact') return false;
    const value = q.answer.value.toNumber();
    const close = (x: number) => Math.abs(value - x) < 1e-9 * Math.max(1, Math.abs(x));
    const r = p.r as number;
    const th = ((p.p as number) / (p.q as number)) * Math.PI; // radians, from the stem's fraction
    switch (p.variant) {
      case 'convert':
        return p.dir === 'to-rad'
          ? close(((p.deg as number) * Math.PI) / 180)
          : close((((p.p as number) / (p.q as number)) * Math.PI * 180) / Math.PI);
      case 'arc':
        return close(r * th);
      case 'sector-area':
        // area = (θ/2π) × πr²: the "fraction of the circle" route rather than ½r²θ
        return close((th / (2 * Math.PI)) * Math.PI * r * r);
      case 'perimeter':
        return close(2 * r + r * th);
      case 'segment':
        return close(0.5 * r * r * (th - Math.sin(th)));
      case 'find-angle': {
        const given = p.fromArc ? r * th : 0.5 * r * r * th; // what the stem prints
        const angle = p.fromArc ? given / r : (2 * given) / (r * r);
        return close(p.inDegrees ? (angle * 180) / Math.PI : angle);
      }
      default:
        return false;
    }
  },
});
