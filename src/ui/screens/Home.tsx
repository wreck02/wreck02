import { useMemo, useState } from 'react';
import type { Nav } from '../App';
import { useStore } from '../store';
import { Heatmap } from '../components/Heatmap';
import { ModeCard } from '../components/ModeCard';
import { TEMPLATES } from '../../core/registry';
import { PACE_SECONDS, SIM_QUESTIONS, SIM_SECONDS, SPRINT_QUESTIONS, SPRINT_SECONDS, type Mode } from '../../core/session';
import { formatSec, groupBy, median, weakestTopics } from '../../core/analytics';
import { daysUntilExam } from '../../core/constants';
import { reviewQueue } from '../../core/srs';
import { TOPIC_BY_KEY } from '../../core/topics';
import { GAUNTLET_START, UP_AFTER, DOWN_AFTER } from '../../core/gauntlet';
import type { Level, Module } from '../../core/template';
import { MODE_LABELS, MODULE_OPTIONS, MODULE_SHORT, formatDate, pct } from '../labels';
import '../home.css';

const REPLAY_MODES: Mode[] = ['drill', 'sim', 'sprint', 'gauntlet'];

function examLine(days: number): string {
  if (days > 1) return `${days} days until the ESAT`;
  if (days === 1) return 'The ESAT is tomorrow';
  if (days > -5) return 'ESAT week';
  return 'The ESAT window has passed';
}

