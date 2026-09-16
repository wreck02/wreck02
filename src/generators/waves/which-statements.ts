import { defineTemplate, retry, type Level } from '../../core/template';
import { Exact, ratToDecimalString } from '../../core/exact';
import { statementOptions, STATEMENT_COMBOS } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import type { RNG } from '../../core/rng';

/**
 * "Which of the following statements are true?" about a described wave.
 * Scenarios: a note travelling through air, light entering a glass block, a wave on a stretched string whose
 * tension is changed, and ripples crossing into shallower water. Each question takes three statements from the
 * scenario's pool; a statement is either qualitative (longitudinal vs transverse, what a boundary does to f, λ
 * and v, what sets the pitch) or numeric, with a claim that is either the true value or the value a named
 * mistake produces. Standing waves are deliberately excluded.
 * Level 1: three easy statements, mostly qualitative plus one one-step number
 * Level 2: a second number (the period, the speed in the glass)
 * Level 3: two numbers, e.g. the wavelength in the glass and the frequency in air
 * Level 4: a hypothetical change (double the frequency, double the wave speed) worked through
 * Level 5: two-step numbers — an echo time, the wavelength of the same note in water, sin C for the glass
 */

const MS = '\\text{m s}^{-1}';
const HZ = '\\text{Hz}';
const M = '\\text{m}';
const S = '\\text{s}';
const NM = '\\text{nm}';
const CM = '\\text{cm}';
const C = 3e8;

/** Plain number for a stem: 1200, 0.05, 3.4. */
const n = (x: number): string => (Number.isInteger(x) ? `${x}` : `${Number(x.toPrecision(10))}`);
/** Round away floating-point noise. */
const r = (x: number): number => Number(x.toPrecision(12));

/** Would a real paper print this number? (at most 4 significant figures, positive, clean) */
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

/** Standard form for the big and small quantities of optics. */
const sf = (x: number): string => Exact.num(r(x)).toLatex({ format: 'sf' });
const val = (x: number, unit: string): string => `$${n(x)}\\ ${unit}$`;
const sfVal = (x: number, unit: string): string => `$${sf(x)}\\ ${unit}$`;

interface Stmt {
  key: string;
  text: string;
  truth: boolean;
  /** the number quoted in a numeric statement (null for a qualitative one) */
  claim: number | null;
  tier: number;
  /** at most one statement per group is used in a question */
  group?: string;
  why: string;
}

interface Built {
  intro: string;
  params: Record<string, number>;
  pool: Stmt[];
}

/** A numeric statement: the quoted value is the true one or one of the mistake values, at random. */
function numeric(rng: RNG, key: string, tier: number, trueVal: number, falseVals: number[], render: (x: number) => string, why: string, group?: string): Stmt | null {
  if (!ok(trueVal)) return null;
  const falses = falseVals.map(r).filter((f) => ok(f) && Math.abs(f - trueVal) > 1e-12 * Math.max(1, trueVal));
  const useTrue = falses.length === 0 || rng.bool(0.5);
  const claim = useTrue ? r(trueVal) : rng.pick(falses);
  return { key, text: render(claim), truth: useTrue, claim, tier, group, why };
}

/** A qualitative statement shown in its true or its false wording, at random. */
function qual(rng: RNG, key: string, tier: number, trueText: string, falseText: string, why: string, group?: string): Stmt {
  const t = rng.bool(0.5);
  return { key, text: t ? trueText : falseText, truth: t, claim: null, tier, group, why };
}

const keep = (xs: (Stmt | null)[]): Stmt[] => xs.filter((s): s is Stmt => s !== null);
/** Counts of whole waves must stay whole numbers, or a false claim gives itself away. */
const ints = (xs: number[]): number[] => xs.filter((x) => Number.isInteger(r(x)));

// ----------------------------------------------------------------------------- scenarios

