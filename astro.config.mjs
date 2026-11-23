// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import { includeInSitemap } from './src/lib/sitemap-filter.mjs';

export default defineConfig({
  site: 'https://lushixiao.cn',
  output: 'static',
  integrations: [react(), sitemap({
    filter: includeInSitemap,
    customPages: ['https://lushixiao.cn/dsh-board/'],
  })],
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
