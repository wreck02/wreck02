import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import type { RNG } from '../../core/rng';

/**
 * Recurrence relations.
 * Level 1: u_{n+1} = u_n + d with u_1 given → u_5
 * Level 2: u_{n+1} = 2u_n − 3 → u_4
 * Level 3: periodic sequences: u_{n+1} = 1/(1 − u_n) has period 3 → u_100; u_{n+1} = c − u_n has period 2
 * Level 4: find k from two terms of u_{n+1} = k u_n + c, or the limit of u_{n+1} = ½u_n + 3
 * Level 5: u_{n+1} = 2u_n − u_{n−1} → u_10, or the sum of the first 100 terms of a periodic sequence
 */

const FRACTION = { format: 'fraction' as const };
const tx = (x: Exact): string => x.toLatex(FRACTION);
const plus = (k: number): string => (k >= 0 ? `+ ${k}` : `- ${-k}`);
/** "a + b - c": join exact terms with the right sign instead of printing "+ -1/4". */
const signedSum = (xs: Exact[]): string =>
  xs.map((x, i) => (i === 0 ? tx(x) : x.sign() < 0 ? ` - ${tx(x.neg())}` : ` + ${tx(x)}`)).join('');
function attempt(f: () => Exact): Exact | null {
  try {
    const v = f();
    return Number.isFinite(v.toNumber()) ? v : null;
  } catch {
    return null;
  }
}

function cleanOnly(ds: { value: Exact | null; trap: string }[], maxAbs = 1e6): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } =>
    d.value !== null && Number.isFinite(d.value.toNumber()) && Math.abs(d.value.toNumber()) <= maxAbs && isCleanExact(d.value).ok);
}

/**
 * Choose the distractors that go to buildOptions.
 *
 * Exactly ONE `must` candidate is guaranteed a place (drawn at random from the spec-named traps),
 * because forcing both halves of an off-by-one pair — u₁ + nd and u₁ + (n−2)d, iterate(n) and
 * iterate(n−2) — put the answer between them every time and made "pick the middle number" worth
 * 70–80%. The remaining slots are filled towards a target rank drawn uniformly from whatever the
 * pool allows, so the answer lands at every position in the sorted option list.
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

/** Pick a sub-variant first, then retry its parameters, so rejection rates do not skew the mix of variants. */
function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

const options = (rng: RNG, answer: Exact, ds: Distractor[]) => buildOptions(rng, answer, ds, FRACTION);

// ----------------------------------------------------------------------------- level 1

