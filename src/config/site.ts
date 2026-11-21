/** Public site URL (GitHub Pages project site), with trailing slash. */
export const SITE_URL = 'https://domovid.sk/';

/** Who answers and from which address the confirmation e-mail comes (Apps Script runs under this account). */
/** Genitive for "od …" (from …). */
export const OWNER_FROM = 'Martina Pecníka';
export const CONTACT_EMAIL = 'info@domovid.sk';

/** Lead form endpoint: Google Apps Script web app (see apps-script/SETUP.md). Empty string = form not connected. */
export const FORM_ENDPOINT =
  'https://script.google.com/macros/s/AKfycbzexUP_IChSi1EapYybBYkF6GFofyCExTsUyVjhGq83aoW4dSc4WRfihGquqB2uX4Tf/exec';

export const SITE_TITLE = 'Domovid – videá, vizualizácie a obsah na siete pre realitných maklérov';
export const SITE_DESCRIPTION =
  'Z fotiek vašej ponuky urobíme video do 48 hodín, prázdny byt premeníme na zariadený a postaráme sa o obsah na vaše sociálne siete. Pre realitných maklérov, od 50 €.';
export const OG_TITLE = 'Domovid – videá, vizualizácie a sociálne siete pre makléra';

/* ---------- Structured data / discoverability (single source for page copy and JSON-LD) ---------- */

export const SITE_NAME = 'Domovid';
export const INSTAGRAM_URL = 'https://www.instagram.com/domo_vid/';
export const FACEBOOK_URL = 'https://www.facebook.com/1216967761499957';
export const YOUTUBE_URL = 'https://www.youtube.com/channel/UCWXzPKsNvPx8M2yosZ43k0Q';
export const TIKTOK_URL = 'https://www.tiktok.com/@domo_vid';
/** Square brand mark (512 × 512), path relative to the site root. */
export const LOGO_PATH = 'media/logo.png';
export const SERVICE_TYPE = 'Video z fotiek nehnuteľnosti pre realitných maklérov';
/** ISO 3166-1 country codes the service is offered in. */
export const AREA_SERVED = ['SK', 'CZ'];

