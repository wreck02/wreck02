import { defineTemplate, retry, type Level } from '../../core/template';
import { buildOptions } from '../../core/options';
import { ex, d, keep, swapDigits, tex, tidy } from './_shared';

/**
 * Mental multiplication.
 * Level 1: times tables to 12 × 12
 * Level 2: 2-digit × 1-digit (47 × 6) and 3-digit × 1-digit (240 × 7)
 * Level 3: products with a trick: × 11, × 25, × 15, near 100, squares of numbers ending in 5, doubling and halving
 * Level 4: general 2-digit × 2-digit (37 × 48)
 * Level 5: 3-digit × 2-digit with friendly structure, or decimals (125 × 24, 2.5 × 3.6, 0.75 × 48)
 */
export default defineTemplate({
  id: 'm1.arithmetic.multiplication',
  module: 'M1',
  topic: 'arithmetic',
  title: 'Multiplication',
  levels: {
    1: 'times tables to 12 × 12',
    2: '2-digit × 1-digit and 3-digit × 1-digit: 47 × 6, 240 × 7',
    3: 'products with a trick: × 11, × 25, near 100, 35², doubling and halving',
    4: 'general 2-digit × 2-digit: 37 × 48',
    5: '3-digit × 2-digit or decimals: 125 × 24, 2.5 × 3.6, 0.75 × 48',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      let a: number, b: number;
      let hint = '';
      if (level === 1) {
        a = rng.int(3, 12); b = rng.int(3, 12);
        hint = 'Straight from the tables.';
      } else if (level === 2) {
        if (rng.bool(0.35)) { a = rng.pick([120, 130, 140, 150, 160, 170, 180, 190, 210, 230, 240, 250, 260, 270, 280, 320, 340, 360, 380, 420, 450, 480]); b = rng.int(3, 9); }
        else { a = rng.int(13, 98); b = rng.int(3, 9); if (a % 10 === 0) return null; }
        hint = `Split ${a}: $${Math.floor(a / 10) * 10} \\times ${b} + ${a % 10} \\times ${b}$.`;
        if (a % 10 === 0) hint = `$${a / 10} \\times ${b}$, then put the zero back.`;
      } else if (level === 3) {
        const kind = rng.pick(['x11', 'x25', 'x15', 'near100', 'sq5', 'halve', 'x12', 'sq']);
        if (kind === 'x11') { a = rng.int(23, 89); b = 11; hint = `$\\times 11$: add the digits of ${a} and put the sum in the middle (carry if it is 10 or more).`; }
        else if (kind === 'x25') { a = rng.int(12, 96); b = 25; if (a % 4 !== 0 && rng.bool(0.6)) return null; hint = `$\\times 25$ is $\\times 100 \\div 4$: $${a * 100} \\div 4$.`; }
        else if (kind === 'x15') { a = rng.pick([12, 14, 16, 18, 22, 24, 26, 28, 32, 34, 36, 42, 44, 46, 48, 52, 54, 56, 62, 64, 66, 68]); b = 15; hint = `$\\times 15$ is $\\times 10$ plus half of that: $${a * 10} + ${a * 5}$.`; }
        else if (kind === 'near100') { a = rng.pick([98, 99, 101, 102, 97, 103]); b = rng.int(6, 47); hint = `Use $${a} = 100 ${a > 100 ? '+' : '-'} ${Math.abs(100 - a)}$: $${100 * b} ${a > 100 ? '+' : '-'} ${Math.abs(100 - a) * b}$.`; }
        else if (kind === 'sq5') { a = rng.pick([15, 25, 35, 45, 55, 65, 75, 85, 95]); b = a; const t = (a - 5) / 10; hint = `A number ending in 5 squared: $${t} \\times ${t + 1}$ followed by 25.`; }
        else if (kind === 'halve') { a = rng.pick([14, 16, 18, 22, 24, 26, 28, 32, 34, 36, 38, 44, 48]); b = rng.pick([15, 25, 35, 45, 55]); hint = `Halve one and double the other: $${a / 2} \\times ${2 * b}$.`; }
        else if (kind === 'x12') { a = rng.int(13, 79); b = 12; hint = `$\\times 12$ is $\\times 10$ plus $\\times 2$: $${a * 10} + ${a * 2}$.`; }
        else { a = rng.int(13, 29); b = a; hint = `$${a}^2 = (${a - (a % 10)} + ${a % 10})^2 = ${(a - (a % 10)) ** 2} + 2 \\times ${a - (a % 10)} \\times ${a % 10} + ${(a % 10) ** 2}$.`; }
      } else if (level === 4) {
        a = rng.int(13, 49); b = rng.int(13, 49);
        if (a % 10 === 0 || b % 10 === 0 || a === b) return null;
        const big = Math.max(a, b), small = Math.min(a, b);
        hint = `Split one factor: $${big} \\times ${small} = ${big} \\times ${Math.floor(small / 10) * 10} + ${big} \\times ${small % 10} = ${big * Math.floor(small / 10) * 10} + ${big * (small % 10)}$.`;
      } else {
        const kind = rng.pick(['friendly', 'decimal', 'decimal', 'big']);
        if (kind === 'friendly') {
          const pair = rng.pick<[number, number]>([[125, 24], [125, 32], [125, 48], [125, 56], [375, 16], [375, 24], [240, 35], [160, 45], [180, 35], [220, 45], [199, 14], [198, 25], [201, 23], [250, 36], [150, 64], [225, 16], [175, 24], [140, 55]]);
          [a, b] = rng.bool() ? pair : [pair[1], pair[0]];
          hint = a % 125 === 0 || b % 125 === 0 ? 'Use $125 = 1000 \\div 8$.' : 'Look for a factor pair that makes a round number, or use a near-round number and adjust.';
        } else if (kind === 'decimal') {
          const pairs: [number, number][] = [[2.5, 3.6], [2.5, 4.8], [1.5, 6.4], [0.75, 48], [0.25, 36], [1.25, 64], [0.6, 4.5], [0.8, 3.5], [3.5, 1.2], [4.5, 2.4], [0.125, 56], [7.5, 1.6], [0.35, 20], [0.45, 60], [1.75, 8], [2.4, 1.5]];
          const p = rng.pick(pairs);
          [a, b] = rng.bool() ? p : [p[1], p[0]];
          hint = 'Ignore the decimal points, multiply the whole numbers, then put back the total number of decimal places.';
        } else {
          a = rng.int(51, 98); b = rng.int(23, 49);
          if (a % 10 === 0 || b % 10 === 0) return null;
          hint = `$${a} \\times ${b} = ${a} \\times ${Math.floor(b / 10) * 10} + ${a} \\times ${b % 10}$.`;
        }
      }
      const value = tidy(a * b);
      const answer = ex(value);
      if (!answer) return null;
      const decimal = !Number.isInteger(a) || !Number.isInteger(b);
      const pick = (max: number) => rng.int(0, max);
      const swapped = decimal ? null : swapDigits(value, pick);
      const tensA = Math.floor(a / 10) * 10, unitsA = a % 10;
      const tensB = Math.floor(b / 10) * 10, unitsB = b % 10;
      const distractors = keep([
        d(tidy(value + b), 'one multiple too many', true),
        d(tidy(value - b), 'one multiple too few', true),
        d(tidy(value + a), 'one multiple too many'),
        d(tidy(value - a), 'one multiple too few'),
        !decimal && tensA > 0 && unitsA > 0 ? d(tensA * b + unitsA, 'multiplied only the tens digit, then added the units') : null,
        !decimal && tensB > 0 && unitsB > 0 ? d(a * tensB + unitsB * (a - tensA), 'lost a partial product when splitting') : null,
        !decimal && tensA > 0 && tensB > 0 ? d(tensA * tensB + unitsA * unitsB, 'multiplied tens by tens and units by units only') : null,
        a === b && !decimal ? d(a * a - 2 * tensA * unitsA, '(a + b)² taken as a² + b², cross term dropped') : null,
        d(tidy(value * 10), 'place value out by a factor of ten'),
        d(tidy(value / 10), 'place value out by a factor of ten'),
        swapped !== null ? d(swapped, 'two digits of the answer swapped') : null,
        d(value + 10, 'carry slip'),
        d(value - 10, 'carry slip'),
        d(value + 100, 'carry slip in the hundreds'),
        d(a + b, 'added instead of multiplying'),
      ]);
      return {
        stem: `Work out $${tex(a)} \\times ${tex(b)}$.`,
        answer: { kind: 'exact' as const, value: answer, format: 'decimal' as const },
        options: buildOptions(rng, answer, distractors, { format: 'decimal' }),
        solution: `${hint} The product is $${tex(value)}$.`,
        trap: 'Split one factor into tens and units and keep both partial products; check the last digit of the answer against the last digits of the factors.',
        tags: ['arithmetic', 'multiplication'],
        params: { a, b },
        typedAllowed: true,
      };
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const { a, b } = q.params as { a: number; b: number };
    // Independent route: repeated addition in integer thousandths.
    const A = Math.round(a * 1000), B = Math.round(b * 1000);
    const product = (BigInt(A) * BigInt(B));
    return Math.abs(Number(product) / 1e6 - q.answer.value.toNumber()) < 1e-9;
  },
});
