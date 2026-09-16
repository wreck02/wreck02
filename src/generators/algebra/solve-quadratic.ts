import { defineTemplate, retry, type Level } from '../../core/template';
import { E, frac } from '../../core/exact';
import { buildSetOptions } from '../../core/options';
import { poly } from '../../core/gen-utils';

/**
 * Solve a factorisable quadratic by inspection.
 * Level 1: x² + bx + c = 0 with small positive integer roots
 * Level 2: integer roots of either sign
 * Level 3: leading coefficient 2 or 3, one fractional root
 * Level 4: leading coefficient up to 6, both roots fractional, equation not yet rearranged (= k on the right)
 * Level 5: disguised: given in expanded product form like (x+1)(x+4) = 10, or coefficients larger
 */
export default defineTemplate({
  id: 'm1.algebra.solve-quadratic',
  module: 'M1',
  topic: 'algebra',
  title: 'Solve a factorisable quadratic',
  levels: {
    1: 'x² + bx + c = 0, roots small positive integers',
    2: 'integer roots of either sign, |root| ≤ 9',
    3: 'leading coefficient 2 or 3, one fractional root',
    4: 'ax² + bx + c = k with a ≤ 6, both roots fractional',
    5: 'disguised form (x + p)(x + q) = k needing expansion first',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      // roots r1 = p1/q1, r2 = p2/q2 ; equation (q1 x - p1)(q2 x - p2) = 0
      let q1 = 1, q2 = 1, p1: number, p2: number;
      if (level === 1) { p1 = rng.int(1, 6); p2 = rng.int(1, 6); }
      else if (level === 2) { p1 = rng.nonZeroInt(-9, 9); p2 = rng.nonZeroInt(-9, 9); }
      else if (level === 3) { q1 = rng.pick([2, 3]); p1 = rng.pick([-5, -3, -1, 1, 3, 5, 7].filter((v) => v % q1 !== 0)); p2 = rng.nonZeroInt(-6, 6); }
      else { q1 = rng.pick([2, 3]); q2 = rng.pick(level === 4 ? [1, 2, 3] : [2, 3]); p1 = rng.pick([-7, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 7].filter((v) => v % q1 !== 0)); p2 = rng.pick([-7, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 7].filter((v) => q2 === 1 || v % q2 !== 0)); }
      if (p1 / q1 === p2 / q2) return null;
      const a = q1 * q2;
      const b = -(q1 * p2 + q2 * p1);
      const c = p1 * p2;
      if (Math.abs(b) > 40 || Math.abs(c) > 60) return null;
      const roots = [frac(p1, q1), frac(p2, q2)];
      const disguised = level === 5 && q1 === 1 && q2 === 1;
      let stem: string;
      let k = 0;
      if (level === 4) {
        k = rng.pick([-6, -4, -3, -2, 2, 3, 4, 6, 8]);
        stem = `Solve $${poly([a, b, c - k])} = ${k}$.`;
      } else if (disguised) {
        // (x + m)(x + n) = k  where expanding gives x² + (m+n)x + mn - k = x² + bx + c
        const m = rng.int(-6, 6);
        const n = b - m; // (x+m)(x+n) = x² + (m+n)x + mn ; need m + n = b
        k = m * n - c;
        if (k === 0 || Math.abs(k) > 40) return null;
        stem = `Solve $(x ${m >= 0 ? '+' : '-'} ${Math.abs(m)})(x ${n >= 0 ? '+' : '-'} ${Math.abs(n)}) = ${k}$.`;
      } else {
        stem = `Solve $${poly([a, b, c])} = 0$.`;
      }
      const solution = `${level === 4 || disguised ? `Rearrange to $${poly([a, b, c])} = 0$. ` : ''}Factorise: $(${poly([q1, -p1])})(${poly([q2, -p2])}) = 0$, so $x = ${roots[0].toLatex()}$ or $x = ${roots[1].toLatex()}$.` +
        (a === 1 ? ` (Two numbers with product $${c}$ and sum $${b}$: $${-p1}$ and $${-p2}$.)` : '');
      const distractors = [
        { values: [roots[0].neg(), roots[1].neg()], trap: 'sign error: read the roots off the factors with the wrong sign' },
        { values: [roots[0], roots[1].neg()], trap: 'one sign flipped' },
        { values: [frac(q1, p1), frac(q2, p2)].filter((v) => Number.isFinite(v.toNumber())), trap: 'fractions inverted (q/p instead of p/q)' },
        { values: [E(-p1), E(-p2)], trap: 'ignored the leading coefficient' },
        { values: [frac(p1, q1).add(E(1)), frac(p2, q2).add(E(1))], trap: 'off by one' },
        { values: [E(p1 * q2), E(p2 * q1)], trap: 'multiplied instead of divided' },
      ];
      return {
        stem,
        answer: { kind: 'set' as const, values: roots },
        options: buildSetOptions(rng, roots, distractors),
        solution,
        trap: 'The roots are the values that make each bracket zero, so (qx − p) gives x = p/q, not −p/q or q/p.',
        tags: ['quadratics', 'factorise', 'solve'],
        params: { a, b, c, k, level },
        typedAllowed: true,
      };
    });
  },
  verify(q) {
    if (q.answer.kind !== 'set') return false;
    const { a, b, c } = q.params as { a: number; b: number; c: number };
    // Substitute each root back into ax² + bx + c = 0 and check there are two distinct roots.
    const vals = q.answer.values;
    if (vals.length !== 2 || vals[0].equals(vals[1])) return false;
    return vals.every((x) => E(a).mul(x).mul(x).add(E(b).mul(x)).add(E(c)).isZero());
  },
});
