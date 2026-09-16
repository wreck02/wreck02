import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { gcd } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Limits of sequences and of sums.
 * Level 1: the limit of u_{n+1} = a u_n + b with |a| < 1 (solve L = aL + b)
 * Level 2: u_{n+1} = (u_n + c)/k, and the sum to infinity of a geometric series
 * Level 3: limits of (an + b)/(cn + d) and (an² + bn + c)/(dn² + en + f)
 * Level 4: does the sequence converge? (choice)
 * Level 5: an infinite telescoping series, or u_{n+1} = √(u_n + c)
 */

const FRACTION = { format: 'fraction' as const };

function cleanOnly(ds: { value: Exact | null; trap: string }[]): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } =>
    d.value !== null && Number.isFinite(d.value.toNumber()) && isCleanExact(d.value).ok);
}

/** Spec-named traps first, then the extras, so the headline mistakes are never shuffled out. */
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

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

/** "\frac{1}{2}u_n", "2u_n", "-\frac{2}{3}u_n". */
function coefTex(p: number, q: number, sym: string): string {
  if (q === 1) return p === 1 ? sym : p === -1 ? `-${sym}` : `${p}${sym}`;
  return `${frac(p, q).toLatex(FRACTION)}${sym}`;
}

// ----------------------------------------------------------------------------- levels 1 and 2

/** u_{n+1} = (p/q)·u_n + b, written either in that form or as (u_n + c)/k. */
function fixedPointQ(rng: RNG, level: Level): Generated | null {
  const divided = level >= 2 && rng.bool(0.5);
  let p: number, q: number, b: number, rhs: string, working: string;
  if (divided) {
    // u_{n+1} = (u_n + c)/k  ⇒  L = c/(k − 1)
    const k = rng.pick([2, 3, 4, 5]);
    const c = rng.nonZeroInt(-4, 8) * (k - 1);
    if (c === 0 || Math.abs(c) > 30) return null;
    p = 1; q = k; b = c / k;
    rhs = `\\frac{u_n + ${c < 0 ? `(${c})` : c}}{${k}}`;
    working = `${k}L = L + ${c < 0 ? `(${c})` : c}$, so $${k - 1}L = ${c}`;
  } else {
    const [pp, qq] = level === 1 ? rng.pick([[1, 2], [1, 2], [1, 3], [1, 4]]) : rng.pick([[1, 3], [1, 4], [2, 3], [3, 4], [2, 5], [-1, 2], [1, 5]]);
    p = pp; q = qq;
    // L = b / (1 − p/q) = bq / (q − p): choose b so that L is an integer
    const unit = (q - p) / gcd(q - p, q);
    b = rng.nonZeroInt(-3, 5) * unit;
    if (b === 0 || Math.abs(b) > 30) return null;
    rhs = `${coefTex(p, q, 'u_n')} ${b >= 0 ? '+' : '-'} ${Math.abs(b)}`;
    working = `L\\left(1 - ${frac(p, q).toLatex(FRACTION)}\\right) = ${b < 0 ? `(${b})` : b}`;
  }
  const a = frac(p, q);
  const L = E(b).div(E(1).sub(a));
  if (!isCleanExact(L).ok || !L.isInteger() || L.isZero() || Math.abs(L.toNumber()) > 60) return null;
  const u1 = rng.intExcluding(-4, 9, [L.toInt()]);
  const must = cleanOnly([
    { value: E(b).div(E(1).add(a)), trap: 'sign error when rearranging: used L = aL + b as L(1 + a) = b' },
    { value: E(b), trap: 'ignored the multiple of u_n, giving L = b' },
    { value: E(b).mul(E(1).sub(a)), trap: 'multiplied by 1 − a instead of dividing' },
  ]);
  const extra = cleanOnly([
    { value: E(b).div(a), trap: 'divided by a instead of by 1 − a' },
    { value: E(b).mul(a), trap: 'multiplied by a instead of dividing by 1 − a' },
    { value: L.add(E(1)), trap: 'arithmetic slip of one' },
    { value: L.sub(E(1)), trap: 'arithmetic slip of one' },
    { value: E(u1), trap: 'quoted the first term' },
    { value: L.mulRat(frac(1, 2).toRat()), trap: 'halved the limit' },
  ]);
  return {
    stem: `A sequence is defined by $u_{n+1} = ${rhs}$, with $u_1 = ${u1}$. The sequence converges to a limit $L$. Find $L$.`,
    answer: { kind: 'exact' as const, value: L },
    options: buildOptions(rng, L, ranked(rng, L, must, extra), FRACTION),
    solution: `At the limit $L = ${rhs.replace(/u_n/g, 'L')}$, so $${working}$ and $L = ${L.toLatex(FRACTION)}$.`,
    trap: 'Put L on both sides and collect: L = aL + b gives L(1 − a) = b, so the limit is b/(1 − a).',
    tags: ['sequences', 'limits', 'recurrence'],
    params: { variant: 'fixed-point', p, q, b, u1 },
    typedAllowed: true,
  };
}

