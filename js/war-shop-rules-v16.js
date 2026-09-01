import { canonicalJson } from './replay-v16.js';

const MASK = (1n << 64n) - 1n;
function nextRng(hex) { let x = BigInt(`0x${hex || '1'}`) & MASK; x ^= x << 13n; x ^= x >> 7n; x ^= x << 17n; return (x & MASK).toString(16).padStart(16, '0'); }
function cloneSlot(slot) { return slot ? Object.freeze({ id: slot.id, price: slot.price, locked: !!slot.locked }) : null; }
function eligibleCatalog(state) { return state.catalog.filter(item => !state.banishedIds.includes(item.id)); }
function drawOne(state, excluded) {
  const choices = eligibleCatalog(state).filter(item => !excluded.has(item.id)).sort((a,b) => a.id.localeCompare(b.id));
  if (!choices.length) return { item: null, rngState: state.rngState };
  const rngState = nextRng(state.rngState), item = choices[Number(BigInt(`0x${rngState}`) % BigInt(choices.length))];
  return { item, rngState };
}
function withSlots(state, reroll = false) {
  const lockedIds = new Set(state.slots.filter(slot => slot?.locked).map(slot => slot.id));
  const oldUnlocked = new Set(reroll ? state.slots.filter(slot => slot && !slot.locked).map(slot => slot.id) : []);
  const globalRngState = reroll ? nextRng(state.rngState) : state.rngState;
  let drawRngState = globalRngState;
  const slots = state.slots.map(slot => slot?.locked ? slot : null);
  const chosen = new Set(lockedIds);
  for (let index = 0; index < 4; index += 1) {
    if (slots[index]) continue;
    const current = { ...state, rngState: drawRngState };
    let draw = drawOne(current, new Set([...chosen, ...oldUnlocked]));
    if (!draw.item) draw = drawOne(current, chosen);
    if (draw.item) { slots[index] = Object.freeze({ id: draw.item.id, price: draw.item.price, locked: false }); chosen.add(draw.item.id); drawRngState = draw.rngState; }
  }
  return { slots: Object.freeze(slots), rngState: reroll ? globalRngState : drawRngState };
}

export function createWarShop({ token, balance = 0, catalog = [], levelPoolIds = [], rngState = '0000000000000001' }) {
  const levelIds = new Set(levelPoolIds), canonicalCatalog = catalog.filter(item => levelIds.has(item.id));
  const canonicalIds = canonicalCatalog.map(item => item.id);
  const base = { token, balance, catalog: Object.freeze(canonicalCatalog.map(item => Object.freeze({ ...item }))), levelPoolIds: Object.freeze([...canonicalIds]), eligibleShopIds: Object.freeze([...canonicalIds]), eligibleLevelIds: Object.freeze([...canonicalIds]), slots: Object.freeze([null,null,null,null]), rerollCost: 10, rerollCount: 0, banishedIds: Object.freeze([]), rngState, effects: Object.freeze({}), processedActions: Object.freeze([]), mode: 'shop' };
  return Object.freeze({ ...base, ...withSlots(base) });
}

function consumed(state, key) { return !key || state.processedActions.includes(key); }
function mark(state, key) { return Object.freeze([...state.processedActions, key]); }

export function applyShopAction(state, action) {
  if (consumed(state, action?.idempotencyKey)) return state;
  const slot = state.slots[action.slot];
  if (action.type === 'buy' && action.effectId !== undefined && action.effectId !== slot?.id) return state;
  const processedActions = mark(state, action.idempotencyKey);
  if (action.type === 'lock' && slot) {
    const slots = state.slots.map((item,index) => index === action.slot ? Object.freeze({ ...item, locked: !item.locked }) : item);
    return Object.freeze({ ...state, slots: Object.freeze(slots), processedActions });
  }
  if (action.type === 'buy' && slot && state.balance >= slot.price) {
    const slots = state.slots.map((item,index) => index === action.slot ? null : item);
    return Object.freeze({ ...state, balance: state.balance - slot.price, slots: Object.freeze(slots), effects: Object.freeze({ ...state.effects, [slot.id]: (state.effects[slot.id] ?? 0) + 1 }), processedActions });
  }
  if (action.type === 'banish' && slot) {
    const banishedIds = Object.freeze([...new Set([...state.banishedIds, slot.id])].sort());
    const eligibleShopIds = Object.freeze(state.eligibleShopIds.filter(id => id !== slot.id));
    const eligibleLevelIds = Object.freeze(state.eligibleLevelIds.filter(id => id !== slot.id));
    const slots = Object.freeze(state.slots.map(item => item?.id === slot.id ? null : item));
    return Object.freeze({ ...state, banishedIds, eligibleShopIds, eligibleLevelIds, slots, processedActions });
  }
  if (action.type === 'reroll' && state.balance >= state.rerollCost) {
    const rolled = withSlots(state, true), rerollCount = state.rerollCount + 1;
    return Object.freeze({ ...state, ...rolled, balance: state.balance - state.rerollCost, rerollCount, rerollCost: 10 + rerollCount * 5, processedActions });
  }
  if (action.type === 'close') return Object.freeze({ ...state, mode: 'closed', processedActions });
  return state;
}

export function shopSnapshot(state) {
  return Object.freeze({ token: state.token, slots: Object.freeze(state.slots.map(cloneSlot)), balance: state.balance, rerollCost: state.rerollCost, rerollCount: state.rerollCount, banishedIds: Object.freeze([...state.banishedIds].sort()), shopRngState: state.rngState, eligibleShopIds: Object.freeze([...state.eligibleShopIds].sort()), eligibleLevelIds: Object.freeze([...state.eligibleLevelIds].sort()) });
}
export function canonicalShopSnapshot(state) { return JSON.parse(canonicalJson(shopSnapshot(state))); }
