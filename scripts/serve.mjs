import http from 'node:http';
import { readFile } from 'node:fs/promises';
const port = Number(process.env.PORT || 4177);
const routes = new Map([
  ['/', ['../index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['../index.html', 'text/html; charset=utf-8']],
  ['/sw.js', ['../dist/sw.js', 'text/javascript; charset=utf-8']],
  ['/app.webmanifest', ['../dist/app.webmanifest', 'application/manifest+json']],
  ['/icon.svg', ['../dist/icon.svg', 'image/svg+xml']]
]);
const qa = process.argv.includes('--qa');
if (qa) {
  routes.set('/qa/restored.html', ['../.tmp/qa/restored.html', 'text/html; charset=utf-8']);
  routes.set('/qa/legacy.html', ['../.tmp/qa/legacy.html', 'text/html; charset=utf-8']);
}
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
  if (qa && pathname === '/qa/no-js') {res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end('<!doctype html><html lang="ko"><meta charset="utf-8"><title>JavaScript 제한 환경 검증</title><h1>스크립트 실행을 허용하지 않는 미리보기</h1><iframe title="제한된 HTML 미리보기" sandbox src="/index.html" style="width:100%;height:85vh;border:0"></iframe></html>');return;}
  const route = routes.get(pathname);
  if (!route) { res.writeHead(404).end('Not found'); return; }
  try {
    const file = await readFile(new URL(route[0], import.meta.url));
    res.writeHead(200, { 'Content-Type': route[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).end(file);
  } catch { res.writeHead(503).end('Run npm run build first.'); }
});
server.listen(port, 'localhost', () => console.log(`Local: http://localhost:${port}`));
