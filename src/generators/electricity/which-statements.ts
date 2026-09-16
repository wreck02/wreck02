import { defineTemplate, retry, type Level } from '../../core/template';
import { statementOptions, STATEMENT_COMBOS } from '../../core/options';
import type { RNG } from '../../core/rng';

/**
 * "Which of the following statements are true?" about a described circuit.
 * Scenarios: two resistors in series across a supply, two resistors in parallel across a supply, a lamp given by
 * its rating, and a resistor in series with a parallel pair. Each question takes three statements from the
 * scenario's pool: qualitative (the current is the same all round a series circuit, both branches of a parallel
 * pair share the p.d., adding a resistor in parallel lowers the total resistance) or numeric, where the quoted
 * value is either the true one or the value a named mistake produces (divider ratio inverted, current split in
 * proportion to resistance, 1/R left un-inverted, the rated power used at the wrong p.d.).
 * Level 1: the three easiest statements — mostly qualitative plus a one-step number
 * Level 2: a two-step number (the ammeter reading, the total resistance of a parallel pair)
 * Level 3: two numbers, e.g. the p.d. across one resistor and the total power
 * Level 4: branch currents, power in one resistor, what happens when a resistor is removed
 * Level 5: the p.d. across a parallel section, the charge that flows, two lamps in series
 */

const OHM = 'Ω';

interface Stmt {
  key: string;
  text: string;
  truth: boolean;
  /** the number quoted in a numeric statement (null for a qualitative or comparison one) */
  claim: number | null;
  tier: number;
  /** at most one statement per group is used in a question */
  group?: string;
  /** extra data a comparison statement needs when it is checked again */
  data?: number[];
  /** short reason for the solution */
  why: string;
}

interface Built {
  intro: string;
  params: Record<string, number>;
  pool: Stmt[];
}

/** Plain number: 1200, 0.05, 22.5. */
const n = (x: number): string => (Number.isInteger(x) ? `${x}` : `${Number(x.toPrecision(10))}`);
/** Round away floating-point noise. */
const r = (x: number): number => Number(x.toPrecision(12));
/** Reads as an exam number: at most two decimal places, positive, not huge. */
const tidy = (x: number): boolean => x > 0 && x < 1e6 && Number.isInteger(r(x * 100));
/** One decimal place at most. */
const tidy1 = (x: number): boolean => tidy(x) && Number.isInteger(r(x * 10));
const val = (x: number, unit: string): string => `${n(x)}${unit ? ` ${unit}` : ''}`;
const par2 = (a: number, b: number): number => r((a * b) / (a + b));
/** "a" or "an" in front of a number read aloud (eight, eleven, eighteen, eighty-…). */
const anWord = (x: number): string => {
  const i = Math.floor(Math.abs(x));
  return i === 8 || i === 11 || i === 18 || (i >= 80 && i <= 89) ? 'an' : 'a';
};
/** "a 6 Ω resistor", "an 8 Ω resistor". */
const res = (x: number): string => `${anWord(x)} ${x} ${OHM} resistor`;
const Res = (x: number): string => `${anWord(x) === 'an' ? 'An' : 'A'} ${x} ${OHM} resistor`;
/** "a 12 V supply", "an 18 V supply". */
const supply = (v: number): string => `${anWord(v)} ${n(v)} V supply`;

/** A numeric statement: the quoted value is the true one or one of the mistake values, at random. */
function numeric(rng: RNG, key: string, tier: number, trueVal: number, falseVals: number[], render: (x: number) => string, why: string, group?: string): Stmt | null {
  if (!tidy(trueVal)) return null;
  const falses = falseVals.map(r).filter((f) => tidy(f) && Math.abs(f - trueVal) > 1e-9);
  const useTrue = falses.length === 0 || rng.bool(0.5);
  const claim = useTrue ? r(trueVal) : rng.pick(falses);
  return { key, text: render(claim), truth: useTrue, claim, tier, group, why };
}

/** A qualitative statement shown in its true or its false wording, at random. */
function qual(rng: RNG, key: string, tier: number, trueText: string, falseText: string, why: string, group?: string): Stmt {
  const t = rng.bool(0.5);
  return { key, text: t ? trueText : falseText, truth: t, claim: null, tier, group, why };
}

/**
 * A comparison of two quantities, worded "greater than" or "less than" at random. `data` carries the two
 * resistances and the direction so the claim can be re-derived from Ohm's law.
 */
