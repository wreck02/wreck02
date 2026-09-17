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
 *
 * Option layout:
 *  - `balanced()` draws the answer's target position in the sorted option list before choosing
 *    the distractors. Building the pool out of symmetric pairs (arc / 2r + 2·arc, sector / 2·sector)
 *    used to put the answer in the middle of five in 56–64% of levels 3–5.
 *  - a segment area may never be negative and a sector angle may never exceed a full turn: those
 *    options are struck out on sight, so `clean()` takes a per-variant plausibility guard.
 */

type Angle = [number, number]; // p/q of π

const SMALL_ANGLES: Angle[] = [[1, 6], [1, 4], [1, 3], [1, 2], [2, 3], [3, 4], [5, 6]];
/** Levels 2–4: twelfths and angles past a half turn are still mental (½ × 144 × 7π/6). */
const SECTOR_ANGLES: Angle[] = [...SMALL_ANGLES, [1, 12], [5, 12], [7, 12], [11, 12], [1, 1], [7, 6], [5, 4], [4, 3], [3, 2], [5, 3], [7, 4], [11, 6]];
/** Level 1 only: anything whose degree measure is a whole number, so both directions are mental. */
const ALL_ANGLES: Angle[] = [
  ...SECTOR_ANGLES, [2, 1], [1, 9], [2, 9], [4, 9], [5, 9], [7, 9], [8, 9], [1, 5], [2, 5], [3, 5], [4, 5],
  [1, 10], [3, 10], [7, 10], [9, 10],
  [1, 15], [2, 15], [4, 15], [7, 15], [8, 15], [11, 15], [13, 15], [14, 15],
  [1, 18], [5, 18], [7, 18], [11, 18], [13, 18], [17, 18],
  [1, 20], [3, 20], [7, 20], [9, 20], [11, 20], [13, 20], [17, 20], [19, 20],
];
const RADII = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 15, 16, 18, 20];

/** Whole numbers of degrees whose radian form has a denominator of 24 or less (5°, 25°, 35° do not). */
const DEGREES = [9, 10, 12, 15, 18, 20, 24, 27, 30, 36, 40, 45, 48, 50, 54, 60, 63, 70, 72, 75, 80, 84, 90, 96, 100, 105, 108, 110, 120, 126, 130, 135, 140, 144, 150, 160, 162, 165, 170, 200, 210, 220, 225, 240, 250, 260, 270, 280, 300, 315, 320, 330, 340, 350];

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

/**
 * Keep the exam-plausible candidates. `keep` is the per-variant guard: a segment area must be
 * positive, and an angle at the centre of a sector must be below a full turn.
 */
function clean(ds: Distractor[], keep: (v: Exact) => boolean = () => true, maxDen = 12): Distractor[] {
  return ds.filter((d) => tidy(d.value, maxDen) && Math.abs(d.value.toNumber()) > 1e-9 && keep(d.value));
}

/**
 * Choose the four distractors so the answer's place in the sorted option list is not a tell:
 * exactly one `must` trap is guaranteed, then a target rank is drawn uniformly from whatever the
 * pool allows and the remaining slots are filled from below and above the answer.
 */
function balanced(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], count = 4): Distractor[] {
  const seen: Exact[] = [answer];
  const keep: Distractor[] = [];
  for (const d of [...rng.shuffle(must).map((x) => ({ ...x, must: true })), ...extra]) {
    if (!Number.isFinite(d.value.toNumber()) || seen.some((s) => s.equals(d.value))) continue;
    seen.push(d.value);
    keep.push(d);
  }
  const forced = keep.filter((d) => d.must).slice(0, 1);
  const rest = rng.shuffle(keep.filter((d) => !forced.includes(d)));
  const below = rest.filter((d) => d.value.cmp(answer) < 0);
  const above = rest.filter((d) => d.value.cmp(answer) > 0);
  const need = count - forced.length;
  const fBelow = forced.filter((d) => d.value.cmp(answer) < 0).length;
  const lo = fBelow + Math.max(0, need - above.length);
  const hi = fBelow + Math.min(need, below.length);
  if (lo > hi) return [...forced, ...rest].slice(0, count);
  const r = rng.int(lo, hi);
  return [...forced, ...below.slice(0, r - fBelow), ...above.slice(0, need - (r - fBelow))];
}