export function Home({ nav }: { nav: Nav }) {
  const { attempts, sessions, ledger } = useStore();
  const [heatModule, setHeatModule] = useState<Module | 'ALL'>('ALL');
  const [seed, setSeed] = useState('');
  const [replayMode, setReplayMode] = useState<Mode>('drill');

  const due = useMemo(() => reviewQueue(ledger).filter((i) => i.due).length, [ledger]);

  const stats = useMemo(() => {
    const n = attempts.length;
    const correct = attempts.filter((a) => a.correct).length;
    const med = median(attempts.map((a) => a.timeMs));
    return { n, accuracy: n ? correct / n : NaN, medianMs: med, gapSec: n ? med / 1000 - PACE_SECONDS : NaN };
  }, [attempts]);

  const weakest = useMemo(() => weakestTopics(attempts), [attempts]);

  const recent = useMemo(() => {
    const bySession = groupBy(attempts, (a) => a.sessionId);
    return [...sessions]
      .sort((a, b) => b.finishedAt - a.finishedAt)
      .slice(0, 8)
      .map((s) => ({ s, medianMs: median((bySession.get(s.id) ?? []).map((a) => a.timeMs)) }));
  }, [sessions, attempts]);

  const drillTopic = (topic: string, level?: Level) =>
    nav.go({ name: 'setup', mode: 'drill', prefill: { module: TOPIC_BY_KEY[topic]?.module ?? 'ALL', topics: [topic], ...(level ? { level } : {}) } });

  const replay = () => {
    const s = seed.trim();
    if (!s) return;
    nav.go({ name: 'setup', mode: replayMode, prefill: { seed: s } });
  };

  const days = daysUntilExam();
  const topicCount = new Set(TEMPLATES.map((t) => t.topic)).size;

  return (
    <main className="page wide">
      <header className="hero">
        <h1>ESAT Mental Maths</h1>
        <span className={`pill ${days <= 14 ? 'warn' : 'accent'}`}>{examLine(days)} · 12–16 October 2026</span>
        <p className="purpose muted">{SIM_QUESTIONS} questions in {SIM_SECONDS / 60} minutes: {PACE_SECONDS} seconds each, no calculator.</p>
      </header>

      <div className="grid modes">
        <ModeCard title="Topic drill" description="Pick a module, topics and level. Feedback after every question." onStart={() => nav.go({ name: 'setup', mode: 'drill' })} />
        <ModeCard title="ESAT simulation" description={`${SIM_QUESTIONS} multiple-choice questions in ${SIM_SECONDS / 60} minutes, one module, marked at the end.`} onStart={() => nav.go({ name: 'setup', mode: 'sim' })} />
        <ModeCard title="Sprint" description={`${SPRINT_QUESTIONS} questions in ${SPRINT_SECONDS / 60} minutes. Pace under pressure.`} onStart={() => nav.go({ name: 'setup', mode: 'sprint' })} />
        <ModeCard title="Gauntlet" description={`Adaptive levels: start at ${GAUNTLET_START}, up after ${UP_AFTER} correct under pace, down after ${DOWN_AFTER} wrong.`} onStart={() => nav.go({ name: 'setup', mode: 'gauntlet' })} />
        <ModeCard title="Facts drill" description="Squares, cubes, powers, primes, trig values and constants at speed." onStart={() => nav.go({ name: 'facts' })} />
        <ModeCard
          title="Review"
          description="Your error ledger, scheduled by spaced repetition. Wrong or slow questions come back until they are quick."
          meta={<span className={`pill ${due > 0 ? 'warn' : ''}`}>{due} due</span>}
          cta="Review"
          onStart={() => nav.go({ name: 'review' })}
        />
      </div>

      <section className="section">
        <div className="stats">
          <div className="stat"><div className="v">{sessions.length}</div><div className="k">Sessions</div></div>
          <div className="stat"><div className="v">{stats.n}</div><div className="k">Questions answered</div></div>
          <div className="stat"><div className="v">{pct(stats.accuracy)}</div><div className="k">Accuracy</div>{stats.n === 0 && <div className="sub">no data yet</div>}</div>
          <div className="stat">
            <div className="v">{formatSec(stats.medianMs)}</div>
            <div className="k">Median time</div>
            <div className={`sub ${stats.gapSec > 0 ? 'bad' : stats.gapSec < 0 ? 'ok' : ''}`}>
              {Number.isFinite(stats.gapSec)
                ? (stats.gapSec > 0 ? `${Math.round(stats.gapSec)} s over the ${PACE_SECONDS} s pace` : `${Math.round(-stats.gapSec)} s under the ${PACE_SECONDS} s pace`)
                : 'no data yet'}
            </div>
          </div>
          <div className="stat"><div className="v">{TEMPLATES.length}</div><div className="k">Templates</div><div className="sub">{topicCount} topics</div></div>
        </div>
      </section>

      <section className="section card">
        <div className="section-head">
          <h2>Weakness heatmap</h2>
          <div className="seg" role="group" aria-label="Module">
            {MODULE_OPTIONS.map((m) => (
              <button key={m} type="button" className={heatModule === m ? 'active' : ''} aria-pressed={heatModule === m} onClick={() => setHeatModule(m)}>{MODULE_SHORT[m]}</button>
            ))}
          </div>
        </div>
        {attempts.length === 0 && <p className="muted small">No attempts yet. Every cell fills in as you practise; click any cell to drill that topic at that level.</p>}
        <Heatmap attempts={attempts} module={heatModule} onCell={drillTopic} />
      </section>

      <div className="grid section" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <section className="card">
          <h2>Weakest topics</h2>
          {weakest.length === 0 ? (
            <p className="muted small">Answer at least three questions in a topic and it can appear here.</p>
          ) : (
            <ul className="list">
              {weakest.map((s) => (
                <li key={s.key}>
                  <div className="grow">
                    <div>{s.name}</div>
                    <div className="tiny muted">{pct(s.accuracy)} of {s.n} · median {formatSec(s.medianMs)}</div>
                  </div>
                  <button type="button" className="btn sm" onClick={() => drillTopic(s.key)}>Drill</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Replay a seed</h2>
          <p className="muted small">Every session has a seed such as <code>ESAT-K7Q2M9</code>. The same seed and settings give the same questions.</p>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); replay(); }}>
            <input className="input mono" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="ESAT-K7Q2M9" aria-label="Seed" autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
            <div className="row">
              <div className="seg" role="group" aria-label="Mode">
                {REPLAY_MODES.map((m) => (
                  <button key={m} type="button" className={replayMode === m ? 'active' : ''} aria-pressed={replayMode === m} onClick={() => setReplayMode(m)}>{MODE_LABELS[m]}</button>
                ))}
              </div>
              <button type="submit" className="btn" disabled={!seed.trim()}>Set up</button>
            </div>
          </form>
        </section>
      </div>

      <section className="section card">
        <h2>Recent sessions</h2>
        {recent.length === 0 ? (
          <p className="muted small">No sessions yet. Finished sessions appear here with a link to their report.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Date</th><th>Mode</th><th>Module</th><th className="num">Score</th><th className="num">Median</th><th /></tr>
              </thead>
              <tbody>
                {recent.map(({ s, medianMs }) => (
                  <tr key={s.id}>
                    <td>{formatDate(s.finishedAt)}</td>
                    <td>{MODE_LABELS[s.mode]}{s.mode === 'gauntlet' && s.peakLevel ? ` (peak L${s.peakLevel})` : ''}</td>
                    <td>{MODULE_SHORT[s.module]}</td>
                    <td className="num">{s.correct}/{s.count}{s.count ? ` (${Math.round((100 * s.correct) / s.count)}%)` : ''}</td>
                    <td className="num">{formatSec(medianMs)}</td>
                    <td className="num"><button type="button" className="btn sm" onClick={() => nav.go({ name: 'report', sessionId: s.id })}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

export default Home;