function compare(rng: RNG, key: string, tier: number, render: (word: string) => string, aVal: number, bVal: number, a: number, b: number, why: string, group?: string): Stmt {
  const greater = rng.bool(0.5);
  const truth = greater ? aVal > bVal : aVal < bVal;
  return { key, text: render(greater ? 'greater' : 'less'), truth, claim: null, tier, group, why, data: [a, b, greater ? 1 : 0] };
}

const keep = (xs: (Stmt | null)[]): Stmt[] => xs.filter((s): s is Stmt => s !== null);

const R_POOL = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 24, 25, 30, 40, 50, 60];

// ----------------------------------------------------------------------------- scenarios

function series(rng: RNG): Built | null {
  const R1 = rng.pick(R_POOL);
  const R2 = rng.pick(R_POOL);
  if (R1 === R2) return null;
  const I = rng.pick([0.5, 1, 1.5, 2, 2.5, 3, 4, 5]);
  const V = r(I * (R1 + R2));
  if (!Number.isInteger(V) || V < 6 || V > 240) return null;
  const V1 = r(I * R1), V2 = r(I * R2);
  const Pt = r(V * I), P1 = r(I * I * R1);
  if (![V1, V2, Pt, P1].every(tidy1)) return null;
  return {
    intro: `${Res(R1)} and ${res(R2)} are connected in series across ${supply(V)}. An ammeter in the circuit reads the current drawn from the supply.`,
    params: { R1, R2, V },
    pool: keep([
      qual(rng, 'same-current', 1,
        `The current in the ${R1} ${OHM} resistor is equal to the current in the ${R2} ${OHM} resistor.`,
        `The current in the ${R1} ${OHM} resistor is greater than the current in the ${R2} ${OHM} resistor.`,
        'in series there is only one path, so the current is the same in both resistors'),
      numeric(rng, 'total-r', 1, R1 + R2, [par2(R1, R2), Math.abs(R1 - R2)], (x) => `The total resistance of the circuit is ${val(x, OHM)}.`, `in series the resistances add: $${R1} + ${R2} = ${R1 + R2}\\ \\Omega$`),
      numeric(rng, 'ammeter', 2, I, [V / R1, V / R2], (x) => `The reading on the ammeter is ${val(x, 'A')}.`, `$I = \\dfrac{${n(V)}}{${R1 + R2}} = ${n(I)}$ A`),
      numeric(rng, 'pd1', 2, V1, [(V * R2) / (R1 + R2), V / 2], (x) => `The potential difference across the ${R1} ${OHM} resistor is ${val(x, 'V')}.`, `$V_1 = IR_1 = ${n(I)} \\times ${R1} = ${n(V1)}$ V (the divider takes $\\dfrac{${R1}}{${R1 + R2}}$ of the supply)`, 'pd'),
      compare(rng, 'pd-cmp', 1, (w) => `The potential difference across the ${R1} ${OHM} resistor is ${w} than the potential difference across the ${R2} ${OHM} resistor.`, V1, V2, R1, R2,
        `the same current flows in both, so the larger resistance has the larger p.d.: $${n(V1)}$ V and $${n(V2)}$ V`, 'pd'),
      qual(rng, 'add-parallel', 3,
        `Connecting a third resistor in parallel with the ${R1} ${OHM} resistor would decrease the total resistance of the circuit.`,
        `Connecting a third resistor in parallel with the ${R1} ${OHM} resistor would increase the total resistance of the circuit.`,
        'adding a resistor in parallel gives the current an extra path, so the total resistance falls'),
      numeric(rng, 'total-power', 3, Pt, [(V * V) / R1, V * V / (R1 + R2) / 2], (x) => `The total power dissipated in the circuit is ${val(x, 'W')}.`, `$P = VI = ${n(V)} \\times ${n(I)} = ${n(Pt)}$ W`, 'power'),
      numeric(rng, 'power1', 4, P1, [(V * V) / R1, Pt / 2], (x) => `The power dissipated in the ${R1} ${OHM} resistor is ${val(x, 'W')}.`, `$P_1 = I^2R_1 = ${n(I * I)} \\times ${R1} = ${n(P1)}$ W (only $${n(V1)}$ V is across it, not the whole supply)`, 'power'),
      numeric(rng, 'charge', 5, r(I * 60), [I, r(I * 3600)], (x) => `A charge of ${val(x, 'C')} passes through the ${R1} ${OHM} resistor in one minute.`, `$Q = It = ${n(I)} \\times 60 = ${n(r(I * 60))}$ C`),
    ]),
  };
}

