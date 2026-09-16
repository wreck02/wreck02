import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, Exact } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { poly, factor } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Polynomial division.
 * Level 1: (x² + 5x + 6) ÷ (x + 2): the quotient
 * Level 2: (2x² + 3x − 5) ÷ (x − 1), remainder 0: the quotient with a leading coefficient
 * Level 3: cubic ÷ linear with a non-zero remainder: the remainder, or the quotient
 * Level 4: cubic ÷ (x − a) or (2x − 1) with a missing term or a leading coefficient: the quotient
 * Level 5: quadratic divisor (x² + 1, x² − x + 1): the linear remainder, or the coefficient making it exact
 */

type Candidate = { value: Exact | null; trap: string };

function cleanOnly(ds: Candidate[]): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } => d.value !== null && Number.isFinite(d.value.toNumber()) && isCleanExact(d.value).ok);
}

function ranked(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], count = 4): Distractor[] {
  const seen: Exact[] = [answer];
  const out: Distractor[] = [];
  const take = (d: Distractor) => {
    if (out.length >= count || seen.some((s) => s.equals(d.value))) return;
    seen.push(d.value);
    out.push(d);
  };
  must.forEach(take);
  rng.shuffle(extra).forEach(take);
  return out;
}

function options(rng: RNG, answer: Exact, must: Candidate[], extra: Candidate[]) {
  return buildOptions(rng, answer, ranked(rng, answer, cleanOnly(must), cleanOnly(extra)));
}

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

type Wrong = { display: string; trap: string };

/** Choice options, or null when fewer than four distinct wrong displays survive. */
function choiceOrNull(rng: RNG, correct: string, wrong: (Wrong | null)[]) {
  const ws = wrong.filter((w): w is Wrong => w !== null);
  const distinct = new Set(ws.map((w) => w.display).filter((d) => d !== correct));
  if (distinct.size < 4) return null;
  return buildChoiceOptions(rng, correct, ws);
}

/** Multiply two polynomials (highest power first). */
function mul(a: number[], b: number[]): number[] {
  const out = new Array<number>(a.length + b.length - 1).fill(0);
  a.forEach((x, i) => b.forEach((y, j) => { out[i + j] += x * y; }));
  return out;
}

/** Add two polynomials (highest power first), right-aligned. */
function add(a: number[], b: number[]): number[] {
  const n = Math.max(a.length, b.length);
  const out = new Array<number>(n).fill(0);
  a.forEach((x, i) => { out[n - a.length + i] += x; });
  b.forEach((x, i) => { out[n - b.length + i] += x; });
  return out;
}

/** Strip leading zeros so [0, 0, 3, 1] reads as 3x + 1. */
function trim(a: number[]): number[] {
  let i = 0;
  while (i < a.length - 1 && a[i] === 0) i++;
  return a.slice(i);
}

function sameCoefs(a: number[], b: number[]): boolean {
  const x = trim(a), y = trim(b);
  return x.length === y.length && x.every((v, i) => Math.abs(v - y[i]) < 1e-9);
}

/** Synthetic division of coefs (highest first) by (x − root): quotient coefficients and remainder. */
function synthetic(coefs: number[], root: number): { q: number[]; r: number } {
  const q: number[] = [];
  let carry = 0;
  coefs.forEach((c, i) => {
    carry = c + carry * root;
    if (i < coefs.length - 1) q.push(carry);
  });
  return { q, r: carry };
}

const P = (coefs: number[]): string => `$${poly(coefs)}$`;

// ----------------------------------------------------------------------------- levels 1–2: exact division of a quadratic

