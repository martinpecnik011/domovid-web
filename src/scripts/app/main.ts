import { isConfigured, DASHBOARD_URL, CALCULATOR_FILE } from '../../config/supabase';
import { messagesToCsv, downloadText } from './csv';
import type { Adapter, Addon, ContentItem, Conversation, Message, Plan, Profile, Session, Subscription } from './types';
import { el, icon, label, initials, dayLabel, fmtTime, fmtDay, fmtSize, uuid, safeHttp, errorBox, showError, NS } from './dom';
import { renderLogin, renderMfa } from './auth-ui';
import { renderPlanPage, renderPricing, interestMessage, addonMessage } from './plan';
import { openSubscriptionPanel } from './staff-plan';
import { captureIntent, takeIntent, takeDraft, openOffer, type OfferPrefill } from './offer';

const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
const useMock = !isConfigured || new URLSearchParams(location.search).get('mock') === '1';
// Supabase free plan: 50 MB per file (bucket `chat` uses the same limit).
const MAX_BYTES = 50 * 1024 * 1024;
const TIMECODE = /^\d{1,3}:[0-5]\d$/;
const URL_ONLY = /^https?:\/\/\S+$/i;
const root = document.getElementById('app')!;

// ---- state ----
let adapter: Adapter;
let session: Session | null = null;
let profile: Profile | null = null;
let convs: Conversation[] = [];
let activeId: string | null = null;
let messages: Message[] = [];
let unsub: (() => void) | null = null;
let nav: { setView(v: 'chat' | 'plan' | 'pricing'): void } | null = null;
let ui: { thread: HTMLElement; list?: HTMLElement; title: HTMLElement; sub: HTMLElement; avatar: HTMLElement; shell: HTMLElement; composer: { reset(): void; prefill(t: string): void; openEdit(): void } } | null = null;
let query = '';
let renderedFor: string | null = null;
let seen = new Set<string>();

// ---- banners ----
const offline = el('div', { class: 'banner', role: 'status', 'data-testid': 'offline-banner', hidden: true }, 'Ste offline. Správy sa odošlú po obnovení pripojenia.');
const syncOnline = () => { offline.hidden = navigator.onLine; };
window.addEventListener('online', syncOnline);
window.addEventListener('offline', syncOnline);

// ---- messages ----
const senderName = (m: Message): string => {
  if (m.sender_id === session?.userId) return profile?.role === 'staff' ? 'Domovid' : 'Vy';
  const c = convs.find((x) => x.id === m.conversation_id);
  if (profile?.role === 'staff' && c && m.sender_id === c.customer_id) return c.customer?.full_name || c.customer?.email || 'Zákazník';
  return 'Domovid';
};

function renderAttachment(a: Message['attachments'][number]): Node {
  if (!a.url) return el('p', { class: 'file' }, icon('link', 16), a.original_name);
  if (a.mime_type.startsWith('image/')) return el('a', { class: 'media', href: a.url, target: '_blank', rel: 'noopener' }, el('img', { src: a.url, alt: a.original_name, loading: 'lazy', 'data-testid': 'att-image' }));
  if (a.mime_type.startsWith('video/')) return el('video', { class: 'media', src: a.url, controls: true, playsinline: true, preload: 'metadata', 'aria-label': a.original_name, 'data-testid': 'att-video' });
  return el('a', { class: 'file', href: a.url, target: '_blank', rel: 'noopener', 'data-testid': 'att-file' }, icon('download', 16), `${a.original_name} (${fmtSize(a.size_bytes)})`);
}

