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
  epsilon: 'ϵ', // U+03F5: TeX's \epsilon is the lunate form
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
  phi: 'ϕ', // U+03D5: TeX's \phi is the straight form
  varphi: 'φ',
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
  varkappa: 'ϰ',
  digamma: 'ϝ',
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
  '|': '‖', // \| is TeX's double bar
  // Binary operators.
  ominus: '⊖', oslash: '⊘', bigcirc: '◯', amalg: '⨿', sqcup: '⊔', sqcap: '⊓', uplus: '⊎', wr: '≀',
  diamond: '⋄', triangleleft: '◃', triangleright: '▹', bigtriangleup: '△', bigtriangledown: '▽',
  lhd: '⊲', rhd: '⊳', unlhd: '⊴', unrhd: '⊵', centerdot: '⋅', intercal: '⊺', barwedge: '⊼',
  veebar: '⊻', curlywedge: '⋏', curlyvee: '⋎', boxplus: '⊞', boxminus: '⊟', boxtimes: '⊠',
  boxdot: '⊡', circleddash: '⊝', circledast: '⊛', circledcirc: '⊚', divideontimes: '⋇',
  dotplus: '∔', ltimes: '⋉', rtimes: '⋊', leftthreetimes: '⋋', rightthreetimes: '⋌', Cap: '⋒',
  Cup: '⋓', lnot: '¬',
  // Relations.
  prec: '≺', succ: '≻', preceq: '⪯', succeq: '⪰', parallel: '∥', nparallel: '∦', models: '⊨',
  vdash: '⊢', dashv: '⊣', vDash: '⊨', Vdash: '⊩', Vvdash: '⊪', asymp: '≍', doteq: '≐',
  doteqdot: '≑', Doteq: '≑', bowtie: '⋈', Join: '⋈', smile: '⌣', frown: '⌢', smallsmile: '⌣',
  smallfrown: '⌢', sqsubset: '⊏', sqsupset: '⊐', sqsubseteq: '⊑', sqsupseteq: '⊒', Subset: '⋐',
  Supset: '⋑', lesssim: '≲', gtrsim: '≳', lessapprox: '⪅', gtrapprox: '⪆', leqslant: '⩽',
  geqslant: '⩾', lll: '⋘', ggg: '⋙', approxeq: '≊', backsim: '∽', backsimeq: '⋍', eqsim: '≂',
  triangleq: '≜', coloneqq: '≔', risingdotseq: '≓', fallingdotseq: '≒', circeq: '≗', bumpeq: '≏',
  Bumpeq: '≎', therefore: '∴', because: '∵', between: '≬', pitchfork: '⋔', varpropto: '∝',
  lessgtr: '≶', gtrless: '≷', lesseqgtr: '⋚', gtreqless: '⋛', precsim: '≾', succsim: '≿',
  trianglelefteq: '⊴', trianglerighteq: '⊵', vartriangleleft: '⊲', vartriangleright: '⊳',
  owns: '∋', leqq: '≦', geqq: '≧', lneq: '⪇', gneq: '⪈', lneqq: '≨', gneqq: '≩', nleq: '≰',
  ngeq: '≱', nless: '≮', ngtr: '≯', nprec: '⊀', nsucc: '⊁', nsim: '≁', nmid: '∤', nvdash: '⊬',
  nvDash: '⊭', nVdash: '⊮', ntriangleleft: '⋪', ntriangleright: '⋫', subsetneqq: '⫋',
  supsetneqq: '⫌', lt: '<', gt: '>',
  // Arrows.
  Leftrightarrow: '⇔', longrightarrow: '⟶', longleftarrow: '⟵', longleftrightarrow: '⟷',
  Longrightarrow: '⟹', Longleftarrow: '⟸', Longleftrightarrow: '⟺', longmapsto: '⟼',
  uparrow: '↑', downarrow: '↓', updownarrow: '↕', Uparrow: '⇑', Downarrow: '⇓', Updownarrow: '⇕',
  nearrow: '↗', searrow: '↘', swarrow: '↙', nwarrow: '↖', hookrightarrow: '↪', hookleftarrow: '↩',
  rightharpoonup: '⇀', rightharpoondown: '⇁', leftharpoonup: '↼', leftharpoondown: '↽',
  rightleftharpoons: '⇌', leftrightharpoons: '⇋', leadsto: '⇝', rightsquigarrow: '⇝',
  leftrightsquigarrow: '↭', twoheadrightarrow: '↠', twoheadleftarrow: '↞', rightarrowtail: '↣',
  leftarrowtail: '↢', looparrowright: '↬', looparrowleft: '↫', curvearrowright: '↷',
  curvearrowleft: '↶', circlearrowright: '↻', circlearrowleft: '↺', Lsh: '↰', Rsh: '↱',
  upharpoonleft: '↿', upharpoonright: '↾', downharpoonleft: '⇃', downharpoonright: '⇂',
  rightrightarrows: '⇉', leftleftarrows: '⇇', rightleftarrows: '⇄', leftrightarrows: '⇆',
  upuparrows: '⇈', downdownarrows: '⇊', Rrightarrow: '⇛', Lleftarrow: '⇚', multimap: '⊸',
  nleftarrow: '↚', nrightarrow: '↛', nLeftarrow: '⇍', nRightarrow: '⇏', nleftrightarrow: '↮',
  nLeftrightarrow: '⇎',
  // Big operators (movable limits: _TEX_LIMIT_OPERATORS).
  coprod: '∐', bigoplus: '⨁', bigotimes: '⨂', bigodot: '⨀', biguplus: '⨄', bigsqcup: '⨆',
  bigvee: '⋁', bigwedge: '⋀',
  // Dots.
  ddots: '⋱', dotsb: '⋯', dotsc: '…', dotsi: '⋯', dotsm: '⋯', dotso: '…', mathellipsis: '…',
  cdotp: '⋅', ldotp: '.',
  // Delimiters on their own (outside \left / \right).
  lvert: '|', rvert: '|', lVert: '‖', rVert: '‖', lbrace: '{', rbrace: '}', lbrack: '[', rbrack: ']',
  lgroup: '⟮', rgroup: '⟯', llbracket: '⟦', rrbracket: '⟧', backslash: '\\',
};

