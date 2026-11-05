// Private client delivery page: loads manifest.json from the R2 bucket, shows the preview,
// posts the client's review to the Apps Script endpoint and lists the downloads only when its status says unlocked.
// Manifest data is only ever written with textContent / properties, never as HTML.
import { CONTACT_EMAIL } from '../config/site';
import { REVIEW_ENDPOINT, STATUS_ERROR_TEXT, DELIVERY_BASE, DELIVERY_ID_RE, LOCKED_TEXT, LOCKED_TEXT_WITH_IBAN, RENEWAL_HEADING, RENEWAL_TEXT, RENEWAL_REF_LABEL, DOWNLOAD_LABEL, SINGLE_VIDEO_NET, SINGLE_BUY, SINGLE_INTRO, SINGLE_REF_LABEL, SINGLE_DONE, RENEWAL_VALIDITY, DOWNLOAD_BUSY, RENEW_YES, RENEW_NO, RENEW_YES_DONE, RENEW_NO_DONE, type DeliveryManifest, type DeliveryStatus } from '../config/delivery';

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
    if (!m || !m.preview?.file) throw new Error('manifest');
  } catch {
    showError('Video sa nám nepodarilo načítať. Skúste to prosím o chvíľu znova.');
    return;
  }
  render(m, dir, await fetchStatus());
  show('ready');
}

