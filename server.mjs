import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
// Serves the default build artifact (single-file HTML). Run `npm run build` first — `npm start` does it for you.
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'dist-single');
const port=Number(process.env.PORT)||4317;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
http.createServer(async(req,res)=>{
 try{
  const p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(p!==root&&!p.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  const s=await stat(p);const f=s.isDirectory()?path.join(p,'index.html'):p;
  const body=await readFile(f);res.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(body);
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${port}`));
