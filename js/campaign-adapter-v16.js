import { canonicalJson } from './replay-v16.js';
import { createCampaignState, stepCampaign } from './battlefield-rules-v16.js';
import { applyObjectiveProgress, createObjectiveForStage, expireObjective, settleObjectiveReward } from './objective-rules-v16.js';
import { applyShopAction, canonicalShopSnapshot, createWarShop } from './war-shop-rules-v16.js';
import { migrateV15Storage } from './save-migration-v16.js';
import { mountCampaignUi } from './campaign-ui-v16.js';

export const CAMPAIGN_ACTIONS = Object.freeze({
  OBJECTIVE_PROGRESS: 'CAMPAIGN_OBJECTIVE_PROGRESS', OPEN_SHOP: 'CAMPAIGN_OPEN_SHOP',
  LOCK: 'CAMPAIGN_SHOP_LOCK', REROLL: 'CAMPAIGN_SHOP_REROLL', BANISH: 'CAMPAIGN_SHOP_BANISH',
  BUY: 'CAMPAIGN_SHOP_BUY', CLOSE_SHOP: 'CAMPAIGN_CLOSE_SHOP',
});

const CATALOG = Object.freeze([
  { id: 'bronze-edge', name: '청동 칼날', price: 25, effect: { might: 1 } },
  { id: 'tower-grip', name: '탑 방패 손잡이', price: 30, effect: { resolve: 1 } },
  { id: 'swift-greaves', name: '질풍 각반', price: 35, effect: { haste: 1 } },
  { id: 'owl-charm', name: '부엉이 부적', price: 20, effect: { fortune: 1 } },
  { id: 'red-cloak', name: '붉은 망토', price: 40, effect: { vigor: 1 } },
  { id: 'spear-loop', name: '창끈', price: 15, effect: { reach: 1 } },
  { id: 'laurel-oil', name: '월계유', price: 45, effect: { recovery: 1 } },
  { id: 'storm-coin', name: '폭풍 주화', price: 50, effect: { cadence: 1 } },
]);

const TUTORIAL_STEPS = Object.freeze(['objective','enter-shop','lock-slot','reroll','banish','purchase','complete']);
export function createCampaignTutorial() { return Object.freeze({ step: 'objective', completedSteps: 0 }); }
export function reduceCampaignTutorial(state, event) {
  if (event.type !== 'outcome') return state;
  const expected = { objective: 'objective-complete', 'enter-shop': 'shop-opened', 'lock-slot': 'slot-locked', reroll: 'shop-rerolled', banish: 'item-banished', purchase: 'item-purchased' }[state.step];
  if (event.outcome !== expected) return state;
  const index = TUTORIAL_STEPS.indexOf(state.step);
  return Object.freeze({ step: TUTORIAL_STEPS[index + 1], completedSteps: state.completedSteps + 1 });
}

function replayEntry(tick, action, payload, idempotencyKey) { return Object.freeze({ tick, action, payload: Object.freeze({ ...payload }), idempotencyKey }); }

