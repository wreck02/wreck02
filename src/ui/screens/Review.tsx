/**
 * Review: the error ledger (templates failed or answered over pace, scheduled by spaced
 * repetition), controls to start a review session from it, the recent mistakes with
 * their regenerated questions, and a Markdown export of the whole ledger.
 */
import { useMemo, useState } from 'react';
import type { Nav } from '../App';
import { useStore } from '../store';
import { NumberField } from '../components/NumberField';
import { useNow } from '../components/useTicker';
import { MathText } from '../components/MathText';
import { reviewQueue, reviewWeights, type ReviewItem } from '../../core/srs';
import { overPace, presetConfig, regenerateFromAttempt, PACE_SECONDS, type AnswerMode, type Attempt, type LevelChoice } from '../../core/session';
import { newSessionSeed } from '../../core/rng';
import { formatSec } from '../../core/analytics';
import { answerToDisplay } from '../../core/answers';
import { ledgerToMarkdown } from '../../core/export';
import { getTemplate } from '../../core/registry';
import { LEVELS, type Question } from '../../core/template';
import { TOPIC_BY_KEY, topicName } from '../../core/topics';
import { MODULE_SHORT, clamp, formatDate } from '../labels';
import { templateDrillConfig } from '../components/drillConfig';
import '../analytics.css';

const RECENT_LIMIT = 30;
const COUNT = { min: 5, max: 20, def: 10 };

/** "2 h ago", "in 3 d", "just now". */
export function relativeTime(ts: number, now: number): string {
  const diff = ts - now;
  const abs = Math.abs(diff);
  const min = 60e3, hour = 3600e3, day = 86400e3;
  if (abs < min) return diff <= 0 ? 'just now' : 'now';
  const text = abs < hour ? `${Math.round(abs / min)} min` : abs < day ? `${Math.round(abs / hour)} h` : abs < 14 * day ? `${Math.round(abs / day)} d` : `${Math.round(abs / (7 * day))} w`;
  return diff < 0 ? `${text} ago` : `in ${text}`;
}

/** One-line preview of a stem: display maths becomes inline and paragraph breaks collapse. */
function previewStem(stem: string): string {
  return stem.replace(/\$\$/g, '$').replace(/\s*\n+\s*/g, ' ').trim();
}

