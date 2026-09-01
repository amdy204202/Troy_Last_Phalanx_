import { test, expect } from '@playwright/test';

const V15_EXTERNAL_ENEMIES=['cavalry','axeman','lancer','medic','firearcher','netter','giant','horncaller','ghost','engineer','amazonrider','assassin'].map(name=>`/assets/sprites/${name}-v15.png`).concat(['chariot','paris','sarpedon','aeneas','penthesilea','memnon','hector'].map(name=>`/assets/bosses/${name==='chariot'?'nessos-chariot':name}-v15.png`));

for(const hero of ['hoplite','swordsman','archer'])test(`${hero}는 단독 렌더 entity로 V15 방어 상태를 실행한다`,async({page})=>{
  const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  await page.addInitScript(selected=>localStorage.setItem('troy_last_phalanx_v14_meta',JSON.stringify({schemaVersion:14,hero:selected,tutorialDone:true,settings:{quality:'high'}})),hero);
  await page.goto('/?test=1');
  await expect.poll(()=>page.evaluate(()=>window.__TROY_V15__?.boot?.status)).toBe('ready');
  await expect.poll(()=>page.evaluate(()=>window.__TROY_V15__.assetReadiness().defense)).toBe(true);
  await page.evaluate(()=>window.__TROY_V15__.start());
  let snapshot=await page.evaluate(()=>window.__TROY_V15__.snapshot());
  expect(snapshot.playerRenderEntities).toBe(1);expect(snapshot.followerEntities).toBe(0);expect(snapshot.hero).toBe(hero);
  await page.keyboard.down('Shift');await page.keyboard.up('Shift');
  snapshot=await page.evaluate(()=>window.__TROY_V15__.snapshot());expect(snapshot.defense.mode).toBe('parry');expect(snapshot.defense.telemetry.parryAttempts).toBe(1);
  await expect.poll(()=>page.evaluate(()=>window.__TROY_V15__.testFreezeDefense('parry','active'))).toMatchObject({hero,action:'parry',phase:'active'});
  await page.screenshot({path:`artifacts/visual/runtime-defense-${hero}-parry.png`});
  if(hero==='hoplite'){const hp=snapshot.hp;snapshot=await page.evaluate(()=>window.__TROY_V15__.testImpact({defenseTag:'parryable',angle:0,damage:25}));expect(snapshot.hp).toBe(hp);expect(snapshot.defense.telemetry.parrySuccesses).toBe(1);expect(snapshot.defense.phase).toBe('success')}
  await page.keyboard.press('Space');
  snapshot=await page.evaluate(()=>window.__TROY_V15__.snapshot());expect(snapshot.defense.telemetry.dodgeAttempts).toBe(0);expect(snapshot.defense.telemetry.rejectedInputs).toBe(1);
  await page.evaluate(()=>window.__TROY_V15__.testResume());
  await expect.poll(()=>page.evaluate(()=>window.__TROY_V15__.snapshot().defense.mode)).toBe('neutral');
  await page.keyboard.press('Space');
  await expect.poll(()=>page.evaluate(()=>window.__TROY_V15__.testFreezeDefense('dodge','active'))).toMatchObject({hero,action:'dodge',phase:'active'});
  await page.screenshot({path:`artifacts/visual/runtime-defense-${hero}-dodge.png`});
  snapshot=await page.evaluate(()=>window.__TROY_V15__.snapshot());expect(snapshot.defense.telemetry.dodgeAttempts).toBe(1);
  await page.evaluate(()=>window.__TROY_V15__.testResume());
  expect(await page.evaluate(()=>window.__TROY_BOOT__.errors)).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('entity audit는 적·투사체·파티클 상한을 각각 보고한다',async({page})=>{
  await page.goto('/?test=1');await expect.poll(()=>page.evaluate(()=>window.__TROY_V15__?.boot?.status)).toBe('ready');await page.evaluate(()=>window.__TROY_V15__.start());
  const failures=await page.evaluate(()=>{window.__TROY_V15__.testSetEntityCounts({enemies:361,projectiles:521,particles:901});return window.__TROY_V15__.audit().failures});
  expect(failures).toEqual(expect.arrayContaining([expect.stringContaining('적 개체'),expect.stringContaining('투사체'),expect.stringContaining('파티클')]));
});

test('미르미돈 인카운터는 추종자 없이 지원 시간과 피해를 기록한다',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('troy_last_phalanx_v14_meta',JSON.stringify({schemaVersion:14,hero:'hoplite',tutorialDone:true,settings:{quality:'high'}})));
  await page.goto('/?test=1');await expect.poll(()=>page.evaluate(()=>window.__TROY_V15__?.boot?.status)).toBe('ready');await page.evaluate(()=>window.__TROY_V15__.start());
  await page.evaluate(()=>window.__TROY_V15__.testStartSupport());
  const snapshot=await page.evaluate(()=>window.__TROY_V15__.snapshot());expect(snapshot.followerEntities).toBe(0);expect(snapshot.defense.supportSeconds).toBeGreaterThan(40);
  await expect.poll(()=>page.evaluate(()=>window.__TROY_V15__.snapshot().defense.telemetry.supportDamage),{timeout:4000}).toBeGreaterThan(0);
});

