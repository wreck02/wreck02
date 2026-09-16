import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact, ratToDecimalString } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { gcd, lcm, nCr } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Dice, spinners and expected value.
 * Level 1: P(two dice total 7) = 1/6, P(at least one six in two rolls) = 11/36
 * Level 2: the expected score of a spinner whose sectors repeat
 * Level 3: a game with a stake: win £5 with probability ¼ for a £2 stake → expected profit −¾
 * Level 4: the expected number of sixes in 12 rolls, or E(X) from a distribution given in words
 * Level 5: the stake or prize that makes a game fair, or E(X) (and E(aX + b)) with the probabilities in words
 *
 * verify() never re-runs the sum that generate() used: every variant either enumerates the
 * sample space outcome by outcome or substitutes the answer back into the condition it satisfies.
 */

const FRACTION = { format: 'fraction' as const };
const tx = (x: Exact): string => x.toLatex(FRACTION);
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
/** "twice", "three times" — exam register, never "two times". */
const timesWord = (n: number): string => (n === 1 ? 'once' : n === 2 ? 'twice' : `${WORDS[n]} times`);

function attempt(f: () => Exact): Exact | null {
  try {
    const v = f();
    return Number.isFinite(v.toNumber()) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Options for an answer printed as a decimal: every value must itself print as one.
 * `format: 'decimal'` falls back to \frac for a recurring value, and a lone vulgar
 * fraction among decimals is never the answer — a tell a candidate can use.
 */
function decimalOnly(ds: Distractor[]): Distractor[] {
  return ds.filter((d) => d.value.isRational() && ratToDecimalString(d.value.toRat()) !== null);
}

/** `range` keeps probability options strictly between 0 and 1. */
function cleanOnly(ds: { value: Exact | null; trap: string }[], range?: [number, number]): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } => {
    if (d.value === null || !Number.isFinite(d.value.toNumber()) || !isCleanExact(d.value).ok) return false;
    if (!range) return true;
    const v = d.value.toNumber();
    return v > range[0] && v < range[1];
  });
}

/**
 * Choose the distractors that go to buildOptions: every distinct `must` candidate (the spec-named traps)
 * is used before any `extra` one, so the headline mistakes are never shuffled out by weaker ones.
 */
function ranked(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], count = 4): Distractor[] {
  const seen: Exact[] = [answer];
  const out: Distractor[] = [];
  const take = (d: Distractor) => {
    if (out.length >= count || !Number.isFinite(d.value.toNumber()) || seen.some((s) => s.equals(d.value))) return;
    seen.push(d.value);
    out.push(d);
  };
  must.forEach(take);
  rng.shuffle(extra).forEach(take);
  return out;
}

/** Pick a sub-variant first, then retry its parameters, so rejection rates do not skew the mix of variants. */
function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

const PROB_FALLBACK = [[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [1, 6], [5, 6], [1, 5], [2, 5], [1, 9], [1, 12], [5, 12], [7, 36], [13, 36]].map(([n, d]) => frac(n, d));

/**
 * `ds` has already been ranked. Level 1 rejects any draw that cannot fill all four wrong
 * options with a named mistake, so the fallback is only ever reached at higher levels.
 */
function probOptions(rng: RNG, answer: Exact, ds: Distractor[]) {
  return buildOptions(rng, answer, ds, { ...FRACTION, fallback: PROB_FALLBACK });
}

function valueOptions(rng: RNG, answer: Exact, ds: Distractor[], format: 'fraction' | 'decimal' = 'fraction') {
  return buildOptions(rng, answer, ds, { format });
}

// ----------------------------------------------------------------------------- level 1

/** The number of ways two fair dice can total s. */
function waysForTotal(s: number): number {
  let c = 0;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b === s) c++;
  return c;
}

