import { defineTemplate, retry, type Generated, type Level, type Option } from '../../core/template';
import { E, Exact } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import type { RNG } from '../../core/rng';

/**
 * Graph transformations, described in words or by the equation of the new curve (no diagrams).
 * Level 1: y = f(x) + 3, y = f(x − 2): where does a given point move?
 * Level 2: y = −f(x), y = f(−x), y = kf(x): image of a point, or the new minimum value
 * Level 3: y = f(2x), y = f(x/3): image of a point, or the new x-intercept
 * Level 4: y = af(x − h) + c: image of a point; or the equation of y = x² after two named transformations
 * Level 5: order-dependent pairs of transformations; the turning point of a quadratic after two transformations
 *
 * Every question stores the transformation as a list of ops in params, so verify() can apply them
 * numerically (to the point, or to the concrete function evaluated at two x-values) rather than
 * repeating the algebra of generate().
 */

type Op =
  | { t: 'tx'; v: number }   // translate v units in the positive x-direction
  | { t: 'ty'; v: number }   // translate v units in the positive y-direction
  | { t: 'rx' }              // reflect in the x-axis
  | { t: 'ry' }              // reflect in the y-axis
  | { t: 'sy'; k: number }   // stretch parallel to the y-axis, scale factor k  (y = kf(x))
  | { t: 'sx'; k: number };  // stretch parallel to the x-axis, scale factor k  (y = f(x/k))

/** The composite written as y = A f((x − H)/K) + C. */
interface Form { A: number; H: number; K: number; C: number }

function compose(ops: Op[]): Form {
  const f: Form = { A: 1, H: 0, K: 1, C: 0 };
  for (const op of ops) {
    switch (op.t) {
      case 'tx': f.H += op.v; break;
      case 'ty': f.C += op.v; break;
      case 'rx': f.A = -f.A; f.C = -f.C; break;
      case 'ry': f.H = -f.H; f.K = -f.K; break;
      case 'sy': f.A *= op.k; f.C *= op.k; break;
      case 'sx': f.H *= op.k; f.K *= op.k; break;
    }
  }
  return f;
}

/** Image of (p, q) under the composite, from the algebraic form. */
function image(ops: Op[], p: number, q: number): [number, number] {
  const f = compose(ops);
  return [f.K * p + f.H, f.A * q + f.C];
}

/** The same point moved op by op — the independent route used by verify(). */
function imageStepwise(ops: Op[], p: number, q: number): [number, number] {
  let x = p, y = q;
  for (const op of ops) {
    switch (op.t) {
      case 'tx': x += op.v; break;
      case 'ty': y += op.v; break;
      case 'rx': y = -y; break;
      case 'ry': x = -x; break;
      case 'sy': y *= op.k; break;
      case 'sx': x *= op.k; break;
    }
  }
  return [x, y];
}

/** The transformed function as a closure, for verify(). */
function transformed(ops: Op[], base: (x: number) => number): (x: number) => number {
  let f = base;
  for (const op of ops) {
    const g = f;
    switch (op.t) {
      case 'tx': f = (x) => g(x - op.v); break;
      case 'ty': f = (x) => g(x) + op.v; break;
      case 'rx': f = (x) => -g(x); break;
      case 'ry': f = (x) => g(-x); break;
      case 'sy': f = (x) => op.k * g(x); break;
      case 'sx': f = (x) => g(x / op.k); break;
    }
  }
  return f;
}

const pt = (c: [number, number]): string => `$(${c[0]}, ${c[1]})$`;

function fArgText(H: number, K: number): string {
  if (K === 1) return H === 0 ? 'x' : `x ${H > 0 ? '-' : '+'} ${Math.abs(H)}`;
  if (K === -1 && H === 0) return '-x';
  if (H === 0 && Number.isInteger(1 / K)) return `${1 / K}x`;
  if (H === 0 && Number.isInteger(K)) return `\\frac{x}{${K}}`;
  return 'x';
}

