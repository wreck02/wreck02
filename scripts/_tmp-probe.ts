import { TEMPLATES, generateQuestion } from '../src/core/registry';
import { RNG } from '../src/core/rng';
import { latexToText as strip } from '../src/core/latex-text';
const t = TEMPLATES.find((x) => x.id === 'm1.algebra.algebraic-fractions')!;
let shown = 0;
for (let i = 0; i < 400 && shown < 3; i++) {
  const q = generateQuestion(t, new RNG(`pr:${i}`), 2);
  if (!/\dx\^/.test(q.stem)) continue;
  shown++;
  console.log(strip(q.stem), '\n  ', q.options.map((o) => strip(o.display) + (o.correct ? ' *' : '')).join('  |  '), '\n  ', strip(q.solution), '\n');
}
