import { defineTemplate, retry, type Level } from '../../core/template';
import { Exact, ratToDecimalString } from '../../core/exact';
import { statementOptions, STATEMENT_COMBOS } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import type { RNG } from '../../core/rng';

/**
 * "Which of the following statements are true?" about radioactivity.
 * Scenarios: a source with a half-life and an activity, a detector reading a count rate on top of a
 * background, and a named nuclide undergoing a named decay. Every question mixes properties of alpha,
 * beta and gamma radiation (penetration, ionisation, charge, deflection) with either a half-life
 * calculation or a nuclear-equation fact.
 * Level 1: three property/decay-shape statements (a quarter left after two half-lives, decay is random)
 * Level 2: one number: the activity after n half-lives, or the daughter's mass or proton number
 * Level 3: two numbers, plus deflection in fields and the fact that half-life cannot be changed
 * Level 4: the fraction decayed, or a count rate that needs the background subtracting
 * Level 5: two-step numbers: the time to reach a stated activity, the detector reading later on
 */

const BQ = '\\text{Bq}';

const n = (x: number): string => (Number.isInteger(x) ? `${x}` : `${Number(x.toPrecision(10))}`);
const r = (x: number): number => Number(x.toPrecision(12));

function ok(x: number): boolean {
  if (!Number.isFinite(x) || x <= 0) return false;
  let v: Exact;
  try { v = Exact.num(r(x)); } catch { return false; }
  if (!isCleanExact(v).ok) return false;
  const dec = ratToDecimalString(v.toRat());
  if (dec === null) return false;
  const digits = dec.replace('.', '').replace(/^0+/, '').replace(/0+$/, '');
  return digits.length <= 4;
}

const val = (x: number, unit: string): string => `$${n(x)}\\ ${unit}$`;
const fracTex = (x: number): string => `$${Exact.num(r(x)).toLatex({ format: 'fraction' })}$`;

const FRACTION_WORDS: Record<number, string> = { 4: 'one quarter', 8: 'one eighth', 16: 'one sixteenth', 32: 'one thirty-second' };

interface Stmt {
  key: string;
  text: string;
  truth: boolean;
  claim: number | null;
  tier: number;
  group?: string;
  why: string;
}

interface Built {
  intro: string;
  params: Record<string, number>;
  pool: Stmt[];
}

function numeric(rng: RNG, key: string, tier: number, trueVal: number, falseVals: number[], render: (x: number) => string, why: string, group?: string): Stmt | null {
  if (!ok(trueVal)) return null;
  const falses = falseVals.map(r).filter((f) => ok(f) && Math.abs(f - trueVal) > 1e-12 * Math.max(1, trueVal));
  const useTrue = falses.length === 0 || rng.bool(0.5);
  const claim = useTrue ? r(trueVal) : rng.pick(falses);
  return { key, text: render(claim), truth: useTrue, claim, tier, group, why };
}

function qual(rng: RNG, key: string, tier: number, trueText: string, falseText: string, why: string, group?: string): Stmt {
  const t = rng.bool(0.5);
  return { key, text: t ? trueText : falseText, truth: t, claim: null, tier, group, why };
}

const keep = (xs: (Stmt | null)[]): Stmt[] => xs.filter((s): s is Stmt => s !== null);
/** Count rates are whole numbers of counts, so a claimed rate of 32.5 would give itself away. */
const whole = (xs: number[]): number[] => xs.filter((x) => Number.isInteger(r(x)));

// ----------------------------------------------------------------------------- shared statements

