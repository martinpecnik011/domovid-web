import type { Adapter, ContentItem, ContentKind, ContentStatus, PaymentStatus, PlanCategory, PlanId, Subscription } from './types';
import { el, icon, label, uuid, showError, fmtDateFull } from './dom';
import { KIND_LABEL, STATUS_LABEL, CAT_LABEL, shortLabel } from './plan';

// Staff side panel "Predplatné a plán" for one customer.
const CATEGORIES: PlanCategory[] = ['social', 'video', 'video_viz'];
const emptySub = (customer_id: string, category: PlanCategory): Subscription => ({ customer_id, category, plan: 'none', addons: [], videos_included: 0, videos_used: 0, period_start: null, period_end: null, commitment_until: null, payment_status: 'unpaid', price_net: null, note: null });
const PAY_OPTIONS: [PaymentStatus, string][] = [['unpaid', 'Čaká na platbu'], ['paid', 'Zaplatené'], ['overdue', 'Po splatnosti']];

function select<T extends string>(id: string, options: [T, string][], value: T) {
  const s = el('select', { id, 'data-testid': id });
  options.forEach(([v, t]) => s.append(el('option', { value: v }, t)));
  s.value = value;
  return s;
}

export async function openSubscriptionPanel(adapter: Adapter, customerId: string, customerName: string) {
  const [plans, addons, subs, items0] = await Promise.all([adapter.data.listPlans(), adapter.data.listAddons(), adapter.data.getSubscriptions(customerId), adapter.data.listContent(customerId)]);
  let items = items0;
  // One draft per category; switching tabs keeps unsaved edits, Save writes every touched category.
  const drafts = new Map<PlanCategory, Subscription>(subs.map((x) => [x.category, x]));
  if (!drafts.size) drafts.set('social', emptySub(customerId, 'social'));
  const touched = new Set<PlanCategory>();
  let cat: PlanCategory = drafts.has('social') ? 'social' : [...drafts.keys()][0];
  let read: () => Subscription = () => drafts.get(cat)!;

  const dlg = el('dialog', { class: 'sheet side', 'aria-labelledby': 'sub-title', 'data-testid': 'sub-panel' });
  const catTabs = el('div', { class: 'cat-tabs', role: 'group', 'aria-label': 'Kategórie predplatného' });
  const formHost = el('div', { class: 'sub-form', 'data-testid': 'sub-form' });
  const save = el('button', { type: 'submit', class: 'btn btn-gold', 'data-testid': 'sub-save' }, 'Uložiť predplatné');

  function switchTo(next: PlanCategory) { drafts.set(cat, read()); cat = next; draw(); }
  function drawTabs() {
    const free = CATEGORIES.filter((k) => !drafts.has(k));
    catTabs.replaceChildren(...[...drafts.keys()].map((k) => el('button', { type: 'button', class: 'tab', 'aria-pressed': String(k === cat), 'data-testid': `cat-tab-${k}`, onclick: () => switchTo(k) }, CAT_LABEL[k])),
      ...(free.length ? [(() => {
        const sel = el('select', { 'aria-label': 'Pridať kategóriu', class: 'cat-add', 'data-testid': 'cat-add' }, el('option', { value: '' }, '+ Pridať kategóriu'), ...free.map((k) => el('option', { value: k }, CAT_LABEL[k])));
        sel.addEventListener('change', () => { if (!sel.value) return; const k = sel.value as PlanCategory; drafts.set(cat, read()); drafts.set(k, emptySub(customerId, k)); touched.add(k); cat = k; draw(); });
        return sel;
      })()] : []));
  }
  function draw() {
    drawTabs();
    const sub = drafts.get(cat)!;
    const catPlans = plans.filter((p) => p.category === cat);
    const num = (id: string, v: number | null) => { const i = el('input', { id, type: 'number', min: '0', step: '1', 'data-testid': id }); i.value = v == null ? '' : String(v); return i; };
    const date = (id: string, v: string | null) => { const i = el('input', { id, type: 'date', 'data-testid': id }); i.value = v ?? ''; return i; };
    const plan = select<PlanId>('sub-plan', [['none', 'Bez balíka'], ...catPlans.map((p) => [p.code, `${shortLabel(p)} – ${p.price_net} €${p.unit === 'once' ? ' jednorazovo' : ' / mes.'}`] as [PlanId, string]), ['custom', 'Vlastný balík']], sub.plan);
    const included = num('sub-included', sub.videos_included);
    const price = num('sub-price', sub.price_net);
    const used = num('sub-used', sub.videos_used);
    const start = date('sub-start', sub.period_start);
    const end = date('sub-end', sub.period_end);
    const commit = date('sub-commit', sub.commitment_until);
    const pay = select('sub-pay', PAY_OPTIONS, sub.payment_status);
    const note = el('textarea', { id: 'sub-note', rows: '2', maxlength: '500', 'data-testid': 'sub-note' }); note.value = sub.note ?? '';
    plan.addEventListener('change', () => {
      const p = plans.find((x) => x.code === plan.value);
      if (p) { included.value = String(p.videos); price.value = String(p.price_net); }
      else if (plan.value === 'none') { included.value = '0'; price.value = ''; used.value = '0'; }
    });
    const step = (d: number) => { used.value = String(Math.max(0, (Number(used.value) || 0) + d)); touched.add(cat); };
    const stepper = el('div', { class: 'stepper' },
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Znížiť počet použitých videí', 'data-testid': 'used-minus', onclick: () => step(-1) }, '−'),
      used,
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Zvýšiť počet použitých videí', 'data-testid': 'used-plus', onclick: () => step(1) }, '+'));
    const addonBoxes = cat === 'social' ? addons.filter((a) => a.applies_to === 'social').map((a) => {
      const box = el('input', { type: 'checkbox', id: `addon-${a.code}`, value: a.code, 'data-testid': `addon-${a.code}` });
      box.checked = sub.addons.includes(a.code);
      return { a, box };
    }) : [];
    const field = (lab: string, id: string, ctl: HTMLElement) => el('div', { class: 'field' }, label(id, lab), ctl);
    read = () => ({
      customer_id: customerId, category: cat, plan: plan.value as PlanId, addons: addonBoxes.filter((x) => x.box.checked).map((x) => x.a.code),
      videos_included: Number(included.value) || 0, videos_used: Number(used.value) || 0,
      period_start: start.value || null, period_end: end.value || null, commitment_until: commit.value || null,
      payment_status: pay.value as PaymentStatus, price_net: price.value === '' ? null : Number(price.value), note: note.value.trim() || null,
    });
    formHost.replaceChildren(
      field('Balík', 'sub-plan', plan),
      ...(addonBoxes.length ? [el('fieldset', { class: 'addons' }, el('legend', {}, 'Mesačné doplnky'),
        ...addonBoxes.map(({ a, box }) => el('label', { class: 'check', for: `addon-${a.code}` }, box, `${a.label} (+${a.price_net} € / mes.)`)))] : []),
      el('div', { class: 'two' }, field('Videí v balíku', 'sub-included', included), field('Cena v čistom (€)', 'sub-price', price)),
      el('div', { class: 'field' }, label('sub-used', 'Použité videá'), stepper),
      el('div', { class: 'two' }, field('Obdobie od', 'sub-start', start), field('Obdobie do', 'sub-end', end)),
      el('div', { class: 'two' }, field('Viazanosť do', 'sub-commit', commit), field('Platba', 'sub-pay', pay)),
      field('Poznámka', 'sub-note', note));
    formHost.addEventListener('change', () => touched.add(cat), { once: true });
    formHost.addEventListener('input', () => touched.add(cat), { once: true });
  }

  // ---- content items (saved immediately) ----
  const list = el('ul', { class: 'staff-items', 'data-testid': 'staff-items' });
  const drawItems = () => list.replaceChildren(...(items.length ? items.map((it) => el('li', { 'data-testid': 'staff-item' },
    el('span', { class: 'si-title' }, it.title, el('small', {}, ` · ${KIND_LABEL[it.kind]}${it.due_date ? ' · ' + fmtDateFull(it.due_date) : ''}`)),
    (() => {
      const s = select(`item-status-${it.id}`, Object.entries(STATUS_LABEL) as [ContentStatus, string][], it.status);
      s.setAttribute('aria-label', `Stav: ${it.title}`); s.dataset.testid = 'item-status';
      s.addEventListener('change', async () => {
        try { const next = { ...it, status: s.value as ContentStatus }; await adapter.data.saveContent(next); items = items.map((x) => (x.id === it.id ? next : x)); }
        catch { showError('Stav sa nepodarilo uložiť.'); s.value = it.status; }
      });
      return s;
    })(),
    el('button', { type: 'button', class: 'icon-btn', 'aria-label': `Odstrániť ${it.title}`, 'data-testid': 'item-delete', onclick: async () => {
      try { await adapter.data.deleteContent(it.id); items = items.filter((x) => x.id !== it.id); drawItems(); } catch { showError('Položku sa nepodarilo odstrániť.'); }
    } }, '×'))) : [el('li', { class: 'muted' }, 'Zatiaľ žiadne položky.')]));
  drawItems();
  const iTitle = el('input', { id: 'item-title', type: 'text', maxlength: '200', placeholder: 'napr. Video o novej ponuke', 'data-testid': 'item-title' });
  const iKind = select<ContentKind>('item-kind', Object.entries(KIND_LABEL) as [ContentKind, string][], 'ponuka');
  const iDue = el('input', { id: 'item-due', type: 'date', 'data-testid': 'item-due' });
  const add = el('button', { type: 'button', class: 'btn btn-ghost small', 'data-testid': 'item-add', onclick: async () => {
    const title = iTitle.value.trim();
    if (!title) { showError('Zadajte názov položky.'); iTitle.focus(); return; }
    const item: ContentItem = { id: uuid(), customer_id: customerId, title, kind: iKind.value as ContentKind, due_date: iDue.value || null, status: 'planned', video_ref: null, note: null };
    try { await adapter.data.saveContent(item); items = [...items, item]; drawItems(); iTitle.value = ''; iTitle.focus(); }
    catch { showError('Položku sa nepodarilo pridať.'); }
  } }, icon('check', 16), 'Pridať položku');

  const field = (lab: string, id: string, ctl: HTMLElement) => el('div', { class: 'field' }, label(id, lab), ctl);
  dlg.append(el('form', { onsubmit: async (e) => {
    e.preventDefault(); save.disabled = true;
    drafts.set(cat, read());
    try { for (const k of touched) await adapter.data.saveSubscription(drafts.get(k)!); dlg.close(); }
    catch { showError('Predplatné sa nepodarilo uložiť. Skúste to znova.'); }
    finally { save.disabled = false; }
  } },
    el('h2', { id: 'sub-title' }, 'Predplatné a plán'),
    el('p', { class: 'muted' }, customerName),
    catTabs, formHost,
    el('div', { class: 'sheet-actions' }, el('button', { type: 'button', class: 'btn btn-ghost', 'data-testid': 'sub-close', onclick: () => dlg.close() }, 'Zavrieť'), save),
    el('hr', {}),
    el('h3', {}, 'Plán obsahu'), list,
    el('div', { class: 'add-item' }, field('Názov', 'item-title', iTitle), el('div', { class: 'two' }, field('Druh', 'item-kind', iKind), field('Termín', 'item-due', iDue)), add)));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  draw();
  dlg.showModal();
}
