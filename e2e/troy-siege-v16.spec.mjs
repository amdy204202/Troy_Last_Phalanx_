import { test, expect } from '@playwright/test';

test.describe('Troy V16 siege composition',()=>{
 test.use({viewport:{width:1024,height:576},deviceScaleFactor:1});
 test('loads campaign, siege, HUD and preserves readable defense cues',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('/index-v16.html?test=1');
  await expect.poll(()=>page.evaluate(()=>window.__TROY_V16_BOOT__?.optional)).toEqual({campaign:'registered',siege:'registered',hud:'registered'});
  await expect(page.locator('#siegeHud')).toBeVisible();await expect(page.locator('#bossTelegraphText')).toContainText('패링 가능');await expect(page.locator('#combatHud')).toBeVisible();
  const overlaps=await page.evaluate(()=>{const selectors=['#roster','#combatHud','#campaignLayer .campaign-objective','#siegeHud .siege-actions','#siegeHud .siege-boss','#siegeHud .siege-objective'];const boxes=selectors.map(selector=>document.querySelector(selector)?.getBoundingClientRect()).filter(Boolean);let count=0;for(let a=0;a<boxes.length;a++)for(let b=a+1;b<boxes.length;b++){const x=Math.max(0,Math.min(boxes[a].right,boxes[b].right)-Math.max(boxes[a].left,boxes[b].left)),y=Math.max(0,Math.min(boxes[a].bottom,boxes[b].bottom)-Math.max(boxes[a].top,boxes[b].top));if(x*y>0)count++;}return count;});
  expect(overlaps).toBe(0);expect(errors).toEqual([]);
 });
 test('boss audio failure is non-blocking and fixed ticks continue',async({page})=>{
  await page.route('**/assets/audio/v16/*.wav',route=>route.abort());await page.goto('/index-v16.html?test=1');await expect.poll(()=>page.evaluate(()=>window.__TROY_V16_SIEGE_TEST__?.snapshot().ready)).toBe(true);
  const value=await page.evaluate(async()=>{const runtime=window.__TROY_V16_SIEGE_TEST__;runtime.spawnBoss('hector',{seed:1});runtime.selectPattern(10);runtime.step(200);await new Promise(resolve=>setTimeout(resolve,100));const snapshot=runtime.snapshot();return{tick:snapshot.tick,fallbacks:snapshot.events.filter(e=>e.type==='audio-fallback').length,committed:snapshot.scheduler.filter(e=>e.slot==='boss'&&e.state==='committed').length};});
  expect(value.tick).toBe(200);expect(value.fallbacks).toBeGreaterThan(0);expect(value.committed).toBeLessThanOrEqual(1);
 });
});

test('critical HUD stays distinct across required viewports, DPR and accessibility modes',async({browser})=>{
 for(const deviceScaleFactor of [1,2])for(const viewport of [{width:1024,height:576},{width:1280,height:720},{width:1920,height:1080}]){
  const context=await browser.newContext({viewport,deviceScaleFactor,reducedMotion:'reduce'}),page=await context.newPage();await page.goto('/index-v16.html?test=1');await expect.poll(()=>page.evaluate(()=>window.__TROY_V16_BOOT__?.optional)).toEqual({campaign:'registered',siege:'registered',hud:'registered'});
  const result=await page.evaluate(()=>{document.body.dataset.colorblind='true';const hud=window.__TROY_V16_HUD_TEST__,cues=[];for(const tag of ['parryable','reflectable','dodgeOnly','unavoidable']){hud.setBoss({name:'헥토르',hp:50,tag});cues.push([document.querySelector('#bossTelegraphShape').textContent,document.querySelector('#bossTelegraphText').textContent]);}document.querySelector('#audioMute').click();const selectors=['#roster','#combatHud','#campaignLayer .campaign-objective','#siegeHud .siege-actions','#siegeHud .siege-boss','#siegeHud .siege-objective'],boxes=selectors.map(selector=>document.querySelector(selector).getBoundingClientRect());let overlaps=0;for(let a=0;a<boxes.length;a++)for(let b=a+1;b<boxes.length;b++){const x=Math.max(0,Math.min(boxes[a].right,boxes[b].right)-Math.max(boxes[a].left,boxes[b].left)),y=Math.max(0,Math.min(boxes[a].bottom,boxes[b].bottom)-Math.max(boxes[a].top,boxes[b].top));if(x*y>0)overlaps++;}return{overlaps,cues,muted:document.querySelector('#audioMute').getAttribute('aria-pressed'),hudDisplay:getComputedStyle(document.querySelector('#siegeHud')).display};});
  expect(result.overlaps).toBe(0);expect(result.hudDisplay).not.toBe('none');expect(result.muted).toBe('true');expect(new Set(result.cues.map(cue=>cue[0])).size).toBe(4);for(const cue of result.cues)expect(cue[1]).toContain('헥토르');await context.close();
 }
});
