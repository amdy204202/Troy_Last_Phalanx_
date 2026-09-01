import { createAttackIntent } from './attack-intent-v16.js';

export const BOSS_STATES = Object.freeze(['approach','windup','attack','recovery','enrage','stagger','dead']);
const TICK_MS = 1000 / 60;

function phaseFor(hp, maxHp) { const ratio = hp / maxHp * 100; return ratio > 70 ? 1 : ratio > 40 ? 2 : 3; }
function boss(manifest, id) { const found = manifest.bosses.find(item => item.id === id); if (!found) throw new RangeError(`unknown boss: ${id}`); return found; }
function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`; return JSON.stringify(value); }

export function createBossState({ bossId, maxHp = 100, seed = 1 }) {
  return Object.freeze({ bossId, state:'approach', hp:maxHp, maxHp, phase:1, seed:seed>>>0, patternIndex:-1, patternInstance:0, crossedBoundaries:Object.freeze([]), consumedDamageIds:Object.freeze([]), log:Object.freeze([]), tick:0 });
}

function choosePattern(state, manifest) {
  const eligible = boss(manifest, state.bossId).patterns.filter(pattern => pattern.phases.includes(state.phase));
  const nextSeed = (Math.imul(state.seed,1664525)+1013904223)>>>0;
  return { pattern: eligible[nextSeed % eligible.length], seed: nextSeed, patternIndex: nextSeed % eligible.length };
}

// @MX:ANCHOR: [AUTO] All seven bosses share this fixed-tick, replay-safe state transition.
// @MX:REASON: Boss gameplay, replay validation, telemetry, and siege adapter require identical transitions.
export function reduceBoss(state, event, manifest) {
  if (state.state === 'dead') return state;
  if (event.type === 'damage') {
    if (!event.id || state.consumedDamageIds.includes(event.id)) return state;
    const hp = Math.max(0, state.hp - Math.max(0, event.damage));
    const phase = phaseFor(hp, state.maxHp), crossed = [...state.crossedBoundaries], log = [...state.log];
    for (const boundary of [70,40]) if (state.hp / state.maxHp * 100 > boundary && hp / state.maxHp * 100 <= boundary && !crossed.includes(boundary)) {
      crossed.push(boundary); log.push({type:'enrage',boundary,eventId:event.id},{type:'next-pattern',boundary,eventId:event.id});
    }
    return Object.freeze({...state,hp,phase,state:hp===0?'dead':(phase>state.phase?'enrage':state.state),crossedBoundaries:Object.freeze(crossed),consumedDamageIds:Object.freeze([...state.consumedDamageIds,event.id]),log:Object.freeze(log)});
  }
  if (event.type === 'select-pattern') {
    const selected = choosePattern(state,manifest);
    return Object.freeze({...state,state:'windup',seed:selected.seed,patternIndex:selected.patternIndex,patternInstance:state.patternInstance+1,log:Object.freeze([...state.log,{type:'pattern',id:selected.pattern.id,tick:event.tick??state.tick}])});
  }
  if (event.type === 'stagger') return Object.freeze({...state,state:'stagger',tick:event.tick??state.tick});
  if (event.type === 'step') {
    const transitions={approach:'windup',windup:'attack',attack:'recovery',recovery:'approach',enrage:'windup',stagger:'recovery'};
    return Object.freeze({...state,state:transitions[state.state]??state.state,tick:event.tick??state.tick+1});
  }
  return state;
}

export function safeDestination(destination, viewport, player, inset) {
  return destination.x >= inset && destination.x <= viewport.width-inset && destination.y >= inset && destination.y <= viewport.height-inset && Math.hypot(destination.x-player.x,destination.y-player.y) >= 96;
}

function intent(input) { return Object.freeze({...createAttackIntent(input),telegraphAt:input.telegraphAt}); }
export function createPatternIntents({bossId,patternId,instanceId,startTick,origin}, manifest) {
  const pattern=boss(manifest,bossId).patterns.find(item=>item.id===patternId); if(!pattern) throw new RangeError(`unknown pattern: ${bossId}/${patternId}`);
  if (bossId==='hector'&&patternId==='last-combo') return [[1,'parryable',0,54],[2,'parryable',36,72],[3,'dodgeOnly',72,108]].map(([step,tag,tel,hit])=>intent({sourceKind:'boss',defenseTag:tag,origin,impactAt:startTick+hit,telegraphAt:startTick+tel,threat:'high',telegraphId:`${instanceId}:${step}:telegraph`,impactId:`${instanceId}:${step}`,range:pattern.distance,radius:36,damage:24}));
  return [intent({sourceKind:'boss',defenseTag:pattern.tag,origin,impactAt:startTick+Math.ceil(pattern.telegraphMs/TICK_MS),telegraphAt:startTick,threat:'high',telegraphId:`${instanceId}:telegraph`,impactId:instanceId,range:pattern.distance,radius:40,damage:24})];
}

export function runBossReplay({bossId,seed,tape,manifest}) {
  let state=createBossState({bossId,seed}); for(const event of tape) state=reduceBoss(state,event,manifest);
  return canonical({bossId:state.bossId,state:state.state,hp:state.hp,phase:state.phase,seed:state.seed,patternIndex:state.patternIndex,patternInstance:state.patternInstance,crossedBoundaries:state.crossedBoundaries,log:state.log,tick:state.tick});
}