/** Properties of the three radiations, and facts about nuclear equations: true for every scenario. */
function properties(rng: RNG): Stmt[] {
  return [
    qual(rng, 'alpha-pen', 1,
      'Alpha particles are the least penetrating of the three radiations.',
      'Alpha particles are the most penetrating of the three radiations.',
      'alpha is stopped by paper while gamma needs thick lead', 'penetration'),
    qual(rng, 'alpha-ion', 1,
      'Alpha particles are the most strongly ionising of the three radiations.',
      'Alpha particles are the least strongly ionising of the three radiations.',
      'an alpha particle is heavy and carries charge +2e, so it ionises most strongly', 'ionisation'),
    qual(rng, 'beta-charge', 1,
      'A beta-minus particle is negatively charged.',
      'A beta-minus particle is positively charged.',
      'a beta-minus particle is a fast-moving electron', 'charge'),
    qual(rng, 'random', 1,
      'Radioactive decay is a random process.',
      'It can be predicted exactly which nucleus in a sample will decay next.',
      'decay is random and spontaneous; only the average behaviour is predictable'),
    qual(rng, 'paper', 2,
      'Alpha radiation is stopped by a sheet of paper.',
      'Alpha radiation passes through paper but is stopped by a few millimetres of aluminium.',
      'paper stops alpha; a few millimetres of aluminium stops beta', 'penetration'),
    qual(rng, 'lead', 2,
      'Gamma radiation is only significantly reduced by several centimetres of lead.',
      'Gamma radiation is stopped by a thin sheet of aluminium.',
      'gamma is the most penetrating: it needs thick lead or concrete', 'penetration'),
    qual(rng, 'beta-A', 2,
      'Beta-minus decay leaves the mass number of the nucleus unchanged.',
      'Beta-minus decay decreases the mass number of the nucleus by 1.',
      'a beta particle has mass number 0: a neutron simply becomes a proton', 'equation'),
    qual(rng, 'gamma-AZ', 2,
      'Gamma emission changes neither the mass number nor the proton number.',
      'Gamma emission decreases the mass number by 4.',
      'a gamma ray carries away energy but no nucleons and no charge', 'equation'),
    qual(rng, 'alpha-Z', 2,
      'Alpha decay decreases the proton number of the nucleus by 2.',
      'Alpha decay decreases the proton number of the nucleus by 4.',
      'an alpha particle is 2 protons and 2 neutrons: A falls by 4 and Z by 2', 'equation'),
    qual(rng, 'deflect', 3,
      'In a magnetic field, alpha particles and beta-minus particles are deflected in opposite directions.',
      'In a magnetic field, alpha particles and beta-minus particles are deflected in the same direction.',
      'their charges have opposite signs, so the magnetic forces act in opposite directions', 'field'),
    qual(rng, 'gamma-field', 3,
      'Gamma rays are undeflected by an electric field.',
      'Gamma rays are deflected towards the negative plate of an electric field.',
      'gamma rays are uncharged, so no electric force acts on them', 'field'),
    qual(rng, 'temperature', 3,
      'Heating the source would not change its half-life.',
      'Heating the source would shorten its half-life.',
      'half-life is unaffected by temperature, pressure or chemical state'),
  ];
}

/** The shape of exponential decay. */
function decayShape(rng: RNG): Stmt[] {
  return [
    qual(rng, 'halves', 1,
      'The activity of the source halves during every half-life.',
      'The activity of the source falls by the same number of becquerels during each successive half-life.',
      'decay is exponential: each half-life halves whatever is left', 'shape'),
    qual(rng, 'quarter', 1,
      'After two half-lives, a quarter of the original nuclei remain.',
      'After two half-lives, none of the original nuclei remain.',
      'two halvings leave $(1/2)^2 = 1/4$ of the nuclei', 'shape'),
    qual(rng, 'zero', 3,
      'Even after ten half-lives the count rate has not fallen to zero.',
      'The count rate falls to zero after ten half-lives.',
      'halving never reaches zero: after ten half-lives about 1/1024 is left', 'shape'),
  ];
}

// ----------------------------------------------------------------------------- scenarios

interface TimeUnit { word: string }
const UNITS: TimeUnit[] = [{ word: 'minutes' }, { word: 'hours' }, { word: 'days' }];

function sourceScenario(rng: RNG): Built | null {
  const T = rng.pick([2, 3, 4, 5, 6, 8, 10, 12, 20]);
  const u = rng.pick(UNITS);
  const A0 = rng.pick([320, 640, 800, 960, 1280, 1600]);
  const k = rng.int(2, 4);
  const j = rng.pick([3, 4, 5]);
  const m = rng.pick([4, 5]);
  if (!Number.isInteger(A0 / 2 ** k) || !Number.isInteger(A0 / 2 ** m)) return null;
  return {
    intro: `A radioactive source has a half-life of ${T} ${u.word} and an initial activity of ${val(A0, BQ)}.`,
    params: { T, A0, k, j, m },
    pool: keep([
      ...decayShape(rng),
      ...properties(rng),
      numeric(rng, 'activity', 2, A0 / 2 ** k, [A0 / (2 * k), A0 - A0 / 2 ** k], (x) => `After ${k * T} ${u.word} the activity of the source is ${val(x, BQ)}.`,
        `${k * T} ${u.word} is ${k} half-lives, so the activity is $${A0} \\div ${2 ** k} = ${n(A0 / 2 ** k)}$ Bq`, 'number'),
      numeric(rng, 'time-to', 3, j * T, [T * 2 ** j, T / j], (x) => `The activity falls to ${FRACTION_WORDS[2 ** j]} of its initial value after ${n(x)} ${u.word}.`,
        `falling to $1/${2 ** j}$ takes ${j} half-lives: $${j} \\times ${T} = ${j * T}$ ${u.word}`, 'time'),
      numeric(rng, 'decayed', 4, 1 - 1 / 2 ** k, [1 / 2 ** k, 1 - 1 / 2 ** (k - 1)], (x) => `After ${k} half-lives, ${fracTex(x)} of the original nuclei have decayed.`,
        `the fraction left is $1/${2 ** k}$, so the fraction decayed is $1 - 1/${2 ** k}$`, 'fraction'),
      numeric(rng, 'time-to-value', 5, m * T, [T * 2 ** m, (T * A0) / (A0 / 2 ** m)], (x) => `The activity of the source falls to ${val(A0 / 2 ** m, BQ)} after ${n(x)} ${u.word}.`,
        `$${A0} \\div ${n(A0 / 2 ** m)} = ${2 ** m} = 2^{${m}}$, so ${m} half-lives pass: $${m} \\times ${T} = ${m * T}$ ${u.word}`, 'time'),
    ]),
  };
}

