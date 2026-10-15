/**
 * Domovid lead form backend (Google Apps Script web app).
 * Each POST from the website's form appends a row to the bound spreadsheet
 * and sends a notification e-mail to NOTIFY_EMAIL. Up to MAX_FILES photos
 * are saved into a per-lead Google Drive folder. Setup: see SETUP.md.
 *
 * Wire formats accepted by doPost:
 *  - JSON body (Content-Type text/plain, fetch mode 'no-cors'):
 *    {"name","phone","email","message","page","sentAt","company","utm","discount",
 *     "files":[{"name","type","data":"<base64>"}]}
 *  - legacy URL-encoded form fields (e.parameter), text only.
 */

var NOTIFY_EMAIL = 'martinpecnik011@gmail.com';
var SHEET_NAME = 'Leady';
var HEADERS = ['Prijaté', 'Meno', 'Telefón', 'E-mail', 'Správa', 'Stránka', 'Odoslané (prehliadač)', 'Fotky', 'UTM', 'Zľavový kód'];

var TIME_ZONE = 'Europe/Bratislava';
var UPLOAD_FOLDER_NAME = 'Domovid leady – fotky';
var UPLOAD_FOLDER_PROP = 'UPLOAD_FOLDER_ID';
var MAX_FILES = 10;
var MAX_FILE_BYTES = 8 * 1024 * 1024;
var ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

function doPost(e) {
  var p = parsePayload(e);
  if (!p) return json({ ok: false });

  // Honeypot / minimal validation: silently accept junk so bots learn nothing.
  if (p.company || !p.name || !p.phone) {
    return json({ ok: true });
  }

  var name = clean(p.name, 120);
  // Caller's discount code (validated by the website); stored as typed, upper-cased, for the monthly report.
  var discount = clean(p.discount, 40).replace(/\s+/g, '').toUpperCase();

  // Drive writes happen outside the lock; only the sheet append is serialised.
  var photos = savePhotos(p.files, name);

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet();
    sheet.appendRow([
      new Date(),
      name,
      clean(p.phone, 40),
      clean(p.email, 160),
      clean(p.message, 2000),
      clean(p.page, 300),
      clean(p.sentAt, 40),
      photos.url,
      clean(p.utm && typeof p.utm === 'object' ? JSON.stringify(p.utm) : p.utm, 300),
      discount
    ]);
  } finally {
    lock.releaseLock();
  }

  var photoLines = '';
  if (photos.saved > 0) photoLines += 'Fotky: ' + photos.saved + ' – ' + photos.url + '\n';
  if (photos.skipped > 0) photoLines += 'Preskočené súbory: ' + photos.skipped + '\n';

  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: 'Domovid: nový dopyt od ' + name,
    body:
      'Meno: ' + name + '\n' +
      'Telefón: ' + clean(p.phone, 40) + '\n' +
      'E-mail: ' + (clean(p.email, 160) || '-') + '\n' +
      'Zľavový kód: ' + (discount || '-') + '\n\n' +
      'Správa:\n' + (clean(p.message, 2000) || '-') + '\n\n' +
      photoLines +
      'WhatsApp: https://wa.me/' + waNumber(p.phone) + '\n' +
      'Tabuľka: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl()
  });

  sendConfirmation(clean(p.email, 160), name, photos.saved, clean(p.phone, 40), discount);

  return json({ ok: true });
}

// JSON body (new frontend) or URL-encoded fields (legacy). Returns null on a malformed JSON body.
function parsePayload(e) {
  var post = e && e.postData;
  var contents = post && typeof post.contents === 'string' ? post.contents : '';
  var type = String((post && post.type) || '');
  if (post && (type.indexOf('text/plain') === 0 || contents.charAt(0) === '{')) {
    try {
      var data = JSON.parse(contents);
      return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
    } catch (err) {
      return null;
    }
  }
  return (e && e.parameter) || {};
}

