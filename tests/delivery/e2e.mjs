// Local E2E of the client delivery page. Usage: IDA=.. IDB=.. SCR=.. node e2e.mjs (playwright resolved via PW_PATH)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(process.env.PW_PATH + '/');
const { chromium } = require('playwright');
const { IDA, IDB, SCR } = process.env;
const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fake-r2');
const BASE = 'http://localhost:4321/domovid-web/video/?id=';
const fails = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`); if (!ok) fails.push(name); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const posts = [];
await ctx.route('https://script.google.com/**', async (route) => {
  const r = route.request();
  posts.push({ method: r.method(), url: r.url(), body: r.postData() });
  await route.fulfill({ status: 200, contentType: 'text/plain', body: '{"ok":true}' });
});
const page = await ctx.newPage();
const thirdParty = [];
page.on('request', (r) => { if (/googletagmanager\.com|connect\.facebook\.net|google-analytics\.com/.test(r.url())) thirdParty.push(r.url()); });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));

async function open(id, vp) {
  if (vp) await page.setViewportSize(vp);
  await page.goto(BASE + id);
  await page.waitForSelector('#state-ready:not([hidden]), #state-error:not([hidden])');
}
async function media() {
  await page.waitForFunction(() => { const v = document.getElementById('video-player'); return v && v.readyState >= 1; }, null, { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => new Promise((res) => { const p = document.getElementById('video-player').poster; if (!p) return res(); const i = new Image(); i.onload = i.onerror = res; i.src = p; }));
  await page.waitForTimeout(500);
}
const shot = (n, full = true) => page.screenshot({ path: path.join(SCR, n), fullPage: full });

// 01 unpaid
await open(IDA);
await media();
check('A ready', await page.locator('#state-ready').isVisible());
check('A title/client', (await page.textContent('#video-title')) === 'Rodinný dom Záhorská' && (await page.textContent('#video-client')) === 'Test Klient', await page.textContent('#video-client'));
check('A downloads-locked visible', await page.locator('#downloads-locked').isVisible());
const LOCKED_TEXT = 'Stiahnutie v plnej kvalite sa odomkne po prijatí platby. Číslo účtu (IBAN) na úhradu vám pošleme.';
check('A #locked-text == LOCKED_TEXT', (await page.locator('#downloads-locked #locked-text').textContent()).trim() === LOCKED_TEXT, await page.locator('#locked-text').textContent());
check('robots meta == "noindex, nofollow"', (await page.locator('meta[name="robots"]').getAttribute('content')) === 'noindex, nofollow', await page.locator('meta[name="robots"]').getAttribute('content'));
check('no cookie banner element (#cc)', (await page.locator('#cc').count()) === 0 && (await page.locator('.cc').count()) === 0);
check('no GTM/FB/GA requests on /video/', thirdParty.length === 0, JSON.stringify(thirdParty));
check('A no anchors', (await page.locator('#downloads a').count()) === 0 && !(await page.locator('#downloads-wrap').isVisible()));
check('A video readyState', (await page.evaluate(() => document.getElementById('video-player').readyState)) >= 1);
await shot('01_unpaid_preview.png');

// empty validation
await page.click('#btn-changes');
await page.click('#btn-send-changes');
check('empty change: validation shown', (await page.locator('#review-status').isVisible()) && /Napíšte nám/.test(await page.textContent('#review-status')), await page.textContent('#review-status'));
check('empty change: no POST', posts.length === 0, `posts=${posts.length}`);

// 02
await page.fill('#changes-text', 'Prosím skrátiť úvod o 2 sekundy.');
await shot('02_change_request_form.png');

// 03
await page.click('#btn-send-changes');
await page.waitForSelector('#review-status.ok');
check('changes success status', /Ďakujeme/.test(await page.textContent('#review-status')), await page.textContent('#review-status'));
check('changes POST sent once', posts.length === 1, `posts=${posts.length}`);
await shot('03_change_sent.png');
const changes = JSON.parse(posts[0].body);

// 04
await open(IDA);
await media();
await page.click('#btn-approve');
await page.waitForSelector('#review-status.ok');
check('approve success status', /schválili/.test(await page.textContent('#review-status')), await page.textContent('#review-status'));
check('approve POST sent', posts.length === 2, `posts=${posts.length}`);
await shot('04_approved.png');
const approve = JSON.parse(posts[1].body);
console.log('CHANGES PAYLOAD', JSON.stringify(changes, null, 1));
console.log('APPROVE PAYLOAD', JSON.stringify(approve, null, 1));
console.log('POST methods/urls', posts.map((p) => p.method + ' ' + p.url.slice(0, 50)).join(' | '));
check('changes payload fields', changes.type === 'review' && changes.action === 'changes' && changes.id === IDA && changes.message === 'Prosím skrátiť úvod o 2 sekundy.' && changes.company === '');
check('approve payload fields', approve.type === 'review' && approve.action === 'approve' && approve.id === IDA && approve.message === '');

// 05 paid
await open(IDB);
await media();
const anchors = page.locator('#downloads a[download]');
check('B exactly 1 download anchor, labelled master', (await anchors.count()) === 1 && /Originál – plná kvalita \(1080×1920\)/.test((await anchors.first().textContent()).replace(/\s+/g, ' ')), (await anchors.first().textContent()).replace(/\s+/g, ' ').trim());
check('B downloads visible', (await anchors.count()) === 1 && (await page.locator('#downloads-wrap').isVisible()) && !(await page.locator('#downloads-locked').isVisible()), `n=${await anchors.count()}`);
await shot('05_paid_downloads.png');
const href = await anchors.first().getAttribute('href');
const size = fs.statSync(path.join(FAKE, IDB, decodeURIComponent(href.split('/').pop()))).size;
const head = await ctx.request.fetch(href, { method: 'HEAD' });
const get = await ctx.request.get(href);
const body = await get.body();
console.log(`MASTER href=${href}\n HEAD ${head.status()} CL=${head.headers()['content-length']}\n GET ${get.status()} CL=${get.headers()['content-length']} bodyBytes=${body.length}\n stat size=${size}`);
check('master HEAD 200 + CL==size', head.status() === 200 && Number(head.headers()['content-length']) === size);
check('master GET 200 + CL==size', get.status() === 200 && Number(get.headers()['content-length']) === size && body.length === size);
const hidden = await ctx.request.get(href.replace(/\/[^/]+\/[^/]+$/, '').replace(IDB, '') + '/.master/' + IDB + '/manifest.json');
check('.master not served (404)', hidden.status() === 404, String(hidden.status()));
const unpaidMaster = await ctx.request.get(href.replace(IDB, IDA));
check('unpaid master not public (404)', unpaidMaster.status() === 404, String(unpaidMaster.status()));

// 06 invalid
await open('BAD!id');
check('invalid id error', await page.locator('#state-error').isVisible(), await page.textContent('#error-text'));
await shot('06_error_invalid.png');
await open('zzzzzzzzzzzz');
check('unknown id error', (await page.locator('#state-error').isVisible()) && !(await page.locator('#state-ready').isVisible()), await page.textContent('#error-text'));

// 07 desktop
await open(IDB, { width: 1280, height: 900 });
await media();
await shot('07_desktop_paid.png');

const ovf = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
check('desktop no horizontal overflow', !ovf);
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(BASE + IDB); await page.waitForSelector('#state-ready:not([hidden])');
check('mobile no horizontal overflow', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
check('no GTM/FB/GA requests across whole run', thirdParty.length === 0, JSON.stringify(thirdParty));
console.log('console/page errors:', JSON.stringify(errs));
await browser.close();
console.log(fails.length ? 'FAILED: ' + fails.join('; ') : 'ALL CHECKS PASSED');
process.exit(fails.length ? 1 : 0);
