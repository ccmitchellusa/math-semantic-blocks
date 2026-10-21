import MarkdownIt from 'markdown-it';
import { mathMLPlugin } from '../index.js';

const md = new MarkdownIt({ html: false }).use(mathMLPlugin);
const source = String.raw`Euler's identity: $e^{i\pi} + 1 = 0$.

$$
\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$`;

const researchSource = String.raw`A gradient update and piecewise activation:

$$
\begin{aligned}
\theta_{t+1} &= \theta_t - \eta \nabla_\theta \mathcal{L}(\theta_t) \\
\operatorname{ReLU}(x) &= \begin{cases} 0 & x \le 0 \\ x & x > 0 \end{cases}
\end{aligned}
$$

Attention and tensor notation: $\operatorname{Attention}(Q,K,V)=\operatorname{softmax}(\frac{QK^\top}{\sqrt{d_k}})V,\quad A\odot B$`;

console.log(md.render(source));
console.log(md.render(researchSource));
