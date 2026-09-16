/**
 * Facts drill: flashcards for the things to know cold. Three views in one
 * screen: setup (decks, count, typed or flip, weak cards only), the drill with
 * a 5 s recall target and a second-chance pile for missed cards, and a summary.
 * Every result goes through recordFact; the weights it produces shape the next draw.
 */
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Nav } from '../App';
import { useStore } from '../store';
import { ALL_FACTS, FACT_DECKS, drawFacts, type FactCard } from '../../core/facts';
import { RNG, newSessionSeed } from '../../core/rng';
import { checkFact } from '../../core/facts-check';
import {
  FACT_TARGET_MS, WEAK_ACCURACY, WEAK_STREAK, deckProgress, drawWeighted, factWeights, loadFactProgress, recordFact, resetFactProgress, weakCards,
  type FactProgress,
} from '../../core/facts-progress';
import { MathText } from '../components/MathText';
import { NumberField } from '../components/NumberField';
import { useKeyboard } from '../components/useKeyboard';
import { useNow } from '../components/useTicker';
import { FactCardView, formatMs, type CardPhase, type CardVerdict, type DrillMode } from '../components/FactCardView';
import { clamp, pct } from '../labels';
import '../facts.css';

const COUNT = { min: 10, max: 50, def: 20 };

interface DrillConfig {
  decks: string[];
  count: number;
  mode: DrillMode;
  weakOnly: boolean;
}

interface CardResult extends CardVerdict {
  card: FactCard;
  /** answered from the second-chance pile */
  secondChance: boolean;
}

interface Run {
  config: DrillConfig;
  seed: string;
  /** main draw first; missed cards are appended once when the main pass ends */
  queue: FactCard[];
  mainCount: number;
  index: number;
  phase: CardPhase | 'done';
  typed: string;
  results: CardResult[];
  /** verdict for the card on screen while in feedback */
  verdict: CardResult | null;
  streak: number;
  bestStreak: number;
  /** epoch ms the current card appeared */
  cardSince: number;
  /** flip mode: epoch ms the answer was revealed */
  revealedAt: number | null;
  requeued: boolean;
}

type Action =
  | { type: 'start'; config: DrillConfig; seed: string; cards: FactCard[]; now: number }
  | { type: 'type'; value: string }
  | { type: 'submit'; now: number }
  | { type: 'reveal'; now: number }
  | { type: 'grade'; correct: boolean; now: number }
  | { type: 'skip'; now: number }
  | { type: 'advance'; now: number }
  | { type: 'quit' };

function cardsIn(deckKeys: string[]): FactCard[] {
  return FACT_DECKS.filter((d) => deckKeys.includes(d.key)).flatMap((d) => d.cards);
}

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Move to the next card, building the second-chance pile when the main pass ends. */
function stepNext(run: Run, now: number): Run {
  const next = run.index + 1;
  let queue = run.queue;
  let requeued = run.requeued;
  if (next >= queue.length && !requeued) {
    requeued = true;
    const seen = new Set<string>();
    const pile = run.results.filter((r) => !r.correct && !seen.has(r.card.id) && seen.add(r.card.id)).map((r) => r.card);
    queue = [...queue, ...new RNG(`${run.seed}:second-chance`).shuffle(pile)];
  }
  if (next >= queue.length) return { ...run, queue, requeued, phase: 'done', verdict: null, revealedAt: null };
  return { ...run, queue, requeued, index: next, phase: 'answer', typed: '', verdict: null, cardSince: now, revealedAt: null };
}

function finishCard(run: Run, v: CardVerdict, now: number, then: 'feedback' | 'next'): Run {
  const result: CardResult = { ...v, card: run.queue[run.index], secondChance: run.index >= run.mainCount };
  const streak = result.correct ? run.streak + 1 : 0;
  const r: Run = { ...run, results: [...run.results, result], verdict: result, streak, bestStreak: Math.max(run.bestStreak, streak), phase: 'feedback' };
  return then === 'feedback' ? r : stepNext(r, now);
}

