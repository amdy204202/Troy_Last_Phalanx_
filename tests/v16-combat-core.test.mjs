import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AttackIntentScheduler,
  createAttackIntent,
  telegraphForIntent,
} from '../js/attack-intent-v16.js';
import {
  HERO_DOCTRINES,
  createDefenseState,
  createPresentationQueue,
  defenseTransitionCommands,
  entityAuditSnapshot,
  requestDefense,
  resolveDefenseImpact,
  stepDefense,
} from '../js/defense-doctrine-v16.js';
import {
  ACTIONS,
  canonicalJson,
  createRootSeed,
  deriveSeedStreams,
  parseTape,
  recordTapeAction,
  runCombatReplay,
  serializeTape,
} from '../js/replay-v16.js';

function intent(overrides = {}) {
  return createAttackIntent({
    sourceKind: 'melee', defenseTag: 'parryable', origin: { x: 40, y: 0 },
    direction: Math.PI, range: 80, impactAt: 8, threat: 'high',
    telegraphId: 'telegraph-1', impactId: 'impact-1', damage: 20, ...overrides,
  });
}

test('attack intent is immutable, complete, and rejects unknown tags without applying damage', () => {
  const attack = intent();
  assert.ok(Object.isFrozen(attack));
  assert.ok(Object.isFrozen(attack.origin));
  assert.throws(() => createAttackIntent({ ...attack, defenseTag: 'velocity-fallback' }), /defenseTag.*velocity-fallback/);
  assert.equal(createAttackIntent({ ...attack, defenseTag: 'velocity-fallback' }, { mode: 'production' }), null);
});

test('telegraph and impact share geometry and non-color defense shape', () => {
  const attack = intent({ defenseTag: 'dodgeOnly', direction: 1.25, range: 172 });
  const telegraph = telegraphForIntent(attack);
  assert.equal(telegraph.telegraphId, attack.telegraphId);
  assert.equal(telegraph.impactId, attack.impactId);
  assert.equal(telegraph.direction, 1.25);
  assert.equal(telegraph.range, 172);
  assert.equal(telegraph.shape, 'split-chevron');
});

test('scheduler limits committed high threats to one boss and one normal slot', () => {
  const scheduler = new AttackIntentScheduler();
  for (let index = 0; index < 2; index += 1) scheduler.schedule(intent({ sourceKind: 'boss', telegraphId: `b${index}`, impactId: `bi${index}` }));
  for (let index = 0; index < 3; index += 1) scheduler.schedule(intent({ sourceKind: 'melee', telegraphId: `n${index}`, impactId: `ni${index}` }));
  scheduler.advance(7);
  const committed = scheduler.snapshot().filter(entry => entry.state === 'committed');
  assert.equal(committed.filter(entry => entry.slot === 'boss').length, 1);
  assert.equal(committed.filter(entry => entry.slot === 'normal').length, 1);
});

test('cancelled telegraph never creates a delayed impact', () => {
  const scheduler = new AttackIntentScheduler();
  scheduler.schedule(intent());
  scheduler.advance(4);
  assert.equal(scheduler.cancel('telegraph-1'), true);
  assert.deepEqual(scheduler.advance(20), []);
  assert.equal(scheduler.snapshot()[0].state, 'cancelled');
});

test('three hero doctrines retain the exact eleven measured values', () => {
  assert.deepEqual(HERO_DOCTRINES, {
    hoplite: { parry: { startupMs: 90, activeMs: 220, recoveryMs: 300, coneDeg: 150, counter: 1, successStunRadius: 180, successStunMs: 450 }, dodge: { startupMs: 70, activeMs: 240, recoveryMs: 300, distance: 150, recoveryReductionMs: 0, attackSpeedMultiplier: 1, attackSpeedMs: 0 } },
    swordsman: { parry: { startupMs: 70, activeMs: 140, recoveryMs: 220, coneDeg: 80, counter: 1.8, successStunRadius: 0, successStunMs: 120 }, dodge: { startupMs: 50, activeMs: 180, recoveryMs: 220, distance: 120, recoveryReductionMs: 40, attackSpeedMultiplier: 1, attackSpeedMs: 0 } },
    archer: { parry: { startupMs: 85, activeMs: 170, recoveryMs: 250, coneDeg: 110, counter: .75, successStunRadius: 0, successStunMs: 0 }, dodge: { startupMs: 45, activeMs: 280, recoveryMs: 240, distance: 220, recoveryReductionMs: 0, attackSpeedMultiplier: 1.25, attackSpeedMs: 750 } },
  });
});

test('one selected roster hero is the only rendered and damage-target entity', () => {
  assert.deepEqual(entityAuditSnapshot({ selectedHero: 'archer' }), {
    rosterHeroes: 3, activeHero: 'archer', playerRender: 1, hitTarget: 1, followerHero: 0,
  });
});

