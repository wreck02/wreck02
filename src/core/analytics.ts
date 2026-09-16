/**
 * Analytics over the attempt log: accuracy, time distributions, pace gap,
 * weakness heatmap (topic × level), trends and session reports. Pure functions.
 */
import { PACE_SECONDS, overPace, type Attempt, type SessionSummary } from './session';
import { LEVELS, type Level, type Module } from './template';
import { TOPICS, TOPIC_BY_KEY, topicName } from './topics';
import { getTemplate } from './registry';

export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

export interface Stats {
  key: string;
  name: string;
  n: number;
  correct: number;
  accuracy: number; // 0–1, NaN if n = 0
  medianMs: number;
  p25Ms: number;
  p75Ms: number;
  /** median time minus the 89 s pace, in seconds (positive = too slow) */
  paceGapSec: number;
  overPaceCount: number;
  /** attempts wrong or over pace */
  problemCount: number;
}

function stats(key: string, name: string, xs: Attempt[]): Stats {
  const answered = xs.filter((a) => !a.skipped);
  const times = xs.map((a) => a.timeMs);
  const correct = xs.filter((a) => a.correct).length;
  const med = median(times);
  return {
    key,
    name,
    n: xs.length,
    correct,
    accuracy: xs.length ? correct / xs.length : NaN,
    medianMs: med,
    p25Ms: percentile(times, 0.25),
    p75Ms: percentile(times, 0.75),
    paceGapSec: xs.length ? med / 1000 - PACE_SECONDS : NaN,
    overPaceCount: xs.filter(overPace).length,
    problemCount: xs.filter((a) => !a.correct || overPace(a)).length + (xs.length - answered.length) * 0,
  };
}

export function groupBy<K extends string>(xs: Attempt[], key: (a: Attempt) => K): Map<K, Attempt[]> {
  const m = new Map<K, Attempt[]>();
  for (const a of xs) {
    const k = key(a);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(a);
  }
  return m;
}

export function topicStats(attempts: Attempt[], module?: Module | 'ALL'): Stats[] {
  const filtered = module && module !== 'ALL' ? attempts.filter((a) => a.module === module) : attempts;
  const groups = groupBy(filtered, (a) => a.topic);
  return TOPICS.filter((t) => !module || module === 'ALL' || t.module === module)
    .filter((t) => groups.has(t.key))
    .map((t) => stats(t.key, t.name, groups.get(t.key)!));
}

export function templateStats(attempts: Attempt[], topic?: string): Stats[] {
  const filtered = topic ? attempts.filter((a) => a.topic === topic) : attempts;
  const groups = groupBy(filtered, (a) => a.templateId);
  return [...groups.entries()]
    .map(([id, xs]) => stats(id, getTemplate(id)?.title ?? id, xs))
    .sort((a, b) => (isNaN(a.accuracy) ? 1 : a.accuracy) - (isNaN(b.accuracy) ? 1 : b.accuracy));
}

export interface HeatCell {
  topic: string;
  level: Level;
  n: number;
  accuracy: number;
  medianMs: number;
  /** 0 (weak) … 1 (strong); NaN when no data. Combines accuracy with pace. */
  score: number;
}

/** Strength score: accuracy, discounted when the median time is over pace. */
export function strengthScore(accuracy: number, medianMs: number): number {
  if (isNaN(accuracy)) return NaN;
  const paceFactor = isNaN(medianMs) ? 1 : Math.min(1, (PACE_SECONDS * 1000) / Math.max(1, medianMs));
  return accuracy * (0.6 + 0.4 * paceFactor);
}

export function heatmap(attempts: Attempt[], module?: Module | 'ALL'): { topics: string[]; cells: HeatCell[] } {
  const topics = TOPICS.filter((t) => !module || module === 'ALL' || t.module === module).map((t) => t.key);
  const cells: HeatCell[] = [];
  for (const topic of topics) {
    for (const level of LEVELS) {
      const xs = attempts.filter((a) => a.topic === topic && a.level === level);
      const correct = xs.filter((a) => a.correct).length;
      const acc = xs.length ? correct / xs.length : NaN;
      const med = median(xs.map((a) => a.timeMs));
      cells.push({ topic, level, n: xs.length, accuracy: acc, medianMs: med, score: strengthScore(acc, med) });
    }
  }
  return { topics, cells };
}

