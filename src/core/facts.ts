/**
 * Facts to know cold, as flashcards. Each card has a prompt and an exact answer
 * (checked with the same parser as questions) plus a display form.
 */
import { Exact, E, frac, surd, surdFrac, piFrac } from './exact';
import type { RNG } from './rng';

export interface FactCard {
  id: string;
  deck: string;
  /** MathText prompt */
  prompt: string;
  /** exact value (typed answers are checked against it) or null for text-only cards */
  answer: Exact | null;
  /** MathText display of the answer */
  display: string;
  /** optional accepted text answers for non-numeric cards, lower case */
  textAnswers?: string[];
}

export interface FactDeck {
  key: string;
  name: string;
  description: string;
  cards: FactCard[];
}

const dec = (s: string) => Exact.decimal(s);

function squares(): FactCard[] {
  const out: FactCard[] = [];
  for (let n = 11; n <= 30; n++) out.push({ id: `sq${n}`, deck: 'squares', prompt: `$${n}^2$`, answer: E(n * n), display: `$${n * n}$` });
  for (const n of [121, 144, 169, 196, 225, 256, 289, 324, 361, 400, 441, 484, 529, 576, 625, 676, 729, 784, 841, 900]) {
    out.push({ id: `rsq${n}`, deck: 'squares', prompt: `$\\sqrt{${n}}$`, answer: E(Math.round(Math.sqrt(n))), display: `$${Math.round(Math.sqrt(n))}$` });
  }
  return out;
}

function cubes(): FactCard[] {
  const out: FactCard[] = [];
  for (let n = 2; n <= 15; n++) out.push({ id: `cu${n}`, deck: 'cubes', prompt: `$${n}^3$`, answer: E(n ** 3), display: `$${n ** 3}$` });
  for (let n = 2; n <= 15; n++) out.push({ id: `rcu${n}`, deck: 'cubes', prompt: `$\\sqrt[3]{${n ** 3}}$`, answer: E(n), display: `$${n}$` });
  return out;
}

function powers(): FactCard[] {
  const out: FactCard[] = [];
  for (let n = 4; n <= 16; n++) out.push({ id: `p2_${n}`, deck: 'powers', prompt: `$2^{${n}}$`, answer: E(2 ** n), display: `$${2 ** n}$` });
  for (let n = 3; n <= 8; n++) out.push({ id: `p3_${n}`, deck: 'powers', prompt: `$3^{${n}}$`, answer: E(3 ** n), display: `$${3 ** n}$` });
  for (const [b, n] of [[4, 4], [4, 5], [5, 4], [5, 5], [6, 3], [6, 4], [7, 3], [8, 3], [9, 3], [10, 6]]) out.push({ id: `p${b}_${n}`, deck: 'powers', prompt: `$${b}^{${n}}$`, answer: E(b ** n), display: `$${b ** n}$` });
  for (const v of [32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536]) out.push({ id: `l2_${v}`, deck: 'powers', prompt: `$\\log_2 ${v}$`, answer: E(Math.log2(v)), display: `$${Math.log2(v)}$` });
  for (const v of [27, 81, 243, 729, 2187, 6561]) out.push({ id: `l3_${v}`, deck: 'powers', prompt: `$\\log_3 ${v}$`, answer: E(Math.round(Math.log(v) / Math.log(3))), display: `$${Math.round(Math.log(v) / Math.log(3))}$` });
  return out;
}

function primes(): FactCard[] {
  const ps = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];
  const out: FactCard[] = [];
  const composites = [51, 57, 87, 91, 93, 77, 63, 69, 49, 39, 27, 81, 33, 21];
  for (const p of ps.slice(4)) out.push({ id: `pr${p}`, deck: 'primes', prompt: `Is $${p}$ prime?`, answer: null, display: 'Yes', textAnswers: ['yes', 'y', 'prime'] });
  for (const c of composites) {
    let f = 2;
    while (c % f) f++;
    out.push({ id: `pr${c}`, deck: 'primes', prompt: `Is $${c}$ prime?`, answer: null, display: `No: $${c} = ${f} \\times ${c / f}$`, textAnswers: ['no', 'n', 'not prime', 'composite'] });
  }
  for (let i = 1; i < ps.length; i++) out.push({ id: `nextp${ps[i - 1]}`, deck: 'primes', prompt: `The next prime after $${ps[i - 1]}$`, answer: E(ps[i]), display: `$${ps[i]}$` });
  return out;
}

