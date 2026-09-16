import { defineTemplate, retry, type Level, type Generated } from '../../core/template';
import { E, frac, Exact, babs } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { gcd, lcm } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Fraction arithmetic, answer as a single fraction in lowest terms.
 * Level 1: a/b ± c/d with denominators ≤ 6
 * Level 2: multiply / divide simple fractions where cancelling helps (3/4 × 8/9, 2/3 ÷ 4/9)
 * Level 3: mixed numbers add / subtract (2⅓ − 1¾), rendered with \tfrac
 * Level 4: three terms with a bracket and mixed operations ((2/3 + 1/4) ÷ 5/6)
 * Level 5: complex fraction (1/2 + 1/3)/(1/2 − 1/3) or a continued fraction 1/(1 + 1/(1 + 1/2))
 *
 * Every wrong option is the result of a named mistake (or, if the mistakes run short, a labelled
 * arithmetic slip of one in the numerator or denominator). Parameters that cannot supply four such
 * options are rejected rather than padded.
 */

type Op = '+' | '-' | '*' | '/';
const TEX: Record<Op, string> = { '+': '+', '-': '-', '*': '\\times', '/': '\\div' };

function ap(x: Exact, op: Op, y: Exact): Exact {
  switch (op) {
    case '+': return x.add(y);
    case '-': return x.sub(y);
    case '*': return x.mul(y);
    case '/': return x.div(y);
  }
}

function apn(x: number, op: Op, y: number): number {
  switch (op) {
    case '+': return x + y;
    case '-': return x - y;
    case '*': return x * y;
    case '/': return x / y;
  }
}

const fr = (n: number, d: number) => `\\frac{${n}}{${d}}`;
/** Fraction, or a bare integer once a cancellation has left denominator 1. */
const frOrInt = (n: number, d: number) => (d === 1 ? `${n}` : fr(n, d));
const tfr = (n: number, d: number) => `\\tfrac{${n}}{${d}}`;
const mixedTex = (w: number, n: number, d: number) => `${w}${tfr(n, d)}`;
const tex = (x: Exact) => x.toLatex({ format: 'fraction' });
/** Denominators whose pairwise products are all "clean" (no 7ths: 35ths and 49ths are not exam numbers). */
const DENS = [2, 3, 4, 5, 6, 8, 9, 10];
const VERBS = ['Evaluate', 'Find the value of', 'Work out'];

/** Numerator of a proper fraction n/d in lowest terms. */
function properNum(rng: RNG, d: number): number {
  const pool: number[] = [];
  for (let n = 1; n < d; n++) if (gcd(n, d) === 1) pool.push(n);
  return rng.pick(pool);
}

/** Guarded construction: a distractor path that divides by zero is simply dropped. */
function tryE(f: () => Exact): Exact | null {
  try { return f(); } catch { return null; }
}

/** An option an exam would print: a fraction with a small denominator and a modest size. */
function neat(x: Exact, maxDen: number, maxAbs = 30): boolean {
  if (!x.isRational()) return false;
  return x.toRat().d <= BigInt(maxDen) && Math.abs(x.toNumber()) <= maxAbs;
}

/** Keep clean, neat, finite, non-zero (and by default positive) distractors, de-duplicated. */
function keep(cands: { value: Exact | null; trap: string }[], maxDen = 36, allowNegative = false): Distractor[] {
  const out: Distractor[] = [];
  for (const c of cands) {
    const v = c.value;
    if (!v || v.isZero() || !Number.isFinite(v.toNumber())) continue;
    if (!allowNegative && v.sign() < 0) continue;
    if (!isCleanExact(v).ok || !neat(v, maxDen)) continue;
    if (out.some((d) => d.value.equals(v))) continue;
    out.push({ value: v, trap: c.trap });
  }
  return out;
}

/** The answer must be a fraction with small numerator and denominator. */
function smallRat(x: Exact, max: number): boolean {
  if (!x.isRational()) return false;
  const r = x.toRat();
  return babs(r.n) <= BigInt(max) && r.d <= BigInt(max);
}

/** p ± q is only a credible "wrong operation" option when it is itself a simple fraction. */
function simple(x: Exact, maxDen = 12): Exact | null {
  return x.isRational() && x.toRat().d <= BigInt(maxDen) ? x : null;
}

