import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, surd, Exact, rat } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { gcd } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Definite integrals with clean limits.
 * Level 1: ∫₀² 3x² dx = 8 — one term from 0
 * Level 2: ∫₁³ (2x + 1) dx = 10 — two terms, both limits substituted
 * Level 3: ∫₁⁴ √x dx = 14/3, ∫₁² 1/x² dx = 1/2 — fractional and negative powers
 * Level 4: odd/even tricks over [−a, a]; ∫₀¹ (x − 1)² dx = 1/3
 * Level 5: find k: ∫₀ᵏ (x² − 4) dx = 0 → 2√3, ∫₁ᵏ 2x dx = 15 → 4; two-term fractional-power integrands
 */

/** A term (cn/cd) · x^(pn/pd). JSON-friendly so it can live in params. */
type Term = [number, number, number, number];

function norm(cn: number, cd: number, pn: number, pd: number): Term {
  if (cd < 0) { cn = -cn; cd = -cd; }
  if (pd < 0) { pn = -pn; pd = -pd; }
  const g = gcd(cn, cd) || 1, h = gcd(pn, pd) || 1;
  return [cn / g, cd / g, pn / h, pd / h];
}

const T = (c: number, p: number): Term => norm(c, 1, p, 1);
const TF = (cn: number, cd: number, pn: number, pd: number): Term => norm(cn, cd, pn, pd);

const integrate = (ts: Term[]): Term[] => ts.map(([cn, cd, pn, pd]) => norm(cn * pd, cd * (pn + pd), pn + pd, pd));
const differentiate = (ts: Term[]): Term[] => ts.filter(([, , pn]) => pn !== 0).map(([cn, cd, pn, pd]) => norm(cn * pn, cd * pd, pn - pd, pd));
/** Wrong rules, each a "student's antiderivative". */
const noDivision = (ts: Term[]): Term[] => ts.map(([cn, cd, pn, pd]) => norm(cn, cd, pn + pd, pd));
const oldPower = (ts: Term[]): Term[] => ts.map(([cn, cd, pn, pd]) => (pn === 0 ? norm(cn, cd, 1, 1) : norm(cn * pd, cd * pn, pn + pd, pd)));
const samePower = (ts: Term[]): Term[] => ts.map(([cn, cd, pn, pd]) => norm(cn * pd, cd * (pn + pd), pn, pd));
const downPower = (ts: Term[]): Term[] => ts.map(([cn, cd, pn, pd]) => (pn < 0 ? norm(cn * pd, cd * (pn - pd), pn - pd, pd) : norm(cn * pd, cd * (pn + pd), pn + pd, pd)));
const negFlip = (ts: Term[]): Term[] => integrate(ts).map(([cn, cd, pn, pd]) => (pn < 0 ? norm(-cn, cd, pn, pd) : [cn, cd, pn, pd]));

function evalTerms(ts: Term[], x: number): number {
  return ts.reduce((s, [cn, cd, pn, pd]) => s + (cn / cd) * Math.pow(x, pn / pd), 0);
}

/** Exact value of a term list at an integer x (null when it does not exist, e.g. 1/0). */
function evalExact(ts: Term[], x: number): Exact | null {
  try {
    return ts.reduce((s, [cn, cd, pn, pd]) => {
      if (x === 0 && pn <= 0) { if (pn === 0) return s.add(frac(cn, cd)); throw new Error('pole'); }
      const base = E(x);
      const power = pd === 1 ? base.pow(pn) : base.powRat(rat(pn, pd));
      return s.add(frac(cn, cd).mul(power));
    }, Exact.ZERO);
  } catch {
    return null;
  }
}

/** [F(b) − F(a)] for the given antiderivative terms. */
function bracket(F: Term[], a: number, b: number): Exact | null {
  const fb = evalExact(F, b), fa = evalExact(F, a);
  return fb && fa ? fb.sub(fa) : null;
}

const defInt = (f: Term[], a: number, b: number): Exact | null => bracket(integrate(f), a, b);

