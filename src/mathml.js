// --- LaTeX -> MathML (presentation) -----------------------------------------
//
// Convert a deliberately bounded subset of LaTeX math to native MathML. The
// renderer has no runtime dependencies; browsers render the returned MathML
// directly, without KaTeX, MathJax, or a CDN.
//
// Unknown or unsupported commands fail explicitly instead of producing
// plausible-looking but incorrect output. Callers can either let
// TexUnsupportedError propagate or request an explicit native <merror> node.
// The error node keeps `data-tex` so the original source remains available.
//
// Deliberately unsupported: arbitrary environments/macros, optional row
// spacing, and TeX package definitions. The supported matrix, alignment,
// gather, and cases environments are parsed into bounded MathML tables.
//

const _MML_NS = 'http://www.w3.org/1998/Math/MathML';
const _MAX_TEX_SOURCE = 8192;
const _MAX_TEX_NESTING = 128;

const _TEX_GREEK = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  varepsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  vartheta: 'ϑ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  varpi: 'ϖ',
  rho: 'ρ',
  varrho: 'ϱ',
  sigma: 'σ',
  varsigma: 'ς',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'φ',
  varphi: 'ϕ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Upsilon: 'Υ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',
};

const _TEX_OP = {
  times: '×',
  cdot: '⋅',
  div: '÷',
  pm: '±',
  mp: '∓',
  ast: '∗',
  star: '⋆',
  leq: '≤',
  le: '≤',
  geq: '≥',
  ge: '≥',
  neq: '≠',
  ne: '≠',
  equiv: '≡',
  approx: '≈',
  cong: '≅',
  ncong: '≇',
  sim: '∼',
  simeq: '≃',
  propto: '∝',
  ll: '≪',
  gg: '≫',
  infty: '∞',
  mid: '|',
  given: '|',
  partial: '∂',
  nabla: '∇',
  sum: '∑',
  prod: '∏',
  int: '∫',
  iint: '∬',
  iiint: '∭',
  iiiint: '⨌',
  oint: '∮',
  oiint: '∯',
  oiiint: '∰',
  rightarrow: '→',
  to: '→',
  leftarrow: '←',
  gets: '←',
  Rightarrow: '⇒',
  Leftarrow: '⇐',
  leftrightarrow: '↔',
  mapsto: '↦',
  cdots: '⋯',
  ldots: '…',
  dots: '…',
  vdots: '⋮',
  in: '∈',
  notin: '∉',
  ni: '∋',
  subset: '⊂',
  subseteq: '⊆',
  supset: '⊃',
  supseteq: '⊇',
  cup: '∪',
  cap: '∩',
  emptyset: '∅',
  varnothing: '∅',
  setminus: '∖',
  smallsetminus: '∖',
  bigcup: '⋃',
  bigcap: '⋂',
  subsetneq: '⊊',
  supsetneq: '⊋',
  nsubseteq: '⊈',
  nsupseteq: '⊉',
  triangle: '△',
  forall: '∀',
  exists: '∃',
  neg: '¬',
  land: '∧',
  wedge: '∧',
  lor: '∨',
  vee: '∨',
  oplus: '⊕',
  otimes: '⊗',
  odot: '⊙',
  perp: '⊥',
  top: '⊤',
  bot: '⊥',
  ell: 'ℓ',
  independent: '⫫',
  angle: '∠',
  circ: '∘',
  bullet: '∙',
  prime: '′',
  langle: '⟨',
  rangle: '⟩',
  lfloor: '⌊',
  rfloor: '⌋',
  lceil: '⌈',
  rceil: '⌉',
  surd: '√',
  vert: '|',
  Vert: '‖',
};

const _TEX_FUNC = new Set([
  'sin',
  'cos',
  'tan',
  'cot',
  'sec',
  'csc',
  'sinh',
  'cosh',
  'tanh',
  'coth',
  'log',
  'ln',
  'lg',
  'exp',
  'lim',
  'limsup',
  'liminf',
  'max',
  'min',
  'sup',
  'inf',
  'det',
  'dim',
  'ker',
  'deg',
  'gcd',
  'arg',
  'argmin',
  'argmax',
  'arcsin',
  'arccos',
  'arctan',
  'mod',
  'Pr',
  'Var',
  'Cov',
  'Corr',
  'grad',
  'curl',
  'dist',
  'diam',
  'girth',
  'adj',
  'card',
]);

const _TEX_LIMIT_OPERATORS = new Set([
  'sum', 'prod', 'int', 'iint', 'iiint', 'iiiint', 'oint', 'oiint', 'oiiint',
  'bigcup', 'bigcap', 'lim', 'limsup', 'liminf', 'max', 'min', 'sup', 'inf',
  'argmin', 'argmax',
]);

// Accents. Each renders as <mover accent="true"> (or <munder> for
// \underline) over its single operand: `\bar{t}` -> t with a macron, NOT the word
// "bar". `over` is false for the one command that stacks BELOW.
const _TEX_ACCENT = {
  bar: { s: '¯', over: true }, // MACRON
  overline: { s: '¯', over: true },
  hat: { s: 'ˆ', over: true }, // MODIFIER LETTER CIRCUMFLEX
  widehat: { s: 'ˆ', over: true },
  vec: { s: '→', over: true }, // RIGHTWARDS ARROW
  overrightarrow: { s: '→', over: true },
  widevec: { s: '→', over: true },
  tilde: { s: '˜', over: true }, // SMALL TILDE
  widetilde: { s: '˜', over: true },
  dot: { s: '˙', over: true }, // DOT ABOVE
  ddot: { s: '¨', over: true }, // DIAERESIS
  underline: { s: '_', over: false }, // LOW LINE
  overbrace: { s: '⏞', over: true, accent: false, stretchy: true },
  underbrace: { s: '⏟', over: false, accent: false, stretchy: true },
};

