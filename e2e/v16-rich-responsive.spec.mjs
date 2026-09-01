import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';

const viewports = [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 1024, height: 576 }];
const screenshotRoot = resolve(import.meta.dirname, 'screenshots');
mkdirSync(screenshotRoot, { recursive: true });
const snapshot = page => page.evaluate(() => window.__TROY_RICH_TEST__.snapshot());
const input = (page, type, control) => page.evaluate(value => window.__TROY_RICH_TEST__.input(value), { type, control });
const advance = (page, ticks) => page.evaluate(value => window.__TROY_RICH_TEST__.advanceFixedTicks(value), ticks);

async function startProductionRun(page) {
  await page.goto('/?test=1');
  await expect.poll(() => page.evaluate(() => window.__TROY_BOOT__?.status)).toBe('ready');
  expect(await page.evaluate(() => Object.keys(window.__TROY_RICH_TEST__).sort())).toEqual(['advanceFixedTicks', 'input', 'seed', 'snapshot']);
  await page.evaluate(() => window.__TROY_RICH_TEST__.seed('responsive-v16'));
  await page.click('#prepareBtn');
  await page.click('#heroSelect [data-hero="hoplite"]');
  await page.click('#startBtn');
  return snapshot(page);
}

async function acceptVisibleChoice(page) {
  const card = page.locator('#choiceCards button:visible:enabled').first();
  if (!await card.count()) return false;
  await page.waitForTimeout(280);
  await card.click();
  return true;
}

async function reachFirstChoice(page) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const state = await advance(page, 120);
    if (state.mode === 'choice') return state;
    expect(state.mode).toBe('play');
  }
  throw new Error('choice state was not reached through the production reward path');
}

async function reachWarShop(page, choiceState) {
  await acceptVisibleChoice(page);
  let currentDirection = null;
  let lastState = await snapshot(page);
  for (let attempt = 0; attempt < 70; attempt += 1) {
    if (await acceptVisibleChoice(page)) continue;
    const before = await snapshot(page);
    const nextDirection = 'KeyW';
    if (nextDirection !== currentDirection) {
      if (currentDirection) await input(page, 'release', currentDirection);
      currentDirection = nextDirection;
      await input(page, 'press', currentDirection);
    }
    if (attempt % 2 === 0) await input(page, 'tap', 'Space'); else await input(page, 'tap', 'ShiftLeft');
    const state = await advance(page, 120); lastState = state;
    if (state.mode === 'end') throw new Error(`run ended before war shop at tick ${state.fixedTick}`);
    if (state.objectiveHistory.some(entry => entry.instanceId === 'shore-0' && entry.status === 'rewarded')) {
      if (state.mode === 'choice') await acceptVisibleChoice(page);
      await expect(page.locator('#warShopOpen')).toBeVisible();
      await page.click('#warShopOpen');
      if (currentDirection) await input(page, 'release', currentDirection);
      await expect(page.locator('#warShopOverlay')).toBeVisible();
      return snapshot(page);
    }
  }
  throw new Error(`war shop was not reached after choice ${choiceState.choices[0]?.key ?? 'unknown'} tick=${lastState.fixedTick} mode=${lastState.mode} hp=${lastState.hp} objective=${lastState.objective.progress}/${lastState.objective.maxProgress} boss=${lastState.boss?.type ?? 'none'}`);
}

async function reachActiveBossPattern(page) {
  await page.click('#warShopClose');
  let currentDirection = null, lastState = await snapshot(page);
  expect(lastState.mode).toBe('play');
  await expect(page.locator('#warShopOverlay')).toBeHidden();
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await page.locator('#warShopOverlay:visible').count()) { await page.click('#warShopClose'); continue; }
    if (await acceptVisibleChoice(page)) continue;
    const before = await snapshot(page);
    const nextDirection = ['KeyW', 'KeyD', 'KeyS', 'KeyA'][Math.floor(before.fixedTick / 240) % 4];
    if (nextDirection !== currentDirection) {
      if (currentDirection) await input(page, 'release', currentDirection);
      currentDirection = nextDirection;
      await input(page, 'press', currentDirection);
    }
    if (attempt % 2 === 0) await input(page, 'tap', 'Space');
    const state = await advance(page, 120); lastState = state;
    if (state.mode === 'warShop') continue;
    const pattern = state.combatJournal.findLast(entry => entry.type === 'boss-pattern');
    if (state.boss && pattern) {
      if (currentDirection) await input(page, 'release', currentDirection);
      return { state, pattern };
    }
    if (state.mode === 'end') throw new Error(`run ended before active boss pattern at tick ${state.fixedTick}`);
  }
  throw new Error(`active boss pattern was not reached through the production scheduler tick=${lastState.fixedTick} mode=${lastState.mode} hp=${lastState.hp} boss=${lastState.boss?.type ?? 'none'}`);
}

