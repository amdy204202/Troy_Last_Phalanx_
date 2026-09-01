import { test, expect } from '@playwright/test';

const bootRun = async (page, { quality = 'high', daily = false } = {}) => {
  await page.addInitScript(savedQuality => localStorage.setItem('troy_last_phalanx_v14_meta', JSON.stringify({ schemaVersion: 14, hero: 'hoplite', difficulty: 'bronze', tutorialDone: true, settings: { quality: savedQuality } })), quality);
  await page.goto('/?test=1');
  await expect.poll(() => page.evaluate(() => window.__TROY_V15__?.boot?.status)).toBe('ready');
  if (daily) await page.evaluate(() => { document.querySelector('#dailyToggle').checked = true; });
  await page.evaluate(() => window.__TROY_V15__.start());
};

test('헥토르 승리는 한 번 정산되고 세 갈래 종료 선택과 무한 전장을 제공한다', async ({ page }) => {
  await bootRun(page);
  await page.evaluate(() => window.__TROY_V15__.testDefeatHector());
  await expect(page.locator('#endOverlay')).toBeVisible();
  await expect(page.locator('#endlessBtn')).toHaveText('무한 전장 계속');
  await expect(page.locator('#restartBtn')).toHaveText('다시 출전');
  await expect(page.locator('#endQuitBtn')).toHaveText('평의회로');
  const victory = await page.evaluate(() => window.__TROY_V15__.snapshot());
  expect(victory.victorySettled).toBe(true);
  expect(victory.victoryReward).toBeGreaterThan(0);
  await page.evaluate(() => window.__TROY_V15__.testDefeatHector());
  const duplicateVictory = await page.evaluate(() => window.__TROY_V15__.snapshot());
  expect(duplicateVictory.victoryReward).toBe(victory.victoryReward);
  const preserved = { hp: victory.hp, level: victory.level, weapons: victory.weapons, kills: victory.kills };
  await page.locator('#endlessBtn').click();
  await expect(page.locator('#endOverlay')).toBeHidden();
  const endless = await page.evaluate(() => window.__TROY_V15__.snapshot());
  expect(endless.mode).toBe('play');
  expect({ hp: endless.hp, level: endless.level, weapons: endless.weapons, kills: endless.kills }).toEqual(preserved);
  expect(endless.victoryReward).toBe(victory.victoryReward);
});

test('다시 출전과 평의회 버튼은 서로 다른 종료 경로를 실행한다', async ({ browser }) => {
  const restartContext = await browser.newContext();
  const restartPage = await restartContext.newPage();
  await bootRun(restartPage);
  await restartPage.evaluate(() => window.__TROY_V15__.testDefeatHector());
  await restartPage.locator('#restartBtn').click();
  await expect(restartPage.locator('#endOverlay')).toBeHidden();
  const restarted = await restartPage.evaluate(() => window.__TROY_V15__.snapshot());
  expect(restarted.mode).toBe('play');
  expect(restarted.victorySettled).toBe(false);
  expect(restarted.level).toBe(1);
  expect(restarted.xp).toBe(0);
  await restartContext.close();

  const councilContext = await browser.newContext();
  const councilPage = await councilContext.newPage();
  await bootRun(councilPage);
  await councilPage.evaluate(() => window.__TROY_V15__.testDefeatHector());
  await councilPage.locator('#endQuitBtn').click();
  await expect(councilPage.locator('#menuOverlay')).toBeVisible();
  await expect(councilPage.locator('#hud')).toBeHidden();
  expect((await councilPage.evaluate(() => window.__TROY_V15__.snapshot())).mode).toBe('menu');
  await councilContext.close();
});

