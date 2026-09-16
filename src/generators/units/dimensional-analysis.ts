import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { buildChoiceOptions } from '../../core/options';
import type { Option } from '../../core/template';
import type { RNG } from '../../core/rng';

/**
 * Units of a quantity and dimensional checks — every answer is a piece of text, so kind is 'choice'.
 * Level 1: the SI base units of force, energy, power, pressure, momentum, charge
 * Level 2: the base units of a constant read off a formula (k in F = kx, G in F = Gm₁m₂/r², h in E = hf)
 * Level 3: which of five units is NOT a unit of energy / power / force / pressure
 * Level 4: the base units of a combination such as Q = ρv²L; the powers a, b in T ∝ mᵃkᵇ
 * Level 5: which formula is dimensionally consistent (v = √(gL) against v = gL, v = √(g/L) …);
 *          the units of the gradient or the area of a described graph
 *
 * Units are held as exponent vectors [kg, m, s, A]. verify() recomputes the correct vector from the
 * quantities named in params and parses every option's LaTeX back into a vector with its own symbol
 * table, so it never trusts the strings generate() built: it checks that exactly one option carries
 * the right units and that it is the one marked correct.
 */

type Vec = [number, number, number, number];
const BASE_SYMS = ['kg', 'm', 's', 'A'];

const add = (a: Vec, b: Vec, k = 1): Vec => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2], a[3] + k * b[3]] as Vec;
const sameVec = (a: Vec, b: Vec): boolean => a.every((x, i) => Math.abs(x - b[i]) < 1e-9);

/** Physical quantities, as [kg, m, s, A] exponents. */
const QTY: Record<string, Vec> = {
  mass: [1, 0, 0, 0],
  length: [0, 1, 0, 0],
  time: [0, 0, 1, 0],
  current: [0, 0, 0, 1],
  area: [0, 2, 0, 0],
  volume: [0, 3, 0, 0],
  speed: [0, 1, -1, 0],
  accel: [0, 1, -2, 0],
  force: [1, 1, -2, 0],
  energy: [1, 2, -2, 0],
  power: [1, 2, -3, 0],
  pressure: [1, -1, -2, 0],
  density: [1, -3, 0, 0],
  momentum: [1, 1, -1, 0],
  spring: [1, 0, -2, 0],
  freq: [0, 0, -1, 0],
  charge: [0, 0, 1, 1],
  voltage: [1, 2, -3, -1],
  linearDensity: [1, -1, 0, 0],
};

/** Unit symbols that may appear in an option, as [kg, m, s, A] exponents. */
const SYMBOL_VEC: Record<string, Vec> = {
  kg: [1, 0, 0, 0], m: [0, 1, 0, 0], s: [0, 0, 1, 0], A: [0, 0, 0, 1],
  N: [1, 1, -2, 0], J: [1, 2, -2, 0], W: [1, 2, -3, 0], Pa: [1, -1, -2, 0],
  Hz: [0, 0, -1, 0], C: [0, 0, 1, 1], V: [1, 2, -3, -1],
};

/** "kg m² s⁻³" as MathText. */
function vecTex(v: Vec): string {
  const parts: string[] = [];
  v.forEach((e, i) => {
    if (e === 0) return;
    parts.push(`\\text{${BASE_SYMS[i]}}${e === 1 ? '' : `^{${e}}`}`);
  });
  return parts.length > 0 ? `$${parts.join('\\,')}$` : '$1$';
}

/** Parse an option's LaTeX back into an exponent vector (verify's independent route). */
function texToVec(display: string): Vec | null {
  const re = /\\text\{([A-Za-z]+)\}(?:\^\{(-?\d+)\})?/g;
  let out: Vec = [0, 0, 0, 0];
  let m: RegExpExecArray | null;
  let found = false;
  while ((m = re.exec(display)) !== null) {
    const sym = SYMBOL_VEC[m[1]];
    if (!sym) return null;
    out = add(out, sym, m[2] ? parseInt(m[2], 10) : 1);
    found = true;
  }
  return found ? out : null;
}

/** A quantity built as a product/quotient of named quantities: Σ num − Σ den. */
interface Spec { num: [string, number][]; den?: [string, number][] }