// Alphabet commands -> <mi mathvariant="…">. Previously \mathrm/\mathbf/…
// dropped the variant entirely (so `\mathbf{x}` rendered identically to `x`), and
// \mathbb/\mathcal typeset as the WORDS "mathbb"/"mathcal".
const _TEX_MATHVARIANT = {
  mathrm: 'normal',
  mathbf: 'bold',
  mathit: 'italic',
  mathsf: 'sans-serif',
  mathbb: 'double-struck',
  mathcal: 'script',
  mathfrak: 'fraktur',
  mathtt: 'monospace',
  mathbbm: 'double-struck',
  boldsymbol: 'bold-italic',
  bm: 'bold-italic',
};

// Math alphabets as characters. MathML Core (Chromium) ignores every
// `mathvariant` but `normal`, so `\mathbb{E}` drew as an italic E. Each
// alphabet maps Latin letters, digits and (bold/italic) Greek to the Unicode
// Mathematical Alphanumeric Symbols, with the letterlike "holes" (ℝ, ℒ, ℭ, ℎ)
// taken from their older code points. `mathvariant` stays on the element for
// engines that honour it; it leaves these characters as they are.
const _MATH_ALPHABETS = {
  bold: { upper: 0x1d400, lower: 0x1d41a, digit: 0x1d7ce, greek: 0x1d6a8 },
  italic: { upper: 0x1d434, lower: 0x1d44e, greek: 0x1d6e2 },
  'bold-italic': { upper: 0x1d468, lower: 0x1d482, greek: 0x1d71c },
  script: { upper: 0x1d49c, lower: 0x1d4b6 },
  fraktur: { upper: 0x1d504, lower: 0x1d51e },
  'double-struck': { upper: 0x1d538, lower: 0x1d552, digit: 0x1d7d8 },
  'sans-serif': { upper: 0x1d5a0, lower: 0x1d5ba, digit: 0x1d7e2 },
  monospace: { upper: 0x1d670, lower: 0x1d68a, digit: 0x1d7f6 },
};
const _MATH_ALPHABET_HOLES = {
  italic: { h: 'ℎ' },
  script: {
    B: 'ℬ', E: 'ℰ', F: 'ℱ', H: 'ℋ', I: 'ℐ', L: 'ℒ', M: 'ℳ', R: 'ℛ', e: 'ℯ', g: 'ℊ', o: 'ℴ',
  },
  fraktur: { C: 'ℭ', H: 'ℌ', I: 'ℑ', R: 'ℜ', Z: 'ℨ' },
  'double-struck': { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' },
};
// The Greek order of the Mathematical Alphanumeric Symbols after α…ω.
const _MATH_GREEK_TAIL = '∂ϵϑϰϕϱϖ';

function _mathAlphanumeric(text, variant) {
  const alphabet = _MATH_ALPHABETS[variant];
  if (!alphabet) return text;
  const holes = _MATH_ALPHABET_HOLES[variant] || {};
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0);
    let mapped = null;
    if (Object.prototype.hasOwnProperty.call(holes, ch)) mapped = holes[ch];
    else if (code >= 0x41 && code <= 0x5a) mapped = String.fromCodePoint(alphabet.upper + code - 0x41);
    else if (code >= 0x61 && code <= 0x7a) mapped = String.fromCodePoint(alphabet.lower + code - 0x61);
    else if (code >= 0x30 && code <= 0x39 && alphabet.digit) {
      mapped = String.fromCodePoint(alphabet.digit + code - 0x30);
    } else if (alphabet.greek && code >= 0x391 && code <= 0x3a9 && code !== 0x3a2) {
      mapped = String.fromCodePoint(alphabet.greek + code - 0x391);
    } else if (alphabet.greek && code >= 0x3b1 && code <= 0x3c9) {
      mapped = String.fromCodePoint(alphabet.greek + 26 + code - 0x3b1);
    } else if (alphabet.greek && _MATH_GREEK_TAIL.includes(ch)) {
      mapped = String.fromCodePoint(alphabet.greek + 51 + _MATH_GREEK_TAIL.indexOf(ch));
    }
    out += mapped || ch;
  }
  return out;
}

// ASCII operators TeX draws as other characters.
const _TEX_ASCII_OPERATORS = { '-': '−', '*': '∗' };

// Delimiters \left / \right may size. `.` is TeX's NULL delimiter: it opens
// or closes nothing and renders no <mo> at all.
const _TEX_DELIM = {
  '(': '(',
  ')': ')',
  '[': '[',
  ']': ']',
  '|': '|',
  '/': '/',
  '.': '', // null delimiter -> render nothing
  '\\{': '{',
  '\\}': '}',
  '\\langle': '⟨',
  '\\rangle': '⟩',
  '\\lvert': '|',
  '\\rvert': '|',
  '\\lVert': '‖',
  '\\rVert': '‖',
  '\\lfloor': '⌊',
  '\\rfloor': '⌋',
  '\\lceil': '⌈',
  '\\rceil': '⌉',
  '\\vert': '|',
  '\\Vert': '‖',
  '\\backslash': '\\',
};

