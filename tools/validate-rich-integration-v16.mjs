import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TECH_SHA = 'acccfb1b396b2cc36a633deff4fe49ad31a822e8b9f20a9031273f5a3996e137';
const ACTIONS = new Set(['CHECKPOINT','UI_CLICK','UI_SELECT','UI_CLICK_ON_VISIBLE','INPUT_PRESS','INPUT_RELEASE','INPUT_TAP_ON_CUE']);
const DIRECTIONS = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
const FORBIDDEN = /telegraphId|impactId|invuln|set(?:Hp|Xp|Stage|Boss|Objective|Shop)|handoff/i;
const JOURNEYS = Object.freeze({
  'surface-growth': Object.freeze({ maxTick:1800, checkpoints:['title-ready','council-ready','codex-ready','settings-ready','loadout-ready','run-started','pause-frozen','resume-running','growth-600','growth-1200','growth-1800'] }),
  'defense-objective-shop': Object.freeze({ maxTick:12000, checkpoints:['title-ready','parry-reflect','dodge-evade','objective-shore-complete','shop-purchase','shop-closed','combat-resumed','stage-1-entered'] }),
  'campaign-completion': Object.freeze({ maxTick:72000, checkpoints:['title-ready','plain-entered','city-entered','bosses-1-through-6','hector-p1','hector-p2','hector-p3-combo','victory-result','endless-running'] }),
});
const V16_SOURCES = Object.freeze([
  'js/attack-intent-v16.js','js/audio-adapter-v16.js','js/audio-director-v16.js','js/battlefield-rules-v16.js','js/boss-fsm-v16.js','js/defense-doctrine-v16.js','js/i18n-v16.js','js/objective-rules-v16.js','js/replay-v16.js','js/rich-integration-v16.js','js/save-migration-v16.js','js/war-shop-rules-v16.js',
  'assets/animations/troy-defense-atlas-v16.json','assets/animations/troy-defense-atlas-v16.png','assets/effects/troy-defense-vfx-v16.json','assets/effects/troy-defense-vfx-v16.png','assets/battlefields/troy-battlefields-v16.json','assets/bosses/troy-boss-fsm-v16.json',
]);

function readJson(root,path){return JSON.parse(readFileSync(resolve(root,path),'utf8'));}
function fail(path,expected,actual){throw new Error(`RICH_INTEGRATION_MISMATCH: ${path} expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);}
function journeyFail(scenario,line,expected,actual){throw new Error(`RICH_JOURNEY_TAPE_MISMATCH: scenario=${scenario} line=${line} expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);}

export function journeyCuePollingStep(sourceKind, minimumTelegraphTicks) {
  const step = sourceKind === 'boss' ? 12 : 3;
  if (!Number.isInteger(minimumTelegraphTicks) || minimumTelegraphTicks <= step) throw new RangeError(`telegraph window must exceed polling step ${step}`);
  return step;
}

export function validateRichJourneyTape(root, overrides = {}) {
  const result={};
  for(const [scenario,contract] of Object.entries(JOURNEYS)){
    const source=overrides[scenario]??readFileSync(resolve(root,`tests/fixtures/v16-rich-journeys/${scenario}.ndjson`),'utf8'),lines=source.trim().split(/\r?\n/),rows=[];
    let previous=-1,choiceWatcher=false;const pressed=new Map(),directionChanges=[];
    for(let index=0;index<lines.length;index++){
      const line=index+1,row=JSON.parse(lines[index]);
      if(JSON.stringify(Object.keys(row).sort())!==JSON.stringify(['action','payload','tick']))journeyFail(scenario,line,['action','payload','tick'],Object.keys(row).sort());
      if(!Number.isInteger(row.tick)||row.tick<previous||row.tick>contract.maxTick)journeyFail(scenario,line,`monotonic 0..${contract.maxTick}`,row.tick);
      if(!ACTIONS.has(row.action)||FORBIDDEN.test(JSON.stringify(row)))journeyFail(scenario,line,'production action without forbidden symbols',row);
      previous=row.tick;rows.push(row);
      if(row.action==='UI_CLICK_ON_VISIBLE')choiceWatcher=true;
      if(row.action==='INPUT_PRESS'&&DIRECTIONS.has(row.payload.control)){if(pressed.has(row.payload.control))journeyFail(scenario,line,'direction not already pressed',row.payload.control);pressed.set(row.payload.control,row.tick);directionChanges.push(row.tick);}
      if(row.action==='INPUT_RELEASE'&&DIRECTIONS.has(row.payload.control)){if(!pressed.has(row.payload.control))journeyFail(scenario,line,'paired direction press',row.payload.control);pressed.delete(row.payload.control);}
      if(row.action==='INPUT_TAP_ON_CUE'&&!['ShiftLeft','ShiftRight','Space'].includes(row.payload.control))journeyFail(scenario,line,'natural Shift/Space cue',row.payload.control);
    }
    if(pressed.size)journeyFail(scenario,lines.length,'all direction keys released',[...pressed.keys()]);
    if(!choiceWatcher)journeyFail(scenario,0,'UI_CLICK_ON_VISIBLE watcher','missing');
    for(let index=1;index<directionChanges.length;index++)if(directionChanges[index]-directionChanges[index-1]>360)journeyFail(scenario,0,'direction change gap <=360',directionChanges[index]-directionChanges[index-1]);
    const checkpoints=rows.filter(row=>row.action==='CHECKPOINT').map(row=>row.payload.id);
    if(JSON.stringify(checkpoints)!==JSON.stringify(contract.checkpoints))journeyFail(scenario,0,contract.checkpoints,checkpoints);
    if(scenario==='defense-objective-shop'){
      const dodgeCue=rows.find(row=>row.action==='INPUT_TAP_ON_CUE'&&row.payload.control==='Space'),dodgeCheckpoint=rows.find(row=>row.action==='CHECKPOINT'&&row.payload.id==='dodge-evade'),objectiveCheckpoint=rows.find(row=>row.action==='CHECKPOINT'&&row.payload.id==='objective-shore-complete');
      const parryCheckpoint=rows.find(row=>row.action==='CHECKPOINT'&&row.payload.id==='parry-reflect');
      if(!dodgeCue||dodgeCue.tick!==parryCheckpoint?.tick||dodgeCue.payload.untilTick!==6500)journeyFail(scenario,0,'dodge watcher starts after parry at tick 4320 with untilTick 6500',dodgeCue??'missing');
      if(!dodgeCheckpoint||dodgeCheckpoint.tick!==dodgeCue.tick+1||dodgeCheckpoint.tick>=9000)journeyFail(scenario,0,'dodge checkpoint immediately after watcher and before objective',dodgeCheckpoint?.tick??'missing');
      if(objectiveCheckpoint?.tick!==9000)journeyFail(scenario,0,'objective checkpoint tick 9000',objectiveCheckpoint?.tick??'missing');
    }
    if(scenario!=='surface-growth'&&!rows.some(row=>row.action==='INPUT_TAP_ON_CUE'))journeyFail(scenario,0,'natural defense cue','missing');
    result[scenario]={rows:rows.length,maxTick:Math.max(...rows.map(row=>row.tick)),checkpoints:checkpoints.length};
  }
  return {profiles:3,scenarios:result};
}

