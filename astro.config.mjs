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
  // Every script ships as an external file so the CSP can forbid inline scripts (see SecurityMeta.astro).
  vite: { build: { assetsInlineLimit: 0 } },
  integrations: [
    sitemap({
      // Exclude the PWA app and the client delivery page by path segment (not '/videa-z-fotiek/').
      filter: (page) => !/\/(app|video)\/?$/.test(new URL(page).pathname),
      serialize(item) {
        const path = new URL(item.url).pathname.replace(/^\/domovid-web\/?/, '').replace(/\/$/, '');
        const isHome = path === '';
        const isLegal = /^(ochrana-sukromia|podmienky|cookies)/.test(path);
        return {
          ...item,
          lastmod: buildDate,
          changefreq: isHome ? 'weekly' : 'monthly',
          priority: isHome ? 1.0 : isLegal ? 0.3 : 0.8,
        };
      },
    }),
  ],
});
