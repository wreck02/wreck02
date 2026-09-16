import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { gcd } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Indefinite integrals.
 * Level 1: ∫ (ax + b) dx — choice of antiderivatives "+ c"
 * Level 2: ∫ polynomial dx — choice
 * Level 3: ∫ (√x + 1/x²) dx — fractional and negative powers, written with roots
 * Level 4: dy/dx and a point → the constant (exact); f' and f(a) → f(x) (choice)
 * Level 5: ∫ (2x + 1)² dx (expand first) — choice; f'' and two conditions → f(k) (exact)
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

function integrate(ts: Term[]): Term[] {
  // c x^p → c/(p+1) x^{p+1}  (p ≠ −1)
  return ts.map(([cn, cd, pn, pd]) => norm(cn * pd, cd * (pn + pd), pn + pd, pd));
}

function differentiate(ts: Term[]): Term[] {
  return ts.filter(([, , pn]) => pn !== 0).map(([cn, cd, pn, pd]) => norm(cn * pn, cd * pd, pn - pd, pd));
}

function evalTerms(ts: Term[], x: number): number {
  return ts.reduce((s, [cn, cd, pn, pd]) => s + (cn / cd) * Math.pow(x, pn / pd), 0);
}

function evalExact(ts: Term[], x: number): Exact {
  return ts.reduce((s, [cn, cd, pn, pd]) => s.add(frac(cn, cd).mul(E(x).pow(pn / pd))), Exact.ZERO);
}

/** LaTeX for a power of x: x, x^{2}, \sqrt{x}, x\sqrt{x}; negative powers return the denominator part. */
function powerTex(pn: number, pd: number): { num: string; den: string } {
  const a = Math.abs(pn);
  let s: string;
  if (pd === 1) s = a === 0 ? '' : a === 1 ? 'x' : `x^{${a}}`;
  else if (pd === 2) s = a === 1 ? '\\sqrt{x}' : a === 3 ? 'x\\sqrt{x}' : `x^{${(a - 1) / 2}}\\sqrt{x}`;
  else s = `x^{\\frac{${a}}{${pd}}}`;
  return pn >= 0 ? { num: s, den: '' } : { num: '', den: s };
}

/** LaTeX for a sum of terms: "2x^{2} + 3x", "\frac{2}{3}x\sqrt{x} - \frac{1}{x}". */
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

const withC = (ts: Term[]): string => `$${termsTex(ts)} + c$`;
const bare = (ts: Term[]): string => `$${termsTex(ts)}$`;

/** "\int (4x + 3)\,dx" — brackets only when there is more than one term. */
function integralTex(ts: Term[]): string {
  const body = termsTex(ts);
  const nonZero = ts.filter((t) => t[0] !== 0).length;
  return nonZero > 1 ? `\\int \\left(${body}\\right)dx` : `\\int ${body}\\,dx`;
}

type Wrong = { display: string; trap: string };

