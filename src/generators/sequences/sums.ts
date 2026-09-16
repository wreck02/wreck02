import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { ordinal } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Arithmetic and geometric sums.
 * Level 1: 1 + 2 + … + n, the first n odd numbers (= n²), the first n even numbers
 * Level 2: S_n of an arithmetic series with clean a, d, n (2 + 5 + 8 + … , 20 terms)
 * Level 3: geometric sums 3 + 6 + 12 + … (8 terms) = 3(2^8 − 1) = 765
 * Level 4: sum to infinity: 8 + 4 + 2 + … = 16, 9 − 3 + 1 − … = 27/4
 * Level 5: the 5th to the 15th term, Σ notation, or n from S_n (1 + 2 + … + n = 1275 → n = 50)
 */

interface Cand {
  value: Exact | null;
  trap: string;
  must?: boolean;
}

/** "2 + 5 + 8 + \dots" — signs handled, so a negative term reads "8 - 3 - 14". */
function series(terms: number[], ending = ' + \\dots'): string {
  let out = '';
  terms.forEach((t, i) => {
    if (i === 0) out += `${t}`;
    else out += t < 0 ? ` - ${-t}` : ` + ${t}`;
  });
  return out + ending;
}

/** " + \dots" or " - \dots" depending on the sign of the term that comes next. */
function tail(next: number): string {
  return next < 0 ? ' - \\dots' : ' + \\dots';
}

/** Bracket a negative number that follows a sign: 4 + (-6). */
function br(v: number): string {
  return v < 0 ? `(${v})` : `${v}`;
}

function clean(x: Exact): boolean {
  return isCleanExact(x).ok && Number.isFinite(x.toNumber());
}

/**
 * Turn the candidate mistakes into four options worth offering.
 *
 *  - `wholeOnly` is set everywhere except the sum to infinity: every other question here adds up
 *    whole numbers, so an option like 9801/2 or 6939/2 is crossed out on sight and the candidate
 *    is really choosing between four (at level 3 two of the five could be fractions at once).
 *  - two options that agree to three significant figures make the list unreadable and turn a
 *    method question into an exact-arithmetic one: S_(n−1) sitting next to ar^(n−1) gave 765 and
 *    768, and S_n next to ar^n gave 6138 and 6144. Candidates within 1% of one already taken are
 *    dropped, keeping the earlier (more instructive) one.
 *  - the answer's place in the sorted list is randomised, so "pick the middle option" is worth no
 *    more than a guess.
 */
function usable(rng: RNG, answer: Exact, cands: Cand[], wholeOnly = true, need = 4): Distractor[] | null {
  const a = answer.toNumber();
  const taken: number[] = [a];
  const pool: Distractor[] = [];
  const apart = (x: number) => taken.every((y) => Math.abs(x - y) > 0.01 * Math.max(Math.abs(x), Math.abs(y), 1));
  for (const c of cands) {
    const v = c.value;
    if (v === null || !clean(v)) continue;
    if (wholeOnly && !v.isInteger()) continue;
    const x = v.toNumber();
    if (!apart(x)) continue;
    taken.push(x);
    pool.push({ value: v, trap: c.trap, must: c.must });
  }
  if (pool.length < need) return null;
  const order = (arr: Distractor[]) => [...arr.filter((d) => d.must), ...rng.shuffle(arr.filter((d) => !d.must))];
  const hi = order(pool.filter((d) => d.value.toNumber() > a));
  const lo = order(pool.filter((d) => d.value.toNumber() < a));
  if (hi.length + lo.length < need) return pool.slice(0, need);
  const j = rng.int(Math.max(0, need - lo.length), Math.min(hi.length, need));
  return [...hi.slice(0, j), ...lo.slice(0, need - j)];
}

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

// ----------------------------------------------------------------------------- level 1

