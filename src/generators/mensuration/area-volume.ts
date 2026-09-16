import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, piFrac, Exact } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import type { RNG } from '../../core/rng';

/**
 * Areas and volumes with π left in the answer.
 * Level 1: area and circumference of a circle, and the area of a semicircle / quarter circle
 * Level 2: sector area and arc length for 30°, 45°, 60°, 90°, 120° …
 * Level 3: volumes of a cylinder, a cone and a sphere (no formula sheet in the ESAT)
 * Level 4: surface areas, and a composite shape whose area is a + kπ
 * Level 5: reverse (given the volume find the radius), a composite solid, a ratio of volumes
 */

/** (num/den)·π */
const PI = (num: number, den = 1): Exact => piFrac(num, den);

function clean(x: Exact): boolean {
  return Number.isFinite(x.toNumber()) && isCleanExact(x).ok;
}

interface Cand {
  value: Exact | null;
  trap: string;
}

/**
 * Keep the candidates that are exam-plausible *options* for this particular answer.
 *
 * Every quantity here is a positive length, area or volume, so a negative option is eliminated
 * on sight. Two further rules matter for this template:
 *
 *  - when the answer is a whole number (the reverse questions, where the answer is a length in
 *    cm), a vulgar fraction such as 256/3 is eliminated on sight too, so it is dropped;
 *  - `maxFactor` bounds how far an option may sit from the answer. The sector questions use it
 *    to kill the "360/θ upside down" candidate, which is (360/θ)² times the answer and reaches
 *    1440× for a 30° sector.
 *
 * Returning null makes the caller draw new parameters, so buildOptions is never left padding the
 * list with unlabelled perturbations.
 */
function usable(rng: RNG, answer: Exact, cands: Cand[], maxFactor = Infinity, need = 4): Distractor[] | null {
  const seen: Exact[] = [answer];
  const pool: Distractor[] = [];
  const a = answer.toNumber();
  const wholeAnswer = answer.isInteger();
  for (const c of cands) {
    const v = c.value;
    if (v === null || !clean(v) || v.toNumber() <= 0) continue;
    if (wholeAnswer && !v.isInteger()) continue;
    if (seen.some((s) => s.equals(v))) continue;
    if (Math.abs(a) > 0 && Number.isFinite(maxFactor)) {
      const x = Math.abs(v.toNumber());
      if (x > maxFactor * Math.abs(a) || maxFactor * x < Math.abs(a)) continue;
    }
    seen.push(v);
    pool.push({ value: v, trap: c.trap });
  }
  if (pool.length < need) return null;
  // Choose how many of the options sit above the answer, so that once the five are sorted the
  // answer's place is roughly uniform: otherwise a tight magnitude window leaves it in the
  // middle of the list and "pick the middle option" beats guessing.
  const hi = rng.shuffle(pool.filter((d) => d.value.toNumber() > a));
  const lo = rng.shuffle(pool.filter((d) => d.value.toNumber() < a));
  if (hi.length + lo.length < need) return null;
  const j = rng.int(Math.max(0, need - lo.length), Math.min(hi.length, need));
  return [...hi.slice(0, j), ...lo.slice(0, need - j)];
}

/** Lopsided "slipped when undoing the power" offsets, so the answer is not always the middle option. */
function slips(rng: RNG, base: number, trap: string): Cand[] {
  const set = rng.pick([[1, 2], [-1, 1], [-2, -1], [-1, 2], [1, 3], [-3, -1]]);
  return set.map((o) => ({ value: base + o > 0 ? E(base + o) : null, trap }));
}

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

const LEAVE_PI = 'Give your answer in terms of $\\pi$.';

// ----------------------------------------------------------------------------- level 1

