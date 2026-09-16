import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { ordinal } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Geometric sequences: terms, common ratio, nth-term formula, thresholds and sums.
 * Level 1: 3, 6, 12, … find u_6 = 96
 * Level 2: u_2 = 6 and u_4 = 54 → r = 3 (r > 0), or the term in between
 * Level 3: the nth-term formula as a choice, 3 × 2^(n−1) against 3 × 2^n
 * Level 4: the first term of 5 × 2^(n−1) above 1000 (n = 9), or a term of a sequence with ratio 3/2
 * Level 5: x + 1, x + 4, x + 10 in geometric progression → x = 2, or the sum of a GP with a negative ratio
 *
 * params keep a, the ratio as num/den and the index, so verify() can multiply the terms out one
 * at a time (or literally add them up) rather than reusing a closed formula.
 */

interface Ratio { num: number; den: number }

const ratioTex = (r: Ratio): string => (r.den === 1 ? `${r.num}` : `\\frac{${r.num}}{${r.den}}`);
const ratioExact = (r: Ratio): Exact => frac(r.num, r.den);

/** a·r^k as an exact value. */
function term(a: number, r: Ratio, k: number): Exact {
  return E(a).mul(ratioExact(r).pow(k));
}

/** The first m terms, as LaTeX, when they are all integers. */
function termList(a: number, r: Ratio, m: number): string | null {
  const out: string[] = [];
  for (let k = 0; k < m; k++) {
    const t = term(a, r, k);
    if (!t.isInteger() || Math.abs(t.toNumber()) > 100000) return null;
    out.push(t.toLatex());
  }
  return out.join(',\\ ');
}

function clean(ds: Distractor[]): Distractor[] {
  return ds.filter((d) => Number.isFinite(d.value.toNumber()) && isCleanExact(d.value).ok);
}

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 60; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

// ----------------------------------------------------------------------------- levels 1 and 4b

