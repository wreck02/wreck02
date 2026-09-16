import { defineTemplate, retry, type Level } from '../../core/template';
import { statementOptions, STATEMENT_COMBOS } from '../../core/options';
import { isPrime } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * "Which of the following statements are true?" for algebra and number.
 * Level 1: index laws and expansion errors
 * Level 2: inequalities, where negative numbers break the rule
 * Level 3: roots and moduli
 * Level 4: quadratics and discriminants
 * Level 5: mixed statements about integers, where the counterexample has to be hunted for
 *
 * Every statement carries a machine check: verify() re-derives all three truth values by
 * searching a numeric grid for a counterexample, never from the flags stored in params.
 */

// ----------------------------------------------------------------------------- search grids

const REALS = [-10, -5, -3, -2, -1.5, -1, -0.5, -0.2, 0, 0.2, 0.5, 1, 1.5, 2, 3, 5, 10];
const NONZERO = REALS.filter((x) => x !== 0);
const POSITIVE = REALS.filter((x) => x > 0);
const NONNEG = REALS.filter((x) => x >= 0);
const INTEGERS = Array.from({ length: 41 }, (_, i) => i - 20);

const EPS = 1e-9;
const same = (a: number, b: number): boolean => Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a), Math.abs(b));
const divides = (d: number, n: number): boolean => ((n % d) + d) % d === 0;

/** True when the predicate holds everywhere on the grid (i.e. no counterexample was found). */
const all = <T,>(xs: T[], pred: (x: T) => boolean): boolean => xs.every(pred);
const allPairs = (xs: number[], pred: (a: number, b: number) => boolean): boolean =>
  xs.every((a) => xs.every((b) => pred(a, b)));

// ----------------------------------------------------------------------------- statements

interface Built { args: number[]; text: string; truth: boolean; why: string }
interface StatementDef {
  id: string;
  build: (rng: RNG) => Built;
  /** Machine check: recomputes the truth value by searching for a counterexample. */
  check: (args: number[]) => boolean;
}

/** "3", "-3" as a coefficient in front of a letter. */
const coef = (k: number, v: string): string => (k === 1 ? v : k === -1 ? `-${v}` : `${k}${v}`);
const plus = (k: number): string => (k >= 0 ? `+ ${k}` : `- ${-k}`);
/** " + 5x", " - 3x", "" for zero. */
const xTerm = (b: number): string => (b === 0 ? '' : ` ${plus(b)}x`);
/** Bracket a negative number inside a product. */
const brn = (n: number): string => (n < 0 ? `(${n})` : `${n}`);

