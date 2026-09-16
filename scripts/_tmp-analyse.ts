/* TEMPORARY analysis helper (deleted before hand-off). */
import { TEMPLATES, generateQuestion } from '../src/core/registry';
import { RNG } from '../src/core/rng';
import { LEVELS, type Level, type Question } from '../src/core/template';

const id = process.argv[2];
const N = parseInt(process.env.N ?? '400', 10);
const t = TEMPLATES.find((x) => x.id === id)!;

function key(q: Question): string {
  const p = q.params as Record<string, unknown>;
  return String(p.ask ?? p.variant ?? p.kind ?? '?');
}

for (const level of LEVELS) {
  const groups = new Map<string, { n: number; ranks: number[]; single: number; neg: number; negOpts: number; wrong: number; unlab: number; zero: number; const1: number; stems: Set<string>; spreads: number[] }>();
  for (let i = 0; i < N; i++) {
    const q = generateQuestion(t, new RNG(`an:${t.id}:${level}:${i}`), level as Level);
    const k = key(q);
    let g = groups.get(k);
    if (!g) { g = { n: 0, ranks: [], single: 0, neg: 0, negOpts: 0, wrong: 0, unlab: 0, zero: 0, const1: 0, stems: new Set(), spreads: [] }; groups.set(k, g); }
    g.n++;
    g.stems.add(q.stem);
    for (const o of q.options) if (!o.correct) { g.wrong++; if (!o.trap) g.unlab++; }
    const nums = q.options.map((o) => (o.value ? o.value.toNumber() : NaN));
    if (nums.every((x) => Number.isFinite(x))) {
      const sorted = nums.slice().sort((a, b) => a - b);
      const ans = nums[q.options.findIndex((o) => o.correct)];
      g.ranks.push(sorted.indexOf(ans));
      const abs = nums.map(Math.abs).filter((x) => x > 0);
      if (abs.length >= 2) g.spreads.push(Math.max(...abs) / Math.min(...abs));
      if (q.options.some((o) => !o.correct && o.value!.toNumber() < 0)) g.neg++;
      g.negOpts += q.options.filter((o) => !o.correct && o.value!.toNumber() < 0).length;
    }
    if (q.options.some((o) => o.values && o.values.length === 1 && !o.correct)) g.single++;
    if (q.options.some((o) => /\\frac\{0\}/.test(o.display))) g.zero++;
    if (q.options.some((o) => /\\frac\{([^{}]+)\}\{\1\}/.test(o.display))) g.const1++;
  }
  for (const [k, g] of groups) {
    const hist = [0, 0, 0, 0, 0];
    for (const r of g.ranks) hist[r]++;
    const pc = (x: number, n: number) => (n ? `${Math.round((100 * x) / n)}`.padStart(3) : '  -');
    const spread = g.spreads.length ? g.spreads.slice().sort((a, b) => a - b)[Math.floor(g.spreads.length / 2)] : NaN;
    console.log(`L${level} ${k.padEnd(18)} n=${String(g.n).padStart(4)} rank ${hist.map((h) => pc(h, g.ranks.length)).join('/')} single${pc(g.single, g.n)}% neg${pc(g.neg, g.n)}%(opts ${pc(g.negOpts, g.wrong)}%) pad${pc(g.unlab, g.wrong)}% zeroNum${pc(g.zero, g.n)}% constOpt${pc(g.const1, g.n)}% spr ${Number.isFinite(spread) ? spread.toFixed(1) : '-'} stems ${g.stems.size}`);
  }
}
