/**
 * Session engine: builds reproducible question lists for every mode and scores attempts.
 * Pure functions only; persistence lives in storage.ts and the UI in src/ui.
 */
import { RNG, questionSeed } from './rng';
import { generateQuestion, templatesFor, TEMPLATES, getTemplate } from './registry';
import type { Level, Module, Question, Template } from './template';

export type Mode = 'drill' | 'sprint' | 'sim' | 'gauntlet' | 'review';
export type AnswerMode = 'typed' | 'mc';
export type LevelChoice = Level | 'mixed';

export const PACE_SECONDS = 89; // 40 minutes / 27 questions
export const SIM_QUESTIONS = 27;
export const SIM_SECONDS = 40 * 60;
export const SPRINT_QUESTIONS = 10;
export const SPRINT_SECONDS = 5 * 60;

export interface SessionConfig {
  mode: Mode;
  seed: string;
  module: Module | 'ALL';
  /** empty = every topic in the module */
  topics: string[];
  /** explicit template pool (review mode); overrides module/topics when non-empty */
  templateIds?: string[];
  /** template weights for review mode (spaced repetition) */
  weights?: Record<string, number>;
  level: LevelChoice;
  count: number;
  answerMode: AnswerMode;
  timed: boolean;
  /** whole-session limit in seconds (sim 2400, sprint 300); undefined = none */
  timeLimitSec?: number;
  /** drill: reveal the answer immediately after each question; sim: only at the end */
  immediateFeedback: boolean;
  allowSkip: boolean;
}

export interface QuestionRecord {
  index: number;
  seed: string;
  question: Question;
}

export interface Attempt {
  id: string;
  sessionId: string;
  sessionSeed: string;
  mode: Mode;
  index: number;
  templateId: string;
  module: Module;
  topic: string;
  level: Level;
  correct: boolean;
  skipped: boolean;
  timedOut: boolean;
  timeMs: number;
  given: string;
  answerMode: AnswerMode;
  at: number;
  questionSeed: string;
  stem: string;
  answerText: string;
}

export interface SessionSummary {
  id: string;
  seed: string;
  mode: Mode;
  module: Module | 'ALL';
  topics: string[];
  level: LevelChoice;
  answerMode: AnswerMode;
  startedAt: number;
  finishedAt: number;
  count: number;
  correct: number;
  skipped: number;
  totalTimeMs: number;
  /** highest gauntlet level reached (gauntlet only) */
  peakLevel?: Level;
  /** full config so the session can be replayed or its questions regenerated */
  config: SessionConfig;
}

/** Level mix used when 'mixed' is chosen: weighted towards the middle. */
export const MIXED_LEVEL_WEIGHTS: Record<Level, number> = { 1: 1, 2: 3, 3: 4, 4: 3, 5: 1 };

export function drawLevel(rng: RNG, choice: LevelChoice): Level {
  if (choice !== 'mixed') return choice;
  return rng.weighted([1, 2, 3, 4, 5] as Level[], [1, 2, 3, 4, 5].map((l) => MIXED_LEVEL_WEIGHTS[l as Level]));
}

/** Template pool for a config. */
export function poolFor(config: Pick<SessionConfig, 'module' | 'topics' | 'templateIds'>): Template[] {
  if (config.templateIds && config.templateIds.length > 0) {
    const ids = new Set(config.templateIds);
    const pool = TEMPLATES.filter((t) => ids.has(t.id));
    if (pool.length > 0) return pool;
  }
  const pool = templatesFor({ module: config.module, topics: config.topics });
  return pool.length > 0 ? pool : [...TEMPLATES];
}

/**
 * Choose a sequence of templates that spreads across topics: cycle through a
 * shuffled pool, reshuffling each pass, and avoid the same template twice in a row.
 * With weights (review mode), sample proportionally instead.
 */
