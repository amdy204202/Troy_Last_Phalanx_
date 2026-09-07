import {createMotion} from './motion-v18.js';
import {ESCORT_ROLES} from './encounters-v17.js';

export const ICON_KEYS=['spear','sword','javelin','shield','discus','firepot','sling','bow','flail','thunder','caltrops','ram','parry','dodge','ultimate','laurel'];
export function createPresentation({ctx,getGame,w2s,sound=()=>{}}){
  const load=path=>{const image=new Image();image.decoding='async';image.src='assets/v17/'+path;return image};
  const frames=load('combat-fx.png'),escorts=load('escort-motion.png'),icons=load('icons.png'),defense=load('parry-motion.png');
  const motion=createMotion({ctx,getGame});const ultimateFrames=new Image(),softFrames=[];
  ultimateFrames.onload=()=>{const fw=ultimateFrames.naturalWidth/6,fh=ultimateFrames.naturalHeight/5;
    for(let i=0;i<30;i++){const c=document.createElement('canvas');c.width=Math.floor(fw);c.height=Math.floor(fh);const x=c.getContext('2d');x.drawImage(ultimateFrames,i%6*fw,Math.floor(i/6)*fh,fw,fh,0,0,c.width,c.height);
      // Soft atlas edges prevent a neighboring cell or a cropped plume making a rectangle.
      const mask=document.createElement('canvas');mask.width=c.width;mask.height=c.height;const m=mask.getContext('2d'),pixels=m.createImageData(c.width,c.height);
      for(let y=0;y<c.height;y++)for(let px=0;px<c.width;px++){const edge=Math.min(px/c.width,(c.width-1-px)/c.width,y/c.height,(c.height-1-y)/c.height),t=Math.min(1,Math.max(0,edge/.09));pixels.data[(y*c.width+px)*4+3]=255*t*t*(3-2*t);}m.putImageData(pixels,0,0);x.globalCompositeOperation='destination-in';x.drawImage(mask,0,0);softFrames.push(c);
    }
  };ultimateFrames.src='assets/v18/hero-fx.png';
  let effects=[],owner=null;
  const play=(key,options)=>sound(key,options);
  function pause(){} // The shared mixer owns the entire playback lifecycle.
  function effect(key,x,y,size=130,angle=0,life=.4){
    if(getGame()!==owner){effects=[];owner=getGame();}
    if(effects.length>=48&&key!=='parrySuccess')return;
    const row=/parry|shield/.test(key)?0:/spear|javelin|bow|ram/.test(key)?1:/sword|discus|sling|flail/.test(key)?2:3;
    const special={parrySuccess:0,ultimateHoplite:1,ultimateSwordsman:2,ultimateArcher:3,zeus:4,zeusStrike:4}[key];effects.push({key,x,y,size,angle,life,max:life,row,special});
  }
  function update(dt){const game=getGame();if(game!==owner){effects=[];owner=game}for(const fx of effects)fx.life-=dt;effects=effects.filter(fx=>fx.life>0)}
  function draw(){
    ctx.save();for(const fx of effects){const p=w2s(fx.x,fx.y),progress=1-fx.life/fx.max;
      if(fx.key==='zeus'){ctx.save();ctx.globalCompositeOperation='source-over';ctx.fillStyle='rgba(8,13,30,'+Math.sin(progress*Math.PI)*.32+')';ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);ctx.restore();}
      const special=fx.special!==undefined&&ultimateFrames.naturalWidth,atlas=special?ultimateFrames:frames;if(!atlas.naturalWidth)continue;
      const fw=atlas.naturalWidth/6,fh=atlas.naturalHeight/(special?5:4),row=special?fx.special:fx.row,frame=Math.min(5,Math.floor(progress*6));
      ctx.save();ctx.globalCompositeOperation='lighter';ctx.translate(p.x,p.y);ctx.rotate(special?([1,3].includes(fx.special)?fx.angle:0):fx.row===0?0:fx.angle);ctx.globalAlpha=fx.key==='parrySuccess'?.94:special?.85:.65;
      const soft=special&&softFrames[row*6+frame];if(soft)ctx.drawImage(soft,-fx.size/2,-fx.size/2,fx.size,fx.size);else ctx.drawImage(atlas,frame*fw,row*fh,fw,fh,-fx.size/2,-fx.size/2,fx.size,fx.size);ctx.restore();
      if(fx.key==='zeus'){ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.7*Math.sin(progress*Math.PI);const width=ctx.canvas.width;for(let i=0;i<3;i++)ctx.drawImage(atlas,Math.min(frame,2)*fw,4*fh,fw,fh,i*width/3-width/8,-100,width*.6,width*.4);ctx.restore();}
    }ctx.restore();
  }
  function icon(key,x,y,size){const index=ICON_KEYS.indexOf(key);if(index<0||!icons.naturalWidth)return false;const cw=icons.naturalWidth/4,ch=icons.naturalHeight/4;ctx.drawImage(icons,index%4*cw,Math.floor(index/4)*ch,cw,ch,x,y,size,size);return true}
  function elite(e,p){
    const role=ESCORT_ROLES[e.type];if(!role||!escorts.naturalWidth)return false;
    // Reject the overlong spear/arrow release cells in the generated source.
    // Clean key poses + directional thrust/shot VFX avoid neighbor-cell fragments.
    const stage=e.escortTell>0?1:e.attackPose>.15?2:e.attackPose>0?3:0;
    const safeFrames=[[0,1,1,0],[0,1,1,0],[0,0,2,3],[0,0,3,0]];
    const cw=escorts.naturalWidth/4,ch=escorts.naturalHeight/4,frame=safeFrames[role.row][stage],size=e.r*4.9;
    ctx.save();ctx.translate(p.x+(stage===2?Math.cos(e.facing)*4:0),p.y-Math.abs(Math.sin(e.walkPhase||0))*1.8);ctx.scale(Math.cos(e.facing)<0?-1:1,1);ctx.drawImage(escorts,frame*cw,role.row*ch,cw,ch,-size/2,-size*.72,size,size);ctx.restore();
    ctx.fillStyle='#080e15';ctx.fillRect(p.x-32,p.y-size*.66,64,5);ctx.fillStyle=role.color;ctx.fillRect(p.x-32,p.y-size*.66,64*Math.max(0,e.hp/e.maxHp),5);ctx.font='bold 10px "Malgun Gothic", sans-serif';ctx.textAlign='center';ctx.fillText(role.name,p.x,p.y-size*.66-5);return true;
  }
  function parryHero(p,screen,hero,status){
    if(status.mode!=='parry'||!defense.naturalWidth)return false;
    // The generated atlas has non-uniform row padding. Measured source rectangles
    // keep the archer's bow above the nominal third-row boundary intact.
    const cw=defense.naturalWidth/3,row={hoplite:0,swordsman:1,archer:2}[hero],bounds=[[0,410],[410,808],[808,1254]][row],scale=defense.naturalHeight/1254,sy=bounds[0]*scale,ch=(bounds[1]-bounds[0])*scale;
    const frame=status.phase==='startup'?0:status.phase==='active'?1:2;
    const size=106,width=size*cw/ch;ctx.save();ctx.translate(screen.x,screen.y);ctx.scale(Math.cos(p.aim)<0?-1:1,1);ctx.drawImage(defense,frame*cw,sy,cw,ch,-width/2,-size*.72,width,size);ctx.restore();return true;
  }
  function tells(e){
    const s=e.encounter,p=w2s(e.x,e.y);
    if(e.boss&&e.counterOpen>0){ctx.save();ctx.font='bold 19px "Malgun Gothic", sans-serif';ctx.textAlign='center';ctx.strokeStyle='#071018';ctx.lineWidth=4;ctx.strokeText('반격 ×1.5',p.x,p.y-e.r*3.3);ctx.fillStyle='#afffe0';ctx.fillText('반격 ×1.5',p.x,p.y-e.r*3.3);ctx.restore();}
    const shotTell=(s?.stage==='windup'&&['shot','burst','fan'].includes(s.pattern?.kind))||e.basicShotTell?.left>0||(e.escortTell>0&&ESCORT_ROLES[e.type]?.kind==='fan');
    if(shotTell){ctx.save();ctx.fillStyle='#f1d39b';ctx.font='bold 18px "Malgun Gothic", sans-serif';ctx.textAlign='center';ctx.fillText('!',p.x,p.y-e.r*3.2);ctx.restore();return;}
    let angle,progress,tag,range=320;
    if(s?.stage==='windup'){angle=s.angle;progress=1-s.left/(s.tellDuration||s.pattern.tell);tag=s.pattern.tag;range=s.pattern.range||s.pattern.speed&&s.pattern.speed*s.pattern.active||360;
      if(['slam','marks','sidestep'].includes(s.pattern.kind)){const t=w2s(s.target.x,s.target.y);ctx.save();ctx.strokeStyle='#f07c63';ctx.setLineDash([6,5]);ctx.lineWidth=3;ctx.beginPath();ctx.arc(t.x,t.y,s.pattern.radius||80,0,Math.PI*2);ctx.stroke();ctx.restore()}
    }else if(e.escortTell>0){angle=e.escortAngle;progress=1-e.escortTell/ESCORT_ROLES[e.type].tell;tag=ESCORT_ROLES[e.type].kind==='lunge'?'parryable':ESCORT_ROLES[e.type].kind==='fan'?'reflectable':'dodgeOnly'}
    else if(e.basicShotTell?.left>0){angle=e.basicShotTell.angle;progress=1-e.basicShotTell.left/(e.basicShotTell.duration||.55);tag='reflectable'}else return;
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle||0);ctx.strokeStyle=tag==='dodgeOnly'?'#ef7962':'#7de6d3';ctx.fillStyle=tag==='dodgeOnly'?'rgba(226,93,60,.15)':'rgba(82,204,185,.12)';ctx.lineWidth=2+progress*2;ctx.setLineDash(tag==='dodgeOnly'?[10,7]:[]);ctx.beginPath();ctx.moveTo(10,-10);ctx.lineTo(range,-10);ctx.lineTo(range,10);ctx.lineTo(10,10);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
    ctx.save();ctx.font='bold 14px "Malgun Gothic", sans-serif';ctx.textAlign='center';ctx.fillStyle='#fff1d4';ctx.fillText(tag==='dodgeOnly'?'구르기 / 이탈':'정면 패링 가능',p.x,p.y-76);ctx.restore();
  }
  return {actor:motion.actor,play,pause,effect,update,draw,icon,elite,parryHero,tells,diagnostics:()=>({effects:effects.length,motion:motion.diagnostics()})};
}