function specVec(spec: Spec): Vec | null {
  let out: Vec = [0, 0, 0, 0];
  for (const [q, p] of spec.num) {
    if (!QTY[q]) return null;
    out = add(out, QTY[q], p);
  }
  for (const [q, p] of spec.den ?? []) {
    if (!QTY[q]) return null;
    out = add(out, QTY[q], -p);
  }
  return out;
}

/** Realistic wrong unit vectors: the other standard quantities first, then exponent slips. */
function wrongVecs(rng: RNG, target: Vec): Vec[] {
  const others = rng.shuffle(Object.keys(QTY)).map((k) => QTY[k]);
  const slips: Vec[] = [];
  for (let i = 0; i < 4; i++) {
    for (const d of [1, -1]) {
      const v = target.slice() as Vec;
      v[i] += d;
      slips.push(v);
    }
  }
  const swapped = [target[0], target[2], target[1], target[3]] as Vec;
  const negated = [target[0], target[1], -target[2], target[3]] as Vec;
  const all = [...others, negated, swapped, ...rng.shuffle(slips)].filter(
    (v) => !sameVec(v, target) && v.every((e) => Math.abs(e) <= 4) && v.some((e) => e !== 0),
  );
  // a unit nothing like the answer gives the game away: offer the near misses first
  const dist = (v: Vec) => v.reduce((s, e, i) => s + Math.abs(e - target[i]), 0);
  return [...all.filter((v) => dist(v) <= 3), ...all.filter((v) => dist(v) > 3)];
}

function vecOptions(rng: RNG, target: Vec, extras: Vec[] = []): Option[] | null {
  const seen: Vec[] = [target];
  const wrongs: string[] = [];
  for (const w of [...extras, ...wrongVecs(rng, target)]) {
    if (wrongs.length >= 4) break;
    if (seen.some((s) => sameVec(s, w))) continue;
    seen.push(w);
    wrongs.push(vecTex(w));
  }
  if (wrongs.length < 4) return null;
  return buildChoiceOptions(rng, vecTex(target), wrongs);
}

function finish(options: Option[], solution: string, trap: string, tags: string[], params: Record<string, unknown>): Generated {
  const correct = options.find((o) => o.correct)!.display;
  return {
    stem: '',
    answer: { kind: 'choice', value: correct },
    options,
    solution,
    trap,
    tags,
    params,
    typedAllowed: false,
  };
}

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

// ----------------------------------------------------------------------------- level 1

const L1_QUANTITIES: { q: string; name: string; unit: string; note: string }[] = [
  { q: 'force', name: 'force', unit: 'the newton', note: '$F = ma$, so $\\text{N} = \\text{kg} \\times \\text{m s}^{-2}$' },
  { q: 'energy', name: 'energy', unit: 'the joule', note: '$W = Fd$, so $\\text{J} = \\text{N m} = \\text{kg m}^{2}\\text{s}^{-2}$' },
  { q: 'power', name: 'power', unit: 'the watt', note: '$P = E/t$, so $\\text{W} = \\text{J s}^{-1} = \\text{kg m}^{2}\\text{s}^{-3}$' },
  { q: 'pressure', name: 'pressure', unit: 'the pascal', note: '$p = F/A$, so $\\text{Pa} = \\text{N m}^{-2} = \\text{kg m}^{-1}\\text{s}^{-2}$' },
  { q: 'momentum', name: 'momentum', unit: 'the newton second', note: '$p = mv$, so the units are $\\text{kg} \\times \\text{m s}^{-1}$' },
  { q: 'charge', name: 'electric charge', unit: 'the coulomb', note: '$Q = It$, so $\\text{C} = \\text{A s}$' },
  { q: 'density', name: 'density', unit: 'the unit of density', note: '$\\rho = m/V$, so the units are $\\text{kg m}^{-3}$' },
];

function baseUnitsQ(rng: RNG): Generated | null {
  const item = rng.pick(L1_QUANTITIES);
  const target = QTY[item.q];
  const options = vecOptions(rng, target);
  if (!options) return null;
  const g = finish(
    options,
    `${item.note}, i.e. ${vecTex(target)}.`,
    'Writing N, J or W is not an answer in base units: every derived unit has to be broken down into kg, m, s and A.',
    ['units', 'base units', item.q],
    { shape: 'vec', spec: { num: [[item.q, 1]] } },
  );
  return { ...g, stem: `Which of the following gives ${item.unit === 'the unit of density' ? 'the SI base units of density' : `the SI base units of ${item.name}`}?` };
}

