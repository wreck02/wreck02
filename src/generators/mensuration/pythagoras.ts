import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, surd, surdFrac, Exact } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { TRIPLES } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Pythagoras in 2D and 3D.
 * Level 1: a side of a right-angled triangle from a Pythagorean triple (possibly scaled)
 * Level 2: diagonal of a square (a√2) and height of an equilateral triangle ((a/2)√3)
 * Level 3: area of an equilateral triangle, a rhombus from its diagonals, a rectangle's diagonal
 * Level 4: the space diagonal of a cuboid, and the diagonal of a cube (a√3)
 * Level 5: the slant height of a cone, a square-based pyramid, and a chord of a circle
 */

function clean(x: Exact): boolean {
  return Number.isFinite(x.toNumber()) && isCleanExact(x).ok;
}

function cleanOnly(answer: Exact, ds: { value: Exact | null; trap: string }[]): Distractor[] {
  const a = Math.abs(answer.toNumber());
  return ds.filter((d): d is { value: Exact; trap: string } => {
    if (d.value === null || !clean(d.value) || d.value.toNumber() <= 0) return false;
    const v = Math.abs(d.value.toNumber());
    return a === 0 || (v <= 30 * a && 30 * v >= a);
  });
}

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

/** √n, as an exact value, or null if the exam would not print it. */
function root(n: number): Exact | null {
  if (n <= 0) return null;
  const v = surd(n);
  return clean(v) ? v : null;
}

// ----------------------------------------------------------------------------- level 1