/**
 * Exam order for a two-term answer: the π term leads, so a segment prints as
 * $6\pi - 9\sqrt{3}$ (and a major segment as $\frac{63\pi}{2} + 9\sqrt{2}$) rather than
 * with the surd first, which is how Exact sorts its terms.
 */
function segTex(x: Exact): string {
  if (x.terms.length === 2) {
    const [first, second] = x.terms;
    if (first.k === 0 && second.k !== 0) {
      const lead = Exact.fromTerms([second]);
      const tail = Exact.fromTerms([first]);
      return tail.sign() < 0 ? `${lead.toLatex()} - ${tail.abs().toLatex()}` : `${lead.toLatex()} + ${tail.toLatex()}`;
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

const HALF = frac(1, 2).toRat();

// ----------------------------------------------------------------------------- level 1

function convertQ(rng: RNG): Generated | null {
  const toRadians = rng.bool(0.55);
  if (toRadians) {
    const deg = rng.pick(DEGREES);
    const answer = piFrac(deg, 180);
    if (!tidy(answer, 24)) return null;
    const must: Distractor[] = [
      { value: piFrac(180, deg), trap: 'multiplied by 180/θ: the conversion factor is π/180' },
    ];
    const extra: Distractor[] = [
      { value: piFrac(deg, 360), trap: 'divided by 360 instead of 180' },
      { value: frac(deg, 180), trap: 'forgot the factor of π' },
      { value: piFrac(deg, 90), trap: 'divided by 90 instead of 180' },
      { value: piFrac(deg, 60), trap: 'divided by 60 instead of 180' },
      { value: piFrac(deg, 45), trap: 'divided by 45 instead of 180' },
      { value: frac(180, deg), trap: 'inverted the fraction and dropped the π' },
      { value: piFrac(360 - deg, 180), trap: 'converted the reflex angle instead' },
      deg < 180
        ? { value: piFrac(180 - deg, 180), trap: 'converted the supplementary angle instead' }
        : { value: piFrac(deg - 180, 180), trap: 'measured on from the half turn instead of from zero' },
    ];
    // Options may carry the same denominators the answer does (13π/18 needs 13π/36 beside it),
    // otherwise the pool empties for angles like 130° and the builder pads.
    return {
      stem: `Express $${deg}^{\\circ}$ in radians, giving your answer as a multiple of $\\pi$.`,
      answer: { kind: 'exact', value: answer },
      options: buildOptions(rng, answer, balanced(rng, answer, clean(must, undefined, 36), clean(extra, undefined, 36)), {
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
  const must: Distractor[] = [
    { value: frac(180 * a[1], a[0]), trap: 'turned the fraction upside down before multiplying by 180' },
  ];
  const extra: Distractor[] = [
    { value: E(2 * deg), trap: 'multiplied by 360 instead of 180' },
    { value: frac(deg, 2), trap: 'multiplied by 90 instead of 180' },
    { value: E(360 - deg), trap: 'gave the angle measured the other way round the circle' },
    { value: frac(180, a[1]), trap: 'divided 180 by the denominator but never multiplied by the numerator' },
    { value: E(180 * a[0]), trap: 'multiplied by 180 but never divided by the denominator' },
    { value: frac(deg, 4), trap: 'multiplied by 45 instead of 180' },
    deg < 180
      ? { value: E(180 - deg), trap: 'gave the supplementary angle' }
      : { value: E(deg - 180), trap: 'measured on from the half turn instead of from zero' },
  ];
  return {
    stem: `Express $${thetaTex(a)}$ radians in degrees.`,
    answer: { kind: 'exact', value: answer, format: 'decimal' },
    options: buildOptions(rng, answer, balanced(rng, answer, clean(must, degreeLike), clean(extra, degreeLike)), {
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
  const area = E(r * r).mulRat(HALF).mul(theta(a));
  const perimeter = E(2 * r).add(arc);
  // sixths in front of π are still mental (5π/6 cm); the area may not be uglier than quarters
  if (!tidy(arc, 6) || !tidy(area, 4)) return null;
  return { r, a, arc, area, perimeter };
}

function arcQ(rng: RNG): Generated | null {
  const s = drawSector(rng, SECTOR_ANGLES);
  if (!s) return null;
  const { r, a } = s;
  // One of these two is guaranteed a slot, and they sit on opposite sides of rθ: with only the
  // sector area forced, nothing above the answer could ever be the guaranteed trap and the arc was
  // never the largest of the five.
  const must: Distractor[] = [
    { value: s.area, trap: 'used the sector-area formula ½r²θ instead of rθ' },
    { value: E(r).mul(theta(a)).mulRat(HALF), trap: 'halved: ½rθ is not the arc length' },
  ];
  const extra: Distractor[] = [
    { value: E(r * r).mul(theta(a)), trap: 'squared the radius' },
    { value: s.perimeter, trap: 'gave the whole perimeter of the sector' },
    { value: E(2 * r).mul(theta(a)), trap: 'used the diameter instead of the radius' },
    { value: E(2 * r).mul(Exact.pi()), trap: 'gave the circumference of the whole circle' },
    { value: theta(a), trap: 'gave the angle: the radius was never used' },
    { value: theta(a).mulRat(frac(1, r).toRat()), trap: 'divided by the radius instead of multiplying' },
    { value: theta(a).mulRat(2), trap: 'doubled the angle instead of multiplying by the radius' },
    { value: E(r).add(theta(a)), trap: 'added the radius to the angle instead of multiplying' },
    { value: E(r).mul(Exact.pi()), trap: 'used π in place of the angle' },
    { value: E(r).mul(theta(a)).div(Exact.pi().mulRat(2)), trap: 'multiplied by the fraction of a turn θ/2π instead of by θ' },
  ];
  return {
    stem: `A sector of a circle of radius ${r} cm subtends an angle of $${thetaTex(a)}$ radians at the centre.\n\nFind the length of the arc, in cm, leaving your answer in terms of $\\pi$.`,
    answer: { kind: 'exact', value: s.arc },
    options: buildOptions(rng, s.arc, balanced(rng, s.arc, clean(must), clean(extra))),
    solution: `$s = r\\theta = ${r} \\times ${thetaTex(a)} = ${s.arc.toLatex()}$ cm.`,
    trap: 's = rθ only works with θ in radians, and there is no ½ and no squaring.',
    tags: ['trigonometry', 'radians', 'arc-length'],
    params: { variant: 'arc', r, p: a[0], q: a[1] },
    typedAllowed: true,
  };
}

function sectorAreaQ(rng: RNG): Generated | null {
  const s = drawSector(rng, SECTOR_ANGLES);
  if (!s) return null;
  const { r, a } = s;
  // As in arcQ: one of a pair on opposite sides of ½r²θ, so the answer is not kept out of the top
  // slot by a guaranteed overshoot.
  const must: Distractor[] = [
    { value: E(r * r).mul(theta(a)), trap: 'forgot the ½ in ½r²θ' },
    { value: s.arc, trap: 'found the arc length rθ instead of the area' },
  ];
  const extra: Distractor[] = [
    { value: E(r).mul(theta(a)).mulRat(HALF), trap: 'forgot to square the radius' },
    { value: E(r * r).mul(Exact.pi()), trap: 'gave the area of the whole circle' },
    { value: E(r * r).mulRat(frac(1, 4).toRat()).mul(theta(a)), trap: 'halved twice' },
    { value: E(4 * r * r).mulRat(HALF).mul(theta(a)), trap: 'used the diameter in place of the radius' },
    { value: E(r * r).mulRat(HALF), trap: 'forgot to multiply by the angle' },
    { value: theta(a).mulRat(HALF), trap: 'gave ½θ: the radius was never used' },
    { value: s.perimeter, trap: 'gave the perimeter of the sector instead of its area' },
    { value: E(2 * r).mul(Exact.pi()), trap: 'gave the circumference of the whole circle' },
    { value: E(r * r).mul(theta(a)).div(Exact.pi().mulRat(2)), trap: 'multiplied $r^2$ by the fraction of a turn θ/2π instead of using ½r²θ' },
  ];
  return {
    stem: `A sector of a circle of radius ${r} cm subtends an angle of $${thetaTex(a)}$ radians at the centre.\n\nFind the area of the sector, in cm$^2$, leaving your answer in terms of $\\pi$.`,
    answer: { kind: 'exact', value: s.area },
    options: buildOptions(rng, s.area, balanced(rng, s.area, clean(must), clean(extra))),
    solution: `$A = \\tfrac{1}{2}r^2\\theta = \\tfrac{1}{2} \\times ${r * r} \\times ${thetaTex(a)} = ${s.area.toLatex()}$ cm$^2$.`,
    trap: 'Sector area is ½r²θ: keep the ½ and square the radius (the arc length rθ does neither).',
    tags: ['trigonometry', 'radians', 'sector-area'],
    params: { variant: 'sector-area', r, p: a[0], q: a[1] },
    typedAllowed: true,
  };
}

function perimeterQ(rng: RNG): Generated | null {
  const s = drawSector(rng, SECTOR_ANGLES);
  if (!s) return null;
  const { r, a } = s;
  const inDegrees = rng.bool(0.4) && Number.isInteger(degOf(a));
  if (!tidy(s.perimeter, 4)) return null;
  // The whole phrase, maths and unit together: "$60^{\circ}$" or "$\frac{\pi}{3}$ radians".
  const angleTex = inDegrees ? `$${degOf(a)}^{\\circ}$` : `$${thetaTex(a)}$ radians`;
  // Both halves of the pair are headline mistakes and they sit either side of 2r + rθ, so the
  // guaranteed trap is as often above the answer as below it.
  const must: Distractor[] = [
    { value: s.arc, trap: 'gave the arc only: the two straight edges were left out' },
    { value: E(2 * r).add(s.arc.mulRat(2)), trap: 'doubled the arc as well as the radii' },
  ];
  const extra: Distractor[] = [
    { value: E(r).add(s.arc), trap: 'added only one radius' },
    { value: E(2 * r), trap: 'gave the two straight edges only: the arc was left out' },
    { value: E(2 * r).add(theta(a)), trap: 'added the angle instead of the arc length' },
    { value: E(2 * r).add(s.area), trap: 'used the sector area in place of the arc length' },
    { value: E(4 * r).add(s.arc), trap: 'used the diameter for each straight edge' },
    { value: E(2 * r).mul(Exact.pi()).add(E(2 * r)), trap: 'used the whole circumference' },
    { value: E(2 * r).add(E(r).mul(theta(a)).mulRat(HALF)), trap: 'halved the arc length' },
  ];
  return {
    stem: `A sector of a circle of radius ${r} cm subtends an angle of ${angleTex} at the centre.\n\nFind the perimeter of the sector, in cm, leaving your answer in terms of $\\pi$.`,
    answer: { kind: 'exact', value: s.perimeter },
    options: buildOptions(rng, s.perimeter, balanced(rng, s.perimeter, clean(must), clean(extra))),
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
  const sector = E(r * r).mulRat(HALF).mul(theta(a));
  const triangle = E(r * r).mulRat(HALF).mul(sin);
  const circle = E(r * r).mul(Exact.pi());
  const minor = sector.sub(triangle);
  const major = rng.bool(0.35);
  const answer = major ? circle.sub(minor) : minor;
  if (!tidy(answer, 4) || !tidy(sector, 2) || !tidy(triangle, 4)) return null;
  if (answer.terms.length !== 2 || minor.terms.length !== 2) return null;
  // An area is never negative: `sector − 2·triangle` goes negative below about 2.3 radians and
  // was offered in half of these questions, where it is struck out without any trigonometry.
  const positive = (v: Exact) => v.toNumber() > 1e-9;
  const must: Distractor[] = major
    ? [{ value: minor, trap: 'gave the minor segment instead of the major one' }]
    : [{ value: sector, trap: 'gave the sector area: the triangle was never subtracted' }];
  const shared: Distractor[] = [
    { value: sector.add(triangle), trap: 'added the triangle instead of subtracting it' },
    { value: triangle, trap: 'gave the area of the triangle only' },
    { value: sector, trap: major ? 'gave the minor sector' : 'gave the sector area: the triangle was never subtracted' },
    { value: circle.sub(sector), trap: 'gave the major sector: the triangle was never added back' },
    { value: sector.sub(triangle.mulRat(2)), trap: 'forgot the ½ in the triangle area ½r² sin θ' },
    { value: sector.sub(E(r * r).mulRat(HALF).mul(exactCos(deg))), trap: 'used cos θ in place of sin θ' },
    { value: sector.mulRat(2).sub(triangle), trap: 'forgot the ½ in the sector area' },
    { value: sector.sub(E(r).mulRat(HALF).mul(sin)), trap: 'forgot to square the radius in the triangle area' },
    { value: sector.sub(E(r * r).mulRat(HALF)), trap: 'used ½ × r × r for the triangle instead of ½r² sin θ' },
    { value: circle.sub(triangle), trap: 'subtracted the triangle from the whole circle' },
    { value: circle, trap: 'gave the area of the whole circle' },
    // Scale slips, which is what puts candidates on both sides of a segment area: every other
    // mistake in the list overshoots a minor segment and undershoots a major one.
    { value: answer.mulRat(4), trap: 'used the diameter in place of the radius' },
    { value: answer.mulRat(frac(1, 4).toRat()), trap: 'halved the given length, which is already the radius' },
  ];
  const extra: Distractor[] = major
    ? [...shared,
      { value: circle.sub(minor.mulRat(2)), trap: 'subtracted the minor segment twice' },
      { value: circle.sub(minor.mulRat(HALF)), trap: 'halved the minor segment before subtracting it' },
    ]
    : [...shared,
      { value: circle.sub(minor), trap: 'gave the major segment instead of the minor one' },
      { value: answer.mulRat(2), trap: 'left out the ½ in front of $r^2(\\theta - \\sin\\theta)$' },
      { value: answer.mulRat(HALF), trap: 'applied the ½ twice' },
    ];
  const ask = major
    ? `Find the exact area, in cm$^2$, of the major segment cut off by the chord.`
    : `Find the exact area, in cm$^2$, of the minor segment cut off by the chord.`;
  return {
    stem: `A chord of a circle of radius ${r} cm subtends an angle of $${thetaTex(a)}$ radians at the centre.\n\n${ask}`,
    answer: { kind: 'exact', value: answer },
    options: segOptions(buildOptions(rng, answer, balanced(rng, answer, clean(must, positive), clean(extra, positive)))),
    solution: `Sector $= \\tfrac{1}{2}r^2\\theta = ${sector.toLatex()}$ and triangle $= \\tfrac{1}{2}r^2\\sin\\theta = \\tfrac{1}{2} \\times ${r * r} \\times ${sin.toLatex()} = ${triangle.toLatex()}$, so the minor segment is $${segTex(minor)}$ cm$^2$`
      + (major ? ` and the major segment is $${circle.toLatex()} - \\left(${segTex(minor)}\\right) = ${segTex(answer)}$ cm$^2$.` : '.'),
    trap: major
      ? 'Major segment = whole circle − minor segment, and the minor segment is sector − triangle (½r² sin θ).'
      : 'Segment = sector − triangle, and the triangle is ½r² sin θ (not ½ base × height with the radius).',
    tags: ['trigonometry', 'radians', 'segment'],
    params: { variant: 'segment', r, p: a[0], q: a[1], major },
    typedAllowed: true,
  };
}

function findAngleQ(rng: RNG): Generated | null {
  const r = rng.pick(RADII);
  const a = rng.pick(SMALL_ANGLES);
  const fromArc = rng.bool(0.55);
  const inDegrees = rng.bool(0.4);
  const arc = E(r).mul(theta(a));
  const area = E(r * r).mulRat(HALF).mul(theta(a));
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
  const half = answer.mulRat(HALF);
  const twice = answer.mulRat(2);
  const pool: Distractor[] = [];
  const push = (value: Exact, trap: string) => { if (possible(value)) pool.push({ value, trap }); };
  const headline: Distractor = fromArc
    ? { value: half, trap: 'divided by the diameter 2r instead of by the radius r' }
    : { value: half, trap: 'forgot the ½: used θ = A/r² instead of θ = 2A/r²' };
  if (fromArc) {
    push(twice, 'brought in the factor of 2 that only the area formula has');
    push(answer.mulRat(frac(2, r).toRat()), 'used θ = 2A/r², the area formula, with the arc length');
    push(answer.mulRat(frac(1, r).toRat()), 'divided by the radius twice: used θ = s/r²');
    push(answer.mulRat(frac(r, r + 1).toRat()), `arithmetic slip: divided by ${r + 1} instead of ${r}`);
    push(answer.mulRat(frac(r, r - 1).toRat()), `arithmetic slip: divided by ${r - 1} instead of ${r}`);
  } else {
    push(twice, 'doubled again after already using θ = 2A/r²');
    push(answer.mulRat(frac(1, 4).toRat()), 'used the diameter in place of the radius: θ = 2A/d²');
    push(answer.mulRat(frac(r, 2).toRat()), 'used θ = s/r, the arc formula, with the area');
    push(answer.mulRat(4), 'doubled twice over');
    push(answer.mulRat(frac(1, r).toRat()), 'divided by the radius once too often: θ = 2A/r³');
  }
  push(answer.mulRat(r), 'multiplied by the radius instead of dividing by it');
  push(inDegrees ? E(180 - deg) : Exact.pi().sub(theta(a)), 'gave the angle on the other side of the diameter');
  /**
   * The unit slip is the mistake on trial, but it is also the one option whose *shape* differs
   * from the rest (a bare number among multiples of π, or the reverse), so offering it in every
   * question handed the candidate a free elimination. It appears in about half of them.
   */
  const unitSlip: Distractor = { value: inDegrees ? theta(a) : E(deg), trap: inDegrees ? 'left the answer in radians' : 'gave the angle in degrees rather than radians' };
  const reflexValue = inDegrees ? E(360 - deg) : Exact.pi().mulRat(2).sub(theta(a));
  // The guaranteed trap is drawn from the three headline mistakes, one of which (halving) is below
  // the answer and two above, so the answer is not pinned just off the bottom of the sorted list.
  const heads: Distractor[] = [headline];
  if (possible(reflexValue)) heads.push({ value: reflexValue, trap: 'gave the reflex angle' });
  if (rng.bool(0.5)) heads.push(unitSlip);
  const must = [rng.pick(heads)];
  const extra = [...heads.filter((h) => h !== must[0]), ...pool];
  const question = inDegrees
    ? 'Find the angle of the sector, in degrees.'
    : 'Find the angle of the sector, in radians, in terms of $\\pi$.';
  return {
    stem: fromArc
      ? `The arc of a sector of a circle of radius ${r} cm has length $${arc.toLatex()}$ cm.\n\n${question}`
      : `A sector of a circle of radius ${r} cm has area $${area.toLatex()}$ cm$^2$.\n\n${question}`,
    answer: { kind: 'exact', value: answer, format: inDegrees ? 'decimal' : 'auto' },
    options: buildOptions(rng, answer, balanced(rng, answer, clean(must), clean(extra)), inDegrees ? { format: 'decimal' } : {}),
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
    5: 'segment area ½r²(θ − sin θ) → 6π − 9√3 (minor or major), or the angle from an arc or an area',
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
      case 'segment': {
        const small = 0.5 * r * r * (th - Math.sin(th));
        return close(p.major ? Math.PI * r * r - small : small);
      }
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
