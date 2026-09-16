/**
 * Exact arithmetic: rationals, surds and powers of pi.
 *
 * A value is a finite sum of terms  c · √r · π^k  where
 *   c is a rational (bigint numerator/denominator),
 *   r is a square-free positive integer (r = 1 means "no surd"),
 *   k is an integer power of π (usually 0, 1, 2 or -1).
 *
 * This is enough to represent every answer the ESAT expects: integers, simple
 * fractions, simplified surds (2√5, 7 + 4√3), multiples of π and exact trig values.
 * Every operation is exact or throws NotExact; the caller (the answer parser) then
 * falls back to floating point with a tolerance.
 */

export class NotExact extends Error {
  constructor(msg = 'value cannot be represented exactly') {
    super(msg);
    this.name = 'NotExact';
  }
}

// ----------------------------------------------------------------------------
// Rationals
// ----------------------------------------------------------------------------

export interface Rat {
  readonly n: bigint;
  readonly d: bigint; // always > 0, gcd(n, d) = 1
}

export function bgcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

export function babs(a: bigint): bigint {
  return a < 0n ? -a : a;
}

export function rat(n: bigint | number, d: bigint | number = 1n): Rat {
  let N = typeof n === 'bigint' ? n : BigInt(assertInt(n));
  let D = typeof d === 'bigint' ? d : BigInt(assertInt(d));
  if (D === 0n) throw new NotExact('division by zero');
  if (D < 0n) { N = -N; D = -D; }
  const g = bgcd(N, D);
  if (g > 1n) { N /= g; D /= g; }
  return { n: N, d: D };
}

function assertInt(x: number): number {
  if (!Number.isInteger(x)) throw new NotExact(`expected integer, got ${x}`);
  if (Math.abs(x) > Number.MAX_SAFE_INTEGER) throw new NotExact('integer too large');
  return x;
}

export const R0: Rat = { n: 0n, d: 1n };
export const R1: Rat = { n: 1n, d: 1n };

export function ratAdd(a: Rat, b: Rat): Rat { return rat(a.n * b.d + b.n * a.d, a.d * b.d); }
export function ratSub(a: Rat, b: Rat): Rat { return rat(a.n * b.d - b.n * a.d, a.d * b.d); }
export function ratMul(a: Rat, b: Rat): Rat { return rat(a.n * b.n, a.d * b.d); }
export function ratDiv(a: Rat, b: Rat): Rat {
  if (b.n === 0n) throw new NotExact('division by zero');
  return rat(a.n * b.d, a.d * b.n);
}
export function ratNeg(a: Rat): Rat { return { n: -a.n, d: a.d }; }
export function ratAbs(a: Rat): Rat { return { n: babs(a.n), d: a.d }; }
export function ratIsZero(a: Rat): boolean { return a.n === 0n; }
export function ratIsInt(a: Rat): boolean { return a.d === 1n; }
export function ratSign(a: Rat): -1 | 0 | 1 { return a.n < 0n ? -1 : a.n > 0n ? 1 : 0; }
export function ratEq(a: Rat, b: Rat): boolean { return a.n === b.n && a.d === b.d; }
export function ratCmp(a: Rat, b: Rat): -1 | 0 | 1 {
  const l = a.n * b.d, r = b.n * a.d;
  return l < r ? -1 : l > r ? 1 : 0;
}
export function ratToNumber(a: Rat): number {
  // Avoid precision loss for large bigints by scaling.
  const n = a.n, d = a.d;
  if (babs(n) < 2n ** 53n && d < 2n ** 53n) return Number(n) / Number(d);
  const q = n / d;
  const rem = n - q * d;
  return Number(q) + Number(rem) / Number(d);
}
export function ratPow(a: Rat, e: number): Rat {
  if (!Number.isInteger(e)) throw new NotExact('non-integer power');
  if (e === 0) return R1;
  if (e < 0) return ratPow(ratDiv(R1, a), -e);
  if (e > 200) throw new NotExact('power too large');
  return rat(a.n ** BigInt(e), a.d ** BigInt(e));
}

