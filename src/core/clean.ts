/**
 * The "clean number" rule: is this value one a real ESAT answer could be?
 *
 * The exam never expects ugly numbers. Templates must reject and regenerate
 * parameters that break this rule, and the test suite asserts it for every
 * generated answer and option.
 */
import { Exact, ratIsInt, babs, type Rat, type Term } from './exact';

export interface CleanVerdict {
  ok: boolean;
  reason?: string;
}

const SMALL_DENS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 18, 20, 21, 22, 24, 25, 27, 28, 30, 32, 36, 40, 42, 45, 48, 49, 50, 54, 56, 60, 63, 64, 72, 75, 80, 81, 90, 96, 100, 121, 125, 128, 144, 150, 160, 200, 225, 243, 250, 256, 300, 400, 500, 512, 600, 625, 729, 800, 1000, 1024]);

/** A denominator is clean if it is small and factorable, or a terminating-decimal denominator 2^a 5^b up to 10^12. */
export function isCleanDenominator(d: bigint): boolean {
  if (d <= 1024n && SMALL_DENS.has(Number(d))) return true;
  let x = d;
  while (x % 2n === 0n) x /= 2n;
  while (x % 5n === 0n) x /= 5n;
  return x === 1n && d <= 10n ** 12n;
}

/** Significant digits of an integer, ignoring trailing zeros. */
export function sigDigits(n: bigint): number {
  let s = babs(n).toString().replace(/0+$/, '');
  if (s === '') s = '0';
  return s.length;
}

export function isCleanRat(q: Rat, maxSig = 4): CleanVerdict {
  if (!isCleanDenominator(q.d)) return { ok: false, reason: `denominator ${q.d} not clean` };
  if (sigDigits(q.n) > maxSig) return { ok: false, reason: `numerator ${q.n} has too many significant digits` };
  // Guard against silly magnitudes (beyond 10^15 or below 10^-12)
  if (babs(q.n) > 10n ** 16n) return { ok: false, reason: 'magnitude too large' };
  if (!ratIsInt(q) && q.d > 1024n) {
    // decimal-like: numerator should be short
    if (sigDigits(q.n) > 3) return { ok: false, reason: 'too many decimal digits' };
  }
  return { ok: true };
}

export const CLEAN_RADICANDS = new Set([2, 3, 5, 6, 7, 10, 11, 13, 14, 15, 17, 19, 21, 22, 23, 26, 29, 30, 31, 33, 34, 35, 37, 38, 39, 41, 42, 43, 46, 47, 51, 53, 55, 57, 58, 59, 61, 62, 65, 66, 67, 69, 70, 71, 73, 74, 77, 78, 79, 82, 83, 85, 86, 87, 89, 91, 93, 94, 95, 97]);

function isCleanTerm(t: Term): CleanVerdict {
  if (t.r !== 1 && !CLEAN_RADICANDS.has(t.r)) return { ok: false, reason: `radicand ${t.r} too large` };
  if (t.k < -2 || t.k > 3) return { ok: false, reason: `pi power ${t.k}` };
  if (t.r !== 1 || t.k !== 0) {
    // Surd / pi coefficients should be simple fractions.
    if (t.c.d > 100n) return { ok: false, reason: `coefficient denominator ${t.c.d} too large for a surd/pi term` };
    if (sigDigits(t.c.n) > 3) return { ok: false, reason: `coefficient ${t.c.n} too large for a surd/pi term` };
    return { ok: true };
  }
  return isCleanRat(t.c);
}

/** Apply the clean-number rule to an exact value. */
export function isCleanExact(x: Exact): CleanVerdict {
  if (x.terms.length > 2) return { ok: false, reason: 'more than two terms' };
  for (const t of x.terms) {
    const v = isCleanTerm(t);
    if (!v.ok) return v;
  }
  if (x.terms.length === 2) {
    // two-term values: both parts should be small (e.g. 7 + 4√3, 2 + π/2)
    for (const t of x.terms) {
      if (sigDigits(t.c.n) > 3 || t.c.d > 100n) return { ok: false, reason: 'two-term value with a large part' };
    }
  }
  return { ok: true };
}