/** "y = 2f(x - 1) + 3" for the composites this template builds. */
function eqnText(ops: Op[]): string {
  const { A, H, K, C } = compose(ops);
  const coef = A === 1 ? '' : A === -1 ? '-' : `${A}`;
  const tail = C === 0 ? '' : C > 0 ? ` + ${C}` : ` - ${-C}`;
  return `y = ${coef}f\\left(${fArgText(H, K)}\\right)${tail}`;
}

/** "translated 3 units in the positive x-direction" */
function opWords(op: Op): string {
  switch (op.t) {
    case 'tx': return `translated ${Math.abs(op.v)} unit${Math.abs(op.v) === 1 ? '' : 's'} in the ${op.v > 0 ? 'positive' : 'negative'} $x$-direction`;
    case 'ty': return `translated ${Math.abs(op.v)} unit${Math.abs(op.v) === 1 ? '' : 's'} in the ${op.v > 0 ? 'positive' : 'negative'} $y$-direction`;
    case 'rx': return 'reflected in the $x$-axis';
    case 'ry': return 'reflected in the $y$-axis';
    case 'sy': return `stretched parallel to the $y$-axis with scale factor ${op.k}`;
    case 'sx': return `stretched parallel to the $x$-axis with scale factor ${op.k}`;
  }
}

interface WrongPoint { p: [number, number]; trap: string; must?: boolean }

/** Options for "where does the point go?": the named traps first, then extras, all as coordinates. */
function pointOptions(rng: RNG, correct: [number, number], wrongs: WrongPoint[]): Option[] | null {
  const seen = new Set([pt(correct)]);
  const picked: { display: string; trap: string }[] = [];
  const take = (w: WrongPoint) => {
    const d = pt(w.p);
    if (picked.length >= 4 || seen.has(d) || !w.p.every((v) => Number.isInteger(v) && Math.abs(v) <= 999)) return;
    seen.add(d);
    picked.push({ display: d, trap: w.trap });
  };
  wrongs.filter((w) => w.must).forEach(take);
  rng.shuffle(wrongs.filter((w) => !w.must)).forEach(take);
  if (picked.length < 4) return null;
  return buildChoiceOptions(rng, pt(correct), picked);
}

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
  return buildOptions(rng, answer, out);
}

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 60; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

const POINT_STEM = (ops: Op[]): string =>
  `The point $(P)$ lies on the curve $y = f(x)$. State the coordinates of the corresponding point on the curve $${eqnText(ops)}$.`;

function pointQuestion(rng: RNG, ops: Op[], p: number, q: number, wrongs: WrongPoint[], extra: {
  stem?: string; solution: string; trap: string; tags: string[]; variant: string;
}): Generated | null {
  const correct = image(ops, p, q);
  if (!correct.every((v) => Number.isInteger(v))) return null;
  const generic: WrongPoint[] = [
    { p: [correct[1], correct[0]], trap: 'wrote the coordinates the wrong way round' },
    { p: [-correct[0], correct[1]], trap: 'changed the sign of the wrong coordinate' },
    { p: [correct[0], -correct[1]], trap: 'changed the sign of the wrong coordinate' },
    { p: [p, q], trap: 'thought the point was unchanged' },
  ];
  const options = pointOptions(rng, correct, [...wrongs, ...generic]);
  if (!options) return null;
  const stem = (extra.stem ?? POINT_STEM(ops)).replace('(P)', `(${p}, ${q})`);
  return {
    stem,
    answer: { kind: 'choice', value: pt(correct) },
    options,
    solution: extra.solution,
    trap: extra.trap,
    tags: extra.tags,
    params: { variant: extra.variant, ops, p, q },
    typedAllowed: false,
  };
}

// ----------------------------------------------------------------- level 1

