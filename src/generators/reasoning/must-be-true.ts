import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { statementOptions, STATEMENT_COMBOS, buildChoiceOptions } from '../../core/options';
import { isPrime, factorial, gcd } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * "Which of these statements must be true?" — proof-style reasoning.
 * Level 1: parity and multiples (n odd ⇒ n² odd, n³ − n divisible by 6, …)
 * Level 2: primes, inequalities and a geometry claim
 * Level 3: identify the contrapositive, converse or inverse of a given implication (choice)
 * Level 4: statements about a parameter k, where a counterexample decides them
 * Level 5: mixed statements with explicit quantifiers ("for all", "there exists")
 */

// ----------------------------------------------------------------------------- brute-force domains

function range(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
}

const INTS = range(-30, 30);
const POS = range(1, 60);
const PRIMES = POS.filter(isPrime);
/** A grid of real numbers, fine enough to expose the usual counterexamples. */
const REALS = range(-40, 40).map((i) => i / 8).filter((x) => x !== 0);

type Quad = [number, number][];

/** A family of quadrilaterals: square, rectangles, rhombus, parallelogram, isosceles trapezium, kite, general. */
const QUADS: Quad[] = [
  [[0, 0], [2, 0], [2, 2], [0, 2]],
  [[0, 0], [4, 0], [4, 2], [0, 2]],
  [[0, 0], [6, 0], [6, 3], [0, 3]],
  [[0, 0], [4, 3], [1, 7], [-3, 4]],
  [[0, 0], [5, 0], [8, 4], [3, 4]],
  [[0, 0], [4, 0], [5, 2], [1, 2]],
  [[0, 0], [4, 0], [3, 2], [1, 2]],
  [[0, 0], [2, 1], [0, 4], [-2, 1]],
  [[0, 0], [5, 0], [4, 3], [1, 1]],
  [[0, 0], [3, 0], [3, 4], [0, 4]],
];

const d2 = (p: number[], q: number[]): number => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
const near = (x: number, y: number): boolean => Math.abs(x - y) < 1e-9;

function equalDiagonals(q: Quad): boolean {
  return near(d2(q[0], q[2]), d2(q[1], q[3]));
}

function perpendicularDiagonals(q: Quad): boolean {
  const u = [q[2][0] - q[0][0], q[2][1] - q[0][1]];
  const v = [q[3][0] - q[1][0], q[3][1] - q[1][1]];
  return near(u[0] * v[0] + u[1] * v[1], 0);
}

function isRectangle(q: Quad): boolean {
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    if (!near((b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]), 0)) return false;
  }
  return true;
}

function isRhombus(q: Quad): boolean {
  const s = d2(q[0], q[1]);
  return [1, 2, 3].every((i) => near(d2(q[i], q[(i + 1) % 4]), s));
}

// ----------------------------------------------------------------------------- the statement pool

interface Claim {
  id: string;
  /** The statement as MathText; m is the statement's parameter (0 when it has none). */
  text: (m: number) => string;
  /** The declared mathematical fact — verify() re-derives it by brute force instead. */
  truth: (m: number) => boolean;
  /** One line of justification or the counterexample, for the worked solution. */
  why: (m: number) => string;
  /** Parameter values this claim may be used with. */
  ms?: number[];
  /** Claims that must not appear alongside this one (negations, or one implying the other). */
  excludes?: string[];
}

/** The two-digit parameter code m·10 + d used by the "mk is a multiple of d" family. */
const pairOf = (code: number): [number, number] => [Math.floor(code / 10), code % 10];

