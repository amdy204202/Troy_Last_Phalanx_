// 150 BPM attack rhythm. React to preparation, not the projectile already in flight.
export const DUEL_BEAT=.4;
export function bossReactionBudget({distance,speed,tell=.4,sourceRadius=40,playerRadius=14,projectileRadius=9}){
 const flight=Math.max(0,distance-sourceRadius-playerRadius-projectileRadius)/Math.max(1,speed);
 const windup=Math.max(tell,.34-flight);
 return {windup,flight,response:windup+flight-.04};
}
export const bossArenaRadius=width=>width<720?440:620;
export const bossViewScale=width=>width<720?.82:.76;
