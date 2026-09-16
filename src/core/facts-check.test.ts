import { describe, it, expect } from 'vitest';
import { ALL_FACTS, type FactCard } from './facts';
import { answerSigFigs, checkFact, isApproxCard, normText, typedSigFigs } from './facts-check';

const card = (id: string): FactCard => {
  const c = ALL_FACTS.find((x) => x.id === id);
  if (!c) throw new Error(`no card ${id}`);
  return c;
};
const ok = (id: string, s: string) => expect(checkFact(s, card(id)).correct, `${id}: ${s}`).toBe(true);
const bad = (id: string, s: string) => expect(checkFact(s, card(id)).correct, `${id}: ${s}`).toBe(false);

describe('checkFact', () => {
  it('exact answers, strictly', () => {
    ok('sq15', '225');
    ok('sq15', ' 225 ');
    bad('sq15', '230');
    bad('sq15', '224');
    ok('cu7', '343');
    ok('p2_10', '1024');
    ok('l2_1024', '10');
    ok('f2d1_8', '0.125');
    ok('f2d1_8', '1/8');
    ok('d2f1_7', '1/7');
    bad('d2f1_7', '0.14');
    ok('phy_g (take)', '10');
    bad('phy_g (take)', '9.8');
    ok('phy_day', '86400');
    ok('pre_micro', '10^-6');
    ok('pre_micro', '1e-6');
    ok('pre_kilo', '1000');
  });
  it('surds and pi', () => {
    ok('sin60d', 'sqrt3/2');
    ok('sin60d', '√3/2');
    ok('sin60d', 'sqrt(3)/2');
    bad('sin60d', '1/2');
    ok('cos45r', '1/√2');
    ok('cos45r', '√2/2');
    ok('d2r30', 'pi/6');
    ok('d2r30', 'π/6');
    ok('r2d90', '90');
    ok('r2d90', '90°');
    ok('tan2pi3', '-√3');
    ok('lx_\\log_4 8', '3/2');
    ok('lx_\\log_4 8', '1.5');
  });
  it('text cards, ignoring case, spaces and punctuation', () => {
    ok('pr17', 'Yes');
    ok('pr17', 'y');
    ok('pr17', 'prime');
    ok('pr17', 'yes.');
    bad('pr17', 'no');
    ok('pr51', 'No');
    ok('pr51', 'not prime');
    ok('pr51', 'composite');
    bad('pr51', 'yes');
    ok('tan90d', 'undefined');
    ok('tan90d', 'Undefined');
    ok('tan90d', 'does not exist');
    ok('tan90d', '∞');
    bad('tan90d', '1');
    bad('tan90d', '');
    expect(checkFact('', card('tan90d')).error).toBe('empty answer');
    expect(checkFact('', card('sq15')).error).toBe('empty answer');
  });
  it('percentage cards accept a % sign', () => {
    ok('f2p1_8', '12.5%');
    ok('f2p1_8', '12.5');
    ok('f2p1_8', '12.5 %');
    bad('f2p1_8', '0.125');
    bad('f2p1_8', '13');
    // but 25% on a fraction card still means a quarter
    bad('f2d1_8', '25%');
  });
  it('approximate cards accept correctly rounded decimals', () => {
    ok('f2p1_6', '16.7');
    ok('f2p1_6', '16.7%');
    ok('f2p1_6', '16.67');
    ok('f2p1_6', '50/3');
    bad('f2p1_6', '16.6');
    bad('f2p1_6', '17');
    ok('f2p1_3', '33.3');
    ok('f2p1_7', '14.3');
    ok('f2d1_6', '0.167');
    ok('f2d1_6', '0.1667');
    ok('f2d1_7', '0.143');
    ok('f2d1_7', '0.142857');
    bad('f2d1_7', '0.14');
    bad('f2d1_7', '0.144');
    ok('dec_√2', '1.414');
    ok('dec_√2', '1.41');
    ok('dec_√2', '1.41421');
    bad('dec_√2', '1.42');
    bad('dec_√2', '1.4');
    ok('dec_π²', '9.87');
    ok('dec_π²', '9.8696');
    ok('log10_2', '0.301');
    ok('log10_2', '0.3010');
    bad('log10_2', '0.3');
    bad('log10_2', '0.30');
    ok('log10_0.5', '-0.301');
  });
  it('physics constants accept more precision than asked for', () => {
    ok('phy_e', '1.6e-19');
    ok('phy_e', '1.6x10^-19');
    ok('phy_e', '1.602e-19');
    // checkAnswer alone treats everything below 1e-12 as equal; the facts checker must not
    bad('phy_e', '1.7e-19');
    bad('phy_e', '2e-19');
    bad('phy_e', '0.0');
    bad('phy_e', '1e-15');
    ok('phy_ev', '1.6e-19');
    ok('phy_c', '3e8');
    ok('phy_c', '3 x 10^8');
    ok('phy_c', '299792458');
    bad('phy_c', '3e7');
    ok('phy_vsound', '340');
    ok('phy_vsound', '343');
    bad('phy_vsound', '330');
    ok('phy_patm', '101325');
    ok('phy_year', '3.15e7');
    ok('phy_year', '31536000');
    ok('phy_rho_air', '1.225');
    bad('phy_rho_air', '1.3');
  });
  it('reports parse errors', () => {
    const r = checkFact('??', card('sq15'));
    expect(r.correct).toBe(false);
    expect(r.error).toBeTruthy();
  });
});

describe('helpers', () => {
  it('normText', () => {
    expect(normText(' Not  Prime! ')).toBe('notprime');
    expect(normText('∞')).toBe('infinity');
  });
  it('typedSigFigs', () => {
    expect(typedSigFigs('16.70')).toBe(4);
    expect(typedSigFigs('0.0125')).toBe(3);
    expect(typedSigFigs('3e8')).toBe(1);
    expect(typedSigFigs('340')).toBe(3);
    expect(typedSigFigs('.5')).toBe(1);
    expect(typedSigFigs('abc')).toBe(0);
  });
  it('answerSigFigs', () => {
    expect(answerSigFigs(card('log10_2').answer!)).toBe(3);
    expect(answerSigFigs(card('phy_e').answer!)).toBe(2);
    expect(answerSigFigs(card('phy_vsound').answer!)).toBe(2);
    expect(answerSigFigs(card('phy_c').answer!)).toBe(1);
    expect(answerSigFigs(card('phy_rho_air').answer!)).toBe(2);
    expect(answerSigFigs(card('phy_kwh').answer!)).toBe(2);
    expect(answerSigFigs(card('f2p1_6').answer!)).toBe(Infinity);
    expect(answerSigFigs(card('sin60d').answer!)).toBe(Infinity);
  });
  it('isApproxCard', () => {
    expect(isApproxCard(card('dec_√2'))).toBe(true);
    expect(isApproxCard(card('f2d1_7'))).toBe(true);
    expect(isApproxCard(card('phy_vsound'))).toBe(true);
    expect(isApproxCard(card('d2f1_7'))).toBe(false);
    expect(isApproxCard(card('sq15'))).toBe(false);
    expect(isApproxCard(card('sin60d'))).toBe(false);
  });
});
