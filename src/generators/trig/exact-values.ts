import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, frac, surd, surdFrac, piFrac, Exact } from '../../core/exact';
import { buildOptions, buildSetOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { exactSin, exactCos, exactTan, angleLatex, EXACT_ANGLES_DEG } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Exact trigonometric values.
 * Level 1: sin/cos/tan of 30°, 45°, 60° (and 0°, 90° where defined)
 * Level 2: the same angles in radians (π/6, π/4, π/3, π/2)
 * Level 3: other quadrants with the sign: 120°, 135°, 150°, 210°, …, 330° and their radian forms
 * Level 4: expressions such as sin²60° + cos²30°, tan60° cos30°, sin30°cos60° + cos30°sin60°
 * Level 5: solve sin θ = √3/2 on 0° ≤ θ < 360° (set {60°, 120°}) or cos θ = −½ on 0 ≤ θ ≤ 2π
 */

type Fn = 'sin' | 'cos' | 'tan';
const FNS: Fn[] = ['sin', 'cos', 'tan'];
const HALF = frac(1, 2).toRat();

function exactOf(fn: Fn, deg: number): Exact | null {
  try {
    return fn === 'sin' ? exactSin(deg) : fn === 'cos' ? exactCos(deg) : exactTan(deg);
  } catch {
    return null;
  }
}

function attempt(f: () => Exact | null): Exact | null {
  try {
    const v = f();
    return v && Number.isFinite(v.toNumber()) ? v : null;
  } catch {
    return null;
  }
}

function cleanOnly(ds: { value: Exact | null; trap: string }[], allowZero = false): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } => d.value !== null && (allowZero || !d.value.isZero()) && isCleanExact(d.value).ok);
}

/**
 * The first-quadrant angle whose value for this function is |v|. Used to name the mistake a
 * "wrong standard value" distractor really is ("used sin 45° instead of sin 30°") rather than
 * repeating one label across three options.
 */
const STD_VALUES: Record<Fn, [Exact, number][]> = {
  sin: [[frac(1, 2), 30], [surdFrac(1, 2, 2), 45], [surdFrac(1, 2, 3), 60]],
  cos: [[frac(1, 2), 60], [surdFrac(1, 2, 2), 45], [surdFrac(1, 2, 3), 30]],
  tan: [[surdFrac(1, 3, 3), 30], [E(1), 45], [surd(3), 60]],
};

function stdMistake(fn: Fn, v: Exact, ref: number, sgn: -1 | 1): { value: Exact; trap: string } {
  const d = STD_VALUES[fn].find(([x]) => x.equals(v))?.[1];
  return {
    value: v.mulRat(sgn),
    trap: d === undefined ? `not the value of ${fn} at ${ref}°` : `used ${fn} ${d}° instead of ${fn} ${ref}°`,
  };
}

/**
 * A sine or a cosine can never leave [−1, 1]: an option of 2 or √3 for a cosine is the exact
 * analogue of a probability above 1 and is struck out without any trigonometry, so the whole
 * distractor pool is filtered to the possible range.
 */
function inRange(fn: Fn, v: Exact): boolean {
  return fn === 'tan' || Math.abs(v.toNumber()) <= 1 + 1e-12;
}

/**
 * Choose the distractors that go to buildOptions: every distinct `must` candidate (the spec-named traps)
 * is used before any `extra` one, so the headline mistakes are never shuffled out by weaker ones.
 */
function ranked(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], count = 4): Distractor[] {
  const seen: Exact[] = [answer];
  const out: Distractor[] = [];
  const take = (d: Distractor) => {
    if (out.length >= count || !Number.isFinite(d.value.toNumber()) || seen.some((s) => s.equals(d.value))) return;
    seen.push(d.value);
    out.push(d);
  };
  must.forEach(take); // in order, so when two must-traps coincide the more specific label wins
  rng.shuffle(extra).forEach(take);
  return out;
}

interface SetDistractor { values: Exact[]; trap: string }

function sameSet(a: Exact[], b: Exact[]): boolean {
  if (a.length !== b.length) return false;
  const rest = b.slice();
  for (const x of a) {
    const i = rest.findIndex((y) => y.equals(x));
    if (i < 0) return false;
    rest.splice(i, 1);
  }
  return true;
}

/** The set-answer version of ranked(): spec traps first, then the rest, no repeated sets. */
function rankedSets(rng: RNG, answer: Exact[], must: SetDistractor[], extra: SetDistractor[], count = 4): SetDistractor[] {
  const seen: Exact[][] = [answer];
  const out: SetDistractor[] = [];
  const take = (d: SetDistractor) => {
    if (out.length >= count || d.values.length < 1 || d.values.length > 4 || seen.some((s) => sameSet(s, d.values))) return;
    seen.push(d.values);
    out.push(d);
  };
  must.forEach(take);
  rng.shuffle(extra).forEach(take);
  return out;
}

/** LaTeX for an angle in the requested unit: "60^{\circ}" or "\frac{\pi}{3}". */
const ang = (deg: number, radians: boolean): string => (radians ? angleLatex(deg, true) : `${deg}^{\\circ}`);

