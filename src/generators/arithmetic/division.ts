import { defineTemplate, retry, type Level } from '../../core/template';
import { buildOptions } from '../../core/options';
import { ex, d, keep, tex, tidy } from './_shared';

/**
 * Mental division.
 * Level 1: division facts from the tables (72 ÷ 8)
 * Level 2: 2- and 3-digit ÷ 1-digit, exact (224 ÷ 7)
 * Level 3: ÷ 2-digit exact, ÷ 0.5 / 0.25 / 0.2, and remainders (432 ÷ 18, 7 ÷ 0.25, remainder of 250 ÷ 7)
 * Level 4: quotients that are terminating decimals (27 ÷ 8 = 3.375, 18 ÷ 25 = 0.72, 4.8 ÷ 1.2)
 * Level 5: 4-digit ÷ 2-digit exact, or a product over a divisor with cancelling (1728 ÷ 24, 36 × 25 ÷ 15)
 */
export default defineTemplate({
  id: 'm1.arithmetic.division',
  module: 'M1',
  topic: 'arithmetic',
  title: 'Division',
  levels: {
    1: 'table facts: 72 ÷ 8',
    2: '2- and 3-digit ÷ 1-digit, exact: 224 ÷ 7',
    3: '÷ 2-digit exact, ÷ 0.5 / 0.25 / 0.2, and remainders: 432 ÷ 18, 7 ÷ 0.25',
    4: 'terminating-decimal quotients: 27 ÷ 8, 18 ÷ 25, 4.8 ÷ 1.2',
    5: '4-digit ÷ 2-digit, or a product over a divisor with cancelling: 1728 ÷ 24, 36 × 25 ÷ 15',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      let kind: 'quot' | 'rem' | 'chain' = 'quot';
      let n: number, m: number, k = 1; // value = (k × n) ÷ m for chain; n ÷ m otherwise
      let hint = '';
      if (level === 1) {
        const q = rng.int(3, 12); m = rng.int(3, 12); n = q * m;
        hint = `Which times-table fact gives $${n}$? $${m} \\times ${q} = ${n}$.`;
      } else if (level === 2) {
        const q = rng.int(13, 98); m = rng.int(3, 9); n = q * m;
        if (n < 60) return null;
        hint = `Split $${n}$ into a multiple of $${m}$ you know plus a remainder part: $${Math.floor(q / 10) * 10 * m} + ${(q % 10) * m}$, so the quotient is $${Math.floor(q / 10) * 10} + ${q % 10}$.`;
      } else if (level === 3) {
        const c = rng.pick(['two', 'two', 'dec', 'rem']);
        if (c === 'two') {
          m = rng.pick([12, 14, 15, 16, 18, 21, 24, 25, 32, 35, 36, 45]); const q = rng.int(12, 48); n = q * m;
          if (n > 2000) return null;
          hint = m === 25 ? `$\\div 25$ is $\\times 4 \\div 100$: $${n * 4} \\div 100$.` : `Factor the divisor: $${m} = ${smallestFactor(m)} \\times ${m / smallestFactor(m)}$, so divide by $${smallestFactor(m)}$ then by $${m / smallestFactor(m)}$.`;
        } else if (c === 'dec') {
          m = rng.pick([0.5, 0.25, 0.2, 0.1, 0.05, 0.125]);
          n = rng.pick(m === 0.125 ? [3, 5, 7, 9, 11] : [3, 6, 7, 9, 12, 14, 18, 21, 24, 27, 36, 45]);
          hint = `Dividing by $${m}$ is multiplying by $${tidy(1 / m)}$.`;
        } else {
          kind = 'rem';
          m = rng.int(6, 13); n = rng.int(100, 400);
          if (n % m === 0) return null;
          hint = `The largest multiple of $${m}$ below $${n}$ is $${m * Math.floor(n / m)}$, so the remainder is $${n} - ${m * Math.floor(n / m)}$.`;
        }
      } else if (level === 4) {
        const c = rng.pick(['frac', 'frac', 'decdiv']);
        if (c === 'frac') {
          m = rng.pick([4, 8, 5, 16, 20, 25, 40, 50]);
          n = rng.int(3, 60);
          // coprime, so the decimal really has to be worked out (8 ÷ 16 is just a half)
          if (n % m === 0 || gcd(n, m) !== 1) return null;
          if (m === 16 && n > 24) return null;
          hint = n > m
            ? `Take out the whole part ($${Math.floor(n / m)}$), then write the remaining $\\frac{${n % m}}{${m}}$ as a decimal using $\\frac{1}{${m}} = ${tidy(1 / m)}$.`
            : `Write $\\frac{${n}}{${m}}$ as a decimal: $\\frac{1}{${m}} = ${tidy(1 / m)}$, so multiply that by $${n}$ (or scale the fraction to a denominator of 100 or 1000).`;
        } else {
          m = rng.pick([1.2, 1.5, 2.5, 0.8, 0.6, 0.4, 1.6, 3.5, 0.15, 0.75]);
          const q = rng.pick([3, 4, 5, 6, 8, 12, 15]);
          n = tidy(q * m);
          if (n > 60) return null;
          hint = `Scale both numbers by the same power of ten to make the divisor whole: $${tex(n * 10)} \\div ${tex(m * 10)}$, or spot $${tex(m)} \\times ${q} = ${tex(n)}$.`;
        }
      } else {
        const c = rng.pick(['big', 'chain', 'chain']);
        if (c === 'big') {
          m = rng.pick([12, 15, 16, 18, 24, 25, 32, 36, 45, 48, 64, 75]); const q = rng.int(24, 96); n = q * m;
          if (n < 1000 || n > 9999) return null;
          hint = `Divide in two steps using the factors of $${m}$, or find how many $${m}$s make the thousands first.`;
        } else {
          kind = 'chain';
          const r = rng.pick([12, 15, 16, 18, 24, 25, 35, 45]); // divisor
          const f = rng.pick([2, 3, 4, 5, 6, 8, 9].filter((x) => r % x === 0)); // common factor with one numerator
          k = f * rng.int(3, 12); n = rng.pick([25, 35, 45, 15, 16, 24, 36, 48, 64, 75, 12, 18].filter((x) => (x * k) % r === 0));
          if (!n) return null;
          m = r;
          if ((k * n) / m > 999) return null;
          hint = `Cancel before multiplying: $${k} \\div ${f} = ${k / f}$ and $${m} \\div ${f} = ${m / f}$, so the value is $${k / f} \\times ${n} \\div ${m / f}$.`;
        }
      }
      const value = kind === 'rem' ? n % m : tidy((k * n) / m);
      const answer = ex(value);
      if (!answer) return null;
      const stem = kind === 'rem'
        ? `Find the remainder when $${n}$ is divided by $${m}$.`
        : kind === 'chain'
          ? `Work out $${k} \\times ${n} \\div ${m}$.`
          : `Work out $${tex(n)} \\div ${tex(m)}$.`;
      const q = kind === 'rem' ? Math.floor(n / m) : value;
      const distractors = kind === 'rem'
        ? keep([
          d(q, 'gave the quotient instead of the remainder', true),
          d(m - value, 'counted up to the next multiple instead of down from it', true),
          d(value + 1, 'off by one'),
          d(Math.max(0, value - 1), 'off by one'),
          d(n % (m + 1), 'divided by the wrong number'),
          d(n % (m - 1), 'divided by the wrong number'),
        ])
        : keep([
          d(tidy(value * 10), 'place value out by a factor of ten', true),
          d(tidy(value / 10), 'place value out by a factor of ten'),
          d(value + 1, 'one multiple too many', true),
          d(value - 1, 'one multiple too few'),
          d(value + 2, 'two multiples too many'),
          d(value - 2, 'two multiples too few'),
          m !== 0 && value !== 0 ? d(tidy(m / (kind === 'chain' ? k * n : n) * (kind === 'chain' ? 1 : 1)), 'divided the wrong way round') : null,
          kind === 'quot' && m < 1 ? d(tidy(n * m), 'multiplied by the decimal instead of dividing') : null,
          kind === 'quot' && m > 1 ? d(tidy(n * m), 'multiplied instead of dividing') : null,
          kind === 'chain' ? d(tidy(k * n * m), 'multiplied by the divisor instead of dividing') : null,
          kind === 'chain' ? d(tidy(k / m + n), 'divided only the first factor and added the second') : null,
          !Number.isInteger(value) ? d(Math.floor(value), 'stopped at the whole-number part') : null,
          !Number.isInteger(value) ? d(tidy(Math.floor(value) + (value - Math.floor(value)) * 2), 'converted the remainder fraction wrongly') : null,
          value > 2 && Number.isInteger(value) ? d(value + 10, 'carry slip in the tens') : null,
          value > 12 && Number.isInteger(value) ? d(value - 10, 'lost ten in the tens column') : null,
        ]);
      return {
        stem,
        answer: { kind: 'exact' as const, value: answer, format: 'decimal' as const },
        options: buildOptions(rng, answer, distractors, { format: 'decimal' }),
        solution: `${hint} ${kind === 'rem' ? `The remainder is $${value}$.` : `The answer is $${tex(value)}$.`}`,
        trap: kind === 'rem' ? 'The remainder is what is left after the largest multiple, not the quotient.' : 'Check by multiplying back: quotient × divisor must return the dividend, decimal places included.',
        tags: ['arithmetic', 'division'],
        params: { kind, n, m, k },
        typedAllowed: true,
      };
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const { kind, n, m, k } = q.params as { kind: string; n: number; m: number; k: number };
    const got = q.answer.value.toNumber();
    if (kind === 'rem') {
      // Independent route: remainder is n minus quotient times divisor, checked by reconstruction.
      const quot = Math.floor(n / m);
      return got === n - quot * m && got >= 0 && got < m;
    }
    // Independent route: multiply back in integer thousandths and compare with the dividend.
    const back = Math.round(got * Math.round(m * 1000)) / 1000;
    return Math.abs(back - k * n) < 1e-6;
  },
});

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

function smallestFactor(x: number): number {
  for (let f = 2; f <= x; f++) if (x % f === 0 && f !== x) return f;
  return x;
}
