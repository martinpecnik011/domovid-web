// Scene video switching, scroll parallax and pointer tilt (bento glass tiles over the video "stage").
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const vids: Record<string, HTMLVideoElement> = {};
document.querySelectorAll<HTMLVideoElement>('.stage video').forEach((v) => {
  if (v.dataset.bg) vids[v.dataset.bg] = v;
});
let current = 'vila';

function show(name: string) {
  if (!vids[name] || name === current) return;
  const next = vids[name];
  const prev = vids[current];
  const p = next.play();
  if (p && p.catch) p.catch(() => {});
  next.classList.add('on');
  prev.classList.remove('on');
  setTimeout(() => {
    if (!prev.classList.contains('on')) prev.pause();
  }, 1500);
  current = name;
}

// Pick the scene whose section covers the middle of the viewport.
const scenes = Array.from(document.querySelectorAll<HTMLElement>('[data-scene]'));
function pickScene() {
  const mid = window.innerHeight * 0.5;
  let found: HTMLElement | null = null;
  for (const s of scenes) {
    const r = s.getBoundingClientRect();
    if (r.top <= mid && r.bottom >= mid) {
      found = s;
      break;
    }
  }
  if (!found) return;
  show(found.dataset.scene || '');
  document.body.dataset.depth = found.dataset.depth || '';
}

// Scroll parallax: background drifts, panels float at different depths.
const depths = Array.from(document.querySelectorAll<HTMLElement>('.depth'));
function parallax() {
  const y = window.scrollY;
  const h = window.innerHeight;
  Object.keys(vids).forEach((k) => {
    vids[k].style.setProperty('--shift', (-(y * 0.04) % 60) + 'px');
  });
  depths.forEach((el) => {
    const r = el.getBoundingClientRect();
    const offset = r.top + r.height / 2 - h / 2;
    const py = Math.max(-10, Math.min(10, offset * parseFloat(el.dataset.speed || '0') * 0.25));
    el.style.setProperty('--py', py.toFixed(1) + 'px');
  });
}

let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    pickScene();
    if (!reduce) parallax();
    ticking = false;
  });
}
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', onScroll);
onScroll();

// Pointer tilt for cards (fine pointers only).
if (!reduce && window.matchMedia('(pointer: fine)').matches) {
  document.querySelectorAll<HTMLElement>('.tilt').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.classList.add('live');
      el.style.setProperty('--ry', (x * 9).toFixed(2) + 'deg');
      el.style.setProperty('--rx', (-y * 7).toFixed(2) + 'deg');
    });
    el.addEventListener('pointerleave', () => {
      el.classList.remove('live');
      el.style.setProperty('--ry', '0deg');
      el.style.setProperty('--rx', '0deg');
    });
  });
}

// The .depth translate and the tilt rotate share one transform; compose them.
document.querySelectorAll<HTMLElement>('.depth.tilt').forEach((el) => {
  el.style.transform = 'translate3d(0, var(--py, 0px), 0) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg))';
});
