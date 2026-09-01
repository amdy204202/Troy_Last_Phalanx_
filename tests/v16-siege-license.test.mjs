import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { validateSiegeLicenses } from '../tools/validate-v16.mjs';

const root = resolve(import.meta.dirname, '..');

test('M0 pins every reviewed repository and permits only original runtime audio', () => {
  const result = validateSiegeLicenses(root);
  assert.deepEqual(result, { repositories: 4, externalAudioAssets: 0, deniedPaths: 0 });
});

test('M0 reports repository, revision and expected/actual license hashes on mutation', () => {
  const notice = JSON.parse(readFileSync(resolve(root, 'third-party-source-notice-v16.json'), 'utf8'));
  notice.repositories[0].revision = '0'.repeat(40);
  notice.repositories[0].licenseSha256 = 'f'.repeat(64);
  assert.throws(() => validateSiegeLicenses(root, { notice }), /canvas-vampire-survivors.*revision.*expected=.*actual=/s);
  assert.throws(() => validateSiegeLicenses(root, { notice }), /licenseSha256.*expected=.*actual=/s);
});

test('M0 rejects an unlisted source path and external audio hash', () => {
  const allowlist = JSON.parse(readFileSync(resolve(root, 'audio-source-allowlist-v16.json'), 'utf8'));
  allowlist.assets.push({ id: 'foreign', path: 'reviewed/game/audio.wav', sourceClass: 'CC-BY', sha256: '0'.repeat(64) });
  assert.throws(() => validateSiegeLicenses(root, { audioAllowlist: allowlist }), /foreign.*path.*deny/s);
});
