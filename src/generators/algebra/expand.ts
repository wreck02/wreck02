import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, type Exact } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { factor, poly } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Expanding brackets: read off one coefficient of the product.
 * Level 1: (x + a)(x + b) — coefficient of x or the constant term
 * Level 2: (ax + b)(x + d) with a = 2 or 3 — coefficient of x
 * Level 3: (x + a)², (ax − b)² and (x + a)(x − a) — a coefficient or the constant
 * Level 4: (x + a)³ via the binomial expansion, or (x + a)(x + b)(x + c) — coefficient of x² or x
 * Level 5: (ax + b/x)² constant term, (x² + px + q)(x + r) or (ax + b)(x + c)(x + d) — coefficient of x or x²
 *
 * generate() computes each coefficient from the closed form (a + b, 2ab, 3a², q + pr …);
 * verify() multiplies the factors out by convolution and reads the coefficient off the product,
 * then double-checks the convolution against a direct numerical evaluation at x = 2 and x = 3.
 */

/** A Laurent polynomial as [power, coefficient] pairs (powers may be negative, for x + 1/x). */
type Terms = [number, number][];

function mulTerms(a: Terms, b: Terms): Terms {
  const m = new Map<number, number>();
  for (const [pa, ca] of a) for (const [pb, cb] of b) m.set(pa + pb, (m.get(pa + pb) ?? 0) + ca * cb);
  return [...m.entries()].filter(([, c]) => c !== 0).sort((u, v) => v[0] - u[0]);
}

function evalTerms(t: Terms, x: number): number {
  return t.reduce((s, [p, c]) => s + c * x ** p, 0);
}

/** Negative numbers in brackets inside a product: 2x × (−6). */
const par = (n: number) => (n < 0 ? `(${n})` : `${n}`);
const parX = (n: number) => (n === 1 ? 'x' : n === -1 ? '(-x)' : n < 0 ? `(${n}x)` : `${n}x`);

const NAME: Record<number, string> = { 0: 'the constant term', 1: 'the coefficient of $x$', 2: 'the coefficient of $x^2$', 3: 'the coefficient of $x^3$' };

type Variant = 'two-monic' | 'two-general' | 'square-monic' | 'square-general' | 'dots' | 'cube' | 'triple' | 'recip' | 'cubic-linear' | 'triple-general';

const VARIANTS: Record<Level, Variant[]> = {
  1: ['two-monic'],
  2: ['two-general'],
  3: ['square-monic', 'square-general', 'dots'],
  4: ['cube', 'triple'],
  5: ['recip', 'cubic-linear', 'triple-general'],
};

/** Integer distractors only, distinct from the answer; buildOptions handles the rest. */
function ints(ds: { value: number; trap: string }[], answer: number): Distractor[] {
  return ds.filter((d) => Number.isInteger(d.value) && d.value !== answer).map((d) => ({ value: E(d.value), trap: d.trap }));
}

/**
 * Offer a random mix of below- and above-answer distractors.
 *
 * Every candidate is still the result of a named mistake; this only decides which of them the
 * builder sees first (they are marked `must`), so the number of options larger than the answer
 * varies from question to question. Without it a fixed mistake set leaves the answer in the same
 * place in the sorted option list every time — "always the median", "never the largest" — and the
 * layout alone gives the answer away.
 */
function slant(rng: RNG, answer: Exact, ds: Distractor[], need = 4): Distractor[] {
  const below = ds.filter((d) => d.value.cmp(answer) < 0);
  const above = ds.filter((d) => d.value.cmp(answer) > 0);
  if (below.length === 0 || above.length === 0 || below.length + above.length < need) return ds;
  const want = rng.int(Math.max(0, need - below.length), Math.min(above.length, need));
  const pick = [...rng.shuffle(above).slice(0, want), ...rng.shuffle(below).slice(0, need - want)];
  return ds.map((d) => (pick.includes(d) ? { ...d, must: true } : d));
}

function ask(rng: RNG, expr: string, power: number): string {
  return rng.bool(0.5)
    ? `Find ${NAME[power]} in the expansion of $${expr}$.`
    : `When $${expr}$ is expanded, what is ${NAME[power]}?`;
}

