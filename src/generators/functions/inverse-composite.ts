import { defineTemplate, retry, type Generated, type Level, type Option } from '../../core/template';
import { E, frac, Exact } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import type { RNG } from '../../core/rng';

/**
 * Composite and inverse functions.
 * Level 1: f(x) = 2x + 3, g(x) = x²: find fg(2) or gf(1)
 * Level 2: f^-1(5) for a linear f
 * Level 3: f(x) = (x + 1)/(x − 2): f^-1(3), or the value excluded from the domain of f^-1
 * Level 4: solve f(x) = f^-1(x) for a linear f, or ff(x) = k
 * Level 5: f^-1 as a formula for a rational f (choice), or the range of x² − 4x + 1 on x ≥ 2
 *
 * verify() evaluates the compositions numerically from params, and checks a claimed inverse
 * formula by testing f(f^-1(t)) = t at sample values of t.
 */

interface Cand { value: Exact | null; trap: string; must?: boolean }

function numberOptions(rng: RNG, answer: Exact, cands: Cand[]): Option[] {
  const ok = cands.filter((c): c is { value: Exact; trap: string; must?: boolean } =>
    c.value !== null && Number.isFinite(c.value.toNumber()) && isCleanExact(c.value).ok);
  const seen: Exact[] = [answer];
  const out: Distractor[] = [];
  const take = (d: { value: Exact; trap: string }) => {
    if (out.length >= 4 || seen.some((s) => s.equals(d.value))) return;
    seen.push(d.value);
    out.push({ value: d.value, trap: d.trap });
  };
  ok.filter((c) => c.must).forEach(take);
  rng.shuffle(ok.filter((c) => !c.must)).forEach(take);
  return buildOptions(rng, answer, out, { format: 'fraction' });
}