// Saves valid photos into a new per-lead folder. Invalid files are skipped, never fatal.
function savePhotos(files, name) {
  var result = { saved: 0, skipped: 0, url: '' };
  if (!files || !Array.isArray(files) || files.length === 0) return result;

  if (files.length > MAX_FILES) {
    result.skipped += files.length - MAX_FILES;
    files = files.slice(0, MAX_FILES);
  }

  var blobs = [];
  for (var i = 0; i < files.length; i++) {
    var blob = toBlob(files[i], blobs.length + 1);
    if (blob) blobs.push(blob);
    else result.skipped++;
  }
  if (blobs.length === 0) return result;

  try {
    var stamp = Utilities.formatDate(new Date(), TIME_ZONE, 'yyyy-MM-dd HH:mm');
    var folderName = stamp + ' – ' + (sanitizeName(String(name).replace(/^'/, ''), 80) || 'bez mena');
    var folder = getUploadRoot().createFolder(folderName);
    for (var j = 0; j < blobs.length; j++) {
      folder.createFile(blobs[j]);
      result.saved++;
    }
    result.url = folder.getUrl();
  } catch (err) {
    // Keep the lead even when Drive fails; the e-mail reports what was lost.
    console.error('Uloženie fotiek zlyhalo: ' + err);
    result.skipped += blobs.length - result.saved;
  }
  return result;
}

// Validates one {name,type,data} entry and returns a Drive-ready blob, or null to skip it.
function toBlob(file, index) {
  if (!file || typeof file !== 'object') return null;
  var type = String(file.type || '').toLowerCase();
  if (ALLOWED_TYPES.indexOf(type) === -1) return null;
  var data = typeof file.data === 'string' ? file.data.replace(/\s/g, '') : '';
  if (!data || data.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 + 4) return null;
  var bytes;
  try {
    bytes = Utilities.base64Decode(data);
  } catch (err) {
    return null;
  }
  if (!bytes || bytes.length === 0 || bytes.length > MAX_FILE_BYTES) return null;
  var fileName = sanitizeName(file.name, 80) || 'foto-' + index + '.jpg';
  return Utilities.newBlob(bytes, type, fileName);
}

// Drops path separators and control characters so a name cannot escape or break Drive.
function sanitizeName(value, max) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f\/\\]/g, '')
    .replace(/^[.\s]+/, '')
    .trim()
    .slice(0, max)
    .trim();
}

// Root folder for all lead photos; its id is cached and re-resolved if the folder vanished.
function getUploadRoot() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(UPLOAD_FOLDER_PROP);
  if (id) {
    try {
      var cached = DriveApp.getFolderById(id);
      if (!cached.isTrashed()) return cached;
    } catch (err) {
      // Stale id: fall through and find or create the folder again.
    }
  }
  var found = DriveApp.getFoldersByName(UPLOAD_FOLDER_NAME);
  var folder = null;
  while (found.hasNext()) {
    var candidate = found.next();
    if (!candidate.isTrashed()) {
      folder = candidate;
      break;
    }
  }
  if (!folder) folder = DriveApp.createFolder(UPLOAD_FOLDER_NAME);
  props.setProperty(UPLOAD_FOLDER_PROP, folder.getId());
  return folder;
}

// Confirmation to the customer, only when they left a valid-looking e-mail.
function sendConfirmation(email, name, photoCount, phone, discount) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  var first = String(name).replace(/^'/, '').split(/\s+/)[0] || '';
  var next = photoCount > 0
    ? 'Prijali sme aj ' + photoCount + ' ' + fotiek(photoCount) + ' nehnuteľnosti, takže ich už ' +
      'nemusíš posielať. Prvú verziu videa dostaneš s vodoznakom na posúdenie.\n\n'
    : 'Ak chceš začať hneď, pošli 4–6 fotiek nehnuteľnosti odpoveďou na tento e-mail. ' +
      'Prvú verziu videa dostaneš s vodoznakom na posúdenie.\n\n';
  var discountLine = discount
    ? 'Tvoj zľavový kód ' + discount + ' sme zaznamenali, zľavu 10 % odpočítame na faktúre.\n\n'
    : '';
  MailApp.sendEmail({
    to: email,
    replyTo: NOTIFY_EMAIL,
    name: 'Domovid',
    subject: 'Domovid: tvoj dopyt sme prijali',
    body:
      'Ahoj' + (first ? ' ' + first : '') + ',\n\n' +
      'ďakujeme za záujem o Domovid. Tvoj dopyt sme prijali a ozveme sa ti do 24 hodín. ' +
      'Hotové video ti pošleme na WhatsApp' + (phone ? ' na číslo ' + phone : '') + '.\n\n' +
      next +
      discountLine +
      'Martin Pecník, Domovid\n' +
      'https://martinpecnik011.github.io/domovid-web/\n\n' +
      'Tento e-mail ti prišiel, lebo si vyplnil formulár na webe Domovid. ' +
      'Ak to nebol ty, stačí odpovedať a údaje vymažeme.'
  });
}

// Slovak plural: 1 fotku, 2–4 fotky, 5+ fotiek.
function fotiek(n) {
  if (n === 1) return 'fotku';
  if (n >= 2 && n <= 4) return 'fotky';
  return 'fotiek';
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

// Creates the sheet with HEADERS, or appends header cells missing from an older sheet.
function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    return sheet;
  }
  var lastCol = sheet.getLastColumn();
  if (lastCol < HEADERS.length) {
    sheet.getRange(1, lastCol + 1, 1, HEADERS.length - lastCol).setValues([HEADERS.slice(lastCol)]);
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

/** Run once from the editor to grant permissions (Sheets, Mail, Drive) and create the sheet header and photo folder. */
function setup() {
  getSheet();
  getUploadRoot();
}
