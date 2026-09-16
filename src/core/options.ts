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
export type { Option };
import { isCleanExact } from './clean';

export const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export interface Distractor {
  value: Exact;
  trap?: string;
  /**
   * Mark the headline mistakes a question is really testing. `must` distractors are
   * considered before the rest, so the option list always offers the trap the question
   * is built around instead of losing it to the shuffle.
   */
  must?: boolean;
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

/**
 * Generic perturbations, used only when a template did not provide enough distinct
 * distractors (a smell: give better ones). They stay on the same side of zero as the
 * answer, because a negative length or a negative probability is eliminated on sight,
 * and they alternate above and below so padding does not bias the answer's position.
 */
export function genericPerturbations(answer: Exact): Exact[] {
  const one = Exact.ONE;
  const sign = answer.sign();
  const out: Exact[] = [];
  const half = Exact.rat(1, 2).toRat();
  const tenth = Exact.rat(1, 10).toRat();
  const push = (x: Exact) => {
    if (!Number.isFinite(x.toNumber())) return;
    // keep the sign of the answer: a padded option must still look like a possible answer
    if (sign !== 0 && x.sign() !== 0 && x.sign() !== sign) return;
    out.push(x);
  };
  // alternate larger / smaller so the answer does not end up systematically extreme
  push(answer.mulRat(2));
  push(answer.mulRat(half));
  push(answer.add(one));
  push(answer.sub(one));
  push(answer.mulRat(10));
  push(answer.mulRat(tenth));
  push(answer.add(Exact.int(2)));
  push(answer.sub(Exact.int(2)));
  push(answer.mulRat(3));
  push(answer.add(Exact.int(5)));
  push(answer.sub(Exact.int(5)));
  if (sign === 0) out.push(one, Exact.int(2), Exact.int(-1), Exact.int(-2));
  else if (!answer.isZero()) {
    try { push(answer.inv()); } catch { /* not invertible */ }
    // the negation is the last resort: it is the least plausible padding
    out.push(answer.neg());
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
  // Distractors must be exam-plausible numbers too: drop anything failing the clean-number rule.
  const isNew = (v: Exact) => Number.isFinite(v.toNumber()) && isCleanExact(v).ok && !seen.some((s) => s.equals(v));
  const candidates = rng.shuffle(distractors.map((d) => (d instanceof Exact ? { value: d } : d)));
  // Headline traps first (in their own shuffled order), then everything else.
  for (const d of [...candidates.filter((c) => c.must), ...candidates.filter((c) => !c.must)]) {
    if (chosen.length >= count - 1) break;
    if (isNew(d.value)) { seen.push(d.value); chosen.push(d); }
  }
  for (const v of [...(cfg.fallback ?? []), ...genericPerturbations(answer)]) {
    if (chosen.length >= count - 1) break;
    if (isNew(v)) { seen.push(v); chosen.push({ value: v }); }
  }
  if (chosen.length < count - 1) throw new Error('buildOptions: could not build enough distinct options');
  const all: Option[] = [
    { key: '', display: fmt(answer, cfg), correct: true, value: answer },
    ...chosen.map((d) => ({ key: '', display: fmt(d.value, cfg), correct: false, trap: d.trap, value: d.value })),
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
export function buildSetOptions(rng: RNG, answer: Exact[], distractors: (Exact[] | { values: Exact[]; trap?: string; must?: boolean })[], cfg: SetOptionsConfig = {}): Option[] {
  const count = cfg.count ?? 5;
  const seen: Exact[][] = [answer];
  const chosen: { values: Exact[]; trap?: string }[] = [];
  const isNew = (v: Exact[]) => v.every((x) => isCleanExact(x).ok) && !seen.some((s) => sameSet(s, v));
  const shuffled = rng.shuffle(distractors.map((d) => (Array.isArray(d) ? { values: d } : d)));
  const cands = [...shuffled.filter((c) => c.must), ...shuffled.filter((c) => !c.must)];
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
    { key: '', display: fmtSet(answer, cfg), correct: true, values: answer },
    ...chosen.map((d) => ({ key: '', display: fmtSet(d.values, cfg), correct: false, trap: d.trap, values: d.values })),
  ];
  return letter(rng.shuffle(all));
}

/** Options for 'choice' answers: plain MathText strings. */
export function buildChoiceOptions(
  rng: RNG,
  correct: string,
  wrong: (string | { display: string; trap?: string; must?: boolean; key?: string })[],
  count = 5,
): Option[] {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const seen = new Set([norm(correct)]);
  const chosen: { display: string; trap?: string }[] = [];
  const shuffled = rng.shuffle(wrong.map((w) => (typeof w === 'string' ? { display: w } : w)));
  for (const w of [...shuffled.filter((c) => c.must), ...shuffled.filter((c) => !c.must)]) {
    if (chosen.length >= count - 1) break;
    // `key` lets a template declare that two differently written options mean the same
    // value (e.g. "ln 24" and "ln 4 + ln 6"), so only one of them can be offered.
    const k = w.key ? `k:${norm(w.key)}` : norm(w.display);
    if (!seen.has(k) && !seen.has(norm(w.display))) { seen.add(k); seen.add(norm(w.display)); chosen.push(w); }
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
