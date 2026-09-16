/**
 * Per-card progress for the Facts drill, persisted under KEYS.facts as
 * `{ [cardId]: FactStat }`. Pure functions over that map plus thin load/save
 * wrappers, and the draw weights that make weak cards come back more often.
 */
import { ALL_FACTS, type FactCard } from './facts';
import type { RNG } from './rng';
import { KEYS, load, save } from './storage';

export interface FactStat {
  /** attempts */
  seen: number;
  correct: number;
  /** consecutive correct answers, most recent first; 0 after a miss */
  streak: number;
  /** epoch ms of the last attempt */
  lastSeen: number;
  /** median of the most recent answer times, ms */
  medianMs?: number;
  /** extra draw weight at the time of the last attempt (see weightOf) */
  weight: number;
  /** most recent answer times, ms, oldest first (capped) */
  times?: number[];
}

export type FactProgress = Record<string, FactStat>;

/** A card is weak until it has been answered correctly this many times running… */
export const WEAK_STREAK = 2;
/** …and its accuracy is at least this. */
export const WEAK_ACCURACY = 0.7;
/** Recall target per card, ms. */
export const FACT_TARGET_MS = 5000;

const MAX_TIMES = 10;
const DAY = 86400000;

// ---- persistence ------------------------------------------------------------

export function loadFactProgress(): FactProgress {
  const p = load<unknown>(KEYS.facts, {});
  return p && typeof p === 'object' && !Array.isArray(p) ? (p as FactProgress) : {};
}

export function saveFactProgress(p: FactProgress): void {
  save(KEYS.facts, p);
}

// ---- per-card measures ------------------------------------------------------

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** 0–1, NaN when never seen. */
export function accuracyOf(s: FactStat | undefined): number {
  return s && s.seen > 0 ? s.correct / s.seen : NaN;
}

/** Weak: never seen, streak under WEAK_STREAK, or accuracy under WEAK_ACCURACY. */
export function isWeak(s: FactStat | undefined): boolean {
  if (!s || s.seen === 0) return true;
  return s.streak < WEAK_STREAK || s.correct / s.seen < WEAK_ACCURACY;
}

/**
 * Extra draw weight for drawFacts (which uses 1 + weight): 0 for a mastered,
 * quick, recently seen card; up to about 10 for one that is wrong, slow and stale.
 * Unseen cards get 2, so they come up three times as often as mastered ones.
 */
export function weightOf(s: FactStat | undefined, now = Date.now()): number {
  if (!s || s.seen === 0) return 2;
  const acc = s.correct / s.seen;
  let w = 4 * (1 - acc);
  if (s.streak < WEAK_STREAK) w += WEAK_STREAK - s.streak;
  if (s.medianMs !== undefined && Number.isFinite(s.medianMs) && s.medianMs > FACT_TARGET_MS) {
    w += Math.min(2, (s.medianMs - FACT_TARGET_MS) / FACT_TARGET_MS);
  }
  const days = (now - s.lastSeen) / DAY;
  if (days > 7) w += Math.min(2, (days - 7) / 7);
  return Math.round(w * 100) / 100;
}

/** Weights map for drawFacts, covering every card given (unseen cards included). */
export function factWeights(progress: FactProgress, cards: readonly FactCard[] = ALL_FACTS, now = Date.now()): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of cards) out[c.id] = weightOf(progress[c.id], now);
  return out;
}

// ---- updates ----------------------------------------------------------------

/** Pure update: one attempt at a card. */
export function applyFact(progress: FactProgress, cardId: string, correct: boolean, timeMs: number, now = Date.now()): FactProgress {
  const prev = progress[cardId];
  const times = [...(prev?.times ?? []), Math.max(0, Math.round(timeMs))].slice(-MAX_TIMES);
  const next: FactStat = {
    seen: (prev?.seen ?? 0) + 1,
    correct: (prev?.correct ?? 0) + (correct ? 1 : 0),
    streak: correct ? (prev?.streak ?? 0) + 1 : 0,
    lastSeen: now,
    medianMs: median(times),
    weight: 0,
    times,
  };
  next.weight = weightOf(next, now);
  return { ...progress, [cardId]: next };
}

/** Record one result and persist it. Returns the new progress map. */
export function recordFact(cardId: string, correct: boolean, timeMs: number, now = Date.now()): FactProgress {
  const next = applyFact(loadFactProgress(), cardId, correct, timeMs, now);
  saveFactProgress(next);
  return next;
}

/** Pure: forget the given cards. */
export function resetFacts(progress: FactProgress, cardIds: Iterable<string>): FactProgress {
  const drop = new Set(cardIds);
  const out: FactProgress = {};
  for (const [id, s] of Object.entries(progress)) if (!drop.has(id)) out[id] = s;
  return out;
}

/** Forget the given cards and persist. Returns the new progress map. */
export function resetFactProgress(cardIds: Iterable<string>): FactProgress {
  const next = resetFacts(loadFactProgress(), cardIds);
  saveFactProgress(next);
  return next;
}

// ---- summaries --------------------------------------------------------------

export interface DeckProgress {
  cards: number;
  /** cards attempted at least once */
  seenCards: number;
  attempts: number;
  correct: number;
  /** 0–1 over all attempts, NaN when none */
  accuracy: number;
  /** weak cards, unseen ones included */
  weak: number;
}

export function deckProgress(progress: FactProgress, cards: readonly FactCard[]): DeckProgress {
  let seenCards = 0, attempts = 0, correct = 0, weak = 0;
  for (const c of cards) {
    const s = progress[c.id];
    if (s && s.seen > 0) { seenCards++; attempts += s.seen; correct += s.correct; }
    if (isWeak(s)) weak++;
  }
  return { cards: cards.length, seenCards, attempts, correct, accuracy: attempts ? correct / attempts : NaN, weak };
}

export function weakCards(progress: FactProgress, cards: readonly FactCard[]): FactCard[] {
  return cards.filter((c) => isWeak(progress[c.id]));
}

/**
 * Weighted draw without replacement from an explicit pool, the same scheme as
 * drawFacts (which always draws from whole decks). Used for "weak cards only".
 */
export function drawWeighted(rng: RNG, pool: readonly FactCard[], n: number, weights: Record<string, number>): FactCard[] {
  const out: FactCard[] = [];
  const remaining = pool.slice();
  while (out.length < n && remaining.length > 0) {
    const w = remaining.map((c) => 1 + Math.max(0, weights[c.id] ?? 0));
    const c = rng.weighted(remaining, w);
    out.push(c);
    remaining.splice(remaining.indexOf(c), 1);
  }
  return out;
}
