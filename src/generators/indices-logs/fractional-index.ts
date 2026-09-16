import { defineTemplate, retry, type Level } from '../../core/template';
import { E, frac, Exact, rat, ratToDecimalString } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { gcd } from '../../core/gen-utils';

/**
 * Evaluate a^(p/q) without a calculator.
 * Level 1: 8^(1/3), 25^(1/2), 16^(1/4)
 * Level 2: 27^(2/3), 16^(3/4), 32^(2/5)
 * Level 3: negative indices 4^(−1/2), 8^(−2/3) = 1/4
 * Level 4: fractional bases (4/9)^(3/2) = 8/27, (27/8)^(−1/3) = 2/3
 * Level 5: decimal bases 0.04^(−1/2) = 5, large bases 32^(−3/5) = 1/8, products 4^(3/2) × 8^(−1/3) = 4
 */

/** base = bn/bd raised to the power p/q (p may be negative). `dec` = show the base as a decimal. */
interface Power { bn: number; bd: number; p: number; q: number; dec?: boolean }

const ROOT_NAME: Record<number, string> = { 2: 'square root', 3: 'cube root', 4: 'fourth root', 5: 'fifth root', 6: 'sixth root' };
const rootName = (q: number) => ROOT_NAME[q] ?? `${q}th root`;
const rootTex = (q: number, inner: string) => (q === 2 ? `\\sqrt{${inner}}` : `\\sqrt[${q}]{${inner}}`);
const coprime = (a: number, b: number) => gcd(a, b) === 1;

function attempt(f: () => Exact): Exact | null {
  try {
    const v = f();
    return Number.isFinite(v.toNumber()) ? v : null;
  } catch {
    return null;
  }
}

/** Significant digits of a decimal string such as "0.0625" (→ 3). */
const sigDigitsOf = (dec: string) => dec.replace('.', '').replace(/^0+/, '').replace(/0+$/, '').length;

/** Stricter than the clean rule: no option should be a six-figure fraction or a long decimal like 0.421875. */
function sane(v: Exact): boolean {
  if (!v.isRational()) return true;
  const r = v.toRat();
  const n = r.n < 0n ? -r.n : r.n;
  if (n > 10000n || r.d > 10000n) return false;
  const dec = ratToDecimalString(r);
  return dec === null || sigDigitsOf(dec) <= 4;
}

function cleanOnly(ds: { value: Exact | null; trap: string }[]): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } => d.value !== null && isCleanExact(d.value).ok && sane(d.value));
}

const baseExact = (f: Power): Exact => frac(f.bn, f.bd);

function fracTex(n: number, d: number): string {
  return d === 1 ? `${n}` : `\\left(\\frac{${n}}{${d}}\\right)`;
}

function baseTex(f: Power): string {
  if (f.bd === 1) return `${f.bn}`;
  if (f.dec) return `(${baseExact(f).toLatex({ format: 'decimal' })})`;
  return fracTex(f.bn, f.bd);
}

const expTex = (p: number, q: number) => `${p < 0 ? '-' : ''}\\frac{${Math.abs(p)}}{${q}}`;
const powTex = (f: Power) => `${baseTex(f)}^{${expTex(f.p, f.q)}}`;
const floatValue = (f: Power) => Math.pow(f.bn / f.bd, f.p / f.q);

