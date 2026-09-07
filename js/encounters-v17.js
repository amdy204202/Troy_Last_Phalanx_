import {bossReactionBudget as reactionBudget,DUEL_BEAT} from './duel-v19.js';
// Fixed-tick boss choreography. A tell locks its aim/target before the attack.
export const BOSS_ORDER = ['paris','sarpedon','chariot','aeneas','penthesilea','memnon','hector'];
export const BOSS_STYLE = {
  paris:{title:'독사의 시위',hint:'활 당김을 읽고 패링 · 독 장판은 이탈',range:400,speed:160,move:'kite',escorts:['eliteArcher']},
  sarpedon:{title:'리키아의 불굴',hint:'착지 표식 밖으로 · 창끝은 패링',range:200,speed:104,move:'hold',escorts:['eliteCaptain']},
  chariot:{title:'청동 바퀴의 포효',hint:'돌진 사선에서 옆으로 · 파편은 반사',range:340,speed:162,move:'orbit',escorts:['wheelSapper','wheelSapper']},
  aeneas:{title:'무너지지 않는 성문',hint:'방패 강타를 패링하면 방어가 무너집니다',range:150,speed:106,move:'advance',escorts:['eliteCaptain']},
  penthesilea:{title:'아마존의 붉은 달',hint:'측면 이동 뒤 참격 · 두 번째 박자를 보십시오',range:250,speed:184,move:'orbit',escorts:['eliteArcher']},
  memnon:{title:'검은 태양의 왕',hint:'태양 표식 사이 안전 통로를 찾으십시오',range:310,speed:88,move:'hold',escorts:['eliteDrummer']},
  hector:{title:'트로이의 마지막 방패',hint:'황금 참격은 패링 · 붉은 돌진은 구르기',range:160,speed:132,move:'advance',escorts:['eliteCaptain','eliteDrummer']},
};
const P=(id,name,tell,active,recover,kind,tag,extra={})=>({id,name,tell,active,recover,kind,tag,...extra});
export const BOSS_PATTERNS={
  paris:[P('poison-shot','독화살 조준', .4,.12,.8,'shot','reflectable',{poison:true,speed:1750}),P('triple-arrow','삼연 사격',.4,.65,.8,'burst','reflectable',{speed:1620}),P('toxic-flank','독사의 측보',.6,.48,.8,'sidestep','dodgeOnly',{radius:64})],
  sarpedon:[P('lance-charge','장창 돌진',.6,.5,1.0,'charge','parryable',{speed:560}),P('sky-fall','도약 강하',.8,.18,1.2,'slam','dodgeOnly',{radius:116}),P('wing-sweep','리키아 반월베기',.4,.12,.8,'slash','parryable',{range:172,arc:2.3})],
  chariot:[P('wheel-shard','청동 바퀴 파편',.4,.12,.8,'fan','reflectable',{speed:1600}),P('piercing-charge','전차 직선 돌진',.8,.7,1.2,'charge','dodgeOnly',{speed:760}),P('outer-cut','외곽 절단 돌진',.6,.55,1.0,'charge','dodgeOnly',{speed:670})],
  aeneas:[P('shield-bash','성문 방패 강타',.4,.14,.8,'slash','parryable',{range:138,arc:2.0}),P('phalanx-fan','청동 방진 투창',.4,.12,.8,'fan','reflectable',{speed:1500}),P('standard-wave','군기 파동',.8,.12,1.0,'ring','dodgeOnly',{radius:118})],
  penthesilea:[P('flank-slash','측면 급습',.4,.36,.8,'charge','parryable',{speed:560}),P('twin-cut','쌍검 두 박자',.4,.68,.8,'combo','parryable',{range:156,arc:1.85}),P('javelin-ring','아마존 투창진',.4,.12,.8,'fan','reflectable',{speed:1680})],
  memnon:[P('sun-beam','태양 회랑',.8,.15,1.0,'corridor','dodgeOnly',{radius:58}),P('sun-spear','일식의 투창',.4,.12,.8,'fan','reflectable',{speed:1580}),P('earth-slam','대지의 세 인장',.8,.12,1.0,'marks','dodgeOnly',{radius:83})],
  hector:[P('shield-pressure','방패와 창',.4,.68,.8,'combo','parryable',{range:155,arc:2.0}),P('spear-charge','영웅의 돌파',.6,.52,1.0,'charge','dodgeOnly',{speed:640}),P('last-combo','최후의 삼연격',.6,1.05,1.0,'combo','parryable',{range:185,arc:2.2,third:true})],
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function bossProjectileSpec(distance,speed){
  const safeSpeed=clamp(Number(speed)||1600,120,2300);
  return {speed:safeSpeed,life:clamp((Math.max(480,Number(distance)||0)+180)/safeSpeed,1.1,4)};
}
export function stepBossEncounter(e,p,dt,emit){
  const style=BOSS_STYLE[e.type];if(!style)return {vx:0,vy:0};
  e.guardBreakTicks=Math.max(0,(e.guardBreakTicks||0)-1);e.counterOpen=Math.max(0,(e.counterOpen||0)-dt);
  e.hiddenTicks=e.invulnerableTicks=e.airborneTicks=0;
  const phase=e.hp/e.maxHp<.33?3:e.hp/e.maxHp<.66?2:1;e.bossPhase=phase;
  const dx=p.x-e.x,dy=p.y-e.y,d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d;
  const speed=style.speed*(1+(phase-1)*.07)*(e.enraged?1.08:1),side=e.orbit||1;
  const preferredRange=Math.min(style.range,(e.arenaRadius||450)*.82);
  let vx=0,vy=0;
  if(!e.encounter){e.encounter={stage:'spacing',left:.8,serial:0,basicCd:.7};}
  const s=e.encounter;s.basicCd-=dt;
  const spacing=()=>{
    const radial=clamp((d-preferredRange)/110,-.8,1);
    if(style.move==='hold'){vx=d>preferredRange+70?ux*speed:0;vy=d>preferredRange+70?uy*speed:0;}
    else if(style.move==='kite'){
      // A short, committed flank step followed by a firing stance; never tracks a dodge.
      s.moveLeft=(s.moveLeft||0)-dt;
      if(s.moveLeft<=0){s.moveLeft=1.05;s.moveAngle=Math.atan2(dy,dx)+(d<preferredRange-40?Math.PI:d>preferredRange+80?0:side*Math.PI/2);}
      if(s.moveLeft>.38){vx=Math.cos(s.moveAngle)*speed;vy=Math.sin(s.moveAngle)*speed;}
    }else if(style.move==='advance'){if(d>preferredRange+22){vx=ux*speed;vy=uy*speed;}}
    else {const orbit=.85*side;vx=(ux*radial-uy*orbit)*speed;vy=(uy*radial+ux*orbit)*speed;}
  };
  s.left-=dt;
  if(s.stage==='spacing'){
    spacing();
    if(e.type==='paris'&&s.basicCd<=0){
      // Ordinary shots have their own visible windup; no roll/invulnerability coupling.
      s.basicCd=1.6;s.basicTell=reactionBudget({distance:d,speed:1580*(e.hostileSpeedScale||1),tell:.32,sourceRadius:(e.r||30)+9,projectileRadius:9}).windup;s.basicAngle=Math.atan2(dy,dx);
      emit({kind:'tellShot',angle:s.basicAngle,duration:s.basicTell,tag:'reflectable'});
    }
    if(s.basicTell>0){s.basicTell-=dt;vx*=.25;vy*=.25;if(s.basicTell<=0)emit({kind:'shot',angle:s.basicAngle,speed:1580,tag:'reflectable',damage:.55});}
    if(s.left<=0&&!(s.basicTell>0)){
      const patterns=BOSS_PATTERNS[e.type],pattern=patterns[s.serial%patterns.length];s.serial++;
      s.pattern=pattern;s.stage='windup';s.left=['shot','burst','fan'].includes(pattern.kind)?reactionBudget({distance:d,speed:pattern.speed*(e.hostileSpeedScale||1),tell:pattern.tell,sourceRadius:(e.r||30)+9,projectileRadius:9}).windup:pattern.tell;s.tellDuration=s.left;s.elapsed=0;s.fired=0;
      s.angle=Math.atan2(dy+clamp(p.vy*.2,-45,45),dx+clamp(p.vx*.2,-45,45));
      s.target={x:p.x+clamp(p.vx*.2,-45,45),y:p.y+clamp(p.vy*.2,-45,45)};
      s.origin={x:e.x,y:e.y};emit({kind:'pattern',pattern,phase,serial:s.serial,target:s.target,angle:s.angle});
    }
  } else if(s.stage==='windup'){
    e.telegraph=Math.max(0,s.left);e.facing=s.angle;
    if(s.pattern.kind==='slam'){
      const t=clamp((1-s.left/s.pattern.tell-.25)/.75,0,1),ease=t*t*(3-2*t);
      const x=s.origin.x+(s.target.x-s.origin.x)*ease,y=s.origin.y+(s.target.y-s.origin.y)*ease;
      vx=(x-e.x)/Math.max(dt,.001);vy=(y-e.y)/Math.max(dt,.001);e.visualLift=Math.sin(t*Math.PI)*110;
    }
    if(s.left<=0){s.stage='attack';s.left=s.pattern.active;s.elapsed=0;s.fired=0;}
  } else if(s.stage==='attack'){
    const pat=s.pattern;s.elapsed+=dt;e.attackPose=.4;e.facing=s.angle;e.visualLift=0;
    const send=(kind,extra={})=>emit({kind,angle:s.angle,target:s.target,phase,tag:pat.tag,damage:1,...pat,...extra,kind});
    if(s.fired===0){
      if(pat.kind==='charge'){send('charge');}
      else if(pat.kind==='combo'){send('slash');}
      else if(pat.kind==='sidestep'){send('marks',{radius:64,damage:.7});}
      else send(pat.kind);
      s.fired=1;
    }
    if(pat.kind==='charge'){vx=Math.cos(s.angle)*pat.speed;vy=Math.sin(s.angle)*pat.speed;}
    if(pat.kind==='sidestep'){vx=-Math.sin(s.angle)*side*340;vy=Math.cos(s.angle)*side*340;}
    if(pat.kind==='burst'&&s.elapsed>=s.fired*(DUEL_BEAT/2)&&s.fired<3){send('shot',{angle:s.angle+(s.fired-1)*.17,damage:.65});s.fired++;}
    if(pat.kind==='combo'&&s.elapsed>=s.fired*DUEL_BEAT&&s.fired<(pat.third&&phase>=2?3:2)){
      send('slash',{angle:s.angle+(s.fired%2?.55:-.35),tag:s.fired===1?'dodgeOnly':'parryable',damage:.85});s.fired++;
    }
    if(s.left<=0){s.stage='recovery';s.left=pat.recover;e.telegraph=0;}
  } else if(s.stage==='recovery'){
    // Recovery is an actual damage opportunity: no contact damage or last-moment tracking.
    if(s.left<=0){s.stage='spacing';s.left=Math.max(.4,.8-(phase-1)*.2);}
  }
  e.bossMechanic={stage:s.stage,remaining:Math.ceil(s.left*60),angle:s.angle||0,patternId:s.pattern?.id||'spacing',phase,profile:{state:style.move}};
  e.bossPatternCd=Math.max(0,s.left);e.contactActive=s.stage==='attack'&&s.pattern?.kind==='charge';
  e.defenseTag=s.pattern?.tag||'parryable';
  e.phase=e.contactActive?Math.max(dt,s.left):0;
  return {vx,vy};
}

export const ESCORT_ROLES={
  eliteCaptain:{name:'성문의 창파수',row:0,range:135,tell:.7,cooldown:2.7,kind:'lunge',color:'#e8be67'},
  eliteArcher:{name:'독사의 시종',row:1,range:330,tell:.8,cooldown:3.0,kind:'fan',color:'#99c977'},
  eliteDrummer:{name:'태양 제사장',row:2,range:235,tell:1.0,cooldown:4.3,kind:'pulse',color:'#d698ec'},
  wheelSapper:{name:'청동 바퀴 공병',row:3,range:270,tell:.9,cooldown:3.7,kind:'mine',color:'#e98c5e'},
};
export function smoothSteering(e,mx,my,dt){
  const len=Math.hypot(mx,my);if(len>1){mx/=len;my/=len;}
  const a=1-Math.exp(-9*dt);e.steerX=(e.steerX??mx)+(mx-(e.steerX??mx))*a;e.steerY=(e.steerY??my)+(my-(e.steerY??my))*a;
  return {x:e.steerX,y:e.steerY};
}
