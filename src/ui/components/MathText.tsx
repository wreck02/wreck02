/**
 * Renders MathText: plain text with $inline$ and $$display$$ LaTeX (KaTeX),
 * "\n\n" paragraph breaks and "\n" line breaks. Used for stems, options and solutions.
 */
import { useMemo } from 'react';
import katex from 'katex';

const cache = new Map<string, string>();

export function renderTex(tex: string, display = false): string {
  const key = (display ? 'D' : 'I') + tex;
  const hit = cache.get(key);
  if (hit) return hit;
  let html: string;
  try {
    html = katex.renderToString(tex, { throwOnError: false, displayMode: display, strict: 'ignore', output: 'html' });
  } catch {
    html = `<code>${escapeHtml(tex)}</code>`;
  }
  if (cache.size > 5000) cache.clear();
  cache.set(key, html);
  return html;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Split a MathText string into HTML for one paragraph. */
function paragraphHtml(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('$$', i)) {
      const end = text.indexOf('$$', i + 2);
      if (end < 0) { out += escapeHtml(text.slice(i)); break; }
      out += renderTex(text.slice(i + 2, end), true);
      i = end + 2;
    } else if (text[i] === '$') {
      const end = text.indexOf('$', i + 1);
      if (end < 0) { out += escapeHtml(text.slice(i)); break; }
      out += renderTex(text.slice(i + 1, end), false);
      i = end + 1;
    } else {
      let j = text.indexOf('$', i);
      if (j < 0) j = text.length;
      out += escapeHtml(text.slice(i, j)).replace(/\n/g, '<br/>');
      i = j;
    }
  }
  return out;
}

export function mathTextToHtml(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((p) => `<p>${paragraphHtml(p)}</p>`)
    .join('');
}

export function MathText({ text, className, inline = false }: { text: string; className?: string; inline?: boolean }) {
  const html = useMemo(() => (inline ? paragraphHtml(text) : mathTextToHtml(text)), [text, inline]);
  return inline ? <span className={className} dangerouslySetInnerHTML={{ __html: html }} /> : <div className={`mathtext ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default MathText;
