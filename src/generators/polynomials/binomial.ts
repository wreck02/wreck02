import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, Exact } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { nCr, factorial, signed, gcd } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Binomial coefficients.
 * Level 1: coefficient of x^r in (1 + x)^n (5C2 = 10); number of terms
 * Level 2: coefficient of x^r in (1 + ax)^n — the a must be raised too (80 in (1 + 2x)^5)
 * Level 3: coefficient in (b + ax)^n — both parts carry a power: 240 in (2 − x)^6
 * Level 4: constant term of (ax^p + b/x^q)^n — the right r must be found first
 * Level 5: find a from a given coefficient; the sum of the coefficients (put x = 1); find n from nC2
 */

type Candidate = { value: Exact | null; trap: string };

function cleanOnly(ds: Candidate[]): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } => d.value !== null && Number.isFinite(d.value.toNumber()) && isCleanExact(d.value).ok);
}

/** Every distinct `must` candidate (the spec-named traps) goes in before any `extra` one. */
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

function options(rng: RNG, answer: Exact, must: Candidate[], extra: Candidate[]) {
  return buildOptions(rng, answer, ranked(rng, answer, cleanOnly(must), cleanOnly(extra)));
}

/** Pick a sub-variant first, then retry its parameters, so rejection rates do not skew the mix. */
function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

/** "(1 + 2x)^{5}", "(2 - x)^{6}" — constant first, or "(2x - 1)^{5}" with x first. */
function binTex(b: number, a: number, n: number, xFirst = false): string {
  // A negative constant goes last, as the exam prints it: (2x − 1)^5 rather than (−1 + 2x)^5.
  const inner = xFirst || b < 0 ? `${signed(a, 'x', true)}${signed(b, '')}` : `${b}${signed(a, 'x')}`;
  return `(${inner})^{${n}}`;
}

const xPow = (r: number): string => (r === 1 ? 'x' : `x^{${r}}`);

const coefTex = (k: number): string => (k === 1 ? '' : k === -1 ? '-' : `${k}`);

/** "\left(2x + \frac{1}{x}\right)^{6}", "\left(x^{2} - \frac{2}{x}\right)^{6}" */
function laurentTex(a: number, p: number, b: number, q: number, n: number): string {
  const xp = p === 1 ? 'x' : `x^{${p}}`;
  const xq = q === 1 ? 'x' : `x^{${q}}`;
  return `\\left(${coefTex(a)}${xp} ${b < 0 ? '-' : '+'} \\frac{${Math.abs(b)}}{${xq}}\\right)^{${n}}`;
}

/** Coefficients of (b + ax)^n, index = power of x, by repeated multiplication (used by verify). */
function expandBinomial(b: number, a: number, n: number): number[] {
  let coefs = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array<number>(coefs.length + 1).fill(0);
    coefs.forEach((c, k) => {
      next[k] += c * b;
      next[k + 1] += c * a;
    });
    coefs = next;
  }
  return coefs;
}

/** Constant term of (a x^p + b x^-q)^n by convolving exponents (offset so they stay non-negative). */
function laurentConstant(a: number, p: number, b: number, q: number, n: number): number {
  const offset = q * n;
  let coefs = new Array<number>(offset + p * n + 1).fill(0);
  coefs[offset] = 1;
  for (let i = 0; i < n; i++) {
    const next = new Array<number>(coefs.length).fill(0);
    coefs.forEach((c, e) => {
      if (c === 0) return;
      if (e + p < next.length) next[e + p] += c * a;
      if (e - q >= 0) next[e - q] += c * b;
    });
    coefs = next;
  }
  return coefs[offset];
}


// ----------------------------------------------------------------------------- levels 1–3: a named coefficient

