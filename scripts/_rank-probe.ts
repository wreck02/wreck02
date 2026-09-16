import { TEMPLATES, generateQuestion } from '../src/core/registry';
import { RNG } from '../src/core/rng';
import { LEVELS, type Level } from '../src/core/template';

const filter = process.argv[2] ?? '';
const N = parseInt(process.env.N ?? '400', 10);
for (const t of TEMPLATES) {
  if (filter && !t.id.includes(filter)) continue;
  console.log(t.id);
  for (const level of LEVELS) {
    const hist = [0, 0, 0, 0, 0];
    let numeric = 0, total = 0, maxc = 0, minc = 0, onlyInt = 0, onlyIntCorrect = 0;
    for (let i = 0; i < N; i++) {
      const q = generateQuestion(t, new RNG(`probe:${t.id}:${level}:${i}`), level as Level);
      total++;
      const nums = q.options.map((o) => (o.value ? o.value.toNumber() : NaN));
      if (!nums.every((x) => Number.isFinite(x))) continue;
      numeric++;
      const sorted = nums.slice().sort((a, b) => a - b);
      const ai = q.options.findIndex((o) => o.correct);
      const rank = sorted.indexOf(nums[ai]);
      hist[rank]++;
      if (rank === nums.length - 1) maxc++;
      if (rank === 0) minc++;
      const ints = nums.filter((x) => Number.isInteger(x));
      if (ints.length === 1) { onlyInt++; if (Number.isInteger(nums[ai])) onlyIntCorrect++; }
    }
    const p = (x: number) => `${Math.round(100 * x / Math.max(1, numeric))}%`.padStart(5);
    console.log(`  L${level} numeric ${numeric}/${total}  rank0${p(hist[0])} rank1${p(hist[1])} rank2${p(hist[2])} rank3${p(hist[3])} rank4${p(hist[4])}  | max${p(maxc)} min${p(minc)} | soleInt ${onlyInt} of which correct ${onlyIntCorrect}`);
  }
}
