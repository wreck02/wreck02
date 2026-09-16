import { defineTemplate, retry, type Generated, type Level, type Option } from '../../core/template';
import { Exact } from '../../core/exact';
import { buildChoiceOptions } from '../../core/options';
import type { RNG } from '../../core/rng';

/**
 * Domain and range, stated as inequalities (every answer is a 'choice').
 * Level 1: domain of √(x − a)
 * Level 2: range of x² + k, of k − x²
 * Level 3: domain of 1/(x + c), of √(a − 2x)
 * Level 4: range of a quadratic on x ≥ t or x ≤ t, with the vertex inside or outside the domain
 * Level 5: range of 1/(x² + k) and of a + √(x − b); the largest domain x ≥ k on which x² + bx is one-to-one
 *
 * params carry a descriptor of the function and the claimed inequality; verify() samples the
 * function numerically and checks the claim (boundaries included) against those samples.
 */

interface Fn { kind: string; m: number; c: number; k: number; a: number; b: number; t: number; dir: string }

function fn(kind: string, o: Partial<Fn> = {}): Fn {
  return { kind, m: 0, c: 0, k: 0, a: 0, b: 0, t: 0, dir: 'ge', ...o };
}

function evalF(f: Fn, x: number): number {
  switch (f.kind) {
    case 'sqrt-linear': return Math.sqrt(f.m * x + f.c);
    case 'recip-linear': return 1 / (x + f.c);
    case 'quad-plus': return f.a * x * x + f.k;
    case 'quad-restricted': return x * x + f.b * x + f.c;
    case 'recip-quad': return 1 / (x * x + f.k);
    case 'shift-sqrt': return f.a + Math.sqrt(x - f.b);
    case 'one-to-one': return x * x + f.b * x;
    default: return NaN;
  }
}

function isDefined(f: Fn, x: number): boolean {
  switch (f.kind) {
    case 'sqrt-linear': return f.m * x + f.c >= 0;
    case 'recip-linear': return Math.abs(x + f.c) > 1e-9;
    case 'shift-sqrt': return x >= f.b;
    case 'quad-restricted': return f.dir === 'ge' ? x >= f.t : x <= f.t;
    default: return true;
  }
}

/** A fine grid over [−40, 40] that hits every integer and half-integer exactly. */
const GRID: number[] = [];
for (let i = -2000; i <= 2000; i++) GRID.push(i / 50);

const numTex = (v: number): string => Exact.num(v).toLatex({ format: 'fraction' });

/** "x - 3", "7 - 2x", "x + 3" */
function linTex(m: number, c: number): string {
  const t = m === 1 ? 'x' : m === -1 ? '-x' : `${m}x`;
  if (c === 0) return t;
  if (m < 0) return `${c} ${m === -1 ? '-' : `- ${-m}`}x`.replace(/- -/, '+ ');
  return `${t} ${c > 0 ? '+' : '-'} ${Math.abs(c)}`;
}

function claimTex(rel: string, A: number): string {
  const n = numTex(A);
  switch (rel) {
    case 'dom-ge': case 'dom-inj': return `$x \\ge ${n}$`;
    case 'dom-gt': return `$x > ${n}$`;
    case 'dom-le': return `$x \\le ${n}$`;
    case 'dom-lt': return `$x < ${n}$`;
    case 'dom-ne': return `$x \\ne ${n}$`;
    case 'ran-ge': return `$f(x) \\ge ${n}$`;
    case 'ran-gt': return `$f(x) > ${n}$`;
    case 'ran-le': return `$f(x) \\le ${n}$`;
    case 'ran-lt': return `$f(x) < ${n}$`;
    case 'ran-pos-le': return `$0 < f(x) \\le ${n}$`;
    case 'ran-pos-lt': return `$0 < f(x) < ${n}$`;
    default: return `$x = ${n}$`;
  }
}

interface Wrong { rel: string; A: number; trap: string; must?: boolean }

