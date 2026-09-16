import { describe, it, expect } from 'vitest';
import { buildSession, presetConfig, pickTemplateSequence, poolFor } from './session';
import { RNG } from './rng';
import { TEMPLATES } from './registry';
import { gauntletStep, initialGauntlet } from './gauntlet';
import { recordAttempts, reviewQueue, reviewWeights } from './srs';
import type { Attempt } from './session';
import { heatmap, sessionReport, topicStats } from './analytics';
import { ledgerToMarkdown, sessionToMarkdown } from './export';
import { topicName } from './topics';
import { ALL_FACTS, FACT_DECKS } from './facts';
import { checkAnswer } from './answers';
import { isCleanExact } from './clean';

describe('session building', () => {
  it('is reproducible from the seed', () => {
    const cfg = presetConfig('drill', 'ESAT-SEED1', { module: 'M1', count: 8 });
    const a = buildSession(cfg), b = buildSession(cfg);
    expect(a.map((q) => q.question.stem)).toEqual(b.map((q) => q.question.stem));
    expect(a.length).toBe(8);
    expect(a.every((q) => q.question.module === 'M1')).toBe(true);
  });
  it('spreads across topics and avoids immediate repeats', () => {
    const pool = poolFor({ module: 'ALL', topics: [] });
    const seq = pickTemplateSequence(new RNG('x'), pool, 30);
    expect(seq.length).toBe(30);
    const topics = new Set(seq.map((t) => t.topic));
    expect(topics.size).toBe(Math.min(30, new Set(pool.map((t) => t.topic)).size));
    if (pool.length > 1) for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
  });
  it('honours explicit template ids and weights', () => {
    const ids = TEMPLATES.slice(0, 2).map((t) => t.id);
    const cfg = presetConfig('review', 'S', { templateIds: ids, weights: { [ids[0]]: 100, [ids[1]]: 0.01 }, count: 20 });
    const qs = buildSession(cfg);
    expect(qs.every((q) => ids.includes(q.question.templateId))).toBe(true);
    expect(qs.filter((q) => q.question.templateId === ids[0]).length).toBeGreaterThan(10);
  });
  it('presets have the exam shape', () => {
    const sim = presetConfig('sim', 'S');
    expect(sim.count).toBe(27);
    expect(sim.timeLimitSec).toBe(2400);
    expect(sim.answerMode).toBe('mc');
    expect(sim.immediateFeedback).toBe(false);
    const sprint = presetConfig('sprint', 'S');
    expect(sprint.count).toBe(10);
    expect(sprint.timeLimitSec).toBe(300);
  });
});

describe('gauntlet', () => {
  it('moves up after 5 correct under pace and down after 2 wrong', () => {
    let s = initialGauntlet();
    for (let i = 0; i < 5; i++) s = gauntletStep(s, true, 30000).state;
    expect(s.level).toBe(3);
    expect(s.sustained).toBe(2);
    s = gauntletStep(s, false, 30000).state;
    s = gauntletStep(s, false, 30000).state;
    expect(s.level).toBe(2);
    // slow correct answers do not advance
    for (let i = 0; i < 5; i++) s = gauntletStep(s, true, 120000).state;
    expect(s.level).toBe(2);
  });
});

function fakeAttempt(over: Partial<Attempt>): Attempt {
  return {
    id: 'a', sessionId: 's1', sessionSeed: 'S', mode: 'drill', index: 0, templateId: TEMPLATES[0].id, module: TEMPLATES[0].module,
    topic: TEMPLATES[0].topic, level: 2, correct: true, skipped: false, timedOut: false, timeMs: 40000, given: 'A', answerMode: 'mc',
    at: 1000, questionSeed: 'S#0', stem: 'stem', answerText: '1', ...over,
  };
}

describe('srs ledger', () => {
  it('weights recent failures and clears after review successes', () => {
    const now = Date.now();
    const l = recordAttempts({}, [fakeAttempt({ correct: false, at: now - 1000 })], now);
    const q = reviewQueue(l, now + 5 * 3600 * 1000);
    expect(q.length).toBe(1);
    expect(q[0].weight).toBeGreaterThan(0);
    const w = reviewWeights(l, now + 5 * 3600 * 1000);
    expect(w[TEMPLATES[0].id]).toBeGreaterThan(0);
    // three clean review successes outweigh one failure
    recordAttempts(l, [1, 2, 3].map((i) => fakeAttempt({ mode: 'review', correct: true, timeMs: 20000, at: now + i })), now);
    expect(reviewQueue(l, now + 10).length).toBe(0);
  });
  it('over-pace correct answers count as failures', () => {
    const l = recordAttempts({}, [fakeAttempt({ correct: true, timeMs: 150000, at: Date.now() })]);
    expect(reviewQueue(l).length).toBe(1);
  });
});

