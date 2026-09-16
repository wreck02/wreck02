import { describe, it, expect } from 'vitest';
import { parseAnswer, checkAnswer } from './answers';
import { Exact, frac, surd, piFrac, E, rat } from './exact';
import type { Answer } from './template';

const ex = (v: Exact): Answer => ({ kind: 'exact', value: v });
const parsed = (s: string) => parseAnswer(s).values[0];

describe('parseAnswer', () => {
  it('fractions and decimals', () => {
    expect(parsed('3/4').exact!.equals(frac(3, 4))).toBe(true);
    expect(parsed('0.75').exact!.equals(frac(3, 4))).toBe(true);
    expect(parsed('-1/2').exact!.equals(frac(-1, 2))).toBe(true);
    expect(parsed(' - 1 / 2 ').exact!.equals(frac(-1, 2))).toBe(true);
    expect(parsed('1 1/2').exact!.equals(frac(3, 2))).toBe(true);
    expect(parsed('25%').exact!.equals(frac(1, 4))).toBe(true);
    expect(parsed('.5').exact!.equals(frac(1, 2))).toBe(true);
  });
  it('surds in every spelling', () => {
    const target = surd(5, 2);
    for (const s of ['2√5', '2sqrt5', '2*sqrt(5)', '2 sqrt 5', 'sqrt(20)', '√20', '2sqrt(5)', 'sqrt20', '2root5']) {
      expect(parsed(s).exact!.equals(target), s).toBe(true);
    }
    expect(parsed('√3/2').exact!.equals(surd(3, rat(1, 2)))).toBe(true);
    expect(parsed('sqrt(3)/2').exact!.equals(surd(3, rat(1, 2)))).toBe(true);
    expect(parsed('1/√2').exact!.equals(surd(2, rat(1, 2)))).toBe(true);
    expect(parsed('1/(2√3)').exact!.equals(surd(3, rat(1, 6)))).toBe(true);
    expect(parsed('1/2√3').exact!.equals(surd(3, rat(1, 6)))).toBe(true); // implicit product binds tighter
    expect(parsed('7+4√3').exact!.equals(E(7).add(surd(3, 4)))).toBe(true);
    expect(parsed('(2+√3)^2').exact!.equals(E(7).add(surd(3, 4)))).toBe(true);
    expect(parsed('1/(1+√2)').exact!.equals(surd(2).sub(E(1)))).toBe(true);
    expect(parsed('sqrt(7+4sqrt3)').exact!.equals(E(2).add(surd(3)))).toBe(true);
  });
  it('pi', () => {
    for (const s of ['π/6', 'pi/6', 'pi / 6', '(1/6)pi', 'pi/6 rad', '1/6 * pi']) {
      expect(parsed(s).exact!.equals(piFrac(1, 6)), s).toBe(true);
    }
    expect(parsed('2pi').exact!.equals(Exact.pi(2))).toBe(true);
    expect(parsed('5π/6').exact!.equals(piFrac(5, 6))).toBe(true);
    expect(parsed('-pi/2').exact!.equals(piFrac(-1, 2))).toBe(true);
    expect(parsed('1/2π').exact!.equals(Exact.ONE.div(Exact.pi(2)))).toBe(true);
    expect(parsed('pi^2').exact!.equals(Exact.pi(1, 2))).toBe(true);
  });
  it('standard form', () => {
    for (const s of ['3e8', '3E8', '3×10^8', '3x10^8', '3 x 10^8', '3*10^8', '300000000', '3 X 10^8 m/s']) {
      expect(parsed(s).exact!.toInt(), s).toBe(300000000);
    }
    expect(parsed('2.5e-3').exact!.equals(frac(1, 400))).toBe(true);
    expect(parsed('4x10^-3').exact!.equals(frac(1, 250))).toBe(true);
  });
  it('powers and roots', () => {
    expect(parsed('8^(2/3)').exact!.toInt()).toBe(4);
    expect(parsed('2^-1').exact!.equals(frac(1, 2))).toBe(true);
    expect(parsed('2^(1/2)').exact!.equals(surd(2))).toBe(true);
    expect(parsed('-2^2').exact!.toInt()).toBe(-4);
    expect(parsed('cbrt(27)').exact!.toInt()).toBe(3);
    expect(parsed('5!').exact!.toInt()).toBe(120);
    expect(parsed('|−3|').exact!.toInt()).toBe(3);
  });
  it('units and prefixes are stripped', () => {
    expect(parsed('5 m/s').exact!.toInt()).toBe(5);
    expect(parsed('10N').exact!.toInt()).toBe(10);
    expect(parsed('30°').exact!.toInt()).toBe(30);
    expect(parsed('2.5 m s^-2').exact!.equals(frac(5, 2))).toBe(true);
    expect(parsed('12 Ω').exact!.toInt()).toBe(12);
  });
  it('sets', () => {
    expect(parseAnswer('x = 2 or x = 3').values.map((v) => v.exact!.toInt())).toEqual([2, 3]);
    expect(parseAnswer('2, 3').values.map((v) => v.exact!.toInt())).toEqual([2, 3]);
    expect(parseAnswer('±3').values.map((v) => v.exact!.toInt())).toEqual([3, -3]);
    expect(parseAnswer('x=±√2').values.map((v) => v.exact!.toPlain())).toEqual(['√2', '−√2']);
    expect(parseAnswer('1 ± √2').values.length).toBe(2);
  });
  it('rejects nonsense', () => {
    expect(() => parseAnswer('')).toThrow();
    expect(() => parseAnswer('abc')).toThrow();
    expect(() => parseAnswer('2 +')).toThrow();
    expect(() => parseAnswer('(2')).toThrow();
    expect(() => parseAnswer('1/0')).toThrow();
  });
  it('falls back to approximations', () => {
    const v = parsed('2^(1/3)');
    expect(v.exact).toBeNull();
    expect(v.approx).toBeCloseTo(Math.cbrt(2), 10);
  });
});

