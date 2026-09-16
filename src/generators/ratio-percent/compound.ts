import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import type { RNG } from '../../core/rng';

/**
 * Repeated percentage change. Answers are plain numbers: a percentage when the stem asks for one,
 * pounds when the stem says £, a number of years when it asks how many.
 * Level 1: overall change after two successive changes (10% then 10% up is 21%, not 20%)
 * Level 2: compound growth on a clean principal: £2000 at 20% for 2 years is 2000 × 1.2² = £2880
 * Level 3: depreciation: £500 losing 20% a year is £320 after 2 years
 * Level 4: a percentage of a percentage (30% of 40% = 12%), or a sale discount followed by VAT
 * Level 5: find the rate (200 → 242 after two equal increases ⇒ 10%), or the number of periods
 *
 * Wrong options are named mistakes: adding the percentages, applying the rate to the original each time
 * (simple interest), using 0.8 for an increase (or 1.2 for a decrease), halving the overall change to
 * get the rate, forgetting to subtract 100. Parameters that cannot supply four such options are redrawn.
 */

const DEC = { format: 'decimal' as const };
const dec = (x: Exact) => x.toLatex(DEC);
/** Multiplier for a signed percentage change, exactly. */
const mult = (p: number) => frac(100 + p, 100);
const mtex = (p: number) => dec(mult(p));

type Cand = { value: Exact | null; trap: string };

/** Positive, terminating, at most two decimal places and four significant figures. */
function tidy(v: Exact): boolean {
  if (!v.isRational() || !Number.isFinite(v.toNumber()) || v.sign() <= 0 || !isCleanExact(v).ok) return false;
  const r = v.toRat();
  return (r.d === 1n || r.d === 2n || r.d === 4n || r.d === 5n || r.d === 10n || r.d === 20n || r.d === 25n || r.d === 50n || r.d === 100n);
}

function keep(ds: Cand[]): Distractor[] {
  const out: Distractor[] = [];
  for (const d of ds) {
    const v = d.value;
    if (!v || !tidy(v)) continue;
    if (out.some((o) => o.value.equals(v))) continue;
    out.push({ value: v, trap: d.trap });
  }
  return out;
}

/**
 * Choose the distractors so that the answer is bracketed rather than always the biggest (or always the
 * second smallest): a random number of them is taken from below the answer and the rest from above.
 * Compound growth is the bad case — simple interest, one period short, the wrong multiplier and the
 * interest alone all undershoot, so "pick the largest" used to score 57%. No trap string is repeated.
 */
