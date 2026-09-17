import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, Exact } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import type { RNG } from '../../core/rng';

/**
 * Moments and equilibrium of a rigid beam (g = 10 m s^-2 wherever a mass is turned into a weight).
 * Level 1: moment = F × d; a see-saw balanced about its pivot (F1 d1 = F2 d2) → a force or a distance
 * Level 2: uniform beam on a pivot carrying one load → where the load sits, or how heavy it is
 * Level 3: beam on two supports (light, or uniform with its weight at the centre) → one reaction, by
 *          taking moments about the other support
 * Level 4: two loads on a uniform beam → a reaction; or how far along an overhanging plank a man can
 *          walk before it tips (the far support carries everything, the near reaction is zero)
 * Level 5: uniform beam hinged at a wall and held by a vertical cable → the tension (or the hinge force);
 *          a crane jib balanced about its pivot → the counterweight
 *
 * Every question is stored as a list of forces (position along the beam, signed magnitude, up positive),
 * so verify() can rebuild the whole system from the claimed answer and test *both* equilibrium equations:
 * the unknown reaction is found by taking moments about a point that no solution ever uses, and ΣF = 0 is
 * then a genuine, independent check of the answer.
 */

const U_N = '\\text{N}', U_M = '\\text{m}', U_KG = '\\text{kg}', U_NM = '\\text{N m}';
const G_NOTE = 'Take $g = 10\\ \\text{m s}^{-2}$.';

/** Plain number for a stem: 300, 1.5, 4.6. */
const n = (x: number): string => (Number.isInteger(x) ? `${x}` : `${Number(x.toPrecision(10))}`);
const isMult = (v: number, step: number): boolean => Math.abs(v / step - Math.round(v / step)) < 1e-9;
const round = (x: number): number => Number(x.toPrecision(12));

/**
 * The mechanical system behind a question.
 *  xs/fs   every force: position along the beam (m from A) and signed magnitude (N, up positive)
 *  askKind 'f' the unknown is the magnitude of forces[askIndex] (direction askSign, answer × aScale newtons)
 *          'x' the unknown is the position of forces[askIndex]
 *          'm' the answer is the magnitude of the moment of forces[askIndex] about `pivot` (the pivot
 *              the stem names; verify() checks that moment from the distances the stem prints, not
 *              from these metres, so the unit conversion is tested rather than repeated)
 *  freeIndex a reaction whose magnitude is not given and is not asked for (−1 if there is none)
 */
interface Sys {
  xs: number[];
  fs: number[];
  askIndex: number;
  askKind: 'f' | 'x' | 'm';
  askSign: number;
  aScale: number;
  freeIndex: number;
  pivot: number;
}

type Cand = { value: number | null; trap: string };

/** Positive, exam-sized, terminating distractors that pass the clean-number rule. */
function cleanOnly(ds: Cand[]): Distractor[] {
  const out: Distractor[] = [];
  for (const d of ds) {
    const v = d.value === null ? null : round(d.value);
    if (v === null || !Number.isFinite(v) || v <= 0 || v > 1e5 || v < 1e-3) continue;
    if (!isMult(v, 0.001)) continue;
    let ex: Exact;
    try { ex = E(Number(v.toFixed(3))); } catch { continue; }
    if (!isCleanExact(ex).ok) continue;
    out.push({ value: ex, trap: d.trap });
  }
  return out;
}

/**
 * Fill the four slots from both sides of the answer: a target number of options below it is drawn
 * first and each slot then comes from whichever side is still short, with the headline (`must`)
 * mistakes preferred *within the side that is needed*.
 *
 * Taking every `must` first is what pinned two of these variants. All three headline mistakes in
 * the tipping plank are shorter distances than the answer and two of the crane's are larger than
 * the counterweight, so consuming them up front fixed the answer's rank in every single question
 * ("the greatest distance is always one of the two largest numbers"). A must is now lost only in
 * the draws that deliberately ask for the other side.
 *
 * Options more than `spread` times away from the answer are dropped — a wildly wrong size gives
 * the answer away — and a draw that cannot fill four slots is rejected by `pack`, never padded.
 */
function ranked(rng: RNG, answer: Exact, must: Distractor[], extra: Distractor[], spread: number, count = 4): Distractor[] {
  const a = answer.toNumber();
  const near = (d: Distractor) => { const r = d.value.toNumber() / a; return r > 1 / spread - 1e-12 && r < spread + 1e-12; };
  const seen: Exact[] = [answer];
  const out: Distractor[] = [];
  const isBelow = (d: Distractor) => d.value.cmp(answer) < 0;
  const pools = [rng.shuffle(must.filter(near)), rng.shuffle(extra.filter(near))];
  const wantBelow = rng.int(0, count);
  const pull = (below: boolean): Distractor | null => {
    for (const pool of pools) {
      const i = pool.findIndex((d) => isBelow(d) === below && !seen.some((s) => s.equals(d.value)));
      if (i >= 0) return pool.splice(i, 1)[0];
    }
    return null;
  };
  while (out.length < count) {
    const needBelow = out.filter(isBelow).length < wantBelow;
    const d = pull(needBelow) ?? pull(!needBelow);
    if (!d) break;
    seen.push(d.value);
    out.push(d);
  }
  return out;
}

