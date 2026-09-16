import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { gcd } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Index laws.
 * Level 1: a^m × a^n and a^m ÷ a^n → find k in a^k
 * Level 2: (a^m)^n, mixed bases 2^3 × 4^2 = 2^k, and an expression that collapses to a^0 = 1
 * Level 3: negative and fractional indices: 8^x = 2^12, 9^(1/2) × 3^4 = 3^k, write 1/8 or √32 as a power of 2
 * Level 4: simplify (2^n)² × 8 / 4^n as a single power of 2 (choice of 2^{…} expressions)
 * Level 5: solve 2^(x+2) − 2^x = 24, or 3^(2x) = 27^(x−1)
 *
 * Wrong options are named mistakes: multiplying exponents when multiplying powers, adding when raising
 * a power to a power, treating 4^n as 2^(n+2), losing the sign of a negative index, halving the overall
 * exponent, forgetting to multiply the whole bracket by the outer index.
 */

type Cand = { value: Exact | null; trap: string };

function cleanOnly(ds: Cand[]): Distractor[] {
  const out: Distractor[] = [];
  for (const d of ds) {
    const v = d.value;
    if (!v || !Number.isFinite(v.toNumber()) || !isCleanExact(v).ok) continue;
    if (out.some((o) => o.value.equals(v))) continue;
    out.push({ value: v, trap: d.trap });
  }
  return out;
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

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

const FR = { format: 'fraction' as const };
const pw = (b: number | string, e: number | string) => `${b}^{${e}}`;
/** a^(u/v) in LaTeX with a fractional index. */
const pwFrac = (b: number, u: number, v: number) => (v === 1 ? pw(b, u) : `${b}^{${u < 0 ? '-' : ''}\\frac{${Math.abs(u)}}{${v}}}`);

function pack(rng: RNG, stem: string, ans: Exact, ds: Distractor[], solution: string, trap: string, tags: string[], params: Record<string, unknown>): Generated | null {
  if (ds.length < 4 || !isCleanExact(ans).ok) return null;
  return {
    stem,
    answer: { kind: 'exact' as const, value: ans, format: 'fraction' as const },
    options: buildOptions(rng, ans, ds, FR),
    solution,
    trap,
    tags,
    params,
    typedAllowed: true,
  };
}

const BASES = [2, 3, 5, 7, 10];

// ---------------------------------------------------------------------------
// Level 1: a^m × a^n, a^m ÷ a^n
// ---------------------------------------------------------------------------

function sameBase(rng: RNG): Generated | null {
  const a = rng.pick(BASES);
  const divide = rng.bool(0.45);
  const m = rng.int(2, 9), n = rng.int(2, 9);
  if (m === n || (divide && m < n)) return null;
  const k = divide ? m - n : m + n;
  const ans = E(k);
  const must = cleanOnly([
    { value: divide ? E(m + n) : E(m * n), trap: divide ? 'added the indices when dividing' : 'multiplied the indices when multiplying' },
  ]);
  const extra = cleanOnly([
    { value: divide ? E(m * n) : E(Math.abs(m - n)), trap: divide ? 'multiplied the indices' : 'subtracted the indices' },
    { value: divide && m % n === 0 ? E(m / n) : null, trap: 'divided the indices' },
    { value: divide ? E(n - m) : E(m + n + 1), trap: divide ? 'subtracted the wrong way round' : 'arithmetic slip' },
    { value: E(k + 1), trap: 'arithmetic slip' },
    { value: E(k - 1), trap: 'arithmetic slip' },
    { value: !divide ? E(2 * (m + n)) : E(2 * k), trap: 'doubled the index' },
  ]);
  const op = divide ? '\\div' : '\\times';
  return pack(rng, `Given that $${pw(a, m)} ${op} ${pw(a, n)} = ${pw(a, 'k')}$, find the value of $k$.`, ans, ranked(rng, ans, must, extra),
    `Same base, so ${divide ? 'subtract' : 'add'} the indices: $k = ${m} ${divide ? '-' : '+'} ${n} = ${k}$.`,
    'Multiplying powers of the same base adds the indices and dividing subtracts them; the indices are never multiplied.',
    ['indices', 'index-laws'],
    { variant: 'k', base: a, num: [{ b: a, e: m }, ...(divide ? [] : [{ b: a, e: n }])], den: divide ? [{ b: a, e: n }] : [] },
  );
}

// ---------------------------------------------------------------------------
// Level 2: (a^m)^n, mixed bases, a^0
// ---------------------------------------------------------------------------

function powerOfPower(rng: RNG): Generated | null {
  const a = rng.pick(BASES);
  const m = rng.int(2, 6), n = rng.int(2, 5);
  const withExtra = rng.bool(0.4);
  const p = withExtra ? rng.int(1, 6) : 0; // (a^m)^n × a^p or ÷ a^p
  const divide = withExtra && rng.bool(0.5);
  const k = m * n + (divide ? -p : p);
  const ans = E(k);
  const must = cleanOnly([
    { value: E(m + n + (divide ? -p : p)), trap: 'added the indices when raising a power to a power' },
  ]);
  const extra = cleanOnly([
    { value: m ** n <= 100 ? E(m ** n + (divide ? -p : p)) : null, trap: 'raised the index to the power instead of multiplying' },
    { value: withExtra ? E(m * n * p) : E(n ** m), trap: withExtra ? 'multiplied all three indices' : 'raised the outer index to the inner one' },
    { value: withExtra ? E(m * n + (divide ? p : -p)) : E(m * n + 1), trap: withExtra ? (divide ? 'added the index when dividing' : 'subtracted the index when multiplying') : 'arithmetic slip' },
    { value: withExtra ? E((m + (divide ? -p : p)) * n) : E(m * n - 1), trap: withExtra ? 'applied the outer index to the extra factor as well' : 'arithmetic slip' },
    { value: E(2 * m * n), trap: 'doubled the index' },
  ]);
  const expr = withExtra ? `(${pw(a, m)})^{${n}} ${divide ? '\\div' : '\\times'} ${pw(a, p)}` : `(${pw(a, m)})^{${n}}`;
  return pack(rng, `Given that $${expr} = ${pw(a, 'k')}$, find the value of $k$.`, ans, ranked(rng, ans, must, extra),
    `$(${pw(a, m)})^{${n}} = ${pw(a, m * n)}$ (multiply the indices)${withExtra ? `, then ${divide ? 'subtract' : 'add'} $${p}$` : ''}: $k = ${k}$.`,
    'A power of a power multiplies the indices: (a^m)^n = a^{mn}, not a^{m+n}.',
    ['indices', 'power-of-power'],
    { variant: 'k', base: a, num: [{ b: a, e: m * n }, ...(withExtra && !divide ? [{ b: a, e: p }] : [])], den: withExtra && divide ? [{ b: a, e: p }] : [] },
  );
}

const PRIME_POWERS: [number, number, number][] = [[2, 4, 2], [2, 8, 3], [2, 16, 4], [3, 9, 2], [3, 27, 3], [5, 25, 2], [5, 125, 3], [2, 32, 5], [3, 81, 4]];

function mixedBase(rng: RNG): Generated | null {
  const [a, big, j] = rng.pick(PRIME_POWERS);
  const m = rng.int(2, 6), n = rng.int(2, 4);
  const divide = rng.bool(0.4);
  const bigFirst = rng.bool(0.5);
  const k = divide ? (bigFirst ? j * n - m : m - j * n) : m + j * n;
  if (divide && k === 0) return null;
  const ans = E(k);
  const wrongSame = divide ? (bigFirst ? n - m : m - n) : m + n; // 4 treated as 2
  const wrongAdd = divide ? (bigFirst ? j + n - m : m - (j + n)) : m + j + n; // 4^n treated as 2^(n+2)
  const must = cleanOnly([
    { value: E(wrongSame), trap: `treated ${big} as if it were ${a} (did not convert the base)` },
    { value: E(wrongAdd), trap: `wrote ${pw(big, n)} as ${pw(a, n + j)} instead of ${pw(a, j * n)}` },
  ]);
  const extra = cleanOnly([
    { value: divide ? E(m + j * n) : E(m * j * n), trap: divide ? 'added instead of subtracting' : 'multiplied all the indices' },
    { value: E(-k), trap: 'sign error' },
    { value: E(k + 1), trap: 'arithmetic slip' },
    { value: E(k - 1), trap: 'arithmetic slip' },
    { value: divide ? E(j * n + m) : E((m + n) * j), trap: divide ? 'added instead of subtracting' : 'applied the conversion factor to both indices' },
  ]);
  const A = pw(a, m), B = pw(big, n);
  const expr = divide ? (bigFirst ? `${B} \\div ${A}` : `${A} \\div ${B}`) : `${A} \\times ${B}`;
  const stem = rng.bool(0.6)
    ? `Given that $${expr} = ${pw(a, 'k')}$, find the value of $k$.`
    : `Write $${expr}$ as a power of $${a}$, i.e. in the form $${pw(a, 'k')}$. Find $k$.`;
  return pack(rng, stem, ans, ranked(rng, ans, must, extra),
    `$${big} = ${pw(a, j)}$, so $${B} = ${pw(a, j * n)}$; then ${divide ? 'subtract' : 'add'} the indices: $k = ${divide ? (bigFirst ? `${j * n} - ${m}` : `${m} - ${j * n}`) : `${m} + ${j * n}`} = ${k}$.`,
    'Convert to a common base first: 4^n = (2²)^n = 2^{2n}, not 2^{n+2}; only then add or subtract indices.',
    ['indices', 'mixed-bases'],
    { variant: 'k', base: a, num: divide ? (bigFirst ? [{ b: big, e: n }] : [{ b: a, e: m }]) : [{ b: a, e: m }, { b: big, e: n }], den: divide ? (bigFirst ? [{ b: a, e: m }] : [{ b: big, e: n }]) : [] },
  );
}

function collapses(rng: RNG): Generated | null {
  // (a^m × a^n) / big^t where big = a^j, arranged to give a^0, a^1 or a^-1
  const [a, big, j] = rng.pick(PRIME_POWERS.filter(([, b]) => b <= 27));
  const target = rng.weighted([0, 1, -1], [3, 1, 1]);
  const t = rng.int(1, 3);
  const total = j * t + target; // m + n
  if (total < 3) return null;
  const m = rng.int(1, total - 1), n = total - m;
  if (m > 7 || n > 7) return null;
  const ans = target === 0 ? E(1) : target === 1 ? E(a) : frac(1, a);
  const must = cleanOnly([
    { value: target === 0 ? E(0) : E(target), trap: target === 0 ? 'thought a^0 = 0' : 'gave the index instead of the value' },
  ]);
  const extra = cleanOnly([
    { value: E(a), trap: 'gave a^1' },
    { value: frac(1, a), trap: 'sign error in the final index' },
    { value: E(a * a), trap: 'index slip: a^2' },
    { value: E(a ** (m + n - t)), trap: `treated ${big} as ${a} (did not convert the base)` },
    { value: frac(a ** (m * n), big ** t), trap: 'multiplied the indices in the numerator' },
    { value: E(0), trap: 'thought a^0 = 0' },
  ]);
  const denTex = t === 1 ? `${big}` : pw(big, t);
  const stem = `Find the value of $\\frac{${pw(a, m)} \\times ${pw(a, n)}}{${denTex}}$.`;
  return pack(rng, stem, ans, ranked(rng, ans, must, extra),
    `Numerator $${pw(a, m + n)}$; denominator $${denTex} = ${pw(a, j * t)}$; so the value is $${pw(a, `${m + n} - ${j * t}`)} = ${pw(a, target)} = ${ans.toLatex(FR)}$.`,
    'Anything (non-zero) to the power 0 is 1, not 0; and a^{-1} is 1/a.',
    ['indices', 'zero-index'],
    { variant: 'value', num: [{ b: a, e: m }, { b: a, e: n }], den: [{ b: big, e: t }] },
  );
}

// ---------------------------------------------------------------------------
// Level 3: negative and fractional indices
// ---------------------------------------------------------------------------

function solvePower(rng: RNG): Generated | null {
  // big^x = a^k with big = a^j → x = k/j (integer, or a half)
  const [a, big, j] = rng.pick(PRIME_POWERS);
  const x = rng.pick([-3, -2, -1, 1, 2, 3, 4, 5, 6, 0.5, 1.5, 2.5].filter((v) => Number.isInteger(v * j)));
  const k = x * j;
  if (!Number.isInteger(k) || Math.abs(k) > 15 || Math.abs(k) < 2) return null;
  const ans = E(x);
  const must = cleanOnly([
    { value: E(k - j), trap: `subtracted ${j} from the index instead of dividing by it` },
    { value: E(k * j), trap: `multiplied the index by ${j} instead of dividing` },
  ]);
  const extra = cleanOnly([
    { value: E(k + j), trap: `added ${j} to the index` },
    { value: frac(j, k), trap: 'inverted the fraction' },
    { value: E(-x), trap: 'sign error' },
    { value: E(k), trap: 'ignored the different bases' },
    { value: E(x + 1), trap: 'arithmetic slip' },
  ]);
  return pack(rng, `Solve $${pw(big, 'x')} = ${pw(a, k)}$.`, ans, ranked(rng, ans, must, extra),
    `$${big} = ${pw(a, j)}$, so $${pw(big, 'x')} = ${pw(a, `${j}x`)}$; equating indices, $${j}x = ${k}$ and $x = ${ans.toLatex(FR)}$.`,
    'Write both sides as powers of the same prime and equate the indices: 8^x = 2^{3x}, so 3x = 12.',
    ['indices', 'equations'],
    { variant: 'solve', b: big, target: [a, k] },
  );
}

function fractionalIndex(rng: RNG): Generated | null {
  // big^(u/v) [×|÷] a^n = a^k  with big = a^j and j·u/v an integer
  const [a, big, j] = rng.pick(PRIME_POWERS.filter(([, , jj]) => jj !== 5));
  const v = j === 2 ? 2 : j === 3 ? 3 : rng.pick([2, 4]);
  const u = rng.pick([-3, -2, -1, 1, 2, 3, 5].filter((uu) => gcd(Math.abs(uu), v) === 1));
  const e1 = (j * u) / v;
  if (!Number.isInteger(e1)) return null;
  const n = rng.pick([-4, -3, -2, -1, 1, 2, 3, 4, 5]);
  const divide = rng.bool(0.4);
  const k = divide ? e1 - n : e1 + n;
  const ans = E(k);
  const must = cleanOnly([
    { value: E(divide ? -e1 - n : -e1 + n), trap: 'sign of the fractional-index term' },
    { value: E(divide ? e1 + n : e1 - n), trap: divide ? 'added the indices when dividing' : 'subtracted the indices when multiplying' },
  ]);
  const extra = cleanOnly([
    { value: E(divide ? j * u * v - n : j * u * v + n), trap: `multiplied by ${v} instead of dividing (misread the fractional index)` },
    { value: Number.isInteger(j * v / u) ? E(divide ? (j * v) / u - n : (j * v) / u + n) : null, trap: 'inverted the fractional index' },
    { value: E(divide ? e1 + n : e1 * n), trap: divide ? 'added the indices when dividing' : 'multiplied the indices' },
    { value: E(-k), trap: 'overall sign error' },
    { value: E(k + 1), trap: 'arithmetic slip' },
    { value: E(k - 1), trap: 'arithmetic slip' },
  ]);
  const expr = `${pwFrac(big, u, v)} ${divide ? '\\div' : '\\times'} ${pw(a, n)}`;
  return pack(rng, `Given that $${expr} = ${pw(a, 'k')}$, find the value of $k$.`, ans, ranked(rng, ans, must, extra),
    `$${big} = ${pw(a, j)}$, so $${pwFrac(big, u, v)} = ${pw(a, e1)}$; then $k = ${e1} ${divide ? '-' : '+'} ${n < 0 ? `(${n})` : n} = ${k}$.`,
    'A fractional index is a root: 9^{1/2} = 3 = 3^1; convert to the prime base first, then add or subtract indices keeping every sign.',
    ['indices', 'fractional-index', 'negative-index'],
    { variant: 'k', base: a, num: [{ b: big, e: u / v }, ...(divide ? [] : [{ b: a, e: n }])], den: divide ? [{ b: a, e: n }] : [] },
  );
}

function writeAsPower(rng: RNG): Generated | null {
  const a = rng.pick([2, 3, 5]);
  const form = rng.pick(['recip', 'recip', 'sqrt', 'recip-sqrt', 'decimal']);
  let k: Exact;
  let shown: string;
  let params: Record<string, unknown>;
  let solution: string;
  if (form === 'recip') {
    const e = rng.int(2, a === 2 ? 5 : 3);
    k = E(-e);
    shown = `\\frac{1}{${a ** e}}`;
    params = { variant: 'power-of', base: a, form, n: a ** e };
    solution = `$${shown} = \\frac{1}{${pw(a, e)}} = ${pw(a, -e)}$, so $k = ${-e}$.`;
  } else if (form === 'sqrt') {
    const e = rng.pick(a === 2 ? [3, 5, 7] : [3, 5]);
    k = frac(e, 2);
    shown = `\\sqrt{${a ** e}}`;
    params = { variant: 'power-of', base: a, form, n: a ** e };
    solution = `$${shown} = (${pw(a, e)})^{1/2} = ${pw(a, k.toLatex(FR))}$, so $k = ${k.toLatex(FR)}$.`;
  } else if (form === 'recip-sqrt') {
    const e = rng.pick([1, 3]);
    k = frac(-e, 2);
    shown = `\\frac{1}{\\sqrt{${a ** e}}}`;
    params = { variant: 'power-of', base: a, form, n: a ** e };
    solution = `$${shown} = (${pw(a, e)})^{-1/2} = ${pw(a, k.toLatex(FR))}$, so $k = ${k.toLatex(FR)}$.`;
  } else {
    const opts: Record<number, [string, number][]> = { 2: [['0.5', -1], ['0.25', -2], ['0.125', -3]], 5: [['0.2', -1], ['0.04', -2]], 3: [] };
    if (opts[a].length === 0) return null;
    const [s, e] = rng.pick(opts[a]);
    k = E(e);
    shown = s;
    params = { variant: 'power-of', base: a, form, s };
    solution = `$${shown} = \\frac{1}{${a ** -e}} = ${pw(a, e)}$, so $k = ${e}$.`;
  }
  const kn = k.toNumber();
  const must = cleanOnly([
    { value: k.neg(), trap: 'sign of the index' },
  ]);
  const extra = cleanOnly([
    { value: k.isInteger() ? frac(1, kn) : k.inv(), trap: 'inverted the index' },
    { value: k.add(E(1)), trap: 'off by one' },
    { value: k.sub(E(1)), trap: 'off by one' },
    { value: k.mulRat(2), trap: 'doubled the index (root taken as a square)' },
    { value: k.mulRat(frac(1, 2).toRat()), trap: 'halved the index' },
  ]);
  return pack(rng, `Write $${shown}$ in the form $${pw(a, 'k')}$. Find $k$.`, k, ranked(rng, k, must, extra),
    solution,
    'A reciprocal gives a negative index and a root gives a fractional one: 1/8 = 2^{-3}, √32 = 2^{5/2}, 1/√2 = 2^{-1/2}.',
    ['indices', 'negative-index', 'fractional-index'],
    params,
  );
}

// ---------------------------------------------------------------------------
// Level 4: single power of a in terms of n (choice)
// ---------------------------------------------------------------------------

/** c1·n + c0 as an exponent string: "2n+3", "n-3", "3-n", "3", "-2n". */
function linTex(c1: number, c0: number): string {
  if (c1 === 0) return `${c0}`;
  const nPart = c1 === 1 ? 'n' : c1 === -1 ? '-n' : `${c1}n`;
  if (c0 === 0) return nPart;
  if (c1 < 0 && c0 > 0) return `${c0}${nPart}`; // "3-n", "3-2n"
  return `${nPart}${c0 > 0 ? '+' : '-'}${Math.abs(c0)}`;
}

/** Parse the exponent produced by linTex back into (c1, c0); null if it is not that shape. */
function parseLin(s: string): [number, number] | null {
  const t = s.replace(/\s+/g, '');
  let m = /^(-?\d+)$/.exec(t);
  if (m) return [0, Number(m[1])];
  m = /^(-?\d*)n(?:([+-]\d+))?$/.exec(t);
  if (m) return [m[1] === '' ? 1 : m[1] === '-' ? -1 : Number(m[1]), m[2] ? Number(m[2]) : 0];
  m = /^(-?\d+)([+-]\d*)n$/.exec(t);
  if (m) return [m[2] === '+' ? 1 : m[2] === '-' ? -1 : Number(m[2]), Number(m[1])];
  return null;
}

function simplifyInN(rng: RNG): Generated | null {
  const a = rng.pick([2, 2, 3]);
  const p = rng.pick([2, 3]); // (a^n)^p
  const q = rng.pick([1, 2, 3]); // divided by (a^q)^n written as a^n, 4^n / 8^n (or 9^n / 27^n)
  const c = rng.int(2, 5); // × a^c, written as a number (4, 8, 16, 32 or 9, 27, 81, 243)
  const c1 = p - q, c0 = c;
  const numerConst = a ** c;
  const denBase = a ** q;
  const denTex = q === 1 ? pw(a, 'n') : pw(denBase, 'n');
  const expr = `\\frac{(${pw(a, 'n')})^{${p}} \\times ${numerConst}}{${denTex}}`;
  const correct = `$${pw(a, linTex(c1, c0))}$`;
  const cands: { c: [number, number]; trap: string }[] = [
    { c: [1 - q, p + c], trap: 'added the indices when raising a power to a power' },
    { c: [p * c - q, 0], trap: 'multiplied the indices when multiplying' },
    { c: [q - p, -c], trap: 'subtracted the numerator index from the denominator index' },
    { c: [p - 1, c - q], trap: q === 1 ? 'arithmetic slip' : `wrote ${pw(denBase, 'n')} as ${pw(a, `n+${q}`)} instead of ${pw(a, `${q}n`)}` },
    { c: [p - 1, c], trap: `treated ${pw(denBase, 'n')} as ${pw(a, 'n')}` },
    { c: [p + q, c], trap: 'added the indices when dividing' },
    { c: [p - q, c + 1], trap: 'arithmetic slip in the constant' },
    { c: [p - q, numerConst], trap: `used ${numerConst} itself as the index instead of writing ${numerConst} as a power of ${a}` },
  ];
  const wrong: { display: string; trap: string }[] = [];
  const seen = new Set([correct]);
  for (const w of rng.shuffle(cands)) {
    const d = `$${pw(a, linTex(w.c[0], w.c[1]))}$`;
    if (seen.has(d)) continue;
    seen.add(d);
    wrong.push({ display: d, trap: w.trap });
    if (wrong.length >= 5) break;
  }
  if (wrong.length < 4) return null;
  return {
    stem: `Which of the following is equal to $${expr}$ for all positive integers $n$?`,
    answer: { kind: 'choice', value: correct },
    options: buildChoiceOptions(rng, correct, wrong),
    solution: `$(${pw(a, 'n')})^{${p}} = ${pw(a, `${p}n`)}$, $${numerConst} = ${pw(a, c)}$ and $${denTex} = ${pw(a, q === 1 ? 'n' : `${q}n`)}$, so the index is $${p}n + ${c} - ${q === 1 ? 'n' : `${q}n`} = ${linTex(c1, c0)}$.`,
    trap: 'Write every factor as a power of the same base first (8 = 2³, 4^n = 2^{2n}); then powers of powers multiply the indices, products add them and quotients subtract them.',
    tags: ['indices', 'algebraic-indices', 'simplify'],
    params: { variant: 'in-n', base: a, p, q, c },
    typedAllowed: false,
  };
}

// ---------------------------------------------------------------------------
// Level 5: exponential equations
// ---------------------------------------------------------------------------

function factorOut(rng: RNG): Generated | null {
  // b^(x+a) ± b^x = N
  const b = rng.pick([2, 2, 3, 5]);
  const a = rng.pick(b === 5 ? [1] : b === 3 ? [1, 2] : [1, 2, 3]); // keeps the common factor b^a ± 1 at most 10
  const x = rng.int(1, b === 2 ? 5 : b === 3 ? 4 : 3);
  const plus = rng.bool(0.35);
  const factor = plus ? b ** a + 1 : b ** a - 1;
  if (factor === 1 && !plus) return null; // 2^(x+1) − 2^x = 2^x is too bare
  const N = b ** x * factor;
  if (N > 1500) return null;
  const ans = E(x);
  const must = cleanOnly([
    { value: E(x + a), trap: `gave the index of the larger power, ${pw(b, 'x+' + a)}` },
  ]);
  const extra = cleanOnly([
    { value: E(x - 1), trap: 'arithmetic slip of one' },
    { value: E(x + 1), trap: 'arithmetic slip of one' },
    { value: E(a), trap: `gave the shift ${a}` },
    { value: E(2 * x), trap: 'doubled the index' },
    { value: E(x + 2 * a), trap: `counted the shift of ${a} twice` },
    { value: E(factor), trap: `gave the common factor ${factor}` },
  ]);
  const sign = plus ? '+' : '-';
  return pack(rng, `Solve $${pw(b, `x+${a}`)} ${sign} ${pw(b, 'x')} = ${N}$.`, ans, ranked(rng, ans, must, extra),
    `Factorise: $${pw(b, 'x')}(${pw(b, a)} ${sign} 1) = ${factor} \\times ${pw(b, 'x')} = ${N}$, so $${pw(b, 'x')} = ${b ** x} = ${pw(b, x)}$ and $x = ${x}$.`,
    'Take out the common factor b^x: b^{x+a} ± b^x = b^x (b^a ± 1); the powers cannot be combined by subtracting indices.',
    ['indices', 'equations', 'factorise'],
    { variant: 'factor', b, a, N, plus },
  );
}

function bothSides(rng: RNG): Generated | null {
  // b^(p x + c) = (b^j)^(q x + d)  ⇒  p x + c = j (q x + d)
  const [b, big, j] = rng.pick(PRIME_POWERS.filter(([, B]) => B <= 27));
  const p = rng.int(1, 4), q = rng.pick([1, 1, 2]);
  const c = rng.int(-3, 3), d = rng.int(-3, 3);
  const denom = p - j * q;
  if (denom === 0 || (p === q && c === d)) return null; // no identical brackets on both sides
  const xr = frac(j * d - c, denom);
  if (!isCleanExact(xr).ok || xr.toRat().d > 2n || Math.abs(xr.toNumber()) > 6 || xr.isZero()) return null;
  const lin = (m: number, k: number, v = 'x'): string => {
    const first = m === 1 ? v : m === -1 ? `-${v}` : `${m}${v}`;
    return k === 0 ? first : `${first} ${k > 0 ? '+' : '-'} ${Math.abs(k)}`;
  };
  const ans = xr;
  const must = cleanOnly([
    { value: denom !== 0 && p - q !== 0 ? frac(d - c, p - q) : null, trap: `forgot to multiply the whole bracket by ${j}: solved ${lin(p, c)} = ${lin(q, d)}` },
    { value: p - j * q !== 0 ? frac(d - c, p - j * q) : null, trap: `multiplied only the $x$ term by ${j}` },
  ]);
  const extra = cleanOnly([
    { value: p - q !== 0 ? frac(d + j - c, p - q) : null, trap: `added ${j} instead of multiplying by it` },
    { value: ans.neg(), trap: 'sign error' },
    { value: frac(j * d + c, denom), trap: `sign slip with the constant ${c}` },
    { value: ans.add(E(1)), trap: 'arithmetic slip of one' },
    { value: ans.sub(E(1)), trap: 'arithmetic slip of one' },
  ]);
  const lhs = pw(b, lin(p, c)), rhs = pw(big, lin(q, d));
  return pack(rng, `Solve $${lhs} = ${rhs}$.`, ans, ranked(rng, ans, must, extra),
    `$${big} = ${pw(b, j)}$, so the right-hand side is $${pw(b, `${j}(${lin(q, d)})`)}$. Equating indices: $${lin(p, c)} = ${lin(j * q, j * d)}$, giving $x = ${ans.toLatex(FR)}$.`,
    'Write both sides with the same base and multiply the whole index in the bracket by the conversion power: 27^{x−1} = 3^{3(x−1)} = 3^{3x−3}.',
    ['indices', 'equations', 'common-base'],
    { variant: 'both', b, p, c, big, q, d },
  );
}

// ---------------------------------------------------------------------------

export default defineTemplate({
  id: 'm1.indices-logs.index-laws',
  module: 'M1',
  topic: 'indices-logs',
  title: 'Index laws',
  levels: {
    1: '2^3 × 2^4 = 2^k, 5^7 ÷ 5^2 = 5^k',
    2: '(2^3)^4, 2^3 × 4^2 = 2^k, expressions equal to a^0',
    3: '8^x = 2^12, 9^(1/2) × 3^4 = 3^k, 1/8 and √32 as powers of 2',
    4: 'simplify (2^n)² × 8 / 4^n as 2^{…} (choice)',
    5: 'solve 2^(x+2) − 2^x = 24, 3^(2x) = 27^(x−1)',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return pickVariant(rng, [sameBase]);
        case 2: return pickVariant(rng, [powerOfPower, mixedBase, mixedBase, collapses]);
        case 3: return pickVariant(rng, [solvePower, fractionalIndex, writeAsPower]);
        case 4: return pickVariant(rng, [simplifyInN]);
        default: return pickVariant(rng, [factorOut, bothSides]);
      }
    });
  },
  verify(q) {
    const P = q.params as Record<string, unknown>;
    const variant = P.variant as string;
    const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
    type F = { b: number; e: number };
    const value = (num: F[], den: F[]) => num.reduce((p, f) => p * Math.pow(f.b, f.e), 1) / den.reduce((p, f) => p * Math.pow(f.b, f.e), 1);
    if (variant === 'in-n') {
      if (q.answer.kind !== 'choice') return false;
      const { base, p, q: qq, c } = P as { base: number; p: number; q: number; c: number };
      const m = /^\$(\d+)\^\{(.*)\}\$$/.exec(q.answer.value);
      if (!m || Number(m[1]) !== base) return false;
      const lin = parseLin(m[2]);
      if (!lin) return false;
      // numerically identical for n = 1, 2, 3
      for (const n of [1, 2, 3]) {
        const lhs = (Math.pow(Math.pow(base, n), p) * Math.pow(base, c)) / Math.pow(Math.pow(base, qq), n);
        if (!close(lhs, Math.pow(base, lin[0] * n + lin[1]))) return false;
      }
      return true;
    }
    if (q.answer.kind !== 'exact') return false;
    const got = q.answer.value.toNumber();
    switch (variant) {
      case 'k': {
        const { base, num, den } = P as { base: number; num: F[]; den: F[] };
        return close(value(num, den), Math.pow(base, got));
      }
      case 'value': {
        const { num, den } = P as { num: F[]; den: F[] };
        return close(value(num, den), got);
      }
      case 'solve': {
        const { b, target } = P as { b: number; target: [number, number] };
        return close(Math.pow(b, got), Math.pow(target[0], target[1]));
      }
      case 'power-of': {
        const { base, form, n, s } = P as { base: number; form: string; n?: number; s?: string };
        const v = form === 'recip' ? 1 / n! : form === 'sqrt' ? Math.sqrt(n!) : form === 'recip-sqrt' ? 1 / Math.sqrt(n!) : parseFloat(s!);
        return close(Math.pow(base, got), v);
      }
      case 'factor': {
        const { b, a, N, plus } = P as { b: number; a: number; N: number; plus: boolean };
        const lhs = Math.pow(b, got + a) + (plus ? 1 : -1) * Math.pow(b, got);
        return close(lhs, N);
      }
      case 'both': {
        const { b, p, c, big, q: qq, d } = P as { b: number; p: number; c: number; big: number; q: number; d: number };
        return close(Math.pow(b, p * got + c), Math.pow(big, qq * got + d));
      }
      default: return false;
    }
  },
});