function spread(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], count = 4): Distractor[] {
  const seen: Exact[] = [answer];
  const traps = new Set<string>();
  const pool: Distractor[] = [];
  for (const d of [...must, ...rng.shuffle(extra)]) {
    if (!Number.isFinite(d.value.toNumber())) continue;
    if (seen.some((s) => s.equals(d.value))) continue;
    if (d.trap && traps.has(d.trap)) continue;
    seen.push(d.value);
    if (d.trap) traps.add(d.trap);
    pool.push(d);
  }
  const below = pool.filter((d) => d.value.cmp(answer) < 0);
  const above = pool.filter((d) => d.value.cmp(answer) > 0);
  const want = rng.weighted(Array.from({ length: count + 1 }, (_, i) => i), Array.from({ length: count + 1 }, (_, i) => (i === 0 || i === count ? 1 : 2)));
  const out: Distractor[] = [];
  const take = (d: Distractor) => { if (out.length < count && !out.includes(d)) out.push(d); };
  for (const d of below.slice(0, want)) take(d);
  for (const d of above) take(d);
  for (const d of below) take(d);
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

function pack(rng: RNG, stem: string, ans: Exact, ds: Distractor[], solution: string, trap: string, tags: string[], params: Record<string, unknown>): Generated | null {
  if (!tidy(ans) || ds.length < 4) return null;
  return {
    stem,
    answer: { kind: 'exact' as const, value: ans, format: 'decimal' as const },
    options: buildOptions(rng, ans, ds, DEC),
    solution,
    trap,
    tags,
    params,
    typedAllowed: true,
  };
}

const word = (p: number) => (p > 0 ? `increased by $${p}\\%$` : `decreased by $${-p}\\%$`);

// ---------------------------------------------------------------------------
// Level 1: overall percentage change
// ---------------------------------------------------------------------------

const PCTS = [5, 10, 20, 25, 30, 40, 50];

function overall(rng: RNG): Generated | null {
  const p = rng.pick(PCTS), q = rng.pick(PCTS);
  const dir = rng.weighted(['up-up', 'up-down', 'down-down'], [3, 2, 1]);
  const sp = p, sq = dir === 'up-up' ? q : -q;
  const spp = dir === 'down-down' ? -p : sp;
  const m = mult(spp).mul(mult(sq)); // overall multiplier
  const change = m.sub(E(1)).mulRat(100); // signed overall % change
  if (change.isZero()) return null;
  const ans = change.abs();
  if (!tidy(ans) || (ans.toRat().d !== 1n && ans.toRat().d !== 2n)) return null;
  const up = change.sign() > 0;
  const ctx = rng.pick(['price', 'population', 'value']);
  const noun = ctx === 'price' ? 'The price of a jacket' : ctx === 'population' ? 'The population of a town' : 'The value of a painting';
  const stem = `${noun} is ${word(spp)} and then ${word(sq)}. Find the overall percentage ${up ? 'increase' : 'decrease'}.`;
  const sum = spp + sq;
  const must = keep([
    { value: E(Math.abs(sum)), trap: 'added the two percentages' },
  ]);
  const extra = keep([
    { value: m.mulRat(100), trap: 'gave the final value as a percentage of the original, not the change' },
    { value: m, trap: 'gave the overall multiplier, not a percentage' },
    { value: E(Math.abs(sum)).add(E(Math.abs(spp * sq) / 10)), trap: 'decimal slip in the cross term (p × q ÷ 10 instead of ÷ 100)' },
    { value: E(Math.abs(spp * sq) / 100), trap: 'gave only the cross term p × q ÷ 100' },
    { value: E(Math.abs(spp - sq)), trap: 'subtracted the percentages' },
    { value: ans.add(E(1)), trap: 'arithmetic slip of one' },
  ]);
  return pack(rng, stem, ans, spread(rng, ans, must, extra),
    `Multiply the multipliers: $${mtex(spp)} \\times ${mtex(sq)} = ${dec(m)}$, which is ${up ? 'an increase' : 'a decrease'} of $${dec(ans)}\\%$.`,
    'Successive changes multiply: 1.1 × 1.1 = 1.21, so two 10% rises are a 21% rise (not 20%); 10% up then 10% down is a 1% fall, not no change.',
    ['percentage', 'compound', 'multiplier'],
    { variant: 'overall', changes: [spp, sq] },
  );
}

// ---------------------------------------------------------------------------
// Levels 2–3: compound growth and depreciation
// ---------------------------------------------------------------------------

const PRINCIPALS = [40, 50, 64, 80, 100, 120, 125, 160, 200, 250, 300, 320, 400, 500, 600, 640, 800, 1000, 1200, 1600, 2000, 2500, 3000, 3200, 4000, 5000, 6400, 8000, 10000];

function compound(rng: RNG, decrease: boolean): Generated | null {
  const r = rng.pick(decrease ? [10, 20, 25] : [5, 10, 20, 25]);
  const n = rng.weighted([2, 3], [3, 1]);
  if (r === 5 && n === 3) return null; // 1.05³ is not mental
  const P = rng.pick(PRINCIPALS);
  const sr = decrease ? -r : r;
  const m = mult(sr);
  const ans = E(P).mul(m.pow(n));
  if (!ans.isInteger() || ans.toNumber() > 20000) return null;
  const F = ans.toInt();
  const ctx = decrease ? rng.pick(['car', 'phone', 'machine']) : rng.pick(['invest', 'population', 'price']);
  let stem: string;
  const yrs = `${n} years`;
  if (ctx === 'car') stem = `A car is bought for £${P}. Its value falls by $${r}\\%$ each year. Find its value, in pounds, after ${yrs}.`;
  else if (ctx === 'phone') stem = `A phone costing £${P} loses $${r}\\%$ of its value every year. What is it worth, in pounds, after ${yrs}?`;
  else if (ctx === 'machine') stem = `A machine worth £${P} depreciates by $${r}\\%$ per year. Find its value, in pounds, at the end of ${yrs}.`;
  else if (ctx === 'invest') stem = `£${P} is invested at $${r}\\%$ per year compound interest. Find the value of the investment, in pounds, after ${yrs}.`;
  else if (ctx === 'population') stem = `The population of a colony of bacteria is ${P}. It increases by $${r}\\%$ every hour. What is the population after ${n} hours?`;
  else stem = `The price of a ticket is £${P}. It rises by $${r}\\%$ each year for ${yrs}. Find the price, in pounds, after the ${n === 2 ? 'second' : 'third'} rise.`;
  const simple = E(P).mul(mult(sr * n));
  // Mistakes that overshoot as well as undershoot, or the answer is simply the biggest number on the page.
  const over = keep([
    { value: E(P).mul(m.pow(n + 1)), trap: `went on for ${n + 1} periods` },
    { value: ans.add(E(P).mulRat(frac(Math.abs(sr) * n, 100).toRat())), trap: 'added simple interest on top of the compounded value' },
    { value: ans.add(E(P).mulRat(frac(Math.abs(sr), 100).toRat())), trap: 'counted one extra period of change on the original amount' },
    { value: ans.add(ans.sub(E(P))), trap: decrease ? 'subtracted the loss in value a second time' : 'added the interest on to the final value (counted it twice)' },
    { value: E(P).mul(mult(-sr).pow(n)), trap: decrease ? `used the multiplier ${mtex(r)} for a decrease` : `used the multiplier ${mtex(-r)} for an increase` },
    { value: E(P).mul(m.pow(n - 1)), trap: `stopped after ${n - 1} ${n - 1 === 1 ? 'period' : 'periods'}` },
  ].filter((c) => c.value !== null && c.value.cmp(ans) > 0));
  if (over.length === 0) return null; // no overshooting mistake available: redraw rather than give the game away
  const must = [
    ...keep([{ value: simple, trap: `applied ${r}% of the original each time (simple interest)` }]),
    rng.pick(over),
  ];
  const extra = keep([
    { value: E(P).mul(m.pow(n - 1)), trap: `stopped after ${n - 1} ${n - 1 === 1 ? 'period' : 'periods'}` },
    { value: E(P).mul(m.pow(n + 1)), trap: `went on for ${n + 1} periods` },
    { value: ans.add(E(P).mulRat(frac(Math.abs(sr) * n, 100).toRat())), trap: 'added simple interest on top of the compounded value' },
    { value: ans.add(E(P).mulRat(frac(Math.abs(sr), 100).toRat())), trap: 'counted one extra period of change on the original amount' },
    { value: ans.add(ans.sub(E(P))), trap: decrease ? 'subtracted the loss in value a second time' : 'added the interest on to the final value (counted it twice)' },
    { value: E(P).mul(mult(-sr).pow(n)), trap: decrease ? `used the multiplier ${mtex(r)} for a decrease` : `used the multiplier ${mtex(-r)} for an increase` },
    { value: E(P).sub(ans).abs(), trap: decrease ? 'found the loss in value, not the value' : 'found the interest, not the total value' },
    { value: E(Math.abs(P - simple.toNumber())), trap: 'found the total change using simple interest' },
    { value: E(P).mul(m).mul(frac(100 + Math.abs(sr) * (n - 1), 100)), trap: 'compounded only once' },
  ]);
  const steps = Array.from({ length: n }, () => mtex(sr)).join(' \\times ');
  return pack(rng, stem, ans, spread(rng, ans, must, extra),
    `Multiplier $${mtex(sr)}$ each ${ctx === 'population' ? 'hour' : 'year'}: $${P} \\times ${steps} = ${P} \\times ${dec(m.pow(n))} = ${F}$.`,
    decrease
      ? 'A 20% fall is a multiplier of 0.8 applied each year: 500 × 0.8² = 320, not 500 − 2 × 100 = 300.'
      : 'Compound interest multiplies by the same factor each year: 1.2² = 1.44, not 1 + 2 × 0.2 = 1.4.',
    ['percentage', 'compound', decrease ? 'depreciation' : 'growth'],
    { variant: 'compound', P, rate: sr, n },
  );
}

// ---------------------------------------------------------------------------
// Level 4: percentage of a percentage; discount then VAT
// ---------------------------------------------------------------------------

function percentOfPercent(rng: RNG): Generated | null {
  const p = rng.pick([10, 20, 25, 30, 40, 50, 60, 75, 80]);
  const q = rng.pick([10, 20, 25, 30, 40, 50, 60, 75, 80]);
  if (p === q && p === 50) return null;
  const ans = frac(p * q, 100);
  if (!ans.isInteger()) return null;
  const ctx = rng.pick(['school', 'survey', 'shop']);
  const stem = ctx === 'school'
    ? `In a school, $${p}\\%$ of the students are in the sixth form, and $${q}\\%$ of the sixth-form students study physics. What percentage of the students in the school are sixth-form physics students?`
    : ctx === 'survey'
      ? `In a survey, $${p}\\%$ of the people asked own a bicycle, and $${q}\\%$ of the bicycle owners cycle to work. What percentage of the people asked cycle to work on their own bicycle?`
      : `$${p}\\%$ of the items in a shop are books, and $${q}\\%$ of the books are paperbacks. What percentage of the items in the shop are paperbacks?`;
  const must = keep([
    { value: E(p + q), trap: 'added the percentages' },
  ]);
  const extra = keep([
    { value: E(Math.abs(p - q)), trap: 'subtracted the percentages' },
    { value: ans.mulRat(frac(1, 100).toRat()), trap: 'left the answer as a decimal fraction' },
    { value: ans.mulRat(10), trap: 'decimal slip: divided by 10 instead of 100' },
    { value: frac(100 * Math.min(p, q), Math.max(p, q)), trap: 'divided one percentage by the other' },
    { value: E(100 - (p * q) / 100), trap: 'found the complementary percentage' },
    { value: E(Math.max(p, q)), trap: 'kept the larger percentage' },
  ]);
  return pack(rng, stem, ans, spread(rng, ans, must, extra),
    `$${q}\\%$ of $${p}\\%$ is $${dec(frac(q, 100))} \\times ${p}\\% = ${dec(ans)}\\%$.`,
    'A percentage of a percentage multiplies: 40% of 30% is 0.4 × 30% = 12%, not 70% or 10%.',
    ['percentage', 'percent-of-percent'],
    { variant: 'pct-of-pct', p, q },
  );
}

function discountVat(rng: RNG): Generated | null {
  const d = rng.pick([10, 20, 25, 30, 40, 50]);
  const P = rng.pick([40, 50, 60, 80, 100, 120, 150, 200, 240, 250, 300, 400, 500]);
  const vat = 20;
  const sale = E(P).mul(mult(-d));
  const ans = sale.mul(mult(vat));
  if (!ans.isInteger() || !sale.isInteger()) return null;
  const item = rng.pick(['jacket', 'bicycle', 'laptop', 'sofa']);
  const stem = `A ${item} is priced at £${P} before VAT. In a sale the price is reduced by $${d}\\%$, and then VAT at $${vat}\\%$ is added to the sale price. Find the final price in pounds.`;
  const must = keep([
    { value: E(P).mul(frac(100 - d + vat, 100)), trap: `combined the changes as a single ${vat - d >= 0 ? `${vat - d}% rise` : `${d - vat}% fall`} (added the percentages)` },
  ]);
  const extra = keep([
    { value: sale, trap: 'forgot to add the VAT' },
    { value: sale.mul(frac(vat, 100)), trap: 'found the VAT only' },
    { value: sale.div(mult(vat)), trap: 'divided by 1.2 instead of multiplying' },
    { value: sale.mul(mult(-vat)), trap: 'subtracted the VAT instead of adding it' },
    { value: E(P).mul(mult(vat)), trap: 'applied VAT to the full price and forgot the discount' },
    { value: E(P).mul(mult(-d)).mul(mult(-d)), trap: 'applied the discount twice' },
  ]);
  return pack(rng, stem, ans, spread(rng, ans, must, extra),
    `Sale price $${P} \\times ${mtex(-d)} = ${dec(sale)}$; with VAT, $${dec(sale)} \\times ${mtex(vat)} = ${dec(ans)}$.`,
    'Apply the multipliers in turn (0.75 then 1.2); a 25% cut followed by 20% VAT is not a net 5% cut.',
    ['percentage', 'compound', 'vat'],
    { variant: 'discount-vat', P, d, vat },
  );
}

// ---------------------------------------------------------------------------
// Level 5: find the rate, or the number of periods
// ---------------------------------------------------------------------------

function findRate(rng: RNG): Generated | null {
  const decrease = rng.bool(0.35);
  const r = rng.pick(decrease ? [10, 20, 25, 30, 40, 50] : [5, 10, 20, 25, 30, 40, 50]);
  const P = rng.pick(PRINCIPALS);
  const sr = decrease ? -r : r;
  const m = mult(sr);
  const final = E(P).mul(m.pow(2));
  if (!final.isInteger() || final.toNumber() > 20000) return null;
  const F = final.toInt();
  const ans = E(r);
  const overallPct = m.pow(2).sub(E(1)).mulRat(100).abs();
  const ctx = rng.pick(['price', 'population', 'value']);
  const noun = ctx === 'price' ? `The price of a train ticket` : ctx === 'population' ? 'The number of members of a club' : 'The value of an antique';
  const stem = `${noun} ${decrease ? 'falls' : 'rises'} by the same percentage in each of two years, from ${ctx === 'population' ? P : `£${P}`} to ${ctx === 'population' ? F : `£${F}`}. Find the percentage ${decrease ? 'decrease' : 'increase'} per year.`;
  // A change in value is only offered when it could be read as a percentage: "5000%" per year is
  // discarded on sight and turns a five-option question into a three-option one.
  const change = Math.abs(F - P);
  const rootOfPct = Math.sqrt(overallPct.toNumber());
  // Every other mistake overshoots the rate, so one that undershoots it is always offered.
  const under = keep([
    { value: m, trap: 'gave the yearly multiplier, not a percentage' },
    { value: Number.isInteger(rootOfPct * 10) ? E(rootOfPct) : null, trap: 'square-rooted the percentage change instead of the multiplier' },
    { value: frac(r, 2), trap: 'halved the rate as well as taking the root of the multiplier' },
    { value: E(r).mulRat(frac(1, 100).toRat()), trap: 'gave the rate as a decimal, not a percentage' },
  ].filter((c) => c.value !== null && c.value.cmp(ans) < 0));
  if (under.length === 0) return null;
  const must = [
    ...keep([{ value: overallPct, trap: 'gave the overall percentage change for the two years' }]),
    rng.pick(under),
  ];
  const extra = [...under, ...keep([
    { value: overallPct.mulRat(frac(1, 2).toRat()), trap: 'halved the overall percentage change' },
    { value: E(100 * (decrease ? 100 - r : 100 + r) / 100), trap: 'forgot to subtract 100 from the percentage multiplier' },
    { value: change <= 100 ? E(change) : null, trap: 'gave the total change in value' },
    { value: change <= 200 ? E(change / 2) : null, trap: 'halved the total change in value' },
    { value: E(2 * r), trap: 'doubled the rate' },
  ])];
  return pack(rng, stem, ans, spread(rng, ans, must, extra),
    `Two years give a multiplier of $${F} \\div ${P} = ${dec(m.pow(2))}$; its square root is $${mtex(sr)}$, so the change is $${r}\\%$ per year.`,
    'The rate comes from the square root of the two-year multiplier (√1.21 = 1.1 ⇒ 10%), not from halving the overall 21%.',
    ['percentage', 'compound', 'reverse'],
    { variant: 'rate', P, F, decrease },
  );
}

function findPeriods(rng: RNG): Generated | null {
  const decrease = rng.bool(0.4);
  const r = rng.pick(decrease ? [10, 20, 25, 50] : [10, 20, 25, 50]);
  const P = rng.pick([100, 200, 400, 500, 800, 1000, 2000, 5000]);
  const m = mult(decrease ? -r : r);
  const n = rng.int(2, 4);
  if (r === 10 && n > 3) return null; // 0.9⁴ and 1.1⁴ are not mental
  const before = E(P).mul(m.pow(n - 1)), after = E(P).mul(m.pow(n));
  // threshold: a round number strictly between the values before and after the n-th period, with a margin
  const lo = Math.min(before.toNumber(), after.toNumber()), hi = Math.max(before.toNumber(), after.toNumber());
  const step = hi >= 1000 ? 100 : hi >= 100 ? 10 : 5;
  const cands: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) if (t > lo * 1.03 && t < hi * 0.97) cands.push(t);
  if (cands.length === 0) return null;
  const T = rng.pick(cands);
  const ans = E(n);
  const ctx = decrease ? rng.pick(['car', 'drug']) : rng.pick(['population', 'investment']);
  const stem = ctx === 'car'
    ? `A car is bought for £${P} and loses $${r}\\%$ of its value each year. After how many complete years is it first worth less than £${T}?`
    : ctx === 'drug'
      ? `The mass of a drug in the bloodstream is ${P} mg and falls by $${r}\\%$ every hour. After how many complete hours is the mass first below ${T} mg?`
      : ctx === 'population'
        ? `A population of ${P} insects increases by $${r}\\%$ each week. After how many complete weeks does the population first exceed ${T}?`
        : `£${P} is invested at $${r}\\%$ compound interest per year. After how many complete years is the investment first worth more than £${T}?`;
  const simpleN = Math.ceil(Math.abs(T - P) / (P * r / 100));
  const must = keep([
    { value: simpleN !== n ? E(simpleN) : null, trap: 'used simple interest (the same change each period)' },
  ]);
  const extra = keep([
    { value: E(n - 1), trap: 'stopped one period too early' },
    { value: E(n + 1), trap: 'went one period too far' },
    { value: E(n + 2), trap: 'went two periods too far' },
    { value: n - 2 >= 1 ? E(n - 2) : null, trap: 'stopped two periods too early' },
    { value: E(2 * n), trap: 'doubled the number of periods' },
  ]);
  const values = Array.from({ length: n }, (_, i) => dec(E(P).mul(m.pow(i + 1)))).join(', ');
  return pack(rng, stem, ans, spread(rng, ans, must, extra),
    `Multiply by $${dec(m)}$ repeatedly: ${values}. The value first ${decrease ? 'drops below' : 'passes'} ${T} after ${n} ${ctx === 'drug' ? 'hours' : ctx === 'population' ? 'weeks' : 'years'}.`,
    'Compound change multiplies each period, so list the values (1.2, 1.44, 1.728 …) rather than dividing the required change by the yearly change.',
    ['percentage', 'compound', 'periods'],
    { variant: 'periods', P, rate: decrease ? -r : r, T, decrease },
  );
}