/** Pick a sub-variant first, then retry its parameters, so rejection rates do not skew the mix. */
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
  answer: number;
  unit: string;
  must: Cand[];
  extra: Cand[];
  solution: string;
  trap: string;
  tags: string[];
  sys: Sys;
  params: Record<string, unknown>;
  /** how many times bigger or smaller than the answer an option may be (default 30) */
  spread?: number;
}

function pack(rng: RNG, p: Pack): Generated | null {
  const a = round(p.answer);
  if (!(a > 0) || !Number.isFinite(a) || !isMult(a, 0.001)) return null;
  const value = E(Number(a.toFixed(3)));
  if (!isCleanExact(value).ok) return null;
  const ds = ranked(rng, value, cleanOnly(p.must), cleanOnly(p.extra), p.spread ?? 30);
  if (ds.length < 4) return null; // never pad: redraw instead
  return {
    stem: p.stem,
    answer: { kind: 'exact', value, format: 'decimal', unit: p.unit },
    options: buildOptions(rng, value, ds, { format: 'decimal', unit: p.unit }),
    solution: p.solution,
    trap: p.trap,
    tags: p.tags,
    params: { ...p.params, sys: p.sys },
    typedAllowed: true,
  };
}

// ----------------------------------------------------------------------------- level 1

const SEESAW_D = [0.5, 0.6, 0.8, 1, 1.2, 1.5, 1.6, 2, 2.4, 2.5, 3];

/** See-saw pivoted at its centre: find the missing weight/mass, or the missing distance. */
function seesaw(rng: RNG, ask: 'f' | 'x'): Generated | null {
  const kg = rng.bool(0.5);
  const unit = kg ? U_KG : U_N;
  const word = kg ? 'mass' : 'weight';
  const scale = kg ? 10 : 1;
  const d1 = rng.pick(SEESAW_D);
  const w1 = kg ? rng.pick([20, 24, 25, 30, 36, 40, 45, 50, 60]) : rng.pick([200, 240, 250, 300, 360, 400, 450, 500, 600]);
  let d2: number, w2: number;
  if (ask === 'f') {
    d2 = rng.pick(SEESAW_D.filter((v) => v !== d1));
    w2 = (w1 * d1) / d2;
    if (!isMult(w2, kg ? 0.5 : 5) || w2 < (kg ? 10 : 100) || w2 > (kg ? 90 : 900) || w2 === w1) return null;
  } else {
    w2 = kg ? rng.pick([20, 24, 25, 30, 36, 40, 45, 50, 60]) : rng.pick([200, 240, 250, 300, 360, 400, 450, 500, 600]);
    if (w2 === w1) return null;
    d2 = (w1 * d1) / w2;
    if (!isMult(d2, 0.1) || d2 < 0.3 || d2 > 3) return null;
  }
  const answer = ask === 'f' ? w2 : d2;
  const sys: Sys = {
    xs: [-d1, ask === 'x' ? 0 : d2, 0],
    fs: [-w1 * scale, ask === 'f' ? 0 : -w2 * scale, 0],
    askIndex: ask === 'f' ? 1 : 1,
    askKind: ask,
    askSign: -1,
    aScale: ask === 'f' ? scale : 1,
    freeIndex: 2,
    pivot: 0,
  };
  const known = `A child of ${word} $${n(w1)}\\ ${unit}$ sits $${n(d1)}\\ \\text{m}$ from the pivot.`;
  const stem = ask === 'f'
    ? `A see-saw is pivoted at its centre. ${known} A second child sits $${n(d2)}\\ \\text{m}$ from the pivot on the other side, and the see-saw balances.\n\nFind the ${word} of the second child.`
    : `A see-saw is pivoted at its centre. ${known} A second child of ${word} $${n(w2)}\\ ${unit}$ sits on the other side, and the see-saw balances.\n\nHow far from the pivot does the second child sit?`;
  const must: Cand[] = ask === 'f'
    ? [
        { value: (w1 * d2) / d1, trap: 'the ratio of the distances used upside down' },
        { value: w1, trap: 'assumed the two children must have the same weight' },
      ]
    : [
        { value: (d1 * w2) / w1, trap: 'the ratio of the weights used upside down' },
        { value: d1, trap: 'assumed the two children sit at equal distances' },
      ];
  const extra: Cand[] = ask === 'f'
    ? [
        { value: w1 * d1, trap: 'gave the moment (in N m) instead of the force' },
        { value: (w1 * d1) / (d1 + d2), trap: 'measured the second distance from the first child, not from the pivot' },
        { value: (w1 * (d1 + d2)) / d2, trap: 'used the whole length of the see-saw as the first lever arm' },
        { value: w1 / 2, trap: 'halved the first weight instead of using moments' },
        { value: 2 * w2, trap: 'doubled the balancing force' },
      ]
    : [
        { value: (w1 * d1) / (w1 + w2), trap: 'divided by the total weight instead of the second weight' },
        { value: (d1 * (w1 + w2)) / w2, trap: 'used the total weight on the first side' },
        { value: d2 / 2, trap: 'halved the distance' },
        { value: 2 * d2, trap: 'doubled the distance' },
        { value: d1 + d2, trap: 'measured from the first child instead of from the pivot' },
      ];
  return pack(rng, {
    stem,
    answer,
    unit: ask === 'f' ? unit : U_M,
    must,
    extra,
    solution: `Moments about the pivot${kg ? ' (the $g$s cancel, so the masses balance directly)' : ''}: $${n(w1)} \\times ${n(d1)} = ${ask === 'f' ? `${kg ? 'M' : 'W'} \\times ${n(d2)}` : `${n(w2)} \\times d`}$, so ${ask === 'f' ? `$${kg ? 'M' : 'W'} = ${n(w1 * d1)} / ${n(d2)} = ${n(answer)}\\ ${unit}$` : `$d = ${n(w1 * d1)} / ${n(w2)} = ${n(answer)}\\ \\text{m}$`}.`,
    trap: 'The moment is force × distance from the pivot: the heavier child sits closer, so the ratio of distances is the inverse of the ratio of weights.',
    tags: ['moments', 'equilibrium', 'see-saw'],
    sys,
    params: { variant: `seesaw-${ask}`, kg, d1, d2, w1, w2 },
  });
}