// ----------------------------------------------------------------------------- level 2

const CONSTANTS: { sym: string; eq: string; where: string; spec: Spec; note: string }[] = [
  {
    sym: 'k', eq: 'F = kx', where: '$F$ is a force and $x$ is an extension',
    spec: { num: [['force', 1]], den: [['length', 1]] },
    note: '$k = F/x$, so the units are $\\text{N m}^{-1} = \\text{kg s}^{-2}$',
  },
  {
    sym: 'G', eq: 'F = \\dfrac{G m_1 m_2}{r^{2}}', where: '$F$ is a force, $m_1$ and $m_2$ are masses and $r$ is a distance',
    spec: { num: [['force', 1], ['length', 2]], den: [['mass', 2]] },
    note: '$G = Fr^{2}/(m_1 m_2)$, so the units are $\\text{N m}^{2}\\text{kg}^{-2} = \\text{m}^{3}\\text{kg}^{-1}\\text{s}^{-2}$',
  },
  {
    sym: 'h', eq: 'E = hf', where: '$E$ is an energy and $f$ is a frequency',
    spec: { num: [['energy', 1]], den: [['freq', 1]] },
    note: '$h = E/f$, so the units are $\\text{J s} = \\text{kg m}^{2}\\text{s}^{-1}$',
  },
  {
    sym: 'b', eq: 'F = bv', where: '$F$ is a drag force and $v$ is a speed',
    spec: { num: [['force', 1]], den: [['speed', 1]] },
    note: '$b = F/v$, so the units are $\\text{N s m}^{-1} = \\text{kg s}^{-1}$',
  },
  {
    sym: '\\eta', eq: 'F = 6\\pi \\eta r v', where: '$F$ is a force, $r$ is a radius and $v$ is a speed',
    spec: { num: [['force', 1]], den: [['length', 1], ['speed', 1]] },
    note: '$\\eta = F/(6\\pi r v)$ and $6\\pi$ has no units, so the units are $\\text{kg m}^{-1}\\text{s}^{-1}$',
  },
  {
    sym: 'c', eq: 'E = mc^{2}', where: '$E$ is an energy and $m$ is a mass',
    spec: { num: [['energy', 1], ['mass', -1]] },
    note: '$c^{2} = E/m$, so $c$ has the units of a speed, $\\text{m s}^{-1}$',
  },
];

function constantUnitsQ(rng: RNG): Generated | null {
  const item = rng.pick(CONSTANTS);
  let spec = item.spec;
  if (item.sym === 'c') spec = { num: [['speed', 1]] }; // c² = E/m, so c itself is a speed
  const target = specVec(spec)!;
  const options = vecOptions(rng, target);
  if (!options) return null;
  const g = finish(
    options,
    `${item.note}, i.e. ${vecTex(target)}.`,
    'Rearrange for the constant first, then replace every quantity by its base units — numbers such as 6π carry none.',
    ['units', 'base units', 'constants'],
    { shape: 'vec', spec },
  );
  return { ...g, stem: `In the equation $${item.eq}$, ${item.where}.\n\nWhich of the following gives the SI base units of $${item.sym}$?` };
}

// ----------------------------------------------------------------------------- level 3

