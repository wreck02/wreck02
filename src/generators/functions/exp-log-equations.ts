import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, surd, Exact } from '../../core/exact';
import { buildOptions, buildSetOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import type { Option } from '../../core/template';
import { isCleanExact } from '../../core/clean';
import type { RNG } from '../../core/rng';

/**
 * Exponential and logarithmic equations (base e and general bases).
 * Level 1: 2^x = 1/8; e^(ln 5); ln(e^3)
 * Level 2: log_2(x − 1) = 3; 3^(2x) = 81; ln x = ln 7 + ln 2
 * Level 3: e^(2 ln 3); ln(x²) = 2 ln 5 + ln 4; log_3 x + log_3(x − 6) = 3 (reject the negative root)
 * Level 4: quadratic in b^x: 4^x − 5(2^x) + 4 = 0 → {0, 2}; 2(4^x) − 5(2^x) + 2 = 0 → {−1, 1}
 * Level 5: e^(2x) = 7e^x − 12 → x = ln 3 or ln 4 (choice); 2^(x+1) + 2^x = 48;
 *          log_2(x + 1) + log_2(x − 1) = 3 with a root to reject
 *
 * params carry the raw equation so verify() can substitute numerically with
 * Math.exp / Math.log rather than re-running the algebra of generate().
 */

interface Params {
  variant: string;
  a?: number; b?: number; c?: number; d?: number; k?: number; m?: number;
  shift?: number; op?: string; kn?: number; kd?: number;
  A?: number; B?: number; r1?: number; r2?: number;
  S?: number; P?: number; L?: number; p?: number; q?: number;
  e1?: number; s2?: number; N?: number; x?: number;
}

/** A candidate distractor; `must` ones are used before any other, so the headline traps always appear. */
interface Cand { value: Exact | null; trap: string; must?: boolean }

/** Drop impossible/ugly candidates, keep the must-traps first, then shuffle the rest. */
function options(rng: RNG, answer: Exact, cands: Cand[], count = 4): Option[] {
  const ok = cands.filter((c): c is { value: Exact; trap: string; must?: boolean } =>
    c.value !== null && Number.isFinite(c.value.toNumber()) && isCleanExact(c.value).ok);
  const seen: Exact[] = [answer];
  const out: Distractor[] = [];
  const take = (d: { value: Exact; trap: string }) => {
    if (out.length >= count || seen.some((s) => s.equals(d.value))) return;
    seen.push(d.value);
    out.push({ value: d.value, trap: d.trap });
  };
  ok.filter((c) => c.must).forEach(take);
  rng.shuffle(ok.filter((c) => !c.must)).forEach(take);
  return buildOptions(rng, answer, out);
}

/** The same idea for set answers: keep the named traps, drop repeated-value sets. */
function setOptions(rng: RNG, answer: Exact[], cands: { values: Exact[]; trap: string; must?: boolean }[], count = 4): Option[] {
  const same = (a: Exact[], b: Exact[]) => a.length === b.length && a.every((x, i) => x.equals(b[i]));
  const ok = cands.filter((c) => !c.values[0].equals(c.values[1]));
  const seen: Exact[][] = [answer, answer.slice().reverse()];
  const out: { values: Exact[]; trap: string }[] = [];
  const take = (d: { values: Exact[]; trap: string }) => {
    if (out.length >= count || seen.some((s) => same(s, d.values) || same(s, d.values.slice().reverse()))) return;
    seen.push(d.values);
    out.push({ values: d.values, trap: d.trap });
  };
  ok.filter((c) => c.must).forEach(take);
  rng.shuffle(ok.filter((c) => !c.must)).forEach(take);
  return buildSetOptions(rng, answer, out);
}

/** Draw the sub-variant first, then retry its parameters, so rejections do not skew the mix. */
function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 60; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

const isSquare = (n: number): boolean => n >= 0 && Math.round(Math.sqrt(n)) ** 2 === n;

// ----------------------------------------------------------------- level 1

/** 2^x = 1/8 */
function expRecip(rng: RNG): Generated | null {
  const b = rng.pick([2, 3, 5, 10]);
  const k = rng.int(2, b === 2 ? 6 : b === 3 ? 4 : 3);
  const v = b ** k;
  if (v > 1024) return null;
  const answer = E(-k);
  const ds: Cand[] = [
    { value: E(k), trap: 'lost the minus sign: 1/bᵏ is b^(−k), not b^k', must: true },
    { value: E(-1), trap: 'read every reciprocal as the index −1' },
    { value: frac(-1, k), trap: 'made the index a reciprocal instead of negating it' },
    { value: E(-v), trap: 'quoted the denominator instead of the index' },
    { value: E(-k - 1), trap: 'miscounted the power of the base' },
    { value: E(-k + 1), trap: 'miscounted the power of the base' },
  ];
  return {
    stem: `Solve $${b}^{x} = \\dfrac{1}{${v}}$.`,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, ds),
    solution: `$${v} = ${b}^{${k}}$, so $\\dfrac{1}{${v}} = ${b}^{-${k}}$ and $x = -${k}$.`,
    trap: 'A reciprocal makes the index negative: 1/bᵏ = b^(−k).',
    tags: ['exponentials', 'indices', 'solve'],
    params: { variant: 'exp-recip', b, k } satisfies Params,
    typedAllowed: true,
  };
}