/** The moment of one of two balancing forces about the pivot (distances often in cm). */
function momentOfForce(rng: RNG): Generated | null {
  const cm = rng.bool(0.5);
  const pool = [0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.75, 0.8, 1, 1.2, 1.5, 2];
  const d1 = rng.pick(pool);
  const F1 = rng.pick([10, 12, 15, 20, 24, 25, 30, 40, 50, 60, 80, 100, 120, 150]);
  const M = F1 * d1;
  if (!isMult(M, 0.5) || M < 2 || M > 150) return null;
  const d2 = rng.pick(pool.filter((v) => v !== d1));
  const F2 = M / d2;
  if (!isMult(F2, 0.5) || F2 < 5 || F2 > 400 || F2 === F1) return null;
  const dist = (d: number) => (cm ? `$${n(d * 100)}\\ \\text{cm}$` : `$${n(d)}\\ \\text{m}$`);
  const stem = `A light rod rests on a pivot and is in equilibrium. A force of $${n(F1)}\\ \\text{N}$ acts vertically downwards at a point ${dist(d1)} from the pivot, and a force of $${n(F2)}\\ \\text{N}$ acts vertically downwards at a point ${dist(d2)} from the pivot on the other side.\n\nFind the moment of the $${n(F1)}\\ \\text{N}$ force about the pivot.`;
  return pack(rng, {
    stem,
    answer: M,
    unit: U_NM,
    must: [
      { value: cm ? F1 * d1 * 100 : F1 / d1, trap: cm ? 'left the distance in centimetres' : 'divided the force by the distance instead of multiplying' },
      { value: F1 * (d1 + d2), trap: 'used the distance between the two forces instead of the distance from the pivot' },
    ],
    extra: [
      { value: F1 + F2, trap: 'added the two forces' },
      { value: F1 * d2, trap: 'paired each force with the other force’s distance' },
      { value: 2 * M, trap: 'added the two moments instead of giving one of them' },
      { value: M / 2, trap: 'halved the moment' },
      { value: cm ? F2 * d2 * 100 : F1 * d1 * d2, trap: 'muddled the distances' },
    ],
    solution: `Moment $= F \\times$ perpendicular distance $= ${n(F1)} \\times ${n(d1)} = ${n(M)}\\ \\text{N m}$${cm ? ` (${n(d1 * 100)} cm $= ${n(d1)}$ m)` : ''}. The rod balances, so the other force gives the same moment the other way.`,
    trap: cm
      ? 'A moment is in N m, so the distance must be turned into metres before multiplying.'
      : 'A moment is force × perpendicular distance from the pivot, not force × the gap between the two forces.',
    spread: 150,
    tags: ['moments', 'equilibrium'],
    sys: { xs: [-d1, d2, 0], fs: [-F1, -F2, F1 + F2], askIndex: 0, askKind: 'm', askSign: -1, aScale: 1, freeIndex: 2, pivot: 0 },
    // `shown`/`distUnit` are the distances exactly as the stem prints them (cm when cm is true), so
    // verify() can redo the conversion this variant is really about instead of trusting metres.
    params: {
      variant: 'moment', cm, d1, d2, F1, F2,
      shown: [round(cm ? d1 * 100 : d1), round(cm ? d2 * 100 : d2)],
      distUnit: cm ? 'cm' : 'm',
      forces: [F1, F2],
    },
  });
}

// ----------------------------------------------------------------------------- level 2