/** Brute-force checkers, keyed by claim id: the independent route used only by verify(). */
const CHECKS: Record<string, (m: number) => boolean> = {
  'odd-sq-odd': () => INTS.every((n) => (Math.abs(n % 2) === 1 ? Math.abs((n * n) % 2) === 1 : true)),
  'sq-even-even': () => INTS.every((n) => ((n * n) % 2 === 0 ? n % 2 === 0 : true)),
  'sq-odd-even': () => INTS.every((n) => (Math.abs((n * n) % 2) === 1 ? n % 2 === 0 : true)),
  'sq-odd-odd': () => INTS.every((n) => (Math.abs((n * n) % 2) === 1 ? Math.abs(n % 2) === 1 : true)),
  'consec-odd-4': () => INTS.every((k) => (2 * k + 1 + (2 * k + 3)) % 4 === 0),
  'consec-odd-8': () => INTS.every((k) => (2 * k + 1 + (2 * k + 3)) % 8 === 0),
  'n3-n-6': () => INTS.every((n) => (n * n * n - n) % 6 === 0),
  'n2-n-6': () => INTS.every((n) => (n * n - n) % 6 === 0),
  'two-odds-even': () => INTS.every((a) => INTS.every((b) => (Math.abs(a % 2) === 1 && Math.abs(b % 2) === 1 ? (a + b) % 2 === 0 : true))),
  'prod-consec-even': () => INTS.every((n) => (n * (n + 1)) % 2 === 0),
  'mult4-even': () => INTS.every((n) => (n % 4 === 0 ? n % 2 === 0 : true)),
  'even-mult4': () => INTS.every((n) => (n % 2 === 0 ? n % 4 === 0 : true)),
  'three-consec-3': () => INTS.every((n) => (n + (n + 1) + (n + 2)) % 3 === 0),
  'four-consec-4': () => INTS.every((n) => (n + (n + 1) + (n + 2) + (n + 3)) % 4 === 0),
  'two-pow-prime': () => range(1, 10).every((n) => isPrime(2 ** n + 1)),
  'prime-odd': () => PRIMES.every((p) => p % 2 === 1),
  'prime-sum-even': () => PRIMES.every((p) => PRIMES.every((q) => (p + q) % 2 === 0)),
  'prime-plus-2': () => PRIMES.every((p) => isPrime(p + 2)),
  'prime-sq-odd': () => PRIMES.filter((p) => p > 2).every((p) => (p * p) % 2 === 1),
  'x2-lt-x': () => REALS.filter((x) => x > 0 && x < 1).every((x) => x * x < x),
  'x2-gt-x': () => REALS.filter((x) => x > 1).every((x) => x * x > x),
  'inv-ineq': () => REALS.every((x) => REALS.every((y) => (x < y ? 1 / x > 1 / y : true))),
  'sq-order': () => REALS.every((x) => REALS.every((y) => (x * x > y * y ? x > y : true))),
  'order-sq': () => REALS.every((x) => REALS.every((y) => (x > y ? x * x > y * y : true))),
  'k2k-m-even': (m) => INTS.every((k) => (k * k + k + m) % 2 === 0),
  'mk1-odd': (m) => INTS.every((k) => Math.abs((m * k + 1) % 2) === 1),
  'k2-mult-m': (m) => POS.every((k) => ((k * k) % m === 0 ? k % m === 0 : true)),
  'm-div-k3-k': (m) => INTS.every((k) => (k * k * k - k) % m === 0),
  'mk-mult-d': (code) => {
    const [m, d] = pairOf(code);
    return POS.every((k) => ((m * k) % d === 0 ? k % d === 0 : true));
  },
  'exists-n2-2n': () => INTS.some((n) => n * n === 2 * n),
  'all-n2-ge-n': () => INTS.every((n) => n * n >= n),
  'exists-consec-primes': () => PRIMES.some((p) => isPrime(p + 1)),
  'all-p2-1-mult8': () => PRIMES.filter((p) => p > 2).every((p) => (p * p - 1) % 8 === 0),
  'exists-3n-2': () => INTS.some((n) => 3 * n === 2),
  'all-fact-prime': () => range(1, 8).every((n) => isPrime(factorial(n) + 1)),
  'all-n2-n-even': () => INTS.every((n) => (n * n + n) % 2 === 0),
  'exists-int-x2-lt-x': () => INTS.some((n) => n * n < n),
  'exists-real-x2-lt-x': () => REALS.some((x) => x * x < x),
  'all-x2-1-gt-x': () => REALS.every((x) => x * x + 1 > x),
  'equal-diag-rect': () => QUADS.every((q) => (equalDiagonals(q) ? isRectangle(q) : true)),
  'rect-equal-diag': () => QUADS.every((q) => (isRectangle(q) ? equalDiagonals(q) : true)),
  'perp-diag-rhombus': () => QUADS.every((q) => (perpendicularDiagonals(q) ? isRhombus(q) : true)),
  'rhombus-perp-diag': () => QUADS.every((q) => (isRhombus(q) ? perpendicularDiagonals(q) : true)),
};