function parallel(rng: RNG): Built | null {
  const R1 = rng.pick(R_POOL);
  const R2 = rng.pick(R_POOL);
  if (R1 >= R2) return null;
  const Rt = par2(R1, R2);
  const V = rng.pick([6, 12, 20, 24, 30, 36, 48, 60, 120]);
  const I1 = r(V / R1), I2 = r(V / R2), I = r(I1 + I2);
  const Pt = r(V * I);
  if (!tidy1(Rt) || Rt < 1) return null;
  if (![I1, I2, I, Pt].every(tidy1) || I > 30 || I1 < 0.2 || I2 < 0.2) return null;
  return {
    intro: `${Res(R1)} and ${res(R2)} are connected in parallel across ${supply(V)}.`,
    params: { R1, R2, V },
    pool: keep([
      qual(rng, 'same-pd', 1,
        'Both resistors have the same potential difference across them.',
        `The potential difference across the ${R2} ${OHM} resistor is greater than the potential difference across the ${R1} ${OHM} resistor.`,
        'the two resistors are connected between the same two points, so each has the full supply p.d. across it'),
      compare(rng, 'current-cmp', 1, (w) => `The current in the ${R1} ${OHM} resistor is ${w} than the current in the ${R2} ${OHM} resistor.`, I1, I2, R1, R2,
        `both have ${V} V across them, so the smaller resistance carries the larger current: $${n(I1)}$ A and $${n(I2)}$ A`),
      numeric(rng, 'branch1', 2, I1, [V / (R1 + R2), I / 2], (x) => `The current in the ${R1} ${OHM} resistor is ${val(x, 'A')}.`, `$I_1 = \\dfrac{${V}}{${R1}} = ${n(I1)}$ A`, 'branch'),
      numeric(rng, 'total-r', 2, Rt, [R1 + R2, r(1 / R1 + 1 / R2)], (x) => `The resistance of the combination is ${val(x, OHM)}.`, `$R = \\dfrac{${R1} \\times ${R2}}{${R1} + ${R2}} = ${n(Rt)}\\ \\Omega$ (remember to invert $1/R$)`, 'total'),
      qual(rng, 'less-than-least', 1,
        'The resistance of the combination is less than the resistance of either resistor on its own.',
        'The resistance of the combination is the average of the two resistances.',
        'two paths carry more current than one, so the combined resistance is below the smaller of the two'),
      numeric(rng, 'supply-current', 3, I, [V / (R1 + R2), V / Rt / 2], (x) => `The current drawn from the supply is ${val(x, 'A')}.`, `$I = ${n(I1)} + ${n(I2)} = ${n(I)}$ A (or $\\dfrac{${V}}{${n(Rt)}}$)`, 'branch'),
      numeric(rng, 'total-power', 4, Pt, [(V * V) / (R1 + R2), (V * V) / R1], (x) => `The total power dissipated is ${val(x, 'W')}.`, `$P = VI = ${V} \\times ${n(I)} = ${n(Pt)}$ W`),
      qual(rng, 'remove-one', 4,
        `If the ${R2} ${OHM} resistor were disconnected, the current in the ${R1} ${OHM} resistor would be unchanged.`,
        `If the ${R2} ${OHM} resistor were disconnected, the current in the ${R1} ${OHM} resistor would be halved.`,
        `the ${R1} ${OHM} resistor still has the full ${V} V across it, so its current does not change`),
      numeric(rng, 'add-third', 5, r(V / R1 + V / R2 + V / R1), [I, r(I / 2)], (x) => `Connecting a third resistor of resistance ${R1} ${OHM} in parallel with the other two would make the supply current ${val(x, 'A')}.`, `each extra branch adds its own current: $${n(I)} + ${n(I1)} = ${n(r(I + I1))}$ A`),
    ]),
  };
}

