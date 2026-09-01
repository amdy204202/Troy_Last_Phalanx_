import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CAMPAIGN_ACTIONS,
  createCampaignTutorial,
  createDeterministicCampaignRuntime,
  reduceCampaignTutorial,
  runCampaignTape,
} from '../js/campaign-adapter-v16.js';

test('campaign tutorial advances only after six actual reducer outcomes', () => {
  let state = createCampaignTutorial();
  const expected = [
    ['objective-complete','enter-shop'], ['input-only','enter-shop'], ['shop-opened','lock-slot'],
    ['slot-locked','reroll'], ['shop-rerolled','banish'], ['item-banished','purchase'], ['item-purchased','complete'],
  ];
  for (const [outcome, step] of expected) {
    state = reduceCampaignTutorial(state, { type: outcome === 'input-only' ? 'input' : 'outcome', outcome });
    assert.equal(state.step, step);
  }
  assert.equal(state.completedSteps, 6);
});

test('campaign runtime opens a safe shop from an earned token and records replay actions', () => {
  const runtime = createDeterministicCampaignRuntime({ seed: '0123456789abcdef', balance: 100 });
  runtime.progressObjective(99);
  assert.equal(runtime.snapshot().tutorial.step, 'enter-shop');
  assert.equal(runtime.dispatch({ type: CAMPAIGN_ACTIONS.OPEN_SHOP, idempotencyKey: 'open' }).campaign.mode, 'shop');
  assert.deepEqual(runtime.snapshot().wallet.safeGateTokens, []);
  runtime.dispatch({ type: CAMPAIGN_ACTIONS.LOCK, slot: 0, idempotencyKey: 'lock' });
  runtime.dispatch({ type: CAMPAIGN_ACTIONS.REROLL, idempotencyKey: 'reroll' });
  runtime.dispatch({ type: CAMPAIGN_ACTIONS.BANISH, slot: 1, idempotencyKey: 'banish' });
  runtime.dispatch({ type: CAMPAIGN_ACTIONS.BUY, slot: 0, idempotencyKey: 'buy' });
  assert.equal(runtime.snapshot().tutorial.step, 'complete');
  assert.equal(runtime.snapshot().tape.length, 6);
});

test('campaign runtime replaces an expired objective at a stage boundary and cannot reuse a spent gate token', () => {
  const runtime = createDeterministicCampaignRuntime({ seed: '0123456789abcdef', balance: 100 });
  runtime.progressObjective(999);
  runtime.dispatch({ type: CAMPAIGN_ACTIONS.OPEN_SHOP, idempotencyKey: 'open-once' });
  runtime.dispatch({ type: CAMPAIGN_ACTIONS.CLOSE_SHOP, idempotencyKey: 'close-once' });
  runtime.dispatch({ type: CAMPAIGN_ACTIONS.OPEN_SHOP, idempotencyKey: 'open-twice' });
  assert.equal(runtime.snapshot().campaign.mode, 'playing');
  runtime.step(70);
  assert.equal(runtime.snapshot().objective.instanceId, 'plain-1');
  assert.equal(runtime.snapshot().objective.status, 'active');
});

test('the same campaign tape is byte-identical at every fps and quality', () => {
  const tape = [
    { tick: 1, action: CAMPAIGN_ACTIONS.OBJECTIVE_PROGRESS, payload: { amount: 3 }, idempotencyKey: 'objective' },
    { tick: 2, action: CAMPAIGN_ACTIONS.OPEN_SHOP, payload: {}, idempotencyKey: 'open' },
    { tick: 3, action: CAMPAIGN_ACTIONS.LOCK, payload: { slot: 0 }, idempotencyKey: 'lock' },
    { tick: 4, action: CAMPAIGN_ACTIONS.REROLL, payload: {}, idempotencyKey: 'reroll' },
  ];
  const results = [30,60,144].flatMap(fps => ['low','high'].map(quality => runCampaignTape({ seed: '0123456789abcdef', tape, fps, quality })));
  assert.equal(new Set(results).size, 1);
});