/** Uniform beam on a pivot nearer A, with one load between A and the pivot. */
function beamOnPivot(rng: RNG, ask: 'f' | 'x'): Generated | null {
  const kg = rng.bool(0.4);
  const scale = kg ? 10 : 1;
  const unit = kg ? U_KG : U_N;
  const word = kg ? 'mass' : 'weight';
  const L = rng.pick([4, 5, 6, 8]);
  const half = L / 2;
  const p = rng.pick([1, 1.5, 2, 2.5, 3].filter((v) => v <= half - 0.5));
  const wb = kg ? rng.pick([10, 15, 20, 24, 30, 40, 50, 60]) : rng.pick([100, 150, 200, 240, 300, 400, 500, 600]);
  const arm = half - p;
  const dPool = [0.2, 0.25, 0.4, 0.5, 0.6, 0.75, 0.8, 1, 1.2, 1.5].filter((v) => p - v >= 0.2 && v >= arm / 3 && v <= 3 * arm);
  if (dPool.length === 0) return null;
  const dPivot = rng.pick(dPool);
  const wl = (wb * arm) / dPivot;
  if (!isMult(wl, kg ? 0.5 : 5) || wl < (kg ? 5 : 50) || wl > (kg ? 200 : 2000) || wl === wb) return null;
  const x = round(p - dPivot);
  const answer = ask === 'f' ? wl : x;
  const beam = `A uniform beam $AB$ of length $${n(L)}\\ \\text{m}$ and ${word} $${n(wb)}\\ ${unit}$ rests on a pivot $${n(p)}\\ \\text{m}$ from $A$.`;
  const stem = ask === 'f'
    ? `${beam} A load placed $${n(x)}\\ \\text{m}$ from $A$ holds the beam horizontal.\n\nFind the ${word} of the load.`
    : `${beam} A load of ${word} $${n(wl)}\\ ${unit}$ is placed on the beam so that it rests horizontally.\n\nHow far from $A$ is the load?`;
  const sys: Sys = {
    xs: [half, ask === 'x' ? 0 : x, p],
    fs: [-wb * scale, ask === 'f' ? 0 : -wl * scale, 0],
    askIndex: 1,
    askKind: ask,
    askSign: -1,
    aScale: ask === 'f' ? scale : 1,
    freeIndex: 2,
    pivot: p,
  };
  const must: Cand[] = ask === 'f'
    ? [
        { value: (wb * half) / dPivot, trap: 'took the beam’s weight to act at the centre measured from the pivot' },
        { value: (wb * (half - p)) / x, trap: 'measured the load’s distance from A instead of from the pivot' },
      ]
    : [
        { value: dPivot, trap: 'gave the distance from the pivot instead of from A' },
        { value: round(L - x), trap: 'measured the distance from B instead of from A' },
      ];
  const extra: Cand[] = ask === 'f'
    ? [
        { value: wb, trap: 'assumed the load equals the weight of the beam' },
        { value: (wb * p) / dPivot, trap: 'used the distance of the pivot from A as the beam’s lever arm' },
        { value: wb * (half - p), trap: 'gave the moment of the beam’s weight instead of the load' },
        { value: (wb * (half - p)) / (p + dPivot), trap: 'measured the load from the wrong side of the pivot' },
      ]
    : [
        { value: round(p + dPivot), trap: 'put the load on the far side of the pivot' },
        { value: round(half - dPivot), trap: 'measured from the centre of the beam' },
        { value: round(p - (wl * (half - p)) / wb), trap: 'the two weights used upside down in the moment equation' },
        { value: round(half - p), trap: 'gave the beam’s own lever arm instead of the load’s position' },
        { value: (wb * half) / wl, trap: 'forgot that the beam’s weight acts only (L/2 − p) from the pivot' },
        { value: round(p / 2), trap: 'halved the distance to the pivot' },
        { value: p, trap: 'placed the load at the pivot' },
      ];
  return pack(rng, {
    stem,
    answer,
    unit: ask === 'f' ? unit : U_M,
    must,
    extra,
    solution: `The beam’s weight acts at its centre, $${n(half)}\\ \\text{m}$ from $A$, i.e. $${n(half - p)}\\ \\text{m}$ from the pivot. Moments about the pivot${kg ? ' (the $g$s cancel, so the masses balance directly)' : ''}: $${n(wb)} \\times ${n(half - p)} = ${ask === 'f' ? `${kg ? 'M' : 'W'} \\times ${n(dPivot)}` : `${n(wl)} \\times d`}$, so ${ask === 'f' ? `$${kg ? 'M' : 'W'} = ${n(wl)}\\ ${unit}$` : `$d = ${n(dPivot)}\\ \\text{m}$ from the pivot, i.e. $${n(x)}\\ \\text{m}$ from $A$`}.`,
    trap: 'The beam’s own weight acts at its centre, and every lever arm is measured from the pivot — not from A.',
    tags: ['moments', 'equilibrium', 'uniform beam'],
    sys,
    params: { variant: `pivot-${ask}`, kg, L, p, wb, wl, x },
  });
}

// ----------------------------------------------------------------------------- level 3