// Ordinary symbols (TeX's \mathord): letterlike symbols, suits, daggers and
// the like are identifiers, <mi>. As an <mo> they would take operator spacing
// (\hbar in `i\hbar` must sit against the i).
const _TEX_ORD = {
  hbar: 'ℏ', hslash: 'ℏ', Re: 'ℜ', Im: 'ℑ', wp: '℘', aleph: 'ℵ', beth: 'ℶ', gimel: 'ℷ',
  daleth: 'ℸ', eth: 'ð', Finv: 'Ⅎ', Game: '⅁', complement: '∁', imath: 'ı', jmath: 'ȷ', mho: '℧',
  Bbbk: '𝕜', nexists: '∄', degree: '°', Box: '□', square: '□', blacksquare: '■', Diamond: '◊',
  lozenge: '◊', blacklozenge: '⧫', clubsuit: '♣', diamondsuit: '♢', heartsuit: '♡',
  spadesuit: '♠', flat: '♭', natural: '♮', sharp: '♯', checkmark: '✓', dagger: '†', ddagger: '‡',
  dag: '†', ddag: '‡', backprime: '‵', triangledown: '▽', blacktriangle: '▲',
  blacktriangledown: '▼', bigstar: '★', diagup: '╱', diagdown: '╲', sphericalangle: '∢',
  measuredangle: '∡', vartriangle: '△', maltese: '✠', circledS: 'Ⓢ',
};

// amsmath's spaced arrows: a thick space either side of the relation.
const _TEX_SPACED_RELATIONS = { implies: '⟹', impliedby: '⟸', iff: '⟺' };

// \not over a relation: the precomposed negation where Unicode has one,
// otherwise the character with U+0338 COMBINING LONG SOLIDUS OVERLAY.
const _TEX_NEGATED = {
  '=': '≠', '<': '≮', '>': '≯', '∈': '∉', '∋': '∌', '≡': '≢', '⊂': '⊄', '⊃': '⊅', '⊆': '⊈',
  '⊇': '⊉', '≤': '≰', '≥': '≱', '∼': '≁', '≈': '≉', '≅': '≇', '≃': '≄', '|': '∤', '∣': '∤',
  '∥': '∦', '∃': '∄', '≺': '⊀', '≻': '⊁', '⊢': '⊬', '⊨': '⊭', '⊩': '⊮', '≍': '≭', '⊑': '⋢',
  '⊒': '⋣', '⊲': '⋪', '⊳': '⋫', '⊴': '⋬', '⊵': '⋭', '→': '↛', '←': '↚', '↔': '↮', '⇒': '⇏',
  '⇐': '⇍', '⇔': '⇎', '≲': '≴', '≳': '≵', '≶': '≸', '≷': '≹', '⪯': '⪯̸', '⪰': '⪰̸',
};

// \big … \Bigg (and their l / r / m forms): a delimiter at TeX's fixed sizes.
const _TEX_BIG_DELIMS = {};
for (const [base, size] of [['big', '1.2em'], ['Big', '1.8em'], ['bigg', '2.4em'], ['Bigg', '3em']]) {
  for (const role of ['', 'l', 'r', 'm']) _TEX_BIG_DELIMS[base + role] = { size, role };
}

// Style switches: the rest of the group in display, text, script or
// scriptscript style.
const _TEX_STYLES = {
  displaystyle: { displaystyle: 'true', scriptlevel: '0' },
  textstyle: { displaystyle: 'false', scriptlevel: '0' },
  scriptstyle: { displaystyle: 'false', scriptlevel: '1' },
  scriptscriptstyle: { displaystyle: 'false', scriptlevel: '2' },
};