function claimOptions(rng: RNG, correct: string, wrongs: Wrong[]): Option[] | null {
  const seen = new Set([correct]);
  const picked: { display: string; trap: string }[] = [];
  const take = (w: Wrong) => {
    const d = claimTex(w.rel, w.A);
    if (picked.length >= 4 || seen.has(d)) return;
    seen.add(d);
    picked.push({ display: d, trap: w.trap });
  };
  wrongs.filter((w) => w.must).forEach(take);
  rng.shuffle(wrongs.filter((w) => !w.must)).forEach(take);
  if (picked.length < 4) return null;
  return buildChoiceOptions(rng, correct, picked);
}

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 60; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

function build(rng: RNG, o: {
  stem: string; rel: string; A: number; wrongs: Wrong[]; solution: string; trap: string; tags: string[]; f: Fn;
}): Generated | null {
  const correct = claimTex(o.rel, o.A);
  const options = claimOptions(rng, correct, o.wrongs);
  if (!options) return null;
  return {
    stem: o.stem,
    answer: { kind: 'choice', value: correct },
    options,
    solution: o.solution,
    trap: o.trap,
    tags: o.tags,
    params: { f: o.f, rel: o.rel, A: o.A },
    typedAllowed: false,
  };
}

// ----------------------------------------------------------------- level 1

/** Domain of √(x − a). */
function sqrtDomain(rng: RNG): Generated | null {
  const a = rng.nonZeroInt(-9, 9);
  const body = linTex(1, -a);
  return build(rng, {
    stem: `The function $f$ is defined by $f(x) = \\sqrt{${body}}$. State the largest possible domain of $f$.`,
    rel: 'dom-ge',
    A: a,
    wrongs: [
      { rel: 'dom-gt', A: a, trap: 'made the inequality strict, but √0 = 0 is defined', must: true },
      { rel: 'dom-le', A: a, trap: 'inequality the wrong way round', must: true },
      { rel: 'dom-ge', A: -a, trap: 'sign error solving x − a ≥ 0' },
      { rel: 'dom-ne', A: a, trap: 'excluded one value as if the function were a reciprocal' },
      { rel: 'dom-ge', A: 0, trap: 'assumed only x ≥ 0 is needed' },
    ],
    solution: `The expression under the root must be non-negative: $${body} \\ge 0$, so $x \\ge ${a}$.`,
    trap: 'A square root needs its argument ≥ 0, and 0 itself is allowed.',
    tags: ['domain', 'surds', 'functions'],
    f: fn('sqrt-linear', { m: 1, c: -a }),
  });
}

// ----------------------------------------------------------------- level 2

/** Range of x² + k or k − x². */
function quadRange(rng: RNG): Generated | null {
  const up = rng.bool();
  const k = rng.nonZeroInt(-9, 9);
  const expr = up ? `x^{2} ${k > 0 ? `+ ${k}` : `- ${-k}`}` : `${k} - x^{2}`;
  return build(rng, {
    stem: `The function $f$ is defined by $f(x) = ${expr}$ for all real values of $x$. Find the range of $f$.`,
    rel: up ? 'ran-ge' : 'ran-le',
    A: k,
    wrongs: [
      { rel: up ? 'ran-le' : 'ran-ge', A: k, trap: 'inequality the wrong way round', must: true },
      { rel: up ? 'ran-ge' : 'ran-le', A: 0, trap: 'forgot the constant term', must: true },
      { rel: up ? 'ran-gt' : 'ran-lt', A: k, trap: 'the least (or greatest) value is reached at x = 0, so the inequality is not strict' },
      { rel: up ? 'ran-ge' : 'ran-le', A: -k, trap: 'sign error on the constant' },
      { rel: up ? 'dom-ge' : 'dom-le', A: k, trap: 'gave a condition on x instead of on f(x)' },
    ],
    solution: `$x^{2} \\ge 0$ for every $x$, so ${up ? `$f(x) \\ge ${k}$, with the minimum at $x = 0$` : `$f(x) \\le ${k}$, with the maximum at $x = 0$`}.`,
    trap: 'x² is never negative, so the vertex value is the smallest (or largest) value of f.',
    tags: ['range', 'quadratic', 'functions'],
    f: fn('quad-plus', { a: up ? 1 : -1, k }),
  });
}

// ----------------------------------------------------------------- level 3