/** Beam resting on supports at A and B; one load. Reaction at one support by moments about the other. */
function twoSupports(rng: RNG, uniform: boolean): Generated | null {
  const kg = uniform && rng.bool(0.5);
  const scale = kg ? 10 : 1;
  const L = rng.pick([4, 5, 6, 8, 10]);
  const mb = uniform ? (kg ? rng.pick([20, 30, 40, 50, 60]) : rng.pick([200, 300, 400, 500, 600])) : 0;
  const ml = kg ? rng.pick([10, 15, 20, 25, 30, 40, 50]) : rng.pick([100, 150, 200, 250, 300, 400, 500, 600]);
  const d = rng.pick([1, 1.5, 2, 2.5, 3, 4].filter((v) => v > 0.5 && v < L - 0.5));
  const Wb = mb * scale, W = ml * scale;
  const RB = (Wb * (L / 2) + W * d) / L;
  const RA = Wb + W - RB;
  if (RA < 20 || RB < 20 || !isMult(RA, 0.5) || !isMult(RB, 0.5)) return null;
  if (RA === RB) return null;
  const at = rng.bool() ? 'A' : 'B';
  const answer = at === 'A' ? RA : RB;
  const other = at === 'A' ? 'B' : 'A';
  const object = kg ? `a box of mass $${n(ml)}\\ \\text{kg}$` : `a load of weight $${n(ml)}\\ \\text{N}$`;
  const beam = uniform
    ? `A uniform plank $AB$ of length $${n(L)}\\ \\text{m}$ and ${kg ? `mass $${n(mb)}\\ \\text{kg}$` : `weight $${n(mb)}\\ \\text{N}$`} rests horizontally on supports at $A$ and $B$.`
    : `A light rod $AB$ of length $${n(L)}\\ \\text{m}$ rests horizontally on supports at $A$ and $B$.`;
  const stem = `${beam} ${object.charAt(0).toUpperCase()}${object.slice(1)} is placed $${n(d)}\\ \\text{m}$ from $A$.${kg ? ` ${G_NOTE}` : ''}\n\nFind the magnitude of the reaction at $${at}$.`;
  const sys: Sys = {
    xs: uniform ? [L / 2, d, at === 'A' ? 0 : L, at === 'A' ? L : 0] : [d, at === 'A' ? 0 : L, at === 'A' ? L : 0],
    fs: uniform ? [-Wb, -W, 0, 0] : [-W, 0, 0],
    askIndex: uniform ? 2 : 1,
    askKind: 'f',
    askSign: 1,
    aScale: 1,
    freeIndex: uniform ? 3 : 2,
    pivot: 0,
  };
  const far = at === 'A' ? L - d : d;
  return pack(rng, {
    stem,
    answer,
    unit: U_N,
    must: [
      { value: at === 'A' ? RB : RA, trap: 'the reaction at the other support: distances measured from the wrong end' },
      { value: (W * far) / L, trap: 'forgot the weight of the plank acting at its centre' },
      { value: (Wb + W) / 2, trap: 'split the total load equally between the supports' },
    ],
    extra: [
      { value: Wb + W, trap: 'gave the total load, not one reaction' },
      { value: (Wb * (L / 2) + W * (L - d)) / L, trap: 'measured the load’s distance from the wrong end' },
      { value: (W * far) / L + Wb, trap: 'added the whole weight of the plank to one reaction' },
      { value: W * far, trap: 'forgot to divide by the length of the beam' },
      { value: answer / 2, trap: 'halved the reaction' },
    ],
    solution: `Take moments about $${other}$, so its reaction has no moment: $R_${at} \\times ${n(L)} = ${uniform ? `${n(Wb)} \\times ${n(L / 2)} + ` : ''}${n(W)} \\times ${n(far)}$, giving $R_${at} = ${n(answer)}\\ \\text{N}$.`,
    trap: uniform
      ? 'Take moments about the support you are not asked about, and remember the plank’s own weight acts at its centre.'
      : 'Take moments about the support you are not asked about, and measure the load’s distance from that support.',
    tags: ['moments', 'reactions', 'supports'],
    sys,
    params: { variant: uniform ? 'supports-uniform' : 'supports-light', kg, L, d, Wb, W, at },
  });
}

// ----------------------------------------------------------------------------- level 4

/** Uniform beam on supports at A and B carrying two loads. */
function twoLoads(rng: RNG): Generated | null {
  const L = rng.pick([4, 5, 6, 8]);
  const Wb = rng.pick([100, 200, 300, 400, 500, 600]);
  const W1 = rng.pick([100, 150, 200, 250, 300, 400]);
  const W2 = rng.pick([100, 150, 200, 250, 300, 400]);
  const d1 = rng.pick([0.5, 1, 1.5, 2].filter((v) => v < L / 2));
  const d2 = rng.pick([2.5, 3, 3.5, 4, 4.5, 5, 6, 7].filter((v) => v > L / 2 && v < L));
  const RB = (Wb * (L / 2) + W1 * d1 + W2 * d2) / L;
  const RA = Wb + W1 + W2 - RB;
  if (RA < 50 || RB < 50 || !isMult(RA, 0.5) || !isMult(RB, 0.5) || RA === RB) return null;
  const at = rng.bool() ? 'A' : 'B';
  const answer = at === 'A' ? RA : RB;
  const other = at === 'A' ? 'B' : 'A';
  const a1 = at === 'A' ? L - d1 : d1;
  const a2 = at === 'A' ? L - d2 : d2;
  const stem = `A uniform beam $AB$ of length $${n(L)}\\ \\text{m}$ and weight $${n(Wb)}\\ \\text{N}$ rests horizontally on supports at $A$ and $B$. Loads of $${n(W1)}\\ \\text{N}$ and $${n(W2)}\\ \\text{N}$ are placed $${n(d1)}\\ \\text{m}$ and $${n(d2)}\\ \\text{m}$ from $A$.\n\nFind the magnitude of the reaction at $${at}$.`;
  return pack(rng, {
    stem,
    answer,
    unit: U_N,
    must: [
      { value: at === 'A' ? RB : RA, trap: 'the reaction at the other support: distances taken from the wrong end' },
      { value: (W1 * a1 + W2 * a2) / L, trap: 'forgot the beam’s own weight at its centre' },
      { value: (Wb + W1 + W2) / 2, trap: 'shared the total load equally between the supports' },
    ],
    extra: [
      { value: Wb + W1 + W2, trap: 'gave the total load rather than one reaction' },
      { value: (Wb * (L / 2) + W1 * a1) / L, trap: `left the $${n(W2)}\\ \\text{N}$ load out of the moment equation` },
      { value: (Wb * (L / 2) + W2 * a2) / L, trap: `left the $${n(W1)}\\ \\text{N}$ load out of the moment equation` },
      { value: (Wb * (L / 2) + W1 * a2 + W2 * a1) / L, trap: 'paired each load with the other load’s distance' },
      { value: W1 * a1 + W2 * a2, trap: 'forgot to divide by the length' },
      { value: (Wb * (L / 2) + W1 * a1 + W2 * a2) / L + Wb / 2, trap: 'counted the beam’s weight twice' },
    ],
    solution: `Moments about $${other}$: $R_${at} \\times ${n(L)} = ${n(Wb)} \\times ${n(L / 2)} + ${n(W1)} \\times ${n(a1)} + ${n(W2)} \\times ${n(a2)}$, so $R_${at} = ${n(answer)}\\ \\text{N}$. (Check: $R_A + R_B = ${n(Wb + W1 + W2)}$ N.)`,
    trap: 'Every lever arm is measured from the support you take moments about, and the beam’s weight acts at its centre.',
    tags: ['moments', 'reactions', 'two loads'],
    sys: {
      xs: [L / 2, d1, d2, at === 'A' ? 0 : L, at === 'A' ? L : 0],
      fs: [-Wb, -W1, -W2, 0, 0],
      askIndex: 3,
      askKind: 'f',
      askSign: 1,
      aScale: 1,
      freeIndex: 4,
      pivot: 0,
    },
    params: { variant: 'two-loads', L, Wb, W1, W2, d1, d2, at },
  });
}

