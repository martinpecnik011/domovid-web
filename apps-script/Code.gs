/**
 * Domovid lead form backend (Google Apps Script web app).
 * Each POST from the website's form appends a row to the bound spreadsheet
 * and sends a notification e-mail to NOTIFY_EMAIL. Setup: see SETUP.md.
 */

var NOTIFY_EMAIL = 'martinpecnik011@gmail.com';
var SHEET_NAME = 'Leady';
var HEADERS = ['Prijaté', 'Meno', 'Telefón', 'E-mail', 'Správa', 'Stránka', 'Odoslané (prehliadač)'];

function doPost(e) {
  var p = (e && e.parameter) || {};

  // Honeypot / minimal validation: silently accept junk so bots learn nothing.
  if (p.company || !p.name || !p.phone) {
    return json({ ok: true });
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet();
    sheet.appendRow([
      new Date(),
      clean(p.name, 120),
      clean(p.phone, 40),
      clean(p.email, 160),
      clean(p.message, 2000),
      clean(p.page, 300),
      clean(p.sentAt, 40)
    ]);
  } finally {
    lock.releaseLock();
  }

  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: 'Domovid: nový dopyt od ' + clean(p.name, 120),
    body:
      'Meno: ' + clean(p.name, 120) + '\n' +
      'Telefón: ' + clean(p.phone, 40) + '\n' +
      'E-mail: ' + (clean(p.email, 160) || '-') + '\n\n' +
      'Správa:\n' + (clean(p.message, 2000) || '-') + '\n\n' +
      'WhatsApp: https://wa.me/' + waNumber(p.phone) + '\n' +
      'Tabuľka: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl()
  });

  sendConfirmation(clean(p.email, 160), clean(p.name, 120));

  return json({ ok: true });
}

// Confirmation to the customer, only when they left a valid-looking e-mail.
function sendConfirmation(email, name) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  var first = String(name).split(/\s+/)[0] || '';
  MailApp.sendEmail({
    to: email,
    replyTo: NOTIFY_EMAIL,
    name: 'Domovid',
    subject: 'Domovid: tvoj dopyt sme prijali',
    body:
      'Ahoj' + (first ? ' ' + first : '') + ',\n\n' +
      'ďakujeme za záujem o Domovid. Tvoj dopyt sme prijali a ozveme sa ti do 24 hodín ' +
      'na WhatsApp alebo e-mail.\n\n' +
      'Ak chceš začať hneď, pošli nám 4–6 fotiek nehnuteľnosti na WhatsApp +421 915 384 940 ' +
      '(https://wa.me/421915384940). Prvú verziu videa dostaneš s vodoznakom na posúdenie.\n\n' +
      'Martin, Domovid\n' +
      'https://martinpecnik011.github.io/domovid-web/\n\n' +
      'Tento e-mail ti prišiel, lebo si vyplnil formulár na webe Domovid. ' +
      'Ak to nebol ty, stačí odpovedať a údaje vymažeme.'
  });
}

// SK numbers typed as 0900 123 456 → 421900123456 for wa.me links.
function waNumber(phone) {
  var d = String(phone || '').replace(/\D/g, '');
  if (d.indexOf('00') === 0) d = d.slice(2);
  else if (d.charAt(0) === '0') d = '421' + d.slice(1);
  return d;
}

function doGet() {
  return json({ ok: true, service: 'domovid-leads' });
}

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Strip leading formula characters so a submitted "=HYPERLINK(...)" stays plain text.
function clean(value, max) {
  var s = String(value || '').trim().slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor to grant permissions and create the sheet header. */
function setup() {
  getSheet();
}
