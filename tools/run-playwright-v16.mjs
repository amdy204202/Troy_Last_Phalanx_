import { createReadStream, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const rootReal = realpathSync(root);
const port = 4173;
const mime = Object.freeze({ '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.png':'image/png','.webp':'image/webp','.wav':'audio/wav' });

function insideRoot(path) { return path === rootReal || path.startsWith(`${rootReal}${sep}`); }
function runtimePath(request) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname); }
  catch { return { status: 400 }; }
  const parts = pathname.split('/').filter(Boolean);
  if (parts.some(part => part.startsWith('.'))) return { status: 404 };
  const candidate = resolve(rootReal, parts.length ? parts.join('/') : 'index.html');
  if (!insideRoot(candidate)) return { status: 403 };
  try {
    const real = realpathSync(candidate);
    if (!insideRoot(real) || !statSync(real).isFile()) return { status: 404 };
    return { status: 200, path: real };
  } catch { return { status: 404 }; }
}

function createStaticServer() {
  return createServer((request, response) => {
    if (!['GET','HEAD'].includes(request.method ?? '')) { response.writeHead(405, { Allow:'GET, HEAD' }); response.end(); return; }
    const target = runtimePath(request);
    if (target.status !== 200) { response.writeHead(target.status); response.end(); return; }
    response.writeHead(200, { 'Content-Type':mime[extname(target.path)] ?? 'application/octet-stream', 'Cache-Control':'no-cache' });
    if (request.method === 'HEAD') { response.end(); return; }
    createReadStream(target.path).on('error', () => response.destroy()).pipe(response);
  });
}

function listen(server, selectedPort) {
  return new Promise((fulfill, reject) => {
    const onError = error => { server.off('listening', onListening); reject(error); };
    const onListening = () => { server.off('error', onError); fulfill(); };
    server.once('error', onError); server.once('listening', onListening); server.listen(selectedPort, '127.0.0.1');
  });
}

function close(server) {
  if (!server.listening) return Promise.resolve();
  server.closeAllConnections();
  return new Promise((fulfill, reject) => server.close(error => error ? reject(error) : fulfill()));
}

async function probeFree() {
  const probe = createServer();
  await listen(probe, port);
  await close(probe);
}

async function main(args) {
  const server = createStaticServer();
  let child = null, childClosed = false, childExit = 1, cleanupPromise = null, serverStarted = false, forcedExit = null;
  const cleanup = () => cleanupPromise ??= (async () => {
    if (child && !childClosed) child.kill('SIGTERM');
    if (child && !childClosed) await new Promise(fulfill => child.once('close', fulfill));
    await close(server);
    if (serverStarted) await probeFree();
    const childCount = child && !childClosed ? 1 : 0;
    console.log(`PLAYWRIGHT_V16_CLEANUP port4173=free childCount=${childCount} childExit=${childExit}`);
    if (childCount) throw new Error('PLAYWRIGHT_RUNNER_CLEANUP_MISMATCH: childCount expected=0 actual=1');
  })();
  const force = (reason, code) => { forcedExit = code; console.error(reason); if (child && !childClosed) child.kill('SIGTERM'); };
  const onSigint = () => force('PLAYWRIGHT_V16_SIGNAL: SIGINT', 130);
  const onSigterm = () => force('PLAYWRIGHT_V16_SIGNAL: SIGTERM', 143);
  const onUncaught = error => force(error?.stack ?? String(error), 1);
  const onUnhandled = error => force(error?.stack ?? String(error), 1);
  process.once('SIGINT', onSigint); process.once('SIGTERM', onSigterm);
  process.once('uncaughtException', onUncaught); process.once('unhandledRejection', onUnhandled);
  try {
    try { await listen(server, port); serverStarted = true; }
    catch (error) { if (error.code === 'EADDRINUSE') throw new Error(`PLAYWRIGHT_V16_PORT_IN_USE: ${port}`); throw error; }
    const cli = resolve(root, 'node_modules/@playwright/test/cli.js');
    child = spawn(process.execPath, [cli, ...args], { cwd:root, env:{ ...process.env, NO_OPEN:'1' }, stdio:'inherit', shell:false, windowsHide:true });
    childExit = await new Promise((fulfill, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => { childClosed = true; fulfill(code ?? (signal === 'SIGINT' ? 130 : 1)); });
    });
    return forcedExit ?? childExit;
  } finally {
    process.off('SIGINT', onSigint); process.off('SIGTERM', onSigterm);
    process.off('uncaughtException', onUncaught); process.off('unhandledRejection', onUnhandled);
    await cleanup();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(async error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