function shiftPoint(rng: RNG): Generated | null {
  const horizontal = rng.bool();
  const v = rng.nonZeroInt(-4, 5);
  const p = rng.nonZeroInt(-6, 6);
  const q = rng.nonZeroInt(-8, 8);
  const ops: Op[] = [horizontal ? { t: 'tx', v } : { t: 'ty', v }];
  const wrongs: WrongPoint[] = horizontal
    ? [
        { p: [p - v, q], trap: 'moved the curve the wrong way: y = f(x − a) moves it a units in the positive x-direction', must: true },
        { p: [p, q + v], trap: 'changed the y-coordinate instead of the x-coordinate', must: true },
        { p: [p, q - v], trap: 'changed the y-coordinate instead of the x-coordinate' },
        { p: [p + v, q + v], trap: 'moved both coordinates' },
      ]
    : [
        { p: [p, q - v], trap: 'moved the curve the wrong way in the y-direction', must: true },
        { p: [p + v, q], trap: 'changed the x-coordinate instead of the y-coordinate', must: true },
        { p: [p - v, q], trap: 'changed the x-coordinate instead of the y-coordinate' },
        { p: [p + v, q + v], trap: 'moved both coordinates' },
      ];
  const step = (from: number) => `$${from} ${v > 0 ? `+ ${v}` : `- ${-v}`} = ${from + v}$`;
  const dir = `${Math.abs(v)} in the ${v > 0 ? 'positive' : 'negative'}`;
  const where = horizontal
    ? `a translation of ${dir} $x$-direction, so only the $x$-coordinate changes: ${step(p)}`
    : `a translation of ${dir} $y$-direction, so only the $y$-coordinate changes: ${step(q)}`;
  return pointQuestion(rng, ops, p, q, wrongs, {
    solution: `$${eqnText(ops)}$ is ${where}.`,
    trap: 'y = f(x − a) moves the curve a units in the positive x-direction, and it leaves the y-coordinates alone.',
    tags: ['transformations', 'translation', 'graphs'],
    variant: 'point',
  });
}

// ----------------------------------------------------------------- level 2

function reflectStretchPoint(rng: RNG): Generated | null {
  const kind = rng.pick(['rx', 'ry', 'sy'] as const);
  const p = rng.nonZeroInt(-6, 6);
  const q = rng.nonZeroInt(-7, 7);
  const k = rng.int(2, 4);
  const ops: Op[] = kind === 'sy' ? [{ t: 'sy', k }] : [{ t: kind }];
  let wrongs: WrongPoint[];
  let solution: string;
  if (kind === 'rx') {
    wrongs = [
      { p: [-p, q], trap: 'reflected in the y-axis instead of the x-axis', must: true },
      { p: [-p, -q], trap: 'reflected in both axes' },
      { p: [p, q], trap: 'thought the point was unchanged' },
    ];
    solution = `$y = -f(x)$ reflects the curve in the $x$-axis, so the $y$-coordinate changes sign: $(${p}, ${-q})$.`;
  } else if (kind === 'ry') {
    wrongs = [
      { p: [p, -q], trap: 'reflected in the x-axis instead of the y-axis', must: true },
      { p: [-p, -q], trap: 'reflected in both axes' },
      { p: [p, q], trap: 'thought the point was unchanged' },
    ];
    solution = `$y = f(-x)$ reflects the curve in the $y$-axis, so the $x$-coordinate changes sign: $(${-p}, ${q})$.`;
  } else {
    wrongs = [
      { p: [k * p, q], trap: 'stretched parallel to the wrong axis', must: true },
      { p: [k * p, k * q], trap: 'multiplied both coordinates by the scale factor' },
      { p: [p, q + k], trap: 'added the scale factor instead of multiplying by it' },
      { p: [p + k, q], trap: 'added the scale factor to the x-coordinate' },
    ];
    solution = `$y = ${k}f(x)$ multiplies every $y$-coordinate by $${k}$: $(${p}, ${k * q})$.`;
  }
  return pointQuestion(rng, ops, p, q, wrongs, {
    solution,
    trap: 'y = −f(x) changes the sign of y, y = f(−x) changes the sign of x, and y = kf(x) scales y only.',
    tags: ['transformations', 'reflection', 'stretch', 'graphs'],
    variant: 'point',
  });
}

