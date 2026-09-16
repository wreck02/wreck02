/**
 * Analytics: headline numbers, a sortable per-topic table that expands into per-template
 * rows, the time distribution against the 89 s pace, trends over sessions, the weakness
 * heatmap and gauntlet records. A module switch filters everything; every table row can
 * start a drill directly.
 */
import { Fragment, useMemo, useState } from 'react';
import type { Nav } from '../App';
import { useStore } from '../store';
import { Heatmap } from '../components/Heatmap';
import { Sparkline } from '../components/Sparkline';
import { Histogram } from '../components/Histogram';
import { TrendChart, type TrendPoint } from '../components/TrendChart';
import { SortTh, sortRows, type SortState } from '../components/StatTable';
import { templateDrillConfig } from '../components/drillConfig';
import { formatSec, median, moduleOfTopic, templateStats, timeDistribution, topicStats, trend, type Stats } from '../../core/analytics';
import { PACE_SECONDS, overPace, type Attempt } from '../../core/session';
import { getTemplate } from '../../core/registry';
import { TOPIC_BY_KEY } from '../../core/topics';
import type { Level, Module } from '../../core/template';
import { MODULE_OPTIONS, MODULE_SHORT, formatDate, pct } from '../labels';
import '../analytics.css';

type TopicSortKey = 'name' | 'n' | 'accuracy' | 'median' | 'gap' | 'over';

const SPARK_SESSIONS = 20;

/** Signed gap to the pace as a short cell value. */
function gapCell(sec: number): { text: string; cls: string } {
  if (!Number.isFinite(sec)) return { text: '–', cls: 'muted' };
  const r = Math.round(sec);
  if (r > 0) return { text: `+${r} s`, cls: 'bad' };
  if (r < 0) return { text: `−${-r} s`, cls: 'ok' };
  return { text: 'on pace', cls: 'muted' };
}

/** Longer form for the headline tile. */
function gapLine(sec: number): { text: string; cls: string } {
  if (!Number.isFinite(sec)) return { text: 'no data yet', cls: 'muted' };
  const r = Math.round(sec);
  if (r > 0) return { text: `${r} s over pace`, cls: 'bad' };
  if (r < 0) return { text: `${-r} s under pace`, cls: 'ok' };
  return { text: 'exactly on pace', cls: 'muted' };
}

function recordLabel(key: string): string {
  if (TOPIC_BY_KEY[key]) return TOPIC_BY_KEY[key].name;
  if (key in MODULE_SHORT) return `${MODULE_SHORT[key as Module | 'ALL']} · all topics`;
  return key;
}

function recordInModule(key: string, module: Module | 'ALL'): boolean {
  if (module === 'ALL') return true;
  return key === module || TOPIC_BY_KEY[key]?.module === module;
}

