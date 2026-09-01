import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { serveStatic } from '../tools/validate-v15-frozen.mjs';

let server;
test.beforeAll(() => { server = serveStatic(resolve(import.meta.dirname, '..'), 4177); });
test.afterAll(() => { server.close(); server.closeAllConnections(); server.unref(); });

test('keyboard completes the real objective and six-step safe-shop tutorial while one hero remains active', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('troy_last_phalanx_v14_meta', JSON.stringify({ schemaVersion: 15, hero: 'archer', laurels: 7, settings: { music: .4, sfx: .6 } })));
  await page.goto('http://127.0.0.1:4177/index-v16.html?test=1');
  await expect.poll(() => page.evaluate(() => !!window.__TROY_V16_CAMPAIGN_TEST__)).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('troy_save_v16')))).toMatchObject({ schemaVersion: 16, hero: 'archer', laurels: 7 });
  expect(await page.evaluate(() => localStorage.getItem('troy_save_v15_backup'))).toContain('"schemaVersion":15');
  await expect.poll(() => page.evaluate(() => window.__TROY_V16_TEST__.entitySnapshot())).toEqual({ rosterHeroes: 3, activeHero: 'hoplite', playerRender: 1, hitTarget: 1, followerHero: 0 });
  await page.keyboard.press('KeyF');
  await expect.poll(() => page.evaluate(() => window.__TROY_V16_CAMPAIGN_TEST__.snapshot().tutorial.step)).toBe('enter-shop');
  await page.keyboard.press('KeyE');
  await expect(page.locator('#warShop')).toBeVisible();
  const frozen = await page.evaluate(() => window.__TROY_V16_CAMPAIGN_TEST__.snapshot().campaign);
  await page.waitForTimeout(180);
  expect(await page.evaluate(() => window.__TROY_V16_CAMPAIGN_TEST__.snapshot().campaign)).toEqual(frozen);
  await page.keyboard.press('Digit1');
  await page.keyboard.press('KeyR');
  await page.evaluate(() => window.__TROY_V16_CAMPAIGN_TEST__.selectSlot(1));
  await page.keyboard.press('Delete');
  await page.evaluate(() => window.__TROY_V16_CAMPAIGN_TEST__.selectSlot(0));
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__TROY_V16_CAMPAIGN_TEST__.snapshot().tutorial.step)).toBe('complete');
  const snapshot = await page.evaluate(() => window.__TROY_V16_CAMPAIGN_TEST__.snapshot().shop);
  expect(snapshot.slots).toHaveLength(4);
  expect(snapshot.banishedIds).toHaveLength(1);
});

test('gamepad Y, D-pad+A, X, RB and A drive the same reducer outcomes', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { axes: [0,0], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) };
    Object.defineProperty(window, '__campaignPad', { value: state });
    Object.defineProperty(navigator, 'getGamepads', { value: () => [state] });
  });
  await page.goto('http://127.0.0.1:4177/index-v16.html?test=1');
  await expect.poll(() => page.evaluate(() => !!window.__TROY_V16_CAMPAIGN_TEST__)).toBe(true);
  await page.evaluate(() => window.__TROY_V16_CAMPAIGN_TEST__.progressObjective(999));
  const press = async index => {
    await page.evaluate(i => { window.__campaignPad.buttons[i].pressed = true; }, index);
    await page.waitForTimeout(50);
    await page.evaluate(i => { window.__campaignPad.buttons[i].pressed = false; }, index);
    await page.waitForTimeout(50);
  };
  await press(3); await expect.poll(() => page.evaluate(() => window.__TROY_V16_CAMPAIGN_TEST__.snapshot().tutorial.step)).toBe('lock-slot');
  await press(15); await press(0);
  await press(2); await press(5);
  await press(14); await press(0);
  await expect.poll(() => page.evaluate(() => window.__TROY_V16_CAMPAIGN_TEST__.snapshot().tutorial.step)).toBe('complete');
});
