import { defineTemplate, retry, type Level } from '../../core/template';
import { surd, E, squarefreeDecompose } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';

/**
 * Simplify √n into a√b.
 * Level 1: √12, √18, √20, √50 … (n ≤ 50)
 * Level 2: n ≤ 100 (√72, √98, √45)
 * Level 3: 100 < n ≤ 200 (√147, √162, √180)
 * Level 4: a coefficient in front: 3√48, 2√75
 * Level 5: n ≤ 500 (√432 = 12√3) or a sum of two surds that combine (√8 + √50)
 */

/** Non-square n = s²·r with s ≥ 2, r square-free > 1, listed once. */
function candidates(min: number, max: number): number[] {
  const out: number[] = [];
  for (let n = min; n <= max; n++) {
    const [s, r] = squarefreeDecompose(n);
    if (s >= 2 && r > 1 && r <= 11) out.push(n);
  }
  return out;
}

const POOLS: Record<Level, number[]> = {
  1: candidates(8, 50),
  2: candidates(40, 100),
  3: candidates(101, 200),
  4: candidates(12, 100),
  5: candidates(200, 500),
};

export default defineTemplate({
  id: 'm1.surds.simplify-root',
  module: 'M1',
  topic: 'surds',
  title: 'Simplify √n',
  levels: {
    1: 'n ≤ 50: √12, √18, √20, √50',
    2: 'n ≤ 100: √72, √98, √45',
    3: '100 < n ≤ 200: √147, √162, √180',
    4: 'coefficient in front: 3√48, 2√75',
    5: 'n ≤ 500 (√432 = 12√3), or a sum of two surds that combine (√8 + √50)',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      const variant = level === 5 && rng.bool(0.5) ? 'sum' : 'single';

      if (variant === 'sum') {
        // √(s1² r) + √(s2² r) = (s1 + s2)√r
        const r = rng.pick([2, 3, 5, 6, 7]);
        const s1 = rng.int(2, 6);
        const s2 = rng.intExcluding(2, 7, [s1]);
        const n = s1 * s1 * r, n2 = s2 * s2 * r;
        if (n > 300 || n2 > 300) return null;
        const answer = surd(r, s1 + s2);
        const distractors: Distractor[] = [
          { value: surd(n + n2), trap: 'added the radicands: √a + √b is not √(a + b)' },
          { value: surd(r, s1 * s2), trap: 'multiplied the coefficients instead of adding them' },
          { value: surd(r, s1 + s2 + 1), trap: 'arithmetic slip of one in a coefficient' },
          { value: surd(r, s1 + s2 - 1), trap: 'arithmetic slip of one in a coefficient' },
          { value: surd(r, Math.abs(s1 - s2) || 1), trap: 'subtracted the coefficients instead of adding' },
          { value: surd(r * (s1 + s2)), trap: 'put the coefficient back under the root without squaring it' },
        ];
        return {
          stem: `Simplify $\\sqrt{${n}} + \\sqrt{${n2}}$.`,
          answer: { kind: 'exact' as const, value: answer },
          options: buildOptions(rng, answer, distractors),
          solution: `$\\sqrt{${n}} = ${s1}\\sqrt{${r}}$ and $\\sqrt{${n2}} = ${s2}\\sqrt{${r}}$, so the sum is $${s1 + s2}\\sqrt{${r}}$.`,
          trap: 'Surds only add once they share the same radicand; √a + √b is never √(a + b).',
          tags: ['surds', 'simplify', 'combine'],
          params: { n, n2, k: 1, r, s: s1, s2, variant },
          typedAllowed: true,
        };
      }

      const n = rng.pick(POOLS[level]);
      const [s, r] = squarefreeDecompose(n);
      const k = level === 4 ? rng.int(2, 5) : 1;
      const answer = surd(n, k); // k·s·√r
      const stem = k === 1
        ? `Write $\\sqrt{${n}}$ in the form $a\\sqrt{b}$, where $b$ is as small as possible.`
        : `Simplify $${k}\\sqrt{${n}}$, giving your answer in the form $a\\sqrt{b}$.`;
      // Distractors on both sides of the answer so its size gives nothing away.
      const otherR = rng.pick([2, 3, 5, 6, 7].filter((x) => x !== r));
      const distractors: Distractor[] = [
        { value: surd(r, k * s * s), trap: 'took the whole square factor outside without square-rooting it' },
        { value: surd(r, k * s + 1), trap: 'off by one in the coefficient' },
        { value: surd(r, Math.max(1, k * s - 1)), trap: 'off by one in the coefficient' },
        { value: surd(s, k * r), trap: 'coefficient and radicand swapped' },
        { value: surd(otherR, k * s), trap: 'right coefficient, wrong radicand left under the root' },
        { value: E(k * s * r), trap: 'dropped the root sign' },
        { value: surd(r, k * Math.max(1, Math.floor(s / 2))), trap: 'halved the square factor instead of square-rooting it' },
      ];
      const partial = s > 2 && s % 2 === 0 ? ` (Or spot $${n} = 4 \\times ${n / 4}$ first and keep going.)` : '';
      return {
        stem,
        answer: { kind: 'exact' as const, value: answer },
        options: buildOptions(rng, answer, distractors),
        solution: `Look for the largest square factor: $${n} = ${s * s} \\times ${r}$, so $\\sqrt{${n}} = ${s}\\sqrt{${r}}$${k > 1 ? ` and $${k}\\sqrt{${n}} = ${k * s}\\sqrt{${r}}$` : ''}.${partial}`,
        trap: 'Only the square root of the square factor comes outside: √(s²r) = s√r, not s²√r.',
        tags: ['surds', 'simplify'],
        params: { n, k, r, s, variant },
        typedAllowed: true,
      };
    });
  },
  verify(q) {
    // Recompute numerically from the raw parameters, and insist the answer is fully simplified.
    const { n, k, n2, variant } = q.params as { n: number; k: number; n2?: number; variant: string };
    if (q.answer.kind !== 'exact') return false;
    const expected = variant === 'sum' ? Math.sqrt(n) + Math.sqrt(n2!) : k * Math.sqrt(n);
    if (Math.abs(q.answer.value.toNumber() - expected) > 1e-9) return false;
    const t = q.answer.value.terms;
    return t.length === 1 && squarefreeDecompose(t[0].r)[0] === 1;
  },
});