function diceSumQ(rng: RNG): Generated | null {
  const mode = rng.pick(['equal', 'atleast', 'atmost']);
  const s = rng.int(3, 11);
  let ways = 0;
  let ask: string;
  if (mode === 'equal') { ways = waysForTotal(s); ask = `the total is $${s}$`; }
  else if (mode === 'atleast') { for (let t = s; t <= 12; t++) ways += waysForTotal(t); ask = `the total is at least $${s}$`; }
  else { for (let t = 2; t <= s; t++) ways += waysForTotal(t); ask = `the total is at most $${s}$`; }
  const answer = frac(ways, 36);
  if (!isCleanExact(answer).ok || ways === 0 || ways === 36) return null;
  const distractors = ranked(rng, answer, cleanOnly([
    { value: frac(ways, 12), trap: 'counted only 12 outcomes (two dice, six faces) instead of 36' },
    { value: frac(1, 11), trap: 'treated the 11 possible totals as equally likely' },
    { value: E(1).sub(answer), trap: 'found the probability of the opposite event' },
    { value: frac(ways - 1, 36), trap: 'miscounted the successful pairs (forgot a reversed pair)' },
  ], [0, 1]), cleanOnly([
    { value: frac(ways + 1, 36), trap: 'miscounted the successful pairs' },
    { value: frac(Math.ceil(ways / 2), 36), trap: 'counted $(a, b)$ and $(b, a)$ as the same outcome' },
    { value: frac(ways, 18), trap: 'halved the number of outcomes' },
  ], [0, 1]));
  if (distractors.length < 4) return null; // never pad a level-1 question with untrapped fractions
  return {
    stem: `Two fair six-sided dice are rolled and their scores are added. Find the probability that ${ask}.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: probOptions(rng, answer, distractors),
    solution: `There are $36$ equally likely ordered pairs and $${ways}$ of them give ${mode === 'equal' ? `a total of $${s}$` : `a total ${mode === 'atleast' ? 'of at least' : 'of at most'} $${s}$`}, so the probability is $\\frac{${ways}}{36} = ${tx(answer)}$.`,
    trap: 'There are 36 ordered outcomes, not 12 and not 11 equally likely totals.',
    tags: ['probability', 'dice'],
    params: { variant: 'dice-total', mode, s },
    typedAllowed: true,
  };
}

interface Trial { name: string; faces: number; events: { text: string; good: number }[]; unit: string }
const TRIALS: Trial[] = [
  { name: 'A fair six-sided dice is rolled', faces: 6, unit: 'rolls', events: [{ text: 'a six', good: 1 }, { text: 'a score of $1$', good: 1 }, { text: 'a number greater than $4$', good: 2 }, { text: 'a multiple of $3$', good: 2 }] },
  { name: 'A fair coin is tossed', faces: 2, unit: 'tosses', events: [{ text: 'a head', good: 1 }, { text: 'a tail', good: 1 }] },
];

function atLeastOneQ(rng: RNG): Generated | null {
  const trial = rng.pick(TRIALS);
  const ev = rng.pick(trial.events);
  // Two tosses of a coin has too small a sample space to offer four different mistakes.
  const n = trial.faces === 2 ? rng.int(3, 4) : 2;
  const total = trial.faces ** n;
  const bad = (trial.faces - ev.good) ** n;
  const answer = frac(total - bad, total);
  if (!isCleanExact(answer).ok) return null;
  const single = frac(ev.good, trial.faces);
  // Unordered outcomes (multisets) treated as equally likely — the classic "HH, HT, TT" error.
  const multisets = nCr(trial.faces + n - 1, n);
  const multisetsNone = nCr(trial.faces - ev.good + n - 1, n);
  const exactlyOne = n * ev.good * (trial.faces - ev.good) ** (n - 1);
  const distractors = ranked(rng, answer, cleanOnly([
    { value: single.mul(E(n)), trap: 'added the probabilities instead of using the complement' },
    { value: frac(bad, total), trap: 'gave the probability of getting none' },
    { value: attempt(() => single.pow(n)), trap: 'found the probability that every trial succeeds' },
    { value: attempt(() => E(1).sub(single.pow(n))), trap: 'used $1 - P(\\text{all})$ instead of $1 - P(\\text{none})$' },
  ], [0, 1]), cleanOnly([
    { value: single, trap: 'answered for a single trial' },
    { value: frac(exactlyOne, total), trap: 'found the probability of exactly one success' },
    { value: frac(multisets - multisetsNone, multisets), trap: 'treated the unordered outcomes as equally likely' },
    { value: E(1).sub(E(1).sub(single).mul(E(n))), trap: 'subtracted the failure probabilities instead of multiplying them' },
  ], [0, 1]));
  if (distractors.length < 4) return null; // never pad a level-1 question with untrapped fractions
  return {
    stem: `${trial.name} ${timesWord(n)}. Find the probability of obtaining at least one ${ev.text.replace(/^an? /, '')}.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: probOptions(rng, answer, distractors),
    solution: `Use the complement: $P(\\text{none}) = \\left(${tx(E(1).sub(single))}\\right)^{${n}} = ${tx(frac(bad, total))}$, so $P(\\text{at least one}) = 1 - ${tx(frac(bad, total))} = ${tx(answer)}$.`,
    trap: '"At least one" = 1 − P(none); probabilities are never added across repeated trials.',
    tags: ['probability', 'complement'],
    params: { variant: 'at-least-one', faces: trial.faces, good: ev.good, n },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 2: spinner mean

function spinnerQ(rng: RNG): Generated | null {
  const n = rng.pick([6, 8, 10, 12]);
  const values = rng.pickDistinct([1, 2, 3, 4, 5, 6, 8, 10], 3).sort((a, b) => a - b);
  const f1 = rng.int(1, n - 2);
  const f2 = rng.int(1, n - f1 - 1);
  const f3 = n - f1 - f2;
  const freqs = [f1, f2, f3];
  if (freqs.some((f) => f < 1)) return null;
  if (new Set(freqs).size === 1) return null; // equal sectors: nothing to weight
  const total = values.reduce((acc, v, i) => acc + v * freqs[i], 0);
  const answer = frac(total, n);
  if (!isCleanExact(answer).ok) return null;
  // Keep the arithmetic mental: a whole number or a simple half/quarter.
  if (Number(answer.toRat().d) > 4) return null;
  const naive = frac(values[0] + values[1] + values[2], 3);
  if (naive.equals(answer)) return null; // the weighting would make no difference
  const maxF = Math.max(...freqs);
  const uniqueMode = freqs.filter((f) => f === maxF).length === 1;
  const distractors = ranked(rng, answer, cleanOnly([
    { value: naive, trap: 'averaged the three different scores, ignoring how many sectors show each' },
    { value: E(total), trap: 'forgot to divide by the number of sectors' },
    { value: uniqueMode ? E(values[freqs.indexOf(maxF)]) : null, trap: 'gave the most likely score instead of the mean' },
    { value: frac(total - values[2] * freqs[2], n), trap: 'dropped the last term of $\\sum x p$' },
  ]), cleanOnly([
    { value: frac(total, 3), trap: 'divided by the number of different scores' },
    { value: E(values[2]), trap: 'gave the highest score' },
    { value: frac(values[0] + values[1] + values[2], n), trap: 'added the scores once each, not once per sector' },
    { value: frac(total, n).add(E(1)), trap: 'slip of one' },
  ]));
  const list = values.map((v, i) => `${WORDS[freqs[i]]} ${freqs[i] === 1 ? 'shows' : 'show'} $${v}$`);
  return {
    stem: `A spinner has $${n}$ equal sectors: ${list.slice(0, 2).join(', ')} and ${list[2]}. Find the expected score for one spin.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: valueOptions(rng, answer, distractors),
    solution: `$E(X) = \\frac{${values.map((v, i) => `${freqs[i]} \\times ${v}`).join(' + ')}}{${n}} = \\frac{${total}}{${n}} = ${tx(answer)}$.`,
    trap: 'Weight every score by how many sectors show it — the mean of the different scores is not the expected score.',
    tags: ['probability', 'expected-value', 'spinner'],
    params: { variant: 'spinner', values, freqs, n },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 3: a game with a stake

const PROBS: [number, number][] = [[1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [2, 5], [3, 10], [2, 3], [3, 4]];

function gameQ(rng: RNG): Generated | null {
  const [pn, pd] = rng.pick(PROBS);
  const cost = rng.int(1, 5);
  // A prize worth playing for: at least twice the stake. The probability, not the prize,
  // decides whether the expected profit is positive or negative.
  const prize = rng.int(2 * cost, 12);
  if (prize <= cost) return null;
  const p = frac(pn, pd);
  const answer = p.mul(E(prize)).sub(E(cost));
  if (answer.isZero() || !isCleanExact(answer).ok) return null;
  if (Number(answer.toRat().d) > 10) return null;
  const distractors = ranked(rng, answer, cleanOnly([
    { value: p.mul(E(prize)), trap: 'forgot to subtract the stake' },
    { value: answer.neg(), trap: 'subtracted the winnings from the stake (sign error)' },
    { value: E(prize).sub(E(cost)).mul(p).sub(E(cost)), trap: 'subtracted the stake twice: once inside the probability and once outside' },
    { value: E(prize - cost), trap: 'ignored the probability altogether' },
  ]), cleanOnly([
    { value: p.mul(E(prize - cost)), trap: 'applied the probability to the profit but forgot the stake is always paid' },
    { value: p.mul(E(prize)).add(E(cost)), trap: 'added the stake instead of subtracting it' },
    { value: p.mul(E(prize)).sub(E(cost)).mul(E(2)), trap: 'doubled the expected profit' },
  ]));
  return {
    stem: `A game costs £${cost} to play. The player wins a prize of £${prize} with probability $${tx(p)}$ and nothing otherwise. Find the expected profit per game, in pounds.`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: valueOptions(rng, answer, distractors),
    solution: `Expected winnings $= ${tx(p)} \\times ${prize} = ${tx(p.mul(E(prize)))}$; the stake is paid every game, so the expected profit is $${tx(p.mul(E(prize)))} - ${cost} = ${tx(answer)}$.`,
    trap: 'The stake is paid whatever happens: expected profit = E(winnings) − stake.',
    tags: ['probability', 'expected-value', 'games'],
    params: { variant: 'game', pn, pd, prize, cost },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 4

function trialsQ(rng: RNG): Generated | null {
  const kind = rng.pick(['six', 'head', 'event']);
  let pn: number, pd: number, n: number, what: string, setup: string;
  if (kind === 'six') {
    pn = 1; pd = 6; n = rng.pick([12, 18, 24, 30, 42]);
    what = 'sixes'; setup = `A fair six-sided dice is rolled $${n}$ times.`;
  } else if (kind === 'head') {
    pn = 1; pd = 2; n = rng.pick([10, 20, 30, 50, 24]);
    what = 'heads'; setup = `A fair coin is tossed $${n}$ times.`;
  } else {
    [pn, pd] = rng.pick([[1, 5], [2, 5], [1, 4], [3, 10], [1, 10]]);
    n = rng.pick([20, 30, 40, 50, 60]);
    what = 'faulty components';
    setup = `In a large batch, the probability that a component is faulty is $${tx(frac(pn, pd))}$. A sample of $${n}$ components is taken.`;
  }
  const p = frac(pn, pd);
  const answer = p.mul(E(n));
  if (!answer.isInteger() || !isCleanExact(answer).ok) return null;
  const distractors = ranked(rng, answer, cleanOnly([
    { value: E(1).sub(p).mul(E(n)), trap: 'found the expected number of failures instead' },
    { value: p, trap: 'gave the probability, not the expected number' },
    { value: attempt(() => E(n).div(answer)), trap: 'divided the wrong way round' },
    { value: E(n).sub(answer), trap: 'subtracted from the number of trials' },
  ]), cleanOnly([
    { value: answer.mul(E(2)), trap: 'doubled' },
    { value: answer.add(E(1)), trap: 'slip of one' },
    { value: E(n), trap: 'gave the number of trials' },
  ]));
  return {
    stem: `${setup} Find the expected number of ${what}.`,
    answer: { kind: 'exact', value: answer },
    options: valueOptions(rng, answer, distractors),
    solution: `$E = np = ${n} \\times ${tx(p)} = ${tx(answer)}$.`,
    trap: 'Expected number = number of trials × probability — not the probability itself.',
    tags: ['probability', 'expected-value'],
    params: { variant: 'trials', pn, pd, n },
    typedAllowed: true,
  };
}

function distributionQ(rng: RNG): Generated | null {
  const xs = rng.pickDistinct([0, 1, 2, 3, 4, 5, 6, 8, 10], 3).sort((a, b) => a - b);
  const tenths = [rng.int(1, 6), rng.int(1, 6), 0];
  tenths[2] = 10 - tenths[0] - tenths[1];
  if (tenths[2] < 1) return null;
  const answer = xs.reduce((acc, x, i) => acc.add(frac(tenths[i] * x, 10)), Exact.ZERO);
  if (!isCleanExact(answer).ok || answer.isZero()) return null;
  // The answer is a multiple of 0.1 and every option is printed as a decimal, so the naive
  // mean is only offered when it is itself a terminating decimal (decimalOnly drops it
  // otherwise); the median takes its place.
  const mean = frac(xs[0] + xs[1] + xs[2], 3);
  const maxT = Math.max(...tenths);
  const uniqueMode = tenths.filter((t) => t === maxT).length === 1;
  const distractors = ranked(rng, answer, decimalOnly(cleanOnly([
    { value: mean, trap: 'averaged the values, ignoring the probabilities' },
    { value: E(xs[0] + xs[1] + xs[2]), trap: 'added the values' },
    { value: answer.mul(E(3)), trap: 'multiplied by the number of values' },
    { value: uniqueMode ? E(xs[tenths.indexOf(maxT)]) : null, trap: 'gave the most likely value' },
  ])), decimalOnly(cleanOnly([
    { value: E(xs[1]), trap: 'gave the middle value instead of the mean' },
    { value: answer.add(E(1)), trap: 'slip of one' },
    { value: answer.mul(frac(1, 2)), trap: 'halved the total' },
    { value: xs.reduce((acc, x, i) => acc.add(frac(tenths[2 - i] * x, 10)), Exact.ZERO), trap: 'paired the values with the wrong probabilities' },
  ])));
  if (distractors.length < 4) return null;
  const probs = tenths.map((t) => (t / 10).toString());
  return {
    stem: `A random variable $X$ takes the value $${xs[0]}$ with probability $${probs[0]}$, the value $${xs[1]}$ with probability $${probs[1]}$ and the value $${xs[2]}$ with probability $${probs[2]}$. Find $E(X)$.`,
    answer: { kind: 'exact', value: answer, format: 'decimal' },
    options: valueOptions(rng, answer, distractors, 'decimal'),
    solution: `$E(X) = \\sum xp = ${xs.map((x, i) => `${x} \\times ${probs[i]}`).join(' + ')} = ${answer.toLatex({ format: 'decimal' })}$.`,
    trap: 'E(X) = Σ x p: each value is weighted by its own probability, not averaged.',
    tags: ['probability', 'expected-value', 'distribution'],
    params: { variant: 'distribution', xs, tenths },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 5

function fairGameQ(rng: RNG): Generated | null {
  const [pn, pd] = rng.pick([[1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [2, 5], [3, 10]]);
  const p = frac(pn, pd);
  const findPrize = rng.bool();
  if (findPrize) {
    // stake given, prize unknown: prize × p = stake
    const cost = rng.int(1, 6);
    const answer = attempt(() => E(cost).div(p));
    if (!answer || !answer.isInteger() || answer.toNumber() > 60 || !isCleanExact(answer).ok) return null;
    // Money: every option has to be an amount that can actually be paid, printed as the
    // exam prints it (£7.50, not 15/2).
    const distractors = ranked(rng, answer, decimalOnly(cleanOnly([
      { value: p.mul(E(cost)), trap: 'multiplied the stake by the probability instead of dividing' },
      { value: answer.sub(E(cost)), trap: 'forgot that the prize includes the stake back' },
      { value: E(cost).mul(E(pd)), trap: 'ignored the numerator of the probability' },
      { value: attempt(() => E(cost).div(E(1).sub(p))), trap: 'used the probability of losing' },
    ])), decimalOnly(cleanOnly([
      { value: answer.add(E(1)), trap: 'slip of one' },
      { value: answer.mul(E(2)), trap: 'doubled the prize' },
      { value: E(cost + pd), trap: 'added the stake to the denominator' },
    ])));
    if (distractors.length < 4) return null;
    return {
      stem: `A game costs £${cost} to play. The player wins a prize of £$x$ with probability $${tx(p)}$ and nothing otherwise. Find the value of $x$ that makes the game fair.`,
      answer: { kind: 'exact', value: answer, format: 'decimal' },
      options: valueOptions(rng, answer, distractors, 'decimal'),
      solution: `Fair means expected winnings equal the stake: $${tx(p)}x = ${cost}$, so $x = ${tx(answer)}$.`,
      trap: 'A fair game has E(winnings) = stake, so divide by the probability rather than multiplying.',
      tags: ['probability', 'expected-value', 'fair-game'],
      params: { variant: 'fair-prize', pn, pd, cost },
      typedAllowed: true,
    };
  }
  // two prizes given, find the fair stake
  const [qn, qd] = rng.pick([[1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [3, 10]]);
  const q = frac(qn, qd);
  if (p.add(q).toNumber() >= 1) return null;
  const m1 = rng.int(2, 20);
  const m2 = rng.int(1, 10);
  const answer = p.mul(E(m1)).add(q.mul(E(m2)));
  if (!isCleanExact(answer).ok || answer.isZero()) return null;
  // A stake is a price: it has to be a whole number of pence (denominator dividing 20),
  // and it is printed as £6.30 rather than 63/10.
  if (20 % Number(answer.toRat().d) !== 0) return null;
  const distractors = ranked(rng, answer, decimalOnly(cleanOnly([
    { value: E(m1 + m2), trap: 'added the prizes, ignoring the probabilities' },
    { value: p.mul(E(m1)), trap: 'used only the larger prize' },
    { value: p.add(q).mul(E(m1 + m2)), trap: 'multiplied the total probability by the total prize' },
    { value: q.mul(E(m1)).add(p.mul(E(m2))), trap: 'paired the prizes with the wrong probabilities' },
  ])), decimalOnly(cleanOnly([
    { value: answer.mul(E(2)), trap: 'doubled the expected winnings' },
    { value: answer.add(E(1)), trap: 'slip of one' },
    { value: frac(m1 + m2, 2), trap: 'averaged the two prizes' },
    { value: E(1).sub(p).sub(q).mul(E(m1 + m2)), trap: 'used the probability of winning nothing' },
  ])));
  if (distractors.length < 4) return null;
  return {
    stem: `In a game the player wins £${m1} with probability $${tx(p)}$ and £${m2} with probability $${tx(q)}$; otherwise nothing is won. Find the stake, in pounds, that makes the game fair.`,
    answer: { kind: 'exact', value: answer, format: 'decimal' },
    options: valueOptions(rng, answer, distractors, 'decimal'),
    solution: `Expected winnings $= ${tx(p)} \\times ${m1} + ${tx(q)} \\times ${m2} = ${tx(answer)}$, and a fair stake equals the expected winnings.`,
    trap: 'A fair stake is the expected winnings Σ x p, not the average prize.',
    tags: ['probability', 'expected-value', 'fair-game'],
    params: { variant: 'fair-stake', pn, pd, qn, qd, m1, m2 },
    typedAllowed: true,
  };
}

/**
 * Probabilities given as fractions in words. One spin is the plain Σ x p; the other two
 * shapes add the level-5 step of using E(X) again (two spins, or E(aX + b)).
 */
type SpinAsk = 'single' | 'two' | 'payout';

function fractionSpinnerQ(rng: RNG): Generated | null {
  const d = rng.pick([6, 8, 10, 12]);
  const a = rng.int(1, d - 2);
  const b = rng.int(1, d - a - 1);
  const c = d - a - b;
  const parts = [a, b, c];
  if (new Set(parts).size === 1) return null; // "biased" must really be biased
  const xs = rng.pickDistinct([1, 2, 3, 4, 5, 6, 8, 10], 3).sort((x, y) => x - y);
  const mean = xs.reduce((acc, x, i) => acc.add(frac(parts[i] * x, d)), Exact.ZERO);
  if (!isCleanExact(mean).ok || mean.isZero()) return null;
  if (Number(mean.toRat().d) > 6) return null;
  const plainMean = frac(xs[0] + xs[1] + xs[2], 3);
  if (plainMean.equals(mean)) return null; // the probabilities would make no difference
  const reversed = xs.reduce((acc, x, i) => acc.add(frac(parts[2 - i] * x, d)), Exact.ZERO);
  const maxPart = Math.max(...parts);
  const uniqueMode = parts.filter((t) => t === maxPart).length === 1;
  const pf = parts.map((t) => {
    const g = gcd(t, d);
    return frac(t / g, d / g);
  });
  const ask = rng.pick(['single', 'two', 'payout'] as SpinAsk[]);
  const k = ask === 'payout' ? rng.int(2, 5) : 1;
  const j = ask === 'payout' ? rng.nonZeroInt(-6, 6) : 0;
  const answer = ask === 'single' ? mean : ask === 'two' ? mean.mul(E(2)) : mean.mul(E(k)).add(E(j));
  if (!isCleanExact(answer).ok || answer.isZero()) return null;
  let question: string;
  let solution: string;
  let must: { value: Exact | null; trap: string }[];
  let extra: { value: Exact | null; trap: string }[];
  const sumTerms = xs.map((x, i) => `${tx(pf[i])} \\times ${x}`).join(' + ');
  if (ask === 'single') {
    question = 'Find the expected score for one spin.';
    solution = `$E(X) = ${sumTerms} = ${tx(mean)}$.`;
    must = [
      { value: plainMean, trap: 'averaged the three scores, ignoring the probabilities' },
      { value: E(xs[0] + xs[1] + xs[2]), trap: 'added the scores' },
      { value: uniqueMode ? E(xs[parts.indexOf(maxPart)]) : null, trap: 'gave the most likely score' },
      { value: reversed, trap: 'paired the scores with the wrong probabilities' },
    ];
    extra = [
      { value: mean.mul(E(3)), trap: 'multiplied by the number of outcomes' },
      { value: mean.add(E(1)), trap: 'slip of one' },
      { value: mean.mul(frac(1, 2)), trap: 'halved the total' },
    ];
  } else if (ask === 'two') {
    question = 'The spinner is spun twice. Find the expected value of the total score.';
    solution = `$E(X) = ${sumTerms} = ${tx(mean)}$, and expectation adds, so the expected total is $2 \\times ${tx(mean)} = ${tx(answer)}$.`;
    must = [
      { value: mean, trap: 'gave the expected score for one spin only' },
      { value: mean.mul(mean), trap: 'multiplied the two spins instead of adding them' },
      { value: plainMean.mul(E(2)), trap: 'averaged the three scores, ignoring the probabilities' },
      { value: reversed.mul(E(2)), trap: 'paired the scores with the wrong probabilities' },
    ];
    extra = [
      { value: E(2 * (xs[0] + xs[1] + xs[2])), trap: 'added the scores and doubled' },
      { value: mean.mul(frac(1, 2)), trap: 'halved instead of doubling' },
      { value: E(2 * xs[2]), trap: 'assumed the highest score both times' },
    ];
  } else {
    question = `The random variable $X$ is the score on one spin. Find $E(${k}X ${j > 0 ? `+ ${j}` : `- ${-j}`})$.`;
    solution = `$E(X) = ${sumTerms} = ${tx(mean)}$, so $E(${k}X ${j > 0 ? '+' : '-'} ${Math.abs(j)}) = ${k} \\times ${tx(mean)} ${j > 0 ? '+' : '-'} ${Math.abs(j)} = ${tx(answer)}$.`;
    must = [
      { value: mean.mul(E(k)), trap: `forgot the $${j > 0 ? '+' : '-'} ${Math.abs(j)}$` },
      { value: mean.add(E(j)), trap: `forgot to multiply $E(X)$ by $${k}$` },
      { value: mean.add(E(j)).mul(E(k)), trap: `multiplied the constant by $${k}$ as well` },
      { value: mean.mul(E(k)).sub(E(j)), trap: 'used the constant with the wrong sign' },
    ];
    extra = [
      { value: plainMean.mul(E(k)).add(E(j)), trap: 'averaged the three scores, ignoring the probabilities' },
      { value: mean, trap: 'gave $E(X)$ rather than $E(aX + b)$' },
      { value: reversed.mul(E(k)).add(E(j)), trap: 'paired the scores with the wrong probabilities' },
    ];
  }
  const distractors = ranked(rng, answer, cleanOnly(must), cleanOnly(extra));
  return {
    stem: `A biased spinner scores $${xs[0]}$ with probability $${tx(pf[0])}$, $${xs[1]}$ with probability $${tx(pf[1])}$ and $${xs[2]}$ with probability $${tx(pf[2])}$. ${question}`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: valueOptions(rng, answer, distractors),
    solution,
    trap: 'E(X) = Σ x p — weight each score by its own probability, then E(aX + b) = aE(X) + b.',
    tags: ['probability', 'expected-value', 'spinner'],
    params: { variant: 'fraction-spinner', xs, parts, d, ask, k, j },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'm1.probability.expected-value',
  module: 'M1',
  topic: 'probability',
  title: 'Dice, spinners and expected value',
  levels: {
    1: 'P(total = 7) = 1/6, P(at least one six in two rolls) = 11/36',
    2: 'the expected score of a spinner with repeated sectors',
    3: 'a £2 stake, a £5 prize with probability ¼ → expected profit −¾',
    4: 'expected number of sixes in 12 rolls, or E(X) from a distribution in words',
    5: 'the fair stake or fair prize, or E(X) and E(aX + b) with probabilities given as fractions',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      if (level === 1) return pickVariant(rng, [diceSumQ, atLeastOneQ]);
      if (level === 2) return spinnerQ(rng);
      if (level === 3) return gameQ(rng);
      if (level === 4) return pickVariant(rng, [trialsQ, distributionQ]);
      return pickVariant(rng, [fairGameQ, fractionSpinnerQ]);
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const got = q.answer.value.toNumber();
    const close = (x: number) => Number.isFinite(x) && Math.abs(got - x) < 1e-9 * Math.max(1, Math.abs(x));
    /** Average a list of equally likely outcome values, one at a time. */
    const meanOf = (outcomes: number[]): number => {
      let sum = 0;
      for (const v of outcomes) sum += v;
      return sum / outcomes.length;
    };
    /** The sample space of a spinner: one entry per sector. */
    const sectors = (values: number[], counts: number[]): number[] => {
      const out: number[] = [];
      counts.forEach((f, i) => { for (let s = 0; s < f; s++) out.push(values[i]); });
      return out;
    };
    const p = q.params as {
      variant: string; mode?: string; s?: number; faces?: number; good?: number; n?: number;
      values?: number[]; freqs?: number[]; pn?: number; pd?: number; qn?: number; qd?: number;
      prize?: number; cost?: number; xs?: number[]; tenths?: number[]; parts?: number[]; d?: number;
      m1?: number; m2?: number; ask?: SpinAsk; k?: number; j?: number;
    };
    switch (p.variant) {
      case 'dice-total': {
        // Enumerate the 36 ordered pairs.
        let hits = 0;
        for (let a = 1; a <= 6; a++) {
          for (let b = 1; b <= 6; b++) {
            const t = a + b;
            if (p.mode === 'equal' ? t === p.s : p.mode === 'atleast' ? t >= p.s! : t <= p.s!) hits++;
          }
        }
        return close(hits / 36);
      }
      case 'at-least-one': {
        // Enumerate every sequence of n trials over `faces` faces.
        const { faces, good, n } = p as { faces: number; good: number; n: number };
        const total = faces ** n;
        let hits = 0;
        for (let code = 0; code < total; code++) {
          let x = code;
          let any = false;
          for (let i = 0; i < n; i++) { if (x % faces < good) any = true; x = Math.floor(x / faces); }
          if (any) hits++;
        }
        return close(hits / total);
      }
      case 'spinner': {
        // Build the sample space (one entry per sector) and average it, rather than
        // re-running the Σ f·v that generate() used.
        const { values, freqs, n } = p as { values: number[]; freqs: number[]; n: number };
        const space = sectors(values, freqs);
        if (space.length !== n) return false;
        return close(meanOf(space));
      }
      case 'game': {
        // Enumerate the pd equally likely outcomes of one play: pn of them win the prize.
        const { pn, pd, prize, cost } = p as { pn: number; pd: number; prize: number; cost: number };
        const plays: number[] = [];
        for (let i = 0; i < pd; i++) plays.push(i < pn ? prize - cost : -cost);
        return close(meanOf(plays));
      }
      case 'trials': {
        // Build the whole distribution of the count trial by trial, then take Σ k·P(k).
        const { pn, pd, n } = p as { pn: number; pd: number; n: number };
        const prob = pn / pd;
        let dist = [1];
        for (let i = 0; i < n; i++) {
          const next = new Array<number>(dist.length + 1).fill(0);
          dist.forEach((w, k) => { next[k] += w * (1 - prob); next[k + 1] += w * prob; });
          dist = next;
        }
        const total = dist.reduce((acc, w) => acc + w, 0);
        if (Math.abs(total - 1) > 1e-9) return false;
        return close(dist.reduce((acc, w, k) => acc + k * w, 0));
      }
      case 'distribution': {
        // Enumerate the ten equally likely tenths.
        const { xs, tenths } = p as { xs: number[]; tenths: number[] };
        const space = sectors(xs, tenths);
        if (space.length !== 10) return false;
        return close(meanOf(space));
      }
      case 'fair-prize':
        // The game is fair when the expected winnings equal the stake.
        return Math.abs((p.pn! / p.pd!) * got - p.cost!) < 1e-9;
      case 'fair-stake': {
        // Enumerate L equally likely outcomes and check the expected profit at this stake is 0.
        const { pn, pd, qn, qd, m1, m2 } = p as { pn: number; pd: number; qn: number; qd: number; m1: number; m2: number };
        const L = lcm(pd, qd);
        const win1 = (pn * L) / pd, win2 = (qn * L) / qd;
        if (!Number.isInteger(win1) || !Number.isInteger(win2) || win1 + win2 > L) return false;
        const plays: number[] = [];
        for (let i = 0; i < L; i++) plays.push(i < win1 ? m1 - got : i < win1 + win2 ? m2 - got : -got);
        return Math.abs(meanOf(plays)) < 1e-9 * Math.max(1, m1);
      }
      case 'fraction-spinner': {
        // Enumerate the d equally likely sectors, average them, then apply the asked-for step.
        const { xs, parts, d, ask, k, j } = p as { xs: number[]; parts: number[]; d: number; ask: SpinAsk; k: number; j: number };
        const space = sectors(xs, parts);
        if (space.length !== d) return false;
        const mean = meanOf(space);
        return close(ask === 'single' ? mean : ask === 'two' ? 2 * mean : k * mean + j);
      }
      default:
        return false;
    }
  },
});
