/**
 * Pure module: parse a typed answer into an exact value and compare it with the
 * expected answer structurally, with a numeric fallback (tolerance only there).
 *
 * Accepted input examples:
 *   3/4   0.75   -1/2   2√5   2sqrt5   2*sqrt(5)   sqrt(12)   π/6   pi/6   2pi
 *   3e8   3×10^8   3x10^8   1 1/2   25%   ±3   x = 2 or x = 3   2, 3   7+4√3
 *   1/(1+√2)  (rationalised automatically)   8^(2/3)   30°   5 m/s
 */
import { Exact, NotExact, rat, ratFromDecimal, type Rat } from './exact';
import type { Answer, Option } from './template';

// ----------------------------------------------------------------------------
// Tokeniser
// ----------------------------------------------------------------------------

type Tok =
  | { t: 'num'; v: string }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'bar' }
  | { t: 'sep' }
  | { t: 'end' };

const UNIT_RE =
  /\s*(m\/s\^?2|m\/s²|m\s?s\^?-?[12]|ms⁻[12]|m\/s|m\^?[23]|m[²³]|cm[²³]|cm\^?[23]|N\s?m|Nm|J\/s|kg\/m\^?3|kg\s?m\^?-3|kgm\^?-3|kg|km\/h|kph|mph|km|cm|mm|mA|kV|kW|MW|GW|kJ|MJ|GJ|kPa|MPa|kHz|MHz|GHz|nm|µm|μm|mol|Hz|Pa|ohms?|Ω|rad|radians?|deg|degrees?|°|units?|seconds?|metres?|meters?|newtons?|joules?|watts?|volts?|amps?|amperes?|N|J|W|A|V|C|K|s|m|g)\s*$/i;

function preprocess(raw: string): string {
  let s = raw.trim();
  // strip "x =" (anywhere, e.g. "x = 2 or x = 3"), "answer:", leading "="
  s = s.replace(/^(answer|ans)\s*[:=]\s*/i, '');
  s = s.replace(/(^|[\s,;(])[a-zA-Zθ]\s*=\s*/g, '$1');
  s = s.replace(/^=\s*/, '');
  // unicode niceties
  s = s.replace(/−|–|—/g, '-').replace(/[·⋅]/g, '*').replace(/÷/g, '/').replace(/[×✕]/g, '*');
  s = s.replace(/√/g, ' sqrt ');
  s = s.replace(/π/g, ' pi ');
  s = s.replace(/²/g, '^2').replace(/³/g, '^3').replace(/⁻¹/g, '^-1').replace(/⁻²/g, '^-2');
  s = s.replace(/½/g, '(1/2)').replace(/¼/g, '(1/4)').replace(/¾/g, '(3/4)').replace(/⅓/g, '(1/3)').replace(/⅔/g, '(2/3)');
  // "3x10^8" / "3 x 10^8" as multiplication
  s = s.replace(/(\d)\s*[xX]\s*(?=10\s*\^)/g, '$1*');
  // trailing units (only if there is something numeric before them)
  const stripped = s.replace(UNIT_RE, '');
  if (stripped.length > 0 && /[\d)a-zA-Z]$/.test(stripped) && /[\d)]/.test(stripped)) s = stripped;
  // mixed numbers "2 1/2" -> "(2+1/2)"
  s = s.replace(/(^|[^\d./^*])(\d+)\s+(\d+)\s*\/\s*(\d+)(?![\d.])/g, '$1($2+$3/$4)');
  // "**" power
  s = s.replace(/\*\*/g, '^');
  return s;
}

