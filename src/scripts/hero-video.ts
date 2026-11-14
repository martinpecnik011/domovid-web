// The background film starts after `load` so it never competes with the first paint; small screens get the 720p file.
const v = document.querySelector<HTMLVideoElement>('[data-hero]');
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const start = () => {
  if (!v || reduce) return;
  v.src = (window.innerWidth < 900 ? v.dataset.srcSm : v.dataset.srcLg) || '';
  v.addEventListener('playing', () => v.classList.add('on'), { once: true });
  v.play().catch(() => {});
};
if (document.readyState === 'complete') start();
else window.addEventListener('load', start, { once: true });
