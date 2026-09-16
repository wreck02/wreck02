import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, Exact } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import type { RNG } from '../../core/rng';

/**
 * Kinetic and potential energy, conservation with and without losses (g = 10 m s^-2 throughout).
 * Level 1: KE = ½mv², GPE = mgh with clean numbers (occasionally solved for v, m or h)
 * Level 2: dropped from h → speed at the bottom √(2gh) with h = 5, 20, 45, 80, 125 (mass a red herring)
 * Level 3: height reached by a ball thrown up at u (u²/20); pendulum or swing released from height h, or
 *          from a string of length L at 60° (h = L/2), → speed at the bottom
 * Level 4: a fraction of the energy lost to friction → speed (√ of the remaining fraction), or the work done
 *          against friction from the speeds (mgh − ½mv²)
 * Level 5: rollercoaster: speed at a lower point given the start speed, the drop and the energy lost; the height
 *          (or speed) at which KE = n × GPE for a dropped or thrown ball
 *
 * Every wrong option is a named mistake (missing ½, no square root, v ∝ h, forgetting g, % of speed instead of
 * % of energy); parameters that cannot supply four distinct clean ones are redrawn, never padded.
 */

const G = 10;
const U_J = '\\text{J}', U_KJ = '\\text{kJ}', U_M = '\\text{m}', U_MS = '\\text{m s}^{-1}', U_KG = '\\text{kg}';
const TAKE_G = 'Take $g = 10\\ \\text{m s}^{-2}$.';

type Candidate = { value: Exact | null; trap: string };

/** Plain number for a stem: 1200, 0.05, 22.5. */
const n = (x: number): string => (Number.isInteger(x) ? `${x}` : `${Number(x.toPrecision(10))}`);

function tryE(f: () => Exact): Exact | null {
  try {
    const v = f();
    return Number.isFinite(v.toNumber()) ? v : null;
  } catch {
    return null;
  }
}

/** √x as an exact value (integer, decimal or a surd with a whole-number coefficient such as 10√2), or null if it is not clean. */
function root(x: number): Exact | null {
  if (!(x > 0)) return null;
  const v = tryE(() => E(x).sqrt());
  if (!v || !isCleanExact(v).ok) return null;
  if (v.hasSurd() && v.terms[0].c.d !== 1n) return null;
  return v;
}

