import { defineTemplate, retry, type Level, type Generated } from '../../core/template';
import { E, Exact, ratToStandardForm } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import type { RNG } from '../../core/rng';

/**
 * Standard form arithmetic; every answer and option is displayed as m × 10^k.
 * Level 1: (3×10^4)×(2×10^3) with no carry, or write 45 000 / 0.0032 in standard form
 * Level 2: division (8×10^7)/(4×10^3), negative exponents allowed
 * Level 3: product (or quotient) whose mantissa needs renormalising ((4×10^5)×(5×10^3) = 2×10^9)
 * Level 4: add / subtract with different exponents (3×10^5 + 4×10^4 = 3.4×10^5)
 * Level 5: squares and square roots: (6×10^-3)^2/(3×10^-4), √(3.6×10^7) = 6×10^3
 *
 * Exam register: no power of ten in a stem, answer or option is 10^0 or 10^±1 (nobody writes 9 × 10^0
 * or asks for 60 ÷ 0.1 "in standard form"), and no mantissa of 1 appears in a stem. Every wrong option
 * is a named mistake; parameters that cannot supply four distinct ones are redrawn, never padded.
 */

const p10 = (k: number) => Exact.decimal(`1e${k}`);
/** m × 10^k exactly (m a short decimal or an Exact). */
const sf = (m: number | Exact, k: number) => (typeof m === 'number' ? E(m) : m).mul(p10(k));
const sfTex = (m: number | string, k: number) => `${m} \\times 10^{${k}}`;
const br = (m: number | string, k: number) => `(${sfTex(m, k)})`;
const dec = (x: Exact) => x.toLatex({ format: 'decimal' });

/** Exponent of x written in standard form, or null if it cannot be. */
function sfExp(x: Exact): number | null {
  if (!x.isRational() || x.isZero()) return null;
  const s = ratToStandardForm(x.toRat());
  return s ? s.exp : null;
}

/** Positive, clean, ≤ 4 significant figures, and with an exponent an exam would print (|k| ≥ 2). */
function displayable(x: Exact): boolean {
  if (!x.isRational() || x.isZero() || x.sign() < 0) return false;
  if (!isCleanExact(x).ok) return false;
  const e = sfExp(x);
  return e !== null && e >= -12 && e <= 14 && Math.abs(e) >= 2;
}

/**
 * Filter the candidate list down to the distractors an exam would print.
 *
 * Two candidates with the *same* trap text are one mistake wearing two hats: offering both spends two
 * of the four wrong slots on a single observation ("dropped one of the powers of ten" twice), so only
 * the first of each trap survives. Give two genuinely different slips two different labels.
 */
function keep(cands: { value: Exact | null; trap: string }[]): Distractor[] {
  const out: Distractor[] = [];
  const traps = new Set<string>();
  for (const c of cands) {
    if (!c.value || !displayable(c.value)) continue;
    if (out.some((d) => d.value.equals(c.value!))) continue;
    if (traps.has(c.trap)) continue;
    traps.add(c.trap);
    out.push({ value: c.value, trap: c.trap });
  }
  return out;
}

function tryE(f: () => Exact): Exact | null {
  try { return f(); } catch { return null; }
}

/** Exponents for stems: never 0 or ±1. */
function pickExp(rng: RNG, lo: number, hi: number): number {
  const pool: number[] = [];
  for (let k = lo; k <= hi; k++) if (Math.abs(k) >= 2) pool.push(k);
  return rng.pick(pool);
}

/**
 * Choose the four distractors with a random number of them below the answer.
 *
 * The mistakes here are exponent slips, and a list built from k ± 1 and k ± 2 is symmetric about the
 * answer: the answer would be the middle of the five options in more than half of all questions, and
 * never the largest or the smallest. Drawing how many fall below it first — headline traps first
 * within each side — makes its position worth nothing.
 */
