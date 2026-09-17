import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, type Exact } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import type { RNG } from '../../core/rng';

/**
 * The three log laws: log a + log b = log ab, log a − log b = log(a/b), n log a = log a^n,
 * plus change of base and a log equation.
 *
 * Level 1: collapse a sum/difference onto a power of the base — log_10 4 + log_10 25 = 2
 * Level 2: a coefficient appears — 2 log_3 6 − log_3 4 = 2
 * Level 3: write an expression as a single logarithm (choice) — 2 log_2 3 + log_2 4 = log_2 36
 * Level 4: log_a x in terms of p = log_a 2 and q = log_a 3 (choice) — log_a 12 = 2p + q
 * Level 5: a chain of logs, log_4 8 × log_8 16 = 2, or solving log_2 x + log_2 (x − 2) = 3
 *
 * Levels 1 and 2 are built so that a law really has to be used: at least one argument is never
 * a power of the base (otherwise the candidate just reads the indices off and adds them), and the
 * parameters are drawn to favour draws where one of the spec's named slips —
 * log a ± log b = log(a ± b), n log a = log(na) — lands on a power of the base and can therefore
 * be offered as a value. Those slips are the must-keep distractors.
 *
 * The value of one of these expressions is positive by construction, so −k (the "divided the wrong
 * way round" reversal) is never offered: a list holding k and −k would let a candidate pick the
 * positive one without using a log law. `ranked` then draws the rest from both sides of the answer,
 * because a pool that brackets k symmetrically makes "take the middle option" the whole question.
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

/**
 * Fill the four slots from both sides of the answer. A target number of options below the answer
 * is drawn first and each slot is then filled from whichever side is still short, with the
 * headline traps preferred *within the side that is needed*. Taking every `must` first (or, worse,
 * offering a fixed menu of three candidates below and three above, as the log equation used to)
 * makes the answer the median of the five options in question after question. Returns null when
 * four distinct named candidates are not available, so the caller redraws instead of letting
 * `buildOptions` pad with unlabelled perturbations.
 */
function ranked(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], count = 4): Distractor[] | null {
  const seen: Exact[] = [answer];
  const out: Distractor[] = [];
  const isBelow = (d: Distractor) => d.value.cmp(answer) < 0;
  const pools = [rng.shuffle(clean(must)), rng.shuffle(clean(extra))];
  const wantBelow = rng.int(0, count);
  const pull = (below: boolean): Distractor | null => {
    for (const pool of pools) {
      const i = pool.findIndex((d) => isBelow(d) === below && !seen.some((s) => s.equals(d.value)));
      if (i >= 0) return pool.splice(i, 1)[0];
    }
    return null;
  };
  while (out.length < count) {
    const needBelow = out.filter(isBelow).length < wantBelow;
    const d = pull(needBelow) ?? pull(!needBelow);
    if (!d) return null;
    seen.push(d.value);
    out.push(d);
  }
  return out;
}

