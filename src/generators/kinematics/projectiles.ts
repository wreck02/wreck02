import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { Exact, frac } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { num, poly } from '../../core/gen-utils';
import type { RNG } from '../../core/rng';

/**
 * Projectiles with g = 10 m s⁻² (air resistance ignored).
 * Level 1: dropped from h = 20, 45, 80 m: time to fall (2, 3, 4 s) or speed on landing (20, 30, 40 m/s)
 * Level 2: thrown vertically upward at u: max height u²/20, time to the top u/10, time back to the hand 2u/10
 * Level 3: horizontal launch from a cliff: range = u_x × fall time (or the fall time itself)
 * Level 4: given horizontal and vertical components (or speed with sin θ = 3/5): time of flight 2u_y/g,
 *          range u_x·2u_y/g, maximum height u_y²/(2g)
 * Level 5: speed at a given height via v² = u² − 2gh; launch speed to reach a height; a ball thrown up from a
 *          cliff (total time via a factorisable quadratic, or landing speed); speed at the top of an angled flight
 */

const G = 10;
const DEC = { format: 'decimal' as const };
const U = {
  v: '\\text{m s}^{-1}',
  a: '\\text{m s}^{-2}',
  s: '\\text{m}',
  t: '\\text{s}',
};
const G_NOTE = `Ignore air resistance and take $g = 10\\ ${U.a}$.`;

const X = (x: number): Exact => Exact.num(Number(x.toFixed(9)));
const q = (x: number, unit: string): string => `$${num(x)}\\ ${unit}$`;

type Cand = { value: number | null; trap: string };

/** Finite, non-negative, clean, and within a sane factor of the answer (zero allowed: "the speed at the top is zero" is a real trap). */
function cleanOnly(ds: Cand[], answer: number): Distractor[] {
  const out: Distractor[] = [];
  for (const d of ds) {
    if (d.value === null || !Number.isFinite(d.value) || d.value < 0) continue;
    if (d.value !== 0 && (d.value > 200 * answer || d.value < answer / 200)) continue;
    const v = X(d.value);
    if (!isCleanExact(v).ok) continue;
    out.push({ value: v, trap: d.trap });
  }
  return out;
}

/**
 * One headline trap always goes in; the remaining musts are preferred within their own side of the
 * answer and the rest are chosen towards a randomly drawn number of options *below* it. Without that
 * the landing-speed question offers two mistakes below and two above in every single instance and
 * "pick the middle option" scores 100%. Candidates that would stretch the option list beyond
 * `maxSpread` are skipped: 900 m s⁻¹ has no business in a list whose answer is 30 m s⁻¹.
 */
function ranked(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], count = 4, maxSpread = 40): Distractor[] {
  const a = answer.toNumber();
  const seen: Exact[] = [answer];
  const mags: number[] = Math.abs(a) > 0 ? [Math.abs(a)] : [];
  const out: Distractor[] = [];
  const take = (d: Distractor) => {
    if (out.length >= count || seen.some((s) => s.equals(d.value))) return;
    const x = Math.abs(d.value.toNumber());
    if (x > 0 && mags.length > 0 && Math.max(...mags, x) / Math.min(...mags, x) > maxSpread) return;
    seen.push(d.value);
    if (x > 0) mags.push(x);
    out.push(d);
  };
  const heads = rng.shuffle(must);
  if (heads.length > 0) take(heads[0]);
  const rest = heads.slice(1);
  const side = (lo: boolean) => [...rest, ...rng.shuffle(extra)].filter((d) => (lo ? d.value.toNumber() < a : d.value.toNumber() > a));
  const below = side(true);
  const above = side(false);
  let wantBelow = rng.int(0, count) - out.filter((d) => d.value.toNumber() < a).length;
  while (out.length < count && (below.length > 0 || above.length > 0)) {
    const useBelow = below.length > 0 && (wantBelow > 0 || above.length === 0);
    take((useBelow ? below : above).shift()!);
    if (useBelow) wantBelow--;
  }
  return out;
}

const fallback = (answer: number): Exact[] =>
  [2, 0.5, 3, 4, 1.5, 0.25, 10, 0.1].map((k) => X(answer * k)).filter((v) => isCleanExact(v).ok);

function physOptions(rng: RNG, answer: number, unit: string, must: Cand[], extra: Cand[]) {
  const ans = X(answer);
  return buildOptions(rng, ans, ranked(rng, ans, cleanOnly(must, answer), cleanOnly(extra, answer)), { ...DEC, unit, fallback: fallback(answer) });
}

function finish(stem: string, answer: number, unit: string, options: ReturnType<typeof buildOptions>, solution: string, trap: string, tags: string[], params: Record<string, unknown>): Generated {
  return { stem, answer: { kind: 'exact', value: X(answer), ...DEC, unit }, options, solution, trap, tags, params, typedAllowed: true };
}

/** Square root when it is a short decimal, else null (so irrational "mistakes" never become options). */
const rootOrNull = (x: number): number | null => {
  if (x < 0) return null;
  const r = Math.sqrt(x);
  const rr = Number(r.toFixed(6));
  return Math.abs(r - rr) < 1e-9 && Math.abs(rr * rr - x) < 1e-6 ? rr : null;
};

function pickVariant(rng: RNG, fns: ((rng: RNG) => Generated | null)[]): Generated | null {
  const f = rng.pick(fns);
  for (let i = 0; i < 40; i++) {
    const g = f(rng);
    if (g) return g;
  }
  return null;
}