const T = () => true;
const Fa = () => false;

const POOL_1: Claim[] = [
  { id: 'odd-sq-odd', text: () => 'For every integer $n$, if $n$ is odd then $n^2$ is odd.', truth: T, why: () => '$(2m+1)^2 = 4m^2 + 4m + 1$ is odd', excludes: ['sq-even-even'] },
  { id: 'sq-even-even', text: () => 'For every integer $n$, if $n^2$ is even then $n$ is even.', truth: T, why: () => 'an odd $n$ would give an odd $n^2$', excludes: ['odd-sq-odd'] },
  { id: 'sq-odd-even', text: () => 'For every integer $n$, if $n^2$ is odd then $n$ is even.', truth: Fa, why: () => '$n = 3$ gives $n^2 = 9$, which is odd while $n$ is odd', excludes: ['sq-odd-odd'] },
  { id: 'sq-odd-odd', text: () => 'For every integer $n$, if $n^2$ is odd then $n$ is odd.', truth: T, why: () => 'an even $n$ would give an even $n^2$', excludes: ['sq-odd-even'] },
  { id: 'consec-odd-4', text: () => 'The sum of any two consecutive odd numbers is a multiple of $4$.', truth: T, why: () => '$(2m+1) + (2m+3) = 4(m+1)$', excludes: ['consec-odd-8'] },
  { id: 'consec-odd-8', text: () => 'The sum of any two consecutive odd numbers is a multiple of $8$.', truth: Fa, why: () => '$1 + 3 = 4$', excludes: ['consec-odd-4'] },
  { id: 'n3-n-6', text: () => 'For every integer $n$, $n^3 - n$ is divisible by $6$.', truth: T, why: () => '$n^3 - n = (n-1)n(n+1)$, three consecutive integers' },
  { id: 'n2-n-6', text: () => 'For every integer $n$, $n^2 - n$ is divisible by $6$.', truth: Fa, why: () => '$n = 2$ gives $n^2 - n = 2$' },
  { id: 'two-odds-even', text: () => 'The sum of any two odd numbers is even.', truth: T, why: () => '$(2a+1) + (2b+1) = 2(a+b+1)$' },
  { id: 'prod-consec-even', text: () => 'The product of any two consecutive integers is even.', truth: T, why: () => 'one of any two consecutive integers is even' },
  { id: 'mult4-even', text: () => 'Every multiple of $4$ is even.', truth: T, why: () => '$4k = 2(2k)$' },
  { id: 'even-mult4', text: () => 'Every even number is a multiple of $4$.', truth: Fa, why: () => '$6$ is even but not a multiple of $4$' },
  { id: 'three-consec-3', text: () => 'The sum of any three consecutive integers is a multiple of $3$.', truth: T, why: () => '$n + (n+1) + (n+2) = 3(n+1)$' },
  { id: 'four-consec-4', text: () => 'The sum of any four consecutive integers is a multiple of $4$.', truth: Fa, why: () => '$1 + 2 + 3 + 4 = 10$' },
];

