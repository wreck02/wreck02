import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, Exact, surd } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import type { RNG } from '../../core/rng';

/**
 * Hooke's law and elastic potential energy (g = 10 m s^-2 wherever a weight is involved).
 * Level 1: F = kx: find F, x (in cm) or k (in N m^-1) with clean cm → m conversions
 * Level 2: EPE = ½kx² with clean k and x (k = 200 N m^-1, x = 10 cm → 1 J); or k from the energy stored
 * Level 3: extension of a spring under a hanging mass (mg = kx); two or three identical springs in series or in
 *          parallel: the total extension under a load, or the effective stiffness
 * Level 4: energy stored → speed of a mass launched along a smooth surface (½kx² = ½mv²), k/m a perfect square
 * Level 5: work done in stretching from x₁ to x₂ (difference of the energies); a spring launching a mass
 *          vertically (½kx² = mgh) or up a smooth 30° slope (½kx² = mgd sin 30°)
 *
 * Stiffness answers are bare numbers with "in N m^-1" in the stem (the typed-answer parser has no N/m unit);
 * every other answer carries its unit. Every wrong option is a named mistake (½ dropped, cm used as m,
 * series/parallel swapped, F × x instead of ½Fx); parameters that cannot supply four distinct clean ones are
 * redrawn, never padded.
 */

const G = 10;
const U_N = '\\text{N}', U_J = '\\text{J}', U_M = '\\text{m}', U_CM = '\\text{cm}', U_MS = '\\text{m s}^{-1}';
const NPM = '$\\text{N m}^{-1}$';
const TAKE_G = 'Take $g = 10\\ \\text{m s}^{-2}$.';

type Candidate = { value: Exact | null; trap: string };

/** Plain number for a stem: 1200, 0.05, 22.5. */
const n = (x: number): string => (Number.isInteger(x) ? `${x}` : `${Number(x.toPrecision(10))}`);
/** Round away floating-point noise (0.1 × 3 → 0.3). */
const r = (x: number): number => Number(x.toPrecision(12));

function tryE(f: () => Exact): Exact | null {
  try {
    const v = f();
    return Number.isFinite(v.toNumber()) ? v : null;
  } catch {
    return null;
  }
}

/** Positive, finite, clean and exam-sized candidates. */
function cleanOnly(ds: Candidate[]): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } => {
    const v = d.value;
    if (!v || !Number.isFinite(v.toNumber()) || v.sign() <= 0 || !isCleanExact(v).ok) return false;
    const x = v.toNumber();
    if (x < 0.001 || x > 2e6) return false;
    return !v.isRational() || Number.isInteger(r(x * 1000)); // decimals must terminate: no 10/3 among 30 and 0.3
  });
}

/** Every distinct `must` trap gets a slot before any `extra` one, so the headline mistakes are never shuffled out. */
function ranked(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], count = 4): Distractor[] {
  const seen: Exact[] = [answer];
  const out: Distractor[] = [];
  const take = (d: Distractor) => {
    if (out.length >= count || seen.some((s) => s.equals(d.value))) return;
    seen.push(d.value);
    out.push(d);
  };
  must.forEach(take);
  rng.shuffle(extra).forEach(take);
  return out;
}

/** Pick a sub-variant first, then retry its parameters, so rejection rates do not skew the mix of variants. */
function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

interface Pack {
  stem: string;
  answer: Exact | null;
  unit?: string;
  must: Candidate[];
  extra: Candidate[];
  solution: string;
  trap: string;
  tags: string[];
  params: Record<string, unknown>;
}

function pack(rng: RNG, p: Pack): Generated | null {
  if (!p.answer || !isCleanExact(p.answer).ok || p.answer.sign() <= 0) return null;
  const ds = ranked(rng, p.answer, cleanOnly(p.must), cleanOnly(p.extra));
  if (ds.length < 4) return null; // never pad: redraw instead
  return {
    stem: p.stem,
    answer: { kind: 'exact', value: p.answer, format: 'decimal', unit: p.unit },
    options: buildOptions(rng, p.answer, ds, { format: 'decimal', unit: p.unit }),
    solution: p.solution,
    trap: p.trap,
    tags: p.tags,
    params: p.params,
    typedAllowed: true,
  };
}

