// Runs apps-script/Code.gs inside a node:vm context with in-memory Apps Script mocks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const SOURCE = readFileSync(fileURLToPath(new URL('../Code.gs', import.meta.url)), 'utf8');
const OLD_HEADERS = ['Prijaté', 'Meno', 'Telefón', 'E-mail', 'Správa', 'Stránka', 'Odoslané (prehliadač)'];

function makeEnv({ sheetRows = null, props = {}, existingFolders = [] } = {}) {
  let nextId = 1;
  const folders = new Map();
  const log = { mails: [], locks: 0, events: [] };

  function makeFolder(name) {
    const id = 'folder-' + nextId++;
    const folder = {
      id, name, files: [], children: [], trashed: false,
      getId: () => id,
      getName: () => name,
      getUrl: () => 'https://drive.google.com/drive/folders/' + id,
      isTrashed: () => folder.trashed,
      createFolder(childName) {
        log.events.push('drive');
        const child = makeFolder(childName);
        folder.children.push(child);
        return child;
      },
      createFile(blob) {
        log.events.push('drive');
        folder.files.push(blob);
        return blob;
      }
    };
    folders.set(id, folder);
    return folder;
  }
  for (const name of existingFolders) makeFolder(name);
  const roots = [];

  let rows = sheetRows ? sheetRows.map((r) => r.slice()) : null;
  const sheet = {
    frozen: 0,
    getLastRow: () => rows.length,
    getLastColumn: () => rows.reduce((m, r) => Math.max(m, r.length), 0),
    appendRow(row) {
      log.events.push('append');
      rows.push(Array.from(row)); // copy into this realm so deepEqual compares plain arrays
    },
    setFrozenRows(n) { sheet.frozen = n; },
    getRange(row, col, numRows, numCols) {
      return {
        setValues(values) {
          assert.equal(values.length, numRows);
          for (let r = 0; r < numRows; r++) {
            const target = rows[row - 1 + r];
            for (let c = 0; c < numCols; c++) target[col - 1 + c] = values[r][c];
          }
        }
      };
    }
  };

  const store = { ...props };
  const ctx = {
    console,
    JSON,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: () => (rows ? sheet : null),
        insertSheet: () => { rows = []; return sheet; },
        getUrl: () => 'https://docs.google.com/spreadsheets/d/test'
      })
    },
    DriveApp: {
      getFolderById(id) {
        const f = folders.get(id);
        if (!f) throw new Error('No item with the given ID could be found.');
        return f;
      },
      getFoldersByName(name) {
        const list = [...folders.values()].filter((f) => f.name === name);
        let i = 0;
        return { hasNext: () => i < list.length, next: () => list[i++] };
      },
      createFolder(name) {
        log.events.push('drive');
        const f = makeFolder(name);
        roots.push(f);
        return f;
      }
    },
    MailApp: { sendEmail: (m) => log.mails.push(m) },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => { log.locks++; log.events.push('lock'); },
        releaseLock: () => log.events.push('unlock')
      })
    },
    Utilities: {
      base64Decode: (s) => {
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error('Could not decode string.');
        return [...Buffer.from(s, 'base64')];
      },
      newBlob: (bytes, type, name) => ({ bytes, type, name, getName: () => name }),
      formatDate: (date, tz, fmt) => {
        assert.equal(tz, 'Europe/Bratislava');
        assert.equal(fmt, 'yyyy-MM-dd HH:mm');
        return '2026-10-13 14:05';
      }
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in store ? store[k] : null),
        setProperty: (k, v) => { store[k] = v; }
      })
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({ text, setMimeType() { return this; } })
    }
  };
  vm.createContext(ctx);
  vm.runInContext(SOURCE, ctx);
  return { ctx, log, store, folders, roots, getRows: () => rows };
}

const jpeg = (kb = 1) => Buffer.alloc(kb * 1024, 0xff).toString('base64');
const reply = (out) => JSON.parse(out.text);
const jsonPost = (obj) => ({ parameter: {}, postData: { type: 'text/plain;charset=utf-8', contents: JSON.stringify(obj) } });
const base = { name: 'Jana Nováková', phone: '0900 123 456', email: 'jana@example.sk', message: 'Byt', page: '/', sentAt: '2026-10-13T12:00:00Z', utm: 'utm_source=ig' };

