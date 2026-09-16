import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, Exact } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import type { RNG } from '../../core/rng';

/**
 * Mental decimal arithmetic. Every answer terminates by construction and is shown as a decimal.
 * Level 1: 0.2 × 0.35, 1.2 + 0.85, 3 − 1.45
 * Level 2: 0.6 ÷ 0.05, 2.5 × 0.4, 1.2²
 * Level 3: 0.75 × 1.6 (spot ¾), 0.125 × 48 (spot ⅛), 1.1 × 1.1
 * Level 4: two-step: 0.3² ÷ 0.09 + 2.5 × 0.16
 * Level 5: 0.2³ ÷ 0.4², 1.5³, 0.9 × 1.1 (spot (1 − x)(1 + x))
 *
 * The expression is a small JSON tree: generate() evaluates it exactly, verify() evaluates it in floating
 * point. Wrong options are named mistakes: a misplaced decimal point (0.6 ÷ 0.05 = 1.2), doubling instead
 * of squaring, multiplying instead of dividing, the middle term dropped from (1 + x)², a borrow slip.
 */

type Node = { op: 'num'; v: string } | { op: '+' | '-' | '*' | '/'; a: Node; b: Node } | { op: 'pow'; a: Node; n: number };

const N = (v: string | number): Node => ({ op: 'num', v: String(v) });
const add = (a: Node, b: Node): Node => ({ op: '+', a, b });
const sub = (a: Node, b: Node): Node => ({ op: '-', a, b });
const mul = (a: Node, b: Node): Node => ({ op: '*', a, b });
const div = (a: Node, b: Node): Node => ({ op: '/', a, b });
const pow = (a: Node, n: number): Node => ({ op: 'pow', a, n });

function evalExact(t: Node): Exact {
  switch (t.op) {
    case 'num': return Exact.decimal(t.v);
    case '+': return evalExact(t.a).add(evalExact(t.b));
    case '-': return evalExact(t.a).sub(evalExact(t.b));
    case '*': return evalExact(t.a).mul(evalExact(t.b));
    case '/': return evalExact(t.a).div(evalExact(t.b));
    case 'pow': return evalExact(t.a).pow(t.n);
  }
}

function evalFloat(t: Node): number {
  switch (t.op) {
    case 'num': return parseFloat(t.v);
    case '+': return evalFloat(t.a) + evalFloat(t.b);
    case '-': return evalFloat(t.a) - evalFloat(t.b);
    case '*': return evalFloat(t.a) * evalFloat(t.b);
    case '/': return evalFloat(t.a) / evalFloat(t.b);
    case 'pow': return evalFloat(t.a) ** t.n;
  }
}

/** LaTeX with the minimum of brackets: products and quotients bind tighter than sums, powers tighter still. */
function tex(t: Node, parent: '' | 'sum' | 'prod' | 'pow' = ''): string {
  switch (t.op) {
    case 'num': return t.v;
    case 'pow': return `${tex(t.a, 'pow')}^{${t.n}}`;
    case '*': case '/': {
      const s = `${tex(t.a, 'prod')} ${t.op === '*' ? '\\times' : '\\div'} ${tex(t.b, 'prod')}`;
      return parent === 'pow' ? `(${s})` : s;
    }
    default: {
      const s = `${tex(t.a, 'sum')} ${t.op} ${tex(t.b, 'sum')}`;
      return parent === '' ? s : `(${s})`;
    }
  }
}

const DEC = { format: 'decimal' as const };
const dec = (x: Exact) => x.toLatex(DEC);
/** Exact value of a decimal string. */
const D = (s: string) => Exact.decimal(s);

/** Terminating, positive, with at most `sig` significant figures: what the exam would print. */
function mental(x: Exact, sig = 3): boolean {
  if (!x.isRational() || x.sign() <= 0 || !isCleanExact(x).ok) return false;
  let d = x.toRat().d;
  while (d % 2n === 0n) d /= 2n;
  while (d % 5n === 0n) d /= 5n;
  if (d !== 1n) return false;
  return x.toPlain(DEC).replace('.', '').replace(/^0+/, '').replace(/0+$/, '').length <= sig;
}