// \cancel and \boxed: native MathML enclosures (the renderer's CSS draws
// them where the engine does not, as Chromium's MathML Core does not).
const _TEX_ENCLOSE = {
  cancel: 'updiagonalstrike',
  bcancel: 'downdiagonalstrike',
  xcancel: 'updiagonalstrike downdiagonalstrike',
  boxed: 'box',
};

// Text-mode commands: \text with a font. Bold, italic and sans text use the
// math alphabets' characters, as the alphabet commands do.
const _TEX_TEXT_FONTS = { textrm: null, textnormal: null, textup: null, textbf: 'bold', textit: 'italic', textsf: 'sans-serif' };

// Commands accepted and not drawn: equation labels and numbering switches.
const _TEX_IGNORED = new Set(['nonumber', 'notag']);

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
  'hom',
]);

const _TEX_LIMIT_OPERATORS = new Set([
  'sum', 'prod', 'int', 'iint', 'iiint', 'iiiint', 'oint', 'oiint', 'oiiint',
  'bigcup', 'bigcap', 'lim', 'limsup', 'liminf', 'max', 'min', 'sup', 'inf',
  'argmin', 'argmax', 'coprod', 'bigoplus', 'bigotimes', 'bigodot', 'biguplus', 'bigsqcup',
  'bigvee', 'bigwedge',
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
  acute: { s: 'ˊ', over: true }, // MODIFIER LETTER ACUTE ACCENT
  grave: { s: 'ˋ', over: true }, // MODIFIER LETTER GRAVE ACCENT
  breve: { s: '˘', over: true },
  check: { s: 'ˇ', over: true }, // CARON
  mathring: { s: '˚', over: true }, // RING ABOVE
  overleftarrow: { s: '←', over: true },
  overleftrightarrow: { s: '↔', over: true },
  underleftarrow: { s: '←', over: false },
  underrightarrow: { s: '→', over: false },
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
  pmb: 'bold-italic',
  mathscr: 'script',
  mathnormal: 'italic',
  Bbb: 'double-struck',
  bold: 'bold',
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

// Delimiters TeX sets at their natural size unless \left/\right/\big asks
// otherwise. MathML stretches a fence to its row's height by default (with
// any OpenType math font), so a bare one is marked stretchy="false".
const _TEX_BARE_DELIMITERS = new Set([
  '(', ')', '[', ']', '{', '}', '|', '‖', '⟨', '⟩', '⌊', '⌋', '⌈', '⌉', '⟮', '⟯', '⟦', '⟧', '/', '\\',
]);
const _bareDelimiter = (s) => (_TEX_BARE_DELIMITERS.has(s) ? { t: 'mo', a: { stretchy: 'false' }, s } : { t: 'mo', s });

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
  '\\|': '‖',
  '\\lbrace': '{',
  '\\rbrace': '}',
  '\\lbrack': '[',
  '\\rbrack': ']',
  '\\lgroup': '⟮',
  '\\rgroup': '⟯',
  '\\uparrow': '↑',
  '\\downarrow': '↓',
  '\\updownarrow': '↕',
  '\\Uparrow': '⇑',
  '\\Downarrow': '⇓',
  '\\Updownarrow': '⇕',
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
  thinspace: '0.1667em',
  medspace: '0.2222em',
  thickspace: '0.2778em',
  enspace: '0.5em',
  negthinspace: '',
  negmedspace: '',
  negthickspace: '',
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
  smallmatrix: null,
});

// These common display environments use table markup too. Keep the accepted
// grammar explicit: arbitrary LaTeX environments and column specifications
// remain source fallbacks.
const _TEX_ALIGNMENT_ENVIRONMENTS = new Set(['align', 'align*', 'aligned', 'split']);
const _TEX_GATHER_ENVIRONMENTS = new Set(['gather', 'gather*', 'gathered', 'multline', 'multline*']);
const _TEX_CASES_ENVIRONMENTS = new Set(['cases']);
// One formula with no table: its content is the equation (numbering is not drawn).
const _TEX_EQUATION_ENVIRONMENTS = new Set(['equation', 'equation*']);
const _TEX_ARRAY_ALIGN = { l: 'left', c: 'center', r: 'right' };
const _TEX_CELL_CLASS = { left: 'math-semantic-blocks-cell--left', right: 'math-semantic-blocks-cell--right' };

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
        if (!/^[A-Za-z]+\*?$/.test(name)) throw new TexUnsupportedError('the environment name is malformed', 'begin');
        return name;
      }
    }
  }
  throw _unbalanced('environment name braces');
}