const DEFS: StatementDef[] = [
  // --- level 1: index laws and expanding ---------------------------------------
  {
    id: 'pow-mul',
    build: (rng) => {
      const f = rng.int(0, 1);
      return {
        args: [f],
        text: `For all $a > 0$ and all positive integers $m$ and $n$, $a^{m} \\times a^{n} = a^{${f === 0 ? 'm+n' : 'mn'}}$.`,
        truth: f === 0,
        why: f === 0 ? 'multiplying powers of the same base adds the indices' : 'indices add: with $m = n = 1$ the left-hand side is $a^{2}$ but the right-hand side is $a$',
      };
    },
    check: ([f]) => {
      for (const a of [2, 3]) for (let m = 1; m <= 4; m++) for (let n = 1; n <= 4; n++) {
        if (!same(a ** m * a ** n, f === 0 ? a ** (m + n) : a ** (m * n))) return false;
      }
      return true;
    },
  },
  {
    id: 'pow-pow',
    build: (rng) => {
      const f = rng.int(0, 1);
      return {
        args: [f],
        text: `For all $x > 0$ and all positive integers $m$ and $n$, $(x^{m})^{n} = x^{${f === 0 ? 'mn' : 'm+n'}}$.`,
        truth: f === 0,
        why: f === 0 ? 'a power of a power multiplies the indices' : 'a power of a power multiplies the indices: $(x^{2})^{3} = x^{6}$, not $x^{5}$',
      };
    },
    check: ([f]) => {
      for (const x of [2, 3, 0.5]) for (let m = 1; m <= 4; m++) for (let n = 1; n <= 4; n++) {
        if (!same((x ** m) ** n, f === 0 ? x ** (m * n) : x ** (m + n))) return false;
      }
      return true;
    },
  },
  {
    id: 'square-expand',
    build: (rng) => {
      const a = rng.int(2, 6);
      const f = rng.int(0, 1);
      return {
        args: [a, f],
        text: `$(x + ${a})^{2} = x^{2} ${f === 0 ? '' : `+ ${2 * a}x `}+ ${a * a}$ for every real number $x$.`,
        truth: f === 1,
        why: f === 1 ? 'the full expansion keeps the middle term' : `the middle term $${2 * a}x$ is missing: at $x = 1$ the two sides are $${(1 + a) ** 2}$ and $${1 + a * a}$`,
      };
    },
    check: ([a, f]) => all(REALS, (x) => same((x + a) ** 2, f === 0 ? x * x + a * a : x * x + 2 * a * x + a * a)),
  },
  {
    id: 'diff-squares',
    build: (rng) => {
      const a = rng.int(2, 9);
      const f = rng.int(0, 1);
      return {
        args: [a, f],
        text: `$(x + ${a})(x - ${a}) = x^{2} ${f === 0 ? '-' : '+'} ${a * a}$ for every real number $x$.`,
        truth: f === 0,
        why: f === 0 ? 'difference of two squares' : `at $x = 0$ the left-hand side is $${-a * a}$, not $${a * a}$`,
      };
    },
    check: ([a, f]) => all(REALS, (x) => same((x + a) * (x - a), f === 0 ? x * x - a * a : x * x + a * a)),
  },
  {
    id: 'add-powers',
    build: (rng) => {
      const m = rng.int(2, 5);
      const f = rng.int(0, 1);
      return {
        args: [m, f],
        text: `$x^{${m}} + x^{${m}} = ${f === 0 ? `2x^{${m}}` : `x^{${2 * m}}`}$ for every real number $x$.`,
        truth: f === 0,
        why: f === 0 ? 'adding two like terms doubles them' : `adding like terms doubles them; at $x = 2$ the sides are $${2 * 2 ** m}$ and $${2 ** (2 * m)}$`,
      };
    },
    check: ([m, f]) => all(REALS, (x) => same(x ** m + x ** m, f === 0 ? 2 * x ** m : x ** (2 * m))),
  },
  {
    id: 'neg-index',
    build: (rng) => {
      const m = rng.int(1, 4);
      const f = rng.int(0, 1);
      return {
        args: [m, f],
        text: `$x^{-${m}} = ${f === 0 ? `\\frac{1}{x^{${m}}}` : `-x^{${m}}`}$ for every $x \\ne 0$.`,
        truth: f === 0,
        why: f === 0 ? 'a negative index means a reciprocal' : 'a negative index gives a reciprocal, not a negative value: $2^{-1} = \\tfrac{1}{2}$',
      };
    },
    check: ([m, f]) => all(NONZERO, (x) => same(x ** -m, f === 0 ? 1 / x ** m : -(x ** m))),
  },
  {
    id: 'frac-index',
    build: (rng) => {
      const f = rng.int(0, 1);
      return {
        args: [f],
        text: `$x^{\\frac{1}{2}} = ${f === 0 ? '\\sqrt{x}' : '\\frac{x}{2}'}$ for every $x \\ge 0$.`,
        truth: f === 0,
        why: f === 0 ? 'a half index is a square root' : 'a half index is a square root, not a half: at $x = 16$ the sides are $4$ and $8$',
      };
    },
    check: ([f]) => all(NONNEG, (x) => same(x ** 0.5, f === 0 ? Math.sqrt(x) : x / 2)),
  },

  // --- level 2: inequalities ----------------------------------------------------
  {
    id: 'sq-ineq',
    build: (rng) => {
      const f = rng.int(0, 1);
      return {
        args: [f],
        text: f === 0 ? 'If $a > b$ then $a^{2} > b^{2}$.' : 'If $a > b > 0$ then $a^{2} > b^{2}$.',
        truth: f === 1,
        why: f === 1 ? 'squaring preserves order for positive numbers' : 'take $a = 1$ and $b = -2$: $1 > -2$ but $1 < 4$',
      };
    },
    check: ([f]) => allPairs(REALS, (a, b) => !(a > b && (f === 1 ? b > 0 : true)) || a * a > b * b),
  },
  {
    id: 'mul-k',
    build: (rng) => {
      const k = rng.pick([-5, -4, -3, -2, 2, 3, 4, 5]);
      return {
        args: [k],
        text: `If $a > b$ then $${coef(k, 'a')} > ${coef(k, 'b')}$.`,
        truth: k > 0,
        why: k > 0 ? 'multiplying by a positive number keeps the inequality' : `multiplying by the negative number $${k}$ reverses the inequality`,
      };
    },
    check: ([k]) => allPairs(REALS, (a, b) => !(a > b) || k * a > k * b),
  },
  {
    id: 'recip-order',
    build: (rng) => {
      const f = rng.int(0, 1);
      return {
        args: [f],
        text: f === 0 ? 'If $x < y$ then $\\frac{1}{x} > \\frac{1}{y}$, for all non-zero $x$ and $y$.' : 'If $0 < x < y$ then $\\frac{1}{x} > \\frac{1}{y}$.',
        truth: f === 1,
        why: f === 1 ? 'reciprocals reverse the order of two positive numbers' : 'take $x = -1$ and $y = 1$: $-1 < 1$ but $-1 < 1$ for the reciprocals too',
      };
    },
    check: ([f]) => allPairs(NONZERO, (x, y) => !(x < y && (f === 1 ? x > 0 : true)) || 1 / x > 1 / y),
  },
  {
    id: 'recip-one',
    build: (rng) => {
      const f = rng.int(0, 1);
      return {
        args: [f],
        text: f === 0 ? 'If $\\frac{1}{x} < 1$ then $x > 1$.' : 'If $x > 0$ and $\\frac{1}{x} < 1$ then $x > 1$.',
        truth: f === 1,
        why: f === 1 ? 'for positive $x$ the reciprocal is below 1 exactly when $x > 1$' : 'take $x = -1$: $\\frac{1}{x} = -1 < 1$ but $x < 1$',
      };
    },
    check: ([f]) => all(NONZERO, (x) => !(1 / x < 1 && (f === 1 ? x > 0 : true)) || x > 1),
  },
  {
    id: 'add-k',
    build: (rng) => {
      const k = rng.pick([-9, -7, -4, -2, 3, 5, 6, 8]);
      return {
        args: [k],
        text: `If $a > b$ then $a ${plus(k)} > b ${plus(k)}$.`,
        truth: true,
        why: 'adding the same number to both sides never changes an inequality',
      };
    },
    check: ([k]) => allPairs(REALS, (a, b) => !(a > b) || a + k > b + k),
  },
  {
    id: 'odd-power-ineq',
    build: (rng) => {
      const f = rng.int(0, 1);
      const p = f === 0 ? 3 : 4;
      return {
        args: [p],
        text: `If $a > b$ then $a^{${p}} > b^{${p}}$.`,
        truth: p % 2 === 1,
        why: p % 2 === 1 ? 'cubing preserves order for all real numbers' : `take $a = 1$ and $b = -2$: $1 > -2$ but $1 < ${(-2) ** p}$`,
      };
    },
    check: ([p]) => allPairs(REALS, (a, b) => !(a > b) || a ** p > b ** p),
  },
  {
    id: 'sq-back',
    build: (rng) => {
      const f = rng.int(0, 1);
      return {
        args: [f],
        text: f === 0 ? 'If $a^{2} > b^{2}$ then $a > b$.' : 'If $a^{2} > b^{2}$ then $|a| > |b|$.',
        truth: f === 1,
        why: f === 1 ? 'squares compare the sizes, so the moduli compare the same way' : 'take $a = -3$ and $b = 1$: $9 > 1$ but $-3 < 1$',
      };
    },
    check: ([f]) => allPairs(REALS, (a, b) => !(a * a > b * b) || (f === 0 ? a > b : Math.abs(a) > Math.abs(b))),
  },

  // --- level 3: roots and moduli ------------------------------------------------
  {
    id: 'sqrt-sq',
    build: (rng) => {
      const f = rng.int(0, 1);
      return {
        args: [f],
        text: `$\\sqrt{x^{2}} = ${f === 0 ? '|x|' : 'x'}$ for every real number $x$.`,
        truth: f === 0,
        why: f === 0 ? 'the square root sign means the non-negative root' : 'at $x = -3$ the left-hand side is $3$, not $-3$',
      };
    },
    check: ([f]) => all(REALS, (x) => same(Math.sqrt(x * x), f === 0 ? Math.abs(x) : x)),
  },
  {
    id: 'sqrt-prod',
    build: (rng) => {
      const f = rng.int(0, 1);
      return {
        args: [f],
        text: f === 0
          ? '$\\sqrt{a}\\sqrt{b} = \\sqrt{ab}$ for all $a \\ge 0$ and $b \\ge 0$.'
          : '$\\sqrt{a} + \\sqrt{b} = \\sqrt{a + b}$ for all $a \\ge 0$ and $b \\ge 0$.',
        truth: f === 0,
        why: f === 0 ? 'roots multiply' : 'take $a = b = 9$: the sides are $6$ and $\\sqrt{18}$',
      };
    },
    check: ([f]) => allPairs(NONNEG, (a, b) => same(f === 0 ? Math.sqrt(a) * Math.sqrt(b) : Math.sqrt(a) + Math.sqrt(b), Math.sqrt(f === 0 ? a * b : a + b))),
  },
  {
    id: 'abs-ge',
    build: (rng) => {
      const f = rng.int(0, 1);
      return {
        args: [f],
        text: `$|x| ${f === 0 ? '\\ge' : '>'} x$ for every real number $x$.`,
        truth: f === 0,
        why: f === 0 ? 'the modulus is never smaller than the number itself' : 'at $x = 2$ the two sides are equal, so the strict inequality fails',
      };
    },
    check: ([f]) => all(REALS, (x) => (f === 0 ? Math.abs(x) >= x : Math.abs(x) > x)),
  },
  {
    id: 'abs-sum',
    build: (rng) => {
      const a = rng.int(2, 8);
      return {
        args: [a],
        text: `$|x + ${a}| = |x| + ${a}$ for every real number $x$.`,
        truth: false,
        why: `at $x = ${-a}$ the left-hand side is $0$ and the right-hand side is $${2 * a}$`,
      };
    },
    check: ([a]) => all([...REALS, -a], (x) => same(Math.abs(x + a), Math.abs(x) + a)),
  },
  {
    id: 'sqrt-sum-sq',
    build: (rng) => {
      const a = rng.int(2, 8);
      return {
        args: [a],
        text: `$\\sqrt{x^{2} + ${a * a}} = x + ${a}$ for every $x \\ge 0$.`,
        truth: false,
        why: `at $x = ${a}$ the sides are $${a}\\sqrt{2}$ and $${2 * a}$`,
      };
    },
    check: ([a]) => all(NONNEG, (x) => same(Math.sqrt(x * x + a * a), x + a)),
  },
  {
    id: 'sq-gt',
    build: (rng) => {
      const a = rng.int(2, 9);
      const f = rng.int(0, 1);
      return {
        args: [a, f],
        text: `If $x^{2} > ${a * a}$ then $${f === 0 ? 'x' : '|x|'} > ${a}$.`,
        truth: f === 1,
        why: f === 1 ? 'a large square means a large modulus' : `at $x = ${-a - 1}$ the square is $${(a + 1) ** 2} > ${a * a}$ but $x < ${a}$`,
      };
    },
    check: ([a, f]) => all([...REALS, -a - 1, a + 1], (x) => !(x * x > a * a) || (f === 0 ? x > a : Math.abs(x) > a)),
  },
  {
    id: 'abs-sym',
    build: (rng) => {
      const a = rng.int(2, 9);
      const f = rng.int(0, 1);
      return {
        args: [a, f],
        text: `$|x - ${a}| = ${f === 0 ? `|${a} - x|` : `x - ${a}`}$ for every real number $x$.`,
        truth: f === 0,
        why: f === 0 ? 'a modulus is unchanged by swapping the order of the subtraction' : `at $x = 0$ the sides are $${a}$ and $${-a}$`,
      };
    },
    check: ([a, f]) => all(REALS, (x) => same(Math.abs(x - a), f === 0 ? Math.abs(a - x) : x - a)),
  },

  // --- level 4: quadratics ------------------------------------------------------
  {
    id: 'perfect-square',
    build: (rng) => {
      const a = rng.int(2, 7);
      const f = rng.int(0, 1);
      return {
        args: [a, f],
        text: `$x^{2} - ${2 * a}x + ${a * a} ${f === 0 ? '\\ge' : '>'} 0$ for every real number $x$.`,
        truth: f === 0,
        why: f === 0 ? `the expression is $(x - ${a})^{2}$, which is never negative` : `at $x = ${a}$ the expression is $0$, so it is not always strictly positive`,
      };
    },
    check: ([a, f]) => all([...REALS, a], (x) => (f === 0 ? x * x - 2 * a * x + a * a >= -EPS : x * x - 2 * a * x + a * a > EPS)),
  },
  {
    id: 'disc-k',
    build: (rng) => {
      const f = rng.int(0, 1);
      return {
        args: [f],
        text: `The equation $x^{2} + kx + 1 = 0$ has real roots whenever $${f === 0 ? '|k| \\ge 2' : 'k \\ge 1'}$.`,
        truth: f === 0,
        why: f === 0 ? 'the discriminant is $k^{2} - 4$, which is non-negative exactly when $|k| \\ge 2$' : 'at $k = 1$ the discriminant is $1 - 4 = -3 < 0$',
      };
    },
    check: ([f]) => all([...REALS, 1, 1.5, 2, -2, -1.5], (k) => !(f === 0 ? Math.abs(k) >= 2 : k >= 1) || k * k - 4 >= -EPS),
  },
  {
    id: 'ab-zero',
    build: (rng) => {
      const f = rng.int(0, 1);
      return {
        args: [f],
        text: f === 0 ? 'If $ab = 0$ then $a = 0$.' : 'If $ab = 0$ then $a = 0$ or $b = 0$.',
        truth: f === 1,
        why: f === 1 ? 'a product is zero only if one of the factors is zero' : 'take $a = 3$ and $b = 0$: the product is $0$ but $a \\ne 0$',
      };
    },
    check: ([f]) => allPairs(REALS, (a, b) => !same(a * b, 0) || (f === 0 ? a === 0 : a === 0 || b === 0)),
  },
  {
    id: 'quad-real',
    build: (rng) => {
      const wantTrue = rng.bool();
      let b: number, c: number;
      if (wantTrue) {
        // build from two distinct integer roots
        const p = rng.int(-5, 5);
        const q = rng.intExcluding(-5, 5, [p]);
        b = -(p + q);
        c = p * q;
      } else {
        b = rng.int(-6, 6);
        c = Math.ceil((b * b) / 4) + rng.int(1, 5);
      }
      return {
        args: [b, c],
        text: `The equation $x^{2}${xTerm(b)} ${plus(c)} = 0$ has two distinct real roots.`,
        truth: b * b - 4 * c > 0,
        why: `the discriminant is $${brn(b)}^{2} - 4 \\times ${brn(c)} = ${b * b - 4 * c}$`,
      };
    },
    // Independent of the discriminant: scan for sign changes of x² + bx + c and
    // require two distinct places where it crosses (or touches) zero.
    check: ([b, c]) => {
      const f = (x: number) => x * x + b * x + c;
      const roots: number[] = [];
      const lo = -25, step = 0.005;
      let prev = f(lo);
      for (let i = 1; i <= 10000; i++) {
        const x = lo + i * step;
        const v = f(x);
        if (Math.abs(v) <= EPS) roots.push(x);
        else if (prev * v < 0) roots.push(x - step / 2);
        prev = v;
      }
      const distinct: number[] = [];
      for (const r of roots) if (!distinct.some((s) => Math.abs(s - r) < 0.1)) distinct.push(r);
      return distinct.length >= 2;
    },
  },
  {
    id: 'pos-quad',
    build: (rng) => {
      const a = rng.pick([-9, -4, -1, 1, 4, 9, 2, -2]);
      return {
        args: [a],
        text: `$x^{2} ${plus(a)} > 0$ for every real number $x$.`,
        truth: a > 0,
        why: a > 0 ? `$x^{2}$ is never negative, so the expression is at least $${a}$` : `at $x = 0$ the expression is $${a}$`,
      };
    },
    check: ([a]) => all([...REALS, 0], (x) => x * x + a > EPS),
  },
  {
    id: 'min-value',
    build: (rng) => {
      const a = rng.int(1, 6);
      const b = rng.intExcluding(-6, 6, [a, 0]);
      const f = rng.int(0, 1);
      return {
        args: [a, b, f],
        text: `The smallest value of $(x - ${a})^{2} ${plus(b)}$ is $${f === 0 ? b : a}$.`,
        truth: f === 0,
        why: f === 0 ? `the square is smallest (zero) at $x = ${a}$, leaving $${b}$` : `the square is smallest (zero) at $x = ${a}$, so the minimum is $${b}$, not $${a}$`,
      };
    },
    check: ([a, b, f]) => {
      const claim = f === 0 ? b : a;
      const min = Math.min(...[...REALS, a].map((x) => (x - a) ** 2 + b));
      return same(min, claim);
    },
  },
  {
    id: 'sum-roots',
    build: (rng) => {
      const p = rng.intExcluding(-5, 5, [0]);
      const q = rng.intExcluding(-5, 5, [0, p]);
      const b = -(p + q);
      const c = p * q;
      const f = rng.int(0, 1);
      return {
        args: [b, c, f],
        text: `The two roots of $x^{2}${xTerm(b)} ${plus(c)} = 0$ add up to $${f === 0 ? -b : b}$.`,
        truth: f === 0 ? true : -b === b,
        why: `the roots are $${p}$ and $${q}$, and they add to $${p + q}$`,
      };
    },
    check: ([b, c, f]) => {
      const disc = b * b - 4 * c;
      if (disc < 0) return false;
      const r1 = (-b + Math.sqrt(disc)) / 2;
      const r2 = (-b - Math.sqrt(disc)) / 2;
      return same(r1 + r2, f === 0 ? -b : b);
    },
  },

  // --- level 5: integers and counterexamples ------------------------------------
  {
    id: 'n2n-even',
    build: (rng) => {
      const f = rng.int(0, 1);
      return {
        args: [f],
        text: `$n^{2} + ${f === 0 ? 'n' : '1'}$ is even for every integer $n$.`,
        truth: f === 0,
        why: f === 0 ? '$n^{2} + n = n(n+1)$ is a product of consecutive integers, so it is even' : 'at $n = 2$ the value is $5$, which is odd',
      };
    },
    check: ([f]) => all(INTEGERS, (n) => divides(2, f === 0 ? n * n + n : n * n + 1)),
  },
  {
    id: 'two-pow',
    build: (rng) => {
      const t = rng.pick([1, 2, 3, 5, 6]);
      return {
        args: [t],
        text: `$2^{n} > n^{2}$ for every integer $n \\ge ${t}$.`,
        truth: t >= 5,
        why: t >= 5 ? 'from $n = 5$ onwards the powers of 2 grow faster' : 'at $n = 4$ both sides are $16$, so the strict inequality fails',
      };
    },
    check: ([t]) => {
      for (let n = t; n <= 40; n++) if (!(2 ** n > n * n)) return false;
      return true;
    },
  },
  {
    id: 'prime-poly',
    build: (rng) => {
      const a = rng.pick([5, 7, 11, 13, 17]);
      return {
        args: [a],
        text: `$n^{2} + n + ${a}$ is a prime number for every positive integer $n$.`,
        truth: false,
        why: `at $n = ${a - 1}$ the value is $${a * a}$, which is $${a}^{2}$`,
      };
    },
    check: ([a]) => {
      for (let n = 1; n <= 60; n++) if (!isPrime(n * n + n + a)) return false;
      return true;
    },
  },
  {
    id: 'n3-n',
    build: (rng) => {
      const d = rng.pick([2, 3, 6, 4, 5, 9]);
      return {
        args: [d],
        text: `$n^{3} - n$ is a multiple of $${d}$ for every integer $n$.`,
        truth: 6 % d === 0,
        why: 6 % d === 0 ? '$n^{3} - n = (n-1)n(n+1)$, a product of three consecutive integers' : `at $n = 2$ the value is $6$, which is not a multiple of $${d}$`,
      };
    },
    check: ([d]) => all(INTEGERS, (n) => divides(d, n ** 3 - n)),
  },
  {
    id: 'x-plus-inv',
    build: (rng) => {
      const f = rng.int(0, 1);
      return {
        args: [f],
        text: `$x + \\frac{1}{x} \\ge 2$ for every ${f === 0 ? 'real number $x \\ne 0$' : 'real number $x > 0$'}.`,
        truth: f === 1,
        why: f === 1 ? '$(\\sqrt{x} - \\frac{1}{\\sqrt{x}})^{2} \\ge 0$ rearranges to the inequality' : 'at $x = -1$ the value is $-2$',
      };
    },
    check: ([f]) => all(f === 0 ? NONZERO : POSITIVE, (x) => x + 1 / x >= 2 - EPS),
  },
  {
    id: 'sq-eq',
    build: (rng) => {
      const f = rng.int(0, 1);
      const p = f === 0 ? 2 : 3;
      return {
        args: [p],
        text: `If $a^{${p}} = b^{${p}}$ then $a = b$.`,
        truth: p % 2 === 1,
        why: p % 2 === 1 ? 'cubes are one-to-one on the real numbers' : 'take $a = 3$ and $b = -3$: both squares are $9$',
      };
    },
    check: ([p]) => allPairs(REALS, (a, b) => !same(a ** p, b ** p) || a === b),
  },
  {
    id: 'odd-square',
    build: (rng) => {
      const f = rng.int(0, 1);
      return {
        args: [f],
        text: f === 0 ? 'The square of every odd integer is odd.' : 'The square of every integer is even.',
        truth: f === 0,
        why: f === 0 ? '$(2k+1)^{2} = 4k^{2} + 4k + 1$ is odd' : 'at $n = 3$ the square is $9$, which is odd',
      };
    },
    check: ([f]) => all(INTEGERS, (n) => (f === 0 ? (divides(2, n) ? true : !divides(2, n * n)) : divides(2, n * n))),
  },
  {
    id: 'consecutive',
    build: (rng) => {
      const f = rng.int(0, 1);
      return {
        args: [f],
        text: `The ${f === 0 ? 'product' : 'sum'} of any two consecutive integers is even.`,
        truth: f === 0,
        why: f === 0 ? 'one of any two consecutive integers is even' : 'take $3$ and $4$: the sum is $7$, which is odd',
      };
    },
    check: ([f]) => all(INTEGERS, (n) => divides(2, f === 0 ? n * (n + 1) : n + (n + 1))),
  },
];

