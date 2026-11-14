// E2E of /app in mock mode (customer chat + staff inbox). Runs the whole flow at desktop 1440 and mobile 390.
// Usage: PW_PATH=<node_modules with playwright> SCR=<screenshot dir> [SITE=http://localhost:4471] node tests/app/e2e.mjs
// Needs `npm run build && npx astro preview --port 4471` serving the site. Never touches a real Supabase project (?mock=1).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const require = createRequire(process.env.PW_PATH + '/');
const { chromium } = require('playwright');
const { SCR } = process.env;
const SITE = process.env.SITE || 'http://localhost:4471';
const URL_APP = (process.env.SITE || 'http://localhost:4471') + '/domovid-web/app/?mock=1';
const fails = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`); if (!ok) fails.push(name); };
fs.mkdirSync(SCR, { recursive: true });

// 160x100 gradient PNG, built here so no binary fixture is committed.
function png() {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(160, 0); ihdr.writeUInt32BE(100, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.concat(Array.from({ length: 100 }, (_, y) => Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: 160 }, (_, x) => [60 + x, 120 + y, 200 - x]).flat())])));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

async function scenario(tag, viewport, mobile) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, acceptDownloads: true });
  const page = await ctx.newPage();
  const errs = [];
  const thirdParty = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  page.on('request', (r) => /googletagmanager|facebook\.net|google-analytics|supabase\.co/.test(r.url()) && thirdParty.push(r.url()));
  const t = (id) => page.getByTestId(id);
  const shot = async (n) => { await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {})))); return page.screenshot({ path: path.join(SCR, `app-${n}-${tag}.png`) }); };
  const noOverflow = async (n) => check(`${tag} ${n}: no horizontal overflow`, !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  const sendText = async (s) => { await t('composer-text').fill(s); await t('send-btn').click(); };
  const bg = (loc) => loc.evaluate((e) => getComputedStyle(e).backgroundColor);

  // 1. login screen
  await page.goto(URL_APP);
  await t('login').waitFor();
  check(`${tag} 1 noindex + manifest link`, (await page.locator('meta[name=robots]').getAttribute('content')) === 'noindex, nofollow' && (await page.locator('link[rel=manifest]').getAttribute('href')) === '/domovid-web/manifest.webmanifest');
  const lt = await t('login').innerText();
  check(`${tag} 1 login copy (hint, Google, no-cost note)`, lt.includes('Pošleme vám 6-miestny kód') && !/odkaz/i.test(lt.replace(/\s+/g, ' ')) && lt.includes('Pokračovať cez Google') && lt.includes('Prihlásenie nič nestojí — platíte len objednané služby') && lt.includes('Domovid'));
  check(`${tag} 1 e-mail input has a label`, (await page.getByLabel('E-mail').count()) === 1);
  await noOverflow('login');
  await shot('login');

  // 2. sign in by e-mail -> chat
  await t('login-email').fill('klient@example.com');
  await t('login-submit').click();
  await t('otp-step').waitFor();
  const ot = await t('otp-step').innerText();
  check(`${tag} 2 OTP screen copy: 6 boxes, 10 min note, change e-mail, dev hint, no magic-link wording`, (await page.locator('[data-testid^=code-]:not([data-testid=code-boxes]):not([data-testid=code-error])').count()) === 6 && ot.includes('Zadajte 6-miestny kód z e-mailu') && ot.includes('Kód platí 10 minút') && ot.includes('Zmeniť e-mail') && (await t('dev-hint').innerText()).includes('123456') && !/odkaz/i.test(ot));
  check(`${tag} 2 first box has autocomplete=one-time-code + numeric keypad`, (await t('code-0').getAttribute('autocomplete')) === 'one-time-code' && (await t('code-0').getAttribute('inputmode')) === 'numeric');
  check(`${tag} 2 resend countdown visible and disabled`, /Poslať kód znova \(\d+ s\)/.test(await t('resend-code').innerText()) && (await t('resend-code').isDisabled()));
  await noOverflow('otp');
  await shot('otp-code');
  await t('code-0').fill('111111');
  await t('code-error').waitFor();
  check(`${tag} 2 wrong code rejected with Slovak error, boxes cleared`, (await t('code-error').innerText()).includes('Kód nie je správny') && (await t('code-0').inputValue()) === '' && (await t('otp-step').isVisible()));
  await t('code-0').fill('12345');
  check(`${tag} 2 paste of 5 digits fills boxes 1-5 (auto-advance)`, (await t('code-4').inputValue()) === '5' && (await t('code-5').inputValue()) === '' && (await t('code-5').evaluate((e) => e === document.activeElement)));
  await page.keyboard.press('Backspace');
  check(`${tag} 2 backspace goes back a box`, (await t('code-4').inputValue()) === '' );
  await t('code-4').fill('5');
  await t('code-5').fill('6');
  await t('customer-chat').waitFor();
  check(`${tag} 2 chat visible with welcome message from Domovid`, (await t('msg').count()) === 1 && (await t('msg').first().innerText()).includes('tu Domovid'));
  check(`${tag} 2 mock switch visible only in mock mode`, await t('mock-switch').isVisible());

  // 3. send text; colours
  await sendText('Dobrý deň, mám otázku k videu');
  await page.getByText('Dobrý deň, mám otázku k videu').waitFor();
  const own = t('msg').filter({ hasText: 'mám otázku k videu' });
  // Brand theme: Domovid bubbles are navy surfaces with cream text; customer bubbles are gold.
  check(`${tag} 3 own bubble gold + right, Domovid bubble navy/cream text + left`, (await bg(own)) === 'rgb(224, 173, 85)' && (await bg(t('msg').first())) === 'rgb(28, 48, 64)' && (await t('msg').first().evaluate((e) => getComputedStyle(e).color)) === 'rgb(245, 240, 232)');
  const [ob, tb] = await Promise.all([own.boundingBox(), t('msg').first().boundingBox()]);
  check(`${tag} 3 own right of Domovid`, ob.x > tb.x);
  check(`${tag} 3 composer cleared`, (await t('composer-text').inputValue()) === '');

  // 4. edit request with timecode
  await t('edit-toggle').click();
  check(`${tag} 4 toggle shows Video + Čas fields`, (await t('edit-video').isVisible()) && (await t('edit-time').isVisible()) && (await t('edit-toggle').getAttribute('aria-pressed')) === 'true');
  await t('edit-video').fill('Byt Záhorská');
  await t('edit-time').fill('abc');
  await t('composer-text').fill('Skrátiť úvod o 2 sekundy');
  await t('send-btn').click();
  check(`${tag} 4 invalid timecode -> Slovak error, nothing sent`, /m:ss/.test(await t('app-error').innerText()) && (await t('edit-card').count()) === 0);
  await t('edit-time').fill('0:12');
  await t('send-btn').click();
  await t('edit-card').waitFor();
  const card = await t('edit-card').innerText();
  check(`${tag} 4 edit_request card shows video + timecode`, card.includes('Požiadavka na úpravu') && card.includes('Byt Záhorská') && card.includes('0:12'));
  check(`${tag} 4 card is in an edit_request message`, (await t('msg').filter({ has: t('edit-card') }).getAttribute('data-kind')) === 'edit_request');
  check(`${tag} 4 edit mode reset after send`, (await t('edit-toggle').getAttribute('aria-pressed')) === 'false');

  // 5. URL -> link
  await sendText('https://example.com/moje-video');
  await t('msg-link').waitFor();
  check(`${tag} 5 URL message becomes kind=link anchor`, (await t('msg-link').getAttribute('href')) === 'https://example.com/moje-video' && (await t('msg').filter({ has: t('msg-link') }).getAttribute('data-kind')) === 'link');
  await sendText('<img src=x onerror=alert(1)>');
  check(`${tag} 5 user HTML is rendered as text`, (await page.locator('.thread img[src="x"]').count()) === 0 && (await page.getByText('<img src=x onerror=alert(1)>').count()) === 1);

  await sendText('=HYPERLINK("http://evil.example","klik")');
  await page.getByText('=HYPERLINK("http://evil.example","klik")').waitFor();

  // 6. image attachment
  const png1 = { name: 'fotka.png', mimeType: 'image/png', buffer: png() };
  await t('file-input').setInputFiles(png1);
  await t('preview').waitFor();
  check(`${tag} 6 preview shown before sending`, (await t('preview').innerText()).includes('fotka.png'));
  await t('send-btn').click();
  await t('att-image').waitFor();
  const dim = await t('att-image').evaluate((i) => i.complete && i.naturalWidth);
  check(`${tag} 6 image inline in thread`, dim === 160, `naturalWidth=${dim}`);
  check(`${tag} 6 previews cleared`, (await t('preview').count()) === 0);

  // 7. limits + offline
  await page.evaluate(() => { window.__sz = Object.getOwnPropertyDescriptor(Blob.prototype, 'size'); Object.defineProperty(Blob.prototype, 'size', { get: () => 51 * 1024 * 1024, configurable: true }); });
  await t('file-input').setInputFiles({ name: 'velke.mp4', mimeType: 'video/mp4', buffer: Buffer.from('x') });
  await page.evaluate(() => Object.defineProperty(Blob.prototype, 'size', window.__sz));
  check(`${tag} 7 >50 MB rejected with Slovak error`, (await t('app-error').innerText()).includes('väčší ako 50 MB') && (await t('preview').count()) === 0);
  await ctx.setOffline(true);
  await t('offline-banner').waitFor({ state: 'visible' });
  check(`${tag} 7 offline banner shown`, (await t('offline-banner').innerText()).includes('offline'));
  await ctx.setOffline(false);
  await t('offline-banner').waitFor({ state: 'hidden' });
  check(`${tag} 7 offline banner hidden when back online`, !(await t('offline-banner').isVisible()));
  await t('app-error').click();
  await noOverflow('chat');
  await shot('chat');

  // 8. profile sheet
  await t('profile-open').click();
  await t('profile-name').fill('Jana Nováková');
  await t('profile-phone').fill('+421900111222');
  await t('profile-company').fill('Reality s.r.o.');
  await t('profile-save').click();
  await t('profile-sheet').waitFor({ state: 'detached' });
  await t('profile-open').click();
  check(`${tag} 8 profile persisted`, (await t('profile-name').inputValue()) === 'Jana Nováková' && (await t('profile-company').inputValue()) === 'Reality s.r.o.');
  await page.keyboard.press('Escape');

  // 8b. no plan yet -> empty state
  await t('tab-plan').click();
  await t('sub-empty').waitFor();
  check(`${tag} 8b Môj plán without a plan shows "Zatiaľ nemáte balík" + Cenník button`, (await t('sub-empty').innerText()).includes('Zatiaľ nemáte balík') && (await t('to-pricing').isVisible()) && (await t('content-empty').count()) === 1);
  await t('to-pricing').click();
  await t('plan-card-video_4').waitFor();
  check(`${tag} 8b empty-state button opens Cenník (no "Váš balík" yet)`, (await t('current-plan').count()) === 0);
  // price catalogue (all bez DPH), three sub-tabs
  const pageText = async () => (await t('page').innerText()).replace(/\u00a0/g, ' ');
  let pt = await pageText();
  check(`${tag} 8c Cenník "Videá nehnuteľností": 50 / 140 / 62 / 200 €, 5 vizualizácií, Bez/S vizualizáciou, Chcem tento balík`, ['Bez vizualizácie', 'S vizualizáciou', '50 €', '140 €', '62 €', '200 €', 'max. 5 vizualizácií na nehnuteľnosť', 'bez DPH', 'Chcem tento balík'].every((x) => pt.includes(x)) && (await page.locator('[data-testid^=plan-card-]').count()) === 4 && !/faktúr/i.test(pt));
  const [g1, g2] = await Promise.all([t('plan-card-video_1').boundingBox(), t('plan-card-viz_1').boundingBox()]);
  if (!mobile) check(`${tag} 8c video and video_viz groups sit side by side on desktop`, Math.abs(g1.y - g2.y) < 4 && g2.x > g1.x);
  await noOverflow('cennik videa');
  await shot('cennik-videa');
  await t('ptab-social').click();
  pt = await pageText();
  check(`${tag} 8c Cenník "Sociálne siete": 290 / 390 / 690 €, +40 / +110 add-ons`, ['290 €', '390 €', '690 €', 'Klon hlasu', '+40 €', 'Digitálne dvojča', '+110 €', 'obsahuje klon hlasu', 'Mám záujem o doplnok'].every((x) => pt.includes(x)) && (await page.locator('[data-testid^=plan-card-]').count()) === 3 && (await t('plan-card-15').evaluate((e) => e.classList.contains('popular'))));
  await noOverflow('cennik social');
  await shot('cennik-social');
  await t('ptab-doplnky').click();
  pt = await pageText();
  check(`${tag} 8c Cenník "Doplnky": +10 € / video, +15 € / video`, ['+10 €', '+15 €', 'bez DPH / video'].every((x) => pt.includes(x)) && (await page.locator('[data-testid^=addon-card-]').count()) === 2);
  await noOverflow('cennik doplnky');
  await shot('cennik-doplnky');
  await t('tab-chat').click();
  await t('composer-text').waitFor();

  // 9. staff sees the conversation
  await t('mock-switch').click();
  await t('mfa-screen').waitFor();
  check(`${tag} 9 staff must pass TOTP: enrolment shows QR + key + dev hint`, (await t('mfa-screen').innerText()).includes('Overenie v dvoch krokoch') && (await t('mfa-qr').isVisible()) && (await t('mfa-secret').innerText()).length > 8 && (await t('dev-hint').innerText()).includes('654321') && (await t('staff-inbox').count()) === 0);
  await noOverflow('mfa');
  await t('mfa-qr').evaluate((i) => i.decode());
  await shot('staff-mfa');
  await t('code-0').fill('000000');
  await t('mfa-error').waitFor();
  check(`${tag} 9 wrong TOTP rejected, inbox still hidden`, (await t('mfa-error').innerText()).includes('Kód nie je správny') && (await t('staff-inbox').count()) === 0);
  await t('code-0').fill('654321');
  await t('staff-inbox').waitFor();
  await t('conv-item').first().waitFor();
  check(`${tag} 9 staff list has the customer's conversation`, (await t('conv-item').count()) === 1 && (await t('conv-item').first().innerText()).includes('Jana Nováková'));
  if (mobile) {
    check(`${tag} 9 unread badge = 6 customer messages`, (await t('unread-badge').innerText()) === '6');
    await noOverflow('staff list');
    await shot('staff');
    await t('conv-item').first().click();
  } else {
    await page.getByText('Skrátiť úvod o 2 sekundy').waitFor();
    check(`${tag} 9 unread cleared after the thread opened`, (await t('unread-badge').count()) === 0);
  }
  await page.getByText('Skrátiť úvod o 2 sekundy').waitFor();
  check(`${tag} 9 staff thread shows edit card, link and image`, (await t('edit-card').count()) === 1 && (await t('msg-link').count()) === 1 && (await t('att-image').count()) === 1);
  check(`${tag} 9 unread badge gone after opening`, (await t('unread-badge').count()) === 0);
  await sendText('Ahoj, "zdravím" z Domovidu');
  await page.getByText('Ahoj, "zdravím" z Domovidu').waitFor();
  await noOverflow('staff thread');
  if (!mobile) await shot('staff');

  // 9b. staff sets subscription (plan 15, 7 used, paid) and adds 2 content items
  await t('sub-open').click();
  await t('sub-panel').waitFor();
  await t('sub-plan').selectOption('15');
  check(`${tag} 9b plan 15 auto-fills videos 15 and price 390`, (await t('sub-included').inputValue()) === '15' && (await t('sub-price').inputValue()) === '390');
  await t('sub-used').fill('6');
  await t('used-plus').click();
  check(`${tag} 9b stepper +1 -> 7`, (await t('sub-used').inputValue()) === '7');
  await t('sub-pay').selectOption('paid');
  await t('sub-start').fill('2026-11-01');
  await t('sub-end').fill('2026-11-30');
  await t('sub-commit').fill('2027-01-31');
  check(`${tag} 9b social add-on checkboxes (only monthly ones) are offered`, (await t('addon-digital_twin').isVisible()) && (await t('addon-voice_clone').isVisible()) && (await page.locator('[data-testid=addon-both_formats]').count()) === 0);
  await t('addon-digital_twin').check();
  await t('cat-add').selectOption('video_viz');
  await t('cat-tab-video_viz').waitFor();
  const vizOptions = await t('sub-plan').locator('option').evaluateAll((o) => o.map((x) => x.value));
  check(`${tag} 9b plan select is filtered by category (viz_1, viz_4 only) and no add-on checkboxes for video_viz`, vizOptions.includes('viz_4') && vizOptions.includes('viz_1') && !vizOptions.includes('15') && (await page.locator('[data-testid^=addon-]').count()) === 0);
  await t('sub-plan').selectOption('viz_4');
  check(`${tag} 9b viz_4 auto-fills 4 videos and 200 €`, (await t('sub-included').inputValue()) === '4' && (await t('sub-price').inputValue()) === '200');
  await t('sub-used').fill('1');
  await t('sub-pay').selectOption('unpaid');
  await t('sub-start').fill('2026-11-01');
  await t('sub-end').fill('2026-11-30');
  await t('cat-tab-social').click();
  check(`${tag} 9b switching category keeps the unsaved social draft (15, 7 used, add-on ticked)`, (await t('sub-plan').inputValue()) === '15' && (await t('sub-used').inputValue()) === '7' && (await t('addon-digital_twin').isChecked()));
  const due1 = '2026-11-10', due2 = '2026-11-18';
  await t('item-title').fill('Video o novej ponuke');
  await t('item-kind').selectOption('ponuka');
  await t('item-due').fill(due1);
  await t('item-add').click();
  await t('item-title').fill('Tip pre kupujúcich');
  await t('item-kind').selectOption('tip');
  await t('item-due').fill(due2);
  await t('item-add').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=staff-item]').length === 2);
  await t('item-status').first().selectOption('for_approval');
  check(`${tag} 9b two content items listed in the staff panel`, (await t('staff-item').count()) === 2);
  await t('sub-note').scrollIntoViewIfNeeded();
  await noOverflow('subscription panel');
  await page.evaluate(() => { document.querySelector('[data-testid=sub-panel]').scrollTop = 0; });
  await shot('staff-subscription-panel');
  await shot('staff-panel');
  await t('sub-save').click();
  await t('sub-panel').waitFor({ state: 'detached' });

  // 10. CSV export
  const [dl] = await Promise.all([page.waitForEvent('download'), t('export-csv').click()]);
  const file = path.join(SCR, `export-${tag}.csv`);
  await dl.saveAs(file);
  const raw = fs.readFileSync(file);
  const csv = raw.toString('utf8');
  check(`${tag} 10 CSV download name`, /^konverzacia-.*\.csv$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  check(`${tag} 10 CSV has UTF-8 BOM and header`, raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf && csv.includes('created_at,sender,kind,body,link_url,video_ref,timecode,attachments'));
  const rows = csv.replace(/^﻿/, '').trim().split('\r\n');
  const editRow = rows.find((r) => r.includes('edit_request')) || '';
  check(`${tag} 10 CSV text row (quoted, comma inside)`, rows.some((r) => r.includes(',text,"Dobrý deň, mám otázku k videu"')));
  check(`${tag} 10 CSV edit_request row has video + timecode`, /edit_request,Skrátiť úvod o 2 sekundy,,Byt Záhorská,0:12,/.test(editRow), editRow);
  check(`${tag} 10 CSV link + attachment rows`, csv.includes(',link,https://example.com/moje-video,https://example.com/moje-video') && csv.includes(',file,,,,,fotka.png'));
  check(`${tag} 10 CSV quoting of comma and quotes`, csv.includes('"Ahoj, ""zdravím"" z Domovidu"'));
  check(`${tag} 10 CSV formula neutralised with quote prefix`, csv.includes(`"'=HYPERLINK(""http://evil.example"",""klik"")"`));
  check(`${tag} 10 no CSV cell starts with raw = + - @`, !/(^|,)"?[=+\-@]/m.test(csv.replace(/^\ufeff/, '').replace(/^created_at.*\r\n/, '').split('\r\n').map((r) => r.replace(/^[^,]*,/, '')).join('\n')));
  check(`${tag} 10 CSV row count = header + 8 messages`, rows.length === 9, `rows=${rows.length}`);

  // 11. customer sees staff reply, after reload too (localStorage persistence)
  await t('mock-switch').click();
  await t('customer-chat').waitFor();
  await page.getByText('Ahoj, "zdravím" z Domovidu').waitFor();
  await page.reload();
  await t('customer-chat').waitFor();
  check(`${tag} 11 customer sees staff reply after reload`, (await page.getByText('Ahoj, "zdravím" z Domovidu').count()) === 1 && (await t('att-image').count()) === 1);

  // 12. customer: Môj plán / Cenník
  check(`${tag} 12 header: logo + "Späť na web" both link to BASE_URL in the same tab`, (await t('back-to-web').getAttribute('href')) === '/domovid-web/' && (await t('logo-link').getAttribute('href')) === '/domovid-web/' && !(await t('back-to-web').getAttribute('target')) && (await t('back-to-web').innerText()).includes('Späť na web'));
  await t('tab-plan').click();
  await t('sub-card').first().waitFor();
  const social = page.locator('[data-testid=sub-card][data-category=social]');
  const usage = await social.getByTestId('sub-usage').innerText();
  check(`${tag} 12 Môj plán shows 7/15, zostáva 8, Zaplatené, period + commitment`, usage === '7/15' && (await social.getByTestId('sub-left').innerText()) === 'zostáva 8' && (await social.getByTestId('pay-badge').innerText()) === 'Zaplatené' && (await social.getByTestId('sub-period').innerText()).includes('1. 11.') && (await social.getByTestId('sub-commit').innerText()).includes('31. 1. 2027') && (await social.getByTestId('sub-name').innerText()).includes('15 videí'));
  const viz = page.locator('[data-testid=sub-card][data-category=video_viz]');
  check(`${tag} 12 Môj plán: one card per category (2 cards) + add-on chip with price`, (await t('sub-card').count()) === 2 && (await viz.getByTestId('sub-name').innerText()).includes('4 nehnuteľnosti') && (await viz.getByTestId('sub-usage').innerText()) === '1/4' && (await viz.getByTestId('pay-badge').innerText()) === 'Čaká na platbu' && (await social.getByTestId('addon-chip').count()) === 1 && (await social.getByTestId('addon-chip').innerText()).includes('Digitálne dvojča') && (await social.getByTestId('addon-chip').innerText()).includes('+110 €'));
  await noOverflow('plan 2 cards');
  await shot('plan-2cards');
  check(`${tag} 12 customer sees both content items, one with the approve button`, (await t('content-item').count()) === 2 && (await page.getByText('Video o novej ponuke').count()) === 1 && (await t('approve-item').count()) === 1 && (await t('page').innerText()).includes('Na schválenie'));
  await noOverflow('plan');
  await shot('customer-plan');
  await t('approve-item').click();
  check(`${tag} 12 approve button opens chat with prefilled text`, (await t('thread').isVisible()) && (await t('composer-text').inputValue()).includes('Video o novej ponuke'));
  await t('composer-text').fill('');
  await t('tab-pricing').click();
  await t('ptab-social').click();
  await t('plan-card-15').waitFor();
  check(`${tag} 12 Cenník: 3 cards, 15 highlighted + "Váš balík", others "Chcem tento balík", bez DPH`, (await page.locator('[data-testid^=plan-card-]').count()) === 3 && (await t('plan-card-15').evaluate((e) => e.classList.contains('popular'))) && (await t('plan-card-15').locator('[data-testid=current-plan]').innerText()).includes('Váš balík') && (await t('choose-plan-10').innerText()) === 'Chcem tento balík' && (await t('page').innerText()).includes('bez DPH') && !/faktúr/i.test(await t('page').innerText()));
  await noOverflow('cennik');
  await shot('customer-cennik');
  await t('choose-plan-30').click();
  await page.getByText('Mám záujem o balík 30 videí / mesiac (690 € bez DPH)').waitFor();
  check(`${tag} 12 "Chcem tento balík" posts the chat message and switches to chat`, (await t('thread').isVisible()) && (await t('msg').last().getAttribute('data-kind')) === 'text');
  await t('tab-pricing').click();
  await t('ptab-social').click();
  check(`${tag} 12 Cenník marks the active add-on "Aktívny doplnok"`, (await t('addon-card-digital_twin').getByTestId('current-addon').count()) === 1 && (await t('choose-addon-voice_clone').count()) === 1);
  await t('choose-addon-voice_clone').click();
  await page.getByText('Mám záujem o doplnok Klon hlasu (+40 € bez DPH / mesiac)').waitFor();
  check(`${tag} 12 add-on interest posts its chat message`, (await t('thread').isVisible()));
  await t('tab-pricing').click();
  await t('ptab-videa').click();
  check(`${tag} 12 Cenník Videá: current plan marked "Váš balík" (viz_4)`, (await t('plan-card-viz_4').getByTestId('current-plan').count()) === 1);
  await t('choose-plan-video_1').click();
  await page.getByText('Mám záujem o balík Videá nehnuteľností – Jedno video (50 € bez DPH, jednorazovo)').waitFor();
  check(`${tag} 12 video plan interest posts its chat message`, (await t('thread').isVisible()));
  await t('tab-pricing').click();
  await t('ptab-doplnky').click();
  await t('choose-addon-express').click();
  await page.getByText('Mám záujem o doplnok Expresné doručenie (+15 € bez DPH / video)').waitFor();
  check(`${tag} 12 video add-on interest posts its chat message`, (await t('thread').isVisible()));

  await t('sign-out').click();
  await t('login').waitFor();
  check(`${tag} 11 sign out returns to login`, await t('login').isVisible());
  check(`${tag} no console/page errors`, errs.length === 0, errs.join(' | '));
  check(`${tag} no GA/Pixel/Supabase network requests`, thirdParty.length === 0, thirdParty.join(' '));
  await ctx.close();
}

// 5 wrong codes lock the code boxes for 60 s
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(URL_APP);
  await page.getByTestId('login-email').fill('lock@example.com');
  await page.getByTestId('login-submit').click();
  for (let i = 0; i < 5; i++) { await page.getByTestId('code-0').fill('000000'); await page.waitForFunction((want) => (document.querySelector('[data-testid=code-error]')?.textContent || '').includes(want), i < 4 ? `Zostáva pokusov: ${4 - i}` : 'Príliš veľa pokusov'); }
  const msg = await page.getByTestId('code-error').innerText();
  check('lock: 5 wrong codes -> UI locked for 60 s', msg.includes('Príliš veľa pokusov') && (await page.getByTestId('code-0').isDisabled()), msg);
  await page.getByTestId('change-email').click();
  check('lock: "Zmeniť e-mail" returns to the e-mail step', await page.getByTestId('login-form').isVisible());
  await ctx.close();
}


