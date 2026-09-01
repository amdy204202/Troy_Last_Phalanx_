import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildHandoffManifest,
  verifyHandoffManifest,
} from '../tools/create-rich-handoff-v16.mjs';
import {
  buildTechLabBaseline,
  verifyTechLabBaseline,
} from '../tools/freeze-v16-tech-lab.mjs';
import {
  buildCoverageContract,
  verifyCoverageContract,
} from '../tools/coverage-rich-integration-v16.mjs';

const root = resolve(import.meta.dirname, '..');

test('M0 handoff keeps prior human-listening and reference-performance debt as FAIL', () => {
  const manifest = buildHandoffManifest(root);
  assert.deepEqual(manifest.absorbs, [
    'SPEC-TROY-BATTLEFIELD-017',
    'SPEC-TROY-CAMPAIGN-018',
    'SPEC-TROY-SIEGE-019',
  ]);
  assert.equal(manifest.openDebts.length, 2);
  assert.ok(manifest.openDebts.every((item) => item.priorStatus === 'FAIL'));
  assert.deepEqual(verifyHandoffManifest(root, manifest, { phase: 'm0' }), {
    dependencies: manifest.dependencyArtifacts.length,
    sharedFiles: manifest.sharedFiles.length,
    openDebts: 2,
  });
});

test('handoff rejects a duplicate lease and an invented prior PASS', () => {
  const manifest = buildHandoffManifest(root);
  const duplicate = structuredClone(manifest);
  duplicate.sharedFiles.push(structuredClone(duplicate.sharedFiles[0]));
  assert.throws(
    () => verifyHandoffManifest(root, duplicate, { phase: 'm0' }),
    /HANDOFF_MANIFEST_MISMATCH.*sharedFiles/s,
  );
  const changedDebt = structuredClone(manifest);
  changedDebt.openDebts[0].priorStatus = 'PASS';
  assert.throws(
    () => verifyHandoffManifest(root, changedDebt, { phase: 'm0' }),
    /HANDOFF_MANIFEST_MISMATCH.*priorStatus/s,
  );
});

test('canonical entry baseline pins the exact bytes and digest', () => {
  const baseline = buildTechLabBaseline(root, 'index.html');
  assert.deepEqual(baseline, {
    schemaVersion: 1,
    ownerSpec: 'SPEC-TROY-RICH-INTEGRATION-020',
    entryPath: 'index.html',
    byteLength: 13302,
    sha256: '070471e8279043d988ad208b5c480621ffb0ca33cd80123d709c3ab65914550e',
  });
  assert.deepEqual(verifyTechLabBaseline(root, baseline), { bytes: 13302, entry: 'index.html' });
  assert.throws(
    () => verifyTechLabBaseline(root, { ...baseline, byteLength: 1 }),
    /TECH_LAB_BASELINE_MISMATCH.*byteLength/s,
  );
});

test('coverage contract separates the strict V16 set from the measured legacy journey', () => {
  const contract = buildCoverageContract();
  assert.equal(contract.schemaVersion, 2);
  assert.equal(contract.strictInclude.length, 11);
  assert.deepEqual(contract.legacyJourneyInclude, ['js/game.js']);
  assert.deepEqual(contract.exclusions, []);
  assert.deepEqual(contract.thresholds, { strict: { branches: 90, functions: 90, lines: 90, statements: 90 } });
  assert.deepEqual(contract.legacyBaseline, { observedLines: 1338, totalLines: 2119, lineRate: 63.142992, evidence: 'progress.md §E.2 AC-015' });
  assert.equal(contract.legacyOutcomeIds.length, 8);
  assert.deepEqual(contract.sources, ['chromium-v8', 'node-v8']);
  assert.deepEqual(verifyCoverageContract(contract), { strictFiles: 11, legacyFiles: 1, exclusions: 0 });
  assert.throws(
    () => verifyCoverageContract({ ...contract, exclusions: ['js/game.js'] }),
    /RICH_COVERAGE_CONTRACT_MISMATCH.*exclusions/s,
  );
});

test('frozen fixture remains the measured 106-file dependency input', () => {
  const frozen = JSON.parse(readFileSync(resolve(root, 'baselines/v15-frozen.json'), 'utf8'));
  assert.equal(frozen.entries.length, 106);
});
