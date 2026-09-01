import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import {
  validateAttackIntentSource,
  validatePureReducerSources,
  validateV16CombatProject,
} from '../tools/validate-v16-combat.mjs';

const root = resolve(import.meta.dirname, '..');

test('attack callsite validator reports the file, line, and missing intent field', () => {
  const valid = `\nconst attack=createAttackIntent({\n sourceKind:'melee', defenseTag:'parryable', origin:{x:1,y:2}, impactAt:4, threat:'high', telegraphId:'t', impactId:'i'\n});`;
  assert.deepEqual(validateAttackIntentSource(valid, 'fixture-valid.js'), []);
  const mutated = valid.replace(" defenseTag:'parryable',", '');
  assert.deepEqual(validateAttackIntentSource(mutated, 'fixture-mutated.js'), ['fixture-mutated.js:2 missing defenseTag']);
});

test('pure reducer validator rejects platform time, random, DOM, audio, and timer APIs', () => {
  assert.equal(validatePureReducerSources(root).forbiddenCalls, 0);
  assert.throws(
    () => validatePureReducerSources(root, { 'fixture-reducer.js': 'export const bad=()=>Math.random()+Date.now();' }),
    /fixture-reducer\.js:.*Date\.now.*Math\.random/,
  );
});

test('complete V16 combat project passes route, intent, asset and source gates', () => {
  const result = validateV16CombatProject(root,{route:'final',frozenRoot:resolve(root,'e2e/fixtures/v15-frozen'),baseline:resolve(root,'baselines/v15-frozen.json')});
  assert.deepEqual(result, { sourceNotices: 4, attackCallsiteFailures: 0, forbiddenCalls: 0, animationFrames: 69, liveRoute: 'rich', stagedRoute: 'v16-tech', frozenRoute:'v15', frozenEntries:106 });
});