/** Heights that fall in a whole number of seconds: 5t². */
const DROP_HEIGHTS = [5, 20, 45, 80, 125, 180, 245, 320];
const DROPPED = [
  'A stone is dropped from rest from the top of a cliff', 'A ball is dropped from rest from a bridge',
  'A coin is dropped from rest from a balcony', 'A stone is released from rest from a hovering helicopter',
  'A spanner is dropped from rest from some scaffolding', 'A brick is dropped from rest from the top of a tower',
  'A pebble is dropped from rest down a well', 'A parcel is released from rest from a hovering drone',
];

// ------------------------------------------------------------------------------------------ level 1

function dropTime(rng: RNG): Generated | null {
  const h = rng.pick(DROP_HEIGHTS);
  const t = Math.sqrt((2 * h) / G);
  const stem = `${rng.pick(DROPPED)} ${q(h, U.s)} above the ground. ${G_NOTE} How long does it take to reach the ground?`;
  return finish(stem, t, U.t, physOptions(rng, t, U.t, [
    { value: (2 * h) / G, trap: 'forgot the square root: 2h/g is t², not t' },
    { value: h / G, trap: 'used s = gt (no ½, no square)' },
  ], [
    { value: rootOrNull(h / G), trap: 'forgot the 2: h = ½gt² gives t² = 2h/g' },
    { value: rootOrNull(h / (2 * G)), trap: 'divided by 2 instead of multiplying: t² = 2h/g, not h/(2g)' },
    { value: 2 * t, trap: 'doubled the time (that would be the flight time of a ball thrown up and caught)' },
    { value: h / 20, trap: 'used h = 20t' },
    { value: t / G, trap: 'divided by g after taking the root as well' },
  ]),
  `$h = \\tfrac{1}{2}gt^2$, so $t^2 = \\frac{2h}{g} = \\frac{${2 * h}}{10} = ${t * t}$ and $t = ${t}$ s.`,
  'From rest, h = ½gt² so t = √(2h/g): keep the 2 and finish with the square root.',
  ['projectiles', 'free fall', 'time'], { ask: 'drop-time', h });
}

function dropSpeed(rng: RNG): Generated | null {
  const h = rng.pick(DROP_HEIGHTS);
  const t = Math.sqrt((2 * h) / G);
  const v = G * t;
  const stem = `${rng.pick(DROPPED)} ${q(h, U.s)} above the ground. ${G_NOTE} Find its speed just before it hits the ground.`;
  return finish(stem, v, U.v, physOptions(rng, v, U.v, [
    { value: h / t, trap: 'found the average speed h/t, not the final speed (which is twice that)' },
    { value: rng.bool(0.4) ? 9.8 * t : null, trap: 'used g = 9.8 m s⁻² instead of the stated 10 m s⁻²' },
  ], [
    { value: 2 * G * h, trap: 'forgot the square root in v² = 2gh' },
    { value: G * t * t, trap: 'used gt² instead of gt' },
    { value: h, trap: 'quoted the height as the speed' },
    { value: rootOrNull(G * h), trap: 'forgot the 2 in v² = 2gh' },
    { value: t, trap: 'quoted the time of fall instead of the speed' },
    { value: G * t * 2, trap: 'doubled: v = gt already uses the whole fall' },
  ]),
  `Either $v^2 = 2gh = 2 \\times 10 \\times ${h} = ${2 * G * h}$, so $v = ${v}$ m s$^{-1}$; or fall time $t = \\sqrt{2h/g} = ${t}$ s and $v = gt = ${v}$ m s$^{-1}$.`,
  'The landing speed is gt (or √(2gh)); h/t is the average speed, which is only half of it.',
  ['projectiles', 'free fall', 'speed'], { ask: 'drop-speed', h });
}

/** Level 1, third shape: the first t seconds of a free fall (speed gt, or distance ½gt²). */
function dropAfterT(rng: RNG): Generated | null {
  const t = rng.pick([1, 2, 3, 4, 5, 6]);
  const v = G * t;
  const h = 0.5 * G * t * t;
  const who = rng.pick(['A stone', 'A ball', 'A coin', 'A spanner', 'A brick', 'A pebble', 'A parcel', 'A marble']);
  const where = rng.pick(['a tall building', 'a high cliff', 'a tall tower', 'a hovering helicopter']);
  const askSpeed = rng.bool(0.5);
  if (askSpeed) {
    const stem = `${who} is dropped from rest from ${where}. ${G_NOTE} Find its speed after ${q(t, U.t)}.`;
    return finish(stem, v, U.v, physOptions(rng, v, U.v, [
      { value: h, trap: 'found the distance fallen ½gt² instead of the speed' },
      { value: G * t * t, trap: 'used gt² instead of gt' },
    ], [
      { value: 0.5 * G * t, trap: 'slipped a ½ into v = gt (the ½ belongs to the distance)' },
      { value: G, trap: 'quoted g: the speed after t seconds is gt' },
      { value: t / G, trap: 'divided by g instead of multiplying' },
      { value: G / t, trap: 'divided g by the time' },
      { value: rng.bool(0.4) ? 9.8 * t : null, trap: 'used g = 9.8 m s⁻² instead of the stated 10 m s⁻²' },
      { value: G * t + G, trap: 'added an extra second of falling' },
    ]),
    `From rest, $v = gt = 10 \\times ${t} = ${v}$ m s$^{-1}$.`,
    'From rest the speed after t seconds is gt; ½gt² is the distance fallen.',
    ['projectiles', 'free fall', 'speed'], { ask: 'drop-after-v', t });
  }
  const stem = `${who} is dropped from rest from ${where}. ${G_NOTE} How far does it fall in the first ${q(t, U.t)}?`;
  return finish(stem, h, U.s, physOptions(rng, h, U.s, [
    { value: G * t * t, trap: 'forgot the ½ in ½gt²' },
    { value: G * t, trap: 'found the speed gt instead of the distance' },
  ], [
    { value: 0.5 * G * t, trap: 'forgot to square the time' },
    { value: t * t, trap: 'forgot g as well as the ½' },
    { value: 0.5 * 9.8 * t * t, trap: 'used g = 9.8 m s⁻² instead of the stated 10 m s⁻²' },
    { value: 0.5 * G * t * t * t, trap: 'cubed the time' },
    { value: 0.25 * G * t * t, trap: 'halved twice' },
  ]),
  `$s = \\tfrac{1}{2}gt^2 = \\tfrac{1}{2} \\times 10 \\times ${t}^2 = ${num(h)}$ m.`,
  'From rest the distance fallen is ½gt²: keep the ½ and square the time.',
  ['projectiles', 'free fall', 'distance'], { ask: 'drop-after-s', t });
}