/** "\sin 60^{\circ}", "\cos^2\left(\frac{\pi}{6}\right)". */
function trigTex(fn: Fn, deg: number, radians: boolean, power?: number): string {
  const f = `\\${fn}${power ? `^{${power}}` : ''}`;
  return radians ? `${f}\\left(${angleLatex(deg, true)}\\right)` : `${f} ${deg}^{\\circ}`;
}

function quadrant(deg: number): { q: 1 | 2 | 3 | 4; ref: number } {
  const d = ((deg % 360) + 360) % 360;
  if (d <= 90) return { q: 1, ref: d };
  if (d <= 180) return { q: 2, ref: 180 - d };
  if (d <= 270) return { q: 3, ref: d - 180 };
  return { q: 4, ref: 360 - d };
}

const QUADRANT_WORD = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth' } as const;
const POSITIVE_IN: Record<Fn, number[]> = { sin: [1, 2], cos: [1, 4], tan: [1, 3] };

/** "180° − 30° = 150°" or "\pi - \frac{\pi}{6} = \frac{5\pi}{6}" for an angle in quadrant q with the given reference angle. */
function quadrantExpr(q: 1 | 2 | 3 | 4, ref: number, radians: boolean): string {
  const full = radians ? '\\pi' : '180^{\\circ}';
  const turn = radians ? '2\\pi' : '360^{\\circ}';
  const r = ang(ref, radians);
  switch (q) {
    case 1: return r;
    case 2: return `${full} - ${r} = ${ang(180 - ref, radians)}`;
    case 3: return `${full} + ${r} = ${ang(180 + ref, radians)}`;
    default: return `${turn} - ${r} = ${ang(360 - ref, radians)}`;
  }
}

// ----------------------------------------------------------------------------- levels 1–3: single values

