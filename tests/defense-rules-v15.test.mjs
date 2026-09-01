import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFENSE_DEFAULTS,
  createDefenseState,
  requestDefense,
  advanceDefense,
  enterHurtState,
  makeAttackEvent,
  resolveDefense,
  recordAppliedDamage,
  canScheduleHighThreat,
  auditHighThreatBudget,
  createDefenseTelemetry,
  auditEntitySnapshot,
} from '../js/combat-rules-v15.js';

const front = { x: 10, y: 0 };
const rear = { x: -10, y: 0 };

test('패링은 active 구간의 전방 parryable 공격만 한 번 막고 반격한다', () => {
  const state = createDefenseState();
  assert.equal(requestDefense(state, 'parry', 0), true);
  advanceDefense(state, DEFENSE_DEFAULTS.parry.startupMs);

  const first = resolveDefense(state, makeAttackEvent({ sourceKind: 'melee', defenseTag: 'parryable', origin: front, impactId: 'a' }), {
    player: { x: 0, y: 0, facing: 0 },
  });
  const duplicate = resolveDefense(state, makeAttackEvent({ sourceKind: 'melee', defenseTag: 'parryable', origin: front, impactId: 'a' }), {
    player: { x: 0, y: 0, facing: 0 },
  });

  assert.deepEqual(first, { damageMultiplier: 0, outcome: 'parried', counter: true, reflect: false });
  assert.equal(duplicate.damageMultiplier,0);
  assert.equal(duplicate.outcome,'parried');
  assert.equal(duplicate.counter, false);
});

test('reflectable 투사체는 반사하며 후방·dodgeOnly·unavoidable 공격은 패링하지 못한다', () => {
  for (const [defenseTag, origin, expected] of [
    ['reflectable', front, 'reflected'],
    ['parryable', rear, 'hit'],
    ['dodgeOnly', front, 'hit'],
    ['unavoidable', front, 'hit'],
  ]) {
    const state = createDefenseState();
    requestDefense(state, 'parry', 0);
    advanceDefense(state, DEFENSE_DEFAULTS.parry.startupMs);
    const result = resolveDefense(state, makeAttackEvent({ sourceKind: 'projectile', defenseTag, origin, impactId: defenseTag }), {
      player: { x: 0, y: 0, facing: 0 },
    });
    assert.equal(result.outcome, expected);
    assert.equal(result.reflect, expected === 'reflected');
  }
});

test('구르기는 unavoidable을 제외한 모든 태그를 회피한다', () => {
  for (const defenseTag of ['parryable', 'reflectable', 'dodgeOnly', 'unavoidable']) {
    const state = createDefenseState();
    requestDefense(state, 'dodge', 0);
    advanceDefense(state, DEFENSE_DEFAULTS.dodge.startupMs);
    const result = resolveDefense(state, makeAttackEvent({ sourceKind: 'area', defenseTag, origin: front, impactId: defenseTag }), {
      player: { x: 0, y: 0, facing: 0 },
    });
    assert.equal(result.outcome, defenseTag === 'unavoidable' ? 'hit' : 'dodged');
  }
});

test('방어 상태는 배타적이며 거부 입력은 시도나 충전을 소비하지 않는다', () => {
  const telemetry = createDefenseTelemetry();
  const state = createDefenseState({ parryCharges: 2, dodgeCharges: 2 }, telemetry);
  assert.equal(requestDefense(state, 'parry', 0), true);
  const before = { ...state.resources };
  assert.equal(requestDefense(state, 'dodge', 20), false);
  assert.deepEqual(state.resources, before);
  assert.equal(telemetry.dodgeAttempts, 0);
  assert.equal(telemetry.rejectedInputs, 1);
});

test('논리 상태 전이는 렌더 프레임 간격과 무관하다', () => {
  const simulate = frameMs => {
    const state = createDefenseState();
    requestDefense(state, 'parry', 0);
    let elapsed = 0;
    while (elapsed < 700) {
      const dt = Math.min(frameMs, 700 - elapsed);
      advanceDefense(state, dt);
      elapsed += dt;
    }
    return { mode: state.mode, phase: state.phase, elapsed: Math.round(state.elapsedMs) };
  };
  assert.deepEqual(simulate(1000 / 30), simulate(1000 / 60));
  assert.deepEqual(simulate(1000 / 60), simulate(1000 / 144));
});

test('high 위협 예산은 보스를 포함해 최대 두 개만 허용한다', () => {
  assert.equal(canScheduleHighThreat([], { boss: false }), true);
  assert.equal(canScheduleHighThreat([{ boss: false }, { boss: false }], { boss: false }), false);
  assert.equal(canScheduleHighThreat([{ boss: true }], { boss: false }), true);
  assert.equal(canScheduleHighThreat([{ boss: true }, { boss: false }], { boss: false }), false);
});

test('공격 계약은 필수 필드를 정규화하고 누락을 거부한다', () => {
  assert.throws(() => makeAttackEvent({ defenseTag: 'parryable' }), /sourceKind/);
  const event = makeAttackEvent({ sourceKind: 'melee', defenseTag: 'dodgeOnly', origin: front, impactAt: 120, threat: 'high' });
  assert.equal(event.sourceKind, 'melee');
  assert.equal(event.threat, 'high');
});

