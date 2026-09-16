import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { gcd } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Fraction ↔ decimal ↔ percentage conversions.
 * Level 1: terminating decimals ↔ fractions with denominators 2, 4, 5, 8, 10, 20, 25 (0.375 = 3/8, 7/20 = 0.35)
 * Level 2: fractions → percentages (7/8 = 87.5%) and percentages → fractions (12.5% = 1/8)
 * Level 3: recognising sevenths, ninths, elevenths and twelfths: 0.4̇5̇ = 5/11 (exact), 2/9 = 0.2̇ (choice of decimals)
 * Level 4: recurring decimal → fraction by the 10x / 100x subtraction: 0.2̇7̇ = 3/11, 0.16̇ = 1/6
 * Level 5: ordering five close values given as fractions, decimals and percentages (choice), or a
 *          conversion chain: 0.03̇ = 1/30, 0.083̇ = 1/12, 0.4̇5̇ + 0.5̇4̇ = 1
 *
 * Every wrong option is a named mistake (recurring treated as terminating, ×100 forgotten, dots in the
 * wrong place, ninths/elevenths confused, 1/6 read as 1/16 …). Parameters that cannot supply four such
 * options are redrawn rather than padded.
 */

const FR = { format: 'fraction' as const };
const DEC = { format: 'decimal' as const };
const ft = (x: Exact) => x.toLatex(FR);
const dt = (x: Exact) => x.toLatex(DEC);
const fracTex = (p: number, q: number) => `\\frac{${p}}{${q}}`;

type Cand = { value: Exact | null; trap: string };

function cleanOnly(ds: Cand[]): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } => d.value !== null && Number.isFinite(d.value.toNumber()) && !d.value.isZero() && isCleanExact(d.value).ok);
}

/** `must` traps first (in order), then shuffled extras; distinct from each other and from the answer. */
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

/** Pick a sub-variant first, then retry its parameters, so rejection rates do not skew the mix. */
function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

function tryE(f: () => Exact): Exact | null {
  try { return f(); } catch { return null; }
}

/** Keep only values that terminate as decimals (for options displayed in decimal format). */
function terminating(ds: Distractor[]): Distractor[] {
  return ds.filter((d) => {
    let q = d.value.toRat().d;
    while (q % 2n === 0n) q /= 2n;
    while (q % 5n === 0n) q /= 5n;
    return q === 1n;
  });
}

const coprimeNumerators = (q: number) => Array.from({ length: q - 1 }, (_, i) => i + 1).filter((p) => gcd(p, q) === 1);

// ---------------------------------------------------------------------------
// Recurring decimals
// ---------------------------------------------------------------------------

interface Expansion { prefix: string; period: string }

/** Decimal expansion of a proper fraction p/q by long division: non-repeating digits and repeating block ('' if terminating). */
function expand(p: number, q: number): Expansion {
  const seen = new Map<number, number>();
  let r = p % q;
  let digits = '';
  while (r !== 0 && !seen.has(r)) {
    seen.set(r, digits.length);
    r *= 10;
    digits += Math.floor(r / q);
    r %= q;
  }
  if (r === 0) return { prefix: digits, period: '' };
  const start = seen.get(r)!;
  return { prefix: digits.slice(0, start), period: digits.slice(start) };
}

/** Dot notation for a recurring block: \dot{6}, \dot{4}\dot{5}, \dot{1}4285\dot{7}. */
function dots(period: string): string {
  if (period === '') return '';
  if (period.length === 1) return `\\dot{${period}}`;
  return `\\dot{${period[0]}}${period.slice(1, -1)}\\dot{${period[period.length - 1]}}`;
}

/** LaTeX: 0.375, 0.41\dot{6}, 0.\dot{4}\dot{5}. */
function recurTex(e: Expansion): string {
  return `0.${e.prefix}${dots(e.period)}`;
}

/** Floating-point value of a decimal given as prefix digits and a recurring block. */
function recurValue(e: Expansion): number {
  const a = e.prefix.length, b = e.period.length;
  let v = a === 0 ? 0 : Number(e.prefix) / 10 ** a;
  if (b > 0) v += Number(e.period) / ((10 ** b - 1) * 10 ** a);
  return v;
}

/** Exact value: (digits − prefix) / (10^a (10^b − 1)). */
function recurFrac(e: Expansion): Exact | null {
  const a = e.prefix.length, b = e.period.length;
  if (b === 0) return a === 0 ? Exact.ZERO : frac(Number(e.prefix), 10 ** a);
  return tryE(() => frac(Number(e.prefix + e.period) - (a === 0 ? 0 : Number(e.prefix)), 10 ** a * (10 ** b - 1)));
}

