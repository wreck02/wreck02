/**
 * Small number-theory and formatting helpers shared by generators.
 */
import { Exact } from './exact';
import type { RNG } from './rng';

export function gcd(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b;
}

export function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let p = 2; p * p <= n; p++) if (n % p === 0) return false;
  return true;
}

export const PRIMES_TO_100 = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];

export function isPerfectSquare(n: number): boolean {
  if (n < 0) return false;
  const r = Math.round(Math.sqrt(n));
  return r * r === n;
}

export function isPerfectCube(n: number): boolean {
  const r = Math.round(Math.cbrt(n));
  return r * r * r === n;
}

export function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

export function nCr(n: number, r: number): number {
  if (r < 0 || r > n) return 0;
  r = Math.min(r, n - r);
  let num = 1, den = 1;
  for (let i = 1; i <= r; i++) { num *= n - r + i; den *= i; }
  return Math.round(num / den);
}

/** Random non-zero integer in [-m, m]. */
export function nz(rng: RNG, m: number): number {
  return rng.nonZeroInt(-m, m);
}

/** Pythagorean triples with small sides (a, b, c). */
export const TRIPLES: [number, number, number][] = [
  [3, 4, 5], [6, 8, 10], [5, 12, 13], [9, 12, 15], [8, 15, 17], [12, 16, 20], [7, 24, 25], [15, 20, 25], [10, 24, 26], [20, 21, 29],
];

/** Sign-aware coefficient string: "+ 3x", "- x", "" for zero. `first` drops the leading plus. */
export function signed(coef: number, sym = '', first = false): string {
  if (coef === 0) return '';
  const a = Math.abs(coef);
  const mag = a === 1 && sym ? '' : `${a}`;
  const sign = coef < 0 ? '-' : '+';
  if (first) return `${coef < 0 ? '-' : ''}${mag}${sym}`;
  return ` ${sign} ${mag}${sym}`;
}

/** Polynomial in LaTeX from coefficients, highest power first: poly([1,-3,2]) = "x^{2} - 3x + 2". */
export function poly(coefs: number[], v = 'x'): string {
  const n = coefs.length - 1;
  let s = '';
  coefs.forEach((c, i) => {
    const p = n - i;
    const sym = p === 0 ? '' : p === 1 ? v : `${v}^{${p}}`;
    if (c === 0) return;
    s += signed(c, sym, s === '');
  });
  return s === '' ? '0' : s;
}

/** Linear expression ax + b as LaTeX. */
export function linear(a: number, b: number, v = 'x'): string {
  return poly([a, b], v);
}

/** Bracketed linear factor like (x - 3) or (2x + 1). */
export function factor(a: number, b: number, v = 'x'): string {
  return `(${linear(a, b, v)})`;
}

/** Format a plain integer/decimal number for a stem (no LaTeX). */
export function num(x: number): string {
  return Number.isInteger(x) ? String(x) : String(Number(x.toPrecision(10)));
}

/** LaTeX for a number as a fraction where needed. */
export function tex(x: number | Exact): string {
  return (x instanceof Exact ? x : Exact.num(x)).toLatex();
}

/** Ordinal word for small n. */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Random pick of an angle with exact trig values; returns degrees. */
export const EXACT_ANGLES_DEG = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330, 360];

export function angleLatex(deg: number, radians: boolean): string {
  if (!radians) return `${deg}^{\\circ}`;
  return Exact.pi(Exact.rat(deg, 180).toRat()).toLatex();
}

/** Exact sin/cos/tan of multiples of 30°/45°; tan undefined → null. */
export function exactSin(deg: number): Exact {
  const d = ((deg % 360) + 360) % 360;
  const table: Record<number, Exact> = {
    0: Exact.ZERO, 30: Exact.rat(1, 2), 45: Exact.surd(2, Exact.rat(1, 2).toRat()), 60: Exact.surd(3, Exact.rat(1, 2).toRat()), 90: Exact.ONE,
  };
  let ref = d;
  let sign = 1;
  if (d > 90 && d <= 180) ref = 180 - d;
  else if (d > 180 && d <= 270) { ref = d - 180; sign = -1; }
  else if (d > 270) { ref = 360 - d; sign = -1; }
  const v = table[ref];
  if (!v) throw new Error(`no exact sin for ${deg}`);
  return sign < 0 ? v.neg() : v;
}

export function exactCos(deg: number): Exact {
  return exactSin(deg + 90);
}

export function exactTan(deg: number): Exact | null {
  const c = exactCos(deg);
  if (c.isZero()) return null;
  return exactSin(deg).div(c);
}