function coefQ(level: Level) {
  return (rng: RNG): Generated | null => {
    let a: number, b: number, n: number, r: number;
    if (level === 1) {
      a = 1; b = 1; n = rng.int(4, 8);
      r = rng.pick([2, 3, 4].filter((v) => v <= n - 2));
    } else if (level === 2) {
      b = 1; a = rng.pick([2, 3, -2, -1, -3, 2]); n = rng.int(4, 6);
      r = rng.pick([2, 3].filter((v) => v <= n - 1));
    } else {
      b = rng.pick([2, 3, -1, -2, 2]); a = rng.pick([1, 2, 3, -1, -2]); n = rng.int(4, 6);
      r = rng.int(1, 3);
      if (b < 0 && a < 0) return null; // (−2x − 2)^5 is not something the exam prints
      if (gcd(a, b) !== 1) return null; // (2 + 2x)^4 would be written 16(1 + x)^4
    }
    const c = nCr(n, r);
    const value = c * b ** (n - r) * a ** r;
    if (Math.abs(value) > (level === 3 ? 2000 : 5000) || value === 0) return null;
    const answer = E(value);
    const must: Candidate[] = level === 1
      ? [
        { value: E(nCr(n, rng.bool() ? r - 1 : r + 1)), trap: 'binomial coefficient index off by one' },
        { value: E(n * r), trap: 'multiplied n by r instead of using nCr' },
      ]
      : level === 2
        ? [
          { value: E(c * a), trap: `forgot to raise the ${a} to the power ${r}: the term is nCr × (${a}x)^${r}` },
          { value: E(c), trap: `ignored the ${a} inside the bracket` },
        ]
        : [
          { value: E(c * b ** r * a ** (n - r)), trap: 'powers of the two terms swapped: (b)^(n−r) goes with (ax)^r' },
          { value: E(c * a ** r), trap: `forgot the power of ${b} on the other term` },
        ];
    const extra: Candidate[] = [
      { value: E(-value), trap: 'sign error: an odd power of a negative term is negative' },
      { value: E(b ** (n - r) * a ** r), trap: 'forgot the binomial coefficient nCr' },
      { value: E(nCr(n, r - 1) * b ** (n - r + 1) * a ** (r - 1)), trap: 'used the coefficient of the term before' },
      { value: E(nCr(n, r + 1) * b ** (n - r - 1) * a ** (r + 1)), trap: 'used the coefficient of the term after' },
      { value: E(nCr(n - 1, r) * b ** (n - 1 - r) * a ** r), trap: 'off by one in n' },
      { value: E(c * b ** (n - r) * a), trap: 'coefficient of x not raised to the power' },
      { value: E(c * b * a ** r), trap: 'other term not raised to its power' },
      { value: level === 1 ? E(factorial(n) / factorial(n - r)) : null, trap: 'used nPr instead of nCr' },
      { value: level === 1 ? E(2 ** n) : null, trap: 'gave the sum of all the coefficients' },
    ];
    const br = (v: number) => (v < 0 ? `(${v})` : `${v}`);
    const parts = [`\\binom{${n}}{${r}}`];
    const nums = [`${c}`];
    if (b !== 1) { parts.push(`${br(b)}^{${n - r}}`); nums.push(br(b ** (n - r))); }
    if (a !== 1) { parts.push(`${br(a)}^{${r}}`); nums.push(br(a ** r)); }
    const working = level === 1 ? `\\binom{${n}}{${r}} = ${c}` : `${parts.join(' \\times ')} = ${nums.join(' \\times ')} = ${value}`;
    return {
      stem: `Find the coefficient of $${xPow(r)}$ in the expansion of $${binTex(b, a, n)}$.`,
      answer: { kind: 'exact', value: answer },
      options: options(rng, answer, must, extra),
      solution: `The $${xPow(r)}$ term is $\\binom{${n}}{${r}}${b === 1 ? '' : `(${b})^{${n - r}}`}${a === 1 ? xPow(r) : `(${coefTex(a)}x)^{${r}}`}$, so the coefficient is $${working}$.`,
      trap: level === 1
        ? 'The coefficient of x^r in (1 + x)^n is nCr: use Pascal\'s triangle or n(n−1)…/r!, not n × r.'
        : level === 2
          ? 'The whole bracket term (ax) is raised to the power r, so the coefficient is nCr × a^r, not nCr × a.'
          : 'Both parts carry a power: nCr × b^(n−r) × a^r, with the sign following from the odd or even power.',
      tags: ['binomial', 'coefficient'],
      params: { variant: 'coef', a, b, n, r },
      typedAllowed: true,
    };
  };
}