function choiceOrNull(rng: RNG, correct: string, wrong: (Wrong | null)[]) {
  const ws = wrong.filter((w): w is Wrong => w !== null);
  const distinct = new Set(ws.map((w) => w.display.replace(/\s+/g, ' ')).filter((d) => d !== correct.replace(/\s+/g, ' ')));
  if (distinct.size < 4) return null;
  return buildChoiceOptions(rng, correct, ws);
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

/** Simpson's rule (used by verify only). */
function simpson(f: (x: number) => number, a: number, b: number, n = 2000): number {
  if (a === b) return 0;
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
  return (s * h) / 3;
}

/** Wrong-rule antiderivatives used to build distractors. */
const noDivision = (ts: Term[]): Term[] => ts.map(([cn, cd, pn, pd]) => norm(cn, cd, pn + pd, pd));
const oldPower = (ts: Term[]): Term[] => ts.map(([cn, cd, pn, pd]) => (pn === 0 ? norm(cn, cd, 1, 1) : norm(cn * pd, cd * pn, pn + pd, pd)));
const samePower = (ts: Term[]): Term[] => ts.map(([cn, cd, pn, pd]) => norm(cn * pd, cd * (pn + pd), pn, pd));

// ----------------------------------------------------------------------------- level 1

function linearQ(rng: RNG): Generated | null {
  const a = rng.pick([2, 4, 6, 8, 3, 5, 10, 2, 4]);
  const b = rng.nonZeroInt(-7, 7);
  const f = [T(a, 1), T(b, 0)];
  const F = integrate(f);
  const correct = withC(F);
  const wrong: (Wrong | null)[] = [
    { display: withC(noDivision(f)), trap: 'did not divide by the new power: ∫ ax dx = ax²/2' },
    { display: withC([F[0]]), trap: 'lost the constant term: ∫ b dx = bx' },
    { display: withC([F[0], T(b, 0)]), trap: 'left the constant term as it was instead of integrating it to bx' },
    { display: `$${a}$`, trap: 'differentiated instead of integrating' },
    { display: bare(F), trap: 'forgot the constant of integration' },
    { display: withC([F[0], TF(b, 2, 1, 1)]), trap: 'divided every term by 2, including the bx' },
  ];
  const opts = choiceOrNull(rng, correct, wrong);
  if (!opts) return null;
  return {
    stem: `Find $${integralTex(f)}$.`,
    answer: { kind: 'choice', value: correct },
    options: opts,
    solution: `Raise each power by one and divide by the new power: $${integralTex(f)} = ${termsTex(F)} + c$. Check by differentiating.`,
    trap: 'Add one to the power and divide by the new power; the constant b integrates to bx, and do not forget + c.',
    tags: ['integration', 'indefinite', 'linear'],
    params: { variant: 'linear', integrand: f, anti: F },
    typedAllowed: false,
  };
}

// ----------------------------------------------------------------------------- level 2

function polynomialQ(rng: RNG): Generated | null {
  const powers = rng.pick([[2, 1, 0], [3, 1, 0], [3, 2, 0], [3, 2, 1], [2, 1, 0]]);
  const f = powers.map((p, i) => {
    const nice = rng.bool(0.75) && p > 0;
    // leading coefficient positive, as the exam prints it
    const c = nice ? (p + 1) * rng.pick(i === 0 ? [1, 2, 3] : [1, 2, 3, -1, -2]) : i === 0 ? rng.int(1, 7) : rng.nonZeroInt(-7, 7);
    return T(c, p);
  });
  const F = integrate(f);
  if (F.some(([, cd]) => cd > 4)) return null;
  const correct = withC(F);
  const flipped = F.map((t, i) => (i === 1 ? norm(-t[0], t[1], t[2], t[3]) : t));
  const hasConst = powers.includes(0);
  const wrong: (Wrong | null)[] = [
    { display: withC(noDivision(f)), trap: 'raised each power but did not divide by the new power' },
    { display: withC(oldPower(f)), trap: 'divided by the old power instead of the new one' },
    { display: withC(differentiate(f)), trap: 'differentiated instead of integrating' },
    { display: withC(flipped), trap: 'sign of a term slipped' },
    { display: bare(F), trap: 'forgot the constant of integration' },
    hasConst ? { display: withC([...F.slice(0, -1), f[f.length - 1]]), trap: 'left the constant term as it was instead of integrating it' } : null,
    { display: withC(F.slice(0, -1)), trap: 'dropped the last term' },
    { display: withC(samePower(f)), trap: 'divided by the new power but did not raise the power' },
  ];
  const opts = choiceOrNull(rng, correct, wrong);
  if (!opts) return null;
  return {
    stem: `Find $${integralTex(f)}$.`,
    answer: { kind: 'choice', value: correct },
    options: opts,
    solution: `Term by term: $${integralTex(f)} = ${termsTex(F)} + c$. Each power goes up by one and the term is divided by that new power.`,
    trap: 'Divide by the new power (n + 1), not the old one, and keep every term including the constant.',
    tags: ['integration', 'indefinite', 'polynomial'],
    params: { variant: 'poly', integrand: f, anti: F },
    typedAllowed: false,
  };
}

// ----------------------------------------------------------------------------- level 3

function rootsQ(rng: RNG): Generated | null {
  const rootPower = rng.pick([1, 1, -1]); // √x or 1/√x
  const negPower = rng.pick([-2, -2, -3]); // 1/x² or 1/x³
  const a = rng.pick(rootPower === 1 ? [1, 1, 3, 6, 2] : [1, 1, 2, 4]);
  const b = rng.pick([1, 1, 2, 3, 4, 6]) * rng.sign();
  const f = [TF(a, 1, rootPower, 2), T(b, negPower)];
  const F = integrate(f);
  const correct = withC(F);
  const signFlip = [F[0], norm(-F[1][0], F[1][1], F[1][2], F[1][3])];
  const down = [F[0], norm(b, negPower - 1, negPower - 1, 1)];
  const wrong: (Wrong | null)[] = [
    { display: withC(signFlip), trap: `sign of the negative-power term: ∫ x^{${negPower}} dx = x^{${negPower + 1}}/(${negPower + 1}), which is negative` },
    { display: withC(down), trap: 'took the power of the second term down by one instead of up' },
    { display: withC([oldPower([f[0]])[0], F[1]]), trap: 'divided the root term by the old power ½ instead of the new one' },
    { display: withC(differentiate(f)), trap: 'differentiated instead of integrating' },
    { display: withC([samePower([f[0]])[0], F[1]]), trap: 'divided the root term by the new power but left its power unchanged' },
    { display: bare(F), trap: 'forgot the constant of integration' },
    { display: withC([F[0], samePower([f[1]])[0]]), trap: 'kept the old power on the second term' },
    { display: withC(noDivision(f)), trap: 'did not divide by the new powers' },
  ];
  const opts = choiceOrNull(rng, correct, wrong);
  if (!opts) return null;
  const pw = (pn: number, pd: number) => (pd === 1 ? `${pn}` : `${pn}/${pd}`);
  const step = (t: Term, Ft: Term) => `\\int ${Math.abs(t[0]) === 1 ? (t[0] < 0 ? '-' : '') : t[0]}x^{${pw(t[2], t[3])}}dx = \\frac{${Math.abs(t[0]) === 1 ? (t[0] < 0 ? '-' : '') : t[0]}x^{${pw(Ft[2], Ft[3])}}}{${pw(Ft[2], Ft[3])}} = ${termsTex([Ft])}`;
  return {
    stem: `Find $${integralTex(f)}$.`,
    answer: { kind: 'choice', value: correct },
    options: opts,
    solution: `Write the integrand as $${a === 1 ? '' : a}x^{${pw(rootPower, 2)}} ${b < 0 ? '-' : '+'} ${Math.abs(b) === 1 ? '' : Math.abs(b)}x^{${negPower}}$. Then $${step(f[0], F[0])}$ and $${step(f[1], F[1])}$, so the integral is $${termsTex(F)} + c$.`,
    trap: 'Convert roots and reciprocals to powers first; the new power of x^{−2} is −1 and dividing by −1 makes the term negative.',
    tags: ['integration', 'indefinite', 'fractional-powers'],
    params: { variant: 'roots', integrand: f, anti: F },
    typedAllowed: false,
  };
}

// ----------------------------------------------------------------------------- level 4

function gradientTerms(rng: RNG): Term[] {
  const shape = rng.pick(['ax2+b', 'ax2+b', 'ax2+bx+d', 'ax+b']);
  if (shape === 'ax+b') return [T(rng.pick([2, 4, 6, -2]), 1), T(rng.nonZeroInt(-6, 6), 0)];
  if (shape === 'ax2+b') return [T(rng.pick([3, 6, 9, -3]), 2), T(rng.nonZeroInt(-6, 6), 0)];
  return [T(rng.pick([3, 6]), 2), T(rng.pick([2, 4, -2, -4]), 1), T(rng.nonZeroInt(-5, 5), 0)];
}

function constantQ(rng: RNG): Generated | null {
  const f = gradientTerms(rng);
  const F = integrate(f);
  const x0 = rng.pick([1, 2, -1, 1, 2, 3]);
  const y0 = rng.int(-9, 12);
  const Fx0 = evalExact(F, x0);
  const c = E(y0).sub(Fx0);
  if (c.isZero() || Math.abs(c.toNumber()) > 40) return null;
  const ask = rng.pick(['intercept', 'intercept', 'constant', 'value']);
  const x1 = rng.pick([1, 2, -1, -2, 3].filter((v) => v !== x0));
  const answer = ask === 'value' ? evalExact(F, x1).add(c) : c;
  if (!answer.isInteger() || Math.abs(answer.toNumber()) > 60) return null;
  const Fnd = noDivision(f);
  const must: Candidate[] = ask === 'value'
    ? [
      { value: evalExact(F, x1), trap: 'forgot the constant of integration' },
      { value: evalExact(F, x1).add(E(y0)), trap: `took the constant to be ${y0} without substituting the point` },
    ]
    : [
      { value: Fx0.sub(E(y0)), trap: 'sign slip: c = y − F(x), not F(x) − y' },
      { value: E(y0), trap: 'took the constant to be the y-coordinate of the given point' },
    ];
  const extra: Candidate[] = ask === 'value'
    ? [
      { value: evalExact(F, x1).sub(c), trap: 'sign of the constant wrong' },
      { value: evalExact(Fnd, x1).add(E(y0).sub(evalExact(Fnd, x0))), trap: 'did not divide by the new powers when integrating' },
      { value: evalExact(f, x1).add(c), trap: 'substituted into dy/dx instead of y' },
      { value: E(y0), trap: 'gave the y-coordinate of the given point' },
      { value: answer.add(E(1)), trap: 'arithmetic slip' },
    ]
    : [
      { value: E(y0).sub(evalExact(Fnd, x0)), trap: 'did not divide by the new powers when integrating' },
      { value: E(y0).sub(evalExact(f, x0)), trap: 'substituted into dy/dx instead of into y' },
      { value: E(y0).add(Fx0), trap: 'added F(x) instead of subtracting' },
      { value: Fx0, trap: 'gave F(x) at the point, forgetting the y-coordinate' },
      { value: c.add(E(1)), trap: 'arithmetic slip' },
    ];
  const curve = `$y = ${termsTex(F)} + c$`;
  const stem = ask === 'constant'
    ? `A curve has gradient function $\\frac{dy}{dx} = ${termsTex(f)}$ and passes through the point $(${x0}, ${y0})$. The equation of the curve is ${curve}. Find the value of $c$.`
    : ask === 'intercept'
      ? `A curve has $\\frac{dy}{dx} = ${termsTex(f)}$ and passes through the point $(${x0}, ${y0})$. Find the $y$-intercept of the curve.`
      : `A curve has $\\frac{dy}{dx} = ${termsTex(f)}$ and passes through the point $(${x0}, ${y0})$. Find the value of $y$ when $x = ${x1}$.`;
  const solution = `Integrate: $y = ${termsTex(F)} + c$. At $(${x0}, ${y0})$: $${y0} = ${Fx0.toLatex()} + c$, so $c = ${c.toLatex()}$.` +
    (ask === 'value' ? ` Then at $x = ${x1}$, $y = ${evalExact(F, x1).toLatex()} ${c.sign() < 0 ? '-' : '+'} ${c.abs().toLatex()} = ${answer.toLatex()}$.` : ask === 'intercept' ? ` The $y$-intercept is $c = ${c.toLatex()}$.` : '');
  return {
    stem,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, must, extra),
    solution,
    trap: 'Integrating gives a family of curves; substitute the given point to fix c = y − F(x) before evaluating anything else.',
    tags: ['integration', 'constant-of-integration', 'curve'],
    params: { variant: 'constant', integrand: f, x0, y0, ask, x1 },
    typedAllowed: true,
  };
}