const ODD_SETS: { q: string; name: string; right: string[]; odd: { display: string; why: string }[] }[] = [
  {
    q: 'energy', name: 'energy',
    right: ['$\\text{J}$', '$\\text{N}\\,\\text{m}$', '$\\text{W}\\,\\text{s}$', '$\\text{kg}\\,\\text{m}^{2}\\,\\text{s}^{-2}$', '$\\text{Pa}\\,\\text{m}^{3}$'],
    odd: [
      { display: '$\\text{N}\\,\\text{s}$', why: 'N s is momentum (an impulse), not energy' },
      { display: '$\\text{kg}\\,\\text{m}\\,\\text{s}^{-2}$', why: 'that is a force, one power of m short' },
      { display: '$\\text{J}\\,\\text{s}^{-1}$', why: 'that is a power, not an energy' },
    ],
  },
  {
    q: 'power', name: 'power',
    right: ['$\\text{W}$', '$\\text{J}\\,\\text{s}^{-1}$', '$\\text{N}\\,\\text{m}\\,\\text{s}^{-1}$', '$\\text{kg}\\,\\text{m}^{2}\\,\\text{s}^{-3}$', '$\\text{V}\\,\\text{A}$'],
    odd: [
      { display: '$\\text{J}$', why: 'that is an energy: a power is an energy per second' },
      { display: '$\\text{W}\\,\\text{s}$', why: 'W s is an energy (a joule), not a power' },
      { display: '$\\text{kg}\\,\\text{m}^{2}\\,\\text{s}^{-2}$', why: 'that is an energy, one power of s short' },
    ],
  },
  {
    q: 'force', name: 'force',
    right: ['$\\text{N}$', '$\\text{kg}\\,\\text{m}\\,\\text{s}^{-2}$', '$\\text{J}\\,\\text{m}^{-1}$', '$\\text{Pa}\\,\\text{m}^{2}$'],
    odd: [
      { display: '$\\text{kg}\\,\\text{m}\\,\\text{s}^{-1}$', why: 'that is a momentum, not a force' },
      { display: '$\\text{N}\\,\\text{m}$', why: 'N m is a moment or an energy, not a force' },
      { display: '$\\text{J}\\,\\text{m}$', why: 'dividing by the length is what gives a force, not multiplying' },
    ],
  },
  {
    q: 'pressure', name: 'pressure',
    right: ['$\\text{Pa}$', '$\\text{N}\\,\\text{m}^{-2}$', '$\\text{J}\\,\\text{m}^{-3}$', '$\\text{kg}\\,\\text{m}^{-1}\\,\\text{s}^{-2}$', '$\\text{W}\\,\\text{s}\\,\\text{m}^{-3}$'],
    odd: [
      { display: '$\\text{N}\\,\\text{m}^{-1}$', why: 'that is a force per length (a spring constant), not a pressure' },
      { display: '$\\text{J}\\,\\text{m}^{-2}$', why: 'an energy per area is not a pressure — energy per volume is' },
      { display: '$\\text{N}\\,\\text{m}^{2}$', why: 'the area divides, it does not multiply' },
    ],
  },
  {
    q: 'momentum', name: 'momentum',
    right: ['$\\text{N}\\,\\text{s}$', '$\\text{kg}\\,\\text{m}\\,\\text{s}^{-1}$', '$\\text{J}\\,\\text{s}\\,\\text{m}^{-1}$', '$\\text{Pa}\\,\\text{m}^{2}\\,\\text{s}$', '$\\text{W}\\,\\text{s}^{2}\\,\\text{m}^{-1}$'],
    odd: [
      { display: '$\\text{kg}\\,\\text{m}\\,\\text{s}^{-2}$', why: 'that is a force: momentum has one power of s more' },
      { display: '$\\text{N}\\,\\text{m}\\,\\text{s}^{-1}$', why: 'that is a power, not a momentum' },
      { display: '$\\text{J}\\,\\text{s}$', why: 'an energy times a time is not a momentum — it needs dividing by a length' },
    ],
  },
];

const ODD_PHRASINGS = [
  (name: string) => `Which of the following is NOT a unit of ${name}?`,
  (name: string) => `Four of the following five are units of ${name}. Which one is not?`,
];

function oddOneOutQ(rng: RNG): Generated | null {
  const set = rng.pick(ODD_SETS);
  const odd = rng.pick(set.odd);
  const right = rng.pickDistinct(set.right, 4);
  const options = buildChoiceOptions(rng, odd.display, right);
  const g = finish(
    options,
    `In base units a ${set.name} is ${vecTex(QTY[set.q])}; every other option reduces to that, but ${odd.display} does not — ${odd.why}.`,
    'Pressure and energy density share the same units, and N m is an energy: reduce every option to kg, m and s before deciding.',
    ['units', 'base units', 'odd one out'],
    { shape: 'odd', quantity: set.q },
  );
  return { ...g, stem: rng.pick(ODD_PHRASINGS)(set.name) };
}

// ----------------------------------------------------------------------------- level 4

