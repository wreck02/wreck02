import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { gcd, poly } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Limits of sequences and of sums.
 * Level 1: the limit of u_{n+1} = a u_n + b with |a| < 1 (solve L = aL + b)
 * Level 2: u_{n+1} = (u_n + c)/k, and the sum to infinity of a geometric series
 * Level 3: limits of (an + b)/(cn + d) and (an² + bn + c)/(dn² + en + f)
 * Level 4: does the sequence converge? (choice)
 * Level 5: an infinite telescoping series, or u_{n+1} = √(u_n + c)
 */

const FRACTION = { format: 'fraction' as const };

function cleanOnly(ds: { value: Exact | null; trap: string }[]): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } =>
    d.value !== null && Number.isFinite(d.value.toNumber()) && isCleanExact(d.value).ok);
}

/** Spec-named traps first, then the extras, so the headline mistakes are never shuffled out. */
function ranked(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], count = 4): Distractor[] {
  const seen: Exact[] = [answer];
  const out: Distractor[] = [];
  const take = (d: Distractor) => {
    if (out.length >= count || seen.some((s) => s.equals(d.value))) return;
    seen.push(d.value);
    out.push(d);
  };
  must.forEach(take);
  rng.shuffle(extra).forEach(take);
  return out;
}

/**
 * Same priority order as `ranked`, but the number of options below the answer is drawn first,
 * so the answer does not always land in the same place once the options are sorted by value
 * ("order them and pick the middle/largest" must not beat doing the arithmetic).
 */
function balanced(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], count = 4): Distractor[] {
  const av = answer.toNumber();
  const pool: Distractor[] = [];
  for (const d of [...must, ...rng.shuffle(extra)]) {
    if (answer.equals(d.value) || pool.some((o) => o.value.equals(d.value))) continue;
    pool.push(d);
  }
  const below = pool.filter((d) => d.value.toNumber() < av);
  const above = pool.filter((d) => d.value.toNumber() > av);
  let nBelow = rng.int(0, count);
  nBelow = Math.max(Math.min(nBelow, below.length), count - above.length);
  nBelow = Math.min(Math.max(nBelow, 0), below.length);
  const out = [...below.slice(0, nBelow), ...above.slice(0, count - nBelow)];
  for (const d of pool) {
    if (out.length >= count) break;
    if (!out.includes(d)) out.push(d);
  }
  return out.slice(0, count);
}

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

/** "\frac{1}{2}u_n", "2u_n", "-\frac{2}{3}u_n". */
function coefTex(p: number, q: number, sym: string): string {
  if (q === 1) return p === 1 ? sym : p === -1 ? `-${sym}` : `${p}${sym}`;
  return `${frac(p, q).toLatex(FRACTION)}${sym}`;
}

// ----------------------------------------------------------------------------- levels 1 and 2