/** Parse a decimal string like "-12.375" or "3e8" or "2.5E-3" into an exact rational. */
export function ratFromDecimal(s: string): Rat {
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(s.trim());
  if (!m || (m[2] === '' && (m[3] === undefined || m[3] === ''))) throw new NotExact(`bad number: ${s}`);
  const sign = m[1] === '-' ? -1n : 1n;
  const intPart = m[2] || '0';
  const fracPart = m[3] || '';
  const exp = m[4] ? parseInt(m[4], 10) : 0;
  let n = BigInt(intPart + fracPart);
  let d = 10n ** BigInt(fracPart.length);
  if (exp > 0) n *= 10n ** BigInt(exp);
  else if (exp < 0) d *= 10n ** BigInt(-exp);
  return rat(sign * n, d);
}

/** Convert a JS number to a rational, exactly for integers and short decimals. */
export function ratFromNumber(x: number): Rat {
  if (!Number.isFinite(x)) throw new NotExact('non-finite number');
  if (Number.isInteger(x)) return rat(BigInt(x), 1n);
  // Use the shortest round-trip decimal representation.
  const s = x.toString();
  if (/e/i.test(s) || s.replace(/[-.]/g, '').length > 15) {
    // Too long to be a "clean" decimal — still convert exactly via toFixed digits.
    return ratFromDecimal(x.toPrecision(15));
  }
  return ratFromDecimal(s);
}

/** Integer k-th root if exact, else null. */
export function exactRoot(n: bigint, k: number): bigint | null {
  if (n < 0n) return null;
  if (n < 2n) return n;
  // Newton / float guess then correct.
  let guess = BigInt(Math.round(Math.pow(Number(n), 1 / k)));
  for (let delta = -2n; delta <= 2n; delta++) {
    const g = guess + delta;
    if (g >= 0n && g ** BigInt(k) === n) return g;
  }
  return null;
}

/** Rational k-th root if exact. */
export function ratRoot(a: Rat, k: number): Rat | null {
  if (a.n < 0n) {
    if (k % 2 === 0) return null;
    const r = ratRoot(ratNeg(a), k);
    return r ? ratNeg(r) : null;
  }
  const rn = exactRoot(a.n, k);
  const rd = exactRoot(a.d, k);
  if (rn === null || rd === null) return null;
  return rat(rn, rd);
}

// ----------------------------------------------------------------------------
// Square-free decomposition
// ----------------------------------------------------------------------------

const SQF_CACHE = new Map<number, [number, number]>();

/** m = s² · r with r square-free. Returns [s, r]. */
export function squarefreeDecompose(m: number): [number, number] {
  if (!Number.isInteger(m) || m < 0) throw new NotExact('sqrt of negative or non-integer');
  if (m === 0) return [0, 1];
  const cached = SQF_CACHE.get(m);
  if (cached) return cached;
  let s = 1, r = 1, n = m;
  for (let p = 2; p * p <= n; p++) {
    let count = 0;
    while (n % p === 0) { n /= p; count++; }
    if (count > 0) {
      s *= p ** Math.floor(count / 2);
      if (count % 2 === 1) r *= p;
    }
    if (p > 5 && p * p * p * p > m && n === 1) break;
  }
  r *= n;
  const out: [number, number] = [s, r];
  if (m < 100000) SQF_CACHE.set(m, out);
  return out;
}

export function isSquarefree(m: number): boolean {
  return squarefreeDecompose(m)[0] === 1;
}

// ----------------------------------------------------------------------------
// Exact values
// ----------------------------------------------------------------------------

export interface Term {
  readonly c: Rat;
  readonly r: number; // square-free radicand, 1 = none
  readonly k: number; // power of pi
}

function termKey(r: number, k: number): string {
  return `${r}|${k}`;
}