/** Parse "0.41\dot{6}" (with or without $) back into prefix / period. Used by verify() as an independent route. */
function parseRecur(tex: string): Expansion | null {
  const s = tex.replace(/\$/g, '').trim();
  if (!s.startsWith('0.')) return null;
  const toks: { d: string; dot: boolean }[] = [];
  let i = 2;
  while (i < s.length) {
    if (s.startsWith('\\dot{', i) && /\d/.test(s[i + 5] ?? '') && s[i + 6] === '}') { toks.push({ d: s[i + 5], dot: true }); i += 7; }
    else if (/\d/.test(s[i])) { toks.push({ d: s[i], dot: false }); i++; }
    else return null;
  }
  const dotIdx = toks.map((t, k) => (t.dot ? k : -1)).filter((k) => k >= 0);
  const digitsOf = (from: number, to: number) => toks.slice(from, to).map((t) => t.d).join('');
  if (dotIdx.length === 0) return { prefix: digitsOf(0, toks.length), period: '' };
  if (dotIdx.length === 1 && dotIdx[0] === toks.length - 1) return { prefix: digitsOf(0, toks.length - 1), period: toks[toks.length - 1].d };
  if (dotIdx.length === 2 && dotIdx[1] === toks.length - 1) return { prefix: digitsOf(0, dotIdx[0]), period: digitsOf(dotIdx[0], toks.length) };
  return null;
}

/** Three-decimal-place value for a solution line: 0.636… or 0.625. */
function approx(v: number): string {
  const s = v.toFixed(3);
  return Math.abs(Number(s) - v) < 1e-12 ? s.replace(/0+$/, '').replace(/\.$/, '') : `${s}\\ldots`;
}

// ---------------------------------------------------------------------------
// Level 1: terminating decimals ↔ fractions
// ---------------------------------------------------------------------------

const L1_DENS = [2, 4, 5, 8, 8, 10, 20, 20, 25, 25];

function decimalToFraction(rng: RNG): Generated | null {
  const q = rng.pick(L1_DENS);
  const p = rng.pick(coprimeNumerators(q));
  const ans = frac(p, q);
  const dec = dt(ans); // e.g. 0.375
  const digits = dec.split('.')[1];
  const k = digits.length;
  const must = cleanOnly([
    { value: k >= 2 ? frac(Number(digits), 10 ** (k - 1)) : null, trap: 'wrong power of ten: one decimal place too few in the denominator' },
  ]);
  const extra = cleanOnly([
    { value: frac(Number(digits), 10 ** (k + 1)), trap: 'wrong power of ten: one decimal place too many in the denominator' },
    { value: q > 2 ? frac(p, q - 1) : null, trap: `misremembered the denominator (${p}/${q - 1} instead of ${p}/${q})` },
    { value: frac(p, q + 1), trap: `misremembered the denominator (${p}/${q + 1} instead of ${p}/${q})` },
    { value: p > 1 ? frac(q, p) : null, trap: 'inverted the fraction' },
    { value: k >= 2 && Number(digits[0]) > 0 && Number(digits.slice(1)) > 0 ? frac(Number(digits[0]), Number(digits.slice(1))) : null, trap: 'read the decimal digits as numerator and denominator' },
    { value: frac(q - p, q), trap: 'found 1 minus the value' },
    { value: frac(p, 2 * q), trap: 'halved instead of cancelling' },
  ]);
  const ds = ranked(rng, ans, must, extra);
  if (ds.length < 4) return null;
  const known = q === 8 ? ` Or spot that $0.125 = \\tfrac18$, so $${dec} = ${p} \\times \\tfrac18$.` : '';
  return {
    stem: `Write $${dec}$ as a fraction in its lowest terms.`,
    answer: { kind: 'exact', value: ans, format: 'fraction' },
    options: buildOptions(rng, ans, ds, FR),
    solution: `$${dec} = \\frac{${digits}}{${10 ** k}}$, which cancels to $${ft(ans)}$.${known}`,
    trap: 'Count the decimal places: 0.375 is 375 thousandths, not 375 hundredths; then cancel fully.',
    tags: ['fractions', 'decimals', 'conversion'],
    params: { variant: 'dec2frac', p, q },
    typedAllowed: true,
  };
}