function powerTex(pn: number, pd: number): { num: string; den: string } {
  const m = Math.abs(pn);
  let s: string;
  if (pd === 1) s = m === 0 ? '' : m === 1 ? 'x' : `x^{${m}}`;
  else if (pd === 2) s = m === 1 ? '\\sqrt{x}' : m === 3 ? 'x\\sqrt{x}' : `x^{${(m - 1) / 2}}\\sqrt{x}`;
  else s = `x^{\\frac{${m}}{${pd}}}`;
  return pn >= 0 ? { num: s, den: '' } : { num: '', den: s };
}

function termsTex(ts: Term[]): string {
  let out = '';
  for (const [cn, cd, pn, pd] of ts) {
    if (cn === 0) continue;
    const mag = Math.abs(cn);
    const { num, den } = powerTex(pn, pd);
    let body: string;
    if (den === '' && cd === 1) body = num === '' ? `${mag}` : `${mag === 1 ? '' : mag}${num}`;
    else if (den === '') body = mag === 1 && num !== '' ? `\\frac{${num}}{${cd}}` : `\\frac{${mag}}{${cd}}${num}`;
    else body = `\\frac{${mag}}{${cd === 1 ? '' : cd}${den}}`;
    out += out === '' ? `${cn < 0 ? '-' : ''}${body}` : `${cn < 0 ? ' - ' : ' + '}${body}`;
  }
  return out || '0';
}

/** Antiderivative written with fractional indices, as in a worked solution: \frac{2}{3}x^{3/2}. */
function antiTex(F: Term[]): string {
  return F.map(([cn, cd, pn, pd], i) => {
    const mag = Math.abs(cn);
    const pw = pd === 1 ? (pn === 1 ? 'x' : `x^{${pn}}`) : `x^{${pn}/${pd}}`;
    const coef = cd === 1 ? (mag === 1 ? '' : `${mag}`) : `\\frac{${mag}}{${cd}}`;
    return `${i === 0 ? (cn < 0 ? '-' : '') : cn < 0 ? ' - ' : ' + '}${coef}${pw}`;
  }).join('');
}

function integralTex(ts: Term[], a: number | string, b: number | string): string {
  const body = termsTex(ts);
  const nonZero = ts.filter((t) => t[0] !== 0).length;
  const lim = `\\int_{${a}}^{${b}}`;
  return nonZero > 1 ? `${lim} \\left(${body}\\right)dx` : `${lim} ${body}\\,dx`;
}

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
  return buildOptions(rng, answer, ranked(rng, answer, cleanOnly(must), cleanOnly(extra)), { format: 'fraction' });
}

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

function simpson(f: (x: number) => number, a: number, b: number, n = 2000): number {
  if (a === b) return 0;
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
  return (s * h) / 3;
}

/** The standard wrong-route values for ∫_a^b f: limits swapped/added/forgotten and wrong power rules. */
function standardWrong(f: Term[], a: number, b: number): Candidate[] {
  const F = integrate(f);
  const Fb = evalExact(F, b), Fa = evalExact(F, a);
  return [
    { value: Fa && Fb ? Fa.sub(Fb) : null, trap: 'subtracted the wrong way round: F(a) − F(b) instead of F(b) − F(a)' },
    { value: bracket(noDivision(f), a, b), trap: 'raised the power but did not divide by the new power' },
    { value: bracket(oldPower(f), a, b), trap: 'divided by the old power instead of the new one' },
    { value: a !== 0 ? Fb : null, trap: 'forgot to subtract the value at the lower limit' },
    { value: Fa && Fb && a !== 0 ? Fb.add(Fa) : null, trap: 'added F(a) instead of subtracting it' },
    { value: bracket(differentiate(f), a, b), trap: 'differentiated instead of integrating' },
    { value: bracket(samePower(f), a, b), trap: 'divided by the new power but did not raise the power' },
    { value: bracket(f, a, b), trap: 'substituted the limits into the integrand instead of integrating' },
  ];
}

function evaluateQ(rng: RNG, f: Term[], a: number, b: number, must: Candidate[], extra: Candidate[], solution: string, trap: string, variant: string, tags: string[]): Generated | null {
  const answer = defInt(f, a, b);
  if (!answer || !isCleanExact(answer).ok) return null;
  return {
    stem: `Evaluate $${integralTex(f, a, b)}$.`,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, must, extra),
    solution,
    trap,
    tags: ['integration', 'definite', ...tags],
    params: { variant, integrand: f, a, b },
    typedAllowed: true,
  };
}

