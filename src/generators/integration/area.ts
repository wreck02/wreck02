import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { poly, signed } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Areas under and between curves.
 * Level 1: area under y = x² from 0 to 3 (9)
 * Level 2: area between y = x(4 − x) and the x-axis (32/3) — the intersections must be found
 * Level 3: between a line y = mx + c and a parabola y = ax² (1/6, 4/3, …)
 * Level 4: between two parabolas, or between a parabola and a line y = k
 * Level 5: the curve crosses the axis (add the absolute values); enclosed by y = 4 − x² and y = 3 (4/3)
 *
 * Every option in an area question is a *positive* number: a negative or zero area is impossible,
 * so such a candidate would be eliminated without doing any work. `cleanOnly` enforces that, and a
 * draw that cannot offer four clean positive named distractors is rejected rather than padded.
 */

type Poly = number[]; // coefficients, highest power first

function horner(c: Poly, x: number): number {
  return c.reduce((acc, v) => acc * x + v, 0);
}

/** Exact value of a polynomial at an exact x (used for half-integer midpoints). */
function evalAt(c: Poly, x: Exact): Exact {
  return c.reduce((acc, v) => acc.mul(x).add(E(v)), Exact.ZERO);
}

/** f − g, right-aligned. */
function sub(f: Poly, g: Poly): Poly {
  const n = Math.max(f.length, g.length);
  const out = new Array<number>(n).fill(0);
  f.forEach((v, i) => { out[n - f.length + i] += v; });
  g.forEach((v, i) => { out[n - g.length + i] -= v; });
  return out;
}

/** Exact ∫_a^b of a polynomial. */
function defInt(c: Poly, a: number, b: number): Exact {
  const n = c.length - 1;
  return c.reduce((s, v, i) => {
    const p = n - i;
    return s.add(frac(v, p + 1).mul(E(b).pow(p + 1).sub(E(a).pow(p + 1))));
  }, Exact.ZERO);
}

/** Wrong power rules applied to a definite integral: no division by the new power / division by the old one. */
function noDivInt(c: Poly, a: number, b: number): Exact {
  const n = c.length - 1;
  return c.reduce((s, v, i) => s.add(E(v).mul(E(b).pow(n - i + 1).sub(E(a).pow(n - i + 1)))), Exact.ZERO);
}
function oldPowInt(c: Poly, a: number, b: number): Exact {
  const n = c.length - 1;
  return c.reduce((s, v, i) => {
    const p = n - i;
    const coef = p === 0 ? E(v) : frac(v, p);
    return s.add(coef.mul(E(b).pow(p + 1).sub(E(a).pow(p + 1))));
  }, Exact.ZERO);
}
/** Divided by the new power but forgot to raise it: ∫ c x^p → (c/(p+1)) x^p. Under-counts. */
function samePowInt(c: Poly, a: number, b: number): Exact {
  const n = c.length - 1;
  return c.reduce((s, v, i) => {
    const p = n - i;
    return s.add(frac(v, p + 1).mul(E(b).pow(p).sub(E(a).pow(p))));
  }, Exact.ZERO);
}

/** "8 - x^{2}", "4x - x^{2}": a polynomial with negative leading coefficient is printed in ascending powers. */
function nice(c: Poly): string {
  if (c[0] >= 0) return poly(c);
  const n = c.length - 1;
  let s = '';
  for (let i = c.length - 1; i >= 0; i--) {
    const p = n - i;
    if (c[i] === 0) continue;
    s += signed(c[i], p === 0 ? '' : p === 1 ? 'x' : `x^{${p}}`, s === '');
  }
  return s || '0';
}

const Y = (c: Poly): string => `$y = ${nice(c)}$`;

/** Antiderivative for display: "\frac{1}{3}x^{3} + x", coefficient 1 omitted. */
function antiTex(c: Poly): string {
  const n = c.length - 1;
  let s = '';
  c.forEach((coef, i) => {
    if (coef === 0) return;
    const p = n - i + 1;
    const k = frac(coef, p);
    const mag = k.abs().toLatex({ format: 'fraction' });
    const body = `${mag === '1' ? '' : mag}${p === 1 ? 'x' : `x^{${p}}`}`;
    s += s === '' ? `${k.sign() < 0 ? '-' : ''}${body}` : `${k.sign() < 0 ? ' - ' : ' + '}${body}`;
  });
  return s || '0';
}