const POOL_2: Claim[] = [
  { id: 'two-pow-prime', text: () => 'For every positive integer $n$, $2^n + 1$ is prime.', truth: Fa, why: () => '$2^3 + 1 = 9 = 3 \\times 3$' },
  { id: 'prime-odd', text: () => 'Every prime number is odd.', truth: Fa, why: () => '$2$ is prime and even' },
  { id: 'prime-sum-even', text: () => 'If $p$ and $q$ are prime numbers then $p + q$ is even.', truth: Fa, why: () => '$2 + 3 = 5$' },
  { id: 'prime-plus-2', text: () => 'If $p$ is prime then $p + 2$ is prime.', truth: Fa, why: () => '$7 + 2 = 9$' },
  { id: 'prime-sq-odd', text: () => 'If $p$ is a prime number greater than $2$ then $p^2$ is odd.', truth: T, why: () => 'every prime above $2$ is odd, and odd squared is odd' },
  { id: 'x2-lt-x', text: () => 'If $0 < x < 1$ then $x^2 < x$.', truth: T, why: () => 'multiplying $x < 1$ by the positive number $x$ gives $x^2 < x$' },
  { id: 'x2-gt-x', text: () => 'If $x > 1$ then $x^2 > x$.', truth: T, why: () => 'multiplying $x > 1$ by the positive number $x$ gives $x^2 > x$' },
  {
    id: 'inv-ineq', text: () => 'For non-zero $x$ and $y$, if $x < y$ then $\\frac{1}{x} > \\frac{1}{y}$.', truth: Fa,
    why: () => 'with $x = -1$ and $y = 1$, $\\frac{1}{x} = -1$ and $\\frac{1}{y} = 1$, so $\\frac{1}{x} < \\frac{1}{y}$',
  },
  { id: 'sq-order', text: () => 'For real $x$ and $y$, if $x^2 > y^2$ then $x > y$.', truth: Fa, why: () => '$x = -3$ and $y = 1$ give $x^2 = 9 > 1 = y^2$, but $x < y$' },
  { id: 'order-sq', text: () => 'For real $x$ and $y$, if $x > y$ then $x^2 > y^2$.', truth: Fa, why: () => '$x = 1$ and $y = -3$ give $x > y$, but $x^2 = 1 < 9 = y^2$' },
  { id: 'equal-diag-rect', text: () => 'A quadrilateral whose diagonals are equal in length must be a rectangle.', truth: Fa, why: () => 'an isosceles trapezium also has equal diagonals' },
  { id: 'rect-equal-diag', text: () => 'The diagonals of a rectangle are equal in length.', truth: T, why: () => 'each diagonal is the hypotenuse of a congruent right-angled triangle' },
];

/** Counterexamples for "k² a multiple of m ⇒ k a multiple of m" when m has a repeated prime factor. */
const SQ_MULT_COUNTER: Record<number, number> = { 4: 2, 9: 3, 12: 6 };

const POOL_4: Claim[] = [
  {
    id: 'k2k-m-even', ms: [1, 2, 3, 4, 5, 6, 7, 8],
    text: (m) => `For every integer $k$, $k^2 + k + ${m}$ is even.`,
    truth: (m) => m % 2 === 0,
    why: (m) => (m % 2 === 0 ? `$k^2 + k = k(k+1)$ is always even, and $${m}$ is even` : `$k^2 + k$ is always even, so adding the odd $${m}$ makes it odd`),
  },
  {
    id: 'mk1-odd', ms: [2, 3, 4, 5, 6, 7],
    text: (m) => `For every integer $k$, $${m}k + 1$ is odd.`,
    truth: (m) => m % 2 === 0,
    why: (m) => (m % 2 === 0 ? `$${m}k$ is always even` : `$k = 1$ gives $${m + 1}$, which is even`),
  },
  {
    id: 'k2-mult-m', ms: [2, 3, 4, 5, 6, 9, 12],
    text: (m) => `For every positive integer $k$, if $k^2$ is a multiple of $${m}$ then $k$ is a multiple of $${m}$.`,
    truth: (m) => [2, 3, 5, 6].includes(m),
    why: (m) => ([2, 3, 5, 6].includes(m)
      ? `$${m}$ is a product of distinct primes, so each of them must divide $k$`
      : `$k = ${SQ_MULT_COUNTER[m]}$ gives $k^2 = ${SQ_MULT_COUNTER[m] ** 2}$, a multiple of $${m}$, but $${SQ_MULT_COUNTER[m]}$ is not a multiple of $${m}$`),
  },
  {
    id: 'm-div-k3-k', ms: [2, 3, 4, 5, 6],
    text: (m) => `For every integer $k$, $k^3 - k$ is divisible by $${m}$.`,
    truth: (m) => 6 % m === 0,
    why: (m) => (6 % m === 0 ? '$k^3 - k = (k-1)k(k+1)$ is a product of three consecutive integers' : `$k = 2$ gives $k^3 - k = 6$, which is not divisible by $${m}$`),
  },
  {
    // Parameter-dependent: true exactly when m and d share no factor, so the shape alone decides nothing.
    id: 'mk-mult-d', ms: [24, 34, 26, 56, 39, 49, 23, 48],
    text: (code) => {
      const [m, d] = pairOf(code);
      return `For every positive integer $k$, if $${m}k$ is a multiple of $${d}$ then $k$ is a multiple of $${d}$.`;
    },
    truth: (code) => {
      const [m, d] = pairOf(code);
      return gcd(m, d) === 1;
    },
    why: (code) => {
      const [m, d] = pairOf(code);
      const k = d / gcd(m, d);
      return gcd(m, d) === 1
        ? `$${m}$ and $${d}$ share no factor, so every factor of $${d}$ has to come from $k$ itself`
        : `$k = ${k}$ gives $${m * k}$, a multiple of $${d}$, but $${k}$ is not a multiple of $${d}$`;
    },
  },
];

