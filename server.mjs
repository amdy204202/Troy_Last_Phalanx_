import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
const requestedPort = Number(process.env.PORT || 5190);
const allowPortFallback = !process.env.PORT;
let port = requestedPort;
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.webm': 'audio/webm', '.ttf': 'font/ttf'
};

const server = http.createServer((request, response) => {
  if (process.env.TROY_SMOKE_ONCE === '1') response.once('finish', () => server.close());
  let requestPath;try{const rawPath=decodeURIComponent(String(request.url||'').split(/[?#]/,1)[0]);if(rawPath.split(/[\\/]/).some(component=>component.startsWith('.'))){response.writeHead(404);response.end('Not found');return}requestPath=decodeURIComponent(new URL(request.url,`http://${request.headers.host}`).pathname)}catch{response.writeHead(400);response.end('Bad request');return}
  const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const filePath = path.resolve(root, relative);
  if (filePath!==root&&!filePath.startsWith(`${root}${path.sep}`)) { response.writeHead(403); response.end('Forbidden'); return; }
  fs.realpath(filePath,(realError,realPath)=>{
    if(realError||(realPath!==root&&!realPath.startsWith(`${root}${path.sep}`))){response.writeHead(404);response.end('Not found');return}
    fs.stat(realPath, (error, stat) => {
      if (error || !stat.isFile()) { response.writeHead(404); response.end('Not found'); return; }
      const headers = { 'Content-Type': mime[path.extname(realPath)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes' };
      let start = 0, end = stat.size - 1, status = 200;
      if (request.headers.range) {
        const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
        if (range && (range[1] || range[2])) {
          start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
          end = range[1] && range[2] ? Math.min(end, Number(range[2])) : end;
        } else start = -1;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= stat.size) {
          response.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); response.end(); return;
        }
        status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
      }
      headers['Content-Length'] = Math.max(0, end - start + 1);
      response.writeHead(status, headers);
      if (request.method === 'HEAD' || !stat.size) { response.end(); return; }
      const stream = fs.createReadStream(realPath, { start, end });
      stream.on('error', () => response.destroy()); response.on('close', () => stream.destroy()); stream.pipe(response);
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