function detectorScenario(rng: RNG): Built | null {
  const T = rng.pick([2, 3, 4, 5, 6, 10, 12]);
  const u = rng.pick([{ word: 'minutes' }, { word: 'hours' }, { word: 'days' }]);
  const B = rng.pick([10, 20, 25, 40]);
  const src = rng.pick([320, 480, 640, 800, 960]);
  const R0 = src + B;
  const k = rng.int(2, 3);
  if (!Number.isInteger(src / 2 ** (k + 1))) return null;
  return {
    intro: `A detector placed next to a radioactive source records ${R0} counts per minute. With the source removed, the detector records ${B} counts per minute. The source has a half-life of ${T} ${u.word}.`,
    params: { R0, B, T, k },
    pool: keep([
      ...decayShape(rng),
      ...properties(rng),
      numeric(rng, 'corrected', 2, src, whole([R0, R0 + B]), (x) => `The count rate due to the source alone is ${n(x)} counts per minute.`,
        `subtract the background: $${R0} - ${B} = ${src}$ counts per minute`, 'number'),
      qual(rng, 'background', 3,
        'The background count rate stays the same as the source decays.',
        'The background count rate halves every half-life, just as the source does.',
        'background radiation comes from the surroundings and does not decay with this source'),
      numeric(rng, 'source-after', 3, src / 2, whole([R0 / 2, src / 2 + B]), (x) => `After ${T} ${u.word} the count rate due to the source alone will be ${n(x)} counts per minute.`,
        `the corrected rate $${src}$ halves once: $${n(src / 2)}$ counts per minute`, 'number'),
      numeric(rng, 'total-after', 4, src / 2 ** k + B, whole([R0 / 2 ** k, src / 2 ** k, src / 2 ** (k + 1) + B]), (x) => `After ${k * T} ${u.word} the detector will record ${n(x)} counts per minute.`,
        `the source contributes $${src} \\div ${2 ** k} = ${n(src / 2 ** k)}$, and the background is still there: $${n(src / 2 ** k)} + ${B} = ${n(src / 2 ** k + B)}$`, 'later'),
      numeric(rng, 'total-later', 5, src / 2 ** (k + 1) + B, whole([src / 2 ** (k + 1), R0 / 2 ** (k + 1), src / 2 ** k + B]), (x) => `After ${(k + 1) * T} ${u.word} the detector will record ${n(x)} counts per minute.`,
        `after ${k + 1} half-lives the source gives $${n(src / 2 ** (k + 1))}$, so the detector reads $${n(src / 2 ** (k + 1) + B)}$ counts per minute`, 'later'),
    ]),
  };
}

const SYMBOLS: Record<number, string> = { 82: 'Pb', 83: 'Bi', 84: 'Po', 85: 'At', 86: 'Rn', 87: 'Fr', 88: 'Ra', 89: 'Ac', 90: 'Th', 91: 'Pa', 92: 'U', 6: 'C', 7: 'N', 11: 'Na', 12: 'Mg', 27: 'Co', 28: 'Ni', 38: 'Sr', 39: 'Y', 53: 'I', 54: 'Xe', 55: 'Cs', 56: 'Ba' };
const nuc = (A: number, Z: number): string => `^{${A}}_{${Z}}\\text{${SYMBOLS[Z]}}`;
const ALPHA_NUCLIDES: [number, number][] = [[238, 92], [226, 88], [222, 86], [218, 84], [210, 84], [232, 90]];
const BETA_NUCLIDES: [number, number][] = [[14, 6], [60, 27], [90, 38], [131, 53], [137, 55], [234, 90]];