function airSound(rng: RNG): Built | null {
  const v = 340;
  const f = rng.pick([100, 170, 200, 340, 500, 680, 1000]);
  const lam = r(v / f);
  const t = rng.pick([2, 3, 5]);
  const tEcho = rng.pick([0.5, 1, 2]);
  const dEcho = r((v * tEcho) / 2);
  const vWater = 1500;
  return {
    intro: `A sound wave of frequency ${val(f, HZ)} travels through air at ${val(v, MS)}.`,
    params: { v, f, t, tEcho, vWater },
    pool: keep([
      qual(rng, 'longitudinal', 1,
        'Sound in air is a longitudinal wave.',
        'Sound in air is a transverse wave.',
        'the air is compressed and rarefied along the direction of travel, so sound is longitudinal'),
      qual(rng, 'pitch', 1,
        'The pitch of the note is determined by the frequency of the wave.',
        'The pitch of the note is determined by the amplitude of the wave.',
        'pitch goes with frequency; amplitude sets the loudness'),
      // group 'double': the doubled-frequency statements are derived from this one, and quoting both
      // lets a candidate settle them against each other instead of against the numbers
      numeric(rng, 'lambda', 1, lam, [r(f / v), r(lam / 2), r(2 * lam)], (x) => `The wavelength of the sound in air is ${val(x, M)}.`,
        `$\\lambda = v/f = ${v}/${f} = ${n(lam)}$ m`, 'double'),
      qual(rng, 'speed-f', 2,
        'Doubling the frequency of the note would leave the speed of the sound in the air unchanged.',
        'Doubling the frequency of the note would double the speed of the sound in the air.',
        'the speed of sound is a property of the air, not of the source'),
      numeric(rng, 'period', 2, r(1 / f), [f, r(2 / f)], (x) => `The period of the wave is ${val(x, S)}.`,
        `$T = 1/f = 1/${f} = ${n(r(1 / f))}$ s`),
      qual(rng, 'double-f', 2,
        'Doubling the frequency of the note would halve its wavelength in the same air.',
        'Doubling the frequency of the note would double its wavelength in the same air.',
        'v is fixed by the air, so λ = v/f is halved when f doubles', 'double'),
      numeric(rng, 'lambda-double', 3, r(lam / 2), [r(2 * lam), lam], (x) => `If the frequency were doubled, the wavelength of the sound in this air would be ${val(x, M)}.`,
        `at $2f$ the wavelength is $v/2f = ${n(r(lam / 2))}$ m`, 'double'),
      numeric(rng, 'distance', 3, r(v * t), [r(v / t), r(v * t * 2)], (x) => `The sound travels ${val(x, M)} in ${val(t, S)}.`,
        `distance $= vt = ${v} \\times ${t} = ${n(r(v * t))}$ m`),
      numeric(rng, 'count', 4, r(f * t), ints([f, r(2 * f * t), r((f * t) / 2)]), (x) => `In ${val(t, S)}, ${n(x)} complete waves pass a fixed point.`,
        `the frequency is the number of waves each second: $${f} \\times ${t} = ${n(r(f * t))}$`),
      numeric(rng, 'echo', 5, tEcho, [r(dEcho / v), r((4 * dEcho) / v)], (x) => `An echo from a wall ${val(dEcho, M)} away would return ${val(x, S)} after the sound is made.`,
        `the sound covers $2 \\times ${n(dEcho)} = ${n(2 * dEcho)}$ m, so $t = ${n(2 * dEcho)}/${v} = ${n(tEcho)}$ s`),
      numeric(rng, 'lambda-water', 5, r(vWater / f), [lam, r(f / vWater)], (x) => `The same note in water, where sound travels at ${val(vWater, MS)}, has wavelength ${val(x, M)}.`,
        `the frequency is unchanged, so $\\lambda = ${vWater}/${f} = ${n(r(vWater / f))}$ m`),
    ]),
  };
}

const GLASS: [number, number][] = [[600, 1.5], [900, 1.5], [450, 1.5], [600, 2], [400, 2], [500, 1.25], [480, 1.2]];

