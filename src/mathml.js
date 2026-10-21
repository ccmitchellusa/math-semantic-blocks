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
// Deliberately unsupported:
// \begin{}…\end{} environments (matrices / align). They need <mtable>/<mtr>/<mtd>,
// `\\` row breaks (which this converter has no support for at all) and per-
// environment alignment-point semantics for `&`. That is a materially bigger lift,
// and a HALF-correct matrix would re-create the exact "plausible but wrong" failure
// Stacked \sum/\int limits (\limits) are unsupported as well.
//

const _MML_NS = 'http://www.w3.org/1998/Math/MathML';

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
  sim: '∼',
  simeq: '≃',
  propto: '∝',
  ll: '≪',
  gg: '≫',
  infty: '∞',
  partial: '∂',
  nabla: '∇',
  sum: '∑',
  prod: '∏',
  int: '∫',
  oint: '∮',
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
  forall: '∀',
  exists: '∃',
  neg: '¬',
  land: '∧',
  wedge: '∧',
  lor: '∨',
  vee: '∨',
  oplus: '⊕',
  otimes: '⊗',
  perp: '⊥',
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
  'arcsin',
  'arccos',
  'arctan',
  'mod',
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
  tilde: { s: '˜', over: true }, // SMALL TILDE
  widetilde: { s: '˜', over: true },
  dot: { s: '˙', over: true }, // DOT ABOVE
  ddot: { s: '¨', over: true }, // DIAERESIS
  underline: { s: '_', over: false }, // LOW LINE
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
};

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