// ------------------------------------------------------------------------------------------ level 2

const THROWN_UP = [
  'A ball is thrown vertically upwards', 'A stone is projected vertically upwards', 'A tennis ball is hit vertically upwards',
  'A coin is flicked vertically upwards', 'A firework is launched vertically upwards', 'A cricket ball is hit vertically upwards',
];

function upHeight(rng: RNG): Generated | null {
  const u = rng.pick([5, 10, 12, 15, 20, 25, 30, 35, 40, 45, 50]);
  const H = (u * u) / (2 * G);
  const stem = `${rng.pick(THROWN_UP)} with speed ${q(u, U.v)}. ${G_NOTE} Find the maximum height it reaches above the point of projection.`;
  return finish(stem, H, U.s, physOptions(rng, H, U.s, [
    { value: (u * u) / G, trap: 'forgot the 2 in v² = u² − 2gh (used h = u²/g)' },
    { value: u / G, trap: 'used u instead of u²: u/g is the time to the top, not the height' },
  ], [
    { value: (u * u) / (4 * G), trap: 'used the average speed u/2 and the time to the top, then halved again' },
    { value: u * u, trap: 'forgot to divide by 2g altogether' },
    { value: (u * u) / (2 * G * G), trap: 'divided by g twice' },
    { value: (2 * u * u) / G, trap: 'used ½gt² with the whole flight time 2u/g instead of the time to the top' },
  ]),
  `At the top $v = 0$: $0 = u^2 - 2gH$, so $H = \\frac{u^2}{2g} = \\frac{${u * u}}{20} = ${num(H)}$ m.`,
  'Maximum height is u²/(2g): square the speed and keep the 2 (average speed u/2 × time u/g).',
  ['projectiles', 'vertical', 'max height'], { ask: 'up-height', u });
}

function upTime(rng: RNG): Generated | null {
  const u = rng.pick([5, 10, 12, 15, 20, 25, 30, 35, 40, 45, 50]);
  const total = rng.bool(0.35);
  const tTop = u / G;
  if (total) {
    const T = 2 * tTop;
    const stem = `${rng.pick(THROWN_UP)} with speed ${q(u, U.v)} and caught again at the same height. ${G_NOTE} For how long is it in the air?`;
    return finish(stem, T, U.t, physOptions(rng, T, U.t, [
      { value: tTop, trap: 'found only the time to the top: the flight is symmetric, so double it' },
      { value: (u * u) / (2 * G), trap: 'found the maximum height instead of the time' },
    ], [
      { value: 4 * tTop, trap: 'doubled twice' },
      { value: u / 20, trap: 'used u/(2g)' },
      { value: (u * u) / G, trap: 'used u²/g' },
      { value: u / (G * G), trap: 'divided by g twice' },
      { value: (u * u) / (2 * G * G), trap: 'found u²/2g and divided by g again' },
    ]),
    `Time to the top is $\\frac{u}{g} = \\frac{${u}}{10} = ${num(tTop)}$ s; by symmetry the total time is $2 \\times ${num(tTop)} = ${num(T)}$ s.`,
    'Up-and-down flight time is 2u/g: the trip up takes u/g and the trip down takes the same again.',
    ['projectiles', 'vertical', 'time of flight'], { ask: 'up-total-time', u });
  }
  const stem = `${rng.pick(THROWN_UP)} with speed ${q(u, U.v)}. ${G_NOTE} How long does it take to reach its highest point?`;
  return finish(stem, tTop, U.t, physOptions(rng, tTop, U.t, [
    { value: 2 * tTop, trap: 'found the total time of flight 2u/g, not the time to the top' },
    { value: (u * u) / (2 * G), trap: 'found the maximum height u²/2g instead of the time' },
  ], [
    { value: u / 20, trap: 'used u/(2g)' },
    { value: (u * u) / G, trap: 'used u²/g' },
    { value: u / (G * G), trap: 'divided by g twice' },
    { value: G / u, trap: 'inverted: divided g by the speed' },
    { value: u, trap: 'quoted the speed of projection as the time' },
    { value: rng.bool(0.4) ? u / 9.8 : null, trap: 'used g = 9.8 instead of the stated 10' },
  ]),
  `At the top $v = 0$, so $0 = u - gt$ and $t = \\frac{u}{g} = \\frac{${u}}{10} = ${num(tTop)}$ s.`,
  'Time to the top is u/g (v = 0 there); 2u/g is the whole flight back to the launch height.',
  ['projectiles', 'vertical', 'time'], { ask: 'up-time-top', u });
}

