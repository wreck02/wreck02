import { defineTemplate, retry, type Level } from '../../core/template';
import { surd, E, squarefreeDecompose } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import type { RNG } from '../../core/rng';

/**
 * Simplify √n into a√b.
 * Level 1: √12, √18, √20, √50 … (n ≤ 50), or "given √32 = a√2, find a"
 * Level 2: n ≤ 100 (√72, √98, √52 = 2√13)
 * Level 3: 100 < n ≤ 200 (√147, √162, √180)
 * Level 4: a coefficient in front: 3√48, 2√75
 * Level 5: n ≤ 500 (√432 = 12√3) or a sum of two surds that combine (√8 + √50)
 *
 * Distractor policy. The structural mistakes carry the question: the square factor taken out
 * without square-rooting it, coefficient and radicand swapped, the right coefficient over the
 * wrong radicand, the root sign dropped, only half the square factor removed. At most ONE
 * "off by one in the coefficient" is ever offered, so the answer is never sitting in the middle
 * of a c − 1, c, c + 1 run with the same trap printed twice.
 *
 * The square-free part is allowed up to 30 above level 1 (√52 = 2√13, √68 = 2√17 and √117 = 3√13
 * are standard items); only the level-1 pool keeps the tight r ≤ 11 bound, and it is genuinely
 * small — there are just thirteen non-square n ≤ 50 — so it is widened by the stem shapes instead.
 */

/** Non-square n = s²·r with s ≥ 2 and 1 < r ≤ maxR, listed once. */
function candidates(min: number, max: number, maxR: number): number[] {
  const out: number[] = [];
  for (let n = min; n <= max; n++) {
    const [s, r] = squarefreeDecompose(n);
    if (s >= 2 && r > 1 && r <= maxR) out.push(n);
  }
  return out;
}

const POOLS: Record<Level, number[]> = {
  1: candidates(8, 50, 11),
  2: candidates(40, 100, 30),
  3: candidates(101, 200, 30),
  4: candidates(12, 100, 23),
  5: candidates(200, 500, 30),
};

/** The exam asks for the same thing in several ways; k > 1 only at level 4. */
function simplifyAsk(rng: RNG, n: number, k: number): string {
  const what = k === 1 ? `\\sqrt{${n}}` : `${k}\\sqrt{${n}}`;
  return rng.pick([
    `Write $${what}$ in the form $a\\sqrt{b}$, where $b$ is as small as possible.`,
    `Simplify $${what}$, giving your answer in the form $a\\sqrt{b}$.`,
    `Express $${what}$ in its simplest surd form.`,
    `Simplify $${what}$, giving your answer in surd form.`,
  ]);
}