/** "The first three terms are 3, 6, 12. Find the 6th term." */
function nthTerm(rng: RNG, level: Level): Generated | null {
  const fractional = level >= 4;
  const r: Ratio = fractional
    ? rng.pick([{ num: 3, den: 2 }, { num: 2, den: 3 }, { num: 4, den: 3 }, { num: 3, den: 4 }, { num: 5, den: 2 }])
    : rng.pick([{ num: 2, den: 1 }, { num: 2, den: 1 }, { num: 3, den: 1 }, { num: 4, den: 1 }, { num: 1, den: 2 }]);
  const big = Math.max(r.num, r.den);
  const n = fractional ? rng.pick([4, 5]) : rng.int(5, big === 2 ? 8 : big === 3 ? 6 : 5);
  const c = rng.int(1, 6);
  const a = c * r.den ** (n - 1);
  if (a > 100 || a < 1) return null;
  const answer = term(a, r, n - 1);
  if (!answer.isInteger() || Math.abs(answer.toNumber()) > 3000 || !isCleanExact(answer).ok) return null;
  const shown = termList(a, r, fractional ? 3 : 3);
  if (shown === null) return null;
  const arithmetic = E(a).add(E(n - 1).mul(term(a, r, 1).sub(E(a))));
  const ds: Distractor[] = [
    { value: term(a, r, n), trap: 'used r^n instead of r^(n−1): one term too far' },
    { value: term(a, r, n - 2), trap: 'stopped one term too early' },
    { value: arithmetic, trap: 'treated it as an arithmetic sequence and added the first difference' },
    { value: E(a * (n - 1)).mul(ratioExact(r)), trap: 'multiplied by r once and by (n − 1), instead of by r^(n−1)' },
    { value: term(a, r, n - 1).add(term(a, r, n - 2)), trap: 'added the previous term on as well' },
  ];
  // an inverted ratio only looks like a real answer when the ratio is itself a fraction
  if (r.den > 1) ds.push({ value: E(a).mul(ratioExact({ num: r.den, den: r.num }).pow(n - 1)), trap: 'inverted the common ratio' });
  return {
    stem: `The first three terms of a geometric sequence are $${shown}$.\n\nFind the ${ordinal(n)} term.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, clean(ds)),
    solution: `The common ratio is $${ratioTex(r)}$, so $u_{${n}} = ${a} \\times \\left(${ratioTex(r)}\\right)^{${n - 1}} = ${answer.toLatex()}$.`,
    trap: 'u_n = ar^(n−1): the first term already uses r^0, so the nth term has n − 1 multiplications.',
    tags: ['sequences', 'geometric', 'nth-term'],
    params: { variant: 'term', a, rn: r.num, rd: r.den, n },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 2

/** Two terms given; find the ratio (r > 0) or the term between them. */
function findRatio(rng: RNG): Generated | null {
  const r = rng.int(2, 5);
  const gap = rng.pick([2, 2, 3]);
  if (gap === 3 && r > 3) return null;
  const p = rng.int(1, 3);
  const a = rng.int(1, 4);
  const up = a * r ** (p - 1);
  const uq = a * r ** (p - 1 + gap);
  if (up > 24 || uq > 600) return null;
  const ask = gap === 2 && rng.bool(0.45) ? 'middle' : 'ratio';
  const ratio = uq / up; // r^gap
  if (ask === 'ratio') {
    const answer = E(r);
    const ds: Distractor[] = [
      { value: E(ratio), trap: `divided the terms but forgot to take the ${gap === 2 ? 'square' : 'cube'} root` },
      { value: frac(ratio, gap), trap: 'divided by the gap in the indices instead of taking a root' },
      { value: frac(1, r), trap: 'inverted the ratio: divided the earlier term by the later one' },
      { value: E(-r), trap: 'kept the negative root although the ratio is positive' },
      { value: E(r + 1), trap: 'off by one when taking the root' },
      { value: E(uq - up), trap: 'treated it as an arithmetic sequence and took a difference' },
    ];
    return {
      stem: `In a geometric sequence, $u_{${p}} = ${up}$ and $u_{${p + gap}} = ${uq}$.\n\nGiven that the common ratio is positive, find the common ratio.`,
      answer: { kind: 'exact', value: answer },
      options: buildOptions(rng, answer, clean(ds)),
      solution: `$\\frac{u_{${p + gap}}}{u_{${p}}} = r^{${gap}} = \\frac{${uq}}{${up}} = ${ratio}$, so $r = ${r}$ (the positive root).`,
      trap: 'Dividing the two terms gives r^(gap), so a root is still needed — and the sign condition picks one of ±.',
      tags: ['sequences', 'geometric', 'common-ratio'],
      params: { variant: 'ratio', ask, up, uq, gap, p },
      typedAllowed: true,
    };
  }
  const mid = up * r;
  const ds: Distractor[] = [
    { value: frac(up + uq, 2), trap: 'took the arithmetic mean instead of the geometric mean' },
    { value: frac(uq, 2), trap: 'halved the later term' },
    { value: E(-mid), trap: 'kept the negative square root although the terms are positive' },
    { value: E(up * 2), trap: 'assumed the ratio was 2' },
    { value: frac(uq, ratio), trap: 'divided by r² instead of multiplying by r' },
    { value: E(up + r), trap: 'added the ratio instead of multiplying by it' },
  ];
  return {
    stem: `A geometric sequence has positive terms, with $u_{${p}} = ${up}$ and $u_{${p + 2}} = ${uq}$.\n\nFind $u_{${p + 1}}$.`,
    answer: { kind: 'exact', value: E(mid) },
    options: buildOptions(rng, E(mid), clean(ds)),
    solution: `$u_{${p + 1}}^2 = ${up} \\times ${uq} = ${up * uq}$, so $u_{${p + 1}} = ${mid}$ (the terms are positive).`,
    trap: 'The middle term of a GP is the geometric mean √(u₁u₃), not the average of the two terms.',
    tags: ['sequences', 'geometric', 'geometric-mean'],
    params: { variant: 'ratio', ask, up, uq, gap: 2, p },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 3

function formulaQ(rng: RNG): Generated | null {
  const a = rng.int(2, 9);
  const r = rng.intExcluding(2, 5, [a]);
  const shown = termList(a, { num: r, den: 1 }, 4);
  if (shown === null || a * r ** 3 > 2500) return null;
  const correct = `$${a} \\times ${r}^{n-1}$`;
  const wrong = [
    { display: `$${a} \\times ${r}^{n}$`, trap: 'off by one: r^n counts one multiplication too many' },
    { display: `$${r} \\times ${a}^{n-1}$`, trap: 'swapped the first term and the common ratio' },
    { display: `$${a * r}^{n-1}$`, trap: 'multiplied a and r together before raising to the power' },
    { display: `$${a} + ${a * (r - 1)}(n-1)$`, trap: 'used the arithmetic nth-term formula a + (n − 1)d' },
    { display: `$${a} \\times ${r}^{n+1}$`, trap: 'shifted the index the wrong way' },
    { display: `$${a}n^{${r}}$`, trap: 'made it a power of n instead of a power of r' },
  ];
  return {
    stem: rng.pick([
      `The first four terms of a geometric sequence are $${shown},\\ \\dots$\n\nWhich expression gives the $n$th term?`,
      `A geometric sequence begins $${shown},\\ \\dots$\n\nFind an expression for $u_n$.`,
      `The first four terms of a geometric sequence are $${shown},\\ \\dots$\n\nWhich of the following is an expression for $u_n$?`,
    ]),
    answer: { kind: 'choice', value: correct },
    options: buildChoiceOptions(rng, correct, wrong),
    solution: `First term $${a}$, common ratio $${r}$, so $u_n = ${a} \\times ${r}^{n-1}$. Check $n = 1$: $${a} \\times ${r}^{0} = ${a}$.`,
    trap: 'Test n = 1: the formula must give the first term, which rules out r^n.',
    tags: ['sequences', 'geometric', 'nth-term'],
    params: { variant: 'formula', a, r, terms: [0, 1, 2, 3].map((k) => a * r ** k) },
    typedAllowed: false,
  };
}

// ----------------------------------------------------------------------------- level 4a

function exceedQ(rng: RNG): Generated | null {
  const a = rng.int(2, 6);
  const r = rng.pick([2, 2, 3]);
  const M = rng.pick([100, 200, 500, 1000, 2000, 5000]);
  let n = 1;
  let u = a;
  while (u <= M) {
    if (u === M) return null; // "first term above M" must be unambiguous
    u *= r;
    n++;
    if (n > 20) return null;
  }
  if (n < 5 || n > 12) return null;
  const answer = E(n);
  const ds: Distractor[] = [
    { value: E(n - 1), trap: 'solved r^(n−1) > M/a but then forgot to add the 1 back' },
    { value: E(n + 1), trap: 'one term too far: u_n is already above M' },
    { value: E(n - 2), trap: 'off by two in the index' },
    { value: E(n + 2), trap: 'off by two in the index' },
    { value: E(n + 3), trap: 'lost count of the powers of r' },
    { value: E(n - 3), trap: 'lost count of the powers of r' },
  ];
  return {
    stem: `The $n$th term of a geometric sequence is $u_n = ${a} \\times ${r}^{n-1}$.\n\nFind the least value of $n$ for which $u_n > ${M}$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, clean(ds), { fallback: [E(n + 3), E(n - 3)].filter((v) => v.toNumber() > 0) }),
    solution: `Keep multiplying by $${r}$: $u_{${n - 1}} = ${a * r ** (n - 2)}$ is still below $${M}$ and $u_{${n}} = ${a * r ** (n - 1)}$ is above it, so $n = ${n}$.`,
    trap: 'The index is one more than the power of r, so doubling up to the threshold gives n − 1 steps.',
    tags: ['sequences', 'geometric', 'inequality'],
    params: { variant: 'exceed', a, r, M, n },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 5

/** x + p, x + q, x + s in geometric progression; the x² terms cancel, so x is linear. */
function threeTermsQ(rng: RNG): Generated | null {
  const r: Ratio = rng.pick([{ num: 2, den: 1 }, { num: 3, den: 1 }, { num: 4, den: 1 }, { num: 3, den: 2 }, { num: 1, den: 2 }, { num: 2, den: 3 }]);
  const c = rng.int(1, 4);
  const t1 = c * r.den ** 2;
  const t2 = c * r.num * r.den;
  const t3 = c * r.num ** 2;
  if (Math.max(t1, t2, t3) > 40) return null;
  const x = rng.intExcluding(-6, 9, [0]);
  const p = t1 - x, q = t2 - x, s = t3 - x;
  if ([p, q, s].some((v) => Math.abs(v) > 40)) return null;
  const denom = 2 * q - p - s;
  if (denom === 0) return null;
  const shift = (k: number) => (k === 0 ? 'x' : k > 0 ? `x + ${k}` : `x - ${-k}`);
  const br = (k: number) => (k === 0 ? 'x' : `(${shift(k)})`);
  const answer = E(x);
  const slip = frac(q * q - p * s, p + s === 0 ? 1 : p + s);
  const ds: Distractor[] = [
    { value: E(-x), trap: 'sign slip when rearranging the linear equation' },
    { value: E(t1), trap: 'gave the first term of the sequence, not x' },
    { value: E(t2), trap: 'gave the middle term of the sequence, not x' },
    { value: frac(r.num, r.den), trap: 'gave the common ratio, not x' },
    { value: E(x + 1), trap: 'arithmetic slip of one' },
    { value: E(x - 1), trap: 'arithmetic slip of one' },
  ];
  if (p + s !== 0 && slip.isInteger() && slip.toNumber() !== x) ds.unshift({ value: slip, trap: 'dropped the middle term when expanding (x + q)²' });
  return {
    stem: `The expressions $${shift(p)}$, $${shift(q)}$ and $${shift(s)}$ are three consecutive terms of a geometric sequence.\n\nFind the value of $x$.`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, clean(ds)),
    solution: `Equal ratios give $${br(q)}^2 = ${br(p)}${br(s)}$. The $x^2$ terms cancel, leaving $${denom}x = ${p * s - q * q}$, so $x = ${x}$ and the sequence is $${t1},\\ ${t2},\\ ${t3}$.`,
    trap: 'Consecutive GP terms have equal ratios, so the middle term squared equals the product of the outer two.',
    tags: ['sequences', 'geometric', 'algebra'],
    params: { variant: 'three-terms', p, q, s },
    typedAllowed: true,
  };
}