function renderMessage(m: Message, animate: boolean): Node {
  if (m.kind === 'system') return el('p', { class: 'msg-system', 'data-testid': 'msg', 'data-kind': 'system' }, m.body);
  const own = m.sender_id === session?.userId;
  const bubble = el('article', { class: `msg ${own ? 'own' : 'other'}${animate ? ' fresh' : ''}`, 'data-testid': 'msg', 'data-kind': m.kind });
  if (!own) bubble.append(el('p', { class: 'who' }, senderName(m)));
  if (m.kind === 'edit_request') {
    const card = el('div', { class: 'card', 'data-testid': 'edit-card' }, el('strong', { class: 'card-title' }, icon('scissors', 16), 'Požiadavka na úpravu'));
    if (m.video_ref) card.append(el('p', {}, el('span', { class: 'k' }, 'Video: '), m.video_ref));
    if (m.timecode) card.append(el('p', {}, el('span', { class: 'k' }, 'Čas: '), el('span', { class: 'tc' }, icon('clock', 13), m.timecode)));
    bubble.append(card);
  }
  const href = m.kind === 'link' ? safeHttp(m.link_url) : null;
  if (href) {
    const u = new URL(href);
    bubble.append(el('a', { class: 'link-card', href, target: '_blank', rel: 'noopener noreferrer', 'data-testid': 'msg-link' },
      el('span', { class: 'link-ic' }, icon('link', 18)),
      el('span', { class: 'link-txt' }, el('strong', {}, u.hostname.replace(/^www\./, '')), el('span', {}, m.link_url))));
  } else if (m.body) bubble.append(el('p', { class: 'body' }, m.body));
  m.attachments.forEach((a) => bubble.append(renderAttachment(a)));
  const foot = el('span', { class: 'foot' }, el('time', { datetime: m.created_at }, fmtTime(m.created_at)));
  if (own) {
    const read = profile?.role === 'staff' ? m.read_by_customer_at : m.read_by_staff_at;
    foot.append(el('span', { class: `tick${read ? ' read' : ''}`, role: 'img', 'aria-label': read ? 'Prečítané' : 'Odoslané' }, icon('check', 14), read ? icon('check', 14) : null));
  }
  bubble.append(foot);
  return bubble;
}