export function createDeterministicCampaignRuntime({ seed = '0000000000000001', balance = 75 } = {}) {
  let campaign = createCampaignState(), objective = createObjectiveForStage(campaign.stage), wallet = Object.freeze({ drachma: balance, safeGateTokens: Object.freeze([]) });
  let shop = null, tutorial = createCampaignTutorial(), tick = 0, tape = Object.freeze([]), selectedSlot = 0;
  const listeners = new Set();
  const notify = () => listeners.forEach(listener => listener(snapshot()));
  const outcome = value => { tutorial = reduceCampaignTutorial(tutorial, { type: 'outcome', outcome: value }); };
  function progressObjective(amount, idempotencyKey = `objective-${objective.instanceId}`) {
    const previous = objective;
    objective = applyObjectiveProgress(objective, amount);
    ({ objective, wallet } = settleObjectiveReward(objective, wallet));
    if (!previous.rewarded && objective.rewarded) outcome('objective-complete');
    tick += 1; tape = Object.freeze([...tape, replayEntry(tick, CAMPAIGN_ACTIONS.OBJECTIVE_PROGRESS, { amount }, idempotencyKey)]); notify(); return snapshot();
  }
  function dispatch(action) {
    const payload = action.payload ?? action;
    tick += 1;
    if (action.type === CAMPAIGN_ACTIONS.OPEN_SHOP && campaign.mode === 'playing' && wallet.safeGateTokens.length) {
      const token = wallet.safeGateTokens[0];
      campaign = stepCampaign(campaign, { action: { type: 'open-safe-gate', token, idempotencyKey: action.idempotencyKey } });
      if (campaign.mode === 'shop') {
        wallet = Object.freeze({ ...wallet, safeGateTokens: Object.freeze(wallet.safeGateTokens.slice(1)) });
        shop = createWarShop({ token, balance: wallet.drachma, catalog: CATALOG, levelPoolIds: CATALOG.map(item => item.id), rngState: seed }); outcome('shop-opened');
      }
    } else if (action.type === CAMPAIGN_ACTIONS.CLOSE_SHOP && campaign.mode === 'shop') {
      campaign = stepCampaign(campaign, { action: { type: 'close-safe-gate', idempotencyKey: action.idempotencyKey } });
    } else if (shop) {
      const before = shop;
      const shopAction = {
        [CAMPAIGN_ACTIONS.LOCK]: 'lock', [CAMPAIGN_ACTIONS.REROLL]: 'reroll',
        [CAMPAIGN_ACTIONS.BANISH]: 'banish', [CAMPAIGN_ACTIONS.BUY]: 'buy',
      }[action.type];
      if (shopAction) shop = applyShopAction(shop, { type: shopAction, slot: payload.slot ?? selectedSlot, idempotencyKey: action.idempotencyKey });
      if (shop !== before) {
        if (shopAction === 'lock') outcome('slot-locked');
        if (shopAction === 'reroll') outcome('shop-rerolled');
        if (shopAction === 'banish') outcome('item-banished');
        if (shopAction === 'buy') outcome('item-purchased');
        wallet = Object.freeze({ ...wallet, drachma: shop.balance });
      }
    }
    tape = Object.freeze([...tape, replayEntry(tick, action.type, action.payload ?? {}, action.idempotencyKey)]); notify(); return snapshot();
  }
  function step(fixedSeconds, bossAlive = false) {
    const previousId = campaign.stage.objectiveId;
    campaign = stepCampaign(campaign, { fixedSeconds, bossAlive });
    if (campaign.stage.objectiveId !== previousId) { expireObjective(objective); objective = createObjectiveForStage(campaign.stage); }
    notify(); return snapshot();
  }
  function selectSlot(index) { selectedSlot = Math.max(0, Math.min(3, index)); notify(); }
  function snapshot() { return Object.freeze({ campaign, objective, wallet, shop: shop ? canonicalShopSnapshot(shop) : null, tutorial, tick, tape, selectedSlot }); }
  return Object.freeze({ dispatch, progressObjective, selectSlot, snapshot, step, subscribe(listener) { listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener); } });
}

export function runCampaignTape({ seed, tape, fps: _fps, quality: _quality }) {
  const runtime = createDeterministicCampaignRuntime({ seed, balance: 100 });
  for (const entry of tape) {
    if (entry.action === CAMPAIGN_ACTIONS.OBJECTIVE_PROGRESS) runtime.progressObjective(entry.payload.amount, entry.idempotencyKey);
    else runtime.dispatch({ type: entry.action, payload: entry.payload, idempotencyKey: entry.idempotencyKey });
  }
  const state = runtime.snapshot();
  return canonicalJson({ campaign: state.campaign, objective: state.objective, wallet: state.wallet, shop: state.shop, tutorial: state.tutorial });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined' && window.TroyV16) {
  if (localStorage.getItem('troy_last_phalanx_v14_meta') !== null) migrateV15Storage(localStorage, { sourceKey: 'troy_last_phalanx_v14_meta' });
  const runtime = createDeterministicCampaignRuntime({ seed: '74c6a8e130f921bd', balance: 100 });
  const ui = mountCampaignUi(runtime);
  const adapter = Object.freeze({ ...runtime, uiSnapshot: ui.snapshot });
  window.TroyV16.registerCampaign(adapter);
  if (new URLSearchParams(location.search).get('test') === '1') window.__TROY_V16_CAMPAIGN_TEST__ = adapter;
}