/** Domain of 1/(x + c). */
function reciprocalDomain(rng: RNG): Generated | null {
  const c = rng.nonZeroInt(-9, 9);
  const body = linTex(1, c);
  return build(rng, {
    stem: `The function $f$ is defined by $f(x) = \\dfrac{1}{${body}}$. State the largest possible domain of $f$.`,
    rel: 'dom-ne',
    A: -c,
    wrongs: [
      { rel: 'dom-ne', A: c, trap: 'sign error: x + c = 0 gives x = −c', must: true },
      { rel: 'dom-ge', A: -c, trap: 'excluded everything below the value instead of the single value', must: true },
      { rel: 'dom-gt', A: -c, trap: 'treated the denominator like a square root' },
      { rel: 'dom-ne', A: 0, trap: 'assumed the excluded value is always 0' },
      { rel: 'dom-le', A: -c, trap: 'excluded the wrong half of the line' },
    ],
    solution: `The denominator cannot be zero: $${body} = 0$ when $x = ${-c}$, so every value except $x = ${-c}$ is allowed.`,
    trap: 'A reciprocal excludes one single value, not a whole interval.',
    tags: ['domain', 'reciprocal', 'functions'],
    f: fn('recip-linear', { c }),
  });
}

/** Domain of √(a − mx). */
function sqrtNegDomain(rng: RNG): Generated | null {
  const m = rng.int(2, 3);
  const a = rng.int(1, 9);
  const bound = a / m;
  if (!Number.isInteger(2 * bound)) return null; // integers and halves only
  const body = linTex(-m, a);
  return build(rng, {
    stem: `The function $f$ is defined by $f(x) = \\sqrt{${body}}$. State the largest possible domain of $f$.`,
    rel: 'dom-le',
    A: bound,
    wrongs: [
      { rel: 'dom-ge', A: bound, trap: 'forgot to reverse the inequality when dividing by a negative number', must: true },
      { rel: 'dom-le', A: a, trap: 'forgot to divide by the coefficient of x', must: true },
      { rel: 'dom-lt', A: bound, trap: 'made the inequality strict, but √0 = 0 is defined' },
      { rel: 'dom-le', A: -bound, trap: 'sign error' },
      { rel: 'dom-le', A: a * m, trap: 'multiplied by the coefficient instead of dividing' },
    ],
    solution: `Need $${body} \\ge 0$, so $${a} \\ge ${m}x$ and $x \\le ${numTex(bound)}$.`,
    trap: 'Dividing an inequality by a negative number reverses it.',
    tags: ['domain', 'surds', 'inequalities'],
    f: fn('sqrt-linear', { m: -m, c: a }),
  });
}

// ----------------------------------------------------------------- level 4

/** Range of x² + bx + c on x ≥ t or x ≤ t. */
function restrictedQuadRange(rng: RNG): Generated | null {
  const u = rng.nonZeroInt(-4, 5);
  const w = rng.nonZeroInt(-9, 9);
  const b = -2 * u, c = u * u + w;
  if (Math.abs(c) > 30) return null;
  const dir = rng.bool() ? 'ge' : 'le';
  const inside = rng.bool(0.5);
  const t = dir === 'ge'
    ? (inside ? u - rng.int(0, 2) : u + rng.int(1, 3))
    : (inside ? u + rng.int(0, 2) : u - rng.int(1, 3));
  const at = (x: number) => x * x + b * x + c;
  const vertexInside = dir === 'ge' ? t <= u : t >= u;
  const lo = vertexInside ? w : at(t);
  const other = vertexInside ? at(t + (dir === 'ge' ? 1 : -1)) : w;
  if (Math.abs(lo) > 80 || lo === other) return null;
  const domain = `x \\${dir === 'ge' ? 'ge' : 'le'} ${t}`;
  return build(rng, {
    stem: `The function $f$ is defined by $f(x) = x^{2} ${b > 0 ? `+ ${b}` : `- ${-b}`}x${c === 0 ? '' : c > 0 ? ` + ${c}` : ` - ${-c}`}$ for $${domain}$. Find the range of $f$.`,
    rel: 'ran-ge',
    A: lo,
    wrongs: [
      { rel: 'ran-le', A: lo, trap: 'inequality the wrong way round', must: true },
      { rel: 'ran-ge', A: other, trap: vertexInside ? 'used the endpoint although the vertex is inside the domain' : 'used the vertex although it lies outside the domain', must: true },
      { rel: 'ran-ge', A: t, trap: 'gave a value from the domain rather than the range' },
      { rel: 'ran-gt', A: lo, trap: 'the least value is attained, so the inequality is not strict' },
      { rel: 'ran-ge', A: -lo, trap: 'sign error in the minimum value' },
      { rel: 'ran-ge', A: lo + 1, trap: 'arithmetic slip evaluating the minimum' },
    ],
    solution: `Completing the square, $f(x) = (x ${u > 0 ? '-' : '+'} ${Math.abs(u)})^{2} ${w > 0 ? `+ ${w}` : `- ${-w}`}$, so the vertex is $(${u}, ${w})$. ${vertexInside ? `It lies in the domain, so the least value is $${lo}$` : `It is outside $${domain}$, so the least value is at the endpoint: $f(${t}) = ${lo}$`}.`,
    trap: 'Check whether the vertex lies in the restricted domain; if not, the extreme value is at the endpoint.',
    tags: ['range', 'quadratic', 'restricted-domain'],
    f: fn('quad-restricted', { b, c, t, dir }),
  });
}

