// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://lushixiao.ccwu.cc',
  output: 'static',
  integrations: [sitemap()],
  markdown: {
    syntaxHighlight: {
      type: 'shiki',
      excludeLangs: ['mermaid'],
    },
    shikiConfig: {
      theme: 'css-variables',
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