const L = (x: Exact | null): string => (x ? x.toLatex({ format: 'fraction' }) : '?');

/** The fractional powers of the square-number limits a candidate needs: "4^{1/2} = 2, 4^{3/2} = 8". */
function powersHint(f: Term[], a: number, b: number): string {
  if (!f.some((t) => t[3] === 2)) return '';
  const facts: string[] = [];
  for (const x of [a, b]) {
    if (x === 1 || x === 0) continue;
    const r = Math.round(Math.sqrt(x));
    facts.push(`${x}^{1/2} = ${r}`);
    if (f.some((t) => t[2] > 0 && t[3] === 2)) facts.push(`${x}^{3/2} = ${r ** 3}`);
  }
  return facts.length ? ` Use $${facts.join('$, $')}$.` : '';
}
const brNeg = (x: Exact): string => (x.sign() < 0 ? `\\left(${x.toLatex({ format: 'fraction' })}\\right)` : x.toLatex({ format: 'fraction' }));

// ----------------------------------------------------------------------------- level 1

function monomialQ(rng: RNG): Generated | null {
  const n = rng.pick([1, 2, 2, 3]);
  const a = n === 1 ? rng.pick([1, 2, 4, 6, 3]) : n === 2 ? rng.pick([1, 3, 6, 2, 3]) : rng.pick([1, 4, 2, 4]);
  const b = n === 3 ? rng.pick([1, 2]) : rng.pick([1, 2, 3, 2]);
  const f = [T(a, n)];
  const answer = defInt(f, 0, b)!;
  if (!answer.isInteger() && rng.bool(0.7)) return null;
  const F = integrate(f);
  const w = standardWrong(f, 0, b);
  return evaluateQ(rng, f, 0, b, [w[1], w[0]], [w[2], w[5], w[6], w[7]],
    `$\\left[${antiTex(F)}\\right]_{0}^{${b}} = ${L(evalExact(F, b))} - 0 = ${L(answer)}$.`,
    'Integrate first (raise the power, divide by the new power), then substitute the top limit minus the bottom limit.',
    'evaluate', ['monomial']);
}

// ----------------------------------------------------------------------------- level 2

function twoTermQ(rng: RNG): Generated | null {
  const quadratic = rng.bool(0.4);
  const p = quadratic ? rng.pick([1, 3, 6, 3]) : rng.pick([1, 2, 3, 4, 2]);
  const q = rng.nonZeroInt(-6, 6);
  const f = quadratic ? [T(p, 2), T(q, 0)] : [T(p, 1), T(q, 0)];
  const a = rng.pick([0, 1, 1, 2]);
  const b = a + rng.pick([1, 2, 3, 2]);
  const answer = defInt(f, a, b)!;
  if ((!answer.isInteger() && rng.bool(0.7)) || answer.isZero() || Math.abs(answer.toNumber()) > 80) return null;
  const F = integrate(f);
  const w = standardWrong(f, a, b);
  return evaluateQ(rng, f, a, b, [w[0], a !== 0 ? w[3] : w[1]], [w[1], w[2], w[4], w[6], w[7]],
    `$\\left[${antiTex(F)}\\right]_{${a}}^{${b}} = ${brNeg(evalExact(F, b)!)} - ${brNeg(evalExact(F, a)!)} = ${L(answer)}$.`,
    'Substitute both limits into the antiderivative and subtract: F(b) − F(a), keeping the signs of each bracket.',
    'evaluate', ['linear']);
}

// ----------------------------------------------------------------------------- level 3

const SQUARE_LIMITS: [number, number][] = [[1, 4], [1, 4], [1, 9], [4, 9]];