const STIFFNESSES = [20, 25, 40, 50, 80, 100, 120, 150, 200, 250, 400, 500, 800, 1000];
const EXT_CM = [2, 4, 5, 8, 10, 12, 15, 20, 25, 30, 40, 50];
/** Energies read as clean decimals (at most two decimal places, not tiny). */
const tidy = (x: number) => Number.isInteger(r(x * 100)) && x >= 0.05;

// ----------------------------------------------------------------------------- level 1

function hookeQ(rng: RNG): Generated | null {
  const k = rng.pick(STIFFNESSES);
  const xcm = rng.pick(EXT_CM);
  const x = xcm / 100;
  const F = r(k * x);
  if (!Number.isInteger(F * 10) || F < 0.5 || F > 500) return null;
  const ask = rng.pick(['F', 'x', 'k']);
  const spring = rng.pick(['A spring', 'A light spring', 'An elastic cord']);
  if (ask === 'F') {
    return pack(rng, {
      stem: `${spring} has stiffness ${k} ${NPM}. Find the force needed to stretch it by ${xcm} cm.`,
      answer: E(F),
      unit: U_N,
      must: [
        { value: E(k * xcm), trap: 'used the extension in cm rather than m' },
        { value: E(F / 2), trap: 'used ½kx (mixing up the force with the energy ½kx²)' },
      ],
      extra: [
        { value: E(F / 10), trap: 'converted cm to m with the wrong power of ten' },
        { value: E(F * 10), trap: 'converted cm to m with the wrong power of ten' },
        { value: xcm % 10 === 0 || k % 10 === 0 ? E(r(k * x * x)) : null, trap: 'squared the extension' },
        { value: E(2 * F), trap: 'doubled the force' },
      ],
      solution: `$${xcm}\\ \\text{cm} = ${n(x)}\\ \\text{m}$, so $F = kx = ${k} \\times ${n(x)} = ${n(F)}\\ \\text{N}$.`,
      trap: 'Convert the extension to metres before using F = kx with k in N m^-1.',
      tags: ['hooke', 'force', 'units'],
      params: { variant: 'hooke', ask: 'F', k, xcm },
    });
  }
  if (ask === 'x') {
    return pack(rng, {
      stem: `A force of ${n(F)} N stretches a spring of stiffness ${k} ${NPM}. Find the extension of the spring, in cm.`,
      answer: E(xcm),
      unit: U_CM,
      must: [
        { value: E(x), trap: 'found the extension in metres and called it cm' },
        { value: E(r(F * k)), trap: 'multiplied instead of dividing' },
      ],
      extra: [
        { value: E(xcm * 10), trap: 'converted m to cm with the wrong power of ten' },
        { value: E(xcm / 10), trap: 'converted m to cm with the wrong power of ten' },
        { value: E(2 * xcm), trap: 'used ½kx for the force' },
        { value: tryE(() => E(k).div(E(F))), trap: 'divided the wrong way round' },
      ],
      solution: `$x = \\dfrac{F}{k} = \\dfrac{${n(F)}}{${k}} = ${n(x)}\\ \\text{m} = ${xcm}\\ \\text{cm}$.`,
      trap: 'x = F/k comes out in metres; multiply by 100 for cm.',
      tags: ['hooke', 'extension', 'units'],
      params: { variant: 'hooke', ask: 'x', k, F },
    });
  }
  return pack(rng, {
    stem: `A force of ${n(F)} N stretches a spring by ${xcm} cm. Find the stiffness of the spring, in ${NPM}.`,
    answer: E(k),
    must: [
      { value: tryE(() => E(F).div(E(xcm))), trap: 'divided by the extension in cm' },
      { value: E(r(F * x)), trap: 'multiplied the force by the extension' },
    ],
    extra: [
      { value: E(k * 10), trap: 'converted cm to m with the wrong power of ten' },
      { value: E(k / 10), trap: 'converted cm to m with the wrong power of ten' },
      { value: tryE(() => E(x).div(E(F))), trap: 'divided the wrong way round' },
      { value: E(k / 2), trap: 'used ½kx for the force' },
    ],
    solution: `$${xcm}\\ \\text{cm} = ${n(x)}\\ \\text{m}$, so $k = \\dfrac{F}{x} = \\dfrac{${n(F)}}{${n(x)}} = ${k}\\ \\text{N m}^{-1}$.`,
    trap: 'Stiffness in N m^-1 needs the extension in metres: dividing by the cm value is 100 times too small.',
    tags: ['hooke', 'stiffness', 'units'],
    params: { variant: 'hooke', ask: 'k', F, xcm },
  });
}

