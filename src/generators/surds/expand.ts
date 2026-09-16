import { defineTemplate, retry, type Level } from '../../core/template';
import { E, surd, Exact } from '../../core/exact';
import { squarefreeDecompose } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { gcd } from '../../core/gen-utils';

/**
 * Expand brackets with surds.
 * Level 1: √a × √b (√3 × √12 = 6, √2 × √6 = 2√3) and (k√a)² = k²a with k ≥ 2
 * Level 2: (a ± √b)² = a² + b ± 2a√b                       (2 + √3)² = 7 + 4√3
 * Level 3: (a + √b)(a − √b) = a² − b, (√a + √b)(√a − √b) = a − b
 * Level 4: (√a ± √b)² with √(ab) simplifying, or (a + p√b)(c + q√b)
 * Level 5: (p√a ± q√b)² such as (2√3 − √2)², or (a ± √b)³ such as (1 + √2)³ = 7 + 5√2
 */

/** A sum of terms c√r written as [c, r] pairs (r = 1 means a rational term). JSON-friendly. */
type Terms = [number, number][];

function toExact(ts: Terms): Exact {
  return ts.reduce((acc, [c, r]) => acc.add(r === 1 ? E(c) : surd(r, c)), Exact.ZERO);
}

function toFloat(ts: Terms): number {
  return ts.reduce((acc, [c, r]) => acc + c * Math.sqrt(r), 0);
}

/** LaTeX in the order given: [[2,1],[-1,3]] → "2 - \sqrt{3}", [[2,3],[-1,2]] → "2\sqrt{3} - \sqrt{2}". */
function tex(ts: Terms): string {
  let out = '';
  for (const [c, r] of ts) {
    if (c === 0) continue;
    const mag = Math.abs(c);
    const body = r === 1 ? `${mag}` : `${mag === 1 ? '' : mag}\\sqrt{${r}}`;
    if (out === '') out = (c < 0 ? '-' : '') + body;
    else out += (c < 0 ? ' - ' : ' + ') + body;
  }
  return out || '0';
}

const br = (ts: Terms) => `(${tex(ts)})`;
const sq = (ts: Terms) => `(${tex(ts)})^2`;

/** Keep only distractors that would pass the clean-number rule (never show an ugly option). */
function cleanOnly(ds: { value: Exact | null; trap: string }[]): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } => d.value !== null && isCleanExact(d.value).ok && Number.isFinite(d.value.toNumber()));
}

const SQF_SMALL = [2, 3, 5, 6, 7, 10, 11];
/** The radicands that actually appear on the paper. */
const SQF_EXAM = [2, 3, 5, 6, 7, 10, 11, 13, 15];