function quadraticQ(level: Level) {
  return (rng: RNG): Generated | null => {
    const a = rng.nonZeroInt(-5, 5); // divisor (x − a)
    const p = level === 1 ? 1 : rng.pick([2, 2, 3]);
    const d = rng.nonZeroInt(-6, 6); // quotient (px + d)
    if (d === a || d === -a || (level === 2 && d % p === 0)) return null; // keep the quotient px + d without a common factor
    const divisor = [1, -a];
    const quotient = [p, d];
    const dividend = mul(divisor, quotient);
    const [, b, c] = dividend;
    if (b === 0 || c === 0) return null;
    const correct = poly(quotient);
    const wrong: (Wrong | null)[] = [
      { display: poly([p, -d]), trap: 'sign of the constant in the quotient wrong: check by multiplying back' },
      { display: poly([p, b]), trap: 'copied the x-coefficient of the dividend without subtracting' },
      { display: poly([p, b - p * a]), trap: 'sign error in the subtraction step' },
      level === 1 ? { display: poly([1, a]), trap: 'gave the divisor' } : { display: poly([1, d]), trap: 'dropped the leading coefficient' },
      { display: poly([p, d + 1]), trap: 'arithmetic slip' },
      { display: poly([p, d - 1]), trap: 'arithmetic slip' },
      level === 2 ? { display: poly([p, d * p]), trap: `multiplied the constant by ${p} as well` } : { display: poly([1, -a]), trap: 'gave the divisor with the sign changed' },
    ];
    const opts = choiceOrNull(rng, correct, wrong);
    if (!opts) return null;
    const stem = level === 1
      ? `Find the quotient when ${P(dividend)} is divided by $${factor(1, -a)}$.`
      : rng.bool(0.5)
        ? `${P(dividend)} is divided by $${factor(1, -a)}$. The remainder is $0$. Find the quotient.`
        : `Given that $${factor(1, -a)}$ is a factor of ${P(dividend)}, find the quotient when ${P(dividend)} is divided by $${factor(1, -a)}$.`;
    const br = (v: number) => (v < 0 ? `(${v})` : `${v}`);
    const solution = level === 1
      ? `Factorise: $${poly(dividend)} = ${factor(1, -a)}${factor(1, d)}$, so the quotient is $${correct}$. (Check: $${br(-a)} \\times ${br(d)} = ${c}$.)`
      : `The quotient must start $${p}x$ to give $${p}x^{2}$, and its constant must be $${c} \\div ${br(-a)} = ${d}$ to give the constant $${c}$. Check the middle term: $${d} ${-p * a >= 0 ? '+' : '-'} ${Math.abs(p * a)} = ${b}$. So the quotient is $${correct}$.`;
    return {
      stem,
      answer: { kind: 'choice', value: correct },
      options: opts,
      solution,
      trap: 'Fix the first term from the x² coefficient and the last from the constant, then check the middle term by multiplying back.',
      tags: ['polynomial-division', 'quotient'],
      params: { variant: 'quotient', dividend, divisor, quotient, remainder: [0] },
      typedAllowed: false,
    };
  };
}

// ----------------------------------------------------------------------------- levels 3–4: cubic ÷ linear