function tokenize(s: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(s.slice(i));
      if (!m || m[0] === '.') throw new Error('bad number');
      toks.push({ t: 'num', v: m[0] });
      i += m[0].length;
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      const m = /^[a-zA-Z]+/.exec(s.slice(i))!;
      let word = m[0];
      // split things like "sqrt5"? letters only here; "pi" / "sqrt" / "or" / "and"
      const lower = word.toLowerCase();
      if (lower === 'or' || lower === 'and') { toks.push({ t: 'sep' }); i += word.length; continue; }
      // allow "sqrt" glued to other words e.g. "sqrtpi"
      if (lower.startsWith('sqrt') && lower.length > 4) {
        toks.push({ t: 'id', v: 'sqrt' });
        i += 4;
        continue;
      }
      if (lower.startsWith('pi') && lower.length > 2) {
        toks.push({ t: 'id', v: 'pi' });
        i += 2;
        continue;
      }
      toks.push({ t: 'id', v: lower });
      i += word.length;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') { toks.push({ t: 'lp' }); i++; continue; }
    if (ch === ')' || ch === ']' || ch === '}') { toks.push({ t: 'rp' }); i++; continue; }
    if (ch === '|') { toks.push({ t: 'bar' }); i++; continue; }
    if (ch === ',' || ch === ';') { toks.push({ t: 'sep' }); i++; continue; }
    if ('+-*/^%!±'.includes(ch)) { toks.push({ t: 'op', v: ch }); i++; continue; }
    throw new Error(`unexpected character "${ch}"`);
  }
  toks.push({ t: 'end' });
  return toks;
}

// ----------------------------------------------------------------------------
// Values: exact where possible, always with a float approximation
// ----------------------------------------------------------------------------

export interface Val {
  exact: Exact | null;
  approx: number;
}

function vExact(e: Exact): Val { return { exact: e, approx: e.toNumber() }; }
function vApprox(x: number): Val { return { exact: null, approx: x }; }

function tryExact(f: () => Exact, approx: () => number): Val {
  try {
    const e = f();
    return vExact(e);
  } catch (err) {
    if (err instanceof NotExact) return vApprox(approx());
    throw err;
  }
}

function vAdd(a: Val, b: Val): Val {
  if (a.exact && b.exact) return vExact(a.exact.add(b.exact));
  return vApprox(a.approx + b.approx);
}
function vSub(a: Val, b: Val): Val {
  if (a.exact && b.exact) return vExact(a.exact.sub(b.exact));
  return vApprox(a.approx - b.approx);
}
function vMul(a: Val, b: Val): Val {
  if (a.exact && b.exact) return vExact(a.exact.mul(b.exact));
  return vApprox(a.approx * b.approx);
}
function vDiv(a: Val, b: Val): Val {
  if (b.approx === 0 && (!b.exact || b.exact.isZero())) throw new Error('division by zero');
  if (a.exact && b.exact) return tryExact(() => a.exact!.div(b.exact!), () => a.approx / b.approx);
  return vApprox(a.approx / b.approx);
}
function vNeg(a: Val): Val {
  return a.exact ? vExact(a.exact.neg()) : vApprox(-a.approx);
}
function vPow(a: Val, b: Val): Val {
  if (a.exact && b.exact && b.exact.isRational()) {
    const e: Rat = b.exact.toRat();
    return tryExact(() => a.exact!.powRat(e), () => Math.pow(a.approx, b.approx));
  }
  return vApprox(Math.pow(a.approx, b.approx));
}
function vSqrt(a: Val): Val {
  if (a.approx < 0) throw new Error('square root of a negative number');
  if (a.exact) return tryExact(() => a.exact!.sqrt(), () => Math.sqrt(a.approx));
  return vApprox(Math.sqrt(a.approx));
}
function vCbrt(a: Val): Val {
  if (a.exact) return tryExact(() => a.exact!.powRat(rat(1, 3)), () => Math.cbrt(a.approx));
  return vApprox(Math.cbrt(a.approx));
}
function vAbs(a: Val): Val {
  return a.exact ? vExact(a.exact.abs()) : vApprox(Math.abs(a.approx));
}
function vFact(a: Val): Val {
  if (!a.exact || !a.exact.isInteger()) throw new Error('factorial of a non-integer');
  const n = a.exact.toInt();
  if (n < 0 || n > 20) throw new Error('factorial out of range');
  let r = 1n;
  for (let i = 2n; i <= BigInt(n); i++) r *= i;
  return vExact(Exact.int(r));
}

// ----------------------------------------------------------------------------
// Parser (recursive descent)
// ----------------------------------------------------------------------------

class Parser {
  private i = 0;
  constructor(private toks: Tok[]) {}

