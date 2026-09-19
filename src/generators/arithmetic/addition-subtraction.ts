import { defineTemplate, retry, type Level } from '../../core/template';
import { buildOptions } from '../../core/options';
import { ex, d, keep, swapDigits, tex, tidy } from './_shared';

/**
 * Mental addition and subtraction.
 * Level 1: two 2-digit numbers (47 + 38, 82 − 47)
 * Level 2: 3-digit ± 3-digit with carries or borrows (482 + 359, 703 − 268)
 * Level 3: three terms mixing + and −, or a complement to 1000 (148 + 67 − 93, 1000 − 347)
 * Level 4: decimals to two places (12.7 + 8.45, 30 − 12.35)
 * Level 5: four terms with decimals, or 4-digit numbers (2.75 + 13.6 − 4.85 + 0.5, 4826 + 3597)
 */
export default defineTemplate({
  id: 'm1.arithmetic.addition-subtraction',
  module: 'M1',
  topic: 'arithmetic',
  title: 'Addition and subtraction',
  levels: {
    1: 'two 2-digit numbers: 47 + 38, 82 − 47',
    2: '3-digit ± 3-digit with carries or borrows: 482 + 359, 703 − 268',
    3: 'three terms, or a complement to 1000: 148 + 67 − 93, 1000 − 347',
    4: 'decimals to two places: 12.7 + 8.45, 30 − 12.35',
    5: 'four terms with decimals, or 4-digit numbers: 2.75 + 13.6 − 4.85 + 0.5',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      // terms with signs; the first is always positive
      let terms: number[] = [];
      let signs: (1 | -1)[] = [];
      if (level === 1) {
        const a = rng.int(23, 98), b = rng.int(14, 89);
        const sub = rng.bool();
        if (sub && b >= a) return null;
        terms = [a, b]; signs = [1, sub ? -1 : 1];
        // insist on a carry or a borrow: that is what makes it a mental exercise
        if (!sub && (a % 10) + (b % 10) < 10) return null;
        if (sub && (a % 10) >= (b % 10)) return null;
      } else if (level === 2) {
        const a = rng.int(215, 987), b = rng.int(118, 899);
        const sub = rng.bool();
        if (sub && b >= a) return null;
        terms = [a, b]; signs = [1, sub ? -1 : 1];
        if (!sub && (a % 10) + (b % 10) < 10 && (Math.floor(a / 10) % 10) + (Math.floor(b / 10) % 10) < 10) return null;
        if (sub && (a % 10) >= (b % 10) && (Math.floor(a / 10) % 10) >= (Math.floor(b / 10) % 10)) return null;
      } else if (level === 3) {
        if (rng.bool(0.3)) {
          const b = rng.int(123, 897);
          if (b % 10 === 0) return null;
          terms = [1000, b]; signs = [1, -1];
        } else {
          const a = rng.int(120, 480), b = rng.int(23, 98), c = rng.int(24, 199);
          const s2: 1 | -1 = rng.bool() ? 1 : -1;
          const s3: 1 | -1 = s2 === 1 ? -1 : (rng.bool() ? 1 : -1);
          terms = [a, b, c]; signs = [1, s2, s3];
        }
      } else if (level === 4) {
        const a = rng.int(45, 899) / 10;            // one decimal place
        const b = rng.int(105, 2999) / 100;         // two decimal places
        const sub = rng.bool();
        if (rng.bool(0.3)) {
          const whole = rng.pick([20, 30, 40, 50, 60, 80, 100]);
          if (b >= whole) return null;
          terms = [whole, b]; signs = [1, -1];
        } else {
          if (sub && b >= a) return null;
          terms = [a, b]; signs = [1, sub ? -1 : 1];
        }
      } else {
        if (rng.bool(0.4)) {
          const a = rng.int(2134, 6987), b = rng.int(1123, 4899);
          const sub = rng.bool();
          if (sub && b >= a) return null;
          terms = [a, b]; signs = [1, sub ? -1 : 1];
        } else {
          const t = [rng.int(105, 999) / 100, rng.int(45, 249) / 10, rng.int(105, 999) / 100, rng.int(1, 39) / 4];
          const sg: (1 | -1)[] = [1, rng.bool() ? 1 : -1, rng.bool() ? 1 : -1, rng.bool() ? 1 : -1];
          // TS narrows the array after every(); build the final list explicitly
          const allPlus = sg[1] === 1 && sg[2] === 1 && sg[3] === 1;
          terms = t; signs = allPlus ? [1, 1, -1, 1] : sg;
        }
      }
      const value = tidy(terms.reduce((acc, t, i) => acc + signs[i] * t, 0));
      if (value <= 0) return null;
      const answer = ex(value);
      if (!answer) return null;

      const stemExpr = terms.map((t, i) => (i === 0 ? tex(t) : ` ${signs[i] === 1 ? '+' : '-'} ${tex(t)}`)).join('');
      const decimal = terms.some((t) => !Number.isInteger(t));
      const unit = decimal ? 1 : 10;
      const pick = (max: number) => rng.int(0, max);
      const swapped = decimal ? null : swapDigits(value, pick);
      const wrongSignValue = signs.length > 1 ? tidy(terms.reduce((acc, t, i) => acc + (i === signs.length - 1 ? -signs[i] : signs[i]) * t, 0)) : NaN;
      const distractors = keep([
        d(value + unit, decimal ? 'carried one too many' : 'carry slip: ten too many', true),
        d(value - unit, decimal ? 'dropped a carry' : 'carry slip: ten too few', true),
        d(value + unit * 10, 'carry slip in the hundreds column'),
        d(value - unit * 10, 'borrow slip in the hundreds column'),
        wrongSignValue > 0 && wrongSignValue !== value ? d(wrongSignValue, 'used the wrong sign for the last term') : null,
        swapped !== null && swapped > 0 ? d(swapped, 'two digits of the answer swapped') : null,
        decimal ? d(tidy(value * 10), 'decimal point one place out') : null,
        decimal ? d(tidy(value / 10), 'decimal point one place out') : null,
        d(value + 1, 'off by one'),
        d(value - 1, 'off by one'),
        decimal ? d(tidy(value + 0.1), 'misaligned the decimal places') : null,
        decimal ? d(tidy(value - 0.1), 'misaligned the decimal places') : null,
      ]);
      const route = signs.length === 2 && signs[1] === -1
        ? `Count up from $${tex(terms[1])}$ to $${tex(terms[0])}$, or subtract in parts: hundreds, then tens, then units.`
        : signs.length === 2
          ? `Add the larger parts first, then the small ones: $${tex(terms[0])} + ${tex(terms[1])} = ${tex(value)}$.`
          : `Group the additions and the subtractions, or work left to right in round numbers, then adjust: the result is $${tex(value)}$.`;
      return {
        stem: `Work out $${stemExpr}$.`,
        answer: { kind: 'exact' as const, value: answer, format: 'decimal' as const },
        options: buildOptions(rng, answer, distractors, { format: 'decimal' }),
        solution: route,
        trap: 'Carries and borrows are where mental sums go wrong; line the place values up and check the units digit first.',
        tags: ['arithmetic', 'addition', 'subtraction'],
        params: { terms, signs },
        typedAllowed: true,
      };
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const { terms, signs } = q.params as { terms: number[]; signs: number[] };
    // Independent route: exact integer arithmetic in hundredths.
    const cents = terms.reduce((acc, t, i) => acc + signs[i] * Math.round(t * 100), 0);
    return Math.abs(cents / 100 - q.answer.value.toNumber()) < 1e-9;
  },
});