function fractionToDecimal(rng: RNG): Generated | null {
  const q = rng.pick(L1_DENS);
  const p = rng.pick(coprimeNumerators(q));
  const ans = frac(p, q);
  const must = cleanOnly([
    { value: ans.mulRat(10), trap: 'decimal point one place too far right' },
  ]);
  const extra = cleanOnly([
    { value: ans.mulRat(frac(1, 10).toRat()), trap: 'decimal point one place too far left' },
    { value: p < 10 && q < 10 ? Exact.decimal(`0.${p}${q}`) : null, trap: 'wrote the digits of the fraction after the decimal point' },
    { value: frac(q - p, q), trap: 'found 1 minus the value' },
    { value: frac(p + 1, q), trap: 'off by one in the numerator' },
    { value: p > 1 ? frac(p - 1, q) : null, trap: 'off by one in the numerator' },
    { value: p > 1 ? frac(q, p) : null, trap: 'inverted the fraction' },
    { value: frac(p, q === 20 ? 25 : q === 25 ? 20 : 2 * q), trap: 'used the wrong denominator' },
  ]);
  const ds = ranked(rng, ans, terminating(must), terminating(extra));
  if (ds.length < 4) return null;
  let route: string;
  if (q === 8) route = `$\\tfrac18 = 0.125$, so $${fracTex(p, q)} = ${p} \\times 0.125 = ${dt(ans)}$.`;
  else {
    const target = [10, 100, 1000].find((t) => t % q === 0)!;
    const m = target / q;
    route = m === 1 ? `$${fracTex(p, q)} = ${dt(ans)}$ directly.` : `Scale the denominator to a power of ten: $${fracTex(p, q)} = \\frac{${p * m}}{${target}} = ${dt(ans)}$.`;
  }
  return {
    stem: `Write $${fracTex(p, q)}$ as a decimal.`,
    answer: { kind: 'exact', value: ans, format: 'decimal' },
    options: buildOptions(rng, ans, ds, DEC),
    solution: route,
    trap: 'Scale the denominator to 10, 100 or 1000 (or use ⅛ = 0.125); the digits of p/q are not the digits of the decimal.',
    tags: ['fractions', 'decimals', 'conversion'],
    params: { variant: 'frac2dec', p, q },
    typedAllowed: true,
  };
}

// ---------------------------------------------------------------------------
// Level 2: fractions ↔ percentages
// ---------------------------------------------------------------------------

const L2_DENS = [4, 5, 8, 8, 16, 20, 20, 25, 25, 40, 50];

/** 12.5% = 125/1000: the percentage scaled to an integer over the matching power of ten. */
function pctOverPowerOfTen(pct: Exact): string {
  const d = Number(pct.toRat().d); // 1, 2 or 4
  const j = d === 1 ? 0 : d === 2 ? 1 : 2;
  return `\\frac{${pct.mulRat(10 ** j).toInt()}}{${100 * 10 ** j}}`;
}

function fractionToPercent(rng: RNG): Generated | null {
  const q = rng.pick(L2_DENS);
  const p = rng.pick(coprimeNumerators(q));
  const pct = frac(100 * p, q); // e.g. 87.5
  if (pct.toRat().d > 4n) return null;
  const must = cleanOnly([
    { value: frac(p, q), trap: 'forgot to multiply by 100 (gave the decimal)' },
  ]);
  const extra = cleanOnly([
    { value: pct.mulRat(frac(1, 10).toRat()), trap: 'decimal point slip: multiplied by 10 instead of 100' },
    { value: pct.mulRat(10), trap: 'decimal point slip: multiplied by 1000' },
    { value: E(100).sub(pct), trap: 'found the complementary percentage 100% − p%' },
    { value: tryE(() => frac(100 * p, q - 1)), trap: 'misremembered the denominator' },
    { value: frac(100 * p, q + 1), trap: 'misremembered the denominator' },
    { value: frac(100 * (p + 1), q), trap: 'off by one in the numerator' },
    { value: p > 1 ? frac(100 * (p - 1), q) : null, trap: 'off by one in the numerator' },
  ]);
  const ds = ranked(rng, pct, terminating(must), terminating(extra));
  if (ds.length < 4) return null;
  const unit = frac(100, q);
  return {
    stem: `Express $${fracTex(p, q)}$ as a percentage.`,
    answer: { kind: 'exact', value: pct, format: 'decimal' },
    options: buildOptions(rng, pct, ds, DEC),
    solution: `$\\tfrac{1}{${q}} = ${dt(unit)}\\%$, so $${fracTex(p, q)} = ${p} \\times ${dt(unit)}\\% = ${dt(pct)}\\%$.`,
    trap: 'A percentage is the decimal × 100: 7/8 = 0.875 = 87.5%, not 0.875% or 8.75%.',
    tags: ['fractions', 'percentages', 'conversion'],
    params: { variant: 'frac2pct', p, q },
    typedAllowed: true,
  };
}

