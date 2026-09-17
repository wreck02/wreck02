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
 * Level 5: which formula is dimensionally consistent — including equations with two terms added, where
 *          every term has to match (v = u + at against v = u + at²); the units of the gradient of a
 *          harder graph (p against depth, E against v², T² against L, V against I)
 *
 * Every distractor carries the mistake it comes from: "these are the units of an energy", "one power of
 * m too many", "the two powers the wrong way round", "N m is an energy, not a force". The level-4
 * proportion and the level-5 consistency questions draw both the relation and which symbol is called
 * `a`, so the correct answer is not the same pair (or the same equation) every time.
 *
 * Options never offer an ampere for a purely mechanical quantity: nobody picks "kg m s^-3 A^-1" for the
 * units of a force, so it would waste one of the five slots.
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
  resistance: [1, 2, -3, -2],
  resistivity: [1, 3, -3, -2],
};

/** How a wrong unit vector is named when it happens to be a standard quantity. */
const QTY_NAME: Record<string, string> = {
  mass: 'a mass', length: 'a length', time: 'a time', current: 'a current',
  area: 'an area', volume: 'a volume', speed: 'a speed', accel: 'an acceleration',
  force: 'a force', energy: 'an energy', power: 'a power', pressure: 'a pressure',
  density: 'a density', momentum: 'a momentum', spring: 'a spring constant',
  freq: 'a frequency', charge: 'a charge', voltage: 'a potential difference',
  linearDensity: 'a mass per unit length', resistance: 'a resistance', resistivity: 'a resistivity',
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

/** A wrong unit vector together with the mistake it represents. */
interface WrongVec { v: Vec; trap: string }

const SYM_TEX = (i: number) => `$\\text{${BASE_SYMS[i]}}$`;

/**
 * Realistic wrong unit vectors, most plausible first.
 *
 * `near` names the quantities a candidate actually confuses with this one (momentum with force,
 * energy with power); after those come exponent slips and then the remaining quantities, closest
 * first. Two rules keep every option one somebody could have written: a slip is only applied to
 * kg, m and s (and to the ampere only when the target already has one), and no option may contain
 * an A unless the quantity is electrical — "kg m⁻³ A" is a density with an ampere bolted on, which
 * is struck out on sight and wastes a slot.
 */
function wrongVecs(rng: RNG, target: Vec, near: string[] = []): WrongVec[] {
  const electrical = target[3] !== 0;
  const named = (k: string): WrongVec => ({ v: QTY[k], trap: `these are the units of ${QTY_NAME[k]}` });
  const nearMisses: WrongVec[] = rng.shuffle(near.filter((k) => QTY[k])).map(named);
  const others: WrongVec[] = rng.shuffle(Object.keys(QTY).filter((k) => !near.includes(k))).map(named);
  const slips: WrongVec[] = [];
  for (const i of electrical ? [0, 1, 2, 3] : [0, 1, 2]) {
    for (const d of [1, -1]) {
      const v = target.slice() as Vec;
      v[i] += d;
      slips.push({ v, trap: `one power of ${SYM_TEX(i)} too ${d > 0 ? 'many' : 'few'}` });
    }
  }
  const swapped: WrongVec = { v: [target[0], target[2], target[1], target[3]] as Vec, trap: 'the powers of $\\text{m}$ and $\\text{s}$ swapped' };
  const negated: WrongVec = { v: [target[0], target[1], -target[2], target[3]] as Vec, trap: 'the sign of the $\\text{s}$ power flipped: multiplied by a time instead of dividing' };
  const ok = (w: WrongVec) => !sameVec(w.v, target) && w.v.every((e) => Math.abs(e) <= 4) && w.v.some((e) => e !== 0) && (electrical || w.v[3] === 0);
  const dist = (v: Vec) => v.reduce((s, e, i) => s + Math.abs(e - target[i]), 0);
  // a unit nothing like the answer gives the game away: offer the named confusions, then the near misses
  const rest = [negated, swapped, ...rng.shuffle(slips), ...others].filter(ok);
  return [...nearMisses.filter(ok), ...rest.slice().sort((a, b) => dist(a.v) - dist(b.v))];
}

function vecOptions(rng: RNG, target: Vec, extras: WrongVec[] = [], near: string[] = []): Option[] | null {
  const seen: Vec[] = [target];
  const wrongs: { display: string; trap: string }[] = [];
  for (const w of [...extras, ...wrongVecs(rng, target, near)]) {
    if (wrongs.length >= 4) break;
    if (seen.some((s) => sameVec(s, w.v))) continue;
    seen.push(w.v);
    wrongs.push({ display: vecTex(w.v), trap: w.trap });
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

/**
 * `near` lists the quantities a candidate really does confuse with this one, so the option list
 * holds force-against-momentum rather than an arbitrary area; `trap` names the confusion the
 * options were built from, instead of a mistake no option in the instance shows.
 */
const L1_QUANTITIES: { q: string; name: string; unit: string; note: string; near: string[]; trap: string }[] = [
  {
    q: 'force', name: 'force', unit: 'the newton', note: '$F = ma$, so $\\text{N} = \\text{kg} \\times \\text{m s}^{-2}$',
    near: ['momentum', 'energy', 'spring', 'pressure', 'accel', 'mass'],
    trap: 'A force and a momentum differ by one power of s (kg m s⁻² against kg m s⁻¹), and a force times a distance is an energy.',
  },
  {
    q: 'energy', name: 'energy', unit: 'the joule', note: '$W = Fd$, so $\\text{J} = \\text{N m} = \\text{kg m}^{2}\\text{s}^{-2}$',
    near: ['power', 'force', 'momentum', 'pressure', 'spring'],
    trap: 'An energy and a power differ by one power of s, and an energy and a force by one power of m: count both.',
  },
  {
    q: 'power', name: 'power', unit: 'the watt', note: '$P = E/t$, so $\\text{W} = \\text{J s}^{-1} = \\text{kg m}^{2}\\text{s}^{-3}$',
    near: ['energy', 'force', 'pressure', 'momentum', 'speed'],
    trap: 'A power is an energy per second: kg m² s⁻³, one power of s further than the joule.',
  },
  {
    q: 'pressure', name: 'pressure', unit: 'the pascal', note: '$p = F/A$, so $\\text{Pa} = \\text{N m}^{-2} = \\text{kg m}^{-1}\\text{s}^{-2}$',
    near: ['force', 'energy', 'spring', 'density', 'linearDensity'],
    trap: 'A pressure is a force divided by an area, so the newton loses two powers of m, not one (that would be a spring constant).',
  },
  {
    q: 'momentum', name: 'momentum', unit: 'the newton second', note: '$p = mv$, so the units are $\\text{kg} \\times \\text{m s}^{-1}$',
    near: ['force', 'energy', 'speed', 'mass', 'spring'],
    trap: 'Momentum is mass × velocity: kg m s⁻¹. A force (kg m s⁻²) has one power of s more in the denominator.',
  },
  {
    q: 'charge', name: 'electric charge', unit: 'the coulomb', note: '$Q = It$, so $\\text{C} = \\text{A s}$',
    near: ['current', 'time', 'voltage'],
    trap: 'A coulomb is an ampere second: the ampere is the base unit, the coulomb is derived from it.',
  },
  {
    q: 'density', name: 'density', unit: 'the unit of density', note: '$\\rho = m/V$, so the units are $\\text{kg m}^{-3}$',
    near: ['linearDensity', 'mass', 'pressure', 'volume', 'spring'],
    trap: 'Density is mass per unit volume, so the m power is −3; mass per unit length (kg m⁻¹) is a different quantity.',
  },
  {
    q: 'speed', name: 'speed', unit: 'the unit of speed', note: '$v = d/t$, so the units are $\\text{m s}^{-1}$',
    near: ['accel', 'length', 'time', 'freq', 'area'],
    trap: 'A speed is a distance per second (m s⁻¹); dividing by the time twice gives an acceleration.',
  },
  {
    q: 'accel', name: 'acceleration', unit: 'the unit of acceleration', note: '$a = \\Delta v/\\Delta t$, so the units are $\\text{m s}^{-2}$',
    near: ['speed', 'force', 'freq', 'length', 'spring'],
    trap: 'An acceleration is a change of velocity per second: m s⁻², with no kilogram in it — that would be a force.',
  },
  {
    q: 'freq', name: 'frequency', unit: 'the hertz', note: '$f = 1/T$, so $\\text{Hz} = \\text{s}^{-1}$',
    near: ['time', 'speed', 'accel', 'length'],
    trap: 'A frequency is one over a time: s⁻¹, the reciprocal of the period, with no metres in it.',
  },
  {
    q: 'resistance', name: 'electrical resistance', unit: 'the ohm', note: '$R = V/I$, so $\\Omega = \\text{V A}^{-1} = \\text{kg m}^{2}\\text{s}^{-3}\\text{A}^{-2}$',
    near: ['voltage', 'power', 'charge', 'current'],
    trap: 'Dividing the volt by the ampere gives a second A⁻¹: kg m² s⁻³ A⁻², not the A⁻¹ of the volt.',
  },
  {
    q: 'voltage', name: 'potential difference', unit: 'the volt', note: '$V = P/I$, so $\\text{V} = \\text{W A}^{-1} = \\text{kg m}^{2}\\text{s}^{-3}\\text{A}^{-1}$',
    near: ['power', 'energy', 'charge', 'resistance'],
    trap: 'A volt is a joule per coulomb — a watt per ampere — so it carries A⁻¹, not A.',
  },
  {
    q: 'accel', name: 'gravitational field strength', unit: 'the unit of gravitational field strength',
    note: '$g = F/m$, so the units are $\\text{N kg}^{-1} = \\text{m s}^{-2}$ — the units of an acceleration',
    near: ['force', 'speed', 'freq', 'spring', 'length'],
    trap: 'Field strength is force per unit mass: the kilograms cancel, leaving m s⁻², not N (kg m s⁻²).',
  },
  {
    q: 'energy', name: 'the moment of a force', unit: 'the newton metre',
    note: 'a moment is a force times a perpendicular distance, so the units are $\\text{N m} = \\text{kg m}^{2}\\text{s}^{-2}$',
    near: ['force', 'power', 'momentum', 'pressure', 'spring'],
    trap: 'A moment is a force × a distance, so it has one power of m more than the newton (and the same units as an energy).',
  },
  {
    q: 'momentum', name: 'impulse', unit: 'the newton second',
    note: 'an impulse is a force times a time, so the units are $\\text{N s} = \\text{kg m s}^{-1}$',
    near: ['force', 'energy', 'speed', 'mass', 'spring'],
    trap: 'Impulse = force × time, so the newton gains one power of s: kg m s⁻¹, the units of momentum.',
  },
  {
    q: 'linearDensity', name: 'the mass per unit length of a wire', unit: 'the unit of mass per unit length',
    note: '$\\mu = m/L$, so the units are $\\text{kg m}^{-1}$',
    near: ['density', 'mass', 'spring', 'pressure', 'length'],
    trap: 'Mass per unit length divides by one power of m, not three: kg m⁻³ is a density.',
  },
];

/**
 * Two ways of asking, chosen from the content rather than at random, so a re-wording always comes
 * with a different quantity: asking the same question twice in a session in two guises is worse
 * than asking it once.
 */
function phrasing<T>(key: string, options: T[]): T {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return options[h % options.length];
}

function baseUnitsQ(rng: RNG): Generated | null {
  const item = rng.pick(L1_QUANTITIES);
  const target = QTY[item.q];
  const options = vecOptions(rng, target, [], item.near);
  if (!options) return null;
  const g = finish(
    options,
    `${item.note}, i.e. ${vecTex(target)}.`,
    item.trap,
    ['units', 'base units', item.q],
    { shape: 'vec', spec: { num: [[item.q, 1]] } },
  );
  const named = !item.unit.startsWith('the unit of');
  const stem = named && phrasing(item.name, [0, 1]) === 1
    ? `${item.unit.charAt(0).toUpperCase()}${item.unit.slice(1)} is the SI unit of ${item.name}. Which of the following gives it in SI base units?`
    : `Which of the following gives the SI base units of ${item.name}?`;
  return { ...g, stem };
}

// ----------------------------------------------------------------------------- level 2

const CONSTANTS: { sym: string; eq: string; where: string; spec: Spec; note: string; near: string[]; trap: string }[] = [
  {
    sym: 'k', eq: 'F = kx', where: '$F$ is a force and $x$ is an extension',
    spec: { num: [['force', 1]], den: [['length', 1]] },
    note: '$k = F/x$, so the units are $\\text{N m}^{-1} = \\text{kg s}^{-2}$',
    near: ['force', 'pressure', 'energy', 'accel', 'momentum'],
    trap: 'Dividing the newton by a length removes one power of m: kg s⁻², not kg m s⁻² (that is the force itself).',
  },
  {
    sym: 'G', eq: 'F = \\dfrac{G m_1 m_2}{r^{2}}', where: '$F$ is a force, $m_1$ and $m_2$ are masses and $r$ is a distance',
    spec: { num: [['force', 1], ['length', 2]], den: [['mass', 2]] },
    note: '$G = Fr^{2}/(m_1 m_2)$, so the units are $\\text{N m}^{2}\\text{kg}^{-2} = \\text{m}^{3}\\text{kg}^{-1}\\text{s}^{-2}$',
    near: ['accel', 'force', 'energy', 'density'],
    trap: 'Two masses divide, not one, so the kg power is −1; the r² adds two powers of m to the newton, giving m³.',
  },
  {
    sym: 'h', eq: 'E = hf', where: '$E$ is an energy and $f$ is a frequency',
    spec: { num: [['energy', 1]], den: [['freq', 1]] },
    note: '$h = E/f$, so the units are $\\text{J s} = \\text{kg m}^{2}\\text{s}^{-1}$',
    near: ['energy', 'power', 'momentum', 'force'],
    trap: 'A frequency is s⁻¹, so dividing by it multiplies by a second: J s, one power of s above the joule — not J s⁻¹, which is a watt.',
  },
  {
    sym: 'b', eq: 'F = bv', where: '$F$ is a drag force and $v$ is a speed',
    spec: { num: [['force', 1]], den: [['speed', 1]] },
    note: '$b = F/v$, so the units are $\\text{N s m}^{-1} = \\text{kg s}^{-1}$',
    near: ['spring', 'mass', 'force', 'freq', 'linearDensity'],
    trap: 'Dividing the newton by a speed cancels one m and one s⁻¹: kg s⁻¹, a mass per second, not kg s⁻² (a spring constant).',
  },
  {
    sym: '\\eta', eq: 'F = 6\\pi \\eta r v', where: '$F$ is a force, $r$ is a radius and $v$ is a speed',
    spec: { num: [['force', 1]], den: [['length', 1], ['speed', 1]] },
    note: '$\\eta = F/(6\\pi r v)$ and $6\\pi$ has no units, so the units are $\\text{kg m}^{-1}\\text{s}^{-1}$',
    near: ['pressure', 'density', 'linearDensity', 'spring'],
    trap: 'The 6π carries no units: dividing the newton by a length and a speed leaves kg m⁻¹ s⁻¹, one power of s away from a pressure.',
  },
  {
    sym: 'R', eq: 'V = IR', where: '$V$ is a potential difference and $I$ is a current',
    spec: { num: [['voltage', 1]], den: [['current', 1]] },
    note: '$R = V/I$, so the units are $\\text{V A}^{-1} = \\text{kg m}^{2}\\text{s}^{-3}\\text{A}^{-2}$',
    near: ['voltage', 'power', 'charge', 'current'],
    trap: 'Dividing the volt by the ampere gives a second power of A⁻¹: kg m² s⁻³ A⁻², not the A⁻¹ of the volt itself.',
  },
  {
    sym: 'k', eq: 'P = kv^{3}', where: '$P$ is the power of a wind turbine and $v$ is the wind speed',
    spec: { num: [['power', 1]], den: [['speed', 3]] },
    note: '$k = P/v^{3}$, so the units are $\\text{kg m}^{2}\\text{s}^{-3} \\div \\text{m}^{3}\\text{s}^{-3} = \\text{kg m}^{-1}$',
    near: ['density', 'mass', 'pressure', 'spring'],
    trap: 'The speed is cubed, so three powers of m and three of s⁻¹ divide out: the s powers cancel completely, leaving kg m⁻¹.',
  },
  {
    sym: 'c', eq: 'E = mc^{2}', where: '$E$ is an energy and $m$ is a mass',
    spec: { num: [['energy', 1], ['mass', -1]] },
    note: '$c^{2} = E/m$, so $c$ has the units of a speed, $\\text{m s}^{-1}$',
    near: ['accel', 'energy', 'freq', 'length'],
    trap: 'E/m gives c², not c: take the square root, which halves both powers, to get m s⁻¹.',
  },
  {
    sym: 'E', eq: '\\sigma = E\\varepsilon', where: '$\\sigma$ is a stress (a force per unit area) and $\\varepsilon$ is a strain (a ratio of two lengths)',
    spec: { num: [['pressure', 1]] },
    note: 'a strain is a pure number, so $E$ has the units of a stress: $\\text{N m}^{-2} = \\text{kg m}^{-1}\\text{s}^{-2}$',
    near: ['pressure', 'spring', 'force', 'density', 'energy'],
    trap: 'Strain is a ratio of two lengths and has no units, so the Young modulus has the units of a stress, not of a force.',
  },
  {
    sym: '\\rho', eq: 'R = \\dfrac{\\rho L}{A}', where: '$R$ is a resistance, $L$ is a length and $A$ is an area',
    spec: { num: [['resistance', 1], ['length', 2]], den: [['length', 1]] },
    note: '$\\rho = RA/L$, so the units are $\\Omega\\ \\text{m} = \\text{kg m}^{3}\\text{s}^{-3}\\text{A}^{-2}$',
    near: ['resistance', 'voltage', 'power', 'density'],
    trap: 'The area is on top and the length underneath, so the ohm gains one power of m: Ω m, not Ω m⁻¹.',
  },
  {
    sym: '\\lambda', eq: 'N = N_0 e^{-\\lambda t}', where: '$N$ and $N_0$ are numbers of nuclei and $t$ is a time',
    spec: { num: [['freq', 1]] },
    note: 'the exponent $\\lambda t$ must be a pure number, so $\\lambda$ has the units of $1/t$: $\\text{s}^{-1}$',
    near: ['time', 'freq', 'speed', 'accel'],
    trap: 'Anything in an exponent has no units, so λt is dimensionless and λ is one over a time — a decay constant is not a time.',
  },
  {
    sym: 'k', eq: 'F = \\dfrac{k q_1 q_2}{r^{2}}', where: '$F$ is a force, $q_1$ and $q_2$ are charges and $r$ is a distance',
    spec: { num: [['force', 1], ['length', 2]], den: [['charge', 2]] },
    note: '$k = Fr^{2}/(q_1 q_2)$, so the units are $\\text{kg m}^{3}\\text{s}^{-4}\\text{A}^{-2}$',
    near: ['voltage', 'resistance', 'resistivity', 'force'],
    trap: 'Two charges divide, so the A power is −2 and the two seconds in C = A s push the s power to −4.',
  },
];

function constantUnitsQ(rng: RNG): Generated | null {
  const item = rng.pick(CONSTANTS);
  let spec = item.spec;
  if (item.sym === 'c') spec = { num: [['speed', 1]] }; // c² = E/m, so c itself is a speed
  const target = specVec(spec)!;
  const options = vecOptions(rng, target, [], item.near);
  if (!options) return null;
  const g = finish(
    options,
    `${item.note}, i.e. ${vecTex(target)}.`,
    item.trap,
    ['units', 'base units', 'constants'],
    { shape: 'vec', spec },
  );
  const ask = phrasing(item.eq + item.sym, [
    `Which of the following gives the SI base units of $${item.sym}$?`,
    `What are the SI base units of the constant $${item.sym}$?`,
  ]);
  return { ...g, stem: `In the equation $${item.eq}$, ${item.where}.\n\n${ask}` };
}

// ----------------------------------------------------------------------------- level 3

const ODD_SETS: { q: string; name: string; right: { display: string; why: string }[]; odd: { display: string; why: string }[] }[] = [
  {
    q: 'energy', name: 'energy',
    right: [
      { display: '$\\text{J}$', why: 'the joule is the SI unit of energy' },
      { display: '$\\text{N}\\,\\text{m}$', why: 'a force times a distance is work done, i.e. an energy' },
      { display: '$\\text{W}\\,\\text{s}$', why: 'a power times a time is an energy (a watt second is a joule)' },
      { display: '$\\text{kg}\\,\\text{m}^{2}\\,\\text{s}^{-2}$', why: 'these are the base units of energy, from $\\tfrac12 mv^{2}$' },
      { display: '$\\text{Pa}\\,\\text{m}^{3}$', why: 'a pressure times a volume is an energy' },
    ],
    odd: [
      { display: '$\\text{N}\\,\\text{s}$', why: 'N s is momentum (an impulse), not energy' },
      { display: '$\\text{kg}\\,\\text{m}\\,\\text{s}^{-2}$', why: 'that is a force, one power of m short' },
      { display: '$\\text{J}\\,\\text{s}^{-1}$', why: 'that is a power, not an energy' },
    ],
  },
  {
    q: 'power', name: 'power',
    right: [
      { display: '$\\text{W}$', why: 'the watt is the SI unit of power' },
      { display: '$\\text{J}\\,\\text{s}^{-1}$', why: 'a power is an energy per second' },
      { display: '$\\text{N}\\,\\text{m}\\,\\text{s}^{-1}$', why: 'a force times a speed is a power' },
      { display: '$\\text{kg}\\,\\text{m}^{2}\\,\\text{s}^{-3}$', why: 'these are the base units of power' },
      { display: '$\\text{V}\\,\\text{A}$', why: 'a potential difference times a current is a power' },
    ],
    odd: [
      { display: '$\\text{V}\\,\\text{A}\\,\\text{s}$', why: 'V A is a power, so V A s is an energy (a joule), not a power' },
      { display: '$\\text{J}$', why: 'that is an energy: a power is an energy per second' },
      { display: '$\\text{W}\\,\\text{s}$', why: 'W s is an energy (a joule), not a power' },
      { display: '$\\text{kg}\\,\\text{m}^{2}\\,\\text{s}^{-2}$', why: 'that is an energy, one power of s short' },
    ],
  },
  {
    q: 'force', name: 'force',
    right: [
      { display: '$\\text{N}$', why: 'the newton is the SI unit of force' },
      { display: '$\\text{kg}\\,\\text{m}\\,\\text{s}^{-2}$', why: 'these are the base units of force, from $F = ma$' },
      { display: '$\\text{J}\\,\\text{m}^{-1}$', why: 'an energy per unit distance is a force' },
      { display: '$\\text{Pa}\\,\\text{m}^{2}$', why: 'a pressure times an area is a force' },
    ],
    odd: [
      { display: '$\\text{kg}\\,\\text{m}\\,\\text{s}^{-1}$', why: 'that is a momentum, not a force' },
      { display: '$\\text{N}\\,\\text{m}$', why: 'N m is a moment or an energy, not a force' },
      { display: '$\\text{J}\\,\\text{m}$', why: 'dividing by the length is what gives a force, not multiplying' },
    ],
  },
  {
    q: 'pressure', name: 'pressure',
    right: [
      { display: '$\\text{Pa}$', why: 'the pascal is the SI unit of pressure' },
      { display: '$\\text{N}\\,\\text{m}^{-2}$', why: 'a pressure is a force per unit area' },
      { display: '$\\text{J}\\,\\text{m}^{-3}$', why: 'an energy per unit volume has exactly the units of a pressure' },
      { display: '$\\text{kg}\\,\\text{m}^{-1}\\,\\text{s}^{-2}$', why: 'these are the base units of pressure' },
      { display: '$\\text{W}\\,\\text{s}\\,\\text{m}^{-3}$', why: 'W s is an energy, so this is again an energy per volume' },
    ],
    odd: [
      { display: '$\\text{N}\\,\\text{m}^{-1}$', why: 'that is a force per length (a spring constant), not a pressure' },
      { display: '$\\text{J}\\,\\text{m}^{-2}$', why: 'an energy per area is not a pressure — energy per volume is' },
      { display: '$\\text{N}\\,\\text{m}^{2}$', why: 'the area divides, it does not multiply' },
    ],
  },
  {
    q: 'momentum', name: 'momentum',
    right: [
      { display: '$\\text{N}\\,\\text{s}$', why: 'an impulse, force × time, is a change of momentum' },
      { display: '$\\text{kg}\\,\\text{m}\\,\\text{s}^{-1}$', why: 'these are the base units of momentum, from $p = mv$' },
      { display: '$\\text{J}\\,\\text{s}\\,\\text{m}^{-1}$', why: 'an energy × time ÷ length reduces to kg m s⁻¹' },
      { display: '$\\text{Pa}\\,\\text{m}^{2}\\,\\text{s}$', why: 'Pa m² is a force, and a force × time is a momentum' },
      { display: '$\\text{W}\\,\\text{s}^{2}\\,\\text{m}^{-1}$', why: 'W s² is an energy × time, which ÷ length is a momentum' },
    ],
    odd: [
      { display: '$\\text{kg}\\,\\text{m}\\,\\text{s}^{-2}$', why: 'that is a force: momentum has one power of s more' },
      { display: '$\\text{N}\\,\\text{m}\\,\\text{s}^{-1}$', why: 'that is a power, not a momentum' },
      { display: '$\\text{J}\\,\\text{s}$', why: 'an energy times a time is not a momentum — it needs dividing by a length' },
    ],
  },

  {
    q: 'speed', name: 'speed',
    right: [
      { display: '$\\text{m}\\,\\text{s}^{-1}$', why: 'these are the base units of a speed' },
      { display: '$\\text{N}\\,\\text{s}\\,\\text{kg}^{-1}$', why: 'an impulse divided by a mass is a change of velocity' },
      { display: '$\\text{J}\\,\\text{s}\\,\\text{m}^{-1}\\,\\text{kg}^{-1}$', why: 'J s m⁻¹ is a momentum, and a momentum per unit mass is a velocity' },
      { display: '$\\text{Pa}\\,\\text{m}^{2}\\,\\text{s}\\,\\text{kg}^{-1}$', why: 'Pa m² is a force, so this is force × time ÷ mass, again a velocity' },
    ],
    odd: [
      { display: '$\\text{m}\\,\\text{s}^{-2}$', why: 'that is an acceleration: one power of s too many' },
      { display: '$\\text{N}\\,\\text{s}$', why: 'N s is a momentum, not a velocity — it still carries the mass' },
      { display: '$\\text{J}\\,\\text{kg}^{-1}$', why: 'an energy per unit mass is the square of a speed, m² s⁻²' },
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
  const options = buildChoiceOptions(rng, odd.display, right.map((r) => ({ display: r.display, trap: r.why })));
  const g = finish(
    options,
    `In base units a ${set.name} is ${vecTex(QTY[set.q])}; every other option reduces to that, but ${odd.display} does not — ${odd.why}.`,
    // the trap names the confusion this instance really turns on, not a fixed line about some other quantity
    `${odd.why.charAt(0).toUpperCase()}${odd.why.slice(1)}: reduce every option to kg, m and s before deciding.`,
    ['units', 'base units', 'odd one out'],
    { shape: 'odd', quantity: set.q },
  );
  return { ...g, stem: rng.pick(ODD_PHRASINGS)(set.name) };
}

// ----------------------------------------------------------------------------- level 4

const COMBOS: { expr: string; where: string; spec: Spec; note: string; near: string[]; trap: string }[] = [
  {
    expr: 'Q = \\rho v^{2} L', where: '$\\rho$ is a density, $v$ is a speed and $L$ is a length',
    spec: { num: [['density', 1], ['speed', 2], ['length', 1]] },
    note: '$[\\rho v^{2} L] = \\text{kg m}^{-3} \\times \\text{m}^{2}\\text{s}^{-2} \\times \\text{m}$',
    near: ['pressure', 'force', 'energy', 'spring', 'linearDensity'],
    trap: 'The speed is squared, so it contributes m² s⁻²; collecting the m powers −3 + 2 + 1 = 0 leaves kg s⁻².',
  },
  {
    expr: 'Q = \\dfrac{1}{2}\\rho v^{2}', where: '$\\rho$ is a density and $v$ is a speed',
    spec: { num: [['density', 1], ['speed', 2]] },
    note: '$[\\rho v^{2}] = \\text{kg m}^{-3} \\times \\text{m}^{2}\\text{s}^{-2}$, the units of a pressure',
    near: ['pressure', 'energy', 'force', 'density', 'spring'],
    trap: 'The ½ has no units and the speed is squared: ρv² is a pressure, kg m⁻¹ s⁻², not an energy.',
  },
  {
    expr: 'Q = \\dfrac{1}{2}k x^{2}', where: '$k$ is a spring constant in $\\text{N m}^{-1}$ and $x$ is an extension',
    spec: { num: [['spring', 1], ['length', 2]] },
    note: '$[kx^{2}] = \\text{kg s}^{-2} \\times \\text{m}^{2}$, the units of an energy',
    near: ['energy', 'force', 'power', 'pressure', 'momentum'],
    trap: 'The extension is squared: kg s⁻² × m² is an energy, kg m² s⁻², not a force.',
  },
  {
    expr: 'Q = \\dfrac{mv^{2}}{r}', where: '$m$ is a mass, $v$ is a speed and $r$ is a radius',
    spec: { num: [['mass', 1], ['speed', 2]], den: [['length', 1]] },
    note: '$[mv^{2}/r] = \\text{kg} \\times \\text{m}^{2}\\text{s}^{-2} \\div \\text{m}$, the units of a force',
    near: ['force', 'energy', 'momentum', 'pressure', 'spring'],
    trap: 'Dividing the energy kg m² s⁻² by the radius removes one power of m: the result is a force, not an energy.',
  },
  {
    expr: 'Q = \\rho g h', where: '$\\rho$ is a density, $g$ is an acceleration and $h$ is a depth',
    spec: { num: [['density', 1], ['accel', 1], ['length', 1]] },
    note: '$[\\rho g h] = \\text{kg m}^{-3} \\times \\text{m s}^{-2} \\times \\text{m}$, the units of a pressure',
    near: ['pressure', 'force', 'energy', 'density', 'spring'],
    trap: 'Collect the m powers: −3 + 1 + 1 = −1, so ρgh is a pressure, kg m⁻¹ s⁻², as it must be.',
  },
];

function comboQ(rng: RNG): Generated | null {
  const item = rng.pick(COMBOS);
  const target = specVec(item.spec)!;
  const options = vecOptions(rng, target, [], item.near);
  if (!options) return null;
  const g = finish(
    options,
    `${item.note} $= ${vecTex(target).replace(/\$/g, '')}$.`,
    item.trap,
    ['units', 'base units', 'combination'],
    { shape: 'vec', spec: item.spec },
  );
  return { ...g, stem: `A quantity $Q$ is given by $${item.expr}$, where ${item.where}.\n\nWhich of the following gives the SI base units of $Q$?` };
}

type Pow = [number, number];

/**
 * A proportionality between one quantity and two others, with determined powers. `intro` carries the
 * token {rel}, which becomes "m^{a} k^{b}" or "k^{a} m^{b}" — the two symbols are drawn in either
 * order, so the correct pair is not the same every time.
 */
const PROPORTIONS: {
  target: string;
  intro: string;
  x: { sym: string; qty: string; exp: Pow };
  y: { sym: string; qty: string; exp: Pow };
  note: string;
}[] = [
  {
    target: 'time',
    intro: 'The period $T$ of a mass $m$ oscillating on a spring of stiffness $k$ (in $\\text{N m}^{-1}$) satisfies $T \\propto {rel}$.',
    x: { sym: 'm', qty: 'mass', exp: [1, 2] },
    y: { sym: 'k', qty: 'spring', exp: [-1, 2] },
    note: '$[m] = \\text{kg}$ and $[k] = \\text{kg s}^{-2}$: the kg must cancel, and $(\\text{s}^{-2})^{-1/2} = \\text{s}$, so $T \\propto \\sqrt{m/k}$',
  },
  {
    target: 'time',
    intro: 'The period $T$ of a pendulum of length $L$ in a field of gravitational field strength $g$ satisfies $T \\propto {rel}$.',
    x: { sym: 'L', qty: 'length', exp: [1, 2] },
    y: { sym: 'g', qty: 'accel', exp: [-1, 2] },
    note: '$[L] = \\text{m}$ and $[g] = \\text{m s}^{-2}$: the m must cancel, and $(\\text{s}^{-2})^{-1/2} = \\text{s}$, so $T \\propto \\sqrt{L/g}$',
  },
  {
    target: 'speed',
    intro: 'The speed $v$ of a wave on a string of tension $T$ and mass per unit length $\\mu$ satisfies $v \\propto {rel}$.',
    x: { sym: 'T', qty: 'force', exp: [1, 2] },
    y: { sym: '\\mu', qty: 'linearDensity', exp: [-1, 2] },
    note: '$[T] = \\text{kg m s}^{-2}$ and $[\\mu] = \\text{kg m}^{-1}$: the kg cancels and $(\\text{s}^{-2})^{1/2} = \\text{s}^{-1}$, so $v \\propto \\sqrt{T/\\mu}$',
  },
  {
    target: 'energy',
    intro: 'The kinetic energy $E$ of a body of mass $m$ moving at speed $v$ satisfies $E \\propto {rel}$.',
    x: { sym: 'm', qty: 'mass', exp: [1, 1] },
    y: { sym: 'v', qty: 'speed', exp: [2, 1] },
    note: '$[E] = \\text{kg m}^{2}\\text{s}^{-2}$: one power of kg, and $\\text{m}^{2}\\text{s}^{-2}$ is the square of a speed',
  },
  {
    target: 'pressure',
    intro: 'The pressure $p$ on a flat plate held across a stream of fluid of density $\\rho$ moving at speed $v$ satisfies $p \\propto {rel}$.',
    x: { sym: '\\rho', qty: 'density', exp: [1, 1] },
    y: { sym: 'v', qty: 'speed', exp: [2, 1] },
    note: '$[p] = \\text{kg m}^{-1}\\text{s}^{-2}$ and $[\\rho] = \\text{kg m}^{-3}$: one power of $\\rho$ fixes the kg, and $v^{2}$ then fixes the s',
  },
  {
    target: 'power',
    intro: 'The power $P$ developed by a force $F$ whose point of application moves at speed $v$ satisfies $P \\propto {rel}$.',
    x: { sym: 'F', qty: 'force', exp: [1, 1] },
    y: { sym: 'v', qty: 'speed', exp: [1, 1] },
    note: '$[P] = \\text{kg m}^{2}\\text{s}^{-3} = (\\text{kg m s}^{-2})(\\text{m s}^{-1})$: one power of each',
  },
  {
    target: 'speed',
    intro: 'The speed $v$ of a wave in deep water of wavelength $\\lambda$, in a field of gravitational field strength $g$, satisfies $v \\propto {rel}$.',
    x: { sym: 'g', qty: 'accel', exp: [1, 2] },
    y: { sym: '\\lambda', qty: 'length', exp: [1, 2] },
    note: '$[g\\lambda] = \\text{m s}^{-2} \\times \\text{m} = \\text{m}^{2}\\text{s}^{-2}$, the square of a speed, so $v \\propto \\sqrt{g\\lambda}$',
  },
  {
    target: 'spring',
    intro: 'The stiffness $k$ (in $\\text{N m}^{-1}$) of a spring on which a mass $m$ oscillates with period $T$ satisfies $k \\propto {rel}$.',
    x: { sym: 'm', qty: 'mass', exp: [1, 1] },
    y: { sym: 'T', qty: 'time', exp: [-2, 1] },
    note: '$[k] = \\text{kg s}^{-2}$: one power of the mass gives the kg, and $T^{-2}$ gives the $\\text{s}^{-2}$',
  },
];

const fracTex = (p: Pow): string => {
  const [nu, de] = p;
  if (de === 1) return `${nu}`;
  return `${nu < 0 ? '-' : ''}\\tfrac{${Math.abs(nu)}}{${de}}`;
};
const pairTex = (a: Pow, b: Pow): string => `$a = ${fracTex(a)},\\ b = ${fracTex(b)}$`;
const powVal = (p: Pow): number => p[0] / p[1];
const halve = (p: Pow): Pow => [p[0], p[1] * 2];
const dbl = (p: Pow): Pow => (p[1] % 2 === 0 ? [p[0], p[1] / 2] : [p[0] * 2, p[1]]);

function proportionQ(rng: RNG): Generated | null {
  const item = rng.pick(PROPORTIONS);
  // which symbol is called `a` is drawn too, so the answer is not the same pair every time
  const [first, second] = rng.bool(0.5) ? [item.x, item.y] : [item.y, item.x];
  const A = QTY[first.qty], B = QTY[second.qty];
  const target = QTY[item.target];
  if (!A || !B || !target) return null;
  const a = first.exp, b = second.exp;
  const correct = pairTex(a, b);
  const candidates: { pair: [Pow, Pow]; trap: string }[] = [
    { pair: [b, a], trap: 'the two powers the wrong way round' },
    { pair: [[-a[0], a[1]], [-b[0], b[1]]], trap: 'the whole relation inverted: every power has the wrong sign' },
    { pair: [a, [-b[0], b[1]]], trap: 'the sign of the second power slipped' },
    { pair: [[-a[0], a[1]], b], trap: 'the sign of the first power slipped' },
    { pair: [dbl(a), dbl(b)], trap: 'forgot that a square root halves both powers' },
    { pair: [halve(a), halve(b)], trap: 'took a square root that is not there' },
    { pair: [[1, 2], [-1, 2]], trap: 'assumed the usual $\\sqrt{x/y}$ shape without matching the units' },
    { pair: [[1, 1], [-1, 1]], trap: 'guessed one power up, one power down' },
    { pair: [[1, 1], [1, 1]], trap: 'assumed simple proportionality to both quantities' },
    { pair: [[1, 1], [2, 1]], trap: 'borrowed the $mv^{2}$ shape' },
    { pair: [[1, 2], [1, 2]], trap: 'assumed the square root of the product' },
  ];
  const seen = new Set([correct]);
  const wrongs: { display: string; trap: string }[] = [];
  const pairs: { display: string; a: Pow; b: Pow }[] = [{ display: correct, a, b }];
  for (const c of candidates) {
    if (wrongs.length >= 4) break;
    const [pa, pb] = c.pair;
    // a "wrong" pair that is dimensionally right would make the question unanswerable
    const v = add(add([0, 0, 0, 0], A, powVal(pa)), B, powVal(pb));
    if (sameVec(v, target)) continue;
    const d = pairTex(pa, pb);
    if (seen.has(d)) continue;
    seen.add(d);
    wrongs.push({ display: d, trap: c.trap });
    pairs.push({ display: d, a: pa, b: pb });
  }
  if (wrongs.length < 4) return null;
  const options = buildChoiceOptions(rng, correct, wrongs);
  const halves = pairs.some((x) => x.a[1] !== 1 || x.b[1] !== 1);
  const g = finish(
    options,
    `${item.note}, so $a = ${fracTex(a)}$ and $b = ${fracTex(b)}$.`,
    halves
      ? 'Match the powers of kg, m and s separately: two equations fix a and b, and a square root means a power of ½.'
      : 'Match the powers of kg, m and s separately: two equations fix a and b, and the order of the two symbols matters.',
    ['units', 'dimensional analysis', 'proportion'],
    { shape: 'ab', target: item.target, qA: first.qty, qB: second.qty, pairs },
  );
  const rel = `${first.sym}^{a} ${second.sym}^{b}`;
  return { ...g, stem: `${item.intro.replace('{rel}', rel)}\n\nWhich of the following gives $a$ and $b$?` };
}

// ----------------------------------------------------------------------------- level 5

/**
 * An equation offered as an option. A single-term equation is one product (`factors`); an equation
 * whose right-hand side is a *sum* lists each term separately (`terms`), and it is consistent only
 * when every term has the units of the left-hand side.
 */
interface ExprOption { display: string; factors?: [string, number, number][]; terms?: [string, number, number][][] }

/**
 * Dimensional consistency. Each scenario carries several consistent equations (one is drawn as the
 * answer) and a longer list of inconsistent ones, so the correct equation varies from instance to
 * instance. Every symbol used in an option is given a quantity in `given`.
 */
const CONSISTENCY: {
  given: string;
  lhs: string;
  consistent: { expr: ExprOption; note: string }[];
  wrong: (ExprOption & { why: string })[];
}[] = [
  {
    given: '$v$ is a speed, $g$ is an acceleration, $L$ is a length and $t$ is a time',
    lhs: 'speed',
    consistent: [
      { expr: { display: '$v = \\sqrt{gL}$', factors: [['accel', 1, 2], ['length', 1, 2]] }, note: '$[\\sqrt{gL}] = (\\text{m s}^{-2} \\times \\text{m})^{1/2} = \\text{m s}^{-1}$' },
      { expr: { display: '$v = gt$', factors: [['accel', 1, 1], ['time', 1, 1]] }, note: '$[gt] = \\text{m s}^{-2} \\times \\text{s} = \\text{m s}^{-1}$' },
      { expr: { display: '$v = \\dfrac{L}{t}$', factors: [['length', 1, 1], ['time', -1, 1]] }, note: '$[L/t] = \\text{m} \\div \\text{s} = \\text{m s}^{-1}$' },
    ],
    wrong: [
      { display: '$v = gL$', factors: [['accel', 1, 1], ['length', 1, 1]], why: '$\\text{m}^{2}\\text{s}^{-2}$ is the square of a speed' },
      { display: '$v = \\sqrt{\\dfrac{g}{L}}$', factors: [['accel', 1, 2], ['length', -1, 2]], why: 'the metres cancel, leaving $\\text{s}^{-1}$' },
      { display: '$v = \\dfrac{g}{L}$', factors: [['accel', 1, 1], ['length', -1, 1]], why: '$\\text{s}^{-2}$: both powers of m cancel' },
      { display: '$v = \\sqrt{\\dfrac{L}{g}}$', factors: [['length', 1, 2], ['accel', -1, 2]], why: 'that is a time, not a speed' },
      { display: '$v = g t^{2}$', factors: [['accel', 1, 1], ['time', 2, 1]], why: '$\\text{m}$: that is a distance' },
      { display: '$v = \\dfrac{t}{L}$', factors: [['time', 1, 1], ['length', -1, 1]], why: 'the reciprocal of a speed' },
      { display: '$v = Lt$', factors: [['length', 1, 1], ['time', 1, 1]], why: '$\\text{m s}$ is nothing familiar — a speed divides by the time' },
    ],
  },
  {
    given: '$T$ is a time, $m$ is a mass, $k$ is a spring constant in $\\text{N m}^{-1}$, $L$ is a length and $g$ is an acceleration',
    lhs: 'time',
    consistent: [
      { expr: { display: '$T = \\sqrt{\\dfrac{m}{k}}$', factors: [['mass', 1, 2], ['spring', -1, 2]] }, note: '$[\\sqrt{m/k}] = (\\text{kg} \\div \\text{kg s}^{-2})^{1/2} = \\text{s}$' },
      { expr: { display: '$T = \\sqrt{\\dfrac{L}{g}}$', factors: [['length', 1, 2], ['accel', -1, 2]] }, note: '$[\\sqrt{L/g}] = (\\text{m} \\div \\text{m s}^{-2})^{1/2} = \\text{s}$' },
    ],
    wrong: [
      { display: '$T = \\sqrt{\\dfrac{k}{m}}$', factors: [['spring', 1, 2], ['mass', -1, 2]], why: 'that is a frequency, $\\text{s}^{-1}$' },
      { display: '$T = \\dfrac{m}{k}$', factors: [['mass', 1, 1], ['spring', -1, 1]], why: '$\\text{s}^{2}$: the square root is missing' },
      { display: '$T = mk$', factors: [['mass', 1, 1], ['spring', 1, 1]], why: '$\\text{kg}^{2}\\text{s}^{-2}$' },
      { display: '$T = \\sqrt{mk}$', factors: [['mass', 1, 2], ['spring', 1, 2]], why: '$\\text{kg s}^{-1}$: the mass does not cancel' },
      { display: '$T = \\sqrt{\\dfrac{g}{L}}$', factors: [['accel', 1, 2], ['length', -1, 2]], why: 'that is a frequency, $\\text{s}^{-1}$' },
      { display: '$T = \\dfrac{L}{g}$', factors: [['length', 1, 1], ['accel', -1, 1]], why: '$\\text{s}^{2}$: the square root is missing' },
      { display: '$T = Lg$', factors: [['length', 1, 1], ['accel', 1, 1]], why: '$\\text{m}^{2}\\text{s}^{-2}$, the square of a speed' },
    ],
  },
  {
    given: '$E$ is an energy, $m$ is a mass, $v$ is a speed, $h$ is a height and $g$ is an acceleration',
    lhs: 'energy',
    consistent: [
      { expr: { display: '$E = \\tfrac12 m v^{2}$', factors: [['mass', 1, 1], ['speed', 2, 1]] }, note: '$[mv^{2}] = \\text{kg} \\times \\text{m}^{2}\\text{s}^{-2} = \\text{J}$, and the $\\tfrac12$ has no units' },
      { expr: { display: '$E = mgh$', factors: [['mass', 1, 1], ['accel', 1, 1], ['length', 1, 1]] }, note: '$[mgh] = \\text{kg} \\times \\text{m s}^{-2} \\times \\text{m} = \\text{kg m}^{2}\\text{s}^{-2} = \\text{J}$' },
    ],
    wrong: [
      { display: '$E = \\tfrac12 m v$', factors: [['mass', 1, 1], ['speed', 1, 1]], why: 'that is a momentum' },
      { display: '$E = m v^{2} h$', factors: [['mass', 1, 1], ['speed', 2, 1], ['length', 1, 1]], why: 'one power of m too many' },
      { display: '$E = \\dfrac{mv^{2}}{h}$', factors: [['mass', 1, 1], ['speed', 2, 1], ['length', -1, 1]], why: 'that is a force' },
      { display: '$E = mg$', factors: [['mass', 1, 1], ['accel', 1, 1]], why: 'that is a force (a weight), not an energy' },
      { display: '$E = \\dfrac{1}{2} m^{2} v$', factors: [['mass', 2, 1], ['speed', 1, 1]], why: '$\\text{kg}^{2}\\text{m s}^{-1}$' },
      { display: '$E = mgh^{2}$', factors: [['mass', 1, 1], ['accel', 1, 1], ['length', 2, 1]], why: 'one power of the height too many' },
      { display: '$E = \\dfrac{mgh}{v}$', factors: [['mass', 1, 1], ['accel', 1, 1], ['length', 1, 1], ['speed', -1, 1]], why: 'dividing by a speed leaves a momentum' },
    ],
  },
];

/**
 * Equations with two terms added: every term must match the left-hand side on its own, so a candidate
 * has to check twice as many products — the hardest thing this template asks, and level 5 only.
 */
const CONSISTENCY_SUMS: typeof CONSISTENCY = [
  {
    given: '$E$ is an energy, $m$ is a mass, $v$ is a speed, $h$ is a height, $g$ is an acceleration, $F$ is a force and $d$ is a distance',
    lhs: 'energy',
    consistent: [
      {
        expr: { display: '$E = \\tfrac12 mv^{2} + mgh$', terms: [[['mass', 1, 1], ['speed', 2, 1]], [['mass', 1, 1], ['accel', 1, 1], ['length', 1, 1]]] },
        note: '$[mv^{2}] = \\text{kg m}^{2}\\text{s}^{-2}$ and $[mgh] = \\text{kg} \\times \\text{m s}^{-2} \\times \\text{m}$, the same',
      },
      {
        expr: { display: '$E = Fd + mgh$', terms: [[['force', 1, 1], ['length', 1, 1]], [['mass', 1, 1], ['accel', 1, 1], ['length', 1, 1]]] },
        note: '$[Fd] = \\text{kg m s}^{-2} \\times \\text{m}$ and $[mgh]$ is the same, both $\\text{kg m}^{2}\\text{s}^{-2}$',
      },
    ],
    wrong: [
      { display: '$E = \\tfrac12 mv^{2} + mg$', terms: [[['mass', 1, 1], ['speed', 2, 1]], [['mass', 1, 1], ['accel', 1, 1]]], why: 'the second term is a weight, a force, not an energy' },
      { display: '$E = \\tfrac12 mv + mgh$', terms: [[['mass', 1, 1], ['speed', 1, 1]], [['mass', 1, 1], ['accel', 1, 1], ['length', 1, 1]]], why: 'the first term is a momentum: the speed must be squared' },
      { display: '$E = Fd + mg$', terms: [[['force', 1, 1], ['length', 1, 1]], [['mass', 1, 1], ['accel', 1, 1]]], why: 'the second term is a force; only the first is an energy' },
      { display: '$E = mgh + \\dfrac{mv^{2}}{h}$', terms: [[['mass', 1, 1], ['accel', 1, 1], ['length', 1, 1]], [['mass', 1, 1], ['speed', 2, 1], ['length', -1, 1]]], why: 'the second term is a force: dividing by the height loses a power of m' },
      { display: '$E = mgh^{2} + Fd$', terms: [[['mass', 1, 1], ['accel', 1, 1], ['length', 2, 1]], [['force', 1, 1], ['length', 1, 1]]], why: 'the first term has one power of the height too many' },
      { display: '$E = F d^{2} + \\tfrac12 mv^{2}$', terms: [[['force', 1, 1], ['length', 2, 1]], [['mass', 1, 1], ['speed', 2, 1]]], why: 'the first term is an energy times a length' },
    ],
  },
  {
    given: '$u$ and $v$ are speeds, $a$ is an acceleration, $t$ is a time and $s$ is a distance',
    lhs: 'speed',
    consistent: [
      {
        expr: { display: '$v = u + at$', terms: [[['speed', 1, 1]], [['accel', 1, 1], ['time', 1, 1]]] },
        note: '$[at] = \\text{m s}^{-2} \\times \\text{s} = \\text{m s}^{-1}$, the units of $u$',
      },
      {
        expr: { display: '$v = \\dfrac{s}{t} + at$', terms: [[['length', 1, 1], ['time', -1, 1]], [['accel', 1, 1], ['time', 1, 1]]] },
        note: '$[s/t] = \\text{m s}^{-1}$ and $[at] = \\text{m s}^{-1}$: both terms are speeds',
      },
    ],
    wrong: [
      { display: '$v = u + at^{2}$', terms: [[['speed', 1, 1]], [['accel', 1, 1], ['time', 2, 1]]], why: '$at^{2}$ is a distance, not a speed' },
      { display: '$v = u + a$', terms: [[['speed', 1, 1]], [['accel', 1, 1]]], why: 'an acceleration cannot be added to a speed' },
      { display: '$v = ut + at$', terms: [[['speed', 1, 1], ['time', 1, 1]], [['accel', 1, 1], ['time', 1, 1]]], why: '$ut$ is a distance: only the second term is a speed' },
      { display: '$v = u + \\dfrac{s}{t^{2}}$', terms: [[['speed', 1, 1]], [['length', 1, 1], ['time', -2, 1]]], why: '$s/t^{2}$ is an acceleration' },
      { display: '$v = u + as$', terms: [[['speed', 1, 1]], [['accel', 1, 1], ['length', 1, 1]]], why: '$as$ is $\\text{m}^{2}\\text{s}^{-2}$, the square of a speed' },
      { display: '$v = \\dfrac{s}{t^{2}} + at$', terms: [[['length', 1, 1], ['time', -2, 1]], [['accel', 1, 1], ['time', 1, 1]]], why: 'the first term is an acceleration' },
    ],
  },
];

function consistencyQ(rng: RNG): Generated | null {
  const item = rng.pick([...CONSISTENCY, ...CONSISTENCY_SUMS]);
  const right = rng.pick(item.consistent);
  const wrongs = rng.pickDistinct(item.wrong, 4);
  const options = buildChoiceOptions(rng, right.expr.display, wrongs.map((w) => ({ display: w.display, trap: w.why })));
  // only mention the square root when one of the five equations actually has one
  const rooted = options.some((o) => o.display.includes('\\sqrt'));
  const g = finish(
    options,
    `${right.note}, which matches the left-hand side; each of the others has the wrong powers.`,
    rooted
      ? 'A square root halves every power: check the units of both sides before trusting a formula.'
      : 'Replace every symbol by its base units and match the powers of kg, m and s on both sides; a numerical factor such as ½ changes nothing.',
    ['units', 'dimensional analysis', 'consistency'],
    { shape: 'expr', lhs: item.lhs, exprs: [right.expr, ...wrongs.map((w) => ({ display: w.display, factors: w.factors, terms: w.terms }))] },
  );
  return { ...g, stem: `Given that ${item.given}, which of the following equations is dimensionally consistent?\n\n(Numerical factors have no units.)` };
}

/**
 * `yPow`/`xPow` let an axis carry a power (kinetic energy against the *square* of the speed, the
 * *square* of the period against the length), which is what makes the level-5 graphs harder than the
 * level-4 ones: the gradient is no longer one division of two familiar units.
 */
const GRAPHS: { y: string; yName: string; yPow?: number; x: string; xName: string; xPow?: number; op: 'gradient' | 'area'; note: string; near: string[]; hard?: boolean }[] = [
  { y: 'force', yName: 'force', x: 'length', xName: 'extension', op: 'gradient', note: 'the gradient is a force divided by a length', near: ['spring', 'force', 'energy', 'pressure'] },
  { y: 'force', yName: 'force', x: 'length', xName: 'extension', op: 'area', note: 'the area is a force times a length, i.e. work done', near: ['energy', 'force', 'power', 'spring'] },
  { y: 'speed', yName: 'velocity', x: 'time', xName: 'time', op: 'gradient', note: 'the gradient is a velocity divided by a time, i.e. an acceleration', near: ['accel', 'speed', 'force', 'freq'] },
  { y: 'speed', yName: 'velocity', x: 'time', xName: 'time', op: 'area', note: 'the area is a velocity times a time, i.e. a displacement', near: ['length', 'speed', 'accel', 'area'] },
  { y: 'force', yName: 'force', x: 'time', xName: 'time', op: 'area', note: 'the area is a force times a time, i.e. an impulse', near: ['momentum', 'force', 'energy', 'speed'] },
  { y: 'power', yName: 'power', x: 'time', xName: 'time', op: 'area', note: 'the area is a power times a time, i.e. an energy', near: ['energy', 'power', 'force', 'momentum'] },
  { y: 'voltage', yName: 'potential difference', x: 'current', xName: 'current', op: 'gradient', note: 'the gradient is a potential difference divided by a current, i.e. a resistance', near: ['voltage', 'power', 'charge', 'current'], hard: true },
  { y: 'pressure', yName: 'the pressure in a liquid', x: 'length', xName: 'the depth below the surface', op: 'gradient', note: 'the gradient is a pressure divided by a depth, i.e. $\\rho g$', near: ['density', 'pressure', 'spring', 'linearDensity', 'accel'], hard: true },
  { y: 'energy', yName: 'the kinetic energy of a trolley', x: 'speed', xPow: 2, xName: 'the square of its speed', op: 'gradient', note: 'the gradient is an energy divided by the square of a speed, i.e. half the mass', near: ['mass', 'energy', 'momentum', 'force'], hard: true },
  { y: 'time', yPow: 2, yName: 'the square of the period of a pendulum', x: 'length', xName: 'its length', op: 'gradient', note: 'the gradient is a time squared divided by a length, i.e. $4\\pi^{2}/g$', near: ['accel', 'speed', 'time', 'freq'], hard: true },
  { y: 'momentum', yName: 'the momentum of a body', x: 'time', xName: 'time', op: 'gradient', note: 'the gradient is a momentum divided by a time, i.e. the resultant force', near: ['force', 'momentum', 'energy', 'speed'], hard: true },
];

function graphQ(rng: RNG, level: Level): Generated | null {
  // level 4 gets the familiar straight-line graphs (F against x, v against t); level 5 gets the ones
  // whose axes carry a power or a fourth base unit, where the gradient is a compound quantity
  const item = rng.pick(GRAPHS.filter((gph) => (gph.hard ?? false) === (level >= 5)));
  const yPow = item.yPow ?? 1, xPow = item.xPow ?? 1;
  const gradient: Spec = { num: [[item.y, yPow]], den: [[item.x, xPow]] };
  const area: Spec = { num: [[item.y, yPow], [item.x, xPow]] };
  const spec: Spec = item.op === 'gradient' ? gradient : area;
  const target = specVec(spec)!;
  // the classic slip: the area worked out where the gradient was asked for, or the other way round
  const swapped = specVec(item.op === 'gradient' ? area : gradient)!;
  const options = vecOptions(rng, target, [{ v: swapped, trap: `gradient and area swapped: these are the units of the ${item.op === 'gradient' ? 'area under' : 'gradient of'} the graph` }], item.near);
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
  4: [comboQ, comboQ, proportionQ, (r) => graphQ(r, 4)],
  5: [consistencyQ, consistencyQ, (r) => graphQ(r, 5)],
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
    4: 'base units of ρv²L, ½kx², mv²/r; the powers a and b in T ∝ mᵃkᵇ; the gradient or area of a straight-line graph',
    5: 'which formula is dimensionally consistent, including sums where every term must match; the gradient of a harder graph (p against depth, E against v², T² against L, V against I)',
  },
  generate(rng, level: Level) {
    return retry(rng, () => pickVariant(rng, VARIANTS[level]));
  },
  verify(q) {
    if (q.answer.kind !== 'choice' || q.typedAllowed) return false;
    const p = q.params as { shape: string; spec?: Spec; quantity?: string; target?: string; qA?: string; qB?: string; pairs?: { display: string; a: Pow; b: Pow }[]; lhs?: string; exprs?: ExprOption[] };
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
      const vecOf = (fs: [string, number, number][]): Vec | null => {
        let v: Vec = [0, 0, 0, 0];
        for (const [sym, nu, de] of fs) {
          if (!QTY[sym]) return null;
          v = add(v, QTY[sym], nu / de);
        }
        return v;
      };
      let good = 0;
      for (const o of q.options) {
        const e = p.exprs.find((x) => x.display === o.display);
        if (!e) return false;
        // a sum is consistent only if every term on its own has the units of the left-hand side
        const parts = e.terms ?? (e.factors ? [e.factors] : null);
        if (!parts || parts.length === 0) return false;
        const vs = parts.map(vecOf);
        if (vs.some((v) => v === null)) return false;
        if (vs.every((v) => sameVec(v!, target))) {
          good++;
          if (!o.correct) return false;
        }
      }
      return good === 1;
    }
    return false;
  },
});
