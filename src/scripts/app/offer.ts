import type { Adapter, Profile } from './types';
import { el, icon, label, uuid, fmtSize, showError } from './dom';
import { FORM_ENDPOINT, DELIVERY, PRICES, withVat } from '../../config/site';
import { SOCIAL_TOPICS } from '../social-picker';

// The offer questionnaire ("Chcem ponuku"). Only signed-in customers fill it; the answers and photos
// land in their private chat as one message. Contact fields are asked only while the profile lacks them.

const INTENT_KEY = 'domovid-offer-intent';
const MAX_PHOTOS = 10;
const MAX_PHOTO_BYTES = 25 * 1024 * 1024;

type Service = 'video' | 'viz' | 'social';
const SERVICES: { id: Service; name: string; hint: string }[] = [
  { id: 'video', name: 'Video z fotiek', hint: 'z fotiek ponuky video s pohybom kamery' },
  { id: 'viz', name: 'Vizualizácia', hint: 'prázdnu izbu premeníme na zariadenú' },
  { id: 'social', name: 'Obsah na sociálne siete', hint: '10, 15 alebo 30 videí mesačne' },
];
const PLANS = ['10', '15', '30'];
const TYPES = ['Byt', 'Rodinný dom', 'Pozemok', 'Komerčný priestor', 'Iné'];
const FORMATS = ['Na výšku 9:16', 'Na šírku 16:9', 'Oba formáty'];

/** pkg: a video package picked in the app's Cenník (net price; monthly or one-off). */
export interface OfferPrefill { service?: Service; plan?: string; topics?: string[]; text?: string; pkg?: { label: string; price: number; monthly: boolean } }

/** Remembers "the visitor wants an offer" across the login (and the Google redirect, which drops the query). */
export function captureIntent(): void {
  const q = new URLSearchParams(location.search);
  if (q.get('ponuka') !== '1') return;
  const s = q.get('sluzba');
  const intent: OfferPrefill = {
    service: s === 'video' || s === 'viz' || s === 'social' ? s : undefined,
    plan: PLANS.includes(q.get('balik') ?? q.get('plan') ?? '') ? (q.get('balik') ?? q.get('plan'))! : undefined,
    topics: q.getAll('temy').flatMap((t) => t.split(',')).filter((t) => SOCIAL_TOPICS.some((x) => x.key === t)),
    text: (q.get('text') ?? '').slice(0, 1500) || undefined,
  };
  try { sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent)); } catch { /* private mode: the offer just won't auto-open */ }
  q.delete('ponuka'); q.delete('sluzba'); q.delete('balik'); q.delete('plan'); q.delete('temy'); q.delete('text');
  const rest = q.toString();
  history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
}
/** Text typed into the web's mini chat; prefilled into the composer once, after sign-in. */
export function takeDraft(): string | null {
  try {
    const d = sessionStorage.getItem('domovid-chat-draft');
    sessionStorage.removeItem('domovid-chat-draft');
    return d ? d.slice(0, 1000) : null;
  } catch { return null; }
}
/** The visitor came via "Zaregistrovať sa". */
export const wantsSignup = () => new URLSearchParams(location.search).get('registracia') === '1';
export function hasIntent(): boolean {
  try { return sessionStorage.getItem(INTENT_KEY) !== null; } catch { return false; }
}
export function takeIntent(): OfferPrefill | null {
  try {
    const raw = sessionStorage.getItem(INTENT_KEY);
    sessionStorage.removeItem(INTENT_KEY);
    return raw ? (JSON.parse(raw) as OfferPrefill) : null;
  } catch { return null; }
}

