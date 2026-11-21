import type { Addon, ContentItem, ContentKind, ContentStatus, PaymentStatus, Plan, PlanCategory, Subscription } from './types';
import { el, icon, fmtDate, fmtDateFull, NS } from './dom';
import { grossPay } from '../../config/site';
import type { OfferPrefill } from './offer';

// Customer views: "Môj plán" (subscription + monthly content plan) and "Cenník".
export const KIND_LABEL: Record<ContentKind, string> = { ponuka: 'Ponuka', osobna_znacka: 'Osobná značka', tip: 'Tip', nabor: 'Nábor', ine: 'Iné' };
export const STATUS_LABEL: Record<ContentStatus, string> = { planned: 'Naplánované', in_production: 'Vo výrobe', for_approval: 'Na schválenie', approved: 'Schválené', published: 'Zverejnené' };
const PAY: Record<PaymentStatus, [string, string]> = { paid: ['Zaplatené', 'ok'], unpaid: ['Čaká na platbu', 'warn'], overdue: ['Po splatnosti', 'bad'] };
const eur = (n: number) => `${n.toLocaleString('sk-SK')} €`;

export const CAT_LABEL: Record<PlanCategory, string> = { social: 'Sociálne siete', video: 'Videá nehnuteľností', video_viz: 'Videá s vizualizáciou' };
export const shortLabel = (p: Plan) => p.label.split('–')[0].trim().replace(/\s*\/\s*mesiac$/i, '');
export const planName = (sub: Subscription, plans: Plan[]) => {
  if (sub.plan === 'custom') return 'Vlastný balík';
  const p = plans.find((x) => x.code === sub.plan);
  return p ? shortLabel(p) : 'Balík';
};
const unitText = (p: { unit: 'month' | 'once' | 'video' }) => (p.unit === 'month' ? 'mesiac' : p.unit === 'video' ? 'video' : 'jednorazovo');
/** "Chcem tento balík" opens the offer questionnaire with the package preselected (location, photos… are still asked). */
export const planPrefill = (p: Plan): OfferPrefill => p.category === 'social'
  ? { service: 'social', plan: String(p.videos) }
  : { service: p.category === 'video_viz' ? 'viz' : 'video', pkg: { label: `${CAT_LABEL[p.category]} – ${shortLabel(p)}`, price: p.price_net, monthly: p.unit === 'month' } };
export const addonMessage = (a: Addon) => `Mám záujem o doplnok ${a.label} (+${a.price_net} € v čistom / ${a.unit === 'month' ? 'mesiac' : 'video'})`;

