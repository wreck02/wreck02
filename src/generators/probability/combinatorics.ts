import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, Exact } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { factorial, nCr } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Arrangements and selections.
 * Level 1: n! for n ≤ 6 distinct objects, or nCr with n ≤ 8
 * Level 2: committees — a product of two selections, 5C2 × 4C1
 * Level 3: arrangements with repeated letters (LEVEL = 30), or two people together (2 × 4!)
 * Level 4: "at least one girl" by the complement, or a fixed first/last position
 * Level 5: routes across a grid, diagonals of a polygon, identical objects shared out
 *
 * Every answer is verified by brute-force enumeration, never by the formula that generated it.
 */

// ----------------------------------------------------------------------------- brute force

/** Visit every permutation of the given items (n ≤ 7 in this template). */
function forEachPermutation(items: string[], visit: (p: string[]) => void): void {
  const n = items.length;
  const used = new Array<boolean>(n).fill(false);
  const cur: string[] = [];
  const go = () => {
    if (cur.length === n) { visit(cur); return; }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      used[i] = true;
      cur.push(items[i]);
      go();
      cur.pop();
      used[i] = false;
    }
  };
  go();
}

/** Number of permutations satisfying a predicate. */
function countPermutations(items: string[], pred: (p: string[]) => boolean = () => true): number {
  let n = 0;
  forEachPermutation(items, (p) => { if (pred(p)) n++; });
  return n;
}

/** Number of *distinct* strings formed by permuting the letters (handles repeats). */
function countDistinctArrangements(letters: string[]): number {
  const seen = new Set<string>();
  forEachPermutation(letters, (p) => seen.add(p.join('')));
  return seen.size;
}

const bitCount = (m: number): number => {
  let c = 0;
  for (let x = m; x; x >>= 1) c += x & 1;
  return c;
};

/** Number of subsets of {0..n−1} satisfying a predicate on the bitmask. */
function countSubsets(n: number, pred: (mask: number) => boolean): number {
  let c = 0;
  for (let m = 0; m < 1 << n; m++) if (pred(m)) c++;
  return c;
}

/** Monotone lattice paths across an a × b grid, counted by dynamic programming. */
function countPaths(a: number, b: number): number {
  const row = new Array<number>(b + 1).fill(1);
  for (let i = 1; i <= a; i++) for (let j = 1; j <= b; j++) row[j] += row[j - 1];
  return row[b];
}

/** Ways to split k identical objects between b boxes with at least `min` in each. */
function countCompositions(k: number, b: number, min: number): number {
  if (b === 1) return k >= min ? 1 : 0;
  let total = 0;
  for (let i = min; i <= k - min * (b - 1); i++) total += countCompositions(k - i, b - 1, min);
  return total;
}

// ----------------------------------------------------------------------------- option plumbing

function cleanOnly(ds: { value: number | null; trap: string }[], answer: number): Distractor[] {
  const out: Distractor[] = [];
  for (const d of ds) {
    if (d.value === null || !Number.isInteger(d.value) || d.value <= 0 || d.value === answer) continue;
    if (d.value > 40 * answer + 200) continue; // an option ten times too big gives the answer away
    const v = E(d.value);
    if (!isCleanExact(v).ok) continue;
    out.push({ value: v, trap: d.trap });
  }
  return out;
}

/**
 * Choose the distractors that go to buildOptions: every distinct `must` candidate (the spec-named traps)
 * is used before any `extra` one, so the headline mistakes are never shuffled out by weaker ones.
 */
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

/** Padding that still looks like a count. */
function countFallback(answer: number): Exact[] {
  return [answer * 2, answer + 1, Math.round(answer / 2), answer - 1, answer + 2, answer * 3, answer - 2]
    .filter((v) => Number.isInteger(v) && v > 0)
    .map((v) => E(v));
}

