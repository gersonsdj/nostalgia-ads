// Tiny local server for the Nostalgia ad: serves this folder and accepts
// POST /save?name=<file> to write the encoded video into ./out/.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const OUT = join(ROOT, 'out');
// Port: `node server.mjs --port 5181` (launch.json has no env), else $PORT, else 5178.
const argPort = process.argv.indexOf("--port");
const PORT = Number((argPort > 0 && process.argv[argPort + 1]) || process.env.PORT || 5178);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.wav': 'audio/wav',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (req.method === 'POST' && url.pathname === '/save') {
      const name = basename(url.searchParams.get('name') || 'video.bin');
      const dir = (url.searchParams.get('dir') || '').replace(/[^a-zA-Z0-9_-]/g, '');
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const buf = Buffer.concat(chunks);
      const target = join(OUT, dir);
      await mkdir(target, { recursive: true });
      await writeFile(join(target, name), buf);
      console.log(`[save] ${dir}/${name} ${buf.length} bytes`);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, name, bytes: buf.length, path: join(target, name) }));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/log') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      console.log(`[page] ${Buffer.concat(chunks).toString('utf8')}`);
      res.writeHead(204); res.end();
      return;
    }
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(normalize(ROOT))) { res.writeHead(403); res.end(); return; }
    const data = await readFile(file);
    const type = TYPES[extname(file)] || 'application/octet-stream';
    // Byte ranges so <video> can seek in the exported MP4.
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range) {
      const start = range[1] === '' ? Math.max(0, data.length - Number(range[2])) : Number(range[1]);
      const end = range[1] !== '' && range[2] !== '' ? Math.min(Number(range[2]), data.length - 1) : data.length - 1;
      if (start >= data.length || start > end) {
        res.writeHead(416, { 'content-range': `bytes */${data.length}` }); res.end(); return;
      }
      res.writeHead(206, { 'content-type': type, 'cache-control': 'no-store', 'accept-ranges': 'bytes',
        'content-range': `bytes ${start}-${end}/${data.length}`, 'content-length': end - start + 1 });
      res.end(data.subarray(start, end + 1));
      return;
    }
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store', 'accept-ranges': 'bytes' });
    res.end(data);
  } catch (e) {
    res.writeHead(e.code === 'ENOENT' ? 404 : 500, { 'content-type': 'text/plain' });
    res.end(String(e.message || e));
  }
}).listen(PORT, () => console.log(`nostalgia-ad server on http://localhost:${PORT}`));
