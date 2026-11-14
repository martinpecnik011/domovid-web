import type { Adapter, MfaNeed } from './types';
import { el, icon, label, googleLogo, showError } from './dom';
import { hasIntent, wantsSignup } from './offer';

// Login by 6-digit e-mail code, Google, and the staff TOTP step.
const MAX_TRIES = 5;
const LOCK_SECONDS = 60;
const RESEND_SECONDS = 60;
let timer: number | undefined;

// ---- six boxes: paste fills all, auto-advance, backspace goes back ----
function codeBoxes(onComplete: (code: string) => void) {
  const inputs = Array.from({ length: 6 }, (_, i) => el('input', {
    type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', pattern: '[0-9]*', 'aria-label': `Číslica ${i + 1} z 6`, 'data-testid': `code-${i}`,
  }));
  const wrap = el('div', { class: 'code-boxes', role: 'group', 'aria-label': '6-miestny kód', 'data-testid': 'code-boxes' }, ...inputs);
  const value = () => inputs.map((x) => x.value).join('');
  const spread = (from: number, digits: string) => {
    digits.slice(0, 6 - from).split('').forEach((d, k) => { inputs[from + k].value = d; });
    inputs[Math.min(from + digits.length, 5)].focus();
    if (value().length === 6) onComplete(value());
  };
  inputs.forEach((inp, i) => {
    inp.addEventListener('input', () => {
      const digits = inp.value.replace(/\D/g, '');
      inp.value = '';
      if (digits) spread(i, digits);
    });
    inp.addEventListener('paste', (e) => {
      e.preventDefault();
      const digits = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '');
      if (digits) spread(digits.length >= 6 ? 0 : i, digits);
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !inp.value && i > 0) { e.preventDefault(); inputs[i - 1].value = ''; inputs[i - 1].focus(); }
      else if (e.key === 'ArrowLeft' && i > 0) inputs[i - 1].focus();
      else if (e.key === 'ArrowRight' && i < 5) inputs[i + 1].focus();
    });
    inp.addEventListener('focus', () => inp.select());
  });
  return {
    wrap,
    clear() { inputs.forEach((x) => { x.value = ''; }); inputs[0].focus(); },
    disable(on: boolean) { inputs.forEach((x) => { x.disabled = on; }); },
    focus() { inputs[0].focus(); },
  };
}

const view = (root: HTMLElement, node: Node, kind: string) => { clearInterval(timer); document.body.dataset.view = 'login'; root.replaceChildren(el('main', { class: 'login', 'data-testid': kind }, node)); };
const backLink = (base: string) => el('a', { class: 'web-link light', href: base, 'data-testid': 'login-back-web' }, icon('back', 14), 'Späť na web');

