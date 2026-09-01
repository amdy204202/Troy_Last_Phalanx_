import { createAttackIntent, telegraphForIntent } from './attack-intent-v16.js';

export const BOSS_MISSION_SECONDS = Object.freeze([65, 135, 205, 275, 345, 415, 485]);

const STAGES = Object.freeze([
  ['shore','shore-0','destroy',3,0,25], ['plain','plain-1','capture',2,12,30],
  ['plain','plain-2','capture',2,16,35], ['city','city-3','destroy',2,0,40],
  ['city','city-4','destroy',3,0,45], ['city','city-5','destroy',3,0,50],
  ['city','city-6','destroy',4,0,60], ['city','endless-{rotation}','destroy',4,0,60],
]);

export function stageForMissionTime(missionTime) {
  const time = Math.max(0, Number(missionTime) || 0);
  const stageIndex = Math.min(7, Math.floor(time / 70));
  const [packageId, templateId, objectiveType, targets, captureSeconds, reward] = STAGES[stageIndex];
  const rotation = stageIndex === 7 ? Math.floor((time - 490) / 90) : 0;
  return Object.freeze({ stageIndex, packageId, objectiveId: templateId.replace('{rotation}', String(rotation)), objectiveType, targets, captureSeconds, reward, shopCount: 1 });
}

export function createCampaignState(input = {}) {
  const missionTime = Math.max(0, Number(input.missionTime) || 0);
  return Object.freeze({
    missionTime, combatTime: Math.max(0, Number(input.combatTime) || 0), bossCombatTime: Math.max(0, Number(input.bossCombatTime) || 0),
    hero: input.hero ?? 'hoplite', hp: input.hp ?? 100, build: input.build ?? [], drachma: input.drachma ?? 0,
    defense: input.defense ?? { phase: 'ready' }, rngStreams: input.rngStreams ?? {},
    spawnSerial: input.spawnSerial ?? 0, positions: input.positions ?? [], projectileCount: input.projectileCount ?? 0,
    stage: stageForMissionTime(missionTime), dueBossEvents: input.dueBossEvents ?? [], mode: input.mode ?? 'playing',
    consumedActions: input.consumedActions ?? [], safeGateToken: input.safeGateToken ?? null,
  });
}

export function transitionCampaignStage(state, missionTime) {
  return Object.freeze({ ...state, missionTime, stage: stageForMissionTime(missionTime) });
}

function consumeAction(state, action) {
  if (!action?.idempotencyKey || state.consumedActions.includes(action.idempotencyKey)) return state;
  const consumedActions = Object.freeze([...state.consumedActions, action.idempotencyKey]);
  if (action.type === 'close-safe-gate' && state.mode === 'shop') return Object.freeze({ ...state, mode: 'playing', safeGateToken: null, consumedActions });
  if (action.type === 'open-safe-gate' && state.mode === 'playing' && action.token) return Object.freeze({ ...state, mode: 'shop', safeGateToken: action.token, consumedActions });
  return Object.freeze({ ...state, consumedActions });
}

export function stepCampaign(state, { fixedSeconds = 0, bossAlive = false, action = null, scheduler = null } = {}) {
  let next = state;
  if (action && !state.consumedActions.includes(action.idempotencyKey)) {
    if (action.type === 'open-safe-gate') {
      for (const record of scheduler?.snapshot?.() ?? []) if (['scheduled','telegraphing','committed'].includes(record.state)) scheduler.cancel(record.telegraphId);
    }
    next = consumeAction(state, action);
  }
  if (next.mode === 'shop' || fixedSeconds <= 0) return next;
  const missionTime = bossAlive ? next.missionTime : next.missionTime + fixedSeconds;
  const dueBossEvents = BOSS_MISSION_SECONDS.filter(second => second > next.missionTime && second <= missionTime);
  return Object.freeze({ ...next, missionTime, combatTime: next.combatTime + fixedSeconds, bossCombatTime: next.bossCombatTime + (bossAlive ? fixedSeconds : 0), stage: stageForMissionTime(missionTime), dueBossEvents: Object.freeze([...next.dueBossEvents, ...dueBossEvents]) });
}

export function createHazardIntent({ kind, tick, origin, sequence = 0 }) {
  const collapse = kind === 'collapse';
  const intent = createAttackIntent({
    sourceKind: 'hazard', defenseTag: collapse ? 'unavoidable' : 'dodgeOnly', origin,
    impactAt: tick + 30, threat: 'high', telegraphId: `hazard-${kind}-${tick}-${sequence}`,
    impactId: `hazard-impact-${kind}-${tick}-${sequence}`, radius: collapse ? 92 : 54, range: collapse ? 0 : 180,
    direction: 0, damage: collapse ? 28 : 18,
  });
  return Object.freeze({ ...intent, telegraph: telegraphForIntent(intent) });
}
