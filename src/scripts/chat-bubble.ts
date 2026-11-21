// Chat button: links straight to the full chat in /app/; here only its label, a one-time pulse and the cookie-bar offset.
const root = document.getElementById('cb');

function signedIn(): boolean {
  try {
    if (localStorage.getItem('domovid-app-mock') !== null) return true;
    for (let i = 0; i < localStorage.length; i++) if (/^sb-.*-auth-token$/.test(localStorage.key(i) ?? '')) return true;
  } catch { /* storage blocked */ }
  return false;
}

if (root) {
  // Signed-in visitors continue their conversation; the top navigation links say the same.
  if (signedIn()) {
    root.querySelector<HTMLElement>('[data-cb-label]')!.textContent = 'Pokračovať v chate';
    document.querySelectorAll('[data-chat-link] [data-chat-label]').forEach((l) => (l.textContent = 'Pokračovať v chate'));
  }

  // The sign-up prompt (RegisterPrompt) greets first-time visitors; the chat button only pulses once.
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) window.setTimeout(() => root.classList.add('cb-pulse'), 4000);

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
