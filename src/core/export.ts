/**
 * Markdown export of a session report (for a personal error ledger).
 */
import type { SessionReport } from './analytics';
import { formatSec } from './analytics';
import { PACE_SECONDS, overPace, type QuestionRecord } from './session';
import { MODULE_NAMES } from './template';
import { topicName } from './topics';
import { answerToPlain } from './answers';

function latexToText(s: string): string {
  return s
    .replace(/\\sqrt\{([^}]*)\}/g, '√($1)')
    .replace(/\\t?frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)')
    .replace(/\\times/g, '×').replace(/\\pi/g, 'π').replace(/\\theta/g, 'θ').replace(/\\circ/g, '°')
    .replace(/\\text\{([^}]*)\}/g, '$1').replace(/\\mathrm\{([^}]*)\}/g, '$1')
    .replace(/\\left|\\right/g, '').replace(/\\,|\\ |\;/g, ' ')
    .replace(/\\le\b/g, '≤').replace(/\\ge\b/g, '≥').replace(/\\ne\b/g, '≠').replace(/\\pm/g, '±').replace(/\\cdot/g, '·').replace(/\\infty/g, '∞')
    .replace(/\^\{([^}]*)\}/g, '^$1').replace(/_\{([^}]*)\}/g, '_$1')
    .replace(/\$/g, '')
    .replace(/\n+/g, ' ');
}

export function sessionToMarkdown(report: SessionReport, questions: QuestionRecord[] = []): string {
  const s = report.summary;
  const date = new Date(s.startedAt);
  const lines: string[] = [];
  lines.push(`# ESAT practice — ${s.mode} — ${date.toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push(`- **Seed:** \`${s.seed}\` (replay this session from the app's home screen)`);
  lines.push(`- **Module:** ${s.module === 'ALL' ? 'All' : MODULE_NAMES[s.module]}${s.topics.length ? ` · topics: ${s.topics.map(topicName).join(', ')}` : ''}`);
  lines.push(`- **Level:** ${s.level} · **Answer mode:** ${s.answerMode}`);
  lines.push(`- **Score:** ${s.correct}/${s.count} (${report.scorePct}%) · skipped ${s.skipped}`);
  lines.push(`- **Pace:** mean ${report.avgSec.toFixed(0)} s, median ${report.medianSec.toFixed(0)} s per question (exam pace ${PACE_SECONDS} s) · ${report.overPaceCount} over pace`);
  lines.push('');
  if (report.topicsToDrill.length) {
    lines.push('## Topics to drill');
    lines.push('');
    for (const t of report.topicsToDrill) lines.push(`- ${t.name}: ${t.problems} of ${t.n} wrong or over pace`);
    lines.push('');
  }
  if (report.slowest.length) {
    lines.push('## Slowest five');
    lines.push('');
    for (const a of report.slowest) lines.push(`- Q${a.index + 1} (${topicName(a.topic)}, level ${a.level}): ${formatSec(a.timeMs)}${a.correct ? '' : ' — wrong'}`);
    lines.push('');
  }
  lines.push('## Question log');
  lines.push('');
  lines.push('| # | Topic | Lvl | Result | Time | vs pace |');
  lines.push('|---|---|---|---|---|---|');
  for (const a of report.attempts) {
    const res = a.skipped ? 'skipped' : a.correct ? '✓' : '✗';
    const gap = Math.round(a.timeMs / 1000 - PACE_SECONDS);
    lines.push(`| ${a.index + 1} | ${topicName(a.topic)} | ${a.level} | ${res} | ${formatSec(a.timeMs)} | ${gap >= 0 ? '+' : ''}${gap}s |`);
  }
  lines.push('');
  const errors = report.attempts.filter((a) => !a.correct || overPace(a));
  if (errors.length) {
    lines.push('## Error ledger');
    lines.push('');
    for (const a of errors) {
      const q = questions.find((r) => r.index === a.index)?.question;
      lines.push(`### Q${a.index + 1} — ${topicName(a.topic)} (level ${a.level}) — ${a.skipped ? 'skipped' : a.correct ? 'correct but slow' : 'wrong'} in ${formatSec(a.timeMs)}`);
      lines.push('');
      lines.push(latexToText(q?.stem ?? a.stem));
      lines.push('');
      lines.push(`- **Answer:** ${q ? answerToPlain(q.answer) : a.answerText}`);
      if (!a.skipped && a.given) lines.push(`- **You gave:** ${a.given}`);
      if (q) {
        lines.push(`- **Quick route:** ${latexToText(q.solution)}`);
        lines.push(`- **Trap:** ${q.trap}`);
        lines.push(`- **Template:** \`${q.templateId}\` · seed \`${questions.find((r) => r.index === a.index)?.seed}\``);
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}