const POOL_5: Claim[] = [
  { id: 'exists-n2-2n', text: () => 'There is an integer $n$ for which $n^2 = 2n$.', truth: T, why: () => '$n = 0$ and $n = 2$ both work' },
  { id: 'all-n2-ge-n', text: () => 'For every integer $n$, $n^2 \\ge n$.', truth: T, why: () => '$n^2 - n = n(n-1) \\ge 0$ for every integer', excludes: ['exists-int-x2-lt-x'] },
  { id: 'exists-consec-primes', text: () => 'There are prime numbers $p$ and $p + 1$.', truth: T, why: () => '$p = 2$ gives the primes $2$ and $3$' },
  { id: 'all-p2-1-mult8', text: () => 'For every prime $p > 2$, $p^2 - 1$ is a multiple of $8$.', truth: T, why: () => '$p$ is odd, so $(p-1)(p+1)$ is a product of consecutive even numbers, one of them a multiple of $4$' },
  { id: 'exists-3n-2', text: () => 'There is an integer $n$ for which $3n = 2$.', truth: Fa, why: () => '$2$ is not a multiple of $3$' },
  { id: 'all-fact-prime', text: () => 'For every positive integer $n$, $n! + 1$ is prime.', truth: Fa, why: () => '$4! + 1 = 25 = 5 \\times 5$' },
  { id: 'all-n2-n-even', text: () => 'For every integer $n$, $n^2 + n$ is even.', truth: T, why: () => '$n^2 + n = n(n+1)$, a product of consecutive integers' },
  { id: 'exists-int-x2-lt-x', text: () => 'There is an integer $n$ for which $n^2 < n$.', truth: Fa, why: () => '$n(n-1) \\ge 0$ for every integer', excludes: ['all-n2-ge-n'] },
  { id: 'exists-real-x2-lt-x', text: () => 'There is a real number $x$ for which $x^2 < x$.', truth: T, why: () => '$x = \\tfrac12$ gives $x^2 = \\tfrac14$' },
  { id: 'all-x2-1-gt-x', text: () => 'For every real number $x$, $x^2 + 1 > x$.', truth: T, why: () => '$x^2 - x + 1 = (x - \\tfrac12)^2 + \\tfrac34 > 0$' },
  { id: 'perp-diag-rhombus', text: () => 'A quadrilateral whose diagonals are perpendicular must be a rhombus.', truth: Fa, why: () => 'a kite also has perpendicular diagonals' },
  { id: 'rhombus-perp-diag', text: () => 'The diagonals of a rhombus are perpendicular.', truth: T, why: () => 'the diagonals bisect each other and all four sides are equal' },
];