function ask(rng: RNG, expr: string, ans: Exact): string {
  const verb = rng.pick(VERBS);
  return ans.isInteger()
    ? `${verb} $${expr}$, giving your answer in its simplest form.`
    : `${verb} $${expr}$, giving your answer as a fraction in its lowest terms.`;
}

/**
 * Choose the four wrong options: mistake-based candidates first (in random order), then — only if they
 * run short — labelled near misses (a slip of one in the numerator or denominator of the answer).
 * Fewer than four in total rejects the parameters; the generic perturbations are never reached.
 */
function pack(stem: string, ans: Exact, rng: RNG, cands: Distractor[], solution: string, trap: string, tags: string[], params: Record<string, unknown>, format: 'fraction' | 'mixed' = 'fraction', maxDen = 36): Generated | null {
  const chosen = rng.shuffle(cands.filter((d) => !d.value.equals(ans))).slice(0, 4);
  if (chosen.length < 4) {
    const r = ans.toRat();
    const N = Number(r.n), D = Number(r.d);
    const near = keep([
      { value: frac(N + 1, D), trap: 'arithmetic slip of one in the numerator' },
      { value: frac(N - 1, D), trap: 'arithmetic slip of one in the numerator' },
      { value: D > 1 ? frac(N, D + 1) : null, trap: 'arithmetic slip of one in the denominator' },
      { value: D > 2 ? frac(N, D - 1) : null, trap: 'arithmetic slip of one in the denominator' },
    ], maxDen);
    for (const c of rng.shuffle(near)) {
      if (chosen.length >= 4) break;
      if (!c.value.equals(ans) && !chosen.some((d) => d.value.equals(c.value))) chosen.push(c);
    }
  }
  if (chosen.length < 4) return null;
  return {
    stem,
    answer: { kind: 'exact' as const, value: ans, format },
    options: buildOptions(rng, ans, chosen, { format }),
    solution,
    trap,
    tags,
    params,
    typedAllowed: true,
  };
}

// ---------------------------------------------------------------------------
// Level 1: a/b ± c/d
// ---------------------------------------------------------------------------
function addSub(rng: RNG): Generated | null {
  const [b, d] = rng.pickDistinct([2, 3, 4, 5, 6], 2);
  const a = properNum(rng, b);
  const c = properNum(rng, d);
  const op: Op = rng.bool() ? '+' : '-';
  const p = frac(a, b), q = frac(c, d);
  if (op === '-' && p.cmp(q) <= 0) return null;
  const ans = ap(p, op, q);
  if (ans.isInteger() || !isCleanExact(ans).ok) return null;
  const L = lcm(b, d);
  const a2 = a * (L / b), c2 = c * (L / d);
  const n = op === '+' ? a2 + c2 : a2 - c2;
  const sgn = op === '+' ? 1 : -1;
  const unit = a === 1 && c === 1;

  const ds = keep([
    { value: op === '+' || (b > d && a > c) ? tryE(() => frac(a + sgn * c, b + sgn * d)) : null, trap: 'added (or subtracted) the numerators and the denominators separately' },
    { value: frac(a + sgn * c, L), trap: 'changed the denominators to the common denominator but left the numerators alone' },
    { value: L !== d ? frac(a2 + sgn * c, L) : null, trap: 'scaled the first numerator but forgot to scale the second' },
    { value: L !== b ? frac(a + sgn * c2, L) : null, trap: 'scaled the second numerator but forgot to scale the first' },
    { value: frac(a * (L / d) + sgn * c * (L / b), L), trap: 'scaled each numerator by the wrong factor (cross-multiplied the wrong way round)' },
    { value: op === '+' ? p.sub(q).abs() : p.add(q), trap: op === '+' ? 'subtracted instead of adding' : 'added instead of subtracting' },
    { value: p.mul(q), trap: 'multiplied the fractions instead' },
    { value: frac(a * d + sgn * c * b, b + d), trap: 'cross-multiplied the numerators but added the denominators' },
    { value: unit ? (op === '+' ? frac(1, b + d) : frac(1, Math.abs(d - b))) : null, trap: op === '+' ? 'added the denominators: 1/b + 1/d is not 1/(b + d)' : 'subtracted the denominators: 1/b − 1/d is not 1/(d − b)' },
  ]);

  const rewrites: string[] = [];
  if (L !== b) rewrites.push(`$${fr(a, b)} = ${fr(a2, L)}$`);
  if (L !== d) rewrites.push(`$${fr(c, d)} = ${fr(c2, L)}$`);
  const reduced = tex(ans) !== fr(n, L);
  const solution = `Use the common denominator $${L}$: ${rewrites.join(' and ')}, so the answer is $${fr(a2, L)} ${TEX[op]} ${fr(c2, L)} = ${fr(n, L)}$${reduced ? ` $= ${tex(ans)}$` : ''}.`;
  return pack(
    ask(rng, `${fr(a, b)} ${TEX[op]} ${fr(c, d)}`, ans), ans, rng, ds, solution,
    'Fractions only add once they share a denominator: scale the numerators too, and never add numerators and denominators separately.',
    ['fractions', 'add', 'subtract', 'common-denominator'],
    { variant: 'addsub', nums: [a, b, c, d], ops: [op] },
  );
}