function renderEmpty(): Node {
  const customer = profile?.role === 'customer';
  const art = document.createElementNS(NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 120 96', width: '120', height: '96', 'aria-hidden': 'true', fill: 'none' })) art.setAttribute(k, v);
  for (const [d, attrs] of [
    ['M14 50L60 14l46 36v34a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4z', { fill: '#fff', stroke: '#14232F', 'stroke-width': '3', 'stroke-linejoin': 'round' }],
    ['M4 54L60 10l56 44', { stroke: '#E0AD55', 'stroke-width': '5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
    ['M50 46l22 14-22 14z', { fill: '#E0AD55', stroke: '#14232F', 'stroke-width': '3', 'stroke-linejoin': 'round' }],
  ] as [string, Record<string, string>][]) { const path = document.createElementNS(NS, 'path'); path.setAttribute('d', d); for (const [k, v] of Object.entries(attrs)) path.setAttribute(k, v); art.append(path); }
  const chips = el('div', { class: 'quick' },
    el('button', { type: 'button', class: 'chip gold', 'data-testid': 'empty-offer', onclick: () => startOffer() }, icon('star', 16), 'Chcem ponuku'),
    el('button', { type: 'button', class: 'chip', onclick: () => ui?.composer.prefill('Dobrý deň, posielam fotky nehnuteľnosti.') }, icon('photo', 16), 'Poslať fotky nehnuteľnosti'),
    el('button', { type: 'button', class: 'chip', onclick: () => ui?.composer.openEdit() }, icon('scissors', 16), 'Požiadať o úpravu videa'),
    el('button', { type: 'button', class: 'chip', onclick: () => ui?.composer.prefill('Dobrý deň, posielam referenciu: ') }, icon('star', 16), 'Poslať referenciu'));
  return el('div', { class: 'empty' }, art,
    el('h3', {}, customer ? 'Začnite konverzáciu' : 'Vyberte konverzáciu'),
    el('p', {}, customer ? 'Napíšte nám, radi pomôžeme.' : 'Zatiaľ tu nie sú žiadne správy.'),
    customer ? chips : null);
}

function renderThread() {
  if (!ui) return;
  const t = ui.thread;
  const stick = t.scrollHeight - t.scrollTop - t.clientHeight < 80 || !t.childElementCount;
  const first = renderedFor !== activeId;
  if (first) seen = new Set();
  const nodes: Node[] = [];
  let lastDay = '';
  for (const m of messages) {
    const day = new Date(m.created_at).toDateString();
    if (day !== lastDay) { nodes.push(el('p', { class: 'day-sep' }, el('span', {}, dayLabel(m.created_at)))); lastDay = day; }
    nodes.push(renderMessage(m, !first && !seen.has(m.id)));
    seen.add(m.id);
  }
  renderedFor = activeId;
  t.replaceChildren(...(nodes.length ? nodes : [renderEmpty()]));
  if (stick) {
    t.scrollTop = t.scrollHeight;
    t.querySelectorAll('img').forEach((i) => i.addEventListener('load', () => { t.scrollTop = t.scrollHeight; }, { once: true }));
  }
}

function renderList() {
  if (!ui?.list) return;
  const q = query.trim().toLowerCase();
  const sorted = [...convs].sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''))
    .filter((c) => !q || `${c.customer?.full_name ?? ''} ${c.customer?.email ?? ''} ${c.title ?? ''}`.toLowerCase().includes(q));
  ui.list.replaceChildren(...(sorted.length ? sorted.map((c) => {
    const name = c.customer?.full_name || c.customer?.email || c.title || 'Zákazník';
    return el('li', {}, el('button', { type: 'button', class: `conv${c.id === activeId ? ' active' : ''}`, 'data-testid': 'conv-item', 'data-id': c.id, 'aria-current': c.id === activeId ? 'true' : undefined, onclick: () => { void openConversation(c.id); } },
      el('span', { class: 'avatar', 'aria-hidden': 'true' }, initials(name)),
      el('span', { class: 'conv-main' }, el('span', { class: 'conv-name' }, name), el('span', { class: 'conv-sub' }, c.customer?.email ?? '')),
      el('span', { class: 'conv-meta' }, el('span', { class: 'conv-day' }, fmtDay(c.last_message_at)),
        c.unread ? el('span', { class: 'badge', 'data-testid': 'unread-badge', 'aria-label': `${c.unread} neprečítaných` }, String(c.unread)) : null)));
  }) : [el('li', { class: 'list-empty' }, q ? 'Nič sme nenašli.' : 'Zatiaľ žiadne konverzácie.')]));
}

async function loadMessages() {
  if (!activeId) { messages = []; return; }
  messages = await adapter.data.getMessages(activeId);
  const role = profile!.role;
  const col = role === 'staff' ? 'read_by_staff_at' : 'read_by_customer_at';
  if (messages.some((m) => m.sender_id !== session!.userId && !m[col])) {
    await adapter.data.markRead(activeId, role);
    convs = await adapter.data.listConversations();
  }
}

let refreshing: Promise<void> | null = null;
let again = false;
function refresh(): Promise<void> {
  if (refreshing) { again = true; return refreshing; }
  refreshing = (async () => {
    try {
      do {
        again = false;
        convs = await adapter.data.listConversations();
        if (activeId && !convs.some((c) => c.id === activeId)) activeId = null;
        await loadMessages();
        renderList(); renderThread();
        const c = convs.find((x) => x.id === activeId);
        if (ui) {
          const staffView = profile?.role === 'staff';
          const nm = staffView ? (c?.customer?.full_name || c?.customer?.email || c?.title || '') : 'Tím Domovid';
          ui.title.textContent = nm;
          ui.sub.textContent = staffView ? (c?.customer?.email ?? '') : 'zvyčajne odpovedáme do pár hodín';
          if (staffView) ui.avatar.textContent = initials(nm);
          else if (!ui.avatar.querySelector('img')) ui.avatar.replaceChildren(el('img', { src: `${base}media/logo.png`, alt: '', width: '46', height: '46' }));
          ui.avatar.classList.toggle('online', !staffView);
        }
      } while (again);
    } catch { showError('Správy sa nepodarilo načítať. Skontrolujte pripojenie.'); }
    finally { refreshing = null; }
  })();
  return refreshing;
}

async function openConversation(id: string) {
  activeId = id;
  ui?.composer.reset();
  ui?.shell.classList.add('has-active');
  await refresh();
  (document.querySelector('[data-testid="composer-text"]') as HTMLElement | null)?.focus();
}

// ---- composer ----
function buildComposer() {
  let files: File[] = [];
  let edit = false;
  let busy = false;
  const text = el('textarea', { id: 'composer-text', rows: '1', maxlength: '4000', placeholder: 'Napíšte správu…', 'data-testid': 'composer-text' });
  const video = el('input', { id: 'edit-video', type: 'text', maxlength: '300', placeholder: 'napr. Byt Záhorská', 'data-testid': 'edit-video' });
  const time = el('input', { id: 'edit-time', type: 'text', maxlength: '8', inputmode: 'numeric', placeholder: '0:12', 'data-testid': 'edit-time' });
  const editBox = el('div', { class: 'edit-fields', hidden: true },
    el('p', { class: 'edit-title' }, icon('scissors', 16), 'Požiadavka na úpravu videa'),
    el('div', {}, label('edit-video', 'Video'), video), el('div', {}, label('edit-time', 'Čas (m:ss)'), time));
  const toggle = el('button', { type: 'button', class: 'icon-btn', 'aria-pressed': 'false', title: 'Požiadavka na úpravu', 'data-testid': 'edit-toggle', onclick: () => setEdit(!edit) },
    icon('scissors', 20), el('span', { class: 'sr-only' }, 'Požiadavka na úpravu'));
  function setEdit(on: boolean) {
    edit = on; toggle.setAttribute('aria-pressed', String(edit)); editBox.hidden = !edit;
    if (edit) video.focus();
  }
  const input = el('input', { type: 'file', multiple: true, accept: 'image/*,video/*,application/pdf', hidden: true, 'data-testid': 'file-input', 'aria-label': 'Súbory' });
  const attach = el('button', { type: 'button', class: 'icon-btn', title: 'Priložiť súbor', 'data-testid': 'attach-btn', onclick: () => input.click() },
    icon('clip', 20), el('span', { class: 'sr-only' }, 'Priložiť súbor'));
  const previews = el('ul', { class: 'previews', 'data-testid': 'previews' });
  const bars = new Map<File, HTMLProgressElement>();
  const sendBtn = el('button', { type: 'submit', class: 'send', 'data-testid': 'send-btn' }, icon('up', 22), el('span', { class: 'sr-only' }, 'Odoslať'));

  function drawPreviews() {
    bars.clear();
    previews.replaceChildren(...files.map((f) => {
      const bar = el('progress', { max: '1', value: '0', hidden: true, 'aria-label': `Nahrávanie ${f.name}` });
      bars.set(f, bar);
      return el('li', { 'data-testid': 'preview' },
        f.type.startsWith('image/') ? el('img', { src: URL.createObjectURL(f), alt: '' }) : el('span', { class: 'ext', 'aria-hidden': 'true' }, f.type.startsWith('video/') ? 'VIDEO' : 'PDF'),
        el('span', { class: 'pname' }, `${f.name} (${fmtSize(f.size)})`), bar,
        el('button', { type: 'button', class: 'x', 'aria-label': `Odstrániť ${f.name}`, onclick: () => { files = files.filter((x) => x !== f); drawPreviews(); } }, '×'));
    }));
  }
  input.addEventListener('change', () => {
    for (const f of Array.from(input.files ?? [])) {
      if (f.size > MAX_BYTES) showError(`Súbor „${f.name}“ je väčší ako 50 MB. Väčšie video nám pošlite ako odkaz (napr. WeTransfer alebo Google Drive).`);
      else if (!/^(image\/|video\/)|^application\/pdf$/.test(f.type)) showError(`Súbor „${f.name}“ nie je podporovaný. Priložte obrázok, video alebo PDF.`);
      else files.push(f);
    }
    input.value = '';
    drawPreviews();
  });

  function reset() {
    files = []; edit = false; text.value = ''; video.value = ''; time.value = '';
    setEdit(false); drawPreviews();
  }
  const prefill = (t: string) => { text.value = t; text.focus(); };

  async function send() {
    if (busy || !activeId) return;
    if (!navigator.onLine) { showError('Ste offline. Správu odošlete po obnovení pripojenia.'); return; }
    const body = text.value.trim();
    const video_ref = edit ? video.value.trim() || null : null;
    const timecode = edit ? time.value.trim() || null : null;
    if (timecode && !TIMECODE.test(timecode)) { showError('Čas zadajte v tvare m:ss, napr. 0:12.'); time.focus(); return; }
    if (!body && !files.length && !(edit && (video_ref || timecode))) { if (edit) showError('Popíšte, čo máme upraviť.'); return; }
    const kind = edit ? 'edit_request' : files.length ? 'file' : URL_ONLY.test(body) ? 'link' : 'text';
    const id = uuid();
    const convId = activeId;
    const pending = [...files];
    busy = true; sendBtn.disabled = true;
    try {
      await adapter.data.sendMessage({ id, conversationId: convId, kind, body: body || null, link_url: kind === 'link' ? body : null, video_ref, timecode });
    } catch { showError('Správu sa nepodarilo odoslať. Skúste to znova.'); busy = false; sendBtn.disabled = false; return; }
    let failed = false;
    for (const f of pending) {
      const bar = bars.get(f);
      if (bar) bar.hidden = false;
      try { await adapter.data.uploadAttachment(convId, id, f, (r) => { if (bar) bar.value = r; }); }
      catch { failed = true; showError(`Nahratie súboru „${f.name}“ zlyhalo. Pošlite ho prosím znova.`); }
    }
    busy = false; sendBtn.disabled = false;
    if (!failed) reset(); else { text.value = ''; files = []; drawPreviews(); }
    await refresh();
    text.focus();
  }

  const root = el('form', { class: 'composer', 'data-testid': 'composer', onsubmit: (e) => { e.preventDefault(); void send(); } },
    previews, editBox,
    label('composer-text', 'Správa', 'sr-only'),
    el('div', { class: 'pill' }, attach, toggle, text, sendBtn, input));
  text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); void send(); } });
  return { root, reset, prefill, openEdit: () => setEdit(true) };
}