// ------------------------------------------------------------------------------------------ level 3

function horizontalLaunch(rng: RNG): Generated | null {
  const h = rng.pick([20, 45, 80, 125]);
  const t = Math.sqrt((2 * h) / G);
  const ux = rng.pick([5, 8, 10, 12, 15, 20, 25, 30]);
  const R = ux * t;
  const who = rng.pick(['A ball is thrown horizontally', 'A stone is projected horizontally', 'A ball is kicked horizontally', 'A package is released from a plane flying horizontally']);
  const plane = who.includes('plane');
  const tower = !plane && rng.bool(0.4);
  const cliff = plane ? `a height of ${q(h, U.s)}` : tower ? `the top of a tower ${q(h, U.s)} high` : `the top of a cliff ${q(h, U.s)} high`;
  const speedPhrase = plane ? `at a steady speed of ${q(ux, U.v)} at` : `at ${q(ux, U.v)} from`;
  const where = plane ? 'the point directly below the release point' : tower ? 'the foot of the tower' : 'the foot of the cliff';
  if (rng.bool(0.25)) {
    const stem = `${who} ${speedPhrase} ${cliff}. ${G_NOTE} How long does it take to reach the ground?`;
    return finish(stem, t, U.t, physOptions(rng, t, U.t, [
      { value: h / ux, trap: 'used the horizontal speed for the vertical fall: the horizontal motion does not affect the fall time' },
      { value: (2 * h) / G, trap: 'forgot the square root in t² = 2h/g' },
    ], [
      { value: h / G, trap: 'used h = gt' },
      { value: rootOrNull(h / G), trap: 'forgot the 2 in t² = 2h/g' },
      { value: rootOrNull(h / (2 * G)), trap: 'divided by 2 instead of multiplying: t² = 2h/g, not h/(2g)' },
      { value: 2 * t, trap: 'doubled the fall time' },
      { value: t / G, trap: 'divided by g after taking the root as well' },
    ]),
    `Vertically the motion is a free fall from rest: $h = \\tfrac{1}{2}gt^2$, so $t = \\sqrt{\\frac{2 \\times ${h}}{10}} = \\sqrt{${t * t}} = ${t}$ s. The horizontal speed is irrelevant.`,
    'Horizontal and vertical motions are independent: the fall time comes from h = ½gt² alone.',
    ['projectiles', 'horizontal launch', 'time'], { ask: 'horiz-time', h, ux });
  }
  const stem = `${who} ${speedPhrase} ${cliff}. ${G_NOTE} How far from ${where} does it land?`;
  return finish(stem, R, U.s, physOptions(rng, R, U.s, [
    { value: (ux * 2 * h) / G, trap: 'forgot the square root when finding the fall time (used t = 2h/g)' },
    { value: (ux * h) / G, trap: 'used t = h/g for the fall time' },
  ], [
    { value: (ux * t) / 2, trap: 'halved the range (put a ½ into the horizontal motion)' },
    { value: 2 * ux * t, trap: 'used twice the fall time (as if the ball went up first)' },
    { value: G * t, trap: 'multiplied the fall time by g instead of by the horizontal speed' },
    { value: rootOrNull(ux * ux + G * G * t * t), trap: 'found the landing speed instead of the distance' },
  ]),
  `Vertically: $h = \\tfrac{1}{2}gt^2$ gives $t = \\sqrt{2 \\times ${h}/10} = ${t}$ s. Horizontally the speed stays $${ux}$ m s$^{-1}$, so the range is $${ux} \\times ${t} = ${R}$ m.`,
  'Find the fall time from the vertical motion (h = ½gt²), then range = horizontal speed × that time.',
  ['projectiles', 'horizontal launch', 'range'], { ask: 'horiz-range', h, ux });
}

// ------------------------------------------------------------------------------------------ level 4