/** Positive, finite, clean and exam-sized candidates. */
function cleanOnly(ds: Candidate[]): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } => {
    const v = d.value;
    if (!v || !Number.isFinite(v.toNumber()) || v.sign() <= 0 || !isCleanExact(v).ok) return false;
    const x = v.toNumber();
    if (x < 0.01 || x > 2e6) return false;
    return !v.isRational() || Number.isInteger(Number((x * 1000).toPrecision(12))); // decimals must terminate
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
  unit: string;
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

/** An energy has at most two decimal places and is not tiny. */
const tidyEnergy = (x: number) => Number.isInteger(x * 100) && x >= 0.1;

// ----------------------------------------------------------------------------- level 1

const KE_OBJECTS: [string, number[], number[]][] = [
  ['ball', [0.2, 0.4, 0.5, 1, 2], [2, 3, 4, 5, 6, 8, 10, 12, 15, 20]],
  ['cyclist and bicycle', [80, 90, 100], [4, 5, 6, 8, 10, 12]],
  ['car', [800, 1000, 1200, 1500, 2000], [5, 10, 12, 15, 20, 25, 30]],
  ['runner', [50, 60, 70, 80], [2, 3, 4, 5, 6, 8, 10]],
  ['trolley', [2, 4, 5, 8, 10, 20], [2, 3, 4, 5, 6, 8, 10]],
  ['lorry', [4000, 5000, 8000, 10000], [5, 10, 15, 20]],
];

function keQ(rng: RNG): Generated | null {
  const [name, masses, speeds] = rng.pick(KE_OBJECTS);
  const m = rng.pick(masses), v = rng.pick(speeds);
  const KE = 0.5 * m * v * v;
  if (!tidyEnergy(KE)) return null;
  const inKJ = KE >= 10000 && KE % 100 === 0;
  const scale = inKJ ? 1 / 1000 : 1;
  const article = /^[aeiou]/.test(name) ? 'An' : 'A';
  const reverse = rng.bool(0.3);
  if (reverse) {
    // solve ½mv² = KE for the speed
    return pack(rng, {
      stem: `${article} ${name} of mass ${n(m)} kg has kinetic energy ${n(KE * scale)} ${inKJ ? 'kJ' : 'J'}. Find its speed.`,
      answer: E(v),
      unit: U_MS,
      must: [
        { value: root(KE / m), trap: 'forgot the ½: used v = √(KE/m)' },
        { value: E((2 * KE) / m), trap: 'forgot to take the square root' },
      ],
      extra: [
        { value: E(KE / m), trap: 'forgot the ½ and the square root' },
        { value: inKJ ? root((2 * KE * scale) / m) : null, trap: 'forgot to convert kJ to J' },
        { value: E(2 * v), trap: 'doubled the speed' },
        { value: E(v / 2), trap: 'halved the speed' },
      ],
      solution: `$\\tfrac12 m v^2 = ${n(KE)}$, so $v^2 = \\dfrac{2 \\times ${n(KE)}}{${n(m)}} = ${v * v}$ and $v = ${v}\\ ${U_MS}$.`,
      trap: 'Double the energy before dividing by the mass, then square-root: v = √(2KE/m).',
      tags: ['kinetic-energy', 'speed'],
      params: { variant: 'ke-speed', m, KE },
    });
  }
  return pack(rng, {
    stem: `${article} ${name} of mass ${n(m)} kg is moving at $${v}\\ ${U_MS}$. Find its kinetic energy${inKJ ? ', in kJ' : ''}.`,
    answer: E(KE * scale),
    unit: inKJ ? U_KJ : U_J,
    must: [
      { value: E(m * v * v * scale), trap: 'forgot the ½' },
      { value: E(0.5 * m * v * scale), trap: 'forgot to square the speed' },
    ],
    extra: [
      { value: E(m * v * scale), trap: 'forgot the ½ and the square: gave the momentum' },
      { value: E(0.5 * m * m * v * v * scale), trap: 'squared the mass as well as the speed' },
      { value: inKJ ? E(KE) : E(KE / 1000), trap: inKJ ? 'left the answer in joules' : 'gave the answer in kJ' },
      { value: E(KE * scale * 10), trap: 'slipped a decimal place' },
    ],
    solution: `$KE = \\tfrac12 m v^2 = \\tfrac12 \\times ${n(m)} \\times ${v}^2 = \\tfrac12 \\times ${n(m)} \\times ${v * v} = ${n(KE)}\\ \\text{J}${inKJ ? ` = ${n(KE * scale)}\\ \\text{kJ}` : ''}$.`,
    trap: 'Square the speed and halve: KE = ½mv², not mv² or ½mv.',
    tags: ['kinetic-energy'],
    params: { variant: 'ke', m, v, inKJ },
  });
}

const GPE_OBJECTS: [string, number[], number[]][] = [
  ['book', [0.5, 1, 2], [1, 1.5, 2, 3]],
  ['brick', [2, 3, 5], [1.5, 2, 3, 4, 5, 6, 8, 10]],
  ['climber', [50, 60, 70, 80], [5, 8, 10, 12, 15, 20, 25, 30, 50, 100]],
  ['load', [100, 200, 250, 500, 1000], [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30]],
  ['ball', [0.2, 0.4, 0.5, 2], [2, 3, 4, 5, 8, 10, 12, 15, 20]],
];

function gpeQ(rng: RNG): Generated | null {
  const [name, masses, heights] = rng.pick(GPE_OBJECTS);
  const m = rng.pick(masses), h = rng.pick(heights);
  const PE = m * G * h;
  if (!tidyEnergy(PE)) return null;
  const inKJ = PE >= 10000 && PE % 100 === 0;
  const scale = inKJ ? 1 / 1000 : 1;
  const article = /^[aeiou]/.test(name) ? 'An' : 'A';
  const ask = rng.weighted(['energy', 'height', 'mass'], [7, 2, 1]);
  if (ask === 'height') {
    return pack(rng, {
      stem: `${article} ${name} of mass ${n(m)} kg gains ${n(PE * scale)} ${inKJ ? 'kJ' : 'J'} of gravitational potential energy when it is lifted vertically. ${TAKE_G} Find the height through which it is lifted.`,
      answer: E(h),
      unit: U_M,
      must: [
        { value: E(PE / m), trap: 'forgot g: divided by the mass only' },
        { value: E((2 * PE) / (m * G)), trap: 'put in a spurious factor of ½ (as in ½mv²)' },
      ],
      extra: [
        { value: inKJ ? E((PE * scale) / (m * G)) : null, trap: 'forgot to convert kJ to J' },
        { value: E(h * 10), trap: 'slipped a decimal place' },
        { value: E(h / 10), trap: 'slipped a decimal place' },
        { value: E(2 * h), trap: 'doubled the height' },
      ],
      solution: `$mgh = ${n(PE)}$, so $h = \\dfrac{${n(PE)}}{${n(m)} \\times 10} = ${n(h)}\\ \\text{m}$.`,
      trap: 'Divide by the weight mg, not by the mass alone.',
      tags: ['gpe', 'height'],
      params: { variant: 'gpe-height', m, PE },
    });
  }
  if (ask === 'mass') {
    return pack(rng, {
      stem: `An object gains ${n(PE * scale)} ${inKJ ? 'kJ' : 'J'} of gravitational potential energy when it is raised ${n(h)} m. ${TAKE_G} Find the mass of the object.`,
      answer: E(m),
      unit: U_KG,
      must: [
        { value: E(PE / h), trap: 'forgot g: divided by the height only' },
        { value: E((2 * PE) / (G * h)), trap: 'put in a spurious factor of ½ (as in ½mv²)' },
      ],
      extra: [
        { value: inKJ ? E((PE * scale) / (G * h)) : null, trap: 'forgot to convert kJ to J' },
        { value: E(m * 10), trap: 'slipped a decimal place' },
        { value: E(m / 10), trap: 'slipped a decimal place' },
        { value: E(2 * m), trap: 'doubled the mass' },
      ],
      solution: `$mgh = ${n(PE)}$, so $m = \\dfrac{${n(PE)}}{10 \\times ${n(h)}} = ${n(m)}\\ \\text{kg}$.`,
      trap: 'Divide by g × h, not by the height alone.',
      tags: ['gpe', 'mass'],
      params: { variant: 'gpe-mass', h, PE },
    });
  }
  return pack(rng, {
    stem: `${article} ${name} of mass ${n(m)} kg is lifted vertically through ${n(h)} m. ${TAKE_G} Find the gain in gravitational potential energy${inKJ ? ', in kJ' : ''}.`,
    answer: E(PE * scale),
    unit: inKJ ? U_KJ : U_J,
    must: [
      { value: E(m * h * scale), trap: 'forgot g: used mass × height' },
      { value: E(0.5 * PE * scale), trap: 'put in a spurious factor of ½ (as in ½mv²)' },
    ],
    extra: [
      { value: E(m * G * h * h * scale), trap: 'squared the height (as if it were a speed)' },
      { value: inKJ ? E(PE) : E(PE / 1000), trap: inKJ ? 'left the answer in joules' : 'gave the answer in kJ' },
      { value: E(PE * scale * 10), trap: 'slipped a decimal place' },
      { value: E(2 * PE * scale), trap: 'doubled the energy' },
    ],
    solution: `$\\Delta PE = mgh = ${n(m)} \\times 10 \\times ${n(h)} = ${n(PE)}\\ \\text{J}${inKJ ? ` = ${n(PE * scale)}\\ \\text{kJ}` : ''}$.`,
    trap: 'GPE = mgh: weight (mg) times height, with no ½ and nothing squared.',
    tags: ['gpe'],
    params: { variant: 'gpe', m, h, inKJ },
  });
}

// ----------------------------------------------------------------------------- level 2

function dropQ(rng: RNG): Generated | null {
  const h = rng.pick([5, 20, 45, 80, 125]);
  const m = rng.bool(0.6) ? rng.pick([0.2, 0.5, 1, 2, 5]) : 0;
  const v = Math.sqrt(2 * G * h);
  const object = rng.pick(['stone', 'ball', 'coconut', 'apple']);
  const stem = `A ${object}${m ? ` of mass ${n(m)} kg` : ''} is dropped from rest from a height of ${h} m. Air resistance is negligible. ${TAKE_G} Find the speed of the ${object} just before it hits the ground.`;
  return pack(rng, {
    stem,
    answer: E(v),
    unit: U_MS,
    must: [
      { value: root(G * h), trap: 'forgot the 2: used v = √(gh)' },
      { value: E(2 * G * h), trap: 'forgot to take the square root: gave v²' },
    ],
    extra: [
      { value: root(2 * h), trap: 'forgot g' },
      { value: E(G * h), trap: 'forgot the 2 and the square root' },
      { value: m ? E(m * G * h) : null, trap: 'gave the kinetic energy in joules instead of the speed' },
      { value: E(2 * v), trap: 'doubled the speed' },
    ],
    solution: `$mgh = \\tfrac12 m v^2$ (the mass cancels), so $v = \\sqrt{2gh} = \\sqrt{2 \\times 10 \\times ${h}} = \\sqrt{${2 * G * h}} = ${n(v)}\\ ${U_MS}$.`,
    trap: 'v = √(2gh): keep the 2 and take the square root; the mass cancels, so it is not needed.',
    tags: ['conservation', 'free-fall', 'speed'],
    params: { variant: 'drop', h },
  });
}

// ----------------------------------------------------------------------------- level 3

function throwUpQ(rng: RNG): Generated | null {
  const u = rng.pick([10, 20, 30, 40, 50]);
  const m = rng.bool(0.5) ? rng.pick([0.2, 0.5, 1, 2]) : 0;
  const h = (u * u) / (2 * G);
  return pack(rng, {
    stem: `A ball${m ? ` of mass ${n(m)} kg` : ''} is thrown vertically upwards at $${u}\\ ${U_MS}$. Air resistance is negligible. ${TAKE_G} Find the maximum height reached above the point of release.`,
    answer: E(h),
    unit: U_M,
    must: [
      { value: E((u * u) / G), trap: 'forgot the ½: used mgh = mu²' },
      { value: E(u / G), trap: 'found the time to the top (u/g), not the height' },
    ],
    extra: [
      { value: E((u * u) / 2), trap: 'forgot g' },
      { value: E((2 * u * u) / G), trap: 'put the factor 2 on the wrong side' },
      { value: m ? E(0.5 * m * u * u) : null, trap: 'gave the kinetic energy in joules instead of the height' },
      { value: E(h / 2), trap: 'halved twice' },
    ],
    solution: `$\\tfrac12 m u^2 = mgh$, so $h = \\dfrac{u^2}{2g} = \\dfrac{${u * u}}{20} = ${n(h)}\\ \\text{m}$.`,
    trap: 'h = u²/(2g): the ½ from the kinetic energy stays, giving ÷20 with g = 10.',
    tags: ['conservation', 'projectile', 'height'],
    params: { variant: 'throw-up', u },
  });
}

function pendulumQ(rng: RNG): Generated | null {
  const m = rng.pick([0.2, 0.5, 1, 2, 30, 40]);
  const byLength = rng.bool(0.4);
  if (byLength) {
    // released from 60° to the vertical: the drop is L(1 − cos 60°) = L/2, so v² = 2g(L/2) = gL
    const L = rng.pick([0.4, 0.9, 1.6, 2.5, 3.6, 6.4, 10]);
    const v = Math.sqrt(G * L);
    const who = m >= 30 ? `A child of mass ${m} kg sits on a swing whose ropes are ${n(L)} m long. The swing` : `A pendulum bob of mass ${n(m)} kg hangs on a light string of length ${n(L)} m. The bob`;
    return pack(rng, {
      stem: `${who} is pulled aside until the ${m >= 30 ? 'ropes make' : 'string makes'} an angle of $60^{\\circ}$ with the vertical and is released from rest. ${TAKE_G} Find the speed at the lowest point.`,
      answer: E(v),
      unit: U_MS,
      must: [
        { value: root(2 * G * L), trap: 'took the drop in height to be the whole length L' },
        { value: E(G * L), trap: 'forgot to take the square root: gave v²' },
      ],
      extra: [
        { value: E(2 * G * L), trap: 'used the whole length as the drop and forgot the square root' },
        { value: E(0.5 * m * G * L), trap: 'gave the kinetic energy at the bottom in joules' },
        { value: E(2 * v), trap: 'doubled the speed' },
        { value: E(v / 2), trap: 'halved the speed' },
      ],
      solution: `The drop in height is $L - L\\cos 60^{\\circ} = \\tfrac12 L = ${n(L / 2)}\\ \\text{m}$, so $v = \\sqrt{2gh} = \\sqrt{2 \\times 10 \\times ${n(L / 2)}} = \\sqrt{${n(G * L)}} = ${n(v)}\\ ${U_MS}$.`,
      trap: 'The vertical drop is L(1 − cos θ), which for 60° is L/2, not the full length of the string.',
      tags: ['conservation', 'pendulum', 'speed'],
      params: { variant: 'pendulum-length', L },
    });
  }
  const h = rng.pick([0.2, 0.45, 0.8, 1.25, 1.8, 3.2, 5]);
  const v = Math.sqrt(2 * G * h);
  const who = m >= 30 ? `A child of mass ${m} kg on a swing is released from rest ${n(h)} m above the lowest point of the swing.` : `A pendulum bob of mass ${n(m)} kg is released from rest at a point ${n(h)} m above its lowest position.`;
  return pack(rng, {
    stem: `${who} Air resistance is negligible. ${TAKE_G} Find the speed at the lowest point.`,
    answer: E(v),
    unit: U_MS,
    must: [
      { value: root(G * h), trap: 'forgot the 2: used v = √(gh)' },
      { value: E(2 * G * h), trap: 'forgot to take the square root: gave v²' },
    ],
    extra: [
      { value: E(G * h), trap: 'forgot the 2 and the square root' },
      { value: E(m * G * h), trap: 'gave the kinetic energy at the bottom in joules' },
      { value: E(2 * v), trap: 'doubled the speed' },
      { value: E(v / 2), trap: 'halved the speed' },
    ],
    solution: `$mgh = \\tfrac12 m v^2$, so $v = \\sqrt{2gh} = \\sqrt{2 \\times 10 \\times ${n(h)}} = \\sqrt{${n(2 * G * h)}} = ${n(v)}\\ ${U_MS}$.`,
    trap: 'Only the vertical drop matters: v = √(2gh), with the mass cancelling.',
    tags: ['conservation', 'pendulum', 'speed'],
    params: { variant: 'pendulum-height', h },
  });
}

// ----------------------------------------------------------------------------- level 4

function fractionLostQ(rng: RNG): Generated | null {
  const k = rng.int(1, 6);
  const h = 5 * k * k; // √(2gh) = 10k
  const f = rng.pick([10, 20, 25, 36, 50, 64, 75]); // percentage of the energy lost
  const v0 = 10 * k;
  const answer = root(2 * G * h * (1 - f / 100));
  const who = rng.pick([
    `A skier of mass 60 kg starts from rest and descends a slope of vertical height ${h} m.`,
    `A sledge and rider of total mass 80 kg start from rest at the top of a slope ${h} m high.`,
    `A rollercoaster car of mass 500 kg starts from rest at a height of ${h} m above the bottom of a dip.`,
  ]);
  return pack(rng, {
    stem: `${who} During the descent ${f}% of the initial gravitational potential energy is lost to friction and air resistance. ${TAKE_G} Find the speed at the bottom.`,
    answer,
    unit: U_MS,
    must: [
      { value: E(v0), trap: 'ignored the energy lost' },
      { value: E(v0 * (1 - f / 100)), trap: `reduced the speed by ${f}% instead of the energy` },
    ],
    extra: [
      { value: root(2 * G * h * (f / 100)), trap: 'used the fraction lost instead of the fraction remaining' },
      { value: E(2 * G * h * (1 - f / 100)), trap: 'forgot to take the square root: gave v²' },
      { value: root(G * h * (1 - f / 100)), trap: 'forgot the 2' },
    ],
    solution: `$\\tfrac12 m v^2 = ${n(1 - f / 100)}\\,mgh$, so $v^2 = ${n(1 - f / 100)} \\times 2 \\times 10 \\times ${h} = ${n(2 * G * h * (1 - f / 100))}$ and $v = ${answer!.toLatex()}\\ ${U_MS}$.`,
    trap: 'A percentage of the energy is lost, not of the speed: KE ∝ v², so the speed scales by the square root of the fraction remaining.',
    tags: ['conservation', 'friction', 'percentage-loss'],
    params: { variant: 'fraction-lost', h, f },
  });
}

function frictionWorkQ(rng: RNG): Generated | null {
  const m = rng.pick([2, 4, 5, 10, 20, 40, 50, 60, 70, 80, 100]);
  const h = rng.pick([2, 3, 4, 5, 6, 8, 10, 12, 15, 20]);
  const v = rng.pick([2, 4, 5, 6, 8, 10, 12, 14, 15, 16, 18]);
  const PE = m * G * h, KE = 0.5 * m * v * v;
  const Wf = PE - KE;
  if (Wf <= 0 || !Number.isInteger(Wf) || Wf < 0.1 * PE || Wf > 0.8 * PE) return null;
  const inKJ = Wf >= 10000 && Wf % 100 === 0;
  const scale = inKJ ? 1 / 1000 : 1;
  const who = rng.pick([
    `A cyclist and bicycle of total mass ${m} kg freewheel from rest down a hill of vertical height ${h} m, reaching a speed of $${v}\\ ${U_MS}$ at the bottom.`,
    `A child of mass ${m} kg slides from rest down a slide of vertical height ${h} m and reaches the bottom at $${v}\\ ${U_MS}$.`,
    `A block of mass ${m} kg is released from rest and slides ${h} m vertically down a rough slope, arriving at the bottom at $${v}\\ ${U_MS}$.`,
  ]);
  return pack(rng, {
    stem: `${who} ${TAKE_G} Find the work done against friction${inKJ ? ', in kJ' : ''}.`,
    answer: E(Wf * scale),
    unit: inKJ ? U_KJ : U_J,
    must: [
      { value: E(PE * scale), trap: 'ignored the kinetic energy at the bottom' },
      { value: E(KE * scale), trap: 'gave the kinetic energy at the bottom' },
    ],
    extra: [
      { value: E((PE + KE) * scale), trap: 'added the kinetic energy instead of subtracting it' },
      { value: PE - m * v * v > 0 ? E((PE - m * v * v) * scale) : null, trap: 'forgot the ½ in the kinetic energy' },
      { value: E((PE - 0.5 * m * v) * scale), trap: 'forgot to square the speed' },
      { value: E(Wf * scale * 2), trap: 'doubled the result' },
    ],
    solution: `PE lost $= mgh = ${m} \\times 10 \\times ${h} = ${PE}\\ \\text{J}$; KE gained $= \\tfrac12 \\times ${m} \\times ${v}^2 = ${n(KE)}\\ \\text{J}$; the difference, $${n(Wf)}\\ \\text{J}${inKJ ? ` = ${n(Wf * scale)}\\ \\text{kJ}` : ''}$, is the work done against friction.`,
    trap: 'Work against friction = PE lost − KE gained; both terms are needed and the KE keeps its ½ and its v².',
    tags: ['conservation', 'friction', 'work'],
    params: { variant: 'friction-work', m, h, v, inKJ },
  });
}

// ----------------------------------------------------------------------------- level 5

function coasterQ(rng: RNG): Generated | null {
  const m = rng.pick([200, 400, 500, 800, 1000]);
  const u = rng.pick([0, 5, 10, 12, 15, 20]);
  const hA = rng.pick([20, 25, 30, 40, 45, 50, 60]);
  const hB = rng.pick([0, 5, 8, 10, 12, 15, 20, 25]);
  const drop = hA - hB;
  if (drop < 10) return null;
  const v = rng.pick([10, 12, 15, 16, 18, 20, 24, 25, 30]);
  const W = (m * (u * u + 2 * G * drop - v * v)) / 2; // energy lost to friction
  if (W <= 0 || W % 1000 !== 0) return null;
  const WkJ = W / 1000;
  // a round number of kJ (at most two significant figures) that divides by the mass to whole joules per kg
  if (WkJ > 300 || W < 0.05 * m * G * drop || !Number.isInteger(W / m)) return null;
  if (!(WkJ % 10 === 0 || (WkJ < 100 && WkJ % 5 === 0))) return null;
  const startA = u === 0 ? `is released from rest at point $A$, ${hA} m above the ground` : `passes point $A$, ${hA} m above the ground, at $${u}\\ ${U_MS}$`;
  const atB = hB === 0 ? 'point $B$ at ground level' : `point $B$, ${hB} m above the ground`;
  return pack(rng, {
    stem: `A rollercoaster car of mass ${m} kg ${startA}. Between $A$ and ${atB}, ${WkJ} kJ of energy is lost to friction. ${TAKE_G} Find the speed of the car at $B$.`,
    answer: E(v),
    unit: U_MS,
    must: [
      { value: root(u * u + 2 * G * drop), trap: 'ignored the energy lost to friction' },
      { value: root(u * u + 2 * G * drop - W / m), trap: 'lost the factor 2 when converting the energy lost into v²' },
    ],
    extra: [
      { value: u ? root(2 * G * drop - (2 * W) / m) : null, trap: 'ignored the speed at A' },
      { value: hB ? root(u * u + 2 * G * hA - (2 * W) / m) : null, trap: 'used the height of A above the ground instead of the drop from A to B' },
      { value: E(u * u + 2 * G * drop - (2 * W) / m), trap: 'forgot to take the square root: gave v²' },
      { value: root(u * u + 2 * G * drop - (2 * WkJ) / m), trap: 'forgot to convert kJ to J' },
    ],
    solution: `Energy per kilogram: $\\tfrac12 v^2 = \\tfrac12 u^2 + g\\,\\Delta h - \\dfrac{W}{m} = ${n((u * u) / 2)} + ${G * drop} - ${n(W / m)} = ${n((v * v) / 2)}$, so $v^2 = ${v * v}$ and $v = ${v}\\ ${U_MS}$.`,
    trap: 'Divide the energy lost by the mass and double it before subtracting from v²; use the drop A→B, not the height above the ground.',
    tags: ['conservation', 'rollercoaster', 'friction', 'speed'],
    params: { variant: 'coaster', m, u, hA, hB, W },
  });
}

function keRatioQ(rng: RNG): Generated | null {
  const kind = rng.pick(['height-drop', 'height-throw', 'speed-drop']);
  if (kind === 'height-drop') {
    // dropped from H: KE = k × GPE when (H − h) = k h, i.e. h = H/(k + 1)
    const k = rng.pick([1, 2, 3, 4]);
    const H = rng.pick([10, 12, 15, 16, 20, 24, 25, 30, 40, 45, 50, 60, 80, 100]);
    if (H % (k + 1) !== 0) return null;
    const h = H / (k + 1);
    const times = k === 1 ? 'equal to' : k === 2 ? 'twice' : k === 3 ? 'three times' : 'four times';
    return pack(rng, {
      stem: `A ball is dropped from rest from a height of ${H} m above the ground. Air resistance is negligible. Taking the ground as the zero of potential energy, find the height of the ball above the ground when its kinetic energy is ${times} its gravitational potential energy.`,
      answer: E(h),
      unit: U_M,
      must: [
        { value: E(H - h), trap: 'gave the distance fallen rather than the height above the ground' },
        { value: k > 1 ? E(H / k) : E(H / 4), trap: k > 1 ? 'divided by k instead of k + 1' : 'divided by 4 instead of 2' },
      ],
      extra: [
        { value: k !== 1 ? E(H / 2) : null, trap: 'split the energy equally regardless of the ratio' },
        { value: E(h / 2), trap: 'halved the result' },
        { value: E(2 * h), trap: 'doubled the result' },
        { value: E((k * H) / (k + 1) / 2), trap: 'halved the distance fallen' },
      ],
      solution: `KE gained $= mg(H - h)$ and GPE $= mgh$, so $H - h = ${k}h$ gives $h = \\dfrac{H}{${k + 1}} = \\dfrac{${H}}{${k + 1}} = ${n(h)}\\ \\text{m}$.`,
      trap: 'KE = k × GPE means the distance fallen is k times the height remaining: h = H/(k + 1), not H/k.',
      tags: ['conservation', 'ratio', 'height'],
      params: { variant: 'ratio-height-drop', H, k },
    });
  }
  if (kind === 'height-throw') {
    const u = rng.pick([10, 20, 30, 40, 60]);
    const h = (u * u) / (4 * G);
    return pack(rng, {
      stem: `A ball is thrown vertically upwards from the ground at $${u}\\ ${U_MS}$. Air resistance is negligible. ${TAKE_G} Find the height at which its kinetic energy equals its gravitational potential energy.`,
      answer: E(h),
      unit: U_M,
      must: [
        { value: E((u * u) / (2 * G)), trap: 'found the maximum height (all the energy as PE)' },
        { value: E((u * u) / G), trap: 'forgot the ½ in the kinetic energy and found u²/g' },
      ],
      extra: [
        { value: E((u * u) / (8 * G)), trap: 'halved once too often' },
        { value: E(u / (2 * G)), trap: 'forgot to square the speed' },
        { value: E(2 * h), trap: 'doubled the result' },
        { value: E((u * u) / 2), trap: 'forgot g' },
      ],
      solution: `Total energy $= \\tfrac12 m u^2$; when KE = GPE each is half of that, so $mgh = \\tfrac14 m u^2$ and $h = \\dfrac{u^2}{4g} = \\dfrac{${u * u}}{40} = ${n(h)}\\ \\text{m}$.`,
      trap: 'When KE = GPE the potential energy is half the total, so the height is half the maximum height u²/(2g).',
      tags: ['conservation', 'ratio', 'projectile'],
      params: { variant: 'ratio-height-throw', u },
    });
  }
  // speed when KE = GPE for a ball dropped from H: ½v² = gH/2 → v = √(gH)
  const H = rng.pick([2.5, 3.6, 5, 6.4, 10, 20, 40, 90]);
  const answer = root(G * H);
  return pack(rng, {
    stem: `A ball is dropped from rest from a height of ${n(H)} m above the ground. Air resistance is negligible. Taking the ground as the zero of potential energy, find the speed of the ball at the instant its kinetic energy equals its gravitational potential energy. ${TAKE_G}`,
    answer,
    unit: U_MS,
    must: [
      { value: root(2 * G * H), trap: 'found the speed on reaching the ground' },
      { value: E(G * H), trap: 'forgot to take the square root: gave v²' },
    ],
    extra: [
      { value: root(2 * G * H) ? root(2 * G * H)!.mulRat(0.5) : null, trap: 'halved the landing speed instead of halving the energy' },
      { value: root((G * H) / 2), trap: 'halved the energy twice' },
      { value: E(G * H * 2), trap: 'forgot the square root and used the full energy' },
      { value: E(H), trap: 'gave the height' },
    ],
    solution: `When KE = GPE each is half the initial energy $mgH$, so $\\tfrac12 m v^2 = \\tfrac12 mgH$ and $v = \\sqrt{gH} = \\sqrt{${n(G * H)}} = ${answer!.toLatex()}\\ ${U_MS}$.`,
    trap: 'Halving the energy divides the speed by √2, not by 2: v = √(gH), which is the landing speed √(2gH) divided by √2.',
    tags: ['conservation', 'ratio', 'speed'],
    params: { variant: 'ratio-speed-drop', H },
  });
}

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'phy.energy.conservation',
  module: 'PHY',
  topic: 'energy',
  title: 'Kinetic and potential energy',
  levels: {
    1: 'KE = ½mv² and GPE = mgh with clean numbers (sometimes solved for v, m or h)',
    2: 'dropped from h = 5, 20, 45, 80 or 125 m → speed √(2gh); the mass is a red herring',
    3: 'height reached by a ball thrown up at u (u²/20); pendulum or swing → speed at the bottom, including a string at 60°',
    4: 'a percentage of the energy lost to friction → speed; work done against friction from the speeds',
    5: 'rollercoaster with a stated energy loss → speed at a lower point; height or speed at which KE = n × GPE',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return pickVariant(rng, [keQ, gpeQ]);
        case 2: return dropQ(rng);
        case 3: return pickVariant(rng, [throwUpQ, pendulumQ]);
        case 4: return pickVariant(rng, [fractionLostQ, frictionWorkQ]);
        default: return pickVariant(rng, [coasterQ, keRatioQ]);
      }
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const p = q.params as Record<string, number> & { variant: string; inKJ?: boolean };
    const got = q.answer.value.toNumber();
    const close = (x: number) => Math.abs(got - x) < 1e-9 * Math.max(1, Math.abs(x));
    // SUVAT helpers: speed after falling s from rest, and the drop needed to reach speed v from rest
    const fallSpeed = (s: number) => { const t = Math.sqrt((2 * s) / G); return G * t; };
    const fallFor = (v: number) => { const t = v / G; return 0.5 * G * t * t; };
    switch (p.variant) {
      case 'ke': {
        // work done by a constant force accelerating the mass from rest: F = ma over s = v²/(2a) (SUVAT)
        const a = 2;
        const s = (p.v * p.v) / (2 * a);
        const W = p.m * a * s;
        return close(p.inKJ ? W / 1000 : W);
      }
      case 'ke-speed':
        // substitute back: half the mass times the speed squared must be the stated energy
        return Math.abs(0.5 * p.m * got * got - p.KE) < 1e-9;
      case 'gpe': {
        // the KE a body would have after falling h (SUVAT), which equals the PE at height h
        const v = fallSpeed(p.h);
        const KE = 0.5 * p.m * v * v;
        return close(p.inKJ ? KE / 1000 : KE);
      }
      case 'gpe-height':
        return Math.abs(0.5 * p.m * fallSpeed(got) ** 2 - p.PE) < 1e-9;
      case 'gpe-mass':
        return Math.abs(0.5 * got * fallSpeed(p.h) ** 2 - p.PE) < 1e-9;
      case 'drop':
        return close(fallSpeed(p.h));
      case 'throw-up': {
        // time to the top u/g, then s = ut − ½gt²
        const t = p.u / G;
        return close(p.u * t - 0.5 * G * t * t);
      }
      case 'pendulum-length': {
        const h = p.L * (1 - Math.cos(Math.PI / 3));
        return close(fallSpeed(h));
      }
      case 'pendulum-height':
        return close(fallSpeed(p.h));
      case 'fraction-lost': {
        // per kilogram: KE at the bottom = (1 − f) g h; compare v²/2
        const kePerKg = (1 - p.f / 100) * G * p.h;
        return Math.abs(0.5 * got * got - kePerKg) < 1e-9;
      }
      case 'friction-work': {
        // energy bookkeeping with an arbitrary reference: total at the top vs total at the bottom
        const top = p.m * G * p.h + 0, bottom = 0 + 0.5 * p.m * p.v * p.v;
        const W = top - bottom;
        return close(p.inKJ ? W / 1000 : W);
      }
      case 'coaster': {
        // SUVAT with a constant decelerating force spread over the vertical drop
        const drop = p.hA - p.hB;
        const aEff = G - p.W / (p.m * drop);
        return Math.abs(got * got - (p.u * p.u + 2 * aEff * drop)) < 1e-9;
      }
      case 'ratio-height-drop': {
        // at height got: KE from SUVAT for the distance fallen, GPE from the height; check the ratio is k
        const fallen = p.H - got;
        const v = fallSpeed(fallen);
        const ke = 0.5 * v * v, pe = G * got;
        return Math.abs(ke - p.k * pe) < 1e-9;
      }
      case 'ratio-height-throw': {
        // speed at height got from v² = u² − 2g·s; KE must equal GPE
        const v2 = p.u * p.u - 2 * G * got;
        return v2 > 0 && Math.abs(0.5 * v2 - G * got) < 1e-9;
      }
      case 'ratio-speed-drop': {
        // height where the speed is got (SUVAT), then compare KE with GPE
        const fallen = fallFor(got);
        const h = p.H - fallen;
        return h > 0 && Math.abs(0.5 * got * got - G * h) < 1e-9;
      }
      default:
        return false;
    }
  },
});