// ---- offer questionnaire ----
function startOffer(prefill: OfferPrefill | null = null) {
  if (!profile || !activeId || profile.role !== 'customer') return;
  openOffer({ adapter, profile, conversationId: activeId, prefill, done: (p) => {
    profile = p;
    nav?.setView('chat');
    const roleLabel = document.querySelector('[data-testid="role-label"]');
    if (roleLabel) roleLabel.textContent = p.full_name || p.email;
    void refresh();
  } });
}

// ---- profile sheet ----
function openProfile() {
  const p = profile!;
  const field = (id: string, text: string, value: string | null, type = 'text', ac = '') => {
    const i = el('input', { id, type, value: value ?? '', maxlength: '120', autocomplete: ac || undefined, 'data-testid': id });
    return { i, wrap: el('div', { class: 'field' }, label(id, text), i) };
  };
  const name = field('profile-name', 'Meno', p.full_name, 'text', 'name');
  const phone = field('profile-phone', 'Telefón', p.phone, 'tel', 'tel');
  const company = field('profile-company', 'Firma', p.company, 'text', 'organization');
  const dlg = el('dialog', { class: 'sheet', 'aria-labelledby': 'profile-title', 'data-testid': 'profile-sheet' });
  const save = el('button', { type: 'submit', class: 'btn btn-gold', 'data-testid': 'profile-save' }, 'Uložiť');
  dlg.append(el('form', { onsubmit: async (e) => {
    e.preventDefault(); save.disabled = true;
    try {
      const patch = { full_name: name.i.value.trim() || null, phone: phone.i.value.trim() || null, company: company.i.value.trim() || null };
      await adapter.data.updateProfile(patch);
      profile = { ...p, ...patch };
      dlg.close();
    } catch { showError('Profil sa nepodarilo uložiť. Skúste to znova.'); }
    finally { save.disabled = false; }
  } },
    el('h2', { id: 'profile-title' }, 'Váš profil'),
    el('p', { class: 'note' }, p.email),
    name.wrap, phone.wrap, company.wrap,
    el('div', { class: 'sheet-actions' }, el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => dlg.close() }, 'Zavrieť'), save)));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

