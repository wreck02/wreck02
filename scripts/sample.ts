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

const [, , idArg, levelArg, countArg] = process.argv;
const seed = process.env.SEED ?? newSessionSeed();
const rng = new RNG(seed);

/** Read a balanced {...} group starting at index i (which must point at '{'); returns [inner, nextIndex]. */
function group(s: string, i: number): [string, number] {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') depth++;
    else if (s[j] === '}') {
      depth--;
      if (depth === 0) return [s.slice(i + 1, j), j + 1];
    }
  }
  return [s.slice(i + 1), s.length];
}

/** Turn LaTeX into readable terminal text (recursive, brace-aware). */
function strip(s: string): string {
  let out = '';
  let i = 0;
  const arg = (): string => {
    while (s[i] === ' ') i++;
    if (s[i] === '{') { const [inner, next] = group(s, i); i = next; return strip(inner); }
    // single token argument
    if (s[i] === '\\') { const m = /^\\[a-zA-Z]+/.exec(s.slice(i)); if (m) { i += m[0].length; return strip(m[0]); } }
    return s[i++] ?? '';
  };
  const wrap = (t: string) => (/^[\w.]+$/.test(t) ? t : `(${t})`);
  while (i < s.length) {
    const ch = s[i];
    if (ch === '$') { i++; continue; }
    if (ch === '{' ) { const [inner, next] = group(s, i); out += strip(inner); i = next; continue; }
    if (ch === '}') { i++; continue; }
    if (ch === '^' ) { i++; const e = arg(); out += `^${wrap(e)}`; continue; }
    if (ch === '_' ) { i++; const e = arg(); out += `_${wrap(e)}`; continue; }
    if (ch === '\\') {
      const m = /^\\([a-zA-Z]+|.)/.exec(s.slice(i))!;
      const cmd = m[1];
      i += m[0].length;
      switch (cmd) {
        case 'frac': case 'tfrac': case 'dfrac': { const a = arg(); const b = arg(); out += `${wrap(a)}/${wrap(b)}`; break; }
        case 'sqrt': {
          let idx = '';
          if (s[i] === '[') { const e = s.indexOf(']', i); idx = s.slice(i + 1, e); i = e + 1; }
          const a = arg(); out += idx ? `${idx}√(${a})` : (/^[\w.]+$/.test(a) ? `√${a}` : `√(${a})`); break;
        }
        case 'text': case 'mathrm': case 'textbf': case 'mathbf': case 'operatorname': out += arg(); break;
        case 'times': out += '×'; break;
        case 'cdot': out += '·'; break;
        case 'pi': out += 'π'; break;
        case 'theta': out += 'θ'; break;
        case 'alpha': out += 'α'; break;
        case 'beta': out += 'β'; break;
        case 'lambda': out += 'λ'; break;
        case 'mu': out += 'μ'; break;
        case 'rho': out += 'ρ'; break;
        case 'Omega': out += 'Ω'; break;
        case 'circ': out += '°'; break;
        case 'le': case 'leq': out += '≤'; break;
        case 'ge': case 'geq': out += '≥'; break;
        case 'ne': case 'neq': out += '≠'; break;
        case 'pm': out += '±'; break;
        case 'infty': out += '∞'; break;
        case 'to': case 'rightarrow': out += '→'; break;
        case 'ln': case 'log': case 'sin': case 'cos': case 'tan': case 'exp': out += cmd; break;
        case 'dot': out += arg() + '̇'; break;
        case 'ldots': case 'dots': case 'cdots': out += '…'; break;
        case 'left': case 'right': case 'displaystyle': case '!': case ',': case ';': case ' ': if (cmd === ' ' || cmd === ',' || cmd === ';') out += ' '; break;
        case 'quad': case 'qquad': out += '  '; break;
        case '\\': out += '\n'; break;
        case '%': out += '%'; break;
        case 'begin': case 'end': arg(); break;
        default: out += cmd;
      }
      continue;
    }
    if (ch === '&') { out += '  '; i++; continue; }
    out += ch; i++;
  }
  return out;
}

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
