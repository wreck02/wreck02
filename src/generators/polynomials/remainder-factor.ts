import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { poly, factor, signed } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Remainder and factor theorem.
 * Level 1: remainder when a quadratic is divided by (x − a): evaluate f(a)
 * Level 2: cubic divided by (x + a): the point is x = −a
 * Level 3: find k so that (x − a) is a factor of a cubic with an unknown coefficient
 * Level 4: divisor (2x − 1) → f(½); two conditions (a remainder and a factor) → a coefficient
 * Level 5: factorise a cubic completely given one factor; which linear expression is a factor
 */

type Candidate = { value: Exact | null; trap: string };

function cleanOnly(ds: Candidate[]): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } => d.value !== null && Number.isFinite(d.value.toNumber()) && isCleanExact(d.value).ok);
}

/**
 * Every distinct `must` trap gets a slot before any `extra` one, so the headline mistakes are never
 * shuffled out. The remaining slots are filled towards a randomly chosen number of options *below* the
 * answer, so where the correct option lands in the sorted list is a property of the draw and not of the
 * sub-variant.
 */
function ranked(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], count = 4): Distractor[] {
  const a = answer.toNumber();
  const seen: Exact[] = [answer];
  const out: Distractor[] = [];
  const take = (d: Distractor) => {
    if (out.length >= count || seen.some((s) => s.equals(d.value))) return;
    seen.push(d.value);
    out.push(d);
  };
  must.forEach(take);
  const below = rng.shuffle(extra.filter((d) => d.value.toNumber() < a));
  const above = rng.shuffle(extra.filter((d) => d.value.toNumber() > a));
  let wantBelow = rng.int(0, count) - out.filter((d) => d.value.toNumber() < a).length;
  while (out.length < count && below.length + above.length > 0) {
    const useBelow = below.length > 0 && (wantBelow > 0 || above.length === 0);
    take((useBelow ? below : above).shift()!);
    if (useBelow) wantBelow--;
  }
  return out;
}

function options(rng: RNG, answer: Exact, must: Candidate[], extra: Candidate[]) {
  return buildOptions(rng, answer, ranked(rng, answer, cleanOnly(must), cleanOnly(extra)), { format: 'fraction' });
}

/** Pick a sub-variant first, then retry its parameters, so rejection rates do not skew the mix. */
function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

/** Choice options, or null when fewer than four distinct wrong displays survive. */
function choiceOrNull(rng: RNG, correct: string, wrong: { display: string; trap: string }[]) {
  const distinct = new Set(wrong.map((w) => w.display).filter((d) => d !== correct));
  if (distinct.size < 4) return null;
  return buildChoiceOptions(rng, correct, wrong);
}

/**
 * "1/2", "-1/2", "2": a root in plain text. Trap lines are printed verbatim by the UI, so they must
 * never contain LaTeX (\\frac{1}{2} would be shown literally); toLatex() belongs in the stem and solution.
 */
function rootText(s: number, m: number): string {
  const g = (a: number, b: number): number => (b === 0 ? Math.abs(a) : g(b, a % b));
  const d = g(Math.abs(s), m) || 1;
  const num = s / d, den = m / d;
  return den === 1 ? `${num}` : `${num}/${den}`;
}

/** Horner evaluation of a polynomial given highest power first (works for rational x too). */
function horner(coefs: number[], x: number): number {
  return coefs.reduce((acc, c) => acc * x + c, 0);
}

/** Exact Horner. */
function hornerExact(coefs: number[], x: Exact): Exact {
  return coefs.reduce((acc, c) => acc.mul(x).add(E(c)), Exact.ZERO);
}

/** "2^{3} + 3(2)^{2} - 5(2) + 1": the polynomial with x = a substituted, ready to evaluate. */
function substTex(coefs: number[], a: number): string {
  const n = coefs.length - 1;
  let s = '';
  coefs.forEach((c, i) => {
    const p = n - i;
    if (c === 0) return;
    const mag = Math.abs(c);
    const bare = mag === 1 && a > 0;
    const body = p === 0 ? '' : p === 1 ? (bare ? `${a}` : `(${a})`) : `${bare ? a : `(${a})`}^{${p}}`;
    const coef = p === 0 || mag !== 1 ? `${mag}` : '';
    s += s === '' ? `${c < 0 ? '-' : ''}${coef}${body}` : `${c < 0 ? ' - ' : ' + '}${coef}${body}`;
  });
  return s;
}

