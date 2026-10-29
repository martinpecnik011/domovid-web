/**
 * Public base URL of the Cloudflare R2 bucket that holds the client deliveries (the public r2.dev URL,
 * see tools/README-dodanie.md). Set PUBLIC_DELIVERY_BASE at build time; the placeholder is only for local builds.
 */
export const DELIVERY_BASE = (import.meta.env.PUBLIC_DELIVERY_BASE || 'https://pub-bc98670f5e3646368728e7feaba801a7.r2.dev').replace(/\/$/, '');

/** A delivery id is an unguessable lowercase alphanumeric token (the folder name in the bucket). */
export const DELIVERY_ID_RE = /^[a-z0-9]{8,32}$/;

/** Shown instead of the download while the invoice is unpaid. Single source of the copy. */
export const LOCKED_TEXT = 'Stiahnutie v plnej kvalite sa odomkne po prijatí platby. Číslo účtu (IBAN) na úhradu vám pošleme.';

/** `${DELIVERY_BASE}/${id}/manifest.json`. All files below are relative to `${DELIVERY_BASE}/${id}/`. */
export interface DeliveryManifest {
  version: 1;
  id: string;
  client: string;
  title: string;
  /** ISO date-time. */
  created: string;
  /** false = downloads stay locked until the invoice is paid. */
  paid: boolean;
  /** Watermarked / lower quality preview shown in the player. */
  preview: { file: string; width: number; height: number };
  poster?: string;
  /** Optional landscape preview, shown under the portrait one. */
  preview_16x9?: { file: string; width: number; height: number };
  poster_16x9?: string;
  /** One or two entries: the 9:16 master ("Originál – plná kvalita (1080×1920)"), plus the 16:9 one when preview_16x9 is set. */
  downloads: { label: string; file: string; bytes: number }[];
  message?: string;
  /** Optional price shown next to the payment text while unpaid. `net` in EUR, `vat_rate` as a fraction (0.23). */
  price?: { label: string; net: number; vat_rate: number; reference: string };
}