function components(rng: RNG): Generated | null {
  const ask = rng.pick(['time', 'range', 'height'] as const);
  // For the time of flight, u_y and u_x are multiples of 10 and 5: otherwise 2u_y/g is the only whole
  // number in the list (u_y/g and 2u_x/g are halves) and the answer can be spotted by its form alone.
  const uy = rng.pick(ask === 'height' ? [10, 20, 30, 40] : ask === 'time' ? [10, 20, 30, 40] : [10, 15, 20, 25, 30, 40]);
  const ux = rng.pick(ask === 'time' ? [5, 10, 15, 20, 25, 30] : [5, 8, 10, 12, 15, 20, 25, 30]);
  const T = (2 * uy) / G;
  const R = ux * T;
  const H = (uy * uy) / (2 * G);
  const triple = (ux === 20 && uy === 15) || (ux === 15 && uy === 20) || (ux === 30 && uy === 40) || (ux === 40 && uy === 30);
  const useAngle = triple && rng.bool(0.6);
  const speed = Math.sqrt(ux * ux + uy * uy);
  const intro = useAngle
    ? `A ball is projected from level ground with speed ${q(speed, U.v)} at an angle $\\theta$ above the horizontal, where $\\sin\\theta = ${frac(uy, speed).toLatex()}$.`
    : `A ball is projected from level ground with a horizontal velocity component of ${q(ux, U.v)} and a vertical velocity component of ${q(uy, U.v)}.`;
  const compNote = useAngle ? `Components: $u_x = ${num(speed)} \\times ${frac(ux, speed).toLatex()} = ${ux}$, $u_y = ${num(speed)} \\times ${frac(uy, speed).toLatex()} = ${uy}$ m s$^{-1}$. ` : '';
  const params = { ask: `comp-${ask}`, ux, uy };
  if (ask === 'time') {
    return finish(`${intro} ${G_NOTE} Find the time of flight.`, T, U.t, physOptions(rng, T, U.t, [
      { value: uy / G, trap: 'found only the time to the top (u_y/g): the flight time is twice that' },
      { value: (2 * ux) / G, trap: 'used the horizontal component: time of flight depends on the vertical component' },
    ], [
      { value: (2 * speed) / G, trap: 'used the full speed instead of the vertical component' },
      { value: uy / 20, trap: 'used u_y/(2g)' },
      { value: (uy * uy) / (2 * G), trap: 'found the maximum height instead of the time' },
      { value: (4 * uy) / G, trap: 'doubled the flight time again' },
      { value: (2 * uy) / (G * G), trap: 'divided by g twice' },
    ]),
    `${compNote}Vertically: $0 = u_y t - \\tfrac{1}{2}gt^2$, so $T = \\frac{2u_y}{g} = \\frac{2 \\times ${uy}}{10} = ${num(T)}$ s.`,
    'Time of flight is 2u_y/g: only the vertical component matters, and u_y/g is just the time to the top.',
    ['projectiles', 'components', 'time of flight'], params);
  }
  if (ask === 'range') {
    return finish(`${intro} ${G_NOTE} Find the horizontal distance travelled before it lands.`, R, U.s, physOptions(rng, R, U.s, [
      { value: (ux * uy) / G, trap: 'used the time to the top (u_y/g) instead of the whole flight time' },
      { value: uy * T, trap: 'multiplied the flight time by the vertical component instead of the horizontal one' },
    ], [
      { value: 0.5 * ux * T, trap: 'put a ½ into the horizontal motion (there is no acceleration horizontally)' },
      { value: speed * T, trap: 'multiplied the flight time by the full speed' },
      { value: (ux * ux) / G, trap: 'used u_x²/g' },
      { value: (uy * uy) / (2 * G), trap: 'found the maximum height instead of the range' },
      { value: 2 * ux * T, trap: 'doubled the flight time, which is already the whole flight' },
      { value: ux * T + uy * T, trap: 'added the two components before multiplying by the time' },
    ]),
    `${compNote}Time of flight $T = \\frac{2u_y}{g} = ${num(T)}$ s; horizontally there is no acceleration, so range $= u_x T = ${ux} \\times ${num(T)} = ${num(R)}$ m.`,
    'Range = horizontal component × total flight time (2u_y/g); the half-time gives only half the range.',
    ['projectiles', 'components', 'range'], params);
  }
  return finish(`${intro} ${G_NOTE} Find the maximum height reached.`, H, U.s, physOptions(rng, H, U.s, [
    { value: (uy * uy) / G, trap: 'forgot the 2 in v² = u² − 2gh' },
    { value: 0.5 * G * T * T, trap: 'used the total flight time in ½gt²: only half the flight is spent rising' },
    { value: (ux * ux) / (2 * G), trap: 'used the horizontal component instead of the vertical one' },
  ], [
    { value: (speed * speed) / (2 * G), trap: 'used the full speed instead of the vertical component' },
    { value: uy * (uy / G), trap: 'multiplied u_y by the time to the top without averaging (u_y/2)' },
    { value: (uy * uy) / (4 * G), trap: 'an extra ½ crept in' },
    { value: (uy * uy) / (2 * G * G), trap: 'divided by g twice' },
  ]),
  `${compNote}At the top the vertical velocity is zero: $0 = u_y^2 - 2gH$, so $H = \\frac{u_y^2}{2g} = \\frac{${uy * uy}}{20} = ${num(H)}$ m.`,
  'Maximum height uses the vertical component only: H = u_y²/(2g); with ½gt² you must use the time to the top, not the whole flight.',
  ['projectiles', 'components', 'max height'], params);
}

// ------------------------------------------------------------------------------------------ level 5

/** (u, h) pairs with u² − 20h a positive perfect square: speed v = √(u² − 2gh) at height h. */
const SPEED_AT_HEIGHT: { u: number; h: number; v: number }[] = [];
for (const u of [15, 20, 22, 24, 25, 26, 28, 30, 32, 34, 35, 36, 38, 40, 42, 44, 45, 46, 48, 50]) {
  for (let h = 5; h < (u * u) / 20; h++) {
    const v2 = u * u - 20 * h;
    const v = Math.sqrt(v2);
    // u/2 ≤ v ≤ 20: the cap keeps every option in a plausible band ("forgot the square root" is then at
    // most 20 times the answer), and v ≥ u/2 makes u − v, the loss in speed, land *below* the answer, so
    // the correct option is not the smallest one in every single question.
    if (Number.isInteger(v) && v > 0 && v <= 20 && 2 * v >= u) SPEED_AT_HEIGHT.push({ u, h, v });
  }
}