/** e^(ln a) or ln(e^k) */
function cancelSingle(rng: RNG): Generated | null {
  if (rng.bool()) {
    const a = rng.pick([2, 3, 4, 5, 6, 7, 8, 9, 12, 20]);
    const answer = E(a);
    const ds: Cand[] = [
      { value: E(1), trap: 'thought e and ln cancel to give 1 instead of leaving the argument', must: true },
      { value: E(a * a), trap: 'squared the argument' },
      { value: frac(1, a), trap: 'inverted the argument' },
      { value: E(a + 1), trap: 'added the 1 from ln e' },
      { value: E(a - 1), trap: 'subtracted the 1 from ln e' },
      { value: E(2 * a), trap: 'doubled the argument' },
    ];
    return {
      stem: `Find the value of $e^{\\ln ${a}}$.`,
      answer: { kind: 'exact', value: answer },
      options: options(rng, answer, ds),
      solution: `$e^{x}$ and $\\ln x$ are inverse functions, so $e^{\\ln ${a}} = ${a}$.`,
      trap: 'e^(ln a) returns the argument a; it does not collapse to 1.',
      tags: ['logarithms', 'exponentials', 'inverse'],
      params: { variant: 'e-ln', a } satisfies Params,
      typedAllowed: true,
    };
  }
  const k = rng.int(2, 6);
  const answer = E(k);
  const ds: Cand[] = [
    { value: E(1), trap: 'used ln e = 1 and dropped the power', must: true },
    { value: E(-k), trap: 'sign slip' },
    { value: frac(1, k), trap: 'turned the power into a reciprocal' },
    { value: E(k + 1), trap: 'added an extra 1 for ln e' },
    { value: E(k * k), trap: 'squared the power' },
    { value: E(k - 1), trap: 'miscounted the power' },
  ];
  return {
    stem: `Find the value of $\\ln\\left(e^{${k}}\\right)$.`,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, ds),
    solution: `$\\ln(e^{${k}}) = ${k}\\ln e = ${k}$.`,
    trap: 'Bring the power down: ln(e^k) = k ln e = k.',
    tags: ['logarithms', 'exponentials', 'inverse'],
    params: { variant: 'ln-e', k } satisfies Params,
    typedAllowed: true,
  };
}

/** e^(ln a) + ln(e^c) */
function cancelSum(rng: RNG): Generated | null {
  const a = rng.int(2, 9);
  const c = rng.intExcluding(2, 9, [a]);
  if (a * c === a + c) return null;
  const answer = E(a + c);
  const ds: Cand[] = [
    { value: E(a * c), trap: 'multiplied the two parts instead of adding them', must: true },
    { value: E(a), trap: 'evaluated only the first term' },
    { value: E(c), trap: 'evaluated only the second term' },
    { value: E(c + 1), trap: 'took e^(ln a) to be 1' },
    { value: E(Math.abs(a - c)), trap: 'subtracted the two parts' },
    { value: E(2), trap: 'thought each part cancels to 1' },
  ];
  return {
    stem: `Find the value of $e^{\\ln ${a}} + \\ln\\left(e^{${c}}\\right)$.`,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, ds),
    solution: `Each pair of inverse functions undoes the other: $e^{\\ln ${a}} = ${a}$ and $\\ln(e^{${c}}) = ${c}$, so the total is $${a + c}$.`,
    trap: 'e^(ln a) = a and ln(e^c) = c; the two values are then added, not multiplied.',
    tags: ['logarithms', 'exponentials', 'inverse'],
    params: { variant: 'cancel-sum', a, c } satisfies Params,
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------- level 2

/** log_b(x + shift) = k */
function logLinear(rng: RNG): Generated | null {
  const b = rng.pick([2, 3, 4, 5, 10]);
  const k = rng.int(2, b === 2 ? 6 : b === 3 ? 4 : 3);
  const v = b ** k;
  if (v > 1000) return null;
  const shift = rng.sign() * rng.int(1, 9);
  const x = v - shift;
  if (x <= 0 || x === v) return null;
  const answer = E(x);
  const inside = `x ${shift >= 0 ? '+' : '-'} ${Math.abs(shift)}`;
  const ds: Cand[] = [
    { value: E(b * k - shift), trap: 'multiplied the base by the index instead of raising it', must: true },
    { value: E(v + shift), trap: 'moved the constant across the wrong way' },
    { value: E(v), trap: 'forgot the constant inside the bracket' },
    { value: E(k - shift), trap: 'read log_b(x + c) = k as x + c = k' },
    { value: E(k ** b - shift), trap: 'raised the index to the base instead of the base to the index' },
    { value: E(x + 1), trap: 'arithmetic slip' },
  ];
  return {
    stem: `Solve $\\log_{${b}}(${inside}) = ${k}$.`,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, ds),
    solution: `Undo the log: $${inside} = ${b}^{${k}} = ${v}$, so $x = ${x}$.`,
    trap: 'log_b(y) = k means y = b^k, not y = bk.',
    tags: ['logarithms', 'solve'],
    params: { variant: 'log-linear', b, k, shift } satisfies Params,
    typedAllowed: true,
  };
}

