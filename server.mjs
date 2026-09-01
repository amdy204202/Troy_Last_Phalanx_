import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
const requestedPort = Number(process.env.PORT || 4173);
const allowPortFallback = !process.env.PORT;
let port = requestedPort;
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.wav': 'audio/wav'
};

const server = http.createServer((request, response) => {
  if (process.env.TROY_SMOKE_ONCE === '1') response.once('finish', () => server.close());
  let requestPath;try{const rawPath=decodeURIComponent(String(request.url||'').split(/[?#]/,1)[0]);if(rawPath.split(/[\\/]/).some(component=>component.startsWith('.'))){response.writeHead(404);response.end('Not found');return}requestPath=decodeURIComponent(new URL(request.url,`http://${request.headers.host}`).pathname)}catch{response.writeHead(400);response.end('Bad request');return}
  const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const filePath = path.resolve(root, relative);
  if (filePath!==root&&!filePath.startsWith(`${root}${path.sep}`)) { response.writeHead(403); response.end('Forbidden'); return; }
  fs.realpath(filePath,(realError,realPath)=>{
    if(realError||(realPath!==root&&!realPath.startsWith(`${root}${path.sep}`))){response.writeHead(404);response.end('Not found');return}
    fs.readFile(realPath, (error, data) => {
      if (error) { response.writeHead(404); response.end('Not found'); return; }
      response.writeHead(200, { 'Content-Type': mime[path.extname(realPath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      response.end(data);
    });
  });
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE' && allowPortFallback && port < requestedPort + 10) {
    port += 1;
    server.listen(port, '127.0.0.1');
    return;
  }
  console.error(`Unable to start Troy on 127.0.0.1:${port}: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`트로이: 최후의 팔랑크스 실행 중 - ${url}`);
  if (!process.env.NO_OPEN && process.env.TROY_OPEN_DELEGATE) {
    spawn(process.execPath, [process.env.TROY_OPEN_DELEGATE, url], { detached: true, env: process.env, stdio: 'ignore', windowsHide: true }).unref();
  } else if (process.platform === 'win32' && !process.env.NO_OPEN) {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  }
});