/** (u, h) for a ball thrown up at u from a cliff of height h with u² + 20h a perfect square (factorisable quadratic). */
const CLIFF: { u: number; h: number; T: number; v: number }[] = [];
for (const u of [5, 10, 15, 20, 25, 30, 40]) {
  for (let h = 5; h <= 120; h += 5) {
    const disc = u * u + 20 * h;
    const r = Math.sqrt(disc);
    if (!Number.isInteger(r)) continue;
    const T = (u + r) / 10;
    if (Number.isInteger(T * 2) && T <= 10) CLIFF.push({ u, h, T, v: r });
  }
}

function speedAtHeight(rng: RNG): Generated | null {
  const { u, h, v } = rng.pick(SPEED_AT_HEIGHT);
  const r2gh = rootOrNull(2 * G * h);
  const stem = `${rng.pick(THROWN_UP)} with speed ${q(u, U.v)}. ${G_NOTE} Find its speed when it is ${q(h, U.s)} above the point of projection.`;
  return finish(stem, v, U.v, physOptions(rng, v, U.v, [
    { value: u * u - 2 * G * h, trap: 'forgot the square root: u² − 2gh is v², not v' },
    { value: (u * u - 2 * G * h) / u, trap: 'divided v² by u instead of taking the square root' },
  ], [
    { value: rootOrNull(u * u - G * h), trap: 'forgot the 2 in v² = u² − 2gh' },
    { value: rootOrNull(u * u + 2 * G * h), trap: 'sign error: the ball is rising against gravity, so v² = u² − 2gh' },
    { value: r2gh === null ? null : u - r2gh, trap: 'subtracted speeds instead of squares of speeds' },
    { value: u - (G * h) / u, trap: 'used t = h/u (as if the speed were constant) and then v = u − gt' },
    { value: u - G, trap: 'subtracted g once, as if h were a time' },
    { value: u, trap: 'assumed the speed is unchanged' },
    { value: u - v, trap: 'quoted the loss in speed rather than the speed' },
    { value: (u + v) / 2, trap: 'averaged the speed at the start and at that height' },
    { value: u / 2, trap: 'halved the speed of projection' },
  ]),
  `$v^2 = u^2 - 2gh = ${u * u} - 2 \\times 10 \\times ${h} = ${v * v}$, so $v = ${v}$ m s$^{-1}$ (the same by energy: $\\tfrac{1}{2}v^2 = \\tfrac{1}{2}u^2 - gh$).`,
  'Use v² = u² − 2gh (energy per unit mass): subtract 2gh from u², then square-root.',
  ['projectiles', 'vertical', 'energy'], { ask: 'speed-at-height', u, h });
}

function launchSpeed(rng: RNG): Generated | null {
  const H = rng.pick([5, 20, 45, 80, 125, 180, 245, 320]);
  const u = Math.sqrt(2 * G * H);
  const who = rng.pick(['A ball is to be thrown vertically upwards so that it just reaches a height of', 'A firework is launched vertically and reaches a maximum height of', 'A stone is thrown vertically upwards and rises to a maximum height of']);
  const stem = `${who} ${q(H, U.s)} above the point of projection. ${G_NOTE} Find the speed of projection.`;
  return finish(stem, u, U.v, physOptions(rng, u, U.v, [
    { value: 2 * G * H, trap: 'forgot the square root: 2gH is u², not u' },
    { value: rootOrNull((2 * H) / G), trap: 'found the time to the top √(2H/g) instead of the speed' },
  ], [
    { value: rootOrNull(G * H), trap: 'forgot the 2 in u² = 2gH' },
    { value: rootOrNull((2 * H) / G) === null ? null : 2 * rootOrNull((2 * H) / G)!, trap: 'found the total time of flight instead of the speed' },
    { value: rootOrNull((2 * H) / G) === null ? null : H / rootOrNull((2 * H) / G)!, trap: 'used the average speed H/t, which is only half the speed of projection' },
    { value: H, trap: 'quoted the height as the speed' },
    { value: G * H, trap: 'used u = gH' },
  ]),
  `At the top $v = 0$: $0 = u^2 - 2gH$, so $u^2 = 2 \\times 10 \\times ${H} = ${2 * G * H}$ and $u = ${u}$ m s$^{-1}$.`,
  'Launch speed for height H is √(2gH): the same equation as max height, rearranged; keep the 2 and take the root.',
  ['projectiles', 'vertical', 'launch speed'], { ask: 'launch-speed', H });
}

