import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import type { RNG } from '../../core/rng';

/**
 * The three log laws: log a + log b = log ab, log a − log b = log(a/b), n log a = log a^n,
 * plus change of base and a log equation.
 *
 * Level 1: collapse a sum/difference of logs onto a power of the base — log_10 4 + log_10 25 = 2
 * Level 2: a coefficient appears — 2 log_3 6 − log_3 4 = 2
 * Level 3: write an expression as a single logarithm (choice) — 2 log_2 3 + log_2 4 = log_2 36
 * Level 4: log_a x in terms of p = log_a 2 and q = log_a 3 (choice) — log_a 12 = 2p + q
 * Level 5: a chain of logs, log_4 8 × log_8 16 = 2, or solving log_2 x + log_2 (x − 2) = 3
 *
 * params carry the raw numbers so verify() can redo everything with Math.log / substitution:
 *   collapse, single-log: { b, coefs: number[], args: number[] }
 *   in-terms:             { i, j, c }            meaning  log_a (2^i 3^j a^c)
 *   chain:                { p, a, e, m }         meaning  log_(p^a) m × log_m (p^e)
 *   solve:                { b, k, d }            meaning  log_b x + log_b (x − d) = k
 */

const BASES = [2, 3, 5, 10];

/** m with b^m = x, else null. */
function powerExp(b: number, x: number): number | null {
  if (!(x > 0)) return null;
  for (let m = -3; m <= 10; m++) {
    if (Math.abs(b ** m - x) < 1e-9 * Math.max(1, x)) return m;
  }
  return null;
}

/** Pairs x·y = S with 2 ≤ x < y ≤ max. */
function factorPairs(S: number, max: number): [number, number][] {
  const out: [number, number][] = [];
  for (let x = 2; x * x < S; x++) {
    if (S % x === 0 && S / x <= max) out.push([x, S / x]);
  }
  return out;
}

function clean(ds: Distractor[]): Distractor[] {
  return ds.filter((d) => Number.isFinite(d.value.toNumber()) && isCleanExact(d.value).ok);
}

/** "2\log_{3} 6 - \log_{3} 4" from signed coefficients. */
function exprTex(b: number, coefs: number[], args: number[]): string {
  let s = '';
  coefs.forEach((c, i) => {
    const mag = Math.abs(c);
    const body = `${mag === 1 ? '' : mag}\\log_{${b}} ${args[i]}`;
    if (i === 0) s += (c < 0 ? '-' : '') + body;
    else s += (c < 0 ? ' - ' : ' + ') + body;
  });
  return s;
}

/** The product Π arg^coef of an expression (its single-log argument), built as a whole fraction so
 *  that 14² × 2 / 49 comes out as exactly 8 rather than 7.999999999999999. */
function argument(coefs: number[], args: number[]): number {
  let num = 1, den = 1;
  coefs.forEach((c, i) => {
    if (c >= 0) num *= args[i] ** c;
    else den *= args[i] ** -c;
  });
  return num / den;
}

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 60; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

// ----------------------------------------------------------------------------- levels 1–2

/** Distractors shared by the "find the value" levels: the three classic law slips, then index slips. */
function collapseDistractors(b: number, k: number, coefs: number[], args: number[]): Distractor[] {
  const T = b ** k;
  const out: Distractor[] = [];
  const fromArg = (x: number, trap: string) => {
    const m = powerExp(b, x);
    if (m !== null && m !== k) out.push({ value: E(m), trap });
  };
  // log a ± log b read as log(a ± b)
  fromArg(coefs.reduce((acc, c, i) => acc + Math.sign(c) * args[i] ** Math.abs(c), 0), 'treated log a + log b as log(a + b)');
  // n log a read as log(na)
  fromArg(coefs.reduce((acc, c, i) => acc * (Math.abs(c) * args[i]) ** Math.sign(c), 1), 'used n log a = log(na) instead of log(a^n)');
  // both slips at once
  fromArg(coefs.reduce((acc, c, i) => acc + Math.sign(c) * Math.abs(c) * args[i], 0), 'multiplied out the coefficient and then added the arguments');
  // every sign after the first flipped: multiply where you should divide
  fromArg(argument(coefs.map((c, i) => (i === 0 ? c : -c)), args), 'multiplied the arguments where the minus sign means divide');
  out.push({ value: E(k + 1), trap: 'index slip: the argument is not b^(k+1)' });
  out.push({ value: E(k - 1), trap: 'index slip: the argument is not b^(k−1)' });
  if (k !== 1) out.push({ value: E(1), trap: 'thought the arguments cancelled down to log_b b = 1' });
  if (k !== 0) out.push({ value: E(0), trap: 'thought the arguments cancelled down to log_b 1 = 0' });
  out.push({ value: E(2 * k), trap: 'doubled the index' });
  if (T <= 100) out.push({ value: E(T), trap: 'gave the argument of the logarithm rather than its value' });
  out.push({ value: E(k + 2), trap: 'arithmetic slip in the index' });
  out.push({ value: E(k - 2), trap: 'arithmetic slip in the index' });
  return clean(out);
}

