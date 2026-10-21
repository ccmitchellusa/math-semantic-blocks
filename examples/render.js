import MarkdownIt from 'markdown-it';
import { mathMLPlugin } from '../index.js';

const md = new MarkdownIt({ html: false }).use(mathMLPlugin);
const source = String.raw`Euler's identity: $e^{i\pi} + 1 = 0$.

$$
\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$`;
console.log(md.render(source));
