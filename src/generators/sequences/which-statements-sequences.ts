import { defineTemplate, retry, type Level } from '../../core/template';
import { statementOptions, STATEMENT_COMBOS } from '../../core/options';

/**
 * "Which of the following statements are true?" about an arithmetic or geometric sequence.
 * Level 1: arithmetic sequence given by first terms; statements about a later term and the common difference
 * Level 2: statements include the nth-term formula
 * Level 3: geometric sequences with ratio 2, 3 or 1/2
 * Level 4: statements about sums of arithmetic sequences
 * Level 5: geometric sequence with negative or fractional ratio, sum to infinity statement
 */
export default defineTemplate({
  id: 'm1.sequences.which-statements',
  module: 'M1',
  topic: 'sequences',
  title: 'Which statements are true (sequences)',
  levels: {
    1: 'arithmetic: later term, common difference',
    2: 'arithmetic: nth-term formula included',
    3: 'geometric with ratio 2, 3 or 1/2',
    4: 'arithmetic sums S_n',
    5: 'geometric with negative/fractional ratio; sum to infinity',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      const statements: { text: string; truth: boolean }[] = [];
      let intro: string;
      const params: Record<string, unknown> = { level };

      if (level <= 2 || level === 4) {
        const a = rng.int(-5, 12);
        const d = rng.nonZeroInt(-6, 8);
        params.kind = 'arith'; params.a = a; params.d = d;
        const terms = [0, 1, 2, 3].map((i) => a + i * d);
        intro = `The first four terms of an arithmetic sequence are $${terms.join(',\\ ')},\\ \\dots$`;
        const n = rng.pick([10, 12, 15, 20]);
        const un = a + (n - 1) * d;
        const wrongUn = rng.bool() ? a + n * d : un + d * rng.sign();
        params.n = n;
        // Statement I: the nth term
        const claimUn = rng.bool() ? un : wrongUn;
        statements.push({ text: `The ${n}th term is $${claimUn}$.`, truth: claimUn === un });
        if (level === 4) {
          const m = rng.pick([10, 20]);
          const Sm = (m / 2) * (2 * a + (m - 1) * d);
          const wrongS = rng.bool() ? (m / 2) * (2 * a + m * d) : Sm + m;
          const claimS = rng.bool() ? Sm : wrongS;
          statements.push({ text: `The sum of the first ${m} terms is $${claimS}$.`, truth: claimS === Sm });
          params.m = m;
        } else if (level === 2) {
          const claimA = rng.bool() ? d : d + rng.sign();
          const claimB = rng.bool() ? a - d : a;
          const truth = claimA === d && claimB === a - d;
          statements.push({ text: `The $n$th term is $${claimA}n ${claimB >= 0 ? '+' : '-'} ${Math.abs(claimB)}$.`, truth });
        } else {
          const claimD = rng.bool() ? d : -d;
          statements.push({ text: `The common difference is $${claimD}$.`, truth: claimD === d });
        }
        // Statement III: is some value a term of the sequence?
        const kIdx = rng.int(5, 12);
        const inSeq = rng.bool();
        const candidate = inSeq ? a + (kIdx - 1) * d : a + (kIdx - 1) * d + rng.pick(Math.abs(d) > 1 ? [1, -1] : [d + 1]);
        const isTerm = (candidate - a) % d === 0 && (candidate - a) / d >= 0;
        statements.push({ text: `$${candidate}$ is a term of the sequence.`, truth: isTerm });
      } else {
        const r = level === 3 ? rng.pick([2, 3, 0.5]) : rng.pick([-2, -0.5, 0.25, -3, 1.5]);
        const a = rng.pick(level === 3 ? [1, 2, 3, 4, 5, 8] : [4, 8, 16, 12, 32, 64]);
        params.kind = 'geo'; params.a = a; params.r = r;
        const fmt = (x: number) => (Number.isInteger(x) ? `${x}` : x.toString());
        const terms = [0, 1, 2, 3].map((i) => a * r ** i);
        if (terms.some((t) => !Number.isInteger(t * 8))) return null;
        intro = `A geometric sequence has first four terms $${terms.map(fmt).join(',\\ ')},\\ \\dots$`;
        const claimR = rng.bool() ? r : (rng.bool() ? -r : 1 / r);
        statements.push({ text: `The common ratio is $${fmt(claimR)}$.`, truth: claimR === r });
        const n = level === 3 ? rng.pick([6, 7, 8]) : rng.pick([5, 6]);
        const un = a * r ** (n - 1);
        if (!Number.isInteger(un * 16) || Math.abs(un) > 5000) return null;
        const wrongUn = a * r ** n;
        const claimUn = rng.bool() ? un : wrongUn;
        statements.push({ text: `The ${n}th term is $${fmt(claimUn)}$.`, truth: claimUn === un });
        params.n = n;
        if (Math.abs(r) < 1) {
          const sInf = a / (1 - r);
          const wrongSinf = a / (1 + r);
          const claim = rng.bool() ? sInf : wrongSinf;
          if (!Number.isInteger(claim * 4)) return null;
          statements.push({ text: `The sum to infinity is $${fmt(claim)}$.`, truth: claim === sInf });
        } else {
          statements.push({ text: `The sequence has a sum to infinity.`, truth: false });
        }
      }
      const truth = statements.map((s) => s.truth) as [boolean, boolean, boolean];
      const options = statementOptions(truth);
      const correct = options.find((o) => o.correct)!.display;
      const stem = `${intro}\n\nWhich of the following statements are true?\n\nI. ${statements[0].text}\nII. ${statements[1].text}\nIII. ${statements[2].text}`;
      const solution = statements.map((s, i) => `${['I', 'II', 'III'][i]}: ${s.truth ? 'true' : 'false'}`).join('; ') + '.' +
        (params.kind === 'arith' ? ` Use $u_n = a + (n-1)d$ with $a = ${params.a}$, $d = ${params.d}$; a value is a term only if (value − a)/d is a non-negative integer.` : ` Use $u_n = ar^{n-1}$; a sum to infinity exists only when $|r| < 1$.`);
      return {
        stem,
        answer: { kind: 'choice' as const, value: correct },
        options,
        solution,
        trap: 'Off-by-one in the index (using n instead of n − 1) is the usual way a “true-looking” statement is false.',
        tags: ['sequences', 'statements'],
        params: { ...params, truth, statements: statements.map((s) => s.text) },
        typedAllowed: false,
      };
    });
  },
  verify(q) {
    if (q.answer.kind !== 'choice') return false;
    const { truth } = q.params as { truth: [boolean, boolean, boolean] };
    // Recompute the option text from the truth vector independently of statementOptions.
    const names = ['I', 'II', 'III'].filter((_, i) => truth[i]);
    let expected: string;
    if (names.length === 0) expected = 'none of them';
    else if (names.length === 3) expected = 'I, II and III';
    else if (names.length === 1) expected = `${names[0]} only`;
    else expected = `${names[0]} and ${names[1]} only`;
    return STATEMENT_COMBOS.includes(expected) && q.answer.value === expected && q.options.filter((o) => o.correct).length === 1;
  },
});