function cubicQ(level: Level) {
  return (rng: RNG): Generated | null => {
    // divisor (m x − s) with root s/m; level 3 is monic (x ± 1, x ± 2)
    const m = level === 4 && rng.bool(0.35) ? 2 : 1;
    const s = m === 2 ? rng.pick([1, -1]) : rng.pick(level === 3 ? [1, 2, -1, -2] : [1, 2, 3, -1, -2, -3]);
    const lead = level === 4 && m === 1 && rng.bool(0.4) ? 2 : 1;
    let qc = [lead, rng.nonZeroInt(-5, 5), rng.nonZeroInt(-6, 6)]; // quotient
    if (level === 4 && m === 1 && rng.bool(0.5)) {
      // force a missing term in the dividend: x² coefficient q1·m − lead·s... simplest is to solve for it
      const which = rng.pick(['x2', 'x1']);
      if (which === 'x2') qc = [lead, lead * s, qc[2]]; // (x − s)(lead x² + q1 x + q2): x² coefficient q1 − lead·s = 0
      else qc = [lead, qc[1], qc[1] * s]; // x coefficient q2 − q1·s = 0
    }
    const R = rng.nonZeroInt(-9, 9);
    const divisor = [m, -s];
    const dividend = add(mul(divisor, qc), [R]);
    if (dividend.some((c) => Math.abs(c) > 20)) return null;
    if (level === 3 && dividend.slice(1).some((c) => c === 0)) return null; // level 3 keeps every term present
    const askRemainder = level === 3 && rng.bool(0.4);
    const root = s / m;
    const dvTex = factor(m, -s);

    if (askRemainder) {
      const answer = E(R);
      const wrongRoot = synthetic(dividend, -root).r;
      const must: Candidate[] = [
        { value: Number.isInteger(wrongRoot) ? E(wrongRoot) : null, trap: `evaluated at x = ${-root} instead of x = ${root}` },
        { value: E(qc[2]), trap: 'gave the constant of the quotient instead of the remainder' },
      ];
      const extra: Candidate[] = [
        { value: E(-R), trap: 'sign of the remainder flipped' },
        { value: E(dividend[3]), trap: 'read off the constant term of the dividend' },
        { value: E(R - qc[2] * s * 2), trap: 'sign error in the last subtraction step' },
        { value: E(R + 1), trap: 'arithmetic slip' },
        { value: E(R - 1), trap: 'arithmetic slip' },
      ];
      return {
        stem: `Find the remainder when ${P(dividend)} is divided by $${dvTex}$.`,
        answer: { kind: 'exact', value: answer },
        options: options(rng, answer, must, extra),
        solution: `Quickest is the remainder theorem: the remainder is $f(${root}) = ${R}$. (Dividing gives quotient $${poly(qc)}$ and remainder $${R}$.)`,
        trap: 'The remainder is the value of the dividend at the root of the divisor; do not confuse it with the last coefficient of the quotient.',
        tags: ['polynomial-division', 'remainder'],
        params: { variant: 'remainder', dividend, divisor, quotient: qc, remainder: [R] },
        typedAllowed: true,
      };
    }

    const correct = poly(qc);
    const wrongSign = synthetic(dividend, -root).q.map((c) => c / m);
    const firstStepSlip = [qc[0], qc[1] - 2 * qc[0] * root, qc[2]];
    const secondStepSlip = [qc[0], qc[1], qc[2] - 2 * qc[1] * root];
    const dropped = dividend.indexOf(0) > 0 ? synthetic(dividend.filter((c, i) => !(c === 0 && i === dividend.indexOf(0))), root).q.map((c) => c / m) : null;
    const isInt = (cs: number[]) => cs.every((c) => Number.isInteger(c));
    const wrong: (Wrong | null)[] = [
      isInt(wrongSign) ? { display: poly(wrongSign), trap: `divided by (x ${-root >= 0 ? '-' : '+'} ${Math.abs(root)}) instead: the sign of the root was wrong` } : null,
      isInt(firstStepSlip) ? { display: poly(firstStepSlip), trap: 'sign error in the first subtraction step' } : null,
      isInt(secondStepSlip) ? { display: poly(secondStepSlip), trap: 'sign error in the second subtraction step' } : null,
      { display: poly([qc[0], qc[1], qc[2] + R]), trap: 'added the remainder into the constant term of the quotient' },
      dropped && isInt(dropped) ? { display: poly(dropped), trap: 'dropped the zero coefficient of the missing term, so the quotient lost a degree' } : null,
      m === 2 ? { display: poly(qc.map((c) => c * 2)), trap: `divided by (x ${-root >= 0 ? '-' : '+'} ${Math.abs(root)}) but forgot to halve the quotient for the factor 2` } : null,
      lead === 2 ? { display: poly([1, qc[1], qc[2]]), trap: 'dropped the leading coefficient' } : null,
      { display: poly([qc[0], -qc[1], qc[2]]), trap: 'sign of the middle term wrong' },
      { display: poly(dividend.slice(0, 3)), trap: 'copied the first three coefficients of the dividend' },
    ];
    const opts = choiceOrNull(rng, correct, wrong);
    if (!opts) return null;
    return {
      stem: rng.bool(0.5)
        ? `When ${P(dividend)} is divided by $${dvTex}$ the quotient is $Q(x)$ and the remainder is $${R}$. Find $Q(x)$.`
        : `${P(dividend)} is divided by $${dvTex}$. Find the quotient.`,
      answer: { kind: 'choice', value: correct },
      options: opts,
      solution: `$${poly(dividend)} = (${poly(divisor)})(${correct}) ${R >= 0 ? '+' : '-'} ${Math.abs(R)}$: match the $x^{3}$ term, then the constant term, then check the middle coefficients. The quotient is $${correct}$${dividend.slice(1).includes(0) ? ' (keep a zero for the missing term of the dividend)' : ''}.`,
      trap: 'Write out every coefficient of the dividend (including zeros), and check each step by multiplying back: sign slips in the subtractions are the usual error.',
      tags: ['polynomial-division', 'quotient', 'cubic'],
      params: { variant: 'quotient', dividend, divisor, quotient: qc, remainder: [R] },
      typedAllowed: false,
    };
  };
}