function circleQ(rng: RNG): Generated | null {
  const r = rng.int(3, 20);
  const byDiameter = rng.bool(0.45);
  const given = byDiameter ? 2 * r : r;
  const wantArea = rng.bool(0.55);
  const area = PI(r * r), circ = PI(2 * r);
  const answer = wantArea ? area : circ;
  if (!clean(answer)) return null;
  // Every option carries a π: the stem asks for the answer in terms of π, so a π-free option
  // would be crossed out without doing any of the geometry.
  const distractors = usable(rng, answer, wantArea
    ? [
        { value: circ, trap: 'found the circumference 2πr instead of the area' },
        { value: PI(4 * r * r), trap: byDiameter ? 'used the diameter in πr²' : 'used the diameter instead of the radius' },
        { value: PI(r), trap: 'forgot to square the radius' },
        { value: PI(r * r, 2), trap: 'halved the area, as if it were a semicircle' },
        { value: PI(2 * r * r), trap: 'doubled πr²' },
        { value: PI(r * r, 4), trap: byDiameter ? 'halved the diameter twice' : 'halved the radius, as if the number given were a diameter' },
      ]
    : [
        { value: area, trap: 'found the area πr² instead of the circumference' },
        { value: PI(r), trap: 'used πr: forgot the factor of 2 (or used the radius in πd)' },
        { value: PI(4 * r), trap: 'used the diameter in 2πr' },
        { value: PI(r * r, 2), trap: 'used half the area formula' },
        { value: PI(r * r * 2), trap: 'doubled the area instead' },
        { value: PI(r, 2), trap: byDiameter ? 'halved the diameter twice' : 'used πr/2' },
      ], 10);
  if (!distractors) return null;
  const noun = byDiameter ? 'diameter' : 'radius';
  return {
    stem: `A circle has ${noun} $${given}$ cm. Find its ${wantArea ? 'area, in $\\text{cm}^{2}$' : 'circumference, in cm'}. ${LEAVE_PI}`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: wantArea
      ? `${byDiameter ? `The radius is $${r}$ cm, so the ` : 'The '}area is $\\pi r^{2} = \\pi \\times ${r}^{2} = ${area.toLatex()}$.`
      : `${byDiameter ? `The radius is $${r}$ cm, so the ` : 'The '}circumference is $2\\pi r = ${circ.toLatex()}$.`,
    trap: 'Halve a diameter before using it, and keep πr² (area) apart from 2πr (circumference).',
    tags: ['mensuration', 'circle', 'pi'],
    params: { variant: 'circle', r, byDiameter, wantArea },
    typedAllowed: true,
  };
}