  private peek(): Tok { return this.toks[this.i]; }
  private next(): Tok { return this.toks[this.i++]; }
  private isOp(v: string): boolean { const t = this.peek(); return t.t === 'op' && t.v === v; }

  /** Parses a whole input: one or more values separated by , ; or / and / or, with ± expanding to two. */
  parseAll(): Val[] {
    const out: Val[] = [];
    if (this.peek().t === 'end') throw new Error('empty answer');
    for (;;) {
      out.push(...this.parsePM());
      const t = this.peek();
      if (t.t === 'sep') { this.next(); continue; }
      if (t.t === 'end') break;
      throw new Error('unexpected input after value');
    }
    return out;
  }

  /** expr with optional leading ± (returns 1 or 2 values). */
  private parsePM(): Val[] {
    if (this.isOp('±')) {
      this.next();
      const v = this.parseExpr();
      return [v, vNeg(v)];
    }
    const v = this.parseExpr();
    if (this.isOp('±')) {
      this.next();
      const w = this.parseExpr();
      return [vAdd(v, w), vSub(v, w)];
    }
    return [v];
  }

  private parseExpr(): Val {
    let v = this.parseTerm();
    for (;;) {
      if (this.isOp('+')) { this.next(); v = vAdd(v, this.parseTerm()); }
      else if (this.isOp('-')) { this.next(); v = vSub(v, this.parseTerm()); }
      else return v;
    }
  }

  /** explicit * and / (implicit products bind tighter: 1/2π = 1/(2π)). */
  private parseTerm(): Val {
    let v = this.parseImplicit();
    for (;;) {
      if (this.isOp('*')) { this.next(); v = vMul(v, this.parseImplicit()); }
      else if (this.isOp('/')) { this.next(); v = vDiv(v, this.parseImplicit()); }
      else return v;
    }
  }

  private startsAtom(): boolean {
    const t = this.peek();
    return t.t === 'num' || t.t === 'id' || t.t === 'lp' || t.t === 'bar';
  }

  private parseImplicit(): Val {
    let v = this.parseUnary();
    while (this.startsAtom()) {
      // a bar right after a value closes an abs, so don't treat it as an implicit product start
      if (this.peek().t === 'bar' && this.barDepth > 0) break;
      v = vMul(v, this.parseUnary());
    }
    return v;
  }

  private parseUnary(): Val {
    if (this.isOp('-')) { this.next(); return vNeg(this.parseUnary()); }
    if (this.isOp('+')) { this.next(); return this.parseUnary(); }
    return this.parsePower();
  }

  private parsePower(): Val {
    const base = this.parsePostfix();
    if (this.isOp('^')) {
      this.next();
      const exp = this.parseUnary(); // right-assoc, allows 2^-1 and 2^(1/2)
      return vPow(base, exp);
    }
    return base;
  }

  private parsePostfix(): Val {
    let v = this.parseAtom();
    for (;;) {
      if (this.isOp('%')) { this.next(); v = vDiv(v, vExact(Exact.int(100))); }
      else if (this.isOp('!')) { this.next(); v = vFact(v); }
      else return v;
    }
  }

  private barDepth = 0;

  private parseAtom(): Val {
    const t = this.next();
    switch (t.t) {
      case 'num':
        return vExact(Exact.fromRat(ratFromDecimal(t.v)));
      case 'lp': {
        const v = this.parseExpr();
        if (this.peek().t === 'sep') {
          // tuple like (2, 3) is not a value
          throw new Error('unexpected separator inside brackets');
        }
        if (this.next().t !== 'rp') throw new Error('missing closing bracket');
        return v;
      }
      case 'bar': {
        this.barDepth++;
        const v = this.parseExpr();
        this.barDepth--;
        if (this.next().t !== 'bar') throw new Error('missing closing |');
        return vAbs(v);
      }
      case 'id':
        return this.parseIdent(t.v);
      case 'op':
        if (t.v === '-') return vNeg(this.parseUnary());
        throw new Error(`unexpected operator "${t.v}"`);
      default:
        throw new Error('unexpected end of input');
    }
  }