// ---------------------------------------------------------------------------
// Level 2: a/b × c/d and a/b ÷ c/d with cancelling
// ---------------------------------------------------------------------------
function mulDiv(rng: RNG): Generated | null {
  const op: Op = rng.bool() ? '*' : '/';
  const b = rng.pick(DENS), d = rng.pick(DENS);
  const a = properNum(rng, b), c = properNum(rng, d);
  if (a * d === b * c) return null; // identical fractions: a/b ÷ a/b = 1 is not a question
  // there must be something to cancel (after inverting, for division)
  const cancels = op === '*' ? gcd(a, d) > 1 || gcd(c, b) > 1 : gcd(a, c) > 1 || gcd(b, d) > 1;
  if (!cancels) return null;
  const p = frac(a, b), q = frac(c, d);
  const ans = ap(p, op, q);
  if (ans.equals(E(1)) || !isCleanExact(ans).ok || !smallRat(ans, 24)) return null;

  let ds: Distractor[];
  let solution: string;
  if (op === '*') {
    const g1 = gcd(a, d), g2 = gcd(c, b);
    const gn = gcd(a, c), gd = gcd(b, d);
    ds = keep([
      { value: p.div(q), trap: 'inverted the second fraction as though dividing' },
      { value: gn > 1 ? frac((a / gn) * (c / gn), b * d) : null, trap: 'cancelled a numerator against the other numerator' },
      { value: gd > 1 ? frac(a * c, (b / gd) * (d / gd)) : null, trap: 'cancelled a denominator against the other denominator' },
      { value: g1 > 1 ? frac((a / g1) * c, b * d) : frac(a * (c / g2), b * d), trap: 'cancelled the numerator but forgot to cancel the matching denominator' },
      { value: g1 > 1 ? frac(a * c, b * (d / g1)) : frac(a * c, (b / g2) * d), trap: 'cancelled the denominator but forgot to cancel the matching numerator' },
      { value: simple(p.add(q)), trap: 'added the fractions instead of multiplying' },
      { value: frac(a * c, b + d), trap: 'multiplied the numerators but added the denominators' },
      { value: frac(a * c, lcm(b, d)), trap: 'multiplied the numerators but used the common denominator, as when adding' },
      { value: frac(a + c, b * d), trap: 'added the numerators but multiplied the denominators' },
    ]);
    solution = `Cancel across before multiplying: $${fr(a, b)} \\times ${fr(c, d)} = ${frOrInt(a / g1, b / g2)} \\times ${frOrInt(c / g2, d / g1)} = ${tex(ans)}$.`;
  } else {
    const g1 = gcd(a, c), g2 = gcd(d, b);
    const gx = gcd(a, d), gy = gcd(b, c);
    ds = keep([
      { value: p.mul(q), trap: 'forgot to invert the second fraction' },
      { value: q.div(p), trap: 'inverted the first fraction instead of the second (divided the wrong way round)' },
      { value: gx > 1 ? frac((a / gx) * (d / gx), b * c) : null, trap: 'after inverting, cancelled a numerator against the other numerator' },
      { value: gy > 1 ? frac(a * d, (b / gy) * (c / gy)) : null, trap: 'after inverting, cancelled a denominator against the other denominator' },
      { value: g1 > 1 ? frac((a / g1) * d, b * c) : frac(a * (d / g2), b * c), trap: 'after inverting, cancelled the numerator but forgot to cancel the matching denominator' },
      { value: g1 > 1 ? frac(a * d, b * (c / g1)) : frac(a * d, (b / g2) * c), trap: 'after inverting, cancelled the denominator but forgot to cancel the matching numerator' },
      { value: simple(p.sub(q).abs()), trap: 'subtracted the fractions instead' },
      { value: simple(p.add(q)), trap: 'added the fractions instead' },
    ]);
    solution = `Invert and multiply: $${fr(a, b)} \\div ${fr(c, d)} = ${fr(a, b)} \\times ${fr(d, c)} = ${frOrInt(a / g1, b / g2)} \\times ${frOrInt(d / g2, c / g1)} = ${tex(ans)}$.`;
  }
  return pack(
    ask(rng, `${fr(a, b)} ${TEX[op]} ${fr(c, d)}`, ans), ans, rng, ds, solution,
    op === '*' ? 'Cancel a numerator against a denominator (never numerator against numerator), then multiply straight across.' : 'Dividing by a fraction means multiplying by its reciprocal: invert the second fraction only.',
    ['fractions', op === '*' ? 'multiply' : 'divide', 'cancel'],
    { variant: 'muldiv', nums: [a, b, c, d], ops: [op] },
  );
}