// Sociálne siete -> "Chcem tento balík" -> prihlásenie -> dotazník v appke (predvyplnený) -> súčet doplnkov -> dopyt v chate
async function socialScenario(tag, viewport, mobile) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  const t = (id) => page.getByTestId(id);
  const noOverflow = async (n) => check(`${tag} ${n}: no horizontal overflow`, !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  const sum = () => t('offer-sum').innerText();
  const base = SITE + '/domovid-web/';

  await page.goto(base + 'socialne-siete/');
  const html = await page.locator('main').innerText();
  check(`${tag} social: samples are the two broker reels + tips`, (await page.locator('.trio figcaption').allInnerTexts()).join('|').includes('Hľadám byty a domy'));
  check(`${tag} social: 3 plans 290/390/690 with VAT, Najobľúbenejší, bez viazanosti`, (await page.locator('.pr-row').count()) === 3 && ['290 €', '390 €', '690 €', '356,70 €', 'najobľúbenejší', 'bez viazanosti'].every((x) => html.toLowerCase().includes(x)) && !/viazanosť \d/i.test(html));
  check(`${tag} social: 30-video plan has voiceover without AI portrait`, html.toLowerCase().includes('voiceover v cene (bez ai portrétu)'));
  await noOverflow('socialne-siete');
  await page.screenshot({ path: path.join(SCR, `social-page-${tag}.png`), fullPage: true });
  const href = await page.locator('.pr-row', { hasText: '30 videí' }).getByRole('link', { name: 'Chcem ponuku' }).getAttribute('href');
  check(`${tag} social: plan CTA goes to the app offer`, href === '/domovid-web/app/?ponuka=1&sluzba=social&balik=30', href);

  // login first, then the questionnaire opens prefilled
  await page.goto(SITE + href + '&mock=1');
  await t('login').waitFor();
  check(`${tag} offer: login explains the offer goes to the chat`, (await t('login-offer-note').isVisible()) && (await page.locator('h1').innerText()).includes('pošlite dopyt'));
  await t('login-email').fill('makler@example.com');
  await t('login-submit').click();
  await t('code-0').fill('123456');
  await t('offer-sheet').waitFor();
  check(`${tag} offer: prefilled social, plan 30, contact asked`, (await page.locator('input[name=service]:checked').inputValue()) === 'social' && (await page.locator('input[name=plan]:checked').inputValue()) === '30' && (await t('offer-contact').isVisible()) && !(await t('offer-property').isVisible()));
  check(`${tag} offer: sum 690 with VAT`, (await sum()).includes('690 € bez DPH') && (await sum()).includes('848,70 €'));
  await noOverflow('offer');
  await page.screenshot({ path: path.join(SCR, `offer-${tag}.png`) });

  await page.locator('.seg-opt', { hasText: '15 videí' }).click();
  await t('offer-addon-voice').check();
  check(`${tag} offer: 390 + voice 40 = 430`, (await sum()).includes('430 €'));
  await t('offer-addon-twin').check();
  check(`${tag} offer: 390 + twin 110 = 500, voice exclusive`, (await sum()).includes('500 €') && (await t('offer-addon-voice').isDisabled()) && !(await t('offer-addon-voice').isChecked()));

  await page.locator('.svc-opt', { hasText: 'Video z fotiek' }).click();
  check(`${tag} offer: video base 50, property fields shown`, (await sum()).includes('50 € bez DPH') && (await t('offer-property').isVisible()) && !(await t('offer-social').isVisible()));
  await t('offer-addon-formats').check();
  await t('offer-addon-express').check();
  check(`${tag} offer: video 50 + 10 + 15 = 75`, (await sum()).includes('75 €'));
  await page.locator('.svc-opt', { hasText: 'Vizualizácia' }).click();
  await t('offer-addon-formats').check();
  await t('offer-addon-express').check();
  check(`${tag} offer: viz 62 + 25 = 87`, (await sum()).includes('87 €'));

  // submit the social offer -> one message in the chat; the next offer skips contact fields
  await page.locator('.svc-opt', { hasText: 'Obsah na sociálne siete' }).click();
  await page.locator('.seg-opt', { hasText: '15 videí' }).click();
  await t('offer-addon-twin').check();
  await page.locator('.check', { hasText: 'Trh a ceny v regióne' }).click();
  await t('offer-name').fill('Test Maklér');
  await t('offer-phone').fill('+421 900 123 456');
  await t('offer-consent').check();
  await t('offer-submit').click();
  await t('offer-sheet').waitFor({ state: 'detached' });
  const last = await t('msg').last().innerText();
  check(`${tag} offer: message in chat has plan, topics, add-on, sum`, /Nový dopyt: Obsah na sociálne siete/.test(last) && /Balík: 15 videí/.test(last) && /Trh a ceny v regióne/.test(last) && /Digitálne dvojča/.test(last) && /500 € bez DPH/.test(last), last);
  check(`${tag} offer: header shows the saved name`, (await t('role-label').innerText()) === 'Test Maklér' || mobile);
  await t('offer-open').click();
  await t('offer-sheet').waitFor();
  check(`${tag} offer: "Chcem ďalšiu ponuku" without name/phone/e-mail`, (await t('offer-contact').count()) === 0 && (await page.locator('#offer-title').innerText()) === 'Chcem ďalšiu ponuku');
  await page.screenshot({ path: path.join(SCR, `offer-again-${tag}.png`) });
  check(`${tag} social no console/page errors`, errs.length === 0, errs.join(' | '));
  await ctx.close();
}

