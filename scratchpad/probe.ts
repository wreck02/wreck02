/**
 * Fine-grained per-sub-variant statistics for the six templates under repair.
 *   npx vite-node scratchpad/probe.ts <id-substring> [N]
 */
import { TEMPLATES, generateQuestion } from '../src/core/registry';
import { RNG } from '../src/core/rng';
import { LEVELS, type Level, type Question } from '../src/core/template';

const filter = process.argv[2] ?? '';
const N = parseInt(process.argv[3] ?? '400', 10);

function variantOf(q: Question): string {
  const p = q.params as Record<string, unknown>;
  const v = (p.variant ?? p.ask ?? 'default') as string;
  return String(v);
}

interface Acc {
  n: number;
  ranks: number[];
  wrong: number;
  unlabeled: number;
  dupTrap: number;
  spreads: number[];
  negAnswerPair: number;
  stems: Set<string>;
}

const newAcc = (): Acc => ({ n: 0, ranks: [0, 0, 0, 0, 0], wrong: 0, unlabeled: 0, dupTrap: 0, spreads: [], negAnswerPair: 0, stems: new Set() });

for (const t of TEMPLATES) {
  if (filter && !t.id.includes(filter)) continue;
  console.log(`\n=== ${t.id}`);
  for (const level of LEVELS) {
    const byVar = new Map<string, Acc>();
    const lvl = newAcc();
    for (let i = 0; i < N; i++) {
      const q = generateQuestion(t, new RNG(`probe:${t.id}:${level}:${i}`), level as Level);
      const key = variantOf(q);
      if (!byVar.has(key)) byVar.set(key, newAcc());
      for (const a of [byVar.get(key)!, lvl]) {
        a.n++;
        a.stems.add(q.stem);
        const traps: string[] = [];
        for (const o of q.options) if (!o.correct) { a.wrong++; if (!o.trap) a.unlabeled++; else traps.push(o.trap); }
        if (new Set(traps).size < traps.length) a.dupTrap++;
        const nums = q.options.map((o) => (o.value ? o.value.toNumber() : NaN));
        if (nums.every((x) => Number.isFinite(x))) {
          const sorted = nums.slice().sort((x, y) => x - y);
          const ans = nums[q.options.findIndex((o) => o.correct)];
          const rank = sorted.indexOf(ans);
          const pos = Math.round((rank / (nums.length - 1)) * 4);
          a.ranks[pos]++;
          const abs = nums.map(Math.abs).filter((x) => x > 0);
          if (abs.length >= 2) a.spreads.push(Math.max(...abs) / Math.min(...abs));
          if (nums.some((x) => Math.abs(x + ans) < 1e-12 && Math.abs(ans) > 1e-12)) a.negAnswerPair++;
        }
      }
    }
    const fmt = (key: string, a: Acc) => {
      const tot = a.ranks.reduce((s, x) => s + x, 0) || 1;
      const rk = a.ranks.map((c) => String(Math.round((100 * c) / tot)).padStart(3)).join('|');
      const sp = a.spreads.length ? a.spreads.slice().sort((x, y) => x - y)[Math.floor(a.spreads.length / 2)] : NaN;
      return `  L${level} ${key.padEnd(20)} n=${String(a.n).padStart(4)} rank ${rk}  pad ${String(Math.round((100 * a.unlabeled) / Math.max(1, a.wrong))).padStart(3)}%  dupTrap ${String(Math.round((100 * a.dupTrap) / a.n)).padStart(3)}%  spr ${(Number.isFinite(sp) ? sp.toFixed(0) : '-').padStart(5)}  negpair ${String(Math.round((100 * a.negAnswerPair) / a.n)).padStart(3)}%  var ${a.stems.size}`;
    };
    console.log(fmt('ALL', lvl));
    for (const [k, a] of [...byVar.entries()].sort()) console.log(fmt(k, a));
  }
}