function numericOptions(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[]) {
  const ds = ranked(rng, answer, must, extra);
  return ds && buildOptions(rng, answer, ds);
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

interface Collapse { coefs: number[]; args: number[] }

/** The single-log argument a candidate reaches by slipping one of the laws, with the slip named. */
function slipArgs(coefs: number[], args: number[]): { arg: number; trap: string }[] {
  const hasCoef = coefs.some((c) => Math.abs(c) !== 1);
  const hasMinus = coefs.some((c) => c < 0);
  const out: { arg: number; trap: string }[] = [
    {
      arg: coefs.reduce((acc, c, i) => acc + Math.sign(c) * args[i] ** Math.abs(c), 0),
      trap: hasMinus ? 'treated log a − log b as log(a − b)' : 'treated log a + log b as log(a + b)',
    },
  ];
  if (hasCoef) {
    out.push({
      arg: argument(coefs.map((c) => Math.sign(c)), args.map((a, i) => Math.abs(coefs[i]) * a)),
      trap: 'used n log a = log(na) instead of log(a^n)',
    });
    out.push({
      arg: coefs.reduce((acc, c, i) => acc + Math.sign(c) * Math.abs(c) * args[i], 0),
      trap: 'multiplied out the coefficient and then added the arguments',
    });
  }
  if (hasMinus) {
    out.push({
      arg: argument(coefs.map((c, i) => (i === 0 ? c : -c)), args),
      trap: 'multiplied the arguments where the minus sign means divide',
    });
  }
  return out.filter((s) => Number.isFinite(s.arg) && s.arg > 0);
}

/** Does a named slip land on a power of the base, so that it can be offered as a value? */
function slipsLand(b: number, k: number, coefs: number[], args: number[]): boolean {
  return slipArgs(coefs, args).some((s) => {
    const m = powerExp(b, s.arg);
    return m !== null && m !== k;
  });
}

/**
 * Distractors for the "find the value" levels, split into the headline mistakes the question is
 * built around and the rest. Every one is the value a named mistake produces: the law slips that
 * land on a power of the base, a whole logarithm dropped or mis-signed, the argument quoted
 * instead of the logarithm, and a miscount of the powers of b (the miscounts are different slips,
 * so they carry different wording rather than the same trap string twice).
 */
function collapseDistractors(b: number, k: number, coefs: number[], args: number[]): { must: Distractor[]; extra: Distractor[] } {
  const T = b ** k;
  const named: Distractor[] = [];
  for (const s of slipArgs(coefs, args)) {
    const m = powerExp(b, s.arg);
    if (m !== null && m !== k) named.push({ value: E(m), trap: s.trap });
  }
  // Reversing a two-term difference gives log_b(y / x^n) = −k exactly. It is not offered: the value
  // of one of these expressions is positive by construction, so a list holding both v and −v lets a
  // candidate take the positive one without touching a log law. "Multiplied where the minus means
  // divide" covers the same misconception with a value that is not the answer's mirror image.
  const must = clean(named).slice(0, 2).map((d) => ({ ...d, must: true }));
  const extra: Distractor[] = clean(named).slice(2);
  if (T <= 1000) {
    extra.push({ value: E(T), trap: 'gave the argument of the logarithm rather than its value' });
    // when no law slip lands on a power of the base, that is the mistake the question tests
    if (must.length === 0) must.push({ value: E(T), trap: 'gave the argument of the logarithm rather than its value', must: true });
  }
  if (Number.isInteger(T / b) && T / b <= 100) {
    extra.push({ value: E(T / b), trap: `divided the argument by the base: $\\log_{${b}} ${T}$ is not $${T} \\div ${b}$` });
  }
  // a whole logarithm dropped, or the last one's sign reversed — offered when what is left is
  // still a power of the base, so the value is one a candidate could actually write down
  const last = coefs.length - 1;
  const partial = powerExp(b, argument(coefs.slice(0, last), args.slice(0, last)));
  if (partial !== null && partial !== k) extra.push({ value: E(partial), trap: `left out $\\log_{${b}} ${args[last]}$ altogether` });
  const flipped = powerExp(b, argument([...coefs.slice(0, last), -coefs[last]], args));
  if (flipped !== null && flipped !== k) {
    extra.push({ value: E(flipped), trap: coefs[last] < 0 ? 'multiplied by the last argument where the minus sign means divide' : 'divided by the last argument where the plus sign means multiply' });
  }
  if (k !== 0) extra.push({ value: E(0), trap: 'thought the arguments cancelled down to $\\log_b 1 = 0$' });
  if (k !== 1) extra.push({ value: E(1), trap: 'thought the arguments cancelled down to $\\log_b b = 1$' });
  extra.push({ value: E(k - 1), trap: `counted one power of ${b} too few: ${T} = ${b}^{${k}}` });
  extra.push({ value: E(k + 1), trap: `counted one power of ${b} too many: ${T} = ${b}^{${k}}` });
  extra.push({ value: E(k + 2), trap: `misread ${T} as ${b}^{${k + 2}}` });
  return { must, extra: clean(extra) };
}

function collapseValue(rng: RNG, b: number, k: number, coefs: number[], args: number[], level: Level): Generated | null {
  const answer = E(k);
  const T = b ** k;
  const single = argument(coefs, args);
  const hasCoef = coefs.some((c) => Math.abs(c) !== 1);
  const hasMinus = coefs.some((c) => c < 0);
  const { must, extra } = collapseDistractors(b, k, coefs, args);
  const options = numericOptions(rng, answer, must, extra);
  if (!options) return null;
  const trap = hasCoef
    ? 'n log a = log(a^n), not log(na): the coefficient becomes a power before the arguments are combined.'
    : hasMinus
      ? 'log a + log b = log(ab) and log a − log b = log(a/b): the arguments multiply and divide, they never add.'
      : 'log a + log b = log(ab): the arguments multiply, they never add.';
  return {
    stem: `Find the value of $${exprTex(b, coefs, args)}$.`,
    answer: { kind: 'exact', value: answer },
    options,
    solution: `Combine into one logarithm: $${exprTex(b, coefs, args)} = \\log_{${b}} ${single}$, and $${b}^{${k}} = ${T}$, so the value is $${k}$.`,
    trap,
    tags: ['logarithms', 'log-laws', level >= 2 ? 'power-law' : 'product-law'],
    params: { variant: 'collapse', b, coefs, args, k },
    typedAllowed: true,
  };
}

/** Level 1: log_10 4 + log_10 25, log_2 96 − log_2 3, log_3 4 + log_3 9 − log_3 12. */
function plainCollapse(rng: RNG): Generated | null {
  const b = rng.pick(BASES);
  const k = rng.int(b === 10 ? 1 : 2, b === 2 ? 5 : b === 3 ? 4 : 3);
  const T = b ** k;
  if (T > 1000) return null;
  // A product of two arguments that are both powers of b is no question at all (the candidate
  // reads the indices off and adds them), and for a prime base uv = b^k forces exactly that —
  // so the two-term product form only exists for the composite base.
  const form = rng.weighted(['product', 'quotient', 'triple'], [b === 10 ? 4 : 0, 3, 4]);
  const draws: Collapse[] = [];
  if (form === 'product') {
    for (const [x, y] of factorPairs(T, 100)) {
      if (powerExp(b, x) !== null && powerExp(b, y) !== null) continue;
      draws.push({ coefs: [1, 1], args: [x, y] }, { coefs: [1, 1], args: [y, x] });
    }
  } else if (form === 'quotient') {
    for (let v = 2; v <= 30; v++) {
      if (powerExp(b, v) !== null || T * v > 600) continue;
      draws.push({ coefs: [1, -1], args: [T * v, v] });
    }
  } else {
    for (let z = 2; z <= 12; z++) {
      for (const [x, y] of factorPairs(T * z, 100)) {
        if (x === z || y === z) continue;
        if ([x, y, z].every((g) => powerExp(b, g) !== null)) continue;
        draws.push({ coefs: [1, 1, -1], args: [x, y, z] }, { coefs: [1, 1, -1], args: [y, x, z] });
      }
    }
  }
  if (draws.length === 0) return null;
  // Prefer a draw whose named slip lands on a power of b, so the trap can be offered as a value.
  // log(a ± b) is the rarest of them — with integer arguments and a base that is not a perfect
  // power, a slipped argument is only usable when it happens to be a power of b — so when one of
  // those draws exists it gets an extra look-in.
  const landing = draws.filter((d) => slipsLand(b, k, d.coefs, d.args));
  const sumLanding = draws.filter((d) => {
    const m = powerExp(b, d.args.reduce((acc, a, i) => acc + Math.sign(d.coefs[i]) * a, 0));
    return m !== null && m !== k;
  });
  const pool = sumLanding.length > 0 && rng.bool(0.3) ? sumLanding : landing.length > 0 && rng.bool(0.7) ? landing : draws;
  const d = rng.pick(pool);
  return collapseValue(rng, b, k, d.coefs, d.args, 1);
}

/**
 * (b, x) with x = 2b^s: exactly the draws for which "n log a = log(na)" lands on a power of b,
 * because the slipped argument is n·b^k / x^(n−1) = b^(k−s). 2 log_3 6 − log_3 4 is the classic.
 */
const NA_FAMILIES: [number, number][] = [[3, 6], [3, 18], [3, 54], [5, 10], [5, 50], [10, 20], [10, 200]];

/** Level 2: 2 log_3 6 − log_3 4 = 2, 3 log_2 6 − log_2 27 = 3, 2 log_5 10 + log_5 5 − log_5 4 = 3. */
function coefCollapse(rng: RNG): Generated | null {
  let b: number, n: number, x: number;
  if (rng.bool(0.35)) {
    [b, x] = rng.pick(NA_FAMILIES);
    n = 2;
  } else {
    b = rng.pick(BASES);
    n = rng.pick([2, 2, 3]);
    x = rng.int(2, 30);
    if (powerExp(b, x) !== null) return null; // n log_b b^m is no question at all
  }
  const P = x ** n;
  if (P < 8 || P > 50000) return null;
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
  // the coefficient reads just as naturally in the middle or at the end:
  // log_5 5 + 2 log_5 10 − log_5 4,  log_5 5 − log_5 4 + 2 log_5 10
  return rng.pick([
    () => collapseValue(rng, b, k, [n, 1, -1], [x, y, z], 2),
    () => collapseValue(rng, b, k, [1, n, -1], [y, x, z], 2),
    () => collapseValue(rng, b, k, [1, -1, n], [y, z, x], 2),
  ])();
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
  const wrongArg = (x: number, trap: string, must = false) => ({ value: x, trap, must });
  const cands = [
    wrongArg(Math.abs(c1) * A * B ** c2, 'used n log a = log(na) instead of log(a^n)', true),
    wrongArg(P + Math.sign(c2) * B ** Math.abs(c2), 'treated log a + log b as log(a + b)', true),
    wrongArg(Math.abs(c1) * A + Math.sign(c2) * Math.abs(c2) * B, 'multiplied out the coefficient and then added the arguments'),
    wrongArg(P * B ** -c2, 'multiplied where the minus sign means divide (or the other way round)'),
    wrongArg((A * B) ** c1, 'applied the power to both arguments'),
    wrongArg(P * B ** c2 * b, 'slipped an extra factor of the base in'),
  ];
  const cap = Math.max(200, 6 * N); // an option 50× the answer gives the game away
  const usable = cands.filter((c) => Number.isInteger(c.value) && c.value >= 2 && c.value <= cap && c.value !== N);
  const wrong = usable
    .filter((c, idx) => usable.findIndex((v) => v.value === c.value) === idx)
    .map((c) => ({ display: `$\\log_{${b}} ${c.value}$`, trap: c.trap, must: c.must }));
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
  if (i === 0 || j === 0) return null; // the stem promises "in terms of p and q", so both must appear
  if (i < 0 && j < 0) return null;
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
  const cands: { display: string; trap: string; must?: boolean }[] = [];
  const add = (text: string, trap: string, must = false) => { if (text !== combo(i, j, c)) cands.push({ display: `$${text}$`, trap, must }); };
  add(combo(i === 0 ? 0 : Math.sign(i) * P1 ** Math.abs(i), j === 0 ? 0 : Math.sign(j) * P2 ** Math.abs(j), c), 'used the factor itself as the coefficient instead of the index', true);
  if (i > 0 && j > 0) add(`${i * j === 1 ? '' : i * j}pq`, 'multiplied the logs instead of adding them: log(ab) ≠ log a × log b', true);
  if (i !== j) add(combo(j, i, c), 'swapped p and q');
  add(combo(i, -j, c), 'sign slip: division subtracts the logarithm');
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
  const must: Distractor[] = [
    { value: frac(a, e), trap: 'inverted the chain: this is log_N B, not log_B N' },
  ];
  const extra: Distractor[] = [
    { value: E(p ** (e - a)), trap: 'divided the numbers instead of taking logarithms' },
    // only when it stays positive: log_B N of two numbers bigger than 1 cannot be negative, so a
    // negative option would be eliminated without doing the change of base
    ...(e > a ? [{ value: E(e - a), trap: `subtracted the indices: $\\log_{${B}} ${N}$ divides them, it does not subtract them` }] : []),
    { value: E(e * a), trap: 'multiplied the indices instead of dividing them' },
    { value: frac(e + 1, a), trap: `miscounted the powers of ${p}: ${N} = ${p}^{${e}}` },
    { value: frac(e, a + 1), trap: `miscounted the powers of ${p}: ${B} = ${p}^{${a}}` },
    { value: answer.mulRat(2), trap: 'doubled the result' },
  ];
  if (usePower) {
    must.push({ value: frac(mPow, a).add(frac(e, mPow)), trap: 'added the two logarithms instead of multiplying them' });
    extra.push({ value: frac(mPow, a).mul(frac(mPow, e)), trap: 'inverted the second logarithm' });
  }
  const options = numericOptions(rng, answer, must, extra);
  if (!options) return null;
  return {
    stem: `Find the value of $\\log_{${B}} ${m} \\times \\log_{${m}} ${N}$.`,
    answer: { kind: 'exact', value: answer },
    options,
    solution: `Change of base: $\\log_{${B}} ${m} \\times \\log_{${m}} ${N} = \\log_{${B}} ${N}$. Since $${B} = ${p}^{${a}}$ and $${N} = ${p}^{${e}}$, this is $${answer.toLatex()}$.`,
    trap: 'log_B m × log_m N telescopes to log_B N — the middle number disappears; it is not a sum.',
    tags: ['logarithms', 'change-of-base', 'log-laws'],
    params: { variant: 'chain', p, a, e, m },
    typedAllowed: true,
  };
}

/**
 * Solve log_b x + log_b (x − d) = k, or log_b x + log_b (x + d) = k.
 *
 * Both signs are drawn: with "− d" the answer is the larger factor of b^k and with "+ d" it is the
 * smaller, so the wrong routes do not all sit on the same side of the answer in every question.
 */
function solveEquation(rng: RNG): Generated | null {
  const b = rng.pick(BASES);
  const k = rng.int(2, b === 2 ? 7 : b === 3 ? 4 : b === 5 ? 3 : 2);
  const N = b ** k;
  if (N < 8 || N > 200) return null;
  const divisors: number[] = [];
  for (let r = 2; r <= N; r++) if (N % r === 0 && r > N / r) divisors.push(r);
  const pool = divisors.filter((r) => r - N / r <= 30 && r <= 64 && N / r >= 2);
  if (pool.length === 0) return null;
  const big = rng.pick(pool);
  const small = N / big;
  const d = big - small;
  const minus = rng.bool(0.5); // x(x − d) = N (answer is the larger root) or x(x + d) = N (the smaller)
  const r = minus ? big : small;
  const otherRoot = minus ? -small : -big; // the rejected root of the quadratic
  const wrongRoot = minus ? small : big; // the other factor: what x ∓ d equals
  const answer = E(r);
  const sq = Math.round(Math.sqrt(N));
  const must: Distractor[] = [
    { value: E(otherRoot), trap: 'kept the negative root, but a logarithm needs a positive argument' },
  ];
  const extra: Distractor[] = [
    { value: E(wrongRoot), trap: `solved for $x ${minus ? '-' : '+'} ${d}$ rather than for $x$` },
    { value: E(N), trap: 'ignored the second logarithm and read x = b^k straight off' },
    { value: E(minus ? r + d : r - d), trap: `moved the ${d} the wrong way at the end` },
    { value: E(k), trap: 'gave the value of the logarithm, not of x' },
    { value: E(minus ? N + d : N - d), trap: `applied the base to the second logarithm only: read it as $x ${minus ? '-' : '+'} ${d} = ${b}^{${k}}$` },
  ];
  if (sq * sq === N && sq !== r) extra.push({ value: E(sq), trap: `dropped the ${d} and solved $x^{2} = ${N}$` });
  // log_b x + log_b (x ∓ d) read as log_b(2x ∓ d) = k gives a linear equation
  if ((N + (minus ? d : -d)) % 2 === 0) {
    must.push({ value: E((N + (minus ? d : -d)) / 2), trap: 'treated log a + log b as log(a + b)' });
  }
  const dTex = minus ? `x - ${d}` : `x + ${d}`;
  const options = numericOptions(rng, answer, must, extra);
  if (!options) return null;
  return {
    stem: `Solve $\\log_{${b}} x + \\log_{${b}} (${dTex}) = ${k}$.`,
    answer: { kind: 'exact', value: answer },
    options,
    solution: `$\\log_{${b}} \\left(x(${dTex})\\right) = ${k}$, so $x(${dTex}) = ${b}^{${k}} = ${N}$, i.e. $x = ${r}$ or $x = ${otherRoot}$. The negative root is rejected because $\\log_{${b}} x$ needs $x > 0$, so $x = ${r}$.`,
    trap: 'Both logarithms need a positive argument, so the negative root of the quadratic must be rejected.',
    tags: ['logarithms', 'log-laws', 'equation'],
    params: { variant: 'solve', b, k, d: minus ? d : -d },
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
        // at least one argument must not be a power of the base, or no law is being used
        const allPowers = args.every((a) => {
          const l = Math.log(a) / Math.log(b);
          return Math.abs(l - Math.round(l)) < 1e-9;
        });
        if (allPowers) return false;
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
        if (i === 0 || j === 0) return false; // the stem asks for both p and q
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