function gpSumQ(rng: RNG): Generated | null {
  const [rn, rd] = rng.pick([[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [-1, 2], [-1, 3], [1, 5], [2, 5]]);
  const a = rng.int(2, 12) * (rd - rn);
  if (Math.abs(a) > 60) return null;
  const r = frac(rn, rd);
  const S = E(a).div(E(1).sub(r));
  if (!isCleanExact(S).ok || !S.isInteger()) return null;
  const terms = [0, 1, 2].map((i) => E(a).mul(r.pow(i)));
  if (terms.some((t) => !isCleanExact(t).ok || t.toRat().d > 12n)) return null;
  const must = cleanOnly([
    { value: E(a).div(E(1).add(r)), trap: 'used a/(1 + r) instead of a/(1 − r)' },
    { value: E(a).div(r), trap: 'divided by r instead of by 1 − r' },
    { value: E(a).mul(E(1).sub(r)), trap: 'multiplied by 1 − r instead of dividing' },
  ]);
  const extra = cleanOnly([
    { value: S.add(E(a)), trap: 'added the first term again' },
    { value: S.sub(E(a)), trap: 'left the first term out' },
    { value: E(a), trap: 'quoted the first term' },
    { value: S.mulRat(frac(1, 2).toRat()), trap: 'halved the sum' },
    { value: E(a).div(E(1).sub(r.mul(r))), trap: 'used r² in place of r' },
  ]);
  return {
    stem: `Find the sum to infinity of the geometric series $${terms.map((t, i) => (i === 0 ? t.toLatex(FRACTION) : `${t.sign() < 0 ? '-' : '+'} ${t.abs().toLatex(FRACTION)}`)).join(' ')} + \\dots$`,
    answer: { kind: 'exact' as const, value: S },
    options: buildOptions(rng, S, ranked(rng, S, must, extra), FRACTION),
    solution: `The common ratio is $r = ${r.toLatex(FRACTION)}$, so $S_\\infty = \\frac{a}{1 - r} = \\frac{${a}}{1 - ${rn < 0 ? `\\left(${r.toLatex(FRACTION)}\\right)` : r.toLatex(FRACTION)}} = ${S.toLatex(FRACTION)}$.`,
    trap: 'S∞ = a/(1 − r): a sign slip in 1 − r (or dividing by r) is the usual error.',
    tags: ['series', 'geometric', 'sum-to-infinity'],
    params: { variant: 'gp-sum', a, rn, rd },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 3

function rationalLimitQ(rng: RNG): Generated | null {
  const quadratic = rng.bool(0.45);
  const a = rng.int(1, 6), c = rng.int(1, 6);
  const b = rng.nonZeroInt(-6, 6), d = rng.nonZeroInt(-6, 6);
  const e = quadratic ? rng.nonZeroInt(-5, 5) : 0;
  const f = quadratic ? rng.nonZeroInt(-5, 5) : 0;
  const L = frac(a, c);
  if (!isCleanExact(L).ok) return null;
  if (L.equals(frac(b, d))) return null; // the "ratio of constants" trap must differ from the answer
  const num = quadratic ? `${a === 1 ? '' : a}n^2 ${b >= 0 ? '+' : '-'} ${Math.abs(b)}n ${e >= 0 ? '+' : '-'} ${Math.abs(e)}` : `${a === 1 ? '' : a}n ${b >= 0 ? '+' : '-'} ${Math.abs(b)}`;
  const den = quadratic ? `${c === 1 ? '' : c}n^2 ${d >= 0 ? '+' : '-'} ${Math.abs(d)}n ${f >= 0 ? '+' : '-'} ${Math.abs(f)}` : `${c === 1 ? '' : c}n ${d >= 0 ? '+' : '-'} ${Math.abs(d)}`;
  const fr = (n: number, den: number): Exact | null => (den === 0 ? null : frac(n, den));
  const must = cleanOnly([
    { value: quadratic ? fr(e, f) : fr(b, d), trap: 'used the ratio of the constant terms' },
    { value: fr(c, a), trap: 'inverted the ratio of the leading coefficients' },
    { value: quadratic ? fr(a + b + e, c + d + f) : fr(a + b, c + d), trap: 'substituted n = 1 instead of taking n → ∞' },
  ]);
  const extra = cleanOnly([
    { value: quadratic ? fr(b, d) : null, trap: 'used the coefficients of n rather than of n²' },
    { value: L.add(E(1)), trap: 'arithmetic slip of one' },
    { value: L.sub(E(1)), trap: 'arithmetic slip of one' },
    { value: frac(a * c, 1), trap: 'multiplied the leading coefficients' },
    { value: frac(a + c, 2), trap: 'averaged the leading coefficients' },
  ]);
  return {
    stem: `Find the limit of $u_n = \\frac{${num}}{${den}}$ as $n \\to \\infty$.`,
    answer: { kind: 'exact' as const, value: L, format: 'fraction' },
    options: buildOptions(rng, L, ranked(rng, L, must, extra), FRACTION),
    solution: `Divide top and bottom by $n^${quadratic ? 2 : 1}$: every other term tends to $0$, leaving $\\frac{${a}}{${c}}${gcd(a, c) > 1 ? ` = ${L.toLatex(FRACTION)}` : ''}$.`,
    trap: 'Only the highest powers survive: the limit is the ratio of the leading coefficients, not of the constants.',
    tags: ['limits', 'sequences', 'rational'],
    params: { variant: 'rational', a, b, c, d, e, f, quadratic },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 4

const KS: [number, number][] = [[1, 2], [1, 3], [-1, 2], [2, 3], [-1, 3], [1, 4], [3, 2], [2, 1], [3, 1], [-1, 1]];

function classifyQ(rng: RNG): Generated | null {
  const [kn, kd] = rng.pick(KS);
  const k = frac(kn, kd);
  const kv = kn / kd;
  const cUnit = kd - kn;
  const c = rng.nonZeroInt(-4, 6) * (cUnit / gcd(cUnit, kd));
  if (c === 0 || Math.abs(c) > 30) return null;
  const fixed = E(c).div(E(1).sub(k));
  if (!fixed.isInteger() || fixed.isZero() || Math.abs(fixed.toNumber()) > 60) return null;
  // For k = −1 the value c/(1 + k) does not exist, so use the constant itself as the second wrong limit.
  const wrongLimit = kn + kd === 0 ? E(c) : E(c).div(E(1).add(k));
  if (!isCleanExact(wrongLimit).ok || wrongLimit.equals(fixed) || wrongLimit.isZero()) return null;
  const u1 = Math.abs(kv) > 1 ? fixed.toInt() + rng.int(1, 5) : rng.intExcluding(-4, 9, [fixed.toInt()]);
  if (kn === -1 && kd === 1 && 2 * u1 === c) return null;
  const converges = Math.abs(kv) < 1;
  const oscillates = kv === -1;
  const texts = {
    limit: `The sequence converges to $${fixed.toLatex(FRACTION)}$.`,
    wrong: `The sequence converges to $${wrongLimit.toLatex(FRACTION)}$.`,
    zero: 'The sequence converges to $0$.',
    grows: 'The terms increase without limit.',
    osc: 'The sequence oscillates between two values.',
  };
  const correct = converges ? texts.limit : oscillates ? texts.osc : texts.grows;
  const wrong = [
    { display: texts.limit, trap: 'solved L = kL + c without checking that |k| < 1' },
    { display: texts.wrong, trap: 'sign error in 1 − k when solving for the limit' },
    { display: texts.zero, trap: 'assumed the terms die away to nothing' },
    { display: texts.grows, trap: 'thought any recurrence with a multiplier grows' },
    { display: texts.osc, trap: 'a negative multiplier alternates in sign but can still converge' },
  ].filter((w) => w.display !== correct);
  return {
    stem: `A sequence is defined by $u_{n+1} = ${coefTex(kn, kd, 'u_n')} ${c >= 0 ? '+' : '-'} ${Math.abs(c)}$, with $u_1 = ${u1}$. Which of the following statements about the sequence is true?`,
    answer: { kind: 'choice' as const, value: correct },
    options: buildChoiceOptions(rng, correct, wrong),
    solution: converges
      ? `$|${k.toLatex(FRACTION)}| < 1$, so the sequence converges; solving $L = ${k.toLatex(FRACTION)}L ${c >= 0 ? '+' : '-'} ${Math.abs(c)}$ gives $L = ${fixed.toLatex(FRACTION)}$.`
      : oscillates
        ? `With multiplier $-1$ the terms alternate: $u_1 = ${u1}$, $u_2 = ${c - u1}$, $u_3 = ${u1}$, so the sequence never settles.`
        : `The distance from the fixed point $${fixed.toLatex(FRACTION)}$ is multiplied by $${k.toLatex(FRACTION)}$ each step, and $|${k.toLatex(FRACTION)}| > 1$, so the terms run away.`,
    trap: 'Solving L = kL + c always produces a number — but it is only the limit when |k| < 1.',
    tags: ['sequences', 'limits', 'convergence'],
    params: { variant: 'classify', kn, kd, c, u1 },
    typedAllowed: false,
  };
}

// ----------------------------------------------------------------------------- level 5

/** Σ 1/((ar + s)(ar + t)) with a common difference t − s; the sum telescopes to (1/(t − s))·Σ of the first few. */
interface Telescope { tex: string; num: number; den: number; partial: string; step: number }

const TELESCOPES: Telescope[] = [
  { tex: '\\frac{1}{r(r+1)}', num: 1, den: 1, partial: '\\frac{1}{r} - \\frac{1}{r+1}', step: 1 },
  { tex: '\\frac{1}{r(r+2)}', num: 3, den: 4, partial: '\\frac{1}{2}\\left(\\frac{1}{r} - \\frac{1}{r+2}\\right)', step: 2 },
  { tex: '\\frac{1}{r(r+3)}', num: 11, den: 18, partial: '\\frac{1}{3}\\left(\\frac{1}{r} - \\frac{1}{r+3}\\right)', step: 3 },
  { tex: '\\frac{1}{(2r-1)(2r+1)}', num: 1, den: 2, partial: '\\frac{1}{2}\\left(\\frac{1}{2r-1} - \\frac{1}{2r+1}\\right)', step: 2 },
  { tex: '\\frac{1}{(2r+1)(2r+3)}', num: 1, den: 6, partial: '\\frac{1}{2}\\left(\\frac{1}{2r+1} - \\frac{1}{2r+3}\\right)', step: 2 },
  { tex: '\\frac{1}{(3r-2)(3r+1)}', num: 1, den: 3, partial: '\\frac{1}{3}\\left(\\frac{1}{3r-2} - \\frac{1}{3r+1}\\right)', step: 3 },
  { tex: '\\frac{1}{(3r+1)(3r+4)}', num: 1, den: 12, partial: '\\frac{1}{3}\\left(\\frac{1}{3r+1} - \\frac{1}{3r+4}\\right)', step: 3 },
  { tex: '\\frac{1}{(4r-3)(4r+1)}', num: 1, den: 4, partial: '\\frac{1}{4}\\left(\\frac{1}{4r-3} - \\frac{1}{4r+1}\\right)', step: 4 },
];

function telescopeQ(rng: RNG): Generated | null {
  const t = rng.pick(TELESCOPES);
  const S = frac(t.num, t.den);
  const must = cleanOnly([
    { value: S.mulRat(frac(t.step, 1).toRat()), trap: `forgot the factor of 1/${t.step} from the partial fractions` },
    { value: S.mulRat(frac(1, t.step).toRat()), trap: 'applied the partial-fraction factor twice' },
    { value: E(1), trap: 'quoted the leading 1/1 of the telescoping sum without the later terms' },
  ]);
  const extra = cleanOnly([
    { value: S.mulRat(frac(1, 2).toRat()), trap: 'halved the sum' },
    { value: S.mulRat(frac(2, 1).toRat()), trap: 'doubled the sum' },
    { value: E(1).sub(S), trap: 'gave the part that cancels rather than the sum' },
    { value: S.add(E(1)), trap: 'added an extra whole term' },
    { value: frac(1, t.step), trap: 'quoted the partial-fraction factor as the answer' },
  ]);
  return {
    stem: `Find the exact value of $\\sum_{r=1}^{\\infty} ${t.tex}$.`,
    answer: { kind: 'exact' as const, value: S, format: 'fraction' },
    options: buildOptions(rng, S, ranked(rng, S, must, extra), FRACTION),
    solution: `In partial fractions the term is $${t.partial}$, so the sum telescopes and everything cancels except the first $${t.step}$ term${t.step > 1 ? 's' : ''}: the total is $${S.toLatex(FRACTION)}$.`,
    trap: 'Telescoping leaves the first few terms only — and the 1/(t − s) factor from the partial fractions is easy to drop.',
    tags: ['series', 'telescoping', 'sum-to-infinity'],
    params: { variant: 'telescope', tex: t.tex },
    typedAllowed: true,
  };
}

function sqrtRecurrenceQ(rng: RNG): Generated | null {
  const L = rng.int(2, 7);
  const c = L * L - L;
  const u1 = rng.int(1, 3);
  const answer = E(L);
  const must = cleanOnly([
    { value: E(1 - L), trap: 'took the negative root of L² = L + c' },
    { value: E(c), trap: 'quoted the constant inside the root' },
    { value: E(L * L), trap: 'gave L² instead of L' },
  ]);
  const extra = cleanOnly([
    { value: frac(c, 2), trap: 'halved the constant' },
    { value: E(L + 1), trap: 'arithmetic slip of one' },
    { value: E(L - 1), trap: 'arithmetic slip of one' },
    { value: E(c + 1), trap: 'solved L = c + 1 instead of L² = L + c' },
    { value: E(u1), trap: 'quoted the first term' },
  ]);
  return {
    stem: `A sequence is defined by $u_{n+1} = \\sqrt{u_n + ${c}}$, with $u_1 = ${u1}$. The sequence converges to a positive limit $L$. Find $L$.`,
    answer: { kind: 'exact' as const, value: answer },
    options: buildOptions(rng, answer, ranked(rng, answer, must, extra)),
    solution: `At the limit $L = \\sqrt{L + ${c}}$, so $L^2 - L - ${c} = 0$, that is $(L - ${L})(L + ${L - 1}) = 0$. The limit is positive, so $L = ${L}$.`,
    trap: 'Square both sides and solve the quadratic — then reject the negative root.',
    tags: ['sequences', 'limits', 'recurrence'],
    params: { variant: 'sqrt', c, u1 },
    typedAllowed: true,
  };
}

// -----------------------------------------------------------------------------

export default defineTemplate({
  id: 'm2.reasoning.sequence-limits',
  module: 'M2',
  topic: 'reasoning',
  title: 'Limits of sequences and sums',
  levels: {
    1: 'the limit of u_{n+1} = ½u_n + 3 and similar recurrences',
    2: 'u_{n+1} = (u_n + c)/k; the sum to infinity of a geometric series',
    3: 'limits of (2n + 1)/(n + 3) and (3n² − 1)/(n² + n)',
    4: 'does u_{n+1} = k u_n + c converge, grow without limit or oscillate?',
    5: 'an infinite telescoping series; the limit of u_{n+1} = √(u_n + c)',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return pickVariant(rng, [(r) => fixedPointQ(r, 1)]);
        case 2: return pickVariant(rng, [(r) => fixedPointQ(r, 2), gpSumQ]);
        case 3: return pickVariant(rng, [rationalLimitQ]);
        case 4: return pickVariant(rng, [classifyQ]);
        default: return pickVariant(rng, [telescopeQ, sqrtRecurrenceQ]);
      }
    });
  },
  verify(q) {
    const p = q.params as { variant: string; p?: number; q?: number; b?: number; u1?: number; a?: number; rn?: number; rd?: number; c?: number; d?: number; e?: number; f?: number; quadratic?: boolean; kn?: number; kd?: number; tex?: string };
    const val = q.answer.kind === 'exact' ? q.answer.value.toNumber() : NaN;
    switch (p.variant) {
      case 'fixed-point': {
        // Iterate the recurrence itself rather than solving L = aL + b.
        let u = p.u1!;
        const a = p.p! / p.q!;
        for (let i = 0; i < 500; i++) u = a * u + p.b!;
        return Math.abs(u - val) < 1e-6;
      }
      case 'gp-sum': {
        // Add the terms of the series one at a time.
        const r = p.rn! / p.rd!;
        let term = p.a!, s = 0;
        for (let i = 0; i < 400; i++) { s += term; term *= r; }
        return Math.abs(s - val) < 1e-6;
      }
      case 'rational': {
        const f = (n: number) => (p.quadratic
          ? (p.a! * n * n + p.b! * n + p.e!) / (p.c! * n * n + p.d! * n + p.f!)
          : (p.a! * n + p.b!) / (p.c! * n + p.d!));
        return Math.abs(f(1e6) - val) < 1e-4 && Math.abs(f(1e7) - val) < 1e-5;
      }
      case 'classify': {
        if (q.answer.kind !== 'choice') return false;
        const k = p.kn! / p.kd!;
        let u = p.u1!;
        const seq: number[] = [u];
        for (let i = 0; i < 400 && Math.abs(u) < 1e12; i++) { u = k * u + p.c!; seq.push(u); }
        const last = seq[seq.length - 1], prev = seq[seq.length - 2], before = seq[seq.length - 3];
        let expected: string;
        if (Math.abs(last) > 1e11) expected = 'The terms increase without limit.';
        else if (Math.abs(last - before) < 1e-9 && Math.abs(last - prev) > 1e-9) expected = 'The sequence oscillates between two values.';
        else if (Math.abs(last - prev) < 1e-9) expected = `The sequence converges to $${Math.round(last)}$.`;
        else return false;
        return expected === q.answer.value;
      }
      case 'telescope': {
        // Add up a lot of terms of the series as written.
        const m = /\\frac\{1\}\{(.+)\}/.exec(p.tex!);
        if (!m) return false;
        const factors = m[1].match(/\(?(\d*)r\s*([+-]\s*\d+)?\)?/g) ?? [];
        const parse = (s: string): [number, number] => {
          const mm = /(\d*)r\s*([+-]\s*\d+)?/.exec(s)!;
          return [mm[1] === '' ? 1 : Number(mm[1]), mm[2] ? Number(mm[2].replace(/\s+/g, '')) : 0];
        };
        if (factors.length !== 2) return false;
        const [a1, b1] = parse(factors[0]);
        const [a2, b2] = parse(factors[1]);
        let s = 0;
        for (let r = 1; r <= 40000; r++) s += 1 / ((a1 * r + b1) * (a2 * r + b2));
        return Math.abs(s - val) < 1e-3;
      }
      case 'sqrt': {
        let u = p.u1!;
        for (let i = 0; i < 200; i++) u = Math.sqrt(u + p.c!);
        return Math.abs(u - val) < 1e-6;
      }
      default:
        return false;
    }
  },
});