function ring(used: number, total: number): SVGSVGElement {
  const r = 42, c = 2 * Math.PI * r;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('width', '120'); svg.setAttribute('height', '120'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', 'ring');
  const circle = (cls: string, dash?: number) => {
    const e = document.createElementNS(NS, 'circle');
    for (const [k, v] of Object.entries({ cx: '50', cy: '50', r: String(r), fill: 'none', 'stroke-width': '10', class: cls, ...(dash === undefined ? {} : { 'stroke-dasharray': `${dash} ${c}`, 'stroke-linecap': 'round', transform: 'rotate(-90 50 50)' }) })) e.setAttribute(k, v);
    return e;
  };
  svg.append(circle('ring-bg'), circle('ring-fg', total > 0 ? c * Math.min(used / total, 1) : 0));
  return svg;
}

/** Monday of the week containing the date, as yyyy-mm-dd. */
function weekStart(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const weekLabel = (start: string) => {
  const end = new Date(start + 'T00:00:00'); end.setDate(end.getDate() + 6);
  return `Týždeň ${fmtDate(start)} – ${fmtDate(`${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`)}`;
};

export interface PlanPageDeps {
  subs: Subscription[]; plans: Plan[]; addons: Addon[]; items: ContentItem[];
  toPricing(): void; approve(item: ContentItem): void;
}

function subCard(sub: Subscription, d: PlanPageDeps): HTMLElement {
  const { plans, addons } = d;
  const card = el('section', { class: 'sub-card', 'aria-label': CAT_LABEL[sub.category], 'data-testid': 'sub-card', 'data-category': sub.category });
  const [payText, payCls] = PAY[sub.payment_status];
  const left = Math.max(sub.videos_included - sub.videos_used, 0);
  const p = plans.find((x) => x.code === sub.plan);
  const chips = sub.addons.map((code) => addons.find((a) => a.code === code)).filter((a): a is Addon => !!a);
  card.append(
    el('div', { class: 'sub-top' },
      el('div', {}, el('p', { class: 'eyebrow', 'data-testid': 'sub-category' }, CAT_LABEL[sub.category]), el('h2', { 'data-testid': 'sub-name' }, planName(sub, plans)),
        sub.price_net != null ? el('p', { class: 'muted' }, `${eur(sub.price_net)} v čistom${p?.unit === 'once' ? ', jednorazovo' : ' / mesiac'}`) : null),
      el('span', { class: `pay ${payCls}`, 'data-testid': 'pay-badge' }, payText)),
    el('div', { class: 'sub-usage' },
      el('div', { class: 'ring-wrap' }, ring(sub.videos_used, sub.videos_included), el('span', { class: 'ring-txt', 'data-testid': 'sub-usage' }, `${sub.videos_used}/${sub.videos_included}`)),
      el('div', {}, el('p', { class: 'left', 'data-testid': 'sub-left' }, `zostáva ${left}`), el('p', { class: 'muted' }, 'videí v tomto období'))),
    ...(chips.length ? [el('ul', { class: 'addon-chips', 'aria-label': 'Doplnky' }, ...chips.map((a) => el('li', { class: 'addon-chip', 'data-testid': 'addon-chip' }, icon('check', 14), `${a.label} +${eur(a.price_net)}/${a.unit === 'month' ? 'mes.' : 'video'}`)))] : []),
    el('dl', { class: 'sub-dates' },
      el('div', {}, el('dt', {}, 'Obdobie'), el('dd', { 'data-testid': 'sub-period' }, sub.period_start && sub.period_end ? `${fmtDate(sub.period_start)} – ${fmtDate(sub.period_end)}` : '—')),
      el('div', {}, el('dt', {}, 'Viazanosť do'), el('dd', { 'data-testid': 'sub-commit' }, sub.commitment_until ? fmtDateFull(sub.commitment_until) : '—'))),
    ...(sub.note ? [el('p', { class: 'note-box' }, sub.note)] : []));
  return card;
}

export function renderPlanPage(c: HTMLElement, d: PlanPageDeps) {
  const { plans, items } = d;
  const active = d.subs.filter((s) => s.plan !== 'none');
  const cards: HTMLElement[] = active.map((sub) => subCard(sub, d));
  if (!cards.length) cards.push(el('section', { class: 'sub-card', 'aria-label': 'Predplatné', 'data-testid': 'sub-card' },
    el('div', { class: 'sub-empty', 'data-testid': 'sub-empty' },
      el('span', { class: 'sub-empty-ic' }, icon('plan', 28)),
      el('h2', {}, 'Zatiaľ nemáte balík'),
      el('p', {}, 'Vyberte si balík videí a my sa postaráme o zvyšok.'),
      el('button', { type: 'button', class: 'btn btn-gold', 'data-testid': 'to-pricing', onclick: d.toPricing }, 'Pozrieť cenník'))));

  const plan = el('section', { class: 'content-plan', 'aria-labelledby': 'cp-title' }, el('h2', { id: 'cp-title' }, 'Plán obsahu na mesiac'));
  if (!items.length) plan.append(el('p', { class: 'muted', 'data-testid': 'content-empty' }, 'Plán obsahu zatiaľ nie je pripravený. Pripravíme ho spolu s vami.'));
  const groups = new Map<string, ContentItem[]>();
  for (const it of items) {
    const k = it.due_date ? weekStart(it.due_date) : '';
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  for (const k of [...groups.keys()].sort((a, b) => (a || '9').localeCompare(b || '9'))) {
    plan.append(el('div', { class: 'week' }, el('h3', {}, k ? weekLabel(k) : 'Bez termínu'),
      el('ul', {}, ...groups.get(k)!.map((it) => el('li', { class: 'item', 'data-testid': 'content-item', 'data-status': it.status },
        el('div', { class: 'item-main' }, el('strong', {}, it.title), it.due_date ? el('span', { class: 'muted' }, fmtDate(it.due_date)) : null),
        el('div', { class: 'item-chips' }, el('span', { class: 'kchip' }, KIND_LABEL[it.kind]), el('span', { class: `schip s-${it.status}` }, STATUS_LABEL[it.status])),
        it.status === 'for_approval' ? el('button', { type: 'button', class: 'btn btn-ghost small', 'data-testid': 'approve-item', onclick: () => d.approve(it) }, 'Pozrieť a schváliť v chate') : null)))));
  }
  c.replaceChildren(el('div', { class: 'page-in' }, ...cards, plan));
}

export interface PricingDeps { subs: Subscription[]; plans: Plan[]; addons: Addon[]; choose(p: Plan): void; chooseAddon(a: Addon): void }
type PricingTab = 'videa' | 'social' | 'doplnky';
let pricingTab: PricingTab = 'videa';

function planCard(p: Plan, d: PricingDeps): HTMLElement {
  const current = d.subs.some((s) => s.category === p.category && s.plan === p.code);
  const social = p.category === 'social';
  const perks = [p.commitment_months > 0 ? `Viazanosť ${p.commitment_months} mesiace` : 'Bez viazanosti', 'Súkromný chat s tímom', 'Úpravy s časom vo videu'];
  return el('article', { class: `plan-card${p.popular ? ' popular' : ''}${current ? ' current' : ''}`, 'data-testid': `plan-card-${p.code}` },
    p.popular ? el('span', { class: 'flag' }, 'Najobľúbenejší') : null,
    el('p', { class: 'eyebrow' }, social ? p.label.split('–')[1]?.trim() ?? '' : p.unit === 'once' ? 'Jednorazovo' : 'Mesačne'),
    el('h3', {}, social ? `${p.videos} videí` : shortLabel(p), el('small', {}, social ? ' / mesiac' : p.unit === 'month' ? ' / mesiac' : '')),
    el('p', { class: 'price' }, eur(p.price_net), el('small', {}, p.unit === 'once' ? ' v čistom, jednorazovo' : ' v čistom / mesiac')),
    el('p', { class: 'muted', 'data-testid': 'plan-vat' }, `hrubá odmena na dohode ${grossPay(p.price_net)}`),
    p.unit === 'month' ? el('p', { class: 'muted' }, `${eur(p.per_video)} v čistom za video`) : el('p', { class: 'muted' }, 'za jedno video'),
    p.note ? el('p', { class: 'plan-note' }, icon('star', 14), p.note) : null,
    el('ul', { class: 'perks' }, ...perks.map((t) => el('li', {}, icon('check', 16), t))),
    current ? el('p', { class: 'current-flag', 'data-testid': 'current-plan' }, icon('check', 16), 'Váš balík')
      : el('button', { type: 'button', class: `btn ${p.popular ? 'btn-gold' : 'btn-light'}`, 'data-testid': `choose-plan-${p.code}`, onclick: () => d.choose(p) }, 'Chcem tento balík'));
}

function addonCard(a: Addon, d: PricingDeps): HTMLElement {
  const active = d.subs.some((s) => s.addons.includes(a.code));
  return el('article', { class: 'plan-card addon', 'data-testid': `addon-card-${a.code}` },
    el('p', { class: 'eyebrow' }, a.unit === 'month' ? 'Mesačný doplnok' : 'Doplnok k videu'),
    el('h3', {}, a.label),
    el('p', { class: 'price' }, `+${eur(a.price_net)}`, el('small', {}, ` v čistom / ${unitText(a)}`)),
    el('p', { class: 'muted' }, `hrubá +${grossPay(a.price_net)}`),
    a.note ? el('p', { class: 'muted' }, a.note) : null,
    active ? el('p', { class: 'current-flag', 'data-testid': 'current-addon' }, icon('check', 16), 'Aktívny doplnok')
      : el('button', { type: 'button', class: 'btn btn-light', 'data-testid': `choose-addon-${a.code}`, onclick: () => d.chooseAddon(a) }, 'Mám záujem o doplnok'));
}

export function renderPricing(c: HTMLElement, d: PricingDeps) {
  const tabs: [PricingTab, string][] = [['videa', 'Videá nehnuteľností'], ['social', 'Sociálne siete'], ['doplnky', 'Doplnky']];
  const seg = el('div', { class: 'tabs sub', role: 'group', 'aria-label': 'Kategórie cenníka' }, ...tabs.map(([k, t]) => el('button', { type: 'button', class: 'tab', 'aria-pressed': String(pricingTab === k), 'data-testid': `ptab-${k}`, onclick: () => { pricingTab = k; renderPricing(c, d); } }, t)));
  const byCat = (cat: PlanCategory) => d.plans.filter((p) => p.category === cat);
  const addonsFor = (to: 'social' | 'video') => d.addons.filter((a) => a.applies_to === to);
  let body: HTMLElement;
  if (pricingTab === 'videa') {
    body = el('div', { class: 'plan-groups' },
      el('section', { class: 'plan-group', 'aria-label': 'Bez vizualizácie' }, el('h3', { class: 'group-title' }, 'Bez vizualizácie'), el('div', { class: 'plans two' }, ...byCat('video').map((p) => planCard(p, d)))),
      el('section', { class: 'plan-group', 'aria-label': 'S vizualizáciou' }, el('h3', { class: 'group-title' }, 'S vizualizáciou'), el('div', { class: 'plans two' }, ...byCat('video_viz').map((p) => planCard(p, d)))));
  } else if (pricingTab === 'social') {
    body = el('div', { class: 'plan-groups one' },
      el('div', { class: 'plans' }, ...byCat('social').map((p) => planCard(p, d))),
      el('section', { class: 'plan-group', 'aria-label': 'Doplnky k sociálnym sieťam' }, el('h3', { class: 'group-title' }, 'Doplnky k sociálnym sieťam'), el('div', { class: 'plans two' }, ...addonsFor('social').map((a) => addonCard(a, d)))));
  } else {
    body = el('div', { class: 'plan-groups one' }, el('section', { class: 'plan-group', 'aria-label': 'Doplnky k videám' }, el('h3', { class: 'group-title' }, 'Doplnky k videám'), el('div', { class: 'plans two' }, ...addonsFor('video').map((a) => addonCard(a, d)))));
  }
  c.replaceChildren(el('div', { class: 'page-in' },
    el('h2', { class: 'page-title' }, 'Cenník'),
    el('p', { class: 'muted' }, 'Zatiaľ nie sme firma ani platcovia DPH, preto spolupracujeme len na študentskú dohodu (dohoda o brigádnickej práci študentov). Ceny sú naša odmena v čistom, pod každou je orientačná hrubá odmena na dohode. Prvé video na ukážku je zadarmo, ďalej podpíšeme dohodu a odmenu vyplatíte po odovzdaní. Sociálne siete sú bez viazanosti.'),
    seg, body));
}