function termsQ(rng: RNG): Generated | null {
  const n = rng.int(4, 10);
  const a = rng.pick([1, 1, 2, -1, 3]);
  const answer = E(n + 1);
  return {
    stem: `How many terms are there in the expansion of $${binTex(1, a, n)}$?`,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, [
      { value: E(n), trap: 'forgot the constant term: powers run from 0 to n, giving n + 1 terms' },
    ], [
      { value: E(n - 1), trap: 'off by one the other way' },
      { value: E(2 * n), trap: 'doubled n' },
      { value: E(n + 2), trap: 'off by one' },
      { value: E(2 ** n), trap: 'gave the sum of the coefficients of (1 + x)^n' },
    ]),
    solution: `The powers of $x$ run from $0$ to $${n}$, so there are $${n + 1}$ terms.`,
    trap: 'Count the powers 0, 1, …, n: that is n + 1 terms, not n.',
    tags: ['binomial', 'terms'],
    params: { variant: 'terms', a, n },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 4: constant term

function constQ(rng: RNG): Generated | null {
  const [p, q] = rng.pick([[1, 1], [1, 1], [2, 1], [1, 2]]);
  const n = p === q ? rng.pick([4, 6]) : rng.pick([3, 6]);
  const r = (p * n) / (p + q); // x^{p(n−r)} · x^{−qr} is constant when p(n − r) = qr
  const a = rng.pick([1, 1, 2, -1]);
  const b = rng.pick([1, 2, 3, -1, -2, 1]);
  if (a === -1 && b === -1) return null;
  const c = nCr(n, r);
  const value = c * a ** (n - r) * b ** r;
  if (Math.abs(value) > 5000 || value === 0) return null;
  const answer = E(value);
  const mid = n % 2 === 0 ? n / 2 : null;
  const term = (k: number) => (k < 0 || k > n ? null : E(nCr(n, k) * a ** (n - k) * b ** k));
  const must: Candidate[] = [
    { value: p !== q && mid !== null ? term(mid) : null, trap: 'took the middle term without checking that its power of x is zero' },
    { value: E(c * a ** (n - r)), trap: `forgot to raise the ${b} in the second term to the power ${r}` },
    { value: E(c * b ** r), trap: `forgot the power of ${a} on the first term` },
  ];
  const extra: Candidate[] = [
    { value: E(c * a ** r * b ** (n - r)), trap: 'powers of the two terms swapped' },
    { value: term(r - 1), trap: 'used the term before the constant one (r off by one)' },
    { value: term(r + 1), trap: 'used the term after the constant one (r off by one)' },
    { value: E(-value), trap: 'sign error with the negative term' },
    { value: E(c), trap: 'gave the binomial coefficient alone' },
    { value: E(a ** (n - r) * b ** r), trap: 'forgot the binomial coefficient' },
  ];
  const ask = rng.bool(0.5) ? 'the term independent of $x$' : 'the constant term';
  const xp = p === 1 ? 'x' : `x^{${p}}`;
  const general = `\\binom{${n}}{r}(${coefTex(a)}${xp})^{${n} - r}\\left(${b < 0 ? '-' : ''}\\frac{${Math.abs(b)}}{x${q === 1 ? '' : `^{${q}}`}}\\right)^{r}`;
  return {
    stem: `Find ${ask} in the expansion of $${laurentTex(a, p, b, q, n)}$.`,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, must, extra),
    solution: `The general term is $${general}$, with power of $x$ equal to $${p}(${n} - r) - ${q}r$; this is zero when $r = ${r}$. The term is $\\binom{${n}}{${r}} \\times ${a ** (n - r)} \\times ${b ** r} = ${value}$.`,
    trap: 'Find r from the power of x first (p(n − r) = qr); the constant term is not automatically the middle one.',
    tags: ['binomial', 'constant-term'],
    params: { variant: 'const', a, p, b, q, n, r },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 5

function findAQ(rng: RNG): Generated | null {
  const n = rng.int(3, 5);
  const r = rng.pick([2, 3].filter((v) => v < n));
  const a = rng.pick(r === 2 ? [2, 3, 4, 5] : [2, 3]);
  const c = nCr(n, r);
  const K = c * a ** r;
  if (K > 2000) return null;
  const answer = E(a);
  return {
    stem: `In the expansion of $(1 + ax)^{${n}}$, where $a > 0$, the coefficient of $x^{${r}}$ is $${K}$. Find the value of $a$.`,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, [
      { value: E(a ** r), trap: `found a^${r} = ${a ** r} and forgot to take the ${r === 2 ? 'square' : 'cube'} root` },
      { value: E(-a), trap: 'the negative root is ruled out by a > 0' },
    ], [
      { value: E(K / (c * r)), trap: 'divided by r instead of taking the rth root' },
      { value: E(a + 1), trap: 'arithmetic slip' },
      { value: E(a - 1), trap: 'arithmetic slip' },
      { value: E(2 * a), trap: 'doubled the answer' },
      { value: E(K / n / r), trap: 'used n × r instead of nCr' },
    ]),
    solution: `The $x^{${r}}$ coefficient is $\\binom{${n}}{${r}}a^{${r}} = ${c}a^{${r}}$. So $a^{${r}} = ${a ** r}$ and, since $a > 0$, $a = ${a}$.`,
    trap: 'Divide the given coefficient by nCr first, then take the rth root (choosing the sign the question allows).',
    tags: ['binomial', 'coefficient', 'inverse'],
    params: { variant: 'find-a', n, r, K },
    typedAllowed: true,
  };
}

function sumQ(rng: RNG): Generated | null {
  const b = rng.pick([1, 1, 2, -1, 3]);
  const a = rng.pick([1, 2, 3, -1, -2]);
  const s = a + b;
  if (Math.abs(s) > 3 || s === 0 || (a === 1 && b === 1)) return null;
  const n = rng.int(3, 6);
  const value = s ** n;
  const answer = E(value);
  const xFirst = rng.bool(0.4);
  const bin = binTex(b, a, n, xFirst);
  return {
    stem: `Find the sum of the coefficients in the expansion of $${bin}$.`,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, [
      { value: E(2 ** n), trap: 'used 2^n, the sum for (1 + x)^n, ignoring the actual coefficients' },
      { value: E(a ** n + b ** n), trap: 'added the nth powers of the two coefficients instead of the nth power of their sum' },
    ], [
      { value: E(-value), trap: 'sign error' },
      { value: E((a - b) ** n), trap: 'put x = −1 instead of x = 1' },
      { value: E(n * s), trap: 'multiplied instead of raising to the power n' },
      { value: E(s ** (n - 1)), trap: 'power off by one' },
      { value: E((a * b) ** n), trap: 'multiplied the coefficients instead of adding' },
    ]),
    solution: `Put $x = 1$: the sum of the coefficients is $(${b} ${a >= 0 ? '+' : '-'} ${Math.abs(a)})^{${n}} = ${s < 0 ? `(${s})` : s}^{${n}} = ${value}$.`,
    trap: 'Substituting x = 1 adds every coefficient at once; there is no need to expand.',
    tags: ['binomial', 'sum-of-coefficients'],
    params: { variant: 'sum', a, b, n },
    typedAllowed: true,
  };
}