type Candidate = { value: Exact | null; trap: string };

/** Areas are positive: a wrong route giving 0 or a negative value is not an option the exam would print. */
function cleanOnly(ds: Candidate[]): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } =>
    d.value !== null && Number.isFinite(d.value.toNumber()) && d.value.toNumber() > 1e-12 && isCleanExact(d.value).ok);
}

/**
 * Choose the distractors. A target number of options *below* the answer is drawn first and the
 * pool is then read from whichever side is still short, so the answer's position in the sorted
 * option list is close to uniform instead of always (say) the second smallest.
 * Returns null when there are not four distinct candidates: the caller redraws rather than let
 * `buildOptions` pad with unlabelled generic perturbations.
 */
function ranked(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], count = 4): Distractor[] | null {
  const seen: Exact[] = [answer];
  const out: Distractor[] = [];
  const take = (d: Distractor) => {
    if (out.length >= count || seen.some((s) => s.equals(d.value))) return;
    seen.push(d.value);
    out.push(d);
  };
  must.forEach(take);
  const wantBelow = rng.int(0, count);
  const pool = rng.shuffle(extra).filter((d) => !seen.some((s) => s.equals(d.value)));
  const isBelow = (d: Distractor) => d.value.cmp(answer) < 0;
  while (out.length < count) {
    const needBelow = out.filter(isBelow).length < wantBelow;
    let i = pool.findIndex((d) => isBelow(d) === needBelow);
    if (i < 0) i = 0;
    if (pool.length === 0) return null;
    take(pool[i]);
    pool.splice(i, 1);
  }
  return out;
}

function options(rng: RNG, answer: Exact, must: Candidate[], extra: Candidate[]) {
  const ds = ranked(rng, answer, cleanOnly(must), cleanOnly(extra));
  return ds && buildOptions(rng, answer, ds, { format: 'fraction' });
}

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

function simpson(f: (x: number) => number, a: number, b: number, n = 400): number {
  if (a === b) return 0;
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
  return (s * h) / 3;
}

/** Real roots of a polynomial in [−15, 15] by sign changes on an offset grid and bisection (verify only). */
function roots(c: Poly): number[] {
  const out: number[] = [];
  const N = 6000, lo = -15, hi = 15;
  const step = (hi - lo) / N;
  let x0 = lo + 0.3141 * step, y0 = horner(c, x0);
  for (let i = 1; i <= N; i++) {
    const x1 = lo + (i + 0.3141) * step, y1 = horner(c, x1);
    if (y0 === 0) out.push(x0);
    else if (y0 * y1 < 0) {
      let a = x0, b = x1, fa = y0;
      for (let k = 0; k < 80; k++) {
        const m = (a + b) / 2, fm = horner(c, m);
        if (fa * fm <= 0) b = m; else { a = m; fa = fm; }
      }
      out.push((a + b) / 2);
    }
    x0 = x1; y0 = y1;
  }
  return out;
}

const L = (x: Exact): string => x.toLatex({ format: 'fraction' });

interface Built {
  stem: string;
  answer: Exact;
  must: Candidate[];
  extra: Candidate[];
  solution: string;
  trap: string;
  tags: string[];
  params: { variant: string; f: Poly; g: Poly; lo: number | null; hi: number | null };
}