describe('analytics and export', () => {
  const attempts = [
    fakeAttempt({ id: '1', index: 0, correct: true, timeMs: 30000 }),
    fakeAttempt({ id: '2', index: 1, correct: false, timeMs: 100000 }),
    fakeAttempt({ id: '3', index: 2, correct: true, timeMs: 95000, level: 4 }),
  ];
  it('topic stats and heatmap', () => {
    const ts = topicStats(attempts);
    expect(ts.length).toBe(1);
    expect(ts[0].n).toBe(3);
    expect(ts[0].correct).toBe(2);
    expect(ts[0].overPaceCount).toBe(2);
    const hm = heatmap(attempts, 'ALL');
    const cell = hm.cells.find((c) => c.topic === TEMPLATES[0].topic && c.level === 2)!;
    expect(cell.n).toBe(2);
    expect(cell.accuracy).toBe(0.5);
  });
  it('session report and markdown', () => {
    const summary = { id: 's1', seed: 'S', mode: 'drill' as const, module: 'ALL' as const, topics: [], level: 'mixed' as const, answerMode: 'mc' as const, startedAt: 0, finishedAt: 1, count: 3, correct: 2, skipped: 0, totalTimeMs: 225000, config: presetConfig('drill', 'S', { count: 3 }) };
    const rep = sessionReport(summary, attempts);
    expect(rep.scorePct).toBe(67);
    expect(rep.slowest[0].id).toBe('2');
    expect(rep.topicsToDrill[0].problems).toBe(2);
    const md = sessionToMarkdown(rep, buildSession(presetConfig('drill', 'S', { count: 3 })));
    expect(md).toContain('# ESAT practice');
    expect(md).toContain('| 2 |');
    expect(md).toContain('Error ledger');
    expect(md).not.toMatch(/undefined|NaN/);
  });
  it('ledger markdown groups failed templates by topic with regenerated mistakes', () => {
    const now = Date.now();
    const xs = [
      fakeAttempt({ id: 'e1', index: 0, correct: false, given: 'B', at: now - 3 * 3600e3, questionSeed: 'S#0' }),
      fakeAttempt({ id: 'e2', index: 1, correct: true, timeMs: 120000, at: now - 2 * 3600e3, questionSeed: 'S#1' }),
      fakeAttempt({ id: 'e3', index: 2, correct: false, skipped: true, given: '', at: now - 3600e3, questionSeed: 'S#2' }),
      fakeAttempt({ id: 'e4', index: 3, correct: true, timeMs: 20000, at: now - 1800e3, questionSeed: 'S#3' }),
    ];
    const l = recordAttempts({}, xs, now);
    const md = ledgerToMarkdown(xs, l, { now });
    expect(md).toContain('# ESAT error ledger');
    expect(md).toContain(`## ${topicName(TEMPLATES[0].topic)}`);
    expect(md).toContain(`### ${TEMPLATES[0].title}`);
    expect(md).toContain('**Failures:** 3');
    expect(md).toContain('correct but slow');
    expect(md).toContain('skipped');
    expect(md).toContain('**You gave:** B:');
    expect(md).toContain('**Quick route:**');
    expect(md).toContain('**Trap:**');
    expect(md).not.toMatch(/undefined|NaN/);
    // the clean answer is not listed as a mistake
    expect(md).not.toContain('S#3');
    // the cap on mistakes per template holds
    expect(ledgerToMarkdown(xs, l, { now, perTemplate: 1 }).match(/^#### /gm)?.length).toBe(1);
    expect(ledgerToMarkdown([], {}, { now })).toContain('empty');
  });
});

describe('facts', () => {
  it('every card with an exact answer round-trips through the parser and is clean-ish', () => {
    expect(FACT_DECKS.length).toBeGreaterThanOrEqual(9);
    expect(ALL_FACTS.length).toBeGreaterThan(250);
    const ids = new Set<string>();
    for (const c of ALL_FACTS) {
      expect(ids.has(c.id), `duplicate fact id ${c.id}`).toBe(false);
      ids.add(c.id);
      expect(c.prompt).not.toMatch(/undefined|NaN/);
      if (c.answer) {
        const plain = c.answer.toPlain();
        expect(checkAnswer(plain, { kind: 'exact', value: c.answer }).correct, `${c.id}: ${plain}`).toBe(true);
        expect(isCleanExact(c.answer).ok || c.deck === 'powers' || c.deck === 'decimals' || c.deck === 'constants', `${c.id} unclean ${plain}`).toBe(true);
      } else {
        expect(c.textAnswers?.length).toBeGreaterThan(0);
      }
    }
  });
});