function collapseValue(rng: RNG, b: number, k: number, coefs: number[], args: number[], level: Level): Generated {
  const answer = E(k);
  const T = b ** k;
  const single = argument(coefs, args);
  return {
    stem: `Find the value of $${exprTex(b, coefs, args)}$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, collapseDistractors(b, k, coefs, args), { fallback: [E(k + 3), E(k - 2), E(3 * k)] }),
    solution: `Combine into one logarithm: $${exprTex(b, coefs, args)} = \\log_{${b}} ${single}$, and $${b}^{${k}} = ${T}$, so the value is $${k}$.`,
    trap: 'log a + log b = log(ab) and n log a = log(a^n): the arguments multiply, they never add.',
    tags: ['logarithms', 'log-laws', level >= 2 ? 'power-law' : 'product-law'],
    params: { variant: 'collapse', b, coefs, args, k },
    typedAllowed: true,
  };
}

/** Level 1: log_10 4 + log_10 25, log_3 12 + log_3 3 − log_3 4. */
function plainCollapse(rng: RNG): Generated | null {
  const b = rng.pick(BASES);
  const k = rng.int(b === 10 ? 1 : 2, b === 2 ? 5 : b === 3 ? 4 : 3);
  const T = b ** k;
  if (T > 1000) return null;
  if (rng.bool(0.55)) {
    const pairs = factorPairs(T, 100);
    if (pairs.length === 0) return null;
    const [x, y] = rng.pick(pairs);
    const [u, v] = rng.bool() ? [x, y] : [y, x];
    return collapseValue(rng, b, k, [1, 1], [u, v], 1);
  }
  const z = rng.int(2, 9);
  const pairs = factorPairs(T * z, 100);
  if (pairs.length === 0) return null;
  const [x, y] = rng.pick(pairs);
  if (x === z || y === z) return null;
  const [u, v] = rng.bool() ? [x, y] : [y, x];
  return collapseValue(rng, b, k, [1, 1, -1], [u, v, z], 1);
}

/** Level 2: 2 log_3 6 − log_3 4 = 2, 2 log_2 6 + log_2 8 − log_2 9 = 5. */
function coefCollapse(rng: RNG): Generated | null {
  const n = rng.pick([2, 2, 2, 3]);
  const x = rng.int(2, 16);
  const P = x ** n;
  if (P < 8 || P > 600) return null;
  const b = rng.pick(BASES);
  if (powerExp(b, x) !== null) return null; // n log_b b^m is no question at all
  let kMax = 0;
  let rest = P;
  while (rest % b === 0) { rest /= b; kMax++; }
  if (kMax < 1) return null;
  if (rng.bool(0.5)) {
    // n log_b x − log_b y  with  x^n / y = b^k
    const k = rng.int(1, kMax);
    const y = P / b ** k;
    if (y < 2 || y > 100) return null;
    return collapseValue(rng, b, k, [n, -1], [x, y], 2);
  }
  // n log_b x + log_b y − log_b z  with  x^n · y / z = b^k
  const k = rng.int(kMax, kMax + 2);
  const T = b ** k;
  if (T > 1000) return null;
  let g = P, h = T;
  while (h) [g, h] = [h, g % h];
  const y = T / g, z = P / g;
  if (y < 2 || y > 100 || z < 2 || z > 100 || y === z) return null;
  return collapseValue(rng, b, k, [n, 1, -1], [x, y, z], 2);
}

// ----------------------------------------------------------------------------- level 3

/** Write c1 log_b A ± c2 log_b B as a single logarithm. */
function singleLog(rng: RNG): Generated | null {
  const b = rng.pick(BASES);
  const c1 = rng.pick([2, 2, 3]);
  const A = rng.int(2, 7);
  const P = A ** c1;
  if (P > 200 || powerExp(b, A) !== null) return null;
  const c2 = rng.weighted([1, -1, 2, -2], [4, 4, 1, 1]);
  const B = rng.int(2, 12);
  if (B === A) return null;
  const N = P * B ** c2;
  if (!Number.isInteger(N) || N < 2 || N > 400) return null; // a single log of a 4-digit number is no longer mental
  const coefs = [c1, c2];
  const args = [A, B];
  const correct = `$\\log_{${b}} ${N}$`;
  const wrongArg = (x: number, trap: string) => ({ value: x, trap });
  const cands = [
    wrongArg(Math.abs(c1) * A * B ** c2, 'used n log a = log(na) instead of log(a^n)'),
    wrongArg(P + Math.sign(c2) * B ** Math.abs(c2), 'treated log a + log b as log(a + b)'),
    wrongArg(Math.abs(c1) * A + Math.sign(c2) * Math.abs(c2) * B, 'multiplied out the coefficient and then added the arguments'),
    wrongArg(P * B ** -c2, 'multiplied where the minus sign means divide (or the other way round)'),
    wrongArg((A * B) ** c1, 'applied the power to both arguments'),
    wrongArg(P * B ** c2 * b, 'slipped an extra factor of the base in'),
  ];
  const cap = Math.max(200, 6 * N); // an option 50× the answer gives the game away
  const usable = cands.filter((c) => Number.isInteger(c.value) && c.value >= 2 && c.value <= cap && c.value !== N);
  const wrong = usable
    .filter((c, idx) => usable.findIndex((v) => v.value === c.value) === idx)
    .map((c) => ({ display: `$\\log_{${b}} ${c.value}$`, trap: c.trap }));
  if (wrong.length < 4) return null;
  return {
    stem: `Write $${exprTex(b, coefs, args)}$ as a single logarithm.`,
    answer: { kind: 'choice', value: correct },
    options: buildChoiceOptions(rng, correct, wrong),
    solution: `$${exprTex(b, coefs, args)} = \\log_{${b}} ${A}^{${c1}} ${c2 > 0 ? '+' : '-'} \\log_{${b}} ${Math.abs(c2) === 1 ? `${B}` : `${B}^{${Math.abs(c2)}}`} = \\log_{${b}} ${N}$.`,
    trap: 'The coefficient becomes a power (n log a = log a^n), and then the arguments multiply or divide — they never add.',
    tags: ['logarithms', 'log-laws', 'single-logarithm'],
    params: { variant: 'single-log', b, coefs, args, N },
    typedAllowed: false,
  };
}

// ----------------------------------------------------------------------------- level 4

/** LaTeX for i·p + j·q + c, e.g. "2p + q", "3q - p", "p + q + 1". */
function combo(i: number, j: number, c: number): string {
  let s = '';
  const push = (coef: number, sym: string) => {
    if (coef === 0) return;
    const mag = Math.abs(coef);
    const body = sym === '' ? `${mag}` : `${mag === 1 ? '' : mag}${sym}`;
    s += s === '' ? (coef < 0 ? `-${body}` : body) : (coef < 0 ? ` - ${body}` : ` + ${body}`);
  };
  push(i, 'p');
  push(j, 'q');
  push(c, '');
  return s === '' ? '0' : s;
}

/** log_a x in terms of p = log_a P1 and q = log_a P2 (P1, P2 a pair of small primes). */
function inTerms(rng: RNG): Generated | null {
  const [P1, P2] = rng.pick([[2, 3], [2, 3], [2, 5], [3, 5], [2, 7]]);
  const i = rng.int(-2, 3);
  const j = rng.int(-2, 2);
  const c = rng.bool(0.25) ? 1 : 0;
  if (i < 0 && j < 0) return null;
  if (Math.abs(i) + Math.abs(j) < 2) return null; // log_a 2 = p is not a question
  if ((i === 0 || j === 0) && rng.bool(0.6)) return null; // mostly use both primes
  const num = P1 ** Math.max(i, 0) * P2 ** Math.max(j, 0);
  const den = P1 ** Math.max(-i, 0) * P2 ** Math.max(-j, 0);
  if (num > 200 || den > 27 || (num === 1 && den === 1)) return null;
  const aTex = c === 1 ? 'a' : '';
  const body = den === 1
    ? `${num === 1 ? '' : num}${aTex}`
    : `\\frac{${num === 1 && aTex ? aTex : `${num}${aTex}`}}{${den}}`;
  const arg = den === 1 && !aTex ? `${num}` : `\\left(${body}\\right)`;
  // "12 = 2^2 \times 3", "9/2 = \frac{3^2}{2}"
  const pow = (base: number, e: number) => (e === 1 ? `${base}` : `${base}^{${e}}`);
  const top = [...(i > 0 ? [pow(P1, i)] : []), ...(j > 0 ? [pow(P2, j)] : []), ...(c === 1 ? ['a'] : [])];
  const bot = [...(i < 0 ? [pow(P1, -i)] : []), ...(j < 0 ? [pow(P2, -j)] : [])];
  const topTex = top.length ? top.join(' \\times ') : '1';
  const factorTex = bot.length ? `\\frac{${topTex}}{${bot.join(' \\times ')}}` : topTex;
  const correct = `$${combo(i, j, c)}$`;
  const cands: { display: string; trap: string }[] = [];
  const add = (text: string, trap: string) => { if (text !== combo(i, j, c)) cands.push({ display: `$${text}$`, trap }); };
  if (i !== j) add(combo(j, i, c), 'swapped p and q');
  if (i > 0 && j > 0) add(`${i * j === 1 ? '' : i * j}pq`, 'multiplied the logs instead of adding them: log(ab) ≠ log a × log b');
  add(combo(i, -j, c), 'sign slip: division subtracts the logarithm');
  add(combo(i === 0 ? 0 : Math.sign(i) * P1 ** Math.abs(i), j === 0 ? 0 : Math.sign(j) * P2 ** Math.abs(j), c), 'used the factor itself as the coefficient instead of the index');
  add(combo(Math.sign(i), Math.sign(j), c), 'ignored the indices: log 2^3 = 3p, not p');
  if (c === 1) add(combo(i, j, 0), 'dropped log_a a = 1');
  else add(combo(i, j, 1), 'invented an extra 1');
  add(combo(i * 2, j * 2, c), 'doubled every index');
  const wrong = cands.filter((w, idx) => cands.findIndex((v) => v.display === w.display) === idx);
  if (wrong.length < 4) return null;
  return {
    stem: `Given that $p = \\log_a ${P1}$ and $q = \\log_a ${P2}$, express $\\log_a ${arg}$ in terms of $p$ and $q$.`,
    answer: { kind: 'choice', value: correct },
    options: buildChoiceOptions(rng, correct, wrong),
    solution: `Factorise the argument: $${body} = ${factorTex}$, so the logarithm is $${combo(i, j, c)}$.`,
    trap: 'Powers come down as coefficients (log 2^3 = 3p, not 8p) and a quotient subtracts.',
    tags: ['logarithms', 'log-laws', 'in-terms-of'],
    params: { variant: 'in-terms', i, j, c, P1, P2 },
    typedAllowed: false,
  };
}

// ----------------------------------------------------------------------------- level 5

/** log_(p^a) m × log_m (p^e) = e/a. */
function chain(rng: RNG): Generated | null {
  const p = rng.pick([2, 2, 3, 5]);
  const a = rng.int(1, p === 2 ? 4 : 2);
  const e = rng.int(1, p === 2 ? 7 : p === 3 ? 4 : 3);
  if (e === a) return null;
  const B = p ** a;
  const N = p ** e;
  if (B < 2 || N > 200 || B === N) return null;
  const answer = frac(e, a);
  if (!isCleanExact(answer).ok || answer.equals(E(1))) return null;
  // the middle argument: usually another power of p, sometimes an "impossible" number that still cancels
  const usePower = rng.bool(0.6);
  const mPow = rng.int(1, 6);
  const m = usePower ? p ** mPow : rng.pick([6, 7, 10, 12, 15, 20]);
  if (m === B || m === 1 || m > 200) return null;
  if (usePower && (m === N || p ** mPow > 128)) return null;
  const cands: Distractor[] = [
    { value: frac(a, e), trap: 'inverted the chain: this is log_N B, not log_B N' },
    { value: E(p ** (e - a)), trap: 'divided the numbers instead of taking logarithms' },
    { value: answer.add(E(1)), trap: 'index slip of one' },
    { value: answer.sub(E(1)), trap: 'index slip of one' },
    { value: answer.mulRat(2), trap: 'doubled the result' },
  ];
  if (usePower) {
    cands.push({ value: frac(mPow, a).add(frac(e, mPow)), trap: 'added the two logarithms instead of multiplying them' });
    cands.push({ value: frac(mPow, a).mul(frac(mPow, e)), trap: 'inverted the second logarithm' });
  }
  return {
    stem: `Find the value of $\\log_{${B}} ${m} \\times \\log_{${m}} ${N}$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, clean(cands), { fallback: [answer.add(E(2)), frac(e + 1, a), frac(e, a + 1)].filter((v) => isCleanExact(v).ok) }),
    solution: `Change of base: $\\log_{${B}} ${m} \\times \\log_{${m}} ${N} = \\log_{${B}} ${N}$. Since $${B} = ${p}^{${a}}$ and $${N} = ${p}^{${e}}$, this is $${answer.toLatex()}$.`,
    trap: 'log_B m × log_m N telescopes to log_B N — the middle number disappears; it is not a sum.',
    tags: ['logarithms', 'change-of-base', 'log-laws'],
    params: { variant: 'chain', p, a, e, m },
    typedAllowed: true,
  };
}

