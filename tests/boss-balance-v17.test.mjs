import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adaptBossIntent,
  applyBossParryResult,
  applyPoisonHit,
  bossPatternProfile,
  bossRelicDropCount,
  consumeAmbrosiaHeal,
  consumeFleeceHeal,
  createBossAdaptation,
  createRecoveryLedger,
  enemyAttackTiming,
  normalizeShakeSettings,
  phaseProjectileMultiplier,
  parryMissPenalty,
  bossDamageMultiplier,
  consumeParryFailure,
  advanceChargeState,
  createBossMechanicState,
  stepBossMechanic,
  parryExposureAt,
  memnonCorridorGeometry,
  tickPoison,
  bossManifestPatternRuntime,
  advanceParryExposure,
  resolveShakeOffset,
  consumeAdaptationAfterSpawn,
} from '../js/boss-balance.js';

test('screen shake defaults off and migration preserves explicit booleans idempotently', () => {
  assert.deepEqual(normalizeShakeSettings({}), { shake: false, shakeV17Migrated: true });
  assert.deepEqual(normalizeShakeSettings({ shake: true }), { shake: true, shakeV17Migrated: true });
  assert.deepEqual(normalizeShakeSettings({ shake: false }), { shake: false, shakeV17Migrated: true });
  assert.deepEqual(normalizeShakeSettings(normalizeShakeSettings({ shake: 'yes' })), { shake: false, shakeV17Migrated: true });
});

test('parry failure telemetry is consumed once whether caused by expiry or impact', () => {
  assert.deepEqual(consumeParryFailure({ handled: 2 }, 2), { handled: 2, missed: false });
  assert.deepEqual(consumeParryFailure({ handled: 2 }, 3), { handled: 3, missed: true });
  assert.deepEqual(consumeParryFailure({ handled: 3 }, 3), { handled: 3, missed: false });
});

test('charge windup crossing zero starts charge and retreat schedules a reentry', () => {
  let state = advanceChargeState({ chargeWindup: 1 / 60, chargeTicks: 51, phase: 0, retreatTicks: 0 }, 1 / 60);
  assert.equal(state.phase, 51 / 60);
  state = advanceChargeState({ chargeWindup: 0, chargeTicks: 51, phase: 0, retreatTicks: 1, chargeAngle: 0, reentryAngle: 1.2 }, 1 / 60);
  assert.equal(state.chargeWindup, .6);
  assert.equal(state.chargeAngle, 1.2);
  state = advanceChargeState(state, .6);
  assert.equal(state.phase, 51 / 60);
});

test('chariot locks one full attack cycle through recovery', () => {
  let state=createBossMechanicState('chariot',{seed:7,recoveryTicks:60});
  const visited=[];for(let tick=0;tick<280&&!state.complete;tick++){visited.push(state.stage);state=stepBossMechanic(state).state}
  assert.deepEqual([...new Set(visited)],['windup','charge','retreat','reentryWindup','reentryCharge','recovery']);
  assert.equal(state.complete,true);
});

test('paris and sarpedon release attacks only after their invulnerable boundaries',()=>{
  let paris=createBossMechanicState('paris',{recoveryTicks:10});
  for(let tick=0;tick<47;tick++){const out=stepBossMechanic(paris);paris=out.state;assert.deepEqual(out.actions,[])}
  let out=stepBossMechanic(paris);assert.equal(out.state.stage,'emerge');assert.deepEqual(out.actions.map(x=>x.type),['paris-emerge']);
  let sarpedon=createBossMechanicState('sarpedon',{recoveryTicks:10});
  for(let tick=0;tick<47;tick++)sarpedon=stepBossMechanic(sarpedon).state;
  out=stepBossMechanic(sarpedon);sarpedon=out.state;assert.equal(out.state.stage,'landingTell');assert.deepEqual(out.actions,[]);
  for(let tick=0;tick<35;tick++)sarpedon=stepBossMechanic(sarpedon).state;
  out=stepBossMechanic(sarpedon);assert.deepEqual(out.actions.map(x=>x.type),['sarpedon-slam']);
});

test('penthesilea redirects at tick 12 then completes the long tell before charge',()=>{
  let state=createBossMechanicState('penthesilea',{seed:1,recoveryTicks:10,feint:true});
  for(let tick=0;tick<11;tick++)state=stepBossMechanic(state).state;
  let out=stepBossMechanic(state);state=out.state;assert.equal(state.stage,'longTell');assert.equal(state.redirected,true);assert.deepEqual(out.actions.map(x=>x.type),['redirect']);
  for(let tick=0;tick<47;tick++)state=stepBossMechanic(state).state;
  out=stepBossMechanic(state);assert.equal(out.state.stage,'charge');
});

