import { defineTemplate, retry, type Generated, type Level } from '../../core/template';
import { E, Exact } from '../../core/exact';
import { buildOptions, buildChoiceOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import type { RNG } from '../../core/rng';

/**
 * Balancing nuclear equations: mass number A and proton number Z are conserved.
 * Level 1: alpha decay — the daughter's mass number (A − 4) or proton number (Z − 2)
 * Level 2: beta-minus decay — Z rises by 1, A is unchanged; the daughter as a number or in ^A_Z X notation
 * Level 3: neutron counts (A − Z) before and after a decay, and beta-plus (positron) emission
 * Level 4: a decay series from one nuclide to another: how many alphas, or how many betas given the alphas
 * Level 5: fission — the number of neutrons released (remember the one absorbed), and identifying an
 *          unknown particle from the change in A and Z
 *
 * Every wrong option is a specific slip: an alpha changing Z by 4 (or A by 2), beta-minus lowering Z,
 * reading A as the neutron count, and dropping the neutron that started the fission.
 */

/** Element symbols indexed by proton number, so every daughter is named correctly. */
const SYMBOLS = [
  '', 'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca',
  'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Rb', 'Sr', 'Y', 'Zr',
  'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'I', 'Xe', 'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd',
  'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg',
  'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn', 'Fr', 'Ra', 'Ac', 'Th', 'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm',
];

const sym = (Z: number): string | null => (Z >= 1 && Z < SYMBOLS.length ? SYMBOLS[Z] : null);
/** LaTeX for a nuclide: ^{238}_{92}U */
const nuc = (A: number, Z: number, star = false): string => `^{${A}}_{${Z}}\\text{${sym(Z)}}${star ? '^{*}' : ''}`;
const ALPHA = '^{4}_{2}\\alpha';
const BETA = '^{0}_{-1}\\beta';
const POSITRON = '^{0}_{+1}\\beta';
const NEUTRON = '^{1}_{0}\\text{n}';

type Cand = { value: number | null; trap: string };

function cleanOnly(ds: Cand[]): Distractor[] {
  const out: Distractor[] = [];
  for (const d of ds) {
    if (d.value === null || !Number.isInteger(d.value) || d.value < 0) continue;
    const v = E(d.value);
    if (!isCleanExact(v).ok) continue;
    out.push({ value: v, trap: d.trap });
  }
  return out;
}

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

interface Pack {
  stem: string;
  answer: number;
  must: Cand[];
  extra: Cand[];
  solution: string;
  trap: string;
  tags: string[];
  params: Record<string, unknown>;
}

function pack(rng: RNG, p: Pack): Generated | null {
  if (!Number.isInteger(p.answer) || p.answer < 0) return null;
  const ans = E(p.answer);
  const ds = ranked(rng, ans, cleanOnly(p.must), cleanOnly(p.extra));
  if (ds.length < 4) return null;
  return {
    stem: p.stem,
    answer: { kind: 'exact', value: ans },
    options: buildOptions(rng, ans, ds),
    solution: p.solution,
    trap: p.trap,
    tags: p.tags,
    params: p.params,
    typedAllowed: true,
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

// ------------------------------------------------------------------------------------------ nuclide pools

const ALPHA_PARENTS: [number, number][] = [[238, 92], [235, 92], [234, 92], [232, 90], [230, 90], [226, 88], [224, 88], [222, 86], [220, 86], [218, 84], [214, 84], [210, 84], [241, 95], [239, 94], [237, 93], [212, 83]];
const BETA_PARENTS: [number, number][] = [[14, 6], [24, 11], [32, 15], [40, 19], [45, 20], [60, 27], [90, 38], [99, 42], [131, 53], [137, 55], [210, 82], [214, 82], [234, 90], [228, 88]];
const POSITRON_PARENTS: [number, number][] = [[11, 6], [13, 7], [15, 8], [18, 9], [22, 11], [30, 15], [64, 29]];
const NUCLIDES: [number, number][] = [...ALPHA_PARENTS, ...BETA_PARENTS, [12, 6], [23, 11], [27, 13], [35, 17], [56, 26], [63, 29], [75, 33], [88, 38], [127, 53], [197, 79], [208, 82]];

// ------------------------------------------------------------------------------------------ level 1

function alphaNumbers(rng: RNG): Generated | null {
  const [A, Z] = rng.pick(ALPHA_PARENTS);
  const askMass = rng.bool(0.5);
  const dA = A - 4, dZ = Z - 2;
  if (!sym(dZ)) return null;
  const eq = `$${nuc(A, Z)} \\rightarrow ${nuc(dA, dZ)} + ${ALPHA}$`;
  if (askMass) {
    return pack(rng, {
      stem: `The nuclide $${nuc(A, Z)}$ decays by emitting an alpha particle. Find the mass number of the nucleus produced.`,
      answer: dA,
      must: [
        { value: A - 2, trap: 'used the alpha particle\'s proton number (2) instead of its mass number (4)' },
        { value: A, trap: 'thought the mass number is unchanged (that is beta decay)' },
      ],
      extra: [
        { value: A + 4, trap: 'added the alpha particle instead of removing it' },
        { value: A - 8, trap: 'removed two alpha particles' },
        { value: A - Z, trap: 'gave the number of neutrons' },
        { value: A - 1, trap: 'took away one nucleon' },
      ],
      solution: `An alpha particle is $${ALPHA}$, so the mass number falls by 4: ${eq}, and the daughter has mass number $${dA}$.`,
      trap: 'An alpha particle carries away 4 nucleons and 2 protons: A falls by 4, Z by 2.',
      tags: ['nuclear', 'alpha', 'equations'],
      params: { variant: 'alpha-A', A, Z },
    });
  }
  return pack(rng, {
    stem: `The nuclide $${nuc(A, Z)}$ decays by emitting an alpha particle. Find the proton number (atomic number) of the nucleus produced.`,
    answer: dZ,
    must: [
      { value: Z - 4, trap: 'used the alpha particle\'s mass number (4) instead of its proton number (2)' },
      { value: Z - 1, trap: 'used the change for beta-minus decay' },
    ],
    extra: [
      { value: Z + 2, trap: 'added the alpha particle instead of removing it' },
      { value: Z, trap: 'thought the proton number is unchanged' },
      { value: A - 2, trap: 'worked on the mass number instead' },
      { value: Z - 3, trap: 'arithmetic slip' },
    ],
    solution: `An alpha particle is $${ALPHA}$, so the proton number falls by 2: ${eq}, and the daughter has $Z = ${dZ}$.`,
    trap: 'An alpha particle carries away 2 protons, not 4: Z falls by 2 while A falls by 4.',
    tags: ['nuclear', 'alpha', 'equations'],
    params: { variant: 'alpha-Z', A, Z },
  });
}

// ------------------------------------------------------------------------------------------ level 2

function betaNumbers(rng: RNG): Generated | null {
  const [A, Z] = rng.pick(BETA_PARENTS);
  const dZ = Z + 1;
  if (!sym(dZ)) return null;
  const askMass = rng.bool(0.4);
  const eq = `$${nuc(A, Z)} \\rightarrow ${nuc(A, dZ)} + ${BETA}$`;
  if (askMass) {
    return pack(rng, {
      stem: `The nuclide $${nuc(A, Z)}$ decays by beta-minus emission. Find the mass number of the nucleus produced.`,
      answer: A,
      must: [
        { value: A - 1, trap: 'took a nucleon away: a beta particle has mass number 0' },
        { value: A - 4, trap: 'used alpha decay' },
      ],
      extra: [
        { value: A + 1, trap: 'added one to the mass number instead of to the proton number' },
        { value: A - Z, trap: 'gave the number of neutrons' },
        { value: Z + 1, trap: 'gave the new proton number' },
        { value: A - 2, trap: 'arithmetic slip' },
      ],
      solution: `A beta-minus particle is $${BETA}$, with mass number 0, so $A$ is unchanged: ${eq}.`,
      trap: 'Beta-minus decay turns a neutron into a proton: Z rises by 1 and A does not change.',
      tags: ['nuclear', 'beta', 'equations'],
      params: { variant: 'beta-A', A, Z },
    });
  }
  return pack(rng, {
    stem: `The nuclide $${nuc(A, Z)}$ decays by beta-minus emission. Find the proton number (atomic number) of the nucleus produced.`,
    answer: dZ,
    must: [
      { value: Z - 1, trap: 'lowered Z: it is the electron that is negative, and the nucleus gains a proton' },
      { value: Z - 2, trap: 'used alpha decay' },
    ],
    extra: [
      { value: Z, trap: 'thought the proton number is unchanged' },
      { value: A - Z - 1, trap: 'gave the number of neutrons left' },
      { value: Z + 2, trap: 'raised Z by 2' },
      { value: A, trap: 'gave the mass number' },
    ],
    solution: `A beta-minus particle is $${BETA}$, so conserving charge gives $Z \\rightarrow Z + 1$: ${eq}, and the daughter has $Z = ${dZ}$.`,
    trap: 'Beta-minus decay raises the proton number by 1; only alpha decay lowers it.',
    tags: ['nuclear', 'beta', 'equations'],
    params: { variant: 'beta-Z', A, Z },
  });
}

function betaDaughterChoice(rng: RNG): Generated | null {
  const [A, Z] = rng.pick(BETA_PARENTS);
  if (!sym(Z + 1) || !sym(Z - 1) || !sym(Z - 2)) return null;
  const correct = `$${nuc(A, Z + 1)}$`;
  const wrong = [
    { display: `$${nuc(A, Z - 1)}$`, trap: 'lowered the proton number instead of raising it' },
    { display: `$${nuc(A - 1, Z + 1)}$`, trap: 'took a nucleon away as well: a beta particle has mass number 0' },
    { display: `$${nuc(A + 1, Z + 1)}$`, trap: 'added a nucleon as well as a proton' },
    { display: `$${nuc(A - 4, Z - 2)}$`, trap: 'used alpha decay' },
    { display: `$${nuc(A, Z)}$`, trap: 'left the nuclide unchanged (that is gamma emission)' },
  ];
  return {
    stem: `The nuclide $${nuc(A, Z)}$ decays by beta-minus emission. Which of the following is the nucleus produced?`,
    answer: { kind: 'choice', value: correct },
    options: buildChoiceOptions(rng, correct, wrong),
    solution: `A beta-minus particle is $${BETA}$: the mass number is unchanged and the proton number rises by 1, giving $${nuc(A, Z + 1)}$.`,
    trap: 'Beta-minus: A stays the same, Z rises by 1 (a neutron becomes a proton).',
    tags: ['nuclear', 'beta', 'equations'],
    params: { variant: 'beta-daughter', A, Z },
    typedAllowed: false,
  };
}

// ------------------------------------------------------------------------------------------ level 3

function neutronCount(rng: RNG): Generated | null {
  const [A, Z] = rng.pick(NUCLIDES);
  const ans = A - Z;
  if (ans < 1) return null;
  return pack(rng, {
    stem: `Find the number of neutrons in a nucleus of $${nuc(A, Z)}$.`,
    answer: ans,
    must: [
      { value: A, trap: 'gave the mass number: that counts protons and neutrons together' },
      { value: Z, trap: 'gave the proton number' },
    ],
    extra: [
      { value: A + Z, trap: 'added the two numbers instead of subtracting' },
      { value: A - 2 * Z, trap: 'subtracted the protons twice' },
      { value: ans + 1, trap: 'off by one' },
      { value: ans - 1, trap: 'off by one' },
    ],
    solution: `Neutrons $= A - Z = ${A} - ${Z} = ${ans}$.`,
    trap: 'The mass number counts nucleons: neutrons are A − Z.',
    tags: ['nuclear', 'nuclides', 'neutrons'],
    params: { variant: 'neutrons', A, Z },
  });
}

function neutronsAfterDecay(rng: RNG): Generated | null {
  const alpha = rng.bool(0.6);
  const [A, Z] = rng.pick(alpha ? ALPHA_PARENTS : BETA_PARENTS);
  const dA = alpha ? A - 4 : A;
  const dZ = alpha ? Z - 2 : Z + 1;
  if (!sym(dZ)) return null;
  const ans = dA - dZ;
  if (ans < 1) return null;
  return pack(rng, {
    stem: `The nuclide $${nuc(A, Z)}$ decays by ${alpha ? 'emitting an alpha particle' : 'beta-minus emission'}. Find the number of neutrons in the nucleus produced.`,
    answer: ans,
    must: [
      { value: A - Z, trap: 'gave the number of neutrons in the parent nucleus' },
      { value: alpha ? A - Z - 4 : A - Z + 1, trap: alpha ? 'took 4 neutrons away: an alpha particle contains 2 protons and 2 neutrons' : 'gained a neutron instead of losing one' },
    ],
    extra: [
      { value: dA, trap: 'gave the mass number of the daughter' },
      { value: dZ, trap: 'gave the proton number of the daughter' },
      { value: ans + 2, trap: 'slipped by two nucleons' },
      { value: ans - 1, trap: 'off by one' },
    ],
    solution: `The daughter is $${nuc(dA, dZ)}$, so it has $${dA} - ${dZ} = ${ans}$ neutrons.`,
    trap: alpha ? 'An alpha particle removes 2 protons and 2 neutrons, so A − Z falls by 2.' : 'Beta-minus turns a neutron into a proton: one neutron fewer, the same number of nucleons.',
    tags: ['nuclear', 'neutrons', 'equations'],
    params: { variant: 'neutrons-after', A, Z, alpha },
  });
}

function positronChoice(rng: RNG): Generated | null {
  const [A, Z] = rng.pick(POSITRON_PARENTS);
  if (!sym(Z - 1) || !sym(Z + 1)) return null;
  const correct = `$${nuc(A, Z - 1)}$`;
  const wrong = [
    { display: `$${nuc(A, Z + 1)}$`, trap: 'raised the proton number: that is beta-minus decay' },
    { display: `$${nuc(A - 1, Z - 1)}$`, trap: 'took a nucleon away as well: a positron has mass number 0' },
    { display: `$${nuc(A - 4, Z - 2)}$`, trap: 'used alpha decay' },
    { display: `$${nuc(A, Z)}$`, trap: 'left the nuclide unchanged (that is gamma emission)' },
    { display: `$${nuc(A + 1, Z - 1)}$`, trap: 'added a nucleon' },
  ];
  return {
    stem: `The nuclide $${nuc(A, Z)}$ decays by emitting a positron ($${POSITRON}$). Which of the following is the nucleus produced?`,
    answer: { kind: 'choice', value: correct },
    options: buildChoiceOptions(rng, correct, wrong),
    solution: `A positron carries charge $+1$ and no nucleons, so conserving charge gives $Z \\rightarrow Z - 1$ with $A$ unchanged: $${nuc(A, Z - 1)}$.`,
    trap: 'Beta-plus (positron) emission turns a proton into a neutron: Z falls by 1, A is unchanged.',
    tags: ['nuclear', 'positron', 'equations'],
    params: { variant: 'positron', A, Z },
    typedAllowed: false,
  };
}

// ------------------------------------------------------------------------------------------ level 4

interface Series { A: number; Z: number; A2: number; Z2: number; a: number; b: number }

function drawSeries(rng: RNG): Series | null {
  const [A, Z] = rng.pick([[238, 92], [235, 92], [232, 90], [237, 93], [241, 95], [239, 94]] as [number, number][]);
  const a = rng.int(2, 7);
  const b = rng.int(0, Math.min(5, 2 * a - 1));
  const A2 = A - 4 * a;
  const Z2 = Z - 2 * a + b;
  if (!sym(Z2) || Z2 < 78 || A2 < 200) return null;
  const N = A2 - Z2;
  if (N / Z2 < 1.25 || N / Z2 > 1.6) return null;
  return { A, Z, A2, Z2, a, b };
}

function seriesCount(rng: RNG): Generated | null {
  const s = drawSeries(rng);
  if (!s) return null;
  const askBeta = rng.bool(0.6);
  const chain = `$${nuc(s.A, s.Z)} \\rightarrow ${nuc(s.A2, s.Z2)}$`;
  if (askBeta) {
    return pack(rng, {
      stem: `Through a series of alpha and beta-minus decays, ${chain}. ${s.a} alpha particles are emitted altogether. Find the number of beta-minus particles emitted.`,
      answer: s.b,
      must: [
        { value: s.Z - s.Z2, trap: 'used the drop in proton number directly, forgetting the alphas take 2 each' },
        { value: s.b + 1, trap: 'off by one in the proton-number balance' },
      ],
      extra: [
        { value: s.a, trap: 'gave the number of alpha particles' },
        { value: Math.abs(s.b - 1), trap: 'off by one in the proton-number balance' },
        { value: 2 * s.a, trap: 'gave the total charge carried off by the alphas' },
        { value: (s.A - s.A2) / 4, trap: 'gave the number of alphas again' },
      ],
      solution: `Mass number: $${s.A} - ${s.A2} = ${s.A - s.A2} = 4 \\times ${s.a}$, so ${s.a} alphas. Proton number: $${s.Z} - 2 \\times ${s.a} = ${s.Z - 2 * s.a}$, and the daughter has $Z = ${s.Z2}$, so ${s.b} beta-minus decays raise it by $${s.b}$.`,
      trap: 'Each alpha lowers Z by 2 and each beta-minus raises it by 1: balance Z after taking the alphas out.',
      tags: ['nuclear', 'decay-series', 'equations'],
      params: { variant: 'series-beta', A: s.A, Z: s.Z, A2: s.A2, Z2: s.Z2, a: s.a },
    });
  }
  return pack(rng, {
    stem: `Through a series of alpha and beta-minus decays, ${chain}. Find the number of alpha particles emitted.`,
    answer: s.a,
    must: [
      { value: s.A - s.A2, trap: 'gave the drop in mass number instead of dividing it by 4' },
      { value: (s.A - s.A2) / 2, trap: 'divided the drop in mass number by 2 instead of 4' },
    ],
    extra: [
      { value: s.a + 1, trap: 'off by one' },
      { value: s.a - 1, trap: 'off by one' },
      { value: s.Z - s.Z2, trap: 'used the drop in proton number, which the betas also change' },
      { value: 2 * s.a, trap: 'gave the total charge carried off by the alphas' },
    ],
    solution: `Only alpha decays change the mass number, by 4 each: $\\dfrac{${s.A} - ${s.A2}}{4} = \\dfrac{${s.A - s.A2}}{4} = ${s.a}$.`,
    trap: 'Count the alphas from the mass number (betas do not change A), then use Z for the betas.',
    tags: ['nuclear', 'decay-series', 'equations'],
    params: { variant: 'series-alpha', A: s.A, Z: s.Z, A2: s.A2, Z2: s.Z2 },
  });
}

function seriesChoice(rng: RNG): Generated | null {
  const s = drawSeries(rng);
  if (!s || s.b === 0) return null;
  const label = (a: number, b: number) => `${a} $\\alpha$ and ${b} $\\beta^{-}$`;
  const correct = label(s.a, s.b);
  const cands: { a: number; b: number; trap: string }[] = [
    { a: s.a, b: s.Z - s.Z2, trap: 'read the beta count straight off the drop in proton number' },
    { a: s.a, b: s.b + 1, trap: 'off by one in the proton-number balance' },
    { a: s.a + 1, b: s.b, trap: 'off by one in the mass-number balance' },
    { a: (s.A - s.A2) / 2, b: s.b, trap: 'divided the drop in mass number by 2 instead of 4' },
    { a: s.b, b: s.a, trap: 'swapped the two counts' },
    { a: s.a, b: s.b - 1, trap: 'off by one in the proton-number balance' },
    { a: s.a - 1, b: s.b, trap: 'off by one in the mass-number balance' },
    { a: s.a, b: 2 * s.a, trap: 'balanced the proton number as if the alphas added charge' },
  ];
  const seen = new Set([correct]);
  const wrong: { display: string; trap: string }[] = [];
  for (const c of cands) {
    if (c.a < 1 || c.b < 0 || !Number.isInteger(c.a) || !Number.isInteger(c.b)) continue;
    const d = label(c.a, c.b);
    if (seen.has(d)) continue;
    seen.add(d);
    wrong.push({ display: d, trap: c.trap });
  }
  if (wrong.length < 4) return null;
  return {
    stem: `Through a series of alpha and beta-minus decays, $${nuc(s.A, s.Z)} \\rightarrow ${nuc(s.A2, s.Z2)}$. How many of each type of decay occur?`,
    answer: { kind: 'choice', value: correct },
    options: buildChoiceOptions(rng, correct, wrong),
    solution: `Mass number: $(${s.A} - ${s.A2}) \\div 4 = ${s.a}$ alphas. Proton number: the alphas take it to $${s.Z - 2 * s.a}$, and it must reach $${s.Z2}$, so there are ${s.b} beta-minus decays.`,
    trap: 'Alphas are fixed by the mass number; the betas then make up the proton number.',
    tags: ['nuclear', 'decay-series', 'equations'],
    params: { variant: 'series-choice', A: s.A, Z: s.Z, A2: s.A2, Z2: s.Z2, a: s.a, b: s.b },
    typedAllowed: false,
  };
}

// ------------------------------------------------------------------------------------------ level 5

/** Fission products: [A1, Z1, A2, Z2, neutrons], with A1 + A2 + k = 236 and Z1 + Z2 = 92. */
const FISSION: [number, number, number, number, number][] = [
  [141, 56, 92, 36, 3],
  [144, 56, 89, 36, 3],
  [140, 54, 94, 38, 2],
  [137, 52, 97, 40, 2],
  [139, 56, 95, 36, 2],
  [143, 54, 90, 38, 3],
  [95, 39, 138, 53, 3],
  [148, 57, 85, 35, 3],
];

function fissionNeutrons(rng: RNG): Generated | null {
  const [A1, Z1, A2, Z2, k] = rng.pick(FISSION);
  const eq = `$^{235}_{92}\\text{U} + ${NEUTRON} \\rightarrow ${nuc(A1, Z1)} + ${nuc(A2, Z2)} + k\\,${NEUTRON}$`;
  return pack(rng, {
    stem: `A uranium-235 nucleus absorbs a neutron and undergoes fission:\n\n${eq}\n\nFind the value of $k$.`,
    answer: k,
    must: [
      { value: 235 - A1 - A2, trap: 'forgot the neutron absorbed at the start, so the mass numbers were one short' },
      { value: k + 2, trap: 'slipped in the mass-number balance' },
    ],
    extra: [
      { value: k + 1, trap: 'counted the absorbed neutron among those released' },
      { value: 92 - Z1 - Z2, trap: 'balanced the proton numbers, which the neutrons do not change' },
      { value: 2 * k, trap: 'doubled the count' },
      { value: k - 1, trap: 'off by one' },
    ],
    solution: `Mass numbers must balance: $235 + 1 = ${A1} + ${A2} + k$, so $k = 236 - ${A1 + A2} = ${k}$.`,
    trap: 'The absorbed neutron counts on the left: balance 236, not 235.',
    tags: ['nuclear', 'fission', 'equations'],
    params: { variant: 'fission-k', A1, A2, Z1, Z2 },
  });
}

function fissionFragment(rng: RNG): Generated | null {
  const [A1, Z1, A2, Z2, k] = rng.pick(FISSION);
  const askA = rng.bool(0.5);
  const eq = `$^{235}_{92}\\text{U} + ${NEUTRON} \\rightarrow ^{A}_{Z}\\text{X} + ${nuc(A2, Z2)} + ${k}\\,${NEUTRON}$`;
  if (askA) {
    return pack(rng, {
      stem: `A uranium-235 nucleus absorbs a neutron and undergoes fission:\n\n${eq}\n\nFind the mass number $A$ of the nuclide X.`,
      answer: A1,
      must: [
        { value: 235 - A2 - k, trap: 'forgot the neutron absorbed at the start' },
        { value: 236 - A2, trap: 'forgot the neutrons released' },
      ],
      extra: [
        { value: A1 + 1, trap: 'off by one in the mass-number balance' },
        { value: A1 - 1, trap: 'off by one in the mass-number balance' },
        { value: 236 - A2 - 2 * k, trap: 'counted the released neutrons twice' },
        { value: A1 - Z1, trap: 'gave the number of neutrons in X' },
      ],
      solution: `Mass numbers balance: $235 + 1 = A + ${A2} + ${k}$, so $A = 236 - ${A2 + k} = ${A1}$.`,
      trap: 'Balance 236 on the left (the absorbed neutron counts) and remember the k released neutrons on the right.',
      tags: ['nuclear', 'fission', 'equations'],
      params: { variant: 'fission-A', A1, A2, Z1, Z2, k },
    });
  }
  return pack(rng, {
    stem: `A uranium-235 nucleus absorbs a neutron and undergoes fission:\n\n${eq}\n\nFind the proton number $Z$ of the nuclide X.`,
    answer: Z1,
    must: [
      { value: 92 - Z2 - k, trap: 'took charge off for the neutrons, which are uncharged' },
      { value: 93 - Z2, trap: 'gave the absorbed neutron a charge of 1' },
    ],
    extra: [
      { value: Z1 + 1, trap: 'off by one in the proton-number balance' },
      { value: Z1 - 1, trap: 'off by one in the proton-number balance' },
      { value: A1 - Z1, trap: 'gave the number of neutrons in X' },
      { value: Z2, trap: 'gave the proton number of the other fragment' },
    ],
    solution: `Proton numbers balance and neutrons carry no charge: $92 + 0 = Z + ${Z2}$, so $Z = ${Z1}$.`,
    trap: 'Neutrons change the mass-number balance but never the proton-number balance.',
    tags: ['nuclear', 'fission', 'equations'],
    params: { variant: 'fission-Z', A1, A2, Z1, Z2, k },
  });
}

const PARTICLES: Record<string, { dA: number; dZ: number; label: string }> = {
  alpha: { dA: 4, dZ: 2, label: 'an alpha particle' },
  beta: { dA: 0, dZ: -1, label: 'a beta-minus particle' },
  positron: { dA: 0, dZ: 1, label: 'a positron' },
  neutron: { dA: 1, dZ: 0, label: 'a neutron' },
  proton: { dA: 1, dZ: 1, label: 'a proton' },
  gamma: { dA: 0, dZ: 0, label: 'a gamma ray' },
};

/** Reactions whose missing particle is a neutron or a proton, with the left-hand totals of A and Z. */
const REACTIONS: Record<string, { lhs: string; A: number; Z: number; A2: number; Z2: number }[]> = {
  neutron: [
    { lhs: `${nuc(9, 4)} + ${ALPHA}`, A: 13, Z: 6, A2: 12, Z2: 6 },
    { lhs: `${nuc(2, 1)} + ${nuc(3, 1)}`, A: 5, Z: 2, A2: 4, Z2: 2 },
    { lhs: `${nuc(11, 5)} + ${nuc(4, 2)}`, A: 15, Z: 7, A2: 14, Z2: 7 },
  ],
  proton: [
    { lhs: `${nuc(14, 7)} + ${ALPHA}`, A: 18, Z: 9, A2: 17, Z2: 8 },
    { lhs: `${nuc(27, 13)} + ${ALPHA}`, A: 31, Z: 15, A2: 30, Z2: 14 },
    { lhs: `${nuc(7, 3)} + ${nuc(4, 2)}`, A: 11, Z: 5, A2: 10, Z2: 4 },
  ],
};
const EXCITED: [number, number][] = [[99, 43], [60, 28], [137, 56], [234, 91]];

function unknownParticle(rng: RNG): Generated | null {
  const key = rng.pick(Object.keys(PARTICLES));
  const { label } = PARTICLES[key];
  // Each particle gets a decay (or reaction) that really does emit it, so the equation reads like physics.
  let lhs: string, A: number, Z: number, A2: number, Z2: number;
  if (key === 'neutron' || key === 'proton') {
    const rxn = rng.pick(REACTIONS[key]);
    ({ lhs, A, Z, A2, Z2 } = rxn);
  } else if (key === 'gamma') {
    const [a, z] = rng.pick(EXCITED);
    lhs = nuc(a, z, true); A = a; Z = z; A2 = a; Z2 = z;
  } else {
    const pool = key === 'alpha' ? ALPHA_PARENTS : key === 'beta' ? BETA_PARENTS : POSITRON_PARENTS;
    const [a, z] = rng.pick(pool);
    const d = PARTICLES[key];
    lhs = nuc(a, z); A = a; Z = z; A2 = a - d.dA; Z2 = z - d.dZ;
    if (!sym(Z2) || Z2 < 1 || A2 - Z2 < 1) return null;
  }
  const wrong = Object.keys(PARTICLES).filter((k) => k !== key).map((k) => ({
    display: PARTICLES[k].label,
    trap: `that particle would change the mass number by ${PARTICLES[k].dA} and the proton number by ${PARTICLES[k].dZ}`,
  }));
  return {
    stem: `In the nuclear equation $${lhs} \\rightarrow ${nuc(A2, Z2)} + \\text{X}$, the particle X is emitted. Which of the following is X?`,
    answer: { kind: 'choice', value: label },
    options: buildChoiceOptions(rng, label, wrong),
    solution: `Balance the mass numbers ($${A} = ${A2} + ${A - A2}$) and the proton numbers ($${Z} = ${Z2} + ${Z - Z2}$): X has mass number $${A - A2}$ and proton number $${Z - Z2}$, so it is ${label}.`,
    trap: 'Read off both changes: A tells you the nucleons carried away, Z the charge.',
    tags: ['nuclear', 'equations', 'particles'],
    params: { variant: 'unknown-particle', A, Z, A2, Z2 },
    typedAllowed: false,
  };
}

const BY_LEVEL: Record<Level, ((rng: RNG) => Generated | null)[]> = {
  1: [alphaNumbers],
  2: [betaNumbers, betaDaughterChoice],
  3: [neutronCount, neutronsAfterDecay, positronChoice],
  4: [seriesCount, seriesCount, seriesChoice],
  5: [fissionNeutrons, fissionFragment, unknownParticle],
};

/** A and Z read back out of an option written in ^{A}_{Z}X notation. */
function readNuclide(tex: string): [number, number] | null {
  const m = /\^\{(\d+)\}_\{(\d+)\}/.exec(tex);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export default defineTemplate({
  id: 'phy.nuclear.equations',
  module: 'PHY',
  topic: 'nuclear',
  title: 'Nuclear equations and decay chains',
  levels: {
    1: 'alpha decay: the daughter\'s mass number (A − 4) or proton number (Z − 2)',
    2: 'beta-minus decay: Z + 1 with A unchanged, as a number or as a nuclide',
    3: 'neutron counts A − Z before and after a decay; positron emission',
    4: 'a decay series: how many alphas, how many betas',
    5: 'fission: the number of neutrons released, a missing fragment, or an unknown particle',
  },
  generate(rng, level: Level) {
    return retry(rng, () => pickVariant(rng, BY_LEVEL[level]));
  },
  verify(q) {
    // Independent check: conservation of A and Z, worked from the parameters, never from the generator's arithmetic.
    const p = q.params as Record<string, number> & { variant: string; alpha?: boolean };
    const a = q.answer.kind === 'exact' ? q.answer.value.toNumber() : NaN;
    switch (p.variant) {
      // parent = daughter + particle
      case 'alpha-A': return a + 4 === p.A;
      case 'alpha-Z': return a + 2 === p.Z;
      case 'beta-A': return a + 0 === p.A;
      case 'beta-Z': return a + (-1) === p.Z;
      case 'neutrons': return a + p.Z === p.A;
      case 'neutrons-after': {
        const dA = p.alpha ? 4 : 0, dZ = p.alpha ? 2 : -1;
        return a + (p.Z - dZ) === p.A - dA;
      }
      case 'beta-daughter':
      case 'positron': {
        if (q.answer.kind !== 'choice') return false;
        const d = readNuclide(q.answer.value);
        if (!d) return false;
        const dZ = p.variant === 'positron' ? 1 : -1;
        return d[0] === p.A && d[1] + dZ === p.Z;
      }
      case 'series-beta': return p.A - p.A2 === 4 * p.a && p.Z - 2 * p.a + a === p.Z2;
      case 'series-alpha': return 4 * a === p.A - p.A2 && Number.isInteger(a);
      case 'series-choice': {
        if (q.answer.kind !== 'choice') return false;
        const m = /^(\d+) \$\\alpha\$ and (\d+) \$\\beta/.exec(q.answer.value);
        if (!m) return false;
        const [na, nb] = [Number(m[1]), Number(m[2])];
        return p.A - 4 * na === p.A2 && p.Z - 2 * na + nb === p.Z2;
      }
      case 'fission-k': return 235 + 1 === p.A1 + p.A2 + a && 92 === p.Z1 + p.Z2;
      case 'fission-A': return 236 === a + p.A2 + p.k && 92 === p.Z1 + p.Z2;
      case 'fission-Z': return 92 === a + p.Z2 && 236 === p.A1 + p.A2 + p.k;
      case 'unknown-particle': {
        if (q.answer.kind !== 'choice') return false;
        const dA = p.A - p.A2, dZ = p.Z - p.Z2;
        const match = Object.values(PARTICLES).find((x) => x.dA === dA && x.dZ === dZ);
        return match !== undefined && match.label === q.answer.value;
      }
      default: return false;
    }
  },
});