// ----------------------------------------------------------------------------- level 2

function epeQ(rng: RNG): Generated | null {
  const k = rng.pick([50, 100, 200, 250, 400, 500, 800, 1000]);
  const xcm = rng.pick([5, 10, 15, 20, 25, 30, 40, 50]);
  const x = xcm / 100;
  const Ev = r(0.5 * k * x * x);
  if (!tidy(Ev) || !Number.isInteger(r(Ev * 10)) || Ev > 200) return null; // at most one decimal place
  const askK = rng.bool(0.3);
  if (askK) {
    return pack(rng, {
      stem: `A spring stores ${n(Ev)} J of elastic potential energy when it is stretched by ${xcm} cm. Find the stiffness of the spring, in ${NPM}.`,
      answer: E(k),
      must: [
        { value: E(k / 2), trap: 'forgot the ½: used E = kx²' },
        { value: tryE(() => E(2 * Ev).div(E(x))), trap: 'forgot to square the extension' },
      ],
      extra: [
        { value: tryE(() => E(2 * Ev).div(E(xcm * xcm))), trap: 'used the extension in cm' },
        { value: tryE(() => E(Ev).div(E(x))), trap: 'used E = kx' },
        { value: E(k * 10), trap: 'slipped a decimal place' },
        { value: E(k / 10), trap: 'slipped a decimal place' },
      ],
      solution: `$\\tfrac12 k x^2 = ${n(Ev)}$ with $x = ${n(x)}\\ \\text{m}$, so $k = \\dfrac{2 \\times ${n(Ev)}}{${n(x)}^2} = \\dfrac{${n(2 * Ev)}}{${n(r(x * x))}} = ${k}\\ \\text{N m}^{-1}$.`,
      trap: 'Double the energy and divide by x² (in m²): k = 2E/x².',
      tags: ['epe', 'stiffness'],
      params: { variant: 'epe-k', Ev, xcm },
    });
  }
  const spring = rng.pick(['A spring', 'A light spring', 'A bungee cord']);
  return pack(rng, {
    stem: `${spring} of stiffness ${k} ${NPM} is stretched by ${xcm} cm. Find the elastic potential energy stored.`,
    answer: E(Ev),
    unit: U_J,
    must: [
      { value: E(r(k * x * x)), trap: 'forgot the ½: used kx²' },
      { value: E(r(0.5 * k * x)), trap: 'forgot to square the extension' },
    ],
    extra: [
      { value: E(0.5 * k * xcm * xcm), trap: 'used the extension in cm' },
      { value: E(r(k * x)), trap: 'gave the force kx instead of the energy' },
      { value: E(r(0.5 * k * k * x * x)), trap: 'squared the stiffness as well' },
      { value: E(Ev * 10), trap: 'slipped a decimal place' },
    ],
    solution: `$x = ${n(x)}\\ \\text{m}$, so $E = \\tfrac12 k x^2 = \\tfrac12 \\times ${k} \\times ${n(x)}^2 = \\tfrac12 \\times ${k} \\times ${n(r(x * x))} = ${n(Ev)}\\ \\text{J}$.`,
    trap: 'EPE = ½kx² with x in metres: keep the ½ and square the extension.',
    tags: ['epe', 'energy'],
    params: { variant: 'epe', k, xcm },
  });
}

// ----------------------------------------------------------------------------- level 3