test('parry and dodge resolve on fixed ticks and presentation fires exactly once per impact/action', () => {
  let parry = requestDefense(createDefenseState('hoplite'), 'parry', 0);
  parry = stepDefense(parry, 6, 60);
  const parried = resolveDefenseImpact(parry, intent(), { tick: 6, facing: 0 });
  assert.equal(parried.outcome, 'parried');
  assert.equal(parried.counterDamage, 20);
  const queue = createPresentationQueue();
  assert.equal(queue.consume(parried.commands).length, 5);
  assert.equal(queue.consume(parried.commands).length, 0);

  let dodge = requestDefense(createDefenseState('archer'), 'dodge', 0, { x: 1, y: 0 });
  dodge = stepDefense(dodge, 3, 60);
  const dodged = resolveDefenseImpact(dodge, intent({ defenseTag: 'dodgeOnly', impactId: 'dodge-hit' }), { tick: 3, facing: 0 });
  assert.equal(dodged.outcome, 'dodged');
  assert.equal(dodged.damage, 0);
});

test('animation/render fps do not alter fixed-tick combat outcome', () => {
  const run = fps => {
    let state = requestDefense(createDefenseState('swordsman'), 'parry', 0);
    state = stepDefense(state, 5, 1000 / fps);
    const result = resolveDefenseImpact(state, intent(), { tick: 5, facing: 0 });
    return JSON.stringify({ outcome: result.outcome, damage: result.damage, counterDamage: result.counterDamage });
  };
  assert.equal(run(30), run(60));
  assert.equal(run(60), run(144));
});

test('canonical tape, root seed, split streams and replay are deterministic', () => {
  const material = { schema: 16, mode: 'campaign', utcDate: '2026-08-31', hero: 'shield', difficulty: 'heroic', curses: ['fire', 'armor'], inputSeed: 'study' };
  const root = createRootSeed(material);
  assert.equal(root, 'b274df26cfdb4031');
  const streams = deriveSeedStreams(root);
  assert.equal(new Set(Object.values(streams)).size, 4);
  let tape = [];
  tape = recordTapeAction(tape, 1, ACTIONS.MOVE, { y: 0, x: 1.1234567 });
  tape = recordTapeAction(tape, 7, ACTIONS.DEFENSE_PARRY, { hero: 'swordsman' });
  const text = serializeTape(tape);
  assert.equal(text.split('\n')[0], '{"action":"MOVE","payload":{"x":1.123457,"y":0},"tick":1}');
  assert.deepEqual(parseTape(text), tape);
  const variants = [30, 60, 144].flatMap(fps => ['low', 'high'].map(quality => runCombatReplay({ rootSeed: root, tape, fps, quality })));
  assert.equal(new Set(variants.map(JSON.stringify)).size, 1);
  const changed = recordTapeAction(tape, 8, ACTIONS.DEFENSE_DODGE, { hero: 'swordsman' });
  assert.notDeepEqual(runCombatReplay({ rootSeed: root, tape }), runCombatReplay({ rootSeed: root, tape: changed }));
});

test('tape rejects decreasing ticks and unknown actions', () => {
  assert.throws(() => recordTapeAction([{ tick: 2, action: ACTIONS.MOVE, payload: {} }], 1, ACTIONS.MOVE, {}), /monotonic/);
  assert.throws(() => recordTapeAction([], 1, 'CHEAT', {}), /unknown action/);
});

test('attack intent reports every invalid contract branch and normalizes optional geometry', () => {
  assert.throws(() => createAttackIntent(undefined), /missing sourceKind/);
  assert.throws(() => createAttackIntent({ ...intent(), sourceKind: 'dragon' }, { mode: 'development', file: 'spawn.js', callsite: 12 }), /spawn\.js:12/);
  assert.throws(() => createAttackIntent({ ...intent(), threat: 'critical' }), /threat.*critical/);
  assert.throws(() => createAttackIntent({ ...intent(), origin: { x: NaN, y: 0 } }), /origin/);
  assert.throws(() => createAttackIntent({ ...intent(), origin: { x: 0, y: Infinity } }), /origin/);
  assert.throws(() => createAttackIntent({ ...intent(), impactAt: -1 }), /impactAt/);
  assert.throws(() => createAttackIntent({ ...intent(), impactAt: 1.5 }), /impactAt/);
  const normalized = createAttackIntent({ ...intent(), direction: NaN, range: -2, radius: -1, damage: 'not-a-number' });
  assert.deepEqual({ direction: normalized.direction, range: normalized.range, radius: normalized.radius, damage: normalized.damage }, { direction: 0, range: 0, radius: 0, damage: 0 });
  assert.equal(createAttackIntent({ ...intent(), sourceKind: 'unknown' }, { mode: 'production' }), null);
});