/** The wrong answers a candidate gets from the classic slips when evaluating one power. */
function mistakes(f: Power, correct: Exact): { value: Exact | null; trap: string }[] {
  const base = baseExact(f);
  const { p, q } = f;
  const ap = Math.abs(p);
  const neg = p < 0;
  const isFraction = f.bd !== 1;
  const root = attempt(() => base.powRat(rat(1, q)));
  const out: { value: Exact | null; trap: string }[] = [
    { value: base.mulRat(rat(p, q)), trap: 'multiplied the base by the index instead of taking a root' },
    { value: attempt(() => base.powRat(rat(neg ? -q : q, ap))), trap: 'swapped the numerator and denominator of the index' },
  ];
  if (neg) {
    out.push({ value: correct.neg(), trap: 'a negative index means a reciprocal, not a negative answer' });
    out.push({ value: attempt(() => base.powRat(rat(ap, q))), trap: isFraction ? 'forgot to invert the fractional base for the negative index' : 'ignored the minus sign in the index' });
    out.push({ value: attempt(() => base.powRat(rat(ap, q)).neg()), trap: 'made the answer negative instead of taking the reciprocal' });
  }
  if (ap !== 1 && root) {
    const r = neg ? attempt(() => root.inv()) : root;
    out.push({ value: r, trap: `took the ${rootName(q)} but forgot to raise it to the power ${ap}` });
    out.push({ value: r ? r.mulRat(ap) : null, trap: `multiplied the ${rootName(q)} by ${ap} instead of raising it to the power ${ap}` });
    out.push({ value: attempt(() => base.pow(neg ? -ap : ap)), trap: `raised to the power ${ap} but forgot the ${rootName(q)}` });
  }
  if (isFraction) {
    const nr = attempt(() => E(f.bn).powRat(rat(ap, q)));
    out.push({ value: nr ? (neg ? attempt(() => E(f.bd).div(nr)) : nr.mulRat(rat(1, f.bd))) : null, trap: 'applied the index to the numerator only' });
  }
  for (const k of [2, 3]) {
    if (k === q) continue;
    out.push({ value: attempt(() => base.powRat(rat(p, k))), trap: `took the ${rootName(k)} instead of the ${rootName(q)}` });
  }
  return out;
}