function balance(rng: RNG, answer: Exact, pool: Distractor[], count: number): Distractor[] {
  const headsFirst = (ds: Distractor[]) => [...ds.filter((d) => d.must), ...ds.filter((d) => !d.must)];
  const below = headsFirst(pool.filter((d) => d.value.cmp(answer) < 0));
  const above = headsFirst(pool.filter((d) => d.value.cmp(answer) > 0));
  const lo = Math.max(0, count - above.length);
  const hi = Math.min(count, below.length);
  if (lo > hi) return pool.slice(0, count);
  const nBelow = rng.int(lo, hi);
  return [...below.slice(0, nBelow), ...above.slice(0, count - nBelow)];
}

function pack(rng: RNG, stem: string, ans: Exact, ds: Distractor[], solution: string, trap: string, tags: string[], params: Record<string, unknown>): Generated | null {
  if (!displayable(ans)) return null;
  const pool = ds.filter((d) => !d.value.equals(ans));
  if (pool.length < 4) return null; // never pad: redraw instead
  const chosen = balance(rng, ans, rng.shuffle(pool), 4);
  if (chosen.length < 4) return null;
  return {
    stem,
    answer: { kind: 'exact' as const, value: ans, format: 'sf' as const },
    options: buildOptions(rng, ans, chosen, { format: 'sf' }),
    solution,
    trap,
    tags,
    params,
    typedAllowed: true,
  };
}

const ansTex = (x: Exact) => x.toLatex({ format: 'sf' });
const IN_SF = 'giving your answer in standard form';

/** 45 000 → "45\,000", 0.00045 → "0.00045" (for the stem). */
function ordinary(digits: number, k: number): string {
  // value = digits × 10^(k - (len - 1)) where digits has len significant digits
  const s = String(digits);
  const shift = k - (s.length - 1); // power of ten multiplying the integer `digits`
  if (shift >= 0) {
    const full = s + '0'.repeat(shift);
    return full.length >= 5 ? full.replace(/\B(?=(\d{3})+(?!\d))/g, '\\,') : full;
  }
  const zeros = -shift - s.length; // zeros between the point and the first digit
  return zeros >= 0 ? `0.${'0'.repeat(zeros)}${s}` : `${s.slice(0, s.length + shift)}.${s.slice(s.length + shift)}`;
}

// ---------------------------------------------------------------------------
// Level 1: easy product, or convert an ordinary number
// ---------------------------------------------------------------------------
function convert(rng: RNG): Generated | null {
  const second = rng.bool(0.7) ? rng.int(1, 9) : 0;
  const first = second === 0 ? rng.int(2, 9) : rng.int(1, 9); // a bare power of ten is too trivial
  const digits = second === 0 ? first : first * 10 + second;
  const mant = second === 0 ? first : first + second / 10;
  const k = rng.bool(0.6) ? rng.int(2, 7) : -rng.int(2, 5);
  const ans = sf(mant, k);
  // The sign slip is only offered for a number below 1, where writing 3.2 x 10^{3} for 0.0032 is the
  // mistake the mark scheme records. A number in the millions with a negative exponent is discarded
  // on sight, and two such options would leave only two live distractors.
  const flip: { value: Exact | null; trap: string } = k < 0
    ? (rng.bool()
      ? { value: sf(mant, -k), trap: 'wrong sign on the exponent' }
      : { value: sf(mant, -k + 1), trap: 'wrong sign on the exponent and an off-by-one' })
    : { value: null, trap: '' };
  const ds = keep([
    { value: sf(mant, k + 1), trap: k > 0 ? 'counted the digits instead of the places the point moves' : 'counted the zeros after the point rather than the places the point moves' },
    { value: sf(mant, k - 1), trap: 'counted one place too few' },
    flip,
    { value: sf(mant, k + 2), trap: 'moved the decimal point two places too many' },
    { value: sf(mant, k - 2), trap: 'moved the decimal point two places too few' },
    { value: sf(mant, k + 3), trap: 'a whole group of three zeros counted twice' },
    { value: sf(mant, k - 3), trap: 'a whole group of three zeros missed' },
  ]);
  const num = ordinary(digits, k);
  const stem = `Write $${num}$ in standard form.`;
  const solution = `Move the decimal point ${Math.abs(k)} place${Math.abs(k) === 1 ? '' : 's'} to the ${k > 0 ? 'left' : 'right'} to get $${mant}$, so $${num} = ${ansTex(ans)}$. ${k > 0 ? 'Large numbers have positive exponents.' : 'Numbers less than 1 have negative exponents.'}`;
  return pack(rng, stem, ans, ds, solution,
    'The exponent counts how many places the decimal point moves, not how many digits or zeros there are; numbers below 1 need a negative exponent.',
    ['standard-form', 'convert'],
    { variant: 'convert', value: digits * 10 ** (k - (String(digits).length - 1)), digits, k },
  );
}

