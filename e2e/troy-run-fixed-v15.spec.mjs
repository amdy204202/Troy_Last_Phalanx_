import { test, expect } from '@playwright/test';

async function ready(page) {
  await page.addInitScript(() => localStorage.setItem('troy_last_phalanx_v14_meta', JSON.stringify({ schemaVersion: 15, hero: 'hoplite', difficulty: 'bronze', tutorialDone: true })));
  await page.goto('/?test=1');
  await expect.poll(() => page.evaluate(() => window.__TROY_V15__?.boot?.status)).toBe('ready');
}

test('실제 게임 고정 tick은 30fps와 144fps에서 같은 첫 20 spawn과 RNG 상태를 만든다', async ({ browser }) => {
  const collect = async fps => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await ready(page);
    const result = await page.evaluate(rate => window.__TROY_V15__.testAdvanceFrames({ fps: rate, seconds: 10, reset: true }), fps);
    await context.close();
    return { spawns: result.eventLog.filter(event => event.kind === 'spawn').slice(0, 20), rng: result.gameRngState, ticks: result.simulationTicks };
  };
  expect(await collect(144)).toEqual(await collect(30));
});

test('런타임 사건 로그는 같은 seed에서 종류별 비교 가능한 표본과 고유 ID를 제공한다', async ({ browser }) => {
  const collect = async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await ready(page);
    const result = await page.evaluate(() => { document.querySelector('#dailyToggle').checked = true; window.__TROY_V15__.start(); return window.__TROY_V15__.testCollectEventSample(); });
    await context.close();
    return result;
  };
  const first = await collect();
  const repeated = await collect();
  for (const [kind, count] of Object.entries({ spawn: 50, reward: 20, crit: 20, ai: 20 })) {
    const events = first.filter(event => event.kind === kind).slice(0, count);
    expect(events).toHaveLength(count);
    expect(new Set(events.map(event => event.id)).size).toBe(count);
    expect(events.every(event => event.value && typeof event.value === 'object')).toBe(true);
    expect(repeated.filter(event => event.kind === kind).slice(0, count)).toEqual(events);
  }
});

test('고정 tick 시간 주입은 30/20/10 정책과 결과 DOM·daily 점수를 연결한다', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => { document.querySelector('#dailyToggle').checked = true; window.__TROY_V15__.start(); });
  await page.evaluate(() => window.__TROY_V15__.testAdvanceRun({ mode: 'play', bossAlive: false, seconds: 30 }));
  await page.evaluate(() => window.__TROY_V15__.testAdvanceRun({ mode: 'play', bossAlive: true, seconds: 20 }));
  await page.evaluate(() => window.__TROY_V15__.testAdvanceRun({ mode: 'choice', bossAlive: true, seconds: 10 }));
  const clocks = await page.evaluate(() => window.__TROY_V15__.snapshot());
  expect({ missionTime: clocks.missionTime, combatTime: clocks.combatTime, bossCombatTime: clocks.bossCombatTime }).toEqual({ missionTime: 30, combatTime: 50, bossCombatTime: 20 });
  await page.evaluate(() => window.__TROY_V15__.testDefeatHector());
  const result = await page.evaluate(() => ({ snapshot: window.__TROY_V15__.snapshot(), texts: ['#resultMissionTime', '#resultCombatTime', '#resultBossTime'].map(selector => document.querySelector(selector).textContent) }));
  expect(result.texts).toEqual(['0:30', '0:50', '0:20']);
  expect(result.snapshot.dailyScore).toBe(Math.floor(result.snapshot.combatTime) + result.snapshot.kills * 10 + result.snapshot.bossKills * 500);
});

test('1024x576 선택 패널은 viewport 안에 있고 선택 버튼은 44px 이상이다', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 576 });
  await ready(page);
  await page.evaluate(() => window.__TROY_V15__.start());
  await page.keyboard.press('F8');
  const layout = await page.evaluate(() => {
    const panel = document.querySelector('.choicePanel').getBoundingClientRect();
    return { panel: { top: panel.top, bottom: panel.bottom }, viewportHeight: innerHeight, cardHeights: [...document.querySelectorAll('.choiceCard')].map(card => card.getBoundingClientRect().height) };
  });
  expect(layout.panel.top).toBeGreaterThanOrEqual(0);
  expect(layout.panel.bottom).toBeLessThanOrEqual(layout.viewportHeight);
  expect(Math.min(...layout.cardHeights)).toBeGreaterThanOrEqual(44);
});

for (const transition of [
  { name: '다시 출전', selector: '#restartBtn' },
  { name: '무한 전장 계속', selector: '#endlessBtn' },
]) {
  test(`헥토르 격파 전 예약된 선택은 ${transition.name} 뒤 새 상태를 오염시키지 않는다`, async ({ page }) => {
    await ready(page);
    await page.evaluate(() => window.__TROY_V15__.start());
    await page.evaluate(() => { window.__TROY_V15__.testQueueChoices(2); window.__TROY_V15__.testDefeatHector(); });
    await expect(page.locator('#endOverlay')).toBeVisible();
    await page.locator(transition.selector).click();
    await expect(page.locator('#choiceOverlay')).toBeHidden();
    await page.waitForTimeout(800);
    const state = await page.evaluate(() => ({ snapshot: window.__TROY_V15__.snapshot(), choiceVisible: !document.querySelector('#choiceOverlay').classList.contains('hidden') }));
    expect(state.snapshot.mode).toBe('play');
    expect(state.choiceVisible).toBe(false);
  });
}

test('일반 출전은 새 seed를 받고 daily와 명시 테스트 seed는 반복 가능하다', async ({ page }) => {
  await ready(page);
  const seeds = await page.evaluate(() => {
    const api = window.__TROY_V15__;
    document.querySelector('#dailyToggle').checked = false;
    api.start(); const normalA = api.snapshot().runSeed;
    api.start(); const normalB = api.snapshot().runSeed;
    document.querySelector('#dailyToggle').checked = true;
    api.start(); const dailyA = api.snapshot();
    api.start(); const dailyB = api.snapshot();
    api.testSetRunSeed('audit-explicit-seed');
    document.querySelector('#dailyToggle').checked = false;
    api.start(); const explicit = api.snapshot().runSeed;
    const saved = JSON.parse(localStorage.getItem('troy_last_phalanx_v14_meta')).lastRunSeed;
    return { normalA, normalB, dailyA, dailyB, explicit, saved };
  });
  expect(seeds.normalA).not.toBe(seeds.normalB);
  expect(seeds.dailyA.runSeed).toBe(seeds.dailyB.runSeed);
  expect(seeds.dailyA.runSeed).toBe(seeds.dailyA.dailySeed);
  expect(seeds.explicit).toBe('audit-explicit-seed');
  expect(seeds.saved).toBe(seeds.explicit);
});