function functionQ(rng: RNG): Generated | null {
  const f = gradientTerms(rng);
  const F = integrate(f);
  const x0 = rng.pick([1, 2, -1, 0, 1, 2]);
  const y0 = rng.int(-8, 10);
  const Fx0 = evalExact(F, x0);
  const c = E(y0).sub(Fx0);
  if (c.isZero() || !c.isInteger() || Math.abs(c.toNumber()) > 40) return null;
  const cInt = c.toInt();
  const withConst = (ts: Term[], k: Exact): string => (k.isZero() ? bare(ts) : bare([...ts, T(k.toInt(), 0)]));
  const correct = withConst(F, c);
  const Fnd = noDivision(f);
  const cNd = E(y0).sub(evalExact(Fnd, x0));
  const cDer = E(y0).sub(evalExact(f, x0));
  const wrong: (Wrong | null)[] = [
    { display: withConst(F, c.neg()), trap: 'sign slip when finding the constant: c = f(x₀) − F(x₀)' },
    { display: bare(F), trap: 'forgot the constant of integration' },
    { display: withConst(F, E(y0)), trap: `took the constant to be ${y0} without substituting` },
    cNd.isInteger() ? { display: withConst(Fnd, cNd), trap: 'did not divide by the new powers when integrating' } : null,
    cDer.isInteger() ? { display: withConst(f, cDer), trap: 'did not integrate: adjusted f\'(x) by a constant' } : null,
    { display: withConst(F, E(cInt + 1)), trap: 'arithmetic slip in the constant' },
  ];
  const opts = choiceOrNull(rng, correct, wrong);
  if (!opts) return null;
  return {
    stem: `Given that $f'(x) = ${termsTex(f)}$ and $f(${x0}) = ${y0}$, find $f(x)$.`,
    answer: { kind: 'choice', value: correct },
    options: opts,
    solution: `$f(x) = ${termsTex(F)} + c$. Using $f(${x0}) = ${y0}$: $${Fx0.toLatex()} + c = ${y0}$, so $c = ${cInt}$ and $f(x) = ${termsTex([...F, T(cInt, 0)])}$.`,
    trap: 'Integrate, then use the given value to find the constant; without it the answer is a whole family of functions.',
    tags: ['integration', 'constant-of-integration', 'function'],
    params: { variant: 'function', integrand: f, anti: [...F, T(cInt, 0)], x0, y0 },
    typedAllowed: false,
  };
}

