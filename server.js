// Run: ADMIN_KEY=yoursecret node server.js   (Node 18+, no dependencies)
const http = require('http'), fs = require('fs'), crypto = require('crypto');
const PORT = process.env.PORT || 3000, FILE = process.env.DATA_FILE || 'game.json';
const state = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : undefined;
const E = require('./engine.js').create({
  adminKey: process.env.ADMIN_KEY || 'changeme', state,
  bytes: n => crypto.randomBytes(n), save: G => fs.writeFileSync(FILE, JSON.stringify(G)),
});
const html = fs.readFileSync(__dirname + '/index.html');

http.createServer((q, r) => {
  const u = q.url.split('?')[0];
  if (q.method === 'GET' && u === '/') { r.setHeader('content-type', 'text/html'); return r.end(html); }
  const m = u.match(/^\/photo\/(\w+)$/);
  if (q.method === 'GET' && m) {
    const d = E.photo(m[1]);
    if (!d) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'public,max-age=31536000' });
    return r.end(Buffer.from(d.split(',')[1], 'base64'));
  }
  let body = '';
  q.on('data', c => { body += c; if (body.length > 2e5) q.destroy(); });
  q.on('end', () => {
    let b = {}; try { b = JSON.parse(body || '{}'); } catch {}
    const out = E.handle(u.replace('/api/', ''), b);
    r.writeHead(out.error ? 400 : 200, { 'content-type': 'application/json' });
    r.end(JSON.stringify(out));
  });
}).listen(PORT, () => console.log('Tank Turn Tactics on port ' + PORT));
