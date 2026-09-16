/**
 * Auto-discovers every template under src/generators/** and exposes lookups.
 */
import type { Template, Module, Level, Question } from './template';
import { LEVELS } from './template';
import type { RNG } from './rng';
import { TOPIC_BY_KEY } from './topics';

const modules = import.meta.glob<{ default: Template }>(['../generators/**/*.ts', '!../generators/**/*.test.ts'], { eager: true });

const all: Template[] = [];
const byId = new Map<string, Template>();

for (const path of Object.keys(modules).sort()) {
  const mod = modules[path];
  const t = mod?.default;
  if (!t || typeof t.generate !== 'function') continue;
  if (byId.has(t.id)) throw new Error(`duplicate template id ${t.id} (${path})`);
  if (!TOPIC_BY_KEY[t.topic]) throw new Error(`template ${t.id} uses unknown topic "${t.topic}"`);
  byId.set(t.id, t);
  all.push(t);
}

export const TEMPLATES: readonly Template[] = all;

export function getTemplate(id: string): Template | undefined {
  return byId.get(id);
}

export function templatesFor(filter: { module?: Module | 'ALL'; topics?: string[]; ids?: string[] } = {}): Template[] {
  return all.filter((t) => {
    if (filter.ids && !filter.ids.includes(t.id)) return false;
    if (filter.module && filter.module !== 'ALL' && t.module !== filter.module) return false;
    if (filter.topics && filter.topics.length > 0 && !filter.topics.includes(t.topic)) return false;
    return true;
  });
}

export function templateSupportsLevel(t: Template, level: Level): boolean {
  // Every template must support every level (the range descriptions are documentation),
  // but a template may mark a level unsupported by omitting it AND providing at least one.
  const keys = Object.keys(t.levels).map(Number) as Level[];
  if (keys.length === 0) return true;
  return keys.includes(level);
}

/** Nearest supported level for a template. */
export function nearestLevel(t: Template, level: Level): Level {
  if (templateSupportsLevel(t, level)) return level;
  let best: Level = LEVELS[0];
  let bestDist = Infinity;
  for (const l of LEVELS) {
    if (!templateSupportsLevel(t, l)) continue;
    const d = Math.abs(l - level);
    if (d < bestDist) { best = l; bestDist = d; }
  }
  return best;
}

/** Generate a full Question from a template (fills the identifying fields). */
export function generateQuestion(t: Template, rng: RNG, level: Level): Question {
  const lv = nearestLevel(t, level);
  const g = t.generate(rng, lv);
  return { ...g, templateId: t.id, module: t.module, topic: t.topic, level: lv };
}
