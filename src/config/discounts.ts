/**
 * Per-caller discount codes. Each caller hands their code only to customers they called;
 * the code travels with the lead into the "Zľavový kód" Sheet column, so the monthly report
 * can count customers and paying customers per caller. The discount itself is applied on the invoice.
 *
 * Key = code (upper case, no spaces), value = caller's name. Empty map = the
 * "Mám zľavový kód" toggle is not rendered at all.
 */
export const DISCOUNT_PERCENT = 10;

export const DISCOUNT_CODES: Record<string, string> = {};

/** How a typed code is compared and stored: trimmed, inner spaces removed, upper case. */
export const normalizeCode = (raw: string) => raw.replace(/\s+/g, '').toUpperCase();

export const isValidCode = (raw: string) => Object.hasOwn(DISCOUNT_CODES, normalizeCode(raw));