function termOrder(a: Term, b: Term): number {
  // rationals first, then plain surds, then pi terms
  const ca = (a.k !== 0 ? 2 : 0) + (a.r !== 1 ? 1 : 0);
  const cb = (b.k !== 0 ? 2 : 0) + (b.r !== 1 ? 1 : 0);
  if (ca !== cb) return ca - cb;
  if (a.k !== b.k) return a.k - b.k;
  return a.r - b.r;
}

export type NumberFormat = 'auto' | 'fraction' | 'decimal' | 'sf' | 'mixed';

export interface FormatOptions {
  format?: NumberFormat;
}

export class Exact {
  readonly terms: readonly Term[];

  private constructor(terms: Term[]) {
    const merged = new Map<string, Term>();
    for (const t of terms) {
      if (ratIsZero(t.c)) continue;
      const key = termKey(t.r, t.k);
      const prev = merged.get(key);
      merged.set(key, prev ? { c: ratAdd(prev.c, t.c), r: t.r, k: t.k } : t);
    }
    this.terms = [...merged.values()].filter((t) => !ratIsZero(t.c)).sort(termOrder);
  }

  // ---- constructors ----------------------------------------------------------

  static readonly ZERO = new Exact([]);
  static readonly ONE = new Exact([{ c: R1, r: 1, k: 0 }]);

  static fromTerms(terms: Term[]): Exact {
    return new Exact(terms);
  }

  static int(n: number | bigint): Exact {
    return new Exact([{ c: rat(n, 1), r: 1, k: 0 }]);
  }

  static rat(n: number | bigint, d: number | bigint = 1): Exact {
    return new Exact([{ c: rat(n, d), r: 1, k: 0 }]);
  }

  static fromRat(q: Rat): Exact {
    return new Exact([{ c: q, r: 1, k: 0 }]);
  }

  /** From a JS number; exact for integers and short terminating decimals. */
  static num(x: number): Exact {
    return Exact.fromRat(ratFromNumber(x));
  }

  static decimal(s: string): Exact {
    return Exact.fromRat(ratFromDecimal(s));
  }

  /** c · √r  (r any non-negative integer; simplified automatically). */
  static surd(r: number, c: Rat | number = 1): Exact {
    const [s, rr] = squarefreeDecompose(r);
    const coef = typeof c === 'number' ? ratFromNumber(c) : c;
    return new Exact([{ c: ratMul(coef, rat(s, 1)), r: rr, k: 0 }]);
  }

  /** c · π^k */
  static pi(c: Rat | number = 1, k = 1): Exact {
    const coef = typeof c === 'number' ? ratFromNumber(c) : c;
    return new Exact([{ c: coef, r: 1, k }]);
  }

  /** √(rational) exactly, e.g. √(3/2) = √6 / 2 */
  static sqrtRat(q: Rat): Exact {
    if (q.n < 0n) throw new NotExact('sqrt of negative');
    if (q.n === 0n) return Exact.ZERO;
    // √(n/d) = √(n·d) / d
    const nd = q.n * q.d;
    if (nd > BigInt(Number.MAX_SAFE_INTEGER)) throw new NotExact('radicand too large');
    const [s, r] = squarefreeDecompose(Number(nd));
    return new Exact([{ c: rat(BigInt(s), q.d), r, k: 0 }]);
  }

  // ---- predicates ------------------------------------------------------------

  isZero(): boolean { return this.terms.length === 0; }
  isRational(): boolean { return this.terms.length === 0 || (this.terms.length === 1 && this.terms[0].r === 1 && this.terms[0].k === 0); }
  isInteger(): boolean { return this.isRational() && (this.terms.length === 0 || ratIsInt(this.terms[0].c)); }
  isSingleTerm(): boolean { return this.terms.length <= 1; }
  hasPi(): boolean { return this.terms.some((t) => t.k !== 0); }
  hasSurd(): boolean { return this.terms.some((t) => t.r !== 1); }

