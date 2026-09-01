import test from 'node:test';
import assert from 'node:assert/strict';

import { BOSS_MISSION_SECONDS, stageForMissionTime } from '../js/battlefield-rules-v16.js';
import { applyObjectiveProgress, createObjectiveForStage, settleObjectiveReward } from '../js/objective-rules-v16.js';
import { applyShopAction, canonicalShopSnapshot, createWarShop } from '../js/war-shop-rules-v16.js';
import { canonicalShopRngState } from '../js/rich-integration-v16.js';

const catalog = Object.freeze([
  { id: 'maxHp', price: 40 },
  { id: 'damage', price: 40 },
  { id: 'speed', price: 40 },
  { id: 'recovery', price: 40 },
  { id: 'area', price: 40 },
  { id: 'cadence', price: 40 },
]);
const canonicalIds = catalog.map(item => item.id);
const nextShopRng = hex => { let x = BigInt(`0x${hex}`), mask = (1n << 64n) - 1n; x ^= x << 13n; x ^= x >> 7n; x ^= x << 17n; return (x & mask).toString(16).padStart(16, '0'); };

test('runtime numeric RNG state becomes a canonical 64-bit shop seed', () => {
  assert.equal(canonicalShopRngState(0x89abcdef), '0000000089abcdef');
  assert.equal(canonicalShopRngState('0123456789abcdef'), '0123456789abcdef');
});

test('rich campaign preserves the exact eight-stage objective contract and boss schedule', () => {
  const rows = [0, 70, 140, 210, 280, 350, 420, 490].map(time => stageForMissionTime(time));
  assert.deepEqual(rows.map(row => row.packageId), ['shore', 'plain', 'plain', 'city', 'city', 'city', 'city', 'city']);
  assert.deepEqual(rows.map(row => row.objectiveId), ['shore-0', 'plain-1', 'plain-2', 'city-3', 'city-4', 'city-5', 'city-6', 'endless-0']);
  assert.deepEqual(rows.map(row => row.shopCount), Array(8).fill(1));
  assert.deepEqual(BOSS_MISSION_SECONDS, [65, 135, 205, 275, 345, 415, 485]);

  let objective = createObjectiveForStage(rows[0]);
  objective = applyObjectiveProgress(objective, objective.maxProgress);
  let wallet = { drachma: 0, safeGateTokens: [] };
  ({ objective, wallet } = settleObjectiveReward(objective, wallet));
  const settled = { objective, wallet };
  ({ objective, wallet } = settleObjectiveReward(objective, wallet));
  assert.deepEqual({ objective, wallet }, settled);
  assert.deepEqual(wallet, { drachma: 25, safeGateTokens: ['objective:shore-0'] });
});

test('safe shop executes lock, reroll, banish and buy as a four-slot atomic contract', () => {
  let shop = createWarShop({ token: 'objective:shore-0', balance: 100, catalog, levelPoolIds: canonicalIds, rngState: '0123456789abcdef' });
  assert.equal(shop.slots.length, 4);
  shop = applyShopAction(shop, { type: 'lock', slot: 0, idempotencyKey: 'lock-1' });
  const locked = shop.slots[0];
  const rngBeforeReroll = shop.rngState;
  shop = applyShopAction(shop, { type: 'reroll', idempotencyKey: 'reroll-1' });
  assert.deepEqual(shop.slots[0], locked);
  assert.equal(shop.rngState, nextShopRng(rngBeforeReroll));
  assert.notEqual(shop.rngState, rngBeforeReroll);
  const deterministic = applyShopAction(
    applyShopAction(createWarShop({ token: 'objective:shore-0', balance: 100, catalog, levelPoolIds: canonicalIds, rngState: '0123456789abcdef' }), { type: 'lock', slot: 0, idempotencyKey: 'lock-1' }),
    { type: 'reroll', idempotencyKey: 'reroll-1' },
  );
  assert.equal(deterministic.rngState, shop.rngState);
  assert.deepEqual(deterministic.slots, shop.slots);
  const banishedId = shop.slots[1].id;
  shop = applyShopAction(shop, { type: 'banish', slot: 1, idempotencyKey: 'banish-1' });
  assert.ok(!shop.eligibleShopIds.includes(banishedId));
  assert.ok(!shop.eligibleLevelIds.includes(banishedId));
  const buySlot = 2;
  const boughtId = shop.slots[buySlot].id;
  shop = applyShopAction(shop, { type: 'buy', slot: buySlot, effectId: boughtId, idempotencyKey: 'buy-1' });
  assert.equal(shop.balance, 50);
  assert.equal(shop.effects[boughtId], 1);
  assert.equal(shop.slots.length, 4);

  const bought = canonicalShopSnapshot(shop);
  assert.deepEqual(canonicalShopSnapshot(applyShopAction(shop, { type: 'buy', slot: buySlot, effectId: boughtId, idempotencyKey: 'buy-1' })), bought);
});

test('safe shop rejects unknown effect and pool membership without partial mutation', () => {
  const shop = createWarShop({ token: 'objective:shore-0', balance: 100, catalog, levelPoolIds: canonicalIds, rngState: '0123456789abcdef' });
  const before = canonicalShopSnapshot(shop);
  const after = applyShopAction(shop, { type: 'buy', slot: 0, effectId: 'unknown-effect', idempotencyKey: 'unknown-1' });
  assert.deepEqual(canonicalShopSnapshot(after), before);

  const invalidCatalog = [...catalog, { id: 'not-in-level-pool', price: 1 }];
  const invalid = createWarShop({ token: 'bad', balance: 100, catalog: invalidCatalog, levelPoolIds: canonicalIds, rngState: '0123456789abcdef' });
  assert.ok(invalid.slots.every(slot => canonicalIds.includes(slot.id)));

  const poor = createWarShop({ token: 'poor', balance: 9, catalog, levelPoolIds: canonicalIds, rngState: '0123456789abcdef' });
  assert.equal(applyShopAction(poor, { type: 'reroll', idempotencyKey: 'poor-reroll' }), poor);
});