// ---- app shell ----
async function renderApp() {
  const staff = profile!.role === 'staff';
  const comp = buildComposer();
  const title = el('h2', { class: 'thread-title', 'data-testid': 'thread-title' });
  const sub = el('p', { class: 'thread-sub' });
  const avatar = el('span', { class: 'avatar lg', 'aria-hidden': 'true' });
  const thread = el('div', { class: 'thread', role: 'log', 'aria-live': 'polite', 'aria-label': 'Správy', tabindex: '0', 'data-testid': 'thread' });
  const exportBtn = el('button', { type: 'button', class: 'btn btn-ghost small', 'data-testid': 'export-csv', onclick: () => {
    if (!activeId) return;
    const c = convs.find((x) => x.id === activeId);
    const slug = (c?.customer?.email || activeId).replace(/[^\w.-]+/g, '_');
    downloadText(`konverzacia-${slug}.csv`, messagesToCsv(messages, senderName));
  } }, icon('download', 16), 'Exportovať CSV');
  const subBtn = el('button', { type: 'button', class: 'btn btn-ghost small', 'data-testid': 'sub-open', onclick: () => {
    const c = convs.find((x) => x.id === activeId);
    if (c) void openSubscriptionPanel(adapter, c.customer_id, c.customer?.full_name || c.customer?.email || 'Zákazník').catch(() => showError('Predplatné sa nepodarilo načítať.'));
  } }, icon('plan', 16), 'Predplatné a plán');
  const back = el('button', { type: 'button', class: 'icon-btn back', 'data-testid': 'back-to-list', onclick: () => { activeId = null; ui?.shell.classList.remove('has-active'); void refresh(); } }, icon('back', 20), el('span', { class: 'sr-only' }, 'Späť'));
  const offerBtn = el('button', { type: 'button', class: 'btn btn-gold small', 'data-testid': 'offer-open', onclick: () => startOffer() }, icon('star', 16), el('span', {}, 'Chcem ďalšiu ponuku'));
  const pane = el('section', { class: 'pane', 'aria-label': 'Konverzácia' },
    el('div', { class: 'pane-head' }, staff ? back : null, avatar, el('div', { class: 'head-txt' }, title, sub), el('div', { class: 'head-actions' }, ...(staff ? [subBtn, exportBtn] : [offerBtn]))), thread, comp.root);
  // customer-only pages: Môj plán / Cenník next to the chat
  let view: 'chat' | 'plan' | 'pricing' = 'chat';
  const page = el('section', { class: 'page', hidden: true, 'data-testid': 'page', 'aria-live': 'polite' });
  const tabs = el('div', { class: 'tabs', role: 'group', 'aria-label': 'Sekcie', 'data-testid': 'tabs' });
  const tabBtns = (['chat', 'plan', 'pricing'] as const).map((v) => el('button', { type: 'button', class: 'tab', 'aria-pressed': v === 'chat' ? 'true' : 'false', 'data-testid': `tab-${v}`, onclick: () => setView(v) }, v === 'chat' ? 'Chat' : v === 'plan' ? 'Môj plán' : 'Cenník'));
  tabs.append(...tabBtns);
  async function showPage() {
    try {
      const [plans, addons, subs, items] = await Promise.all([adapter.data.listPlans(), adapter.data.listAddons(), adapter.data.getSubscriptions(profile!.id), adapter.data.listContent(profile!.id)]);
      if (view === 'plan') renderPlanPage(page, { subs, plans, addons, items, toPricing: () => setView('pricing'), approve: (it) => { setView('chat'); ui?.composer.prefill(`Pozrel som si „${it.title}“ a schvaľujem ho.`); } });
      else if (view === 'pricing') renderPricing(page, { subs, plans, addons, choose: (p: Plan) => { void sendInterest(interestMessage(p)); }, chooseAddon: (a: Addon) => { void sendInterest(addonMessage(a)); } });
    } catch { showError('Plán sa nepodarilo načítať. Skontrolujte pripojenie.'); }
  }
  async function sendInterest(body: string) {
    if (!activeId) return;
    try {
      await adapter.data.sendMessage({ id: uuid(), conversationId: activeId, kind: 'text', body });
      setView('chat');
      await refresh();
    } catch { showError('Správu sa nepodarilo odoslať. Skúste to znova.'); }
  }
  function setView(v: 'chat' | 'plan' | 'pricing') {
    view = v;
    tabBtns.forEach((b, i) => b.setAttribute('aria-pressed', String((['chat', 'plan', 'pricing'] as const)[i] === v)));
    pane.hidden = v !== 'chat'; page.hidden = v === 'chat';
    if (v !== 'chat') void showPage();
  }
  nav = staff ? null : { setView };
  const search = el('input', { id: 'conv-search', type: 'search', placeholder: 'Hľadať zákazníka', autocomplete: 'off', 'data-testid': 'conv-search', oninput: (e) => { query = (e.target as HTMLInputElement).value; renderList(); } });
  const list = staff ? el('ul', { class: 'conv-list', 'data-testid': 'conv-list' }) : undefined;
  const shell = el('div', { class: staff ? 'staff' : 'customer', 'data-testid': staff ? 'staff-inbox' : 'customer-chat' },
    staff ? el('nav', { class: 'list', 'aria-label': 'Konverzácie' }, el('h2', {}, 'Konverzácie'),
      el('div', { class: 'input-icon search' }, icon('search', 16), label('conv-search', 'Hľadať zákazníka', 'sr-only'), search), list!) : null, pane, staff ? null : page);
  ui = { thread, list, title, sub, avatar, shell, composer: comp };
  query = ''; renderedFor = null;
  document.body.dataset.view = 'app';

  const header = el('header', { class: 'top' },
    el('a', { class: 'logo', href: base, 'data-testid': 'logo-link' }, 'Domov', el('span', {}, 'id')),
    el('a', { class: 'web-link', href: base, 'data-testid': 'back-to-web' }, icon('back', 14), 'Späť na web'),
    el('span', { class: 'role', 'data-testid': 'role-label' }, staff ? 'Tím Domovid' : (profile!.full_name || profile!.email)),
    adapter.mock ? el('button', { type: 'button', class: 'mock-pill', 'data-testid': 'mock-switch', onclick: () => adapter.mock!.switchTo(staff ? 'customer' : 'staff') }, staff ? 'Mock: prepnúť na zákazníka' : 'Mock: prepnúť na staff') : null,
    el('button', { type: 'button', class: 'btn btn-ghost small', 'data-testid': 'profile-open', 'aria-label': 'Profil', onclick: openProfile }, icon('user', 16), el('span', { class: 'btn-txt' }, 'Profil')),
    el('button', { type: 'button', class: 'btn btn-ghost small', 'aria-label': 'Odhlásiť', 'data-testid': 'sign-out', onclick: () => { void adapter.auth.signOut(); } }, icon('out', 16), el('span', { class: 'btn-txt' }, 'Odhlásiť')));
  // admins: Chaty (all customers) / Kalkulačka (private bucket) / Domo dashboard (PIN on the Mac)
  type StaffView = 'chat' | 'calc' | 'dash';
  const staffPage = el('section', { class: 'page wide', hidden: true, 'data-testid': 'staff-page', 'aria-live': 'polite' });
  const staffTabDefs: [StaffView, string][] = [['chat', 'Chaty'], ['calc', 'Kalkulačka'], ['dash', 'Domo dashboard']];
  const staffTabs = el('div', { class: 'tabs', role: 'group', 'aria-label': 'Sekcie tímu', 'data-testid': 'staff-tabs' });
  const staffTabBtns = staffTabDefs.map(([v, t]) => el('button', { type: 'button', class: 'tab', 'aria-pressed': v === 'chat' ? 'true' : 'false', 'data-testid': `stab-${v}`, onclick: () => { void setStaffView(v); } }, t));
  staffTabs.append(...staffTabBtns);
  async function setStaffView(v: StaffView) {
    staffTabBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(staffTabDefs[i][0] === v)));
    shell.hidden = v !== 'chat'; staffPage.hidden = v === 'chat';
    if (v === 'dash') {
      staffPage.replaceChildren(el('div', { class: 'page-in tool-card' },
        el('h2', { class: 'page-title' }, 'Domo dashboard'),
        el('p', { class: 'muted' }, 'Prehľad zákaziek, taskov, stretnutí a schvaľovania od agenta Domo. Otvorí sa v novom okne a vypýta váš PIN.'),
        el('a', { class: 'btn btn-gold', href: DASHBOARD_URL, target: '_blank', rel: 'noopener noreferrer', 'data-testid': 'open-dashboard' }, icon('plan', 16), 'Otvoriť dashboard'),
        el('p', { class: 'note' }, 'Dashboard beží na počítači Domovidu; mimo neho sa otvorí až po zapnutí vzdialeného prístupu.')));
      return;
    }
    if (v === 'calc') {
      staffPage.replaceChildren(el('p', { class: 'loading' }, 'Načítavame kalkulačku…'));
      try {
        const html = await adapter.data.getStaffTool(CALCULATOR_FILE);
        const frame = el('iframe', { class: 'tool-frame', title: 'Kalkulačka Domovid', sandbox: 'allow-scripts allow-same-origin allow-downloads allow-popups allow-modals', 'data-testid': 'calc-frame' });
        frame.srcdoc = html;
        staffPage.replaceChildren(frame);
      } catch {
        staffPage.replaceChildren(el('div', { class: 'page-in tool-card' },
          el('h2', { class: 'page-title' }, 'Kalkulačka'),
          el('p', { class: 'muted', 'data-testid': 'calc-error' }, 'Kalkulačku sa nepodarilo načítať. Je prístupná len adminom s overením v dvoch krokoch.')));
      }
    }
  }
  root.replaceChildren(header, staff ? staffTabs : tabs, shell, ...(staff ? [staffPage] : []));

  activeId = null;
  convs = await adapter.data.listConversations();
  if (!staff) {
    activeId = convs[0]?.id ?? null;
    if (!activeId) showError('Konverzáciu práve pripravujeme. Obnovte stránku o chvíľu.');
  } else if (convs.length && !matchMedia('(max-width: 760px)').matches) activeId = convs[0].id;
  if (activeId) shell.classList.add('has-active');
  await refresh();
  if (!staff) {
    const draft = takeDraft();
    if (draft) ui?.composer.prefill(draft);
    const intent = takeIntent();
    if (intent) startOffer(intent);
  }
  const u1 = adapter.data.subscribe(staff ? null : activeId, () => { void refresh(); });
  const u2 = staff ? () => {} : adapter.data.subscribePlan(profile!.id, () => { if (view !== 'chat') void showPage(); });
  unsub = () => { u1(); u2(); };
}