function finish(rng: RNG, b: Built): Generated | null {
  if (!isCleanExact(b.answer).ok || b.answer.toNumber() <= 0 || b.answer.toNumber() > 150) return null;
  const opts = options(rng, b.answer, b.must, b.extra);
  if (!opts) return null;
  return {
    stem: b.stem,
    answer: { kind: 'exact', value: b.answer },
    options: opts,
    solution: b.solution,
    trap: b.trap,
    tags: ['integration', 'area', ...b.tags],
    params: b.params,
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 1

function underQ(rng: RNG): Generated | null {
  const n = rng.pick([2, 2, 3]);
  const a = rng.pick([1, 1, 1, 2, 3]);
  const k = rng.pick([0, 0, 0, 1, 2, 3]);
  const lo = rng.bool(0.3) ? 1 : 0;
  const hi = rng.pick([1, 2, 3, 4].filter((v) => v > lo && (n === 2 || v <= 3)));
  const f: Poly = n === 2 ? [a, 0, k] : [a, 0, 0, k];
  const area = defInt(f, lo, hi);
  if (area.toNumber() > 100) return null;
  const fhi = horner(f, hi);
  const mid = frac(lo + hi, 2);
  const must: Candidate[] = [
    { value: noDivInt(f, lo, hi), trap: 'did not divide by the new power when integrating' },
    { value: E(hi - lo).mul(evalAt(f, mid)), trap: 'used base × the height at the middle of the interval, as if the region were a rectangle' },
  ];
  const extra: Candidate[] = [
    { value: frac((hi - lo) * fhi, 2), trap: 'used ½ × base × height as if the region were a triangle' },
    { value: E((hi - lo) * fhi), trap: 'used base × height as if the region were a rectangle' },
    { value: oldPowInt(f, lo, hi), trap: 'divided by the old power instead of the new one' },
    { value: samePowInt(f, lo, hi), trap: 'divided by the new power but forgot to raise the power' },
    { value: E(fhi - horner(f, lo)), trap: 'substituted the limits into y instead of integrating' },
    { value: k !== 0 ? defInt([...f.slice(0, -1), 0], lo, hi) : null, trap: `dropped the constant ${k} when integrating` },
    { value: k !== 0 ? E(k * (hi - lo)) : null, trap: 'integrated the constant term only' },
    { value: lo !== 0 ? defInt(f, 0, hi) : null, trap: 'forgot to subtract the value at the lower limit' },
    { value: area.mulRat(2), trap: 'doubled the integral' },
  ];
  const stem = rng.bool(0.5)
    ? `Find the area of the region bounded by the curve ${Y(f)}, the $x$-axis and the lines $x = ${lo}$ and $x = ${hi}$.`
    : `Find the area under the curve ${Y(f)} between $x = ${lo}$ and $x = ${hi}$.`;
  return finish(rng, {
    stem,
    answer: area,
    must, extra,
    solution: `The curve is above the axis here, so area $= \\int_{${lo}}^{${hi}} (${nice(f)})\\,dx = \\left[${antiTex(f)}\\right]_{${lo}}^{${hi}} = ${L(area)}$.`,
    trap: 'Area under a curve is the definite integral, not a triangle or rectangle formula: integrate, then substitute the limits.',
    tags: ['under-curve'],
    params: { variant: 'under', f, g: [0], lo, hi },
  });
}

// ----------------------------------------------------------------------------- level 2

function parabolaAxisQ(rng: RNG): Generated | null {
  const a = rng.pick([1, 1, 1, 2]);
  const r1 = rng.int(-4, 3);
  const w = rng.pick([2, 3, 4, 5, 6]);
  const r2 = r1 + w;
  if (r2 > 6) return null;
  const below = rng.bool(0.35);
  const s = (below ? 1 : -1) * a;
  const f: Poly = [s, -s * (r1 + r2), s * r1 * r2];
  if (f.some((v) => Math.abs(v) > 30)) return null;
  const area = frac(a * w ** 3, 6);
  const signedInt = defInt(f, r1, r2);
  const curve = r1 === 0 && !below && a === 1 ? `$y = x(${w} - x)$` : Y(f);
  // A region below the axis gives a negative integral, but −area is never offered: an area cannot be
  // negative, so the pair (+A, −A) would hand the answer over. The sign is explained in the solution.
  const must: Candidate[] = [
    { value: r1 !== 0 && r2 !== 0 ? defInt(f, 0, r2).abs() : defInt(f, r1 === 0 ? 0 : r1, r1 === 0 ? 1 : r1 + 1).abs(),
      trap: r1 !== 0 && r2 !== 0 ? `integrated from 0 instead of from the first intersection x = ${r1}` : `integrated from ${r1 === 0 ? '0 to 1' : `${r1} to ${r1 + 1}`} without finding where the curve meets the axis` },
    { value: frac(a * w ** 3, 8), trap: 'used ½ × base × height with the vertex height, as if the region were a triangle' },
  ];
  const extra: Candidate[] = [
    { value: frac(a * w ** 3, 4), trap: 'used base × height, as if the region were a rectangle' },
    { value: frac(a * w ** 3, 3), trap: 'forgot the ½ from the x² term' },
    { value: frac(a * w ** 3, 12), trap: 'integrated only as far as the vertex: that is half the region' },
    { value: noDivInt(f, r1, r2).abs(), trap: 'did not divide by the new powers when integrating' },
    { value: oldPowInt(f, r1, r2).abs(), trap: 'divided by the old powers instead of the new ones' },
    { value: samePowInt(f, r1, r2).abs(), trap: 'divided by the new powers but forgot to raise them' },
    { value: frac(a * w * w, 4), trap: 'gave the greatest height of the region' },
    { value: E(w), trap: 'gave the width of the region' },
  ];
  return finish(rng, {
    stem: `Find the area of the region enclosed by the curve ${curve} and the $x$-axis.`,
    answer: area,
    must, extra,
    solution: `The curve meets the axis where $${nice(f)} = 0$, i.e. $x = ${r1}$ and $x = ${r2}$. $\\int_{${r1}}^{${r2}} (${nice(f)})\\,dx = ${L(signedInt)}$${below ? ', negative because the region is below the axis' : ''}, so the area is $${L(area)}$.`,
    trap: 'Solve y = 0 to find the limits first; a region below the axis gives a negative integral whose modulus is the area.',
    tags: ['between-curve-and-axis', 'intersections'],
    params: { variant: 'parabola-axis', f, g: [0], lo: null, hi: null },
  });
}

// ----------------------------------------------------------------------------- level 3

function lineParabolaQ(rng: RNG): Generated | null {
  const a = rng.pick([1, 1, 2, 3]);
  const r1 = rng.int(-5, 4);
  const w = rng.pick([1, 2, 2, 3, 3, 4, 5, 6]);
  const r2 = r1 + w;
  if (r2 > 6 || a * w ** 3 > 900) return null;
  const m = a * (r1 + r2);
  const c = -a * r1 * r2;
  if (m === 0 || Math.abs(m) > 14 || Math.abs(c) > 30) return null;
  const line: Poly = [m, c];
  const para: Poly = [a, 0, 0];
  const area = frac(a * w ** 3, 6);
  const diff = sub(line, para); // mx + c − ax²
  const must: Candidate[] = [
    { value: defInt(para, r1, r2).abs(), trap: 'found the area under the parabola only' },
    { value: defInt(line, r1, r2).abs(), trap: 'found the area under the line only' },
  ];
  const extra: Candidate[] = [
    { value: frac(a * w ** 3, 8), trap: 'treated the region as a triangle: ½ × width × the greatest gap between the curves' },
    { value: frac(a * w ** 3, 12), trap: 'integrated only as far as the midpoint: that is half the region' },
    { value: defInt(para, r1, r2).abs().add(defInt(line, r1, r2).abs()), trap: 'added the two integrals instead of subtracting' },
    { value: a !== 1 ? frac(w ** 3, 6) : null, trap: `ignored the coefficient ${a} of x²` },
    { value: r1 !== 0 && r2 !== 0 ? defInt(diff, 0, r2).abs() : null, trap: 'integrated from 0 instead of from the first intersection' },
    { value: noDivInt(diff, r1, r2).abs(), trap: 'did not divide by the new powers' },
    { value: oldPowInt(diff, r1, r2).abs(), trap: 'divided by the old powers instead of the new ones' },
    { value: samePowInt(diff, r1, r2).abs(), trap: 'divided by the new powers but forgot to raise them' },
    { value: frac(a * w ** 3, 2), trap: 'forgot to divide the x³ term by 3' },
    { value: frac(a * w ** 3, 3), trap: 'doubled the area' },
  ];
  return finish(rng, {
    stem: `Find the area of the region enclosed by the line ${Y(line)} and the curve ${Y(para)}.`,
    answer: area,
    must, extra,
    solution: `They meet where $${nice(para)} = ${nice(line)}$, i.e. $x = ${r1}$ and $x = ${r2}$; the line is on top between them. Area $= \\int_{${r1}}^{${r2}} (${nice(diff)})\\,dx = \\left[${antiTex(diff)}\\right]_{${r1}}^{${r2}} = ${L(area)}$.`,
    trap: 'Find the intersections, then integrate (top curve − bottom curve) between them; neither curve alone gives the area.',
    tags: ['between-curves', 'intersections'],
    params: { variant: 'line-parabola', f: line, g: para, lo: null, hi: null },
  });
}

// ----------------------------------------------------------------------------- level 4

function twoParabolasQ(rng: RNG): Generated | null {
  const r1 = rng.int(-3, 2);
  const w = rng.pick([1, 2, 2, 3, 4]);
  const r2 = r1 + w;
  if (r2 > 3) return null;
  const s = rng.pick([0, 0, 1, -1, 2, -2]);
  const t = rng.pick([0, 1, -1, 2, -2, 3, 4]);
  const f: Poly = [1, s, t];
  const g: Poly = [-1, s + 2 * (r1 + r2), t - 2 * r1 * r2];
  if (g.some((v) => Math.abs(v) > 12) || f.some((v) => Math.abs(v) > 12)) return null;
  const diff = sub(g, f); // = −2(x − r1)(x − r2) ≥ 0 between the roots
  const area = frac(w ** 3, 3);
  const must: Candidate[] = [
    { value: frac(w ** 3, 6), trap: 'subtracted only one of the x² terms: the difference has leading coefficient 2' },
    { value: defInt(f, r1, r2).abs(), trap: 'integrated the lower curve only' },
  ];
  const extra: Candidate[] = [
    { value: defInt(g, r1, r2).abs(), trap: 'integrated the upper curve only' },
    { value: frac(w ** 3, 12), trap: 'integrated only as far as the midpoint: that is half the region' },
    { value: frac(w ** 3, 4), trap: 'treated the region as a triangle: ½ × width × the greatest gap between the curves' },
    { value: r1 !== 0 && r2 !== 0 ? defInt(diff, 0, r2).abs() : null, trap: 'integrated from 0 instead of from the first intersection' },
    { value: area.mulRat(2), trap: 'doubled the area' },
    { value: noDivInt(diff, r1, r2).abs(), trap: 'did not divide by the new powers' },
    { value: samePowInt(diff, r1, r2).abs(), trap: 'divided by the new powers but forgot to raise them' },
    { value: E(w ** 3), trap: 'forgot to divide the x³ term by 3' },
  ];
  const eq = sub(f, g); // 2x² − 2(r1 + r2)x + 2 r1 r2
  return finish(rng, {
    stem: `Find the area of the region enclosed by the curves ${Y(f)} and ${Y(g)}.`,
    answer: area,
    must, extra,
    solution: `Equate: $${nice(eq)} = 0$, i.e. $2(x ${r1 >= 0 ? '-' : '+'} ${Math.abs(r1)})(x ${r2 >= 0 ? '-' : '+'} ${Math.abs(r2)}) = 0$, so the curves meet at $x = ${r1}$ and $x = ${r2}$. Area $= \\int_{${r1}}^{${r2}} (${nice(diff)})\\,dx = ${L(area)}$.`,
    trap: 'Subtract the whole of one equation from the other before integrating: both x² terms contribute, giving a leading coefficient of 2.',
    tags: ['between-curves', 'two-parabolas'],
    params: { variant: 'two-parabolas', f, g, lo: null, hi: null },
  });
}

function curveLineQ(rng: RNG): Generated | null {
  const r1 = rng.int(-3, 2);
  const w = rng.pick([2, 3, 4, 5]);
  const r2 = r1 + w;
  if (r2 > 4) return null;
  const k = rng.int(-4, 6);
  const up = rng.bool(0.6);
  const f: Poly = up ? [1, -(r1 + r2), k + r1 * r2] : [-1, r1 + r2, k - r1 * r2];
  const g: Poly = [k];
  if (f.some((v) => Math.abs(v) > 15)) return null;
  const diff = up ? sub(g, f) : sub(f, g);
  const area = frac(w ** 3, 6);
  const disc = f[1] * f[1] - 4 * f[0] * f[2];
  const sq = Math.round(Math.sqrt(Math.max(0, disc)));
  const ownRoots = disc > 0 && sq * sq === disc && (-f[1] - sq) % (2 * f[0]) === 0 ? [(-f[1] - sq) / (2 * f[0]), (-f[1] + sq) / (2 * f[0])].sort((x, y) => x - y) : null;
  const must: Candidate[] = [
    { value: defInt(f, r1, r2).abs(), trap: 'integrated the curve alone and forgot to subtract the line' },
    { value: k !== 0 ? E(Math.abs(k) * w) : null, trap: 'found the rectangle under the line only' },
  ];
  const extra: Candidate[] = [
    { value: ownRoots && (ownRoots[0] !== r1 || ownRoots[1] !== r2) ? defInt(diff, ownRoots[0], ownRoots[1]).abs() : null, trap: 'used the x-intercepts of the parabola as the limits instead of the intersections with the line' },
    { value: frac(w ** 3, 8), trap: 'treated the region as a triangle: ½ × width × the greatest gap between the curves' },
    { value: frac(w ** 3, 12), trap: 'integrated only as far as the midpoint: that is half the region' },
    { value: r1 !== 0 && r2 !== 0 ? defInt(diff, 0, r2).abs() : null, trap: 'integrated from 0 instead of from the first intersection' },
    { value: frac(w ** 3, 3), trap: 'doubled the area' },
    { value: noDivInt(diff, r1, r2).abs(), trap: 'did not divide by the new powers' },
    { value: samePowInt(diff, r1, r2).abs(), trap: 'divided by the new powers but forgot to raise them' },
    { value: frac(w ** 3, 2), trap: 'forgot to divide the x³ term by 3' },
  ];
  const eq = up ? sub(f, g) : sub(g, f);
  return finish(rng, {
    stem: `Find the area of the region enclosed by the curve ${Y(f)} and the line $y = ${k}$.`,
    answer: area,
    must, extra,
    solution: `Intersections: $${nice(f)} = ${k}$ gives $${nice(eq)} = 0$, so $x = ${r1}$ and $x = ${r2}$. Area $= \\int_{${r1}}^{${r2}} (${nice(diff)})\\,dx = ${L(area)}$.`,
    trap: 'Set the curve equal to the line to find the limits, then integrate (top − bottom); the parabola\'s own x-intercepts are not the limits.',
    tags: ['between-curves', 'horizontal-line'],
    params: { variant: 'curve-line', f, g, lo: null, hi: null },
  });
}

// ----------------------------------------------------------------------------- level 5

function cubicCrossQ(rng: RNG): Generated | null {
  const kind = rng.pick(['odd', 'odd', 'shifted']);
  const j = rng.pick([1, 1, 2, 3]);
  let f: Poly, lo: number, hi: number, mid: number, lobe: Exact, crossings: string;
  if (kind === 'odd') {
    const a = rng.pick([1, 2, 2, 3, 4]);
    if (j * a ** 4 > 300) return null;
    f = [j, 0, -j * a * a, 0]; lo = -a; hi = a; mid = 0;
    lobe = frac(j * a ** 4, 4);
    crossings = `$${j === 1 ? '' : j}x(x^{2} - ${a * a}) = 0$, so the curve crosses at $x = -${a}, 0, ${a}$`;
  } else {
    const p = rng.pick([1, 2, 3]);
    if (j * p ** 4 > 300) return null;
    f = [j, -3 * j * p, 2 * j * p * p, 0]; lo = 0; hi = 2 * p; mid = p;
    lobe = frac(j * p ** 4, 4);
    crossings = `$${j === 1 ? '' : j}x(x - ${p})(x - ${2 * p}) = 0$, so the curve crosses at $x = 0, ${p}, ${2 * p}$`;
  }
  if (f.some((v) => Math.abs(v) > 40)) return null;
  const area = lobe.mulRat(2);
  const must: Candidate[] = [
    { value: lobe, trap: 'found the area of one of the two regions only' },
    { value: noDivInt(f, lo, mid).abs().add(noDivInt(f, mid, hi).abs()), trap: 'did not divide by the new powers' },
  ];
  const extra: Candidate[] = [
    { value: area.mulRat(2), trap: 'doubled the total' },
    { value: lobe.mulRat(frac(1, 2).toRat()), trap: 'integrated only as far as the turning point of one region' },
    { value: area.mulRat(frac(4, 3).toRat()), trap: 'divided x⁴ by 3 instead of by 4' },
    { value: oldPowInt(f, lo, mid).abs().add(oldPowInt(f, mid, hi).abs()), trap: 'divided by the old powers' },
    { value: samePowInt(f, lo, mid).abs().add(samePowInt(f, mid, hi).abs()), trap: 'divided by the new powers but forgot to raise them' },
    { value: area.mulRat(frac(2, 3).toRat()), trap: 'used x⁴/6 in place of x⁴/4 when integrating' },
    { value: E(hi - lo).mul(lobe), trap: 'multiplied one region by the width of the interval' },
  ];
  return finish(rng, {
    stem: `Find the total area of the regions enclosed between the curve ${Y(f)} and the $x$-axis.`,
    answer: area,
    must, extra,
    solution: `${crossings}. By symmetry the two regions are equal: $\\left|\\int_{${lo}}^{${mid}} (${nice(f)})\\,dx\\right| = ${L(lobe)}$, so the total area is $2 \\times ${L(lobe)} = ${L(area)}$. (One integral over the whole range gives 0, because the two regions cancel.)`,
    trap: 'When the curve crosses the axis inside the interval, integrate each region separately and add the moduli; one integral over the whole range cancels them.',
    tags: ['cross-axis', 'cubic', 'symmetry'],
    params: { variant: 'cubic-cross', f, g: [0], lo, hi },
  });
}

function parabolaCrossQ(rng: RNG): Generated | null {
  const kind = rng.pick(['x2-m2', 'x2-mx']);
  const m = kind === 'x2-m2' ? rng.pick([1, 2, 2, 3, 4]) : rng.pick([2, 3, 4, 5]);
  const T = m + rng.pick([1, 2, 3]);
  const f: Poly = kind === 'x2-m2' ? [1, 0, -m * m] : [1, -m, 0];
  const A1 = defInt(f, 0, m).abs();
  const A2 = defInt(f, m, T);
  const area = A1.add(A2);
  const must: Candidate[] = [
    { value: A2.sub(A1), trap: 'gave the signed integral over the whole interval, letting the two regions cancel' },
    { value: A2.sub(A1).abs(), trap: 'took the modulus of the single integral over the whole interval' },
  ];
  const extra: Candidate[] = [
    { value: A1, trap: 'found the region below the axis only' },
    { value: A2, trap: 'found the region above the axis only' },
    { value: A1.mulRat(2), trap: 'doubled the first region as if the two were equal' },
    { value: A2.mulRat(2), trap: 'doubled the second region as if the two were equal' },
    { value: noDivInt(f, 0, m).abs().add(noDivInt(f, m, T).abs()), trap: 'did not divide by the new powers' },
    { value: samePowInt(f, 0, m).abs().add(samePowInt(f, m, T).abs()), trap: 'divided by the new powers but forgot to raise them' },
    { value: defInt(f, 0, T).abs().add(A1.mulRat(2)), trap: 'added twice the lower region to the whole signed integral' },
  ];
  return finish(rng, {
    stem: `Find the total area of the regions bounded by the curve ${Y(f)}, the $x$-axis and the lines $x = 0$ and $x = ${T}$.`,
    answer: area,
    must, extra,
    solution: `The curve crosses the axis at $x = ${m}$. $\\int_{0}^{${m}} (${nice(f)})\\,dx = ${L(A1.neg())}$ (below the axis) and $\\int_{${m}}^{${T}} (${nice(f)})\\,dx = ${L(A2)}$, so the total area is $${L(A1)} + ${L(A2)} = ${L(area)}$.`,
    trap: 'Split the integral where the curve crosses the axis and add the moduli of the two parts; a single integral lets them cancel.',
    tags: ['cross-axis', 'parabola'],
    params: { variant: 'parabola-cross', f, g: [0], lo: 0, hi: T },
  });
}

function enclosedByLineQ(rng: RNG): Generated | null {
  const r = rng.pick([1, 1, 2, 3]);
  const down = rng.bool(0.6);
  const d = rng.intExcluding(-4, 6, [0]); // the line y = d (not the x-axis itself)
  const c = down ? d + r * r : d - r * r; // parabola y = c − x² or y = x² + c
  if (Math.abs(c) > 14) return null;
  const f: Poly = down ? [-1, 0, c] : [1, 0, c];
  const g: Poly = [d];
  const diff = down ? sub(f, g) : sub(g, f); // r² − x²
  const area = frac(4 * r ** 3, 3);
  const sq = Math.round(Math.sqrt(Math.abs(c)));
  const ownInt = down && c > 0 && sq * sq === c && sq !== r;
  const must: Candidate[] = [
    { value: defInt(f, -r, r).abs(), trap: 'integrated the curve alone and forgot to subtract the line' },
    { value: frac(2 * r ** 3, 3), trap: 'integrated from 0 to r only (half the region)' },
  ];
  const extra: Candidate[] = [
    { value: ownInt ? defInt(diff, -sq, sq).abs() : null, trap: `used the x-intercepts ±${sq} of the parabola as the limits` },
    { value: E(2 * r ** 3), trap: 'found the rectangle 2r × r² around the region' },
    { value: E(r ** 3), trap: 'treated the region as a triangle: ½ × 2r × r²' },
    { value: E(Math.abs(d) * 2 * r), trap: 'found the rectangle under the line only' },
    { value: noDivInt(diff, -r, r).abs(), trap: 'did not divide by the new power' },
    { value: samePowInt(diff, -r, r).abs(), trap: 'divided by the new power but forgot to raise it' },
    { value: frac(8 * r ** 3, 3), trap: 'doubled the area' },
    { value: E(r * r), trap: 'gave the greatest height of the region' },
  ];
  return finish(rng, {
    stem: `Find the area of the region enclosed by the curve ${Y(f)} and the line $y = ${d}$.`,
    answer: area,
    must, extra,
    solution: `They meet where $${nice(f)} = ${d}$, i.e. $x = \\pm ${r}$. Area $= \\int_{-${r}}^{${r}} (${nice(diff)})\\,dx = 2\\left[${r * r === 1 ? '' : r * r}x - \\frac{x^{3}}{3}\\right]_{0}^{${r}} = 2\\left(${r ** 3} - ${L(frac(r ** 3, 3))}\\right) = ${L(area)}$.`,
    trap: 'The limits come from curve = line (here x = ±r), and the integrand is the difference of the two, which simplifies to r² − x².',
    tags: ['between-curves', 'horizontal-line'],
    params: { variant: 'enclosed-line', f, g, lo: null, hi: null },
  });
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'm2.integration.area',
  module: 'M2',
  topic: 'integration',
  title: 'Areas under and between curves',
  levels: {
    1: 'area under y = x² from 0 to 3 (9)',
    2: 'between y = x(4 − x) and the x-axis (32/3): find the intersections',
    3: 'between a line y = mx + c and y = ax² (1/6, 4/3, …)',
    4: 'between two parabolas; between a parabola and y = k',
    5: 'curve crossing the axis (add the moduli); enclosed by y = 4 − x² and y = 3 (4/3)',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return underQ(rng);
        case 2: return parabolaAxisQ(rng);
        case 3: return lineParabolaQ(rng);
        case 4: return pickVariant(rng, [twoParabolasQ, curveLineQ]);
        default: return pickVariant(rng, [cubicCrossQ, parabolaCrossQ, enclosedByLineQ]);
      }
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const { f, g, lo, hi } = q.params as { f: Poly; g: Poly; lo: number | null; hi: number | null };
    const h = sub(f, g);
    const fn = (x: number) => horner(h, x);
    // intersections found numerically; the region runs between the outermost ones unless limits are given
    const rs = roots(h).filter((r, i, arr) => i === 0 || Math.abs(r - arr[i - 1]) > 1e-6);
    const a = lo ?? (rs.length >= 2 ? rs[0] : NaN);
    const b = hi ?? (rs.length >= 2 ? rs[rs.length - 1] : NaN);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !(b > a)) return false;
    const cuts = [a, ...rs.filter((r) => r > a + 1e-9 && r < b - 1e-9), b];
    let area = 0;
    for (let i = 0; i + 1 < cuts.length; i++) area += Math.abs(simpson(fn, cuts[i], cuts[i + 1]));
    const got = q.answer.value.toNumber();
    return Math.abs(area - got) <= 1e-6 * Math.max(1, got);
  },
});
