import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, type Exact } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { gcd, signed } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Factorising and the difference of two squares.
 * Level 1: numeric DOTS, 101² − 99² = (101 − 99)(101 + 99) = 400, or 7.5² − 2.5² (kind 'exact')
 * Level 2: x² + bx + c = (x + p)(x + q) (kind 'choice', sign-swapped and wrong-pair distractors)
 * Level 3: ax² + bx + c = (ax + b)(cx + d) with a leading coefficient (kind 'choice')
 * Level 4: 4x² − 9, 9x² − 25y² (kind 'choice'); or 102 × 98 = 100² − 2² mentally (kind 'exact')
 * Level 5: x⁴ − 16 or 2x² − 8 factorised fully (kind 'choice'); or √(65² − 16²) = 63 (kind 'exact')
 *
 * A factorised form is k · Π (polynomial)^e, stored structurally in params. generate() builds the
 * expanded polynomial from the roots by formula; verify() evaluates the chosen form at three
 * points with its own evaluator and compares with the polynomial, and checks every wrong form
 * disagrees somewhere so that the correct option is unique.
 */

type Factor = { c: number[]; e: number }; // coefficients highest power first, exponent
type Form = { k: number; f: Factor[]; y: boolean }; // k · Π (poly)^e; y: homogeneous in x and y

/** Polynomial in x (or homogeneous in x, y) as LaTeX. */
function polyXY(c: number[], y: boolean): string {
  const n = c.length - 1;
  let s = '';
  c.forEach((coef, i) => {
    if (coef === 0) return;
    const px = n - i, py = y ? i : 0;
    const sym = (px === 0 ? '' : px === 1 ? 'x' : `x^{${px}}`) + (py === 0 ? '' : py === 1 ? 'y' : `y^{${py}}`);
    s += signed(coef, sym, s === '');
  });
  return s === '' ? '0' : s;
}

function cmpFactor(a: Factor, b: Factor): number {
  if (a.c.length !== b.c.length) return a.c.length - b.c.length;
  for (let i = 0; i < a.c.length; i++) if (a.c[i] !== b.c[i]) return a.c[i] - b.c[i];
  return a.e - b.e;
}

/** Canonical rendering: factors sorted, so equal forms always give equal strings. */
function render(form: Form): string {
  const fs = form.f.slice().sort(cmpFactor);
  const k = form.k === 1 ? '' : form.k === -1 ? '-' : `${form.k}`;
  const body = fs.map((f) => {
    const inner = polyXY(f.c, form.y);
    const isX = f.c.length === 2 && f.c[0] === 1 && f.c[1] === 0;
    const base = isX ? 'x' : `(${inner})`;
    return f.e === 1 ? base : `${base}^{${f.e}}`;
  }).join('');
  return `$${k}${body}$`;
}

function evalPolyXY(c: number[], y: boolean, x: number, yv: number): number {
  const n = c.length - 1;
  return c.reduce((s, coef, i) => s + coef * x ** (n - i) * (y ? yv ** i : 1), 0);
}

function evalForm(form: Form, x: number, yv: number): number {
  return form.f.reduce((p, f) => p * evalPolyXY(f.c, form.y, x, yv) ** f.e, form.k);
}

const POINTS: [number, number][] = [[2, 1], [3, 2], [5, 3], [7, 2]];

function sameFn(a: Form, b: Form): boolean {
  return POINTS.every(([x, y]) => Math.abs(evalForm(a, x, y) - evalForm(b, x, y)) < 1e-9);
}

function F(k: number, f: [number[], number?][], y = false): Form {
  return { k, f: f.map(([c, e]) => ({ c, e: e ?? 1 })), y };
}

type Variant = 'numeric-dots' | 'monic-quad' | 'general-quad' | 'dots-x' | 'numeric-product' | 'quartic' | 'common-dots' | 'numeric-root';

const VARIANTS: Record<Level, Variant[]> = {
  1: ['numeric-dots'],
  2: ['monic-quad'],
  3: ['general-quad'],
  4: ['dots-x', 'dots-x', 'numeric-product'],
  5: ['quartic', 'common-dots', 'numeric-root'],
};