test('scheduler rejects mutable and duplicate intents and covers low, impacted, and monotonic states', () => {
  const scheduler = new AttackIntentScheduler();
  assert.throws(() => scheduler.schedule({}), /immutable/);
  scheduler.schedule(intent({ threat: 'low', impactAt: 3 }));
  assert.throws(() => scheduler.schedule(intent({ telegraphId: 'telegraph-1', impactId: 'different' })), /duplicate/);
  assert.throws(() => scheduler.schedule(intent({ telegraphId: 'different', impactId: 'impact-1' })), /duplicate/);
  assert.deepEqual(scheduler.advance(2), []);
  assert.equal(scheduler.snapshot()[0].state, 'committed');
  assert.equal(scheduler.advance(3).length, 1);
  assert.equal(scheduler.cancel('telegraph-1'), false);
  assert.equal(scheduler.cancel('missing'), false);
  assert.throws(() => scheduler.advance(2), /monotonic/);
  assert.throws(() => scheduler.advance(3.5), /monotonic/);

  const high = new AttackIntentScheduler();
  high.schedule(intent({ impactAt: 20 }));
  high.advance(1);
  high.advance(2);
  assert.equal(high.snapshot()[0].state, 'committed');
});

test('defense covers startup, recovery, ready, invalid selection and all hit branches', () => {
  assert.throws(() => createDefenseState('mage'), /unknown hero/);
  assert.throws(() => requestDefense(createDefenseState('hoplite'), 'block', 0), /unknown defense action/);
  let state = requestDefense(createDefenseState('hoplite'), 'parry', 0);
  assert.equal(requestDefense(state, 'dodge', 1), state);
  assert.equal(stepDefense(state, 1).phase, 'startup');
  assert.equal(stepDefense(state, 20).phase, 'recovery');
  assert.equal(stepDefense(state, 40).phase, 'ready');
  assert.equal(stepDefense(createDefenseState('hoplite'), 8).phase, 'ready');

  state = stepDefense(state, 6);
  assert.equal(resolveDefenseImpact(state, intent({ defenseTag: 'unavoidable' })).outcome, 'hit');
  assert.equal(resolveDefenseImpact(createDefenseState('hoplite'), intent()).outcome, 'hit');
  assert.equal(resolveDefenseImpact(state, intent({ origin: { x: -40, y: 0 } }), { facing: 0 }).outcome, 'hit');
  assert.equal(resolveDefenseImpact(state, intent({ defenseTag: 'dodgeOnly' })).outcome, 'hit');
  const reflected = resolveDefenseImpact(state, intent({ defenseTag: 'reflectable' }));
  assert.equal(reflected.outcome, 'parried');
  assert.equal(reflected.reflected, true);
  assert.throws(() => entityAuditSnapshot({ selectedHero: 'mage' }), /unknown hero/);
});

test('canonical replay handles arrays, non-finite numbers, empty tape and absent curses', () => {
  assert.equal(canonicalJson({ z: [Infinity, 2], a: 'x' }), '{"a":"x","z":[null,2]}');
  const root = createRootSeed({ schema: 16, mode: 'test', utcDate: '2026-08-31', hero: 'hoplite', difficulty: 'bronze', inputSeed: 'none' });
  assert.match(root, /^[0-9a-f]{16}$/);
  assert.deepEqual(parseTape('   '), []);
  assert.equal(recordTapeAction([], 0, ACTIONS.MOVE)[0].payload && Object.keys(recordTapeAction([], 0, ACTIONS.MOVE)[0].payload).length, 0);
  assert.throws(() => recordTapeAction([], -1, ACTIONS.MOVE, {}), /non-negative/);
  assert.throws(() => recordTapeAction([], 1.2, ACTIONS.MOVE, {}), /integer/);
});

test('dodge lifecycle emits visible start, movement, invulnerability end, and finish commands once', () => {
  const ready = createDefenseState('archer');
  const startup = requestDefense(ready, 'dodge', 10, { x: 1, y: 0 });
  const active = stepDefense(startup, 13);
  const recovery = stepDefense(startup, 31);
  const finished = stepDefense(startup, 46);
  const commands = [
    ...defenseTransitionCommands(ready, startup, 'dodge-10'),
    ...defenseTransitionCommands(startup, active, 'dodge-10'),
    ...defenseTransitionCommands(active, recovery, 'dodge-10'),
    ...defenseTransitionCommands(recovery, finished, 'dodge-10'),
  ];
  assert.deepEqual(commands.map(command => command.type), [
    'dodge-start-pose', 'dust-vfx', 'dodge-start-sfx', 'hud-mark',
    'dodge-movement-clip', 'dodge-invuln-end', 'dodge-end-pose', 'dodge-end-sfx', 'hud-mark',
  ]);
  const queue = createPresentationQueue();
  assert.equal(queue.consume(commands).length, 9);
  assert.equal(queue.consume(commands).length, 0);
});
