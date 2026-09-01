import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { BOSS_STATES, createBossState, reduceBoss, createPatternIntents, runBossReplay, safeDestination } from '../js/boss-fsm-v16.js';

const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, '../assets/bosses/troy-boss-fsm-v16.json'), 'utf8'));

test('manifest enumerates seven bosses, three patterns each and all seven FSM states', () => {
  assert.equal(manifest.bosses.length, 7);
  assert.equal(manifest.bosses.flatMap(boss => boss.patterns).length, 21);
  assert.deepEqual(BOSS_STATES, ['approach','windup','attack','recovery','enrage','stagger','dead']);
});

test('damage ids and 70/40 enrage boundaries are exactly once', () => {
  let state = createBossState({ bossId: 'paris', maxHp: 100 });
  for (const event of [{id:'a',damage:29},{id:'b',damage:2},{id:'b',damage:2},{id:'c',damage:28},{id:'d',damage:2},{id:'d',damage:2}]) state = reduceBoss(state, { type: 'damage', ...event }, manifest);
  assert.equal(state.hp, 39);
  assert.deepEqual(state.crossedBoundaries, [70,40]);
  assert.equal(state.log.filter(entry => entry.type === 'enrage').length, 2);
  assert.equal(state.log.filter(entry => entry.type === 'next-pattern').length, 2);
});

test('Hector final combo emits three unique sub-intents on fixed ticks and tags', () => {
  const intents = createPatternIntents({ bossId:'hector', patternId:'last-combo', instanceId:'combo-7', startTick:200, origin:{x:400,y:300} }, manifest);
  assert.deepEqual(intents.map(intent => [intent.impactId,intent.defenseTag,intent.telegraphAt,intent.impactAt]), [
    ['combo-7:1','parryable',200,254], ['combo-7:2','parryable',236,272], ['combo-7:3','dodgeOnly',272,308],
  ]);
  assert.equal(new Set(intents.map(intent => intent.impactId)).size, 3);
});

test('safe destinations enforce viewport inset and player distance', () => {
  assert.equal(safeDestination({x:50,y:50},{width:1000,height:600},{x:500,y:300},72), false);
  assert.equal(safeDestination({x:500,y:300},{width:1000,height:600},{x:500,y:300},72), false);
  assert.equal(safeDestination({x:596,y:300},{width:1000,height:600},{x:500,y:300},72), true);
});

test('replay canonical state is invariant across frame rate and quality', () => {
  const tape = [{tick:1,type:'select-pattern'},{tick:2,type:'damage',id:'x',damage:31},{tick:80,type:'step'},{tick:90,type:'damage',id:'y',damage:31}];
  const outputs = [30,60,144].flatMap(fps => ['low','high'].map(quality => runBossReplay({ bossId:'hector', seed:77, tape, fps, quality, manifest })));
  assert.equal(new Set(outputs).size, 1);
});

test('boss reducer covers regular intent, stagger/recovery/death and invalid ids',()=>{
 assert.throws(()=>createBossState({bossId:'none'})&&createPatternIntents({bossId:'none',patternId:'x',instanceId:'x',startTick:0,origin:{x:0,y:0}},manifest),/unknown boss/);
 assert.throws(()=>createPatternIntents({bossId:'paris',patternId:'none',instanceId:'x',startTick:0,origin:{x:0,y:0}},manifest),/unknown pattern/);
 const regular=createPatternIntents({bossId:'paris',patternId:'retreat-shot',instanceId:'p1',startTick:10,origin:{x:1,y:2}},manifest);assert.equal(regular.length,1);assert.equal(regular[0].defenseTag,'reflectable');
 let state=createBossState({bossId:'paris'});state=reduceBoss(state,{type:'stagger',tick:4},manifest);assert.equal(state.state,'stagger');state=reduceBoss(state,{type:'step',tick:5},manifest);assert.equal(state.state,'recovery');state=reduceBoss(state,{type:'step',tick:6},manifest);assert.equal(state.state,'approach');assert.equal(reduceBoss(state,{type:'noop'},manifest),state);
 state=reduceBoss(state,{type:'damage',id:'kill',damage:999},manifest);assert.equal(state.state,'dead');assert.equal(reduceBoss(state,{type:'step'},manifest),state);
});