function glassLight(rng: RNG): Built | null {
  const [lamNm, nIdx] = rng.pick(GLASS);
  const lamGlass = r(lamNm / nIdx);
  const vGlass = r(C / nIdx);
  const fAir = r(3e17 / lamNm);
  const sinC = r(1 / nIdx);
  if (!Number.isInteger(lamGlass)) return null;
  return {
    intro: `A ray of light of wavelength ${val(lamNm, NM)} in air enters a glass block of refractive index ${n(nIdx)}. The speed of light in air is ${sfVal(C, MS)}.`,
    params: { lamNm, n: nIdx },
    pool: keep([
      qual(rng, 'freq-unchanged', 1,
        'The frequency of the light is unchanged on entering the glass.',
        'The frequency of the light decreases on entering the glass.',
        'the frequency is set by the source and never changes at a boundary'),
      qual(rng, 'lambda-dec', 1,
        'The wavelength of the light decreases on entering the glass.',
        'The wavelength of the light increases on entering the glass.',
        'the speed falls by a factor of n and the frequency is fixed, so λ = v/f falls too'),
      qual(rng, 'transverse', 1,
        'Light is a transverse wave.',
        'Light is a longitudinal wave.',
        'light is an electromagnetic wave, and electromagnetic waves are transverse'),
      numeric(rng, 'speed', 2, vGlass, [r(C * nIdx), C], (x) => `The speed of the light inside the glass is ${sfVal(x, MS)}.`,
        `$v = c/n = ${sf(C)}/${n(nIdx)} = ${sf(vGlass)}$ m s$^{-1}$`),
      qual(rng, 'bends', 2,
        'On entering the glass the ray bends towards the normal.',
        'On entering the glass the ray bends away from the normal.',
        'entering a denser medium the ray slows and bends towards the normal'),
      numeric(rng, 'lambda-glass', 3, lamGlass, [r(lamNm * nIdx), lamNm], (x) => `The wavelength of the light inside the glass is ${val(x, NM)}.`,
        `$\\lambda_{\\text{glass}} = \\lambda/n = ${lamNm}/${n(nIdx)} = ${n(lamGlass)}$ nm`),
      numeric(rng, 'freq-air', 3, fAir, [r(C / lamNm), r(C * lamNm * 1e-9)], (x) => `The frequency of the light in air is ${sfVal(x, HZ)}.`,
        `$f = c/\\lambda = ${sf(C)}/(${lamNm} \\times 10^{-9}) = ${sf(fAir)}$ Hz`),
      numeric(rng, 'freq-glass', 4, fAir, [r(fAir / nIdx), r(fAir * nIdx)], (x) => `The frequency of the light inside the glass is ${sfVal(x, HZ)}.`,
        `the frequency does not change at the boundary, so it is still ${sf(fAir)} Hz`),
      numeric(rng, 'sinC', 5, sinC, [r(1 - sinC), r(sinC / 2), r(sinC * sinC)], (x) => `For a ray inside this glass meeting the boundary with air, $\\sin C = ${Exact.num(x).toLatex({ format: 'fraction' })}$, where $C$ is the critical angle.`,
        `$\\sin C = 1/n = 1/${n(nIdx)} = ${Exact.num(sinC).toLatex({ format: 'fraction' })}$`),
    ]),
  };
}

const STRING_PAIRS: [number, number][] = [[12, 4], [20, 10], [20, 5], [24, 8], [30, 15], [40, 10], [40, 20], [50, 25], [30, 5]];

function stringWave(rng: RNG): Built | null {
  const [v, f] = rng.pick(STRING_PAIRS);
  const lam = r(v / f);
  const t = rng.pick([3, 4, 5, 10]);
  return {
    intro: `A wave of frequency ${val(f, HZ)} travels along a stretched string at ${val(v, MS)}.`,
    params: { v, f, t },
    pool: keep([
      qual(rng, 'transverse', 1,
        'The wave on the string is transverse.',
        'The wave on the string is longitudinal.',
        'the string moves at right angles to the direction the wave travels'),
      // group 'change': the doubled-speed statements are this wavelength scaled, so only one may appear
      numeric(rng, 'lambda', 1, lam, [r(f / v), r(v * f)], (x) => `The wavelength of the wave is ${val(x, M)}.`,
        `$\\lambda = v/f = ${v}/${f} = ${n(lam)}$ m`, 'change'),
      qual(rng, 'tension', 1,
        'Increasing the tension in the string increases the speed of the wave along it.',
        'Increasing the tension in the string decreases the speed of the wave along it.',
        'a tighter string carries waves faster'),
      numeric(rng, 'period', 2, r(1 / f), [f, r(2 / f)], (x) => `The period of the wave is ${val(x, S)}.`,
        `$T = 1/f = 1/${f} = ${n(r(1 / f))}$ s`),
      qual(rng, 'double-f', 2,
        'Doubling the frequency at the same tension would halve the wavelength.',
        'Doubling the frequency at the same tension would double the wavelength.',
        'the tension fixes v, so λ = v/f halves when f doubles', 'change'),
      numeric(rng, 'count', 3, r(f * t), ints([f, r(2 * f * t), r((f * t) / 2)]), (x) => `In ${val(t, S)}, ${n(x)} complete waves pass a point on the string.`,
        `$${f} \\times ${t} = ${n(r(f * t))}$ waves`),
      numeric(rng, 'tension-lambda', 4, r((2 * v) / f), [lam, r(v / (2 * f))], (x) => `If the tension were increased so that the wave speed doubled, with the frequency kept at ${val(f, HZ)}, the wavelength would be ${val(x, M)}.`,
        `$\\lambda = v/f$ with $v$ doubled gives $${n(r((2 * v) / f))}$ m`, 'change'),
      numeric(rng, 'tension-f', 5, r(2 * f), [f, r(f / 2)], (x) => `If the tension were increased so that the wave speed doubled, with the wavelength kept at ${val(lam, M)}, the frequency would be ${val(x, HZ)}.`,
        `$f = v/\\lambda$ with $v$ doubled gives $${n(r(2 * f))}$ Hz`, 'change'),
    ]),
  };
}