/** Attempts grouped by session, oldest first, as accuracy points for a trend line. */
export function trend(attempts: Attempt[], filter?: (a: Attempt) => boolean): { sessionId: string; at: number; accuracy: number; medianMs: number; n: number }[] {
  const xs = filter ? attempts.filter(filter) : attempts;
  const bySession = groupBy(xs, (a) => a.sessionId);
  return [...bySession.entries()]
    .map(([sessionId, as]) => ({
      sessionId,
      at: Math.min(...as.map((a) => a.at)),
      accuracy: as.filter((a) => a.correct).length / as.length,
      medianMs: median(as.map((a) => a.timeMs)),
      n: as.length,
    }))
    .sort((a, b) => a.at - b.at);
}

/** Histogram of times in buckets of `bucketSec` seconds. */
export function timeDistribution(attempts: Attempt[], bucketSec = 15, maxSec = 180): { fromSec: number; toSec: number; count: number }[] {
  const nb = Math.ceil(maxSec / bucketSec);
  const counts = new Array(nb + 1).fill(0);
  for (const a of attempts) {
    const b = Math.min(nb, Math.floor(a.timeMs / 1000 / bucketSec));
    counts[b]++;
  }
  return counts.map((count, i) => ({ fromSec: i * bucketSec, toSec: i === nb ? Infinity : (i + 1) * bucketSec, count }));
}

export interface SessionReport {
  summary: SessionSummary;
  attempts: Attempt[];
  scorePct: number;
  avgSec: number;
  medianSec: number;
  overPaceCount: number;
  slowest: Attempt[];
  /** topics with the most wrong/over-pace questions in this session */
  topicsToDrill: { topic: string; name: string; problems: number; n: number }[];
  byTopic: Stats[];
}

export function sessionReport(summary: SessionSummary, attempts: Attempt[]): SessionReport {
  const xs = attempts.filter((a) => a.sessionId === summary.id).sort((a, b) => a.index - b.index);
  const problems = groupBy(xs.filter((a) => !a.correct || overPace(a)), (a) => a.topic);
  const totals = groupBy(xs, (a) => a.topic);
  const topicsToDrill = [...problems.entries()]
    .map(([topic, ps]) => ({ topic, name: topicName(topic), problems: ps.length, n: totals.get(topic)!.length }))
    .sort((a, b) => b.problems - a.problems)
    .slice(0, 5);
  return {
    summary,
    attempts: xs,
    scorePct: xs.length ? Math.round((100 * xs.filter((a) => a.correct).length) / xs.length) : 0,
    avgSec: xs.length ? xs.reduce((s, a) => s + a.timeMs, 0) / 1000 / xs.length : 0,
    medianSec: xs.length ? median(xs.map((a) => a.timeMs)) / 1000 : 0,
    overPaceCount: xs.filter(overPace).length,
    slowest: xs.slice().sort((a, b) => b.timeMs - a.timeMs).slice(0, 5),
    topicsToDrill,
    byTopic: [...totals.entries()].map(([topic, as]) => stats(topic, topicName(topic), as)),
  };
}

/** Topics ranked weakest first (needs at least `minN` attempts). */
export function weakestTopics(attempts: Attempt[], minN = 3, limit = 5): Stats[] {
  return topicStats(attempts)
    .filter((s) => s.n >= minN)
    .sort((a, b) => strengthScore(a.accuracy, a.medianMs) - strengthScore(b.accuracy, b.medianMs))
    .slice(0, limit);
}

export function moduleOfTopic(topic: string): Module | undefined {
  return TOPIC_BY_KEY[topic]?.module;
}

export function formatSec(ms: number): string {
  if (!Number.isFinite(ms)) return '–';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
