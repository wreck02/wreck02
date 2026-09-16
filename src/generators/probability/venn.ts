import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import type { RNG } from '../../core/rng';

/**
 * Two-set (Venn) counting and probability.
 * Level 1: |A ∪ B| = |A| + |B| − |A ∩ B| with small counts
 * Level 2: "neither" and "exactly one" counts from a described survey
 * Level 3: a probability read off the same two-way split, including P(A | B)
 * Level 4: independent / mutually exclusive / neither (choice), or a probability assuming independence
 * Level 5: three sets in words, or |A ∩ B| recovered from a union and a "neither" count
 *
 * Every variant stores the four (or eight) region counts in params, so verify() can rebuild the
 * group person by person and count, instead of re-running the inclusion–exclusion arithmetic.
 * The one-line `trap` follows what was actually asked: a "how many do neither" question and a
 * conditional probability are built from different mistakes.
 */

interface Ctx { group: string; unit: string; one: string; verb: string; objA: string; objB: string; objC: string }

const CONTEXTS: Ctx[] = [
  { group: 'a class of', unit: 'students', one: 'student', verb: 'study', objA: 'French', objB: 'German', objC: 'Spanish' },
  { group: 'a group of', unit: 'people', one: 'person', verb: 'own', objA: 'a car', objB: 'a bicycle', objC: 'a motorbike' },
  { group: 'a survey of', unit: 'shoppers', one: 'shopper', verb: 'bought', objA: 'bread', objB: 'milk', objC: 'eggs' },
  { group: 'a year group of', unit: 'pupils', one: 'pupil', verb: 'play', objA: 'football', objB: 'tennis', objC: 'hockey' },
  { group: 'a group of', unit: 'tourists', one: 'tourist', verb: 'have visited', objA: 'Paris', objB: 'Rome', objC: 'Berlin' },
  { group: 'a sixth form of', unit: 'students', one: 'student', verb: 'take', objA: 'physics', objB: 'chemistry', objC: 'biology' },
];