// An array's column specification: l, c and r only (vertical rules and
// p{…} columns are not typeset). Returns the MathML column alignments.
function _readTexArraySpec(st) {
  const open = _nextTok(st);
  if (!open || open.k !== 'lb') throw new TexUnsupportedError('\\begin{array} needs a braced column specification', 'begin');
  const close = st.t.findIndex((tk, index) => index >= st.i && tk.k === 'rb');
  if (close < 0) throw _unbalanced('column specification braces');
  const spec = st.src.slice(open.e, st.t[close].p).replace(/\s+/g, '');
  st.i = close + 1;
  if (!/^[lcr]{1,32}$/.test(spec)) {
    throw new TexUnsupportedError('an array column specification may use only l, c and r (no | rules or p{…} columns)', 'begin');
  }
  return [...spec].map((letter) => _TEX_ARRAY_ALIGN[letter]);
}

function _closeTexEnvironment(st, name) {
  const closing = _readTexEnvironmentName(st);
  if (closing !== name) throw new TexUnsupportedError(`\\begin{${name}} closed by \\end{${closing}}`, 'end');
}

function _parseTexEnvironment(st) {
  const name = _readTexEnvironmentName(st);
  if (_TEX_EQUATION_ENVIRONMENTS.has(name)) {
    // The equation's body is the formula itself; a \tag in it labels the equation.
    const body = _parseTexRow(st, null, null, true, st.rowDepth === 1);
    const next = _peekTok(st);
    if (!next || next.k !== 'cmd' || next.v !== 'end') {
      throw new TexUnsupportedError(`\\begin{${name}} holds one formula, with no & or \\\\`, 'begin');
    }
    _nextTok(st);
    _closeTexEnvironment(st, name);
    return body.length === 1 ? body[0] : { t: 'mrow', c: body };
  }
  const isMatrix = Object.prototype.hasOwnProperty.call(_MATRIX_ENVIRONMENTS, name);
  const isAlignment = _TEX_ALIGNMENT_ENVIRONMENTS.has(name);
  const isGather = _TEX_GATHER_ENVIRONMENTS.has(name);
  const isCases = _TEX_CASES_ENVIRONMENTS.has(name);
  const isArray = name === 'array';
  if (!isMatrix && !isAlignment && !isGather && !isCases && !isArray) {
    throw new TexUnsupportedError(`\\begin{${name}} cannot be rendered: ${_TEX_DEFERRED.begin}`, 'begin');
  }
  const columnAlign = isArray ? _readTexArraySpec(st) : null;
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
    if (isArray && cells.length > columnAlign.length) {
      throw new TexUnsupportedError('an array row has more cells than its column specification', 'begin');
    }
    if (!cells.some((cell) => cell.t !== 'mrow' || cell.c?.length)) {
      throw new TexUnsupportedError(`\\begin{${name}} cannot contain an empty row`, 'begin');
    }
    rows.push({
      t: 'mtr',
      c: cells.map((child, index) => {
        // Alignment and gather cells are display style, as amsmath sets them
        // (a table cell is otherwise compact: limits would move to the side).
        const content = isAlignment || isGather ? { t: 'mstyle', a: { displaystyle: 'true' }, c: [child] } : child;
        const cellClass = isArray ? _TEX_CELL_CLASS[columnAlign[index]] : null;
        return { t: 'mtd', ...(cellClass ? { a: { class: cellClass } } : {}), c: [content] };
      }),
    });
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
  } else if (isArray) {
    tableAttrs.columnalign = columnAlign.join(' ');
  }
  const table = { t: 'mtable', ...(Object.keys(tableAttrs).length ? { a: tableAttrs } : {}), c: rows };
  // smallmatrix: a matrix at script size, for one inside a line of text.
  if (name === 'smallmatrix') return { t: 'mstyle', a: { scriptlevel: '1' }, c: [table] };
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
  const node = _parseTexBase(st);
  // A command that draws nothing (\label, \color) is not an argument.
  if (!node) throw new TexUnsupportedError('a command or script is missing its argument', '');
  return node;
}

// A braced argument read and discarded (a colour, a label key): balanced
// braces, any content. Nothing in it is typeset or passed on.
function _skipTexRawArg(st, name) {
  const open = _nextTok(st);
  if (!open || open.k !== 'lb') throw new TexUnsupportedError(`\\${name} needs a braced argument`, name);
  let depth = 1;
  while (st.i < st.t.length) {
    const tk = st.t[st.i];
    st.i += 1;
    if (tk.k === 'lb') depth += 1;
    else if (tk.k === 'rb') {
      depth -= 1;
      if (depth === 0) return;
    }
  }
  throw _unbalanced('braces');
}

// An optional [ … ] argument read and discarded (a colour model).
function _skipTexOptionalArg(st) {
  if (_peekTok(st)?.k !== 'lbrack') return;
  while (st.i < st.t.length) {
    const tk = st.t[st.i];
    st.i += 1;
    if (tk.k === 'rbrack') return;
  }
  throw _unbalanced('brackets');
}

