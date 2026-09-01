import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createSiegeRuntime } from '../js/siege-adapter-v16.js';
import { summarizeBattle, hudLayout } from '../js/final-hud-v16.js';

const manifest=JSON.parse(readFileSync(resolve(import.meta.dirname,'../assets/bosses/troy-boss-fsm-v16.json'),'utf8'));

test('siege runtime schedules boss intents through one high slot and emits audio without awaiting it', () => {
  const calls=[];const runtime=createSiegeRuntime({manifest,audio:{play:(id)=>{calls.push(id);return Promise.reject(new Error('decode'));}}});
  runtime.spawnBoss('hector',{maxHp:100,seed:7});runtime.selectPattern(10);
  const snapshot=runtime.snapshot();
  assert.equal(snapshot.scheduler.filter(item=>item.slot==='boss'&&item.state==='committed').length<=1,true);
  assert.equal(calls.includes('cue_boss_intro'),true);
  assert.equal(snapshot.tick,10);
});

test('result report exactly aggregates event log counters', () => {
  const events=[{type:'defense',outcome:'parried'},{type:'defense',outcome:'dodged'},{type:'objective',outcome:'complete'},{type:'shop',outcome:'purchase'},{type:'boss-hit',patternId:'sun-beam'},{type:'audio-fallback'},{type:'frame',ms:12},{type:'frame',ms:20},{type:'frame',ms:40}];
  assert.deepEqual(summarizeBattle(events),{parries:1,dodges:1,objectives:1,purchases:1,bossHits:{'sun-beam':1},audioFallbacks:1,frameP99Ms:40,onePercentLowFps:25});
});

test('HUD keeps five critical regions visible and non-overlapping at minimum viewport', () => {
  const boxes=hudLayout(1024,576);assert.equal(boxes.length,5);for(const box of boxes)assert.ok(box.width>0&&box.height>0);
  for(let a=0;a<boxes.length;a++)for(let b=a+1;b<boxes.length;b++){const x=Math.max(0,Math.min(boxes[a].x+boxes[a].width,boxes[b].x+boxes[b].width)-Math.max(boxes[a].x,boxes[b].x));const y=Math.max(0,Math.min(boxes[a].y+boxes[a].height,boxes[b].y+boxes[b].height)-Math.max(boxes[a].y,boxes[b].y));assert.equal(x*y,0);}
});