// ---------------------------------------------------------------------------

export default defineTemplate({
  id: 'm1.ratio-percent.compound',
  module: 'M1',
  topic: 'ratio-percent',
  title: 'Repeated percentage change',
  levels: {
    1: 'overall change after two successive changes: 10% then 10% is 21%',
    2: 'compound growth: £2000 at 20% for two years is 2000 × 1.44',
    3: 'depreciation: £500 losing 20% a year for two years is £320',
    4: '30% of 40% = 12%; a discount followed by VAT',
    5: 'find the rate (200 → 242 in two equal steps) or the number of periods',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return pickVariant(rng, [overall]);
        case 2: return pickVariant(rng, [(r) => compound(r, false)]);
        case 3: return pickVariant(rng, [(r) => compound(r, true)]);
        case 4: return pickVariant(rng, [percentOfPercent, discountVat]);
        default: return pickVariant(rng, [findRate, findRate, findPeriods]);
      }
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const got = q.answer.value.toNumber();
    const P = q.params as Record<string, unknown>;
    const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
    switch (P.variant as string) {
      case 'overall': {
        const [a, b] = P.changes as number[];
        return close(got, Math.abs((1 + a / 100) * (1 + b / 100) - 1) * 100);
      }
      case 'compound': {
        const { P: p, rate, n } = P as { P: number; rate: number; n: number };
        let v = p;
        for (let i = 0; i < n; i++) v *= 1 + rate / 100;
        return close(got, v);
      }
      case 'pct-of-pct': {
        const { p, q: qq } = P as { p: number; q: number };
        return close(got, (p / 100) * qq);
      }
      case 'discount-vat': {
        const { P: p, d, vat } = P as { P: number; d: number; vat: number };
        return close(got, p * (1 - d / 100) * (1 + vat / 100));
      }
      case 'rate': {
        const { P: p, F, decrease } = P as { P: number; F: number; decrease: boolean };
        // forward check: applying the rate twice must reproduce F
        const m = decrease ? 1 - got / 100 : 1 + got / 100;
        return close(p * m * m, F) && got > 0;
      }
      case 'periods': {
        const { P: p, rate, T, decrease } = P as { P: number; rate: number; T: number; decrease: boolean };
        const n = got;
        if (!Number.isInteger(n) || n < 1) return false;
        const at = (k: number) => p * (1 + rate / 100) ** k;
        return decrease ? at(n) < T && at(n - 1) >= T : at(n) > T && at(n - 1) <= T;
      }
      default: return false;
    }
  },
});
