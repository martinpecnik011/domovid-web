// Lead form → Google Apps Script (see apps-script/SETUP.md). Endpoint lives in src/config/site.ts.
// Wire format: JSON string body (text/plain, no-cors) with optional resized photos, see apps-script/Code.gs.
import { FORM_ENDPOINT, WA_LINK, WA_DISPLAY } from '../config/site';
import { resizeImage, fileType, type ResizedImage } from './image-resize';

const MAX_PHOTOS = 10;
const MAX_PAYLOAD_BYTES = 20 * 1024 * 1024;
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'];
const UTM_STORE = 'domovid:utm';

/** Slovak plural for photos: 1 fotku, 2–4 fotky, 5+ fotiek. */
const photosWord = (n: number) => (n === 1 ? 'fotku' : n >= 2 && n <= 4 ? 'fotky' : 'fotiek');

/** Reads campaign params from the URL (or the session, when the visitor navigated on) as "source=fb|campaign=x". */
function readUtm(): string {
  const params = new URLSearchParams(location.search);
  const parts = UTM_KEYS.flatMap((key) => {
    const value = (params.get(key) || '').trim().replace(/[|=]/g, ' ');
    return value ? [`${key.replace(/^utm_/, '')}=${value.slice(0, 120)}`] : [];
  });
  const fresh = parts.join('|').slice(0, 300);
  try {
    if (fresh) {
      sessionStorage.setItem(UTM_STORE, fresh);
      return fresh;
    }
    return (sessionStorage.getItem(UTM_STORE) || '').slice(0, 300);
  } catch {
    return fresh;
  }
}

const form = document.getElementById('lead-form') as HTMLFormElement | null;

