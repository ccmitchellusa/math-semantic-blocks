// The pinned subset (test/fixtures/coverage.json): every renderable entry
// typesets to MathML, every unsupported one throws TexUnsupportedError.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TexUnsupportedError, isRenderableTex, texToMathML } from '../src/mathml.js';

const COVERAGE = JSON.parse(readFileSync(new URL('./fixtures/coverage.json', import.meta.url), 'utf8'));
const GROUPS = Object.keys(COVERAGE).filter((key) => Array.isArray(COVERAGE[key]) && key !== 'unsupported');

test('every pinned construct typesets', () => {
  const failures = [];
  for (const group of GROUPS) {
    for (const tex of COVERAGE[group]) {
      for (const display of group === 'display_only' ? [true] : [false, true]) {
        try {
          const mathml = texToMathML(tex, { display });
          if (!mathml.startsWith('<math') || mathml.includes('<merror')) failures.push(`${group}: ${tex}`);
        } catch (error) {
          failures.push(`${group}: ${tex} (${error.message})`);
        }
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('every pinned unsupported construct throws TexUnsupportedError', () => {
  for (const tex of COVERAGE.unsupported) {
    assert.equal(isRenderableTex(tex), false, tex);
    assert.throws(() => texToMathML(tex), TexUnsupportedError, tex);
  }
});

test('notation examples', () => {
  const inner = (tex, opts) => texToMathML(tex, opts).replace(/^<math[^>]*>|<\/math>$/g, '');
  assert.match(inner('i\\hbar \\frac{\\partial}{\\partial t}\\Psi'), /^<mi>i<\/mi><mi>ℏ<\/mi><mfrac>/);
  assert.equal(inner('\\not\\in \\not= \\slashed{D}'), '<mo>∉</mo><mo>≠</mo><mi>D̸</mi>');
  assert.equal(inner('\\color{red} x'), '<mi>x</mi>');
  assert.match(inner('E \\tag{1}', { display: true }), /class="math-semantic-blocks-table--tagged"/);
  assert.throws(() => texToMathML('E \\tag{1}'), /only typeset in display math/);
  assert.match(texToMathML('a \\mod n'), /<mspace width="0.6667em"><\/mspace><mi>mod<\/mi>/);
  assert.match(texToMathML('\\epsilon \\phi'), /<mi>ϵ<\/mi><mi>ϕ<\/mi>/);
});

test('bare delimiters keep their size; function names take operator spacing', () => {
  const inner = (tex) => texToMathML(tex).replace(/^<math[^>]*>|<\/math>$/g, '');
  assert.match(inner('f(x)'), /<mo stretchy="false">\(<\/mo>/);
  assert.doesNotMatch(inner('\\left( x \\right)'), /stretchy="false"/);
  assert.equal(inner('O(n \\log n)'),
    '<mi>O</mi><mo stretchy="false">(</mo><mi>n</mi><mspace width="0.1667em"></mspace><mi>log</mi>'
    + '<mo lspace="0em" rspace="0.1667em">\u2061</mo><mi>n</mi><mo stretchy="false">)</mo>');
});

test('texToPlainText reads a formula as readable Unicode text', async () => {
  const { texToPlainText } = await import('../src/mathml.js');
  assert.equal(texToPlainText('\\mathcal{L}_{\\text{Gauge}}'), 'ℒ_Gauge');
  assert.equal(texToPlainText('x^2 + y_1 = z'), 'x² + y₁ = z');
  assert.equal(texToPlainText('O(n \\log n)'), 'O(n log n)');
  assert.equal(texToPlainText('\\href{x}{y}'), '\\href{x}{y}');
});