// ----------------------------------------------------------------- level 5

/** Range of 1/(x² + k). */
function reciprocalQuadRange(rng: RNG): Generated | null {
  const k = rng.int(1, 5);
  const top = 1 / k;
  return build(rng, {
    stem: `The function $f$ is defined by $f(x) = \\dfrac{1}{x^{2} + ${k}}$ for all real values of $x$. Find the range of $f$.`,
    rel: 'ran-pos-le',
    A: top,
    wrongs: [
      { rel: 'ran-ge', A: top, trap: 'inequality the wrong way round: the greatest value is at x = 0', must: true },
      { rel: 'ran-pos-lt', A: top, trap: 'the maximum is reached at x = 0, so that end is not strict', must: true },
      { rel: 'ran-le', A: top, trap: 'forgot that f(x) is always positive' },
      { rel: 'ran-gt', A: 0, trap: 'gave only the lower bound' },
      { rel: 'ran-pos-le', A: k, trap: 'forgot to invert the denominator' },
    ],
    solution: `$x^{2} + ${k} \\ge ${k}$, so $0 < f(x) \\le \\frac{1}{${k}}$, the maximum being at $x = 0$.`,
    trap: 'The smallest denominator gives the largest value, and 1/(x² + k) never reaches 0.',
    tags: ['range', 'reciprocal', 'composite'],
    f: fn('recip-quad', { k }),
  });
}

/** Range of a + √(x − b). */
function shiftedSqrtRange(rng: RNG): Generated | null {
  const a = rng.nonZeroInt(-6, 6);
  const b = rng.nonZeroInt(-6, 6);
  if (a === b) return null;
  return build(rng, {
    stem: `The function $f$ is defined by $f(x) = ${a > 0 ? `${a} + \\sqrt{${linTex(1, -b)}}` : `\\sqrt{${linTex(1, -b)}} - ${-a}`}$, $x \\ge ${b}$. Find the range of $f$.`,
    rel: 'ran-ge',
    A: a,
    wrongs: [
      { rel: 'ran-ge', A: b, trap: 'used the endpoint of the domain as the least value of f', must: true },
      { rel: 'ran-ge', A: 0, trap: 'forgot the constant added to the root', must: true },
      { rel: 'ran-le', A: a, trap: 'inequality the wrong way round' },
      { rel: 'ran-gt', A: a, trap: 'the root can equal 0, so the value a is attained' },
      { rel: 'dom-ge', A: b, trap: 'gave the domain instead of the range' },
    ],
    solution: `$\\sqrt{${linTex(1, -b)}} \\ge 0$, and it is 0 at $x = ${b}$, so the least value of $f$ is $${a}$ and $f(x) \\ge ${a}$.`,
    trap: 'The root contributes a value ≥ 0, so the range starts at the constant, not at the domain endpoint.',
    tags: ['range', 'surds', 'functions'],
    f: fn('shift-sqrt', { a, b }),
  });
}

