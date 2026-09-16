import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, surd, Exact } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { gcd, signed, TRIPLES } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Circle equations.
 * Level 1: centre and radius read off (x − a)² + (y − b)² = r²
 * Level 2: radius (or centre) from x² + y² − 4x + 6y − 3 = 0 by completing the square
 * Level 3: inside / on / outside, or the distance from the centre to a point
 * Level 4: the gradient of the tangent at a point of the circle (perpendicular to the radius)
 * Level 5: the equation of that tangent, the length of a tangent from an external point,
 *          or the circle on a given diameter
 */

const pt = (x: number, y: number): string => `(${x}, ${y})`;

/** "$(x - 3)^2 + (y + 2)^2 = 25$" */
function circleTex(a: number, b: number, rsq: number): string {
  const part = (v: string, c: number) => (c === 0 ? `${v}^{2}` : `(${v} ${c > 0 ? '-' : '+'} ${Math.abs(c)})^{2}`);
  return `$${part('x', a)} + ${part('y', b)} = ${rsq}$`;
}

/** "$x^2 + y^2 - 4x + 6y - 3 = 0$" */
function generalTex(D: number, Ey: number, F: number): string {
  return `$x^{2} + y^{2}${signed(D, 'x')}${signed(Ey, 'y')}${signed(F)} = 0$`;
}

/** "$3x + 4y = 25$", in lowest terms with a positive x-coefficient. */
function lineTex(A: number, B: number, C: number): string {
  let g = gcd(gcd(A, B), C) || 1;
  if (A < 0 || (A === 0 && B < 0)) g = -g;
  const [a, b, c] = [A / g, B / g, C / g];
  let s = '';
  if (a !== 0) s += signed(a, 'x', true);
  if (b !== 0) s += signed(b, 'y', s === '');
  return `$${s || '0'} = ${c}$`;
}

function normLine(A: number, B: number, C: number): [number, number, number] {
  let g = gcd(gcd(A, B), C) || 1;
  if (A < 0 || (A === 0 && B < 0)) g = -g;
  return [A / g, B / g, C / g];
}

function cleanOnly(ds: { value: Exact | null; trap: string }[]): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } => d.value !== null && Number.isFinite(d.value.toNumber()) && isCleanExact(d.value).ok);
}

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

/** A leg pair (dx, dy) with dx² + dy² = r², from a Pythagorean triple, in a random orientation. */
function radiusVector(rng: RNG, maxHyp = 20): { dx: number; dy: number; r: number } {
  const [a, b, c] = rng.pick(TRIPLES.filter((t) => t[2] <= maxHyp));
  const swap = rng.bool();
  return { dx: (swap ? b : a) * rng.sign(), dy: (swap ? a : b) * rng.sign(), r: c };
}

// ----------------------------------------------------------------------------- level 1

