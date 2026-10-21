// Markdown-it integration for the native MathML renderer.
import { isRenderableTex, texToMathML } from './mathml.js';

function inlineMathRule(state, silent) {
  const start = state.pos;
  if (state.src.charCodeAt(start) !== 0x24) return false;
  if (state.src.charCodeAt(start + 1) === 0x24) return false;
  const max = state.posMax;
  let pos = start + 1;
  if (pos >= max || state.src.charCodeAt(pos) === 0x20) return false;
  let end = -1;
  while (pos < max) {
    const c = state.src.charCodeAt(pos);
    if (c === 0x5c) { pos += 2; continue; }
    if (c === 0x24) {
      if (state.src.charCodeAt(pos - 1) !== 0x20) end = pos;
      break;
    }
    pos += 1;
  }
  if (end < 0) return false;
  const tex = state.src.slice(start + 1, end);
  if (!tex) return false;
  if (!silent) {
    const token = state.push('ll_math_inline', '', 0);
    token.meta = { tex };
  }
  state.pos = end + 1;
  return true;
}

function displayMathRule(state, startLine, endLine, silent) {
  const startPos = state.bMarks[startLine] + state.tShift[startLine];
  const first = state.src.slice(startPos, state.eMarks[startLine]);
  if (!first.startsWith('$$')) return false;
  if (silent) return true;
  const single = /^\$\$([\s\S]*?)\$\$\s*$/.exec(first);
  if (single && single[1].trim()) {
    const token = state.push('ll_math_display', '', 0);
    token.map = [startLine, startLine + 1];
    token.meta = { tex: single[1].trim(), single: true };
    state.line = startLine + 1;
    return true;
  }
  if (first.trim() !== '$$') return false;
  let nextLine = startLine + 1;
  const lines = [];
  for (; nextLine < endLine; nextLine++) {
    const p = state.bMarks[nextLine] + state.tShift[nextLine];
    const line = state.src.slice(p, state.eMarks[nextLine]);
    if (line.trim() === '$$') break;
    lines.push(line);
  }
  if (nextLine >= endLine) return false;
  const token = state.push('ll_math_display', '', 0);
  token.map = [startLine, nextLine];
  token.meta = { tex: lines.join('\n'), single: false };
  state.line = nextLine + 1;
  return true;
}

/** Install `$…$` inline and `$$…$$` display math rules on markdown-it. */
export function mathMLPlugin(md) {
  md.inline.ruler.before('escape', 'll_math_inline', inlineMathRule);
  md.block.ruler.before('fence', 'll_math_display', displayMathRule, {
    alt: ['paragraph', 'blockquote', 'list'],
  });
  md.renderer.rules.ll_math_inline = (tokens, index) =>
    texToMathML(tokens[index].meta.tex, { onError: 'node' });
  md.renderer.rules.ll_math_display = (tokens, index) =>
    texToMathML(tokens[index].meta.tex, { display: true, onError: 'node' });
}

// The function is re-exported here for Markdown consumers that want to validate
// before rendering or show a custom unsupported-LaTeX message.
export { isRenderableTex, texToMathML };
