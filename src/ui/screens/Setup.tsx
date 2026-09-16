import { useMemo, useState } from 'react';
import type { Nav } from '../App';
import { useStore } from '../store';
import { NumberField } from '../components/NumberField';
import {
  presetConfig, poolFor, PACE_SECONDS, SIM_QUESTIONS, SIM_SECONDS, SPRINT_QUESTIONS, SPRINT_SECONDS,
  type AnswerMode, type LevelChoice, type Mode, type SessionConfig,
} from '../../core/session';
import { newSessionSeed } from '../../core/rng';
import { TOPICS, type TopicInfo } from '../../core/topics';
import { templatesFor } from '../../core/registry';
import { LEVELS, MODULE_NAMES, type Module } from '../../core/template';
import { GAUNTLET_START, UP_AFTER, DOWN_AFTER } from '../../core/gauntlet';
import type { Settings } from '../../core/storage';
import { MODE_LABELS, MODULE_OPTIONS, MODULE_SHORT, clamp } from '../labels';

/** Topics that have at least one template (the registry is static, so compute once). */
const AVAILABLE_TOPICS: TopicInfo[] = TOPICS.filter((t) => templatesFor({ topics: [t.key] }).length > 0);

const COUNT_LIMITS: Partial<Record<Mode, { min: number; max: number; def: number }>> = {
  drill: { min: 5, max: 40, def: 10 },
  gauntlet: { min: 10, max: 60, def: 30 },
};

const DRILL_SECONDS = { min: 30, max: 180 };

function topicsIn(module: Module | 'ALL'): TopicInfo[] {
  return module === 'ALL' ? AVAILABLE_TOPICS : AVAILABLE_TOPICS.filter((t) => t.module === module);
}

function initialConfig(mode: Mode, prefill: Partial<SessionConfig> | undefined, settings: Settings): SessionConfig {
  const seed = prefill?.seed?.trim() || newSessionSeed();
  const fromSettings: Partial<SessionConfig> = mode === 'gauntlet'
    ? { answerMode: settings.answerMode }
    : { level: settings.defaultLevel, answerMode: settings.answerMode };
  const c = presetConfig(mode, seed, { ...fromSettings, ...prefill, seed });
  // Fixed-format modes: prefill may carry a seed/topics but never changes the exam shape.
  if (mode === 'sim') Object.assign(c, { count: SIM_QUESTIONS, timeLimitSec: SIM_SECONDS, answerMode: 'mc', immediateFeedback: false, timed: true });
  if (mode === 'sprint') Object.assign(c, { count: SPRINT_QUESTIONS, timeLimitSec: SPRINT_SECONDS, timed: true });
  if (mode === 'gauntlet') c.level = GAUNTLET_START; // the runner always starts a gauntlet at this level
  const limits = COUNT_LIMITS[mode];
  if (limits) c.count = clamp(c.count || limits.def, limits.min, limits.max);
  return c;
}

function initialTopics(module: Module | 'ALL', prefill: string[] | undefined): string[] {
  const inModule = topicsIn(module).map((t) => t.key);
  const wanted = (prefill ?? []).filter((k) => inModule.includes(k));
  return wanted.length > 0 ? wanted : inModule;
}

export function Setup(props: { nav: Nav; mode: Mode; prefill?: Partial<SessionConfig> }) {
  // Remount the form whenever the route's mode or prefill changes.
  return <SetupForm key={`${props.mode}:${JSON.stringify(props.prefill ?? {})}`} {...props} />;
}