function verdict(a: Attempt): { text: string; cls: string } {
  if (a.timedOut && !a.correct) return { text: 'timed out', cls: 'bad' };
  if (a.skipped) return { text: 'skipped', cls: 'bad' };
  if (!a.correct) return { text: 'wrong', cls: 'bad' };
  return { text: 'slow', cls: 'warn' };
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

export function Review({ nav }: { nav: Nav }) {
  const { settings, attempts, sessions, ledger, forgetLedgerEntry } = useStore();
  // Refresh once a minute so "due" pills and relative times stay right while the tab is open.
  const now = useNow(60_000);
  const queue = useMemo(() => reviewQueue(ledger, now), [ledger, now]);
  const dueItems = useMemo(() => queue.filter((i) => i.due), [queue]);
  const ledgerSize = Object.keys(ledger).length;

  const [filter, setFilter] = useState<'due' | 'all'>('all');
  const [count, setCount] = useState(COUNT.def);
  const [answerMode, setAnswerMode] = useState<AnswerMode>(settings.answerMode);
  const [level, setLevel] = useState<LevelChoice>('mixed');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'failed'>('idle');

  const shown = filter === 'due' ? dueItems : queue;
  const maxWeight = queue.reduce((m, i) => Math.max(m, i.weight), 0) || 1;

  const mistakes = useMemo(
    () => attempts.filter((a) => !a.correct || a.skipped || overPace(a)).sort((a, b) => b.at - a.at).slice(0, RECENT_LIMIT),
    [attempts],
  );
  const storedSessions = useMemo(() => new Set(sessions.map((s) => s.id)), [sessions]);

  const start = (items: ReviewItem[]) => {
    if (items.length === 0) return;
    const ids = items.map((i) => i.templateId);
    const all = reviewWeights(ledger, now);
    const weights = Object.fromEntries(ids.map((id) => [id, all[id] ?? 1]));
    nav.go({
      name: 'run',
      config: presetConfig('review', newSessionSeed(), {
        templateIds: ids,
        weights,
        count: clamp(count, COUNT.min, COUNT.max),
        answerMode,
        level,
        module: 'ALL',
        topics: [],
      }),
    });
  };

  const forget = (item: ReviewItem) => {
    if (window.confirm(`Forget "${item.title}"? Its ${item.failures} failure${item.failures === 1 ? '' : 's'} and ${item.successes} clean answer${item.successes === 1 ? '' : 's'} leave the ledger. A new mistake adds it back.`)) {
      forgetLedgerEntry(item.templateId);
    }
  };

  const practise = (templateId: string) => {
    const config = templateDrillConfig(templateId, settings);
    if (config) nav.go({ name: 'run', config });
  };

  const markdown = () => ledgerToMarkdown(attempts, ledger, { now: Date.now() });
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
    const blob = new Blob([markdown()], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `esat-error-ledger-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <main className="page wide">
      <div className="row between">
        <h1>Review</h1>
        <span className={`pill ${dueItems.length > 0 ? 'warn' : ''}`}>{dueItems.length} due</span>
      </div>
      <p className="muted small">
        A wrong, skipped or over-pace ({PACE_SECONDS} s) answer puts its template in the ledger; recent failures weigh more; clean, on-pace answers in a review session push the next review out.
      </p>

      <section className="card">
        <div className="section-head">
          <h2>Review queue</h2>
          <div className="seg" role="group" aria-label="Show">
            <button type="button" className={filter === 'due' ? 'active' : ''} aria-pressed={filter === 'due'} onClick={() => setFilter('due')}>Due ({dueItems.length})</button>
            <button type="button" className={filter === 'all' ? 'active' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All ({queue.length})</button>
          </div>
        </div>
        {queue.length === 0 ? (
          <div className="empty">
            <p className="muted">
              {ledgerSize === 0
                ? 'The ledger is empty. Finish a drill, sprint or simulation and anything wrong, skipped or slower than the pace appears here.'
                : 'Everything in the ledger has been cleared by clean, on-pace review answers. New mistakes bring templates back.'}
            </p>
            <button type="button" className="btn primary" onClick={() => nav.go({ name: 'setup', mode: 'drill' })}>Start a drill</button>
          </div>
        ) : shown.length === 0 ? (
          <p className="muted small">Nothing is due right now. The next review is {relativeTime(Math.min(...queue.map((i) => i.dueAt)), now)}; switch to All to review early.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Template</th>
                  <th>Topic</th>
                  <th className="num">Failures</th>
                  <th className="num hide-sm">Clean</th>
                  <th className="hide-sm">Last failed</th>
                  <th>Due</th>
                  <th className="hide-sm">Weight</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((i) => {
                  const info = TOPIC_BY_KEY[i.topic];
                  return (
                    <tr key={i.templateId}>
                      <td>{i.title}<span className="sub mono">{i.templateId}</span></td>
                      <td>
                        {topicName(i.topic)}
                        {info && <span className="sub"><span className="pill">{MODULE_SHORT[info.module]}</span></span>}
                      </td>
                      <td className="num">{i.failures}</td>
                      <td className="num hide-sm">{i.successes}</td>
                      <td className="hide-sm nowrap" title={i.lastFailedAt ? formatDate(i.lastFailedAt) : undefined}>{i.lastFailedAt ? relativeTime(i.lastFailedAt, now) : '–'}</td>
                      <td className="nowrap">
                        {i.due ? <span className="pill warn">due</span> : <span className="pill" title={formatDate(i.dueAt)}>{relativeTime(i.dueAt, now)}</span>}
                      </td>
                      <td className="hide-sm">
                        <div className="wbar" role="img" aria-label={`weight ${i.weight.toFixed(2)}`} title={`weight ${i.weight.toFixed(2)} of ${maxWeight.toFixed(2)}`}>
                          <div className="fill" style={{ width: `${Math.max(4, Math.round((100 * i.weight) / maxWeight))}%` }} />
                        </div>
                      </td>
                      <td className="actions">
                        <button type="button" className="btn sm ghost" onClick={() => forget(i)} title="Remove this template from the ledger">Forget</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Start a review session</h2>
        <p className="muted small">Templates are drawn in proportion to their weight, so what you failed most recently comes up most. Answers are marked immediately.</p>
        <div className="review-controls">
          <div className="field">
            <label htmlFor="review-count">Questions</label>
            <NumberField id="review-count" value={count} min={COUNT.min} max={COUNT.max} onCommit={setCount} />
            <span className="hint">{COUNT.min}–{COUNT.max}</span>
          </div>
          <div className="field">
            <span className="label">Answer mode</span>
            <div className="seg" role="group" aria-label="Answer mode">
              {(['typed', 'mc'] as AnswerMode[]).map((am) => (
                <button key={am} type="button" className={answerMode === am ? 'active' : ''} aria-pressed={answerMode === am} onClick={() => setAnswerMode(am)}>
                  {am === 'typed' ? 'Typed' : 'Multiple choice'}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="label">Level</span>
            <div className="seg" role="group" aria-label="Level">
              {([...LEVELS, 'mixed'] as LevelChoice[]).map((l) => (
                <button key={l} type="button" className={level === l ? 'active' : ''} aria-pressed={level === l} onClick={() => setLevel(l)}>{l === 'mixed' ? 'Mixed' : l}</button>
              ))}
            </div>
            <span className="hint">{level === 'mixed' ? 'Mixed draws mostly levels 2–4.' : `Every question at level ${level}.`}</span>
          </div>
        </div>
        <div className="review-start">
          <button type="button" className="btn primary" disabled={queue.length === 0} onClick={() => start(queue)} title={queue.length === 0 ? 'The ledger is empty' : `${queue.length} template${queue.length === 1 ? '' : 's'} in the pool`}>
            Start review{queue.length ? ` (${queue.length} template${queue.length === 1 ? '' : 's'})` : ''}
          </button>
          <button type="button" className="btn" disabled={dueItems.length === 0} onClick={() => start(dueItems)} title={dueItems.length === 0 ? 'Nothing is due right now' : `${dueItems.length} due template${dueItems.length === 1 ? '' : 's'}`}>
            Review only what is due{dueItems.length ? ` (${dueItems.length})` : ''}
          </button>
          {queue.length === 0 && <span className="muted small">Nothing to review yet.</span>}
        </div>
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Recent mistakes</h2>
          <span className="muted small">The last {RECENT_LIMIT} wrong, skipped or over-pace answers, newest first.</span>
        </div>
        {mistakes.length === 0 ? (
          <p className="muted small">No mistakes recorded yet.</p>
        ) : (
          <ul className="mistakes">
            {mistakes.map((a) => {
              const key = `${a.sessionId}:${a.index}`;
              const open = openKey === key;
              const v = verdict(a);
              const t = getTemplate(a.templateId);
              return (
                <li key={key}>
                  <button type="button" className="mistake-head" aria-expanded={open} aria-controls={`mistake-${a.sessionId}-${a.index}`} onClick={() => setOpenKey(open ? null : key)}>
                    <span className={`pill ${v.cls}`}>{v.text}</span>
                    <span className="grow">
                      <span className="title">{t?.title ?? a.templateId}</span>
                      <span className="muted small"> · {topicName(a.topic)} · level {a.level}</span>
                      <span className="preview"><MathText inline text={previewStem(a.stem)} /></span>
                    </span>
                    <span className={`mono small ${overPace(a) ? 'bad' : ''}`}>{formatSec(a.timeMs)}</span>
                    <span className="when" title={formatDate(a.at)}>{relativeTime(a.at, now)}</span>
                    <span className="chev" aria-hidden="true">▸</span>
                  </button>
                  {open && (
                    <div className="mistake-body" id={`mistake-${a.sessionId}-${a.index}`}>
                      <MistakeDetail attempt={a} />
                      <div className="mistake-actions">
                        <button type="button" className="btn sm primary" disabled={!t} onClick={() => practise(a.templateId)} title={t ? 'Ten questions from this template' : 'This template is no longer in the app'}>Practise this template</button>
                        <button type="button" className="btn sm" disabled={!storedSessions.has(a.sessionId)} onClick={() => nav.go({ name: 'report', sessionId: a.sessionId })} title={storedSessions.has(a.sessionId) ? 'Open the session report' : 'The session report is no longer stored'}>Session report</button>
                        <span className="tiny muted mono">{a.templateId} · {a.questionSeed}</span>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Export the ledger</h2>
        <p className="muted small">A Markdown document grouped by topic and template: for each template, its recent mistakes with the question, the answer, the quick route and the trap.</p>
        <div className="row">
          <button type="button" className="btn" onClick={() => void copyMarkdown()} disabled={ledgerSize === 0 && mistakes.length === 0}>{copyState === 'done' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy Markdown'}</button>
          <button type="button" className="btn" onClick={downloadMarkdown} disabled={ledgerSize === 0 && mistakes.length === 0}>Download .md</button>
        </div>
      </section>
    </main>
  );
}

function MistakeDetail({ attempt: a }: { attempt: Attempt }) {
  const q: Question | null = useMemo(() => regenerateFromAttempt(a), [a]);
  const givenKey = /^[A-H]$/.test(a.given) ? a.given : null;
  const chosen = q && givenKey ? q.options.find((o) => o.key === givenKey) : undefined;
  const givenText = a.skipped ? (a.timedOut ? 'timed out' : 'skipped') : a.given || '(none)';
  if (!q) {
    return (
      <div>
        <MathText className="q-stem" text={a.stem} />
        <div className="answers">
          <div><span className="lbl">Correct</span><span className="mono">{a.answerText}</span></div>
          <div><span className="lbl">You gave</span><span className="mono">{givenText}</span></div>
        </div>
        <p className="muted tiny" style={{ marginTop: '0.5rem' }}>The template <code>{a.templateId}</code> is no longer available, so the solution cannot be regenerated.</p>
      </div>
    );
  }
  return (
    <div>
      <MathText className="q-stem" text={q.stem} />
      <div className="answers">
        <div><span className="lbl">Correct</span><MathText inline text={answerToDisplay(q.answer)} /></div>
        <div>
          <span className="lbl">You gave</span>
          {chosen ? (
            <>
              <span className="mono">{chosen.key}</span>: <MathText inline text={chosen.display} />
              {!chosen.correct && chosen.trap && <span className="muted"> ({chosen.trap})</span>}
              {chosen.correct && <span className="muted"> (correct, but over pace)</span>}
            </>
          ) : (
            <span className="mono">{givenText}</span>
          )}
        </div>
      </div>
      <div className="solution">
        <MathText text={q.solution} />
      </div>
      <div className="small muted" style={{ marginTop: '0.4rem' }}>Trap: {q.trap}</div>
    </div>
  );
}

export default Review;