function nuclideScenario(rng: RNG): Built | null {
  const alpha = rng.bool(0.6);
  const [A, Z] = rng.pick(alpha ? ALPHA_NUCLIDES : BETA_NUCLIDES);
  const dA = alpha ? A - 4 : A;
  const dZ = alpha ? Z - 2 : Z + 1;
  if (!SYMBOLS[dZ]) return null;
  return {
    intro: `A nucleus of $${nuc(A, Z)}$ decays by ${alpha ? 'emitting an alpha particle' : 'beta-minus emission'}.`,
    params: { A, Z, alpha: alpha ? 1 : 0 },
    pool: keep([
      ...properties(rng),
      ...decayShape(rng).filter((s) => s.key !== 'halves'),
      numeric(rng, 'parent-N', 2, A - Z, [A, Z], (x) => `The original nucleus contains ${n(x)} neutrons.`,
        `neutrons $= A - Z = ${A} - ${Z} = ${A - Z}$`, 'count'),
      numeric(rng, 'daughter-A', 2, dA, [alpha ? A - 2 : A - 1, A], (x) => `The nucleus produced has mass number ${n(x)}.`,
        alpha ? `an alpha particle takes away 4 nucleons: $${A} - 4 = ${dA}$` : `a beta particle has mass number 0, so $A$ stays at $${A}$`, 'daughter'),
      numeric(rng, 'daughter-Z', 3, dZ, [alpha ? Z - 4 : Z - 1, Z], (x) => `The nucleus produced contains ${n(x)} protons.`,
        alpha ? `an alpha particle takes away 2 protons: $${Z} - 2 = ${dZ}$` : `beta-minus turns a neutron into a proton: $${Z} + 1 = ${dZ}$`, 'daughter'),
      numeric(rng, 'daughter-N', 4, dA - dZ, [A - Z, alpha ? A - Z - 4 : A - Z + 1], (x) => `The nucleus produced contains ${n(x)} neutrons.`,
        `the daughter is $${nuc(dA, dZ)}$, so it has $${dA} - ${dZ} = ${dA - dZ}$ neutrons`, 'count'),
    ]),
  };
}

// ----------------------------------------------------------------------------- selection

/** Three statements for the level: the hardest allowed tier must appear, and numbers appear from level 2. */
function choose(rng: RNG, pool: Stmt[], level: Level): Stmt[] | null {
  const eligible = pool.filter((s) => s.tier <= level);
  const minHard = level <= 2 ? level : level - 1;
  const hard = eligible.filter((s) => s.tier >= minHard);
  if (hard.length === 0) return null;
  const wantHard = level === 1 ? 3 : level >= 4 ? 2 : 1;
  const needNums = level >= 3 ? 2 : level >= 2 ? 1 : 0;
  const chosen: Stmt[] = [];
  const usedGroups = new Set<string>();
  const take = (s: Stmt) => {
    if (chosen.length >= 3 || chosen.some((c) => c.key === s.key) || (s.group && usedGroups.has(s.group))) return;
    chosen.push(s);
    if (s.group) usedGroups.add(s.group);
  };
  for (const s of rng.shuffle(hard)) { if (chosen.length >= wantHard) break; take(s); }
  const nums = () => chosen.filter((s) => s.claim !== null).length;
  for (const s of rng.shuffle(eligible.filter((s) => s.claim !== null))) { if (nums() >= needNums || chosen.length >= 3) break; take(s); }
  for (const s of rng.shuffle(eligible)) { if (chosen.length >= 3) break; take(s); }
  if (chosen.length < 3 || nums() < needNums) return null;
  return rng.shuffle(chosen);
}