function cliffThrow(rng: RNG): Generated | null {
  const { u, h, T, v } = rng.pick(CLIFF);
  const askSpeed = rng.bool(0.35);
  const fallRest = rootOrNull((2 * h) / G);
  const intro = `A ball is thrown vertically upwards with speed ${q(u, U.v)} from the edge of a cliff, ${q(h, U.s)} above the sea. ${G_NOTE}`;
  if (askSpeed) {
    return finish(`${intro} Find the speed of the ball when it hits the sea.`, v, U.v, physOptions(rng, v, U.v, [
      { value: u * u + 2 * G * h, trap: 'forgot the square root: u² + 2gh is v², not v' },
      { value: u + G * T, trap: 'sign error: the ball is thrown up but lands moving down, so v = gT − u' },
    ], [
      { value: rootOrNull(2 * G * h), trap: 'ignored the throw speed (as if dropped from rest)' },
      { value: fallRest === null ? null : u + G * fallRest, trap: 'added speeds instead of squares of speeds' },
      { value: rootOrNull(u * u - 2 * G * h), trap: 'sign error: the sea is below the start, so v² = u² + 2gh' },
      { value: u, trap: 'assumed it lands at the speed it was thrown (true only back at the launch height)' },
      { value: v - u, trap: 'quoted the gain in speed rather than the landing speed' },
      { value: (u + v) / 2, trap: 'averaged the launch speed and the landing speed' },
      { value: G * T, trap: 'used v = gT, as if it were dropped from rest at the cliff edge' },
    ]),
    `Taking downwards as positive over the whole flight: $v^2 = u^2 + 2gh = ${u * u} + 2 \\times 10 \\times ${h} = ${v * v}$, so $v = ${v}$ m s$^{-1}$ (the direction of the throw does not matter for the speed).`,
    'By energy (or v² = u² + 2gh with the displacement h below the start) the landing speed is √(u² + 2gh); the throw direction only affects the time.',
    ['projectiles', 'vertical', 'cliff', 'energy'], { ask: 'cliff-speed', u, h });
  }
  const upTime = (2 * u) / G;
  return finish(`${intro} How long after being thrown does the ball hit the sea?`, T, U.t, physOptions(rng, T, U.t, [
    { value: upTime, trap: 'found only the time back to the launch height (2u/g), ignoring the drop to the sea' },
    { value: (v - u) / G, trap: 'took the wrong root of the quadratic (its magnitude)' },
  ], [
    { value: fallRest === null ? null : upTime + fallRest, trap: 'added the fall time from rest: the ball passes the cliff edge moving at u, not from rest' },
    { value: fallRest, trap: 'ignored the throw: treated it as dropped from rest' },
    { value: 2 * T, trap: 'forgot the 2a in the quadratic formula denominator' },
    { value: u / G + (fallRest ?? 0), trap: 'time to the top plus a fall from rest through h' },
    { value: (u + v) / G + upTime, trap: 'added the time back to the launch height to the whole flight time' },
    { value: (2 * v) / G, trap: 'added the two roots of the quadratic instead of taking the positive one' },
  ]),
  `Upwards positive, displacement $-${h}$ m: $-${h} = ${u}t - 5t^2$, i.e. $${poly([1, -u / 5, -h / 5], 't')} = 0$, so $(t - ${num(T)})(t + ${num((v - u) / 10)}) = 0$ and $t = ${num(T)}$ s.`,
  'Set up s = ut − ½gt² with s = −h (below the start) and solve the quadratic; take the positive root, and remember 2u/g is only the return to the launch height.',
  ['projectiles', 'vertical', 'cliff', 'quadratic'], { ask: 'cliff-time', u, h });
}

function topSpeed(rng: RNG): Generated | null {
  const [ux, uy, speed] = rng.pick([[20, 15, 25], [15, 20, 25], [40, 30, 50], [30, 40, 50], [24, 10, 26], [12, 5, 13]]);
  const sinTheta = frac(uy, speed).toLatex();
  const stem = `A ball is projected with speed ${q(speed, U.v)} at an angle $\\theta$ above the horizontal, where $\\sin\\theta = ${sinTheta}$. ${G_NOTE} Find the speed of the ball at the highest point of its path.`;
  return finish(stem, ux, U.v, physOptions(rng, ux, U.v, [
    { value: 0, trap: 'the vertical velocity is zero at the top, but the horizontal component is unchanged' },
    { value: uy, trap: 'quoted the vertical component instead of the horizontal one' },
  ], [
    { value: speed, trap: 'assumed the speed is unchanged' },
    { value: ux + uy, trap: 'added the two components instead of resolving' },
    { value: (uy * uy) / (2 * G), trap: 'found the maximum height instead of the speed' },
    { value: (2 * uy) / G, trap: 'found the time of flight instead of the speed' },
  ]),
  `$\\cos\\theta = ${frac(ux, speed).toLatex()}$, so the horizontal component is $${num(speed)} \\times ${frac(ux, speed).toLatex()} = ${ux}$ m s$^{-1}$. At the top the vertical component is zero and the horizontal component is unchanged, so the speed is $${ux}$ m s$^{-1}$.`,
  'At the top only the vertical component is zero; the horizontal component (u cos θ) is untouched, so the speed is not zero.',
  ['projectiles', 'components', 'highest point'], { ask: 'top-speed', ux, uy });
}

// ------------------------------------------------------------------------------------------ verification helpers

/** Smallest positive root of a + bt + ct² = 0 by bisection (independent of the closed form). */
function bisectRoot(f: (t: number) => number, lo: number, hi: number): number {
  let a = lo, b = hi;
  for (let i = 0; i < 200; i++) {
    const m = (a + b) / 2;
    if (f(a) * f(m) <= 0) b = m; else a = m;
  }
  return (a + b) / 2;
}

/** First positive time at which y(t) crosses zero (y(0+) > 0 assumed). */
function landingTime(y: (t: number) => number): number {
  let t = 1e-6;
  const step = 1e-3;
  while (y(t) > 0 && t < 1e3) t += step;
  return bisectRoot(y, t - step, t);
}

