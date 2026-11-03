import http from 'node:http';
import { readFile } from 'node:fs/promises';
http.createServer(async(req,res)=>{try{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(await readFile(new URL('./index.html',import.meta.url)));}catch{res.writeHead(503);res.end('Preparing proposal');}}).listen(4321,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4321/'));
