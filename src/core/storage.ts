/**
 * localStorage persistence. Everything the app remembers lives under the `esat.` prefix
 * and is plain JSON, so it can be exported, inspected or deleted freely.
 */
import type { Attempt, SessionSummary, AnswerMode } from './session';
import type { Level } from './template';

const PREFIX = 'esat.';
const VERSION = 'v1';

export const KEYS = {
  settings: `${PREFIX}settings.${VERSION}`,
  attempts: `${PREFIX}attempts.${VERSION}`,
  sessions: `${PREFIX}sessions.${VERSION}`,
  srs: `${PREFIX}srs.${VERSION}`,
  gauntlet: `${PREFIX}gauntlet.${VERSION}`,
  facts: `${PREFIX}facts.${VERSION}`,
  inProgress: `${PREFIX}inprogress.${VERSION}`,
} as const;

export interface Settings {
  defaultLevel: Level | 'mixed';
  answerMode: AnswerMode;
  showTimer: boolean;
  theme: 'system' | 'light' | 'dark';
  /** seconds per question used for the drill timer when "timed" is on */
  drillSecondsPerQuestion: number;
  soundOn: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  defaultLevel: 'mixed',
  answerMode: 'mc',
  showTimer: true,
  theme: 'system',
  drillSecondsPerQuestion: 89,
  soundOn: false,
};

const MAX_ATTEMPTS = 10000;
const MAX_SESSIONS = 500;

// A memory fallback keeps the app working when localStorage is unavailable (private mode, tests).
const memory = new Map<string, string>();

function backend(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  try {
    if (typeof localStorage !== 'undefined') {
      const probe = `${PREFIX}probe`;
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return localStorage;
    }
  } catch {
    /* fall through */
  }
  return {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => void memory.set(k, v),
    removeItem: (k) => void memory.delete(k),
  };
}

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = backend().getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function save<T>(key: string, value: T): void {
  try {
    backend().setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('storage: failed to save', key, e);
  }
}

export function remove(key: string): void {
  backend().removeItem(key);
}

// ---- typed accessors ---------------------------------------------------------

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...load<Partial<Settings>>(KEYS.settings, {}) };
}
export function saveSettings(s: Settings): void {
  save(KEYS.settings, s);
}

export function loadAttempts(): Attempt[] {
  return load<Attempt[]>(KEYS.attempts, []);
}
export function appendAttempts(newOnes: Attempt[]): Attempt[] {
  const all = [...loadAttempts(), ...newOnes];
  const trimmed = all.length > MAX_ATTEMPTS ? all.slice(all.length - MAX_ATTEMPTS) : all;
  save(KEYS.attempts, trimmed);
  return trimmed;
}

export function loadSessions(): SessionSummary[] {
  return load<SessionSummary[]>(KEYS.sessions, []);
}
export function appendSession(s: SessionSummary): SessionSummary[] {
  const all = [...loadSessions().filter((x) => x.id !== s.id), s];
  const trimmed = all.length > MAX_SESSIONS ? all.slice(all.length - MAX_SESSIONS) : all;
  save(KEYS.sessions, trimmed);
  return trimmed;
}

/** Wipe every stored record (settings included). */
export function clearAll(): void {
  for (const k of Object.values(KEYS)) remove(k);
}

/** Everything, for a JSON backup. */
export function exportAll(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, key] of Object.entries(KEYS)) out[name] = load(key, null);
  return out;
}

export function importAll(data: Record<string, unknown>): void {
  for (const [name, key] of Object.entries(KEYS)) {
    if (name in data && data[name] !== null && data[name] !== undefined) save(key, data[name]);
  }
}