// The optional [ … ] argument of \xrightarrow, parsed as math, or null.
function _parseTexOptionalMath(st) {
  if (_peekTok(st)?.k !== 'lbrack') return null;
  _nextTok(st);
  const row = _parseTexRow(st, 'rbrack');
  if (_peekTok(st)?.k !== 'rbrack') throw _unbalanced('optional argument brackets');
  _nextTok(st);
  return row.length === 1 ? row[0] : { t: 'mrow', c: row };
}

const _starNext = (st) => {
  const tk = _peekTok(st);
  if (tk?.k === 'op' && tk.v === '*') {
    _nextTok(st);
    return true;
  }
  return false;
};

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
  if (Object.prototype.hasOwnProperty.call(_TEX_BIG_DELIMS, name)) {
    // \big( … \Bigg): a fixed size, centred on the axis; \bigl/\bigr open and
    // close, \bigm is a relation (a thick space either side). \big. is nothing.
    const { size, role } = _TEX_BIG_DELIMS[name];
    const delimiter = _parseTexDelim(st, name);
    if (!delimiter) return null;
    const a = { stretchy: 'true', symmetric: 'true', minsize: size, maxsize: size };
    if (role === 'l' || role === 'r') a.fence = 'true';
    if (role === 'm') Object.assign(a, { lspace: '0.2778em', rspace: '0.2778em' });
    return { t: 'mo', a, s: delimiter };
  }
  if (Object.prototype.hasOwnProperty.call(_TEX_STYLES, name)) {
    throw new TexUnsupportedError(`\\${name} must begin the math it styles, not be an argument`, name);
  }
  if (name === 'not' || name === 'slashed') {
    // \not=, \not\in, \not{D}; \slashed{D} (Feynman slash) is the same overlay.
    const target = name === 'slashed' ? _parseTexGroup(st) : _parseTexBase(st);
    if (!target || (target.t !== 'mo' && target.t !== 'mi') || target.c || [...(target.s || '')].length !== 1) {
      throw new TexUnsupportedError(`\\${name} must precede a single symbol`, name);
    }
    const negated = (name === 'not' && _TEX_NEGATED[target.s]) || `${target.s}\u0338`;
    return { t: target.t, ...(target.a && !target.limitEligible ? { a: target.a } : {}), s: negated };
  }
  if (Object.prototype.hasOwnProperty.call(_TEX_ENCLOSE, name)) {
    const body = _parseTexGroup(st);
    // \boxed sets its content in display style at full size, as amsmath does.
    const content = name === 'boxed' ? { t: 'mstyle', a: { displaystyle: 'true', scriptlevel: '0' }, c: [body] } : body;
    return { t: 'menclose', a: { notation: _TEX_ENCLOSE[name] }, c: [content] };
  }
  if (name === 'phantom') return { t: 'mphantom', c: [_parseTexGroup(st)] };
  if (name === 'color') {
    // Colour is not drawn: equations take the host's text colour, so they keep
    // the theme's contrast in light, dark and high-contrast modes. The switch
    // and its colour are accepted and the math renders in the text colour.
    _skipTexOptionalArg(st);
    _skipTexRawArg(st, name);
    return null;
  }
  if (name === 'textcolor') {
    _skipTexOptionalArg(st);
    _skipTexRawArg(st, name);
    return _parseTexGroup(st);
  }
  if (name === 'label') {
    _skipTexRawArg(st, name); // a cross-reference key: nothing to draw
    return null;
  }
  if (_TEX_IGNORED.has(name)) return null;
  if (name === 'tag') {
    const star = _starNext(st);
    if (!st.display) throw new TexUnsupportedError('\\tag is only typeset in display math', 'tag');
    if (st.rowDepth !== 1) throw new TexUnsupportedError('\\tag must be at the top level of a display equation', 'tag');
    if (st.tag != null) throw new TexUnsupportedError('an equation takes one \\tag', 'tag');
    const text = _parseTexTextArg(st).trim();
    st.tag = star ? text : `(${text})`;
    return null;
  }
  if (name === 'bra' || name === 'ket' || name === 'braket' || name === 'ketbra') {
    // Dirac notation (braket and physics packages), unstretched as \bra is.
    const fence = (s) => ({ t: 'mo', a: { fence: 'true', stretchy: 'false' }, s });
    const bar = { t: 'mo', a: { fence: 'true', stretchy: 'false', lspace: '0em', rspace: '0em' }, s: '|' };
    const first = _parseTexGroup(st);
    if (name === 'bra') return { t: 'mrow', c: [fence('⟨'), first, fence('|')] };
    if (name === 'ket') return { t: 'mrow', c: [fence('|'), first, fence('⟩')] };
    if (name === 'ketbra') {
      const second = _parseTexGroup(st);
      return { t: 'mrow', c: [fence('|'), first, fence('⟩'), fence('⟨'), second, fence('|')] };
    }
    // \braket{a}{b} (physics) or \braket{a|b} (braket: the bar is in the argument).
    if (_peekTok(st)?.k === 'lb') {
      const second = _parseTexGroup(st);
      return { t: 'mrow', c: [fence('⟨'), first, bar, second, fence('⟩')] };
    }
    return { t: 'mrow', c: [fence('⟨'), first, fence('⟩')] };
  }
  if (name === 'pmod' || name === 'pod') {
    // amsmath: 8mu (18mu in display), then (mod n) or (n).
    const modulus = _parseTexGroup(st);
    const c = [{ t: 'mspace', a: { width: st.display ? '1em' : '0.4444em' }, s: '' }, { t: 'mo', s: '(' }];
    if (name === 'pmod') c.push({ t: 'mi', s: 'mod' }, { t: 'mspace', a: { width: '0.3333em' }, s: '' });
    c.push(modulus, { t: 'mo', s: ')' });
    return { t: 'mrow', c };
  }
  if (name === 'bmod') return { t: 'mo', a: { lspace: '0.2778em', rspace: '0.2778em' }, s: 'mod' };
  if (name === 'colon') return { t: 'mo', a: { lspace: '0em', rspace: '0.1667em' }, s: ':' };
  if (Object.prototype.hasOwnProperty.call(_TEX_SPACED_RELATIONS, name)) {
    const thick = () => ({ t: 'mspace', a: { width: '0.2778em' }, s: '' });
    return { t: 'mrow', c: [thick(), { t: 'mo', s: _TEX_SPACED_RELATIONS[name] }, thick()] };
  }
  if (name === 'xrightarrow' || name === 'xleftarrow') {
    const below = _parseTexOptionalMath(st);
    const above = _parseTexGroup(st);
    const arrow = { t: 'mo', a: { stretchy: 'true' }, s: name === 'xrightarrow' ? '→' : '←' };
    return below ? { t: 'munderover', c: [arrow, below, above] } : { t: 'mover', c: [arrow, above] };
  }
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
  if (_TEX_ESCAPED.has(name)) return _bareDelimiter(name);
  if (name === 'frac' || name === 'dfrac' || name === 'tfrac' || name === 'cfrac') {
    const num = _parseTexGroup(st);
    const den = _parseTexGroup(st);
    // \dfrac and \cfrac are display-style fractions, \tfrac a text-style one.
    const style = name === 'frac' ? null : name === 'tfrac' ? 'false' : 'true';
    return { t: 'mfrac', ...(style ? { a: { displaystyle: style } } : {}), c: [num, den] };
  }
  if (name === 'binom' || name === 'dbinom' || name === 'tbinom') {
    const num = _parseTexGroup(st);
    const den = _parseTexGroup(st);
    const style = name === 'binom' ? {} : { displaystyle: name === 'dbinom' ? 'true' : 'false' };
    return {
      t: 'mrow',
      c: [
        { t: 'mo', a: { stretchy: 'true', fence: 'true', symmetric: 'false' }, s: '(' },
        { t: 'mfrac', a: { linethickness: '0', ...style }, c: [num, den] },
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
  if (name === 'mod') {
    // amsmath's \mod{n}: a space (18mu in display, 12mu inline), upright
    // "mod", two thin spaces, then the modulus.
    const modulus = _parseTexGroup(st);
    return {
      t: 'mrow',
      c: [
        { t: 'mspace', a: { width: st.display ? '1em' : '0.6667em' }, s: '' },
        { t: 'mi', s: 'mod' },
        { t: 'mspace', a: { width: '0.3333em' }, s: '' },
        modulus,
      ],
    };
  }
  if (name === 'text' || name === 'mbox') {
    return { t: 'mtext', s: _parseTexTextArg(st) };
  }
  if (Object.prototype.hasOwnProperty.call(_TEX_TEXT_FONTS, name)) {
    const variant = _TEX_TEXT_FONTS[name];
    const text = _parseTexTextArg(st);
    return variant ? { t: 'mtext', a: { mathvariant: variant }, s: _mathAlphanumeric(text, variant) } : { t: 'mtext', s: text };
  }
  if (name === 'operatorname') {
    // An operator name sets upright like \sin: a multi-letter <mi>.
    // \operatorname* takes limits, as \lim does.
    if (_starNext(st)) {
      return { t: 'mo', a: { movablelimits: 'true' }, s: _parseTexTextArg(st).trim(), limitEligible: true };
    }
    return { t: 'mi', s: _parseTexTextArg(st).trim(), fn: true };
  }
  if (Object.prototype.hasOwnProperty.call(_TEX_GREEK, name)) {
    return { t: 'mi', s: _TEX_GREEK[name] };
  }
  if (Object.prototype.hasOwnProperty.call(_TEX_ORD, name)) {
    return { t: 'mi', s: _TEX_ORD[name] };
  }
  if (Object.prototype.hasOwnProperty.call(_TEX_OP, name)) {
    const limitEligible = _TEX_LIMIT_OPERATORS.has(name);
    if (!limitEligible && _TEX_BARE_DELIMITERS.has(_TEX_OP[name])) return _bareDelimiter(_TEX_OP[name]);
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
      : { t: 'mi', s: name, fn: true };
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
      return _TEX_ASCII_OPERATORS[tk.v] ? { t: 'mo', s: _TEX_ASCII_OPERATORS[tk.v] } : _bareDelimiter(tk.v);
    case 'lbrack':
      return _bareDelimiter('[');
    case 'rbrack':
      return _bareDelimiter(']');
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
  // \sin^2 x: the scripted name is still the function the argument follows.
  const fn = base.fn ? { fn: true } : {};
  if (sub && sup) return { t: 'msubsup', c: [base, sub, sup], ...fn };
  if (sub) return { t: 'msub', c: [base, sub], ...fn };
  if (sup) return { t: 'msup', c: [base, sup], ...fn };
  return base;
}

// TeX's spacing around a function name (\log, \sin, \operatorname{…}), an
// Op atom: a thin space after an ordinary atom before it and before an
// ordinary atom after it; none next to an operator, relation, punctuation or
// opening delimiter, which bring their own. The name is followed by U+2061
// FUNCTION APPLICATION, so \log n reads "log of n", not "l o g n".
const _thinSpace = () => ({ t: 'mspace', a: { width: '0.1667em' }, s: '' });
const _isOrdinary = (node) => node && node.t !== 'mo' && node.t !== 'mspace';
const _closesLikeOrdinary = (node) => _isOrdinary(node) || (node?.t === 'mo' && /^[)\]}|‖⟩⌋⌉⟯⟧]$/.test(node.s || ''));

