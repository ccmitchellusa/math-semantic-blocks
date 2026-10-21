# Math Semantic Blocks

A reusable ESM library that converts a bounded LaTeX math subset to native MathML. The converter has **no runtime dependencies** and does not import application or product code. Browsers render the result directly; no KaTeX, MathJax, or CDN is required.

## Install

Install the archive with `npm install /path/to/math-semantic-blocks-1.0.0.tgz`. Node.js 18 or newer is required. The converter works on its own. The optional Markdown-it plugin is an adapter for a `markdown-it` 14 instance supplied by the consuming application; Markdown-it is an optional peer dependency.

## Convert a formula

```js
import { texToMathML, isRenderableTex, TexUnsupportedError } from 'math-semantic-blocks';

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

The converter supports common identifiers and numbers, Greek letters, fractions, roots, scripts, accents, scalable delimiters, common operators and relations, function names, and math alphabets. It is intentionally not a full LaTeX engine. Environments such as `matrix` and `align`, row breaks, and stacked `\limits` are unsupported. Unknown commands throw instead of silently producing misleading output.

The Markdown representation for a display-math semantic block is native `$$…$$` syntax. This package handles math parsing and display; it does not include a semantic-block registry, editor, or publishing pipeline.

## Source notice

The converter was extracted and adapted from Longleaf SaaS. See `SOURCE-NOTICE.txt`; source-project copyright and licensing continue to apply. This archive does not grant a separate open-source license.

## Third-party licenses

The renderer has no vendored runtime dependencies. The optional `markdown-it` peer dependency is MIT-licensed; its license text is included in `THIRD-PARTY-LICENSES/markdown-it-MIT.txt`.
