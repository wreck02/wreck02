import { describe, it, expect } from 'vitest';
import { Exact, rat, frac, surd, piFrac, E, NotExact, squarefreeDecompose, ratToStandardForm } from './exact';

describe('rationals', () => {
  it('normalises', () => {
    expect(rat(6, -4)).toEqual({ n: -3n, d: 2n });
    expect(Exact.rat(6, 4).toPlain()).toBe('3/2');
    expect(Exact.rat(-6, 4).toLatex()).toBe('-\\frac{3}{2}');
  });
  it('decimals are exact', () => {
    expect(Exact.decimal('0.75').equals(frac(3, 4))).toBe(true);
    expect(Exact.decimal('3e8').toInt()).toBe(300000000);
    expect(Exact.decimal('2.5E-3').equals(frac(1, 400))).toBe(true);
    expect(E(0.125).equals(frac(1, 8))).toBe(true);
  });
});

describe('surds', () => {
  it('simplifies radicands', () => {
    expect(squarefreeDecompose(12)).toEqual([2, 3]);
    expect(squarefreeDecompose(180)).toEqual([6, 5]);
    expect(surd(12).toPlain()).toBe('2√3');
    expect(surd(50).toLatex()).toBe('5\\sqrt{2}');
    expect(surd(16).toPlain()).toBe('4');
  });
  it('multiplies and combines', () => {
    expect(surd(2).mul(surd(8)).toInt()).toBe(4);
    expect(surd(3).mul(surd(6)).toPlain()).toBe('3√2');
    expect(surd(2).add(surd(8)).toPlain()).toBe('3√2');
    expect(surd(2).add(surd(3)).toPlain()).toBe('√2 + √3');
  });
  it('expands (a + √b)^2', () => {
    const x = E(2).add(surd(3));
    expect(x.pow(2).toPlain()).toBe('7 + 4√3');
    expect(x.mul(E(2).sub(surd(3))).toInt()).toBe(1);
  });
  it('rationalises denominators', () => {
    expect(Exact.ONE.div(surd(2)).toPlain()).toBe('√2/2');
    expect(Exact.ONE.div(E(1).add(surd(2))).toPlain()).toBe('−1 + √2');
    // (2+√3)/(1−√3) = (2+√3)(1+√3)/(1−3) = (2+2√3+√3+3)/(−2) = −(5+3√3)/2
    const v = E(2).add(surd(3)).div(E(1).sub(surd(3)));
    expect(v.equals(frac(-5, 2).add(surd(3, rat(-3, 2))))).toBe(true);
    expect(v.toLatex()).toBe('-\\frac{5}{2} - \\frac{3\\sqrt{3}}{2}');
  });
  it('inverts three-term sums by conjugation', () => {
    const d = E(1).add(surd(2)).add(surd(3));
    expect(Math.abs(d.inv().toNumber() - 1 / d.toNumber())).toBeLessThan(1e-12);
    expect(d.mul(d.inv()).equals(Exact.ONE)).toBe(true);
  });
  it('denests square roots', () => {
    expect(E(7).add(surd(3, 4)).sqrt().toPlain()).toBe('2 + √3');
    expect(frac(3, 2).sqrt().toPlain()).toBe('√6/2');
  });
  it('rational powers', () => {
    expect(E(8).powRat(rat(2, 3)).toInt()).toBe(4);
    expect(E(2).powRat(rat(1, 2)).toPlain()).toBe('√2');
    expect(E(27).powRat(rat(-2, 3)).toPlain()).toBe('1/9');
    expect(surd(8).powRat(rat(2, 3)).toInt()).toBe(2);
    expect(() => E(2).powRat(rat(1, 3))).toThrow(NotExact);
  });
});

describe('pi', () => {
  it('formats', () => {
    expect(piFrac(1, 6).toLatex()).toBe('\\frac{\\pi}{6}');
    expect(piFrac(5, 6).toPlain()).toBe('5π/6');
    expect(piFrac(-1, 2).toLatex()).toBe('-\\frac{\\pi}{2}');
    expect(Exact.pi(2).toPlain()).toBe('2π');
    expect(Exact.pi(1, 2).toLatex()).toBe('\\pi^{2}');
    expect(Exact.ONE.div(Exact.pi(1)).toLatex()).toBe('\\frac{1}{\\pi}');
    expect(E(4).add(Exact.pi(2)).toPlain()).toBe('4 + 2π');
  });
  it('multiplies', () => {
    expect(Exact.pi(3).mul(Exact.pi(2)).toLatex()).toBe('6\\pi^{2}');
    expect(Exact.pi(3).div(Exact.pi(1)).toInt()).toBe(3);
  });
});

describe('formatting', () => {
  it('standard form', () => {
    expect(ratToStandardForm(rat(300000000))).toEqual({ mantissa: '3', exp: 8, negative: false });
    expect(ratToStandardForm(rat(3, 10000000))).toEqual({ mantissa: '3', exp: -7, negative: false });
    expect(ratToStandardForm(rat(1234, 10))).toEqual({ mantissa: '1.234', exp: 2, negative: false });
    expect(E(300000000).toLatex()).toBe('3 \\times 10^{8}');
    expect(E(300000000).toPlain({ format: 'sf' })).toBe('3×10^8');
    expect(E(1200).toLatex({ format: 'sf' })).toBe('1.2 \\times 10^{3}');
  });
  it('decimals and fractions', () => {
    expect(frac(3, 4).toLatex()).toBe('\\frac{3}{4}');
    expect(frac(3, 4).toLatex({ format: 'decimal' })).toBe('0.75');
    expect(frac(1, 3).toLatex({ format: 'decimal' })).toBe('\\frac{1}{3}');
    expect(frac(3, 10).toLatex()).toBe('0.3');
    expect(frac(7, 2).toLatex({ format: 'mixed' })).toBe('3\\tfrac{1}{2}');
    expect(E(-5).toLatex()).toBe('-5');
    expect(Exact.ZERO.toLatex()).toBe('0');
  });
  it('surd fractions', () => {
    expect(surd(3, rat(1, 2)).toLatex()).toBe('\\frac{\\sqrt{3}}{2}');
    expect(surd(3, rat(-3, 2)).toLatex()).toBe('-\\frac{3\\sqrt{3}}{2}');
    expect(surd(2, rat(1, 2)).toPlain()).toBe('√2/2');
  });
});
