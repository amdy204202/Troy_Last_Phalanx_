import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import { journeyCuePollingStep } from '../tools/validate-rich-integration-v16.mjs';

const allScenarios=['surface-growth','defense-objective-shop','campaign-completion'];
const scenarios=process.env.TROY_RICH_SCENARIO?[process.env.TROY_RICH_SCENARIO]:allScenarios;
const loadTape=name=>readFileSync(resolve(import.meta.dirname,`../tests/fixtures/v16-rich-journeys/${name}.ndjson`),'utf8').trim().split(/\r?\n/).map(JSON.parse);
const expectedGrowth=new Map([[600,{activeEnemies:19,kills:17,xp:14.74336,need:24,level:3}],[1200,{activeEnemies:37,kills:39,xp:7.38976,need:48,level:5}],[1800,{activeEnemies:44,kills:78,xp:37.656747,need:64,level:6}]]);
const canonical=state=>({activeEnemies:state.enemies,kills:state.kills,xp:Number(state.xp.toFixed(6)),need:state.need,level:state.level});

async function runScenario(browser,name){
  const context=await browser.newContext({reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?test=1');await expect.poll(()=>page.evaluate(()=>window.__TROY_BOOT__?.status)).toBe('ready');
  expect(await page.evaluate(()=>Object.keys(window.__TROY_RICH_TEST__).sort())).toEqual(['advanceFixedTicks','input','seed','snapshot']);
  expect(await page.evaluate(()=>Object.keys(window.__TROY_V15__).filter(key=>/^test/i.test(key)))).toEqual([]);
  const tape=loadTape(name),snap=()=>page.evaluate(()=>window.__TROY_RICH_TEST__.snapshot()),growth=[],checkpoints=[];
  let watcher=false;
  const clickChoice=async()=>{if(!watcher)return false;const card=page.locator('#choiceCards button:visible:enabled').first();if(!await card.count())return false;await page.waitForTimeout(280);await card.click();return true;};
  const compactProbe=advance=>page.evaluate(count=>{if(count>0)window.__TROY_RICH_TEST__.advanceFixedTicks(count);const state=window.__TROY_RICH_TEST__.snapshot();return{fixedTick:state.fixedTick,mode:state.mode,boss:state.boss,defense:state.defense,intents:state.intents,cues:state.cues.slice(-24),journal:state.combatJournal.filter(item=>item.type==='boss-pattern'||['impact','shield-block','obstacle','expired','miss'].includes(item.type)).slice(-64)}},advance);
  const advanceTo=async deadline=>{for(;;){const before=await snap(),current=before.fixedTick??0;if(current>=deadline)return before;if(await clickChoice())continue;const milestone=[...expectedGrowth.keys()].find(tick=>current<tick&&tick<=deadline),count=Math.min(60,(milestone??deadline)-current);const after=await page.evaluate(value=>window.__TROY_RICH_TEST__.advanceFixedTicks(value),count);if(after.fixedTick===current)throw new Error(`${name}: fixed tick stalled at ${current}, mode=${after.mode}`);if(expectedGrowth.has(after.fixedTick))growth.push({tick:after.fixedTick,row:canonical(after),journal:after.eventLog});if(after.mode==='end'&&name!=='campaign-completion')throw new Error(`${name}: production run ended at tick ${after.fixedTick}`);}}
  const tapOnCue=async(row,line)=>{const attempted=new Set(),wanted=row.payload.control==='Space'?'dodged':'reflected',deadline=row.payload.untilTick??row.tick,pollStep=journeyCuePollingStep(row.payload.sourceKind,row.payload.sourceKind==='boss'?36:18);let state=await compactProbe(0);for(;;){if(state.mode==='choice'){await clickChoice();state=await compactProbe(0);continue}const active=new Map(state.intents.map(intent=>[intent.impactId,intent])),ready=state.defense.mode==='neutral',phaseReady=row.payload.sourceKind!=='boss'||state.journal.some(item=>item.type==='boss-pattern'&&item.bossId==='paris'&&item.phase>=2),cue=ready&&phaseReady?state.cues.findLast(item=>{const intent=active.get(item.impactId),lead=(intent?.impactAt??0)-state.fixedTick;return intent&&!attempted.has(item.impactId)&&lead>=7&&lead<=18&&item.defenseTag===row.payload.defenseTag&&item.sourceKind===row.payload.sourceKind&&(row.payload.control==='Space'||item.ownerPresent);}):null;if(cue){attempted.add(cue.impactId);await page.evaluate(control=>window.__TROY_RICH_TEST__.input({type:'press',control}),row.payload.control);await advanceTo(active.get(cue.impactId).impactAt+2);await page.evaluate(control=>window.__TROY_RICH_TEST__.input({type:'release',control}),row.payload.control);state=await compactProbe(0);if(state.journal.some(item=>item.type==='impact'&&item.impactId===cue.impactId&&item.outcome===wanted))return cue;continue}if(state.fixedTick>=deadline){const terminals=state.journal.filter(item=>['impact','shield-block','obstacle','expired','miss'].includes(item.type)).slice(-12),patterns=state.journal.filter(item=>item.type==='boss-pattern'&&item.bossId==='paris').slice(-12);throw new Error(`${name}:${line} natural cue missing successful ${row.payload.sourceKind}/${row.payload.defenseTag}; tick=${state.fixedTick}; boss=${JSON.stringify(state.boss)}; patterns=${JSON.stringify(patterns)}; attempted=${JSON.stringify([...attempted])}; terminals=${JSON.stringify(terminals)}; recent=${JSON.stringify(state.cues.slice(-8))}; active=${JSON.stringify(state.intents.slice(-8))}`)}state=await compactProbe(Math.min(pollStep,deadline-state.fixedTick));}};
  for(let index=0;index<tape.length;index++){
    const row=tape[index];if(row.action!=='INPUT_TAP_ON_CUE')await advanceTo(row.tick);
    if(row.action==='CHECKPOINT'){
      const state=await snap();checkpoints.push(row.payload.id);
      if(row.payload.id==='title-ready'){expect(await page.locator('#menuOverlay').isVisible()).toBe(true);expect(await page.evaluate(seed=>window.__TROY_RICH_TEST__.seed(seed),row.payload.seed)).toBe(true);}
      if(row.payload.id==='pause-frozen')expect(state.mode).toBe('pause');
      if(row.payload.id==='resume-running')expect(state.mode).toBe('play');
      if(row.payload.id.startsWith('growth-'))expect(canonical(state)).toEqual(expectedGrowth.get(Number(row.payload.id.slice(7))));
      if(row.payload.id==='parry-reflect'){const reflected=state.combatJournal.findLast(item=>item.type==='impact'&&item.outcome==='reflected');expect(reflected).toEqual(expect.objectContaining({playerDamage:0,ownerReflected:true}));expect(reflected.ownerHpAfter).toBeLessThan(reflected.ownerHpBefore);}
      if(row.payload.id==='dodge-evade')expect(state.combatJournal).toContainEqual(expect.objectContaining({type:'impact',outcome:'dodged',playerDamage:0}));
      if(row.payload.id==='objective-shore-complete')expect(state.objectiveHistory).toContainEqual(expect.objectContaining({instanceId:'shore-0',status:'rewarded'}));
      if(row.payload.id==='shop-purchase')expect(state.shop).toMatchObject({balance:50,rerollCount:1});
      if(row.payload.id==='shop-closed')expect(state.shop).toBeNull();
      if(row.payload.id==='combat-resumed')expect(state.mode).toBe('play');
      if(row.payload.id==='stage-1-entered')expect(state.campaign.stage.stageIndex).toBe(1);
      if(row.payload.id==='plain-entered')expect(state.campaign.stage.packageId).toBe('plain');
      if(row.payload.id==='city-entered')expect(state.campaign.stage.packageId).toBe('city');
      if(row.payload.id==='bosses-1-through-6'){const patterns=state.combatJournal.filter(item=>item.type==='boss-pattern');expect(new Set(patterns.map(item=>item.bossId)).size).toBeGreaterThanOrEqual(6);expect(new Set(patterns.map(item=>`${item.bossId}:${item.patternId}`)).size).toBeGreaterThanOrEqual(18);}
      if(row.payload.id==='hector-p3-combo')expect(state.combatJournal.filter(item=>item.type==='boss-pattern'&&item.bossId==='hector').some(item=>item.patternId==='last-combo')).toBe(true);
      if(row.payload.id==='victory-result')expect(state.victorySettled).toBe(true);
      if(row.payload.id==='endless-running')expect(state).toMatchObject({mode:'play',victorySettled:true});
      continue;
    }
    if(row.action==='UI_CLICK_ON_VISIBLE'){watcher=true;continue;}
    if(row.action==='UI_CLICK'){if(Number.isInteger(row.payload.slot))await page.locator(`#warShopSlots [data-slot="${row.payload.slot}"]`).click();await page.locator(`#${row.payload.target}`).click();continue;}
    if(row.action==='UI_SELECT'){if(row.payload.target==='heroSelect')await page.locator(`#heroSelect [data-hero="${row.payload.value}"]`).click();else await page.locator(`#${row.payload.target}`).selectOption(row.payload.value);continue;}
    if(row.action==='INPUT_PRESS'||row.action==='INPUT_RELEASE'){await page.evaluate(({type,control})=>window.__TROY_RICH_TEST__.input({type,control}),{type:row.action==='INPUT_PRESS'?'press':'release',control:row.payload.control});continue;}
    if(row.action==='INPUT_TAP_ON_CUE'){await tapOnCue(row,index+1);continue;}
  }
  expect(errors).toEqual([]);const final=await snap();await context.close();return{growth,checkpoints,final};
}

test('independent production profiles cover growth, defense/shop continuity, and campaign completion',async({browser})=>{
  test.setTimeout(180_000);const results=[];for(const scenario of scenarios)results.push(await runScenario(browser,scenario));
  if(scenarios.includes('surface-growth'))expect(results[scenarios.indexOf('surface-growth')].growth.map(item=>item.row)).toEqual([...expectedGrowth.values()]);
  expect(results).toHaveLength(scenarios.length);
});