/** Largest domain x ≥ k on which x² + bx is one-to-one. */
function oneToOne(rng: RNG): Generated | null {
  const u = rng.nonZeroInt(-5, 5);
  const b = -2 * u;
  return build(rng, {
    stem: `The function $f$ is defined by $f(x) = x^{2} ${b > 0 ? `+ ${b}` : `- ${-b}`}x$. State the largest domain of the form $x \\ge k$ on which $f$ is one-to-one.`,
    rel: 'dom-inj',
    A: u,
    wrongs: [
      { rel: 'dom-ge', A: b, trap: 'used the coefficient b instead of −b/2', must: true },
      { rel: 'dom-ge', A: -u, trap: 'sign error: the line of symmetry is x = −b/2', must: true },
      { rel: 'dom-ge', A: 0, trap: 'assumed a quadratic is always one-to-one for x ≥ 0' },
      { rel: 'dom-ge', A: -u * u, trap: 'quoted the minimum value of f instead of where it occurs' },
      { rel: 'dom-gt', A: u, trap: 'excluded the vertex, but a single point keeps f one-to-one' },
    ],
    solution: `$f(x) = (x ${u > 0 ? '-' : '+'} ${Math.abs(u)})^{2} - ${u * u}$ is symmetrical about $x = ${u}$, so $f$ is one-to-one exactly on $x \\ge ${u}$.`,
    trap: 'A quadratic is one-to-one only on one side of its line of symmetry x = −b/2.',
    tags: ['domain', 'one-to-one', 'quadratic'],
    f: fn('one-to-one', { b }),
  });
}

const VARIANTS: Record<Level, ((rng: RNG) => Generated | null)[]> = {
  1: [sqrtDomain],
  2: [quadRange],
  3: [reciprocalDomain, sqrtNegDomain],
  4: [restrictedQuadRange],
  5: [reciprocalQuadRange, shiftedSqrtRange, oneToOne],
};

export default defineTemplate({
  id: 'm2.functions.domain-range',
  module: 'M2',
  topic: 'functions',
  title: 'Domain and range',
  levels: {
    1: 'domain of √(x − a)',
    2: 'range of x² + k, of k − x²',
    3: 'domain of 1/(x + c), of √(a − 2x)',
    4: 'range of a quadratic on x ≥ t (vertex inside or outside the domain)',
    5: 'range of 1/(x² + k) and of a + √(x − b); largest one-to-one domain of x² + bx',
  },
  generate(rng, level: Level) {
    return retry(rng, () => pickVariant(rng, VARIANTS[level]));
  },
  verify(q) {
    const p = q.params as unknown as { f: Fn; rel: string; A: number };
    if (q.answer.kind !== 'choice') return false;
    if (q.answer.value !== claimTex(p.rel, p.A)) return false;
    const f = p.f, A = p.A;
    const val = (x: number) => evalF(f, x);
    const ok = (x: number) => isDefined(f, x) && Number.isFinite(val(x));
    const near = (x: number, y: number) => Math.abs(x - y) < 1e-6;
    // sample the claimed domain
    const xs = GRID.filter(ok);
    if (xs.length === 0) return false;
    const ys = xs.map(val);
    const min = Math.min(...ys), max = Math.max(...ys);
    switch (p.rel) {
      case 'dom-ge':
        return ok(A) && ok(A + 0.5) && ok(A + 3) && !ok(A - 0.5) && !ok(A - 3);
      case 'dom-le':
        return ok(A) && ok(A - 0.5) && ok(A - 3) && !ok(A + 0.5) && !ok(A + 3);
      case 'dom-ne':
        return !ok(A) && ok(A + 0.5) && ok(A - 0.5) && ok(A + 3) && ok(A - 3);
      case 'dom-inj': {
        // one-to-one on x ≥ A, but not on any larger domain x ≥ A − d
        const strictlyMonotone = GRID.filter((x) => x >= A && x <= A + 8)
          .every((x, i, arr) => i === 0 || val(x) > val(arr[i - 1]));
        return strictlyMonotone && near(val(A - 0.5), val(A + 0.5)) && near(val(A - 2), val(A + 2));
      }
      case 'ran-ge':
        return near(min, A) && ys.every((y) => y >= A - 1e-9);
      case 'ran-le':
        return near(max, A) && ys.every((y) => y <= A + 1e-9);
      case 'ran-pos-le':
        return near(max, A) && ys.every((y) => y > 0 && y <= A + 1e-9) && min < A / 10;
      default:
        return false;
    }
  },
});