test('memnon corridor keeps twelve pixels beyond player diameter while compression changes placement',()=>{
  const phase1=memnonCorridorGeometry({x:0,y:0,angle:0,playerDiameter:30,phase:1});
  const phase3=memnonCorridorGeometry({x:0,y:0,angle:0,playerDiameter:30,phase:3});
  assert.equal(phase1.gap-30,12);assert.equal(phase3.gap-30,12);assert.notEqual(phase1.boundaries[0].offset,phase3.boundaries[0].offset);
  assert.equal(phase3.boundaries.length,2);
});

test('parry exposure is active at ticks 0 and 32 then ends at tick 33',()=>{
  assert.equal(parryExposureAt(100,100),true);assert.equal(parryExposureAt(100,132),true);assert.equal(parryExposureAt(100,133),false);
  let ticks=advanceParryExposure(0,true);assert.equal(ticks,33);
  for(let elapsed=1;elapsed<=32;elapsed+=1){ticks=advanceParryExposure(ticks,false);assert.equal(ticks,33-elapsed);}
  ticks=advanceParryExposure(ticks,false);assert.equal(ticks,0);
});

test('manifest movement speed distance and recovery independently change runtime outcomes',()=>{
  const base={movement:'away-strafe-160',distance:360,recoveryMs:700};
  const runtime=bossManifestPatternRuntime(base,2);
  assert.deepEqual(runtime,{movement:'away-strafe',speed:160,distance:360,recoveryTicks:42,projectileSpeed:179.2,projectileLife:360/179.2});
  assert.notEqual(bossManifestPatternRuntime({...base,movement:'stationary'},2).movement,runtime.movement);
  assert.notEqual(bossManifestPatternRuntime({...base,movement:'away-strafe-200'},2).speed,runtime.speed);
  assert.notEqual(bossManifestPatternRuntime({...base,distance:420},2).projectileLife,runtime.projectileLife);
  assert.notEqual(bossManifestPatternRuntime({...base,recoveryMs:900},2).recoveryTicks,runtime.recoveryTicks);
});

test('render shake resolver respects the option and consumes magnitude through injected visual rng',()=>{
  assert.deepEqual(resolveShakeOffset({enabled:false,magnitude:12,random:()=>.75}),{x:0,y:0});
  assert.deepEqual(resolveShakeOffset({enabled:true,magnitude:0,random:()=>.75}),{x:0,y:0});
  assert.deepEqual(resolveShakeOffset({enabled:true,magnitude:12,random:()=>.75}),{x:6,y:6});
});

test('adaptation is consumed only after an adapted attack entity is created',()=>{
  const armed={bossId:'chariot',counterNext:true,consecutiveParries:2,lastParryTick:100};
  assert.deepEqual(consumeAdaptationAfterSpawn(armed,{adapted:true},null),armed);
  assert.deepEqual(consumeAdaptationAfterSpawn(armed,{adapted:true},{id:'projectile'}),{...armed,counterNext:false,consecutiveParries:0});
});


test('parry miss and boss defense multipliers expose exact combat penalties', () => {
  assert.deepEqual(parryMissPenalty({ baseCooldownTicks: 54 }), { exposedTicks: 33, damageMultiplier: 1.35, cooldownTicks: 87 });
  assert.equal(bossDamageMultiplier('aeneas'), .05);
  assert.equal(bossDamageMultiplier('aeneas', { guardBrokenTicks: 1 }), 1);
  assert.equal(bossDamageMultiplier('sarpedon', { invulnerable: true }), 0);
  assert.equal(bossDamageMultiplier('hector'), 1);
});

test('all seven bosses expose distinct fixed-tick mechanics', () => {
  const expected = {
    paris: { state: 'stealth', stealthTicks: 48, projectileSpeedMultiplier: 1.45 },
    sarpedon: { state: 'airborne', airborneTicks: 48, landingTelegraphTicks: 36, defenseTag: 'dodgeOnly' },
    chariot: { state: 'windup', windupTicks: 42, chargeTicks: 51, retreatTicks: 30 },
    aeneas: { state: 'guard', damageMultiplier: .05, guardBreakTicks: 120 },
    penthesilea: { state: 'windup', shortTicks: 24, longTicks: 48, redirectTick: 12 },
    memnon: { state: 'corridor', minimumCorridorWidth: 60 },
    hector: { state: 'combo', combo: ['parryable', 'dodgeOnly', 'parryable'] },
  };
  for (const [bossId, subset] of Object.entries(expected)) {
    const actual = bossPatternProfile(bossId, { seed: 7, playerDiameter: 48, phase: 1 });
    assert.deepEqual(Object.fromEntries(Object.keys(subset).map(key => [key, actual[key]])), subset);
  }
});