function percentToFraction(rng: RNG): Generated | null {
  const q = rng.pick(L2_DENS);
  const p = rng.pick(coprimeNumerators(q));
  const pct = frac(100 * p, q);
  if (pct.toRat().d > 4n) return null;
  const ans = frac(p, q);
  const pctTex = dt(pct);
  const whole = Math.floor(pct.toNumber());
  const must = cleanOnly([
    { value: pct.mulRat(frac(1, 10).toRat()), trap: 'divided by 10 instead of 100' },
  ]);
  const extra = cleanOnly([
    { value: pct.mulRat(frac(1, 1000).toRat()), trap: 'divided by 1000 instead of 100' },
    { value: frac(p, 2 * q), trap: 'halved the fraction (12.5% read as 1/16)' },
    { value: !pct.isInteger() && whole > 0 ? frac(whole, 100) : null, trap: 'dropped the decimal part of the percentage' },
    { value: frac(q - p, q), trap: 'found the complementary fraction' },
    { value: tryE(() => frac(p, q - 1)), trap: 'misremembered the denominator' },
    { value: frac(p, q + 1), trap: 'misremembered the denominator' },
    { value: pct.isInteger() && whole >= 2 ? frac(1, whole) : null, trap: 'wrote p% as 1/p' },
  ]);
  const ds = ranked(rng, ans, must, extra);
  if (ds.length < 4) return null;
  return {
    stem: `Write $${pctTex}\\%$ as a fraction in its lowest terms.`,
    answer: { kind: 'exact', value: ans, format: 'fraction' },
    options: buildOptions(rng, ans, ds, FR),
    solution: `$${pctTex}\\% = ${pctOverPowerOfTen(pct)}$, which cancels to $${ft(ans)}$.${q === 8 ? ' (Remember $12.5\\% = \\tfrac18$.)' : ''}`,
    trap: 'Per cent means divided by 100 (not 10 or 1000); 12.5% is 1/8, not 1/16.',
    tags: ['fractions', 'percentages', 'conversion'],
    params: { variant: 'pct2frac', p, q },
    typedAllowed: true,
  };
}

// ---------------------------------------------------------------------------
// Level 3: sevenths, ninths, elevenths, twelfths
// ---------------------------------------------------------------------------

function pickL3(rng: RNG): { p: number; q: number } {
  const q = rng.weighted([7, 9, 11, 12], [1, 2, 3, 2]);
  return { p: rng.pick(coprimeNumerators(q)), q };
}

const FAMILY: Record<number, string> = {
  7: 'Sevenths cycle through the digits 142857: $\\tfrac17 = 0.\\dot{1}4285\\dot{7}$, $\\tfrac27 = 0.\\dot{2}8571\\dot{4}$, $\\tfrac37 = 0.\\dot{4}2857\\dot{1}$, and so on.',
  9: 'Ninths repeat a single digit: $\\tfrac{k}{9} = 0.\\dot{k}$.',
  11: 'Elevenths repeat a pair of digits that is a multiple of 9: $\\tfrac{k}{11} = 0.\\dot{a}\\dot{b}$ with $ab = 9k$.',
  12: 'Twelfths: $\\tfrac1{12} = 0.08\\dot{3}$ and $\\tfrac{5}{12} = 0.41\\dot{6}$; the quarter-multiples ($\\tfrac{3}{12}$, $\\tfrac{6}{12}$, $\\tfrac{9}{12}$) terminate.',
};

function recurringToFraction(rng: RNG): Generated | null {
  const { p, q } = pickL3(rng);
  const e = expand(p, q);
  const ans = frac(p, q);
  const tex = recurTex(e);
  const digits = e.prefix + e.period;
  const must = cleanOnly([
    { value: frac(Number(digits), 10 ** digits.length), trap: 'treated the recurring decimal as terminating' },
  ]);
  const extra = cleanOnly([
    { value: tryE(() => frac(p, q - 2)), trap: `confused ${q}ths with ${q - 2}ths` },
    { value: frac(p, q + 2), trap: `confused ${q}ths with ${q + 2}ths` },
    { value: frac(p, q + 1), trap: `confused ${q}ths with ${q + 1}ths` },
    { value: tryE(() => frac(p, q - 1)), trap: `confused ${q}ths with ${q - 1}ths` },
    { value: e.period.length >= 2 ? frac(Number(e.period[0]), 9) : null, trap: 'took only the first digit as recurring' },
    { value: e.prefix.length > 0 ? recurFrac({ prefix: '', period: e.period }) : null, trap: 'ignored the non-recurring digits' },
    { value: frac(p + 1, q), trap: 'off by one in the numerator' },
    { value: p > 1 ? frac(p - 1, q) : null, trap: 'off by one in the numerator' },
    { value: q === 12 ? frac(Number(digits.slice(0, 2)), 100) : null, trap: 'rounded to two decimal places and converted that' },
  ]);
  const ds = ranked(rng, ans, must, extra);
  if (ds.length < 4) return null;
  const stem = rng.bool(0.5) ? `Which fraction is equal to $${tex}$?` : `Write $${tex}$ as a fraction in its lowest terms.`;
  return {
    stem,
    answer: { kind: 'exact', value: ans, format: 'fraction' },
    options: buildOptions(rng, ans, ds, FR),
    solution: `${FAMILY[q]} So $${tex} = ${ft(ans)}$.`,
    trap: 'A recurring decimal is not the terminating one with the same digits: 0.4̇5̇ = 5/11, whereas 0.45 = 9/20.',
    tags: ['fractions', 'recurring-decimals', 'conversion'],
    params: { variant: 'recur2frac', p, q },
    typedAllowed: true,
  };
}