test('구르기는 위치를 바꾸지만 unavoidable 피해는 받는다',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('troy_last_phalanx_v14_meta',JSON.stringify({schemaVersion:14,hero:'hoplite',tutorialDone:true,settings:{quality:'high'}})));
  await page.goto('/?test=1');await expect.poll(()=>page.evaluate(()=>window.__TROY_V15__?.boot?.status)).toBe('ready');await page.evaluate(()=>window.__TROY_V15__.start());
  const before=await page.evaluate(()=>({snapshot:window.__TROY_V15__.snapshot(),position:window.__TROY_V15__.playerPosition()}));await page.keyboard.press('Space');await page.waitForTimeout(90);const hit=await page.evaluate(()=>window.__TROY_V15__.testImpact({defenseTag:'unavoidable',damage:12}));await page.waitForTimeout(180);const after=await page.evaluate(()=>window.__TROY_V15__.playerPosition());
  expect(hit.hp).toBeLessThan(before.snapshot.hp);expect(Math.hypot(after.x-before.position.x,after.y-before.position.y)).toBeGreaterThan(20);
});

test('실제로 적용된 피해만 defenseDamageTaken에 기록한다',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('troy_last_phalanx_v14_meta',JSON.stringify({schemaVersion:14,hero:'hoplite',tutorialDone:true,settings:{quality:'high'}})));
  await page.goto('/?test=1');await expect.poll(()=>page.evaluate(()=>window.__TROY_V15__?.boot?.status)).toBe('ready');await page.evaluate(()=>window.__TROY_V15__.start());
  const result=await page.evaluate(()=>{window.__TROY_V15__.testSetInvuln(0);const before=window.__TROY_V15__.snapshot(),first=window.__TROY_V15__.testImpact({damage:10}),second=window.__TROY_V15__.testImpact({damage:10});return{before,first,second}});
  expect([result.before.hp,result.first.hp,result.second.hp]).toEqual([125,115,115]);expect(result.first.defense.telemetry.defenseDamageTaken).toBe(10);expect(result.second.defense.telemetry.defenseDamageTaken).toBe(10);
});

test('패링 startup에서 실제 피격되면 실패를 한 번 기록한다',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('troy_last_phalanx_v14_meta',JSON.stringify({schemaVersion:14,hero:'hoplite',tutorialDone:true,settings:{quality:'high'}})));
  await page.goto('/?test=1');await expect.poll(()=>page.evaluate(()=>window.__TROY_V15__?.boot?.status)).toBe('ready');await page.evaluate(()=>window.__TROY_V15__.start());
  await page.evaluate(()=>window.__TROY_V15__.testStartDefense('parry'));
  const snapshot=await page.evaluate(()=>window.__TROY_V15__.testImpact({damage:10}));
  expect(snapshot.defense.telemetry.parryAttempts).toBe(1);expect(snapshot.defense.telemetry.parrySuccesses).toBe(0);expect(snapshot.defense.telemetry.parryFailures).toBe(1);
});

test('pursuit high 위협은 예산을 통과하고 runtime audit가 초과를 검출한다',async({page})=>{
  await page.goto('/?test=1');await expect.poll(()=>page.evaluate(()=>window.__TROY_V15__?.boot?.status)).toBe('ready');await page.evaluate(()=>window.__TROY_V15__.start());
  const budgeted=await page.evaluate(()=>window.__TROY_V15__.testPursuitThreats({count:4}));
  expect(budgeted.highThreats).toBe(2);expect(budgeted.audit.ok).toBe(true);
  const forced=await page.evaluate(()=>window.__TROY_V15__.testPursuitThreats({count:3,forceActive:true}));
  expect(forced.highThreats).toBe(3);expect(forced.audit.ok).toBe(false);expect(forced.audit.failures.join('\n')).toContain('high 위협 예산 초과');
  const priority=await page.evaluate(()=>window.__TROY_V15__.testPursuitThreats({count:3,bossLast:true}));
  expect(priority.highThreats).toBe(2);expect(priority.bossHigh).toBe(1);expect(priority.normalHigh).toBe(1);expect(priority.audit.ok).toBe(true);
  const starved=await page.evaluate(()=>window.__TROY_V15__.testPursuitThreats({count:2,bossLast:true,forceActive:true}));
  expect(starved.bossHigh).toBe(0);expect(starved.normalHigh).toBe(2);expect(starved.audit.ok).toBe(false);expect(starved.audit.failures.join('\n')).toContain('보스 high 예약 위반');
});

