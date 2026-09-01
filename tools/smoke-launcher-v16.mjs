import { createServer } from 'node:net';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const values = new Map();
for (let index = 2; index < process.argv.length; index += 2) values.set(process.argv[index], process.argv[index + 1]);
const batch = resolve(root, values.get('--batch') || 'start-game.bat');
const output = resolve(root, values.get('--open-delegate-log') || 'e2e/.runs/launcher-open-delegate.json');
const expectedCalls = Number(values.get('--expect-call-count') || 1);
const expectedStatus = Number(values.get('--expect-status') || 200);
const expectedTitle = values.get('--expect-title') || '트로이: 최후의 팔랑크스 V16';
const requireCleanup = process.argv.includes('--expect-cleanup');
const rawCalls = `${output}.calls.ndjson`;
const delegate = resolve(root, 'tools/open-delegate-recorder-v16.mjs');

const waitFor = async (read, timeoutMs = 7000) => {
  const started = Date.now();
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error('launcher smoke timeout');
    await new Promise(resolveWait => setTimeout(resolveWait, 25));
  }
};
const probeFree = port => new Promise((fulfill, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(port, '127.0.0.1', () => probe.close(error => error ? reject(error) : fulfill()));
});
const pidAlive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };

async function main() {
  mkdirSync(dirname(output), { recursive: true });
  rmSync(rawCalls, { force: true });
  const child = spawn('cmd.exe', ['/d', '/c', 'call', batch], {
    cwd: root,
    env: { ...process.env, TROY_OPEN_DELEGATE: delegate, TROY_OPEN_DELEGATE_LOG: rawCalls, TROY_SMOKE_ONCE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let printed = '';
  child.stdout.on('data', chunk => { printed += chunk; });
  child.stderr.on('data', chunk => { printed += chunk; });
  const childExit = new Promise(resolveExit => child.once('exit', code => resolveExit(code)));
  const printedUrl = await waitFor(() => printed.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]);
  const calls = await waitFor(() => { try { return readFileSync(rawCalls, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); } catch { return null; } });
  const response = await fetch(`${printedUrl}/`);
  const html = await response.text();
  const documentTitle = html.match(/<title>([^<]+)<\/title>/i)?.[1] || '';
  const exitCode = await childExit;
  await probeFree(Number(new URL(printedUrl).port));
  await waitFor(() => calls.every(call => !pidAlive(call.pid)));
  const childCountAfter = Number(pidAlive(child.pid)) + calls.filter(call => pidAlive(call.pid)).length;
  const artifact = {
    selectedUrl: printedUrl,
    printedUrl,
    delegateCalls: calls.length,
    delegateArgs: calls.map(call => call.args),
    httpStatus: response.status,
    documentTitle,
    portListenersAfter: 0,
    childCountAfter,
  };
  writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  if (exitCode !== 0) throw new Error(`launcher exit expected=0 actual=${exitCode}`);
  if (artifact.delegateCalls !== expectedCalls) throw new Error(`delegateCalls expected=${expectedCalls} actual=${artifact.delegateCalls}`);
  if (JSON.stringify(artifact.delegateArgs) !== JSON.stringify([[printedUrl]])) throw new Error(`delegateArgs expected=[[${printedUrl}]] actual=${JSON.stringify(artifact.delegateArgs)}`);
  if (artifact.httpStatus !== expectedStatus) throw new Error(`httpStatus expected=${expectedStatus} actual=${artifact.httpStatus}`);
  if (artifact.documentTitle !== expectedTitle) throw new Error(`documentTitle expected=${expectedTitle} actual=${artifact.documentTitle}`);
  if (requireCleanup && (artifact.portListenersAfter !== 0 || artifact.childCountAfter !== 0)) throw new Error(`cleanup expected=0/0 actual=${artifact.portListenersAfter}/${artifact.childCountAfter}`);
  rmSync(rawCalls, { force: true });
  console.log(`LAUNCHER_V16_SMOKE PASS url=${printedUrl} delegateCalls=${artifact.delegateCalls} http=${artifact.httpStatus} listeners=${artifact.portListenersAfter} children=${artifact.childCountAfter}`);
}

main().catch(error => { console.error(`LAUNCHER_V16_SMOKE FAIL ${error.message}`); process.exitCode = 1; });
