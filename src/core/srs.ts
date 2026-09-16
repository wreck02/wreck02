/**
 * Error ledger + spaced repetition over templates.
 *
 * Every wrong or over-pace attempt raises a template's "due weight"; correct,
 * on-pace answers in review lower it. Recent failures count more than old ones.
 * Review sessions sample templates proportionally to weight.
 */
import { overPace, type Attempt } from './session';
import { load, save, KEYS } from './storage';
import { getTemplate } from './registry';

export interface LedgerEntry {
  templateId: string;
  /** timestamps of failures (wrong or over pace), most recent last, capped */
  failures: number[];
  /** timestamps of clean successes (correct and on pace), capped */
  successes: number[];
  /** next time this template should be reviewed (epoch ms) */
  dueAt: number;
  /** current interval in hours */
  intervalHours: number;
  lastSeenAt: number;
}

export type Ledger = Record<string, LedgerEntry>;

const MAX_HISTORY = 20;
const HOUR = 3600 * 1000;
const HALF_LIFE_DAYS = 7;

export function loadLedger(): Ledger {
  return load<Ledger>(KEYS.srs, {});
}

export function saveLedger(l: Ledger): void {
  save(KEYS.srs, l);
}

function entry(l: Ledger, id: string, now: number): LedgerEntry {
  return (l[id] ??= { templateId: id, failures: [], successes: [], dueAt: now, intervalHours: 4, lastSeenAt: 0 });
}

/** Update the ledger from a batch of attempts (call once per finished session). */
export function recordAttempts(l: Ledger, attempts: Attempt[], now = Date.now()): Ledger {
  for (const a of attempts) {
    const e = entry(l, a.templateId, a.at || now);
    const failed = a.skipped || !a.correct || overPace(a);
    e.lastSeenAt = a.at || now;
    if (failed) {
      e.failures = [...e.failures, a.at || now].slice(-MAX_HISTORY);
      e.intervalHours = 4;
      e.dueAt = (a.at || now) + 4 * HOUR;
    } else {
      e.successes = [...e.successes, a.at || now].slice(-MAX_HISTORY);
      // only review-mode successes grow the interval; drills merely count
      if (a.mode === 'review') {
        e.intervalHours = Math.min(24 * 30, e.intervalHours * 2.5);
        e.dueAt = (a.at || now) + e.intervalHours * HOUR;
      }
    }
  }
  return l;
}

/**
 * Weight of a template for review sampling: recency-decayed failures, minus a
 * smaller credit for recency-decayed successes, boosted when overdue.
 */
export function reviewWeight(e: LedgerEntry, now = Date.now()): number {
  const decay = (t: number) => Math.pow(0.5, (now - t) / (HALF_LIFE_DAYS * 24 * HOUR));
  const fail = e.failures.reduce((s, t) => s + decay(t), 0);
  const succ = e.successes.reduce((s, t) => s + decay(t), 0);
  const base = Math.max(0, fail - 0.5 * succ);
  if (base === 0) return 0;
  const overdue = now >= e.dueAt ? 1 + Math.min(2, (now - e.dueAt) / (24 * HOUR)) : 0.3;
  return base * overdue;
}

export interface ReviewItem {
  templateId: string;
  title: string;
  topic: string;
  weight: number;
  failures: number;
  successes: number;
  lastFailedAt: number | null;
  dueAt: number;
  due: boolean;
}

/** Templates that have ever been failed, heaviest first. */
export function reviewQueue(l: Ledger, now = Date.now()): ReviewItem[] {
  return Object.values(l)
    .filter((e) => e.failures.length > 0 && getTemplate(e.templateId))
    .map((e) => {
      const t = getTemplate(e.templateId)!;
      return {
        templateId: e.templateId,
        title: t.title,
        topic: t.topic,
        weight: reviewWeight(e, now),
        failures: e.failures.length,
        successes: e.successes.length,
        lastFailedAt: e.failures.length ? e.failures[e.failures.length - 1] : null,
        dueAt: e.dueAt,
        due: now >= e.dueAt,
      };
    })
    .filter((i) => i.weight > 0)
    .sort((a, b) => b.weight - a.weight);
}

/** Weights map for pickTemplateSequence. */
export function reviewWeights(l: Ledger, now = Date.now()): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of reviewQueue(l, now)) out[i.templateId] = i.weight;
  return out;
}

export function clearLedgerEntry(l: Ledger, id: string): Ledger {
  delete l[id];
  return l;
}