// Escaped literals: `\{` `\}` `\%` `\$` `\&` `\#` `\_` tokenize as single-character
// commands and render as the character itself. They MUST be listed — since an
// unlisted command throws, and these are ordinary math.
const _TEX_ESCAPED = new Set(['{', '}', '%', '$', '&', '#', '_']);

// Spacing commands render as an <mspace> of TeX's width (in em, at 18 mu to
// the em). `\!` is a negative thin space; MathML Core has no negative width,
// so it renders as no space rather than a wrong one. `~` is TeX's tie.
const _TEX_SPACING = {
  ',': '0.1667em',
  ':': '0.2222em',
  '>': '0.2222em',
  ';': '0.2778em',
  ' ': '0.25em',
  '!': '',
  quad: '1em',
  qquad: '2em',
};

// Characters with a TeX meaning this converter does not implement: `&` is an
// alignment point (environments only), `#` a macro parameter, and `%` starts a
// comment that would silently drop the rest of the formula.
const _TEX_SPECIAL_CHARS = {
  '&': 'the alignment character & is only typeset inside a supported table environment',
  '#': 'the macro parameter character # is not typeset',
  '%': 'a TeX comment (%) would drop the rest of the formula; write \\% for a percent sign',
};

/** thrown when the LaTeX uses something this converter cannot typeset.
 *  Never swallowed into plausible-looking output: callers either render real
 *  MathML or handle this. `tex` carries the offending command for the message. */
export class TexUnsupportedError extends Error {
  constructor(message, command) {
    super(message);
    this.name = 'TexUnsupportedError';
    this.command = command || '';
  }
}

// The targeted messages for commands an author/model reaches for constantly but
// this converter defers. Provides targeted explanations for commonly requested unsupported commands.
const _TEX_DEFERRED = {
  begin: 'only matrix, alignment, gather, and cases environments are typeset',
  end: 'only a matching supported environment is typeset',
  limits: '\\limits must follow a supported operator and precede its _ / ^ scripts',
  nolimits: '\\nolimits must follow a supported operator and precede its _ / ^ scripts',
  '\\': 'row breaks (\\\\) are only typeset inside a supported environment',
};

function _texUnsupported(name) {
  const hint = Object.prototype.hasOwnProperty.call(_TEX_DEFERRED, name)
    ? _TEX_DEFERRED[name]
    : 'it is not in the renderable LaTeX subset';
  return new TexUnsupportedError(`\\${name} cannot be rendered: ${hint}`, name);
}

// Tokenize a LaTeX string into a flat token stream. Whitespace is dropped (MathML
// owns spacing); a backslash starts a command (letters, or a single non-letter).
function _tokTex(src) {
  const toks = [];
  let i = 0;
  const n = src.length;
  const isAlpha = (c) => /[A-Za-z]/.test(c);
  // Every token records its source span (`p`..`e`), so \text{…} can recover
  // the author's spacing, which the math tokens deliberately drop.
  const push = (tok, start, end) => toks.push({ ...tok, p: start, e: end });
  while (i < n) {
    const ch = src[i];
    if (ch === '\\') {
      let j = i + 1;
      if (j < n && isAlpha(src[j])) {
        while (j < n && isAlpha(src[j])) j += 1;
        push({ k: 'cmd', v: src.slice(i + 1, j) }, i, j);
        i = j;
      } else {
        push({ k: 'cmd', v: src[j] || '' }, i, Math.min(j + 1, n));
        i = j + 1;
      }
    } else if (ch === '{') {
      push({ k: 'lb' }, i, i + 1);
      i += 1;
    } else if (ch === '}') {
      push({ k: 'rb' }, i, i + 1);
      i += 1;
    } else if (ch === '^') {
      push({ k: 'sup' }, i, i + 1);
      i += 1;
    } else if (ch === '_') {
      push({ k: 'sub' }, i, i + 1);
      i += 1;
    } else if (ch === '[') {
      push({ k: 'lbrack' }, i, i + 1);
      i += 1;
    } else if (ch === ']') {
      push({ k: 'rbrack' }, i, i + 1);
      i += 1;
    } else if (/\s/.test(ch)) {
      i += 1;
    } else if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < n && /[0-9.]/.test(src[j])) j += 1;
      push({ k: 'num', v: src.slice(i, j) }, i, j);
      i = j;
    } else if (isAlpha(ch)) {
      push({ k: 'ident', v: ch }, i, i + 1);
      i += 1;
    } else {
      // One code point, so a character outside the BMP is not split in two.
      const cp = String.fromCodePoint(src.codePointAt(i));
      push({ k: 'op', v: cp }, i, i + cp.length);
      i += cp.length;
    }
  }
  return toks;
}

const _peekTok = (st) => st.t[st.i];
const _nextTok = (st) => st.t[st.i++];

function _flattenTexText(node) {
  if (!node) return '';
  if (node.s != null && (!node.c || !node.c.length)) return node.s;
  return (node.c || []).map(_flattenTexText).join('');
}

function _unbalanced(what) {
  return new TexUnsupportedError(`unbalanced ${what}: the formula cannot be typeset as written`, '');
}

function _checkTexBounds(src) {
  if (src.length > _MAX_TEX_SOURCE) {
    throw new TexUnsupportedError('the expression exceeds the 8,192 character limit', '');
  }
  let depth = 0;
  for (let index = 0; index < src.length; index += 1) {
    if (src[index] === '\\') {
      index += 1;
    } else if (src[index] === '{') {
      depth += 1;
      if (depth > _MAX_TEX_NESTING) {
        throw new TexUnsupportedError('the expression exceeds the 128 group nesting limit', '');
      }
    } else if (src[index] === '}') {
      depth = Math.max(0, depth - 1);
    }
  }
}