function findNQ(rng: RNG): Generated | null {
  const n = rng.int(5, 12);
  const K = nCr(n, 2);
  const answer = E(n);
  return {
    stem: `The coefficient of $x^{2}$ in the expansion of $(1 + x)^{n}$ is $${K}$. Find the value of $n$.`,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, [
      { value: E(n - 1), trap: 'solved n(n + 1)/2 = K instead of n(n − 1)/2 = K' },
      { value: E(n + 1), trap: 'off by one' },
    ], [
      { value: E(2 * n), trap: 'forgot the ½ in nC2 = n(n − 1)/2' },
      { value: E(n - 2), trap: 'off by two' },
      { value: E(n + 2), trap: 'off by two' },
    ]),
    solution: `$\\binom{n}{2} = \\frac{n(n-1)}{2} = ${K}$, so $n(n - 1) = ${2 * K} = ${n} \\times ${n - 1}$ and $n = ${n}$.`,
    trap: 'nC2 = n(n − 1)/2: double the coefficient and look for two consecutive integers with that product.',
    tags: ['binomial', 'coefficient', 'inverse'],
    params: { variant: 'find-n', K },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'm2.polynomials.binomial',
  module: 'M2',
  topic: 'polynomials',
  title: 'Binomial coefficients',
  levels: {
    1: 'coefficient of x^r in (1 + x)^n; number of terms',
    2: 'coefficient of x^r in (1 + ax)^n, e.g. 80 in (1 + 2x)^5',
    3: 'coefficient in (b + ax)^n, e.g. 240 in (2 − x)^6',
    4: 'constant term of (ax^p + b/x^q)^n, e.g. 6 in (x + 1/x)^4',
    5: 'find a from a coefficient; sum of the coefficients (x = 1); find n from nC2',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return pickVariant(rng, [coefQ(1), coefQ(1), coefQ(1), termsQ]);
        case 2: return coefQ(2)(rng);
        case 3: return coefQ(3)(rng);
        case 4: return constQ(rng);
        default: return pickVariant(rng, [findAQ, sumQ, sumQ, findNQ]);
      }
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const p = q.params as Record<string, number> & { variant: string };
    const got = q.answer.value;
    if (!got.isInteger()) return false;
    const g = got.toInt();
    switch (p.variant) {
      case 'coef':
        return expandBinomial(p.b, p.a, p.n)[p.r] === g;
      case 'terms':
        return expandBinomial(1, p.a, p.n).length === g;
      case 'const':
        return laurentConstant(p.a, p.p, p.b, p.q, p.n) === g;
      case 'find-a':
        return g > 0 && expandBinomial(1, g, p.n)[p.r] === p.K;
      case 'sum':
        return expandBinomial(p.b, p.a, p.n).reduce((s, c) => s + c, 0) === g;
      case 'find-n':
        return g >= 2 && expandBinomial(1, 1, g)[2] === p.K;
      default:
        return false;
    }
  },
});