function tripleQ(rng: RNG): Generated | null {
  const [a0, b0, c0] = rng.pick(TRIPLES.filter((t) => t[2] <= 26));
  const s = rng.weighted([1, 2, 3], [6, 2, 1]);
  const [a, b, c] = [a0 * s, b0 * s, c0 * s];
  if (c > 60) return null;
  const wantHyp = rng.bool(0.55);
  const [known1, known2] = rng.bool() ? [a, b] : [b, a];
  const answer = wantHyp ? E(c) : E(b);
  const distractors = cleanOnly(answer, wantHyp
    ? [
        { value: E(a + b), trap: 'added the two sides instead of their squares' },
        { value: root(b * b - a * a), trap: 'subtracted the squares: that is for finding a shorter side' },
        { value: E(c + 1), trap: 'slip when square-rooting' },
        { value: E(c - 1), trap: 'slip when square-rooting' },
        { value: E(a * a + b * b), trap: 'forgot to take the square root' },
        { value: frac(a + b, 2), trap: 'averaged the two sides' },
      ]
    : [
        { value: root(c * c + a * a), trap: 'added the squares instead of subtracting them' },
        { value: E(c - a), trap: 'subtracted the sides instead of their squares' },
        { value: E(c + a), trap: 'added the sides' },
        { value: E(c * c - a * a), trap: 'forgot to take the square root' },
        { value: E(b + 1), trap: 'slip when square-rooting' },
        { value: E(b - 1), trap: 'slip when square-rooting' },
      ]);
  const stem = wantHyp
    ? `A right-angled triangle has the two shorter sides $${known1}$ cm and $${known2}$ cm. Find the length of its hypotenuse, in cm.`
    : `A right-angled triangle has hypotenuse $${c}$ cm and one of the shorter sides $${a}$ cm. Find the length of the third side, in cm.`;
  return {
    stem,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: wantHyp
      ? `$${a}^{2} + ${b}^{2} = ${a * a} + ${b * b} = ${c * c}$, so the hypotenuse is $${c}$ cm.`
      : `$${c}^{2} - ${a}^{2} = ${c * c} - ${a * a} = ${b * b}$, so the side is $${b}$ cm.`,
    trap: 'Add the squares for the hypotenuse, subtract them for a shorter side.',
    tags: ['pythagoras', 'triangle'],
    params: { variant: wantHyp ? 'triple-hyp' : 'triple-leg', a, b, c },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 2

function squareDiagonalQ(rng: RNG): Generated | null {
  const a = rng.int(2, 24);
  const answer = surd(2, a);
  if (!clean(answer)) return null;
  const distractors = cleanOnly(answer, [
    { value: E(2 * a), trap: 'wrote a√2 as 2a' },
    { value: surd(3, a), trap: 'used √3, which belongs to the equilateral triangle' },
    { value: surd(2, a * a), trap: 'squared the side and kept the root' },
    { value: E(a * a), trap: 'gave the area of the square' },
    { value: surdFrac(a, 2, 2), trap: 'halved instead of using the full diagonal' },
    { value: E(4 * a), trap: 'gave the perimeter' },
  ]);
  return {
    stem: `A square has side $${a}$ cm. Find the length of its diagonal, in cm, in the form $a\\sqrt{b}$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `The diagonal is $\\sqrt{${a}^{2} + ${a}^{2}} = \\sqrt{${2 * a * a}} = ${answer.toLatex()}$.`,
    trap: 'a² + a² = 2a², so the diagonal is a√2 — not 2a.',
    tags: ['pythagoras', 'square', 'surds'],
    params: { variant: 'square-diagonal', a },
    typedAllowed: true,
  };
}

function equilateralHeightQ(rng: RNG): Generated | null {
  const a = 2 * rng.int(1, 12);
  const byPerimeter = rng.bool(0.3);
  const answer = surd(3, a / 2);
  if (!clean(answer)) return null;
  const distractors = cleanOnly(answer, [
    { value: surd(3, a), trap: 'forgot to halve the base before using Pythagoras' },
    { value: surd(2, a / 2), trap: 'used √2, which belongs to the square' },
    { value: frac(a, 2), trap: 'gave half the base' },
    { value: surdFrac(a, 4, 3), trap: 'halved one time too many' },
    { value: surd(3, a * a / 4), trap: 'gave the area instead of the height' },
    { value: E(a), trap: 'gave the side of the triangle' },
  ]);
  return {
    stem: `An equilateral triangle has ${byPerimeter ? `perimeter $${3 * a}$ cm` : `side $${a}$ cm`}. Find its perpendicular height, in cm, in the form $a\\sqrt{b}$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `${byPerimeter ? `Each side is $${a}$ cm. ` : ''}The height splits the base in half: $h = \\sqrt{${a}^{2} - ${a / 2}^{2}} = \\sqrt{${a * a - (a / 2) * (a / 2)}} = ${answer.toLatex()}$.`,
    trap: 'The perpendicular bisects the base, so the second side of the right-angled triangle is a/2, not a.',
    tags: ['pythagoras', 'equilateral', 'surds'],
    params: { variant: 'equilateral-height', a },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 3

function equilateralAreaQ(rng: RNG): Generated | null {
  const a = 2 * rng.int(1, 7);
  const answer = surd(3, (a * a) / 4);
  if (!clean(answer)) return null;
  const distractors = cleanOnly(answer, [
    { value: surd(3, (a * a) / 2), trap: 'forgot to halve base × height' },
    { value: surd(3, a / 2), trap: 'gave the height instead of the area' },
    { value: E((a * a) / 2), trap: 'used ½ × a × a with no √3' },
    { value: surd(3, a * a), trap: 'left out the factor of a quarter' },
    { value: surd(2, (a * a) / 4), trap: 'used √2 instead of √3' },
    { value: E(a * a), trap: 'used the square on the side' },
    { value: surdFrac(a * a, 8, 3), trap: 'halved one time too many' },
    { value: E(a), trap: 'gave the side of the triangle' },
  ]);
  return {
    stem: `An equilateral triangle has side $${a}$ cm. Find its area, in $\\text{cm}^{2}$, in the form $a\\sqrt{b}$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `The height is $${surd(3, a / 2).toLatex()}$, so the area is $\\frac{1}{2} \\times ${a} \\times ${surd(3, a / 2).toLatex()} = ${answer.toLatex()}$.`,
    trap: 'Area is ½ × base × height, and the height of an equilateral triangle is (a/2)√3.',
    tags: ['pythagoras', 'equilateral', 'area', 'surds'],
    params: { variant: 'equilateral-area', a },
    typedAllowed: true,
  };
}

function rhombusQ(rng: RNG): Generated | null {
  const [a, b, c] = rng.pick(TRIPLES.filter((t) => t[2] <= 17));
  const d1 = 2 * a, d2 = 2 * b;
  const wantSide = rng.bool(0.55);
  const answer = wantSide ? E(c) : E((d1 * d2) / 2);
  if (!clean(answer)) return null;
  const distractors = cleanOnly(answer, wantSide
    ? [
        { value: E(a + b), trap: 'added the half-diagonals instead of using Pythagoras' },
        { value: root(d1 * d1 + d2 * d2), trap: 'used the whole diagonals instead of halving them' },
        { value: E((d1 * d2) / 2), trap: 'gave the area instead of a side' },
        { value: E(c + 1), trap: 'slip when square-rooting' },
        { value: root(b * b - a * a), trap: 'subtracted the squares instead of adding them' },
        { value: E(Math.max(a, b)), trap: 'gave half of the longer diagonal' },
      ]
    : [
        { value: E(d1 * d2), trap: 'forgot to halve the product of the diagonals' },
        { value: E(a * b), trap: 'used the half-diagonals and halved again' },
        { value: E(4 * c), trap: 'gave the perimeter' },
        { value: E(c * c), trap: 'squared a side, as for a square' },
        { value: E(d1 + d2), trap: 'added the diagonals' },
        { value: frac(d1 * d2, 4), trap: 'halved twice' },
      ]);
  return {
    stem: `A rhombus has diagonals of length $${d1}$ cm and $${d2}$ cm.\n\nFind ${wantSide ? 'the length of one of its sides, in cm' : `its area, in $\\text{cm}^{2}$`}.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: wantSide
      ? `The diagonals bisect each other at right angles, so a side is $\\sqrt{${a}^{2} + ${b}^{2}} = ${c}$ cm.`
      : `Area $= \\frac{1}{2} d_{1} d_{2} = \\frac{1}{2} \\times ${d1} \\times ${d2} = ${(d1 * d2) / 2}\\ \\text{cm}^{2}$.`,
    trap: 'The diagonals of a rhombus bisect each other at right angles: use half of each.',
    tags: ['pythagoras', 'rhombus'],
    params: { variant: wantSide ? 'rhombus-side' : 'rhombus-area', d1, d2 },
    typedAllowed: true,
  };
}

function rectangleDiagonalQ(rng: RNG): Generated | null {
  const a = rng.int(3, 12), b = rng.int(3, 12);
  if (a === b) return null;
  const answer = root(a * a + b * b);
  if (!answer) return null;
  const distractors = cleanOnly(answer, [
    { value: E(a + b), trap: 'added the sides instead of their squares' },
    { value: E(a * a + b * b), trap: 'forgot to take the square root' },
    { value: root(Math.abs(a * a - b * b)), trap: 'subtracted the squares instead of adding them' },
    { value: E(a * b), trap: 'gave the area of the rectangle' },
    { value: root(a * a + b * b + 1), trap: 'arithmetic slip inside the root' },
    { value: E(2 * (a + b)), trap: 'gave the perimeter' },
    { value: E(Math.max(a, b)), trap: 'gave the longer side' },
    { value: root(a * a + b * b - 2), trap: 'arithmetic slip inside the root' },
  ]);
  return {
    stem: `A rectangle measures $${a}$ cm by $${b}$ cm. Find the length of its diagonal, in cm, in exact form.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `The diagonal is $\\sqrt{${a * a} + ${b * b}} = \\sqrt{${a * a + b * b}}${answer.toLatex() === `\\sqrt{${a * a + b * b}}` ? '' : ` = ${answer.toLatex()}`}$.`,
    trap: 'Square each side, add, then take the root — and simplify the surd.',
    tags: ['pythagoras', 'rectangle', 'surds'],
    params: { variant: 'rectangle-diagonal', a, b },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 4

/** Cuboids whose space diagonal is tidy. */
const CUBOIDS: [number, number, number][] = [
  [1, 2, 2], [2, 3, 6], [1, 4, 8], [4, 4, 7], [2, 6, 9], [6, 6, 7], [3, 4, 12], [2, 10, 11], [1, 12, 12], [8, 9, 12],
  [1, 2, 3], [2, 3, 4], [1, 3, 5], [2, 4, 5], [3, 5, 6], [1, 1, 3], [2, 2, 5], [3, 3, 4], [4, 5, 6], [2, 5, 6],
];

function cuboidDiagonalQ(rng: RNG): Generated | null {
  const [a, b, c] = rng.shuffle(rng.pick(CUBOIDS));
  const answer = root(a * a + b * b + c * c);
  if (!answer) return null;
  const distractors = cleanOnly(answer, [
    { value: root(a * a + b * b), trap: 'left out one edge: that is the diagonal of a face' },
    { value: root(b * b + c * c), trap: 'left out one edge: that is the diagonal of a face' },
    { value: E(a + b + c), trap: 'added the edges instead of their squares' },
    { value: E(a * a + b * b + c * c), trap: 'forgot to take the square root' },
    { value: root(a * a + b * b + c * c + 2), trap: 'arithmetic slip inside the root' },
    { value: root(Math.abs(a * a + b * b - c * c)), trap: 'subtracted one of the squares' },
  ]);
  return {
    stem: `A cuboid has edges of length $${a}$ cm, $${b}$ cm and $${c}$ cm. Find the distance between two opposite corners of the cuboid, in cm, in exact form.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `The space diagonal is $\\sqrt{${a * a} + ${b * b} + ${c * c}} = \\sqrt{${a * a + b * b + c * c}}${answer.toLatex() === `\\sqrt{${a * a + b * b + c * c}}` ? '' : ` = ${answer.toLatex()}`}$.`,
    trap: 'The space diagonal uses all three edges: √(a² + b² + c²), not the face diagonal.',
    tags: ['pythagoras', '3d', 'cuboid'],
    params: { variant: 'cuboid-diagonal', a, b, c },
    typedAllowed: true,
  };
}

function cubeDiagonalQ(rng: RNG): Generated | null {
  const a = rng.int(2, 12);
  const faceOnly = rng.bool(0.35);
  const answer = faceOnly ? surd(2, a) : surd(3, a);
  if (!clean(answer)) return null;
  const distractors = cleanOnly(answer, [
    { value: faceOnly ? surd(3, a) : surd(2, a), trap: faceOnly ? 'used the space diagonal a√3' : 'gave the diagonal of a face, a√2' },
    { value: E(3 * a), trap: 'wrote a√3 as 3a' },
    { value: E(2 * a), trap: 'wrote a√2 as 2a' },
    { value: surd(3, a * a), trap: 'squared the edge and kept the root' },
    { value: E(a * a), trap: 'gave the area of a face' },
    { value: surdFrac(a, 2, 3), trap: 'halved the diagonal' },
  ]);
  return {
    stem: `A cube has edges of length $${a}$ cm. Find the ${faceOnly ? 'length of a diagonal of one of its faces' : 'distance between two opposite corners of the cube'}, in cm, in the form $a\\sqrt{b}$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: faceOnly
      ? `A face is a square of side $${a}$, so its diagonal is $\\sqrt{${2 * a * a}} = ${answer.toLatex()}$.`
      : `$\\sqrt{${a}^{2} + ${a}^{2} + ${a}^{2}} = \\sqrt{${3 * a * a}} = ${answer.toLatex()}$.`,
    trap: 'A face diagonal is a√2; the diagonal through the cube is a√3.',
    tags: ['pythagoras', '3d', 'cube', 'surds'],
    params: { variant: faceOnly ? 'cube-face' : 'cube-diagonal', a },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 5

function coneSlantQ(rng: RNG): Generated | null {
  const r = rng.int(2, 12), h = rng.int(2, 15);
  const findHeight = rng.bool(0.35);
  const lsq = r * r + h * h;
  const l = Math.sqrt(lsq);
  let answer: Exact | null;
  if (findHeight) {
    if (!Number.isInteger(l)) return null;
    answer = E(h);
  } else {
    answer = root(lsq);
  }
  if (!answer || !clean(answer)) return null;
  const distractors = cleanOnly(answer, findHeight
    ? [
        { value: root(lsq + r * r), trap: 'added r² instead of subtracting it' },
        { value: E(l - r), trap: 'subtracted the radius from the slant height' },
        { value: E(lsq - r * r), trap: 'forgot to take the square root' },
        { value: E(h + 1), trap: 'slip when square-rooting' },
        { value: E(2 * h), trap: 'doubled the height' },
        { value: E(l), trap: 'gave the slant height' },
        { value: E(h - 1), trap: 'slip when square-rooting' },
      ]
    : [
        { value: E(r + h), trap: 'added the radius and the height' },
        { value: root(Math.abs(h * h - r * r)), trap: 'subtracted the squares instead of adding them' },
        { value: E(lsq), trap: 'forgot to take the square root' },
        { value: root(4 * r * r + h * h), trap: 'used the diameter instead of the radius' },
        { value: E(h), trap: 'gave the vertical height' },
        { value: E(r), trap: 'gave the base radius' },
        { value: E(Math.abs(h - r)), trap: 'subtracted the lengths instead of their squares' },
      ]);
  return {
    stem: findHeight
      ? `A cone has base radius $${r}$ cm and slant height $${l}$ cm. Find its vertical height, in cm.`
      : `A cone has base radius $${r}$ cm and vertical height $${h}$ cm. Find its slant height, in cm, in exact form.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: findHeight
      ? `The radius, the height and the slant height form a right-angled triangle: $h = \\sqrt{${l * l} - ${r * r}} = ${h}$ cm.`
      : `$l = \\sqrt{${r}^{2} + ${h}^{2}} = \\sqrt{${lsq}}${answer.toLatex() === `\\sqrt{${lsq}}` ? '' : ` = ${answer.toLatex()}`}$.`,
    trap: 'The slant height is the hypotenuse of the triangle made by the radius and the vertical height.',
    tags: ['pythagoras', 'cone', '3d'],
    params: { variant: findHeight ? 'cone-height' : 'cone-slant', r, h },
    typedAllowed: true,
  };
}

function pyramidQ(rng: RNG): Generated | null {
  const a = 2 * rng.int(1, 7);
  const h = rng.int(2, 14);
  const wantEdge = rng.bool(0.4);
  const half = a / 2;
  const answer = wantEdge ? root(h * h + 2 * half * half) : root(h * h + half * half);
  if (!answer || !clean(answer)) return null;
  const distractors = cleanOnly(answer, wantEdge
    ? [
        { value: root(h * h + half * half), trap: 'used the midpoint of an edge instead of a corner of the base' },
        { value: root(h * h + a * a), trap: 'used the whole base edge instead of half the diagonal' },
        { value: E(h + half), trap: 'added the lengths instead of their squares' },
        { value: E(h * h + 2 * half * half), trap: 'forgot to take the square root' },
        { value: root(h * h + 4 * half * half), trap: 'used the whole diagonal instead of half of it' },
        { value: E(h), trap: 'gave the vertical height' },
        { value: E(a), trap: 'gave the base edge' },
      ]
    : [
        { value: root(h * h + a * a), trap: 'used the whole base edge instead of half of it' },
        { value: root(h * h + 2 * half * half), trap: 'used half the diagonal: that gives the slant edge' },
        { value: E(h + half), trap: 'added the lengths instead of their squares' },
        { value: E(h * h + half * half), trap: 'forgot to take the square root' },
        { value: root(Math.abs(h * h - half * half)), trap: 'subtracted the squares' },
        { value: E(h), trap: 'gave the vertical height' },
        { value: E(half), trap: 'gave half the base edge' },
      ]);
  return {
    stem: `A pyramid has a square base of side $${a}$ cm and its apex is vertically above the centre of the base, at a height of $${h}$ cm.\n\nFind the distance from the apex to ${wantEdge ? 'a corner of the base' : 'the midpoint of one edge of the base'}, in cm, in exact form.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: wantEdge
      ? `Half a base diagonal is $\\sqrt{${half}^{2} + ${half}^{2}} = \\sqrt{${2 * half * half}}$, so the edge is $\\sqrt{${h * h} + ${2 * half * half}} = ${answer.toLatex()}$.`
      : `The horizontal distance to the midpoint of an edge is $${half}$ cm, so the length is $\\sqrt{${h * h} + ${half * half}} = ${answer.toLatex()}$.`,
    trap: 'Reaching a corner needs half the base diagonal; reaching the middle of an edge needs only half the side.',
    tags: ['pythagoras', 'pyramid', '3d'],
    params: { variant: wantEdge ? 'pyramid-edge' : 'pyramid-slant', a, h },
    typedAllowed: true,
  };
}

function chordQ(rng: RNG): Generated | null {
  const [a, b, c] = rng.pick(TRIPLES.filter((t) => t[2] <= 26));
  const swap = rng.bool();
  const R = c, d = swap ? a : b, half = swap ? b : a;
  const answer = E(2 * half);
  if (!clean(answer)) return null;
  const distractors = cleanOnly(answer, [
    { value: E(half), trap: 'gave half the chord, forgetting to double it' },
    { value: root(4 * (R * R + d * d)), trap: 'added the squares instead of subtracting them' },
    { value: E(2 * (R - d)), trap: 'subtracted the lengths instead of their squares' },
    { value: E(R * R - d * d), trap: 'forgot to take the square root' },
    { value: E(2 * half + 2), trap: 'arithmetic slip when square-rooting' },
    { value: E(2 * R), trap: 'gave the diameter' },
    { value: E(R), trap: 'gave the radius' },
    { value: E(2 * d), trap: 'doubled the distance from the centre instead of the half-chord' },
  ]);
  return {
    stem: `A chord of a circle of radius $${R}$ cm is $${d}$ cm from the centre of the circle. Find the length of the chord, in cm.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `The perpendicular from the centre bisects the chord: half of it is $\\sqrt{${R * R} - ${d * d}} = ${half}$, so the chord is $${2 * half}$ cm.`,
    trap: 'The perpendicular from the centre bisects the chord — Pythagoras gives half of it, so double at the end.',
    tags: ['pythagoras', 'circle', 'chord'],
    params: { variant: 'chord', R, d },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'm1.mensuration.pythagoras',
  module: 'M1',
  topic: 'mensuration',
  title: 'Pythagoras in 2D and 3D',
  levels: {
    1: 'hypotenuse or a shorter side from a Pythagorean triple, possibly scaled',
    2: 'diagonal of a square (a√2) and height of an equilateral triangle ((a/2)√3)',
    3: 'area of an equilateral triangle, a rhombus from its diagonals, a rectangle’s diagonal',
    4: 'space diagonal of a cuboid, diagonal of a cube (a√3)',
    5: 'slant height of a cone, a square-based pyramid, a chord of a circle',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return tripleQ(rng);
        case 2: return pickVariant(rng, [squareDiagonalQ, equilateralHeightQ]);
        case 3: return pickVariant(rng, [equilateralAreaQ, rhombusQ, rectangleDiagonalQ]);
        case 4: return pickVariant(rng, [cuboidDiagonalQ, cuboidDiagonalQ, cubeDiagonalQ]);
        default: return pickVariant(rng, [coneSlantQ, pyramidQ, chordQ]);
      }
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const p = q.params as { variant: string; a?: number; b?: number; c?: number; d1?: number; d2?: number; r?: number; h?: number; R?: number; d?: number };
    const got = q.answer.value.toNumber();
    const close = (x: number) => Math.abs(got - x) <= 1e-9 * Math.max(1, Math.abs(x));
    switch (p.variant) {
      case 'triple-hyp':
        return close(Math.hypot(p.a!, p.b!)) && close(p.c!);
      case 'triple-leg':
        return close(Math.sqrt(p.c! ** 2 - p.a! ** 2));
      case 'square-diagonal':
        return close(Math.hypot(p.a!, p.a!));
      case 'equilateral-height':
        return close(Math.sqrt(p.a! ** 2 - (p.a! / 2) ** 2));
      case 'equilateral-area':
        return close(0.5 * p.a! * Math.sqrt(p.a! ** 2 - (p.a! / 2) ** 2));
      case 'rhombus-side':
        return close(Math.hypot(p.d1! / 2, p.d2! / 2));
      case 'rhombus-area':
        // two triangles of base d1 and height d2/2
        return close(2 * (0.5 * p.d1! * (p.d2! / 2)));
      case 'rectangle-diagonal':
        return close(Math.hypot(p.a!, p.b!));
      case 'cuboid-diagonal':
        return close(Math.hypot(Math.hypot(p.a!, p.b!), p.c!));
      case 'cube-diagonal':
        return close(Math.hypot(Math.hypot(p.a!, p.a!), p.a!));
      case 'cube-face':
        return close(Math.hypot(p.a!, p.a!));
      case 'cone-slant':
        return close(Math.hypot(p.r!, p.h!));
      case 'cone-height':
        return close(Math.sqrt(Math.hypot(p.r!, p.h!) ** 2 - p.r! ** 2));
      case 'pyramid-slant':
        return close(Math.hypot(p.h!, p.a! / 2));
      case 'pyramid-edge':
        return close(Math.hypot(p.h!, Math.hypot(p.a! / 2, p.a! / 2)));
      case 'chord': {
        const half = Math.sqrt(p.R! ** 2 - p.d! ** 2);
        return close(2 * half);
      }
      default:
        return false;
    }
  },
});
