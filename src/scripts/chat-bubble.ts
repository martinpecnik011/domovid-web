// Mini chat: opens by itself on the first visit (desktop; a teaser label on phones), offers sign-up / sign-in,
// and hands whatever the visitor typed over to the full chat in /app/ through sessionStorage.
const DRAFT_KEY = 'domovid-chat-draft';
const SEEN_KEY = 'domovid-cb-seen';
const root = document.getElementById('cb');
const bubble = root?.querySelector<HTMLButtonElement>('.cb-bubble');
const panel = document.getElementById('cb-panel');

const store = {
  get: (s: Storage, k: string) => { try { return s.getItem(k); } catch { return null; } },
  set: (s: Storage, k: string, v: string) => { try { s.setItem(k, v); } catch { /* private mode */ } },
};

function signedIn(): boolean {
  try {
    if (localStorage.getItem('domovid-app-mock') !== null) return true;
    for (let i = 0; i < localStorage.length; i++) if (/^sb-.*-auth-token$/.test(localStorage.key(i) ?? '')) return true;
  } catch { /* storage blocked */ }
  return false;
}

if (root && bubble && panel) {
  const app = () => root.dataset.app || 'app/';
  const input = panel.querySelector<HTMLInputElement>('#cb-text')!;
  const form = panel.querySelector<HTMLFormElement>('[data-cb-form]')!;
  const auth = panel.querySelector<HTMLElement>('[data-cb-auth]')!;
  const label = root.querySelector<HTMLElement>('[data-cb-label]')!;
  const FOCUSABLE = 'a[href], button:not([disabled]), input';
  const isOpen = () => !panel.hidden;
  const logged = signedIn();

  const cont = panel.querySelector<HTMLElement>('[data-cb-continue]')!;
  if (logged) {
    auth.hidden = true;
    cont.hidden = false;
    label.textContent = 'Pokračovať v chate';
  }
  // The same window opens from the top navigation ("Chat · prihlásenie" / "Pokračovať v chate").
  document.querySelectorAll<HTMLAnchorElement>('[data-open-minichat]').forEach((a) => {
    const lbl = a.querySelector('[data-chat-label]');
    if (lbl && logged) lbl.textContent = 'Pokračovať v chate';
    a.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelector<HTMLButtonElement>('[data-nav-toggle][aria-expanded="true"]')?.click();
      open();
      bubble.classList.add('cb-pulse');
    });
  });

  function open(focus = true) {
    panel!.hidden = false;
    root!.dataset.open = '';
    bubble!.setAttribute('aria-expanded', 'true');
    store.set(localStorage, SEEN_KEY, '1');
    if (focus) input.focus();
  }
  function close() {
    panel!.hidden = true;
    delete root!.dataset.open;
    bubble!.setAttribute('aria-expanded', 'false');
  }
  // Leave for the full chat; the typed text (if any) is prefilled there after sign-in.
  function toChat(text: string, href = app()) {
    const t = text.trim();
    if (t) store.set(sessionStorage, DRAFT_KEY, t.slice(0, 1000));
    location.href = href;
  }

  bubble.addEventListener('click', () => (isOpen() ? close() : open()));
  panel.querySelector('.cb-close')?.addEventListener('click', () => { close(); bubble.focus(); });
  form.addEventListener('submit', (e) => { e.preventDefault(); if (input.value.trim()) toChat(input.value); else input.focus(); });
  panel.querySelectorAll<HTMLButtonElement>('[data-quick]').forEach((b) => b.addEventListener('click', () => {
    const q = b.dataset.quick || '';
    if (q === 'Chcem ponuku') toChat('', app() + (app().includes('?') ? '&' : '?') + 'ponuka=1');
    else { input.value = q === 'Mám otázku k cene' ? 'Dobrý deň, mám otázku k cene: ' : 'Dobrý deň, chcem vám poslať fotky nehnuteľnosti.'; input.focus(); }
  }));
  // Sign-up / sign-in links carry the draft too.
  panel.querySelectorAll<HTMLAnchorElement>('[data-cb-go], [data-cb-full]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    toChat(input.value, a.href);
  }));

  document.addEventListener('click', (e) => {
    const t = e.target as Node;
    if (isOpen() && !root.contains(t) && !(t instanceof Element && t.closest('[data-open-minichat]'))) close();
  });
  document.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') { close(); bubble.focus(); return; }
    if (e.key !== 'Tab') return;
    const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !panel.contains(active))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (active === last || !panel.contains(active))) { e.preventDefault(); first.focus(); }
  });

  // First visit: open on wide screens (without stealing focus), a teaser label on phones.
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!logged && !store.get(localStorage, SEEN_KEY)) {
    window.setTimeout(() => {
      if (isOpen()) return;
      if (window.matchMedia('(min-width: 768px)').matches) open(false);
      else { label.textContent = 'Prihláste sa · prvé video zadarmo'; label.classList.add('teaser'); }
      if (!reduce) root.classList.add('cb-pulse');
    }, 1800);
  } else if (!reduce) {
    window.setTimeout(() => root.classList.add('cb-pulse'), 4000);
  }

  // Keep above the cookie bar.
  const cc = document.getElementById('cc');
  const updateOffset = () => {
    const box = cc && !cc.hidden ? cc.querySelector('.cc-box') : null;
    const narrow = window.innerWidth < 1100;
    const offset = box && narrow ? Math.max(0, window.innerHeight - box.getBoundingClientRect().top + 8) : 0;
    root.style.setProperty('--cb-offset', offset + 'px');
  };
  if (cc) {
    new MutationObserver(updateOffset).observe(cc, { attributes: true, attributeFilter: ['hidden'] });
    const box = cc.querySelector('.cc-box');
    if (box) new ResizeObserver(updateOffset).observe(box);
  }
  window.addEventListener('resize', updateOffset);
  updateOffset();
}
