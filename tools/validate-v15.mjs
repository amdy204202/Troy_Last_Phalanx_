import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const HERO_ALIASES=[['hoplite','telamon'],['swordsman','achileon'],['archer','calchas']];
const ENEMY_KEYS=['raider','skirmisher','archer','shieldman','slinger','standard','bomber','cavalry','axeman','lancer','medic','firearcher','netter','giant','horncaller','ghost','engineer','amazonrider','assassin','eliteCaptain','eliteArcher','eliteDrummer','chariot','paris','sarpedon','aeneas','penthesilea','memnon','hector'];
const OBSTACLE_KEYS=['column','barrier','rock','fire'];

function parseManifest(input,file){
  if(input&&typeof input==='object')return input;
  try{return JSON.parse(input)}catch(error){throw new Error(`${file}: JSON 구문 오류 (${error.message})`)}
}

function gridOf(manifest,file){
  const grid=manifest.grid||{},columns=grid.columns||grid.cols||manifest.columns,rows=grid.rows||manifest.rows;
  if(!Number.isInteger(columns)||columns<1||!Number.isInteger(rows)||rows<1)throw new Error(`${file}: grid columns/rows가 필요합니다.`);
  return{columns,rows};
}

export function validateDefenseManifest(input,file='defense manifest'){
  const manifest=parseManifest(input,file);gridOf(manifest,file);
  for(const aliases of HERO_ALIASES){const hero=aliases.map(key=>manifest.heroes?.[key]).find(Boolean);if(!hero)throw new Error(`${file}: 영웅 ${aliases.join('/')} 누락`);for(const action of ['parry','dodge']){const clip=hero.clips?.[action]||hero[action];if(!clip)throw new Error(`${file}: ${aliases[0]}.${action} clip 누락`);const phases=action==='parry'?['startup','active','success','recovery']:['startup','active','recovery'];for(const phase of phases){const frames=clip.phases?.[phase]?.frames||clip.phases?.[phase];if(!Array.isArray(frames)||frames.length<1)throw new Error(`${file}: ${aliases[0]}.${action}.${phase} frames 누락`)}const all=clip.frames||phases.flatMap(phase=>clip.phases?.[phase]?.frames||clip.phases?.[phase]||[]);if(new Set(all.map(frame=>JSON.stringify(frame))).size<3)throw new Error(`${file}: ${aliases[0]}.${action}은 서로 다른 프레임 3개 이상이 필요합니다.`);const active=clip.hitActiveFrames||clip.activeFrames||clip.phases?.active?.hitActiveFrames;if(!Array.isArray(active)||!active.length)throw new Error(`${file}: ${aliases[0]}.${action} hitActiveFrames 누락`)}}
  return manifest;
}

export function validateAtlasBuffer(buffer,manifestInput,file='atlas.png'){
  const manifest=parseManifest(manifestInput,`${file} manifest`),{columns,rows}=gridOf(manifest,file),png=PNG.sync.read(buffer);
  if(png.width%columns||png.height%rows)throw new Error(`${file}: ${png.width}x${png.height}는 ${columns}x${rows} grid로 나뉘지 않습니다.`);
  const width=png.width/columns,height=png.height/rows,meaningfulCells=manifest.meaningfulCells??manifest.grid?.meaningfulCells??columns*rows;
  if(!Number.isInteger(meaningfulCells)||meaningfulCells<1||meaningfulCells>columns*rows)throw new Error(`${file}: meaningfulCells 범위가 잘못됐습니다.`);
  for(let index=0;index<meaningfulCells;index++){
    const row=Math.floor(index/columns),col=index%columns;
    let nonEmpty=0,edgeOpaque=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const alpha=png.data[((row*height+y)*png.width+col*width+x)*4+3];if(alpha)nonEmpty++;if(alpha&&(x===0||y===0||x===width-1||y===height-1))edgeOpaque++}
    if(!nonEmpty)throw new Error(`${file}: cell(${col},${row})가 비어 있습니다.`);
    if(edgeOpaque)throw new Error(`${file}: cell(${col},${row}) 가장자리에 투명 여백이 없습니다 (${edgeOpaque}px).`);
  }
  return{width:png.width,height:png.height,columns,rows,meaningfulCells};
}

export function validateDefensePixels(buffer,manifestInput,file='defense.png'){
  const manifest=parseManifest(manifestInput,`${file} manifest`),{columns,rows}=gridOf(manifest,file),png=PNG.sync.read(buffer),width=png.width/columns,height=png.height/rows;
  const hashFrame=frame=>{const index=typeof frame==='number'?frame:(frame.index??0),col=typeof frame==='object'&&frame.col!==undefined?frame.col:index%columns,row=typeof frame==='object'&&frame.row!==undefined?frame.row:Math.floor(index/columns);let hash=2166136261;for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let channel=0;channel<4;channel++){hash^=png.data[((row*height+y)*png.width+col*width+x)*4+channel];hash=Math.imul(hash,16777619)}return hash>>>0};
  for(const aliases of HERO_ALIASES){const hero=aliases.map(key=>manifest.heroes?.[key]).find(Boolean);for(const action of ['parry','dodge']){const clip=hero.clips?.[action]||hero[action],phases=action==='parry'?['startup','active','success','recovery']:['startup','active','recovery'],frames=clip.frames||phases.flatMap(phase=>clip.phases?.[phase]?.frames||clip.phases?.[phase]||[]);if(new Set(frames.map(hashFrame)).size<3)throw new Error(`${file}: ${aliases[0]}.${action}에 동일한 픽셀 프레임이 있어 서로 다른 3개 포즈를 충족하지 못합니다.`)}}
  return true;
}

