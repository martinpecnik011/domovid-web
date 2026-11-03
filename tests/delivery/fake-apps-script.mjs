// Fake Apps Script for the delivery e2e: the status/approve contract over the DOMOVID_SHEET_FAKE json (same file balik.py writes).
// Env: DOMOVID_SHEET_FAKE (required), R2_BASE (e.g. http://localhost:8860), PORT (default 8861). Endpoint: /exec.
import http from 'node:http';
import fs from 'node:fs';

const SHEET = process.env.DOMOVID_SHEET_FAKE;
const R2_BASE = (process.env.R2_BASE || 'http://localhost:8860').replace(/\/$/, '');
const PORT = Number(process.env.PORT || 8861);
const [V_PKG, V_ID, V_TOKEN, V_FILES, V_UNLOCKED, V_APPROVED] = [2, 3, 14, 15, 16, 17];
const [P_ID, P_END, P_COUNT, P_PAID] = [0, 3, 5, 9];

const ID_RE = /^[a-z0-9]{8,32}$/;
const load = () => JSON.parse(fs.readFileSync(SHEET, 'utf8'));
const cell = (row, i) => (row && row[i] != null ? String(row[i]).trim() : '');

function parseDate(s) {
  const m = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/.exec(s);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? new Date(s.slice(0, 10) + 'T00:00:00') : null;
}

/** Mirrors balik.evaluate state == "ok": paid package, not expired, room left for this video. */
function hasPackage(data, row) {
  const pkg = cell(row, V_PKG);
  const p = (data['Balíky'] || []).slice(1).find((r) => cell(r, P_ID) === pkg);
  if (!pkg || !p || !cell(p, P_PAID)) return false;
  const end = parseDate(cell(p, P_END));
  const today = new Date(new Date().toDateString());
  if (end && today > end) return false;
  const used = data['Videá'].slice(1).filter((r) => cell(r, V_PKG) === pkg && cell(r, V_ID) !== cell(row, V_ID)).length;
  return used < (Number(String(cell(p, P_COUNT)).replace(',', '.')) || 0);
}

function status(id) {
  if (!ID_RE.test(id)) return { ok: false };
  const data = load();
  const row = data['Videá'].slice(1).find((r) => cell(r, V_ID) === id);
  if (!row) return { ok: false, error: 'not_found' };
  const approved = !!cell(row, V_APPROVED);
  const unlocked = approved && cell(row, V_UNLOCKED) === 'áno';
  const out = { ok: true, approved, unlocked, has_package: hasPackage(data, row), downloads: [] };
  if (unlocked) {
    out.downloads = JSON.parse(cell(row, V_FILES) || '[]').map((d) => ({ label: d.label, url: `${R2_BASE}/${id}/m-${cell(row, V_TOKEN)}/${d.file}`, bytes: d.bytes }));
  }
  return out;
}

function review(ev) {
  if (!ID_RE.test(String(ev.id))) return { ok: false, error: 'not_found' };
  const data = load();
  const idx = data['Videá'].findIndex((r, i) => i && cell(r, V_ID) === ev.id);
  if (idx < 1) return { ok: false, error: 'not_found' };
  const row = data['Videá'][idx];
  if (ev.action === 'changes' && cell(row, V_APPROVED)) return { ok: false, error: 'approved' };
  if (ev.action === 'approve' && !cell(row, V_APPROVED)) {
    while (row.length <= V_APPROVED) row.push('');
    row[V_APPROVED] = new Date().toISOString();
    fs.writeFileSync(SHEET, JSON.stringify(data, null, 2));
  }
  return status(ev.id);
}

http
  .createServer((req, res) => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
    const json = (code, body) => (res.writeHead(code, { ...cors, 'Content-Type': 'application/json' }), res.end(JSON.stringify(body)));
    const url = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS') return (res.writeHead(204, cors), res.end());
    if (url.pathname !== '/exec') return json(404, { ok: false });
    if (req.method === 'GET') return json(200, url.searchParams.get('type') === 'status' ? status(url.searchParams.get('id') || '') : { ok: false, error: 'type' });
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const ev = JSON.parse(body);
        json(200, ev.type === 'review' ? review(ev) : { ok: true });
      } catch {
        json(400, { ok: false, error: 'bad_request' });
      }
    });
  })
  .listen(PORT, () => console.log(`fake-apps-script on http://localhost:${PORT}/exec`));