/** Primitive Pythagorean-style triples (a, b, c) with c² − b² = a² and c − b, c + b easy to spot. */
const ROOT_TRIPLES: [number, number, number][] = [
  [3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29], [9, 40, 41], [12, 35, 37], [11, 60, 61], [16, 63, 65], [33, 56, 65], [13, 84, 85], [36, 77, 85], [28, 45, 53], [48, 55, 73], [39, 80, 89], [65, 72, 97],
];

function choice(rng: RNG, stem: string, poly: number[], y: boolean, form: Form, wrong: { form: Form; trap: string }[], solution: string, trap: string, tags: string[], extra: Record<string, unknown> = {}): Generated | null {
  const correct = render(form);
  const distinct = wrong.filter((w) => !sameFn(w.form, form));
  let options;
  try { options = buildChoiceOptions(rng, correct, distinct.map((w) => ({ display: render(w.form), trap: w.trap }))); } catch { return null; }
  const shown = distinct.filter((w) => options.some((o) => o.display === render(w.form)));
  return {
    stem,
    answer: { kind: 'choice', value: correct },
    options,
    solution,
    trap,
    tags: ['factorise', ...tags],
    params: { kind: 'choice', poly, y, form, wrong: shown.map((w) => w.form), ...extra },
    typedAllowed: false,
  };
}

function clean(ds: Distractor[]): Distractor[] {
  return ds.filter((d) => Number.isFinite(d.value.toNumber()) && isCleanExact(d.value).ok);
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
  const free = need - ds.filter((d) => d.must).length;
  const rest = ds.filter((d) => !d.must);
  const below = rest.filter((d) => d.value.cmp(answer) < 0);
  const above = rest.filter((d) => d.value.cmp(answer) > 0);
  if (free < 1 || below.length === 0 || above.length === 0 || below.length + above.length < free) return ds;
  const hi = rng.int(Math.max(0, free - below.length), Math.min(above.length, free));
  const pick = [...rng.shuffle(above).slice(0, hi), ...rng.shuffle(below).slice(0, free - hi)];
  return ds.map((d) => (d.must || pick.includes(d) ? { ...d, must: true } : d));
}

function num(x: number): string {
  return Number.isInteger(x) ? `${x}` : `${Number(x.toFixed(2))}`;
}

