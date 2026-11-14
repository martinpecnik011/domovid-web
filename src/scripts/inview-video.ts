// Videos marked `data-src` load only when they come near the viewport and pause when they leave it.
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const vids = document.querySelectorAll<HTMLVideoElement>('video[data-src]');
const play = (v: HTMLVideoElement) => {
  if (!v.src) {
    v.src = v.dataset.src || '';
    v.preload = 'auto';
  }
  if (!reduce) v.play().catch(() => {});
};
const start = () => {
  if (!('IntersectionObserver' in window)) return vids.forEach(play);
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const v = e.target as HTMLVideoElement;
        if (e.isIntersecting) play(v);
        else if (v.src) v.pause();
      }
    },
    { rootMargin: '200px 0px' },
  );
  vids.forEach((v) => io.observe(v));
};
if (document.readyState === 'complete') start();
else window.addEventListener('load', start, { once: true });