/** Area of a semicircle or a quarter circle — the other standard GCSE warm-up. */
function halfCircleQ(rng: RNG): Generated | null {
  const r = rng.int(3, 20);
  const quarter = rng.bool(0.4);
  const den = quarter ? 4 : 2;
  const answer = PI(r * r, den);
  if (!clean(answer)) return null;
  const distractors = usable(rng, answer, [
    { value: PI(r * r), trap: 'found the area of the whole circle' },
    { value: PI(r * r, quarter ? 2 : 4), trap: quarter ? 'halved the circle instead of quartering it' : 'quartered the circle instead of halving it' },
    { value: PI(2 * r, den), trap: 'used 2πr, the circumference, instead of πr²' },
    { value: PI(4 * r * r, den), trap: 'used the diameter in πr²' },
    { value: PI(r, den), trap: 'forgot to square the radius' },
    { value: PI(r * r, den * 2), trap: 'divided by the fraction one time too many' },
  ], 12);
  if (!distractors) return null;
  return {
    stem: `A ${quarter ? 'quarter circle' : 'semicircle'} has radius $${r}$ cm. Find its area, in $\\text{cm}^{2}$. ${LEAVE_PI}`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `It is $\\frac{1}{${den}}$ of a circle of radius $${r}$: $\\frac{1}{${den}} \\times \\pi \\times ${r * r} = ${answer.toLatex()}$.`,
    trap: 'A semicircle is half a circle of the same radius, a quarter circle a quarter — the radius itself is not halved.',
    tags: ['mensuration', 'circle', 'pi'],
    params: { variant: 'half-circle', r, den },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 2

const SECTOR_ANGLES = [30, 45, 60, 90, 120, 135, 150, 180, 270];

function sectorQ(rng: RNG): Generated | null {
  const th = rng.pick(SECTOR_ANGLES);
  // a 30° sector of a big circle makes the "whole circle" and "forgot to square r" traps sit far
  // apart in size, so keep the radius modest when the angle is small
  const r = rng.int(2, th < 60 ? 9 : 12);
  const wantArea = rng.bool(0.55);
  const area = PI(th * r * r, 360), arc = PI(2 * th * r, 360);
  const answer = wantArea ? area : arc;
  if (!clean(answer)) return null;
  const distractors = usable(rng, answer, wantArea
    ? [
        { value: arc, trap: 'found the arc length instead of the area' },
        { value: PI(r * r), trap: 'found the area of the whole circle' },
        { value: PI(th * r, 360), trap: 'forgot to square the radius' },
        { value: PI(th * r * r, 180), trap: 'used θ/180 instead of θ/360' },
        { value: PI((360 - th) * r * r, 360), trap: 'found the major sector, the rest of the circle' },
        { value: PI(360 * r * r, th), trap: 'used 360/θ instead of θ/360' },
        { value: PI(th * r * r, 720), trap: 'halved the sector area' },
      ]
    : [
        { value: area, trap: 'found the sector area instead of the arc length' },
        { value: PI(th * r, 360), trap: 'used πr instead of 2πr for the whole circumference' },
        { value: PI(2 * r), trap: 'found the whole circumference' },
        { value: PI(2 * th * r * r, 360), trap: 'squared the radius, as in the area formula' },
        { value: PI((360 - th) * 2 * r, 360), trap: 'found the major arc, the rest of the circumference' },
        { value: PI(360 * 2 * r, th), trap: 'used 360/θ instead of θ/360' },
        { value: PI(4 * th * r, 360), trap: 'doubled the arc length' },
      ], 6);
  if (!distractors) return null;
  return {
    stem: `A sector of a circle of radius $${r}$ cm has angle $${th}^{\\circ}$ at the centre. Find ${wantArea ? `its area, in $\\text{cm}^{2}$` : 'the length of its arc, in cm'}. ${LEAVE_PI}`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `The sector is $\\frac{${th}}{360} = ${frac(th, 360).toLatex()}$ of the circle, so ${wantArea
      ? `its area is $${frac(th, 360).toLatex()} \\times \\pi \\times ${r}^{2} = ${area.toLatex()}$`
      : `its arc is $${frac(th, 360).toLatex()} \\times 2\\pi \\times ${r} = ${arc.toLatex()}$`}.`,
    trap: 'The fraction of the circle is θ/360, and arc length uses 2πr while area uses πr².',
    tags: ['mensuration', 'sector', 'pi'],
    params: { variant: 'sector', th, r, wantArea },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 3

function solidVolumeQ(rng: RNG): Generated | null {
  const shape = rng.pick(['cylinder', 'cone', 'sphere'] as const);
  const byDiameter = rng.bool(0.3);
  let r: number, h = 0, answer: Exact, cands: Cand[], solution: string;
  if (shape === 'cylinder') {
    r = rng.int(2, 10);
    h = rng.int(2, 12);
    answer = PI(r * r * h);
    cands = [
      { value: PI(r * r * h, 3), trap: 'used the cone formula ⅓πr²h' },
      { value: PI(2 * r * h), trap: 'found the curved surface area 2πrh' },
      { value: PI(4 * r * r * h), trap: 'used the diameter as the radius' },
      { value: PI(r * h), trap: 'forgot to square the radius' },
      { value: PI(r * r * h, 2), trap: 'halved the volume' },
      { value: PI(2 * r * r + 2 * r * h), trap: 'found the total surface area instead' },
    ];
    solution = `$V = \\pi r^{2}h = \\pi \\times ${r}^{2} \\times ${h} = ${answer.toLatex()}$.`;
  } else if (shape === 'cone') {
    r = rng.int(2, 9);
    h = rng.pick([3, 6, 9, 12, 15]);
    answer = PI(r * r * h, 3);
    cands = [
      { value: PI(r * r * h), trap: 'forgot the factor of ⅓ (that is the cylinder)' },
      { value: PI(4 * r * r * h, 3), trap: 'used the diameter as the radius' },
      { value: PI(r * h, 3), trap: 'forgot to square the radius' },
      { value: PI(2 * r * r * h, 3), trap: 'used ⅔ instead of ⅓' },
      { value: PI(r * r * h, 6), trap: 'divided by 6 instead of 3' },
      { value: PI(r * r * h, 9), trap: 'divided by 3 twice' },
    ];
    solution = `$V = \\frac{1}{3}\\pi r^{2}h = \\frac{1}{3}\\pi \\times ${r * r} \\times ${h} = ${answer.toLatex()}$.`;
  } else {
    r = rng.pick([2, 3, 4, 5, 6, 9]);
    answer = PI(4 * r * r * r, 3);
    cands = [
      { value: PI(4 * r * r * r), trap: 'forgot to divide by 3' },
      { value: PI(4 * r * r, 3), trap: 'used r² instead of r³' },
      { value: PI(4 * r * r), trap: 'found the surface area 4πr²' },
      { value: PI(2 * r * r * r, 3), trap: 'used the hemisphere volume' },
      { value: PI(32 * r * r * r, 3), trap: 'used the diameter as the radius' },
      { value: PI(3 * r * r * r, 4), trap: 'multiplied by ¾ instead of by 4/3' },
    ];
    solution = `$V = \\frac{4}{3}\\pi r^{3} = \\frac{4}{3}\\pi \\times ${r * r * r} = ${answer.toLatex()}$.`;
  }
  if (!clean(answer)) return null;
  const distractors = usable(rng, answer, cands);
  if (!distractors) return null;
  const given = byDiameter ? `diameter $${2 * r}$ cm` : `radius $${r}$ cm`;
  const body = shape === 'cylinder'
    ? `A solid cylinder has ${given} and height $${h}$ cm.`
    : shape === 'cone'
      ? `A solid cone has base ${given} and vertical height $${h}$ cm.`
      : `A sphere has ${given}.`;
  return {
    stem: `${body} Find its volume, in $\\text{cm}^{3}$. ${LEAVE_PI}`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `${byDiameter ? `The radius is $${r}$ cm. ` : ''}${solution}`,
    trap: 'A cone is a third of the cylinder around it, and a sphere uses r³ — and a diameter must be halved first.',
    tags: ['mensuration', 'volume', 'pi'],
    params: { variant: `volume-${shape}`, r, h, byDiameter },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 4

function surfaceAreaQ(rng: RNG): Generated | null {
  const shape = rng.pick(['sphere', 'cylinder', 'hemisphere'] as const);
  let r: number, h = 0, answer: Exact, cands: Cand[], solution: string, body: string;
  if (shape === 'sphere') {
    r = rng.int(2, 12);
    answer = PI(4 * r * r);
    cands = [
      { value: PI(4 * r * r * r, 3), trap: 'found the volume instead of the surface area' },
      { value: PI(r * r), trap: 'used πr², the area of a circle' },
      { value: PI(2 * r * r), trap: 'used 2πr²: that is a curved hemisphere' },
      { value: PI(16 * r * r), trap: 'used the diameter as the radius' },
      { value: PI(4 * r), trap: 'forgot to square the radius' },
    ];
    solution = `$A = 4\\pi r^{2} = 4\\pi \\times ${r * r} = ${answer.toLatex()}$.`;
    body = `A sphere has radius $${r}$ cm.`;
  } else if (shape === 'cylinder') {
    r = rng.int(2, 9);
    h = rng.int(2, 12);
    answer = PI(2 * r * r + 2 * r * h);
    cands = [
      { value: PI(2 * r * h), trap: 'gave the curved surface only, with no ends' },
      { value: PI(r * r + 2 * r * h), trap: 'counted only one circular end' },
      { value: PI(r * r * h), trap: 'found the volume instead' },
      { value: PI(2 * r * r + r * h), trap: 'used πrh for the curved surface' },
      { value: PI(4 * r * r + 2 * r * h), trap: 'used the diameter in the ends' },
    ];
    solution = `Two ends and a curved surface: $2\\pi r^{2} + 2\\pi r h = ${2 * r * r}\\pi + ${2 * r * h}\\pi = ${answer.toLatex()}$.`;
    body = `A closed solid cylinder has radius $${r}$ cm and height $${h}$ cm.`;
  } else {
    r = rng.int(2, 12);
    answer = PI(3 * r * r);
    cands = [
      { value: PI(2 * r * r), trap: 'forgot the flat circular face' },
      { value: PI(4 * r * r), trap: 'used the whole sphere' },
      { value: PI(r * r), trap: 'gave only the flat face' },
      { value: PI(2 * r * r * r, 3), trap: 'found the volume instead' },
      { value: PI(6 * r * r), trap: 'doubled the curved surface and added the face twice' },
    ];
    solution = `Curved surface $2\\pi r^{2}$ plus the flat face $\\pi r^{2}$: $${answer.toLatex()}$.`;
    body = `A solid hemisphere has radius $${r}$ cm.`;
  }
  if (!clean(answer)) return null;
  const distractors = usable(rng, answer, cands);
  if (!distractors) return null;
  return {
    stem: `${body} Find its total surface area, in $\\text{cm}^{2}$. ${LEAVE_PI}`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution,
    trap: 'A closed solid needs every face: a hemisphere has its flat circle, a cylinder has two.',
    tags: ['mensuration', 'surface-area', 'pi'],
    params: { variant: `surface-${shape}`, r, h },
    typedAllowed: true,
  };
}

function compositeAreaQ(rng: RNG): Generated | null {
  const w = rng.pick([4, 6, 8, 10, 12]);
  const h = rng.int(3, 12);
  const wantPerimeter = rng.bool(0.4);
  const area = E(w * h).add(PI(w * w, 8));
  const perim = E(w + 2 * h).add(PI(w, 2));
  const answer = wantPerimeter ? perim : area;
  if (!clean(answer)) return null;
  const distractors = usable(rng, answer, wantPerimeter
    ? [
        { value: E(2 * w + 2 * h).add(PI(w, 2)), trap: 'counted the top of the rectangle as well as the arc' },
        { value: E(w + 2 * h).add(PI(w)), trap: 'used πd for the semicircular arc instead of πd/2' },
        { value: E(w + 2 * h).add(PI(w, 4)), trap: 'halved the arc one time too many' },
        { value: E(w * h).add(PI(w * w, 8)), trap: 'found the area instead of the perimeter' },
        { value: E(w + 2 * h).add(PI(w * w, 8)), trap: 'added the semicircle’s area to the straight edges' },
      ]
    : [
        { value: E(w * h).add(PI(w * w, 4)), trap: 'used the whole circle of radius w/2' },
        { value: E(w * h).add(PI(w * w, 2)), trap: 'used the diameter as the radius, then halved' },
        { value: E(w * h).add(PI(w, 2)), trap: 'added the arc length instead of the semicircle’s area' },
        { value: PI(w * w, 8), trap: 'forgot the rectangle' },
        { value: E(w * h).sub(PI(w * w, 8)), trap: 'subtracted the semicircle instead of adding it' },
        { value: E(w + 2 * h).add(PI(w, 2)), trap: 'found the perimeter instead of the area' },
      ], 12);
  if (!distractors) return null;
  return {
    stem: `A shape is made from a rectangle $${w}$ cm wide and $${h}$ cm high with a semicircle of diameter $${w}$ cm sitting on top of it (the diameter lies along the top of the rectangle).\n\nFind ${wantPerimeter ? 'the perimeter of the shape, in cm' : `the area of the shape, in $\\text{cm}^{2}$`}. ${LEAVE_PI}`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: wantPerimeter
      ? `The perimeter is the two sides, the base and the arc: $2 \\times ${h} + ${w} + \\frac{1}{2}\\pi \\times ${w} = ${perim.toLatex()}$.`
      : `Rectangle $${w} \\times ${h} = ${w * h}$, semicircle $\\frac{1}{2}\\pi \\times ${w / 2}^{2} = ${PI(w * w, 8).toLatex()}$, total $${area.toLatex()}$.`,
    trap: wantPerimeter
      ? 'The curved edge is an arc of length ½πd, and the diameter itself is not part of the perimeter.'
      : 'The semicircle has radius w/2, so its area is ½π(w/2)² — half the circle of radius w/2, not of radius w.',
    tags: ['mensuration', 'composite', 'pi'],
    params: { variant: 'composite-area', w, h, wantPerimeter },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 5

function reverseQ(rng: RNG): Generated | null {
  const shape = rng.pick(['sphere', 'cylinder', 'cone'] as const);
  const r = rng.int(2, 9);
  const h = rng.pick([3, 4, 6, 8, 9, 12]);
  let V: Exact, answer: Exact, solution: string, body: string, cands: Cand[];
  if (shape === 'sphere') {
    V = PI(4 * r * r * r, 3);
    answer = E(r);
    cands = [
      { value: E(r * r * r), trap: 'stopped at r³ without taking the cube root' },
      { value: E(2 * r), trap: 'gave the diameter' },
      { value: frac(4 * r * r * r, 3), trap: 'forgot to undo the 4/3 and the cube' },
      { value: frac(3 * r * r * r, 4), trap: 'multiplied by 3/4 instead of dividing by 4/3' },
      ...slips(rng, r, 'cube-root slip'),
    ];
    solution = `$\\frac{4}{3}\\pi r^{3} = ${V.toLatex()}$ gives $r^{3} = ${r * r * r}$, so $r = ${r}$.`;
    body = `A sphere has volume $${V.toLatex()}\\ \\text{cm}^{3}$.`;
  } else if (shape === 'cylinder') {
    V = PI(r * r * h);
    answer = E(r);
    cands = [
      { value: E(r * r), trap: 'stopped at r² without taking the square root' },
      { value: E(2 * r), trap: 'gave the diameter' },
      { value: E(r * r * h), trap: 'forgot to divide by the height as well' },
      { value: frac(r * r, 2), trap: 'halved r² instead of square-rooting it' },
      ...slips(rng, r, 'square-root slip'),
    ];
    solution = `$\\pi r^{2}h = ${V.toLatex()}$ gives $r^{2} = \\frac{${r * r * h}}{${h}} = ${r * r}$, so $r = ${r}$.`;
    body = `A cylinder of height $${h}$ cm has volume $${V.toLatex()}\\ \\text{cm}^{3}$.`;
  } else {
    V = PI(r * r * h, 3);
    answer = E(h);
    cands = [
      { value: E(3 * h), trap: 'forgot the factor of ⅓ when rearranging' },
      { value: frac(h, 3), trap: 'divided by 3 instead of multiplying' },
      { value: E(r), trap: 'gave the radius' },
      { value: frac(r * r * h, 3 * r), trap: 'divided by r instead of r²' },
      ...slips(rng, h, 'arithmetic slip'),
    ];
    solution = `$\\frac{1}{3}\\pi r^{2}h = ${V.toLatex()}$ gives $h = \\frac{3 \\times ${(r * r * h) / 3}}{${r * r}} = ${h}$.`;
    body = `A cone of base radius $${r}$ cm has volume $${V.toLatex()}\\ \\text{cm}^{3}$.`;
  }
  if (!clean(V) || !clean(answer) || (shape === 'cone' && (r * r * h) % 3 !== 0)) return null;
  const distractors = usable(rng, answer, cands);
  if (!distractors) return null;
  return {
    stem: `${body} Find ${shape === 'cone' ? 'its vertical height' : 'its radius'}, in cm.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution,
    trap: 'Divide out the π first, then undo the fraction and the power — one step at a time.',
    tags: ['mensuration', 'volume', 'reverse'],
    // V is the number the stem prints; verify() puts the answer back into the formula to reach it
    params: { variant: `reverse-${shape}`, r, h, V: V.toNumber() },
    typedAllowed: true,
  };
}

function compositeVolumeQ(rng: RNG): Generated | null {
  const r = rng.pick([3, 6, 9, 2, 4, 5]);
  const h = rng.int(2, 12);
  const answer = PI(2 * r * r * r, 3).add(PI(r * r * h));
  if (!clean(answer)) return null;
  const distractors = usable(rng, answer, [
    { value: PI(4 * r * r * r, 3).add(PI(r * r * h)), trap: 'added a whole sphere instead of a hemisphere' },
    { value: PI(r * r * r, 3).add(PI(r * r * h)), trap: 'used ⅓πr³ for the hemisphere' },
    { value: PI(2 * r * r * r, 3).add(PI(r * r * h, 3)), trap: 'used the cone formula for the cylinder' },
    { value: PI(r * r * h), trap: 'forgot the hemisphere' },
    { value: PI(2 * r * r * r, 3), trap: 'forgot the cylinder' },
    { value: PI(2 * r * r, 3).add(PI(r * r * h)), trap: 'used r² instead of r³ in the hemisphere' },
  ]);
  if (!distractors) return null;
  return {
    stem: `A solid is made from a cylinder of radius $${r}$ cm and height $${h}$ cm with a hemisphere of radius $${r}$ cm fixed to one flat end. Find the total volume, in $\\text{cm}^{3}$. ${LEAVE_PI}`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `Cylinder $\\pi \\times ${r * r} \\times ${h} = ${PI(r * r * h).toLatex()}$; hemisphere $\\frac{2}{3}\\pi \\times ${r * r * r} = ${PI(2 * r * r * r, 3).toLatex()}$; total $${answer.toLatex()}$.`,
    trap: 'A hemisphere is ⅔πr³ — half of ⁴⁄₃πr³, not a third of it.',
    tags: ['mensuration', 'volume', 'composite'],
    params: { variant: 'composite-volume', r, h },
    typedAllowed: true,
  };
}

function ratioQ(rng: RNG): Generated | null {
  const r = rng.int(2, 9);
  const h = rng.int(2, 12);
  const against = rng.pick(['cylinder', 'cone'] as const);
  // sphere volume ÷ (cylinder or cone) volume, both of radius r
  const answer = against === 'cylinder' ? frac(4 * r, 3 * h) : frac(4 * r, h);
  if (!clean(answer)) return null;
  const distractors = usable(rng, answer, [
    { value: against === 'cylinder' ? frac(3 * h, 4 * r) : frac(h, 4 * r), trap: 'divided the wrong way round' },
    { value: against === 'cylinder' ? frac(4 * r, h) : frac(4 * r, 3 * h), trap: 'mixed up the cone and cylinder formulas (a factor of 3)' },
    { value: frac(4 * r * r, 3 * h), trap: 'cancelled r³ against r² wrongly' },
    { value: frac(r, h), trap: 'forgot the 4/3' },
    { value: against === 'cylinder' ? frac(4 * r, 9 * h) : frac(4 * r, 3 * h * 3), trap: 'divided by 3 twice' },
    { value: against === 'cylinder' ? frac(4 * r * r, 3 * h * h) : frac(4 * r * r, h * h), trap: 'squared the leftover ratio' },
  ]);
  if (!distractors) return null;
  return {
    stem: `A sphere of radius $${r}$ cm and a ${against} of radius $${r}$ cm and height $${h}$ cm are made of the same material.\n\nFind the value of $\\dfrac{\\text{volume of the sphere}}{\\text{volume of the ${against}}}$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors, { format: 'fraction' }),
    solution: `Cancel $\\pi r^{2}$: $\\frac{4}{3}\\pi r^{3} \\div ${against === 'cylinder' ? '\\pi r^{2}h' : '\\frac{1}{3}\\pi r^{2}h'} = ${against === 'cylinder' ? '\\frac{4r}{3h}' : '\\frac{4r}{h}'} = ${answer.toLatex({ format: 'fraction' })}$.`,
    trap: 'Cancel πr² from both volumes first; only the leftover r, h and the fractions matter.',
    tags: ['mensuration', 'volume', 'ratio'],
    params: { variant: `ratio-${against}`, r, h },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'm1.mensuration.area-volume',
  module: 'M1',
  topic: 'mensuration',
  title: 'Areas and volumes with π',
  levels: {
    1: 'circle area and circumference, and the area of a semicircle or quarter circle',
    2: 'sector area and arc length for 30°, 45°, 60°, 90°, 120° …',
    3: 'volumes of a cylinder, a cone and a sphere',
    4: 'surface areas (sphere, closed cylinder, hemisphere) and a rectangle with a semicircle on top',
    5: 'given the volume find a length; a cylinder with a hemisphere on top; a ratio of volumes',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return pickVariant(rng, [circleQ, circleQ, halfCircleQ]);
        case 2: return sectorQ(rng);
        case 3: return solidVolumeQ(rng);
        case 4: return pickVariant(rng, [surfaceAreaQ, compositeAreaQ]);
        default: return pickVariant(rng, [reverseQ, compositeVolumeQ, ratioQ]);
      }
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const p = q.params as { variant: string; r: number; h: number; th?: number; w?: number; den?: number; V?: number; byDiameter?: boolean; wantArea?: boolean; wantPerimeter?: boolean };
    const got = q.answer.value.toNumber();
    const P = Math.PI;
    const close = (x: number) => Math.abs(got - x) <= 1e-9 * Math.max(1, Math.abs(x));
    // the reverse questions are checked by substituting the answer back into the formula and
    // reproducing the volume the stem actually prints
    const gives = (v: number) => Math.abs(v - p.V!) <= 1e-9 * Math.max(1, Math.abs(p.V!));
    switch (p.variant) {
      case 'circle':
        return close(p.wantArea ? P * p.r ** 2 : 2 * P * p.r);
      case 'half-circle':
        return close((P * p.r ** 2) / p.den!);
      case 'sector': {
        const f = p.th! / 360;
        return close(p.wantArea ? f * P * p.r ** 2 : f * 2 * P * p.r);
      }
      case 'volume-cylinder':
        return close(P * p.r ** 2 * p.h);
      case 'volume-cone':
        return close((P * p.r ** 2 * p.h) / 3);
      case 'volume-sphere':
        return close((4 / 3) * P * p.r ** 3);
      case 'surface-sphere':
        return close(4 * P * p.r ** 2);
      case 'surface-cylinder':
        return close(2 * P * p.r ** 2 + 2 * P * p.r * p.h);
      case 'surface-hemisphere':
        return close(2 * P * p.r ** 2 + P * p.r ** 2);
      case 'composite-area':
        return close(p.wantPerimeter
          ? 2 * p.h + p.w! + P * (p.w! / 2)
          : p.w! * p.h + 0.5 * P * (p.w! / 2) ** 2);
      case 'reverse-sphere':
        return got > 0 && gives((4 / 3) * P * got ** 3);
      case 'reverse-cylinder':
        return got > 0 && gives(P * got ** 2 * p.h);
      case 'reverse-cone':
        return got > 0 && gives((P * p.r ** 2 * got) / 3);
      case 'composite-volume':
        return close((2 / 3) * P * p.r ** 3 + P * p.r ** 2 * p.h);
      case 'ratio-cylinder':
        return close(((4 / 3) * P * p.r ** 3) / (P * p.r ** 2 * p.h));
      case 'ratio-cone':
        return close(((4 / 3) * P * p.r ** 3) / ((P * p.r ** 2 * p.h) / 3));
      default:
        return false;
    }
  },
});