/** 1 + 2 + … + n, 1 + 3 + … + (2n − 1), 2 + 4 + … + 2n. */
function countingQ(rng: RNG): Generated | null {
  const kind = rng.pick(['integers', 'odd', 'even'] as const);
  const n = rng.pick(kind === 'integers' ? [9, 10, 11, 12, 14, 15, 16, 18, 19, 20, 21, 24, 25, 30, 32, 35, 40, 45, 50, 60, 99, 100] : [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 25, 28, 30]);
  let answer: Exact;
  let shown: number[];
  let last: number;
  let cands: Cand[];
  let solution: string;
  let trap: string;
  if (kind === 'integers') {
    last = n;
    shown = [1, 2, 3];
    answer = E((n * (n + 1)) / 2);
    cands = [
      { value: E((n * (n - 1)) / 2), trap: 'used n(n − 1)/2: the sum to n − 1', must: true },
      { value: E(n * (n + 1)), trap: 'forgot to halve: n(n + 1) counts every pair twice' },
      { value: E(((n + 1) * (n + 2)) / 2), trap: 'one term too many' },
      // n²/2 is only offered for even n: against a whole-number answer a half is crossed out on sight
      { value: E((n * n) / 2), trap: 'used n²/2 instead of n(n + 1)/2' },
      { value: E(n * n), trap: 'confused with the sum of the first n odd numbers' },
      { value: E((n * (n + 1)) / 2 + n), trap: 'counted the last term twice' },
    ];
    solution = `Pair the ends: $\\frac{${n}(${n} + 1)}{2} = ${(n * (n + 1)) / 2}$.`;
    trap = 'Sum of 1 to n is n(n + 1)/2 — the half is easy to drop, and n(n − 1)/2 stops one term short.';
  } else if (kind === 'odd') {
    last = 2 * n - 1;
    shown = [1, 3, 5];
    answer = E(n * n);
    cands = [
      { value: E((n + 1) * (n + 1)), trap: 'counted one odd number too many', must: true },
      { value: E((n - 1) * (n - 1)), trap: 'counted one odd number too few' },
      { value: E((last * (last + 1)) / 2), trap: 'summed every whole number up to the last term, not just the odd ones' },
      { value: E(n * (n + 1)), trap: 'used the even-number sum n(n + 1)' },
      { value: E(n * last), trap: 'multiplied the number of terms by the last term (no halving)' },
      { value: E(last), trap: 'gave the last term instead of the sum' },
    ];
    solution = `There are $${n}$ odd numbers up to $${last}$, and the first $n$ odd numbers add to $n^{2}$: $${n}^{2} = ${n * n}$.`;
    trap = 'Count the odd numbers first: up to 2n − 1 there are n of them, and their sum is n², not the sum of 1 to 2n − 1.';
  } else {
    last = 2 * n;
    shown = [2, 4, 6];
    answer = E(n * (n + 1));
    cands = [
      { value: E(n * n), trap: 'used the odd-number sum n²', must: true },
      { value: E((n * (n + 1)) / 2), trap: 'halved once too often: each term is twice a whole number' },
      { value: E((n + 1) * (n + 2)), trap: 'counted one term too many' },
      { value: E(n * last), trap: 'multiplied the number of terms by the last term (no halving)' },
      { value: E((n - 1) * n), trap: 'counted one term too few' },
      { value: E(last), trap: 'gave the last term instead of the sum' },
    ];
    solution = `$2 + 4 + \\dots + ${last} = 2(1 + 2 + \\dots + ${n}) = 2 \\times \\frac{${n} \\times ${n + 1}}{2} = ${n * (n + 1)}$.`;
    trap = 'The first n even numbers add to n(n + 1): take the factor 2 out first, and do not halve twice.';
  }
  if (!clean(answer)) return null;
  const distractors = usable(rng, answer, cands);
  if (!distractors) return null;
  return {
    stem: `Find the value of $${series(shown, ` + \\dots + ${last}`)}$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution,
    trap,
    tags: ['series', 'sums', 'arithmetic'],
    params: { variant: kind, n, last },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 2

/** S_n of an arithmetic series. */
function apSumQ(rng: RNG): Generated | null {
  const a = rng.int(-4, 9);
  const d = rng.sign() * rng.int(2, 7);
  const n = rng.pick([10, 12, 15, 16, 20, 25, 30]);
  const S = (n * (2 * a + (n - 1) * d)) / 2;
  const last = a + (n - 1) * d;
  const answer = E(S);
  if (!clean(answer) || Math.abs(S) > 4000 || Math.abs(last) > 200) return null;
  const cands: Cand[] = [
    { value: E((n * (2 * a + n * d)) / 2), trap: 'used nd instead of (n − 1)d for the last term', must: true },
    { value: E(((n - 1) * (2 * a + (n - 2) * d)) / 2), trap: 'summed only n − 1 terms' },
    { value: E(n * (2 * a + (n - 1) * d)), trap: 'forgot to halve' },
    { value: E((n * (a + (n - 1) * d)) / 2), trap: 'used a + (n − 1)d instead of 2a + (n − 1)d' },
    { value: E(last), trap: 'gave the last term instead of the sum' },
    { value: E(((n + 1) * (2 * a + n * d)) / 2), trap: 'counted one term too many' },
    { value: E(n * a), trap: 'multiplied the first term by the number of terms, forgetting d' },
  ];
  const distractors = usable(rng, answer, cands);
  if (!distractors) return null;
  const showTerms = rng.bool(0.6);
  const terms = [0, 1, 2].map((i) => a + i * d);
  const stem = showTerms
    ? `Find the sum of the first $${n}$ terms of the arithmetic series $${series(terms, tail(a + 3 * d))}$.`
    : `An arithmetic series has first term $${a}$ and common difference $${d}$. Find the sum of its first $${n}$ terms.`;
  return {
    stem,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `The last term is $${a} + ${n - 1} \\times ${br(d)} = ${last}$, so $S = \\frac{${n}}{2}(${a} + ${br(last)}) = ${S}$.`,
    trap: 'The nth term uses (n − 1)d, so the last term of 20 terms is a + 19d, not a + 20d.',
    tags: ['series', 'sums', 'arithmetic'],
    params: { variant: 'ap', a, d, n, S },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 3

/** S_n of a geometric series with ratio 2 or 3. */
function gpSumQ(rng: RNG): Generated | null {
  const r = rng.pick([2, 2, 3]);
  const a = rng.int(1, 6);
  const n = r === 2 ? rng.int(6, 10) : rng.int(4, 6);
  const S = (a * (r ** n - 1)) / (r - 1);
  const answer = E(S);
  if (!clean(answer) || S > 9999) return null;
  const last = a * r ** (n - 1);
  const cands: Cand[] = [
    { value: E(last), trap: 'gave the last term ar^(n−1) instead of the sum', must: true },
    { value: E(a * r ** n), trap: 'gave ar^n: one power too far' },
    { value: E((a * (r ** (n - 1) - 1)) / (r - 1)), trap: 'summed only n − 1 terms' },
    { value: E((a * (r ** (n + 1) - 1)) / (r - 1)), trap: 'summed one term too many' },
    // only offered when it comes out whole: the series adds integers, so a fraction is no option
    { value: frac(a * (r ** n - 1), r + 1), trap: 'divided by r + 1 instead of r − 1' },
    { value: E((n * (a + last)) / 2), trap: 'used the arithmetic sum formula n(a + l)/2' },
    { value: E(n * last), trap: 'multiplied the number of terms by the last term' },
    { value: E(S + last), trap: 'counted the last term twice' },
    { value: E(a * (r ** n - 1)), trap: 'forgot to divide by r − 1' },
  ];
  const distractors = usable(rng, answer, cands);
  if (!distractors) return null;
  const terms = [0, 1, 2].map((i) => a * r ** i);
  const stem = rng.bool(0.6)
    ? `Find the sum of the first $${n}$ terms of the geometric series $${series(terms, tail(a * r ** 3))}$.`
    : `A geometric series has first term $${a}$ and common ratio $${r}$. Find the sum of its first $${n}$ terms.`;
  return {
    stem,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: r === 2
      ? `$S_{${n}} = \\frac{${a}(2^{${n}} - 1)}{2 - 1} = ${a} \\times ${r ** n - 1} = ${S}$.`
      : `$S_{${n}} = \\frac{${a}(${r}^{${n}} - 1)}{${r} - 1} = \\frac{${a} \\times ${r ** n - 1}}{${r - 1}} = ${S}$.`,
    trap: 'The denominator is r − 1 (or 1 − r if you write 1 − r^n on top) — and the power is n, not n − 1.',
    tags: ['series', 'sums', 'geometric'],
    params: { variant: 'gp', a, r, n, S },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 4

const INF_RATIOS: [number, number][] = [[1, 2], [1, 3], [1, 4], [2, 3], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5], [5, 6], [-1, 2], [-1, 3], [-2, 3], [-3, 4], [-1, 4], [-2, 5], [-1, 5], [-3, 5], [-1, 6]];

/** Sum to infinity. */
function infiniteQ(rng: RNG): Generated | null {
  const [p, q] = rng.pick(INF_RATIOS);
  const m = rng.int(1, 6);
  const a = m * q * q;
  const terms = [a, (a * p) / q, (a * p * p) / (q * q)];
  if (terms.some((t) => !Number.isInteger(t) || Math.abs(t) > 250)) return null;
  const answer = frac(a * q, q - p);
  if (!clean(answer)) return null;
  // the answers of this variant are routinely fractions (9 − 3 + 1 − … = 27/4), so a fractional
  // option is not a give-away here and the whole-number filter stays off
  const distractors = usable(rng, answer, [
    { value: frac(a * q, q + p), trap: 'used a/(1 + r) instead of a/(1 − r)', must: true },
    { value: frac(a * q, p - q), trap: 'sign error: a/(r − 1)' },
    { value: frac(a * q, p), trap: 'divided by r instead of by 1 − r' },
    { value: frac(a * (q - p), q), trap: 'multiplied by 1 − r instead of dividing' },
    { value: E(terms[0] + terms[1] + terms[2]), trap: 'added only the terms printed' },
    { value: frac(a * q * q, q * q - p * p), trap: 'used a/(1 − r²)' },
    { value: E(a), trap: 'gave the first term' },
  ], false);
  if (!distractors) return null;
  return {
    stem: `Find the sum to infinity of the geometric series $${series(terms, tail(terms[2] * p))}$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `The common ratio is $${frac(p, q).toLatex()}$, so $S_{\\infty} = \\frac{a}{1 - r} = \\frac{${a}}{1 - ${p < 0 ? `(${frac(p, q).toLatex()})` : frac(p, q).toLatex()}} = ${answer.toLatex()}$.`,
    trap: 'S∞ = a/(1 − r), never a/(1 + r); with a negative ratio 1 − r is bigger than 1, so the sum is small.',
    tags: ['series', 'sums', 'geometric', 'infinity'],
    params: { variant: 'infinite', a, p, q },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 5

/** Sum of the mth to the kth term of an arithmetic series. */
function rangeQ(rng: RNG): Generated | null {
  const a = rng.int(-3, 9);
  const d = rng.sign() * rng.int(2, 6);
  const m = rng.pick([4, 5, 6, 8, 10]);
  const k = m + rng.pick([6, 8, 10, 12, 15]);
  const count = k - m + 1;
  const Sk = (k * (2 * a + (k - 1) * d)) / 2;
  const Sm1 = ((m - 1) * (2 * a + (m - 2) * d)) / 2;
  const S = Sk - Sm1;
  const answer = E(S);
  if (!clean(answer) || Math.abs(S) > 4000 || Math.abs(a + (k - 1) * d) > 200) return null;
  const distractors = usable(rng, answer, [
    { value: E(Sk - (m * (2 * a + (m - 1) * d)) / 2), trap: 'subtracted S_m, which removes the mth term as well', must: true },
    { value: E(((count - 1) * (2 * (a + (m - 1) * d) + (count - 2) * d)) / 2), trap: 'counted k − m terms instead of k − m + 1' },
    { value: E(Sk), trap: 'gave the sum of all k terms' },
    { value: E(Sm1), trap: 'gave the sum of the first m − 1 terms' },
    { value: E((count * (2 * a + (count - 1) * d)) / 2), trap: 'started the block at the first term of the series' },
    { value: E(count * (a + (m - 1) * d)), trap: 'multiplied the number of terms by the first term of the block' },
    { value: E(count * (a + (k - 1) * d)), trap: 'multiplied the number of terms by the last term of the block' },
  ]);
  if (!distractors) return null;
  return {
    stem: `An arithmetic series has first term $${a}$ and common difference $${d}$. Find the sum of the ${ordinal(m)} to the ${ordinal(k)} terms inclusive.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `That block has $${count}$ terms, from $${a + (m - 1) * d}$ to $${a + (k - 1) * d}$, so $S = \\frac{${count}}{2}(${a + (m - 1) * d} + ${br(a + (k - 1) * d)}) = ${S}$. (Equivalently $S_{${k}} - S_{${m - 1}}$.)`,
    trap: 'From the mth to the kth term there are k − m + 1 terms, and you must subtract S_(m−1), not S_m.',
    tags: ['series', 'sums', 'arithmetic'],
    params: { variant: 'range', a, d, m, k, S },
    typedAllowed: true,
  };
}

/** Sigma notation. */
function sigmaQ(rng: RNG): Generated | null {
  const p = rng.sign() * rng.int(2, 6);
  const c = rng.nonZeroInt(-6, 8);
  const n = rng.pick([10, 12, 15, 20, 24, 25, 30]);
  const S = (p * n * (n + 1)) / 2 + c * n;
  const answer = E(S);
  if (!clean(answer) || Math.abs(S) > 4000) return null;
  const tex = `${p === 1 ? '' : p === -1 ? '-' : p}r ${c >= 0 ? '+' : '-'} ${Math.abs(c)}`;
  const distractors = usable(rng, answer, [
    { value: E((p * n * (n + 1)) / 2), trap: 'forgot the constant term, which contributes cn', must: true },
    { value: E((p * n * (n + 1)) / 2 + c), trap: 'added the constant once instead of n times' },
    { value: E((p * n * (n - 1)) / 2 + c * n), trap: 'used n(n − 1)/2 for the sum of 1 to n' },
    { value: E(p * n + c), trap: 'gave the last term instead of the sum' },
    { value: E(p * n * (n + 1) + c * n), trap: 'forgot to halve n(n + 1)' },
    { value: E((p * n * (n + 1)) / 2 + c * (n + 1)), trap: 'counted n + 1 terms' },
    { value: E((p * (n + 1) * (n + 2)) / 2 + c * (n + 1)), trap: 'summed from r = 0 as well' },
  ]);
  if (!distractors) return null;
  return {
    stem: `Find the value of $\\displaystyle\\sum_{r=1}^{${n}} (${tex})$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: `Split it: $${p === 1 ? '' : p}\\sum r ${c >= 0 ? '+' : '-'} ${Math.abs(c)} \\times ${n} = ${p === 1 ? '' : p} \\times \\frac{${n} \\times ${n + 1}}{2} ${c >= 0 ? '+' : '-'} ${Math.abs(c * n)} = ${S}$.`,
    trap: 'The constant inside the sum appears once for each of the n terms, so it contributes cn.',
    tags: ['series', 'sums', 'sigma'],
    params: { variant: 'sigma', p, c, n, S },
    typedAllowed: true,
  };
}

/** Given S_n, find n. */
function findNQ(rng: RNG): Generated | null {
  const kind = rng.pick(['integers', 'odd'] as const);
  const n = rng.int(9, 50);
  const S = kind === 'integers' ? (n * (n + 1)) / 2 : n * n;
  if (S > 4000) return null;
  const answer = E(n);
  // lopsided "off by one or two" offsets, so the answer is not the middle of a symmetric spread
  const offsets = rng.pick([[1, 2], [-1, 1], [-2, -1], [-1, 2], [1, 3], [-3, -1], [-1, 1, 2], [-2, -1, 1]]);
  const offCands: Cand[] = offsets.map((o) => ({
    value: n + o > 0 ? E(n + o) : null,
    trap: o > 0 ? `counted ${o} term${o > 1 ? 's' : ''} too many` : `stopped ${-o} term${o < -1 ? 's' : ''} short`,
  }));
  const cands: Cand[] = kind === 'integers'
    ? [
        { value: E(n + 1), trap: 'read off n + 1, the other factor of the doubled sum', must: true },
        { value: E(Math.round(Math.sqrt(S))), trap: 'solved n(n + 1) = S without doubling the sum first' },
        { value: E(2 * n), trap: 'forgot the factor of a half' },
        { value: E(Math.round(S / n)), trap: 'divided the sum by n instead of solving for n' },
        ...offCands,
      ]
    : [
        { value: E(2 * n - 1), trap: 'gave the last odd number instead of how many there are', must: true },
        { value: E(Math.round(Math.sqrt(2 * S))), trap: 'used 1 + 2 + … + n instead of the odd numbers' },
        { value: E(2 * n), trap: 'doubled n' },
        { value: E(Math.round(n / 2)), trap: 'halved n, as if only every other number counted' },
        ...offCands,
      ];
  const distractors = usable(rng, answer, cands);
  if (!distractors) return null;
  const stem = kind === 'integers'
    ? `Given that $1 + 2 + 3 + \\dots + n = ${S}$, find the value of $n$.`
    : `The first $n$ odd numbers add up to $${S}$. Find the value of $n$.`;
  return {
    stem,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, distractors),
    solution: kind === 'integers'
      ? `$\\frac{n(n+1)}{2} = ${S}$, so $n(n + 1) = ${2 * S} = ${n} \\times ${n + 1}$, giving $n = ${n}$.`
      : `The first $n$ odd numbers add to $n^{2}$, so $n^{2} = ${S}$ and $n = ${n}$.`,
    trap: 'Double the sum first: n(n + 1) is a product of consecutive numbers, so look for the square root of the doubled sum.',
    tags: ['series', 'sums', 'reverse'],
    params: { variant: `find-n-${kind}`, n, S },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'm1.sequences.sums',
  module: 'M1',
  topic: 'sequences',
  title: 'Arithmetic and geometric sums',
  levels: {
    1: '1 + 2 + … + n, the first n odd numbers (n²), the first n even numbers',
    2: 'S_n of an arithmetic series with clean a, d, n',
    3: 'geometric sums with ratio 2 or 3: 3 + 6 + 12 + … (8 terms) = 765',
    4: 'sum to infinity: 8 + 4 + 2 + … = 16, 9 − 3 + 1 − … = 27/4',
    5: 'the mth to the kth term, Σ notation, or n given S_n',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return countingQ(rng);
        case 2: return apSumQ(rng);
        case 3: return gpSumQ(rng);
        case 4: return infiniteQ(rng);
        default: return pickVariant(rng, [rangeQ, sigmaQ, findNQ]);
      }
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const p = q.params as { variant: string; n?: number; a?: number; d?: number; r?: number; m?: number; k?: number; c?: number; p?: number; q?: number; S?: number; last?: number };
    const got = q.answer.value.toNumber();
    const close = (x: number, y: number) => Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(y));
    // Every case adds the terms one at a time rather than using a closed form.
    let total = 0;
    switch (p.variant) {
      case 'integers':
        for (let i = 1; i <= p.n!; i++) total += i;
        return close(got, total) && p.last === p.n;
      case 'odd':
        for (let i = 1; i <= p.n!; i++) total += 2 * i - 1;
        return close(got, total) && p.last === 2 * p.n! - 1;
      case 'even':
        for (let i = 1; i <= p.n!; i++) total += 2 * i;
        return close(got, total) && p.last === 2 * p.n!;
      case 'ap':
        for (let i = 0; i < p.n!; i++) total += p.a! + i * p.d!;
        return close(got, total);
      case 'gp': {
        let term = p.a!;
        for (let i = 0; i < p.n!; i++) { total += term; term *= p.r!; }
        return close(got, total);
      }
      case 'infinite': {
        const r = p.p! / p.q!;
        let term = p.a!;
        for (let i = 0; i < 600; i++) { total += term; term *= r; }
        return Math.abs(got - total) <= 1e-9 * Math.max(1, Math.abs(total));
      }
      case 'range':
        for (let i = p.m!; i <= p.k!; i++) total += p.a! + (i - 1) * p.d!;
        return close(got, total);
      case 'sigma':
        for (let r = 1; r <= p.n!; r++) total += p.p! * r + p.c!;
        return close(got, total);
      case 'find-n-integers': {
        const n = Math.round(got);
        if (!Number.isInteger(n) || n < 1) return false;
        for (let i = 1; i <= n; i++) total += i;
        return total === p.S! && total - n !== p.S!;
      }
      case 'find-n-odd': {
        const n = Math.round(got);
        if (!Number.isInteger(n) || n < 1) return false;
        for (let i = 1; i <= n; i++) total += 2 * i - 1;
        return total === p.S! && total - (2 * n - 1) !== p.S!;
      }
      default:
        return false;
    }
  },
});