function countOptions(rng: RNG, answer: number, must: { value: number | null; trap: string }[], extra: { value: number | null; trap: string }[]) {
  const a = E(answer);
  return buildOptions(rng, a, ranked(rng, a, cleanOnly(must, answer), cleanOnly(extra, answer)), { fallback: countFallback(answer) });
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

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ----------------------------------------------------------------------------- level 1

const DISTINCT_ITEMS: Record<number, string[]> = {
  3: ['different flags', 'different medals', 'different keys'],
  4: ['different photographs', 'different trophies', 'different posters'],
  5: ['different paintings', 'different plants', 'different flags'],
  6: ['different books', 'different cards', 'different mugs'],
};

function arrangeQ(rng: RNG): Generated | null {
  const n = rng.int(3, 6);
  const answer = factorial(n);
  const thing = rng.pick(DISTINCT_ITEMS[n]);
  const stem = rng.bool(0.5)
    ? `In how many different orders can ${WORDS[n]} ${thing} be placed in a row?`
    : `${cap(WORDS[n])} people are to be photographed standing in a line. In how many different orders can they stand?`;
  return {
    stem,
    answer: { kind: 'exact', value: E(answer) },
    options: countOptions(rng, answer, [
      { value: factorial(n - 1), trap: 'used $(n-1)!$: every one of the n objects can go first' },
      { value: n * n, trap: 'used $n^{2}$ instead of $n!$' },
    ], [
      { value: n * (n - 1), trap: 'stopped after filling the first two places' },
      { value: factorial(n) / 2, trap: 'halved, as if two of the objects were identical' },
      { value: 2 * n, trap: 'doubled n' },
      { value: factorial(n + 1), trap: 'used $(n+1)!$' },
    ]),
    solution: `$${n}$ choices for the first place, $${n - 1}$ for the second, and so on: $${n}! = ${Array.from({ length: n }, (_, i) => n - i).join(' \\times ')} = ${answer}$.`,
    trap: 'n distinct objects in a row: n!, not n² and not (n − 1)!.',
    tags: ['counting', 'permutations', 'factorial'],
    params: { variant: 'arrange', n },
    typedAllowed: true,
  };
}

function chooseQ(rng: RNG): Generated | null {
  const n = rng.int(5, 8);
  const r = rng.pick([2, 3].filter((v) => v <= n - 2));
  const answer = nCr(n, r);
  const stem = rng.pick([
    `In how many ways can a team of ${WORDS[r]} be chosen from ${WORDS[n]} players?`,
    `A group of ${WORDS[r]} pupils is to be chosen from a class of ${WORDS[n]}. How many different groups are possible?`,
    `How many different ${r}-topping pizzas can be made from ${WORDS[n]} available toppings?`,
  ]);
  return {
    stem,
    answer: { kind: 'exact', value: E(answer) },
    options: countOptions(rng, answer, [
      { value: factorial(n) / factorial(n - r), trap: 'counted the orders as different: $^{n}P_{r}$ instead of $^{n}C_{r}$' },
      { value: n * r, trap: 'multiplied n by r' },
    ], [
      { value: nCr(n, r - 1), trap: 'off by one in r' },
      { value: nCr(n, r + 1), trap: 'off by one in r' },
      { value: nCr(n - 1, r), trap: 'off by one in n' },
      { value: factorial(n) / factorial(n - r) / r, trap: 'divided by r instead of r!' },
      { value: n + r, trap: 'added instead of choosing' },
    ]),
    solution: `Order does not matter: $^{${n}}C_{${r}} = \\frac{${Array.from({ length: r }, (_, i) => n - i).join(' \\times ')}}{${Array.from({ length: r }, (_, i) => r - i).join(' \\times ')}} = ${answer}$.`,
    trap: 'A selection is unordered — divide the r-permutations by r!.',
    tags: ['counting', 'combinations'],
    params: { variant: 'choose', n, r },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 2: committees

function committeeQ(rng: RNG): Generated | null {
  const nb = rng.int(4, 6);
  const ng = rng.int(3, 5);
  const rb = rng.int(1, 3);
  const rg = rng.int(1, 2);
  if (rb > nb - 1 || rg > ng - 1 || rb + rg < 3) return null;
  const answer = nCr(nb, rb) * nCr(ng, rg);
  if (answer > 300) return null;
  return {
    stem: `A committee of ${WORDS[rb + rg]} is to be chosen from ${WORDS[nb]} boys and ${WORDS[ng]} girls. In how many ways can it be chosen if it must contain exactly ${WORDS[rb]} ${rb === 1 ? 'boy' : 'boys'} and ${WORDS[rg]} ${rg === 1 ? 'girl' : 'girls'}?`,
    answer: { kind: 'exact', value: E(answer) },
    options: countOptions(rng, answer, [
      { value: nCr(nb, rb) + nCr(ng, rg), trap: 'added the two selections instead of multiplying them' },
      { value: nCr(nb + ng, rb + rg), trap: 'ignored the split and chose from everybody' },
      { value: nCr(nb, rg) * nCr(ng, rb), trap: 'swapped the numbers of boys and girls required' },
    ], [
      { value: (factorial(nb) / factorial(nb - rb)) * nCr(ng, rg), trap: 'counted the boys in order ($^{n}P_{r}$)' },
      { value: nCr(nb, rb) * ng, trap: 'forgot that the girls are also chosen from a group' },
      { value: nCr(nb, rb + 1) * nCr(ng, rg), trap: 'off by one in the number of boys' },
      { value: nCr(nb + ng, rb) * nCr(ng, rg), trap: 'chose the boys from everybody' },
    ]),
    solution: `Choose the boys and the girls independently, then multiply: $^{${nb}}C_{${rb}} \\times {}^{${ng}}C_{${rg}} = ${nCr(nb, rb)} \\times ${nCr(ng, rg)} = ${answer}$.`,
    trap: 'Independent choices multiply; adding them counts committees that are not complete.',
    tags: ['counting', 'combinations', 'committees'],
    params: { variant: 'committee', nb, ng, rb, rg },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 3

const REPEAT_WORDS = ['LEVEL', 'APPLE', 'TOTAL', 'ERROR', 'RADAR', 'ADDED', 'BANANA', 'LETTER', 'COMMON', 'PEPPER', 'MAXIMA', 'SPEED'];

function repeatsQ(rng: RNG): Generated | null {
  const word = rng.pick(REPEAT_WORDS);
  const letters = word.split('');
  const n = letters.length;
  const counts = new Map<string, number>();
  for (const ch of letters) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  const mults = [...counts.values()].filter((m) => m > 1);
  const divisor = mults.reduce((acc, m) => acc * factorial(m), 1);
  const answer = factorial(n) / divisor;
  const repeatText = [...counts.entries()].filter(([, m]) => m > 1).map(([ch, m]) => `${m} $\\text{${ch}}$s`).join(' and ');
  return {
    stem: `How many different arrangements are there of the letters of the word ${word}?`,
    answer: { kind: 'exact', value: E(answer) },
    options: countOptions(rng, answer, [
      { value: factorial(n), trap: 'forgot to divide by the repeats' },
      { value: mults.length > 1 ? factorial(n) / 2 : factorial(n) / factorial(mults[0] + 1), trap: mults.length > 1 ? 'divided by only one of the repeated pairs' : 'divided by the wrong factorial' },
      { value: factorial(n - mults.length), trap: 'removed the repeated letters instead of dividing' },
    ], [
      { value: factorial(n) / (divisor * 2), trap: 'divided by one factor too many' },
      { value: factorial(n - 1), trap: 'used $(n-1)!$' },
      { value: answer * 2, trap: 'doubled the count' },
      { value: n * n, trap: 'used $n^{2}$' },
    ]),
    solution: `${word} has $${n}$ letters with ${repeatText}, so the number of arrangements is $\\frac{${n}!}{${mults.map((m) => `${m}!`).join(' \\times ')}} = \\frac{${factorial(n)}}{${divisor}} = ${answer}$.`,
    trap: 'Swapping two identical letters does not give a new arrangement: divide n! by k! for each repeated letter.',
    tags: ['counting', 'permutations', 'repeats'],
    params: { variant: 'repeats', word },
    typedAllowed: true,
  };
}

function togetherQ(rng: RNG): Generated | null {
  const n = rng.int(4, 6);
  const answer = 2 * factorial(n - 1);
  const stem = rng.bool(0.5)
    ? `${cap(WORDS[n])} people stand in a line. In how many of the arrangements are two particular people standing next to each other?`
    : `${cap(WORDS[n])} different books are arranged on a shelf. In how many arrangements are two particular books next to each other?`;
  return {
    stem,
    answer: { kind: 'exact', value: E(answer) },
    options: countOptions(rng, answer, [
      { value: factorial(n - 1), trap: 'forgot that the pair can be in two orders' },
      { value: factorial(n), trap: 'ignored the restriction' },
      { value: factorial(n) - 2 * factorial(n - 1), trap: 'found the arrangements with the pair apart' },
    ], [
      { value: 2 * factorial(n), trap: 'doubled n! instead of (n−1)!' },
      { value: factorial(n - 2) * 2, trap: 'treated the block as two removed objects' },
      { value: factorial(n) / 2, trap: 'halved n!' },
    ]),
    solution: `Tie the pair together as one object: $${n - 1}$ objects arrange in $${n - 1}! = ${factorial(n - 1)}$ ways, and the pair itself in $2$ ways, giving $2 \\times ${factorial(n - 1)} = ${answer}$.`,
    trap: 'Treat the pair as a single block, then multiply by 2! for the order inside the block.',
    tags: ['counting', 'permutations', 'block'],
    params: { variant: 'together', n },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 4

function atLeastOneQ(rng: RNG): Generated | null {
  const nb = rng.int(4, 6);
  const ng = rng.int(2, 4);
  const r = rng.int(3, 4);
  if (r > nb) return null; // the complement must be possible
  const total = nCr(nb + ng, r);
  const answer = total - nCr(nb, r);
  if (answer <= 0 || total > 220) return null;
  return {
    stem: `A team of ${WORDS[r]} is to be chosen from ${WORDS[nb]} boys and ${WORDS[ng]} girls. In how many ways can the team be chosen if it must include at least one girl?`,
    answer: { kind: 'exact', value: E(answer) },
    options: countOptions(rng, answer, [
      { value: total, trap: 'ignored the condition and counted every team' },
      { value: nCr(nb, r), trap: 'counted the teams with no girls (the complement itself)' },
      { value: ng * nCr(nb + ng - 1, r - 1), trap: 'picked one girl first and the rest freely — that counts teams more than once' },
      { value: ng * nCr(nb, r - 1), trap: 'counted only the teams with exactly one girl' },
    ], [
      { value: total - nCr(ng, r), trap: 'subtracted the all-girl teams instead of the all-boy ones' },
      { value: total - nb, trap: 'subtracted the number of boys' },
      { value: nCr(nb + ng - 1, r - 1), trap: 'fixed one girl and forgot how many girls there are' },
    ]),
    solution: `Use the complement: all teams minus the all-boy teams, $^{${nb + ng}}C_{${r}} - {}^{${nb}}C_{${r}} = ${total} - ${nCr(nb, r)} = ${answer}$.`,
    trap: '"At least one" is total − none; choosing a girl first and the rest freely double-counts.',
    tags: ['counting', 'combinations', 'complement'],
    params: { variant: 'at-least-one', nb, ng, r },
    typedAllowed: true,
  };
}

const FIXED_WORDS = ['NUMBER', 'PLANET', 'FACTOR', 'SQUARE', 'MEDIAN'];

function fixedPositionQ(rng: RNG): Generated | null {
  const word = rng.pick(FIXED_WORDS);
  const letters = word.split('');
  if (new Set(letters).size !== letters.length) return null;
  const n = letters.length;
  const vowels = letters.filter((ch) => 'AEIOU'.includes(ch));
  const mode = rng.pick(['first-letter', 'vowel-first', 'ends']);
  let answer: number;
  let ask: string;
  let how: string;
  if (mode === 'first-letter') {
    answer = factorial(n - 1);
    ask = `begin with the letter $\\text{${letters[0]}}$`;
    how = `Fix $\\text{${letters[0]}}$ in the first place; the other $${n - 1}$ letters arrange in $${n - 1}! = ${answer}$ ways.`;
  } else if (mode === 'vowel-first') {
    answer = vowels.length * factorial(n - 1);
    ask = 'begin with a vowel';
    how = `There are $${vowels.length}$ choices for the first letter, then $${n - 1}! = ${factorial(n - 1)}$ arrangements of the rest: $${vowels.length} \\times ${factorial(n - 1)} = ${answer}$.`;
  } else {
    answer = 2 * factorial(n - 1);
    ask = `have the letter $\\text{${letters[0]}}$ at one of the two ends`;
    how = `$2$ choices of end for $\\text{${letters[0]}}$ and $${n - 1}! = ${factorial(n - 1)}$ for the rest: $2 \\times ${factorial(n - 1)} = ${answer}$.`;
  }
  return {
    stem: `How many arrangements of the letters of the word ${word} ${ask}?`,
    answer: { kind: 'exact', value: E(answer) },
    options: countOptions(rng, answer, [
      { value: factorial(n), trap: 'counted every arrangement, ignoring the restriction' },
      { value: mode === 'first-letter' ? factorial(n - 2) : factorial(n - 1), trap: 'forgot how many ways the fixed place can be filled' },
      { value: mode === 'vowel-first' ? vowels.length * factorial(n) : factorial(n) / 2, trap: mode === 'vowel-first' ? 'used n! for the remaining letters' : 'halved n! instead of fixing a place' },
    ], [
      { value: factorial(n - 1) * (n - 1), trap: 'used the wrong number of free choices' },
      { value: factorial(n) - factorial(n - 1), trap: 'found the arrangements that do not satisfy the condition' },
      { value: (n - 1) * (n - 1), trap: 'multiplied instead of using a factorial' },
      { value: 3 * factorial(n - 1), trap: 'miscounted the choices for the fixed place' },
    ]),
    solution: how,
    trap: 'Fill the restricted place first, then arrange the remaining letters freely.',
    tags: ['counting', 'permutations', 'restriction'],
    params: { variant: 'fixed', word, mode },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 5

function gridQ(rng: RNG): Generated | null {
  const a = rng.int(2, 5);
  const b = rng.int(2, 5);
  if (a + b > 8) return null;
  const answer = nCr(a + b, a);
  return {
    stem: `A counter starts at the bottom-left corner of a grid of squares that is $${a}$ squares wide and $${b}$ squares tall. Each move takes it one square right or one square up. In how many different ways can it reach the top-right corner?`,
    answer: { kind: 'exact', value: E(answer) },
    options: countOptions(rng, answer, [
      { value: factorial(a + b), trap: 'treated the moves as all different: $(a+b)!$' },
      { value: a * b, trap: 'multiplied the two side lengths' },
      { value: 2 ** (a + b), trap: 'allowed a free choice of direction at every step' },
      { value: nCr(a + b, a) * 2, trap: 'doubled for "right or up"' },
    ], [
      { value: nCr(a + b + 1, a), trap: 'counted moves instead of squares (off by one)' },
      { value: nCr(a + b, a - 1), trap: 'off by one in the number of right moves' },
      { value: factorial(a) * factorial(b), trap: 'arranged the two kinds of move separately' },
      { value: a + b, trap: 'counted the number of moves' },
    ]),
    solution: `Every route is $${a}$ rights and $${b}$ ups in some order: choose which $${a}$ of the $${a + b}$ moves are rights, $^{${a + b}}C_{${a}} = ${answer}$.`,
    trap: 'A route is a word made of R and U — count the arrangements, not the squares.',
    tags: ['counting', 'combinations', 'paths'],
    params: { variant: 'grid', a, b },
    typedAllowed: true,
  };
}

const POLYGONS: Record<number, string> = { 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon', 12: 'regular 12-sided polygon' };

function diagonalsQ(rng: RNG): Generated | null {
  const n = rng.pick([5, 6, 7, 8, 9, 10, 12]);
  const answer = (n * (n - 3)) / 2;
  return {
    stem: `How many diagonals does a ${POLYGONS[n]} have?`,
    answer: { kind: 'exact', value: E(answer) },
    options: countOptions(rng, answer, [
      { value: nCr(n, 2), trap: 'counted every pair of vertices, including the n sides' },
      { value: n * (n - 3), trap: 'forgot that each diagonal is counted from both ends' },
      { value: n, trap: 'confused diagonals with sides' },
      { value: (n * (n - 1)) / 2 - n + 1, trap: 'subtracted one side too many' },
    ], [
      { value: nCr(n, 2) - 1, trap: 'subtracted a single side' },
      { value: (n * (n - 2)) / 2, trap: 'used n − 2 instead of n − 3' },
      { value: 2 * n, trap: 'guessed two per vertex' },
    ]),
    solution: `Each pair of vertices gives a line: $^{${n}}C_{2} = ${nCr(n, 2)}$; $${n}$ of those are sides, leaving $${nCr(n, 2)} - ${n} = ${answer}$ diagonals.`,
    trap: 'Diagonals = pairs of vertices − sides; each diagonal joins two vertices, so do not double count.',
    tags: ['counting', 'combinations', 'polygons'],
    params: { variant: 'diagonals', n },
    typedAllowed: true,
  };
}

function sharingQ(rng: RNG): Generated | null {
  const b = rng.pick([3, 3, 4]);
  const k = rng.int(b + 3, b + 6);
  const answer = nCr(k - 1, b - 1);
  if (answer > 200) return null;
  const item = rng.pick(['identical sweets', 'identical stickers', 'identical marbles']);
  return {
    stem: `${cap(WORDS[k])} ${item} are shared between ${WORDS[b]} children so that each child gets at least one. In how many different ways can this be done?`,
    answer: { kind: 'exact', value: E(answer) },
    options: countOptions(rng, answer, [
      { value: nCr(k + b - 1, b - 1), trap: 'allowed a child to receive nothing' },
      { value: nCr(k, b - 1), trap: 'off by one: used k gaps instead of k − 1' },
      { value: nCr(k, b), trap: 'chose which sweets to give, though they are identical' },
      { value: b ** (k - b), trap: 'gave each remaining sweet a free choice of child' },
    ], [
      { value: factorial(b), trap: 'arranged the children' },
      { value: nCr(k - 1, b), trap: 'off by one in the number of dividers' },
      { value: k * b, trap: 'multiplied the two numbers' },
    ]),
    solution: `Lay the ${WORDS[k]} ${item} out in a row and cut the line of $${k - 1}$ gaps in $${b - 1}$ places: $^{${k - 1}}C_{${b - 1}} = ${answer}$.`,
    trap: 'Stars and bars: choose the dividers from the k − 1 gaps, not from the k objects.',
    tags: ['counting', 'combinations', 'partitions'],
    params: { variant: 'sharing', k, b },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'm1.probability.combinatorics',
  module: 'M1',
  topic: 'probability',
  title: 'Arrangements and selections',
  levels: {
    1: 'n! with n ≤ 6, or nCr with n ≤ 8',
    2: 'committees: 5C2 × 4C1',
    3: 'repeated letters (LEVEL = 30), or two objects together (2 × 4!)',
    4: '"at least one girl" by the complement, or a restricted first/last place',
    5: 'routes across a grid, diagonals of a polygon, identical objects shared out',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      if (level === 1) return pickVariant(rng, [arrangeQ, chooseQ]);
      if (level === 2) return committeeQ(rng);
      if (level === 3) return pickVariant(rng, [repeatsQ, togetherQ]);
      if (level === 4) return pickVariant(rng, [atLeastOneQ, fixedPositionQ]);
      return pickVariant(rng, [gridQ, diagonalsQ, sharingQ]);
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact' || !q.answer.value.isInteger()) return false;
    const got = q.answer.value.toInt();
    const p = q.params as {
      variant: string; n?: number; r?: number; nb?: number; ng?: number; rb?: number; rg?: number;
      word?: string; mode?: string; a?: number; b?: number; k?: number;
    };
    const letters = (w: string) => w.split('');
    switch (p.variant) {
      case 'arrange':
        // Enumerate every ordering of n labelled objects.
        return got === countPermutations(Array.from({ length: p.n! }, (_, i) => String(i)));
      case 'choose':
        return got === countSubsets(p.n!, (m) => bitCount(m) === p.r!);
      case 'committee': {
        // Bits 0..nb−1 are boys, the rest girls.
        const { nb, ng, rb, rg } = p as { nb: number; ng: number; rb: number; rg: number };
        const boyMask = (1 << nb) - 1;
        return got === countSubsets(nb + ng, (m) => bitCount(m & boyMask) === rb && bitCount(m) - bitCount(m & boyMask) === rg);
      }
      case 'repeats':
        return got === countDistinctArrangements(letters(p.word!));
      case 'together': {
        const items = Array.from({ length: p.n! }, (_, i) => String(i));
        return got === countPermutations(items, (perm) => Math.abs(perm.indexOf('0') - perm.indexOf('1')) === 1);
      }
      case 'at-least-one': {
        const { nb, ng, r } = p as { nb: number; ng: number; r: number };
        const boyMask = (1 << nb) - 1;
        return got === countSubsets(nb + ng, (m) => bitCount(m) === r && bitCount(m & ~boyMask) >= 1);
      }
      case 'fixed': {
        const ls = letters(p.word!);
        const first = ls[0];
        const pred = p.mode === 'first-letter'
          ? (perm: string[]) => perm[0] === first
          : p.mode === 'vowel-first'
            ? (perm: string[]) => 'AEIOU'.includes(perm[0])
            : (perm: string[]) => perm[0] === first || perm[perm.length - 1] === first;
        return got === countPermutations(ls, pred);
      }
      case 'grid':
        return got === countPaths(p.a!, p.b!);
      case 'diagonals': {
        // Count vertex pairs that are not adjacent around the polygon.
        const n = p.n!;
        let c = 0;
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (j - i !== 1 && !(i === 0 && j === n - 1)) c++;
        return got === c;
      }
      case 'sharing':
        return got === countCompositions(p.k!, p.b!, 1);
      default:
        return false;
    }
  },
});
