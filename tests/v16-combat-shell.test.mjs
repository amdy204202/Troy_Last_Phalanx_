import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createCompositionShell,
  createTutorialProgress,
  updateTutorialProgress,
} from '../js/game-v16.js';

const root = resolve(import.meta.dirname, '..');

test('rich root boots central V15 runtime plus V16 bridge while tech and frozen routes remain separate', () => {
  const live = readFileSync(resolve(root, 'index.html'), 'utf8');
  const staged = readFileSync(resolve(root, 'index-v16.html'), 'utf8');
  const frozen = readFileSync(resolve(root,'e2e/fixtures/v15-frozen/index.html'),'utf8');
  assert.match(live, /js\/game-v15\.js/);
  assert.doesNotMatch(live, /js\/game-v16\.js/);
  assert.match(staged, /js\/game-v16\.js/);
  assert.match(frozen,/js\/game-v15\.js/);
  assert.match(staged, /트로이: 최후의 팔랑크스 V16/);
});

test('composition shell exposes four single-registration seams', () => {
  const shell = createCompositionShell();
  const combat = { name: 'combat' }, campaign = { name: 'campaign' }, siege = { name: 'siege' }, hud = { name: 'hud' };
  assert.equal(shell.registerCombat(combat), combat);
  assert.equal(shell.registerCampaign(campaign), campaign);
  assert.equal(shell.registerSiege(siege), siege);
  assert.equal(shell.registerHudLayer(hud), hud);
  assert.deepEqual(shell.snapshot(), { combat: 'registered', campaign: 'registered', siege: 'registered', hud: 'registered' });
  assert.throws(() => shell.registerCombat({}), /combat already registered/);
});

test('tutorial requires measured movement and actual parry/dodge outcomes', () => {
  let tutorial = createTutorialProgress();
  tutorial = updateTutorialProgress(tutorial, { type: 'input', action: 'MOVE', distance: 500 });
  assert.equal(tutorial.step, 'move');
  tutorial = updateTutorialProgress(tutorial, { type: 'outcome', action: 'MOVE', distance: 119 });
  assert.equal(tutorial.step, 'move');
  tutorial = updateTutorialProgress(tutorial, { type: 'outcome', action: 'MOVE', distance: 120 });
  assert.equal(tutorial.step, 'parry');
  tutorial = updateTutorialProgress(tutorial, { type: 'input', action: 'DEFENSE_PARRY' });
  assert.equal(tutorial.step, 'parry');
  tutorial = updateTutorialProgress(tutorial, { type: 'outcome', action: 'DEFENSE_PARRY', outcome: 'parried' });
  assert.equal(tutorial.step, 'dodge');
  tutorial = updateTutorialProgress(tutorial, { type: 'outcome', action: 'DEFENSE_DODGE', outcome: 'dodged', damage: 0, distance: 99 });
  assert.equal(tutorial.step, 'dodge');
  tutorial = updateTutorialProgress(tutorial, { type: 'outcome', action: 'DEFENSE_DODGE', outcome: 'dodged', damage: 0, distance: 100 });
  assert.equal(tutorial.step, 'complete');
});

test('tutorial recognizes the keyboard and gamepad contract', () => {
  const html = readFileSync(resolve(root, 'index-v16.html'), 'utf8');
  const game = readFileSync(resolve(root, 'js/game-v16.js'), 'utf8');
  assert.match(html, /SPACE/i);
  assert.match(html, /SHIFT/i);
  assert.match(game, /buttons\[4\]/);
  assert.match(game, /buttons\[1\]/);
});