const COMBOS: { expr: string; where: string; spec: Spec; note: string }[] = [
  {
    expr: 'Q = \\rho v^{2} L', where: '$\\rho$ is a density, $v$ is a speed and $L$ is a length',
    spec: { num: [['density', 1], ['speed', 2], ['length', 1]] },
    note: '$[\\rho v^{2} L] = \\text{kg m}^{-3} \\times \\text{m}^{2}\\text{s}^{-2} \\times \\text{m}$',
  },
  {
    expr: 'Q = \\dfrac{1}{2}\\rho v^{2}', where: '$\\rho$ is a density and $v$ is a speed',
    spec: { num: [['density', 1], ['speed', 2]] },
    note: '$[\\rho v^{2}] = \\text{kg m}^{-3} \\times \\text{m}^{2}\\text{s}^{-2}$, the units of a pressure',
  },
  {
    expr: 'Q = \\dfrac{1}{2}k x^{2}', where: '$k$ is a spring constant in $\\text{N m}^{-1}$ and $x$ is an extension',
    spec: { num: [['spring', 1], ['length', 2]] },
    note: '$[kx^{2}] = \\text{kg s}^{-2} \\times \\text{m}^{2}$, the units of an energy',
  },
  {
    expr: 'Q = \\dfrac{mv^{2}}{r}', where: '$m$ is a mass, $v$ is a speed and $r$ is a radius',
    spec: { num: [['mass', 1], ['speed', 2]], den: [['length', 1]] },
    note: '$[mv^{2}/r] = \\text{kg} \\times \\text{m}^{2}\\text{s}^{-2} \\div \\text{m}$, the units of a force',
  },
  {
    expr: 'Q = \\rho g h', where: '$\\rho$ is a density, $g$ is an acceleration and $h$ is a depth',
    spec: { num: [['density', 1], ['accel', 1], ['length', 1]] },
    note: '$[\\rho g h] = \\text{kg m}^{-3} \\times \\text{m s}^{-2} \\times \\text{m}$, the units of a pressure',
  },
];

function comboQ(rng: RNG): Generated | null {
  const item = rng.pick(COMBOS);
  const target = specVec(item.spec)!;
  const options = vecOptions(rng, target);
  if (!options) return null;
  const g = finish(
    options,
    `${item.note} $= ${vecTex(target).replace(/\$/g, '')}$.`,
    'Replace each symbol by its base units and collect the powers; a numerical factor such as ½ changes nothing.',
    ['units', 'base units', 'combination'],
    { shape: 'vec', spec: item.spec },
  );
  return { ...g, stem: `A quantity $Q$ is given by $${item.expr}$, where ${item.where}.\n\nWhich of the following gives the SI base units of $Q$?` };
}

const PROPORTIONS: { intro: string; target: string; symA: string; symB: string; qA: string; qB: string; a: [number, number]; b: [number, number]; note: string }[] = [
  {
    intro: 'The period $T$ of a mass $m$ oscillating on a spring of stiffness $k$ (in $\\text{N m}^{-1}$) satisfies $T \\propto m^{a} k^{b}$.',
    target: 'time', symA: 'm', symB: 'k', qA: 'mass', qB: 'spring', a: [1, 2], b: [-1, 2],
    note: '$[m^{a}k^{b}] = \\text{kg}^{a}(\\text{kg s}^{-2})^{b}$; matching kg gives $a + b = 0$ and matching s gives $-2b = 1$',
  },
  {
    intro: 'The period $T$ of a pendulum of length $L$ in a gravitational field $g$ satisfies $T \\propto L^{a} g^{b}$.',
    target: 'time', symA: 'L', symB: 'g', qA: 'length', qB: 'accel', a: [1, 2], b: [-1, 2],
    note: '$[L^{a}g^{b}] = \\text{m}^{a}(\\text{m s}^{-2})^{b}$; matching m gives $a + b = 0$ and matching s gives $-2b = 1$',
  },
  {
    intro: 'The speed $v$ of a wave on a string of tension $T$ and mass per unit length $\\mu$ satisfies $v \\propto T^{a} \\mu^{b}$.',
    target: 'speed', symA: 'T', symB: '\\mu', qA: 'force', qB: 'linearDensity', a: [1, 2], b: [-1, 2],
    note: '$[T^{a}\\mu^{b}] = (\\text{kg m s}^{-2})^{a}(\\text{kg m}^{-1})^{b}$; matching kg gives $a + b = 0$ and matching s gives $-2a = -1$',
  },
];

