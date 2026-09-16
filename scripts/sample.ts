/**
 * Print sample generated questions to the terminal.
 *   npm run sample                       → 5 questions from 5 different topics (random seed)
 *   npm run sample -- m1.surds.simplify-root       → 5 instances of one template (levels 1..5)
 *   npm run sample -- m1.surds.simplify-root 3 12  → 12 instances at level 3
 *   SEED=ESAT-ABC123 npm run sample      → reproducible
 */
import { TEMPLATES, generateQuestion } from '../src/core/registry';
import { RNG, newSessionSeed } from '../src/core/rng';
import { answerToPlain } from '../src/core/answers';
import type { Level, Question } from '../src/core/template';
import { latexToText as strip } from '../src/core/latex-text';

const [, , idArg, levelArg, countArg] = process.argv;
const seed = process.env.SEED ?? newSessionSeed();
const rng = new RNG(seed);

function print(q: Question, n: number) {
  console.log(`\n${'─'.repeat(78)}\n#${n}  ${q.templateId}  [${q.module} · ${q.topic} · level ${q.level}]`);
  console.log(strip(q.stem));
  console.log('');
  for (const o of q.options) console.log(`  ${o.key}. ${strip(o.display)}${o.correct ? '   ✔' : ''}`);
  console.log(`\nAnswer: ${answerToPlain(q.answer)}`);
  console.log(`Solution: ${strip(q.solution)}`);
  console.log(`Trap: ${q.trap}`);
}

console.log(`seed ${seed} — ${TEMPLATES.length} templates registered`);

if (idArg) {
  const t = TEMPLATES.find((x) => x.id === idArg || x.id.endsWith(idArg))!;
  if (!t as boolean) {
    console.error(`no template matching "${idArg}". Known ids:\n  ${TEMPLATES.map((x) => x.id).join('\n  ')}`);
    process.exit(1);
  }
  const count = countArg ? parseInt(countArg, 10) : 5;
  for (let i = 0; i < count; i++) {
    const level = (levelArg ? parseInt(levelArg, 10) : ((i % 5) + 1)) as Level;
    print(generateQuestion(t, rng.child(i), level), i + 1);
  }
} else {
  // five different topics
  const topics = rng.shuffle([...new Set(TEMPLATES.map((t) => t.topic))]).slice(0, 5);
  topics.forEach((topic, i) => {
    const t = rng.pick(TEMPLATES.filter((x) => x.topic === topic));
    const level = rng.int(2, 4) as Level;
    print(generateQuestion(t, rng.child(i), level), i + 1);
  });
}
console.log('');