/** Overhanging plank on two supports: how far past the far support can a man walk before it tips? */
function tipping(rng: RNG): Generated | null {
  const L = rng.pick([6, 8, 10]);
  const c = rng.pick([1, 1.5, 2]);
  const dSup = rng.pick([3, 4, 5, 6, 7].filter((v) => v > L / 2 && v < L - 0.5));
  const Wb = rng.pick([200, 300, 400, 500, 600]);
  const Wm = rng.pick([500, 600, 750, 800, 1000]);
  const past = (Wb * (dSup - L / 2)) / Wm;
  const x = round(dSup + past);
  if (!isMult(past, 0.1) || past < 0.2 || x > L - 0.2) return null;
  // The man starts *on* the near support: standing on the overhang beyond C, a heavy man would
  // already have tipped the plank about C (W_m·c > W_b(L/2 − c)), so the stem would describe a
  // position the plank cannot be in and the true answer would be 0.
  const stem = `A uniform plank $AB$ of length $${n(L)}\\ \\text{m}$ and weight $${n(Wb)}\\ \\text{N}$ rests horizontally on two supports: one at $C$, $${n(c)}\\ \\text{m}$ from $A$, and one at $D$, $${n(dSup)}\\ \\text{m}$ from $A$. A man of weight $${n(Wm)}\\ \\text{N}$ stands on the plank at $C$ and walks towards $B$.\n\nFind the greatest distance from $A$ he can reach before the plank tips.`;
  /** a distance off the end of the plank is no distractor at all */
  const onPlank = (v: number): number | null => (v > 0 && v <= L ? round(v) : null);
  return pack(rng, {
    stem,
    answer: x,
    unit: U_M,
    must: [
      { value: onPlank(past), trap: 'gave the distance past $D$ instead of the distance from $A$' },
      { value: onPlank(dSup), trap: 'forgot the plank’s own weight, which lets him go past $D$' },
      { value: onPlank(c + (Wb * (L / 2 - c)) / Wm), trap: 'tipped about the near support $C$ instead of $D$' },
    ],
    extra: [
      { value: onPlank(dSup + (Wb * dSup) / Wm), trap: 'used the whole distance to $D$ as the plank’s lever arm' },
      { value: onPlank(dSup + (Wm * (dSup - L / 2)) / Wb), trap: 'the two weights used the wrong way round' },
      { value: onPlank(dSup + (Wb * (L / 2)) / Wm), trap: 'measured the plank’s weight from $A$ instead of from $D$' },
      { value: onPlank(2 * dSup - L / 2), trap: 'cancelled the weights, as if the man and the plank weighed the same' },
      { value: L, trap: 'assumed he can walk to the end of the plank' },
      { value: L / 2, trap: 'gave the centre of the plank' },
      { value: onPlank(dSup - past), trap: 'took the man to the wrong side of $D$' },
      { value: onPlank(dSup + past / 2), trap: 'halved the extra distance past $D$' },
    ],
    solution: `On the point of tipping the reaction at $C$ is zero, so take moments about $D$: $${n(Wm)}(x - ${n(dSup)}) = ${n(Wb)} \\times ${n(dSup - L / 2)}$, giving $x - ${n(dSup)} = ${n(past)}$, so $x = ${n(x)}\\ \\text{m}$.`,
    trap: 'At the point of tipping the other support carries nothing: take moments about the support the plank turns on, and keep the plank’s weight at its centre.',
    tags: ['moments', 'tipping', 'equilibrium'],
    sys: {
      xs: [L / 2, 0, dSup],
      fs: [-Wb, -Wm, 0],
      askIndex: 1,
      askKind: 'x',
      askSign: -1,
      aScale: 1,
      freeIndex: 2,
      pivot: dSup,
    },
    params: { variant: 'tipping', L, c, dSup, Wb, Wm },
  });
}

// ----------------------------------------------------------------------------- level 5