function build(rng: RNG, variant: Variant): Generated | null {
  switch (variant) {
    case 'numeric-dots': {
      // a² − b² with a = m + k, b = m − k: (a − b)(a + b) = 2k · 2m
      const decimal = rng.bool(0.2);
      const m = decimal ? rng.pick([5, 10, 15, 20]) : rng.pick([10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100]);
      const k = decimal ? rng.pick([1.5, 2.5, 3.5]) : rng.int(1, 6);
      const a = m + k, b = m - k;
      if (b <= 0) return null;
      const answer = E(a).mul(E(a)).sub(E(b).mul(E(b)));
      if (!answer.isInteger() && !isCleanExact(answer).ok) return null;
      // Every distractor is a wrong way of finishing (a − b)(a + b) = 2k × 2m, and stays within a
      // small factor of the answer: 2k or (a − b)² are one or two orders of magnitude out, so a
      // candidate who can bound the answer at roughly 2a(a − b) discards them without any work.
      const nearSquare = !decimal && (m + k) * (m + k) <= 48 * k * m;
      const ds = clean([
        { value: E(8 * k * m), trap: 'doubled the product' },
        { value: E(2 * k * (2 * m + 2 * k)), trap: 'used a + a for the second bracket instead of a + b' },
        { value: E(2 * k * (2 * m - 2 * k)), trap: 'used b + b for the second bracket instead of a + b' },
        { value: E(2 * k * (m + k)), trap: 'multiplied a − b by a instead of by a + b' },
        { value: E(2 * k * m), trap: 'used k instead of 2k for a − b' },
        { value: E(2 * k + 2 * m), trap: 'added the two brackets instead of multiplying them' },
        ...(nearSquare ? [
          { value: E(a * a - b), trap: 'forgot to square b' },
          { value: E(a * a), trap: 'squared a but never subtracted b²' },
        ] : []),
      ]);
      return {
        stem: `Evaluate $${num(a)}^2 - ${num(b)}^2$.`,
        answer: { kind: 'exact', value: answer },
        options: buildOptions(rng, answer, slant(rng, answer, ds)),
        solution: `Difference of two squares: $${num(a)}^2 - ${num(b)}^2 = (${num(a)} - ${num(b)})(${num(a)} + ${num(b)}) = ${num(2 * k)} \\times ${num(2 * m)} = ${answer.toLatex()}$.`,
        trap: 'a² − b² = (a − b)(a + b): a quick product, not (a − b)², and not just a + b.',
        tags: ['factorise', 'difference-of-squares', 'numeric'],
        params: { kind: 'exact', variant, a, b },
        typedAllowed: true,
      };
    }
    case 'monic-quad': {
      const p = rng.nonZeroInt(-7, 7), q = rng.nonZeroInt(-7, 7);
      if (p === q || p === -q) return null;
      const s = p + q, c = p * q;
      const poly = [1, s, c];
      const form = F(1, [[[1, p]], [[1, q]]]);
      const wrong: { form: Form; trap: string }[] = [
        { form: F(1, [[[1, -p]], [[1, -q]]]), trap: 'both signs swapped' },
        { form: F(1, [[[1, p]], [[1, -q]]]), trap: 'one sign swapped' },
        { form: F(1, [[[1, -p]], [[1, q]]]), trap: 'one sign swapped' },
        { form: F(1, [[[1, s]], [[1, c]]]), trap: 'used the coefficients themselves as the numbers in the brackets' },
      ];
      // pairs with the right product but the wrong sum
      for (let u = 1; u * u <= Math.abs(c); u++) {
        if (c % u !== 0) continue;
        const v = c / u;
        for (const [uu, vv] of [[u, v], [-u, -v]]) {
          if (uu + vv !== s) wrong.push({ form: F(1, [[[1, uu]], [[1, vv]]]), trap: 'right product, wrong sum' });
        }
      }
      // a pair with the right sum but the wrong product
      for (const u of [1, 2, 3, -1, -2, -3]) {
        const v = s - u;
        if (v === 0 || u === v || u === p || u === q) continue;
        wrong.push({ form: F(1, [[[1, u]], [[1, v]]]), trap: 'right sum, wrong product' });
        break;
      }
      return choice(rng, `Factorise $${polyXY(poly, false)}$.`, poly, false, form, wrong,
        `Two numbers with product $${c}$ and sum $${s}$: $${p}$ and $${q}$, so $${polyXY(poly, false)} = ${render(form).replace(/\$/g, '')}$.`,
        'The numbers in the brackets multiply to the constant and add to the x coefficient, signs included.', ['quadratic']);
    }
    case 'general-quad': {
      const [a, c] = rng.pick([[2, 1], [2, 1], [3, 1], [2, 3], [5, 1], [4, 1]]);
      const b = rng.nonZeroInt(-5, 5), d = rng.nonZeroInt(-5, 5);
      if (gcd(a, b) !== 1 || gcd(c, d) !== 1) return null;
      const poly = [a * c, a * d + b * c, b * d];
      if (poly[1] === 0) return null;
      const form = F(1, [[[a, b]], [[c, d]]]);
      const wrong = [
        { form: F(1, [[[a, d]], [[c, b]]]), trap: 'constants in the wrong brackets' },
        { form: F(1, [[[a, -b]], [[c, -d]]]), trap: 'both signs swapped' },
        { form: F(1, [[[a, b]], [[c, -d]]]), trap: 'one sign swapped' },
        { form: F(1, [[[a, -b]], [[c, d]]]), trap: 'one sign swapped' },
        { form: F(1, [[[a * c, b]], [[1, d]]]), trap: 'whole leading coefficient put in one bracket' },
        { form: F(1, [[[a * c, d]], [[1, b]]]), trap: 'whole leading coefficient put in one bracket' },
      ];
      return choice(rng, `Factorise $${polyXY(poly, false)}$.`, poly, false, form, wrong,
        `Look for $(${a}x + \\square)(${c === 1 ? '' : c}x + \\square)$ with constants multiplying to $${b * d}$: check the cross terms $${a}x \\times (${d}) + (${b}) \\times ${c === 1 ? '' : c}x = ${poly[1]}x$. So $${render(form).replace(/\$/g, '')}$.`,
        'With a leading coefficient, check the outer + inner products give the middle term; swapping the constants between the brackets changes it.', ['quadratic']);
    }
    case 'dots-x': {
      const y = rng.bool(0.4);
      const a = y ? rng.int(1, 5) : rng.pick([2, 3, 4, 5]);
      const b = rng.int(y ? 2 : 1, 9);
      if (gcd(a, b) !== 1 || (a === 1 && b === 1)) return null;
      const poly = [a * a, 0, -b * b];
      const form = F(1, [[[a, -b]], [[a, b]]], y);
      const wrong = [
        { form: F(1, [[[a, -b], 2]], y), trap: 'wrote a² − b² as (a − b)²' },
        { form: F(1, [[[a, b], 2]], y), trap: 'wrote a² − b² as (a + b)²' },
        { form: F(1, [[[a * a, -b]], [[1, b]]], y), trap: 'split the x² coefficient unevenly' },
        { form: F(1, [[[a, -b * b]], [[a, b * b]]], y), trap: 'forgot to square-root the constant' },
        { form: F(1, [[[a * a, -b]], [[a * a, b]]], y), trap: 'forgot to square-root the x² coefficient' },
        { form: F(1, [[[a, -b]], [[1, b]]], y), trap: 'dropped the coefficient from one bracket' },
      ];
      return choice(rng, `Factorise $${polyXY(poly, y)}$.`, poly, y, form, wrong,
        `Both terms are squares: $${polyXY(poly, y)} = (${a === 1 ? '' : a}x)^2 - (${b}${y ? 'y' : ''})^2 = ${render(form).replace(/\$/g, '')}$.`,
        'a² − b² = (a − b)(a + b): square-root both terms, and use opposite signs.', ['difference-of-squares']);
    }
    case 'numeric-product': {
      const decimal = rng.bool(0.2);
      const c = decimal ? rng.pick([2, 3, 4, 5, 10]) : rng.pick([20, 30, 40, 50, 60, 70, 80, 90, 100]);
      const k = decimal ? 0.5 : rng.pick([1, 2, 2, 3, 3, 4, 5]);
      const m = c + k, n = c - k;
      const answer = E(m).mul(E(n));
      if (!isCleanExact(answer).ok) return null;
      const ds = clean([
        { value: E(c * c), trap: 'forgot to subtract k²' },
        { value: E(c * c + k * k), trap: 'added k² instead of subtracting' },
        { value: E(c * c - k), trap: 'subtracted k instead of k²' },
        { value: E(c * c - 2 * k), trap: 'subtracted 2k instead of k²' },
        { value: E(c * c - 2 * k * k), trap: 'subtracted 2k² instead of k²' },
        { value: E(c * c - 4 * k * k), trap: 'subtracted (m − n)² instead of k²' },
        { value: E(c * n), trap: 'multiplied c by the smaller number instead of using c² − k²' },
        { value: E(n * n), trap: 'squared the smaller number' },
      ]);
      return {
        stem: `Evaluate $${num(m)} \\times ${num(n)}$ without a calculator.`,
        answer: { kind: 'exact', value: answer },
        options: buildOptions(rng, answer, slant(rng, answer, ds)),
        solution: `$${num(m)} \\times ${num(n)} = (${num(c)} + ${num(k)})(${num(c)} - ${num(k)}) = ${num(c)}^2 - ${num(k)}^2 = ${num(c * c)} - ${num(k * k)} = ${answer.toLatex()}$.`,
        trap: 'Write the numbers as c ± k; the product is c² − k² (subtract k², not k or 2k).',
        tags: ['factorise', 'difference-of-squares', 'numeric'],
        params: { kind: 'exact', variant, m, n },
        typedAllowed: true,
      };
    }
    case 'quartic': {
      // (bx)⁴ − a⁴ = (b²x² + a²)(bx − a)(bx + a)
      const b = rng.pick([1, 1, 2, 3]);
      const a = rng.pick([1, 2, 3, 4, 5]);
      if (gcd(a, b) !== 1 || (a === 1 && b === 1 && rng.bool(0.5))) return null;
      const poly = [b ** 4, 0, 0, 0, -(a ** 4)];
      const form = F(1, [[[b * b, 0, a * a]], [[b, -a]], [[b, a]]]);
      const wrong = [
        { form: F(1, [[[b * b, 0, a * a]], [[b, -a], 2]]), trap: 'wrote the difference of squares as a square' },
        { form: F(1, [[[b * b, 0, -a * a]], [[b, -a]], [[b, a]]]), trap: 'sign error in the quadratic factor' },
        { form: F(1, [[[b, -a], 2], [[b, a], 2]]), trap: 'factorised x⁴ − a⁴ as (x² − a²)²' },
        { form: F(1, [[[b * b, 0, a * a]], [[b, -a * a]], [[b, a * a]]]), trap: 'did not square-root the constant a second time' },
        { form: F(1, [[[b * b, 0, a * a], 2]]), trap: 'treated x⁴ − a⁴ as (x² + a²)²' },
        { form: F(1, [[[b * b, 0, -a * a]], [[b * b, 0, a * a]]]), trap: 'stopped before factorising the second difference of squares' },
      ];
      return choice(rng, `Factorise $${polyXY(poly, false)}$ fully.`, poly, false, form, wrong,
        `Difference of two squares twice: $${polyXY(poly, false)} = (${polyXY([b * b, 0, -a * a], false)})(${polyXY([b * b, 0, a * a], false)})$, and $${polyXY([b * b, 0, -a * a], false)}$ factorises again. The sum of squares does not factorise.`,
        'x⁴ − a⁴ is a difference of squares whose first factor x² − a² factorises again; x² + a² does not.', ['difference-of-squares', 'quartic']);
    }
    case 'common-dots': {
      // k(bx − a)(bx + a) from k b² x² − k a²
      const k = rng.pick([2, 2, 3, 3, 5, 6, 7, 10]);
      const b = rng.pick([1, 1, 2, 3]);
      const a = rng.pick([1, 2, 3, 4, 5, 6]);
      if (gcd(a, b) !== 1 || (b === 1 && a === 1)) return null;
      const poly = [k * b * b, 0, -k * a * a];
      if (poly[0] > 50 || -poly[2] > 100) return null;
      const form = F(k, [[[b, -a]], [[b, a]]]);
      const wrong = [
        { form: F(1, [[[b, -a]], [[b, a]]]), trap: 'dropped the common factor' },
        { form: F(k, [[[b, -a], 2]]), trap: 'wrote the difference of squares as a square' },
        { form: F(1, [[[k * b, -a]], [[k * b, a]]]), trap: 'took the common factor inside both brackets' },
        { form: F(k, [[[b, -a * a]], [[b, a * a]]]), trap: 'forgot to square-root the constant' },
        { form: F(k, [[[b * b, -a]], [[1, a]]]), trap: 'split the x² coefficient unevenly' },
        { form: F(1, [[[k * b, -k * a]], [[b, a]]]), trap: 'common factor left inside one bracket' },
      ];
      return choice(rng, `Factorise $${polyXY(poly, false)}$ fully.`, poly, false, form, wrong,
        `Take out the common factor first: $${polyXY(poly, false)} = ${k}(${polyXY([b * b, 0, -a * a], false)})$, then the bracket is a difference of two squares: $${render(form).replace(/\$/g, '')}$.`,
        'Take out the common factor before the difference of two squares; "fully" means both steps.', ['difference-of-squares', 'common-factor']);
    }
    case 'numeric-root': {
      const [small, large, c] = rng.pick(ROOT_TRIPLES);
      // Either leg may be the one subtracted, which doubles the pool of stems and stops the
      // answer sitting in the same place in the ordering every time.
      const big = rng.bool(0.5);
      const b = big ? small : large, a = big ? large : small;
      const answer = E(a);
      const ds = clean([
        { value: E(c - b), trap: 'treated √(c² − b²) as c − b' },
        { value: E(2 * (c - b)), trap: 'doubled c − b' },
        { value: E(b), trap: 'gave the number already squared in the question' },
        { value: E(c), trap: 'gave c, the number the root is just below' },
        { value: E(c + b), trap: 'gave c + b instead of √((c − b)(c + b))' },
        { value: E((c - b) * (c + b)), trap: 'forgot to take the square root' },
        // when c − b is a perfect square so is c + b: √(c−b)·√(c+b) is the fast route, and
        // adding the two roots instead of multiplying them lands close to the answer
        ...(Number.isInteger(Math.sqrt(c - b))
          ? [
            { value: E(Math.sqrt(c - b) + Math.sqrt(c + b)), trap: 'added √(c − b) and √(c + b) instead of multiplying them' },
            // c, c + b and (c − b)(c + b) all sit above the answer; rooting only one factor
            // sits below it, so the answer is not stuck near the bottom of the ordering.
            { value: E(Math.sqrt(c - b)), trap: 'took the root of the first factor only' },
          ]
          : []),
        ...(Number.isInteger(Math.sqrt(c + b)) ? [{ value: E(Math.sqrt(c + b)), trap: 'took the root of the second factor only' }] : []),
      ]);
      return {
        stem: `Evaluate $\\sqrt{${c}^2 - ${b}^2}$.`,
        answer: { kind: 'exact', value: answer },
        options: buildOptions(rng, answer, slant(rng, answer, ds)),
        solution: `$${c}^2 - ${b}^2 = (${c} - ${b})(${c} + ${b}) = ${c - b} \\times ${c + b}$, and $\\sqrt{${c - b} \\times ${c + b}} = \\sqrt{${c - b}} \\times \\sqrt{${c + b}} = ${Math.round(Math.sqrt(c - b)) === Math.sqrt(c - b) ? `${Math.sqrt(c - b)} \\times ${Math.sqrt(c + b)}` : `\\sqrt{${a * a}}`} = ${a}$.`,
        trap: 'Factorise inside the root as (c − b)(c + b) rather than squaring both numbers; √(c² − b²) is not c − b.',
        tags: ['factorise', 'difference-of-squares', 'numeric', 'roots'],
        params: { kind: 'exact', variant, b, c },
        typedAllowed: true,
      };
    }
  }
}