/** Pure and idempotent per phase, so a key and a click landing together cannot double-count a card. */
function reducer(run: Run | null, a: Action): Run | null {
  if (a.type === 'start') {
    return {
      config: a.config, seed: a.seed, queue: a.cards, mainCount: a.cards.length, index: 0,
      phase: a.cards.length > 0 ? 'answer' : 'done', typed: '', results: [], verdict: null,
      streak: 0, bestStreak: 0, cardSince: a.now, revealedAt: null, requeued: false,
    };
  }
  if (a.type === 'quit') return null;
  if (!run || run.phase === 'done') return run;
  const card = run.queue[run.index];
  const recallMs = (now: number) => Math.max(0, (run.revealedAt ?? now) - run.cardSince);
  switch (a.type) {
    case 'type':
      return run.phase === 'answer' ? { ...run, typed: a.value } : run;
    case 'submit': {
      if (run.phase !== 'answer' || run.config.mode !== 'typed') return run;
      const given = run.typed.trim();
      if (!given) return run;
      const r = checkFact(given, card);
      return finishCard(run, { correct: r.correct, skipped: false, given, timeMs: recallMs(a.now), echo: r.echo, error: r.error }, a.now, 'feedback');
    }
    case 'reveal':
      return run.phase === 'answer' && run.config.mode === 'flip' ? { ...run, phase: 'revealed', revealedAt: a.now } : run;
    case 'grade':
      if (run.phase !== 'revealed') return run;
      return finishCard(run, { correct: a.correct, skipped: false, given: '', timeMs: recallMs(a.now) }, a.now, 'next');
    case 'skip':
      if (run.phase !== 'answer' && run.phase !== 'revealed') return run;
      return finishCard(run, { correct: false, skipped: true, given: '', timeMs: recallMs(a.now) }, a.now, 'feedback');
    case 'advance':
      return run.phase === 'feedback' ? stepNext(run, a.now) : run;
  }
}

function CardTimer({ since, frozenMs }: { since: number | null; frozenMs: number }) {
  const now = useNow(100, since !== null);
  const ms = since !== null ? Math.max(0, now - since) : frozenMs;
  const cls = ms > 2 * FACT_TARGET_MS ? 'bad' : ms > FACT_TARGET_MS ? 'warn' : '';
  return <span className={`pill fact-timer ${cls}`} title={`Time on this card; aim for under ${FACT_TARGET_MS / 1000} s`}>{formatMs(ms)}</span>;
}