/** Like substTex but for a fractional root given as LaTeX: "8\left(\frac{1}{2}\right)^{3} + 2\left(\frac{1}{2}\right)^{2} - \frac{1}{2} + 5". */
function substFracTex(coefs: number[], rootTex: string): string {
  const n = coefs.length - 1;
  const br = `\\left(${rootTex}\\right)`;
  let s = '';
  coefs.forEach((c, i) => {
    const p = n - i;
    if (c === 0) return;
    const mag = Math.abs(c);
    const body = p === 0 ? '' : p === 1 ? (mag === 1 ? rootTex : br) : `${br}^{${p}}`;
    const coef = p === 0 || mag !== 1 ? `${mag}` : '';
    s += s === '' ? `${c < 0 ? '-' : ''}${coef}${body}` : `${c < 0 ? ' - ' : ' + '}${coef}${body}`;
  });
  return s;
}

/** "x^{3} + kx^{2} - 5x + 6" with the unknown k in the named slot. */
function polyWithK(c2: number, c1: number, q: number, slot: string): string {
  return `x^{3}${slot === 'x2' ? ' + kx^{2}' : signed(c2, 'x^{2}')}${slot === 'x1' ? ' + kx' : signed(c1, 'x')}${signed(q, '')}`;
}

/** Multiply two polynomials (highest power first). */
function mul(a: number[], b: number[]): number[] {
  const out = new Array<number>(a.length + b.length - 1).fill(0);
  a.forEach((x, i) => b.forEach((y, j) => { out[i + j] += x * y; }));
  return out;
}

/** "(x - 2)", "(x + 3)" for a root r, or "(2x - 1)" for a general linear factor. */
const rootFactor = (r: number): string => factor(1, -r);

/** Product of linear factors, one per root, written in a fixed order so equal sets display identically. */
function productTex(roots: number[], lead: [number, number] | null = null): string {
  const sorted = roots.slice().sort((a, b) => a - b);
  const linear = lead ? [factor(lead[0], lead[1])] : [];
  return [...sorted.map(rootFactor), ...linear].join('');
}

// ----------------------------------------------------------------------------- levels 1–2: remainder by evaluation

function remainderQ(level: Level) {
  return (rng: RNG): Generated | null => {
    let coefs: number[];
    let a: number; // divide by (x − a)
    if (level === 1) {
      coefs = [1, rng.nonZeroInt(-6, 6), rng.nonZeroInt(-9, 9)];
      a = rng.pick([1, 2, 3, -1, -2, -3, 2]);
    } else {
      const lead = rng.pick([1, 1, 1, 2]);
      coefs = [lead, rng.nonZeroInt(-5, 5), rng.nonZeroInt(-7, 7), rng.nonZeroInt(-9, 9)];
      a = rng.pick([-1, -2, -3, -1, -2, 1, 2, 3]);
    }
    const R = horner(coefs, a);
    const wrong = horner(coefs, -a);
    if (R === wrong || R === 0 || Math.abs(R) > 80) return null; // a zero remainder is the factor theorem, not this question
    const answer = E(R);
    const d = coefs[coefs.length - 1];
    const noConst = R - d;
    const signSlip = R - 2 * d;
    // cube/square sign slips for the level-2 cubic divided by (x + a)
    const cubeSlip = level === 2 && a < 0 ? horner(coefs, a) - 2 * coefs[0] * a ** 3 : null;
    const squareSlip = level === 2 && a < 0 ? horner(coefs, a) - 2 * coefs[1] * a * a : null;
    const must: Candidate[] = [{ value: E(wrong), trap: `evaluated at x = ${-a} instead of x = ${a}: the divisor (x ${a >= 0 ? '-' : '+'} ${Math.abs(a)}) is zero when x = ${a}` }];
    const extra: Candidate[] = [
      { value: E(noConst), trap: 'forgot to add the constant term' },
      { value: E(signSlip), trap: 'sign of the constant term slipped' },
      { value: E(-R), trap: 'sign of the whole remainder flipped' },
      { value: E(d), trap: 'read off the constant term as the remainder' },
      { value: cubeSlip !== null ? E(cubeSlip) : null, trap: `took (${a})³ as positive` },
      { value: squareSlip !== null ? E(squareSlip) : null, trap: `took (${a})² as negative` },
      { value: a !== 1 ? E(horner(coefs, 1)) : null, trap: 'evaluated f(1) instead of f at the root of the divisor' },
      { value: a !== -1 ? E(horner(coefs, -1)) : null, trap: 'evaluated f(-1) instead of f at the root of the divisor' },
      { value: E(R - coefs[0] * a ** (coefs.length - 1)), trap: 'forgot the leading term' },
    ];
    return {
      stem: `Find the remainder when $${poly(coefs)}$ is divided by $${rootFactor(a)}$.`,
      answer: { kind: 'exact', value: answer },
      options: options(rng, answer, must, extra),
      solution: `By the remainder theorem the remainder is $f(${a}) = ${substTex(coefs, a)} = ${R}$.`,
      trap: `Dividing by (x ${a >= 0 ? '-' : '+'} ${Math.abs(a)}) means evaluating at the value that makes the bracket zero, x = ${a}, not x = ${-a}.`,
      tags: ['remainder-theorem', 'polynomials'],
      params: { variant: 'remainder', coefs, a },
      typedAllowed: true,
    };
  };
}

