const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const url    = require('url');
const { execFile } = require('child_process');

const ROOT = __dirname;
const PORT = 8000;

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon'
};

/* ── In-memory file cache (avoid repeated disk reads) ── */
const fileCache = new Map();

function serveFile(filePath, res) {
  const ext = path.extname(filePath);
  const ct  = MIME[ext] || 'application/octet-stream';

  // JSON user list: never cache in-memory (it changes)
  const isJson = ext === '.json';

  if (!isJson && fileCache.has(filePath)) {
    const buf = fileCache.get(filePath);
    res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': 'max-age=86400' });
    res.end(buf);
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    if (!isJson) fileCache.set(filePath, data);
    const cacheHeader = isJson ? 'no-store' : 'max-age=86400';
    res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': cacheHeader });
    res.end(data);
  });
}

/* ── Git helper (fire-and-forget — does NOT block the HTTP response) ── */
function gitPushBackground(message) {
  execFile('git', ['add', 'gitusers.json'], { cwd: ROOT }, (err) => {
    if (err) { console.warn('git add failed:', err.message); return; }
    execFile('git', ['commit', '-m', message], { cwd: ROOT }, (err2) => {
      if (err2) { console.warn('git commit failed:', err2.message); return; }
      execFile('git', ['push'], { cwd: ROOT }, (err3) => {
        if (err3) console.warn('git push failed:', err3.message);
        else console.log('[git] pushed gitusers.json');
      });
    });
  });
}

/* ── HTTP Server ── */
const server = http.createServer((req, res) => {
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // POST /save-users — write file then respond immediately; git push in background
  if (req.method === 'POST' && pathname === '/save-users') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const arr = JSON.parse(body);
        if (!Array.isArray(arr)) throw new Error('Expected array');
        fs.writeFileSync(path.join(ROOT, 'gitusers.json'), JSON.stringify(arr, null, 2));

        // Respond immediately — don't await git
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));

        // Push to GitHub asynchronously in background
        gitPushBackground('Update gitusers.json via dashboard');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // Static file serving
  const filePath = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
  serveFile(filePath, res);
});

server.listen(PORT, () => console.log(`GitTrace running → http://localhost:${PORT}`));
