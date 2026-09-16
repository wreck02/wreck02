import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { poly, signed } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Integration in kinematics (straight-line motion, SI units).
 * Level 1: v = 2t + 3, displacement from t = 0 to 2 (10 m)
 * Level 2: a = 6t, v(0) = 2 → v(2) = 14 m s⁻¹
 * Level 3: v = 3t² − 12, s(0) = 0 → s when the particle is at rest (−16 m)
 * Level 4: distance travelled (not displacement) when v changes sign: v = t² − 4 on [0, 3] → 23/3 m
 * Level 5: time to return to the start (s = 0); two-stage motion; a = kt with u ≠ 0 → displacement
 *
 * Distractor policy. A distance is positive and a time is positive, so any option that is not is a
 * free elimination: `positive` removes them. Every option carries the unit of the quantity asked,
 * so a value of another kind (a time offered for a displacement) is never used. The rest is drawn
 * from both sides of the answer (`ranked`) so that "pick the second largest" does not work, and a
 * draw that cannot offer four clean named distractors is rejected rather than padded.
 */

type Poly = number[]; // coefficients in t, highest power first

function horner(c: Poly, x: number): number {
  return c.reduce((acc, v) => acc * x + v, 0);
}

/** Exact ∫_a^b of a polynomial. */
function defInt(c: Poly, a: number, b: number): Exact {
  const n = c.length - 1;
  return c.reduce((s, v, i) => {
    const p = n - i;
    return s.add(frac(v, p + 1).mul(E(b).pow(p + 1).sub(E(a).pow(p + 1))));
  }, Exact.ZERO);
}

/** Integration with no division by the new power (a common slip). */
function noDivInt(c: Poly, a: number, b: number): Exact {
  const n = c.length - 1;
  return c.reduce((s, v, i) => s.add(E(v).mul(E(b).pow(n - i + 1).sub(E(a).pow(n - i + 1)))), Exact.ZERO);
}

/** Divided by the old power instead of the new one. */
function oldPowInt(c: Poly, a: number, b: number): Exact {
  const n = c.length - 1;
  return c.reduce((s, v, i) => {
    const p = n - i;
    const coef = p === 0 ? E(v) : frac(v, p);
    return s.add(coef.mul(E(b).pow(p + 1).sub(E(a).pow(p + 1))));
  }, Exact.ZERO);
}

/** Divided by the new power but forgot to raise it. */
function samePowInt(c: Poly, a: number, b: number): Exact {
  const n = c.length - 1;
  return c.reduce((s, v, i) => {
    const p = n - i;
    return s.add(frac(v, p + 1).mul(E(b).pow(p).sub(E(a).pow(p))));
  }, Exact.ZERO);
}

/** Antiderivative coefficients (exact) for display: [c/(p+1) …, 0]. */
function antiTex(c: Poly, v = 't'): string {
  const n = c.length - 1;
  let s = '';
  c.forEach((coef, i) => {
    if (coef === 0) return;
    const p = n - i + 1;
    const k = frac(coef, p);
    const mag = k.abs().toLatex({ format: 'fraction' });
    const body = `${mag === '1' ? '' : mag}${p === 1 ? v : `${v}^{${p}}`}`;
    s += s === '' ? `${k.sign() < 0 ? '-' : ''}${body}` : `${k.sign() < 0 ? ' - ' : ' + '}${body}`;
  });
  return s || '0';
}

/** "4 - 2t", "4t - 3t^{2}": a polynomial with negative leading coefficient is printed in ascending powers. */
function nice(c: Poly, v = 't'): string {
  if (c[0] >= 0) return poly(c, v);
  const n = c.length - 1;
  let s = '';
  for (let i = c.length - 1; i >= 0; i--) {
    const p = n - i;
    if (c[i] === 0) continue;
    s += signed(c[i], p === 0 ? '' : p === 1 ? v : `${v}^{${p}}`, s === '');
  }
  return s || '0';
}