// ----------------------------------------------------------------------------- level 5

function squareQ(rng: RNG): Generated | null {
  const p = rng.pick([1, 2, 2, 3]);
  const q = rng.pick([1, 2, 3, -1, -2, -3]);
  if (gcd(p, q) !== 1) return null; // (3x − 3)² would be written 9(x − 1)²
  const f = [T(p * p, 2), T(2 * p * q, 1), T(q * q, 0)];
  const F = integrate(f);
  const correct = withC(F);
  const bracket = `(${p === 1 ? '' : p}x ${q < 0 ? '-' : '+'} ${Math.abs(q)})`;
  const wrong: (Wrong | null)[] = [
    p !== 1 ? { display: `$\\frac{${bracket}^{3}}{3} + c$`, trap: `forgot to divide by the coefficient ${p} of x (reverse chain rule needs ÷3p)` } : null,
    { display: `$${bracket}^{3} + c$`, trap: 'raised the bracket to the power 3 without dividing at all' },
    { display: withC([F[0], F[2]]), trap: 'squared term by term and lost the cross term 2pqx' },
    { display: withC([F[0], TF(p * q, 2, 2, 1), F[2]]), trap: 'forgot the 2 in the cross term when expanding' },
    { display: withC(noDivision(f)), trap: 'expanded correctly but did not divide by the new powers' },
    { display: withC(differentiate(f)), trap: 'differentiated instead of integrating' },
    { display: bare(F), trap: 'forgot the constant of integration' },
  ];
  const opts = choiceOrNull(rng, correct, wrong);
  if (!opts) return null;
  return {
    stem: `Find $\\int ${bracket}^{2}\\,dx$.`,
    answer: { kind: 'choice', value: correct },
    options: opts,
    solution: `Expand first: $${bracket}^{2} = ${termsTex(f)}$. Then integrate term by term: $${termsTex(F)} + c$.`,
    trap: 'Expand the bracket before integrating (or, if using the reverse chain rule, divide by 3 and by the coefficient of x).',
    tags: ['integration', 'indefinite', 'expand'],
    params: { variant: 'square', integrand: f, anti: F },
    typedAllowed: false,
  };
}