function hangingMassQ(rng: RNG): Generated | null {
  const m = rng.pick([0.1, 0.2, 0.25, 0.4, 0.5, 0.6, 0.8, 1, 1.2, 1.5, 2, 2.5, 3, 4, 5]);
  const k = rng.pick([20, 25, 40, 50, 80, 100, 125, 200, 250, 400, 500]);
  const x = r((m * G) / k);
  const xcm = r(x * 100);
  if (!Number.isInteger(xcm * 2) || xcm < 1 || xcm > 60) return null;
  const inCm = rng.bool(0.7);
  const answer = inCm ? E(xcm) : E(x);
  const s = inCm ? 100 : 1;
  return pack(rng, {
    stem: `A mass of ${n(m)} kg hangs at rest from a light spring of stiffness ${k} ${NPM}. ${TAKE_G} Find the extension of the spring${inCm ? ', in cm' : ''}.`,
    answer,
    unit: inCm ? U_CM : U_M,
    must: [
      { value: E(r((m / k) * s)), trap: 'forgot g: used the mass instead of the weight' },
      { value: inCm ? E(x) : E(xcm), trap: inCm ? 'found the extension in metres and called it cm' : 'gave the extension in cm' },
    ],
    extra: [
      { value: E(r(m * G * k)), trap: 'multiplied the weight by the stiffness' },
      { value: E(r(((2 * m * G) / k) * s)), trap: 'used ½kx for the force' },
      { value: E(r(x * s * 10)), trap: 'slipped a decimal place' },
      { value: tryE(() => E(k).div(E(m * G)).mulRat(s)), trap: 'divided the stiffness by the weight' },
    ],
    solution: `At rest the tension equals the weight: $kx = mg$, so $x = \\dfrac{${n(m)} \\times 10}{${k}} = \\dfrac{${n(m * G)}}{${k}} = ${n(x)}\\ \\text{m}${inCm ? ` = ${n(xcm)}\\ \\text{cm}` : ''}$.`,
    trap: 'The spring force balances the weight mg, not the mass; x = mg/k is in metres.',
    tags: ['hooke', 'equilibrium', 'weight'],
    params: { variant: 'hanging', m, k, inCm },
  });
}

