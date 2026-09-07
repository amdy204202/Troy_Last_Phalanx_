import {coverageMultiplier} from './rules-v18.js';
// Each weapon has a distinct geometry; branches change the attack itself.
export const WEAPON_KITS={
  spear:{name:'도리 장창',shape:'전방 직선 / 회전 부채꼴',range:218,width:16,cd:.9,damage:34,paths:{thrust:['팔랑크스 창벽','좁은 사선 3연 찌르기 · 한 대상 집중','창끝 연장','육연 찌르기','왕의 여섯 박자'],spin:['트리톤 회전창','145px 부채꼴이 세 번 회전','반경 확장','재회전','폭풍의 창날']}},
  sword:{name:'크시포스',shape:'근접 호 / 회수 투검',range:112,width:2.1,cd:1.05,damage:34,paths:{melee:['미르미돈 검무','112px 교차 베기 · 세 번째 넓은 베기','긴 검신','교차 연격','처형 검무'],throw:['헤르메스 귀환검','650px 투검 · 회수 중 재투척 불가','장거리 투척','도탄 검날','회수의 박자']}},
  javelin:{name:'팔톤 투창',shape:'다발 직선 / 표식 저격',range:780,cd:1.85,damage:50,paths:{volley:['폭우 투창','넓은 부채꼴 세 방향 투창','투척 확산','꿰뚫는 창날','착탄 파편'],hunter:['사냥꾼의 표식','후열과 정예를 조준하는 단일 관통창','독수리 사거리','꿰뚫는 표식','집중 사냥']}},
  shield:{name:'아스피스 방패',shape:'전방 방어 부채꼴 / 귀환 방패',range:155,cd:2.5,damage:24,paths:{fortress:['아테나의 성벽','전방 180도 충격 · 전방 투사체 제거','방진 확장','반격의 청동','불굴의 수호'],assault:['아레스의 투척방패','적 사이를 튕기고 돌아오는 방패','강한 투척','연속 도탄','천둥의 귀환']}},
  discus:{name:'청동 원반',shape:'고정 공전 궤도 / 절단 부메랑',range:125,cd:.28,damage:11,paths:{swarm:['태양환 궤도','공전 원반 접촉 피해 · 중앙은 사각','궤도 확장','세 번째 태양','태양의 가속'],razor:['크로노스 절단륜','앞으로 날아갔다 돌아오는 큰 절단륜','넓은 절단날','관통 귀환','깊은 절개']}},
  firepot:{name:'그리스 화염',shape:'착탄 지속 원 / 전방 화염 부채꼴',range:650,cd:2.9,damage:10,paths:{spread:['헤파이스토스 화염병','적의 진행로에 남는 지속 화염','넓은 불길','세 갈래 착탄','꺼지지 않는 불'],furnace:['용광로 숨결','가까운 전방 65도에 지속 화염 분사','긴 불꽃','뜨거운 심장','용광로 맥동']}},
  sling:{name:'가죽 투석구',shape:'연쇄 도탄 / 중량 폭발',range:760,cd:1.35,damage:36,paths:{ricochet:['오디세우스 도탄석','세 명을 잇는 빠른 돌 · 점차 피해 감소','긴 도탄','다섯 번 도탄','갈라진 파편'],heavy:['키클롭스 중량석','느린 큰 돌과 좁은 착탄 폭발','무거운 납탄','충격 반경','거인 파쇄']}},
  bow:{name:'아폴론의 활',shape:'빠른 화살 부채꼴 / 긴 저격 사선',range:930,cd:1.15,damage:27,paths:{volley:['살라미스 일제사격','빠른 다발 화살 · 넓은 전방 억제','부채꼴 시위','다섯 겹 화살','끝없는 화살비'],hunter:['테우크로스 저격','느리지만 길고 강한 정예 관통 화살','황금 사거리','관통의 눈','왕의 저격']}},
  flail:{name:'사슬 철퇴',shape:'사슬 끝 공전 / 예고된 전방 강타',range:146,cd:1.5,damage:42,paths:{orbit:['아레스의 쇠사슬','긴 사슬 끝 철구만 적중 · 안쪽 사각','사슬 연장','회전 가속','가시 철구'],impact:['키클롭스 강타','앞쪽 한 지점을 내려쳐 파쇄','긴 강타','넓은 파쇄','투구 분쇄']}},
  thunder:{name:'제우스의 뇌전',shape:'적 간 연쇄 / 지점 반복 낙뢰',range:720,cd:2.0,damage:32,paths:{chain:['이다산 연쇄뇌전','가까운 적 사이를 다섯 번 연결','전도 거리','일곱 번개','전격 정체'],burst:['올림포스 심판','고정 표식에 시간차 두 번 낙뢰','낙뢰 반경','세 번째 낙뢰','집중 심판']}},
  caltrops:{name:'청동 마름쇠',shape:'발밑 후방 제어 / 근접 감지 지뢰',range:160,cd:2.8,damage:9,paths:{control:['아테나의 거부선','지나온 자리에 남는 감속 가시','넓은 가시','오래 남는 가시','피 흘리는 길'],trap:['헤파이스토스 지뢰','적이 밟을 때 폭발 · 최대 8개','넓은 감지','추가 지뢰','청동 연쇄폭발']}},
  ram:{name:'청동 파성추',shape:'이동하는 넓은 직선 / 가까운 전방 강타',range:430,cd:2.0,damage:44,paths:{line:['아카이아 공성열','전방으로 밀려가는 넓은 관통 공성파','넓은 전열','긴 공성열','두 번째 파도'],break:['성문 파쇄','짧고 강한 부채꼴 · 방패와 정예 특효','파쇄 범위','정예 분쇄','성문 붕괴']}},
};
export function installWeaponTrees(paths,nodes,info){
  for(const [key,kit]of Object.entries(WEAPON_KITS)){
    paths[key]={};nodes[key]=[];info[key].role=kit.shape;
    for(const [route,data]of Object.entries(kit.paths)){
      const ids=[route+'1',route+'2',route+'3'];
      paths[key][route]={name:data[0],desc:data[1]+(coverageMultiplier(key,route)<1?' · 범위형: 단일 피해 '+Math.round(coverageMultiplier(key,route)*100)+'%':' · 집중형: 단일 피해 100%'),icon:info[key].icon,grant:ids[0],nodes:ids};
      ids.forEach((id,i)=>nodes[key].push({id,title:data[i+2],icon:info[key].icon,desc:[data[1]+' · 범위/사거리 +12%.','이 공격 방식의 고유 효과가 강화됩니다.','고유 효과 완성 · 피해 +18%.'][i],req:i?[ids[i-1]]:[]}));
    }
  }
}
export function createWeaponSystem(api){
  const {getGame,nearest,nearby,damage,projectile,attack,zone,fx,sound,power}=api;
  let jobs=[],mines=[],owner=null,clock=0;
  function schedule(t,fn){jobs.push({t,fn});}
  function reset(){jobs=[];mines=[];owner=getGame();clock=0;}
  function disk(x,y,r,d,key,opts={}){for(const e of nearby(x,y,r+70))if(!e.dead&&Math.hypot(e.x-x,e.y-y)<r+e.r)damage(e,d,{source:key,origin:{x,y},...opts});}
  function cone(p,a,r,arc,d,key,opts={}){for(const e of nearby(p.x,p.y,r+70)){const da=Math.atan2(Math.sin(Math.atan2(e.y-p.y,e.x-p.x)-a),Math.cos(Math.atan2(e.y-p.y,e.x-p.x)-a));if(!e.dead&&Math.hypot(e.x-p.x,e.y-p.y)<r+e.r&&Math.abs(da)<arc/2)damage(e,d*(key==='ram'&&opts.unblockable&&(e.elite||e.type==='shieldman')?1.45:1),{source:key,origin:p,...opts});}}
  function line(p,a,length,width,d,key,limit,opts={}){let n=0;const c=Math.cos(a),sn=Math.sin(a);const hits=nearby(p.x,p.y,length+80).map(e=>({e,f:(e.x-p.x)*c+(e.y-p.y)*sn,s:Math.abs(-(e.x-p.x)*sn+(e.y-p.y)*c)})).filter(h=>!h.e.dead&&h.f>-h.e.r&&h.f<length+h.e.r&&h.s<width+h.e.r).sort((a,b)=>a.f-b.f);for(const h of hits)if(n++<limit)damage(h.e,d,{source:key,origin:p,...opts});}
  function update(dt){
    const g=getGame();if(g!==owner)reset();if(!g)return;clock+=dt;
    for(const [key,w]of Object.entries(g.weapons)){if(!w.orbitSpec)continue;const o=w.orbitSpec,p=g.player;w.angle=(w.angle||0)+dt*o.speed;w.orbitPoints=[];w.orbitHits||=new Map();for(let i=0;i<o.count;i++){const a=w.angle+i*Math.PI*2/o.count,x=p.x+Math.cos(a)*o.radius,y=p.y+Math.sin(a)*o.radius;w.orbitPoints.push({x,y});for(const e of nearby(x,y,o.hitRadius+60))if(!e.dead&&Math.hypot(e.x-x,e.y-y)<e.r+o.hitRadius&&(w.orbitHits.get(e.id)||0)<=clock){damage(e,o.damage,{source:key,origin:{x,y},unblockable:true,knock:25});w.orbitHits.set(e.id,clock+.3)}}if(w.orbitHits.size>256)for(const [id,t]of w.orbitHits)if(t<clock-2)w.orbitHits.delete(id)}
    // Simulation-time callbacks pause with the game and never leak into another run.
    const due=[];jobs=jobs.filter(j=>{j.t-=dt;if(j.t<=0){due.push(j);return false}return true});for(const j of due)j.fn();
    for(const m of mines){m.life-=dt;m.arm-=dt;if(m.arm<=0&&nearby(m.x,m.y,m.r+45).some(e=>!e.dead&&Math.hypot(e.x-m.x,e.y-m.y)<m.r+e.r)){disk(m.x,m.y,m.r*1.7,m.d,'caltrops',{unblockable:true,knock:140});fx('firepot',m.x,m.y,m.r*3);sound('caltrops');m.life=0}}
    mines=mines.filter(m=>m.life>0);
  }
  function fire(key,w,target){
    const g=getGame(),p=g.player,k=WEAPON_KITS[key];if(!k)return;
    if(key==='sword'&&w.path==='throw'&&g.projectiles.some(q=>q.weaponKey===key&&q.boomerang&&q.life>0)){w.cd=.08;return}
    const route=w.path||Object.keys(k.paths)[0],rank=n=>!!w.nodes[route+n],area=p.area*(rank(1)?1.12:1),d=k.damage*coverageMultiplier(key,route)*power(key)*(rank(3)?1.18:1)*(w.evolution?1.2:1),r=k.range*area;
    const a=target?Math.atan2(target.y-p.y,target.x-p.x):p.aim;
    const bolt=(angle,speed,amount,opts={})=>projectile(p.x,p.y,angle,speed,amount,{friendly:true,type:key,weaponKey:key,damageGroup:route==='volley'?key+':'+clock+':'+w.combo:null,color:api.colors[key],life:k.range/speed,r:6,...opts});
    w.cd=k.cd/Math.max(.2,p.attackRate);w.combo=(w.combo||0)+1;sound(key);p.motion={kind:key,time:.3,max:.3,angle:a};
    if(g.fusions?.[key]){
      if(key==='spear'&&w.combo%4===0)bolt(a,650,d*1.2,{type:'ramWave',r:24,pierce:8,life:1});
      if(key==='sword'&&w.combo%3===0){for(let i=0;i<6;i++)bolt(i*Math.PI/3,420,d*.18,{type:'bronzeShard',stun:.5,life:.6});fx(key,p.x,p.y,250);}
      if(key==='discus'){w.fusionRing=(w.fusionRing||0)+1;for(const q of g.projectiles)if(!q.friendly&&Math.hypot(q.x-p.x,q.y-p.y)<r+20)q.life=0;}
      if(key==='firepot'&&target)schedule(.55,()=>{disk(target.x,target.y,90,d*1.6,key,{unblockable:true});fx('thunder',target.x,target.y,180);});
      if(key==='sling'&&target)schedule(.6,()=>{disk(target.x,target.y,90,d*.45,key,{unblockable:true});fx('ram',target.x,target.y,170);});
      if(key==='bow')bolt(a,920,d*.5,{type:'relicArrow',homing:true,mark:4,life:1.2});
      if(key==='flail'&&target)schedule(.4,()=>{disk(target.x,target.y,80,d*.4,key,{unblockable:true,stun:1});for(let i=0;i<4;i++)projectile(target.x,target.y,i*Math.PI/2,400,d*.16,{weaponKey:key,type:'bronzeShard',friendly:true,life:.6});});
      if(key==='thunder'&&target)schedule(.65,()=>{disk(target.x,target.y,120,d*.65,key,{unblockable:true});fx(key,target.x,target.y,240);});
      if(key==='caltrops'){const threat=nearby(p.x,p.y,600).find(e=>!e.dead&&(/archer|bomber|elite|giant/.test(e.type)));if(threat)zone(threat.x,threat.y,80,3,d*.7,'#b993de',.6,key);}
      if(key==='ram')schedule(.65,()=>{const x=p.x+Math.cos(a)*r,y=p.y+Math.sin(a)*r;disk(x,y,95,d*.75,key,{unblockable:true});fx('firepot',x,y,200);});
    }
    if(key==='spear'){
      if(route==='spin'){const pulses=rank(2)?4:3;for(let i=0;i<pulses;i++)schedule(i*.12,()=>{const angle=a+i*Math.PI*2/pulses;cone(p,angle,145*area,Math.PI*.9,d*.6,key,{unblockable:true,knock:40});attack({kind:'slash',x:p.x,y:p.y,angle,arc:Math.PI*.9,r:145*area,color:api.colors[key],life:.22});fx(key,p.x,p.y,260*area,angle);});}
      else{const count=rank(2)?6:3;for(let i=0;i<count;i++)schedule(i*.085,()=>{const angle=p.manualAim>0?p.aim:a;line(p,angle,r,13*area,d*(rank(2)?.26:.42),key,rank(2)?3:1,{unblockable:rank(2),knock:12});attack({kind:'thrust',x:p.x,y:p.y,angle,length:r,width:13*area,color:api.colors[key],life:.12});fx(key,p.x+Math.cos(angle)*r*.5,p.y+Math.sin(angle)*r*.5,r,angle,.12);p.motion={kind:'spear',time:.12,max:.12,angle};if(i%2===0)sound(key);});}

    }else if(key==='sword'){
      if(route==='throw'){bolt(a,570,d*1.45,{type:'swordThrow',r:12,life:2.25,returnAt:1.45,boomerang:true,bounces:rank(2)?2:0,trail:true});w.cd=1.15/p.attackRate;}
      else{const arc=w.combo%3===0?3.8:2.1,angle=a+(w.combo%2?.16:-.16);cone(p,angle,r,arc,d,key,{knock:75});attack({kind:'slash',x:p.x,y:p.y,angle,arc,r,color:api.colors[key],life:.28});fx(key,p.x,p.y,r*2,angle);if(rank(2))schedule(.18,()=>cone(p,angle+.4,r,arc,d*.4,key));}
    }else if(key==='javelin'){
      const offsets=route==='volley'?(p.amount>0?[-.3,-.1,.1,.3]:[-.23,0,.23]):[0];for(const off of offsets)bolt(a+off,route==='hunter'?800:570,d*(route==='volley'?.68:1.4),{type:'playerJavelin',pierce:rank(2)?3:1,life:route==='hunter'?1.5:1.3,r:8,mark:route==='hunter'?4:0,blast:rank(3)&&route==='volley'?40:0});
    }else if(key==='shield'){
      if(route==='assault')bolt(a,390,d*1.65,{type:'shieldThrow',r:24,life:2.4,returnAt:1.3,boomerang:true,bounces:rank(2)?3:1});
      else{cone(p,a,r,Math.PI,d,key,{unblockable:true,knock:220});attack({kind:'slash',x:p.x,y:p.y,angle:a,arc:Math.PI,r,color:api.colors[key],life:.35});for(const q of g.projectiles)if(!q.friendly&&Math.hypot(q.x-p.x,q.y-p.y)<r&&Math.cos(Math.atan2(q.y-p.y,q.x-p.x)-a)>0)q.life=0;fx(key,p.x,p.y,r*1.8,a);}
    }else if(key==='discus'||key==='flail'&&route==='orbit'){
      if(key==='discus'&&route==='razor'){bolt(a,340,d*4.2,{type:'discus',r:23,life:2.1,returnAt:1.2,boomerang:true,pierce:20});w.cd=1.6/p.attackRate;}
      else{w.orbitSpec={radius:r,count:key==='flail'?1:(rank(2)?3:2)+Math.min(1,p.amount||0),damage:d*(key==='flail'?1.15:1.7),hitRadius:key==='flail'?34:23,speed:(key==='flail'?3.5:2.8)*(rank(2)?1.2:1)};w.cd=.5;}
    }else if(key==='firepot'){
      if(route==='furnace'){cone(p,a,225*area,1.15,d*1.3,key,{unblockable:true,burn:{time:2,dps:d*.25}});fx(key,p.x+Math.cos(a)*120,p.y+Math.sin(a)*120,210,a);w.cd=.32/p.attackRate;}
      else if(target){const tx=target.x,ty=target.y;for(let i=0;i<(rank(2)?3:1);i++){const x=tx+(i-1)*(rank(2)?65:0),y=ty;zone(x,y,62*area,rank(3)?5:3.5,d*.6,api.colors[key],0,key);fx(key,x,y,130);}}
    }else if(key==='sling')bolt(a,route==='heavy'?390:650,d*(route==='heavy'?2.0:1),{type:'slingStone',r:route==='heavy'?13:6,bounces:route==='ricochet'?(rank(2)?5:3):0,damageDecay:.82,blast:route==='heavy'?(rank(2)?95:65):0,life:2.2});
    else if(key==='bow'){
      if(route==='hunter'){bolt(a,990,d*2.7,{type:'relicArrow',pierce:rank(2)?5:2,life:1.6,r:7});w.cd=1.65/p.attackRate;}
      else for(let i=0,n=(rank(2)?5:3)+Math.min(1,p.amount||0);i<n;i++)bolt(a+(i-(n-1)/2)*.16,800,d*.95,{type:'relicArrow',life:1.3});
      if(route==='volley')w.cd=.86/p.attackRate;
    }else if(key==='flail'){
      const x=p.x+Math.cos(a)*r,y=p.y+Math.sin(a)*r;fx('flail',x,y,100,a);schedule(.4,()=>{disk(x,y,(rank(2)?95:72)*area,d*2.25,key,{unblockable:true,knock:220,stun:rank(3)?.6:0});fx('firepot',x,y,160)});
    }else if(key==='thunder'&&target){
      if(route==='burst'){const x=target.x,y=target.y;fx(key,x,y,125);for(let i=0;i<(rank(2)?3:2);i++)schedule(.45+i*.26,()=>{disk(x,y,80*area,d*.9,key,{unblockable:true});fx(key,x,y,160)});}
      else{let cur=target,from={x:p.x,y:p.y};const hit=new Set();for(let i=0;i<(rank(2)?7:5)&&cur;i++){hit.add(cur.id);attack({kind:'lightning',x:from.x,y:from.y,x2:cur.x,y2:cur.y,color:api.colors[key],life:.24});damage(cur,d*Math.pow(.86,i),{source:key,origin:from,unblockable:true,slow:rank(3)?.7:0});from=cur;cur=nearby(cur.x,cur.y,210*area).find(e=>!e.dead&&!hit.has(e.id));}}
    }else if(key==='caltrops'){
      const x=p.x-Math.cos(p.moveHeading||a)*55,y=p.y-Math.sin(p.moveHeading||a)*55;
      if(route==='trap'){mines.push({x,y,r:52*area,d:d*7,life:12,arm:.55});if(rank(2))mines.push({x:x+65,y,r:52*area,d:d*7,life:12,arm:.55});mines=mines.slice(-8);}
      else zone(x,y,76*area,rank(2)?6:4,d*.65,'#b3b98f',rank(3)?.7:.5,key);
    }else if(key==='ram'){
      if(route==='line'){bolt(a,410,d,{type:'ramWave',r:32*area,pierce:99,life:r/410});if(rank(3))schedule(.35,()=>bolt(a,410,d*.45,{type:'ramWave',r:28*area,pierce:99,life:r/410}));}
      else{schedule(.32,()=>{cone(p,a,175*area,1.75,d*1.8,key,{unblockable:true,knock:260,stun:rank(2)?.5:0});fx(key,p.x+Math.cos(a)*90,p.y+Math.sin(a)*90,200,a);});}
    }
  }
  function draw(ctx,w2s,images){const g=getGame();if(!g)return;for(const [key,w]of Object.entries(g.weapons)){for(const pt of(w.orbitPoints||[])){const s=w2s(pt.x,pt.y),p=w2s(g.player.x,g.player.y);ctx.save();if(key==='flail'){ctx.strokeStyle='#ae9872';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(s.x,s.y);ctx.stroke()}const img=images[key];if(img?.naturalWidth){ctx.translate(s.x,s.y);ctx.rotate(w.angle||0);ctx.drawImage(img,-22,-22,44,44)}ctx.restore()}}for(const m of mines){const p=w2s(m.x,m.y),img=images.caltrops;if(img?.naturalWidth){ctx.save();ctx.globalAlpha=m.arm>0?.5:.9;ctx.drawImage(img,p.x-28,p.y-28,56,56);ctx.restore()}}}
  return {fire,update,draw,reset,diagnostics:()=>({jobs:jobs.length,mines:mines.length})};
}
