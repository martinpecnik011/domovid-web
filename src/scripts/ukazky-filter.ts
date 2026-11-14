const HASH_TO_CAT: Record<string, string> = { videa: 'video', vizualizacie: 'viz', siete: 'social' };
const CAT_TO_HASH: Record<string, string> = { video: 'videa', viz: 'vizualizacie', social: 'siete' };

const chips = Array.from(document.querySelectorAll<HTMLButtonElement>('.filter-chip'));
const cards = Array.from(document.querySelectorAll<HTMLElement>('.cut'));
const status = document.getElementById('filter-status');

function plural(n: number): string {
  if (n === 1) return 'Zobrazená 1 ukážka';
  if (n >= 2 && n <= 4) return `Zobrazené ${n} ukážky`;
  return `Zobrazených ${n} ukážok`;
}

function apply(cat: string, updateHash: boolean): void {
  let shown = 0;
  for (const card of cards) {
    const match = cat === 'all' || (card.dataset.cats ?? '').split(' ').includes(cat);
    card.hidden = !match;
    if (match) shown++;
  }
  for (const chip of chips) chip.setAttribute('aria-pressed', String(chip.dataset.cat === cat));
  if (status) status.textContent = plural(shown);
  if (updateHash) {
    const url = location.pathname + location.search + (CAT_TO_HASH[cat] ? '#' + CAT_TO_HASH[cat] : '');
    history.replaceState(null, '', url);
  }
}

for (const chip of chips) chip.addEventListener('click', () => apply(chip.dataset.cat ?? 'all', true));

const fromHash = (): string => HASH_TO_CAT[location.hash.slice(1)] ?? 'all';
apply(fromHash(), false);
window.addEventListener('hashchange', () => apply(fromHash(), false));
