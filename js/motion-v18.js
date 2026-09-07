import{BOSS_ORDER}from'./encounters-v17.js';
const ROWS={raider:0,skirmisher:1,archer:2,shieldman:3,slinger:4,standard:5,bomber:6};
// Color-keying is an explicit runtime import format, done once, never per frame.
function keyed(path){const img=new Image(),out={ready:false};img.onload=()=>{const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0);const data=x.getImageData(0,0,c.width,c.height);for(let i=0;i<data.data.length;i+=4){const r=data.data[i],g=data.data[i+1],b=data.data[i+2],excess=g-Math.max(r,b);if(g>115&&excess>40){data.data[i+3]=Math.round(255*(1-Math.min(1,(excess-40)/65)));data.data[i+1]=Math.min(g,Math.max(r,b)+12);}}x.putImageData(data,0,0);out.image=c;out.ready=true;};img.src=path;return out;}
export function createMotion({ctx,getGame}){
 const bosses=keyed('assets/v18/motion/bosses-key.png'),enemies=keyed('assets/v18/motion/enemies-key.png');
 let metadata=null;fetch('assets/v18/motion/rects.json').then(r=>r.json()).then(data=>metadata=data).catch(()=>{});
 function actor(e,p){const boss=BOSS_ORDER.indexOf(e.type),row=boss>=0?boss:ROWS[e.type],sheet=boss>=0?bosses:enemies;if(row===undefined||!sheet.ready)return false;
  if(!metadata)return false;const image=sheet.image,cw=image.width/4,ch=image.height/7,stage=e.encounter?.stage;
  const walk=(e.walkPhase||0)*.6,attack=stage==='attack'||e.attackPose>.10,ready=stage==='windup'||e.windup>0||e.chargeWindup>0||e.escortTell>0||e.basicShotTell?.left>0;
  let frame=attack?3:ready?2:Math.floor(walk)%2;
  // Archer release cell lost its bow in generation; retain drawn-bow pose, animate recoil.
  if(e.type==='archer'&&frame===3)frame=2;
  const h=e.r*(boss>=0?(e.type==='chariot'?4.4:4.35):4.8),w=h*cw/ch,dir=Math.cos(e.facing||0)<0?-1:1;
  const cell=metadata[boss>=0?'bosses':'enemies'].cells[row*4+frame],scale=h/ch,anchorX=(frame+.5)*cw;
  const phase=walk%1,lift=Math.sin(Math.PI*phase)*1.7,recoil=attack?Math.sin(Math.min(1,(e.attackPose||.25)/.4)*Math.PI)*5:0;
  const windup=stage==='windup'?Math.max(0,1-e.encounter.left/Math.max(.01,e.encounter.pattern.tell)):0;
  const strike=stage==='attack'?Math.sin(Math.min(1,(e.encounter.elapsed||0)/.2)*Math.PI):0;
  const lean=ready?-.055*windup:attack?.09*strike:0;
  ctx.save();ctx.translate(p.x+dir*(recoil+strike*6),p.y-lift-(e.visualLift||0)+windup*2);ctx.scale(dir,1);ctx.rotate(Math.sin(walk*Math.PI)*.013+lean);ctx.globalAlpha=e.hitFlash>0?.7:1;
  ctx.drawImage(image,cell.x,cell.y,cell.w,cell.h,(cell.x-anchorX)*scale,-(cell.foot-3)*scale,cell.w*scale,cell.h*scale);
  ctx.restore();
  if(e.elite&&!e.boss){ctx.save();ctx.fillStyle='#0b1016cc';ctx.fillRect(p.x-25,p.y-h*.78,50,4);ctx.fillStyle=e.fieldChampion?'#c993ef':'#ecc16d';ctx.fillRect(p.x-25,p.y-h*.78,50*Math.max(0,e.hp/e.maxHp),4);ctx.restore();}
  return true;
 }
 return{actor,diagnostics:()=>({bosses:bosses.ready&&!!metadata,enemies:enemies.ready&&!!metadata})};
}
