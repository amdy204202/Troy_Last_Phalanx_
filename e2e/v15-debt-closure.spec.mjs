import { test, expect } from '@playwright/test';

const savedMeta = (hero = 'hoplite', quality = 'high') => ({
  schemaVersion: 14,
  hero,
  difficulty: 'bronze',
  tutorialDone: true,
  settings: { quality },
});

async function boot(page, { hero = 'hoplite', quality = 'high', daily = false, utcDate } = {}) {
  await page.addInitScript(({ meta, fixedDate }) => {
    localStorage.setItem('troy_last_phalanx_v14_meta', JSON.stringify(meta));
    if (fixedDate) {
      const NativeDate = Date;
      const fixedTime = NativeDate.parse(`${fixedDate}T12:00:00.000Z`);
      class FixedDate extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [fixedTime])); }
        static now() { return fixedTime; }
      }
      window.Date = FixedDate;
    }
  }, { meta: savedMeta(hero, quality), fixedDate: utcDate });
  await page.goto('/?test=1');
  await expect.poll(() => page.evaluate(() => window.__TROY_V15__?.boot?.status)).toBe('ready');
  if (daily) await page.evaluate(() => { document.querySelector('#dailyToggle').checked = true; });
  await page.evaluate(() => window.__TROY_V15__.start());
}

test('세 영웅의 패링·구르기는 DPR 2 실화면에서도 단일 영웅으로 렌더된다', async ({ browser }) => {
  test.setTimeout(90_000);
  for (const hero of ['hoplite', 'swordsman', 'archer']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await boot(page, { hero });
    expect(await page.evaluate(() => ({ deviceDpr: window.devicePixelRatio, snapshot: window.__TROY_V15__.snapshot() }))).toMatchObject({ deviceDpr: 2, snapshot: { hero, dpr: 1.65, playerRenderEntities: 1, followerEntities: 0 } });
    expect(await page.evaluate(() => window.__TROY_V15__.testStartDefense('parry'))).toMatchObject({ defense: { mode: 'parry' } });
    await page.screenshot({ path: `artifacts/visual/runtime-defense-${hero}-parry-dpr2.png` });
    await page.evaluate(() => window.__TROY_V15__.testResume());
    await expect.poll(() => page.evaluate(() => window.__TROY_V15__.snapshot().defense.mode)).toBe('neutral');
    expect(await page.evaluate(() => window.__TROY_V15__.testStartDefense('dodge'))).toMatchObject({ defense: { mode: 'dodge' } });
    await page.screenshot({ path: `artifacts/visual/runtime-defense-${hero}-dodge-dpr2.png` });
    await context.close();
  }
});

test('세 영웅은 레벨 20에서도 플레이어 하나·추종자 0을 유지한다', async ({ browser }) => {
  test.setTimeout(90_000);
  for (const hero of ['hoplite', 'swordsman', 'archer']) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await boot(page, { hero });
    const levelTwenty = await page.evaluate(async () => {
      for (let level = 1; level < 20; level++) {
        dispatchEvent(new KeyboardEvent('keydown', { code: 'F8' }));
        const readyAt = performance.now() + 270;
        while (performance.now() < readyAt) { /* test-mode choice debounce */ }
        document.querySelector('#choiceCards').firstElementChild.click();
      }
      return window.__TROY_V15__.snapshot();
    });
    expect(levelTwenty).toMatchObject({ hero, level: 20, playerRenderEntities: 1, followerEntities: 0 });
    await context.close();
  }
});

test('헥토르 격파 뒤 승리 화면은 1초 안에 표시된다', async ({ page }) => {
  await boot(page);
  const elapsed = await page.evaluate(async () => {
    const started = performance.now();
    window.__TROY_V15__.testDefeatHector();
    while (document.querySelector('#endOverlay').classList.contains('hidden') && performance.now() - started < 1000) {
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    return performance.now() - started;
  });
  await expect(page.locator('#endOverlay')).toBeVisible();
  expect(elapsed).toBeLessThan(1000);
});

test('세 daily 규칙은 출전 배너와 HUD에 이름·설명을 모두 표시한다', async ({ browser }) => {
  const cases = [
    { date: '2026-01-01', id: 'elitePressure', name: '황금 징조', description: '정예 출현 가중치 +50%' },
    { date: '2026-01-03', id: 'enemyVitality', name: '붉은 달', description: '적 최대 체력 +15%' },
    { date: '2026-01-10', id: 'hostileVelocity', name: '폭풍의 날', description: '적대 투사체 속도 +20%' },
  ];
  for (const dailyCase of cases) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await boot(page, { daily: true, utcDate: dailyCase.date });
    const snapshot = await page.evaluate(() => window.__TROY_V15__.snapshot());
    expect(snapshot.dailyRule).toBe(dailyCase.id);
    await expect(page.locator('#stageName')).toContainText(dailyCase.name);
    await expect(page.locator('#eventSub')).toHaveText(dailyCase.description);
    await context.close();
  }
});