export default defineTemplate({
  id: 'm1.surds.simplify-root',
  module: 'M1',
  topic: 'surds',
  title: 'Simplify √n',
  levels: {
    1: 'n ≤ 50: √12, √18, √20, √50, or "given √32 = a√2, find a"',
    2: 'n ≤ 100: √72, √98, √45, √52 = 2√13',
    3: '100 < n ≤ 200: √147, √162, √180',
    4: 'coefficient in front: 3√48, 2√75',
    5: 'n ≤ 500 (√432 = 12√3), or a sum of two surds that combine (√8 + √50)',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      const variant = level === 5 && rng.bool(0.5) ? 'sum' : level <= 2 && rng.bool(0.3) ? 'given' : 'single';

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
          { value: surd(r, s1 + s2 + (rng.bool() ? 1 : -1)), trap: 'arithmetic slip of one in a coefficient' },
          { value: surd(r, Math.abs(s1 - s2) || 1), trap: 'subtracted the coefficients instead of adding' },
          { value: surd(r * (s1 + s2)), trap: 'put the coefficient back under the root without squaring it' },
          { value: E((s1 + s2) * r), trap: 'dropped the root sign' },
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

      if (variant === 'given') {
        // "Given that √32 = a√2, find a": the same simplification, asked for the coefficient alone.
        const answer = E(s);
        const distractors: Distractor[] = [
          { value: E(s * s), trap: 'took the whole square factor outside without square-rooting it' },
          { value: E(s * r), trap: 'divided by the radicand instead of square-rooting the square factor' },
          { value: E(r), trap: 'gave the radicand b instead of a' },
          { value: E(s + (rng.bool() ? 1 : -1)), trap: 'off by one in the coefficient' },
          { value: E(2 * s), trap: 'doubled the coefficient' },
          { value: E(n), trap: 'gave the number under the root' },
        ];
        return {
          stem: ((v: string) => (rng.bool()
            ? `Given that $\\sqrt{${n}} = ${v}\\sqrt{${r}}$, find the value of $${v}$.`
            : `$\\sqrt{${n}}$ can be written as $${v}\\sqrt{${r}}$. Find the value of $${v}$.`))(rng.pick(['a', 'k'])),
          answer: { kind: 'exact' as const, value: answer },
          options: buildOptions(rng, answer, distractors),
          solution: `$${n} = ${s * s} \\times ${r}$, so $\\sqrt{${n}} = ${s}\\sqrt{${r}}$ and $a = ${s}$.`,
          trap: 'Only the square root of the square factor comes outside: a² × b = n, so a = √(n/b).',
          tags: ['surds', 'simplify'],
          params: { n, k: 1, r, s, variant },
          typedAllowed: true,
        };
      }

      const k = level === 4 ? rng.int(2, 5) : 1;
      const answer = surd(n, k); // k·s·√r
      const c = k * s; // the correct coefficient
      // Distractors on both sides of the answer so its size gives nothing away, and only one
      // coefficient slip of ±1 so the answer is never the middle of three consecutive coefficients.
      const otherR = rng.pick([2, 3, 5, 6, 7, 10, 11].filter((x) => x !== r));
      const distractors: Distractor[] = [
        { value: surd(r, k * s * s), trap: 'took the whole square factor outside without square-rooting it' },
        { value: surd(s, k * r), trap: 'coefficient and radicand swapped' },
        { value: surd(otherR, c), trap: 'right coefficient, wrong radicand left under the root' },
        { value: E(c * r), trap: 'dropped the root sign' },
        { value: surd(r, k * Math.max(1, Math.floor(s / 2))), trap: 'halved the square factor instead of square-rooting it' },
        { value: E(c), trap: 'gave only the number outside the root' },
        { value: surd(r, c + (rng.bool() ? 1 : -1)), trap: 'off by one in the coefficient' },
        ...(k > 1 ? [{ value: surd(r, s + k), trap: 'added the coefficient in front instead of multiplying by it' }] : []),
      ];
      const partial = s > 2 && s % 2 === 0 ? ` (Or spot $${n} = 4 \\times ${n / 4}$ first and keep going.)` : '';
      return {
        stem: simplifyAsk(rng, n, k),
        answer: { kind: 'exact' as const, value: answer },
        options: buildOptions(rng, answer, distractors),
        solution: `Look for the largest square factor: $${n} = ${s * s} \\times ${r}$, so $\\sqrt{${n}} = ${s}\\sqrt{${r}}$${k > 1 ? ` and $${k}\\sqrt{${n}} = ${c}\\sqrt{${r}}$` : ''}.${partial}`,
        trap: 'Only the square root of the square factor comes outside: √(s²r) = s√r, not s²√r.',
        tags: ['surds', 'simplify'],
        params: { n, k, r, s, variant },
        typedAllowed: true,
      };
    });
  },
  verify(q) {
    // Recompute numerically from the raw parameters, and insist the answer is fully simplified.
    const { n, k, n2, r, variant } = q.params as { n: number; k: number; n2?: number; r: number; variant: string };
    if (q.answer.kind !== 'exact') return false;
    const got = q.answer.value;
    if (variant === 'given') {
      // substitute back: a must be a positive integer with a²·b = n
      if (!got.isInteger()) return false;
      const a = got.toInt();
      return a > 0 && a * a * r === n;
    }
    const expected = variant === 'sum' ? Math.sqrt(n) + Math.sqrt(n2!) : k * Math.sqrt(n);
    if (Math.abs(got.toNumber() - expected) > 1e-9) return false;
    const t = got.terms;
    return t.length === 1 && squarefreeDecompose(t[0].r)[0] === 1;
  },
});
