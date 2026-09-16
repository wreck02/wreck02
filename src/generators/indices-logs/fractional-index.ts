import { defineTemplate, retry, type Level } from '../../core/template';
import { E, frac, Exact, rat, ratToDecimalString } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { gcd } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

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

/**
 * `group` marks candidates that are the *same* misconception written two ways (making the answer
 * negative instead of taking a reciprocal, say): at most one of a group is ever offered, because two
 * of them waste a slot and tell the candidate which family to strike out.
 */
type Candidate = { value: Exact | null; trap: string; group?: string };

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

const CAP = 1000n;

/**
 * The answer to a rational-power question, and every option next to it, is a rational with
 * numerator and denominator at most 1000 (or a four-place decimal such as 0.0064): no surds,
 * no 4096/729, no 0.0003. This is the same cap for options as for the answer.
 */
function withinCap(v: Exact): boolean {
  if (!v.isRational() || !isCleanExact(v).ok) return false;
  const r = v.toRat();
  return (r.n < 0n ? -r.n : r.n) <= CAP && (r.d <= CAP || r.d === 10000n);
}

/**
 * The answer stays inside CAP; an *option* may be a whole number of up to twenty times the answer.
 * Without that room every overshoot (the root raised to one power too many: 3^6 = 729 beside
 * 9^{5/2} = 243) is silently deleted by the cap, and the answer to a level-2 question is then simply
 * the largest number on the page.
 */
function usableOption(v: Exact, answer: Exact): boolean {
  if (withinCap(v)) return true;
  if (!v.isRational() || v.toRat().d !== 1n || !isCleanExact(v).ok) return false;
  return Math.abs(v.toNumber()) <= 20 * Math.abs(answer.toNumber());
}

/**
 * De-duplicate the candidate mistakes and drop the ones that cannot be offered together.
 *
 * Only one option may be negative: every negative value here comes from the single misconception
 * "a minus sign in the index makes the answer negative", and the question's own trap line tells the
 * candidate to strike them out — three of them turn a five-option question into a one-in-two guess.
 * The same rule applies to any explicit exclusivity `group`.
 */
function candidatePool(rng: RNG, answer: Exact, cands: Candidate[]): Distractor[] {
  const seen: Exact[] = [answer];
  const groups = new Set<string>();
  const pool: Distractor[] = [];
  for (const c of rng.shuffle(cands)) {
    const v = c.value;
    if (!v || !usableOption(v, answer)) continue;
    if (seen.some((s) => s.equals(v))) continue;
    const g = c.group ?? (v.sign() < 0 ? 'made-negative' : null);
    if (g !== null) {
      if (groups.has(g)) continue;
      groups.add(g);
    }
    seen.push(v);
    pool.push({ value: v, trap: c.trap });
  }
  return pool;
}

/** How many of the surviving candidates overshoot the answer. */
function countAbove(answer: Exact, pool: Distractor[]): number {
  return pool.filter((d) => d.value.toNumber() > answer.toNumber()).length;
}

/**
 * Take `count` of them with a randomly drawn number below the answer, so the correct option is not
 * pinned to one slot in the sorted list. The draw is uniform over all five positions and then clamped
 * to what the candidate list can actually supply, which means the scarcer side is always used in full:
 * if only two mistakes overshoot, both are offered rather than one.
 */
