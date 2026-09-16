import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, piFrac, Exact } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import type { RNG } from '../../core/rng';

/**
 * Areas and volumes with π left in the answer.
 * Level 1: area and circumference of a circle from its radius or diameter
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

function cleanOnly(ds: { value: Exact | null; trap: string }[]): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } => d.value !== null && clean(d.value));
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
  const r = rng.int(2, 12);
  const byDiameter = rng.bool(0.45);
  const given = byDiameter ? 2 * r : r;
  const wantArea = rng.bool(0.55);
  const area = PI(r * r), circ = PI(2 * r);
  const answer = wantArea ? area : circ;
  if (!clean(answer)) return null;
  const distractors = cleanOnly(wantArea
    ? [
        { value: circ, trap: 'found the circumference 2πr instead of the area' },
        { value: PI(4 * r * r), trap: byDiameter ? 'used the diameter in πr²' : 'used the diameter instead of the radius' },
        { value: PI(r), trap: 'forgot to square the radius' },
        { value: PI(r * r, 2), trap: 'halved the area, as if it were a semicircle' },
        { value: PI(2 * r * r), trap: 'doubled πr²' },
        { value: E(r * r), trap: 'left out the π' },
      ]
    : [
        { value: area, trap: 'found the area πr² instead of the circumference' },
        { value: PI(r), trap: 'used πr: forgot the factor of 2 (or used the radius in πd)' },
        { value: PI(4 * r), trap: 'used the diameter in 2πr' },
        { value: PI(r * r, 2), trap: 'used half the area formula' },
        { value: E(2 * r), trap: 'left out the π' },
        { value: PI(r * r * 2), trap: 'doubled the area instead' },
      ]);
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

// ----------------------------------------------------------------------------- level 2

const SECTOR_ANGLES = [30, 45, 60, 90, 120, 135, 150, 180, 270];

function sectorQ(rng: RNG): Generated | null {
  const th = rng.pick(SECTOR_ANGLES);
  const r = rng.int(2, 12);
  const wantArea = rng.bool(0.55);
  const area = PI(th * r * r, 360), arc = PI(2 * th * r, 360);
  const answer = wantArea ? area : arc;
  if (!clean(answer)) return null;
  const distractors = cleanOnly(wantArea
    ? [
        { value: arc, trap: 'found the arc length instead of the area' },
        { value: PI(360 * r * r, th), trap: 'used 360/θ instead of θ/360' },
        { value: PI(r * r), trap: 'found the area of the whole circle' },
        { value: PI(th * r, 360), trap: 'forgot to square the radius' },
        { value: PI(th * r * r, 180), trap: 'used 2πr² for the whole circle' },
        { value: PI(th * 2 * r * r, 360), trap: 'doubled the sector area' },
      ]
    : [
        { value: area, trap: 'found the sector area instead of the arc length' },
        { value: PI(th * r, 360), trap: 'used πr instead of 2πr for the whole circumference' },
        { value: PI(2 * r), trap: 'found the whole circumference' },
        { value: PI(360 * 2 * r, th), trap: 'used 360/θ instead of θ/360' },
        { value: PI(2 * th * r * r, 360), trap: 'squared the radius, as in the area formula' },
        { value: E(2 * th * r).div(E(360)), trap: 'left out the π' },
      ]);
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
  let r: number, h = 0, answer: Exact, distractors: Distractor[], solution: string;
  if (shape === 'cylinder') {
    r = rng.int(2, 10);
    h = rng.int(2, 12);
    answer = PI(r * r * h);
    distractors = cleanOnly([
      { value: PI(r * r * h, 3), trap: 'used the cone formula ⅓πr²h' },
      { value: PI(2 * r * h), trap: 'found the curved surface area 2πrh' },
      { value: PI(4 * r * r * h), trap: 'used the diameter as the radius' },
      { value: PI(r * h), trap: 'forgot to square the radius' },
      { value: PI(r * r * h, 2), trap: 'halved the volume' },
      { value: E(r * r * h), trap: 'left out the π' },
    ]);
    solution = `$V = \\pi r^{2}h = \\pi \\times ${r}^{2} \\times ${h} = ${answer.toLatex()}$.`;
  } else if (shape === 'cone') {
    r = rng.int(2, 9);
    h = rng.pick([3, 6, 9, 12, 15]);
    answer = PI(r * r * h, 3);
    distractors = cleanOnly([
      { value: PI(r * r * h), trap: 'forgot the factor of ⅓ (that is the cylinder)' },
      { value: PI(4 * r * r * h, 3), trap: 'used the diameter as the radius' },
      { value: PI(r * h, 3), trap: 'forgot to square the radius' },
      { value: PI(2 * r * r * h, 3), trap: 'used ⅔ instead of ⅓' },
      { value: PI(r * r * h, 6), trap: 'divided by 6 instead of 3' },
      { value: E(r * r * h).div(E(3)), trap: 'left out the π' },
    ]);
    solution = `$V = \\frac{1}{3}\\pi r^{2}h = \\frac{1}{3}\\pi \\times ${r * r} \\times ${h} = ${answer.toLatex()}$.`;
  } else {
    r = rng.pick([2, 3, 4, 5, 6, 9]);
    answer = PI(4 * r * r * r, 3);
    distractors = cleanOnly([
      { value: PI(4 * r * r * r), trap: 'forgot to divide by 3' },
      { value: PI(4 * r * r, 3), trap: 'used r² instead of r³' },
      { value: PI(4 * r * r), trap: 'found the surface area 4πr²' },
      { value: PI(2 * r * r * r, 3), trap: 'used the hemisphere volume' },
      { value: PI(32 * r * r * r, 3), trap: 'used the diameter as the radius' },
      { value: E(4 * r * r * r).div(E(3)), trap: 'left out the π' },
    ]);
    solution = `$V = \\frac{4}{3}\\pi r^{3} = \\frac{4}{3}\\pi \\times ${r * r * r} = ${answer.toLatex()}$.`;
  }
  if (!clean(answer)) return null;
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
  let r: number, h = 0, answer: Exact, distractors: Distractor[], solution: string, body: string;
  if (shape === 'sphere') {
    r = rng.int(2, 12);
    answer = PI(4 * r * r);
    distractors = cleanOnly([
      { value: PI(4 * r * r * r, 3), trap: 'found the volume instead of the surface area' },
      { value: PI(r * r), trap: 'used πr², the area of a circle' },
      { value: PI(2 * r * r), trap: 'used 2πr²: that is a curved hemisphere' },
      { value: PI(16 * r * r), trap: 'used the diameter as the radius' },
      { value: PI(4 * r), trap: 'forgot to square the radius' },
    ]);
    solution = `$A = 4\\pi r^{2} = 4\\pi \\times ${r * r} = ${answer.toLatex()}$.`;
    body = `A sphere has radius $${r}$ cm.`;
  } else if (shape === 'cylinder') {
    r = rng.int(2, 9);
    h = rng.int(2, 12);
    answer = PI(2 * r * r + 2 * r * h);
    distractors = cleanOnly([
      { value: PI(2 * r * h), trap: 'gave the curved surface only, with no ends' },
      { value: PI(r * r + 2 * r * h), trap: 'counted only one circular end' },
      { value: PI(r * r * h), trap: 'found the volume instead' },
      { value: PI(2 * r * r + r * h), trap: 'used πrh for the curved surface' },
      { value: PI(4 * r * r + 2 * r * h), trap: 'used the diameter in the ends' },
    ]);
    solution = `Two ends and a curved surface: $2\\pi r^{2} + 2\\pi r h = ${2 * r * r}\\pi + ${2 * r * h}\\pi = ${answer.toLatex()}$.`;
    body = `A closed solid cylinder has radius $${r}$ cm and height $${h}$ cm.`;
  } else {
    r = rng.int(2, 12);
    answer = PI(3 * r * r);
    distractors = cleanOnly([
      { value: PI(2 * r * r), trap: 'forgot the flat circular face' },
      { value: PI(4 * r * r), trap: 'used the whole sphere' },
      { value: PI(r * r), trap: 'gave only the flat face' },
      { value: PI(2 * r * r * r, 3), trap: 'found the volume instead' },
      { value: PI(6 * r * r), trap: 'doubled the curved surface and added the face twice' },
    ]);
    solution = `Curved surface $2\\pi r^{2}$ plus the flat face $\\pi r^{2}$: $${answer.toLatex()}$.`;
    body = `A solid hemisphere has radius $${r}$ cm.`;
  }
  if (!clean(answer)) return null;
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
  const distractors = cleanOnly(wantPerimeter
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
      ]);
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
  let V: Exact, answer: Exact, solution: string, body: string, distractors: Distractor[];
  if (shape === 'sphere') {
    V = PI(4 * r * r * r, 3);
    answer = E(r);
    distractors = cleanOnly([
      { value: E(r * r * r), trap: 'stopped at r³ without taking the cube root' },
      { value: E(2 * r), trap: 'gave the diameter' },
      { value: frac(4 * r * r * r, 3), trap: 'forgot to undo the 4/3 and the cube' },
      { value: E(r + 1), trap: 'cube-root slip' },
      { value: frac(3 * r * r * r, 4), trap: 'multiplied by 3/4 instead of dividing by 4/3' },
    ]);
    solution = `$\\frac{4}{3}\\pi r^{3} = ${V.toLatex()}$ gives $r^{3} = ${r * r * r}$, so $r = ${r}$.`;
    body = `A sphere has volume $${V.toLatex()}\\ \\text{cm}^{3}$.`;
  } else if (shape === 'cylinder') {
    V = PI(r * r * h);
    answer = E(r);
    distractors = cleanOnly([
      { value: E(r * r), trap: 'stopped at r² without taking the square root' },
      { value: E(2 * r), trap: 'gave the diameter' },
      { value: frac(r * r * h, h), trap: 'divided by the height but forgot the square root' },
      { value: E(r + 1), trap: 'square-root slip' },
      { value: frac(r * r, 2), trap: 'halved r² instead of square-rooting it' },
    ]);
    solution = `$\\pi r^{2}h = ${V.toLatex()}$ gives $r^{2} = \\frac{${r * r * h}}{${h}} = ${r * r}$, so $r = ${r}$.`;
    body = `A cylinder of height $${h}$ cm has volume $${V.toLatex()}\\ \\text{cm}^{3}$.`;
  } else {
    V = PI(r * r * h, 3);
    answer = E(h);
    distractors = cleanOnly([
      { value: E(3 * h), trap: 'forgot the factor of ⅓ when rearranging' },
      { value: frac(h, 3), trap: 'divided by 3 instead of multiplying' },
      { value: E(r), trap: 'gave the radius' },
      { value: E(h + 1), trap: 'arithmetic slip' },
      { value: frac(r * r * h, 3 * r), trap: 'divided by r instead of r²' },
    ]);
    solution = `$\\frac{1}{3}\\pi r^{2}h = ${V.toLatex()}$ gives $h = \\frac{3 \\times ${r * r * h / 3}}{${r * r}} = ${h}$.`;
    body = `A cone of base radius $${r}$ cm has volume $${V.toLatex()}\\ \\text{cm}^{3}$.`;
  }
  if (!clean(V) || !clean(answer) || (shape === 'cone' && (r * r * h) % 3 !== 0)) return null;
  return {
    stem: `${body} Find ${shape === 'cone' ? 'its vertical height' : 'its radius'}, in cm.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution,
    trap: 'Divide out the π first, then undo the fraction and the power — one step at a time.',
    tags: ['mensuration', 'volume', 'reverse'],
    params: { variant: `reverse-${shape}`, r, h },
    typedAllowed: true,
  };
}

function compositeVolumeQ(rng: RNG): Generated | null {
  const r = rng.pick([3, 6, 9, 2, 4, 5]);
  const h = rng.int(2, 12);
  const answer = PI(2 * r * r * r, 3).add(PI(r * r * h));
  if (!clean(answer)) return null;
  const distractors = cleanOnly([
    { value: PI(4 * r * r * r, 3).add(PI(r * r * h)), trap: 'added a whole sphere instead of a hemisphere' },
    { value: PI(r * r * r, 3).add(PI(r * r * h)), trap: 'used ⅓πr³ for the hemisphere' },
    { value: PI(2 * r * r * r, 3).add(PI(r * r * h, 3)), trap: 'used the cone formula for the cylinder' },
    { value: PI(r * r * h), trap: 'forgot the hemisphere' },
    { value: PI(2 * r * r * r, 3), trap: 'forgot the cylinder' },
    { value: PI(2 * r * r, 3).add(PI(r * r * h)), trap: 'used r² instead of r³ in the hemisphere' },
  ]);
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
  const distractors = cleanOnly([
    { value: against === 'cylinder' ? frac(3 * h, 4 * r) : frac(h, 4 * r), trap: 'divided the wrong way round' },
    { value: against === 'cylinder' ? frac(4 * r, h) : frac(4 * r, 3 * h), trap: 'mixed up the cone and cylinder formulas (a factor of 3)' },
    { value: frac(4 * r * r, 3 * h), trap: 'cancelled r³ against r² wrongly' },
    { value: frac(r, h), trap: 'forgot the 4/3' },
    { value: against === 'cylinder' ? frac(4 * r, 9 * h) : frac(4 * r, 3 * h * 3), trap: 'divided by 3 twice' },
  ]);
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
    1: 'circle area and circumference from the radius or the diameter',
    2: 'sector area and arc length for 30°, 45°, 60°, 90°, 120° …',
    3: 'volumes of a cylinder, a cone and a sphere',
    4: 'surface areas (sphere, closed cylinder, hemisphere) and a rectangle with a semicircle on top',
    5: 'given the volume find a length; a cylinder with a hemisphere on top; a ratio of volumes',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return circleQ(rng);
        case 2: return sectorQ(rng);
        case 3: return solidVolumeQ(rng);
        case 4: return pickVariant(rng, [surfaceAreaQ, compositeAreaQ]);
        default: return pickVariant(rng, [reverseQ, compositeVolumeQ, ratioQ]);
      }
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const p = q.params as { variant: string; r: number; h: number; th?: number; w?: number; byDiameter?: boolean; wantArea?: boolean; wantPerimeter?: boolean };
    const got = q.answer.value.toNumber();
    const P = Math.PI;
    const close = (x: number) => Math.abs(got - x) <= 1e-9 * Math.max(1, Math.abs(x));
    switch (p.variant) {
      case 'circle':
        return close(p.wantArea ? P * p.r ** 2 : 2 * P * p.r);
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
        // the radius answered must reproduce the volume printed in the stem
        return close(p.r) && Math.abs((4 / 3) * P * got ** 3 - (4 / 3) * P * p.r ** 3) < 1e-9;
      case 'reverse-cylinder':
        return close(p.r) && Math.abs(P * got ** 2 * p.h - P * p.r ** 2 * p.h) < 1e-9;
      case 'reverse-cone':
        return close(p.h) && Math.abs((P * p.r ** 2 * got) / 3 - (P * p.r ** 2 * p.h) / 3) < 1e-9;
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