function surdDecimals(): FactCard[] {
  const rows: [string, string, string][] = [
    ['√2', '1.414', '1.414'], ['√3', '1.732', '1.732'], ['√5', '2.236', '2.236'], ['√6', '2.449', '2.449'], ['√7', '2.646', '2.646'], ['√10', '3.162', '3.162'],
    ['1/√2', '0.707', '0.707'], ['√3/2', '0.866', '0.866'], ['π', '3.142', '3.142'], ['π²', '9.870', '9.87'], ['1/π', '0.318', '0.318'], ['√π', '1.772', '1.772'],
    ['e', '2.718', '2.718'], ['ln 2', '0.693', '0.693'], ['ln 10', '2.303', '2.303'], ['2π', '6.283', '6.283'], ['4π', '12.57', '12.57'], ['π/4', '0.785', '0.785'],
  ];
  return rows.map(([sym, disp, val]) => {
    const sf = val.replace(/^-?0*\.?0*/, '').replace('.', '').length;
    return {
      id: `dec_${sym}`,
      deck: 'decimals',
      prompt: `$${sym.replace('√', '\\sqrt ').replace('π', '\\pi ').replace('ln', '\\ln ')}$ to ${sf} s.f.`,
      answer: dec(val),
      display: `$\\approx ${disp}$`,
    };
  });
}

function trigTable(): FactCard[] {
  const out: FactCard[] = [];
  const table: [number, string, Exact, Exact, Exact | null][] = [
    [0, '0', E(0), E(1), E(0)],
    [30, '\\frac{\\pi}{6}', frac(1, 2), surdFrac(1, 2, 3), surdFrac(1, 3, 3)],
    [45, '\\frac{\\pi}{4}', surdFrac(1, 2, 2), surdFrac(1, 2, 2), E(1)],
    [60, '\\frac{\\pi}{3}', surdFrac(1, 2, 3), frac(1, 2), surd(3)],
    [90, '\\frac{\\pi}{2}', E(1), E(0), null],
  ];
  for (const [deg, rad, s, c, t] of table) {
    for (const useRad of [false, true]) {
      const ang = useRad ? rad : `${deg}^{\\circ}`;
      const tag = useRad ? 'r' : 'd';
      out.push({ id: `sin${deg}${tag}`, deck: 'trig', prompt: `$\\sin ${ang}$`, answer: s, display: `$${s.toLatex()}$` });
      out.push({ id: `cos${deg}${tag}`, deck: 'trig', prompt: `$\\cos ${ang}$`, answer: c, display: `$${c.toLatex()}$` });
      if (t) out.push({ id: `tan${deg}${tag}`, deck: 'trig', prompt: `$\\tan ${ang}$`, answer: t, display: `$${t.toLatex()}$` });
      else out.push({ id: `tan${deg}${tag}`, deck: 'trig', prompt: `$\\tan ${ang}$`, answer: null, display: 'undefined', textAnswers: ['undefined', 'infinity', 'inf', 'none', 'does not exist'] });
    }
  }
  // second quadrant & radians conversions
  const conv: [number, Exact][] = [[30, piFrac(1, 6)], [45, piFrac(1, 4)], [60, piFrac(1, 3)], [90, piFrac(1, 2)], [120, piFrac(2, 3)], [135, piFrac(3, 4)], [150, piFrac(5, 6)], [180, piFrac(1, 1)], [270, piFrac(3, 2)], [360, piFrac(2, 1)]];
  for (const [deg, r] of conv) {
    out.push({ id: `d2r${deg}`, deck: 'trig', prompt: `$${deg}^{\\circ}$ in radians`, answer: r, display: `$${r.toLatex()}$` });
    out.push({ id: `r2d${deg}`, deck: 'trig', prompt: `$${r.toLatex()}$ in degrees`, answer: E(deg), display: `$${deg}^{\\circ}$` });
  }
  out.push({ id: 'sin120', deck: 'trig', prompt: '$\\sin 120^{\\circ}$', answer: surdFrac(1, 2, 3), display: '$\\frac{\\sqrt{3}}{2}$' });
  out.push({ id: 'cos120', deck: 'trig', prompt: '$\\cos 120^{\\circ}$', answer: frac(-1, 2), display: '$-\\frac{1}{2}$' });
  out.push({ id: 'tan135', deck: 'trig', prompt: '$\\tan 135^{\\circ}$', answer: E(-1), display: '$-1$' });
  out.push({ id: 'sin150', deck: 'trig', prompt: '$\\sin 150^{\\circ}$', answer: frac(1, 2), display: '$\\frac{1}{2}$' });
  out.push({ id: 'cos150', deck: 'trig', prompt: '$\\cos 150^{\\circ}$', answer: surdFrac(-1, 2, 3), display: '$-\\frac{\\sqrt{3}}{2}$' });
  out.push({ id: 'sin5pi6', deck: 'trig', prompt: '$\\sin \\frac{5\\pi}{6}$', answer: frac(1, 2), display: '$\\frac{1}{2}$' });
  out.push({ id: 'cos3pi4', deck: 'trig', prompt: '$\\cos \\frac{3\\pi}{4}$', answer: surdFrac(-1, 2, 2), display: '$-\\frac{\\sqrt{2}}{2}$' });
  out.push({ id: 'tan2pi3', deck: 'trig', prompt: '$\\tan \\frac{2\\pi}{3}$', answer: surd(3).neg(), display: '$-\\sqrt{3}$' });
  return out;
}