test('(a) legacy e.parameter submit appends a 9-column row with empty Fotky', () => {
  const env = makeEnv();
  const out = env.ctx.doPost({ parameter: { name: 'Peter', phone: '0911 222 333', email: '', message: 'Ahoj', page: '/', sentAt: 'x' } });
  assert.deepEqual(reply(out), { ok: true });
  const rows = env.getRows();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].length, 9);
  assert.deepEqual(rows[0].slice(7), ['Fotky', 'UTM']);
  assert.equal(rows[1].length, 9);
  assert.equal(rows[1][1], 'Peter');
  assert.equal(rows[1][7], '');
  assert.equal(rows[1][8], '');
  assert.equal(env.roots.length, 0, 'no Drive folder for a text-only lead');
  assert.equal(env.log.mails.length, 1, 'no confirmation without an e-mail');
  assert.doesNotMatch(env.log.mails[0].body, /Fotky:/);
});

test('(b) JSON submit with 2 valid JPEGs saves them in a per-lead folder', () => {
  const env = makeEnv();
  const out = env.ctx.doPost(jsonPost({ ...base, files: [
    { name: 'kuchyna.jpg', type: 'image/jpeg', data: jpeg(300) },
    { name: '../../obyvacka.jpg', type: 'image/jpeg', data: jpeg(2) }
  ] }));
  assert.deepEqual(reply(out), { ok: true });
  assert.equal(env.roots.length, 1);
  const root = env.roots[0];
  assert.equal(root.name, 'Domovid leady – fotky');
  assert.equal(env.store.UPLOAD_FOLDER_ID, root.id);
  assert.equal(root.children.length, 1);
  const lead = root.children[0];
  assert.equal(lead.name, '2026-10-13 14:05 – Jana Nováková');
  assert.deepEqual(lead.files.map((f) => f.name), ['kuchyna.jpg', 'obyvacka.jpg']);
  assert.equal(lead.files[0].bytes.length, 300 * 1024);
  const row = env.getRows()[1];
  assert.equal(row[7], lead.getUrl());
  assert.equal(row[8], 'utm_source=ig');
  const [notify, confirm] = env.log.mails;
  assert.match(notify.body, /Fotky: 2 – https:\/\/drive\.google\.com\/drive\/folders\//);
  assert.doesNotMatch(notify.body, /Preskočené/);
  assert.equal(confirm.to, 'jana@example.sk');
  assert.match(confirm.body, /Prijali sme aj 2 fotky/);
  assert.doesNotMatch(confirm.body, /wa\.me/);
  // Drive writes happen before the lock; the lock wraps only the append.
  assert.deepEqual(env.log.events, ['drive', 'drive', 'drive', 'drive', 'lock', 'append', 'append', 'unlock']);
});

test('(c) 12 files → at most 10 saved; wrong type and oversize are skipped and counted', () => {
  const env = makeEnv();
  const files = [];
  for (let i = 0; i < 12; i++) files.push({ name: '', type: 'image/jpeg', data: jpeg(1) });
  files[3] = { name: 'notes.txt', type: 'text/plain', data: jpeg(1) };
  files[5] = { name: 'big.jpg', type: 'image/jpeg', data: Buffer.alloc(8 * 1024 * 1024 + 1).toString('base64') };
  env.ctx.doPost(jsonPost({ ...base, files }));
  const lead = env.roots[0].children[0];
  assert.equal(lead.files.length, 8, '10 accepted slots minus 2 invalid');
  assert.equal(lead.files[0].name, 'foto-1.jpg');
  assert.equal(lead.files[7].name, 'foto-8.jpg');
  const body = env.log.mails[0].body;
  assert.match(body, /Fotky: 8 – /);
  assert.match(body, /Preskočené súbory: 4\n/, '2 over the limit + 2 invalid');
});

test('(c2) only-invalid files create no folder and leave Fotky empty', () => {
  const env = makeEnv();
  env.ctx.doPost(jsonPost({ ...base, email: '', files: [{ name: 'a.gif', type: 'image/gif', data: jpeg(1) }] }));
  assert.equal(env.roots.length, 0);
  assert.equal(env.getRows()[1][7], '');
  assert.match(env.log.mails[0].body, /Preskočené súbory: 1/);
  assert.doesNotMatch(env.log.mails[0].body, /Fotky:/);
});

test('(d) honeypot filled → nothing written, ok:true', () => {
  const env = makeEnv();
  const out = env.ctx.doPost(jsonPost({ ...base, company: 'Spam s.r.o.', files: [{ name: 'a.jpg', type: 'image/jpeg', data: jpeg(1) }] }));
  assert.deepEqual(reply(out), { ok: true });
  assert.equal(env.getRows(), null);
  assert.equal(env.roots.length, 0);
  assert.equal(env.log.mails.length, 0);
  assert.equal(env.log.locks, 0);
});

test('(e) formula-injection name is stored prefixed with an apostrophe', () => {
  const env = makeEnv();
  env.ctx.doPost(jsonPost({ ...base, name: '=HYPERLINK("http://evil","x")', utm: '+cmd' }));
  const row = env.getRows()[1];
  assert.equal(row[1], '\'=HYPERLINK("http://evil","x")');
  assert.equal(row[8], "'+cmd");
});

test('(f) existing 7-column header gets Fotky and UTM appended, old rows untouched', () => {
  const oldRow = ['2026-01-01', 'Starý', '0900', '', '', '/', 'x'];
  const env = makeEnv({ sheetRows: [OLD_HEADERS, oldRow] });
  env.ctx.setup();
  const rows = env.getRows();
  assert.deepEqual(rows[0], [...OLD_HEADERS, 'Fotky', 'UTM']);
  assert.deepEqual(rows[1], oldRow);
  assert.equal(env.roots.length, 1, 'setup also creates the Drive root folder');
  env.ctx.doPost({ parameter: { name: 'Nový', phone: '0900' } });
  assert.equal(env.getRows()[2].length, 9);
});

test('(g) stale UPLOAD_FOLDER_ID → a new root folder is created and cached', () => {
  const env = makeEnv({ props: { UPLOAD_FOLDER_ID: 'deleted-id' } });
  env.ctx.doPost(jsonPost({ ...base, files: [{ name: 'a.jpg', type: 'image/jpeg', data: jpeg(1) }] }));
  assert.equal(env.roots.length, 1);
  assert.equal(env.store.UPLOAD_FOLDER_ID, env.roots[0].id);
  assert.notEqual(env.store.UPLOAD_FOLDER_ID, 'deleted-id');
  // A second lead reuses the cached root.
  env.ctx.doPost(jsonPost({ ...base, files: [{ name: 'b.jpg', type: 'image/jpeg', data: jpeg(1) }] }));
  assert.equal(env.roots.length, 1);
  assert.equal(env.roots[0].children.length, 2);
});

test('(g2) existing root folder with that name is reused when nothing is cached', () => {
  const env = makeEnv({ existingFolders: ['Domovid leady – fotky'] });
  env.ctx.doPost(jsonPost({ ...base, files: [{ name: 'a.jpg', type: 'image/jpeg', data: jpeg(1) }] }));
  assert.equal(env.roots.length, 0, 'no new root created');
  assert.equal(env.store.UPLOAD_FOLDER_ID, 'folder-1');
  assert.equal(env.folders.get('folder-1').children.length, 1);
});

test('(h) malformed JSON body → ok:false, nothing written', () => {
  const env = makeEnv();
  const out = env.ctx.doPost({ parameter: {}, postData: { type: 'text/plain', contents: '{"name":"Jana",' } });
  assert.deepEqual(reply(out), { ok: false });
  assert.equal(env.getRows(), null);
  assert.equal(env.log.mails.length, 0);
  assert.equal(env.log.locks, 0);
});

test('file names are sanitised: control chars, separators, length', () => {
  const env = makeEnv();
  env.ctx.doPost(jsonPost({ ...base, files: [
    { name: 'a/b\\c\u0000\u001fd.jpg', type: 'image/jpeg', data: jpeg(1) },
    { name: 'x'.repeat(200) + '.jpg', type: 'IMAGE/PNG', data: jpeg(1) },
    { name: '///', type: 'image/webp', data: jpeg(1) },
    { name: 'bad.jpg', type: 'image/jpeg', data: '!!not base64!!' }
  ] }));
  const files = env.roots[0].children[0].files;
  assert.deepEqual(files.map((f) => f.name), ['abcd.jpg', 'x'.repeat(80), 'foto-3.jpg']);
  assert.equal(files[1].type, 'image/png');
  assert.match(env.log.mails[0].body, /Preskočené súbory: 1/);
});

test('doGet still answers the health check', () => {
  const env = makeEnv();
  assert.deepEqual(reply(env.ctx.doGet()), { ok: true, service: 'domovid-leads' });
});
