// Tiny CORS static server for the fake R2 bucket (tests/delivery/fake-r2). Port 8788, HEAD + Range supported.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fake-r2');
const PORT = Number(process.env.PORT || 8788);
const TYPES = { '.json': 'application/json', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

http
  .createServer((req, res) => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Range', 'Access-Control-Expose-Headers': 'Content-Length, Content-Range' };
    const end = (code, body = '') => (res.writeHead(code, { ...cors, 'Content-Type': 'text/plain' }), res.end(body));
    if (req.method === 'OPTIONS') return end(204);
    if (req.method !== 'GET' && req.method !== 'HEAD') return end(405);
    let rel;
    try {
      rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      return end(400);
    }
    const parts = rel.split('/').filter(Boolean);
    if (!parts.length || parts.some((p) => p.startsWith('.') || p === '..')) return end(404);
    const file = path.join(ROOT, ...parts);
    if (!file.startsWith(ROOT + path.sep)) return end(404);
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return end(404);
      const base = { ...cors, 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      let start = 0, stop = st.size - 1, code = 200;
      if (m && (m[1] || m[2])) {
        start = m[1] ? Number(m[1]) : st.size - Number(m[2]);
        stop = m[1] && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
        if (start > stop || start >= st.size) return (res.writeHead(416, { ...cors, 'Content-Range': `bytes */${st.size}` }), res.end());
        code = 206;
        base['Content-Range'] = `bytes ${start}-${stop}/${st.size}`;
      }
      base['Content-Length'] = stop - start + 1;
      res.writeHead(code, base);
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file, { start, end: stop }).pipe(res);
    });
  })
  .listen(PORT, () => console.log(`fake-r2 on http://localhost:${PORT}`));