const _MATRIX_ENVIRONMENTS = Object.freeze({
  matrix: null,
  pmatrix: ['(', ')'],
  bmatrix: ['[', ']'],
  Bmatrix: ['{', '}'],
  vmatrix: ['|', '|'],
  Vmatrix: ['‖', '‖'],
});

// These common display environments use table markup too. Keep the accepted
// grammar explicit: arbitrary LaTeX environments and column specifications
// remain source fallbacks.
const _TEX_ALIGNMENT_ENVIRONMENTS = new Set(['align', 'aligned', 'split']);
const _TEX_GATHER_ENVIRONMENTS = new Set(['gather', 'gathered']);
const _TEX_CASES_ENVIRONMENTS = new Set(['cases']);

function _readTexEnvironmentName(st) {
  const open = _nextTok(st);
  if (!open || open.k !== 'lb') throw new TexUnsupportedError('an environment command needs a braced name', 'begin');
  let depth = 1;
  for (let i = st.i; i < st.t.length; i += 1) {
    const tk = st.t[i];
    if (tk.k === 'lb') depth += 1;
    else if (tk.k === 'rb') {
      depth -= 1;
      if (depth === 0) {
        const name = st.src.slice(open.e, tk.p).trim();
        st.i = i + 1;
        if (!/^[A-Za-z]+$/.test(name)) throw new TexUnsupportedError('the environment name is malformed', 'begin');
        return name;
      }
    }
  }
  throw _unbalanced('environment name braces');
}

function _parseTexEnvironment(st) {
  const name = _readTexEnvironmentName(st);
  const isMatrix = Object.prototype.hasOwnProperty.call(_MATRIX_ENVIRONMENTS, name);
  const isAlignment = _TEX_ALIGNMENT_ENVIRONMENTS.has(name);
  const isGather = _TEX_GATHER_ENVIRONMENTS.has(name);
  const isCases = _TEX_CASES_ENVIRONMENTS.has(name);
  if (!isMatrix && !isAlignment && !isGather && !isCases) {
    throw new TexUnsupportedError(`\\begin{${name}} cannot be rendered: ${_TEX_DEFERRED.begin}`, 'begin');
  }
  const delimiters = isMatrix ? _MATRIX_ENVIRONMENTS[name] : null;

  const rows = [];
  let cells = [];
  function pushRow() {
    if (isAlignment && (cells.length < 2 || cells.length % 2 !== 0)) {
      throw new TexUnsupportedError(
        `\\begin{${name}} rows need paired cells separated by &`,
        'begin'
      );
    }
    if (isGather && cells.length !== 1) {
      throw new TexUnsupportedError(`\\begin{${name}} rows cannot contain &`, 'begin');
    }
    if (isCases && cells.length !== 2) {
      throw new TexUnsupportedError('each cases row needs an expression and a condition separated by &', 'begin');
    }
    if (!cells.some((cell) => cell.t !== 'mrow' || cell.c?.length)) {
      throw new TexUnsupportedError(`\\begin{${name}} cannot contain an empty row`, 'begin');
    }
    rows.push({ t: 'mtr', c: cells.map((child) => ({ t: 'mtd', c: [child] })) });
    cells = [];
  }
  for (;;) {
    const cell = _parseTexRow(st, null, null, true);
    cells.push(cell.length === 1 ? cell[0] : { t: 'mrow', c: cell });
    if (cells.length > 32) throw new TexUnsupportedError('a matrix row has more than 32 columns', 'begin');

    const next = _peekTok(st);
    if (!next) throw new TexUnsupportedError(`\\begin{${name}} has no matching \\end`, 'begin');
    if (next.k === 'op' && next.v === '&') {
      _nextTok(st);
      continue;
    }
    if (next.k === 'cmd' && next.v === '\\') {
      _nextTok(st);
      pushRow();
      if (rows.length > 128) throw new TexUnsupportedError('a matrix has more than 128 rows', 'begin');
      // TeX permits a final row break immediately before \end.
      const afterBreak = _peekTok(st);
      if (afterBreak?.k === 'lbrack') {
        throw new TexUnsupportedError('optional row spacing after \\\\ is not typeset', 'begin');
      }
      if (afterBreak?.k === 'cmd' && afterBreak.v === 'end') {
        _nextTok(st);
        const closing = _readTexEnvironmentName(st);
        if (closing !== name) {
          throw new TexUnsupportedError(`\\begin{${name}} closed by \\end{${closing}}`, 'end');
        }
        break;
      }
      continue;
    }
    if (next.k === 'cmd' && next.v === 'end') {
      _nextTok(st);
      const closing = _readTexEnvironmentName(st);
      if (closing !== name) {
        throw new TexUnsupportedError(`\\begin{${name}} closed by \\end{${closing}}`, 'end');
      }
      if (cells.length) pushRow();
      break;
    }
    throw new TexUnsupportedError(`unexpected token inside \\begin{${name}}`, 'begin');
  }
  if (rows.length > 128) throw new TexUnsupportedError('a matrix has more than 128 rows', 'begin');
  if (!rows.length) throw new TexUnsupportedError(`\\begin{${name}} cannot be empty`, 'begin');
  const columns = Math.max(...rows.map((row) => row.c.length));
  const tableAttrs = {};
  if (isAlignment) {
    tableAttrs.columnalign = Array.from({ length: columns }, (_, index) => index % 2 ? 'left' : 'right').join(' ');
    tableAttrs.class = 'math-semantic-blocks-table--aligned';
  } else if (isGather) {
    tableAttrs.columnalign = 'center';
  } else if (isCases) {
    tableAttrs.columnalign = 'left left';
    tableAttrs.class = 'math-semantic-blocks-table--cases';
  }
  const table = { t: 'mtable', ...(Object.keys(tableAttrs).length ? { a: tableAttrs } : {}), c: rows };
  if (!delimiters && !isCases) return table;
  if (isCases) {
    return {
      t: 'mrow',
      c: [
        { t: 'mo', a: { stretchy: 'true', fence: 'true', symmetric: 'false' }, s: '{' },
        table,
      ],
    };
  }
  return {
    t: 'mrow',
    c: [
      // MathML's default symmetric stretching centers fences around the math
      // axis. A matrix table can extend far above and below it, so request the
      // full table height for its delimiters.
      { t: 'mo', a: { stretchy: 'true', fence: 'true', symmetric: 'false' }, s: delimiters[0] },
      table,
      { t: 'mo', a: { stretchy: 'true', fence: 'true', symmetric: 'false' }, s: delimiters[1] },
    ],
  };
}

