/** Public site URL (GitHub Pages project site), with trailing slash. */
export const SITE_URL = 'https://martinpecnik011.github.io/domovid-web/';

/** Who answers and from which address the confirmation e-mail comes (Apps Script runs under this account). */
/** Genitive for "od …" (from …). */
export const OWNER_FROM = 'Martina Pecníka';
export const CONTACT_EMAIL = 'martinpecnik011@gmail.com';

/** Lead form endpoint: Google Apps Script web app (see apps-script/SETUP.md). Empty string = form not connected. */
export const FORM_ENDPOINT =
  'https://script.google.com/macros/s/AKfycbzexUP_IChSi1EapYybBYkF6GFofyCExTsUyVjhGq83aoW4dSc4WRfihGquqB2uX4Tf/exec';

export const SITE_TITLE = 'Domovid – video pre realitných maklérov';
export const SITE_DESCRIPTION =
  'Z fotiek nehnuteľnosti urobíme video pre Instagram aj inzerát do 24 hodín. Pre realitných maklérov.';
export const OG_TITLE = 'Domovid – z fotiek video, ktoré predáva';

/* ---------- Structured data / discoverability (single source for page copy and JSON-LD) ---------- */

export const SITE_NAME = 'Domovid';
export const INSTAGRAM_URL = 'https://www.instagram.com/domo_vid/';
export const FACEBOOK_URL = 'https://www.facebook.com/1216967761499957';
/** Square brand mark (512 × 512), path relative to the site root. */
export const LOGO_PATH = 'media/logo.png';
export const SERVICE_TYPE = 'Video z fotiek nehnuteľnosti pre realitných maklérov';
/** ISO 3166-1 country codes the service is offered in. */
export const AREA_SERVED = ['SK', 'CZ'];

export interface PricePlan {
  name: string;
  /** Price in EUR. */
  price: number;
  /** Display unit after the price, e.g. "video". */
  unit: string;
  /** schema.org UnitPriceSpecification unitText; empty = one-off price. */
  billing: '' | 'mesiac';
  description: string;
  features: string[];
  featured?: boolean;
}

/** Packages exactly as the pricing section states them. */
export const PRICING: PricePlan[] = [
  {
    name: 'Jedno video',
    price: 50,
    unit: 'video',
    billing: '',
    description: 'Na jednu konkrétnu ponuku.',
    features: ['1 video do 24 hodín', 'Formát podľa teba: 9:16 alebo 16:9', 'Bez záväzku'],
  },
  {
    name: 'Mesačný balík',
    price: 140,
    unit: 'mesiac',
    billing: 'mesiac',
    description: 'Pre pravidelné nové ponuky.',
    features: ['4 videá mesačne', 'Formát podľa teba: 9:16 alebo 16:9', 'Prednostné spracovanie', 'Jednotný štýl'],
    featured: true,
  },
];

export interface FaqItem {
  q: string;
  a: string;
}

/** Rendered by Faq.astro and emitted as FAQPage JSON-LD by Seo.astro — keep them identical. */
export const FAQ: FaqItem[] = [
  {
    q: 'Čo je Domovid?',
    a: 'Domovid je služba pre realitných maklérov, kancelárie a developerské projekty. Z fotiek nehnuteľnosti urobíme video na výšku aj na šírku s pohybmi kamery, strihom a hudbou. Netreba kameru, fotografa ani kameramana.',
  },
  {
    q: 'Ako rýchlo dostanem hotové video?',
    a: 'Do 24 hodín od prijatia fotiek. Mesačný balík má prednostné spracovanie.',
  },
  {
    q: 'Koľko stojí video z fotiek?',
    a: 'Jedno video stojí 50 € + DPH a je bez záväzku. Mesačný balík stojí 140 € + DPH mesačne a obsahuje 4 videá, prednostné spracovanie a jednotný štýl.',
  },
  {
    q: 'Aké fotky mám poslať?',
    a: '4–6 fotiek: exteriér, obývačka, kuchyňa a ďalšie miestnosti, ktoré chceš zvýrazniť. Stačí mobil, osvetlenie nevadí.',
  },
  {
    q: 'Kde môžem video použiť?',
    a: 'Formát si vyberieš ty. Vertikálne 9:16 je na sociálne siete (Instagram, Facebook, TikTok, Reels). Na šírku 16:9 je na realitný portál, web alebo YouTube. Môžeš chcieť aj oba formáty.',
  },
  {
    q: 'Čo ak sa mi výsledok nepáči?',
    a: 'Prvá verzia príde s vodoznakom na posúdenie. Ak niečo nesedí, upravíme to. Čistú verziu dostaneš až po tvojom potvrdení.',
  },
  {
    q: 'Ako začať?',
    a: 'Vyplň formulár na tejto stránke a prilož 4–6 fotiek. Potvrdenie ti hneď príde e-mailom od Martina Pecníka (martinpecnik011@gmail.com) a hotové video ti pošleme na WhatsApp.',
  },
];
