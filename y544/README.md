# Y544 Discrete Maths Reviser

A single-page, no-build revision app for **OCR A Level Further Maths A (H245), Y544 Discrete Mathematics**. Plain HTML/CSS/JS — no frameworks, no build step, no network access needed.

## Running it

The app fetches `questions.json` from the same folder, so it needs to be served over HTTP:

```sh
python3 -m http.server          # in this folder
# then open http://localhost:8000
```

If you instead open `index.html` directly (`file://`), the browser blocks the fetch — the app then shows a file picker so you can load `questions.json` (or any compatible JSON file) manually.

## The four modes

| Mode | What it drills | Scoring |
|---|---|---|
| **Quick-fire** | Facts/definitions, multiple choice, 10-second timer per question | Streak (wrong answer or timeout resets it) |
| **Order the steps** | Drag procedure steps for simplex, Dijkstra and route inspection into the right sequence | Count of procedures solved first try |
| **Pivot picker** | Randomly generated 3-variable simplex tableaux — click the correct pivot cell; every answer gets a feedback table working through the ratio test | Streak |
| **Spot the error** | Short worked answers each containing exactly one planted mistake — click the bad line | Streak |

High scores persist in `localStorage` (key `y544HighScores`); reset them from the Home tab.

## Question schema (`questions.json`)

Top level:

```jsonc
{
  "meta":        { "title": "shown in the header", "version": 1 },
  "quickfire":   [ ... ],        // required, non-empty array
  "ordering":    [ ... ],        // required, non-empty array
  "pivot":       { ... },        // required object (presets may be empty)
  "spotTheError":[ ... ]         // required, non-empty array
}
```

### `quickfire[]`

```jsonc
{
  "id": "qf1",                   // unique string
  "prompt": "How many edges does K6 have?",
  "options": ["12", "15", "30", "36"],   // 2–6 strings
  "answer": 1,                   // 0-based index into options
  "explanation": "Kn has n(n−1)/2 edges…"  // shown after answering (right or wrong)
}
```

### `ordering[]`

```jsonc
{
  "id": "ord1",
  "algorithm": "simplex",        // tag shown as a pill: simplex | dijkstra | route-inspection | …
  "title": "Simplex: one complete iteration",
  "steps": [                     // 3–8 strings, IN THE CORRECT ORDER
    "Choose the pivot column…",
    "…"
  ]
}
```

The app shuffles `steps` for display (and reshuffles if the shuffle happens to be correct already).

### `pivot`

```jsonc
{
  "useGenerator": true,          // false = cycle the presets forever instead of generating
  "presets": [
    {
      "id": "pv1",
      "objective": [5, 4, 3],    // maximise 5x + 4y + 3z (shown as −5, −4, −3 in the P row)
      "constraints": [           // exactly 3 rows; all treated as ≤ with slack s1–s3 added
        { "coeffs": [2, 3, 1], "rhs": 5 },
        { "coeffs": [4, 1, 2], "rhs": 11 },
        { "coeffs": [3, 4, 2], "rhs": 8 }
      ]
    }
  ]
}
```

Presets are served first (shuffled), then randomly generated tableaux take over. The correct pivot is computed by the app: column = most negative objective entry, row = smallest non-negative ratio over positive pivot-column entries. **When writing presets, make sure both are unique** (one strictly-largest objective coefficient; one strictly-smallest ratio) so the question has a single right answer — the built-in generator guarantees this for random tableaux.

### `spotTheError[]`

```jsonc
{
  "id": "se1",
  "topic": "Route inspection",   // pill label
  "prompt": "Context for the worked answer…",
  "lines": [                     // 3–6 lines of working, exactly ONE containing the mistake
    "The odd vertices are B, D, E and G.",
    "…"
  ],
  "errorLine": 2,                // 0-based index of the faulty line
  "explanation": "What the mistake is and the corrected working."
}
```

Plant the mistake where it *originates* — follow-through lines after it are fine and make the question more realistic.

## Adding content

Edit `questions.json` and reload. Every array can be any length ≥ 1; the app picks items at random without immediate repeats. Five sample items per mode are included covering the Y544 "banker" topics (networks/TSP, simplex/LP, CPA, graph theory, counting, algorithms).