  private parseIdent(name: string): Val {
    switch (name) {
      case 'pi':
        return vExact(Exact.pi(1));
      case 'sqrt':
      case 'root':
      case 'surd':
        return vSqrt(this.parseFunctionArg());
      case 'cbrt':
        return vCbrt(this.parseFunctionArg());
      case 'abs':
        return vAbs(this.parseFunctionArg());
      case 'inf':
      case 'infinity':
        return vApprox(Infinity);
      default:
        throw new Error(`unknown symbol "${name}"`);
    }
  }

  /** sqrt(expr) | sqrt expr-atom (e.g. sqrt5, sqrt 12, √2, sqrt(3)/2). The bare form takes one power-level atom. */
  private parseFunctionArg(): Val {
    if (this.peek().t === 'lp') {
      this.next();
      const v = this.parseExpr();
      if (this.next().t !== 'rp') throw new Error('missing closing bracket');
      return v;
    }
    return this.parsePower();
  }
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

export interface ParseResult {
  values: Val[];
  /** plain-text echo of what was understood, e.g. "2√5" */
  echo: string;
  /** true if the input contained a decimal point or exponent (a rounded value, so numeric matching is allowed) */
  decimalInput: boolean;
}

export function parseAnswer(raw: string): ParseResult {
  const s = preprocess(raw);
  if (s.length === 0) throw new Error('empty answer');
  const toks = tokenize(s);
  const values = new Parser(toks).parseAll();
  for (const v of values) if (!Number.isFinite(v.approx)) throw new Error('value is not finite');
  const decimalInput = toks.some((t) => t.t === 'num' && /[.eE]/.test(t.v));
  return { values, echo: values.map(describeVal).join(', '), decimalInput };
}

export function describeVal(v: Val): string {
  if (v.exact) return v.exact.toPlain();
  return Number(v.approx.toPrecision(6)).toString();
}

export interface CheckResult {
  correct: boolean;
  /** how the match was decided */
  method: 'exact' | 'numeric' | 'choice' | 'none';
  echo?: string;
  error?: string;
}

/** Relative tolerance for the numeric fallback (3 significant figures). */
export const NUMERIC_REL_TOL = 1e-3;

function numericallyEqual(a: number, b: number, relTol = NUMERIC_REL_TOL): boolean {
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  if (scale === 0) return true;
  // Always relative: 1.7e-19 is not 1.6e-19 just because both are tiny.
  return Math.abs(a - b) <= relTol * scale;
}

/** Significant figures of a plain decimal literal such as "16.7", "0.0167", "1.60e-19"; null if not a single literal. */
export function sigFigsOfLiteral(raw: string): number | null {
  const m = /^[+-]?(\d*)(?:\.(\d*))?(?:[eE][+-]?\d+)?%?$/.exec(raw.trim());
  if (!m || (m[1] === '' && !m[2])) return null;
  const digits = (m[1] ?? '') + (m[2] ?? '');
  const stripped = digits.replace(/^0+/, '');
  return stripped.length === 0 ? 1 : stripped.length;
}

/** Correctly rounded to `sf` significant figures, as a number. */
function roundSig(x: number, sf: number): number {
  if (x === 0) return 0;
  return Number(x.toPrecision(sf));
}

/**
 * Structural match first. The numeric fallback only applies when the input is
 * genuinely approximate: it contained a decimal/exponent, or it could not be
 * represented exactly (e.g. 2^(1/3)). An exact integer or fraction that differs
 * from the answer is simply wrong, however close (1001 is not 1000).
 */
function matchValue(input: Val, expected: Exact, allowNumeric: boolean, literalSigFigs: number | null = null): 'exact' | 'numeric' | null {
  if (input.exact && input.exact.equals(expected)) return 'exact';
  if (allowNumeric || input.exact === null) {
    const target = expected.toNumber();
    if (numericallyEqual(input.approx, target)) return 'numeric';
    // A decimal correctly rounded to at least 3 significant figures is accepted (16.7 for 100/6).
    if (literalSigFigs !== null && literalSigFigs >= 3 && roundSig(target, literalSigFigs) === input.approx) return 'numeric';
  }
  return null;
}

/** Normalise option/display text for loose matching. */
export function normalizeText(s: string): string {
  return s.replace(/\$/g, '').replace(/\\[a-zA-Z]+/g, (m) => m.slice(1)).replace(/[\s{}]/g, '').toLowerCase();
}

/**
 * Compare a typed answer with the expected answer.
 * For 'choice' answers, the input may be the option letter or the option text.
 */
export function checkAnswer(raw: string, answer: Answer, options: Option[] = []): CheckResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { correct: false, method: 'none', error: 'empty answer' };