function readOffQ(rng: RNG): Generated | null {
  const a = rng.int(-6, 6), b = rng.int(-6, 6);
  const r = rng.int(2, 10);
  const wantRadius = rng.bool(0.6);
  if (wantRadius) {
    const answer = E(r);
    // a lopsided set of "square-rooted carelessly" slips, so the answer is not always the middle option
    const slips = rng.pick([[-2, -1, 1], [-1, 1, 2], [1, 2, 3], [-3, -2, -1], [-1, 2, 3]]);
    const distractors = cleanOnly([
      { value: E(r * r), trap: 'gave r², the number on the right-hand side, instead of r' },
      { value: E(2 * r), trap: 'gave the diameter' },
      { value: frac(r, 2), trap: 'halved the radius' },
      ...slips.map((o) => ({ value: r + o >= 1 ? E(r + o) : null, trap: 'slip when square-rooting' })),
    ]);
    return {
      stem: `A circle has equation ${circleTex(a, b, r * r)}. Find its radius.`,
      answer: { kind: 'exact', value: answer },
      options: buildOptions(rng, answer, distractors),
      solution: `The right-hand side is $r^{2} = ${r * r}$, so $r = ${r}$.`,
      trap: 'The number on the right of the equation is r², not r.',
      tags: ['circles', 'radius'],
      params: { variant: 'read-off-radius', a, b, r },
      typedAllowed: true,
    };
  }
  if (a === 0 || b === 0 || a + b === 0 || a === b) return null; // the sign traps would collapse
  const answer = E(a + b);
  const distractors = cleanOnly([
    { value: E(-a - b), trap: 'read the centre as (−a, −b): the brackets are (x − a) and (y − b)' },
    { value: E(a - b), trap: 'flipped the sign of the y-coordinate only' },
    { value: E(b - a), trap: 'flipped the sign of the x-coordinate only' },
    { value: E(a + b + r), trap: 'added the radius as well' },
    { value: E(a * b), trap: 'multiplied the coordinates instead of adding them' },
  ]);
  return {
    stem: `The circle ${circleTex(a, b, r * r)} has centre $C$. Find the sum of the coordinates of $C$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `$(x ${a > 0 ? '-' : '+'} ${Math.abs(a)})^{2}$ gives $x = ${a}$, so $C$ is $${pt(a, b)}$ and the sum is $${a + b}$.`,
    trap: 'The centre of (x − a)² + (y − b)² = r² is (a, b) — the signs in the brackets are reversed.',
    tags: ['circles', 'centre'],
    params: { variant: 'read-off-centre', a, b, r },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 2

function completeSquareQ(rng: RNG): Generated | null {
  const p = rng.int(-5, 5), q = rng.int(-5, 5);
  const r = rng.int(2, 8);
  const F = p * p + q * q - r * r;
  const D = -2 * p, Ey = -2 * q;
  if (D === 0 && Ey === 0) return null;
  const eq = generalTex(D, Ey, F);
  const wantRadius = rng.bool(0.7);
  if (wantRadius) {
    const answer = E(r);
    const distractors = cleanOnly([
      { value: E(r * r), trap: 'stopped at r² instead of taking the square root' },
      { value: F < 0 ? surd(-F) : null, trap: 'forgot the constants from completing the square: r² is not just −F' },
      { value: p * p + q * q + F > 0 ? surd(p * p + q * q + F) : null, trap: 'added the constant instead of subtracting it' },
      { value: E(2 * r), trap: 'gave the diameter' },
      { value: q * q - F > 0 ? surd(q * q - F) : null, trap: 'completed the square in y only' },
      { value: p * p - F > 0 ? surd(p * p - F) : null, trap: 'completed the square in x only' },
      { value: E(r + 1), trap: 'arithmetic slip when collecting the constants' },
    ]);
    return {
      stem: `A circle has equation ${eq}. Find its radius.`,
      answer: { kind: 'exact', value: answer },
      options: buildOptions(rng, answer, distractors),
      solution: `Complete the square: $(x ${p > 0 ? '-' : '+'} ${Math.abs(p)})^{2} + (y ${q > 0 ? '-' : '+'} ${Math.abs(q)})^{2} = ${-F} + ${p * p} + ${q * q} = ${r * r}$, so $r = ${r}$.`,
      trap: 'Completing the square adds (D/2)² and (E/2)² to both sides — forgetting them leaves the wrong r².',
      tags: ['circles', 'completing-the-square', 'radius'],
      params: { variant: 'general-radius', p, q, r, D, Ey, F },
      typedAllowed: true,
    };
  }
  if (p === 0 || q === 0 || p + q === 0 || p === q) return null;
  const answer = E(p + q);
  const distractors = cleanOnly([
    { value: E(-p - q), trap: 'forgot the minus sign: the centre is (−D/2, −E/2)' },
    { value: E(D + Ey), trap: 'used the coefficients of x and y directly, without halving' },
    { value: E(p - q), trap: 'sign slip on one coordinate' },
    { value: E(q - p), trap: 'sign slip on the other coordinate' },
    { value: E(p + q + r), trap: 'added the radius as well' },
  ]);
  return {
    stem: `A circle has equation ${eq}. Find the sum of the coordinates of its centre.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `Half the coefficients of $x$ and $y$ and change the sign: the centre is $${pt(p, q)}$, so the sum is $${p + q}$.`,
    trap: 'The centre is (−D/2, −E/2): halve and change the sign.',
    tags: ['circles', 'completing-the-square', 'centre'],
    params: { variant: 'general-centre', p, q, r, D, Ey, F },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 3

const VERDICT = { in: 'inside the circle', on: 'on the circle', out: 'outside the circle' } as const;

function verdictOf(d: number, r: number): string {
  return d < r ? VERDICT.in : d > r ? VERDICT.out : VERDICT.on;
}

/** Inside / on / outside, with the distance quoted in every option. */
function positionQ(rng: RNG): Generated | null {
  const [a, b, c] = rng.pick(TRIPLES.filter((t) => t[2] <= 17));
  const swap = rng.bool();
  const dx = (swap ? b : a) * rng.sign(), dy = (swap ? a : b) * rng.sign();
  const d = c;
  const where = rng.pick(['in', 'on', 'out'] as const);
  const r = where === 'on' ? d : where === 'in' ? d + rng.int(1, 4) : Math.max(2, d - rng.int(1, 4));
  if (r === d && where !== 'on') return null;
  const p = rng.int(-5, 5), q = rng.int(-5, 5);
  const x0 = p + dx, y0 = q + dy;
  if (Math.abs(x0) > 20 || Math.abs(y0) > 20) return null;
  const say = (dist: string, verdict: string) => `$CP = ${dist}$, so $P$ lies ${verdict}.`;
  const correct = say(`${d}`, verdictOf(d, r));
  const cands: { display: string; d: number; verdict: string; trap?: string }[] = [
    { display: correct, d, verdict: verdictOf(d, r) },
  ];
  const others = [VERDICT.in, VERDICT.on, VERDICT.out].filter((v) => v !== verdictOf(d, r));
  for (const v of others) cands.push({ display: say(`${d}`, v), d, verdict: v, trap: 'compared the distance with the radius the wrong way round' });
  const wrongDistances: { value: number; trap: string }[] = [
    { value: d * d, trap: 'compared r² with the square of the distance but then quoted the square as the distance' },
    { value: Math.abs(dx) + Math.abs(dy), trap: 'added the two differences instead of using Pythagoras' },
    { value: Math.abs(d - r), trap: 'subtracted the radius from the distance' },
  ];
  for (const w of wrongDistances) {
    if (w.value === d || w.value <= 0) continue;
    cands.push({ display: say(`${w.value}`, verdictOf(w.value, r)), d: w.value, verdict: verdictOf(w.value, r), trap: w.trap });
  }
  const wrong = cands.slice(1).filter((c) => c.display !== correct);
  if (wrong.length < 4) return null;
  return {
    stem: `The circle with centre $C${pt(p, q)}$ has radius $${r}$. $P$ is the point $${pt(x0, y0)}$.\n\nWhich of the following is true?`,
    answer: { kind: 'choice', value: correct },
    options: buildChoiceOptions(rng, correct, wrong.map((w) => ({ display: w.display, trap: w.trap }))),
    solution: `$CP = \\sqrt{${dx * dx} + ${dy * dy}} = \\sqrt{${d * d}} = ${d}$, and the radius is $${r}$, so $P$ lies ${verdictOf(d, r)}.`,
    trap: 'Compare the distance from the centre with the radius — not with r², and not after adding the coordinate differences.',
    tags: ['circles', 'distance', 'position'],
    params: { variant: 'position', p, q, r, x0, y0, cands: cands.map((c) => ({ display: c.display, d: c.d, verdict: c.verdict })) },
    typedAllowed: false,
  };
}

/** Distance from the centre to a point. */
function centreDistanceQ(rng: RNG): Generated | null {
  const p = rng.int(-6, 6), q = rng.int(-6, 6);
  const r = rng.int(2, 9);
  const dx = rng.nonZeroInt(-9, 9), dy = rng.nonZeroInt(-9, 9);
  const x0 = p + dx, y0 = q + dy;
  if (Math.abs(x0) > 15 || Math.abs(y0) > 15) return null;
  const answer = surd(dx * dx + dy * dy);
  if (!isCleanExact(answer).ok) return null;
  const distractors = cleanOnly([
    { value: E(dx * dx + dy * dy), trap: 'forgot to take the square root' },
    { value: E(Math.abs(dx) + Math.abs(dy)), trap: 'added the differences instead of using Pythagoras' },
    { value: surd(Math.abs(dx * dx - dy * dy)), trap: 'subtracted the squares instead of adding them' },
    { value: surd(x0 * x0 + y0 * y0), trap: 'measured from the origin instead of from the centre' },
    { value: surd((dx + 1) * (dx + 1) + dy * dy), trap: 'slip of one when subtracting the coordinates' },
    { value: surd((p + x0) * (p + x0) + (q + y0) * (q + y0)), trap: 'added the coordinates instead of subtracting them' },
  ]);
  return {
    stem: `Find the distance from the centre of the circle ${circleTex(p, q, r * r)} to the point $${pt(x0, y0)}$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `The centre is $${pt(p, q)}$, so the distance is $\\sqrt{${dx * dx} + ${dy * dy}} = \\sqrt{${dx * dx + dy * dy}}${answer.toLatex() === `\\sqrt{${dx * dx + dy * dy}}` ? '' : ` = ${answer.toLatex()}`}$.`,
    trap: 'Read the centre off with the signs reversed, then use Pythagoras on the differences.',
    tags: ['circles', 'distance'],
    params: { variant: 'centre-distance', p, q, r, x0, y0 },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 4

function tangentGradientQ(rng: RNG): Generated | null {
  const { dx, dy, r } = radiusVector(rng, 17);
  if (Math.abs(dx) === Math.abs(dy)) return null;
  const p = rng.int(-5, 5), q = rng.int(-5, 5);
  const x0 = p + dx, y0 = q + dy;
  if (Math.abs(x0) > 20 || Math.abs(y0) > 20) return null;
  const answer = frac(-dx, dy);
  if (!isCleanExact(answer).ok) return null;
  const distractors = cleanOnly([
    { value: frac(dy, dx), trap: 'gave the gradient of the radius, not of the tangent' },
    { value: frac(-dy, dx), trap: 'took the negative of the radius gradient without inverting it' },
    { value: frac(dx, dy), trap: 'inverted the radius gradient but forgot the minus sign' },
    { value: x0 !== 0 ? frac(y0, x0) : null, trap: 'used the gradient of the line from the origin to P' },
    { value: y0 !== 0 ? frac(-x0, y0) : null, trap: 'took the perpendicular of the line from the origin to P' },
  ]);
  const byEquation = rng.bool(0.5);
  const stem = byEquation
    ? `The point $P${pt(x0, y0)}$ lies on the circle ${circleTex(p, q, r * r)}. Find the gradient of the tangent to the circle at $P$.`
    : `A circle has centre $C${pt(p, q)}$ and radius $${r}$. The point $P${pt(x0, y0)}$ lies on the circle. Find the gradient of the tangent at $P$.`;
  return {
    stem,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors, { format: 'fraction' }),
    solution: `The radius $CP$ has gradient $\\frac{${dy}}{${dx}} = ${frac(dy, dx).toLatex({ format: 'fraction' })}$, and the tangent is perpendicular to it, so its gradient is $${answer.toLatex({ format: 'fraction' })}$.`,
    trap: 'The tangent is perpendicular to the radius: invert the radius gradient and change its sign.',
    tags: ['circles', 'tangent', 'gradient'],
    params: { variant: 'tangent-gradient', p, q, r, x0, y0 },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 5

function tangentEquationQ(rng: RNG): Generated | null {
  const { dx, dy, r } = radiusVector(rng, 13);
  const p = rng.int(-5, 5), q = rng.int(-5, 5);
  if (p === 0 && q === 0) return null;
  const x0 = p + dx, y0 = q + dy;
  if (Math.abs(x0) > 18 || Math.abs(y0) > 18) return null;
  const C0 = dx * x0 + dy * y0;
  const mk = (A: number, B: number, C: number, trap?: string) => {
    const [a, b, c] = normLine(A, B, C);
    return { display: lineTex(A, B, C), A: a, B: b, C: c, trap };
  };
  const correct = mk(dx, dy, C0);
  const cands = [
    correct,
    mk(dy, -dx, dy * x0 - dx * y0, 'this is the radius CP, not the tangent — the tangent is perpendicular to it'),
    mk(dx, -dy, dx * x0 - dy * y0, 'sign error: the normal to the tangent is (x₀ − a, y₀ − b)'),
    mk(dx, dy, C0 - 2 * r * r, 'used the point diametrically opposite P'),
    mk(dx, dy, r * r, 'treated the centre as the origin, where the tangent is x₀x + y₀y = r²'),
    mk(-dy, dx, -dy * p + dx * q, 'wrote the line through the centre parallel to the tangent'),
  ];
  const seen = new Set([correct.display]);
  const wrong = cands.slice(1).filter((c) => {
    if (seen.has(c.display)) return false;
    seen.add(c.display);
    return true;
  });
  if (wrong.length < 4) return null;
  return {
    stem: `The point $P${pt(x0, y0)}$ lies on the circle with centre $C${pt(p, q)}$ and radius $${r}$. Find the equation of the tangent to the circle at $P$.`,
    answer: { kind: 'choice', value: correct.display },
    options: buildChoiceOptions(rng, correct.display, wrong.map((c) => ({ display: c.display, trap: c.trap }))),
    solution: `$CP$ has gradient $${frac(dy, dx).toLatex({ format: 'fraction' })}$, so the tangent has gradient $${frac(-dx, dy).toLatex({ format: 'fraction' })}$ through $${pt(x0, y0)}$. Tidying up: ${correct.display}.`,
    trap: 'The tangent is perpendicular to the radius and passes through P — check both before choosing.',
    tags: ['circles', 'tangent', 'equation'],
    params: { variant: 'tangent-equation', p, q, r, x0, y0, cands: cands.map((c) => ({ display: c.display, A: c.A, B: c.B, C: c.C })) },
    typedAllowed: false,
  };
}

function tangentLengthQ(rng: RNG): Generated | null {
  const u = rng.nonZeroInt(-12, 12), v = rng.nonZeroInt(-12, 12);
  const dsq = u * u + v * v;
  const r = rng.int(2, 12);
  const Lsq = dsq - r * r;
  if (Lsq <= 0) return null;
  const answer = surd(Lsq);
  if (!isCleanExact(answer).ok) return null;
  const p = rng.int(-5, 5), q = rng.int(-5, 5);
  const x0 = p + u, y0 = q + v;
  if (Math.abs(x0) > 18 || Math.abs(y0) > 18) return null;
  const ct = Math.sqrt(dsq);
  const distractors = cleanOnly([
    { value: E(Lsq), trap: 'forgot to take the square root' },
    { value: surd(dsq + r * r), trap: 'added r² instead of subtracting it' },
    { value: surd(dsq), trap: 'gave the distance from T to the centre' },
    { value: Number.isInteger(ct) && ct - r > 0 ? E(ct - r) : null, trap: 'subtracted the radius from the distance instead of using Pythagoras' },
    { value: E(dsq), trap: 'stopped at CT² without subtracting r² or taking the root' },
    { value: E(r), trap: 'gave the radius' },
    { value: dsq - 2 * r * r > 0 ? surd(dsq - 2 * r * r) : null, trap: 'subtracted r² twice' },
    { value: u * u - r * r > 0 ? surd(u * u - r * r) : null, trap: 'used only one of the coordinate differences' },
  ]);
  return {
    stem: `The circle with centre $C${pt(p, q)}$ has radius $${r}$. The tangent from the point $T${pt(x0, y0)}$ touches the circle at $A$. Find the length $TA$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `$CT^{2} = ${u * u} + ${v * v} = ${dsq}$, and $CA = ${r}$ meets the tangent at right angles, so $TA = \\sqrt{${dsq} - ${r * r}} = ${answer.toLatex()}$.`,
    trap: 'The radius meets the tangent at right angles, so TA² = CT² − r²; adding the squares is the usual slip.',
    tags: ['circles', 'tangent', 'pythagoras'],
    params: { variant: 'tangent-length', p, q, r, x0, y0 },
    typedAllowed: true,
  };
}

function diameterCircleQ(rng: RNG): Generated | null {
  const m = rng.nonZeroInt(-5, 5), n = rng.nonZeroInt(-5, 5);
  const h = rng.nonZeroInt(-6, 6), k = rng.nonZeroInt(-6, 6);
  const rsq = h * h + k * k;
  if (rsq > 80) return null;
  const ax = m - h, ay = n - k, bx = m + h, by = n + k;
  if ([ax, ay, bx, by].some((c) => Math.abs(c) > 12)) return null;
  const mk = (cx: number, cy: number, s: number, trap?: string) => ({ display: circleTex(cx, cy, s), cx, cy, rsq: s, trap });
  const cands = [
    mk(m, n, rsq),
    mk(m, n, 4 * rsq, 'used the whole diameter as the radius'),
    mk(-m, -n, rsq, 'wrote the centre with the wrong signs in the brackets'),
    mk(ax, ay, rsq, 'centred the circle on one end of the diameter'),
    mk(m, n, 2 * rsq, 'halved AB² instead of halving AB before squaring'),
    mk(bx, by, rsq, 'centred the circle on the other end of the diameter'),
  ];
  const seen = new Set([cands[0].display]);
  const wrong = cands.slice(1).filter((c) => {
    if (seen.has(c.display)) return false;
    seen.add(c.display);
    return true;
  });
  if (wrong.length < 4) return null;
  return {
    stem: `$A${pt(ax, ay)}$ and $B${pt(bx, by)}$ are the ends of a diameter of a circle. Find the equation of the circle.`,
    answer: { kind: 'choice', value: cands[0].display },
    options: buildChoiceOptions(rng, cands[0].display, wrong.map((c) => ({ display: c.display, trap: c.trap }))),
    solution: `The centre is the midpoint $${pt(m, n)}$, and $r^{2} = ${h * h} + ${k * k} = ${rsq}$ (half of $AB$), giving ${cands[0].display}.`,
    trap: 'The radius is half of AB, so r² is a quarter of AB² — and the centre is the midpoint, not an end point.',
    tags: ['circles', 'diameter', 'equation'],
    params: { variant: 'diameter-circle', ax, ay, bx, by, cands: cands.map((c) => ({ display: c.display, cx: c.cx, cy: c.cy, rsq: c.rsq })) },
    typedAllowed: false,
  };
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'm1.coord-geom.circles',
  module: 'M1',
  topic: 'coord-geom',
  title: 'Circle equations',
  levels: {
    1: 'centre and radius from (x − a)² + (y − b)² = r²',
    2: 'radius or centre from x² + y² − 4x + 6y − 3 = 0 (completing the square)',
    3: 'inside / on / outside the circle, or the distance from the centre to a point',
    4: 'gradient of the tangent at a point of the circle',
    5: 'equation of the tangent, length of a tangent from an external point, circle on a diameter',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return readOffQ(rng);
        case 2: return completeSquareQ(rng);
        case 3: return pickVariant(rng, [positionQ, positionQ, centreDistanceQ]);
        case 4: return tangentGradientQ(rng);
        default: return pickVariant(rng, [tangentEquationQ, tangentLengthQ, diameterCircleQ]);
      }
    });
  },
  verify(q) {
    const p = q.params as {
      variant: string; a?: number; b?: number; r?: number; p?: number; q?: number; x0?: number; y0?: number;
      D?: number; Ey?: number; F?: number; ax?: number; ay?: number; bx?: number; by?: number;
      cands?: { display: string; d?: number; verdict?: string; A?: number; B?: number; C?: number; cx?: number; cy?: number; rsq?: number }[];
    };
    const close = (x: number, y: number) => Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(y));

    if (p.variant === 'position') {
      if (q.answer.kind !== 'choice' || !p.cands) return false;
      const d = Math.hypot(p.x0! - p.p!, p.y0! - p.q!);
      const truth = verdictOf(d, p.r!);
      const match = p.cands.filter((c) => close(c.d!, d) && c.verdict === truth);
      return match.length === 1 && match[0].display === q.answer.value && q.options.filter((o) => o.correct).length === 1;
    }

    if (p.variant === 'tangent-equation') {
      if (q.answer.kind !== 'choice' || !p.cands) return false;
      const dx = p.x0! - p.p!, dy = p.y0! - p.q!;
      // the tangent passes through P and has CP as a normal
      const match = p.cands.filter((c) => c.A! * p.x0! + c.B! * p.y0! === c.C! && c.A! * dy - c.B! * dx === 0);
      return match.length === 1 && match[0].display === q.answer.value && q.options.filter((o) => o.correct).length === 1;
    }

    if (p.variant === 'diameter-circle') {
      if (q.answer.kind !== 'choice' || !p.cands) return false;
      const cx = (p.ax! + p.bx!) / 2, cy = (p.ay! + p.by!) / 2;
      const rsq = ((p.ax! - p.bx!) ** 2 + (p.ay! - p.by!) ** 2) / 4;
      const match = p.cands.filter((c) => c.cx === cx && c.cy === cy && close(c.rsq!, rsq));
      return match.length === 1 && match[0].display === q.answer.value && q.options.filter((o) => o.correct).length === 1;
    }

    if (q.answer.kind !== 'exact') return false;
    const got = q.answer.value.toNumber();
    switch (p.variant) {
      case 'read-off-radius':
        // the equation printed has r² on the right: the answer squared must reproduce it
        return close(got * got, p.r! * p.r!) && got > 0;
      case 'read-off-centre':
        return close(got, p.a! + p.b!);
      case 'general-radius': {
        // radius straight from the coefficients: r² = (D/2)² + (E/2)² − F
        const rsq = (p.D! / 2) ** 2 + (p.Ey! / 2) ** 2 - p.F!;
        return rsq > 0 && close(got, Math.sqrt(rsq));
      }
      case 'general-centre':
        return close(got, -p.D! / 2 + -p.Ey! / 2);
      case 'centre-distance':
        return close(got, Math.hypot(p.x0! - p.p!, p.y0! - p.q!));
      case 'tangent-gradient': {
        const mRadius = (p.y0! - p.q!) / (p.x0! - p.p!);
        // the point must really lie on the circle, and the gradients must multiply to −1
        const onCircle = close(Math.hypot(p.x0! - p.p!, p.y0! - p.q!), p.r!);
        return onCircle && close(got * mRadius, -1);
      }
      case 'tangent-length': {
        const dsq = (p.x0! - p.p!) ** 2 + (p.y0! - p.q!) ** 2;
        return close(got * got + p.r! * p.r!, dsq) && got > 0;
      }
      default:
        return false;
    }
  },
});