const DEF_BY_ID: Record<string, StatementDef> = Object.fromEntries(DEFS.map((d) => [d.id, d]));

const POOLS: Record<Level, string[]> = {
  1: ['pow-mul', 'pow-pow', 'square-expand', 'diff-squares', 'add-powers', 'neg-index', 'frac-index'],
  2: ['sq-ineq', 'mul-k', 'recip-order', 'recip-one', 'add-k', 'odd-power-ineq', 'sq-back'],
  3: ['sqrt-sq', 'sqrt-prod', 'abs-ge', 'abs-sum', 'sqrt-sum-sq', 'sq-gt', 'abs-sym'],
  4: ['perfect-square', 'disc-k', 'ab-zero', 'quad-real', 'pos-quad', 'min-value', 'sum-roots'],
  5: ['n2n-even', 'two-pow', 'prime-poly', 'n3-n', 'x-plus-inv', 'sq-eq', 'odd-square', 'consecutive', 'sq-gt', 'sq-ineq'],
};

const ROMAN = ['I', 'II', 'III'];

/** The combination text for a truth vector, built independently of statementOptions. */
function comboText(truth: boolean[]): string {
  const names = ROMAN.filter((_, i) => truth[i]);
  if (names.length === 0) return 'none of them';
  if (names.length === 3) return 'I, II and III';
  if (names.length === 1) return `${names[0]} only`;
  return `${names[0]} and ${names[1]} only`;
}

