import test from 'node:test';
import assert from 'node:assert/strict';

import { AttackIntentScheduler, createAttackIntent } from '../js/attack-intent-v16.js';
import { createDefenseState, requestDefense, resolveDefenseImpact } from '../js/defense-doctrine-v16.js';
import { defenseImpactContext, defenseStatusSnapshot, projectileIntercept, projectileTerminalEvent, resolveSpatialEvade } from '../js/rich-integration-v16.js';

const intent = (overrides = {}) => createAttackIntent({
  sourceKind: 'projectile', defenseTag: 'reflectable', origin: { x: 100, y: 0 },
  impactAt: 10, threat: 'low', telegraphId: 'telegraph-1', impactId: 'impact-1', damage: 20,
  ...overrides,
});

test('parry angle is invariant when player and origin translate together', () => {
  const active = requestDefense(createDefenseState('hoplite'), 'parry', 0);
  const a = resolveDefenseImpact(active, intent({ origin: { x: 100, y: 0 } }), { tick: 7, facing: 0, player: { x: 0, y: 0 } });
  const b = resolveDefenseImpact(active, intent({ origin: { x: -700, y: 800 }, telegraphId: 't2', impactId: 'i2' }), { tick: 7, facing: 0, player: { x: -800, y: 800 } });
  assert.equal(a.outcome, 'parried');
  assert.equal(b.outcome, 'parried');
  const rear = resolveDefenseImpact(active, intent({ origin: { x: -100, y: 0 }, telegraphId: 't3', impactId: 'i3' }), { tick: 7, facing: 0, player: { x: 0, y: 0 } });
  assert.equal(rear.outcome, 'hit');
});

test('resolved, cancelled, and expired intent records leave active membership on the same tick', () => {
  const scheduler = new AttackIntentScheduler();
  scheduler.schedule(intent());
  assert.equal(scheduler.advance(10).length, 1);
  assert.deepEqual(scheduler.activeSnapshot(), []);

  const cancelled = new AttackIntentScheduler();
  cancelled.schedule(intent());
  assert.equal(cancelled.cancel('telegraph-1'), true);
  cancelled.advance(1);
  assert.deepEqual(cancelled.activeSnapshot(), []);

  const expired = new AttackIntentScheduler();
  expired.schedule(intent({ impactAt: 2 }));
  expired.advance(4);
  assert.deepEqual(expired.activeSnapshot(), []);
  assert.equal(expired.advance(120).length, 0);
});

test('a physical collision consumes the same reserved intent id exactly once', () => {
  const scheduler = new AttackIntentScheduler();
  scheduler.schedule(intent({ impactAt: 120 }));
  assert.equal(scheduler.consume('impact-1', 73)?.impactId, 'impact-1');
  assert.equal(scheduler.consume('impact-1', 74), null);
  assert.deepEqual(scheduler.activeSnapshot(), []);
  assert.equal(scheduler.snapshot().filter(record => record.impactId === 'impact-1' && record.state === 'impacted').length, 1);
});

test('V16 defense status exposes the remaining recovery from the fixed-tick state', () => {
  const ready = defenseStatusSnapshot(createDefenseState('hoplite'));
  assert.deepEqual(ready, { source: 'v16', mode: 'neutral', action: null, phase: 'ready', phaseElapsedMs: 0, phaseDurationMs: 0, cooldownTicks: 0 });
  const requested = requestDefense(createDefenseState('hoplite'), 'parry', 0);
  assert.equal(defenseStatusSnapshot(requested).phase, 'startup');
  assert.equal(defenseStatusSnapshot({ ...requested, tick: 6 }).phase, 'active');
  const status = defenseStatusSnapshot({ ...requested, tick: 33 });
  assert.equal(status.source, 'v16');
  assert.equal(status.mode, 'parry');
  assert.equal(status.action, 'parry');
  assert.equal(status.phase, 'recovery');
  assert.ok(status.cooldownTicks > 0);
  assert.ok(status.phaseElapsedMs >= 0);
});

test('hostile projectile reserves only a relative-velocity collision course', () => {
  const direct = projectileIntercept({ projectile: { x: 180, y: 0, vx: -600, vy: 0, r: 6 }, player: { x: 0, y: 0, vx: 0, vy: 0, r: 14, aim: 0 } });
  assert.deepEqual(direct, { collisionCourse: true, timeToClosestTicks: 18, closestApproach: 0, sourceBearing: 0, playerAim: 0, angleDelta: 0 });
  const crossingMiss = projectileIntercept({ projectile: { x: 180, y: 40, vx: -600, vy: 0, r: 6 }, player: { x: 0, y: 0, vx: 0, vy: 0, r: 14, aim: 0 } });
  assert.equal(crossingMiss.collisionCourse, false);
  assert.equal(crossingMiss.closestApproach, 40);
  const receding = projectileIntercept({ projectile: { x: 40, y: 0, vx: 600, vy: 0, r: 6 }, player: { x: 0, y: 0, vx: 0, vy: 0, r: 14, aim: 0 } });
  assert.equal(receding.collisionCourse, false);
});

test('projectile terminal evidence has one canonical bounded lifecycle record', () => {
  assert.deepEqual(projectileTerminalEvent({ tick: 81, impactId: 'projectile:7', reason: 'shield-block', defensePhase: 'active', sourceBearing: 1, playerAim: .75, closestApproach: 12.34567 }), {
    type: 'shield-block', tick: 81, impactId: 'projectile:7', defensePhase: 'active', sourceBearing: 1, playerAim: .75, angleDelta: .25, closestApproach: 12.346,
  });
  assert.throws(() => projectileTerminalEvent({ tick: 1, impactId: 'x', reason: 'unknown', defensePhase: 'ready', sourceBearing: 0, playerAim: 0, closestApproach: 0 }), /terminal reason/);
});

test('impact resolution keeps requested parry facing and uses the projectile collision origin', () => {
  const requested = requestDefense(createDefenseState('hoplite'), 'parry', 10, { x: 0, y: 1 });
  assert.deepEqual(defenseImpactContext(requested, { x: 4, y: 22 }, { x: 4, y: 2, aim: -2 }), {
    facing: Math.PI / 2, player: { x: 4, y: 2 }, origin: { x: 4, y: 22 },
  });
});

test('dodgeOnly displacement resolves only when the same dodge leaves a telegraphed volume', () => {
  const defense = { ...requestDefense(createDefenseState('hoplite'), 'dodge', 100, { x: 1, y: 0 }), phase: 'active', tick: 108 };
  const base = { intent: intent({ impactId: 'hazard:1', defenseTag: 'dodgeOnly' }), defense, dodgeStart: { tick: 100, x: 0, y: 0 }, hazard: { x: 0, y: 0, r: 30 }, playerRadius: 14, tick: 108 };
  assert.deepEqual(resolveSpatialEvade({ ...base, player: { x: 80, y: 0 } }), { outcome: 'dodged', playerDamage: 0, evadeKind: 'displacement' });
  assert.equal(resolveSpatialEvade({ ...base, dodgeStart: { tick: 99, x: 0, y: 0 }, player: { x: 80, y: 0 } }).outcome, 'miss');
  assert.equal(resolveSpatialEvade({ ...base, dodgeStart: { tick: 100, x: 80, y: 0 }, player: { x: 100, y: 0 } }).outcome, 'miss');
  assert.equal(resolveSpatialEvade({ ...base, player: { x: 20, y: 0 } }).outcome, 'miss');
});