function finish(rng: RNG, stem: string, answer: number, ds: { value: number; trap: string }[], solution: string, trap: string, tags: string[], factors: Terms[], power: number): Generated {
  return {
    stem,
    answer: { kind: 'exact', value: E(answer) },
    options: buildOptions(rng, E(answer), slant(rng, E(answer), ints(ds, answer))),
    solution,
    trap,
    tags: ['expand', ...tags],
    params: { factors, power, answer },
    typedAllowed: true,
  };
}

function lin(a: number, b: number): Terms {
  return a === 0 ? [[0, b]] : [[1, a], [0, b]];
}

function build(rng: RNG, variant: Variant): Generated | null {
  switch (variant) {
    case 'two-monic': {
      const both = rng.bool(0.4);
      const a = both ? rng.int(1, 7) : rng.nonZeroInt(-6, 6);
      const b = both ? rng.int(1, 7) : rng.nonZeroInt(-6, 6);
      if (a === b || a === -b) return null;
      const power = rng.bool(0.6) ? 1 : 0;
      const expr = `${factor(1, a)}${factor(1, b)}`;
      const answer = power === 1 ? a + b : a * b;
      const ds = power === 1
        ? [
          { value: a * b, trap: 'gave the constant term instead of the x coefficient' },
          { value: a * b + a + b, trap: 'added the constant term into the x coefficient' },
          { value: 2 * (a + b), trap: 'doubled the cross terms as in (x + a)²' },
          { value: a - b, trap: 'sign error in one cross term' },
          { value: b - a, trap: 'sign error in one cross term' },
          { value: -(a + b), trap: 'sign of both cross terms flipped' },
          { value: Math.abs(a) + Math.abs(b), trap: 'ignored the signs' },
          { value: 1, trap: 'read the x² coefficient' },
        ]
        : [
          { value: a + b, trap: 'gave the x coefficient instead of the constant' },
          { value: -a * b, trap: 'sign error multiplying the constants' },
          { value: Math.abs(a * b), trap: 'ignored the signs' },
          { value: a * b + a + b, trap: 'added the cross terms into the constant' },
          { value: 2 * a * b, trap: 'doubled the product as though it were a cross term' },
          { value: a * a, trap: 'squared the first number instead of multiplying the two' },
          { value: a - b, trap: 'subtracted the constants' },
        ];
      const sol = power === 1
        ? `Only the cross terms give $x$: $${b}x ${a < 0 ? '-' : '+'} ${Math.abs(a)}x = ${answer}x$.`
        : `The constant is the product of the constants: $${a} \\times ${b} = ${answer}$.`;
      return finish(rng, ask(rng, expr, power), answer, ds, sol, 'The x term collects both cross products, each with its own sign; the constant is just the product of the two numbers.', ['brackets'], [lin(1, a), lin(1, b)], power);
    }
    case 'two-general': {
      const a = rng.pick([2, 3]);
      const c = 1;
      const b = rng.nonZeroInt(-6, 6);
      const d = rng.nonZeroInt(-6, 6);
      const answer = a * d + b * c;
      if (answer === 0) return null;
      const expr = rng.bool(0.5) ? `${factor(a, b)}${factor(c, d)}` : `${factor(c, d)}${factor(a, b)}`;
      const ds = [
        { value: b * d, trap: 'gave the constant term' },
        { value: a * c, trap: 'gave the x² coefficient' },
        { value: a * d - b * c, trap: 'sign error in one cross term' },
        { value: b * c - a * d, trap: 'sign error in one cross term' },
        { value: a * d, trap: 'forgot the second cross term' },
        { value: b * c, trap: 'forgot the first cross term' },
        { value: b + d, trap: 'added the constants without multiplying by the x coefficients' },
      ];
      return finish(rng, ask(rng, expr, 1), answer, ds, `Cross terms: $${a}x \\times ${par(d)} + ${par(b)} \\times x = ${a * d}x ${b < 0 ? '-' : '+'} ${Math.abs(b)}x = ${answer}x$.`, 'Multiply outer and inner pairs (each with its sign) and add; do not mix in the constant product.', ['brackets'], [lin(a, b), lin(c, d)], 1);
    }
    case 'square-monic': {
      const a = rng.nonZeroInt(-9, 9);
      const power = rng.bool(0.6) ? 1 : 0;
      const expr = `${factor(1, a)}^2`;
      const answer = power === 1 ? 2 * a : a * a;
      const ds = power === 1
        ? [
          { value: 0, trap: 'wrote (x + a)² = x² + a² with no x term' },
          { value: a, trap: 'forgot to double the cross term' },
          { value: -2 * a, trap: 'sign error in the cross term' },
          { value: a * a, trap: 'gave the constant term' },
          { value: 2 * a * a, trap: 'doubled a² instead of doubling a' },
          { value: a * a + 2 * a, trap: 'added the constant term into the x coefficient' },
        ]
        : [
          { value: 2 * a, trap: 'gave the x coefficient' },
          { value: -a * a, trap: 'a negative squared is positive' },
          { value: a, trap: 'forgot to square' },
          { value: 2 * a * a, trap: 'doubled the constant as well' },
          { value: a * a + 2 * a, trap: 'added the cross term into the constant' },
        ];
      return finish(rng, ask(rng, expr, power), answer, ds, `$(x ${a < 0 ? '-' : '+'} ${Math.abs(a)})^2 = x^2 ${2 * a < 0 ? '-' : '+'} ${Math.abs(2 * a)}x + ${a * a}$.`, '(x + a)² has a middle term 2ax; it is never just x² + a².', ['perfect-square'], [lin(1, a), lin(1, a)], power);
    }
    case 'square-general': {
      const a = rng.pick([2, 3]);
      const b = rng.nonZeroInt(-6, 6);
      const power = rng.pick([1, 1, 2, 0]);
      const expr = `${factor(a, b)}^2`;
      const answer = power === 1 ? 2 * a * b : power === 2 ? a * a : b * b;
      const ds = power === 1
        ? [
          { value: a * b, trap: 'forgot to double the cross term' },
          { value: 2 * b, trap: 'forgot the factor a from the ax term' },
          { value: -2 * a * b, trap: 'sign error in the cross term' },
          { value: 0, trap: 'wrote (ax + b)² = a²x² + b² with no x term' },
          { value: b * b, trap: 'gave the constant term' },
          { value: a * a * b, trap: 'squared the wrong factor' },
        ]
        : power === 2
          ? [
            { value: a, trap: 'forgot to square the coefficient of x' },
            { value: 2 * a, trap: 'doubled instead of squaring' },
            { value: 2 * a * b, trap: 'gave the x coefficient' },
            { value: a * a * 2, trap: 'doubled the squared coefficient as well' },
            { value: b * b, trap: 'gave the constant term' },
          ]
          : [
            { value: 2 * a * b, trap: 'gave the x coefficient' },
            { value: -b * b, trap: 'a negative squared is positive' },
            { value: b, trap: 'forgot to square' },
            { value: 2 * b, trap: 'doubled instead of squaring' },
            { value: a * a, trap: 'gave the x² coefficient' },
          ];
      return finish(rng, ask(rng, expr, power), answer, ds, `$(${a}x ${b < 0 ? '-' : '+'} ${Math.abs(b)})^2 = ${a * a}x^2 ${2 * a * b < 0 ? '-' : '+'} ${Math.abs(2 * a * b)}x + ${b * b}$.`, 'In (ax + b)² the middle term is 2ab·x (double the product, including the a), and the first term is a²x².', ['perfect-square'], [lin(a, b), lin(a, b)], power);
    }
    case 'dots': {
      const a = rng.int(2, 12);
      const expr = rng.bool(0.5) ? `${factor(1, a)}${factor(1, -a)}` : `${factor(1, -a)}${factor(1, a)}`;
      // Asking for the x coefficient (which is 0, because the cross terms cancel) as well as the
      // constant keeps the answer off the bottom of the option list: −a² is smaller than every
      // other value a slip can produce except −2a².
      const power = rng.bool(0.35) ? 1 : 0;
      const answer = power === 1 ? 0 : -a * a;
      const ds = power === 1
        ? [
          { value: 2 * a, trap: 'added the two cross terms as though both were positive' },
          { value: -2 * a, trap: 'added the two cross terms as though both were negative' },
          { value: a, trap: 'used only one of the two cross terms' },
          { value: -a, trap: 'used only one of the two cross terms' },
          { value: -a * a, trap: 'gave the constant term instead of the x coefficient' },
          { value: a * a, trap: 'gave a² instead: the constant is −a² and the x terms cancel' },
        ]
        : [
          { value: a * a, trap: 'sign error: (x + a)(x − a) = x² − a²' },
          { value: -2 * a * a, trap: 'doubled the product as though it were a cross term' },
          { value: -2 * a, trap: 'gave −2a as though it were a cross term' },
          { value: 2 * a, trap: 'added the constants' },
          { value: -a, trap: 'forgot to square' },
          { value: 0, trap: 'gave the x coefficient (which is 0) instead of the constant' },
        ];
      const sol = power === 1
        ? `The cross terms are $+${a}x$ and $-${a}x$: they cancel, so the coefficient of $x$ is $0$.`
        : `Difference of two squares: $(x + ${a})(x - ${a}) = x^2 - ${a * a}$, so the constant is $${answer}$.`;
      return finish(rng, ask(rng, expr, power), answer, ds, sol, '(x + a)(x − a) = x² − a²: the cross terms cancel and the constant is negative.', ['difference-of-squares'], [lin(1, a), lin(1, -a)], power);
    }
    case 'cube': {
      const a = rng.nonZeroInt(-5, 5);
      const power = rng.bool(0.5) ? 2 : 1;
      const expr = `${factor(1, a)}^3`;
      const answer = power === 2 ? 3 * a : 3 * a * a;
      const ds = power === 2
        ? [
          { value: 2 * a, trap: 'used the expansion of the square' },
          { value: a, trap: 'forgot the binomial coefficient 3' },
          { value: 3 * a * a, trap: 'gave the x coefficient' },
          { value: -3 * a, trap: 'sign error' },
          { value: a * a * a, trap: 'gave the constant term' },
          { value: a * a, trap: 'squared instead of tripling' },
        ]
        : [
          { value: 3 * a, trap: 'gave the x² coefficient (forgot to square a)' },
          { value: a * a, trap: 'forgot the binomial coefficient 3' },
          { value: -3 * a * a, trap: 'a negative squared is positive' },
          { value: a * a + 3, trap: 'added the binomial coefficient instead of multiplying by it' },
          { value: a * a * a, trap: 'gave the constant term' },
          { value: 2 * a * a, trap: 'used 2 instead of 3' },
          { value: 6 * a * a, trap: 'used the row of Pascal\'s triangle for (x + a)⁴' },
        ];
      return finish(rng, ask(rng, expr, power), answer, ds, `Binomial: $(x + a)^3 = x^3 + 3ax^2 + 3a^2x + a^3$ with $a = ${a}$, so ${NAME[power]} is $${answer}$.`, 'The coefficients of (x + a)³ are 1, 3a, 3a², a³ — remember the 3 and that a² is positive.', ['binomial', 'cube'], [lin(1, a), lin(1, a), lin(1, a)], power);
    }
    case 'triple': {
      const a = rng.nonZeroInt(-5, 5), b = rng.nonZeroInt(-5, 5), c = rng.nonZeroInt(-5, 5);
      if (a === b || b === c || a === c) return null;
      const power = rng.bool(0.5) ? 2 : 1;
      const s1 = a + b + c, s2 = a * b + b * c + c * a, s3 = a * b * c;
      const answer = power === 2 ? s1 : s2;
      if (answer === 0) return null;
      const expr = `${factor(1, a)}${factor(1, b)}${factor(1, c)}`;
      const ds = [
        { value: power === 2 ? s2 : s1, trap: power === 2 ? 'gave the x coefficient' : 'gave the x² coefficient' },
        { value: s3, trap: 'gave the constant term' },
        { value: -answer, trap: 'sign error' },
        { value: power === 2 ? Math.abs(a) + Math.abs(b) + Math.abs(c) : Math.abs(a * b) + Math.abs(b * c) + Math.abs(c * a), trap: 'ignored the signs' },
        { value: power === 2 ? a + b : a * b, trap: 'only used two of the three brackets' },
        { value: power === 2 ? a * b + c : (a + b) * c, trap: 'mixed a product with a sum' },
      ];
      const sol = power === 2
        ? `For $(x+a)(x+b)(x+c)$ the $x^2$ coefficient is $a + b + c = ${a} ${b < 0 ? '-' : '+'} ${Math.abs(b)} ${c < 0 ? '-' : '+'} ${Math.abs(c)} = ${answer}$.`
        : `The $x$ coefficient is $ab + bc + ca = ${a * b} ${b * c < 0 ? '-' : '+'} ${Math.abs(b * c)} ${c * a < 0 ? '-' : '+'} ${Math.abs(c * a)} = ${answer}$.`;
      return finish(rng, ask(rng, expr, power), answer, ds, sol, 'x² collects the constants one at a time (a + b + c); x collects them two at a time (ab + bc + ca).', ['three-brackets'], [lin(1, a), lin(1, b), lin(1, c)], power);
    }
    case 'recip': {
      const a = rng.pick([1, 1, 2, 3]);
      const b = rng.pick([1, 2, 3, 4, 5]) * rng.sign();
      const answer = 2 * a * b;
      const bTex = Math.abs(b) === 1 ? '\\frac{1}{x}' : `\\frac{${Math.abs(b)}}{x}`;
      const expr = `\\left(${a === 1 ? '' : a}x ${b < 0 ? '-' : '+'} ${bTex}\\right)^2`;
      const ds = [
        { value: a * b, trap: 'forgot to double the cross term' },
        { value: 0, trap: 'wrote (p + q)² = p² + q² with no cross term' },
        { value: a * a + b * b, trap: 'added the squares' },
        { value: -2 * a * b, trap: 'sign error in the cross term' },
        { value: a * a, trap: 'gave the x² coefficient' },
        { value: b * b, trap: 'gave the coefficient of 1/x²' },
        // 4ab and (a + b)² sit on the far side of the answer from ab and 0, so a negative
        // constant term is not automatically the smallest option.
        { value: 4 * a * b, trap: 'doubled each of the two cross products: together they give 2ab, not 4ab' },
        { value: a * a + 2 * a * b + b * b, trap: 'added all three coefficients of the expansion instead of taking the constant term' },
      ];
      return finish(rng, `Find the constant term in the expansion of $${expr}$.`, answer, ds, `$(p + q)^2 = p^2 + 2pq + q^2$; the cross term $2 \\times ${a}x \\times ${bTex.replace('\\frac', '\\tfrac')}$ has the $x$ cancelling, leaving $${answer}$.`, 'The constant comes from the cross term 2·(ax)·(b/x) = 2ab, not from either square.', ['reciprocal', 'perfect-square'], [[[1, a], [-1, b]], [[1, a], [-1, b]]], 0);
    }
    case 'cubic-linear': {
      const p = rng.nonZeroInt(-4, 4), q = rng.nonZeroInt(-6, 6), r = rng.nonZeroInt(-4, 4);
      const power = rng.bool(0.6) ? 1 : 2;
      const answer = power === 1 ? q + p * r : p + r;
      if (answer === 0) return null;
      const expr = `(${poly([1, p, q])})${factor(1, r)}`;
      const ds = power === 1
        ? [
          { value: q, trap: 'forgot the px × r cross term' },
          { value: p * r, trap: 'forgot the q × x term' },
          { value: q - p * r, trap: 'sign error in the cross term' },
          { value: p + r, trap: 'gave the x² coefficient' },
          { value: q * r, trap: 'gave the constant term' },
          { value: p + q + r, trap: 'added all the coefficients' },
        ]
        : [
          { value: q + p * r, trap: 'gave the x coefficient' },
          { value: p * r, trap: 'multiplied instead of adding' },
          { value: p - r, trap: 'sign error' },
          { value: p, trap: 'forgot the x² × r term' },
          { value: r, trap: 'forgot the px × x term' },
          { value: q * r, trap: 'gave the constant term' },
        ];
      const sol = power === 1
        ? `$x$ terms: $${par(q)} \\times x$ and $${p}x \\times ${par(r)}$, giving $${q} ${p * r < 0 ? '-' : '+'} ${Math.abs(p * r)} = ${answer}$.`
        : `$x^2$ terms: $x^2 \\times ${par(r)}$ and $${p}x \\times x$, giving $${r} ${p < 0 ? '-' : '+'} ${Math.abs(p)} = ${answer}$.`;
      return finish(rng, ask(rng, expr, power), answer, ds, sol, 'Each power collects two products: pick out exactly the pairs of terms whose powers add to the one you want.', ['cubic'], [[[2, 1], [1, p], [0, q]], lin(1, r)], power);
    }
    case 'triple-general': {
      const a = rng.pick([2, 3]);
      const b = rng.nonZeroInt(-4, 4), c = rng.nonZeroInt(-4, 4), d = rng.nonZeroInt(-4, 4);
      if (c === d) return null;
      const power = rng.bool(0.5) ? 2 : 1;
      const x2 = a * (c + d) + b;
      const x1 = a * c * d + b * (c + d);
      const answer = power === 2 ? x2 : x1;
      if (answer === 0) return null;
      const expr = `${factor(a, b)}${factor(1, c)}${factor(1, d)}`;
      const ds = [
        { value: power === 2 ? x1 : x2, trap: power === 2 ? 'gave the x coefficient' : 'gave the x² coefficient' },
        { value: -answer, trap: 'sign error' },
        { value: power === 2 ? c + d + b : c * d + b * (c + d), trap: 'ignored the coefficient a of x' },
        { value: power === 2 ? a * (c + d) : a * c * d, trap: 'forgot the terms involving b' },
        { value: b * c * d, trap: 'gave the constant term' },
        { value: power === 2 ? a * (c + d) - b : a * c * d - b * (c + d), trap: 'sign error in the b terms' },
      ];
      const sol = `Expand $${factor(1, c)}${factor(1, d)} = ${poly([1, c + d, c * d])}$ first, then multiply by $${factor(a, b)}$: ` +
        (power === 2 ? `$x^2$ terms are $${a}x \\times ${parX(c + d)}$ and $${par(b)} \\times x^2$, giving $${answer}$.` : `$x$ terms are $${a}x \\times ${par(c * d)}$ and $${par(b)} \\times ${parX(c + d)}$, giving $${answer}$.`);
      return finish(rng, ask(rng, expr, power), answer, ds, sol, 'Expand the two monic brackets first, then pick the two products from the third bracket that give the power you want.', ['three-brackets'], [lin(a, b), lin(1, c), lin(1, d)], power);
    }
  }
  return null;
}

