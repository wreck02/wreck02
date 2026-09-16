import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { gcd } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Sharing in a ratio.
 * Level 1: share N in a : b (£84 in 3 : 4 → 36 and 48)
 * Level 2: three-part ratios (£120 in 2 : 3 : 5; angles of a triangle in 2 : 3 : 4)
 * Level 3: the difference between two shares is given → total or a share; one share is given → the other / the total
 * Level 4: combining ratios a : b = 2 : 3, b : c = 4 : 5 → a : c = 8 : 15 (choice of ratios) or a share from a : b : c
 * Level 5: ratio change: "boys : girls = 3 : 5; 4 boys join and it becomes 1 : 1", or a transfer between two people
 *
 * Every answer is a whole number and so is every option. Wrong options are named mistakes: the other
 * person's share (ratio inverted), dividing by a part instead of the total number of parts, taking the
 * difference or the given share as one part, adding ratios term by term. Parameters that cannot supply
 * four such options are redrawn rather than padded.
 */

type Cand = { value: Exact | null; trap: string };

/** Whole, positive, clean, de-duplicated. */
function whole(ds: Cand[]): Distractor[] {
  const out: Distractor[] = [];
  for (const d of ds) {
    const v = d.value;
    if (!v || !Number.isFinite(v.toNumber()) || !v.isInteger() || v.sign() <= 0 || !isCleanExact(v).ok) continue;
    if (out.some((o) => o.value.equals(v))) continue;
    out.push({ value: v, trap: d.trap });
  }
  return out;
}

/** `must` traps first (in order), then shuffled extras; distinct from each other and from the answer. */
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

const ratio = (...parts: number[]) => parts.join(' : ');
const PAIRS = ['Amy and Ben', 'Priya and Tom', 'Sam and Leah', 'Ali and Zoe', 'Maya and Jack'].map((s) => s.split(' and '));
const TRIOS = [['Amy', 'Ben', 'Cara'], ['Priya', 'Tom', 'Usha'], ['Ali', 'Zoe', 'Kai'], ['Jack', 'Maya', 'Noor']];

function pack(rng: RNG, stem: string, ans: Exact, ds: Distractor[], solution: string, trap: string, tags: string[], params: Record<string, unknown>): Generated | null {
  if (ds.length < 4) return null;
  return {
    stem,
    answer: { kind: 'exact' as const, value: ans },
    options: buildOptions(rng, ans, ds),
    solution,
    trap,
    tags,
    params,
    typedAllowed: true,
  };
}

// ---------------------------------------------------------------------------
// Level 1: two-part share
// ---------------------------------------------------------------------------