function fractionalQ(rng: RNG): Generated | null {
  const kind = rng.pick(['sqrt', 'sqrt', 'invsqrt', 'inv2', 'inv2', 'inv3']);
  const k = rng.pick([1, 1, 1, 2, 3]);
  let f: Term[], a: number, b: number;
  if (kind === 'sqrt' || kind === 'invsqrt') {
    [a, b] = rng.pick(SQUARE_LIMITS);
    f = [TF(k, 1, kind === 'sqrt' ? 1 : -1, 2)];
  } else {
    [a, b] = rng.pick(kind === 'inv2' ? [[1, 2], [1, 3], [1, 4], [2, 4], [1, 2]] : [[1, 2], [1, 3], [2, 4]]);
    f = [T(k, kind === 'inv2' ? -2 : -3)];
  }
  const F = integrate(f);
  const w = standardWrong(f, a, b);
  const negPower = kind === 'inv2' || kind === 'inv3';
  const must = negPower
    ? [{ value: bracket(negFlip(f), a, b), trap: 'sign error: ∫ x^{−2} dx = −x^{−1}, the new power −1 makes the term negative' }, w[0]]
    : [w[1], w[2]];
  const extra = [
    { value: bracket(downPower(f), a, b), trap: 'took the power down by one instead of up' },
    w[0], w[1], w[2], w[6], w[7],
  ];
  const [cn, , pn, pd] = f[0];
  const asPower = `${cn === 1 ? '' : cn}x^{${pd === 1 ? pn : `${pn}/${pd}`}}`;
  return evaluateQ(rng, f, a, b, must, extra,
    `Write the integrand as $${asPower}$: $\\left[${antiTex(F)}\\right]_{${a}}^{${b}} = ${brNeg(evalExact(F, b)!)} - ${brNeg(evalExact(F, a)!)} = ${L(defInt(f, a, b))}$.${powersHint(f, a, b)}`,
    'Rewrite roots and reciprocals as powers; the new power of x^{−2} is −1, and 4^{3/2} = 8, 9^{3/2} = 27.',
    'evaluate', ['fractional-powers']);
}

// ----------------------------------------------------------------------------- level 4

function symmetricQ(rng: RNG): Generated | null {
  const a = rng.pick([1, 2, 2, 3]);
  const p = rng.pick([1, 1, 2, -1]);
  const q = rng.pick([0, 0, 1, 2, -3, -1]);
  const r = rng.pick([1, 2, 3, 4, 5, 6]) * rng.pick([1, 1, 1, -1]);
  const f = [T(p, 3), ...(q === 0 ? [] : [T(q, 1)]), T(r, 0)];
  const F = integrate(f);
  const answer = defInt(f, -a, a)!; // = 2ar
  const evenAll = evalExact(F, a)!.mulRat(2);
  const must: Candidate[] = [
    { value: evenAll, trap: 'treated the odd terms as even and doubled the whole of F(a)' },
    { value: E(0), trap: 'took the whole integrand to be odd: the constant term is not' },
  ];
  const extra: Candidate[] = [
    { value: E(r * a), trap: 'forgot to double: this is the integral from 0 to a' },
    { value: answer.neg(), trap: 'sign error with the negative limit' },
    { value: answer.add(frac(p * a ** 4, 2)), trap: '(−a)⁴ taken as negative when substituting the lower limit' },
    { value: bracket(noDivision(f), -a, a), trap: 'did not divide by the new powers' },
    { value: answer.mulRat(2), trap: 'doubled twice' },
  ];
  const oddTerms = q === 0 ? `$x^{3}$ is an odd function` : `$x^{3}$ and $x$ are odd functions`;
  return evaluateQ(rng, f, -a, a, must, extra,
    `${oddTerms}, so ${q === 0 ? 'it integrates' : 'they integrate'} to zero over $[-${a}, ${a}]$. Only the constant survives: $\\int_{-${a}}^{${a}} ${r < 0 ? `(${r})` : r}\\,dx = ${r} \\times ${2 * a} = ${L(answer)}$.`,
    'Over a symmetric interval odd powers integrate to zero; the constant term does not, and it contributes r × (width).',
    'evaluate', ['symmetry', 'odd-function']);
}

