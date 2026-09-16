import type { Module } from './template';

export interface TopicInfo {
  key: string;
  module: Module;
  name: string;
}

/** Canonical topic list. Template `topic` fields must use one of these keys. */
export const TOPICS: TopicInfo[] = [
  // Mathematics 1
  { key: 'fractions', module: 'M1', name: 'Fractions, decimals & percentages' },
  { key: 'ratio-percent', module: 'M1', name: 'Ratio & percentage change' },
  { key: 'standard-form', module: 'M1', name: 'Standard form & estimation' },
  { key: 'surds', module: 'M1', name: 'Surds' },
  { key: 'indices-logs', module: 'M1', name: 'Indices & logarithms' },
  { key: 'algebra', module: 'M1', name: 'Expanding, factorising & quadratics' },
  { key: 'equations', module: 'M1', name: 'Equations & inequalities' },
  { key: 'sequences', module: 'M1', name: 'Sequences & series' },
  { key: 'coord-geom', module: 'M1', name: 'Coordinate geometry' },
  { key: 'mensuration', module: 'M1', name: 'Mensuration' },
  { key: 'trig', module: 'M1', name: 'Trigonometry' },
  { key: 'probability', module: 'M1', name: 'Counting & probability' },
  // Mathematics 2
  { key: 'differentiation', module: 'M2', name: 'Differentiation' },
  { key: 'integration', module: 'M2', name: 'Integration' },
  { key: 'polynomials', module: 'M2', name: 'Binomial, remainder & factor theorem' },
  { key: 'functions', module: 'M2', name: 'Exponentials, logs, functions & graphs' },
  { key: 'vectors', module: 'M2', name: 'Vectors' },
  { key: 'reasoning', module: 'M2', name: 'Series identities & reasoning' },
  // Physics
  { key: 'kinematics', module: 'PHY', name: 'Kinematics (SUVAT & projectiles)' },
  { key: 'forces', module: 'PHY', name: 'Forces, momentum & impulse' },
  { key: 'energy', module: 'PHY', name: 'Work, energy, power & springs' },
  { key: 'statics', module: 'PHY', name: 'Moments, pressure & density' },
  { key: 'electricity', module: 'PHY', name: 'Electricity' },
  { key: 'waves', module: 'PHY', name: 'Waves & optics' },
  { key: 'units', module: 'PHY', name: 'Units, prefixes & estimation' },
  { key: 'nuclear', module: 'PHY', name: 'Radioactivity & nuclear' },
];

export const TOPIC_BY_KEY: Record<string, TopicInfo> = Object.fromEntries(TOPICS.map((t) => [t.key, t]));

export function topicsForModule(m: Module): TopicInfo[] {
  return TOPICS.filter((t) => t.module === m);
}

export function topicName(key: string): string {
  return TOPIC_BY_KEY[key]?.name ?? key;
}
