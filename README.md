# Domovid web

Landing page Domovid pre realitných maklérov: https://martinpecnik011.github.io/domovid-web/

Statický web v [Astro](https://astro.build) 5, nasadzovaný na GitHub Pages cez GitHub Actions.

## Štruktúra

- `src/pages/index.astro`: skladá stránku z komponentov
- `src/layouts/Base.astro`: `<html lang="sk">`, hlavička, fonty, globálne štýly; props `title`, `description`, `path`
- `src/components/`
  - `Seo.astro`: title, description, OG/Twitter, theme-color, favicon, canonical
  - `CookieConsent.astro`: zatiaľ prázdny zástupný komponent
  - `Stage.astro`: video pozadia scén (načítava `src/scripts/scenes.ts`)
  - `Nav.astro`, `Hero.astro` (#top), `HowItWorks.astro` (#ako), `Showcase.astro` (#ukazky), `Pricing.astro` (#cennik), `Footer.astro`
  - `LeadForm.astro`: formulár `#lead-form` (načítava `src/scripts/lead-form.ts`)
- `src/scripts/scenes.ts`: prepínanie video scén, parallax, náklon kariet
- `src/scripts/lead-form.ts`: validácia a odoslanie formulára; po úspechu vyšle `window` udalosť `domovid:lead`
- `src/config/site.ts`: **`FORM_ENDPOINT`** (URL Google Apps Script), WhatsApp číslo, URL webu, texty SEO
- `src/styles/global.css`: všetky štýly stránky
- `public/media/`: video pozadia (Kling, 720p) a ukážky z galérie; v kóde sa odkazujú s prefixom `import.meta.env.BASE_URL`
- `apps-script/`: backend formulára (Google Sheet + e-mail), návod v `apps-script/SETUP.md` (nezmenené)

Fonty (Archivo variable s osou šírky, Figtree, JetBrains Mono) sú self-hostované cez balíčky `@fontsource`, bez Google Fonts.

## Príkazy

```bash
npm install
npm run dev       # vývojový server: http://localhost:4321/domovid-web/
npm run build     # statický výstup do dist/ (+ sitemap)
npm run preview   # náhľad buildu z dist/
```

## Nasadenie

Workflow `.github/workflows/deploy.yml` zbuildí a nasadí web pri každom pushi na `main` (alebo ručne cez *Run workflow*).

Jednorazovo treba v GitHube prepnúť zdroj Pages: **Settings → Pages → Build and deployment → Source: GitHub Actions** (doteraz bolo „Deploy from a branch“). Kým sa to neprepne, Pages servíruje starý obsah z koreňa `main`.

## Zmena adresy formulára

Uprav `FORM_ENDPOINT` v `src/config/site.ts` (prázdny reťazec = formulár hlási „ešte nie je pripojený“) a pushni na `main`.