/** [r, p] pairs giving r^q as the base and p as the numerator of the index, keyed by q. */
const POS_POOL: Record<number, [number, number][]> = {
  2: [[2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [2, 5], [3, 5]],
  3: [[2, 2], [3, 2], [4, 2], [5, 2], [10, 2], [2, 4], [3, 4], [4, 4], [5, 4], [2, 5], [3, 5]],
  4: [[2, 3], [3, 3], [2, 5], [3, 5]],
  5: [[2, 2], [2, 3], [2, 4], [3, 2], [3, 3], [3, 4]],
};
const NEG_POOL: Record<number, [number, number][]> = {
  2: [[2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [2, 3], [3, 3], [4, 3], [5, 3]],
  3: [[2, 1], [3, 1], [4, 1], [5, 1], [2, 2], [3, 2], [4, 2], [5, 2], [2, 4], [3, 4]],
  4: [[2, 1], [3, 1], [2, 3], [3, 3]],
  5: [[2, 1], [2, 2], [2, 3], [3, 1], [3, 2]],
};
/** [base, p, q] for the factors of a level-5 product; every value is 2..27. */
const COMBO_POOL: [number, number, number][] = [
  [4, 1, 2], [4, 3, 2], [9, 1, 2], [9, 3, 2], [16, 1, 2], [16, 1, 4], [16, 3, 4], [25, 1, 2], [36, 1, 2], [49, 1, 2],
  [8, 1, 3], [8, 2, 3], [27, 1, 3], [27, 2, 3], [32, 1, 5], [32, 2, 5], [32, 3, 5], [64, 1, 3], [64, 2, 3], [64, 1, 2],
  [81, 1, 4], [81, 3, 4], [125, 1, 3], [125, 2, 3], [100, 1, 2],
];
/** [base, r, q] with base = r^q for the large-base level-5 items. */
const BIG_POOL: [number, number, number][] = [
  [32, 2, 5], [64, 4, 3], [64, 8, 2], [64, 2, 6], [81, 3, 4], [81, 9, 2], [125, 5, 3], [216, 6, 3], [243, 3, 5],
  [256, 4, 4], [256, 16, 2], [343, 7, 3], [625, 5, 4], [625, 25, 2], [1000, 10, 3], [1024, 4, 5], [1024, 32, 2],
];
/** Decimal roots r = rn/rd whose small powers are short decimals. */
const DEC_ROOTS: [number, number][] = [[1, 10], [1, 5], [3, 10], [2, 5], [1, 2], [3, 5], [4, 5], [6, 5], [3, 2], [5, 2], [1, 4], [3, 4]];

export default defineTemplate({
  id: 'm1.indices-logs.fractional-index',
  module: 'M1',
  topic: 'indices-logs',
  title: 'Evaluate a^(p/q)',
  levels: {
    1: 'unit fractions: 8^(1/3), 25^(1/2), 16^(1/4)',
    2: 'p/q with p > 1: 27^(2/3), 16^(3/4), 32^(2/5)',
    3: 'negative indices: 4^(−1/2), 8^(−2/3)',
    4: 'fractional bases: (4/9)^(3/2), (27/8)^(−1/3)',
    5: 'decimal bases 0.04^(−1/2), large bases 32^(−3/5), products 4^(3/2) × 8^(−1/3)',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      const finish = (stem: string, factors: Power[], op: 'mul' | 'div', answer: Exact, distractors: Distractor[], solution: string, trap: string, tags: string[], format?: 'decimal') => {
        if (!isCleanExact(answer).ok || !answer.isRational()) return null;
        const r = answer.toRat();
        if (r.d > 1000n || (r.n < 0n ? -r.n : r.n) > 1000n) return null;
        return {
          stem,
          answer: { kind: 'exact' as const, value: answer, format },
          options: buildOptions(rng, answer, distractors, { format }),
          solution,
          trap,
          tags: ['indices', 'fractional-index', ...tags],
          params: { level, op, factors },
          typedAllowed: true,
        };
      };
      const ask = (body: string) => (rng.bool(0.5) ? `Evaluate $${body}$.` : `Find the value of $${body}$.`);

      // ------------------------------------------------------------------ level 1: x^(1/q)
      if (level === 1) {
        const q = rng.weighted([2, 3, 4, 5], [4, 3, 2, 1]);
        const r = rng.pick({ 2: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 3: [2, 3, 4, 5, 10], 4: [2, 3], 5: [2] }[q]!);
        const f: Power = { bn: r ** q, bd: 1, p: 1, q };
        const answer = E(r);
        const distractors = cleanOnly([
          ...mistakes(f, answer),
          { value: frac(1, r), trap: 'treated the fractional index as a reciprocal' },
          { value: q >= 3 ? E(r ** (q - 1)) : null, trap: `stopped one factor short: ${r}^${q - 1} is not the ${rootName(q)}` },
          { value: E(r + 1), trap: `near miss: ${r + 1}^${q} is not ${f.bn}` },
        ]);
        return finish(
          ask(powTex(f)), [f], 'mul', answer, distractors,
          `An index of $\\frac{1}{${q}}$ means the ${rootName(q)}: $${powTex(f)} = ${rootTex(q, `${f.bn}`)} = ${r}$, because $${r}^{${q}} = ${f.bn}$.`,
          'x^(1/q) is the q-th root of x: ask "what number to the power q gives x?" Never divide x by q.',
          ['root'],
        );
      }

      // ------------------------------------------------------------------ level 2: x^(p/q)
      if (level === 2) {
        const q = rng.weighted([2, 3, 4, 5], [4, 4, 2, 2]);
        const [r, p] = rng.pick(POS_POOL[q]);
        const f: Power = { bn: r ** q, bd: 1, p, q };
        const answer = E(r ** p);
        const distractors = cleanOnly([...mistakes(f, answer), { value: E(r * p), trap: 'multiplied the root by p instead of raising it to the power p' }]);
        return finish(
          ask(powTex(f)), [f], 'mul', answer, distractors,
          `Root first, then power: $${powTex(f)} = (${rootTex(q, `${f.bn}`)})^{${p}} = ${r}^{${p}} = ${answer.toLatex()}$.`,
          'For x^(p/q) take the q-th root first (keeps the numbers small), then raise to the power p; the base is never simply multiplied by the index.',
          ['power'],
        );
      }

      // ------------------------------------------------------------------ level 3: negative index
      if (level === 3) {
        const q = rng.weighted([2, 3, 4, 5], [4, 4, 2, 1]);
        const [r, ap] = rng.pick(NEG_POOL[q]);
        const f: Power = { bn: r ** q, bd: 1, p: -ap, q };
        const answer = frac(1, r ** ap);
        const distractors = cleanOnly(mistakes(f, answer));
        const inner = ap === 1 ? `${rootTex(q, `${f.bn}`)}` : `(${rootTex(q, `${f.bn}`)})^{${ap}}`;
        return finish(
          ask(powTex(f)), [f], 'mul', answer, distractors,
          `The minus sign means reciprocal: $${powTex(f)} = \\frac{1}{${f.bn}^{${expTex(ap, q)}}} = \\frac{1}{${inner}} = \\frac{1}{${r ** ap}}$.`,
          'A negative index gives a reciprocal, not a negative number: x^(−p/q) = 1 / x^(p/q). Deal with the sign, the root and the power one at a time.',
          ['negative-index'],
        );
      }

      // ------------------------------------------------------------------ level 4: fractional base
      if (level === 4) {
        const q = rng.weighted([2, 3, 4], [4, 3, 1]);
        const maxR = q === 4 ? 3 : 5;
        const r1 = rng.int(1, maxR);
        const r2 = rng.int(2, maxR);
        if (r1 === r2 || !coprime(r1, r2)) return null;
        const ap = rng.pick([1, 2, 3].filter((x) => coprime(x, q)));
        const neg = rng.bool(0.5);
        const p = neg ? -ap : ap;
        const f: Power = { bn: r1 ** q, bd: r2 ** q, p, q };
        const answer = frac(r1, r2).pow(p);
        const distractors = cleanOnly(mistakes(f, answer));
        const [tn, td] = neg ? [r2, r1] : [r1, r2];
        const rooted = fracTex(tn, td);
        const solution = neg
          ? `Invert the fraction to make the index positive: $${powTex(f)} = ${fracTex(r2 ** q, r1 ** q)}^{${expTex(ap, q)}}$. Now take the ${rootName(q)} of top and bottom${ap === 1 ? '' : `, then raise to the power ${ap}`}: $${ap === 1 ? '' : `${rooted}^{${ap}} = `}${answer.toLatex()}$.`
          : `Take the ${rootName(q)} of the numerator and denominator${ap === 1 ? '' : `, then raise to the power ${ap}`}: $${powTex(f)} = ${ap === 1 ? '' : `${rooted}^{${ap}} = `}${answer.toLatex()}$.`;
        return finish(
          ask(powTex(f)), [f], 'mul', answer, distractors, solution,
          'A negative index flips the fraction first; then the root and power apply to numerator and denominator alike.',
          ['fraction-base', ...(neg ? ['negative-index'] : [])],
        );
      }

      // ------------------------------------------------------------------ level 5
      const variant = rng.weighted(['decimal', 'combo', 'big'] as const, [4, 4, 2]);

      if (variant === 'decimal') {
        const [rn, rd] = rng.pick(DEC_ROOTS);
        const q = rng.weighted([2, 3, 4], [4, 3, 1]);
        const base = frac(rn, rd).pow(q);
        const dec = ratToDecimalString(base.toRat());
        if (!dec || sigDigitsOf(dec) > 3) return null; // keep the base a short decimal (0.04, 0.216, 1.44)
        const ap = rng.pick([1, 2, 3].filter((x) => coprime(x, q)));
        const neg = rng.bool(0.6);
        const p = neg ? -ap : ap;
        const f: Power = { bn: Number(base.toRat().n), bd: Number(base.toRat().d), p, q, dec: true };
        const answer = frac(rn, rd).pow(p);
        const adec = ratToDecimalString(answer.toRat());
        if (adec && sigDigitsOf(adec) > 3) return null; // 0.125 or 1.44 yes, 3.375 no
        const distractors = cleanOnly(mistakes(f, answer));
        const rDec = frac(rn, rd).toLatex({ format: 'decimal' });
        const powerStep = neg ? `${rDec}^{-${ap}} = \\frac{1}{${rDec}${ap === 1 ? '' : `^{${ap}}`}} = ` : ap === 1 ? '' : `${rDec}^{${ap}} = `;
        return finish(
          ask(powTex(f)), [f], 'mul', answer, distractors,
          `Spot the power: $${dec} = ${rDec}^{${q}}$, so $${powTex(f)} = ${powerStep}${answer.toLatex({ format: 'decimal' })}$. (Equivalently $${dec} = \\frac{${f.bn}}{${f.bd}}$ and work with the fraction.)`,
          'Write the decimal as a power of a simple decimal (0.04 = 0.2², 0.125 = 0.5³) or as a fraction; a negative index still means reciprocal.',
          ['decimal-base', ...(neg ? ['negative-index'] : [])],
          'decimal',
        );
      }

      if (variant === 'big') {
        const [bn, r, q] = rng.pick(BIG_POOL);
        const choices = [1, 2, 3, 5].filter((x) => coprime(x, q) && r ** x <= 1000);
        if (choices.length === 0) return null;
        const ap = rng.pick(choices);
        const f: Power = { bn, bd: 1, p: -ap, q };
        const answer = frac(1, r ** ap);
        const distractors = cleanOnly(mistakes(f, answer));
        return finish(
          ask(powTex(f)), [f], 'mul', answer, distractors,
          `$${bn} = ${r}^{${q}}$, so $${powTex(f)} = ${r}^{-${ap}} = \\frac{1}{${r ** ap}}$.`,
          'Write the base as a power first (32 = 2⁵, 243 = 3⁵, 1024 = 4⁵); then the root is immediate and the minus sign means reciprocal.',
          ['negative-index', 'large-base'],
        );
      }

      // combo: a^(p1/q1) × b^(−p2/q2) or a^(p1/q1) ÷ b^(p2/q2)
      const op = rng.bool(0.7) ? 'mul' : 'div';
      const [b1, p1, q1] = rng.pick(COMBO_POOL);
      const [b2, p2, q2] = rng.pick(COMBO_POOL);
      if (b1 === b2) return null;
      const f1: Power = { bn: b1, bd: 1, p: p1, q: q1 };
      const f2: Power = { bn: b2, bd: 1, p: op === 'mul' ? -p2 : p2, q: q2 };
      const v1 = attempt(() => baseExact(f1).powRat(rat(f1.p, f1.q)));
      const v2 = attempt(() => baseExact(f2).powRat(rat(f2.p, f2.q)));
      if (!v1 || !v2) return null;
      const combine = (x: Exact, y: Exact) => (op === 'mul' ? x.mul(y) : x.div(y));
      const answer = combine(v1, v2);
      const symbol = op === 'mul' ? '\\times' : '\\div';
      const distractors = cleanOnly([
        ...mistakes(f1, v1).map((m) => ({ value: m.value ? attempt(() => combine(m.value!, v2)) : null, trap: `first factor: ${m.trap}` })),
        ...mistakes(f2, v2).map((m) => ({ value: m.value ? attempt(() => combine(v1, m.value!)) : null, trap: `second factor: ${m.trap}` })),
        { value: attempt(() => E(b1 * b2).powRat(rat(f1.p * f2.q + f2.p * f1.q, f1.q * f2.q))), trap: 'added the indices even though the bases are different' },
        { value: answer.neg(), trap: 'a negative index does not make the answer negative' },
      ]);
      return finish(
        ask(`${powTex(f1)} ${symbol} ${powTex(f2)}`), [f1, f2], op, answer, distractors,
        `Evaluate each power separately: $${powTex(f1)} = ${v1.toLatex()}$ and $${powTex(f2)} = ${v2.toLatex()}$, so the ${op === 'mul' ? 'product' : 'quotient'} is $${answer.toLatex()}$.`,
        'Index laws only combine powers of the same base: evaluate each power on its own (root, power, reciprocal), then multiply or divide.',
        ['combination', 'negative-index'],
      );
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const { factors, op } = q.params as { factors: Power[]; op: 'mul' | 'div' };
    // Floating-point Math.pow straight from the raw base and index.
    const vals = factors.map(floatValue);
    const expected = factors.length === 1 ? vals[0] : op === 'mul' ? vals[0] * vals[1] : vals[0] / vals[1];
    const got = q.answer.value.toNumber();
    if (!Number.isFinite(expected) || Math.abs(got - expected) > 1e-9 * Math.max(1, Math.abs(expected))) return false;
    return q.answer.value.isRational();
  },
});