function arithmeticQ(rng: RNG): Generated | null {
  const u1 = rng.int(-8, 12);
  const d = rng.nonZeroInt(-9, 9);
  const n = rng.int(5, 7);
  const answer = E(u1 + (n - 1) * d);
  if (!isCleanExact(answer).ok) return null;
  // Only one half of the off-by-one bracket is a headline trap; the rest of the pool carries
  // mistakes that land above and below the answer, so it is not the middle option every time.
  const late = rng.bool(0.5);
  const tooMany = { value: E(u1 + n * d), trap: 'off by one: added d one time too many' };
  const tooFew = { value: E(u1 + (n - 2) * d), trap: 'off by one: added d one time too few' };
  const sum = (n * (2 * u1 + (n - 1) * d)) / 2;
  const distractors = balanced(rng, answer, cleanOnly([late ? tooMany : tooFew]), cleanOnly([
    late ? tooFew : tooMany,
    { value: E(u1 - (n - 1) * d), trap: 'subtracted d instead of adding it' },
    { value: E(n * d), trap: 'forgot the first term and counted n steps' },
    { value: E((n - 1) * d), trap: 'forgot to add the first term' },
    { value: E(2 * u1 + (n - 1) * d), trap: 'counted the first term twice' },
    { value: E(u1 * d), trap: 'multiplied the first term by d' },
    { value: E(u1 + d), trap: 'took only one step' },
    { value: E(u1 + (n + 1) * d), trap: 'counted the terms from zero' },
    { value: E(d + (n - 1) * u1), trap: 'swapped $u_1$ and $d$ in $u_1 + (n-1)d$' },
    { value: E(sum), trap: 'summed the first n terms instead of giving the nth' },
  ]));
  return {
    stem: `A sequence is defined by $u_{n+1} = u_n ${plus(d)}$, with $u_1 = ${u1}$. Find $u_{${n}}$.`,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, distractors),
    solution: `Going from $u_1$ to $u_{${n}}$ takes $${n - 1}$ steps: $u_{${n}} = ${u1} + ${n - 1} \\times ${d < 0 ? `(${d})` : d} = ${answer.toLatex()}$.`,
    trap: 'From u₁ to u_n there are n − 1 steps, not n.',
    tags: ['sequences', 'recurrence', 'arithmetic'],
    params: { variant: 'arith', u1, d, n },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 2

function affineQ(rng: RNG): Generated | null {
  const k = rng.pick([2, 3, -2, -1, 4]);
  const c = rng.nonZeroInt(-6, 6);
  const u1 = rng.int(-4, 8);
  const n = k === 4 ? 4 : rng.int(4, 5);
  const iterate = (steps: number, start: number, order: 'normal' | 'swapped'): number => {
    let u = start;
    for (let i = 0; i < steps; i++) u = order === 'normal' ? k * u + c : k * (u + c);
    return u;
  };
  const value = iterate(n - 1, u1, 'normal');
  if (Math.abs(value) > 400 || value === u1) return null;
  const answer = E(value);
  // As at level 1: only one of iterate(n) / iterate(n−2) is guaranteed, so the answer is not
  // bracketed by the off-by-one pair in every question.
  const far = rng.bool(0.5);
  const tooFar = { value: E(iterate(n, u1, 'normal')), trap: 'went one step too far (found $u_{n+1}$)' };
  const tooShort = { value: E(iterate(n - 2, u1, 'normal')), trap: 'stopped one step early' };
  const distractors = balanced(rng, answer, cleanOnly([far ? tooFar : tooShort]), cleanOnly([
    far ? tooShort : tooFar,
    { value: E(iterate(n - 1, u1, 'swapped')), trap: 'used $k(u_n + c)$ instead of $ku_n + c$' },
    { value: E(u1 * k ** (n - 1)), trap: 'ignored the constant c' },
    { value: E(u1 * k ** (n - 1) + c), trap: 'added the constant only once, at the end' },
    { value: E(k * u1 + (n - 1) * c), trap: 'multiplied only once and then added c at every step' },
    { value: E(k * value), trap: 'took one more step but dropped the constant on it' },
    { value: E(u1 + (n - 1) * c), trap: 'treated the sequence as arithmetic' },
    { value: E(value + c), trap: 'added c once more at the end' },
    { value: E(value - c), trap: 'left off the last constant' },
  ]));
  return {
    stem: `A sequence is defined by $u_{n+1} = ${k === 1 ? '' : k === -1 ? '-' : k}u_n ${plus(c)}$, with $u_1 = ${u1}$. Find $u_{${n}}$.`,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, distractors),
    solution: `Apply the rule $${n - 1}$ times: $${Array.from({ length: n }, (_, i) => iterate(i, u1, 'normal')).join(' \\to ')}$.`,
    trap: 'Multiply first and then add: ku_n + c, and stop at the term you were asked for.',
    tags: ['sequences', 'recurrence'],
    params: { variant: 'affine', k, c, u1, n },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 3: periodic

const START_VALUES: [number, number][] = [[2, 1], [3, 1], [4, 1], [5, 1], [-1, 1], [-2, 1], [1, 2], [1, 3], [3, 2], [2, 3], [-1, 2]];

/**
 * Starts whose three-term cycle sums to 3/2 (u₁ = 2, −1, ½) or −1/6 (u₁ = −2, ⅓, 3/2).
 * The other starts are fine for a single term (u₁ = 5 gives the cycle 5, −¼, ⅘) but their
 * cycle sums are 19/6, 53/12 and 111/20, and 33 × 111/20 is neither mental nor an exam number.
 */
const SUM_START_VALUES: [number, number][] = [[2, 1], [-1, 1], [1, 2], [-2, 1], [1, 3], [3, 2]];

function period3Q(rng: RNG): Generated | null {
  const [pn, pd] = rng.pick(START_VALUES);
  const u1 = frac(pn, pd);
  const cycle = [u1];
  for (let i = 0; i < 2; i++) {
    const next = attempt(() => E(1).div(E(1).sub(cycle[cycle.length - 1])));
    if (!next) return null;
    cycle.push(next);
  }
  const back = attempt(() => E(1).div(E(1).sub(cycle[2])));
  if (!back || !back.equals(u1)) return null;
  if (cycle.some((x) => !isCleanExact(x).ok)) return null;
  const N = rng.pick([20, 30, 50, 61, 75, 99, 100]);
  const idx = (N - 1) % 3;
  const answer = cycle[idx];
  const distractors = balanced(rng, answer, cleanOnly([
    { value: cycle[(idx + 1) % 3], trap: 'off by one in the cycle position' },
    { value: cycle[(idx + 2) % 3], trap: 'off by one in the cycle position the other way' },
    { value: answer.neg(), trap: 'sign slip in $1 - u_n$' },
    { value: attempt(() => answer.inv()), trap: 'inverted the term' },
  ]), cleanOnly([
    { value: attempt(() => E(1).sub(answer)), trap: 'gave $1 - u_n$ instead of its reciprocal' },
    { value: E(N), trap: 'answered with the index' },
    { value: answer.add(E(1)), trap: 'slip of one' },
    { value: answer.sub(E(1)), trap: 'slip of one the other way' },
    // the index-sized candidates are capped: an option a hundred times the answer is not a mistake
  ], Math.max(6, 8 * Math.abs(answer.toNumber()))));
  return {
    stem: `A sequence is defined by $u_{n+1} = \\frac{1}{1 - u_n}$, with $u_1 = ${tx(u1)}$. Find $u_{${N}}$.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: options(rng, answer, distractors),
    solution: `The sequence repeats every $3$ terms: $${cycle.map(tx).join(',\\ ')},\\ ${tx(u1)},\\ \\dots$ Since $${N} = 3 \\times ${Math.floor((N - 1) / 3)} + ${idx + 1}$, $u_{${N}} = u_{${idx + 1}} = ${tx(answer)}$.`,
    trap: 'Find the period first, then reduce the index modulo 3 — u₁ is the first term of the cycle, not u₀.',
    tags: ['sequences', 'recurrence', 'periodic'],
    params: { variant: 'period3', pn, pd, n: N },
    typedAllowed: true,
  };
}

function period2Q(rng: RNG): Generated | null {
  const c = rng.nonZeroInt(-8, 10);
  const u1 = rng.int(-6, 9);
  if (2 * u1 === c) return null; // constant sequence
  const N = rng.pick([20, 41, 50, 75, 100, 101]);
  const answer = N % 2 === 1 ? E(u1) : E(c - u1);
  if (!isCleanExact(answer).ok || answer.isZero()) return null;
  const distractors = balanced(rng, answer, cleanOnly([
    { value: N % 2 === 1 ? E(c - u1) : E(u1), trap: 'off by one: took the wrong term of the two-term cycle' },
    { value: E(c + u1), trap: 'used $c + u_n$ instead of $c - u_n$' },
    { value: E(u1 - c), trap: 'sign slip: computed $u_n - c$' },
    { value: E(c), trap: 'answered with the constant' },
  ]), cleanOnly([
    { value: E(u1 + (N - 1) * c), trap: 'treated the sequence as arithmetic' },
    { value: E(N - u1), trap: 'used the index instead of the constant' },
    { value: E(2 * c - u1), trap: 'applied $c - u_n$ twice and kept the second value' },
    { value: answer.add(E(1)), trap: 'slip of one' },
    { value: answer.sub(E(1)), trap: 'slip of one the other way' },
  ], Math.max(20, 8 * Math.abs(answer.toNumber()))));
  return {
    stem: `A sequence is defined by $u_{n+1} = ${c} - u_n$, with $u_1 = ${u1}$. Find $u_{${N}}$.`,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, distractors),
    solution: `The terms alternate: $${u1},\\ ${c - u1},\\ ${u1},\\ ${c - u1},\\ \\dots$, so every odd-numbered term is $${u1}$ and every even-numbered term is $${c - u1}$; $${N}$ is ${N % 2 === 1 ? 'odd' : 'even'}, so $u_{${N}} = ${answer.toLatex()}$.`,
    trap: 'Period 2: odd indices give u₁ and even indices give the other value — check which the index is.',
    tags: ['sequences', 'recurrence', 'periodic'],
    params: { variant: 'period2', c, u1, n: N },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 4

function findKQ(rng: RNG): Generated | null {
  const k = rng.pick([frac(1, 2), E(2), E(3), E(-2), E(4), frac(-1, 2), frac(3, 2), E(5)]);
  const c = rng.nonZeroInt(-8, 8);
  const u1 = rng.intExcluding(-9, 9, [0]);
  const u2 = attempt(() => k.mul(E(u1)).add(E(c)));
  if (!u2 || !u2.isInteger() || Math.abs(u2.toNumber()) > 60) return null;
  const answer = k;
  if (!isCleanExact(answer).ok || answer.equals(E(1))) return null;
  const q = u2.toNumber();
  const distractors = balanced(rng, answer, cleanOnly([
    { value: attempt(() => frac(q + c, u1)), trap: 'added c instead of subtracting it' },
    { value: attempt(() => frac(q, u1)), trap: 'ignored the constant c' },
    { value: attempt(() => frac(u1, q - c)), trap: 'divided the wrong way round' },
    // (q − c)·u₁ used to sit here: two orders of magnitude from every other option, so it was
    // struck out without any algebra. Wrong rearrangements of the same size replace it.
    { value: attempt(() => frac(q - c, q)), trap: 'divided by $u_2$ instead of $u_1$' },
  ]), cleanOnly([
    { value: attempt(() => frac(u1 - c, u1)), trap: 'subtracted the constant from $u_1$ instead of from $u_2$' },
    { value: attempt(() => frac(q + c, q)), trap: 'added c and divided by $u_2$' },
    { value: E(q - c), trap: 'forgot to divide by $u_1$' },
    { value: answer.neg(), trap: 'sign error' },
    { value: attempt(() => frac(q - c, u1 + c)), trap: 'divided by $u_1 + c$' },
  ], 60));
  return {
    stem: `A sequence satisfies $u_{n+1} = k u_n ${plus(c)}$. Given that $u_1 = ${u1}$ and $u_2 = ${q}$, find the value of $k$.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: options(rng, answer, distractors),
    solution: `$${q} = ${u1}k ${plus(c)}$, so $${u1}k = ${q - c}$ and $k = ${tx(answer)}$.`,
    trap: 'Subtract the constant before dividing by u₁.',
    tags: ['sequences', 'recurrence', 'solve'],
    params: { variant: 'find-k', u1, u2: q, c },
    typedAllowed: true,
  };
}

function limitQ(rng: RNG): Generated | null {
  const [an, ad] = rng.pick([[1, 2], [1, 3], [2, 3], [-1, 2], [3, 4], [1, 4], [-1, 3], [1, 5]]);
  const a = frac(an, ad);
  const c = rng.nonZeroInt(-9, 12);
  const answer = attempt(() => E(c).div(E(1).sub(a)));
  if (!answer || !isCleanExact(answer).ok) return null;
  if (Number(answer.toRat().d) > 5 || Math.abs(answer.toNumber()) > 60) return null;
  const distractors = balanced(rng, answer, cleanOnly([
    { value: attempt(() => E(c).div(E(1).add(a))), trap: 'solved $L = c - aL$ (sign error on the $aL$ term)' },
    { value: E(c), trap: 'took the limit to be the constant' },
    { value: attempt(() => E(c).mul(E(1).sub(a))), trap: 'multiplied by $1 - a$ instead of dividing' },
    { value: attempt(() => E(c).div(a)), trap: 'divided by $a$ instead of $1 - a$' },
  ]), cleanOnly([
    { value: answer.neg(), trap: 'sign error' },
    { value: E(c).mul(E(2)), trap: 'doubled the constant' },
    { value: answer.add(E(1)), trap: 'slip of one' },
  ]));
  return {
    stem: `The sequence defined by $u_{n+1} = ${tx(a)}u_n ${plus(c)}$ converges to a limit $L$. Find $L$.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: options(rng, answer, distractors),
    solution: `At the limit $L = ${tx(a)}L ${plus(c)}$, so $${tx(E(1).sub(a))}L = ${c}$ and $L = ${tx(answer)}$.`,
    trap: 'Put u_{n+1} = u_n = L and keep the constant: L(1 − a) = c, not L = aL.',
    tags: ['sequences', 'recurrence', 'limit'],
    params: { variant: 'limit', an, ad, c },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 5

function secondOrderQ(rng: RNG): Generated | null {
  const u1 = rng.int(-6, 10);
  const d = rng.nonZeroInt(-6, 8);
  const u2 = u1 + d;
  const N = rng.pick([10, 12, 15, 20]);
  const answer = E(u1 + (N - 1) * d);
  if (!isCleanExact(answer).ok || Math.abs(answer.toNumber()) > 400) return null;
  // Distractors stay in the same range as the answer: a wild outlier is not a mistake anyone makes.
  const near = Math.max(60, 3 * Math.abs(answer.toNumber()));
  const ratio = u1 !== 0 && u2 % u1 === 0 ? u2 / u1 : null;
  const geometric = ratio !== null && Math.abs(ratio) > 1 ? u1 * ratio ** (N - 1) : null;
  const late = rng.bool(0.5);
  const tooMany = { value: E(u1 + N * d), trap: 'off by one: used $u_1 + nd$' };
  const tooFew = { value: E(u1 + (N - 2) * d), trap: 'one step too few' };
  const distractors = balanced(rng, answer, cleanOnly([late ? tooMany : tooFew], near), cleanOnly([
    late ? tooFew : tooMany,
    { value: E(u2 + (N - 1) * d), trap: 'counted the steps from $u_2$' },
    { value: E(u1 - (N - 1) * d), trap: 'used $u_{n-1} - u_n$ for the common difference' },
    { value: E(u1 + 2 * (N - 2) * d), trap: 'applied the rule as $2u_{n-1} - u_1$, reusing the first term' },
    { value: E(N * d), trap: 'forgot the first term and counted n steps' },
    { value: E((N - 1) * d), trap: 'forgot to add the first term' },
    { value: E(2 * u1 + (N - 1) * d), trap: 'counted the first term twice' },
    { value: E(u1 + (N + 1) * d), trap: 'counted the terms from zero' },
    { value: E(u1 + (N - 1) * u2), trap: 'used $u_2$ as the common difference' },
    { value: geometric === null ? null : E(geometric), trap: 'read $2u_n$ as a common ratio and doubled each time' },
  ], near));
  return {
    stem: `A sequence is defined by $u_{n+1} = 2u_n - u_{n-1}$ for $n \\ge 2$, with $u_1 = ${u1}$ and $u_2 = ${u2}$. Find $u_{${N}}$.`,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, distractors),
    solution: `$u_{n+1} - u_n = u_n - u_{n-1}$, so the sequence is arithmetic with common difference $${d}$: $u_{${N}} = ${u1} + ${N - 1} \\times ${d < 0 ? `(${d})` : d} = ${answer.toLatex()}$.`,
    trap: 'The rule says the differences are constant — it is an arithmetic sequence, not a doubling one.',
    tags: ['sequences', 'recurrence', 'arithmetic'],
    params: { variant: 'second-order', u1, u2, n: N },
    typedAllowed: true,
  };
}

function periodicSumQ(rng: RNG): Generated | null {
  const usePeriod3 = rng.bool(0.5);
  if (usePeriod3) {
    const [pn, pd] = rng.pick(SUM_START_VALUES);
    const u1 = frac(pn, pd);
    const cycle = [u1];
    for (let i = 0; i < 2; i++) {
      const next = attempt(() => E(1).div(E(1).sub(cycle[cycle.length - 1])));
      if (!next) return null;
      cycle.push(next);
    }
    const back = attempt(() => E(1).div(E(1).sub(cycle[2])));
    if (!back || !back.equals(u1)) return null;
    const cycleSum = cycle.reduce((acc, x) => acc.add(x), Exact.ZERO);
    const N = rng.pick([30, 60, 99]);
    const answer = cycleSum.mul(E(N / 3));
    if (!isCleanExact(answer).ok || Math.abs(answer.toNumber()) > 500) return null;
    // A multiple of a cycle sum is only an exam answer if it stays small: at most two
    // significant figures over a denominator of 6 or less (15, 30, 99/2, −5/3, −11/2).
    const ans = answer.toRat();
    if (ans.d > 6n || String(ans.n < 0n ? -ans.n : ans.n).replace(/0+$/, '').length > 2) return null;
    const distractors = balanced(rng, answer, cleanOnly([
      { value: cycleSum, trap: 'gave the sum of one cycle only' },
      { value: cycleSum.mul(E(N)), trap: 'multiplied by n instead of n/3' },
      { value: u1.mul(E(N)), trap: 'assumed every term equals $u_1$' },
      { value: cycleSum.mul(E(N / 3 + 1)), trap: 'counted one cycle too many' },
    ]), cleanOnly([
      { value: cycleSum.mul(E(N / 3 - 1)), trap: 'counted one cycle too few' },
      { value: cycleSum.mul(E(N / 3)).add(u1), trap: 'added an extra first term' },
      { value: E(N), trap: 'answered with the number of terms' },
    ]));
    return {
      stem: `A sequence is defined by $u_{n+1} = \\frac{1}{1 - u_n}$, with $u_1 = ${tx(u1)}$. Find the sum of the first $${N}$ terms.`,
      answer: { kind: 'exact', value: answer, format: 'fraction' },
      options: options(rng, answer, distractors),
      solution: `The sequence repeats every $3$ terms and one cycle sums to $${signedSum(cycle)} = ${tx(cycleSum)}$. There are $${N / 3}$ complete cycles, so the sum is $${N / 3} \\times ${cycleSum.sign() < 0 ? `\\left(${tx(cycleSum)}\\right)` : tx(cycleSum)} = ${tx(answer)}$.`,
      trap: 'Sum one period, then multiply by the number of complete periods.',
      tags: ['sequences', 'recurrence', 'periodic', 'series'],
      params: { variant: 'sum3', pn, pd, n: N },
      typedAllowed: true,
    };
  }
  const c = rng.nonZeroInt(-6, 10);
  const u1 = rng.int(-5, 9);
  if (2 * u1 === c) return null;
  const N = rng.pick([20, 50, 100]);
  const answer = E((N / 2) * c);
  if (!isCleanExact(answer).ok || answer.isZero()) return null;
  const distractors = balanced(rng, answer, cleanOnly([
    { value: E(N * c), trap: 'used every term as a pair' },
    { value: E(N * u1), trap: 'assumed every term equals $u_1$' },
    { value: E((N / 2) * c + u1), trap: 'added an extra first term' },
    { value: E((N / 2) * (c - u1)), trap: 'used the second term instead of the pair sum' },
  ]), cleanOnly([
    { value: E(c), trap: 'gave the sum of one pair only' },
    { value: E((N / 2 - 1) * c), trap: 'counted one pair too few' },
    { value: E((N / 2) * c).neg(), trap: 'sign error' },
  ]));
  return {
    stem: `A sequence is defined by $u_{n+1} = ${c} - u_n$, with $u_1 = ${u1}$. Find the sum of the first $${N}$ terms.`,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, distractors),
    solution: `The terms alternate $${u1},\\ ${c - u1},\\ \\dots$ and each consecutive pair adds to $${c}$. There are $${N / 2}$ pairs, so the sum is $${N / 2} \\times ${c < 0 ? `(${c})` : c} = ${answer.toLatex()}$.`,
    trap: 'Pair the terms: each pair adds to c, and there are n/2 pairs.',
    tags: ['sequences', 'recurrence', 'periodic', 'series'],
    params: { variant: 'sum2', c, u1, n: N },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'm1.sequences.recurrence',
  module: 'M1',
  topic: 'sequences',
  title: 'Recurrence relations',
  levels: {
    1: 'u_{n+1} = u_n + d with u_1 given → u_5',
    2: 'u_{n+1} = 2u_n − 3 → u_4',
    3: 'periodic: u_{n+1} = 1/(1 − u_n) → u_100, or u_{n+1} = c − u_n',
    4: 'find k from two terms, or the limit of u_{n+1} = ½u_n + 3',
    5: 'u_{n+1} = 2u_n − u_{n−1} → u_10, or the sum of the first 100 terms of a periodic sequence',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      if (level === 1) return arithmeticQ(rng);
      if (level === 2) return affineQ(rng);
      if (level === 3) return pickVariant(rng, [period3Q, period2Q]);
      if (level === 4) return pickVariant(rng, [findKQ, limitQ]);
      return pickVariant(rng, [secondOrderQ, periodicSumQ]);
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const got = q.answer.value.toNumber();
    const close = (x: number, tol = 1e-9) => Number.isFinite(x) && Math.abs(got - x) <= tol * Math.max(1, Math.abs(x));
    const p = q.params as {
      variant: string; u1?: number; u2?: number; d?: number; k?: number; c?: number; n?: number;
      pn?: number; pd?: number; an?: number; ad?: number;
    };
    switch (p.variant) {
      case 'arith': {
        // Iterate the recurrence rather than using the closed form.
        let u = p.u1!;
        for (let i = 1; i < p.n!; i++) u += p.d!;
        return close(u);
      }
      case 'affine': {
        let u = p.u1!;
        for (let i = 1; i < p.n!; i++) u = p.k! * u + p.c!;
        return close(u);
      }
      case 'period3': {
        let u = p.pn! / p.pd!;
        for (let i = 1; i < p.n!; i++) u = 1 / (1 - u);
        return close(u, 1e-6);
      }
      case 'period2': {
        let u = p.u1!;
        for (let i = 1; i < p.n!; i++) u = p.c! - u;
        return close(u);
      }
      case 'find-k':
        // Substitute the answer back into the recurrence.
        return Math.abs(got * p.u1! + p.c! - p.u2!) < 1e-9;
      case 'limit': {
        // A limit satisfies L = aL + c; also check the iteration really tends to it.
        const a = p.an! / p.ad!;
        if (Math.abs(a * got + p.c! - got) > 1e-9) return false;
        let u = 0;
        for (let i = 0; i < 200; i++) u = a * u + p.c!;
        return close(u, 1e-6);
      }
      case 'second-order': {
        let prev = p.u1!, cur = p.u2!;
        for (let i = 2; i < p.n!; i++) { const next = 2 * cur - prev; prev = cur; cur = next; }
        return close(p.n! === 1 ? prev : cur);
      }
      case 'sum3': {
        let u = p.pn! / p.pd!;
        let total = 0;
        for (let i = 1; i <= p.n!; i++) { total += u; u = 1 / (1 - u); }
        return close(total, 1e-6);
      }
      case 'sum2': {
        let u = p.u1!;
        let total = 0;
        for (let i = 1; i <= p.n!; i++) { total += u; u = p.c! - u; }
        return close(total);
      }
      default:
        return false;
    }
  },
});
