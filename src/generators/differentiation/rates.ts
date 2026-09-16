import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildOptions, buildSetOptions, type Distractor, type Option } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { poly, num } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Velocity, acceleration and rates of change.
 * Level 1: s = t² + 3t, find v at t = 2
 * Level 2: s cubic, find the acceleration at t
 * Level 3: when is the particle at rest (v = 0): a set of times, or a single time when the other root is negative
 * Level 4: displacement when the velocity is zero; maximum displacement (quadratic, or a cubic on an interval)
 * Level 5: related rates: area of a growing circle (2πr · dr/dt), volume of a cube or sphere, and the inverse problems
 */

const FR = { format: 'fraction' as const };
const MS1 = '\\text{m s}^{-1}';
const MS2 = '\\text{m s}^{-2}';
const METRE = '\\text{m}';
const SEC = '\\text{s}';
const CM2S = '\\text{cm}^2\\text{ s}^{-1}';
const CM3S = '\\text{cm}^3\\text{ s}^{-1}';
const CMS = '\\text{cm s}^{-1}';

type Cand = { value: Exact | null; trap: string };

function attempt(f: () => Exact): Exact | null {
  try {
    const v = f();
    return Number.isFinite(v.toNumber()) ? v : null;
  } catch {
    return null;
  }
}

function cleanOnly(ds: Cand[]): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } => d.value !== null && Number.isFinite(d.value.toNumber()) && isCleanExact(d.value).ok);
}

/**
 * No option may be identifiable by its shape alone: being the only value on the page with its sign,
 * or the only fraction among integers, marks an option out whether it is the answer or not. Try
 * replacing one non-headline distractor with a spare candidate and keep the arrangement in which
 * the fewest options stand alone in their (sign, integer or fraction) group.
 */
