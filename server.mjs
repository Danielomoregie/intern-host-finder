import http from 'node:http';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { load, present, saveNotes, defaultDataPath } from './store.mjs';
const publicDir = new URL('./public/', import.meta.url);
export function createServer({ dataPath = defaultDataPath } = {}) {
  return http.createServer(async (req, res) => {
    const reply = (code, value) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      // Loopback-only, same-origin writes. No public service, cookies or external dependencies.
      const host = req.headers.host || '';
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return reply(403, { error: 'Local access only.' });
      const url = new URL(req.url, `http://${host}`);
      if (req.method === 'GET' && url.pathname === '/api/data') return reply(200, present(await load(dataPath)));
      if (req.method === 'PATCH' && url.pathname.startsWith('/api/leads/')) {
        if (req.headers.origin && req.headers.origin !== `http://${host}`) return reply(403, { error: 'Use the local tracker to save notes.' });
        if (!(req.headers['content-type'] || '').startsWith('application/json')) return reply(415, { error: 'JSON required.' });
        let body = '';
        for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 100000) return reply(413, { error: 'Notes are too long.' }); }
        let edits; try { edits = JSON.parse(body); } catch { return reply(400, { error: 'Invalid note data.' }); }
        const saved = await saveNotes(dataPath, decodeURIComponent(url.pathname.slice('/api/leads/'.length)), edits);
        return reply(200, saved);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return reply(405, { error: 'Method not supported.' });
      const routes = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
      const asset = routes[url.pathname];
      if (!asset) return reply(404, { error: 'Page not found.' });
      const contents = await fs.readFile(new URL(asset[0], publicDir));
      res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8`, 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : contents);
    } catch (e) { console.error(e.message); reply(e.status ?? 500, { error: e.status ? e.message : 'Could not update the local tracker. Please try again.' }); }
  });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT || 4317);
  createServer().listen(port, '127.0.0.1', () => console.log(`Intern Host Finder is running at http://127.0.0.1:${port}`));
}