function easyProduct(rng: RNG): Generated | null {
  const a = rng.int(2, 4);
  const b = rng.int(2, Math.floor(9 / a));
  const m = rng.int(2, 4), n = rng.int(2, 6);
  if (m * n > 14) return null; // keep the "multiplied the exponents" trap displayable
  const ans = sf(a * b, m + n);
  const ds = keep([
    { value: sf(a * b, m * n), trap: 'multiplied the exponents instead of adding' },
    { value: sf(a + b, m + n), trap: 'added the mantissas' },
    { value: sf(a * b, Math.abs(m - n)), trap: 'subtracted the exponents' },
    { value: sf(a + b, m * n), trap: 'added the mantissas and multiplied the exponents' },
    { value: sf(a * b, m + n + 1), trap: 'added an extra 1 to the exponent' },
    { value: sf(a * b, m + n - 1), trap: 'lost 1 from the exponent' },
    { value: sf(a * b, Math.max(m, n)), trap: 'kept the larger power of ten instead of adding the exponents' },
  ]);
  const stem = `Find the value of $${br(a, m)} \\times ${br(b, n)}$, ${IN_SF}.`;
  const solution = `Multiply the mantissas and add the exponents: $${a} \\times ${b} = ${a * b}$ and $10^{${m}} \\times 10^{${n}} = 10^{${m + n}}$, so the answer is $${ansTex(ans)}$.`;
  return pack(rng, stem, ans, ds, solution,
    'Multiplying powers of ten adds the exponents; only the mantissas are multiplied.',
    ['standard-form', 'multiply', 'indices'],
    { variant: 'mul', a, m, b, n },
  );
}

// ---------------------------------------------------------------------------
// Level 2: division, negative exponents allowed
// ---------------------------------------------------------------------------
const DIV_PAIRS: [number, number][] = [[4, 2], [6, 2], [8, 2], [6, 3], [9, 3], [8, 4], [3, 2], [5, 2], [7, 2], [9, 2], [5, 4]];

function division(rng: RNG): Generated | null {
  const [a, b] = rng.pick(DIV_PAIRS);
  const m = pickExp(rng, -6, 9), n = pickExp(rng, -6, 9);
  if (Math.abs(m - n) < 2 || m - n > 12 || m - n < -9) return null;
  const q = E(a).div(E(b));
  const ans = sf(q, m - n);
  const ds = keep([
    { value: sf(q, m + n), trap: 'added the exponents instead of subtracting' },
    { value: sf(q, n - m), trap: 'subtracted the exponents the wrong way round' },
    { value: a - b !== a / b ? sf(a - b, m - n) : null, trap: 'subtracted the mantissas' },
    { value: sf(a * b, m - n), trap: 'multiplied the mantissas' },
    { value: sf(E(b).div(E(a)), m - n), trap: 'divided the mantissas the wrong way round' },
    { value: Number.isInteger(m / n) ? sf(q, m / n) : null, trap: 'divided the exponents' },
    { value: sf(q, m), trap: "kept the numerator's power of ten" },
    { value: sf(q, n), trap: "kept the denominator's power of ten" },
  ]);
  const stem = `Find the value of $\\dfrac{${sfTex(a, m)}}{${sfTex(b, n)}}$, ${IN_SF}.`;
  const nTex = n < 0 ? `(${n})` : `${n}`;
  const solution = `Divide the mantissas and subtract the exponents: $${a} \\div ${b} = ${dec(q)}$ and $10^{${m}} \\div 10^{${n}} = 10^{${m} - ${nTex}} = 10^{${m - n}}$, so the answer is $${ansTex(ans)}$.`;
  return pack(rng, stem, ans, ds, solution,
    'Dividing powers of ten subtracts the exponents (top minus bottom), taking care with negative signs.',
    ['standard-form', 'divide', 'indices', 'negative-exponent'],
    { variant: 'div', a, m, b, n },
  );
}

