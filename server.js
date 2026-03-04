const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { execFile } = require('child_process');

const ROOT = __dirname;
const PORT = 8000;

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

/* Git helper — stages, commits, and pushes gitusers.json */
function gitPush(message) {
  return new Promise((resolve) => {
    execFile('git', ['add', 'gitusers.json'], { cwd: ROOT }, (err) => {
      if (err) { console.warn('git add failed:', err.message); return resolve(false); }
      execFile('git', ['commit', '-m', message], { cwd: ROOT }, (err2) => {
        if (err2) { console.warn('git commit failed:', err2.message); return resolve(false); }
        execFile('git', ['push'], { cwd: ROOT }, (err3) => {
          if (err3) { console.warn('git push failed:', err3.message); return resolve(false); }
          console.log('Pushed gitusers.json to GitHub');
          resolve(true);
        });
      });
    });
  });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // POST /save-users  — write gitusers.json + push to GitHub
  if (req.method === 'POST' && pathname === '/save-users') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const arr = JSON.parse(body);
        if (!Array.isArray(arr)) throw new Error('Expected array');
        fs.writeFileSync(path.join(ROOT, 'gitusers.json'), JSON.stringify(arr, null, 2));

        // Push change to GitHub in background
        const pushed = await gitPush('Update gitusers.json via dashboard');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, pushed }));
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // Static file serving
  let filePath = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log('GitTrace server running at http://localhost:' + PORT));
