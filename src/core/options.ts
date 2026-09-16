/**
 * Multiple-choice option construction.
 *
 * Templates supply the answer and a list of *realistic* distractors (built from
 * common mistakes: sign errors, ± root dropped, radius/diameter, wrong index
 * law, off-by-one, unit slip…). This module de-duplicates them, pads with
 * generic perturbations only if the template ran short, shuffles and letters.
 */
import { Exact, type NumberFormat } from './exact';
import type { RNG } from './rng';
import type { Option } from './template';

export const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export interface Distractor {
  value: Exact;
  trap?: string;
}

export interface BuildOptionsConfig {
  /** total options, default 5 */
  count?: number;
  format?: NumberFormat;
  /** LaTeX unit appended to every option, e.g. "\\text{m s}^{-1}" */
  unit?: string;
  /** Extra padding candidates, tried in order, if the template's distractors ran short. */
  fallback?: Exact[];
}

function fmt(v: Exact, cfg: BuildOptionsConfig): string {
  return `$${v.toLatex({ format: cfg.format })}${cfg.unit ? `\\ ${cfg.unit}` : ''}$`;
}

/** Generic perturbations used only when a template did not provide enough distinct distractors. */
export function genericPerturbations(answer: Exact): Exact[] {
  const one = Exact.ONE;
  const out: Exact[] = [];
  const push = (x: Exact) => { if (!x.isZero() || !answer.isZero()) out.push(x); };
  push(answer.neg());
  push(answer.mulRat(2));
  push(answer.mulRat(Exact.rat(1, 2).toRat()));
  push(answer.add(one));
  push(answer.sub(one));
  push(answer.add(Exact.int(2)));
  push(answer.sub(Exact.int(2)));
  push(answer.mulRat(10));
  push(answer.mulRat(Exact.rat(1, 10).toRat()));
  push(answer.mulRat(3));
  push(answer.add(Exact.int(5)));
  if (!answer.isZero()) {
    try { push(answer.inv()); } catch { /* ignore */ }
  }
  return out;
}

/**
 * Build a lettered option list from an exact answer and candidate distractors.
 * Distractors equal to the answer or to each other are dropped; the pool is
 * shuffled so the same mistake does not always appear.
 */
export function buildOptions(rng: RNG, answer: Exact, distractors: (Exact | Distractor)[], cfg: BuildOptionsConfig = {}): Option[] {
  const count = cfg.count ?? 5;
  const seen: Exact[] = [answer];
  const chosen: Distractor[] = [];
  const isNew = (v: Exact) => Number.isFinite(v.toNumber()) && !seen.some((s) => s.equals(v));
  const candidates = rng.shuffle(distractors.map((d) => (d instanceof Exact ? { value: d } : d)));
  for (const d of candidates) {
    if (chosen.length >= count - 1) break;
    if (isNew(d.value)) { seen.push(d.value); chosen.push(d); }
  }
  for (const v of [...(cfg.fallback ?? []), ...genericPerturbations(answer)]) {
    if (chosen.length >= count - 1) break;
    if (isNew(v)) { seen.push(v); chosen.push({ value: v }); }
  }
  if (chosen.length < count - 1) throw new Error('buildOptions: could not build enough distinct options');
  const all: Option[] = [
    { key: '', display: fmt(answer, cfg), correct: true },
    ...chosen.map((d) => ({ key: '', display: fmt(d.value, cfg), correct: false, trap: d.trap })),
  ];
  return letter(rng.shuffle(all));
}

export interface SetOptionsConfig {
  count?: number;
  format?: NumberFormat;
  variable?: string;
}

function fmtSet(vals: Exact[], cfg: SetOptionsConfig): string {
  const v = cfg.variable ?? 'x';
  const sorted = vals.slice().sort((a, b) => a.cmp(b));
  return sorted.map((x) => `$${v} = ${x.toLatex({ format: cfg.format })}$`).join(' or ');
}

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

/** Options for set answers (e.g. roots of a quadratic). */
export function buildSetOptions(rng: RNG, answer: Exact[], distractors: (Exact[] | { values: Exact[]; trap?: string })[], cfg: SetOptionsConfig = {}): Option[] {
  const count = cfg.count ?? 5;
  const seen: Exact[][] = [answer];
  const chosen: { values: Exact[]; trap?: string }[] = [];
  const isNew = (v: Exact[]) => !seen.some((s) => sameSet(s, v));
  const cands = rng.shuffle(distractors.map((d) => (Array.isArray(d) ? { values: d } : d)));
  for (const d of cands) {
    if (chosen.length >= count - 1) break;
    if (isNew(d.values)) { seen.push(d.values); chosen.push(d); }
  }
  // padding: negate, shift
  const pads: Exact[][] = [
    answer.map((x) => x.neg()),
    answer.map((x) => x.add(Exact.ONE)),
    answer.map((x) => x.sub(Exact.ONE)),
    answer.map((x) => x.mulRat(2)),
    [answer[0], answer[0].neg()],
    answer.map((x) => x.add(Exact.int(2))),
  ];
  for (const p of pads) {
    if (chosen.length >= count - 1) break;
    if (isNew(p)) { seen.push(p); chosen.push({ values: p }); }
  }
  if (chosen.length < count - 1) throw new Error('buildSetOptions: not enough options');
  const all: Option[] = [
    { key: '', display: fmtSet(answer, cfg), correct: true },
    ...chosen.map((d) => ({ key: '', display: fmtSet(d.values, cfg), correct: false, trap: d.trap })),
  ];
  return letter(rng.shuffle(all));
}

/** Options for 'choice' answers: plain MathText strings. */
export function buildChoiceOptions(rng: RNG, correct: string, wrong: (string | { display: string; trap?: string })[], count = 5): Option[] {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const seen = new Set([norm(correct)]);
  const chosen: { display: string; trap?: string }[] = [];
  for (const w of rng.shuffle(wrong.map((w) => (typeof w === 'string' ? { display: w } : w)))) {
    if (chosen.length >= count - 1) break;
    const k = norm(w.display);
    if (!seen.has(k)) { seen.add(k); chosen.push(w); }
  }
  if (chosen.length < count - 1) throw new Error(`buildChoiceOptions: only ${chosen.length + 1} distinct options`);
  const all: Option[] = [{ key: '', display: correct, correct: true }, ...chosen.map((c) => ({ key: '', display: c.display, correct: false, trap: c.trap }))];
  return letter(rng.shuffle(all));
}

/**
 * Fixed-order options (not shuffled), e.g. the standard I/II/III combinations
 * where the exam always lists them in the same order.
 */
export function fixedOptions(displays: string[], correctIndex: number): Option[] {
  return letter(displays.map((d, i) => ({ key: '', display: d, correct: i === correctIndex })));
}

/** Standard option list for "which of the statements I, II, III are true" questions. */
export const STATEMENT_COMBOS = ['none of them', 'I only', 'II only', 'III only', 'I and II only', 'I and III only', 'II and III only', 'I, II and III'];

export function statementOptions(truth: [boolean, boolean, boolean]): Option[] {
  const idx = (truth[0] ? 1 : 0) + (truth[1] ? 2 : 0) + (truth[2] ? 4 : 0);
  // map bitmask → index in STATEMENT_COMBOS
  const order = [0, 1, 2, 4, 3, 5, 6, 7]; // mask 0→none,1→I,2→II,3→I&II,4→III,5→I&III,6→II&III,7→all
  return fixedOptions(STATEMENT_COMBOS, order[idx]);
}

function letter(opts: Option[]): Option[] {
  return opts.map((o, i) => ({ ...o, key: OPTION_KEYS[i] }));
}