describe('checkAnswer', () => {
  it('structural matches', () => {
    expect(checkAnswer('2√5', ex(surd(5, 2))).method).toBe('exact');
    expect(checkAnswer('sqrt20', ex(surd(5, 2))).correct).toBe(true);
    expect(checkAnswer('0.75', ex(frac(3, 4))).method).toBe('exact');
    expect(checkAnswer('3e8', ex(E(300000000))).correct).toBe(true);
    expect(checkAnswer('pi/6', ex(piFrac(1, 6))).correct).toBe(true);
    expect(checkAnswer('-1/2', ex(frac(-1, 2))).correct).toBe(true);
  });
  it('numeric fallback within tolerance only', () => {
    expect(checkAnswer('1.4142', ex(surd(2)))).toMatchObject({ correct: true, method: 'numeric' });
    expect(checkAnswer('1.41', ex(surd(2))).correct).toBe(false);
    expect(checkAnswer('0.3333', ex(frac(1, 3))).correct).toBe(true);
    expect(checkAnswer('0.33', ex(frac(1, 3))).correct).toBe(false);
    expect(checkAnswer('0.524', ex(piFrac(1, 6))).correct).toBe(true);
    // an exact but different integer/fraction is never "close enough"
    expect(checkAnswer('1001', ex(E(1000))).correct).toBe(false);
    expect(checkAnswer('333/1000', ex(frac(1, 3))).correct).toBe(false);
    expect(checkAnswer('2^(1/3)', ex(frac(1, 1))).correct).toBe(false);
  });
  it('wrong answers', () => {
    expect(checkAnswer('2√3', ex(surd(5, 2))).correct).toBe(false);
    expect(checkAnswer('3/5', ex(frac(3, 4))).correct).toBe(false);
    expect(checkAnswer('1/2', ex(frac(-1, 2))).correct).toBe(false);
  });
  it('sets are unordered and complete', () => {
    const a: Answer = { kind: 'set', values: [E(2), E(3)] };
    expect(checkAnswer('3, 2', a).correct).toBe(true);
    expect(checkAnswer('x = 2 or x = 3', a).correct).toBe(true);
    expect(checkAnswer('2', a).correct).toBe(false);
    expect(checkAnswer('2, 2', a).correct).toBe(false);
    expect(checkAnswer('±3', { kind: 'set', values: [E(3), E(-3)] }).correct).toBe(true);
  });
  it('choice answers by letter or text', () => {
    const opts = [
      { key: 'A', display: 'I only', correct: false },
      { key: 'B', display: 'I and II only', correct: true },
    ];
    const a: Answer = { kind: 'choice', value: 'I and II only' };
    expect(checkAnswer('b', a, opts).correct).toBe(true);
    expect(checkAnswer('I and II only', a, opts).correct).toBe(true);
    expect(checkAnswer('A', a, opts).correct).toBe(false);
  });
  it('letters work for exact answers too', () => {
    const opts = [{ key: 'A', display: '$2$', correct: false }, { key: 'B', display: '$3$', correct: true }];
    expect(checkAnswer('B', ex(E(3)), opts).correct).toBe(true);
  });
});