// ----------------------------------------------------------------------------- level 3: find k for a factor

function findKQ(rng: RNG): Generated | null {
  const a = rng.pick([1, 2, 3, -1, -2, 2]);
  const slot = rng.pick(['x2', 'x2', 'x1']); // which coefficient is unknown
  const k = rng.nonZeroInt(-6, 6);
  const p = rng.nonZeroInt(-7, 7);
  // f(x) = x³ + (slot x2 ? k : p) x² + (slot x2 ? p : k) x + q with f(a) = 0
  const c2 = slot === 'x2' ? k : p;
  const c1 = slot === 'x2' ? p : k;
  const q = -(a ** 3 + c2 * a * a + c1 * a);
  if (q === 0 || Math.abs(q) > 30) return null;
  const known = [1, c2, c1, q];
  const answer = E(k);
  // wrong routes, each solved for the unknown
  const solveFor = (root: number, dropConst: boolean): Exact | null => {
    const rest = root ** 3 + (slot === 'x2' ? c1 * root : c2 * root * root) + (dropConst ? 0 : q);
    const div = slot === 'x2' ? root * root : root;
    return div === 0 ? null : frac(-rest, div);
  };
  const must: Candidate[] = [
    { value: solveFor(-a, false), trap: `used f(${-a}) = 0 instead of f(${a}) = 0` },
    { value: answer.neg(), trap: 'sign slip when moving the terms across' },
  ];
  const solveWith = (rest: number): Exact | null => {
    const div = slot === 'x2' ? a * a : a;
    return div === 0 ? null : frac(-rest, div);
  };
  const other = slot === 'x2' ? c1 * a : c2 * a * a; // the known term that is not the unknown's
  const extra: Candidate[] = [
    { value: solveFor(a, true), trap: 'forgot the constant term' },
    { value: slot === 'x2' && a !== 1 ? frac(-(a ** 3 + c1 * a + q), a) : null, trap: 'divided by a instead of a² (the unknown multiplies x²)' },
    { value: solveWith(other + q), trap: `forgot the ${a}³ term when substituting` },
    { value: solveWith(a ** 3 + other - q), trap: 'sign slip on the constant term' },
    { value: E(-q), trap: 'gave minus the constant term' },
    { value: E(q), trap: 'read off the constant term of the cubic' },
  ];
  const aTex = a < 0 ? `(${a})` : `${a}`;
  const st = (v: number, sym: string) => ` ${v < 0 ? '-' : '+'} ${Math.abs(v) === 1 && sym ? '' : Math.abs(v)}${sym}`;
  const eq = slot === 'x2'
    ? `${aTex}^{3}${st(a * a, 'k')}${st(c1 * a, '')}${st(q, '')} = 0`
    : `${aTex}^{3}${st(c2 * a * a, '')}${st(a, 'k')}${st(q, '')} = 0`;
  const coefK = slot === 'x2' ? a * a : a;
  const rest = -(a ** 3 + (slot === 'x2' ? c1 * a : c2 * a * a) + q);
  const kTerm = coefK === 1 ? 'k' : coefK === -1 ? '-k' : `${coefK}k`;
  return {
    stem: `Given that $${rootFactor(a)}$ is a factor of $${polyWithK(c2, c1, q, slot)}$, find the value of $k$.`,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, must, extra),
    solution: `By the factor theorem $f(${a}) = 0$: $${eq}$, so $${kTerm} = ${rest}$${coefK === 1 ? '' : `, i.e. $k = ${k}$`}.`,
    trap: `A factor (x ${a >= 0 ? '-' : '+'} ${Math.abs(a)}) means f(${a}) = 0; substitute x = ${a} (not ${-a}) and keep every term, including the constant.`,
    tags: ['factor-theorem', 'polynomials', 'unknown-coefficient'],
    params: { variant: 'find-k', known, slot, a },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 4

function halfQ(rng: RNG): Generated | null {
  const m = rng.pick([2, 2, 2, 3]); // divisor (m x − s)
  const s = rng.pick([1, -1, 1]);
  const root = frac(s, m);
  // Coefficients chosen so that f(s/m) is a small fraction or integer: cubic with leading term a multiple of m²
  const coefs = [rng.pick([m * m, 2 * m * m, m * m * m]), rng.pick([m, 2 * m, -m, -2 * m, m * m]), rng.nonZeroInt(-6, 6), rng.nonZeroInt(-7, 7)];
  const R = hornerExact(coefs, root);
  if (R.isZero() || !isCleanExact(R).ok || R.toRat().d > 4n || Math.abs(R.toNumber()) > 40) return null;
  const wrongRoot = hornerExact(coefs, root.neg());
  const rTxt = rootText(s, m), negTxt = rootText(-s, m);
  const must: Candidate[] = [
    { value: wrongRoot, trap: `evaluated at x = ${negTxt} instead of x = ${rTxt}` },
    { value: E(horner(coefs, s)), trap: `evaluated at x = ${s}, ignoring the coefficient of x in the divisor` },
  ];
  const extra: Candidate[] = [
    { value: E(horner(coefs, m * s)), trap: `evaluated at x = ${m * s}` },
    { value: R.neg(), trap: 'sign of the remainder flipped' },
    { value: R.sub(E(coefs[3])), trap: 'forgot the constant term' },
    { value: E(coefs[3]), trap: 'read off the constant term as the remainder' },
    { value: R.mulRat(m), trap: `multiplied the remainder by ${m}` },
  ];
  const rt = root.toLatex();
  return {
    stem: `Find the remainder when $${poly(coefs)}$ is divided by $${factor(m, -s)}$.`,
    answer: { kind: 'exact', value: R },
    options: options(rng, R, must, extra),
    solution: `$${factor(m, -s)} = 0$ when $x = ${rt}$, so the remainder is $f\\left(${rt}\\right) = ${substFracTex(coefs, rt)} = ${R.toLatex()}$.`,
    trap: `For a divisor (${m}x ${s > 0 ? '-' : '+'} ${Math.abs(s)}) evaluate at x = ${rTxt}, the value that makes it zero, not at x = ${s} or ${-s}.`,
    tags: ['remainder-theorem', 'polynomials'],
    params: { variant: 'half', coefs, m, s },
    typedAllowed: true,
  };
}

/** Solve [[p11, p12], [p21, p22]] (a, b) = (r1, r2) exactly, or null if singular. */
function solve2(p11: number, p12: number, r1: number, p21: number, p22: number, r2: number): [Exact, Exact] | null {
  const det = p11 * p22 - p12 * p21;
  if (det === 0) return null;
  return [frac(r1 * p22 - r2 * p12, det), frac(p11 * r2 - p21 * r1, det)];
}

function twoConditionsQ(rng: RNG): Generated | null {
  const s = rng.pick([1, 1, 2, -1]); // remainder R when divided by (x − s)
  const m = rng.pick([1, 2, 3, -1, -2]); // (x − m) is a factor  (m negative gives (x + 2))
  if (m === s) return null;
  const a = rng.nonZeroInt(-5, 5), b = rng.nonZeroInt(-6, 6);
  // f(x) = x³ + a x² + b x + r with f(m) = 0
  const r = -(m ** 3 + a * m * m + b * m);
  const R = s ** 3 + a * s * s + b * s + r;
  if (r === 0 || R === 0 || Math.abs(r) > 24 || Math.abs(R) > 40) return null;
  const askA = rng.bool(0.5);
  const answer = E(askA ? a : b);
  // wrong systems: points with the signs flipped, remainder taken as zero, other unknown assumed zero
  const flipped = solve2(s * s, -s, R - (-s) ** 3 - r, m * m, -m, -((-m) ** 3) - r);
  const zeroRem = solve2(s * s, s, -(s ** 3) - r, m * m, m, -(m ** 3) - r);
  const oneEq = askA
    ? (m !== 0 ? frac(-(m ** 3) - r, m * m) : null)
    : (m !== 0 ? frac(-(m ** 3) - r, m) : null);
  const pick = (v: [Exact, Exact] | null) => (v ? (askA ? v[0] : v[1]) : null);
  const must: Candidate[] = [
    { value: E(askA ? b : a), trap: `gave the value of ${askA ? 'b' : 'a'} instead of ${askA ? 'a' : 'b'}` },
    { value: pick(flipped), trap: `substituted x = ${-s} and x = ${-m} instead of x = ${s} and x = ${m}` },
  ];
  const swappedConds = solve2(s * s, s, -(s ** 3) - r, m * m, m, R - m ** 3 - r);
  const noConst = solve2(s * s, s, R - s ** 3, m * m, m, -(m ** 3));
  const extra: Candidate[] = [
    { value: answer.neg(), trap: 'sign slip when solving the simultaneous equations' },
    { value: pick(zeroRem), trap: `treated the remainder ${R} as zero (as if (x ${s >= 0 ? '-' : '+'} ${Math.abs(s)}) were a factor)` },
    { value: oneEq, trap: `used only the factor condition and assumed ${askA ? 'b' : 'a'} = 0` },
    { value: pick(swappedConds), trap: `swapped the two conditions: took f(${s}) = 0 and f(${m}) = ${R}` },
    { value: pick(noConst), trap: `left the constant term ${r} out of both equations` },
  ];
  const sTex = s < 0 ? `(${s})` : `${s}`;
  const mTex = m < 0 ? `(${m})` : `${m}`;
  const co = (v: number) => (Math.abs(v) === 1 ? '' : `${Math.abs(v)}`);
  const eq1 = `${sTex}^{3} + ${co(s * s)}a ${s >= 0 ? '+' : '-'} ${co(s)}b ${r >= 0 ? '+' : '-'} ${Math.abs(r)} = ${R}`;
  const eq2 = `${mTex}^{3} + ${co(m * m)}a ${m >= 0 ? '+' : '-'} ${co(m)}b ${r >= 0 ? '+' : '-'} ${Math.abs(r)} = 0`;
  const lin1 = `${s * s === 1 ? '' : s * s}a ${s >= 0 ? '+' : '-'} ${Math.abs(s) === 1 ? '' : Math.abs(s)}b = ${R - s ** 3 - r}`;
  const lin2 = `${m * m === 1 ? '' : m * m}a ${m >= 0 ? '+' : '-'} ${Math.abs(m) === 1 ? '' : Math.abs(m)}b = ${-(m ** 3) - r}`;
  return {
    stem: `$f(x) = x^{3} + ax^{2} + bx ${r >= 0 ? '+' : '-'} ${Math.abs(r)}$. When $f(x)$ is divided by $${rootFactor(s)}$ the remainder is $${R}$, and $${rootFactor(m)}$ is a factor of $f(x)$. Find the value of $${askA ? 'a' : 'b'}$.`,
    answer: { kind: 'exact', value: answer },
    options: options(rng, answer, must, extra),
    solution: `$f(${s}) = ${R}$ gives $${eq1}$, i.e. $${lin1}$; $f(${m}) = 0$ gives $${eq2}$, i.e. $${lin2}$. Solving, $a = ${a}$ and $b = ${b}$.`,
    trap: 'Two conditions give two linear equations in a and b: the remainder condition is f(s) = R, the factor condition is f(m) = 0.',
    tags: ['remainder-theorem', 'factor-theorem', 'simultaneous-equations'],
    params: { variant: 'two-conditions', s, m, r, R, askA },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 5

/** Other integer pairs with the same product as (u, v) but a different sum. */
function otherPairs(u: number, v: number): [number, number][] {
  const P = u * v;
  const out: [number, number][] = [];
  for (let d = 1; d <= Math.abs(P); d++) {
    if (P % d !== 0) continue;
    for (const x of [d, -d]) {
      const y = P / x;
      if (x > y) continue;
      if ((x === u && y === v) || (x === v && y === u)) continue;
      if (Math.abs(x) <= 9 && Math.abs(y) <= 9) out.push([x, y]);
    }
  }
  return out;
}

function factoriseQ(rng: RNG): Generated | null {
  const roots = rng.pickDistinct([-5, -4, -3, -2, -1, 1, 2, 3, 4, 5], 3);
  const [given, r2, r3] = roots;
  if (r2 + r3 === 0) return null; // x² − 4 makes the sign-flip distractors collapse onto the answer
  const coefs = mul(mul([1, -given], [1, -r2]), [1, -r3]);
  if (coefs.some((c) => Math.abs(c) > 40)) return null;
  const correct = productTex(roots);
  // Every option keeps the factor the stem hands the candidate: an option without it is eliminated on
  // sight. The two single-sign slips are named by the root they come from, so no trap text is repeated.
  const wrong: { display: string; trap: string }[] = [
    { display: productTex([given, -r2, -r3]), trap: 'signs of both remaining roots flipped: a root r gives the factor (x − r)' },
    { display: productTex([given, -r2, r3]), trap: `sign wrong in the bracket for the root ${r2}: it gives ${rootFactor(r2)}` },
    { display: productTex([given, r2, -r3]), trap: `sign wrong in the bracket for the root ${r3}: it gives ${rootFactor(r3)}` },
    ...otherPairs(r2, r3)
      .filter(([u, v]) => !(u === -r2 && v === -r3) && !(u === -r3 && v === -r2))
      .slice(0, 3)
      .map(([u, v]) => ({ display: productTex([given, u, v]), trap: `quadratic factor split as ${rootFactor(u)}${rootFactor(v)}: the right product but the wrong sum` })),
  ];
  const opts = choiceOrNull(rng, correct, wrong);
  if (!opts) return null;
  const quad = mul([1, -r2], [1, -r3]);
  return {
    stem: `Given that $${rootFactor(given)}$ is a factor of $f(x) = ${poly(coefs)}$, factorise $f(x)$ completely.`,
    answer: { kind: 'choice', value: correct },
    options: opts,
    solution: `Divide (or compare coefficients): $f(x) = ${rootFactor(given)}(${poly(quad)})$, and $${poly(quad)} = ${rootFactor(r2)}${rootFactor(r3)}$. So $f(x) = ${correct}$.`,
    trap: 'After taking out the given factor, factorise the quadratic carefully: check the signs by expanding the constant term.',
    tags: ['factor-theorem', 'factorise', 'cubic'],
    params: { variant: 'factorise', coefs, roots },
    typedAllowed: false,
  };
}

function whichFactorQ(rng: RNG): Generated | null {
  const r = rng.pick([-4, -3, -2, -1, 1, 2, 3, 4]);
  const p = rng.int(-4, 4), q = rng.nonZeroInt(-6, 6);
  const disc = p * p - 4 * q;
  const sq = Math.round(Math.sqrt(Math.abs(disc)));
  if (disc >= 0 && sq * sq === disc) return null; // the quadratic must have no rational roots
  const coefs = mul([1, -r], [1, p, q]);
  if (coefs.some((c) => Math.abs(c) > 40)) return null;
  const correct = rootFactor(r);
  const pool = [-4, -3, -2, -1, 1, 2, 3, 4].filter((t) => t !== r && horner(coefs, t) !== 0);
  const wrong = [
    { display: rootFactor(-r), trap: `sign: (x ${-r >= 0 ? '-' : '+'} ${Math.abs(r)}) is a factor only if f(${-r}) = 0, but f(${-r}) = ${horner(coefs, -r)}` },
    ...rng.pickDistinct(pool.filter((t) => t !== -r), 4).map((t) => ({ display: rootFactor(t), trap: `f(${t}) = ${horner(coefs, t)} ≠ 0, so (x ${t >= 0 ? '-' : '+'} ${Math.abs(t)}) is not a factor` })),
  ];
  const opts = choiceOrNull(rng, correct, wrong);
  if (!opts) return null;
  return {
    stem: `Which of the following is a factor of $${poly(coefs)}$?`,
    answer: { kind: 'choice', value: correct },
    options: opts,
    solution: `Test the candidates with the factor theorem: $f(${r}) = ${substTex(coefs, r)} = 0$, so $${correct}$ is a factor. The other candidates give non-zero remainders.`,
    trap: 'Test each candidate (x − t) by evaluating f(t); the factor is the one giving zero, and the sign inside the bracket is opposite to the root.',
    tags: ['factor-theorem', 'cubic'],
    params: { variant: 'which-factor', coefs, root: r },
    typedAllowed: false,
  };
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'm2.polynomials.remainder-factor',
  module: 'M2',
  topic: 'polynomials',
  title: 'Remainder and factor theorem',
  levels: {
    1: 'remainder when a quadratic is divided by (x − a): f(a)',
    2: 'cubic divided by (x + a): f(−a)',
    3: 'find k so that (x − a) is a factor of a cubic',
    4: 'divisor (2x − 1) → f(½); two conditions → find a coefficient',
    5: 'factorise a cubic completely given one factor; which linear expression is a factor',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return remainderQ(1)(rng);
        case 2: return remainderQ(2)(rng);
        case 3: return findKQ(rng);
        case 4: return pickVariant(rng, [halfQ, twoConditionsQ]);
        default: return pickVariant(rng, [factoriseQ, whichFactorQ]);
      }
    });
  },
  verify(q) {
    const p = q.params as Record<string, any> & { variant: string };
    const close = (x: number, y: number) => Math.abs(x - y) < 1e-9 * Math.max(1, Math.abs(y));
    if (q.answer.kind === 'choice') {
      const coefs = p.coefs as number[];
      if (q.options.filter((o) => o.correct).length !== 1) return false;
      if (p.variant === 'factorise') {
        const roots = p.roots as number[];
        // the product of the factors must agree with the expanded cubic at three points
        for (const x of [0.5, -1.5, 2.5]) {
          const prod = roots.reduce((acc, r) => acc * (x - r), 1);
          if (!close(prod, horner(coefs, x))) return false;
        }
        return q.answer.value === productTex(roots);
      }
      if (p.variant === 'which-factor') {
        const r = p.root as number;
        if (horner(coefs, r) !== 0 || q.answer.value !== rootFactor(r)) return false;
        // no other option may be a factor: read each option's root from its bracket
        return q.options.every((o) => {
          const m = /^\(x ([+-]) (\d+)\)$/.exec(o.display);
          if (!m) return false;
          const t = (m[1] === '-' ? 1 : -1) * Number(m[2]);
          return o.correct ? t === r : horner(coefs, t) !== 0;
        });
      }
      return false;
    }
    if (q.answer.kind !== 'exact') return false;
    const got = q.answer.value.toNumber();
    switch (p.variant) {
      case 'remainder':
        return close(got, horner(p.coefs as number[], p.a as number));
      case 'half': {
        const { coefs, m, s } = q.params as unknown as { coefs: number[]; m: number; s: number };
        return close(got, horner(coefs, s / m));
      }
      case 'find-k': {
        const { known, slot, a } = q.params as unknown as { known: number[]; slot: string; a: number };
        const full = known.slice();
        full[slot === 'x2' ? 1 : 2] = got;
        return close(horner(full, a), 0);
      }
      case 'two-conditions': {
        const { s, m, r, R, askA } = q.params as unknown as { s: number; m: number; r: number; R: number; askA: boolean };
        // Cramer's rule on  s²a + s b = R − s³ − r,  m²a + m b = −m³ − r
        const sol = solve2(s * s, s, R - s ** 3 - r, m * m, m, -(m ** 3) - r);
        if (!sol) return false;
        return close(got, (askA ? sol[0] : sol[1]).toNumber());
      }
      default:
        return false;
    }
  },
});
