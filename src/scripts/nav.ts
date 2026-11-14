const nav = document.querySelector<HTMLElement>('[data-nav]');
const toggle = nav?.querySelector<HTMLButtonElement>('[data-nav-toggle]');
const drawer = nav?.querySelector<HTMLElement>('[data-nav-drawer]');

if (nav && toggle && drawer) {
  const setOpen = (open: boolean, returnFocus = false) => {
    drawer.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Zavrieť menu' : 'Otvoriť menu');
    if (open) drawer.querySelector<HTMLElement>('a')?.focus();
    else if (returnFocus) toggle.focus();
  };

  toggle.addEventListener('click', () => setOpen(drawer.hidden));
  drawer.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !drawer.hidden) setOpen(false, true);
  });
  document.addEventListener('click', (e) => {
    if (!drawer.hidden && !nav.contains(e.target as Node)) setOpen(false);
  });
  window.matchMedia('(min-width: 960px)').addEventListener('change', (e) => {
    if (e.matches) setOpen(false);
  });
}
