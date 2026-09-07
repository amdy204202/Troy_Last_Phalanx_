import {createLongScore} from './music-stream-v19.js';
import {createAudioDirector,createBusSettings,reduceAudioDirector,restoreBusSettings} from './audio-director-v16.js';
import {AUDIO_PATHS,AUDIO_CUES} from './audio-catalog-v171.js';

// One decoded-buffer mixer. Epochs invalidate async work across pause/restart;
// desiredLoops is authoritative even before a file finishes decoding.
export function createAudioAdapter({storage=globalThis.localStorage,Context=globalThis.AudioContext??globalThis.webkitAudioContext,fetchImpl=globalThis.fetch,now=()=>performance.now()}={}){
 let state=createAudioDirector(),context=null,buses=null,duckGain=null,settings=createBusSettings();
 let score=null;let errors=0,epoch=0,voiceEpoch=0,paused=false,scene='field',transport=0,duckUntil=0;
 const buffers=new Map(),loads=new Map(),loops=new Map(),pendingLoops=new Map(),desiredLoops=new Map(),voices=[];
 const recent=[],lastPlay=new Map(),eventCounts=new Map();let dropped=0,peakVoices=0;
 try{const saved=storage?.getItem('troy-v16-audio');if(saved)settings=restoreBusSettings(JSON.parse(saved))}catch{}
 const gainValue=name=>settings[name].mute?0:settings[name].gain;
 function fail(){errors++;state=reduceAudioDirector(state,{type:'fallback'});return false}
 function ensure(){
  try{
   if(!Context)return false;
   if(!context||context.state==='closed'){context=new Context();buses=null;transport=context.currentTime}
   if(!buses){
    buses={};for(const name of ['master','music','ambient','combat','ui']){const n=context.createGain();n.gain.value=gainValue(name);buses[name]=n}
    duckGain=context.createGain();duckGain.gain.value=1;buses.music.connect(duckGain);duckGain.connect(buses.master);
    for(const name of ['ambient','combat','ui'])buses[name].connect(buses.master);
    if(context.createDynamicsCompressor){const limiter=context.createDynamicsCompressor();limiter.threshold.value=-5;limiter.knee.value=6;limiter.ratio.value=12;limiter.attack.value=.003;limiter.release.value=.16;buses.master.connect(limiter);limiter.connect(context.destination)}
    else buses.master.connect(context.destination);
    if(typeof document!=='undefined'&&context.createMediaElementSource)score=createLongScore(context,buses.music);
   }return true;
  }catch{return fail()}
 }
 async function load(id){
  if(buffers.has(id))return buffers.get(id);if(loads.has(id))return loads.get(id);const audioContext=context;
  const task=(async()=>{const response=await fetchImpl(AUDIO_PATHS[id]??('assets/audio/v16/'+id+'.wav'));if(!response.ok)throw new Error(id+': '+response.status);const buffer=await audioContext.decodeAudioData(await response.arrayBuffer());buffers.set(id,buffer);return buffer})();
  loads.set(id,task);try{return await task}finally{if(loads.get(id)===task)loads.delete(id)}
 }
 function removeVoice(entry){const i=voices.indexOf(entry);if(i>=0)voices.splice(i,1);for(const node of entry.nodes)try{node.disconnect()}catch{}}
 function stopVoice(entry){try{entry.source.stop()}catch{}removeVoice(entry)}
 function makeRoom(priority){
  if(voices.length<24)return true;const victim=voices.reduce((a,b)=>a.priority<=b.priority?a:b);
  if(victim.priority>priority){dropped++;return false}stopVoice(victim);return true;
 }
 function duck(){if(!duckGain)return;const t=context.currentTime;duckUntil=Math.max(duckUntil,t+.38);const p=duckGain.gain;p.cancelScheduledValues(t);p.setTargetAtTime(.58,t,.025);p.setTargetAtTime(1,duckUntil,.23)}
 async function play(id,{atMs=now(),bus='combat',gain=1,priority=1,cooldownMs=90,pan=0,rate=1,duck:shouldDuck=false}={}){
  if(paused||gainValue('master')===0||gainValue(bus in settings?bus:'combat')===0)return false;
  if(atMs-(lastPlay.get(id)??-Infinity)<cooldownMs)return false;lastPlay.set(id,atMs);if(!ensure())return false;
  const token=epoch,voiceToken=voiceEpoch,requested=now();
  try{
   const buffer=await load(id);
   if(token!==epoch||voiceToken!==voiceEpoch||paused||now()-requested>500)return false;
   if(!makeRoom(priority))return false;
   const source=context.createBufferSource(),volume=context.createGain(),nodes=[source,volume];source.buffer=buffer;
   source.playbackRate.value=Math.max(.8,Math.min(1.2,rate));volume.gain.value=Math.max(0,Math.min(1,gain));source.connect(volume);
   if(context.createStereoPanner){const panner=context.createStereoPanner();panner.pan.value=Math.max(-.75,Math.min(.75,pan));volume.connect(panner);panner.connect(buses[bus]??buses.combat);nodes.push(panner)}else volume.connect(buses[bus]??buses.combat);
   const entry={source,nodes,priority,id};voices.push(entry);peakVoices=Math.max(peakVoices,voices.length);source.onended=()=>removeVoice(entry);source.start();
   state=reduceAudioDirector(state,{type:'play',audioId:id,atMs,bus});recent.push({id,bus,atMs,gain,pan});if(recent.length>80)recent.shift();eventCounts.set(id,(eventCounts.get(id)||0)+1);if(eventCounts.size>128)eventCounts.delete(eventCounts.keys().next().value);if(shouldDuck)duck();return true;
  }catch{return fail()}
 }
 function event(key,{x,y,listener,gain=1}={}){
  const cue=AUDIO_CUES[key];if(!cue)return Promise.resolve(false);let pan=0,attenuation=1;
  if(listener&&Number.isFinite(x)&&Number.isFinite(y)){const d=Math.hypot(x-listener.x,y-listener.y);if(d>1500&&cue.priority<4)return Promise.resolve(false);pan=(x-listener.x)/650;attenuation=Math.max(.14,1-d/1300)}
  if(cue.variants){const gate='event:'+key,time=now();if(time-(lastPlay.get(gate)??-Infinity)<cue.cooldownMs)return Promise.resolve(false);lastPlay.set(gate,time);}
  const variant=cue.variants?cue.variants[(eventCounts.get(cue.id)||0)%cue.variants.length]:cue.id;if(cue.variants)eventCounts.set(cue.id,(eventCounts.get(cue.id)||0)+1);return play(variant,{...cue,gain:cue.gain*gain*attenuation,pan});
 }
 function tone(frequency=220,duration=.06,type='triangle',gain=.08,bus='ui'){
  if(paused||gainValue('master')===0||!ensure()||!makeRoom(0))return false;
  try{const source=context.createOscillator(),volume=context.createGain(),t=context.currentTime,seconds=Math.max(.015,Number(duration)||.06);source.type=['sine','square','sawtooth','triangle'].includes(type)?type:'triangle';source.frequency.setValueAtTime(Math.max(30,Number(frequency)||220),t);volume.gain.setValueAtTime(Math.max(.0001,Math.min(.2,gain)),t);volume.gain.exponentialRampToValueAtTime(.0001,t+seconds);source.connect(volume);volume.connect(buses[bus]??buses.ui);const entry={source,nodes:[source,volume],priority:0,id:'tone'};voices.push(entry);source.onended=()=>removeVoice(entry);source.start();source.stop(t+seconds);return true}catch{return fail()}
 }
 async function prepareLoop(id){
  if(loops.has(id)||pendingLoops.get(id)===epoch||!ensure())return;const token=epoch;pendingLoops.set(id,token);
  try{
   const buffer=await load(id),wanted=desiredLoops.get(id);if(token!==epoch||!wanted||loops.has(id))return;
   const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;source.loop=true;gain.gain.value=0;source.connect(gain);gain.connect(buses[wanted.bus]);
   source.start(0,Math.max(0,context.currentTime-transport)%buffer.duration);gain.gain.setTargetAtTime(wanted.gain,context.currentTime,.45);loops.set(id,{source,gain,bus:wanted.bus,target:wanted.gain,retireAt:0});
  }catch{fail()}finally{if(pendingLoops.get(id)===token)pendingLoops.delete(id)}
 }
 function reconcile(){
  if(!ensure())return;const wanted=new Map();
  if(scene==='menu')wanted.set('music_menu',{bus:'music',gain:.5});
  else if(scene==='field'){
   const boss=['boss','critical'].includes(state.level);
   wanted.set(boss?'music_boss_base':'music_field_base',{bus:'music',gain:boss?.58:.54});
   // The long score already develops; short high-frequency danger loops are removed.

   wanted.set({shore:'ambient_shore_waves',plain:'ambient_plain_wind',city:'ambient_city_fire'}[state.packageId],{bus:'ambient',gain:state.packageId==='city'?.25:.6});
   if(!boss&&['engaged','highThreat'].includes(state.level))wanted.set('ambient_crowd_distant',{bus:'ambient',gain:.18});
  }
  if(score){const music=[...wanted].find(([id])=>id.startsWith('music_'));score.select(music?.[0]||null,music?.[1].gain);for(const[id]of wanted)if(id.startsWith('music_'))wanted.delete(id);}
  desiredLoops.clear();for(const[id,value]of wanted)desiredLoops.set(id,value);
  for(const[id,entry]of loops){const target=wanted.get(id)?.gain??0;entry.target=target;entry.retireAt=target?0:context.currentTime+3;entry.gain.gain.setTargetAtTime(target,context.currentTime,.45)}
  for(const id of desiredLoops.keys())void prepareLoop(id);
 }
 function startBattlefield(packageId='shore'){scene='field';state=reduceAudioDirector(state,{type:'package',packageId});reconcile()}
 function startMenu(){scene='menu';reconcile()}
 function setIntensity(level,tick=0){if(state.level===level)return;state=reduceAudioDirector(state,{type:'intensity',level,tick});reconcile()}
 function tick(){if(!context||paused)return;score?.tick();for(const[id,entry]of loops)if(entry.retireAt&&context.currentTime>=entry.retireAt){try{entry.source.stop();entry.source.disconnect();entry.gain.disconnect()}catch{}loops.delete(id)}}
 function setBus(name,value){if(!(name in settings))return;settings=restoreBusSettings({...settings,[name]:value});try{storage?.setItem('troy-v16-audio',JSON.stringify(settings))}catch{}if(buses?.[name])buses[name].gain.setTargetAtTime(gainValue(name),context.currentTime,.035)}
 async function pause(){paused=true;score?.pause();voiceEpoch++;for(const entry of [...voices])stopVoice(entry);try{if(context?.state==='running')await context.suspend();if(!paused&&context?.state==='suspended')await context.resume();return true}catch{return fail()}}
 async function resume(){paused=false;score?.resume();try{if(!ensure())return false;if(context.state==='suspended')await context.resume();if(paused&&context.state==='running')await context.suspend();return true}catch{return fail()}}
 async function stop({close=false,suspend=true}={}){
  epoch++;voiceEpoch++;paused=suspend;score?.stop();if(close){score?.close();score=null;}scene='none';desiredLoops.clear();pendingLoops.clear();lastPlay.clear();recent.length=0;eventCounts.clear();peakVoices=0;dropped=0;state=createAudioDirector();
  for(const entry of [...voices])stopVoice(entry);for(const entry of loops.values())try{entry.source.stop();entry.source.disconnect();entry.gain.disconnect()}catch{}loops.clear();
  if(context){transport=context.currentTime;duckUntil=0;duckGain.gain.cancelScheduledValues(context.currentTime);duckGain.gain.setValueAtTime(1,context.currentTime)}
  try{if(close&&context?.state!=='closed')await context?.close();else if(suspend)await pause();return true}catch{return fail()}
 }
 async function preload(ids=Object.values(AUDIO_CUES).flatMap(c=>c.variants||[c.id])){if(!ensure())return;await Promise.all(ids.map(id=>load(id).catch(()=>fail())))}
 return Object.freeze({play,event,tone,startBattlefield,startMenu,setIntensity,setBus,pause,resume,stop,tick,preload,snapshot:()=>({state,settings,uncaughtErrors:errors+(score?.snapshot().errors||0),score:score?.snapshot()||null,contextReady:!!context,contextState:context?.state??'uninitialized',activeSources:voices.length,peakVoices,dropped,decodedBuffers:buffers.size,pendingLoads:loads.size,activeLoops:[...loops.keys(),...(score?.snapshot().selected?[score.snapshot().selected]:[])],loopGains:{...Object.fromEntries([...loops].map(([id,e])=>[id,e.target])),...Object.fromEntries(Object.entries(score?.snapshot().tracks||{}).filter(([,e])=>e.gain>0).map(([id,e])=>[id,e.gain]))},desiredLoops:[...desiredLoops.keys(),...(score?.snapshot().selected?[score.snapshot().selected]:[])],scene,paused,eventCounts:Object.fromEntries(eventCounts),recent:[...recent]})});
}
