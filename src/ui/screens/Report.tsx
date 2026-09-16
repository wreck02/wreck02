/**
 * Session report: score, pace, per-question table with expandable solutions,
 * slowest questions, topics to drill, replay / review shortcuts and Markdown export.
 */
import { useMemo, useState } from 'react';
import type { Nav } from '../App';
import { useStore } from '../store';
import { sessionReport, formatSec, moduleOfTopic } from '../../core/analytics';
import { overPace, presetConfig, regenerateFromAttempt, PACE_SECONDS, type Attempt, type Mode } from '../../core/session';
import { newSessionSeed } from '../../core/rng';
import { answerToDisplay } from '../../core/answers';
import { sessionToMarkdown } from '../../core/export';
import { getTemplate } from '../../core/registry';
import { MODULE_NAMES, type Question } from '../../core/template';
import { topicName } from '../../core/topics';
import { MathText } from '../components/MathText';
import { TimeBar } from '../components/TimeBar';
import '../runner.css';

const MODE_NAMES: Record<Mode, string> = { drill: 'Drill', sprint: 'Sprint', sim: 'Exam sim', gauntlet: 'Gauntlet', review: 'Review' };

function resultLabel(a: Attempt): { text: string; cls: string } {
  if (a.timedOut) return { text: 'timed out', cls: 'result-bad' };
  if (a.skipped) return { text: 'skipped', cls: 'muted' };
  return a.correct ? { text: '✓', cls: 'result-ok' } : { text: '✗', cls: 'result-bad' };
}

function fallbackCopy(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  document.body.removeChild(ta);
  return ok;
}

