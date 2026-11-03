// Local E2E of the client delivery page and the unlock model (approval + package / payment).
// Usage: PW_PATH=<node_modules with playwright> [PW_CHROMIUM=<exe>] SRC=<video.mp4> SCR=<screenshot dir> [SITE=http://localhost:4460] node e2e.mjs
// Needs the site built with PUBLIC_DELIVERY_BASE=http://localhost:8860 PUBLIC_REVIEW_ENDPOINT=http://localhost:8861/exec and served at SITE.
// It starts serve.mjs (fake R2, :8860) and fake-apps-script.mjs (:8861) itself and kills only those two. Never touches real R2 / Sheet.
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(process.env.PW_PATH + '/');
const { chromium } = require('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLS = path.join(HERE, '..', '..', 'tools', 'dodaj_video.py');
const { SRC, SCR } = process.env;
const WORK = process.env.WORK || path.join(SCR, 'work');
const R2 = path.join(WORK, 'r2');
const SHEET = path.join(WORK, 'sheet.json');
const R2_BASE = 'http://localhost:8860';
const BASE = (process.env.SITE || 'http://localhost:4460') + '/domovid-web/video/?id=';
const IBAN = fs.readFileSync(path.join(HERE, 'fixtures', 'iban.txt'), 'utf8').split('\n')[0].replace(/\s+/g, '').toUpperCase();
const [NP, PK, RN] = ['nopkg0000001', 'pkg000000001', 'renew0000001'];
const fails = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`); if (!ok) fails.push(name); };

// ---- fixtures: fake Sheet + deliveries made by the real dodaj_video.py ----
fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(R2, { recursive: true });
fs.mkdirSync(SCR, { recursive: true });
const iso = (d) => d.toISOString().slice(0, 10);
const today = new Date();
const end = new Date(Date.now() + 25 * 864e5);
const pkg = (id, client, count, paid) => [id, client, iso(today), iso(end), '140,00', count, '', '', '', paid ? iso(today) : '', '', ''];
fs.writeFileSync(SHEET, JSON.stringify({
  Klienti: [['ID', 'Meno']],
  'Balíky': [['Balík ID', 'Klient', 'Začiatok', 'Koniec', 'Cena', 'Videí', 'G', 'H', 'Splatnosť', 'Zaplatené dňa', 'K', 'Poznámka'],
    pkg('OKP-2026-11', 'Balík Klient', 4, true), pkg('FUL-2026-10', 'Plný Klient', 1, true), pkg('UNP-2026-11', 'Bez Balíka Klient', 4, false)],
  'Videá': [['Dátum', 'Klient', 'Balík ID', 'Video ID (web)', 'Názov', 'Formáty', 'Kling', '€/kr', 'Náklad', 'Iné', 'Príjem', 'Zisk', 'Stav', 'Odkaz', 'Token', 'Súbory', 'Odomknuté', 'Schválené'],
    ['1. 10. 2026', 'Plný Klient', 'FUL-2026-10', 'fillerfiller1', 'Starý', '9:16', '', '', '', 0, '', '', 'odomknuté', 'x', '', '', 'áno', '']],
}));
const env = { ...process.env, DOMOVID_SHEET_FAKE: SHEET };
const dodaj = (...args) => execFileSync('python3', ['-B', TOOLS, '--out-dir', R2, '--iban-file', path.join(HERE, 'fixtures', 'iban.txt'), ...args], { env, encoding: 'utf8' });
const children = [
  spawn('node', [path.join(HERE, 'serve.mjs')], { env: { ...env, FAKE_R2: R2, PORT: '8860' }, stdio: 'inherit' }),
  spawn('node', [path.join(HERE, 'fake-apps-script.mjs')], { env: { ...env, R2_BASE, PORT: '8861' }, stdio: 'inherit' }),
];
const cleanup = () => children.forEach((c) => c.kill());
process.on('exit', cleanup);
for (const port of [8860, 8861]) for (let i = 0; i < 50; i++) { if (await fetch(`http://localhost:${port}/`).then(() => true, () => false)) break; await new Promise((r) => setTimeout(r, 100)); }

dodaj(SRC, '--client', 'Test Klient', '--title', 'Rodinný dom Záhorská', '--id', NP, '--reference', 'UNP-2026-11');
dodaj(SRC, '--client', 'Balík Klient', '--title', 'Byt s balíkom', '--id', PK, '--reference', 'OKP-2026-11', '--video-16x9', SRC);
dodaj(SRC, '--client', 'Plný Klient', '--title', 'Vyčerpaný balík', '--id', RN, '--reference', 'FUL-2026-10');
const priv = (id) => JSON.parse(fs.readFileSync(path.join(R2, '.master', id, 'private.json'), 'utf8'));
const masterUrl = (id, i = 0) => `${R2_BASE}/${id}/m-${priv(id).token}/${priv(id).downloads[i].file}`;
const sheetRow = (id) => JSON.parse(fs.readFileSync(SHEET, 'utf8'))['Videá'].find((r) => r[3] === id);

// ---- browser ----
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const posts = [];
const reqs = [];
const page = await ctx.newPage();
const thirdParty = [];
const errs = [];
page.on('request', (r) => {
  reqs.push(r.url());
  if (r.method() === 'POST' && r.url().startsWith('http://localhost:8861')) posts.push(JSON.parse(r.postData()));
  if (/googletagmanager\.com|connect\.facebook\.net|google-analytics\.com/.test(r.url())) thirdParty.push(r.url());
});
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));

