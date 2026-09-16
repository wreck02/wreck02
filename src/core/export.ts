/**
 * Markdown export of a session report (for a personal error ledger).
 */
import type { SessionReport } from './analytics';
import { formatSec, groupBy } from './analytics';
import { PACE_SECONDS, overPace, regenerateFromAttempt, type Attempt, type QuestionRecord } from './session';
import { MODULE_NAMES, type Question } from './template';
import { TOPICS, TOPIC_BY_KEY, topicName } from './topics';
import { answerToPlain } from './answers';
import { latexToText as latexToTextCore } from './latex-text';

function latexToText(s: string): string {
  return latexToTextCore(s).replace(/\n+/g, ' ');
}
import { getTemplate } from './registry';
import { reviewWeight, type Ledger, type LedgerEntry } from './srs';


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
    const res = a.timedOut && !a.correct ? 'timed out' : a.skipped ? 'skipped' : a.correct ? '✓' : '✗';
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
      lines.push(`### Q${a.index + 1} — ${topicName(a.topic)} (level ${a.level}) — ${a.timedOut && !a.correct ? 'timed out' : a.skipped ? 'skipped' : a.correct ? 'correct but slow' : 'wrong'} in ${formatSec(a.timeMs)}`);
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

/** latexToText plus the display-size variants the session export never meets. */
function plainText(s: string): string {
  return latexToText(s.replace(/\\[dt]frac\b/g, '\\frac').replace(/\\displaystyle\s*/g, ''));
}

function shortDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function verdict(a: Attempt): string {
  if (a.timedOut && !a.correct) return 'timed out';
  if (a.skipped) return 'skipped';
  return a.correct ? 'correct but slow' : 'wrong';
}

/** What the student gave, with the option text and its trap when the answer was a letter. */
function givenText(a: Attempt, q: Question | null): string {
  const opt = q && /^[A-H]$/.test(a.given) ? q.options.find((o) => o.key === a.given) : undefined;
  if (!opt) return a.given;
  return `${opt.key}: ${plainText(opt.display)}${opt.trap ? ` (${opt.trap})` : ''}`;
}

/**
 * Markdown export of the whole error ledger: every template that has been failed,
 * grouped by topic (in syllabus order) then template (heaviest first), with its most
 * recent mistakes regenerated so the stem, answer, quick route and trap are all there.
 */
export function ledgerToMarkdown(attempts: Attempt[], ledger: Ledger, opts: { now?: number; perTemplate?: number } = {}): string {
  const now = opts.now ?? Date.now();
  const perTemplate = Math.max(1, opts.perTemplate ?? 5);
  const entries = Object.values(ledger).filter((e) => e.failures.length > 0);
  const lines: string[] = [];
  lines.push(`# ESAT error ledger — ${new Date(now).toISOString().slice(0, 10)}`);
  lines.push('');
  if (entries.length === 0) {
    lines.push('The ledger is empty: nothing has been answered wrong, skipped or over pace yet.');
    lines.push('');
    return lines.join('\n');
  }
  const due = entries.filter((e) => now >= e.dueAt).length;
  const failing = attempts.filter((a) => !a.correct || a.skipped || overPace(a)).sort((a, b) => b.at - a.at);
  const byTemplate = groupBy(failing, (a) => a.templateId);
  lines.push(`- **Templates in the ledger:** ${entries.length} (${due} due now)`);
  lines.push(`- **Rule:** a wrong, skipped or over-pace (${PACE_SECONDS} s) answer adds a failure and brings the template back within hours; clean, on-pace answers in review push the next review out.`);
  lines.push(`- **Listed below:** the last ${perTemplate} mistake${perTemplate === 1 ? '' : 's'} per template, newest first.`);
  lines.push('');

  const topicOf = (e: LedgerEntry): string => getTemplate(e.templateId)?.topic ?? byTemplate.get(e.templateId)?.[0]?.topic ?? 'unknown';
  const byTopic = new Map<string, LedgerEntry[]>();
  for (const e of entries) {
    const t = topicOf(e);
    if (!byTopic.has(t)) byTopic.set(t, []);
    byTopic.get(t)!.push(e);
  }
  const order = [...TOPICS.map((t) => t.key).filter((k) => byTopic.has(k)), ...[...byTopic.keys()].filter((k) => !TOPIC_BY_KEY[k])];

  for (const topic of order) {
    const info = TOPIC_BY_KEY[topic];
    lines.push(`## ${topicName(topic)}${info ? ` (${MODULE_NAMES[info.module]})` : ''}`);
    lines.push('');
    const es = byTopic.get(topic)!.slice().sort((a, b) => reviewWeight(b, now) - reviewWeight(a, now));
    for (const e of es) {
      const t = getTemplate(e.templateId);
      lines.push(`### ${t?.title ?? e.templateId}`);
      lines.push('');
      const last = e.failures[e.failures.length - 1];
      lines.push(`- **Template:** \`${e.templateId}\``);
      lines.push(`- **Failures:** ${e.failures.length} · **clean successes:** ${e.successes.length} · **last failed:** ${shortDate(last)} · **next review:** ${now >= e.dueAt ? 'due now' : shortDate(e.dueAt)}`);
      lines.push('');
      const xs = (byTemplate.get(e.templateId) ?? []).slice(0, perTemplate);
      if (xs.length === 0) {
        lines.push('_No stored attempts for this template._');
        lines.push('');
        continue;
      }
      for (const a of xs) {
        const q = regenerateFromAttempt(a);
        lines.push(`#### ${shortDate(a.at)} — level ${a.level} — ${verdict(a)} in ${formatSec(a.timeMs)}`);
        lines.push('');
        lines.push(plainText(q?.stem ?? a.stem));
        lines.push('');
        lines.push(`- **Answer:** ${q ? answerToPlain(q.answer) : a.answerText}`);
        if (!a.skipped && a.given) lines.push(`- **You gave:** ${givenText(a, q)}`);
        if (q) {
          lines.push(`- **Quick route:** ${plainText(q.solution)}`);
          lines.push(`- **Trap:** ${q.trap}`);
        }
        lines.push(`- **Seed:** \`${a.questionSeed}\` (session \`${a.sessionSeed}\`, question ${a.index + 1})`);
        lines.push('');
      }
    }
  }
  return lines.join('\n');
}