export default defineTemplate({
  id: 'm1.algebra.factorise',
  module: 'M1',
  topic: 'algebra',
  title: 'Factorising and difference of two squares',
  levels: {
    1: 'numeric DOTS: 101² − 99², 7.5² − 2.5²',
    2: 'x² + bx + c → (x + p)(x + q)',
    3: '2x² + 7x + 3 → (2x + 1)(x + 3)',
    4: '4x² − 9, 9x² − 25y²; or 102 × 98 by DOTS',
    5: 'x⁴ − 16 or 2x² − 8 fully; or √(65² − 16²)',
  },
  generate(rng, level: Level) {
    const variant = rng.pick(VARIANTS[level]);
    return retry(rng, () => build(rng, variant));
  },
  verify(q) {
    const p = q.params as { kind: string; variant?: string; poly?: number[]; y?: boolean; form?: Form; wrong?: Form[]; a?: number; b?: number; c?: number; m?: number; n?: number };
    if (q.answer.kind === 'choice') {
      if (!p.poly || !p.form || !p.wrong) return false;
      const { poly, y, form } = p;
      const fits = (f: Form) => POINTS.every(([x, yv]) => Math.abs(evalForm(f, x, yv) - evalPolyXY(poly, !!y, x, yv)) < 1e-9);
      if (!fits(form)) return false;
      if (p.wrong.some(fits)) return false;
      // fully factorised: every linear factor is primitive and the leading constant carries the common factor
      if (form.f.some((f) => f.c.length === 2 && gcd(f.c[0], f.c[1]) !== 1)) return false;
      return q.answer.value === render(form) && q.options.filter((o) => o.correct).length === 1;
    }
    if (q.answer.kind !== 'exact') return false;
    const got = q.answer.value.toNumber();
    let expected: number;
    if (p.variant === 'numeric-dots') expected = p.a! * p.a! - p.b! * p.b!;
    else if (p.variant === 'numeric-product') expected = p.m! * p.n!;
    else if (p.variant === 'numeric-root') expected = Math.sqrt(p.c! * p.c! - p.b! * p.b!);
    else return false;
    return Math.abs(got - expected) < 1e-9 && (p.variant !== 'numeric-root' || q.answer.value.isInteger());
  },
});