export function Report({ nav, sessionId }: { nav: Nav; sessionId: string }) {
  const store = useStore();
  const summary = useMemo(() => store.sessions.find((s) => s.id === sessionId), [store.sessions, sessionId]);
  const report = useMemo(() => (summary ? sessionReport(summary, store.attempts) : null), [summary, store.attempts]);
  const questions = useMemo(() => {
    const m = new Map<number, Question | null>();
    for (const a of report?.attempts ?? []) m.set(a.index, regenerateFromAttempt(a));
    return m;
  }, [report]);
  const [open, setOpen] = useState<number | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'failed'>('idle');

  if (!summary || !report) {
    return (
      <main className="page">
        <div className="card run-error">
          <h1>Session not found</h1>
          <p className="muted">This report is no longer stored on this device.</p>
          <button className="btn primary" onClick={nav.home}>Home</button>
        </div>
      </main>
    );
  }

  const attempts = report.attempts;
  const maxMs = Math.max(0, ...attempts.map((a) => a.timeMs));
  const gap = report.medianSec - PACE_SECONDS;
  const paceText = attempts.length === 0 ? '' : gap <= 0 ? `${Math.round(-gap)} s ahead of pace` : `${Math.round(gap)} s behind pace`;
  const date = new Date(summary.startedAt);

  const reviewIds = [...new Set(attempts.filter((a) => !a.correct || overPace(a)).map((a) => a.templateId))].filter((id) => getTemplate(id));
  const startReview = () => {
    const n = reviewIds.length;
    nav.go({
      name: 'run',
      config: presetConfig('review', newSessionSeed(), {
        templateIds: reviewIds,
        count: Math.min(10, Math.max(5, n)),
        answerMode: summary.answerMode,
        module: summary.module,
        topics: summary.topics,
      }),
    });
  };

  const markdown = () => {
    const records = attempts.flatMap((a) => {
      const q = questions.get(a.index);
      return q ? [{ index: a.index, seed: a.questionSeed, question: q }] : [];
    });
    return sessionToMarkdown(report, records);
  };
  const copyMarkdown = async () => {
    const md = markdown();
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(md); ok = true; }
    } catch { ok = false; }
    if (!ok) ok = fallbackCopy(md);
    setCopyState(ok ? 'done' : 'failed');
    setTimeout(() => setCopyState('idle'), 2000);
  };
  const downloadMarkdown = () => {
    const md = markdown();
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `esat-${summary.mode}-${date.toISOString().slice(0, 10)}-${summary.seed}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const drillTopic = (topic: string) => {
    nav.go({ name: 'setup', mode: 'drill', prefill: { module: moduleOfTopic(topic) ?? summary.module, topics: [topic] } });
  };

  return (
    <main className="page">
      <div className="card">
        <div className="score-head">
          <h1 style={{ margin: 0 }}>{MODE_NAMES[summary.mode]} report</h1>
          <span className="muted small">{date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
        </div>
        <div className="score-big" style={{ marginTop: '0.75rem' }}>
          {summary.correct} / {summary.count}<small>{report.scorePct}%</small>
        </div>
        <div className="meta-pills">
          <span className="pill">{summary.module === 'ALL' ? 'All modules' : MODULE_NAMES[summary.module]}</span>
          {summary.topics.length > 0 && <span className="pill">{summary.topics.map(topicName).join(', ')}</span>}
          <span className="pill">Level {summary.level}</span>
          <span className="pill">{summary.answerMode === 'typed' ? 'Typed answers' : 'Multiple choice'}</span>
          {summary.peakLevel ? <span className="pill accent">Peak level {summary.peakLevel}</span> : null}
          <span className="pill mono" title="Session seed">{summary.seed}</span>
        </div>
        <div className="stat-grid">
          <div className="stat"><div className="v">{formatSec(report.avgSec * 1000)}</div><div className="l">mean per question</div></div>
          <div className="stat"><div className="v">{formatSec(report.medianSec * 1000)}</div><div className="l">median · {paceText || 'no data'}</div></div>
          <div className="stat"><div className={`v ${report.overPaceCount ? 'bad' : ''}`}>{report.overPaceCount}</div><div className="l">over {PACE_SECONDS} s pace</div></div>
          <div className="stat"><div className="v">{summary.skipped}</div><div className="l">skipped</div></div>
          <div className="stat"><div className="v">{formatSec(summary.totalTimeMs)}</div><div className="l">total question time</div></div>
        </div>
        <div className="report-actions">
          <button className="btn primary" onClick={startReview} disabled={reviewIds.length === 0} title={reviewIds.length === 0 ? 'Nothing wrong or over pace' : `${reviewIds.length} template${reviewIds.length === 1 ? '' : 's'} to revisit`}>
            Review the mistakes now
          </button>
          <button className="btn" onClick={() => nav.go({ name: 'run', config: { ...summary.config, seed: newSessionSeed() } })}>Same settings again</button>
          <button className="btn" onClick={() => nav.go({ name: 'run', config: summary.config })} title="Same seed, same questions">Replay this session</button>
          <button className="btn ghost" onClick={nav.home}>Home</button>
        </div>
      </div>

      <div className="card">
        <h2>Questions</h2>
        <p className="muted small">Click a row to see the question, your answer and the quick route. The line on each bar marks {PACE_SECONDS} s.</p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>Topic</th>
                <th className="hide-sm">Lvl</th>
                <th>Result</th>
                <th className="num">Time</th>
                <th className="tcell hide-sm">vs pace</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => {
                const r = resultLabel(a);
                const isOpen = open === a.index;
                const q = questions.get(a.index) ?? null;
                return [
                  <tr key={a.index} className="q-row" onClick={() => setOpen(isOpen ? null : a.index)} aria-expanded={isOpen}>
                    <td className="num">{a.index + 1}</td>
                    <td>{topicName(a.topic)}</td>
                    <td className="hide-sm">{a.level}</td>
                    <td className={r.cls}>{r.text}</td>
                    <td className={`num ${overPace(a) ? 'bad' : ''}`}>{formatSec(a.timeMs)}</td>
                    <td className="tcell hide-sm"><TimeBar ms={a.timeMs} maxMs={maxMs} /></td>
                  </tr>,
                  isOpen && (
                    <tr key={`${a.index}-d`} className="q-detail">
                      <td colSpan={6}><QuestionDetail attempt={a} question={q} /></td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid" style={{ marginTop: '1rem' }}>
        <div className="card" style={{ margin: 0 }}>
          <h2>Slowest five</h2>
          {report.slowest.length === 0 ? <p className="muted small">No questions recorded.</p> : (
            <ul className="list-plain">
              {report.slowest.map((a) => (
                <li key={a.index}>
                  <button className="btn sm ghost" onClick={() => setOpen(a.index)}>Q{a.index + 1}</button>
                  <span className="grow small">{topicName(a.topic)} · level {a.level}</span>
                  <span className={`mono small ${overPace(a) ? 'bad' : ''}`}>{formatSec(a.timeMs)}</span>
                  {!a.correct && <span className="pill bad">{a.skipped ? 'skipped' : 'wrong'}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card" style={{ margin: 0 }}>
          <h2>Topics to drill</h2>
          {report.topicsToDrill.length === 0 ? <p className="muted small">Nothing wrong or over pace. Nice.</p> : (
            <ul className="list-plain">
              {report.topicsToDrill.map((t) => (
                <li key={t.topic}>
                  <span className="grow small">{t.name}<br /><span className="muted tiny">{t.problems} of {t.n} wrong or over pace</span></span>
                  <button className="btn sm" onClick={() => drillTopic(t.topic)}>Drill</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Export</h2>
        <p className="muted small">A Markdown error ledger: score, pace, every question and the quick route for anything wrong or slow.</p>
        <div className="row">
          <button className="btn" onClick={() => void copyMarkdown()}>{copyState === 'done' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy Markdown'}</button>
          <button className="btn" onClick={downloadMarkdown}>Download .md</button>
        </div>
      </div>
    </main>
  );
}

function QuestionDetail({ attempt: a, question: q }: { attempt: Attempt; question: Question | null }) {
  if (!q) {
    return (
      <div className="q-detail-inner">
        <MathText className="q-stem" text={a.stem} />
        <p className="small" style={{ marginTop: '0.6rem' }}>
          <span className="muted">Your answer:</span> <span className="mono">{a.given || '(none)'}</span>
          <span className="muted"> · Correct:</span> <span className="mono">{a.answerText}</span>
        </p>
        <p className="muted tiny">The template <code>{a.templateId}</code> is no longer available, so the full solution cannot be shown.</p>
      </div>
    );
  }
  const givenKey = /^[A-H]$/.test(a.given) ? a.given : null;
  const chosen = givenKey ? q.options.find((o) => o.key === givenKey) : undefined;
  return (
    <div className="q-detail-inner">
      <MathText className="q-stem" text={q.stem} />
      <div className="options">
        {q.options.map((o) => {
          const cls = ['option', 'static'];
          if (o.correct) cls.push('correct');
          else if (o.key === givenKey) cls.push('wrong');
          return (
            <div key={o.key} className={cls.join(' ')}>
              <span className="key">{o.key}</span>
              <MathText inline text={o.display} />
              {o.key === givenKey && <span className="trap">your answer{!o.correct && o.trap ? `: ${o.trap}` : ''}</span>}
              {o.correct && o.key !== givenKey && <span className="trap">correct</span>}
            </div>
          );
        })}
      </div>
      <div className="small" style={{ marginTop: '0.75rem' }}>
        <span className="muted">Your answer:</span>{' '}
        <span className="mono">{a.skipped ? (a.timedOut ? 'timed out' : 'skipped') : a.given || '(none)'}</span>
        {chosen && !chosen.correct && chosen.trap ? <span className="muted"> ({chosen.trap})</span> : null}
        <span className="muted"> · Correct:</span> <MathText inline text={answerToDisplay(q.answer)} />
      </div>
      <div className="fb-solution">
        <MathText text={q.solution} />
      </div>
      <div className="small muted" style={{ marginTop: '0.4rem' }}>Trap: {q.trap}</div>
      <div className="tiny muted mono" style={{ marginTop: '0.4rem' }}>{q.templateId} · {a.questionSeed}</div>
    </div>
  );
}

export default Report;