const fracTex = (p: [number, number]): string => {
  const [nu, de] = p;
  if (de === 1) return `${nu}`;
  return `${nu < 0 ? '-' : ''}\\tfrac{${Math.abs(nu)}}{${de}}`;
};
const pairTex = (a: [number, number], b: [number, number]): string => `$a = ${fracTex(a)},\\ b = ${fracTex(b)}$`;

function proportionQ(rng: RNG): Generated | null {
  const item = rng.pick(PROPORTIONS);
  const correct = pairTex(item.a, item.b);
  const wrongPairs: [[number, number], [number, number]][] = [
    [item.b, item.a],
    [[-item.a[0], item.a[1]], [-item.b[0], item.b[1]]],
    [[1, 1], [-1, 1]],
    [[1, 2], [1, 2]],
    [[-1, 2], [-1, 2]],
    [[1, 1], [1, 1]],
  ];
  const seen = new Set([correct]);
  const wrongs: string[] = [];
  const pairs: { display: string; a: [number, number]; b: [number, number] }[] = [{ display: correct, a: item.a, b: item.b }];
  for (const [a, b] of wrongPairs) {
    if (wrongs.length >= 4) break;
    const d = pairTex(a, b);
    if (seen.has(d)) continue;
    seen.add(d);
    wrongs.push(d);
    pairs.push({ display: d, a, b });
  }
  if (wrongs.length < 4) return null;
  const options = buildChoiceOptions(rng, correct, wrongs);
  const g = finish(
    options,
    `${item.note}, so $a = ${fracTex(item.a)}$ and $b = ${fracTex(item.b)}$.`,
    'Match the powers of kg, m and s separately: two equations fix a and b, and a square root means a power of ½.',
    ['units', 'dimensional analysis', 'proportion'],
    { shape: 'ab', target: item.target, qA: item.qA, qB: item.qB, pairs },
  );
  return { ...g, stem: `${item.intro}\n\nWhich of the following gives $a$ and $b$?` };
}

// ----------------------------------------------------------------------------- level 5

interface ExprOption { display: string; factors: [string, number, number][] }

const CONSISTENCY: { intro: string; lhs: string; correct: ExprOption; wrong: ExprOption[]; note: string }[] = [
  {
    intro: '$v$ is a speed, $g$ is an acceleration and $L$ is a length.',
    lhs: 'speed',
    correct: { display: '$v = \\sqrt{gL}$', factors: [['accel', 1, 2], ['length', 1, 2]] },
    wrong: [
      { display: '$v = gL$', factors: [['accel', 1, 1], ['length', 1, 1]] },
      { display: '$v = \\sqrt{\\dfrac{g}{L}}$', factors: [['accel', 1, 2], ['length', -1, 2]] },
      { display: '$v = \\dfrac{g}{L}$', factors: [['accel', 1, 1], ['length', -1, 1]] },
      { display: '$v = \\sqrt{\\dfrac{L}{g}}$', factors: [['length', 1, 2], ['accel', -1, 2]] },
      { display: '$v = gL^{2}$', factors: [['accel', 1, 1], ['length', 2, 1]] },
    ],
    note: '$[\\sqrt{gL}] = (\\text{m s}^{-2} \\times \\text{m})^{1/2} = \\text{m s}^{-1}$',
  },
  {
    intro: '$T$ is a time, $m$ is a mass and $k$ is a spring constant in $\\text{N m}^{-1}$.',
    lhs: 'time',
    correct: { display: '$T = \\sqrt{\\dfrac{m}{k}}$', factors: [['mass', 1, 2], ['spring', -1, 2]] },
    wrong: [
      { display: '$T = \\sqrt{\\dfrac{k}{m}}$', factors: [['spring', 1, 2], ['mass', -1, 2]] },
      { display: '$T = \\dfrac{m}{k}$', factors: [['mass', 1, 1], ['spring', -1, 1]] },
      { display: '$T = mk$', factors: [['mass', 1, 1], ['spring', 1, 1]] },
      { display: '$T = \\sqrt{mk}$', factors: [['mass', 1, 2], ['spring', 1, 2]] },
      { display: '$T = \\dfrac{k}{m}$', factors: [['spring', 1, 1], ['mass', -1, 1]] },
    ],
    note: '$[\\sqrt{m/k}] = (\\text{kg} \\div \\text{kg s}^{-2})^{1/2} = \\text{s}$',
  },
  {
    intro: '$E$ is an energy, $m$ is a mass, $v$ is a speed and $h$ is a height in a field $g$.',
    lhs: 'energy',
    correct: { display: '$E = \\tfrac12 m v^{2}$', factors: [['mass', 1, 1], ['speed', 2, 1]] },
    wrong: [
      { display: '$E = \\tfrac12 m v$', factors: [['mass', 1, 1], ['speed', 1, 1]] },
      { display: '$E = m v^{2} h$', factors: [['mass', 1, 1], ['speed', 2, 1], ['length', 1, 1]] },
      { display: '$E = \\dfrac{mv^{2}}{h}$', factors: [['mass', 1, 1], ['speed', 2, 1], ['length', -1, 1]] },
      { display: '$E = m g$', factors: [['mass', 1, 1], ['accel', 1, 1]] },
      { display: '$E = \\dfrac{1}{2} m^{2} v$', factors: [['mass', 2, 1], ['speed', 1, 1]] },
    ],
    note: '$[mv^{2}] = \\text{kg} \\times \\text{m}^{2}\\text{s}^{-2} = \\text{J}$, and the $\\tfrac12$ has no units',
  },
];