const POOLS: Record<number, Claim[]> = { 1: POOL_1, 2: POOL_2, 4: POOL_4, 5: POOL_5 };

/** The expected option text for a truth vector, in the fixed exam order. */
function comboText(truth: boolean[]): string {
  const names = ['I', 'II', 'III'].filter((_, i) => truth[i]);
  if (names.length === 0) return 'none of them';
  if (names.length === 3) return 'I, II and III';
  if (names.length === 1) return `${names[0]} only`;
  return `${names[0]} and ${names[1]} only`;
}

function statementsQ(rng: RNG, level: Level): Generated | null {
  const pool = POOLS[level];
  const picked = rng.pickDistinct(pool, 3);
  // Never put a statement next to its own negation (or to one that implies it):
  // that would decide options for the candidate before any thinking.
  const ids = picked.map((c) => c.id);
  if (picked.some((c) => c.excludes?.some((e) => ids.includes(e)))) return null;
  const chosen = picked.map((c) => {
    const m = c.ms ? rng.pick(c.ms) : 0;
    return { id: c.id, m, text: c.text(m), truth: c.truth(m), why: c.why(m) };
  });
  const truth = chosen.map((c) => c.truth) as [boolean, boolean, boolean];
  const options = statementOptions(truth);
  const correct = options.find((o) => o.correct)!.display;
  const stem = `Which of the following statements are true?\n\nI. ${chosen[0].text}\nII. ${chosen[1].text}\nIII. ${chosen[2].text}`;
  const solution = chosen.map((c, i) => `${['I', 'II', 'III'][i]} is ${c.truth ? 'true' : 'false'}: ${c.why}.`).join(' ');
  return {
    stem,
    answer: { kind: 'choice' as const, value: correct },
    options,
    solution,
    trap: 'A statement and its converse are different claims — and one counterexample (often 0, 1, 2 or a negative) kills a "for all".',
    tags: ['reasoning', 'proof', 'statements'],
    params: { variant: 'statements', claims: chosen.map((c) => [c.id, c.m] as [string, number]), truth },
    typedAllowed: false,
  };
}

// ----------------------------------------------------------------------------- level 3: logical forms

/** A predicate about a positive integer n, with its negation and a test function. */
interface Pred { text: string; neg: string; f: (n: number) => boolean }

/** Predicate ids: "mult:6", "sqmult:12", "gt:4", "sqgt:9", "prime" and "not:<id>". */
function predFor(id: string): Pred {
  if (id.startsWith('not:')) {
    const inner = predFor(id.slice(4));
    return { text: inner.neg, neg: inner.text, f: (n) => !inner.f(n) };
  }
  const [kind, arg] = id.split(':');
  const m = Number(arg);
  switch (kind) {
    case 'mult':
      return m === 2
        ? { text: '$n$ is even', neg: '$n$ is odd', f: (n) => n % 2 === 0 }
        : { text: `$n$ is a multiple of $${m}$`, neg: `$n$ is not a multiple of $${m}$`, f: (n) => n % m === 0 };
    case 'sqmult':
      return { text: `$n^2$ is a multiple of $${m}$`, neg: `$n^2$ is not a multiple of $${m}$`, f: (n) => (n * n) % m === 0 };
    case 'gt':
      return { text: `$n > ${m}$`, neg: `$n \\le ${m}$`, f: (n) => n > m };
    case 'sqgt':
      return { text: `$n^2 > ${m}$`, neg: `$n^2 \\le ${m}$`, f: (n) => n * n > m };
    default:
      return { text: '$n$ is a prime number', neg: '$n$ is not a prime number', f: (n) => isPrime(n) };
  }
}

const negate = (id: string): string => (id.startsWith('not:') ? id.slice(4) : `not:${id}`);
const textOf = (id: string): string => predFor(id).text;