function _parseTexSubstack(st) {
  const open = _nextTok(st);
  if (!open || open.k !== 'lb') {
    throw new TexUnsupportedError('\\substack needs a braced group of one-column rows', 'substack');
  }
  const rows = [];
  for (;;) {
    const content = _parseTexRow(st, 'rb', null, true);
    if (!content.length) throw new TexUnsupportedError('a \\substack row cannot be empty', 'substack');
    const cell = content.length === 1 ? content[0] : { t: 'mrow', c: content };
    rows.push({ t: 'mtr', c: [{ t: 'mtd', c: [cell] }] });
    if (rows.length > 128) throw new TexUnsupportedError('a substack has more than 128 rows', 'substack');

    const next = _peekTok(st);
    if (next?.k === 'rb') {
      _nextTok(st);
      break;
    }
    if (next?.k === 'op' && next.v === '&') {
      throw new TexUnsupportedError('a \\substack row cannot contain &', 'substack');
    }
    if (next?.k === 'cmd' && next.v === '\\') {
      _nextTok(st);
      if (_peekTok(st)?.k === 'lbrack') {
        throw new TexUnsupportedError('optional row spacing in \\substack is not typeset', 'substack');
      }
      continue;
    }
    throw new TexUnsupportedError('a \\substack row needs \\\\ or a closing brace', 'substack');
  }
  return { t: 'mtable', a: { columnalign: 'center' }, c: rows };
}

// Consume the `}` that closes a group opened by `{`. A missing closer is an
// error: typesetting what was read so far would show half a formula.
function _closeBrace(st) {
  const tk = _peekTok(st);
  if (!tk || tk.k !== 'rb') throw _unbalanced('braces');
  _nextTok(st);
}

// Parse the single group after a command or script: a braced row, else one
// base atom. A missing argument (`\frac{a}`, `x^`) is an error, never an empty
// box. As in TeX, an unbraced number argument is ONE digit: `x^23` is x²3 and
// `\frac12` is ½.
function _parseTexGroup(st) {
  const tk = _peekTok(st);
  if (!tk || tk.k === 'rb' || tk.k === 'rbrack' || tk.k === 'sup' || tk.k === 'sub') {
    throw new TexUnsupportedError('a command or script is missing its argument', '');
  }
  if (tk.k === 'lb') {
    _nextTok(st);
    const row = _parseTexRow(st, 'rb');
    _closeBrace(st);
    return row.length === 1 ? row[0] : { t: 'mrow', c: row };
  }
  if (tk.k === 'num' && tk.v.length > 1) {
    const digit = tk.v[0];
    st.t[st.i] = { ...tk, v: tk.v.slice(1), p: tk.p + 1 };
    return { t: 'mn', s: digit };
  }
  return _parseTexBase(st);
}

// The literal text of a \text{…} argument, with the author's spacing. Only
// the escaped characters (`\{`, `\%`, …) are read as text; any other command
// inside text mode is outside the subset and fails.
function _parseTexTextArg(st) {
  const open = _peekTok(st);
  if (!open || open.k !== 'lb') return _flattenTexText(_parseTexGroup(st));
  let depth = 0;
  let j = st.i;
  for (; j < st.t.length; j += 1) {
    const tk = st.t[j];
    if (tk.k === 'lb') depth += 1;
    else if (tk.k === 'rb') {
      depth -= 1;
      if (depth === 0) break;
    } else if (tk.k === 'cmd' && !_TEX_ESCAPED.has(tk.v)) {
      throw new TexUnsupportedError(`\\${tk.v} inside \\text is not typeset`, tk.v);
    }
  }
  if (j >= st.t.length) throw _unbalanced('braces');
  const raw = st.src.slice(open.e, st.t[j].p);
  st.i = j + 1;
  return raw.replace(/\\(.)|[{}]/g, (match, escaped) => escaped ?? '').replace(/\s+/g, ' ');
}