export default defineTemplate({
  id: 'm1.surds.expand',
  module: 'M1',
  topic: 'surds',
  title: 'Expand brackets with surds',
  levels: {
    1: '√a × √b and (k√a)² with k ≥ 2: √3 × √12, (2√3)²',
    2: '(a ± √b)²: (2 + √3)² = 7 + 4√3',
    3: '(a + √b)(a − √b) and (√a + √b)(√a − √b): an integer',
    4: '(√a ± √b)² with √(ab) simplifying, or (a + p√b)(c + q√b)',
    5: '(p√a ± q√b)² such as (2√3 − √2)², or (a ± √b)³ such as (1 + √2)³',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      const pack = (stem: string, answer: Exact, distractors: Distractor[], solution: string, trap: string, form: string, factors: Terms[], power: number, tags: string[]) => {
        if (!isCleanExact(answer).ok) return null;
        return {
          stem,
          answer: { kind: 'exact' as const, value: answer },
          options: buildOptions(rng, answer, distractors),
          solution,
          trap,
          tags: ['surds', 'expand', ...tags],
          params: { level, form, factors, power },
          typedAllowed: true,
        };
      };

      // ------------------------------------------------------------------ level 1
      if (level === 1) {
        if (rng.bool(0.6)) {
          // √a × √b with b = a·m (m ≥ 2, so never √a × √a) so the product simplifies
          const a = rng.pick([2, 3, 5, 6, 7]);
          const m = rng.weighted([2, 3, 4, 5, 6, 8, 9], [3, 3, 3, 1, 1, 1, 2]);
          const b = a * m;
          if (b > 50 || Math.round(Math.sqrt(b)) ** 2 === b) return null;
          const [x, y] = rng.bool() ? [a, b] : [b, a];
          const answer = surd(x * y);
          const [s, r] = squarefreeDecompose(x * y);
          const distractors = cleanOnly([
            { value: E(x * y), trap: 'multiplied the radicands but dropped the root sign' },
            { value: surd(x + y), trap: 'added the radicands: √a × √b = √(ab), not √(a + b)' },
            { value: E(x + y), trap: 'added the radicands and dropped the root' },
            { value: surd(x).add(surd(y)), trap: 'added the surds instead of multiplying them' },
            { value: s > 1 && r > 1 ? surd(r, s * s) : null, trap: 'took the square factor outside without square-rooting it' },
            { value: surd(y, x), trap: 'treated √a × √b as a√b' },
            { value: answer.mulRat(2), trap: 'arithmetic slip: doubled the result' },
          ]);
          const route = r === 1
            ? `\\sqrt{${x}}\\times\\sqrt{${y}} = \\sqrt{${x * y}} = ${answer.toLatex()}`
            : `\\sqrt{${x}}\\times\\sqrt{${y}} = \\sqrt{${x * y}} = \\sqrt{${s * s}\\times ${r}} = ${answer.toLatex()}`;
          return pack(
            `Simplify $\\sqrt{${x}} \\times \\sqrt{${y}}$.`,
            answer, distractors,
            `Multiply under one root sign: $${route}$.`,
            '√a × √b = √(ab): multiply the radicands, then take out the largest square factor. Never add radicands.',
            'product', [[[1, x]], [[1, y]]], 1, ['multiply'],
          );
        }
        // (k√a)² with k ≥ 2 ((√5)² alone is too slight even for a warm-up)
        const a = rng.pick([2, 3, 5, 6, 7, 10]);
        const k = rng.weighted([2, 3, 4, 5], [3, 3, 2, 1]);
        const answer = E(k * k * a);
        const distractors = cleanOnly([
          { value: E(k * a), trap: 'forgot to square the coefficient k' },
          { value: surd(a, k * k), trap: 'squared the coefficient but left the root in place' },
          { value: E(k * k * a * a), trap: 'squared the radicand as well: (√a)² = a, not a²' },
          { value: E(k * a * a), trap: 'squared the radicand instead of the coefficient' },
          { value: surd(a, 2 * k), trap: 'doubled instead of squaring' },
          { value: E(2 * k * a), trap: 'doubled the coefficient instead of squaring it' },
          { value: E(k * k + a), trap: `treated ${k}√${a} as ${k} + √${a} and squared each part` },
        ]);
        return pack(
          `Simplify $${sq([[k, a]])}$.`,
          answer, distractors,
          `Square both parts: $(${k}\\sqrt{${a}})^2 = ${k}^2 \\times (\\sqrt{${a}})^2 = ${k * k} \\times ${a} = ${answer.toLatex()}$.`,
          '(k√a)² = k² × a: square the coefficient and the root separately; (√a)² is a, not a².',
          'square', [[[k, a]]], 2, ['square'],
        );
      }

      // ------------------------------------------------------------------ level 2: (a ± √b)²
      if (level === 2) {
        const a = rng.int(1, 5);
        const b = rng.pick(SQF_SMALL);
        const s = rng.sign();
        const f: Terms = [[a, 1], [s, b]];
        const answer = toExact(f).pow(2); // a² + b + 2as√b
        const distractors = cleanOnly([
          { value: E(a * a + b), trap: 'missing cross term: (a + √b)² is not a² + b' },
          { value: E(a * a + b).add(surd(b, s * a)), trap: 'cross term written as a√b instead of 2a√b' },
          { value: E(a * a - b).add(surd(b, 2 * s * a)), trap: 'sign error: (√b)² = +b' },
          { value: E(a * a + b).add(surd(b, -2 * s * a)), trap: 'sign of the cross term wrong' },
          { value: E(a + b).add(surd(b, 2 * s * a)), trap: 'forgot to square a' },
          { value: E(a * a + b * b).add(surd(b, 2 * s * a)), trap: 'squared the radicand: (√b)² = b, not b²' },
        ]);
        const stem = rng.bool(0.5)
          ? `Expand and simplify $${sq(f)}$.`
          : `Express $${sq(f)}$ in the form $p + q\\sqrt{${b}}$, where $p$ and $q$ are integers.`;
        return pack(
          stem, answer, distractors,
          `$(x + y)^2 = x^2 + 2xy + y^2$: $${sq(f)} = ${a * a} ${s > 0 ? '+' : '-'} 2 \\times ${a}\\sqrt{${b}} + ${b} = ${answer.toLatex()}$.`,
          'Do not forget the middle term 2a√b, and remember (√b)² = b, so the rational part is a² + b.',
          'square', [f], 2, ['square'],
        );
      }

      // ------------------------------------------------------------------ level 3: difference of two squares
      if (level === 3) {
        if (rng.bool(0.6)) {
          // (a + k√b)(a − k√b) = a² − k²b
          const a = rng.int(1, 9);
          const k = rng.bool(0.3) ? rng.pick([2, 3]) : 1;
          const b = rng.pick(k === 1 ? SQF_EXAM : SQF_SMALL);
          if (a * a === k * k * b) return null;
          const s = rng.sign();
          const f1: Terms = [[a, 1], [s * k, b]];
          const f2: Terms = [[a, 1], [-s * k, b]];
          const answer = E(a * a - k * k * b);
          const distractors = cleanOnly([
            { value: E(a * a + k * k * b), trap: 'sign error: (√b)(−√b) = −b' },
            { value: E(k * k * b - a * a), trap: 'sign of the whole answer flipped' },
            { value: E(a - k * k * b), trap: 'forgot to square a' },
            { value: k > 1 ? E(a * a - k * b) : E(a * a).sub(surd(b, k * k)), trap: k > 1 ? 'forgot to square the coefficient of √b' : 'did not square the √b' },
            { value: E(a * a - k * k * b).add(surd(b, 2 * s * k * a)), trap: 'kept a cross term: the ±√b terms cancel' },
            { value: E(a * a + k * k * b).add(surd(b, 2 * s * k * a)), trap: 'squared the bracket instead of multiplying by its conjugate' },
          ]);
          return pack(
            rng.bool(0.5) ? `Expand and simplify $${br(f1)}${br(f2)}$.` : `Find the value of $${br(f1)}${br(f2)}$.`,
            answer, distractors,
            `Difference of two squares: $${br(f1)}${br(f2)} = ${a}^2 - (${k === 1 ? '' : k}\\sqrt{${b}})^2 = ${a * a} - ${k * k * b} = ${answer.toLatex()}$.`,
            'Conjugate pairs give a² − b: the cross terms cancel and (√b)² = b, so the answer is an integer.',
            'conjugate', [f1, f2], 1, ['conjugate', 'difference-of-squares'],
          );
        }
        // (√a + √b)(√a − √b) = a − b, with √(ab) simple enough that the "kept a cross term" slips are showable
        const [a, b] = rng.pickDistinct(SQF_EXAM, 2);
        if (squarefreeDecompose(a * b)[1] > 97) return null;
        const s = rng.sign();
        const f1: Terms = [[1, a], [s, b]];
        const f2: Terms = [[1, a], [-s, b]];
        const answer = E(a - b);
        const distractors = cleanOnly([
          { value: E(a + b), trap: 'sign error: (√b)(−√b) = −b' },
          { value: E(b - a), trap: 'sign of the whole answer flipped' },
          { value: E(a - b).add(surd(a * b, 2 * s)), trap: 'kept a cross term: the ±√(ab) terms cancel' },
          { value: E(a + b).add(surd(a * b, 2 * s)), trap: 'squared the bracket instead of multiplying by its conjugate' },
          { value: E(a * a - b * b), trap: 'squared a and b instead of √a and √b' },
          { value: surd(Math.abs(a - b)).mulRat(a > b ? 1 : -1), trap: 'left the root sign on: (√a)² = a' },
        ]);
        return pack(
          rng.bool(0.5) ? `Expand and simplify $${br(f1)}${br(f2)}$.` : `Find the value of $${br(f1)}${br(f2)}$.`,
          answer, distractors,
          `Difference of two squares: $(\\sqrt{${a}})^2 - (\\sqrt{${b}})^2 = ${a} - ${b} = ${answer.toLatex()}$.`,
          'Conjugate pairs give (√a)² − (√b)² = a − b: no cross terms, no roots left.',
          'conjugate', [f1, f2], 1, ['conjugate', 'difference-of-squares'],
        );
      }

      // ------------------------------------------------------------------ level 4
      if (level === 4) {
        if (rng.bool(0.5)) {
          // (√a ± √b)² where ab has a square factor
          const [a, b] = rng.pickDistinct([2, 3, 5, 6, 7, 10, 14, 15], 2);
          if (gcd(a, b) === 1) return null;
          const s = rng.sign();
          const f: Terms = [[1, a], [s, b]];
          const answer = toExact(f).pow(2);
          const [sf, r] = squarefreeDecompose(a * b);
          const distractors = cleanOnly([
            { value: E(a + b), trap: 'missing cross term: (√a + √b)² is not a + b' },
            { value: E(a + b).add(surd(a * b, s)), trap: 'cross term written as √(ab) instead of 2√(ab)' },
            { value: E(a + b).add(surd(a * b, -2 * s)), trap: 'sign of the cross term wrong' },
            { value: E(a + b).add(surd(a + b, 2 * s)), trap: 'wrote √a × √b as √(a + b)' },
            { value: E(a * a + b * b).add(surd(a * b, 2 * s)), trap: 'squared the radicands: (√a)² = a' },
            { value: E(a + b + 2 * s * a * b), trap: 'dropped the root from the cross term' },
          ]);
          const stem = rng.bool(0.5)
            ? `Expand and simplify $${sq(f)}$.`
            : `Express $${sq(f)}$ in the form $p + q\\sqrt{${r}}$, where $p$ and $q$ are integers.`;
          return pack(
            stem, answer, distractors,
            `$${sq(f)} = ${a} + ${b} ${s > 0 ? '+' : '-'} 2\\sqrt{${a * b}}$, and $\\sqrt{${a * b}} = \\sqrt{${sf * sf} \\times ${r}} = ${sf}\\sqrt{${r}}$, so the answer is $${answer.toLatex()}$.`,
            'The cross term is 2√a√b = 2√(ab), which usually simplifies further; do not leave √(ab) unsimplified or forget the 2.',
            'square', [f], 2, ['square'],
          );
        }
        // (a + p√b)(c + q√b)
        const b = rng.pick([2, 3, 5, 6, 7]);
        const a = rng.int(1, 5);
        const c = rng.int(1, 5);
        const p = rng.sign() * rng.weighted([1, 2], [3, 1]);
        const q = rng.sign() * rng.weighted([1, 2], [3, 1]);
        if (a === c && p === -q) return null; // that is level 3
        const f1: Terms = [[a, 1], [p, b]];
        const f2: Terms = [[c, 1], [q, b]];
        const answer = toExact(f1).mul(toExact(f2)); // ac + pqb + (aq + cp)√b
        const cross = a * q + c * p;
        if (cross === 0) return null; // the √b terms would cancel: not an expanding question
        const distractors = cleanOnly([
          { value: E(a * c + p * q * b), trap: 'forgot the cross terms' },
          { value: E(a * c).add(surd(b, cross + p * q)), trap: 'wrote √b × √b = √b instead of b' },
          { value: E(a * c - p * q * b).add(surd(b, cross)), trap: 'sign error on the b term' },
          { value: E(a * c + p * q * b).add(surd(b, a * p + c * q)), trap: 'paired the wrong numbers in the cross terms' },
          { value: E(a + c).add(surd(b, p + q)), trap: 'added the brackets instead of multiplying' },
          { value: Math.abs(p) + Math.abs(q) > 2 ? E(a * c + Math.sign(p * q) * b).add(surd(b, a * Math.sign(q) + c * Math.sign(p))) : null, trap: 'ignored the coefficients of the surds' },
          { value: E(a * c + p * q * b).add(surd(b, -cross)), trap: 'sign of the cross term wrong' },
        ]);
        const stem = rng.bool(0.5)
          ? `Expand and simplify $${br(f1)}${br(f2)}$.`
          : `Express $${br(f1)}${br(f2)}$ in the form $p + q\\sqrt{${b}}$, where $p$ and $q$ are integers.`;
        return pack(
          stem, answer, distractors,
          `Four products: $${a} \\times ${c} = ${a * c}$, the two cross terms give $${tex([[cross, b]])}$, and $${tex([[p, b]])} \\times ${q < 0 ? br([[q, b]]) : tex([[q, b]])} = ${p * q * b}$. Total $${answer.toLatex()}$.`,
          'Multiply all four pairs: the outer and inner products combine into one √b term, and √b × √b = b (a rational number).',
          'binomials', [f1, f2], 1, ['binomial'],
        );
      }

      // ------------------------------------------------------------------ level 5
      if (rng.bool(0.5)) {
        // (p√a ± q√b)²
        const [a, b] = rng.pickDistinct([2, 3, 5, 6, 7, 10], 2);
        const p = rng.pick([1, 2, 3]);
        const q = rng.pick([1, 2, 3]);
        if (p === 1 && q === 1) return null;
        if (p * p * a + q * q * b > 99) return null;
        const s = rng.sign();
        const f: Terms = [[p, a], [s * q, b]];
        const answer = toExact(f).pow(2);
        const [, r] = squarefreeDecompose(a * b);
        const rational = p * p * a + q * q * b;
        const distractors = cleanOnly([
          { value: E(rational), trap: 'missing cross term' },
          { value: E(rational).add(surd(a * b, s * p * q)), trap: 'cross term missing its factor of 2' },
          { value: E(rational).add(surd(a * b, -2 * s * p * q)), trap: 'sign of the cross term wrong' },
          { value: E(p * a + q * b).add(surd(a * b, 2 * s * p * q)), trap: 'forgot to square the coefficients' },
          { value: E(p * p * a * a + q * q * b * b).add(surd(a * b, 2 * s * p * q)), trap: 'squared the radicands as well' },
          { value: E(rational).add(surd(a + b, 2 * s * p * q)), trap: 'wrote √a × √b as √(a + b)' },
        ]);
        const stem = rng.bool(0.5)
          ? `Expand and simplify $${sq(f)}$.`
          : `Express $${sq(f)}$ in the form $m + n\\sqrt{${r}}$, where $m$ and $n$ are integers.`;
        return pack(
          stem, answer, distractors,
          `$(${tex([[p, a]])})^2 = ${p * p * a}$, $(${tex([[q, b]])})^2 = ${q * q * b}$ and the cross term is $2 \\times ${tex([[p, a]])} \\times ${s < 0 ? br([[s * q, b]]) : tex([[s * q, b]])} = ${tex([[2 * s * p * q, a * b]])}${r === a * b ? '' : ` = ${surd(a * b, 2 * s * p * q).toLatex()}`}$, giving $${answer.toLatex()}$.`,
          'Square each term (coefficient squared times radicand) and add twice the product; simplify √(ab) at the end.',
          'square', [f], 2, ['square'],
        );
      }
      // (a ± √b)³
      const a = rng.pick([1, 1, 2, 3]);
      const b = rng.pick([2, 3, 5, 6, 7]);
      const s = rng.sign();
      const f: Terms = [[a, 1], [s, b]];
      const answer = toExact(f).pow(3); // (a³ + 3ab) + s(3a² + b)√b
      const R = a ** 3 + 3 * a * b;
      const S = 3 * a * a + b;
      const square = toExact(f).pow(2);
      const distractors = cleanOnly([
        { value: E(a ** 3).add(surd(b, s * b)), trap: 'cubed each term separately: (x + y)³ ≠ x³ + y³' },
        { value: square, trap: 'only squared the bracket' },
        { value: E(R).add(surd(b, -s * S)), trap: 'sign of the surd term wrong' },
        { value: E(a ** 3 + 2 * a * b).add(surd(b, s * (2 * a * a + b))), trap: 'used binomial coefficients 1, 2, 2, 1 instead of 1, 3, 3, 1' },
        { value: E(R).add(surd(b, s * (3 * a * a + 1))), trap: 'treated (√b)³ as √b instead of b√b' },
        { value: E(a ** 3 + b).add(surd(b, s * 3 * a * a)), trap: 'lost the 3ab and b√b terms' },
      ]);
      const stem = rng.bool(0.5)
        ? `Expand and simplify $(${tex(f)})^3$.`
        : `Express $(${tex(f)})^3$ in the form $p + q\\sqrt{${b}}$, where $p$ and $q$ are integers.`;
      return pack(
        stem, answer, distractors,
        `First $${sq(f)} = ${square.toLatex()}$, then multiply by $${br(f)}$ again: $(${square.toLatex()})${br(f)} = ${answer.toLatex()}$. (Or use $a^3 + 3a^2\\sqrt{b} + 3ab + b\\sqrt{b}$.)`,
        'Cube via square-then-multiply, or 1, 3, 3, 1; remember (√b)² = b and (√b)³ = b√b.',
        'cube', [f], 3, ['cube'],
      );
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const { factors, power } = q.params as { factors: Terms[]; power: number };
    // Floating-point evaluation straight from the raw brackets.
    const product = factors.reduce((acc, f) => acc * toFloat(f), 1);
    const expected = Math.pow(product, power);
    const got = q.answer.value.toNumber();
    if (!Number.isFinite(expected) || Math.abs(got - expected) > 1e-9 * Math.max(1, Math.abs(expected))) return false;
    // Fully simplified: at most two terms (rational + one surd), every radicand square-free.
    return q.answer.value.terms.length <= 2 && q.answer.value.terms.every((t) => squarefreeDecompose(t.r)[0] === 1 && t.k === 0);
  },
});