export function pickTemplateSequence(rng: RNG, pool: Template[], count: number, weights?: Record<string, number>): Template[] {
  if (pool.length === 0) throw new Error('empty template pool');
  const out: Template[] = [];
  if (weights && Object.keys(weights).length > 0) {
    const w = pool.map((t) => Math.max(0.05, weights[t.id] ?? 0.05));
    let last: Template | null = null;
    for (let i = 0; i < count; i++) {
      let t = rng.weighted(pool, w);
      if (pool.length > 1 && t === last) t = rng.weighted(pool, w);
      out.push(t);
      last = t;
    }
    return out;
  }
  // topic-balanced: rotate through topics, cycling through each topic's templates
  const byTopic = new Map<string, Template[]>();
  for (const t of pool) {
    if (!byTopic.has(t.topic)) byTopic.set(t.topic, []);
    byTopic.get(t.topic)!.push(t);
  }
  let topics = rng.shuffle([...byTopic.keys()]);
  const cursors = new Map<string, Template[]>();
  let last: Template | null = null;
  for (let i = 0; i < count; i++) {
    const topic = topics[i % topics.length];
    let queue = cursors.get(topic);
    if (!queue || queue.length === 0) {
      queue = rng.shuffle(byTopic.get(topic)!);
      cursors.set(topic, queue);
    }
    let t = queue.shift()!;
    if (t === last && pool.length > 1) {
      const alt = queue.shift();
      if (alt) { queue.push(t); t = alt; }
    }
    out.push(t);
    last = t;
    if ((i + 1) % topics.length === 0 && topics.length > 1) {
      topics = rng.shuffle(topics);
      // never start the next pass with the topic that just ended this one
      if (topics[0] === topic) topics.push(topics.shift()!);
    }
  }
  return out;
}

/** Generate question `index` of a session from its seed (reproducible). */
export function makeQuestion(config: SessionConfig, index: number, template: Template, level: Level): QuestionRecord {
  const seed = questionSeed(config.seed, index);
  const question = generateQuestion(template, new RNG(seed), level);
  return { index, seed, question };
}

/** Build every question of a fixed-length session up front. */
export function buildSession(config: SessionConfig): QuestionRecord[] {
  const rng = new RNG(`${config.seed}:plan`);
  const pool = poolFor(config);
  const seq = pickTemplateSequence(rng, pool, config.count, config.weights);
  return seq.map((t, i) => makeQuestion(config, i, t, drawLevel(rng.child(`level${i}`), config.level)));
}

/** Presets for the built-in modes. */
export function presetConfig(mode: Mode, seed: string, overrides: Partial<SessionConfig> = {}): SessionConfig {
  const base: SessionConfig = {
    mode,
    seed,
    module: 'ALL',
    topics: [],
    level: 'mixed',
    count: 10,
    answerMode: 'mc',
    timed: true,
    immediateFeedback: true,
    allowSkip: true,
  };
  switch (mode) {
    case 'drill':
      return { ...base, timed: false, count: 10, ...overrides };
    case 'sprint':
      return { ...base, count: SPRINT_QUESTIONS, timeLimitSec: SPRINT_SECONDS, ...overrides };
    case 'sim':
      return { ...base, count: SIM_QUESTIONS, timeLimitSec: SIM_SECONDS, answerMode: 'mc', immediateFeedback: false, ...overrides };
    case 'gauntlet':
      return { ...base, level: 2, count: 30, ...overrides };
    case 'review':
      return { ...base, count: 10, timed: false, ...overrides };
  }
}

export function newSessionId(seed: string, startedAt: number): string {
  return `${seed}-${startedAt.toString(36)}`;
}

export function summarise(config: SessionConfig, id: string, startedAt: number, finishedAt: number, attempts: Attempt[], peakLevel?: Level): SessionSummary {
  return {
    id,
    seed: config.seed,
    mode: config.mode,
    module: config.module,
    topics: config.topics,
    level: config.level,
    answerMode: config.answerMode,
    startedAt,
    finishedAt,
    count: attempts.length,
    correct: attempts.filter((a) => a.correct).length,
    skipped: attempts.filter((a) => a.skipped).length,
    totalTimeMs: attempts.reduce((s, a) => s + a.timeMs, 0),
    peakLevel,
    config,
  };
}

/** Rebuild the exact question an attempt was about (from its template, seed and level). */
export function regenerateFromAttempt(a: Pick<Attempt, 'templateId' | 'questionSeed' | 'level'>): Question | null {
  const t = getTemplate(a.templateId);
  if (!t) return null;
  return generateQuestion(t, new RNG(a.questionSeed), a.level);
}

/** Whether an attempt counts as "over pace" (slower than the exam's 89 s per question). */
export function overPace(a: Pick<Attempt, 'timeMs'>): boolean {
  return a.timeMs > PACE_SECONDS * 1000;
}