export default defineTemplate({
  id: 'm1.algebra.which-statements-algebra',
  module: 'M1',
  topic: 'algebra',
  title: 'Which statements are true (algebra & number)',
  levels: {
    1: 'index laws and expansion errors',
    2: 'inequalities, where negatives break the rule',
    3: 'roots and moduli',
    4: 'quadratics and discriminants',
    5: 'statements about integers needing a counterexample',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      const ids = rng.pickDistinct(POOLS[level], 3);
      const built = ids.map((id) => DEF_BY_ID[id].build(rng));
      const truth = built.map((b) => b.truth) as [boolean, boolean, boolean];
      // A question where every statement is false (or all true) is fine, but not too often.
      if (truth.every((t) => t === truth[0]) && rng.bool(0.5)) return null;
      const options = statementOptions(truth);
      const correct = options.find((o) => o.correct)!.display;
      const stem = `Which of the following statements are true?\n\n${built.map((b, i) => `${ROMAN[i]}. ${b.text}`).join('\n')}`;
      const solution = built.map((b, i) => `${ROMAN[i]} is ${b.truth ? 'true' : 'false'}: ${b.why}.`).join(' ');
      return {
        stem,
        answer: { kind: 'choice' as const, value: correct },
        options,
        solution,
        trap: 'A statement is false as soon as one counterexample exists — negative numbers and zero are the usual ones.',
        tags: ['algebra', 'statements', 'reasoning'],
        params: { level, statements: ids.map((id, i) => ({ id, args: built[i].args })) },
        typedAllowed: false,
      };
    });
  },
  verify(q) {
    if (q.answer.kind !== 'choice') return false;
    const { statements } = q.params as { statements: { id: string; args: number[] }[] };
    if (!Array.isArray(statements) || statements.length !== 3) return false;
    // Re-derive every truth value from the machine check, ignoring anything stored about it.
    const truth = statements.map((s) => {
      const def = DEF_BY_ID[s.id];
      if (!def) return null;
      return def.check(s.args);
    });
    if (truth.some((t) => t === null)) return false;
    const expected = comboText(truth as boolean[]);
    return STATEMENT_COMBOS.includes(expected) && q.answer.value === expected && q.options.filter((o) => o.correct).length === 1;
  },
});