export default defineTemplate({
  id: 'phy.kinematics.projectiles',
  module: 'PHY',
  topic: 'kinematics',
  title: 'Projectiles with g = 10',
  levels: {
    1: 'dropped from 5–320 m: time to fall or landing speed; the speed and the distance after t seconds',
    2: 'thrown vertically up at 10–50 m/s: max height u²/20, time to the top u/10, total time 2u/10',
    3: 'horizontal launch from a cliff: range = u_x × fall time (or the fall time)',
    4: 'given components (or speed with sin θ = 3/5): time of flight, range, maximum height',
    5: 'speed at a height (v² = u² − 2gh), launch speed for a height, ball thrown up from a cliff (quadratic), speed at the top of an angled flight',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      switch (level) {
        case 1: return pickVariant(rng, [dropTime, dropSpeed, dropAfterT]);
        case 2: return pickVariant(rng, [upHeight, upTime]);
        case 3: return pickVariant(rng, [horizontalLaunch]);
        case 4: return pickVariant(rng, [components]);
        default: return pickVariant(rng, [speedAtHeight, launchSpeed, cliffThrow, cliffThrow, topSpeed]);
      }
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const ans = q.answer.value.toNumber();
    const p = q.params as Record<string, number> & { ask: string };
    const close = (x: number, y: number, tol = 1e-7) => Math.abs(x - y) <= tol * Math.max(1, Math.abs(x), Math.abs(y));
    switch (p.ask) {
      case 'drop-time': { // generator: t = √(2h/g). Energy route: v = √(2gh), t = v/g.
        const v = Math.sqrt(2 * G * p.h);
        return close(ans, v / G);
      }
      case 'drop-speed': { // generator: v = gt (t from ½gt²). Numeric route: landing time by bisection, v = g t.
        const t = landingTime((t) => p.h - 0.5 * G * t * t);
        return close(ans, G * t);
      }
      case 'drop-after-v': { // generator: v = gt. Energy route: h = ½gt², v = √(2gh).
        const h = 0.5 * G * p.t * p.t;
        return close(ans, Math.sqrt(2 * G * h));
      }
      case 'drop-after-s': { // generator: ½gt². Route: average speed ½gt over t seconds.
        const v = G * p.t;
        return close(ans, 0.5 * v * p.t);
      }
      case 'up-height': { // generator: H = u²/2g. Kinematic route: t = u/g, H = ut − ½gt².
        const t = p.u / G;
        return close(ans, p.u * t - 0.5 * G * t * t);
      }
      case 'up-time-top': { // generator: t = u/g. Route: H = u²/2g, average speed u/2, t = H/(u/2).
        const H = (p.u * p.u) / (2 * G);
        return close(ans, H / (p.u / 2));
      }
      case 'up-total-time': { // generator: 2u/g. Numeric route: first positive zero of y = ut − ½gt².
        const T = landingTime((t) => p.u * t - 0.5 * G * t * t);
        return close(ans, T, 1e-6);
      }
      case 'horiz-time': {
        const t = landingTime((t) => p.h - 0.5 * G * t * t);
        return close(ans, t, 1e-6);
      }
      case 'horiz-range': {
        const t = landingTime((t) => p.h - 0.5 * G * t * t);
        return close(ans, p.ux * t, 1e-6);
      }
      case 'comp-time': {
        const T = landingTime((t) => p.uy * t - 0.5 * G * t * t);
        return close(ans, T, 1e-6);
      }
      case 'comp-range': {
        const T = landingTime((t) => p.uy * t - 0.5 * G * t * t);
        return close(ans, p.ux * T, 1e-6);
      }
      case 'comp-height': { // numeric maximum of y(t) on a fine grid
        const T = (2 * p.uy) / G;
        let best = 0;
        for (let i = 0; i <= 20000; i++) {
          const t = (T * i) / 20000;
          best = Math.max(best, p.uy * t - 0.5 * G * t * t);
        }
        return close(ans, best, 1e-6);
      }
      case 'speed-at-height': { // generator: energy. Kinematic route: t = smaller root of 5t² − ut + h = 0, v = u − gt.
        const disc = p.u * p.u - 4 * 5 * p.h;
        if (disc < 0) return false;
        const t = (p.u - Math.sqrt(disc)) / 10;
        return close(ans, p.u - G * t);
      }
      case 'launch-speed': { // generator: u = √(2gH). Kinematic route: t = √(2H/g), u = gt.
        const t = Math.sqrt((2 * p.H) / G);
        return close(ans, G * t);
      }
      case 'cliff-time': { // substitute back into y(t) = h + ut − ½gt² and check it is the landing (y crosses zero there)
        const y = p.h + p.u * ans - 0.5 * G * ans * ans;
        return ans > 0 && Math.abs(y) < 1e-6 && close(ans, landingTime((t) => p.h + p.u * t - 0.5 * G * t * t), 1e-6);
      }
      case 'cliff-speed': { // kinematic route: landing time numerically, v = |u − gT|
        const T = landingTime((t) => p.h + p.u * t - 0.5 * G * t * t);
        return close(ans, Math.abs(p.u - G * T), 1e-6);
      }
      case 'top-speed': { // energy route: v² = U² − 2gH with H = u_y²/2g
        const U2 = p.ux * p.ux + p.uy * p.uy;
        const H = (p.uy * p.uy) / (2 * G);
        return close(ans, Math.sqrt(U2 - 2 * G * H));
      }
      default:
        return false;
    }
  },
});
