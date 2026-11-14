// Home-page motion: count-up numbers and gentle scroll parallax ([data-parallax] = speed). Off with reduced motion.
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const counters = document.querySelectorAll<HTMLElement>('[data-count]');
if (!reduce && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const el = e.target as HTMLElement;
      const to = Number(el.dataset.count);
      if (!to) continue;
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min((now - t0) / 1400, 1);
        el.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(step);
      };
      el.textContent = '0';
      requestAnimationFrame(step);
    }
  }, { threshold: 0.6 });
  counters.forEach((c) => io.observe(c));
}

const layers = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax]'));
if (!reduce && layers.length) {
  let ticking = false;
  const update = () => {
    ticking = false;
    const vh = window.innerHeight;
    for (const el of layers) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) continue;
      const k = Number(el.dataset.parallax) || 0.1;
      const off = (r.top + r.height / 2 - vh / 2) * k;
      el.style.transform = `translate3d(0, ${off.toFixed(1)}px, 0)`;
    }
  };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  update();
}
