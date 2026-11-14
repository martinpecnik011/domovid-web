// Videos marked `data-src` get their source only near the viewport and pause when they leave it. They stream
// (no preload="auto", so several films never download in full at once). While a player dialog is open
// (event `domovid:player` with detail true/false) every inline film pauses so the opened one gets the bandwidth.
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const vids = document.querySelectorAll<HTMLVideoElement>('video[data-src]');
const visible = new Set<HTMLVideoElement>();
let held = false;
const play = (v: HTMLVideoElement) => {
  if (!v.src) v.src = v.dataset.src || '';
  if (!reduce && !held) v.play().catch(() => {});
};
window.addEventListener('domovid:player', (e) => {
  held = Boolean((e as CustomEvent<boolean>).detail);
  if (held) vids.forEach((v) => v.pause());
  else visible.forEach(play);
});
const start = () => {
  if (!('IntersectionObserver' in window)) return vids.forEach(play);
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const v = e.target as HTMLVideoElement;
        if (e.isIntersecting) { visible.add(v); play(v); }
        else { visible.delete(v); if (v.src) v.pause(); }
      }
    },
    { rootMargin: '150px 0px' },
  );
  vids.forEach((v) => io.observe(v));
};
if (document.readyState === 'complete') start();
else window.addEventListener('load', start, { once: true });
