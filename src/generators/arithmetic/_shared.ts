/**
 * Helpers shared by the mental-arithmetic templates. Not a template itself
 * (the registry ignores modules without a default export).
 */
import { Exact } from '../../core/exact';
import { isCleanExact } from '../../core/clean';
import type { Distractor } from '../../core/options';

/** Exact value of a JS number that is an integer or a short decimal, or null if it is not exam-clean. */
export function ex(x: number): Exact | null {
  if (!Number.isFinite(x)) return null;
  const r = Math.round(x * 1e6) / 1e6;
  try {
    const v = Exact.num(r);
    return isCleanExact(v).ok ? v : null;
  } catch {
    return null;
  }
}

/** Build a labelled distractor from a plain number; null when the value is unusable. */
export function d(value: number, trap: string, must = false): Distractor | null {
  const v = ex(value);
  return v ? { value: v, trap, must } : null;
}

/** Drop the nulls. */
export function keep(list: (Distractor | null)[]): Distractor[] {
  return list.filter((x): x is Distractor => x !== null);
}

/** Swap two adjacent digits of an integer (a classic transcription slip); null if impossible. */
export function swapDigits(n: number, rngPick: (max: number) => number): number | null {
  const s = String(Math.abs(Math.trunc(n)));
  if (s.length < 2) return null;
  const i = rngPick(s.length - 2);
  if (s[i] === s[i + 1]) return null;
  const chars = s.split('');
  [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
  const out = Number(chars.join(''));
  return Math.sign(n) * out;
}

/** LaTeX for a number: integers plain, decimals with a dot, negatives bracketed when used as an operand. */
export function tex(x: number, operand = false): string {
  const s = Number.isInteger(x) ? String(x) : String(Number(x.toFixed(6)));
  return operand && x < 0 ? `(${s})` : s;
}

/** Round away floating noise. */
export function tidy(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}
