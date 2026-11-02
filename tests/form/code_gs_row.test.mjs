// Row building of apps-script/Code.gs: Code.gs runs in a vm context with stubbed Apps Script services.
// Run: node tests/form/code_gs_row.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const source = readFileSync(fileURLToPath(new URL('../../apps-script/Code.gs', import.meta.url)), 'utf8');
const sheetRows = [];
const mails = [];
const ctx = {
  console,
  JSON,
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ({
      getSheetByName: () => ({ getLastRow: () => 1, getLastColumn: () => 99, appendRow: (r) => sheetRows.push(r) }),
      getUrl: () => 'https://docs.google.com/spreadsheets/d/test',
    }),
  },
  MailApp: { sendEmail: (m) => mails.push(m) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text) => ({ text, setMimeType() { return this; } }) },
};
vm.createContext(ctx);
vm.runInContext(source, ctx);

const NEW_HEADERS = ['Typ', 'Lokalita', 'Cena', 'Plocha m²', 'Ako má video vyzerať', 'Referenčné video'];
const OLD_HEADERS = ['Prijaté', 'Meno', 'Telefón', 'E-mail', 'Správa', 'Stránka', 'Odoslané (prehliadač)', 'Fotky', 'UTM', 'Zľavový kód'];
const headers = vm.runInContext('HEADERS', ctx);
assert.deepEqual(Array.from(headers), [...OLD_HEADERS, ...NEW_HEADERS]);

const payload = {
  name: 'Jana Nováková', phone: '0900 123 456', email: 'jana@example.sk',
  propertyType: 'byt', location: 'Banská Bystrica', price: '139000', area: '62',
  look: 'rýchle strihy, energická hudba\n\nFormát videa: Na šírku (16:9)',
  referenceUrl: 'https://www.instagram.com/reel/abc/',
  page: 'https://x.sk/', sentAt: '2026-11-01T10:00:00Z', utm: 'source=ig', discount: 'T10',
};
const row = Array.from(ctx.buildLeadRow(payload, 'Jana Nováková', 'https://drive/f', 'T10'));
assert.ok(Object.prototype.toString.call(row[0]) === '[object Date]');
assert.deepEqual(row.slice(1), [
  'Jana Nováková', '0900 123 456', 'jana@example.sk', '', 'https://x.sk/', '2026-11-01T10:00:00Z',
  'https://drive/f', 'source=ig', 'T10',
  'byt', 'Banská Bystrica', '139000', '62', payload.look, 'https://www.instagram.com/reel/abc/',
]);
assert.equal(row.length, headers.length);

// doPost appends the same row and puts the new fields into the notification e-mail
const out = JSON.parse(ctx.doPost({ parameter: {}, postData: { type: 'text/plain', contents: JSON.stringify(payload) } }).text);
assert.deepEqual(out, { ok: true });
assert.equal(sheetRows.length, 1);
assert.equal(sheetRows[0].length, headers.length);
const owner = mails.find((m) => m.to === 'martinpecnik011@gmail.com');
for (const s of ['Typ nehnuteľnosti: byt', 'Lokalita: Banská Bystrica', 'Cena: 139000', 'Plocha m²: 62', 'Referenčné video: https://www.instagram.com/reel/abc/', 'rýchle strihy']) {
  assert.ok(owner.body.includes(s), 'e-mail missing: ' + s);
}

// all new fields optional: empty cells, no crash
const empty = Array.from(ctx.buildLeadRow({ name: 'A', phone: '1' }, 'A', '', ''));
assert.deepEqual(empty.slice(10), ['', '', '', '', '', '']);

console.log('row:', JSON.stringify(row.slice(1)));
console.log('headers:', JSON.stringify(Array.from(headers)));
console.log('new headers:', JSON.stringify(NEW_HEADERS));
console.log('OK');