/** b^(mx) = b^k */
function expMultiple(rng: RNG): Generated | null {
  const b = rng.pick([2, 3, 5]);
  const m = rng.int(2, 3);
  const x = rng.int(2, 4);
  const k = m * x;
  const v = b ** k;
  if (v > 1024) return null;
  const answer = E(x);
  const ds: Cand[] = [
    { value: E(k), trap: 'forgot to divide the index by the coefficient of x', must: true },
    { value: E(m * k), trap: 'multiplied by the coefficient instead of dividing' },
    { value: frac(m, k), trap: 'divided the wrong way round' },
    { value: E(x + 1), trap: 'miscounted the power of the base' },
    { value: E(x - 1), trap: 'miscounted the power of the base' },
    { value: E(v / b), trap: 'divided the number by the base instead of taking logs' },
  ];
  return {
    stem: `Solve $${b}^{${m}x} = ${v}$.`,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, ds),
    solution: `$${v} = ${b}^{${k}}$, so $${m}x = ${k}$ and $x = ${x}$.`,
    trap: 'Match the indices, then divide by the coefficient of x.',
    tags: ['exponentials', 'indices', 'solve'],
    params: { variant: 'exp-multiple', b, m, k } satisfies Params,
    typedAllowed: true,
  };
}

/** ln x = ln a ± ln c */
function lnSum(rng: RNG): Generated | null {
  const plus = rng.bool(0.6);
  let a: number, c: number, x: number;
  if (plus) {
    a = rng.int(2, 12);
    c = rng.intExcluding(2, 9, [a]);
    x = a * c;
    if (x > 90) return null;
  } else {
    c = rng.int(2, 6);
    x = rng.int(2, 15);
    a = c * x;
    if (a > 90) return null;
  }
  if (a === x || c === x) return null;
  const answer = E(x);
  const ds: Cand[] = [
    { value: E(plus ? a + c : a - c), trap: plus ? 'used ln a + ln c = ln(a + c)' : 'used ln a − ln c = ln(a − c)', must: true },
    { value: E(plus ? a - c : a + c), trap: 'combined the two logarithms with the wrong operation' },
    { value: E(a), trap: 'ignored the second logarithm' },
    { value: E(c), trap: 'ignored the first logarithm' },
    { value: plus ? frac(a, c) : E(a * c), trap: 'divided when the rule says multiply (or the reverse)' },
    { value: E(x + 1), trap: 'arithmetic slip' },
  ];
  const rhs = plus ? `\\ln ${a} + \\ln ${c}` : `\\ln ${a} - \\ln ${c}`;
  return {
    stem: `Solve $\\ln x = ${rhs}$.`,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, ds),
    solution: `$${rhs} = \\ln\\left(${plus ? `${a} \\times ${c}` : `\\frac{${a}}{${c}}`}\\right) = \\ln ${x}$, so $x = ${x}$.`,
    trap: 'Adding logs multiplies the arguments: ln a + ln c = ln(ac), never ln(a + c).',
    tags: ['logarithms', 'log-laws', 'solve'],
    params: { variant: 'ln-sum', a, c, op: plus ? 'plus' : 'minus' } satisfies Params,
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------- level 3

/** e^(k ln a) with k = 2, 3, −1 or ½ */
function eCoefLn(rng: RNG): Generated | null {
  const kind = rng.weighted(['sq', 'cube', 'recip', 'root'], [4, 2, 2, 3]);
  if (kind === 'root') {
    const a = rng.pick([4, 8, 9, 12, 16, 18, 20, 25, 27, 36, 49]);
    const answer = surd(a);
    if (!isCleanExact(answer).ok) return null;
    const ds: Cand[] = [
      { value: frac(a, 2), trap: 'halved the argument instead of square-rooting it', must: true },
      { value: E(a), trap: 'ignored the coefficient of the logarithm' },
      { value: E(a * a), trap: 'squared instead of square-rooting' },
      { value: surd(a).mulRat(2), trap: 'doubled the root' },
      { value: frac(1, 2), trap: 'quoted the coefficient of the logarithm' },
      { value: surd(a * 2), trap: 'put the ½ inside the root as a multiplier' },
    ];
    return {
      stem: `Find the value of $e^{\\frac{1}{2}\\ln ${a}}$.`,
      answer: { kind: 'exact', value: answer },
      options: options(rng, answer, ds),
      solution: `$\\tfrac{1}{2}\\ln ${a} = \\ln \\sqrt{${a}}$, so $e^{\\frac{1}{2}\\ln ${a}} = \\sqrt{${a}} = ${answer.toLatex()}$.`,
      trap: 'The coefficient of a log becomes a power of the argument: ½ ln a = ln √a.',
      tags: ['logarithms', 'exponentials', 'log-laws'],
      params: { variant: 'e-coef-ln', a, kn: 1, kd: 2 } satisfies Params,
      typedAllowed: true,
    };
  }
  if (kind === 'recip') {
    const a = rng.int(2, 9);
    const answer = frac(1, a);
    const ds: Cand[] = [
      { value: E(-a), trap: 'made the whole value negative instead of taking the reciprocal', must: true },
      { value: E(a), trap: 'ignored the minus sign in the index' },
      { value: frac(-1, a), trap: 'kept a minus sign as well as inverting' },
      { value: frac(1, a * a), trap: 'squared the argument' },
      { value: E(1 - a), trap: 'subtracted instead of inverting' },
      { value: frac(1, a + 1), trap: 'arithmetic slip' },
    ];
    return {
      stem: `Find the value of $e^{-\\ln ${a}}$.`,
      answer: { kind: 'exact', value: answer },
      options: options(rng, answer, ds),
      solution: `$-\\ln ${a} = \\ln\\left(\\frac{1}{${a}}\\right)$, so $e^{-\\ln ${a}} = \\frac{1}{${a}}$.`,
      trap: 'A minus sign in front of a log inverts the argument; it does not make the answer negative.',
      tags: ['logarithms', 'exponentials', 'log-laws'],
      params: { variant: 'e-coef-ln', a, kn: -1, kd: 1 } satisfies Params,
      typedAllowed: true,
    };
  }
  const k = kind === 'sq' ? 2 : 3;
  const a = rng.pick(k === 2 ? [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [2, 3, 4, 5, 6, 7]);
  const v = a ** k;
  if (v > 400) return null;
  const answer = E(v);
  const ds: Cand[] = [
    { value: E(a * k), trap: `multiplied the ${k} by the argument instead of using it as a power`, must: true },
    { value: E(a), trap: 'ignored the coefficient of the logarithm' },
    { value: E(a + k), trap: 'added the coefficient to the argument' },
    { value: E(k ** a), trap: 'used the argument as the power and the coefficient as the base' },
    { value: E(a ** (k - 1) * 2), trap: 'doubled instead of raising to the power' },
    { value: E(v + a), trap: 'arithmetic slip' },
  ];
  return {
    stem: `Find the value of $e^{${k}\\ln ${a}}$.`,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, ds),
    solution: `$${k}\\ln ${a} = \\ln ${a}^{${k}} = \\ln ${v}$, so $e^{${k}\\ln ${a}} = ${v}$.`,
    trap: 'k ln a = ln(a^k): the coefficient is a power, so e^(2 ln 3) = 9, not 6.',
    tags: ['logarithms', 'exponentials', 'log-laws'],
    params: { variant: 'e-coef-ln', a, kn: k, kd: 1 } satisfies Params,
    typedAllowed: true,
  };
}

/** ln(x²) = 2 ln a + ln b with b a perfect square, x > 0 */
function lnSquare(rng: RNG): Generated | null {
  const s = rng.int(2, 4);
  const b = s * s;
  const a = rng.int(2, 9);
  const x = a * s;
  if (x > 40 || x === a || x === b) return null;
  const answer = E(x);
  const ds: Cand[] = [
    { value: E(a * a * b), trap: 'forgot to square-root: that is the value of x², not x', must: true },
    { value: E(a * b), trap: 'multiplied a by b instead of by √b' },
    { value: isSquare(a * a + b) ? E(Math.sqrt(a * a + b)) : null, trap: 'used ln a + ln b = ln(a + b)' },
    { value: frac(a * a * b, 2), trap: 'halved x² instead of square-rooting it' },
    { value: E(a + s), trap: 'added the two roots instead of multiplying them' },
    { value: E(2 * a + b), trap: 'read 2 ln a as 2a and added' },
    { value: E(x + 1), trap: 'arithmetic slip' },
  ];
  return {
    stem: `Given that $x > 0$ and $\\ln\\left(x^{2}\\right) = 2\\ln ${a} + \\ln ${b}$, find the value of $x$.`,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, ds),
    solution: `The right-hand side is $\\ln\\left(${a}^{2} \\times ${b}\\right) = \\ln ${a * a * b}$, so $x^{2} = ${a * a * b}$ and $x = ${x}$.`,
    trap: 'Collect the logs into one first (2 ln a + ln b = ln(a²b)), then remember to square-root.',
    tags: ['logarithms', 'log-laws', 'solve'],
    params: { variant: 'ln-square', a, b } satisfies Params,
    typedAllowed: true,
  };
}