/** u_{n+1} = (p/q)·u_n + b, written either in that form or as (u_n + c)/k. */
function fixedPointQ(rng: RNG, level: Level): Generated | null {
  const divided = level >= 2 && rng.bool(0.5);
  let p: number, q: number, b: number, rhs: string, working: string;
  if (divided) {
    // u_{n+1} = (u_n + c)/k  ⇒  L = c/(k − 1)
    const k = rng.pick([2, 3, 4, 5]);
    const c = rng.nonZeroInt(-4, 8) * (k - 1);
    if (c === 0 || Math.abs(c) > 30) return null;
    p = 1; q = k; b = c / k;
    rhs = `\\frac{u_n ${c < 0 ? '-' : '+'} ${Math.abs(c)}}{${k}}`;
    // k L = L + c, so (k − 1)L = c — and "1L" is never written.
    working = `${k}L = L ${c < 0 ? '-' : '+'} ${Math.abs(c)}$, so $${k - 1 === 1 ? '' : k - 1}L = ${c}`;
  } else {
    const [pp, qq] = level === 1 ? rng.pick([[1, 2], [1, 2], [1, 3], [1, 4]]) : rng.pick([[1, 3], [1, 4], [2, 3], [3, 4], [2, 5], [-1, 2], [1, 5]]);
    p = pp; q = qq;
    // L = b / (1 − p/q) = bq / (q − p): choose b so that L is an integer
    const unit = (q - p) / gcd(q - p, q);
    b = rng.nonZeroInt(-3, 5) * unit;
    if (b === 0 || Math.abs(b) > 30) return null;
    rhs = `${coefTex(p, q, 'u_n')} ${b >= 0 ? '+' : '-'} ${Math.abs(b)}`;
    // 1 − (−p/q) is written as 1 + p/q: no double minus sign.
    working = `L\\left(1 ${p < 0 ? '+' : '-'} ${frac(Math.abs(p), q).toLatex(FRACTION)}\\right) = ${b}`;
  }
  const a = frac(p, q);
  const L = E(b).div(E(1).sub(a));
  if (!isCleanExact(L).ok || !L.isInteger() || L.isZero() || Math.abs(L.toNumber()) > 60) return null;
  const u1 = rng.intExcluding(-4, 9, [L.toInt()]);
  const must = cleanOnly([
    { value: E(b).div(E(1).add(a)), trap: 'sign error when rearranging: used L = aL + b as L(1 + a) = b' },
    { value: E(b), trap: 'ignored the multiple of u_n, giving L = b' },
    { value: E(b).mul(E(1).sub(a)), trap: 'multiplied by 1 − a instead of dividing' },
  ]);
  const extra = cleanOnly([
    { value: E(b).div(a), trap: 'divided by a instead of by 1 − a' },
    { value: E(b).mul(a), trap: 'multiplied by a instead of dividing by 1 − a' },
    { value: E(b + 1).div(E(1).sub(a)), trap: 'slip of one in the constant term' },
    { value: E(b - 1).div(E(1).sub(a)), trap: 'slip of one in the constant term' },
    { value: L.add(E(1)), trap: 'arithmetic slip of one' },
    { value: L.sub(E(1)), trap: 'arithmetic slip of one' },
    { value: a.mul(E(u1)).add(E(b)), trap: 'gave the next term u₂ instead of the limit' },
    { value: E(u1), trap: 'quoted the first term' },
    { value: L.mulRat(frac(1, 2).toRat()), trap: 'halved the limit' },
  ]);
  return {
    stem: `A sequence is defined by $u_{n+1} = ${rhs}$, with $u_1 = ${u1}$. The sequence converges to a limit $L$. Find $L$.`,
    answer: { kind: 'exact' as const, value: L },
    options: buildOptions(rng, L, balanced(rng, L, must, extra), FRACTION),
    solution: `At the limit $L = ${rhs.replace(/u_n/g, 'L')}$, so $${working}$ and $L = ${L.toLatex(FRACTION)}$.`,
    trap: 'Put L on both sides and collect: L = aL + b gives L(1 − a) = b, so the limit is b/(1 − a).',
    tags: ['sequences', 'limits', 'recurrence'],
    params: { variant: 'fixed-point', p, q, b, u1 },
    typedAllowed: true,
  };
}