// ---------------------------------------------------------------------------
// Level 3: renormalisation needed
// ---------------------------------------------------------------------------
function renormProduct(rng: RNG): Generated | null {
  const a = rng.int(2, 9), b = rng.int(2, 9);
  if (a * b < 10) return null;
  const m = pickExp(rng, -5, 7), n = pickExp(rng, -5, 7);
  if (m + n >= -2 && m + n <= 0) return null; // the answer exponent m + n + 1 would be 0 or ±1
  const ab = a * b;
  const ans = sf(ab, m + n); // formats as (ab/10) × 10^(m+n+1)
  const ds = keep([
    { value: sf(ab / 10, m + n), trap: 'renormalised the mantissa but forgot to add 1 to the exponent' },
    { value: sf(ab / 10, m + n - 1), trap: 'adjusted the exponent the wrong way when renormalising' },
    { value: sf(ab, m + n + 1), trap: 'added 1 to the exponent without dividing the mantissa by 10' },
    { value: sf(ab, m + n + 2), trap: 'renormalised twice: the exponent went up by 2' },
    { value: sf(ab, m * n), trap: 'multiplied the exponents' },
    { value: sf(a + b, m + n), trap: 'added the mantissas' },
    { value: sf(ab, m - n), trap: 'subtracted the exponents' },
    { value: sf(ab, m), trap: 'dropped one of the powers of ten' },
    { value: sf(ab, n), trap: 'dropped one of the powers of ten' },
  ]);
  const stem = `Find the value of $${br(a, m)} \\times ${br(b, n)}$, ${IN_SF}.`;
  const solution = `$${a} \\times ${b} = ${ab}$ and $10^{${m}} \\times 10^{${n}} = 10^{${m + n}}$, giving $${sfTex(ab, m + n)}$. Renormalise: $${ab} = ${ab / 10} \\times 10$, so the answer is $${ansTex(ans)}$.`;
  return pack(rng, stem, ans, ds, solution,
    'When the mantissa product is 10 or more, divide it by 10 and add 1 to the exponent.',
    ['standard-form', 'multiply', 'renormalise'],
    { variant: 'mul', a, m, b, n },
  );
}

const SMALL_QUOTIENTS: [number, number][] = [[2, 4], [2, 5], [2, 8], [3, 4], [3, 5], [3, 6], [3, 8], [4, 5], [4, 8], [5, 8], [6, 8]];

function renormQuotient(rng: RNG): Generated | null {
  const [a, b] = rng.pick(SMALL_QUOTIENTS);
  const m = pickExp(rng, -5, 7), n = pickExp(rng, -5, 7);
  if (m - n >= 0 && m - n <= 2) return null; // the answer exponent m − n − 1 would be 0 or ±1
  if (m - n > 11 || m - n < -8) return null;
  const q = E(a).div(E(b)); // < 1
  const ans = sf(q, m - n); // formats as (10q) × 10^(m-n-1)
  const q10 = q.mulRat(10);
  const ds = keep([
    { value: sf(q10, m - n), trap: 'moved the decimal point in the mantissa but did not change the exponent' },
    { value: sf(q10, m - n + 1), trap: 'adjusted the exponent the wrong way when renormalising' },
    { value: sf(q, m + n), trap: 'added the exponents instead of subtracting' },
    { value: sf(E(b).div(E(a)), m - n), trap: 'divided the mantissas the wrong way round' },
    { value: sf(q, n - m), trap: 'subtracted the exponents the wrong way round' },
    { value: sf(q, m), trap: "kept the numerator's power of ten" },
    { value: sf(q, n), trap: "kept the denominator's power of ten" },
  ]);
  const stem = `Find the value of $\\dfrac{${sfTex(a, m)}}{${sfTex(b, n)}}$, ${IN_SF}.`;
  const solution = `$${a} \\div ${b} = ${dec(q)}$ and $10^{${m}} \\div 10^{${n}} = 10^{${m - n}}$, giving $${sfTex(dec(q), m - n)}$. Renormalise: $${dec(q)} = ${dec(q10)} \\times 10^{-1}$, so the answer is $${ansTex(ans)}$.`;
  return pack(rng, stem, ans, ds, solution,
    'When the mantissa quotient is below 1, multiply it by 10 and subtract 1 from the exponent.',
    ['standard-form', 'divide', 'renormalise'],
    { variant: 'div', a, m, b, n },
  );
}