function valueQ(rng: RNG, level: Level): Generated | null {
  const radians = level === 2 || (level === 3 && rng.bool(0.5));
  const fn = rng.pick(FNS);
  const deg = level <= 2
    ? rng.weighted([30, 45, 60, 0, 90], [4, 4, 4, 1, 1])
    : rng.weighted([120, 135, 150, 210, 225, 240, 300, 315, 330, 180, 270], [3, 3, 3, 3, 3, 3, 3, 3, 3, 1, 1]);
  const a = exactOf(fn, deg);
  if (!a) return null; // tan 90°, tan 270°
  const { q, ref } = quadrant(deg);
  const axis = ref === 0 || ref === 90;
  const sgn: -1 | 1 = a.sign() < 0 ? -1 : 1;
  const ok = (ds: { value: Exact | null; trap: string }[], allowZero = false) =>
    cleanOnly(ds, allowZero).filter((d) => inRange(fn, d.value));
  let must: Distractor[] = [];
  let extra: Distractor[];
  if (axis) {
    // Only three values live on the axes (0, 1, −1), so the surd options have to be there; each
    // one is labelled with the angle it really belongs to instead of a shared non-mistake string.
    const partner: Fn = fn === 'cos' ? 'sin' : 'cos';
    const quarterOn = (deg + 90) % 360;
    const quarterBack = (deg + 270) % 360;
    must = ok([
      {
        value: a.isZero() ? E(1) : E(0),
        trap: a.isZero()
          ? 'the two axis values swapped: this one is 0, not ±1'
          : 'the two axis values swapped: this one is ±1, not 0',
      },
      { value: exactOf(partner, deg), trap: `gave ${partner} ${deg}° instead of ${fn} ${deg}°` },
    ], true);
    extra = ok([
      { value: a.isZero() ? E(-1) : a.neg(), trap: 'sign error: check which end of the axis the angle points to' },
      { value: exactOf(fn, quarterOn), trap: `read ${fn} at ${quarterOn}°, a quarter turn on` },
      { value: exactOf(fn, quarterBack), trap: `read ${fn} at ${quarterBack}°, a quarter turn back` },
      ...STD_VALUES[fn].map(([v, d]) => ({ value: v.mulRat(sgn), trap: `this is ${fn} ${d}°: an axis value is never a surd` })),
    ], true);
  } else {
    const co = fn === 'sin' ? exactOf('cos', deg) : fn === 'cos' ? exactOf('sin', deg) : attempt(() => a.inv());
    const coTrap = fn === 'tan' ? 'tan 30° and tan 60° confused (the reciprocal)' : 'sin and cos swapped';
    const standard = fn === 'tan' ? [surdFrac(1, 3, 3), E(1), surd(3)] : [frac(1, 2), surdFrac(1, 2, 2), surdFrac(1, 2, 3)];
    const otherFns = fn !== 'tan'
      ? [{ value: exactOf('tan', deg), trap: `gave tan instead of ${fn}` }]
      : [{ value: exactOf('sin', deg), trap: 'gave sin instead of tan' }, { value: exactOf('cos', deg), trap: 'gave cos instead of tan' }];
    if (q === 1) {
      // Every ratio is positive here, so the live confusions are between the standard values themselves.
      must = ok([
        { value: co, trap: coTrap },
        ...standard.map((v) => stdMistake(fn, v, ref, 1)),
      ]);
      extra = ok([
        ...otherFns,
        ...(fn !== 'tan'
          ? [
            // "ratio upside down" (1/(½) = 2, 2√3/3) left the range and was struck out on sight;
            // the in-range confusions take its place.
            { value: a.mulRat(2), trap: 'forgot the denominator 2' },
            { value: E(1), trap: `gave the axis value ${fn} ${fn === 'sin' ? 90 : 0}° = 1` },
            { value: surdFrac(1, 3, 3), trap: 'used 1/√3, which is tan 30° and not a sine or cosine' },
          ]
          : [{ value: ref === 45 ? surd(2) : E(2), trap: 'used the hypotenuse instead of a leg' }]),
      ]);
    } else {
      must = ok([
        { value: a.neg(), trap: 'wrong sign for this quadrant' },
        { value: co, trap: coTrap },
      ]);
      extra = ok([
        { value: co ? co.neg() : null, trap: `${coTrap} and the sign wrong` },
        ...otherFns,
        ...standard.map((v) => stdMistake(fn, v, ref, sgn)),
        ...(fn !== 'tan' ? [{ value: a.mulRat(2), trap: 'forgot the denominator 2' }] : []),
        ...(fn !== 'tan' ? [{ value: E(sgn), trap: `gave an axis value: $\\${fn}$ only reaches ${sgn} at a quarter turn` }] : []),
      ]);
    }
  }
  const expr = trigTex(fn, deg, radians);
  const stem = rng.pick([`Find the exact value of $${expr}$.`, `Write down the exact value of $${expr}$.`, `Which of the following is equal to $${expr}$?`]);
  let solution: string;
  if (axis) {
    solution = `From the graph of $${fn === 'tan' ? '\\tan' : `\\${fn}`}$ (or the unit circle), $${expr} = ${a.toLatex()}$.`;
  } else if (q === 1) {
    const tri = ref === 45 ? 'the $1$, $1$, $\\sqrt{2}$ right-angled triangle' : 'the $1$, $\\sqrt{3}$, $2$ right-angled triangle (half an equilateral triangle)';
    solution = `From ${tri}: $${expr} = ${a.toLatex()}$.`;
  } else {
    const positive = POSITIVE_IN[fn].includes(q);
    solution = `$${ang(deg, radians)}$ is in the ${QUADRANT_WORD[q]} quadrant (reference angle $${ang(ref, radians)}$), where $\\${fn}$ is ${positive ? 'positive' : 'negative'}: $${expr} = ${positive ? '' : '-'}${trigTex(fn, ref, radians)} = ${a.toLatex()}$.`;
  }
  return {
    stem,
    answer: { kind: 'exact', value: a },
    options: buildOptions(rng, a, ranked(rng, a, must, extra)),
    solution,
    trap: axis
      ? 'On the axes the values are only 0 and ±1 — sin is 0 at 0 and π, cos is 0 at π/2 and 3π/2; a surd here means the wrong angle was read.'
      : level <= 2
        ? 'sin 30° = ½ and sin 60° = √3/2 are the pair most often swapped; sketch the 1, √3, 2 triangle if unsure.'
        : 'Find the reference angle, then fix the sign with CAST: only sin is positive in quadrant 2, only tan in quadrant 3, only cos in quadrant 4.',
    tags: ['trig', 'exact-values', radians ? 'radians' : 'degrees'],
    params: { variant: 'value', fn, deg, radians },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 4: expressions

interface Trig { s: (d: number) => Exact; c: (d: number) => Exact; t: (d: number) => Exact }
interface FTrig { s: (d: number) => number; c: (d: number) => number; t: (d: number) => number }
/** Renders one trig factor of the expression: fn of angle A (or B) with an optional power. */
type Part = (fn: Fn, power?: number) => string;

interface Form {
  id: string;
  usesB: boolean;
  usesTan: boolean;
  /** Angle pairs this form must not use, e.g. a = b where the expression would be a literal repeat like sin A sin A. */
  reject?: (a: number, b: number) => boolean;
  tex: (A: Part, B: Part) => string;
  ex: (f: Trig, a: number, b: number) => Exact;
  fl: (f: FTrig, a: number, b: number) => number;
  /** The first two mistakes are the ones that must appear among the options. */
  mistakes: (f: Trig, a: number, b: number) => { value: () => Exact | null; trap: string }[];
  /** Identity shortcut for the solution, if any. `A(d)` renders an angle in the current unit. */
  note?: (a: number, b: number, A: (d: number) => string) => string | null;
}

const FORMS: Form[] = [
  {
    id: 'sq-sum', usesB: true, usesTan: false,
    tex: (A, B) => `${A('sin', 2)} + ${B('cos', 2)}`,
    ex: (f, a, b) => f.s(a).pow(2).add(f.c(b).pow(2)),
    fl: (f, a, b) => f.s(a) ** 2 + f.c(b) ** 2,
    mistakes: (f, a, b) => [
      { value: () => E(1), trap: 'assumed sin² + cos² = 1 even though the angles differ' },
      { value: () => f.s(a).add(f.c(b)), trap: 'forgot to square the values' },
      { value: () => f.s(a).pow(2).sub(f.c(b).pow(2)), trap: 'subtracted the squares' },
      { value: () => f.s(a).pow(2), trap: 'evaluated only the first square' },
      { value: () => f.s(a).mul(f.c(b)), trap: 'multiplied the values instead of adding their squares' },
    ],
    note: (a, b) => (a === b ? 'Quick route: this is $\\sin^2 A + \\cos^2 A = 1$.' : 'The identity $\\sin^2 A + \\cos^2 A = 1$ does not apply: the angles differ.'),
  },
  {
    id: 'tan-cos', usesB: true, usesTan: true,
    tex: (A, B) => `${A('tan')} \\, ${B('cos')}`,
    ex: (f, a, b) => f.t(a).mul(f.c(b)),
    fl: (f, a, b) => f.t(a) * f.c(b),
    mistakes: (f, a, b) => [
      { value: () => f.t(a).add(f.c(b)), trap: 'added instead of multiplying' },
      { value: () => f.t(a).div(f.c(b)), trap: 'divided instead of multiplying' },
      { value: () => f.t(a).mul(f.s(b)), trap: 'used sin instead of cos' },
      { value: () => f.t(a), trap: 'forgot the cos factor' },
      { value: () => f.c(b), trap: 'forgot the tan factor' },
    ],
    note: (a, b, A) => (a === b ? `Quick route: $\\tan A \\cos A = \\sin A$, so this is $\\sin ${A(a)}$.` : null),
  },
  {
    id: 'sin-add', usesB: true, usesTan: false, reject: (a, b) => a === b,
    tex: (A, B) => `${A('sin')} ${B('cos')} + ${A('cos')} ${B('sin')}`,
    ex: (f, a, b) => f.s(a).mul(f.c(b)).add(f.c(a).mul(f.s(b))),
    fl: (f, a, b) => f.s(a) * f.c(b) + f.c(a) * f.s(b),
    mistakes: (f, a, b) => [
      { value: () => f.s(a).mul(f.c(b)).sub(f.c(a).mul(f.s(b))), trap: 'sign slip: subtracting the products gives sin(A − B)' },
      { value: () => f.s(a).mul(f.c(b)), trap: 'evaluated only the first product' },
      { value: () => f.s(a).add(f.s(b)), trap: 'treated sin(A + B) as sin A + sin B' },
      { value: () => f.c(a).mul(f.c(b)).sub(f.s(a).mul(f.s(b))), trap: 'mixed up the expansions: used the one for cos(A + B)' },
    ],
    note: (a, b, A) => `Quick route: this is the expansion of $\\sin(A + B) = \\sin ${A(a + b)}$.`,
  },
  {
    id: 'sin-diff', usesB: true, usesTan: false, reject: (a, b) => a === b,
    tex: (A, B) => `${A('sin')} ${B('cos')} - ${A('cos')} ${B('sin')}`,
    ex: (f, a, b) => f.s(a).mul(f.c(b)).sub(f.c(a).mul(f.s(b))),
    fl: (f, a, b) => f.s(a) * f.c(b) - f.c(a) * f.s(b),
    mistakes: (f, a, b) => [
      { value: () => f.s(a).mul(f.c(b)).add(f.c(a).mul(f.s(b))), trap: 'sign slip: adding the products gives sin(A + B)' },
      { value: () => f.c(a).mul(f.s(b)).sub(f.s(a).mul(f.c(b))), trap: 'subtraction reversed: that is sin(B − A)' },
      { value: () => f.s(a).mul(f.c(b)), trap: 'evaluated only the first product' },
      { value: () => f.c(Math.abs(a - b)), trap: 'mixed up the expansions: this is sin(A − B), not cos(A − B)' },
    ],
    note: (a, b, A) => `Quick route: this is the expansion of $\\sin(A - B) = \\sin\\left(${A(a - b)}\\right)$.`,
  },
  {
    id: 'cos-diff', usesB: true, usesTan: false, reject: (a, b) => a === b,
    tex: (A, B) => `${A('cos')} ${B('cos')} + ${A('sin')} ${B('sin')}`,
    ex: (f, a, b) => f.c(a).mul(f.c(b)).add(f.s(a).mul(f.s(b))),
    fl: (f, a, b) => f.c(a) * f.c(b) + f.s(a) * f.s(b),
    mistakes: (f, a, b) => [
      { value: () => f.c(a).mul(f.c(b)).sub(f.s(a).mul(f.s(b))), trap: 'sign slip: subtracting the products gives cos(A + B)' },
      { value: () => f.c(a).mul(f.c(b)), trap: 'evaluated only the first product' },
      { value: () => f.s(Math.abs(a - b)), trap: 'mixed up the expansions: this is cos(A − B), not sin(A − B)' },
      { value: () => E(1), trap: 'treated it like cos²A + sin²A = 1' },
      { value: () => f.c(a).add(f.c(b)), trap: 'treated cos(A − B) as cos A + cos B' },
    ],
    note: (a, b, A) => `Quick route: this is the expansion of $\\cos(A - B) = \\cos ${A(Math.abs(a - b))}$.`,
  },
  {
    id: 'sin-over-cos', usesB: true, usesTan: false,
    tex: (A, B) => `\\frac{${A('sin')}}{${B('cos')}}`,
    ex: (f, a, b) => f.s(a).div(f.c(b)),
    fl: (f, a, b) => f.s(a) / f.c(b),
    mistakes: (f, a, b) => [
      { value: () => f.c(b).div(f.s(a)), trap: 'fraction inverted' },
      { value: () => f.s(a).mul(f.c(b)), trap: 'multiplied instead of dividing' },
      { value: () => f.c(a).div(f.s(b)), trap: 'sin and cos swapped' },
      { value: () => f.s(a).add(f.c(b)), trap: 'added instead of dividing' },
      { value: () => f.s(a), trap: 'evaluated only the numerator' },
    ],
    note: (a, b, A) => (a === b ? `Quick route: $\\frac{\\sin A}{\\cos A} = \\tan A$, so this is $\\tan ${A(a)}$.` : null),
  },
  {
    id: 'cos-over-sin', usesB: true, usesTan: false,
    tex: (A, B) => `\\frac{${A('cos')}}{${B('sin')}}`,
    ex: (f, a, b) => f.c(a).div(f.s(b)),
    fl: (f, a, b) => f.c(a) / f.s(b),
    mistakes: (f, a, b) => [
      { value: () => f.s(b).div(f.c(a)), trap: 'fraction inverted' },
      { value: () => f.c(a).mul(f.s(b)), trap: 'multiplied instead of dividing' },
      { value: () => f.s(a).div(f.c(b)), trap: 'sin and cos swapped' },
      { value: () => f.c(a).add(f.s(b)), trap: 'added instead of dividing' },
      { value: () => f.c(a), trap: 'evaluated only the numerator' },
    ],
    note: (a, b, A) => (a === b ? `Quick route: $\\frac{\\cos A}{\\sin A} = \\frac{1}{\\tan A}$, so this is $\\frac{1}{\\tan ${A(a)}}$.` : null),
  },
  {
    id: 'double-sin', usesB: false, usesTan: false,
    tex: (A) => `2 ${A('sin')} ${A('cos')}`,
    ex: (f, a) => f.s(a).mul(f.c(a)).mulRat(2),
    fl: (f, a) => 2 * f.s(a) * f.c(a),
    mistakes: (f, a) => [
      { value: () => f.s(a).mul(f.c(a)), trap: 'forgot the factor 2' },
      { value: () => f.s(a).mulRat(2), trap: 'dropped the cos factor' },
      { value: () => f.s(a).add(f.c(a)), trap: 'added instead of multiplying' },
      { value: () => f.c(a).pow(2).sub(f.s(a).pow(2)), trap: 'used cos 2A instead of sin 2A' },
    ],
    note: (a, _b, A) => `Quick route: $2\\sin A \\cos A = \\sin 2A = \\sin ${A(2 * a)}$.`,
  },
  {
    id: 'cos-double', usesB: false, usesTan: false,
    tex: (A) => `${A('cos', 2)} - ${A('sin', 2)}`,
    ex: (f, a) => f.c(a).pow(2).sub(f.s(a).pow(2)),
    fl: (f, a) => f.c(a) ** 2 - f.s(a) ** 2,
    mistakes: (f, a) => [
      { value: () => f.s(a).pow(2).sub(f.c(a).pow(2)), trap: 'subtraction reversed' },
      { value: () => f.c(a).sub(f.s(a)), trap: 'forgot to square the values' },
      { value: () => E(1), trap: 'added the squares instead of subtracting (that gives 1)' },
      { value: () => f.s(a).mul(f.c(a)).mulRat(2), trap: 'used sin 2A instead of cos 2A' },
    ],
    note: (a, _b, A) => `Quick route: $\\cos^2 A - \\sin^2 A = \\cos 2A = \\cos ${A(2 * a)}$.`,
  },
  {
    id: 'tan-tan', usesB: true, usesTan: true, reject: (a, b) => a === b,
    tex: (A, B) => `${A('tan')} \\, ${B('tan')}`,
    ex: (f, a, b) => f.t(a).mul(f.t(b)),
    fl: (f, a, b) => f.t(a) * f.t(b),
    mistakes: (f, a, b) => [
      { value: () => f.t(a).add(f.t(b)), trap: 'added instead of multiplying' },
      { value: () => f.t(a).div(f.t(b)), trap: 'divided instead of multiplying' },
      { value: () => f.t(a).pow(2), trap: 'used the first angle twice' },
    ],
    note: (a, b, A) => (a + b === 90 ? `Quick route: $\\tan A \\tan\\left(${A(90)} - A\\right) = \\tan A \\cot A = 1$.` : null),
  },
  {
    id: 'sec-sq', usesB: false, usesTan: true,
    tex: (A) => `1 + ${A('tan', 2)}`,
    ex: (f, a) => E(1).add(f.t(a).pow(2)),
    fl: (f, a) => 1 + f.t(a) ** 2,
    mistakes: (f, a) => [
      { value: () => f.t(a).pow(2), trap: 'forgot the 1' },
      { value: () => E(1).add(f.t(a)), trap: 'forgot to square' },
      { value: () => E(1).div(f.c(a)), trap: 'gave 1/cos A instead of 1/cos² A' },
    ],
    note: () => 'Quick route: $1 + \\tan^2 A = \\frac{1}{\\cos^2 A}$.',
  },
  {
    id: 'sin-plus-cos', usesB: true, usesTan: false,
    tex: (A, B) => `${A('sin')} + ${B('cos')}`,
    ex: (f, a, b) => f.s(a).add(f.c(b)),
    fl: (f, a, b) => f.s(a) + f.c(b),
    mistakes: (f, a, b) => [
      { value: () => f.s(a).mul(f.c(b)), trap: 'multiplied instead of adding' },
      { value: () => exactOf('sin', a + b), trap: 'treated sin A + cos B as sin(A + B)' },
      { value: () => f.s(a).sub(f.c(b)), trap: 'subtracted instead of adding' },
      { value: () => f.s(a).mulRat(2), trap: 'sin and cos swapped' },
    ],
    note: (a, b, A) => (a + b === 90 ? `Quick route: $\\cos B = \\sin\\left(${A(90)} - B\\right) = \\sin A$, so this is $2 \\sin ${A(a)}$.` : null),
  },
  {
    id: 'sin-sin', usesB: true, usesTan: false, reject: (a, b) => a === b,
    tex: (A, B) => `${A('sin')} \\, ${B('sin')}`,
    ex: (f, a, b) => f.s(a).mul(f.s(b)),
    fl: (f, a, b) => f.s(a) * f.s(b),
    mistakes: (f, a, b) => [
      { value: () => f.s(a).add(f.s(b)), trap: 'added instead of multiplying' },
      { value: () => f.s(a).div(f.s(b)), trap: 'divided instead of multiplying' },
      { value: () => f.s(a).mul(f.c(b)), trap: 'used cos for the second angle' },
    ],
  },
];

const FORM_BY_ID: Record<string, Form> = Object.fromEntries(FORMS.map((f) => [f.id, f]));

const EXACT_TRIG: Trig = {
  s: (d) => exactSin(d),
  c: (d) => exactCos(d),
  t: (d) => { const v = exactTan(d); if (!v) throw new Error('tan undefined'); return v; },
};
const SWAPPED_TRIG: Trig = { s: EXACT_TRIG.c, c: EXACT_TRIG.s, t: EXACT_TRIG.t };
const RECIP_TAN_TRIG: Trig = { s: EXACT_TRIG.s, c: EXACT_TRIG.c, t: (d) => EXACT_TRIG.t(d).inv() };
const FLOAT_TRIG: FTrig = {
  s: (d) => Math.sin((d * Math.PI) / 180),
  c: (d) => Math.cos((d * Math.PI) / 180),
  t: (d) => Math.tan((d * Math.PI) / 180),
};

/** Angles for a form: the exam prints one clean value here, not surd bookkeeping like (√6 − √2)/4, so single-term answers only. */
function anglesFor(rng: RNG, form: Form): { a: number; b: number; answer: Exact } | null {
  for (let i = 0; i < 30; i++) {
    const a = rng.pick([30, 45, 60]);
    const b = form.usesB ? rng.pick([30, 45, 60]) : a;
    if (form.reject?.(a, b)) continue;
    const answer = attempt(() => form.ex(EXACT_TRIG, a, b));
    if (answer && !answer.isZero() && answer.isSingleTerm() && isCleanExact(answer).ok) return { a, b, answer };
  }
  return null;
}

function expressionQ(rng: RNG): Generated | null {
  // Pick the form first, then angles that work for it, so the identity forms are not starved by the angle filter.
  const form = rng.pick(FORMS);
  const radians = rng.bool(0.25);
  const picked = anglesFor(rng, form);
  if (!picked) return null;
  const { a, b, answer } = picked;
  const A: Part = (fn, power) => trigTex(fn, a, radians, power);
  const B: Part = (fn, power) => trigTex(fn, b, radians, power);
  const expr = form.tex(A, B);
  // Substituted version of the expression for the solution, built from the same layout.
  const used: string[] = [];
  const recording: Trig = {
    s: (d) => { const v = exactSin(d); used.push(`$${trigTex('sin', d, radians)} = ${v.toLatex()}$`); return v; },
    c: (d) => { const v = exactCos(d); used.push(`$${trigTex('cos', d, radians)} = ${v.toLatex()}$`); return v; },
    t: (d) => { const v = EXACT_TRIG.t(d); used.push(`$${trigTex('tan', d, radians)} = ${v.toLatex()}$`); return v; },
  };
  form.ex(recording, a, b);
  const uniqueUsed = [...new Set(used)];
  const valPart = (deg: number): Part => (fn, power) => {
    const v = exactOf(fn, deg)!;
    const body = `\\left(${v.toLatex()}\\right)`;
    return power ? `${body}^{${power}}` : body;
  };
  const substituted = form.tex(valPart(a), valPart(b));
  const singleTerm = (ds: { value: Exact | null; trap: string }[]) => cleanOnly(ds).filter((d) => d.value.isSingleTerm());
  const mistakes = form.mistakes(EXACT_TRIG, a, b).map((m) => ({ value: attempt(m.value), trap: m.trap }));
  const must = singleTerm(mistakes.slice(0, 2));
  const extra = singleTerm([
    ...mistakes.slice(2),
    { value: attempt(() => form.ex(SWAPPED_TRIG, a, b)), trap: 'sin and cos values swapped' },
    ...(form.usesTan ? [{ value: attempt(() => form.ex(RECIP_TAN_TRIG, a, b)), trap: 'tan 30° and tan 60° confused' }] : []),
    { value: answer.neg(), trap: 'sign error' },
    { value: answer.mulRat(2), trap: 'lost a factor of ½' },
    { value: answer.mulRat(HALF), trap: 'an extra factor of ½' },
  ]);
  const note = form.note?.(a, b, (d) => ang(d, radians)) ?? null;
  const stem = rng.bool(0.5) ? `Find the exact value of $${expr}$.` : `Evaluate $${expr}$, giving your answer exactly.`;
  // The trap line names the mistake this form's options were actually built from — the old
  // boilerplate talked about sin²A + cos²B for expressions with no squares anywhere in them.
  const chosen = ranked(rng, answer, must, extra);
  const named = chosen[0]?.trap;
  return {
    stem,
    answer: { kind: 'exact', value: answer },
    options: buildOptions(rng, answer, chosen),
    solution: `${note ? `${note} ` : ''}Substituting ${uniqueUsed.join(', ')}: $${substituted} = ${answer.toLatex()}$.`,
    trap: named
      ? `Substitute the exact values carefully, or spot the identity — the usual slip here: ${named}.`
      : 'Substitute the exact values carefully (or spot the identity); do not assume sin²A + cos²B = 1 when the angles differ.',
    tags: ['trig', 'exact-values', 'identities'],
    params: { variant: 'expression', form: form.id, a, b, radians },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 5: solve on a full turn

const TURN_ANGLES = EXACT_ANGLES_DEG.filter((d) => d < 360);

/** All θ in [0°, 360°) with an exact value equal to `target` (degrees). */
function solutionsOf(fn: Fn, target: Exact): number[] {
  return TURN_ANGLES.filter((d) => { const v = exactOf(fn, d); return v !== null && v.equals(target); });
}

const norm360 = (d: number) => ((d % 360) + 360) % 360;
const uniqSorted = (ds: number[]) => [...new Set(ds.map(norm360))].sort((x, y) => x - y);

const DEGREES_TRAP = 'answered in degrees when the range was given in radians';

function solveQ(rng: RNG): Generated | null {
  const radians = rng.bool(0.5);
  const fn = rng.pick(FNS);
  const target = fn === 'tan'
    ? rng.pick([E(1), E(-1), surd(3), surd(3).neg(), surdFrac(1, 3, 3), surdFrac(-1, 3, 3)])
    : rng.pick([frac(1, 2), frac(-1, 2), surdFrac(1, 2, 2), surdFrac(-1, 2, 2), surdFrac(1, 2, 3), surdFrac(-1, 2, 3)]);
  const sols = solutionsOf(fn, target);
  if (sols.length !== 2) return null;
  const toVals = (degs: number[]) => degs.map((d) => (radians ? piFrac(d, 180) : E(d)));
  const values = toVals(sols);
  const rearranged = rng.bool(0.4);
  const den = Number(target.terms[0].c.d);
  const num = target.mulRat(den); // integer or k√r
  const eqTex = rearranged
    ? `${den === 1 ? '' : den}\\${fn}\\theta ${num.sign() < 0 ? '+' : '-'} ${num.abs().toLatex()} = 0`
    : `\\${fn}\\theta = ${target.toLatex()}`;
  const range = radians ? '0 \\le \\theta \\le 2\\pi' : '0^{\\circ} \\le \\theta < 360^{\\circ}';
  const t1 = sols[0];
  const other: Fn = fn === 'sin' ? 'cos' : 'sin';
  const swappedSols = fn === 'tan' ? solutionsOf('tan', target.inv()) : solutionsOf(other, target);
  const negSols = solutionsOf(fn, target.neg());
  /**
   * At most ONE option may be eliminable by its shape alone — a single value where the answer
   * always lists two, or degrees where the range is in radians. Offering both wasted 1.5 of the
   * four distractors and turned a 1-in-5 question into roughly 1-in-3.
   */
  const singleOpt: SetDistractor = { values: toVals([t1]), trap: 'missed the second solution' };
  const degOpt: SetDistractor | null = radians ? { values: sols.map((d) => E(d)), trap: DEGREES_TRAP } : null;
  const must: SetDistractor[] = [
    degOpt && rng.bool(0.5) ? degOpt : singleOpt,
    { values: toVals(negSols), trap: 'wrong quadrants: ignored the sign of the value' },
  ];
  const extra: SetDistractor[] = [
    { values: toVals(uniqSorted([t1, t1 + 180])), trap: 'added 180° to get the second solution' },
    { values: toVals(uniqSorted([t1, 360 - t1])), trap: 'used 360° − θ for the second solution' },
    { values: toVals(uniqSorted([t1, 180 - t1])), trap: 'used 180° − θ for the second solution' },
    { values: toVals(swappedSols), trap: fn === 'tan' ? 'tan 30° and tan 60° confused' : 'sin and cos swapped' },
    { values: toVals(uniqSorted([...sols, ...negSols])), trap: 'gave every angle with that reference angle' },
  ];
  const picked = rankedSets(rng, values, must, extra);
  const inDegrees = (s: string) => s.replace(/= (\d+)\$/g, '= $1^{\\circ}$');
  const options = buildSetOptions(rng, values, picked, { variable: '\\theta' })
    .map((o) => (!radians || o.trap === DEGREES_TRAP ? { ...o, display: inDegrees(o.display) } : o));
  const { ref } = quadrant(t1);
  const sign = target.sign();
  const quads = POSITIVE_IN[fn].slice() as (1 | 2 | 3 | 4)[];
  const where = (sign > 0 ? quads : ([1, 2, 3, 4] as const).filter((q) => !quads.includes(q))) as (1 | 2 | 3 | 4)[];
  const refTex = trigTex(fn, ref, radians);
  const placed = where.map((q) => `$\\theta = ${quadrantExpr(q, ref, radians)}$`).join(' and ');
  return {
    stem: `Solve $${eqTex}$ for $${range}$.`,
    answer: { kind: 'set', values, variable: '\\theta' },
    options,
    solution: `${rearranged ? `Rearrange: $\\${fn}\\theta = ${target.toLatex()}$. ` : ''}The reference angle is $${ang(ref, radians)}$ since $${refTex} = ${target.abs().toLatex()}$. $\\${fn}$ is ${sign > 0 ? 'positive' : 'negative'} in the ${where.map((q) => QUADRANT_WORD[q]).join(' and ')} quadrants, so ${placed}.`,
    trap: `There are two solutions in one full turn: find the reference angle, then place it in the two quadrants where the function has the right sign${radians ? ', and give them in radians' : ''}.`,
    tags: ['trig', 'equations', radians ? 'radians' : 'degrees'],
    params: { variant: 'solve', fn, target: target.toNumber(), radians, rearranged },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'm1.trig.exact-values',
  module: 'M1',
  topic: 'trig',
  title: 'Exact trig values',
  levels: {
    1: 'sin, cos, tan of 30°, 45°, 60° (and 0°, 90°)',
    2: 'the same in radians: π/6, π/4, π/3, π/2',
    3: 'other quadrants with sign: 150°, 240°, 5π/6, 7π/4 …',
    4: 'expressions: sin²60° + cos²30°, tan60° cos30°, sin30°cos60° + cos30°sin60°',
    5: 'solve sin θ = √3/2 on 0° ≤ θ < 360°, cos θ = −½ on 0 ≤ θ ≤ 2π',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      if (level <= 3) return valueQ(rng, level);
      if (level === 4) return expressionQ(rng);
      return solveQ(rng);
    });
  },
  verify(q) {
    const p = q.params as { variant: string; fn?: Fn; deg?: number; radians?: boolean; form?: string; a?: number; b?: number; target?: number };
    const close = (x: number, y: number) => Math.abs(x - y) < 1e-9;
    if (p.variant === 'solve') {
      if (q.answer.kind !== 'set') return false;
      const fn = p.fn!;
      // Brute force: every multiple of 15° in the stated range whose floating-point value hits the target.
      const upper = p.radians ? 360 : 345;
      const expected: number[] = [];
      for (let d = 0; d <= upper; d += 15) {
        const v = FLOAT_TRIG[fn === 'sin' ? 's' : fn === 'cos' ? 'c' : 't'](d);
        if (Number.isFinite(v) && Math.abs(v) < 1e6 && close(v, p.target!)) expected.push(d);
      }
      const got = q.answer.values.map((v) => (p.radians ? (v.toNumber() * 180) / Math.PI : v.toNumber())).sort((x, y) => x - y);
      if (got.length !== expected.length) return false;
      return got.every((g, i) => Math.abs(g - expected[i]) < 1e-7 && g >= 0 && g <= upper);
    }
    if (q.answer.kind !== 'exact') return false;
    const got = q.answer.value.toNumber();
    if (p.variant === 'value') {
      const f = FLOAT_TRIG[p.fn === 'sin' ? 's' : p.fn === 'cos' ? 'c' : 't'];
      return close(got, f(p.deg!));
    }
    if (p.variant === 'expression') {
      const form = FORM_BY_ID[p.form!];
      if (!form) return false;
      return close(got, form.fl(FLOAT_TRIG, p.a!, p.b!));
    }
    return false;
  },
});
