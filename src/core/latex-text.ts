/**
 * Turn MathText/LaTeX into readable plain text for terminals and Markdown exports.
 * Brace-aware and recursive, so nested fractions, roots and superscripts survive.
 */
/** Read a balanced {...} group starting at index i (which must point at '{'); returns [inner, nextIndex]. */
function group(s: string, i: number): [string, number] {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') depth++;
    else if (s[j] === '}') {
      depth--;
      if (depth === 0) return [s.slice(i + 1, j), j + 1];
    }
  }
  return [s.slice(i + 1), s.length];
}

/** Turn LaTeX into readable terminal text (recursive, brace-aware). */
export function latexToText(s: string): string {
  let out = '';
  let i = 0;
  const arg = (): string => {
    while (s[i] === ' ') i++;
    if (s[i] === '{') { const [inner, next] = group(s, i); i = next; return latexToText(inner); }
    // single token argument
    if (s[i] === '\\') { const m = /^\\[a-zA-Z]+/.exec(s.slice(i)); if (m) { i += m[0].length; return latexToText(m[0]); } }
    return s[i++] ?? '';
  };
  const wrap = (t: string) => (/^[\w.]+$/.test(t) ? t : `(${t})`);
  while (i < s.length) {
    const ch = s[i];
    if (ch === '$') { i++; continue; }
    if (ch === '{' ) { const [inner, next] = group(s, i); out += latexToText(inner); i = next; continue; }
    if (ch === '}') { i++; continue; }
    if (ch === '^' ) { i++; const e = arg(); out += `^${wrap(e)}`; continue; }
    if (ch === '_' ) { i++; const e = arg(); out += `_${wrap(e)}`; continue; }
    if (ch === '\\') {
      const m = /^\\([a-zA-Z]+|.)/.exec(s.slice(i))!;
      const cmd = m[1];
      i += m[0].length;
      switch (cmd) {
        case 'frac': case 'tfrac': case 'dfrac': { const a = arg(); const b = arg(); out += `${wrap(a)}/${wrap(b)}`; break; }
        case 'sqrt': {
          let idx = '';
          if (s[i] === '[') { const e = s.indexOf(']', i); idx = s.slice(i + 1, e); i = e + 1; }
          const a = arg(); const sup: Record<string, string> = { '3': '∛', '4': '∜' }; out += idx ? (sup[idx] ? `${sup[idx]}(${a})` : `root${idx}(${a})`) : (/^[\w.]+$/.test(a) ? `√${a}` : `√(${a})`); break;
        }
        case 'text': case 'mathrm': case 'textbf': case 'mathbf': case 'operatorname': out += arg(); break;
        case 'times': out += '×'; break;
        case 'cdot': out += '·'; break;
        case 'pi': out += 'π'; break;
        case 'theta': out += 'θ'; break;
        case 'alpha': out += 'α'; break;
        case 'beta': out += 'β'; break;
        case 'lambda': out += 'λ'; break;
        case 'mu': out += 'μ'; break;
        case 'rho': out += 'ρ'; break;
        case 'Omega': out += 'Ω'; break;
        case 'circ': out += '°'; break;
        case 'le': case 'leq': out += '≤'; break;
        case 'ge': case 'geq': out += '≥'; break;
        case 'ne': case 'neq': out += '≠'; break;
        case 'pm': out += '±'; break;
        case 'infty': out += '∞'; break;
        case 'to': case 'rightarrow': out += '→'; break;
        case 'ln': case 'log': case 'sin': case 'cos': case 'tan': case 'exp': out += cmd; break;
        case 'dot': out += arg() + '̇'; break;
        case 'ldots': case 'dots': case 'cdots': out += '…'; break;
        case 'left': case 'right': case 'displaystyle': case '!': case ',': case ';': case ' ': if (cmd === ' ' || cmd === ',' || cmd === ';') out += ' '; break;
        case 'quad': case 'qquad': out += '  '; break;
        case '\\': out += '\n'; break;
        case '%': out += '%'; break;
        case 'begin': case 'end': arg(); break;
        default: out += cmd;
      }
      continue;
    }
    if (ch === '&') { out += '  '; i++; continue; }
    out += ch; i++;
  }
  return out;
}