  /** Rational value if rational, else throws. */
  toRat(): Rat {
    if (!this.isRational()) throw new NotExact('not rational');
    return this.terms.length === 0 ? R0 : this.terms[0].c;
  }

  /** Integer value if integer, else throws. */
  toInt(): number {
    const q = this.toRat();
    if (!ratIsInt(q)) throw new NotExact('not an integer');
    return Number(q.n);
  }

  toNumber(): number {
    let sum = 0;
    for (const t of this.terms) sum += ratToNumber(t.c) * Math.sqrt(t.r) * Math.PI ** t.k;
    return sum;
  }

  equals(other: Exact): boolean {
    if (this.terms.length !== other.terms.length) return false;
    for (let i = 0; i < this.terms.length; i++) {
      const a = this.terms[i], b = other.terms[i];
      if (a.r !== b.r || a.k !== b.k || !ratEq(a.c, b.c)) return false;
    }
    return true;
  }

  /** Numeric sign (uses floating point; exact for rationals). */
  sign(): -1 | 0 | 1 {
    if (this.isRational()) return ratSign(this.toRat());
    const v = this.toNumber();
    return v < -1e-12 ? -1 : v > 1e-12 ? 1 : 0;
  }

  cmp(other: Exact): -1 | 0 | 1 {
    if (this.equals(other)) return 0;
    return this.sub(other).sign();
  }

  // ---- arithmetic ------------------------------------------------------------

  add(other: Exact): Exact { return new Exact([...this.terms, ...other.terms]); }
  sub(other: Exact): Exact { return this.add(other.neg()); }
  neg(): Exact { return new Exact(this.terms.map((t) => ({ c: ratNeg(t.c), r: t.r, k: t.k }))); }
  abs(): Exact { return this.sign() < 0 ? this.neg() : this; }

  mul(other: Exact): Exact {
    const out: Term[] = [];
    for (const a of this.terms) {
      for (const b of other.terms) {
        const prod = a.r * b.r;
        const [s, r] = squarefreeDecompose(prod);
        out.push({ c: ratMul(ratMul(a.c, b.c), rat(s, 1)), r, k: a.k + b.k });
      }
    }
    return new Exact(out);
  }

  mulRat(q: Rat | number): Exact {
    const coef = typeof q === 'number' ? ratFromNumber(q) : q;
    return new Exact(this.terms.map((t) => ({ c: ratMul(t.c, coef), r: t.r, k: t.k })));
  }

  /** Multiplicative inverse. Exact for one- and two-term values. */
  inv(): Exact {
    if (this.isZero()) throw new NotExact('division by zero');
    if (this.terms.length === 1) {
      const t = this.terms[0];
      // 1 / (c √r π^k) = (1/(c r)) √r π^-k
      return new Exact([{ c: ratDiv(R1, ratMul(t.c, rat(t.r, 1))), r: t.r, k: -t.k }]);
    }
    if (this.terms.length === 2) {
      const [a, b] = this.terms;
      if (a.k === b.k) {
        // (a + b)(a - b) = a² - b², which is rational · π^(2k): a single term.
        const conj = new Exact([a, { c: ratNeg(b.c), r: b.r, k: b.k }]);
        const norm = this.mul(conj);
        if (norm.terms.length === 1) return conj.mul(norm.inv());
      }
    }
    // Three or more terms (or mixed pi powers): use the field norm by repeated conjugation.
    return this.invByConjugation();
  }

  private invByConjugation(): Exact {
    // Multiply by conjugates over each distinct surd until rational (bounded effort).
    let num = Exact.ONE;
    let den: Exact = this;
    for (let iter = 0; iter < 6 && !(den.terms.length === 1); iter++) {
      // pick a radicand present in den and flip the sign of every term containing it
      const rad = den.terms.map((t) => t.r).find((r) => r !== 1);
      if (rad === undefined) {
        // only pi powers differ: cannot invert exactly
        throw new NotExact('cannot invert a sum of different powers of pi');
      }
      const conj = new Exact(den.terms.map((t) => (t.r % rad === 0 ? { c: ratNeg(t.c), r: t.r, k: t.k } : t)));
      num = num.mul(conj);
      den = den.mul(conj);
    }
    if (den.terms.length !== 1) throw new NotExact('cannot invert');
    return num.mul(den.inv());
  }

