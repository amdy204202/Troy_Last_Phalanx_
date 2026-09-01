import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function filesUnder(root, current = root) {
  return readdirSync(current, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(current, entry.name);
    return entry.isDirectory() ? filesUnder(root, path) : [relative(root, path).replaceAll('\\', '/')];
  });
}

export function validateFrozenV15({ root, manifestPath } = {}) {
  if (!root) throw new Error('--root <frozen archive> 인수가 필요합니다.');
  if (!manifestPath) throw new Error('manifestPath가 필요합니다.');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const expected = manifest.entries.map(entry => entry.path).sort();
  const actual = filesUnder(root).sort();
  const missing = expected.filter(path => !actual.includes(path));
  const extra = actual.filter(path => !expected.includes(path));
  if (missing.length || extra.length) throw new Error(`archive file mismatch: missing=[${missing}] extra=[${extra}]`);
  if (manifest.entryCount !== 106 || manifest.hashCount !== 106 || manifest.appShellUrlCount !== 106 || expected.length !== 106) {
    throw new Error(`count mismatch: appShell=${manifest.appShellUrlCount} entry=${manifest.entryCount} hash=${manifest.hashCount} entries=${expected.length}`);
  }
  for (const entry of manifest.entries) {
    const file = resolve(root, entry.path);
    if (!existsSync(file)) throw new Error(`missing: ${entry.path}`);
    const actualHash = sha256(readFileSync(file));
    if (actualHash !== entry.sha256) throw new Error(`hash mismatch: ${entry.path} expected=${entry.sha256} actual=${actualHash}`);
  }
  return { entryCount: expected.length, missing: 0, extra: 0, hashMismatch: 0 };
}

function cliArgs(argv) {
  const index = argv.indexOf('--root');
  if (index < 0 || !argv[index + 1]) throw new Error('--root <frozen archive> 인수가 필요합니다.');
  const projectRoot = resolve(import.meta.dirname, '..');
  return { root: resolve(projectRoot, argv[index + 1]), manifestPath: resolve(projectRoot, 'baselines/v15-frozen.json') };
}

function argument(argv, name, fallback = null) {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

export function serveStatic(root, port) {
  const mime = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.png':'image/png','.webp':'image/webp','.wav':'audio/wav' };
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
    const file = resolve(root, pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''));
    if (!file.startsWith(resolve(root)) || !existsSync(file)) { response.writeHead(404); response.end('Not found'); return; }
    const data = readFileSync(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    response.end(request.method === 'HEAD' ? undefined : data);
  });
  server.listen(port, '127.0.0.1', () => console.log(`Troy static root ${root} on http://127.0.0.1:${port}`));
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const argv = process.argv.slice(2), args = cliArgs(argv);
    if (argv.includes('--serve')) {
      if (resolve(args.root).endsWith(resolve('e2e/fixtures/v15-frozen'))) validateFrozenV15(args);
      serveStatic(args.root, Number(argument(argv, '--port', '4175')));
    } else {
      const result = validateFrozenV15(args);
      console.log(`V15 frozen validator: PASS (${result.entryCount} files, missing=0, extra=0, hashMismatch=0)`);
    }
  } catch (error) {
    console.error(`V15 frozen validator: FAIL\n${error.message}`);
    process.exitCode = 1;
  }
}