/** log_b x + log_b(x − d) = k, rejecting the negative root */
interface LogProduct { b: number; k: number; d: number; p: number; q: number }
const LOG_PRODUCTS: LogProduct[] = [];
for (const b of [2, 3, 5]) {
  for (let k = 2; k <= 6; k++) {
    const n = b ** k;
    if (n > 100) break;
    for (let q = 1; q * q < n; q++) {
      if (n % q !== 0) continue;
      const p = n / q;
      const d = p - q;
      if (d >= 2 && d <= 14 && p <= 30) LOG_PRODUCTS.push({ b, k, d, p, q });
    }
  }
}

function logProduct(rng: RNG): Generated | null {
  const { b, k, d, p, q } = rng.pick(LOG_PRODUCTS);
  const n = b ** k;
  const answer = E(p);
  const disc = d * d + 4 * k;
  const wrongK = isSquare(disc) && (d + Math.sqrt(disc)) % 2 === 0 ? (d + Math.sqrt(disc)) / 2 : null;
  const ds: Cand[] = [
    { value: E(-q), trap: 'kept the negative root, for which neither logarithm exists', must: true },
    { value: E(q), trap: 'took the size of the rejected root' },
    { value: (n + d) % 2 === 0 ? E((n + d) / 2) : null, trap: 'used log a + log b = log(a + b)', must: true },
    { value: wrongK !== null ? E(wrongK) : null, trap: 'put k on the right instead of bᵏ' },
    { value: E(n), trap: 'stopped at the product x(x − d) = bᵏ' },
    { value: E(p + d), trap: 'added the shift again at the end' },
    { value: E(p + 1), trap: 'arithmetic slip' },
  ];
  return {
    stem: `Solve $\\log_{${b}} x + \\log_{${b}}(x - ${d}) = ${k}$.`,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, ds),
    solution: `Combine: $\\log_{${b}}\\left(x(x - ${d})\\right) = ${k}$, so $x(x - ${d}) = ${b}^{${k}} = ${n}$. Then $x = ${p}$ or $x = ${-q}$, and $x = ${-q}$ is rejected: a logarithm of a negative number does not exist.`,
    trap: 'Adding logs multiplies the arguments, and the negative root must be rejected.',
    tags: ['logarithms', 'log-laws', 'solve', 'quadratic'],
    params: { variant: 'log-product', b, k, d } satisfies Params,
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------- level 4

/** The exam writes b^(2x) as 4^x, as 2^{2x} or as (2^x)^2; with a leading coefficient L in front. */
function leadTex(rng: RNG, b: number, L = 1): string {
  const which = rng.int(0, 2);
  const sq = which === 0 ? `${b * b}^{x}` : which === 1 ? `${b}^{2x}` : `\\left(${b}^{x}\\right)^{2}`;
  if (L === 1) return sq;
  return which === 2 ? `${L}${sq}` : `${L}\\left(${sq}\\right)`;
}

interface ExpQuad { b: number; p: number; q: number; S: number; P: number }
const EXP_QUADS: ExpQuad[] = [];
for (const b of [2, 3, 4, 5]) {
  for (let p = 0; p <= 4; p++) {
    for (let q = p + 1; q <= 5; q++) {
      const S = b ** p + b ** q;
      const P = b ** (p + q);
      if (S <= 30 && P <= 100) EXP_QUADS.push({ b, p, q, S, P });
    }
  }
}

/** b^(2x) − S b^x + P = 0 with S = b^p + b^q, P = b^(p+q) */
function expQuad(rng: RNG): Generated | null {
  const { b, p, q, S, P } = rng.pick(EXP_QUADS);
  const roots = [E(p), E(q)];
  const cands: { values: Exact[]; trap: string; must?: boolean }[] = [
    { values: [E(b ** p), E(b ** q)], trap: 'solved for t = bˣ and stopped there', must: true },
    { values: [E(-p), E(-q)], trap: 'sign error when taking logs' },
    { values: [E(b ** p), E(q)], trap: 'converted one root back to x but not the other' },
    { values: [E(p + 1), E(q + 1)], trap: 'miscounted the powers of the base' },
    { values: [E(p), E(q + 1)], trap: 'miscounted one of the powers' },
    { values: [E(S), E(P)], trap: 'read the two coefficients off the equation' },
  ];
  const lead = leadTex(rng, b);
  const coef = `${S}\\left(${b}^{x}\\right)`;
  const stem = rng.bool()
    ? `Solve $${lead} - ${coef} + ${P} = 0$.`
    : `Solve $${lead} + ${P} = ${coef}$.`;
  return {
    stem,
    answer: { kind: 'set', values: roots },
    options: setOptions(rng, roots, cands),
    solution: `Put $t = ${b}^{x}$, so $t^{2} - ${S}t + ${P} = 0$ and $t = ${b ** p}$ or $t = ${b ** q}$. Then $${b}^{x} = ${b ** p}$ or $${b}^{x} = ${b ** q}$, giving $x = ${p}$ or $x = ${q}$.`,
    trap: 'The substitution t = bˣ gives t, not x: convert each value of t back into a power of the base.',
    tags: ['exponentials', 'quadratic', 'substitution', 'solve'],
    params: { variant: 'exp-quad', b, S, P, L: 1 } satisfies Params,
    typedAllowed: true,
  };
}

/** L b^(2x) − S b^x + P = 0 with L = b^r, roots t = b^p and t = b^(−r): one solution is negative. */
interface ExpQuadL { b: number; p: number; r: number; L: number; S: number; P: number }
const EXP_QUADS_L: ExpQuadL[] = [];
for (const b of [2, 3, 4, 5]) {
  for (let r = 1; r <= 2; r++) {
    for (let p = 1; p <= 4; p++) {
      const L = b ** r, S = b ** (p + r) + 1, P = b ** p;
      if (L <= 9 && S <= 30 && P <= 27) EXP_QUADS_L.push({ b, p, r, L, S, P });
    }
  }
}

function expQuadLeading(rng: RNG): Generated | null {
  const { b, p, r, L, S, P } = rng.pick(EXP_QUADS_L);
  const roots = [E(p), E(-r)];
  const small = frac(1, b ** r);
  const cands: { values: Exact[]; trap: string; must?: boolean }[] = [
    { values: [E(P), small], trap: 'solved for t = bˣ and stopped there', must: true },
    { values: [E(p), E(r)], trap: 'lost the minus sign: bˣ < 1 gives a negative x', must: true },
    { values: [E(p), small], trap: 'converted one value of t back to x but not the other' },
    { values: [E(-p), E(-r)], trap: 'changed the sign of both solutions' },
    { values: [E(S), E(P)], trap: 'read the two coefficients off the equation' },
    { values: [E(p), E(-r - 1)], trap: 'miscounted the negative power' },
    { values: [E(p + 1), E(-r)], trap: 'miscounted one of the powers' },
  ];
  return {
    stem: `Solve $${leadTex(rng, b, L)} - ${S}\\left(${b}^{x}\\right) + ${P} = 0$.`,
    answer: { kind: 'set', values: roots },
    options: setOptions(rng, roots, cands),
    solution: `Put $t = ${b}^{x}$: $${L}t^{2} - ${S}t + ${P} = 0$ factorises as $\\left(${L}t - 1\\right)\\left(t - ${P}\\right) = 0$, so $t = \\frac{1}{${L}}$ or $t = ${P}$. Then $${b}^{x} = ${b}^{-${r}}$ or $${b}^{x} = ${b}^{${p}}$, giving $x = ${-r}$ or $x = ${p}$.`,
    trap: 'A value of t below 1 is still a valid solution: bˣ = 1/bʳ gives x = −r, not x = r.',
    tags: ['exponentials', 'quadratic', 'substitution', 'solve'],
    params: { variant: 'exp-quad', b, S, P, L } satisfies Params,
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------- level 5

const lnTex = (n: number): string => `\\ln ${n}`;

/** e^(2x) = A e^x − B, answers in terms of ln */
function eQuadChoice(rng: RNG): Generated | null {
  const r1 = rng.int(2, 6);
  const r2 = rng.intExcluding(2, 9, [r1]);
  const lo = Math.min(r1, r2), hi = Math.max(r1, r2);
  const A = lo + hi, B = lo * hi;
  if (A > 12 || B > 30) return null;
  const ln = Math.log;
  const correct = `$x = ${lnTex(lo)}$ or $x = ${lnTex(hi)}$`;
  /** Every option carries the x-values it claims, so no two options can denote the same answer. */
  interface CC { display: string; trap: string; vals: number[]; must?: boolean }
  const cands: CC[] = [
    { display: `$x = ${lo}$ or $x = ${hi}$`, trap: 'gave the values of eˣ rather than x', vals: [lo, hi], must: true },
    { display: `$x = ${lnTex(A)}$ or $x = ${lnTex(B)}$`, trap: 'read the roots straight off the coefficients', vals: [ln(A), ln(B)], must: true },
    { display: `$x = -${lnTex(lo)}$ or $x = -${lnTex(hi)}$`, trap: 'sign error when taking logarithms', vals: [-ln(lo), -ln(hi)] },
    { display: `$x = ${lnTex(B)}$`, trap: 'combined the two solutions into ln(ab)', vals: [ln(B)] },
    { display: `$x = ${lnTex(hi)}$`, trap: 'rejected one root although both are valid', vals: [ln(hi)] },
    { display: `$x = ${lnTex(lo)}$`, trap: 'rejected one root although both are valid', vals: [ln(lo)] },
    { display: `$x = ${lnTex(A)} - ${lnTex(B)}$`, trap: 'took logarithms term by term, as if ln(P − Q) = ln P − ln Q', vals: [ln(A) - ln(B)] },
  ];
  const key = (vals: number[]) => vals.map((v) => v.toFixed(6)).sort().join(',');
  const seen = new Set([key([ln(lo), ln(hi)])]);
  const picked: { display: string; trap: string }[] = [];
  const take = (c: CC) => {
    const k = key(c.vals);
    if (picked.length >= 4 || seen.has(k)) return;
    seen.add(k);
    picked.push({ display: c.display, trap: c.trap });
  };
  cands.filter((c) => c.must).forEach(take);
  rng.shuffle(cands.filter((c) => !c.must)).forEach(take);
  if (picked.length < 4) return null;
  const stem = rng.bool()
    ? `Solve $e^{2x} = ${A}e^{x} - ${B}$, giving your answers in terms of natural logarithms.`
    : `Solve $e^{2x} - ${A}e^{x} + ${B} = 0$, giving your answers in terms of natural logarithms.`;
  return {
    stem,
    answer: { kind: 'choice', value: correct },
    options: buildChoiceOptions(rng, correct, picked),
    solution: `Put $t = e^{x}$: $t^{2} - ${A}t + ${B} = 0$, so $t = ${lo}$ or $t = ${hi}$. Both are positive, so $x = ${lnTex(lo)}$ or $x = ${lnTex(hi)}$.`,
    trap: 'Solve for t = eˣ first, then take logs of each value; eˣ = t gives x = ln t.',
    tags: ['exponentials', 'logarithms', 'quadratic', 'substitution'],
    params: { variant: 'e-quad-choice', A, B } satisfies Params,
    typedAllowed: false,
  };
}

interface SumPower { b: number; e1: number; s2: number; F: number }
const SUM_POWERS: SumPower[] = [];
for (const b of [2, 3, 5]) {
  for (const e1 of [1, 2]) {
    for (const s2 of [1, -1]) {
      const F = b ** e1 + s2;
      if (F >= 3 && F <= 10) SUM_POWERS.push({ b, e1, s2, F });
    }
  }
}

/** b^(x+e) ± b^x = N */
function sumPowers(rng: RNG): Generated | null {
  const { b, e1, s2, F } = rng.pick(SUM_POWERS);
  const k = rng.int(2, 6);
  const n = F * b ** k;
  if (n > 2000) return null;
  const answer = E(k);
  const ds: Cand[] = [
    { value: E(b ** k), trap: 'solved for bˣ and stopped there', must: true },
    { value: E(k + e1), trap: 'used the shifted index as the answer' },
    { value: E(F), trap: 'quoted the factor that came out of the bracket' },
    { value: E(k + 1), trap: 'miscounted the power of the base' },
    { value: E(k - 1), trap: 'miscounted the power of the base' },
    { value: E(2 * k + e1), trap: 'added the indices as if the two terms multiplied' },
  ];
  const lhs = `${b}^{x+${e1}} ${s2 > 0 ? '+' : '-'} ${b}^{x}`;
  return {
    stem: `Solve $${lhs} = ${n}$.`,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, ds),
    solution: `Factorise: $${lhs} = ${b}^{x}\\left(${b ** e1} ${s2 > 0 ? '+' : '-'} 1\\right) = ${F} \\times ${b}^{x}$, so $${b}^{x} = ${n / F} = ${b}^{${k}}$ and $x = ${k}$.`,
    trap: 'Take out the common factor bˣ; the two terms do not combine into a single power b^(2x+1).',
    tags: ['exponentials', 'indices', 'factorise', 'solve'],
    params: { variant: 'sum-powers', b, e1, s2, N: n } satisfies Params,
    typedAllowed: true,
  };
}

interface DiffSquare { b: number; k: number; a: number; x: number }
const DIFF_SQUARES: DiffSquare[] = [];
for (const b of [2, 3, 5, 10]) {
  for (let k = 2; k <= 8; k++) {
    const v = b ** k;
    if (v > 600) break;
    for (let a = 1; a <= 12; a++) {
      const x2 = v + a * a;
      const x = Math.round(Math.sqrt(x2));
      if (x * x === x2 && x <= 20 && x > a) DIFF_SQUARES.push({ b, k, a, x });
    }
  }
}

/** log_b(x + a) + log_b(x − a) = k */
function logDiffSquares(rng: RNG): Generated | null {
  const { b, k, a, x } = rng.pick(DIFF_SQUARES);
  const v = b ** k;
  const answer = E(x);
  const ds: Cand[] = [
    { value: E(-x), trap: 'kept the negative root, for which neither logarithm exists', must: true },
    { value: v % 2 === 0 ? E(v / 2) : null, trap: 'used log a + log b = log(a + b)', must: true },
    { value: E(v + a * a), trap: 'forgot to square-root: that is x², not x' },
    // only offer this one when the mistake really produces a value: v − a² must be positive
    { value: v - a * a > 0 ? E(v - a * a) : null, trap: 'subtracted a² instead of adding it' },
    { value: E(x + 1), trap: 'arithmetic slip' },
    { value: E(x - 1), trap: 'arithmetic slip' },
    { value: E(a + k), trap: 'combined the numbers in the question at random' },
  ];
  return {
    stem: `Solve $\\log_{${b}}(x + ${a}) + \\log_{${b}}(x - ${a}) = ${k}$.`,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, ds),
    solution: `Combine: $\\log_{${b}}\\left(x^{2} - ${a * a}\\right) = ${k}$, so $x^{2} - ${a * a} = ${b}^{${k}} = ${v}$ and $x^{2} = ${v + a * a}$. Only $x = ${x}$ works, since $x = ${-x}$ would need the logarithm of a negative number.`,
    trap: 'Adding logs multiplies the arguments (a difference of two squares here), and only the positive root survives.',
    tags: ['logarithms', 'log-laws', 'solve', 'difference-of-squares'],
    params: { variant: 'log-diff-squares', b, k, a } satisfies Params,
    typedAllowed: true,
  };
}

const VARIANTS: Record<Level, ((rng: RNG) => Generated | null)[]> = {
  1: [expRecip, cancelSingle, cancelSum],
  2: [logLinear, expMultiple, lnSum],
  3: [eCoefLn, lnSquare, logProduct],
  4: [expQuad, expQuad, expQuadLeading],
  5: [eQuadChoice, sumPowers, logDiffSquares],
};

export default defineTemplate({
  id: 'm2.functions.exp-log-equations',
  module: 'M2',
  topic: 'functions',
  title: 'Exponential and logarithmic equations',
  levels: {
    1: '2^x = 1/8; e^(ln 5); ln(e^3)',
    2: 'log_2(x − 1) = 3; 3^(2x) = 81; ln x = ln 7 + ln 2',
    3: 'e^(2 ln 3); ln(x²) = 2 ln 5 + ln 4; log_3 x + log_3(x − 6) = 3',
    4: 'quadratic in b^x: 4^x − 5(2^x) + 4 = 0; 2(4^x) − 5(2^x) + 2 = 0',
    5: 'e^(2x) = 7e^x − 12 (answers in ln); 2^(x+1) + 2^x = 48; log_2(x+1) + log_2(x−1) = 3',
  },
  generate(rng, level: Level) {
    return retry(rng, () => pickVariant(rng, VARIANTS[level]));
  },
  verify(q) {
    const p = q.params as unknown as Params;
    const close = (x: number, y: number) => Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= 1e-7 * Math.max(1, Math.abs(y));
    const one = q.answer.kind === 'exact' ? q.answer.value.toNumber() : NaN;
    const logb = (base: number, y: number) => Math.log(y) / Math.log(base);
    switch (p.variant) {
      case 'exp-recip':
        // substitute x back into b^x = 1/b^k
        return q.answer.kind === 'exact' && close(Math.pow(p.b!, one), 1 / Math.pow(p.b!, p.k!));
      case 'e-ln':
        return q.answer.kind === 'exact' && close(one, Math.exp(Math.log(p.a!)));
      case 'ln-e':
        return q.answer.kind === 'exact' && close(one, Math.log(Math.exp(p.k!)));
      case 'cancel-sum':
        return q.answer.kind === 'exact' && close(one, Math.exp(Math.log(p.a!)) + Math.log(Math.exp(p.c!)));
      case 'log-linear':
        return q.answer.kind === 'exact' && one + p.shift! > 0 && close(logb(p.b!, one + p.shift!), p.k!);
      case 'exp-multiple':
        return q.answer.kind === 'exact' && close(Math.pow(p.b!, p.m! * one), Math.pow(p.b!, p.k!));
      case 'ln-sum': {
        if (q.answer.kind !== 'exact' || one <= 0) return false;
        const rhs = p.op === 'plus' ? Math.log(p.a!) + Math.log(p.c!) : Math.log(p.a!) - Math.log(p.c!);
        return close(Math.log(one), rhs);
      }
      case 'e-coef-ln':
        return q.answer.kind === 'exact' && close(one, Math.exp((p.kn! / p.kd!) * Math.log(p.a!)));
      case 'ln-square':
        return q.answer.kind === 'exact' && one > 0 && close(Math.log(one * one), 2 * Math.log(p.a!) + Math.log(p.b!));
      case 'log-product': {
        if (q.answer.kind !== 'exact' || one <= 0 || one - p.d! <= 0) return false;
        return close(logb(p.b!, one) + logb(p.b!, one - p.d!), p.k!);
      }
      case 'exp-quad': {
        // substitute each root into L b^(2x) − S b^x + P = 0
        if (q.answer.kind !== 'set' || q.answer.values.length !== 2) return false;
        if (q.answer.values[0].equals(q.answer.values[1])) return false;
        const L = p.L ?? 1;
        return q.answer.values.every((r) => {
          const t = Math.pow(p.b!, r.toNumber());
          return Math.abs(L * t * t - p.S! * t + p.P!) < 1e-6;
        });
      }
      case 'e-quad-choice': {
        // solve t² − At + B = 0 with the quadratic formula, then rebuild the expected answer text
        if (q.answer.kind !== 'choice') return false;
        const disc = p.A! * p.A! - 4 * p.B!;
        if (disc <= 0) return false;
        const t1 = (p.A! - Math.sqrt(disc)) / 2, t2 = (p.A! + Math.sqrt(disc)) / 2;
        if (t1 <= 0 || t2 <= 0) return false;
        const r1 = Math.round(t1), r2 = Math.round(t2);
        if (!close(t1, r1) || !close(t2, r2)) return false;
        // the claimed x-values must satisfy the original equation
        for (const x of [Math.log(r1), Math.log(r2)]) {
          if (Math.abs(Math.exp(2 * x) - (p.A! * Math.exp(x) - p.B!)) > 1e-7) return false;
        }
        // and no two options may denote the same value, however they are written
        const numeric = (s: string): number[] | null => {
          const parts = s.split(' or ').map((t) => t.trim());
          const out: number[] = [];
          for (const part of parts) {
            const m = /^\$x = (-?)(?:\\ln (\d+)(?: - \\ln (\d+))?|(\d+))\$$/.exec(part);
            if (!m) return null;
            const sign = m[1] === '-' ? -1 : 1;
            const val = m[4] !== undefined ? Number(m[4])
              : m[3] !== undefined ? Math.log(Number(m[2])) - Math.log(Number(m[3]))
                : Math.log(Number(m[2]));
            out.push(sign * val);
          }
          return out;
        };
        const keys = new Set<string>();
        for (const o of q.options) {
          const vals = numeric(o.display);
          if (!vals) return false;
          const k = vals.map((v) => v.toFixed(6)).sort().join(',');
          if (keys.has(k)) return false;
          keys.add(k);
        }
        return q.answer.value === `$x = ${lnTex(r1)}$ or $x = ${lnTex(r2)}$`;
      }
      case 'sum-powers':
        return q.answer.kind === 'exact'
          && close(Math.pow(p.b!, one + p.e1!) + p.s2! * Math.pow(p.b!, one), p.N!);
      case 'log-diff-squares': {
        if (q.answer.kind !== 'exact' || one - p.a! <= 0) return false;
        return close(logb(p.b!, one + p.a!) + logb(p.b!, one - p.a!), p.k!);
      }
      default:
        return false;
    }
  },
});