function shiftedSquareQ(rng: RNG): Generated | null {
  const m = rng.pick([1, 1, 2, 3]);
  const lo = rng.pick([m - 2, m - 1, m - 1, m, 0]);
  const hi = rng.pick([m, m + 1, m + 1, m + 2]);
  if (lo >= hi || lo < -1 || hi > 5) return null;
  const f = [T(1, 2), T(-2 * m, 1), T(m * m, 0)];
  const answer = defInt(f, lo, hi)!;
  if (answer.toRat().d > 3n) return null;
  const u1 = hi - m, u0 = lo - m;
  const must: Candidate[] = [
    { value: bracket(integrate([T(1, 2), T(-m * m, 0)]), lo, hi), trap: `expanded (x − ${m})² as x² − ${m * m}, losing the cross term` },
    { value: E(u1 ** 3 - u0 ** 3), trap: 'forgot to divide by 3' },
  ];
  const extra: Candidate[] = [
    { value: bracket(integrate([T(1, 2), T(2 * m, 1), T(m * m, 0)]), lo, hi), trap: `sign of the cross term wrong: used (x + ${m})²` },
    { value: lo !== m ? frac(u1 ** 3, 3) : null, trap: 'forgot the lower limit' },
    { value: answer.neg(), trap: 'subtracted the wrong way round' },
    { value: bracket(integrate([T(1, 2), T(m * m, 0)]), lo, hi), trap: 'dropped the cross term and kept both squares' },
    { value: answer.mulRat(3), trap: 'multiplied by 3 instead of dividing' },
  ];
  const bracketTex = `(x - ${m})`;
  const stemInt = `\\int_{${lo}}^{${hi}} ${bracketTex}^{2}\\,dx`;
  return {
    stem: `Evaluate $${stemInt}$.`,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, must, extra),
    solution: `Quickest: $\\int ${bracketTex}^{2}dx = \\frac{${bracketTex}^{3}}{3}$, so the integral is $\\frac{${u1 < 0 ? `(${u1})` : u1}^{3} - ${u0 < 0 ? `(${u0})` : u0}^{3}}{3} = ${L(answer)}$. (Expanding to $${termsTex(f)}$ gives the same.)`,
    trap: 'Either use (x − m)³/3 directly or expand fully — (x − m)² is not x² − m².',
    tags: ['integration', 'definite', 'expand'],
    params: { variant: 'evaluate', integrand: f, a: lo, b: hi },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 5

function findKZeroQ(rng: RNG): Generated | null {
  const kind = rng.pick(['x2-m2', 'x2-m2', 'x2-mx']);
  const m = rng.pick(kind === 'x2-m2' ? [1, 2, 3, 2] : [1, 2, 3, 4]);
  const f = kind === 'x2-m2' ? [T(1, 2), T(-m * m, 0)] : [T(1, 2), T(-m, 1)];
  const k = kind === 'x2-m2' ? surd(3, m) : frac(3 * m, 2);
  const must: Candidate[] = kind === 'x2-m2'
    ? [
      { value: E(m), trap: `solved x² − ${m * m} = 0, where the integrand is zero, instead of where the integral is zero` },
      { value: surd(3, rat(m, 3)), trap: `divided by 3 instead of multiplying: k²/3 = ${m * m} gives k² = ${3 * m * m}` },
    ]
    : [
      { value: E(m), trap: `solved x² − ${m}x = 0, where the integrand is zero, instead of where the integral is zero` },
      { value: frac(2 * m, 3), trap: 'fraction inverted: k/3 = m/2 gives k = 3m/2' },
    ];
  const extra: Candidate[] = kind === 'x2-m2'
    ? [
      { value: E(3 * m), trap: `k² = ${3 * m * m} does not give k = ${3 * m}` },
      { value: E(3 * m * m), trap: 'forgot to take the square root' },
      { value: E(2 * m), trap: 'doubled the zero of the integrand' },
      { value: surd(2, m), trap: 'used 2 instead of 3 when dividing x³' },
    ]
    : [
      { value: E(3 * m), trap: 'forgot to divide by 2' },
      { value: E(2 * m), trap: 'doubled the zero of the integrand' },
      { value: frac(m, 2), trap: 'halved instead of multiplying by 3/2' },
      { value: frac(3 * m, 4), trap: 'used x³/4 instead of x³/3' },
    ];
  const F = integrate(f);
  const working = kind === 'x2-m2'
    ? `$\\frac{k^{3}}{3} - ${m * m}k = 0$, so $k\\left(\\frac{k^{2}}{3} - ${m * m}\\right) = 0$; as $k > 0$, $k^{2} = ${3 * m * m}$ and $k = ${k.toLatex()}$.`
    : `$\\frac{k^{3}}{3} - \\frac{${m}k^{2}}{2} = 0$, so $k^{2}\\left(\\frac{k}{3} - \\frac{${m}}{2}\\right) = 0$; as $k > 0$, $k = ${k.toLatex()}$.`;
  return {
    stem: `Given that $${integralTex(f, 0, 'k')} = 0$, where $k > 0$, find the value of $k$.`,
    answer: { kind: 'exact', value: k },
    options: options(rng, k, must, extra),
    solution: `$\\left[${antiTex(F)}\\right]_{0}^{k}$: ${working}`,
    trap: 'Integrate, substitute the limits and solve the resulting equation in k — the zero of the integral is not the zero of the integrand.',
    tags: ['integration', 'definite', 'unknown-limit'],
    params: { variant: 'find-k', integrand: f, a: 0, target: 0 },
    typedAllowed: true,
  };
}

function findKTargetQ(rng: RNG): Generated | null {
  const kind = rng.pick(['2x', '2x', '3x2', '2x+p']);
  const a = kind === '3x2' ? rng.pick([0, 1]) : rng.pick([1, 1, 2]); // a lower limit to forget
  const k = kind === '3x2' ? rng.pick([2, 3, 4].filter((v) => v > a)) : rng.pick([3, 4, 5, 6].filter((v) => v > a));
  const p = kind === '2x+p' ? rng.pick([1, 2, 3, -1, -2, 4]) : 0;
  const f = kind === '3x2' ? [T(3, 2)] : kind === '2x' ? [T(2, 1)] : [T(2, 1), T(p, 0)];
  const N = defInt(f, a, k)!;
  if (!N.isInteger() || N.toNumber() <= 0) return null;
  const Nn = N.toInt();
  const F = integrate(f);
  const attempt = (g: () => Exact): Exact | null => { try { const v = g(); return Number.isFinite(v.toNumber()) ? v : null; } catch { return null; } };
  const noLower = kind === '3x2' ? attempt(() => E(Nn).powRat(rat(1, 3))) : kind === '2x' ? attempt(() => E(Nn).sqrt()) : null;
  const otherRoot = kind === '2x+p' ? E(-(k + p)) : E(-k);
  const must: Candidate[] = [
    { value: a !== 0 ? noLower : null, trap: 'forgot the contribution of the lower limit' },
    { value: E(k + 1), trap: 'arithmetic slip' },
  ];
  const extra: Candidate[] = [
    { value: otherRoot, trap: `the other root of the equation is negative and is ruled out by k > ${a}` },
    { value: E(k - 1), trap: 'arithmetic slip' },
    { value: kind === '3x2' ? E(Nn + a ** 3) : E(Nn + a * a + p * a), trap: 'forgot to take the root' },
    { value: frac(Nn, 2), trap: 'divided by 2 instead of solving the equation' },
    { value: E(2 * k), trap: 'doubled' },
  ];
  const eq = kind === '3x2'
    ? `k^{3}${a === 0 ? '' : ` - ${a ** 3}`} = ${Nn}`
    : kind === '2x'
      ? `k^{2} - ${a * a} = ${Nn}`
      : `(k^{2} ${p < 0 ? '-' : '+'} ${Math.abs(p)}k) - (${a * a + p * a}) = ${Nn}`;
  const solve = kind === '3x2'
    ? `$k^{3} = ${Nn + a ** 3}$, so $k = ${k}$.`
    : kind === '2x'
      ? `$k^{2} = ${Nn + a * a}$, so $k = ${k}$ (taking the positive root).`
      : `$k^{2} ${p < 0 ? '-' : '+'} ${Math.abs(p)}k - ${Nn + a * a + p * a} = 0$, i.e. $(k - ${k})(k + ${k + p}) = 0$, so $k = ${k}$.`;
  return {
    stem: `Given that $${integralTex(f, a, 'k')} = ${Nn}$ and $k > ${a}$, find the value of $k$.`,
    answer: { kind: 'exact', value: E(k) },
    options: options(rng, E(k), must, extra),
    solution: `$\\left[${antiTex(F)}\\right]_{${a}}^{k} = ${Nn}$ gives $${eq}$. ${solve}`,
    trap: 'Integrate, substitute k and the lower limit, then solve for k, discarding any root the condition k > a rules out.',
    tags: ['integration', 'definite', 'unknown-limit'],
    params: { variant: 'find-k', integrand: f, a, target: Nn },
    typedAllowed: true,
  };
}

const FAMILIES: Term[] = [TF(1, 1, 1, 2), TF(1, 1, -1, 2), T(1, -2), T(1, 1), T(1, 0)];

function twoTermFractionalQ(rng: RNG): Generated | null {
  const [a, b] = rng.pick(SQUARE_LIMITS);
  const [t1, t2] = rng.pickDistinct(FAMILIES, 2);
  if (t1[2] >= 0 && t1[3] === 1 && t2[2] >= 0 && t2[3] === 1) return null; // at least one fractional or negative power
  const c1 = rng.pick([1, 1, 2, 3]);
  const c2 = rng.pick([1, 1, 2, 3]) * rng.pick([1, 1, -1]);
  const f = [norm(c1 * t1[0], t1[1], t1[2], t1[3]), norm(c2 * t2[0], t2[1], t2[2], t2[3])].sort((x, y) => y[2] / y[3] - x[2] / x[3]);
  const answer = defInt(f, a, b);
  if (!answer || !isCleanExact(answer).ok || answer.toRat().d > 12n || Math.abs(answer.toNumber()) > 60 || answer.isZero()) return null;
  const F = integrate(f);
  const w = standardWrong(f, a, b);
  const hasNeg = f.some((t) => t[2] < 0);
  const must: Candidate[] = [
    hasNeg ? { value: bracket(negFlip(f), a, b), trap: 'sign of the negative-power term: dividing by the new negative power makes it negative' } : w[1],
    w[0],
  ];
  const extra: Candidate[] = [
    w[1], w[2], w[6],
    { value: defInt([f[0]], a, b), trap: 'dropped the second term' },
    { value: defInt([f[1]], a, b), trap: 'dropped the first term' },
    { value: bracket(downPower(f), a, b), trap: 'took a negative power down by one instead of up' },
  ];
  return evaluateQ(rng, f, a, b, must, extra,
    `$\\left[${antiTex(F)}\\right]_{${a}}^{${b}} = ${brNeg(evalExact(F, b)!)} - ${brNeg(evalExact(F, a)!)} = ${L(answer)}$.${powersHint(f, a, b)}`,
    'Convert each term to a power of x, integrate term by term and evaluate both limits carefully — the square-number limits keep the surds away.',
    'evaluate', ['fractional-powers', 'two-terms']);
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'm2.integration.definite',
  module: 'M2',
  topic: 'integration',
  title: 'Definite integrals with clean limits',
  levels: {
    1: '∫₀² 3x² dx = 8',
    2: '∫₁³ (2x + 1) dx = 10',
    3: '∫₁⁴ √x dx = 14/3; ∫₁² x⁻² dx = 1/2',
    4: 'odd/even over [−a, a]: ∫₋₂² (x³ + 4) dx = 16; ∫₀¹ (x − 1)² dx = 1/3',
    5: 'find k: ∫₀ᵏ (x² − 4) dx = 0 → 2√3, ∫₁ᵏ 2x dx = 15 → 4; two fractional-power terms',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return monomialQ(rng);
        case 2: return twoTermQ(rng);
        case 3: return fractionalQ(rng);
        case 4: return pickVariant(rng, [symmetricQ, shiftedSquareQ]);
        default: return pickVariant(rng, [findKZeroQ, findKTargetQ, twoTermFractionalQ]);
      }
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const p = q.params as { variant: string; integrand: Term[]; a: number; b?: number; target?: number };
    const f = (x: number) => evalTerms(p.integrand, x);
    const got = q.answer.value.toNumber();
    const close = (x: number, y: number) => Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(y));
    if (p.variant === 'find-k') {
      // the answer is the upper limit: Simpson from a to k must hit the target
      if (!(got > p.a)) return false;
      return close(simpson(f, p.a, got), p.target!);
    }
    return close(simpson(f, p.a, p.b!), got);
  },
});
