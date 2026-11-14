export type Attrs = Record<string, string | boolean | undefined | ((e: Event) => void)>;
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Node | string | null)[]): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids) if (c !== null) n.append(c); // strings become text nodes: user text is never parsed as HTML
  return n;
}
export const NS = 'http://www.w3.org/2000/svg';
export const ICONS: Record<string, string> = {
  mail: 'M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z|M3.5 7l8.5 6 8.5-6',
  clip: 'M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l9-9a3.3 3.3 0 0 1 4.7 4.7l-9 9a1.7 1.7 0 0 1-2.4-2.4l8.3-8.3',
  scissors: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M20 4L8.1 15.9|M14.5 14.5L20 20|M8.1 8.1L12 12',
  up: 'M12 19V5|M5 12l7-7 7 7',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z|M21 21l-4.3-4.3',
  lock: 'M6 11h12v9H6z|M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  back: 'M15 5l-7 7 7 7',
  download: 'M12 4v11|M7 11l5 5 5-5|M5 20h14',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z|M12 7v5l3 2',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1|M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  check: 'M4 12.5l4.5 4.5L18 7.5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M4 21a8 8 0 0 1 16 0',
  out: 'M10 4H5v16h5|M15 8l4 4-4 4|M19 12H9',
  photo: 'M4 5h16v14H4z|M4 16l5-5 4 4 3-3 4 4',
  plan: 'M5 4h14v16H5z|M9 9h6|M9 13h6|M9 17h3',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z|M9 12l2 2 4-4',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
};
export function icon(name: string, size = 20): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: String(size), height: String(size), fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false', class: 'ic' })) svg.setAttribute(k, v);
  for (const d of ICONS[name].split('|')) { const path = document.createElementNS(NS, 'path'); path.setAttribute('d', d); svg.append(path); }
  return svg;
}
export function googleLogo(): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 48 48', width: '20', height: '20', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(k, v);
  for (const [fill, d] of [
    ['#EA4335', 'M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z'],
    ['#4285F4', 'M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z'],
    ['#FBBC05', 'M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z'],
    ['#34A853', 'M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z'],
  ]) { const path = document.createElementNS(NS, 'path'); path.setAttribute('fill', fill); path.setAttribute('d', d); svg.append(path); }
  return svg;
}
export const initials = (name: string) => (name.trim().split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase();
export const dayLabel = (iso: string) => {
  const d = new Date(iso); const today = new Date(); const yest = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return 'Dnes';
  if (d.toDateString() === yest.toDateString()) return 'Včera';
  return d.toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });
};
export const fmtDate = (iso: string | null) => (iso ? new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('sk-SK', { day: 'numeric', month: 'numeric' }) : '');
export const fmtDateFull = (iso: string | null) => (iso ? new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('sk-SK', { day: 'numeric', month: 'numeric', year: 'numeric' }) : '');
export const label = (forId: string, text: string, cls = '') => el('label', { for: forId, class: cls }, text);
export const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' }) : '');
export const fmtDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('sk-SK', { day: 'numeric', month: 'numeric' }) : '');
export const fmtSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} kB`);
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);
export const safeHttp = (u: string | null) => { try { return u && /^https?:$/.test(new URL(u).protocol) ? u : null; } catch { return null; } };

// ---- error toast ----
export const errorBox = el('div', { class: 'toast', role: 'alert', 'data-testid': 'app-error', hidden: true, onclick: () => { errorBox.hidden = true; } });
let errorTimer: number | undefined;
export function showError(msg: string) {
  errorBox.textContent = msg;
  errorBox.hidden = false;
  clearTimeout(errorTimer);
  errorTimer = window.setTimeout(() => { errorBox.hidden = true; }, 8000);
}