function balance(answer: Exact, out: Distractor[], pool: Distractor[]): Distractor[] {
  // Group the options by (sign, integer or not). A group with a single member is a tell: that
  // option is either the answer, pointed at by its shape, or a distractor struck out for free.
  const tells = (ds: Distractor[]): number => {
    const vals = [answer, ...ds.map((d) => d.value)];
    const counts = new Map<string, number>();
    for (const v of vals) {
      const k = `${v.sign() < 0 ? '-' : '+'}${v.isInteger() ? 'i' : 'f'}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    let n = 0;
    for (const c of counts.values()) if (c === 1) n++;
    return n;
  };
  let best = out;
  let bestScore = tells(out);
  if (bestScore === 0) return out;
  for (let i = 0; i < out.length; i++) {
    if (out[i].must) continue;
    for (const c of pool) {
      if (answer.equals(c.value) || out.some((d) => d.value.equals(c.value))) continue;
      const trial = out.slice();
      trial[i] = c;
      const score = tells(trial);
      if (score < bestScore) { best = trial; bestScore = score; }
      if (bestScore === 0) return best;
    }
  }
  return best;
}

/**
 * Every distinct `must` candidate is used before any `extra` one, so the headline traps are never
 * shuffled out; the remaining slots are filled from either side of the answer towards a randomly
 * chosen number of options above it, so the answer lands at every position in the sorted list.
 */
function ranked(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], count = 4): Distractor[] {
  const seen: Exact[] = [answer];
  const out: Distractor[] = [];
  const take = (d: Distractor) => {
    if (out.length >= count || seen.some((s) => s.equals(d.value))) return;
    seen.push(d.value);
    out.push(d);
  };
  must.forEach((d) => take({ ...d, must: true }));
  const pool = rng.shuffle(extra);
  const cls = (v: Exact) => `${v.sign() < 0 ? '-' : '+'}${v.isInteger() ? 'i' : 'f'}`;
  // Prefer a distractor shaped like the answer (same sign, same integer-or-fraction form) until at
  // least one is on the page, so the answer never stands alone in its group.
  const grab = (s: -1 | 1) => {
    const cands = pool.filter((d) => d.value.cmp(answer) === s && !seen.some((x) => x.equals(d.value)));
    const alone = seen.filter((v) => cls(v) === cls(answer)).length < 2;
    return (alone ? cands.find((d) => cls(d.value) === cls(answer)) : undefined) ?? cands[0];
  };
  const targetAbove = rng.int(0, count);
  while (out.length < count) {
    const above = out.filter((d) => d.value.cmp(answer) > 0).length;
    const wanted: -1 | 1 = above < targetAbove ? 1 : -1;
    const d = grab(wanted) ?? grab(wanted === 1 ? -1 : 1);
    if (!d) break;
    take(d);
  }
  return balance(answer, out, pool);
}

interface OptCfg {
  unit?: string;
  /** The stem asks for a time or a rate of increase: a negative option would be eliminated on sight. */
  positive?: boolean;
}

/** Four named mistakes or nothing: this template never pads. */
function options(rng: RNG, answer: Exact, must: Cand[], extra: Cand[], cfg: OptCfg = {}): Option[] | null {
  const keep = (ds: Cand[]) => cleanOnly(cfg.positive ? ds.filter((d) => d.value === null || d.value.sign() > 0) : ds);
  const ds = ranked(rng, answer, keep(must), keep(extra));
  if (ds.length < 4) return null;
  return buildOptions(rng, answer, ds, { ...FR, unit: cfg.unit });
}

type SetCand = { values: Exact[]; trap: string; must?: boolean };

/**
 * Set options with no free eliminations: every offered set has the same number of members as the
 * answer (a shorter list is struck out without any maths), holds distinct clean values, and — when
 * the stem restricts t to be non-negative — contains no impossible negative time.
 */
function setOptions(rng: RNG, answer: Exact[], cands: SetCand[], variable: string, positive: boolean): Option[] | null {
  const same = (a: Exact[], b: Exact[]) => a.length === b.length && a.every((x) => b.some((y) => y.equals(x)));
  const ok = (vs: Exact[]) => vs.length === answer.length
    && vs.every((v) => Number.isFinite(v.toNumber()) && isCleanExact(v).ok && (!positive || v.sign() > 0))
    && new Set(vs.map((v) => v.toNumber())).size === vs.length;
  const pool = cands.filter((c) => ok(c.values) && !same(c.values, answer));
  const chosen: SetCand[] = [];
  for (const c of [...pool.filter((x) => x.must), ...rng.shuffle(pool.filter((x) => !x.must))]) {
    if (chosen.length >= 4) break;
    if (chosen.some((x) => same(x.values, c.values))) continue;
    chosen.push(c);
  }
  if (chosen.length < 4) return null;
  return buildSetOptions(rng, answer, chosen, { variable });
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

// ----------------------------------------------------------------------------- polynomials in t (coefficients highest power first)

function evalPoly(coefs: number[], x: number): number {
  let s = 0;
  for (const c of coefs) s = s * x + c;
  return s;
}

function dCoefs(coefs: number[]): number[] {
  const n = coefs.length - 1;
  return coefs.slice(0, n).map((c, i) => c * (n - i));
}

/** Cubic a t³ + b t² + c t + d whose derivative is 3a(t − t1)(t − t2); null when b would not be an integer. */
function cubicFromRest(a: number, t1: number, t2: number, d: number): number[] | null {
  const sum = t1 + t2;
  if ((3 * a * sum) % 2 !== 0) return null;
  return [a, -(3 * a * sum) / 2, 3 * a * t1 * t2, d];
}

function smallEnough(coefs: number[], limits: number[]): boolean {
  return coefs.every((c, i) => Math.abs(c) <= limits[i]);
}

const sTex = (coefs: number[]) => poly(coefs, 't');

const FOR_T = ', for $t \\ge 0$';

function intro(coefs: number[], suffix = ''): string {
  return `A particle moves in a straight line. Its displacement, $s$ metres, from a fixed point $O$ at time $t$ seconds is given by $s = ${sTex(coefs)}$${suffix}.`;
}

// ----------------------------------------------------------------------------- level 1: velocity

function velocityQ(rng: RNG): Generated | null {
  const a = rng.pick([1, 1, 2, 3, -1, -2, 5]);
  const b = rng.int(-9, 9);
  const c = rng.bool(0.5) ? 0 : rng.int(1, 10);
  const t0 = rng.int(1, 5);
  const coefs = [a, b, c];
  const v = 2 * a * t0 + b;
  if (v === 0 || Math.abs(v) > 60) return null;
  const answer = E(v);
  const s0 = evalPoly(coefs, t0);
  const opts = options(rng, answer, [
    { value: E(s0), trap: 'substituted into s instead of ds/dt' },
    { value: E(a * t0 + b), trap: 'forgot to multiply by the power when differentiating t²' },
  ], [
    { value: E(2 * a * t0), trap: 'dropped the derivative of the t term' },
    { value: E(2 * a * t0 * t0 + b), trap: 'did not lower the power' },
    { value: E(2 * a), trap: 'differentiated twice: this is the acceleration' },
    { value: frac(s0, t0), trap: 'average velocity s/t instead of the instantaneous velocity' },
    { value: E(2 * a * t0 - b), trap: 'sign slip on the t term' },
    { value: E(v + c), trap: 'kept the constant term when differentiating' },
    { value: E(v + 2 * a), trap: 'substituted t = ' + (t0 + 1) + ' instead of ' + t0 },
    { value: E(-v), trap: 'sign slip in the final evaluation' },
    { value: E(a * t0 * t0 + b), trap: 'differentiated the t term only and left t² alone' },
  ], { unit: MS1 });
  if (!opts) return null;
  return {
    stem: `${intro(coefs)}\n\nFind the velocity of the particle, in m s$^{-1}$, when $t = ${t0}$.`,
    answer: { kind: 'exact', value: answer, format: 'fraction', unit: MS1 },
    options: opts,
    solution: `$v = \\frac{ds}{dt} = ${poly([2 * a, b], 't')}$; at $t = ${t0}$, $v = ${v}$ m s$^{-1}$.`,
    trap: 'Velocity is ds/dt: differentiate, then substitute the time (s/t is only the average velocity).',
    tags: ['differentiation', 'kinematics', 'velocity'],
    params: { variant: 'velocity', coefs, t0 },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 2: acceleration

function accelerationQ(rng: RNG): Generated | null {
  const a = rng.pick([1, 1, 2, -1]);
  const b = rng.int(-6, 6);
  const c = rng.int(-9, 9);
  const d = rng.bool(0.5) ? 0 : rng.int(1, 8);
  const t0 = rng.int(1, 4);
  const coefs = [a, b, c, d];
  const acc = 6 * a * t0 + 2 * b;
  if (acc === 0 || Math.abs(acc) > 60) return null;
  const answer = E(acc);
  const v0 = evalPoly(dCoefs(coefs), t0);
  const opts = options(rng, answer, [
    { value: E(v0), trap: 'differentiated once only: this is the velocity' },
    { value: E(6 * a * t0 + b), trap: 'forgot to double the coefficient of t² when differentiating a second time' },
  ], [
    { value: E(evalPoly(coefs, t0)), trap: 'substituted into s' },
    { value: E(3 * a * t0 + 2 * b), trap: 'differentiated 3t² to 3t instead of 6t' },
    { value: E(6 * a * t0 + 2 * b + c), trap: 'kept the constant of the velocity when differentiating' },
    { value: frac(v0, t0), trap: 'average acceleration v/t instead of dv/dt' },
    { value: E(6 * a * t0 - 2 * b), trap: 'sign slip on the t² term' },
    { value: E(6 * a * (t0 + 1) + 2 * b), trap: 'substituted t = ' + (t0 + 1) + ' instead of ' + t0 },
    { value: E(6 * a * t0), trap: 'dropped the derivative of the t² term' },
    { value: E(-acc), trap: 'sign slip in the final evaluation' },
  ], { unit: MS2 });
  if (!opts) return null;
  return {
    stem: `${intro(coefs)}\n\nFind the acceleration of the particle, in m s$^{-2}$, when $t = ${t0}$.`,
    answer: { kind: 'exact', value: answer, format: 'fraction', unit: MS2 },
    options: opts,
    solution: `$v = ${poly(dCoefs(coefs), 't')}$ and $a = \\frac{dv}{dt} = ${poly([6 * a, 2 * b], 't')}$; at $t = ${t0}$, $a = ${acc}$ m s$^{-2}$.`,
    trap: 'Acceleration is the second derivative of displacement: differentiate twice before substituting.',
    tags: ['differentiation', 'kinematics', 'acceleration'],
    params: { variant: 'acceleration', coefs, t0 },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 3: at rest

function restBothQ(rng: RNG): Generated | null {
  const a = rng.pick([1, 1, 2, -1]);
  const t1 = rng.int(1, 5), t2 = rng.int(1, 6);
  if (t1 >= t2) return null;
  const d = rng.bool(0.5) ? 0 : rng.int(1, 10);
  const coefs = cubicFromRest(a, t1, t2, d);
  if (!coefs || !smallEnough(coefs, [2, 20, 60, 10])) return null;
  const values = [E(t1), E(t2)];
  const s1 = evalPoly(coefs, t1), s2 = evalPoly(coefs, t2);
  // The stem says t >= 0 and asks for times, so every offered set is a pair of positive times:
  // a negative time (or a single value against a plural ask) is struck out without any maths.
  // The "solved a = 0" trap gives one time only, so it lives in restSingleQ instead.
  const distractors: SetCand[] = [
    { values: [E(t1 + t2), E(t1 * t2)], trap: 'read off the sum and the product of the roots instead of solving', must: true },
    { values: [E(t1 + 1), E(t2 + 1)], trap: 'arithmetic slip when factorising the quadratic' },
    { values: [E(2 * t1), E(2 * t2)], trap: 'doubled both roots' },
    { values: [frac(t1, 2), frac(t2, 2)], trap: 'halved both roots: the 2 of −b/(2a) applied again to roots already found' },
    { values: [E(t1), E(t1 + t2)], trap: 'took the sum of the roots as the second time' },
    ...(Math.abs(s1) <= 100 && Math.abs(s2) <= 100 ? [{ values: [E(s1), E(s2)], trap: 'gave the displacements at those times' }] : []),
  ];
  const opts = setOptions(rng, values, distractors, 't', true);
  if (!opts) return null;
  const lead = 3 * a === 1 ? '' : 3 * a === -1 ? '-' : `${3 * a}`;
  return {
    stem: `${intro(coefs, FOR_T)}\n\nFind the values of $t$ at which the particle is instantaneously at rest.`,
    answer: { kind: 'set', values, variable: 't' },
    options: opts,
    solution: `$v = ${poly(dCoefs(coefs), 't')} = ${lead}(${poly([1, -t1], 't')})(${poly([1, -t2], 't')})$, so $v = 0$ when $t = ${t1}$ or $t = ${t2}$.`,
    trap: 'At rest means v = ds/dt = 0 (not s = 0 and not a = 0); factorise the quadratic for both times.',
    tags: ['differentiation', 'kinematics', 'rest'],
    params: { variant: 'rest-set', coefs },
    typedAllowed: true,
  };
}

function restSingleQ(rng: RNG): Generated | null {
  const a = rng.pick([1, 1, 2, -1]);
  const tNeg = -rng.int(1, 5), tPos = rng.int(1, 6);
  const d = rng.bool(0.5) ? 0 : rng.int(1, 10);
  const coefs = cubicFromRest(a, tNeg, tPos, d);
  if (!coefs || !smallEnough(coefs, [2, 20, 60, 10])) return null;
  const answer = E(tPos);
  const sPos = evalPoly(coefs, tPos);
  // The stem restricts t to t >= 0 and asks for a time in seconds, so no negative option is offered.
  const b = coefs[1], c = coefs[2];
  const noThree = b * b - a * c; // roots of a t^2 + 2b t + c = 0, the "forgot the 3" quadratic
  const noThreeRoot = noThree >= 0 && Number.isInteger(Math.sqrt(noThree)) ? frac(-b + Math.sqrt(noThree), a) : null;
  const opts = options(rng, answer, [
    { value: E(-tNeg), trap: 'changed the sign of the rejected root instead of discarding it' },
    { value: frac(tNeg + tPos, 2), trap: 'solved a = 0 (dv/dt = 0) instead of v = 0' },
  ], [
    { value: Math.abs(sPos) <= 100 ? E(sPos) : null, trap: 'gave the displacement at that time' },
    { value: E(tPos + 1), trap: 'arithmetic slip' },
    { value: E(2 * tPos), trap: 'doubled the root' },
    { value: frac(tPos, 2), trap: 'halved the root' },
    { value: E(-tNeg * tPos), trap: 'read off the product of the roots instead of solving' },
    { value: noThreeRoot, trap: 'forgot the 3 when differentiating t³' },
    { value: tPos > 1 ? E(tPos - 1) : null, trap: 'arithmetic slip: one second early' },
    { value: frac(tPos, 3), trap: 'divided the root by 3, the common factor taken out of v' },
  ], { unit: SEC, positive: true });
  if (!opts) return null;
  const lead = 3 * a === 1 ? '' : 3 * a === -1 ? '-' : `${3 * a}`;
  return {
    stem: `${intro(coefs, FOR_T)}\n\nFind the time, in seconds, at which the particle is instantaneously at rest.`,
    answer: { kind: 'exact', value: answer, format: 'fraction', unit: SEC },
    options: opts,
    solution: `$v = ${poly(dCoefs(coefs), 't')} = ${lead}(${poly([1, -tNeg], 't')})(${poly([1, -tPos], 't')})$, so $v = 0$ when $t = ${tNeg}$ or $t = ${tPos}$; since $t \\ge 0$, the particle is at rest when $t = ${tPos}$ s.`,
    trap: 'Solve v = 0 and discard the negative time; the other factor gives the answer.',
    tags: ['differentiation', 'kinematics', 'rest'],
    params: { variant: 'rest-single', coefs },
    typedAllowed: true,
  };
}

function restQuadraticQ(rng: RNG): Generated | null {
  const a = rng.pick([1, 2, -1, -2, 3, -3]);
  const t0 = rng.int(1, 6);
  const b = -2 * a * t0;
  const c = rng.bool(0.5) ? 0 : rng.int(1, 10);
  const coefs = [a, b, c];
  const answer = E(t0);
  // A negative time is impossible here (the stem says t >= 0), so every option is a positive time.
  const disc = b * b - 4 * a * c; // "solved s = 0 instead of v = 0"
  const sRoot = disc >= 0 && Number.isInteger(Math.sqrt(disc)) ? frac(-b + Math.sqrt(disc), 2 * a) : null;
  const opts = options(rng, answer, [
    { value: E(2 * t0), trap: 'forgot the 2 when differentiating t²' },
    { value: frac(t0, 2), trap: 'divided by 2a twice' },
  ], [
    { value: E(evalPoly(coefs, t0)), trap: 'gave the displacement at that time' },
    { value: E(c), trap: 'read off the constant' },
    { value: E(t0 + 1), trap: 'arithmetic slip' },
    { value: E(3 * t0), trap: 'divided by a instead of 2a after differentiating twice' },
    { value: sRoot, trap: 'solved s = 0 instead of v = 0' },
    { value: frac(3 * t0, 2), trap: 'used −3b/(2a)' },
    { value: t0 > 1 ? E(t0 - 1) : null, trap: 'arithmetic slip: one second early' },
    { value: frac(2 * t0, 3), trap: 'differentiated t² as 3t² and solved 3at + b = 0' },
  ], { unit: SEC, positive: true });
  if (!opts) return null;
  return {
    stem: `${intro(coefs, FOR_T)}\n\nFind the time, in seconds, at which the particle is instantaneously at rest.`,
    answer: { kind: 'exact', value: answer, format: 'fraction', unit: SEC },
    options: opts,
    solution: `$v = \\frac{ds}{dt} = ${poly([2 * a, b], 't')} = 0$ when $t = ${t0}$ s.`,
    trap: 'At rest means v = 0: differentiate and solve the linear equation.',
    tags: ['differentiation', 'kinematics', 'rest'],
    params: { variant: 'rest-single', coefs },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 4: displacement at rest / maximum displacement

function displacementAtRestQ(rng: RNG): Generated | null {
  const a = rng.pick([1, 1, 2, -1]);
  const tNeg = -rng.int(1, 4), tPos = rng.int(1, 5);
  const base = cubicFromRest(a, tNeg, tPos, 0);
  if (!base) return null;
  // With a > 0 the rest instant is the local minimum, so s there is always negative unless the
  // constant is chosen to lift it: half the draws do, and the answer's sign then carries no
  // information ("pick the only negative option" used to score 49% here).
  const sBase = evalPoly(base, tPos);
  const d = rng.bool(0.5) ? rng.int(1, 10) : -sBase + rng.intExcluding(-14, 14, [0]);
  const coefs = cubicFromRest(a, tNeg, tPos, d);
  if (!coefs || !smallEnough(coefs, [2, 18, 48, 120])) return null;
  const sPos = evalPoly(coefs, tPos), sNeg = evalPoly(coefs, tNeg);
  if (Math.abs(sPos) > 200 || sPos === 0) return null;
  const answer = E(sPos);
  const tInfl = (tNeg + tPos) / 2;
  const sInfl = evalPoly(coefs, tInfl);
  const opts = options(rng, answer, [
    { value: E(tPos), trap: 'gave the time instead of the displacement' },
    { value: E(-sPos), trap: 'sign slip when substituting the time back into s' },
  ], [
    { value: Math.abs(sNeg) <= 300 ? E(sNeg) : null, trap: 'used the negative time' },
    { value: d !== 0 ? E(sPos - d) : null, trap: 'measured from the starting point instead of from O' },
    { value: E(d), trap: 'gave the initial displacement' },
    { value: E(evalPoly(dCoefs(dCoefs(coefs)), tPos)), trap: 'gave the acceleration at that time' },
    { value: Number.isInteger(sInfl) && Math.abs(sInfl) <= 300 ? E(sInfl) : null, trap: 'substituted the time from a = 0 instead of the time from v = 0' },
    { value: E(evalPoly(dCoefs(coefs), 0) + d), trap: 'added the initial velocity to the initial displacement' },
  ], { unit: METRE });
  if (!opts) return null;
  return {
    stem: `${intro(coefs, FOR_T)}\n\nFind the displacement of the particle from $O$, in metres, at the instant when it is at rest.`,
    answer: { kind: 'exact', value: answer, format: 'fraction', unit: METRE },
    options: opts,
    solution: `$v = ${poly(dCoefs(coefs), 't')} = 0$ at $t = ${tNeg}$ or $t = ${tPos}$; only $t = ${tPos}$ is allowed. Then $s = ${sTex(coefs).replace(/t/g, `(${tPos})`)} = ${sPos}$ m.`,
    trap: 'Find the time from v = 0 (keeping t ≥ 0), then substitute it back into s — the question asks for displacement, not time.',
    tags: ['differentiation', 'kinematics', 'displacement'],
    params: { variant: 'disp-at-rest', coefs },
    typedAllowed: true,
  };
}

function maxDisplacementQuadQ(rng: RNG): Generated | null {
  const a = rng.pick([1, 1, 2, 3, 5]);
  const t0 = rng.int(1, 6);
  const b = 2 * a * t0;
  const c = rng.bool(0.4) ? 0 : rng.int(1, 12);
  const coefs = [-a, b, c];
  const sMax = c + a * t0 * t0;
  if (sMax > 200) return null;
  const answer = E(sMax);
  const opts = options(rng, answer, [
    { value: E(t0), trap: 'gave the time at which the maximum occurs' },
    { value: E(a * t0 * t0), trap: 'forgot the initial displacement' },
  ], [
    { value: E(c), trap: 'gave the initial displacement' },
    { value: E(c - a * t0 * t0), trap: 'sign slip when substituting' },
    { value: E(c + 2 * a * t0 * t0), trap: 'substituted into bt only' },
    { value: E(2 * t0), trap: 'gave the time at which the particle returns to its starting displacement' },
    { value: E(c + 4 * a * t0 * t0), trap: 'substituted t = 2t₀, where the particle is back at its starting displacement' },
    { value: E(2 * a * t0), trap: 'gave the initial velocity' },
  ], { unit: METRE });
  if (!opts) return null;
  return {
    stem: `${intro(coefs, FOR_T)}\n\nFind the maximum displacement of the particle from $O$, in metres.`,
    answer: { kind: 'exact', value: answer, format: 'fraction', unit: METRE },
    options: opts,
    solution: `$v = ${poly([-2 * a, b], 't')} = 0$ at $t = ${t0}$; the displacement is greatest there (the $t^2$ coefficient is negative) and $s = ${sMax}$ m.`,
    trap: 'Maximum displacement occurs when v = 0: find that time, then substitute into s.',
    tags: ['differentiation', 'kinematics', 'maximum'],
    params: { variant: 'max-disp', coefs, T: 4 * t0 + 2 },
    typedAllowed: true,
  };
}

function maxDisplacementIntervalQ(rng: RNG): Generated | null {
  const a = rng.pick([1, 1, 2]);
  const t1 = rng.int(1, 3), t2 = rng.int(2, 5);
  if (t1 >= t2) return null;
  const d = rng.bool(0.5) ? 0 : rng.int(1, 8);
  const coefs = cubicFromRest(a, t1, t2, d);
  if (!coefs || !smallEnough(coefs, [2, 18, 48, 8])) return null;
  const T = rng.pick([t2, t2 + 1, t2 + 2]);
  const s1 = evalPoly(coefs, t1), sT = evalPoly(coefs, T), s2 = evalPoly(coefs, t2);
  if (s1 <= d + 1 || s1 <= sT + 1 || s1 > 200) return null;
  const answer = E(s1);
  const opts = options(rng, answer, [
    { value: E(sT), trap: `took the displacement at the end of the interval, t = ${T}` },
    { value: E(s2), trap: 'took the local minimum (the second stationary time)' },
  ], [
    { value: E(t1), trap: 'gave the time instead of the displacement' },
    { value: E(d), trap: 'gave the initial displacement' },
    { value: E(s1 - d), trap: 'measured from the starting point instead of from O' },
    { value: E(-s1), trap: 'sign slip when substituting' },
    { value: E(t2), trap: 'gave the second stationary time instead of a displacement' },
    { value: E(s1 + s2), trap: 'added the two stationary values' },
  ], { unit: METRE });
  if (!opts) return null;
  return {
    stem: `${intro(coefs, `, for $0 \\le t \\le ${T}$`)}\n\nFind the maximum displacement of the particle from $O$, in metres, during this time.`,
    answer: { kind: 'exact', value: answer, format: 'fraction', unit: METRE },
    options: opts,
    solution: `$v = ${poly(dCoefs(coefs), 't')} = 0$ at $t = ${t1}$ and $t = ${t2}$. $s(${t1}) = ${s1}$ (a maximum, since $v$ changes from positive to negative), $s(0) = ${d}$ and $s(${T}) = ${sT}$, so the maximum displacement is $${s1}$ m.`,
    trap: 'Compare the local maximum (v = 0, first stationary time) with the displacements at both ends of the interval.',
    tags: ['differentiation', 'kinematics', 'maximum'],
    params: { variant: 'max-disp', coefs, T },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 5: related rates

type Shape = 'circle-area' | 'square-area' | 'cube-volume' | 'sphere-volume' | 'cylinder-volume';

/** The geometric formula Q(x) as a numeric function (h is the fixed height for the cylinder). */
function shapeFn(shape: Shape, h = 1): (x: number) => number {
  switch (shape) {
    case 'circle-area': return (r) => Math.PI * r * r;
    case 'square-area': return (x) => x * x;
    case 'cube-volume': return (x) => x ** 3;
    case 'sphere-volume': return (r) => (4 / 3) * Math.PI * r ** 3;
    default: return (r) => Math.PI * r * r * h;
  }
}

const rateUnit = (shape: Shape) => (shape === 'circle-area' || shape === 'square-area' ? 'cm$^2$ s$^{-1}$' : 'cm$^3$ s$^{-1}$');

function relatedRateQ(rng: RNG): Generated | null {
  const shape = rng.pick<Shape>(['circle-area', 'circle-area', 'square-area', 'cube-volume', 'cube-volume', 'sphere-volume', 'cylinder-volume']);
  const x0 = rng.pick(shape === 'sphere-volume' || shape === 'cube-volume' ? [1, 2, 3, 4, 5] : [2, 3, 4, 5, 6, 10]);
  const k = rng.pick([1, 2, 2, 3, 4, 0.5]);
  const h = rng.pick([2, 3, 4, 5, 10]);
  const kE = E(k);
  const pi = Exact.pi(1);
  // dQ/dx at x0, exactly
  let dQ: Exact;
  let name: string, dim: string, formula: string, dTex: string;
  switch (shape) {
    case 'circle-area': dQ = pi.mulRat(2 * x0); name = 'circle'; dim = 'radius'; formula = 'A = \\pi r^2'; dTex = `\\frac{dA}{dr} = 2\\pi r`; break;
    case 'square-area': dQ = E(2 * x0); name = 'square'; dim = 'side'; formula = 'A = x^2'; dTex = `\\frac{dA}{dx} = 2x`; break;
    case 'cube-volume': dQ = E(3 * x0 * x0); name = 'cube'; dim = 'side'; formula = 'V = x^3'; dTex = `\\frac{dV}{dx} = 3x^2`; break;
    case 'sphere-volume': dQ = pi.mulRat(4 * x0 * x0); name = 'sphere'; dim = 'radius'; formula = 'V = \\tfrac{4}{3}\\pi r^3'; dTex = `\\frac{dV}{dr} = 4\\pi r^2`; break;
    default: dQ = pi.mulRat(2 * x0 * h); name = 'cylinder'; dim = 'radius'; formula = `V = \\pi r^2 h = ${h}\\pi r^2`; dTex = `\\frac{dV}{dr} = ${2 * h}\\pi r`;
  }
  const answer = dQ.mul(kE);
  if (!isCleanExact(answer).ok) return null;
  const quantity = shape.endsWith('area') ? 'area' : 'volume';
  const qTimesRate = (() => {
    switch (shape) {
      case 'circle-area': return pi.mulRat(x0 * x0).mul(kE);
      case 'square-area': return E(x0 * x0).mul(kE);
      case 'cube-volume': return E(x0 ** 3).mul(kE);
      case 'sphere-volume': return pi.mulRat(frac(4 * x0 ** 3, 3).toRat()).mul(kE);
      default: return pi.mulRat(x0 * x0 * h).mul(kE);
    }
  })();
  /**
   * Shape-specific slips. Each family also gets a "did not lower the power" value, which cannot
   * coincide with dQ/dx: without it the square-area case collapsed to three distinct distractors
   * whenever the rate was 2 (x·k = 2x = dQ) and the list had to be padded.
   */
  const shapeTraps: Cand[] = (() => {
    switch (shape) {
      case 'circle-area': return [
        { value: pi.mulRat(x0).mul(kE), trap: 'used πr instead of 2πr for dA/dr' },
        { value: pi.mulRat(2).mul(kE), trap: 'forgot the r in 2πr' },
        { value: E(2 * x0).mul(kE), trap: 'dropped the π' },
        { value: pi.mulRat(2 * x0 * x0).mul(kE), trap: 'did not lower the power: used 2πr² for dA/dr' },
      ];
      case 'square-area': return [
        { value: E(x0).mul(kE), trap: 'forgot the 2 in dA/dx = 2x' },
        { value: E(4 * x0).mul(kE), trap: 'used the perimeter 4x' },
        { value: E(2 * x0 * x0).mul(kE), trap: 'did not lower the power: used 2x² for dA/dx' },
        { value: E(4 * x0 * x0).mul(kE), trap: 'differentiated (2x)² instead of x²' },
      ];
      case 'cube-volume': return [
        { value: E(x0 * x0).mul(kE), trap: 'forgot the 3 in dV/dx = 3x²' },
        { value: E(6 * x0 * x0).mul(kE), trap: 'used the surface area 6x²' },
        { value: E(3 * x0).mul(kE), trap: 'lowered the power twice' },
        { value: E(3 * x0 ** 3).mul(kE), trap: 'did not lower the power: used 3x³ for dV/dx' },
      ];
      case 'sphere-volume': return [
        { value: pi.mulRat(frac(4 * x0 * x0, 3).toRat()).mul(kE), trap: 'kept the 4/3 after differentiating (3 × 4/3 = 4)' },
        { value: pi.mulRat(4 * x0).mul(kE), trap: 'lowered the power to r instead of r²' },
        { value: pi.mulRat(8 * x0).mul(kE), trap: 'differentiated the surface area 4πr² instead of the volume' },
        { value: pi.mulRat(4 * x0 ** 3).mul(kE), trap: 'did not lower the power: used 4πr³ for dV/dr' },
      ];
      default: return [
        { value: pi.mulRat(x0 * h).mul(kE), trap: 'forgot the 2 in dV/dr = 2πrh' },
        { value: pi.mulRat(2 * x0).mul(kE), trap: 'dropped the height' },
        { value: pi.mulRat(2 * x0 * x0 * h).mul(kE), trap: 'did not lower the power: used 2πr²h for dV/dr' },
        { value: pi.mulRat(2 * (x0 + h)).mul(kE), trap: 'added the height to the radius instead of multiplying' },
      ];
    }
  })();
  // Two more that work for every shape, so the list is never short of four named mistakes.
  const generic: Cand[] = [
    { value: k === 1 ? null : attempt(() => dQ.div(kE)), trap: `divided by the rate of change of the ${dim} instead of multiplying by it` },
    { value: attempt(() => dQ.add(kE)), trap: `added the rate of change of the ${dim} instead of multiplying by it` },
  ];
  const setting = shape === 'cylinder-volume'
    ? `A cylinder has a fixed height of $${h}$ cm. Its radius is increasing at a constant rate of $${num(k)}$ cm s$^{-1}$.`
    : `The ${dim} of a ${name} is increasing at a constant rate of $${num(k)}$ cm s$^{-1}$.`;
  const piNote = answer.hasPi() ? ' Leave $\\pi$ in your answer.' : '';
  const unit = shape.endsWith('area') ? CM2S : CM3S;
  // The stem says the length is increasing, so a negative rate is impossible: `options` never pads.
  const opts = options(rng, answer, [
    { value: dQ, trap: `found d${quantity === 'area' ? 'A' : 'V'}/d${dim === 'radius' ? 'r' : 'x'} but forgot to multiply by the rate of change of the ${dim}` },
    { value: qTimesRate, trap: `multiplied the ${quantity} itself by the rate instead of differentiating first` },
  ], [...shapeTraps, ...generic], { unit, positive: true });
  if (!opts) return null;
  return {
    stem: `${setting} Find the rate, in ${rateUnit(shape)}, at which the ${quantity} of the ${name} is increasing at the instant when the ${dim} is $${x0}$ cm.${piNote}`,
    // A pi-valued answer cannot carry a unit: the typed-answer parser would have to read "16pi cm^2 s^-1".
    answer: answer.hasPi() ? { kind: 'exact', value: answer, format: 'fraction' } : { kind: 'exact', value: answer, format: 'fraction', unit },
    options: opts,
    solution: `$${formula}$, so $${dTex}$ and $\\frac{d${quantity === 'area' ? 'A' : 'V'}}{dt} = ${dTex.split(' = ')[0]} \\times \\frac{d${dim === 'radius' ? 'r' : 'x'}}{dt} = ${dQ.toLatex(FR)} \\times ${num(k)} = ${answer.toLatex(FR)}$.`,
    trap: 'Chain rule: dQ/dt = (dQ/dx)(dx/dt) — differentiate the formula with respect to the length, substitute the length, then multiply by the given rate.',
    tags: ['differentiation', 'related-rates', 'chain-rule'],
    params: { variant: 'rate', shape, x0, rate: k, h, inverse: false },
    typedAllowed: true,
  };
}

function inverseRateQ(rng: RNG): Generated | null {
  const shape = rng.pick<Shape>(['circle-area', 'circle-area', 'cube-volume', 'sphere-volume']);
  const x0 = rng.pick(shape === 'circle-area' ? [2, 3, 4, 5, 6] : [1, 2, 3, 4]);
  const k = rng.pick([1, 2, 3, 0.5]); // the answer dx/dt
  const pi = Exact.pi(1);
  let dQ: Exact, name: string, dim: string, formula: string, dTex: string;
  switch (shape) {
    case 'circle-area': dQ = pi.mulRat(2 * x0); name = 'circle'; dim = 'radius'; formula = 'A = \\pi r^2'; dTex = '\\frac{dA}{dr} = 2\\pi r'; break;
    case 'cube-volume': dQ = E(3 * x0 * x0); name = 'cube'; dim = 'side'; formula = 'V = x^3'; dTex = '\\frac{dV}{dx} = 3x^2'; break;
    default: dQ = pi.mulRat(4 * x0 * x0); name = 'sphere'; dim = 'radius'; formula = 'V = \\tfrac{4}{3}\\pi r^3'; dTex = '\\frac{dV}{dr} = 4\\pi r^2';
  }
  const given = dQ.mul(E(k)); // the stated dQ/dt
  if (!isCleanExact(given).ok) return null;
  const answer = E(k);
  const quantity = shape === 'circle-area' ? 'area' : 'volume';
  /** dQ/dx at any length, so "substituted the wrong radius" can be offered as a wrong quotient. */
  const dQat = (x: number): Exact => (shape === 'circle-area' ? pi.mulRat(2 * x) : shape === 'cube-volume' ? E(3 * x * x) : pi.mulRat(4 * x * x));
  const wrongDiv: Cand[] = shape === 'circle-area'
    ? [
      { value: attempt(() => given.div(pi.mulRat(x0))), trap: 'divided by πr instead of 2πr' },
      { value: attempt(() => given.div(pi.mulRat(2))), trap: 'forgot the r in 2πr' },
      { value: attempt(() => given.div(pi.mulRat(x0 * x0))), trap: 'divided by the area πr² instead of dA/dr' },
    ]
    : shape === 'cube-volume'
      ? [
        { value: attempt(() => given.div(E(x0 * x0))), trap: 'divided by x² (forgot the 3)' },
        { value: attempt(() => given.div(E(x0 ** 3))), trap: 'divided by the volume instead of dV/dx' },
        { value: attempt(() => given.div(E(6 * x0 * x0))), trap: 'divided by the surface area 6x²' },
      ]
      : [
        { value: attempt(() => given.div(pi.mulRat(frac(4 * x0 * x0, 3).toRat()))), trap: 'kept the 4/3 after differentiating' },
        { value: attempt(() => given.div(pi.mulRat(4 * x0))), trap: 'lowered the power to r instead of r²' },
        { value: attempt(() => given.div(pi.mulRat(frac(4 * x0 ** 3, 3).toRat()))), trap: 'divided by the volume instead of dV/dr' },
      ];
  const unit = shape === 'circle-area' ? 'cm$^2$ s$^{-1}$' : 'cm$^3$ s$^{-1}$';
  /**
   * The answer is a plain speed in cm s^-1, so every option is one too: the old "multiplied by
   * dQ/dx instead of dividing" candidate was a number in pi-squared (36pi^2 ~ 355 cm s^-1),
   * eliminable on dimensions alone, and the bare dQ/dx option carried the wrong power of pi.
   */
  const opts = options(rng, answer, [
    { value: attempt(() => given.div(dQat(x0 + 1))), trap: `used ${x0 + 1} cm for the ${dim} instead of ${x0} cm` },
    ...wrongDiv.slice(0, 1),
  ], [
    ...wrongDiv.slice(1),
    { value: x0 > 1 ? attempt(() => given.div(dQat(x0 - 1))) : null, trap: `used ${x0 - 1} cm for the ${dim} instead of ${x0} cm` },
    { value: answer.mulRat(2), trap: 'arithmetic slip: factor of 2' },
    { value: attempt(() => answer.mulRat(frac(1, 2).toRat())), trap: 'halved instead of doubling when rearranging the chain rule' },
  ], { unit: CMS, positive: true });
  if (!opts) return null;
  return {
    stem: `The ${quantity} of a ${name} is increasing at a constant rate of $${given.toLatex(FR)}$ ${unit}. Find the rate, in cm s$^{-1}$, at which the ${dim} is increasing at the instant when the ${dim} is $${x0}$ cm.`,
    answer: { kind: 'exact', value: answer, format: 'fraction', unit: CMS },
    options: opts,
    solution: `$${formula}$, so $${dTex}$. From $\\frac{d${quantity === 'area' ? 'A' : 'V'}}{dt} = ${dTex.split(' = ')[0]} \\times \\frac{d${dim === 'radius' ? 'r' : 'x'}}{dt}$: $${given.toLatex(FR)} = ${dQ.toLatex(FR)} \\times \\frac{d${dim === 'radius' ? 'r' : 'x'}}{dt}$, giving $${answer.toLatex(FR)}$ cm s$^{-1}$.`,
    trap: 'Rearrange the chain rule: dx/dt = (dQ/dt) ÷ (dQ/dx), with dQ/dx evaluated at the given length.',
    tags: ['differentiation', 'related-rates', 'chain-rule'],
    params: { variant: 'rate', shape, x0, rate: k, h: 1, inverse: true, given: [given.toNumber()] },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- numeric helpers for verify

const H = 1e-6;
const d1 = (f: (x: number) => number, x: number) => (f(x + H) - f(x - H)) / (2 * H);
const d2 = (f: (x: number) => number, x: number, h = 1e-3) => (f(x + h) - 2 * f(x) + f(x - h)) / (h * h);

/** Roots of the numerical derivative on (0, hi], found by a sign scan and bisection. */
function restTimes(f: (x: number) => number, hi = 30): number[] {
  const out: number[] = [];
  const step = 0.01;
  let prev = d1(f, 1e-9);
  for (let x = step; x <= hi + 1e-9; x += step) {
    const v = d1(f, x);
    if (Math.abs(v) < 1e-7) { if (!out.some((r) => Math.abs(r - x) < 0.02)) out.push(x); }
    else if (prev * v < 0 && Math.abs(prev) > 1e-7) {
      let lo = x - step, up = x;
      for (let i = 0; i < 80; i++) {
        const mid = (lo + up) / 2;
        if (d1(f, lo) * d1(f, mid) <= 0) up = mid; else lo = mid;
      }
      const r = (lo + up) / 2;
      if (!out.some((s) => Math.abs(s - r) < 0.02)) out.push(r);
    }
    prev = v;
  }
  return out;
}

/** Coarse grid then golden-section refinement of a smooth one-variable objective. */
function refineMax(fn: (x: number) => number, lo: number, hi: number): number {
  const g = (x: number) => -fn(x);
  const N = 1000;
  const step = (hi - lo) / N;
  let bestX = lo, bestV = g(lo);
  for (let i = 1; i <= N; i++) {
    const x = lo + i * step;
    const v = g(x);
    if (v < bestV) { bestV = v; bestX = x; }
  }
  let a = Math.max(lo, bestX - step), b = Math.min(hi, bestX + step);
  const phi = (Math.sqrt(5) - 1) / 2;
  let c = b - phi * (b - a), d = a + phi * (b - a);
  let fc = g(c), fd = g(d);
  for (let i = 0; i < 200; i++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - phi * (b - a); fc = g(c); }
    else { a = c; c = d; fc = fd; d = a + phi * (b - a); fd = g(d); }
  }
  return Math.max(fn((a + b) / 2), fn(lo), fn(hi));
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'm2.differentiation.rates',
  module: 'M2',
  topic: 'differentiation',
  title: 'Velocity, acceleration and rates of change',
  levels: {
    1: 's = t² + 3t, velocity at t = 2',
    2: 's cubic, acceleration at t',
    3: 'times at rest (v = 0): two times, or one with the negative root discarded',
    4: 'displacement when v = 0; maximum displacement (quadratic, or a cubic on 0 ≤ t ≤ T)',
    5: 'related rates: circle area 2πr·dr/dt, cube and sphere volumes, and the inverse problems',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return velocityQ(rng);
        case 2: return accelerationQ(rng);
        case 3: return pickVariant(rng, [restBothQ, restBothQ, restSingleQ, restSingleQ, restQuadraticQ]);
        case 4: return pickVariant(rng, [displacementAtRestQ, displacementAtRestQ, maxDisplacementQuadQ, maxDisplacementIntervalQ]);
        default: return pickVariant(rng, [relatedRateQ, relatedRateQ, inverseRateQ]);
      }
    });
  },
  verify(q) {
    const p = q.params as { variant: string; coefs?: number[]; t0?: number; T?: number; shape?: Shape; x0?: number; rate?: number; h?: number; inverse?: boolean; given?: number[] };
    const close = (x: number, y: number, tol = 1e-6) => Math.abs(x - y) <= tol * Math.max(1, Math.abs(y));
    if (p.variant === 'rate') {
      if (q.answer.kind !== 'exact') return false;
      const got = q.answer.value.toNumber();
      const dQ = d1(shapeFn(p.shape!, p.h), p.x0!);
      // Chain rule recomputed from the geometric formula's numerical derivative.
      return p.inverse ? close(got, p.given![0] / dQ, 1e-7) : close(got, dQ * p.rate!, 1e-7);
    }
    const s = (t: number) => evalPoly(p.coefs!, t);
    if (q.answer.kind === 'set') {
      if (p.variant !== 'rest-set') return false;
      const ts = q.answer.values.map((v) => v.toNumber()).sort((a, b) => a - b);
      const found = restTimes(s);
      return ts.length === found.length && ts.every((t, i) => t >= 0 && Math.abs(t - found[i]) < 1e-6);
    }
    if (q.answer.kind !== 'exact') return false;
    const got = q.answer.value.toNumber();
    switch (p.variant) {
      case 'velocity': return close(got, d1(s, p.t0!));
      case 'acceleration': return close(got, d2(s, p.t0!), 1e-4);
      case 'rest-single': {
        const found = restTimes(s);
        return found.length === 1 && got >= 0 && Math.abs(got - found[0]) < 1e-6;
      }
      case 'disp-at-rest': {
        const found = restTimes(s);
        return found.length === 1 && close(got, s(found[0]));
      }
      case 'max-disp': return close(got, refineMax(s, 0, p.T!));
      default: return false;
    }
  },
});