// Security: a sign-in lasts at most 30 days, then the user signs in again. Supabase refresh tokens would keep the
// session alive forever (server-side time-boxing is a paid feature), so the app enforces the limit itself.
const LOGIN_KEY = 'domovid-login-at';
const MAX_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
function sessionExpired(s: Session): boolean {
  try {
    const raw = localStorage.getItem(LOGIN_KEY);
    const rec = raw ? (JSON.parse(raw) as { u: string; t: number }) : null;
    if (!rec || rec.u !== s.userId) { localStorage.setItem(LOGIN_KEY, JSON.stringify({ u: s.userId, t: Date.now() })); return false; }
    return Date.now() - rec.t > MAX_SESSION_MS;
  } catch { return false; }
}
const forgetLogin = () => { try { localStorage.removeItem(LOGIN_KEY); } catch { /* storage blocked */ } };

async function onSession(s: Session | null) {
  if (s && session?.userId === s.userId) return;
  unsub?.(); unsub = null; ui = null; nav = null; activeId = null; messages = []; convs = [];
  session = s; profile = null;
  if (!s) { forgetLogin(); renderLogin(adapter, root, base); return; }
  if (sessionExpired(s)) {
    forgetLogin();
    await adapter.auth.signOut().catch(() => {});
    showError('Z bezpečnostných dôvodov vás po 30 dňoch odhlásime. Prihláste sa, prosím, znova.');
    return;
  }
  try {
    profile = await adapter.data.getProfile();
    if (!profile) throw new Error('no profile');
    const need = await adapter.auth.mfaState();
    if (need.kind !== 'none') { renderMfa(adapter, root, base, need, () => { void renderApp().catch(() => showError('Aplikáciu sa nepodarilo načítať.')); }); return; }
    await renderApp();
  } catch { showError('Profil sa nepodarilo načítať. Skúste sa znova prihlásiť.'); }
}

async function init() {
  captureIntent();
  document.body.prepend(offline, errorBox);
  syncOnline();
  root.replaceChildren(el('p', { class: 'loading' }, 'Načítavame…'));
  adapter = useMock ? (await import('./mock')).createMock() : (await import('./real')).createReal(base);
  adapter.auth.onAuthStateChange((s) => { void onSession(s); });
  if (adapter.mock && new URLSearchParams(location.search).get('as') === 'staff' && !(await adapter.auth.getSession())) adapter.mock.switchTo('staff');
  await onSession(await adapter.auth.getSession());
}
void init();