function fractionDecimals(): FactCard[] {
  const out: FactCard[] = [];
  const rows: [number, number, string][] = [
    [1, 7, '0.142857…'], [2, 7, '0.285714…'], [3, 7, '0.428571…'], [4, 7, '0.571428…'], [5, 7, '0.714285…'], [6, 7, '0.857142…'],
    [1, 8, '0.125'], [3, 8, '0.375'], [5, 8, '0.625'], [7, 8, '0.875'],
    [1, 9, '0.111…'], [2, 9, '0.222…'], [4, 9, '0.444…'], [5, 9, '0.555…'], [7, 9, '0.777…'], [8, 9, '0.888…'],
    [1, 11, '0.0909…'], [2, 11, '0.1818…'], [3, 11, '0.2727…'], [5, 11, '0.4545…'], [7, 11, '0.6363…'], [9, 11, '0.8181…'],
    [1, 12, '0.08333…'], [5, 12, '0.41666…'], [7, 12, '0.58333…'], [11, 12, '0.91666…'],
    [1, 6, '0.1666…'], [5, 6, '0.8333…'], [1, 16, '0.0625'], [3, 16, '0.1875'], [1, 3, '0.333…'], [2, 3, '0.666…'],
    [1, 15, '0.0666…'], [1, 20, '0.05'], [1, 25, '0.04'], [1, 40, '0.025'], [3, 20, '0.15'], [7, 20, '0.35'],
  ];
  for (const [a, b, d] of rows) {
    const approx = d.replace('…', '');
    out.push({ id: `f2d${a}_${b}`, deck: 'fractions', prompt: `$\\frac{${a}}{${b}}$ as a decimal`, answer: frac(a, b), display: `$${d}$` });
    out.push({ id: `d2f${a}_${b}`, deck: 'fractions', prompt: `$${approx}${d.endsWith('…') ? '\\ldots' : ''}$ as a fraction`, answer: frac(a, b), display: `$\\frac{${a}}{${b}}$` });
  }
  const pct: [number, number, string][] = [[1, 8, '12.5\\%'], [3, 8, '37.5\\%'], [1, 6, '16.7\\%'], [2, 3, '66.7\\%'], [1, 3, '33.3\\%'], [1, 12, '8.33\\%'], [1, 9, '11.1\\%'], [1, 7, '14.3\\%'], [5, 8, '62.5\\%'], [1, 16, '6.25\\%']];
  for (const [a, b, p] of pct) out.push({ id: `f2p${a}_${b}`, deck: 'fractions', prompt: `$\\frac{${a}}{${b}}$ as a percentage (3 s.f.)`, answer: frac(100 * a, b), display: `$${p}$` });
  return out;
}

function logs(): FactCard[] {
  const rows: [string, string][] = [['2', '0.301'], ['3', '0.477'], ['5', '0.699'], ['7', '0.845'], ['4', '0.602'], ['6', '0.778'], ['8', '0.903'], ['9', '0.954'], ['20', '1.301'], ['50', '1.699'], ['0.5', '-0.301'], ['200', '2.301']];
  const out: FactCard[] = rows.map(([x, v]) => ({ id: `log10_${x}`, deck: 'logs', prompt: `$\\log_{10} ${x}$ to 3 d.p.`, answer: dec(v), display: `$\\approx ${v}$` }));
  const exact: [string, Exact][] = [['\\log_{10} 1000', E(3)], ['\\log_{10} 0.01', E(-2)], ['\\log_{10} \\sqrt{10}', frac(1, 2)], ['\\log_2 \\frac{1}{8}', E(-3)], ['\\log_3 \\sqrt{3}', frac(1, 2)], ['\\log_5 125', E(3)], ['\\log_4 8', frac(3, 2)], ['\\log_8 2', frac(1, 3)], ['\\log_9 27', frac(3, 2)], ['\\log_{2} \\sqrt{2}', frac(1, 2)], ['\\log_{27} 3', frac(1, 3)], ['\\log_{16} 8', frac(3, 4)], ['\\ln e^3', E(3)], ['\\ln 1', E(0)], ['e^{\\ln 5}', E(5)]];
  for (const [p, a] of exact) out.push({ id: `lx_${p}`, deck: 'logs', prompt: `$${p}$`, answer: a, display: `$${a.toLatex()}$` });
  return out;
}

