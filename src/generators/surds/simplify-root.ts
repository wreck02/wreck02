import { defineTemplate, retry, type Level } from '../../core/template';
import { surd, E } from '../../core/exact';
import { buildOptions } from '../../core/options';
import { squarefreeDecompose } from '../../core/exact';

/**
 * Simplify √n into a√b.
 * Level 1: √12, √18, √20 (n = s²·r with s = 2 or 3)
 * Level 2: n up to 100 with s up to 5
 * Level 3: n up to 200, s up to 7, r up to 7
 * Level 4: k√n with a coefficient in front, e.g. 3√48
 * Level 5: √n with n up to 500 (e.g. √432 = 12√3) or a sum like √8 + √50
 */
export default defineTemplate({
  id: 'm1.surds.simplify-root',
  module: 'M1',
  topic: 'surds',
  title: 'Simplify √n',
  levels: {
    1: '√12, √18, √20 (one small square factor)',
    2: 'n ≤ 100, square factor up to 25',
    3: 'n ≤ 200, radicand up to 7',
    4: 'coefficient in front: 3√48, 2√75',
    5: 'n ≤ 500, or a sum of two surds that combine (√8 + √50)',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      const sMax = [2, 3, 5, 7, 6, 12][level];
      const rChoices = level <= 2 ? [2, 3, 5] : level <= 3 ? [2, 3, 5, 6, 7] : [2, 3, 5, 6, 7, 10, 11];
      const r = rng.pick(rChoices);
      const s = rng.int(2, sMax);
      const n = s * s * r;
      if (level <= 1 && n > 50) return null;
      if (level === 2 && n > 100) return null;
      if (level === 3 && (n > 200 || n <= 50)) return null;
      if (level >= 4 && n > 500) return null;
      const k = level === 4 ? rng.int(2, 5) : 1;
      const variant = level === 5 && rng.bool(0.5) ? 'sum' : 'single';

      if (variant === 'sum') {
        // √(s1² r) + √(s2² r) = (s1 + s2)√r
        const s2 = rng.intExcluding(2, 6, [s]);
        const n2 = s2 * s2 * r;
        const answer = surd(r, s + s2);
        const stem = `Simplify $\\sqrt{${n}} + \\sqrt{${n2}}$.`;
        const distractors = [
          { value: surd(n + n2), trap: 'added the radicands: √(a) + √(b) ≠ √(a + b)' },
          { value: surd(r * (s + s2)), trap: 'coefficient put inside the root without squaring it' },
          { value: surd(r, s * s2), trap: 'multiplied the coefficients instead of adding' },
          { value: surd(r, s + s2 + 1), trap: 'arithmetic slip in a coefficient' },
          { value: surd(r, Math.abs(s - s2) || 1), trap: 'subtracted instead of adding' },
        ];
        return {
          stem,
          answer: { kind: 'exact' as const, value: answer },
          options: buildOptions(rng, answer, distractors),
          solution: `$\\sqrt{${n}} = ${s}\\sqrt{${r}}$ and $\\sqrt{${n2}} = ${s2}\\sqrt{${r}}$, so the sum is $${s + s2}\\sqrt{${r}}$.`,
          trap: 'Surds only add once they share the same radicand; √a + √b is never √(a+b).',
          tags: ['surds', 'simplify', 'combine'],
          params: { n, n2, k: 1, r, s, s2, variant },
          typedAllowed: true,
        };
      }

      const answer = surd(n, k); // k·s·√r
      const stem = k === 1 ? `Write $\\sqrt{${n}}$ in the form $a\\sqrt{b}$ where $b$ is as small as possible.` : `Simplify $${k}\\sqrt{${n}}$, giving your answer in the form $a\\sqrt{b}$.`;
      const distractors = [
        { value: surd(r, k * s * s), trap: 'took the whole square factor outside without square-rooting it (s² instead of s)' },
        { value: surd(s, k * r), trap: 'swapped the parts: coefficient and radicand exchanged' },
        { value: surd(r, k * s + 1), trap: 'off-by-one in the coefficient' },
        { value: surd(r * (s > 2 ? 2 : 3), k * s / (s % 2 === 0 ? 2 : 1)), trap: 'only partially simplified: a square factor is still under the root' },
        { value: surd(n * k), trap: 'put the coefficient k under the root without squaring it' },
        { value: E(k * s).mul(E(r)), trap: 'dropped the root sign' },
      ];
      const partial = s > 2 && s % 2 === 0 ? `Alternatively spot $${n} = 4 \\times ${n / 4}$ first and keep going.` : '';
      return {
        stem,
        answer: { kind: 'exact' as const, value: answer },
        options: buildOptions(rng, answer, distractors),
        solution: `Look for the largest square factor: $${n} = ${s * s} \\times ${r}$, so $\\sqrt{${n}} = ${s}\\sqrt{${r}}$${k > 1 ? ` and $${k}\\sqrt{${n}} = ${k * s}\\sqrt{${r}}$` : ''}. ${partial}`.trim(),
        trap: 'Only the square root of the square factor comes outside: √(s²r) = s√r, not s²√r.',
        tags: ['surds', 'simplify'],
        params: { n, k, r, s, variant },
        typedAllowed: true,
      };
    });
  },
  verify(q) {
    // Recompute numerically from the raw parameters.
    const { n, k, n2, variant } = q.params as { n: number; k: number; n2?: number; variant: string };
    if (q.answer.kind !== 'exact') return false;
    const expected = variant === 'sum' ? Math.sqrt(n) + Math.sqrt(n2!) : k * Math.sqrt(n);
    if (Math.abs(q.answer.value.toNumber() - expected) > 1e-9) return false;
    // The answer must be fully simplified: its radicand must be square-free.
    const t = q.answer.value.terms;
    return t.length === 1 && squarefreeDecompose(t[0].r)[0] === 1;
  },
});
