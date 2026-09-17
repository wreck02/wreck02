import { defineTemplate, retry, type Level, type Generated } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import type { RNG } from '../../core/rng';

/**
 * Percentage change and reverse percentages. Answers are plain numbers: a percentage
 * when the stem asks for one, pounds when the stem says £.
 * Level 1: x% of N (15% of 80)
 * Level 2: increase / decrease N by x% (60 increased by 25%)
 * Level 3: percentage change between two values (80 → 100 is +25%)
 * Level 4: reverse percentage (after a 20% rise the price is £72; original?)
 * Level 5: successive changes: overall % change, final value, or the original before two changes
 *
 * Every answer is a whole number, so every option is a whole number too (the one exception is the
 * level-3 "divided by the new value" trap, which may genuinely come out as a half such as 37.5).
 * The headline trap of a level is guaranteed a slot; parameters that cannot supply four distinct
 * mistake-based options are redrawn rather than padded.
 */

const PCTS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 75, 80, 90];
const BASES = [20, 40, 60, 80, 120, 140, 160, 180, 200, 240, 300, 320, 360, 400, 450, 500, 600, 640, 800, 1200];

/** p% of n is a whole number. */
const wholePct = (p: number, n: number) => (p * n) % 100 === 0;

/** Thousands separator inside maths mode for populations (23\,000). */
const thou = (n: number) => (Math.abs(n) >= 10000 ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\\,') : String(n));

interface KeepOpts {
  halves?: boolean;
  negative?: boolean;
  zero?: boolean;
  /** Hard upper bound (exclusive): a percentage decrease can never reach 100. */
  max?: number;
  /** Values the stem already prints: an option equal to one of them reads as a typo, not a mistake. */
  exclude?: number[];
}

/** Keep clean, finite, whole-number (optionally half) distractors, de-duplicated; positive unless asked otherwise. */
function keep(cands: { value: Exact | null; trap: string }[], opts: KeepOpts = {}): Distractor[] {
  const out: Distractor[] = [];
  for (const c of cands) {
    const v = c.value;
    if (!v || !v.isRational() || !Number.isFinite(v.toNumber())) continue;
    if (v.isZero() && !opts.zero) continue;
    if (v.sign() < 0 && !opts.negative) continue;
    if (opts.max !== undefined && v.toNumber() >= opts.max) continue;
    if (opts.exclude?.some((x) => Math.abs(v.toNumber() - x) < 1e-9)) continue;
    if (!isCleanExact(v).ok) continue;
    const d = v.toRat().d;
    if (!(d === 1n || (opts.halves && d === 2n))) continue;
    if (out.some((o) => o.value.equals(v))) continue;
    out.push({ value: v, trap: c.trap });
  }
  return out;
}

function tryE(f: () => Exact): Exact | null {
  try { return f(); } catch { return null; }
}

/**
 * The four wrong options, with a *randomly drawn number of them below the answer*.
 *
 * One headline (`must`) trap is guaranteed a slot; the rest are drawn from `others` first and only
 * then from `weak`. The side split is decided before any of them is seated: filling greedily instead
 * pinned the answer's rank, because the surviving mistakes at a level nearly all pull the same way
 * (at level 3 almost every one overshoots the percentage), so "take the second smallest" scored
 * without any arithmetic. All four are distinct from each other and from the answer; null (→ redraw)
 * if four cannot be found.
 */
function assemble(rng: RNG, ans: Exact, must: Distractor[], others: Distractor[], weak: Distractor[] = [], total = 4): Distractor[] | null {
  const seen: Exact[] = [ans];
  const pool: (Distractor & { tier: number })[] = [];
  const add = (d: Distractor, tier: number) => {
    if (seen.some((s) => s.equals(d.value))) return;
    seen.push(d.value);
    pool.push({ ...d, tier });
  };
  for (const d of must) add(d, 0);
  for (const d of rng.shuffle(others)) add(d, 1);
  for (const d of rng.shuffle(weak)) add(d, 2);
  if (pool.length < total) return null;
  const forced = pool.filter((d) => d.tier === 0).slice(0, 1);
  // stable sort: the tiers keep their priority, the shuffle inside each tier keeps its order
  const rest = pool.filter((d) => !forced.includes(d)).sort((x, y) => x.tier - y.tier);
  const below = rest.filter((d) => d.value.cmp(ans) < 0);
  const above = rest.filter((d) => d.value.cmp(ans) > 0);
  const need = total - forced.length;
  const fBelow = forced.filter((d) => d.value.cmp(ans) < 0).length;
  // r is how many options end up below the answer, i.e. the answer's rank in the sorted list.
  const lo = fBelow + Math.max(0, need - above.length);
  const hi = fBelow + Math.min(need, below.length);
  if (lo > hi) return [...forced, ...rest].slice(0, total);
  const r = rng.int(lo, hi);
  return [...forced, ...below.slice(0, r - fBelow), ...above.slice(0, need - (r - fBelow))];
}

/** Multiplier for a signed percentage change, exactly: (100 + p)/100. */
const mult = (p: number) => frac(100 + p, 100);
/** Multiplier as a short decimal for display. */
const multStr = (p: number) => mult(p).toLatex({ format: 'decimal' });

function pack(rng: RNG, stem: string, ans: Exact, ds: Distractor[] | null, solution: string, trap: string, tags: string[], params: Record<string, unknown>): Generated | null {
  if (!ds) return null;
  return {
    stem,
    answer: { kind: 'exact' as const, value: ans, format: 'decimal' as const },
    options: buildOptions(rng, ans, ds, { format: 'decimal' }),
    solution,
    trap,
    tags,
    params,
    typedAllowed: true,
  };
}

// ---------------------------------------------------------------------------
// Level 1: p% of N
// ---------------------------------------------------------------------------
function percentOf(rng: RNG): Generated | null {
  const p = rng.pick(PCTS);
  const N = rng.pick(BASES.filter((n) => n <= 800));
  if (!wholePct(p, N)) return null;
  const ans = E((p * N) / 100);
  if (ans.toNumber() < 5) return null;
  const ds = keep([
    { value: ans.mulRat(10), trap: 'decimal point slip: used p/10 instead of p/100' },
    { value: ans.mulRat(frac(1, 10).toRat()), trap: 'decimal point slip: used p/1000 instead of p/100' },
    { value: E(N).sub(ans), trap: 'found what is left after taking p% off' },
    { value: E(N).add(ans), trap: 'increased N by p% instead of finding p% of it' },
    { value: N % p === 0 ? E(N / p) : null, trap: 'divided N by p' },
    { value: E(((p + 10) * N) / 100), trap: 'misread the percentage as (p + 10)%' },
    { value: p > 10 ? E(((p - 10) * N) / 100) : null, trap: 'misread the percentage as (p − 10)%' },
    // Two mistakes that stop short of the answer, so the list is not all over-estimates.
    { value: E(N / 10), trap: 'stopped at 10% instead of scaling it up to p%' },
    { value: E(N / 100), trap: 'found 1% of N and stopped' },
    // An option equal to N itself is a free elimination: it is the number the stem prints, and the
    // p = 10 decimal-point slip lands exactly on it.
  ], { exclude: [N] });
  // fastest route: 10% then scale, or a known fraction
  const tenth = N / 10;
  let route: string;
  if (p === 5) route = `$10\\%$ of $${N}$ is $${tenth}$, so $5\\%$ is half of that: $${ans.toLatex()}$.`;
  else if (p === 10) route = `$10\\%$ is one tenth: $${N} \\div 10 = ${ans.toLatex()}$.`;
  else if (p % 10 === 0) route = `$10\\%$ of $${N}$ is $${tenth}$, so $${p}\\%$ is $${p / 10} \\times ${tenth} = ${ans.toLatex()}$.`;
  else if (p === 25) route = `$25\\% = \\tfrac14$, so the answer is $${N} \\div 4 = ${ans.toLatex()}$.`;
  else if (p === 75) route = `$75\\% = \\tfrac34$: $${N} \\div 4 = ${N / 4}$, times $3$ is $${ans.toLatex()}$.`;
  else route = `$10\\%$ of $${N}$ is $${tenth}$ and $5\\%$ is $${tenth / 2}$, so $${p}\\% = ${Math.floor(p / 10)} \\times ${tenth} + ${tenth / 2} = ${ans.toLatex()}$.`;
  return pack(rng,
    `Find $${p}\\%$ of $${N}$.`, ans, assemble(rng, ans, [], ds), route,
    'Build the percentage from 10% and 5% (or a known fraction such as 25% = ¼); keep track of the decimal point.',
    ['percentage', 'percent-of'],
    { variant: 'of', p, N },
  );
}

// ---------------------------------------------------------------------------
// Level 2: increase / decrease by p%
// ---------------------------------------------------------------------------
function applyChange(rng: RNG): Generated | null {
  const p = rng.pick(PCTS);
  const context = rng.pick(['plain', 'price', 'population']);
  const N = rng.pick(BASES) * (context === 'population' ? 10 : 1);
  if (!wholePct(p, N)) return null;
  const up = rng.bool();
  const sp = up ? p : -p;
  const change = (p * N) / 100;
  const ans = E(N + (up ? change : -change));
  const ds = keep([
    { value: E(N - (up ? change : -change)), trap: up ? 'decreased instead of increased' : 'increased instead of decreased' },
    { value: E(change), trap: 'found the change, not the new value' },
    { value: E(N + sp), trap: `${up ? 'added' : 'subtracted'} ${p} rather than ${p}%` },
    // The ×10 slip only while it still reads as a possible new value: "increase 300 by 50%" cannot
    // plausibly be 1800, which is a 500% increase and is struck out without any arithmetic.
    { value: Math.abs(N + (up ? change : -change) * 10) <= 2.5 * N ? E(N + (up ? change : -change) * 10) : null, trap: 'decimal point slip in the percentage' },
    { value: E(N + (up ? change : -change) / 10), trap: 'decimal point slip in the percentage' },
    { value: E(N).div(mult(sp)), trap: 'divided by the multiplier instead of multiplying' },
    { value: E(N).mul(mult(sp)).mul(mult(sp)), trap: 'applied the change twice' },
  ]);
  const weak = keep([{ value: E(100 + sp), trap: 'gave the multiplier as a percentage instead of the new value' }], { exclude: [N] });
  let stem: string;
  if (context === 'plain') stem = `${up ? 'Increase' : 'Decrease'} $${N}$ by $${p}\\%$.`;
  else if (context === 'price') stem = up
    ? `The price of a bicycle is £${N}. The price is increased by $${p}\\%$. Find the new price in pounds.`
    : `A coat normally costs £${N}. In a sale its price is reduced by $${p}\\%$. Find the sale price in pounds.`;
  else stem = `The population of a village is $${thou(N)}$. Over ten years it ${up ? 'grows' : 'falls'} by $${p}\\%$. Find the new population.`;
  const solution = `$${p}\\%$ of $${thou(N)}$ is $${thou(change)}$, so the new value is $${thou(N)} ${up ? '+' : '-'} ${thou(change)} = ${thou(ans.toNumber())}$ (equivalently $${thou(N)} \\times ${multStr(sp)} = ${thou(ans.toNumber())}$).`;
  return pack(rng, stem, ans, assemble(rng, ans, [], ds, weak), solution,
    `A ${p}% ${up ? 'increase' : 'decrease'} multiplies by ${multStr(sp)}; the question asks for the new value, not the change.`,
    ['percentage', up ? 'increase' : 'decrease', 'multiplier'],
    { variant: 'apply', p, N, up, context },
  );
}

// ---------------------------------------------------------------------------
// Level 3: percentage change from A to B
// ---------------------------------------------------------------------------
const CHANGE_BASES = [20, 25, 40, 50, 60, 80, 100, 120, 150, 160, 200, 240, 250, 300, 400, 500, 600, 800];

function percentChange(rng: RNG): Generated | null {
  const up = rng.bool();
  // For an increase, the percentages are the ones whose headline trap — dividing the change by the
  // NEW value, i.e. 100p/(100 + p) — is itself an exam number (an integer or a half).
  //
  // A decrease is a part of the original that has gone, so it can never reach 100%: every option is
  // capped below 100 and anything above it would be struck out on sight. That rules out the same
  // headline trap (100p/(100 − p) is over 100 for every p above 50), the raw change when it is large,
  // and 100A/B. The headline trap for a decrease is therefore the other classic misreading: quoting
  // the new value as a percentage of the original (100 − p) instead of the drop.
  const p = up
    ? rng.weighted([25, 60, 100, 150, 300], [4, 2, 3, 3, 1])
    : rng.weighted([20, 25, 30, 40, 60, 75, 80], [4, 3, 3, 3, 2, 2, 1]);
  const A = rng.pick(CHANGE_BASES);
  if (!wholePct(p, A)) return null;
  const diff = (p * A) / 100;
  const B = up ? A + diff : A - diff;
  if (B < 10) return null;
  const ans = E(p);
  const bounds: KeepOpts = up ? { halves: true } : { halves: true, max: 100 };
  const must = keep([up
    ? { value: frac(100 * diff, B), trap: 'divided the change by the new value instead of the original' }
    : { value: frac(100 * B, A), trap: 'gave the new value as a percentage of the original, not the size of the drop' },
  ], bounds);
  if (must.length === 0) return null;
  const others = keep([
    { value: E(diff), trap: 'gave the actual change, not the percentage' },
    { value: frac(100 * B, A), trap: 'expressed the new value as a percentage of the original' },
    { value: frac(100 * A, B), trap: 'expressed the original as a percentage of the new value' },
    { value: frac(100 * diff, B), trap: 'divided the change by the new value instead of the original' },
    // Below the answer whatever the direction, so the list is not all over-estimates.
    { value: frac(10 * diff, A), trap: 'multiplied the fraction by 10 instead of by 100' },
  ], bounds);
  const weak = keep([
    { value: E(2 * p), trap: 'doubled the percentage' },
    { value: E(p / 2), trap: 'halved the percentage' },
  ], bounds);
  const ctx = rng.pick([
    (a: number, b: number) => `The price of a ticket ${up ? 'rises' : 'falls'} from £${a} to £${b}.`,
    (a: number, b: number) => `A company's workforce ${up ? 'grows' : 'shrinks'} from $${a}$ to $${b}$ employees.`,
    (a: number, b: number) => `The mass of a sample ${up ? 'increases' : 'decreases'} from $${a}$ g to $${b}$ g.`,
    (a: number, b: number) => `The number of members of a club ${up ? 'rises' : 'falls'} from $${a}$ to $${b}$.`,
  ]);
  const stem = `${ctx(A, B)} Find the percentage ${up ? 'increase' : 'decrease'}.`;
  const solution = `Percentage change $= \\dfrac{\\text{change}}{\\text{original}} \\times 100 = \\dfrac{${diff}}{${A}} \\times 100 = ${p}$.`;
  return pack(rng, stem, ans, assemble(rng, ans, must, others, weak), solution,
    'Percentage change is always measured against the original value, not the new one.',
    ['percentage', 'percentage-change'],
    { variant: 'change', A, B, up },
  );
}

// ---------------------------------------------------------------------------
// Level 4: reverse percentage
// ---------------------------------------------------------------------------
function reverse(rng: RNG): Generated | null {
  const up = rng.bool();
  const ctx = rng.pick(up ? ['price', 'population'] : ['price', 'sale', 'population']);
  const base = rng.pick([20, 30, 40, 50, 60, 80, 120, 150, 160, 200, 240, 250, 300, 400, 500, 600, 800, 1200]);
  const O = ctx === 'population' ? base * 100 : base; // towns have tens of thousands of people, not 23
  const p = rng.pick([5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 80]);
  if (!wholePct(p, O)) return null;
  const sp = up ? p : -p;
  const newV = O + (sp * O) / 100;
  const ans = E(O);
  // The headline trap (take p% off / add p% to the NEW value) must itself be a whole number.
  const key = E(newV).mul(mult(-sp));
  if (!key.isInteger()) return null;
  const must = keep([{ value: key, trap: up ? `took ${p}% off the new value instead of dividing by ${multStr(sp)}` : `added ${p}% to the new value instead of dividing by ${multStr(sp)}` }]);
  const others = keep([
    { value: E(newV).div(mult(-sp)), trap: `divided by ${multStr(-sp)} instead of ${multStr(sp)}` },
    { value: E(newV).mul(mult(sp)), trap: 'applied the change again instead of undoing it' },
    { value: E(Math.abs(newV - O)), trap: 'gave the size of the change, not the original' },
    // Only while p is a visible fraction of the new value: "35 950" against a stated 36 000 reads as
    // a typo rather than as a mistake, and it is struck out on sight.
    { value: newV <= 10 * p ? E(newV - sp) : null, trap: `${up ? 'subtracted' : 'added'} ${p} rather than undoing ${p}%` },
    { value: E(newV).mul(frac(p, 100)), trap: `found ${p}% of the new value` },
    // Capped at five times the answer: for p = 5 this is twenty times the new value, and a town of
    // 1.52 million after a 5% fall from 80 000 is eliminated without any arithmetic.
    { value: 100 * newV <= 5 * p * O ? E(newV).mul(frac(100, p)) : null, trap: `treated the new value as ${p}% of the original` },
  ]);
  let stem: string;
  if (ctx === 'sale') stem = `In a sale all prices are reduced by $${p}\\%$. The sale price of a jacket is £${newV}. Find its original price in pounds.`;
  else if (ctx === 'population') stem = `After ${up ? 'an increase' : 'a decrease'} of $${p}\\%$, the population of a town is $${thou(newV)}$. Find the original population.`;
  else stem = `After a $${p}\\%$ ${up ? 'rise' : 'fall'} the price of a ticket is £${newV}. Find the original price in pounds.`;
  const solution = `The new value is $${100 + sp}\\%$ of the original, so original $= ${thou(newV)} \\div ${multStr(sp)} = ${thou(O)}$. (Check: $${thou(O)} \\times ${multStr(sp)} = ${thou(newV)}$.)`;
  return pack(rng, stem, ans, assemble(rng, ans, must, others), solution,
    `The new value is ${100 + sp}% of the original: divide by ${multStr(sp)}. Taking ${p}% off (or adding ${p}% to) the new value is wrong.`,
    ['percentage', 'reverse-percentage'],
    { variant: 'reverse', p, newV, up },
  );
}

// ---------------------------------------------------------------------------
// Level 5: successive changes
// ---------------------------------------------------------------------------
const SUCC_PCTS = [5, 10, 20, 25, 30, 40, 50, 60, 75];

function successive(rng: RNG): Generated | null {
  const a = rng.pick(SUCC_PCTS) * rng.sign();
  const b = rng.pick(SUCC_PCTS) * rng.sign();
  if (a === b) return null; // "−50% then −50%" collapses the traps
  if ((a * b) % 100 !== 0) return null; // overall change is a whole number of percent
  const overall = a + b + (a * b) / 100;
  if (overall === 0 || Math.abs(overall) > 150) return null;
  const variant = rng.pick(['overall', 'overall', 'final', 'reverse2']);
  const word = (x: number) => `${x > 0 ? 'increased' : 'decreased'} by $${Math.abs(x)}\\%$`;
  const dir = overall > 0 ? 'increase' : 'decrease';
  const mm = mult(a).mul(mult(b)); // overall multiplier, exact
  const mmStr = mm.toLatex({ format: 'decimal' });
  const sumStr = `${a} ${b >= 0 ? '+' : '-'} ${Math.abs(b)} ${(a * b) / 100 >= 0 ? '+' : '-'} ${Math.abs((a * b) / 100)} = ${overall}`;

  if (variant === 'overall') {
    const mixed = a * b < 0;
    if (mixed) {
      // One rise and one fall: deciding the direction of the net change is the substance of the
      // question, so the answer is a signed percentage and both directions appear among the options.
      const ans = E(overall);
      const signed = { negative: true, zero: true };
      const must = keep([
        { value: E(-overall), trap: 'right size, wrong direction' },
        { value: E(a + b), trap: 'added the two percentages' },
      ], signed);
      const others = keep([
        { value: E((a * b) / 100), trap: 'found a percentage of a percentage only' },
        { value: E(Math.abs(a) + Math.abs(b) + (Math.abs(a) * Math.abs(b)) / 100), trap: 'treated both changes as increases' },
        { value: E(-(Math.abs(a) + Math.abs(b)) + (Math.abs(a) * Math.abs(b)) / 100), trap: 'treated both changes as decreases' },
        { value: E(a), trap: 'ignored the second change' },
        { value: E(b), trap: 'ignored the first change' },
        { value: E(100 + overall), trap: 'gave the final value as a percentage of the original, not the change' },
      ], signed);
      const stem = `A quantity is ${word(a)} and then ${word(b)}. Find the overall percentage change, taking an increase as positive and a decrease as negative.`;
      const solution = `Multiply the multipliers: $${multStr(a)} \\times ${multStr(b)} = ${mmStr}$, an overall ${dir} of $${Math.abs(overall)}\\%$, i.e. a change of $${overall}\\%$. (Or $${sumStr}$.)`;
      return pack(rng, stem, ans, assemble(rng, ans, must, others), solution,
        'Successive percentage changes multiply their multipliers; the percentages never simply add, and the net direction must be worked out, not guessed.',
        ['percentage', 'successive-changes', 'multiplier'],
        { variant: 'overall', a, b, dir, signed: true },
      );
    }
    const ans = E(Math.abs(overall));
    const must = keep([{ value: E(Math.abs(a + b)), trap: 'added the two percentages' }]);
    const others = keep([
      { value: E(Math.abs(a - b)), trap: 'subtracted the percentages' },
      { value: E(Math.abs((a * b) / 100)), trap: 'found a percentage of a percentage only' },
      { value: E(Math.abs(a)), trap: 'ignored the second change' },
      { value: E(Math.abs(b)), trap: 'ignored the first change' },
      { value: E(100 + overall), trap: 'gave the final value as a percentage of the original, not the change' },
    ]);
    const stem = rng.bool()
      ? `A quantity is ${word(a)} and then ${word(b)}. Find the overall percentage ${dir}.`
      : `A price is ${word(a)} and then ${word(b)}. Find the single percentage ${dir} equivalent to the two changes.`;
    const solution = `Multiply the multipliers: $${multStr(a)} \\times ${multStr(b)} = ${mmStr}$, an overall ${dir} of $${Math.abs(overall)}\\%$. (Or $${sumStr}$.)`;
    return pack(rng, stem, ans, assemble(rng, ans, must, others), solution,
      'Successive percentage changes multiply their multipliers; the percentages themselves never simply add.',
      ['percentage', 'successive-changes', 'multiplier'],
      { variant: 'overall', a, b, dir, signed: false },
    );
  }

  const N = rng.pick([50, 80, 100, 120, 150, 160, 200, 240, 250, 300, 400, 500, 600, 800, 1000]);
  if ((N * (100 + a)) % 100 !== 0) return null;
  const mid = (N * (100 + a)) / 100;
  if ((mid * (100 + b)) % 100 !== 0) return null;
  const fin = (mid * (100 + b)) / 100;

  if (variant === 'final') {
    const ans = E(fin);
    const must = keep([{ value: E(N).mul(mult(a + b)), trap: 'added the percentages first' }]);
    const others = keep([
      { value: E(N).mul(mult(Math.abs(a))).mul(mult(Math.abs(b))), trap: 'treated both changes as increases' },
      { value: E(mid), trap: 'forgot the second change' },
      { value: E(N).mul(mult(b)), trap: 'forgot the first change' },
      { value: E(mid).add(E(N).mul(frac(b, 100))), trap: `took ${Math.abs(b)}% of the original amount rather than of the new amount` },
      { value: E(mid).mul(mult(-b)), trap: 'applied the second change in the wrong direction' },
      { value: E(N).mul(mult(-a)).mul(mult(b)), trap: 'applied the first change in the wrong direction' },
    ]);
    const stem = `A sum of £${N} is ${word(a)} and then ${word(b)}. Find the final amount in pounds.`;
    const solution = `£$${N} \\times ${multStr(a)} = ${mid}$, then $${mid} \\times ${multStr(b)} = ${fin}$. (Overall multiplier $${multStr(a)} \\times ${multStr(b)} = ${mmStr}$.)`;
    return pack(rng, stem, ans, assemble(rng, ans, must, others), solution,
      'Apply the second percentage to the new amount, not to the original: multiply the multipliers.',
      ['percentage', 'successive-changes', 'multiplier'],
      { variant: 'final', a, b, N },
    );
  }

  // reverse2: find the original before two changes
  const ans = E(N);
  const must = keep([{ value: E(fin).mul(mult(-a)).mul(mult(-b)), trap: 'undid each change by applying the opposite percentage instead of dividing' }]);
  const others = keep([
    { value: tryE(() => E(fin).div(mult(a + b))), trap: 'added the percentages first' },
    { value: E(fin).div(mult(a)), trap: 'undid only the first change' },
    { value: E(fin).div(mult(b)), trap: 'undid only the second change' },
    { value: E(fin).mul(mm), trap: 'applied the changes forwards instead of undoing them' },
    { value: E(fin).mul(mult(-a)), trap: 'undid only the first change, by applying the opposite percentage' },
    { value: E(fin).mul(mult(-b)), trap: 'undid only the second change, by applying the opposite percentage' },
  ]);
  const stem = `A price is ${word(a)} and then ${word(b)}. The final price is £${fin}. Find the original price in pounds.`;
  const solution = `Overall multiplier $${multStr(a)} \\times ${multStr(b)} = ${mmStr}$, so original $= ${fin} \\div ${mmStr} = ${N}$.`;
  return pack(rng, stem, ans, assemble(rng, ans, must, others), solution,
    'Undo percentage changes by dividing by the multipliers, never by applying the opposite percentage.',
    ['percentage', 'successive-changes', 'reverse-percentage'],
    { variant: 'reverse2', a, b, fin },
  );
}

export default defineTemplate({
  id: 'm1.ratio-percent.percentage-change',
  module: 'M1',
  topic: 'ratio-percent',
  title: 'Percentage change & reverse percentages',
  levels: {
    1: 'x% of N with clean numbers (15% of 80)',
    2: 'increase / decrease N by x% (60 increased by 25%)',
    3: 'percentage change between two values (80 → 100 is +25%)',
    4: 'reverse percentage (after a 20% rise the price is £72; original?)',
    5: 'successive changes: overall % change, final value, or original before two changes',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return percentOf(rng);
        case 2: return applyChange(rng);
        case 3: return percentChange(rng);
        case 4: return reverse(rng);
        default: return successive(rng);
      }
    });
  },
  verify(q) {
    // Each check goes the other way round from generate(): forward-apply the percentage in floating point.
    if (q.answer.kind !== 'exact') return false;
    const x = q.answer.value.toNumber();
    const P = q.params as Record<string, number | boolean | string>;
    const n = (k: string) => P[k] as number;
    const close = (u: number, v: number) => Math.abs(u - v) <= 1e-9 * Math.max(1, Math.abs(v));
    switch (P.variant) {
      case 'of': // x is p% of N  ⇔  x / N × 100 = p
        return close((x / n('N')) * 100, n('p'));
      case 'apply': // (x − N)/N × 100 = ±p
        return close(((x - n('N')) / n('N')) * 100, (P.up ? 1 : -1) * n('p'));
      case 'change': // forward check: A × (1 ± x/100) = B
        return close(n('A') * (1 + ((P.up ? 1 : -1) * x) / 100), n('B'));
      case 'reverse': // forward check: original × multiplier = new
        return close(x * (1 + ((P.up ? 1 : -1) * n('p')) / 100), n('newV'));
      case 'overall': // (1 + a/100)(1 + b/100) = 1 + x/100 (x signed) or 1 ± x/100 (x a size with a stated direction)
        return close((1 + n('a') / 100) * (1 + n('b') / 100), 1 + ((P.signed ? 1 : P.dir === 'increase' ? 1 : -1) * x) / 100);
      case 'final': // percentage change from N to x equals a + b + ab/100
        return close(((x - n('N')) / n('N')) * 100, n('a') + n('b') + (n('a') * n('b')) / 100);
      case 'reverse2': // forward check
        return close(x * (1 + n('a') / 100) * (1 + n('b') / 100), n('fin'));
      default:
        return false;
    }
  },
});