// ---------------------------------------------------------------------------
// Level 4: add / subtract with different exponents
// ---------------------------------------------------------------------------
function addSub(rng: RNG): Generated | null {
  const a = rng.bool(0.75) ? rng.int(2, 9) : rng.pick([1.5, 2.5, 3.5, 4.5, 6.5, 7.5]);
  const b = rng.int(2, 9);
  if (a === b) return null; // keeps the "combined the mantissas" traps distinct
  const delta = rng.pick([1, 1, 2]);
  const m = pickExp(rng, -5, 8);
  const n = m - delta;
  if (Math.abs(n) < 2) return null;
  const plus = rng.bool();
  const A = sf(a, m), B = sf(b, n);
  const ans = plus ? A.add(B) : A.sub(B);
  if (ans.sign() <= 0) return null;
  const bShift = E(b).mul(p10(-delta)); // b × 10^-delta, the mantissa contribution of B
  const bShift2 = E(b).mul(p10(-delta - 1)); // lined up one place too far
  const comb = plus ? a + b : a - b;
  const ds = keep([
    { value: sf(comb, m), trap: 'combined the mantissas without matching the powers of ten' },
    { value: sf(comb, n), trap: 'combined the mantissas without matching the powers of ten (smaller exponent)' },
    { value: sf(comb, m + n), trap: 'combined the mantissas and added the exponents' },
    { value: sf(comb, m - n), trap: 'combined the mantissas and subtracted the exponents' },
    { value: sf(plus ? E(a).add(bShift) : E(a).sub(bShift), n), trap: 'right mantissa, but kept the smaller exponent' },
    { value: sf(plus ? E(a).sub(bShift) : E(a).add(bShift), m), trap: plus ? 'subtracted instead of adding' : 'added instead of subtracting' },
    { value: sf(plus ? E(a).add(E(b).mul(p10(delta))) : E(a).sub(E(b).mul(p10(delta))), m), trap: 'shifted the smaller term the wrong way' },
    { value: sf(plus ? E(a).add(bShift2) : E(a).sub(bShift2), m), trap: 'lined the smaller term up one place too far to the right' },
    { value: sf(E(a).mul(E(b)), m + n), trap: plus ? 'multiplied instead of adding' : 'multiplied instead of subtracting' },
  ]);
  const stem = `Find the value of $${sfTex(a, m)} ${plus ? '+' : '-'} ${sfTex(b, n)}$, ${IN_SF}.`;
  const bs = dec(bShift);
  const solution = `Write both with the same power of ten: $${sfTex(b, n)} = ${sfTex(bs, m)}$, so the ${plus ? 'sum' : 'difference'} is $(${a} ${plus ? '+' : '-'} ${bs}) \\times 10^{${m}} = ${ansTex(ans)}$.`;
  return pack(rng, stem, ans, ds, solution,
    'You can only add or subtract mantissas once both terms have the same power of ten; rewrite the smaller one first.',
    ['standard-form', plus ? 'add' : 'subtract'],
    { variant: 'addsub', a, m, b, n, plus },
  );
}

