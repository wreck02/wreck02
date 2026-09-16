/**
 * Session runner: drill, sprint, exam sim, gauntlet and review all share this
 * screen. Immediate-feedback modes reveal the answer after each question; the
 * sim behaves like the paper (free navigation, palette, results only at the end).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Nav } from '../App';
import { useStore } from '../store';
import {
  buildSession, makeQuestion, newSessionId, poolFor, PACE_SECONDS,
  type Attempt, type Mode, type QuestionRecord, type SessionConfig,
} from '../../core/session';
import { RNG } from '../../core/rng';
import { gauntletStep, initialGauntlet, GAUNTLET_START, type GauntletState } from '../../core/gauntlet';
import type { Level } from '../../core/template';
import { answerToDisplay, answerToPlain, checkAnswer } from '../../core/answers';
import { formatSec } from '../../core/analytics';
import { TEMPLATES } from '../../core/registry';
import { MathText } from '../components/MathText';
import { QuestionCard } from '../components/QuestionCard';
import { OptionList } from '../components/OptionList';
import { TypedAnswer } from '../components/TypedAnswer';
import { SessionTimer, QuestionTimer } from '../components/Timer';
import { PaceBar } from '../components/PaceBar';
import { QuestionPalette } from '../components/QuestionPalette';
import { useKeyboard, optionKeyFor } from '../components/useKeyboard';
import '../runner.css';

export const MODE_NAMES: Record<Mode, string> = {
  drill: 'Drill',
  sprint: 'Sprint',
  sim: 'Exam sim',
  gauntlet: 'Gauntlet',
  review: 'Review',
};

interface Result {
  correct: boolean;
  given: string;
  skipped: boolean;
  timedOut: boolean;
  echo?: string;
  error?: string;
}

interface Slot {
  record: QuestionRecord;
  /** the typed box is this question's answer UI (typed mode and the template allows it) */
  typedUsed: boolean;
  /** highlighted / recorded option key */
  selected: string | null;
  typed: string;
  /** sim: explicitly marked "no answer" */
  noAnswer: boolean;
  flagged: boolean;
  /** banked time on this question, ms */
  timeMs: number;
  /** immediate modes: set when the question is submitted */
  result: Result | null;
}

function slotFor(config: SessionConfig, record: QuestionRecord): Slot {
  return {
    record,
    typedUsed: config.answerMode === 'typed' && record.question.typedAllowed,
    selected: null,
    typed: '',
    noAnswer: false,
    flagged: false,
    timeMs: 0,
    result: null,
  };
}

/** Gauntlet: one question at a time, template drawn per index from a seeded RNG, never the same template twice running. */
function gauntletQuestion(config: SessionConfig, index: number, level: Level, lastTemplateId: string | null): QuestionRecord {
  const pool = poolFor(config);
  const rng = new RNG(`${config.seed}:gauntlet`).child(index);
  const candidates = pool.length > 1 && lastTemplateId ? pool.filter((t) => t.id !== lastTemplateId) : pool;
  return makeQuestion(config, index, rng.pick(candidates), level);
}

type FinishReason = 'complete' | 'user' | 'timeout';