function gpSumQ(rng: RNG): Generated | null {
  const [rn, rd] = rng.pick([[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [-1, 2], [-1, 3], [1, 5], [2, 5]]);
  const a = rng.int(2, 12) * (rd - rn);
  if (Math.abs(a) > 60) return null;
  const r = frac(rn, rd);
  const S = E(a).div(E(1).sub(r));
  if (!isCleanExact(S).ok || !S.isInteger()) return null;
  const terms = [0, 1, 2].map((i) => E(a).mul(r.pow(i)));
  if (terms.some((t) => !isCleanExact(t).ok || t.toRat().d > 12n)) return null;
  const must = cleanOnly([
    { value: E(a).div(E(1).add(r)), trap: 'used a/(1 + r) instead of a/(1 − r)' },
    { value: E(a).div(r), trap: 'divided by r instead of by 1 − r' },
    { value: E(a).mul(E(1).sub(r)), trap: 'multiplied by 1 − r instead of dividing' },
  ]);
  const extra = cleanOnly([
    { value: S.add(E(a)), trap: 'added the first term again' },
    { value: S.sub(E(a)), trap: 'left the first term out' },
    { value: E(a), trap: 'quoted the first term' },
    { value: S.mulRat(frac(1, 2).toRat()), trap: 'halved the sum' },
    { value: S.mulRat(2), trap: 'doubled the sum' },
    { value: E(a).div(E(1).sub(r.mul(r))), trap: 'used r² in place of r' },
  ]);
  return {
    stem: `Find the sum to infinity of the geometric series $${terms.map((t, i) => (i === 0 ? t.toLatex(FRACTION) : `${t.sign() < 0 ? '-' : '+'} ${t.abs().toLatex(FRACTION)}`)).join(' ')} + \\dots$`,
    answer: { kind: 'exact' as const, value: S },
    options: buildOptions(rng, S, balanced(rng, S, must, extra), FRACTION),
    solution: `The common ratio is $r = ${r.toLatex(FRACTION)}$, so $S_\\infty = \\frac{a}{1 - r} = \\frac{${a}}{1 - ${rn < 0 ? `\\left(${r.toLatex(FRACTION)}\\right)` : r.toLatex(FRACTION)}} = ${S.toLatex(FRACTION)}$.`,
    trap: 'S∞ = a/(1 − r): a sign slip in 1 − r (or dividing by r) is the usual error.',
    tags: ['series', 'geometric', 'sum-to-infinity'],
    params: { variant: 'gp-sum', a, rn, rd },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 3

function rationalLimitQ(rng: RNG): Generated | null {
  const quadratic = rng.bool(0.45);
  const a = rng.int(1, 6), c = rng.int(1, 6);
  const b = rng.nonZeroInt(-6, 6), d = rng.nonZeroInt(-6, 6);
  const e = quadratic ? rng.nonZeroInt(-5, 5) : 0;
  const f = quadratic ? rng.nonZeroInt(-5, 5) : 0;
  // u_n must exist for every n: the denominator may not vanish at a positive integer.
  for (let n = 1; n <= 60; n++) {
    if ((quadratic ? c * n * n + d * n + f : c * n + d) === 0) return null;
  }
  const L = frac(a, c);
  if (!isCleanExact(L).ok) return null;
  if (L.equals(frac(b, d))) return null; // the "ratio of constants" trap must differ from the answer
  // poly() drops unit coefficients and handles the signs: "4n^2 - n + 3", never "4n^2 - 1n + 3".
  const num = quadratic ? poly([a, b, e], 'n') : poly([a, b], 'n');
  const den = quadratic ? poly([c, d, f], 'n') : poly([c, d], 'n');
  const fr = (n: number, den: number): Exact | null => (den === 0 ? null : frac(n, den));
  const must = cleanOnly([
    { value: quadratic ? fr(e, f) : fr(b, d), trap: 'used the ratio of the constant terms' },
    { value: fr(c, a), trap: 'inverted the ratio of the leading coefficients' },
    { value: quadratic ? fr(a + b + e, c + d + f) : fr(a + b, c + d), trap: 'substituted n = 1 instead of taking n → ∞' },
  ]);
  const extra = cleanOnly([
    { value: quadratic ? fr(b, d) : null, trap: 'used the coefficients of n rather than of n²' },
    { value: L.add(E(1)), trap: 'arithmetic slip of one' },
    { value: L.sub(E(1)), trap: 'arithmetic slip of one' },
    { value: frac(a * c, 1), trap: 'multiplied the leading coefficients' },
    { value: frac(a + c, 2), trap: 'averaged the leading coefficients' },
  ]);
  return {
    stem: `Find the limit of $u_n = \\frac{${num}}{${den}}$ as $n \\to \\infty$.`,
    answer: { kind: 'exact' as const, value: L, format: 'fraction' },
    options: buildOptions(rng, L, balanced(rng, L, must, extra), FRACTION),
    solution: `Divide top and bottom by $n${quadratic ? '^2' : ''}$: every other term tends to $0$, leaving $${c === 1 ? `${a}` : `\\frac{${a}}{${c}}${gcd(a, c) > 1 ? ` = ${L.toLatex(FRACTION)}` : ''}`}$.`,
    trap: 'Only the highest powers survive: the limit is the ratio of the leading coefficients, not of the constants.',
    tags: ['limits', 'sequences', 'rational'],
    params: { variant: 'rational', a, b, c, d, e, f, quadratic },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 4

const KS: [number, number][] = [[1, 2], [1, 3], [-1, 2], [2, 3], [-1, 3], [1, 4], [3, 2], [2, 1], [3, 1], [-1, 1]];

function classifyQ(rng: RNG): Generated | null {
  const [kn, kd] = rng.pick(KS);
  const k = frac(kn, kd);
  const kv = kn / kd;
  // Some of the time there is no constant term at all, so "converges to 0" is the true statement
  // (and the option is never a dead one). k = −1 keeps a constant so that it still oscillates.
  const zeroCase = kn + kd !== 0 && rng.bool(0.3);
  let c = 0;
  if (!zeroCase) {
    const cUnit = kd - kn;
    c = rng.nonZeroInt(-4, 6) * (cUnit / gcd(cUnit, kd));
    if (c === 0 || Math.abs(c) > 30) return null;
  }
  const fixed = E(c).div(E(1).sub(k));
  if (!fixed.isInteger() || Math.abs(fixed.toNumber()) > 60) return null;
  if (!zeroCase && fixed.isZero()) return null;
  const u1 = Math.abs(kv) > 1 ? fixed.toInt() + rng.int(1, 5) : rng.intExcluding(-4, 9, [fixed.toInt(), 0]);
  if (u1 === 0) return null; // u_n = 0 for every n gives two true statements at once
  if (kn === -1 && kd === 1 && 2 * u1 === c) return null;
  const converges = Math.abs(kv) < 1;
  const oscillates = kv === -1;
  const limitText = (v: Exact) => `The sequence converges to $${v.toLatex(FRACTION)}$.`;
  const ZERO = limitText(E(0));
  const GROWS = 'The terms increase without limit.';
  const OSC = 'The sequence oscillates between two values.';
  const correct = converges ? limitText(fixed) : oscillates ? OSC : GROWS;
  const candidates: { display: string; trap: string }[] = [];
  const pushLimit = (v: Exact | null, trap: string) => {
    if (v && Number.isFinite(v.toNumber()) && isCleanExact(v).ok && Math.abs(v.toNumber()) <= 200) {
      candidates.push({ display: limitText(v), trap });
    }
  };
  pushLimit(fixed, 'solved L = kL + c without checking that |k| < 1');
  pushLimit(kn + kd === 0 ? null : E(c).div(E(1).add(k)), 'sign error in 1 − k when solving for the limit');
  candidates.push({ display: ZERO, trap: 'assumed the terms die away to nothing' });
  candidates.push({ display: GROWS, trap: 'thought any recurrence with a multiplier grows' });
  candidates.push({ display: OSC, trap: 'a negative multiplier alternates in sign but can still converge' });
  pushLimit(E(u1).div(E(1).sub(k)), 'that is the sum to infinity of the terms, not the limit of the terms');
  pushLimit(E(u1), 'assumed the sequence stays at its first term');
  const seen = new Set([correct]);
  const wrong: { display: string; trap: string }[] = [];
  for (const cand of candidates) {
    if (seen.has(cand.display)) continue;
    seen.add(cand.display);
    wrong.push(cand);
  }
  if (wrong.length < 4) return null;
  const rhs = `${coefTex(kn, kd, 'u_n')}${c === 0 ? '' : ` ${c >= 0 ? '+' : '-'} ${Math.abs(c)}`}`;
  const solution = converges
    ? (c === 0
      ? `Each term is $${k.toLatex(FRACTION)}$ times the one before and $|${k.toLatex(FRACTION)}| < 1$, so the terms shrink towards $0$.`
      : `$|${k.toLatex(FRACTION)}| < 1$, so the sequence converges; solving $L = ${k.toLatex(FRACTION)}L ${c >= 0 ? '+' : '-'} ${Math.abs(c)}$ gives $L = ${fixed.toLatex(FRACTION)}$.`)
    : oscillates
      ? `With multiplier $-1$ the terms alternate: $u_1 = ${u1}$, $u_2 = ${c - u1}$, $u_3 = ${u1}$, so the sequence never settles.`
      : (c === 0
        ? `Each term is $${k.toLatex(FRACTION)}$ times the one before and $|${k.toLatex(FRACTION)}| > 1$, so the terms run away.`
        : `The distance from the fixed point $${fixed.toLatex(FRACTION)}$ is multiplied by $${k.toLatex(FRACTION)}$ each step, and $|${k.toLatex(FRACTION)}| > 1$, so the terms run away.`);
  return {
    stem: `A sequence is defined by $u_{n+1} = ${rhs}$, with $u_1 = ${u1}$. Which of the following statements about the sequence is true?`,
    answer: { kind: 'choice' as const, value: correct },
    options: buildChoiceOptions(rng, correct, wrong),
    solution,
    trap: 'Solving L = kL + c always produces a number — but it is only the limit when |k| < 1.',
    tags: ['sequences', 'limits', 'convergence'],
    params: { variant: 'classify', kn, kd, c, u1 },
    typedAllowed: false,
  };
}

// ----------------------------------------------------------------------------- level 5

/**
 * Σ 1/((ar + s)(ar + t)) with t > s and a | (t − s).
 * Partial fractions give (1/(t − s))(1/(ar + s) − 1/(ar + t)), and since the second part is the
 * first one shifted by (t − s)/a places, exactly (t − s)/a terms survive the cancellation.
 */
interface Telescope { a: number; s: number; t: number }

const TELESCOPES: Telescope[] = [
  { a: 1, s: 0, t: 1 },
  { a: 1, s: 0, t: 2 },
  { a: 1, s: 0, t: 3 },
  { a: 2, s: -1, t: 1 },
  { a: 2, s: 1, t: 3 },
  { a: 3, s: -2, t: 1 },
  { a: 3, s: 1, t: 4 },
  { a: 4, s: -3, t: 1 },
  { a: 1, s: 1, t: 2 },
  { a: 1, s: 1, t: 3 },
  { a: 1, s: 0, t: 4 },
  { a: 2, s: -1, t: 3 },
  { a: 3, s: -2, t: 4 },
];

/** "r", "2r - 1", "3r + 4" — the inside of a bracket. */
function linTex(a: number, c: number): string {
  const an = a === 1 ? 'r' : `${a}r`;
  return c === 0 ? an : `${an}${c > 0 ? '+' : '-'}${Math.abs(c)}`;
}

/** "r" or "(2r-1)" — a factor of the denominator. */
const facTex = (a: number, c: number): string => (c === 0 ? linTex(a, c) : `(${linTex(a, c)})`);

/** "1" when the denominator is 1, else "\frac{1}{n}". */
const oneOver = (n: number): string => (n === 1 ? '1' : `\\frac{1}{${n}}`);

function telescopeQ(rng: RNG): Generated | null {
  const t = rng.pick(TELESCOPES);
  const step = t.t - t.s;
  const survivors = step / t.a; // the number of terms left after the cancellation
  const heads: number[] = [];
  for (let j = 1; j <= survivors; j++) heads.push(t.a * j + t.s);
  const S = heads.reduce((acc, h) => acc.add(frac(1, h)), Exact.ZERO).mulRat(frac(1, step).toRat());
  if (!isCleanExact(S).ok) return null;
  const tex = `\\frac{1}{${facTex(t.a, t.s)}${facTex(t.a, t.t)}}`;
  const partial = step === 1
    ? `\\frac{1}{${linTex(t.a, t.s)}} - \\frac{1}{${linTex(t.a, t.t)}}`
    : `\\frac{1}{${step}}\\left(\\frac{1}{${linTex(t.a, t.s)}} - \\frac{1}{${linTex(t.a, t.t)}}\\right)`;
  const headTex = heads.length === 1 ? oneOver(heads[0]) : `\\left(${heads.map(oneOver).join(' + ')}\\right)`;
  const leftTex = step === 1 ? headTex : `\\frac{1}{${step}}${heads.length === 1 ? ' \\times ' : ''}${headTex}`;
  // Every option must be a possible value of a sum of positive terms.
  const positive = (ds: { value: Exact | null; trap: string }[]) => cleanOnly(ds).filter((d) => d.value.toNumber() > 0);
  let head3 = Exact.ZERO;
  for (let r = 1; r <= 3; r++) head3 = head3.add(frac(1, (t.a * r + t.s) * (t.a * r + t.t)));
  const must = positive([
    { value: S.mulRat(frac(step, 1).toRat()), trap: `forgot the factor of 1/${step} from the partial fractions` },
    { value: S.mulRat(frac(1, step).toRat()), trap: 'applied the partial-fraction factor twice' },
    { value: frac(1, heads[0]), trap: 'kept the first surviving term but dropped the partial-fraction factor' },
  ]);
  const extra = positive([
    { value: S.mulRat(frac(1, 2).toRat()), trap: 'halved the sum' },
    { value: S.mulRat(frac(2, 1).toRat()), trap: 'doubled the sum' },
    { value: E(1).sub(S), trap: 'gave the part that cancels rather than the sum' },
    { value: S.add(frac(1, step * (t.a * (survivors + 1) + t.s))), trap: 'kept one term too many after the cancellation' },
    { value: head3, trap: 'added the first three terms of the series and stopped' },
    { value: frac(1, step), trap: 'quoted the partial-fraction factor as the answer' },
    { value: frac(survivors, step), trap: `counted the ${survivors} surviving terms as $1$ each` },
  ]);
  return {
    stem: `Find the exact value of $\\sum_{r=1}^{\\infty} ${tex}$.`,
    answer: { kind: 'exact' as const, value: S, format: 'fraction' },
    options: buildOptions(rng, S, ranked(rng, S, must, extra), FRACTION),
    solution: `In partial fractions the term is $${partial}$, so the sum telescopes and everything cancels except the first ${survivors === 1 ? 'term' : `${survivors} terms`}: the total is $${leftTex === S.toLatex(FRACTION) ? leftTex : `${leftTex} = ${S.toLatex(FRACTION)}`}$.`,
    trap: 'Telescoping leaves only as many terms as the shift (t − s)/a — and the 1/(t − s) factor from the partial fractions is easy to drop.',
    tags: ['series', 'telescoping', 'sum-to-infinity'],
    params: { variant: 'telescope', tex },
    typedAllowed: true,
  };
}

/** u_{n+1} = √(a·u_n + c) with a < L, so L² = aL + c and the other root a − L is negative. */
function sqrtRecurrenceQ(rng: RNG): Generated | null {
  const L = rng.int(2, 7);
  const a = rng.bool(0.5) ? 1 : rng.int(1, L - 1);
  const c = L * L - a * L;
  if (c <= 0 || c > 45) return null;
  const u1 = rng.int(1, 3);
  const answer = E(L);
  const inside = `${a === 1 ? '' : a}u_n + ${c}`;
  const insideL = `${a === 1 ? '' : a}L + ${c}`;
  const must = cleanOnly([
    { value: E(a - L), trap: 'took the negative root of L² = aL + c' },
    { value: E(c), trap: 'quoted the constant inside the root' },
    { value: E(L * L), trap: 'gave L² instead of L' },
  ]);
  const extra = cleanOnly([
    { value: frac(c, 2), trap: 'halved the constant' },
    { value: E(L + 1), trap: 'arithmetic slip of one' },
    { value: E(L - 1), trap: 'arithmetic slip of one' },
    { value: E(c + a), trap: 'solved L = aL + c without squaring first' },
    { value: E(u1), trap: 'quoted the first term' },
    { value: E(a + L), trap: 'sign error: took the sum of the two roots as the limit' },
  ]);
  return {
    stem: `A sequence is defined by $u_{n+1} = \\sqrt{${inside}}$, with $u_1 = ${u1}$. The sequence converges to a positive limit $L$. Find $L$.`,
    answer: { kind: 'exact' as const, value: answer },
    options: buildOptions(rng, answer, balanced(rng, answer, must, extra)),
    solution: `At the limit $L = \\sqrt{${insideL}}$, so $L^2 - ${a === 1 ? '' : a}L - ${c} = 0$, that is $(L - ${L})(L + ${L - a}) = 0$. The limit is positive, so $L = ${L}$.`,
    trap: 'Square both sides and solve the quadratic — then reject the negative root.',
    tags: ['sequences', 'limits', 'recurrence'],
    params: { variant: 'sqrt', a, c, u1 },
    typedAllowed: true,
  };
}

// -----------------------------------------------------------------------------

export default defineTemplate({
  id: 'm2.reasoning.sequence-limits',
  module: 'M2',
  topic: 'reasoning',
  title: 'Limits of sequences and sums',
  levels: {
    1: 'the limit of u_{n+1} = ½u_n + 3 and similar recurrences',
    2: 'u_{n+1} = (u_n + c)/k; the sum to infinity of a geometric series',
    3: 'limits of (2n + 1)/(n + 3) and (3n² − 1)/(n² + n)',
    4: 'does u_{n+1} = k u_n + c converge, grow without limit or oscillate?',
    5: 'an infinite telescoping series; the limit of u_{n+1} = √(u_n + c)',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return pickVariant(rng, [(r) => fixedPointQ(r, 1)]);
        case 2: return pickVariant(rng, [(r) => fixedPointQ(r, 2), gpSumQ]);
        case 3: return pickVariant(rng, [rationalLimitQ]);
        case 4: return pickVariant(rng, [classifyQ]);
        default: return pickVariant(rng, [telescopeQ, sqrtRecurrenceQ]);
      }
    });
  },
  verify(q) {
    const p = q.params as { variant: string; p?: number; q?: number; b?: number; u1?: number; a?: number; rn?: number; rd?: number; c?: number; d?: number; e?: number; f?: number; quadratic?: boolean; kn?: number; kd?: number; tex?: string };
    const val = q.answer.kind === 'exact' ? q.answer.value.toNumber() : NaN;
    switch (p.variant) {
      case 'fixed-point': {
        // Iterate the recurrence itself rather than solving L = aL + b.
        let u = p.u1!;
        const a = p.p! / p.q!;
        for (let i = 0; i < 500; i++) u = a * u + p.b!;
        return Math.abs(u - val) < 1e-6;
      }
      case 'gp-sum': {
        // Add the terms of the series one at a time.
        const r = p.rn! / p.rd!;
        let term = p.a!, s = 0;
        for (let i = 0; i < 400; i++) { s += term; term *= r; }
        return Math.abs(s - val) < 1e-6;
      }
      case 'rational': {
        const f = (n: number) => (p.quadratic
          ? (p.a! * n * n + p.b! * n + p.e!) / (p.c! * n * n + p.d! * n + p.f!)
          : (p.a! * n + p.b!) / (p.c! * n + p.d!));
        // u_n must exist for every term of the sequence, and the tail must approach the answer.
        for (let n = 1; n <= 200; n++) if (!Number.isFinite(f(n))) return false;
        return Math.abs(f(1e6) - val) < 1e-4 && Math.abs(f(1e7) - val) < 1e-5;
      }
      case 'classify': {
        if (q.answer.kind !== 'choice') return false;
        const k = p.kn! / p.kd!;
        let u = p.u1!;
        const seq: number[] = [u];
        for (let i = 0; i < 400 && Math.abs(u) < 1e12; i++) { u = k * u + p.c!; seq.push(u); }
        const last = seq[seq.length - 1], prev = seq[seq.length - 2], before = seq[seq.length - 3];
        let expected: string;
        if (Math.abs(last) > 1e11) expected = 'The terms increase without limit.';
        else if (Math.abs(last - before) < 1e-9 && Math.abs(last - prev) > 1e-9) expected = 'The sequence oscillates between two values.';
        else if (Math.abs(last - prev) < 1e-9) expected = `The sequence converges to $${Math.round(last) === 0 ? 0 : Math.round(last)}$.`;
        else return false;
        return expected === q.answer.value;
      }
      case 'telescope': {
        // Add up a lot of terms of the series as written.
        const m = /\\frac\{1\}\{(.+)\}/.exec(p.tex!);
        if (!m) return false;
        const factors = m[1].match(/\(?(\d*)r\s*([+-]\s*\d+)?\)?/g) ?? [];
        const parse = (s: string): [number, number] => {
          const mm = /(\d*)r\s*([+-]\s*\d+)?/.exec(s)!;
          return [mm[1] === '' ? 1 : Number(mm[1]), mm[2] ? Number(mm[2].replace(/\s+/g, '')) : 0];
        };
        if (factors.length !== 2) return false;
        const [a1, b1] = parse(factors[0]);
        const [a2, b2] = parse(factors[1]);
        let s = 0;
        for (let r = 1; r <= 40000; r++) s += 1 / ((a1 * r + b1) * (a2 * r + b2));
        return Math.abs(s - val) < 1e-3;
      }
      case 'sqrt': {
        let u = p.u1!;
        for (let i = 0; i < 200; i++) u = Math.sqrt(p.a! * u + p.c!);
        return Math.abs(u - val) < 1e-6;
      }
      default:
        return false;
    }
  },
});