  // Option letter always works, whatever the answer kind.
  if (/^[a-hA-H]$/.test(trimmed) && options.length > 0) {
    const opt = options.find((o) => o.key === trimmed.toUpperCase());
    if (opt) return { correct: opt.correct, method: 'choice', echo: `option ${opt.key}` };
  }

  if (answer.kind === 'choice') {
    const target = normalizeText(answer.value);
    const given = normalizeText(trimmed);
    const match = options.find((o) => normalizeText(o.display) === given);
    if (match) return { correct: match.correct, method: 'choice', echo: match.display };
    return { correct: given === target, method: 'choice', echo: trimmed };
  }

  // "25%" on a question that asks for a percentage means 25; on a probability question it means 0.25.
  // Try the plain number first, then fall through to the usual parse (which divides by 100).
  if (/%\s*$/.test(trimmed)) {
    const plain = checkAnswer(trimmed.replace(/%\s*$/, ''), answer, options);
    if (plain.correct) return plain;
  }

  let parsed: ParseResult;
  try {
    parsed = parseAnswer(trimmed);
  } catch (e) {
    return { correct: false, method: 'none', error: (e as Error).message };
  }
  const literalSf = sigFigsOfLiteral(trimmed.replace(/%\s*$/, ''));

  if (answer.kind === 'exact') {
    if (parsed.values.length !== 1) return { correct: false, method: 'none', echo: parsed.echo, error: 'expected a single value' };
    const m = matchValue(parsed.values[0], answer.value, parsed.decimalInput, literalSf);
    return { correct: m !== null, method: m ?? 'none', echo: parsed.echo };
  }

  // set: unordered, every expected value matched by a distinct input value
  const inputs = parsed.values.slice();
  if (inputs.length !== answer.values.length) {
    return { correct: false, method: 'none', echo: parsed.echo, error: `expected ${answer.values.length} value(s)` };
  }
  let method: 'exact' | 'numeric' = 'exact';
  for (const exp of answer.values) {
    let idx = inputs.findIndex((v) => matchValue(v, exp, parsed.decimalInput) === 'exact');
    if (idx < 0) {
      idx = inputs.findIndex((v) => matchValue(v, exp, parsed.decimalInput) === 'numeric');
      if (idx < 0) return { correct: false, method: 'none', echo: parsed.echo };
      method = 'numeric';
    }
    inputs.splice(idx, 1);
  }
  return { correct: true, method, echo: parsed.echo };
}

/** Plain-text form of an answer for display / Markdown export. */
export function answerToPlain(answer: Answer): string {
  switch (answer.kind) {
    case 'exact':
      return answer.value.toPlain({ format: answer.format }) + (answer.unit ? ` ${stripLatexUnit(answer.unit)}` : '');
    case 'set':
      return answer.values.map((v) => v.toPlain({ format: answer.format })).join(', ');
    case 'choice':
      return answer.value.replace(/\$/g, '');
  }
}

/** Display (MathText) form of an answer. */
export function answerToDisplay(answer: Answer): string {
  switch (answer.kind) {
    case 'exact':
      return `$${answer.value.toLatex({ format: answer.format })}${answer.unit ? `\\ ${answer.unit}` : ''}$`;
    case 'set': {
      const v = answer.variable ?? 'x';
      return answer.values.map((x) => `$${v} = ${x.toLatex({ format: answer.format })}$`).join(' or ');
    }
    case 'choice':
      return answer.value;
  }
}

function stripLatexUnit(u: string): string {
  return u.replace(/\\text\{([^}]*)\}/g, '$1').replace(/\^\{(-?\d+)\}/g, '^$1').replace(/[\\{}]/g, '').replace(/\s+/g, ' ').trim();
}