/** Approval/unlock status from the Apps Script; null when it cannot be loaded (the page then stays locked). */
async function fetchStatus(): Promise<DeliveryStatus | null> {
  try {
    const res = await fetch(`${REVIEW_ENDPOINT}${REVIEW_ENDPOINT.includes('?') ? '&' : '?'}type=status&id=${id}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    const st = await res.json();
    return res.ok && st?.ok === true ? st : null;
  } catch {
    return null;
  }
}

/** 17220 cents -> "172,20 €" (Slovak decimal comma, non-breaking space before the euro sign). */
const formatEur = (cents: number) => (cents / 100).toFixed(2).replace('.', ',') + ' €';

/** POSTs a review event to the Apps Script endpoint. Fire-and-forget (no-cors) except `readable` (approve), whose JSON status the page needs. */
const postReview = (m: DeliveryManifest, action: string, message: string, extra: Record<string, string> = {}, readable = false) =>
  fetch(REVIEW_ENDPOINT, {
    method: 'POST',
    mode: readable ? 'cors' : 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      type: 'review',
      id,
      action,
      message,
      ...extra,
      client: m.client,
      title: m.title,
      page: location.href,
      sentAt: new Date().toISOString(),
      company: '',
    }),
  });

/** Slovak plural: 1 video, 2–4 videá, 5+ videí. */
const videosText = (n: number) => `${n} ${n === 1 ? 'video' : n >= 2 && n <= 4 ? 'videá' : 'videí'}`;

/** Slovak date "D. M. RRRR" without leading zeros. */
const skDate = (d: Date) => `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;

/** Package validity from `from`: one calendar month (day clamped to month length) minus one day, like balik.package_end. */
function packageEnd(from: Date): Date {
  const y = from.getFullYear();
  const mo = from.getMonth() + 1;
  const last = new Date(y, mo + 1, 0).getDate();
  return new Date(y, mo, Math.min(from.getDate(), last) - 1);
}

/** Renewal heading + explanation above the (reused) price block; the price block gets the renewal offer as its label. */
function showRenewal(m: DeliveryManifest, r: NonNullable<DeliveryManifest['renewal']>) {
  $('renewal-heading').textContent = RENEWAL_HEADING[r.reason] ?? RENEWAL_HEADING.exhausted;
  $('renewal-text').textContent = RENEWAL_TEXT;
  $('renewal-box').hidden = false;
  $('review').hidden = true;
  setupRenewalButtons(m, r);
  $('price-ref-label').textContent = RENEWAL_REF_LABEL;
  const today = new Date();
  $('price-validity').textContent = RENEWAL_VALIDITY.replace('{FROM}', skDate(today)).replace('{TO}', skDate(packageEnd(today)));
  $('price-validity').hidden = false;
  showSingle(m, r);
}

/** Single-video price from the renewal (or the default constant); null when invalid. */
function singleOffer(m: DeliveryManifest, r: NonNullable<DeliveryManifest['renewal']>) {
  const net = r.single?.net ?? SINGLE_VIDEO_NET;
  const rate = r.single?.vat_rate ?? r.vat_rate;
  if (!Number.isFinite(net) || net <= 0 || !Number.isFinite(rate) || rate < 0) return null;
  const netC = Math.round(net * 100);
  const vatC = Math.round(netC * rate);
  return { netC, vatC, rate, reference: r.single?.reference || m.id, totalC: netC + vatC };
}

function showSingle(m: DeliveryManifest, r: NonNullable<DeliveryManifest['renewal']>) {
  const o = singleOffer(m, r);
  if (!o) return;
  $('single-intro').textContent = SINGLE_INTRO;
  $('single-price').textContent = `${formatEur(o.netC)} + DPH ${Math.round(o.rate * 100)} % ${formatEur(o.vatC)} = ${formatEur(o.totalC)}`;
  $('single-ref-label').textContent = SINGLE_REF_LABEL;
  $('single-ref').textContent = o.reference;
  $('single-box').hidden = false;
  $('btn-single').textContent = SINGLE_BUY;
  $('btn-single').hidden = false;
}

/** Price block for an unpaid video; skipped when the manifest has no (valid) price. */
/** Returns true when the price block (and, if the manifest has an iban, the IBAN row) is shown. */
function showPrice(p: DeliveryManifest['price'], labelOverride?: string): boolean {
  if (!p || !Number.isFinite(p.net) || p.net <= 0 || !Number.isFinite(p.vat_rate) || p.vat_rate < 0) return false;
  const netC = Math.round(p.net * 100);
  const vatC = Math.round(netC * p.vat_rate);
  $('price-label').textContent = labelOverride || p.label;
  $('price-net').textContent = formatEur(netC);
  $('price-vat-label').textContent = `DPH ${Math.round(p.vat_rate * 100)} %`;
  $('price-vat').textContent = formatEur(vatC);
  $('price-total').textContent = formatEur(netC + vatC);
  $('price-ref').textContent = p.reference;
  const iban = typeof p.iban === 'string' ? p.iban.replace(/\s+/g, '').toUpperCase() : '';
  if (iban) {
    $('price-iban').textContent = iban.replace(/(.{4})(?=.)/g, '$1 ');
    $('iban-copy').addEventListener('click', async () => {
      let msg = 'Skopírujte ručne';
      try {
        await navigator.clipboard.writeText(iban);
        msg = 'Skopírované';
      } catch {}
      $('iban-copied').textContent = msg;
      setTimeout(() => ($('iban-copied').textContent = ''), 2500);
    });
    $('price-iban-row').hidden = false;
  }
  $('price-box').hidden = false;
  return !!iban;
}

function render(m: DeliveryManifest, dir: string, st: DeliveryStatus | null) {
  document.title = `${m.title} – Domovid`;
  $('video-title').textContent = m.title;
  $('video-client').textContent = m.client;
  if (m.message) {
    $('video-message').textContent = m.message;
    $('video-message').hidden = false;
  }
  const player = $<HTMLVideoElement>('video-player');
  const player169 = $<HTMLVideoElement>('video-player-16x9');
  for (const v of [player, player169]) {
    v.setAttribute('controlsList', 'nodownload noremoteplayback noplaybackrate');
    v.disablePictureInPicture = true;
    v.disableRemotePlayback = true;
    v.draggable = false;
    v.addEventListener('contextmenu', (e) => e.preventDefault());
    v.parentElement?.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  if (m.poster) player.poster = dir + m.poster;
  player.src = dir + m.preview.file;
  if (m.preview_16x9?.file) {
    if (m.poster_16x9) player169.poster = dir + m.poster_16x9;
    player169.src = dir + m.preview_16x9.file;
    $('preview-169').hidden = false;
    $('caption-916').hidden = false;
  }

  setupReview(m);
  applyStatus(m, st);
}

/** Locked (badge preview, payment notice only without a package) or unlocked (clean master + downloads), from the status. */
function applyStatus(m: DeliveryManifest, st: DeliveryStatus | null) {
  if (st?.approved) {
    $('review-actions').hidden = true;
    $('changes-box').hidden = true;
  }
  if (st?.unlocked && st.downloads?.length) {
    unlock(st.downloads);
    return;
  }
  if (!st) {
    const status = $('review-status');
    status.className = 'form-status error';
    status.textContent = STATUS_ERROR_TEXT;
    status.hidden = false;
  }
  if (m.renewal) showRenewal(m, m.renewal);
  if (st?.has_package ?? m.has_package) return; // active package: nothing to pay, the download follows the approval
  const withIban = showPrice(m.price, m.renewal && `Obnoviť balík ${m.renewal.package_id} – ${videosText(m.renewal.videos)}`);
  $('locked-text').textContent = withIban ? LOCKED_TEXT_WITH_IBAN : LOCKED_TEXT;
  $('downloads-locked').hidden = false;
}

const resolutionOf = (d: { label: string; url?: string; file?: string }) =>
  /\((\d{3,4}×\d{3,4})\)/.exec(d.label)?.[1] ?? /_(\d{3,4})x(\d{3,4})\./.exec(d.url ?? d.file ?? '')?.slice(1, 3).join('×');

/** Swaps the badge previews for the clean masters (no poster = no badge) and lists the download buttons. */
function unlock(downloads: NonNullable<DeliveryStatus['downloads']>) {
  const swap = (v: HTMLVideoElement, d?: { url: string }) => {
    if (!d) return;
    v.removeAttribute('poster');
    v.src = d.url;
    v.load();
  };
  swap($<HTMLVideoElement>('video-player'), downloads[0]);
  swap($<HTMLVideoElement>('video-player-16x9'), downloads.find((d) => resolutionOf(d) === '1920×1080'));
  $('downloads-locked').hidden = true;
  $('downloads').replaceChildren();
  for (const d of downloads) {
    const file = decodeURIComponent(d.url.split('/').pop() || 'video.mp4');
    const a = document.createElement('a');
    a.className = 'btn btn-brass';
    a.href = d.url;
    a.setAttribute('download', '');
    const resolution = resolutionOf(d);
    const text = document.createElement('span');
    // A photo in the list carries its own button text in the label ("Stiahnuť vizualizáciu – kuchyňa").
    const isPhoto = /\.jpe?g$/i.test(file);
    const idleText = isPhoto ? d.label : resolution ? `${DOWNLOAD_LABEL} (${resolution})` : DOWNLOAD_LABEL;
    text.textContent = idleText;
    a.append(text);
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      if (a.dataset.busy) return;
      a.dataset.busy = '1';
      text.textContent = DOWNLOAD_BUSY;
      try {
        // Masters are cross-origin, so the download attribute is ignored: fetch the blob and save it from an object URL.
        const res = await fetch(a.href);
        if (!res.ok) throw new Error(String(res.status));
        const url = URL.createObjectURL(await res.blob());
        const tmp = document.createElement('a');
        tmp.href = url;
        tmp.download = file;
        document.body.append(tmp);
        tmp.click();
        tmp.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      } catch {
        window.location.href = a.href;
      }
      text.textContent = idleText;
      delete a.dataset.busy;
    });
    const small = document.createElement('small');
    small.textContent = formatSize(d.bytes);
    a.append(small);
    $('downloads').append(a);
  }
  $('downloads-wrap').hidden = false;
}

function setupRenewalButtons(m: DeliveryManifest, r: NonNullable<DeliveryManifest['renewal']>) {
  const yes = $<HTMLButtonElement>('btn-renew');
  const no = $<HTMLButtonElement>('btn-decline');
  const single = $<HTMLButtonElement>('btn-single');
  const status = $('renewal-status');
  yes.textContent = RENEW_YES;
  no.textContent = RENEW_NO;
  const send = async (action: 'renew' | 'single' | 'decline') => {
    yes.disabled = no.disabled = single.disabled = true;
    try {
      const o = singleOffer(m, r);
      const extra = action === 'renew' ? { package_id: r.package_id } : action === 'single' && o ? { package_id: r.package_id, price_net: o.netC / 100, reference: o.reference } : {};
      await postReview(m, action, '', extra);
      status.className = 'form-status ok';
      status.textContent =
        action === 'renew'
          ? RENEW_YES_DONE.replace('{ID}', r.package_id)
          : action === 'single' && o
            ? SINGLE_DONE.replace('{TOTAL}', formatEur(o.totalC)).replace('{ID}', o.reference)
            : RENEW_NO_DONE;
      status.scrollIntoView?.({ block: 'nearest' });
    } catch {
      status.className = 'form-status error';
      status.textContent = 'Odoslanie sa nepodarilo.';
      yes.disabled = no.disabled = single.disabled = false;
    }
    status.hidden = false;
  };
  yes.addEventListener('click', () => send('renew'));
  single.addEventListener('click', () => send('single'));
  no.addEventListener('click', () => send('decline'));
  $('renewal-review').hidden = false;
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
      const res = await postReview(m, action, message, {}, action === 'approve');
      let st: DeliveryStatus | null = null;
      if (action === 'approve') {
        st = await res.json().catch(() => null); // not JSON -> treated like ok:false
        if (!st?.ok) throw new Error(st?.error || 'approve');
      }
      $('review-actions').hidden = true;
      box.hidden = true;
      say(
        action !== 'approve'
          ? 'Ďakujeme za spätnú väzbu. Ozveme sa vám s upravenou verziou.'
          : st?.unlocked // odomknuté (predplatený balík): žiadna zmienka o platbe
            ? 'Ďakujeme, že ste video schválili! Video v plnej kvalite si môžete stiahnuť nižšie.'
            : st?.has_package
              ? 'Ďakujeme, že ste video schválili!'
              : 'Ďakujeme, že ste video schválili! Pošleme vám číslo účtu (IBAN) na úhradu a po prijatí platby sa tu odomkne video v plnej kvalite.',
        'ok',
      );
      if (st?.unlocked) applyStatus(m, st); // switch to the clean master without a reload
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
