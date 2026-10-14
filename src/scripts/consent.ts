// Cookie consent (GDPR / ePrivacy) with Google Consent Mode v2 in strict mode:
// consent defaults are queued first, and neither gtag.js nor the Meta Pixel is requested
// until the visitor grants the matching category. Banner markup lives in CookieConsent.astro.
import { GA4_ID, META_PIXEL_ID, CONSENT_KEY, CONSENT_VERSION, CONSENT_MAX_AGE_DAYS } from '../config/tracking';

type Choice = { v: number; analytics: boolean; marketing: boolean; ts: number };
type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  push: Fbq;
  loaded: boolean;
  version: string;
};

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
    fbq?: Fbq;
    _fbq?: Fbq;
    domovidConsent: { open: () => void; get: () => Choice | null };
  }
}

const HAS_GA = GA4_ID !== '';
const HAS_META = META_PIXEL_ID !== '';

// --- Consent Mode v2 defaults (before anything Google can load) ---
window.dataLayer = window.dataLayer || [];
window.gtag = function gtag() {
  // gtag.js expects the real `arguments` object, not an array.
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments);
};
window.gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  functionality_storage: 'granted',
  security_storage: 'granted',
  wait_for_update: 500,
});

// --- Storage ---
function read(): Choice | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<Choice>;
    if (c.v !== CONSENT_VERSION || typeof c.ts !== 'number') return null;
    if (Date.now() - c.ts > CONSENT_MAX_AGE_DAYS * 864e5) return null;
    return { v: c.v, analytics: c.analytics === true, marketing: c.marketing === true, ts: c.ts };
  } catch {
    return null;
  }
}

function write(c: Choice) {
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(c));
  } catch {
    // Storage blocked: the choice applies to this page view only, the banner shows again next time.
  }
}

// --- Loaders ---
let gaLoaded = false;
let metaLoaded = false;

function loadScript(src: string) {
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

function loadGa() {
  if (!HAS_GA || gaLoaded) return;
  gaLoaded = true;
  window.gtag('consent', 'update', { analytics_storage: 'granted' });
  loadScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA4_ID));
  window.gtag('js', new Date());
  window.gtag('config', GA4_ID, {
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
}

function loadMeta() {
  if (!HAS_META || metaLoaded) return;
  metaLoaded = true;
  // Equivalent of Meta's official base snippet, without the eager inline loader.
  if (!window.fbq) {
    const n = function (...args: unknown[]) {
      if (n.callMethod) n.callMethod(...args);
      else n.queue.push(args);
    } as Fbq;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
    window.fbq = n;
    window._fbq = n;
  }
  loadScript('https://connect.facebook.net/en_US/fbevents.js');
  window.fbq!('consent', 'grant');
  window.fbq!('init', META_PIXEL_ID);
  window.fbq!('track', 'PageView');
}

function apply(c: Choice) {
  if (c.analytics) loadGa();
  if (c.marketing) {
    if (HAS_GA) {
      window.gtag('consent', 'update', { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' });
    }
    loadMeta();
  }
}

function clearTrackerCookies() {
  const names = document.cookie
    .split(';')
    .map((p) => p.split('=')[0].trim())
    .filter((n) => n === '_fbp' || n === '_fbc' || n === '_ga' || n.startsWith('_ga_') || n === '_gid');
  const host = location.hostname;
  for (const name of names) {
    for (const domain of ['', host, '.' + host]) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain ? '; domain=' + domain : ''}`;
    }
  }
}

// --- UI ---
const root = document.getElementById('cc');
const panel = document.getElementById('cc-settings');
const boxA = document.getElementById('cc-analytics') as HTMLInputElement | null;
const boxM = document.getElementById('cc-marketing') as HTMLInputElement | null;
let current = read();
let lastFocus: HTMLElement | null = null;

function reserveSpace() {
  // Keep the page end (form submit, footer) reachable above the fixed banner.
  document.body.style.paddingBottom = root && !root.hidden ? root.offsetHeight + 16 + 'px' : '';
}

function show(withSettings: boolean) {
  if (!root || !panel) return;
  root.hidden = false;
  panel.hidden = !withSettings;
  root.dataset.mode = withSettings ? 'settings' : 'banner';
  if (boxA) boxA.checked = current?.analytics ?? false;
  if (boxM) boxM.checked = current?.marketing ?? false;
  reserveSpace();
}

function hide() {
  if (!root) return;
  root.hidden = true;
  reserveSpace();
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  lastFocus = null;
}

function decide(analytics: boolean, marketing: boolean) {
  const prev = current;
  const next: Choice = {
    v: CONSENT_VERSION,
    analytics: HAS_GA && analytics,
    marketing: HAS_META && marketing,
    ts: Date.now(),
  };
  write(next);
  current = next;
  const revoked = !!prev && ((prev.analytics && !next.analytics) || (prev.marketing && !next.marketing));
  if (revoked) {
    window.gtag('consent', 'update', {
      analytics_storage: next.analytics ? 'granted' : 'denied',
      ad_storage: next.marketing ? 'granted' : 'denied',
      ad_user_data: next.marketing ? 'granted' : 'denied',
      ad_personalization: next.marketing ? 'granted' : 'denied',
    });
    if (window.fbq && !next.marketing) window.fbq('consent', 'revoke');
    clearTrackerCookies();
    location.reload();
    return;
  }
  apply(next);
  hide();
}

function open() {
  lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  show(true);
  (boxA && !boxA.closest('[hidden]') ? boxA : document.getElementById('cc-title'))?.focus();
}

root?.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-cc]');
  if (!btn) return;
  const act = btn.dataset.cc;
  if (act === 'accept') decide(true, true);
  else if (act === 'reject') decide(false, false);
  else if (act === 'save') decide(!!boxA?.checked, !!boxM?.checked);
  else if (act === 'settings') {
    show(true);
    (boxA && !boxA.closest('[hidden]') ? boxA : boxM)?.focus();
  }
});

root?.addEventListener('keydown', (e) => {
  // Escape closes the reopened panel only once a choice exists (the first choice must be explicit).
  if (e.key === 'Escape' && current) hide();
});

document.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest('[data-cc-open]');
  if (t) {
    e.preventDefault();
    open();
  }
});

window.addEventListener('resize', reserveSpace);

window.addEventListener('domovid:lead', () => {
  if (current?.marketing && metaLoaded && window.fbq) window.fbq('track', 'Lead');
  if (current?.analytics && gaLoaded) window.gtag('event', 'generate_lead');
});

window.domovidConsent = { open, get: () => current };

if (current) apply(current);
else show(false);
