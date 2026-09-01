import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOSS_MISSION_SECONDS,
  createCampaignState,
  createHazardIntent,
  stageForMissionTime,
  stepCampaign,
  transitionCampaignStage,
} from '../js/battlefield-rules-v16.js';
import {
  applyObjectiveProgress,
  createObjectiveForStage,
  expireObjective,
  settleObjectiveReward,
} from '../js/objective-rules-v16.js';
import {
  applyShopAction,
  canonicalShopSnapshot,
  createWarShop,
} from '../js/war-shop-rules-v16.js';

const catalog = [
  { id: 'might', price: 40, effect: { might: 1 } },
  { id: 'vigor', price: 35, effect: { vigor: 1 } },
  { id: 'wisdom', price: 30, effect: { wisdom: 1 } },
  { id: 'haste', price: 25, effect: { haste: 1 } },
  { id: 'reach', price: 20, effect: { reach: 1 } },
  { id: 'fortune', price: 15, effect: { fortune: 1 } },
];

test('stage 0~7 maps to the three declared battlefield packages and rotating endless instances', () => {
  const expected = [
    ['shore', 'shore-0', 25], ['plain', 'plain-1', 30], ['plain', 'plain-2', 35],
    ['city', 'city-3', 40], ['city', 'city-4', 45], ['city', 'city-5', 50],
    ['city', 'city-6', 60], ['city', 'endless-0', 60],
  ];
  assert.deepEqual([0,70,140,210,280,350,420,490].map(time => {
    const stage = stageForMissionTime(time);
    return [stage.packageId, stage.objectiveId, stage.reward];
  }), expected);
  assert.equal(stageForMissionTime(579).objectiveId, 'endless-0');
  assert.equal(stageForMissionTime(580).objectiveId, 'endless-1');
  assert.equal(stageForMissionTime(669).objectiveId, 'endless-1');
});

test('objective progress and rewards are exactly once without moving the boss clock', () => {
  let objective = createObjectiveForStage(stageForMissionTime(0));
  objective = applyObjectiveProgress(objective, objective.maxProgress);
  let wallet = { drachma: 0, safeGateTokens: [] };
  ({ objective, wallet } = settleObjectiveReward(objective, wallet));
  const once = { objective, wallet };
  ({ objective, wallet } = settleObjectiveReward(objective, wallet));
  assert.deepEqual({ objective, wallet }, once);
  assert.equal(wallet.drachma, 25);
  assert.deepEqual(wallet.safeGateTokens, ['objective:shore-0']);
  assert.deepEqual(BOSS_MISSION_SECONDS, [65,135,205,275,345,415,485]);
  let campaign = createCampaignState({ missionTime: 64 });
  campaign = stepCampaign(campaign, { fixedSeconds: 1, bossAlive: false });
  assert.deepEqual(campaign.dueBossEvents, [65]);
  assert.equal(stepCampaign(campaign, { fixedSeconds: 20, bossAlive: true }).missionTime, 65);
});

test('objective state is forward-only across invalid progress, expiry and settlement', () => {
  const stage = stageForMissionTime(70);
  const active = createObjectiveForStage(stage, { x: 9, y: 8 });
  assert.equal(applyObjectiveProgress(active, 0), active);
  const expired = expireObjective(active);
  assert.equal(expired.status, 'expired');
  assert.equal(applyObjectiveProgress(expired, 999), expired);
  assert.deepEqual(settleObjectiveReward(expired, { drachma: 0, safeGateTokens: [] }), { objective: expired, wallet: { drachma: 0, safeGateTokens: [] } });
  const complete = applyObjectiveProgress(active, active.maxProgress);
  assert.equal(expireObjective(complete), complete);
});

test('stage transitions preserve combat state and hazards are full attack intents', () => {
  const state = createCampaignState({
    missionTime: 69, hero: 'archer', hp: 77, build: ['bow'], drachma: 45,
    defense: { phase: 'active' }, rngStreams: { gameplay: 'a', shop: 'b', visual: 'c', boss: 'd' },
  });
  const transitioned = transitionCampaignStage(state, 70);
  for (const key of ['hero','hp','build','drachma','defense','rngStreams']) assert.deepEqual(transitioned[key], state[key]);
  assert.equal(transitioned.stage.objectiveId, 'plain-1');
  for (const [kind, tag] of [['fireline','dodgeOnly'], ['collapse','unavoidable']]) {
    const intent = createHazardIntent({ kind, tick: 100, origin: { x: 3, y: 4 }, sequence: 2 });
    assert.equal(intent.sourceKind, 'hazard');
    assert.equal(intent.defenseTag, tag);
    assert.equal(intent.impactAt, 130);
    assert.ok(intent.telegraphId && intent.impactId && intent.radius > 0);
    assert.ok(['split-chevron','broken-ring'].includes(intent.telegraph.shape));
  }
});