export default defineTemplate({
  id: 'm1.algebra.expand',
  module: 'M1',
  topic: 'algebra',
  title: 'Expanding brackets',
  levels: {
    1: '(x + a)(x + b): coefficient of x or the constant',
    2: '(2x + 3)(x − 4): coefficient of x',
    3: '(x + a)², (2x − b)², (x + a)(x − a)',
    4: '(x + a)³ by the binomial expansion, or three linear brackets',
    5: '(x + 1/x)² constant term, (x² + px + q)(x + r), (2x + b)(x + c)(x + d)',
  },
  generate(rng, level: Level) {
    const variant = rng.pick(VARIANTS[level]);
    return retry(rng, () => build(rng, variant));
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const { factors, power } = q.params as { factors: Terms[]; power: number };
    // Multiply out by convolution and read off the requested coefficient.
    const product = factors.reduce((acc, f) => mulTerms(acc, f), [[0, 1]] as Terms);
    const coef = product.find(([p]) => p === power)?.[1] ?? 0;
    if (!q.answer.value.isInteger() || q.answer.value.toInt() !== coef) return false;
    // Sanity: the convolution must agree with evaluating the factors directly.
    for (const x of [2, 3]) {
      const direct = factors.reduce((acc, f) => acc * evalTerms(f, x), 1);
      if (Math.abs(direct - evalTerms(product, x)) > 1e-9 * Math.max(1, Math.abs(direct))) return false;
    }
    return true;
  },
});