const M = '\\text{m}';
const MS = '\\text{m s}^{-1}';
const S = '\\text{s}';
const V = (c: Poly): string => `$v = ${nice(c)}$ m s$^{-1}$`;
const A = (c: Poly): string => `$a = ${nice(c)}$ m s$^{-2}$`;

type Candidate = { value: Exact | null; trap: string };

function cleanOnly(ds: Candidate[]): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } => d.value !== null && Number.isFinite(d.value.toNumber()) && isCleanExact(d.value).ok);
}

/** A distance, a speed or a time cannot be zero or negative here: drop such a candidate. */
function positive(ds: Candidate[]): Candidate[] {
  return ds.map((d) => (d.value && d.value.toNumber() > 1e-12 ? d : { value: null, trap: d.trap }));
}

/** Keep only candidates on the same side of zero as the answer (used where the sign is stated in the stem). */
function sameSign(ds: Candidate[], answer: Exact): Candidate[] {
  return ds.map((d) => (d.value && d.value.sign() === answer.sign() ? d : { value: null, trap: d.trap }));
}

/**
 * Headline traps first, then fill from both sides of the answer: a target number of options below
 * the answer is drawn before the rest, so the answer's place in the sorted list moves around
 * instead of being (say) the second largest every time. Returns null when there are not four
 * distinct named candidates, so the caller redraws rather than letting `buildOptions` pad.
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
    if (pool.length === 0) return null;
    const needBelow = out.filter(isBelow).length < wantBelow;
    let i = pool.findIndex((d) => isBelow(d) === needBelow);
    if (i < 0) i = 0;
    take(pool[i]);
    pool.splice(i, 1);
  }
  return out;
}

function options(rng: RNG, answer: Exact, must: Candidate[], extra: Candidate[], unit: string) {
  const ds = ranked(rng, answer, cleanOnly(must), cleanOnly(extra));
  return ds && buildOptions(rng, answer, ds, { format: 'fraction', unit });
}

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

function simpson(f: (x: number) => number, a: number, b: number, n = 2000): number {
  if (a === b) return 0;
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
  return (s * h) / 3;
}

/** First zero of fn in (lo, hi] found by scanning and bisection (verify only). */
function firstRoot(fn: (x: number) => number, lo: number, hi: number, n = 6000): number | null {
  const step = (hi - lo) / n;
  let x0 = lo + 0.3141 * step, y0 = fn(x0);
  for (let i = 1; i <= n; i++) {
    const x1 = lo + (i + 0.3141) * step, y1 = fn(x1);
    if (y0 * y1 <= 0 && y0 !== y1) {
      let a = x0, b = x1, fa = y0;
      for (let k = 0; k < 80; k++) {
        const m = (a + b) / 2, fm = fn(m);
        if (fa * fm <= 0) b = m; else { a = m; fa = fm; }
      }
      return (a + b) / 2;
    }
    x0 = x1; y0 = y1;
  }
  return null;
}

const L = (x: Exact): string => x.toLatex({ format: 'fraction' });

// ----------------------------------------------------------------------------- level 1