// read the delimiter that MUST follow \left / \right. It is either a single
// operator/bracket token or a delimiter command; `.` is the null delimiter.
function _parseTexDelim(st, which) {
  const tk = _nextTok(st);
  if (!tk) throw new TexUnsupportedError(`\\${which} is missing its delimiter`, which);
  const key =
    tk.k === 'cmd'
      ? `\\${tk.v}`
      : tk.v ||
        (tk.k === 'lbrack'
          ? '['
          : tk.k === 'rbrack'
            ? ']'
            : tk.k === 'lb'
              ? '\\{'
              : tk.k === 'rb'
                ? '\\}'
                : '');
  if (!Object.prototype.hasOwnProperty.call(_TEX_DELIM, key)) {
    throw new TexUnsupportedError(
      `\\${which}${key} is not a delimiter this converter can size`,
      which
    );
  }
  return _TEX_DELIM[key];
}

function _parseTexCmd(st, name) {
  if (name === 'begin') return _parseTexEnvironment(st);
  if (name === 'end') throw new TexUnsupportedError('an environment ended without a matching begin', 'end');
  if (name === 'limits' || name === 'nolimits') throw _texUnsupported(name);
  // \left <delim> … \right <delim> -> an mrow of stretchy <mo> fences.
  if (name === 'left') {
    const open = _parseTexDelim(st, 'left');
    st.leftDepth = (st.leftDepth || 0) + 1;
    let body;
    try {
      body = _parseTexRow(st, null, 'right');
    } finally {
      st.leftDepth -= 1;
    }
    const closer = _peekTok(st);
    if (!closer || closer.k !== 'cmd' || closer.v !== 'right') {
      throw new TexUnsupportedError('\\left has no matching \\right', 'left');
    }
    _nextTok(st);
    const close = _parseTexDelim(st, 'right');
    const row = [];
    if (open) row.push({ t: 'mo', a: { stretchy: 'true', fence: 'true', symmetric: 'false' }, s: open });
    row.push(...body);
    if (close) row.push({ t: 'mo', a: { stretchy: 'true', fence: 'true', symmetric: 'false' }, s: close });
    return { t: 'mrow', c: row };
  }
  if (name === 'middle') {
    if (!st.leftDepth) throw new TexUnsupportedError('\\middle needs a matching \\left and \\right', 'middle');
    const delimiter = _parseTexDelim(st, 'middle');
    return { t: 'mo', a: { stretchy: 'true', fence: 'true', symmetric: 'false' }, s: delimiter };
  }
  // A \right with no \left never balances — fail rather than typeset "right".
  if (name === 'right') throw new TexUnsupportedError('\\right has no matching \\left', 'right');
  if (Object.prototype.hasOwnProperty.call(_TEX_ACCENT, name)) {
    const acc = _TEX_ACCENT[name];
    const base = _parseTexGroup(st);
    const mark = {
      t: 'mo',
      ...(acc.stretchy ? { a: { stretchy: 'true' } } : {}),
      s: acc.s,
    };
    return {
      t: acc.over ? 'mover' : 'munder',
      ...(acc.accent === false ? {} : { a: { accent: 'true' } }),
      c: [base, mark],
    };
  }
  if (Object.prototype.hasOwnProperty.call(_TEX_MATHVARIANT, name)) {
    return {
      t: 'mi',
      a: { mathvariant: _TEX_MATHVARIANT[name] },
      s: _mathAlphanumeric(_flattenTexText(_parseTexGroup(st)), _TEX_MATHVARIANT[name]),
    };
  }
  if (_TEX_ESCAPED.has(name)) return { t: 'mo', s: name };
  if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
    const num = _parseTexGroup(st);
    const den = _parseTexGroup(st);
    return { t: 'mfrac', c: [num, den] };
  }
  if (name === 'binom') {
    const num = _parseTexGroup(st);
    const den = _parseTexGroup(st);
    return {
      t: 'mrow',
      c: [
        { t: 'mo', a: { stretchy: 'true', fence: 'true', symmetric: 'false' }, s: '(' },
        { t: 'mfrac', a: { linethickness: '0' }, c: [num, den] },
        { t: 'mo', a: { stretchy: 'true', fence: 'true', symmetric: 'false' }, s: ')' },
      ],
    };
  }
  if (name === 'substack') {
    return _parseTexSubstack(st);
  }
  if (name === 'overset' || name === 'stackrel') {
    const over = _parseTexGroup(st);
    const base = _parseTexGroup(st);
    return { t: 'mover', c: [base, over] };
  }
  if (name === 'underset') {
    const under = _parseTexGroup(st);
    const base = _parseTexGroup(st);
    return { t: 'munder', c: [base, under] };
  }
  if (name === 'sqrt') {
    if (_peekTok(st) && _peekTok(st).k === 'lbrack') {
      _nextTok(st);
      const idxRow = _parseTexRow(st, 'rbrack');
      if (!_peekTok(st) || _peekTok(st).k !== 'rbrack') throw _unbalanced('root index brackets');
      _nextTok(st);
      const idx = idxRow.length === 1 ? idxRow[0] : { t: 'mrow', c: idxRow };
      return { t: 'mroot', c: [_parseTexGroup(st), idx] };
    }
    return { t: 'msqrt', c: [_parseTexGroup(st)] };
  }
  if (name === 'text' || name === 'mbox') {
    return { t: 'mtext', s: _parseTexTextArg(st) };
  }
  if (name === 'operatorname') {
    // An operator name sets upright like \sin: a multi-letter <mi>.
    return { t: 'mi', s: _parseTexTextArg(st).trim() };
  }
  if (Object.prototype.hasOwnProperty.call(_TEX_GREEK, name)) {
    return { t: 'mi', s: _TEX_GREEK[name] };
  }
  if (Object.prototype.hasOwnProperty.call(_TEX_OP, name)) {
    const limitEligible = _TEX_LIMIT_OPERATORS.has(name);
    return {
      t: 'mo',
      ...(limitEligible ? { a: { movablelimits: 'true' } } : {}),
      s: _TEX_OP[name],
      limitEligible,
    };
  }
  if (_TEX_FUNC.has(name)) {
    const limitEligible = _TEX_LIMIT_OPERATORS.has(name);
    return limitEligible
      ? { t: 'mo', a: { movablelimits: 'true' }, s: name, limitEligible: true }
      : { t: 'mi', s: name };
  }
  if (Object.prototype.hasOwnProperty.call(_TEX_SPACING, name)) {
    const width = _TEX_SPACING[name];
    return width ? { t: 'mspace', a: { width }, s: '' } : { t: 'mspace', s: '' };
  }
  // an unknown command FAILS. It used to return `{ t: 'mi', s: name }`,
  // typesetting `\bar{t}` as the word "bar": a plausible-looking equation with a
  // word where a symbol belongs, raising nothing, all the way into a printed book.
  // "Cannot render" is now a distinct, loud outcome — never silent literal text.
  throw _texUnsupported(name);
}

