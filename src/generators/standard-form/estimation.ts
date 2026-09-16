import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, Exact } from '../../core/exact';
import { buildOptions, fixedOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import type { RNG } from '../../core/rng';

/**
 * Estimation and orders of magnitude. The rounding rule is always stated, so the answer is determinate.
 * Level 1: products, each number rounded to 1 s.f.: 4.9 × 19.8 ≈ 5 × 20 = 100
 * Level 2: quotients: (0.0498 × 19.7) / 0.51 ≈ (0.05 × 20) / 0.5 = 2
 * Level 3: square roots and squares: √0.0398 ≈ √0.04 = 0.2; 3.1² × 19.8 ≈ 9 × 20 = 180
 * Level 4: order of magnitude of a real quantity from data in the stem (seconds in a year ≈ 3 × 10^7 → 10^7),
 *          a choice between five consecutive powers of ten
 * Level 5: standard form: (5.02 × 10^3)² / (2.1 × 10^-2) ≈ 25 × 10^6 / 0.02 = 1.25 × 10^9
 *
 * Every raw number is built as (integer mantissa) × 10^k, so its decimal string is exact and verify()
 * can round it independently with toPrecision(1). Wrong options are named mistakes: rounding after
 * multiplying, truncating instead of rounding, a misplaced decimal point, halving instead of rooting,
 * doubling instead of squaring, the sign of an exponent.
 */

const DEC = { format: 'decimal' as const };
const SF = { format: 'sf' as const };
const p10 = (k: number) => Exact.decimal(`1e${k}`);
/** m × 10^k exactly. */
const sf = (m: number, k: number) => E(m).mul(p10(k));

/** Decimal string of M × 10^e without exponent notation: (498, −4) → "0.0498", (198, −1) → "19.8", (3, 2) → "300". */
function decStr(M: number, e: number): string {
  let s = String(M);
  if (e >= 0) return s + '0'.repeat(e);
  const n = -e;
  if (s.length <= n) s = '0'.repeat(n - s.length + 1) + s;
  s = s.slice(0, s.length - n) + '.' + s.slice(s.length - n);
  return s.replace(/0+$/, '').replace(/\.$/, '');
}

/** A raw number that rounds to d × 10^k at 1 significant figure. */
interface Num { str: string; d: number; k: number; M: number; trunc: Exact }

/** Offsets (in hundredths of the leading digit) that keep the 1 s.f. rounding at d; 1 only rounds down to 0.96. */
const OFFSETS_3 = [-28, -25, -18, -15, -13, -12, -8, -5, -3, -2, 2, 3, 5, 8, 12, 13, 15, 18, 25, 28];
const OFFSETS_2 = [-30, -20, -10, 10, 20, 30];

function rawNum(rng: RNG, d: number, k: number, sig: 2 | 3): Num {
  const pool = (sig === 2 ? OFFSETS_2 : OFFSETS_3).filter((o) => (d > 1 ? true : o >= -4 || o > 0));
  const off = rng.pick(pool);
  const M = 100 * d + off; // raw = M × 10^(k-2)
  const str = decStr(M, k - 2);
  // truncation to 1 s.f.: the leading digit of M and its place
  const trunc = M >= 100 ? sf(Number(String(M)[0]), k) : sf(9, k - 1);
  return { str, d, k, M, trunc };
}

const exact = (n: Num) => Exact.decimal(n.str);

/** x rounded to 1 significant figure, as an Exact (null if x is not positive). */
function round1(x: number): Exact | null {
  if (!(x > 0) || !Number.isFinite(x)) return null;
  return Exact.decimal(x.toPrecision(1));
}

type Cand = { value: Exact | null; trap: string };

/** Positive, terminating, at most three significant figures (an exam estimate); in standard form also |exponent| ≥ 2. */
function displayable(v: Exact, fmt: 'decimal' | 'sf'): boolean {
  if (!v.isRational() || !Number.isFinite(v.toNumber()) || v.sign() <= 0 || !isCleanExact(v).ok) return false;
  let d = v.toRat().d;
  while (d % 2n === 0n) d /= 2n;
  while (d % 5n === 0n) d /= 5n;
  if (d !== 1n) return false;
  if (v.toPlain(DEC).replace('.', '').replace(/^0+/, '').replace(/0+$/, '').length > 3) return false;
  if (fmt === 'sf') {
    const e = Math.floor(Math.log10(v.toNumber()) + 1e-9);
    if (Math.abs(e) < 2 || Math.abs(e) > 15) return false;
  }
  return true;
}

function cleanOnly(ds: Cand[], fmt: 'decimal' | 'sf' = 'decimal'): Distractor[] {
  const out: Distractor[] = [];
  for (const d of ds) {
    const v = d.value;
    if (!v || !displayable(v, fmt)) continue;
    if (out.some((o) => o.value.equals(v))) continue;
    out.push({ value: v, trap: d.trap });
  }
  return out;
}

/**
 * Choose the distractors so that the answer moves around the sorted option list: a random number of
 * them is taken from below the answer and the rest from above, so the rank histogram is flat instead
 * of peaking at the median. At most `maxPow10` options may be the answer at another scale — a list of
 * the same digits with the decimal point moved is one mistake, not four — and no trap is repeated
 * (the two renormalisation slips used to share a label and appear together). Candidates stay within
 * `maxRatio` of the answer (an option a thousand times the answer is not a real choice). `must` first,
 * then the extras in random order.
 */
function spread(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], opts: { count?: number; maxPow10?: number; maxRatio?: number } = {}): Distractor[] {
  const count = opts.count ?? 4;
  const maxPow10 = opts.maxPow10 ?? 1;
  const bound = opts.maxRatio ?? 1e3;
  const a = answer.toNumber();
  const near = (v: Exact) => { const r = v.toNumber() / a; return r > 1 / bound && r < bound; };
  const seen: Exact[] = [answer];
  const traps = new Set<string>();
  const pool: Distractor[] = [];
  for (const d of [...must, ...rng.shuffle(extra)]) {
    if (!Number.isFinite(d.value.toNumber()) || !near(d.value)) continue;
    if (seen.some((s) => s.equals(d.value))) continue;
    if (d.trap && traps.has(d.trap)) continue;
    seen.push(d.value);
    if (d.trap) traps.add(d.trap);
    pool.push(d);
  }
  const isPow10 = (v: Exact) => {
    const r = Math.log10(Math.abs(v.toNumber() / a));
    return Number.isFinite(r) && Math.abs(r - Math.round(r)) < 1e-9 && Math.round(r) !== 0;
  };
  const below = pool.filter((d) => d.value.cmp(answer) < 0);
  const above = pool.filter((d) => d.value.cmp(answer) > 0);
  const want = rng.weighted(Array.from({ length: count + 1 }, (_, i) => i), Array.from({ length: count + 1 }, (_, i) => (i === 0 || i === count ? 1 : 2)));
  const out: Distractor[] = [];
  let tens = 0;
  const take = (d: Distractor, cap: number) => {
    if (out.length >= count || out.includes(d)) return false;
    const ten = isPow10(d.value);
    if (ten && tens >= cap) return false;
    out.push(d);
    if (ten) tens++;
    return true;
  };
  let n = 0;
  for (const d of below) { if (n >= want) break; if (take(d, maxPow10)) n++; }
  for (const d of above) take(d, maxPow10);
  for (const d of below) take(d, maxPow10);
  for (const d of pool) take(d, Infinity); // last resort: a second point slip beats an unlabelled pad
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

/** A mental estimate: positive, terminating, at most three significant figures. */
function mental(x: Exact): boolean {
  if (!x.isRational() || x.sign() <= 0 || !isCleanExact(x).ok) return false;
  let d = x.toRat().d;
  while (d % 2n === 0n) d /= 2n;
  while (d % 5n === 0n) d /= 5n;
  if (d !== 1n) return false; // terminating decimal
  return x.toPlain(DEC).replace('.', '').replace(/^0+/, '').replace(/0+$/, '').length <= 3;
}

function pack(rng: RNG, stem: string, ans: Exact, ds: Distractor[], solution: string, trap: string, tags: string[], params: Record<string, unknown>, fmt: 'decimal' | 'sf' = 'decimal'): Generated | null {
  if (ds.length < 4) return null;
  return {
    stem,
    answer: { kind: 'exact' as const, value: ans, format: fmt },
    options: buildOptions(rng, ans, ds, fmt === 'sf' ? SF : DEC),
    solution,
    trap,
    tags,
    params,
    typedAllowed: true,
  };
}

const RULE = 'by rounding each number to 1 significant figure';
const dec = (x: Exact) => x.toLatex(DEC);
const times = ' \\times ';

// ---------------------------------------------------------------------------
// Level 1: products
// ---------------------------------------------------------------------------

function product(rng: RNG): Generated | null {
  const a = rawNum(rng, rng.int(2, 9), rng.pick([-1, 0, 0, 1]), rng.pick([2, 3]));
  const b = rawNum(rng, rng.int(2, 9), rng.pick([-1, 0, 1, 1, 2]), rng.pick([2, 2, 3]));
  const ans = sf(a.d * b.d, a.k + b.k);
  if (!mental(ans) || ans.toNumber() < 0.1 || ans.toNumber() > 100000) return null;
  const exactVal = exact(a).mul(exact(b));
  const must = cleanOnly([
    { value: round1(exactVal.toNumber()), trap: 'multiplied first and rounded the product afterwards' },
    { value: a.trunc.mul(b.trunc), trap: 'truncated each number instead of rounding it' },
  ]);
  const extra = cleanOnly([
    { value: ans.mulRat(10), trap: 'decimal point one place too far right' },
    { value: ans.mulRat(E(0.1).toRat()), trap: 'decimal point one place too far left' },
    { value: sf(a.d, a.k).mul(exact(b)), trap: 'rounded the first number only' },
    { value: exact(a).mul(sf(b.d, b.k)), trap: 'rounded the second number only' },
    { value: sf(a.d + b.d, a.k + b.k), trap: 'added the leading digits instead of multiplying' },
    // rounded to the neighbouring leading digit: same magnitude, and on both sides of the answer
    { value: sf((a.d + 1) * b.d, a.k + b.k), trap: `rounded ${a.str} up to ${dec(sf(a.d + 1, a.k))}` },
    { value: a.d > 1 ? sf((a.d - 1) * b.d, a.k + b.k) : null, trap: `rounded ${a.str} down to ${dec(sf(a.d - 1, a.k))}` },
    { value: sf(a.d * (b.d + 1), a.k + b.k), trap: `rounded ${b.str} up to ${dec(sf(b.d + 1, b.k))}` },
    { value: b.d > 1 ? sf(a.d * (b.d - 1), a.k + b.k) : null, trap: `rounded ${b.str} down to ${dec(sf(b.d - 1, b.k))}` },
  ]);
  return pack(rng, `Estimate the value of $${a.str}${times}${b.str}$ ${RULE}.`, ans, spread(rng, ans, must, extra),
    `$${a.str} \\approx ${dec(sf(a.d, a.k))}$ and $${b.str} \\approx ${dec(sf(b.d, b.k))}$, so the estimate is $${dec(sf(a.d, a.k))}${times}${dec(sf(b.d, b.k))} = ${dec(ans)}$.`,
    'Round each number to 1 s.f. before multiplying (5 × 20 = 100); rounding the exact product afterwards is a different, unasked-for number.',
    ['estimation', 'rounding', 'significant-figures'],
    { variant: 'product', nums: [a.str, b.str] },
  );
}

// ---------------------------------------------------------------------------
// Level 2: quotients
// ---------------------------------------------------------------------------

function quotient(rng: RNG): Generated | null {
  const three = rng.bool(0.6);
  const a = rawNum(rng, rng.int(1, 9), rng.pick([-2, -1, 0, 1]), rng.pick([2, 3]));
  const b = three ? rawNum(rng, rng.int(2, 9), rng.pick([-1, 0, 1, 2]), rng.pick([2, 3])) : null;
  const c = rawNum(rng, rng.pick([2, 4, 5, 8, 2, 5, 3, 6]), rng.pick([-2, -1, 0, 1]), rng.pick([2, 3]));
  const numMant = a.d * (b ? b.d : 1);
  const numExp = a.k + (b ? b.k : 0);
  const ans = sf(numMant, numExp).div(sf(c.d, c.k));
  if (!mental(ans) || ans.toNumber() < 0.01 || ans.toNumber() > 10000) return null;
  const q = numMant / c.d;
  if (!Number.isInteger(q * 2) && !Number.isInteger(q * 4)) return null; // 6 ÷ 4 = 1.5 is mental, 3 ÷ 8 is not
  const numTex = b ? `${a.str}${times}${b.str}` : a.str;
  const stemExpr = b ? `\\frac{${numTex}}{${c.str}}` : `${a.str} \\div ${c.str}`;
  const exactVal = exact(a).mul(b ? exact(b) : Exact.ONE).div(exact(c));
  const rounded = (n: Num) => dec(sf(n.d, n.k));
  // The same-magnitude mistakes lead; a decimal-point slip is allowed as one option, not as a ladder.
  const must = cleanOnly([
    { value: round1(exactVal.toNumber()), trap: 'calculated exactly and rounded at the end' },
    { value: a.trunc.mul(b ? b.trunc : Exact.ONE).div(c.trunc), trap: 'truncated each number instead of rounding it' },
  ]);
  const extra = cleanOnly([
    { value: sf(numMant, numExp).mul(sf(c.d, c.k)), trap: `multiplied by ${rounded(c)} instead of dividing` },
    { value: b ? sf(a.d, a.k).div(sf(b.d, b.k)).div(sf(c.d, c.k)) : sf(c.d, c.k).div(sf(a.d, a.k)), trap: b ? 'divided by both numbers' : 'divided the wrong way round' },
    { value: sf(c.d, c.k).div(sf(numMant, numExp)), trap: 'divided the wrong way round' },
    { value: exact(a).mul(b ? exact(b) : Exact.ONE).div(sf(c.d, c.k)), trap: 'rounded the denominator only' },
    { value: sf(numMant, numExp).div(exact(c)), trap: 'rounded the numerator only' },
    // rounded to the neighbouring leading digit: same magnitude, and on both sides of the answer
    { value: sf((a.d + 1) * (b ? b.d : 1), numExp).div(sf(c.d, c.k)), trap: `rounded ${a.str} up to ${dec(sf(a.d + 1, a.k))} instead of ${rounded(a)}` },
    { value: a.d > 1 ? sf((a.d - 1) * (b ? b.d : 1), numExp).div(sf(c.d, c.k)) : null, trap: `rounded ${a.str} down to ${dec(sf(a.d - 1, a.k))} instead of ${rounded(a)}` },
    { value: sf(numMant, numExp).div(sf(c.d + 1, c.k)), trap: `rounded ${c.str} up to ${dec(sf(c.d + 1, c.k))} instead of ${rounded(c)}` },
    { value: c.d > 1 ? sf(numMant, numExp).div(sf(c.d - 1, c.k)) : null, trap: `rounded ${c.str} down to ${dec(sf(c.d - 1, c.k))} instead of ${rounded(c)}` },
    { value: ans.mulRat(10), trap: 'decimal point one place too far right' },
    { value: ans.mulRat(E(0.1).toRat()), trap: 'decimal point one place too far left' },
    { value: ans.mulRat(100), trap: 'decimal point two places out' },
  ]);
  const work = b ? `\\frac{${rounded(a)}${times}${rounded(b)}}{${rounded(c)}} = \\frac{${dec(sf(numMant, numExp))}}{${rounded(c)}}` : `${rounded(a)} \\div ${rounded(c)}`;
  return pack(rng, `Estimate the value of $${stemExpr}$ ${RULE}.`, ans, spread(rng, ans, must, extra, { maxRatio: 30 }),
    `Rounding: $${work} = ${dec(ans)}$.`,
    'Keep track of the powers of ten when dividing by a decimal: 1 ÷ 0.5 = 2, not 0.2 or 20.',
    ['estimation', 'rounding', 'division'],
    { variant: 'quotient', num: b ? [a.str, b.str] : [a.str], den: [c.str] },
  );
}

// ---------------------------------------------------------------------------
// Level 3: roots and squares
// ---------------------------------------------------------------------------

function root(rng: RNG): Generated | null {
  const twoSf = rng.bool(0.4);
  // radicand rounds to m × 10^k with k even and m a perfect square: 1, 4, 9 (1 s.f.) or 16 … 81 (2 s.f.)
  const m = twoSf ? rng.pick([16, 25, 36, 49, 64, 81]) : rng.pick([1, 4, 9]);
  const k = rng.pick([-4, -2, 0, 2, 4].filter((e) => (twoSf ? e >= -4 && e <= 2 : true)));
  const off = rng.pick(twoSf ? [-4, -3, -2, 2, 3, 4] : (m === 1 ? [-3, -2, 2, 3, 5, 8, 12, 15] : [-28, -18, -15, -12, -8, -5, -3, 3, 5, 8, 12, 15, 18]));
  // raw = (m·100 + off·(twoSf ? 10 : 1)) × 10^(k−2)
  const M = 100 * m + off * (twoSf ? 10 : 1);
  const str = decStr(M, k - 2);
  const rounded = sf(m, k);
  const ans = sf(Math.sqrt(m), k / 2);
  if (ans.toNumber() < 0.001 || ans.toNumber() > 1000) return null;
  const exactRoot = Math.sqrt(Number(str));
  const must = cleanOnly([
    { value: rounded.mulRat(E(0.5).toRat()), trap: 'halved the number instead of square-rooting it' },
    { value: ans.mulRat(E(0.1).toRat()), trap: 'halved the number of decimal places wrongly: √0.04 is 0.2, not 0.02' },
  ]);
  const extra = cleanOnly([
    { value: ans.mulRat(10), trap: 'decimal point one place too far right' },
    { value: rounded.mul(rounded), trap: 'squared instead of square-rooting' },
    { value: round1(exactRoot), trap: 'used a calculator-style value and rounded at the end' },
    { value: sf(Math.sqrt(m), k), trap: 'forgot to halve the power of ten' },
    { value: sf(m, k / 2), trap: 'halved the power of ten but did not root the leading number' },
  ]);
  const rule = twoSf ? 'by rounding the number under the root to 2 significant figures' : 'by rounding the number under the root to 1 significant figure';
  return pack(rng, `Estimate the value of $\\sqrt{${str}}$ ${rule}.`, ans, spread(rng, ans, must, extra, { maxRatio: 30 }),
    `$${str} \\approx ${dec(rounded)} = ${m}${times}10^{${k}}$, so $\\sqrt{${str}} \\approx \\sqrt{${m}}${times}10^{${k / 2}} = ${dec(ans)}$.`,
    'Write the rounded number as (square) × (even power of ten) and halve the power: √0.04 = √(4 × 10⁻²) = 2 × 10⁻¹ = 0.2.',
    ['estimation', 'square-root', 'rounding'],
    { variant: 'root', radicand: str, sig: twoSf ? 2 : 1 },
  );
}

function squareProduct(rng: RNG): Generated | null {
  const a = rawNum(rng, rng.int(2, 9), rng.pick([-1, 0, 0, 1]), rng.pick([2, 3]));
  const b = rawNum(rng, rng.int(2, 9), rng.pick([-2, -1, 0, 1, 1, 2]), rng.pick([2, 3]));
  const divide = rng.bool(0.35);
  const sq = sf(a.d * a.d, 2 * a.k);
  const B = sf(b.d, b.k);
  const ans = divide ? sq.div(B) : sq.mul(B);
  if (!mental(ans) || ans.toNumber() < 0.01 || ans.toNumber() > 100000) return null;
  if (divide && !Number.isInteger((a.d * a.d) / b.d * 4)) return null;
  const exactVal = divide ? exact(a).mul(exact(a)).div(exact(b)) : exact(a).mul(exact(a)).mul(exact(b));
  const dbl = sf(2 * a.d, a.k);
  const A = sf(a.d, a.k);
  const must = cleanOnly([
    { value: divide ? dbl.div(B) : dbl.mul(B), trap: 'doubled instead of squaring' },
    { value: divide ? A.div(B) : A.mul(B), trap: 'forgot to square' },
  ]);
  const extra = cleanOnly([
    { value: round1(exactVal.toNumber()), trap: 'calculated exactly and rounded at the end' },
    { value: ans.mulRat(10), trap: 'decimal point one place too far right' },
    { value: ans.mulRat(E(0.1).toRat()), trap: 'decimal point one place too far left' },
    { value: divide ? sq.mul(B) : sq.div(B), trap: divide ? 'multiplied instead of dividing' : 'divided instead of multiplying' },
    { value: divide ? sq.div(B.mul(B)) : sq.mul(B).mul(B), trap: 'squared both numbers' },
  ]);
  const expr = divide ? `\\frac{${a.str}^2}{${b.str}}` : `${a.str}^2${times}${b.str}`;
  const work = divide ? `\\frac{${dec(A)}^2}{${dec(B)}} = \\frac{${dec(sq)}}{${dec(B)}}` : `${dec(A)}^2${times}${dec(B)} = ${dec(sq)}${times}${dec(B)}`;
  return pack(rng, `Estimate the value of $${expr}$ ${RULE}.`, ans, spread(rng, ans, must, extra, { maxRatio: 30 }),
    `Rounding: $${work} = ${dec(ans)}$.`,
    'Square the rounded number (3² = 9, not 6), then multiply or divide; keep the decimal point under control.',
    ['estimation', 'squares', 'rounding'],
    { variant: 'square', a: a.str, b: b.str, divide },
  );
}

// ---------------------------------------------------------------------------
// Level 4: orders of magnitude
// ---------------------------------------------------------------------------

interface Scenario { stem: string; num: number[]; den: number[]; unit: string }

function scenario(rng: RNG): Scenario {
  const choice = rng.int(0, 13);
  switch (choice) {
    case 0: return { stem: 'Estimate the number of seconds in a year (365 days).', num: [365, 24, 60, 60], den: [], unit: 'seconds' };
    case 1: return { stem: 'Estimate the number of seconds in a month of 30 days.', num: [30, 24, 60, 60], den: [], unit: 'seconds' };
    case 2: return { stem: 'Estimate the number of seconds in a century (100 years of 365 days).', num: [100, 365, 24, 60, 60], den: [], unit: 'seconds' };
    case 3: { const r = rng.pick([60, 70]); const y = rng.pick([70, 75, 80]); return { stem: `A human heart beats about ${r} times a minute. Estimate the number of times it beats in a lifetime of ${y} years (take a year as 365 days).`, num: [r, 60, 24, 365, y], den: [], unit: 'beats' }; }
    case 4: { const r = rng.pick([12, 15, 20]); return { stem: `A person breathes about ${r} times a minute. Estimate the number of breaths taken in a year (365 days).`, num: [r, 60, 24, 365], den: [], unit: 'breaths' }; }
    case 5: { const P = rng.pick([200, 300, 400]); const L = rng.pick([30, 40]); const W = rng.pick([10, 12]); return { stem: `A book has ${P} pages, with about ${L} lines per page and ${W} words per line. Estimate the number of words in the book.`, num: [P, L, W], den: [], unit: 'words' }; }
    case 6: { const s = rng.pick([5000, 7000, 8000]); return { stem: `A person walks about ${s} steps a day. Estimate the number of steps walked in ${80} years (take a year as 365 days).`, num: [s, 365, 80], den: [], unit: 'steps' }; }
    case 7: return { stem: 'A grain of rice has a mass of about 0.02 g. Estimate the number of grains in a 2 kg bag of rice.', num: [2000], den: [0.02], unit: 'grains' };
    case 8: { const l = rng.pick([2, 3]); return { stem: `The world population is about $8 \\times 10^{9}$. If each person drinks about ${l} litres of water a day, estimate the total volume of drinking water consumed worldwide in one day, in litres.`, num: [8e9, l], den: [], unit: 'litres' }; }
    case 9: return { stem: 'Light travels at $3 \\times 10^{8}$ m s$^{-1}$. Taking a year as $3 \\times 10^{7}$ s, estimate the distance, in metres, that light travels in a year.', num: [3e8, 3e7], den: [], unit: 'metres' };
    case 10: return { stem: 'A typical human cell has a mass of about $10^{-12}$ kg. Estimate the number of cells in a person of mass 70 kg.', num: [70], den: [1e-12], unit: 'cells' };
    case 11: { const a = rng.pick([500, 600]); const d = rng.pick([150, 200]); return { stem: `A scalp has an area of about ${a} cm² with about ${d} hairs per cm². Estimate the number of hairs on a head.`, num: [a, d], den: [], unit: 'hairs' }; }
    case 12: return { stem: 'An atom has a diameter of about $10^{-10}$ m. Estimate the number of atoms that would fit side by side along a line 1 cm long.', num: [0.01], den: [1e-10], unit: 'atoms' };
    default: { const L = rng.pick([50]); const W = rng.pick([20, 25]); const D = 2; return { stem: `A swimming pool is ${L} m long, ${W} m wide and ${D} m deep. Given that $1\\ \\text{m}^3 = 1000$ litres, estimate the volume of water in the pool in litres.`, num: [L, W, D, 1000], den: [], unit: 'litres' }; }
  }
}

/**
 * Nearest power of ten to x; null in the band 3.17 ≤ m < 5.5 where "nearest" on a linear scale (10^e up to
 * m = 5.5) and on a log scale (10^e up to m = √10 ≈ 3.16) disagree, so the question stays unambiguous.
 */
function nearestPower(x: number): number | null {
  const e = Math.floor(Math.log10(x) + 1e-12);
  const m = x / 10 ** e;
  if (m >= 3.17 && m < 5.5) return null;
  return m < 3.17 ? e : e + 1;
}

/** A factor for the solution line: 365, 0.02, or 8 \times 10^{9} for very large / small values. */
function numTex(v: number): string {
  if (v >= 1e5 || v < 0.001) {
    const [m, e] = v.toExponential(0).split('e');
    return `${m} \\times 10^{${Number(e)}}`;
  }
  return `${v}`;
}

function magnitude(rng: RNG): Generated | null {
  const sc = scenario(rng);
  const value = sc.num.reduce((p, v) => p * v, 1) / sc.den.reduce((p, v) => p * v, 1);
  const e = nearestPower(value);
  if (e === null) return null;
  const lo = e - rng.int(1, 3);
  const displays = [0, 1, 2, 3, 4].map((i) => `$10^{${lo + i}}$`);
  const correct = `$10^{${e}}$`;
  const [mStr, eStr] = value.toExponential(1).split('e');
  const calc = sc.num.map(numTex).join(times) + (sc.den.length ? ` \\div ${sc.den.map(numTex).join(' \\div ')}` : '');
  return {
    stem: `${sc.stem}\n\nWhich of the following is closest to the answer?`,
    answer: { kind: 'choice', value: correct },
    options: fixedOptions(displays, e - lo),
    solution: `$${calc} \\approx ${mStr}${times}10^{${Number(eStr)}}$ ${sc.unit}, so the nearest power of ten is $10^{${e}}$.`,
    trap: 'Round each factor to 1 s.f. and add the powers of ten; a missing factor of 60 or 1000 shifts the answer by one or more powers of ten.',
    tags: ['estimation', 'order-of-magnitude', 'powers-of-ten'],
    params: { variant: 'magnitude', num: sc.num, den: sc.den },
    typedAllowed: false,
  };
}

// ---------------------------------------------------------------------------
// Level 5: standard form
// ---------------------------------------------------------------------------

interface SfNum { mant: string; exp: number; d: number; M: number; trunc: number }

/** m × 10^e with m a 2–3 s.f. mantissa that rounds to d at 1 s.f. */
function sfNum(rng: RNG, d: number, exp: number): SfNum {
  const pool = (rng.bool(0.5) ? OFFSETS_2 : OFFSETS_3).filter((o) => (d > 1 ? true : o > 0)); // a mantissa must stay ≥ 1
  const M = 100 * d + rng.pick(pool);
  return { mant: decStr(M, -2), exp, d, M, trunc: M >= 100 ? Number(String(M)[0]) : 9 };
}

const sfTex = (n: SfNum) => `${n.mant}${times}10^{${n.exp}}`;
const br = (n: SfNum) => `(${sfTex(n)})`;
const sfValue = (n: SfNum) => Exact.decimal(n.mant).mul(p10(n.exp));

function sfExponent(x: Exact): number {
  return Math.floor(Math.log10(x.toNumber()) + 1e-9);
}

function standardForm(rng: RNG): Generated | null {
  const form = rng.pick(['sq-div', 'sq-div', 'mul-div', 'root-mul', 'sq-mul']);
  const keep = (ds: Cand[]) => cleanOnly(ds, 'sf');
  const A = sfNum(rng, rng.int(2, 9), rng.pick([-4, -3, -2, 2, 3, 4, 5]));
  const B = sfNum(rng, rng.pick([2, 4, 5, 8, 2, 5, 3]), rng.pick([-4, -3, -2, 2, 3, 4]));
  const C = sfNum(rng, rng.int(2, 9), rng.pick([-3, -2, 2, 3]));
  let ans: Exact;
  let expr: string;
  let work: string;
  let must: Distractor[];
  let extra: Distractor[];
  const a = sf(A.d, A.exp), b = sf(B.d, B.exp), c = sf(C.d, C.exp);
  const exactA = sfValue(A), exactB = sfValue(B), exactC = sfValue(C);
  const rounded = (n: SfNum) => `${n.d}${times}10^{${n.exp}}`;
  if (form === 'sq-div') {
    ans = a.mul(a).div(b);
    if (!Number.isInteger((A.d * A.d) / B.d * 4)) return null;
    expr = `\\frac{${br(A)}^2}{${sfTex(B)}}`;
    work = `\\frac{(${rounded(A)})^2}{${rounded(B)}} = \\frac{${A.d * A.d}${times}10^{${2 * A.exp}}}{${rounded(B)}}`;
    must = keep([
      { value: a.mul(a).mul(b), trap: 'added the exponents when dividing (sign of the exponent)' },
      { value: sf(A.d * A.d, A.exp).div(b), trap: 'squared the mantissa but not the power of ten' },
    ]);
    extra = keep([
      { value: sf(2 * A.d, 2 * A.exp).div(b), trap: 'doubled the mantissa instead of squaring it' },
      { value: ans.mulRat(10), trap: 'mantissa renormalised the wrong way (factor of 10)' },
      { value: ans.mulRat(E(0.1).toRat()), trap: 'mantissa renormalised the wrong way (factor of 10)' },
      { value: round1(exactA.mul(exactA).div(exactB).toNumber()), trap: 'calculated exactly and rounded at the end' },
      { value: sf(A.trunc * A.trunc, 2 * A.exp).div(sf(B.trunc, B.exp)), trap: 'truncated instead of rounding' },
    ]);
  } else if (form === 'mul-div') {
    ans = a.mul(c).div(b);
    if (!Number.isInteger((A.d * C.d) / B.d * 4)) return null;
    expr = `\\frac{${br(A)}${times}${br(C)}}{${sfTex(B)}}`;
    work = `\\frac{${rounded(A)}${times}${rounded(C)}}{${rounded(B)}} = \\frac{${A.d * C.d}${times}10^{${A.exp + C.exp}}}{${rounded(B)}}`;
    must = keep([
      { value: a.mul(c).mul(b), trap: 'added the exponents when dividing (sign of the exponent)' },
      { value: sf(A.d * C.d, A.exp * C.exp).div(b), trap: 'multiplied the exponents when multiplying' },
    ]);
    extra = keep([
      { value: ans.mulRat(10), trap: 'mantissa renormalised the wrong way (factor of 10)' },
      { value: ans.mulRat(E(0.1).toRat()), trap: 'mantissa renormalised the wrong way (factor of 10)' },
      { value: round1(exactA.mul(exactC).div(exactB).toNumber()), trap: 'calculated exactly and rounded at the end' },
      { value: a.div(c).div(b), trap: 'divided by both other numbers' },
      { value: sf(A.trunc * C.trunc, A.exp + C.exp).div(sf(B.trunc, B.exp)), trap: 'truncated instead of rounding' },
    ]);
  } else if (form === 'root-mul') {
    // √(m × 10^k) with m ∈ {1, 4, 9} and k even, times B
    const m = rng.pick([1, 4, 4, 9, 9]);
    const k = rng.pick([-6, -4, -2, 2, 4, 6]);
    const R = sfNum(rng, m, k);
    const r = sf(Math.sqrt(m), k / 2);
    ans = r.mul(b);
    expr = `\\sqrt{${sfTex(R)}}${times}${br(B)}`;
    work = `\\sqrt{${rounded(R)}}${times}${rounded(B)} = ${Math.sqrt(m)}${times}10^{${k / 2}}${times}${rounded(B)}`;
    must = keep([
      { value: sf(Math.sqrt(m), k).mul(b), trap: 'did not halve the power of ten under the root' },
      { value: sf(m / 2, k).mul(b), trap: 'halved instead of square-rooting' },
    ]);
    extra = keep([
      { value: ans.mulRat(10), trap: 'mantissa renormalised the wrong way (factor of 10)' },
      { value: ans.mulRat(E(0.1).toRat()), trap: 'mantissa renormalised the wrong way (factor of 10)' },
      { value: round1(Math.sqrt(sfValue(R).toNumber()) * exactB.toNumber()), trap: 'calculated exactly and rounded at the end' },
      { value: r.div(b), trap: 'divided instead of multiplying' },
      { value: sf(m, k / 2).mul(b), trap: 'halved the power of ten but did not root the leading number' },
    ]);
    if (!mental(ans)) return null;
    const answer = ans;
    const exp = sfExponent(answer);
    if (Math.abs(exp) < 2) return null;
    return pack(rng, `Estimate the value of $${expr}$ ${RULE}, giving your answer in standard form.`, answer, spread(rng, answer, must, extra, { maxRatio: 30 }),
      `Rounding: $${work} = ${answer.toLatex(SF)}$.`,
      'Under a square root, halve the power of ten (make it even first) and root the leading number; then multiply and renormalise the mantissa.',
      ['estimation', 'standard-form', 'square-root'],
      { variant: 'sf', form, nums: [[R.mant, R.exp], [B.mant, B.exp]] }, 'sf');
  } else {
    ans = a.mul(a).mul(b);
    expr = `${br(A)}^2${times}${br(B)}`;
    work = `(${rounded(A)})^2${times}${rounded(B)} = ${A.d * A.d}${times}10^{${2 * A.exp}}${times}${rounded(B)}`;
    must = keep([
      { value: sf(A.d * A.d, A.exp).mul(b), trap: 'squared the mantissa but not the power of ten' },
      { value: sf(2 * A.d, 2 * A.exp).mul(b), trap: 'doubled the mantissa instead of squaring it' },
    ]);
    extra = keep([
      { value: a.mul(a).div(b), trap: 'subtracted the exponents when multiplying (sign of the exponent)' },
      { value: ans.mulRat(10), trap: 'mantissa renormalised the wrong way (factor of 10)' },
      { value: ans.mulRat(E(0.1).toRat()), trap: 'mantissa renormalised the wrong way (factor of 10)' },
      { value: round1(exactA.mul(exactA).mul(exactB).toNumber()), trap: 'calculated exactly and rounded at the end' },
      { value: sf(A.trunc * A.trunc, 2 * A.exp).mul(sf(B.trunc, B.exp)), trap: 'truncated instead of rounding' },
    ]);
  }
  if (!mental(ans)) return null;
  const exp = sfExponent(ans);
  if (Math.abs(exp) < 2 || Math.abs(exp) > 12) return null;
  const nums = form === 'mul-div' ? [[A.mant, A.exp], [C.mant, C.exp], [B.mant, B.exp]] : [[A.mant, A.exp], [B.mant, B.exp]];
  return pack(rng, `Estimate the value of $${expr}$ ${RULE}, giving your answer in standard form.`, ans, spread(rng, ans, must, extra, { maxRatio: 30 }),
    `Rounding: $${work} = ${ans.toLatex(SF)}$.`,
    'Square both the mantissa and the power of ten; subtract exponents when dividing (dividing by 10⁻² multiplies by 100); then renormalise so the mantissa is between 1 and 10.',
    ['estimation', 'standard-form', 'indices'],
    { variant: 'sf', form, nums }, 'sf');
}

// ---------------------------------------------------------------------------

/** Independent 1 s.f. rounding for verify(). */
const r1 = (s: string) => Number(Number(s).toPrecision(1));

export default defineTemplate({
  id: 'm1.standard-form.estimation',
  module: 'M1',
  topic: 'standard-form',
  title: 'Estimation and orders of magnitude',
  levels: {
    1: 'products: 4.9 × 19.8 ≈ 5 × 20 = 100',
    2: 'quotients: (0.0498 × 19.7) / 0.51 ≈ 2',
    3: 'square roots and squares: √0.0398 ≈ 0.2, 3.1² × 19.8 ≈ 180',
    4: 'order of magnitude of a real quantity: seconds in a year ≈ 10^7 (choice of powers of ten)',
    5: 'standard form: (5.02 × 10^3)² / (2.1 × 10^-2) ≈ 1.25 × 10^9',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return pickVariant(rng, [product]);
        case 2: return pickVariant(rng, [quotient]);
        case 3: return pickVariant(rng, [root, squareProduct]);
        case 4: return pickVariant(rng, [magnitude]);
        default: return pickVariant(rng, [standardForm]);
      }
    });
  },
  verify(q) {
    const P = q.params as Record<string, unknown>;
    const variant = P.variant as string;
    const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b));
    if (variant === 'magnitude') {
      if (q.answer.kind !== 'choice') return false;
      const num = P.num as number[], den = P.den as number[];
      const value = num.reduce((p, v) => p * v, 1) / den.reduce((p, v) => p * v, 1);
      const m = /^\$10\^\{(-?\d+)\}\$$/.exec(q.answer.value);
      if (!m) return false;
      const e = Number(m[1]);
      // the chosen power must be nearer to the value than its neighbours
      return Math.abs(value - 10 ** e) < Math.abs(value - 10 ** (e + 1)) && Math.abs(value - 10 ** e) < Math.abs(value - 10 ** (e - 1));
    }
    if (q.answer.kind !== 'exact') return false;
    const got = q.answer.value.toNumber();
    if (variant === 'product') {
      const [a, b] = P.nums as string[];
      return close(got, r1(a) * r1(b));
    }
    if (variant === 'quotient') {
      const num = P.num as string[], den = P.den as string[];
      return close(got, num.reduce((p, s) => p * r1(s), 1) / den.reduce((p, s) => p * r1(s), 1));
    }
    if (variant === 'root') {
      const { radicand, sig } = P as { radicand: string; sig: number };
      return close(got, Math.sqrt(Number(Number(radicand).toPrecision(sig))));
    }
    if (variant === 'square') {
      const { a, b, divide } = P as { a: string; b: string; divide: boolean };
      return close(got, divide ? r1(a) ** 2 / r1(b) : r1(a) ** 2 * r1(b));
    }
    if (variant === 'sf') {
      const { form, nums } = P as { form: string; nums: [string, number][] };
      const v = nums.map(([m, e]) => r1(m) * 10 ** e);
      let expected: number;
      if (form === 'sq-div') expected = v[0] ** 2 / v[1];
      else if (form === 'mul-div') expected = (v[0] * v[1]) / v[2];
      else if (form === 'root-mul') expected = Math.sqrt(v[0]) * v[1];
      else expected = v[0] ** 2 * v[1];
      return close(got, expected);
    }
    return false;
  },
});
