/**
 * Property tests for every template: 500 instances each (100 per level).
 *  (a) no crash            (b) verify() agrees with the answer
 *  (c) options unique and include the answer exactly once
 *  (d) answer (and every exact option) passes the clean-number rule
 *  (e) stem/solution contain no NaN/undefined/null/Infinity
 * plus: determinism for a seed, and a typed round trip of the answer's plain text.
 */
import { describe, it, expect } from 'vitest';
import { TEMPLATES, generateQuestion } from '../core/registry';
import { RNG } from '../core/rng';
import { LEVELS, type Question } from '../core/template';
import { isCleanExact } from '../core/clean';
import { checkAnswer, answerToPlain } from '../core/answers';
import { TOPIC_BY_KEY } from '../core/topics';

const PER_LEVEL = 100;
const BAD = /\bNaN\b|\bundefined\b|\bnull\b|Infinity|\[object Object\]/;

function assertQuestion(q: Question, ctx: string) {
  expect(q.stem, ctx).not.toMatch(BAD);
  expect(q.solution, ctx).not.toMatch(BAD);
  expect(q.trap, ctx).not.toMatch(BAD);
  expect(q.stem.trim().length, ctx).toBeGreaterThan(10);
  expect(q.solution.trim().length, ctx).toBeGreaterThan(5);
  expect(q.trap.trim().length, ctx).toBeGreaterThan(5);

  // options
  expect(q.options.length, ctx).toBeGreaterThanOrEqual(5);
  expect(q.options.length, ctx).toBeLessThanOrEqual(8);
  const displays = q.options.map((o) => o.display.replace(/\s+/g, ' ').trim());
  expect(new Set(displays).size, `${ctx} duplicate options: ${displays.join(' | ')}`).toBe(displays.length);
  expect(q.options.filter((o) => o.correct).length, ctx).toBe(1);
  for (const o of q.options) {
    expect(o.display, ctx).not.toMatch(BAD);
    expect(o.key, ctx).toMatch(/^[A-H]$/);
    // every numeric option must be an exam-plausible number too
    for (const v of [...(o.value ? [o.value] : []), ...(o.values ?? [])]) {
      const c = isCleanExact(v);
      expect(c.ok, `${ctx} unclean option ${v.toPlain()} (${o.display}): ${c.reason}`).toBe(true);
    }
  }
  const keys = q.options.map((o) => o.key);
  expect(keys, ctx).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].slice(0, keys.length));

  // clean answer
  if (q.answer.kind === 'exact') {
    const v = isCleanExact(q.answer.value);
    expect(v.ok, `${ctx} unclean answer ${q.answer.value.toPlain()}: ${v.reason}`).toBe(true);
  } else if (q.answer.kind === 'set') {
    expect(q.answer.values.length, ctx).toBeGreaterThan(0);
    expect(q.answer.values.length, ctx).toBeLessThanOrEqual(4);
    for (const x of q.answer.values) {
      const v = isCleanExact(x);
      expect(v.ok, `${ctx} unclean set value ${x.toPlain()}: ${v.reason}`).toBe(true);
    }
  } else {
    const choice = q.answer.value;
    expect(choice.length, ctx).toBeGreaterThan(0);
    expect(q.options.some((o) => o.correct && o.display === choice), ctx).toBe(true);
    expect(q.typedAllowed, ctx).toBe(false);
  }

  // typed round trip: the plain text of the answer must be accepted
  if (q.typedAllowed) {
    const plain = answerToPlain(q.answer);
    const res = checkAnswer(plain, q.answer, q.options);
    expect(res.correct, `${ctx} round trip failed for "${plain}": ${res.error ?? res.method}`).toBe(true);
  }

  // params must be serialisable (they go into the session log)
  expect(() => JSON.stringify(q.params), ctx).not.toThrow();
}

describe('template registry', () => {
  it('has templates with unique ids and known topics', () => {
    expect(TEMPLATES.length).toBeGreaterThan(0);
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TEMPLATES) {
      expect(TOPIC_BY_KEY[t.topic], `${t.id} topic`).toBeDefined();
      expect(TOPIC_BY_KEY[t.topic].module, `${t.id} module/topic mismatch`).toBe(t.module);
      expect(t.id.startsWith(`${t.module.toLowerCase()}.`), `${t.id} should start with module prefix`).toBe(true);
      expect(Object.keys(t.levels).length, `${t.id} needs level descriptions`).toBeGreaterThan(0);
    }
  });
});

describe.each(TEMPLATES.map((t) => [t.id, t] as const))('%s', (_id, t) => {
  it(`generates ${PER_LEVEL * LEVELS.length} valid, verified, clean instances`, () => {
    for (const level of LEVELS) {
      for (let i = 0; i < PER_LEVEL; i++) {
        const seed = `${t.id}:${level}:${i}`;
        const ctx = `[${seed}]`;
        let q: Question;
        try {
          q = generateQuestion(t, new RNG(seed), level);
        } catch (e) {
          throw new Error(`${ctx} generate threw: ${(e as Error).message}`);
        }
        expect(q.templateId).toBe(t.id);
        assertQuestion(q, ctx);
        let ok: boolean;
        try {
          ok = t.verify(q);
        } catch (e) {
          throw new Error(`${ctx} verify threw: ${(e as Error).message}\nstem: ${q.stem}`);
        }
        expect(ok, `${ctx} verify() disagreed with the answer\nstem: ${q.stem}\nanswer: ${answerToPlain(q.answer)}`).toBe(true);
      }
    }
  });

  it('is deterministic for a given seed', () => {
    const a = generateQuestion(t, new RNG('det'), 3);
    const b = generateQuestion(t, new RNG('det'), 3);
    expect(a.stem).toBe(b.stem);
    expect(a.options.map((o) => o.display)).toEqual(b.options.map((o) => o.display));
  });

  it('varies across seeds', () => {
    const stems = new Set<string>();
    for (let i = 0; i < 30; i++) stems.add(generateQuestion(t, new RNG(`var${i}`), 3).stem);
    expect(stems.size).toBeGreaterThan(5);
  });
});
