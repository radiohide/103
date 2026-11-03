import http from 'node:http';
import { readFile } from 'node:fs/promises';
const port = Number(process.env.PORT || 4319);
http.createServer(async (req, res) => {
  try {
    if (!['/', '/index.html'].includes(new URL(req.url, 'http://localhost').pathname)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(await readFile(new URL('./dist/index.html', import.meta.url)));
  } catch { res.writeHead(503); res.end('Building room'); }
}).listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}`));