/** Solve log_b x + log_b (x − d) = k. */
function solveEquation(rng: RNG): Generated | null {
  const b = rng.pick(BASES);
  const k = rng.int(2, b === 2 ? 6 : b === 3 ? 4 : b === 5 ? 3 : 2);
  const N = b ** k;
  if (N < 8 || N > 200) return null;
  const divisors: number[] = [];
  for (let r = 2; r <= N; r++) if (N % r === 0 && r > N / r) divisors.push(r);
  const pool = divisors.filter((r) => r - N / r <= 30 && r <= 60 && N / r >= 2);
  if (pool.length === 0) return null;
  const r = rng.pick(pool);
  const other = N / r;
  const d = r - other;
  const answer = E(r);
  const cands: Distractor[] = [
    { value: E(-other), trap: 'kept the negative root, but a logarithm needs a positive argument' },
    { value: E(other), trap: `solved for $x - ${d}$ rather than for $x$` },
    { value: E(N), trap: 'ignored the second logarithm and read x = b^k straight off' },
    { value: E(r + d), trap: 'added the difference back on again' },
    { value: E(k), trap: 'gave the value of the logarithm, not of x' },
  ];
  if ((N + d) % 2 === 0) cands.push({ value: E((N + d) / 2), trap: 'treated log a + log b as log(a + b)' });
  return {
    stem: `Solve $\\log_{${b}} x + \\log_{${b}} (x - ${d}) = ${k}$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, clean(cands)),
    solution: `$\\log_{${b}} \\left(x(x - ${d})\\right) = ${k}$, so $x(x - ${d}) = ${b}^{${k}} = ${N}$, i.e. $x = ${r}$ or $x = ${-other}$. The negative root is rejected because $\\log_{${b}} x$ needs $x > 0$, so $x = ${r}$.`,
    trap: 'Both logarithms need a positive argument, so the negative root of the quadratic must be rejected.',
    tags: ['logarithms', 'log-laws', 'equation'],
    params: { variant: 'solve', b, k, d },
    typedAllowed: true,
  };
}

// -----------------------------------------------------------------------------

export default defineTemplate({
  id: 'm1.indices-logs.log-laws',
  module: 'M1',
  topic: 'indices-logs',
  title: 'Log laws',
  levels: {
    1: 'collapse a sum/difference: log_10 4 + log_10 25 = 2',
    2: 'a coefficient appears: 2 log_3 6 − log_3 4 = 2',
    3: 'write as a single logarithm: 2 log_2 3 + log_2 4 = log_2 36',
    4: 'log_a x in terms of p = log_a 2 and q = log_a 3: log_a 12 = 2p + q',
    5: 'change of base log_4 8 × log_8 16 = 2, or solve log_2 x + log_2 (x − 2) = 3',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      if (level === 1) return plainCollapse(rng);
      if (level === 2) return coefCollapse(rng);
      if (level === 3) return singleLog(rng);
      if (level === 4) return inTerms(rng);
      return pickVariant(rng, [chain, solveEquation]);
    });
  },
  verify(q) {
    const p = q.params as Record<string, unknown>;
    const close = (x: number, y: number) => Math.abs(x - y) < 1e-9 * Math.max(1, Math.abs(y));
    switch (p.variant) {
      case 'collapse': {
        if (q.answer.kind !== 'exact') return false;
        const b = p.b as number, coefs = p.coefs as number[], args = p.args as number[];
        const value = coefs.reduce((acc, c, i) => acc + c * (Math.log(args[i]) / Math.log(b)), 0);
        return close(q.answer.value.toNumber(), value) && q.answer.value.isInteger();
      }
      case 'single-log': {
        if (q.answer.kind !== 'choice') return false;
        const m = /^\$\\log_\{(\d+)\} (\d+)\$$/.exec(q.answer.value);
        if (!m) return false;
        const base = parseInt(m[1], 10), N = parseInt(m[2], 10);
        const coefs = p.coefs as number[], args = p.args as number[];
        if (base !== (p.b as number)) return false;
        const value = coefs.reduce((acc, c, i) => acc + c * (Math.log(args[i]) / Math.log(base)), 0);
        return close(Math.log(N) / Math.log(base), value);
      }
      case 'in-terms': {
        if (q.answer.kind !== 'choice') return false;
        // Evaluate the printed combination numerically with a concrete base a = 7.
        const text = q.answer.value.replace(/\$/g, '').replace(/\s+/g, '');
        const a = 7;
        const P = Math.log(p.P1 as number) / Math.log(a), Q = Math.log(p.P2 as number) / Math.log(a);
        let value = 0;
        let matched = 0;
        const re = /([+-]?)(\d*)(pq|p|q|)/g;
        let mm: RegExpExecArray | null;
        while ((mm = re.exec(text)) !== null) {
          if (mm[0] === '') { re.lastIndex++; continue; }
          matched += mm[0].length;
          const sign = mm[1] === '-' ? -1 : 1;
          const coef = mm[2] === '' ? 1 : parseInt(mm[2], 10);
          const sym = mm[3] === 'p' ? P : mm[3] === 'q' ? Q : mm[3] === 'pq' ? P * Q : 1;
          value += sign * coef * sym;
        }
        if (matched !== text.length) return false;
        const i = p.i as number, j = p.j as number, c = p.c as number;
        const target = Math.log((p.P1 as number) ** i * (p.P2 as number) ** j * a ** c) / Math.log(a);
        return close(value, target);
      }
      case 'chain': {
        if (q.answer.kind !== 'exact') return false;
        const pr = p.p as number, a = p.a as number, e = p.e as number, m = p.m as number;
        const first = Math.log(m) / Math.log(pr ** a);
        const second = Math.log(pr ** e) / Math.log(m);
        return close(q.answer.value.toNumber(), first * second);
      }
      case 'solve': {
        if (q.answer.kind !== 'exact') return false;
        const b = p.b as number, k = p.k as number, d = p.d as number;
        const x = q.answer.value.toNumber();
        if (!(x > 0) || !(x - d > 0)) return false;
        const lhs = Math.log(x) / Math.log(b) + Math.log(x - d) / Math.log(b);
        // the other root of x² − dx − b^k = 0 must be non-positive (so rejecting it is right)
        const otherRoot = d - x;
        return close(lhs, k) && otherRoot <= 0;
      }
      default:
        return false;
    }
  },
});
