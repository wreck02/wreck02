/**
 * Template and question types shared by every generator, the session engine and the UI.
 */
import type { Exact, NumberFormat } from './exact';
import type { RNG } from './rng';

export type Level = 1 | 2 | 3 | 4 | 5;
export const LEVELS: Level[] = [1, 2, 3, 4, 5];

export type Module = 'M1' | 'M2' | 'PHY';

export const MODULE_NAMES: Record<Module, string> = {
  M1: 'Mathematics 1',
  M2: 'Mathematics 2',
  PHY: 'Physics',
};

/**
 * Answer kinds:
 *  - exact:  a single exact value (typed input is parsed and compared structurally)
 *  - set:    an unordered set of exact values, e.g. the two roots of a quadratic
 *  - choice: the correct option is a piece of text/LaTeX (statements, expressions,
 *            units, equations of lines). Typed mode falls back to the option list.
 */
export type Answer =
  | { kind: 'exact'; value: Exact; format?: NumberFormat; unit?: string }
  | { kind: 'set'; values: Exact[]; format?: NumberFormat; unit?: string; variable?: string }
  | { kind: 'choice'; value: string };

export interface Option {
  /** A–H */
  key: string;
  /** MathText: plain text with $...$ inline maths. */
  display: string;
  correct: boolean;
  /** Optional one-line explanation of the mistake this distractor represents. */
  trap?: string;
}

export interface Question {
  templateId: string;
  module: Module;
  topic: string;
  level: Level;
  /** MathText stem. One clear ask. */
  stem: string;
  answer: Answer;
  /** 5–8 options, exactly one correct. */
  options: Option[];
  /** Worked solution: fastest mental route (MathText, may use \n for line breaks). */
  solution: string;
  /** One line on the common trap the distractors were built from. */
  trap: string;
  tags: string[];
  /** Parameters used by verify(); also useful for debugging. Must be JSON-serialisable. */
  params: Record<string, unknown>;
  /** Whether a typed answer makes sense (false for choice questions). */
  typedAllowed: boolean;
}

/** What a template's generate() returns; the registry fills in the identifying fields. */
export type Generated = Omit<Question, 'templateId' | 'module' | 'topic' | 'level'>;

export interface Template {
  /** Unique id such as "m1.surds.simplify-root". Convention: module.topic.slug */
  id: string;
  module: Module;
  /** Topic key (see topics.ts) */
  topic: string;
  /** Short human name shown in analytics. */
  title: string;
  /** What each level's parameter ranges look like, e.g. { 1: "√12, √18", 5: "(2+√3)/(1−√3)" } */
  levels: Partial<Record<Level, string>>;
  /** Generate one question. Must loop internally until the clean-number rule is met. */
  generate: (rng: RNG, level: Level) => Generated;
  /** Recompute the answer a second, independent way. Returns true if it agrees. */
  verify: (q: Question) => boolean;
}

export function defineTemplate(t: Template): Template {
  return t;
}

/** Utility: try `attempt` until it returns non-null (the template's rejection loop). */
export function retry<T>(rng: RNG, attempt: (rng: RNG) => T | null, maxTries = 400): T {
  for (let i = 0; i < maxTries; i++) {
    const r = attempt(rng);
    if (r !== null && r !== undefined) return r;
  }
  throw new Error(`template gave up after ${maxTries} attempts`);
}

/** Clamp any number into a Level. */
export function toLevel(n: number): Level {
  return Math.min(5, Math.max(1, Math.round(n))) as Level;
}