test('종료 화면·snapshot·저장 점수는 같은 세 시간 값을 사용한다', async ({ page }) => {
  await boot(page, { daily: true, utcDate: '2026-01-03' });
  await page.waitForTimeout(1100);
  await page.keyboard.press('b');
  await page.waitForTimeout(1100);
  await page.evaluate(() => window.__TROY_V15__.testDefeatHector());
  const result = await page.evaluate(() => ({
    snapshot: window.__TROY_V15__.snapshot(),
    mission: document.querySelector('#resultMissionTime').textContent,
    combat: document.querySelector('#resultCombatTime').textContent,
    boss: document.querySelector('#resultBossTime').textContent,
    kills: Number(document.querySelector('#resultKills').textContent),
    saved: JSON.parse(localStorage.getItem('troy_last_phalanx_v14_meta')),
  }));
  const format = seconds => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
  expect(result.mission).toBe(format(result.snapshot.missionTime));
  expect(result.combat).toBe(format(result.snapshot.combatTime));
  expect(result.boss).toBe(format(result.snapshot.bossCombatTime));
  expect(result.saved.runTimes).toEqual({
    missionTime: result.snapshot.missionTime,
    combatTime: result.snapshot.combatTime,
    bossCombatTime: result.snapshot.bossCombatTime,
  });
  expect(result.saved.dailyScores['2026-01-03']).toBe(Math.floor(result.snapshot.combatTime) + result.kills * 10 + 500);
});

test('메뉴·플레이·보스·선택·승리는 PC viewport와 DPR 전수에서 핵심 표면이 겹치지 않는다', async ({ browser }) => {
  test.setTimeout(120_000);
  const setups = [
    { width: 1024, height: 576, dpr: 1 }, { width: 1024, height: 576, dpr: 2 },
    { width: 1280, height: 720, dpr: 1 }, { width: 1280, height: 720, dpr: 2 },
    { width: 1920, height: 1080, dpr: 1 }, { width: 1920, height: 1080, dpr: 2 },
  ];
  for (const setup of setups) {
    const context = await browser.newContext({ viewport: { width: setup.width, height: setup.height }, deviceScaleFactor: setup.dpr });
    const page = await context.newPage();
    await page.addInitScript(meta => localStorage.setItem('troy_last_phalanx_v14_meta', JSON.stringify(meta)), savedMeta());
    await page.goto('/?test=1');
    await expect.poll(() => page.evaluate(() => window.__TROY_V15__?.boot?.status)).toBe('ready');
    await expect(page.locator('#menuOverlay')).toBeVisible();
    await page.evaluate(() => window.__TROY_V15__.start());
    const assertCombatLayout = async () => {
      const layout = await page.evaluate(() => {
        const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
        return { viewport: { width: innerWidth, height: innerHeight }, mission: box('.mission'), stats: box('.runstats'), actions: box('#combatActions') };
      });
      for (const box of [layout.mission, layout.stats, layout.actions]) {
        expect(box.left).toBeGreaterThanOrEqual(0); expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(layout.viewport.width); expect(box.bottom).toBeLessThanOrEqual(layout.viewport.height);
      }
      const overlap = Math.max(0, Math.min(layout.mission.right, layout.stats.right) - Math.max(layout.mission.left, layout.stats.left)) * Math.max(0, Math.min(layout.mission.bottom, layout.stats.bottom) - Math.max(layout.mission.top, layout.stats.top));
      expect(overlap).toBe(0);
    };
    await assertCombatLayout();
    await page.keyboard.press('F8');
    await expect(page.locator('#choiceOverlay')).toBeVisible();
    const choicePanel = await page.locator('.choicePanel').boundingBox();
    expect(choicePanel.x).toBeGreaterThanOrEqual(0); expect(choicePanel.y).toBeGreaterThanOrEqual(0);
    expect(choicePanel.x + choicePanel.width).toBeLessThanOrEqual(setup.width); expect(choicePanel.y + choicePanel.height).toBeLessThanOrEqual(setup.height);
    await page.keyboard.press('Digit1');
    await expect(page.locator('#choiceOverlay')).toBeHidden();
    await page.keyboard.press('b');
    await expect(page.locator('#bossWrap')).toBeVisible();
    await assertCombatLayout();
    await page.evaluate(() => window.__TROY_V15__.testDefeatHector());
    await expect(page.locator('#endOverlay')).toBeVisible();
    const panel = await page.locator('.victoryPanel').boundingBox();
    expect(panel.x).toBeGreaterThanOrEqual(0); expect(panel.y).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(setup.width); expect(panel.y + panel.height).toBeLessThanOrEqual(setup.height);
    await context.close();
  }
});