function displacementQ(rng: RNG): Generated | null {
  const quadratic = rng.bool(0.3);
  const p = quadratic ? rng.pick([3, 6]) : rng.pick([2, 4, 6, 1, 3]);
  const q = rng.int(0, 6);
  const v: Poly = quadratic ? [p, 0, q] : [p, q];
  const T = rng.pick([2, 3, 4]);
  const s = defInt(v, 0, T);
  if (!s.isInteger() || s.toNumber() > 120) return null;
  const vT = horner(v, T), v0 = horner(v, 0);
  const heads = positive([
    { value: E(vT - v0), trap: 'used the change in velocity v(T) − v(0) instead of integrating' },
    { value: E(vT * T), trap: 'used distance = speed × time with the final velocity' },
  ]);
  // One headline trap is always offered and the other joins the pool, so the answer is not pinned
  // between a fixed under-count and a fixed over-count in every question.
  const must = rng.bool(0.5) ? heads : [rng.pick(heads)];
  const extra = positive([
    { value: noDivInt(v, 0, T), trap: 'did not divide by the new powers when integrating' },
    { value: E(vT), trap: 'gave the velocity at time T' },
    { value: q !== 0 ? defInt([...v.slice(0, -1), 0], 0, T) : null, trap: `ignored the constant ${q} in the velocity` },
    { value: q !== 0 ? frac(vT * T, 2) : null, trap: 'used ½ × v(T) × T, ignoring the initial velocity' },
    { value: E(q * T), trap: 'used only the constant part of the velocity' },
    { value: frac((v0 + vT) * T, 2), trap: 'used ½(v(0) + v(T)) × T, which only holds when v is linear in t' },
    { value: s.mulRat(2), trap: 'doubled the integral' },
    { value: oldPowInt(v, 0, T), trap: 'divided by the old power instead of the new one' },
    { value: samePowInt(v, 0, T), trap: 'divided by the new power but forgot to raise it' },
  ]).concat(heads);
  const opts = options(rng, s, must, extra, M);
  if (!opts) return null;
  return {
    stem: `A particle moves in a straight line with velocity ${V(v)} at time $t$ seconds. Find the displacement of the particle during the first ${T} seconds.`,
    answer: { kind: 'exact', value: s, unit: M },
    options: opts,
    solution: `Displacement $= \\int_{0}^{${T}} (${nice(v)})\\,dt = \\left[${antiTex(v)}\\right]_{0}^{${T}} = ${L(s)}$ m.`,
    trap: 'Displacement is the integral of velocity (area under the v–t graph), not v × t or the change in v.',
    tags: ['kinematics', 'displacement', 'integrate-velocity'],
    params: { variant: 'displacement', v, T },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 2

function velocityQ(rng: RNG): Generated | null {
  const p = rng.pick([2, 4, 6, 3, 6]);
  const q = rng.pick([0, 0, 0, 1, 2, -2]);
  const a: Poly = [p, q];
  const u = rng.pick([0, 1, 2, 3, 5, 2]);
  const T = rng.pick([2, 3, 4, 2]);
  const dv = defInt(a, 0, T);
  const vT = dv.add(E(u));
  if (!vT.isInteger() || vT.toNumber() > 120 || vT.toNumber() <= 0) return null;
  const aT = horner(a, T);
  const heads = positive([
    { value: u !== 0 ? dv : null, trap: `forgot the initial velocity ${u} m s⁻¹ (the constant of integration)` },
    { value: E(u + aT * T), trap: 'used v = u + at with the final value of the acceleration' },
  ]);
  const must = rng.bool(0.5) ? heads : [rng.pick(heads)];
  const extra = positive([
    { value: E(u).add(noDivInt(a, 0, T)), trap: 'did not divide by the new power when integrating' },
    { value: E(u + p * T), trap: `treated the acceleration as the constant ${p} m s⁻²` },
    { value: dv.sub(E(u)), trap: 'subtracted the initial velocity instead of adding it' },
    { value: E(u).add(defInt([p, 0], 0, T)), trap: 'dropped the constant term of the acceleration' },
    { value: E(u).add(frac(p * T ** 3, 6)), trap: 'integrated twice (found a displacement-like quantity)' },
    { value: E(u).add(dv.mulRat(2)), trap: 'doubled the change in velocity' },
    { value: E(u).add(dv.mulRat(frac(1, 2).toRat())), trap: 'halved the change in velocity' },
    { value: q !== 0 ? E(u + q * T) : null, trap: `used only the constant part ${q} of the acceleration` },
    { value: E(u).add(oldPowInt(a, 0, T)), trap: 'divided by the old power instead of the new one' },
    { value: E(u).add(samePowInt(a, 0, T)), trap: 'divided by the new power but forgot to raise it' },
    { value: dv, trap: `forgot the initial velocity ${u} m s⁻¹ (the constant of integration)` },
    { value: vT.add(E(u)).mulRat(frac(1, 2).toRat()), trap: 'gave the average of the initial and final velocities' },
    { value: E(u).add(noDivInt(a, 0, T).mulRat(2)), trap: 'multiplied by the new power instead of dividing by it' },
    { value: E(u).add(frac(p * T * T, 4)), trap: 'divided by 4 instead of by 2 when integrating the t term' },
  ]).concat(heads);
  const opts = options(rng, vT, must, extra, MS);
  if (!opts) return null;
  return {
    stem: `A particle moves in a straight line with acceleration ${A(a)} at time $t$ seconds. When $t = 0$ its velocity is $${u}$ m s$^{-1}$. Find its velocity when $t = ${T}$.`,
    answer: { kind: 'exact', value: vT, unit: MS },
    options: opts,
    solution: `$v = \\int (${nice(a)})\\,dt = ${antiTex(a)} + c$, and $v = ${u}$ at $t = 0$ gives $c = ${u}$. So $v(${T}) = ${L(dv)} + ${u} = ${L(vT)}$ m s$^{-1}$.`,
    trap: 'Integrate the acceleration and use v(0) to fix the constant; v = u + at only works when a is constant.',
    tags: ['kinematics', 'velocity', 'integrate-acceleration'],
    params: { variant: 'velocity', a, u, T },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 3

function restQ(rng: RNG): Generated | null {
  // v = ±p(t² − k²) or ±p t(t − k): zero at t = k, so the displacement there is ±2pk³/3 or ∓pk³/6.
  const kind = rng.pick(['t2-c', 't2-c', 't2-t']);
  const back = rng.bool(0.5); // the particle moves backwards (negative displacement) or forwards
  const sg = back ? 1 : -1;
  const p = rng.pick([1, 2, 3, 4, 6, 8, 12]);
  const k = kind === 't2-c' ? rng.pick([1, 2, 2, 3, 4, 5]) : rng.pick([2, 2, 3, 4, 5]);
  const v: Poly = kind === 't2-c' ? [sg * p, 0, -sg * p * k * k] : [sg * p, -sg * p * k, 0];
  if (v.some((c) => Math.abs(c) > 100)) return null;
  const s = defInt(v, 0, k);
  if (!isCleanExact(s).ok || Math.abs(s.toNumber()) > 120 || s.toRat().d > 3n) return null;
  const startsAtRest = horner(v, 0) === 0;
  const heads: Candidate[] = [
    // A positive "distance" only makes sense as a trap when the particle has actually moved backwards;
    // offering ±s in every question would let a candidate read the answer off the pair.
    { value: back ? s.neg() : null, trap: 'gave the distance travelled: the displacement is negative because the particle moved backwards' },
    { value: s.mulRat(2), trap: 'doubled the displacement' },
  ];
  // The two headline traps sit on opposite sides of the answer, so offering both every time would
  // stop the answer ever being the largest or the smallest option: half the time only one is used.
  const must: Candidate[] = rng.bool(0.5) ? heads : [rng.pick(heads)];
  // Only the "distance" option is allowed to sit on the other side of zero: the rest must look like
  // a displacement of the same sign, or they are eliminated from the stem alone.
  const extra: Candidate[] = sameSign([
    { value: defInt(v.slice(1), 0, k), trap: 'dropped the t² term and integrated the rest' },
    { value: oldPowInt(v, 0, k), trap: 'divided by the old powers instead of the new ones' },
    { value: samePowInt(v, 0, k), trap: 'divided by the new powers but forgot to raise them' },
    { value: s.mulRat(frac(1, 2).toRat()), trap: 'halved the displacement' },
    { value: horner(v, 0) !== 0 ? E(horner(v, 0) * k) : null, trap: 'used the initial velocity × the time, as if v were constant' },
    { value: horner(v, 0) !== 0 ? E(horner(v, 0)) : null, trap: 'gave the initial velocity instead of the displacement' },
    { value: k % 2 === 0 ? defInt(v, 0, k / 2) : null, trap: 'integrated only as far as half the time to rest' },
    { value: s.mulRat(frac(3, 2).toRat()), trap: 'used t³/2 in place of t³/3 when integrating' },
  ], s);
  const opts = options(rng, s, must, extra, M);
  if (!opts) return null;
  const ask = startsAtRest
    ? 'Find its displacement from $O$ at the instant when it next comes to instantaneous rest.'
    : 'Find its displacement from $O$ at the instant when it first comes to instantaneous rest.';
  return {
    stem: `A particle moves along a straight line so that its velocity at time $t$ seconds is ${V(v)}. The particle is at the origin $O$ when $t = 0$. ${ask}`,
    answer: { kind: 'exact', value: s, unit: M },
    options: opts,
    solution: `$v = 0$ when $${nice(v)} = 0$, i.e. $t = ${k}$ (taking $t > 0$). Then $s = \\int_{0}^{${k}} (${nice(v)})\\,dt = \\left[${antiTex(v)}\\right]_{0}^{${k}} = ${L(s)}$ m.`,
    trap: `First solve v = 0 for t, then integrate v from 0 to that time; the displacement is ${back ? 'negative because the particle moved backwards' : 'positive here, but the sign always follows the direction of travel'}.`,
    tags: ['kinematics', 'displacement', 'at-rest'],
    params: { variant: 'rest', v },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 4

function distanceQ(rng: RNG): Generated | null {
  const kind = rng.pick(['t2-m2', 't2-m2', 't2-mt', 'linear', 'linear-dec']);
  let v: Poly, root: number, T: number;
  if (kind === 't2-m2') {
    const m = rng.pick([1, 2, 2, 3, 4]);
    v = [rng.pick([1, 1, 2]), 0, 0]; root = m; T = m + rng.pick([1, 2]);
    v[2] = -v[0] * m * m;
  } else if (kind === 't2-mt') {
    const p = rng.pick([1, 1, 2, 3]);
    root = rng.pick([1, 2, 3, 4]);
    T = root + rng.pick([1, 2]);
    v = [p, -p * root, 0];
  } else {
    const p = rng.pick([1, 2, 3, 4, 2]);
    root = rng.pick([1, 2, 3, 4, 5]);
    T = root + rng.pick([1, 2, 3]);
    v = kind === 'linear' ? [p, -p * root] : [-p, p * root];
  }
  if (v.some((c) => Math.abs(c) > 40)) return null;
  const A1 = defInt(v, 0, root).abs();
  const A2 = defInt(v, root, T).abs();
  const dist = A1.add(A2);
  const disp = defInt(v, 0, T);
  if (!isCleanExact(dist).ok || dist.toNumber() > 120 || A1.equals(A2)) return null;
  const vT = horner(v, T), v0 = horner(v, 0);
  // A distance cannot be negative: the signed displacement is only offered when it happens to be positive.
  const must = positive([
    { value: disp.abs(), trap: 'took the modulus of the displacement instead of adding the two distances' },
    { value: disp, trap: 'found the displacement: the single integral lets the two parts cancel' },
  ]);
  const extra = positive([
    { value: A1, trap: 'found the distance for the first stage only' },
    { value: A2, trap: 'found the distance for the second stage only' },
    { value: A1.mulRat(2), trap: 'doubled the first stage as if the two were equal' },
    { value: A2.mulRat(2), trap: 'doubled the second stage as if the two were equal' },
    { value: noDivInt(v, 0, root).abs().add(noDivInt(v, root, T).abs()), trap: 'did not divide by the new powers' },
    { value: E(Math.abs(vT) * T), trap: 'used speed × time with the final speed over the whole interval' },
    { value: frac((Math.abs(v0) + Math.abs(vT)) * T, 2), trap: 'used the average of the initial and final speeds × the time' },
    { value: dist.mulRat(frac(1, 2).toRat()), trap: 'averaged the two distances instead of adding them' },
    { value: samePowInt(v, 0, root).abs().add(samePowInt(v, root, T).abs()), trap: 'divided by the new powers but forgot to raise them' },
  ]);
  const opts = options(rng, dist, must, extra, M);
  if (!opts) return null;
  return {
    stem: `A particle moves in a straight line with velocity ${V(v)} at time $t$ seconds. Find the total distance travelled by the particle between $t = 0$ and $t = ${T}$.`,
    answer: { kind: 'exact', value: dist, unit: M },
    options: opts,
    solution: `$v = 0$ at $t = ${root}$, so the direction changes there. $\\left|\\int_{0}^{${root}} v\\,dt\\right| = ${L(A1)}$ and $\\left|\\int_{${root}}^{${T}} v\\,dt\\right| = ${L(A2)}$, so the distance is $${L(A1)} + ${L(A2)} = ${L(dist)}$ m (the displacement would be $${L(disp)}$ m).`,
    trap: 'Distance is the integral of |v|: split the interval where v = 0 and add the sizes of the two parts. Displacement lets them cancel.',
    tags: ['kinematics', 'distance', 'change-of-direction'],
    params: { variant: 'distance', v, T },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 5

function returnQ(rng: RNG): Generated | null {
  // v = p t − q t²  →  s = p t²/2 − q t³/3 = 0 at t = 3p/(2q)
  const [q, p] = rng.pick([[3, 2], [3, 4], [3, 6], [3, 8], [1, 2], [1, 4], [2, 4], [2, 8]]);
  const tR = (3 * p) / (2 * q);
  const v: Poly = [-q, p, 0];
  const answer = E(tR);
  const rest = frac(p, q);
  // t = 3p/(2q) sits between these two, so offering both every time would keep the answer off both
  // ends of the option list: half the time only one of them is used.
  const heads = positive([
    { value: rest, trap: 'found when the particle is at rest (v = 0), not when it is back at O (s = 0)' },
    { value: rest.mulRat(2), trap: 'doubled the time at which v = 0, but the motion is not symmetric in time' },
  ]);
  const must = rng.bool(0.5) ? heads : [rng.pick(heads)];
  const extra = positive([
    { value: frac(3 * p, q), trap: 'dropped the 2 from t²/2 when solving s = 0' },
    { value: frac(p, 2 * q), trap: 'halved the time at which v = 0' },
    { value: frac(2 * p, 3 * q), trap: 'inverted the fraction: solved t = 2p/(3q) instead of 3p/(2q)' },
    { value: frac(3 * p, 4 * q), trap: 'used t³/4 instead of t³/3 when integrating' },
    { value: frac(p, 3 * q), trap: 'divided by 3 instead of by q when solving s = 0' },
    { value: E(p), trap: 'gave the coefficient of t' },
    { value: E(q), trap: 'gave the coefficient of t²' },
  ]);
  const opts = options(rng, answer, must, extra, S);
  if (!opts) return null;
  return {
    stem: `A particle leaves a fixed point $O$ at time $t = 0$ and moves in a straight line with velocity ${V(v)}. Find the time at which the particle returns to $O$.`,
    answer: { kind: 'exact', value: answer, unit: S },
    options: opts,
    solution: `$s = \\int_{0}^{t} (${nice(v)})\\,dt = ${antiTex(v)}$. Back at $O$ when $s = 0$: $t^{2}\\left(${L(frac(p, 2))} - ${frac(q, 3).equals(E(1)) ? '' : L(frac(q, 3))}t\\right) = 0$, so $t = ${L(answer)}$ s (the particle is at rest at $t = ${L(rest)}$ s, which is not the same instant).`,
    trap: 'Returning to the start means s = 0, not v = 0: integrate to get s(t) and solve, discarding t = 0.',
    tags: ['kinematics', 'displacement', 'return-to-start'],
    params: { variant: 'return', v },
    typedAllowed: true,
  };
}

function twoStageQ(rng: RNG): Generated | null {
  const n = rng.pick([1, 2, 2]);
  const p = rng.pick(n === 2 ? [1, 3, 3, 2] : [2, 4, 3]);
  const T1 = rng.pick([2, 3, 4]);
  const extra2 = rng.pick([2, 3, 4, 5]);
  const v: Poly = n === 2 ? [p, 0, 0] : [p, 0];
  const s1 = defInt(v, 0, T1);
  const vT1 = horner(v, T1);
  const s2 = E(vT1 * extra2);
  const total = s1.add(s2);
  if (!total.isInteger() || total.toNumber() > 200) return null;
  const T2 = T1 + extra2;
  const must = positive([
    { value: defInt(v, 0, T2), trap: `integrated v = ${nice(v)} over the whole ${T2} seconds, ignoring the change to constant velocity` },
    { value: s1, trap: 'found the first stage only' },
  ]);
  const extra = positive([
    { value: s2, trap: 'found the second stage only' },
    { value: E(vT1 * T2), trap: 'used the constant velocity for the whole time' },
    { value: noDivInt(v, 0, T1).add(s2), trap: 'did not divide by the new power in the first stage' },
    { value: s1.add(E(vT1 * T2)), trap: `used ${T2} s instead of ${extra2} s for the second stage` },
    { value: s1.mulRat(2), trap: 'doubled the first stage' },
    { value: s1.add(frac(vT1 * extra2, 2)), trap: 'halved the second stage, as if the particle were still accelerating' },
    { value: total.mulRat(frac(1, 2).toRat()), trap: 'halved the total' },
  ]);
  const opts = options(rng, total, must, extra, M);
  if (!opts) return null;
  return {
    stem: `A particle starts from rest and moves in a straight line with velocity ${V(v)} for $0 \\le t \\le ${T1}$, where $t$ is the time in seconds. It then continues at constant velocity for a further ${extra2} seconds. Find the total distance travelled.`,
    answer: { kind: 'exact', value: total, unit: M },
    options: opts,
    solution: `Stage 1: $\\int_{0}^{${T1}} ${nice(v)}\\,dt = ${L(s1)}$ m. At $t = ${T1}$ the velocity is $${vT1}$ m s$^{-1}$, so stage 2 covers $${vT1} \\times ${extra2} = ${L(s2)}$ m. Total $${L(s1)} + ${L(s2)} = ${L(total)}$ m.`,
    trap: 'Treat the stages separately: integrate while v changes, then use speed × time once it is constant, with the correct duration for each.',
    tags: ['kinematics', 'distance', 'two-stage'],
    params: { variant: 'two-stage', v, T1, T2 },
    typedAllowed: true,
  };
}

function accelDisplacementQ(rng: RNG): Generated | null {
  const k = rng.pick([6, 12, 3, 6]);
  const u = rng.pick([1, 2, 3, 4, 5]);
  const T = rng.pick([2, 2, 3, 4]);
  const a: Poly = [k, 0];
  const s = E(u * T).add(frac(k * T ** 3, 6));
  if (!s.isInteger() || s.toNumber() > 200) return null;
  const must = positive([
    { value: frac(k * T ** 3, 6), trap: `forgot the initial velocity ${u} m s⁻¹` },
    { value: E(u * T).add(frac(k * T ** 3, 2)), trap: 'used s = ut + ½at² with the final acceleration a = kT' },
  ]);
  const extra = positive([
    { value: E(u * T).add(frac(k * T ** 3, 3)), trap: 'integrated once only after adding u (divided by 3 instead of 6)' },
    { value: E(u * T).add(frac(k * T * T, 2)), trap: `treated the acceleration as the constant ${k} m s⁻²` },
    { value: E(u).add(frac(k * T ** 3, 6)), trap: 'added u instead of ut' },
    { value: E(u).add(frac(k * T * T, 2)), trap: 'found the velocity at time T instead of the displacement' },
    { value: s.mulRat(2), trap: 'doubled' },
    { value: E(u * T), trap: 'used s = ut, ignoring the acceleration' },
    { value: frac(k * T ** 3, 12).add(E(u * T)), trap: 'divided by 12 instead of 6 (integrated t² to t³/6 and then halved again)' },
    { value: E(u * T).add(frac(k * T ** 3, 6)).add(frac(k * T * T, 2)), trap: 'added the velocity at time T to the displacement' },
  ]);
  const opts = options(rng, s, must, extra, M);
  if (!opts) return null;
  return {
    stem: `A particle moves in a straight line with acceleration ${A(a)} at time $t$ seconds. When $t = 0$ its velocity is $${u}$ m s$^{-1}$. Find its displacement during the first ${T} seconds.`,
    answer: { kind: 'exact', value: s, unit: M },
    options: opts,
    solution: `$v = \\int ${nice(a)}\\,dt = ${antiTex(a)} + ${u}$ (using $v(0) = ${u}$). Then $s = \\int_{0}^{${T}} \\left(${antiTex(a)} + ${u}\\right)dt = \\left[${frac(k, 6).equals(E(1)) ? '' : L(frac(k, 6))}t^{3} + ${u}t\\right]_{0}^{${T}} = ${L(s)}$ m.`,
    trap: 'Integrate twice, fixing the constant after the first integration with v(0); SUVAT does not apply because a is not constant.',
    tags: ['kinematics', 'displacement', 'integrate-twice'],
    params: { variant: 'accel-displacement', a, u, T },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'm2.integration.kinematics',
  module: 'M2',
  topic: 'integration',
  title: 'Integration in kinematics',
  levels: {
    1: 'v = 2t + 3: displacement over [0, 2] (10 m)',
    2: 'a = 6t, v(0) = 2: v(2) = 14 m s⁻¹',
    3: 'v = 3t² − 12, s(0) = 0: s when first at rest (−16 m)',
    4: 'distance, not displacement, when v changes sign: v = t² − 4 on [0, 3] → 23/3 m',
    5: 'time of return to O; two-stage motion; a = kt with u ≠ 0',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return displacementQ(rng);
        case 2: return velocityQ(rng);
        case 3: return restQ(rng);
        case 4: return distanceQ(rng);
        default: return pickVariant(rng, [returnQ, twoStageQ, accelDisplacementQ]);
      }
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const p = q.params as { variant: string; v?: Poly; a?: Poly; u?: number; T?: number; T1?: number; T2?: number };
    const got = q.answer.value.toNumber();
    const close = (x: number, y: number) => Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(y));
    switch (p.variant) {
      case 'displacement':
        return close(simpson((t) => horner(p.v!, t), 0, p.T!), got);
      case 'velocity':
        return close(p.u! + simpson((t) => horner(p.a!, t), 0, p.T!), got);
      case 'rest': {
        const v = (t: number) => horner(p.v!, t);
        // the first instant of rest strictly after t = 0 (v may also vanish at t = 0)
        const t0 = firstRoot(v, 1e-3, 20);
        return t0 !== null && close(simpson(v, 0, t0), got);
      }
      case 'distance': {
        const v = (t: number) => horner(p.v!, t);
        const t0 = firstRoot(v, 0, p.T!);
        if (t0 === null) return false;
        return close(Math.abs(simpson(v, 0, t0)) + Math.abs(simpson(v, t0, p.T!)), got);
      }
      case 'return': {
        // s(t) = ∫₀ᵗ v, itself computed numerically; find its first positive zero
        const v = (t: number) => horner(p.v!, t);
        const s = (t: number) => simpson(v, 0, t, 200);
        const t0 = firstRoot(s, 0.25, 40, 4000);
        return t0 !== null && close(t0, got);
      }
      case 'two-stage': {
        const v = (t: number) => horner(p.v!, t);
        const vT1 = v(p.T1!);
        return close(simpson(v, 0, p.T1!) + simpson(() => vT1, p.T1!, p.T2!), got);
      }
      case 'accel-displacement': {
        const a = (t: number) => horner(p.a!, t);
        const v = (t: number) => p.u! + simpson(a, 0, t, 200);
        return close(simpson(v, 0, p.T!, 400), got);
      }
      default:
        return false;
    }
  },
});