test('entity snapshot은 한 명의 플레이어와 상한을 감사한다', () => {
  assert.deepEqual(auditEntitySnapshot({ playerRenderEntities: 1, followerEntities: 0, enemies: 360, projectiles: 520, particles: 900 }), []);
  const failures = auditEntitySnapshot({ playerRenderEntities: 2, followerEntities: 1, enemies: 361, projectiles: 521, particles: 901 });
  assert.equal(failures.length, 5);
});

test('잘못된 방어 입력과 공격 계약은 명시적으로 거부한다', () => {
  const state=createDefenseState({parryCharges:0});
  assert.equal(requestDefense(state,'parry',0),false);
  assert.throws(()=>requestDefense(state,'teleport',0),/알 수 없는/);
  assert.throws(()=>advanceDefense(state,-1),/deltaMs/);
  assert.throws(()=>advanceDefense(state,Number.NaN),/deltaMs/);
  assert.throws(()=>makeAttackEvent({sourceKind:'area',defenseTag:'unknown',origin:front}),/defenseTag/);
  assert.throws(()=>makeAttackEvent({sourceKind:'area',defenseTag:'unavoidable',origin:{x:Number.NaN,y:0}}),/origin/);
});

test('패링 성공과 hurt 상태는 남은 논리 단계를 거쳐 neutral로 끝난다', () => {
  const state=createDefenseState();
  requestDefense(state,'parry',0);advanceDefense(state,DEFENSE_DEFAULTS.parry.startupMs);
  resolveDefense(state,makeAttackEvent({sourceKind:'melee',defenseTag:'parryable',origin:front,impactId:'success'}),{player:{x:0,y:0,facing:0}});
  advanceDefense(state,DEFENSE_DEFAULTS.parry.successMs+DEFENSE_DEFAULTS.parry.recoveryMs);
  assert.equal(state.mode,'neutral');
  assert.equal(enterHurtState(state,700),true);
  assert.equal(requestDefense(state,'dodge',710),false);
  advanceDefense(state,DEFENSE_DEFAULTS.hurt.recoveryMs);
  assert.equal(state.mode,'neutral');
});

test('보스 high 위협은 다른 보스가 준비 중이면 거부한다',()=>{
  assert.equal(canScheduleHighThreat([{boss:true}],{boss:true}),false);
  assert.equal(canScheduleHighThreat([{boss:false}],{boss:true}),true);
});

test('실제 적용 피해와 startup 패링 실패는 impact마다 한 번만 기록한다',()=>{
  const state=createDefenseState();requestDefense(state,'parry',0);
  const attack=makeAttackEvent({sourceKind:'melee',defenseTag:'parryable',origin:front,impactId:'startup-hit',damage:10});
  const result=resolveDefense(state,attack,{player:{x:0,y:0,facing:0}});
  assert.equal(result.outcome,'hit');assert.equal(state.telemetry.defenseDamageTaken,0);assert.equal(state.telemetry.parryFailures,0);
  assert.equal(recordAppliedDamage(state,attack,10),true);assert.equal(recordAppliedDamage(state,attack,10),false);assert.equal(recordAppliedDamage(state,{...attack,impactId:'zero'},0),false);
  assert.equal(state.telemetry.defenseDamageTaken,10);assert.equal(state.telemetry.parryFailures,1);
});

test('high 위협 감사는 총량과 보스 조합 위반을 보고한다',()=>{
  assert.deepEqual(auditHighThreatBudget([{boss:false},{boss:false}]),[]);
  assert.deepEqual(auditHighThreatBudget([{boss:true},{boss:false}]),[]);
  assert.match(auditHighThreatBudget([{boss:false},{boss:false},{boss:false}]).join('\n'),/high 위협 예산 초과/);
  assert.match(auditHighThreatBudget([{boss:true},{boss:false},{boss:false}]).join('\n'),/보스.*일반/);
  assert.match(auditHighThreatBudget([{boss:true},{boss:true}]).join('\n'),/보스 high/);
  assert.match(auditHighThreatBudget([{boss:false},{boss:false}],{bossReady:true}).join('\n'),/보스 high 예약 위반/);
});

test('같은 시각의 서로 다른 투사체는 한 패링에서 각각 반사한다',()=>{
  const state=createDefenseState();requestDefense(state,'parry',0);advanceDefense(state,DEFENSE_DEFAULTS.parry.startupMs);
  const context={player:{x:0,y:0,facing:0}},first=makeAttackEvent({sourceKind:'projectile',defenseTag:'reflectable',origin:front,impactAt:90,impactId:'arrow-1'}),second=makeAttackEvent({sourceKind:'projectile',defenseTag:'reflectable',origin:front,impactAt:90,impactId:'arrow-2'});
  assert.equal(resolveDefense(state,first,context).outcome,'reflected');assert.equal(resolveDefense(state,second,context).outcome,'reflected');assert.equal(state.telemetry.parrySuccesses,2);
});
