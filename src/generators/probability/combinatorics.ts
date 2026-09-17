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
 * How many of the options should sit below the answer. The part of the sorted list the answer lands in
 * — near the bottom, in the middle, near the top — is drawn uniformly from the parts the candidate
 * mistakes can actually reach, so a candidate who recognises the variant learns nothing from where the
 * correct option sits. When every mistake falls on one side there is nothing to choose and the answer
 * sits where the mathematics puts it.
 */
function belowCount(rng: RNG, belowAvail: number, aboveAvail: number, count: number): number {
  const lo = Math.max(0, count - aboveAvail);
  const hi = Math.min(count, belowAvail);
  if (lo >= hi) return Math.min(lo, hi);
  const feasible: number[] = [];
  for (let k = lo; k <= hi; k++) feasible.push(k);
  const third = (k: number) => (2 * k < count ? 0 : 2 * k > count ? 2 : 1);
  const part = rng.pick([...new Set(feasible.map(third))]);
  return rng.pick(feasible.filter((k) => third(k) === part));
}

/**
 * Choose the distractors that go to buildOptions.
 *
 * Two jobs. The spec-named `must` candidates come first inside each side of the answer, so the headline
 * mistakes are never shuffled out by weaker ones. And the number of options that sit *below* the answer
 * is drawn at random, so the correct option is not pinned to one slot. Almost every counting mistake
 * overshoots — $n!$ instead of $(n-1)!$, every pair of vertices instead of the diagonals, sharing that
 * lets a child get nothing — so taking the musts blindly puts the answer second from the bottom in
 * every question, and "pick the second smallest" scores 100%. Each variant therefore also supplies
 * undercounts, and this picks from both sides.
 */
function ranked(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], count = 4): Distractor[] {
  const a = answer.toNumber();
  const seen: Exact[] = [answer];
  const fresh: Distractor[] = [];
  for (const d of [...must, ...rng.shuffle(extra)]) {
    if (seen.some((s) => s.equals(d.value))) continue;
    seen.push(d.value);
    fresh.push(d);
  }
  const below = fresh.filter((d) => d.value.toNumber() < a);
  const above = fresh.filter((d) => d.value.toNumber() > a);
  const nBelow = belowCount(rng, below.length, above.length, count);
  return [...below.slice(0, nBelow), ...above.slice(0, count - nBelow)];
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
  3: ['different flags', 'different medals', 'different keys', 'different stamps', 'different tiles'],
  4: ['different photographs', 'different trophies', 'different posters', 'different vases', 'different clocks'],
  5: ['different paintings', 'different plants', 'different flags', 'different sculptures', 'different lamps'],
  6: ['different books', 'different cards', 'different mugs', 'different jars', 'different plates'],
};

