import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const port = 4197;

function canListen(selectedPort) {
  return new Promise((resolveProbe, rejectProbe) => {
    const probe = createServer();
    probe.once('error', rejectProbe);
    probe.listen(selectedPort, '127.0.0.1', () => {
      probe.close(error => error ? rejectProbe(error) : resolveProbe());
    });
  });
}

test('start-game.bat serves the printed URL and releases its explicit port', { timeout: 15_000 }, async () => {
  await canListen(port);
  const child = spawn('cmd.exe', ['/d', '/c', 'call', 'start-game.bat'], {
    cwd: root,
    env: { ...process.env, NO_OPEN: '1', PORT: String(port), TROY_SMOKE_ONCE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const exitPromise = new Promise(resolveExit => child.once('exit', resolveExit));

  const url = await new Promise((resolveUrl, rejectUrl) => {
      const timer = setTimeout(() => rejectUrl(new Error(`launcher URL timeout: ${output}`)), 7_000);
      const inspect = () => {
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (!match) return;
        clearTimeout(timer);
        resolveUrl(match[0]);
      };
      child.stdout.on('data', inspect);
      child.stderr.on('data', inspect);
      child.once('exit', code => {
        clearTimeout(timer);
        rejectUrl(new Error(`launcher exited before URL: code=${code} output=${output}`));
      });
  });
  assert.equal(url, `http://127.0.0.1:${port}`);
  const response = await fetch(url);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /id="menuOverlay"/);
  assert.match(html, /트로이: 최후의 팔랑크스 V16/);
  const exitCode = await exitPromise;
  assert.equal(exitCode, 0, output);
  await canListen(port);
});

test('normal launcher mode delegates its exact selected URL once and leaves automatic evidence', { timeout: 15_000 }, async () => {
  const artifactPath = resolve(root, 'e2e/.runs/launcher-open-delegate-test.json');
  rmSync(artifactPath, { force: true });
  const child = spawn(process.execPath, [
    'tools/smoke-launcher-v16.mjs', '--batch', 'start-game.bat',
    '--open-delegate-log', 'e2e/.runs/launcher-open-delegate-test.json',
    '--expect-call-count', '1', '--expect-status', '200',
    '--expect-title', '트로이: 최후의 팔랑크스 V16', '--expect-cleanup',
  ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const exitCode = await new Promise(resolveExit => child.once('exit', resolveExit));
  assert.equal(exitCode, 0, output);
  assert.match(output, /LAUNCHER_V16_SMOKE PASS/);
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
  assert.equal(artifact.delegateCalls, 1);
  assert.deepEqual(artifact.delegateArgs, [[artifact.selectedUrl]]);
  assert.equal(artifact.printedUrl, artifact.selectedUrl);
  assert.equal(artifact.httpStatus, 200);
  assert.equal(artifact.documentTitle, '트로이: 최후의 팔랑크스 V16');
  assert.equal(artifact.portListenersAfter, 0);
  assert.equal(artifact.childCountAfter, 0);
});
