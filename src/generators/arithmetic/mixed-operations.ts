import { defineTemplate, retry, type Level } from '../../core/template';
import { buildOptions } from '../../core/options';
import { ex, d, keep, tex, tidy } from './_shared';

/**
 * Order of operations with small numbers (BIDMAS), evaluated mentally.
 * Level 1: a + b × c, a × b − c (7 + 5 × 4)
 * Level 2: a × b − c × d, (a + b) × c, a − b ÷ c (6 × 7 − 4 × 5)
 * Level 3: a square or a negative number: a² − b × c, a − (−b) × c, (a + b) ÷ c × d
 * Level 4: decimals or fractions of numbers: 3 × 4.5 − 2.5 × 2, 2⁵ − 3² × 2
 * Level 5: brackets, a power and division together: (7 + 5)² ÷ 6 − 4 × 3, 15 × 12 − 4³ + 100 ÷ 4
 */
type Node = number | { op: '+' | '-' | '*' | '/' | '^'; l: Node; r: Node };

function evalNode(n: Node): number {
  if (typeof n === 'number') return n;
  const a = evalNode(n.l), b = evalNode(n.r);
  switch (n.op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return a / b;
    case '^': return Math.pow(a, b);
  }
}

/** Evaluate strictly left to right, ignoring precedence: the classic mistake. */
function leftToRight(tokens: (number | string)[]): number {
  let acc = tokens[0] as number;
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i] as string, v = tokens[i + 1] as number;
    acc = op === '+' ? acc + v : op === '-' ? acc - v : op === '*' ? acc * v : op === '/' ? acc / v : Math.pow(acc, v);
  }
  return acc;
}

const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 };

function toTex(n: Node, parentPrec = 0, right = false): string {
  if (typeof n === 'number') return n < 0 ? `(${tex(n)})` : tex(n);
  const p = PREC[n.op];
  if (n.op === '^') return `${toTex(n.l, 4)}^{${toTex(n.r, 0)}}`;
  const sym = n.op === '*' ? ' \\times ' : n.op === '/' ? ' \\div ' : ` ${n.op} `;
  const inner = `${toTex(n.l, p)}${sym}${toTex(n.r, p, true)}`;
  const needs = p < parentPrec || (right && p === parentPrec && (n.op === '-' || n.op === '/'));
  return needs ? `(${inner})` : inner;
}