export function validateExternalSpriteBuffer(buffer,file='external.png',minMargin=2){
  const png=PNG.sync.read(buffer);let minX=png.width,minY=png.height,maxX=-1,maxY=-1,nonEmpty=0;
  for(let y=0;y<png.height;y++)for(let x=0;x<png.width;x++)if(png.data[(y*png.width+x)*4+3]){nonEmpty++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y)}
  if(!nonEmpty)throw new Error(`${file}: external sprite가 비어 있습니다.`);
  const margins=[minX,minY,png.width-1-maxX,png.height-1-maxY];if(margins.some(value=>value<minMargin))throw new Error(`${file}: 최소 투명 여백 ${minMargin}px 미달 (${margins.join(',')})`);
  return{width:png.width,height:png.height,margins,nonEmpty};
}

function manifestEntriesForValidation(manifest){return manifest.entries||manifest.sprites||manifest.assets||manifest.mapping||{}}
function entryKeys(manifest){return Object.keys(manifestEntriesForValidation(manifest)).sort()}
function equalKeys(actual,expected,file){const missing=expected.filter(key=>!actual.includes(key)),unused=actual.filter(key=>!expected.includes(key));if(missing.length||unused.length)throw new Error(`${file}: 누락 [${missing.join(', ')}], 미사용 [${unused.join(', ')}]`)}

export function validateProject(projectRoot=root){
  const paths={defense:['assets/animations/troy-defense-atlas-v15.png','assets/animations/troy-defense-atlas-v15.json'],enemies:['assets/sprites/trojan-forces-atlas-v15.png','assets/sprites/trojan-forces-atlas-v15.json'],obstacles:['assets/obstacles/greek-obstacles-atlas-v15.png','assets/obstacles/greek-obstacles-atlas-v15.json']};
  const loaded={};for(const[key,[pngPath,jsonPath]]of Object.entries(paths)){const pngFile=resolve(projectRoot,pngPath),jsonFile=resolve(projectRoot,jsonPath);if(!existsSync(pngFile)||!existsSync(jsonFile))throw new Error(`${key}: V15 PNG/manifest 파일이 없습니다.`);const text=readFileSync(jsonFile,'utf8'),manifest=key==='defense'?validateDefenseManifest(text,jsonPath):parseManifest(text,jsonPath),buffer=readFileSync(pngFile);validateAtlasBuffer(buffer,manifest,pngPath);if(key==='defense')validateDefensePixels(buffer,manifest,pngPath);loaded[key]=manifest}
  equalKeys(entryKeys(loaded.enemies),ENEMY_KEYS,paths.enemies[1]);equalKeys(entryKeys(loaded.obstacles),OBSTACLE_KEYS,paths.obstacles[1]);
  const v15External=[];for(const[key,entry]of Object.entries(manifestEntriesForValidation(loaded.enemies))){const externalFile=resolve(projectRoot,entry.path||'');if(entry.kind==='external'&&!existsSync(externalFile))throw new Error(`${paths.enemies[1]}: ${key} external 경로 없음 (${entry.path})`);if(entry.kind==='external'&&/-v15\.png$/i.test(entry.path||'')){validateExternalSpriteBuffer(readFileSync(externalFile),entry.path,2);v15External.push(entry.path)}if(entry.kind==='atlas'&&(!Number.isInteger(entry.frame)||entry.frame<0||entry.frame>=loaded.enemies.grid.meaningfulCells))throw new Error(`${paths.enemies[1]}: ${key} atlas frame 범위 오류`)}if(v15External.length!==19)throw new Error(`${paths.enemies[1]}: V15 external sprite는 19개여야 합니다 (${v15External.length})`);
  const html=readFileSync(resolve(projectRoot,'index.html'),'utf8'),game=readFileSync(resolve(projectRoot,'js/game-v15.js'),'utf8'),css=readFileSync(resolve(projectRoot,'css/game.css'),'utf8'),sw=readFileSync(resolve(projectRoot,'service-worker.js'),'utf8');
  if(!/<script\s+type="module"\s+src="js\/game-v15\.js/.test(html))throw new Error('index.html: V15 type=module boot 누락');
  if(!game.includes("from './combat-rules-v15.js'"))throw new Error('game-v15.js: combat rules named import 누락');
  if(!game.includes("from './run-rules-v15.js'"))throw new Error('game-v15.js: run rules named import 누락');
  for(const [file,text] of [['index.html',html],['css/game.css',css],['js/game-v15.js',game]])for(const forbidden of ['mobileControls','stickBase','stickKnob','dashBtn','ultimateBtn','dom.mobile','navigator.vibrate','pointerType===\'touch\''])if(text.includes(forbidden))throw new Error(`${file}: PC 전용 표면에 ${forbidden} 잔재가 있습니다.`);
  if(/\bMath\.random\s*\(/.test(game))throw new Error('game-v15.js: gameRng/visualRng 경계 밖 Math.random 사용');
  for(const required of ['game-v15.js','combat-rules-v15.js','run-rules-v15.js','troy-defense-atlas-v15.png','trojan-forces-atlas-v15.png','greek-obstacles-atlas-v15.png'])if(!sw.includes(required))throw new Error(`service-worker.js: ${required} 캐시 누락`);
  for(const external of v15External)if(!sw.includes(external))throw new Error(`service-worker.js: ${external} 캐시 누락`);
  return loaded;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const at=process.argv.indexOf('--root'),projectRoot=at>=0&&process.argv[at+1]?resolve(root,process.argv[at+1]):root;if(projectRoot!==root&&!projectRoot.startsWith(`${root}${sep}`))throw new Error(`V15_ROOT_ESCAPE: path=${projectRoot}`);validateProject(projectRoot);console.log('V15 defense validator: PASS')}catch(error){console.error(`V15 defense validator: FAIL\n${error.message}`);process.exitCode=1}
}