function _parseTexBase(st) {
  const tk = _nextTok(st);
  if (!tk) return null;
  switch (tk.k) {
    case 'num':
      return { t: 'mn', s: tk.v };
    case 'ident':
      return { t: 'mi', s: tk.v };
    case 'op':
      if (Object.prototype.hasOwnProperty.call(_TEX_SPECIAL_CHARS, tk.v)) {
        throw new TexUnsupportedError(_TEX_SPECIAL_CHARS[tk.v], tk.v);
      }
      if (tk.v === '~') return { t: 'mspace', a: { width: '0.25em' }, s: '' };
      if (tk.v === "'") return { t: 'mo', s: '′' }; // f' is f-prime
      // TeX sets `-` as a minus sign and `*` as the asterisk operator; MathML
      // draws the ASCII characters as a hyphen and a raised star.
      return { t: 'mo', s: _TEX_ASCII_OPERATORS[tk.v] || tk.v };
    case 'lbrack':
      return { t: 'mo', s: '[' };
    case 'rbrack':
      return { t: 'mo', s: ']' };
    case 'lb': {
      const row = _parseTexRow(st, 'rb');
      _closeBrace(st);
      return row.length === 1 ? row[0] : { t: 'mrow', c: row };
    }
    case 'cmd':
      return _parseTexCmd(st, tk.v);
    default:
      return null; // sup/sub/rb handled by the row loop
  }
}

// Attach any run of `^`/`_` scripts to `base`, producing msup/msub/msubsup.
// A second superscript or subscript on one base is TeX's "double superscript"
// error; keeping only the last would drop part of the formula.
function _parseTexScripts(st, base, limitMode = null) {
  if (limitMode && !base.limitEligible) {
    throw new TexUnsupportedError(`\\${limitMode} must follow a supported operator`, limitMode);
  }
  let sub = null;
  let sup = null;
  for (;;) {
    const tk = _peekTok(st);
    if (tk && tk.k === 'sup') {
      if (sup) throw new TexUnsupportedError('double superscript: brace the exponent, as in x^{a^b}', '^');
      _nextTok(st);
      sup = _parseTexGroup(st);
    } else if (tk && tk.k === 'sub') {
      if (sub) throw new TexUnsupportedError('double subscript: brace the index, as in x_{a_b}', '_');
      _nextTok(st);
      sub = _parseTexGroup(st);
    } else {
      break;
    }
  }
  if (limitMode && !sub && !sup) {
    throw new TexUnsupportedError(`\\${limitMode} needs a following _ or ^ script`, limitMode);
  }
  if (limitMode === 'limits') {
    base.a = { ...(base.a || {}), movablelimits: 'false' };
    if (sub && sup) return { t: 'munderover', c: [base, sub, sup] };
    if (sub) return { t: 'munder', c: [base, sub] };
    if (sup) return { t: 'mover', c: [base, sup] };
  }
  if (limitMode === 'nolimits' && base.t === 'mo') {
    base.a = { ...(base.a || {}), movablelimits: 'false' };
  }
  if (!limitMode && base.limitEligible) {
    if (sub && sup) return { t: 'munderover', c: [base, sub, sup] };
    if (sub) return { t: 'munder', c: [base, sub] };
    if (sup) return { t: 'mover', c: [base, sup] };
  }
  if (sub && sup) return { t: 'msubsup', c: [base, sub, sup] };
  if (sub) return { t: 'msub', c: [base, sub] };
  if (sup) return { t: 'msup', c: [base, sup] };
  return base;
}