function fractionToRecurring(rng: RNG): Generated | null {
  const { p, q } = pickL3(rng);
  const e = expand(p, q);
  const correct = `$${recurTex(e)}$`;
  const target = p / q;
  const wrong: { display: string; trap: string }[] = [];
  const seen = new Set<string>([correct]);
  const add = (x: Expansion | null, trap: string, allowLong = false) => {
    if (!x || (x.prefix + x.period).length === 0 || (x.prefix + x.period).length > (allowLong ? 6 : 3)) return;
    const v = recurValue(x);
    if (Math.abs(v - target) < 1e-9 || v <= 0 || v >= 1) return;
    const d = `$${recurTex(x)}$`;
    if (seen.has(d)) return;
    seen.add(d);
    wrong.push({ display: d, trap });
  };
  const digits = e.prefix + e.period;
  // headline mistake: the terminating decimal with the same digits
  add({ prefix: digits.slice(0, Math.min(digits.length, 3)), period: '' }, 'treated the decimal as terminating');
  add({ prefix: digits.slice(0, 2), period: '' }, 'treated the decimal as terminating');
  type Other = { x: Expansion | null; trap: string; via?: [number, number] };
  const others: Other[] = [
    { x: null, trap: `confused ${q}ths with ${q - 2}ths`, via: [p, q - 2] },
    { x: null, trap: `confused ${q}ths with ${q + 2}ths`, via: [p, q + 2] },
    { x: null, trap: `confused ${q}ths with ${q + 1}ths`, via: [p, q + 1] },
    { x: null, trap: `confused ${q}ths with ${q - 1}ths`, via: [p, q - 1] },
    { x: null, trap: 'off by one in the numerator', via: [p + 1, q] },
    { x: null, trap: 'off by one in the numerator', via: [p - 1, q] },
  ];
  if (e.period.length >= 2) {
    others.push({ x: { prefix: e.prefix + e.period[0], period: e.period.slice(1) + e.period[0] }, trap: 'recurring dots in the wrong place' });
    others.push({ x: { prefix: e.prefix, period: e.period[0] }, trap: 'only the first digit made recurring' });
    others.push({ x: { prefix: e.prefix, period: e.period.split('').reverse().join('') }, trap: 'recurring digits in the wrong order' });
  }
  if (e.prefix.length >= 1) {
    others.push({ x: { prefix: e.prefix.slice(0, -1), period: e.prefix.slice(-1) + e.period.slice(0, -1) }, trap: 'recurring dots in the wrong place' });
    others.push({ x: { prefix: '', period: digits }, trap: 'made every digit recurring' });
  }
  for (const o of rng.shuffle(others)) {
    if (wrong.length >= 6) break;
    if (o.via) {
      const [pp, qq] = o.via;
      if (pp <= 0 || qq <= 1 || pp >= qq) continue;
      const g = gcd(pp, qq);
      add(expand(pp / g, qq / g), o.trap, qq / g === 7); // only sevenths may be six digits long
    } else add(o.x, o.trap);
  }
  if (wrong.length < 4) return null;
  return {
    stem: `Which of the following is equal to $${fracTex(p, q)}$?`,
    answer: { kind: 'choice', value: correct },
    options: buildChoiceOptions(rng, correct, wrong),
    solution: `${FAMILY[q]} So $${fracTex(p, q)} = ${recurTex(e)}$.`,
    trap: 'Know the recurring families: ninths repeat one digit, elevenths repeat a multiple of 9, twelfths have a non-recurring digit or two before a 3 or 6.',
    tags: ['fractions', 'recurring-decimals', 'conversion'],
    params: { variant: 'frac2recur', p, q },
    typedAllowed: false,
  };
}

// ---------------------------------------------------------------------------
// Level 4: recurring → fraction by algebra
// ---------------------------------------------------------------------------

interface Pool { p: number; q: number; e: Expansion }

function buildPool(dens: number[], maxP: number, keep: (e: Expansion) => boolean): Pool[] {
  const out: Pool[] = [];
  for (const q of dens) {
    for (const p of coprimeNumerators(q).filter((n) => n <= maxP)) {
      const e = expand(p, q);
      if (e.period !== '' && keep(e)) out.push({ p, q, e });
    }
  }
  return out;
}

const L4_POOL = buildPool([6, 11, 15, 18, 22, 30, 45, 90], 19, (e) => e.prefix.length <= 1 && !e.prefix.startsWith('0') && e.period.length <= 2 && (e.prefix + e.period).length >= 2);
const L5_LONG_POOL = buildPool([12, 27, 30, 36, 45, 60, 75, 90, 150], 13, (e) => (e.prefix + e.period).length <= 4 && e.period.length <= 3 && (e.prefix.startsWith('0') || e.prefix.length === 2 || e.period.length === 3));

/** x × 10^k written with its dots, for x = 0.prefix(period). */
function shifted(e: Expansion, k: number): string {
  const a = e.prefix.length, b = e.period.length;
  const all = e.prefix + e.period.repeat(Math.ceil((k + 1) / b) + 1);
  const intPart = all.slice(0, k).replace(/^0+/, '') || '0';
  if (k <= a) return `${intPart}.${e.prefix.slice(k)}${dots(e.period)}`;
  const s = (k - a) % b;
  return `${intPart}.${dots(e.period.slice(s) + e.period.slice(0, s))}`;
}