// ---------------------------------------------------------------------------
// Level 3: mixed numbers
// ---------------------------------------------------------------------------
function mixed(rng: RNG): Generated | null {
  const d1 = rng.int(2, 8);
  const d2 = rng.intExcluding(2, 8, [d1]);
  const L = lcm(d1, d2);
  if (L > 24) return null;
  const n1 = properNum(rng, d1), n2 = properNum(rng, d2);
  const w1 = rng.int(1, 5), w2 = rng.int(1, 4);
  const op: Op = rng.bool() ? '+' : '-';
  const f1 = frac(n1, d1), f2 = frac(n2, d2);
  const m1 = E(w1).add(f1), m2 = E(w2).add(f2);
  if (op === '-' && m1.cmp(m2) <= 0) return null;
  const ans = ap(m1, op, m2);
  if (ans.isInteger() || !isCleanExact(ans).ok) return null;
  const sgn = op === '+' ? 1 : -1;
  const fpart = ap(f1, op, f2);
  const borrow = op === '-' && fpart.sign() < 0;
  const carry = op === '+' && fpart.cmp(E(1)) > 0;
  const wholes = w1 + sgn * w2;

  // Traps on both sides of the answer (too small: dropped wholes, fraction slips; too large: whole-number slips,
  // wrong sign on the wholes) so that the correct value is not simply the largest option.
  const ds = keep([
    { value: fpart.abs(), trap: 'dropped the whole-number parts' },
    { value: borrow ? E(w1 - w2).add(fpart.abs()) : null, trap: 'subtracted the fraction parts the wrong way round (smaller from larger)' },
    { value: ans.add(E(1)), trap: borrow ? 'borrowed 1 from the whole number but forgot to reduce it' : 'whole-number part one too many' },
    { value: carry || ans.cmp(E(1)) > 0 ? ans.sub(E(1)) : null, trap: carry ? 'forgot to carry the 1 from the fraction parts' : 'whole-number part one too few' },
    { value: op === '-' ? E(w1 + w2).add(fpart) : null, trap: 'added the whole numbers but subtracted the fraction parts' },
    { value: tryE(() => E(wholes).add(frac(n1 + sgn * n2, d1 + sgn * d2))), trap: 'added (or subtracted) the numerators and denominators of the fraction parts separately' },
    { value: E(wholes).add(frac(n1 + sgn * n2, L)), trap: 'changed to the common denominator without scaling the numerators' },
    { value: E(wholes).add(frac(n1 * (L / d2) + sgn * n2 * (L / d1), L)), trap: 'scaled each numerator by the wrong factor (cross-multiplied the wrong way round)' },
    { value: op === '+' ? m1.sub(m2).abs() : m1.add(m2), trap: op === '+' ? 'subtracted instead of adding' : 'added instead of subtracting' },
    { value: ap(frac(w1 + n1, d1), op, frac(w2 + n2, d2)).abs(), trap: 'converted to improper fractions by adding the whole number to the numerator' },
    { value: ap(E(w1).mul(f1), op, E(w2).mul(f2)).abs(), trap: 'treated each mixed number as whole × fraction' },
  ]);

  const solution = `Deal with the wholes and the fraction parts separately: $(${w1} ${TEX[op]} ${w2}) + \\left(${fr(n1, d1)} ${TEX[op]} ${fr(n2, d2)}\\right) = ${wholes} ${fpart.sign() < 0 ? '-' : '+'} ${tex(fpart.abs())} = ${ans.toLatex({ format: 'mixed' })}$.`;
  return pack(
    `${rng.pick(VERBS)} $${mixedTex(w1, n1, d1)} ${TEX[op]} ${mixedTex(w2, n2, d2)}$, giving your answer in its simplest form.`,
    ans, rng, ds, solution,
    'Handle the whole numbers and the fraction parts separately, and keep the whole numbers: a negative fraction part just means borrowing 1.',
    ['fractions', 'mixed-numbers', op === '+' ? 'add' : 'subtract'],
    { variant: 'mixed', nums: [w1, n1, d1, w2, n2, d2], ops: [op] },
    'mixed',
  );
}