test('boss projectile phase scaling is monotonic and paris poison is exact refresh-not-stack', () => {
  assert.deepEqual([1, 2, 3].map(phaseProjectileMultiplier), [1, 1.12, 1.25]);
  let poison = applyPoisonHit(null, { tick: 0, bossDamage: 100, eventId: 'p1' });
  let hp = 100;
  for (let tick = 1; tick <= 36; tick++) ({ state: poison, hp } = tickPoison(poison, tick, hp));
  assert.equal(hp, 76);
  poison = applyPoisonHit(poison, { tick: 36, bossDamage: 100, eventId: 'p2' });
  assert.equal(poison.stacks, 1);
  for (let tick = 37; tick <= 96; tick++) ({ state: poison, hp } = tickPoison(poison, tick, hp));
  assert.equal(hp, 36);
  assert.equal(poison.active, false);
});

test('every boss adapts after two parries in 300 ticks and resets on dodge or expiry', () => {
  for (const bossId of ['paris','sarpedon','chariot','aeneas','penthesilea','memnon','hector']) {
    let state = createBossAdaptation(bossId);
    state = applyBossParryResult(state, { type: 'parry', tick: 10 });
    state = applyBossParryResult(state, { type: 'parry', tick: 310 });
    assert.equal(adaptBossIntent(state, { defenseTag: 'parryable' }, 310).defenseTag, 'dodgeOnly');
    assert.equal(adaptBossIntent(state, { defenseTag: 'parryable' }, 310).counter, false);
    state = applyBossParryResult(state, { type: 'dodge', tick: 311 });
    assert.equal(adaptBossIntent(state, { defenseTag: 'parryable' }, 311).defenseTag, 'parryable');
    state = applyBossParryResult(state, { type: 'parry', tick: 400 });
    state = applyBossParryResult(state, { type: 'parry', tick: 699 });
    assert.equal(adaptBossIntent(state, { defenseTag: 'parryable' }, 1000).defenseTag, 'parryable');
  }
});

test('boss relics and recovery are bounded and idempotent', () => {
  assert.equal(bossRelicDropCount({ boss: false, roll: 0 }), 0);
  assert.equal(bossRelicDropCount({ boss: true, roll: .249 }), 2);
  assert.equal(bossRelicDropCount({ boss: true, roll: .25 }), 1);
  const ledger = createRecoveryLedger();
  assert.equal(consumeFleeceHeal(ledger, { eventId: 'elite-1', elite: true, relicLevel: 2 }), 5);
  assert.equal(consumeFleeceHeal(ledger, { eventId: 'elite-1', elite: true, relicLevel: 2 }), 0);
  assert.equal(consumeFleeceHeal(ledger, { eventId: 'boss-1', boss: true, relicLevel: 2 }), 7);
  assert.equal(consumeAmbrosiaHeal(ledger, { eventId: 'd1', tick: 10, damage: 300, boss: true }), 2);
  assert.equal(consumeAmbrosiaHeal(ledger, { eventId: 'd1', tick: 10, damage: 300, boss: true }), 0);
  assert.equal(consumeAmbrosiaHeal(ledger, { eventId: 'd2', tick: 69, damage: 100, elite: true }), 0);
  assert.equal(consumeAmbrosiaHeal(ledger, { eventId: 'd3', tick: 70, damage: 100, elite: true }), 2);
});

test('late enemy cadence, feint buckets, and projectile speed are deterministic and capped', () => {
  assert.equal(enemyAttackTiming({ bucket: 14, seconds: 480 }).feint, true);
  assert.equal(enemyAttackTiming({ bucket: 15, seconds: 480 }).feint, false);
  assert.equal(Array.from({ length: 200 }, (_, bucket) => enemyAttackTiming({ bucket, seconds: 480 }).feint).filter(Boolean).length, 30);
  assert.deepEqual(enemyAttackTiming({ bucket: 2, seconds: 600 }), enemyAttackTiming({ bucket: 2, seconds: 600 }));
  assert.equal(enemyAttackTiming({ bucket: 2, seconds: 300 }).cadenceMultiplier, .72);
  assert.equal(enemyAttackTiming({ bucket: 3, seconds: 300 }).cadenceMultiplier, 1.28);
  assert.equal(enemyAttackTiming({ bucket: 2, seconds: 1200 }).projectileSpeedMultiplier, 1.4);
  assert.equal(Array.from({length:100},(_,attackOrdinal)=>enemyAttackTiming({seed:19,attackOrdinal,seconds:480}).feint).filter(Boolean).length,15);
  assert.notDeepEqual(enemyAttackTiming({seed:19,attackOrdinal:0,seconds:479}),enemyAttackTiming({seed:19,attackOrdinal:1,seconds:480}));
});
