/**
 * Per-caller discount codes. Each caller hands their code only to customers they called;
 * the code travels with the lead into the "Zľavový kód" Sheet column, so the monthly report
 * can count customers and paying customers per caller. The discount itself is applied on the invoice.
 *
 * Key = code (upper case, no spaces), value = caller's name. Empty map = the
 * "Mám zľavový kód" toggle is not rendered at all.
 */
export const DISCOUNT_PERCENT = 10;

export const DISCOUNT_CODES: Record<string, string> = {
  T10: 'Tee',
  D10: 'Dominik',
  F10: 'Filip',
};

/** How a typed code is compared and stored: trimmed, inner spaces removed, upper case. */
export const normalizeCode = (raw: string) => raw.replace(/\s+/g, '').toUpperCase();

/** Letter O and digit 0 look alike on the phone, so "T1O" and "T10" are the same code. */
const fold = (raw: string) => normalizeCode(raw).replace(/O/g, '0');
const BY_FOLDED = new Map(Object.keys(DISCOUNT_CODES).map((code) => [fold(code), code]));

/** The code as listed in DISCOUNT_CODES (e.g. "t1o" → "T10"), or '' when unknown. */
export const canonicalCode = (raw: string) => BY_FOLDED.get(fold(raw)) ?? '';