function _spaceFunctions(row) {
  if (!row.some((node) => node.fn)) return row;
  const out = [];
  row.forEach((node, index) => {
    if (!node.fn) {
      out.push(node);
      return;
    }
    if (_closesLikeOrdinary(out[out.length - 1])) out.push(_thinSpace());
    out.push(node);
    const next = row[index + 1];
    out.push(_isOrdinary(next) ? { t: 'mo', a: { lspace: '0em', rspace: '0.1667em' }, s: '\u2061' } : { t: 'mo', s: '\u2061' });
  });
  return out;
}

// `stopKind` halts on a token KIND; `stopCmd` halts on a `cmd` token by NAME (which
// is how \left…\right finds its closer without consuming it). A `}` ends only a
// braced row and a `]` only a root index; anywhere else a `]` is an ordinary
// bracket (the interval [0, 1]) and a stray `}` is an error.
// `continuation` parses the rest of a row already counted (after a style
// switch, or an equation environment's body): \tag stays at the top level.
function _parseTexRow(st, stopKind, stopCmd, stopMatrixBoundary = false, continuation = false) {
  if (!continuation) st.rowDepth = (st.rowDepth || 0) + 1;
  try {
    return _spaceFunctions(_parseTexRowItems(st, stopKind, stopCmd, stopMatrixBoundary, continuation));
  } finally {
    if (!continuation) st.rowDepth -= 1;
  }
}