// ----------------------------------------------------------------------------- level 5: quadratic divisor

const QUADRATIC_DIVISORS: [number, number][] = [[0, 1], [0, 1], [-1, 1], [1, 1], [0, 2], [0, -2], [-2, 3], [2, 2]]; // x² + p x + q

function linearRemainderQ(rng: RNG): Generated | null {
  const [p, qd] = rng.pick(QUADRATIC_DIVISORS);
  const m = rng.nonZeroInt(-4, 4); // quotient (x + m)
  const r = rng.nonZeroInt(-5, 5), s = rng.nonZeroInt(-6, 6); // remainder r x + s
  if (Math.abs(r) === Math.abs(s)) return null;
  const divisor = [1, p, qd];
  const quotient = [1, m];
  const remainder = [r, s];
  const dividend = add(mul(divisor, quotient), remainder);
  if (dividend.some((c) => Math.abs(c) > 20) || dividend[1] === 0 && dividend[2] === 0) return null;
  const correct = poly(remainder);
  const wrong: (Wrong | null)[] = [
    { display: poly([-r, -s]), trap: 'subtracted the wrong way round in the last step (remainder sign flipped)' },
    { display: poly([r, -s]), trap: 'sign of the constant term wrong' },
    { display: poly([-r, s]), trap: 'sign of the x term wrong' },
    { display: poly([s, r]), trap: 'coefficients of the remainder swapped' },
    { display: poly(quotient), trap: 'gave the quotient instead of the remainder' },
    { display: poly([2 * p * m + r, 2 * qd * m + s]), trap: 'added instead of subtracting in the last step' },
    { display: poly([r, s + m]), trap: 'arithmetic slip in the constant' },
  ];
  const opts = choiceOrNull(rng, correct, wrong);
  if (!opts) return null;
  return {
    stem: `Find the remainder when ${P(dividend)} is divided by ${P(divisor)}.`,
    answer: { kind: 'choice', value: correct },
    options: opts,
    solution: `The quotient is linear: $${poly(dividend)} = (${poly(divisor)})(${poly(quotient)}) + R(x)$. Matching $x^{3}$ and $x^{2}$ gives the quotient $${poly(quotient)}$; multiplying out and subtracting leaves $R(x) = ${correct}$.`,
    trap: 'Dividing by a quadratic leaves a remainder of degree at most 1: find the linear quotient from the top two terms, then subtract carefully.',
    tags: ['polynomial-division', 'remainder', 'quadratic-divisor'],
    params: { variant: 'linear-remainder', dividend, divisor, quotient, remainder },
    typedAllowed: false,
  };
}