  div(other: Exact): Exact { return this.mul(other.inv()); }

  /** Integer power. */
  pow(e: number): Exact {
    if (!Number.isInteger(e)) throw new NotExact('non-integer exponent');
    if (e < 0) return this.inv().pow(-e);
    if (e > 64) throw new NotExact('exponent too large');
    let result = Exact.ONE;
    let base: Exact = this;
    let n = e;
    while (n > 0) {
      if (n & 1) result = result.mul(base);
      base = base.mul(base);
      n >>= 1;
    }
    return result;
  }

  /** Rational power p/q, exact when possible (e.g. 8^(2/3) = 4, 2^(1/2) = √2, (2√2)^(2/3) = 2). */
  powRat(exp: Rat): Exact {
    if (ratIsInt(exp)) return this.pow(Number(exp.n));
    if (this.isZero()) return Exact.ZERO;
    const q = Number(exp.d);
    const p = Number(exp.n);
    if (q > 64) throw new NotExact('root index too large');
    // Only single pi-free terms can have exact fractional powers here.
    if (this.terms.length !== 1 || this.terms[0].k !== 0) {
      if (q === 2 && p === 1) return this.sqrt();
      throw new NotExact('fractional power of a sum');
    }
    const t = this.terms[0];
    if (t.r === 1) {
      // rational base
      let base = t.c;
      if (ratSign(base) < 0 && q % 2 === 0) throw new NotExact('even root of negative');
      let numerator = p;
      if (numerator < 0) { base = ratDiv(R1, base); numerator = -numerator; }
      const raised = ratPow(base, numerator);
      const root = ratRoot(raised, q);
      if (root) return Exact.fromRat(root);
      if (q === 2) return Exact.sqrtRat(raised);
      if (q % 2 === 0 && q > 2) {
        // try the (q/2)-th root first, then a square root
        const half = ratRoot(raised, q / 2);
        if (half) return Exact.sqrtRat(half);
      }
      throw new NotExact('irrational root');
    }
    // base = c√r with c > 0 → base = √(c² r)
    if (ratSign(t.c) < 0) throw new NotExact('fractional power of negative surd');
    const inside = ratMul(ratMul(t.c, t.c), rat(t.r, 1)); // base² as rational
    // base^(p/q) = inside^(p/(2q))
    const e2 = rat(BigInt(p), BigInt(2 * q));
    return Exact.fromRat(inside).powRat(e2);
  }

  /** Exact square root when it exists in this representation (rationals and denestable a + b√r). */
  sqrt(): Exact {
    if (this.isZero()) return Exact.ZERO;
    if (this.sign() < 0) throw new NotExact('sqrt of negative');
    if (this.isRational()) return Exact.sqrtRat(this.toRat());
    if (this.terms.length === 1 && this.terms[0].k === 0) {
      // √(c√r) = (c² r)^(1/4): exact only if c² r is a perfect square (r = 1 already handled) → never here.
      throw new NotExact('nested surd');
    }
    if (this.terms.length === 2 && this.terms[0].k === 0 && this.terms[1].k === 0 && this.terms[0].r === 1) {
      // √(a + b√r) = √m + √n where m + n = a and mn = b² r / 4
      const a = this.terms[0].c, b = this.terms[1].c, r = this.terms[1].r;
      const disc = ratSub(ratMul(a, a), ratMul(ratMul(b, b), rat(r, 1)));
      const sd = ratRoot(disc, 2);
      if (sd) {
        const m = ratDiv(ratAdd(a, sd), rat(2, 1));
        const n = ratDiv(ratSub(a, sd), rat(2, 1));
        if (ratSign(m) >= 0 && ratSign(n) >= 0) {
          const sm = Exact.sqrtRat(m), sn = Exact.sqrtRat(n);
          return ratSign(b) >= 0 ? sm.add(sn) : sm.sub(sn);
        }
      }
    }
    throw new NotExact('sqrt not expressible');
  }