function algebraSolution(e: Expansion, ans: Exact): string {
  const a = e.prefix.length, b = e.period.length;
  const tex = recurTex(e);
  const big = 10 ** (a + b);
  const small = 10 ** a;
  const num = Number(e.prefix + e.period) - (a === 0 ? 0 : Number(e.prefix));
  const den = big - small;
  const reduced = gcd(num, den) === 1 ? '' : ` = ${ft(ans)}`;
  if (a === 0) {
    return `Let $x = ${tex}$. Then $${big}x = ${shifted(e, b)}$; subtracting, $${den}x = ${num}$, so $x = \\frac{${num}}{${den}}${reduced}$.`;
  }
  return `Let $x = ${tex}$. Then $${small}x = ${shifted(e, a)}$ and $${big}x = ${shifted(e, a + b)}$; subtracting, $${den}x = ${num}$, so $x = \\frac{${num}}{${den}}${reduced}$.`;
}

function recurringDistractors(p: number, q: number, e: Expansion): { must: Distractor[]; extra: Distractor[] } {
  const digits = e.prefix + e.period;
  const a = e.prefix.length, b = e.period.length;
  const must = cleanOnly([
    { value: frac(Number(digits), 10 ** digits.length), trap: 'treated the recurring decimal as terminating' },
  ]);
  const extra = cleanOnly([
    { value: a > 0 ? frac(Number(digits), 10 ** a * (10 ** b - 1)) : null, trap: 'forgot to subtract the non-recurring part: put all the digits over the 9s and 0s' },
    { value: b >= 2 ? recurFrac({ prefix: e.prefix + e.period[0], period: e.period.slice(1) }) : null, trap: 'only the last digit taken as recurring' },
    { value: a > 0 ? recurFrac({ prefix: '', period: digits }) : null, trap: 'made every digit recurring' },
    { value: a > 0 ? recurFrac({ prefix: '', period: e.period }) : null, trap: 'ignored the non-recurring digits' },
    { value: digits.length === 2 && Number(digits) > 1 ? frac(1, Number(digits)) : null, trap: `read the digits ${digits} as a denominator (1/${digits})` },
    { value: tryE(() => frac(p, q - 2)), trap: `confused ${q}ths with ${q - 2}ths` },
    { value: frac(p, q + 2), trap: `confused ${q}ths with ${q + 2}ths` },
    { value: frac(p + 1, q), trap: 'off by one in the numerator' },
    { value: p > 1 ? frac(p - 1, q) : null, trap: 'off by one in the numerator' },
    { value: frac(p, 10 * q), trap: 'decimal point slip (a factor of 10)' },
    { value: 10 * p < q ? frac(10 * p, q) : null, trap: 'decimal point slip (a factor of 10)' },
  ]);
  return { must, extra };
}

function recurringAlgebra(rng: RNG, pool: Pool[], level: number): Generated | null {
  const { p, q, e } = rng.pick(pool);
  const ans = frac(p, q);
  if (!isCleanExact(ans).ok) return null;
  const tex = recurTex(e);
  const { must, extra } = recurringDistractors(p, q, e);
  const ds = ranked(rng, ans, must, extra);
  if (ds.length < 4) return null;
  const stem = rng.bool(0.5) ? `Write $${tex}$ as a fraction in its lowest terms.` : `Express the recurring decimal $${tex}$ as a fraction in its lowest terms.`;
  return {
    stem,
    answer: { kind: 'exact', value: ans, format: 'fraction' },
    options: buildOptions(rng, ans, ds, FR),
    solution: algebraSolution(e, ans),
    trap: 'Multiply by 10 for each non-recurring digit and by a further 10 per recurring digit, then subtract: the denominator is 9s followed by 0s, and the numerator is the digits minus the non-recurring part.',
    tags: ['fractions', 'recurring-decimals', 'algebra'],
    params: { variant: 'recur2frac', p, q, level },
    typedAllowed: true,
  };
}

// ---------------------------------------------------------------------------
// Level 5: ordering, and conversion chains
// ---------------------------------------------------------------------------

type Item = { kind: 'frac'; n: number; d: number } | { kind: 'dec'; s: string } | { kind: 'pct'; s: string };

function itemValue(it: Item): number {
  return it.kind === 'frac' ? it.n / it.d : it.kind === 'dec' ? Number(it.s) : Number(it.s) / 100;
}

function itemTex(it: Item): string {
  return it.kind === 'frac' ? `$${fracTex(it.n, it.d)}$` : it.kind === 'dec' ? `$${it.s}$` : `$${it.s}\\%$`;
}

