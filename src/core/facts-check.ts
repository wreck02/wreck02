/**
 * Typed-answer checking for fact cards.
 *
 * Exact answers go through checkAnswer. Text cards ("Is 51 prime?", tan 90°)
 * match any of their accepted spellings, ignoring case, spaces and punctuation.
 * Approximate cards (prompt says "to 3 s.f.", "(2 s.f.)", "approx.", or the
 * display is "≈ …" / "0.142857…") also accept a decimal that is correctly
 * rounded to at least three significant figures, and a more precise value than
 * the card asks for. checkAnswer's 0.1 % numeric tolerance alone would reject
 * 16.7 for 100/6 or 0.167 for 1/6, and "12.5%" would be read as 0.125.
 */
import { checkAnswer, parseAnswer } from './answers';
import { ratToDecimalString, type Exact } from './exact';
import type { FactCard } from './facts';

export interface FactCheck {
  correct: boolean;
  method: 'exact' | 'numeric' | 'text' | 'rounded' | 'none';
  /** how the input was understood, when it parsed */
  echo?: string;
  error?: string;
}

/** Lower case, letters and digits only; "∞" reads as "infinity". */
export function normText(s: string): string {
  return s.toLowerCase().replace(/∞/g, 'infinity').replace(/[^a-z0-9]+/g, '');
}

/** The card asks for, or displays, an approximation rather than an exact value. */
export function isApproxCard(card: FactCard): boolean {
  return /s\.f\.|d\.p\.|approx/i.test(card.prompt) || /\\approx|…|\\ldots/.test(card.display);
}

/** Significant figures of the first number written in `raw`: "16.70" is 4, "0.0125" is 3, "3e8" is 1, "340" is 3. */
export function typedSigFigs(raw: string): number {
  const m = /(\d+\.?\d*|\.\d+)/.exec(raw);
  if (!m) return 0;
  return m[1].replace('.', '').replace(/^0+/, '').length;
}

/** Significant figures of a terminating decimal answer (0.301 is 3, 1.6×10⁻¹⁹ is 2, 340 is 2, 1.2 is 2), Infinity otherwise. */
export function answerSigFigs(answer: Exact): number {
  if (!answer.isRational()) return Infinity;
  const dec = ratToDecimalString(answer.toRat());
  if (dec === null) return Infinity;
  const hadPoint = dec.includes('.');
  let digits = dec.replace(/[^0-9.]/g, '').replace('.', '').replace(/^0+/, '');
  if (!hadPoint) digits = digits.replace(/0+$/, '');
  return digits.length === 0 ? 1 : digits.length;
}

function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1e-300, Math.abs(a), Math.abs(b));
}

export function checkFact(raw: string, card: FactCard): FactCheck {
  let text = raw.trim();
  if (text === '') return { correct: false, method: 'none', error: 'empty answer' };

  if (card.textAnswers && card.textAnswers.some((a) => normText(a) === normText(text))) {
    return { correct: true, method: 'text', echo: text };
  }
  if (!card.answer) return { correct: false, method: 'none', echo: text };

  // "12.5%" on a card that asks for a percentage means 12.5, not 0.125.
  if (/percentage/i.test(card.prompt)) text = text.replace(/%\s*$/, '');

  const r = checkAnswer(text, { kind: 'exact', value: card.answer });
  if (r.correct && r.method === 'exact') return { correct: true, method: 'exact', echo: r.echo };
  const miss: FactCheck = { correct: false, method: 'none', echo: r.echo, error: r.error };
  if (r.error) return miss;

  let typed: number;
  try {
    const p = parseAnswer(text);
    if (p.values.length !== 1) return miss;
    typed = p.values[0].approx;
  } catch {
    return miss;
  }
  const expected = card.answer.toNumber();
  if (r.correct) {
    // checkAnswer's numeric fallback treats every value below 1e-12 as zero, so tiny answers (1.6e-19) are re-checked here.
    if (Math.abs(expected) >= 1e-12 || Math.abs(typed - expected) <= 1e-3 * Math.abs(expected)) return { correct: true, method: 'numeric', echo: r.echo };
  }
  if (!isApproxCard(card) || !card.answer.isRational()) return miss;

  const k = typedSigFigs(text);
  const ansSf = answerSigFigs(card.answer);
  // Correctly rounded to at least 3 s.f. (or to the precision the card itself uses, if lower).
  if (k >= Math.min(3, ansSf) && close(Number(expected.toPrecision(k)), typed)) return { correct: true, method: 'rounded', echo: r.echo };
  // More precise than the card asks for: 1.602e-19 on a 2 s.f. card, 343 for "approx. 340".
  if (Number.isFinite(ansSf) && k > ansSf && close(Number(typed.toPrecision(ansSf)), expected)) return { correct: true, method: 'rounded', echo: r.echo };
  return miss;
}