function _parseTexRowItems(st, stopKind, stopCmd, stopMatrixBoundary, continuation) {
  const out = [];
  for (;;) {
    const tk = _peekTok(st);
    if (!tk) break;
    if (stopKind && tk.k === stopKind) break;
    if (stopCmd && tk.k === 'cmd' && tk.v === stopCmd) break;
    if (stopMatrixBoundary && ((tk.k === 'op' && tk.v === '&') ||
      (tk.k === 'cmd' && (tk.v === '\\' || tk.v === 'end')))) break;
    if (tk.k === 'rb') throw _unbalanced('braces');
    if (tk.k === 'cmd' && Object.prototype.hasOwnProperty.call(_TEX_STYLES, tk.v)) {
      // A style switch applies to the rest of its group.
      _nextTok(st);
      const rest = _parseTexRow(st, stopKind, stopCmd, stopMatrixBoundary, true);
      out.push({ t: 'mstyle', a: { ..._TEX_STYLES[tk.v] }, c: rest });
      break;
    }
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
  const st = { t: _tokTex(src), i: 0, src, display: !!display, rowDepth: 0, tag: null };
  let row = _parseTexRow(st, null);
  if (st.i < st.t.length) throw _unbalanced('delimiters');
  if (st.tag != null) {
    // \tag{…}: the equation centred, its label at the end of the line (CSS:
    // .math-semantic-blocks-table--tagged). The cell is display style, as the
    // equation is; a table cell would otherwise be compact.
    row = [{
      t: 'mtable',
      a: { class: 'math-semantic-blocks-table--tagged' },
      c: [{
        t: 'mtr',
        c: [
          { t: 'mtd', c: [] },
          { t: 'mtd', c: [{ t: 'mstyle', a: { displaystyle: 'true' }, c: row }] },
          { t: 'mtd', a: { class: 'math-semantic-blocks-tag' }, c: [{ t: 'mtext', s: st.tag }] },
        ],
      }],
    }];
  }
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

// --- Plain-text reading ------------------------------------------------------
//
// A readable Unicode approximation of a formula, for places that hold text
// only: a document or tab title, an aria-label, an SVG label, a PDF bookmark.
// Built from the same tree, so it reads what the MathML shows: \mathcal{L}
// is ℒ, x^2 is x², L_{\text{Gauge}} is L_Gauge, \frac{a}{b} is a/b.

const _SUPERSCRIPTS = {
  0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹',
  '+': '⁺', '−': '⁻', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ',
};
const _SUBSCRIPTS = {
  0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉',
  '+': '₊', '−': '₋', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
};
// Accent marks as combining characters, set after a one-character base.
const _COMBINING = {
  'ˆ': '\u0302', '¯': '\u0304', '→': '\u20d7', '˜': '\u0303', '˙': '\u0307', '¨': '\u0308',
  'ˊ': '\u0301', 'ˋ': '\u0300', '˘': '\u0306', 'ˇ': '\u030c', '˚': '\u030a',
};
// Relations and binary operators read with a space either side at the top
// level (x² + y₁ = z); inside a script they stay tight (∑_(i=1)).
const _SPACED_OPERATORS = new Set([...'=+−±∓×÷⋅∗≤≥≠≡≈≅∼≃∝≪≫<>→←↔⇒⇐⇔⟹⟸⟺↦∈∉∋⊂⊃⊆⊇∪∩∖∧∨⊕⊗⊙≔']);

function _scriptText(text, table, mark) {
  if (!text) return '';
  const chars = [...text];
  if (chars.every((ch) => Object.prototype.hasOwnProperty.call(table, ch))) return chars.map((ch) => table[ch]).join('');
  if (chars.length === 1 || /^[\p{L}\p{N}]+$/u.test(text)) return `${mark}${text}`;
  return `${mark}(${text})`;
}

const _grouped = (text) => ([...text].length > 1 && /[^\p{L}\p{N}.]/u.test(text) ? `(${text})` : text);

function _plainOf(node, depth = 0) {
  if (!node) return '';
  const kids = node.c || [];
  const inner = (child) => _plainOf(child, depth + 1);
  switch (node.t) {
    case 'mi': case 'mn': case 'mtext':
      return node.s || '';
    case 'mo':
      // Function application reads as the space TeX sets after a name (log n).
      if (node.s === '\u2061') return parseFloat(node.a?.rspace || '0') > 0 ? ' ' : '';
      return depth === 0 && _SPACED_OPERATORS.has(node.s) ? ` ${node.s} ` : node.s || '';
    case 'mspace':
      return parseFloat(node.a?.width || '0') >= 0.16 ? ' ' : '';
    case 'mphantom':
      return '';
    case 'msub': case 'munder':
      if (node.a?.accent === 'true' || kids[1]?.a?.stretchy === 'true') return inner(kids[0]);
      return inner(kids[0]) + _scriptText(inner(kids[1]), _SUBSCRIPTS, '_');
    case 'msup':
      return inner(kids[0]) + _scriptText(inner(kids[1]), _SUPERSCRIPTS, '^');
    case 'msubsup': case 'munderover': {
      // A big operator's limits, then a space before its operand (∑_(i=1)ⁿ i).
      const after = kids[0]?.a?.movablelimits ? ' ' : '';
      return inner(kids[0]) + _scriptText(inner(kids[1]), _SUBSCRIPTS, '_') + _scriptText(inner(kids[2]), _SUPERSCRIPTS, '^') + after;
    }
    case 'mover': {
      const base = inner(kids[0]);
      const mark = inner(kids[1]);
      if (node.a?.accent === 'true') return [...base].length === 1 && _COMBINING[mark] ? base + _COMBINING[mark] : base;
      if (kids[1]?.a?.stretchy === 'true') return base;
      return base + _scriptText(mark, _SUPERSCRIPTS, '^');
    }
    case 'mfrac':
      return `${_grouped(inner(kids[0]))}/${_grouped(inner(kids[1]))}`;
    case 'msqrt':
      return `√${_grouped(kids.map(inner).join(''))}`;
    case 'mroot':
      return `${_scriptText(inner(kids[1]), _SUPERSCRIPTS, '^')}√${_grouped(inner(kids[0]))}`;
    case 'mtable':
      return kids.map(inner).join('; ');
    case 'mtr':
      return kids.map(inner).filter(Boolean).join(' ');
    default:
      return kids.map((child) => _plainOf(child, depth)).join('');
  }
}

/** A readable Unicode approximation of `tex`; its source when it is outside the subset. */
export function texToPlainText(tex) {
  try {
    return _plainOf(_texToMathTree(tex, false)).replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')').trim();
  } catch (err) {
    if (err instanceof TexUnsupportedError) return String(tex == null ? '' : tex).trim();
    throw err;
  }
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
