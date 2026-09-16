/** Short UI labels shared by the Home, Setup and Settings screens. */
import type { Mode } from '../core/session';
import type { Module } from '../core/template';

export const MODE_LABELS: Record<Mode, string> = {
  drill: 'Topic drill',
  sim: 'ESAT simulation',
  sprint: 'Sprint',
  gauntlet: 'Gauntlet',
  review: 'Review',
};

export const MODULE_OPTIONS: (Module | 'ALL')[] = ['ALL', 'M1', 'M2', 'PHY'];

export const MODULE_SHORT: Record<Module | 'ALL', string> = {
  ALL: 'All',
  M1: 'Maths 1',
  M2: 'Maths 2',
  PHY: 'Physics',
};

/** "–" for NaN, otherwise a whole-number percentage. */
export function pct(x: number): string {
  return Number.isFinite(x) ? `${Math.round(x * 100)}%` : '–';
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