function ordering(rng: RNG): Generated | null {
  const c = rng.int(15, 85) / 100;
  const fracs: Item[] = [];
  for (const d of [3, 6, 7, 8, 9, 11, 12, 16]) {
    for (const n of coprimeNumerators(d)) if (Math.abs(n / d - c) <= 0.03) fracs.push({ kind: 'frac', n, d });
  }
  const counts = rng.pick([[2, 1, 2], [2, 2, 1], [3, 1, 1]]);
  if (fracs.length < counts[0]) return null;
  const hundredths = Math.round(c * 100);
  const decs: Item[] = [-3, -2, -1, 0, 1, 2, 3].map((k) => ({ kind: 'dec', s: ((hundredths + k) / 100).toFixed(2).replace(/0$/, '') }));
  const pcts: Item[] = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map((k) => {
    const v = 2 * hundredths + k; // in half-percents
    return { kind: 'pct', s: v % 2 === 0 ? `${v / 2}` : (v / 2).toFixed(1) };
  });
  const items = [...rng.pickDistinct(fracs, counts[0]), ...rng.pickDistinct(decs, counts[1]), ...rng.pickDistinct(pcts, counts[2])];
  const vals = items.map(itemValue);
  // distinct, with gaps a candidate can resolve at three decimal places
  const sorted = vals.slice().sort((x, y) => x - y);
  for (let i = 1; i < sorted.length; i++) if (sorted[i] - sorted[i - 1] < 0.003) return null;
  const ask = rng.bool() ? 'largest' : 'smallest';
  const extreme = ask === 'largest' ? sorted[sorted.length - 1] : sorted[0];
  const runnerUp = ask === 'largest' ? sorted[sorted.length - 2] : sorted[1];
  if (Math.abs(extreme - runnerUp) > 0.03) return null; // the extreme would stand out without any conversion
  const idx = vals.indexOf(extreme);
  if (items[idx].kind === 'dec' && !rng.bool(0.2)) return null; // the answer should usually need a conversion
  const correct = itemTex(items[idx]);
  const wrong = items.filter((_, i) => i !== idx).map(itemTex);
  const order = items.map((_, i) => i).sort((i, j) => (ask === 'largest' ? vals[j] - vals[i] : vals[i] - vals[j]));
  const lines = order.map((i) => `${itemTex(items[i])} $= ${approx(vals[i])}$`).join(', ');
  return {
    stem: `Which of the following is the ${ask}?`,
    answer: { kind: 'choice', value: correct },
    options: buildChoiceOptions(rng, correct, wrong),
    solution: `Convert everything to decimals: ${lines}. The ${ask} is ${correct}.`,
    trap: 'Convert all five to three-decimal-place decimals before comparing; 7/11 ≈ 0.636 beats 63% and 5/8 = 0.625.',
    tags: ['fractions', 'decimals', 'percentages', 'ordering'],
    params: { variant: 'order', ask, items },
    typedAllowed: false,
  };
}

function longRecurring(rng: RNG): Generated | null {
  return recurringAlgebra(rng, L5_LONG_POOL, 5);
}

/** Recurring decimals a candidate converts on sight: ninths, elevenths, sixths, twelfths, 0.1̇3̇-style eighteenths and thirtieths. */
const CHAIN_POOL = buildPool([6, 9, 11, 12, 15, 18, 30], 11, (e) => (e.prefix + e.period).length <= 3 && e.period.length <= 2);

function chain(rng: RNG): Generated | null {
  const A = rng.pick(CHAIN_POOL);
  const B = rng.pick(CHAIN_POOL);
  if (A.p * B.q === B.p * A.q) return null;
  const op = rng.bool(0.6) ? '+' : '-';
  const [x, y] = op === '-' && A.p / A.q < B.p / B.q ? [B, A] : [A, B];
  const fx = frac(x.p, x.q), fy = frac(y.p, y.q);
  const ans = op === '+' ? fx.add(fy) : fx.sub(fy);
  if (ans.isZero() || !isCleanExact(ans).ok || ans.toRat().d > 45n) return null;
  const tx = recurTex(x.e), ty = recurTex(y.e);
  const dx = x.e.prefix + x.e.period, dy = y.e.prefix + y.e.period;
  const termX = frac(Number(dx), 10 ** dx.length), termY = frac(Number(dy), 10 ** dy.length);
  const pureX = recurFrac({ prefix: '', period: x.e.period }), pureY = recurFrac({ prefix: '', period: y.e.period });
  const must = cleanOnly([
    { value: op === '+' ? termX.add(termY) : termX.sub(termY), trap: 'treated both recurring decimals as terminating' },
  ]);
  const extra = cleanOnly([
    { value: op === '+' ? fx.sub(fy) : fx.add(fy), trap: op === '+' ? 'subtracted instead of adding' : 'added instead of subtracting' },
    { value: frac(x.p + y.p, x.q + y.q), trap: 'added numerators and denominators' },
    { value: fx.mul(fy), trap: 'multiplied the fractions' },
    { value: ans.mulRat(frac(1, 10).toRat()), trap: 'decimal point slip' },
    { value: pureX && pureY ? (op === '+' ? pureX.add(pureY) : pureX.sub(pureY)) : null, trap: 'ignored the non-recurring digits' },
    { value: ans.add(frac(1, Number(ans.toRat().d) > 1 ? Number(ans.toRat().d) : 9)), trap: 'arithmetic slip in the numerator' },
  ]);
  const positive = (ds: Distractor[]) => ds.filter((d) => d.value.sign() > 0);
  const ds = ranked(rng, ans, positive(must), positive(extra));
  if (ds.length < 4) return null;
  return {
    stem: `Find the value of $${tx} ${op} ${ty}$, giving your answer as a fraction in its lowest terms.`,
    answer: { kind: 'exact', value: ans, format: 'fraction' },
    options: buildOptions(rng, ans, ds, FR),
    solution: `$${tx} = ${ft(fx)}$ and $${ty} = ${ft(fy)}$, so the value is $${ft(fx)} ${op} ${ft(fy)} = ${ft(ans)}$.`,
    trap: 'Convert each recurring decimal to a fraction first (9s in the denominator); the decimals cannot simply be added digit by digit.',
    tags: ['fractions', 'recurring-decimals', 'arithmetic'],
    params: { variant: 'chain', op, x: [x.p, x.q], y: [y.p, y.q] },
    typedAllowed: true,
  };
}