/** Pairs (m, d) with d a proper divisor of m: "multiple of m" ⇒ "multiple of d", but not conversely. */
const DIVISOR_PAIRS: [number, number][] = [
  [4, 2], [6, 2], [6, 3], [8, 2], [8, 4], [9, 3], [10, 2], [10, 5], [12, 3], [12, 4],
  [12, 6], [14, 7], [15, 3], [15, 5], [16, 4], [18, 6], [18, 9], [20, 4], [20, 5], [20, 10],
];

/** (k, d): n² a multiple of k forces n to be a multiple of d, and d is not the whole story. */
const SQUARE_PAIRS: [number, number][] = [
  [8, 2], [12, 2], [12, 3], [16, 2], [18, 2], [18, 3], [24, 2], [24, 3], [24, 4], [24, 6],
  [36, 2], [36, 3], [48, 4], [48, 6], [50, 2], [50, 5],
];

/** (c, d) with d < c²: n > c forces n² > d, and the converse fails. */
const SIZE_PAIRS: [number, number][] = [[3, 4], [4, 4], [4, 9], [5, 4], [5, 9], [5, 16], [6, 16], [6, 25], [7, 36], [8, 49]];

/** Composite multipliers: every multiple of m is composite. */
const COMPOSITE_MS = [4, 6, 8, 9, 10, 12];

/** All the true implications P ⇒ Q available at level 3, as predicate ids. */
const IMPLICATIONS: [string, string][] = [
  ...DIVISOR_PAIRS.map(([m, d]) => [`mult:${m}`, `mult:${d}`] as [string, string]),
  ...SQUARE_PAIRS.map(([k, d]) => [`sqmult:${k}`, `mult:${d}`] as [string, string]),
  ...SIZE_PAIRS.map(([c, d]) => [`gt:${c}`, `sqgt:${d}`] as [string, string]),
  ...COMPOSITE_MS.map((m) => [`mult:${m}`, 'not:prime'] as [string, string]),
];

type Ask = 'contrapositive' | 'converse' | 'inverse';
const ASKS: Ask[] = ['contrapositive', 'contrapositive', 'converse', 'inverse'];

const HOW: Record<Ask, string> = {
  contrapositive: 'The contrapositive of "if $A$ then $B$" is "if not $B$ then not $A$": negate both parts and swap them',
  converse: 'The converse of "if $A$ then $B$" is "if $B$ then $A$": swap the two parts, leaving each of them as it is',
  inverse: 'The inverse of "if $A$ then $B$" is "if not $A$ then not $B$": negate both parts, keeping them in the same order',
};

function implicationQ(rng: RNG): Generated | null {
  const [P, Q] = rng.pick(IMPLICATIONS);
  const ask = rng.pick(ASKS);
  const nP = negate(P), nQ = negate(Q);
  const imp = (a: string, b: string) => `If ${textOf(a)}, then ${textOf(b)}.`;
  const forms: { name: Ask | 'original' | null; pair: [string, string] }[] = [
    { name: 'original', pair: [P, Q] },
    { name: 'converse', pair: [Q, P] },
    { name: 'inverse', pair: [nP, nQ] },
    { name: 'contrapositive', pair: [nQ, nP] },
    { name: null, pair: [nQ, P] },
    { name: null, pair: [P, nQ] },
    { name: null, pair: [nP, Q] },
    { name: null, pair: [Q, nP] },
  ];
  const correctPair = forms.find((f) => f.name === ask)!.pair;
  const correct = imp(correctPair[0], correctPair[1]);
  const named = forms.filter((f) => f.name && f.name !== ask);
  const mixed = forms.filter((f) => f.name === null);
  // The three other named forms are the headline traps: they always appear, then one mixed form.
  const wrongForms = [...named, ...rng.shuffle(mixed).slice(0, 1)];
  const wrong = wrongForms.map((f) => ({
    display: imp(f.pair[0], f.pair[1]),
    trap: f.name === 'original'
      ? `that is the original statement, not its ${ask}`
      : f.name
        ? `that is the ${f.name}, not the ${ask}`
        : 'one part was negated and the other left alone',
  })).filter((w) => w.display !== correct);
  if (wrong.length < 4) return null;
  const options = buildChoiceOptions(rng, correct, wrong);
  const pairs: Record<string, [string, string]> = {};
  for (const f of forms) pairs[imp(f.pair[0], f.pair[1])] = f.pair;
  const optionPairs = options.map((o) => [o.display, pairs[o.display][0], pairs[o.display][1]] as [string, string, string]);
  return {
    stem: `Let $n$ be a positive integer. Consider the statement\n\n"${imp(P, Q)}"\n\nWhich of the following is the ${ask} of this statement?`,
    answer: { kind: 'choice' as const, value: correct },
    options,
    solution: `${HOW[ask]}. Here that gives "${correct}"`,
    trap: 'The contrapositive negates and swaps; negating without swapping gives the inverse, swapping without negating gives the converse.',
    tags: ['reasoning', 'logic', ask],
    params: { variant: 'implication', ask, p: P, q: Q, optionPairs },
    typedAllowed: false,
  };
}