// Mini chat: opens on the first visit, offers sign-up, hands the typed text to the full chat after sign-in
async function miniChatScenario(tag, viewport, mobile) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  const t = (id) => page.getByTestId(id);
  await page.goto(SITE + '/domovid-web/');
  if (mobile) {
    await page.waitForFunction(() => document.querySelector('[data-cb-label]')?.classList.contains('teaser'));
    check(`${tag} minichat: phone shows the sign-in teaser, panel stays closed`, (await page.locator('[data-cb-label]').innerText()).includes('Prihláste sa') && (await page.locator('#cb-panel').isHidden()));
    await page.locator('.cb-bubble').click();
  } else {
    await page.locator('#cb-panel').waitFor({ state: 'visible', timeout: 5000 });
    check(`${tag} minichat: opens by itself on the first visit`, true);
  }
  check(`${tag} minichat: sign-up and sign-in offered`, (await page.getByRole('link', { name: 'Zaregistrovať sa' }).isVisible()) && (await page.locator('[data-cb-auth]').getByRole('link', { name: 'Prihlásiť sa' }).isVisible()));
  await page.evaluate(() => { document.getElementById('cb').dataset.app = '/domovid-web/app/?mock=1'; });
  await page.locator('#cb-text').fill('Dobrý deň, mám byt v centre.');
  await page.locator('.cb-send').click();
  await page.waitForURL(/\/app\//);
  await t('login-email').fill('mini@example.com');
  await t('login-submit').click();
  await t('code-0').fill('123456');
  await t('composer-text').waitFor();
  check(`${tag} minichat: typed text is prefilled in the full chat`, (await t('composer-text').inputValue()) === 'Dobrý deň, mám byt v centre.');
  await page.goto(SITE + '/domovid-web/app/?mock=1&registracia=1');
  check(`${tag} minichat: sign-up link opens "Vytvorte si účet" (or the chat when signed in)`, (await t('login-signup-note').count()) === 1 || (await t('composer-text').count()) === 1);
  check(`${tag} minichat no console/page errors`, errs.length === 0, errs.join(' | '));
  await ctx.close();
}

await scenario('desktop', { width: 1440, height: 900 }, false);
await scenario('mobile', { width: 390, height: 844 }, true);
await socialScenario('desktop', { width: 1440, height: 900 }, false);
await socialScenario('mobile', { width: 390, height: 844 }, true);
await miniChatScenario('desktop', { width: 1440, height: 900 }, false);
await miniChatScenario('mobile', { width: 390, height: 844 }, true);
await browser.close();
if (fails.length) { console.log(`\nFAILED ${fails.length}: ${fails.join(' | ')}`); process.exit(1); }
console.log('\nALL PASS');
