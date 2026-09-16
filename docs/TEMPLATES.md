# Writing a question template

Every question in the app comes from a **template**: a small TypeScript module that
turns random parameters into a question, its exact answer, five (or more) options,
a worked solution and a one-line "trap". This guide is the contract. The test suite
(`npm test`) enforces most of it by generating 500 instances of every template.

## 1. File and identity

* One file per template: `src/generators/<topic>/<slug>.ts`, `export default defineTemplate({...})`.
* `id` is `"<module>.<topic>.<slug>"` in lower case, e.g. `m1.surds.rationalise`,
  `m2.integration.definite-polynomial`, `phy.kinematics.suvat-distance`.
  The prefix must be `m1`, `m2` or `phy` and must match `module` (`'M1' | 'M2' | 'PHY'`).
* `topic` must be one of the keys in `src/core/topics.ts` and belong to the same module.
* `title`: short human name for analytics ("Rationalise a denominator").
* `levels`: an object describing what the parameters look like at each level 1–5. Every
  template must support all five levels (the description is documentation; the test
  generates 100 questions per level). Level 1 is "GCSE warm-up, instant", level 5 is
  "hardest thing the ESAT would ask, still doable in 90 seconds with no calculator".

```ts
import { defineTemplate, retry, type Level } from '../../core/template';
import { E, frac, surd, piFrac, Exact } from '../../core/exact';
import { buildOptions } from '../../core/options';

export default defineTemplate({
  id: 'm1.surds.example',
  module: 'M1',
  topic: 'surds',
  title: 'Example',
  levels: { 1: '…', 2: '…', 3: '…', 4: '…', 5: '…' },
  generate(rng, level: Level) {
    return retry(rng, () => {
      // 1. draw parameters from level-dependent ranges
      // 2. compute the exact answer with Exact
      // 3. `return null` to reject ugly parameters (retry draws again)
      // 4. build options from realistic distractors
      return { stem, answer, options, solution, trap, tags, params, typedAllowed: true };
    });
  },
  verify(q) { /* recompute from q.params a *different* way; return boolean */ },
});
```

## 2. Randomness

Only ever use the `rng` passed to `generate` (`src/core/rng.ts`): `rng.int(lo, hi)` (inclusive),
`rng.nonZeroInt`, `rng.intExcluding`, `rng.pick(arr)`, `rng.pickDistinct(arr, n)`, `rng.shuffle`,
`rng.bool(p)`, `rng.sign()`, `rng.weighted(items, weights)`. Never `Math.random`. Sessions must replay
from their seed.

## 3. Exact answers

Use `src/core/exact.ts`. `Exact` values are sums of `rational × √r × π^k` and support
`add sub mul div neg pow(int) powRat(rat) sqrt inv abs equals cmp toNumber toLatex toPlain`.
Constructors: `E(3)`, `E(0.25)`, `frac(3, 4)`, `surd(12)` (auto-simplifies to 2√3), `surd(3, 2)` = 2√3,
`surdFrac(1, 2, 3)` = √3/2, `piFrac(1, 6)` = π/6, `Exact.pi(2)` = 2π, `Exact.int(n)`.
Division rationalises automatically: `E(1).div(E(1).add(surd(2)))` is `−1 + √2`.

Answer kinds (`src/core/template.ts`):

| kind | when | typed input |
|---|---|---|
| `{ kind: 'exact', value, format?, unit? }` | one number (integer, fraction, surd, multiple of π, standard form) | parsed and compared structurally |
| `{ kind: 'set', values, variable? }` | unordered set, e.g. the two roots of a quadratic | "2, 3" / "x = 2 or x = 3" / "±3" |
| `{ kind: 'choice', value }` | the answer is text/LaTeX: a statement combination, an expression, a unit, an equation, an interval | falls back to the option list; set `typedAllowed: false` |

`format` controls display: `'auto'` (default), `'fraction'`, `'decimal'`, `'sf'` (standard form), `'mixed'`.
Use `'sf'` for standard-form questions, `'decimal'` for physics quantities that read naturally as decimals.
`unit` is LaTeX appended to the answer and options, e.g. `'\\text{m s}^{-1}'`; still say the unit in the stem.