// -----------------------------------------------------------------------------

export default defineTemplate({
  id: 'm2.reasoning.must-be-true',
  module: 'M2',
  topic: 'reasoning',
  title: 'Which statements must be true (proof-style)',
  levels: {
    1: 'parity and multiples: n odd ⇒ n² odd, n³ − n divisible by 6, sums of consecutive numbers',
    2: 'primes, inequalities and a claim about diagonals of a quadrilateral',
    3: 'identify the contrapositive (or the converse, or the inverse) of a given implication',
    4: 'statements about a parameter k that a counterexample decides',
    5: 'mixed statements with explicit quantifiers ("for all", "there exists")',
  },
  generate(rng, level: Level) {
    return retry(rng, () => (level === 3 ? implicationQ(rng) : statementsQ(rng, level)));
  },
  verify(q) {
    if (q.answer.kind !== 'choice') return false;
    const p = q.params as { variant: string; claims?: [string, number][]; truth?: boolean[]; ask?: Ask; p?: string; q?: string; optionPairs?: [string, string, string][] };
    if (p.variant === 'statements') {
      // Machine-check each statement independently, then rebuild the expected option text.
      const truth = p.claims!.map(([id, m]) => {
        const check = CHECKS[id];
        return check ? check(m) : !p.truth![0];
      });
      if (truth.length !== 3) return false;
      if (!truth.every((t, i) => t === p.truth![i])) return false;
      const expected = comboText(truth);
      return STATEMENT_COMBOS.includes(expected) && expected === q.answer.value
        && q.options.filter((o) => o.correct).length === 1;
    }
    if (p.variant === 'implication') {
      // Identify the wanted form by the *meaning* of each option's two parts, tested over 1..60,
      // rather than by the strings generate() built.
      const fnOf = (id: string) => predFor(id).f;
      const equiv = (a: string, b: string) => {
        const fa = fnOf(a), fb = fnOf(b);
        return POS.every((n) => fa(n) === fb(n));
      };
      const P = p.p!, Q = p.q!;
      // The original implication must hold, and P must be strictly stronger than Q
      // (otherwise "the converse" and "the contrapositive" could not be told apart).
      const fP = fnOf(P), fQ = fnOf(Q);
      if (!POS.every((n) => (fP(n) ? fQ(n) : true))) return false;
      if (POS.every((n) => fP(n) === fQ(n))) return false;
      const want: [string, string] = p.ask === 'converse' ? [Q, P]
        : p.ask === 'inverse' ? [negate(P), negate(Q)]
          : [negate(Q), negate(P)];
      const matching = p.optionPairs!.filter(([, a, b]) => equiv(a, want[0]) && equiv(b, want[1]));
      if (matching.length !== 1 || matching[0][0] !== q.answer.value) return false;
      // A contrapositive says exactly the same thing as the original; a converse or an inverse does not.
      const [, ca, cb] = matching[0];
      const fa = fnOf(ca), fb = fnOf(cb);
      const same = POS.every((n) => (fP(n) ? fQ(n) : true) === (fa(n) ? fb(n) : true));
      return p.ask === 'contrapositive' ? same : !same;
    }
    return false;
  },
});