// ---- login: e-mail -> code ----
export function renderLogin(adapter: Adapter, root: HTMLElement, base: string, email = '') {
  const input = el('input', { id: 'login-email', type: 'email', required: true, autocomplete: 'email', inputmode: 'email', placeholder: 'vas@email.sk', 'aria-describedby': 'login-hint', 'data-testid': 'login-email' });
  input.value = email;
  const submit = el('button', { type: 'submit', class: 'btn btn-gold', 'data-testid': 'login-submit' }, 'Poslať kód');
  const form = el('form', { class: 'login-form', 'data-testid': 'login-form', onsubmit: async (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    submit.disabled = true;
    try { await adapter.auth.signInWithOtp(value); renderCode(adapter, root, base, value); }
    catch { showError('Kód sa nepodarilo odoslať. Skontrolujte e-mail a skúste to znova.'); submit.disabled = false; }
  } }, label('login-email', 'E-mail'), el('div', { class: 'input-icon' }, icon('mail', 18), input),
  el('p', { id: 'login-hint', class: 'hint' }, 'Pošleme vám 6-miestny kód'), submit);
  const google = el('button', { type: 'button', class: 'btn btn-light', 'data-testid': 'login-google', onclick: async () => {
    try { await adapter.auth.signInWithOAuth('google'); } catch { showError('Prihlásenie cez Google sa nepodarilo. Skúste to znova.'); }
  } }, googleLogo(), 'Pokračovať cez Google');
  view(root, el('div', { class: 'login-card' },
    el('a', { class: 'logo', href: base, 'data-testid': 'login-logo' }, 'Domov', el('span', {}, 'id')),
    el('h1', {}, hasIntent() ? 'Prihláste sa a pošlite dopyt' : wantsSignup() ? 'Vytvorte si účet' : 'Váš priestor pre videá'),
    !hasIntent() && wantsSignup() ? el('p', { class: 'note', 'data-testid': 'login-signup-note' }, 'Registrácia je zadarmo: zadajte e-mail a pošleme vám 6-miestny kód. Účet sa vytvorí sám, žiadne heslo netreba.') : null,
    hasIntent() ? el('p', { class: 'note', 'data-testid': 'login-offer-note' }, 'Po prihlásení sa otvorí krátky dotazník a váš dopyt príde rovno do súkromného chatu s nami. Prvé video na ukážku je zadarmo.') : null,
    el('ul', { class: 'chips' }, ...['súkromný chat', 'úpravy s časom vo videu', 'všetky podklady na jednom mieste'].map((t) => el('li', {}, t))),
    form, el('p', { class: 'or' }, el('span', {}, 'alebo')), google,
    el('p', { class: 'note strong' }, 'Prihlásenie nič nestojí — platíte len objednané služby'),
    el('p', { class: 'trust' }, icon('lock', 14), 'Súkromné — vaše správy vidí len tím Domovid.'),
    backLink(base)), 'login');
  input.focus();
}

function renderCode(adapter: Adapter, root: HTMLElement, base: string, email: string) {
  let tries = 0;
  let verifying = false;
  const error = el('p', { class: 'form-error', role: 'alert', 'data-testid': 'code-error', hidden: true });
  const resend = el('button', { type: 'button', class: 'link-btn', disabled: true, 'data-testid': 'resend-code' });
  const lockMsg = (n: number) => `Príliš veľa pokusov. Skúste to znova o ${n} s.`;
  const boxes = codeBoxes(async (code) => {
    if (verifying) return;
    verifying = true;
    try { await adapter.auth.verifyOtp(email, code); }
    catch {
      tries++;
      boxes.clear();
      if (tries >= MAX_TRIES) lock();
      else { error.textContent = `Kód nie je správny alebo už vypršal. Zostáva pokusov: ${MAX_TRIES - tries}.`; error.hidden = false; }
    } finally { verifying = false; }
  });
  function lock() {
    boxes.disable(true);
    let left = LOCK_SECONDS;
    error.hidden = false;
    error.textContent = lockMsg(left);
    const t = window.setInterval(() => {
      left--;
      if (left <= 0) { clearInterval(t); tries = 0; boxes.disable(false); boxes.clear(); error.hidden = true; }
      else error.textContent = lockMsg(left);
    }, 1000);
    lockTimer = t;
  }
  let lockTimer: number | undefined;
  let left = RESEND_SECONDS;
  const drawResend = () => {
    resend.disabled = left > 0;
    resend.textContent = left > 0 ? `Poslať kód znova (${left} s)` : 'Poslať kód znova';
  };
  const startCountdown = () => {
    clearInterval(timer);
    left = RESEND_SECONDS; drawResend();
    timer = window.setInterval(() => { left--; drawResend(); if (left <= 0) clearInterval(timer); }, 1000);
  };
  resend.addEventListener('click', async () => {
    resend.disabled = true;
    try { await adapter.auth.signInWithOtp(email); startCountdown(); error.hidden = true; boxes.clear(); }
    catch { showError('Kód sa nepodarilo odoslať. Skúste to znova.'); drawResend(); }
  });
  view(root, el('div', { class: 'login-card', 'data-testid': 'otp-step' },
    el('a', { class: 'logo', href: base }, 'Domov', el('span', {}, 'id')),
    el('h1', {}, 'Zadajte 6-miestny kód z e-mailu'),
    el('p', { class: 'hint' }, 'Kód sme poslali na ', el('strong', {}, email), '.'),
    boxes.wrap, error,
    adapter.mock ? el('p', { class: 'dev-hint', 'data-testid': 'dev-hint' }, `Mock: kód je ${adapter.mock.otpCode}`) : null,
    el('p', { class: 'note' }, 'Kód platí 10 minút.'),
    el('div', { class: 'code-actions' }, resend, el('button', { type: 'button', class: 'link-btn', 'data-testid': 'change-email', onclick: () => { clearInterval(lockTimer); renderLogin(adapter, root, base, email); } }, 'Zmeniť e-mail')),
    backLink(base)), 'login');
  // view() clears `timer`; the resend countdown must start after it.
  startCountdown();
  boxes.focus();
}