function minValue(rng: RNG): Generated | null {
  const k = rng.int(2, 4);
  const c = rng.nonZeroInt(-6, 6);
  const t = rng.nonZeroInt(-5, 5);
  const m = rng.nonZeroInt(-6, 6);
  const ops: Op[] = [{ t: 'sy', k }, { t: 'ty', v: c }];
  const value = k * m + c;
  if (value === m || value === 0) return null;
  const answer = E(value);
  const ds: Cand[] = [
    { value: E(m + c), trap: 'forgot the stretch', must: true },
    { value: E(k * (m + c)), trap: 'added the constant before stretching', must: true },
    { value: E(k * m), trap: 'forgot the translation' },
    { value: E(-value), trap: 'sign error' },
    { value: E(m * c), trap: 'multiplied the two numbers in the question' },
    { value: E(value + 1), trap: 'arithmetic slip' },
  ];
  return {
    stem: `The curve $y = f(x)$ has a minimum point at $(${t}, ${m})$. Find the minimum value of $y = ${k}f(x) ${c > 0 ? `+ ${c}` : `- ${-c}`}$.`,
    answer: { kind: 'exact', value: answer },
    options: numberOptions(rng, answer, ds),
    solution: `Each $y$-coordinate is multiplied by $${k}$ and then $${c}$ is added: $${k} \\times (${m}) ${c > 0 ? `+ ${c}` : `- ${-c}`} = ${value}$.`,
    trap: 'Stretch first, then translate: kf(x) + c gives km + c, not k(m + c).',
    tags: ['transformations', 'stretch', 'minimum'],
    params: { variant: 'min-value', ops, p: t, q: m },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------- level 3

function stretchXPoint(rng: RNG): Generated | null {
  const m = rng.int(2, 3);
  const squash = rng.bool(); // y = f(mx) squashes towards the y-axis
  const k = squash ? 1 / m : m;
  const ops: Op[] = [{ t: 'sx', k }];
  const p = m * rng.nonZeroInt(-4, 4);
  const q = m * rng.nonZeroInt(-3, 3);
  const correct = image(ops, p, q);
  if (!Number.isInteger(correct[0])) return null;
  const wrongs: WrongPoint[] = squash
    ? [
        { p: [m * p, q], trap: 'multiplied by the coefficient: y = f(mx) squashes the curve towards the y-axis', must: true },
        { p: [p, q / m], trap: 'applied the stretch to the y-coordinate', must: true },
        { p: [p, m * q], trap: 'applied the stretch to the y-coordinate' },
        { p: [p / m, q / m], trap: 'divided both coordinates' },
      ]
    : [
        { p: [p / m, q], trap: 'divided instead of multiplying: y = f(x/m) stretches the curve away from the y-axis', must: true },
        { p: [p, m * q], trap: 'applied the stretch to the y-coordinate', must: true },
        { p: [p, q / m], trap: 'applied the stretch to the y-coordinate' },
        { p: [m * p, m * q], trap: 'multiplied both coordinates' },
      ];
  return pointQuestion(rng, ops, p, q, wrongs, {
    solution: squash
      ? `$y = f(${m}x)$ squashes the curve towards the $y$-axis in the ratio $1 : ${m}$, so every $x$-coordinate is divided by $${m}$: $(${correct[0]}, ${correct[1]})$.`
      : `$y = f\\left(\\frac{x}{${m}}\\right)$ multiplies every $x$-coordinate by $${m}$: $(${correct[0]}, ${correct[1]})$.`,
    trap: 'f(mx) divides the x-coordinates by m; only f(x/m) multiplies them.',
    tags: ['transformations', 'stretch', 'graphs'],
    variant: 'point',
  });
}

function xIntercept(rng: RNG): Generated | null {
  const m = rng.int(2, 4);
  const squash = rng.bool();
  const k = squash ? 1 / m : m;
  const ops: Op[] = [{ t: 'sx', k }];
  const r = m * rng.nonZeroInt(-5, 5);
  const value = squash ? r / m : r * m;
  if (!Number.isInteger(value) || value === r) return null;
  const answer = E(value);
  const ds: Cand[] = [
    { value: E(squash ? r * m : r / m), trap: squash ? 'multiplied by m: f(mx) squashes the curve towards the y-axis' : 'divided by m instead of multiplying', must: true },
    { value: E(r), trap: 'thought a stretch parallel to the x-axis leaves the intercept alone', must: true },
    { value: E(r + m), trap: 'treated the stretch as a translation' },
    { value: E(r - m), trap: 'treated the stretch as a translation' },
    { value: E(-value), trap: 'sign error' },
  ];
  const eqn = squash ? `y = f(${m}x)` : `y = f\\left(\\frac{x}{${m}}\\right)`;
  return {
    stem: `The curve $y = f(x)$ cuts the $x$-axis at $(${r}, 0)$. Find the $x$-coordinate of the corresponding point where the curve $${eqn}$ cuts the $x$-axis.`,
    answer: { kind: 'exact', value: answer },
    options: numberOptions(rng, answer, ds),
    solution: squash
      ? `$f(${m}x) = 0$ when $${m}x = ${r}$, so $x = ${value}$.`
      : `$f\\left(\\frac{x}{${m}}\\right) = 0$ when $\\frac{x}{${m}} = ${r}$, so $x = ${value}$.`,
    trap: 'Set the bracket equal to the old x-value: f(mx) = 0 when mx = r, so x = r/m.',
    tags: ['transformations', 'stretch', 'intercept'],
    params: { variant: 'x-intercept', ops, p: r, q: 0 },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------- level 4

function compositePoint(rng: RNG): Generated | null {
  const a = rng.pick([2, 3, -1, -2]);
  const h = rng.nonZeroInt(-3, 4);
  const c = rng.nonZeroInt(-5, 5);
  const p = rng.nonZeroInt(-5, 5);
  const q = rng.nonZeroInt(-5, 5);
  const ops: Op[] = [{ t: 'tx', v: h }, { t: 'sy', k: a }, { t: 'ty', v: c }];
  const wrongs: WrongPoint[] = [
    { p: [p + h, a * (q + c)], trap: 'added the constant before applying the stretch', must: true },
    { p: [p - h, a * q + c], trap: 'translated the wrong way: f(x − h) moves the curve h to the right', must: true },
    { p: [a * p + h, q + c], trap: 'applied the stretch to the x-coordinate' },
    { p: [p + h, q + c], trap: 'forgot the stretch' },
    { p: [p + h, a * q], trap: 'forgot the vertical translation' },
  ];
  const correct = image(ops, p, q);
  return pointQuestion(rng, ops, p, q, wrongs, {
    solution: `The $x$-coordinate becomes $${p} ${h > 0 ? `+ ${h}` : `- ${-h}`} = ${correct[0]}$ and the $y$-coordinate becomes $${a} \\times (${q}) ${c > 0 ? `+ ${c}` : `- ${-c}`} = ${correct[1]}$.`,
    trap: 'In af(x − h) + c the stretch acts on f(x) first, so y goes to aq + c, not a(q + c).',
    tags: ['transformations', 'composite', 'graphs'],
    variant: 'point',
  });
}

function quadEqn(a: number, h: number, c: number): string {
  const sq = h === 0 ? 'x^{2}' : `(x ${h > 0 ? '-' : '+'} ${Math.abs(h)})^{2}`;
  const coef = a === 1 ? '' : a === -1 ? '-' : `${a}`;
  const tail = c === 0 ? '' : c > 0 ? ` + ${c}` : ` - ${-c}`;
  return `$y = ${coef}${sq}${tail}$`;
}

/** Two named transformations applied to y = x²: which equation results? */
const swapAxis = (op: Op): Op => (op.t === 'tx' ? { t: 'ty', v: op.v } : op.t === 'ty' ? { t: 'tx', v: op.v } : op);
const negateShift = (op: Op): Op => (op.t === 'tx' ? { t: 'tx', v: -op.v } : op.t === 'ty' ? { t: 'ty', v: -op.v } : op);

function quadTransform(rng: RNG): Generated | null {
  const pool: Op[] = [
    { t: 'tx', v: rng.nonZeroInt(-3, 3) },
    { t: 'ty', v: rng.nonZeroInt(-5, 5) },
    { t: 'rx' },
    { t: 'sy', k: rng.int(2, 3) },
  ];
  const [o1, o2] = rng.pickDistinct(pool, 2);
  const ops = [o1, o2];
  const f = compose(ops);
  const eq = (g: Form) => quadEqn(g.A, g.H, g.C);
  const correct = eq(f);
  const has = (t: Op['t']) => ops.some((o) => o.t === t);
  const reflected = has('rx') || has('ry');
  /** Flip the sign of just one of the two translations. */
  const negateOne = (t: 'tx' | 'ty') => ops.map((o) => (o.t === t ? negateShift(o) : o));
  const cands: { display: string; trap: string; must?: boolean }[] = [
    { display: eq(compose([o2, o1])), trap: 'applied the two transformations in the other order', must: true },
    { display: eq(compose(ops.map(negateShift))), trap: 'translated the wrong way: moving a units right gives (x − a)²', must: true },
    { display: eq(compose(ops.map(swapAxis))), trap: 'translated along the wrong axis' },
    ...(has('tx') ? [{ display: eq(compose(negateOne('tx'))), trap: 'translated the wrong way horizontally: a units in the positive x-direction gives (x − a)²' }] : []),
    ...(has('ty') ? [{ display: eq(compose(negateOne('ty'))), trap: 'translated the wrong way vertically' }] : []),
    // Reflection traps only make sense when the question contains a reflection.
    ...(reflected ? [
      { display: quadEqn(-f.A, f.H, f.C), trap: 'forgot to change the sign of the x² term when reflecting in the x-axis' },
      { display: quadEqn(f.A, f.H, -f.C), trap: 'forgot that the reflection also changes the constant' },
    ] : []),
    { display: eq(compose([o1])), trap: 'applied only the first transformation' },
    { display: eq(compose([o2])), trap: 'applied only the second transformation' },
  ];
  const seen = new Set([correct]);
  const picked: { display: string; trap: string }[] = [];
  const take = (w: { display: string; trap: string }) => {
    if (picked.length >= 4 || seen.has(w.display)) return;
    seen.add(w.display);
    picked.push(w);
  };
  cands.filter((w) => w.must).forEach(take);
  rng.shuffle(cands.filter((w) => !w.must)).forEach(take);
  if (picked.length < 4) return null;
  return {
    stem: `The curve $y = x^{2}$ is ${opWords(o1)} and then ${opWords(o2)}. Find the equation of the new curve.`,
    answer: { kind: 'choice', value: correct },
    options: buildChoiceOptions(rng, correct, picked),
    solution: `In order: ${opWords(o1)} gives ${eq(compose([o1]))}, and then ${opWords(o2)} gives ${correct}.`,
    trap: 'Order matters: apply each transformation to the curve the previous one produced.',
    tags: ['transformations', 'quadratic', 'equation'],
    params: { variant: 'equation', ops, n: 2, a: f.A, h: f.H, c: f.C },
    typedAllowed: false,
  };
}

// ----------------------------------------------------------------- level 5

function orderPair(rng: RNG): Generated | null {
  const m = rng.int(2, 3);
  const v = rng.nonZeroInt(-4, 4);
  const vertical = rng.bool();
  const stretchFirst = rng.bool();
  const stretch: Op = vertical ? { t: 'sy', k: m } : { t: 'sx', k: m };
  const move: Op = vertical ? { t: 'ty', v } : { t: 'tx', v };
  const ops: Op[] = stretchFirst ? [stretch, move] : [move, stretch];
  const p = m * rng.nonZeroInt(-3, 3);
  const q = m * rng.nonZeroInt(-3, 3);
  const correct = image(ops, p, q);
  const reversed = image([ops[1], ops[0]], p, q);
  if (correct[0] === reversed[0] && correct[1] === reversed[1]) return null;
  const wrongs: WrongPoint[] = [
    { p: reversed, trap: 'applied the two transformations in the other order', must: true },
    { p: image([ops[0]], p, q), trap: 'applied only the first transformation', must: true },
    { p: image([ops[1]], p, q), trap: 'applied only the second transformation' },
    { p: vertical ? [p, q * m + v * m] : [p * m + v * m, q], trap: 'scaled the translation as well as the point' },
  ];
  const stem = `The curve $y = f(x)$ is ${opWords(ops[0])} and then ${opWords(ops[1])}. The point $(P)$ lies on $y = f(x)$. State the coordinates of the corresponding point on the new curve.`;
  const first = image([ops[0]], p, q);
  return pointQuestion(rng, ops, p, q, wrongs, {
    stem,
    solution: `After the first transformation the point is at $(${first[0]}, ${first[1]})$; the second then gives $(${correct[0]}, ${correct[1]})$.`,
    trap: 'A stretch followed by a translation is not the same as the translation followed by the stretch.',
    tags: ['transformations', 'composite', 'order'],
    variant: 'point',
  });
}

function turningPoint(rng: RNG): Generated | null {
  const u = rng.nonZeroInt(-4, 4);           // vertex x of y = x² − 2ux + (u² + w)
  const w = rng.nonZeroInt(-9, 9);           // vertex y
  const b = -2 * u;
  const cc = u * u + w;
  if (Math.abs(cc) > 30) return null;
  const a = rng.pick([2, 3, -1, -2]);
  const c = rng.nonZeroInt(-6, 6);
  const h = rng.nonZeroInt(-3, 3);
  const ops: Op[] = [{ t: 'tx', v: h }, { t: 'sy', k: a }, { t: 'ty', v: c }];
  const correct = image(ops, u, w);
  if (Math.abs(correct[1]) > 99) return null;
  const wrongs: WrongPoint[] = [
    { p: [-u + h, correct[1]], trap: 'took the vertex at x = b/2 instead of x = −b/2', must: true },
    { p: [u + h, a * (w + c)], trap: 'added the constant before applying the stretch', must: true },
    { p: [u - h, correct[1]], trap: 'translated the wrong way' },
    { p: [u + h, w + c], trap: 'forgot the stretch' },
    { p: [u, correct[1]], trap: 'forgot the horizontal translation' },
  ];
  const quad = `x^{2} ${b > 0 ? `+ ${b}` : `- ${-b}`}x${cc === 0 ? '' : cc > 0 ? ` + ${cc}` : ` - ${-cc}`}`;
  const stem = `The function $f$ is given by $f(x) = ${quad}$. Find the coordinates of the turning point of the curve $${eqnText(ops)}$.`;
  const options = pointOptions(rng, correct, [
    ...wrongs,
    { p: [correct[1], correct[0]], trap: 'wrote the coordinates the wrong way round' },
    { p: [u, w], trap: 'gave the turning point of the original curve' },
  ]);
  if (!options) return null;
  return {
    stem,
    answer: { kind: 'choice', value: pt(correct) },
    options,
    solution: `Completing the square, $f(x) = (x ${u > 0 ? '-' : '+'} ${Math.abs(u)})^{2} ${w > 0 ? `+ ${w}` : `- ${-w}`}$, so the turning point of $y = f(x)$ is $(${u}, ${w})$. The transformation moves it to $(${correct[0]}, ${correct[1]})$.`,
    trap: 'Find the vertex first (x = −b/2), then transform it: x shifts, y is stretched and then shifted.',
    tags: ['transformations', 'quadratic', 'turning-point'],
    params: { variant: 'turning-point', ops, p: u, q: w, b, c: cc },
    typedAllowed: false,
  };
}

const VARIANTS: Record<Level, ((rng: RNG) => Generated | null)[]> = {
  1: [shiftPoint],
  2: [reflectStretchPoint, minValue],
  3: [stretchXPoint, xIntercept],
  4: [compositePoint, quadTransform],
  5: [orderPair, turningPoint],
};

export default defineTemplate({
  id: 'm2.functions.transformations',
  module: 'M2',
  topic: 'functions',
  title: 'Graph transformations in words',
  levels: {
    1: 'y = f(x) + 3, y = f(x − 2): image of a point',
    2: 'y = −f(x), y = f(−x), y = kf(x): image of a point or the new minimum value',
    3: 'y = f(2x), y = f(x/3): image of a point or the new x-intercept',
    4: 'y = af(x − h) + c; the equation of y = x² after two named transformations',
    5: 'order-dependent pairs of transformations; the turning point after two transformations',
  },
  generate(rng, level: Level) {
    return retry(rng, () => pickVariant(rng, VARIANTS[level]));
  },
  verify(q) {
    const p = q.params as unknown as { variant: string; ops: Op[]; p: number; q: number; n?: number; a?: number; h?: number; c?: number; b?: number };
    const close = (x: number, y: number) => Number.isFinite(x) && Math.abs(x - y) < 1e-9;
    const coords = (s: string): [number, number] | null => {
      const m = /\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/.exec(s);
      return m ? [Number(m[1]), Number(m[2])] : null;
    };
    switch (p.variant) {
      case 'point': {
        // move the concrete point through the ops one at a time and compare with the claimed image
        if (q.answer.kind !== 'choice') return false;
        const claimed = coords(q.answer.value);
        if (!claimed) return false;
        const expected = imageStepwise(p.ops, p.p, p.q);
        return close(claimed[0], expected[0]) && close(claimed[1], expected[1]);
      }
      case 'min-value':
        return q.answer.kind === 'exact' && close(q.answer.value.toNumber(), imageStepwise(p.ops, p.p, p.q)[1]);
      case 'x-intercept':
        return q.answer.kind === 'exact' && close(q.answer.value.toNumber(), imageStepwise(p.ops, p.p, p.q)[0]);
      case 'equation': {
        // evaluate the claimed equation and the transformed base function at two x-values
        if (q.answer.kind !== 'choice') return false;
        const n = p.n ?? 2;
        const f = transformed(p.ops, (x) => x ** n);
        const claimed = (x: number) => p.a! * (x - p.h!) ** n + p.c!;
        if (![1.7, -0.3, 2.5].every((x) => Math.abs(f(x) - claimed(x)) < 1e-9)) return false;
        // a reflection trap must not be pinned on a question with no reflection in it
        const reflects = p.ops.some((o) => o.t === 'rx' || o.t === 'ry');
        if (!reflects && q.options.some((o) => /reflect/i.test(o.trap ?? ''))) return false;
        return q.answer.value === quadEqn(p.a!, p.h!, p.c!);
      }
      case 'turning-point': {
        if (q.answer.kind !== 'choice') return false;
        const claimed = coords(q.answer.value);
        if (!claimed) return false;
        // the stated vertex must really be the minimum of x² + bx + c
        const base = (x: number) => x * x + p.b! * x + p.c!;
        if (!close(base(p.p), p.q)) return false;
        if (base(p.p + 0.5) <= p.q || base(p.p - 0.5) <= p.q) return false;
        const expected = imageStepwise(p.ops, p.p, p.q);
        return close(claimed[0], expected[0]) && close(claimed[1], expected[1]);
      }
      default:
        return false;
    }
  },
});