export function Runner({ nav, config }: { nav: Nav; config: SessionConfig }) {
  const store = useStore();
  const { settings } = store;
  const immediate = config.immediateFeedback;
  const isGauntlet = config.mode === 'gauntlet';
  const isSim = !immediate;
  const drillLimit = settings.drillSecondsPerQuestion;
  const perQuestionLimitSec = immediate && config.timed && !config.timeLimitSec && drillLimit > 0 ? drillLimit : undefined;
  const showTimer = settings.showTimer !== false;

  const [startedAt] = useState(() => Date.now());
  const sessionId = useMemo(() => newSessionId(config.seed, startedAt), [config.seed, startedAt]);
  const gauntletStart: Level = config.level === 'mixed' ? GAUNTLET_START : config.level;
  const [gState, setGState] = useState<GauntletState>(() => initialGauntlet(gauntletStart));
  const [setupError, setSetupError] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>(() => {
    try {
      if (TEMPLATES.length === 0) throw new Error('No question templates are registered yet.');
      if (poolFor(config).length === 0) throw new Error('No question templates match this selection yet. Choose another module or topic.');
      if (isGauntlet) return [slotFor(config, gauntletQuestion(config, 0, gauntletStart, null))];
      return buildSession(config).map((r) => slotFor(config, r));
    } catch (e) {
      queueMicrotask(() => setSetupError((e as Error).message));
      return [];
    }
  });
  const [index, setIndex] = useState(0);
  const [activeSince, setActiveSince] = useState<number | null>(() => Date.now());
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);

  const total = isGauntlet ? config.count : slots.length;
  const slot: Slot | undefined = slots[index];

  // Latest values for callbacks fired from timers.
  const latest = useRef({ slots, index, activeSince, gState });
  latest.current = { slots, index, activeSince, gState };
  const finishedRef = useRef(false);

  const patchSlot = (i: number, fn: (s: Slot) => Slot) => setSlots((all) => all.map((s, j) => (j === i ? fn(s) : s)));

  const showToast = (text: string) => setToast({ text, id: Date.now() });
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  // ---- attempts + finishing ------------------------------------------------

  const toAttempt = (s: Slot, i: number, res: Result, timeMs: number): Attempt => {
    const q = s.record.question;
    return {
      id: `${sessionId}:${i}`,
      sessionId,
      sessionSeed: config.seed,
      mode: config.mode,
      index: i,
      templateId: q.templateId,
      module: q.module,
      topic: q.topic,
      level: q.level,
      correct: res.correct,
      skipped: res.skipped,
      timedOut: res.timedOut,
      timeMs: Math.max(0, Math.round(timeMs)),
      given: res.given,
      answerMode: s.typedUsed ? 'typed' : 'mc',
      at: Date.now(),
      questionSeed: s.record.seed,
      stem: q.stem,
      answerText: answerToPlain(q.answer),
    };
  };

  const finish = (reason: FinishReason) => {
    if (finishedRef.current) return;
    const cur = latest.current;
    const now = Date.now();
    const attempts: Attempt[] = [];
    cur.slots.forEach((s, i) => {
      const timeMs = s.timeMs + (i === cur.index && cur.activeSince !== null ? now - cur.activeSince : 0);
      let res: Result | null = s.result;
      if (immediate) {
        if (!res) {
          // Only the question on screen when the clock ran out counts; an abandoned one does not.
          if (reason === 'timeout' && i === cur.index) res = { correct: false, given: '', skipped: false, timedOut: true };
          else return;
        }
      } else {
        const q = s.record.question;
        const given = s.typedUsed ? s.typed.trim() : (s.selected ?? '');
        if (given === '') {
          const ranOut = reason === 'timeout' && !s.noAnswer;
          res = { correct: false, given: '', skipped: true, timedOut: ranOut };
        } else {
          const r = checkAnswer(given, q.answer, q.options);
          res = { correct: r.correct, given, skipped: false, timedOut: false, echo: r.echo, error: r.error };
        }
      }
      attempts.push(toAttempt(s, i, res, timeMs));
    });
    finishedRef.current = true;
    if (attempts.length === 0) { nav.home(); return; }
    const g = cur.gState;
    const topicKey = config.topics.length === 1 ? config.topics[0] : config.module;
    const extra = isGauntlet ? { peakLevel: g.peak, gauntlet: { topicKey, state: g } } : undefined;
    store.finishSession(config, sessionId, startedAt, attempts, extra);
    nav.go({ name: 'report', sessionId });
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  // ---- immediate-feedback flow --------------------------------------------

  const submit = (given: string | null, flags: { skipped?: boolean; timedOut?: boolean } = {}) => {
    if (finishedRef.current) return;
    const cur = latest.current;
    const s = cur.slots[cur.index];
    if (!s || s.result) return;
    const now = Date.now();
    const timeMs = s.timeMs + (cur.activeSince !== null ? now - cur.activeSince : 0);
    const q = s.record.question;
    let res: Result;
    const text = (given ?? '').trim();
    if (flags.skipped || flags.timedOut || text === '') {
      res = { correct: false, given: '', skipped: !!flags.skipped, timedOut: !!flags.timedOut };
    } else {
      const r = checkAnswer(text, q.answer, q.options);
      res = { correct: r.correct, given: text, skipped: false, timedOut: false, echo: r.echo, error: r.error };
    }
    patchSlot(cur.index, (x) => ({
      ...x,
      result: res,
      timeMs,
      selected: !x.typedUsed && !flags.skipped && !flags.timedOut && text !== '' ? text.toUpperCase() : x.selected,
    }));
    setActiveSince(null);
    if (isGauntlet) {
      const step = gauntletStep(cur.gState, res.correct, timeMs);
      setGState(step.state);
      if (step.moved === 'up') showToast(`Level ↑ ${step.state.level}`);
      else if (step.moved === 'down') showToast(`Level ↓ ${step.state.level}`);
    }
  };
  const submitRef = useRef(submit);
  submitRef.current = submit;

  const advance = () => {
    if (finishedRef.current) return;
    const cur = latest.current;
    const s = cur.slots[cur.index];
    if (!s || !s.result) return;
    const next = cur.index + 1;
    if (next >= total) { finish('complete'); return; }
    if (isGauntlet && !cur.slots[next]) {
      try {
        const rec = gauntletQuestion(config, next, cur.gState.level, s.record.question.templateId);
        setSlots((all) => (all.length > next ? all : [...all, slotFor(config, rec)]));
      } catch (e) {
        console.error(e);
        finish('user');
        return;
      }
    }
    setIndex(next);
    setActiveSince(Date.now());
  };

  // ---- sim flow ---------------------------------------------------------------

  const goTo = (i: number) => {
    const cur = latest.current;
    if (i < 0 || i >= total || i === cur.index) return;
    const now = Date.now();
    if (cur.activeSince !== null) {
      const d = now - cur.activeSince;
      patchSlot(cur.index, (x) => ({ ...x, timeMs: x.timeMs + d }));
    }
    setIndex(i);
    setActiveSince(now);
  };

  const selectSim = (key: string) => {
    patchSlot(index, (x) => ({ ...x, selected: x.selected === key ? null : key, noAnswer: false }));
  };

  const markNoAnswer = () => {
    patchSlot(index, (x) => ({ ...x, selected: null, typed: '', noAnswer: true }));
    if (index + 1 < total) goTo(index + 1);
  };

  const toggleFlag = () => patchSlot(index, (x) => ({ ...x, flagged: !x.flagged }));

  // ---- buttons ---------------------------------------------------------------

  const answeredCount = isSim
    ? slots.filter((s) => (s.typedUsed ? s.typed.trim() !== '' : s.selected !== null)).length
    : slots.filter((s) => s.result !== null).length;

  const quit = () => {
    if (window.confirm('Quit this session? Nothing will be saved.')) { finishedRef.current = true; nav.home(); }
  };

  const finishEarly = () => {
    if (isSim) {
      const left = total - answeredCount;
      const msg = left > 0 ? `${left} question${left === 1 ? '' : 's'} unanswered. Finish and see the report?` : 'Finish and see the report?';
      if (window.confirm(msg)) finish('user');
      return;
    }
    if (answeredCount === 0) {
      if (window.confirm('Nothing answered yet. Quit without saving?')) { finishedRef.current = true; nav.home(); }
      return;
    }
    if (window.confirm(`Finish now with ${answeredCount} of ${total} answered?`)) finish('user');
  };

  // ---- timers --------------------------------------------------------------

  // Session deadline (sprint, sim).
  useEffect(() => {
    if (!config.timeLimitSec) return;
    const ms = Math.max(0, startedAt + config.timeLimitSec * 1000 - Date.now());
    const id = setTimeout(() => finishRef.current('timeout'), ms);
    return () => clearTimeout(id);
  }, [config.timeLimitSec, startedAt]);

  // Per-question countdown (timed drill).
  useEffect(() => {
    if (!perQuestionLimitSec || activeSince === null) return;
    const s = latest.current.slots[index];
    if (!s || s.result) return;
    const ms = Math.max(0, perQuestionLimitSec * 1000 - s.timeMs - (Date.now() - activeSince));
    const id = setTimeout(() => submitRef.current(null, { timedOut: true }), ms);
    return () => clearTimeout(id);
  }, [perQuestionLimitSec, activeSince, index]);

  // ---- keyboard --------------------------------------------------------------

  useKeyboard((e) => {
    if (e.repeat) return;
    const cur = latest.current;
    const s = cur.slots[cur.index];
    if (!s) return;
    const k = e.key;
    const take = () => e.preventDefault();
    if (immediate) {
      if (s.result) {
        if (k === 'Enter' || k === 'n' || k === 'N' || k === ' ') { take(); advance(); }
        return;
      }
      if (!s.typedUsed) {
        const key = optionKeyFor(k, s.record.question.options.length);
        if (key) { take(); submit(key); return; }
      }
      if (k === 'Enter') {
        take();
        if (!s.typedUsed && s.selected) submit(s.selected);
        else if (s.typedUsed && s.typed.trim()) submit(s.typed);
        return;
      }
      if ((k === 's' || k === 'S') && config.allowSkip) { take(); submit(null, { skipped: true }); return; }
      if (k === 'Escape') { take(); patchSlot(cur.index, (x) => ({ ...x, selected: null })); }
      return;
    }
    // sim
    if (!s.typedUsed) {
      const key = optionKeyFor(k, s.record.question.options.length);
      if (key) { take(); selectSim(key); return; }
    }
    if (k === 'ArrowRight' || k === 'Enter' || k === 'n' || k === 'N') { take(); goTo(Math.min(total - 1, cur.index + 1)); return; }
    if (k === 'ArrowLeft' || k === 'p' || k === 'P') { take(); goTo(Math.max(0, cur.index - 1)); return; }
    if ((k === 's' || k === 'S') && config.allowSkip) { take(); markNoAnswer(); return; }
    if (k === 'm' || k === 'M') { take(); toggleFlag(); return; }
    if (k === 'Escape') { take(); patchSlot(cur.index, (x) => ({ ...x, selected: null })); }
  });

  // ---- render ----------------------------------------------------------------

  if (setupError || !slot) {
    return (
      <main className="page">
        <div className="card run-error">
          <h1>Cannot start this session</h1>
          <p className="muted">{setupError ?? 'No questions could be generated for these settings.'}</p>
          <button className="btn primary" onClick={nav.home}>Home</button>
        </div>
      </main>
    );
  }

  const q = slot.record.question;
  const res = slot.result;
  const revealed = immediate && res !== null;
  const chosenOption = res && !slot.typedUsed ? q.options.find((o) => o.key === res.given) : undefined;
  const doneCount = isSim ? answeredCount : slots.filter((s) => s.result).length;

  const header = (
    <div className="run-head">
      <span className="pill accent">{MODE_NAMES[config.mode]}</span>
      <span className="qcount">Q {index + 1} / {total}</span>
      {isGauntlet && (
        <>
          <span className="pill accent level-pill" title="Current gauntlet level">Level {gState.level}</span>
          <span className="streak" title="Consecutive correct answers under pace">{gState.streakCorrect} / 5 to level up</span>
        </>
      )}
      {config.mode === 'sim' && <span className="tiny muted">pace: {PACE_SECONDS} s/question</span>}
      <span className="timers">
        {showTimer && <SessionTimer startedAt={startedAt} limitSec={config.timeLimitSec} />}
        {showTimer && <QuestionTimer baseMs={slot.timeMs} since={activeSince} limitSec={perQuestionLimitSec} />}
        <span className="seed mono tiny muted" title="Session seed (replay it from the setup screen)">{config.seed}</span>
      </span>
    </div>
  );

  const feedback = revealed && res && (
    <div className={`feedback ${res.correct ? 'ok' : 'bad'}`} role="status">
      <div className="fb-head">
        <span className="mark">{res.correct ? '✓' : '✗'}</span>
        <span>{res.correct ? 'Correct' : res.timedOut ? "Time's up" : res.skipped ? 'Skipped' : 'Wrong'}</span>
        <span className={`pill ${slot.timeMs > PACE_SECONDS * 1000 ? 'warn' : ''}`}>{formatSec(slot.timeMs)}{slot.timeMs > PACE_SECONDS * 1000 ? ' · over pace' : ''}</span>
      </div>
      <div className="fb-row fb-answer">
        <span className="lbl">Answer</span>
        <MathText inline text={answerToDisplay(q.answer)} />
      </div>
      {slot.typedUsed && res.given && (
        <div className="fb-row small">
          <span className="lbl">You typed</span>
          <span className="mono">{res.given}</span>
          {res.echo && <span className="muted"> (understood as {res.echo})</span>}
          {res.error && <span className="warn"> ({res.error})</span>}
        </div>
      )}
      {chosenOption && !chosenOption.correct && chosenOption.trap && (
        <div className="fb-row small">
          <span className="lbl">Option {chosenOption.key}</span>
          {chosenOption.trap}
        </div>
      )}
      <div className="fb-solution">
        <MathText text={q.solution} />
      </div>
      <div className="fb-row small muted">
        <span className="lbl">Trap</span>
        {q.trap}
      </div>
      <div className="run-actions">
        <button className="btn primary" onClick={advance} autoFocus>
          {index + 1 >= total ? 'Finish' : 'Next'} <kbd>Enter</kbd>
        </button>
      </div>
    </div>
  );

  return (
    <main className="page">
      {header}
      {config.timeLimitSec ? <PaceBar startedAt={startedAt} limitSec={config.timeLimitSec} done={doneCount} total={total} /> : null}

      <QuestionCard key={slot.record.seed} question={q} meta={isSim && slot.flagged ? <span className="pill warn">flagged</span> : undefined}>
        {slot.typedUsed ? (
          <TypedAnswer
            value={slot.typed}
            onChange={(v) => patchSlot(index, (x) => ({ ...x, typed: v, noAnswer: false }))}
            onSubmit={() => {
              if (immediate) { if (slot.typed.trim()) submit(slot.typed); }
              else goTo(Math.min(total - 1, index + 1));
            }}
            disabled={revealed}
            submitLabel={immediate ? 'Submit' : 'Next'}
          />
        ) : (
          <OptionList
            options={q.options}
            selected={slot.selected}
            revealed={revealed}
            onSelect={(key) => (immediate ? submit(key) : selectSim(key))}
          />
        )}
        {feedback}
      </QuestionCard>

      <div className="run-actions">
        {isSim ? (
          <>
            <button className="btn" onClick={() => goTo(index - 1)} disabled={index === 0}>&larr; Previous</button>
            <button className="btn" onClick={() => goTo(index + 1)} disabled={index + 1 >= total}>Next &rarr;</button>
            <button className={`btn ${slot.flagged ? 'primary' : ''}`} onClick={toggleFlag}>{slot.flagged ? 'Unflag' : 'Flag'}</button>
            {config.allowSkip && <button className="btn" onClick={markNoAnswer}>No answer</button>}
            <span className="spacer" />
            <button className="btn primary" onClick={finishEarly}>Finish</button>
            <button className="btn ghost" onClick={quit}>Quit</button>
          </>
        ) : (
          <>
            {!revealed && config.allowSkip && <button className="btn" onClick={() => submit(null, { skipped: true })}>Skip</button>}
            {!revealed && !slot.typedUsed && slot.selected && <button className="btn primary" onClick={() => submit(slot.selected)}>Submit {slot.selected}</button>}
            <span className="spacer" />
            <button className="btn" onClick={finishEarly}>{isGauntlet ? 'Finish run' : 'Finish early'}</button>
            <button className="btn ghost" onClick={quit}>Quit</button>
          </>
        )}
      </div>

      {isSim && (
        <QuestionPalette
          items={slots.map((s) => ({
            answered: s.typedUsed ? s.typed.trim() !== '' : s.selected !== null,
            flagged: s.flagged,
            noAnswer: s.noAnswer,
          }))}
          current={index}
          onPick={goTo}
        />
      )}

      <div className="shortcuts" style={{ marginTop: '1rem' }}>
        {slot.typedUsed ? <span><kbd>Enter</kbd> {immediate ? 'submit' : 'next'}</span> : <span><kbd>A</kbd>–<kbd>{String.fromCharCode(64 + q.options.length)}</kbd> or <kbd>1</kbd>–<kbd>{q.options.length}</kbd> choose</span>}
        {immediate && <span><kbd>Enter</kbd> / <kbd>N</kbd> next</span>}
        {isSim && <span><kbd>&larr;</kbd> <kbd>&rarr;</kbd> move</span>}
        {isSim && <span><kbd>M</kbd> flag</span>}
        {config.allowSkip && <span><kbd>S</kbd> {isSim ? 'no answer' : 'skip'}</span>}
        <span><kbd>Esc</kbd> clear</span>
      </div>

      {toast && <div key={toast.id} className="toast" role="status">{toast.text}</div>}
    </main>
  );
}

export default Runner;
