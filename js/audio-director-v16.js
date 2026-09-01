const BUS_NAMES=Object.freeze(['master','music','ambient','combat','ui']);
const LEVELS=new Set(['calm','engaged','highThreat','boss','critical']);

export function createBusSettings(){return Object.freeze(Object.fromEntries(BUS_NAMES.map(name=>[name,Object.freeze({gain:1,mute:false})])));}
export function restoreBusSettings(input={}){return Object.freeze(Object.fromEntries(BUS_NAMES.map(name=>{const value=input[name]??{};return[name,Object.freeze({gain:Math.max(0,Math.min(1,Number.isFinite(value.gain)?value.gain:1)),mute:!!value.mute})]})));}
export function createAudioDirector({barTicks=240,packageId='shore'}={}){return Object.freeze({level:'calm',packageId,barTicks,commands:Object.freeze([]),voices:Object.freeze([]),lastPlay:Object.freeze({}),fallbacks:0});}

// @MX:ANCHOR: [AUTO] Audio intensity, aggregation, and voice limits use one side-effect-free reducer.
// @MX:REASON: Gameplay, replay tests, and Web Audio adaptation must share deterministic commands.
export function reduceAudioDirector(state,event){
  if(event.type==='package'&&['shore','plain','city'].includes(event.packageId))return Object.freeze({...state,packageId:event.packageId});
  if(event.type==='intensity'){
    if(!LEVELS.has(event.level))return state;const atTick=Math.ceil(event.tick/state.barTicks)*state.barTicks;
    return Object.freeze({...state,level:event.level,commands:Object.freeze([...state.commands,Object.freeze({type:'crossfade',level:event.level,packageId:state.packageId,atTick,durationTicks:state.barTicks})])});
  }
  if(event.type==='play'){
    const prior=state.lastPlay[event.audioId];if(Number.isFinite(prior)&&event.atMs-prior<50)return state;
    const voice=Object.freeze({id:`${event.audioId}:${event.atMs}`,audioId:event.audioId,atMs:event.atMs,bus:event.bus??'combat'});
    return Object.freeze({...state,voices:Object.freeze([...state.voices.slice(-31),voice]),lastPlay:Object.freeze({...state.lastPlay,[event.audioId]:event.atMs})});
  }
  if(event.type==='fallback')return Object.freeze({...state,fallbacks:state.fallbacks+1});
  if(event.type==='release')return Object.freeze({...state,voices:Object.freeze(state.voices.filter(v=>v.id!==event.id))});
  return state;
}
