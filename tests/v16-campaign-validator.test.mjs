import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { validateBattlefieldManifest, validateCampaignProject, validatePureCampaignSources } from '../tools/validate-v16-campaign.mjs';

const root = resolve(import.meta.dirname, '..');

test('manifest matches every row of the eight-stage design table', () => {
  const manifest = JSON.parse(readFileSync(resolve(root, 'assets/battlefields/troy-battlefields-v16.json'), 'utf8'));
  assert.deepEqual(validateBattlefieldManifest(manifest), { packages: 3, stages: 8, objectiveShops: 8 });
  const mutation = structuredClone(manifest); mutation.stages[2].reward = 999;
  assert.throws(() => validateBattlefieldManifest(mutation), /stage 2 reward/);
});

test('campaign reducers contain no wall-clock, random, timer, DOM or audio APIs', () => {
  assert.deepEqual(validatePureCampaignSources(root), { forbiddenCalls: 0 });
  assert.throws(() => validatePureCampaignSources(root, { 'bad.js': 'export const x = Math.random();' }), /Math.random/);
});

test('campaign project validator confirms final V16 live route and frozen V15 route', () => {
  const result = validateCampaignProject(root,{route:'final',frozenRoot:resolve(root,'e2e/fixtures/v15-frozen')});
  assert.deepEqual(result, { packages: 3, stages: 8, forbiddenCalls: 0, liveRoute: 'rich', frozenRoute:'v15', campaignRoute: 'tech-registered' });
});