async function open(id) {
  await page.goto(BASE + id);
  await page.waitForSelector('#state-ready:not([hidden]), #state-error:not([hidden])');
}
async function media(sel = '#video-player') {
  await page.waitForFunction((s) => { const v = document.querySelector(s); return v && v.readyState >= 1; }, sel, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(400);
}
const shot = (n) => page.screenshot({ path: path.join(SCR, n), fullPage: true });
const src = (id = 'video-player') => page.evaluate((i) => document.getElementById(i).currentSrc, id);
const vis = (sel) => page.locator(sel).isVisible();
const bodyText = async () => (await page.locator('body').innerText()).replace(/[\s ]+/g, ' ');

async function noDownloadChecks(tag, playerId = 'video-player') {
  const v = await page.evaluate((playerId) => {
    const el = document.getElementById(playerId);
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    return { cl: el.controlsList.contains('nodownload') && el.controlsList.contains('noremoteplayback'), pip: el.disablePictureInPicture, drag: el.getAttribute('draggable'), prevented: ev.defaultPrevented };
  }, playerId);
  check(`${tag} ${playerId}: nodownload + noremoteplayback, no PiP, draggable=false, contextmenu prevented`, v.cl && v.pip === true && v.drag === 'false' && v.prevented === true, JSON.stringify(v));
}
/** Badge preview <=> no download anchor: the two always switch together. */
async function badgeIffNoDownload(tag, expectUnlocked) {
  const s = await src();
  const badge = s.endsWith('/preview.mp4');
  const anchors = await page.locator('a[download]').count();
  check(`${tag}: badge ${expectUnlocked ? 'gone' : 'shown'} exactly when download ${expectUnlocked ? 'shown' : 'absent'}`, badge === !expectUnlocked && (anchors > 0) === expectUnlocked, `src=${s.slice(-40)} anchors=${anchors}`);
  if (!expectUnlocked) check(`${tag}: poster kept (badge frame)`, !!(await page.evaluate(() => document.getElementById('video-player').getAttribute('poster'))));
}
const buttonsGone = async () => !(await vis('#btn-approve')) && !(await vis('#btn-changes')) && !(await vis('#review-actions'));
const buttonsShown = async () => (await vis('#btn-approve')) && (await vis('#btn-changes'));

// ---- 1. no package, unapproved ----
{
  const n0 = reqs.length;
  await open(NP);
  await media();
  check('1 ready, title + client', (await page.textContent('#video-title')) === 'Rodinný dom Záhorská' && (await page.textContent('#video-client')) === 'Test Klient');
  check('1 robots noindex,nofollow', (await page.locator('meta[name="robots"]').getAttribute('content')) === 'noindex, nofollow');
  await badgeIffNoDownload('1', false);
  check('1 zero a[download], zero .mp4 anchors, downloads hidden', (await page.locator('a[download]').count()) === 0 && (await page.locator('a[href*=".mp4"]').count()) === 0 && !(await vis('#downloads-wrap')));
  const pm = priv(NP);
  const files = pm.downloads.map((d) => d.file);
  const manifestRaw = await (await ctx.request.get(`${R2_BASE}/${NP}/manifest.json`)).text();
  const secrets = [...files, pm.token, '/m-'];
  const html = await page.content();
  check('1 no master name / token / m- path in DOM', secrets.every((x) => !html.includes(x)));
  check('1 no master name / token in public manifest, no "downloads" key', secrets.every((x) => !manifestRaw.includes(x)) && !('downloads' in JSON.parse(manifestRaw)), manifestRaw.slice(0, 120));
  check('1 no request to an m-<token> path', !reqs.slice(n0).some((u) => u.includes('/m-')));
  check('1 master not in R2 yet', !fs.readdirSync(path.join(R2, NP)).some((f) => f.startsWith('m-')));
  check('1 payment notice with price + IBAN', (await vis('#downloads-locked')) && (await vis('#price-box')));
  const t = await bodyText();
  for (const part of ['140,00 €', '32,20 €', '172,20 €', 'DPH 23 %', 'UNP-2026-11', 'IBAN: ' + IBAN.replace(/(.{4})(?=.)/g, '$1 ')]) check(`1 text contains "${part}"`, t.includes(part));
  check('1 no "faktúr"', !/faktúr/i.test(t));
  await page.getByRole('button', { name: 'Kopírovať' }).click();
  await page.waitForFunction(() => document.getElementById('iban-copied').textContent === 'Skopírované', null, { timeout: 3000 }).catch(() => {});
  check('1 IBAN copy -> clipboard == IBAN', (await page.evaluate(() => navigator.clipboard.readText())) === IBAN);
  check('1 both buttons visible', await buttonsShown());
  check('1 no horizontal overflow', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  await noDownloadChecks('1');
  await shot('state1-nopkg-unapproved.png');
  // validation + change request (allowed before approval)
  await page.click('#btn-changes');
  await page.click('#btn-send-changes');
  check('1 empty change: validation shown, no POST', (await vis('#review-status')) && /Napíšte nám/.test(await page.textContent('#review-status')) && posts.length === 0);
  await page.fill('#changes-text', 'Prosím skrátiť úvod o 2 sekundy.');
  await page.click('#btn-send-changes');
  await page.waitForSelector('#review-status.ok');
  const c = posts[0];
  check('1 changes POST once, payload', posts.length === 1 && c.type === 'review' && c.action === 'changes' && c.id === NP && c.message === 'Prosím skrátiť úvod o 2 sekundy.' && c.company === '', JSON.stringify(c));
  check('1 changes leave the Sheet unapproved', !sheetRow(NP)[17]);
}

// ---- 2. no package, approved, unpaid ----
{
  await open(NP);
  await media();
  const n = posts.length;
  await page.click('#btn-approve');
  await page.waitForSelector('#review-status.ok');
  const ap = posts[posts.length - 1];
  check('2 approve POST once, payload', posts.length === n + 1 && ap.type === 'review' && ap.action === 'approve' && ap.id === NP && ap.message === '', JSON.stringify(ap));
  check('2 approve text mentions IBAN, no download yet', /IBAN/.test(await page.textContent('#review-status')));
  check('2 buttons gone right after approve', await buttonsGone());
  await badgeIffNoDownload('2 (no reload)', false);
  check('2 payment notice still shown', await vis('#price-box'));
  check('2 Sheet R (Schválené) written', !!sheetRow(NP)[17], sheetRow(NP)[17]);
  const changeAfter = await fetch('http://localhost:8861/exec', { method: 'POST', body: JSON.stringify({ type: 'review', id: NP, action: 'changes', message: 'x' }) }).then((r) => r.json());
  check('2 changes after approval -> {ok:false,error:"approved"}', changeAfter.ok === false && changeAfter.error === 'approved', JSON.stringify(changeAfter));
  await open(NP);
  await media();
  check('2 buttons gone after reload', await buttonsGone());
  await badgeIffNoDownload('2 (reload)', false);
  check('2 payment notice after reload', (await vis('#downloads-locked')) && (await vis('#price-box')));
  check('2 still zero download anchors, master absent from R2', (await page.locator('a[download]').count()) === 0 && !fs.readdirSync(path.join(R2, NP)).some((f) => f.startsWith('m-')));
  await shot('state2-nopkg-approved.png');
}

// ---- 3. package, unapproved ----
{
  const n0 = reqs.length;
  await open(PK);
  await page.waitForFunction(() => ['video-player', 'video-player-16x9'].every((i) => document.getElementById(i).readyState >= 1), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(400);
  await badgeIffNoDownload('3', false);
  check('3 16:9 player also badge preview', (await src('video-player-16x9')).endsWith('/preview_16x9.mp4'));
  check('3 zero downloads', (await page.locator('a[download]').count()) === 0 && !(await vis('#downloads-wrap')));
  check('3 no payment notice', !(await vis('#downloads-locked')) && !(await vis('#price-box')) && !/IBAN|platby/.test(await bodyText()));
  check('3 both buttons visible', await buttonsShown());
  check('3 captions + both players visible', (await vis('#video-player')) && (await vis('#video-player-16x9')) && (await page.locator('#caption-916').innerText()) === 'Na výšku (9:16)');
  check('3 no request to an m-<token> path', !reqs.slice(n0).some((u) => u.includes('/m-')));
  check('3 master already in R2 under m-<token> (package active)', fs.existsSync(path.join(R2, PK, `m-${priv(PK).token}`, priv(PK).downloads[0].file)));
  await noDownloadChecks('3', 'video-player');
  await noDownloadChecks('3', 'video-player-16x9');
  check('3 no horizontal overflow', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  await shot('state3-pkg-unapproved.png');
}

// ---- 4. package, after approve (no reload) ----
{
  await page.click('#btn-approve');
  await page.waitForSelector('#downloads a[download]');
  const m0 = masterUrl(PK, 0);
  await page.waitForFunction((u) => document.getElementById('video-player').currentSrc === u, m0, { timeout: 15000 });
  check('4 download anchors appear without reload (2)', (await page.locator('#downloads a[download]').count()) === 2 && (await vis('#downloads-wrap')));
  check('4 player currentSrc == clean master url, poster removed', (await src()) === m0 && (await page.evaluate(() => document.getElementById('video-player').getAttribute('poster'))) === null, await src());
  await page.waitForFunction((u) => document.getElementById('video-player-16x9').currentSrc === u, masterUrl(PK, 1), { timeout: 15000 }).catch(() => {});
  check('4 16:9 player == 1920×1080 master', (await src('video-player-16x9')) === masterUrl(PK, 1));
  await badgeIffNoDownload('4 (no reload)', true);
  check('4 buttons gone, no payment wording', (await buttonsGone()) && !/IBAN|platb|úhrad/i.test(await page.textContent('#review-status')), await page.textContent('#review-status'));
  const labels = (await page.locator('#downloads a').allTextContents()).map((t) => t.replace(/\s+/g, ' '));
  check('4 labels 1080×1920 then 1920×1080', labels[0].includes('1080×1920') && labels[1].includes('1920×1080'), labels.join(' | '));
  await media();
  await shot('state4-pkg-approved-unlocked.png');
  await open(PK);
  await page.waitForSelector('#downloads a[download]');
  await media();
  check('4 persists after reload: buttons gone, master player, 2 downloads', (await buttonsGone()) && (await src()) === m0 && (await page.locator('#downloads a[download]').count()) === 2);
  await badgeIffNoDownload('4 (reload)', true);
  const a = page.locator('#downloads a[download]').first();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), a.click()]);
  const file = priv(PK).downloads[0].file;
  check('4 download click: filename + size == master', dl.suggestedFilename() === file && fs.statSync(await dl.path()).size === fs.statSync(path.join(R2, PK, `m-${priv(PK).token}`, file)).size, dl.suggestedFilename());
  await page.waitForFunction(() => !document.querySelector('#downloads a[data-busy]'));
  const head = await ctx.request.fetch(m0, { method: 'HEAD' });
  check('4 master HEAD 200 + content-length', head.status() === 200 && Number(head.headers()['content-length']) === fs.statSync(path.join(R2, PK, `m-${priv(PK).token}`, file)).size);
  // status API down -> locked fallback, never a download
  await page.route('http://localhost:8861/exec?type=status*', (r) => r.abort());
  await open(PK);
  await media();
  check('4 status fails -> locked fallback: badge, 0 anchors, error note', (await src()).endsWith('/preview.mp4') && (await page.locator('a[download]').count()) === 0 && (await page.textContent('#review-status')).includes('Stav schválenia'), await page.textContent('#review-status'));
  await page.unroute('http://localhost:8861/exec?type=status*');
}

// ---- 5. no package, after --mark-paid ----
{
  console.log(dodaj('--mark-paid', NP).trim().split('\n').slice(-3).join(' | '));
  await open(NP);
  await page.waitForSelector('#downloads a[download]');
  const m0 = masterUrl(NP, 0);
  await page.waitForFunction((u) => document.getElementById('video-player').currentSrc === u, m0, { timeout: 15000 });
  await media();
  check('5 one download anchor, player == clean master, poster removed', (await page.locator('#downloads a[download]').count()) === 1 && (await src()) === m0 && (await page.evaluate(() => document.getElementById('video-player').getAttribute('poster'))) === null);
  await badgeIffNoDownload('5', true);
  check('5 buttons gone, payment notice gone', (await buttonsGone()) && !(await vis('#downloads-locked')) && !(await vis('#price-box')));
  check('5 Sheet Q (Odomknuté) == áno', sheetRow(NP)[16] === 'áno');
  const file = priv(NP).downloads[0].file;
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.locator('#downloads a[download]').first().click()]);
  check('5 download click: filename + size == master', dl.suggestedFilename() === file && fs.statSync(await dl.path()).size === fs.statSync(path.join(R2, NP, `m-${priv(NP).token}`, file)).size);
  await page.waitForFunction(() => !document.querySelector('#downloads a[data-busy]'));
  await shot('state5-nopkg-markpaid.png');
}

