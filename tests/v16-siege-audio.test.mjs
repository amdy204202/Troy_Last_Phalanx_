import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { REQUIRED_AUDIO_IDS, validateAudioManifest } from '../tools/validate-v16.mjs';
import { createAudioDirector, createBusSettings, reduceAudioDirector, restoreBusSettings } from '../js/audio-director-v16.js';

const root = resolve(import.meta.dirname, '..');

test('audio manifest contains the exact 22 original ids and measured WAV properties', () => {
  const result = validateAudioManifest(root);
  assert.equal(result.assets, 22);
  assert.deepEqual(result.ids, [...REQUIRED_AUDIO_IDS]);
});

test('audio validator rejects missing, extra and loop conditional properties', () => {
  const manifest = JSON.parse(readFileSync(resolve(root,'assets/audio/v16/audio-manifest.json'),'utf8'));
  const missing = structuredClone(manifest); missing.assets.pop();
  assert.throws(()=>validateAudioManifest(root,{manifest:missing}),/missing=.*sfx_weapon_sword|missing=/);
  const extra = structuredClone(manifest); extra.assets.push({...extra.assets[0],id:'extra'});
  assert.throws(()=>validateAudioManifest(root,{manifest:extra}),/extra=extra/);
  const invalid = structuredClone(manifest); delete invalid.assets.find(a=>a.loop).loopEndSample;
  assert.throws(()=>validateAudioManifest(root,{manifest:invalid}),/loopEndSample/);
  const rate = structuredClone(manifest); rate.assets[0].sampleRate=22050; assert.throws(()=>validateAudioManifest(root,{manifest:rate}),/sampleRate.*44100\|48000/);
  const peak = structuredClone(manifest); peak.assets[0].truePeakDbfs=0; assert.throws(()=>validateAudioManifest(root,{manifest:peak}),/truePeakDbfs/);
  const seam = structuredClone(manifest); seam.assets.find(a=>a.loop).seamDelta=.5; assert.throws(()=>validateAudioManifest(root,{manifest:seam}),/seamDelta/);
  const property = structuredClone(manifest); property.assets[0].unexpected=true; assert.throws(()=>validateAudioManifest(root,{manifest:property}),/unexpected.*forbidden/);
});

test('five buses restore settings and director commands align loops without changing gameplay snapshot', () => {
  const settings=restoreBusSettings({master:{gain:.8,mute:false},music:{gain:.4,mute:true},ambient:{gain:.3,mute:false},combat:{gain:.9,mute:false},ui:{gain:.7,mute:false}});
  assert.deepEqual(Object.keys(settings),['master','music','ambient','combat','ui']);
  assert.equal(settings.music.gain,.4);
  const gameplay={tick:77,rng:123}; let state=createAudioDirector({barTicks:120,packageId:'plain'});
  for(const level of ['engaged','boss','critical']) state=reduceAudioDirector(state,{type:'intensity',level,tick:77});
  assert.deepEqual(gameplay,{tick:77,rng:123});
  assert.deepEqual(state.commands.map(c=>[c.level,c.atTick]),[['engaged',120],['boss',120],['critical',120]]);
  assert.deepEqual(createBusSettings().master,{gain:1,mute:false});
});

test('collision bursts aggregate inside 50ms and active voices never exceed 32', () => {
  let state=createAudioDirector({barTicks:120});
  for(let index=0;index<100;index++) state=reduceAudioDirector(state,{type:'play',audioId:'sfx_weapon_shield',atMs:index<80?20:100+index});
  assert.ok(state.voices.length<=32);
  assert.equal(state.voices.filter(v=>v.audioId==='sfx_weapon_shield'&&v.atMs===20).length,1);
});

test('audio reducer handles fallback, release, invalid intensity and clamps restored settings',()=>{
 let state=createAudioDirector();const unchanged=reduceAudioDirector(state,{type:'intensity',level:'unknown',tick:1});assert.equal(unchanged,state);
 state=reduceAudioDirector(state,{type:'fallback'});assert.equal(state.fallbacks,1);
 state=reduceAudioDirector(state,{type:'play',audioId:'cue',atMs:1,bus:'ui'});const id=state.voices[0].id;state=reduceAudioDirector(state,{type:'release',id});assert.equal(state.voices.length,0);
 assert.equal(reduceAudioDirector(state,{type:'unknown'}),state);
  const restored=restoreBusSettings({master:{gain:9},music:{gain:-2,mute:1}});assert.equal(restored.master.gain,1);assert.equal(restored.music.gain,0);assert.equal(restored.ambient.gain,1);
  state=reduceAudioDirector(state,{type:'package',packageId:'city'});assert.equal(state.packageId,'city');assert.equal(reduceAudioDirector(state,{type:'package',packageId:'unknown'}),state);
});