/** Sum of the first n terms of a GP with a negative ratio. */
function sumQ(rng: RNG): Generated | null {
  const r: Ratio = rng.pick([{ num: -2, den: 1 }, { num: -3, den: 1 }, { num: -1, den: 2 }, { num: -2, den: 1 }]);
  const n = rng.int(4, 6);
  const c = rng.int(1, 4);
  const a = c * Math.abs(r.den) ** (n - 1);
  if (a > 100) return null;
  const rx = ratioExact(r);
  const answer = E(a).mul(E(1).sub(rx.pow(n))).div(E(1).sub(rx));
  if (!answer.isInteger() || Math.abs(answer.toNumber()) > 3000 || !isCleanExact(answer).ok) return null;
  const shown = termList(a, r, 4);
  if (shown === null || Math.abs(term(a, r, n - 1).toNumber()) > 3000) return null;
  const pos: Ratio = { num: Math.abs(r.num), den: r.den };
  const px = ratioExact(pos);
  const ds: Distractor[] = [
    { value: E(a).mul(E(1).sub(px.pow(n))).div(E(1).sub(px)), trap: 'ignored the minus sign in the common ratio' },
    { value: E(a).mul(E(1).sub(rx.pow(n - 1))).div(E(1).sub(rx)), trap: 'summed only n − 1 terms' },
    { value: E(a).mul(E(1).sub(rx.pow(n + 1))).div(E(1).sub(rx)), trap: 'summed one term too many' },
    { value: answer.neg(), trap: 'sign slip in (1 − r)' },
    { value: term(a, r, n - 1), trap: 'gave the nth term instead of the sum' },
    { value: E(a).mul(E(1).sub(rx.pow(n))).div(E(1).add(rx)), trap: 'divided by 1 + r instead of 1 − r' },
  ];
  return {
    stem: `Find the sum of the first ${n} terms of the geometric sequence $${shown},\\ \\dots$`,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, clean(ds)),
    solution: `$a = ${a}$, $r = ${ratioTex(r)}$, so $S_{${n}} = \\frac{${a}\\left(1 - \\left(${ratioTex(r)}\\right)^{${n}}\\right)}{1 - \\left(${ratioTex(r)}\\right)} = ${answer.toLatex()}$.`,
    trap: 'With a negative ratio the terms alternate: (1 − r) in the denominator becomes 1 + |r|.',
    tags: ['sequences', 'geometric', 'sum'],
    params: { variant: 'gp-sum', a, rn: r.num, rd: r.den, n },
    typedAllowed: true,
  };
}

