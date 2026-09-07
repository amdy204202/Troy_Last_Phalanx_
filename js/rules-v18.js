// V18 rules are pure so reaction windows, progression and buffs can be replayed.
export const REROLL_CAP=5;
export function rerollsAfterLevel(current,level){return Math.min(REROLL_CAP,current+((level-1)%3===0?1:0));}
export function continuationWeight(base,progressing){return base*(progressing?1.05:1);}
export function reactionBudget({distance,speed,tell=.6,sourceRadius=30,playerRadius=14,projectileRadius=6}){
  const flight=Math.max(0,distance-sourceRadius-playerRadius-projectileRadius)/speed;
  // 50 ms budget for frame/input latency; 600 ms minimum from visible tell.
  const windup=Math.max(tell,.65-flight);
  return {windup,flight,response:windup+flight-.05};
}
export function sweptCircle(from,to,center,radius){
  const x=from.x-center.x,y=from.y-center.y,dx=to.x-from.x,dy=to.y-from.y;
  const c=x*x+y*y-radius*radius;if(c<=0)return 0;
  const a=dx*dx+dy*dy;if(a<1e-12)return null;
  const b=2*(x*dx+y*dy),disc=b*b-4*a*c;if(disc<0)return null;
  const t=(-b-Math.sqrt(disc))/(2*a);return t>=0&&t<=1?t:null;
}
export function incomingOrigin(projectile,player){
  const speed=Math.hypot(projectile.vx||0,projectile.vy||0);
  return speed>0?{x:player.x-projectile.vx/speed*80,y:player.y-projectile.vy/speed*80}:{x:projectile.x,y:projectile.y};
}
export function refreshStandardBuff(e){
  if(e.boss||e.dead)return;
  if(!e.standardBuff){e.standardBuff={hp:e.maxHp,damage:e.damage,speed:e.speed};const ratio=e.hp/e.maxHp;e.maxHp*=1.12;e.hp=e.maxHp*ratio;e.damage*=1.10;e.speed*=1.10;}
  e.standardBuffLeft=4;
}
export function tickStandardBuff(e,dt){
  if(!e.standardBuff)return;e.standardBuffLeft-=dt;
  if(e.standardBuffLeft<=0){const ratio=Math.min(1,e.hp/e.maxHp),base=e.standardBuff;e.maxHp=base.hp;e.hp=base.hp*ratio;e.damage/=1.10;e.speed/=1.10;e.standardBuff=null;e.standardBuffLeft=0;}
}
export const COVERAGE_MULTIPLIERS={spear:{spin:.62},javelin:{volley:.8},shield:{fortress:.8},discus:{swarm:.62,razor:.8},firepot:{spread:.68,furnace:.8},bow:{volley:.58},flail:{orbit:.65,impact:.86},thunder:{chain:.78,burst:.8},caltrops:{control:.82,trap:.8},ram:{line:.75,break:.88}};
export function coverageMultiplier(key,route){return COVERAGE_MULTIPLIERS[key]?.[route]??1;}
export function spreadHitMultiplier(previousHits){return previousHits===0?1:previousHits===1?.3:.15;}
