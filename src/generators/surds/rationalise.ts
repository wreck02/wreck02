import { defineTemplate, retry, type Level } from '../../core/template';
import { E, frac, surd, Exact, rat } from '../../core/exact';
import { buildOptions, type Distractor } from '../../core/options';
import { isCleanExact } from '../../core/clean';
import { squarefreeDecompose } from '../../core/exact';
import { gcd } from '../../core/gen-utils';

/**
 * Rationalise a denominator.
 * Level 1: k/√a                       6/√3 = 2√3, 1/√2 = √2/2
 * Level 2: a/(b√c)                    5/(2√5) = √5/2
 * Level 3: 1/(a ± √b)                 1/(2+√3) = 2 − √3
 * Level 4: (a ± √b)/(c ± √b)          (1+√2)/(3−√2) = (5+4√2)/7, positive norm
 * Level 5: negative norm (2+√3)/(1−√3) = −5/2 − 3√3/2, or (√a+√b)/(√a−√b) = 4 + √15
 */

/** A sum of terms c√r written as [c, r] pairs (r = 1 means a rational term). JSON-friendly. */
type Terms = [number, number][];

function toExact(ts: Terms): Exact {
  return ts.reduce((acc, [c, r]) => acc.add(r === 1 ? E(c) : surd(r, c)), Exact.ZERO);
}

function toFloat(ts: Terms): number {
  return ts.reduce((acc, [c, r]) => acc + c * Math.sqrt(r), 0);
}

/** LaTeX in the order given: [[2,1],[-1,3]] → "2 - \sqrt{3}", [[3,2]] → "3\sqrt{2}", [[1,5],[-1,3]] → "\sqrt{5} - \sqrt{3}". */
function tex(ts: Terms): string {
  let out = '';
  for (const [c, r] of ts) {
    if (c === 0) continue;
    const mag = Math.abs(c);
    const body = r === 1 ? `${mag}` : `${mag === 1 ? '' : mag}\\sqrt{${r}}`;
    if (out === '') out = (c < 0 ? '-' : '') + body;
    else out += (c < 0 ? ' - ' : ' + ') + body;
  }
  return out || '0';
}

function fracTex(num: Terms, den: Terms): string {
  return `\\frac{${tex(num)}}{${tex(den)}}`;
}

function attempt(f: () => Exact): Exact | null {
  try {
    const v = f();
    return Number.isFinite(v.toNumber()) ? v : null;
  } catch {
    return null;
  }
}

/** Keep only distractors that exist and would pass the clean-number rule. */
function cleanOnly(ds: { value: Exact | null; trap: string }[]): Distractor[] {
  return ds.filter((d): d is { value: Exact; trap: string } => d.value !== null && isCleanExact(d.value).ok);
}

/** Split an exact value into its rational part and the rest. */
function splitRational(x: Exact): [Exact, Exact] {
  const ratPart = Exact.fromTerms(x.terms.filter((t) => t.r === 1 && t.k === 0));
  return [ratPart, x.sub(ratPart)];
}

const SQUAREFREE = [2, 3, 5, 6, 7, 10, 11, 13, 14, 15, 17, 19, 21, 22, 23, 26, 29, 30];