const RIPPLES: [number, number, number][] = [[4, 12, 6], [2, 6, 3], [5, 15, 9], [3, 12, 8], [6, 12, 4], [4, 20, 15], [5, 20, 12]];

function ripples(rng: RNG): Built | null {
  const [lam1, v1, v2] = rng.pick(RIPPLES);
  const f = r(v1 / lam1);
  const lam2 = r(v2 / f);
  const t = rng.pick([2, 4, 5, 10]);
  if (!Number.isInteger(f) || !ok(lam2)) return null;
  return {
    intro: `Water waves of wavelength ${val(lam1, CM)} travel at ${val(v1, '\\text{cm s}^{-1}')} across a ripple tank. They then cross into a shallower region, where their speed falls to ${val(v2, '\\text{cm s}^{-1}')}.`,
    params: { lam1, v1, v2, t },
    pool: keep([
      qual(rng, 'freq-same', 1,
        'The frequency of the waves is the same in both regions of the tank.',
        'The frequency of the waves falls as they cross into the shallow region.',
        'the frequency is set by the dipper making the waves, not by the depth'),
      numeric(rng, 'freq', 1, f, [r(lam1 / v1), r(v1 * lam1)], (x) => `The frequency of the waves is ${val(x, HZ)}.`,
        `$f = v/\\lambda = ${v1}/${lam1} = ${n(f)}$ Hz`),
      qual(rng, 'transverse', 1,
        'The water waves are transverse.',
        'The water waves are longitudinal.',
        'the surface moves up and down while the wave travels sideways'),
      numeric(rng, 'lambda2', 2, lam2, [lam1, r(lam1 * (v1 / v2))], (x) => `The wavelength of the waves in the shallow region is ${val(x, CM)}.`,
        `the frequency is unchanged, so $\\lambda = v/f = ${v2}/${n(f)} = ${n(lam2)}$ cm`),
      qual(rng, 'ratio', 2,
        'The wavelength changes in the same ratio as the speed.',
        'The wavelength is unchanged when the speed changes.',
        'λ = v/f with f fixed, so λ ∝ v'),
      numeric(rng, 'period', 3, r(1 / f), [f, r(2 / f)], (x) => `The period of the waves is ${val(x, S)}.`,
        `$T = 1/f = 1/${n(f)} = ${n(r(1 / f))}$ s`),
      numeric(rng, 'distance', 4, r(v1 * t), [r(v2 * t), r(v1 / t)], (x) => `In the deeper region the waves travel ${val(x, CM)} in ${val(t, S)}.`,
        `distance $= vt = ${v1} \\times ${t} = ${n(r(v1 * t))}$ cm`),
      numeric(rng, 'crossings', 5, r(f * t), ints([f, r(2 * f * t), r((f * t) / 2)]), (x) => `${n(x)} complete waves reach the boundary in ${val(t, S)}.`,
        `$${n(f)} \\times ${t} = ${n(r(f * t))}$ waves`),
    ]),
  };
}

// ----------------------------------------------------------------------------- selection

