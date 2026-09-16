# ESAT Mental Maths

An offline, browser-based practice app for the **ESAT** (Engineering and Science Admissions Test, used by
Cambridge, Imperial and Oxford for engineering). Every question is generated procedurally from a
parameterised template, verified at generation time with exact arithmetic, and answered against the exam's
real constraint: **27 multiple-choice questions in 40 minutes, no calculator, about 89 seconds each.**

Nothing leaves your machine. There is no backend; progress lives in your browser's localStorage.

## Run it

```sh
npm install      # once
npm start        # opens the dev server on http://localhost:5173
```

For a fully offline copy: `npm run build` then `npm run preview` (serves `dist/` on port 4173), or copy `dist/`
to any static server. Works on a laptop or a phone.

Other commands:

| command | what it does |
|---|---|
| `npm test` | Vitest: core unit tests plus 500 generated instances of every template (verify, options, clean numbers, no NaN) |
| `npm run typecheck` | TypeScript, no emit |
| `npm run sample` | prints five sample questions with solutions from five different topics |
| `npm run sample -- <template-id> [level] [count]` | prints instances of one template, e.g. `npm run sample -- m1.surds.rationalise 5 6` |
| `SEED=ESAT-K7Q2M9 npm run sample` | reproducible samples |

## Modes

| mode | what it is | keys |
|---|---|---|
| **Topic drill** | pick a module, topics and level 1–5; typed or multiple choice; untimed or a per-question clock; feedback after every question with the fastest mental route and the trap the distractors were built from | A–H / 1–8 choose, Enter submit, N next, S skip |
| **ESAT simulation** | 27 mixed questions, 40 minutes, multiple choice only, one module (or all); move freely between questions, mark "no answer", flag; marked at the end with time per question against the 89-second pace line | ←/→ move, M flag, S no answer |
| **Sprint** | 10 questions in 5 minutes, warm-up style | as drill |
| **Gauntlet** | adaptive levelling: start at level 2, up after 5 correct under pace, down after 2 wrong; the highest sustained level per topic is recorded | as drill |
| **Facts drill** | flashcards for things to know cold: squares to 30², cubes to 15³, 2ⁿ to 2¹⁶, 3ⁿ to 3⁸, primes to 100, √2 √3 √5 decimals, the exact trig table, sevenths/eighths/ninths/elevenths/twelfths, π and log₁₀ values, physics constants and SI prefixes | Enter reveal/submit, 1 missed, 2 got it |
| **Review** | every wrong or over-pace question puts its template in an error ledger; review sessions regenerate *fresh* instances of those templates, weighted by recent failures (spaced repetition) | as drill |

Every session shows its **seed** (for example `ESAT-K7Q2M9`). The same seed with the same settings replays
exactly the same questions, so you can retry a paper or send a seed to a friend.

### Typed answers

The answer box accepts exact forms and compares them structurally, with a numeric fallback only for
decimals you typed:

```
3/4   0.75   -1/2   1 1/2   25%   2√5   2sqrt5   2*sqrt(5)   sqrt(12)   π/6   pi/6
3e8   3×10^8   3x10^8   ±3   x = 2 or x = 3   2, 3   1/(2√3)   8^(2/3)   30°   5 m/s
```

Implicit products bind tighter than division, so `1/2√3` means `1/(2√3)`. Units after a number are ignored.

## Analytics

The home screen shows a **weakness heatmap** (topic × level, accuracy discounted when your median time is
over 89 s); click any cell to drill it. The Analytics screen has accuracy, median time, the time distribution,
the gap to the 89-second pace per topic, per-template breakdowns and trends over sessions. Every session
report lists the slowest five questions and the topics to drill, and exports as **Markdown** for your own
error ledger. Settings lets you export or import all data as JSON.

## How questions are made

* `src/generators/<topic>/<template>.ts` — one file per template. Each exports an `id`, `module`, `topic`,
  a description of the parameter ranges for **levels 1–5**, `generate(rng, level)` and an independent
  `verify(question)`.
* `src/core/exact.ts` — exact arithmetic: rationals, surds and powers of π (`7 + 4√3`, `5π/6`, `3 × 10⁸`).
  Answers are never floats, never hard-coded.
* `src/core/clean.ts` — the "clean number" rule real exam answers obey; templates reject and regenerate
  parameters that break it, and the tests assert it for every answer and every option.
* `src/core/options.ts` — builds the five lettered options from the answer and *named* distractors (sign
  errors, a dropped ± root, radius for diameter, the wrong index law, off-by-one, unit slips…).
* `src/core/answers.ts` — parses typed input into an exact value and compares it with the answer.
* `src/core/rng.ts` — seeded RNG; question *i* of a session is generated from `${seed}#${i}`.
* `src/core/session.ts`, `analytics.ts`, `srs.ts`, `gauntlet.ts`, `facts.ts`, `export.ts` — the engine.
* `src/ui/` — React screens; KaTeX renders the maths.

### Adding a template

1. Copy a template with the same answer kind from `src/generators/` (exact value, set of values, or a text
   choice) into `src/generators/<topic>/<slug>.ts`, give it a unique `id` of the form
   `m1.<topic>.<slug>` / `m2.…` / `phy.…`, and use a topic key from `src/core/topics.ts`.
2. Draw parameters from the level-dependent ranges with the `rng` you are given, compute the answer with
   `Exact`, and `return null` inside `retry()` to reject ugly parameters.
3. Supply distractors as `{ value, trap }` pairs describing the mistake each one comes from, a
   one-to-three-sentence solution giving the fastest mental route, and a one-line trap.
4. Write `verify()` so that it recomputes the answer a different way (substitute back, evaluate numerically,
   brute-force enumerate).
5. Run `npm test` (the harness generates 500 instances of your template at all five levels) and
   `npm run sample -- <your-id>` to read it as a candidate would.

`docs/TEMPLATES.md` is the full authoring contract.

## Layout

The earlier single-file **Y544 Discrete Maths reviser** that lived at the root of this repository was moved
unchanged into [`y544/`](y544/); see its own README there.