export default defineTemplate({
  id: 'm1.surds.rationalise',
  module: 'M1',
  topic: 'surds',
  title: 'Rationalise a denominator',
  levels: {
    1: 'k/√a: 6/√3, 1/√2',
    2: 'a/(b√c): 5/(2√5)',
    3: '1/(a ± √b) with a² − b small: 1/(2 + √3)',
    4: '(a ± √b)/(c ± √b) with positive norm: (1 + √2)/(3 − √2)',
    5: 'negative norm (2 + √3)/(1 − √3), or (√a + √b)/(√a − √b)',
  },
  generate(rng, level: Level) {
    return retry(rng, () => {
      // ------------------------------------------------------------------ level 1: k/√a
      if (level === 1) {
        const a = rng.pick([2, 3, 5, 6, 7]);
        const k = rng.bool(0.5) ? a * rng.int(1, 4) : rng.int(1, 9);
        const num: Terms = [[k, 1]];
        const den: Terms = [[1, a]];
        const answer = E(k).div(surd(a));
        if (!isCleanExact(answer).ok) return null;
        const distractors = cleanOnly([
          { value: surd(a, k), trap: 'multiplied the numerator by √a but left the denominator alone' },
          { value: frac(k, a), trap: 'multiplied the denominator by √a but forgot to multiply the numerator' },
          { value: surd(a, rat(k, a * a)), trap: 'wrote √a × √a = a², not a' },
          { value: surd(a, rat(1, k)), trap: 'inverted the fraction' },
          { value: E(k), trap: 'cancelled the a in the denominator against the a under the root sign' },
          { value: attempt(() => Exact.sqrtRat(rat(k, a))), trap: 'wrote k/√a as √(k/a) without squaring k' },
        ]);
        const stem = rng.bool(0.6)
          ? `Rationalise the denominator of $${fracTex(num, den)}$.`
          : `Simplify $${fracTex(num, den)}$, giving your answer with a rational denominator.`;
        const step = k % a === 0 ? `\\frac{${k}\\sqrt{${a}}}{${a}} = ${answer.toLatex()}` : `${answer.toLatex()}`;
        return {
          stem,
          answer: { kind: 'exact' as const, value: answer },
          options: buildOptions(rng, answer, distractors),
          solution: `Multiply top and bottom by $\\sqrt{${a}}$: $${fracTex(num, den)} = ${step}$.`,
          trap: 'Multiply top and bottom by the surd; √a × √a = a, so the denominator becomes a (not a²) and the numerator picks up a √a.',
          tags: ['surds', 'rationalise'],
          params: { level, variant: 'single', num, den },
          typedAllowed: true,
        };
      }

      // ------------------------------------------------------------------ level 2: a/(b√c)
      if (level === 2) {
        const c = rng.pick([2, 3, 5, 6, 7]);
        const b = rng.pick([2, 3, 4, 5]);
        const nice = [b, c, b * c, 2 * b, 2 * c, 3 * c].filter((x) => x <= 12);
        const a = rng.bool(0.6) ? rng.pick(nice) : rng.int(1, 12);
        const num: Terms = [[a, 1]];
        const den: Terms = [[b, c]];
        const answer = E(a).div(surd(c, b));
        if (!isCleanExact(answer).ok) return null;
        const distractors = cleanOnly([
          { value: surd(c, rat(a, b)), trap: 'multiplied the numerator by √c but forgot that the denominator becomes bc' },
          { value: frac(a, b * c), trap: 'multiplied the denominator by √c but forgot to multiply the numerator' },
          { value: surd(c, rat(a, b * b * c)), trap: 'multiplied the denominator by b√c but the numerator only by √c' },
          { value: surd(c, rat(b, a)), trap: 'inverted the fraction' },
          { value: surd(c, rat(a, b * c * c)), trap: 'wrote (√c)² = c², not c' },
          { value: surd(c, rat(a * b, c)), trap: 'multiplied the numerator by b√c but the denominator only by √c' },
        ]);
        const stem = rng.bool(0.6)
          ? `Rationalise the denominator of $${fracTex(num, den)}$.`
          : `Simplify $${fracTex(num, den)}$, giving your answer with a rational denominator.`;
        return {
          stem,
          answer: { kind: 'exact' as const, value: answer },
          options: buildOptions(rng, answer, distractors),
          solution: `Only the $\\sqrt{${c}}$ needs removing: multiply top and bottom by $\\sqrt{${c}}$ to get $\\frac{${a}\\sqrt{${c}}}{${b} \\times ${c}} = \\frac{${a}\\sqrt{${c}}}{${b * c}}${gcd(a, b * c) === 1 ? '' : ` = ${answer.toLatex()}`}$.`,
          trap: 'Multiply by √c only (not by b√c); the denominator becomes b × c and then cancel with the numerator.',
          tags: ['surds', 'rationalise'],
          params: { level, variant: 'single', num, den },
          typedAllowed: true,
        };
      }

      // ------------------------------------------------------------------ level 3: 1/(a ± √b)
      if (level === 3) {
        const a = rng.int(1, 5);
        const choices = SQUAREFREE.filter((b) => b !== a * a && Math.abs(a * a - b) <= 7);
        if (choices.length === 0) return null;
        const b = rng.pick(choices);
        const s = rng.sign();
        const num: Terms = [[1, 1]];
        const den: Terms = [[a, 1], [s, b]];
        const conj: Terms = [[a, 1], [-s, b]];
        const norm = a * a - b;
        const answer = E(1).div(toExact(den));
        if (!isCleanExact(answer).ok) return null;
        const C = toExact(conj);
        const distractors = cleanOnly([
          { value: toExact(den).mulRat(rat(1, norm)), trap: 'multiplied top and bottom by the denominator itself instead of its conjugate' },
          { value: C.mulRat(rat(1, a * a + b)), trap: 'took the new denominator as a² + b instead of a² − b' },
          { value: frac(1, norm), trap: 'forgot to multiply the numerator by the conjugate' },
          { value: answer.neg(), trap: 'lost the sign: a² − b is ' + (norm < 0 ? 'negative here' : 'positive here') },
          { value: frac(1, a).add(surd(b, rat(s, b))), trap: 'split 1/(a + √b) into 1/a + 1/√b, which is not allowed' },
          { value: a !== b ? C.mulRat(rat(1, a - b)) : null, trap: 'took the new denominator as a − b (forgot to square a)' },
        ]);
        const stem = rng.bool(0.5)
          ? `Rationalise the denominator of $${fracTex(num, den)}$.`
          : `Express $${fracTex(num, den)}$ in the form $p + q\\sqrt{${b}}$, where $p$ and $q$ are rational.`;
        return {
          stem,
          answer: { kind: 'exact' as const, value: answer },
          options: buildOptions(rng, answer, distractors),
          solution: `Multiply top and bottom by the conjugate $${tex(conj)}$. The denominator becomes $${a}^2 - ${b} = ${norm}$, so $${fracTex(num, den)} = \\frac{${tex(conj)}}{${norm}} = ${answer.toLatex()}$.`,
          trap: 'Multiply by the conjugate (sign of the surd flipped), not by the denominator itself; the denominator becomes a² − b, and if that is negative the whole answer changes sign.',
          tags: ['surds', 'rationalise', 'conjugate'],
          params: { level, variant: 'conjugate', num, den },
          typedAllowed: true,
        };
      }

      // ------------------------------------------------------------------ level 5 variant B: (√a ± √b)/(√a ∓ √b)
      if (level === 5 && rng.bool(0.4)) {
        const [a, b] = rng.pickDistinct([2, 3, 5, 6, 7, 10], 2);
        if (Math.abs(a - b) > 5) return null;
        const s = rng.sign();
        const num: Terms = [[1, a], [s, b]];
        const den: Terms = [[1, a], [-s, b]];
        const norm = a - b;
        const N = toExact(num);
        const Dn = toExact(den);
        const answer = N.div(Dn);
        if (!isCleanExact(answer).ok) return null;
        const full = N.mul(N); // a + b ± 2√(ab)
        const [ratPart, surdPart] = splitRational(full);
        const [, radicand] = squarefreeDecompose(a * b);
        const distractors = cleanOnly([
          { value: Dn.mul(Dn).mulRat(rat(1, norm)), trap: 'squared the denominator instead of the numerator (multiplied by the wrong conjugate)' },
          { value: full.mulRat(rat(1, a + b)), trap: 'took the new denominator as a + b instead of a − b' },
          { value: N.mulRat(rat(1, norm)), trap: 'forgot to multiply the numerator by the conjugate' },
          { value: answer.neg(), trap: 'lost the sign of a − b' },
          { value: E(a + b).mulRat(rat(1, norm)), trap: 'dropped the cross term 2√(ab) when squaring the numerator' },
          { value: E(a + b).add(surd(a * b, s)).mulRat(rat(1, norm)), trap: 'cross term written as √(ab) instead of 2√(ab)' },
          { value: ratPart.mulRat(rat(1, norm)).add(surdPart), trap: 'divided only the rational part of the numerator by the new denominator' },
        ]);
        const stem = rng.bool(0.5)
          ? `Rationalise the denominator of $${fracTex(num, den)}$.`
          : `Express $${fracTex(num, den)}$ in the form $p + q\\sqrt{${radicand}}$, where $p$ and $q$ are rational.`;
        return {
          stem,
          answer: { kind: 'exact' as const, value: answer },
          options: buildOptions(rng, answer, distractors),
          solution: `Multiply top and bottom by $${tex(num)}$. Denominator: $(\\sqrt{${a}})^2 - (\\sqrt{${b}})^2 = ${a} - ${b} = ${norm}$. Numerator: $(${tex(num)})^2 = ${a} + ${b} ${s > 0 ? '+' : '-'} 2\\sqrt{${a * b}} = ${full.toLatex()}$. So the value is $\\frac{${full.toLatex()}}{${norm}} = ${answer.toLatex()}$.`,
          trap: 'The conjugate of √a − √b is √a + √b, so the numerator gets squared: (√a + √b)² = a + b + 2√(ab), and the denominator is a − b (watch its sign).',
          tags: ['surds', 'rationalise', 'conjugate'],
          params: { level, variant: 'two-surds', num, den },
          typedAllowed: true,
        };
      }

      // ------------------------------------------------------------------ levels 4 and 5A: (a ± q√b)/(c ± √b)
      const b = rng.pick([2, 3, 5, 6, 7]);
      let c: number;
      if (level === 4) {
        c = rng.pick([2, 3, 4]);
        if (c * c - b <= 0 || c * c - b > 11) return null; // positive, mental-sized norm
      } else {
        c = rng.pick([1, 1, 2]);
        if (c * c - b >= 0) return null; // negative norm is the point of level 5
      }
      const a = rng.int(1, level === 4 ? 5 : 4);
      const qn = level === 5 && rng.bool(0.3) ? 2 : 1;
      const s1 = rng.sign();
      const s2 = rng.sign();
      if (a === c && qn === 1 && s1 === s2) return null; // would be 1
      const num: Terms = [[a, 1], [s1 * qn, b]];
      const den: Terms = [[c, 1], [s2, b]];
      const conj: Terms = [[c, 1], [-s2, b]];
      const norm = c * c - b;
      const N = toExact(num);
      const Dn = toExact(den);
      const C = toExact(conj);
      const answer = N.div(Dn);
      if (!isCleanExact(answer).ok || answer.isRational()) return null; // a rational answer means the numerator was a multiple of the denominator
      const full = N.mul(C); // p + q√b before dividing by the norm
      const [ratPart, surdPart] = splitRational(full);
      // expansion of (a + s1·qn√b)(c − s2√b): rational part ac − s1·s2·qn·b, surd coefficient s1·qn·c − s2·a
      const crossCoef = s1 * qn * c - s2 * a;
      const distractors = cleanOnly([
        { value: N.mul(Dn).mulRat(rat(1, norm)), trap: 'multiplied top and bottom by the denominator itself instead of its conjugate' },
        { value: full.mulRat(rat(1, c * c + b)), trap: 'took the new denominator as c² + b instead of c² − b' },
        { value: N.mulRat(rat(1, norm)), trap: 'forgot to multiply the numerator by the conjugate' },
        { value: answer.neg(), trap: norm < 0 ? 'dropped the minus sign of the negative denominator c² − b' : 'sign of the whole answer flipped' },
        { value: ratPart.mulRat(rat(1, norm)).add(surdPart), trap: 'divided only the rational part of the numerator by the new denominator' },
        { value: frac(a * c - s1 * s2 * qn * b, norm), trap: 'lost the √b terms when expanding the numerator' },
        { value: E(a * c + s1 * s2 * qn * b).add(surd(b, crossCoef)).mulRat(rat(1, norm)), trap: 'sign error in the numerator: (√b)(−√b) = −b' },
      ]);
      const stem = rng.bool(0.5)
        ? `Rationalise the denominator of $${fracTex(num, den)}$.`
        : `Express $${fracTex(num, den)}$ in the form $p + q\\sqrt{${b}}$, where $p$ and $q$ are rational.`;
      return {
        stem,
        answer: { kind: 'exact' as const, value: answer },
        options: buildOptions(rng, answer, distractors),
        solution: `Multiply top and bottom by the conjugate $${tex(conj)}$. Denominator: $${c}^2 - ${b} = ${norm}$. Numerator: $(${tex(num)})(${tex(conj)}) = ${full.toLatex()}$. So the value is $\\frac{${full.toLatex()}}{${norm}} = ${answer.toLatex()}$.`,
        trap: norm < 0
          ? 'Here c² − b is negative, so after expanding the numerator the whole answer changes sign; do not silently drop the minus.'
          : 'Multiply by the conjugate c ∓ √b, expand the numerator fully (four terms) and divide every term by c² − b.',
        tags: ['surds', 'rationalise', 'conjugate'],
        params: { level, variant: 'conjugate', num, den },
        typedAllowed: true,
      };
    });
  },
  verify(q) {
    if (q.answer.kind !== 'exact') return false;
    const { num, den } = q.params as { num: Terms; den: Terms };
    // Floating-point value of the original quotient, computed straight from the raw terms.
    const expected = toFloat(num) / toFloat(den);
    const got = q.answer.value.toNumber();
    if (!Number.isFinite(expected) || Math.abs(got - expected) > 1e-9 * Math.max(1, Math.abs(expected))) return false;
    // Rationalised: an Exact can never hold a surd in a denominator, so the structural check is the term count.
    return q.answer.value.terms.length <= 2 && !q.answer.value.hasPi();
  },
});