// ---- renewal / single (exhausted package) ----
{
  const r = JSON.parse(fs.readFileSync(path.join(R2, RN, 'manifest.json'), 'utf8')).renewal;
  await open(RN);
  await media();
  const t = await bodyText();
  check('R renewal heading', (await page.locator('#renewal-heading').textContent()) === 'Mesačný balík je vyčerpaný' && (await vis('#renewal-heading')));
  check('R offer "Obnoviť balík <id> – 1 video" + Spolu 172,20 €', r.videos === 1 && t.includes(`Obnoviť balík ${r.package_id} – 1 video`) && t.includes('Spolu na úhradu 172,20 €'));
  check('R reference label + package id + IBAN', t.includes(`Variabilný symbol / referencia platby: ${r.package_id}`) && t.includes('IBAN: ' + IBAN.replace(/(.{4})(?=.)/g, '$1 ')));
  check('R price block shown once', (await page.locator('#price-box:visible').count()) === 1);
  const sk = (d) => `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 2, 0).getDate();
  const e2 = new Date(now.getFullYear(), now.getMonth() + 1, Math.min(now.getDate(), last) - 1);
  check('R validity text', (await page.locator('#price-validity').innerText()).replace(/\s+/g, ' ') === `Platí 1 mesiac odo dňa prijatia platby – pri platbe dnes: ${sk(now)} – ${sk(e2)}`);
  const st = (await page.locator('#single-box').innerText()).replace(/[\s ]+/g, ' ');
  check('R single option text', st.includes('Alebo len toto video bez balíka') && st.includes('50,00 € + DPH 23 % 11,50 € = 61,50 €') && st.includes(RN), st);
  check('R renew/single/decline visible, approve/changes hidden', (await vis('#btn-renew')) && (await vis('#btn-single')) && (await vis('#btn-decline')) && !(await vis('#btn-approve')));
  await badgeIffNoDownload('R', false);
  check('R zero download anchors', (await page.locator('a[download]').count()) === 0);
  await noDownloadChecks('R');
  await shot('renewal.png');
  for (const [btn, action, done] of [
    ['#btn-single', 'single', `Ďakujeme! Po prijatí platby 61,50 € na IBAN nižšie (referencia ${RN}) vám video odomkneme.`],
    ['#btn-renew', 'renew', `Ďakujeme! Balík ${r.package_id} sme pre vás pripravili – po prijatí platby na IBAN nižšie vám odomkneme video a pokračujeme ďalšími videami.`],
    ['#btn-decline', 'decline', 'Rozumieme, ďakujeme za spoluprácu. Ak si to rozmyslíte, stačí nám napísať.'],
  ]) {
    await open(RN);
    const n = posts.length;
    await page.click(btn);
    await page.waitForSelector('#renewal-status:not([hidden])');
    const p = posts[posts.length - 1];
    check(`R ${action}: one POST + payload`, posts.length === n + 1 && p.type === 'review' && p.id === RN && p.action === action && p.company === '' &&
      (action === 'single' ? p.price_net === 50 && p.package_id === r.package_id : action === 'renew' ? p.package_id === r.package_id : !('package_id' in p)), JSON.stringify(p));
    check(`R ${action}: confirmation text`, (await page.textContent('#renewal-status')).replace(/ /g, ' ') === done);
    check(`R ${action}: all buttons disabled`, (await page.locator('#btn-renew').isDisabled()) && (await page.locator('#btn-single').isDisabled()) && (await page.locator('#btn-decline').isDisabled()));
  }
}

// ---- invalid ids ----
await open('BAD!id');
check('invalid id error', await vis('#state-error'));
await open('zzzzzzzzzzzz');
check('unknown id: ready state shown without a status is not allowed to unlock', (await page.locator('a[download]').count()) === 0);

// ---- grep: nothing public (outside m-*/ and .master) contains a master filename or token ----
{
  const needles = [NP, PK, RN].flatMap((id) => [priv(id).token, ...priv(id).downloads.map((d) => d.file)]);
  const hits = [];
  const walk = (dir, rel = '') => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name.startsWith('m-')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, rel + e.name + '/');
      else {
        const data = fs.readFileSync(p, 'latin1');
        for (const n of needles) if (data.includes(n) || (rel + e.name).includes(n)) hits.push(`${rel + e.name} ~ ${n}`);
      }
    }
  };
  walk(R2);
  const mpath = path.join(R2, PK, `m-${priv(PK).token}`, priv(PK).downloads[0].file);
  const positive = fs.existsSync(mpath) && needles.some((n) => mpath.includes(n));
  check('grep: public fixture files contain no master filename or token', hits.length === 0, hits.join('; '));
  check('grep positive control: the m-<token> master path does match the needles', positive);
}
check('no GTM/FB/GA requests across whole run', thirdParty.length === 0, JSON.stringify(thirdParty));
console.log('console/page errors:', JSON.stringify(errs));
await browser.close();
cleanup();
console.log(fails.length ? 'FAILED: ' + fails.join('; ') : 'ALL CHECKS PASSED');
process.exit(fails.length ? 1 : 0);