function secondDerivativeQ(rng: RNG): Generated | null {
  const a = rng.pick([6, 12, -6, 6]);
  const b = rng.pick([2, 4, -2, -4, 0]);
  const f2 = [T(a, 1), T(b, 0)];
  const x0 = rng.pick([0, 1, -1, 2]); // f'(x0) = v0
  const v0 = rng.int(-6, 8);
  const x1 = rng.pick([0, 1, -1, 2]); // f(x1) = y1
  const y1 = rng.int(-6, 9);
  const k = rng.pick([1, 2, -1, 3, -2].filter((v) => v !== x1));
  const G = integrate(f2); // f' without constant
  const c1 = E(v0).sub(evalExact(G, x0));
  const fPrime = [...G, T(c1.toInt(), 0)];
  const H = integrate(fPrime.filter((t) => t[0] !== 0)); // f without constant
  const c2 = E(y1).sub(evalExact(H, x1));
  const fAll = [...H, T(c2.toInt(), 0)];
  const answer = evalExact(fAll, k);
  if (c1.isZero() || c2.isZero() || Math.abs(answer.toNumber()) > 150) return null;
  // mistake pipelines
  const pipeline = (c1w: Exact, adjust: boolean): Exact => {
    const Hw = integrate([...G, T(c1w.toInt(), 0)].filter((t) => t[0] !== 0));
    const c2w = adjust ? E(y1).sub(evalExact(Hw, x1)) : Exact.ZERO;
    return evalExact(Hw, k).add(c2w);
  };
  const must: Candidate[] = [
    { value: pipeline(Exact.ZERO, true), trap: 'forgot the first constant of integration' },
    { value: pipeline(c1, false), trap: 'forgot the second constant of integration' },
  ];
  const extra: Candidate[] = [
    { value: evalExact(fPrime, k), trap: `found f'(${k}) instead of f(${k}): only integrated once` },
    { value: pipeline(E(v0).add(evalExact(G, x0)), true), trap: 'sign slip when finding the first constant' },
    { value: evalExact(H, k).add(E(y1)), trap: `took the second constant to be ${y1} without substituting` },
    { value: evalExact(noDivision(fPrime.filter((t) => t[0] !== 0)), k).add(E(y1).sub(evalExact(noDivision(fPrime.filter((t) => t[0] !== 0)), x1))), trap: 'did not divide by the new powers in the second integration' },
    { value: answer.add(E(1)), trap: 'arithmetic slip' },
    { value: answer.sub(E(1)), trap: 'arithmetic slip' },
  ];
  return {
    stem: `$f''(x) = ${termsTex(f2)}$, $f'(${x0}) = ${v0}$ and $f(${x1}) = ${y1}$. Find $f(${k})$.`,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, must, extra),
    solution: `$f'(x) = ${termsTex(G)} + c_1$ and $f'(${x0}) = ${v0}$ gives $c_1 = ${c1.toLatex()}$. Then $f(x) = ${termsTex(H)} + c_2$ and $f(${x1}) = ${y1}$ gives $c_2 = ${c2.toLatex()}$. So $f(${k}) = ${answer.toLatex()}$.`,
    trap: 'Two integrations need two constants: fix c₁ from f′ before integrating again, then fix c₂ from f.',
    tags: ['integration', 'second-derivative', 'constant-of-integration'],
    params: { variant: 'second', integrand: f2, x0, v0, x1, y1, k },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'm2.integration.indefinite',
  module: 'M2',
  topic: 'integration',
  title: 'Indefinite integrals',
  levels: {
    1: '∫ (ax + b) dx: choice of antiderivatives',
    2: '∫ polynomial dx: choice',
    3: '∫ (√x + 1/x²) dx: roots and reciprocals',
    4: 'dy/dx and a point → the constant; f′ and f(a) → f(x)',
    5: '∫ (2x + 1)² dx (expand first); f″ with two conditions → f(k)',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return linearQ(rng);
        case 2: return polynomialQ(rng);
        case 3: return rootsQ(rng);
        case 4: return pickVariant(rng, [constantQ, constantQ, functionQ]);
        default: return pickVariant(rng, [squareQ, secondDerivativeQ]);
      }
    });
  },
  verify(q) {
    const p = q.params as { variant: string; integrand: Term[]; anti?: Term[]; x0?: number; y0?: number; ask?: string; x1?: number; v0?: number; y1?: number; k?: number };
    const f = (x: number) => evalTerms(p.integrand, x);
    if (q.options.filter((o) => o.correct).length !== 1) return false;
    if (q.answer.kind === 'choice') {
      const F = p.anti!;
      // numerically differentiate the antiderivative and compare with the integrand at sample points
      const h = 1e-5;
      for (const x of [0.6, 1.3, 2.1, 3.4]) {
        const d = (evalTerms(F, x + h) - evalTerms(F, x - h)) / (2 * h);
        if (Math.abs(d - f(x)) > 1e-5 * Math.max(1, Math.abs(f(x)))) return false;
      }
      const expected = p.variant === 'function' ? bare(F) : withC(F);
      return q.answer.value === expected;
    }
    if (q.answer.kind !== 'exact') return false;
    const got = q.answer.value.toNumber();
    const close = (x: number, y: number) => Math.abs(x - y) < 1e-6 * Math.max(1, Math.abs(y));
    if (p.variant === 'constant') {
      // y(x) = y0 + ∫_{x0}^{x} f, so the intercept is y(0) and the constant equals y(0) for polynomial F
      const x0 = p.x0!, y0 = p.y0!;
      const target = p.ask === 'value' ? p.x1! : 0;
      return close(got, y0 + simpson(f, x0, target));
    }
    if (p.variant === 'second') {
      // f'(t) = v0 + ∫_{x0}^{t} f'', f(k) = y1 + ∫_{x1}^{k} f'(t) dt — nested Simpson
      const fp = (t: number) => p.v0! + simpson(f, p.x0!, t, 200);
      return close(got, p.y1! + simpson(fp, p.x1!, p.k!, 400));
    }
    return false;
  },
});