function exactDivisionQ(rng: RNG): Generated | null {
  const [p, qd] = rng.pick(QUADRATIC_DIVISORS);
  const m = rng.nonZeroInt(-5, 5);
  const divisor = [1, p, qd];
  const quotient = [1, m];
  const dividend = mul(divisor, quotient); // x³ + (p + m)x² + (q + pm)x + qm
  const slot = rng.pick([1, 2, 3]); // which coefficient is hidden
  const k = dividend[slot];
  if (dividend.some((c) => Math.abs(c) > 24)) return null;
  if (dividend.slice(1).filter((c, i) => c === 0 && i + 1 !== slot).length > 1) return null;
  const answer = E(k);
  const shown = dividend.map((c, i) => (i === slot ? null : c));
  const tex = `x^{3}${shown.slice(1).map((c, i) => {
    const power = ['x^{2}', 'x', ''][i];
    if (c === null) return ` + k${power}`;
    if (c === 0) return '';
    return ` ${c < 0 ? '-' : '+'} ${Math.abs(c) === 1 && power ? '' : Math.abs(c)}${power}`;
  }).join('')}`;
  const wrongM = mul(divisor, [1, -m])[slot];
  const must: Candidate[] = [
    { value: E(wrongM), trap: 'sign of the quotient constant wrong (used x − m instead of x + m)' },
    { value: E(-k), trap: 'sign slip' },
  ];
  const extra: Candidate[] = [
    { value: E(m), trap: 'gave the constant of the quotient' },
    { value: slot === 2 ? E(qd) : slot === 3 ? E(qd + m) : E(m), trap: slot === 2 ? 'forgot the cross term pm' : slot === 3 ? 'added instead of multiplying the constants' : 'forgot to add p' },
    { value: E(k + 1), trap: 'arithmetic slip' },
    { value: E(k - 1), trap: 'arithmetic slip' },
    { value: E(2 * k), trap: 'doubled' },
  ];
  const how = slot === 3 ? `the constant term is $${qd} \\times ${m} = ${k}$` : slot === 1 ? `the $x^{2}$ coefficient is $${p} + ${m} = ${k}$` : `the $x$ coefficient is $${qd} ${p * m >= 0 ? '+' : '-'} ${Math.abs(p * m)} = ${k}$`;
  return {
    stem: `$${tex}$ is exactly divisible by ${P(divisor)}. Find the value of $k$.`,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, must, extra),
    solution: `Exact division means $${tex} = (${poly(divisor)})(x + c)$ for some constant $c$. Matching the ${slot === 3 ? '$x^{2}$ coefficient' : slot === 1 ? 'constant term' : '$x^{2}$ coefficient'} gives $c = ${m}$, so ${how}.`,
    trap: 'If the division is exact the dividend is (divisor) × (x + c); find c from a known coefficient and then read off k.',
    tags: ['polynomial-division', 'exact', 'unknown-coefficient'],
    params: { variant: 'exact', dividend: shown, divisor, quotient, slot },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'm2.polynomials.division',
  module: 'M2',
  topic: 'polynomials',
  title: 'Polynomial division',
  levels: {
    1: '(x² + 5x + 6) ÷ (x + 2): quotient',
    2: '(2x² + 3x − 5) ÷ (x − 1), remainder 0: quotient with a leading coefficient',
    3: 'cubic ÷ (x ± a) with a non-zero remainder: remainder or quotient',
    4: 'cubic ÷ (x − a) or (2x − 1), missing term or leading coefficient: quotient',
    5: 'quadratic divisor: linear remainder, or the coefficient making the division exact',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return quadraticQ(1)(rng);
        case 2: return quadraticQ(2)(rng);
        case 3: return cubicQ(3)(rng);
        case 4: return cubicQ(4)(rng);
        default: return pickVariant(rng, [linearRemainderQ, exactDivisionQ]);
      }
    });
  },
  verify(q) {
    const p = q.params as { variant: string; dividend: (number | null)[]; divisor: number[]; quotient: number[]; remainder?: number[]; slot?: number };
    if (q.options.filter((o) => o.correct).length !== 1) return false;
    if (p.variant === 'exact') {
      if (q.answer.kind !== 'exact') return false;
      // (divisor)(quotient) must reproduce the dividend once k is filled in with the answer
      const k = q.answer.value.toNumber();
      const full = p.dividend.map((c, i) => (i === p.slot ? k : (c as number)));
      return sameCoefs(mul(p.divisor, p.quotient), full);
    }
    // multiply back: quotient × divisor + remainder = dividend
    const rebuilt = add(mul(p.quotient, p.divisor), p.remainder ?? [0]);
    if (!sameCoefs(rebuilt, p.dividend as number[])) return false;
    if (q.answer.kind === 'exact') return p.variant === 'remainder' && q.answer.value.toNumber() === (p.remainder ?? [0])[0];
    if (q.answer.kind !== 'choice') return false;
    const expected = p.variant === 'linear-remainder' ? poly(p.remainder!) : poly(p.quotient);
    return q.answer.value === expected;
  },
});