// ---------------------------------------------------------------------------
// Level 4: (p ± q) × r, (p ± q) ÷ r, r × (p ± q), r ÷ (p ± q)
// ---------------------------------------------------------------------------
function bracket(rng: RNG): Generated | null {
  const [b, d] = rng.pickDistinct([2, 3, 4, 5, 6], 2);
  const a = properNum(rng, b), c = properNum(rng, d);
  const f = rng.pick(DENS);
  const e = properNum(rng, f);
  const op1: Op = rng.bool() ? '+' : '-';
  const op2: Op = rng.bool() ? '*' : '/';
  const form = rng.bool(0.7) ? 'front' : 'back';
  const p = frac(a, b), q = frac(c, d), r = frac(e, f);
  if (op1 === '-' && p.cmp(q) <= 0) return null;
  const s = ap(p, op1, q);
  if (s.isInteger()) return null;
  const sr = s.toRat();
  const sn = Number(sr.n), sd = Number(sr.d);
  // the second step should cancel, as the exam intends
  const cancels = op2 === '*' ? gcd(sn, f) > 1 || gcd(e, sd) > 1 : gcd(sn, e) > 1 || gcd(sd, f) > 1;
  if (!cancels) return null;
  const ans = form === 'front' ? ap(s, op2, r) : ap(r, op2, s);
  if (!isCleanExact(ans).ok || !smallRat(ans, 24)) return null;

  const second = (t: Exact | null) => (t ? tryE(() => (form === 'front' ? ap(t, op2, r) : ap(r, op2, t))) : null);
  const other: Op = op1 === '+' ? '-' : '+';
  const cs = op1 === '+' ? c : -c, dsgn = op1 === '+' ? d : -d;
  const L = lcm(b, d);
  const a2 = a * (L / b), c2 = c * (L / d);
  const ds = keep([
    { value: tryE(() => (form === 'front' ? ap(p, op1, ap(q, op2, r)) : ap(ap(r, op2, p), op1, q))), trap: 'ignored the bracket and did the multiplication/division first' },
    { value: op2 === '/' ? (form === 'front' ? s.mul(r) : r.mul(s)) : (form === 'front' ? s.div(r) : r.div(s)), trap: op2 === '/' ? 'forgot to invert when dividing' : 'inverted as though dividing' },
    { value: op2 === '/' ? ans.inv() : null, trap: 'inverted the wrong fraction' },
    { value: form === 'back' && op2 === '/' ? tryE(() => ap(r.div(p), op1, r.div(q))) : null, trap: 'split the division over the bracket: r ÷ (p ± q) is not r ÷ p ± r ÷ q' },
    { value: form === 'front' && op2 === '/' && e > 1 ? s.mul(E(f)) : null, trap: `multiplied by ${f} instead of by the reciprocal ${f}/${e}` },
    { value: second(tryE(() => frac(a + cs, b + dsgn))), trap: 'added the numerators and denominators inside the bracket' },
    { value: second(ap(p, other, q).abs()), trap: 'sign error inside the bracket' },
    { value: second(frac(a + cs, L)), trap: 'forgot to scale the numerators inside the bracket' },
    { value: L !== d ? second(frac(a2 + cs, L)) : null, trap: 'scaled only the first numerator inside the bracket' },
    { value: L !== b ? second(frac(a + (op1 === '+' ? c2 : -c2), L)) : null, trap: 'scaled only the second numerator inside the bracket' },
  ], 60);

  const bracketTex = `\\left(${fr(a, b)} ${TEX[op1]} ${fr(c, d)}\\right)`;
  const expr = form === 'front' ? `${bracketTex} ${TEX[op2]} ${fr(e, f)}` : `${fr(e, f)} ${TEX[op2]} ${bracketTex}`;
  const sTex = tex(s);
  const step2 = op2 === '*'
    ? (form === 'front' ? `${sTex} \\times ${fr(e, f)}` : `${fr(e, f)} \\times ${sTex}`)
    : (form === 'front' ? `${sTex} \\times ${fr(f, e)}` : `${fr(e, f)} \\times ${fr(sd, sn)}`);
  const solution = `Bracket first: $${fr(a, b)} ${TEX[op1]} ${fr(c, d)} = ${sTex}$. Then ${op2 === '/' ? 'invert and multiply' : 'cancel and multiply'}: $${step2} = ${tex(ans)}$.`;
  return pack(
    ask(rng, expr, ans), ans, rng, ds, solution,
    'Do the bracket first, then invert only the fraction you are dividing by.',
    ['fractions', 'brackets', 'mixed-operations'],
    { variant: 'bracket', nums: [a, b, c, d, e, f], ops: [op1, op2], form },
    'fraction', 60,
  );
}