/** Plain-text summary of the answers; it becomes the chat message body. */
export function offerSummary(a: Record<string, string>, service: Service, photos: number): string {
  const svc = SERVICES.find((s) => s.id === service)!.name;
  const rows: string[] = [`Nový dopyt: ${svc}`];
  if (service === 'social') {
    rows.push(`Balík: ${a.plan} videí mesačne`);
    if (a.topics) rows.push(`Témy: ${a.topics}`);
  } else {
    const facts = [a.type, a.location, a.price && `${a.price} €`, a.area && `${a.area} m²`].filter(Boolean).join(' · ');
    if (a.pkg) rows.push(`Balík: ${a.pkg}`);
    if (facts) rows.push(`Nehnuteľnosť: ${facts}`);
    if (a.format) rows.push(`Formát: ${a.format}`);
    if (photos) rows.push(`Fotky: ${photos} v prílohe`);
  }
  if (a.addons) rows.push(`Doplnky: ${a.addons}`);
  if (a.estimate) rows.push(`Orientačná cena: ${a.estimate}`);
  if (a.look) rows.push(`Poznámka: ${a.look}`);
  if (a.reference) rows.push(`Referencia: ${a.reference}`);
  return rows.join('\n');
}

export interface OfferDeps {
  adapter: Adapter;
  profile: Profile;
  conversationId: string;
  prefill?: OfferPrefill | null;
  /** Called after the message is in the chat (refresh the thread, update the profile). */
  done(profile: Profile): void;
}

