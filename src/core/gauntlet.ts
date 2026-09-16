/**
 * Gauntlet: adaptive levelling. Start at level 2; move up after 5 consecutive
 * correct answers under pace, move down after 2 consecutive wrong. Track the
 * highest *sustained* level (a level counts as sustained once you have answered
 * 5 correct under pace at it) per topic.
 */
import { PACE_SECONDS } from './session';
import type { Level } from './template';
import { load, save, KEYS } from './storage';

export const GAUNTLET_START: Level = 2;
export const UP_AFTER = 5;
export const DOWN_AFTER = 2;

export interface GauntletState {
  level: Level;
  streakCorrect: number;
  streakWrong: number;
  peak: Level;
  /** highest level at which UP_AFTER correct under pace were achieved */
  sustained: Level | 0;
  answered: number;
}

export function initialGauntlet(start: Level = GAUNTLET_START): GauntletState {
  return { level: start, streakCorrect: 0, streakWrong: 0, peak: start, sustained: 0, answered: 0 };
}

export interface GauntletStep {
  state: GauntletState;
  moved: 'up' | 'down' | null;
}

export function gauntletStep(s: GauntletState, correct: boolean, timeMs: number): GauntletStep {
  const underPace = timeMs <= PACE_SECONDS * 1000;
  const next: GauntletState = { ...s, answered: s.answered + 1 };
  let moved: 'up' | 'down' | null = null;
  if (correct && underPace) {
    next.streakCorrect += 1;
    next.streakWrong = 0;
    if (next.streakCorrect >= UP_AFTER) {
      next.sustained = Math.max(next.sustained, next.level) as Level;
      if (next.level < 5) { next.level = (next.level + 1) as Level; moved = 'up'; }
      next.streakCorrect = 0;
    }
  } else if (!correct) {
    next.streakWrong += 1;
    next.streakCorrect = 0;
    if (next.streakWrong >= DOWN_AFTER) {
      if (next.level > 1) { next.level = (next.level - 1) as Level; moved = 'down'; }
      next.streakWrong = 0;
    }
  } else {
    // correct but over pace: does not advance the streak, does not count as wrong
    next.streakCorrect = 0;
  }
  next.peak = Math.max(next.peak, next.level) as Level;
  return { state: next, moved };
}

/** Persistent record of the highest sustained level per topic. */
export type GauntletRecords = Record<string, { sustained: Level; peak: Level; at: number; runs: number }>;

export function loadGauntletRecords(): GauntletRecords {
  return load<GauntletRecords>(KEYS.gauntlet, {});
}

export function updateGauntletRecord(records: GauntletRecords, topicKey: string, state: GauntletState, at = Date.now()): GauntletRecords {
  const prev = records[topicKey];
  const sustained = Math.max(prev?.sustained ?? 0, state.sustained) as Level;
  const peak = Math.max(prev?.peak ?? 0, state.peak) as Level;
  records[topicKey] = { sustained: (sustained || 1) as Level, peak, at, runs: (prev?.runs ?? 0) + 1 };
  save(KEYS.gauntlet, records);
  return records;
}