/** Uniform beam hinged at a wall, held horizontal by a vertical cable. */
function hingedBeam(rng: RNG): Generated | null {
  const L = rng.pick([4, 5, 6, 8]);
  const Wb = rng.pick([100, 200, 300, 400, 500, 600]);
  const WL = rng.pick([100, 150, 200, 250, 300, 400, 500]);
  const d = rng.pick([1, 1.5, 2, 2.5, 3, 4, 5, 6].filter((v) => v > 0 && v <= L));
  const T = (Wb * (L / 2) + WL * d) / L;
  const V = Wb + WL - T;
  if (!isMult(T, 0.5) || !isMult(V, 0.5) || T < 50 || V < 20) return null;
  const askT = rng.bool(0.65);
  const answer = askT ? T : V;
  const where = d === L ? 'from $B$' : `from a point $${n(d)}\\ \\text{m}$ from $A$`;
  const stem = `A uniform beam $AB$ of length $${n(L)}\\ \\text{m}$ and weight $${n(Wb)}\\ \\text{N}$ is hinged to a wall at $A$ and held horizontal by a vertical cable attached at $B$. A load of weight $${n(WL)}\\ \\text{N}$ hangs ${where}.\n\n${askT ? 'Find the tension in the cable.' : 'Find the magnitude of the vertical force the hinge exerts on the beam.'}`;
  const must: Cand[] = askT
    ? [
        { value: V, trap: 'took moments about $B$, which gives the force at the hinge, not the tension' },
        { value: (WL * d) / L, trap: 'forgot the weight of the beam acting at its centre' },
        { value: (Wb + WL) / 2, trap: 'shared the total weight equally between the cable and the hinge' },
      ]
    : [
        { value: T, trap: 'took moments about $A$, which gives the tension, not the hinge force' },
        { value: (Wb * (L / 2) + WL * (L - d)) / L, trap: 'measured the load’s distance from the wrong end' },
        { value: (Wb + WL) / 2, trap: 'shared the total weight equally between the cable and the hinge' },
      ];
  return pack(rng, {
    stem,
    answer,
    unit: U_N,
    must,
    extra: [
      { value: Wb + WL, trap: 'gave the total weight supported, not one of the two forces' },
      { value: Wb / 2, trap: 'took moments for the beam alone and left the load out' },
      { value: Wb / 2 + WL, trap: 'halved the beam’s weight but kept the whole load' },
      { value: (Wb * (L / 2) + WL * d) / d, trap: 'divided by the load’s distance instead of the beam’s length' },
      { value: Wb * (L / 2) + WL * d, trap: 'gave the total moment instead of the force' },
    ],
    solution: `Moments about the hinge $A$ (its own force then has no moment): $T \\times ${n(L)} = ${n(Wb)} \\times ${n(L / 2)} + ${n(WL)} \\times ${n(d)}$, so $T = ${n(T)}\\ \\text{N}$. Vertically, hinge force $= ${n(Wb)} + ${n(WL)} - ${n(T)} = ${n(V)}\\ \\text{N}$ upwards.`,
    trap: 'Take moments about the hinge to get the tension; the hinge force then comes from ΣF = 0, not from another moment equation.',
    tags: ['moments', 'equilibrium', 'hinge'],
    sys: {
      xs: [L / 2, d, L, 0],
      fs: [-Wb, -WL, 0, 0],
      askIndex: askT ? 2 : 3,
      askKind: 'f',
      askSign: 1,
      aScale: 1,
      freeIndex: askT ? 3 : 2,
      pivot: 0,
    },
    params: { variant: 'hinged', L, Wb, WL, d, askT },
  });
}

/** Crane jib balanced about its pivot by a counterweight. */
function crane(rng: RNG): Generated | null {
  const kg = rng.bool(0.5);
  const scale = kg ? 10 : 1;
  const unit = kg ? U_KG : U_N;
  const word = kg ? 'mass' : 'weight';
  const L = rng.pick([10, 12, 15, 16, 20]);
  const p = rng.pick([2, 3, 4, 5, 6].filter((v) => v < L / 2));
  const wj = kg ? rng.pick([300, 400, 500, 600, 800]) : rng.pick([3000, 4000, 5000, 6000, 8000]);
  const wl = kg ? rng.pick([100, 150, 200, 250, 300, 400]) : rng.pick([1000, 1500, 2000, 2500, 3000, 4000]);
  const c = (wj * (L / 2 - p) + wl * (L - p)) / p;
  if (!isMult(c, kg ? 5 : 50) || c < wl || c > (kg ? 5000 : 50000)) return null;
  const stem = `A crane has a horizontal uniform jib $AB$ of length $${n(L)}\\ \\text{m}$ and ${word} $${n(wj)}\\ ${unit}$, pivoted at a point $P$ which is $${n(p)}\\ \\text{m}$ from $A$. A load of ${word} $${n(wl)}\\ ${unit}$ hangs from $B$, and a counterweight is attached at $A$.\n\nFind the ${word} of the counterweight needed for the jib to balance about $P$.`;
  return pack(rng, {
    stem,
    answer: c,
    unit,
    must: [
      { value: (wl * (L - p)) / p, trap: 'forgot the jib’s own weight acting at its centre' },
      { value: (wj * (L / 2) + wl * L) / p, trap: 'measured both distances from $A$ instead of from the pivot' },
      { value: wj * (L / 2 - p) + wl * (L - p), trap: 'forgot to divide by the counterweight’s distance from the pivot' },
    ],
    extra: [
      { value: wj + wl, trap: 'added the two weights' },
      { value: (wj * (L / 2 - p) + wl * (L - p)) / (L - p), trap: 'divided by the load’s distance instead of the counterweight’s' },
      { value: (wj * (L / 2 - p) + wl * L) / p, trap: 'measured only the load’s distance from the wrong point' },
      { value: ((wj + wl) * (L - p)) / p, trap: 'took the jib’s weight to act at $B$ with the load, not at the centre of the jib' },
      { value: (wj * (L / 2 - p) + wl * (L - p)) * 2 / p, trap: 'doubled the counterweight' },
      { value: c / 2, trap: 'halved the counterweight' },
    ],
    solution: `Distances from $P$: the jib’s centre is $${n(L / 2 - p)}\\ \\text{m}$ and $B$ is $${n(L - p)}\\ \\text{m}$ on one side, the counterweight $${n(p)}\\ \\text{m}$ on the other. Moments about $P$: $C \\times ${n(p)} = ${n(wj)} \\times ${n(L / 2 - p)} + ${n(wl)} \\times ${n(L - p)}$, so $C = ${n(c)}\\ ${unit}$.`,
    trap: 'Distances are measured from the pivot, not from the end of the jib, and the jib’s own weight still acts at its centre.',
    tags: ['moments', 'equilibrium', 'crane'],
    sys: {
      xs: [L / 2, L, 0, p],
      fs: [-wj * scale, -wl * scale, 0, 0],
      askIndex: 2,
      askKind: 'f',
      askSign: -1,
      aScale: scale,
      freeIndex: 3,
      pivot: p,
    },
    params: { variant: 'crane', kg, L, p, wj, wl },
  });
}