  // ---- formatting ------------------------------------------------------------

  /** LaTeX for KaTeX. */
  toLatex(opts: FormatOptions = {}): string {
    return this.format(opts, 'latex');
  }

  /** Plain text, e.g. "2√5", "3/4", "π/6", "3×10^8". */
  toPlain(opts: FormatOptions = {}): string {
    return this.format(opts, 'plain');
  }

  private format(opts: FormatOptions, mode: 'latex' | 'plain'): string {
    if (this.terms.length === 0) return '0';
    const fmt = opts.format ?? 'auto';
    if (this.isRational()) {
      const s = formatRational(this.toRat(), fmt, mode);
      if (s !== null) return s;
    }
    let out = '';
    this.terms.forEach((t, i) => {
      const neg = ratSign(t.c) < 0;
      const body = formatTerm({ c: ratAbs(t.c), r: t.r, k: t.k }, mode, fmt);
      if (i === 0) out += (neg ? (mode === 'latex' ? '-' : '−') : '') + body;
      else out += (neg ? ' - ' : ' + ').replace('-', mode === 'latex' ? '-' : '−') + body;
    });
    return out;
  }

  toString(): string {
    return this.toPlain();
  }
}

// ----------------------------------------------------------------------------
// Formatting helpers
// ----------------------------------------------------------------------------

function isPow10(d: bigint): number | null {
  let k = 0;
  let x = d;
  while (x % 10n === 0n) { x /= 10n; k++; }
  return x === 1n ? k : null;
}

function bigDigits(n: bigint): string {
  return babs(n).toString();
}

/** Decimal expansion if terminating (den = 2^a 5^b), else null. */
export function ratToDecimalString(q: Rat): string | null {
  let d = q.d;
  let twos = 0, fives = 0;
  while (d % 2n === 0n) { d /= 2n; twos++; }
  while (d % 5n === 0n) { d /= 5n; fives++; }
  if (d !== 1n) return null;
  const k = Math.max(twos, fives);
  const scaled = babs(q.n) * (twos > fives ? 5n ** BigInt(twos - fives) : 2n ** BigInt(fives - twos));
  let s = scaled.toString();
  if (k > 0) {
    s = s.padStart(k + 1, '0');
    s = s.slice(0, s.length - k) + '.' + s.slice(s.length - k);
    s = s.replace(/\.?0+$/, '');
  }
  return (q.n < 0n ? '-' : '') + s;
}

/** Standard form m × 10^k (m has ≤ 4 significant figures) or null. */
export function ratToStandardForm(q: Rat): { mantissa: string; exp: number; negative: boolean } | null {
  if (q.n === 0n) return { mantissa: '0', exp: 0, negative: false };
  const dec = ratToDecimalString({ n: babs(q.n), d: q.d });
  if (dec === null) return null;
  const digits = dec.replace('.', '').replace(/^0+/, '');
  const sig = digits.replace(/0+$/, '');
  if (sig.length > 4) return null;
  // position of decimal point
  const pointPos = dec.includes('.') ? dec.indexOf('.') : dec.length;
  const leadingZeros = dec.replace('.', '').length - digits.length; // zeros before first sig digit
  const exp = pointPos - leadingZeros - 1;
  const mantissa = sig.length > 1 ? `${sig[0]}.${sig.slice(1)}` : sig;
  return { mantissa, exp, negative: q.n < 0n };
}