async function assertFocusOrder(page, rootSelector) {
  const expected = await page.evaluate(root => [...document.querySelector(root).querySelectorAll('button:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(node => node.offsetParent).map((node, index) => node.id || node.dataset.slot || `${node.tagName.toLowerCase()}-${index}`), rootSelector);
  expect(expected.length).toBeGreaterThan(0);
  const observed = [];
  for (let probe = 0; probe < 80 && observed.length < expected.length; probe += 1) {
    await page.keyboard.press('Tab');
    const active = await page.evaluate(root => { const nodes = [...document.querySelector(root).querySelectorAll('button:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(node => node.offsetParent); const index = nodes.indexOf(document.activeElement); return index < 0 ? '' : document.activeElement.id || document.activeElement.dataset.slot || `${document.activeElement.tagName.toLowerCase()}-${index}`; }, rootSelector);
    if (active && !observed.includes(active)) observed.push(active);
  }
  expect(observed).toHaveLength(expected.length);
  const start = expected.indexOf(observed[0]);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(observed).toEqual(expected.map((_, index) => expected[(start + index) % expected.length]));
}

async function measureState(page, { name, stateId, eventId, visibleOverlay, criticalSelectors, focusRoot }) {
  expect(stateId).toBeTruthy(); expect(eventId).toBeTruthy();
  const overlays = await page.evaluate(() => Object.fromEntries(['choiceOverlay', 'warShopOverlay', 'pauseOverlay', 'endOverlay'].map(id => [id, !!document.querySelector(`#${id}`)?.offsetParent])));
  expect(overlays).toEqual({ choiceOverlay: visibleOverlay === 'choiceOverlay', warShopOverlay: visibleOverlay === 'warShopOverlay', pauseOverlay: false, endOverlay: false });
  const layout = await page.evaluate(selectors => {
    const boxes = selectors.map(selector => document.querySelector(selector)?.getBoundingClientRect()).filter(box => box && box.width && box.height);
    const overlapPairs = [];
    for (let a = 0; a < boxes.length; a += 1) for (let b = a + 1; b < boxes.length; b += 1) {
      const width = Math.max(0, Math.min(boxes[a].right, boxes[b].right) - Math.max(boxes[a].left, boxes[b].left));
      const height = Math.max(0, Math.min(boxes[a].bottom, boxes[b].bottom) - Math.max(boxes[a].top, boxes[b].top));
      if (width * height > 0) overlapPairs.push(`${selectors[a]}×${selectors[b]}`);
    }
    const actions = [...document.querySelectorAll('button:not([disabled]),select:not([disabled])')].filter(node => node.offsetParent && getComputedStyle(node).pointerEvents !== 'none').map(node => node.getBoundingClientRect());
    return { overlapPairs, overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight, undersized: actions.filter(box => box.width < 44 || box.height < 44).length };
  }, criticalSelectors);
  expect(layout, `${name}:${stateId}:${eventId}`).toEqual({ overlapPairs: [], overflow: false, undersized: 0 });
  await assertFocusOrder(page, focusRoot);
  if ((name === 'play' || name === 'boss') && await page.locator('#resumeBtn:visible').count()) await page.click('#resumeBtn');
  expect((await page.locator('#hpText').textContent())?.trim()).toMatch(/\d/);
  expect((await page.locator('#xpText').textContent())?.trim()).toMatch(/\d/);
  expect((await page.locator('#objective').textContent())?.trim().length).toBeGreaterThan(0);
  expect((await page.locator('#parryHudText').textContent())?.trim().length).toBeGreaterThan(0);
  expect((await page.locator('#dashHudText').textContent())?.trim().length).toBeGreaterThan(0);
}

test('rich production reducer reaches play, choice, war shop, and active boss at three responsive viewports', async ({ browser }) => {
  test.setTimeout(180_000);
  const source = readFileSync(new URL(import.meta.url), 'utf8');
  expect(source).not.toMatch(/document\.[^\n]{0,80}(?:classList|\.style\b)/);
  expect(source).not.toMatch(/__TROY[^\n]{0,80}\.(?:setState|setMode|setBoss|setShop|setChoice)/);
  let captures = 0;
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const play = await startProductionRun(page);
    const playEvent = play.eventLog.find(event => event.id === 'spawn-0001');
    expect(play).toMatchObject({ mode: 'play', fixedTick: 0, boss: null, shop: null });
    expect(playEvent?.value?.boss).toBe(false);
    await measureState(page, { name: 'play', stateId: `play:${play.objective.instanceId}`, eventId: playEvent.id, visibleOverlay: null, criticalSelectors: ['.vitals', '.mission', '.runstats', '#combatActions', '#buildPanel'], focusRoot: '#hud' });
    await page.screenshot({ path: resolve(screenshotRoot, `v16-rich-${viewport.width}x${viewport.height}-play.png`) }); captures += 1;

    const choice = await reachFirstChoice(page);
    const choiceEvent = choice.eventLog.findLast(event => event.kind === 'reward');
    expect(choice).toMatchObject({ mode: 'choice', boss: null, shop: null }); expect(choice.choices.length).toBeGreaterThan(0);
    await measureState(page, { name: 'choice', stateId: `choice:${choice.choices[0].key}`, eventId: choiceEvent.id, visibleOverlay: 'choiceOverlay', criticalSelectors: ['.choiceHead', '#choiceCards', '.choiceTools'], focusRoot: '#choiceOverlay' });
    expect((await page.locator('#choiceTitle').textContent())?.trim().length).toBeGreaterThan(0);
    await page.screenshot({ path: resolve(screenshotRoot, `v16-rich-${viewport.width}x${viewport.height}-choice.png`) }); captures += 1;

    const shop = await reachWarShop(page, choice);
    const objectiveEvent = shop.objectiveHistory.find(entry => entry.instanceId === 'shore-0');
    expect(shop).toMatchObject({ mode: 'warShop', boss: null }); expect(shop.shop?.token).toBe(objectiveEvent.token);
    await measureState(page, { name: 'shop', stateId: `warShop:${shop.shop.token}`, eventId: objectiveEvent.token, visibleOverlay: 'warShopOverlay', criticalSelectors: ['#warShopSlots', '#warShopOverlay .dialogActions'], focusRoot: '#warShopOverlay' });
    expect((await page.locator('#warShopOverlay h2').textContent())?.trim()).toBe('전쟁 보급상점');
    await page.screenshot({ path: resolve(screenshotRoot, `v16-rich-${viewport.width}x${viewport.height}-shop.png`) }); captures += 1;

    const boss = await reachActiveBossPattern(page);
    expect(boss.state).toMatchObject({ mode: 'play', boss: { type: boss.pattern.bossId } });
    expect(boss.pattern.instanceId).toMatch(new RegExp(`^${boss.pattern.bossId}:\\d+$`));
    await expect(page.locator('#bossWrap')).toBeVisible();
    await measureState(page, { name: 'boss', stateId: `boss:${boss.pattern.bossId}:${boss.pattern.patternId}`, eventId: boss.pattern.instanceId, visibleOverlay: null, criticalSelectors: ['.vitals', '.mission', '.runstats', '#combatActions', '#buildPanel', '#bossWrap'], focusRoot: '#hud' });
    expect((await page.locator('#bossName').textContent())?.trim().length).toBeGreaterThan(0); expect((await page.locator('#bossPatternText').textContent())?.trim().length).toBeGreaterThan(0);
    await page.screenshot({ path: resolve(screenshotRoot, `v16-rich-${viewport.width}x${viewport.height}-boss.png`) }); captures += 1;
    await context.close();
  }
  expect(captures).toBe(12);
});

test('settings switches the live title and settings UI between Korean and English', async ({ page }) => {
  await page.goto(process.env.TROY_TEST_URL ?? '/?test=1');
  await expect.poll(() => page.evaluate(() => window.__TROY_BOOT__?.status)).toBe('ready');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(page.locator('#prepareBtn')).toHaveText('팔랑크스 출전');

  await page.click('#settingsBtn');
  await page.selectOption('#languageSelect', 'en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#prepareBtn')).toHaveText('DEPLOY THE PHALANX');
  await expect(page.locator('#settingsOverlay h2')).toHaveText('SETTINGS');

  await page.reload();
  await expect.poll(() => page.evaluate(() => window.__TROY_BOOT__?.status)).toBe('ready');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#prepareBtn')).toHaveText('DEPLOY THE PHALANX');
});