test('보급상점은 세 선택과 취소를 표시하고 구매를 원자적으로 한 번만 적용한다', async ({ page }) => {
  await bootRun(page);
  const before = await page.evaluate(() => window.__TROY_V15__.snapshot());
  await page.evaluate(() => window.__TROY_V15__.testOpenSupply(100));
  await expect(page.locator('#supplyOverlay')).toBeVisible();
  await expect(page.locator('.supplyChoice')).toHaveCount(3);
  await expect(page.locator('#supplyCancelBtn')).toHaveText('취소');
  await page.locator('.supplyChoice').first().click();
  const bought = await page.evaluate(() => window.__TROY_V15__.snapshot());
  expect(bought.drachma).toBe(60);
  expect(bought.maxHp).toBe(before.maxHp + 20);
  await page.evaluate(() => window.__TROY_V15__.testOpenSupply(60));
  await page.locator('.supplyChoice').first().click();
  const duplicate = await page.evaluate(() => window.__TROY_V15__.snapshot());
  expect(duplicate.drachma).toBe(60);
  expect(duplicate.maxHp).toBe(bought.maxHp);
});

test('오늘의 전장은 화질과 시각 난수 소비량이 달라도 같은 게임 사건을 만든다', async ({ browser }) => {
  const collect = async quality => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    await bootRun(page, { quality, daily: true });
    await page.waitForTimeout(120);
    const snapshot = await page.evaluate(() => window.__TROY_V15__.snapshot());
    await context.close();
    return snapshot;
  };
  const low = await collect('low');
  const high = await collect('high');
  expect(low.eventLog.slice(0, 12)).toEqual(high.eventLog.slice(0, 12));
  expect(low.gameRngState).toBe(high.gameRngState);
  expect(Object.values(low.dailyMultipliers)).toEqual(expect.arrayContaining([1]));
  expect(Object.values(low.dailyMultipliers).some(value => [1.15, 1.2, 1.5].includes(value))).toBe(true);
});

test('V15은 모바일 전투 DOM 없이 V14 저장을 이전한다', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('troy_last_phalanx_v14_meta', JSON.stringify({ schemaVersion: 14, hero: 'archer', laurels: 37, might: 3, achievements: { first: 1 }, tutorialDone: true })));
  await page.goto('/?test=1');
  await expect.poll(() => page.evaluate(() => window.__TROY_V15__?.boot?.status)).toBe('ready');
  expect(await page.locator('#mobileControls,#stickBase,#stickKnob,#dashBtn,#ultimateBtn').count()).toBe(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('troy_last_phalanx_v14_meta')));
  expect(saved).toMatchObject({ schemaVersion: 15, hero: 'archer', laurels: 37, might: 3, achievements: { first: 1 }, dailyScores: {}, runTimes: { missionTime: 0, combatTime: 0, bossCombatTime: 0 } });
});

test('PC viewport와 DPR 변화에서도 Canvas와 핵심 HUD가 경계 안에 있고 겹치지 않는다', async ({ browser }) => {
  for (const setup of [{ width: 1024, height: 576, dpr: 1 }, { width: 1280, height: 720, dpr: 2 }, { width: 1920, height: 1080, dpr: 1 }]) {
    const context = await browser.newContext({ viewport: { width: setup.width, height: setup.height }, deviceScaleFactor: setup.dpr });
    const page = await context.newPage();
    await bootRun(page);
    const layout = await page.evaluate(() => {
      const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
      return { viewport: { width: innerWidth, height: innerHeight }, canvas: box('#canvas'), mission: box('.mission'), stats: box('.runstats'), actions: box('#combatActions') };
    });
    for (const box of [layout.canvas, layout.mission, layout.stats, layout.actions]) {
      expect(box.left).toBeGreaterThanOrEqual(0);expect(box.top).toBeGreaterThanOrEqual(0);expect(box.right).toBeLessThanOrEqual(layout.viewport.width);expect(box.bottom).toBeLessThanOrEqual(layout.viewport.height);
    }
    const intersects = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    expect(intersects(layout.mission, layout.stats)).toBe(0);
    await context.close();
  }
});