function formatRational(q: Rat, fmt: NumberFormat, mode: 'latex' | 'plain'): string | null {
  const neg = q.n < 0n;
  const sgn = neg ? (mode === 'latex' ? '-' : '−') : '';
  const times = mode === 'latex' ? ' \\times ' : '×';
  const pow10 = (e: number) => (mode === 'latex' ? `10^{${e}}` : `10^${e}`);

  if (fmt === 'sf') {
    const sf = ratToStandardForm(q);
    if (sf) return `${sgn}${sf.mantissa}${times}${pow10(sf.exp)}`;
    return null;
  }
  if (fmt === 'decimal') {
    const d = ratToDecimalString(q);
    if (d) return d.replace('-', sgn);
    return null; // fall through to fraction formatting
  }
  if (ratIsInt(q)) {
    const digits = bigDigits(q.n);
    if (fmt === 'auto' && digits.length >= 7) {
      const sf = ratToStandardForm(q);
      if (sf) return `${sgn}${sf.mantissa}${times}${pow10(sf.exp)}`;
    }
    return `${sgn}${digits}`;
  }
  if (fmt === 'mixed') {
    const whole = babs(q.n) / q.d;
    const rem = babs(q.n) % q.d;
    if (whole > 0n) {
      return mode === 'latex' ? `${sgn}${whole}\\tfrac{${rem}}{${q.d}}` : `${sgn}${whole} ${rem}/${q.d}`;
    }
  }
  if (fmt === 'auto') {
    // Small terminating decimals with power-of-ten denominators read better as decimals (0.3, 0.05).
    const k = isPow10(q.d);
    if (k !== null && k <= 4) {
      const d = ratToDecimalString(q)!;
      return d.replace('-', sgn);
    }
    // Very small/large denominators: standard form (e.g. 3 × 10^-7).
    if (q.d > 100000n) {
      const sf = ratToStandardForm(q);
      if (sf) return `${sgn}${sf.mantissa}${times}${pow10(sf.exp)}`;
    }
  }
  return mode === 'latex' ? `${sgn}\\frac{${bigDigits(q.n)}}{${q.d}}` : `${sgn}${bigDigits(q.n)}/${q.d}`;
}

function formatTerm(t: Term, mode: 'latex' | 'plain', fmt: NumberFormat): string {
  const n = t.c.n, d = t.c.d;
  const sqrtSym = t.r !== 1 ? (mode === 'latex' ? `\\sqrt{${t.r}}` : `√${t.r}`) : '';
  const piPow = (k: number) => (mode === 'latex' ? (k === 1 ? '\\pi' : `\\pi^{${k}}`) : (k === 1 ? 'π' : `π^${k}`));
  const numSym = sqrtSym + (t.k > 0 ? piPow(t.k) : '');
  const denSym = t.k < 0 ? piPow(-t.k) : '';
  if (d === 1n && !denSym) {
    if (n === 1n && numSym) return numSym;
    if (numSym === '' && fmt === 'decimal') return n.toString();
    return `${n}${numSym}`;
  }
  const numStr = (n === 1n && numSym) ? numSym : `${n}${numSym}`;
  const denStr = (d === 1n ? '' : d.toString()) + denSym;
  if (mode === 'latex') return `\\frac{${numStr}}{${denStr}}`;
  return `${numStr}/${denStr}`;
}

// ----------------------------------------------------------------------------
// Convenience constructors for templates
// ----------------------------------------------------------------------------

/** Exact integer or short decimal. */
export const E = (x: number): Exact => Exact.num(x);
/** Exact fraction a/b. */
export const frac = (a: number, b: number): Exact => Exact.rat(a, b);
/** c·√r, simplified. */
export const surd = (r: number, c: number | Rat = 1): Exact => Exact.surd(r, c);
/** (a/b)·√r */
export const surdFrac = (a: number, b: number, r: number): Exact => Exact.surd(r, rat(a, b));
/** c·π */
export const piTimes = (c: number | Rat = 1): Exact => Exact.pi(c, 1);
/** (a/b)·π */
export const piFrac = (a: number, b: number): Exact => Exact.pi(rat(a, b), 1);
/** Sum of a list of Exacts. */
export const sum = (...xs: Exact[]): Exact => xs.reduce((acc, x) => acc.add(x), Exact.ZERO);