// ---------------------------------------------------------------------------
// Level 5a: (p + q)/(p − q)
// ---------------------------------------------------------------------------
function ratio(rng: RNG): Generated | null {
  const [b0, d0] = rng.pickDistinct([2, 3, 4, 5, 6], 2);
  let a = properNum(rng, b0), c = properNum(rng, d0);
  let b = b0, d = d0;
  if (frac(a, b).cmp(frac(c, d)) < 0) { [a, c] = [c, a]; [b, d] = [d, b]; }
  const p = frac(a, b), q = frac(c, d);
  if (p.equals(q)) return null;
  const form = rng.bool() ? 'plus-over-minus' : 'minus-over-plus';
  const N = p.add(q), D = p.sub(q);
  const ans = form === 'plus-over-minus' ? N.div(D) : D.div(N);
  if (!isCleanExact(ans).ok || !smallRat(ans, 30)) return null;
  const top = a * d + c * b, bot = a * d - c * b;
  const pom = form === 'plus-over-minus';

  const ds = keep([
    { value: ans.inv(), trap: 'divided the wrong way round' },
    { value: ans.neg(), trap: 'sign error: used q − p instead of p − q' },
    { value: N.mul(D), trap: 'multiplied the top and bottom instead of dividing' },
    { value: p.div(q), trap: 'cancelled the common fraction from the top and the bottom' },
    { value: tryE(() => { const n1 = frac(a + c, b + d), d1 = frac(a - c, b - d); return pom ? n1.div(d1) : d1.div(n1); }), trap: 'added the numerators and denominators separately' },
    { value: pom ? N : D, trap: 'forgot to divide by the bottom' },
    { value: pom ? D : N, trap: 'gave the bottom instead of the quotient' },
  ], 60, true);

  const tp = `${tfr(a, b)} + ${tfr(c, d)}`, tm = `${tfr(a, b)} - ${tfr(c, d)}`;
  const expr = pom ? `\\dfrac{${tp}}{${tm}}` : `\\dfrac{${tm}}{${tp}}`;
  const L = b * d;
  const sumTex = `${a * d} + ${c * b}`, difTex = `${a * d} - ${c * b}`;
  const raw = pom ? fr(top, bot) : fr(bot, top);
  const solution = `Multiply top and bottom by $${L}$: $\\dfrac{${pom ? sumTex : difTex}}{${pom ? difTex : sumTex}} = ${raw}$${tex(ans) !== raw ? ` $= ${tex(ans)}$` : ''}.`;
  return pack(
    ask(rng, expr, ans), ans, rng, ds, solution,
    'Clear the small fractions by multiplying top and bottom by the common denominator; do not invert or cancel term by term.',
    ['fractions', 'complex-fraction'],
    { variant: 'ratio', nums: [a, b, c, d], ops: [], form },
    'fraction', 60,
  );
}