function physicsConstants(): FactCard[] {
  const rows: [string, string, Exact, string][] = [
    ['g (take)', '$g$ used in the ESAT, in m s$^{-2}$', E(10), '$10$'],
    ['c', 'Speed of light in m s$^{-1}$ (1 s.f.)', E(300000000), '$3 \\times 10^{8}$'],
    ['vsound', 'Speed of sound in air in m s$^{-1}$ (approx.)', E(340), '$\\approx 340$'],
    ['rho_w', 'Density of water in kg m$^{-3}$', E(1000), '$1000$'],
    ['patm', 'Atmospheric pressure in Pa (1 s.f.)', E(100000), '$1 \\times 10^{5}$'],
    ['kwh', '1 kWh in joules', E(3600000), '$3.6 \\times 10^{6}$'],
    ['rho_air', 'Density of air in kg m$^{-3}$ (approx.)', dec('1.2'), '$\\approx 1.2$'],
    ['e', 'Charge on an electron in C (2 s.f.)', dec('1.6e-19'), '$1.6 \\times 10^{-19}$'],
    ['year', 'Seconds in a year (1 s.f.)', E(30000000), '$\\approx 3 \\times 10^{7}$'],
    ['day', 'Seconds in a day', E(86400), '$86400$'],
    ['mph', '1 m s$^{-1}$ in km h$^{-1}$', dec('3.6'), '$3.6$'],
    ['ev', '1 eV in joules (2 s.f.)', dec('1.6e-19'), '$1.6 \\times 10^{-19}$'],
  ];
  return rows.map(([id, prompt, answer, display]) => ({ id: `phy_${id}`, deck: 'constants', prompt, answer, display }));
}

function prefixes(): FactCard[] {
  const rows: [string, string, number][] = [['G', 'giga', 9], ['M', 'mega', 6], ['k', 'kilo', 3], ['c', 'centi', -2], ['m', 'milli', -3], ['\\mu', 'micro', -6], ['n', 'nano', -9], ['p', 'pico', -12], ['T', 'tera', 12]];
  return rows.map(([sym, name, e]) => ({ id: `pre_${name}`, deck: 'constants', prompt: `$1\\,\\text{${name}}\\ (${sym})$ as a power of ten`, answer: Exact.rat(10n ** BigInt(Math.max(0, e)), 10n ** BigInt(Math.max(0, -e))), display: `$10^{${e}}$` }));
}

export const FACT_DECKS: FactDeck[] = [
  { key: 'squares', name: 'Squares to 30² and their roots', description: '11² … 30², √121 … √900', cards: squares() },
  { key: 'cubes', name: 'Cubes to 15³', description: '2³ … 15³ and cube roots', cards: cubes() },
  { key: 'powers', name: 'Powers of 2 and 3', description: '2⁴ … 2¹⁶, 3³ … 3⁸, log₂ and log₃ of them', cards: powers() },
  { key: 'primes', name: 'Primes to 100', description: 'prime or not, next prime', cards: primes() },
  { key: 'decimals', name: 'Surd, π and e decimals', description: '√2, √3, √5, π, π², 1/π … to 3 s.f.', cards: surdDecimals() },
  { key: 'trig', name: 'Exact trig table', description: 'sin/cos/tan of 0, 30, 45, 60, 90 in degrees and radians; conversions', cards: trigTable() },
  { key: 'fractions', name: 'Fraction ↔ decimal ↔ percentage', description: 'sevenths, eighths, ninths, elevenths, twelfths and friends', cards: fractionDecimals() },
  { key: 'logs', name: 'log₁₀ of 2, 3, 5, 7 and exact logs', description: 'three-figure logs and exact log values', cards: logs() },
  { key: 'constants', name: 'Physics constants and SI prefixes', description: 'g, c, densities, 1 kWh, prefixes', cards: [...physicsConstants(), ...prefixes()] },
];

export const ALL_FACTS: FactCard[] = FACT_DECKS.flatMap((d) => d.cards);

/** Draw n cards from the chosen decks, weighted by a per-card weakness weight if given. */
export function drawFacts(rng: RNG, deckKeys: string[], n: number, weights?: Record<string, number>): FactCard[] {
  const pool = FACT_DECKS.filter((d) => deckKeys.length === 0 || deckKeys.includes(d.key)).flatMap((d) => d.cards);
  if (pool.length === 0) return [];
  if (!weights) return rng.shuffle(pool).slice(0, Math.min(n, pool.length));
  const out: FactCard[] = [];
  const remaining = pool.slice();
  while (out.length < n && remaining.length > 0) {
    const w = remaining.map((c) => 1 + (weights[c.id] ?? 0));
    const c = rng.weighted(remaining, w);
    out.push(c);
    remaining.splice(remaining.indexOf(c), 1);
  }
  return out;
}
