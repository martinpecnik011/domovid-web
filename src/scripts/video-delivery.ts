// Private client delivery page: loads manifest.json from the R2 bucket, shows the preview,
// posts the client's review to the lead form endpoint and (once paid) lists the downloads.
// Manifest data is only ever written with textContent / properties, never as HTML.
import { FORM_ENDPOINT, CONTACT_EMAIL } from '../config/site';
import { DELIVERY_BASE, DELIVERY_ID_RE, LOCKED_TEXT, type DeliveryManifest } from '../config/delivery';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const show = (state: 'loading' | 'error' | 'ready') => {
  for (const s of ['loading', 'error', 'ready'] as const) $('state-' + s).hidden = s !== state;
};

const mailto = (target: HTMLElement, text: string) => {
  const a = document.createElement('a');
  a.href = `mailto:${CONTACT_EMAIL}`;
  a.textContent = CONTACT_EMAIL;
  target.replaceChildren(text + ' ', a);
};

const showError = (text?: string) => {
  if (text) $('error-text').textContent = text;
  mailto($('error-contact'), 'Ak problém pretrváva, napíšte nám na');
  show('error');
};

/** 12 345 678 B -> "11,8 MB" (Slovak decimal comma). */
const formatSize = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB';

const id = new URLSearchParams(location.search).get('id') || '';

async function load() {
  if (!DELIVERY_ID_RE.test(id)) {
    showError('Odkaz na video nie je platný. Skontrolujte, či ste ho skopírovali celý.');
    return;
  }
  const dir = `${DELIVERY_BASE}/${id}/`;
  let m: DeliveryManifest;
  try {
    const res = await fetch(`${dir}manifest.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    m = await res.json();
    if (!m || !m.preview?.file || !Array.isArray(m.downloads)) throw new Error('manifest');
  } catch {
    showError('Video sa nám nepodarilo načítať. Skúste to prosím o chvíľu znova.');
    return;
  }
  render(m, dir);
  show('ready');
}

function render(m: DeliveryManifest, dir: string) {
  document.title = `${m.title} – Domovid`;
  $('video-title').textContent = m.title;
  $('video-client').textContent = m.client;
  if (m.message) {
    $('video-message').textContent = m.message;
    $('video-message').hidden = false;
  }
  const player = $<HTMLVideoElement>('video-player');
  if (m.poster) player.poster = dir + m.poster;
  player.src = dir + m.preview.file;

  setupReview(m);

  if (!m.paid) {
    $('locked-text').textContent = LOCKED_TEXT;
    $('downloads-locked').hidden = false;
    return;
  }
  const d = m.downloads[0];
  if (!d) return;
  const a = document.createElement('a');
  a.className = 'btn btn-brass';
  a.href = dir + d.file;
  a.setAttribute('download', '');
  a.append(d.label);
  const small = document.createElement('small');
  small.textContent = formatSize(d.bytes);
  a.append(small);
  $('downloads').append(a);
  $('downloads-wrap').hidden = false;
}

function setupReview(m: DeliveryManifest) {
  const approve = $<HTMLButtonElement>('btn-approve');
  const changes = $<HTMLButtonElement>('btn-changes');
  const sendChanges = $<HTMLButtonElement>('btn-send-changes');
  const box = $('changes-box');
  const text = $<HTMLTextAreaElement>('changes-text');
  const status = $('review-status');

  const say = (msg: string, kind?: 'ok' | 'error', withMail = kind === 'error') => {
    status.className = 'form-status ' + (kind || '');
    status.textContent = msg;
    if (withMail) mailto(status, msg + ' Napíšte nám na');
    status.hidden = false;
  };
  const busy = (on: boolean) => {
    approve.disabled = changes.disabled = sendChanges.disabled = on;
  };

  async function submit(action: 'approve' | 'changes', message: string) {
    busy(true);
    try {
      await fetch(FORM_ENDPOINT, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          type: 'review',
          id,
          action,
          message,
          client: m.client,
          title: m.title,
          page: location.href,
          sentAt: new Date().toISOString(),
          company: '',
        }),
      });
      $('review-actions').hidden = true;
      box.hidden = true;
      say(
        action === 'approve'
          ? 'Ďakujeme, že ste video schválili! Pošleme vám číslo účtu (IBAN) na úhradu a po prijatí platby sa tu odomkne video v plnej kvalite.'
          : 'Ďakujeme za spätnú väzbu. Ozveme sa vám s upravenou verziou.',
        'ok',
      );
    } catch {
      say('Odoslanie sa nepodarilo.', 'error');
      busy(false);
    }
  }

  approve.addEventListener('click', () => submit('approve', ''));
  changes.addEventListener('click', () => {
    box.hidden = false;
    changes.setAttribute('aria-expanded', 'true');
    text.focus();
  });
  text.addEventListener('input', () => {
    if (!text.value.trim()) return;
    text.setAttribute('aria-invalid', 'false');
    status.hidden = true;
  });
  sendChanges.addEventListener('click', () => {
    const msg = text.value.trim();
    text.setAttribute('aria-invalid', msg ? 'false' : 'true');
    if (!msg) {
      say('Napíšte nám, čo by sme mali upraviť.', 'error', false);
      return;
    }
    submit('changes', msg);
  });
}

load();