function lamp(rng: RNG): Built | null {
  const V = rng.pick([12, 24, 100, 120, 240]);
  const I = rng.pick([0.25, 0.5, 1.5, 2, 2.5, 3, 4, 5]);
  const P = r(V * I), R = r(V / I);
  const t = rng.pick([10, 20, 30, 60]);
  const Ej = r(P * t), EkJ = r(Ej / 1000), Q = r(I * t);
  if (!Number.isInteger(P) || !Number.isInteger(R) || P < 6 || P > 3000 || R > 2000) return null;
  if (!tidy1(EkJ) || EkJ < 0.1 || !tidy1(Q)) return null;
  return {
    intro: `A lamp is rated ${P} W, ${V} V. It is connected to ${supply(V)} and operates normally.`,
    params: { V, P, t },
    pool: keep([
      numeric(rng, 'current', 1, I, [P / V / 2, V / P], (x) => `The current in the lamp is ${val(x, 'A')}.`, `$I = \\dfrac{P}{V} = \\dfrac{${P}}{${V}} = ${n(I)}$ A`),
      qual(rng, 'power-def', 1,
        `The lamp transfers ${P} J of energy every second.`,
        `The lamp transfers ${P} J of energy every minute.`,
        `a watt is a joule per second, so a ${P} W lamp transfers ${P} J each second`),
      qual(rng, 'higher-power-lower-r', 1,
        `A lamp rated at a higher power for the same ${V} V supply would have a lower resistance.`,
        `A lamp rated at a higher power for the same ${V} V supply would have a higher resistance.`,
        'at a fixed p.d. $P = V^2/R$, so more power means less resistance'),
      numeric(rng, 'resistance', 2, R, [V / P, P / V], (x) => `The resistance of the lamp is ${val(x, OHM)}.`, `$R = \\dfrac{V^2}{P} = \\dfrac{${V * V}}{${P}} = ${n(R)}\\ \\Omega$ (or $V/I$)`),
      numeric(rng, 'energy', 3, EkJ, [r((P * t) / 1000 / 60), r(P * t)], (x) => `In ${t} s the lamp transfers ${val(x, 'kJ')} of energy.`, `$E = Pt = ${P} \\times ${t} = ${n(Ej)}$ J $= ${n(EkJ)}$ kJ`, 'time'),
      numeric(rng, 'charge', 3, Q, [r(Q / 60), r(Q * 60)], (x) => `In ${t} s a charge of ${val(x, 'C')} passes through the lamp.`, `$Q = It = ${n(I)} \\times ${t} = ${n(Q)}$ C`, 'time'),
      qual(rng, 'half-supply', 4,
        'If the lamp were connected to a supply of half this potential difference, and its resistance did not change, it would dissipate a quarter of its rated power.',
        'If the lamp were connected to a supply of half this potential difference, and its resistance did not change, it would dissipate half of its rated power.',
        'at constant resistance $P = V^2/R \\propto V^2$, so halving the p.d. quarters the power'),
      qual(rng, 'two-series', 5,
        `Two of these lamps connected in series across the same ${V} V supply would together dissipate half the rated power of a single lamp.`,
        `Two of these lamps connected in series across the same ${V} V supply would together dissipate twice the rated power of a single lamp.`,
        'the series resistance doubles, so $P = V^2/(2R)$ is half the power of one lamp (and each lamp gets a quarter)'),
      numeric(rng, 'half-power', 5, r(P / 4), [r(P / 2), r(2 * P)], (x) => `Connected to a ${n(V / 2)} V supply, and with its resistance unchanged, the lamp would dissipate ${val(x, 'W')}.`, `$P = \\dfrac{V^2}{R}$, so quartering: $\\dfrac{${P}}{4} = ${n(P / 4)}$ W`),
    ]),
  };
}

