import type { ReactNode } from 'react';
import type { Nav } from '../App';
import { PACE_SECONDS, SIM_QUESTIONS, SIM_SECONDS, SPRINT_QUESTIONS, SPRINT_SECONDS } from '../../core/session';
import { GAUNTLET_START, UP_AFTER, DOWN_AFTER } from '../../core/gauntlet';
import { TEMPLATES } from '../../core/registry';

const SHORTCUTS: { keys: ReactNode; action: string }[] = [
  { keys: <><kbd>A</kbd>–<kbd>H</kbd> or <kbd>1</kbd>–<kbd>8</kbd></>, action: 'Choose an option' },
  { keys: <kbd>Enter</kbd>, action: 'Submit a typed answer; on feedback, go to the next question' },
  { keys: <kbd>N</kbd>, action: 'Next question' },
  { keys: <kbd>S</kbd>, action: 'Skip' },
  { keys: <><kbd>←</kbd> / <kbd>→</kbd></>, action: 'Move between questions in a simulation' },
  { keys: <kbd>Esc</kbd>, action: 'Clear the typed answer' },
];

const SYNTAX: { input: string; means: string }[] = [
  { input: '3/4   0.75   -1/2', means: 'Fractions and decimals. Any equivalent form is accepted: 6/8 is 3/4.' },
  { input: '1 1/2', means: 'Mixed number, 3/2.' },
  { input: '25%', means: 'Read as 25 when the question asks for a percentage, and as 1/4 otherwise.' },
  { input: '2√5   2sqrt5   2*sqrt(5)', means: 'Surds. √ and sqrt are interchangeable.' },
  { input: 'sqrt(12)', means: 'Simplified automatically to 2√3.' },
  { input: 'π/6   pi/6   2pi', means: 'Multiples of π.' },
  { input: '3e8   3×10^8   3x10^8', means: 'Standard form.' },
  { input: '±3', means: 'Both 3 and −3 (for a two-root answer).' },
  { input: 'x = 2 or x = 3   2, 3', means: 'A set of values in any order. "x =" is ignored.' },
  { input: '1/(2√3)', means: 'Rationalised automatically. Implicit products bind tighter than division, so 1/2√3 also means 1/(2√3), not (1/2)√3.' },
  { input: '5 m/s   30°   20 kg m s^-1', means: 'A trailing unit is ignored, compound units included; give the number in the unit the question asks for.' },
];

export function Help({ nav }: { nav: Nav }) {
  return (
    <main className="page help">
      <div className="row between">
        <h1>Help</h1>
        <button type="button" className="btn ghost sm" onClick={nav.home}>Home</button>
      </div>

      <div className="card">
        <h2>The ESAT</h2>
        <p>
          The Engineering and Science Admissions Test is sat on a computer in October. Each module has {SIM_QUESTIONS} multiple-choice
          questions in {SIM_SECONDS / 60} minutes, so about {PACE_SECONDS} seconds a question, with no calculator and no formula sheet.
          Everyone takes Mathematics 1; engineering applicants add Mathematics 2 and Physics.
        </p>
        <p>
          This app models that as a bank of {TEMPLATES.length} procedurally generated question templates across the three modules,
          each at five levels from level 1 (GCSE warm-up) to level 5 (the hardest thing the exam would ask, still doable in 90 seconds).
          Every answer is timed against the {PACE_SECONDS} s pace, and every wrong or slow answer feeds an error ledger so it comes back later.
          Everything runs offline in this browser.
        </p>

        <h2>Modes</h2>
        <p><strong>Topic drill.</strong> Choose a module, topics and level. You see the answer, the quickest method and the trap after each question. Optionally timed per question.</p>
        <p><strong>ESAT simulation.</strong> {SIM_QUESTIONS} multiple-choice questions in {SIM_SECONDS / 60} minutes from one module (or all). No feedback until the end; you can move back and forth and change answers, as in the real test.</p>
        <p><strong>Sprint.</strong> {SPRINT_QUESTIONS} questions against a {SPRINT_SECONDS / 60}-minute clock, with immediate feedback. Good for building pace on a topic you already know.</p>
        <p><strong>Gauntlet.</strong> Adaptive difficulty. You start at level {GAUNTLET_START}; {UP_AFTER} correct answers in a row under pace move you up a level, {DOWN_AFTER} wrong in a row move you down. A correct but slow answer neither counts against you nor advances the streak. The highest level you sustain is recorded per topic.</p>
        <p><strong>Facts drill.</strong> Rapid recall of squares, cubes, powers of two, primes, exact trig values and physical constants.</p>
        <p><strong>Review.</strong> Every question you got wrong, skipped or answered over pace goes into the error ledger. Review sessions sample from it, weighting recent failures most, and a template's interval grows each time you get it right and on pace in review.</p>

        <h2>Keyboard shortcuts</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Keys</th><th>Action</th></tr></thead>
            <tbody>
              {SHORTCUTS.map((s) => (
                <tr key={s.action}>
                  <td style={{ whiteSpace: 'nowrap' }}>{s.keys}</td>
                  <td>{s.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>Typing answers</h2>
        <p>Type what you would write on paper. Spaces do not matter and the answer is compared exactly, not to a number of decimal places.</p>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Type</th><th>Meaning</th></tr></thead>
            <tbody>
              {SYNTAX.map((s) => (
                <tr key={s.input}>
                  <td className="mono" style={{ whiteSpace: 'pre-wrap' }}>{s.input}</td>
                  <td>{s.means}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>Adding a question template</h2>
        <p>
          A template is one TypeScript file under <code>src/generators/&lt;topic&gt;/</code> that turns seeded random parameters into a stem, an exact
          answer, options built from specific mistakes, the fastest mental route and an independent <code>verify()</code>.
          The contract, helpers and checklist are in <code>docs/TEMPLATES.md</code>; <code>npm test</code> generates 500 instances of every template to enforce it.
        </p>
      </div>
    </main>
  );
}

export default Help;