test('war shop snapshots four unique slots and purchase is atomic and idempotent', () => {
  let shop = createWarShop({ token: 'objective:shore-0', balance: 100, catalog, levelPoolIds: catalog.map(item => item.id), rngState: '0123456789abcdef' });
  const first = canonicalShopSnapshot(shop);
  assert.equal(first.slots.length, 4);
  assert.equal(new Set(first.slots.map(slot => slot.id)).size, 4);
  const item = shop.slots[0];
  shop = applyShopAction(shop, { type: 'buy', slot: 0, idempotencyKey: 'buy-1' });
  const bought = shop;
  shop = applyShopAction(shop, { type: 'buy', slot: 0, idempotencyKey: 'buy-1' });
  assert.deepEqual(shop, bought);
  assert.equal(shop.balance, 100 - item.price);
  assert.equal(shop.effects[item.id], 1);
  assert.equal(shop.rngState, first.shopRngState);

  const poor = createWarShop({ token: 't', balance: 0, catalog, levelPoolIds: catalog.map(item => item.id), rngState: '0123456789abcdef' });
  assert.deepEqual(applyShopAction(poor, { type: 'buy', slot: 0, idempotencyKey: 'poor' }), poor);
});

test('lock, reroll and banish share membership and a new run restores the pools', () => {
  const ids = catalog.map(item => item.id);
  let shop = createWarShop({ token: 'objective:plain-1', balance: 100, catalog, levelPoolIds: ids, rngState: 'fedcba9876543210' });
  shop = applyShopAction(shop, { type: 'lock', slot: 0, idempotencyKey: 'lock-0' });
  shop = applyShopAction(shop, { type: 'lock', slot: 2, idempotencyKey: 'lock-2' });
  const locked = [shop.slots[0], shop.slots[2]];
  const banished = shop.slots[1].id;
  shop = applyShopAction(shop, { type: 'banish', slot: 1, idempotencyKey: 'banish-1' });
  shop = applyShopAction(shop, { type: 'reroll', idempotencyKey: 'reroll-1' });
  assert.deepEqual([shop.slots[0], shop.slots[2]], locked);
  assert.equal(new Set(shop.slots.filter(Boolean).map(slot => slot.id)).size, shop.slots.filter(Boolean).length);
  const snapshot = canonicalShopSnapshot(shop);
  assert.ok(!snapshot.eligibleShopIds.includes(banished));
  assert.ok(!snapshot.eligibleLevelIds.includes(banished));
  assert.deepEqual(snapshot.banishedIds, [banished]);
  const nextRun = createWarShop({ token: 'new-run', balance: 100, catalog, levelPoolIds: ids, rngState: 'fedcba9876543210' });
  assert.deepEqual(nextRun.banishedIds, []);
  assert.ok(nextRun.eligibleShopIds.includes(banished) && nextRun.eligibleLevelIds.includes(banished));
});

test('safe gate freezes all clocks, spawn and projectiles and cancels committed intents', () => {
  const scheduler = { snapshot: () => [{ telegraphId: 'a', state: 'committed' }], cancelled: [], cancel(id) { this.cancelled.push(id); return true; } };
  let state = createCampaignState({ missionTime: 30, combatTime: 22, bossCombatTime: 3, spawnSerial: 7, positions: [{x:1,y:2}], projectileCount: 4 });
  state = stepCampaign(state, { action: { type: 'open-safe-gate', token: 'objective:shore-0', idempotencyKey: 'open-1' }, scheduler });
  const frozen = state;
  for (let index = 0; index < 600; index += 1) state = stepCampaign(state, { fixedSeconds: 1 / 60, scheduler });
  assert.deepEqual(state, frozen);
  assert.deepEqual(scheduler.cancelled, ['a']);
  state = stepCampaign(state, { action: { type: 'close-safe-gate', idempotencyKey: 'close-1' }, scheduler });
  state = stepCampaign(state, { fixedSeconds: 1 / 60, scheduler });
  assert.ok(state.missionTime > frozen.missionTime);
});
