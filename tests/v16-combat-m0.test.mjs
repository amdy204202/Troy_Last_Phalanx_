import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { buildV15Closure, compareAppShellToDiscovered } from '../tools/freeze-v15.mjs';
import { validateFrozenV15 } from '../tools/validate-v15-frozen.mjs';
import { validateSourceNotice } from '../tools/validate-v16-combat.mjs';

const root = resolve(import.meta.dirname, '..');

test('V15 closure contains exactly the 106 canonical application files', () => {
  const closure = buildV15Closure(resolve(root, 'e2e/fixtures/v15-frozen'));
  assert.equal(closure.appShellUrlCount, 106);
  assert.equal(closure.entries.length, 106);
  assert.equal(new Set(closure.entries.map(entry => entry.path)).size, 106);
  assert.deepEqual(closure.missingFromAppShell, []);
  assert.deepEqual(closure.extraInAppShell, []);
});

test('frozen validator requires an explicit root and rejects hash mutation', () => {
  assert.throws(() => validateFrozenV15({}), /--root/);
  const archiveRoot = resolve(root, 'e2e/fixtures/v15-frozen');
  const manifestPath = resolve(root, 'baselines/v15-frozen.json');
  const result = validateFrozenV15({ root: archiveRoot, manifestPath });
  assert.equal(result.entryCount, 106);
  const tempRoot = mkdtempSync(join(tmpdir(), 'troy-v15-mutation-'));
  const mutation = JSON.parse(readFileSync(manifestPath, 'utf8'));
  mutation.entries[0].sha256 = '0'.repeat(64);
  const mutationPath = join(tempRoot, 'manifest.json');
  writeFileSync(mutationPath, JSON.stringify(mutation));
  assert.throws(
    () => validateFrozenV15({ root: archiveRoot, manifestPath: mutationPath }),
    new RegExp(`hash mismatch.*${mutation.entries[0].path.replaceAll('.', '\\.')}`, 'i'),
  );
});

test('source notice pins all four reviewed repositories and denies unlicensed copy paths', () => {
  const result = validateSourceNotice(root);
  assert.equal(result.repositories, 4);
  assert.equal(result.unlicensedCopiedPaths, 0);
  assert.equal(result.unpinnedRevisions, 0);
});

test('closure comparison rejects a same-count APP_SHELL path substitution', () => {
  const frozenRoot = resolve(root, 'e2e/fixtures/v15-frozen');
  const serviceWorker = readFileSync(resolve(frozenRoot, 'service-worker.js'), 'utf8');
  const result = compareAppShellToDiscovered(frozenRoot, serviceWorker.replace("'./js/combat-rules-v15.js'", "'./js/not-the-combat-module.js'"));
  assert.deepEqual(result.missingFromAppShell, ['js/combat-rules-v15.js']);
  assert.deepEqual(result.extraInAppShell, ['js/not-the-combat-module.js']);
});

test('frozen closure never reads the live V16 worker', () => {
  const frozenRoot = resolve(root, 'e2e/fixtures/v15-frozen');
  const original = buildV15Closure(frozenRoot);
  const live = readFileSync(resolve(root,'service-worker.js'),'utf8');
  assert.doesNotMatch(live,/APP_SHELL/);
  assert.equal(buildV15Closure(frozenRoot).entries[0].sha256,original.entries[0].sha256);
});
