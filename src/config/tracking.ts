/**
 * Tracking IDs. Empty string = that tracker is never loaded and is left out of the cookie banner
 * and the cookie/privacy pages.
 *
 * How to fill (pick one):
 *  1. Paste the ID between the quotes below, e.g. `|| 'G-ABC123XYZ9'` / `|| '1234567890123456'`.
 *  2. Or set it at build time without touching code: `PUBLIC_GA4_ID=G-ABC123XYZ9 PUBLIC_META_PIXEL_ID=123... npm run build`
 *     (an env value wins over the constant).
 *
 * GA4_ID: Google Analytics 4 → Admin → Data streams → Web → "Measurement ID" (starts with G-).
 * META_PIXEL_ID: Meta Events Manager → Data sources → your Pixel → "Dataset ID / Pixel ID" (digits only).
 *
 * Neither tracker loads before the visitor consents (see src/scripts/consent.ts).
 */
export const GA4_ID: string = (import.meta.env.PUBLIC_GA4_ID || '').trim() || '';
export const META_PIXEL_ID: string = (import.meta.env.PUBLIC_META_PIXEL_ID || '').trim() || '';

/** Bump when the consent categories or their meaning change — everyone is asked again. */
export const CONSENT_VERSION = 1;
export const CONSENT_KEY = 'domovid-consent';
/** Re-ask after this many days (12 months). */
export const CONSENT_MAX_AGE_DAYS = 365;
