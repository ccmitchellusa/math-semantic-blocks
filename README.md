# Math Semantic Blocks

A reusable ESM library that converts a bounded LaTeX math subset to native MathML. The converter has **no runtime dependencies** and does not import application or product code. Browsers render the result directly; no KaTeX, MathJax, or CDN is required.

## Install

Install the archive with `npm install /path/to/math-semantic-blocks-1.1.0.tgz`. Node.js 18 or newer is required. The converter works on its own. The optional Markdown-it plugin is an adapter for a `markdown-it` 14 instance supplied by the consuming application; Markdown-it is an optional peer dependency.

## Convert a formula

```js
import { texToMathML, texToMathMLNode, isRenderableTex, TexUnsupportedError } from 'math-semantic-blocks';

const markup = texToMathML(String.raw`\sqrt{x_1^2}`, { display: true });
if (!isRenderableTex(input)) {
  // Show an unsupported-formula message before saving or rendering.
}
try {
  texToMathML(input);
} catch (error) {
  if (error instanceof TexUnsupportedError) console.warn(error.message);
}
```

`texToMathML(tex, { display: true })` creates block MathML; the default is inline MathML. Unsupported commands throw `TexUnsupportedError`. Pass `{ onError: 'node' }` to return a visible MathML `<merror>` node instead of throwing.

`texToMathMLNode(tex, document, opts)` creates namespaced MathML DOM nodes directly. It is useful when the host should avoid parsing generated markup.

## Add math rendering to Markdown-it

```js
import MarkdownIt from 'markdown-it';
import { mathMLPlugin } from 'math-semantic-blocks';

const md = new MarkdownIt({ html: false }).use(mathMLPlugin);
const html = md.render(String.raw`Inline $x^2 + y^2 = z^2$.

$$
\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$`);
```

The plugin handles inline `$…$`, single-line `$$…$$`, and multiline display math whose delimiters occupy their own lines. It emits MathML, with text and attributes escaped. Keep the host product’s normal HTML sanitization policy in place when inserting rendered Markdown.

## Supported subset

The converter supports a bounded research and teaching notation profile:

- Matrices: `matrix`, `pmatrix`, `bmatrix`, `Bmatrix`, `vmatrix`, and `Vmatrix`.
- Derivations and piecewise definitions: `align`, `aligned`, `split`, `gather`, `gathered`, and `cases`.
- Calculus: vector calculus, partial derivatives, limits, single and multiple integrals, and closed contour/surface integrals.
- Statistics: expectation, probability, variance, covariance, correlation, distributions, independence, indicators, and binomial coefficients.
- AI/ML and linear algebra: `argmin`/`argmax`, tensor products, bold vectors, transpose notation, operator names, and common objective/optimizer formulas.
- Set and graph theory: membership, relations, set builders, graph/vertex/edge sets, degree, adjacency, distance, diameter, and girth.
- Stacked operator limits, explicit `\limits`/`\nolimits`, `\substack`, `\underset`, `\overbrace`, and `\underbrace`.
- Everyday symbols across the KaTeX/MathJax set: letterlike symbols (`\hbar`, `\Re`, `\aleph`, `\dagger`, …) as identifiers, amssymb operators, relations, negations and arrows, `\implies`/`\iff`, big operators (`\coprod`, `\bigoplus`, …), and `\not`/`\slashed` overlays.
- Sizing and spacing: `\big` … `\Bigg` (with `l`/`r`/`m`), `\pmod`, `\pod`, `\bmod`, `\mod`, `\colon`, `\phantom`, the style switches, `\dfrac`/`\tfrac`/`\cfrac`, `\dbinom`/`\tbinom`, `\xrightarrow`/`\xleftarrow`, `\operatorname*`.
- Annotation: `\boxed`, `\cancel`, `\bcancel`, `\xcancel` (`<menclose>`), `\tag`/`\tag*` in display math; `\label`, `\nonumber`, `\notag` are accepted and draw nothing; `\color`/`\textcolor` are accepted and draw nothing, so the formula keeps its host's text colour and theme contrast.
- Physics: Dirac notation (`\bra`, `\ket`, `\braket{a}{b}` and `\braket{a|b}`, `\ketbra`).
- More environments: `smallmatrix`, `array` with `l`/`c`/`r` columns, `equation`, `align*`, `gather*`, `multline`.

`test/fixtures/coverage.json` pins the whole subset (and what must stay unsupported); `npm test` checks it.

The converter is intentionally not a full LaTeX engine. `alignat`, `array` rules and `p{…}` columns, custom environments, package macros, and arbitrary user-defined commands remain unsupported. Unknown commands throw instead of silently producing misleading output. Each expression is limited to 8,192 characters and 128 nested groups; matrix, alignment, gather, and cases tables are bounded to 128 rows and 32 columns, and `substack` to 128 rows.

For aligned derivations, `cases`, `array` columns, `\tag` labels and the `\boxed`/`\cancel` enclosures, load the optional layout stylesheet:

```js
import 'math-semantic-blocks/mathml.css';
```

The converter also emits MathML `columnalign` hints for renderers that support them; the stylesheet supplies the same cell alignment in MathML Core browsers.

The Markdown representation for a display-math semantic block is native `$$…$$` syntax. This package handles math parsing and display; it does not include a general semantic-block registry, editor, or publishing pipeline.

## Source notice

The converter was extracted and adapted from Longleaf SaaS. See `SOURCE-NOTICE.txt` for provenance. This package is licensed under MIT; see `LICENSE`.

## Third-party licenses

The renderer has no vendored runtime dependencies. The optional `markdown-it` peer dependency is MIT-licensed; its license text is included in `THIRD-PARTY-LICENSES/markdown-it-MIT.txt`.