// ---------------------------------------------------------------------------
// Level 5: square roots and squares
// ---------------------------------------------------------------------------
function squareRoot(rng: RNG): Generated | null {
  // Two-digit squares (16…81) display with an odd exponent and need the rewrite 3.6 × 10^7 = 36 × 10^6;
  // three-digit squares (121, 144, 225, …) display as 1.21 × 10^even and need √1.21 = 1.1.
  const s = rng.weighted([4, 5, 6, 7, 8, 9, 11, 12, 15, 13, 14, 16, 25], [3, 3, 3, 3, 3, 3, 2, 2, 2, 1, 1, 1, 1]);
  const kA = pickExp(rng, -4, 5); // exponent of the answer
  const S = s * s;
  const len = String(S).length; // 2 or 3
  const k = len === 3 ? kA - 1 : kA; // answer = s × 10^k
  const M = S / 10 ** (len - 1); // displayed mantissa, e.g. 36 → 3.6, 144 → 1.44
  const Ex = 2 * k + (len - 1); // displayed exponent (odd for two-digit squares, even for three-digit)
  if (Ex < -9 || Ex > 12) return null;
  const ans = sf(s, k);
  // Working form: what the student square-roots after making the exponent even.
  const even = Ex % 2 === 0;
  const Mw = even ? M : S; // 1.44, or 36 after rewriting 3.6 × 10^7 as 36 × 10^6
  const Ew = even ? Ex : 2 * k; // its exponent
  const sw = even ? s / 10 : s; // √Mw
  const ds = keep([
    { value: sf(Mw / 2, kA), trap: 'halved the mantissa instead of square-rooting it' },
    { value: sf(sw, Ew), trap: even ? 'square-rooted the mantissa but left the power of ten alone' : `rewrote as $${Mw} \\times 10^{${Ew}}$ but forgot to halve the exponent` },
    { value: even ? null : sf(sw, Ex), trap: 'square-rooted the mantissa but left the power of ten alone' },
    { value: sf(sw, kA + 1), trap: even ? 'exponent off by one' : `halved ${Ex + 1} instead of rewriting with the even exponent ${Ew}` },
    { value: sf(sw, kA - 1), trap: 'exponent off by one' },
    { value: sf(Mw, kA), trap: 'halved the exponent but forgot to square-root the mantissa' },
    { value: sf(Mw / 2, Ew), trap: 'halved the mantissa and left the exponent alone' },
  ]);
  const stem = `Find $\\sqrt{${sfTex(M, Ex)}}$, ${IN_SF}.`;
  const solution = even
    ? `$\\sqrt{${M}} = ${sw}$ and $\\sqrt{10^{${Ex}}} = 10^{${kA}}$, so the answer is $${ansTex(ans)}$.`
    : `Rewrite with an even exponent: $${sfTex(M, Ex)} = ${S} \\times 10^{${Ew}}$, so $\\sqrt{${S} \\times 10^{${Ew}}} = ${s} \\times 10^{${k}}$.`;
  return pack(rng, stem, ans, ds, solution,
    'Make the exponent even first (√(3.6 × 10^7) = √(36 × 10^6)), then square-root the mantissa and halve the exponent.',
    ['standard-form', 'square-root', 'indices'],
    { variant: 'sqrt', M, Ex },
  );
}