// `stopKind` halts on a token KIND; `stopCmd` halts on a `cmd` token by NAME (which
// is how \left…\right finds its closer without consuming it). A `}` ends only a
// braced row and a `]` only a root index; anywhere else a `]` is an ordinary
// bracket (the interval [0, 1]) and a stray `}` is an error.
function _parseTexRow(st, stopKind, stopCmd, stopMatrixBoundary = false) {
  const out = [];
  for (;;) {
    const tk = _peekTok(st);
    if (!tk) break;
    if (stopKind && tk.k === stopKind) break;
    if (stopCmd && tk.k === 'cmd' && tk.v === stopCmd) break;
    if (stopMatrixBoundary && ((tk.k === 'op' && tk.v === '&') ||
      (tk.k === 'cmd' && (tk.v === '\\' || tk.v === 'end')))) break;
    if (tk.k === 'rb') throw _unbalanced('braces');
    if (tk.k === 'sup' || tk.k === 'sub') {
      const base = out.pop() || { t: 'mrow', c: [] };
      out.push(_parseTexScripts(st, base));
      continue;
    }
    const atom = _parseTexBase(st);
    if (!atom) continue;
    const nx = _peekTok(st);
    if (nx && (nx.k === 'sup' || nx.k === 'sub')) {
      out.push(_parseTexScripts(st, atom));
    } else if (nx?.k === 'cmd' && (nx.v === 'limits' || nx.v === 'nolimits')) {
      const mode = _nextTok(st).v;
      out.push(_parseTexScripts(st, atom, mode));
    } else {
      out.push(atom);
    }
  }
  return out;
}

// Build the intermediate MathML tree for a `tex` string. `display` toggles block.
// THROWS TexUnsupportedError when the LaTeX leaves the renderable subset ().
function _texToMathTree(tex, display) {
  const src = String(tex == null ? '' : tex);
  _checkTexBounds(src);
  const st = { t: _tokTex(src), i: 0, src };
  const row = _parseTexRow(st, null);
  if (st.i < st.t.length) throw _unbalanced('delimiters');
  const a = { xmlns: _MML_NS, display: display ? 'block' : 'inline', 'data-tex': src };
  return { t: 'math', a, c: row };
}

// the EXPLICIT "cannot render" tree: native MathML <merror>, which browsers
// style distinctly, so it can never be mistaken for a rendered equation. It keeps
// `data-tex`, so the round-trip still recovers the author's original source, and it
// keeps the `math[data-tex]` shape the parseDOM rules already match.
function _texErrorTree(tex, display, err) {
  const src = String(tex == null ? '' : tex);
  return {
    t: 'math',
    a: {
      xmlns: _MML_NS,
      display: display ? 'block' : 'inline',
      'data-tex': src,
      'data-math-error': err && err.message ? err.message : 'cannot render',
    },
    c: [
      {
        t: 'merror',
        c: [{ t: 'mtext', s: `⚠ ${err && err.message ? err.message : 'cannot render this math'}` }],
      },
    ],
  };
}

// Build a renderable tree, or an explicit <merror> tree. Only unsupported
// syntax is converted to an error node; unexpected errors still propagate.
function _texToMathTreeOrError(tex, display) {
  try {
    return _texToMathTree(tex, display);
  } catch (err) {
    if (err instanceof TexUnsupportedError) return _texErrorTree(tex, display, err);
    throw err;
  }
}

function _escMathText(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Serialize the intermediate tree to a MathML string (used by tests + any string sink).
function _mathTreeToString(node) {
  if (!node) return '';
  const attrs = node.a
    ? Object.entries(node.a)
        .map(([k, v]) => ` ${k}="${_escMathText(v).replace(/"/g, '&quot;')}"`)
        .join('')
    : '';
  if (node.s != null && (!node.c || !node.c.length)) {
    return `<${node.t}${attrs}>${_escMathText(node.s)}</${node.t}>`;
  }
  const inner = (node.c || []).map(_mathTreeToString).join('');
  return `<${node.t}${attrs}>${inner}</${node.t}>`;
}

// Render the intermediate tree as a namespaced MathML DOM subtree.
function _mathTreeToDom(node, doc) {
  const el = doc.createElementNS(_MML_NS, node.t);
  if (node.a) for (const [k, v] of Object.entries(node.a)) el.setAttribute(k, v);
  if (node.s != null && (!node.c || !node.c.length)) {
    el.appendChild(doc.createTextNode(node.s));
  } else {
    for (const child of node.c || []) el.appendChild(_mathTreeToDom(child, doc));
  }
  return el;
}

/** Convert LaTeX to MathML markup. `opts.display` selects block form.
 *
 *  Throws {@link TexUnsupportedError} for syntax outside the supported subset.
 *  Pass `opts.onError: 'node'` to return an explicit <merror> node instead. */
export function texToMathML(tex, opts = {}) {
  const display = !!(opts && opts.display);
  const tree =
    opts && opts.onError === 'node'
      ? _texToMathTreeOrError(tex, display)
      : _texToMathTree(tex, display);
  return _mathTreeToString(tree);
}

/** Convert LaTeX to a namespaced MathML DOM subtree in `doc`.
 *
 * Unlike the string API, this path never asks a Markdown consumer to parse
 * markup. Every element and text node is created directly from the converter's
 * bounded syntax tree. `opts.display` selects block form; `opts.onError:
 * 'node'` returns the converter's explicit native `<merror>` node.
 */
export function texToMathMLNode(tex, doc, opts = {}) {
  if (!doc || typeof doc.createElementNS !== 'function' || typeof doc.createTextNode !== 'function') {
    throw new TypeError('texToMathMLNode requires a DOM document');
  }
  const display = !!(opts && opts.display);
  const tree =
    opts && opts.onError === 'node'
      ? _texToMathTreeOrError(tex, display)
      : _texToMathTree(tex, display);
  return _mathTreeToDom(tree, doc);
}

/** True when {@link texToMathML} can typeset `tex`. Never throws. */
export function isRenderableTex(tex, opts = {}) {
  try {
    _texToMathTree(tex, !!(opts && opts.display));
    return true;
  } catch (err) {
    if (err instanceof TexUnsupportedError) return false;
    throw err;
  }
}