function consistencyQ(rng: RNG): Generated | null {
  const item = rng.pick(CONSISTENCY);
  const wrongs = rng.pickDistinct(item.wrong, 4);
  const options = buildChoiceOptions(rng, item.correct.display, wrongs.map((w) => w.display));
  const g = finish(
    options,
    `${item.note}, which matches the left-hand side; each of the others has the wrong powers.`,
    'A square root halves every power: check the units of both sides before trusting a formula.',
    ['units', 'dimensional analysis', 'consistency'],
    { shape: 'expr', lhs: item.lhs, exprs: [item.correct, ...wrongs] },
  );
  return { ...g, stem: `Which of the following equations is dimensionally consistent, given that ${item.intro}\n\n(Numerical factors have no units.)` };
}

const GRAPHS: { y: string; yName: string; x: string; xName: string; op: 'gradient' | 'area'; note: string }[] = [
  { y: 'force', yName: 'force', x: 'length', xName: 'extension', op: 'gradient', note: 'the gradient is a force divided by a length' },
  { y: 'force', yName: 'force', x: 'length', xName: 'extension', op: 'area', note: 'the area is a force times a length, i.e. work done' },
  { y: 'speed', yName: 'velocity', x: 'time', xName: 'time', op: 'gradient', note: 'the gradient is a velocity divided by a time, i.e. an acceleration' },
  { y: 'speed', yName: 'velocity', x: 'time', xName: 'time', op: 'area', note: 'the area is a velocity times a time, i.e. a displacement' },
  { y: 'force', yName: 'force', x: 'time', xName: 'time', op: 'area', note: 'the area is a force times a time, i.e. an impulse' },
  { y: 'power', yName: 'power', x: 'time', xName: 'time', op: 'area', note: 'the area is a power times a time, i.e. an energy' },
  { y: 'voltage', yName: 'potential difference', x: 'current', xName: 'current', op: 'gradient', note: 'the gradient is a potential difference divided by a current, i.e. a resistance' },
];

function graphQ(rng: RNG): Generated | null {
  const item = rng.pick(GRAPHS);
  const spec: Spec = item.op === 'gradient' ? { num: [[item.y, 1]], den: [[item.x, 1]] } : { num: [[item.y, 1], [item.x, 1]] };
  const target = specVec(spec)!;
  const options = vecOptions(rng, target, [specVec(item.op === 'gradient' ? { num: [[item.y, 1], [item.x, 1]] } : { num: [[item.y, 1]], den: [[item.x, 1]] })!]);
  if (!options) return null;
  const g = finish(
    options,
    `For this graph ${item.note}, so the units are ${vecTex(target)}.`,
    'A gradient divides the y-units by the x-units and an area multiplies them: mixing the two is the usual slip.',
    ['units', 'graphs', item.op],
    { shape: 'vec', spec },
  );
  return {
    ...g,
    stem: `A graph of ${item.yName} (on the vertical axis) against ${item.xName} (on the horizontal axis) is drawn for an experiment.\n\nWhich of the following gives the SI base units of the ${item.op === 'gradient' ? 'gradient of the graph' : 'area under the graph'}?`,
  };
}