const PROB_FALLBACK = [[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [1, 6], [5, 6], [1, 8], [3, 8], [1, 10], [3, 10], [7, 10]].map(([n, d]) => frac(n, d));

interface Regions { n: number; a: number; b: number; both: number; onlyA: number; onlyB: number; neither: number; union: number }

/**
 * Draw a two-set split of a round group size. Every region scales with the group, so the larger
 * group sizes in a pool are actually reachable, and "neither" is never the 1 or 2 that reads like
 * a typo (and makes the "gave the number doing neither" distractor a dead option).
 */
function drawRegions(rng: RNG, pool: number[]): Regions | null {
  const n = rng.pick(pool);
  const lo = Math.max(3, Math.ceil(n / 10));
  const hi = Math.floor(n / 3);
  if (hi < lo) return null;
  const neither = rng.int(lo, hi);
  const union = n - neither;
  if (union < 12) return null;
  const both = rng.int(3, Math.max(3, Math.floor(union / 4)));
  const rest = union - both;
  if (rest < 9) return null;
  const onlyA = rng.int(4, rest - 4);
  const onlyB = rest - onlyA;
  if (onlyB < 4 || onlyA === onlyB) return null;
  return { n, a: onlyA + both, b: onlyB + both, both, onlyA, onlyB, neither, union };
}

function intro(c: Ctx, r: Regions): string {
  return `In ${c.group} ${r.n} ${c.unit}, ${r.a} ${c.verb} ${c.objA}, ${r.b} ${c.verb} ${c.objB} and ${r.both} ${c.verb} both.`;
}

function countOptions(rng: RNG, answer: number, ds: Distractor[]) {
  const usable = ds.filter((d) => d.value.isInteger() && d.value.toNumber() > 0 && isCleanExact(d.value).ok);
  const fallback = [answer + 1, answer - 1, answer + 2, answer - 2, answer + 5, answer - 5, answer + 10].filter((v) => v > 0).map(E);
  return buildOptions(rng, E(answer), usable, { fallback });
}

function probOptions(rng: RNG, answer: Exact, ds: Distractor[]) {
  const usable = ds.filter((d) => {
    const v = d.value.toNumber();
    return Number.isFinite(v) && v > 0 && v < 1 && isCleanExact(d.value).ok;
  });
  return buildOptions(rng, answer, usable, { format: 'fraction', fallback: PROB_FALLBACK });
}

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 60; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

// ----------------------------------------------------------------------------- level 1

function unionQ(rng: RNG): Generated | null {
  const c = rng.pick(CONTEXTS);
  const r = drawRegions(rng, [20, 24, 25, 28, 30, 32, 36, 40]);
  if (!r) return null;
  return {
    stem: `${intro(c, r)}\n\nHow many of them ${c.verb} at least one of the two?`,
    answer: { kind: 'exact', value: E(r.union) },
    options: countOptions(rng, r.union, [
      { value: E(r.a + r.b), trap: 'added the two groups without subtracting the overlap', must: true },
      { value: E(r.a + r.b - 2 * r.both), trap: 'counted only those doing exactly one of the two' },
      { value: E(r.neither), trap: 'gave the number doing neither' },
      { value: E(r.n - r.both), trap: 'subtracted the overlap from the whole group' },
      { value: E(r.a + r.b + r.both), trap: 'added the overlap instead of subtracting it' },
    ]),
    solution: `$|A \\cup B| = ${r.a} + ${r.b} - ${r.both} = ${r.union}$ — the ${r.both} in both groups are counted twice in ${r.a} + ${r.b}.`,
    trap: 'Adding the two totals double-counts the overlap, so the intersection must be subtracted once.',
    tags: ['probability', 'venn', 'inclusion-exclusion'],
    params: { variant: 'two-set', ask: 'union', n: r.n, onlyA: r.onlyA, onlyB: r.onlyB, both: r.both, neither: r.neither },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 2

function neitherQ(rng: RNG): Generated | null {
  const c = rng.pick(CONTEXTS);
  const r = drawRegions(rng, [30, 32, 36, 40, 45, 50, 60]);
  if (!r) return null;
  const ask = rng.bool() ? 'neither' : 'exactly-one';
  const answer = ask === 'neither' ? r.neither : r.onlyA + r.onlyB;
  const question = ask === 'neither'
    ? `How many of them ${c.verb} neither ${c.objA} nor ${c.objB}?`
    : `How many of them ${c.verb} exactly one of the two?`;
  const ds: Distractor[] = ask === 'neither'
    ? [
      // n − |A| − |B| is only a possible answer when the overlap is smaller than the residue,
      // so "gave the union" carries the headline trap for the rest of the draws
      { value: E(r.n - r.a - r.b), trap: 'forgot to add the overlap back: it was subtracted twice', must: true },
      { value: E(r.union), trap: 'gave the number doing at least one, not the number doing neither', must: true },
      { value: E(r.n - r.onlyA - r.onlyB), trap: 'left out those doing both' },
      { value: E(r.both), trap: 'gave the size of the overlap' },
      { value: E(r.n - r.a), trap: `subtracted only those who ${c.verb} ${c.objA}` },
    ]
    : [
      { value: E(r.union), trap: 'counted everyone doing at least one, including those doing both', must: true },
      { value: E(r.a + r.b), trap: 'added the two groups without removing the overlap at all' },
      { value: E(r.onlyA), trap: `gave only those who ${c.verb} ${c.objA} but not ${c.objB}` },
      { value: E(r.neither), trap: 'gave the number doing neither' },
      { value: E(r.union - 2 * r.both), trap: 'subtracted the overlap once too often' },
    ];
  const solution = ask === 'neither'
    ? `At least one: $${r.a} + ${r.b} - ${r.both} = ${r.union}$, so neither is $${r.n} - ${r.union} = ${r.neither}$.`
    : `Exactly one $= (${r.a} - ${r.both}) + (${r.b} - ${r.both}) = ${r.onlyA} + ${r.onlyB} = ${answer}$.`;
  return {
    stem: `${intro(c, r)}\n\n${question}`,
    answer: { kind: 'exact', value: E(answer) },
    options: countOptions(rng, answer, ds),
    solution,
    trap: ask === 'neither'
      ? 'Take off the union, not |A| + |B|: subtracting both totals removes the overlap twice.'
      : '"Exactly one" removes the overlap from both groups: (|A| − |A ∩ B|) + (|B| − |A ∩ B|).',
    tags: ['probability', 'venn', ask],
    params: { variant: 'two-set', ask, n: r.n, onlyA: r.onlyA, onlyB: r.onlyB, both: r.both, neither: r.neither },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 3

type ProbAsk = 'both' | 'a-given-b' | 'b-given-a' | 'neither' | 'only-a';

function probabilityQ(rng: RNG): Generated | null {
  const c = rng.pick(CONTEXTS);
  const r = drawRegions(rng, [20, 24, 25, 30, 36, 40, 50, 60]);
  if (!r) return null;
  const ask = rng.pick<ProbAsk>(['both', 'a-given-b', 'a-given-b', 'b-given-a', 'neither', 'only-a']);
  const conditional = ask === 'a-given-b' || ask === 'b-given-a';
  const answer =
    ask === 'both' ? frac(r.both, r.n)
      : ask === 'a-given-b' ? frac(r.both, r.b)
        : ask === 'b-given-a' ? frac(r.both, r.a)
          : ask === 'neither' ? frac(r.neither, r.n)
            : frac(r.onlyA, r.n);
  if (!isCleanExact(answer).ok) return null;
  const question =
    ask === 'both' ? `Find the probability that this ${c.one} is one of those who ${c.verb} both ${c.objA} and ${c.objB}.`
      : ask === 'a-given-b' ? `Given that this ${c.one} is one of those who ${c.verb} ${c.objB}, find the probability that they also ${c.verb} ${c.objA}.`
        : ask === 'b-given-a' ? `Given that this ${c.one} is one of those who ${c.verb} ${c.objA}, find the probability that they also ${c.verb} ${c.objB}.`
          : ask === 'neither' ? `Find the probability that this ${c.one} is one of those who ${c.verb} neither ${c.objA} nor ${c.objB}.`
            : `Find the probability that this ${c.one} is one of those who ${c.verb} ${c.objA} but not ${c.objB}.`;
  // the headline mistake depends on what was asked, so it is chosen here rather than fixed
  const must =
    conditional ? frac(r.both, r.n)
      : ask === 'both' ? frac(r.both, r.b)
        : ask === 'neither' ? frac(r.union, r.n)
          : frac(r.a, r.n);
  const ds: Distractor[] = [
    { value: frac(r.both, r.n), trap: 'used the whole group as the denominator instead of the given group' },
    { value: frac(r.both, r.a), trap: 'conditioned on the wrong group' },
    { value: frac(r.both, r.b), trap: 'conditioned on the wrong group' },
    { value: frac(r.union, r.n), trap: 'gave the probability of at least one' },
    { value: frac(r.neither, r.n), trap: 'gave the probability of neither' },
    { value: frac(r.onlyA, r.n), trap: `gave "${c.objA} but not ${c.objB}" rather than what was asked` },
    { value: frac(r.a, r.n), trap: `gave $P(${c.objA})$ on its own` },
    { value: frac(r.b, r.n), trap: `gave $P(${c.objB})$ on its own` },
  ].filter((d) => !d.value.equals(answer)).map((d) => (d.value.equals(must) ? { ...d, must: true } : d));
  // "\frac{10}{24} = \frac{5}{12}", or just "\frac{4}{15}" when it is already in lowest terms
  const ratio = (num: number, den: number) => {
    const shown = `\\frac{${num}}{${den}}`;
    const reduced = frac(num, den).toLatex({ format: 'fraction' });
    return reduced === shown ? shown : `${shown} = ${reduced}`;
  };
  const solution =
    ask === 'both' ? `$P = ${ratio(r.both, r.n)}$.`
      : ask === 'a-given-b' ? `Restrict to the ${r.b} who ${c.verb} ${c.objB}; of those, ${r.both} also ${c.verb} ${c.objA}, so $P = ${ratio(r.both, r.b)}$.`
        : ask === 'b-given-a' ? `Restrict to the ${r.a} who ${c.verb} ${c.objA}; of those, ${r.both} also ${c.verb} ${c.objB}, so $P = ${ratio(r.both, r.a)}$.`
          : ask === 'neither' ? `At least one: $${r.a} + ${r.b} - ${r.both} = ${r.union}$, so ${r.neither} do neither and $P = ${ratio(r.neither, r.n)}$.`
            : `${c.objA} but not ${c.objB}: $${r.a} - ${r.both} = ${r.onlyA}$, so $P = ${ratio(r.onlyA, r.n)}$.`;
  const trap =
    conditional ? 'A conditional probability divides by the size of the group you are given, not by the whole group.'
      : ask === 'both' ? 'P(A and B) is the overlap over the whole group; dividing by |A| or |B| answers a conditional question instead.'
        : ask === 'neither' ? 'Those doing neither are the group minus the union, and the union counts the overlap once, not twice.'
          : '"A but not B" is |A| − |A ∩ B|, so those doing both must come off first.';
  return {
    stem: `${intro(c, r)}\n\nOne of the ${r.n} ${c.unit} is chosen at random. ${question}`,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: probOptions(rng, answer, ds),
    solution,
    trap,
    tags: ['probability', 'venn', conditional ? 'conditional' : ask],
    params: { variant: 'two-set-prob', ask, n: r.n, onlyA: r.onlyA, onlyB: r.onlyB, both: r.both, neither: r.neither },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 4

const DENS = [2, 3, 4, 5, 5, 6, 8, 10];

function drawProb(rng: RNG): Exact {
  const d = rng.pick(DENS);
  return frac(rng.int(1, d - 1), d);
}

function independenceQ(rng: RNG): Generated | null {
  const pA = drawProb(rng);
  const pB = drawProb(rng);
  const kind = rng.pick(['independent', 'exclusive', 'neither', 'neither']);
  let pAB: Exact;
  if (kind === 'independent') pAB = pA.mul(pB);
  else if (kind === 'exclusive') {
    if (pA.add(pB).toNumber() > 1) return null;
    pAB = E(0);
  } else {
    const D = Number(pA.toRat().d) * Number(pB.toRat().d);
    const maxK = Math.floor(Math.min(pA.toNumber(), pB.toNumber()) * D);
    const minK = Math.max(1, Math.ceil((pA.toNumber() + pB.toNumber() - 1) * D));
    if (maxK < minK) return null;
    const k = rng.int(minK, maxK);
    pAB = frac(k, D);
    if (pAB.equals(pA.mul(pB))) return null;
  }
  if (!isCleanExact(pAB).ok) return null;
  const F = { format: 'fraction' as const };
  const correct = kind === 'independent'
    ? '$A$ and $B$ are independent.'
    : kind === 'exclusive'
      ? '$A$ and $B$ are mutually exclusive.'
      : '$A$ and $B$ are neither independent nor mutually exclusive.';
  const all = [
    { display: '$A$ and $B$ are independent.', trap: 'checked P(A ∩ B) against P(A) + P(B), or assumed independence' },
    { display: '$A$ and $B$ are mutually exclusive.', trap: 'mutually exclusive means P(A ∩ B) = 0, not P(A ∩ B) ≠ P(A)P(B)' },
    { display: '$A$ and $B$ are neither independent nor mutually exclusive.', trap: 'the multiplication rule does hold here' },
    { display: '$A$ and $B$ are both independent and mutually exclusive.', trap: 'two events with non-zero probabilities can never be both' },
    { display: 'It is not possible to decide without more information.', trap: 'P(A), P(B) and P(A ∩ B) are all that the two tests need' },
  ];
  const product = pA.mul(pB);
  return {
    stem: `Two events $A$ and $B$ satisfy $P(A) = ${pA.toLatex(F)}$, $P(B) = ${pB.toLatex(F)}$ and $P(A \\cap B) = ${pAB.toLatex(F)}$.\n\nWhich one of the following statements is true?`,
    answer: { kind: 'choice', value: correct },
    options: buildChoiceOptions(rng, correct, all.filter((o) => o.display !== correct)),
    solution: `$P(A)P(B) = ${pA.toLatex(F)} \\times ${pB.toLatex(F)} = ${product.toLatex(F)}$, and $P(A \\cap B) = ${pAB.toLatex(F)}$. Independent needs these equal; mutually exclusive needs $P(A \\cap B) = 0$.`,
    trap: 'Independent (P(A ∩ B) = P(A)P(B)) and mutually exclusive (P(A ∩ B) = 0) are different tests.',
    tags: ['probability', 'independence', 'venn'],
    params: {
      variant: 'independence', kind,
      na: Number(pA.toRat().n), da: Number(pA.toRat().d),
      nb: Number(pB.toRat().n), db: Number(pB.toRat().d),
      nab: Number(pAB.toRat().n), dab: Number(pAB.toRat().d),
    },
    typedAllowed: false,
  };
}

/**
 * A probability that follows from independence. Multiplying two given fractions is a level-2 ask,
 * so the weight sits on the versions that need the rule rearranged: the union, "exactly one", and
 * recovering P(B) from P(A) and P(A ∪ B).
 */
function independentValueQ(rng: RNG): Generated | null {
  const pA = drawProb(rng);
  const pB = drawProb(rng);
  if (pA.equals(pB)) return null; // two identical fractions make every route look the same
  const inter = pA.mul(pB);
  const union = pA.add(pB).sub(inter);
  const exactlyOne = pA.add(pB).sub(inter.mulRat(2));
  if (union.toNumber() >= 1) return null;
  for (const v of [inter, union, exactlyOne]) if (!isCleanExact(v).ok) return null;
  const ask = rng.weighted(['union', 'exactly-one', 'find-b', 'intersection'], [3, 2, 2, 1]);
  const F = { format: 'fraction' as const };
  let stem: string;
  let answer: Exact;
  let ds: Distractor[];
  let solution: string;
  const given = `$A$ and $B$ are independent events with $P(A) = ${pA.toLatex(F)}$`;
  if (ask === 'find-b') {
    answer = pB;
    stem = `${given} and $P(A \\cup B) = ${union.toLatex(F)}$.\n\nFind $P(B)$.`;
    ds = [
      { value: union.sub(pA), trap: 'used $P(A \\cup B) = P(A) + P(B)$: that is the mutually exclusive rule', must: true },
      { value: E(1).sub(union).div(E(1).sub(pA)), trap: "stopped at $P(B')$" },
      { value: E(1).sub(pA).mul(union), trap: 'multiplied by $1 - P(A)$ instead of dividing by it' },
      { value: union.sub(pA).div(pA), trap: 'divided by $P(A)$ instead of by $1 - P(A)$' },
      { value: pA.mul(union), trap: 'multiplied the two given probabilities' },
      { value: E(1).sub(union), trap: 'gave the probability that neither happens' },
    ];
    solution = `$1 - P(A \\cup B) = P(A')P(B')$, so $P(B') = \\frac{1 - ${union.toLatex(F)}}{1 - ${pA.toLatex(F)}} = ${E(1).sub(pB).toLatex(F)}$ and $P(B) = ${pB.toLatex(F)}$.`;
  } else if (ask === 'exactly-one') {
    answer = exactlyOne;
    stem = `${given} and $P(B) = ${pB.toLatex(F)}$.\n\nFind the probability that exactly one of $A$ and $B$ occurs.`;
    ds = [
      { value: union, trap: 'gave $P(A \\cup B)$, which still includes the case where both happen', must: true },
      { value: inter, trap: 'gave $P(A \\cap B)$' },
      { value: pA.add(pB), trap: 'added the probabilities without removing the overlap at all' },
      { value: pA.mul(E(1).sub(pB)), trap: "counted $A$ without $B$ but forgot $B$ without $A$" },
      { value: E(1).sub(pA).mul(pB), trap: "counted $B$ without $A$ but forgot $A$ without $B$" },
      { value: E(1).sub(union), trap: 'gave the probability that neither happens' },
    ];
    solution = `Exactly one $= P(A) + P(B) - 2P(A \\cap B) = ${pA.toLatex(F)} + ${pB.toLatex(F)} - 2 \\times ${inter.toLatex(F)} = ${exactlyOne.toLatex(F)}$.`;
  } else {
    answer = ask === 'intersection' ? inter : union;
    stem = `${given} and $P(B) = ${pB.toLatex(F)}$.\n\nFind $P(A ${ask === 'intersection' ? '\\cap' : '\\cup'} B)$.`;
    ds = [
      { value: pA.add(pB), trap: 'added the probabilities without subtracting the overlap', must: ask === 'union' },
      { value: ask === 'intersection' ? union : inter, trap: ask === 'intersection' ? 'gave $P(A \\cup B)$' : 'gave $P(A \\cap B)$', must: ask === 'intersection' },
      { value: E(1).sub(union), trap: 'gave the probability that neither happens' },
      { value: exactlyOne, trap: 'left out the case where both happen' },
      { value: inter.mulRat(2), trap: 'doubled the product' },
      { value: E(1).sub(inter), trap: 'took the complement of the product' },
      { value: pA.mul(E(1).sub(pB)), trap: "used $P(B')$ instead of $P(B)$" },
      { value: E(1).sub(pA).mul(pB), trap: "used $P(A')$ instead of $P(A)$" },
    ];
    solution = ask === 'intersection'
      ? `Independence gives $P(A \\cap B) = ${pA.toLatex(F)} \\times ${pB.toLatex(F)} = ${inter.toLatex(F)}$.`
      : `$P(A \\cap B) = ${pA.toLatex(F)} \\times ${pB.toLatex(F)} = ${inter.toLatex(F)}$, so $P(A \\cup B) = ${pA.toLatex(F)} + ${pB.toLatex(F)} - ${inter.toLatex(F)} = ${union.toLatex(F)}$.`;
  }
  if (!isCleanExact(answer).ok) return null;
  return {
    stem,
    answer: { kind: 'exact', value: answer, format: 'fraction' },
    options: probOptions(rng, answer, ds),
    solution,
    trap: ask === 'find-b'
      ? 'P(A ∪ B) = P(A) + P(B) − P(A)P(B) for independent events, so P(B) comes out of a division by 1 − P(A).'
      : ask === 'exactly-one'
        ? '"Exactly one" takes the intersection off twice: once from each of P(A) and P(B).'
        : 'Independent events multiply for the intersection; the union still needs that intersection subtracting once.',
    tags: ['probability', 'independence', ask],
    params: {
      variant: 'independent-value', ask,
      na: Number(pA.toRat().n), da: Number(pA.toRat().d),
      nb: Number(pB.toRat().n), db: Number(pB.toRat().d),
      nu: Number(union.toRat().n), du: Number(union.toRat().d),
    },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 5

function threeSetQ(rng: RNG): Generated | null {
  const c = rng.pick(CONTEXTS);
  const abc = rng.int(2, 6);
  const ab = rng.int(2, 8), ac = rng.int(2, 8), bc = rng.int(2, 8);
  const onlyA = rng.int(4, 14), onlyB = rng.int(4, 14), onlyC = rng.int(4, 14);
  const none = rng.int(3, 8);
  const n = abc + ab + ac + bc + onlyA + onlyB + onlyC + none;
  if (n > 90 || n % 5 !== 0) return null;
  const A = onlyA + ab + ac + abc, B = onlyB + ab + bc + abc, C = onlyC + ac + bc + abc;
  const AB = ab + abc, AC = ac + abc, BC = bc + abc;
  const union = n - none;
  const ask = rng.bool(0.6) ? 'none' : 'exactly-one';
  const answer = ask === 'none' ? none : onlyA + onlyB + onlyC;
  const sumSingles = A + B + C, sumPairs = AB + AC + BC;
  const ds: Distractor[] = ask === 'none'
    ? [
      { value: E(n - (sumSingles - sumPairs)), trap: 'forgot to add the triple overlap back in', must: true },
      { value: E(n - (sumSingles - sumPairs - abc)), trap: 'subtracted the triple overlap instead of adding it' },
      { value: E(n - sumSingles), trap: 'ignored all the overlaps' },
      { value: E(union), trap: 'gave the number doing at least one' },
      { value: E(onlyA + onlyB + onlyC), trap: 'gave the number doing exactly one' },
      { value: E(none - abc), trap: 'added the triple overlap back twice' },
      { value: E(abc), trap: 'gave the number doing all three' },
    ]
    : [
      { value: E(sumSingles - sumPairs), trap: 'subtracted each pair once instead of twice', must: true },
      { value: E(union), trap: 'gave the number doing at least one' },
      { value: E(none), trap: 'gave the number doing none of the three' },
      { value: E(onlyA + onlyB + onlyC - abc), trap: 'took the triple overlap off as well' },
      { value: E(sumSingles - sumPairs - abc), trap: 'sign slip on the triple overlap' },
      { value: E(union - abc), trap: 'only removed the triple overlap' },
    ];
  const solution = ask === 'none'
    ? `$|A \\cup B \\cup C| = ${A} + ${B} + ${C} - ${AB} - ${AC} - ${BC} + ${abc} = ${union}$, so ${n} − ${union} = ${none} ${c.verb} none of the three.`
    : `Exactly one $= (${A} - ${AB} - ${AC} + ${abc}) + (${B} - ${AB} - ${BC} + ${abc}) + (${C} - ${AC} - ${BC} + ${abc}) = ${answer}$, working from the middle of the Venn diagram outwards.`;
  const question = ask === 'none'
    ? `How many of them ${c.verb} none of the three?`
    : `How many of them ${c.verb} exactly one of the three?`;
  return {
    // "both … and …", and one sentence saying that the pair totals are the inclusive ones: without
    // it the exclusive reading makes the figures contradictory.
    stem: `In ${c.group} ${n} ${c.unit}, ${A} ${c.verb} ${c.objA}, ${B} ${c.verb} ${c.objB} and ${C} ${c.verb} ${c.objC}. ${AB} ${c.verb} both ${c.objA} and ${c.objB}, ${AC} ${c.verb} both ${c.objA} and ${c.objC}, ${BC} ${c.verb} both ${c.objB} and ${c.objC}, and ${abc} ${c.verb} all three. Each of these pair totals includes the ${abc} who ${c.verb} all three.\n\n${question}`,
    answer: { kind: 'exact', value: E(answer) },
    options: countOptions(rng, answer, ds),
    solution,
    trap: 'Inclusion–exclusion for three sets adds the triple overlap back after subtracting the three pairs.',
    tags: ['probability', 'venn', 'three-sets'],
    params: { variant: 'three-set', ask, abc, ab, ac, bc, onlyA, onlyB, onlyC, none },
    typedAllowed: true,
  };
}

function intersectionFromUnionQ(rng: RNG): Generated | null {
  const c = rng.pick(CONTEXTS);
  const r = drawRegions(rng, [40, 50, 60, 80, 100]);
  if (!r) return null;
  if (r.both - r.neither < 2 || r.both <= 2 || r.neither < 2) return null; // keep the "forgot the neither" distractor positive
  return {
    stem: `In ${c.group} ${r.n} ${c.unit}, ${r.a} ${c.verb} ${c.objA} and ${r.b} ${c.verb} ${c.objB}. ${r.neither} of them ${c.verb} neither ${c.objA} nor ${c.objB}.\n\nHow many ${c.verb} both?`,
    answer: { kind: 'exact', value: E(r.both) },
    options: countOptions(rng, r.both, [
      { value: E(r.a + r.b - r.n), trap: 'forgot that some do neither, so used the whole group as the union', must: true },
      { value: E(r.union), trap: 'gave the number doing at least one' },
      { value: E(r.onlyA), trap: `gave those who ${c.verb} ${c.objA} only` },
      { value: E(r.onlyB), trap: `gave those who ${c.verb} ${c.objB} only` },
      { value: E(r.onlyA + r.onlyB), trap: 'gave the number doing exactly one' },
      { value: E(r.neither), trap: 'gave the number doing neither' },
      { value: E(Math.abs(r.a - r.b)), trap: 'took the difference of the two groups' },
    ]),
    solution: `At least one: $${r.n} - ${r.neither} = ${r.union}$. Then $|A \\cap B| = ${r.a} + ${r.b} - ${r.union} = ${r.both}$.`,
    trap: 'The union is the group minus those doing neither — not the whole group.',
    tags: ['probability', 'venn', 'inclusion-exclusion'],
    params: { variant: 'two-set', ask: 'both', n: r.n, onlyA: r.onlyA, onlyB: r.onlyB, both: r.both, neither: r.neither },
    typedAllowed: true,
  };
}

// -----------------------------------------------------------------------------

export default defineTemplate({
  id: 'm1.probability.venn',
  module: 'M1',
  topic: 'probability',
  title: 'Two-set problems',
  levels: {
    1: '|A ∪ B| = |A| + |B| − |A ∩ B| with small counts',
    2: '"neither" and "exactly one" counts from a survey',
    3: 'probability from the two-way split, including P(A | B)',
    4: 'independent / mutually exclusive / neither, or a probability assuming independence',
    5: 'three sets in words, or |A ∩ B| from a union and a "neither" count',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      if (level === 1) return unionQ(rng);
      if (level === 2) return neitherQ(rng);
      if (level === 3) return probabilityQ(rng);
      if (level === 4) return pickVariant(rng, [independenceQ, independentValueQ]);
      return pickVariant(rng, [threeSetQ, intersectionFromUnionQ]);
    });
  },
  verify(q) {
    const p = q.params as Record<string, unknown>;
    const close = (x: number, y: number) => Math.abs(x - y) < 1e-12 * Math.max(1, Math.abs(y));
    switch (p.variant) {
      case 'two-set':
      case 'two-set-prob': {
        if (q.answer.kind !== 'exact') return false;
        // Rebuild the group one member at a time and count directly.
        const people: [boolean, boolean][] = [];
        for (let i = 0; i < (p.both as number); i++) people.push([true, true]);
        for (let i = 0; i < (p.onlyA as number); i++) people.push([true, false]);
        for (let i = 0; i < (p.onlyB as number); i++) people.push([false, true]);
        for (let i = 0; i < (p.neither as number); i++) people.push([false, false]);
        if (people.length !== (p.n as number)) return false;
        const count = (f: (x: boolean, y: boolean) => boolean) => people.filter(([x, y]) => f(x, y)).length;
        const total = people.length;
        const value = q.answer.value.toNumber();
        const prob = p.variant === 'two-set-prob'; // the same region, as a share of the group
        switch (p.ask) {
          case 'union': return value === count((x, y) => x || y);
          case 'neither': return prob ? close(value, count((x, y) => !x && !y) / total) : value === count((x, y) => !x && !y);
          case 'exactly-one': return value === count((x, y) => x !== y);
          case 'both': return prob ? close(value, count((x, y) => x && y) / total) : value === count((x, y) => x && y);
          case 'a-given-b': return close(value, count((x, y) => x && y) / count((_, y) => y));
          case 'b-given-a': return close(value, count((x, y) => x && y) / count((x) => x));
          case 'only-a': return close(value, count((x, y) => x && !y) / total);
          default: return false;
        }
      }
      case 'independence': {
        if (q.answer.kind !== 'choice') return false;
        const na = p.na as number, da = p.da as number, nb = p.nb as number, db = p.db as number;
        const nab = p.nab as number, dab = p.dab as number;
        const indep = nab * da * db === na * nb * dab; // cross-multiplied, no floating point
        const excl = nab === 0;
        const expected = indep && excl
          ? '$A$ and $B$ are both independent and mutually exclusive.'
          : indep ? '$A$ and $B$ are independent.'
            : excl ? '$A$ and $B$ are mutually exclusive.'
              : '$A$ and $B$ are neither independent nor mutually exclusive.';
        return q.answer.value === expected;
      }
      case 'independent-value': {
        if (q.answer.kind !== 'exact') return false;
        const a = (p.na as number) / (p.da as number);
        const b = (p.nb as number) / (p.db as number);
        const u = (p.nu as number) / (p.du as number);
        // Every route below goes through the complements, not through the formula used to build it.
        const expected =
          p.ask === 'intersection' ? a * b
            : p.ask === 'union' ? 1 - (1 - a) * (1 - b)
              : p.ask === 'exactly-one' ? a * (1 - b) + b * (1 - a)
                : 1 - (1 - u) / (1 - a); // find-b: P(B') = P(A' ∩ B') / P(A')
        if (Math.abs(1 - (1 - a) * (1 - b) - u) > 1e-12) return false; // the printed union must fit
        return Math.abs(q.answer.value.toNumber() - expected) < 1e-12;
      }
      case 'three-set': {
        if (q.answer.kind !== 'exact') return false;
        const reg: [number, [boolean, boolean, boolean]][] = [
          [p.abc as number, [true, true, true]],
          [p.ab as number, [true, true, false]],
          [p.ac as number, [true, false, true]],
          [p.bc as number, [false, true, true]],
          [p.onlyA as number, [true, false, false]],
          [p.onlyB as number, [false, true, false]],
          [p.onlyC as number, [false, false, true]],
          [p.none as number, [false, false, false]],
        ];
        const people: [boolean, boolean, boolean][] = [];
        for (const [k, flags] of reg) for (let i = 0; i < k; i++) people.push(flags);
        const value = q.answer.value.toNumber();
        if (p.ask === 'none') return value === people.filter((f) => !f[0] && !f[1] && !f[2]).length;
        return value === people.filter((f) => f.filter(Boolean).length === 1).length;
      }
      default:
        return false;
    }
  },
});