function combinationQ(rng: RNG): Generated | null {
  const k = rng.pick([50, 100, 150, 200, 250, 300, 400, 500, 600]);
  const count = rng.pick([2, 2, 3]);
  const series = rng.bool();
  const kEff = series ? k / count : k * count;
  const askStiffness = rng.bool(0.35);
  const words = count === 2 ? 'Two' : 'Three';
  const arrangement = series ? 'joined end to end (in series)' : 'connected side by side (in parallel), sharing the load equally';
  if (askStiffness) {
    if (!Number.isInteger(kEff)) return null;
    return pack(rng, {
      stem: `${words} identical light springs, each of stiffness ${k} ${NPM}, are ${arrangement}. Find the effective stiffness of the combination, in ${NPM}.`,
      answer: E(kEff),
      must: [
        { value: E(series ? k * count : k / count), trap: series ? 'multiplied as if the springs were in parallel' : 'divided as if the springs were in series' },
        { value: E(k), trap: 'assumed identical springs combine to the same stiffness' },
      ],
      extra: [
        { value: E(series ? k / (count * count) : k * count * count), trap: 'applied the factor twice' },
        { value: E(series ? k * count * count : k / (count * count)), trap: 'swapped series and parallel and applied the factor twice' },
        { value: E(kEff * 10), trap: 'slipped a decimal place' },
        { value: E(kEff / 10), trap: 'slipped a decimal place' },
      ],
      solution: series
        ? `In series each spring carries the full load and stretches by $F/k$, so the total extension is $${count}F/k$ and the effective stiffness is $k/${count} = ${n(kEff)}\\ \\text{N m}^{-1}$.`
        : `In parallel each spring carries $F/${count}$ and all stretch by the same $x = F/(${count}k)$, so the effective stiffness is $${count}k = ${n(kEff)}\\ \\text{N m}^{-1}$.`,
      trap: 'Series springs are softer (k/n): each carries the whole load. Parallel springs are stiffer (nk): they share it.',
      tags: ['hooke', 'series', 'parallel', 'stiffness'],
      params: { variant: 'combination', k, count, series, ask: 'k' },
    });
  }
  const F = rng.pick([2, 4, 5, 6, 8, 10, 12, 15, 20, 24, 30, 40, 50, 60]);
  const x = r(F / kEff);
  const xcm = r(x * 100);
  if (!Number.isInteger(xcm * 2) || xcm < 1 || xcm > 60) return null;
  const single = r((F / k) * 100), swapped = r((F / (series ? k * count : k / count)) * 100);
  return pack(rng, {
    stem: `${words} identical light springs, each of stiffness ${k} ${NPM}, are ${arrangement}. A force of ${F} N is applied to the combination. Find the total extension, in cm.`,
    answer: E(xcm),
    unit: U_CM,
    must: [
      { value: E(swapped), trap: series ? 'treated the springs as if they were in parallel' : 'treated the springs as if they were in series' },
      { value: E(single), trap: series ? 'gave the extension of one spring only' : 'gave the extension a single spring would have under the whole load' },
    ],
    extra: [
      { value: E(x), trap: 'found the extension in metres and called it cm' },
      { value: E(r((F / (series ? k / (count * count) : k * count * count)) * 100)), trap: 'applied the factor twice' },
      { value: E(xcm * 10), trap: 'slipped a decimal place' },
      { value: E(2 * xcm), trap: 'doubled the extension' },
    ],
    solution: series
      ? `In series each spring carries the full ${F} N and stretches by $\\dfrac{${F}}{${k}} = ${n(r(F / k))}\\ \\text{m}$, so the total extension is $${count} \\times ${n(r(F / k))} = ${n(x)}\\ \\text{m} = ${n(xcm)}\\ \\text{cm}$.`
      : `In parallel each spring carries $\\dfrac{${F}}{${count}} = ${n(r(F / count))}\\ \\text{N}$, so each (and the combination) stretches by $\\dfrac{${n(r(F / count))}}{${k}} = ${n(x)}\\ \\text{m} = ${n(xcm)}\\ \\text{cm}$.`,
    trap: 'In series every spring feels the whole force and the extensions add; in parallel the force is shared, so the extension is smaller.',
    tags: ['hooke', 'series', 'parallel', 'extension'],
    params: { variant: 'combination', k, count, series, ask: 'x', F },
  });
}

// ----------------------------------------------------------------------------- level 4

/** (k, m) pairs with k/m a perfect square, so v = x√(k/m) is a whole multiple of x. */
const LAUNCH_PAIRS: [number, number][] = [
  [100, 1], [400, 1], [900, 1], [25, 1], [50, 2], [200, 2], [800, 2],
  [200, 0.5], [800, 0.5], [450, 0.5], [100, 0.25], [400, 0.25], [900, 0.25],
  [40, 0.1], [90, 0.1], [160, 0.1], [250, 0.1], [360, 0.1], [1000, 0.1],
  [80, 0.2], [180, 0.2], [320, 0.2], [500, 0.2], [720, 0.2],
  [160, 0.4], [360, 0.4], [1000, 0.4],
];