export default defineTemplate({
  id: 'm1.arithmetic.mixed-operations',
  module: 'M1',
  topic: 'arithmetic',
  title: 'Order of operations',
  levels: {
    1: 'a + b × c and a × b − c: 7 + 5 × 4',
    2: 'two products, brackets, or a division: 6 × 7 − 4 × 5, (8 + 5) × 6',
    3: 'a square or a negative number: 8² − 6 × 7, 5 − (−3) × 4',
    4: 'decimals and powers: 3 × 4.5 − 2.5 × 2, 2⁵ − 3² × 2',
    5: 'brackets, a power and a division together: (7 + 5)² ÷ 6 − 4 × 3',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      let tree: Node;
      let flat: (number | string)[] | null = null; // for the left-to-right trap where it applies
      let trapNote = '';
      const i = (lo: number, hi: number) => rng.int(lo, hi);
      if (level === 1) {
        if (rng.bool()) { const a = i(3, 19), b = i(3, 9), c = i(3, 9); tree = { op: '+', l: a, r: { op: '*', l: b, r: c } }; flat = [a, '+', b, '*', c]; }
        else { const a = i(4, 12), b = i(3, 9), c = i(2, 20); if (a * b <= c) return null; tree = { op: '-', l: { op: '*', l: a, r: b }, r: c }; flat = [a, '*', b, '-', c]; }
        trapNote = 'Multiplication before addition or subtraction.';
      } else if (level === 2) {
        const k = rng.pick(['pp', 'br', 'div']);
        if (k === 'pp') { const a = i(4, 12), b = i(3, 9), c = i(2, 9), dd = i(2, 9); if (a * b <= c * dd) return null; tree = { op: '-', l: { op: '*', l: a, r: b }, r: { op: '*', l: c, r: dd } }; flat = [a, '*', b, '-', c, '*', dd]; }
        else if (k === 'br') { const a = i(3, 19), b = i(2, 19), c = i(3, 9); tree = { op: '*', l: { op: '+', l: a, r: b }, r: c }; flat = null; }
        else { const c = i(2, 9), q = i(2, 12), a = i(1, 40) + q; tree = { op: '-', l: a, r: { op: '/', l: q * c, r: c } }; flat = [a, '-', q * c, '/', c]; }
        trapNote = 'Brackets first, then × and ÷, then + and −.';
      } else if (level === 3) {
        const k = rng.pick(['sq', 'neg', 'brdiv']);
        if (k === 'sq') { const a = i(4, 12), b = i(2, 9), c = i(2, 9); if (a * a <= b * c) return null; tree = { op: '-', l: { op: '^', l: a, r: 2 }, r: { op: '*', l: b, r: c } }; flat = [a, '^', 2, '-', b, '*', c]; }
        else if (k === 'neg') { const a = i(2, 15), b = i(2, 9), c = i(2, 9); tree = { op: '-', l: a, r: { op: '*', l: -b, r: c } }; flat = null; }
        else { const c = i(2, 6), s = c * i(3, 12), a = i(1, s - 1), b = s - a, dd = i(2, 9); tree = { op: '*', l: { op: '/', l: { op: '+', l: a, r: b }, r: c }, r: dd }; flat = null; }
        trapNote = 'Indices before multiplication; a minus times a minus is a plus.';
      } else if (level === 4) {
        const k = rng.pick(['dec', 'pow']);
        if (k === 'dec') {
          const a = i(2, 6), b = rng.pick([1.5, 2.5, 3.5, 4.5, 0.5, 1.25, 2.4, 3.6]), c = rng.pick([1.5, 2.5, 0.5, 0.25, 0.75, 1.2]), dd = i(2, 8);
          tree = { op: '-', l: { op: '*', l: a, r: b }, r: { op: '*', l: c, r: dd } };
          if (a * b - c * dd <= 0) return null;
          flat = [a, '*', b, '-', c, '*', dd];
        } else {
          const base = rng.pick([2, 3, 5]), e = base === 2 ? i(4, 6) : base === 3 ? i(3, 4) : 3, b = i(2, 5), c = i(2, 9);
          if (Math.pow(base, e) <= b * b * c) return null;
          tree = { op: '-', l: { op: '^', l: base, r: e }, r: { op: '*', l: { op: '^', l: b, r: 2 }, r: c } };
          flat = null;
        }
        trapNote = 'Evaluate the powers first, then each product, then subtract.';
      } else {
        const k = rng.pick(['brsq', 'cube', 'mixed']);
        if (k === 'brsq') { const a = i(2, 9), b = i(2, 9), s = a + b; const cands = [2, 3, 4, 6, 8, 9, 12].filter((x) => (s * s) % x === 0); if (cands.length === 0) return null; const c = rng.pick(cands), dd = i(2, 9), e = i(2, 9); if ((s * s) / c <= dd * e) return null; tree = { op: '-', l: { op: '/', l: { op: '^', l: { op: '+', l: a, r: b }, r: 2 }, r: c }, r: { op: '*', l: dd, r: e } }; }
        else if (k === 'cube') { const a = i(11, 25), b = i(3, 12), c = i(2, 5), dd = rng.pick([2, 4, 5, 10, 20, 25]); if (a * b <= c * c * c) return null; tree = { op: '+', l: { op: '-', l: { op: '*', l: a, r: b }, r: { op: '^', l: c, r: 3 } }, r: { op: '/', l: dd * i(3, 12), r: dd } }; }
        else { const a = i(3, 9), b = i(3, 9), c = i(2, 9), dd = i(2, 5), e = i(2, 9); tree = { op: '-', l: { op: '*', l: { op: '+', l: a, r: b }, r: c }, r: { op: '*', l: { op: '^', l: dd, r: 2 }, r: e } }; if (evalNode(tree) <= 0) return null; }
        trapNote = 'Brackets, then indices, then division and multiplication left to right, then addition and subtraction.';
        flat = null;
      }
      const value = tidy(evalNode(tree));
      if (value <= 0 || !Number.isFinite(value)) return null;
      const answer = ex(value);
      if (!answer) return null;
      const stemTex = toTex(tree);
      const ltr = flat ? tidy(leftToRight(flat)) : NaN;
      // A "power as a product" slip: replace x^n by x·n
      const powAsProduct = (n: Node): Node => typeof n === 'number' ? n : n.op === '^' ? { op: '*', l: n.l, r: n.r } : { op: n.op, l: powAsProduct(n.l), r: powAsProduct(n.r) };
      const pap = tidy(evalNode(powAsProduct(tree)));
      const hasPow = stemTex.includes('^');
      const distractors = keep([
        Number.isFinite(ltr) && ltr !== value ? d(ltr, 'worked strictly left to right, ignoring the order of operations', true) : null,
        hasPow && pap !== value ? d(pap, 'treated the power as a multiplication (a² as 2a)', true) : null,
        d(value + 1, 'arithmetic slip of one'),
        d(value - 1, 'arithmetic slip of one'),
        d(value + 10, 'slip in the tens'),
        d(value - 10, 'slip in the tens'),
        d(tidy(value * 2), 'doubled a term'),
        d(tidy(value / 2), 'halved a term'),
        d(tidy(-value), 'sign of the whole expression wrong'),
        d(value + 5, 'added instead of subtracting one part'),
        typeof tree !== 'number' && tree.op === '-' ? d(tidy(evalNode({ ...tree, op: '+' })), 'added the last part instead of subtracting it') : null,
        typeof tree !== 'number' && tree.op === '+' ? d(tidy(evalNode({ ...tree, op: '-' })), 'subtracted the last part instead of adding it') : null,
      ]);
      return {
        stem: `Work out $${stemTex}$.`,
        answer: { kind: 'exact' as const, value: answer, format: 'decimal' as const },
        options: buildOptions(rng, answer, distractors, { format: 'decimal' }),
        solution: `${trapNote} The value is $${tex(value)}$.`,
        trap: 'BIDMAS: brackets, indices, division and multiplication, addition and subtraction. Left to right only within the same rank.',
        tags: ['arithmetic', 'bidmas', 'order-of-operations'],
        params: { tree: JSON.parse(JSON.stringify(tree)) as Node },
        typedAllowed: true,
      };
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const { tree } = q.params as { tree: Node };
    // Independent route: re-render the tree to a string and evaluate it with a fresh precedence-climbing parser.
    const src = render(tree);
    const got = parseAndEval(src);
    return Math.abs(got - q.answer.value.toNumber()) < 1e-9;
  },
});

function render(n: Node): string {
  if (typeof n === 'number') return n < 0 ? `(0${n})` : String(n);
  const sym = n.op === '^' ? '^' : n.op;
  return `(${render(n.l)}${sym}${render(n.r)})`;
}

/** Tiny arithmetic parser (+ - * / ^ and brackets) for the independent check. */
function parseAndEval(src: string): number {
  let i = 0;
  const peek = () => src[i];
  const num = (): number => {
    let s = '';
    while (i < src.length && /[0-9.]/.test(src[i])) s += src[i++];
    return Number(s);
  };
  const atom = (): number => {
    if (peek() === '(') { i++; const v = expr(); i++; return v; }
    if (peek() === '-') { i++; return -atom(); }
    return num();
  };
  const power = (): number => { const b = atom(); if (peek() === '^') { i++; return Math.pow(b, power()); } return b; };
  const term = (): number => { let v = power(); while (peek() === '*' || peek() === '/') { const op = src[i++]; const r = power(); v = op === '*' ? v * r : v / r; } return v; };
  const expr = (): number => { let v = term(); while (peek() === '+' || peek() === '-') { const op = src[i++]; const r = term(); v = op === '+' ? v + r : v - r; } return v; };
  return expr();
}
