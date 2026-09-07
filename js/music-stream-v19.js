// Long compressed scores stay streamed; never decode 12 minutes into a large AudioBuffer.
const TRACKS={music_menu:'menu',music_field_base:'field',music_boss_base:'boss'};
export function createLongScore(context,bus){
 const entries=new Map();let selected=null,paused=false,errors=0,serial=0;
 function prepare(id){if(entries.has(id))return entries.get(id);const media=document.createElement('audio');media.preload='metadata';media.loop=true;media.src='assets/v19/audio/score-'+TRACKS[id]+'.ogg';const source=context.createMediaElementSource(media),gain=context.createGain();gain.gain.value=0;source.connect(gain);gain.connect(bus);const entry={media,source,gain,target:0,retire:0};media.addEventListener('error',()=>errors++);entries.set(id,entry);return entry;}
 function play(entry){const token=serial;entry.media.play().then(()=>{if(paused||token!==serial&&entry!==entries.get(selected))entry.media.pause()}).catch(e=>{if(e.name!=='AbortError'&&e.name!=='NotAllowedError')errors++});}
 function select(id,volume=.55){if(!TRACKS[id])id=null;if(selected===id)return;selected=id;serial++;const now=context.currentTime;
  for(const [key,e]of entries){e.target=key===id?volume:0;e.retire=e.target?0:now+1.4;e.gain.gain.cancelScheduledValues(now);e.gain.gain.setTargetAtTime(e.target,now,.35);}
  if(id){const e=prepare(id);e.target=volume;e.retire=0;e.gain.gain.setTargetAtTime(volume,now,.35);if(!paused)play(e);}
 }
 function tick(){const now=context.currentTime;for(const e of entries.values())if(e.retire&&now>=e.retire){e.media.pause();e.retire=0;}}
 function pause(){paused=true;serial++;for(const e of entries.values())e.media.pause();}
 function resume(){paused=false;const e=entries.get(selected);if(e)play(e);}
 // Keep playback cursors across menus, boss transitions and retries: do not replay the intro.
 function stop(){selected=null;paused=true;serial++;for(const e of entries.values()){e.media.pause();e.target=0;e.retire=0;e.gain.gain.cancelScheduledValues(context.currentTime);e.gain.gain.setValueAtTime(0,context.currentTime);}}
 function close(){stop();for(const e of entries.values()){e.source.disconnect();e.gain.disconnect();e.media.removeAttribute('src');e.media.load();}entries.clear();}
 return{select,tick,pause,resume,stop,close,snapshot:()=>({selected,errors,paused,tracks:Object.fromEntries([...entries].map(([id,e])=>[id,{position:e.media.currentTime,duration:Number.isFinite(e.media.duration)?e.media.duration:0,playing:!e.media.paused,gain:e.target,ready:e.media.readyState}]))})};
}
