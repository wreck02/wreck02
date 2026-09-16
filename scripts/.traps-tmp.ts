import { TEMPLATES, generateQuestion } from '../src/core/registry';
import { RNG } from '../src/core/rng';
import type { Level } from '../src/core/template';

const id = process.argv[2];
const N = parseInt(process.env.N ?? '300', 10);
const t = TEMPLATES.find((x) => x.id === id)!;
for (const level of [1, 2, 3, 4, 5] as Level[]) {
  let dupTrap = 0, n = 0;
  const counts = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const q = generateQuestion(t, new RNG(`traps:${id}:${level}:${i}`), level);
    n++;
    const traps = q.options.filter((o) => !o.correct).map((o) => o.trap ?? '(none)');
    if (new Set(traps).size < traps.length) dupTrap++;
    for (const tr of traps) counts.set(tr, (counts.get(tr) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${v}x ${k.slice(0, 60)}`);
  console.log(`L${level}: duplicate-trap questions ${Math.round((100 * dupTrap) / n)}%  | top: ${top.join(' || ')}`);
}