// ---- staff TOTP ----
export function renderMfa(adapter: Adapter, root: HTMLElement, base: string, need: Exclude<MfaNeed, { kind: 'none' }>, onDone: () => void) {
  const error = el('p', { class: 'form-error', role: 'alert', 'data-testid': 'mfa-error', hidden: true });
  const info = el('div', { class: 'mfa-info' });
  let factorId = need.kind === 'verify' ? need.factorId : '';
  let busy = false;
  const boxes = codeBoxes(async (code) => {
    if (busy || !factorId) return;
    busy = true;
    try { await adapter.auth.mfaVerify(factorId, code); onDone(); }
    catch { boxes.clear(); error.textContent = 'Kód nie je správny. Skontrolujte čas v telefóne a skúste to znova.'; error.hidden = false; }
    finally { busy = false; }
  });
  view(root, el('div', { class: 'login-card', 'data-testid': 'mfa-screen' },
    el('a', { class: 'logo', href: base }, 'Domov', el('span', {}, 'id')),
    el('p', { class: 'eyebrow' }, icon('shield', 16), 'Tím Domovid'),
    el('h1', {}, 'Overenie v dvoch krokoch'),
    info, boxes.wrap, error,
    adapter.mock ? el('p', { class: 'dev-hint', 'data-testid': 'dev-hint' }, `Mock: kód je ${adapter.mock.totpCode}`) : null,
    el('div', { class: 'code-actions' }, el('button', { type: 'button', class: 'link-btn', 'data-testid': 'mfa-signout', onclick: () => { void adapter.auth.signOut(); } }, 'Odhlásiť sa'))), 'mfa');
  if (need.kind === 'verify') {
    info.append(el('p', { class: 'hint' }, 'Otvorte overovaciu aplikáciu a zadajte 6-miestny kód pre Domovid.'));
    boxes.focus();
    return;
  }
  info.append(el('p', { class: 'hint' }, 'Pripravujeme overovanie…'));
  adapter.auth.mfaEnroll().then((en) => {
    factorId = en.factorId;
    info.replaceChildren(
      el('p', { class: 'hint' }, 'Naskenujte QR kód v overovacej aplikácii (Google Authenticator, Authy, 1Password) a zadajte 6-miestny kód.'),
      el('img', { class: 'mfa-qr', src: en.qr, alt: 'QR kód pre overovaciu aplikáciu', width: '180', height: '180', 'data-testid': 'mfa-qr' }),
      el('p', { class: 'hint' }, 'Alebo zadajte kľúč ručne:'),
      el('code', { class: 'mfa-key', 'data-testid': 'mfa-secret' }, en.manualKey));
    boxes.focus();
  }).catch(() => { info.replaceChildren(el('p', { class: 'form-error' }, 'Overovanie sa nepodarilo pripraviť. Obnovte stránku a skúste to znova.')); });
}