// Spacing commands render as an (empty) <mspace>.
const _TEX_SPACING = new Set([',', ';', ' ', '!', 'quad', 'qquad']);

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
  begin: 'LaTeX environments (\\begin{...}) are not typeset',
  end: 'LaTeX environments (\\end{...}) are not typeset',
  limits: 'stacked \\limits are not typeset -- plain _ / ^ scripts render',
  nolimits: 'stacked \\nolimits are not typeset -- plain _ / ^ scripts render',
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
  while (i < n) {
    const ch = src[i];
    if (ch === '\\') {
      let j = i + 1;
      if (j < n && isAlpha(src[j])) {
        while (j < n && isAlpha(src[j])) j += 1;
        toks.push({ k: 'cmd', v: src.slice(i + 1, j) });
        i = j;
      } else {
        toks.push({ k: 'cmd', v: src[j] || '' });
        i = j + 1;
      }
    } else if (ch === '{') {
      toks.push({ k: 'lb' });
      i += 1;
    } else if (ch === '}') {
      toks.push({ k: 'rb' });
      i += 1;
    } else if (ch === '^') {
      toks.push({ k: 'sup' });
      i += 1;
    } else if (ch === '_') {
      toks.push({ k: 'sub' });
      i += 1;
    } else if (ch === '[') {
      toks.push({ k: 'lbrack' });
      i += 1;
    } else if (ch === ']') {
      toks.push({ k: 'rbrack' });
      i += 1;
    } else if (/\s/.test(ch)) {
      i += 1;
    } else if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < n && /[0-9.]/.test(src[j])) j += 1;
      toks.push({ k: 'num', v: src.slice(i, j) });
      i = j;
    } else if (isAlpha(ch)) {
      toks.push({ k: 'ident', v: ch });
      i += 1;
    } else {
      toks.push({ k: 'op', v: ch });
      i += 1;
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

// Parse the single group after a command: a braced row, else one base atom.
function _parseTexGroup(st) {
  const tk = _peekTok(st);
  if (tk && tk.k === 'lb') {
    _nextTok(st);
    const row = _parseTexRow(st, 'rb');
    if (_peekTok(st) && _peekTok(st).k === 'rb') _nextTok(st);
    return row.length === 1 ? row[0] : { t: 'mrow', c: row };
  }
  return _parseTexBase(st) || { t: 'mrow', c: [] };
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
  // \left <delim> … \right <delim> -> an mrow of stretchy <mo> fences.
  if (name === 'left') {
    const open = _parseTexDelim(st, 'left');
    const body = _parseTexRow(st, null, 'right');
    const closer = _peekTok(st);
    if (!closer || closer.k !== 'cmd' || closer.v !== 'right') {
      throw new TexUnsupportedError('\\left has no matching \\right', 'left');
    }
    _nextTok(st);
    const close = _parseTexDelim(st, 'right');
    const row = [];
    if (open) row.push({ t: 'mo', a: { stretchy: 'true', fence: 'true' }, s: open });
    row.push(...body);
    if (close) row.push({ t: 'mo', a: { stretchy: 'true', fence: 'true' }, s: close });
    return { t: 'mrow', c: row };
  }
  // A \right with no \left never balances — fail rather than typeset "right".
  if (name === 'right') throw new TexUnsupportedError('\\right has no matching \\left', 'right');
  if (Object.prototype.hasOwnProperty.call(_TEX_ACCENT, name)) {
    const acc = _TEX_ACCENT[name];
    const base = _parseTexGroup(st);
    return {
      t: acc.over ? 'mover' : 'munder',
      a: { accent: 'true' },
      c: [base, { t: 'mo', s: acc.s }],
    };
  }
  if (Object.prototype.hasOwnProperty.call(_TEX_MATHVARIANT, name)) {
    return {
      t: 'mi',
      a: { mathvariant: _TEX_MATHVARIANT[name] },
      s: _flattenTexText(_parseTexGroup(st)),
    };
  }
  if (_TEX_ESCAPED.has(name)) return { t: 'mo', s: name };
  if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
    const num = _parseTexGroup(st);
    const den = _parseTexGroup(st);
    return { t: 'mfrac', c: [num, den] };
  }
  if (name === 'sqrt') {
    if (_peekTok(st) && _peekTok(st).k === 'lbrack') {
      _nextTok(st);
      const idxRow = _parseTexRow(st, 'rbrack');
      if (_peekTok(st) && _peekTok(st).k === 'rbrack') _nextTok(st);
      const idx = idxRow.length === 1 ? idxRow[0] : { t: 'mrow', c: idxRow };
      return { t: 'mroot', c: [_parseTexGroup(st), idx] };
    }
    return { t: 'msqrt', c: [_parseTexGroup(st)] };
  }
  if (name === 'text' || name === 'mbox' || name === 'operatorname') {
    return { t: 'mtext', s: _flattenTexText(_parseTexGroup(st)) };
  }
  if (Object.prototype.hasOwnProperty.call(_TEX_GREEK, name)) {
    return { t: 'mi', s: _TEX_GREEK[name] };
  }
  if (Object.prototype.hasOwnProperty.call(_TEX_OP, name)) {
    return { t: 'mo', s: _TEX_OP[name] };
  }
  if (_TEX_FUNC.has(name)) return { t: 'mi', s: name };
  if (_TEX_SPACING.has(name)) return { t: 'mspace', s: '' };
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
      return { t: 'mo', s: tk.v };
    case 'lbrack':
      return { t: 'mo', s: '[' };
    case 'rbrack':
      return { t: 'mo', s: ']' };
    case 'lb': {
      const row = _parseTexRow(st, 'rb');
      if (_peekTok(st) && _peekTok(st).k === 'rb') _nextTok(st);
      return row.length === 1 ? row[0] : { t: 'mrow', c: row };
    }
    case 'cmd':
      return _parseTexCmd(st, tk.v);
    default:
      return null; // sup/sub/rb handled by the row loop
  }
}

// Attach any run of `^`/`_` scripts to `base`, producing msup/msub/msubsup.
function _parseTexScripts(st, base) {
  let sub = null;
  let sup = null;
  for (;;) {
    const tk = _peekTok(st);
    if (tk && tk.k === 'sup') {
      _nextTok(st);
      sup = _parseTexGroup(st);
    } else if (tk && tk.k === 'sub') {
      _nextTok(st);
      sub = _parseTexGroup(st);
    } else {
      break;
    }
  }
  if (sub && sup) return { t: 'msubsup', c: [base, sub, sup] };
  if (sub) return { t: 'msub', c: [base, sub] };
  if (sup) return { t: 'msup', c: [base, sup] };
  return base;
}

// `stopKind` halts on a token KIND; `stopCmd` halts on a `cmd` token by NAME (which
// is how \left…\right finds its closer without consuming it).
function _parseTexRow(st, stopKind, stopCmd) {
  const out = [];
  for (;;) {
    const tk = _peekTok(st);
    if (!tk) break;
    if (stopKind && tk.k === stopKind) break;
    if (stopCmd && tk.k === 'cmd' && tk.v === stopCmd) break;
    if (tk.k === 'rb' || tk.k === 'rbrack') break; // let the group parser consume the closer
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
  const row = _parseTexRow({ t: _tokTex(src), i: 0 }, null);
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