function mixed(rng: RNG): Built | null {
  const R1 = rng.pick([3, 4, 5, 6, 10, 12, 15, 20]);
  const R2 = rng.pick([3, 4, 5, 6, 10, 12, 15, 20, 30, 60]);
  if (R1 >= R2) return null;
  const Rp = par2(R1, R2);
  const R0 = rng.pick([2, 3, 4, 5, 6, 8, 10, 12]);
  const Rt = r(R0 + Rp);
  const I = rng.pick([0.5, 1, 1.5, 2, 3, 4]);
  const V = r(I * Rt);
  const Vp = r(I * Rp), V0 = r(I * R0);
  const I1 = r(Vp / R1), I2 = r(Vp / R2);
  if (!tidy1(Rp) || !Number.isInteger(V) || V < 6 || V > 240) return null;
  if (![Vp, V0, I1, I2].every(tidy1) || I1 < 0.2 || I2 < 0.2) return null;
  return {
    intro: `${Res(R0)} is connected in series with a parallel combination of ${res(R1)} and ${res(R2)}. The circuit is connected to ${supply(V)}.`,
    params: { R0, R1, R2, V },
    pool: keep([
      numeric(rng, 'total-r', 1, Rt, [R0 + R1 + R2, Rp], (x) => `The total resistance of the circuit is ${val(x, OHM)}.`, `parallel pair $= ${n(Rp)}\\ \\Omega$, so $R = ${R0} + ${n(Rp)} = ${n(Rt)}\\ \\Omega$`, 'total'),
      numeric(rng, 'supply-current', 2, I, [V / (R0 + R1 + R2), V / R0], (x) => `The current drawn from the supply is ${val(x, 'A')}.`, `$I = \\dfrac{${n(V)}}{${n(Rt)}} = ${n(I)}$ A`, 'total'),
      qual(rng, 'branch-sum', 1,
        `The current in the ${R0} ${OHM} resistor is equal to the sum of the currents in the other two resistors.`,
        `The current in the ${R0} ${OHM} resistor is equal to the current in the ${R1} ${OHM} resistor.`,
        'all the current from the supply passes through the series resistor and then divides between the two branches'),
      qual(rng, 'vp-less', 1,
        'The potential difference across the parallel combination is less than the supply potential difference.',
        'The potential difference across the parallel combination is equal to the supply potential difference.',
        'the series resistor takes a share of the supply p.d., so less than the whole is left for the parallel section'),
      numeric(rng, 'pd-series', 3, V0, [V / 2, Vp], (x) => `The potential difference across the ${R0} ${OHM} resistor is ${val(x, 'V')}.`, `$V_0 = IR_0 = ${n(I)} \\times ${R0} = ${n(V0)}$ V`, 'pd'),
      numeric(rng, 'pd-parallel', 3, Vp, [V, V / 2], (x) => `The potential difference across the parallel combination is ${val(x, 'V')}.`, `$V_p = ${n(V)} - ${n(V0)} = ${n(Vp)}$ V (or $I \\times ${n(Rp)}$)`, 'pd'),
      compare(rng, 'branch-cmp', 3, (w) => `The current in the ${R1} ${OHM} resistor is ${w} than the current in the ${R2} ${OHM} resistor.`, I1, I2, R1, R2,
        `the branches share the same p.d., so the smaller resistance takes the larger current: $${n(I1)}$ A and $${n(I2)}$ A`),
      numeric(rng, 'branch1', 4, I1, [I / 2, (I * R1) / (R1 + R2)], (x) => `The current in the ${R1} ${OHM} resistor is ${val(x, 'A')}.`, `$I_1 = \\dfrac{${n(Vp)}}{${R1}} = ${n(I1)}$ A`, 'branch'),
      numeric(rng, 'power0', 5, r(I * I * R0), [r(((V * V) / R0)), r(V * I)], (x) => `The power dissipated in the ${R0} ${OHM} resistor is ${val(x, 'W')}.`, `$P_0 = I^2R_0 = ${n(I * I)} \\times ${R0} = ${n(r(I * I * R0))}$ W`, 'power'),
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

const SCENARIOS: Record<string, (rng: RNG) => Built | null> = { series, parallel, lamp, mixed };

// ----------------------------------------------------------------------------- template

export default defineTemplate({
  id: 'phy.electricity.which-statements',
  module: 'PHY',
  topic: 'electricity',
  title: 'Which statements are true (circuits)',
  levels: {
    1: 'the easiest statements: the current in a series circuit, the shared p.d. in a parallel pair, one one-step number',
    2: 'a two-step number (the ammeter reading, the resistance of a parallel pair) with qualitative statements',
    3: 'two computed numbers, e.g. the p.d. across one resistor and the total power',
    4: 'branch currents, the power in one resistor, the effect of disconnecting a branch',
    5: 'the charge that flows in a given time, two lamps in series, a third resistor added in parallel',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      const scenario = rng.pick(Object.keys(SCENARIOS));
      // draw this scenario's numbers a few times before giving it up, so the four scenarios appear equally often
      let built: Built | null = null;
      let stmts: Stmt[] | null = null;
      for (let i = 0; i < 40 && !stmts; i++) {
        built = SCENARIOS[scenario](rng);
        if (built) stmts = choose(rng, built.pool, level);
      }
      if (!built || !stmts) return null;
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
        trap: 'Series resistors share the current and split the p.d.; parallel resistors share the p.d. and split the current in inverse ratio, and the combination is always less resistive than either branch.',
        tags: ['electricity', 'circuits', 'statements', scenario],
        params: { scenario, ...built.params, truth, stmts: stmts.map((s) => ({ key: s.key, claim: s.claim, text: s.text, data: s.data ?? null })) },
        typedAllowed: false,
      };
    });
  },
  verify(q) {
    if (q.answer.kind !== 'choice') return false;
    const p = q.params as Record<string, number> & { scenario: string; stmts: { key: string; claim: number | null; text: string; data: number[] | null }[] };
    const close = (a: number, b: number) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b));

    /** The true value of a numeric statement, by a route different from the generator's. */
    const trueValue = (key: string): number | null => {
      switch (p.scenario) {
        case 'series': {
          // work from the conductances: one path, so the current is the supply p.d. over the summed resistance
          const Rt = 1 / (1 / (p.R1 + p.R2));
          const I = p.V / Rt;
          const V1 = p.V - I * p.R2; // the rest of the supply p.d. after the second resistor
          return { 'total-r': Rt, ammeter: I, pd1: V1, 'total-power': I * I * Rt, power1: V1 * I, charge: I * 60 }[key] ?? null;
        }
        case 'parallel': {
          // branch currents first, then everything else from them
          const I1 = p.V / p.R1, I2 = p.V / p.R2, I = I1 + I2;
          return { branch1: I1, 'total-r': p.V / I, 'supply-current': I, 'total-power': I1 * p.V + I2 * p.V, 'add-third': I + I1 }[key] ?? null;
        }
        case 'lamp': {
          // from the resistance implied by the rating, not from the rating directly
          const R = (p.V * p.V) / p.P;
          const I = p.V / R;
          return { current: I, resistance: R, energy: (I * I * R * p.t) / 1000, charge: I * p.t, 'half-power': ((p.V / 2) * (p.V / 2)) / R }[key] ?? null;
        }
        case 'mixed': {
          // conductances for the parallel section, then the loop
          const Rp = 1 / (1 / p.R1 + 1 / p.R2);
          const Rt = p.R0 + Rp;
          const I = p.V / Rt;
          const Vp = p.V - I * p.R0;
          return { 'total-r': Rt, 'supply-current': I, 'pd-series': I * p.R0, 'pd-parallel': Vp, branch1: Vp / p.R1, power0: I * I * p.R0 }[key] ?? null;
        }
        default:
          return null;
      }
    };

    /** Truth of a comparison statement, recomputed from the two resistances. */
    const cmpTruth = (key: string, data: number[]): boolean | null => {
      const [a, b, dir] = data;
      const greater = dir === 1;
      if (key === 'pd-cmp') {
        // series: equal currents, so compare I·R
        const I = p.V / (p.R1 + p.R2);
        return greater ? I * a > I * b : I * a < I * b;
      }
      if (key === 'current-cmp' || key === 'branch-cmp') {
        // parallel branches: equal p.d., so compare V/R for any common V
        const Vtest = 60;
        return greater ? Vtest / a > Vtest / b : Vtest / a < Vtest / b;
      }
      return null;
    };

    /** Truth of a qualitative statement read back from its wording. */
    const qualTruth = (key: string, text: string): boolean | null => {
      switch (key) {
        case 'same-current': return /equal to/.test(text);
        case 'add-parallel': return /decrease/.test(text);
        case 'same-pd': return /Both resistors/.test(text);
        case 'less-than-least': return /less than/.test(text);
        case 'remove-one': return /unchanged/.test(text);
        case 'half-supply': return /quarter/.test(text);
        case 'two-series': return /half/.test(text);
        case 'branch-sum': return /sum of the currents/.test(text);
        case 'power-def': return /every second/.test(text);
        case 'higher-power-lower-r': return /lower resistance/.test(text);
        case 'vp-less': return /less than/.test(text);
        default: return null;
      }
    };

    const truth: boolean[] = [];
    for (const s of p.stmts) {
      if (s.claim === null) {
        const t = s.data ? cmpTruth(s.key, s.data) : qualTruth(s.key, s.text);
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
