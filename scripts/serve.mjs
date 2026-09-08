import http from 'node:http';
import { readFile } from 'node:fs/promises';
const port = Number(process.env.PORT || 4177);
const file = new URL('../index.html', import.meta.url);
const server = http.createServer(async (req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204).end(); return; }
  if (req.url !== '/' && req.url !== '/index.html') { res.writeHead(404).end('Not found'); return; }
  try {
    const html = await readFile(file);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(html);
  } catch { res.writeHead(503).end('Run npm run build first.'); }
});
server.listen(port, 'localhost', () => console.log(`Local: http://localhost:${port}`));