test('같은 tick의 서로 다른 투사체 두 발을 각각 반사한다',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('troy_last_phalanx_v14_meta',JSON.stringify({schemaVersion:14,hero:'hoplite',tutorialDone:true,settings:{quality:'high'}})));
  await page.goto('/?test=1');await expect.poll(()=>page.evaluate(()=>window.__TROY_V15__?.boot?.status)).toBe('ready');await page.evaluate(()=>window.__TROY_V15__.start());
  const result=await page.evaluate(()=>window.__TROY_V15__.testReflectProjectilePair());
  expect(result.ids[0]).not.toBe(result.ids[1]);expect(result.friendly).toEqual([true,true]);expect(result.reversed).toEqual([true,true]);expect(result.parrySuccesses).toBe(2);
});

test('테스트 전용 방어 강화와 실제 draw 배율 audit를 제공한다',async({page})=>{
  await page.goto('/?test=1');await expect.poll(()=>page.evaluate(()=>window.__TROY_V15__?.boot?.status)).toBe('ready');await page.evaluate(()=>window.__TROY_V15__.start());
  const config=await page.evaluate(()=>{for(const key of ['parryWindow','counterPower','parryRecovery','dodgeDistance','dodgeRecovery','dodgeExitGuard'])window.__TROY_V15__.testApplyDefenseBuild(key,1);return window.__TROY_V15__.testDefenseConfig()});
  expect(config.defenseBuild).toEqual({parryWindow:1,counterPower:1,parryRecovery:1,dodgeDistance:1,dodgeRecovery:1,dodgeExitGuard:1});expect(config.tuning.parry.activeMs).toBe(215);expect(config.dashBase).toBeCloseTo(4.22,5);
  await expect.poll(()=>page.evaluate(()=>window.__TROY_V15__.renderAudit().filter(entry=>entry.kind==='enemy'||entry.kind==='obstacle'))).not.toEqual([]);
  const audit=await page.evaluate(()=>window.__TROY_V15__.renderAudit());for(const entry of audit){expect(Math.abs(entry.cssWidth-entry.expectedWidth)).toBeLessThanOrEqual(1);expect(Math.abs(entry.cssHeight-entry.expectedHeight)).toBeLessThanOrEqual(1)}
  await page.goto('/');await expect.poll(()=>page.evaluate(()=>window.__TROY_V15__?.boot?.status)).toBe('ready');expect(await page.evaluate(()=>typeof window.__TROY_V15__.testApplyDefenseBuild)).toBe('undefined');expect(await page.evaluate(()=>typeof window.__TROY_V15__.renderAudit)).toBe('undefined');
});

test('V15 service worker는 module graph와 atlas를 캐시하고 오프라인 재부팅한다',async({page,context})=>{
  await page.goto('/?test=1');
  await page.evaluate(async()=>{const registrations=await navigator.serviceWorker.getRegistrations();for(const registration of registrations)await registration.unregister();for(const key of await caches.keys())await caches.delete(key)});
  await page.reload();
  await page.evaluate(()=>navigator.serviceWorker.ready);
  const cached=await page.evaluate(async()=>{const key=(await caches.keys()).find(name=>name.includes('v15'));const cache=await caches.open(key);return(await cache.keys()).map(request=>new URL(request.url).pathname)});
  const fixtureRuntime=cached.filter(path=>/\/js\/game-v\d+\.js$/.test(path));expect(fixtureRuntime).toHaveLength(1);
  for(const path of ['/js/combat-rules-v15.js','/assets/animations/troy-defense-atlas-v15.json','/assets/sprites/trojan-forces-atlas-v15.png','/assets/obstacles/greek-obstacles-atlas-v15.png'])expect(cached).toContain(path);
  for(const path of V15_EXTERNAL_ENEMIES)expect(cached).toContain(path);
  expect(cached).not.toContain('/assets/sprites/trojan-forces-atlas-v14.png');expect(cached).not.toContain('/assets/obstacles/greek-obstacles-atlas-v14.png');
  await context.setOffline(true);await page.reload();await expect.poll(()=>page.evaluate(()=>window.__TROY_V15__?.boot?.status)).toBe('ready');await expect.poll(()=>page.evaluate(()=>window.__TROY_V15__.assetReadiness())).toMatchObject({defense:true,externalEnemiesLoaded:19,externalEnemiesTotal:19});await context.setOffline(false);
});