function choiceOptions(rng: RNG, correct: string, cands: { display: string; trap: string; must?: boolean }[]): Option[] | null {
  const seen = new Set([correct.replace(/\s+/g, ' ').trim()]);
  const picked: { display: string; trap: string }[] = [];
  const take = (w: { display: string; trap: string }) => {
    const key = w.display.replace(/\s+/g, ' ').trim();
    if (picked.length >= 4 || seen.has(key)) return;
    seen.add(key);
    picked.push(w);
  };
  cands.filter((w) => w.must).forEach(take);
  rng.shuffle(cands.filter((w) => !w.must)).forEach(take);
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

/** "2x + 3", "-x", "5" */
function lin(m: number, k: number, v = 'x'): string {
  const t = m === 0 ? '' : m === 1 ? v : m === -1 ? `-${v}` : `${m}${v}`;
  if (k === 0) return t || '0';
  if (t === '') return `${k}`;
  return `${t} ${k > 0 ? '+' : '-'} ${Math.abs(k)}`;
}

/** A fraction, or null when the denominator vanishes (the distractor is then dropped). */
const fr = (n: number, d: number): Exact | null => (d === 0 ? null : frac(n, d));

/** LaTeX for (Ax + B)/(Cx + D). */
function ratTex(A: number, B: number, C: number, D: number, v = 'x'): string {
  return `\\frac{${lin(A, B, v)}}{${lin(C, D, v)}}`;
}

// ----------------------------------------------------------------- level 1

/** fg(n) or gf(n) with f linear and g(x) = x². */
function compositeValue(rng: RNG): Generated | null {
  const a = rng.int(2, 4);
  const b = rng.nonZeroInt(-6, 6);
  const n = rng.nonZeroInt(-3, 4);
  const fg = a * n * n + b;
  const gf = (a * n + b) ** 2;
  if (fg === gf || Math.abs(gf) > 400) return null;
  const ask = rng.bool() ? 'fg' : 'gf';
  const value = ask === 'fg' ? fg : gf;
  const ds: Cand[] = ask === 'fg'
    ? [
        { value: E(gf), trap: 'worked out gf(x) instead of fg(x)', must: true },
        { value: E(a * n + b), trap: 'applied f only', must: true },
        { value: E(n * n), trap: 'applied g only' },
        { value: E((a * n) ** 2 + b), trap: 'squared ax instead of x' },
        { value: E(a * (n + b) ** 2), trap: 'added b before squaring' },
        { value: E(a * n * n - b), trap: 'sign error' },
      ]
    : [
        { value: E(fg), trap: 'worked out fg(x) instead of gf(x)', must: true },
        { value: E(a * n + b), trap: 'forgot to apply g at the end', must: true },
        { value: E((a * n) ** 2 + b * b), trap: 'squared the two terms separately' },
        { value: E(a * a * n * n + b), trap: 'squared only the first term' },
        { value: E(n * n), trap: 'applied g only' },
        { value: E(value + 1), trap: 'arithmetic slip' },
      ];
  const answer = E(value);
  const order = ask === 'fg' ? `f\\left(g(${n})\\right)` : `g\\left(f(${n})\\right)`;
  const inner = ask === 'fg' ? `g(${n}) = ${n * n}` : `f(${n}) = ${a * n + b}`;
  return {
    stem: `The functions $f$ and $g$ are defined by $f(x) = ${lin(a, b)}$ and $g(x) = x^{2}$. Find the value of $${ask}(${n})$.`,
    answer: { kind: 'exact', value: answer },
    options: numberOptions(rng, answer, ds),
    solution: `$${ask}(${n})$ means $${order}$: $${inner}$, so $${ask}(${n}) = ${value}$.`,
    trap: 'fg(x) means "g first, then f"; gf(x) is the other way round.',
    tags: ['functions', 'composite'],
    params: { variant: 'composite', a, b, n, ask },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------- level 2

/** f^-1(t) for f(x) = ax + b */
function inverseLinear(rng: RNG): Generated | null {
  const a = rng.pick([2, 3, 4, 5, -2, -3]);
  const b = rng.nonZeroInt(-9, 9);
  const x0 = rng.nonZeroInt(-6, 8);
  const t = a * x0 + b;
  if (t === x0 || Math.abs(t) > 60) return null;
  const answer = E(x0);
  const ds: Cand[] = [
    { value: E(a * t + b), trap: 'applied f instead of f^-1', must: true },
    { value: fr(1, a * t + b), trap: 'used 1/f(x) as the inverse', must: true },
    { value: frac(t + b, a), trap: 'sign error: added b instead of subtracting it' },
    { value: frac(t, a).sub(E(b)), trap: 'divided before subtracting b' },
    { value: E((t - b) * a), trap: 'multiplied by a instead of dividing' },
    { value: E(x0 + 1), trap: 'arithmetic slip' },
  ];
  return {
    stem: `The function $f$ is defined by $f(x) = ${lin(a, b)}$. Find $f^{-1}(${t})$.`,
    answer: { kind: 'exact', value: answer },
    options: numberOptions(rng, answer, ds),
    solution: `$f^{-1}(${t})$ is the value of $x$ with $f(x) = ${t}$: $${lin(a, b)} = ${t}$ gives $x = ${x0}$.`,
    trap: 'f^-1(t) solves f(x) = t; it is not f(t) and it is not 1/f(t).',
    tags: ['functions', 'inverse'],
    params: { variant: 'inverse-linear', a, b, t },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------- level 3

/** f(x) = (ax + b)/(x − q): f^-1(t), or the value excluded from the domain of f^-1. */
function rationalInverseValue(rng: RNG): Generated | null {
  const a = rng.int(1, 4);
  const q = rng.int(1, 6);
  const b = rng.nonZeroInt(-9, 9);
  if (b + a * q === 0) return null; // f would be constant
  const t = rng.intExcluding(-6, 8, [a]);
  const num = q * t + b, den = t - a;
  if (num % den !== 0) return null;
  const v = num / den;
  if (Math.abs(v) > 25 || v === t) return null;
  const answer = E(v);
  const ft = t - q !== 0 ? frac(a * t + b, t - q) : null;
  const ds: Cand[] = [
    { value: ft, trap: 'worked out f(t) instead of f^-1(t)', must: true },
    { value: fr(t - a, q * t + b), trap: 'used the reciprocal as the inverse', must: true },
    { value: frac(q * t - b, t - a), trap: 'sign error on the constant when rearranging' },
    { value: fr(q * t + b, t + a), trap: 'sign error in the denominator when rearranging' },
    { value: fr(a * t + b, t + q), trap: 'never swapped x and y' },
    { value: E(v + 1), trap: 'arithmetic slip' },
  ];
  return {
    stem: `The function $f$ is defined by $f(x) = ${ratTex(a, b, 1, -q)}$, $x \\ne ${q}$. Find $f^{-1}(${t})$.`,
    answer: { kind: 'exact', value: answer },
    options: numberOptions(rng, answer, ds),
    solution: `Solve $f(x) = ${t}$: $${lin(a, b)} = ${t}(x - ${q})$, so $x = ${v}$.`,
    trap: 'f^-1(t) is the x that f sends to t: solve f(x) = t rather than substituting t into f.',
    tags: ['functions', 'inverse', 'rational'],
    params: { variant: 'rational-inverse-value', a, b, q, t },
    typedAllowed: true,
  };
}

function excludedValue(rng: RNG): Generated | null {
  const a = rng.int(2, 6);
  const q = rng.intExcluding(1, 8, [a]);
  const b = rng.nonZeroInt(-9, 9);
  if (b + a * q === 0) return null;
  const answer = E(a);
  const ds: Cand[] = [
    { value: E(q), trap: 'gave the value excluded from the domain of f, not of f^-1', must: true },
    { value: E(-a), trap: 'sign error when rearranging', must: true },
    { value: E(b), trap: 'quoted the constant in the numerator' },
    { value: E(-q), trap: 'sign error' },
    { value: E(0), trap: 'assumed the excluded value is always 0' },
    { value: frac(b, a), trap: 'used the x-intercept instead of the asymptote' },
  ];
  return {
    stem: `The function $f$ is defined by $f(x) = ${ratTex(a, b, 1, -q)}$, $x \\ne ${q}$. Write down the value of $x$ that must be excluded from the domain of $f^{-1}$.`,
    answer: { kind: 'exact', value: answer },
    options: numberOptions(rng, answer, ds),
    solution: `The domain of $f^{-1}$ is the range of $f$, and $f(x) = ${a}$ has no solution (as $x \\to \\pm\\infty$, $f(x) \\to ${a}$). So $x = ${a}$ is excluded.`,
    trap: 'The excluded value for f^-1 comes from the range of f — the horizontal asymptote y = a, not the vertical one.',
    tags: ['functions', 'inverse', 'domain', 'asymptote'],
    params: { variant: 'excluded-value', a, b, q },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------- level 4

/** Solve f(x) = f^-1(x) for f(x) = ax + b. */
function selfInverseSolve(rng: RNG): Generated | null {
  const a = rng.pick([2, 3, 4, 5, -2, -3, -4]);
  const b = rng.nonZeroInt(-12, 12);
  if (b % (a - 1) !== 0) return null;
  const x0 = -b / (a - 1);
  if (x0 === 0 || Math.abs(x0) > 20) return null;
  const answer = E(x0);
  const ds: Cand[] = [
    { value: frac(b, a - 1), trap: 'sign error: f(x) = x gives x = −b/(a − 1)', must: true },
    { value: fr(-b, a + 1), trap: 'used a + 1 instead of a − 1', must: true },
    { value: fr(b, a + 1), trap: 'sign and denominator both wrong' },
    { value: frac(-b, a), trap: 'forgot the −1 in the denominator' },
    { value: E(b), trap: 'quoted the constant term' },
    { value: E(x0 + 1), trap: 'arithmetic slip' },
  ];
  return {
    stem: `The function $f$ is defined by $f(x) = ${lin(a, b)}$. Solve the equation $f(x) = f^{-1}(x)$.`,
    answer: { kind: 'exact', value: answer },
    options: numberOptions(rng, answer, ds),
    solution: `The graphs of $f$ and $f^{-1}$ are reflections in $y = x$, so they meet where $f(x) = x$: $${lin(a, b)} = x$ gives $x = ${x0}$.`,
    trap: 'For a linear f, f(x) = f^-1(x) is fastest as f(x) = x — the fixed point on the line y = x.',
    tags: ['functions', 'inverse', 'solve'],
    params: { variant: 'self-inverse', a, b },
    typedAllowed: true,
  };
}

/** Solve ff(x) = k. */
function doubleComposite(rng: RNG): Generated | null {
  const a = rng.pick([2, 3, 4, -2, -3]);
  const b = rng.nonZeroInt(-8, 8);
  const x0 = rng.nonZeroInt(-5, 6);
  const k = a * a * x0 + b * (a + 1);
  if (Math.abs(k) > 200) return null;
  const answer = E(x0);
  const ds: Cand[] = [
    { value: frac(k - b, a), trap: 'solved f(x) = k instead of ff(x) = k', must: true },
    { value: frac(k - b * (a + 1), a), trap: 'divided by a instead of a²', must: true },
    { value: E(k - b * (a + 1)), trap: 'forgot to divide by a²' },
    { value: frac(k - b, a * a), trap: 'used the constant only once' },
    { value: frac(k + b * (a + 1), a * a), trap: 'sign error on the constant' },
    { value: E(x0 + 1), trap: 'arithmetic slip' },
  ];
  return {
    stem: `The function $f$ is defined by $f(x) = ${lin(a, b)}$. Solve $ff(x) = ${k}$.`,
    answer: { kind: 'exact', value: answer },
    options: numberOptions(rng, answer, ds),
    solution: `$ff(x) = ${lin(a * a, b * (a + 1))}$, so $${lin(a * a, b * (a + 1))} = ${k}$ and $x = ${x0}$.`,
    trap: 'ff(x) applies f twice: a(ax + b) + b = a²x + ab + b, so divide by a², not a.',
    tags: ['functions', 'composite', 'solve'],
    params: { variant: 'double-composite', a, b, k },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------- level 5

/** f(x) = (ax + b)/(x − q): which formula is f^-1(x)? */
function inverseFormula(rng: RNG): Generated | null {
  const a = rng.int(1, 5);
  const q = rng.intExcluding(1, 6, [a]);
  const b = rng.nonZeroInt(-9, 9);
  if (b === q || b + a * q === 0) return null;
  const inv: [number, number, number, number] = [q, b, 1, -a];
  const correct = `$f^{-1}(x) = ${ratTex(...inv)}$`;
  const cands = [
    { display: `$f^{-1}(x) = ${ratTex(1, -a, q, b)}$`, trap: 'took the reciprocal of f instead of its inverse', must: true },
    { display: `$f^{-1}(x) = ${ratTex(a, b, 1, -q)}$`, trap: 'never swapped x and y — that is f(x) again', must: true },
    { display: `$f^{-1}(x) = ${ratTex(q, -b, 1, -a)}$`, trap: 'sign error on the constant when rearranging', must: true },
    { display: `$f^{-1}(x) = ${ratTex(q, b, 1, a)}$`, trap: 'sign error in the denominator when rearranging' },
    { display: `$f^{-1}(x) = ${ratTex(b, q, 1, -a)}$`, trap: 'swapped the two constants' },
  ];
  const options = choiceOptions(rng, correct, cands);
  if (!options) return null;
  return {
    stem: `The function $f$ is defined by $f(x) = ${ratTex(a, b, 1, -q)}$, $x \\ne ${q}$. Find $f^{-1}(x)$.`,
    answer: { kind: 'choice', value: correct },
    options,
    solution: `Put $y = ${ratTex(a, b, 1, -q)}$ and make $x$ the subject: $xy - ${q}y = ${lin(a, b)}$, so $x(y - ${a}) = ${lin(q, b, 'y')}$ and $x = ${ratTex(q, b, 1, -a, 'y')}$. Swapping the letters gives $f^{-1}(x) = ${ratTex(...inv)}$.`,
    trap: 'Rearrange for x and then swap the letters; 1/f(x) is not the inverse.',
    tags: ['functions', 'inverse', 'rational'],
    params: { variant: 'inverse-formula', a, b, q, inv },
    typedAllowed: false,
  };
}

/** Range of x² + bx + c on the restricted domain x ≥ t. */
function restrictedRange(rng: RNG): Generated | null {
  const u = rng.nonZeroInt(-4, 5);          // vertex x
  const w = rng.nonZeroInt(-9, 9);          // vertex y
  const b = -2 * u, c = u * u + w;
  if (Math.abs(c) > 30) return null;
  const t = rng.bool(0.6) ? u : u + rng.int(1, 3);
  const at = (x: number) => x * x + b * x + c;
  const lo = t <= u ? w : at(t);
  if (Math.abs(lo) > 60) return null;
  const correct = `$f(x) \\ge ${lo}$`;
  const cands = [
    { display: `$f(x) \\le ${lo}$`, trap: 'the inequality is the wrong way round', must: true },
    { display: `$f(x) \\ge ${t > u ? w : at(t + 1)}$`, trap: t > u ? 'used the vertex although it is outside the domain' : 'used a point inside the domain rather than the vertex', must: true },
    { display: `$f(x) \\ge ${t}$`, trap: 'gave the domain instead of the range' },
    { display: `$f(x) \\ge ${-lo}$`, trap: 'sign error in the minimum value' },
    { display: `$f(x) \\ge ${lo + 1}$`, trap: 'arithmetic slip when evaluating the minimum' },
    { display: `$f(x) > ${lo}$`, trap: 'the minimum is attained, so the inequality is not strict' },
  ];
  const options = choiceOptions(rng, correct, cands);
  if (!options) return null;
  return {
    stem: `The function $f$ is defined by $f(x) = x^{2} ${b > 0 ? `+ ${b}` : `- ${-b}`}x${c === 0 ? '' : c > 0 ? ` + ${c}` : ` - ${-c}`}$ for $x \\ge ${t}$. Find the range of $f$.`,
    answer: { kind: 'choice', value: correct },
    options,
    solution: `Completing the square, $f(x) = (x ${u > 0 ? '-' : '+'} ${Math.abs(u)})^{2} ${w > 0 ? `+ ${w}` : `- ${-w}`}$, so the vertex is at $x = ${u}$. ${t <= u ? `That lies in the domain, so the least value is $${lo}$` : `The curve is increasing for $x \\ge ${t}$, so the least value is $f(${t}) = ${lo}$`}.`,
    trap: 'Check whether the vertex is inside the restricted domain: if it is not, the minimum is at the endpoint.',
    tags: ['functions', 'range', 'quadratic'],
    params: { variant: 'restricted-range', b, c, t, lo },
    typedAllowed: false,
  };
}

const VARIANTS: Record<Level, ((rng: RNG) => Generated | null)[]> = {
  1: [compositeValue],
  2: [inverseLinear],
  3: [rationalInverseValue, excludedValue],
  4: [selfInverseSolve, doubleComposite],
  5: [inverseFormula, inverseFormula, restrictedRange],
};

export default defineTemplate({
  id: 'm2.functions.inverse-composite',
  module: 'M2',
  topic: 'functions',
  title: 'Composite and inverse functions',
  levels: {
    1: 'f(x) = 2x + 3, g(x) = x²: fg(2), gf(1)',
    2: 'f^-1(5) for a linear f',
    3: 'f(x) = (x + 1)/(x − 2): f^-1(3) or the value excluded from the domain of f^-1',
    4: 'f(x) = f^-1(x) for a linear f; ff(x) = k',
    5: 'f^-1(x) as a formula for a rational f; the range of a quadratic on x ≥ t',
  },
  generate(rng, level: Level) {
    return retry(rng, () => pickVariant(rng, VARIANTS[level]));
  },
  verify(q) {
    const p = q.params as unknown as {
      variant: string; a: number; b: number; n?: number; ask?: string; t?: number; q?: number; k?: number;
      inv?: [number, number, number, number]; c?: number; lo?: number;
    };
    const close = (x: number, y: number) => Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 1e-7 * Math.max(1, Math.abs(y));
    const v = q.answer.kind === 'exact' ? q.answer.value.toNumber() : NaN;
    switch (p.variant) {
      case 'composite': {
        // evaluate the two functions in turn, numerically
        const f = (x: number) => p.a * x + p.b;
        const g = (x: number) => x * x;
        return q.answer.kind === 'exact' && close(v, p.ask === 'fg' ? f(g(p.n!)) : g(f(p.n!)));
      }
      case 'inverse-linear':
        // f applied to the claimed f^-1(t) must return t
        return q.answer.kind === 'exact' && close(p.a * v + p.b, p.t!);
      case 'rational-inverse-value': {
        if (q.answer.kind !== 'exact' || Math.abs(v - p.q!) < 1e-9) return false;
        return close((p.a * v + p.b) / (v - p.q!), p.t!);
      }
      case 'excluded-value': {
        // no x solves f(x) = v: the equation (a − v)x = −(b + vq) must have no root
        if (q.answer.kind !== 'exact') return false;
        if (Math.abs(p.a - v) > 1e-12) return false;
        // and nearby values are attained
        for (const y of [v + 1, v - 1]) {
          const x = -(p.b + y * p.q!) / (p.a - y);
          if (!close((p.a * x + p.b) / (x - p.q!), y)) return false;
        }
        return true;
      }
      case 'self-inverse': {
        // f(x) and f^-1(x) must agree at the claimed x
        if (q.answer.kind !== 'exact') return false;
        const fx = p.a * v + p.b;
        const finv = (v - p.b) / p.a;
        return close(fx, finv);
      }
      case 'double-composite': {
        if (q.answer.kind !== 'exact') return false;
        const f = (x: number) => p.a * x + p.b;
        return close(f(f(v)), p.k!);
      }
      case 'inverse-formula': {
        if (q.answer.kind !== 'choice' || !p.inv) return false;
        const [A, B, C, D] = p.inv;
        const g = (x: number) => (A * x + B) / (C * x + D);
        const f = (x: number) => (p.a * x + p.b) / (x - p.q!);
        for (const t of [0.37, 2.13, 5.71, -3.29]) {
          const x = g(t);
          if (!Number.isFinite(x) || Math.abs(x - p.q!) < 1e-6) continue;
          if (!close(f(x), t)) return false;
        }
        return q.answer.value === `$f^{-1}(x) = ${ratTex(A, B, C, D)}$`;
      }
      case 'restricted-range': {
        if (q.answer.kind !== 'choice') return false;
        const f = (x: number) => x * x + p.b * x + p.c!;
        let min = Infinity;
        for (let x = p.t!; x <= p.t! + 14; x += 0.01) min = Math.min(min, f(x));
        if (Math.abs(min - p.lo!) > 1e-3) return false;
        return q.answer.value === `$f(x) \\ge ${p.lo}$`;
      }
      default:
        return false;
    }
  },
});