/** Three statements for the level: the hardest allowed tier must appear, numbers appear more as the level rises. */
function choose(rng: RNG, pool: Stmt[], level: Level): Stmt[] | null {
  const eligible = pool.filter((s) => s.tier <= level);
  const minHard = level <= 2 ? level : level - 1;
  const hard = eligible.filter((s) => s.tier >= minHard);
  if (hard.length === 0) return null;
  const wantHard = level === 1 ? 3 : level >= 4 ? 2 : 1;
  const chosen: Stmt[] = [];
  const usedGroups = new Set<string>();
  const take = (s: Stmt) => {
    if (chosen.length >= 3 || chosen.some((c) => c.key === s.key) || (s.group && usedGroups.has(s.group))) return;
    chosen.push(s);
    if (s.group) usedGroups.add(s.group);
  };
  for (const s of rng.shuffle(hard)) { if (chosen.length >= wantHard) break; take(s); }
  for (const s of rng.shuffle(eligible)) { if (chosen.length >= 3) break; take(s); }
  if (chosen.length < 3) return null;
  const numbers = chosen.filter((s) => s.claim !== null).length;
  if ((level >= 2 && numbers < 1) || (level >= 3 && numbers < 2)) return null;
  return rng.shuffle(chosen);
}

const SCENARIOS: Record<string, (rng: RNG) => Built | null> = { air: airSound, glass: glassLight, string: stringWave, ripples };

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'phy.waves.which-statements',
  module: 'PHY',
  topic: 'waves',
  title: 'Which statements are true (waves)',
  levels: {
    1: 'transverse/longitudinal, pitch, one one-step wavelength',
    2: 'plus the period or the speed in glass',
    3: 'two numbers: the wavelength in glass, the frequency in air, a wave count',
    4: 'a hypothetical change (frequency doubled, wave speed doubled) worked through',
    5: 'two-step numbers: an echo time, the same note in water, sin C for the glass',
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
        trap: 'Frequency is fixed by the source: at a boundary the speed and the wavelength change together while f stays put. Sound is longitudinal; light and waves on strings are transverse.',
        tags: ['waves', 'statements', scenario],
        params: { scenario, ...built.params, truth, stmts: stmts.map((s) => ({ key: s.key, claim: s.claim, text: s.text })) },
        typedAllowed: false,
      };
    });
  },
  verify(q) {
    if (q.answer.kind !== 'choice') return false;
    const p = q.params as Record<string, number> & { scenario: string; stmts: { key: string; claim: number | null; text: string }[] };
    const close = (a: number, b: number) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b));

    /** The true value of a numeric statement, reached by a different route from the generator's. */
    const trueValue = (key: string): number | null => {
      switch (p.scenario) {
        case 'air': {
          const T = 1 / p.f;            // period first, then λ = vT rather than v/f
          const lam = p.v * T;
          const dEcho = (p.v * p.tEcho) / 2;
          return { lambda: lam, period: T, 'lambda-double': (p.v * T) / 2, distance: p.v * p.t, count: p.t / T, echo: (2 * dEcho) / p.v, 'lambda-water': p.vWater * T }[key] ?? null;
        }
        case 'glass': {
          const lamAir = p.lamNm * 1e-9;
          const f = C / lamAir;                 // from the air wavelength
          const vGlass = C / p.n;
          const lamGlass = vGlass / f;          // λ = v/f in the glass, not λ/n
          return { speed: vGlass, 'lambda-glass': lamGlass * 1e9, 'freq-air': f, 'freq-glass': f, sinC: 1 / p.n }[key] ?? null;
        }
        case 'string': {
          const T = 1 / p.f;
          const lam = p.v * T;
          return { lambda: lam, period: T, count: p.t / T, 'tension-lambda': 2 * p.v * T, 'tension-f': (2 * p.v) / lam }[key] ?? null;
        }
        case 'ripples': {
          const f = p.v1 / p.lam1;
          const lam2 = p.lam1 * (p.v2 / p.v1); // scale the wavelength by the speed ratio
          return { freq: f, lambda2: lam2, period: p.lam1 / p.v1, distance: p.v1 * p.t, crossings: p.t * f }[key] ?? null;
        }
        default:
          return null;
      }
    };
    /** Truth of a qualitative statement read back from its wording. */
    const qualTruth = (key: string, text: string): boolean | null => {
      switch (key) {
        case 'longitudinal': return /longitudinal/.test(text);
        case 'pitch': return /frequency/.test(text);
        case 'speed-f': return /unchanged/.test(text);
        case 'double-f': return /halve/.test(text);
        case 'freq-unchanged': return /unchanged/.test(text);
        case 'lambda-dec': return /decreases/.test(text);
        case 'transverse': return /transverse/.test(text);
        case 'bends': return /towards/.test(text);
        case 'tension': return /increases the speed/.test(text);
        case 'freq-same': return /same in both/.test(text);
        case 'ratio': return /same ratio/.test(text);
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