const SCENARIOS: Record<string, (rng: RNG) => Built | null> = { source: sourceScenario, detector: detectorScenario, nuclide: nuclideScenario };

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'phy.nuclear.which-statements',
  module: 'PHY',
  topic: 'nuclear',
  title: 'Which statements are true (radioactivity)',
  levels: {
    1: 'penetration, ionisation, charge, and the shape of exponential decay',
    2: 'one number: the activity after n half-lives, or the daughter nuclide',
    3: 'two numbers, deflection in fields, and half-life being fixed',
    4: 'the fraction decayed, or a count rate needing the background subtracted',
    5: 'two-step numbers: the time to reach a stated activity, a later detector reading',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      const scenario = rng.pick(Object.keys(SCENARIOS));
      const built = SCENARIOS[scenario](rng);
      if (!built) return null;
      const stmts = choose(rng, built.pool, level);
      if (!stmts) return null;
      const truth = stmts.map((s) => s.truth) as [boolean, boolean, boolean];
      const options = statementOptions(truth);
      const correct = options.find((o) => o.correct)!.display;
      const stem = `${built.intro}\n\nWhich of the following statements are true?\n\nI. ${stmts[0].text}\nII. ${stmts[1].text}\nIII. ${stmts[2].text}`;
      const solution = stmts.map((s, i) => `${['I', 'II', 'III'][i]}: ${s.truth ? 'true' : 'false'} — ${s.why}.`).join(' ');
      return {
        stem,
        answer: { kind: 'choice' as const, value: correct },
        options,
        solution,
        trap: 'Alpha ionises most but penetrates least; decay halves and never reaches zero; background does not decay; alpha changes Z by 2 and A by 4, beta-minus changes Z by 1 and A not at all.',
        tags: ['nuclear', 'statements', scenario],
        params: { scenario, ...built.params, truth, stmts: stmts.map((s) => ({ key: s.key, claim: s.claim, text: s.text })) },
        typedAllowed: false,
      };
    });
  },
  verify(q) {
    if (q.answer.kind !== 'choice') return false;
    const p = q.params as Record<string, number> & { scenario: string; stmts: { key: string; claim: number | null; text: string }[] };
    const close = (a: number, b: number) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b));
    const decay = (t: number, T: number) => Math.pow(2, -t / T);

    /** Numeric statements: recomputed with the continuous law 2^(−t/T), or from conservation of A and Z. */
    const trueValue = (key: string): number | null => {
      switch (p.scenario) {
        case 'source':
          return {
            activity: p.A0 * decay(p.k * p.T, p.T),
            'time-to': p.j * p.T,
            decayed: 1 - decay(p.k * p.T, p.T),
            'time-to-value': p.m * p.T,
          }[key] ?? null;
        case 'detector': {
          const src = p.R0 - p.B;
          return {
            corrected: src,
            'source-after': src * decay(p.T, p.T),
            'total-after': src * decay(p.k * p.T, p.T) + p.B,
            'total-later': src * decay((p.k + 1) * p.T, p.T) + p.B,
          }[key] ?? null;
        }
        case 'nuclide': {
          const dA = p.alpha ? 4 : 0, dZ = p.alpha ? 2 : -1;   // particle carried away
          const A2 = p.A - dA, Z2 = p.Z - dZ;
          return { 'parent-N': p.A - p.Z, 'daughter-A': A2, 'daughter-Z': Z2, 'daughter-N': A2 - Z2 }[key] ?? null;
        }
        default:
          return null;
      }
    };
    /** Qualitative statements: the truth is read back out of the wording. */
    const qualTruth = (key: string, text: string): boolean | null => {
      switch (key) {
        case 'alpha-pen': return /least penetrating/.test(text);
        case 'alpha-ion': return /most strongly ionising/.test(text);
        case 'beta-charge': return /negatively/.test(text);
        case 'random': return /random process/.test(text);
        case 'paper': return /stopped by a sheet of paper/.test(text);
        case 'lead': return /lead/.test(text);
        case 'beta-A': return /unchanged/.test(text);
        case 'gamma-AZ': return /neither/.test(text);
        case 'alpha-Z': return /by 2/.test(text);
        case 'deflect': return /opposite directions/.test(text);
        case 'gamma-field': return /undeflected/.test(text);
        case 'temperature': return /not change/.test(text);
        case 'halves': return /halves/.test(text);
        case 'quarter': return /a quarter/.test(text);
        case 'zero': return /has not fallen to zero/.test(text);
        case 'background': return /stays the same/.test(text);
        default: return null;
      }
    };
    const truth: boolean[] = [];
    for (const s of p.stmts) {
      if (s.claim === null) {
        const t = qualTruth(s.key, s.text);
        if (t === null) return false;
        truth.push(t);
      } else {
        const expected = trueValue(s.key);
        if (expected === null) return false;
        truth.push(close(s.claim, expected));
      }
    }
    const names = ['I', 'II', 'III'].filter((_, i) => truth[i]);
    let expected: string;
    if (names.length === 0) expected = 'none of them';
    else if (names.length === 3) expected = 'I, II and III';
    else if (names.length === 1) expected = `${names[0]} only`;
    else expected = `${names[0]} and ${names[1]} only`;
    return STATEMENT_COMBOS.includes(expected) && q.answer.value === expected && q.options.filter((o) => o.correct).length === 1;
  },
});