function launchQ(rng: RNG): Generated | null {
  const [k, m] = rng.pick(LAUNCH_PAIRS);
  const xcm = rng.pick([5, 10, 15, 20, 25, 30, 40, 50]);
  const x = xcm / 100;
  const s = Math.sqrt(k / m);
  const v = r(x * s);
  if (!Number.isInteger(v) || v < 1 || v > 40) return null;
  const Ev = r(0.5 * k * x * x);
  if (!tidy(Ev)) return null;
  const scenarios: [string, string][] = m <= 0.25
    ? [
      ['car', `A toy car of mass ${n(m)} kg is pushed against a spring of stiffness ${k} ${NPM}, compressing it by ${xcm} cm, and released on a smooth horizontal floor.`],
      ['ball', `In a pinball machine a ball of mass ${n(m)} kg is launched by a spring of stiffness ${k} ${NPM} compressed by ${xcm} cm. Friction is negligible.`],
    ]
    : [
      ['block', `A block of mass ${n(m)} kg rests on a smooth horizontal table against a spring of stiffness ${k} ${NPM} compressed by ${xcm} cm. The spring is released.`],
      ['trolley', `A trolley of mass ${n(m)} kg is held against a spring of stiffness ${k} ${NPM} on a smooth horizontal track, compressing it by ${xcm} cm, and then released.`],
    ];
  const [object, scenario] = rng.pick(scenarios);
  return pack(rng, {
    stem: `${scenario} Find the speed of the ${object} as it leaves the spring.`,
    answer: E(v),
    unit: U_MS,
    must: [
      { value: E(r((k * x * x) / m)), trap: 'forgot to take the square root: gave v²' },
      { value: tryE(() => surd(2, v)), trap: 'kept the ½ on only one side: ½kx² = mv² or kx² = ½mv²' },
    ],
    extra: [
      { value: tryE(() => surd(2, v).mulRat(0.5)), trap: 'kept the ½ on only one side: kx² = ½mv²' },
      { value: E(Ev), trap: 'gave the energy stored in joules' },
      { value: E(r((k * x) / m)), trap: 'used v = kx/m (the initial acceleration, not the speed)' },
      { value: E(r(x * s * 100)), trap: 'used the compression in cm' },
      { value: E(2 * v), trap: 'doubled the speed' },
    ],
    solution: `$\\tfrac12 k x^2 = \\tfrac12 m v^2$, so $v = x\\sqrt{k/m} = ${n(x)} \\times \\sqrt{${n(k / m)}} = ${n(x)} \\times ${n(s)} = ${v}\\ ${U_MS}$ (the energy stored is $${n(Ev)}$ J).`,
    trap: 'The two ½s cancel: v = x√(k/m); keep x in metres and take the square root.',
    tags: ['epe', 'kinetic-energy', 'launch'],
    params: { variant: 'launch', k, m, xcm },
  });
}

// ----------------------------------------------------------------------------- level 5

function stretchWorkQ(rng: RNG): Generated | null {
  const k = rng.pick([100, 200, 250, 400, 500, 800, 1000]);
  const x1cm = rng.pick([5, 10, 15, 20, 25, 30]);
  const x2cm = rng.pick([10, 15, 20, 25, 30, 40, 50]);
  if (x2cm <= x1cm) return null;
  const x1 = x1cm / 100, x2 = x2cm / 100;
  const E1 = r(0.5 * k * x1 * x1), E2 = r(0.5 * k * x2 * x2);
  const W = r(E2 - E1);
  if (!tidy(W) || !tidy(E1) || !tidy(E2) || W > 200) return null;
  const F1 = r(k * x1), F2 = r(k * x2);
  return pack(rng, {
    stem: `A spring of stiffness ${k} ${NPM} is already stretched by ${x1cm} cm. Find the additional work needed to stretch it to an extension of ${x2cm} cm.`,
    answer: E(W),
    unit: U_J,
    must: [
      { value: E(r(0.5 * k * (x2 - x1) * (x2 - x1))), trap: 'used ½k(Δx)²: squared the change in extension' },
      { value: E(E2), trap: 'gave the total energy at the final extension, forgetting to subtract the energy already stored' },
    ],
    extra: [
      { value: E(r(k * (x2 * x2 - x1 * x1))), trap: 'forgot the ½' },
      { value: E(r(F2 * (x2 - x1))), trap: 'used final force × distance instead of average force × distance' },
      { value: E(r(F1 * (x2 - x1))), trap: 'used initial force × distance instead of average force × distance' },
      { value: E(E1), trap: 'gave the energy already stored' },
    ],
    solution: `Work $= \\tfrac12 k x_2^2 - \\tfrac12 k x_1^2 = \\tfrac12 \\times ${k} \\times (${n(x2)}^2 - ${n(x1)}^2) = ${n(E2)} - ${n(E1)} = ${n(W)}\\ \\text{J}$. (Equivalently average force $\\tfrac12(${n(F1)} + ${n(F2)})$ N over $${n(r(x2 - x1))}$ m.)`,
    trap: 'The work is the difference of the two stored energies, ½k(x₂² − x₁²), not ½k(x₂ − x₁)² and not the final force × distance.',
    tags: ['epe', 'work', 'stretch'],
    params: { variant: 'stretch-work', k, x1cm, x2cm },
  });
}