type Cand = { value: Exact | null; trap: string };

function tryE(f: () => Exact): Exact | null {
  try { return f(); } catch { return null; }
}

function cleanOnly(ds: Cand[], sig = 3): Distractor[] {
  const out: Distractor[] = [];
  for (const d of ds) {
    const v = d.value;
    if (!v || !Number.isFinite(v.toNumber()) || !mental(v, sig)) continue;
    if (out.some((o) => o.value.equals(v))) continue;
    out.push({ value: v, trap: d.trap });
  }
  return out;
}

function ranked(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], count = 4): Distractor[] {
  const seen: Exact[] = [answer];
  const out: Distractor[] = [];
  const near = (v: Exact) => { const r = v.toNumber() / answer.toNumber(); return r > 1e-3 && r < 1e3; };
  const take = (d: Distractor) => {
    if (out.length >= count || !near(d.value) || seen.some((s) => s.equals(d.value))) return;
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

const TENTH = E(0.1).toRat();

function pack(rng: RNG, tree: Node, ans: Exact, ds: Distractor[], solution: string, trap: string, tags: string[], variant: string, verb = 'Work out'): Generated | null {
  if (ds.length < 4) return null;
  return {
    stem: `${verb} $${tex(tree)}$.`,
    answer: { kind: 'exact' as const, value: ans, format: 'decimal' as const },
    options: buildOptions(rng, ans, ds, DEC),
    solution,
    trap,
    tags,
    params: { variant, tree },
    typedAllowed: true,
  };
}

/** Shift-of-decimal-point distractors shared by every variant. */
function shifts(ans: Exact): Cand[] {
  return [
    { value: ans.mulRat(10), trap: 'decimal point one place too far right' },
    { value: ans.mulRat(TENTH), trap: 'decimal point one place too far left' },
  ];
}

// ---------------------------------------------------------------------------
// Level 1
// ---------------------------------------------------------------------------

function multiply(rng: RNG, A: string[], B: string[], variant: string, sig = 3): Generated | null {
  const a = rng.pick(A), b = rng.pick(B);
  const tree = mul(N(a), N(b));
  const ans = evalExact(tree);
  if (!mental(ans, sig) || ans.equals(D(a)) || ans.equals(D(b))) return null;
  const x = D(a), y = D(b);
  const must = cleanOnly(shifts(ans), sig);
  const extra = cleanOnly([
    { value: ans.mulRat(100), trap: 'decimal point two places out' },
    { value: x.add(y), trap: 'added instead of multiplying' },
    { value: tryE(() => x.div(y)), trap: 'divided instead of multiplying' },
    { value: tryE(() => y.div(x)), trap: 'divided instead of multiplying' },
    { value: x.sub(y).abs(), trap: 'subtracted instead of multiplying' },
  ], sig);
  // fastest route: whole-number product then place the point, or a fraction spotted
  const da = (a.split('.')[1] ?? '').length, db = (b.split('.')[1] ?? '').length;
  const ia = a.replace('.', '').replace(/^0+/, ''), ib = b.replace('.', '').replace(/^0+/, '');
  const whole = Number(ia) * Number(ib);
  const FRACS: Record<string, string> = { '0.125': '\\tfrac18', '0.25': '\\tfrac14', '0.375': '\\tfrac38', '0.5': '\\tfrac12', '0.625': '\\tfrac58', '0.75': '\\tfrac34', '0.875': '\\tfrac78', '0.2': '\\tfrac15', '0.4': '\\tfrac25', '0.6': '\\tfrac35', '0.8': '\\tfrac45', '1.5': '\\tfrac32', '2.5': '\\tfrac52', '1.25': '\\tfrac54' };
  const fa = FRACS[a], fb = FRACS[b];
  const solution = (fa || fb) && variant === 'fraction'
    ? `Spot the fraction: $${a} = ${fa ?? a}$, so $${a} \\times ${b} = ${fa ?? a} \\times ${b} = ${dec(ans)}$.`.replace(`$${a} = ${fa ?? a}$`, fa ? `$${a} = ${fa}$` : `$${b} = ${fb}$`)
    : `$${ia} \\times ${ib} = ${whole}$, and there are $${da} + ${db} = ${da + db}$ decimal places in total, so the answer is $${dec(ans)}$.`;
  return pack(rng, tree, ans, ranked(rng, ans, must, extra), solution,
    'Multiply the digits as whole numbers, then count the decimal places (the count adds); or recognise 0.75 = ¾, 0.125 = ⅛.',
    ['decimals', 'multiplication'], variant);
}

function addition(rng: RNG): Generated | null {
  const a = rng.pick(['1.2', '2.4', '0.75', '3.6', '0.9', '1.25', '4.5', '0.35', '2.05', '1.8']);
  const b = rng.pick(['0.85', '0.35', '0.45', '1.75', '0.6', '2.15', '0.95', '1.55', '0.08', '3.25']);
  const tree = add(N(a), N(b));
  const ans = evalExact(tree);
  if (!mental(ans)) return null;
  const x = D(a), y = D(b);
  const s = dec(ans);
  const must = cleanOnly([
    { value: x.add(y.mulRat(TENTH)), trap: 'columns misaligned: the second number shifted one place' },
    { value: x.mulRat(TENTH).add(y), trap: 'columns misaligned: the first number shifted one place' },
  ]);
  const extra = cleanOnly([
    { value: /\.\d*0\d/.test(s) ? Exact.decimal(s.replace(/0(?=\d)/, '')) : null, trap: 'dropped a zero from the decimal part' },
    { value: ans.add(E(0.1)), trap: 'carry slip' },
    { value: ans.sub(E(0.1)), trap: 'forgot to carry' },
    { value: x.sub(y).abs(), trap: 'subtracted instead of adding' },
    { value: x.mul(y), trap: 'multiplied instead of adding' },
    { value: ans.add(E(1)), trap: 'carried twice' },
  ]);
  return pack(rng, tree, ans, ranked(rng, ans, must, extra),
    `Line up the decimal points: $${a} + ${b} = ${s}$.`,
    'Line up the decimal points (write 1.2 as 1.20 if it helps) before adding column by column.',
    ['decimals', 'addition'], 'add');
}

function subtraction(rng: RNG): Generated | null {
  const a = rng.pick(['3', '5', '2', '4', '10', '2.5', '4.2', '6', '1', '7.5']);
  const b = rng.pick(['1.45', '0.75', '1.85', '0.35', '2.65', '0.06', '1.2', '3.15', '0.95', '4.55']);
  const tree = sub(N(a), N(b));
  const ans = evalExact(tree);
  if (ans.sign() <= 0 || !mental(ans)) return null;
  const x = D(a), y = D(b);
  const bWhole = Math.floor(Number(b)), bFrac = D(b).sub(E(bWhole));
  const must = cleanOnly([
    { value: ans.add(E(0.1)), trap: 'borrow slip: one tenth too many' },
  ]);
  const extra = cleanOnly([
    { value: ans.sub(E(0.1)), trap: 'borrow slip: one tenth too few' },
    { value: bWhole > 0 ? x.sub(E(bWhole)).add(bFrac) : null, trap: 'subtracted the whole-number part but added the decimal part' },
    { value: x.sub(bFrac), trap: 'forgot to subtract the whole-number part' },
    { value: ans.add(E(1)), trap: 'forgot to borrow from the units' },
    { value: x.add(y), trap: 'added instead of subtracting' },
    { value: x.sub(y.mulRat(TENTH)), trap: 'columns misaligned' },
  ]);
  return pack(rng, tree, ans, ranked(rng, ans, must, extra),
    `Count up from $${b}$: to the next whole number is $${dec(E(Math.ceil(Number(b))).sub(y))}$, then $${dec(x.sub(E(Math.ceil(Number(b)))))}$ more, total $${dec(ans)}$.`,
    'Subtract by counting up to the next whole number, or write 3 as 3.00 and borrow carefully; 3 − 1.45 is 1.55, not 1.65 or 2.55.',
    ['decimals', 'subtraction'], 'sub');
}

// ---------------------------------------------------------------------------
// Level 2
// ---------------------------------------------------------------------------

function division(rng: RNG): Generated | null {
  const a = rng.pick(['0.6', '0.8', '1.2', '4.5', '0.36', '0.9', '2.4', '3', '0.72', '1.5', '0.04', '6']);
  const b = rng.pick(['0.05', '0.2', '0.4', '0.5', '0.06', '0.03', '1.5', '0.15', '0.08', '0.02', '0.3', '0.12']);
  const tree = div(N(a), N(b));
  const ans = evalExact(tree);
  if (!mental(ans) || ans.toNumber() < 0.1 || ans.toNumber() > 200 || ans.equals(D(a))) return null;
  const x = D(a), y = D(b);
  const must = cleanOnly(shifts(ans));
  const extra = cleanOnly([
    { value: ans.mulRat(100), trap: 'decimal point two places out' },
    { value: ans.mulRat(E(0.01).toRat()), trap: 'decimal point two places out' },
    { value: x.mul(y), trap: 'multiplied instead of dividing' },
    { value: tryE(() => y.div(x)), trap: 'divided the wrong way round' },
    { value: x.sub(y).abs(), trap: 'subtracted instead of dividing' },
  ]);
  const shift = Math.max((a.split('.')[1] ?? '').length, (b.split('.')[1] ?? '').length);
  const scale = 10 ** shift;
  const A = dec(x.mulRat(scale)), B = dec(y.mulRat(scale));
  return pack(rng, tree, ans, ranked(rng, ans, must, extra),
    `Multiply both numbers by $${scale}$: $${a} \\div ${b} = ${A} \\div ${B} = ${dec(ans)}$.`,
    'Scale numerator and denominator by the same power of ten until the divisor is a whole number: 0.6 ÷ 0.05 = 60 ÷ 5 = 12, not 1.2.',
    ['decimals', 'division'], 'div');
}

function square(rng: RNG, bases: string[], variant: string, sig = 3): Generated | null {
  const a = rng.pick(bases);
  const asProduct = rng.bool(0.4);
  const tree = asProduct ? mul(N(a), N(a)) : pow(N(a), 2);
  const ans = evalExact(tree);
  if (!mental(ans, sig)) return null;
  const x = D(a);
  const v = Number(a);
  const must = cleanOnly([
    { value: x.mulRat(2), trap: 'doubled instead of squaring' },
    { value: ans.mulRat(10), trap: 'decimal point one place too far right (0.3² is 0.09, not 0.9)' },
  ], sig);
  const extra = cleanOnly([
    { value: ans.mulRat(TENTH), trap: 'decimal point one place too far left' },
    { value: v > 1 ? E(1).add(x.sub(E(1)).pow(2)) : null, trap: 'dropped the middle term of (1 + x)²' },
    { value: v > 1 ? E(1).add(x.sub(E(1)).mulRat(2)) : null, trap: 'dropped the x² term of (1 + x)²' },
    { value: v < 1 ? x.mulRat(TENTH) : null, trap: 'squared the decimal part only' },
    { value: ans.mulRat(100), trap: 'decimal point two places out' },
    { value: x.add(x.mul(x)), trap: 'added the number to its square' },
  ], sig);
  const ia = a.replace('.', '').replace(/^0+/, '');
  const dp = (a.split('.')[1] ?? '').length;
  const solution = v > 1 && v < 2
    ? `$(1 + ${dec(x.sub(E(1)))})^2 = 1 + 2 \\times ${dec(x.sub(E(1)))} + ${dec(x.sub(E(1)).pow(2))} = ${dec(ans)}$.`
    : `$${ia}^2 = ${Number(ia) ** 2}$ with $2 \\times ${dp} = ${2 * dp}$ decimal places: $${dec(ans)}$.`;
  return pack(rng, tree, ans, ranked(rng, ans, must, extra), solution,
    'Squaring doubles the number of decimal places: 0.3² = 0.09, 1.2² = 1.44 (not 1.4 or 2.4).',
    ['decimals', 'squares'], variant);
}

// ---------------------------------------------------------------------------
// Level 4: two steps
// ---------------------------------------------------------------------------

function twoStep(rng: RNG): Generated | null {
  // term 1: a² ÷ b, a × b or a ÷ b ; term 2: c × d or c ÷ d ; combined with + or −
  const kind1 = rng.pick(['sqdiv', 'sqdiv', 'mul', 'div']);
  let t1: Node;
  if (kind1 === 'sqdiv') {
    const a = rng.pick(['0.3', '0.2', '0.4', '0.6', '0.5', '1.2', '0.9']);
    const b = rng.pick(['0.09', '0.04', '0.16', '0.36', '0.25', '0.3', '0.2', '0.6', '0.8', '0.03', '0.02', '1.2']);
    t1 = div(pow(N(a), 2), N(b));
  } else if (kind1 === 'mul') {
    t1 = mul(N(rng.pick(['0.25', '0.75', '1.5', '0.6', '0.125', '2.5'])), N(rng.pick(['0.8', '1.6', '0.4', '2.4', '3.2', '0.2'])));
  } else {
    t1 = div(N(rng.pick(['0.6', '1.2', '0.9', '2.4', '0.45', '3'])), N(rng.pick(['0.05', '0.3', '0.4', '0.06', '1.5', '0.15'])));
  }
  const c = rng.pick(['2.5', '0.5', '1.5', '0.75', '0.25', '4.5', '0.2']);
  const d = rng.pick(['0.16', '0.4', '0.8', '1.2', '0.6', '0.05', '0.3', '1.6']);
  const t2 = rng.bool(0.7) ? mul(N(c), N(d)) : div(N(c), N(d));
  const op = rng.bool(0.6) ? '+' : '-';
  const v1 = evalExact(t1), v2 = evalExact(t2);
  if (!mental(v1) || !mental(v2) || v1.equals(v2)) return null;
  const tree: Node = op === '+' ? add(t1, t2) : sub(t1, t2);
  const ans = evalExact(tree);
  if (!mental(ans) || ans.toNumber() < 0.05) return null;
  const combine = (p: Exact, q: Exact) => (op === '+' ? p.add(q) : p.sub(q));
  // for a first term a² ÷ b: the base a and the divisor b, to build the "doubled" and "forgot to square" mistakes
  const sq = t1.op === '/' && t1.a.op === 'pow' && t1.a.a.op === 'num' ? { base: D(t1.a.a.v), divisor: evalExact(t1.b) } : null;
  const must = cleanOnly([
    { value: sq ? tryE(() => combine(sq.base.mulRat(2).div(sq.divisor), v2)) : null, trap: 'doubled instead of squaring in the first term' },
    { value: combine(v1.mulRat(10), v2), trap: 'decimal point slip in the first term' },
    { value: combine(v1, v2.mulRat(10)), trap: 'decimal point slip in the second term' },
  ]);
  const extra = cleanOnly([
    { value: combine(v1.mulRat(TENTH), v2), trap: 'decimal point slip in the first term' },
    { value: combine(v1, v2.mulRat(TENTH)), trap: 'decimal point slip in the second term' },
    { value: op === '+' ? v1.sub(v2).abs() : v1.add(v2), trap: op === '+' ? 'subtracted the terms' : 'added the terms' },
    { value: v1.mul(v2), trap: 'multiplied the two terms' },
    { value: ans.mulRat(10), trap: 'decimal point slip at the end' },
    { value: sq ? tryE(() => combine(sq.base.div(sq.divisor), v2)) : null, trap: 'forgot to square' },
  ]);
  return pack(rng, tree, ans, ranked(rng, ans, must, extra),
    `First term: $${tex(t1)} = ${dec(v1)}$; second term: $${tex(t2)} = ${dec(v2)}$; so the value is $${dec(v1)} ${op} ${dec(v2)} = ${dec(ans)}$.`,
    'Evaluate each product/quotient separately, watching the decimal point in each, and only then add or subtract.',
    ['decimals', 'two-step', 'order-of-operations'], 'two-step', 'Evaluate');
}

// ---------------------------------------------------------------------------
// Level 5
// ---------------------------------------------------------------------------

function cubeOverSquare(rng: RNG): Generated | null {
  const a = rng.pick(['0.2', '0.3', '0.4', '0.5', '0.6', '1.2', '0.1']);
  const b = rng.pick(['0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.05']);
  const tree = div(pow(N(a), 3), pow(N(b), 2));
  const ans = evalExact(tree);
  if (!mental(ans) || a === b) return null;
  const x = D(a), y = D(b);
  const must = cleanOnly(shifts(ans));
  const extra = cleanOnly([
    { value: tryE(() => x.mulRat(3).div(y.mulRat(2))), trap: 'multiplied by the indices instead of raising to the powers' },
    { value: tryE(() => x.pow(2).div(y.pow(2))), trap: 'squared the numerator instead of cubing' },
    { value: tryE(() => x.pow(3).div(y.pow(3))), trap: 'cubed the denominator too' },
    { value: x.pow(3).mul(y.pow(2)), trap: 'multiplied instead of dividing' },
    { value: ans.mulRat(100), trap: 'decimal point two places out' },
    { value: ans.mulRat(E(0.01).toRat()), trap: 'decimal point two places out' },
  ]);
  return pack(rng, tree, ans, ranked(rng, ans, must, extra),
    `$${a}^3 = ${dec(x.pow(3))}$ and $${b}^2 = ${dec(y.pow(2))}$, so the value is $${dec(x.pow(3))} \\div ${dec(y.pow(2))} = ${dec(ans)}$.`,
    'Cubing triples the decimal places and squaring doubles them; write both out before dividing, then scale the division to whole numbers.',
    ['decimals', 'powers', 'division'], 'cube-over-square', 'Evaluate');
}

function cube(rng: RNG): Generated | null {
  const a = rng.pick(['1.5', '0.5', '1.2', '0.4', '0.3', '1.1', '0.2', '0.6', '2.5', '0.9']);
  const tree = pow(N(a), 3);
  const ans = evalExact(tree);
  if (!mental(ans, 4)) return null;
  const x = D(a);
  const sq = x.pow(2);
  const must = cleanOnly([
    { value: x.mulRat(3), trap: 'tripled instead of cubing' },
    { value: sq, trap: 'squared only' },
  ], 4);
  const extra = cleanOnly([
    { value: ans.mulRat(10), trap: 'decimal point one place too far right' },
    { value: ans.mulRat(TENTH), trap: 'decimal point one place too far left' },
    { value: sq.add(x), trap: 'added the last factor instead of multiplying by it' },
    { value: sq.mulRat(3), trap: 'multiplied the square by 3 instead of by the number' },
    { value: sq.mulRat(2), trap: 'doubled the square' },
  ], 4);
  return pack(rng, tree, ans, ranked(rng, ans, must, extra),
    `$${a}^2 = ${dec(sq)}$, then $${dec(sq)} \\times ${a} = ${dec(ans)}$.`,
    'Cube by squaring first and multiplying again; the decimal places triple (1.5³ = 3.375, not 4.5).',
    ['decimals', 'cubes'], 'cube', 'Evaluate');
}

function differenceOfSquares(rng: RNG): Generated | null {
  const c = rng.pick(['1', '1', '1', '2', '3', '5', '4', '10']);
  const x = rng.pick(['0.1', '0.2', '0.3', '0.01', '0.05', '0.02', '0.4']);
  const C = D(c), X = D(x);
  if (X.cmp(C) >= 0) return null;
  const lo = C.sub(X), hi = C.add(X);
  const tree = rng.bool() ? mul(N(dec(lo)), N(dec(hi))) : mul(N(dec(hi)), N(dec(lo)));
  const ans = evalExact(tree);
  if (!mental(ans, 4)) return null;
  const must = cleanOnly([
    { value: C.mul(C), trap: 'assumed the −x and +x cancel exactly (c² instead of c² − x²)' },
    { value: C.mul(C).add(X.mul(X)), trap: 'sign error: c² + x² instead of c² − x²' },
  ], 4);
  const extra = cleanOnly([
    { value: ans.mulRat(10), trap: 'decimal point one place too far right' },
    { value: ans.mulRat(TENTH), trap: 'decimal point one place too far left' },
    { value: C.mul(C).sub(X), trap: 'subtracted x instead of x²' },
    { value: C.mul(C).sub(X.mulRat(2)), trap: 'subtracted 2x instead of x²' },
    { value: lo.add(hi), trap: 'added instead of multiplying' },
  ], 4);
  return pack(rng, tree, ans, ranked(rng, ans, must, extra),
    `Spot $(${c} - ${x})(${c} + ${x}) = ${c}^2 - ${x}^2 = ${dec(C.mul(C))} - ${dec(X.mul(X))} = ${dec(ans)}$.`,
    'Numbers equally spaced either side of a round value are a difference of two squares: 0.9 × 1.1 = 1 − 0.01 = 0.99.',
    ['decimals', 'difference-of-squares'], 'dots');
}

// ---------------------------------------------------------------------------

const L1_A = ['0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9', '0.02', '0.05', '0.03'];
const L1_B = ['0.35', '0.15', '0.25', '0.45', '0.12', '0.6', '0.4', '0.8', '0.7', '3', '4', '6', '0.3', '1.5', '7'];
const L2_A = ['2.5', '1.5', '0.25', '1.25', '0.75', '3.5', '0.125', '4.5', '0.5'];
const L2_B = ['0.4', '0.6', '0.8', '1.2', '0.2', '0.04', '1.6', '0.02', '2.4'];
const L3_A = ['0.125', '0.25', '0.375', '0.625', '0.75', '0.875', '0.15', '0.35', '0.45', '0.65', '0.05', '1.25', '0.12', '0.24'];
const L3_B = ['1.6', '2.4', '3.2', '4.8', '6.4', '0.8', '0.4', '1.2', '48', '16', '24', '32', '8', '12', '0.36', '0.45', '1.4', '0.9', '0.6'];
const L2_SQ = ['1.2', '0.3', '0.5', '1.5', '0.7', '0.4', '2.5', '0.9', '0.8', '0.6', '0.2', '1.1'];
const L3_SQ = ['1.1', '1.2', '2.1', '1.9', '3.1', '0.11', '0.12', '0.21', '1.3', '0.13', '2.2', '1.6', '1.4', '0.15'];

export default defineTemplate({
  id: 'm1.fractions.decimal-arithmetic',
  module: 'M1',
  topic: 'fractions',
  title: 'Mental decimal arithmetic',
  levels: {
    1: '0.2 × 0.35, 1.2 + 0.85, 3 − 1.45',
    2: '0.6 ÷ 0.05, 2.5 × 0.4, 1.2²',
    3: '0.75 × 1.6, 0.125 × 48, 1.1 × 1.1',
    4: 'two-step: 0.3² ÷ 0.09 + 2.5 × 0.16',
    5: '0.2³ ÷ 0.4², 1.5³, 0.9 × 1.1 as (1 − x)(1 + x)',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return pickVariant(rng, [(r) => multiply(r, L1_A, L1_B, 'mul'), addition, subtraction]);
        case 2: return pickVariant(rng, [division, (r) => multiply(r, L2_A, L2_B, 'mul'), (r) => square(r, L2_SQ, 'square')]);
        case 3: return pickVariant(rng, [(r) => multiply(r, L3_A, L3_B, 'fraction'), (r) => multiply(r, L3_A, L3_B, 'fraction'), (r) => square(r, L3_SQ, 'square')]);
        case 4: return pickVariant(rng, [twoStep]);
        default: return pickVariant(rng, [cubeOverSquare, cube, differenceOfSquares]);
      }
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const { tree } = q.params as { tree: Node };
    const expected = evalFloat(tree);
    const got = q.answer.value.toNumber();
    if (!Number.isFinite(expected) || Math.abs(got - expected) > 1e-9 * Math.max(1, Math.abs(expected))) return false;
    // the answer must terminate (it is displayed as a decimal)
    let d = q.answer.value.toRat().d;
    while (d % 2n === 0n) d /= 2n;
    while (d % 5n === 0n) d /= 5n;
    return d === 1n;
  },
});