// ----------------------------------------------------------------------------- assembly

const VARIANTS: Record<Level, ((rng: RNG) => Generated | null)[]> = {
  1: [(r) => seesaw(r, 'f'), (r) => seesaw(r, 'x'), momentOfForce],
  2: [(r) => beamOnPivot(r, 'x'), (r) => beamOnPivot(r, 'f')],
  3: [(r) => twoSupports(r, false), (r) => twoSupports(r, true), (r) => twoSupports(r, true)],
  4: [twoLoads, tipping],
  5: [hingedBeam, crane],
};

export default defineTemplate({
  id: 'phy.statics.moments',
  module: 'PHY',
  topic: 'statics',
  title: 'Moments and equilibrium',
  levels: {
    1: 'moment = F × d; a see-saw balanced about its centre → the missing force or distance',
    2: 'uniform beam on a pivot with one load → where the load goes, or how heavy it is',
    3: 'beam on two supports → one reaction by moments about the other (g = 10 when masses are given)',
    4: 'two loads on a uniform beam → a reaction; or how far a man can walk before an overhanging plank tips',
    5: 'beam hinged at a wall with a vertical cable → the tension or the hinge force; a crane counterweight',
  },
  generate(rng, level: Level) {
    return retry(rng, () => pickVariant(rng, VARIANTS[level]));
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const p = (q.params as { sys: Sys }).sys;
    const a = q.answer.value.toNumber();
    if (!(a > 0) || !Number.isFinite(a)) return false;
    const xs = p.xs.slice(), fs = p.fs.slice();
    if (p.askKind === 'f') fs[p.askIndex] = p.askSign * a * p.aScale;
    else if (p.askKind === 'x') xs[p.askIndex] = a;
    // Find the remaining reaction by taking moments about a point no solution ever uses,
    // so that ΣF = 0 below is an independent test of the claimed answer.
    const q0 = -11.5, q1 = 17.5;
    if (p.freeIndex >= 0) {
      if (Math.abs(xs[p.freeIndex] - q0) < 1e-9) return false;
      let m = 0;
      for (let i = 0; i < fs.length; i++) if (i !== p.freeIndex) m += fs[i] * (xs[i] - q0);
      fs[p.freeIndex] = -m / (xs[p.freeIndex] - q0);
    }
    const scale = fs.reduce((s, f, i) => s + Math.abs(f) * (1 + Math.abs(xs[i] - q1)), 0) + 1;
    const tol = 1e-9 * scale;
    // (1) ΣF = 0
    if (Math.abs(fs.reduce((s, f) => s + f, 0)) > tol) return false;
    // (2) Σ moments about a second point
    if (Math.abs(fs.reduce((s, f, i) => s + f * (xs[i] - q1), 0)) > tol) return false;
    // (3) a moment question: the whole point of the variant is the unit of the distance, so verify
    //     converts the distances *as the stem prints them* itself and checks that both forces give
    //     the claimed moment. (Recomputing F1·d1 from the metres stored in `sys` would only repeat
    //     generate's own arithmetic, and F2 was defined as M/d2, so that identity holds anyway.)
    if (p.askKind === 'm') {
      const pm = q.params as { shown?: number[]; distUnit?: string; forces?: number[] };
      if (!Array.isArray(pm.shown) || !Array.isArray(pm.forces) || pm.shown.length !== 2 || pm.forces.length !== 2) return false;
      if (pm.distUnit !== 'cm' && pm.distUnit !== 'm') return false;
      const metres = (v: number) => (pm.distUnit === 'cm' ? v / 100 : v);
      for (let i = 0; i < 2; i++) {
        const mi = pm.forces[i] * metres(pm.shown[i]);
        if (!Number.isFinite(mi) || Math.abs(mi - a) > 1e-9 * (1 + a)) return false;
      }
    }
    // every reaction must actually push the beam up
    if (p.freeIndex >= 0 && fs[p.freeIndex] < -tol) return false;
    return true;
  },
});