const TWO_PART: [number, number][] = [[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [2, 5], [3, 5], [4, 5], [1, 5], [3, 7], [2, 7], [5, 7], [1, 6], [5, 6], [3, 8], [5, 8], [4, 7], [2, 9]];

function shareTwo(rng: RNG): Generated | null {
  const [a, b] = rng.pick(TWO_PART);
  const k = rng.int(3, 15);
  const N = k * (a + b);
  if (N > 200) return null;
  const [n1, n2] = rng.pick(PAIRS);
  const first = rng.bool();
  const [part, other] = first ? [a, b] : [b, a];
  const who = first ? n1 : n2;
  const ans = E(part * k);
  const ctx = rng.pick(['money', 'sweets', 'ribbon']);
  let stem: string;
  if (ctx === 'money') stem = `£${N} is shared between ${n1} and ${n2} in the ratio $${ratio(a, b)}$. How much does ${who} receive, in pounds?`;
  else if (ctx === 'sweets') stem = `${n1} and ${n2} share ${N} sweets in the ratio $${ratio(a, b)}$. How many sweets does ${who} get?`;
  else stem = `A ribbon of length ${N} cm is cut into two pieces in the ratio $${ratio(a, b)}$. Find the length, in cm, of the ${part < other ? 'shorter' : 'longer'} piece.`;
  const must = whole([
    { value: E(other * k), trap: 'gave the other share (ratio read the wrong way round)' },
  ]);
  const extra = whole([
    { value: frac(N * part, other), trap: 'divided by the other part instead of the total number of parts' },
    { value: frac(N, part), trap: 'divided the total by the part' },
    { value: E(k), trap: 'found the value of one part only' },
    { value: frac(N, 2), trap: 'shared equally' },
    { value: E((part + 1) * k), trap: 'used the next part up' },
    { value: E((part - 1) * k), trap: 'used the next part down' },
    { value: frac(N * part, a + b + 1), trap: 'miscounted the number of parts' },
  ]);
  return pack(rng, stem, ans, ranked(rng, ans, must, extra),
    `There are $${a} + ${b} = ${a + b}$ parts, so one part is $${N} \\div ${a + b} = ${k}$ and ${ctx === 'ribbon' ? `the ${part < other ? 'shorter' : 'longer'} piece` : `${who}'s share`} is $${part} \\times ${k} = ${part * k}$.`,
    'Divide by the total number of parts (a + b), not by one of the parts, and multiply by the part that was asked for.',
    ['ratio', 'sharing'],
    { variant: 'two', parts: [a, b], k, asked: part },
  );
}

// ---------------------------------------------------------------------------
// Level 2: three-part share
// ---------------------------------------------------------------------------

const THREE_PART: [number, number, number][] = [[1, 2, 3], [2, 3, 5], [1, 3, 4], [2, 3, 4], [3, 4, 5], [1, 2, 5], [1, 4, 5], [2, 5, 7], [1, 3, 5], [3, 5, 7], [2, 3, 7], [1, 2, 4]];

function shareThree(rng: RNG): Generated | null {
  const parts = rng.pick(THREE_PART);
  const sum = parts[0] + parts[1] + parts[2];
  const ctx = rng.pick(['money', 'money', 'angles', 'counters']);
  let k: number;
  let N: number;
  if (ctx === 'angles') {
    if (180 % sum !== 0) return null;
    N = 180; k = 180 / sum;
  } else {
    k = rng.int(3, 20);
    N = k * sum;
    if (N > 400) return null;
  }
  const names = rng.pick(TRIOS);
  const which = rng.int(0, 2);
  const part = parts[which];
  const ans = E(part * k);
  const label = which === 2 ? 'largest' : which === 0 ? 'smallest' : 'middle';
  let stem: string;
  if (ctx === 'angles') stem = `The angles of a triangle are in the ratio $${ratio(...parts)}$. Find the size of the ${label} angle in degrees.`;
  else if (ctx === 'money') stem = rng.bool()
    ? `£${N} is shared between ${names[0]}, ${names[1]} and ${names[2]} in the ratio $${ratio(...parts)}$. How much does ${names[which]} receive, in pounds?`
    : `A prize of £${N} is divided in the ratio $${ratio(...parts)}$. Find the ${label} share in pounds.`;
  else stem = `${N} counters are shared between three players in the ratio $${ratio(...parts)}$. How many counters does the player with the ${label} share receive?`;
  const others = parts.filter((_, i) => i !== which);
  const otherIdx = [0, 1, 2].filter((i) => i !== which);
  const NAME = ['smallest', 'middle', 'largest'];
  const must = whole([
    { value: E(others[0] * k), trap: `gave the ${NAME[otherIdx[0]]} share instead of the ${label} one` },
    { value: E(others[1] * k), trap: `gave the ${NAME[otherIdx[1]]} share instead of the ${label} one` },
  ]);
  const extra = whole([
    { value: frac(N, 3), trap: 'shared equally between three' },
    { value: E(k), trap: 'found one part only' },
    { value: frac(N * part, others[0] + others[1]), trap: 'divided by the other two parts instead of all three' },
    { value: E((part + 1) * k), trap: 'used the next part up' },
    { value: E((part - 1) * k), trap: 'used the next part down' },
    { value: E((sum - part) * k), trap: 'found what the other two receive together' },
    { value: frac(N * part, sum + 1), trap: 'miscounted the number of parts' },
  ]);
  return pack(rng, stem, ans, ranked(rng, ans, must, extra),
    `$${parts.join(' + ')} = ${sum}$ parts, so one part is $${N} \\div ${sum} = ${k}$; the ${label} share is $${part} \\times ${k} = ${part * k}$.`,
    'Add all three parts before dividing; then multiply by the part that was asked for, not a different one.',
    ['ratio', 'sharing', 'three-part'],
    { variant: 'three', parts, k, asked: part },
  );
}

// ---------------------------------------------------------------------------
// Level 3: difference given, or one share given
// ---------------------------------------------------------------------------

function fromDifference(rng: RNG): Generated | null {
  const [b, a] = rng.pick(TWO_PART); // a > b
  if (a === b) return null;
  const k = rng.int(3, 15);
  const D = (a - b) * k;
  const total = (a + b) * k;
  const [n1, n2] = rng.pick(PAIRS);
  const ask = rng.pick(['total', 'larger', 'smaller']);
  const ans = E(ask === 'total' ? total : ask === 'larger' ? a * k : b * k);
  const ctx = rng.pick(['money', 'stickers']);
  const intro = ctx === 'money'
    ? `${n1} and ${n2} share a sum of money in the ratio $${ratio(a, b)}$. ${n1} receives £${D} more than ${n2}.`
    : `${n1} and ${n2} share some stickers in the ratio $${ratio(a, b)}$. ${n1} gets ${D} more stickers than ${n2}.`;
  const unit = ctx === 'money' ? ' in pounds' : '';
  const question = ask === 'total' ? `How much ${ctx === 'money' ? 'money is shared altogether' : 'stickers are there altogether'}${ctx === 'money' ? ', in pounds' : ''}?`
    : `How ${ctx === 'money' ? 'much' : 'many'} does ${ask === 'larger' ? n1 : n2} ${ctx === 'money' ? 'receive' : 'get'}${unit}?`;
  const must = whole([
    { value: E(ask === 'total' ? D * (a + b) : ask === 'larger' ? D * a : D * b), trap: 'used the difference as the value of one part' },
  ]);
  const extra = whole([
    { value: E(total), trap: 'gave the total' },
    { value: E(a * k), trap: `gave ${n1}'s share` },
    { value: E(b * k), trap: `gave ${n2}'s share` },
    { value: E(k), trap: 'found one part only' },
    { value: E(ans.toNumber() + k), trap: 'one part too many' },
    { value: E(ans.toNumber() - k), trap: 'one part too few' },
    { value: E(2 * D), trap: 'doubled the difference' },
  ]);
  return pack(rng, intro + ' ' + question, ans, ranked(rng, ans, must, extra),
    `The difference is $${a} - ${b} = ${a - b}$ part${a - b === 1 ? '' : 's'}, so one part is $${D} \\div ${a - b} = ${k}$. ${ask === 'total' ? `The total is $${a + b} \\times ${k} = ${total}$.` : `${ask === 'larger' ? n1 : n2}'s share is $${ask === 'larger' ? a : b} \\times ${k} = ${ans.toLatex()}$.`}`,
    'The difference between the shares corresponds to (a − b) parts, not to one part and not to the total.',
    ['ratio', 'difference'],
    { variant: 'difference', parts: [a, b], k, ask },
  );
}

function fromOneShare(rng: RNG): Generated | null {
  const [a, b] = rng.pick(TWO_PART);
  const k = rng.int(3, 15);
  const [n1, n2] = rng.pick(PAIRS);
  const givenFirst = rng.bool();
  const [gPart, oPart] = givenFirst ? [a, b] : [b, a];
  const [gName, oName] = givenFirst ? [n1, n2] : [n2, n1];
  const given = gPart * k;
  const ask = rng.pick(['other', 'other', 'total']);
  const ans = E(ask === 'other' ? oPart * k : (a + b) * k);
  const stem = `${n1} and ${n2} share some money in the ratio $${ratio(a, b)}$. ${gName} receives £${given}. ${ask === 'other' ? `How much does ${oName} receive, in pounds?` : 'How much money is shared altogether, in pounds?'}`;
  const must = whole([
    { value: ask === 'other' ? frac(given * gPart, oPart) : E(given * (a + b)), trap: ask === 'other' ? 'ratio inverted: scaled the wrong way' : 'used the given share as the value of one part' },
  ]);
  const extra = whole([
    { value: E(ask === 'other' ? (a + b) * k : oPart * k), trap: ask === 'other' ? 'gave the total instead' : `gave ${oName}'s share instead` },
    { value: E(given + (oPart - gPart)), trap: 'added the difference in the ratio numbers' },
    { value: E(given * oPart), trap: 'multiplied the given share by the other part' },
    { value: E(k), trap: 'found one part only' },
    { value: E(Math.abs(oPart - gPart) * k), trap: 'found the difference between the shares' },
    { value: E(ans.toNumber() + k), trap: 'off by one part' },
  ]);
  return pack(rng, stem, ans, ranked(rng, ans, must, extra),
    `${gName}'s $${gPart}$ parts are £${given}, so one part is $${given} \\div ${gPart} = ${k}$. ${ask === 'other' ? `${oName} gets $${oPart} \\times ${k} = ${oPart * k}$.` : `The total is $${a + b} \\times ${k} = ${(a + b) * k}$.`}`,
    'Find the value of one part from the share you are given (divide by that person\'s ratio number), then scale.',
    ['ratio', 'one-share'],
    { variant: 'one-share', parts: [a, b], k, givenPart: gPart, ask },
  );
}

// ---------------------------------------------------------------------------
// Level 4: combining ratios
// ---------------------------------------------------------------------------

function reduce(x: number, y: number): [number, number] {
  const g = gcd(x, y) || 1;
  return [x / g, y / g];
}

function pickChain(rng: RNG): { p: number; q: number; r: number; s: number } | null {
  const p = rng.int(1, 6), q = rng.int(1, 6), r = rng.int(1, 6), s = rng.int(1, 6);
  if (gcd(p, q) !== 1 || gcd(r, s) !== 1 || p === q || r === s || q === r) return null;
  const [A, C] = reduce(p * r, q * s);
  if (A === C || A > 30 || C > 30) return null;
  return { p, q, r, s };
}

function combineChoice(rng: RNG): Generated | null {
  const c = pickChain(rng);
  if (!c) return null;
  const { p, q, r, s } = c;
  const [A, C] = reduce(p * r, q * s);
  // a : c = p·r : q·s is the product of two ratios, so it has the biggest numbers on the page unless the
  // list also holds an uncancelled version of it. Offer one in most questions (never all, or "not the
  // biggest ratio" would become a tell of its own), and redraw when this draw cannot supply one.
  const forceBigger = rng.bool(0.75);
  if (forceBigger && gcd(p * r, q * s) === 1) return null;
  const correct = `$${ratio(A, C)}$`;
  const L = (q * r) / gcd(q, r);
  const cand: { pair: [number, number]; trap: string }[] = [
    { pair: [p * r, q * s], trap: 'did not cancel the ratio to its simplest form' },
    { pair: [p * (L / q), s * (L / r)], trap: 'read $a : c$ off the scaled triple without cancelling' },
    { pair: reduce(p, s), trap: 'took the outer numbers without first making the b values match' },
    { pair: reduce(p * s, q * r), trap: 'cross-multiplied the wrong way round' },
    { pair: reduce(q * s, p * r), trap: 'gave c : a instead of a : c' },
    { pair: reduce(p + r, q + s), trap: 'added the ratios term by term' },
    { pair: reduce(p * q, r * s), trap: 'multiplied within each ratio instead of across them' },
    { pair: reduce(p * r, q * r), trap: 'gave a : b' },
    { pair: reduce(r, s), trap: 'gave b : c' },
  ];
  const pool: { display: string; trap: string; sum: number }[] = [];
  const seen = new Set([correct]);
  for (const w of cand) {
    if (w.pair[0] === w.pair[1]) continue;
    const d = `$${ratio(w.pair[0], w.pair[1])}$`;
    if (seen.has(d)) continue;
    seen.add(d);
    pool.push({ display: d, trap: w.trap, sum: w.pair[0] + w.pair[1] });
  }
  const bigger = pool.filter((w) => w.sum > A + C);
  const rest = pool.filter((w) => w.sum <= A + C);
  if (pool.length < 4 || (forceBigger && bigger.length === 0)) return null;
  const wrong = (forceBigger
    ? [...rng.shuffle(bigger).slice(0, Math.min(2, bigger.length)), ...rng.shuffle(rest), ...rng.shuffle(bigger)]
    : rng.shuffle(pool))
    .filter((w, i, all) => all.indexOf(w) === i)
    .slice(0, 4)
    .map((w) => ({ display: w.display, trap: w.trap }));
  if (wrong.length < 4) return null;
  const stem = rng.bool()
    ? `Given that $a : b = ${ratio(p, q)}$ and $b : c = ${ratio(r, s)}$, find $a : c$ in its simplest form.`
    : `In a school the ratio of teachers to teaching assistants is $${ratio(p, q)}$ and the ratio of teaching assistants to technicians is $${ratio(r, s)}$. Find the ratio of teachers to technicians in its simplest form.`;
  return {
    stem,
    answer: { kind: 'choice', value: correct },
    options: buildChoiceOptions(rng, correct, wrong),
    solution: `Make the $b$ values equal (${L}): $a : b = ${ratio(p * (L / q), L)}$ and $b : c = ${ratio(L, s * (L / r))}$, so $a : b : c = ${ratio(p * (L / q), L, s * (L / r))}$ and $a : c = ${ratio(A, C)}$.`,
    trap: 'The middle quantity must be scaled to the same number in both ratios before reading off a : c; you cannot just take the outer numbers or add the ratios.',
    tags: ['ratio', 'combine'],
    params: { variant: 'combine', p, q, r, s },
    typedAllowed: false,
  };
}

function combineShare(rng: RNG): Generated | null {
  const c = pickChain(rng);
  if (!c) return null;
  const { p, q, r, s } = c;
  const L = (q * r) / gcd(q, r);
  const A = p * (L / q), B = L, C = s * (L / r); // a : b : c
  const k = rng.int(2, 8);
  const values = [A * k, B * k, C * k];
  const total = values[0] + values[1] + values[2];
  if (total > 500) return null;
  const given = rng.pick(['a', 'b', 'c', 'total']);
  const askIdx = rng.pick([0, 1, 2].filter((i) => 'abc'[i] !== given));
  const ans = E(values[askIdx]);
  const givenText = given === 'total' ? `$a + b + c = ${total}$` : `$${given} = ${values['abc'.indexOf(given)]}$`;
  const stem = `Three positive numbers $a$, $b$ and $c$ satisfy $a : b = ${ratio(p, q)}$ and $b : c = ${ratio(r, s)}$. Given that ${givenText}, find $${'abc'[askIdx]}$.`;
  // headline: used the unscaled outer ratio p : s for a : c
  let naive: Exact | null = null;
  if (given === 'c' && askIdx === 0) naive = frac(values[2] * p, s);
  else if (given === 'a' && askIdx === 2) naive = frac(values[0] * s, p);
  else if (given === 'total') naive = frac(total * [p, q, s][askIdx], p + q + s);
  const givenValue = given === 'total' ? total : values['abc'.indexOf(given)];
  const notGiven = (ds: Distractor[]) => ds.filter((d) => d.value.toNumber() !== givenValue);
  const must = notGiven(whole([{ value: naive, trap: 'used the ratios without first matching the b values' }]));
  const extra = notGiven(whole([
    { value: E(values[(askIdx + 1) % 3]), trap: `gave $${'abc'[(askIdx + 1) % 3]}$ instead of $${'abc'[askIdx]}$` },
    { value: E(values[(askIdx + 2) % 3]), trap: `gave $${'abc'[(askIdx + 2) % 3]}$ instead of $${'abc'[askIdx]}$` },
    { value: E(total), trap: 'gave the total' },
    { value: E(k), trap: 'found one part only' },
    { value: E(values[askIdx] + k), trap: 'one part too many' },
    { value: E(values[askIdx] - k), trap: 'one part too few' },
  ]));
  return pack(rng, stem, ans, ranked(rng, ans, must, extra),
    `Scale so that $b$ is ${L} in both: $a : b : c = ${ratio(A, B, C)}$. ${given === 'total' ? `The ${A + B + C} parts make ${total}, so one part is ${k}` : `Then $${given} = ${values['abc'.indexOf(given)]}$ means one part is ${k}`}, and $${'abc'[askIdx]} = ${[A, B, C][askIdx]} \\times ${k} = ${values[askIdx]}$.`,
    'Combine the ratios into a : b : c by matching the b values first; only then can any one value be used to find the others.',
    ['ratio', 'combine', 'sharing'],
    { variant: 'combine-share', p, q, r, s, k, askIdx },
  );
}

// ---------------------------------------------------------------------------
// Level 5: ratio change
// ---------------------------------------------------------------------------

const RATIOS: [number, number][] = [[1, 1], [1, 2], [2, 1], [1, 3], [3, 1], [2, 3], [3, 2], [3, 4], [4, 3], [3, 5], [5, 3], [2, 5], [5, 2], [4, 5], [5, 4], [1, 4], [4, 1], [5, 7], [7, 5], [5, 6], [3, 7]];

function joinLeave(rng: RNG): Generated | null {
  const [p, q] = rng.pick(RATIOS);
  const [r, s] = rng.pick(RATIOS);
  if (p * s === q * r) return null;
  const k = rng.int(2, 12);
  const boys = p * k, girls = q * k;
  // one of four moves: boys join / girls join / boys leave / girls leave, solved for the whole number x
  const move = rng.pick(['boys join', 'girls join', 'boys leave', 'girls leave']);
  let x: number;
  if (move === 'boys join') x = (r * girls) / s - boys;
  else if (move === 'boys leave') x = boys - (r * girls) / s;
  else if (move === 'girls join') x = (s * boys) / r - girls;
  else x = girls - (s * boys) / r;
  if (!Number.isInteger(x) || x < 1 || x > 24) return null;
  const nb = boys + (move === 'boys join' ? x : move === 'boys leave' ? -x : 0);
  const ng = girls + (move === 'girls join' ? x : move === 'girls leave' ? -x : 0);
  if (nb < 1 || ng < 1 || nb * s !== ng * r) return null;
  const newTotal = nb + ng;
  if (newTotal > 80) return null;
  const ask = rng.pick(['now', 'now', 'girls-original', 'boys-original', 'original-total']);
  const ans = E(ask === 'now' ? newTotal : ask === 'girls-original' ? girls : ask === 'boys-original' ? boys : boys + girls);
  // "After 1 girls leave the class" is not exam register: singularise when x = 1.
  const group = move.split(' ')[0]; // 'boys' | 'girls'
  const who = x === 1 ? group.slice(0, -1) : group; // boy / girl
  const verb = move.endsWith('join') ? (x === 1 ? 'joins the class' : 'join the class') : (x === 1 ? 'leaves the class' : 'leave the class');
  const stem = `In a class the ratio of boys to girls is $${ratio(p, q)}$. After ${x} ${who} ${verb}, the ratio of boys to girls is $${ratio(r, s)}$. ` +
    (ask === 'now' ? 'How many students are now in the class?'
      : ask === 'girls-original' ? 'How many girls were in the class originally?'
        : ask === 'boys-original' ? 'How many boys were in the class originally?'
          : 'How many students were in the class originally?');
  const g = ratio(r, s);
  const pk = `${p === 1 ? '' : p}k`, qk = `${q === 1 ? '' : q}k`;
  const must = whole([
    { value: E(ask === 'now' ? boys + girls : ask === 'original-total' ? newTotal : ask === 'boys-original' ? nb : ng), trap: ask === 'now' ? 'gave the original number of students' : ask === 'original-total' ? 'gave the number of students now' : 'gave the number after the change' },
  ]);
  const extra = whole([
    { value: E(x * (p + q)), trap: 'took the number who moved as one part of the original ratio' },
    { value: E(x * (r + s)), trap: 'took the number who moved as one part of the new ratio' },
    { value: E(k), trap: 'found one part only' },
    { value: E(boys), trap: 'gave the original number of boys' },
    { value: E(girls), trap: 'gave the original number of girls' },
    { value: E(newTotal), trap: 'gave the number of students now' },
    { value: E(boys + girls), trap: 'gave the original number of students' },
    { value: E(ans.toNumber() + x), trap: `counted the ${x} who moved twice` },
    { value: E(ans.toNumber() - x), trap: `forgot the ${x} who moved` },
  ]);
  return pack(rng, stem, ans, ranked(rng, ans, must, extra),
    `Let the original numbers be $${pk}$ boys and $${qk}$ girls. After the change, $(${move === 'boys join' ? `${pk} + ${x}` : move === 'boys leave' ? `${pk} - ${x}` : pk}) : (${move === 'girls join' ? `${qk} + ${x}` : move === 'girls leave' ? `${qk} - ${x}` : qk}) = ${g}$, so ${move.startsWith('boys') ? `$${s}(${pk} ${move === 'boys join' ? '+' : '-'} ${x}) = ${r} \\times ${qk}$` : `$${s} \\times ${pk} = ${r}(${qk} ${move === 'girls join' ? '+' : '-'} ${x})$`}, giving $k = ${k}$. Originally $${boys}$ boys and $${girls}$ girls; now $${nb}$ boys and $${ng}$ girls, ${newTotal} students in all.`,
    'Set the original numbers as pk and qk, apply the change to the right group only, and equate the new ratio; then answer the question actually asked (now or originally).',
    ['ratio', 'change', 'algebra'],
    { variant: 'change', p, q, k, move, x, r, s, ask },
  );
}

function transfer(rng: RNG): Generated | null {
  const [p, q] = rng.pick(RATIOS.filter(([a, b]) => a > b));
  const T = p + q;
  // new ratio r : s with r + s = T and r < p (the giver ends with fewer parts)
  const rs: [number, number][] = [];
  for (let r = 1; r < p; r++) if (gcd(r, T - r) === 1) rs.push([r, T - r]);
  if (rs.length === 0) return null;
  const [r, s] = rng.pick(rs);
  const k = rng.int(2, 12);
  const t = (p - r) * k;
  const [n1, n2] = rng.pick(PAIRS);
  const ask = rng.pick(['giver-original', 'giver-original', 'receiver-original', 'total', 'receiver-now']);
  const values: Record<string, number> = { 'giver-original': p * k, 'receiver-original': q * k, total: T * k, 'receiver-now': s * k };
  const ans = E(values[ask]);
  const stem = `${n1} and ${n2} have money in the ratio $${ratio(p, q)}$. ${n1} gives ${n2} £${t}, and they now have money in the ratio $${ratio(r, s)}$. ` +
    (ask === 'giver-original' ? `How much did ${n1} have originally, in pounds?`
      : ask === 'receiver-original' ? `How much did ${n2} have originally, in pounds?`
        : ask === 'total' ? 'How much money do they have altogether, in pounds?'
          : `How much does ${n2} have now, in pounds?`);
  const must = whole([
    { value: E(t * (ask === 'total' ? T : ask === 'giver-original' ? p : ask === 'receiver-original' ? q : s)), trap: 'took the £' + t + ' as the value of one part' },
  ]);
  const extra = whole([
    { value: E(p * k), trap: `gave ${n1}'s original amount` },
    { value: E(q * k), trap: `gave ${n2}'s original amount` },
    { value: E(T * k), trap: 'gave the total' },
    { value: E(s * k), trap: `gave ${n2}'s amount now` },
    { value: E(r * k), trap: `gave ${n1}'s amount now` },
    { value: E(k), trap: 'found one part only' },
    { value: E(values[ask] + t), trap: 'added the transfer to the wrong amount' },
  ]);
  return pack(rng, stem, ans, ranked(rng, ans, must, extra),
    `The total does not change, and both ratios have $${T}$ parts, so a part is worth the same before and after. ${n1} goes from $${p}$ parts to $${r}$ part${r === 1 ? '' : 's'}, so £${t} is $${p - r}$ part${p - r === 1 ? '' : 's'} and one part is £${k}. ${ask === 'giver-original' ? `${n1} had $${p} \\times ${k} = ${p * k}$.` : ask === 'receiver-original' ? `${n2} had $${q} \\times ${k} = ${q * k}$.` : ask === 'total' ? `Total: $${T} \\times ${k} = ${T * k}$.` : `${n2} now has $${s} \\times ${k} = ${s * k}$.`}`,
    'When money changes hands the total is fixed; if both ratios have the same number of parts, the transfer equals the change in the giver\'s number of parts.',
    ['ratio', 'change', 'transfer'],
    { variant: 'transfer', p, q, r, s, k, ask },
  );
}

// ---------------------------------------------------------------------------

export default defineTemplate({
  id: 'm1.ratio-percent.ratio-split',
  module: 'M1',
  topic: 'ratio-percent',
  title: 'Sharing in a ratio',
  levels: {
    1: 'share N in a : b (£84 in 3 : 4)',
    2: 'three-part ratios: £120 in 2 : 3 : 5, angles of a triangle',
    3: 'difference between shares given → total; one share given → the other',
    4: 'combine a : b and b : c (choice of ratios), or a share from a : b : c',
    5: 'ratio change: people join or leave, or money is transferred',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return pickVariant(rng, [shareTwo]);
        case 2: return pickVariant(rng, [shareThree]);
        case 3: return pickVariant(rng, [fromDifference, fromOneShare]);
        case 4: return pickVariant(rng, [combineChoice, combineShare]);
        default: return pickVariant(rng, [joinLeave, joinLeave, transfer]);
      }
    });
  },
  verify(q) {
    const P = q.params as Record<string, unknown>;
    const variant = P.variant as string;
    if (variant === 'combine') {
      if (q.answer.kind !== 'choice') return false;
      const { p, q: qq, r, s } = P as { p: number; q: number; r: number; s: number };
      const m = /^\$(\d+) : (\d+)\$$/.exec(q.answer.value);
      if (!m) return false;
      const A = Number(m[1]), C = Number(m[2]);
      // a : c must equal (p/q) × (r/s) and be in lowest terms
      return A * qq * s === C * p * r && gcd(A, C) === 1;
    }
    if (q.answer.kind !== 'exact') return false;
    const got = q.answer.value.toNumber();
    const k = P.k as number;
    if (variant === 'two' || variant === 'three') {
      // shares are k × part; the asked share must be one of them and the parts must sum to the total
      const parts = P.parts as number[];
      const asked = P.asked as number;
      return parts.includes(asked) && got === asked * k;
    }
    if (variant === 'difference') {
      const [a, b] = P.parts as number[];
      const ask = P.ask as string;
      const expected = ask === 'total' ? (a + b) * k : ask === 'larger' ? a * k : b * k;
      return got === expected && (a - b) * k > 0;
    }
    if (variant === 'one-share') {
      const [a, b] = P.parts as number[];
      const gp = P.givenPart as number;
      const ask = P.ask as string;
      const other = gp === a ? b : a;
      return got === (ask === 'other' ? other * k : (a + b) * k);
    }
    if (variant === 'combine-share') {
      const { p, q: qq, r, s, askIdx } = P as { p: number; q: number; r: number; s: number; askIdx: number };
      // a = p·r·k', b = q·r·k', c = q·s·k' for some common scale; check the ratios hold for the generated values
      const L = (qq * r) / gcd(qq, r);
      const vals = [p * (L / qq) * k, L * k, s * (L / r) * k];
      return got === vals[askIdx] && vals[0] * qq === vals[1] * p && vals[1] * s === vals[2] * r;
    }
    if (variant === 'change') {
      const { p, q: qq, move, x, r, s, ask } = P as { p: number; q: number; move: string; x: number; r: number; s: number; ask: string };
      const boys = p * k, girls = qq * k;
      const nb = boys + (move === 'boys join' ? x : move === 'boys leave' ? -x : 0);
      const ng = girls + (move === 'girls join' ? x : move === 'girls leave' ? -x : 0);
      if (nb * s !== ng * r) return false;
      const expected = ask === 'now' ? nb + ng : ask === 'girls-original' ? girls : ask === 'boys-original' ? boys : boys + girls;
      return got === expected;
    }
    if (variant === 'transfer') {
      const { p, q: qq, r, s, ask } = P as { p: number; q: number; r: number; s: number; ask: string };
      const t = (p - r) * k;
      const a1 = p * k - t, b1 = qq * k + t;
      if (a1 * s !== b1 * r) return false;
      const expected = ask === 'giver-original' ? p * k : ask === 'receiver-original' ? qq * k : ask === 'total' ? (p + qq) * k : b1;
      return got === expected;
    }
    return false;
  },
});