function splitPick(rng: RNG, answer: Exact, pool: Distractor[], count = 4): Distractor[] {
  const a = answer.toNumber();
  const below = pool.filter((d) => d.value.toNumber() < a);
  const above = pool.filter((d) => d.value.toNumber() > a);
  const lo = Math.max(0, count - above.length);
  const hi = Math.min(count, below.length);
  const nBelow = Math.max(Math.min(rng.int(0, count), hi), Math.min(lo, hi));
  return [...below.slice(0, nBelow), ...above.slice(0, count - nBelow)];
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
function mistakes(f: Power, correct: Exact): Candidate[] {
  const base = baseExact(f);
  const { p, q } = f;
  const ap = Math.abs(p);
  const neg = p < 0;
  const isFraction = f.bd !== 1 && !f.dec;
  const root = attempt(() => base.powRat(rat(1, q)));
  const unsigned = attempt(() => base.powRat(rat(ap, q))); // the value with the sign of the index ignored
  const out: Candidate[] = [
    { value: base.mulRat(rat(p, q)), trap: 'multiplied the base by the index instead of taking a root' },
    { value: attempt(() => base.powRat(rat(neg ? -q : q, ap))), trap: 'swapped the numerator and denominator of the index' },
  ];
  for (const k of [2, 3]) {
    if (k === q) continue;
    out.push({ value: attempt(() => base.powRat(rat(p, k))), trap: `took the ${rootName(k)} instead of the ${rootName(q)}` });
  }
  if (root) {
    // One power too many. This is the one slip in the catalogue that *overshoots* a positive answer,
    // so it is what keeps the answer off the top of the option list.
    const over = neg ? attempt(() => root.inv().pow(ap + 1)) : attempt(() => root.pow(ap + 1));
    out.push({
      value: over,
      trap: ap === 1 ? `squared the ${rootName(q)} instead of stopping at it` : `raised the ${rootName(q)} to the power ${ap + 1} instead of ${ap}`,
    });
  }
  if (neg) {
    out.push({ value: correct.neg(), trap: 'a negative index means a reciprocal, not a negative answer', group: 'made-negative' });
    out.push({ value: unsigned, trap: isFraction ? 'forgot to invert the fractional base for the negative index' : 'ignored the minus sign in the index' });
    out.push({ value: unsigned ? unsigned.neg() : null, trap: 'made the answer negative instead of taking the reciprocal', group: 'made-negative' });
    out.push({ value: attempt(() => E(1).div(base.mulRat(rat(ap, q)))), trap: 'multiplied the base by the index, then took the reciprocal' });
    out.push({ value: attempt(() => base.inv()), trap: `took the reciprocal but never took the ${rootName(q)}` });
  } else {
    if (q % 2 === 0) out.push({ value: correct.neg(), trap: `took the negative ${rootName(q)}: a fractional index means the positive root` });
    if (isFraction) out.push({ value: attempt(() => base.inv().powRat(rat(ap, q))), trap: 'inverted the fraction although the index is positive' });
    if (ap !== 1) out.push({ value: base.mulRat(rat(1, q)), trap: 'divided the base by the root index and ignored the power' });
    // 1000^(1/3) = 100, (1/125)^(1/3) = 1/25: one factor short of the root.
    if (ap === 1 && q >= 3) out.push({ value: attempt(() => base.powRat(rat(q - 1, q))), trap: `stopped one factor short of the ${rootName(q)}` });
  }
  // Off by one in the root itself ("∛64 = 3"), then the power applied as usual. One of the two lands
  // above the answer and one below, whichever way the index points.
  if (!isFraction && root && root.isInteger()) {
    const r0 = root.toInt();
    for (const rr of [r0 + 1, r0 - 1]) {
      if (rr < 2) continue;
      out.push({
        value: attempt(() => (neg ? E(1).div(E(rr).pow(ap)) : E(rr).pow(ap))),
        trap: `near miss: ${rr}^${q} is not ${f.bn}`,
      });
    }
  }
  if (ap !== 1 && root) {
    const r = neg ? attempt(() => root.inv()) : root;
    out.push({ value: r, trap: `took the ${rootName(q)} but forgot to raise it to the power ${ap}` });
    out.push({ value: r ? r.mulRat(ap) : null, trap: `multiplied the ${rootName(q)} by ${ap} instead of raising it to the power ${ap}` });
    out.push({ value: attempt(() => base.pow(neg ? -ap : ap)), trap: `raised to the power ${ap} but forgot the ${rootName(q)}` });
    if (ap >= 3) out.push({ value: r ? attempt(() => r.pow(ap - 1)) : null, trap: `raised the ${rootName(q)} to the power ${ap - 1} instead of ${ap}` });
  }
  if (isFraction) {
    const nr = attempt(() => E(f.bn).powRat(rat(ap, q)));
    const dr = attempt(() => E(f.bd).powRat(rat(ap, q)));
    if (neg) {
      out.push({ value: dr ? dr.mulRat(rat(1, f.bn)) : null, trap: 'inverted the fraction, then applied the index to the numerator only' });
      out.push({ value: nr ? attempt(() => E(f.bd).div(nr)) : null, trap: 'inverted the fraction, then applied the index to the denominator only' });
    } else {
      out.push({ value: nr ? nr.mulRat(rat(1, f.bd)) : null, trap: 'applied the index to the numerator only' });
      out.push({ value: dr ? attempt(() => E(f.bn).div(dr)) : null, trap: 'applied the index to the denominator only' });
      if (ap === 1) out.push({ value: frac(f.bn * q, f.bd), trap: 'divided the denominator by the root index instead of taking its root' });
      // (27/64)^(1/3) = 3/8: the right root on top, the familiar square root underneath.
      for (const k of [2, 3]) {
        if (k === q) continue;
        out.push({ value: nr ? attempt(() => nr.div(E(f.bd).powRat(rat(ap, k)))) : null, trap: `took the ${rootName(q)} of the numerator but the ${rootName(k)} of the denominator` });
      }
    }
  }
  if (f.dec) {
    // √0.04 written as 0.02: root of the digits with the decimal point left where it was.
    const dec = ratToDecimalString(base.toRat());
    if (dec && dec.includes('.')) {
      const k = dec.split('.')[1].length;
      const digits = Number(dec.replace('.', ''));
      out.push({ value: attempt(() => E(digits).powRat(rat(1, q)).mulRat(rat(1, 10 ** k)).pow(p)), trap: 'took the root of the digits but kept the same number of decimal places' });
    }
    // 0.8 × 0.8 = 6.4 or 0.064: the decimal point slips one place when multiplying decimals.
    out.push({ value: correct.mulRat(10), trap: 'decimal point slipped one place to the right' });
    out.push({ value: correct.mulRat(rat(1, 10)), trap: 'decimal point slipped one place to the left' });
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
/**
 * [base, r, q] with base = r^q for the large-base level-5 items. Only bases whose root index is
 * at least 3: 64^(−1/2)-style items collapse to level 3, so they are not here.
 */
const BIG_POOL: [number, number, number][] = [
  [32, 2, 5], [64, 4, 3], [64, 2, 6], [81, 3, 4], [125, 5, 3], [216, 6, 3], [243, 3, 5],
  [256, 4, 4], [343, 7, 3], [625, 5, 4], [1000, 10, 3], [1024, 4, 5],
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
      const finish = (stem: string, factors: Power[], op: 'mul' | 'div', answer: Exact, candidates: Candidate[], solution: string, trap: string, tags: string[], format?: 'decimal', minAbove = 0) => {
        if (!withinCap(answer)) return null;
        const pool = candidatePool(rng, answer, candidates);
        // Redraw rather than offer a list every one of whose wrong answers is smaller than the right one.
        if (countAbove(answer, pool) < minAbove) return null;
        return {
          stem,
          answer: { kind: 'exact' as const, value: answer, format },
          options: buildOptions(rng, answer, splitPick(rng, answer, pool), { format }),
          solution,
          trap,
          tags: ['indices', 'fractional-index', ...tags],
          params: { level, op, factors },
          typedAllowed: true,
        };
      };
      const ask = (body: string) => rng.pick([
        `Evaluate $${body}$.`,
        `Find the value of $${body}$.`,
        `Calculate the value of $${body}$.`,
        `What is the value of $${body}$?`,
      ]);

      // ------------------------------------------------------------------ level 1: x^(1/q)
      if (level === 1) {
        const q = rng.weighted([2, 3, 4, 5], [4, 3, 2, 1]);
        const r = rng.pick({ 2: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 3: [2, 3, 4, 5, 10], 4: [2, 3], 5: [2, 3] }[q]!);
        const f: Power = { bn: r ** q, bd: 1, p: 1, q };
        const answer = E(r);
        const candidates: Candidate[] = [
          ...mistakes(f, answer),
          { value: frac(1, r), trap: 'treated the fractional index as a reciprocal' },
        ];
        return finish(
          ask(powTex(f)), [f], 'mul', answer, candidates,
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
        return finish(
          ask(powTex(f)), [f], 'mul', answer, mistakes(f, answer),
          `Root first, then power: $${powTex(f)} = (${rootTex(q, `${f.bn}`)})^{${p}} = ${r}^{${p}} = ${answer.toLatex()}$.`,
          'For x^(p/q) take the q-th root first (keeps the numbers small), then raise to the power p; the base is never simply multiplied by the index.',
          ['power'],
          undefined,
          2,
        );
      }

      // ------------------------------------------------------------------ level 3: negative index
      if (level === 3) {
        const q = rng.weighted([2, 3, 4, 5], [4, 4, 2, 1]);
        const [r, ap] = rng.pick(NEG_POOL[q]);
        const f: Power = { bn: r ** q, bd: 1, p: -ap, q };
        const answer = frac(1, r ** ap);
        const inner = ap === 1 ? `${rootTex(q, `${f.bn}`)}` : `(${rootTex(q, `${f.bn}`)})^{${ap}}`;
        return finish(
          ask(powTex(f)), [f], 'mul', answer, mistakes(f, answer),
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
        const [tn, td] = neg ? [r2, r1] : [r1, r2];
        const rooted = fracTex(tn, td);
        const solution = neg
          ? `Invert the fraction to make the index positive: $${powTex(f)} = ${fracTex(r2 ** q, r1 ** q)}^{${expTex(ap, q)}}$. Now take the ${rootName(q)} of top and bottom${ap === 1 ? '' : `, then raise to the power ${ap}`}: $${ap === 1 ? '' : `${rooted}^{${ap}} = `}${answer.toLatex()}$.`
          : `Take the ${rootName(q)} of the numerator and denominator${ap === 1 ? '' : `, then raise to the power ${ap}`}: $${powTex(f)} = ${ap === 1 ? '' : `${rooted}^{${ap}} = `}${answer.toLatex()}$.`;
        return finish(
          ask(powTex(f)), [f], 'mul', answer, mistakes(f, answer), solution,
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
        const neg = rng.bool(0.6);
        // (0.25)^(1/2) is a level-1 question in disguise: a positive index must carry a power.
        const apChoices = [1, 2, 3].filter((x) => coprime(x, q) && (neg || x >= 2));
        if (apChoices.length === 0) return null;
        const ap = rng.pick(apChoices);
        const p = neg ? -ap : ap;
        const f: Power = { bn: Number(base.toRat().n), bd: Number(base.toRat().d), p, q, dec: true };
        const answer = frac(rn, rd).pow(p);
        const adec = ratToDecimalString(answer.toRat());
        if (adec && sigDigitsOf(adec) > 3) return null; // 0.125 or 1.44 yes, 3.375 no
        const rDec = frac(rn, rd).toLatex({ format: 'decimal' });
        const powerStep = neg ? `${rDec}^{-${ap}} = \\frac{1}{${rDec}${ap === 1 ? '' : `^{${ap}}`}} = ` : ap === 1 ? '' : `${rDec}^{${ap}} = `;
        return finish(
          ask(powTex(f)), [f], 'mul', answer, mistakes(f, answer),
          `Spot the power: $${dec} = ${rDec}^{${q}}$, so $${powTex(f)} = ${powerStep}${answer.toLatex({ format: 'decimal' })}$. (Equivalently $${dec} = \\frac{${f.bn}}{${f.bd}}$ and work with the fraction.)`,
          'Write the decimal as a power of a simple decimal (0.04 = 0.2², 0.125 = 0.5³) or as a fraction; a negative index still means reciprocal.',
          ['decimal-base', ...(neg ? ['negative-index'] : [])],
          'decimal',
        );
      }

      if (variant === 'big') {
        const [bn, r, q] = rng.pick(BIG_POOL);
        // p ≥ 2 so that root, power and reciprocal are all in play (32^(−3/5)); 125^(−1/3) is level 3.
        const choices = [2, 3, 5].filter((x) => coprime(x, q) && r ** x <= 1000);
        if (choices.length === 0) return null;
        const ap = rng.pick(choices);
        const f: Power = { bn, bd: 1, p: -ap, q };
        const answer = frac(1, r ** ap);
        return finish(
          ask(powTex(f)), [f], 'mul', answer, mistakes(f, answer),
          `$${bn} = ${r}^{${q}}$, so $${powTex(f)} = ${r}^{-${ap}} = \\frac{1}{${r ** ap}}$.`,
          'Write the base as a power first (32 = 2⁵, 243 = 3⁵, 1024 = 4⁵); then the root is immediate and the minus sign means reciprocal.',
          ['negative-index', 'large-base'],
        );
      }

      // combo: a^(p1/q1) × b^(−p2/q2), or a^(p1/q1) ÷ b^(p2/q2) with sometimes one negative index
      const op = rng.bool(0.65) ? 'mul' : 'div';
      const [b1, p1, q1] = rng.pick(COMBO_POOL);
      const [b2, p2, q2] = rng.pick(COMBO_POOL);
      if (b1 === b2) return null;
      if (p1 === 1 && p2 === 1) return null; // 49^(1/2) ÷ 64^(1/3) is two level-1 roots, not a level-5 item
      let s1 = 1, s2 = 1;
      if (op === 'mul') s2 = -1;
      else if (rng.bool(0.4)) { if (rng.bool(0.5)) s1 = -1; else s2 = -1; }
      const f1: Power = { bn: b1, bd: 1, p: s1 * p1, q: q1 };
      const f2: Power = { bn: b2, bd: 1, p: s2 * p2, q: q2 };
      const anyNeg = s1 < 0 || s2 < 0;
      const v1 = attempt(() => baseExact(f1).powRat(rat(f1.p, f1.q)));
      const v2 = attempt(() => baseExact(f2).powRat(rat(f2.p, f2.q)));
      if (!v1 || !v2) return null;
      const combine = (x: Exact, y: Exact) => (op === 'mul' ? x.mul(y) : x.div(y));
      const answer = combine(v1, v2);
      const symbol = op === 'mul' ? '\\times' : '\\div';
      const e1 = rat(f1.p, f1.q), e2 = rat(f2.p, f2.q);
      const indexLaw: Candidate = op === 'mul'
        ? { value: attempt(() => E(b1 * b2).powRat(rat(e1.n * e2.d + e2.n * e1.d, e1.d * e2.d))), trap: 'added the indices even though the bases are different' }
        : { value: attempt(() => frac(b1, b2).powRat(rat(e1.n * e2.d - e2.n * e1.d, e1.d * e2.d))), trap: 'subtracted the indices even though the bases are different' };
      const candidates: Candidate[] = [
        ...mistakes(f1, v1).map((m) => ({ value: m.value ? attempt(() => combine(m.value!, v2)) : null, trap: `first factor: ${m.trap}` })),
        ...mistakes(f2, v2).map((m) => ({ value: m.value ? attempt(() => combine(v1, m.value!)) : null, trap: `second factor: ${m.trap}` })),
        indexLaw,
        ...(anyNeg ? [{ value: answer.neg(), trap: 'a negative index does not make the answer negative' }] : []),
        ...(op === 'div'
          ? [
            { value: v1.mul(v2), trap: 'multiplied the two values instead of dividing' },
            { value: attempt(() => v2.div(v1)), trap: 'divided the wrong way round' },
          ]
          : []),
      ];
      return finish(
        ask(`${powTex(f1)} ${symbol} ${powTex(f2)}`), [f1, f2], op, answer, candidates,
        `Evaluate each power separately: $${powTex(f1)} = ${v1.toLatex()}$ and $${powTex(f2)} = ${v2.toLatex()}$, so the ${op === 'mul' ? 'product' : 'quotient'} is $${answer.toLatex()}$.`,
        'Index laws only combine powers of the same base: evaluate each power on its own (root, power, reciprocal), then multiply or divide.',
        ['combination', ...(anyNeg ? ['negative-index'] : [])],
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