// ----------------------------------------------------------------------------- assembly

const VARIANTS: Record<Level, ((rng: RNG) => Generated | null)[]> = {
  1: [baseUnitsQ],
  2: [constantUnitsQ],
  3: [oddOneOutQ],
  4: [comboQ, comboQ, proportionQ],
  5: [consistencyQ, graphQ, graphQ],
};

export default defineTemplate({
  id: 'phy.units.dimensional-analysis',
  module: 'PHY',
  topic: 'units',
  title: 'Units of a quantity and dimensional checks',
  levels: {
    1: 'SI base units of force, energy, power, pressure, momentum, charge',
    2: 'base units of a constant read off a formula: k in F = kx, G in F = Gm₁m₂/r², h in E = hf',
    3: 'which unit is NOT a unit of energy / power / force / pressure',
    4: 'base units of ρv²L, ½kx², mv²/r; the powers a and b in T ∝ mᵃkᵇ',
    5: 'which formula is dimensionally consistent; the units of a graph’s gradient or area',
  },
  generate(rng, level: Level) {
    return retry(rng, () => pickVariant(rng, VARIANTS[level]));
  },
  verify(q) {
    if (q.answer.kind !== 'choice' || q.typedAllowed) return false;
    const p = q.params as { shape: string; spec?: Spec; quantity?: string; target?: string; qA?: string; qB?: string; pairs?: { display: string; a: [number, number]; b: [number, number] }[]; lhs?: string; exprs?: ExprOption[] };
    const correct = q.options.filter((o) => o.correct);
    if (correct.length !== 1 || correct[0].display !== q.answer.value) return false;

    if (p.shape === 'vec' || p.shape === 'odd') {
      const target = p.shape === 'vec' ? specVec(p.spec!) : QTY[p.quantity ?? ''];
      if (!target) return false;
      // parse every option's units back into an exponent vector
      const vecs = q.options.map((o) => texToVec(o.display));
      if (vecs.some((v) => v === null)) return false;
      const matches = q.options.filter((_o, i) => sameVec(vecs[i]!, target));
      if (p.shape === 'vec') return matches.length === 1 && matches[0].correct;
      // 'odd': exactly one option must NOT have the target units, and that is the answer
      const misfits = q.options.filter((_o, i) => !sameVec(vecs[i]!, target));
      return matches.length === q.options.length - 1 && misfits.length === 1 && misfits[0].correct;
    }

    if (p.shape === 'ab') {
      const target = QTY[p.target ?? ''];
      const A = QTY[p.qA ?? ''], B = QTY[p.qB ?? ''];
      if (!target || !A || !B || !p.pairs) return false;
      let good = 0;
      for (const o of q.options) {
        const pair = p.pairs.find((x) => x.display === o.display);
        if (!pair) return false;
        const v = add(add([0, 0, 0, 0], A, pair.a[0] / pair.a[1]), B, pair.b[0] / pair.b[1]);
        if (sameVec(v, target)) {
          good++;
          if (!o.correct) return false;
        }
      }
      return good === 1;
    }

    if (p.shape === 'expr') {
      const target = QTY[p.lhs ?? ''];
      if (!target || !p.exprs) return false;
      let good = 0;
      for (const o of q.options) {
        const e = p.exprs.find((x) => x.display === o.display);
        if (!e) return false;
        let v: Vec = [0, 0, 0, 0];
        for (const [sym, nu, de] of e.factors) {
          if (!QTY[sym]) return false;
          v = add(v, QTY[sym], nu / de);
        }
        if (sameVec(v, target)) {
          good++;
          if (!o.correct) return false;
        }
      }
      return good === 1;
    }
    return false;
  },
});