function SetupForm({ nav, mode, prefill }: { nav: Nav; mode: Mode; prefill?: Partial<SessionConfig> }) {
  const { settings, updateSettings } = useStore();
  const [config, setConfig] = useState<SessionConfig>(() => initialConfig(mode, prefill, settings));
  const [selected, setSelected] = useState<string[]>(() => initialTopics(config.module, prefill?.topics));

  const set = (patch: Partial<SessionConfig>) => setConfig((c) => ({ ...c, ...patch }));

  const available = useMemo(() => topicsIn(config.module), [config.module]);
  const allSelected = available.length > 0 && available.every((t) => selected.includes(t.key));
  // Empty `topics` means "every topic in the module" to the session engine.
  const topics = allSelected ? [] : selected;
  const poolSize = selected.length === 0 ? 0 : poolFor({ module: config.module, topics }).length;

  const limits = COUNT_LIMITS[mode];
  const fixedCount = !limits;

  const chooseModule = (m: Module | 'ALL') => {
    const keep = selected.filter((k) => topicsIn(m).some((t) => t.key === k));
    setSelected(keep.length > 0 ? keep : topicsIn(m).map((t) => t.key));
    set({ module: m });
  };

  const toggleTopic = (key: string) =>
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));

  const start = () => {
    if (poolSize === 0) return;
    const seed = config.seed.trim() || newSessionSeed();
    const count = limits ? clamp(config.count || limits.def, limits.min, limits.max) : config.count;
    nav.go({ name: 'run', config: { ...config, seed, count, topics } });
  };

  if (mode === 'review') {
    return (
      <main className="page">
        <div className="card stack">
          <h1>Review</h1>
          <p className="muted">Review sessions are built from your error ledger, so they are set up on the Review screen.</p>
          <div className="row">
            <button type="button" className="btn primary" onClick={() => nav.go({ name: 'review' })}>Go to Review</button>
            <button type="button" className="btn ghost" onClick={nav.home}>Home</button>
          </div>
        </div>
      </main>
    );
  }

  const levelChoices: LevelChoice[] = [...LEVELS, 'mixed'];
  const groupedTopics: { module: Module; topics: TopicInfo[] }[] = (config.module === 'ALL' ? (['M1', 'M2', 'PHY'] as Module[]) : [config.module])
    .map((m) => ({ module: m, topics: available.filter((t) => t.module === m) }))
    .filter((g) => g.topics.length > 0);

  return (
    <main className="page">
      <form
        className="stack"
        onSubmit={(e) => { e.preventDefault(); start(); }}
      >
        <div className="row between">
          <h1>{MODE_LABELS[mode]}</h1>
          <button type="button" className="btn ghost sm" onClick={nav.home}>Back</button>
        </div>

        <div className="card stack">
          <div className="field">
            <span className="label">Module</span>
            <div className="seg" role="group" aria-label="Module">
              {MODULE_OPTIONS.map((m) => (
                <button key={m} type="button" className={config.module === m ? 'active' : ''} aria-pressed={config.module === m} onClick={() => chooseModule(m)}>
                  {MODULE_SHORT[m]}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <div className="row between">
              <span className="label">Topics <span className="hint">· {poolSize} template{poolSize === 1 ? '' : 's'} in this pool</span></span>
              <div className="row" style={{ gap: '0.25rem' }}>
                <button type="button" className="btn ghost sm" onClick={() => setSelected(available.map((t) => t.key))}>all</button>
                <button type="button" className="btn ghost sm" onClick={() => setSelected([])}>none</button>
              </div>
            </div>
            {groupedTopics.length === 0 && <p className="muted small">No templates for this module yet.</p>}
            {groupedTopics.map((g) => (
              <div key={g.module} className="stack" style={{ marginTop: '0.25rem' }}>
                {config.module === 'ALL' && <div className="tiny muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>{MODULE_NAMES[g.module]}</div>}
                <div className="checks">
                  {g.topics.map((t) => (
                    <label key={t.key}>
                      <input type="checkbox" checked={selected.includes(t.key)} onChange={() => toggleTopic(t.key)} />
                      <span>{t.name}</span>
                      <span className="tiny muted">({templatesFor({ topics: [t.key] }).length})</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {selected.length === 0 && groupedTopics.length > 0 && <p className="small bad">Tick at least one topic.</p>}
          </div>
        </div>

        <div className="card form-grid">
          <div className="field">
            <span className="label">Level</span>
            {mode === 'gauntlet' ? (
              <>
                <span className="pill">Starts at level {GAUNTLET_START}, then adapts</span>
                <span className="hint">Up after {UP_AFTER} correct under pace, down after {DOWN_AFTER} wrong.</span>
              </>
            ) : (
              <div className="seg" role="group" aria-label="Level">
                {levelChoices.map((l) => (
                  <button key={l} type="button" className={config.level === l ? 'active' : ''} aria-pressed={config.level === l} onClick={() => set({ level: l })}>
                    {l === 'mixed' ? 'Mixed' : l}
                  </button>
                ))}
              </div>
            )}
            {mode !== 'gauntlet' && config.level === 'mixed' && <span className="hint">Mixed draws mostly levels 2–4.</span>}
          </div>

          <div className="field">
            <label htmlFor="count">Questions</label>
            {fixedCount ? (
              <span className="pill">{config.count} questions, fixed for this mode</span>
            ) : (
              <NumberField id="count" value={config.count} min={limits.min} max={limits.max} onCommit={(n) => set({ count: n })} />
            )}
            {!fixedCount && <span className="hint">{limits.min}–{limits.max}</span>}
          </div>

          <div className="field">
            <span className="label">Answer mode</span>
            <div className="seg" role="group" aria-label="Answer mode">
              {(['typed', 'mc'] as AnswerMode[]).map((am) => (
                <button
                  key={am}
                  type="button"
                  className={config.answerMode === am ? 'active' : ''}
                  aria-pressed={config.answerMode === am}
                  disabled={mode === 'sim'}
                  onClick={() => set({ answerMode: am })}
                >
                  {am === 'typed' ? 'Typed' : 'Multiple choice'}
                </button>
              ))}
            </div>
            {mode === 'sim'
              ? <span className="hint">The ESAT is multiple choice, so the simulation is too.</span>
              : <span className="hint">Typed answers fall back to options where a question has no numeric answer.</span>}
          </div>

          <div className="field">
            <span className="label">Timing</span>
            {mode === 'drill' && (
              <div className="row">
                <label className="toggle">
                  <input type="checkbox" checked={config.timed} onChange={(e) => set({ timed: e.target.checked })} />
                  <span>Timed</span>
                </label>
                {config.timed && (
                  <span className="row" style={{ gap: '0.4rem' }}>
                    <NumberField ariaLabel="Seconds per question" value={settings.drillSecondsPerQuestion} min={DRILL_SECONDS.min} max={DRILL_SECONDS.max} onCommit={(n) => updateSettings({ drillSecondsPerQuestion: n })} />
                    <span className="small muted">s per question</span>
                  </span>
                )}
              </div>
            )}
            {mode === 'drill' && <span className="hint">{config.timed ? `A question ends when its time runs out. Over ${PACE_SECONDS} s still counts as over pace.` : `Untimed. Times are still recorded against the ${PACE_SECONDS} s pace.`}</span>}
            {mode === 'sprint' && <span className="small">{SPRINT_QUESTIONS} questions, {SPRINT_SECONDS / 60} minutes.</span>}
            {mode === 'sim' && <span className="small">{SIM_QUESTIONS} questions, {SIM_SECONDS / 60} minutes, no feedback until the end. You can move between questions.</span>}
            {mode === 'gauntlet' && <span className="small">Untimed session, but pace matters: under {PACE_SECONDS} s counts as under pace.</span>}
          </div>
        </div>

        <div className="card stack">
          <div className="field">
            <label htmlFor="seed">Seed</label>
            <div className="row">
              <input
                id="seed"
                className="input mono"
                style={{ maxWidth: '16rem' }}
                value={config.seed}
                onChange={(e) => set({ seed: e.target.value })}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
              <button type="button" className="btn sm" onClick={() => set({ seed: newSessionSeed() })}>New seed</button>
            </div>
            <span className="hint">The same seed with the same settings replays the same questions.</span>
          </div>
          <div className="row between">
            <span className="small muted">
              {MODE_LABELS[mode]} · {MODULE_SHORT[config.module]} · {allSelected ? 'all topics' : `${selected.length} topic${selected.length === 1 ? '' : 's'}`} · level {config.level} · {config.count} questions · {config.answerMode === 'mc' ? 'multiple choice' : 'typed'}
            </span>
            <button type="submit" className="btn primary" disabled={poolSize === 0}>Start</button>
          </div>
        </div>
      </form>
    </main>
  );
}

export default Setup;
