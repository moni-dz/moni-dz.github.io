import { defineConfig } from 'astro/config';
import solid from '@astrojs/solid-js';
import mermaid from 'astro-mermaid';
import remarkMath from 'remark-math';
import rehypeMathjax from 'rehype-mathjax';

export default defineConfig({
  integrations: [solid({ devtools: true }), mermaid()],
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeMathjax],
  },
  output: 'static',
  site: 'https://moni-dz.github.io',
});