export function Facts({ nav }: { nav: Nav }) {
  const { settings } = useStore();
  const [progress, setProgress] = useState<FactProgress>(() => loadFactProgress());
  const [decks, setDecks] = useState<string[]>(() => FACT_DECKS.map((d) => d.key));
  const [count, setCount] = useState(COUNT.def);
  const [mode, setMode] = useState<DrillMode>(settings.answerMode === 'typed' ? 'typed' : 'flip');
  const [weakOnly, setWeakOnly] = useState(false);
  const [run, dispatch] = useReducer(reducer, null);

  // Persist every result exactly once, after the reducer has settled it.
  const recorded = useRef(0);
  useEffect(() => {
    if (!run) { recorded.current = 0; return; }
    if (run.results.length < recorded.current) recorded.current = 0;
    if (run.results.length === recorded.current) return;
    let p: FactProgress | null = null;
    for (let i = recorded.current; i < run.results.length; i++) {
      const r = run.results[i];
      p = recordFact(r.card.id, r.correct, r.timeMs);
    }
    recorded.current = run.results.length;
    if (p) setProgress(p);
  }, [run]);

  const deckRows = useMemo(() => FACT_DECKS.map((d) => ({ deck: d, stats: deckProgress(progress, d.cards) })), [progress]);
  const selectedCards = useMemo(() => cardsIn(decks), [decks]);
  const selectedWeak = useMemo(() => weakCards(progress, selectedCards), [progress, selectedCards]);
  const poolSize = weakOnly ? selectedWeak.length : selectedCards.length;
  const effectiveCount = Math.min(clamp(count, COUNT.min, COUNT.max), poolSize);
  const selectedSeen = selectedCards.some((c) => (progress[c.id]?.seen ?? 0) > 0);

  const start = (config: DrillConfig, explicit?: FactCard[]) => {
    const seed = newSessionSeed();
    const rng = new RNG(seed);
    let cards: FactCard[];
    if (explicit) {
      cards = rng.shuffle(explicit);
    } else {
      const weights = factWeights(progress);
      const n = clamp(config.count, COUNT.min, COUNT.max);
      cards = config.weakOnly
        ? drawWeighted(rng, weakCards(progress, cardsIn(config.decks)), n, weights)
        : drawFacts(rng, config.decks, n, weights);
    }
    dispatch({ type: 'start', config, seed, cards, now: Date.now() });
  };

  const quit = () => {
    if (!run) return;
    const inProgress = run.phase !== 'done' && run.results.length > 0;
    if (inProgress && !window.confirm('Stop this drill and go back to the decks? The cards you have answered already count towards your progress.')) return;
    dispatch({ type: 'quit' });
  };

  const resetSelected = () => {
    const n = selectedCards.length;
    if (!window.confirm(`Forget your progress on the ${n} cards in the selected decks? This cannot be undone.`)) return;
    setProgress(resetFactProgress(selectedCards.map((c) => c.id)));
  };

  useKeyboard((e) => {
    if (!run || e.repeat) return;
    const k = e.key;
    const take = () => e.preventDefault();
    const now = Date.now();
    if (k === 'Escape') { take(); quit(); return; }
    switch (run.phase) {
      case 'answer':
        if (run.config.mode === 'flip' && (k === ' ' || k === 'Enter')) { take(); dispatch({ type: 'reveal', now }); }
        else if (k === 's' || k === 'S') { take(); dispatch({ type: 'skip', now }); }
        break;
      case 'revealed':
        if (k === '1') { take(); dispatch({ type: 'grade', correct: false, now }); }
        else if (k === '2') { take(); dispatch({ type: 'grade', correct: true, now }); }
        else if (k === 's' || k === 'S') { take(); dispatch({ type: 'skip', now }); }
        break;
      case 'feedback':
        if (k === 'Enter' || k === ' ' || k === 'n' || k === 'N') { take(); dispatch({ type: 'advance', now }); }
        break;
      default:
        break;
    }
  });

  // ---- setup ---------------------------------------------------------------

  if (!run) {
    const toggleDeck = (key: string) => setDecks((d) => (d.includes(key) ? d.filter((k) => k !== key) : [...d, key]));
    const modeLine = mode === 'typed' ? 'typed' : 'flip';
    const summary = poolSize === 0
      ? (decks.length === 0 ? 'Tick at least one deck.' : 'No weak cards in this selection. Untick "weak cards only" or choose other decks.')
      : `${effectiveCount} card${effectiveCount === 1 ? '' : 's'} · ${modeLine} · ${weakOnly ? 'weak cards only' : `${decks.length} deck${decks.length === 1 ? '' : 's'}`}`;
    return (
      <main className="page facts">
        <div className="row between">
          <h1>Facts drill</h1>
          <button type="button" className="btn ghost sm" onClick={nav.home}>Home</button>
        </div>
        <p className="muted">
          {ALL_FACTS.length} cards in {FACT_DECKS.length} decks: the things the ESAT expects you to know without working out.
          Aim for under {FACT_TARGET_MS / 1000} seconds a card. Cards you miss come back more often, and once more at the end of the same run.
        </p>

        <form className="stack" onSubmit={(e) => { e.preventDefault(); if (poolSize > 0) start({ decks, count, mode, weakOnly }); }}>
          <div className="card">
            <div className="row between">
              <h2>Decks</h2>
              <div className="row" style={{ gap: '0.25rem' }}>
                <button type="button" className="btn ghost sm" onClick={() => setDecks(FACT_DECKS.map((d) => d.key))}>all</button>
                <button type="button" className="btn ghost sm" onClick={() => setDecks([])}>none</button>
              </div>
            </div>
            <ul className="facts-decks">
              {deckRows.map(({ deck, stats }) => {
                const acc = stats.accuracy;
                const accClass = !Number.isFinite(acc) ? '' : acc >= 0.9 ? 'ok' : acc >= WEAK_ACCURACY ? 'warn' : 'bad';
                return (
                  <li key={deck.key}>
                    <label className="deck-row">
                      <input type="checkbox" checked={decks.includes(deck.key)} onChange={() => toggleDeck(deck.key)} />
                      <span className="grow">
                        <div className="deck-name">{deck.name} <span className="tiny muted">· {deck.cards.length} cards</span></div>
                        <div className="deck-desc">{deck.description}</div>
                      </span>
                      <span className="deck-stats">
                        {stats.attempts === 0 ? (
                          <span className="pill">not started</span>
                        ) : (
                          <>
                            <span className={`pill ${accClass}`} title={`${stats.correct} of ${stats.attempts} answers correct; ${stats.seenCards} of ${stats.cards} cards seen`}>
                              {pct(acc)} of {stats.attempts}
                            </span>
                            <span className={`pill ${stats.weak > 0 ? 'warn' : 'ok'}`} title={`Cards with a streak under ${WEAK_STREAK} or accuracy under ${Math.round(WEAK_ACCURACY * 100)}%, unseen ones included`}>
                              {stats.weak} weak
                            </span>
                          </>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="facts-setup-foot">
              <span className="small muted">{selectedCards.length} cards selected · {selectedWeak.length} weak</span>
              <button type="button" className="btn sm danger" disabled={!selectedSeen} onClick={resetSelected}>Reset progress for selected decks</button>
            </div>
          </div>

          <div className="card form-grid">
            <div className="field">
              <label htmlFor="fact-count">Cards</label>
              <NumberField id="fact-count" value={count} min={COUNT.min} max={COUNT.max} onCommit={setCount} />
              <span className="hint">{COUNT.min}–{COUNT.max}{poolSize > 0 && poolSize < clamp(count, COUNT.min, COUNT.max) ? `, but only ${poolSize} available for this selection` : ''}</span>
            </div>
            <div className="field">
              <span className="label">Mode</span>
              <div className="seg" role="group" aria-label="Mode">
                {(['typed', 'flip'] as DrillMode[]).map((m) => (
                  <button key={m} type="button" className={mode === m ? 'active' : ''} aria-pressed={mode === m} onClick={() => setMode(m)}>
                    {m === 'typed' ? 'Typed' : 'Flip'}
                  </button>
                ))}
              </div>
              <span className="hint">
                {mode === 'typed'
                  ? 'Type the answer and press Enter; it is checked exactly (fractions, surds and π included).'
                  : 'Recall it, press Space to reveal, then grade yourself with 1 (missed) or 2 (got it).'}
              </span>
            </div>
            <div className="field">
              <span className="label">Selection</span>
              <label className="toggle">
                <input type="checkbox" checked={weakOnly} onChange={(e) => setWeakOnly(e.target.checked)} />
                <span>Weak cards only</span>
              </label>
              <span className="hint">Weak: streak under {WEAK_STREAK} or accuracy under {Math.round(WEAK_ACCURACY * 100)}%, unseen cards included. The draw favours weak cards either way.</span>
            </div>
          </div>

          <div className="card row between">
            <span className="small muted">{summary}</span>
            <button type="submit" className="btn primary" disabled={poolSize === 0}>Start</button>
          </div>
        </form>
      </main>
    );
  }

  // ---- summary -------------------------------------------------------------

  if (run.phase === 'done') {
    const main = run.results.filter((r) => !r.secondChance);
    const second = run.results.filter((r) => r.secondChance);
    const correctMain = main.filter((r) => r.correct).length;
    const accuracy = main.length ? correctMain / main.length : NaN;
    const med = median(run.results.map((r) => r.timeMs));
    const missed = main.filter((r) => !r.correct).map((r) => ({ r, again: second.find((s) => s.card.id === r.card.id) }));
    const recovered = missed.filter((m) => m.again?.correct).length;
    const slow = main.filter((r) => r.correct && r.timeMs > FACT_TARGET_MS);
    const missedCards = missed.map((m) => m.r.card);
    const deckNames = FACT_DECKS.filter((d) => run.config.decks.includes(d.key)).map((d) => d.name);
    return (
      <main className="page facts">
        <div className="row between">
          <h1>Facts drill</h1>
          <button type="button" className="btn ghost sm" onClick={nav.home}>Home</button>
        </div>

        <div className="card">
          <div className="facts-stats">
            <div className="fstat">
              <div className="v">{main.length}{second.length > 0 && <small>+{second.length} second chance</small>}</div>
              <div className="k">cards done</div>
            </div>
            <div className="fstat"><div className="v">{pct(accuracy)}</div><div className="k">accuracy ({correctMain} of {main.length} first time)</div></div>
            <div className="fstat">
              <div className={`v ${med > FACT_TARGET_MS ? 'warn' : ''}`}>{formatMs(med)}</div>
              <div className="k">median time (target {FACT_TARGET_MS / 1000} s)</div>
            </div>
            <div className="fstat"><div className="v">{run.bestStreak}</div><div className="k">longest streak</div></div>
          </div>
          <p className="small muted" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
            {run.config.mode === 'typed' ? 'Typed' : 'Flip'} · {run.config.weakOnly ? 'weak cards only · ' : ''}{deckNames.length === FACT_DECKS.length ? 'all decks' : deckNames.join(', ')}
            {missed.length > 0 && ` · ${recovered} of ${missed.length} missed card${missed.length === 1 ? '' : 's'} recovered on the second chance`}
          </p>
        </div>

        <div className="card">
          <h2>Missed cards</h2>
          {missed.length === 0 ? (
            <p className="muted small" style={{ margin: 0 }}>Nothing missed this run.</p>
          ) : (
            <ul className="missed-list">
              {missed.map(({ r, again }) => (
                <li key={r.card.id}>
                  <MathText inline className="mprompt" text={r.card.prompt} />
                  <MathText inline className="manswer" text={r.card.display} />
                  {r.given && <span className="mgiven">you: {r.given}</span>}
                  {again && <span className={`pill ${again.correct ? 'ok' : 'bad'}`}>{again.correct ? 'got it second time' : 'missed twice'}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {slow.length > 0 && (
          <div className="card">
            <h2>Right, but over {FACT_TARGET_MS / 1000} s</h2>
            <ul className="missed-list">
              {slow.map((r) => (
                <li key={r.card.id}>
                  <MathText inline className="mprompt" text={r.card.prompt} />
                  <MathText inline className="manswer" text={r.card.display} />
                  <span className="pill warn">{formatMs(r.timeMs)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="facts-summary-actions">
          <button type="button" className="btn primary" onClick={() => start(run.config)}>Again (same decks)</button>
          <button type="button" className="btn" disabled={missedCards.length === 0} onClick={() => start({ ...run.config, count: missedCards.length, weakOnly: false }, missedCards)}>
            Only the missed ones{missedCards.length > 0 ? ` (${missedCards.length})` : ''}
          </button>
          <button type="button" className="btn" onClick={() => dispatch({ type: 'quit' })}>Back to decks</button>
          <button type="button" className="btn ghost" onClick={nav.home}>Home</button>
        </div>
      </main>
    );
  }

  // ---- drill ---------------------------------------------------------------

  const card = run.queue[run.index];
  const inSecondChance = run.index >= run.mainCount;
  const isLast = run.index + 1 >= run.queue.length && (run.requeued || run.results.every((r) => r.correct));
  const timerSince = run.phase === 'answer' ? run.cardSince : null;
  const frozenMs = run.phase === 'feedback' && run.verdict ? run.verdict.timeMs : Math.max(0, (run.revealedAt ?? run.cardSince) - run.cardSince);
  const now = () => Date.now();

  return (
    <main className="page facts">
      <div className="facts-head">
        <span className="pill accent">Facts drill</span>
        <span className="count">
          {inSecondChance ? `Second chance ${run.index - run.mainCount + 1} / ${run.queue.length - run.mainCount}` : `${run.index + 1} / ${run.mainCount}`}
        </span>
        <span className={`pill ${run.streak >= 5 ? 'ok' : ''}`} title="Consecutive correct answers in this run">streak {run.streak}</span>
        <span className="spacer" />
        {settings.showTimer !== false && <CardTimer since={timerSince} frozenMs={frozenMs} />}
        <button type="button" className="btn ghost sm" onClick={quit}>Quit <kbd>Esc</kbd></button>
      </div>

      <FactCardView
        card={card}
        mode={run.config.mode}
        phase={run.phase}
        typed={run.typed}
        verdict={run.verdict}
        isLast={isLast}
        onType={(v) => dispatch({ type: 'type', value: v })}
        onSubmit={() => dispatch({ type: 'submit', now: now() })}
        onReveal={() => dispatch({ type: 'reveal', now: now() })}
        onGrade={(correct) => dispatch({ type: 'grade', correct, now: now() })}
        onSkip={() => dispatch({ type: 'skip', now: now() })}
        onAdvance={() => dispatch({ type: 'advance', now: now() })}
        onQuit={quit}
      />

      <div className="shortcuts" style={{ marginTop: '1rem' }}>
        {run.config.mode === 'typed' ? <span><kbd>Enter</kbd> check, then next</span> : <span><kbd>Space</kbd> reveal</span>}
        {run.config.mode === 'flip' && <span><kbd>1</kbd> missed · <kbd>2</kbd> got it</span>}
        <span><kbd>S</kbd> skip{run.config.mode === 'typed' ? ' (with the box unfocused)' : ''}</span>
        <span><kbd>Esc</kbd> {run.config.mode === 'typed' ? 'clear, then quit' : 'quit'}</span>
      </div>
    </main>
  );
}

export default Facts;