// -----------------------------------------------------------------------------

export default defineTemplate({
  id: 'm1.sequences.geometric-terms',
  module: 'M1',
  topic: 'sequences',
  title: 'Geometric sequences',
  levels: {
    1: '3, 6, 12, … find u_6 = 96',
    2: 'u_2 = 6, u_4 = 54 → r = 3 (r > 0), or the term in between',
    3: 'the nth-term formula: 3 × 2^(n−1) against 3 × 2^n',
    4: 'least n with 5 × 2^(n−1) > 1000, or a term of a sequence with ratio 3/2',
    5: 'x + 1, x + 4, x + 10 in GP → x = 2, or the sum of a GP with a negative ratio',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      if (level <= 2) return level === 1 ? nthTerm(rng, level) : findRatio(rng);
      if (level === 3) return formulaQ(rng);
      if (level === 4) return pickVariant(rng, [exceedQ, (r) => nthTerm(r, 4)]);
      return pickVariant(rng, [threeTermsQ, sumQ]);
    });
  },
  verify(q) {
    const p = q.params as Record<string, unknown>;
    const close = (x: number, y: number) => Math.abs(x - y) < 1e-9 * Math.max(1, Math.abs(y));
    switch (p.variant) {
      case 'term': {
        if (q.answer.kind !== 'exact') return false;
        // multiply the ratio in one step at a time rather than using a power
        let u = p.a as number;
        for (let k = 1; k < (p.n as number); k++) u = (u * (p.rn as number)) / (p.rd as number);
        return close(q.answer.value.toNumber(), u);
      }
      case 'ratio': {
        if (q.answer.kind !== 'exact') return false;
        const up = p.up as number, uq = p.uq as number, gap = p.gap as number;
        const v = q.answer.value.toNumber();
        if (p.ask === 'ratio') return v > 0 && close(up * v ** gap, uq); // substitute the ratio back
        return v > 0 && close(v * v, up * uq); // geometric mean
      }
      case 'formula': {
        if (q.answer.kind !== 'choice') return false;
        const m = /^\$(\d+) \\times (\d+)\^\{n-1\}\$$/.exec(q.answer.value);
        if (!m) return false;
        const A = parseInt(m[1], 10), R = parseInt(m[2], 10);
        const terms = p.terms as number[];
        return terms.every((t, k) => t === A * R ** k) && terms.length === 4;
      }
      case 'exceed': {
        if (q.answer.kind !== 'exact') return false;
        const a = p.a as number, r = p.r as number, M = p.M as number;
        const n = q.answer.value.toNumber();
        if (!Number.isInteger(n) || n < 1) return false;
        const at = (k: number) => { let u = a; for (let i = 1; i < k; i++) u *= r; return u; };
        return at(n) > M && at(n - 1) <= M;
      }
      case 'three-terms': {
        if (q.answer.kind !== 'exact') return false;
        const x = q.answer.value.toNumber();
        const t = [(p.p as number) + x, (p.q as number) + x, (p.s as number) + x];
        // substitute: the three values must have a common ratio
        return t[0] !== 0 && t[1] !== 0 && close(t[1] * t[1], t[0] * t[2]);
      }
      case 'gp-sum': {
        if (q.answer.kind !== 'exact') return false;
        // add the terms up literally
        let u = p.a as number;
        let total = 0;
        for (let k = 0; k < (p.n as number); k++) {
          total += u;
          u = (u * (p.rn as number)) / (p.rd as number);
        }
        return close(q.answer.value.toNumber(), total);
      }
      default:
        return false;
    }
  },
});