export function buildRichReleaseUrls(root){const frozen=readJson(root,'baselines/v15-frozen.json'),audio=readJson(root,'assets/audio/v16/audio-manifest.json'),paths=new Set(['','v16-release-manifest.json']);for(const entry of frozen.entries)paths.add(entry.path);for(const path of V16_SOURCES)paths.add(path);paths.add('assets/audio/v16/audio-manifest.json');for(const asset of audio.assets)paths.add(asset.path);return[...paths].sort((a,b)=>a.localeCompare(b)).map(path=>path?`./${path}`:'./');}
export function writeRichReleaseManifest(root){const manifest={schemaVersion:1,cacheName:'troy-last-phalanx-v16-rich-2',urls:buildRichReleaseUrls(root)};writeFileSync(resolve(root,'v16-release-manifest.json'),`${JSON.stringify(manifest,null,2)}\n`);return manifest;}
export function validateRichIntegration(root){validateRichJourneyTape(root);const html=readFileSync(resolve(root,'index.html'),'utf8');for(const id of ['menuOverlay','launchStep','prepareBtn','councilBtn','codexBtn','settingsBtn','loadoutStep','heroSelect','startBtn','hud','canvas','warShopOverlay'])if(!new RegExp(`id=["']${id}["']`).test(html))fail(`/index.html/${id}`,'present','missing');if(!/js\/game-v15\.js\?v=16\.0\.0/.test(html)||/js\/game-v16\.js/.test(html))fail('/index.html/runtime','game-v15 rich only','route mutation');const frozen=readJson(root,'baselines/v15-frozen.json');if(frozen.entries.length!==106)fail('/frozen/files',106,frozen.entries.length);const tech=readJson(root,'baselines/v16-tech-lab.json');if(tech.byteLength!==3653||tech.sha256!==TECH_SHA)fail('/tech',{bytes:3653,sha256:TECH_SHA},tech);const runtime=readFileSync(resolve(root,'js/game-v15.js'),'utf8');if(!runtime.includes('createRichPorts(meta.hero)'))fail('/runtime/bridge','central bridge','missing');if(!runtime.includes("const META_KEY = 'troy_save_v16'"))fail('/runtime/save','troy_save_v16','missing');const manifest=readJson(root,'v16-release-manifest.json'),expected=buildRichReleaseUrls(root);if(manifest.cacheName!=='troy-last-phalanx-v16-rich-2')fail('/release/cacheName','troy-last-phalanx-v16-rich-2',manifest.cacheName);if(JSON.stringify(manifest.urls)!==JSON.stringify(expected))fail('/release/urls',expected,manifest.urls);for(const url of expected)if(url!=='./'&&!existsSync(resolve(root,url.slice(2))))fail(`/release/${url}`,'present','missing');return{route:'rich',frozenFiles:106,techBytes:3653,players:1,releaseUrls:expected.length};}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const at=process.argv.indexOf('--root'),root=resolve(at>=0?process.argv[at+1]:'.');try{if(process.argv.includes('--write-release')){const manifest=writeRichReleaseManifest(root);console.log(`V16 rich release: WROTE (urls=${manifest.urls.length}, cache=${manifest.cacheName})`);}const result=validateRichIntegration(root);console.log(`V16 rich integration: PASS (route=${result.route}, frozen=${result.frozenFiles}, techBytes=${result.techBytes}, players=${result.players}, releaseUrls=${result.releaseUrls})`);}catch(error){console.error(error.message);process.exitCode=1;}}