export function openOffer({ adapter, profile, conversationId, prefill, done }: OfferDeps): void {
  const needContact = !profile.full_name || !profile.phone;
  let service: Service = prefill?.service ?? 'video';
  let photos: File[] = [];
  const id = (s: string) => `offer-${s}`;
  // The picked video package applies only while its service stays selected.
  const pkg = () => (prefill?.pkg && service === prefill.service && service !== 'social' ? prefill.pkg : null);
  const pkgText = (k: NonNullable<OfferPrefill['pkg']>) => `${k.label} (${k.price} € bez DPH${k.monthly ? ' / mesiac' : ', jednorazovo'})`;
  const pkgNote = el('p', { class: 'note', 'data-testid': 'offer-pkg' });

  const input = (name: string, attrs: Record<string, string | boolean>) => el('input', { id: id(name), name, 'data-testid': id(name), ...attrs });
  const field = (name: string, text: string, control: HTMLElement, cls = '') => el('div', { class: `field ${cls}` }, label(id(name), text), control);
  const radios = (name: string, values: string[], checked: string, text = (v: string) => v) =>
    el('div', { class: 'seg', role: 'radiogroup' }, ...values.map((v) =>
      el('label', { class: 'seg-opt' }, el('input', { type: 'radio', name, value: v, checked: v === checked, 'data-testid': `${id(name)}-${v}` }), el('span', {}, text(v)))));

  // service picker
  const svcBox = el('div', { class: 'svc-pick', role: 'radiogroup', 'aria-label': 'Služba' }, ...SERVICES.map((s) =>
    el('label', { class: 'svc-opt' },
      el('input', { type: 'radio', name: 'service', value: s.id, checked: s.id === service, 'data-testid': `offer-svc-${s.id}`, onchange: () => { service = s.id; sync(); } }),
      el('span', { class: 'svc-name' }, s.name), el('span', { class: 'svc-hint' }, s.hint))));

  // property block (video, viz)
  const type = el('select', { id: id('type'), name: 'type', 'data-testid': id('type') }, ...TYPES.map((t) => el('option', { value: t }, t)));
  const photoInput = el('input', { id: id('photos'), type: 'file', accept: 'image/*', multiple: true, class: 'sr-only', 'data-testid': id('photos') });
  const photoList = el('ul', { class: 'previews', 'data-testid': 'offer-previews' });
  const drawPhotos = () => photoList.replaceChildren(...photos.map((f) => el('li', {},
    el('img', { src: URL.createObjectURL(f), alt: '' }), el('span', { class: 'pname' }, `${f.name} (${fmtSize(f.size)})`),
    el('button', { type: 'button', class: 'x', 'aria-label': `Odstrániť ${f.name}`, onclick: () => { photos = photos.filter((x) => x !== f); drawPhotos(); } }, '×'))));
  photoInput.addEventListener('change', () => {
    for (const f of Array.from(photoInput.files ?? [])) {
      if (!f.type.startsWith('image/')) showError(`„${f.name}“ nie je fotka.`);
      else if (f.size > MAX_PHOTO_BYTES) showError(`Fotka „${f.name}“ je väčšia ako 25 MB.`);
      else if (photos.length >= MAX_PHOTOS) { showError(`Priložiť môžete najviac ${MAX_PHOTOS} fotiek.`); break; }
      else photos.push(f);
    }
    photoInput.value = '';
    drawPhotos();
  });
  const property = el('fieldset', { class: 'grp', 'data-testid': 'offer-property' },
    el('legend', {}, 'Nehnuteľnosť'),
    el('div', { class: 'grid2' },
      field('type', 'Typ', type),
      field('location', 'Lokalita', input('location', { type: 'text', maxlength: '160', placeholder: 'napr. Banská Bystrica, Radvaň' })),
      field('price', 'Cena (€)', input('price', { type: 'text', inputmode: 'numeric', maxlength: '40', placeholder: 'napr. 139 000' })),
      field('area', 'Plocha (m²)', input('area', { type: 'text', inputmode: 'decimal', maxlength: '40', placeholder: 'napr. 62' }))),
    el('div', { class: 'field' }, el('span', { class: 'lbl' }, 'Formát videa'), radios('format', FORMATS, FORMATS[0])),
    el('div', { class: 'field' },
      el('span', { class: 'lbl' }, 'Fotky nehnuteľnosti'),
      el('label', { for: id('photos'), class: 'drop' }, icon('photo', 22), el('span', {}, el('strong', {}, 'Vyberte 4–6 fotiek'), el('span', { class: 'hint' }, `stačia z mobilu, najviac ${MAX_PHOTOS}`))),
      photoInput, photoList));

  // social block
  const social = el('fieldset', { class: 'grp', 'data-testid': 'offer-social' },
    el('legend', {}, 'Obsah na sociálne siete'),
    el('div', { class: 'field' }, el('span', { class: 'lbl' }, 'Balík'), radios('plan', PLANS, prefill?.plan ?? '15', (v) => `${v} videí mesačne`)),
    el('div', { class: 'field' }, el('span', { class: 'lbl' }, 'Témy videí'),
      el('div', { class: 'checks' }, ...SOCIAL_TOPICS.map((t) => el('label', { class: 'check' },
        el('input', { type: 'checkbox', name: 'topics', value: t.label, checked: prefill?.topics?.includes(t.key) ?? false }), el('span', {}, t.label))))));

  const look = el('textarea', { id: id('look'), name: 'look', rows: '3', maxlength: '1500', 'data-testid': id('look'), placeholder: 'štýl, hudba, čo zdôrazniť, termín…' });
  look.value = prefill?.text ?? '';
  const common = el('div', { class: 'grp plain' },
    field('look', 'Čo by ste chceli', look),
    field('reference', 'Referenčné video (nepovinné)', input('reference', { type: 'url', maxlength: '500', placeholder: 'https://…' })));

  // Reads a field (or the checked radio of a group) once the form exists.
  const val = (name: string) => ((form.elements.namedItem(name) as HTMLInputElement | RadioNodeList | null)?.value ?? '').trim();

  // add-ons and the running estimate (net, with VAT underneath)
  const addonBox = el('div', { class: 'checks', 'data-testid': 'offer-addons' });
  const sum = el('p', { class: 'offer-sum', 'data-testid': 'offer-sum', 'aria-live': 'polite' });
  const addons = el('fieldset', { class: 'grp' }, el('legend', {}, 'Doplnky (nepovinné)'), addonBox, sum);
  const addonList = () => (service === 'social' ? PRICES.addons.social : PRICES.addons.video);
  function drawAddons() {
    addonBox.replaceChildren(...addonList().map((a) => el('label', { class: 'check' },
      el('input', { type: 'checkbox', name: 'addon', value: a.id, 'data-testid': `offer-addon-${a.id}`, onchange: () => { exclusive(); drawSum(); } }),
      el('span', {}, `${a.name} +${a.price} € / ${a.unit}`))));
  }
  const checked = () => Array.from(addonBox.querySelectorAll<HTMLInputElement>('input[name="addon"]:checked')).map((c) => c.value);
  // Digital twin already contains the voice clone.
  function exclusive() {
    const voice = addonBox.querySelector<HTMLInputElement>('input[value="voice"]');
    const twin = addonBox.querySelector<HTMLInputElement>('input[value="twin"]');
    if (voice && twin) { if (twin.checked) voice.checked = false; voice.disabled = twin.checked; }
  }
  function estimate(): { net: number; monthly: boolean } {
    const k = pkg();
    if (k) return { net: k.price + addonList().filter((a) => checked().includes(a.id)).reduce((n, a) => n + a.price, 0), monthly: k.monthly };
    const base = service === 'social'
      ? PRICES.social.plans.find((p) => String(p.videos) === val('plan'))?.price ?? 0
      : PRICES[service].single;
    const extra = addonList().filter((a) => checked().includes(a.id)).reduce((n, a) => n + a.price, 0);
    return { net: base + extra, monthly: service === 'social' };
  }
  function drawSum() {
    const e = estimate();
    sum.textContent = `Orientačne ${e.net} € bez DPH (${withVat(e.net)} s DPH)${e.monthly ? (service === 'social' ? ' mesačne, bez viazanosti' : ' mesačne') : ' za video'}. Prvé video na ukážku je zadarmo.`;
  }

  const contact = needContact ? el('fieldset', { class: 'grp', 'data-testid': 'offer-contact' },
    el('legend', {}, 'Kontakt'),
    el('div', { class: 'grid2' },
      field('name', 'Meno a priezvisko', input('name', { type: 'text', required: true, maxlength: '120', autocomplete: 'name', value: profile.full_name ?? '' })),
      field('phone', 'Telefón (WhatsApp)', input('phone', { type: 'tel', required: true, maxlength: '40', autocomplete: 'tel', value: profile.phone ?? '', placeholder: '+421 9xx xxx xxx' }))),
    el('label', { class: 'check consent' }, el('input', { type: 'checkbox', name: 'consent', required: true, 'data-testid': id('consent') }),
      el('span', {}, 'Súhlasím so spracovaním osobných údajov podľa ', el('a', { href: `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}ochrana-sukromia/`, target: '_blank', rel: 'noopener' }, 'zásad ochrany súkromia'), '.'))) : null;

  const submit = el('button', { type: 'submit', class: 'btn btn-gold', 'data-testid': 'offer-submit' }, 'Odoslať dopyt do chatu');
  const progress = el('p', { class: 'note', role: 'status', 'data-testid': 'offer-status' });
  const dlg = el('dialog', { class: 'sheet offer', 'aria-labelledby': 'offer-title', 'data-testid': 'offer-sheet' });
  const form = el('form', { novalidate: true, onsubmit: (e) => { e.preventDefault(); void send(); } },
    el('div', { class: 'offer-head' },
      el('h2', { id: 'offer-title' }, needContact ? 'Chcem ponuku' : 'Chcem ďalšiu ponuku'),
      el('p', { class: 'note' }, `Prvé video na ukážku je zadarmo, hotové do ${DELIVERY}. Dopyt sa uloží do vášho chatu s nami.`), pkgNote),
    svcBox, property, social, common, addons, contact,
    el('div', { class: 'sheet-actions' }, el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => dlg.close() }, 'Zrušiť'), submit), progress);
  dlg.append(form);

  function sync() {
    property.hidden = service === 'social';
    social.hidden = service !== 'social';
    const k = pkg();
    pkgNote.hidden = !k;
    pkgNote.textContent = k ? `Vybraný balík: ${pkgText(k)}` : '';
    drawAddons();
    drawSum();
  }
  form.addEventListener('change', (e) => { if ((e.target as HTMLInputElement).name === 'plan') drawSum(); });
  sync();


  let busy = false;
  async function send() {
    if (busy) return;
    if (!navigator.onLine) { showError('Ste offline. Dopyt odošlete po obnovení pripojenia.'); return; }
    if (needContact) {
      const name = form.elements.namedItem('name') as HTMLInputElement;
      const phone = form.elements.namedItem('phone') as HTMLInputElement;
      const consent = form.elements.namedItem('consent') as HTMLInputElement;
      if (!name.value.trim()) { showError('Vyplňte meno a priezvisko.'); name.focus(); return; }
      if (!/^\+?[\d\s/-]{9,}$/.test(phone.value.trim())) { showError('Vyplňte telefónne číslo, napr. +421 900 123 456.'); phone.focus(); return; }
      if (!consent.checked) { showError('Potvrďte, prosím, súhlas so spracovaním osobných údajov.'); consent.focus(); return; }
    }
    const reference = val('reference');
    if (reference && !/^https?:\/\/\S+$/i.test(reference)) { showError('Referenčné video zadajte ako odkaz začínajúci https://'); return; }
    const answers: Record<string, string> = {
      type: val('type'), location: val('location'), price: val('price'), area: val('area'), format: val('format'),
      plan: val('plan'), look: val('look'), reference,
      topics: Array.from(form.querySelectorAll<HTMLInputElement>('input[name="topics"]:checked')).map((c) => c.value).join(', '),
      addons: addonList().filter((x) => checked().includes(x.id)).map((x) => `${x.name} (+${x.price} €)`).join(', '),
    };
    const k = pkg();
    if (k) answers.pkg = pkgText(k);
    const est = estimate();
    answers.estimate = `${est.net} € bez DPH (${withVat(est.net)} s DPH)${est.monthly ? ' mesačne' : ''}`;
    const files = service === 'social' ? [] : [...photos];
    busy = true; submit.disabled = true; progress.textContent = 'Odosielame…';
    let next = profile;
    try {
      if (needContact) {
        const patch = { full_name: val('name'), phone: val('phone'), company: profile.company };
        await adapter.data.updateProfile(patch);
        next = { ...profile, ...patch };
      }
      const msgId = uuid();
      await adapter.data.sendMessage({ id: msgId, conversationId, kind: files.length ? 'file' : 'text', body: offerSummary(answers, service, files.length) });
      for (const [i, f] of files.entries()) {
        progress.textContent = `Nahrávame fotky ${i + 1} z ${files.length}…`;
        await adapter.data.uploadAttachment(conversationId, msgId, f, () => {});
      }
    } catch {
      showError('Dopyt sa nepodarilo odoslať. Skúste to znova.');
      busy = false; submit.disabled = false; progress.textContent = '';
      return;
    }
    if (!adapter.mock) notifyOwner(next, answers, service);
    dlg.close();
    done(next);
  }

  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

// Best effort: the lead sheet and Martin's e-mail still get every offer. Photos stay in the chat.
function notifyOwner(p: Profile, a: Record<string, string>, service: Service) {
  if (!FORM_ENDPOINT) return;
  const body = JSON.stringify({
    source: 'app', name: p.full_name ?? '', phone: p.phone ?? '', email: p.email, company: '',
    propertyType: service === 'social' ? `Sociálne siete (${a.plan} videí)` : a.type,
    location: a.location, price: a.price, area: a.area,
    look: [service === 'social' ? `Témy: ${a.topics}` : `Formát: ${a.format}`, a.look].filter(Boolean).join('\n'),
    referenceUrl: a.reference, page: '/app/', sentAt: new Date().toISOString(), utm: '', discount: '', files: [],
  });
  fetch(FORM_ENDPOINT, { method: 'POST', body }).catch(() => {});
}