function verticalLaunchQ(rng: RNG): Generated | null {
  const k = rng.pick([100, 200, 250, 400, 500, 800, 1000]);
  const xcm = rng.pick([5, 10, 15, 20, 25, 30, 40]);
  const m = rng.pick([0.05, 0.1, 0.2, 0.25, 0.4, 0.5, 1, 2]);
  const x = xcm / 100;
  const Ev = r(0.5 * k * x * x);
  const h = r(Ev / (m * G));
  if (!tidy(Ev) || !Number.isInteger(h * 10) || h < 0.5 || h > 50) return null;
  return pack(rng, {
    stem: `A ball of mass ${n(m)} kg is placed on top of a vertical spring of stiffness ${k} ${NPM}. The spring is compressed by ${xcm} cm and released. Air resistance is negligible. ${TAKE_G} Find the maximum height the ball rises above its starting point.`,
    answer: E(h),
    unit: U_M,
    must: [
      { value: E(r((k * x * x) / (m * G))), trap: 'forgot the ½ in the elastic energy' },
      { value: E(r(Ev / m)), trap: 'forgot g: divided the energy by the mass alone' },
    ],
    extra: [
      { value: E(Ev), trap: 'gave the energy stored in joules' },
      { value: h - x > 0 ? E(r(h - x)) : null, trap: 'measured the height from the natural length of the spring instead of the starting point' },
      { value: E(r((k * x) / (m * G))), trap: 'forgot to square the compression' },
      { value: E(h * 10), trap: 'slipped a decimal place' },
    ],
    solution: `$\\tfrac12 k x^2 = mgh$: the energy stored is $\\tfrac12 \\times ${k} \\times ${n(x)}^2 = ${n(Ev)}\\ \\text{J}$, so $h = \\dfrac{${n(Ev)}}{${n(m)} \\times 10} = ${n(h)}\\ \\text{m}$.`,
    trap: 'Elastic energy ½kx² becomes mgh; divide by the weight mg, not the mass.',
    tags: ['epe', 'gpe', 'launch'],
    params: { variant: 'vertical', k, m, xcm },
  });
}