if (form) {
  const utm = readUtm();
  const statusEl = document.getElementById('form-status') as HTMLElement;
  const btn = document.getElementById('submit-btn') as HTMLButtonElement;
  const el = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T;

  const setErr = (id: string, bad: boolean) => {
    const input = el(id);
    el(id + '-err').hidden = !bad;
    input.setAttribute('aria-invalid', bad ? 'true' : 'false');
    return bad;
  };

  const say = (text: string, kind?: 'ok' | 'error') => {
    statusEl.textContent = '';
    statusEl.className = 'form-status ' + (kind || '');
    statusEl.append(text);
    if (kind === 'error') {
      const a = document.createElement('a');
      a.href = WA_LINK;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = `Napíš nám na WhatsApp ${WA_DISPLAY}.`;
      statusEl.append(' ', a);
    }
    statusEl.hidden = false;
  };

  // ---------- Photos ----------
  const input = el('photos');
  const drop = el<HTMLElement>('photos-drop');
  const list = el<HTMLUListElement>('photos-list');
  const countEl = el<HTMLElement>('photos-count');
  const photoErr = el<HTMLElement>('photos-err');
  type Picked = { file: File; url: string; li: HTMLLIElement };
  let picked: Picked[] = [];

  const isImage = (file: File) => fileType(file).startsWith('image/');

  const showPhotoErr = (text: string) => {
    photoErr.textContent = text;
    photoErr.hidden = !text;
  };

  const renderCount = () => {
    list.hidden = picked.length === 0;
    countEl.textContent = picked.length ? `${picked.length} / ${MAX_PHOTOS} fotiek` : '';
  };

  const removePhoto = (p: Picked, focusAfter: boolean) => {
    const idx = picked.indexOf(p);
    if (idx < 0) return;
    URL.revokeObjectURL(p.url);
    p.li.remove();
    picked.splice(idx, 1);
    showPhotoErr('');
    renderCount();
    if (focusAfter) {
      const next = picked[idx] || picked[idx - 1];
      (next ? next.li.querySelector('button') : input)?.focus();
    }
  };

  const clearPhotos = () => {
    picked.forEach((p) => URL.revokeObjectURL(p.url));
    picked = [];
    list.replaceChildren();
    showPhotoErr('');
    renderCount();
  };

  const addFiles = (files: FileList | File[]) => {
    const errors: string[] = [];
    const all = Array.from(files);
    const rejected = all.filter((f) => !isImage(f));
    const images = all.filter(isImage);
    if (rejected.length) {
      const names = rejected.map((f) => f.name).join(', ');
      errors.push(`${names}: ${rejected.length === 1 ? 'nie je obrázok' : 'nie sú obrázky'}. Pridaj fotky (JPG, PNG, HEIC).`);
    }
    const room = MAX_PHOTOS - picked.length;
    if (images.length > room) {
      errors.push(`Najviac ${MAX_PHOTOS} fotiek – ${room > 0 ? `pridali sme ${room}, zvyšok sme vynechali` : 'ďalšie sme nepridali'}.`);
    }
    for (const file of images.slice(0, Math.max(0, room))) {
      const url = URL.createObjectURL(file);
      const li = document.createElement('li');
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.decoding = 'async';
      img.addEventListener('error', () => {
        // e.g. HEIC preview in Chrome: show the file name instead of a broken image
        const label = document.createElement('span');
        label.className = 'thumb-name';
        label.textContent = file.name;
        img.replaceWith(label);
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Odstrániť ${file.name}`);
      remove.textContent = '×';
      const p: Picked = { file, url, li };
      remove.addEventListener('click', () => removePhoto(p, true));
      li.append(img, remove);
      list.append(li);
      picked.push(p);
    }
    showPhotoErr(errors.join(' '));
    renderCount();
  };

  input.addEventListener('change', () => {
    if (input.files) addFiles(input.files);
    input.value = ''; // the list above is the source of truth; allows re-picking the same file
  });
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    drop.classList.add('is-over');
  });
  drop.addEventListener('dragleave', (e) => {
    if (!drop.contains(e.relatedTarget as Node | null)) drop.classList.remove('is-over');
  });
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('is-over');
    if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files);
  });
  form.addEventListener('reset', clearPhotos);

  /** Resizes the picked photos one by one (low memory on phones) within the total payload cap. */
  const preparePhotos = async () => {
    const files: Pick<ResizedImage, 'name' | 'type' | 'data'>[] = [];
    let total = 0;
    let left = 0;
    for (let i = 0; i < picked.length; i++) {
      btn.textContent = `Odosielam fotky… (${i + 1}/${picked.length})`;
      const out = await resizeImage(picked[i].file, { maxSide: 1600, quality: 0.82 });
      if (!out) {
        left++;
        continue;
      }
      if (total + out.data.length > MAX_PAYLOAD_BYTES) {
        left += picked.length - i;
        break;
      }
      total += out.data.length;
      files.push({ name: out.name, type: out.type, data: out.data });
    }
    return { files, left };
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = el('name').value.trim();
    const phone = el('phone').value.trim();
    const email = el('email').value.trim();
    const bad = [
      setErr('name', name.length < 2),
      setErr('phone', phone.replace(/\D/g, '').length < 9),
      setErr('email', email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
      setErr('consent', !el('consent').checked),
    ];
    if (bad.includes(true)) {
      const first = form.querySelector<HTMLElement>('[aria-invalid="true"]');
      if (first) first.focus();
      statusEl.hidden = true;
      return;
    }
    if (el('company').value) {
      say('Ďakujeme, dopyt sme prijali.', 'ok');
      form.reset();
      return;
    }
    if (!FORM_ENDPOINT) {
      say('Formulár ešte nie je pripojený.', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Odosielam…';
    try {
      const { files, left } = await preparePhotos();
      btn.textContent = 'Odosielam…';
      const body = JSON.stringify({
        name,
        phone,
        email,
        message: el<HTMLTextAreaElement>('message').value.trim(),
        page: location.href,
        sentAt: new Date().toISOString(),
        company: '',
        utm,
        files,
      });
      await fetch(FORM_ENDPOINT, { method: 'POST', mode: 'no-cors', body });
      const n = files.length;
      let text = n
        ? `Ďakujeme! Dopyt aj ${n} ${photosWord(n)} sme prijali, ozveme sa do 24 hodín.`
        : 'Ďakujeme! Dopyt sme prijali, ozveme sa do 24 hodín.';
      if (left) text += ` ${left} ${photosWord(left)} sa nepodarilo priložiť – pošli ich prosím na WhatsApp ${WA_DISPLAY}.`;
      say(text, 'ok');
      form.reset();
      window.dispatchEvent(new CustomEvent('domovid:lead', { detail: { photos: n } }));
    } catch {
      say('Dopyt sa nepodarilo odoslať, skontroluj pripojenie a skús znova.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Odoslať dopyt';
    }
  });
}