export function Analytics({ nav }: { nav: Nav }) {
  const { attempts, sessions, gauntletRecords, settings } = useStore();
  const [module, setModule] = useState<Module | 'ALL'>('ALL');
  const [sort, setSort] = useState<SortState<TopicSortKey>>({ key: 'accuracy', dir: 'asc' });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const filtered = useMemo(() => (module === 'ALL' ? attempts : attempts.filter((a) => a.module === module)), [attempts, module]);

  const headline = useMemo(() => {
    const n = filtered.length;
    const correct = filtered.filter((a) => a.correct).length;
    const med = median(filtered.map((a) => a.timeMs));
    const over = filtered.filter(overPace).length;
    const sessionCount = module === 'ALL' ? sessions.length : new Set(filtered.map((a) => a.sessionId)).size;
    const records = Object.entries(gauntletRecords).filter(([k]) => recordInModule(k, module));
    const bestSustained = records.reduce((m, [, r]) => Math.max(m, r.sustained), 0);
    const bestPeak = records.reduce((m, [, r]) => Math.max(m, r.peak), 0);
    return { n, accuracy: n ? correct / n : NaN, medianMs: med, gapSec: n ? med / 1000 - PACE_SECONDS : NaN, over, sessionCount, bestSustained, bestPeak, runs: records.reduce((s, [, r]) => s + r.runs, 0) };
  }, [filtered, sessions.length, gauntletRecords, module]);

  const topics = useMemo(() => topicStats(attempts, module), [attempts, module]);
  const sparks = useMemo(() => new Map(topics.map((s) => [s.key, trend(filtered, (a) => a.topic === s.key).slice(-SPARK_SESSIONS)])), [topics, filtered]);
  const sortedTopics = useMemo(() => {
    const get = (s: Stats): number | string => {
      switch (sort.key) {
        case 'name': return s.name;
        case 'n': return s.n;
        case 'accuracy': return s.accuracy;
        case 'median': return s.medianMs;
        case 'gap': return s.paceGapSec;
        case 'over': return s.overPaceCount;
      }
    };
    return sortRows(topics, sort.dir, get);
  }, [topics, sort]);

  const buckets = useMemo(() => timeDistribution(filtered), [filtered]);
  const sessionTrend = useMemo(() => trend(filtered), [filtered]);
  const accuracyPoints: TrendPoint[] = useMemo(() => sessionTrend.map((p) => ({
    value: p.accuracy,
    title: `${formatDate(p.at)} · ${pct(p.accuracy)} correct of ${p.n}`,
    xLabel: formatDate(p.at),
  })), [sessionTrend]);
  const medianPoints: TrendPoint[] = useMemo(() => sessionTrend.map((p) => ({
    value: p.medianMs / 1000,
    title: `${formatDate(p.at)} · median ${formatSec(p.medianMs)} over ${p.n} question${p.n === 1 ? '' : 's'}`,
    xLabel: formatDate(p.at),
  })), [sessionTrend]);
  const medianTop = useMemo(() => {
    const maxSec = Math.max(0, ...medianPoints.map((p) => p.value));
    return Math.max(120, Math.ceil((maxSec * 1.1) / 30) * 30);
  }, [medianPoints]);

  const records = useMemo(() => Object.entries(gauntletRecords)
    .filter(([k]) => recordInModule(k, module))
    .sort((a, b) => b[1].sustained - a[1].sustained || b[1].peak - a[1].peak || b[1].at - a[1].at), [gauntletRecords, module]);

  const toggle = (key: string) => setExpanded((s) => {
    const next = new Set(s);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const drillTopic = (topic: string, level?: Level) =>
    nav.go({ name: 'setup', mode: 'drill', prefill: { module: moduleOfTopic(topic) ?? 'ALL', topics: [topic], ...(level ? { level } : {}) } });
  const drillTemplate = (id: string) => {
    const config = templateDrillConfig(id, settings);
    if (config) nav.go({ name: 'run', config });
  };

  const moduleSwitch = (
    <div className="seg" role="group" aria-label="Module">
      {MODULE_OPTIONS.map((m) => (
        <button key={m} type="button" className={module === m ? 'active' : ''} aria-pressed={module === m} onClick={() => setModule(m)}>{MODULE_SHORT[m]}</button>
      ))}
    </div>
  );

  if (attempts.length === 0) {
    return (
      <main className="page wide">
        <div className="row between"><h1>Analytics</h1></div>
        <div className="card empty">
          <h2>Nothing to analyse yet</h2>
          <p className="muted">Every answered question is timed against the {PACE_SECONDS} s exam pace. Once you have finished a session this screen shows accuracy and pace by topic and template, how your times are distributed, trends across sessions and the weakness heatmap.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn primary" onClick={() => nav.go({ name: 'setup', mode: 'drill' })}>Start a drill</button>
            <button type="button" className="btn" onClick={() => nav.go({ name: 'setup', mode: 'sim' })}>Start a simulation</button>
          </div>
        </div>
      </main>
    );
  }

  const gap = gapLine(headline.gapSec);
  const scope = module === 'ALL' ? 'all modules' : MODULE_SHORT[module];

  return (
    <main className="page wide">
      <div className="row between">
        <h1>Analytics</h1>
        {moduleSwitch}
      </div>
      <p className="muted small">Everything below covers {scope}: {headline.n} question{headline.n === 1 ? '' : 's'} in {headline.sessionCount} session{headline.sessionCount === 1 ? '' : 's'}. Times are measured against the {PACE_SECONDS} s per question the ESAT allows.</p>

      {filtered.length === 0 ? (
        <div className="card empty">
          <h2>No {MODULE_SHORT[module]} attempts yet</h2>
          <p className="muted">Answer a few {MODULE_SHORT[module]} questions and this module fills in.</p>
          <button type="button" className="btn primary" onClick={() => nav.go({ name: 'setup', mode: 'drill', prefill: { module } })}>Drill {MODULE_SHORT[module]}</button>
        </div>
      ) : (
        <>
          <div className="tiles">
            <div className="stat"><div className="v">{headline.n}</div><div className="k">Questions answered</div></div>
            <div className="stat"><div className="v">{pct(headline.accuracy)}</div><div className="k">Accuracy</div></div>
            <div className="stat"><div className="v">{formatSec(headline.medianMs)}</div><div className="k">Median time</div><div className={`sub ${gap.cls}`}>{gap.text}</div></div>
            <div className="stat"><div className={`v ${headline.over ? 'bad' : ''}`}>{pct(headline.n ? headline.over / headline.n : NaN)}</div><div className="k">Over {PACE_SECONDS} s</div><div className="sub">{headline.over} of {headline.n}</div></div>
            <div className="stat"><div className="v">{headline.sessionCount}</div><div className="k">Sessions</div></div>
            <div className="stat">
              <div className="v">{headline.bestSustained ? `L${headline.bestSustained}` : '–'}</div>
              <div className="k">Best gauntlet level</div>
              <div className="sub">{headline.runs ? `sustained · peak L${headline.bestPeak} · ${headline.runs} run${headline.runs === 1 ? '' : 's'}` : 'no gauntlet runs yet'}</div>
            </div>
          </div>

          <section className="card">
            <div className="section-head">
              <h2>By topic</h2>
              <span className="muted small">Click a heading to sort, a topic to see its templates.</span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <SortTh k="name" label="Topic" sort={sort} onSort={setSort} />
                    <SortTh k="n" label="n" sort={sort} onSort={setSort} num title="Sort by number of questions" />
                    <SortTh k="accuracy" label="Accuracy" sort={sort} onSort={setSort} num />
                    <SortTh k="median" label="Median" sort={sort} onSort={setSort} num />
                    <th className="num hide-sm nowrap">p25–p75</th>
                    <SortTh k="gap" label={`vs ${PACE_SECONDS} s`} sort={sort} onSort={setSort} num title="Sort by gap to the pace" />
                    <SortTh k="over" label="Over pace" sort={sort} onSort={setSort} num className="hide-sm" />
                    <th className="hide-sm">Trend</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sortedTopics.map((s) => {
                    const open = expanded.has(s.key);
                    const g = gapCell(s.paceGapSec);
                    const spark = sparks.get(s.key) ?? [];
                    const mod = moduleOfTopic(s.key);
                    return (
                      <Fragment key={s.key}>
                        <tr className={`expandable${open ? ' expanded' : ''}`} onClick={() => toggle(s.key)}>
                          <td>
                            <button type="button" className="row-toggle" aria-expanded={open} aria-controls={`tpl-${s.key}`} onClick={(e) => { e.stopPropagation(); toggle(s.key); }}>
                              <span className="chev" aria-hidden="true">▸</span>
                              <span>{s.name}</span>
                            </button>
                            {module === 'ALL' && mod && <span className="sub">{MODULE_SHORT[mod]}</span>}
                          </td>
                          <td className="num">{s.n}</td>
                          <td className="num">{pct(s.accuracy)}</td>
                          <td className="num">{formatSec(s.medianMs)}</td>
                          <td className="num hide-sm nowrap">{formatSec(s.p25Ms)} – {formatSec(s.p75Ms)}</td>
                          <td className={`num nowrap ${g.cls}`}>{g.text}</td>
                          <td className="num hide-sm">{s.overPaceCount}</td>
                          <td className="hide-sm">
                            <Sparkline values={spark.map((p) => p.accuracy)} label={`Accuracy over the last ${spark.length} session${spark.length === 1 ? '' : 's'}: ${spark.map((p) => pct(p.accuracy)).join(', ')}`} />
                          </td>
                          <td className="actions">
                            <button type="button" className="btn sm" onClick={(e) => { e.stopPropagation(); drillTopic(s.key); }}>Drill</button>
                          </td>
                        </tr>
                        {open && (
                          <tr className="detail" id={`tpl-${s.key}`}>
                            <td colSpan={9}>
                              <TemplateTable attempts={filtered} topic={s.key} onDrill={drillTemplate} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid" style={{ marginTop: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            <section className="card">
              <h2>Time per question</h2>
              <Histogram buckets={buckets} paceSec={PACE_SECONDS} />
              <div className="chart-foot">
                <span>Median <b>{formatSec(headline.medianMs)}</b></span>
                <span>Over pace <b className={headline.over ? 'bad' : ''}>{pct(headline.n ? headline.over / headline.n : NaN)}</b> ({headline.over} of {headline.n})</span>
                <span>15 s buckets, the last one is everything over 180 s</span>
              </div>
            </section>
            <section className="card">
              <h2>Trend over sessions</h2>
              {sessionTrend.length < 2 && <p className="muted small">One session so far. The trend takes shape from the second session on.</p>}
              <p className="chart-title">Accuracy per session</p>
              <TrendChart points={accuracyPoints} yMax={1} ticks={[0, 0.5, 1]} format={(v) => `${Math.round(v * 100)}%`} label="Accuracy per session" height={150} />
              <p className="chart-title" style={{ marginTop: '0.75rem' }}>Median time per session</p>
              <TrendChart
                points={medianPoints}
                yMax={medianTop}
                ticks={[0, medianTop / 2, medianTop]}
                format={(v) => formatSec(v * 1000)}
                refLine={{ value: PACE_SECONDS, label: `${PACE_SECONDS} s pace` }}
                label="Median time per session"
                height={150}
              />
              <p className="muted tiny" style={{ marginTop: '0.4rem' }}>Hover or focus a point for the date and value.</p>
            </section>
          </div>

          <section className="card">
            <div className="section-head">
              <h2>Weakness heatmap</h2>
              <span className="muted small">Topic by level. Click a cell to drill it.</span>
            </div>
            <Heatmap attempts={attempts} module={module} onCell={drillTopic} />
          </section>

          <section className="card">
            <h2>Gauntlet records</h2>
            {records.length === 0 ? (
              <p className="muted small">No gauntlet runs {module === 'ALL' ? 'yet' : `for ${MODULE_SHORT[module]} yet`}. A level counts as sustained once you have answered five in a row correctly under pace at it.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Topic or module</th><th className="num">Sustained</th><th className="num">Peak</th><th className="num">Runs</th><th>Last run</th><th /></tr>
                  </thead>
                  <tbody>
                    {records.map(([key, r]) => (
                      <tr key={key}>
                        <td>{recordLabel(key)}</td>
                        <td className="num">{r.sustained ? `L${r.sustained}` : '–'}</td>
                        <td className="num">L{r.peak}</td>
                        <td className="num">{r.runs}</td>
                        <td>{formatDate(r.at)}</td>
                        <td className="actions">
                          <button type="button" className="btn sm" onClick={() => nav.go({ name: 'setup', mode: 'gauntlet', prefill: TOPIC_BY_KEY[key] ? { module: TOPIC_BY_KEY[key].module, topics: [key] } : { module: key in MODULE_SHORT ? (key as Module | 'ALL') : 'ALL' } })}>
                            Run again
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function TemplateTable({ attempts, topic, onDrill }: { attempts: Attempt[]; topic: string; onDrill: (id: string) => void }) {
  const rows = useMemo(() => templateStats(attempts, topic), [attempts, topic]);
  if (rows.length === 0) return <p className="muted small">No attempts for this topic.</p>;
  return (
    <div className="detail-inner" onClick={(e) => e.stopPropagation()}>
      <h3>Templates, weakest first</h3>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Template</th><th className="num">n</th><th className="num">Accuracy</th><th className="num">Median</th><th className="num nowrap">vs {PACE_SECONDS} s</th><th className="num hide-sm">Over pace</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const g = gapCell(s.paceGapSec);
              const known = !!getTemplate(s.key);
              return (
                <tr key={s.key}>
                  <td>{s.name}{!known && <span className="sub">template no longer available</span>}</td>
                  <td className="num">{s.n}</td>
                  <td className="num">{pct(s.accuracy)}</td>
                  <td className="num">{formatSec(s.medianMs)}</td>
                  <td className={`num nowrap ${g.cls}`}>{g.text}</td>
                  <td className="num hide-sm">{s.overPaceCount}</td>
                  <td className="actions">
                    <button type="button" className="btn sm" disabled={!known} onClick={() => onDrill(s.key)} title={known ? 'Ten questions from this template' : 'This template is no longer in the app'}>Drill this</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Analytics;