function slopeLaunchQ(rng: RNG): Generated | null {
  const k = rng.pick([100, 200, 250, 400, 500, 800, 1000]);
  const xcm = rng.pick([5, 10, 15, 20, 25, 30, 40]);
  const m = rng.pick([0.1, 0.2, 0.25, 0.4, 0.5, 1, 2]);
  const x = xcm / 100;
  const Ev = r(0.5 * k * x * x);
  const d = r(Ev / (m * G * 0.5)); // ½kx² = mg d sin 30°
  if (!tidy(Ev) || !Number.isInteger(d * 10) || d < 0.5 || d > 50) return null;
  return pack(rng, {
    stem: `A block of mass ${n(m)} kg is held against a spring of stiffness ${k} ${NPM} at the bottom of a smooth slope inclined at $30^{\\circ}$ to the horizontal. The spring is compressed by ${xcm} cm and the block is released. ${TAKE_G} Find the distance the block travels up the slope before coming to rest.`,
    answer: E(d),
    unit: U_M,
    must: [
      { value: E(r(d / 2)), trap: 'found the vertical height gained, not the distance along the slope' },
      { value: Number.isInteger(d / 3) ? tryE(() => surd(3, d / 3)) : null, trap: 'used cos 30° instead of sin 30°' },
    ],
    extra: [
      { value: E(r(2 * d)), trap: 'forgot the ½ in the elastic energy' },
      { value: E(Ev), trap: 'gave the energy stored in joules' },
      { value: E(r(d / 20)), trap: 'forgot g' },
      { value: E(r(d * 10)), trap: 'slipped a decimal place' },
    ],
    solution: `Energy stored $= \\tfrac12 \\times ${k} \\times ${n(x)}^2 = ${n(Ev)}\\ \\text{J}$. Up the slope the height gained is $d\\sin 30^{\\circ} = \\tfrac12 d$, so $${n(Ev)} = ${n(m)} \\times 10 \\times \\tfrac12 d$ and $d = ${n(d)}\\ \\text{m}$.`,
    trap: 'On a 30° slope the height gained is d sin 30° = d/2, so the distance along the slope is twice what the height would be.',
    tags: ['epe', 'gpe', 'incline'],
    params: { variant: 'slope', k, m, xcm },
  });
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'phy.energy.springs',
  module: 'PHY',
  topic: 'energy',
  title: "Hooke's law and elastic energy",
  levels: {
    1: 'F = kx: find F, the extension in cm, or k in N m^-1 (clean cm → m)',
    2: 'EPE = ½kx² with clean k and x, or k from the energy stored',
    3: 'extension under a hanging mass (mg = kx); identical springs in series/parallel',
    4: '½kx² = ½mv²: launch speed along a smooth surface with k/m a perfect square',
    5: 'work done stretching from x₁ to x₂; spring launching a mass vertically or up a smooth 30° slope',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return hookeQ(rng);
        case 2: return epeQ(rng);
        case 3: return pickVariant(rng, [hangingMassQ, combinationQ]);
        case 4: return launchQ(rng);
        default: return pickVariant(rng, [stretchWorkQ, verticalLaunchQ, slopeLaunchQ]);
      }
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const p = q.params as Record<string, number> & { variant: string; ask?: string; series?: boolean; inCm?: boolean };
    const got = q.answer.value.toNumber();
    const close = (x: number) => Math.abs(got - x) < 1e-9 * Math.max(1, Math.abs(x));
    /** Energy stored as the area under the F–x line: average force × extension. */
    const areaUnderFx = (k: number, x: number) => 0.5 * (0 + k * x) * x;
    switch (p.variant) {
      case 'hooke': {
        // substitute back into Hooke's law with everything in SI units
        if (p.ask === 'F') return Math.abs(got - p.k * (p.xcm / 100)) < 1e-9;
        if (p.ask === 'x') return Math.abs(p.k * (got / 100) - p.F) < 1e-9;
        return Math.abs(got * (p.xcm / 100) - p.F) < 1e-9;
      }
      case 'epe':
        return close(areaUnderFx(p.k, p.xcm / 100));
      case 'epe-k':
        return Math.abs(areaUnderFx(got, p.xcm / 100) - p.Ev) < 1e-9;
      case 'hanging': {
        // the spring force at the answer's extension must equal the weight
        const x = p.inCm ? got / 100 : got;
        return Math.abs(p.k * x - p.m * G) < 1e-9;
      }
      case 'combination': {
        // spring by spring: series → each carries F, extensions add; parallel → each carries F/n, common extension
        const perSpring = (F: number) => (p.series ? F / p.k : F / p.count / p.k);
        const total = (F: number) => (p.series ? p.count * perSpring(F) : perSpring(F));
        if (p.ask === 'x') return Math.abs(got / 100 - total(p.F)) < 1e-9;
        // effective stiffness = force / total extension under a 1 N load
        return close(1 / total(1));
      }
      case 'launch': {
        // energy from the F–x area, then SUVAT-free KE → speed: v = √(2E/m)
        const Ev = areaUnderFx(p.k, p.xcm / 100);
        return Math.abs(0.5 * p.m * got * got - Ev) < 1e-9;
      }
      case 'stretch-work': {
        // trapezium under the F–x line between x1 and x2
        const x1 = p.x1cm / 100, x2 = p.x2cm / 100;
        return close(0.5 * (p.k * x1 + p.k * x2) * (x2 - x1));
      }
      case 'vertical': {
        // the ball would need speed √(2gh) at the bottom: check ½mv² equals the F–x area
        const v2 = 2 * G * got;
        return Math.abs(0.5 * p.m * v2 - areaUnderFx(p.k, p.xcm / 100)) < 1e-9;
      }
      case 'slope': {
        const height = got * Math.sin(Math.PI / 6);
        return Math.abs(p.m * G * height - areaUnderFx(p.k, p.xcm / 100)) < 1e-9;
      }
      default:
        return false;
    }
  },
});