function squareDivide(rng: RNG): Generated | null {
  const a = rng.int(2, 9), b = rng.int(2, 9);
  if (a === b) return null; // a²/a is a one-step cancel
  const a2 = a * a;
  if ((a2 * 10) % b !== 0) return null; // a²/b has at most one decimal place
  if (a2 / b === 1) return null;
  const m = pickExp(rng, -4, 5), n = pickExp(rng, -4, 5);
  const e = 2 * m - n;
  if (e < -9 || e > 12) return null;
  const q = E(a2).div(E(b));
  const ans = sf(q, e);
  const ds = keep([
    { value: sf(E(a).div(E(b)), e), trap: 'forgot to square the mantissa' },
    { value: sf(q, m - n), trap: 'forgot to double the exponent when squaring' },
    { value: sf(q, 2 * m + n), trap: 'added the exponents instead of subtracting' },
    { value: m * m - n !== e ? sf(q, m * m - n) : null, trap: 'squared the exponent instead of doubling it' },
    { value: sf(E(2 * a).div(E(b)), e), trap: 'doubled the mantissa instead of squaring it' },
    { value: tryE(() => sf(E(b).div(E(a2)), -e)), trap: 'divided the wrong way round' },
    { value: sf(q, 2 * m), trap: 'squared correctly but forgot to divide the powers of ten' },
    { value: sf(E(a2).div(E(b * b)), 2 * (m - n)), trap: 'squared the divisor as well' },
  ]);
  const stem = `Find the value of $\\dfrac{${br(a, m)}^2}{${sfTex(b, n)}}$, ${IN_SF}.`;
  const qs = dec(q);
  const raw = sfTex(qs, e);
  const solution = `Square first: $${br(a, m)}^2 = ${sfTex(a2, 2 * m)}$. Then divide: $${a2} \\div ${b} = ${qs}$ and $10^{${2 * m}} \\div 10^{${n}} = 10^{${e}}$, giving $${raw}$${raw !== ansTex(ans) ? ` $= ${ansTex(ans)}$ after renormalising` : ''}.`;
  return pack(rng, stem, ans, ds, solution,
    'Squaring squares the mantissa and doubles the exponent; then subtract the exponent of the divisor and renormalise if needed.',
    ['standard-form', 'square', 'divide', 'indices'],
    { variant: 'sqdiv', a, m, b, n },
  );
}

export default defineTemplate({
  id: 'm1.standard-form.arithmetic',
  module: 'M1',
  topic: 'standard-form',
  title: 'Standard form arithmetic',
  levels: {
    1: '(3×10^4)×(2×10^3) with no carry, or write 45 000 in standard form',
    2: 'division (8×10^7)/(4×10^3), negative exponents allowed',
    3: 'product needing renormalisation ((4×10^5)×(5×10^3) = 2×10^9), or a quotient below 1',
    4: 'add / subtract with different exponents (3×10^5 + 4×10^4 = 3.4×10^5)',
    5: 'squares and square roots: (6×10^-3)^2/(3×10^-4), √(3.6×10^7) = 6×10^3',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return rng.bool() ? convert(rng) : easyProduct(rng);
        case 2: return division(rng);
        case 3: return rng.bool(0.7) ? renormProduct(rng) : renormQuotient(rng);
        case 4: return addSub(rng);
        default: return rng.bool() ? squareRoot(rng) : squareDivide(rng);
      }
    });
  },
  verify(q) {
    // Floating-point evaluation straight from the raw parameters.
    if (q.answer.kind !== 'exact' || q.answer.format !== 'sf') return false;
    const P = q.params as Record<string, number | boolean | string>;
    const n = (k: string) => P[k] as number;
    let expected: number;
    switch (P.variant) {
      case 'convert': expected = n('value'); break;
      case 'mul': expected = n('a') * 10 ** n('m') * (n('b') * 10 ** n('n')); break;
      case 'div': expected = (n('a') * 10 ** n('m')) / (n('b') * 10 ** n('n')); break;
      case 'addsub': expected = n('a') * 10 ** n('m') + (P.plus ? 1 : -1) * n('b') * 10 ** n('n'); break;
      case 'sqrt': expected = Math.sqrt(n('M') * 10 ** n('Ex')); break;
      case 'sqdiv': expected = (n('a') * 10 ** n('m')) ** 2 / (n('b') * 10 ** n('n')); break;
      default: return false;
    }
    const got = q.answer.value.toNumber();
    if (!(Math.abs(got - expected) <= 1e-9 * Math.abs(expected))) return false;
    // structural: the displayed mantissa must be normalised, 1 ≤ m < 10, and the exponent one an exam would print
    const s = ratToStandardForm(q.answer.value.toRat());
    return s !== null && parseFloat(s.mantissa) >= 1 && parseFloat(s.mantissa) < 10 && Math.abs(s.exp) >= 2;
  },
});