// ---------------------------------------------------------------------------
// Level 5b: a + 1/(b + 1/c) and 1/(a + 1/(b + 1/c))
// ---------------------------------------------------------------------------
function cont(rng: RNG): Generated | null {
  const a = rng.int(1, 3), b = rng.int(1, 3), c = rng.int(2, 5);
  const form = rng.bool() ? 'plain' : 'inv';
  const inner = E(b).add(E(1).div(E(c))); // (bc + 1)/c
  const v = E(a).add(inner.inv()); // a + c/(bc + 1)
  const ans = form === 'plain' ? v : v.inv();
  if (!isCleanExact(ans).ok || !smallRat(ans, 40)) return null;

  const wrongs: { value: Exact; trap: string }[] = [
    { value: E(a).add(frac(1, b)).add(frac(1, c)), trap: 'read the expression as a + 1/b + 1/c' },
    { value: E(a + b).add(frac(1, c)), trap: 'forgot to take the reciprocal of the inner bracket' },
    { value: E(a).add(frac(c, b + 1)), trap: 'wrote b + 1/c as (b + 1)/c' },
    { value: E(a).add(frac(1, b + c)), trap: 'replaced 1/c by c' },
    { value: E(a).add(frac(1, b)).add(E(c)), trap: 'inverted the inner bracket term by term: 1/(b + 1/c) is not 1/b + c' },
  ];
  const ds = keep([
    ...(form === 'plain' ? wrongs : wrongs.map((w) => ({ value: tryE(() => w.value.inv()), trap: w.trap }))),
    { value: form === 'plain' ? v.inv() : v, trap: form === 'plain' ? 'inverted the whole expression' : 'forgot the final reciprocal' },
  ], 60);

  const innerTex = `${a} + \\cfrac{1}{${b} + \\cfrac{1}{${c}}}`;
  const expr = form === 'plain' ? innerTex : `\\cfrac{1}{${innerTex}}`;
  const bc1 = b * c + 1;
  const solution = `Work from the inside out: $${b} + ${fr(1, c)} = ${fr(bc1, c)}$, so its reciprocal is $${fr(c, bc1)}$ and $${a} + ${fr(c, bc1)} = ${tex(v)}$${form === 'inv' ? `. Finally invert: $${tex(ans)}$` : ''}.`;
  return pack(
    ask(rng, expr, ans), ans, rng, ds, solution,
    'Evaluate the innermost fraction first and take reciprocals one layer at a time: 1/(b + 1/c) = c/(bc + 1).',
    ['fractions', 'continued-fraction', 'reciprocal'],
    { variant: 'cont', nums: [a, b, c], ops: [], form },
    'fraction', 60,
  );
}

export default defineTemplate({
  id: 'm1.fractions.arithmetic',
  module: 'M1',
  topic: 'fractions',
  title: 'Fraction arithmetic',
  levels: {
    1: 'a/b ± c/d with denominators ≤ 6',
    2: 'multiply / divide simple fractions with cancelling (3/4 × 8/9, 2/3 ÷ 4/9)',
    3: 'mixed numbers add / subtract (2⅓ − 1¾)',
    4: 'three terms with a bracket, mixed operations ((2/3 + 1/4) ÷ 5/6)',
    5: 'complex fraction (1/2 + 1/3)/(1/2 − 1/3) or continued fraction 1/(1 + 1/(1 + 1/2))',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return addSub(rng);
        case 2: return mulDiv(rng);
        case 3: return mixed(rng);
        case 4: return bracket(rng);
        default: return rng.bool() ? ratio(rng) : cont(rng);
      }
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    // Evaluate the same expression in floating point straight from the raw parameters.
    const { variant, nums, ops, form } = q.params as { variant: string; nums: number[]; ops: Op[]; form?: string };
    const [n0, n1, n2, n3, n4, n5] = nums;
    let expected: number;
    switch (variant) {
      case 'addsub':
      case 'muldiv':
        expected = apn(n0 / n1, ops[0], n2 / n3);
        break;
      case 'mixed':
        expected = apn(n0 + n1 / n2, ops[0], n3 + n4 / n5);
        break;
      case 'bracket': {
        const s = apn(n0 / n1, ops[0], n2 / n3);
        expected = form === 'front' ? apn(s, ops[1], n4 / n5) : apn(n4 / n5, ops[1], s);
        break;
      }
      case 'ratio': {
        const p = n0 / n1, qv = n2 / n3;
        expected = form === 'plus-over-minus' ? (p + qv) / (p - qv) : (p - qv) / (p + qv);
        break;
      }
      case 'cont': {
        const v = n0 + 1 / (n1 + 1 / n2);
        expected = form === 'inv' ? 1 / v : v;
        break;
      }
      default:
        return false;
    }
    const got = q.answer.value.toNumber();
    return q.answer.value.isRational() && Math.abs(got - expected) <= 1e-9 * Math.max(1, Math.abs(expected));
  },
});
