/**
 * Distractor quality statistics for every template (or a filtered set).
 *   npm run stats                 → all templates, 200 instances per level
 *   npm run stats -- m1.surds     → templates whose id contains "m1.surds"
 *   N=500 npm run stats           → more instances
 *
 * Reports, per template and level:
 *   pad%      share of wrong options with no named trap (generic padding or unlabelled distractors)
 *   rank      distribution of where the correct numeric answer sits when options are sorted by value
 *             (min … max); a heavy bias (e.g. always the median) gives the answer away
 *   extreme%  share of questions whose answer is the smallest or largest numeric option
 *   spread    median of max/min ratio across numeric options (huge spreads make distractors implausible)
 *   dup%      share of questions where two options have the same numeric value to 3 s.f. (near duplicates)
 *   ms        mean generation time
 */
import { TEMPLATES, generateQuestion } from '../src/core/registry';
import { RNG } from '../src/core/rng';
import { LEVELS, type Level } from '../src/core/template';
import { STATEMENT_COMBOS } from '../src/core/options';

const filter = process.argv[2] ?? '';
const N = parseInt(process.env.N ?? '200', 10);

function pct(x: number, n: number): string {
  return n === 0 ? '  –' : `${Math.round((100 * x) / n)}`.padStart(3);
}

interface LevelStats {
  n: number; wrong: number; unlabeled: number; ranks: number[]; extreme: number; spreads: number[]; dup: number; numeric: number; ms: number; stems: Set<string>;
}

const rows: string[] = [];
let flagged = 0;
for (const t of TEMPLATES) {
  if (filter && !t.id.includes(filter)) continue;
  const perLevel: LevelStats[] = [];
  for (const level of LEVELS) {
    const s: LevelStats = { n: 0, wrong: 0, unlabeled: 0, ranks: [], extreme: 0, spreads: [], dup: 0, numeric: 0, ms: 0, stems: new Set() };
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      const q = generateQuestion(t, new RNG(`stats:${t.id}:${level}:${i}`), level as Level);
      s.n++;
      s.stems.add(q.stem);
      // The fixed I/II/III combinations are the exam's own option list: they carry no per-option trap by design.
      const fixedCombos = q.options.length === STATEMENT_COMBOS.length && q.options.every((o, k) => o.display === STATEMENT_COMBOS[k]);
      if (!fixedCombos) for (const o of q.options) if (!o.correct) { s.wrong++; if (!o.trap) s.unlabeled++; }
      const nums = q.options.map((o) => (o.value ? o.value.toNumber() : NaN));
      if (nums.every((x) => Number.isFinite(x))) {
        s.numeric++;
        const sorted = nums.slice().sort((a, b) => a - b);
        const ans = nums[q.options.findIndex((o) => o.correct)];
        const rank = sorted.indexOf(ans);
        s.ranks.push(rank / (nums.length - 1));
        if (rank === 0 || rank === nums.length - 1) s.extreme++;
        const abs = nums.map(Math.abs).filter((x) => x > 0);
        if (abs.length >= 2) {
          // A power-of-ten ladder (unit conversions, standard form, order-of-magnitude
          // estimates) is the right distractor set for those questions, so its spread
          // is not a defect. Detect it and leave it out of the spread statistic.
          const lo = Math.min(...abs);
          const ladder = abs.every((x) => Math.abs(Math.log10(x / lo) - Math.round(Math.log10(x / lo))) < 0.02);
          if (!ladder) s.spreads.push(Math.max(...abs) / lo);
        }
        const keys = new Set(nums.map((x) => Number(x.toPrecision(3))));
        if (keys.size < nums.length) s.dup++;
      }
    }
    s.ms = (performance.now() - t0) / N;
    perLevel.push(s);
  }
  const line = perLevel.map((s, i) => {
    const rankHist = [0, 0, 0];
    for (const r of s.ranks) rankHist[r < 0.34 ? 0 : r < 0.67 ? 1 : 2]++;
    const rk = s.ranks.length ? rankHist.map((c) => pct(c, s.ranks.length).trim()).join('/') : '–';
    const spread = s.spreads.length ? s.spreads.slice().sort((a, b) => a - b)[Math.floor(s.spreads.length / 2)] : NaN;
    const warn = (s.unlabeled / Math.max(1, s.wrong) > 0.2 ? 'P' : '') + (s.ranks.length && rankHist.some((c) => c / s.ranks.length > 0.6) ? 'R' : '') + (s.numeric && s.extreme / s.numeric > 0.6 ? 'E' : '') + (spread > 50 ? 'S' : '') + (s.stems.size < N / 5 ? 'V' : '');
    if (warn) flagged++;
    return `L${i + 1} pad${pct(s.unlabeled, s.wrong)}% rank ${rk.padEnd(8)} ext${pct(s.extreme, s.numeric)}% spr${(Number.isFinite(spread) ? spread.toFixed(0) : '–').padStart(4)} dup${pct(s.dup, s.numeric)}% var${String(s.stems.size).padStart(4)} ${warn.padEnd(4)}`;
  });
  rows.push(`${t.id}\n   ${line.join('\n   ')}`);
}
console.log(`N=${N} per level. Flags: P = >20% unlabelled/padded options, R = answer rank biased (>60% low/mid/high), E = answer is an extreme option >60%, S = median max/min option spread > 50, V = fewer than N/5 distinct stems\n`);
console.log(rows.join('\n'));
console.log(`\n${rows.length} templates, ${flagged} template-levels flagged`);