### The clean-number rule (`src/core/clean.ts`)

The test rejects any answer that is not something the real exam would print: at most two terms;
denominators small (≤ 100 factorable) or terminating decimals; numerators with ≤ 4 significant
digits; square-free radicands ≤ 97; π powers between −2 and 3. **Templates must reject and
regenerate ugly parameters** (`return null` inside `retry`) rather than hoping. Options should be
clean too: never pad with weird fractions.

## 4. Stems (ESAT register)

* One clear ask. Use the exam's phrasing: "Find the value of…", "Which of the following is equal
  to…", "A particle moves…", "Simplify…", "Solve…", "Given that…, find…".
* MathText: plain text with inline LaTeX in `$…$`. `\n\n` starts a new paragraph. No images: describe
  any diagram in words or avoid it. No Markdown headings.
* Physics: give every quantity with a unit in the stem, state `g = 10 m s^{-2}` when used, and choose
  numbers so the arithmetic is mental (products of small integers, powers of ten).
* Exact-answer questions should say the required form when it matters ("in the form $a\sqrt{b}$",
  "as a fraction in its lowest terms", "leaving π in your answer", "in standard form").
* Occasional "Which of the following statements are true?" with I, II, III: use `statementOptions(truth)`
  from `src/core/options.ts` (fixed exam order, 8 options) and `kind: 'choice'`.

## 5. Options and distractors

* 5 options (5–8 allowed), exactly one correct, all distinct — `buildOptions(rng, answer, distractors, cfg)`,
  `buildSetOptions(rng, values, distractorSets, cfg)` and `buildChoiceOptions(rng, correct, wrong)` do the
  de-duplication, shuffling and lettering.
* Each distractor should be **the answer a student gets from a specific mistake**, and you should pass
  it as `{ value, trap: '…' }` so the review screen can name the mistake. Aim for 5–7 candidates so the
  builder has choice. Typical traps: sign error, ± root dropped, radius vs diameter, forgetting the
  constant, wrong index law (adding instead of multiplying powers), off-by-one (n vs n−1), unit slip
  (cm vs m, kW vs W), swapped numerator/denominator, forgetting to square, using diameter in πr²,
  mixing sin/cos, forgetting a factor of ½, dividing instead of multiplying, taking the wrong root.
* Do not include a distractor equal to the answer or unclean numbers; `buildOptions` drops duplicates and
  pads with generic perturbations only if you ran short (that is a smell — give better distractors).

## 6. Solutions and traps

* `solution`: the **fastest mental route**, 1–3 sentences with LaTeX, e.g. "Spot the difference of two
  squares: $99 \times 101 = 100^2 - 1 = 9999$." Not the long way.
* `trap`: one line naming the mistake the distractors were built from.
* `tags`: a few lowercase keywords.

## 7. verify() must be independent

`verify(q)` receives the generated `Question` and must recompute the answer **a second way** from
`q.params` (which must be JSON-serialisable: numbers, strings, booleans, arrays). Good second ways:

* substitute the answer back into the equation it solves (roots, simultaneous equations);
* evaluate the original expression in floating point from the raw parameters and compare with
  `answer.value.toNumber()` to 1e-9 (plus a structural check like "the radicand is square-free");
* derive the quantity from a different formula (energy via v² = u² + 2as instead of ½mv²; area from the
  shoelace formula instead of ½bh; the sum of a series by literally adding the terms);
* for `choice` answers, recompute the classification/truth values from `params` and compare with the text.

It must **not** simply re-run the code path used in `generate`.

## 8. Checklist before you finish

1. `npm test` passes (500 instances per template, all five levels).
2. `npm run typecheck` passes.
3. `npm run sample -- <template-id>` prints a few instances: read them as a candidate would — are the
   numbers mental-arithmetic friendly at every level, do the options look like real exam options,
   is the solution the quick route?
4. Level 1 should feel like a 20-second question; level 5 like a full 90 seconds.