function arrangeQ(rng: RNG): Generated | null {
  const n = rng.int(3, 6);
  const answer = factorial(n);
  const thing = rng.pick(DISTINCT_ITEMS[n]);
  const stem = rng.pick([
    `In how many different orders can ${WORDS[n]} ${thing} be placed in a row?`,
    `${cap(WORDS[n])} people are to be photographed standing in a line. In how many different orders can they stand?`,
    `${cap(WORDS[n])} ${thing} are to be arranged on a shelf. In how many different orders can they be arranged?`,
    `${cap(WORDS[n])} runners finish a race and no two of them tie. In how many different orders can they finish?`,
  ]);
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
      { value: 2 * factorial(n), trap: 'counted each order and its reverse as different arrangements' },
      { value: n ** n, trap: 'allowed every place to be filled by any of the n objects, repeats included' },
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
  // Contexts the neighbouring counting template does not use (it owns teams, committees,
  // books and pizza toppings), so a session drawing both never looks like it repeated itself.
  const pairStems = [
    `Every one of ${WORDS[n]} people at a meeting shakes hands once with each of the others. How many handshakes take place?`,
    `A flag is made from ${WORDS[r]} of ${WORDS[n]} available colours. How many different pairs of colours can be chosen?`,
    `${cap(WORDS[n])} points are marked on a circle. How many straight lines can be drawn joining two of them?`,
  ];
  const anyStems = [
    `A quiz has ${WORDS[n]} questions and each candidate must answer exactly ${WORDS[r]} of them. In how many ways can the questions be chosen?`,
    `${cap(WORDS[r])} different flavours are to be chosen from ${WORDS[n]} flavours of ice cream. How many different choices are possible?`,
    `A tasting menu offers ${WORDS[n]} small dishes and a diner may keep ${WORDS[r]} of them. In how many ways can the ${WORDS[r]} dishes be chosen?`,
    `A gardener has ${WORDS[n]} kinds of seed and plants ${WORDS[r]} different kinds in a border. In how many ways can the kinds be chosen?`,
    `A shop sells ${WORDS[n]} kinds of pen and a customer buys ${WORDS[r]} different kinds. In how many ways can the kinds be chosen?`,
  ];
  const stem = rng.pick(r === 2 ? [...pairStems, ...anyStems] : anyStems);
  return {
    stem,
    answer: { kind: 'exact', value: E(answer) },
    options: countOptions(rng, answer, [
      { value: factorial(n) / factorial(n - r), trap: 'counted the orders as different: $^{n}P_{r}$ instead of $^{n}C_{r}$' },
      { value: n * r, trap: 'multiplied n by r' },
    ], [
      { value: nCr(n, r - 1), trap: `chose ${r - 1} of them instead of ${r}` },
      { value: nCr(n, r + 1), trap: `chose ${r + 1} of them instead of ${r}` },
      { value: nCr(n - 1, r), trap: 'off by one in n' },
      { value: nCr(n + 1, r), trap: 'used one object too many' },
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
  const boys = `${WORDS[rb]} ${rb === 1 ? 'boy' : 'boys'}`;
  const girls = `${WORDS[rg]} ${rg === 1 ? 'girl' : 'girls'}`;
  const men = `${WORDS[rb]} ${rb === 1 ? 'man' : 'men'}`;
  const women = `${WORDS[rg]} ${rg === 1 ? 'woman' : 'women'}`;
  return {
    stem: rng.pick([
      `A committee of ${WORDS[rb + rg]} is to be chosen from ${WORDS[nb]} boys and ${WORDS[ng]} girls. In how many ways can it be chosen if it must contain exactly ${boys} and ${girls}?`,
      `A panel of ${WORDS[rb + rg]} is to be formed from ${WORDS[nb]} men and ${WORDS[ng]} women. In how many ways can it be formed if it must contain exactly ${men} and ${women}?`,
      `A working group of ${WORDS[rb + rg]} is chosen from ${WORDS[nb]} engineers and ${WORDS[ng]} scientists. In how many ways can it be chosen if exactly ${WORDS[rb]} of its members are engineers?`,
      `From ${WORDS[nb]} boys and ${WORDS[ng]} girls, ${boys} and ${girls} are to be chosen. In how many different ways can this be done?`,
    ]),
    answer: { kind: 'exact', value: E(answer) },
    options: countOptions(rng, answer, [
      { value: nCr(nb, rb) + nCr(ng, rg), trap: 'added the two selections instead of multiplying them' },
      { value: nCr(nb + ng, rb + rg), trap: 'ignored the split and chose from everybody' },
      { value: nCr(nb, rg) * nCr(ng, rb), trap: 'swapped the numbers of boys and girls required' },
    ], [
      { value: (factorial(nb) / factorial(nb - rb)) * nCr(ng, rg), trap: 'counted the boys in order ($^{n}P_{r}$)' },
      { value: nCr(nb, rb) * ng, trap: 'forgot that the girls are also chosen from a group' },
      { value: nCr(nb, rb + 1) * nCr(ng, rg), trap: 'off by one in the number of boys chosen' },
      { value: nCr(nb + ng, rb) * nCr(ng, rg), trap: 'chose the boys from everybody' },
      { value: nCr(nb - 1, rb) * nCr(ng, rg), trap: 'used one boy too few in the group' },
      { value: nCr(nb, rb) * nCr(ng - 1, rg), trap: 'used one girl too few in the group' },
      { value: nCr(nb, rb - 1) * nCr(ng, rg), trap: 'off by one in the number of boys chosen, the other way' },
    ]),
    solution: `Choose the boys and the girls independently, then multiply: $^{${nb}}C_{${rb}} \\times {}^{${ng}}C_{${rg}} = ${nCr(nb, rb)} \\times ${nCr(ng, rg)} = ${answer}$.`,
    trap: 'Independent choices multiply; adding them counts committees that are not complete.',
    tags: ['counting', 'combinations', 'committees'],
    params: { variant: 'committee', nb, ng, rb, rg },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 3

/** Words of at most seven letters (so verify can enumerate every permutation) with at least one repeat. */
const REPEAT_WORDS = [
  'LEVEL', 'APPLE', 'TOTAL', 'ERROR', 'RADAR', 'ADDED', 'SPEED', 'GREEN', 'FLOOR', 'TEETH',
  'BANANA', 'LETTER', 'COMMON', 'PEPPER', 'MAXIMA', 'DEGREE', 'MIRROR', 'CANNON', 'EFFECT',
  'SUMMER', 'TUNNEL', 'YELLOW', 'CARROT', 'BOTTLE', 'MAMMAL', 'ASSESS',
  'SUCCESS', 'MINIMUM', 'ADDRESS', 'BALLOON', 'LETTERS', 'ELEMENT',
  'HAPPY', 'SILLY', 'DIGITS', 'LITTLE', 'COFFEE', 'TOFFEE', 'RABBIT', 'PUPPET', 'SUNSET',
  'PATTERN', 'SCIENCE', 'GENERAL', 'MEASURE', 'AVERAGE', 'BETWEEN', 'INTEGER', 'UNKNOWN',
  'PERCENT', 'DIVIDES', 'REVERSE', 'ALGEBRA', 'BALANCE', 'CIRCLES', 'SQUARES', 'MILLION',
];

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

type BlockMode = 'pair' | 'apart' | 'triple' | 'ends';

function togetherQ(rng: RNG): Generated | null {
  const mode = rng.pick(['pair', 'apart', 'triple', 'ends'] as BlockMode[]);
  const n = rng.int(4, 6);
  const people = rng.bool(0.5);
  const who = people ? 'people' : 'books';
  const intro = people
    ? `${cap(WORDS[n])} people stand in a line.`
    : `${cap(WORDS[n])} different books are arranged in a row on a shelf.`;
  const two = people ? 'two particular people' : 'two particular books';
  const three = people ? 'three particular people' : 'three particular books';
  const f = factorial;
  let answer: number;
  let ask: string;
  let solution: string;
  let must: { value: number | null; trap: string }[];
  let extra: { value: number | null; trap: string }[];
  if (mode === 'pair') {
    answer = 2 * f(n - 1);
    ask = `In how many of the arrangements are ${two} next to each other?`;
    solution = `Tie the pair together as one object: $${n - 1}$ objects arrange in $${n - 1}! = ${f(n - 1)}$ ways, and the pair itself in $2$ ways, giving $2 \\times ${f(n - 1)} = ${answer}$.`;
    must = [
      { value: f(n - 1), trap: 'forgot that the pair can be in two orders' },
      { value: f(n), trap: 'ignored the restriction' },
      { value: f(n) - 2 * f(n - 1), trap: 'found the arrangements with the pair apart' },
    ];
    extra = [
      { value: 2 * f(n), trap: 'doubled n! instead of (n−1)!' },
      { value: f(n - 2) * 2, trap: 'treated the block as two removed objects' },
      { value: f(n) / 2, trap: 'halved n!' },
    ];
  } else if (mode === 'apart') {
    answer = f(n) - 2 * f(n - 1);
    ask = `In how many of the arrangements are ${two} not next to each other?`;
    solution = `All $${n}! = ${f(n)}$ arrangements minus the $2 \\times ${n - 1}! = ${2 * f(n - 1)}$ with the pair together: $${f(n)} - ${2 * f(n - 1)} = ${answer}$.`;
    must = [
      { value: 2 * f(n - 1), trap: 'counted the arrangements with the pair together instead' },
      { value: f(n), trap: 'ignored the restriction' },
      { value: f(n) - f(n - 1), trap: 'forgot the 2 orders inside the block when subtracting' },
    ];
    extra = [
      { value: f(n - 1), trap: 'used $(n-1)!$ for the block and stopped there' },
      { value: f(n) / 2, trap: 'halved n!, as if the two orders split the arrangements evenly' },
      { value: f(n - 2) * 2, trap: 'treated the pair as two removed objects' },
    ];
  } else if (mode === 'triple') {
    answer = 6 * f(n - 2);
    ask = `In how many of the arrangements are ${three} ${people ? 'all standing together' : 'all next to each other'}?`;
    solution = `Tie the three together as one object: $${n - 2}$ objects arrange in $${n - 2}! = ${f(n - 2)}$ ways and the block itself in $3! = 6$ ways, giving $6 \\times ${f(n - 2)} = ${answer}$.`;
    must = [
      { value: f(n - 2), trap: 'forgot the $3!$ orders inside the block' },
      { value: 2 * f(n - 2), trap: 'used $2!$ instead of $3!$ inside the block' },
      { value: f(n), trap: 'ignored the restriction' },
    ];
    extra = [
      { value: f(n) - 6 * f(n - 2), trap: 'found the arrangements that are not all together' },
      { value: 6 * f(n - 1), trap: 'kept all n objects as well as the block' },
      { value: 3 * f(n - 2), trap: 'used 3 rather than $3!$ for the block' },
    ];
  } else {
    answer = 2 * f(n - 2);
    ask = `In how many of the arrangements are ${two} at the two ends of the ${people ? 'line' : 'row'}?`;
    solution = `The two ends can be filled by the pair in $2$ ways, and the remaining $${n - 2}$ ${who} arrange in $${n - 2}! = ${f(n - 2)}$ ways: $2 \\times ${f(n - 2)} = ${answer}$.`;
    must = [
      { value: f(n - 2), trap: 'forgot that the two ends can be swapped' },
      { value: 2 * f(n - 1), trap: 'fixed only one end and arranged the rest' },
      { value: f(n), trap: 'ignored the restriction' },
    ];
    extra = [
      { value: f(n) - 2 * f(n - 2), trap: 'found the arrangements that do not satisfy the condition' },
      { value: f(n - 1), trap: 'fixed one end and forgot the second' },
      { value: 2 * f(n), trap: 'doubled n! instead of (n−2)!' },
    ];
  }
  return {
    stem: `${intro} ${ask}`,
    answer: { kind: 'exact', value: E(answer) },
    options: countOptions(rng, answer, must, extra),
    solution,
    trap: 'Treat the restricted objects as a block, then multiply by the arrangements inside the block.',
    tags: ['counting', 'permutations', 'block'],
    params: { variant: 'together', n, mode },
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
    stem: rng.pick([
      `A team of ${WORDS[r]} is to be chosen from ${WORDS[nb]} boys and ${WORDS[ng]} girls. In how many ways can the team be chosen if it must include at least one girl?`,
      `A crew of ${WORDS[r]} is to be chosen from ${WORDS[nb]} men and ${WORDS[ng]} women. In how many ways can the crew be chosen if it must include at least one woman?`,
      `A delegation of ${WORDS[r]} is chosen from ${WORDS[nb]} teachers and ${WORDS[ng]} students. In how many ways can it be chosen if at least one student must be included?`,
    ]),
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
      { value: nCr(nb, r - 1), trap: 'put one girl in the team but forgot there is a choice of girls' },
      { value: ng * nCr(nb + ng, r - 1), trap: 'picked a girl first and the rest from everybody, counting some teams twice over' },
    ]),
    solution: `Use the complement: all teams minus the all-boy teams, $^{${nb + ng}}C_{${r}} - {}^{${nb}}C_{${r}} = ${total} - ${nCr(nb, r)} = ${answer}$.`,
    trap: '"At least one" is total − none; choosing a girl first and the rest freely double-counts.',
    tags: ['counting', 'combinations', 'complement'],
    params: { variant: 'at-least-one', nb, ng, r },
    typedAllowed: true,
  };
}

const FIXED_WORDS = ['NUMBER', 'PLANET', 'FACTOR', 'SQUARE', 'MEDIAN', 'DOUBLE', 'SIMPLE', 'MATRIX', 'VECTOR', 'SECOND', 'MODULE', 'POINTS', 'ANGLES', 'CHANGE'];

function fixedPositionQ(rng: RNG): Generated | null {
  const word = rng.pick(FIXED_WORDS);
  const letters = word.split('');
  if (new Set(letters).size !== letters.length) return null;
  const n = letters.length;
  const vowels = letters.filter((ch) => 'AEIOU'.includes(ch));
  const mode = rng.pick(['first-letter', 'vowel-first', 'ends']);
  const f = factorial;
  let answer: number;
  let ask: string;
  let how: string;
  // Every mode needs undercounts as well as overcounts: n! and "the rest arrange freely" both
  // overshoot, so without these the answer is always the second-smallest option.
  const under: { value: number | null; trap: string }[] = [
    { value: f(n - 2), trap: 'fixed two places instead of one' },
    { value: (n - 1) * (n - 2), trap: 'filled only the first two free places' },
  ];
  if (mode === 'first-letter') {
    answer = f(n - 1);
    ask = `begin with the letter $\\text{${letters[0]}}$`;
    how = `Fix $\\text{${letters[0]}}$ in the first place; the other $${n - 1}$ letters arrange in $${n - 1}! = ${answer}$ ways.`;
    under.push({ value: f(n - 1) / 2, trap: 'halved the arrangements of the remaining letters' });
  } else if (mode === 'vowel-first') {
    answer = vowels.length * f(n - 1);
    ask = 'begin with a vowel';
    how = `There are $${vowels.length}$ choices for the first letter, then $${n - 1}! = ${f(n - 1)}$ arrangements of the rest: $${vowels.length} \\times ${f(n - 1)} = ${answer}$.`;
    under.push(
      { value: f(n - 1), trap: 'forgot that any of the vowels can come first' },
      { value: vowels.length * f(n - 2), trap: 'fixed the second letter as well as the first' },
    );
  } else {
    answer = 2 * f(n - 1);
    ask = `have the letter $\\text{${letters[0]}}$ at one of the two ends`;
    how = `$2$ choices of end for $\\text{${letters[0]}}$ and $${n - 1}! = ${f(n - 1)}$ for the rest: $2 \\times ${f(n - 1)} = ${answer}$.`;
    under.push({ value: 2 * f(n - 2), trap: 'fixed a letter at each end instead of only one' });
  }
  return {
    stem: `How many arrangements of the letters of the word ${word} ${ask}?`,
    answer: { kind: 'exact', value: E(answer) },
    options: countOptions(rng, answer, [
      { value: f(n), trap: 'counted every arrangement, ignoring the restriction' },
      { value: mode === 'first-letter' ? f(n - 2) : f(n - 1), trap: 'forgot how many ways the fixed place can be filled' },
      { value: mode === 'vowel-first' ? vowels.length * f(n) : f(n) / 2, trap: mode === 'vowel-first' ? 'used n! for the remaining letters' : 'halved n! instead of fixing a place' },
    ], [
      ...under,
      { value: f(n - 1) * (n - 1), trap: 'used the wrong number of free choices' },
      { value: f(n) - f(n - 1), trap: 'found the arrangements that do not satisfy the condition' },
      { value: (n - 1) * (n - 1), trap: 'multiplied instead of using a factorial' },
      { value: 3 * f(n - 1), trap: 'miscounted the choices for the fixed place' },
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
    stem: rng.pick([
      `A counter moves along the lines of a grid that is $${a}$ units wide and $${b}$ units tall, starting at the bottom-left corner. Each move takes it one unit right or one unit up. In how many different ways can it reach the top-right corner?`,
      `The streets of a town form a grid $${a}$ blocks wide and $${b}$ blocks deep. Walking only east or north, in how many different ways can someone get from the south-west corner to the north-east corner?`,
      `An ant crawls along the lines of a rectangular grid $${a}$ units wide and $${b}$ units tall. Starting at one corner and moving only right or up, in how many different ways can it reach the opposite corner?`,
    ]),
    answer: { kind: 'exact', value: E(answer) },
    options: countOptions(rng, answer, [
      { value: a + b, trap: 'counted the number of moves, not the number of routes' },
      { value: factorial(a + b), trap: 'treated the moves as all different: $(a+b)!$' },
      { value: 2 ** (a + b), trap: 'allowed a free choice of direction at every step' },
      { value: nCr(a + b, a - 1), trap: 'off by one in the number of right moves' },
    ], [
      { value: factorial(a + b) / factorial(b), trap: 'treated the right moves as different from one another: divided only by the ups' },
      { value: nCr(a + b, a) * 2, trap: 'doubled for "right or up"' },
      { value: nCr(a + b + 1, a), trap: 'used one grid line too many' },
      { value: factorial(a) * factorial(b), trap: 'arranged the two kinds of move separately' },
      { value: nCr(a + b - 1, a), trap: 'used one move too few' },
      { value: a * b, trap: 'counted the small squares of the grid, not the routes' },
      { value: (a + 1) * (b + 1), trap: 'counted the corners of the grid, not the routes' },
    ]),
    solution: `Every route is $${a}$ rights and $${b}$ ups in some order: choose which $${a}$ of the $${a + b}$ moves are rights, $^{${a + b}}C_{${a}} = ${answer}$.`,
    trap: 'A route is a word made of R and U — count the arrangements, not the squares.',
    tags: ['counting', 'combinations', 'paths'],
    params: { variant: 'grid', a, b },
    typedAllowed: true,
  };
}

/** The article travels with the noun, so the eight-sided case reads "an octagon", not "a octagon". */
const POLYGONS: Record<number, string> = {
  5: 'a pentagon', 6: 'a hexagon', 7: 'a heptagon', 8: 'an octagon', 9: 'a nonagon', 10: 'a decagon',
  11: 'a regular 11-sided polygon', 12: 'a regular 12-sided polygon', 14: 'a regular 14-sided polygon',
  15: 'a regular 15-sided polygon', 16: 'a regular 16-sided polygon', 18: 'a regular 18-sided polygon',
  20: 'a regular 20-sided polygon',
};

function diagonalsQ(rng: RNG): Generated | null {
  const n = rng.pick([5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 18, 20]);
  const answer = (n * (n - 3)) / 2;
  return {
    stem: `How many diagonals does ${POLYGONS[n]} have?`,
    answer: { kind: 'exact', value: E(answer) },
    // Every overcount here (pairs of vertices, not halving, one side too few) sits above the answer,
    // so the undercounts below are what stop "the second smallest option" from being a winning strategy.
    options: countOptions(rng, answer, [
      { value: nCr(n, 2), trap: 'counted every pair of vertices, including the n sides' },
      { value: n * (n - 3), trap: 'forgot that each diagonal is counted from both ends' },
      { value: n - 3, trap: 'counted only the diagonals drawn from one vertex' },
      { value: (n * (n - 1)) / 2 - n - 1, trap: 'subtracted one side too many' },
    ], [
      { value: n, trap: 'confused diagonals with sides' },
      { value: nCr(n, 2) - 1, trap: 'subtracted a single side' },
      { value: (n * (n - 2)) / 2, trap: 'used n − 2 instead of n − 3' },
      { value: ((n - 1) * (n - 4)) / 2, trap: 'used one vertex too few' },
      { value: ((n + 1) * (n - 2)) / 2, trap: 'used one vertex too many' },
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
  const b = rng.pick([3, 3, 4, 5]);
  const k = rng.int(b + 3, b + 6);
  const answer = nCr(k - 1, b - 1);
  if (answer > 200) return null;
  const item = rng.pick(['identical sweets', 'identical stickers', 'identical marbles', 'identical coins', 'identical pencils', 'identical balloons']);
  return {
    stem: rng.bool(0.5)
      ? `${cap(WORDS[k])} ${item} are shared between ${WORDS[b]} children so that each child gets at least one. In how many different ways can this be done?`
      : `${cap(WORDS[k])} ${item} are to be put into ${WORDS[b]} different boxes so that no box is left empty. In how many different ways can this be done?`,
    answer: { kind: 'exact', value: E(answer) },
    options: countOptions(rng, answer, [
      { value: nCr(k + b - 1, b - 1), trap: 'allowed a child to receive nothing' },
      { value: nCr(k, b - 1), trap: 'off by one: used k gaps instead of k − 1' },
      { value: nCr(k, b), trap: 'chose which sweets to give, though they are identical' },
      { value: factorial(b), trap: 'arranged the children instead of sharing the objects out' },
    ], [
      { value: b ** (k - b), trap: 'gave each remaining sweet a free choice of child' },
      { value: nCr(k - 1, b), trap: 'off by one in the number of dividers' },
      { value: nCr(k - 1, b - 2), trap: 'used one divider too few' },
      { value: nCr(k - 2, b - 1), trap: 'off by one in the number of objects' },
      { value: (k - 1) * (b - 1), trap: 'multiplied the gaps by the dividers instead of choosing' },
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
        const n = p.n!;
        const items = Array.from({ length: n }, (_, i) => String(i));
        const at = (perm: string[], k: number) => perm.indexOf(String(k));
        const pred = p.mode === 'apart'
          ? (perm: string[]) => Math.abs(at(perm, 0) - at(perm, 1)) !== 1
          : p.mode === 'triple'
            ? (perm: string[]) => {
              const ps = [at(perm, 0), at(perm, 1), at(perm, 2)];
              return Math.max(...ps) - Math.min(...ps) === 2;
            }
            : p.mode === 'ends'
              ? (perm: string[]) => {
                const ps = [at(perm, 0), at(perm, 1)].sort((x, y) => x - y);
                return ps[0] === 0 && ps[1] === n - 1;
              }
              : (perm: string[]) => Math.abs(at(perm, 0) - at(perm, 1)) === 1;
        return got === countPermutations(items, pred);
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