/** Delivery promise used across the site (accusative after "do"). */
export const DELIVERY = '48 hodín';
/** We are not a company yet: paid work runs only on a student agreement (dohoda o brigádnickej práci študentov). */
export const STUDENT_AGREEMENT_FULL = 'dohoda o brigádnickej práci študentov';
/** Prices are what we get net; the gross pay on the agreement is net × this factor, so tax and possible contributions are covered. */
export const GROSS_FACTOR = 1.23;
/** Gross pay on the student agreement formatted the Slovak way, e.g. 61,50 €. */
export const grossPay = (net: number) =>
  (Math.round(net * GROSS_FACTOR * 100) / 100).toLocaleString('sk-SK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
/** Legacy VAT display still used by the app (/app/) price texts; the public web no longer shows VAT. */
export const VAT_RATE = 0.23;
export const withVat = (net: number) =>
  (Math.round(net * (1 + VAT_RATE) * 100) / 100).toLocaleString('sk-SK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
/** How payment works, one sentence per step (pricing page, FAQ, app). */
export const PAYMENT_STEPS = [
  'Prvé video na ukážku je zadarmo.',
  'Ďalšiu prácu robíme len na základe dohody o brigádnickej práci študentov, ktorú spolu podpíšeme pred začatím.',
  'Odmenu nám vyplatíte po odovzdaní hotovej práce.',
];
/** One-paragraph explanation of the prices under every price list. */
export const PAY_NOTE =
  `Zatiaľ nie sme firma ani platcovia DPH, preto spolupracujeme len na študentskú dohodu (${STUDENT_AGREEMENT_FULL}). Suma v cenníku je naša odmena v čistom. Hrubú odmenu na dohode nastavíme tak, aby po zrážkach (daň, prípadné odvody) vyšla práve táto suma, orientačne je to hrubá odmena uvedená pri cene. Podrobnosti si prejdeme pri podpise dohody.`;

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

export interface FaqItem {
  q: string;
  a: string;
}

/* ---------- Services (single source for navigation, cards and JSON-LD) ---------- */

export type ServiceId = 'video' | 'viz' | 'social';
export interface Service {
  id: ServiceId;
  label: string;
  /** Relative to the site base, e.g. 'videa-z-fotiek/'. */
  href: string;
  claim: string;
  short: string;
  fromPrice: number;
  fromUnit: string;
}

export const SERVICES: Service[] = [
  {
    id: 'video',
    label: 'Videá nehnuteľností',
    href: 'videa-z-fotiek/',
    claim: 'Video z fotiek vašej ponuky',
    short: 'Z 4–6 fotiek z mobilu vytvoríme video s pohybom kamery, strihom a hudbou do 48 hodín.',
    fromPrice: 50,
    fromUnit: 'video',
  },
  {
    id: 'viz',
    label: 'Vizualizácie',
    href: 'vizualizacie/',
    claim: 'Prázdny byt premeníme na zariadený',
    short: 'Z fotiek prázdnej nehnuteľnosti pripravíme zariadené interiéry, v ktorých si kupujúci vie predstaviť bývanie.',
    fromPrice: 62,
    fromUnit: 'video',
  },
  {
    id: 'social',
    label: 'Obsah na sociálne siete',
    href: 'socialne-siete/',
    claim: 'Obsah na vaše sociálne siete každý mesiac',
    short: 'Každý mesiac pripravíme videá na mieru pre vás aj vašich klientov, vy sa venujete predaju.',
    fromPrice: 290,
    fromUnit: 'mesiac',
  },
];

/** All prices in EUR, net (what we receive on the student agreement). Every page and every FAQ answer reads them from here. */
export const PRICES = {
  video: { single: 50, monthly: 140, monthlyCount: 4 },
  viz: { single: 62, monthly: 200, monthlyCount: 4, maxViz: 5 },
  social: {
    plans: [
      { videos: 10, price: 290 },
      { videos: 15, price: 390, featured: true },
      { videos: 30, price: 690 },
    ],
    commitmentMonths: 0,
  },
  addons: {
    social: [
      { id: 'voice', name: 'Klon hlasu', desc: 'Voiceover vaším hlasom', price: 40, unit: 'mesiac' },
      { id: 'twin', name: 'Digitálne dvojča', desc: 'Hlas aj avatar, obsahuje klon hlasu', price: 110, unit: 'mesiac' },
    ],
    video: [
      { id: 'formats', name: 'Oba formáty', desc: '9:16 aj 16:9', price: 10, unit: 'video' },
      { id: 'express', name: 'Expresne do 12 h', desc: 'Prednostné spracovanie', price: 15, unit: 'video' },
    ],
  },
  consentNote: 'Vyžaduje váš písomný súhlas s použitím hlasu a podoby.',
  payment: `Prvé video na ukážku je zadarmo. Ďalšia spolupráca prebieha len na študentskú dohodu (${STUDENT_AGREEMENT_FULL}) a odmenu vyplácate po odovzdaní hotovej práce.`,
} as const;

const V = PRICES.video;
const Z = PRICES.viz;
const S = PRICES.social;

/** Packages exactly as the pricing section states them (video service; read by the price components and Seo.astro). */
export const PRICING: PricePlan[] = [
  {
    name: 'Jedno video',
    price: V.single,
    unit: 'video',
    billing: '',
    description: 'Na jednu konkrétnu ponuku.',
    features: ['1 video do 48 hodín', 'Formát podľa vášho výberu: 9:16 alebo 16:9', 'Bez záväzku'],
  },
  {
    name: 'Mesačný balík',
    price: V.monthly,
    unit: 'mesiac',
    billing: 'mesiac',
    description: 'Pre pravidelné nové ponuky.',
    features: [`${V.monthlyCount} videá mesačne`, 'Formát podľa vášho výberu: 9:16 alebo 16:9', 'Prednostné spracovanie', 'Jednotný štýl'],
    featured: true,
  },
];

/** General FAQ for the home page. Rendered by FaqList.astro and emitted as FAQPage JSON-LD by Seo.astro. */
export const FAQ: FaqItem[] = [
  {
    q: 'Čo je Domovid?',
    a: 'Domovid je služba pre realitných maklérov. Z fotiek vašej ponuky urobíme video, prázdny byt premeníme na zariadený a postaráme sa o obsah na vaše sociálne siete. Nepotrebujete kameru, fotografa ani kameramana.',
  },
  {
    q: 'Prečo je video v inzeráte dôležité?',
    a: 'Inzerát bez videa medzi ostatnými rýchlo zanikne. Video zastaví posúvanie, zvýši počet dopytov a pomáha rýchlejšie predať.',
  },
  {
    q: 'Ako rýchlo dostanem hotové video?',
    a: `Do 48 hodín od prijatia fotiek. Mesačný balík má prednostné spracovanie, rýchlejšie spracovanie viete doobjednať aj k jednotlivému videu (expresne do 12 h, +${PRICES.addons.video[1].price} €).`,
  },
  {
    q: 'Koľko stojí video z fotiek?',
    a: `Jedno video stojí ${V.single} € a je bez záväzku. Mesačný balík stojí ${V.monthly} € mesačne a obsahuje ${V.monthlyCount} videá. Vizualizácie začínajú na ${Z.single} € za video.`,
  },
  {
    q: 'Aké fotky treba priložiť?',
    a: 'Stačí 4–6 fotiek z mobilu: exteriér, obývačka, kuchyňa a ďalšie miestnosti, ktoré chcete zvýrazniť. Profesionálny fotograf ani dobré osvetlenie nie sú nutné.',
  },
  {
    q: 'Čo ak sa mi výsledok nepáči?',
    a: 'Prvá verzia príde ako náhľad na schválenie. Ak niečo nesedí, upravíme to. Stiahnutie v plnej kvalite je možné až po vyplatení odmeny podľa študentskej dohody.',
  },
  {
    q: 'Ste firma?',
    a: `Zatiaľ nie. Sme študenti a kým nebudeme plnohodnotná firma, spolupracujeme na študentskú dohodu (${STUDENT_AGREEMENT_FULL}). Viac na stránke O nás.`,
  },
  {
    q: 'Ako začať?',
    a: 'Kliknite na „Chcem ponuku“, prihláste sa a vyplňte krátky dotazník so 4–6 fotkami. Dopyt sa uloží do vášho súkromného chatu s nami a tam vám pošleme aj prvé video na ukážku, zadarmo.',
  },
];

export const FAQ_VIDEO: FaqItem[] = [
  {
    q: 'Prečo má zmysel video v inzeráte?',
    a: 'Inzerát len s fotkami medzi ostatnými zanikne. Video zastaví posúvanie, ukáže priestor v pohybe a prináša viac dopytov aj rýchlejší predaj.',
  },
  {
    q: 'Ako rýchlo dostanem hotové video?',
    a: `Do 48 hodín od prijatia fotiek. Ak to potrebujete ešte skôr, expresné spracovanie do 12 h je za +${PRICES.addons.video[1].price} € za video.`,
  },
  {
    q: 'Aké fotky potrebujete?',
    a: '4–6 fotiek z mobilu úplne stačí: exteriér, obývačka, kuchyňa a ďalšie miestnosti, ktoré chcete zvýrazniť. Nepotrebujete fotografa ani špeciálne osvetlenie.',
  },
  {
    q: 'Koľko video stojí?',
    a: `Jedno video stojí ${V.single} €, bez záväzku. Mesačný balík stojí ${V.monthly} € mesačne a zahŕňa ${V.monthlyCount} videá, teda ${V.monthly / V.monthlyCount} € za video.`,
  },
  {
    q: 'Môžem dostať video na výšku aj na šírku?',
    a: `Formát si vyberiete: 9:16 na sociálne siete alebo 16:9 na realitný portál a web. Oba formáty spolu sú za +${PRICES.addons.video[0].price} € za video.`,
  },
  {
    q: 'Čo ak sa mi výsledok nepáči?',
    a: 'Prvá verzia príde ako náhľad na schválenie. Ak niečo nesedí, upravíme to. Plnú kvalitu si stiahnete po schválení a vyplatení odmeny podľa študentskej dohody.',
  },
];

export const FAQ_VIZ: FaqItem[] = [
  {
    q: 'Prečo sa prázdny byt zle predáva?',
    a: 'Kupujúci si v prázdnych miestnostiach ťažko predstaví, ako sa tam bude žiť. Zariadený interiér im to ukáže a ponuka vďaka tomu získa viac dopytov.',
  },
  {
    q: 'Čo presne dostanem?',
    a: `Video, v ktorom sa prázdna miestnosť premení na zariadenú. Na jednu nehnuteľnosť pripravíme najviac ${Z.maxViz} vizualizácií.`,
  },
  {
    q: 'Koľko vizualizácie stoja?',
    a: `Jedno video stojí ${Z.single} €. Mesačný balík stojí ${Z.monthly} € mesačne a zahŕňa ${Z.monthlyCount} nehnuteľnosti mesačne.`,
  },
  {
    q: 'Aké podklady potrebujete?',
    a: 'Stačí 4–6 fotiek prázdnych miestností z mobilu. Dobré osvetlenie pomôže, ale nie je podmienkou.',
  },
  {
    q: 'Ako rýchlo to bude hotové?',
    a: 'Náhľad na schválenie dostanete do 48 hodín od prijatia fotiek. Ak niečo nesedí, upravíme to.',
  },
  {
    q: 'Je v ponuke jasné, že ide o vizualizáciu?',
    a: 'Áno. Odporúčame ponuku označiť ako vizualizáciu, aby kupujúci vedel, že zariadenie je ukážkou možností. Pomôžeme vám s vhodným označením.',
  },
];

export const FAQ_SOCIAL: FaqItem[] = [
  {
    q: 'Nemám čas na sociálne siete. Čo s tým?',
    a: 'Presne na to je služba určená. Každý mesiac pripravíme videá na mieru a plán publikovania, vy sa venujete predaju. Publikovať môžete sami, alebo aj za vás.',
  },
  {
    q: 'Aké balíky ponúkate?',
    a: `${S.plans.map((p) => `${p.videos} videí za ${p.price} €`).join(', ')} mesačne v čistom. Pri väčšom balíku vychádza video lacnejšie: ${S.plans.map((p) => `${p.price / p.videos} €`).join(', ')} za video.`,
  },
  {
    q: 'Čo je v cene každého videa?',
    a: 'Scenár, strih, titulky, hudba s licenciou, publikačný plán a 1 kolo úprav na video. Balík s 30 videami obsahuje aj voiceover (bez AI portrétu).',
  },
  {
    q: 'Máte nejakú viazanosť?',
    a: 'Nie. Obsah na sociálne siete je bez viazanosti, balík môžete kedykoľvek zmeniť alebo ukončiť.',
  },
  {
    q: 'Môžem mať obsah s vlastným hlasom alebo avatarom?',
    a: `Áno. Klon hlasu je +${PRICES.addons.social[0].price} € mesačne, digitálne dvojča (hlas aj avatar) +${PRICES.addons.social[1].price} € mesačne. ${PRICES.consentNote}`,
  },
  {
    q: 'Ako prebieha schvaľovanie a platba?',
    a: `Videá vám pošleme na schválenie a úpravy riešime cez súkromný chat v aplikácii Domovid. ${PRICES.payment}`,
  },
];

export const FAQ_PRICING: FaqItem[] = [
  {
    q: 'Prečo pri cenách nie je DPH?',
    a: `Zatiaľ nie sme firma ani platcovia DPH. Spolupracujeme len na študentskú dohodu (${STUDENT_AGREEMENT_FULL}). Hlavná suma je naša odmena v čistom, pod ňou je orientačná hrubá odmena na dohode.`,
  },
  {
    q: 'Koľko stojí video z fotiek?',
    a: `Jedno video ${V.single} €. Mesačný balík ${V.monthly} € mesačne zahŕňa ${V.monthlyCount} videá. Sumy sú v čistom.`,
  },
  {
    q: 'Koľko stoja vizualizácie?',
    a: `Jedno video ${Z.single} €. Mesačný balík ${Z.monthly} € mesačne zahŕňa ${Z.monthlyCount} nehnuteľnosti, na každú najviac ${Z.maxViz} vizualizácií.`,
  },
  {
    q: 'Koľko stojí obsah na sociálne siete?',
    a: `${S.plans.map((p) => `${p.videos} videí ${p.price} €`).join(', ')} mesačne, bez viazanosti.`,
  },
  {
    q: 'Aké doplnky si viem priobjednať?',
    a: `Pri videách: oba formáty +${PRICES.addons.video[0].price} € a expresne do 12 h +${PRICES.addons.video[1].price} € za video. Pri sociálnych sieťach: klon hlasu +${PRICES.addons.social[0].price} € a digitálne dvojča +${PRICES.addons.social[1].price} € mesačne. Sumy sú v čistom.`,
  },
  {
    q: 'Ako platím?',
    a: `${PAYMENT_STEPS.join(' ')} Odmenu vyplácate ako pri každej dohode, na účet študenta.`,
  },
];
