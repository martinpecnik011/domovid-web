// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// GitHub Pages with the custom domain https://domovid.sk/ (public/CNAME)
const buildDate = new Date().toISOString();

export default defineConfig({
  site: 'https://domovid.sk',
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
        const path = new URL(item.url).pathname.replace(/^\//, '').replace(/\/$/, '');
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
