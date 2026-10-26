// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// GitHub Pages project site: https://martinpecnik011.github.io/domovid-web/
const buildDate = new Date().toISOString();

export default defineConfig({
  site: 'https://martinpecnik011.github.io',
  base: '/domovid-web',
  trailingSlash: 'ignore',
  compressHTML: true,
  build: { inlineStylesheets: 'auto' },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/video'),
      serialize(item) {
        const isHome = /\/domovid-web\/?$/.test(item.url);
        return {
          ...item,
          lastmod: buildDate,
          changefreq: isHome ? 'weekly' : 'yearly',
          priority: isHome ? 1.0 : 0.3,
        };
      },
    }),
  ],
});