// ---------------------------------------------------------------------------

export default defineTemplate({
  id: 'm1.fractions.conversions',
  module: 'M1',
  topic: 'fractions',
  title: 'Fraction, decimal & percentage conversions',
  levels: {
    1: 'terminating decimals ↔ fractions with denominators 2, 4, 5, 8, 10, 20, 25',
    2: 'fractions ↔ percentages: 7/8 = 87.5%, 12.5% = 1/8',
    3: 'recognise sevenths, ninths, elevenths, twelfths: 0.4̇5̇ = 5/11, 2/9 = 0.2̇',
    4: 'recurring decimal → fraction by algebra: 0.2̇7̇ = 3/11, 0.16̇ = 1/6',
    5: 'order five close values (fractions, decimals, percentages), or 0.03̇ = 1/30 and sums of recurring decimals',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return pickVariant(rng, [decimalToFraction, fractionToDecimal]);
        case 2: return pickVariant(rng, [fractionToPercent, percentToFraction]);
        case 3: return pickVariant(rng, [recurringToFraction, fractionToRecurring]);
        case 4: return pickVariant(rng, [(r) => recurringAlgebra(r, L4_POOL, 4)]);
        default: return pickVariant(rng, [ordering, longRecurring, chain]);
      }
    });
  },
  verify(q) {
    const P = q.params as Record<string, unknown>;
    const variant = P.variant as string;
    const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
    if (variant === 'order') {
      if (q.answer.kind !== 'choice') return false;
      const items = P.items as Item[];
      const ask = P.ask as string;
      const vals = items.map((it) => (it.kind === 'frac' ? it.n / it.d : it.kind === 'dec' ? parseFloat(it.s) : parseFloat(it.s) / 100));
      let best = 0;
      for (let i = 1; i < vals.length; i++) if (ask === 'largest' ? vals[i] > vals[best] : vals[i] < vals[best]) best = i;
      const it = items[best];
      const expected = it.kind === 'frac' ? `$\\frac{${it.n}}{${it.d}}$` : it.kind === 'dec' ? `$${it.s}$` : `$${it.s}\\%$`;
      return q.answer.value === expected && vals.filter((v) => v === vals[best]).length === 1;
    }
    if (variant === 'frac2recur') {
      if (q.answer.kind !== 'choice') return false;
      const { p, q: den } = P as { p: number; q: number };
      const e = parseRecur(q.answer.value);
      if (!e) return false;
      // value of the dotted decimal computed from its digits, compared with p/q
      const a = e.prefix.length, b = e.period.length;
      const v = (a ? Number(e.prefix) / 10 ** a : 0) + (b ? Number(e.period) / ((10 ** b - 1) * 10 ** a) : 0);
      return b > 0 && close(v, p / den);
    }
    if (q.answer.kind !== 'exact') return false;
    const got = q.answer.value.toNumber();
    if (variant === 'chain') {
      const { x, y, op } = P as { x: [number, number]; y: [number, number]; op: string };
      const v = op === '+' ? x[0] / x[1] + y[0] / y[1] : x[0] / x[1] - y[0] / y[1];
      return close(got, v);
    }
    const { p, q: den } = P as { p: number; q: number };
    if (variant === 'frac2pct') return close(got, (100 * p) / den);
    if (variant === 'frac2dec') return close(got, p / den);
    // fraction answers: right value and in lowest terms
    const r = q.answer.value.toRat();
    const g = gcd(p, den);
    return close(got, p / den) && Number(r.n) === p / g && Number(r.d) === den / g;
  },
});
